import { useEffect, useRef } from "react";
import { projectKeypoints } from "../../data/stickFigureProjector";

const TAU = Math.PI * 2;

const SEGMENTS = {
  low: [
    ["head","neck"], ["neck","spine"], ["spine","hips"],
    ["neck","leftShoulder"], ["neck","rightShoulder"],
    ["leftShoulder","leftElbow"], ["leftElbow","leftWrist"],
    ["rightShoulder","rightElbow"], ["rightElbow","rightWrist"],
    ["hips","leftHip"], ["hips","rightHip"],
    ["leftHip","leftKnee"], ["leftKnee","leftAnkle"],
    ["rightHip","rightKnee"], ["rightKnee","rightAnkle"],
  ],
  medium: [
    ["head","neck"], ["neck","spine"], ["spine","hips"],
    ["neck","leftShoulder"], ["neck","rightShoulder"],
    ["leftShoulder","leftElbow"], ["rightShoulder","rightElbow"],
    ["hips","leftHip"], ["hips","rightHip"],
    ["leftHip","leftKnee"], ["rightHip","rightKnee"],
  ],
  high: [
    ["head","neck"], ["neck","hips"],
    ["hips","leftKnee"], ["hips","rightKnee"],
    ["neck","leftWrist"], ["neck","rightWrist"],
  ],
};

// Canvas background is dark (#1a1a2e) → use white lines (Req 3.4)
const CANVAS_BG = "#1a1a2e";

function isDarkBackground(bg) {
  // Parse hex colour and check luminance
  const hex = bg.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Relative luminance (simplified)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

/**
 * StickFigure — 2D canvas-based stick figure renderer.
 *
 * Props:
 *   jointAngles    — { boneName: { x, y, z } } in degrees
 *   cameraPreset   — "front" | "side" | "top" | "low"
 *   active         — boolean; skip all work when false (Req 7.3)
 *   simplification — "low" | "medium" | "high"
 *   thickness      — 1–5
 *   opacity        — 0.1–1.0
 *   showJoints     — boolean (Req 5.1)
 *   showLOA        — boolean (Req 5.2)
 *   showCOG        — boolean (Req 5.3)
 *   lockToFront    — boolean (Req 9.3)
 *   canvasRef      — forwarded ref for export (Req 8.1)
 */
export default function StickFigure({
  jointAngles,
  cameraPreset,
  active,
  simplification = "low",
  thickness = 2,
  opacity = 1.0,
  showJoints = true,
  showLOA = false,
  showCOG = false,
  lockToFront = false,
  canvasRef,
}) {
  // Internal ref used when no external canvasRef is provided
  const internalRef = useRef(null);
  const ref = canvasRef ?? internalRef;

  // Req 7.3: guard — no canvas work when inactive
  if (!active) return null;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = Math.max(width, height) * 0.10;

    // Step 1: project keypoints
    const kp = projectKeypoints(jointAngles ?? {}, cameraPreset, lockToFront);

    // Step 2: scale normalised [0,1] coords to pixel coords
    const pts = {};
    for (const [name, { u, v }] of Object.entries(kp)) {
      pts[name] = {
        x: padding + u * (width  - 2 * padding),
        y: padding + v * (height - 2 * padding),
      };
    }

    // Step 3: clear
    ctx.clearRect(0, 0, width, height);

    // Step 4: global style
    ctx.globalAlpha = opacity;
    ctx.lineWidth   = thickness;
    ctx.strokeStyle = isDarkBackground(CANVAS_BG) ? "#ffffff" : "#111111";
    ctx.fillStyle   = isDarkBackground(CANVAS_BG) ? "#ffffff" : "#111111";
    ctx.lineCap     = "round";

    // Step 5: draw bone segments
    const segs = SEGMENTS[simplification] ?? SEGMENTS.low;
    for (const [a, b] of segs) {
      if (!pts[a] || !pts[b]) continue;
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    }

    // Step 6: joint dots (Req 5.1)
    if (showJoints) {
      for (const { x, y } of Object.values(pts)) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, TAU);
        ctx.fill();
      }
    }

    // Step 7: Line of Action (Req 5.2)
    if (showLOA && pts.head && pts.spine && pts.hips) {
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = "#f59e0b"; // amber
      ctx.beginPath();
      ctx.moveTo(pts.head.x, pts.head.y);
      ctx.quadraticCurveTo(pts.spine.x, pts.spine.y, pts.hips.x, pts.hips.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Step 8: Centre of Gravity (Req 5.3)
    if (showCOG && pts.leftHip && pts.rightHip) {
      const cog = {
        x: (pts.leftHip.x + pts.rightHip.x) / 2,
        y: (pts.leftHip.y + pts.rightHip.y) / 2,
      };
      ctx.fillStyle = "#ef4444"; // red
      ctx.beginPath();
      ctx.arc(cog.x, cog.y, 6, 0, TAU);
      ctx.fill();
    }

    // Reset globalAlpha so it doesn't bleed into other canvas operations
    ctx.globalAlpha = 1.0;
  }, [jointAngles, cameraPreset, active, simplification, thickness, opacity, showJoints, showLOA, showCOG, lockToFront]);

  return (
    <canvas
      ref={ref}
      width={400}
      height={500}
      style={{ width: "100%", height: "100%", display: "block" }}
    />
  );
}
