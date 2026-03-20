"""
correction_engine.py
Generates corrected joint positions.

Two modes:
  1. Anatomy mode  (reference_kp=None)
     Uses ideal anatomical ratios and angle ranges as ground truth.

  2. Reference mode (reference_kp provided)
     Moves drawing joints toward the reference positions with a smooth
     interpolation factor, so the correction is proportional to the error.

Public API
----------
    generate_corrected_pose(drawing_kp, reference_kp=None, errors=None) -> dict
"""

import numpy as np
from analysis_engine import (
    calculate_angle,
    detect_errors,
    IDEAL_PROPORTIONS,
    ANGLE_RANGES,
    _pt,
    _torso_height,
)

# ── Anatomy-mode constants ────────────────────────────────────────────────────
IDEAL_LEN = {k: (lo + hi) / 2 for k, (lo, hi) in IDEAL_PROPORTIONS.items()}

IDEAL_ANGLES = {
    "left_elbow":  170.0,
    "right_elbow": 170.0,
    "left_knee":   175.0,
    "right_knee":  175.0,
}

# ── Reference-mode interpolation factor (0 = keep drawing, 1 = full reference)
CORRECTION_BLEND = 0.75


# ---------------------------------------------------------------------------
# Internal geometry helpers
# ---------------------------------------------------------------------------

def _unit(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v)
    return v / n if n > 1e-8 else np.zeros_like(v)


def _rotate2d(v: np.ndarray, deg: float) -> np.ndarray:
    rad = np.radians(deg)
    c, s = np.cos(rad), np.sin(rad)
    return np.array([c * v[0] - s * v[1], s * v[0] + c * v[1]])


def _correct_limb_anatomy(
    proximal, joint, distal,
    ideal_upper, ideal_lower,
    ideal_angle, angle_range,
):
    """Rebuild limb using ideal anatomical lengths and angle."""
    upper_dir = _unit(joint - proximal)
    new_joint = proximal + upper_dir * ideal_upper

    current_angle = calculate_angle(proximal, joint, distal)
    lo, hi = angle_range

    if lo <= current_angle <= hi:
        lower_dir  = _unit(distal - joint)
        new_distal = new_joint + lower_dir * ideal_lower
    else:
        ba    = proximal - joint
        bc    = distal   - joint
        cross = float(ba[0] * bc[1] - ba[1] * bc[0])
        sign  = 1.0 if cross >= 0 else -1.0
        bend  = 180.0 - ideal_angle
        lower_dir  = _rotate2d(upper_dir, sign * bend)
        new_distal = new_joint + lower_dir * ideal_lower

    return proximal.copy(), new_joint, new_distal


def _blend(draw_pt: np.ndarray, ref_pt: np.ndarray, factor: float) -> np.ndarray:
    """Interpolate drawing point toward reference point."""
    return draw_pt + factor * (ref_pt - draw_pt)


# ---------------------------------------------------------------------------
# Reference-mode correction
# ---------------------------------------------------------------------------

def _correct_with_reference(drawing_kp: list, reference_kp: list) -> tuple[dict, set]:
    """
    Move each drawing keypoint toward its corresponding reference position
    using CORRECTION_BLEND interpolation.

    Returns (kp_map, modified_set).
    """
    # Build maps
    draw_map = {k["name"].upper(): np.array([k["x"], k["y"]], dtype=float)
                for k in drawing_kp}
    ref_map  = {k["name"].upper(): np.array([k["x"], k["y"]], dtype=float)
                for k in reference_kp}

    # Normalise both poses to the same scale using their torso heights
    # so a small reference doesn't pull drawing joints to wrong positions
    try:
        draw_th = _torso_height(drawing_kp)
        ref_th  = _torso_height(reference_kp)
        scale   = draw_th / ref_th if ref_th > 1e-3 else 1.0
    except Exception:
        scale = 1.0

    # Anchor: use drawing's shoulder midpoint as origin
    try:
        draw_ls = draw_map["LEFT_SHOULDER"]
        draw_rs = draw_map["RIGHT_SHOULDER"]
        draw_anchor = (draw_ls + draw_rs) / 2

        ref_ls = ref_map["LEFT_SHOULDER"]
        ref_rs = ref_map["RIGHT_SHOULDER"]
        ref_anchor = (ref_ls + ref_rs) / 2
    except KeyError:
        draw_anchor = np.zeros(2)
        ref_anchor  = np.zeros(2)

    modified = set()
    corrected = dict(draw_map)

    for name, draw_pt in draw_map.items():
        if name not in ref_map:
            continue

        # Scale reference point to drawing's coordinate space
        ref_pt_scaled = ref_anchor + (ref_map[name] - ref_anchor) * scale

        # Blend toward scaled reference
        new_pt = _blend(draw_pt, ref_pt_scaled, CORRECTION_BLEND)

        if not np.allclose(new_pt, draw_pt, atol=0.5):
            corrected[name] = new_pt
            modified.add(name)

    return corrected, modified


# ---------------------------------------------------------------------------
# Anatomy-mode correction (original behaviour)
# ---------------------------------------------------------------------------

def _correct_with_anatomy(drawing_kp: list, errors: list) -> tuple[dict, set]:
    """Correct using ideal anatomical ratios."""
    flagged = {e["joint"].lower() for e in errors}
    kp_map  = {k["name"].upper(): np.array([k["x"], k["y"]], dtype=float)
               for k in drawing_kp}
    modified: set = set()

    try:
        th = _torso_height(drawing_kp)
        if th < 1e-3:
            return kp_map, modified

        ideal = {k: v * th for k, v in IDEAL_LEN.items()}

        ls = kp_map["LEFT_SHOULDER"];  rs = kp_map["RIGHT_SHOULDER"]
        le = kp_map["LEFT_ELBOW"];     re = kp_map["RIGHT_ELBOW"]
        lw = kp_map["LEFT_WRIST"];     rw = kp_map["RIGHT_WRIST"]
        lh = kp_map["LEFT_HIP"];       rh = kp_map["RIGHT_HIP"]
        lk = kp_map["LEFT_KNEE"];      rk = kp_map["RIGHT_KNEE"]
        la = kp_map["LEFT_ANKLE"];     ra = kp_map["RIGHT_ANKLE"]

        if "shoulder_height" in flagged:
            avg_y = (ls[1] + rs[1]) / 2
            kp_map["LEFT_SHOULDER"]  = np.array([ls[0], avg_y])
            kp_map["RIGHT_SHOULDER"] = np.array([rs[0], avg_y])
            ls, rs = kp_map["LEFT_SHOULDER"], kp_map["RIGHT_SHOULDER"]
            modified |= {"LEFT_SHOULDER", "RIGHT_SHOULDER"}

        if "hip_height" in flagged:
            avg_y = (lh[1] + rh[1]) / 2
            kp_map["LEFT_HIP"]  = np.array([lh[0], avg_y])
            kp_map["RIGHT_HIP"] = np.array([rh[0], avg_y])
            lh, rh = kp_map["LEFT_HIP"], kp_map["RIGHT_HIP"]
            modified |= {"LEFT_HIP", "RIGHT_HIP"}

        if flagged & {"left_elbow", "upper_arm_left", "lower_arm_left", "arm_length"}:
            _, new_le, new_lw = _correct_limb_anatomy(
                ls, le, lw, ideal["upper_arm"], ideal["lower_arm"],
                IDEAL_ANGLES["left_elbow"], ANGLE_RANGES["left_elbow"])
            kp_map["LEFT_ELBOW"] = new_le; kp_map["LEFT_WRIST"] = new_lw
            le, lw = new_le, new_lw
            modified |= {"LEFT_ELBOW", "LEFT_WRIST"}

        if flagged & {"right_elbow", "upper_arm_right", "lower_arm_right", "arm_length"}:
            _, new_re, new_rw = _correct_limb_anatomy(
                rs, re, rw, ideal["upper_arm"], ideal["lower_arm"],
                IDEAL_ANGLES["right_elbow"], ANGLE_RANGES["right_elbow"])
            kp_map["RIGHT_ELBOW"] = new_re; kp_map["RIGHT_WRIST"] = new_rw
            re, rw = new_re, new_rw
            modified |= {"RIGHT_ELBOW", "RIGHT_WRIST"}

        if flagged & {"left_knee", "upper_leg_left", "lower_leg_left", "leg_length"}:
            _, new_lk, new_la = _correct_limb_anatomy(
                lh, lk, la, ideal["upper_leg"], ideal["lower_leg"],
                IDEAL_ANGLES["left_knee"], ANGLE_RANGES["left_knee"])
            kp_map["LEFT_KNEE"] = new_lk; kp_map["LEFT_ANKLE"] = new_la
            modified |= {"LEFT_KNEE", "LEFT_ANKLE"}

        if flagged & {"right_knee", "upper_leg_right", "lower_leg_right", "leg_length"}:
            _, new_rk, new_ra = _correct_limb_anatomy(
                rh, rk, ra, ideal["upper_leg"], ideal["lower_leg"],
                IDEAL_ANGLES["right_knee"], ANGLE_RANGES["right_knee"])
            kp_map["RIGHT_KNEE"] = new_rk; kp_map["RIGHT_ANKLE"] = new_ra
            modified |= {"RIGHT_KNEE", "RIGHT_ANKLE"}

    except (KeyError, ValueError):
        pass

    return kp_map, modified


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_corrected_pose(
    drawing_kp: list,
    reference_kp: list = None,
    errors: list = None,
) -> dict:
    """
    Generate corrected joint positions.

    If reference_kp is provided, joints are blended toward the reference
    (reference mode). Otherwise, ideal anatomical rules are used.

    Args:
        drawing_kp:   keypoints from the drawing/user image
        reference_kp: keypoints from the reference image (optional)
        errors:       pre-computed errors from detect_errors() (anatomy mode only)

    Returns:
        {
            "corrected_keypoints": { NAME: { x, y } },
            "flagged_joints":      [ str ],
            "corrections_applied": int,
            "mode":                "reference" | "anatomy"
        }
    """
    if reference_kp and len(reference_kp) > 0:
        # Reference mode
        kp_map, modified = _correct_with_reference(drawing_kp, reference_kp)
        mode = "reference"
    else:
        # Anatomy mode
        if errors is None:
            errors = detect_errors(drawing_kp)
        kp_map, modified = _correct_with_anatomy(drawing_kp, errors)
        mode = "anatomy"

    corrected_keypoints = {
        name: {"x": round(float(pt[0]), 2), "y": round(float(pt[1]), 2)}
        for name, pt in kp_map.items()
    }

    return {
        "corrected_keypoints": corrected_keypoints,
        "flagged_joints":      sorted(modified),
        "corrections_applied": len(modified),
        "mode":                mode,
    }
