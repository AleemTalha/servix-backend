const ChatService = require("./ChatService");
const MessageSyncService = require("./MessageSyncService");

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.onlineUsers = new Map();
  }

  registerHandlers(socket) {
    const userId = socket.userId;

    // Track online status
    this._addUserSocket(userId, socket.id);

    socket.on("join_conversation", async ({ conversationId }, callback) => {
      try {
        const conversation = await ChatService.getConversationById(
          conversationId
        );
        if (!conversation) {
          return callback?.({ error: "Conversation not found" });
        }

        const isParticipant = conversation.participants.some(
          (p) => p._id.toString() === userId || p.toString() === userId
        );

        if (!isParticipant) {
          return callback?.({ error: "Not a participant" });
        }

        socket.join(`conversation:${conversationId}`);

        const otherParticipant = conversation.participants.find((p) => {
          const pid = p._id ? p._id.toString() : p.toString();
          return pid !== userId;
        });

        const otherUserId = otherParticipant?._id
          ? otherParticipant._id.toString()
          : otherParticipant?.toString();

        const isOnline = this._isUserOnline(otherUserId);

        callback?.({ success: true, online: isOnline, otherUserId });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("send_message", async ({ receiverId, content, type }, callback) => {
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

        // Emit to conversation room
        this.io
          .to(`conversation:${conversation._id}`)
          .emit("new_message", {
            message,
            conversationId: conversation._id.toString(),
          });

        // Also emit directly to receiver if online but not in room
        const receiverSockets = this._getUserSockets(receiverId);
        if (receiverSockets.size > 0) {
          receiverSockets.forEach((socketId) => {
            const sock = this.io.sockets.sockets.get(socketId);
            if (sock && !sock.rooms.has(`conversation:${conversation._id}`)) {
              this.io.to(socketId).emit("new_message", {
                message,
                conversationId: conversation._id.toString(),
              });
            }
          });
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

        // Notify senders that messages were delivered
        const messages = await ChatService.getMessages(0, { limit: 0 });
        // We need to notify the original senders
        // This is handled via the conversation room
        callback?.({ success: true, modifiedCount: count });
      } catch (error) {
        callback?.({ error: error.message });
      }
    });

    socket.on("message_read", async ({ conversationId }, callback) => {
      try {
        if (!conversationId) {
          return callback?.({ error: "conversationId is required" });
        }

        const count = await MessageSyncService.markConversationRead(
          conversationId,
          userId
        );

        this.io.to(`conversation:${conversationId}`).emit("messages_read", {
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
      this._removeUserSocket(userId, socket.id);
    });

    // Trigger sync check on connect
    this._syncOnConnect(socket, userId);
  }

  async _syncOnConnect(socket, userId) {
    try {
      const undeliveredMessages =
        await MessageSyncService.syncUndeliveredMessages(userId);

      if (undeliveredMessages.length > 0) {
        socket.emit("undelivered_messages", {
          messages: undeliveredMessages,
        });

        const messageIds = undeliveredMessages.map((m) => m._id);
        await MessageSyncService.confirmDelivery(messageIds);
      }
    } catch (error) {
      console.error("Sync on connect error:", error.message);
    }
  }

  _addUserSocket(userId, socketId) {
    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.set(userId, new Set());
    }
    this.onlineUsers.get(userId).add(socketId);

    // Only emit if this is the first socket for this user
    if (this.onlineUsers.get(userId).size === 1) {
      this.io.emit("user_online", { userId });
    }
  }

  _removeUserSocket(userId, socketId) {
    if (this.onlineUsers.has(userId)) {
      this.onlineUsers.get(userId).delete(socketId);
      if (this.onlineUsers.get(userId).size === 0) {
        this.onlineUsers.delete(userId);
        this.io.emit("user_offline", { userId });
      }
    }
  }

  _getUserSockets(userId) {
    return this.onlineUsers.get(userId) || new Set();
  }

  _isUserOnline(userId) {
    return this.onlineUsers.has(userId) && this.onlineUsers.get(userId).size > 0;
  }
}

module.exports = SocketHandler;
