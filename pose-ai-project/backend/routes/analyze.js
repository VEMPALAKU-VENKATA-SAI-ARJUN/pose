/**
 * routes/analyze.js
 * Receives an image from the frontend, forwards it to the Python AI service,
 * and returns the full analysis response.
 */

const express  = require("express");
const multer   = require("multer");
const axios    = require("axios");
const FormData = require("form-data");

const router = express.Router();

// Store uploaded files in memory (no disk I/O needed)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are accepted"));
    }
    cb(null, true);
  },
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:5000";

router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No image file provided" });
  }

  try {
    // Forward the image buffer to the Python AI service
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename:    req.file.originalname,
      contentType: req.file.mimetype,
    });

    const aiResponse = await axios.post(`${AI_SERVICE_URL}/analyze`, form, {
      headers: form.getHeaders(),
      timeout: 30000, // 30s — MediaPipe can be slow on first run
    });

    return res.json(aiResponse.data);
  } catch (err) {
    if (err.response) {
      // AI service returned an error response
      return res.status(err.response.status).json(err.response.data);
    }
    console.error("AI service unreachable:", err.message);
    return res.status(502).json({ error: "AI service unavailable" });
  }
});

// Multer error handler
router.use((err, req, res, next) => {
  if (err.message) return res.status(400).json({ error: err.message });
  next(err);
});

module.exports = router;
