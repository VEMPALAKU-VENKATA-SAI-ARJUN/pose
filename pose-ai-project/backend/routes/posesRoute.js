/**
 * posesRoute.js
 * GET /api/poses/random          — random pose from dataset
 * GET /api/poses/random?category — filtered by category
 * GET /api/poses                 — full dataset
 */

const express = require("express");
const router  = express.Router();
const poses   = require("../../frontend/src/data/poseDataset.json");

// GET /api/poses
router.get("/", (_req, res) => res.json(poses));

// GET /api/poses/random?category=gesture&difficulty=medium
router.get("/random", (req, res) => {
  const { category, difficulty } = req.query;
  let pool = [...poses];
  if (category)   pool = pool.filter(p => p.category   === category);
  if (difficulty) pool = pool.filter(p => p.difficulty === difficulty);
  if (!pool.length) pool = poses; // fallback to full set
  const pick = pool[Math.floor(Math.random() * pool.length)];
  res.json(pick);
});

module.exports = router;
