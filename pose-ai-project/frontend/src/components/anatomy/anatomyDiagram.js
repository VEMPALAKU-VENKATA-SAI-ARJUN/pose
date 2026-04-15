/**
 * anatomyDiagram.js
 * Clean flat-color anatomy diagram renderer (Proko / Bridgman style).
 * Draws on a neutral background — no photo, no sketch lines.
 */

import { LM, getMidpoint, getDistance, getAngle, getLM, toPixel } from "./anatomyUtils";

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg:            "#1a1a2e",
  ribcage:       "#5b7fa6", ribcageS:  "#3d6090",
  abdomen:       "#4e7090", abdomenS:  "#365878",
  pelvis:        "#7a5fa8", pelvisS:   "#5a4090",
  deltoid:       "#8878b8", deltoidS:  "#6860a0",
  upperArm:      "#b86878", upperArmS: "#904858",
  forearm:       "#c87860", forearmS:  "#a05840",
  thigh:         "#b89040", thighS:    "#906820",
  calf:          "#a07830", calfS:     "#785818",
  head:          "#d4a878", headS:     "#b08858",
  neck:          "#c09868", neckS:     "#a07848",
  joint:         "#e8e8f0", jointS:    "#a0a0c0",
};

// ── Geometry ──────────────────────────────────────────────────────────────────

function perpUnit(a, b) {
  const a2 = getAngle(a, b);
  return { dx: -Math.sin(a2), dy: Math.cos(a2) };
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function rot(cx, cy, px, py, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: cx + px * c - py * s, y: cy + px * s + py * c };
}

// ── Draw primitives ───────────────────────────────────────────────────────────

function poly(ctx, pts, fill, stroke, lw = 2) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.strokeStyle = stroke;
  ctx.lineWidth = lw; ctx.lineJoin = "round";
  ctx.fill(); ctx.stroke();
}

function barrelQuad(ctx, tl, tr, br, bl, bulge, fill, stroke, lw = 2) {
  const mT = lerp(tl, tr, 0.5);
  const mB = lerp(bl, br, 0.5);
  const { dx, dy } = perpUnit(tl, tr);
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.quadraticCurveTo(mT.x - dx * bulge, mT.y - dy * bulge, tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.quadraticCurveTo(mB.x + dx * bulge, mB.y + dy * bulge, bl.x, bl.y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.strokeStyle = stroke;
  ctx.lineWidth = lw; ctx.lineJoin = "round";
  ctx.fill(); ctx.stroke();
}

function ellipseAt(ctx, cx, cy, rx, ry, angle, fill, stroke, lw = 1.5) {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, angle, 0, Math.PI * 2);
  ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = lw;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function taperedLimb(ctx, a, b, wA, wB, fill, stroke) {
  if (!a || !b || getDistance(a, b) < 4) return;
  const { dx, dy } = perpUnit(a, b);
  const hw1 = wA / 2, hw2 = wB / 2;
  const mid = lerp(a, b, 0.5);
  const bulge = getDistance(a, b) * 0.05;
  const p1 = { x: a.x + dx * hw1, y: a.y + dy * hw1 };
  const p2 = { x: a.x - dx * hw1, y: a.y - dy * hw1 };
  const p3 = { x: b.x - dx * hw2, y: b.y - dy * hw2 };
  const p4 = { x: b.x + dx * hw2, y: b.y + dy * hw2 };
  const c1 = { x: mid.x + dx * (hw1 * 0.9 + bulge), y: mid.y + dy * (hw1 * 0.9 + bulge) };
  const c2 = { x: mid.x - dx * (hw1 * 0.9 + bulge), y: mid.y - dy * (hw1 * 0.9 + bulge) };
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.quadraticCurveTo(c1.x, c1.y, p4.x, p4.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.quadraticCurveTo(c2.x, c2.y, p2.x, p2.y);
  ctx.closePath();
  ctx.fillStyle = fill; ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.8; ctx.lineJoin = "round";
  ctx.fill(); ctx.stroke();
}

function jointDot(ctx, pt, r) {
  if (!pt) return;
  ctx.beginPath();
  ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
  ctx.fillStyle = C.joint; ctx.strokeStyle = C.jointS; ctx.lineWidth = 1.5;
  ctx.fill(); ctx.stroke();
}

function label(ctx, text, x, y) {
  ctx.save();
  ctx.font = "bold 10px 'Segoe UI', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.restore();
}

// ── Main diagram renderer ─────────────────────────────────────────────────────

export function drawDiagram(ctx, landmarks, W, H, showLabels = true) {
  // Background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

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

  const torsoW = getDistance(ls, rs);
  const sMid   = getMidpoint(ls, rs);
  const hMid   = getMidpoint(lh, rh);
  const torsoH = getDistance(sMid, hMid);
  const hipDist = getDistance(lh, rh);

  const shoulderAngle = getAngle(ls, rs);
  const hipAngle      = getAngle(lh, rh);

  // Limb widths
  const uAW = torsoW * 0.115, lAW = torsoW * 0.082, wW = torsoW * 0.055;
  const thW = torsoW * 0.145, caW = torsoW * 0.100, anW = torsoW * 0.065;
  const jR  = torsoW * 0.038;

  // ── BACK LEGS (z > 0 = further) ──────────────────────────────────────────
  const lhZ = getLM(landmarks, LM.LEFT_HIP)?.z  ?? 0;
  const rhZ = getLM(landmarks, LM.RIGHT_HIP)?.z ?? 0;

  if (lhZ > rhZ) {
    // Left leg is further back
    if (lh && lk) taperedLimb(ctx, lh, lk, thW, caW, C.thigh,  C.thighS);
    if (lk && la) taperedLimb(ctx, lk, la, caW, anW, C.calf,   C.calfS);
  } else {
    if (rh && rk) taperedLimb(ctx, rh, rk, thW, caW, C.thigh,  C.thighS);
    if (rk && ra) taperedLimb(ctx, rk, ra, caW, anW, C.calf,   C.calfS);
  }

  // ── PELVIS ────────────────────────────────────────────────────────────────
  // Pelvis top edge IS the hip line — no gap between torso and pelvis
  const tilt = (shoulderAngle - hipAngle) * 0.25;
  const pA   = hipAngle + tilt;
  const pH   = hipDist * 0.38;
  const perpA = pA + Math.PI / 2;
  const pPX = Math.cos(perpA), pPY = Math.sin(perpA);

  const pbl = { x: lh.x + pPX * pH + (hMid.x - lh.x) * 0.22, y: lh.y + pPY * pH + (hMid.y - lh.y) * 0.22 };
  const pbr = { x: rh.x + pPX * pH + (hMid.x - rh.x) * 0.22, y: rh.y + pPY * pH + (hMid.y - rh.y) * 0.22 };

  poly(ctx, [lh, rh, pbr, pbl], C.pelvis, C.pelvisS, 2);
  ellipseAt(ctx, hMid.x, hMid.y, hipDist * 0.24, hipDist * 0.09, pA,
    "rgba(122,95,168,0.20)", "rgba(122,95,168,0.40)");
  if (showLabels) label(ctx, "PELVIS", hMid.x + pPX * pH * 0.5, hMid.y + pPY * pH * 0.5);

  // ── RIBCAGE ───────────────────────────────────────────────────────────────
  // Top edge = actual shoulder positions (ls, rs)
  // Bottom edge = 58% down toward hips, tapered to 80% of shoulder width
  const rcH  = torsoH * 0.58;
  const rcBW = torsoW * 0.42;

  // Bottom corners: move from shoulder toward hip by rcH, then inset
  const rcbl = {
    x: ls.x + (lh.x - ls.x) * (rcH / torsoH),
    y: ls.y + (lh.y - ls.y) * (rcH / torsoH),
  };
  const rcbr = {
    x: rs.x + (rh.x - rs.x) * (rcH / torsoH),
    y: rs.y + (rh.y - rs.y) * (rcH / torsoH),
  };
  // Inset bottom corners toward spine axis
  const rcSMid = getMidpoint(rcbl, rcbr);
  const rcInset = 0.08;
  const rcblI = { x: rcbl.x + (rcSMid.x - rcbl.x) * rcInset, y: rcbl.y + (rcSMid.y - rcbl.y) * rcInset };
  const rcbrI = { x: rcbr.x + (rcSMid.x - rcbr.x) * rcInset, y: rcbr.y + (rcSMid.y - rcbr.y) * rcInset };

  barrelQuad(ctx, ls, rs, rcbrI, rcblI, torsoW * 0.06, C.ribcage, C.ribcageS, 2);

  // Cross-section ellipse at mid-ribcage
  const rcMid = getMidpoint(getMidpoint(ls, rs), getMidpoint(rcblI, rcbrI));
  ellipseAt(ctx, rcMid.x, rcMid.y, rcBW * 0.88, rcBW * 0.22, shoulderAngle,
    "rgba(75,112,150,0.22)", "rgba(75,112,150,0.42)");

  // ── ABDOMEN ───────────────────────────────────────────────────────────────
  // Top edge = ribcage bottom, bottom edge = hip line
  const abBW = torsoW * 0.23;
  const abSMid = getMidpoint(rcblI, rcbrI);
  const abHMid = hMid;

  // Abdomen bottom corners: inset from hip landmarks toward hip midpoint
  const abbl = { x: lh.x + (hMid.x - lh.x) * 0.08, y: lh.y + (hMid.y - lh.y) * 0.08 };
  const abbr = { x: rh.x + (hMid.x - rh.x) * 0.08, y: rh.y + (hMid.y - rh.y) * 0.08 };

  poly(ctx, [rcblI, rcbrI, abbr, abbl], C.abdomen, C.abdomenS, 1.8);

  // Centre line
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(sMid.x, sMid.y);
  ctx.lineTo(hMid.x, hMid.y);
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();

  if (showLabels) {
    const rcLbl = getMidpoint(getMidpoint(ls, rs), rcMid);
    label(ctx, "RIBCAGE", rcLbl.x, rcLbl.y);
    const abLbl = getMidpoint(getMidpoint(rcblI, rcbrI), hMid);
    label(ctx, "ABDOMEN", abLbl.x, abLbl.y);
  }

  // ── BACK ARMS ─────────────────────────────────────────────────────────────
  const lsZ = getLM(landmarks, LM.LEFT_SHOULDER)?.z  ?? 0;
  const rsZ = getLM(landmarks, LM.RIGHT_SHOULDER)?.z ?? 0;

  if (lsZ > rsZ) {
    if (ls && le) taperedLimb(ctx, ls, le, uAW, lAW, C.upperArm, C.upperArmS);
    if (le && lw) taperedLimb(ctx, le, lw, lAW, wW,  C.forearm,  C.forearmS);
  } else {
    if (rs && re) taperedLimb(ctx, rs, re, uAW, lAW, C.upperArm, C.upperArmS);
    if (re && rw) taperedLimb(ctx, re, rw, lAW, wW,  C.forearm,  C.forearmS);
  }

  // ── HEAD + NECK ───────────────────────────────────────────────────────────
  if (nose) {
    const neckLen = getDistance(sMid, nose) * 0.38;
    const neckDir = getAngle(sMid, nose);
    const neckTop = {
      x: sMid.x + Math.cos(neckDir) * neckLen,
      y: sMid.y + Math.sin(neckDir) * neckLen,
    };
    taperedLimb(ctx, sMid, neckTop, torsoW * 0.18, torsoW * 0.15, C.neck, C.neckS);

    const headR = torsoW * 0.22;
    const headCx = nose.x;
    const headCy = nose.y;
    ellipseAt(ctx, headCx, headCy, headR, headR * 1.2, 0, C.head, C.headS, 2);
    if (showLabels) label(ctx, "HEAD", headCx, headCy);
  }

  // ── SHOULDER MASSES ───────────────────────────────────────────────────────
  const dR = torsoW * 0.115;
  ellipseAt(ctx, ls.x, ls.y, dR, dR * 0.88, 0, C.deltoid, C.deltoidS, 2);
  ellipseAt(ctx, rs.x, rs.y, dR, dR * 0.88, 0, C.deltoid, C.deltoidS, 2);
  if (showLabels) {
    label(ctx, "DELTOID", ls.x, ls.y - dR - 8);
    label(ctx, "DELTOID", rs.x, rs.y - dR - 8);
  }

  // ── FRONT ARMS ────────────────────────────────────────────────────────────
  if (lsZ <= rsZ) {
    if (ls && le) taperedLimb(ctx, ls, le, uAW, lAW, C.upperArm, C.upperArmS);
    if (le && lw) taperedLimb(ctx, le, lw, lAW, wW,  C.forearm,  C.forearmS);
  } else {
    if (rs && re) taperedLimb(ctx, rs, re, uAW, lAW, C.upperArm, C.upperArmS);
    if (re && rw) taperedLimb(ctx, re, rw, lAW, wW,  C.forearm,  C.forearmS);
  }

  // ── FRONT LEGS ────────────────────────────────────────────────────────────
  if (lhZ <= rhZ) {
    if (lh && lk) taperedLimb(ctx, lh, lk, thW, caW, C.thigh, C.thighS);
    if (lk && la) taperedLimb(ctx, lk, la, caW, anW, C.calf,  C.calfS);
  } else {
    if (rh && rk) taperedLimb(ctx, rh, rk, thW, caW, C.thigh, C.thighS);
    if (rk && ra) taperedLimb(ctx, rk, ra, caW, anW, C.calf,  C.calfS);
  }

  if (showLabels) {
    if (lk) label(ctx, "THIGH",  lh ? lerp(lh, lk, 0.5).x : lk.x, lh ? lerp(lh, lk, 0.5).y : lk.y);
    if (la) label(ctx, "CALF",   lk ? lerp(lk, la, 0.5).x : la.x, lk ? lerp(lk, la, 0.5).y : la.y);
    if (le) label(ctx, "BICEP",  ls ? lerp(ls, le, 0.5).x : le.x, ls ? lerp(ls, le, 0.5).y : le.y);
    if (lw) label(ctx, "FOREARM",le ? lerp(le, lw, 0.5).x : lw.x, le ? lerp(le, lw, 0.5).y : lw.y);
  }

  // ── JOINTS (top layer) ────────────────────────────────────────────────────
  [le, re, lk, rk].forEach(pt => jointDot(ctx, pt, jR));
  [lw, rw, la, ra].forEach(pt => jointDot(ctx, pt, jR * 0.75));
}
