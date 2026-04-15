/**
 * PoseScene.jsx  (v8 — full body segments, uniform colour)
 */

import { useRef, forwardRef, useImperativeHandle, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, RoundedBox, Line } from "@react-three/drei";
import * as THREE from "three";
import { clampAngle, getRestOffset } from "../../data/jointConstraints";

const DEG  = Math.PI / 180;
const LERP = 0.12;

// ── Single shared body colour ─────────────────────────────────────────────────
const BODY_COLOR    = "#e8e8e8";
const BODY_ROUGH    = 0.6;
const BODY_METAL    = 0.0;
const OUTLINE_COLOR = "#1a1a1a";

// ── Seg — for geometry primitives (cylinder, sphere, etc.) ───────────────────
function Seg({ geo, color = BODY_COLOR }) {
  return (
    <group>
      <mesh castShadow receiveShadow>
        {geo}
        <meshStandardMaterial color={color} roughness={BODY_ROUGH} metalness={BODY_METAL} />
      </mesh>
      <mesh scale={[1.03, 1.03, 1.03]}>
        {geo}
        <meshBasicMaterial color={OUTLINE_COLOR} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

// ── RBox — RoundedBox is a full mesh component, NOT a geometry primitive ──────
// Passing RoundedBox as a geo prop into <mesh> breaks material inheritance.
// This wrapper renders it correctly with its own material children.
function RBox({ args, radius = 0.04, color = BODY_COLOR }) {
  return (
    <group>
      <RoundedBox args={args} radius={radius} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={BODY_ROUGH} metalness={BODY_METAL} />
      </RoundedBox>
      <RoundedBox args={args} radius={radius} smoothness={4} scale={[1.03, 1.03, 1.03]}>
        <meshBasicMaterial color={OUTLINE_COLOR} side={THREE.BackSide} />
      </RoundedBox>
    </group>
  );
}
// ── Tapered cylinder limb ─────────────────────────────────────────────────────
function Limb({ len, topR, botR }) {
  return (
    <group position={[0, -len / 2, 0]}>
      <Seg geo={<cylinderGeometry args={[botR, topR, len, 14, 1]} />} />
    </group>
  );
}
//__chest____
function Chest({ color = BODY_COLOR }) {
  return <RBox args={[0.40, 0.24, 0.20]} radius={0.05} color={color} />;
}
// ── Clickable joint dot ───────────────────────────────────────────────────────
function JointDot({ name, r = 0.048, color, selected, onSelect }) {
  return (
    <mesh
      onClick={e => { e.stopPropagation(); onSelect?.(name); }}
      onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { document.body.style.cursor = "default"; }}
    >
      <sphereGeometry args={[r, 14, 14]} />
      <meshStandardMaterial
        color={BODY_COLOR}
        roughness={0.6} metalness={0.0}
        emissive={selected ? "#ffffaa" : "#000000"}
        emissiveIntensity={selected ? 0.7 : 0}
      />
    </mesh>
  );
}

// ── XYZ rotation gizmo ────────────────────────────────────────────────────────
function Gizmo({ r = 0.22 }) {
  const ring = axis => {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      if (axis === "x") pts.push(new THREE.Vector3(0, Math.cos(a) * r, Math.sin(a) * r));
      if (axis === "y") pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (axis === "z") pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return pts;
  };
  return (
    <group>
      <Line points={ring("x")} color="#ef4444" lineWidth={2} />
      <Line points={ring("y")} color="#22c55e" lineWidth={2} />
      <Line points={ring("z")} color="#3b82f6" lineWidth={2.5} />
      <Line points={ring("y").map(p => p.clone().multiplyScalar(1.38))} color="#fbbf24" lineWidth={1.5} />
    </group>
  );
}

const dotColor = () => BODY_COLOR;

// ── Humanoid figure ───────────────────────────────────────────────────────────
function HumanoidFigure({ jointAngles = {}, selectedJoint, onSelectJoint }) {
  const refs = useRef({});
  const set  = n => el => { refs.current[n] = el; };

  useFrame(() => {
    const bones = [
      "Hips","Spine","Spine1","Spine2","Neck","Head",
      "LeftShoulder","RightShoulder",
      "LeftArm","RightArm","LeftForeArm","RightForeArm","LeftHand","RightHand",
      "LeftUpLeg","RightUpLeg","LeftLeg","RightLeg","LeftFoot","RightFoot",
    ];

    bones.forEach(name => {
      const ref = refs.current[name]; if (!ref) return;
      const u = jointAngles[name] ?? {};
      const rest = getRestOffset(name);
      ["x","y","z"].forEach(ax => {
        const deg = clampAngle(name, ax, u[ax] ?? 0) + (rest[ax] ?? 0);
        ref.rotation[ax] = THREE.MathUtils.lerp(ref.rotation[ax], deg * DEG, LERP);
      });
    });

    // Elbows: hinge only
    ["LeftForeArm","RightForeArm"].forEach(n => {
      const r = refs.current[n]; if (!r) return;
      r.rotation.y = 0; r.rotation.z = 0;
      if (r.rotation.x > -5 * DEG) r.rotation.x = -5 * DEG;
    });

    // Knees: hinge only, positive x = bend backward
    ["LeftLeg","RightLeg"].forEach(n => {
      const r = refs.current[n]; if (!r) return;
      r.rotation.y = 0; r.rotation.z = 0;
      if (r.rotation.x < 3 * DEG) r.rotation.x = 3 * DEG;
    });

    // Hip asymmetry
    const h = refs.current["Hips"];
    if (h) h.rotation.z = THREE.MathUtils.lerp(
      h.rotation.z, ((jointAngles["Hips"]?.z ?? 0) + 3) * DEG, LERP
    );

    // Spine → shoulder flow
    const sp1 = refs.current["Spine1"];
    const ls  = refs.current["LeftShoulder"];
    const rs  = refs.current["RightShoulder"];
    if (sp1 && ls && rs) {
      const f = sp1.rotation.x * 0.25;
      ls.rotation.x = THREE.MathUtils.lerp(ls.rotation.x, f, LERP);
      rs.rotation.x = THREE.MathUtils.lerp(rs.rotation.x, f, LERP);
    }
  });

  const Dot = ({ name, r }) => (
    <>
      <JointDot name={name} r={r ?? 0.048} color={dotColor(name)}
        selected={selectedJoint === name} onSelect={onSelectJoint} />
      {selectedJoint === name && <Gizmo r={r ? r * 4.5 : 0.22} />}
    </>
  );

  return (
    <group position={[0, 0.88, 0]}>

      {/* ── HIPS ── */}
      <group ref={set("Hips")}>
        <Dot name="Hips" r={0.058} />
        {/* Pelvis block */}
        <RBox args={[0.32, 0.18, 0.16]} radius={0.04} />

        {/* ── SPINE ── */}
        <group ref={set("Spine")} position={[0, 0.09, 0]}>
          <Dot name="Spine" />
          {/* Lower abdomen cylinder */}
          <Limb len={0.22} topR={0.10} botR={0.09} />

          <group ref={set("Spine1")} position={[0, 0.22, 0]}>
            <Dot name="Spine1" />
            {/* Mid torso cylinder */}
            <Limb len={0.22} topR={0.11} botR={0.10} />

            {/* ── CHEST ── */}
            <group ref={set("Spine2")} position={[0, 0.22, 0]}>
              <Dot name="Spine2" r={0.055} />
              
              {/* Chest block — wider than pelvis */}
             <Chest/>
              

              {/* ── NECK ── */}
              <group ref={set("Neck")} position={[0, 0.12, 0]}>
                <Dot name="Neck" r={0.038} />
                {/* Neck cylinder */}
                <Seg geo={<cylinderGeometry args={[0.048, 0.058, 0.12, 12, 1]} />} />

                {/* ── HEAD ── */}
                <group ref={set("Head")} position={[0, 0.12, 0]}>
                  <Dot name="Head" r={0.06} />
                  {/* Head sphere */}
                  <Seg geo={<sphereGeometry args={[0.14, 20, 20]} />} />
                  {/* Face dot */}
                  <mesh position={[0, 0, 0.13]}>
                    <sphereGeometry args={[0.022, 8, 8]} />
                    <meshBasicMaterial color="#444" />
                  </mesh>
                </group>
              </group>

              {/* ── LEFT ARM ── */}
              <group ref={set("LeftShoulder")} position={[0.22, 0.04, 0]}>
                <Dot name="LeftShoulder" r={0.052} />
                {/* Shoulder cap */}
                <Seg geo={<sphereGeometry args={[0.072, 14, 14]} />} />

                <group ref={set("LeftArm")}>
                  <Dot name="LeftArm" r={0.046} />
                  {/* Upper arm */}
                  <Limb len={0.27} topR={0.058} botR={0.044} />

                  <group ref={set("LeftForeArm")} position={[0, -0.27, 0]}>
                    <Dot name="LeftForeArm" r={0.042} />
                    {/* Elbow cap */}
                    <Seg geo={<sphereGeometry args={[0.050, 12, 12]} />} />
                    {/* Forearm */}
                    <Limb len={0.24} topR={0.044} botR={0.034} />

                    <group ref={set("LeftHand")} position={[0, -0.24, 0]}>
                      <Dot name="LeftHand" r={0.036} />
                      {/* Hand */}
                      <group position={[0, -0.052, 0]}>
                        <RBox args={[0.070, 0.1, 0.052]} radius={0.016} />
                      </group>
                    </group>
                  </group>
                </group>
              </group>

              {/* ── RIGHT ARM ── */}
              <group ref={set("RightShoulder")} position={[-0.22, 0.04, 0]}>
                <Dot name="RightShoulder" r={0.052} />
                {/* Shoulder cap */}
                <Seg geo={<sphereGeometry args={[0.072, 14, 14]} />} />

                <group ref={set("RightArm")}>
                  <Dot name="RightArm" r={0.046} />
                  {/* Upper arm */}
                  <Limb len={0.27} topR={0.058} botR={0.044} />

                  <group ref={set("RightForeArm")} position={[0, -0.27, 0]}>
                    <Dot name="RightForeArm" r={0.042} />
                    {/* Elbow cap */}
                    <Seg geo={<sphereGeometry args={[0.050, 12, 12]} />} />
                    {/* Forearm */}
                    <Limb len={0.24} topR={0.044} botR={0.034} />

                    <group ref={set("RightHand")} position={[0, -0.24, 0]}>
                      <Dot name="RightHand" r={0.036} />
                      {/* Hand */}
                      <group position={[0, -0.052, 0]}>
                        <RBox args={[0.070, 0.1, 0.052]} radius={0.016} />
                      </group>
                    </group>
                  </group>
                </group>
              </group>

            </group>
          </group>
        </group>

        {/* ── LEFT LEG ── */}
        <group ref={set("LeftUpLeg")} position={[0.10, -0.09, 0]}>
          <Dot name="LeftUpLeg" r={0.055} />
          {/* Hip socket cap */}
          <Seg geo={<sphereGeometry args={[0.080, 14, 14]} />} />
          {/* Thigh */}
          <Limb len={0.38} topR={0.074} botR={0.056} />

          <group ref={set("LeftLeg")} position={[0, -0.38, 0]}>
            <Dot name="LeftLeg" r={0.048} />
            {/* Knee cap */}
            <Seg geo={<sphereGeometry args={[0.062, 12, 12]} />} />
            {/* Shin */}
            <Limb len={0.36} topR={0.056} botR={0.040} />

            <group ref={set("LeftFoot")} position={[0, -0.36, 0]}>
              <Dot name="LeftFoot" r={0.040} />
              {/* Foot */}
              <group position={[0, -0.030, 0.072]}>
                <RBox args={[0.092, 0.062, 0.19]} radius={0.020} />
              </group>
            </group>
          </group>
        </group>

        {/* ── RIGHT LEG ── */}
        <group ref={set("RightUpLeg")} position={[-0.10, -0.09, 0]}>
          <Dot name="RightUpLeg" r={0.055} />
          {/* Hip socket cap */}
          <Seg geo={<sphereGeometry args={[0.080, 14, 14]} />} />
          {/* Thigh */}
          <Limb len={0.38} topR={0.074} botR={0.056} />

          <group ref={set("RightLeg")} position={[0, -0.38, 0]}>
            <Dot name="RightLeg" r={0.048} />
            {/* Knee cap */}
            <Seg geo={<sphereGeometry args={[0.062, 12, 12]} />} />
            {/* Shin */}
            <Limb len={0.36} topR={0.056} botR={0.040} />

            <group ref={set("RightFoot")} position={[0, -0.36, 0]}>
              <Dot name="RightFoot" r={0.040} />
              {/* Foot */}
              <group position={[0, -0.030, 0.072]}>
                <RBox args={[0.092, 0.062, 0.19]} radius={0.020} />
              </group>
            </group>
          </group>
        </group>

      </group>
    </group>
  );
}

// ── Camera presets ────────────────────────────────────────────────────────────
export const CAMERA_PRESETS = {
  front: { position: [0,   1.2,  3.0], target: [0, 1.0, 0] },
  side:  { position: [3.0, 1.2,  0  ], target: [0, 1.0, 0] },
  top:   { position: [0,   4.5,  0.1], target: [0, 1.0, 0] },
  low:   { position: [0,   0.2,  3.0], target: [0, 1.2, 0] },
};

// ── Camera controller — moves camera imperatively when preset changes ─────────
function CameraController({ preset }) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const p = CAMERA_PRESETS[preset] ?? CAMERA_PRESETS.front;
    camera.position.set(...p.position);
    camera.lookAt(...p.target);
    // If OrbitControls is mounted, sync its target too
    if (controls) {
      controls.target.set(...p.target);
      controls.update();
    }
  }, [preset, camera, controls]);
  return null;
}

// ── Scene ─────────────────────────────────────────────────────────────────────
const PoseScene = forwardRef(function PoseScene(
  { jointAngles, cameraPreset = "front", selectedJoint, onSelectJoint },
  ref
) {
  const wrapRef = useRef(null);

  useImperativeHandle(ref, () => ({
    export: () => wrapRef.current?.querySelector("canvas")?.toDataURL("image/png") ?? null,
  }));

  const cam = CAMERA_PRESETS[cameraPreset] ?? CAMERA_PRESETS.front;

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%" }}>
      <Canvas
        shadows
        camera={{ position: cam.position, fov: 42 }}
        gl={{ preserveDrawingBuffer: true }}
        style={{ background: "linear-gradient(180deg, #535252 0%, #e1e1e1 100%)" }}
        onPointerMissed={() => onSelectJoint?.(null)}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 8, 2]} intensity={0.75} castShadow
          shadow-mapSize-width={2048} shadow-mapSize-height={2048}
          shadow-camera-near={0.5} shadow-camera-far={20}
          shadow-camera-left={-4} shadow-camera-right={4}
          shadow-camera-top={4} shadow-camera-bottom={-4} />
        <directionalLight position={[-3, 4, -3]} intensity={0.20} color="#e9ffd0" />
        <directionalLight position={[0, 1, 4]} intensity={0.10} />

        <Grid position={[0, 0, 0]} args={[20, 20]}
          cellSize={0.5} cellThickness={0.4} cellColor="#000000"
          sectionSize={2.5} sectionThickness={0.9} sectionColor="#000000"
          fadeDistance={12} fadeStrength={1.5} infiniteGrid />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <shadowMaterial opacity={0.18} />
        </mesh>

        <HumanoidFigure
          jointAngles={jointAngles}
          selectedJoint={selectedJoint}
          onSelectJoint={onSelectJoint}
        />

        <OrbitControls target={cam.target} enableDamping dampingFactor={0.07}
          minDistance={1.2} maxDistance={8} makeDefault />
        <CameraController preset={cameraPreset} />
      </Canvas>
    </div>
  );
});

export default PoseScene;
