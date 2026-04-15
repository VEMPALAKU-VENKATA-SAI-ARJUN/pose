/**
 * WebcamPose.jsx
 * Real-time pose detection from webcam using MediaPipe Tasks Vision.
 *
 * Architecture:
 *   init()     — creates PoseLandmarker in VIDEO mode
 *   detect()   — called every frame via requestAnimationFrame
 *   draw()     — renders landmarks + skeleton on the overlay canvas
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { PoseLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { SKELETON_CONNECTIONS, getLM, toPixel, drawSkeleton, drawBoxes } from "./anatomyUtils";
import "./WebcamPose.css";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

// ── Initialisation ────────────────────────────────────────────────────────────

async function init() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
  );
  return PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",   // VIDEO mode for real-time stream
    numPoses: 1,
  });
}

// ── Drawing ───────────────────────────────────────────────────────────────────

function draw(ctx, landmarks, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!landmarks?.length) return;

  // Use the same professional construction rendering as the image mode
  drawSkeleton(ctx, [landmarks[0]], W, H, 0.85);
  drawBoxes(ctx,    [landmarks[0]], W, H, 0.85);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WebcamPose() {
  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const landmarker = useRef(null);
  const rafId      = useRef(null);
  const streamRef  = useRef(null);
  const lastTs     = useRef(-1);

  const [status,    setStatus]    = useState("idle");   // idle|loading|running|error
  const [errMsg,    setErrMsg]    = useState("");
  const [fps,       setFps]       = useState(0);
  const [visible,   setVisible]   = useState(0);

  const fpsFrames = useRef(0);
  const fpsTimer  = useRef(Date.now());

  // ── Detection loop ──────────────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const lm     = landmarker.current;

    if (!video || !canvas || !lm || video.readyState < 2) {
      rafId.current = requestAnimationFrame(detect);
      return;
    }

    // Sync canvas size to video
    const W = video.videoWidth;
    const H = video.videoHeight;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width  = W;
      canvas.height = H;
    }

    // Run detection (VIDEO mode requires monotonically increasing timestamps)
    const now = performance.now();
    if (now !== lastTs.current) {
      lastTs.current = now;
      const result = lm.detectForVideo(video, now);
      const ctx    = canvas.getContext("2d");
      draw(ctx, result.landmarks, W, H);

      // Count visible landmarks
      if (result.landmarks?.[0]) {
        setVisible(result.landmarks[0].filter(l => (l.visibility ?? 1) >= 0.3).length);
      } else {
        setVisible(0);
      }
    }

    // FPS counter
    fpsFrames.current++;
    const elapsed = Date.now() - fpsTimer.current;
    if (elapsed >= 1000) {
      setFps(Math.round((fpsFrames.current * 1000) / elapsed));
      fpsFrames.current = 0;
      fpsTimer.current  = Date.now();
    }

    rafId.current = requestAnimationFrame(detect);
  }, []);

  // ── Start ───────────────────────────────────────────────────────────────────
  const start = useCallback(async () => {
    setStatus("loading");
    setErrMsg("");

    try {
      // Init model
      if (!landmarker.current) {
        landmarker.current = await init();
      }

      // Request webcam
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      setStatus("running");
      rafId.current = requestAnimationFrame(detect);
    } catch (e) {
      const msg = e.name === "NotAllowedError"
        ? "Camera permission denied."
        : e.name === "NotFoundError"
        ? "No camera found on this device."
        : `Error: ${e.message}`;
      setErrMsg(msg);
      setStatus("error");
    }
  }, [detect]);

  // ── Stop ────────────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    setStatus("idle");
    setFps(0);
    setVisible(0);
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafId.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="wp-root">

      {/* Header */}
      <div className="wp-header">
        <span className="wp-title">Live Pose Detection</span>
        <div className="wp-stats">
          {status === "running" && (
            <>
              <span className="wp-badge wp-badge--green">● Live</span>
              <span className="wp-badge">{fps} fps</span>
              <span className="wp-badge">{visible} / 33 keypoints</span>
            </>
          )}
          {status === "loading" && <span className="wp-badge">Loading model…</span>}
          {status === "error"   && <span className="wp-badge wp-badge--red">⚠ {errMsg}</span>}
        </div>
        <div className="wp-controls">
          {status !== "running"
            ? <button className="wp-btn wp-btn--start" onClick={start} disabled={status === "loading"}>
                {status === "loading" ? "Starting…" : "▶ Start Camera"}
              </button>
            : <button className="wp-btn wp-btn--stop" onClick={stop}>
                ■ Stop
              </button>
          }
        </div>
      </div>

      {/* Viewport */}
      <div className="wp-viewport">
        {/* Video element — mirrored for natural selfie view */}
        <video
          ref={videoRef}
          className="wp-video"
          playsInline
          muted
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Canvas overlay — also mirrored to match video */}
        <canvas
          ref={canvasRef}
          className="wp-canvas"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Idle placeholder */}
        {status === "idle" && (
          <div className="wp-placeholder">
            <span className="wp-placeholder-icon">📷</span>
            <p>Click "Start Camera" to begin real-time pose detection</p>
          </div>
        )}

        {/* Loading spinner */}
        {status === "loading" && (
          <div className="wp-placeholder">
            <div className="wp-spinner" />
            <p>Initialising MediaPipe model…</p>
          </div>
        )}
      </div>

      {/* Legend */}
      {status === "running" && (
        <div className="wp-legend">
          <span className="wp-legend-item">
            <span style={{ background: "#a5b4fc", width: 10, height: 10, borderRadius: "50%", display: "inline-block", marginRight: 5 }} />
            Keypoints
          </span>
          <span className="wp-legend-item">
            <span style={{ background: "rgba(99,102,241,0.85)", width: 20, height: 2, display: "inline-block", marginRight: 5, verticalAlign: "middle" }} />
            Skeleton
          </span>
          <span className="wp-legend-item" style={{ color: "var(--text-secondary)", fontSize: 11 }}>
            Landmarks with visibility &lt; 30% are hidden
          </span>
        </div>
      )}
    </div>
  );
}
