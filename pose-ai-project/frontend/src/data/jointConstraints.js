/**
 * jointConstraints.js  (v3 — strict anatomical enforcement)
 *
 * RULES:
 *   axes  — ONLY these axes accept user input. All others are HARD-LOCKED to 0.
 *   range — min/max in degrees. Values outside are clamped, never passed through.
 *   rest  — natural resting offset in degrees applied as a base before user input.
 *           This makes the default pose look human without any slider movement.
 */

export const CONSTRAINTS = {
  // ── Head ──────────────────────────────────────────────────────────────────
  Head: {
    axes:  ["x", "y", "z"],
    x:     { min: -40,  max:  40  },   // nod (chin down / up)
    y:     { min: -60,  max:  60  },   // turn left / right
    z:     { min: -30,  max:  30  },   // tilt ear to shoulder
    rest:  { x: 0, y: 0, z: 0 },
  },

  // ── Neck ──────────────────────────────────────────────────────────────────
  Neck: {
    axes:  ["x", "y"],
    x:     { min: -20,  max:  20  },
    y:     { min: -30,  max:  30  },
    rest:  { x: 0, y: 0, z: 0 },
  },

  // ── Spine (3 segments — progressively smaller range upward) ───────────────
  Spine: {
    axes:  ["x", "y", "z"],
    x:     { min: -25,  max:  25  },
    y:     { min: -25,  max:  25  },
    z:     { min: -15,  max:  15  },
    rest:  { x: 5, y: 0, z: 0 },      // slight forward lumbar curve
  },
  Spine1: {
    axes:  ["x", "y", "z"],
    x:     { min: -20,  max:  20  },
    y:     { min: -20,  max:  20  },
    z:     { min: -12,  max:  12  },
    rest:  { x: 3, y: 0, z: 0 },
  },
  Spine2: {
    axes:  ["x", "y", "z"],
    x:     { min: -15,  max:  15  },
    y:     { min: -15,  max:  15  },
    z:     { min: -10,  max:  10  },
    rest:  { x: 0, y: 0, z: 0 },
  },

  // ── Hips ──────────────────────────────────────────────────────────────────
  Hips: {
    axes:  ["x", "y", "z"],
    x:     { min: -30,  max:  30  },
    y:     { min: -45,  max:  45  },
    z:     { min: -20,  max:  20  },
    rest:  { x: 0, y: 0, z: 0 },
  },

  // ── Shoulder girdle (clavicle — small range, natural droop) ───────────────
  LeftShoulder: {
    axes:  ["z"],
    z:     { min:   0,  max:  15  },
    rest:  { x: 0, y: 0, z: 10 },     // natural droop
  },
  RightShoulder: {
    axes:  ["z"],
    z:     { min: -15,  max:   0  },
    rest:  { x: 0, y: 0, z: -10 },
  },

  // ── Upper arm (shoulder joint — ball & socket) ────────────────────────────
  LeftArm: {
    axes:  ["x", "y", "z"],
    x:     { min: -80,  max:  80  },   // forward / backward raise
    y:     { min: -90,  max:  90  },   // internal / external rotation
    z:     { min: -40,  max:  80  },   // abduction (away from body)
    rest:  { x: 0, y: 0, z: 15 },     // arms slightly out
  },
  RightArm: {
    axes:  ["x", "y", "z"],
    x:     { min: -80,  max:  80  },
    y:     { min: -90,  max:  90  },
    z:     { min: -80,  max:  40  },
    rest:  { x: 0, y: 0, z: -15 },
  },

  // ── Elbow — HINGE JOINT, X-AXIS ONLY ─────────────────────────────────────
  // Y and Z are anatomically impossible. Hard-locked to 0.
  LeftForeArm: {
    axes:  ["x"],                       // ONLY bend axis
    x:     { min: -150, max:   0  },   // 0 = straight, -150 = fully bent
    rest:  { x: -10, y: 0, z: 0 },    // slight natural bend
  },
  RightForeArm: {
    axes:  ["x"],
    x:     { min: -150, max:   0  },
    rest:  { x: -10, y: 0, z: 0 },
  },

  // ── Wrist ─────────────────────────────────────────────────────────────────
  LeftHand: {
    axes:  ["x", "z"],
    x:     { min: -70,  max:  70  },   // flex / extend
    z:     { min: -25,  max:  25  },   // radial / ulnar deviation
    rest:  { x: 0, y: 0, z: 0 },
  },
  RightHand: {
    axes:  ["x", "z"],
    x:     { min: -70,  max:  70  },
    z:     { min: -25,  max:  25  },
    rest:  { x: 0, y: 0, z: 0 },
  },

  // ── Hip joint (ball & socket) ─────────────────────────────────────────────
  LeftUpLeg: {
    axes:  ["x", "y", "z"],
    x:     { min: -90,  max:  90  },   // flex / extend
    y:     { min: -45,  max:  45  },   // internal / external rotation
    z:     { min: -45,  max:  30  },   // abduction / adduction
    rest:  { x: 0, y: 0, z: 5 },      // slight outward stance
  },
  RightUpLeg: {
    axes:  ["x", "y", "z"],
    x:     { min: -90,  max:  90  },
    y:     { min: -45,  max:  45  },
    z:     { min: -30,  max:  45  },
    rest:  { x: 0, y: 0, z: -5 },
  },

  // ── Knee — HINGE JOINT, X-AXIS ONLY ──────────────────────────────────────
  // Knees cannot bend sideways or twist. Hard-locked Y and Z.
  LeftLeg: {
    axes:  ["x"],
    x:     { min:   0, max: 140 },   // 0 = straight, +140 = fully bent backward
    rest:  { x: 5, y: 0, z: 0 },
  },
  RightLeg: {
    axes:  ["x"],
    x:     { min:   0, max: 140 },
    rest:  { x: 5, y: 0, z: 0 },
  },

  // ── Ankle ─────────────────────────────────────────────────────────────────
  LeftFoot: {
    axes:  ["x", "z"],
    x:     { min: -40,  max:  30  },   // plantar / dorsi flexion
    z:     { min: -20,  max:  20  },   // inversion / eversion
    rest:  { x: 0, y: 0, z: 0 },
  },
  RightFoot: {
    axes:  ["x", "z"],
    x:     { min: -40,  max:  30  },
    z:     { min: -20,  max:  20  },
    rest:  { x: 0, y: 0, z: 0 },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Clamp a user-supplied degree value for a joint+axis.
 * Returns 0 for any axis that is NOT in the joint's axes list (hard lock).
 */
export function clampAngle(boneName, axis, valueDeg) {
  const c = CONSTRAINTS[boneName];
  if (!c) return valueDeg;
  if (!c.axes.includes(axis)) return 0;   // hard lock
  const range = c[axis];
  if (!range) return 0;
  return Math.max(range.min, Math.min(range.max, valueDeg));
}

/**
 * Return { min, max } for a controllable axis, or null if the axis is locked.
 * Used by the UI to decide whether to render a slider.
 */
export function getRange(boneName, axis) {
  const c = CONSTRAINTS[boneName];
  if (!c) return { min: -180, max: 180 };
  if (!c.axes.includes(axis)) return null;   // null = locked, hide slider
  return c[axis] ?? { min: -180, max: 180 };
}

/**
 * Return the natural rest offset for a bone (in degrees).
 * Applied as a base in PoseScene before adding user input.
 */
export function getRestOffset(boneName) {
  return CONSTRAINTS[boneName]?.rest ?? { x: 0, y: 0, z: 0 };
}
