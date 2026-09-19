import Notification from "../models/Notification.js";

// The shape the frontend receives (REST + socket "notification:new")
export const publicNotification = (n) => ({
  _id: n._id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  read: n.read === true,
  count: n.count ?? 1,
  createdAt: n.sortAt ?? n.createdAt,
});

// Saves a notification. With `dedupeKey`, an UNREAD notification with the same key is updated
// (newer text, count + 1, moved to the top) instead of adding another row.
export async function createNotification(userId, { type, title, body, link = "", dedupeKey }) {
  const now = new Date();

  if (dedupeKey) {
    const merged = await Notification.findOneAndUpdate(
      { user: userId, dedupeKey, read: false },
      { $set: { type, title, body, link, sortAt: now }, $inc: { count: 1 } },
      { new: true }
    );
    if (merged) return merged;
  }

  return Notification.create({ user: userId, type, title, body, link, dedupeKey, sortAt: now });
}
