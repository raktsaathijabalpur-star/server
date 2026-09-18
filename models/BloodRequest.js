import mongoose from "mongoose";
import { BLOOD_GROUP_ENUM } from "./User.js";

export const URGENCY_LEVELS = ["Emergency", "Urgent", "Normal"];
export const REQUEST_STATUSES = ["Open", "Accepted", "Fulfilled", "Cancelled"];

// Lower number = more urgent. Stored on the document so Mongo can sort by it
// (sorting by the urgency *string* would order Emergency, Normal, Urgent).
const URGENCY_RANK = { Emergency: 0, Urgent: 1, Normal: 2 };

const bloodRequestSchema = new mongoose.Schema(
  {
    // Human-friendly unique ID, e.g. REQ-2026-000124
    requestId: {
      type: String,
      unique: true,
      sparse: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    patientName: {
      type: String,
      required: [true, "Patient name is required"],
      trim: true,
    },
    bloodGroup: {
      type: String,
      enum: BLOOD_GROUP_ENUM,
      required: true,
    },
    unitsRequired: {
      type: Number,
      required: true,
      min: 1,
    },
    urgency: {
      type: String,
      enum: URGENCY_LEVELS,
      default: "Normal",
    },
    urgencyRank: {
      type: Number,
      default: 2,
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      default: "Jabalpur",
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    // "Required Date" on the request form. Not marked `required` here so older
    // documents created before this field existed can still be saved.
    requiredBy: {
      type: Date,
    },
    // Open      -> "Finding Donors…"
    // Accepted  -> at least one donor pressed "I Can Donate"
    // Fulfilled -> patient marked it done (this is what feeds donation history)
    // Cancelled -> patient cancelled it
    status: {
      type: String,
      enum: REQUEST_STATUSES,
      default: "Open",
    },
    helpers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        respondedAt: { type: Date, default: Date.now },
      },
    ],
    fulfilledAt: { type: Date },
    cancelledAt: { type: Date },
  },
  { timestamps: true }
);

bloodRequestSchema.pre("validate", function setUrgencyRank(next) {
  this.urgencyRank = URGENCY_RANK[this.urgency] ?? 2;
  next();
});

bloodRequestSchema.index({ bloodGroup: 1, status: 1 });
bloodRequestSchema.index({ city: 1, status: 1 });
bloodRequestSchema.index({ status: 1, urgencyRank: 1, createdAt: -1 });
bloodRequestSchema.index({ requestedBy: 1, createdAt: -1 });
bloodRequestSchema.index({ "helpers.user": 1 });

export default mongoose.model("BloodRequest", bloodRequestSchema);
