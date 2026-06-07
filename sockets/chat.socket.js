const jwt = require("jsonwebtoken");
const { redisClient } = require("../config/redis");
const User = require("../models/user.models");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const admin = require("../config/firebase");
const ChatService = require("../services/chat/ChatService");
const MessageSyncService = require("../services/chat/MessageSyncService");

const onlineUsers = new Map();

const getConversation = async (userId, otherUserId) => {
  let conversation = await Conversation.findOne({
    participants: { $all: [userId, otherUserId] },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [userId, otherUserId],
    });
  }

  return conversation;
};

const sendPushNotification = async (userId, senderName, messageText, conversationId, senderId) => {
  try {
    const user = await User.findById(userId).select("fcmToken");

    if (!user || !user.fcmToken || user.fcmToken.length === 0) return;

    const message = {
      notification: {
        title: senderName,
        body: messageText,
      },
      data: {
        screen: "/messages",
        conversationId: conversationId.toString(),
        senderId: senderId.toString(),
        senderName: senderName,
        type: "new_message",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "servix_action_channel",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: senderName,
              body: messageText,
            },
            category: "MESSAGE_ACTIONS",
            contentAvailable: true,
          },
        },
      },
      tokens: user.fcmToken,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((res, index) => {
      if (!res.success) {
        const code = res.error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(user.fcmToken[index]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await User.findByIdAndUpdate(userId, {
        $pull: { fcmToken: { $in: invalidTokens } },
      });
    }
  } catch (error) {
    console.error("sendPushNotification error:", error.message);
  }
};

const initializeSocket = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const sessionKey = `session:${decoded.id}`;
      const sessionData = await redisClient.get(sessionKey);

      if (!sessionData) {
        return next(new Error("Session expired"));
      }

      const user = await User.findById(decoded.id).select("firstName lastName email profileImage role");

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token expired"));
      }
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;

    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    io.emit("user_online", { userId });

    // Offline message sync (WhatsApp-style)
    _syncUndeliveredMessages(socket, userId);

    socket.on("join_conversation", async ({ conversationId }, callback) => {
      try {
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          return callback?.({ error: "Conversation not found" });
        }

        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userId
        );

        if (!isParticipant) {
          return callback?.({ error: "Not a participant" });
        }

        socket.join(`conversation:${conversationId}`);

        const otherParticipant = conversation.participants.find(
          (p) => p.toString() !== userId
        );

        const onlineStatus = onlineUsers.has(otherParticipant?.toString()) &&
          onlineUsers.get(otherParticipant.toString()).size > 0;

        callback?.({ success: true, online: onlineStatus });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("leave_conversation", ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on("send_message", async ({ receiverId, message }, callback) => {
      try {
        if (!receiverId || !message?.trim()) {
          return callback?.({ error: "receiverId and message are required" });
        }

        const receiver = await User.findById(receiverId);

        if (!receiver) {
          return callback?.({ error: "Receiver not found" });
        }

        const conversation = await getConversation(userId, receiverId);

        const newMessage = await Message.create({
          conversation: conversation._id,
          sender: userId,
          receiver: receiverId,
          message: message.trim(),
        });

        conversation.lastMessage = {
          text: message.trim(),
          sender: userId,
          createdAt: newMessage.createdAt,
        };

        await conversation.save();

        const populatedMessage = await Message.findById(newMessage._id)
          .populate("sender", "firstName lastName profileImage")
          .populate("receiver", "firstName lastName profileImage");

        const senderName = socket.user.firstName || "User";

        io.to(`conversation:${conversation._id}`).emit("new_message", {
          message: populatedMessage,
          conversationId: conversation._id.toString(),
        });

        const isReceiverOnline = onlineUsers.has(receiverId) &&
          onlineUsers.get(receiverId).size > 0;

        if (!isReceiverOnline) {
          sendPushNotification(
            receiverId,
            senderName,
            message.trim(),
            conversation._id,
            userId
          );
        }

        callback?.({
          success: true,
          message: populatedMessage,
          conversationId: conversation._id.toString(),
        });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("mark_read", async ({ conversationId }, callback) => {
      try {
        if (!conversationId) {
          return callback?.({ error: "conversationId is required" });
        }

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
          return callback?.({ error: "Conversation not found" });
        }

        const isParticipant = conversation.participants.some(
          (p) => p.toString() === userId
        );

        if (!isParticipant) {
          return callback?.({ error: "Not a participant" });
        }

        const result = await Message.updateMany(
          { conversation: conversationId, receiver: userId, read: false },
          { read: true, readAt: new Date() }
        );

        io.to(`conversation:${conversationId}`).emit("messages_read", {
          conversationId,
          readBy: userId,
          readAt: new Date(),
        });

        callback?.({ success: true, modifiedCount: result.modifiedCount });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("typing", ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit("typing", {
        conversationId,
        userId,
      });
    });

    socket.on("stop_typing", ({ conversationId }) => {
      socket.to(`conversation:${conversationId}`).emit("stop_typing", {
        conversationId,
        userId,
      });
    });

    // ── Enhanced Events (chatting_db) ──

    socket.on("send_message_v2", async ({ receiverId, content, type }, callback) => {
      try {
        if (!receiverId || !content?.trim()) {
          return callback?.({ error: "receiverId and content are required" });
        }

        const conversation = await ChatService.getOrCreateConversation(
          userId,
          receiverId
        );

        const message = await ChatService.createMessage({
          conversationId: conversation._id,
          senderId: userId,
          receiverId,
          content: content.trim(),
          type: type || "text",
        });

        io.to(`conversation:${conversation._id}`).emit("new_message_v2", {
          message,
          conversationId: conversation._id.toString(),
        });

        const isReceiverOnline = onlineUsers.has(receiverId) &&
          onlineUsers.get(receiverId).size > 0;

        if (!isReceiverOnline) {
          const senderName = socket.user.firstName || "User";
          const convId = conversation._id;
          _sendPushNotification(receiverId, senderName, content.trim(), convId, userId);
        }

        callback?.({
          success: true,
          message,
          conversationId: conversation._id.toString(),
        });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("message_delivered", async ({ messageIds }, callback) => {
      try {
        if (!messageIds || !Array.isArray(messageIds)) {
          return callback?.({ error: "messageIds array is required" });
        }

        const count = await MessageSyncService.confirmDelivery(messageIds);

        callback?.({ success: true, modifiedCount: count });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("message_read_v2", async ({ conversationId }, callback) => {
      try {
        if (!conversationId) {
          return callback?.({ error: "conversationId is required" });
        }

        const count = await MessageSyncService.markConversationRead(
          conversationId,
          userId
        );

        io.to(`conversation:${conversationId}`).emit("messages_read_v2", {
          conversationId,
          readBy: userId,
          readAt: new Date(),
        });

        callback?.({ success: true, modifiedCount: count });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("typing_indicator", ({ conversationId, isTyping }) => {
      socket.to(`conversation:${conversationId}`).emit("typing_indicator", {
        conversationId,
        userId,
        isTyping,
      });
    });

    socket.on("disconnect", () => {
      if (onlineUsers.has(userId)) {
        onlineUsers.get(userId).delete(socket.id);

        if (onlineUsers.get(userId).size === 0) {
          onlineUsers.delete(userId);
          io.emit("user_offline", { userId });
        }
      }
    });
  });
};

async function _syncUndeliveredMessages(socket, userId) {
  try {
    const undeliveredMessages = await MessageSyncService.syncUndeliveredMessages(userId);
    if (undeliveredMessages.length > 0) {
      socket.emit("undelivered_messages", { messages: undeliveredMessages });

      const messageIds = undeliveredMessages.map((m) => m._id);
      await MessageSyncService.confirmDelivery(messageIds);
    }
  } catch (error) {
    console.error("Sync undelivered messages error:", error.message);
  }
}

async function _sendPushNotification(receiverId, senderName, content, conversationId, senderId) {
  try {
    const user = await User.findById(receiverId).select("fcmToken");
    if (!user || !user.fcmToken || user.fcmToken.length === 0) return;

    const message = {
      notification: {
        title: senderName,
        body: content,
      },
      data: {
        screen: "/messages",
        conversationId: conversationId.toString(),
        senderId: senderId.toString(),
        senderName: senderName,
        type: "new_message",
      },
      android: {
        priority: "high",
        notification: {
          channelId: "servix_action_channel",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title: senderName, body: content },
            category: "MESSAGE_ACTIONS",
            contentAvailable: true,
          },
        },
      },
      tokens: user.fcmToken,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((res, index) => {
      if (!res.success) {
        const code = res.error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(user.fcmToken[index]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      await User.findByIdAndUpdate(receiverId, {
        $pull: { fcmToken: { $in: invalidTokens } },
      });
    }
  } catch (error) {
    console.error("sendPushNotification error:", error.message);
  }
}

module.exports = initializeSocket;
