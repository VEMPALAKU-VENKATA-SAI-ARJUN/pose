/**
 * DrawingCanvas.jsx
 * Pressure-sensitive freehand drawing canvas.
 * Supports: pen, eraser, undo, clear, stroke size, opacity overlay.
 *
 * Props:
 *   overlayUrl   — optional image URL to show as ghost reference
 *   overlayAlpha — 0–1 opacity of the ghost overlay
 *   onExport(dataUrl) — called when parent requests the canvas as an image
 *   exportRef    — ref that parent can call .export() on
 */

import { useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useState } from "react";
import { Pencil, Eraser, Undo2, Trash2, Minus, Plus } from "lucide-react";

const DrawingCanvas = forwardRef(function DrawingCanvas(
  { overlayUrl, overlayAlpha = 0.25 },
  ref
) {
  const canvasRef    = useRef(null);
  const overlayRef   = useRef(null);   // offscreen image for ghost
  const historyRef   = useRef([]);     // undo stack (ImageData snapshots)
  const drawing      = useRef(false);
  const lastPt       = useRef(null);

  const [tool,       setTool]       = useState("pen");   // pen | eraser
  const [strokeSize, setStrokeSize] = useState(3);
  const [color,      setColor]      = useState("#1F2937");

  // ── Expose export() to parent via ref ──────────────────────────────────────
  useImperativeHandle(ref, () => ({
    export: () => canvasRef.current?.toDataURL("image/png") ?? null,
    clear:  () => clearCanvas(),
  }));

  // ── Resize canvas to fill container ───────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const { width, height } = canvas.parentElement.getBoundingClientRect();
      // Preserve existing drawing across resize
      const snapshot = canvas.toDataURL();
      canvas.width  = width  * (window.devicePixelRatio || 1);
      canvas.height = height * (window.devicePixelRatio || 1);
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
      // Restore
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = snapshot;
      drawOverlay(ctx, width, height);
    });
    ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  }, [overlayUrl, overlayAlpha]);

  // ── Load ghost overlay image ───────────────────────────────────────────────
  useEffect(() => {
    if (!overlayUrl) { overlayRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      overlayRef.current = img;
      redrawOverlay();
    };
    img.src = overlayUrl;
  }, [overlayUrl]);

  useEffect(() => { redrawOverlay(); }, [overlayAlpha]);

  const drawOverlay = useCallback((ctx, w, h) => {
    if (!overlayRef.current || !overlayAlpha) return;
    ctx.save();
    ctx.globalAlpha = overlayAlpha;
    ctx.drawImage(overlayRef.current, 0, 0, w, h);
    ctx.restore();
  }, [overlayAlpha]);

  const redrawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w   = canvas.width  / dpr;
    const h   = canvas.height / dpr;
    drawOverlay(canvas.getContext("2d"), w, h);
  }, [drawOverlay]);

  // ── Pointer helpers ────────────────────────────────────────────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top,
    };
  };

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const snap = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snap);
    if (historyRef.current.length > 40) historyRef.current.shift();
  }, []);

  // ── Drawing ────────────────────────────────────────────────────────────────
  const startDraw = useCallback((e) => {
    e.preventDefault();
    saveSnapshot();
    drawing.current = true;
    lastPt.current  = getPos(e);
  }, [saveSnapshot]);

  const draw = useCallback((e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    const pt     = getPos(e);
    const pressure = e.pressure ?? 0.5;

    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    ctx.lineWidth   = tool === "eraser"
      ? strokeSize * 6
      : strokeSize * (0.5 + pressure);
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.stroke();
    ctx.globalCompositeOperation = "source-over";

    lastPt.current = pt;
  }, [tool, strokeSize, color]);

  const endDraw = useCallback(() => { drawing.current = false; }, []);

  // ── Undo ───────────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !historyRef.current.length) return;
    const snap = historyRef.current.pop();
    canvas.getContext("2d").putImageData(snap, 0, 0);
  }, []);

  // ── Clear ──────────────────────────────────────────────────────────────────
  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    saveSnapshot();
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    redrawOverlay();
  }, [saveSnapshot, redrawOverlay]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="dc-root">
      {/* Toolbar */}
      <div className="dc-toolbar">
        <div className="dc-tool-group">
          <button
            className={`dc-tool-btn${tool === "pen" ? " active" : ""}`}
            onClick={() => setTool("pen")}
            title="Pen"
          >
            <Pencil size={14} />
          </button>
          <button
            className={`dc-tool-btn${tool === "eraser" ? " active" : ""}`}
            onClick={() => setTool("eraser")}
            title="Eraser"
          >
            <Eraser size={14} />
          </button>
        </div>

        <div className="dc-tool-group">
          <button className="dc-tool-btn" onClick={() => setStrokeSize(s => Math.max(1, s - 1))} title="Smaller">
            <Minus size={13} />
          </button>
          <span className="dc-size-label">{strokeSize}</span>
          <button className="dc-tool-btn" onClick={() => setStrokeSize(s => Math.min(20, s + 1))} title="Larger">
            <Plus size={13} />
          </button>
        </div>

        {/* Color swatches */}
        <div className="dc-tool-group dc-colors">
          {["#1F2937","#7B61FF","#EC4899","#ef4444","#f59e0b","#10b981","#ffffff"].map(c => (
            <button
              key={c}
              className={`dc-color-swatch${color === c ? " active" : ""}`}
              style={{ background: c }}
              onClick={() => { setColor(c); setTool("pen"); }}
              title={c}
            />
          ))}
        </div>

        <div className="dc-tool-group dc-tool-group--right">
          <button className="dc-tool-btn" onClick={undo} title="Undo">
            <Undo2 size={14} />
          </button>
          <button className="dc-tool-btn dc-tool-btn--danger" onClick={clearCanvas} title="Clear">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Canvas surface */}
      <div className="dc-surface">
        <canvas
          ref={canvasRef}
          className="dc-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
          style={{ cursor: tool === "eraser" ? "cell" : "crosshair" }}
        />
        {/* Empty state hint */}
        <div className="dc-hint" aria-hidden="true">
          Draw from memory
        </div>
      </div>
    </div>
  );
});

export default DrawingCanvas;
