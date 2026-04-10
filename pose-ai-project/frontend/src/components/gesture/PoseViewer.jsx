/**
 * PoseViewer.jsx
 * Fullscreen pose image with fade-in/out, metadata overlay, tips,
 * and optional FlowOverlay (line of action, rhythm lines, balance).
 *
 * Props:
 *   pose         — pose object from dataset
 *   visible      — bool, controls fade
 *   showTips     — bool
 *   landmarks    — MediaPipe landmark array (optional, for flow overlay)
 *   showAction   — bool
 *   showRhythm   — bool
 *   showBalance  — bool
 */

import { useRef, useState, useEffect } from "react";
import FlowOverlay from "./FlowOverlay";

export default function PoseViewer({
  pose, visible, showTips,
  landmarks, showAction, showRhythm, showBalance,
}) {
  const imgRef  = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setImgSize({ w: img.clientWidth, h: img.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(img);
    return () => ro.disconnect();
  }, [pose?.imageUrl]);

  if (!pose) return null;

  const diffColor = {
    easy:   { bg: "rgba(16,185,129,0.18)", color: "#34d399" },
    medium: { bg: "rgba(245,158,11,0.18)",  color: "#fbbf24" },
    hard:   { bg: "rgba(236,72,153,0.18)",  color: "#f472b6" },
  }[pose.difficulty] || { bg: "rgba(255,255,255,0.1)", color: "#fff" };

  const catColor = {
    basic:   "#60a5fa",
    gesture: "#fb923c",
    sitting: "#4ade80",
    anatomy: "#a78bfa",
  }[pose.category] || "#fff";

  const hasFlow = showAction || showRhythm || showBalance;

  return (
    <div className={`pv-root${visible ? " pv-visible" : ""}`}>
      <img
        ref={imgRef}
        src={pose.imageUrl}
        alt={pose.label}
        className="pv-img"
        draggable={false}
        onLoad={() => {
          const img = imgRef.current;
          if (img) setImgSize({ w: img.clientWidth, h: img.clientHeight });
        }}
      />

      {/* Flow overlay — sits directly over the image */}
      {hasFlow && (
        <FlowOverlay
          landmarks={landmarks}
          imageWidth={imgSize.w}
          imageHeight={imgSize.h}
          showAction={showAction}
          showRhythm={showRhythm}
          showBalance={showBalance}
        />
      )}

      <div className="pv-gradient" />

      <div className="pv-meta">
        <div className="pv-meta-left">
          <span className="pv-label">{pose.label}</span>
          <div className="pv-chips">
            <span className="pv-chip" style={{ background: diffColor.bg, color: diffColor.color }}>
              {pose.difficulty}
            </span>
            <span className="pv-chip" style={{ background: "rgba(255,255,255,0.1)", color: catColor }}>
              {pose.category}
            </span>
          </div>
        </div>
        <p className="pv-desc">{pose.description}</p>
      </div>

      {showTips && pose.tips?.length > 0 && (
        <div className="pv-tips">
          <span className="pv-tips-title">Drawing tips</span>
          <ul className="pv-tips-list">
            {pose.tips.map((t, i) => (
              <li key={i} className="pv-tip-item">
                <span className="pv-tip-dot" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
