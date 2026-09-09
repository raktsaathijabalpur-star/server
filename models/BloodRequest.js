import mongoose from "mongoose";
import { BLOOD_GROUP_ENUM } from "./User.js";

const bloodRequestSchema = new mongoose.Schema(
  {
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
      enum: ["Emergency", "Urgent", "Normal"],
      default: "Normal",
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
    status: {
      type: String,
      enum: ["Open", "Fulfilled", "Cancelled"],
      default: "Open",
    },
    helpers: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        respondedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

bloodRequestSchema.index({ bloodGroup: 1, status: 1 });
bloodRequestSchema.index({ city: 1, status: 1 });

export default mongoose.model("BloodRequest", bloodRequestSchema);
