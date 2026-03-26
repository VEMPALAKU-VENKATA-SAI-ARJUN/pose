"""
analysis_engine.py
Performs anatomical pose analysis on detected keypoints.

Public API:
    distance(a, b)                    -> float
    calculate_angle(a, b, c)          -> float
    center_keypoints(keypoints)       -> list   (translate so hip-mid = origin)
    rotate_keypoints(keypoints, angle)-> list   (rotate by -angle radians around origin)
    normalize_keypoints(keypoints)    -> list   (scale so torso-length = 1)
    prepare_for_comparison(keypoints) -> list   (center → rotate → normalize)
    check_proportions(keypoints)      -> dict
    check_symmetry(keypoints)         -> dict
    detect_errors(keypoints)          -> list[dict]
    detect_pose_type(keypoints)       -> dict
    check_pose_completeness(keypoints)-> dict
    analyze(keypoints, w, h)          -> dict
"""

import numpy as np

# ---------------------------------------------------------------------------
# Landmark index constants (MediaPipe 33-point order)
# ---------------------------------------------------------------------------
IDX = {
    "NOSE":            0,
    "LEFT_SHOULDER":  11, "RIGHT_SHOULDER": 12,
    "LEFT_ELBOW":     13, "RIGHT_ELBOW":    14,
    "LEFT_WRIST":     15, "RIGHT_WRIST":    16,
    "LEFT_HIP":       23, "RIGHT_HIP":      24,
    "LEFT_KNEE":      25, "RIGHT_KNEE":     26,
    "LEFT_ANKLE":     27, "RIGHT_ANKLE":    28,
}

# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

# Acceptable joint angle ranges (degrees) for a neutral pose
ANGLE_RANGES = {
    "left_elbow":  (0, 180),
    "right_elbow": (0, 180),
    "left_knee":   (0, 180),
    "right_knee":  (0, 180),
    "torso_lean":  (0, 20),   # degrees from vertical
}

# Ideal limb/torso ratios based on the classical 7.5-head canon
# (torso ≈ 3 head-units; each ratio is limb / torso_height)
IDEAL_PROPORTIONS = {
    "upper_arm": (0.30, 0.55),
    "lower_arm": (0.25, 0.50),
    "upper_leg": (0.45, 0.70),
    "lower_leg": (0.40, 0.65),
}

# Maximum allowed asymmetry as a fraction of torso height
SYMMETRY_TOLERANCE = 0.15   # 15 %


# ---------------------------------------------------------------------------
# Core math helpers
# ---------------------------------------------------------------------------

def distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Euclidean distance between two 2-D points.

    Args:
        a, b: array-like of shape (2,) — [x, y]

    Returns:
        Scalar distance as float.
    """
    a, b = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    return float(np.linalg.norm(a - b))


def calculate_angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    """
    Angle at vertex B formed by rays B→A and B→C, using the dot-product formula.

        cos θ = (BA · BC) / (|BA| |BC|)

    Args:
        a, b, c: array-like of shape (2,) — [x, y]

    Returns:
        Angle in degrees, clamped to [0, 180].
    """
    a, b, c = (np.asarray(p, dtype=float) for p in (a, b, c))
    ba = a - b
    bc = c - b
    cos_theta = np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-8)
    return float(np.degrees(np.arccos(np.clip(cos_theta, -1.0, 1.0))))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _pt(keypoints: list, name: str) -> np.ndarray:
    """Return (x, y) array for a named keypoint; raises KeyError if missing."""
    kp = next((k for k in keypoints if k["name"] == name), None)
    if kp is None:
        raise KeyError(f"Keypoint '{name}' not found in detection result")
    return np.array([kp["x"], kp["y"]], dtype=float)


def _torso_height(keypoints: list) -> float:
    """Vertical distance from shoulder midpoint to hip midpoint."""
    ls = _pt(keypoints, "LEFT_SHOULDER")
    rs = _pt(keypoints, "RIGHT_SHOULDER")
    lh = _pt(keypoints, "LEFT_HIP")
    rh = _pt(keypoints, "RIGHT_HIP")
    return distance((ls + rs) / 2, (lh + rh) / 2)


# ---------------------------------------------------------------------------
# Keypoint normalization  (Parts 1, 2, 5)
# ---------------------------------------------------------------------------

def _kp_list_to_map(keypoints: list) -> dict:
    """{ NAME: np.array([x, y]) }"""
    return {k["name"]: np.array([k["x"], k["y"]], dtype=float) for k in keypoints}


def _map_to_kp_list(kp_map: dict, original: list) -> list:
    """
    Rebuild a keypoint list from a name→array map, preserving index and score
    from the original list.  Only names present in kp_map are included.
    """
    index_score = {k["name"]: (k.get("index", 0), k.get("score", 1.0)) for k in original}
    result = []
    for name, pt in kp_map.items():
        idx, score = index_score.get(name, (0, 1.0))
        result.append({
            "index": idx,
            "name":  name,
            "x":     float(pt[0]),
            "y":     float(pt[1]),
            "score": score,
        })
    return result


def center_keypoints(keypoints: list) -> list:
    """
    Translate all keypoints so the hip midpoint becomes the origin (0, 0).

    Removes positional differences — two identical poses placed at different
    locations in the frame will align perfectly after centering.

    Args:
        keypoints: original keypoint list (not modified)

    Returns:
        New keypoint list with hip-mid at (0, 0).
        Returns original list unchanged if hip keypoints are missing.
    """
    try:
        lh = _pt(keypoints, "LEFT_HIP")
        rh = _pt(keypoints, "RIGHT_HIP")
        center = (lh + rh) / 2
    except KeyError:
        return keypoints

    kp_map   = _kp_list_to_map(keypoints)
    centered = {name: pt - center for name, pt in kp_map.items()}
    return _map_to_kp_list(centered, keypoints)


def rotate_keypoints(keypoints: list, angle: float) -> list:
    """
    Rotate all keypoints by -angle radians around the origin.

    Passing the pose's own shoulder angle cancels its tilt so the shoulder
    line becomes horizontal.  Call center_keypoints() first so the rotation
    is applied around the body centre, not the image corner.

    The rotation matrix for angle θ (counter-clockwise) is:
        [ cos θ  -sin θ ]
        [ sin θ   cos θ ]

    We pass -angle to undo the detected tilt:
        x' = x·cos(-angle) - y·sin(-angle)
        y' = x·sin(-angle) + y·cos(-angle)

    Args:
        keypoints: original keypoint list (not modified)
        angle:     shoulder orientation in radians, computed via
                   atan2(right_shoulder.y - left_shoulder.y,
                         right_shoulder.x - left_shoulder.x)

    Returns:
        New keypoint list rotated by -angle.
    """
    cos_a = np.cos(-angle)
    sin_a = np.sin(-angle)
    R = np.array([[cos_a, -sin_a],
                  [sin_a,  cos_a]])

    kp_map  = _kp_list_to_map(keypoints)
    rotated = {name: R @ pt for name, pt in kp_map.items()}
    return _map_to_kp_list(rotated, keypoints)


def _shoulder_angle(keypoints: list) -> float:
    """
    Compute the orientation angle of the shoulder line in radians.

        angle = atan2(right_shoulder.y - left_shoulder.y,
                      right_shoulder.x - left_shoulder.x)

    Returns 0.0 if shoulder keypoints are missing.
    """
    try:
        ls = _pt(keypoints, "LEFT_SHOULDER")
        rs = _pt(keypoints, "RIGHT_SHOULDER")
    except KeyError:
        return 0.0
    return float(np.arctan2(rs[1] - ls[1], rs[0] - ls[0]))


def normalize_keypoints(keypoints: list) -> list:
    """
    Scale all keypoints so the torso length (shoulder-mid → hip-mid) equals 1.

    Removes size differences — a small drawing and a large photo of the same
    pose will have identical normalized coordinates.

    Call after center_keypoints() and rotate_keypoints() for best results.

    Args:
        keypoints: original keypoint list (not modified)

    Returns:
        New keypoint list scaled to torso-length = 1.
        Returns original list unchanged if torso is degenerate (< 1e-3).
    """
    try:
        th = _torso_height(keypoints)
    except KeyError:
        return keypoints

    if th < 1e-3:
        return keypoints

    scale  = 1.0 / th
    kp_map = _kp_list_to_map(keypoints)
    scaled = {name: pt * scale for name, pt in kp_map.items()}
    return _map_to_kp_list(scaled, keypoints)


def prepare_for_comparison(keypoints: list) -> list:
    """
    Apply the full normalization pipeline in the correct order:

        1. center    — translate hip-mid to origin
        2. rotate    — cancel shoulder tilt (each pose uses its own angle)
        3. normalize — scale torso to length 1

    Rotation is applied before scaling so the angle is computed on
    centered, unscaled coordinates (more numerically stable).

    The original keypoints list is never modified.

    Args:
        keypoints: raw keypoint list

    Returns:
        Centered, rotation-aligned, normalized keypoint list.
    """
    kp    = center_keypoints(keypoints)          # step 1: translate
    angle = _shoulder_angle(kp)                  # step 2a: measure tilt on centered pose
    kp    = rotate_keypoints(kp, angle)          # step 2b: cancel tilt
    kp    = normalize_keypoints(kp)              # step 3: scale
    return kp


# ---------------------------------------------------------------------------
# Pose completeness validation
# ---------------------------------------------------------------------------

# Joints required for a full-body comparison
REQUIRED_JOINTS = [
    "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_HIP",      "RIGHT_HIP",
    "LEFT_ELBOW",    "RIGHT_ELBOW",
    "LEFT_KNEE",     "RIGHT_KNEE",
]

# Joints sufficient for upper-body-only comparison
UPPER_BODY_JOINTS = [
    "LEFT_SHOULDER", "RIGHT_SHOULDER",
    "LEFT_ELBOW",    "RIGHT_ELBOW",
    "LEFT_HIP",      "RIGHT_HIP",
]

# Minimum fraction of required joints that must be present
COMPLETENESS_THRESHOLD = 0.60


def check_pose_completeness(keypoints: list) -> dict:
    """
    Validate whether a keypoint set is complete enough for comparison.

    Checks:
        - Full body: ≥ 60% of REQUIRED_JOINTS present
        - Upper body fallback: all UPPER_BODY_JOINTS present (legs missing)

    Args:
        keypoints: raw keypoint list from detect_keypoints()

    Returns:
        {
            "is_complete":   bool,   # True if full-body threshold met
            "is_upper_body": bool,   # True if only upper body is present
            "present":       int,    # count of required joints found
            "required":      int,    # total required joints
            "ratio":         float,  # present / required
            "missing":       list,   # names of missing required joints
        }
    """
    detected_names = {k["name"] for k in keypoints}
    present = [j for j in REQUIRED_JOINTS if j in detected_names]
    missing = [j for j in REQUIRED_JOINTS if j not in detected_names]
    ratio   = len(present) / len(REQUIRED_JOINTS)

    is_complete   = ratio >= COMPLETENESS_THRESHOLD
    is_upper_body = (
        not is_complete
        and all(j in detected_names for j in UPPER_BODY_JOINTS)
    )

    return {
        "is_complete":   is_complete,
        "is_upper_body": is_upper_body,
        "present":       len(present),
        "required":      len(REQUIRED_JOINTS),
        "ratio":         round(ratio, 3),
        "missing":       missing,
    }


# ---------------------------------------------------------------------------
# Pose type detection
# ---------------------------------------------------------------------------

import logging as _logging
_pose_log = _logging.getLogger("pose_type")

# Landmark sets used to classify pose type
_LEG_JOINTS  = {"LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"}
_HIP_JOINTS  = {"LEFT_HIP",  "RIGHT_HIP"}
_ARM_JOINTS  = {"LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_ELBOW", "RIGHT_ELBOW"}
_FACE_JOINTS = {"NOSE", "LEFT_EYE", "RIGHT_EYE", "LEFT_EAR", "RIGHT_EAR"}

# Spatial spread threshold: if all keypoints span less than this fraction of
# the image height AND no hips/legs are present, treat as a face crop.
_FACE_SPREAD_THRESHOLD = 0.35

# Minimum per-keypoint visibility score to count a landmark as reliably detected.
# Keypoints below this are treated as absent for classification purposes.
_JOINT_SCORE_THRESHOLD = 0.50


def detect_pose_type(
    keypoints: list,
    image_width: int = 0,
    image_height: int = 0,
) -> dict:
    """
    Classify the pose captured in a keypoint set.

    Priority order (first match wins):
        1. "face"       — keypoints span < 35% of image height AND no hips/legs,
                          OR only face landmarks pass the score threshold
        2. "full_body"  — hips + at least one leg joint detected (score ≥ 0.5)
        3. "upper_body" — ≥3 arm joints AND hips present, but no leg joints
        4. "unknown"    — none of the above

    Score filtering: landmarks with visibility < 0.5 are treated as absent.
    This prevents MediaPipe's hallucinated body landmarks on face-crop images
    from triggering false upper_body or full_body classifications.

    Args:
        keypoints:     raw keypoint list from detect_keypoints()
        image_width:   original image width in pixels  (0 = unknown)
        image_height:  original image height in pixels (0 = unknown)

    Returns:
        {
            "pose_type":      "full_body" | "upper_body" | "face" | "unknown",
            "has_legs":       bool,
            "has_upper_body": bool,
            "has_face_only":  bool,
            "spread_ratio":   float,
        }
    """
    # Build two name sets: all detected, and only high-confidence ones
    all_names   = {k["name"] for k in keypoints}
    conf_names  = {k["name"] for k in keypoints if k.get("score", 1.0) >= _JOINT_SCORE_THRESHOLD}

    # Use high-confidence names for body-part decisions
    has_hips       = bool(_HIP_JOINTS & conf_names)
    has_legs       = bool(_LEG_JOINTS & conf_names)
    has_upper_body = len(_ARM_JOINTS & conf_names) >= 3 and has_hips

    # ── Spatial spread (uses all keypoints for bbox, not just confident ones) ─
    spread_ratio = 0.0
    if image_height and image_height > 0 and keypoints:
        y_values     = [kp["y"] for kp in keypoints]
        bbox_height  = max(y_values) - min(y_values)
        spread_ratio = bbox_height / image_height

    is_face_spread = (
        spread_ratio > 0
        and spread_ratio < _FACE_SPREAD_THRESHOLD
        and not has_hips
        and not has_legs
    )
    is_face_landmarks = (
        bool(_FACE_JOINTS & conf_names)
        and not has_hips
        and not has_upper_body
    )
    has_face_only = is_face_spread or is_face_landmarks

    # ── Priority classification ───────────────────────────────────────────────
    if has_face_only:
        pose_type = "face"
    elif has_hips and has_legs:
        pose_type = "full_body"
    elif has_upper_body and not has_legs:
        pose_type = "upper_body"
    else:
        pose_type = "unknown"

    _pose_log.debug(
        "detect_pose_type | total_kp=%d conf_kp=%d conf_names=%s | "
        "spread_ratio=%.3f image_h=%d | "
        "has_hips=%s has_legs=%s has_upper_body=%s has_face_only=%s | "
        "→ pose_type=%s",
        len(keypoints), len(conf_names), sorted(conf_names),
        spread_ratio, image_height,
        has_hips, has_legs, has_upper_body, has_face_only,
        pose_type,
    )

    return {
        "pose_type":      pose_type,
        "has_legs":       has_legs,
        "has_upper_body": has_upper_body,
        "has_face_only":  has_face_only,
        "spread_ratio":   round(spread_ratio, 4),
    }


# Pose types that are compatible with each other for comparison
_COMPATIBLE_TYPES = {
    frozenset({"full_body", "full_body"}),
    frozenset({"upper_body", "upper_body"}),
}


def detect_dynamic_partial(keypoints: list) -> bool:
    """
    Detect whether a pose is a dynamic/artistic partial pose.

    Returns True when:
        - Torso is present (at least one shoulder + one hip)
        - At least one arm OR leg joint is detected
        - BUT the pose is NOT fully complete (check_pose_completeness returns incomplete)

    This covers crouching, jumping, foreshortened, or stylised poses where
    some limbs are hidden or outside the frame.

    Args:
        keypoints: raw keypoint list from detect_keypoints()

    Returns:
        True if the pose qualifies as dynamic/partial, False otherwise.
    """
    detected_names = {k["name"] for k in keypoints}

    # Torso: at least one shoulder AND one hip
    has_torso = (
        bool({"LEFT_SHOULDER", "RIGHT_SHOULDER"} & detected_names)
        and bool({"LEFT_HIP", "RIGHT_HIP"} & detected_names)
    )
    if not has_torso:
        return False

    # At least one arm or leg joint
    limb_joints = {
        "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST",
        "LEFT_KNEE",  "RIGHT_KNEE",  "LEFT_ANKLE", "RIGHT_ANKLE",
    }
    has_limb = bool(limb_joints & detected_names)
    if not has_limb:
        return False

    # Must NOT be fully complete
    completeness = check_pose_completeness(keypoints)
    return not completeness["is_complete"]


def check_pose_type_compatibility(ref_type: str, draw_type: str) -> dict:
    """
    Determine whether two pose types can be meaningfully compared.

    Compatible pairs:
        full_body  vs full_body   → full comparison
        upper_body vs upper_body  → upper-body comparison
    Incompatible:
        anything else             → mismatch error

    Args:
        ref_type:  pose_type string from detect_pose_type() for the reference
        draw_type: pose_type string from detect_pose_type() for the drawing

    Returns:
        {
            "compatible":    bool,
            "comparison_mode": "full_body" | "upper_body" | None,
            "error":         str | None,   # human-readable mismatch message
        }
    """
    pair = frozenset({ref_type, draw_type})

    if ref_type == "full_body" and draw_type == "full_body":
        return {"compatible": True,  "comparison_mode": "full_body",  "error": None}
    if ref_type == "upper_body" and draw_type == "upper_body":
        return {"compatible": True,  "comparison_mode": "upper_body", "error": None}

    # Build a readable label for each type
    label = {"full_body": "full body", "upper_body": "upper body",
             "face": "face only", "unknown": "unknown"}
    ref_label  = label.get(ref_type,  ref_type)
    draw_label = label.get(draw_type, draw_type)

    # Special case: face images should never be compared
    if "face" in pair:
        error = (
            f"Pose type mismatch: reference is {ref_label}, drawing is {draw_label}. "
            "Face-only images cannot be used for pose comparison."
        )
    else:
        error = (
            f"Pose type mismatch: reference is {ref_label}, drawing is {draw_label}. "
            "Please upload similar types of images (e.g., full body vs full body)."
        )

    return {"compatible": False, "comparison_mode": None, "error": error}


# ---------------------------------------------------------------------------
# check_proportions
# ---------------------------------------------------------------------------

def check_proportions(keypoints: list) -> dict:
    """
    Compare limb lengths against ideal human anatomical ratios.
    Limbs whose endpoints are missing from the keypoint list are silently skipped.
    """
    try:
        th = _torso_height(keypoints)
    except KeyError:
        return {"torso_height": 0, "ratios": {}, "ideal_ranges": {}}

    if th < 1e-3:
        return {"torso_height": 0, "ratios": {}, "ideal_ranges": {}}

    def _safe_pt(name):
        kp = next((k for k in keypoints if k["name"] == name), None)
        return np.array([kp["x"], kp["y"]], dtype=float) if kp else None

    # Each entry: (ratio_key, ideal_range_key, point_a, point_b)
    limb_defs = [
        ("upper_arm_left",  "upper_arm", "LEFT_SHOULDER",  "LEFT_ELBOW"),
        ("upper_arm_right", "upper_arm", "RIGHT_SHOULDER", "RIGHT_ELBOW"),
        ("lower_arm_left",  "lower_arm", "LEFT_ELBOW",     "LEFT_WRIST"),
        ("lower_arm_right", "lower_arm", "RIGHT_ELBOW",    "RIGHT_WRIST"),
        ("upper_leg_left",  "upper_leg", "LEFT_HIP",       "LEFT_KNEE"),
        ("upper_leg_right", "upper_leg", "RIGHT_HIP",      "RIGHT_KNEE"),
        ("lower_leg_left",  "lower_leg", "LEFT_KNEE",      "LEFT_ANKLE"),
        ("lower_leg_right", "lower_leg", "RIGHT_KNEE",     "RIGHT_ANKLE"),
    ]

    ratios       = {}
    ideal_ranges = {}
    for key, ideal_key, a_name, b_name in limb_defs:
        a = _safe_pt(a_name)
        b = _safe_pt(b_name)
        if a is None or b is None:
            continue   # skip limbs with missing endpoints
        ratios[key]       = round(distance(a, b) / th, 4)
        ideal_ranges[key] = list(IDEAL_PROPORTIONS[ideal_key])

    return {
        "torso_height": round(th, 2),
        "ratios":       ratios,
        "ideal_ranges": ideal_ranges,
    }


# ---------------------------------------------------------------------------
# check_symmetry
# ---------------------------------------------------------------------------

def check_symmetry(keypoints: list) -> dict:
    """
    Compare left and right body halves.
    Each value is the absolute difference normalised by torso height.
    Parts whose joints are missing are silently skipped.
    """
    try:
        th = _torso_height(keypoints)
    except KeyError:
        return {}
    if th < 1e-3:
        return {}

    def _safe_pt(name):
        kp = next((k for k in keypoints if k["name"] == name), None)
        return np.array([kp["x"], kp["y"]], dtype=float) if kp else None

    result = {}

    ls = _safe_pt("LEFT_SHOULDER");  rs = _safe_pt("RIGHT_SHOULDER")
    lh = _safe_pt("LEFT_HIP");       rh = _safe_pt("RIGHT_HIP")
    le = _safe_pt("LEFT_ELBOW");     re = _safe_pt("RIGHT_ELBOW")
    lw = _safe_pt("LEFT_WRIST");     rw = _safe_pt("RIGHT_WRIST")
    lk = _safe_pt("LEFT_KNEE");      rk = _safe_pt("RIGHT_KNEE")
    la = _safe_pt("LEFT_ANKLE");     ra = _safe_pt("RIGHT_ANKLE")

    if ls is not None and rs is not None:
        result["shoulder_height"] = round(abs(ls[1] - rs[1]) / th, 4)
    if lh is not None and rh is not None:
        result["hip_height"] = round(abs(lh[1] - rh[1]) / th, 4)
    if ls is not None and le is not None and lw is not None and \
       rs is not None and re is not None and rw is not None:
        left_arm  = distance(ls, le) + distance(le, lw)
        right_arm = distance(rs, re) + distance(re, rw)
        result["arm_length"] = round(abs(left_arm - right_arm) / th, 4)
    if lh is not None and lk is not None and la is not None and \
       rh is not None and rk is not None and ra is not None:
        left_leg  = distance(lh, lk) + distance(lk, la)
        right_leg = distance(rh, rk) + distance(rk, ra)
        result["leg_length"] = round(abs(left_leg - right_leg) / th, 4)

    return result


# ---------------------------------------------------------------------------
# detect_errors
# ---------------------------------------------------------------------------

def detect_errors(keypoints: list) -> list:
    """
    Run all checks and return a list of error dicts for any deviation that
    exceeds the defined thresholds.

    Returns:
        [ { "joint": str, "message": str }, ... ]
    """
    errors = []

    try:
        th = _torso_height(keypoints)
        if th < 1e-3:
            return [{"joint": "torso", "message": "Torso too small to analyse — pose may be incomplete"}]

        ls = _pt(keypoints, "LEFT_SHOULDER");  rs = _pt(keypoints, "RIGHT_SHOULDER")
        le = _pt(keypoints, "LEFT_ELBOW");     re = _pt(keypoints, "RIGHT_ELBOW")
        lw = _pt(keypoints, "LEFT_WRIST");     rw = _pt(keypoints, "RIGHT_WRIST")
        lh = _pt(keypoints, "LEFT_HIP");       rh = _pt(keypoints, "RIGHT_HIP")
        lk = _pt(keypoints, "LEFT_KNEE");      rk = _pt(keypoints, "RIGHT_KNEE")
        la = _pt(keypoints, "LEFT_ANKLE");     ra = _pt(keypoints, "RIGHT_ANKLE")

        shoulder_mid = (ls + rs) / 2
        hip_mid      = (lh + rh) / 2

        # ── Joint angles ────────────────────────────────────────────────────
        joint_angles = {
            "left_elbow":  calculate_angle(ls, le, lw),
            "right_elbow": calculate_angle(rs, re, rw),
            "left_knee":   calculate_angle(lh, lk, la),
            "right_knee":  calculate_angle(rh, rk, ra),
        }

        # Torso lean: angle between torso vector and upward vertical [0, -1]
        torso_vec  = shoulder_mid - hip_mid
        vertical   = np.array([0.0, -1.0])
        torso_lean = float(np.degrees(
            np.arccos(np.clip(
                np.dot(torso_vec, vertical) / (np.linalg.norm(torso_vec) + 1e-8),
                -1.0, 1.0
            ))
        ))
        joint_angles["torso_lean"] = torso_lean

        for joint, angle in joint_angles.items():
            lo, hi = ANGLE_RANGES[joint]
            if not (lo <= angle <= hi):
                errors.append({
                    "joint":   joint,
                    "message": (
                        f"{joint.replace('_', ' ').title()} angle {angle:.1f}° "
                        f"is outside the ideal range [{lo}°–{hi}°]"
                    ),
                })

        # ── Proportions ─────────────────────────────────────────────────────
        prop_data = check_proportions(keypoints)
        for limb, ratio in prop_data["ratios"].items():
            lo, hi = prop_data["ideal_ranges"][limb]
            if not (lo <= ratio <= hi):
                errors.append({
                    "joint":   limb,
                    "message": (
                        f"{limb.replace('_', ' ').title()} proportion {ratio:.2f} "
                        f"is outside the ideal range [{lo}–{hi}] relative to torso"
                    ),
                })

        # ── Symmetry ────────────────────────────────────────────────────────
        sym_data = check_symmetry(keypoints)
        for part, diff in sym_data.items():
            if diff > SYMMETRY_TOLERANCE:
                errors.append({
                    "joint":   part,
                    "message": (
                        f"Asymmetry in {part.replace('_', ' ')}: "
                        f"{diff * 100:.1f}% difference (threshold {SYMMETRY_TOLERANCE * 100:.0f}%)"
                    ),
                })

        # ── Center of gravity ───────────────────────────────────────────────
        segments = [shoulder_mid, hip_mid, (lk + rk) / 2, (la + ra) / 2]
        weights  = [0.40, 0.35, 0.15, 0.10]
        cog      = sum(w * s for w, s in zip(weights, segments))
        ankle_mid_x = (la[0] + ra[0]) / 2
        hip_width   = abs(lh[0] - rh[0])

        if abs(cog[0] - ankle_mid_x) > hip_width * 0.5:
            errors.append({
                "joint":   "center_of_gravity",
                "message": "Center of gravity is off-balance relative to the base of support",
            })

    except KeyError as e:
        errors.append({"joint": "unknown", "message": f"Missing keypoint: {e}"})

    return errors


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def analyze(keypoints: list, image_width: int = 0, image_height: int = 0) -> dict:
    """
    Run the full analysis pipeline and return a structured result.

    Returns:
        {
            "angles":      { joint: float },
            "proportions": { limb: float },
            "symmetry":    { part: float },
            "errors":      [ { "joint": str, "message": str } ],
            "center_of_gravity": { "x": float, "y": float, "balanced": bool }
        }
    """
    errors = []
    angles = {}
    cog    = {}

    try:
        ls = _pt(keypoints, "LEFT_SHOULDER");  rs = _pt(keypoints, "RIGHT_SHOULDER")
        le = _pt(keypoints, "LEFT_ELBOW");     re = _pt(keypoints, "RIGHT_ELBOW")
        lw = _pt(keypoints, "LEFT_WRIST");     rw = _pt(keypoints, "RIGHT_WRIST")
        lh = _pt(keypoints, "LEFT_HIP");       rh = _pt(keypoints, "RIGHT_HIP")
        lk = _pt(keypoints, "LEFT_KNEE");      rk = _pt(keypoints, "RIGHT_KNEE")
        la = _pt(keypoints, "LEFT_ANKLE");     ra = _pt(keypoints, "RIGHT_ANKLE")

        shoulder_mid = (ls + rs) / 2
        hip_mid      = (lh + rh) / 2

        # Joint angles
        angles["left_elbow"]  = round(calculate_angle(ls, le, lw), 2)
        angles["right_elbow"] = round(calculate_angle(rs, re, rw), 2)
        angles["left_knee"]   = round(calculate_angle(lh, lk, la), 2)
        angles["right_knee"]  = round(calculate_angle(rh, rk, ra), 2)

        torso_vec  = shoulder_mid - hip_mid
        vertical   = np.array([0.0, -1.0])
        angles["torso_lean"] = round(float(np.degrees(
            np.arccos(np.clip(
                np.dot(torso_vec, vertical) / (np.linalg.norm(torso_vec) + 1e-8),
                -1.0, 1.0
            ))
        )), 2)

        # Center of gravity
        segments = [shoulder_mid, hip_mid, (lk + rk) / 2, (la + ra) / 2]
        weights  = [0.40, 0.35, 0.15, 0.10]
        cog_pt   = sum(w * s for w, s in zip(weights, segments))
        ankle_mid_x = (la[0] + ra[0]) / 2
        hip_width   = abs(lh[0] - rh[0])
        cog = {
            "x":        round(float(cog_pt[0]), 2),
            "y":        round(float(cog_pt[1]), 2),
            "balanced": bool(abs(cog_pt[0] - ankle_mid_x) <= hip_width * 0.5),
        }

        errors = detect_errors(keypoints)

    except KeyError as e:
        errors = [{"joint": "unknown", "message": f"Missing keypoint: {e}"}]

    prop_data = {}
    sym_data  = {}
    try:
        prop_data = check_proportions(keypoints).get("ratios", {})
        sym_data  = check_symmetry(keypoints)
    except Exception:
        pass

    return {
        "angles":            angles,
        "proportions":       prop_data,
        "symmetry":          sym_data,
        "errors":            errors,
        "center_of_gravity": cog,
    }
