import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
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
    if (!otherUserId) return res.status(400).json({ message: "otherUserId is required" });

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
    const { before, limit = 30 } = req.query;

    const conversation = await Conversation.findById(id);
    if (!conversation || !conversation.participants.map(String).includes(String(userId))) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    const query = { conversation: id };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
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