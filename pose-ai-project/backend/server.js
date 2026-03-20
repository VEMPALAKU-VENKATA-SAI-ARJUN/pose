/**
 * server.js  —  P.O.S.E Express Backend
 *
 * POST /api/analyze  — single image analysis
 * POST /api/compare  — reference vs drawing comparison
 */

const express  = require("express");
const cors     = require("cors");
const multer   = require("multer");
const axios    = require("axios");
const FormData = require("form-data");

const app  = express();
const PORT = process.env.PORT           || 3001;
const AI   = process.env.AI_SERVICE_URL || "http://localhost:5000";

app.use(cors());
app.use(express.json());

// ── Multer instances ──────────────────────────────────────────────────────────

const imageFilter = (_req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are accepted"));
  }
  cb(null, true);
};

const limits = { fileSize: 10 * 1024 * 1024 };

// Single-file upload (analyze)
const uploadSingle = multer({ storage: multer.memoryStorage(), limits, fileFilter: imageFilter })
  .single("file");

// Two-file upload (compare)
const uploadCompare = multer({ storage: multer.memoryStorage(), limits, fileFilter: imageFilter })
  .fields([
    { name: "reference_image", maxCount: 1 },
    { name: "drawing_image",   maxCount: 1 },
  ]);


// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Forward a request to the Flask AI service and pipe the response back.
 * Handles Flask 4xx/5xx, network errors, and timeouts uniformly.
 */
async function forwardToAI(res, path, buildForm) {
  try {
    const form = new FormData();
    buildForm(form);

    const aiResponse = await axios.post(`${AI}${path}`, form, {
      headers: form.getHeaders(),
      timeout: 60_000,
    });

    return res.status(aiResponse.status).json(aiResponse.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(
        err.response.data ?? { error: "AI service error" }
      );
    }
    if (err.request) {
      return res.status(502).json({ error: "AI service unavailable. Is Flask running on port 5000?" });
    }
    console.error("Unexpected error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}


// ── Health ────────────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));


// ── POST /api/analyze ─────────────────────────────────────────────────────────

app.post("/api/analyze", (req, res) => {
  uploadSingle(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No image file provided" });

    await forwardToAI(res, "/analyze", (form) => {
      form.append("file", req.file.buffer, {
        filename:    req.file.originalname,
        contentType: req.file.mimetype,
      });
    });
  });
});


// ── POST /api/compare ─────────────────────────────────────────────────────────

app.post("/api/compare", (req, res) => {
  uploadCompare(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const refFile  = req.files?.reference_image?.[0];
    const drawFile = req.files?.drawing_image?.[0];

    if (!refFile || !drawFile) {
      return res.status(400).json({
        error: "Both 'reference_image' and 'drawing_image' are required",
      });
    }

    await forwardToAI(res, "/compare", (form) => {
      form.append("reference_image", refFile.buffer, {
        filename:    refFile.originalname,
        contentType: refFile.mimetype,
      });
      form.append("drawing_image", drawFile.buffer, {
        filename:    drawFile.originalname,
        contentType: drawFile.mimetype,
      });
    });
  });
});


// ── Error handler ─────────────────────────────────────────────────────────────

app.use((err, _req, res, _next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large. Maximum is 10 MB." });
  }
  res.status(500).json({ error: err.message || "Unexpected server error" });
});


app.listen(PORT, () => {
  console.log(`P.O.S.E backend  →  http://localhost:${PORT}`);
  console.log(`AI service proxy →  ${AI}`);
});
