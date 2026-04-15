/**
 * poseAIRoute.js
 * POST /api/pose  — converts a natural language description into joint rotations
 *
 * Uses OpenAI-compatible API (set OPENAI_API_KEY in environment).
 * Falls back gracefully if the key is missing or the call fails.
 *
 * Request:  { prompt: string }
 * Response: { joints: { JointName: { x?, y?, z? } }, source: "ai" | "error" }
 */

const express = require("express");
const router  = express.Router();

// ── Joint constraints (server-side safety clamp) ──────────────────────────────
const JOINT_RANGES = {
  Head:         { x: [-40,40],  y: [-60,60],  z: [-30,30]  },
  Neck:         { x: [-20,20],  y: [-30,30]                 },
  Spine:        { x: [-25,25],  y: [-25,25],  z: [-15,15]  },
  Spine1:       { x: [-20,20],  y: [-20,20],  z: [-12,12]  },
  Spine2:       { x: [-15,15],  y: [-15,15],  z: [-10,10]  },
  Hips:         { x: [-30,30],  y: [-45,45],  z: [-20,20]  },
  LeftArm:      { x: [-80,80],  y: [-90,90],  z: [-40,80]  },
  RightArm:     { x: [-80,80],  y: [-90,90],  z: [-80,40]  },
  LeftForeArm:  { x: [-150,0]                               },
  RightForeArm: { x: [-150,0]                               },
  LeftHand:     { x: [-70,70],               z: [-25,25]   },
  RightHand:    { x: [-70,70],               z: [-25,25]   },
  LeftUpLeg:    { x: [-90,90],  y: [-45,45],  z: [-45,30]  },
  RightUpLeg:   { x: [-90,90],  y: [-45,45],  z: [-30,45]  },
  LeftLeg:      { x: [0,140]                                },
  RightLeg:     { x: [0,140]                                },
  LeftFoot:     { x: [-40,30],               z: [-20,20]   },
  RightFoot:    { x: [-40,30],               z: [-20,20]   },
};

const VALID_JOINTS = new Set(Object.keys(JOINT_RANGES));
const VALID_AXES   = new Set(["x", "y", "z"]);

function clampServerSide(joints) {
  const result = {};
  for (const [bone, rot] of Object.entries(joints)) {
    if (!VALID_JOINTS.has(bone)) continue;
    const ranges  = JOINT_RANGES[bone];
    const clamped = {};
    for (const [ax, val] of Object.entries(rot)) {
      if (!VALID_AXES.has(ax)) continue;
      if (typeof val !== "number" || isNaN(val)) continue;
      const range = ranges[ax];
      if (!range) continue;   // axis not allowed for this joint
      clamped[ax] = Math.max(range[0], Math.min(range[1], val));
    }
    if (Object.keys(clamped).length) result[bone] = clamped;
  }
  return result;
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a 3D pose generator for a humanoid mannequin.
Convert the user's pose description into joint rotation angles.

RULES:
- Output ONLY valid JSON — no explanation, no markdown, no code blocks
- Use ONLY these joint names:
  Head, Neck, Spine, Spine1, Spine2, Hips,
  LeftArm, RightArm, LeftForeArm, RightForeArm, LeftHand, RightHand,
  LeftUpLeg, RightUpLeg, LeftLeg, RightLeg, LeftFoot, RightFoot
- Use ONLY axes that make anatomical sense for each joint
- Angle ranges (degrees):
    Arms (LeftArm/RightArm): x -80 to 80, y -90 to 90, z -80 to 80
    Elbows (ForeArm): x -150 to 0 ONLY (hinge joint — no y or z)
    Knees (LeftLeg/RightLeg): x 0 to 140 ONLY (hinge joint — no y or z)
    Spine segments: x -25 to 25, y -25 to 25, z -15 to 15
    Head: x -40 to 40, y -60 to 60, z -30 to 30
    Hips: x -30 to 30, y -45 to 45, z -20 to 20
    UpLeg (hip joint): x -90 to 90, y -45 to 45, z -45 to 45
- AXIS CONVENTION:
    Arm x negative = arm raises forward/up
    Arm z positive (left) / negative (right) = arm moves away from body
    Knee x positive = knee bends backward (natural bend direction)
    UpLeg x negative = thigh swings forward (sitting, running)
    Spine x negative = torso leans forward
- Keep poses natural, balanced, and anatomically believable
- Omit joints that stay at rest position (0)
- If description is unclear, approximate a reasonable pose

Output format (example):
{"Head":{"y":30},"RightArm":{"x":-60,"z":-10},"RightForeArm":{"x":-80}}`;

// ── Route handler ─────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "prompt is required" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "AI pose generation unavailable — OPENAI_API_KEY not configured",
      source: "error",
    });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:       "gpt-4o-mini",
        temperature: 0.3,
        max_tokens:  400,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),   // 8s hard timeout
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error("[PoseAI] OpenAI error:", err);
      return res.status(502).json({ error: "AI service error", source: "error" });
    }

    const data    = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";

    // Parse JSON — strip any accidental markdown fences
    const jsonStr = content.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    let rawJoints;
    try {
      rawJoints = JSON.parse(jsonStr);
    } catch {
      console.error("[PoseAI] JSON parse failed:", content);
      return res.status(422).json({ error: "AI returned invalid JSON", source: "error" });
    }

    const joints = clampServerSide(rawJoints);
    return res.json({ joints, source: "ai" });

  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return res.status(504).json({ error: "AI request timed out", source: "error" });
    }
    console.error("[PoseAI] Unexpected error:", err.message);
    return res.status(500).json({ error: "Internal server error", source: "error" });
  }
});

module.exports = router;
