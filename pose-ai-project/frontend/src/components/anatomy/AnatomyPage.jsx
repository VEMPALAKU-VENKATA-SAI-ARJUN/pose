/**
 * AnatomyPage.jsx — Anatomy Breakdown Mode
 *
 * Upload an image → MediaPipe detects 33 keypoints →
 * Canvas renders skeleton / boxes / cylinders as construction guides.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Upload, Bone, Box, Layers, RotateCcw, Camera, BookOpen } from "lucide-react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import AnatomyCanvas from "./AnatomyCanvas";
import WebcamPose    from "./WebcamPose";
import "./AnatomyPage.css";

// ── MediaPipe singleton ───────────────────────────────────────────────────────
let _landmarkerPromise = null;

async function getLandmarker() {
  if (!_landmarkerPromise) {
    _landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );
      return PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          // Use local model file served from /public — avoids CDN timeout
          modelAssetPath: "/pose_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        numPoses: 1,
      });
    })();
  }
  return _landmarkerPromise;
}

// ── Mode definitions ──────────────────────────────────────────────────────────
const MODES = [
  { id: "skeleton", label: "Skeleton",  Icon: Bone      },
  { id: "shapes",   label: "Shapes",    Icon: Box       },
  { id: "combined", label: "Combined",  Icon: Layers    },
  { id: "diagram",  label: "Diagram",   Icon: BookOpen  },
];

// ── Legend items ──────────────────────────────────────────────────────────────
const LEGEND = [
  { color: "#38bdf8",              label: "Skeleton — joints and bone lines" },
  { color: "rgba(91,127,166,0.8)", label: "Ribcage — upper torso mass" },
  { color: "rgba(78,112,144,0.8)", label: "Abdomen — lower torso" },
  { color: "rgba(122,95,168,0.8)", label: "Pelvis — hip girdle" },
  { color: "rgba(136,120,184,0.8)",label: "Deltoid — shoulder mass" },
  { color: "rgba(184,104,120,0.8)",label: "Arms — upper arm / forearm" },
  { color: "rgba(184,144,64,0.8)", label: "Legs — thigh / calf" },
];

const TIPS = [
  "The torso box shows the rib cage volume and tilt.",
  "Pelvis tilt is key to natural weight distribution.",
  "Cylinder thickness hints at muscle mass.",
  "Skeleton lines reveal the gesture and flow.",
  "Combined view shows how forms stack together.",
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnatomyPage() {
  const location = useLocation();

  const [imageSrc,   setImageSrc]   = useState(null);
  const [landmarks,  setLandmarks]  = useState(null);
  const [mode,       setMode]       = useState("combined");
  const [opacity,    setOpacity]    = useState(0.85);
  const [status,     setStatus]     = useState("idle"); // idle|loading|done|error
  const [errMsg,     setErrMsg]     = useState("");
  const [tipIdx,     setTipIdx]     = useState(0);
  const [stats,      setStats]      = useState(null);
  const [inputMode,  setInputMode]  = useState("image"); // "image" | "webcam"
  const [showLabels, setShowLabels] = useState(true);
  const [fromLibrary,setFromLibrary]= useState(false);
  const [libraryPose,setLibraryPose]= useState(null);

  const fileInputRef = useRef(null);

  // Rotate tips every 4s
  useEffect(() => {
    const id = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 4000);
    return () => clearInterval(id);
  }, []);

  // Auto-load pose from Pose Library navigation
  useEffect(() => {
    const incoming = location.state?.pose;
    const stored   = (() => {
      try { return JSON.parse(localStorage.getItem("selectedPose")); } catch { return null; }
    })();
    const pose = incoming || stored;
    if (!pose?.imageUrl) return;

    if (incoming) localStorage.setItem("selectedPose", JSON.stringify(incoming));
    setFromLibrary(true);
    setLibraryPose(pose);
    setInputMode("image");
    setImageSrc(pose.imageUrl);
    detectPose(pose.imageUrl);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect pose ─────────────────────────────────────────────────────────────
  const detectPose = useCallback(async (src) => {
    setStatus("loading");
    setLandmarks(null);
    setStats(null);
    setErrMsg("");

    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.crossOrigin = "anonymous";
        i.onload  = () => res(i);
        i.onerror = () => rej(new Error("Image failed to load"));
        i.src = src;
      });

      const landmarker = await getLandmarker();
      const result     = landmarker.detect(img);

      if (!result.landmarks?.length) {
        setErrMsg("No pose detected — try a clearer full-body photo.");
        setStatus("error");
        return;
      }

      const lms = result.landmarks[0].map(lm => ({
        x: lm.x, y: lm.y, z: lm.z ?? 0,
        visibility: lm.visibility ?? 0.9,
      }));

      const visible = lms.filter(lm => (lm.visibility ?? 1) >= 0.3).length;
      setStats({ total: lms.length, visible, imgW: img.naturalWidth, imgH: img.naturalHeight });
      setLandmarks(lms);
      setStatus("done");
    } catch (e) {
      _landmarkerPromise = null; // reset so retry works
      setErrMsg(e.message || "Detection failed.");
      setStatus("error");
    }
  }, []);

  // Auto-load pose from Pose Library — runs after detectPose is defined
  useEffect(() => {
    const incoming = location.state?.pose;
    const stored   = (() => {
      try { return JSON.parse(localStorage.getItem("selectedPose")); } catch { return null; }
    })();
    const pose = incoming || stored;
    if (!pose?.imageUrl) return;

    if (incoming) localStorage.setItem("selectedPose", JSON.stringify(incoming));
    setFromLibrary(true);
    setLibraryPose(pose);
    setInputMode("image");
    setImageSrc(pose.imageUrl);
    detectPose(pose.imageUrl);
  }, [detectPose]); // detectPose is stable (useCallback with no deps)

  // ── File upload ─────────────────────────────────────────────────────────────
  const handleFile = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    detectPose(url);
  }, [detectPose]);

  const onInputChange = e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); };

  const onDrop = useCallback(e => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const reset = () => {
    setImageSrc(null);
    setLandmarks(null);
    setStatus("idle");
    setErrMsg("");
    setStats(null);
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="anat-page">

      {/* Top bar */}
      <div className="anat-topbar">
        <Link to="/" className="anat-back"><ArrowLeft size={13} /> Dashboard</Link>

        <span className="anat-title">Anatomy <span>Breakdown</span></span>

        {/* Mode toggles */}
        <div className="anat-modes">
          {MODES.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`anat-mode-btn${mode === id ? " active" : ""}`}
              onClick={() => setMode(id)}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <div className="anat-topbar-right">
          {/* Opacity — hidden in diagram mode */}
          {mode !== "diagram" && (
            <div className="anat-opacity-wrap">
              <span>Opacity</span>
              <input
                type="range"
                className="anat-opacity-slider"
                min="0.2" max="1" step="0.05"
                value={opacity}
                onChange={e => setOpacity(parseFloat(e.target.value))}
              />
              <span>{Math.round(opacity * 100)}%</span>
            </div>
          )}

          {/* Labels toggle — diagram mode only */}
          {mode === "diagram" && (
            <button
              className={`anat-mode-btn${showLabels ? " active" : ""}`}
              onClick={() => setShowLabels(v => !v)}
            >
              <BookOpen size={12} /> {showLabels ? "Labels On" : "Labels Off"}
            </button>
          )}

          {/* Reset */}
          {imageSrc && inputMode === "image" && (
            <button className="anat-mode-btn" onClick={reset}>
              <RotateCcw size={12} /> Reset
            </button>
          )}

          {/* Input mode tabs */}
          <button
            className={`anat-mode-btn${inputMode === "image" ? " active" : ""}`}
            onClick={() => setInputMode("image")}
          >
            <Upload size={12} /> Image
          </button>
          <button
            className={`anat-mode-btn${inputMode === "webcam" ? " active" : ""}`}
            onClick={() => setInputMode("webcam")}
          >
            <Camera size={12} /> Webcam
          </button>

          {/* Upload — only in image mode */}
          {inputMode === "image" && (
            <button className="anat-upload-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={13} /> Upload Image
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={onInputChange}
          />
        </div>
      </div>

      {/* From-library banner */}
      {fromLibrary && libraryPose && (
        <div className="anat-library-banner">
          <span>📚 Loaded from Pose Library — <strong>{libraryPose.title}</strong></span>
          <Link to="/pose-library" className="anat-library-link">← Back to Library</Link>
        </div>
      )}

      {/* Body */}
      <div className="anat-body">

        {/* Canvas area */}
        <div
          className="anat-canvas-area"
          onDragOver={e => e.preventDefault()}
          onDrop={onDrop}
        >
          {inputMode === "webcam" ? (
            <WebcamPose />
          ) : !imageSrc ? (
            <div className="anat-empty">
              <div className="anat-empty-icon">🦴</div>
              <p>Upload a full-body photo to see the anatomy breakdown overlay.</p>
              <button className="anat-upload-btn" style={{ marginTop: 8 }}
                onClick={() => fileInputRef.current?.click()}>
                <Upload size={13} /> Choose Image
              </button>
            </div>
          ) : (
            <AnatomyCanvas
              imageSrc={imageSrc}
              landmarks={landmarks}
              mode={mode}
              opacity={opacity}
              showLabels={showLabels}
            />
          )}

          {/* Loading overlay */}
          {status === "loading" && (
            <div className="anat-loading">
              <div className="anat-spinner" />
              <span>Detecting pose…</span>
            </div>
          )}

          {/* Error */}
          {status === "error" && (
            <div className="anat-error">⚠ {errMsg}</div>
          )}
        </div>
        {/* Side panel */}
        <div className="anat-panel">

          {/* Legend */}
          <div>
            <div className="anat-panel-title">Colour Legend</div>
            <div className="anat-legend">
              {LEGEND.map((item, i) => (
                <div key={i} className="anat-legend-item">
                  <div className="anat-legend-swatch" style={{ background: item.color }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div>
              <div className="anat-panel-title">Detection</div>
              <div className="anat-stats">
                <div className="anat-stat-row">
                  <span>Keypoints detected</span>
                  <span className="anat-stat-val">{stats.visible} / {stats.total}</span>
                </div>
                <div className="anat-stat-row">
                  <span>Image size</span>
                  <span className="anat-stat-val">{stats.imgW} × {stats.imgH}</span>
                </div>
                <div className="anat-stat-row">
                  <span>Mode</span>
                  <span className="anat-stat-val" style={{ textTransform: "capitalize" }}>{mode}</span>
                </div>
              </div>
            </div>
          )}

          {/* Rotating tip */}
          <div>
            <div className="anat-panel-title">Drawing Tip</div>
            <div className="anat-tip">💡 {TIPS[tipIdx]}</div>
          </div>

          {/* Mode guide */}
          <div>
            <div className="anat-panel-title">View Guide</div>
            <div className="anat-legend">
              <div className="anat-legend-item">
                <Bone size={13} style={{ color: "var(--grad-from)", flexShrink: 0 }} />
                Skeleton — gesture and flow
              </div>
              <div className="anat-legend-item">
                <Box size={13} style={{ color: "var(--grad-from)", flexShrink: 0 }} />
                Shapes — volume and mass
              </div>
              <div className="anat-legend-item">
                <Layers size={13} style={{ color: "var(--grad-from)", flexShrink: 0 }} />
                Combined — full construction
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

