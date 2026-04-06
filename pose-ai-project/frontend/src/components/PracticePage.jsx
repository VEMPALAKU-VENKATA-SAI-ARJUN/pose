/**
 * PracticePage.jsx — Timed pose drawing practice
 *
 * Flow:
 *   IDLE    → user picks a timer duration, clicks "Start Practice"
 *   RUNNING → reference pose shown, countdown ticking
 *   DONE    → timer expired, user uploads their drawing
 *   REVIEW  → drawing compared against reference via /api/compare,
 *              skeleton overlay + score + suggestions shown
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft, Play, Square, RotateCcw, ArrowRight, SkipForward,
  Upload, Target, Timer, CheckCircle, ChevronRight, AlertCircle,
  ImageIcon, Send,
} from "lucide-react";
import poses from "../data/poseDataset.json";
import "./PracticePage.css";

const COMPARE_URL = "/api/compare";

// ── Timer options ─────────────────────────────────────────────────────────────
const TIMER_OPTIONS = [
 
 
  { label: "2min", seconds: 120 },
  { label: "5min", seconds: 300 },
  { label: "15min",  seconds: 900  },
  { label:"30min",seconds: 1800 },
   { label: "60min", seconds: 3600  }
];

// ── MediaPipe skeleton connections ────────────────────────────────────────────
const CONNECTIONS = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],
  [23,25],[25,27],[24,26],[26,28],
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickRandom(arr, exclude) {
  const pool = arr.filter(p => p.id !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function fmt(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function scoreColor(pct) {
  if (pct >= 80) return "var(--success-text)";
  if (pct >= 50) return "#f59e0b";
  return "var(--error-text)";
}

function scoreMsg(pct) {
  if (pct >= 85) return "Excellent! Your pose closely matches the reference.";
  if (pct >= 70) return "Good work — a few joints need minor adjustment.";
  if (pct >= 50) return "Decent attempt. Focus on the flagged joints below.";
  return "Keep practicing — review the suggestions and try again.";
}

// ── Arc progress component ────────────────────────────────────────────────────
function ArcTimer({ remaining, total, urgent }) {
  const R   = 54;
  const cx  = 70;
  const cy  = 70;
  const circ = 2 * Math.PI * R;
  const pct  = total > 0 ? remaining / total : 0;
  const offset = circ * (1 - pct);
  const stroke = urgent
    ? "url(#urgentGrad)"
    : "url(#normalGrad)";

  return (
    <div className="pp-arc-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <defs>
          <linearGradient id="normalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="var(--grad-from)" />
            <stop offset="100%" stopColor="var(--grad-to)" />
          </linearGradient>
          <linearGradient id="urgentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#EC4899" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>
        <circle className="pp-arc-track" cx={cx} cy={cy} r={R} />
        <circle
          className="pp-arc-fill"
          cx={cx} cy={cy} r={R}
          stroke={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="pp-arc-text">
        <span className="pp-arc-time" style={{ color: urgent ? "#ef4444" : "var(--text-primary)" }}>
          {fmt(remaining)}
        </span>
        <span className="pp-arc-sub">left</span>
      </div>
    </div>
  );
}

// ── Score ring ────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const pct    = Math.round(score);
  const R      = 36; const cx = 46; const cy = 46;
  const circ   = Math.PI * R;   // half-arc
  const filled = (pct / 100) * circ;
  const color  = scoreColor(pct);
  const arcPath = `M ${cx - R},${cy} A ${R},${R} 0 0,1 ${cx + R},${cy}`;

  return (
    <div className="pp-score-ring">
      <svg width="92" height="52" className="pp-score-svg" aria-hidden="true">
        <path d={arcPath} fill="none" stroke="var(--border)" strokeWidth="7" strokeLinecap="round" />
        <path d={arcPath} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`} />
      </svg>
      <div className="pp-score-info">
        <div className="pp-score-pct" style={{ color }}>{pct}%</div>
        <div className="pp-score-sub">Pose Match</div>
        <div className="pp-score-msg">{scoreMsg(pct)}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PracticePage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [phase,       setPhase]       = useState("idle");     // idle|running|done|review
  const [pose,        setPose]        = useState(() => pickRandom(poses, null));
  const [timerSecs,   setTimerSecs]   = useState(60);         // selected duration
  const [remaining,   setRemaining]   = useState(60);         // countdown value
  const [drawFile,    setDrawFile]    = useState(null);
  const [drawSrc,     setDrawSrc]     = useState(null);
  const [dragOver,    setDragOver]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [result,      setResult]      = useState(null);       // compare API response
  const [sessionCount,setSessionCount]= useState(0);

  const intervalRef  = useRef(null);
  const refImgRef    = useRef(null);   // reference <img> for compare
  const drawImgRef   = useRef(null);   // drawing <img>
  const drawCanvasRef= useRef(null);   // overlay canvas on drawing
  const landmarkRef  = useRef(null);   // { lms, imgW, imgH }

  // ── Timer logic ────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    setRemaining(timerSecs);
    setPhase("running");
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setPhase("done");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [timerSecs, stopTimer]);

  // Cleanup on unmount
  useEffect(() => () => stopTimer(), [stopTimer]);

  // Sync remaining when timer option changes (only in idle)
  useEffect(() => {
    if (phase === "idle") setRemaining(timerSecs);
  }, [timerSecs, phase]);

  // ── Canvas overlay drawing ─────────────────────────────────────────────────
  const redrawOverlay = useCallback(() => {
    const canvas = drawCanvasRef.current;
    const img    = drawImgRef.current;
    const data   = landmarkRef.current;
    if (!canvas || !img || !data) return;

    const imgRect       = img.getBoundingClientRect();
    const containerRect = img.parentElement.getBoundingClientRect();
    const drawW = imgRect.width;
    const drawH = imgRect.height;
    if (drawW < 1 || drawH < 1) return;

    canvas.style.left   = `${imgRect.left - containerRect.left}px`;
    canvas.style.top    = `${imgRect.top  - containerRect.top}px`;
    canvas.style.width  = `${drawW}px`;
    canvas.style.height = `${drawH}px`;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(drawW * dpr);
    canvas.height = Math.round(drawH * dpr);
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, drawW, drawH);

    const { lms, imgW, imgH } = data;
    const flaggedSet = new Set(
      (result?.comparison?.major_errors || []).map(e => {
        // Map joint name to landmark index
        const map = {
          left_elbow: 13, right_elbow: 14, left_knee: 25, right_knee: 26,
          left_shoulder: 11, right_shoulder: 12, left_hip: 23, right_hip: 24,
        };
        return map[e.joint];
      }).filter(v => v != null)
    );

    const toX = lm => (lm.x / imgW) * drawW;
    const toY = lm => (lm.y / imgH) * drawH;

    // Bones
    CONNECTIONS.forEach(([i, j]) => {
      const a = lms[i]; const b = lms[j];
      if (!a || !b || (a.score ?? 1) < 0.25 || (b.score ?? 1) < 0.25) return;
      ctx.beginPath();
      ctx.moveTo(toX(a), toY(a));
      ctx.lineTo(toX(b), toY(b));
      ctx.strokeStyle = "rgba(123,97,255,0.85)";
      ctx.lineWidth   = 2.5;
      ctx.stroke();
    });

    // Joints
    lms.forEach((lm, i) => {
      if (!lm || (lm.score ?? 1) < 0.25) return;
      const x = toX(lm); const y = toY(lm);
      const flagged = flaggedSet.has(i);
      if (flagged) {
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(236,72,153,0.2)";
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, flagged ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle   = flagged ? "#EC4899" : "#7B61FF";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 1.5;
      ctx.fill();
      ctx.stroke();
    });
  }, [result]);

  useEffect(() => {
    if (phase === "review") requestAnimationFrame(() => requestAnimationFrame(redrawOverlay));
  }, [phase, result, redrawOverlay]);

  useEffect(() => {
    const img = drawImgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => redrawOverlay());
    ro.observe(img);
    return () => ro.disconnect();
  }, [redrawOverlay, drawSrc]);

  // ── File handling ──────────────────────────────────────────────────────────
  const handleDrawFile = useCallback((f) => {
    if (!f || !f.type.startsWith("image/")) return;
    setDrawFile(f);
    setDrawSrc(URL.createObjectURL(f));
    setError(null);
  }, []);

  const onInputChange = e => { if (e.target.files?.[0]) handleDrawFile(e.target.files[0]); };
  const onDrop = e => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.[0]) handleDrawFile(e.dataTransfer.files[0]);
  };

  // ── Submit drawing for comparison ──────────────────────────────────────────
  const handleSubmit = async () => {
    if (!drawFile || !refImgRef.current) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch the reference image as a blob to send to the compare endpoint
      const refBlob = await fetch(pose.imageUrl)
        .then(r => r.blob())
        .catch(() => null);

      if (!refBlob) throw new Error("Could not load reference image. Check your internet connection.");

      const form = new FormData();
      form.append("reference_image", refBlob, "reference.jpg");
      form.append("drawing_image",   drawFile, drawFile.name);

      const { data } = await axios.post(COMPARE_URL, form);

      // Build landmark array from drawing keypoints for overlay
      if (data.drawing_keypoints?.length) {
        const imgW = data.drawing_image_width  || 1;
        const imgH = data.drawing_image_height || 1;
        const lmArray = Array(33).fill(null);
        data.drawing_keypoints.forEach(kp => {
          if (kp.index != null) lmArray[kp.index] = { x: kp.x, y: kp.y, score: kp.score ?? 0.9 };
        });
        landmarkRef.current = { lms: lmArray, imgW, imgH };
      }

      setResult(data);
      setPhase("review");
      setSessionCount(c => c + 1);
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Comparison failed.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Next pose ──────────────────────────────────────────────────────────────
  const handleNext = () => {
    stopTimer();
    setPose(pickRandom(poses, pose.id));
    setPhase("idle");
    setRemaining(timerSecs);
    setDrawFile(null);
    setDrawSrc(null);
    setResult(null);
    setError(null);
    landmarkRef.current = null;
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const urgent       = remaining <= 10 && phase === "running";
  const score        = result?.comparison?.similarity_score ?? null;
  const suggestions  = result?.comparison?.suggestions      ?? [];
  const majorErrors  = result?.comparison?.major_errors     ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="pp-page">
      <Link to="/" className="pp-back">
        <ArrowLeft size={13} /> Dashboard
      </Link>

      {/* Header */}
      <div className="pp-header">
        <div>
          <h1>Practice <span>Mode</span></h1>
          <p>Study the reference pose, draw it within the time limit, then get AI feedback.</p>
        </div>
        {/* Timer selector — only in idle */}
        {phase === "idle" && (
          <div className="pp-timer-row">
            <span className="pp-timer-label">Timer</span>
            {TIMER_OPTIONS.map(opt => (
              <button
                key={opt.seconds}
                className={`pp-timer-btn${timerSecs === opt.seconds ? " active" : ""}`}
                onClick={() => setTimerSecs(opt.seconds)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="pp-loading">
          <div className="pp-loading-track"><div className="pp-loading-fill" /></div>
          <span>Analyzing your drawing…</span>
        </div>
      )}
      {error && <div className="pp-error">⚠ {error}</div>}

      {/* ── Main grid ── */}
      <div className="pp-grid">

        {/* Left: reference pose */}
        <div className="pp-panel">
          <div className="pp-panel-header">
            <span className="pp-panel-title">Reference Pose</span>
            <span className={`pp-panel-badge ${pose.difficulty}`}>{pose.difficulty}</span>
          </div>

          <div className="pp-ref-wrap">
            <img
              ref={refImgRef}
              src={pose.imageUrl}
              alt={pose.label}
              className={`pp-ref-img${phase === "idle" ? " blurred" : ""}`}
              crossOrigin="anonymous"
            />
            {phase === "idle" && (
              <div className="pp-ref-overlay">
                <div className="pp-ref-overlay-icon">🎯</div>
                <p>Start the timer to reveal the reference pose</p>
              </div>
            )}
          </div>

          <div className="pp-pose-info">
            <div className="pp-pose-name">{pose.label}</div>
            <div className="pp-pose-desc">{pose.description}</div>
            {(phase === "running" || phase === "done" || phase === "review") && (
              <div className="pp-pose-tips">
                {pose.tips.map((tip, i) => (
                  <span key={i} className="pp-pose-tip">{tip}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: timer + actions */}
        <div className="pp-panel">
          <div className="pp-panel-header">
            <span className="pp-panel-title">
              {phase === "idle"    ? "Ready"
             : phase === "running" ? "Time Remaining"
             : phase === "done"    ? "Time's Up!"
             : "Session Complete"}
            </span>
            {sessionCount > 0 && (
              <span className="pp-panel-badge">{sessionCount} session{sessionCount !== 1 ? "s" : ""}</span>
            )}
          </div>

          <div className="pp-timer-display">
            {/* Phase label */}
            <span className={`pp-phase ${phase}`}>
              {phase === "idle"    ? "● Ready to start"
             : phase === "running" ? "● Drawing in progress"
             : phase === "done"    ? "● Upload your drawing"
             : "● Review complete"}
            </span>

            {/* Arc timer */}
            <ArcTimer remaining={remaining} total={timerSecs} urgent={urgent} />

            {/* Pose category chip */}
            <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 1 }}>
              {pose.category} · {pose.label}
            </span>
          </div>

          {/* Upload zone — shown in done phase */}
          {phase === "done" && (
            <div
              className={`pp-upload${dragOver ? " drag-over" : ""}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input type="file" accept="image/*" onChange={onInputChange} />
              <div className="pp-upload-icon">🖼️</div>
              {drawFile
                ? <p><strong>{drawFile.name}</strong> — ready to submit</p>
                : <p>Drop your drawing here or <strong>click to browse</strong></p>
              }
            </div>
          )}

          {/* Action buttons */}
          <div className="pp-actions">
            {phase === "idle" && (
              <>
                <button className="pp-btn primary" onClick={startTimer}>
                  ▶ Start Practice
                </button>
                <button className="pp-btn secondary" onClick={handleNext}>
                  ↻ New Pose
                </button>
              </>
            )}
            {phase === "running" && (
              <button className="pp-btn danger" onClick={() => { stopTimer(); setPhase("done"); setRemaining(0); }}>
                ■ Stop Early
              </button>
            )}
            {phase === "done" && (
              <>
                <button
                  className="pp-btn primary"
                  onClick={handleSubmit}
                  disabled={!drawFile || loading}
                >
                  {loading ? "Analyzing…" : "Submit Drawing →"}
                </button>
                <button className="pp-btn secondary" onClick={handleNext}>
                  ↻ Skip Pose
                </button>
              </>
            )}
            {phase === "review" && (
              <>
                <button className="pp-btn primary" onClick={handleNext}>
                  ▶ Next Pose
                </button>
                <button className="pp-btn secondary" onClick={() => { setPhase("done"); setResult(null); setDrawFile(null); setDrawSrc(null); }}>
                  ↩ Retry
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Results section ── */}
      {phase === "review" && result && (
        <div className="pp-results">
          <div className="pp-results-header">
            <span className="pp-results-title">Session Results — {pose.label}</span>
            <span className="pp-panel-badge" style={{ background: "var(--purple-50)", color: "var(--grad-from)" }}>
              {fmt(timerSecs)} session
            </span>
          </div>

          {/* Score */}
          {score != null && <ScoreRing score={score} />}

          {/* Side-by-side images */}
          <div className="pp-compare-imgs">
            <div className="pp-compare-img-wrap">
              <span className="pp-compare-label">Reference</span>
              <img src={pose.imageUrl} alt="Reference" crossOrigin="anonymous" />
            </div>
            <div className="pp-compare-img-wrap">
              <span className="pp-compare-label">Your Drawing</span>
              <img
                ref={drawImgRef}
                src={drawSrc}
                alt="Your drawing"
                crossOrigin="anonymous"
                onLoad={() => requestAnimationFrame(() => requestAnimationFrame(redrawOverlay))}
              />
              <canvas ref={drawCanvasRef} />
            </div>
          </div>

          {/* Suggestions */}
          <div className="pp-suggestions">
            <h4>Improvement Suggestions</h4>
            {suggestions.length > 0 ? (
              <ul className="pp-suggestion-list">
                {suggestions.map((s, i) => (
                  <li key={i} className="pp-suggestion-item">
                    <span className="bullet">→</span>{s}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pp-no-errors">✓ Great pose — no major corrections needed!</div>
            )}
          </div>
        </div>
      )}

      {/* Next pose strip */}
      {phase === "review" && (
        <div className="pp-next-strip">
          <p>Ready for another round? <strong>Pick a new pose and keep practicing.</strong></p>
          <button className="pp-btn primary" onClick={handleNext} style={{ padding: "8px 20px" }}>
            Next Pose →
          </button>
        </div>
      )}
    </div>
  );
}
