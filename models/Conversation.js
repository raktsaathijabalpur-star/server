import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    ],
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
    // Per-user unread counters, keyed by userId string
    unreadCounts: {
      type: Map,
      of: Number,
      default: {},
    },
  },
  { timestamps: true }
);

conversationSchema.index({ participants: 1 });

export default mongoose.model("Conversation", conversationSchema);