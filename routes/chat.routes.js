const router = require("express").Router();
const protect = require("../middlewares/protect");
const Conversation = require("../models/conversation.model");
const Message = require("../models/message.model");
const User = require("../models/user.models");

router.get("/conversations", protect, async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "firstName lastName profileImage role")
      .sort({ "lastMessage.createdAt": -1, updatedAt: -1 });

    const result = conversations.map((conv) => {
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== userId
      );

      const unreadCount = 0;

      return {
        _id: conv._id,
        otherUser: otherUser || null,
        lastMessage: conv.lastMessage || null,
        unreadCount,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    const unreadCounts = await Message.aggregate([
      { $match: { receiver: new (require("mongoose").Types.ObjectId)(userId), read: false } },
      { $group: { _id: "$conversation", count: { $sum: 1 } } },
    ]);

    const unreadMap = {};
    unreadCounts.forEach((item) => {
      unreadMap[item._id.toString()] = item.count;
    });

    result.forEach((conv) => {
      conv.unreadCount = unreadMap[conv._id.toString()] || 0;
    });

    res.json({ success: true, conversations: result });
  } catch (error) {
    console.error("get conversations error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/conversations/:conversationId/messages", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Not a participant" });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [messages, total] = await Promise.all([
      Message.find({ conversation: conversationId })
        .populate("sender", "firstName lastName profileImage")
        .populate("receiver", "firstName lastName profileImage")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Message.countDocuments({ conversation: conversationId }),
    ]);

    res.json({
      success: true,
      messages: messages.reverse(),
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + parseInt(limit) < total,
      },
    });
  } catch (error) {
    console.error("get messages error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/conversations/:userId/unread-count", protect, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { userId: otherUserId } = req.params;

    const conversation = await Conversation.findOne({
      participants: { $all: [currentUserId, otherUserId] },
    });

    if (!conversation) {
      return res.json({ success: true, unreadCount: 0 });
    }

    const count = await Message.countDocuments({
      conversation: conversation._id,
      receiver: currentUserId,
      read: false,
    });

    res.json({ success: true, unreadCount: count });
  } catch (error) {
    console.error("get unread count error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/users/:userId/online", protect, async (req, res) => {
  try {
    const { userId } = req.params;
    const online = false;

    res.json({ success: true, online, lastSeen: null });
  } catch (error) {
    console.error("get user status error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ── Enhanced Chat Routes (chatting_db) ──

const ChatService = require("../services/chat/ChatService");

router.get("/v2/conversations", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await ChatService.getConversations(userId);

    const result = conversations.map((conv) => {
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== userId
      );

      return {
        _id: conv._id,
        otherUser: otherUser || null,
        lastMessage: conv.lastMessage || null,
        lastMessageAt: conv.lastMessageAt,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      };
    });

    res.json({ success: true, conversations: result });
  } catch (error) {
    console.error("get conversations v2 error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v2/conversations/:conversationId/messages", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const conversation = await ChatService.getConversationById(conversationId);

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === userId
    );

    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Not a participant" });
    }

    const result = await ChatService.getMessages(conversationId, {
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error("get messages v2 error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/v2/conversations/:conversationId/unread", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId } = req.params;

    const count = await ChatService.getUnreadCount(conversationId, userId);

    res.json({ success: true, unreadCount: count });
  } catch (error) {
    console.error("get unread count v2 error:", error.message);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
