/**
 * poseAI.js
 * Frontend AI pose generation layer.
 *
 * Calls POST /api/pose → gets joint rotations from LLM.
 * Validates and clamps the result through jointConstraints.
 * Blends with the current pose using lerp for smooth transitions.
 *
 * Public API:
 *   generatePoseFromAI(prompt)           → { joints, source } | null
 *   blendPoses(currentJoints, aiJoints)  → merged joint map
 *   isComplexPrompt(text)                → bool (decides AI vs rule engine)
 */

import { clampAngle, CONSTRAINTS } from "./jointConstraints";

const POSE_API = "/api/pose";

export function isComplexPrompt(text) {
  // Only escalate to AI for truly narrative/descriptive prompts that
  // the rule engine cannot handle — NOT just long sentences.
  // The rule engine + preprocessing handles most multi-word commands.
  const words = text.trim().split(/\s+/).length;

  // Short prompts always go to rule engine
  if (words <= 8) return false;

  // Long prompts only go to AI if they contain narrative/emotional language
  // that the rule engine has no vocabulary for
  const NARRATIVE_ONLY = [
    /\b(tired|exhausted|dramatic|heroic|sad|happy|angry|scared|nervous|proud)\b/i,
    /\b(leaning on|resting on|holding|touching|grabbing|reaching for)\b/i,
    /\b(after|while|during|as if|like a|looks like|appears to)\b/i,
    /\b(crouching|hunching|slouching|stooping)\b/i,
  ];

  return NARRATIVE_ONLY.some(p => p.test(text));
}

// ── Client-side validation ────────────────────────────────────────────────────
// Runs the AI output through the same constraint system as the rule engine.
function validateAIPose(rawJoints) {
  const result = {};
  for (const [bone, rot] of Object.entries(rawJoints)) {
    if (!CONSTRAINTS[bone]) continue;
    const clamped = {};
    for (const [ax, val] of Object.entries(rot)) {
      if (typeof val !== "number" || isNaN(val)) continue;
      const c = clampAngle(bone, ax, val);
      if (CONSTRAINTS[bone].axes.includes(ax)) clamped[ax] = c;
    }
    if (Object.keys(clamped).length) result[bone] = clamped;
  }
  return result;
}

// ── Lerp blend ────────────────────────────────────────────────────────────────
// Blends AI pose on top of current pose at 70% AI / 30% current.
// Joints not in the AI result keep their current value.
export function blendPoses(currentJoints, aiJoints, alpha = 0.7) {
  const result = {};

  // Start from current
  for (const [bone, rot] of Object.entries(currentJoints)) {
    result[bone] = { ...rot };
  }

  // Blend in AI values
  for (const [bone, rot] of Object.entries(aiJoints)) {
    const current = result[bone] ?? { x: 0, y: 0, z: 0 };
    result[bone]  = {};
    for (const ax of ["x", "y", "z"]) {
      const cur = current[ax] ?? 0;
      const ai  = rot[ax]     ?? cur;
      result[bone][ax] = cur * (1 - alpha) + ai * alpha;
    }
  }

  return result;
}

// ── Main function ─────────────────────────────────────────────────────────────
/**
 * generatePoseFromAI(prompt)
 *
 * Sends the prompt to the backend AI route, validates the response,
 * and returns the clamped joint map.
 *
 * Returns null on any failure so the caller can fall back gracefully.
 */
export async function generatePoseFromAI(prompt) {
  try {
    const res = await fetch(POSE_API, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ prompt }),
      signal:  AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn("[PoseAI] API error:", err.error ?? res.status);
      return null;
    }

    const data = await res.json();
    if (!data.joints || typeof data.joints !== "object") return null;

    const validated = validateAIPose(data.joints);
    if (!Object.keys(validated).length) return null;

    return { joints: validated, source: "ai" };

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      console.warn("[PoseAI] Request timed out");
    } else {
      console.warn("[PoseAI] Fetch error:", err.message);
    }
    return null;
  }
}
