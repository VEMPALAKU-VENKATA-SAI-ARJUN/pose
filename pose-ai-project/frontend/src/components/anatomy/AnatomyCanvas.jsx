/**
 * AnatomyCanvas.jsx  (v3)
 *
 * Modes:
 *   skeleton  — gesture lines + dots over photo
 *   shapes    — construction forms over photo
 *   combined  — skeleton + shapes over photo
 *   diagram   — clean flat-color anatomy diagram on dark background (no photo)
 */

import { useRef, useEffect, useCallback } from "react";
import { drawSkeleton, drawBoxes } from "./anatomyUtils";
import { drawDiagram }             from "./anatomyDiagram";

export default function AnatomyCanvas({
  imageSrc, landmarks, mode, opacity, showLabels = true,
}) {
  const canvasRef = useRef(null);
  const imgRef    = useRef(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = imgRef.current;
    if (!canvas) return;

    // ── Diagram mode: clean background, no photo ──────────────────────────
    if (mode === "diagram") {
      if (!landmarks?.length) return;
      const W = (img?.complete && img.naturalWidth)  ? img.naturalWidth  : 640;
      const H = (img?.complete && img.naturalHeight) ? img.naturalHeight : 800;
      canvas.width  = W;
      canvas.height = H;
      drawDiagram(canvas.getContext("2d"), landmarks, W, H, showLabels);
      return;
    }

    // ── Photo overlay modes ───────────────────────────────────────────────
    if (!img || !img.complete || !img.naturalWidth) return;
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    if (!landmarks?.length) return;

    if (mode === "skeleton" || mode === "combined") {
      drawSkeleton(ctx, landmarks, W, H, opacity);
    }
    if (mode === "shapes" || mode === "combined") {
      drawBoxes(ctx, landmarks, W, H, opacity);
    }
  }, [landmarks, mode, opacity, showLabels]);

  useEffect(() => { redraw(); }, [redraw]);

  return (
    <div className="ac-wrap">
      {imageSrc && (
        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          style={{ display: "none" }}
          onLoad={redraw}
          crossOrigin="anonymous"
        />
      )}
      <canvas ref={canvasRef} className="ac-canvas" />
    </div>
  );
}
