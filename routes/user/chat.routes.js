const router = require("express").Router();
const protect = require("../../middlewares/protect");
const Conversation = require("../../models/conversation.models");
const Message = require("../../models/message.models");
const { decrypt } = require("../../utils/encryption");

router.get("/conversations", protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.user.id,
    })
      .populate("participants", "firstName lastName profileImage")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    const result = conversations.map((c) => {
      const other = c.participants.find(
        (p) => p._id.toString() !== req.user.id
      );
      return {
        _id: c._id,
        otherUser: {
          _id: other?._id,
          firstName: other?.firstName || "",
          lastName: other?.lastName || "",
          profileImage: other?.profileImage,
        },
        lastMessage: c.lastMessage
          ? { text: c.lastMessage.text, createdAt: c.lastMessage.createdAt }
          : null,
        updatedAt: c.updatedAt,
      };
    });

    res.json({ success: true, conversations: result });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/messages/:conversationId", protect, async (req, res) => {
  try {
    const conversation = await Conversation.findById(
      req.params.conversationId
    );
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Not found" });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.user.id
    );
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversation: req.params.conversationId,
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/start", protect, async (req, res) => {
  try {
    const { receiverId } = req.body;
    if (!receiverId) {
      return res.status(400).json({ success: false, message: "receiverId required" });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [req.user.id, receiverId], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [req.user.id, receiverId],
      });
    }

    res.json({ success: true, conversation: { _id: conversation._id } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
