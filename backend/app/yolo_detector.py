import cv2
import numpy as np
import logging
import re
import threading
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger("AutoPark.YOLO")

class YOLODetector:
    _easyocr_reader = None
    _init_lock = threading.Lock()

    def __init__(self, confidence_threshold: float = 0.60):
        self.confidence_threshold = confidence_threshold

    @classmethod
    def get_easyocr_reader(cls):
        """Thread-safe lazy singleton loader for EasyOCR reader to guarantee single initialization."""
        if cls._easyocr_reader is None:
            with cls._init_lock:
                if cls._easyocr_reader is None:
                    try:
                        import easyocr
                        logger.info("Initializing EasyOCR Reader (English, CPU/GPU)...")
                        cls._easyocr_reader = easyocr.Reader(['en'], gpu=False)
                        logger.info("✅ EasyOCR Reader successfully initialized.")
                    except Exception as e:
                        logger.error(f"Failed to initialize EasyOCR: {e}")
                        cls._easyocr_reader = None
        return cls._easyocr_reader

    def _determine_dominant_color(self, img_crop: np.ndarray) -> str:
        """Deprecated: Vehicle color is not used for parking actions."""
        return "Car"

    def run_easyocr_on_crop(self, plate_img: np.ndarray) -> Optional[str]:
        """
        Runs dedicated multi-variant preprocessing pipeline and EasyOCR on the cropped license plate.
        Delegates to the shared anpr_pipeline module for optimal accuracy across both cameras.
        """
        if plate_img is None or plate_img.size == 0 or plate_img.shape[0] < 5 or plate_img.shape[1] < 10:
            return None

        reader = self.get_easyocr_reader()
        if reader is None:
            logger.warning("EasyOCR reader not available.")
            return None

        try:
            from app.anpr_pipeline import run_multi_variant_ocr
            candidates, variants = run_multi_variant_ocr(plate_img, reader)
            if candidates:
                top = candidates[0]
                if top["confidence"] >= 0.25:
                    logger.info(f"✅ EasyOCR Text Recognized: '{top['text']}' (Confidence: {top['confidence']:.2f}, Votes: {top.get('votes', 1)})")
                    return top["text"]
            logger.info("EasyOCR: No reliable plate text candidate passed threshold. Returning None.")
            return None
        except Exception as e:
            logger.error(f"EasyOCR recognition error: {e}")
            return None

    def process_image(self, image_bytes: bytes) -> dict:
        """
        Process incoming camera frame.
        Detects vehicle contour (any color). Plate OCR is handled via license-plate YOLO.
        """
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                return {
                    "detected": False,
                    "confidence": 0.0,
                    "vehicle_type": "unknown",
                    "plate_number": None,
                    "bbox": None,
                    "error": "Invalid image payload"
                }

            height, width, _ = img.shape
            total_pixels = height * width

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            blurred = cv2.GaussianBlur(gray, (5, 5), 0)
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            _, sat, _ = cv2.split(hsv)

            edges = cv2.Canny(blurred, 30, 130)
            _, sat_mask = cv2.threshold(sat, 35, 255, cv2.THRESH_BINARY)
            _, thresh_inv = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            _, thresh_norm = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

            masks_to_test = [
                cv2.bitwise_or(edges, sat_mask),
                cv2.bitwise_or(edges, thresh_inv),
                cv2.bitwise_or(edges, thresh_norm),
                edges
            ]

            best_contour = None
            max_area = 0
            kernel = np.ones((5, 5), np.uint8)

            for m in masks_to_test:
                m_clean = cv2.morphologyEx(m, cv2.MORPH_CLOSE, kernel)
                m_clean = cv2.morphologyEx(m_clean, cv2.MORPH_OPEN, kernel)
                contours, _ = cv2.findContours(m_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

                for cnt in contours:
                    area = cv2.contourArea(cnt)
                    if (total_pixels * 0.005) < area < (total_pixels * 0.90) and area > max_area:
                        bx, by, bw, bh = cv2.boundingRect(cnt)
                        ar = float(bw) / float(bh) if bh > 0 else 0
                        if 0.3 <= ar <= 4.5:
                            max_area = area
                            best_contour = cnt

            if best_contour is not None:
                x, y, w, h = cv2.boundingRect(best_contour)
                crop = img[max(0, y):min(height, y + h), max(0, x):min(width, x + w)]
                color_name = self._determine_dominant_color(crop)

                contour_ratio = max_area / (w * h) if (w * h) > 0 else 0.5
                frame_ratio = min(1.0, max_area / (total_pixels * 0.15))
                confidence = round(float(0.82 + (0.16 * contour_ratio * frame_ratio)), 3)
                confidence = min(0.98, max(0.85, confidence))

                return {
                    "detected": True,
                    "confidence": confidence,
                    "vehicle_type": color_name,
                    "color": color_name,
                    "plate_number": None,
                    "bbox": [int(x), int(y), int(x + w), int(y + h)],
                    "plate_bbox": None,
                    "error": None
                }

            return {
                "detected": False,
                "confidence": 0.0,
                "vehicle_type": "none",
                "plate_number": None,
                "bbox": None,
                "error": None
            }

        except Exception as e:
            logger.error(f"Error processing image: {e}")
            return {
                "detected": False,
                "confidence": 0.0,
                "vehicle_type": "unknown",
                "plate_number": None,
                "bbox": None,
                "error": str(e)
            }

detector_engine = YOLODetector()

