/**
 * ReferenceMode.jsx
 * Joint controls are hidden by default.
 * Clicking a joint dot in the 3D scene opens a floating drawer on the right
 * showing only that joint's sliders. Clicking elsewhere or pressing Escape closes it.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wand2, Download, RotateCcw, User, SlidersHorizontal, ChevronDown, LayoutGrid } from "lucide-react";
import PoseScene, { CAMERA_PRESETS } from "./PoseScene";
import { POSE_LIST, POSES, parseTextToPose, parseTextToJoints } from "../../data/referencePoses";
import { clampAngle, getRange } from "../../data/jointConstraints";
import "./ReferenceMode.css";

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

export default function ReferenceMode() {
  const [jointAngles,   setJointAngles]   = useState(() => applyPoseToJoints("natural"));
  const [activePose,    setActivePose]    = useState("natural");
  const [cameraPreset,  setCameraPreset]  = useState("front");
  const [promptText,    setPromptText]    = useState("");
  const [toast,         setToast]         = useState(null);
  const [selectedJoint, setSelectedJoint] = useState(null);
  const [showControls,  setShowControls]  = useState(false);
  const [showPoses,     setShowPoses]     = useState(false);
  const sceneRef      = useRef(null);
  const controlsRef   = useRef(null);
  const posesRef      = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const fn = e => {
      if (controlsRef.current && !controlsRef.current.contains(e.target)) setShowControls(false);
      if (posesRef.current    && !posesRef.current.contains(e.target))    setShowPoses(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const jointLabel = CONTROL_JOINTS.find(j => j.name === selectedJoint)?.label ?? selectedJoint;

  const applyPose = useCallback((poseId) => {
    setJointAngles(applyPoseToJoints(poseId));
    setActivePose(poseId);
    setToast({ msg: `Pose applied: ${POSES[poseId]?.name ?? poseId}`, key: Date.now() });
  }, []);

  const handlePrompt = useCallback(async () => {
    if (!promptText.trim()) return;
    const text = promptText.trim();
    setPromptText("");

    // Try advanced hybrid parser first
    const advanced = await parseTextToJoints(text);
    if (advanced) {
      // Merge generated joints on top of current pose
      setJointAngles(prev => {
        const next = { ...prev };
        for (const [bone, rot] of Object.entries(advanced.joints)) {
          next[bone] = { ...(next[bone] ?? {}), ...rot };
        }
        return next;
      });
      setActivePose(null);
      const ruleCount = advanced.matchedRules.length;
      const presetNote = advanced.presetId ? ` (base: ${POSES[advanced.presetId]?.name})` : "";
      setToast({
        msg: `Applied ${ruleCount} rule${ruleCount !== 1 ? "s" : ""}${presetNote}`,
        key: Date.now(),
      });
      return;
    }

    // Fallback: legacy preset-only match
    const id = parseTextToPose(text);
    if (id) {
      applyPose(id);
    } else {
      setToast({ msg: `No match for "${text}"`, key: Date.now() });
    }
  }, [promptText, applyPose]);

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
    const url = sceneRef.current?.export();
    if (!url) return;
    Object.assign(document.createElement("a"), { href: url, download: `poseai_${Date.now()}.png` }).click();
  }, []);

  return (
    <div className="rm-page">

      {/* ── Top bar ── */}
      <div className="rm-topbar">
        <Link to="/" className="rm-back"><ArrowLeft size={13} /> Dashboard</Link>

        <div className="rm-prompt-wrap">
          <input
            className="rm-prompt-input"
            placeholder='e.g. "raise right hand and look left", "slightly bend knees", "twist torso right"…'
            value={promptText}
            onChange={e => setPromptText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handlePrompt()}
          />
          <button className="rm-prompt-btn" onClick={handlePrompt}>
            <Wand2 size={13} /> Apply
          </button>
        </div>

        <div className="rm-topbar-right">
          {Object.keys(CAMERA_PRESETS).map(p => (
            <button key={p}
              className={`rm-cam-btn${cameraPreset === p ? " active" : ""}`}
              onClick={() => setCameraPreset(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}

          {/* Pose Presets dropdown */}
          <div className="rm-jc-wrap" ref={posesRef}>
            <button
              className={`rm-jc-btn${showPoses ? " active" : ""}`}
              onClick={() => { setShowPoses(v => !v); setShowControls(false); }}
            >
              <LayoutGrid size={13} />
              Poses
              <ChevronDown size={11} style={{ transition: "transform 0.2s", transform: showPoses ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>

            {showPoses && (
              <div className="rm-jc-dropdown">
                <div className="rm-jc-dropdown-header">
                  <span className="rm-jc-dropdown-title">Pose Presets</span>
                </div>
                <div className="rm-jc-scroll">
                  {POSE_LIST.map(pose => (
                    <button
                      key={pose.id}
                      className={`rm-pose-btn${activePose === pose.id ? " active" : ""}`}
                      onClick={() => { applyPose(pose.id); setShowPoses(false); }}
                    >
                      {pose.name}
                      <span className="rm-pose-cat">{pose.category}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Joint Controls dropdown trigger */}
          <div className="rm-jc-wrap" ref={controlsRef}>
            <button
              className={`rm-jc-btn${showControls ? " active" : ""}`}
              onClick={() => setShowControls(v => !v)}            >
              <SlidersHorizontal size={13} />
              Joint Controls
              <ChevronDown size={11} style={{ transition: "transform 0.2s", transform: showControls ? "rotate(180deg)" : "rotate(0deg)" }} />
            </button>

            {/* Dropdown panel */}
            {showControls && (
              <div className="rm-jc-dropdown">
                <div className="rm-jc-dropdown-header">
                  <span className="rm-jc-dropdown-title">Joint Controls</span>
                  <button className="rm-controls-reset" onClick={resetAll}>
                    <RotateCcw size={10} /> Reset All
                  </button>
                </div>

                <div className="rm-jc-scroll">
                  {CONTROL_JOINTS.map(({ name, label }) => {
                    const isSelected = selectedJoint === name;
                    const axes = AXES.map(axis => ({ axis, range: getRange(name, axis) }))
                                    .filter(({ range }) => range !== null);
                    return (
                      <div
                        key={name}
                        className={`rm-joint-group${isSelected ? " rm-joint-group--active" : ""}`}
                        onClick={() => setSelectedJoint(prev => prev === name ? null : name)}
                      >
                        <div className="rm-joint-name">
                          <span className={`rm-joint-dot rm-joint-dot--${
                            name.startsWith("Left") ? "left" :
                            name.startsWith("Right") ? "right" : "center"
                          }`} />
                          {label}
                          <button
                            className="rm-joint-reset"
                            onClick={e => { e.stopPropagation(); resetJoint(name); }}
                            title="Reset"
                          >↺</button>
                        </div>
                        <div className="rm-joint-sliders">
                          {axes.map(({ axis, range }) => {
                            const val = Math.round(jointAngles[name]?.[axis] ?? 0);
                            return (
                              <div key={axis} className="rm-axis-row">
                                <span className={`rm-axis-label ${axis}`}>{axis.toUpperCase()}</span>
                                <input
                                  type="range"
                                  className="rm-axis-slider"
                                  min={range.min} max={range.max} step="1"
                                  value={val}
                                  onChange={e => { e.stopPropagation(); handleJointChange(name, axis, e.target.value); }}
                                />
                                <span className="rm-axis-val">{val}°</span>
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

          <button className="rm-export-btn" onClick={handleExport}>
            <Download size={13} /> Export PNG
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="rm-body">

       {/* Left sidebar — pose presets */}
        {/*<div className="rm-sidebar">
          <div className="rm-sidebar-title"><User size={11} style={{ marginRight: 4 }} />Pose Presets</div>
          {POSE_LIST.map(pose => (
            <button key={pose.id}
              className={`rm-pose-btn${activePose === pose.id ? " active" : ""}`}
              onClick={() => applyPose(pose.id)}
            >
              {pose.name}
              <span className="rm-pose-cat">{pose.category}</span>
            </button>
          ))}
        </div>*/}

        {/* 3D viewport */}
        <div className="rm-viewport">
          <div className="rm-canvas-container">
            <PoseScene
              ref={sceneRef}
              jointAngles={jointAngles}
              cameraPreset={cameraPreset}
              selectedJoint={selectedJoint}
              onSelectJoint={name => setSelectedJoint(prev => prev === name ? null : name)}
            />
          </div>

          {/* Reset All FAB */}
          <button className="rm-reset-fab" onClick={resetAll} title="Reset all joints">
            <RotateCcw size={13} /> Reset All
          </button>

          {/* Toast */}
          {toast && <div key={toast.key} className="rm-toast">{toast.msg}</div>}
        </div>
      </div>
    </div>
  );
}
