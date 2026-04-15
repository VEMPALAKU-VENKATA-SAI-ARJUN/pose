/**
 * Pose.js — Mongoose schema for the Static Pose Library
 */
const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
  gender:   { type: String, enum: ["male", "female", "neutral"], required: true },
  imageUrl: { type: String, required: true },
}, { _id: false });

const poseSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  imageUrl:    { type: String, required: true },
  category:    { type: String, required: true, index: true },
  tags:        { type: [String], default: [], index: true },
  difficulty:  { type: String, enum: ["beginner", "intermediate", "advanced"], required: true },
  gender:      { type: String, enum: ["male", "female", "neutral"], default: "neutral", index: true },
  bodyType:    { type: String, enum: ["slim", "muscular", "heavy", "any"], default: "any" },
  cameraAngle: { type: String, enum: ["front", "side", "top", "low"], default: "front", index: true },
  variants:    { type: [variantSchema], default: [] },
  createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  isApproved:  { type: Boolean, default: true },
  likes:       { type: Number, default: 0 },
  views:       { type: Number, default: 0 },
}, { timestamps: true });

// Text index for search across title + tags + category
poseSchema.index({ title: "text", tags: "text", category: "text" });

module.exports = mongoose.model("Pose", poseSchema);
