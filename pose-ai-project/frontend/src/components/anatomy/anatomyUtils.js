/**
 * anatomyUtils.js  (v3 — anatomically correct construction)
 *
 * All shapes are built from actual landmark positions.
 * No axis-aligned boxes. No floating shapes.
 * Limbs connect seamlessly to torso via joint masses.
 *
 * Exported API:
 *   buildTorso(ls, rs, lh, rh)          → draws tapered quad
 *   buildPelvis(ls, rs, lh, rh)         → draws tilted wedge attached to hips
 *   buildLimb(ctx, a, b, wA, wB, ...)   → draws tapered 4-point polygon
 *   buildJoint(ctx, pt, r, ...)         → draws spherical joint mass
 *   drawSkeleton(ctx, landmarks, W, H)  → thin gesture lines
 *   drawBoxes(ctx, landmarks, W, H)     → full construction overlay
 */

// ── Landmark indices ──────────────────────────────────────────────────────────
export const LM = {
  NOSE:           0,
  LEFT_SHOULDER:  11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13, RIGHT_ELBOW:    14,
  LEFT_WRIST:     15, RIGHT_WRIST:    16,
  LEFT_HIP:       23, RIGHT_HIP:      24,
  LEFT_KNEE:      25, RIGHT_KNEE:     26,
  LEFT_ANKLE:     27, RIGHT_ANKLE:    28,
};

export const SKELETON_CONNECTIONS = [
  [LM.LEFT_SHOULDER,  LM.RIGHT_SHOULDER],
  [LM.LEFT_HIP,       LM.RIGHT_HIP],
  [LM.LEFT_SHOULDER,  LM.LEFT_ELBOW],
  [LM.LEFT_ELBOW,     LM.LEFT_WRIST],
  [LM.RIGHT_SHOULDER, LM.RIGHT_ELBOW],
  [LM.RIGHT_ELBOW,    LM.RIGHT_WRIST],
  [LM.LEFT_SHOULDER,  LM.LEFT_HIP],
  [LM.RIGHT_SHOULDER, LM.RIGHT_HIP],
  [LM.LEFT_HIP,       LM.LEFT_KNEE],
  [LM.LEFT_KNEE,      LM.LEFT_ANKLE],
  [LM.RIGHT_HIP,      LM.RIGHT_KNEE],
  [LM.RIGHT_KNEE,     LM.RIGHT_ANKLE],
];

// ── Core geometry ─────────────────────────────────────────────────────────────

export function getMidpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function getDistance(a, b) {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

export function getAngle(a, b) {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function toPixel(lm, W, H) {
  return { x: lm.x * W, y: lm.y * H };
}

export function getLM(landmarks, idx, threshold = 0.25) {
  const lm = landmarks[idx];
  if (!lm || (lm.visibility ?? 1) < threshold) return null;
  return lm;
}

/** Unit perpendicular to segment a→b (rotated 90° CCW) */
function perpUnit(a, b) {
  const angle = getAngle(a, b);
  return { dx: -Math.sin(angle), dy: Math.cos(angle) };
}

/** Lerp between two points */
function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ── buildLimb ─────────────────────────────────────────────────────────────────
/**
 * Draw a tapered limb as a 4-point polygon with slight barrel curve.
 * a = proximal joint (shoulder/hip), b = distal joint (elbow/knee)
 * wA = width at a (thicker), wB = width at b (thinner)
 */
export function buildLimb(ctx, a, b, wA, wB, fillColor, strokeColor, opacity = 1) {
  if (!a || !b) return;
  const len = getDistance(a, b);
  if (len < 3) return;

  const { dx, dy } = perpUnit(a, b);
  const hw1 = wA / 2;
  const hw2 = wB / 2;
  const mid  = lerp(a, b, 0.5);
  const bulge = len * 0.04;   // slight barrel

  const p1 = { x: a.x + dx * hw1, y: a.y + dy * hw1 };
  const p2 = { x: a.x - dx * hw1, y: a.y - dy * hw1 };
  const p3 = { x: b.x - dx * hw2, y: b.y - dy * hw2 };
  const p4 = { x: b.x + dx * hw2, y: b.y + dy * hw2 };
  const c1  = { x: mid.x + dx * (hw1 * 0.9 + bulge), y: mid.y + dy * (hw1 * 0.9 + bulge) };
  const c2  = { x: mid.x - dx * (hw1 * 0.9 + bulge), y: mid.y - dy * (hw1 * 0.9 + bulge) };

  ctx.save();
  ctx.globalAlpha = opacity;

  // Gradient along limb length
  const grd = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
  grd.addColorStop(0,   fillColor);
  grd.addColorStop(1,   fillColor.replace(/[\d.]+\)$/, v => String(Math.max(0, parseFloat(v) - 0.12)) + ")"));

  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.quadraticCurveTo(c1.x, c1.y, p4.x, p4.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.quadraticCurveTo(c2.x, c2.y, p2.x, p2.y);
  ctx.closePath();
  ctx.fillStyle   = grd;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth   = 1.4;
  ctx.lineJoin    = "round";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ── buildJoint ────────────────────────────────────────────────────────────────
/**
 * Draw a spherical joint mass with radial gradient and soft glow.
 */
export function buildJoint(ctx, pt, radius, fillColor, strokeColor, opacity = 1) {
  if (!pt) return;
  ctx.save();

  // Soft glow halo
  const glow = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius * 2.2);
  glow.addColorStop(0,   fillColor.replace(/[\d.]+\)$/, "0.30)"));
  glow.addColorStop(1,   "rgba(0,0,0,0)");
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius * 2.2, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Main sphere with highlight
  const sphere = ctx.createRadialGradient(
    pt.x - radius * 0.3, pt.y - radius * 0.3, radius * 0.05,
    pt.x, pt.y, radius
  );
  sphere.addColorStop(0,   "rgba(255,255,255,0.85)");
  sphere.addColorStop(0.4, fillColor);
  sphere.addColorStop(1,   fillColor.replace(/[\d.]+\)$/, v => String(Math.max(0, parseFloat(v) - 0.2)) + ")"));

  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
  ctx.fillStyle   = sphere;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth   = 1.2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ── buildTorso ────────────────────────────────────────────────────────────────
/**
 * Draw torso as a tapered quadrilateral using the 4 actual landmark positions.
 * Top edge = shoulder line, bottom edge = hip line.
 * Waist taper computed by insetting the hip corners toward the spine axis.
 */
export function buildTorso(ctx, ls, rs, lh, rh, opacity = 1) {
  if (!ls || !rs || !lh || !rh) return;

  const sMid = getMidpoint(ls, rs);
  const hMid = getMidpoint(lh, rh);

  // Waist: lerp 55% down from shoulder to hip, then inset 10% toward spine
  const waistT = 0.55;
  const inset  = 0.10;

  const wl = {
    x: ls.x + (lh.x - ls.x) * waistT + (sMid.x - ls.x) * inset,
    y: ls.y + (lh.y - ls.y) * waistT + (sMid.y - ls.y) * inset,
  };
  const wr = {
    x: rs.x + (rh.x - rs.x) * waistT + (sMid.x - rs.x) * inset,
    y: rs.y + (rh.y - rs.y) * waistT + (sMid.y - rs.y) * inset,
  };

  // 6-point polygon: ls → rs → wr → rh → lh → wl
  ctx.save();
  ctx.globalAlpha = opacity;

  const grd = ctx.createLinearGradient(sMid.x, sMid.y, hMid.x, hMid.y);
  grd.addColorStop(0,   "rgba(99,102,241,0.50)");
  grd.addColorStop(0.5, "rgba(99,102,241,0.32)");
  grd.addColorStop(1,   "rgba(139,92,246,0.42)");

  ctx.beginPath();
  ctx.moveTo(ls.x, ls.y);
  ctx.lineTo(rs.x, rs.y);
  ctx.lineTo(wr.x, wr.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.lineTo(lh.x, lh.y);
  ctx.lineTo(wl.x, wl.y);
  ctx.closePath();
  ctx.fillStyle   = grd;
  ctx.strokeStyle = "rgba(165,180,252,0.82)";
  ctx.lineWidth   = 1.8;
  ctx.lineJoin    = "round";
  ctx.fill();
  ctx.stroke();

  // Centre line (orientation guide)
  ctx.beginPath();
  ctx.moveTo(sMid.x, sMid.y);
  ctx.lineTo(hMid.x, hMid.y);
  ctx.strokeStyle = "rgba(199,210,254,0.30)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}

// ── buildPelvis ───────────────────────────────────────────────────────────────
/**
 * Draw pelvis as a wedge attached directly below the hip landmarks.
 * The top edge IS the hip line (lh → rh), so it connects seamlessly to the torso.
 * Tilts slightly opposite to the shoulder angle for anatomical realism.
 */
export function buildPelvis(ctx, ls, rs, lh, rh, opacity = 1) {
  if (!lh || !rh) return;

  const hipMid  = getMidpoint(lh, rh);
  const hipDist = getDistance(lh, rh);
  const hipAngle = getAngle(lh, rh);

  // Counter-tilt: pelvis tilts opposite to shoulder tilt
  const shoulderAngle = (ls && rs) ? getAngle(ls, rs) : hipAngle;
  const counterTilt   = (shoulderAngle - hipAngle) * 0.25;
  const pelvisAngle   = hipAngle + counterTilt;

  // Pelvis height ≈ 38% of hip width
  const pH = hipDist * 0.38;

  // Perpendicular to pelvis angle (pointing "down" from hip line)
  const perpAngle = pelvisAngle + Math.PI / 2;
  const perpX = Math.cos(perpAngle);
  const perpY = Math.sin(perpAngle);

  // Bottom corners: narrower than top (bucket shape)
  const botL = {
    x: lh.x + perpX * pH + (hipMid.x - lh.x) * 0.22,
    y: lh.y + perpY * pH + (hipMid.y - lh.y) * 0.22,
  };
  const botR = {
    x: rh.x + perpX * pH + (hipMid.x - rh.x) * 0.22,
    y: rh.y + perpY * pH + (hipMid.y - rh.y) * 0.22,
  };

  ctx.save();
  ctx.globalAlpha = opacity;

  const grd = ctx.createLinearGradient(hipMid.x, hipMid.y, hipMid.x + perpX * pH, hipMid.y + perpY * pH);
  grd.addColorStop(0, "rgba(139,92,246,0.48)");
  grd.addColorStop(1, "rgba(109,40,217,0.28)");

  ctx.beginPath();
  ctx.moveTo(lh.x, lh.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.lineTo(botR.x, botR.y);
  ctx.lineTo(botL.x, botL.y);
  ctx.closePath();
  ctx.fillStyle   = grd;
  ctx.strokeStyle = "rgba(196,181,253,0.78)";
  ctx.lineWidth   = 1.6;
  ctx.lineJoin    = "round";
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// ── Spine gesture line ────────────────────────────────────────────────────────

function drawSpine(ctx, ls, rs, lh, rh, nose, opacity) {
  const sMid = getMidpoint(ls, rs);
  const hMid = getMidpoint(lh, rh);
  const spineAngle = getAngle(sMid, hMid);
  const spineLen   = getDistance(sMid, hMid);
  const curvature  = spineLen * 0.08;
  const spineMid   = lerp(sMid, hMid, 0.5);
  const ctrl = {
    x: spineMid.x - Math.sin(spineAngle) * curvature,
    y: spineMid.y + Math.cos(spineAngle) * curvature,
  };

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = "rgba(251,191,36,0.92)";
  ctx.lineWidth   = 2.5;
  ctx.lineCap     = "round";
  ctx.setLineDash([6, 4]);
  ctx.shadowColor = "rgba(251,191,36,0.4)";
  ctx.shadowBlur  = 5;

  ctx.beginPath();
  if (nose) {
    ctx.moveTo(nose.x, nose.y);
    ctx.quadraticCurveTo(sMid.x, sMid.y, ctrl.x, ctrl.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, hMid.x, hMid.y);
  } else {
    ctx.moveTo(sMid.x, sMid.y);
    ctx.quadraticCurveTo(ctrl.x, ctrl.y, hMid.x, hMid.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ── drawSkeleton ──────────────────────────────────────────────────────────────

export function drawSkeleton(ctx, landmarks, W, H, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity * 0.55;
  ctx.strokeStyle = "rgba(186,230,253,0.70)";
  ctx.lineWidth   = 1.5;
  ctx.lineCap     = "round";

  for (const [ai, bi] of SKELETON_CONNECTIONS) {
    const a = getLM(landmarks, ai);
    const b = getLM(landmarks, bi);
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * W, a.y * H);
    ctx.lineTo(b.x * W, b.y * H);
    ctx.stroke();
  }

  ctx.globalAlpha = opacity;
  for (const idx of Object.values(LM)) {
    const lm = getLM(landmarks, idx);
    if (!lm) continue;
    const pt = toPixel(lm, W, H);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle   = "rgba(186,230,253,0.90)";
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

// ── drawBoxes — full construction overlay ─────────────────────────────────────

export function drawBoxes(ctx, landmarks, W, H, opacity = 1) {
  const g = (idx) => {
    const lm = getLM(landmarks, idx);
    return lm ? toPixel(lm, W, H) : null;
  };

  const ls = g(LM.LEFT_SHOULDER);  const rs = g(LM.RIGHT_SHOULDER);
  const lh = g(LM.LEFT_HIP);       const rh = g(LM.RIGHT_HIP);
  const le = g(LM.LEFT_ELBOW);     const re = g(LM.RIGHT_ELBOW);
  const lw = g(LM.LEFT_WRIST);     const rw = g(LM.RIGHT_WRIST);
  const lk = g(LM.LEFT_KNEE);      const rk = g(LM.RIGHT_KNEE);
  const la = g(LM.LEFT_ANKLE);     const ra = g(LM.RIGHT_ANKLE);
  const nose = g(LM.NOSE);

  if (!ls || !rs || !lh || !rh) return;

  // Scale all widths relative to torso width
  const torsoW = getDistance(ls, rs);
  const sc     = torsoW / 180;

  // Limb widths (proportional to torso)
  const uAW = 18 * sc;   // upper arm
  const lAW = 13 * sc;   // forearm
  const wW  =  9 * sc;   // wrist
  const thW = 22 * sc;   // thigh
  const caW = 16 * sc;   // calf
  const anW = 11 * sc;   // ankle

  // Joint radii
  const jShoulder = 9  * sc;
  const jElbow    = 6  * sc;
  const jWrist    = 4.5 * sc;
  const jHip      = 8  * sc;
  const jKnee     = 7  * sc;
  const jAnkle    = 5  * sc;

  // ── 1. Spine gesture line ─────────────────────────────────────────────────
  drawSpine(ctx, ls, rs, lh, rh, nose, opacity);

  // ── 2. Torso (tapered quad using actual landmark positions) ───────────────
  buildTorso(ctx, ls, rs, lh, rh, opacity * 0.92);

  // ── 3. Pelvis (wedge attached to hip line) ────────────────────────────────
  buildPelvis(ctx, ls, rs, lh, rh, opacity * 0.88);

  // ── 4. Tapered limbs ──────────────────────────────────────────────────────
  const aFill = "rgba(236,72,153,0.40)";  const aStr = "rgba(251,113,133,0.85)";
  const lFill = "rgba(245,158,11,0.40)";  const lStr = "rgba(252,211,77,0.85)";

  buildLimb(ctx, ls, le, uAW, lAW, aFill, aStr, opacity);
  buildLimb(ctx, le, lw, lAW, wW,  aFill, aStr, opacity);
  buildLimb(ctx, rs, re, uAW, lAW, aFill, aStr, opacity);
  buildLimb(ctx, re, rw, lAW, wW,  aFill, aStr, opacity);

  buildLimb(ctx, lh, lk, thW, caW, lFill, lStr, opacity);
  buildLimb(ctx, lk, la, caW, anW, lFill, lStr, opacity);
  buildLimb(ctx, rh, rk, thW, caW, lFill, lStr, opacity);
  buildLimb(ctx, rk, ra, caW, anW, lFill, lStr, opacity);

  // ── 5. Joint masses (drawn last — on top of everything) ───────────────────
  const jPurple = "rgba(165,180,252,0.92)";  const jPS = "rgba(99,102,241,0.80)";
  const jGold   = "rgba(252,211,77,0.88)";   const jGS = "rgba(245,158,11,0.78)";

  // Shoulders — largest, most prominent
  buildJoint(ctx, ls, jShoulder, jPurple, jPS, opacity);
  buildJoint(ctx, rs, jShoulder, jPurple, jPS, opacity);

  // Elbows
  buildJoint(ctx, le, jElbow, "rgba(196,181,253,0.88)", jPS, opacity);
  buildJoint(ctx, re, jElbow, "rgba(196,181,253,0.88)", jPS, opacity);

  // Wrists
  buildJoint(ctx, lw, jWrist, "rgba(221,214,254,0.80)", jPS, opacity);
  buildJoint(ctx, rw, jWrist, "rgba(221,214,254,0.80)", jPS, opacity);

  // Hips
  buildJoint(ctx, lh, jHip, jGold, jGS, opacity);
  buildJoint(ctx, rh, jHip, jGold, jGS, opacity);

  // Knees
  buildJoint(ctx, lk, jKnee, "rgba(253,230,138,0.88)", jGS, opacity);
  buildJoint(ctx, rk, jKnee, "rgba(253,230,138,0.88)", jGS, opacity);

  // Ankles
  buildJoint(ctx, la, jAnkle, "rgba(254,243,199,0.80)", jGS, opacity);
  buildJoint(ctx, ra, jAnkle, "rgba(254,243,199,0.80)", jGS, opacity);
}

/** API compatibility alias */
export function drawCylinders() {}
