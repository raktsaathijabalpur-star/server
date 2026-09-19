import mongoose from "mongoose";

// "Support Jabalpur RaktSaathi" — someone tapped "I've Donated" after paying by
// bank transfer / QR. We can't confirm a bank transfer from inside the app, so
// every record starts as "pending". Once you see the money in the account,
// set status to "verified" (Mongo shell / Compass, or a future admin screen).
const supportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["bank", "qr"], required: true },
    status: { type: String, enum: ["pending", "verified", "rejected"], default: "pending" },
    // Did the person tick "Show my name on the Supporters page"?
    // false (or missing, for older records) -> listed as "Anonymous supporter".
    showName: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Support", supportSchema);
