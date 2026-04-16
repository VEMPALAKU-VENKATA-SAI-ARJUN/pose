/**
 * SkeletonBuilderTest.jsx
 * Debug/verification component — no canvas, no AI, no overlay.
 * Goal: confirm skeleton renders and dragging works.
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── Initial joint positions (px, relative to container) ──────────────────────
const INITIAL_JOINTS = {
  nose:           { x: 200, y:  40 },
  left_shoulder:  { x: 150, y: 100 },
  right_shoulder: { x: 250, y: 100 },
  left_elbow:     { x: 110, y: 170 },
  right_elbow:    { x: 290, y: 170 },
  left_wrist:     { x:  80, y: 240 },
  right_wrist:    { x: 320, y: 240 },
  left_hip:       { x: 165, y: 260 },
  right_hip:      { x: 235, y: 260 },
  left_knee:      { x: 160, y: 360 },
  right_knee:     { x: 240, y: 360 },
  left_ankle:     { x: 155, y: 460 },
  right_ankle:    { x: 245, y: 460 },
};

// ── Bone connections ──────────────────────────────────────────────────────────
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

export default function SkeletonBuilderTest() {
  const [joints, setJoints] = useState(() =>
    Object.fromEntries(
      Object.entries(INITIAL_JOINTS).map(([k, v]) => [k, { ...v }])
    )
  );

  const activeJoint = useRef(null);   // key of joint being dragged
  const offset      = useRef({ x: 0, y: 0 }); // cursor offset within joint
  const containerRef = useRef(null);

  useEffect(() => {
    console.log("[SkeletonBuilderTest] mounted — joints:", joints);
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const onJointMouseDown = useCallback((e, key) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = containerRef.current.getBoundingClientRect();
    offset.current = {
      x: e.clientX - rect.left - joints[key].x,
      y: e.clientY - rect.top  - joints[key].y,
    };
    activeJoint.current = key;
    console.log("[SkeletonBuilderTest] drag start:", key);
  }, [joints]);

  const onMouseMove = useCallback((e) => {
    if (!activeJoint.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - offset.current.x;
    const y = e.clientY - rect.top  - offset.current.y;
    setJoints(prev => ({
      ...prev,
      [activeJoint.current]: { x, y },
    }));
  }, []);

  const onMouseUp = useCallback(() => {
    if (activeJoint.current) {
      console.log("[SkeletonBuilderTest] drag end:", activeJoint.current, joints[activeJoint.current]);
    }
    activeJoint.current = null;
  }, [joints]);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: "#f0f4ff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: 24,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h2 style={{ margin: "0 0 8px", fontSize: 16, color: "#333" }}>
        SkeletonBuilder — Debug View
      </h2>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#888" }}>
        Drag any joint to reposition it. Check console for logs.
      </p>

      {/* Canvas area */}
      <div
        ref={containerRef}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          position: "relative",
          width: 400,
          height: 520,
          background: "#ffffff",
          border: "2px dashed #c7d2fe",
          borderRadius: 12,
          overflow: "hidden",
          cursor: "default",
          userSelect: "none",
        }}
      >
        {/* ── SVG bones layer ─────────────────────────────────────────── */}
        <svg
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
                stroke="rgba(99,102,241,0.6)"
                strokeWidth={2.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* ── Joint circles ────────────────────────────────────────────── */}
        {Object.entries(joints).map(([key, pos]) => (
          <div
            key={key}
            onMouseDown={e => onJointMouseDown(e, key)}
            title={key}
            style={{
              position: "absolute",
              left:   pos.x - JOINT_RADIUS,
              top:    pos.y - JOINT_RADIUS,
              width:  JOINT_RADIUS * 2,
              height: JOINT_RADIUS * 2,
              borderRadius: "50%",
              background: key === "nose" ? "#7c3aed" : "#6366f1",
              border: "2px solid #fff",
              boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              cursor: "grab",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* Label below joint */}
            <span style={{
              position: "absolute",
              top: JOINT_RADIUS + 2,
              left: "50%",
              transform: "translateX(-50%)",
              fontSize: 8,
              color: "#555",
              whiteSpace: "nowrap",
              pointerEvents: "none",
            }}>
              {key.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>

      {/* Live joint positions */}
      <details style={{ marginTop: 16, fontSize: 11, color: "#666", maxWidth: 400, width: "100%" }}>
        <summary style={{ cursor: "pointer", marginBottom: 6 }}>Joint positions (live)</summary>
        <pre style={{ background: "#f8f8f8", padding: 10, borderRadius: 6, overflow: "auto" }}>
          {JSON.stringify(joints, null, 2)}
        </pre>
      </details>
    </div>
  );
}
