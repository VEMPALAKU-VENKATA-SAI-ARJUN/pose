/**
 * Dashboard.jsx — PoseAI landing dashboard
 * Six mode cards, fixed navbar, fade-in animations, React Router navigation.
 */

import { Link } from "react-router-dom";
import {
  ScanSearch, Scale, Target, Image, Trophy, Bone, ArrowRight, Sparkles,
} from "lucide-react";
import "./Dashboard.css";

// ── Mode card definitions ─────────────────────────────────────────────────────

const MODES = [
  {
    to:     "/analyze",
    Icon:   ScanSearch,
    title:  "Analysis Mode",
    desc:   "Upload a single image and get a full anatomical breakdown — joint angles, limb proportions, symmetry, and center of gravity.",
    accent: "linear-gradient(90deg, #7B61FF, #A855F7)",
    iconBg: "#f5f3ff",
    iconColor: "#7B61FF",
  },
  {
    to:     "/compare",
    Icon:   Scale,
    title:  "Comparison Mode",
    desc:   "Upload a reference and your drawing side-by-side. Get a pose match score, flagged deviations, and directional correction arrows.",
    accent: "linear-gradient(90deg, #2563eb, #7B61FF)",
    iconBg: "#eff6ff",
    iconColor: "#2563eb",
  },
  {
    to:     "/practice",
    Icon:   Target,
    title:  "Practice Mode",
    desc:   "Work through guided pose exercises with real-time feedback. Build muscle memory for accurate figure drawing.",
    accent: "linear-gradient(90deg, #059669, #10b981)",
    iconBg: "#ecfdf5",
    iconColor: "#059669",
  },
  {
    to:     "/reference",
    Icon:   Image,
    title:  "Reference Mode",
    desc:   "Browse and search a curated library of reference poses. Filter by category, difficulty, or body region.",
    accent: "linear-gradient(90deg, #d97706, #f59e0b)",
    iconBg: "#fffbeb",
    iconColor: "#d97706",
  },
  {
    to:     "/challenge",
    Icon:   Trophy,
    title:  "Challenge Mode",
    desc:   "Take on timed pose challenges and earn accuracy scores. Track your improvement over sessions.",
    accent: "linear-gradient(90deg, #dc2626, #f97316)",
    iconBg: "#fff1f2",
    iconColor: "#dc2626",
  },
  {
    to:     "/anatomy",
    Icon:   Bone,
    title:  "Anatomy Breakdown",
    desc:   "Explore the human skeleton and muscle groups interactively. Understand how anatomy drives pose and gesture.",
    accent: "linear-gradient(90deg, #0891b2, #06b6d4)",
    iconBg: "#ecfeff",
    iconColor: "#0891b2",
  },
];


// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <>
      <nav className="nav">
        <Sparkles size={18} style={{ color: "var(--grad-from)", flexShrink: 0 }} />
        <span className="nav-logo" style={{ marginLeft: 8 }}>PoseAI</span>
        <span className="nav-tagline">Pose Optimization &amp; Structural Evaluation</span>
      </nav>

      <main className="dashboard">
        <section className="hero">
           <h1 style={{fontSize:100}}>
           <span>PoseAI</span><br />
          </h1>
          <span className="hero-eyebrow">AI-Powered Figure Analysis</span>
          <h1>
            Master every <span>pose</span>,<br />
            perfect every <span>line</span>.
          </h1>
          <p>
            Choose a mode below to start analyzing, comparing, or practicing
            human figure poses with real-time AI feedback.
          </p>
        </section>

        <div className="card-grid">
          {MODES.map((m) => (
            <ModeCard key={m.to} {...m} />
          ))}
        </div>
      </main>
    </>
  );
}


// ── ModeCard ──────────────────────────────────────────────────────────────────

function ModeCard({ to, Icon, title, desc, accent, iconBg, iconColor }) {
  return (
    <Link to={to} className="card">
      <div className="card-accent" style={{ background: accent }} />
      <div className="card-icon" style={{ background: iconBg }}>
        <Icon size={22} color={iconColor} strokeWidth={1.8} />
      </div>
      <div className="card-title">{title}</div>
      <div className="card-desc">{desc}</div>
      <span className="card-arrow">
        <ArrowRight size={16} />
      </span>
    </Link>
  );
}
