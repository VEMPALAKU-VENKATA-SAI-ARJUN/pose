/**
 * CanvasViewer.jsx — P.O.S.E
 * Canvas 2D rendering for pose skeletons.
 *
 * Single mode props:
 *   imageSrc, keypoints, correctedKeypoints, errors, centerOfGravity
 *   manualMode, onManualJoint
 *
 * Compare mode props (compareMode=true):
 *   refImageSrc, refKeypoints, drawImageSrc, drawKeypoints
 *   correctedKeypoints, errors
 *   usedFallback, anatomyFallback, detectionCase
 */

import { useEffect, useRef, useState } from "react";

const CONNECTIONS = [
  ["LEFT_SHOULDER",  "RIGHT_SHOULDER"],
  ["LEFT_SHOULDER",  "LEFT_ELBOW"],
  ["LEFT_ELBOW",     "LEFT_WRIST"],
  ["RIGHT_SHOULDER", "RIGHT_ELBOW"],
  ["RIGHT_ELBOW",    "RIGHT_WRIST"],
  ["LEFT_SHOULDER",  "LEFT_HIP"],
  ["RIGHT_SHOULDER", "RIGHT_HIP"],
  ["LEFT_HIP",       "RIGHT_HIP"],
  ["LEFT_HIP",       "LEFT_KNEE"],
  ["LEFT_KNEE",      "LEFT_ANKLE"],
  ["RIGHT_HIP",      "RIGHT_KNEE"],
  ["RIGHT_KNEE",     "RIGHT_ANKLE"],
];

// Ordered joint names for manual placement cycling
const JOINT_NAMES = [
  "NOSE",
  "LEFT_SHOULDER", "RIGHT_SHOULDER",
  "LEFT_ELBOW",    "RIGHT_ELBOW",
  "LEFT_WRIST",    "RIGHT_WRIST",
  "LEFT_HIP",      "RIGHT_HIP",
  "LEFT_KNEE",     "RIGHT_KNEE",
  "LEFT_ANKLE",    "RIGHT_ANKLE",
];

const C = {
  white:    "rgba(255,255,255,0.85)",
  red:      "#ef4444",
  green:    "#4ade80",
  greenDim: "rgba(74,222,128,0.6)",
  amber:    "#fbbf24",
};

const DOT = 5, DOT_E = 7, LW = 2;


export default function CanvasViewer(props) {
  return props.compareMode
    ? <CompareViewer {...props} />
    : <SingleViewer  {...props} />;
}


// ── Single mode ───────────────────────────────────────────────────────────────

function SingleViewer({
  imageSrc, keypoints, correctedKeypoints, errors, centerOfGravity,
  manualMode = false, onManualJoint,
}) {
  const canvasRef = useRef(null);
  const [jointIdx, setJointIdx] = useState(0);

  useEffect(() => {
    if (!imageSrc) return;
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const img    = new Image();
    img.src      = imageSrc;
    img.onload   = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      if (keypoints?.length) drawPoseSkeleton(ctx, keypoints, correctedKeypoints, errors);
      if (centerOfGravity)   drawCoG(ctx, centerOfGravity);
      if (manualMode)        drawManualHint(ctx, JOINT_NAMES[jointIdx % JOINT_NAMES.length]);
    };
  }, [imageSrc, keypoints, correctedKeypoints, errors, centerOfGravity, manualMode, jointIdx]);

  const handleClick = (e) => {
    if (!manualMode || !onManualJoint) return;
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top)  * scaleY;
    const name = JOINT_NAMES[jointIdx % JOINT_NAMES.length];
    onManualJoint({ index: jointIdx, name, x: Math.round(x), y: Math.round(y), score: 1.0 });
    setJointIdx(i => i + 1);
  };

  if (!imageSrc) return null;
  return (
    <div>
      {manualMode && (
        <div style={st.manualHint}>
          Click to place:{" "}
          <strong style={{ color: "#a5b4fc" }}>
            {JOINT_NAMES[jointIdx % JOINT_NAMES.length]?.replace(/_/g, " ")}
          </strong>
          {" "}({jointIdx + 1} / {JOINT_NAMES.length})
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ ...st.canvas, cursor: manualMode ? "crosshair" : "default" }}
        onClick={handleClick}
      />
    </div>
  );
}


// ── Compare mode ──────────────────────────────────────────────────────────────

function CompareViewer({
  refImageSrc, refKeypoints,
  drawImageSrc, drawKeypoints,
  correctedKeypoints, errors,
  usedFallback, anatomyFallback, detectionCase,
}) {
  const refCanvas  = useRef(null);
  const drawCanvas = useRef(null);

  useEffect(() => {
    if (!refImageSrc) return;
    const canvas = refCanvas.current;
    const ctx    = canvas.getContext("2d");
    const img    = new Image();
    img.src      = refImageSrc;
    img.onload   = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      if (refKeypoints?.length) {
        const map   = arrayToMap(refKeypoints);
        const color = anatomyFallback ? C.amber : C.green;
        drawBones(ctx,  map, CONNECTIONS, color, LW, false);
        drawJoints(ctx, map, color, DOT, () => true);
      }
    };
  }, [refImageSrc, refKeypoints, anatomyFallback]);

  useEffect(() => {
    if (!drawImageSrc) return;
    const canvas = drawCanvas.current;
    const ctx    = canvas.getContext("2d");
    const img    = new Image();
    img.src      = drawImageSrc;
    img.onload   = () => {
      canvas.width  = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      if (drawKeypoints?.length) {
        drawPoseSkeleton(ctx, drawKeypoints, correctedKeypoints, errors, usedFallback);
      }
    };
  }, [drawImageSrc, drawKeypoints, correctedKeypoints, errors, usedFallback]);

  // Per-panel status badges
  const refBadge  = (detectionCase === 3 || anatomyFallback)
    ? "⚠ Reference not detected — using standard anatomy"
    : null;
  const drawBadge = (detectionCase === 2 || usedFallback)
    ? "⚠ AI estimation mode (drawing not fully detected)"
    : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <p style={st.cap}>Reference</p>
        {refBadge  && <div style={st.badgeAmber}>{refBadge}</div>}
        {refImageSrc
          ? <canvas ref={refCanvas}  style={st.canvas} />
          : <Placeholder label="No reference image" />}
      </div>
      <div>
        <p style={st.cap}>Your Drawing</p>
        {drawBadge && <div style={st.badgeAmber}>{drawBadge}</div>}
        {drawImageSrc
          ? <canvas ref={drawCanvas} style={st.canvas} />
          : <Placeholder label="No drawing image" />}
      </div>
    </div>
  );
}

function Placeholder({ label }) {
  return (
    <div style={{
      background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8,
      height: 200, display: "flex", alignItems: "center", justifyContent: "center",
      color: "#334155", fontSize: 12,
    }}>
      {label}
    </div>
  );
}


// ── Core drawing ──────────────────────────────────────────────────────────────

function drawPoseSkeleton(ctx, keypoints, correctedKeypoints, errors, isEstimated = false) {
  const origMap   = arrayToMap(keypoints);
  const corrMap   = objectToMap(correctedKeypoints);
  const flagSet   = new Set((errors || []).map(e => e.joint.toUpperCase()));
  const boneColor = isEstimated ? C.amber : C.white;

  drawBones(ctx,  origMap, CONNECTIONS, boneColor, LW, false, flagSet);
  drawJoints(ctx, origMap, boneColor, DOT,   n => !flagSet.has(n));
  drawJoints(ctx, origMap, C.red,     DOT_E, n =>  flagSet.has(n));

  if (Object.keys(corrMap).length > 0) {
    drawBones(ctx,  corrMap, CONNECTIONS, C.green, LW, true);
    drawJoints(ctx, corrMap, C.greenDim, DOT, () => true);
  }
}

function drawManualHint(ctx, jointName) {
  if (!jointName) return;
  ctx.fillStyle = "rgba(165,180,252,0.8)";
  ctx.font      = "bold 13px monospace";
  ctx.fillText(`Next: ${jointName.replace(/_/g, " ")}`, 10, 22);
}

function drawBones(ctx, kpMap, connections, color, lineWidth, dashed, skipSet = null) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.setLineDash(dashed ? [6, 4] : []);
  for (const [a, b] of connections) {
    const ptA = kpMap[a], ptB = kpMap[b];
    if (!ptA || !ptB) continue;
    if (skipSet && (skipSet.has(a) || skipSet.has(b))) continue;
    ctx.beginPath();
    ctx.moveTo(ptA.x, ptA.y);
    ctx.lineTo(ptB.x, ptB.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawJoints(ctx, kpMap, color, radius, filter) {
  ctx.fillStyle = color;
  for (const [name, pt] of Object.entries(kpMap)) {
    if (!filter(name)) continue;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawCoG(ctx, cog) {
  const color = cog.balanced ? C.green : C.red;
  const size  = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(cog.x - size, cog.y); ctx.lineTo(cog.x + size, cog.y);
  ctx.moveTo(cog.x, cog.y - size); ctx.lineTo(cog.x, cog.y + size);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font      = "bold 11px monospace";
  ctx.fillText("CoG", cog.x + 14, cog.y + 4);
}


// ── Map builders ──────────────────────────────────────────────────────────────

function arrayToMap(arr) {
  const map = {};
  for (const kp of (arr || [])) map[kp.name.toUpperCase()] = { x: kp.x, y: kp.y };
  return map;
}

function objectToMap(obj) {
  if (!obj || typeof obj !== "object") return {};
  const map = {};
  for (const [k, v] of Object.entries(obj)) map[k.toUpperCase()] = { x: v.x, y: v.y };
  return map;
}


// ── Styles ────────────────────────────────────────────────────────────────────

const st = {
  canvas:     { maxWidth: "100%", borderRadius: 8, border: "1px solid #1e293b", display: "block" },
  cap:        { margin: "0 0 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 },
  badgeAmber: { marginBottom: 6, padding: "5px 10px", background: "#451a03", border: "1px solid #92400e", borderRadius: 6, color: "#fbbf24", fontSize: 11, fontWeight: 500 },
  manualHint: { marginBottom: 6, padding: "5px 10px", background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: 6, color: "#94a3b8", fontSize: 11 },
};
