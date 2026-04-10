/**
 * CameraCapture.jsx
 *
 * Self-contained webcam capture component.
 * Lifecycle: idle → live → captured
 *
 * Props:
 *   onCapture(file, previewUrl) — called when user confirms a capture
 *   onClose()                  — called when user dismisses the camera
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Camera, X, RefreshCw, Check, VideoOff } from "lucide-react";
import "./CameraCapture.css";

// States internal to this component
const CAM_IDLE     = "idle";      // camera not yet opened
const CAM_STARTING = "starting";  // requesting permission / loading stream
const CAM_LIVE     = "live";      // stream active, showing viewfinder
const CAM_CAPTURED = "captured";  // frame frozen, showing preview
const CAM_ERROR    = "error";     // permission denied or device error

export default function CameraCapture({ onCapture, onClose }) {
  const [camState,  setCamState]  = useState(CAM_IDLE);
  const [camError,  setCamError]  = useState(null);
  const [snapUrl,   setSnapUrl]   = useState(null);   // data URL of captured frame

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const streamRef  = useRef(null);   // MediaStream — must be stopped on cleanup

  // ── Stop all tracks and release camera ─────────────────────────────────────
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Stop camera when component unmounts
  useEffect(() => () => stopStream(), [stopStream]);

  // ── Open camera ────────────────────────────────────────────────────────────
  const openCamera = useCallback(async () => {
    setCamState(CAM_STARTING);
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState(CAM_LIVE);
    } catch (err) {
      const msg = err.name === "NotAllowedError"
        ? "Camera permission denied. Please allow camera access in your browser settings."
        : err.name === "NotFoundError"
        ? "No camera found on this device."
        : `Camera error: ${err.message}`;
      setCamError(msg);
      setCamState(CAM_ERROR);
    }
  }, []);

  // ── Capture frame from video ───────────────────────────────────────────────
  const captureFrame = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;
    canvas.width  = W;
    canvas.height = H;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, W, H);

    const dataUrl = canvas.toDataURL("image/png");
    setSnapUrl(dataUrl);
    setCamState(CAM_CAPTURED);

    // Stop live stream — camera light turns off
    stopStream();
  }, [stopStream]);

  // ── Retake — restart stream ────────────────────────────────────────────────
  const retake = useCallback(() => {
    setSnapUrl(null);
    openCamera();
  }, [openCamera]);

  // ── Confirm capture — convert canvas to File and hand off ─────────────────
  const confirmCapture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `webcam_${Date.now()}.png`, { type: "image/png" });
      onCapture(file, snapUrl);
    }, "image/png");
  }, [snapUrl, onCapture]);

  // ── Close — stop stream and notify parent ──────────────────────────────────
  const handleClose = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="cc-root">
      {/* Header row */}
      <div className="cc-header">
        <span className="cc-title">
          <Camera size={14} style={{ marginRight: 6 }} />
          Camera Capture
        </span>
        <button className="cc-close" onClick={handleClose} aria-label="Close camera">
          <X size={16} />
        </button>
      </div>

      {/* Viewfinder / preview area */}
      <div className="cc-viewport">
        {/* Live video — visible only in live state */}
        <video
          ref={videoRef}
          className={`cc-video${camState === CAM_LIVE ? " visible" : ""}`}
          playsInline
          muted
          aria-label="Camera viewfinder"
        />

        {/* Captured snapshot */}
        {camState === CAM_CAPTURED && snapUrl && (
          <img src={snapUrl} alt="Captured frame" className="cc-snapshot" />
        )}

        {/* Idle state */}
        {camState === CAM_IDLE && (
          <div className="cc-placeholder">
            <Camera size={40} color="var(--purple-300)" strokeWidth={1.5} />
            <p>Click "Open Camera" to start</p>
          </div>
        )}

        {/* Starting spinner */}
        {camState === CAM_STARTING && (
          <div className="cc-placeholder">
            <div className="cc-spinner" />
            <p>Requesting camera access…</p>
          </div>
        )}

        {/* Error state */}
        {camState === CAM_ERROR && (
          <div className="cc-placeholder cc-placeholder--error">
            <VideoOff size={36} color="var(--error-text)" strokeWidth={1.5} />
            <p>{camError}</p>
          </div>
        )}

        {/* Capture crosshair overlay on live */}
        {camState === CAM_LIVE && (
          <div className="cc-crosshair" aria-hidden="true">
            <span /><span /><span /><span />
          </div>
        )}

        {/* Captured badge */}
        {camState === CAM_CAPTURED && (
          <div className="cc-captured-badge">
            <Check size={12} style={{ marginRight: 4 }} /> Captured
          </div>
        )}
      </div>

      {/* Hidden canvas used for frame extraction */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Action buttons */}
      <div className="cc-actions">
        {camState === CAM_IDLE && (
          <button className="cc-btn cc-btn--primary" onClick={openCamera}>
            <Camera size={14} /> Open Camera
          </button>
        )}

        {camState === CAM_STARTING && (
          <button className="cc-btn cc-btn--primary" disabled>
            <div className="cc-spinner cc-spinner--sm" /> Starting…
          </button>
        )}

        {camState === CAM_LIVE && (
          <button className="cc-btn cc-btn--capture" onClick={captureFrame}>
            <div className="cc-shutter" /> Capture
          </button>
        )}

        {camState === CAM_CAPTURED && (
          <>
            <button className="cc-btn cc-btn--secondary" onClick={retake}>
              <RefreshCw size={13} /> Retake
            </button>
            <button className="cc-btn cc-btn--primary" onClick={confirmCapture}>
              <Check size={13} /> Use This Photo
            </button>
          </>
        )}

        {camState === CAM_ERROR && (
          <button className="cc-btn cc-btn--secondary" onClick={openCamera}>
            <RefreshCw size={13} /> Try Again
          </button>
        )}
      </div>
    </div>
  );
}
