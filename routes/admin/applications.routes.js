const router = require("express").Router();
const Application = require("../../models/application.model");
const User = require("../../models/user.models");
const admin = require("../../config/firebase");

const sendNotification = async (tokens, title, body) => {
  if (!tokens?.length) return [];

  try {
    const res = await admin
      .messaging()
      .sendEachForMulticast({ notification: { title, body }, tokens });
    return res.responses
      .map((r, i) =>
        !r.success &&
        [
          "messaging/invalid-registration-token",
          "messaging/registration-token-not-registered",
        ].includes(r.error?.code)
          ? tokens[i]
          : null,
      )
      .filter(Boolean);
  } catch (err) {
    console.error("sendNotification error:", err.message);
    return [];
  }
};

const removeInvalidTokens = async (userId, tokens) => {
  if (tokens.length > 0) {
    await User.findByIdAndUpdate(userId, {
      $pull: { fcmTokens: { $in: tokens } },
    });
  }
};

router.patch("/:id/approve", async (req, res) => {
  try {
    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Application not found" });

    if (!["pending", "resubmitted"].includes(app.applicationStatus)) {
      return res
        .status(400)
        .json({ message: `Application is already ${app.applicationStatus}` });
    }

    app.applicationStatus = "approved";
    app.reviewedAt = new Date();
    app.reviewedBy = req.user.id;
    if (req.body.adminNotes) app.adminNotes = req.body.adminNotes;
    await app.save();

    const user = await User.findById(app.userId);
    if (user?.fcmTokens?.length) {
      const invalid = await sendNotification(
        user.fcmTokens,
        "Application Approved! 🎉",
        "Congratulations! You are now a verified service provider on Servix.",
      );
      await removeInvalidTokens(user._id, invalid);
    }

    return res
      .status(200)
      .json({
        message: "Application approved and user notified",
        applicationId: app._id,
      });
  } catch (err) {
    console.error("approve error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:id/reject", async (req, res) => {
  try {
    const { rejectionReason, adminNotes } = req.body;
    if (!rejectionReason)
      return res.status(400).json({ message: "rejectionReason is required" });

    const app = await Application.findById(req.params.id);
    if (!app) return res.status(404).json({ message: "Application not found" });

    if (!["pending", "resubmitted"].includes(app.applicationStatus)) {
      return res
        .status(400)
        .json({ message: `Application is already ${app.applicationStatus}` });
    }

    app.applicationStatus = "rejected";
    app.rejectionReason = rejectionReason;
    app.reviewedAt = new Date();
    app.reviewedBy = req.user.id;
    if (adminNotes) app.adminNotes = adminNotes;
    await app.save();

    const user = await User.findById(app.userId);
    if (user?.fcmTokens?.length) {
      const invalid = await sendNotification(
        user.fcmTokens,
        "Application Update",
        "Your service provider application was not approved. Open the app to see the reason and resubmit.",
      );
      await removeInvalidTokens(user._id, invalid);
    }

    return res
      .status(200)
      .json({
        message: "Application rejected and user notified",
        applicationId: app._id,
      });
  } catch (err) {
    console.error("reject error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { applicationStatus: status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [apps, total] = await Promise.all([
      Application.find(filter)
        .populate("userId", "name email avatarUrl")
        .populate("providerProfile.categories", "name")
        .populate("reviewedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Application.countDocuments(filter),
    ]);

    return res.status(200).json({
      applications: apps,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("get applications error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const app = await Application.findById(req.params.id)
      .populate("userId", "name email avatarUrl phone")
      .populate("providerProfile.categories", "name imageUrl")
      .populate("reviewedBy", "name email");

    if (!app) return res.status(404).json({ message: "Application not found" });

    return res.status(200).json({ application: app });
  } catch (err) {
    console.error("get application error:", err.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
