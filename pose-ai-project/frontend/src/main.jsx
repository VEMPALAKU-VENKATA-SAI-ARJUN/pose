import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Dashboard      from "./components/Dashboard";
import App            from "./App";
import AnalysisPage   from "./components/AnalysisPage";
import PracticePage   from "./components/PracticePage";
import GestureMode    from "./components/gesture/GestureMode";
import ReferenceMode  from "./components/reference/ReferenceMode";

// Placeholder pages for modes not yet built
const Placeholder = ({ title }) => (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", color: "#64748b", gap: 12 }}>
    <span style={{ fontSize: 48 }}>🚧</span>
    <h2 style={{ color: "#1a1a2e", fontWeight: 700 }}>{title}</h2>
    <p style={{ fontSize: 14 }}>This mode is coming soon.</p>
    <a href="/" style={{ marginTop: 8, fontSize: 13, color: "#7c3aed", textDecoration: "none" }}>← Back to Dashboard</a>
  </div>
);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/"          element={<Dashboard />} />
        <Route path="/analyze"   element={<AnalysisPage />} />
        <Route path="/compare"   element={<App mode="compare" />} />
        <Route path="/practice"  element={<PracticePage />} />
        <Route path="/gesture"   element={<GestureMode />} />
        <Route path="/reference" element={<ReferenceMode />} />
        <Route path="/challenge" element={<Placeholder title="Challenge Mode" />} />
        <Route path="/anatomy"   element={<Placeholder title="Anatomy Breakdown" />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
