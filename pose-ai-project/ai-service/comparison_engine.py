"""
comparison_engine.py
Compares a user's drawing pose against a reference pose.

Priority order
--------------
1. PRIMARY   — joint angle comparison (elbow, knee, shoulder angles)
               Flags any joint where |ref_angle - draw_angle| > ANGLE_THRESHOLD (10°)
2. SECONDARY — limb length ratios (only flags if the joint wasn't already caught
               by an angle error, and deviation > PROPORTION_THRESHOLD)
3. TERTIARY  — symmetry deviations (informational, never duplicates angle errors)

Both poses are normalized (center → rotate → scale) before any metric is
computed, so size, position, and tilt differences are eliminated first.

Public API
----------
    compare_poses(reference_kp, drawing_kp) -> dict
"""

import numpy as np
from analysis_engine import (
    calculate_angle,
    distance,
    check_proportions,
    check_symmetry,
    prepare_for_comparison,
    _pt,
    _torso_height,
)

# ---------------------------------------------------------------------------
# Joint angle definitions
# ---------------------------------------------------------------------------

# PRIMARY: all joints whose angles are compared
# Format: joint_key -> (point_A, vertex_B, point_C)
# Angle is measured at vertex B.
ANGLE_JOINTS = {
    # Elbow bend: shoulder → elbow → wrist
    "left_elbow":    ("LEFT_SHOULDER",  "LEFT_ELBOW",   "LEFT_WRIST"),
    "right_elbow":   ("RIGHT_SHOULDER", "RIGHT_ELBOW",  "RIGHT_WRIST"),
    # Knee bend: hip → knee → ankle
    "left_knee":     ("LEFT_HIP",       "LEFT_KNEE",    "LEFT_ANKLE"),
    "right_knee":    ("RIGHT_HIP",      "RIGHT_KNEE",   "RIGHT_ANKLE"),
    # Shoulder abduction: elbow → shoulder → hip
    "left_shoulder": ("LEFT_ELBOW",     "LEFT_SHOULDER",  "LEFT_HIP"),
    "right_shoulder":("RIGHT_ELBOW",    "RIGHT_SHOULDER", "RIGHT_HIP"),
}

# Map each angle joint to the limb keys it covers, so secondary checks
# skip limbs that are already flagged by a primary angle error.
_ANGLE_COVERS_LIMBS = {
    "left_elbow":    {"upper_arm_left",  "lower_arm_left"},
    "right_elbow":   {"upper_arm_right", "lower_arm_right"},
    "left_knee":     {"upper_leg_left",  "lower_leg_left"},
    "right_knee":    {"upper_leg_right", "lower_leg_right"},
    "left_shoulder": {"upper_arm_left"},
    "right_shoulder":{"upper_arm_right"},
}

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

# PRIMARY — angle threshold (degrees).  Only flag if deviation exceeds this.
ANGLE_THRESHOLD      = 10.0   # degrees

# SECONDARY — proportion threshold (% relative difference).
# Raised vs. the old value so minor length noise doesn't fire.
PROPORTION_THRESHOLD = 15.0   # percent

# TERTIARY — symmetry threshold (fraction of torso height)
SYMMETRY_THRESHOLD   = 0.12   # 12 %


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _safe_pt(keypoints: list, name: str):
    """Return np.array for a named keypoint, or None if missing."""
    kp = next((k for k in keypoints if k["name"] == name), None)
    return np.array([kp["x"], kp["y"]], dtype=float) if kp else None


def _angle_for(keypoints: list, a_name: str, b_name: str, c_name: str):
    """Compute angle at b_name vertex; returns None if any point is missing."""
    a = _safe_pt(keypoints, a_name)
    b = _safe_pt(keypoints, b_name)
    c = _safe_pt(keypoints, c_name)
    if a is None or b is None or c is None:
        return None
    return calculate_angle(a, b, c)


def _torso_lean(keypoints: list):
    """Angle of torso vector vs upward vertical (degrees); None if missing."""
    try:
        ls = _pt(keypoints, "LEFT_SHOULDER")
        rs = _pt(keypoints, "RIGHT_SHOULDER")
        lh = _pt(keypoints, "LEFT_HIP")
        rh = _pt(keypoints, "RIGHT_HIP")
        torso_vec = (ls + rs) / 2 - (lh + rh) / 2
        vertical  = np.array([0.0, -1.0])
        return float(np.degrees(
            np.arccos(np.clip(
                np.dot(torso_vec, vertical) / (np.linalg.norm(torso_vec) + 1e-8),
                -1.0, 1.0
            ))
        ))
    except KeyError:
        return None


def _label(name: str) -> str:
    """snake_case → Title Case."""
    return name.replace("_", " ").title()


# ---------------------------------------------------------------------------
# Similarity score
# ---------------------------------------------------------------------------

def _compute_similarity_score(angle_diff: dict) -> float:
    """
    Compute a 0–100 pose similarity score from angle differences.

    Formula:
        avg_deviation = mean(|diff| for all joints in angle_diff)
        score = max(0, min(100, 100 - avg_deviation * (100 / 90)))

    Returns 100.0 when there are no angle diffs (nothing to compare).
    """
    diffs = [abs(v["diff"]) for v in angle_diff.values() if "diff" in v]
    if not diffs:
        return 100.0
    avg_deviation = sum(diffs) / len(diffs)
    factor = 100.0 / 90.0
    score  = max(0.0, min(100.0, 100.0 - avg_deviation * factor))
    return round(score, 1)


# ---------------------------------------------------------------------------
# compare_poses
# ---------------------------------------------------------------------------

def compare_poses(reference_kp: list, drawing_kp: list) -> dict:
    """
    Compare a drawing pose against a reference pose.

    Normalization pipeline (applied independently to each pose):
        center → rotate (cancel shoulder tilt) → normalize (torso = 1)

    Comparison priority:
        1. Joint angles  — primary signal, threshold 10°
        2. Limb lengths  — secondary, only for joints not caught by angles
        3. Symmetry      — tertiary, informational

    Args:
        reference_kp: raw keypoints from the reference image
        drawing_kp:   raw keypoints from the user's drawing

    Returns:
        {
            "angle_diff":      { joint: { ref, drawing, diff, flagged } },
            "proportion_diff": { limb:  { ref, drawing, diff_pct, flagged } },
            "symmetry_diff":   { part:  { ref, drawing, diff } },
            "torso_lean_diff": { ref, drawing, diff } | {},
            "major_errors":    [ { joint, message, priority } ],
            "feedback":        [ str ]
        }
    """
    # ── Normalize ─────────────────────────────────────────────────────────────
    ref_norm  = prepare_for_comparison(reference_kp)
    draw_norm = prepare_for_comparison(drawing_kp)

    angle_diff      = {}
    proportion_diff = {}
    symmetry_diff   = {}
    torso_lean_diff = {}
    major_errors    = []   # filled in priority order: angles first, then lengths
    feedback        = []

    # Track which limbs are already covered by a flagged angle error so the
    # secondary check doesn't double-report the same joint.
    angle_flagged_limbs: set = set()

    # =========================================================================
    # PRIMARY: joint angle comparison
    # =========================================================================
    for joint, (a, b, c) in ANGLE_JOINTS.items():
        ref_a  = _angle_for(ref_norm,  a, b, c)
        draw_a = _angle_for(draw_norm, a, b, c)
        if ref_a is None or draw_a is None:
            continue

        diff    = round(draw_a - ref_a, 2)
        flagged = abs(diff) > ANGLE_THRESHOLD

        angle_diff[joint] = {
            "ref":     round(ref_a,  2),
            "drawing": round(draw_a, 2),
            "diff":    diff,
            "flagged": flagged,
            "unit":    "degrees",
        }

        if flagged:
            direction = "more bent" if diff < 0 else "more extended"
            msg = (
                f"{_label(joint)} is {abs(diff):.1f}° off "
                f"(drawing: {draw_a:.1f}°, reference: {ref_a:.1f}° — {direction})"
            )
            major_errors.append({"joint": joint, "message": msg, "priority": 1})
            feedback.append(msg)
            # Mark covered limbs so secondary check skips them
            angle_flagged_limbs |= _ANGLE_COVERS_LIMBS.get(joint, set())

    # ── Torso lean (also primary — angle-based) ───────────────────────────────
    ref_lean  = _torso_lean(ref_norm)
    draw_lean = _torso_lean(draw_norm)
    if ref_lean is not None and draw_lean is not None:
        lean_diff = round(draw_lean - ref_lean, 2)
        torso_lean_diff = {
            "ref":     round(ref_lean,  2),
            "drawing": round(draw_lean, 2),
            "diff":    lean_diff,
        }
        if abs(lean_diff) > ANGLE_THRESHOLD:
            msg = f"Torso tilt differs by {abs(lean_diff):.1f}° from reference"
            major_errors.append({"joint": "torso_lean", "message": msg, "priority": 1})
            feedback.append(msg)

    # =========================================================================
    # SECONDARY: limb length ratios
    # Only flags if the limb wasn't already covered by a primary angle error.
    # =========================================================================
    ref_props  = check_proportions(ref_norm).get("ratios", {})
    draw_props = check_proportions(draw_norm).get("ratios", {})

    for limb in ref_props:
        if limb not in draw_props:
            continue
        ref_r  = ref_props[limb]
        draw_r = draw_props[limb]
        if ref_r < 1e-6:
            continue

        diff_pct = round((draw_r - ref_r) / ref_r * 100, 2)
        flagged  = (
            abs(diff_pct) > PROPORTION_THRESHOLD
            and limb not in angle_flagged_limbs   # don't double-report
        )

        proportion_diff[limb] = {
            "ref":      round(ref_r,  4),
            "drawing":  round(draw_r, 4),
            "diff_pct": diff_pct,
            "flagged":  flagged,
        }

        if flagged:
            direction = "longer" if diff_pct > 0 else "shorter"
            msg = f"{_label(limb)} is {abs(diff_pct):.1f}% {direction} than reference"
            major_errors.append({"joint": limb, "message": msg, "priority": 2})
            feedback.append(msg)

    # =========================================================================
    # TERTIARY: symmetry deviations (informational only, never duplicates)
    # =========================================================================
    ref_sym  = check_symmetry(ref_norm)
    draw_sym = check_symmetry(draw_norm)

    for part in ref_sym:
        if part not in draw_sym:
            continue
        ref_s  = float(ref_sym[part])
        draw_s = float(draw_sym[part])
        diff   = round(draw_s - ref_s, 4)
        symmetry_diff[part] = {
            "ref":     round(ref_s,  4),
            "drawing": round(draw_s, 4),
            "diff":    diff,
        }

        if abs(diff) > SYMMETRY_THRESHOLD:
            msg = (
                f"Symmetry in {_label(part)}: "
                f"drawing is {abs(diff)*100:.1f}% more asymmetric than reference"
            )
            major_errors.append({"joint": part, "message": msg, "priority": 3})
            feedback.append(msg)

    # ── Fallback feedback ─────────────────────────────────────────────────────
    if not feedback:
        feedback.append("Drawing pose closely matches the reference — great work!")

    # =========================================================================
    # SIMILARITY SCORE
    # Derived purely from angle differences (primary signal).
    # Maps 0° avg deviation → 100%, 90° avg deviation → 0%.
    # =========================================================================
    similarity_score = _compute_similarity_score(angle_diff)

    return {
        "angle_diff":       angle_diff,
        "proportion_diff":  proportion_diff,
        "symmetry_diff":    symmetry_diff,
        "torso_lean_diff":  torso_lean_diff,
        "major_errors":     major_errors,   # sorted: angles (1) → lengths (2) → symmetry (3)
        "feedback":         feedback,
        "similarity_score": similarity_score,
    }
