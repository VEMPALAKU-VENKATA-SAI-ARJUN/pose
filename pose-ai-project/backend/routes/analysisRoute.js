/**
 * analysisRoute.js
 * POST /api/analysis  — upload image, run AI, persist to MongoDB
 * GET  /api/analysis  — fetch recent analysis history (last 20)
 */

const express  = require("express");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const axios    = require("axios");
const FormData = require("form-data");
const Analysis = require("../models/Analysis");

const router = express.Router();
const AI     = process.env.AI_SERVICE_URL || "http://localhost:5000";

// ── Disk storage — saves originals to /uploads ────────────────────────────────
const uploadsDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename:    (_req, file, cb) => {
    const stamp = Date.now();
    const ext   = path.extname(file.originalname) || ".jpg";
    cb(null, `pose_${stamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits:     { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are accepted"));
    }
    cb(null, true);
  },
}).single("file");


// ── POST /api/analysis ────────────────────────────────────────────────────────

router.post("/", (req, res) => {
  upload(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    // Forward to Flask AI service
    let aiData;
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(req.file.path), {
        filename:    req.file.originalname,
        contentType: req.file.mimetype,
      });

      const aiRes = await axios.post(`${AI}/analyze`, form, {
        headers: form.getHeaders(),
        timeout: 60_000,
      });
      aiData = aiRes.data;
    } catch (aiErr) {
      // Clean up uploaded file on AI failure
      fs.unlink(req.file.path, () => {});
      if (aiErr.response) {
        return res.status(aiErr.response.status).json(
          aiErr.response.data ?? { error: "AI service error" }
        );
      }
      return res.status(502).json({ error: "AI service unavailable" });
    }

    // Build angle list from AI response
    const rawAngles = aiData.analysis?.angles || {};
    const angles = Object.entries(rawAngles).map(([joint, angle]) => ({
      joint,
      angle: typeof angle === "number" ? Math.round(angle * 10) / 10 : 0,
      flagged: (aiData.analysis?.errors || []).some(e => e.joint === joint),
    }));

    // Build plain-English feedback from errors
    const feedback = (aiData.analysis?.errors || []).map(e => e.message);

    // Persist to MongoDB
    try {
      const doc = await Analysis.create({
        imagePath:    req.file.path,
        originalName: req.file.originalname,
        isSketch:     aiData.is_sketch     || false,
        poseDetected: aiData.pose_detected || false,
        confidence:   aiData.confidence    || 0,
        angles,
        feedback,
        errors:       aiData.analysis?.errors  || [],
        rawKeypoints: aiData.keypoints          || [],
      });

      return res.json({
        ...aiData,
        _id:       doc._id,
        imagePath: `/uploads/${path.basename(req.file.path)}`,
        angles,
        feedback,
      });
    } catch (dbErr) {
      console.error("MongoDB save error:", dbErr.message);
      // Still return AI result even if DB save fails
      return res.json({ ...aiData, angles, feedback, dbError: "Result not persisted" });
    }
  });
});


// ── GET /api/analysis — recent history ───────────────────────────────────────

router.get("/", async (_req, res) => {
  try {
    const history = await Analysis.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .select("originalName poseDetected confidence angles feedback createdAt imagePath");
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: "Could not fetch history" });
  }
});


module.exports = router;
