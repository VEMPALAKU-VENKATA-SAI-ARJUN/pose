/**
 * GestureMode.jsx — Memory-based gesture drawing trainer (v2)
 *
 * Phase state machine:
 *   config   → user selects timer + filters
 *   viewing  → pose shown, countdown running
 *   replay   → pose briefly re-shown (8s)
 *   drawing  → pose hidden, user draws from memory
 *   compare  → side-by-side + AI evaluation + flow overlay
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Play, Eye, EyeOff, SkipForward, RotateCcw,
  SlidersHorizontal, Zap, ChevronRight, CheckCircle,
  Activity, Wind, AlignCenter,
} from "lucide-react";
import GestureTimer   from "./GestureTimer";
import PoseViewer     from "./PoseViewer";
import DrawingCanvas  from "./DrawingCanvas";
import PoseEvaluation from "./PoseEvaluation";
import FeedbackPanel  from "./FeedbackPanel";
import FlowOverlay    from "./FlowOverlay";
import poses          from "../../data/poseDataset.json";
import "./GestureMode.css";

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMER_OPTIONS  = [
  { label: "30s",  seconds: 30  },
  { label: "60s",  seconds: 60  },
  { label: "2min", seconds: 120 },
  { label: "5min", seconds: 300 },
];
const REPLAY_SECS    = 8;
const CATEGORIES     = ["all", "basic", "gesture", "sitting", "anatomy"];
const DIFFICULTIES   = ["all", "easy", "medium", "hard"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function pickRandom(pool, excludeId) {
  const src = pool.filter(p => p.id !== excludeId);
  return (src.length ? src : pool)[Math.floor(Math.random() * (src.length || pool.length))];
}
function buildPool(cat, diff) {
  let p = [...poses];
  if (cat  !== "all") p = p.filter(x => x.category   === cat);
  if (diff !== "all") p = p.filter(x => x.difficulty === diff);
  return p.length ? p : poses;
}

// ── Streak ────────────────────────────────────────────────────────────────────
function loadStreak() {
  try {
    const r = JSON.parse(localStorage.getItem("gm_streak") || "{}");
    return { count: r.count || 0, lastDate: r.lastDate || null, sessions: r.sessions || 0 };
  } catch { return { count: 0, lastDate: null, sessions: 0 }; }
}
function saveStreak(s) {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let count = s.count;
  if      (s.lastDate === today)     { /* same day */ }
  else if (s.lastDate === yesterday) { count += 1; }
  else                               { count = 1; }
  const updated = { count, lastDate: today, sessions: (s.sessions || 0) + 1 };
  localStorage.setItem("gm_streak", JSON.stringify(updated));
  return updated;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GestureMode() {
  // Config
  const [timerSecs,  setTimerSecs]  = useState(60);
  const [category,   setCategory]   = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [showTips,   setShowTips]   = useState(true);
  const [theme,      setTheme]      = useState("light");

  // Flow overlay toggles
  const [showAction,  setShowAction]  = useState(false);
  const [showRhythm,  setShowRhythm]  = useState(false);
  const [showBalance, setShowBalance] = useState(false);

  // Session
  const [phase,        setPhase]        = useState("config");
  const [pose,         setPose]         = useState(null);
  const [remaining,    setRemaining]    = useState(0);
  const [overlayAlpha, setOverlayAlpha] = useState(0);
  const [capturedImg,  setCapturedImg]  = useState(null);
  const [streak,       setStreak]       = useState(loadStreak);

  // ── Single AI state — exactly one of: "idle" | "loading" | "success" | "error" ──
  const [aiState, setAiState] = useState({
    status: "idle",   // idle | loading | success | error
    result: null,     // { score, feedback, angleDiffs, refLandmarks, drawLandmarks }
    error:  null,     // string | null
  });

  const intervalRef   = useRef(null);
  const canvasRef     = useRef(null);
  const refSkelRef    = useRef(null);   // canvas for green skeleton on reference
  const drawSkelRef   = useRef(null);   // canvas for red skeleton on drawing
  const pool          = useRef(buildPool(category, difficulty));

  useEffect(() => { pool.current = buildPool(category, difficulty); }, [category, difficulty]);

  // ── Timer ──────────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  const startCountdown = useCallback((secs, onEnd) => {
    stopTimer();
    setRemaining(secs);
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current); onEnd(); return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  useEffect(() => () => stopTimer(), [stopTimer]);

  // ── Session actions ────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const p = pickRandom(pool.current, pose?.id);
    setPose(p);
    setCapturedImg(null);
    setAiState({ status: "idle", result: null, error: null });
    setOverlayAlpha(0);
    setPhase("viewing");
    startCountdown(timerSecs, () => setPhase("drawing"));
  }, [pose, timerSecs, startCountdown]);

  const handleReplay = useCallback(() => {
    stopTimer();
    setPhase("replay");
    startCountdown(REPLAY_SECS, () => setPhase("drawing"));
  }, [stopTimer, startCountdown]);

  const handleSubmit = useCallback(() => {
    stopTimer();
    const dataUrl = canvasRef.current?.export();
    if (!dataUrl) return;
    setCapturedImg(dataUrl);
    setAiState({ status: "loading", result: null, error: null });
    const updated = saveStreak(streak);
    setStreak(updated);
    setPhase("compare");
  }, [stopTimer, streak]);

  const handleNext = useCallback(() => {
    stopTimer();
    canvasRef.current?.clear();
    setCapturedImg(null);
    setAiState({ status: "idle", result: null, error: null });
    setOverlayAlpha(0);
    const p = pickRandom(pool.current, pose?.id);
    setPose(p);
    setPhase("viewing");
    startCountdown(timerSecs, () => setPhase("drawing"));
  }, [pose, timerSecs, stopTimer, startCountdown]);

  // ── AI callbacks — PoseEvaluation calls these ─────────────────────────────
  const handleAiResult = useCallback((result) => {
    setAiState({ status: "success", result, error: null });
  }, []);

  const handleAiError = useCallback((msg) => {
    setAiState({ status: "error", result: null, error: msg });
  }, []);

  const handleAiRetry = useCallback(() => {
    setAiState({ status: "loading", result: null, error: null });
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const urgent    = remaining <= 10 && (phase === "viewing" || phase === "replay");
  const isViewing = phase === "viewing" || phase === "replay";
  const isDrawing = phase === "drawing";
  const isCompare = phase === "compare";
  const isConfig  = phase === "config";

  // Derive clean booleans from the single AI state
  const aiStatus  = aiState.status;                          // idle|loading|success|error
  const aiResult  = aiState.result;
  const score     = aiResult?.score ?? null;
  const scoreColor = score == null ? "#94a3b8"
    : score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`gm-page gm-${theme}`}>

      {/* ── Top bar ── */}
      <div className="gm-topbar">
        <Link to="/" className="gm-back">
          <ArrowLeft size={13} /> Dashboard
        </Link>

        <div className="gm-topbar-center">
          {(isViewing || isDrawing) && (
            <GestureTimer remaining={remaining} total={timerSecs} urgent={urgent} />
          )}
          {phase === "replay" && (
            <span className="gm-replay-badge">
              <Eye size={12} /> Replay — {remaining}s
            </span>
          )}
        </div>

        <div className="gm-topbar-right">
          {/* Flow line toggles — visible during viewing + compare */}
          {(isViewing || isCompare) && (
            <div className="gm-flow-toggles">
              <button
                className={`gm-flow-btn${showAction ? " active" : ""}`}
                onClick={() => setShowAction(v => !v)}
                title="Line of Action"
              >
                <Activity size={13} /> Action
              </button>
              <button
                className={`gm-flow-btn${showRhythm ? " active" : ""}`}
                onClick={() => setShowRhythm(v => !v)}
                title="Rhythm Lines"
              >
                <Wind size={13} /> Rhythm
              </button>
              <button
                className={`gm-flow-btn${showBalance ? " active" : ""}`}
                onClick={() => setShowBalance(v => !v)}
                title="Balance Line"
              >
                <AlignCenter size={13} /> Balance
              </button>
            </div>
          )}

          <div className="gm-streak" title="Daily streak">
            <Zap size={13} /><span>{streak.count}</span>
          </div>
          <button
            className="gm-icon-btn"
            onClick={() => setTheme(t => t === "light" ? "dark" : "light")}
            title="Toggle theme"
          >
            {theme === "light" ? "🌙" : "☀"}
          </button>
        </div>
      </div>

      {/* ══ CONFIG ══ */}
      {isConfig && (
        <div className="gm-config">
          <div className="gm-config-card">
            <div className="gm-config-header">
              <Zap size={22} color="var(--grad-from)" />
              <h1>Gesture <span>Mode</span></h1>
            </div>
            <p className="gm-config-sub">
              Study a pose for a limited time, then draw it from memory.
              Get AI-powered accuracy feedback and flow line analysis.
            </p>

            <div className="gm-config-section">
              <label className="gm-config-label">View time</label>
              <div className="gm-chip-row">
                {TIMER_OPTIONS.map(o => (
                  <button key={o.seconds} className={`gm-chip${timerSecs === o.seconds ? " active" : ""}`}
                    onClick={() => setTimerSecs(o.seconds)}>{o.label}</button>
                ))}
              </div>
            </div>

            <div className="gm-config-section">
              <label className="gm-config-label">Category</label>
              <div className="gm-chip-row">
                {CATEGORIES.map(c => (
                  <button key={c} className={`gm-chip${category === c ? " active" : ""}`}
                    onClick={() => setCategory(c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="gm-config-section">
              <label className="gm-config-label">Difficulty</label>
              <div className="gm-chip-row">
                {DIFFICULTIES.map(d => (
                  <button key={d} className={`gm-chip${difficulty === d ? " active" : ""}`}
                    onClick={() => setDifficulty(d)}>{d}</button>
                ))}
              </div>
            </div>

            <div className="gm-config-section">
              <label className="gm-config-label">Options</label>
              <label className="gm-toggle-row">
                <input type="checkbox" checked={showTips} onChange={e => setShowTips(e.target.checked)} />
                <span>Show drawing tips during viewing</span>
              </label>
            </div>

            <button className="gm-start-btn" onClick={handleStart}>
              <Play size={16} /> Start Session
            </button>

            {streak.count > 0 && (
              <div className="gm-streak-card">
                <Zap size={14} color="#fbbf24" />
                <span>{streak.count}-day streak · {streak.sessions} total sessions</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ VIEWING / REPLAY ══ */}
      {isViewing && pose && (
        <div className="gm-viewer-phase">
          <PoseViewer
            pose={pose}
            visible={true}
            showTips={showTips}
            landmarks={aiResult?.refLandmarks ?? null}
            showAction={showAction}
            showRhythm={showRhythm}
            showBalance={showBalance}
          />
          <div className="gm-viewer-actions">
            <button className="gm-action-btn gm-action-btn--ghost"
              onClick={() => { stopTimer(); setPhase("drawing"); }}>
              <EyeOff size={14} /> Hide &amp; Draw Now
            </button>
            <button className="gm-action-btn gm-action-btn--ghost" onClick={handleNext}>
              <SkipForward size={14} /> Skip Pose
            </button>
          </div>
        </div>
      )}

      {/* ══ DRAWING ══ */}
      {isDrawing && (
        <div className="gm-drawing-phase">
          <div className="gm-drawing-header">
            <span className="gm-drawing-label">
              Drawing from memory: <strong>{pose?.label}</strong>
            </span>
            <div className="gm-drawing-actions">
              <button className="gm-action-btn gm-action-btn--outline" onClick={handleReplay}>
                <Eye size={13} /> Show Pose ({REPLAY_SECS}s)
              </button>
              <button className="gm-action-btn gm-action-btn--primary" onClick={handleSubmit}>
                <CheckCircle size={13} /> Done — Compare
              </button>
              <button className="gm-action-btn gm-action-btn--ghost" onClick={handleNext}>
                <SkipForward size={13} /> Skip
              </button>
            </div>
          </div>
          <DrawingCanvas ref={canvasRef} />
        </div>
      )}

      {/* ══ COMPARE ══ */}
      {isCompare && pose && (
        <div className="gm-compare-phase">

          {/* PoseEvaluation — mounts when capturedImg ready, calls back into aiState */}
          {capturedImg && aiStatus === "loading" && (
            <PoseEvaluation
              refImageUrl={pose.imageUrl}
              drawingUrl={capturedImg}
              onResult={handleAiResult}
              onError={handleAiError}
              refCanvasEl={refSkelRef.current}
              drawCanvasEl={drawSkelRef.current}
            />
          )}

          {/* ── Score bar — one branch per AI state, never overlapping ── */}
          <div className="gm-score-bar">
            <div className="gm-score-left">

              {/* LOADING */}
              {aiStatus === "loading" && (
                <span className="gm-ai-loading">
                  <span className="gm-ai-spinner" />
                  <span>Analysing pose…</span>
                </span>
              )}

              {/* SUCCESS */}
              {aiStatus === "success" && (
                <>
                  <span className="gm-score-pct" style={{ color: scoreColor }}>
                    {score}%
                  </span>
                  <span className="gm-score-msg">
                    {score >= 80 ? "Excellent accuracy!"
                   : score >= 55 ? "Good work — check flagged joints."
                   : "Keep practicing — review the feedback below."}
                  </span>
                </>
              )}

              {/* ERROR */}
              {aiStatus === "error" && (
                <span className="gm-ai-error">
                  ⚠ {aiState.error}
                </span>
              )}

              {/* IDLE (shouldn't normally show, safety fallback) */}
              {aiStatus === "idle" && (
                <span className="gm-score-msg">Waiting…</span>
              )}
            </div>

            <div className="gm-score-actions">
              {/* Retry AI — only shown on error */}
              {aiStatus === "error" && (
                <button className="gm-action-btn gm-action-btn--outline"
                  onClick={handleAiRetry}>
                  <RotateCcw size={13} /> Retry AI
                </button>
              )}
              <button className="gm-action-btn gm-action-btn--primary" onClick={handleNext}>
                <Play size={13} /> Next Pose
              </button>
              <button className="gm-action-btn gm-action-btn--outline" onClick={() => {
                canvasRef.current?.clear();
                setCapturedImg(null);
                setAiState({ status: "idle", result: null, error: null });
                setPhase("drawing");
              }}>
                <RotateCcw size={13} /> Retry Drawing
              </button>
              <button className="gm-action-btn gm-action-btn--ghost"
                onClick={() => { stopTimer(); setPhase("config"); }}>
                <SlidersHorizontal size={13} /> Settings
              </button>
            </div>
          </div>

          {/* Side-by-side images */}
          <div className="gm-compare-grid">
            <div className="gm-compare-panel">
              <div className="gm-compare-label">Original Pose</div>
              <div className="gm-compare-img-wrap" style={{ position: "relative" }}>
                <img src={pose.imageUrl} alt={pose.label} className="gm-compare-img" />
                <canvas ref={refSkelRef} className="pe-skeleton-canvas" />
                {(showAction || showRhythm || showBalance) && (
                  <FlowOverlay
                    landmarks={aiResult?.refLandmarks ?? null}
                    imageWidth={0} imageHeight={0}
                    showAction={showAction} showRhythm={showRhythm} showBalance={showBalance}
                  />
                )}
              </div>
            </div>

            <div className="gm-compare-panel">
              <div className="gm-compare-label">Your Drawing</div>
              <div className="gm-compare-img-wrap gm-compare-img-wrap--drawing" style={{ position: "relative" }}>
                {capturedImg && (
                  <img src={capturedImg} alt="Your drawing" className="gm-compare-img gm-compare-img--drawing" />
                )}
                {overlayAlpha > 0 && (
                  <img src={pose.imageUrl} alt="overlay" className="gm-compare-img gm-compare-overlay"
                    style={{ opacity: overlayAlpha }} />
                )}
                <canvas ref={drawSkelRef} className="pe-skeleton-canvas" />
              </div>
            </div>
          </div>

          {/* Overlay slider */}
          <div className="gm-overlay-ctrl">
            <Eye size={13} />
            <span>Reference overlay</span>
            <input type="range" min="0" max="0.7" step="0.05"
              value={overlayAlpha}
              onChange={e => setOverlayAlpha(parseFloat(e.target.value))}
              className="gm-slider" />
            <span className="gm-slider-val">{Math.round(overlayAlpha * 100)}%</span>
          </div>

          {/* AI Feedback — only when success */}
          {aiStatus === "success" && (
            <FeedbackPanel
              score={score}
              feedback={aiResult?.feedback ?? []}
              angleDiffs={aiResult?.angleDiffs ?? []}
              loading={false}
            />
          )}

          {/* Pose tips */}
          {pose.tips?.length > 0 && (
            <div className="gm-compare-tips">
              <span className="gm-compare-tips-title">What to check</span>
              <div className="gm-compare-tips-list">
                {pose.tips.map((t, i) => (
                  <span key={i} className="gm-compare-tip">
                    <ChevronRight size={11} /> {t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
