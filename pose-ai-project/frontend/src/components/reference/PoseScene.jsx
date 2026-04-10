/**
 * PoseScene.jsx  (v5 — fixed upright mannequin)
 *
 * Coordinate convention:
 *   +Y = UP.  Every child group offset moves UP from its parent joint.
 *   Segment meshes sit at [0, -len/2, 0] so they hang DOWN from the pivot.
 *
 * Figure height ≈ 1.75 units.  Root (Hips) placed at y = 0.88 so feet touch y = 0.
 */

import { useRef, forwardRef, useImperativeHandle } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { clampAngle, getRestOffset } from "../../data/jointConstraints";

const DEG  = Math.PI / 180;
const LERP = 0.12;

// ── Shared grey material ──────────────────────────────────────────────────────
function GM({ color = "#c8c8c8" }) {
  return <meshStandardMaterial color={color} roughness={0.55} metalness={0.04} />;
}

// ── Tapered cylinder limb — hangs DOWN from pivot ─────────────────────────────
// topR = radius at pivot end, botR = radius at far end
function Limb({ len, topR, botR }) {
  return (
    <mesh position={[0, -len / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[botR, topR, len, 14, 1]} />
      <GM />
    </mesh>
  );
}

// ── Joint ball ────────────────────────────────────────────────────────────────
function Ball({ r }) {
  return (
    <mesh castShadow>
      <sphereGeometry args={[r, 16, 16]} />
      <GM />
    </mesh>
  );
}

// ── Humanoid figure ───────────────────────────────────────────────────────────
function HumanoidFigure({ jointAngles = {} }) {
  const refs = useRef({});
  const set  = n => el => { refs.current[n] = el; };

  useFrame(() => {
    const bones = [
      "Hips","Spine","Spine1","Spine2","Neck","Head",
      "LeftShoulder","RightShoulder",
      "LeftArm","RightArm","LeftForeArm","RightForeArm","LeftHand","RightHand",
      "LeftUpLeg","RightUpLeg","LeftLeg","RightLeg","LeftFoot","RightFoot",
    ];

    // Pass 1 — lerp toward clamped user + rest
    bones.forEach(name => {
      const ref = refs.current[name]; if (!ref) return;
      const u = jointAngles[name] ?? {};
      const r = getRestOffset(name);
      ["x","y","z"].forEach(ax => {
        const deg = clampAngle(name, ax, u[ax] ?? 0) + (r[ax] ?? 0);
        ref.rotation[ax] = THREE.MathUtils.lerp(ref.rotation[ax], deg * DEG, LERP);
      });
    });

    // Pass 2 — hard locks
    ["LeftForeArm","RightForeArm"].forEach(n => {
      const r = refs.current[n]; if (!r) return;
      r.rotation.y = 0; r.rotation.z = 0;
      if (r.rotation.x > -5 * DEG) r.rotation.x = -5 * DEG;
    });
    ["LeftLeg","RightLeg"].forEach(n => {
      const r = refs.current[n]; if (!r) return;
      r.rotation.y = 0; r.rotation.z = 0;
      if (r.rotation.x > -3 * DEG) r.rotation.x = -3 * DEG;
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

  return (
    /*
     * Root at y=0.88 so feet land at y≈0.
     * Spine builds UPWARD: each child group is offset +Y from parent.
     * Legs build DOWNWARD: each child group is offset -Y from parent.
     * Arm chains build DOWNWARD from shoulder attachment.
     */
    <group position={[0, 0.88, 0]}>

      {/* ── HIPS (root) ── */}
      <group ref={set("Hips")}>
        <mesh castShadow receiveShadow>
          <RoundedBox args={[0.32, 0.18, 0.16]} radius={0.04} smoothness={4}><GM /></RoundedBox>
        </mesh>

        {/* ══ SPINE — builds UPWARD ══ */}
        {/* Spine pivot sits at top of pelvis */}
        <group ref={set("Spine")} position={[0, 0.09, 0]}>
          {/* Lower abdomen segment hangs down from pivot */}
          <Limb len={0.22} topR={0.10} botR={0.09} />

          {/* Spine1 pivot at top of lower abdomen */}
          <group ref={set("Spine1")} position={[0, 0.22, 0]}>
            <Limb len={0.22} topR={0.11} botR={0.10} />

            {/* Spine2 / chest pivot at top of mid spine */}
            <group ref={set("Spine2")} position={[0, 0.22, 0]}>
              {/* Chest block */}
              <mesh castShadow receiveShadow>
                <RoundedBox args={[0.38, 0.22, 0.18]} radius={0.05} smoothness={4}><GM /></RoundedBox>
              </mesh>

              {/* ── NECK — upward from chest top ── */}
              <group ref={set("Neck")} position={[0, 0.11, 0]}>
                <Limb len={0.11} topR={0.055} botR={0.048} />

                {/* ── HEAD — upward from neck top ── */}
                <group ref={set("Head")} position={[0, 0.11, 0]}>
                  <mesh castShadow receiveShadow>
                    <sphereGeometry args={[0.14, 20, 20]} />
                    <GM />
                  </mesh>
                  {/* Face dot */}
                  <mesh position={[0, 0, 0.13]}>
                    <sphereGeometry args={[0.022, 8, 8]} />
                    <meshStandardMaterial color="#666" roughness={0.9} />
                  </mesh>
                </group>
              </group>

              {/* ── LEFT ARM — hangs down from left shoulder ── */}
              <group ref={set("LeftShoulder")} position={[0.22, 0.04, 0]}>
                <Ball r={0.072} />
                <group ref={set("LeftArm")}>
                  <Limb len={0.27} topR={0.058} botR={0.044} />
                  <group ref={set("LeftForeArm")} position={[0, -0.27, 0]}>
                    <Ball r={0.050} />
                    <Limb len={0.24} topR={0.044} botR={0.034} />
                    <group ref={set("LeftHand")} position={[0, -0.24, 0]}>
                      <Ball r={0.036} />
                      <mesh position={[0, -0.052, 0]} castShadow>
                        <RoundedBox args={[0.070, 0.068, 0.052]} radius={0.016} smoothness={3}><GM /></RoundedBox>
                      </mesh>
                    </group>
                  </group>
                </group>
              </group>

              {/* ── RIGHT ARM ── */}
              <group ref={set("RightShoulder")} position={[-0.22, 0.04, 0]}>
                <Ball r={0.072} />
                <group ref={set("RightArm")}>
                  <Limb len={0.27} topR={0.058} botR={0.044} />
                  <group ref={set("RightForeArm")} position={[0, -0.27, 0]}>
                    <Ball r={0.050} />
                    <Limb len={0.24} topR={0.044} botR={0.034} />
                    <group ref={set("RightHand")} position={[0, -0.24, 0]}>
                      <Ball r={0.036} />
                      <mesh position={[0, -0.052, 0]} castShadow>
                        <RoundedBox args={[0.070, 0.068, 0.052]} radius={0.016} smoothness={3}><GM /></RoundedBox>
                      </mesh>
                    </group>
                  </group>
                </group>
              </group>

            </group>
          </group>
        </group>

        {/* ══ LEGS — build DOWNWARD from hip sockets ══ */}

        {/* ── LEFT LEG ── */}
        <group ref={set("LeftUpLeg")} position={[0.10, -0.09, 0]}>
          <Ball r={0.080} />
          <Limb len={0.38} topR={0.074} botR={0.056} />
          <group ref={set("LeftLeg")} position={[0, -0.38, 0]}>
            <Ball r={0.062} />
            <Limb len={0.36} topR={0.056} botR={0.040} />
            <group ref={set("LeftFoot")} position={[0, -0.36, 0]}>
              <Ball r={0.046} />
              <mesh position={[0, -0.030, 0.072]} castShadow>
                <RoundedBox args={[0.092, 0.062, 0.19]} radius={0.020} smoothness={3}><GM /></RoundedBox>
              </mesh>
            </group>
          </group>
        </group>

        {/* ── RIGHT LEG ── */}
        <group ref={set("RightUpLeg")} position={[-0.10, -0.09, 0]}>
          <Ball r={0.080} />
          <Limb len={0.38} topR={0.074} botR={0.056} />
          <group ref={set("RightLeg")} position={[0, -0.38, 0]}>
            <Ball r={0.062} />
            <Limb len={0.36} topR={0.056} botR={0.040} />
            <group ref={set("RightFoot")} position={[0, -0.36, 0]}>
              <Ball r={0.046} />
              <mesh position={[0, -0.030, 0.072]} castShadow>
                <RoundedBox args={[0.092, 0.062, 0.19]} radius={0.020} smoothness={3}><GM /></RoundedBox>
              </mesh>
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

// ── Scene ─────────────────────────────────────────────────────────────────────
const PoseScene = forwardRef(function PoseScene(
  { jointAngles, cameraPreset = "front" },
  ref
) {
  const wrapRef = useRef(null);

  useImperativeHandle(ref, () => ({
    export: () => {
      const canvas = wrapRef.current?.querySelector("canvas");
      return canvas?.toDataURL("image/png") ?? null;
    },
  }));

  const cam = CAMERA_PRESETS[cameraPreset] ?? CAMERA_PRESETS.front;

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%" }}>
      <Canvas
        shadows
        camera={{ position: cam.position, fov: 42 }}
        gl={{ preserveDrawingBuffer: true }}
        style={{ background: "linear-gradient(180deg, #c2c0c0ff 0%, #ffffffff 100%)" }}
      >
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[4, 6, 5]} intensity={1.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={0.5}
          shadow-camera-far={20}
          shadow-camera-left={-4}
          shadow-camera-right={4}
          shadow-camera-top={4}
          shadow-camera-bottom={-4}
        />
        <directionalLight position={[-3, 4, -3]} intensity={0.30} color="#d0d8ff" />
        <directionalLight position={[0,  1,  4]} intensity={0.18} />

        <Grid
          position={[0, 0, 0]}
          args={[20, 20]}
          cellSize={0.5}
          cellThickness={0.4}
          cellColor="#000000"
          sectionSize={2.5}
          sectionThickness={0.9}
          sectionColor="#000000"
          fadeDistance={12}
          fadeStrength={1.5}
          infiniteGrid
        />

        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[30, 30]} />
          <shadowMaterial opacity={0.18} />
        </mesh>

        <HumanoidFigure jointAngles={jointAngles} />

        <OrbitControls
          target={cam.target}
          enableDamping
          dampingFactor={0.07}
          minDistance={1.2}
          maxDistance={8}
        />
      </Canvas>
    </div>
  );
});

export default PoseScene;
