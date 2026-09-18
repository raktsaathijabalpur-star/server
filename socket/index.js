import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";

// userId -> Set of socket ids (a user can have multiple tabs/devices open)
const onlineUsers = new Map();

let io;

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

    io.emit("presence:update", { userId, online: true });

    socket.on("message:send", async ({ conversationId, text }, callback) => {
      try {
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

        callback?.({ ok: true, message: populated });
      } catch (err) {
        console.error(err);
        callback?.({ ok: false, error: "Failed to send message" });
      }
    });

    socket.on("typing", ({ conversationId, otherUserId, isTyping }) => {
      io.to(otherUserId).emit("typing", { conversationId, userId, isTyping });
    });

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          io.emit("presence:update", { userId, online: false });
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
