import mongoose from "mongoose";

// One document = one donation by one donor.
// Created automatically when a patient marks a request as Fulfilled
// (source: "request"), or manually by the donor from the Donations page
// (source: "manual").
const donationSchema = new mongoose.Schema(
  {
    donor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    request: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BloodRequest",
    },
    requestId: { type: String }, // REQ-2026-000124, copied for easy display
    source: {
      type: String,
      enum: ["request", "manual"],
      default: "manual",
    },
    bloodGroup: { type: String },
    // Hospital / blood bank name (kept as `location` to match the frontend)
    location: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

donationSchema.index({ donor: 1, date: -1 });
// A donor can only be credited once per request.
donationSchema.index(
  { donor: 1, request: 1 },
  { unique: true, partialFilterExpression: { request: { $type: "objectId" } } }
);

export default mongoose.model("Donation", donationSchema);
