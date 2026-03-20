"""
pose_detection.py
Detects 33 body keypoints using the MediaPipe Tasks API.
Supports both regular photos and pencil/ink sketches via preprocessing.

Public API
----------
    preprocess_image(img_bgr)  -> np.ndarray   (sketch → photo-like)
    is_sketch(img_bgr)         -> bool
    detect_keypoints(image_bytes, force_preprocess=False) -> dict

Return shape of detect_keypoints:
    {
        "keypoints":     [ { index, name, x, y, score } ],
        "image_width":   int,
        "image_height":  int,
        "is_sketch":     bool,
        "pose_detected": bool,
        "confidence":    float   ← mean visibility of detected landmarks (0–1)
    }
"""

import os
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker.task")

LANDMARK_NAMES = [
    "NOSE", "LEFT_EYE_INNER", "LEFT_EYE", "LEFT_EYE_OUTER",
    "RIGHT_EYE_INNER", "RIGHT_EYE", "RIGHT_EYE_OUTER",
    "LEFT_EAR", "RIGHT_EAR", "MOUTH_LEFT", "MOUTH_RIGHT",
    "LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW",
    "LEFT_WRIST", "RIGHT_WRIST", "LEFT_PINKY", "RIGHT_PINKY",
    "LEFT_INDEX", "RIGHT_INDEX", "LEFT_THUMB", "RIGHT_THUMB",
    "LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE",
    "LEFT_ANKLE", "RIGHT_ANKLE", "LEFT_HEEL", "RIGHT_HEEL",
    "LEFT_FOOT_INDEX", "RIGHT_FOOT_INDEX",
]

# Edge density threshold above which an image is classified as a sketch
SKETCH_EDGE_THRESHOLD = 0.15

# Minimum mean landmark visibility to accept a detection as valid.
# Below this threshold the pose is treated as not detected.
CONFIDENCE_THRESHOLD = 0.40


# ---------------------------------------------------------------------------
# Sketch detection
# ---------------------------------------------------------------------------

def is_sketch(img_bgr: np.ndarray) -> bool:
    """
    Classify an image as a sketch using Canny edge density.
    Returns True if edge density exceeds SKETCH_EDGE_THRESHOLD.
    """
    gray         = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    edges        = cv2.Canny(gray, threshold1=50, threshold2=150)
    edge_density = np.count_nonzero(edges) / edges.size
    return bool(edge_density > SKETCH_EDGE_THRESHOLD)


# ---------------------------------------------------------------------------
# Sketch preprocessing  (Part 4 — enhanced pipeline)
# ---------------------------------------------------------------------------

def preprocess_image(img_bgr: np.ndarray) -> np.ndarray:
    """
    Convert a sketch/line-drawing into a photo-like image that MediaPipe
    can detect poses in more reliably.

    Enhanced pipeline:
        1. Grayscale
        2. Histogram equalisation — global contrast boost
        3. CLAHE — adaptive local contrast enhancement
        4. Adaptive thresholding — binarise lines cleanly
        5. Invert so lines are bright on dark background
        6. Gaussian blur — smooth noise
        7. Divide blend — simulate pencil shading
        8. Dilation — thicken thin sketch lines
        9. Final slight blur — smooth dilation artifacts
       10. Convert back to 3-channel BGR for MediaPipe
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Step 2: global histogram equalisation — spreads intensity range
    gray = cv2.equalizeHist(gray)

    # Step 3: CLAHE — boosts local contrast without over-amplifying noise
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    gray  = clahe.apply(gray)

    # Step 4: adaptive threshold — binarises lines robustly under uneven lighting
    binary = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        blockSize=11, C=2,
    )

    # Step 5: already inverted by THRESH_BINARY_INV (lines = white, bg = black)
    # Step 6: blur the inverted image to create a soft base for divide blend
    blurred = cv2.GaussianBlur(binary, ksize=(21, 21), sigmaX=0)

    # Step 7: divide blend — simulates the "dodge" effect
    blurred_float = blurred.astype(np.float32) + 1e-6
    gray_float    = gray.astype(np.float32)
    divided       = np.clip((gray_float / blurred_float) * 255, 0, 255).astype(np.uint8)

    # Step 8: dilation — thicken sketch lines so MediaPipe body-part detectors fire
    kernel  = np.ones((2, 2), np.uint8)
    dilated = cv2.dilate(divided, kernel, iterations=1)

    # Step 9: final slight blur — smooth dilation artifacts
    smoothed = cv2.GaussianBlur(dilated, (3, 3), 0)

    # Step 10: back to 3-channel BGR
    return cv2.cvtColor(smoothed, cv2.COLOR_GRAY2BGR)


# ---------------------------------------------------------------------------
# Core detection
# ---------------------------------------------------------------------------

def _run_mediapipe(img_bgr: np.ndarray, w: int, h: int) -> list:
    """
    Run MediaPipe PoseLandmarker on a BGR image.
    Returns list of keypoint dicts, or empty list if no pose found.
    """
    if not os.path.exists(MODEL_PATH):
        raise RuntimeError(f"Model not found at {MODEL_PATH}")

    img_rgb  = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=img_rgb)

    base_options = mp_python.BaseOptions(model_asset_path=MODEL_PATH)
    options = mp_vision.PoseLandmarkerOptions(
        base_options=base_options,
        output_segmentation_masks=False,
        min_pose_detection_confidence=0.3,
        min_pose_presence_confidence=0.3,
        min_tracking_confidence=0.3,
    )

    with mp_vision.PoseLandmarker.create_from_options(options) as landmarker:
        result = landmarker.detect(mp_image)

    if not result.pose_landmarks:
        return []

    landmarks = result.pose_landmarks[0]
    keypoints = []
    for idx, lm in enumerate(landmarks):
        name = LANDMARK_NAMES[idx] if idx < len(LANDMARK_NAMES) else f"LANDMARK_{idx}"
        keypoints.append({
            "index": idx,
            "name":  name,
            "x":     round(lm.x * w, 2),
            "y":     round(lm.y * h, 2),
            "score": round(getattr(lm, "visibility", 1.0), 4),
        })
    return keypoints


def _mean_confidence(keypoints: list) -> float:
    """Compute mean visibility score across all keypoints."""
    if not keypoints:
        return 0.0
    return float(np.mean([kp.get("score", 0.0) for kp in keypoints]))


def detect_keypoints(image_bytes: bytes, force_preprocess: bool = False) -> dict:
    """
    Detect 33 pose keypoints from raw image bytes.

    Detection flow:
        1. Classify image as sketch or photo
        2. Run MediaPipe (with preprocessing if sketch)
        3. If detection fails, retry with preprocessing
        4. Apply confidence threshold — low-confidence detections are rejected

    Returns:
        {
            "keypoints":     [ { index, name, x, y, score } ],
            "image_width":   int,
            "image_height":  int,
            "is_sketch":     bool,
            "pose_detected": bool,
            "confidence":    float   ← 0.0 if not detected
        }

    Never raises — returns empty keypoints with pose_detected=False on failure.
    """
    nparr   = np.frombuffer(image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_bgr is None:
        return _empty_result(0, 0, False, "Could not decode image")

    h, w   = img_bgr.shape[:2]
    sketch = force_preprocess or is_sketch(img_bgr)

    # First attempt
    img_to_use = preprocess_image(img_bgr) if sketch else img_bgr
    keypoints  = _run_mediapipe(img_to_use, w, h)

    # Fallback: if normal image failed, try with preprocessing
    if not keypoints and not sketch:
        keypoints = _run_mediapipe(preprocess_image(img_bgr), w, h)

    # Part 5 — confidence threshold: reject low-confidence detections
    confidence = _mean_confidence(keypoints)
    if keypoints and confidence < CONFIDENCE_THRESHOLD:
        keypoints = []   # treat as not detected

    # Filter individual keypoints below a per-landmark visibility floor.
    # Sketches/drawings get a lower threshold (0.20) because MediaPipe returns
    # lower visibility scores for non-photographic images overall.
    # Photos get a stricter threshold (0.50) to drop hallucinated body landmarks
    # on face-crop images where only face joints are genuinely visible.
    if keypoints:
        per_kp_threshold = 0.20 if sketch else 0.50
        keypoints = [kp for kp in keypoints if kp.get("score", 0.0) >= per_kp_threshold]

    return {
        "keypoints":     keypoints,
        "image_width":   w,
        "image_height":  h,
        "is_sketch":     sketch,
        "pose_detected": len(keypoints) > 0,
        "confidence":    round(confidence, 4),
    }


def _empty_result(w: int, h: int, sketch: bool, reason: str = "") -> dict:
    """Return a safe empty result when detection fails."""
    return {
        "keypoints":     [],
        "image_width":   w,
        "image_height":  h,
        "is_sketch":     sketch,
        "pose_detected": False,
        "confidence":    0.0,
        "error":         reason,
    }
