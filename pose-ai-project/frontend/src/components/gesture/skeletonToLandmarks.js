/**
 * skeletonToLandmarks.js
 * Converts SkeletonBuilder joint positions into a MediaPipe-style
 * 33-point landmark array so PoseEvaluation can consume it directly.
 *
 * SkeletonBuilder joints (normalised 0-1 within the canvas):
 *   nose, left_shoulder, right_shoulder,
 *   left_elbow, right_elbow,
 *   left_wrist, right_wrist,
 *   left_hip, right_hip,
 *   left_knee, right_knee,
 *   left_ankle, right_ankle
 *
 * MediaPipe 33-point indices we care about:
 *   0  NOSE
 *   11 LEFT_SHOULDER   12 RIGHT_SHOULDER
 *   13 LEFT_ELBOW      14 RIGHT_ELBOW
 *   15 LEFT_WRIST      16 RIGHT_WRIST
 *   23 LEFT_HIP        24 RIGHT_HIP
 *   25 LEFT_KNEE       26 RIGHT_KNEE
 *   27 LEFT_ANKLE      28 RIGHT_ANKLE
 *
 * All other indices are filled with null (invisible).
 */

const JOINT_TO_INDEX = {
  nose:            0,
  left_shoulder:  11,
  right_shoulder: 12,
  left_elbow:     13,
  right_elbow:    14,
  left_wrist:     15,
  right_wrist:    16,
  left_hip:       23,
  right_hip:      24,
  left_knee:      25,
  right_knee:     26,
  left_ankle:     27,
  right_ankle:    28,
};

/**
 * @param {Object} joints  — { nose: {x,y}, left_shoulder: {x,y}, … }
 * @returns {Array}        — 33-element array of { x, y, z, visibility } | null
 */
export function skeletonToLandmarks(joints) {
  const landmarks = new Array(33).fill(null);

  for (const [jointName, idx] of Object.entries(JOINT_TO_INDEX)) {
    const pt = joints[jointName];
    if (pt && typeof pt.x === "number" && typeof pt.y === "number") {
      landmarks[idx] = {
        x:          pt.x,
        y:          pt.y,
        z:          0,
        visibility: 1,
      };
    }
  }

  return landmarks;
}

/**
 * Returns true if the joints object has enough points for a meaningful
 * comparison (at least 8 of the 13 expected joints placed).
 */
export function isSkeletonComplete(joints) {
  const placed = Object.values(joints).filter(
    pt => pt && typeof pt.x === "number"
  ).length;
  return placed >= 8;
}
