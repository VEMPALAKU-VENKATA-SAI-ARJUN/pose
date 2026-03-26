/**
 * UploadPanel.jsx
 * Supports two modes:
 *   mode="single"  — one upload zone (original behaviour)
 *   mode="compare" — two upload zones: reference + drawing
 */

import { useState, useRef } from "react";

export default function UploadPanel({ mode = "single", onUpload, onCompare, disabled }) {
  return mode === "compare"
    ? <ComparePanel onCompare={onCompare} disabled={disabled} />
    : <SinglePanel  onUpload={onUpload}   disabled={disabled} />;
}


// ── Single upload ─────────────────────────────────────────────────────────────

function SinglePanel({ onUpload, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    onUpload(file);
  };

  return (
    <DropZone
      label="Drag & drop an image, or click to select"
      dragging={dragging}
      disabled={disabled}
      onDragging={setDragging}
      onFile={handleFile}
      inputRef={inputRef}
    />
  );
}


// ── Compare upload (two zones) ────────────────────────────────────────────────

function ComparePanel({ onCompare, disabled }) {
  const [refFile,  setRefFile]  = useState(null);
  const [drawFile, setDrawFile] = useState(null);

  const handleSubmit = () => {
    if (refFile && drawFile) onCompare(refFile, drawFile);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div>
        <p style={labelStyle}>Reference Image</p>
        <MiniDropZone
          file={refFile}
          onFile={setRefFile}
          disabled={disabled}
          accent="#4ade80"
        />
      </div>
      <div>
        <p style={labelStyle}>Your Drawing</p>
        <MiniDropZone
          file={drawFile}
          onFile={setDrawFile}
          disabled={disabled}
          accent="#a5b4fc"
        />
      </div>
      <div style={{ gridColumn: "1 / -1", textAlign: "center" }}>
        <button
          onClick={handleSubmit}
          disabled={!refFile || !drawFile || disabled}
          style={{
            ...btnStyle,
            opacity: (!refFile || !drawFile || disabled) ? 0.4 : 1,
            cursor:  (!refFile || !drawFile || disabled) ? "not-allowed" : "pointer",
          }}
        >
          {disabled ? "Analyzing…" : "Compare Poses"}
        </button>
      </div>
    </div>
  );
}


// ── Shared drop zone components ───────────────────────────────────────────────

function DropZone({ label, dragging, disabled, onDragging, onFile, inputRef }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload image"
      onClick={() => !disabled && inputRef.current.click()}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); onDragging(true); }}
      onDragLeave={() => onDragging(false)}
      onDrop={(e) => { e.preventDefault(); onDragging(false); onFile(e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${dragging ? "#6366f1" : "#334155"}`,
        borderRadius: 10,
        padding: "36px 24px",
        textAlign: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        background: dragging ? "#1e1b4b" : "#0f172a",
        color: "#64748b",
        transition: "all 0.2s",
        userSelect: "none",
      }}
    >
      <p style={{ margin: 0, fontSize: 14 }}>
        {disabled ? "Analyzing…" : label}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 11, color: "#475569" }}>
        PNG · JPG · WEBP — max 10 MB
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files[0])}
      />
    </div>
  );
}

function MiniDropZone({ file, onFile, disabled, accent }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handle = (f) => {
    if (!f || !f.type.startsWith("image/")) return;
    onFile(f);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && inputRef.current.click()}
      onKeyDown={(e) => e.key === "Enter" && !disabled && inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
      style={{
        border: `2px dashed ${dragging ? accent : file ? accent : "#334155"}`,
        borderRadius: 8,
        padding: "20px 12px",
        textAlign: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        //background: file ? "#0f1f0f" : "#0f172a",
        background: file ?"#0f1f0f":"#ffffff",
        color: file ? accent : "#64748b",
        fontSize: 12,
        transition: "all 0.2s",
        userSelect: "none",
        minHeight: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {file ? `✓ ${file.name}` : "Click or drop image"}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => handle(e.target.files[0])}
      />
    </div>
  );
}

const labelStyle = {
  margin: "0 0 6px",
  fontSize: 11,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 1,
};

const btnStyle = {
  background: "#4f46e5",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "10px 28px",
  fontSize: 13,
  fontWeight: 600,
  letterSpacing: 0.5,
};
