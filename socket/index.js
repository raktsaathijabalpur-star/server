import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { createNotification, publicNotification } from "../utils/createNotification.js";

// userId -> Set of socket ids (a user can have multiple tabs/devices open)
const onlineUsers = new Map();

let io;

// ---- helpers that keep chat data between the two people who are actually chatting ----

// ids of everybody who shares a conversation with this user
async function chatPartnerIds(userId) {
  const conversations = await Conversation.find({ participants: userId }).select("participants").lean();
  const ids = new Set();
  for (const c of conversations) {
    for (const p of c.participants) if (String(p) !== String(userId)) ids.add(String(p));
  }
  return [...ids];
}

// online / offline is only told to people this user chats with (not the whole app)
async function announcePresence(userId, online) {
  try {
    const partners = await chatPartnerIds(userId);
    if (partners.length > 0) io.to(partners).emit("presence:update", { userId, online });
  } catch (err) {
    console.error("presence error:", err.message);
  }
}

// "typing…" may only go to the other person of a conversation the sender belongs to.
// Results are cached for a minute so typing doesn't hit the database on every key press.
const TYPING_TTL_MS = 60 * 1000;
const typingAllowed = new Map();
async function canType(userId, conversationId, otherUserId) {
  if (typeof conversationId !== "string" || typeof otherUserId !== "string") return false;
  const key = `${conversationId}:${userId}:${otherUserId}`;
  const until = typingAllowed.get(key);
  if (until && until > Date.now()) return true;
  try {
    const ok = await Conversation.exists({
      _id: conversationId,
      participants: { $all: [userId, otherUserId] },
    });
    if (!ok) return false;
    if (typingAllowed.size > 5000) typingAllowed.clear();
    typingAllowed.set(key, Date.now() + TYPING_TTL_MS);
    return true;
  } catch (err) {
    return false; // malformed id etc.
  }
}

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // Auth middleware — same JWT that's used for REST requests
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token provided"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("_id name role bloodGroup");
      if (!user) return next(new Error("User not found"));

      socket.userId = user._id.toString();
      socket.userName = user.name;
      socket.userRole = user.role;
      socket.bloodGroup = user.bloodGroup;
      next();
    } catch (err) {
      next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    const { userId } = socket;

    // Track this user as online and put them in a personal room
    // so we can push events to them by userId without tracking socket ids elsewhere.
    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);
    socket.join(userId);

    // Donors also join a room for their blood group, so a new blood request can
    // be pushed only to donors who are able to give to that patient.
    if (socket.userRole === "donor" && socket.bloodGroup) {
      socket.join(`donor:${socket.bloodGroup}`);
    }

    announcePresence(userId, true);

    socket.on("message:send", async ({ conversationId, text } = {}, callback) => {
      try {
        if (typeof conversationId !== "string" || typeof text !== "string" || !text.trim() || text.length > 2000) {
          return callback?.({ ok: false, error: "Message can't be empty or longer than 2000 characters" });
        }
        const conversation = await Conversation.findById(conversationId);
        if (!conversation || !conversation.participants.map(String).includes(userId)) {
          return callback?.({ ok: false, error: "Conversation not found" });
        }

        const message = await Message.create({
          conversation: conversationId,
          sender: userId,
          text,
          readBy: [userId],
        });

        conversation.lastMessage = text;
        conversation.lastMessageAt = new Date();
        const otherId = conversation.participants.find((p) => String(p) !== userId);
        const prevCount = conversation.unreadCounts.get(String(otherId)) || 0;
        conversation.unreadCounts.set(String(otherId), prevCount + 1);
        await conversation.save();

        const populated = await message.populate("sender", "name");

        // Emit to both participants' personal rooms
        conversation.participants.forEach((p) => {
          io.to(String(p)).emit("message:new", {
            conversationId,
            message: populated,
          });
        });

        // Bell notification for the other person. Several messages from the same person
        // merge into ONE unread notification (with a count) instead of flooding the bell.
        try {
          const snippet = text.trim().length > 80 ? `${text.trim().slice(0, 80)}…` : text.trim();
          const saved = await createNotification(otherId, {
            type: "message",
            title: `New message from ${socket.userName}`,
            body: `${socket.userName}: ${snippet}`,
            link: `/messages?c=${conversationId}`,
            dedupeKey: `message:${conversationId}`,
          });
          io.to(String(otherId)).emit("notification:new", publicNotification(saved));
        } catch (err) {
          console.error("message notification error:", err.message);
        }

        callback?.({ ok: true, message: populated });
      } catch (err) {
        console.error(err);
        callback?.({ ok: false, error: "Failed to send message" });
      }
    });

    socket.on("typing", async ({ conversationId, otherUserId, isTyping } = {}) => {
      if (!(await canType(userId, conversationId, otherUserId))) return;
      io.to(otherUserId).emit("typing", { conversationId, userId, isTyping: Boolean(isTyping) });
    });

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          announcePresence(userId, false);
        }
      }
    });
  });

  return io;
}

export function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

export function isUserOnline(userId) {
  return onlineUsers.has(String(userId));
}
