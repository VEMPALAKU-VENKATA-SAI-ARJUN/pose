/**
 * SkeletonBuilder.jsx
 * Draggable skeleton using DOM + SVG (no canvas).
 * Logic ported directly from SkeletonBuilderTest.jsx.
 *
 * Exposes via ref:
 *   exportSkeleton() → { joints: { nose: {x,y}, … } }  (normalised 0-1)
 *   getJoints()      → same
 *   reset()          → restore T-pose
 *   undo()           → step back one history snapshot
 */

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from "react";

// ── Initial joint positions (px, within a 400×520 logical space) ─────────────
// x < 200 = viewer's LEFT, x > 200 = viewer's RIGHT
// "left_*" joints belong to the subject's left body side → viewer's RIGHT
// "right_*" joints belong to the subject's right body side → viewer's LEFT
// Swapped so the skeleton visually matches the reference image (mirror-correct).
const INITIAL_JOINTS = {
  nose:           { x: 200, y:  38 },
  left_shoulder:  { x: 242, y: 105 },  // subject's left → viewer's right
  right_shoulder: { x: 158, y: 105 },  // subject's right → viewer's left
  left_elbow:     { x: 272, y: 185 },
  right_elbow:    { x: 128, y: 185 },
  left_wrist:     { x: 292, y: 262 },
  right_wrist:    { x: 108, y: 262 },
  left_hip:       { x: 228, y: 268 },
  right_hip:      { x: 172, y: 268 },
  left_knee:      { x: 235, y: 368 },
  right_knee:     { x: 165, y: 368 },
  left_ankle:     { x: 240, y: 468 },
  right_ankle:    { x: 160, y: 468 },
};

const LOGICAL_W = 400;
const LOGICAL_H = 520;

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

const JOINT_RADIUS = 10;

function freshJoints() {
  return Object.fromEntries(
    Object.entries(INITIAL_JOINTS).map(([k, v]) => [k, { ...v }])
  );
}

const SkeletonBuilder = forwardRef(function SkeletonBuilder(
  { flaggedJoints = [] },
  ref
) {
  const [joints, setJoints] = useState(freshJoints);
  const historyRef   = useRef([]);
  const activeJoint  = useRef(null);
  const offset       = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const flaggedSet   = new Set(flaggedJoints);

  useEffect(() => {
    console.log("[SkeletonBuilder] mounted");
  }, []);

  // ── Ref API ───────────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    exportSkeleton() {
      const normalised = {};
      for (const [key, pos] of Object.entries(joints)) {
        normalised[key] = { x: pos.x / LOGICAL_W, y: pos.y / LOGICAL_H };
      }
      return { joints: normalised };
    },
    getJoints() {
      const normalised = {};
      for (const [key, pos] of Object.entries(joints)) {
        normalised[key] = { x: pos.x / LOGICAL_W, y: pos.y / LOGICAL_H };
      }
      return normalised;
    },
    reset() {
      historyRef.current.push(joints);
      setJoints(freshJoints());
    },
    undo() {
      const snap = historyRef.current.pop();
      if (snap) setJoints(snap);
    },
  }), [joints]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onJointMouseDown = useCallback((e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    const scaleX = LOGICAL_W / rect.width;
    const scaleY = LOGICAL_H / rect.height;
    offset.current = {
      x: (e.clientX - rect.left) * scaleX - joints[key].x,
      y: (e.clientY - rect.top)  * scaleY - joints[key].y,
    };
    activeJoint.current = key;
    historyRef.current.push({ ...joints });
  }, [joints]);

  const onMouseMove = useCallback((e) => {
    if (!activeJoint.current) return;
    const rect   = containerRef.current.getBoundingClientRect();
    const scaleX = LOGICAL_W / rect.width;
    const scaleY = LOGICAL_H / rect.height;
    const x = Math.max(0, Math.min(LOGICAL_W, (e.clientX - rect.left) * scaleX - offset.current.x));
    const y = Math.max(0, Math.min(LOGICAL_H, (e.clientY - rect.top)  * scaleY - offset.current.y));
    setJoints(prev => ({ ...prev, [activeJoint.current]: { x, y } }));
  }, []);

  const onMouseUp = useCallback(() => {
    activeJoint.current = null;
  }, []);

  // Touch support
  const onJointTouchStart = useCallback((e, key) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect  = containerRef.current.getBoundingClientRect();
    const scaleX = LOGICAL_W / rect.width;
    const scaleY = LOGICAL_H / rect.height;
    offset.current = {
      x: (touch.clientX - rect.left) * scaleX - joints[key].x,
      y: (touch.clientY - rect.top)  * scaleY - joints[key].y,
    };
    activeJoint.current = key;
    historyRef.current.push({ ...joints });
  }, [joints]);

  const onTouchMove = useCallback((e) => {
    if (!activeJoint.current) return;
    e.preventDefault();
    const touch  = e.touches[0];
    const rect   = containerRef.current.getBoundingClientRect();
    const scaleX = LOGICAL_W / rect.width;
    const scaleY = LOGICAL_H / rect.height;
    const x = Math.max(0, Math.min(LOGICAL_W, (touch.clientX - rect.left) * scaleX - offset.current.x));
    const y = Math.max(0, Math.min(LOGICAL_H, (touch.clientY - rect.top)  * scaleY - offset.current.y));
    setJoints(prev => ({ ...prev, [activeJoint.current]: { x, y } }));
  }, []);

  const onTouchEnd = useCallback(() => {
    activeJoint.current = null;
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--gm-canvas-bg, #f8f9fb)",
      }}
    >
      {/* Fixed-aspect skeleton area */}
      <div
        ref={containerRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position: "relative",
          width: "min(400px, 90vw)",
          aspectRatio: `${LOGICAL_W} / ${LOGICAL_H}`,
          background: "#ffffff",
          border: "1.5px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          userSelect: "none",
          touchAction: "none",
        }}
      >
        {/* SVG bones */}
        <svg
          viewBox={`0 0 ${LOGICAL_W} ${LOGICAL_H}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            overflow: "visible",
          }}
        >
          {BONES.map(([a, b]) => {
            const ja = joints[a];
            const jb = joints[b];
            if (!ja || !jb) return null;
            return (
              <line
                key={`${a}-${b}`}
                x1={ja.x} y1={ja.y}
                x2={jb.x} y2={jb.y}
                stroke="rgba(99,102,241,0.65)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Joint circles — rendered in SVG so positions stay in logical space */}
        <svg
          viewBox={`0 0 ${LOGICAL_W} ${LOGICAL_H}`}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
          }}
        >
          {Object.entries(joints).map(([key, pos]) => {
            const isFlagged = flaggedSet.has(key);
            const isHead    = key === "nose";
            const fill      = isFlagged ? "#ef4444" : isHead ? "#7c3aed" : "#6366f1";

            return (
              <g key={key}>
                {/* Glow ring for flagged joints */}
                {isFlagged && (
                  <circle cx={pos.x} cy={pos.y} r={JOINT_RADIUS + 6}
                    fill="rgba(239,68,68,0.18)" />
                )}
                {/* Joint circle */}
                <circle
                  cx={pos.x} cy={pos.y} r={JOINT_RADIUS}
                  fill={fill}
                  stroke="#ffffff"
                  strokeWidth={2}
                  style={{ cursor: "grab" }}
                  onMouseDown={e => onJointMouseDown(e, key)}
                  onTouchStart={e => onJointTouchStart(e, key)}
                />
                {/* Label */}
                <text
                  x={pos.x} y={pos.y + JOINT_RADIUS + 11}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isFlagged ? "#ef4444" : "#6b7280"}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {key.replace(/_/g, " ")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});

export default SkeletonBuilder;
