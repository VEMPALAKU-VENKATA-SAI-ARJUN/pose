/**
 * FeedbackPanel.jsx
 * Displays AI pose evaluation results:
 *   - Accuracy score ring
 *   - Per-joint feedback cards
 *   - Angle diff table (expandable)
 *
 * Props:
 *   score      — 0-100
 *   feedback   — array of { key, message, diff, refAngle, drawAngle, severity }
 *   angleDiffs — full angle diff array for the detail table
 *   loading    — bool, show skeleton loader
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, CheckCircle, AlertTriangle, AlertCircle } from "lucide-react";

function scoreColor(s) {
  if (s >= 80) return "#22c55e";
  if (s >= 55) return "#f59e0b";
  return "#ef4444";
}

function ScoreRing({ score }) {
  const pct    = Math.round(score);
  const R      = 38; const cx = 48; const cy = 48;
  const circ   = Math.PI * R;
  const filled = (pct / 100) * circ;
  const color  = scoreColor(pct);
  const path   = `M ${cx - R},${cy} A ${R},${R} 0 0,1 ${cx + R},${cy}`;

  return (
    <div className="fp-score-wrap">
      <svg width="96" height="54" aria-hidden="true">
        <path d={path} fill="none" stroke="#E5E7EB" strokeWidth="7" strokeLinecap="round" />
        <path d={path} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`} />
      </svg>
      <div className="fp-score-text">
        <span className="fp-score-pct" style={{ color }}>{pct}%</span>
        <span className="fp-score-label">AI Accuracy</span>
      </div>
    </div>
  );
}

const SEVERITY_ICON = {
  good:   <CheckCircle  size={13} color="#22c55e" />,
  medium: <AlertTriangle size={13} color="#f59e0b" />,
  high:   <AlertCircle  size={13} color="#ef4444" />,
};

export default function FeedbackPanel({ score, feedback, angleDiffs, loading }) {
  const [showTable, setShowTable] = useState(false);

  if (loading) {
    return (
      <div className="fp-root fp-loading">
        <div className="fp-skeleton fp-skeleton--ring" />
        <div className="fp-skeleton fp-skeleton--line" />
        <div className="fp-skeleton fp-skeleton--line fp-skeleton--short" />
        <div className="fp-skeleton fp-skeleton--line" />
      </div>
    );
  }

  if (score == null) return null;

  return (
    <div className="fp-root">
      <div className="fp-header">
        <ScoreRing score={score} />
        <div className="fp-header-text">
          <span className="fp-title">AI Pose Evaluation</span>
          <span className="fp-subtitle">
            {score >= 80 ? "Excellent accuracy — your pose closely matches the reference."
           : score >= 55 ? "Good attempt — a few joints need adjustment."
           : "Keep practicing — focus on the flagged joints below."}
          </span>
        </div>
      </div>

      {/* Feedback cards */}
      <div className="fp-cards">
        {feedback.map((item, i) => (
          <div key={i} className={`fp-card fp-card--${item.severity}`}>
            <span className="fp-card-icon">{SEVERITY_ICON[item.severity]}</span>
            <span className="fp-card-msg">{item.message}</span>
            {item.diff != null && (
              <span className="fp-card-diff">
                {item.refAngle}° → {item.drawAngle}° ({item.diff > 0 ? "+" : ""}{item.diff}°)
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Expandable angle table */}
      {angleDiffs?.length > 0 && (
        <div className="fp-table-wrap">
          <button className="fp-table-toggle" onClick={() => setShowTable(v => !v)}>
            {showTable ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {showTable ? "Hide" : "Show"} angle breakdown
          </button>
          {showTable && (
            <table className="fp-table">
              <thead>
                <tr>
                  <th>Joint</th>
                  <th>Reference</th>
                  <th>Your Drawing</th>
                  <th>Diff</th>
                </tr>
              </thead>
              <tbody>
                {angleDiffs.map(({ key, label, refAngle, drawAngle, diff }) => {
                  const flagged = Math.abs(diff) > 15;
                  return (
                    <tr key={key} className={flagged ? "fp-row--flagged" : ""}>
                      <td>{label}</td>
                      <td>{Math.round(refAngle)}°</td>
                      <td>{Math.round(drawAngle)}°</td>
                      <td style={{ color: flagged ? "#ef4444" : "#22c55e", fontWeight: 700 }}>
                        {diff > 0 ? "+" : ""}{Math.round(diff)}°
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
