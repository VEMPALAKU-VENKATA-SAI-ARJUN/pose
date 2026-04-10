/**
 * GestureTimer.jsx
 * Visual arc countdown. Plays a beep when time expires.
 * Props:
 *   remaining  — seconds left
 *   total      — total seconds for this round
 *   urgent     — bool, true when ≤ 10s
 */

import { useEffect, useRef } from "react";

// Tiny Web Audio beep — no external file needed
function playBeep() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type      = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch { /* audio blocked — silent fail */ }
}

function fmt(s) {
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = (s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

export default function GestureTimer({ remaining, total, urgent }) {
  const beeped = useRef(false);

  // Beep once when time hits 0
  useEffect(() => {
    if (remaining === 0 && !beeped.current) {
      beeped.current = true;
      playBeep();
    }
    if (remaining > 0) beeped.current = false;
  }, [remaining]);

  const R     = 44;
  const cx    = 56;
  const cy    = 56;
  const circ  = 2 * Math.PI * R;
  const pct   = total > 0 ? remaining / total : 0;
  const offset = circ * (1 - pct);

  const trackColor  = "rgba(255,255,255,0.15)";
  const fillColor   = urgent ? "#EC4899" : "rgba(213, 5, 255, 0.9)";
  const textColor   = urgent ? "#EC4899" : "#000000ff";

  return (
    <div className="gt-wrap" aria-label={`${remaining} seconds remaining`}>
      <svg width="112" height="112" viewBox="0 0 112 112">
        <defs>
          <filter id="gtGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={trackColor} strokeWidth="6" />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={R}
          fill="none"
          stroke={fillColor}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter={urgent ? "url(#gtGlow)" : undefined}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="gt-text">
        <span className="gt-time" style={{ color: textColor,
          animation: urgent ? "gtPulse 0.6s ease-in-out infinite alternate" : "none" }}>
          {fmt(remaining)}
        </span>
        <span className="gt-label">left</span>
      </div>
    </div>
  );
}
