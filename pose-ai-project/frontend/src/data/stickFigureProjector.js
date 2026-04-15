/**
 * stickFigureProjector.js
 *
 * Pure utility — no React dependency.
 * Converts jointAngles (bone rotations in degrees) into a named map of 16
 * normalised 2D keypoints using forward kinematics and planar projection.
 *
 * Req 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.3
 */

const DEG = Math.PI / 180;

// ── Bone hierarchy ────────────────────────────────────────────────────────────
// Each entry: { parent, offset: [x, y, z] }
// Offsets are LOCAL positions relative to the parent bone's origin.
// Root (Hips) has no parent; its world position is its offset from scene origin.
const BONE_DEFS = {
  Hips:          { parent: null,           offset: [0,     0.88,  0] },
  Spine:         { parent: "Hips",         offset: [0,     0.09,  0] },
  Spine1:        { parent: "Spine",        offset: [0,     0.22,  0] },
  Spine2:        { parent: "Spine1",       offset: [0,     0.22,  0] },
  Neck:          { parent: "Spine2",       offset: [0,     0.12,  0] },
  Head:          { parent: "Neck",         offset: [0,     0.12,  0] },
  LeftShoulder:  { parent: "Spine2",       offset: [0.22,  0.04,  0] },
  LeftArm:       { parent: "LeftShoulder", offset: [0,     0,     0] },
  LeftForeArm:   { parent: "LeftArm",      offset: [0,    -0.27,  0] },
  LeftHand:      { parent: "LeftForeArm",  offset: [0,    -0.24,  0] },
  RightShoulder: { parent: "Spine2",       offset: [-0.22, 0.04,  0] },
  RightArm:      { parent: "RightShoulder",offset: [0,     0,     0] },
  RightForeArm:  { parent: "RightArm",     offset: [0,    -0.27,  0] },
  RightHand:     { parent: "RightForeArm", offset: [0,    -0.24,  0] },
  LeftUpLeg:     { parent: "Hips",         offset: [0.10, -0.09,  0] },
  LeftLeg:       { parent: "LeftUpLeg",    offset: [0,    -0.38,  0] },
  LeftFoot:      { parent: "LeftLeg",      offset: [0,    -0.36,  0] },
  RightUpLeg:    { parent: "Hips",         offset: [-0.10,-0.09,  0] },
  RightLeg:      { parent: "RightUpLeg",   offset: [0,    -0.38,  0] },
  RightFoot:     { parent: "RightLeg",     offset: [0,    -0.36,  0] },
};

// Topological order (parents before children)
const BONE_ORDER = [
  "Hips",
  "Spine", "Spine1", "Spine2",
  "Neck", "Head",
  "LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
  "RightShoulder", "RightArm", "RightForeArm", "RightHand",
  "LeftUpLeg", "LeftLeg", "LeftFoot",
  "RightUpLeg", "RightLeg", "RightFoot",
];

// ── Landmark → bone mapping ───────────────────────────────────────────────────
const LANDMARK_BONE = {
  head:          "Head",
  neck:          "Neck",
  leftShoulder:  "LeftShoulder",
  rightShoulder: "RightShoulder",
  leftElbow:     "LeftForeArm",
  rightElbow:    "RightForeArm",
  leftWrist:     "LeftHand",
  rightWrist:    "RightHand",
  spine:         "Spine1",
  hips:          "Hips",
  leftHip:       "LeftUpLeg",
  rightHip:      "RightUpLeg",
  leftKnee:      "LeftLeg",
  rightKnee:     "RightLeg",
  leftAnkle:     "LeftFoot",
  rightAnkle:    "RightFoot",
};

// ── 3×3 rotation matrix helpers ───────────────────────────────────────────────

/** Rotation matrix around X axis */
function rotX(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [1, 0, 0,  0, c, -s,  0, s, c];
}

/** Rotation matrix around Y axis */
function rotY(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [c, 0, s,  0, 1, 0,  -s, 0, c];
}

/** Rotation matrix around Z axis */
function rotZ(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [c, -s, 0,  s, c, 0,  0, 0, 1];
}

/** Multiply two 3×3 matrices (row-major flat arrays) */
function matMul(A, B) {
  const R = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < 3; k++) {
        R[r * 3 + c] += A[r * 3 + k] * B[k * 3 + c];
      }
    }
  }
  return R;
}

/** Apply a 3×3 matrix to a [x, y, z] vector */
function matVec(M, v) {
  return [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ];
}

// ── FK pass ───────────────────────────────────────────────────────────────────

/**
 * Compute world-space 3D positions for every bone using forward kinematics.
 * @param {Object} jointAngles  { boneName: { x, y, z } } in degrees
 * @returns {Object}            { boneName: [wx, wy, wz] }
 */
function computeWorldPositions(jointAngles) {
  // worldPos[bone]   = [x, y, z] world position of the bone's origin
  // worldMat[bone]   = accumulated 3×3 rotation matrix at that bone
  const worldPos = {};
  const worldMat = {};

  for (const boneName of BONE_ORDER) {
    const def = BONE_DEFS[boneName];

    // Get user-supplied rotation (degrees), fall back to zero (Req 2.6)
    const angles = jointAngles[boneName] ?? {};
    const rx = (angles.x ?? 0) * DEG;
    const ry = (angles.y ?? 0) * DEG;
    const rz = (angles.z ?? 0) * DEG;

    // Local rotation matrix: Rz * Ry * Rx (Three.js default Euler order XYZ)
    const localRot = matMul(matMul(rotZ(rz), rotY(ry)), rotX(rx));

    if (def.parent === null) {
      // Root bone — world position is just its offset, no parent rotation
      worldPos[boneName] = [...def.offset];
      worldMat[boneName] = localRot;
    } else {
      const parentPos = worldPos[def.parent];
      const parentMat = worldMat[def.parent];

      // Rotate the local offset by the parent's accumulated world rotation
      const rotatedOffset = matVec(parentMat, def.offset);

      worldPos[boneName] = [
        parentPos[0] + rotatedOffset[0],
        parentPos[1] + rotatedOffset[1],
        parentPos[2] + rotatedOffset[2],
      ];

      // Accumulate rotation: parent world rotation × this bone's local rotation
      worldMat[boneName] = matMul(parentMat, localRot);
    }
  }

  return worldPos;
}

// ── Projection ────────────────────────────────────────────────────────────────

/**
 * Select the two projection axes for a given preset.
 * Returns { hAxis, vAxis } where each is 0 (X), 1 (Y), or 2 (Z).
 * Req 2.4, 9.1
 */
function getProjectionAxes(effectivePreset) {
  switch (effectivePreset) {
    case "side": return { hAxis: 2, vAxis: 1 }; // Z horizontal, Y vertical
    case "top":  return { hAxis: 0, vAxis: 2 }; // X horizontal, Z vertical
    case "front":
    case "low":
    default:     return { hAxis: 0, vAxis: 1 }; // X horizontal, Y vertical
  }
}

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Normalise an array of [h, v] projected points to [0, 1].
 * If the bounding box has zero size on an axis, all points map to 0.5 (Req 2.5).
 */
function normalise(projected) {
  let minH = Infinity, maxH = -Infinity;
  let minV = Infinity, maxV = -Infinity;

  for (const [h, v] of projected) {
    if (h < minH) minH = h;
    if (h > maxH) maxH = h;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const rangeH = maxH - minH;
  const rangeV = maxV - minV;

  return projected.map(([h, v]) => ({
    u: rangeH === 0 ? 0.5 : (h - minH) / rangeH,
    v: rangeV === 0 ? 0.5 : (v - minV) / rangeV,
  }));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Project joint angles into a named map of 16 normalised 2D keypoints.
 *
 * @param {Object}  jointAngles  { boneName: { x, y, z } } in degrees
 * @param {string}  preset       "front" | "side" | "top" | "low"
 * @param {boolean} lockToFront  if true, always use XY (front) projection
 * @returns {Object}             { head, neck, ... } each { u, v } in [0, 1]
 *
 * Req 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.3
 */
export function projectKeypoints(jointAngles, preset, lockToFront) {
  // Req 9.3: lockToFront overrides preset
  // Req 9.1 / 2.4: unknown preset falls back to "front"
  const effectivePreset = lockToFront ? "front" : (preset ?? "front");

  // Step 1: FK pass — compute world-space 3D positions
  const worldPositions = computeWorldPositions(jointAngles ?? {});

  // Step 2: Select projection axes
  const { hAxis, vAxis } = getProjectionAxes(effectivePreset);

  // Step 3: Project each landmark bone onto the chosen plane
  const landmarkNames = Object.keys(LANDMARK_BONE);
  const projected = landmarkNames.map(landmark => {
    const boneName = LANDMARK_BONE[landmark];
    const pos = worldPositions[boneName];
    return [pos[hAxis], pos[vAxis]];
  });

  // Step 4: Normalise to [0, 1] (Req 2.5)
  const normalised = normalise(projected);

  // Step 5: Build named result map (Req 2.3)
  const result = {};
  landmarkNames.forEach((landmark, i) => {
    result[landmark] = normalised[i];
  });

  return result;
}
