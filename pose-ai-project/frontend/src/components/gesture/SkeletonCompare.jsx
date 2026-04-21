/**
 * SkeletonCompare.jsx
 *
 * Visual comparison overlay shown in the compare phase.
 * Renders three layers in one SVG:
 *   1. Reference skeleton — faint grey (behind everything)
 *   2. Difference lines   — thin red lines from user joint → ref joint
 *   3. User skeleton      — joints colored by error severity
 *
 * Props:
 *   userJoints  — normalised 0-1 joint map from exportSkeleton()
 *   refJoints   — normalised 0-1 reference joint map
 *   jointErrors — { [key]: { absDiff, severity: "good"|"medium"|"high" } }
 */

const W = 400;
const H = 520;

const BONES = [
  ["left_shoulder",  "right_shoulder"],
  ["left_shoulder",  "left_hip"],
  ["right_shoulder", "right_hip"],
  ["left_hip",       "right_hip"],
  ["left_shoulder",  "left_elbow"],
  ["left_elbow",     "left_wrist"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow",    "right_wrist"],
  ["left_hip",       "left_knee"],
  ["left_knee",      "left_ankle"],
  ["right_hip",      "right_knee"],
  ["right_knee",     "right_ankle"],
  ["left_shoulder",  "nose"],
  ["right_shoulder", "nose"],
];

const SEVERITY_COLOR = {
  good:   "#22c55e",   // green
  medium: "#f59e0b",   // yellow
  high:   "#ef4444",   // red
};

// Convert normalised coords → logical px
function px(joints, key) {
  const j = joints?.[key];
  if (!j) return null;
  return { x: j.x * W, y: j.y * H };
}

export default function SkeletonCompare({ userJoints, refJoints, jointErrors }) {
  if (!userJoints || !refJoints) return null;

  const allKeys = Object.keys(userJoints);

  return (
    <div style={{
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px 0",
    }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: "min(360px, 90vw)",
          height: "auto",
          background: "#ffffff",
          border: "1.5px solid #e5e7eb",
          borderRadius: 12,
          display: "block",
        }}
        aria-label="Skeleton comparison"
      >
        {/* ── Layer 1: Reference skeleton (faint) ─────────────────────── */}
        <g opacity={0.18}>
          {BONES.map(([a, b]) => {
            const ra = px(refJoints, a);
            const rb = px(refJoints, b);
            if (!ra || !rb) return null;
            return (
              <line key={`ref-bone-${a}-${b}`}
                x1={ra.x} y1={ra.y} x2={rb.x} y2={rb.y}
                stroke="#6366f1" strokeWidth={3} strokeLinecap="round"
              />
            );
          })}
          {allKeys.map(key => {
            const r = px(refJoints, key);
            if (!r) return null;
            return (
              <circle key={`ref-joint-${key}`}
                cx={r.x} cy={r.y} r={7}
                fill="#6366f1" stroke="#fff" strokeWidth={1.5}
              />
            );
          })}
        </g>

        {/* ── Layer 2: Difference lines (user → ref) ───────────────────── */}
        {allKeys.map(key => {
          const u = px(userJoints, key);
          const r = px(refJoints,  key);
          if (!u || !r) return null;
          const err = jointErrors?.[key];
          if (!err || err.severity === "good") return null;
          return (
            <line key={`diff-${key}`}
              x1={u.x} y1={u.y} x2={r.x} y2={r.y}
              stroke="#ef4444" strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.7}
            />
          );
        })}

        {/* ── Layer 3: User skeleton (colored by error) ────────────────── */}
        {BONES.map(([a, b]) => {
          const ua = px(userJoints, a);
          const ub = px(userJoints, b);
          if (!ua || !ub) return null;
          return (
            <line key={`user-bone-${a}-${b}`}
              x1={ua.x} y1={ua.y} x2={ub.x} y2={ub.y}
              stroke="rgba(99,102,241,0.7)" strokeWidth={2.5} strokeLinecap="round"
            />
          );
        })}
        {allKeys.map(key => {
          const u   = px(userJoints, key);
          if (!u) return null;
          const err      = jointErrors?.[key];
          const severity = err?.severity ?? "good";
          const color    = SEVERITY_COLOR[severity];
          const r        = severity === "high" ? 9 : 7;

          return (
            <g key={`user-joint-${key}`}>
              {/* Glow ring for errors */}
              {severity !== "good" && (
                <circle cx={u.x} cy={u.y} r={r + 6}
                  fill={color} opacity={0.18}
                />
              )}
              <circle cx={u.x} cy={u.y} r={r}
                fill={color} stroke="#fff" strokeWidth={2}
              />
              {/* Label */}
              <text x={u.x} y={u.y + r + 11}
                textAnchor="middle" fontSize={8}
                fill={severity !== "good" ? color : "#9ca3af"}
                style={{ userSelect: "none" }}
              >
                {key.replace(/_/g, " ")}
              </text>
            </g>
          );
        })}

        {/* ── Legend ───────────────────────────────────────────────────── */}
        <g transform={`translate(8, ${H - 28})`}>
          {[
            { color: "#22c55e", label: "Correct" },
            { color: "#f59e0b", label: "Small error" },
            { color: "#ef4444", label: "Large error" },
          ].map(({ color, label }, i) => (
            <g key={label} transform={`translate(${i * 90}, 0)`}>
              <circle cx={6} cy={6} r={5} fill={color} />
              <text x={14} y={10} fontSize={9} fill="#6b7280"
                style={{ userSelect: "none" }}>
                {label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
