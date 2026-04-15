/**
 * StickFigureMode.jsx
 * Standalone mode — 2D stick figure view driven by joint angle controls.
 * Uses the same FK projector and canvas renderer as the spec.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, RotateCcw, Download, SlidersHorizontal, ChevronDown, LayoutGrid } from "lucide-react";
import StickFigure from "../reference/StickFigure";
import { POSE_LIST, POSES } from "../../data/referencePoses";
import { clampAngle, getRange } from "../../data/jointConstraints";
import "./StickFigureMode.css";

const CAMERA_PRESETS = ["front", "side", "top", "low"];

const CONTROL_JOINTS = [
  { name: "Head",         label: "Head" },
  { name: "Neck",         label: "Neck" },
  { name: "Spine2",       label: "Chest" },
  { name: "Spine1",       label: "Mid Spine" },
  { name: "Spine",        label: "Lower Spine" },
  { name: "Hips",         label: "Hips" },
  { name: "LeftArm",      label: "L Shoulder" },
  { name: "RightArm",     label: "R Shoulder" },
  { name: "LeftForeArm",  label: "L Elbow" },
  { name: "RightForeArm", label: "R Elbow" },
  { name: "LeftHand",     label: "L Wrist" },
  { name: "RightHand",    label: "R Wrist" },
  { name: "LeftUpLeg",    label: "L Hip" },
  { name: "RightUpLeg",   label: "R Hip" },
  { name: "LeftLeg",      label: "L Knee" },
  { name: "RightLeg",     label: "R Knee" },
  { name: "LeftFoot",     label: "L Ankle" },
  { name: "RightFoot",    label: "R Ankle" },
];

const AXES = ["x", "y", "z"];

function initJoints() {
  const j = {};
  CONTROL_JOINTS.forEach(({ name }) => { j[name] = { x: 0, y: 0, z: 0 }; });
  return j;
}

function applyPoseToJoints(poseId) {
  const base = initJoints();
  const pose = POSES[poseId];
  if (!pose) return base;
  Object.entries(pose.joints).forEach(([bone, rot]) => {
    if (base[bone]) base[bone] = { x: rot.x ?? 0, y: rot.y ?? 0, z: rot.z ?? 0 };
  });
  return base;
}

export default function StickFigureMode() {
  const [jointAngles,     setJointAngles]     = useState(() => applyPoseToJoints("natural"));
  const [activePose,      setActivePose]      = useState("natural");
  const [cameraPreset,    setCameraPreset]    = useState("front");
  const [simplification,  setSimplification]  = useState("low");
  const [thickness,       setThickness]       = useState(2);
  const [opacity,         setOpacity]         = useState(1.0);
  const [showJoints,      setShowJoints]      = useState(true);
  const [showLOA,         setShowLOA]         = useState(false);
  const [showCOG,         setShowCOG]         = useState(false);
  const [lockToFront,     setLockToFront]     = useState(false);
  const [showPoses,       setShowPoses]       = useState(false);
  const [showJointCtrl,   setShowJointCtrl]   = useState(false);
  const [selectedJoint,   setSelectedJoint]   = useState(null);
  const [toast,           setToast]           = useState(null);

  const canvasRef  = useRef(null);
  const posesRef   = useRef(null);
  const jointsRef  = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const fn = e => {
      if (posesRef.current  && !posesRef.current.contains(e.target))  setShowPoses(false);
      if (jointsRef.current && !jointsRef.current.contains(e.target)) setShowJointCtrl(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const applyPose = useCallback((poseId) => {
    setJointAngles(applyPoseToJoints(poseId));
    setActivePose(poseId);
    setToast({ msg: `Pose: ${POSES[poseId]?.name ?? poseId}`, key: Date.now() });
    setShowPoses(false);
  }, []);

  const handleJointChange = useCallback((boneName, axis, value) => {
    setJointAngles(prev => ({
      ...prev,
      [boneName]: { ...prev[boneName], [axis]: clampAngle(boneName, axis, Number(value)) },
    }));
    setActivePose(null);
  }, []);

  const resetJoint = useCallback((boneName) => {
    setJointAngles(prev => ({ ...prev, [boneName]: { x: 0, y: 0, z: 0 } }));
  }, []);

  const resetAll = useCallback(() => {
    setJointAngles(applyPoseToJoints("natural"));
    setActivePose("natural");
    setSelectedJoint(null);
    setToast({ msg: "Reset to Natural Stand", key: Date.now() });
  }, []);

  const handleExport = useCallback(() => {
    const url = canvasRef.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `stickfigure_${Date.now()}.png`;
    a.click();
  }, []);

  return (
    <div className="sfm-page">

      {/* ── Top bar ── */}
      <div className="sfm-topbar">
        <Link to="/" className="sfm-back"><ArrowLeft size={13} /> Dashboard</Link>
        <span className="sfm-title">Stick Figure Mode</span>

        <div className="sfm-topbar-right">
          {/* Camera presets */}
          {CAMERA_PRESETS.map(p => (
            <button key={p}
              className={`sfm-cam-btn${cameraPreset === p ? " active" : ""}`}
              onClick={() => setCameraPreset(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}

          {/* Poses dropdown */}
          <div className="sfm-dd-wrap" ref={posesRef}>
            <button
              className={`sfm-dd-btn${showPoses ? " active" : ""}`}
              onClick={() => { setShowPoses(v => !v); setShowJointCtrl(false); }}
            >
              <LayoutGrid size={13} /> Poses
              <ChevronDown size={11} style={{ transition: "transform 0.2s", transform: showPoses ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>
            {showPoses && (
              <div className="sfm-dropdown">
                <div className="sfm-dropdown-header">Pose Presets</div>
                <div className="sfm-dropdown-scroll">
                  {POSE_LIST.map(pose => (
                    <button
                      key={pose.id}
                      className={`sfm-pose-btn${activePose === pose.id ? " active" : ""}`}
                      onClick={() => applyPose(pose.id)}
                    >
                      {pose.name}
                      <span className="sfm-pose-cat">{pose.category}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Joint controls dropdown */}
          <div className="sfm-dd-wrap" ref={jointsRef}>
            <button
              className={`sfm-dd-btn sfm-dd-btn--joints${showJointCtrl ? " active" : ""}`}
              onClick={() => { setShowJointCtrl(v => !v); setShowPoses(false); }}
            >
              <SlidersHorizontal size={13} /> Joint Controls
              <ChevronDown size={11} style={{ transition: "transform 0.2s", transform: showJointCtrl ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>
            {showJointCtrl && (
              <div className="sfm-dropdown sfm-dropdown--joints">
                <div className="sfm-dropdown-header">
                  Joint Controls
                  <button className="sfm-reset-btn" onClick={resetAll}><RotateCcw size={10} /> Reset All</button>
                </div>
                <div className="sfm-dropdown-scroll">
                  {CONTROL_JOINTS.map(({ name, label }) => {
                    const isSelected = selectedJoint === name;
                    const axes = AXES.map(axis => ({ axis, range: getRange(name, axis) }))
                                     .filter(({ range }) => range !== null);
                    return (
                      <div
                        key={name}
                        className={`sfm-joint-group${isSelected ? " active" : ""}`}
                        onClick={() => setSelectedJoint(prev => prev === name ? null : name)}
                      >
                        <div className="sfm-joint-name">
                          <span className={`sfm-joint-dot sfm-joint-dot--${
                            name.startsWith("Left") ? "left" : name.startsWith("Right") ? "right" : "center"
                          }`} />
                          {label}
                          <button className="sfm-joint-reset"
                            onClick={e => { e.stopPropagation(); resetJoint(name); }}
                          >↺</button>
                        </div>
                        <div className="sfm-joint-sliders">
                          {axes.map(({ axis, range }) => {
                            const val = Math.round(jointAngles[name]?.[axis] ?? 0);
                            return (
                              <div key={axis} className="sfm-axis-row">
                                <span className={`sfm-axis-label ${axis}`}>{axis.toUpperCase()}</span>
                                <input type="range" className="sfm-axis-slider"
                                  min={range.min} max={range.max} step="1" value={val}
                                  onChange={e => { e.stopPropagation(); handleJointChange(name, axis, e.target.value); }}
                                />
                                <span className="sfm-axis-val">{val}°</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button className="sfm-export-btn" onClick={handleExport}>
            <Download size={13} /> Export PNG
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="sfm-body">

        {/* Canvas area */}
        <div className="sfm-canvas-wrap">
          <StickFigure
            jointAngles={jointAngles}
            cameraPreset={cameraPreset}
            active={true}
            simplification={simplification}
            thickness={thickness}
            opacity={opacity}
            showJoints={showJoints}
            showLOA={showLOA}
            showCOG={showCOG}
            lockToFront={lockToFront}
            canvasRef={canvasRef}
          />
          {toast && <div key={toast.key} className="sfm-toast">{toast.msg}</div>}
        </div>

        {/* Controls sidebar */}
        <div className="sfm-controls">
          <div className="sfm-controls-title">Display</div>

          <div className="sfm-control-row">
            <label>Simplification</label>
            <div className="sfm-seg">
              {["low", "medium", "high"].map(lvl => (
                <button key={lvl}
                  className={simplification === lvl ? "active" : ""}
                  onClick={() => setSimplification(lvl)}
                >{lvl}</button>
              ))}
            </div>
          </div>

          <div className="sfm-control-row">
            <label>Thickness <span className="sfm-val">{thickness}</span></label>
            <input type="range" min={1} max={5} step={1}
              value={thickness} onChange={e => setThickness(Number(e.target.value))} />
          </div>

          <div className="sfm-control-row">
            <label>Opacity <span className="sfm-val">{opacity.toFixed(1)}</span></label>
            <input type="range" min={0.1} max={1.0} step={0.1}
              value={opacity} onChange={e => setOpacity(Number(e.target.value))} />
          </div>

          <div className="sfm-controls-title" style={{ marginTop: 12 }}>Overlays</div>

          {[
            ["Show Joints",           showJoints,  setShowJoints],
            ["Line of Action",        showLOA,     setShowLOA],
            ["Centre of Gravity",     showCOG,     setShowCOG],
            ["Lock to Front View",    lockToFront, setLockToFront],
          ].map(([label, val, setter]) => (
            <label key={label} className="sfm-checkbox-row">
              <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
