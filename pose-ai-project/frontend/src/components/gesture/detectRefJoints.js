/**
 * detectRefJoints.js
 *
 * Runs MediaPipe pose detection on a reference image URL and converts
 * the result into the normalised joint map used by poseAccuracy.js.
 *
 * MediaPipe landmark indices → joint keys:
 *   0  → nose
 *   11 → left_shoulder   12 → right_shoulder
 *   13 → left_elbow      14 → right_elbow
 *   15 → left_wrist      16 → right_wrist
 *   23 → left_hip        24 → right_hip
 *   25 → left_knee       26 → right_knee
 *   27 → left_ankle      28 → right_ankle
 */

import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// ── Shared model singleton ────────────────────────────────────────────────────
let _landmarkerPromise = null;

function getLandmarker() {
  if (!_landmarkerPromise) {
    _landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })();
  }
  return _landmarkerPromise;
}

// ── Index → joint key map ─────────────────────────────────────────────────────
const INDEX_TO_JOINT = {
   0: "nose",
  11: "left_shoulder",
  12: "right_shoulder",
  13: "left_elbow",
  14: "right_elbow",
  15: "left_wrist",
  16: "right_wrist",
  23: "left_hip",
  24: "right_hip",
  25: "left_knee",
  26: "right_knee",
  27: "left_ankle",
  28: "right_ankle",
};

/**
 * Detect pose joints from an image URL.
 * Returns a normalised joint map { nose: {x,y}, … } or null on failure.
 *
 * @param {string} imageUrl
 * @returns {Promise<Object|null>}
 */
export async function detectRefJoints(imageUrl) {
  // Load image
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload  = () => resolve(el);
    el.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    el.src = imageUrl;
  });

  // Run detection
  const landmarker = await getLandmarker();
  const result     = landmarker.detect(img);

  if (!result.landmarks?.length) {
    console.warn("[detectRefJoints] No pose detected in:", imageUrl);
    return null;
  }

  const lms = result.landmarks[0]; // first person

  // Convert to joint map
  const joints = {};
  for (const [idxStr, key] of Object.entries(INDEX_TO_JOINT)) {
    const lm = lms[Number(idxStr)];
    if (lm && (lm.visibility ?? 1) > 0.3) {
      joints[key] = { x: lm.x, y: lm.y };
    }
  }

  console.log("[detectRefJoints] Detected joints for", imageUrl, joints);
  return joints;
}
