import asyncHandler from "express-async-handler";
import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import { publicNotification } from "../utils/createNotification.js";

const unreadCountOf = (userId) => Notification.countDocuments({ user: userId, read: false });

// @desc  My notifications (newest first) + how many are unread
// @route GET /api/notifications?limit=30
export const listNotifications = asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);
  const [docs, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id }).sort({ sortAt: -1 }).limit(limit).lean(),
    unreadCountOf(req.user._id),
  ]);
  res.status(200).json({ success: true, unreadCount, notifications: docs.map(publicNotification) });
});

// @desc  Mark as read: body { ids: [...] } for some, or no body for all of mine
// @route PATCH /api/notifications/read
export const markRead = asyncHandler(async (req, res) => {
  const filter = { user: req.user._id, read: false };
  if (Array.isArray(req.body?.ids)) {
    filter._id = { $in: req.body.ids.filter((id) => mongoose.isValidObjectId(id)) };
  }
  await Notification.updateMany(filter, { $set: { read: true } });
  res.status(200).json({ success: true, unreadCount: await unreadCountOf(req.user._id) });
});

// @desc  Remove one notification (only ever mine)
// @route DELETE /api/notifications/:id
export const deleteNotification = asyncHandler(async (req, res) => {
  if (mongoose.isValidObjectId(req.params.id)) {
    await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
  }
  res.status(200).json({ success: true, unreadCount: await unreadCountOf(req.user._id) });
});

// @desc  Clear all of my notifications
// @route DELETE /api/notifications
export const clearNotifications = asyncHandler(async (req, res) => {
  await Notification.deleteMany({ user: req.user._id });
  res.status(200).json({ success: true, unreadCount: 0 });
});
