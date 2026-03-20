"""
fallback_engine.py
Reference-guided pose estimation for drawings where MediaPipe fails.

When a drawing's pose cannot be detected, this module:
  1. Finds the drawing's bounding box via contour detection
  2. Scales and translates the reference keypoints to fit the drawing
  3. Returns estimated keypoints that can be used for comparison

Public API
----------
    estimate_pose_from_reference(reference_kp, drawing_image_bytes) -> dict
"""

import cv2
import numpy as np


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _get_drawing_bbox(img_bgr: np.ndarray) -> tuple[int, int, int, int] | None:
    """
    Detect the bounding box of the drawn figure using contour analysis.

    Steps:
        1. Convert to grayscale
        2. Threshold to isolate dark marks on light background (or vice versa)
        3. Find all contours and compute their combined bounding box

    Returns:
        (x, y, w, h) bounding box, or None if no contours found
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)

    # Try both threshold directions and pick the one with more content
    _, thresh_dark  = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY_INV)  # dark marks on light bg
    _, thresh_light = cv2.threshold(gray, 50,  255, cv2.THRESH_BINARY)      # light marks on dark bg

    # Use whichever has more non-zero pixels (more content)
    thresh = thresh_dark if np.count_nonzero(thresh_dark) >= np.count_nonzero(thresh_light) else thresh_light

    # Dilate to connect nearby strokes into a single region
    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.dilate(thresh, kernel, iterations=3)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    # Filter out tiny noise contours (< 0.1% of image area)
    img_area = img_bgr.shape[0] * img_bgr.shape[1]
    contours = [c for c in contours if cv2.contourArea(c) > img_area * 0.001]
    if not contours:
        return None

    # Combine all significant contours into one bounding box
    all_pts = np.vstack(contours)
    x, y, w, h = cv2.boundingRect(all_pts)
    return x, y, w, h


def _get_reference_bbox(reference_kp: list) -> tuple[float, float, float, float] | None:
    """
    Compute the bounding box of the reference keypoints.

    Returns:
        (min_x, min_y, width, height) or None if fewer than 2 keypoints
    """
    if len(reference_kp) < 2:
        return None

    xs = [k["x"] for k in reference_kp]
    ys = [k["y"] for k in reference_kp]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    w = max_x - min_x
    h = max_y - min_y

    if w < 1 or h < 1:
        return None

    return min_x, min_y, w, h


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def estimate_pose_from_reference(reference_kp: list, drawing_image_bytes: bytes) -> dict:
    """
    Estimate drawing keypoints by scaling reference keypoints to fit the drawing.

    This is used as a fallback when MediaPipe cannot detect a pose in the drawing.

    Args:
        reference_kp:         List of keypoint dicts from the reference image
        drawing_image_bytes:  Raw bytes of the drawing image

    Returns:
        {
            "keypoints":  [ { index, name, x, y, score } ],
            "estimated":  True,
            "bbox":       { x, y, w, h }   — drawing bounding box used
        }

    On failure (can't decode image or find contours), returns the reference
    keypoints scaled to the drawing image dimensions as a best-effort fallback.
    """
    if not reference_kp:
        return {"keypoints": [], "estimated": True, "bbox": None}

    # Decode drawing image
    nparr   = np.frombuffer(drawing_image_bytes, np.uint8)
    img_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    if img_bgr is None:
        return {"keypoints": [], "estimated": True, "bbox": None}

    draw_h, draw_w = img_bgr.shape[:2]

    # Get reference bounding box
    ref_bbox = _get_reference_bbox(reference_kp)
    if ref_bbox is None:
        return {"keypoints": [], "estimated": True, "bbox": None}

    ref_min_x, ref_min_y, ref_w, ref_h = ref_bbox

    # Get drawing bounding box from contours
    draw_bbox = _get_drawing_bbox(img_bgr)

    if draw_bbox is not None:
        # Use detected figure bounding box
        dx, dy, dw, dh = draw_bbox
    else:
        # Fallback: use 80% of the image centered
        margin_x = int(draw_w * 0.1)
        margin_y = int(draw_h * 0.1)
        dx = margin_x
        dy = margin_y
        dw = draw_w - 2 * margin_x
        dh = draw_h - 2 * margin_y

    # Scale factors: map reference bbox → drawing bbox
    scale_x = dw / ref_w if ref_w > 0 else 1.0
    scale_y = dh / ref_h if ref_h > 0 else 1.0

    # Reference center and drawing center for alignment
    ref_cx = ref_min_x + ref_w / 2
    ref_cy = ref_min_y + ref_h / 2
    draw_cx = dx + dw / 2
    draw_cy = dy + dh / 2

    # Transform each reference keypoint into drawing space
    estimated_kp = []
    for kp in reference_kp:
        # Translate to reference center, scale, translate to drawing center
        new_x = draw_cx + (kp["x"] - ref_cx) * scale_x
        new_y = draw_cy + (kp["y"] - ref_cy) * scale_y

        # Clamp to image bounds
        new_x = float(np.clip(new_x, 0, draw_w))
        new_y = float(np.clip(new_y, 0, draw_h))

        estimated_kp.append({
            "index": kp["index"],
            "name":  kp["name"],
            "x":     round(new_x, 2),
            "y":     round(new_y, 2),
            "score": round(kp.get("score", 0.5) * 0.6, 4),  # lower confidence for estimates
        })

    return {
        "keypoints": estimated_kp,
        "estimated": True,
        "bbox": {"x": dx, "y": dy, "w": dw, "h": dh},
    }
