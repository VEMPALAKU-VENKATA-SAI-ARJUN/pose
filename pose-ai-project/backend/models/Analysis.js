/**
 * Analysis.js — Mongoose model for pose analysis results
 */
const mongoose = require("mongoose");

const JointAngleSchema = new mongoose.Schema({
  joint:   { type: String, required: true },   // e.g. "left_elbow"
  angle:   { type: Number, required: true },   // degrees
  flagged: { type: Boolean, default: false },  // true = outside ideal range
}, { _id: false });

const AnalysisSchema = new mongoose.Schema({
  imagePath:    { type: String, required: true },  // disk path saved by Multer
  originalName: { type: String },
  isSketch:     { type: Boolean, default: false },
  poseDetected: { type: Boolean, default: false },
  confidence:   { type: Number,  default: 0 },
  angles:       [JointAngleSchema],
  feedback:     [String],                          // plain-English messages
  errors:       { type: mongoose.Schema.Types.Mixed, default: [] },
  rawKeypoints: { type: mongoose.Schema.Types.Mixed, default: [] },
  createdAt:    { type: Date, default: Date.now },
});

module.exports = mongoose.model("Analysis", AnalysisSchema);
