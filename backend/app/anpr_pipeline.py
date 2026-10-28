"""
AutoPark - Shared ANPR & OCR Recognition Engine
------------------------------------------------
Provides a unified, high-reliability pipeline for BOTH Entry and Exit cameras:
1. Camera image quality assessment (Laplacian blur metric, brightness, contrast)
2. Multi-variant license plate preprocessing (Bilateral noise reduction, CLAHE, Unsharp Mask, Adaptive Thresholding)
3. Multi-candidate OCR generation and scoring across preprocessing variants
4. Multi-frame burst accumulation and cross-frame candidate voting
5. Controlled database matching:
   - ENTRY: Unambiguous matching against pending pre-check-ins before authorization
   - EXIT: Controlled matching against active sessions and confirmed entry plates (no blind fallbacks!)
6. Real-time recognition debugging (debug captures, diagnostics API, stage-by-stage failure attribution)
"""

import os
import re
import cv2
import time
import json
import logging
import threading
import numpy as np
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple
from collections import deque
from sqlalchemy.orm import Session

from app.models import ParkingSession, PreRegistration, DetectionEvent, ParkingSlot, utcnow, to_utc
from app.config import settings

logger = logging.getLogger("AutoPark.ANPR")

# Directory for debug captures
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEBUG_DIR = os.path.join(BASE_DIR, "debug_captures")
os.makedirs(DEBUG_DIR, exist_ok=True)

# Rotating in-memory diagnostic audit log (last 50 events)
_diagnostics_lock = threading.Lock()
recent_diagnostics: deque = deque(maxlen=50)


def canonicalize_plate(plate: str) -> str:
    """
    Normalizes common OCR character visual ambiguities:
    O <-> 0, I/L/J <-> 1, Z <-> 2, S <-> 5, B <-> 8, G <-> 6, D <-> 0.
    Preserves uppercase alphanumeric characters.
    """
    if not plate:
        return ""
    clean = re.sub(r'[^A-Z0-9]', '', plate.upper().strip())
    trans = str.maketrans({
        'I': '1', 'L': '1', 'J': '1',
        'O': '0', 'Q': '0', 'D': '0',
        'Z': '2',
        'S': '5',
        'B': '8',
        'G': '6'
    })
    return clean.translate(trans)


def levenshtein_distance(s1: str, s2: str) -> int:
    """Computes Levenshtein edit distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    prev = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        curr = [i + 1] * (len(s2) + 1)
        for j, c2 in enumerate(s2):
            insertions = prev[j + 1] + 1
            deletions = curr[j] + 1
            substitutions = prev[j] + (c1 != c2)
            curr[j + 1] = min(insertions, deletions, substitutions)
        prev = curr
    return prev[len(s2)]


def assess_image_quality(img: np.ndarray) -> Dict[str, Any]:
    """
    Evaluates image quality metrics to determine if an issue originates from camera quality.
    - Sharpness: Laplacian variance
    - Brightness: Mean pixel intensity
    - Contrast: Standard deviation of pixel intensity
    """
    if img is None or img.size == 0:
        return {
            "sharpness": 0.0,
            "brightness": 0.0,
            "contrast": 0.0,
            "is_blurry": True,
            "quality_grade": "invalid"
        }

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    mean_val = float(np.mean(gray))
    std_val = float(np.std(gray))

    # Real-world ESP32-CAM QVGA thresholds:
    # lap_var < 20 indicates significant blur/motion
    # mean_val < 35 indicates severely underexposed / dark
    # mean_val > 220 indicates severely washed out / overexposed
    is_blurry = lap_var < 20.0
    quality_grade = "clear"
    if is_blurry:
        quality_grade = "blurry"
    elif mean_val < 35.0 or mean_val > 220.0 or std_val < 20.0:
        quality_grade = "poor_lighting"

    return {
        "sharpness": round(lap_var, 2),
        "brightness": round(mean_val, 2),
        "contrast": round(std_val, 2),
        "is_blurry": is_blurry,
        "quality_grade": quality_grade
    }


def generate_plate_variants(plate_crop: np.ndarray) -> Dict[str, np.ndarray]:
    """
    Generates multiple targeted image preprocessing variants for OCR candidate generation.
    - Upscaling with cubic interpolation to target height ~110-130px
    - Bilateral filter to suppress JPEG compression noise while preserving character edges
    - CLAHE (contrast enhancement)
    - Unsharp mask (edge enhancement)
    - Adaptive Gaussian binarization (regular and inverted)
    - Otsu threshold
    """
    if plate_crop is None or plate_crop.size == 0:
        return {}

    h, w = plate_crop.shape[:2]
    target_h = 110
    scale = target_h / float(max(1, h))
    new_w = max(20, int(w * scale))
    resized = cv2.resize(plate_crop, (new_w, target_h), interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY) if len(resized.shape) == 3 else resized

    # 1. Bilateral filter: smooths compression blockiness without softening text contours
    denoised = cv2.bilateralFilter(gray, 7, 50, 50)

    # 2. CLAHE (Contrast Limited Adaptive Histogram Equalization)
    clahe = cv2.createCLAHE(clipLimit=2.4, tileGridSize=(6, 6))
    clahe_img = clahe.apply(denoised)

    # 3. Sharpen Filter (Unsharp Mask)
    blurred = cv2.GaussianBlur(clahe_img, (0, 0), 2.0)
    sharp_img = cv2.addWeighted(clahe_img, 1.6, blurred, -0.6, 0)

    # 4. Adaptive Gaussian Threshold
    adaptive_thresh = cv2.adaptiveThreshold(
        clahe_img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 5
    )

    # 5. Inverted Adaptive (handles inverted contrast e.g. dark plate with white text)
    adaptive_inv = cv2.bitwise_not(adaptive_thresh)

    # 6. Otsu Threshold
    _, otsu_thresh = cv2.threshold(clahe_img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    return {
        "clahe": clahe_img,
        "sharp": sharp_img,
        "adaptive": adaptive_thresh,
        "adaptive_inv": adaptive_inv,
        "otsu": otsu_thresh,
        "gray": gray
    }


def run_multi_variant_ocr(plate_crop: np.ndarray, reader: Any) -> Tuple[List[Dict[str, Any]], Dict[str, np.ndarray]]:
    """
    Executes EasyOCR on multiple preprocessed variants of the plate crop,
    orders line tokens, calculates confidence, and aggregates candidate readings.
    """
    if plate_crop is None or plate_crop.size == 0 or reader is None:
        return [], {}

    variants = generate_plate_variants(plate_crop)
    raw_candidates: List[Dict[str, Any]] = []

    # Prioritize variants most robust on ESP32-CAM images (adaptive thresholding best preserves digit 4 vs L)
    eval_order = ["adaptive", "adaptive_inv", "otsu", "clahe"]

    for var_name in eval_order:
        var_img = variants.get(var_name)
        if var_img is None:
            continue

        try:
            results = reader.readtext(
                var_img,
                allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
                detail=1,
                paragraph=False
            )
            if not results:
                continue

            # Sort bounding boxes top-to-bottom (y-coordinate) then left-to-right (x-coordinate)
            # This correctly handles multi-line plates (e.g. KA 05 on line 1, KK 0403 on line 2)
            sorted_res = sorted(results, key=lambda item: (item[0][0][1] // 25, item[0][0][0]))

            parts = []
            confidences = []
            for bbox, text, confidence in sorted_res:
                clean_part = re.sub(r'[^A-Z0-9]', '', text.upper().strip())
                if clean_part:
                    parts.append(clean_part)
                    confidences.append(float(confidence))

            full_text = "".join(parts)
            avg_conf = (sum(confidences) / len(confidences)) if confidences else 0.0

            # Filter out short fragments or repeated single-characters (e.g. "1111", "AAAA")
            if len(full_text) >= 3 and len(set(full_text)) > 1:
                raw_candidates.append({
                    "text": full_text,
                    "canonical": canonicalize_plate(full_text),
                    "confidence": round(avg_conf, 3),
                    "variant": var_name
                })

            # Performance short-circuit: If we have evaluated at least 2 variants and already have
            # a high-confidence full plate candidate (>=6 chars, conf >= 0.75), skip remaining variants
            if len(raw_candidates) >= 2:
                top_hits = [c for c in raw_candidates if len(c["text"]) >= 6 and c["confidence"] >= 0.75]
                if len(top_hits) >= 2:
                    break
        except Exception as e:
            logger.warning(f"Error running OCR on variant {var_name}: {e}")

    # Consolidate candidates across variants: count frequency, boost agreement
    consolidated: Dict[str, Dict[str, Any]] = {}
    total_evals = max(1, len(eval_order))

    for cand in raw_candidates:
        key = cand["text"]
        if key not in consolidated:
            consolidated[key] = {
                "text": key,
                "canonical": cand["canonical"],
                "max_conf": cand["confidence"],
                "conf_sum": cand["confidence"],
                "votes": 1,
                "variants": [cand["variant"]]
            }
        else:
            entry = consolidated[key]
            entry["votes"] += 1
            entry["conf_sum"] += cand["confidence"]
            entry["max_conf"] = max(entry["max_conf"], cand["confidence"])
            entry["variants"].append(cand["variant"])

    # Score candidates: composite of max confidence and multi-variant consistency
    scored_candidates = []
    for key, data in consolidated.items():
        vote_ratio = data["votes"] / float(total_evals)
        # Weighted score: 70% confidence + 30% consistency across variants
        composite_conf = (data["max_conf"] * 0.70) + (vote_ratio * 0.30)
        scored_candidates.append({
            "text": data["text"],
            "canonical": data["canonical"],
            "confidence": round(min(0.999, composite_conf), 3),
            "raw_confidence": data["max_conf"],
            "votes": data["votes"],
            "variants": data["variants"]
        })

    # Sort descending by composite confidence
    scored_candidates.sort(key=lambda x: (x["confidence"], x["votes"]), reverse=True)

    return scored_candidates, variants


def save_debug_evidence(
    camera_name: str,
    raw_img: Optional[np.ndarray],
    plate_crop: Optional[np.ndarray],
    processed_img: Optional[np.ndarray],
    event_data: Dict[str, Any]
):
    """
    Saves debug image artifacts to disk and records an event in the recent diagnostics log.
    """
    cam_lower = camera_name.lower()
    ts_str = datetime.now().strftime("%Y%m%d_%H%M%S")

    try:
        if raw_img is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"{cam_lower}_raw.jpg"), raw_img)
        if plate_crop is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"{cam_lower}_plate_crop.jpg"), plate_crop)
        if processed_img is not None:
            cv2.imwrite(os.path.join(DEBUG_DIR, f"{cam_lower}_processed_ocr.jpg"), processed_img)

        # Write latest metadata json
        meta_path = os.path.join(DEBUG_DIR, f"{cam_lower}_latest.json")
        with open(meta_path, "w") as f:
            json.dump(event_data, f, default=str, indent=2)
    except Exception as e:
        logger.warning(f"Failed to save debug artifacts for {camera_name}: {e}")

    # Append to recent diagnostic logs
    with _diagnostics_lock:
        recent_diagnostics.append(event_data)


def get_latest_diagnostics() -> List[Dict[str, Any]]:
    """Returns copy of the recent diagnostics log."""
    with _diagnostics_lock:
        return list(recent_diagnostics)


class FrameBurstAccumulator:
    """
    Collects multiple frames within a short burst window (max 3 frames, 5 seconds lifespan)
    for a camera (ENTRY or EXIT).
    Selects the clearest plate images, extracts multi-variant OCR candidates,
    and merges candidate evidence across frames.
    """
    def __init__(self, camera_name: str, burst_duration_sec: float = 5.0, max_frames: int = 3):
        self.camera_name = camera_name
        self.burst_duration_sec = burst_duration_sec
        self.max_frames = max_frames
        self._lock = threading.Lock()
        self._frames: List[Dict[str, Any]] = []
        self._burst_start_time: Optional[datetime] = None

    def reset(self):
        with self._lock:
            self._frames.clear()
            self._burst_start_time = None

    def add_frame(
        self,
        img: np.ndarray,
        plate_crop: Optional[np.ndarray],
        plate_bbox: Optional[List[int]],
        plate_conf: float,
        ocr_candidates: List[Dict[str, Any]],
        variants: Dict[str, np.ndarray]
    ):
        with self._lock:
            now = datetime.now()
            # If burst has expired (> burst_duration_sec since first frame), reset
            if self._burst_start_time is not None:
                elapsed = (now - self._burst_start_time).total_seconds()
                if elapsed > self.burst_duration_sec:
                    self._frames.clear()
                    self._burst_start_time = now
            else:
                self._burst_start_time = now

            quality = assess_image_quality(img)
            self._frames.append({
                "timestamp": now,
                "img": img,
                "plate_crop": plate_crop,
                "plate_bbox": plate_bbox,
                "plate_conf": plate_conf,
                "ocr_candidates": ocr_candidates,
                "variants": variants,
                "quality": quality
            })

            # Cap at max_frames
            if len(self._frames) > self.max_frames:
                self._frames.pop(0)

    def get_consolidated_reading(self) -> Dict[str, Any]:
        """
        Consolidates plate candidates and evidence across all frames in the current burst.
        Selects the best frame based on plate confidence and sharpness.
        """
        with self._lock:
            if not self._frames:
                return {
                    "has_reading": False,
                    "candidates": [],
                    "best_frame": None,
                    "frame_count": 0
                }

            # Pick best frame: highest plate detection confidence, breaking ties with sharpness
            best_frame_data = max(
                self._frames,
                key=lambda f: (f["plate_conf"], f["quality"]["sharpness"])
            )

            # Consolidate candidate readings across all frames
            candidate_map: Dict[str, Dict[str, Any]] = {}
            for f in self._frames:
                for c in f["ocr_candidates"]:
                    t = c["text"]
                    if t not in candidate_map:
                        candidate_map[t] = {
                            "text": t,
                            "canonical": c["canonical"],
                            "conf_sum": c["confidence"],
                            "max_conf": c["confidence"],
                            "frame_appearances": 1
                        }
                    else:
                        candidate_map[t]["frame_appearances"] += 1
                        candidate_map[t]["conf_sum"] += c["confidence"]
                        candidate_map[t]["max_conf"] = max(candidate_map[t]["max_conf"], c["confidence"])

            merged_candidates = []
            total_frames = len(self._frames)
            for t, data in candidate_map.items():
                frame_ratio = data["frame_appearances"] / float(total_frames)
                boosted_conf = (data["max_conf"] * 0.75) + (frame_ratio * 0.25)
                merged_candidates.append({
                    "text": t,
                    "canonical": data["canonical"],
                    "confidence": round(min(0.999, boosted_conf), 3),
                    "frame_appearances": data["frame_appearances"],
                    "raw_confidence": data["max_conf"]
                })

            merged_candidates.sort(key=lambda x: (x["confidence"], x["frame_appearances"]), reverse=True)

            return {
                "has_reading": len(merged_candidates) > 0,
                "candidates": merged_candidates,
                "best_frame": best_frame_data,
                "frame_count": total_frames
            }


# Controlled Database Candidate Matchers

def evaluate_plate_match(candidate_text: str, target_plate: str) -> float:
    """
    Returns a similarity score between 0.0 and 1.0 between candidate OCR and target plate:
    - 1.0: Exact match
    - 0.92: Canonical ambiguity match (O/0, I/1, Z/2, S/5, B/8, G/6)
    - 0.85: Levenshtein distance 1 on length >= 6
    - 0.75: Levenshtein distance 1 on length 4-5
    - 0.0: No match
    """
    if not candidate_text or not target_plate:
        return 0.0

    s1 = re.sub(r'[^A-Z0-9]', '', candidate_text.upper().strip())
    s2 = re.sub(r'[^A-Z0-9]', '', target_plate.upper().strip())

    if not s1 or not s2:
        return 0.0

    # 1. Exact match
    if s1 == s2:
        return 1.0

    # 2. Canonical visual ambiguity match
    c1 = canonicalize_plate(s1)
    c2 = canonicalize_plate(s2)
    if c1 == c2:
        return 0.92

    # 3. Substring / Prefix match (e.g. 'IND KA01AB1234' or trailing characters)
    if min(len(c1), len(c2)) >= 6:
        if c1 in c2 or c2 in c1:
            return 0.88

    # 4. Levenshtein edit distance
    dist = levenshtein_distance(c1, c2)
    if dist == 1:
        if min(len(c1), len(c2)) >= 6:
            return 0.85
        elif min(len(c1), len(c2)) >= 4:
            return 0.75
    elif dist == 2 and min(len(c1), len(c2)) >= 7:
        return 0.76

    return 0.0


def match_entry_pre_registration(
    candidates: List[Dict[str, Any]],
    db: Session
) -> Dict[str, Any]:
    """
    ENTRY CAMERA Authorization Gatekeeper:
    Compares plausible plate candidates against valid, non-expired PENDING_ARRIVAL bookings.
    Rules:
    - Requires a UNIQUE, sufficiently reliable match.
    - If multiple pending registrations match with high score, mark as AMBIGUOUS (do not authorize).
    - If no registration matches, mark as UNAUTHORIZED.
    - If candidates list is empty or uncertain, indicate uncertain.
    """
    if not candidates:
        return {
            "status": "no_candidates",
            "matched_booking": None,
            "confirmed_plate": None,
            "confidence": 0.0,
            "reason": "No plausible plate candidates extracted from camera frames."
        }

    now = utcnow()
    pending_bookings = db.query(PreRegistration).filter(
        PreRegistration.status == "PENDING_ARRIVAL"
    ).all()

    # Expire outdated bookings
    valid_bookings = []
    for b in pending_bookings:
        if b.expires_at and to_utc(b.expires_at) < now:
            b.status = "EXPIRED"
            db.commit()
        else:
            valid_bookings.append(b)

    if not valid_bookings:
        top_cand = candidates[0]
        return {
            "status": "unauthorized",
            "matched_booking": None,
            "confirmed_plate": top_cand["text"],
            "confidence": top_cand["confidence"],
            "reason": f"No pending pre-check-in found in system for plate [{top_cand['text']}]."
        }

    # Evaluate matches against each valid booking
    booking_scores: List[Tuple[PreRegistration, float, str]] = []

    for booking in valid_bookings:
        target_plate = booking.plate_number
        best_score = 0.0
        best_cand_text = ""
        for cand in candidates:
            score = evaluate_plate_match(cand["text"], target_plate)
            # Factor in candidate OCR confidence
            adjusted_score = score * (0.80 + (0.20 * cand["confidence"]))
            if adjusted_score > best_score:
                best_score = adjusted_score
                best_cand_text = cand["text"]

        if best_score >= 0.72:
            booking_scores.append((booking, best_score, best_cand_text))

    # Sort matches by score descending
    booking_scores.sort(key=lambda x: x[1], reverse=True)

    if not booking_scores:
        top_cand = candidates[0]
        return {
            "status": "unauthorized",
            "matched_booking": None,
            "confirmed_plate": top_cand["text"],
            "confidence": top_cand["confidence"],
            "reason": f"Vehicle [{top_cand['text']}] does not match any valid pending pre-check-in."
        }

    # Check for ambiguity: multiple registrations matching with close scores
    if len(booking_scores) > 1:
        top_booking, top_score, top_text = booking_scores[0]
        runner_up_booking, runner_up_score, runner_up_text = booking_scores[1]
        if abs(top_score - runner_up_score) < 0.10:
            logger.warning(
                f"Ambiguous entry match: booking {top_booking.plate_number} (score {top_score:.2f}) "
                f"vs {runner_up_booking.plate_number} (score {runner_up_score:.2f}). Denying auto-entry."
            )
            return {
                "status": "ambiguous",
                "matched_booking": None,
                "confirmed_plate": top_text,
                "confidence": round(top_score, 3),
                "reason": f"Ambiguous registration match between [{top_booking.plate_number}] and [{runner_up_booking.plate_number}]."
            }

    # Unique reliable match confirmed!
    matched_booking, score, cand_text = booking_scores[0]
    return {
        "status": "authorized",
        "matched_booking": matched_booking,
        "confirmed_plate": matched_booking.plate_number, # Confirmed against authorized registration
        "ocr_reading": cand_text,
        "confidence": round(score, 3),
        "reason": f"Reliably matched pre-registration for [{matched_booking.plate_number}]"
    }


def match_exit_active_session(
    candidates: List[Dict[str, Any]],
    db: Session
) -> Dict[str, Any]:
    """
    EXIT CAMERA Matching:
    Compares candidate readings against active parking sessions and their confirmed entry plates.
    Rules:
    - Never release slots blindly or fall back to oldest session!
    - If match remains ambiguous, return 'ambiguous' (request another capture or admin verification).
    - If no active session matches, return 'no_active_session'.
    - Releases ONLY the slot belonging to the confirmed active session.
    """
    if not candidates:
        return {
            "status": "no_candidates",
            "matched_session": None,
            "confirmed_plate": None,
            "confidence": 0.0,
            "reason": "Exit camera could not extract license plate characters."
        }

    active_sessions = db.query(ParkingSession).filter(ParkingSession.status == "ACTIVE").all()
    if not active_sessions:
        return {
            "status": "no_active_session",
            "matched_session": None,
            "confirmed_plate": candidates[0]["text"] if candidates else None,
            "confidence": 0.0,
            "reason": "No active parking sessions in system."
        }

    session_scores: List[Tuple[ParkingSession, float, str]] = []

    for session in active_sessions:
        target_plate = session.plate_number
        if not target_plate:
            continue

        best_score = 0.0
        best_cand_text = ""
        for cand in candidates:
            score = evaluate_plate_match(cand["text"], target_plate)
            adjusted_score = score * (0.80 + (0.20 * cand["confidence"]))
            if adjusted_score > best_score:
                best_score = adjusted_score
                best_cand_text = cand["text"]

        if best_score >= 0.72:
            session_scores.append((session, best_score, best_cand_text))

    session_scores.sort(key=lambda x: x[1], reverse=True)

    if not session_scores:
        top_cand = candidates[0]
        return {
            "status": "no_active_session",
            "matched_session": None,
            "confirmed_plate": top_cand["text"],
            "confidence": top_cand["confidence"],
            "reason": f"No active parking session found matching exit plate [{top_cand['text']}]."
        }

    # Check for ambiguity: multiple active sessions matching closely
    if len(session_scores) > 1:
        top_session, top_score, top_text = session_scores[0]
        second_session, second_score, second_text = session_scores[1]
        if abs(top_score - second_score) < 0.10:
            logger.warning(
                f"Ambiguous exit match: session {top_session.plate_number} (score {top_score:.2f}) "
                f"vs {second_session.plate_number} (score {second_score:.2f})."
            )
            return {
                "status": "ambiguous",
                "matched_session": None,
                "confirmed_plate": top_text,
                "confidence": round(top_score, 3),
                "reason": f"Ambiguous exit match between active sessions [{top_session.plate_number}] and [{second_session.plate_number}]. Verification required."
            }

    # Confirmed unique active session match
    matched_session, score, cand_text = session_scores[0]
    return {
        "status": "matched",
        "matched_session": matched_session,
        "confirmed_plate": matched_session.plate_number,
        "ocr_reading": cand_text,
        "confidence": round(score, 3),
        "reason": f"Confirmed exit match for active session [{matched_session.plate_number}]"
    }


# Shared burst accumulators for ENTRY and EXIT cameras
entry_accumulator = FrameBurstAccumulator("ENTRY", burst_duration_sec=5.0, max_frames=3)
exit_accumulator = FrameBurstAccumulator("EXIT", burst_duration_sec=5.0, max_frames=3)
