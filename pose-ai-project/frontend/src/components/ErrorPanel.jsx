/**
 * ErrorPanel.jsx
 * Renders analysis errors and comparison feedback.
 *
 * Props (single mode):   errors, angles, proportions, symmetry, centerOfGravity
 * Props (compare mode):  compareMode=true, comparison, drawingAnalysis
 */

import { useState } from "react";

export default function ErrorPanel(props) {
  return props.compareMode
    ? <ComparePanel {...props} />
    : <SinglePanel  {...props} />;
}


// ── Single mode ───────────────────────────────────────────────────────────────

function SinglePanel({ errors, angles, proportions, symmetry, centerOfGravity }) {
  const [open, setOpen] = useState(false);
  if (!errors) return null;

  const hasDetails = angles || proportions || symmetry;

  return (
    <div style={s.root}>
      {errors.length === 0
        ? <div style={s.success}>✓ No anatomical issues detected</div>
        : <>
            <p style={s.errorHeading}>{errors.length} issue{errors.length !== 1 ? "s" : ""} detected</p>
            <ErrorList errors={errors} />
          </>
      }

      {centerOfGravity && (
        <div style={{ ...s.cogRow, color: centerOfGravity.balanced ? "#4ade80" : "#f87171" }}>
          <span style={s.label}>CoG</span>
          x={centerOfGravity.x} y={centerOfGravity.y} — {centerOfGravity.balanced ? "balanced" : "off-balance"}
        </div>
      )}

      {hasDetails && (
        <button style={s.toggle} onClick={() => setOpen(v => !v)}>
          {open ? "▲ Hide details" : "▼ Show analysis details"}
        </button>
      )}

      {open && (
        <div style={s.details}>
          {angles      && <DataSection title="Joint Angles (°)"           data={angles} />}
          {proportions && <DataSection title="Limb Proportions (÷ torso)" data={proportions} />}
          {symmetry    && <DataSection title="Symmetry Deviation"         data={symmetry} />}
        </div>
      )}
    </div>
  );
}


// ── Compare mode ──────────────────────────────────────────────────────────────

function ComparePanel({
  comparison, drawingAnalysis,
  usedFallback, anatomyFallback, detectionCase,
  refDetected, drawDetected, refConfidence, drawConfidence,
  similarityScore, upperBodyMode, poseTypeMismatch,
}) {
  const [open, setOpen] = useState(false);
  if (!comparison) return null;

  const { feedback, major_errors, angle_diff, proportion_diff, torso_lean_diff } = comparison;

  // Pose type mismatch — suppress all comparison results
  if (poseTypeMismatch) {
    const label = { full_body: "full body", upper_body: "upper body", face: "face only", unknown: "unknown" };
    return (
      <div style={s.root}>
        <div style={s.typeMismatch}>
          <span style={s.typeMismatchIcon}>⚠</span>
          <div>
            <div style={{ fontWeight: "bold", marginBottom: 4 }}>Pose type mismatch</div>
            <div>
              Reference is <em>{label[poseTypeMismatch.refType]  || poseTypeMismatch.refType}</em>,
              drawing is <em>{label[poseTypeMismatch.drawType] || poseTypeMismatch.drawType}</em>.
            </div>
            <div style={{ marginTop: 6, color: "#fca5a5" }}>
              Please upload similar types of images (e.g., full body vs full body).
            </div>
          </div>
        </div>
        <div style={s.mismatchDisabled}>
          Pose match %, angle comparison, and proportion results are disabled until the pose types match.
        </div>
      </div>
    );
  }

  // Detection case banner
  const caseBanner = (() => {
    if (detectionCase === 2 || usedFallback)
      return { style: s.fallbackWarning, text: "⚠ Drawing estimated from reference — pose was not detected in the drawing image." };
    if (detectionCase === 3 || anatomyFallback)
      return { style: s.anatomyWarning,  text: "ℹ Reference not detected — comparing drawing against standard anatomy model." };
    return null;
  })();

  return (
    <div style={s.root}>
      {/* Similarity score — top of panel */}
      {similarityScore != null && <ScoreWidget score={similarityScore} />}

      {caseBanner && <div style={caseBanner.style}>{caseBanner.text}</div>}

      {/* Upper body mode notice */}
      {upperBodyMode && (
        <div style={s.upperBodyNotice}>
          ↑ Upper body comparison mode — leg keypoints were not detected in one or both images.
        </div>
      )}

      {/* Confidence row */}
      {(refConfidence != null || drawConfidence != null) && (
        <div style={s.confRow}>
          {refConfidence  != null && <ConfBadge label="Detection Confidence (Reference):"     value={refConfidence}  detected={refDetected} />}
          {drawConfidence != null && <ConfBadge label="Detection Confidence (Drawing):" value={drawConfidence} detected={drawDetected} />}
        </div>
      )}
      {/* Smart feedback */}
      {feedback?.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={s.sectionTitle}>Feedback</p>
          <ul style={s.list}>
            {feedback.map((f, i) => (
              <li key={i} style={{ ...s.listItem, color: "#fcd34d" }}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Major errors */}
      {major_errors?.length > 0 && (
        <>
          <p style={s.errorHeading}>{major_errors.length} major deviation{major_errors.length !== 1 ? "s" : ""}</p>
          <ErrorList errors={major_errors} />
        </>
      )}

      {major_errors?.length === 0 && feedback?.length > 0 && (
        <div style={s.success}>✓ No major deviations from reference</div>
      )}

      {/* Toggle detailed diffs */}
      {(angle_diff || proportion_diff) && (
        <button style={s.toggle} onClick={() => setOpen(v => !v)}>
          {open ? "▲ Hide diff details" : "▼ Show diff details"}
        </button>
      )}

      {open && (
        <div style={s.details}>
          {angle_diff && Object.keys(angle_diff).length > 0 && (
            <DiffSection title="Angle Differences (°)" data={angle_diff} valueKey="diff" unit="°" />
          )}
          {proportion_diff && Object.keys(proportion_diff).length > 0 && (
            <DiffSection title="Proportion Differences (%)" data={proportion_diff} valueKey="diff_pct" unit="%" />
          )}
          {torso_lean_diff && Object.keys(torso_lean_diff).length > 0 && (
            <div style={s.section}>
              <p style={s.sectionTitle}>Torso Lean</p>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>
                Ref: {torso_lean_diff.ref?.toFixed(1)}° · Drawing: {torso_lean_diff.drawing?.toFixed(1)}° · Diff: {torso_lean_diff.diff?.toFixed(1)}°
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── Shared sub-components ─────────────────────────────────────────────────────

function ErrorList({ errors }) {
  return (
    <ul style={s.list}>
      {errors.map((e, i) => (
        <li key={i} style={s.listItem}>
          <span style={s.joint}>[{e.joint}]</span>
          <span style={s.msg}>{e.message}</span>
        </li>
      ))}
    </ul>
  );
}

function DataSection({ title, data }) {
  return (
    <div style={s.section}>
      <p style={s.sectionTitle}>{title}</p>
      <div style={s.grid}>
        {Object.entries(data).map(([k, v]) => (
          <div key={k} style={s.cell}>
            <span style={s.cellKey}>{k.replace(/_/g, " ")}</span>
            <span style={s.cellVal}>{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfBadge({ label, value, detected }) {
  const pct   = Math.round((value || 0) * 100);
  const color = detected ? (pct > 70 ? "#4ade80" : "#fcd34d") : "#f87171";
  return (
    <span style={{ fontSize: 10, color, border: `1px solid ${color}`, borderRadius: 4, padding: "1px 6px" }}>
      {label}: {detected ? `${pct}%` : "not detected"}
    </span>
  );
}

function DiffSection({ title, data, valueKey, unit }) {
  return (
    <div style={s.section}>
      <p style={s.sectionTitle}>{title}</p>
      <div style={s.grid}>
        {Object.entries(data).map(([k, v]) => {
          const val  = v[valueKey];
          const color = Math.abs(val) > 15 ? "#f87171" : Math.abs(val) > 5 ? "#fcd34d" : "#4ade80";
          return (
            <div key={k} style={s.cell}>
              <span style={s.cellKey}>{k.replace(/_/g, " ")}</span>
              <span style={{ ...s.cellVal, color }}>
                {val > 0 ? "+" : ""}{typeof val === "number" ? val.toFixed(1) : val}{unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Score widget ──────────────────────────────────────────────────────────────

/**
 * ScoreWidget — displays "Pose Match: 92%" with a color-coded arc bar.
 * Green ≥ 80, Amber 50–79, Red < 50.
 */
function ScoreWidget({ score }) {
  const pct   = Math.round(score);
  const color = pct >= 80 ? "#4ade80" : pct >= 50 ? "#fbbf24" : "#f87171";
  const bg    = pct >= 80 ? "#052e16" : pct >= 50 ? "#451a03" : "#1c0a0a";
  const border= pct >= 80 ? "#166534" : pct >= 50 ? "#92400e" : "#7f1d1d";

  // Arc bar: SVG half-circle, filled proportionally
  const R      = 36;
  const cx     = 50;
  const cy     = 46;
  const stroke = 7;
  // Full half-arc length (π * R)
  const arcLen = Math.PI * R;
  const filled = (pct / 100) * arcLen;

  // Half-circle path: left → right along top
  const arcPath = `M ${cx - R},${cy} A ${R},${R} 0 0,1 ${cx + R},${cy}`;

  return (
    <div style={{ ...s.scoreBox, background: bg, borderColor: border }}>
      <svg width="100" height="52" aria-hidden="true" style={{ display: "block", margin: "0 auto 4px" }}>
        {/* Track */}
        <path d={arcPath} fill="none" stroke="#1e293b" strokeWidth={stroke} strokeLinecap="round" />
        {/* Fill */}
        <path
          d={arcPath}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${arcLen}`}
        />
      </svg>
      <div style={{ textAlign: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: 1 }}>{pct}%</span>
        <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginTop: 2 }}>
          Pose Match
        </div>
      </div>
    </div>
  );
}


// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root:            { fontFamily: "monospace", fontSize: 13 },
  scoreBox:        { marginBottom: 16, padding: "14px 12px 10px", border: "1px solid", borderRadius: 8, textAlign: "center" },
  fallbackWarning: { marginBottom: 12, padding: "8px 12px", background: "#451a03", border: "1px solid #92400e", borderRadius: 6, color: "#fbbf24", fontSize: 12, lineHeight: 1.5 },
  anatomyWarning:  { marginBottom: 12, padding: "8px 12px", background: "#0c1a2e", border: "1px solid #1e40af", borderRadius: 6, color: "#93c5fd", fontSize: 12, lineHeight: 1.5 },
  upperBodyNotice: { marginBottom: 12, padding: "8px 12px", background: "#1a1a2e", border: "1px solid #6366f1", borderRadius: 6, color: "#a5b4fc", fontSize: 12, lineHeight: 1.5 },
  typeMismatch:    { display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14, padding: "12px 14px", background: "#1c0a0a", border: "1px solid #7f1d1d", borderRadius: 8, color: "#fca5a5", fontSize: 13, lineHeight: 1.6 },
  typeMismatchIcon:{ fontSize: 20, flexShrink: 0, color: "#f87171" },
  mismatchDisabled:{ marginTop: 10, padding: "8px 12px", background: "#0f172a", border: "1px dashed #334155", borderRadius: 6, color: "#475569", fontSize: 11, fontStyle: "italic" },
  confRow:         { display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  success:         { color: "#4ade80", background: "#052e16", border: "1px solid #166534", borderRadius: 6, padding: "8px 12px" },
  errorHeading: { color: "#f87171", margin: "0 0 10px", fontWeight: "bold", fontSize: 13 },
  list:         { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 },
  listItem:     { display: "flex", gap: 8, alignItems: "baseline", lineHeight: 1.5 },
  joint:        { color: "#f87171", whiteSpace: "nowrap", flexShrink: 0 },
  msg:          { color: "#fca5a5" },
  cogRow:       { marginTop: 12, fontSize: 12, display: "flex", gap: 8, alignItems: "center" },
  label:        { color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  toggle:       { marginTop: 14, background: "none", border: "1px solid #334155", color: "#64748b", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 11, display: "block" },
  details:      { marginTop: 12, display: "flex", flexDirection: "column", gap: 14 },
  section:      {},
  sectionTitle: { margin: "0 0 6px", color: "#475569", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  grid:         { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "4px 10px" },
  cell:         { display: "flex", justifyContent: "space-between", gap: 6, fontSize: 11 },
  cellKey:      { color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  cellVal:      { color: "#e2e8f0", flexShrink: 0 },
};
