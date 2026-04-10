/**
 * referencePoses.js  (v4 — corrected axis convention)
 *
 * AXIS CONVENTION (critical):
 *   UpLeg (thigh) rotation.x:
 *     NEGATIVE = thigh swings FORWARD  (hip flexion — sitting, running stride)
 *     POSITIVE = thigh swings BACKWARD (hip extension — back leg in lunge)
 *
 *   Leg (knee) rotation.x:
 *     NEGATIVE = knee bends (shin swings backward)
 *     0        = leg straight
 *
 *   Arm rotation.x:
 *     NEGATIVE = arm raises FORWARD/UP
 *     POSITIVE = arm swings BACKWARD
 *
 *   Arm rotation.z (left):
 *     POSITIVE = arm moves away from body (abduction)
 *   Arm rotation.z (right):
 *     NEGATIVE = arm moves away from body (abduction)
 *
 * All values are USER INPUT added ON TOP of rest offsets in jointConstraints.js.
 */

export const POSES = {
  natural: {
    name: "Natural Stand",
    category: "basic",
    keywords: ["natural", "stand", "standing", "neutral", "idle", "default", "rest"],
    joints: {},
  },

  apose: {
    name: "A-Pose",
    category: "basic",
    keywords: ["a-pose", "apose", "a pose"],
    joints: {
      LeftArm:      { z:  30 },
      RightArm:     { z: -30 },
      LeftForeArm:  { x:   0 },
      RightForeArm: { x:   0 },
    },
  },

  sitting: {
    name: "Sitting",
    category: "basic",
    keywords: ["sit", "sitting", "seated", "chair"],
    joints: {
      Hips:         { x:  10 },
      Spine:        { x: -10 },
      LeftUpLeg:    { x: -80 },
      RightUpLeg:   { x: -80 },
      LeftLeg:      { x:  80 },   // positive = knee bends backward
      RightLeg:     { x:  80 },
      LeftArm:      { z:  10 },
      RightArm:     { z: -10 },
      LeftForeArm:  { x: -20 },
      RightForeArm: { x: -20 },
    },
  },

  running: {
    name: "Running",
    category: "dynamic",
    keywords: ["run", "running", "sprint", "jog"],
    joints: {
      Hips:         { x:  10, z:  4 },
      Spine:        { x: -10 },
      Spine1:       { x:  -8 },
      LeftUpLeg:    { x: -55 },
      LeftLeg:      { x:  20 },   // front knee slightly bent
      RightUpLeg:   { x:  38 },
      RightLeg:     { x:  60 },   // back knee bent
      LeftArm:      { x:  50, z:  10 },
      RightArm:     { x: -55, z: -10 },
      LeftForeArm:  { x: -60 },
      RightForeArm: { x: -70 },
    },
  },

  jumping: {
    name: "Jumping",
    category: "dynamic",
    keywords: ["jump", "jumping", "leap", "air"],
    joints: {
      Hips:         { x:  15 },
      Spine:        { x:  -8 },
      LeftUpLeg:    { x: -25 },
      RightUpLeg:   { x: -25 },
      LeftLeg:      { x:  40 },   // knees tuck up
      RightLeg:     { x:  40 },
      LeftArm:      { x: -75, z:  20 },
      RightArm:     { x: -75, z: -20 },
      LeftForeArm:  { x: -15 },
      RightForeArm: { x: -15 },
    },
  },

  punching: {
    name: "Punching",
    category: "dynamic",
    keywords: ["punch", "punching", "fight", "hit", "strike"],
    joints: {
      Hips:         { y:  22 },
      Spine:        { y: -12 },
      Spine1:       { y:  -8 },
      LeftUpLeg:    { x: -18, z:  12 },
      RightUpLeg:   { x:   8, z: -12 },
      LeftLeg:      { x:  15 },
      RightLeg:     { x:  10 },
      LeftArm:      { x: -28, z:  35 },
      RightArm:     { x: -75, z:  -8 },
      RightForeArm: { x:  -5 },
      LeftForeArm:  { x: -55 },
    },
  },

  raiseRightHand: {
    name: "Raise Right Hand",
    category: "gesture",
    keywords: ["raise right hand", "right hand up", "wave right"],
    joints: {
      RightArm:     { x: -75, z: -12 },
      RightForeArm: { x:  -5 },
      LeftArm:      { z:  -5 },
    },
  },

  raiseLeftHand: {
    name: "Raise Left Hand",
    category: "gesture",
    keywords: ["raise left hand", "left hand up", "wave left"],
    joints: {
      LeftArm:      { x: -75, z:  12 },
      LeftForeArm:  { x:  -5 },
      RightArm:     { z:   5 },
    },
  },

  armsOut: {
    name: "Arms Out",
    category: "gesture",
    keywords: ["arms out", "spread arms", "open arms", "wide", "t-pose"],
    joints: {
      LeftArm:      { z:  65 },
      RightArm:     { z: -65 },
      LeftForeArm:  { x:   0 },
      RightForeArm: { x:   0 },
    },
  },

  contrapposto: {
    name: "Contrapposto",
    category: "anatomy",
    keywords: ["contrapposto", "weight shift", "hip shift", "classical"],
    joints: {
      Hips:         { z:  10 },
      Spine:        { z:  -7, x: -3 },
      Spine1:       { z:  -4 },
      Spine2:       { z:   2 },
      LeftUpLeg:    { x:  -4, z: -8 },
      RightUpLeg:   { x:   4, z:  8 },
      LeftLeg:      { x:  10 },   // slight relaxed bend
      LeftArm:      { z:  12 },
      RightArm:     { z:  -5 },
      LeftForeArm:  { x: -12 },
      RightForeArm: { x: -20 },
    },
  },

  squat: {
    name: "Squat",
    category: "dynamic",
    keywords: ["squat", "squatting", "deep squat"],
    joints: {
      Hips:         { x:  20 },
      Spine:        { x: -15 },
      LeftUpLeg:    { x: -80 },
      RightUpLeg:   { x: -80 },
      LeftLeg:      { x: 110 },   // deeply bent
      RightLeg:     { x: 110 },
      LeftArm:      { x: -60, z:  10 },
      RightArm:     { x: -60, z: -10 },
      LeftForeArm:  { x:   0 },
      RightForeArm: { x:   0 },
    },
  },

  lunge: {
    name: "Lunge",
    category: "dynamic",
    keywords: ["lunge", "lunging", "step forward"],
    joints: {
      Hips:         { x:   5 },
      Spine:        { x:  -5 },
      LeftUpLeg:    { x: -60 },
      LeftLeg:      { x:  70 },   // front knee bent 90°
      RightUpLeg:   { x:  40 },
      RightLeg:     { x:  20 },   // back knee slightly bent
      LeftArm:      { x:  30, z:  15 },
      RightArm:     { x: -30, z: -15 },
    },
  },
};

export const POSE_LIST = Object.entries(POSES).map(([id, pose]) => ({ id, ...pose }));

/**
 * parseTextToPose — legacy preset-only matcher (kept for backward compat)
 */
export function parseTextToPose(text) {
  const lower = text.toLowerCase().trim();
  const sorted = Object.entries(POSES).sort(
    (a, b) => Math.max(...b[1].keywords.map(k => k.length))
            - Math.max(...a[1].keywords.map(k => k.length))
  );
  for (const [id, pose] of sorted) {
    for (const kw of pose.keywords) {
      if (lower.includes(kw)) return id;
    }
  }
  return null;
}

/**
 * parseTextToJoints — hybrid parser
 *
 * Strategy:
 *   1. Check if input matches a known preset keyword
 *   2. If yes, load that preset as the base
 *   3. Run the advanced rule engine on top of the base
 *   4. If no preset match and no rule match, return null
 *
 * Returns { joints, matchedRules, intensity, presetId } or null
 */
export async function parseTextToJoints(text) {
  const { parseTextToPoseAdvanced, hasAdvancedMatch } = await import("./poseRules.js");

  const presetId = parseTextToPose(text);
  const base     = presetId ? { ...POSES[presetId].joints } : {};
  const hasRules = hasAdvancedMatch(text);

  if (!presetId && !hasRules) return null;

  const result = parseTextToPoseAdvanced(text, base);
  return { ...result, presetId };
}
