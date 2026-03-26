/**
 * RecommendPanel.jsx — P.O.S.E Reference Pose Recommender
 *
 * Displays top-N similar reference poses ranked by cosine similarity
 * to the user's uploaded drawing.
 *
 * Props:
 *   recommendations  — array from /api/recommend
 *   loading          — bool, show skeleton loader
 *   error            — string | null
 */

const CATEGORY_COLORS = {
  standing:     { bg: "#0f1f2e", border: "#1e40af", text: "#93c5fd" },
  action:       { bg: "#1a0f0f", border: "#991b1b", text: "#fca5a5" },
  seated:       { bg: "#0f1a0f", border: "#166534", text: "#86efac" },
  upper_body:   { bg: "#1a1a0f", border: "#854d0e", text: "#fde68a" },
  leaning:      { bg: "#1a0f1a", border: "#6b21a8", text: "#d8b4fe" },
  martial_arts: { bg: "#1a0f0f", border: "#b45309", text: "#fcd34d" },
  dance:        { bg: "#0f1a1a", border: "#0e7490", text: "#67e8f9" },
  floor:        { bg: "#1a1a1a", border: "#374151", text: "#9ca3af" },
  kneeling:     { bg: "#0f1a14", border: "#065f46", text: "#6ee7b7" },
};

const DEFAULT_COLOR = { bg: "#0f172a", border: "#334155", text: "#94a3b8" };

function categoryStyle(cat) {
  return CATEGORY_COLORS[cat] || DEFAULT_COLOR;
}

// Score bar color: green ≥ 0.85, amber 0.70–0.84, slate < 0.70
function scoreColor(score) {
  if (score >= 0.85) return "#4ade80";
  if (score >= 0.70) return "#fbbf24";
  return "#64748b";
}

export default function RecommendPanel({ recommendations, loading, error }) {
  if (loading) return <SkeletonLoader />;
  if (error)   return <ErrorNote msg={error} />;
  if (!recommendations?.length) return null;

  return (
    <div style={s.root}>
      <p style={s.heading}>Suggested References</p>
      <p style={s.sub}>Poses similar to your drawing, ranked by structural similarity</p>
      <div style={s.grid}>
        {recommendations.map((rec, i) => (
          <PoseCard key={rec.id} rec={rec} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function PoseCard({ rec, rank }) {
  const cs    = categoryStyle(rec.category);
  const color = scoreColor(rec.score);
  const pct   = Math.round(rec.score * 100);

  return (
    <div style={{ ...s.card, background: cs.bg, borderColor: cs.border }}>
      {/* Rank badge */}
      <div style={{ ...s.rank, color: rank === 1 ? "#fbbf24" : "#475569" }}>
        #{rank}
      </div>

      {/* Score bar */}
      <div style={s.scoreRow}>
        <div style={s.scoreTrack}>
          <div style={{ ...s.scoreFill, width: `${pct}%`, background: color }} />
        </div>
        <span style={{ ...s.scorePct, color }}>{pct}%</span>
      </div>

      {/* Label */}
      <p style={s.label}>{rec.label}</p>

      {/* Description */}
      <p style={s.desc}>{rec.description}</p>

      {/* Tags */}
      <div style={s.tags}>
        <span style={{ ...s.catTag, color: cs.text, borderColor: cs.border }}>
          {rec.category.replace(/_/g, " ")}
        </span>
        {rec.tags.slice(0, 2).map(t => (
          <span key={t} style={s.tag}>{t}</span>
        ))}
      </div>
    </div>
  );
}

function SkeletonLoader() {
  return (
    <div style={s.root}>
      <p style={s.heading}>Suggested References</p>
      <div style={s.grid}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ ...s.card, background: "#0f172a", borderColor: "#1e293b" }}>
            <div style={s.skelLine} />
            <div style={{ ...s.skelLine, width: "60%", marginTop: 8 }} />
            <div style={{ ...s.skelLine, width: "80%", marginTop: 8, height: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorNote({ msg }) {
  return (
    <div style={s.root}>
      <p style={s.heading}>Suggested References</p>
      <div style={s.errorNote}>{msg}</div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  root:       { marginTop: 20 },
  heading:    { margin: "0 0 2px", fontSize: 12, fontWeight: 600, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: 2 },
  sub:        { margin: "0 0 12px", fontSize: 11, color: "#475569" },
  grid:       { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 },
  card:       { position: "relative", border: "1px solid", borderRadius: 8, padding: "12px 12px 10px", display: "flex", flexDirection: "column", gap: 6 },
  rank:       { position: "absolute", top: 8, right: 10, fontSize: 10, fontWeight: 700 },
  scoreRow:   { display: "flex", alignItems: "center", gap: 8 },
  scoreTrack: { flex: 1, height: 3, background: "#1e293b", borderRadius: 2, overflow: "hidden" },
  scoreFill:  { height: "100%", borderRadius: 2, transition: "width 0.4s ease" },
  scorePct:   { fontSize: 11, fontWeight: 700, minWidth: 30, textAlign: "right" },
  label:      { margin: 0, fontSize: 12, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 },
  desc:       { margin: 0, fontSize: 10, color: "#64748b", lineHeight: 1.5 },
  tags:       { display: "flex", gap: 5, flexWrap: "wrap", marginTop: 2 },
  catTag:     { fontSize: 9, border: "1px solid", borderRadius: 3, padding: "1px 5px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  tag:        { fontSize: 9, color: "#475569", border: "1px solid #1e293b", borderRadius: 3, padding: "1px 5px" },
  skelLine:   { height: 10, background: "#1e293b", borderRadius: 3, width: "100%", animation: "pulse 1.5s ease-in-out infinite" },
  errorNote:  { fontSize: 12, color: "#94a3b8", padding: "10px 12px", background: "#0f172a", border: "1px solid #1e293b", borderRadius: 6 },
};
