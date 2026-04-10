/**
 * PoseEvaluation.jsx
 * AI pose evaluation using @mediapipe/tasks-vision (npm, not CDN).
 *
 * Lifecycle:
 *   1. createPoseLandmarker() — initialises model once, cached in module scope
 *   2. detectPose(img)        — runs inference on a loaded <img> element
 *   3. compare()              — normalise, diff angles, score, draw skeletons
 *
 * Props:
 *   refImageUrl   — URL of the reference pose image
 *   drawingUrl    — data URL of the user's canvas drawing
 *   onResult({ score, feedback, angleDiffs, refLandmarks, drawLandmarks })
 *   onError(msg)
 *   refCanvasEl   — <canvas> DOM node — green skeleton drawn here
 *   drawCanvasEl  — <canvas> DOM node — red skeleton drawn here
 */

import { useState, useEffect, useRef } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// ── Timeout helper ────────────────────────────────────────────────────────────
function withTimeout(promise, ms, label = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

// ── Model singleton ───────────────────────────────────────────────────────────
// Shared across all PoseEvaluation instances — only initialised once.
let _landmarkerPromise = null;

async function createPoseLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-assets/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numPoses: 1,
  });
}

function getLandmarker() {
  if (!_landmarkerPromise) {
    _landmarkerPromise = withTimeout(
      createPoseLandmarker(),
      12_000,
      "Model initialisation"
    );
  }
  return _landmarkerPromise;
}

// Reset singleton so retry can re-initialise
function resetLandmarker() {
  _landmarkerPromise = null;
}

// ── Pose detection (5s timeout per image) ────────────────────────────────────
async function detectPose(imgElement) {
  const landmarker = await getLandmarker();
  const result = await withTimeout(
    Promise.resolve(landmarker.detect(imgElement)),
    5_000,
    "Pose detection"
  );
  if (!result.landmarks?.length) return null;
  return result.landmarks[0].map(lm => ({
    x: lm.x, y: lm.y, z: lm.z ?? 0,
    visibility: lm.visibility ?? 0.9,
  }));
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
const CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
];

const ANGLE_DEFS = [
  { key: "left_elbow",     a: 11, b: 13, c: 15, label: "Left Elbow" },
  { key: "right_elbow",    a: 12, b: 14, c: 16, label: "Right Elbow" },
  { key: "left_shoulder",  a: 13, b: 11, c: 23, label: "Left Shoulder" },
  { key: "right_shoulder", a: 14, b: 12, c: 24, label: "Right Shoulder" },
  { key: "left_knee",      a: 23, b: 25, c: 27, label: "Left Knee" },
  { key: "right_knee",     a: 24, b: 26, c: 28, label: "Right Knee" },
  { key: "left_hip",       a: 11, b: 23, c: 25, label: "Left Hip" },
  { key: "right_hip",      a: 12, b: 24, c: 26, label: "Right Hip" },
];

function calcAngle(lms, ai, bi, ci) {
  const a = lms[ai]; const b = lms[bi]; const c = lms[ci];
  if (!a || !b || !c) return null;
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const mag = Math.sqrt((ba.x ** 2 + ba.y ** 2) * (bc.x ** 2 + bc.y ** 2));
  if (mag < 1e-6) return null;
  return Math.round(Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180 / Math.PI * 10) / 10;
}

function normaliseLandmarks(lms) {
  const lh = lms[23]; const rh = lms[24];
  const ls = lms[11]; const rs = lms[12];
  if (!lh || !rh || !ls || !rs) return lms;
  const cx    = (lh.x + rh.x) / 2;
  const cy    = (lh.y + rh.y) / 2;
  const torso = Math.abs(cy - (ls.y + rs.y) / 2) || 1;
  return lms.map(lm => lm
    ? { ...lm, x: (lm.x - cx) / torso, y: (lm.y - cy) / torso }
    : null
  );
}

function drawSkeleton(canvas, landmarks, color, flaggedSet = new Set()) {
  if (!canvas || !landmarks) return;
  const W = canvas.width; const H = canvas.height;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);

  CONNECTIONS.forEach(([i, j]) => {
    const a = landmarks[i]; const b = landmarks[j];
    if (!a || !b || (a.visibility ?? 1) < 0.25 || (b.visibility ?? 1) < 0.25) return;
    ctx.beginPath();
    ctx.moveTo(a.x * W, a.y * H);
    ctx.lineTo(b.x * W, b.y * H);
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    ctx.stroke();
  });

  landmarks.forEach((lm, i) => {
    if (!lm || (lm.visibility ?? 1) < 0.25) return;
    const x = lm.x * W; const y = lm.y * H;
    const flagged = flaggedSet.has(i);
    if (flagged) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(x, y, flagged ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = flagged ? "#ef4444" : color;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
  });
}

function generateFeedback(angleDiffs) {
  const directions = {
    left_elbow:     d => d < 0 ? "Left elbow is too bent — try straightening it." : "Left elbow needs more bend.",
    right_elbow:    d => d < 0 ? "Right elbow is too bent — try straightening it." : "Right elbow needs more bend.",
    left_shoulder:  d => d < 0 ? "Left arm is too low — raise it slightly." : "Left arm is too high — lower it.",
    right_shoulder: d => d < 0 ? "Right arm is too low — raise it slightly." : "Right arm is too high — lower it.",
    left_knee:      d => d < 0 ? "Left knee is over-bent — straighten slightly." : "Left knee needs more bend.",
    right_knee:     d => d < 0 ? "Right knee is over-bent — straighten slightly." : "Right knee needs more bend.",
    left_hip:       d => d < 0 ? "Left hip angle is too closed." : "Left hip angle is too open.",
    right_hip:      d => d < 0 ? "Right hip angle is too closed." : "Right hip angle is too open.",
  };

  const msgs = angleDiffs
    .filter(({ diff }) => Math.abs(diff) > 15)
    .map(({ key, diff, refAngle, drawAngle }) => ({
      key,
      message:   directions[key]?.(diff) ?? `${key.replace(/_/g, " ")} is off by ${Math.abs(diff).toFixed(0)}°`,
      diff:      Math.round(diff),
      refAngle:  Math.round(refAngle),
      drawAngle: Math.round(drawAngle),
      severity:  Math.abs(diff) > 30 ? "high" : "medium",
    }));

  if (!msgs.length) {
    msgs.push({ key: "overall", message: "Great pose accuracy — angles closely match the reference!", severity: "good" });
  }
  return msgs;
}

// ── Component ─────────────────────────────────────────────────────────────────
// Stateless from the parent's perspective — mounts → runs → calls onResult or
// onError → unmounts (parent controls mounting via aiStatus === "loading").
export default function PoseEvaluation({
  refImageUrl, drawingUrl, onResult, onError, refCanvasEl, drawCanvasEl,
}) {
  const [internalStatus, setInternalStatus] = useState("loading"); // loading | done | error
  const [errMsg,         setErrMsg]         = useState("");
  const [elapsed,        setElapsed]        = useState(0);
  const timerRef = useRef(null);
  const ran      = useRef(false);

  const stopTick = () => { clearInterval(timerRef.current); timerRef.current = null; };
  useEffect(() => () => stopTick(), []);

  useEffect(() => {
    if (!refImageUrl || !drawingUrl || ran.current) return;
    ran.current = true;

    // Start elapsed counter
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);

    withTimeout(doAnalysis(), 20_000, "Full AI analysis")
      .then(() => {
        setInternalStatus("done");
      })
      .catch(e => {
        resetLandmarker();
        const msg = e.message.includes("timed out")
          ? "AI timed out — model may still be downloading. Try again."
          : `AI failed: ${e.message}`;
        setInternalStatus("error");
        setErrMsg(msg);
        onError?.(msg);
      })
      .finally(stopTick);
  }, []);

  async function doAnalysis() {
    const loadImg = src => withTimeout(
      new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload  = () => res(img);
        img.onerror = () => rej(new Error("Image failed to load"));
        img.src = src;
      }),
      3_000, "Image load"
    );

    const [refImg, drawImg] = await Promise.all([
      loadImg(refImageUrl),
      loadImg(drawingUrl),
    ]);

    const [refRaw, drawRaw] = await Promise.all([
      detectPose(refImg).catch(() => null),
      detectPose(drawImg).catch(() => null),
    ]);

    if (!refRaw && !drawRaw) {
      throw new Error("No pose detected. Try a clearer full-body photo.");
    }

    const refNorm  = refRaw  ? normaliseLandmarks(refRaw)  : null;
    const drawNorm = drawRaw ? normaliseLandmarks(drawRaw) : null;

    const angleDiffs = [];
    if (refNorm && drawNorm) {
      ANGLE_DEFS.forEach(({ key, a, b, c, label }) => {
        const refA  = calcAngle(refNorm,  a, b, c);
        const drawA = calcAngle(drawNorm, a, b, c);
        if (refA != null && drawA != null) {
          angleDiffs.push({ key, label, refAngle: refA, drawAngle: drawA, diff: drawA - refA });
        }
      });
    }

    let score = 50;
    if (angleDiffs.length) {
      const avg = angleDiffs.reduce((s, d) => s + Math.abs(d.diff), 0) / angleDiffs.length;
      score = Math.max(0, Math.min(100, Math.round(100 - avg * (100 / 90))));
    }

    const flaggedJoints = new Set(
      angleDiffs
        .filter(d => Math.abs(d.diff) > 15)
        .map(d => ANGLE_DEFS.find(x => x.key === d.key)?.b)
        .filter(Boolean)
    );

    if (refCanvasEl && refRaw) {
      refCanvasEl.width  = refImg.naturalWidth;
      refCanvasEl.height = refImg.naturalHeight;
      drawSkeleton(refCanvasEl, refRaw, "rgba(74,222,128,0.9)");
    }
    if (drawCanvasEl && drawRaw) {
      drawCanvasEl.width  = drawImg.naturalWidth;
      drawCanvasEl.height = drawImg.naturalHeight;
      drawSkeleton(drawCanvasEl, drawRaw, "rgba(248,113,113,0.9)", flaggedJoints);
    }

    onResult?.({
      score,
      feedback:      generateFeedback(angleDiffs),
      angleDiffs,
      refLandmarks:  refRaw,
      drawLandmarks: drawRaw,
    });
  }

  // Only render while in-progress — parent hides us on success/error via unmount
  if (internalStatus === "done") return null;

  if (internalStatus === "error") return null; // parent already shows error via onError callback

  // loading state — show inline spinner with elapsed time
  return (
    <div className="pe-status">
      <span className="gm-ai-spinner" />
      <span className="pe-status-text">
        {elapsed < 3 ? "Loading AI model…" : `Analysing pose… ${elapsed}s`}
      </span>
      {elapsed >= 10 && (
        <span className="pe-status-hint">
          First load downloads ~5MB — hang tight
        </span>
      )}
    </div>
  );
}
