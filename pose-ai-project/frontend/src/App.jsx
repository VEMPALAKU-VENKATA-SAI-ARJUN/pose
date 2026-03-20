/**
 * App.jsx — P.O.S.E
 * Two modes:
 *   "single"  — upload one image, get anatomy analysis + correction
 *   "compare" — upload reference + drawing, get comparison + reference-based correction
 *
 * Detection cases (compare mode):
 *   1 — both detected        → normal comparison
 *   2 — only ref detected    → drawing estimated from reference
 *   3 — only draw detected   → drawing compared vs ideal anatomy
 *   4 — neither detected     → hard error shown to user
 */

import { useState } from "react";
import UploadPanel  from "./components/UploadPanel";
import CanvasViewer from "./components/CanvasViewer";
import ErrorPanel   from "./components/ErrorPanel";

const ANALYZE_URL = "/api/analyze";
const COMPARE_URL = "/api/compare";

// ── Initial state factories ───────────────────────────────────────────────────

const initSingle = () => ({
  imageSrc: null, keypoints: [], correctedKeypoints: {},
  errors: null, angles: null, proportions: null,
  symmetry: null, centerOfGravity: null,
});

const initCompare = () => ({
  refImageSrc: null, drawImageSrc: null,
  refKeypoints: [], drawKeypoints: [],
  correctedKeypoints: {}, comparison: null,
  drawingAnalysis: null,
  usedFallback: false, anatomyFallback: false,
  detectionCase: null,
  refDetected: null, drawDetected: null,
  refConfidence: null, drawConfidence: null,
  similarityScore: null,
  incompletePose: null,
  upperBodyMode: false,
  poseTypeMismatch: null,   // { refType, drawType } when types are incompatible
  comparisonMode: null,
});


// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [mode,       setMode]       = useState("single");
  const [loading,    setLoading]    = useState(false);
  const [apiError,   setApiError]   = useState(null);
  const [single,     setSingle]     = useState(initSingle());
  const [compare,    setCompare]    = useState(initCompare());
  // Manual mode: user-placed keypoints override detected ones
  const [manualMode, setManualMode] = useState(false);
  const [manualKp,   setManualKp]   = useState([]);

  const hasResults = mode === "single"
    ? single.keypoints.length > 0
    : compare.refKeypoints.length > 0 || compare.drawKeypoints.length > 0;

  // ── Mode toggle ─────────────────────────────────────────────────────────────
  const switchMode = (m) => {
    setMode(m);
    setApiError(null);
    setSingle(initSingle());
    setCompare(initCompare());
    setManualMode(false);
    setManualKp([]);
  };

  // ── Single upload handler ───────────────────────────────────────────────────
  const handleUpload = async (file) => {
    setSingle(initSingle());
    setApiError(null);
    setManualMode(false);
    setManualKp([]);
    setSingle(s => ({ ...s, imageSrc: URL.createObjectURL(file) }));

    const form = new FormData();
    form.append("file", file);

    try {
      setLoading(true);
      const res  = await fetch(ANALYZE_URL, { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) { setApiError(data.error || `Error ${res.status}`); return; }

      const analysis = data.analysis || {};
      setSingle({
        imageSrc:           URL.createObjectURL(file),
        keypoints:          data.keypoints                    || [],
        correctedKeypoints: data.corrected_keypoints          || {},
        errors:             analysis.errors                   || [],
        angles:             analysis.angles                   || null,
        proportions:        analysis.proportions              || null,
        symmetry:           analysis.symmetry                 || null,
        centerOfGravity:    analysis.center_of_gravity        || null,
      });
    } catch {
      setApiError("Could not reach the server. Is the backend running on port 3001?");
    } finally {
      setLoading(false);
    }
  };

  // ── Compare handler ─────────────────────────────────────────────────────────
  const handleCompare = async (refFile, drawFile) => {
    setCompare(initCompare());
    setApiError(null);
    setManualMode(false);
    setManualKp([]);
    setCompare(s => ({
      ...s,
      refImageSrc:  URL.createObjectURL(refFile),
      drawImageSrc: URL.createObjectURL(drawFile),
    }));

    const form = new FormData();
    form.append("reference_image", refFile);
    form.append("drawing_image",   drawFile);

    try {
      setLoading(true);
      const res  = await fetch(COMPARE_URL, { method: "POST", body: form });
      const data = await res.json();

      // 422 — detection failure, incomplete pose, or pose type mismatch
      if (res.status === 422) {
        const isIncomplete  = Array.isArray(data.incomplete_images);
        const isTypeMismatch = data.pose_type_mismatch === true;
        setApiError(data.error || "Pose detection failed.");
        setCompare(s => ({
          ...s,
          detectionCase:    isIncomplete || isTypeMismatch ? data.detection_case : 4,
          refDetected:      data.reference_detected  ?? false,
          drawDetected:     data.drawing_detected     ?? false,
          refConfidence:    data.reference_confidence || 0,
          drawConfidence:   data.drawing_confidence   || 0,
          incompletePose:   isIncomplete ? {
            images: data.incomplete_images,
            ref:    data.reference_completeness,
            draw:   data.drawing_completeness,
          } : null,
          poseTypeMismatch: isTypeMismatch ? {
            refType:  data.reference_pose_type,
            drawType: data.drawing_pose_type,
          } : null,
        }));
        return;
      }

      if (!res.ok) { setApiError(data.error || `Error ${res.status}`); return; }

      setCompare({
        refImageSrc:        URL.createObjectURL(refFile),
        drawImageSrc:       URL.createObjectURL(drawFile),
        refKeypoints:       data.reference_keypoints         || [],
        drawKeypoints:      data.drawing_keypoints           || [],
        correctedKeypoints: data.corrected_keypoints         || {},
        comparison:         data.comparison                  || null,
        drawingAnalysis:    data.drawing_analysis            || null,
        usedFallback:       data.used_fallback               || false,
        anatomyFallback:    data.anatomy_fallback            || false,
        detectionCase:      data.detection_case              || null,
        refDetected:        data.reference_detected          ?? null,
        drawDetected:       data.drawing_detected            ?? null,
        refConfidence:      data.reference_confidence        || 0,
        drawConfidence:     data.drawing_confidence          || 0,
        similarityScore:    data.comparison?.similarity_score ?? null,
        upperBodyMode:      data.upper_body_mode             || false,
        incompletePose:     null,
        poseTypeMismatch:   null,
        comparisonMode:     data.comparison_mode             || null,
      });
    } catch {
      setApiError("Could not reach the server. Is the backend running on port 3001?");
    } finally {
      setLoading(false);
    }
  };

  // ── Manual keypoint handler (from CanvasViewer click) ──────────────────────
  const handleManualJoint = (kp) => {
    setManualKp(prev => {
      const existing = prev.findIndex(p => p.name === kp.name);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = kp;
        return next;
      }
      return [...prev, kp];
    });
  };

  // Effective keypoints: manual overrides detected when manual mode is on
  const effectiveSingleKp = manualMode && manualKp.length > 0
    ? manualKp
    : single.keypoints;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>

      {/* Header */}
      <header style={s.header}>
        <div>
          <h1 style={s.title}>P.O.S.E</h1>
          <p style={s.subtitle}>Pose Optimization and Structural Evaluation System</p>
        </div>
        {hasResults && mode === "single" && (
          <div style={s.legend}>
            <Chip color="rgba(255,255,255,0.85)" label="Original" />
            <Chip color="#ef4444"                label="Incorrect" />
            <Chip color="#4ade80"                label="Corrected" />
          </div>
        )}
        {hasResults && mode === "compare" && (
          <div style={s.legend}>
            <Chip color="#4ade80"                label="Reference" />
            <Chip color="rgba(255,255,255,0.85)" label="Drawing" />
            <Chip color="#ef4444"                label="Errors" />
          </div>
        )}
      </header>

      {/* Mode toggle */}
      <div style={s.modeBar}>
        <ModeBtn active={mode === "single"}  onClick={() => switchMode("single")}>
          Single Image
        </ModeBtn>
        <ModeBtn active={mode === "compare"} onClick={() => switchMode("compare")}>
          Reference vs Drawing
        </ModeBtn>
      </div>

      {/* Upload */}
      <UploadPanel
        mode={mode}
        onUpload={handleUpload}
        onCompare={handleCompare}
        disabled={loading}
      />

      {/* Loading bar */}
      {loading && <LoadingBar />}

      {/* API error */}
      {apiError && (
        <div style={s.apiError} role="alert">
          ⚠ {apiError}
          {/* Offer manual mode when both detections fail */}
          {compare.detectionCase === 4 && !compare.incompletePose && (
            <button
              style={s.manualBtn}
              onClick={() => { setManualMode(true); setApiError(null); }}
            >
              Try Manual Mode
            </button>
          )}
        </div>
      )}

      {/* Manual mode banner */}
      {manualMode && (
        <div style={s.manualBanner}>
          Manual mode — click on the image to place joints.
          <button style={s.manualClear} onClick={() => { setManualMode(false); setManualKp([]); }}>
            Exit manual mode
          </button>
        </div>
      )}

      {/* ── Single results ── */}
      {mode === "single" && (single.imageSrc || hasResults) && (
        <div style={hasResults ? s.resultsGrid : s.previewOnly}>
          <div style={s.canvasWrap}>
            <CanvasViewer
              imageSrc={single.imageSrc}
              keypoints={effectiveSingleKp}
              correctedKeypoints={single.correctedKeypoints}
              errors={single.errors}
              centerOfGravity={single.centerOfGravity}
              manualMode={manualMode}
              onManualJoint={handleManualJoint}
            />
          </div>
          {hasResults && (
            <div style={s.panelWrap}>
              <ErrorPanel
                errors={single.errors}
                angles={single.angles}
                proportions={single.proportions}
                symmetry={single.symmetry}
                centerOfGravity={single.centerOfGravity}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Compare results ── */}
      {mode === "compare" && (compare.refImageSrc || compare.drawImageSrc) && (
        <div style={s.resultsGrid}>
          <div style={s.canvasWrap}>
            <CanvasViewer
              compareMode
              refImageSrc={compare.refImageSrc}
              refKeypoints={compare.refKeypoints}
              drawImageSrc={compare.drawImageSrc}
              drawKeypoints={compare.drawKeypoints}
              correctedKeypoints={compare.correctedKeypoints}
              errors={compare.comparison?.major_errors}
              usedFallback={compare.usedFallback}
              anatomyFallback={compare.anatomyFallback}
              detectionCase={compare.detectionCase}
            />
          </div>
          {compare.comparison && (
            <div style={s.panelWrap}>
              <ErrorPanel
                compareMode
                comparison={compare.comparison}
                drawingAnalysis={compare.drawingAnalysis}
                usedFallback={compare.usedFallback}
                anatomyFallback={compare.anatomyFallback}
                detectionCase={compare.detectionCase}
                refDetected={compare.refDetected}
                drawDetected={compare.drawDetected}
                refConfidence={compare.refConfidence}
                drawConfidence={compare.drawConfidence}
                similarityScore={compare.similarityScore}
                upperBodyMode={compare.upperBodyMode}
                poseTypeMismatch={compare.poseTypeMismatch}
              />
            </div>
          )}
        </div>
      )}

    </div>
  );
}


// ── Small components ──────────────────────────────────────────────────────────

function Chip({ color, label }) {
  return (
    <span style={s.chip}>
      <span style={{ ...s.chipDot, background: color }} />
      {label}
    </span>
  );
}

function ModeBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...s.modeBtn,
        background:  active ? "#4f46e5" : "transparent",
        color:       active ? "#fff"    : "#64748b",
        borderColor: active ? "#4f46e5" : "#334155",
      }}
    >
      {children}
    </button>
  );
}

function LoadingBar() {
  return (
    <div style={s.loadingWrap} role="status" aria-label="Analyzing">
      <div style={s.loadingTrack}>
        <div style={s.loadingFill} />
      </div>
      <span style={s.loadingText}>Detecting pose…</span>
      <style>{`
        @keyframes slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:         { maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px", fontFamily: "'Segoe UI', system-ui, sans-serif", color: "#e2e8f0" },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 },
  title:        { fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: 4, color: "#a5b4fc" },
  subtitle:     { margin: "4px 0 0", fontSize: 12, color: "#475569", letterSpacing: 1 },
  legend:       { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" },
  chip:         { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#94a3b8" },
  chipDot:      { width: 9, height: 9, borderRadius: "50%", display: "inline-block", flexShrink: 0 },
  modeBar:      { display: "flex", gap: 8, marginBottom: 16 },
  modeBtn:      { border: "1px solid", borderRadius: 8, padding: "6px 16px", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" },
  apiError:     { marginTop: 14, background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  manualBtn:    { background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  manualBanner: { marginTop: 10, background: "#1e1b4b", border: "1px solid #4338ca", borderRadius: 8, padding: "8px 14px", color: "#a5b4fc", fontSize: 12, display: "flex", alignItems: "center", gap: 12 },
  manualClear:  { background: "none", border: "1px solid #4338ca", color: "#818cf8", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" },
  loadingWrap:  { marginTop: 14, display: "flex", alignItems: "center", gap: 12 },
  loadingTrack: { flex: 1, height: 3, background: "#1e293b", borderRadius: 2, overflow: "hidden" },
  loadingFill:  { height: "100%", width: "25%", background: "#6366f1", borderRadius: 2, animation: "slide 1.2s ease-in-out infinite" },
  loadingText:  { fontSize: 12, color: "#64748b", whiteSpace: "nowrap" },
  resultsGrid:  { marginTop: 20, display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 1fr)", gap: 20, alignItems: "start" },
  previewOnly:  { marginTop: 20 },
  canvasWrap:   { minWidth: 0 },
  panelWrap:    { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: "16px 18px", minWidth: 0 },
};
