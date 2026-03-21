/**
 * CanvasViewer.jsx — P.O.S.E
 *
 * Two display modes in compare view:
 *   "image"  — skeleton drawn as an absolute canvas over each source image
 *              using original 0–1 keypoints mapped to image pixel coords
 *   "aligned" — normalized overlay (OverlayCanvas) for precise comparison
 *
 * Single mode always uses image-aligned overlay.
 *
 * Keypoint format from API: { name, x, y, score }
 *   x, y are in 0–1 relative space (fraction of image width/height)
 *   score is visibility/confidence — joints with score < 0.5 are skipped
 */

import { useEffect, useRef, useState } from "react";
import OverlayCanvas from "./OverlayCanvas";

// ── Skeleton connections ──────────────────────────────────────────────────────

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

// Joints required for a full-body detection
const FULL_BODY_JOINTS = ["LEFT_HIP", "RIGHT_HIP", "LEFT_KNEE", "RIGHT_KNEE"];

// Confidence threshold — joints below this are not drawn
const CONF_THRESHOLD = 0.5;

// Manual joint placement order
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
  white:    "rgba(255,255,255,0.9)",
  red:      "#ef4444",
  green:    "#4ade80",
  greenDim: "rgba(74,222,128,0.55)",
  blue:     "#60a5fa",
  amber:    "#fbbf24",
};

const DOT = 5, DOT_E = 7, LW = 2.5;


// ── Public component ──────────────────────────────────────────────────────────

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
  const imgRef    = useRef(null);
  const canvasRef = useRef(null);
  const [jointIdx,    setJointIdx]    = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);

  const redraw = () => {
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const cw = img.clientWidth;
    const ch = img.clientHeight;
    canvas.width  = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    if (!showOverlay) return;

    const scaleX = cw / (img.naturalWidth  || cw);
    const scaleY = ch / (img.naturalHeight || ch);

    if (keypoints?.length) {
      drawImageSkeleton(ctx, keypoints, correctedKeypoints, errors, scaleX, scaleY);
    }
    if (centerOfGravity) {
      drawCoG(ctx, centerOfGravity, scaleX, scaleY);
    }
    if (manualMode) {
      drawManualHint(ctx, JOINT_NAMES[jointIdx % JOINT_NAMES.length]);
    }
  };

  useEffect(() => { redraw(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageSrc, keypoints, correctedKeypoints, errors, centerOfGravity, manualMode, jointIdx, showOverlay]);

  useEffect(() => {
    const ro = new ResizeObserver(redraw);
    if (imgRef.current) ro.observe(imgRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (e) => {
    if (!manualMode || !onManualJoint) return;
    const img  = imgRef.current;
    const rect = img.getBoundingClientRect();
    // Return coords in original image pixels
    const scaleX = (img.naturalWidth  || img.clientWidth)  / rect.width;
    const scaleY = (img.naturalHeight || img.clientHeight) / rect.height;
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
        <div style={st.hint}>
          Click to place:{" "}
          <strong style={{ color: "#a5b4fc" }}>
            {JOINT_NAMES[jointIdx % JOINT_NAMES.length]?.replace(/_/g, " ")}
          </strong>
          {" "}({jointIdx + 1} / {JOINT_NAMES.length})
        </div>
      )}
      {keypoints?.length > 0 && (
        <button style={st.toggleBtn} onClick={() => setShowOverlay(v => !v)}>
          {showOverlay ? "Hide" : "Show"} Skeleton
        </button>
      )}
      <div style={st.imgWrap}>
        <img
          ref={imgRef}
          src={imageSrc}
          alt="pose"
          style={st.img}
          onLoad={redraw}
          onClick={handleClick}
        />
        <canvas
          ref={canvasRef}
          style={{ ...st.overlayCanvas, cursor: manualMode ? "crosshair" : "default" }}
        />
      </div>
    </div>
  );
}


// ── Compare mode ──────────────────────────────────────────────────────────────

function CompareViewer({
  refImageSrc, refKeypoints,
  drawImageSrc, drawKeypoints,
  correctedKeypoints, errors,
  usedFallback, anatomyFallback, detectionCase,
  normRef, normDraw, normCorrected, flaggedJoints,
  refImageWidth, refImageHeight, drawImageWidth, drawImageHeight,
}) {
  // "image" = image-aligned overlay, "aligned" = normalized OverlayCanvas
  const [overlayMode,  setOverlayMode]  = useState("image");
  const [showSkeleton, setShowSkeleton] = useState(true);

  const hasAnyKeypoints  = refKeypoints?.length > 0 || drawKeypoints?.length > 0;
  const hasNormalizedData = normRef?.length && normDraw?.length && normCorrected?.length;

  const refBadge  = (detectionCase === 3 || anatomyFallback)
    ? "⚠ Reference not detected — using standard anatomy"
    : null;
  const drawBadge = (detectionCase === 2 || usedFallback)
    ? "⚠ AI estimation mode (drawing not fully detected)"
    : null;

  return (
    <div>
      {/* Mode toggle bar */}
      <div style={st.modeBar}>
        {hasAnyKeypoints && (
          <>
            <ModeChip
              active={overlayMode === "image"}
              onClick={() => setOverlayMode("image")}
              label="Image Overlay"
            />
            {hasNormalizedData && (
              <ModeChip
                active={overlayMode === "aligned"}
                onClick={() => setOverlayMode("aligned")}
                label="Aligned Overlay"
              />
            )}
          </>
        )}
        {overlayMode === "image" && hasAnyKeypoints && (
          <button style={st.toggleBtn} onClick={() => setShowSkeleton(v => !v)}>
            {showSkeleton ? "Hide" : "Show"} Skeleton
          </button>
        )}
      </div>

      {overlayMode === "aligned" && hasNormalizedData ? (
        <OverlayCanvas
          normRef={normRef}
          normDraw={normDraw}
          normCorrected={normCorrected}
          flaggedJoints={flaggedJoints}
        />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Reference panel */}
          <div>
            <p style={st.cap}>Reference</p>
            {refBadge && <div style={st.badgeAmber}>{refBadge}</div>}
            {refImageSrc
              ? <ImageWithOverlay
                  imageSrc={refImageSrc}
                  keypoints={refKeypoints}
                  srcWidth={refImageWidth}
                  srcHeight={refImageHeight}
                  color={anatomyFallback ? C.amber : C.green}
                  showSkeleton={showSkeleton}
                />
              : <Placeholder label="No reference image" />}
          </div>

          {/* Drawing panel */}
          <div>
            <p style={st.cap}>Your Drawing</p>
            {drawBadge && <div style={st.badgeAmber}>{drawBadge}</div>}
            {drawImageSrc
              ? <ImageWithOverlay
                  imageSrc={drawImageSrc}
                  keypoints={drawKeypoints}
                  correctedKeypoints={correctedKeypoints}
                  srcWidth={drawImageWidth}
                  srcHeight={drawImageHeight}
                  errors={errors}
                  color={usedFallback ? C.amber : C.white}
                  showSkeleton={showSkeleton}
                />
              : <Placeholder label="No drawing image" />}
          </div>
        </div>
      )}
    </div>
  );
}


// ── ImageWithOverlay ──────────────────────────────────────────────────────────
// Renders an image with a transparent canvas absolutely positioned on top.
// Keypoints are in 0–1 space; mapped to pixel coords on canvas.

function ImageWithOverlay({
  imageSrc, keypoints, correctedKeypoints, errors, color, showSkeleton,
  srcWidth = 0, srcHeight = 0,
}) {
  const imgRef    = useRef(null);
  const canvasRef = useRef(null);

  const redraw = () => {
    const img    = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const cw = img.clientWidth;
    const ch = img.clientHeight;
    canvas.width  = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, cw, ch);
    if (!showSkeleton || !keypoints?.length) return;

    // Scale factor: keypoints are in original image pixels, canvas is CSS rendered size
    // If srcWidth/srcHeight not provided, fall back to naturalWidth/naturalHeight
    const origW = srcWidth  || img.naturalWidth  || cw;
    const origH = srcHeight || img.naturalHeight || ch;
    const scaleX = cw / origW;
    const scaleY = ch / origH;

    // Full-body validation warning
    const names = new Set(keypoints.map(k => k.name.toUpperCase()));
    if (FULL_BODY_JOINTS.some(j => !names.has(j))) {
      drawWarning(ctx, "Full body not detected", cw, ch);
    }

    drawImageSkeleton(ctx, keypoints, correctedKeypoints, errors, scaleX, scaleY, color);
  };

  // Redraw on any prop change
  useEffect(() => { redraw(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [imageSrc, keypoints, correctedKeypoints, errors, color, showSkeleton]);

  // Also redraw when window resizes (responsive layout)
  useEffect(() => {
    const ro = new ResizeObserver(redraw);
    if (imgRef.current) ro.observe(imgRef.current);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={st.imgWrap}>
      <img
        ref={imgRef}
        src={imageSrc}
        alt="pose"
        style={st.img}
        onLoad={redraw}
      />
      <canvas ref={canvasRef} style={st.overlayCanvas} />
    </div>
  );
}


// ── Core drawing — image-aligned ──────────────────────────────────────────────

function buildPixelMap(keypoints, scaleX, scaleY) {
  // Keypoints from API are in absolute image pixels.
  // Multiply by scale to get canvas (rendered) pixel coords.
  const map = {};
  for (const kp of (keypoints || [])) {
    if ((kp.score ?? 1) < CONF_THRESHOLD) continue;
    map[kp.name.toUpperCase()] = {
      x: kp.x * scaleX,
      y: kp.y * scaleY,
    };
  }
  return map;
}

function buildPixelMapFromObj(obj, scaleX, scaleY) {
  // correctedKeypoints is { NAME: { x, y } } in absolute image pixels
  if (!obj || typeof obj !== "object") return {};
  const map = {};
  for (const [k, v] of Object.entries(obj)) {
    map[k.toUpperCase()] = { x: v.x * scaleX, y: v.y * scaleY };
  }
  return map;
}

function drawImageSkeleton(ctx, keypoints, correctedKeypoints, errors, scaleX, scaleY, boneColor = C.white) {
  const origMap = buildPixelMap(keypoints, scaleX, scaleY);
  const corrMap = buildPixelMapFromObj(correctedKeypoints, scaleX, scaleY);
  const flagSet = new Set((errors || []).map(e => e.joint?.toUpperCase()));

  ctx.lineCap  = "round";
  ctx.lineJoin = "round";

  // Original skeleton
  drawBones(ctx,  origMap, boneColor, LW, false, flagSet);
  drawJoints(ctx, origMap, boneColor, DOT,   n => !flagSet.has(n));
  drawJoints(ctx, origMap, C.red,     DOT_E, n =>  flagSet.has(n));

  // Corrected skeleton (blue, dashed)
  if (Object.keys(corrMap).length > 0) {
    drawBones(ctx,  corrMap, C.blue,    LW, true);
    drawJoints(ctx, corrMap, C.blue,    DOT, () => true);
  }
}

function drawBones(ctx, kpMap, color, lineWidth, dashed, skipSet = null) {
  ctx.strokeStyle = color;
  ctx.lineWidth   = lineWidth;
  ctx.setLineDash(dashed ? [6, 4] : []);
  for (const [a, b] of CONNECTIONS) {
    const ptA = kpMap[a], ptB = kpMap[b];
    if (!ptA || !ptB) continue;
    if (skipSet?.has(a) || skipSet?.has(b)) continue;
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

function drawCoG(ctx, cog, scaleX, scaleY) {
  const x     = cog.x * scaleX;
  const y     = cog.y * scaleY;
  const color = cog.balanced ? C.green : C.red;
  const size  = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
  ctx.moveTo(x, y - size); ctx.lineTo(x, y + size);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font      = "bold 11px monospace";
  ctx.fillText("CoG", x + 14, y + 4);
}

function drawManualHint(ctx, jointName) {
  if (!jointName) return;
  ctx.fillStyle = "rgba(165,180,252,0.85)";
  ctx.font      = "bold 13px monospace";
  ctx.fillText(`Next: ${jointName.replace(/_/g, " ")}`, 10, 22);
}

function drawWarning(ctx, msg, w, h) {
  ctx.fillStyle    = "rgba(251,191,36,0.15)";
  ctx.strokeStyle  = "rgba(251,191,36,0.5)";
  ctx.lineWidth    = 1;
  ctx.strokeRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = "#fbbf24";
  ctx.font      = "bold 11px monospace";
  ctx.fillText(`⚠ ${msg}`, 8, h - 10);
}


// ── Small UI components ───────────────────────────────────────────────────────

function ModeChip({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...st.modeChip,
        background:  active ? "#4f46e5" : "#1e293b",
        color:       active ? "#fff"    : "#64748b",
        borderColor: active ? "#6366f1" : "#334155",
      }}
    >
      {label}
    </button>
  );
}

function Placeholder({ label }) {
  return (
    <div style={st.placeholder}>{label}</div>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────

const st = {
  imgWrap:      { position: "relative", display: "block", lineHeight: 0 },
  img:          { maxWidth: "100%", borderRadius: 8, border: "1px solid #1e293b", display: "block" },
  overlayCanvas:{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", borderRadius: 8, pointerEvents: "none" },
  modeBar:      { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" },
  modeChip:     { border: "1px solid", borderRadius: 6, padding: "4px 12px", fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" },
  toggleBtn:    { padding: "4px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#94a3b8", fontSize: 11, cursor: "pointer", fontWeight: 500 },
  cap:          { margin: "0 0 6px", fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1 },
  badgeAmber:   { marginBottom: 6, padding: "5px 10px", background: "#451a03", border: "1px solid #92400e", borderRadius: 6, color: "#fbbf24", fontSize: 11, fontWeight: 500 },
  hint:         { marginBottom: 6, padding: "5px 10px", background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: 6, color: "#94a3b8", fontSize: 11 },
  placeholder:  { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 12 },
};
