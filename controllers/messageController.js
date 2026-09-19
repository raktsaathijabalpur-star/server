import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import { withAvatarUrls } from "../utils/avatarUrl.js";
import { isUserOnline } from "../socket/index.js";

// GET /api/conversations — list current user's conversations with other participant + last message
export const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await Conversation.find({ participants: userId })
      .populate("participants", "name bloodGroup city")
      .sort({ lastMessageAt: -1 });

    const formatted = conversations.map((c) => {
      const other = c.participants.find((p) => String(p._id) !== String(userId));
      return {
        _id: c._id,
        otherUser: other,
        lastMessage: c.lastMessage,
        lastMessageAt: c.lastMessageAt,
        unreadCount: c.unreadCounts.get(String(userId)) || 0,
        online: other ? isUserOnline(other._id) : false,
      };
    });

    // give each chat partner a small avatar URL (or "" when they have no photo)
    const others = formatted
      .map((f) => f.otherUser)
      .filter(Boolean)
      .map((o) => ({ _id: o._id, name: o.name, bloodGroup: o.bloodGroup, city: o.city }));
    const byId = new Map((await withAvatarUrls(others)).map((o) => [String(o._id), o]));
    formatted.forEach((f) => {
      if (f.otherUser) f.otherUser = byId.get(String(f.otherUser._id));
    });

    res.json({ conversations: formatted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
};

// POST /api/conversations — find or create a conversation with another user
export const startConversation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { otherUserId } = req.body;
    if (!otherUserId || !mongoose.isValidObjectId(otherUserId)) {
      return res.status(400).json({ message: "A valid otherUserId is required" });
    }
    if (String(otherUserId) === String(userId)) {
      return res.status(400).json({ message: "You can't start a chat with yourself" });
    }
    if (!(await User.exists({ _id: otherUserId }))) {
      return res.status(404).json({ message: "User not found" });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [userId, otherUserId], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({ participants: [userId, otherUserId] });
    }

    res.json({ conversation });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to start conversation" });
  }
};

// GET /api/conversations/:id/messages — paginated message history
export const getMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { before } = req.query;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100); // 1..100

    // a malformed id can never match a conversation of yours
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation || !conversation.participants.map(String).includes(String(userId))) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const query = { conversation: id };
    if (before) {
      const beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) return res.status(400).json({ message: "Invalid 'before' date" });
      query.createdAt = { $lt: beforeDate };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("sender", "name");

    // Mark as read + reset unread counter for this user
    conversation.unreadCounts.set(String(userId), 0);
    await conversation.save();
    await Message.updateMany(
      { conversation: id, readBy: { $ne: userId } },
      { $push: { readBy: userId } }
    );

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};