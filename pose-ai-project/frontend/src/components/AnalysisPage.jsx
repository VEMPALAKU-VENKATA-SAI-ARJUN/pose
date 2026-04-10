/**
 * AnalysisPage.jsx
 *
 * Full Analysis Mode page:
 *  - Image upload (drag-and-drop or click)
 *  - OpenCV.js preprocessing (resize + normalize)
 *  - MediaPipe Pose (JS) for 33-keypoint detection (client-side)
 *  - Falls back to server-side Flask AI if MediaPipe JS unavailable
 *  - Canvas overlay: skeleton, angle labels, red error markers
 *  - Toggles: Show/Hide Skeleton, Show AI Feedback
 *  - Results saved to MongoDB via POST /api/analysis
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import {
  ArrowLeft, ImageIcon, Bone, Lightbulb, ScanSearch,
  AlertCircle, CheckCircle, Camera, ChevronRight,
} from "lucide-react";
import "./AnalysisPage.css";

// ── MediaPipe PoseLandmarker (npm) ────────────────────────────────────────────
let _apLandmarkerPromise = null;

async function getAPLandmarker() {
  if (!_apLandmarkerPromise) {
    _apLandmarkerPromise = (async () => {
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
    })();
  }
  return _apLandmarkerPromise;
}

const API_URL = "/api/analysis";

// ── MediaPipe landmark indices ────────────────────────────────────────────────
const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
};

// Skeleton connections [from, to]
const CONNECTIONS = [
  [LM.L_SHOULDER, LM.R_SHOULDER],
  [LM.L_SHOULDER, LM.L_ELBOW],   [LM.L_ELBOW, LM.L_WRIST],
  [LM.R_SHOULDER, LM.R_ELBOW],   [LM.R_ELBOW, LM.R_WRIST],
  [LM.L_SHOULDER, LM.L_HIP],     [LM.R_SHOULDER, LM.R_HIP],
  [LM.L_HIP, LM.R_HIP],
  [LM.L_HIP, LM.L_KNEE],         [LM.L_KNEE, LM.L_ANKLE],
  [LM.R_HIP, LM.R_KNEE],         [LM.R_KNEE, LM.R_ANKLE],
];

// Joints to measure angles: { key, a, b (vertex), c, label, idealRange }
const ANGLE_DEFS = [
  { key: "left_elbow",    a: LM.L_SHOULDER, b: LM.L_ELBOW,    c: LM.L_WRIST,    label: "L Elbow",    ideal: [30, 170] },
  { key: "right_elbow",   a: LM.R_SHOULDER, b: LM.R_ELBOW,    c: LM.R_WRIST,    label: "R Elbow",    ideal: [30, 170] },
  { key: "left_shoulder", a: LM.L_ELBOW,    b: LM.L_SHOULDER, c: LM.L_HIP,      label: "L Shoulder", ideal: [20, 160] },
  { key: "right_shoulder",a: LM.R_ELBOW,    b: LM.R_SHOULDER, c: LM.R_HIP,      label: "R Shoulder", ideal: [20, 160] },
  { key: "left_knee",     a: LM.L_HIP,      b: LM.L_KNEE,     c: LM.L_ANKLE,    label: "L Knee",     ideal: [30, 175] },
  { key: "right_knee",    a: LM.R_HIP,      b: LM.R_KNEE,     c: LM.R_ANKLE,    label: "R Knee",     ideal: [30, 175] },
  { key: "left_hip",      a: LM.L_SHOULDER, b: LM.L_HIP,      c: LM.L_KNEE,     label: "L Hip",      ideal: [60, 180] },
  { key: "right_hip",     a: LM.R_SHOULDER, b: LM.R_HIP,      c: LM.R_KNEE,     label: "R Hip",      ideal: [60, 180] },
];

// Friendly feedback messages for flagged joints
const FEEDBACK_MAP = {
  left_elbow:     "Left arm is too bent — try straightening it slightly.",
  right_elbow:    "Right arm is too bent — try straightening it slightly.",
  left_shoulder:  "Left shoulder angle looks off — check arm position.",
  right_shoulder: "Right shoulder angle looks off — check arm position.",
  left_knee:      "Left knee alignment is incorrect — adjust leg position.",
  right_knee:     "Right knee alignment is incorrect — adjust leg position.",
  left_hip:       "Left hip angle is outside the ideal range.",
  right_hip:      "Right hip angle is outside the ideal range.",
};


// ── Utility: calculate angle at vertex b ──────────────────────────────────────
function calculateAngle(a, b, c) {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBa = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBc = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBa < 1e-6 || magBc < 1e-6) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (magBa * magBc)));
  return Math.round(Math.acos(cosTheta) * (180 / Math.PI) * 10) / 10;
}

// ── Utility: compute all angles from a landmark array ────────────────────────
function computeAngles(landmarks) {
  return ANGLE_DEFS.map(({ key, a, b, c, label, ideal }) => {
    const ptA = landmarks[a];
    const ptB = landmarks[b];
    const ptC = landmarks[c];
    if (!ptA || !ptB || !ptC) return null;
    const angle   = calculateAngle(ptA, ptB, ptC);
    const flagged = angle < ideal[0] || angle > ideal[1];
    return { key, label, angle, flagged, vertex: ptB };
  }).filter(Boolean);
}

// ── Utility: draw skeleton on canvas ─────────────────────────────────────────
function drawSkeleton(ctx, landmarks, W, H, showSkeleton, angleResults) {
  if (!showSkeleton) return;
  ctx.clearRect(0, 0, W, H);

  const flaggedKeys = new Set(angleResults.filter(a => a.flagged).map(a => a.key));

  // Build a set of flagged landmark indices
  const flaggedLMs = new Set();
  angleResults.filter(a => a.flagged).forEach(({ key }) => {
    const def = ANGLE_DEFS.find(d => d.key === key);
    if (def) flaggedLMs.add(def.b);
  });

  // Draw bones
  CONNECTIONS.forEach(([i, j]) => {
    const a = landmarks[i];
    const b = landmarks[j];
    if (!a || !b || a.visibility < 0.3 || b.visibility < 0.3) return;
    ctx.beginPath();
    ctx.moveTo(a.x * W, a.y * H);
    ctx.lineTo(b.x * W, b.y * H);
    ctx.strokeStyle = "rgba(167, 139, 250, 0.85)";
    ctx.lineWidth   = 2.5;
    ctx.stroke();
  });

  // Draw joints
  landmarks.forEach((lm, i) => {
    if (!lm || lm.visibility < 0.3) return;
    const x = lm.x * W;
    const y = lm.y * H;
    const isFlagged = flaggedLMs.has(i);

    // Glow for flagged
    if (isFlagged) {
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239, 68, 68, 0.2)";
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(x, y, isFlagged ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle   = isFlagged ? "#ef4444" : "#a78bfa";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();
  });

  highlightErrors(ctx, landmarks, W, H, angleResults);
}

// ── Utility: draw angle labels near flagged joints ────────────────────────────
function highlightErrors(ctx, landmarks, W, H, angleResults) {
  angleResults.forEach(({ angle, flagged, vertex }) => {
    if (!vertex) return;
    const x = vertex.x * W;
    const y = vertex.y * H;
    const label = `${angle}°`;

    ctx.font      = "bold 11px 'Segoe UI', sans-serif";
    const tw      = ctx.measureText(label).width;
    const pad     = 4;
    const bx      = x + 10;
    const by      = y - 18;

    // Background pill
    ctx.fillStyle   = flagged ? "rgba(239,68,68,0.9)" : "rgba(109,40,217,0.85)";
    ctx.beginPath();
    ctx.roundRect(bx - pad, by - 13, tw + pad * 2, 18, 4);
    ctx.fill();

    // Text
    ctx.fillStyle = "#fff";
    ctx.fillText(label, bx, by);
  });
}


// ── OpenCV.js preprocessing ───────────────────────────────────────────────────
// Resizes and normalizes the image using OpenCV.js if available.
// Returns a data URL of the processed image, or the original if cv not ready.
function preprocessWithOpenCV(imgElement, targetSize = 640) {
  try {
    const cv = window.cv;
    if (!cv) return null;

    const src = cv.imread(imgElement);
    const dst = new cv.Mat();

    // Resize so the longest side = targetSize
    const { width: w, height: h } = src.size();
    const scale = targetSize / Math.max(w, h);
    const newW  = Math.round(w * scale);
    const newH  = Math.round(h * scale);
    cv.resize(src, dst, new cv.Size(newW, newH), 0, 0, cv.INTER_AREA);

    // Write to an offscreen canvas and return data URL
    const offscreen = document.createElement("canvas");
    offscreen.width  = newW;
    offscreen.height = newH;
    cv.imshow(offscreen, dst);

    src.delete();
    dst.delete();
    return offscreen.toDataURL("image/jpeg", 0.92);
  } catch {
    return null;
  }
}


// ── MediaPipe Pose (Tasks Vision API) detection ───────────────────────────────
async function detectWithMediaPipe(imgElement) {
  try {
    const landmarker = await getAPLandmarker();
    const result     = landmarker.detect(imgElement);
    if (!result.landmarks?.length) return null;
    return result.landmarks[0].map(lm => ({
      x: lm.x, y: lm.y, z: lm.z ?? 0,
      visibility: lm.visibility ?? 0.9,
    }));
  } catch {
    return null;
  }
}


// ── Main component ────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const [imageSrc,      setImageSrc]      = useState(null);
  const [processedSrc,  setProcessedSrc]  = useState(null);
  const [file,          setFile]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [angles,        setAngles]        = useState([]);
  const [feedback,      setFeedback]      = useState([]);
  const [confidence,    setConfidence]    = useState(null);
  const [showSkeleton,  setShowSkeleton]  = useState(true);
  const [showFeedback,  setShowFeedback]  = useState(true);
  const [dragOver,      setDragOver]      = useState(false);

  const imgRef      = useRef(null);   // original <img>
  const procRef     = useRef(null);   // processed <img>
  const canvasRef   = useRef(null);   // overlay canvas
  const landmarkRef = useRef(null);   // { lms, normalized, imgW, imgH }
  const anglesRef   = useRef([]);     // mirror of angles for draw callbacks

  // Keep anglesRef in sync
  useEffect(() => { anglesRef.current = angles; }, [angles]);

  // ── Core draw function ─────────────────────────────────────────────────────
  // Measures the actual rendered image rect, positions the canvas pixel-
  // perfectly over it, then draws skeleton + angle labels.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = procRef.current;
    const data   = landmarkRef.current;
    if (!canvas || !img || !data) return;

    const imgRect       = img.getBoundingClientRect();
    const containerRect = img.parentElement.getBoundingClientRect();
    const drawW = imgRect.width;
    const drawH = imgRect.height;
    const offX  = imgRect.left - containerRect.left;
    const offY  = imgRect.top  - containerRect.top;

    if (drawW < 1 || drawH < 1) return;

    canvas.style.left   = `${offX}px`;
    canvas.style.top    = `${offY}px`;
    canvas.style.width  = `${drawW}px`;
    canvas.style.height = `${drawH}px`;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(drawW * dpr);
    canvas.height = Math.round(drawH * dpr);

    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, drawW, drawH);

    if (!showSkeleton) return;

    const lms           = data.lms;
    const currentAngles = anglesRef.current;

    const flaggedLMs = new Set();
    currentAngles.filter(a => a.flagged).forEach(({ key }) => {
      const def = ANGLE_DEFS.find(d => d.key === key);
      if (def) flaggedLMs.add(def.b);
    });

    // Map keypoint → canvas px (normalized 0-1 or absolute pixels)
    const toX = data.normalized
      ? (lm) => lm.x * drawW
      : (lm) => (lm.x / data.imgW) * drawW;
    const toY = data.normalized
      ? (lm) => lm.y * drawH
      : (lm) => (lm.y / data.imgH) * drawH;

    // Bones
    CONNECTIONS.forEach(([i, j]) => {
      const a = lms[i]; const b = lms[j];
      if (!a || !b || (a.visibility ?? 1) < 0.25 || (b.visibility ?? 1) < 0.25) return;
      ctx.beginPath();
      ctx.moveTo(toX(a), toY(a));
      ctx.lineTo(toX(b), toY(b));
      ctx.strokeStyle = "rgba(123, 97, 255, 0.9)";
      ctx.lineWidth   = 2.5;
      ctx.stroke();
    });

    // Joints
    lms.forEach((lm, i) => {
      if (!lm || (lm.visibility ?? 1) < 0.25) return;
      const x = toX(lm); const y = toY(lm);
      const isFlagged = flaggedLMs.has(i);
      if (isFlagged) {
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(236, 72, 153, 0.2)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, isFlagged ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle   = isFlagged ? "#EC4899" : "#7B61FF";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
    });

    // Angle labels
    currentAngles.forEach(({ angle, flagged, vertex }) => {
      if (!vertex) return;
      const x = data.normalized ? vertex.x * drawW : (vertex.x / data.imgW) * drawW;
      const y = data.normalized ? vertex.y * drawH : (vertex.y / data.imgH) * drawH;
      const label = `${angle}°`;
      ctx.font = "bold 11px 'Segoe UI', sans-serif";
      const tw = ctx.measureText(label).width;
      const pad = 4; const bx = x + 10; const by = y - 18;
      ctx.fillStyle = flagged ? "rgba(236,72,153,0.92)" : "rgba(123,97,255,0.9)";
      ctx.beginPath();
      ctx.roundRect(bx - pad, by - 13, tw + pad * 2, 18, 4);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, bx, by);
    });
  }, [showSkeleton]);

  // Redraw on toggle/angle changes
  useEffect(() => { redraw(); }, [showSkeleton, angles, redraw]);

  // ResizeObserver keeps canvas synced on layout changes
  useEffect(() => {
    const img = procRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => redraw());
    ro.observe(img);
    return () => ro.disconnect();
  }, [redraw, processedSrc]);

  // ── File selection ─────────────────────────────────────────────────────────
  const handleFile = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) { setError("Please select a valid image file."); return; }
    setFile(f);
    setError(null);
    setAngles([]);
    setFeedback([]);
    setConfidence(null);
    landmarkRef.current = null;
    const url = URL.createObjectURL(f);
    setImageSrc(url);
    setProcessedSrc(url);
  }, []);

  const onInputChange = (e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); };
  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  // ── Main analysis handler ──────────────────────────────────────────────────
  const handleAnalyze = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setAngles([]);
    setFeedback([]);
    landmarkRef.current = null;

    try {
      // Step 1: OpenCV preprocessing (optional)
      if (imgRef.current) {
        const cvUrl = preprocessWithOpenCV(imgRef.current);
        if (cvUrl) setProcessedSrc(cvUrl);
      }

      // Step 2: Try MediaPipe JS (normalized 0-1 coords)
      const targetImg = procRef.current || imgRef.current;
      const mpLandmarks = targetImg ? await detectWithMediaPipe(targetImg) : null;

      if (mpLandmarks) {
        const computed = computeAngles(mpLandmarks);
        const msgs     = computed.filter(a => a.flagged)
                                 .map(a => FEEDBACK_MAP[a.key] || `${a.label} angle is off.`);
        landmarkRef.current = { lms: mpLandmarks, normalized: true, imgW: 0, imgH: 0 };
        setAngles(computed);
        setFeedback(msgs);
        setConfidence(1.0);
        requestAnimationFrame(() => requestAnimationFrame(redraw));
        // Persist async
        const form = new FormData(); form.append("file", file);
        axios.post(API_URL, form).catch(() => {});

      } else {
        // Step 3: Server-side fallback (absolute pixel coords)
        const form = new FormData(); form.append("file", file);
        const { data } = await axios.post(API_URL, form);
        setConfidence(data.confidence || 0);

        if (data.keypoints?.length) {
          const imgW = data.image_width  || 1;
          const imgH = data.image_height || 1;
          const lmArray = Array(33).fill(null);
          data.keypoints.forEach(kp => {
            if (kp.index != null) lmArray[kp.index] = { x: kp.x, y: kp.y, visibility: kp.score ?? 0.9 };
          });
          landmarkRef.current = { lms: lmArray, normalized: false, imgW, imgH };

          // Normalize for computeAngles (needs 0-1)
          const normLms = lmArray.map(lm => lm ? { x: lm.x / imgW, y: lm.y / imgH, visibility: lm.visibility } : null);
          const computed = computeAngles(normLms);
          // Re-attach absolute vertex coords for label drawing
          const computedAbs = computed.map(a => ({
            ...a,
            vertex: a.vertex ? { x: a.vertex.x * imgW, y: a.vertex.y * imgH } : null,
          }));

          setAngles(computedAbs);
          const serverFeedback = (data.analysis?.errors || []).map(e => e.message);
          setFeedback(serverFeedback.length ? serverFeedback :
            computedAbs.filter(a => a.flagged).map(a => FEEDBACK_MAP[a.key] || `${a.label} angle is off.`)
          );
          requestAnimationFrame(() => requestAnimationFrame(redraw));
        } else {
          setFeedback(["No pose detected. Try a clearer full-body image."]);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || "Analysis failed. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const confClass    = confidence == null ? "" : confidence > 0.75 ? "high" : confidence > 0.4 ? "medium" : "low";
  const confLabel    = confidence == null ? "" : confidence > 0.75 ? "High confidence" : confidence > 0.4 ? "Medium confidence" : "Low confidence";
  const flaggedCount = angles.filter(a => a.flagged).length;

  return (
    <div className="ap-page">
      <Link to="/" className="ap-back">
        <ArrowLeft size={13} /> Dashboard
      </Link>

      <div className="ap-header">
        <h1>Analysis <span>Mode</span></h1>
        <p>Upload an image to detect pose keypoints, measure joint angles, and get AI correction feedback.</p>
      </div>

      <div
        className={`ap-upload-zone${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <input type="file" accept="image/*" onChange={onInputChange} />
        <div className="ap-upload-icon">
          <ImageIcon size={34} color="var(--purple-300)" strokeWidth={1.5} />
        </div>
        {file
          ? <p><strong>{file.name}</strong> — ready to analyze</p>
          : <p>Drag &amp; drop an image here, or <strong>click to browse</strong></p>
        }
      </div>

      <div className="ap-toolbar">
        <button className={`ap-toggle${showSkeleton ? " active" : ""}`} onClick={() => setShowSkeleton(v => !v)}>
          <Bone size={13} /> {showSkeleton ? "Hide Skeleton" : "Show Skeleton"}
        </button>
        <button className={`ap-toggle${showFeedback ? " active" : ""}`} onClick={() => setShowFeedback(v => !v)}>
          <Lightbulb size={13} /> {showFeedback ? "Hide AI Feedback" : "Show AI Feedback"}
        </button>
        <button className="ap-analyze-btn" onClick={handleAnalyze} disabled={!file || loading}>
          {loading ? "Analyzing…" : <><ScanSearch size={13} style={{ marginRight: 6 }} />Analyze Pose</>}
        </button>
      </div>

      {loading && (
        <div className="ap-loading">
          <div className="ap-loading-track"><div className="ap-loading-fill" /></div>
          <span>Detecting pose…</span>
        </div>
      )}
      {error && (
        <div className="ap-error">
          <AlertCircle size={14} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {imageSrc ? (
        <div className="ap-split">
          <div className="ap-panel">
            <div className="ap-panel-header">
              <span className="ap-panel-title">Original Image</span>
              {file && <span className="ap-panel-badge">{file.name}</span>}
            </div>
            <div className="ap-canvas-wrap">
              <img ref={imgRef} src={imageSrc} alt="Original" crossOrigin="anonymous" />
            </div>
          </div>

          <div className="ap-panel">
            <div className="ap-panel-header">
              <span className="ap-panel-title">Pose Analysis</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {confidence != null && <span className={`ap-conf ${confClass}`}>● {confLabel}</span>}
                {flaggedCount > 0 && (
                  <span className="ap-panel-badge" style={{ background: "var(--error-bg)", color: "var(--error-text)" }}>
                    {flaggedCount} issue{flaggedCount !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="ap-canvas-wrap">
              <img
                ref={procRef}
                src={processedSrc || imageSrc}
                alt="Processed"
                crossOrigin="anonymous"
                onLoad={() => requestAnimationFrame(() => requestAnimationFrame(redraw))}
              />
              <canvas ref={canvasRef} />
            </div>
          </div>
        </div>
      ) : (
        <div className="ap-panel">
          <div className="ap-placeholder">
            <Camera size={36} color="var(--purple-300)" strokeWidth={1.5} style={{ marginBottom: 10 }} />
            Upload an image above to begin pose analysis
          </div>
        </div>
      )}

      {showFeedback && (angles.length > 0 || feedback.length > 0) && (
        <div className="ap-feedback">
          <h3>Joint Angles &amp; AI Feedback</h3>
          {angles.length > 0 && (
            <div className="ap-angles-grid">
              {angles.map(({ key, label, angle, flagged }) => (
                <div key={key} className={`ap-angle-card${flagged ? " flagged" : ""}`}>
                  <div className="ap-angle-card-label">{label}</div>
                  <div className="ap-angle-card-value">{angle}<span className="ap-angle-card-unit">°</span></div>
                  <div className="ap-angle-card-status">
                    {flagged
                      ? <><AlertCircle size={10} style={{ marginRight: 3 }} />Needs correction</>
                      : <><CheckCircle size={10} style={{ marginRight: 3 }} />Good</>
                    }
                  </div>
                </div>
              ))}
            </div>
          )}
          {feedback.length > 0 ? (
            <ul className="ap-feedback-list">
              {feedback.map((msg, i) => (
                <li key={i} className="ap-feedback-item">
                  <ChevronRight size={13} className="bullet" style={{ flexShrink: 0, color: "var(--orange-text)" }} />{msg}
                </li>
              ))}
            </ul>
          ) : angles.length > 0 ? (
            <div className="ap-no-issues">
              <CheckCircle size={13} style={{ marginRight: 6 }} />All joint angles look good — great pose!
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
