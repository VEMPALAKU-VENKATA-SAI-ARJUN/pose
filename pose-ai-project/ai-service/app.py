"""
app.py  —  P.O.S.E Flask API

Endpoints
---------
GET  /health          — liveness check
POST /analyze         — single image: detect + analyse + correct
POST /compare         — two images: reference vs drawing comparison

Detection cases for /compare
-----------------------------
CASE 1: ref=detected,  draw=detected  → normal comparison
CASE 2: ref=detected,  draw=failed    → fallback: estimate drawing from reference
CASE 3: ref=failed,    draw=detected  → anatomy mode: compare drawing vs ideal model
CASE 4: ref=failed,    draw=failed    → hard error, return 422
"""

from flask import Flask, request, jsonify
from pose_detection    import detect_keypoints
from analysis_engine   import analyze, check_pose_completeness, detect_pose_type, check_pose_type_compatibility, prepare_for_comparison
from correction_engine import generate_corrected_pose
from comparison_engine import compare_poses
from fallback_engine   import estimate_pose_from_reference

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024   # 10 MB


# ── Helpers ───────────────────────────────────────────────────────────────────

def _safe_detect(file_storage) -> tuple[dict, bytes]:
    """
    Read a FileStorage object and run pose detection.
    Returns (result_dict, raw_bytes). Never raises.
    raw_bytes is kept for the fallback engine.
    """
    empty = {
        "keypoints": [], "image_width": 0, "image_height": 0,
        "is_sketch": False, "pose_detected": False, "confidence": 0.0,
    }
    if file_storage is None:
        return empty, b""
    raw = file_storage.read()
    return detect_keypoints(raw), raw


def _empty_analysis():
    return {
        "angles": {}, "proportions": {}, "symmetry": {},
        "errors": [{"joint": "pose", "message": "No pose detected in image"}],
        "center_of_gravity": {},
    }


def _empty_comparison(messages: list[str]) -> dict:
    return {
        "angle_diff": {}, "proportion_diff": {}, "symmetry_diff": {},
        "torso_lean_diff": {}, "major_errors": [], "feedback": messages,
    }


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ── POST /analyze — single image mode ────────────────────────────────────────

@app.route("/analyze", methods=["POST"])
def analyze_pose():
    """
    Accepts: multipart/form-data with field 'file'
    Returns: full analysis + correction JSON
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    detection, _ = _safe_detect(request.files["file"])
    keypoints    = detection["keypoints"]
    img_w        = detection["image_width"]
    img_h        = detection["image_height"]

    if not keypoints:
        return jsonify({
            "keypoints":           [],
            "analysis":            _empty_analysis(),
            "corrected_keypoints": {},
            "flagged_joints":      [],
            "corrections_applied": 0,
            "image_width":         img_w,
            "image_height":        img_h,
            "is_sketch":           detection.get("is_sketch", False),
            "pose_detected":       False,
            "confidence":          detection.get("confidence", 0.0),
        })

    try:
        analysis   = analyze(keypoints, img_w, img_h)
        correction = generate_corrected_pose(keypoints, errors=analysis["errors"])

        return jsonify({
            "keypoints": keypoints,
            "analysis": {
                "angles":            analysis["angles"],
                "proportions":       analysis["proportions"],
                "symmetry":          analysis["symmetry"],
                "errors":            analysis["errors"],
                "center_of_gravity": analysis.get("center_of_gravity", {}),
            },
            "corrected_keypoints": correction["corrected_keypoints"],
            "flagged_joints":      correction["flagged_joints"],
            "corrections_applied": correction["corrections_applied"],
            "image_width":         img_w,
            "image_height":        img_h,
            "is_sketch":           detection.get("is_sketch", False),
            "pose_detected":       True,
            "confidence":          detection.get("confidence", 0.0),
        })

    except Exception:
        app.logger.exception("Error in /analyze")
        return jsonify({"error": "Internal server error"}), 500


# ── POST /compare — reference vs drawing mode ─────────────────────────────────

@app.route("/compare", methods=["POST"])
def compare_pose():
    """
    Accepts: multipart/form-data with 'reference_image' and 'drawing_image'

    Decision logic:
        CASE 1 — both detected      → normal comparison
        CASE 2 — only ref detected  → estimate drawing from reference (fallback)
        CASE 3 — only draw detected → compare drawing vs ideal anatomy model
        CASE 4 — neither detected   → 422 error, ask user for clearer images
    """
    ref_file  = request.files.get("reference_image")
    draw_file = request.files.get("drawing_image")

    if ref_file is None or draw_file is None:
        return jsonify({
            "error": "Both 'reference_image' and 'drawing_image' fields are required"
        }), 400

    ref_det,  ref_bytes  = _safe_detect(ref_file)
    draw_det, draw_bytes = _safe_detect(draw_file)

    ref_detected  = ref_det["pose_detected"]
    draw_detected = draw_det["pose_detected"]

    ref_kp  = ref_det["keypoints"]
    draw_kp = draw_det["keypoints"]

    # ── CASE 4: both failed ───────────────────────────────────────────────────
    if not ref_detected and not draw_detected:
        return jsonify({
            "error": (
                "Pose could not be detected in both images. "
                "Please upload clearer images or use manual mode."
            ),
            "detection_case":        4,
            "reference_detected":    False,
            "drawing_detected":      False,
            "reference_confidence":  ref_det.get("confidence", 0.0),
            "drawing_confidence":    draw_det.get("confidence", 0.0),
        }), 422

    used_fallback    = False
    anatomy_fallback = False   # Case 3: drawing vs ideal anatomy

    # ── Determine detection case number (needed for error responses below) ────
    if ref_detected and draw_detected:
        detection_case = 1
    elif ref_detected and not draw_detected:
        detection_case = 2
    elif not ref_detected and draw_detected:
        detection_case = 3
    else:
        detection_case = 4

    # ── Pose type detection + compatibility check ────────────────────────────
    # Run BEFORE completeness — a face image should get a clear "type mismatch"
    # error, not a confusing "incomplete pose" error.
    ref_pose_type  = detect_pose_type(ref_kp,  ref_det["image_width"],  ref_det["image_height"])  if ref_kp  else {"pose_type": "unknown"}
    draw_pose_type = detect_pose_type(draw_kp, draw_det["image_width"], draw_det["image_height"]) if draw_kp else {"pose_type": "unknown"}

    type_compat = check_pose_type_compatibility(
        ref_pose_type["pose_type"],
        draw_pose_type["pose_type"],
    )

    if not type_compat["compatible"]:
        return jsonify({
            "error":                  type_compat["error"],
            "pose_type_mismatch":     True,
            "reference_pose_type":    ref_pose_type["pose_type"],
            "drawing_pose_type":      draw_pose_type["pose_type"],
            "reference_spread_ratio": ref_pose_type.get("spread_ratio", 0),
            "drawing_spread_ratio":   draw_pose_type.get("spread_ratio", 0),
            "detection_case":         detection_case,
            "reference_detected":     ref_detected,
            "drawing_detected":       draw_detected,
            "reference_confidence":   ref_det.get("confidence", 0.0),
            "drawing_confidence":     draw_det.get("confidence", 0.0),
        }), 422

    # ── Completeness validation ───────────────────────────────────────────────
    # Only runs when pose types are compatible — checks that enough joints are
    # present for a meaningful comparison.
    ref_completeness  = check_pose_completeness(ref_kp)  if ref_kp  else None
    draw_completeness = check_pose_completeness(draw_kp) if draw_kp else None

    ref_upper_body  = ref_completeness  and ref_completeness["is_upper_body"]
    draw_upper_body = draw_completeness and draw_completeness["is_upper_body"]
    upper_body_mode = ref_upper_body or draw_upper_body

    ref_incomplete  = (
        ref_completeness is not None
        and not ref_completeness["is_complete"]
        and not ref_completeness["is_upper_body"]
    )
    draw_incomplete = (
        draw_completeness is not None
        and not draw_completeness["is_complete"]
        and not draw_completeness["is_upper_body"]
    )

    if ref_incomplete or draw_incomplete:
        which = []
        if ref_incomplete:  which.append("reference")
        if draw_incomplete: which.append("drawing")
        return jsonify({
            "error": (
                "Pose mismatch: one or more images do not contain a full body pose. "
                "Please upload full body images for accurate comparison."
            ),
            "incomplete_images":       which,
            "reference_completeness":  ref_completeness,
            "drawing_completeness":    draw_completeness,
            "detection_case":          detection_case,
            "reference_detected":      ref_detected,
            "drawing_detected":        draw_detected,
            "reference_confidence":    ref_det.get("confidence", 0.0),
            "drawing_confidence":      draw_det.get("confidence", 0.0),
        }), 422


    # ── CASE 2: ref detected, drawing failed → estimate drawing ───────────────
    if ref_detected and not draw_detected:
        fallback = estimate_pose_from_reference(ref_kp, draw_bytes)
        if fallback["keypoints"]:
            draw_kp       = fallback["keypoints"]
            used_fallback = True

    # ── CASE 3: drawing detected, ref failed → anatomy mode ──────────────────
    if not ref_detected and draw_detected:
        anatomy_fallback = True

    # ── Per-image analysis ────────────────────────────────────────────────────
    ref_analysis  = (
        analyze(ref_kp,  ref_det["image_width"],  ref_det["image_height"])
        if ref_kp else _empty_analysis()
    )
    draw_analysis = (
        analyze(draw_kp, draw_det["image_width"], draw_det["image_height"])
        if draw_kp else _empty_analysis()
    )

    # ── Comparison ────────────────────────────────────────────────────────────
    if ref_kp and draw_kp:
        # Cases 1 and 2 (with successful fallback)
        comparison = compare_poses(ref_kp, draw_kp)
        correction = generate_corrected_pose(draw_kp, reference_kp=ref_kp)

        if used_fallback:
            comparison["feedback"].insert(
                0, "Pose estimated from reference due to drawing detection failure"
            )

    elif anatomy_fallback and draw_kp:
        # Case 3: compare drawing against ideal anatomy, no reference
        comparison = _empty_comparison([
            "Reference not detected — comparing drawing against standard anatomy model"
        ])
        correction = generate_corrected_pose(
            draw_kp,
            reference_kp=None,
            errors=draw_analysis.get("errors", []),
        )

    else:
        # Fallback produced nothing (edge case)
        comparison = _empty_comparison(["Could not produce a comparison for these images"])
        correction = {"corrected_keypoints": {}, "flagged_joints": [],
                      "corrections_applied": 0, "mode": "none"}

    # ── Normalized keypoints for overlay alignment ────────────────────────────
    # Normalized = center → rotate → scale (torso = 1), shared coordinate space.
    # Used by the frontend OverlayCanvas for aligned skeleton comparison.
    norm_ref      = prepare_for_comparison(ref_kp)  if ref_kp  else []
    norm_draw     = prepare_for_comparison(draw_kp) if draw_kp else []
    # corrected_keypoints is a dict {NAME: {x,y}} — convert to list first
    corr_kp_list  = [
        {"name": k, "x": v["x"], "y": v["y"], "score": 1.0}
        for k, v in (correction.get("corrected_keypoints") or {}).items()
    ]
    norm_corrected = prepare_for_comparison(corr_kp_list) if corr_kp_list else []

    return jsonify({
        "reference_keypoints":   ref_kp,
        "drawing_keypoints":     draw_kp,
        "reference_analysis":    ref_analysis,
        "drawing_analysis":      draw_analysis,
        "comparison":            comparison,
        "corrected_keypoints":   correction["corrected_keypoints"],
        "flagged_joints":        correction["flagged_joints"],
        "corrections_applied":   correction["corrections_applied"],
        "correction_mode":       correction["mode"],
        "normalized_reference":  norm_ref,
        "normalized_drawing":    norm_draw,
        "normalized_corrected":  norm_corrected,
        "used_fallback":         used_fallback,
        "anatomy_fallback":      anatomy_fallback,
        "upper_body_mode":       upper_body_mode,
        "detection_case":        detection_case,
        "reference_pose_type":   ref_pose_type["pose_type"],
        "drawing_pose_type":     draw_pose_type["pose_type"],
        "comparison_mode":       type_compat["comparison_mode"],
        "reference_detected":    ref_detected,
        "drawing_detected":      draw_detected,
        "reference_confidence":  ref_det.get("confidence", 0.0),
        "drawing_confidence":    draw_det.get("confidence", 0.0),
        "reference_image_width":  ref_det["image_width"],
        "reference_image_height": ref_det["image_height"],
        "drawing_image_width":    draw_det["image_width"],
        "drawing_image_height":   draw_det["image_height"],
        "reference_is_sketch":    ref_det.get("is_sketch", False),
        "drawing_is_sketch":      draw_det.get("is_sketch", False),
    })


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large. Maximum is 10 MB."}), 413


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
