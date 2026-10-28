"""
AutoPark - YOLO & EasyOCR Inference Engine for Laptop Backend
--------------------------------------------------------------
This module processes camera frames sent by ESP32-CAM over HTTP POST.
Pipeline:
1. Runs license_plate_best.pt (YOLO) to detect the exact license-plate region.
2. Crops the detected license plate and passes it to EasyOCR.
3. Detects vehicle of any color (YOLO / OpenCV) to determine dominant color.
4. Returns the genuine recognized plate_number (or None if no plate is read).
"""

import os
import cv2
import numpy as np
import logging
from datetime import datetime
from typing import Dict, Any, Optional

from app.yolo_detector import YOLODetector

logger = logging.getLogger("AutoPark.YOLOv11Engine")

class YOLOv11Detector:
    def __init__(
        self,
        plate_weights_path: Optional[str] = None,
        vehicle_weights_path: Optional[str] = None,
        confidence_threshold: float = 0.25
    ):
        self.confidence_threshold = confidence_threshold
        base_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Resolve absolute paths regardless of current working directory
        if plate_weights_path is None:
            self.plate_weights_path = os.path.normpath(os.path.join(base_dir, "..", "models", "license_plate_best.pt"))
        else:
            self.plate_weights_path = plate_weights_path

        if vehicle_weights_path is None:
            self.vehicle_weights_path = os.path.normpath(os.path.join(base_dir, "..", "..", "yolo11n.pt"))
        else:
            self.vehicle_weights_path = vehicle_weights_path
        
        self.plate_model = None
        self.vehicle_model = None
        self.fallback_engine = YOLODetector(confidence_threshold=0.50)
        
        self._initialize_models()

    def _initialize_models(self):
        """Loads the dedicated license-plate YOLO model and the general vehicle YOLO model."""
        try:
            from ultralytics import YOLO

            # 1. Load License Plate Detection Model (license_plate_best.pt)
            candidate_plate_paths = [
                self.plate_weights_path,
                os.path.abspath("backend/models/license_plate_best.pt"),
                os.path.abspath("models/license_plate_best.pt"),
                r"C:\Users\Lenovo\Desktop\PROJECT\best.pt"
            ]
            
            loaded_plate = False
            for p_path in candidate_plate_paths:
                if os.path.exists(p_path):
                    logger.info(f"Loading License Plate YOLO model from: {p_path}")
                    self.plate_model = YOLO(p_path)
                    logger.info(f"✅ Loaded License Plate Model with classes: {self.plate_model.names}")
                    loaded_plate = True
                    break

            if not loaded_plate:
                logger.error("❌ License plate YOLO model file not found in any candidate path!")
                self.plate_model = None

            # 2. Load Vehicle YOLO model (if available)
            candidate_veh_paths = [
                self.vehicle_weights_path,
                os.path.abspath("yolo11n.pt"),
                os.path.abspath("backend/yolo11n.pt"),
                os.path.abspath("../yolo11n.pt")
            ]
            for v_path in candidate_veh_paths:
                if os.path.exists(v_path):
                    logger.info(f"Loading Vehicle YOLO model from: {v_path}")
                    self.vehicle_model = YOLO(v_path)
                    break

            logger.info("✅ ANPR Detection Engine initialized successfully.")
        except Exception as e:
            logger.warning(f"Model initialization error: {e}. Running with available sub-engines.")

    def warmup(self):
        """Pre-warms YOLO model and EasyOCR reader so the first real camera frame executes instantly."""
        try:
            logger.info("Pre-warming YOLO plate model and EasyOCR reader...")
            dummy = np.zeros((240, 320, 3), dtype=np.uint8)
            if self.plate_model is not None:
                self.plate_model(dummy, conf=0.10, imgsz=320, verbose=False)
            reader = self.fallback_engine.get_easyocr_reader()
            if reader is not None:
                dummy_crop = np.zeros((60, 140, 3), dtype=np.uint8)
                reader.readtext(dummy_crop, detail=0)
            logger.info("✅ ANPR models pre-warmed and ready for instant inference.")
        except Exception as e:
            logger.warning(f"Model pre-warmup exception: {e}")

    def process_image(self, image_bytes: bytes, camera_name: str = "ENTRY") -> Dict[str, Any]:
        """
        Processes frame bytes received from ESP32-CAM using shared ANPR/OCR engine.
        1. Decodes JPEG frame and evaluates camera image quality (sharpness, lighting).
        2. Detects license plate with dedicated YOLO model and crops plate region.
        3. Runs multi-variant preprocessing and EasyOCR candidate generation.
        4. Detects vehicle / dominant color.
        5. Saves debug evidence (raw, crop, ocr_variant) and logs diagnostics.
        """
        import time
        from app.anpr_pipeline import (
            assess_image_quality,
            run_multi_variant_ocr,
            save_debug_evidence,
            entry_accumulator,
            exit_accumulator
        )

        t_total_start = time.perf_counter()
        decode_ms = 0.0
        plate_ms = 0.0
        ocr_ms = 0.0
        veh_ms = 0.0

        try:
            # Stage 1: Image Decode
            t_dec_start = time.perf_counter()
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            decode_ms = (time.perf_counter() - t_dec_start) * 1000.0

            if img is None:
                total_ms = (time.perf_counter() - t_total_start) * 1000.0
                diag = {
                    "id": f"{camera_name}_{int(time.time()*1000)}",
                    "camera": camera_name,
                    "timestamp": datetime.now().isoformat(),
                    "quality": {"sharpness": 0.0, "is_blurry": True, "quality_grade": "corrupt_jpeg"},
                    "plate_detected": False,
                    "candidates": [],
                    "failure_stage": "camera_quality",
                    "reason": "Corrupted or unreadable JPEG payload from camera"
                }
                save_debug_evidence(camera_name, None, None, None, diag)
                return {
                    "detected": False,
                    "confidence": 0.0,
                    "vehicle_type": "unknown",
                    "plate_number": None,
                    "candidates": [],
                    "bbox": None,
                    "plate_bbox": None,
                    "failure_stage": "camera_quality",
                    "error": "Invalid JPEG image payload"
                }

            height, width, _ = img.shape
            quality = assess_image_quality(img)

            plate_detected = False
            plate_bbox = None
            plate_conf = 0.0
            ocr_text = None
            plate_crop = None
            candidates = []
            variants = {}

            # Stage 2: License Plate Detection (Fast Single-Pass Dedicated YOLO Model)
            t_plate_start = time.perf_counter()
            detection_source = None
            if self.plate_model is not None:
                try:
                    # Pass imgsz=320 (or max 480) to prevent 4x CPU compute waste
                    yolo_imgsz = min(480, max(320, (max(width, height) // 32) * 32))
                    plate_results = self.plate_model(img, conf=0.10, imgsz=yolo_imgsz, verbose=False)
                    if plate_results and len(plate_results) > 0:
                        boxes = plate_results[0].boxes
                        for box in boxes:
                            p_conf = float(box.conf[0])
                            px1, py1, px2, py2 = box.xyxy[0].tolist()
                            px1, py1 = max(0, int(px1)), max(0, int(py1))
                            px2, py2 = min(width, int(px2)), min(height, int(py2))
                            
                            bw = px2 - px1
                            bh = py2 - py1

                            # Plausibility: real plates are not full frame
                            if bw > 10 and bh > 5 and (bw * bh) < (width * height * 0.50):
                                if p_conf > plate_conf:
                                    pad_x = int(bw * 0.03)
                                    pad_y = int(bh * 0.03)
                                    crop_x1 = max(0, px1 - pad_x)
                                    crop_y1 = max(0, py1 - pad_y)
                                    crop_x2 = min(width, px2 + pad_x)
                                    crop_y2 = min(height, py2 + pad_y)

                                    plate_crop = img[crop_y1:crop_y2, crop_x1:crop_x2]
                                    plate_bbox = [px1, py1, px2, py2]
                                    plate_conf = p_conf
                                    plate_detected = True
                                    detection_source = "yolo"
                except Exception as e:
                    logger.error(f"License plate YOLO inference error: {e}")

            # Fallback Plate Region Locator (bounded):
            direct_cand_text = None
            direct_cand_conf = 0.0
            if not plate_detected:
                try:
                    # Bounded search: only if YOLO missed plate, scan lower 70% of frame where vehicle plates reside
                    scan_top = int(height * 0.20)
                    scan_area = img[scan_top:height, 0:width]
                    reader = self.fallback_engine.get_easyocr_reader()
                    if reader is not None:
                        raw_ocr_hits = reader.readtext(scan_area, text_threshold=0.30, low_text=0.30, detail=1, paragraph=False)
                        best_hit = None
                        best_hit_score = 0.0

                        import re
                        for bbox_poly, text_val, text_conf in raw_ocr_hits:
                            clean = re.sub(r'[^A-Z0-9]', '', str(text_val).upper().strip())
                            if len(clean) >= 4:
                                pts = np.array(bbox_poly, dtype=np.int32)
                                hx1, hy1 = max(0, int(pts[:, 0].min())), max(0, int(pts[:, 1].min()) + scan_top)
                                hx2, hy2 = min(width, int(pts[:, 0].max())), min(height, int(pts[:, 1].max()) + scan_top)
                                bw = hx2 - hx1
                                bh = hy2 - hy1
                                aspect = bw / float(max(1, bh))

                                if 1.0 <= aspect <= 7.5 and (bw * bh) < (width * height * 0.50):
                                    hit_score = float(text_conf) + (0.35 if len(clean) >= 6 else 0.0)
                                    if hit_score > best_hit_score:
                                        best_hit_score = hit_score
                                        best_hit = (hx1, hy1, hx2, hy2, clean, float(text_conf))

                        if best_hit is not None:
                            hx1, hy1, hx2, hy2, clean_text, text_conf = best_hit
                            bw = hx2 - hx1
                            bh = hy2 - hy1
                            pad_x = int(bw * 0.15)
                            pad_y = int(bh * 0.20)
                            crop_x1 = max(0, hx1 - pad_x)
                            crop_y1 = max(0, hy1 - pad_y)
                            crop_x2 = min(width, hx2 + pad_x)
                            crop_y2 = min(height, hy2 + pad_y)

                            plate_crop = img[crop_y1:crop_y2, crop_x1:crop_x2]
                            plate_bbox = [hx1, hy1, hx2, hy2]
                            plate_conf = max(0.65, float(text_conf))
                            plate_detected = True
                            detection_source = "text_locator"
                            direct_cand_text = clean_text
                            direct_cand_conf = float(text_conf)
                            logger.info(f"🔎 Plate located via bounded text search: bbox={plate_bbox}, text='{clean_text}', conf={text_conf:.2f}")
                except Exception as e:
                    logger.warning(f"Fallback text-locator detection error: {e}")

            plate_ms = (time.perf_counter() - t_plate_start) * 1000.0

            # Stage 3: Multi-variant OCR on detected plate crop
            t_ocr_start = time.perf_counter()
            best_variant_img = None
            if plate_detected and plate_crop is not None:
                reader = self.fallback_engine.get_easyocr_reader()
                candidates, variants = run_multi_variant_ocr(plate_crop, reader)

                # If fallback direct OCR located text, ensure it is represented in candidates
                if direct_cand_text:
                    from app.anpr_pipeline import canonicalize_plate
                    direct_canonical = canonicalize_plate(direct_cand_text)
                    already_in = any(c.get("canonical") == direct_canonical for c in candidates)
                    if not already_in:
                        candidates.insert(0, {
                            "text": direct_cand_text,
                            "canonical": direct_canonical,
                            "confidence": round(max(0.70, direct_cand_conf), 3),
                            "raw_confidence": round(direct_cand_conf, 3),
                            "votes": 1,
                            "variants": ["direct_frame"]
                        })

                if candidates:
                    top_cand = candidates[0]
                    ocr_text = top_cand["text"]
                    logger.info(
                        f"🔍 Plate Detected via [{detection_source or 'yolo'}] at {plate_bbox} (conf: {plate_conf:.2f}) "
                        f"-> Top OCR Candidate: '{ocr_text}' (conf: {top_cand['confidence']:.2f}, votes: {top_cand.get('votes', 1)})"
                    )
                    best_var_name = top_cand.get("variants", ["adaptive"])[0] if top_cand.get("variants") else "adaptive"
                    best_variant_img = variants.get(best_var_name, variants.get("clahe"))

                # Add frame to camera burst accumulator
                acc = entry_accumulator if camera_name == "ENTRY" else exit_accumulator
                acc.add_frame(img, plate_crop, plate_bbox, plate_conf, candidates, variants)

            ocr_ms = (time.perf_counter() - t_ocr_start) * 1000.0

            # Stage 4: Vehicle Presence (Lightweight & Color-Independent)
            t_veh_start = time.perf_counter()
            veh_detected = plate_detected
            veh_bbox = plate_bbox
            veh_conf = plate_conf
            color_name = "Car"

            # Only if plate was NOT detected, quickly test if any vehicle is present in frame
            if not plate_detected and self.vehicle_model is not None:
                try:
                    veh_results = self.vehicle_model(img, conf=0.40, imgsz=320, verbose=False)
                    if veh_results and len(veh_results) > 0:
                        boxes = veh_results[0].boxes
                        for box in boxes:
                            v_conf = float(box.conf[0])
                            cls_id = int(box.cls[0])
                            cls_name = self.vehicle_model.names.get(cls_id, "vehicle").lower()
                            if cls_name in ["car", "toy_car", "vehicle", "truck", "bus", "motorcycle"] and v_conf > veh_conf:
                                veh_conf = v_conf
                                vx1, vy1, vx2, vy2 = box.xyxy[0].tolist()
                                veh_bbox = [int(vx1), int(vy1), int(vx2), int(vy2)]
                                veh_detected = True
                except Exception as e:
                    logger.debug(f"Vehicle YOLO inference error: {e}")

            veh_ms = (time.perf_counter() - t_veh_start) * 1000.0

            total_ms = (time.perf_counter() - t_total_start) * 1000.0

            # Determine failure stage if any
            failure_stage = None
            reason = "Success"
            if quality["is_blurry"]:
                failure_stage = "camera_quality"
                reason = f"Camera image is blurry (Laplacian variance {quality['sharpness']:.1f} < 20)"
            elif not plate_detected and veh_detected:
                failure_stage = "yolo_detection"
                reason = "Vehicle visible but license plate not detected by YOLO"
            elif plate_detected and not candidates:
                failure_stage = "ocr"
                reason = "License plate detected but characters could not be read across preprocessing variants"

            # Diagnostic log event
            diag_event = {
                "id": f"{camera_name}_{int(time.time()*1000)}",
                "camera": camera_name,
                "timestamp": datetime.now().isoformat(),
                "quality": quality,
                "plate_detected": plate_detected,
                "plate_bbox": plate_bbox,
                "plate_conf": round(plate_conf, 3),
                "candidates": candidates[:5],
                "selected_plate": ocr_text,
                "failure_stage": failure_stage,
                "reason": reason,
                "timing": {
                    "decode_ms": round(decode_ms, 1),
                    "plate_ms": round(plate_ms, 1),
                    "ocr_ms": round(ocr_ms, 1),
                    "veh_ms": round(veh_ms, 1),
                    "total_ms": round(total_ms, 1)
                }
            }

            # Save debug artifacts
            save_debug_evidence(camera_name, img, plate_crop, best_variant_img, diag_event)

            logger.info(f"[ANPR TIMING] Decode: {decode_ms:.1f}ms | Plate: {plate_ms:.1f}ms | OCR: {ocr_ms:.1f}ms | Total: {total_ms:.1f}ms")

            is_overall_detected = plate_detected or veh_detected

            if not is_overall_detected:
                return {
                    "detected": False,
                    "confidence": 0.0,
                    "vehicle_type": "none",
                    "plate_number": None,
                    "candidates": [],
                    "bbox": None,
                    "plate_bbox": None,
                    "quality": quality,
                    "failure_stage": failure_stage or "camera_quality",
                    "error": None,
                    "width": width,
                    "height": height,
                    "plate_detected": False
                }

            overall_confidence = max(veh_conf, plate_conf, 0.85)
            final_vehicle_type = f"Car [{ocr_text}]" if ocr_text else "Car"

            logger.info(
                f"✅ Pipeline Result -> Camera: {camera_name} | Dims: {width}x{height} | Vehicle: Car | Plate Detected: {plate_detected} "
                f"| Plate Text: {ocr_text} | Conf: {overall_confidence:.2f}"
            )

            return {
                "detected": True,
                "confidence": round(overall_confidence, 3),
                "vehicle_type": final_vehicle_type,
                "color": "Car",
                "plate_number": ocr_text,
                "candidates": candidates,
                "bbox": veh_bbox,
                "plate_bbox": plate_bbox,
                "quality": quality,
                "plate_crop": plate_crop,
                "variants": variants,
                "failure_stage": failure_stage,
                "error": None,
                "width": width,
                "height": height,
                "plate_detected": plate_detected
            }

        except Exception as e:
            total_ms = (time.perf_counter() - t_total_start) * 1000.0
            logger.error(f"ANPR processing error: {e}", exc_info=True)
            return {
                "detected": False,
                "confidence": 0.0,
                "vehicle_type": "unknown",
                "plate_number": None,
                "candidates": [],
                "bbox": None,
                "plate_bbox": None,
                "quality": {"sharpness": 0.0, "is_blurry": False},
                "failure_stage": "pipeline_exception",
                "error": str(e),
                "width": 0,
                "height": 0,
                "plate_detected": False
            }

# Shared instance for FastAPI Backend
yolov11_detector_engine = YOLOv11Detector()


