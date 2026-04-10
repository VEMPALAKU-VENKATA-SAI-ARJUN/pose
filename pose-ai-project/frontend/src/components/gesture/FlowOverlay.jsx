/**
 * FlowOverlay.jsx
 * Draws gesture drawing fundamentals on top of a pose image:
 *   - Line of Action  : smooth bezier from head → spine → ankle
 *   - Rhythm Lines    : directional flow arrows for arms and legs
 *   - Balance Line    : vertical plumb line from centre of gravity
 *
 * Uses MediaPipe landmark indices (33-point model).
 * Falls back to estimated positions when keypoints are unavailable.
 *
 * Props:
 *   landmarks        — array[33] of { x, y, visibility } (normalised 0-1) or null
 *   imageWidth       — rendered image width in px
 *   imageHeight      — rendered image height in px
 *   showAction       — bool
 *   showRhythm       — bool
 *   showBalance      — bool
 */

import { useEffect, useRef } from "react";

// MediaPipe indices we care about
const LM = {
  NOSE: 0, L_SHOULDER: 11, R_SHOULDER: 12,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
  L_ELBOW: 13, R_ELBOW: 14,
  L_WRIST: 15, R_WRIST: 16,
};

function pt(lms, idx, W, H) {
  const lm = lms?.[idx];
  if (!lm || (lm.visibility ?? 1) < 0.25) return null;
  return { x: lm.x * W, y: lm.y * H };
}

function midpoint(a, b) {
  if (!a || !b) return a || b;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function drawArrow(ctx, from, to, color, width = 2) {
  if (!from || !to) return;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 8) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = width;
  ctx.lineCap     = "round";

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(dy, dx);
  const hs    = 8;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - hs * Math.cos(angle - 0.4), to.y - hs * Math.sin(angle - 0.4));
  ctx.lineTo(to.x - hs * Math.cos(angle + 0.4), to.y - hs * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default function FlowOverlay({
  landmarks, imageWidth, imageHeight,
  showAction, showRhythm, showBalance,
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = imageWidth  || canvas.parentElement?.clientWidth  || 400;
    canvas.height = imageHeight || canvas.parentElement?.clientHeight || 500;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks) return;

    const W = canvas.width;
    const H = canvas.height;

    const nose    = pt(landmarks, LM.NOSE,       W, H);
    const lSho    = pt(landmarks, LM.L_SHOULDER, W, H);
    const rSho    = pt(landmarks, LM.R_SHOULDER, W, H);
    const lHip    = pt(landmarks, LM.L_HIP,      W, H);
    const rHip    = pt(landmarks, LM.R_HIP,      W, H);
    const lKnee   = pt(landmarks, LM.L_KNEE,     W, H);
    const rKnee   = pt(landmarks, LM.R_KNEE,     W, H);
    const lAnkle  = pt(landmarks, LM.L_ANKLE,    W, H);
    const rAnkle  = pt(landmarks, LM.R_ANKLE,    W, H);
    const lElbow  = pt(landmarks, LM.L_ELBOW,    W, H);
    const rElbow  = pt(landmarks, LM.R_ELBOW,    W, H);
    const lWrist  = pt(landmarks, LM.L_WRIST,    W, H);
    const rWrist  = pt(landmarks, LM.R_WRIST,    W, H);

    const shoulderMid = midpoint(lSho, rSho);
    const hipMid      = midpoint(lHip, rHip);
    const kneeMid     = midpoint(lKnee, rKnee);
    const ankleMid    = midpoint(lAnkle, rAnkle);

    // ── Line of Action ────────────────────────────────────────────────────────
    if (showAction && nose && shoulderMid && hipMid) {
      const end = ankleMid || kneeMid || hipMid;
      ctx.save();
      ctx.strokeStyle = "rgba(168, 85, 247, 0.85)";
      ctx.lineWidth   = 3;
      ctx.lineCap     = "round";
      ctx.setLineDash([]);

      // Cubic bezier: nose → shoulderMid (ctrl1) → hipMid (ctrl2) → ankle
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.bezierCurveTo(
        shoulderMid.x, shoulderMid.y,
        hipMid.x,      hipMid.y,
        end.x,         end.y,
      );
      ctx.stroke();

      // Glow pass
      ctx.strokeStyle = "rgba(168, 85, 247, 0.25)";
      ctx.lineWidth   = 8;
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.bezierCurveTo(shoulderMid.x, shoulderMid.y, hipMid.x, hipMid.y, end.x, end.y);
      ctx.stroke();

      // Endpoint dot
      ctx.fillStyle = "rgba(168, 85, 247, 0.9)";
      ctx.beginPath();
      ctx.arc(nose.x, nose.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // ── Rhythm Lines ──────────────────────────────────────────────────────────
    if (showRhythm) {
      const rhythmColor = "rgba(56, 189, 248, 0.85)";
      // Left arm flow: shoulder → elbow → wrist
      if (lSho && lElbow) drawArrow(ctx, lSho, lElbow, rhythmColor, 2);
      if (lElbow && lWrist) drawArrow(ctx, lElbow, lWrist, rhythmColor, 2);
      // Right arm flow
      if (rSho && rElbow) drawArrow(ctx, rSho, rElbow, rhythmColor, 2);
      if (rElbow && rWrist) drawArrow(ctx, rElbow, rWrist, rhythmColor, 2);
      // Left leg flow: hip → knee → ankle
      if (lHip && lKnee) drawArrow(ctx, lHip, lKnee, rhythmColor, 2);
      if (lKnee && lAnkle) drawArrow(ctx, lKnee, lAnkle, rhythmColor, 2);
      // Right leg flow
      if (rHip && rKnee) drawArrow(ctx, rHip, rKnee, rhythmColor, 2);
      if (rKnee && rAnkle) drawArrow(ctx, rKnee, rAnkle, rhythmColor, 2);
    }

    // ── Balance Line ──────────────────────────────────────────────────────────
    if (showBalance && shoulderMid && hipMid) {
      // Centre of gravity: weighted average of shoulder, hip, knee midpoints
      const cogX = (
        shoulderMid.x * 0.35 +
        hipMid.x      * 0.45 +
        (kneeMid?.x ?? hipMid.x) * 0.20
      );
      const cogY = shoulderMid.y;

      ctx.save();
      ctx.strokeStyle = "rgba(251, 191, 36, 0.8)";
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(cogX, cogY - 20);
      ctx.lineTo(cogX, H);
      ctx.stroke();
      ctx.setLineDash([]);

      // CoG dot
      ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
      ctx.beginPath();
      ctx.arc(cogX, cogY, 5, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.font      = "bold 10px 'Segoe UI', sans-serif";
      ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
      ctx.fillText("CoG", cogX + 7, cogY - 6);
      ctx.restore();
    }
  }, [landmarks, imageWidth, imageHeight, showAction, showRhythm, showBalance]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0, left: 0,
        width: "100%", height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
