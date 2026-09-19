import mongoose from "mongoose";

// Bell notifications. Stored in the database so they are still there after a refresh
// or when the person was offline. Each one belongs to exactly one user.
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: [
        "request:new", // donor: a new request matches you
        "request:accepted", // patient: a donor accepted
        "request:fulfilled", // donor: the patient closed a request you accepted
        "request:cancelled", // donor: the patient cancelled
        "message", // someone sent you a chat message
        "support:verified", // your contribution was confirmed
        "support:new", // admin: someone reported a contribution to verify
      ],
      required: true,
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    // where the person goes when they click it, e.g. /requests?open=<id> or /messages?c=<id>
    link: { type: String, default: "" },
    read: { type: Boolean, default: false },
    // Notifications with the same key merge while unread (10 chat messages from one person = 1 entry)
    dedupeKey: { type: String },
    count: { type: Number, default: 1 },
    // what the list is sorted by (bumped when a merged notification gets a newer message)
    sortAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, sortAt: -1 });
notificationSchema.index({ user: 1, read: 1 });
notificationSchema.index({ user: 1, dedupeKey: 1, read: 1 });
// old notifications clean themselves up after 60 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

export default mongoose.model("Notification", notificationSchema);
