/**
 * GestureMode.jsx — Skeleton Construction Edition
 *
 * Simplified UX flow:
 *   config → viewing → construct → compare
 *
 * Drawing mode and quiz mode have been removed.
 * Users reconstruct poses by placing and dragging joints on a canvas.
 * The skeleton is then evaluated against the reference pose via angle comparison.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Play, SkipForward, RotateCcw,
  Activity, Wind, AlignCenter, CheckCircle,
  Zap, Sun, Moon, Flame, Puzzle, BarChart2,
  Eye, EyeOff, BookOpen,
} from "lucide-react";
import GestureTimer    from "./GestureTimer";
import PoseViewer      from "./PoseViewer";
import FeedbackPanel   from "./FeedbackPanel";
import SkeletonBuilder from "./SkeletonBuilder";
import SkeletonCompare from "./SkeletonCompare";
import { skeletonToLandmarks } from "./skeletonToLandmarks";
import { compareJoints, generateJointFeedback } from "./poseAccuracy";
import { detectRefJoints } from "./detectRefJoints";
import rawPoses        from "../../data/poseLibraryData.js";
import "./GestureMode.css";

// ── Normalise pose library entries to the shape GestureMode expects ───────────
// poseLibraryData uses `title` — we expose it as `label` for display.
const poses = rawPoses.map(p => ({
  ...p,
  label:       p.title,
  description: [p.gender, p.cameraAngle, "view"].filter(Boolean).join(" · "),
  tips:        [],          // library has no tips — tips panel will be hidden
}));

// ── Constants ─────────────────────────────────────────────────────────────────
const TIMER_OPTIONS = [
  { label: "30s",  seconds: 30  },
  { label: "60s",  seconds: 60  },
  { label: "2min", seconds: 120 },
  { label: "5min", seconds: 300 },
];

// Derived from poseLibraryData categories & difficulties
const CATEGORIES   = ["all", "standing", "sitting", "running", "walking", "jumping", "interaction"];
const DIFFICULTIES = ["all", "beginner", "intermediate", "advanced"];

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
    return { count: r.count || 0, lastDate: r.lastDate || null };
  } catch { return { count: 0, lastDate: null }; }
}

function saveStreak(s) {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  let count = s.count;
  if      (s.lastDate === today)     { /* same day — no change */ }
  else if (s.lastDate === yesterday) { count += 1; }
  else                               { count = 1; }
  const updated = { count, lastDate: today };
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

  // Phase: config | viewing | construct | compare
  const [phase,  setPhase]  = useState("config");
  const [pose,   setPose]   = useState(null);
  const [streak, setStreak] = useState(loadStreak);

  // Timer
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef(null);

  // Skeleton builder ref
  const builderRef = useRef(null);

  // Evaluation result
  const [evalResult, setEvalResult] = useState(null);

  // Reference joints detected from the current pose image
  // Reset to null on every pose change, populated by detectRefJoints()
  const [refJointsDetected, setRefJointsDetected] = useState(null);
  const [refDetecting,      setRefDetecting]      = useState(false); // { score, feedback, flaggedJoints, landmarks }

  // Reference panel — hidden by default, shown only while holding button
  const [showReference, setShowReference] = useState(false);

  const pool = useRef(buildPool(category, difficulty));
  useEffect(() => { pool.current = buildPool(category, difficulty); }, [category, difficulty]);

  // ── Detect reference joints whenever pose changes ──────────────────────────
  useEffect(() => {
    if (!pose?.imageUrl) return;
    setRefJointsDetected(null);   // clear stale data immediately
    setRefDetecting(true);
    console.log("[GestureMode] Detecting reference joints for:", pose.label);
    detectRefJoints(pose.imageUrl)
      .then(joints => {
        console.log("[GestureMode] Reference joints ready:", joints);
        setRefJointsDetected(joints);
      })
      .catch(err => {
        console.warn("[GestureMode] Reference detection failed:", err.message);
        setRefJointsDetected(null);
      })
      .finally(() => setRefDetecting(false));
  }, [pose?.id]);

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

  // ── Start session ──────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    const p = pickRandom(pool.current, pose?.id);
    setPose(p);
    setEvalResult(null);
    setPhase("viewing");
    startCountdown(timerSecs, () => setPhase("construct"));
  }, [pose, timerSecs, startCountdown]);

  // ── Skip viewing → go straight to construct ────────────────────────────────
  const handleSkipToConstruct = useCallback(() => {
    stopTimer();
    setPhase("construct");
  }, [stopTimer]);

  // ── Submit skeleton ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const skeleton = builderRef.current?.exportSkeleton();
    if (!skeleton) return;
    const { joints } = skeleton;

    // Use MediaPipe-detected joints from the actual reference image.
    // Fall back to a neutral T-pose only if detection hasn't completed yet.
    const refJoints = refJointsDetected ?? {
      nose:           { x: 0.50, y: 0.08 },
      left_shoulder:  { x: 0.35, y: 0.25 },
      right_shoulder: { x: 0.65, y: 0.25 },
      left_elbow:     { x: 0.22, y: 0.42 },
      right_elbow:    { x: 0.78, y: 0.42 },
      left_wrist:     { x: 0.12, y: 0.58 },
      right_wrist:    { x: 0.88, y: 0.58 },
      left_hip:       { x: 0.40, y: 0.55 },
      right_hip:      { x: 0.60, y: 0.55 },
      left_knee:      { x: 0.38, y: 0.73 },
      right_knee:     { x: 0.62, y: 0.73 },
      left_ankle:     { x: 0.37, y: 0.92 },
      right_ankle:    { x: 0.63, y: 0.92 },
    };

    console.log("[GestureMode] Evaluating pose:", pose?.label);
    console.log("[GestureMode] User joints:", joints);
    console.log("[GestureMode] Reference joints:", refJoints);
    console.log("[GestureMode] Using detected ref:", !!refJointsDetected);

    const { score, flaggedJoints, perJoint, jointErrors } = compareJoints(refJoints, joints);
    const feedback  = generateJointFeedback(perJoint, score);
    const landmarks = skeletonToLandmarks(joints);
    const updated   = saveStreak(streak);
    setStreak(updated);

    setEvalResult({ score, feedback, flaggedJoints, landmarks, angleDiffs: perJoint, jointErrors, userJoints: joints, refJoints });
    stopTimer();
    setPhase("compare");
  }, [streak, stopTimer, refJointsDetected, pose]);

  // ── Retry ──────────────────────────────────────────────────────────────────
  const handleRetry = useCallback(() => {
    setEvalResult(null);
    builderRef.current?.reset();
    setPhase("construct");
  }, []);

  // ── Next pose ──────────────────────────────────────────────────────────────
  const handleNextPose = useCallback(() => {
    stopTimer();
    setEvalResult(null);
    builderRef.current?.reset();
    const p = pickRandom(pool.current, pose?.id);
    setPose(p);
    setPhase("viewing");
    startCountdown(timerSecs, () => setPhase("construct"));
  }, [pose, timerSecs, stopTimer, startCountdown]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const urgent    = remaining <= 10 && phase === "viewing";
  const isConfig  = phase === "config";
  const isViewing = phase === "viewing";
  const isConstruct = phase === "construct";
  const isCompare   = phase === "compare";

  const flaggedArray = evalResult?.flaggedJoints
    ? Array.from(evalResult.flaggedJoints)
    : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`gm-page${theme === "dark" ? " gm-dark" : ""}`}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="gm-topbar">
        <Link to="/" className="gm-back" aria-label="Back to home">
          <ArrowLeft size={13} /> Back
        </Link>

        <div className="gm-topbar-center">
          {(isViewing) && (
            <GestureTimer remaining={remaining} total={timerSecs} urgent={urgent} />
          )}
          {isConstruct && (
            <span className="gm-phase-badge"><Puzzle size={12} /> Build the Pose</span>
          )}
          {isCompare && (
            <span className="gm-phase-badge"><BarChart2 size={12} /> Results</span>
          )}
        </div>

        <div className="gm-topbar-right">
          {streak.count > 0 && (
            <span className="gm-streak" aria-label={`${streak.count} day streak`}>
              <Flame size={13} /> {streak.count}
            </span>
          )}
          <button
            className="gm-icon-btn"
            onClick={() => setTheme(t => t === "light" ? "dark" : "light")}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          CONFIG PHASE
      ══════════════════════════════════════════════════════════════════ */}
      {isConfig && (
        <main className="gm-config">
          <div className="gm-config-card">
            <div className="gm-config-header">
              <Puzzle size={32} color="var(--grad-from)" />
              <h1>Pose <span>Builder</span></h1>
            </div>
            <p className="gm-config-sub">
              Study a reference pose, then reconstruct it by placing and dragging joints.
              No drawing skill required — works great on a touchpad.
            </p>

            {streak.count > 0 && (
              <div className="gm-streak-card">
                <Flame size={14} color="#fbbf24" /> {streak.count}-day streak — keep it up!
              </div>
            )}

            {/* Timer */}
            <div className="gm-config-section">
              <span className="gm-config-label">Study time</span>
              <div className="gm-chip-row" role="group" aria-label="Study time options">
                {TIMER_OPTIONS.map(opt => (
                  <button
                    key={opt.seconds}
                    className={`gm-chip${timerSecs === opt.seconds ? " active" : ""}`}
                    onClick={() => setTimerSecs(opt.seconds)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category */}
            <div className="gm-config-section">
              <span className="gm-config-label">Category</span>
              <div className="gm-chip-row" role="group" aria-label="Pose category">
                {CATEGORIES.map(c => (
                  <button
                    key={c}
                    className={`gm-chip${category === c ? " active" : ""}`}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty */}
            <div className="gm-config-section">
              <span className="gm-config-label">Difficulty</span>
              <div className="gm-chip-row" role="group" aria-label="Difficulty level">
                {DIFFICULTIES.map(d => (
                  <button
                    key={d}
                    className={`gm-chip${difficulty === d ? " active" : ""}`}
                    onClick={() => setDifficulty(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            {/* Tips toggle */}
            <label className="gm-toggle-row">
              <input
                type="checkbox"
                checked={showTips}
                onChange={e => setShowTips(e.target.checked)}
              />
              Show drawing tips during study phase
            </label>

            <button className="gm-start-btn" onClick={handleStart}>
              <Play size={15} /> Start Session
            </button>
          </div>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          VIEWING PHASE
      ══════════════════════════════════════════════════════════════════ */}
      {isViewing && pose && (
        <main className="gm-viewer-phase">
          <PoseViewer
            pose={pose}
            visible={true}
            showTips={showTips}
            showAction={showAction}
            showRhythm={showRhythm}
            showBalance={showBalance}
          />

          <div className="gm-viewer-actions">
            {/* Flow overlay toggles */}
            <div className="gm-flow-toggles" role="group" aria-label="Flow overlay options">
              <button
                className={`gm-flow-btn${showAction ? " active" : ""}`}
                onClick={() => setShowAction(v => !v)}
              >
                <Activity size={11} /> Action
              </button>
              <button
                className={`gm-flow-btn${showRhythm ? " active" : ""}`}
                onClick={() => setShowRhythm(v => !v)}
              >
                <Wind size={11} /> Rhythm
              </button>
              <button
                className={`gm-flow-btn${showBalance ? " active" : ""}`}
                onClick={() => setShowBalance(v => !v)}
              >
                <AlignCenter size={11} /> Balance
              </button>
            </div>

            <button
                className="gm-action-btn gm-action-btn--outline"
                onClick={handleNextPose}
                style={{ marginLeft: "auto" }}
              >
                <SkipForward size={13} /> Skip Pose
              </button>
              <button
                className="gm-action-btn gm-action-btn--primary"
                onClick={handleSkipToConstruct}
              >
              <CheckCircle size={13} /> I'm Ready — Build It
            </button>
          </div>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CONSTRUCT PHASE
      ══════════════════════════════════════════════════════════════════ */}
      {isConstruct && pose && (
        <main className="gm-construct-phase">
          {/* Header */}
          <div className="gm-construct-header">
            <div className="gm-construct-header-left">
              <span className="gm-drawing-label">
                Reconstruct: <strong>{pose.label}</strong>
              </span>
              {refDetecting && (
                <span style={{ fontSize: 11, color: "var(--gm-muted)", display: "flex", alignItems: "center", gap: 5 }}>
                  <span className="gm-ai-spinner" /> Analysing reference…
                </span>
              )}
            </div>
            <div className="gm-construct-header-right">
              {/* Toggle reference visibility */}
              <button
                className="gm-action-btn gm-action-btn--outline"
                onClick={() => setShowReference(v => !v)}
              >
                {showReference ? <><EyeOff size={13} /> Hide Reference</> : <><Eye size={13} /> Show Reference</>}
              </button>
              <button
                className="gm-action-btn gm-action-btn--outline"
                onClick={() => setPhase("viewing")}
              >
                Re-study
              </button>
              <button
                className="gm-action-btn gm-action-btn--primary"
                onClick={handleSubmit}
              >
                <CheckCircle size={13} /> Submit
              </button>
            </div>
          </div>

          {/* Two-panel layout: reference | builder */}
          <div className="gm-skeleton-layout">
            {/* Reference panel — toggled via button */}
            <div
              className="gm-skeleton-ref"
              style={{
                opacity:        showReference ? 1 : 0,
                pointerEvents:  showReference ? "auto" : "none",
                transition:     "opacity 0.2s ease",
              }}
            >
              <div className="gm-skeleton-ref-label">Reference Pose</div>
              <img
                src={pose.imageUrl}
                alt={`Reference: ${pose.label}`}
                className="gm-skeleton-ref-img"
                draggable={false}
              />
            </div>

            {/* Builder panel */}
            <div className="gm-skeleton-builder-wrap">
              <SkeletonBuilder
                ref={builderRef}
                flaggedJoints={flaggedArray}
              />
            </div>
          </div>
        </main>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          COMPARE PHASE
      ══════════════════════════════════════════════════════════════════ */}
      {isCompare && pose && evalResult && (
        <main className="gm-compare-phase">
          {/* Score bar */}
          <div className="gm-score-bar">
            <div className="gm-score-left">
              <span
                className="gm-score-pct"
                style={{
                  color: evalResult.score >= 70
                    ? "#22c55e"
                    : evalResult.score >= 40
                    ? "#f59e0b"
                    : "#ef4444",
                }}
              >
                {evalResult.score}%
              </span>
              <span className="gm-score-msg">
                {evalResult.score >= 80
                  ? "Excellent accuracy!"
                  : evalResult.score >= 55
                  ? "Good attempt — a few joints need adjustment."
                  : "Keep practicing — check the flagged joints."}
              </span>
            </div>
            <div className="gm-score-actions">
              <button className="gm-action-btn gm-action-btn--outline" onClick={handleRetry}>
                <RotateCcw size={13} /> Retry
              </button>
              <button className="gm-action-btn gm-action-btn--primary" onClick={handleNextPose}>
                <SkipForward size={13} /> Next Pose
              </button>
            </div>
          </div>

          {/* Side-by-side: reference image | feedback */}
          <div className="gm-compare-grid">
            {/* Visual skeleton comparison */}
            <div className="gm-compare-panel">
              <div className="gm-compare-label">Skeleton Comparison</div>
              <SkeletonCompare
                userJoints={evalResult.userJoints}
                refJoints={evalResult.refJoints}
                jointErrors={evalResult.jointErrors}
              />
            </div>

            {/* Feedback */}
            <div className="gm-compare-panel">
              <div className="gm-compare-label">AI Feedback</div>
              <div style={{ padding: "16px" }}>
                <FeedbackPanel
                  score={evalResult.score}
                  feedback={evalResult.feedback}
                  angleDiffs={evalResult.angleDiffs}
                  loading={false}
                />
              </div>
            </div>
          </div>

          {/* Tips */}
          {pose.tips?.length > 0 && (
            <div className="gm-compare-tips">
              <span className="gm-compare-tips-title">Pose Tips</span>
              <div className="gm-compare-tips-list">
                {pose.tips.map((tip, i) => (
                  <div key={i} className="gm-compare-tip">
                    <span className="pv-tip-dot" />
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  );
}
