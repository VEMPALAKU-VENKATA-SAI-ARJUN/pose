"""
recommender.py — P.O.S.E Reference Pose Recommender

Suggests similar reference poses based on a user's uploaded image.

Approach
--------
Each reference pose is described by a 10-dimensional vector of key joint
angles and a torso-lean value.  These are fast to compute from existing
keypoints (no extra ML model needed) and capture the essential shape of a pose.

Embedding dimensions (indices):
    0  left_elbow_angle
    1  right_elbow_angle
    2  left_knee_angle
    3  right_knee_angle
    4  torso_lean
    5  left_shoulder_raise   (shoulder-to-hip vertical ratio, left)
    6  right_shoulder_raise
    7  left_arm_extension    (wrist-to-shoulder horizontal spread, normalised)
    8  right_arm_extension
    9  hip_width_ratio       (hip width / torso height)

Similarity is cosine similarity between the user embedding and each reference.

Public API
----------
    build_embedding(keypoints)  -> list[float] | None
    recommend(keypoints, top_n) -> list[dict]
"""

import math
import numpy as np

# ---------------------------------------------------------------------------
# Embedding builder
# ---------------------------------------------------------------------------

def _pt(keypoints: list, name: str):
    """Return (x, y) for a named keypoint, or None if missing."""
    kp = next((k for k in keypoints if k["name"] == name), None)
    return (kp["x"], kp["y"]) if kp else None


def _angle(a, b, c) -> float:
    """Angle at B formed by A-B-C, in degrees."""
    if not (a and b and c):
        return 90.0   # neutral fallback
    ax, ay = a[0] - b[0], a[1] - b[1]
    cx, cy = c[0] - b[0], c[1] - b[1]
    dot    = ax * cx + ay * cy
    mag    = math.sqrt(ax*ax + ay*ay) * math.sqrt(cx*cx + cy*cy) + 1e-8
    return math.degrees(math.acos(max(-1.0, min(1.0, dot / mag))))


def _dist(a, b) -> float:
    if not (a and b):
        return 0.0
    return math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2)


def build_embedding(keypoints: list) -> list | None:
    """
    Build a 10-dim pose embedding from detected keypoints.
    Returns None if too few keypoints are present.
    """
    if not keypoints or len(keypoints) < 6:
        return None

    ls = _pt(keypoints, "LEFT_SHOULDER");  rs = _pt(keypoints, "RIGHT_SHOULDER")
    le = _pt(keypoints, "LEFT_ELBOW");     re = _pt(keypoints, "RIGHT_ELBOW")
    lw = _pt(keypoints, "LEFT_WRIST");     rw = _pt(keypoints, "RIGHT_WRIST")
    lh = _pt(keypoints, "LEFT_HIP");       rh = _pt(keypoints, "RIGHT_HIP")
    lk = _pt(keypoints, "LEFT_KNEE");      rk = _pt(keypoints, "RIGHT_KNEE")
    la = _pt(keypoints, "LEFT_ANKLE");     ra = _pt(keypoints, "RIGHT_ANKLE")

    # Torso height for normalisation
    torso = _dist(
        ((ls[0]+rs[0])/2, (ls[1]+rs[1])/2) if ls and rs else None,
        ((lh[0]+rh[0])/2, (lh[1]+rh[1])/2) if lh and rh else None,
    ) or 1.0

    # Torso lean: angle between torso vector and vertical
    torso_lean = 0.0
    if ls and rs and lh and rh:
        smid = ((ls[0]+rs[0])/2, (ls[1]+rs[1])/2)
        hmid = ((lh[0]+rh[0])/2, (lh[1]+rh[1])/2)
        dx, dy = smid[0]-hmid[0], smid[1]-hmid[1]
        torso_lean = math.degrees(math.atan2(abs(dx), abs(dy)+1e-8))

    # Shoulder raise: how high shoulder is relative to hip (normalised)
    l_shoulder_raise = ((lh[1] - ls[1]) / torso) if ls and lh else 0.5
    r_shoulder_raise = ((rh[1] - rs[1]) / torso) if rs and rh else 0.5

    # Arm extension: horizontal spread of wrist from shoulder (normalised)
    l_arm_ext = (abs(lw[0] - ls[0]) / torso) if lw and ls else 0.3
    r_arm_ext = (abs(rw[0] - rs[0]) / torso) if rw and rs else 0.3

    # Hip width ratio
    hip_w = (_dist(lh, rh) / torso) if lh and rh else 0.4

    vec = [
        _angle(ls, le, lw) / 180.0,   # 0 — left elbow (normalised 0–1)
        _angle(rs, re, rw) / 180.0,   # 1 — right elbow
        _angle(lh, lk, la) / 180.0,   # 2 — left knee
        _angle(rh, rk, ra) / 180.0,   # 3 — right knee
        min(torso_lean / 45.0, 1.0),  # 4 — torso lean (0=upright, 1=45°)
        min(max(l_shoulder_raise, 0), 1.5) / 1.5,  # 5
        min(max(r_shoulder_raise, 0), 1.5) / 1.5,  # 6
        min(l_arm_ext, 1.5) / 1.5,    # 7
        min(r_arm_ext, 1.5) / 1.5,    # 8
        min(hip_w, 1.0),               # 9
    ]
    return vec


# ---------------------------------------------------------------------------
# Reference dataset
# ---------------------------------------------------------------------------
# Each entry: label, description, category, embedding (10-dim).
# Embeddings are hand-crafted to represent archetypal poses.
# Format: [l_elbow, r_elbow, l_knee, r_knee, torso_lean,
#          l_sh_raise, r_sh_raise, l_arm_ext, r_arm_ext, hip_w]

REFERENCE_POSES = [
    # ── Standing / neutral ────────────────────────────────────────────────────
    {
        "id": "standing_neutral",
        "label": "Standing — Neutral",
        "description": "Upright stance, arms at sides, weight evenly distributed.",
        "category": "standing",
        "tags": ["beginner", "anatomy", "full body"],
        "embedding": [0.95, 0.95, 0.95, 0.95, 0.02, 0.85, 0.85, 0.10, 0.10, 0.40],
    },
    {
        "id": "standing_arms_out",
        "label": "Standing — Arms Extended",
        "description": "T-pose: arms fully extended horizontally, legs straight.",
        "category": "standing",
        "tags": ["anatomy", "symmetry", "full body"],
        "embedding": [0.98, 0.98, 0.98, 0.98, 0.02, 0.85, 0.85, 0.95, 0.95, 0.40],
    },
    {
        "id": "standing_contrapposto",
        "label": "Standing — Contrapposto",
        "description": "Weight on one leg, slight hip tilt, relaxed arm.",
        "category": "standing",
        "tags": ["figure drawing", "dynamic", "full body"],
        "embedding": [0.85, 0.75, 0.95, 0.80, 0.08, 0.90, 0.80, 0.15, 0.25, 0.42],
    },
    {
        "id": "standing_one_arm_raised",
        "label": "Standing — One Arm Raised",
        "description": "One arm raised overhead, other at side.",
        "category": "standing",
        "tags": ["dynamic", "full body"],
        "embedding": [0.90, 0.95, 0.95, 0.95, 0.04, 1.0, 0.80, 0.30, 0.10, 0.40],
    },
    {
        "id": "standing_arms_crossed",
        "label": "Standing — Arms Crossed",
        "description": "Arms folded across chest, upright posture.",
        "category": "standing",
        "tags": ["character", "full body"],
        "embedding": [0.45, 0.45, 0.95, 0.95, 0.03, 0.85, 0.85, 0.05, 0.05, 0.40],
    },
    # ── Action / dynamic ──────────────────────────────────────────────────────
    {
        "id": "walking",
        "label": "Walking",
        "description": "Mid-stride walking pose, arms swinging naturally.",
        "category": "action",
        "tags": ["dynamic", "full body", "locomotion"],
        "embedding": [0.75, 0.85, 0.70, 0.85, 0.10, 0.88, 0.82, 0.35, 0.20, 0.38],
    },
    {
        "id": "running",
        "label": "Running",
        "description": "Full sprint, strong arm drive, knees lifted.",
        "category": "action",
        "tags": ["dynamic", "full body", "locomotion", "sport"],
        "embedding": [0.50, 0.65, 0.45, 0.70, 0.18, 0.92, 0.78, 0.55, 0.40, 0.35],
    },
    {
        "id": "jumping",
        "label": "Jumping",
        "description": "Mid-air jump, arms raised, knees bent.",
        "category": "action",
        "tags": ["dynamic", "full body", "sport"],
        "embedding": [0.60, 0.60, 0.55, 0.55, 0.05, 1.0, 1.0, 0.60, 0.60, 0.38],
    },
    {
        "id": "kicking",
        "label": "Kicking",
        "description": "High kick, one leg extended, arms for balance.",
        "category": "action",
        "tags": ["dynamic", "full body", "martial arts", "sport"],
        "embedding": [0.65, 0.75, 0.95, 0.30, 0.15, 0.88, 0.85, 0.40, 0.50, 0.35],
    },
    {
        "id": "punching",
        "label": "Punching",
        "description": "Forward punch, weight shifted, guard hand up.",
        "category": "action",
        "tags": ["dynamic", "upper body", "martial arts"],
        "embedding": [0.98, 0.45, 0.85, 0.85, 0.12, 0.88, 0.85, 0.90, 0.20, 0.40],
    },
    {
        "id": "throwing",
        "label": "Throwing",
        "description": "Overhead throw, torso rotated, arm extended back.",
        "category": "action",
        "tags": ["dynamic", "full body", "sport"],
        "embedding": [0.55, 0.90, 0.80, 0.85, 0.20, 0.95, 0.80, 0.20, 0.85, 0.38],
    },
    # ── Seated / crouching ────────────────────────────────────────────────────
    {
        "id": "sitting_upright",
        "label": "Sitting — Upright",
        "description": "Seated on a surface, back straight, hands on knees.",
        "category": "seated",
        "tags": ["seated", "full body", "anatomy"],
        "embedding": [0.90, 0.90, 0.55, 0.55, 0.04, 0.75, 0.75, 0.15, 0.15, 0.45],
    },
    {
        "id": "sitting_relaxed",
        "label": "Sitting — Relaxed",
        "description": "Casual seated pose, slight lean, one arm resting.",
        "category": "seated",
        "tags": ["seated", "character", "relaxed"],
        "embedding": [0.80, 0.70, 0.50, 0.52, 0.12, 0.72, 0.68, 0.20, 0.35, 0.45],
    },
    {
        "id": "crouching",
        "label": "Crouching",
        "description": "Low crouch, knees deeply bent, arms forward for balance.",
        "category": "seated",
        "tags": ["dynamic", "full body", "sport"],
        "embedding": [0.70, 0.70, 0.30, 0.30, 0.08, 0.65, 0.65, 0.45, 0.45, 0.50],
    },
    {
        "id": "squat",
        "label": "Squat",
        "description": "Deep squat, thighs parallel to ground, arms extended.",
        "category": "seated",
        "tags": ["sport", "full body", "strength"],
        "embedding": [0.95, 0.95, 0.28, 0.28, 0.05, 0.60, 0.60, 0.55, 0.55, 0.55],
    },
    # ── Upper body focus ──────────────────────────────────────────────────────
    {
        "id": "arms_raised_overhead",
        "label": "Arms Raised Overhead",
        "description": "Both arms fully raised, palms up, upright torso.",
        "category": "upper_body",
        "tags": ["upper body", "stretch", "anatomy"],
        "embedding": [0.92, 0.92, 0.95, 0.95, 0.03, 1.0, 1.0, 0.25, 0.25, 0.40],
    },
    {
        "id": "one_arm_side",
        "label": "One Arm to Side",
        "description": "One arm extended horizontally, other relaxed at side.",
        "category": "upper_body",
        "tags": ["upper body", "dynamic"],
        "embedding": [0.95, 0.95, 0.95, 0.95, 0.03, 0.85, 0.85, 0.90, 0.10, 0.40],
    },
    {
        "id": "hands_on_hips",
        "label": "Hands on Hips",
        "description": "Confident stance, hands resting on hips, elbows out.",
        "category": "upper_body",
        "tags": ["character", "full body", "confident"],
        "embedding": [0.55, 0.55, 0.95, 0.95, 0.03, 0.85, 0.85, 0.30, 0.30, 0.42],
    },
    {
        "id": "guard_stance",
        "label": "Guard Stance",
        "description": "Defensive guard, fists raised, slight forward lean.",
        "category": "upper_body",
        "tags": ["martial arts", "sport", "upper body"],
        "embedding": [0.50, 0.50, 0.85, 0.85, 0.15, 0.88, 0.88, 0.30, 0.30, 0.42],
    },
    # ── Leaning / tilted ──────────────────────────────────────────────────────
    {
        "id": "leaning_forward",
        "label": "Leaning Forward",
        "description": "Torso angled forward, arms back or at sides.",
        "category": "leaning",
        "tags": ["dynamic", "full body", "action"],
        "embedding": [0.85, 0.85, 0.80, 0.80, 0.45, 0.80, 0.80, 0.15, 0.15, 0.40],
    },
    {
        "id": "leaning_back",
        "label": "Leaning Back",
        "description": "Torso angled backward, arms forward for balance.",
        "category": "leaning",
        "tags": ["dynamic", "full body"],
        "embedding": [0.80, 0.80, 0.85, 0.85, 0.40, 0.75, 0.75, 0.40, 0.40, 0.40],
    },
    {
        "id": "leaning_side",
        "label": "Leaning to Side",
        "description": "Body tilted to one side, one arm reaching down.",
        "category": "leaning",
        "tags": ["dynamic", "full body", "stretch"],
        "embedding": [0.90, 0.70, 0.90, 0.90, 0.35, 0.95, 0.70, 0.10, 0.50, 0.40],
    },
    # ── Martial arts / combat ─────────────────────────────────────────────────
    {
        "id": "lunge_stance",
        "label": "Lunge Stance",
        "description": "Deep forward lunge, front knee bent, back leg straight.",
        "category": "martial_arts",
        "tags": ["martial arts", "sport", "full body", "dynamic"],
        "embedding": [0.75, 0.80, 0.45, 0.90, 0.12, 0.88, 0.85, 0.40, 0.30, 0.45],
    },
    {
        "id": "side_kick_chamber",
        "label": "Side Kick Chamber",
        "description": "Knee raised to hip height, preparing for side kick.",
        "category": "martial_arts",
        "tags": ["martial arts", "dynamic", "full body"],
        "embedding": [0.70, 0.70, 0.45, 0.90, 0.10, 0.88, 0.85, 0.35, 0.35, 0.38],
    },
    {
        "id": "spinning",
        "label": "Spinning / Turning",
        "description": "Mid-spin, arms pulled in, one foot pivoting.",
        "category": "martial_arts",
        "tags": ["dynamic", "full body", "martial arts", "dance"],
        "embedding": [0.55, 0.55, 0.75, 0.85, 0.20, 0.90, 0.90, 0.20, 0.20, 0.38],
    },
    # ── Dance / expressive ────────────────────────────────────────────────────
    {
        "id": "arabesque",
        "label": "Arabesque",
        "description": "One leg extended behind, torso forward, arms graceful.",
        "category": "dance",
        "tags": ["dance", "ballet", "full body", "expressive"],
        "embedding": [0.90, 0.85, 0.95, 0.20, 0.30, 0.92, 0.88, 0.60, 0.80, 0.35],
    },
    {
        "id": "arms_wide_expressive",
        "label": "Arms Wide — Expressive",
        "description": "Both arms spread wide, slight back arch, open posture.",
        "category": "dance",
        "tags": ["dance", "expressive", "full body"],
        "embedding": [0.95, 0.95, 0.92, 0.92, 0.08, 0.90, 0.90, 0.95, 0.95, 0.42],
    },
    # ── Lying / floor ─────────────────────────────────────────────────────────
    {
        "id": "lying_flat",
        "label": "Lying Flat",
        "description": "Supine position, arms at sides, legs straight.",
        "category": "floor",
        "tags": ["floor", "anatomy", "full body"],
        "embedding": [0.95, 0.95, 0.95, 0.95, 0.02, 0.50, 0.50, 0.10, 0.10, 0.40],
    },
    {
        "id": "lying_side",
        "label": "Lying on Side",
        "description": "Side-lying, one arm supporting head, legs slightly bent.",
        "category": "floor",
        "tags": ["floor", "relaxed", "full body"],
        "embedding": [0.60, 0.90, 0.80, 0.85, 0.88, 0.50, 0.50, 0.20, 0.10, 0.40],
    },
    # ── Kneeling ──────────────────────────────────────────────────────────────
    {
        "id": "kneeling_upright",
        "label": "Kneeling — Upright",
        "description": "Both knees on ground, torso upright, arms at sides.",
        "category": "kneeling",
        "tags": ["kneeling", "full body", "anatomy"],
        "embedding": [0.90, 0.90, 0.30, 0.30, 0.04, 0.80, 0.80, 0.12, 0.12, 0.45],
    },
    {
        "id": "kneeling_one_knee",
        "label": "One Knee Down",
        "description": "One knee on ground, other foot forward, upright torso.",
        "category": "kneeling",
        "tags": ["kneeling", "full body", "dynamic"],
        "embedding": [0.85, 0.85, 0.30, 0.75, 0.06, 0.82, 0.82, 0.18, 0.18, 0.42],
    },
]


# ---------------------------------------------------------------------------
# Cosine similarity
# ---------------------------------------------------------------------------

def _cosine(a: list, b: list) -> float:
    va = np.array(a, dtype=float)
    vb = np.array(b, dtype=float)
    denom = np.linalg.norm(va) * np.linalg.norm(vb)
    if denom < 1e-8:
        return 0.0
    return float(np.dot(va, vb) / denom)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def recommend(keypoints: list, top_n: int = 5) -> list:
    """
    Return the top_n most similar reference poses for the given keypoints.

    Args:
        keypoints: raw keypoint list from detect_keypoints()
        top_n:     number of results to return (default 5)

    Returns:
        List of dicts, sorted by similarity descending:
        [
            {
                "id":          str,
                "label":       str,
                "description": str,
                "category":    str,
                "tags":        list[str],
                "score":       float,   # 0.0–1.0 cosine similarity
            },
            ...
        ]
        Returns empty list if embedding cannot be built.
    """
    user_emb = build_embedding(keypoints)
    if user_emb is None:
        return []

    scored = []
    for pose in REFERENCE_POSES:
        sim = _cosine(user_emb, pose["embedding"])
        scored.append({
            "id":          pose["id"],
            "label":       pose["label"],
            "description": pose["description"],
            "category":    pose["category"],
            "tags":        pose["tags"],
            "score":       round(sim, 4),
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_n]
