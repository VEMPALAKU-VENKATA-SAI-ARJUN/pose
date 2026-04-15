/**
 * poseRules.js  (v4 — token-safe, validated, conflict-free)
 *
 * GOLDEN RULE: "The tokenizer defines the language. Rules obey it."
 *
 * Every rule.match token is auto-normalised through SYNONYMS at startup,
 * so rules can be written in plain English and will always match correctly.
 *
 * Key fixes over v3:
 *   - Auto-normalise rule tokens at init (eliminates all synonym mismatches)
 *   - Dev-mode validateRules() catches any remaining unknown tokens
 *   - Removed FULL_BODY_LOWER_BLOCKERS (unused dead code)
 *   - "lean" → "tilt" synonym respected in rules
 *   - "out" → "spread" synonym respected in rules
 *   - "back" → "backward" synonym respected in rules
 *   - Full debug logging in dev mode
 */

import { clampAngle, CONSTRAINTS } from "./jointConstraints";

// ── Intensity map ─────────────────────────────────────────────────────────────
const INTENSITY = {
  slightly:   0.45,
  gently:     0.45,
  a_little:   0.45,
  a_bit:      0.45,
  partially:  0.60,
  halfway:    0.60,
  mostly:     0.85,
  fully:      1.10,
  completely: 1.10,
  strongly:   1.05,
  deeply:     1.05,
  hard:       1.05,
};

// ── Canonical synonym table ───────────────────────────────────────────────────
// Maps input words → canonical tokens.
// Rules are written using canonical tokens (right-hand side values).
// NEVER add circular mappings (e.g. backward → back).
export const SYNONYMS = {
  // Actions
  lift:        "raise",
  elevate:     "raise",
  raised:      "raise",     // "arms raised" → "raise"
  lifting:     "raise",
  lower:       "drop",
  bring_down:  "drop",
  flex:        "bend",
  curl:        "bend",
  fold:        "bend",
  bending:     "bend",
  extend:      "stretch",
  straighten:  "stretch",
  stretching:  "stretch",   // "stretching their back" → "stretch"
  stretched:   "stretch",
  lean:        "tilt",
  incline:     "tilt",
  leaning:     "tilt",
  rotate:      "twist",
  turn:        "look",
  face:        "look",
  turning:     "look",
  cross:       "cross",
  crossing:    "cross",
  spread:      "spread",
  open:        "spread",
  wide:        "spread",
  spreading:   "spread",
  // Directions
  forward:     "forward",
  front:       "forward",
  backward:    "backward",
  back:        "backward",
  up:          "up",
  upward:      "up",
  upwards:     "up",
  overhead:    "up",        // "arms overhead" → "up"
  above:       "up",
  down:        "down",
  downward:    "down",
  left:        "left",
  right:       "right",
  both:        "both",
  out:         "out",
  outward:     "out",
  sideways:    "out",
  // Body parts
  arms:        "arms",
  arm:         "arm",
  hand:        "hand",
  hands:       "hands",
  elbow:       "elbow",
  elbows:      "elbows",
  shoulder:    "shoulder",
  shoulders:   "shoulders",
  leg:         "leg",
  legs:        "legs",
  knee:        "knee",
  knees:       "knees",
  hip:         "hip",
  hips:        "hips",
  foot:        "foot",
  feet:        "foot",
  ankle:       "ankle",
  ankles:      "ankles",
  head:        "head",
  neck:        "neck",
  spine:       "spine",
  torso:       "torso",
  body:        "torso",
  wrist:       "wrist",
  wrists:      "wrists",
  // ── Additional vocabulary ─────────────────────────────────────────────────
  upper:       "upper",
  without:     "without",
  moving:      "moving",
  opposite:    "opposite",
  direction:   "direction",
  balance:     "balance",
  balancing:   "balance",
  completely:  "completely",
  fully:       "fully",
  upright:     "upright",
  keeping:     "keeping",
  while:       "while",
  but:         "but",
  keep:        "keep",
  facing:      "facing",
  turning:     "look",
  sideways:    "out",
  // ── Identity mappings ─────────────────────────────────────────────────────
  weight:      "weight",
  shift:       "shift",
  squat:       "squat",
  nod:         "nod",
  arch:        "arch",
  tilt:        "tilt",
  raise:       "raise",
  drop:        "drop",
  bend:        "bend",
  stretch:     "stretch",
  twist:       "twist",
  look:        "look",
  upper:       "upper",
  balance:     "balance",
  // ── Natural language descriptors ──────────────────────────────────────────
  relaxed:     "relaxed",
  casual:      "relaxed",
  casually:    "relaxed",
  loosely:     "relaxed",
  tired:       "tired",
  exhausted:   "tired",
  slouching:   "tired",
  hunching:    "tired",
  confident:   "confident",
  heroic:      "confident",
  proud:       "confident",
  standing:    "standing",
  idle:        "standing",
  resting:     "standing",
  one:         "one",
  on:          "on",
  with:        "with",
  and:         "and",
  the:         "the",
  a:           "a",
  an:          "an",
  is:          "is",
  are:         "are",
  someone:     "someone",
  person:      "person",
  man:         "person",
  woman:       "person",
  // ── Intent vocabulary ─────────────────────────────────────────────────────
  sneaking:    "sneaking",
  sneak:       "sneaking",
  sneaky:      "sneaking",
  crouched:    "crouched",
  crouching:   "crouched",
  crouch:      "crouched",
  carefully:   "carefully",
  careful:     "carefully",
  cautiously:  "carefully",
  around:      "around",
  looking:     "looking",
  glancing:    "looking",
  peering:     "looking",
  running:     "running",
  sprinting:   "running",
  jogging:     "running",
  jumping:     "jumping",
  leaping:     "jumping",
  fighting:    "fighting",
  attacking:   "fighting",
  dancing:     "dancing",
  swaying:     "dancing",
  thinking:    "thinking",
  pondering:   "thinking",
  pointing:    "pointing",
  reaching:    "reaching",
  waving:      "waving",
  // ── Synthetic tokens (preprocessNaturalLanguage + detectIntent) ───────────
  relaxed_pose:   "relaxed_pose",
  tired_pose:     "tired_pose",
  confident_pose: "confident_pose",
  crossed:        "crossed",
  stealth_pose:   "stealth_pose",
  alert_head:     "alert_head",
  slow_balance:   "slow_balance",
  run_pose:       "run_pose",
  jump_pose:      "jump_pose",
  fight_pose:     "fight_pose",
  think_pose:     "think_pose",
  wave_pose:      "wave_pose",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function merge(existing, delta) {
  const base   = existing ?? {};
  const result = { ...base };
  for (const [ax, val] of Object.entries(delta)) {
    const blended = (result[ax] ?? 0) * 0.4 + val * 0.6;
    result[ax]    = Math.max(-90, Math.min(90, blended));
  }
  return result;
}

function override(joints, bone, values) {
  joints[bone] = { ...values };
}

function bendSpine(joints, xDeg, yDeg = 0, zDeg = 0) {
  joints.Spine  = merge(joints.Spine,  { x: xDeg * 0.45, y: yDeg * 0.45, z: zDeg * 0.45 });
  joints.Spine1 = merge(joints.Spine1, { x: xDeg * 0.35, y: yDeg * 0.35, z: zDeg * 0.35 });
  joints.Spine2 = merge(joints.Spine2, { x: xDeg * 0.20, y: yDeg * 0.20, z: zDeg * 0.20 });
}

// ── Intent detection ──────────────────────────────────────────────────────────
// Maps semantic meaning from token sets to intent labels.
// Called before rule matching to bridge the gap between description and commands.
function detectIntent(tokens) {
  const set     = new Set(tokens);
  const intents = [];

  // Stealth / sneaking
  if (set.has("sneaking") || set.has("crouched")) {
    intents.push("stealth_pose");
  }

  // Alert / looking around
  if (set.has("looking") && set.has("around")) {
    intents.push("alert_head");
  }

  // Careful / cautious movement
  if (set.has("carefully")) {
    intents.push("slow_balance");
  }

  // Relaxed / casual
  if (set.has("relaxed") || set.has("casually")) {
    intents.push("relaxed_pose");
  }

  // Tired / exhausted
  if (set.has("tired")) {
    intents.push("tired_pose");
  }

  // Confident / heroic
  if (set.has("confident")) {
    intents.push("confident_pose");
  }

  // Running / sprinting
  if (set.has("running")) {
    intents.push("run_pose");
  }

  // Jumping / leaping
  if (set.has("jumping")) {
    intents.push("jump_pose");
  }

  // Fighting / attacking
  if (set.has("fighting")) {
    intents.push("fight_pose");
  }

  // Thinking / pondering
  if (set.has("thinking")) {
    intents.push("think_pose");
  }

  // Waving
  if (set.has("waving")) {
    intents.push("wave_pose");
  }

  return intents;
}

// ── Expand intents into rule-compatible tokens ────────────────────────────────
function expandIntents(tokens, intents) {
  if (intents.includes("stealth_pose")) {
    // Crouched + leaning forward + arms slightly out for balance
    tokens.push("squat", "tilt", "forward");
  }
  if (intents.includes("alert_head")) {
    tokens.push("look", "left");
  }
  if (intents.includes("slow_balance")) {
    tokens.push("shift", "weight", "right");
  }
  if (intents.includes("relaxed_pose")) {
    tokens.push("relaxed_pose");
  }
  if (intents.includes("tired_pose")) {
    tokens.push("tired_pose");
  }
  if (intents.includes("confident_pose")) {
    tokens.push("confident_pose");
  }
  if (intents.includes("run_pose")) {
    tokens.push("run_pose");
  }
  if (intents.includes("jump_pose")) {
    tokens.push("jump_pose");
  }
  if (intents.includes("fight_pose")) {
    tokens.push("fight_pose");
  }
  if (intents.includes("think_pose")) {
    tokens.push("think_pose");
  }
  if (intents.includes("wave_pose")) {
    tokens.push("wave_pose");
  }
  return tokens;
}

// ── Semantic preprocessing ────────────────────────────────────────────────────
// Runs AFTER tokenisation. Detects natural language patterns and injects
// synthetic rule-compatible tokens so existing rules can fire.
function preprocessNaturalLanguage(tokens) {
  const set = new Set(tokens);
  const out = [...tokens];

  // ── Intent layer: detect meaning, expand to rule tokens ───────────────────
  const intents = detectIntent(tokens);
  expandIntents(out, intents);

  // ── Pattern-based injections ──────────────────────────────────────────────

  // "weight on one leg" / "weight on leg" → weight shift
  if (set.has("weight") && set.has("leg")) {
    out.push("shift", "weight", "right");
  }

  // "turn head backward" / "head completely backward" → head backward rule
  if (set.has("head") && set.has("backward")) {
    out.push("head", "backward");
  }

  // "twist upper body" / "twist upper" — spine only twist
  if (set.has("twist") && (set.has("upper") || set.has("torso"))) {
    // inject direction if missing
    if (!set.has("left") && !set.has("right")) {
      out.push("upper");   // fires "twist upper" rule
    }
  }

  // "balance on one leg" / "balance one leg"
  if (set.has("balance") && set.has("leg")) {
    out.push("balance", "one", "leg");
  }

  // "cross legs" — distinct from "cross arms"
  if (set.has("cross") && set.has("legs")) {
    out.push("cross", "legs");
  }

  // "turning torso sideways" → twist torso + out direction
  if ((set.has("look") || set.has("turning")) && set.has("torso") && set.has("out")) {
    out.push("twist", "torso", "right");
  }

  // "stretch back" / "stretching back" → arch backward
  if (set.has("stretch") && (set.has("backward") || set.has("torso") || set.has("spine"))) {
    out.push("arch", "backward");
  }

  // "both arms raised" / "arms raised overhead" / "arms up"
  if (set.has("arms") && (set.has("raise") || set.has("up"))) {
    out.push("raise", "arms");
  }

  // "hand on head" → right arm raised, elbow bent
  if (set.has("hand") && set.has("head")) {
    out.push("raise", "right", "arm");
    out.push("bend", "right", "elbow");
  }

  // "arms crossed" / "crossed arms"
  if (set.has("crossed") || (set.has("cross") && set.has("arms"))) {
    out.push("cross", "arms");
  }

  // "pointing" → right arm forward
  if (set.has("pointing") || set.has("reaching")) {
    out.push("right", "arm", "forward");
  }

  // "waving" → raise right arm
  if (set.has("waving")) {
    out.push("raise", "right", "arm");
  }

  if (process.env.NODE_ENV === "development") {
    const added = out.filter(t => !tokens.includes(t));
    if (added.length) {
      console.log("[Parser] Intents detected:", intents);
      console.log("[Parser] Preprocessing injected:", added);
    }
  }

  return out;
}

// ── Rule definitions ──────────────────────────────────────────────────────────
// Write match tokens in plain English — they are auto-normalised at startup.
// Use canonical tokens where possible for clarity.
// priority: higher = applied later (wins). fullBody: true = blocks lower-body rules.

const RULES_RAW = [

  // ── HEAD ──────────────────────────────────────────────────────────────────
  { match: ["look", "left"],
    apply: (j, t) => { override(j, "Head", { y:  45 * t }); override(j, "Neck", { y:  18 * t }); },
    priority: 10 },

  { match: ["look", "right"],
    apply: (j, t) => { override(j, "Head", { y: -45 * t }); override(j, "Neck", { y: -18 * t }); },
    priority: 10 },

  { match: ["look", "up"],
    apply: (j, t) => { override(j, "Head", { x: -28 * t }); },
    priority: 10 },

  { match: ["look", "down"],
    apply: (j, t) => { override(j, "Head", { x:  25 * t }); },
    priority: 10 },

  // "turn head completely backward" — max Y rotation (looking over shoulder)
  { match: ["look", "head", "backward"],
    apply: (j, t) => { override(j, "Head", { y:  58 * t }); override(j, "Neck", { y:  28 * t }); },
    priority: 12 },

  { match: ["head", "backward"],
    apply: (j, t) => { override(j, "Head", { y:  58 * t }); override(j, "Neck", { y:  28 * t }); },
    priority: 11 },

  { match: ["tilt", "head", "left"],
    apply: (j, t) => { override(j, "Head", { z: -22 * t }); },
    priority: 10 },

  { match: ["tilt", "head", "right"],
    apply: (j, t) => { override(j, "Head", { z:  22 * t }); },
    priority: 10 },

  { match: ["nod"],
    apply: (j, t) => { override(j, "Head", { x:  22 * t }); },
    priority: 10 },

  // ── SPINE ─────────────────────────────────────────────────────────────────
  // NOTE: "lean forward" tokenises as ["tilt","forward"] after synonym map
  { match: ["tilt", "forward"],
    apply: (j, t) => { bendSpine(j, -15 * t); },
    priority: 5 },

  { match: ["tilt", "backward"],
    apply: (j, t) => { bendSpine(j,  15 * t); },
    priority: 5 },

  // "bend forward" — explicit bend action on spine
  { match: ["bend", "forward"],
    apply: (j, t) => {
      bendSpine(j, -22 * t);
      j.Hips = merge(j.Hips, { x:  10 * t });
    }, priority: 6 },

  // "arch back" → tokens: ["arch","backward"]
  { match: ["arch", "backward"],
    apply: (j, t) => { bendSpine(j,  -20 * t); },
    priority: 5 },

  { match: ["twist", "torso", "left"],
    apply: (j, t) => {
      j.Hips = merge(j.Hips, { y: -20 * t });
      bendSpine(j, 0, 18 * t);
    }, priority: 5 },

  { match: ["twist", "torso", "right"],
    apply: (j, t) => {
      j.Hips = merge(j.Hips, { y:  20 * t });
      bendSpine(j, 0, -18 * t);
    }, priority: 5 },

  { match: ["twist", "left"],
    apply: (j, t) => { bendSpine(j, 0, 18 * t); },
    priority: 4 },

  { match: ["twist", "right"],
    apply: (j, t) => { bendSpine(j, 0, -18 * t); },
    priority: 4 },

  // "twist upper body" — spine only, hips stay still (no hip rotation)
  { match: ["twist", "upper", "left"],
    apply: (j, t) => { bendSpine(j, 0, 22 * t); },
    priority: 7 },

  { match: ["twist", "upper", "right"],
    apply: (j, t) => { bendSpine(j, 0, -22 * t); },
    priority: 7 },

  // "twist upper body without moving hips" — spine twist, hips locked
  { match: ["twist", "upper"],
    apply: (j, t) => { bendSpine(j, 0, 20 * t); },
    priority: 6 },

  // ── RIGHT ARM ─────────────────────────────────────────────────────────────
  { match: ["raise", "right", "arm"],
    apply: (j, t) => { j.RightArm = merge(j.RightArm, { x: -65 * t, z: -8 * t }); },
    priority: 10 },

  { match: ["raise", "right", "hand"],
    apply: (j, t) => {
      j.RightArm     = merge(j.RightArm,     { x: -65 * t, z: -8 * t });
      j.RightForeArm = merge(j.RightForeArm, { x:  -5 * t });
    }, priority: 11 },

  { match: ["drop", "right", "arm"],
    apply: (j, t) => { j.RightArm = merge(j.RightArm, { x:  35 * t, z: -8 * t }); },
    priority: 10 },

  { match: ["bend", "right", "elbow"],
    apply: (j, t) => { j.RightForeArm = merge(j.RightForeArm, { x: -80 * t }); },
    priority: 10 },

  { match: ["stretch", "right", "arm"],
    apply: (j, t) => { override(j, "RightForeArm", { x: 0 }); },
    priority: 10 },

  { match: ["right", "arm", "forward"],
    apply: (j, t) => { j.RightArm = merge(j.RightArm, { x: -60 * t }); },
    priority: 9 },

  { match: ["right", "arm", "backward"],
    apply: (j, t) => { j.RightArm = merge(j.RightArm, { x:  50 * t }); },
    priority: 9 },

  // "right arm out" → tokens: ["right","arm","out"]
  { match: ["right", "arm", "out"],
    apply: (j, t) => { j.RightArm = merge(j.RightArm, { z: -60 * t }); },
    priority: 9 },

  // ── LEFT ARM ──────────────────────────────────────────────────────────────
  { match: ["raise", "left", "arm"],
    apply: (j, t) => { j.LeftArm = merge(j.LeftArm, { x: -65 * t, z:  8 * t }); },
    priority: 10 },

  { match: ["raise", "left", "hand"],
    apply: (j, t) => {
      j.LeftArm     = merge(j.LeftArm,     { x: -65 * t, z:  8 * t });
      j.LeftForeArm = merge(j.LeftForeArm, { x:  -5 * t });
    }, priority: 11 },

  { match: ["drop", "left", "arm"],
    apply: (j, t) => { j.LeftArm = merge(j.LeftArm, { x:  35 * t, z:  8 * t }); },
    priority: 10 },

  { match: ["bend", "left", "elbow"],
    apply: (j, t) => { j.LeftForeArm = merge(j.LeftForeArm, { x: -80 * t }); },
    priority: 10 },

  { match: ["stretch", "left", "arm"],
    apply: (j, t) => { override(j, "LeftForeArm", { x: 0 }); },
    priority: 10 },

  { match: ["left", "arm", "forward"],
    apply: (j, t) => { j.LeftArm = merge(j.LeftArm, { x: -60 * t }); },
    priority: 9 },

  { match: ["left", "arm", "backward"],
    apply: (j, t) => { j.LeftArm = merge(j.LeftArm, { x:  50 * t }); },
    priority: 9 },

  { match: ["left", "arm", "out"],
    apply: (j, t) => { j.LeftArm = merge(j.LeftArm, { z:  60 * t }); },
    priority: 9 },

  // ── BOTH ARMS ─────────────────────────────────────────────────────────────
  { match: ["raise", "both", "arms"],
    apply: (j, t) => {
      override(j, "LeftArm",  { x: -65 * t, z:  8 * t });
      override(j, "RightArm", { x: -65 * t, z: -8 * t });
    }, priority: 12 },

  { match: ["raise", "arms"],
    apply: (j, t) => {
      override(j, "LeftArm",  { x: -65 * t, z:  8 * t });
      override(j, "RightArm", { x: -65 * t, z: -8 * t });
    }, priority: 11 },

  { match: ["spread", "arms"],
    apply: (j, t) => {
      override(j, "LeftArm",  { z:  60 * t });
      override(j, "RightArm", { z: -60 * t });
    }, priority: 11 },

  { match: ["cross", "arms"],
    apply: (j, t) => {
      override(j, "LeftArm",      { x: -18 * t, z: -28 * t });
      override(j, "RightArm",     { x: -18 * t, z:  28 * t });
      override(j, "LeftForeArm",  { x: -70 * t });
      override(j, "RightForeArm", { x: -70 * t });
    }, priority: 12 },

  { match: ["bend", "elbows"],
    apply: (j, t) => {
      j.LeftForeArm  = merge(j.LeftForeArm,  { x: -75 * t });
      j.RightForeArm = merge(j.RightForeArm, { x: -75 * t });
    }, priority: 10 },

  // ── RIGHT LEG ─────────────────────────────────────────────────────────────
  { match: ["raise", "right", "leg"],
    apply: (j, t) => {
      override(j, "RightUpLeg", { x: -55 * t });
      override(j, "RightLeg",   { x:   8 * t });
    }, priority: 10 },

  { match: ["bend", "right", "knee"],
    apply: (j, t) => { j.RightLeg = merge(j.RightLeg, { x:  75 * t }); },
    priority: 10 },

  { match: ["stretch", "right", "leg"],
    apply: (j, t) => {
      j.RightUpLeg = merge(j.RightUpLeg, { x: -25 * t });
      override(j, "RightLeg", { x: 0 });
    }, priority: 10 },

  { match: ["right", "leg", "forward"],
    apply: (j, t) => { j.RightUpLeg = merge(j.RightUpLeg, { x: -45 * t }); },
    priority: 9 },

  { match: ["right", "leg", "backward"],
    apply: (j, t) => { j.RightUpLeg = merge(j.RightUpLeg, { x:  45 * t }); },
    priority: 9 },

  { match: ["right", "leg", "out"],
    apply: (j, t) => { j.RightUpLeg = merge(j.RightUpLeg, { z: -30 * t }); },
    priority: 9 },

  // ── LEFT LEG ──────────────────────────────────────────────────────────────
  { match: ["raise", "left", "leg"],
    apply: (j, t) => {
      override(j, "LeftUpLeg", { x: -55 * t });
      override(j, "LeftLeg",   { x:   8 * t });
    }, priority: 10 },

  { match: ["bend", "left", "knee"],
    apply: (j, t) => { j.LeftLeg = merge(j.LeftLeg, { x:  75 * t }); },
    priority: 10 },

  { match: ["stretch", "left", "leg"],
    apply: (j, t) => {
      j.LeftUpLeg = merge(j.LeftUpLeg, { x: -25 * t });
      override(j, "LeftLeg", { x: 0 });
    }, priority: 10 },

  { match: ["left", "leg", "forward"],
    apply: (j, t) => { j.LeftUpLeg = merge(j.LeftUpLeg, { x: -45 * t }); },
    priority: 9 },

  { match: ["left", "leg", "backward"],
    apply: (j, t) => { j.LeftUpLeg = merge(j.LeftUpLeg, { x:  45 * t }); },
    priority: 9 },

  { match: ["left", "leg", "out"],
    apply: (j, t) => { j.LeftUpLeg = merge(j.LeftUpLeg, { z:  30 * t }); },
    priority: 9 },

  // ── BOTH LEGS ─────────────────────────────────────────────────────────────
  { match: ["bend", "knees"],
    apply: (j, t) => {
      j.LeftLeg  = merge(j.LeftLeg,  { x:  65 * t });
      j.RightLeg = merge(j.RightLeg, { x:  65 * t });
    }, priority: 11 },

  { match: ["bend", "both", "knees"],
    apply: (j, t) => {
      override(j, "LeftLeg",  { x:  65 * t });
      override(j, "RightLeg", { x:  65 * t });
    }, priority: 12 },

  // "cross legs" — one leg crosses in front of the other
  { match: ["cross", "legs"],
    apply: (j, t) => {
      j.LeftUpLeg  = merge(j.LeftUpLeg,  { z: -25 * t });
      j.RightUpLeg = merge(j.RightUpLeg, { z:  25 * t });
      j.LeftLeg    = merge(j.LeftLeg,    { x:  20 * t });
      j.RightLeg   = merge(j.RightLeg,   { x:  20 * t });
    }, priority: 12 },

  // "balance on one leg" — raise left leg, shift weight right
  { match: ["balance", "leg"],
    apply: (j, t) => {
      override(j, "LeftUpLeg", { x: -50 * t });
      override(j, "LeftLeg",   { x:  30 * t });
      j.Hips = merge(j.Hips, { z: -8 * t });
      bendSpine(j, 0, 0, 5 * t);
    }, priority: 12 },

  { match: ["balance", "one", "leg"],
    apply: (j, t) => {
      override(j, "LeftUpLeg", { x: -50 * t });
      override(j, "LeftLeg",   { x:  30 * t });
      j.Hips = merge(j.Hips, { z: -8 * t });
      bendSpine(j, 0, 0, 5 * t);
    }, priority: 13 },

  { match: ["squat"],
    fullBody: true,
    apply: (j, t) => {
      override(j, "LeftUpLeg",    { x: -55 * t });
      override(j, "RightUpLeg",   { x: -55 * t });
      override(j, "LeftLeg",      { x:  75 * t });
      override(j, "RightLeg",     { x:  75 * t });
      override(j, "LeftArm",      { x: -50 * t, z:  8 * t });
      override(j, "RightArm",     { x: -50 * t, z: -8 * t });
      override(j, "LeftForeArm",  { x: 0 });
      override(j, "RightForeArm", { x: 0 });
      j.Hips = merge(j.Hips, { x: 18 * t });
      bendSpine(j, -12 * t);
    }, priority: 20 },

  // ── HIPS ──────────────────────────────────────────────────────────────────
  { match: ["tilt", "hips", "left"],
    apply: (j, t) => { j.Hips = merge(j.Hips, { z:  12 * t }); },
    priority: 8 },

  { match: ["tilt", "hips", "right"],
    apply: (j, t) => { j.Hips = merge(j.Hips, { z: -12 * t }); },
    priority: 8 },

  { match: ["shift", "weight", "left"],
    apply: (j, t) => {
      j.Hips = merge(j.Hips, { z:  10 * t });
      bendSpine(j, 0, 0, -6 * t);
    }, priority: 8 },

  { match: ["shift", "weight", "right"],
    apply: (j, t) => {
      j.Hips = merge(j.Hips, { z: -10 * t });
      bendSpine(j, 0, 0,  6 * t);
    }, priority: 8 },

  // ── NATURAL LANGUAGE SEMANTIC RULES ───────────────────────────────────────
  // These fire on synthetic tokens injected by preprocessNaturalLanguage().

  { match: ["relaxed_pose"],
    apply: (j, t) => {
      bendSpine(j, -8 * t);                          // slight forward lean
      j.Head  = merge(j.Head,  { x:  5 * t });       // head slightly down
      j.Hips  = merge(j.Hips,  { z:  5 * t });       // subtle hip shift
      j.LeftArm  = merge(j.LeftArm,  { z:  5 * t }); // arms hang naturally
      j.RightArm = merge(j.RightArm, { z: -5 * t });
    }, priority: 3 },

  { match: ["tired_pose"],
    apply: (j, t) => {
      bendSpine(j, -18 * t);                          // pronounced forward hunch
      j.Head  = merge(j.Head,  { x:  15 * t });       // head droops
      j.Hips  = merge(j.Hips,  { x:   8 * t });
      j.LeftArm  = merge(j.LeftArm,  { x:  20 * t, z:  8 * t });
      j.RightArm = merge(j.RightArm, { x:  20 * t, z: -8 * t });
      j.LeftForeArm  = merge(j.LeftForeArm,  { x: -30 * t });
      j.RightForeArm = merge(j.RightForeArm, { x: -30 * t });
    }, priority: 3 },

  { match: ["confident_pose"],
    apply: (j, t) => {
      bendSpine(j,  5 * t);
      j.Head  = merge(j.Head,  { x: -5 * t });
      j.Hips  = merge(j.Hips,  { z:  3 * t });
      j.LeftArm  = merge(j.LeftArm,  { z:  15 * t });
      j.RightArm = merge(j.RightArm, { z: -15 * t });
    }, priority: 3 },

  // ── INTENT-BASED FULL-BODY RULES ──────────────────────────────────────────

  { match: ["stealth_pose"],
    fullBody: true,
    apply: (j, t) => {
      // Low crouched stance — knees bent, torso forward, arms out for balance
      override(j, "LeftUpLeg",    { x: -45 * t });
      override(j, "RightUpLeg",   { x: -45 * t });
      override(j, "LeftLeg",      { x:  60 * t });
      override(j, "RightLeg",     { x:  60 * t });
      override(j, "LeftArm",      { x: -20 * t, z:  20 * t });
      override(j, "RightArm",     { x: -20 * t, z: -20 * t });
      override(j, "LeftForeArm",  { x: -30 * t });
      override(j, "RightForeArm", { x: -30 * t });
      j.Hips = merge(j.Hips, { x:  12 * t });
      bendSpine(j, -18 * t);
    }, priority: 18 },

  { match: ["run_pose"],
    fullBody: true,
    apply: (j, t) => {
      override(j, "LeftUpLeg",    { x: -50 * t });
      override(j, "LeftLeg",      { x:  18 * t });
      override(j, "RightUpLeg",   { x:  35 * t });
      override(j, "RightLeg",     { x:  55 * t });
      override(j, "LeftArm",      { x:  45 * t, z:  8 * t });
      override(j, "RightArm",     { x: -50 * t, z: -8 * t });
      override(j, "LeftForeArm",  { x: -55 * t });
      override(j, "RightForeArm", { x: -65 * t });
      j.Hips = merge(j.Hips, { x:  8 * t, z:  3 * t });
      bendSpine(j, -10 * t);
    }, priority: 18 },

  { match: ["jump_pose"],
    fullBody: true,
    apply: (j, t) => {
      override(j, "LeftUpLeg",    { x: -22 * t });
      override(j, "RightUpLeg",   { x: -22 * t });
      override(j, "LeftLeg",      { x:  38 * t });
      override(j, "RightLeg",     { x:  38 * t });
      override(j, "LeftArm",      { x: -70 * t, z:  18 * t });
      override(j, "RightArm",     { x: -70 * t, z: -18 * t });
      override(j, "LeftForeArm",  { x: -12 * t });
      override(j, "RightForeArm", { x: -12 * t });
      j.Hips = merge(j.Hips, { x:  12 * t });
      bendSpine(j, -6 * t);
    }, priority: 18 },

  { match: ["fight_pose"],
    fullBody: true,
    apply: (j, t) => {
      override(j, "LeftUpLeg",    { x: -15 * t, z:  10 * t });
      override(j, "RightUpLeg",   { x:   8 * t, z: -10 * t });
      override(j, "LeftLeg",      { x:  12 * t });
      override(j, "RightLeg",     { x:   8 * t });
      override(j, "LeftArm",      { x: -25 * t, z:  32 * t });
      override(j, "RightArm",     { x: -70 * t, z:  -8 * t });
      override(j, "LeftForeArm",  { x: -50 * t });
      override(j, "RightForeArm", { x:  -5 * t });
      j.Hips = merge(j.Hips, { y:  18 * t });
      bendSpine(j, 0, -12 * t);
    }, priority: 18 },

  { match: ["think_pose"],
    apply: (j, t) => {
      j.Head  = merge(j.Head,  { x:  8 * t, z: -8 * t });
      j.RightArm     = merge(j.RightArm,     { x: -25 * t, z:  20 * t });
      j.RightForeArm = merge(j.RightForeArm, { x: -70 * t });
      bendSpine(j, -5 * t);
    }, priority: 7 },

  { match: ["wave_pose"],
    apply: (j, t) => {
      override(j, "RightArm",     { x: -65 * t, z: -10 * t });
      override(j, "RightForeArm", { x: -20 * t });
    }, priority: 7 },
];

// ── Auto-normalise rule tokens at startup ─────────────────────────────────────
// Each rule.match token is passed through SYNONYMS so rules can be written
// in plain English and will always align with tokeniser output.
const RULES = RULES_RAW.map(rule => ({
  ...rule,
  match: rule.match.map(t => SYNONYMS[t] ?? t),
})).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

// ── Dev-mode validation ───────────────────────────────────────────────────────
// Warns about any token in a rule that the tokeniser would never produce.
function validateRules() {
  const canonical = new Set(Object.values(SYNONYMS));
  // Also allow tokens that are their own canonical form (not in SYNONYMS keys)
  const allKnown  = new Set([...canonical, ...Object.keys(SYNONYMS)]);

  let issues = 0;
  for (const rule of RULES) {
    for (const token of rule.match) {
      if (!allKnown.has(token)) {
        console.warn(`[PoseRules] Unknown token "${token}" in rule:`, rule.match);
        issues++;
      }
    }
  }
  if (issues === 0) {
    console.log(`[PoseRules] ✓ All ${RULES.length} rules validated — no token mismatches`);
  }
}

// ── Test suite ────────────────────────────────────────────────────────────────
export function runRuleTests() {
  const cases = [
    { input: "arch back",                  expectMatch: true },
    { input: "arch backward",              expectMatch: true },
    { input: "bend forward",               expectMatch: true },
    { input: "lean forward",               expectMatch: true },
    { input: "look left",                  expectMatch: true },
    { input: "raise right hand",           expectMatch: true },
    { input: "raise both arms",            expectMatch: true },
    { input: "slightly bend knees",        expectMatch: true },
    { input: "twist torso right",          expectMatch: true },
    { input: "squat",                      expectMatch: true },
    { input: "cross arms",                 expectMatch: true },
    { input: "running with left arm up",   expectMatch: true },
  ];

  console.group("[PoseRules] Test suite");
  let passed = 0;
  for (const { input, expectMatch } of cases) {
    const tokens   = tokenise(input);
    const tokenSet = new Set(tokens);
    const matched  = RULES.filter(r => r.match.every(t => tokenSet.has(t)));
    const ok       = matched.length > 0 === expectMatch;
    console.log(
      ok ? "✓" : "✗",
      `"${input}"`,
      "→ tokens:", tokens,
      "→ rules:", matched.map(r => r.match.join(" "))
    );
    if (ok) passed++;
  }
  console.log(`${passed}/${cases.length} tests passed`);
  console.groupEnd();
}

// ── Tokeniser ─────────────────────────────────────────────────────────────────
function tokenise(text) {
  const lower = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const multiWord = [
    ["a little",   "a_little"],
    ["a bit",      "a_bit"],
    ["bring down", "bring_down"],
  ];
  let processed = lower;
  multiWord.forEach(([from, to]) => {
    processed = processed.replace(new RegExp(from, "g"), to);
  });

  return processed.split(" ").map(w => SYNONYMS[w] ?? w);
}

function detectIntensity(tokens) {
  for (const token of tokens) {
    if (INTENSITY[token] !== undefined) return INTENSITY[token];
  }
  return 1.0;
}

// ── Final clamp ───────────────────────────────────────────────────────────────
function clampJoints(joints) {
  const result = {};
  for (const [bone, rot] of Object.entries(joints)) {
    if (!CONSTRAINTS[bone]) continue;
    const clamped = {};
    for (const [ax, val] of Object.entries(rot)) {
      const c = clampAngle(bone, ax, val);
      if (c !== 0 || CONSTRAINTS[bone].axes.includes(ax)) clamped[ax] = c;
    }
    if (Object.keys(clamped).length) result[bone] = clamped;
  }
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseTextToPoseAdvanced(text, basePreset = {}) {
  const rawTokens = tokenise(text);
  const tokens    = preprocessNaturalLanguage(rawTokens);
  const tokenSet  = new Set(tokens);
  const intensity = detectIntensity(tokens);

  const joints = {};
  for (const [bone, rot] of Object.entries(basePreset)) {
    joints[bone] = { ...rot };
  }

  const matchedRules   = [];
  let   blockLowerBody = false;

  // Pass 1 — detect full-body rule
  for (const rule of RULES) {
    if (rule.fullBody && rule.match.every(t => tokenSet.has(t))) {
      blockLowerBody = true;
      break;
    }
  }

  // Pass 2 — apply rules
  for (const rule of RULES) {
    if (!rule.match.every(t => tokenSet.has(t))) continue;

    if (blockLowerBody && !rule.fullBody && (rule.priority ?? 0) < 15) {
      const lowerBodyTokens = new Set(["leg","knee","knees","squat","hip","hips","foot"]);
      if (rule.match.some(t => lowerBodyTokens.has(t))) continue;
    }

    rule.apply(joints, intensity);
    matchedRules.push(rule.match.join(" "));
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[Parser] Input:", text);
    console.log("[Parser] Tokens after preprocessing:", tokens);
    if (matchedRules.length === 0) {
      console.warn("[PoseRules] No rules matched for tokens:", tokens);
    } else {
      console.log("[Parser] Matched Rules:", matchedRules);
    }
  }

  // Zero-match fallback: apply relaxed_pose so something always happens
  if (matchedRules.length === 0 && Object.keys(basePreset).length === 0) {
    const relaxRule = RULES.find(r => r.match.includes("relaxed_pose"));
    if (relaxRule) {
      relaxRule.apply(joints, intensity * 0.5);
      matchedRules.push("relaxed_pose [fallback]");
    }
  }

  return { joints: clampJoints(joints), matchedRules, intensity };
}

export function hasAdvancedMatch(text) {
  const tokens   = preprocessNaturalLanguage(tokenise(text));
  const tokenSet = new Set(tokens);
  return RULES.some(rule => rule.match.every(t => tokenSet.has(t)));
}

// Run validation once in dev mode
if (process.env.NODE_ENV === "development") {
  validateRules();
}


