import mongoose from "mongoose";


const supportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["bank", "qr"], required: true },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    reviewedAt: { type: Date },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    showName: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Support", supportSchema);
