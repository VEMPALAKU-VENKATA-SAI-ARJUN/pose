/**
 * OverlayCanvas.jsx — P.O.S.E Auto-Align Overlay
 *
 * Draws reference, drawing, and corrected pose skeletons in a shared
 * normalized coordinate space on a single canvas.
 *
 * Rendering improvements:
 *   - DPR-aware canvas for crisp HiDPI / retina output
 *   - Round lineCap / lineJoin for smooth bone lines
 *   - Per-skeleton glow shadows for visual depth
 *   - Gradient bones (color fades along each limb segment)
 *   - Flagged joints rendered with a glowing ring
 *   - Subtle radial vignette background
 */

import { useEffect, useRef, useState, useCallback } from "react";

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

// Logical canvas size (CSS pixels). DPR scaling is applied separately.
const W = 420;
const H = 520;

// 1 torso-unit → pixels. Increase to zoom in.
const SCALE = 155;

// Body centre sits at this vertical fraction of the canvas.
const CENTRE_Y = 0.44;

// Joint radii
const DOT_R      = 5;
const DOT_R_FLAG = 7;

// ── Coordinate transform ──────────────────────────────────────────────────────

function tx(x, y) {
  return {
    px: W / 2 + x * SCALE,
    py: H * CENTRE_Y - y * SCALE,   // flip Y: +y is up in normalised space
  };
}

// ── Background ────────────────────────────────────────────────────────────────

function drawBackground(ctx) {
  // Dark base
  ctx.fillStyle = "#080d18";
  ctx.fillRect(0, 0, W, H);

  // Subtle radial vignette — lighter in the centre
  const grad = ctx.createRadialGradient(W / 2, H * CENTRE_Y, 0, W / 2, H * CENTRE_Y, W * 0.75);
  grad.addColorStop(0,   "rgba(99,102,241,0.06)");
  grad.addColorStop(0.6, "rgba(0,0,0,0)");
  grad.addColorStop(1,   "rgba(0,0,0,0.35)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

// ── Grid ──────────────────────────────────────────────────────────────────────

function drawGrid(ctx) {
  const step = 40;

  // Fine grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.03)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([]);
  for (let x = step; x < W; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = step; y < H; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // Centre crosshair
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 5]);
  ctx.beginPath(); ctx.moveTo(W / 2, 0);        ctx.lineTo(W / 2, H);        ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H * CENTRE_Y); ctx.lineTo(W, H * CENTRE_Y); ctx.stroke();
  ctx.setLineDash([]);
}

// ── Skeleton drawing ──────────────────────────────────────────────────────────

function buildMap(keypoints) {
  const map = {};
  for (const kp of (keypoints || [])) map[kp.name.toUpperCase()] = kp;
  return map;
}

/**
 * Draw one skeleton.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array}  keypoints   — normalised keypoint list
 * @param {string} color       — hex/rgb base colour
 * @param {number} alpha       — global opacity (0–1)
 * @param {Set}    flaggedSet  — joint names that are in error
 * @param {boolean} dashed     — use dashed lines (corrected skeleton)
 * @param {string}  glowColor  — shadow blur colour
 */
function drawSkeleton(ctx, keypoints, color, alpha, flaggedSet = null, dashed = false, glowColor = null) {
  if (!keypoints?.length) return;
  const map = buildMap(keypoints);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap     = "round";
  ctx.lineJoin    = "round";

  // ── Glow pass (drawn first, wider, blurred) ──────────────────────────────
  if (glowColor) {
    ctx.shadowColor   = glowColor;
    ctx.shadowBlur    = 10;
    ctx.strokeStyle   = glowColor;
    ctx.lineWidth     = dashed ? 5 : 4;
    ctx.globalAlpha   = alpha * 0.35;
    ctx.setLineDash(dashed ? [6, 4] : []);
    for (const [a, b] of CONNECTIONS) {
      const kpA = map[a], kpB = map[b];
      if (!kpA || !kpB) continue;
      const ptA = tx(kpA.x, kpA.y);
      const ptB = tx(kpB.x, kpB.y);
      ctx.beginPath();
      ctx.moveTo(ptA.px, ptA.py);
      ctx.lineTo(ptB.px, ptB.py);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = alpha;
  }

  // ── Bones ────────────────────────────────────────────────────────────────
  ctx.lineWidth = dashed ? 2 : 2.5;
  ctx.setLineDash(dashed ? [6, 4] : []);

  for (const [a, b] of CONNECTIONS) {
    const kpA = map[a], kpB = map[b];
    if (!kpA || !kpB) continue;
    const ptA = tx(kpA.x, kpA.y);
    const ptB = tx(kpB.x, kpB.y);

    // Per-segment gradient for visual depth
    const grad = ctx.createLinearGradient(ptA.px, ptA.py, ptB.px, ptB.py);
    grad.addColorStop(0, color);
    grad.addColorStop(1, color + "99");   // fade to 60% opacity at far end
    ctx.strokeStyle = grad;

    ctx.beginPath();
    ctx.moveTo(ptA.px, ptA.py);
    ctx.lineTo(ptB.px, ptB.py);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Joints ───────────────────────────────────────────────────────────────
  for (const [name, kp] of Object.entries(map)) {
    const { px, py } = tx(kp.x, kp.y);
    const isFlagged  = flaggedSet?.has(name.toUpperCase());
    const r          = isFlagged ? DOT_R_FLAG : DOT_R;

    if (isFlagged) {
      // Outer glow ring
      ctx.globalAlpha   = 0.5;
      ctx.shadowColor   = "#fbbf24";
      ctx.shadowBlur    = 12;
      ctx.strokeStyle   = "#fbbf24";
      ctx.lineWidth     = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, r + 5, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.shadowBlur  = 0;

      // Filled dot
      ctx.globalAlpha = 1.0;
      ctx.fillStyle   = "#fbbf24";
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();
    } else {
      // Normal joint — small white centre for contrast
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = color;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 2 * Math.PI);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle   = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(px, py, r * 0.4, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ── Easing ────────────────────────────────────────────────────────────────────

/** Smooth ease-in-out cubic */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Linearly interpolate two keypoint arrays by factor t (0=draw, 1=corrected) */
function lerpKeypoints(from, to, t) {
  if (!from?.length || !to?.length) return from || to || [];
  const toMap = {};
  for (const kp of to) toMap[kp.name.toUpperCase()] = kp;
  return from.map(kp => {
    const target = toMap[kp.name.toUpperCase()];
    if (!target) return kp;
    return { ...kp, x: kp.x + (target.x - kp.x) * t, y: kp.y + (target.y - kp.y) * t };
  });
}

// Animation duration in ms for one full draw→corrected transition
const ANIM_DURATION = 1400;

export default function OverlayCanvas({ normRef, normDraw, normCorrected, flaggedJoints = [] }) {
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const startRef   = useRef(null);  // rAF timestamp when current leg started
  const tRef       = useRef(0);     // current interpolation value 0–1
  const dirRef     = useRef(1);     // 1 = draw→corrected, -1 = corrected→draw
  const [playing,  setPlaying]  = useState(false);
  const [progress, setProgress] = useState(0);  // 0–1, drives scrubber

  // ── Render one frame at interpolation value t ──────────────────────────────
  const renderFrame = useCallback((t) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width        = W * dpr;
      canvas.height       = H * dpr;
      canvas.style.width  = `${W}px`;
      canvas.style.height = `${H}px`;
    }

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawBackground(ctx);
    drawGrid(ctx);

    const flagSet      = new Set((flaggedJoints || []).map(j => j.toUpperCase()));
    const interpolated = lerpKeypoints(normDraw, normCorrected, easeInOut(t));

    // Reference static; drawing skeleton morphs toward corrected
    drawSkeleton(ctx, normRef,       "#4ade80", 0.55, null,    false, "#4ade80");
    drawSkeleton(ctx, interpolated,  "#ef4444", 0.55, flagSet, false, "#ef4444");
    drawSkeleton(ctx, normCorrected, "#60a5fa", 1.0,  null,    true,  "#60a5fa");
  }, [normRef, normDraw, normCorrected, flaggedJoints]);

  // ── rAF loop ───────────────────────────────────────────────────────────────
  const tick = useCallback((timestamp) => {
    if (!startRef.current) startRef.current = timestamp;
    const raw = Math.min((timestamp - startRef.current) / ANIM_DURATION, 1);
    const t   = dirRef.current === 1 ? raw : 1 - raw;

    tRef.current = t;
    setProgress(t);
    renderFrame(t);

    if (raw < 1) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // Flip direction and loop
      dirRef.current   = dirRef.current === 1 ? -1 : 1;
      startRef.current = null;
      rafRef.current   = requestAnimationFrame(tick);
    }
  }, [renderFrame]);

  // ── Play / pause ───────────────────────────────────────────────────────────
  const play = useCallback(() => {
    if (rafRef.current) return;
    startRef.current = null;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setPlaying(false);
  }, []);

  // ── Scrubber ───────────────────────────────────────────────────────────────
  const handleScrub = (e) => {
    pause();
    const val = parseFloat(e.target.value);
    tRef.current = val;
    setProgress(val);
    renderFrame(val);
  };

  // ── Initial render + cleanup ───────────────────────────────────────────────
  useEffect(() => {
    renderFrame(tRef.current);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [renderFrame]);

  // Reset when data changes
  useEffect(() => {
    pause();
    tRef.current   = 0;
    dirRef.current = 1;
    setProgress(0);
    renderFrame(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normRef, normDraw, normCorrected, flaggedJoints]);

  const pct = Math.round(progress * 100);

  return (
    <div style={st.wrap}>
      <canvas ref={canvasRef} style={st.canvas} />

      {/* Playback controls */}
      <div style={st.controls}>
        <button style={st.playBtn} onClick={() => playing ? pause() : play()} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "⏸" : "▶"}
        </button>
        <div style={st.scrubWrap}>
          <input
            type="range" min={0} max={1} step={0.001}
            value={progress}
            onChange={handleScrub}
            style={st.scrubber}
            aria-label="Animation progress"
          />
          <div style={{ ...st.scrubFill, width: `${pct}%` }} />
        </div>
        <span style={st.label}>
          {playing
            ? (dirRef.current === 1 ? "→ Correcting…" : "← Reverting…")
            : (pct === 0 ? "Drawing" : pct === 100 ? "Corrected" : `${pct}%`)}
        </span>
      </div>

      <Legend />
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={st.legend}>
      <LegendItem color="#4ade80" label="Reference" />
      <LegendItem color="#ef4444" label="Drawing → Corrected" />
      <LegendItem color="#60a5fa" label="Target" dashed />
      <LegendItem color="#fbbf24" label="Error joints" dot />
    </div>
  );
}

function LegendItem({ color, label, dashed, dot }) {
  return (
    <span style={st.legendItem}>
      {dot
        ? <span style={{ ...st.legendDot, background: color, boxShadow: `0 0 6px ${color}` }} />
        : <span style={{
            ...st.legendLine,
            background: dashed
              ? `repeating-linear-gradient(90deg,${color} 0,${color} 6px,transparent 6px,transparent 10px)`
              : color,
            boxShadow: `0 0 4px ${color}66`,
          }} />
      }
      <span style={{ color: "#94a3b8" }}>{label}</span>
    </span>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = {
  wrap:      { display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },
  canvas:    { borderRadius: 12, border: "1px solid #1e293b", display: "block", maxWidth: "100%", imageRendering: "crisp-edges" },
  controls:  { display: "flex", alignItems: "center", gap: 10, width: "100%", maxWidth: W, padding: "6px 10px", background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", boxSizing: "border-box" },
  playBtn:   { background: "#1e293b", border: "1px solid #334155", borderRadius: 6, color: "#e2e8f0", fontSize: 14, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" },
  scrubWrap: { flex: 1, position: "relative", height: 20, display: "flex", alignItems: "center" },
  scrubber:  { position: "absolute", width: "100%", opacity: 0, cursor: "pointer", height: 20, margin: 0, zIndex: 2 },
  scrubFill: { position: "absolute", left: 0, height: 3, background: "linear-gradient(90deg,#6366f1,#60a5fa)", borderRadius: 2, pointerEvents: "none", transition: "width 0.05s linear", zIndex: 1 },
  label:     { fontSize: 10, color: "#64748b", whiteSpace: "nowrap", minWidth: 72, textAlign: "right" },
  legend:    { display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", padding: "6px 12px", background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b" },
  legendItem:{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, userSelect: "none" },
  legendLine:{ display: "inline-block", width: 24, height: 2.5, borderRadius: 2, flexShrink: 0 },
  legendDot: { display: "inline-block", width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
};
