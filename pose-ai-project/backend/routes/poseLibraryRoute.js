/**
 * poseLibraryRoute.js
 *
 * GET  /api/library          — list poses with filters + search + pagination
 * GET  /api/library/:id      — single pose detail
 * POST /api/library          — create new pose
 * GET  /api/library/similar/:id — similar poses by shared tags
 */

const express = require("express");
const router  = express.Router();
const Pose    = require("../models/Pose");

// ── GET /api/library ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      gender, category, difficulty, cameraAngle, bodyType,
      q,                        // text search
      page  = 1,
      limit = 24,
    } = req.query;

    const filter = { isApproved: true };

    // Gender logic: male → male+neutral, female → female+neutral, all/omit → all
    if (gender === "male")   filter.gender = { $in: ["male",   "neutral"] };
    else if (gender === "female") filter.gender = { $in: ["female", "neutral"] };
    // else: no gender filter

    if (category)    filter.category    = category;
    if (difficulty)  filter.difficulty  = difficulty;
    if (cameraAngle) filter.cameraAngle = cameraAngle;
    if (bodyType && bodyType !== "any") filter.bodyType = { $in: [bodyType, "any"] };

    let query;
    if (q && q.trim()) {
      query = Pose.find({ ...filter, $text: { $search: q.trim() } },
                        { score: { $meta: "textScore" } })
                  .sort({ score: { $meta: "textScore" } });
    } else {
      query = Pose.find(filter).sort({ createdAt: -1 });
    }

    const skip  = (Math.max(1, Number(page)) - 1) * Number(limit);
    const total = await Pose.countDocuments(filter);
    const poses = await query.skip(skip).limit(Number(limit)).lean();

    res.json({ poses, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/library/similar/:id ─────────────────────────────────────────────
router.get("/similar/:id", async (req, res) => {
  try {
    const source = await Pose.findById(req.params.id).lean();
    if (!source) return res.status(404).json({ error: "Pose not found" });

    const similar = await Pose.find({
      _id:        { $ne: source._id },
      isApproved: true,
      tags:       { $in: source.tags },
    }).limit(8).lean();

    res.json(similar);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/library/:id ─────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const pose = await Pose.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    ).lean();
    if (!pose) return res.status(404).json({ error: "Pose not found" });
    res.json(pose);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/library ────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const pose = await Pose.create(req.body);
    res.status(201).json(pose);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
