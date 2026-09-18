import mongoose from "mongoose";

// Tiny helper collection used to generate sequential, race-condition-free IDs
// (e.g. REQ-2026-000124). One document per counter name, e.g. "request-2026".
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

export default mongoose.model("Counter", counterSchema);
