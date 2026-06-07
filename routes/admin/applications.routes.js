const router = require("express").Router();
const Application = require("../../models/application.model");
const User = require("../../models/user.models");
const admin = require("../../config/firebase");

const sendNotification = async (fcmTokens, title, body) => {
  if (!fcmTokens || fcmTokens.length === 0) return [];

  const message = { notification: { title, body }, tokens: fcmTokens };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);
    const invalidTokens = [];

    response.responses.forEach((res, index) => {
      if (!res.success) {
        const code = res.error?.code;
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(fcmTokens[index]);
        }
      }
    });

    return invalidTokens;
  } catch (error) {
    console.error("sendNotification error:", error.message);
    return [];
  }
};

router.patch("/:applicationId/approve", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { adminNotes } = req.body;

    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.applicationStatus !== "pending" && application.applicationStatus !== "resubmitted") {
      return res.status(400).json({ message: `Application is already ${application.applicationStatus}` });
    }

    application.applicationStatus = "approved";
    application.reviewedAt = new Date();
    application.reviewedBy = req.user.id;
    if (adminNotes) application.adminNotes = adminNotes;

    await application.save();

    const user = await User.findById(application.userId);

    if (user && user.fcmTokens?.length > 0) {
      const invalidTokens = await sendNotification(
        user.fcmTokens,
        "Application Approved! 🎉",
        "Congratulations! You are now a verified service provider on Servix."
      );

      if (invalidTokens.length > 0) {
        await User.findByIdAndUpdate(user._id, {
          $pull: { fcmTokens: { $in: invalidTokens } },
        });
      }
    }

    return res.status(200).json({
      message: "Application approved and user notified",
      applicationId: application._id,
    });
  } catch (error) {
    console.error("approve application error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.patch("/:applicationId/reject", async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { rejectionReason, adminNotes } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ message: "rejectionReason is required" });
    }

    const application = await Application.findById(applicationId);

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    if (application.applicationStatus !== "pending" && application.applicationStatus !== "resubmitted") {
      return res.status(400).json({ message: `Application is already ${application.applicationStatus}` });
    }

    application.applicationStatus = "rejected";
    application.rejectionReason = rejectionReason;
    application.reviewedAt = new Date();
    application.reviewedBy = req.user.id;
    if (adminNotes) application.adminNotes = adminNotes;

    await application.save();

    const user = await User.findById(application.userId);

    if (user && user.fcmTokens?.length > 0) {
      const invalidTokens = await sendNotification(
        user.fcmTokens,
        "Application Update",
        "Your service provider application was not approved. Open the app to see the reason and resubmit."
      );

      if (invalidTokens.length > 0) {
        await User.findByIdAndUpdate(user._id, {
          $pull: { fcmTokens: { $in: invalidTokens } },
        });
      }
    }

    return res.status(200).json({
      message: "Application rejected and user notified",
      applicationId: application._id,
    });
  } catch (error) {
    console.error("reject application error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (status) filter.applicationStatus = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [applications, total] = await Promise.all([
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
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("get applications error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:applicationId", async (req, res) => {
  try {
    const application = await Application.findById(req.params.applicationId)
      .populate("userId", "name email avatarUrl phone")
      .populate("providerProfile.categories", "name imageUrl")
      .populate("reviewedBy", "name email");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
    }

    return res.status(200).json({ application });
  } catch (error) {
    console.error("get application error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;