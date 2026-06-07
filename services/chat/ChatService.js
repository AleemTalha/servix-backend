const ChatMessage = require("../../models/chat/message.model");
const ChatConversation = require("../../models/chat/conversation.model");

class ChatService {
  // ── Conversation ──

  async getOrCreateConversation(userId, otherUserId) {
    let conversation = await ChatConversation.findOne({
      participants: { $all: [userId, otherUserId] },
    });

    if (!conversation) {
      conversation = await ChatConversation.create({
        participants: [userId, otherUserId],
      });
    }

    return conversation;
  }

  async getConversations(userId) {
    const conversations = await ChatConversation.find({
      participants: userId,
    })
      .populate("participants", "firstName lastName profileImage role email")
      .populate("lastMessage")
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    return conversations;
  }

  async getConversationById(conversationId) {
    return ChatConversation.findById(conversationId)
      .populate("participants", "firstName lastName profileImage role email")
      .populate("lastMessage");
  }

  async updateConversationLastMessage(conversationId, messageId) {
    return ChatConversation.findByIdAndUpdate(conversationId, {
      lastMessage: messageId,
      lastMessageAt: new Date(),
    });
  }

  // ── Messages ──

  async createMessage({
    conversationId,
    senderId,
    receiverId,
    content,
    type = "text",
  }) {
    const message = await ChatMessage.create({
      conversationId,
      senderId,
      receiverId,
      content,
      type,
      status: "sent",
    });

    await this.updateConversationLastMessage(conversationId, message._id);

    return message.populate(["senderId", "receiverId"]);
  }

  async getMessages(conversationId, { page = 1, limit = 50 } = {}) {
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      ChatMessage.find({ conversationId })
        .populate("senderId", "firstName lastName profileImage")
        .populate("receiverId", "firstName lastName profileImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ChatMessage.countDocuments({ conversationId }),
    ]);

    return {
      messages: messages.reverse(),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + limit < total,
      },
    };
  }

  async getMessageById(messageId) {
    return ChatMessage.findById(messageId)
      .populate("senderId", "firstName lastName profileImage")
      .populate("receiverId", "firstName lastName profileImage");
  }

  // ── Status Updates ──

  async markAsDelivered(messageIds) {
    return ChatMessage.updateMany(
      { _id: { $in: messageIds }, status: "sent" },
      { status: "delivered" }
    );
  }

  async markAsRead(conversationId, userId) {
    const result = await ChatMessage.updateMany(
      {
        conversationId,
        receiverId: userId,
        status: { $ne: "read" },
      },
      { status: "read" }
    );

    return result.modifiedCount;
  }

  async getUndeliveredMessages(userId) {
    return ChatMessage.find({
      receiverId: userId,
      status: "sent",
    }).populate("senderId", "firstName lastName profileImage");
  }

  async getUnreadCount(conversationId, userId) {
    return ChatMessage.countDocuments({
      conversationId,
      receiverId: userId,
      status: { $ne: "read" },
    });
  }

  // ── Deletion ──

  async deleteForSender(messageId, userId) {
    return ChatMessage.findOneAndUpdate(
      { _id: messageId, senderId: userId },
      { isDeletedBySender: true }
    );
  }

  async deleteForReceiver(messageId, userId) {
    return ChatMessage.findOneAndUpdate(
      { _id: messageId, receiverId: userId },
      { isDeletedByReceiver: true }
    );
  }
}

module.exports = new ChatService();
