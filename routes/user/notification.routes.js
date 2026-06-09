const router = require("express").Router();
const protect = require("../../middlewares/protect");
const Notification = require("../../models/notification.models");

router.use(protect);

router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const notifications = await Notification.find({ recipient: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Notification.countDocuments({ recipient: userId });

    return res.status(200).json({
      success: true,
      notifications,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[notifications]", err.message);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.patch("/read-all", async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true }
    );
    return res.status(200).json({ success: true, message: "All marked as read" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

module.exports = router;