import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { createNotification, publicNotification } from "./createNotification.js";
import { getIO } from "../socket/index.js";

// Push the saved notification to the person's open tabs (their personal socket room).
const pushLive = (userId, notification) => {
  try {
    getIO().to(String(userId)).emit("notification:new", publicNotification(notification));
  } catch (err) {
    // socket server not ready — the notification is still saved and shows up on the next load
  }
};

// Save + push ONE notification. `pref` = a key of the user's notificationPrefs
// ("requestUpdates" / "newRequests"); if they switched it off, nothing is created.
// Never throws: a notification problem must not break the request that caused it.
export async function notifyUser(userId, payload, { pref } = {}) {
  try {
    if (pref) {
      const user = await User.findById(userId).select("notificationPrefs").lean();
      if (!user || user.notificationPrefs?.[pref] === false) return null;
    }
    const saved = await createNotification(userId, payload);
    pushLive(userId, saved);
    return saved;
  } catch (err) {
    console.error("notify error:", err.message);
    return null;
  }
}

// Same notification for many people (caller has already filtered who should get it).
export async function notifyMany(userIds, payload) {
  try {
    if (!userIds || userIds.length === 0) return [];
    const now = new Date();
    const saved = await Notification.insertMany(userIds.map((user) => ({ user, sortAt: now, ...payload })));
    saved.forEach((doc) => pushLive(doc.user, doc));
    return saved;
  } catch (err) {
    console.error("notify error:", err.message);
    return [];
  }
}
