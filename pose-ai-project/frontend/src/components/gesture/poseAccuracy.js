/**
 * poseAccuracy.js
 *
 * Compares two sets of normalised joint positions (0-1 range) and
 * produces a similarity score + per-joint feedback.
 *
 * Both refJoints and userJoints are objects of the form:
 *   { nose: {x, y}, left_shoulder: {x, y}, … }
 *
 * The comparison is angle-based (not raw Euclidean) so it is robust to
 * the user placing the skeleton at a different scale or position.
 */

// ── Angle triplets ────────────────────────────────────────────────────────────
// Each entry: { key, a, b, c, label }
// Angle is measured at joint b, between rays b→a and b→c.
const ANGLE_DEFS = [
  { key: "left_elbow",     a: "left_shoulder",  b: "left_elbow",    c: "left_wrist",    label: "Left Elbow"    },
  { key: "right_elbow",    a: "right_shoulder", b: "right_elbow",   c: "right_wrist",   label: "Right Elbow"   },
  { key: "left_shoulder",  a: "left_elbow",     b: "left_shoulder", c: "left_hip",      label: "Left Shoulder" },
  { key: "right_shoulder", a: "right_elbow",    b: "right_shoulder",c: "right_hip",     label: "Right Shoulder"},
  { key: "left_knee",      a: "left_hip",       b: "left_knee",     c: "left_ankle",    label: "Left Knee"     },
  { key: "right_knee",     a: "right_hip",      b: "right_knee",    c: "right_ankle",   label: "Right Knee"    },
  { key: "left_hip",       a: "left_shoulder",  b: "left_hip",      c: "left_knee",     label: "Left Hip"      },
  { key: "right_hip",      a: "right_shoulder", b: "right_hip",     c: "right_knee",    label: "Right Hip"     },
];

function calcAngle(joints, ai, bi, ci) {
  const a = joints[ai];
  const b = joints[bi];
  const c = joints[ci];
  if (!a || !b || !c) return null;

  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.sqrt((ba.x ** 2 + ba.y ** 2) * (bc.x ** 2 + bc.y ** 2));
  if (mag < 1e-6) return null;

  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

/**
 * Compare two joint maps and return a score + per-joint breakdown.
 *
 * @param {Object} refJoints   — reference pose joints (normalised 0-1)
 * @param {Object} userJoints  — user-built skeleton joints (normalised 0-1)
 * @returns {{ score: number, flaggedJoints: Set<string>, perJoint: Array }}
 */
export function compareJoints(refJoints, userJoints) {
  const perJoint = [];

  for (const { key, a, b, c, label } of ANGLE_DEFS) {
    const refAngle  = calcAngle(refJoints,  a, b, c);
    const userAngle = calcAngle(userJoints, a, b, c);

    if (refAngle == null || userAngle == null) continue;

    const diff = userAngle - refAngle;
    perJoint.push({
      key,
      label,
      refAngle:  Math.round(refAngle),
      userAngle: Math.round(userAngle),
      diff:      Math.round(diff),
      absDiff:   Math.abs(diff),
    });
  }

  let score = 100;
  if (perJoint.length > 0) {
    const avgErr = perJoint.reduce((s, d) => s + d.absDiff, 0) / perJoint.length;
    score = Math.max(0, Math.min(100, Math.round(100 - avgErr * (100 / 90))));
  }

  const flaggedJoints = new Set(
    perJoint.filter(d => d.absDiff > 20).map(d => d.key)
  );

  // Build per-joint error map: key → { absDiff, severity }
  const jointErrors = {};
  for (const d of perJoint) {
    jointErrors[d.key] = {
      absDiff:  d.absDiff,
      severity: d.absDiff > 35 ? "high" : d.absDiff > 20 ? "medium" : "good",
    };
  }

  return { score, flaggedJoints, perJoint, jointErrors, refJoints, userJoints };
}

/**
 * Turn per-joint comparison data into human-readable feedback cards.
 *
 * @param {Array}  perJoint — output from compareJoints
 * @param {number} score    — 0-100
 * @returns {Array} feedback items compatible with FeedbackPanel
 */
export function generateJointFeedback(perJoint, score) {
  const DIRECTIONS = {
    left_elbow:     d => d < 0 ? "Left elbow is too bent — try straightening it." : "Left elbow needs more bend.",
    right_elbow:    d => d < 0 ? "Right elbow is too bent — try straightening it." : "Right elbow needs more bend.",
    left_shoulder:  d => d < 0 ? "Left arm is too low — raise it slightly." : "Left arm is too high — lower it.",
    right_shoulder: d => d < 0 ? "Right arm is too low — raise it slightly." : "Right arm is too high — lower it.",
    left_knee:      d => d < 0 ? "Left knee is over-bent — straighten slightly." : "Left knee needs more bend.",
    right_knee:     d => d < 0 ? "Right knee is over-bent — straighten slightly." : "Right knee needs more bend.",
    left_hip:       d => d < 0 ? "Left hip angle is too closed." : "Left hip angle is too open.",
    right_hip:      d => d < 0 ? "Right hip angle is too closed." : "Right hip angle is too open.",
  };

  const flagged = perJoint.filter(d => d.absDiff > 20);

  if (!flagged.length) {
    return [{
      key:      "overall",
      message:  "Great pose accuracy — your skeleton closely matches the reference!",
      severity: "good",
    }];
  }

  return flagged.map(({ key, diff, refAngle, userAngle }) => ({
    key,
    message:   DIRECTIONS[key]?.(diff) ?? `${key.replace(/_/g, " ")} is off by ${Math.abs(diff)}°`,
    diff:      Math.round(diff),
    refAngle:  Math.round(refAngle),
    drawAngle: Math.round(userAngle),
    severity:  Math.abs(diff) > 35 ? "high" : "medium",
  }));
}
