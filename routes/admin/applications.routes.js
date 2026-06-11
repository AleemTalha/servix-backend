const router = require("express").Router();
const Application = require("../../models/application.model");
const User = require("../../models/user.models");
const Category = require("../../models/category.models");
const Notification = require("../../models/notification.models");
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
      $pull: { fcmToken: { $in: tokens } },
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

    // 1. Update Application Status
    app.applicationStatus = "approved";
    app.reviewedAt = new Date();
    app.reviewedBy = req.user.id;
    if (req.body.adminNotes) app.adminNotes = req.body.adminNotes;
    await app.save();

    // 2. Update User to Provider and Transfer Data
    const user = await User.findById(app.userId);
    if (user) {
      user.role = "provider";
      
      // Transfer profile data
      if (app.providerProfile) {
        user.providerProfile = {
          ...user.providerProfile,
          categories: app.providerProfile.categories || user.providerProfile.categories,
          bio: app.providerProfile.bio || user.providerProfile.bio,
          hourlyRate: app.providerProfile.hourlyRate || user.providerProfile.hourlyRate,
          experienceYears: app.providerProfile.experienceYears || user.providerProfile.experienceYears,
          location: app.providerProfile.location || user.providerProfile.location,
          isAvailable: app.providerProfile.isAvailable !== undefined ? app.providerProfile.isAvailable : true,
          verified: true,
          cnic: {
            url: app.providerProfile.cnic?.url || user.providerProfile.cnic?.url,
            publicId: app.providerProfile.cnic?.publicId || user.providerProfile.cnic?.publicId
          }
        };
      }

      // Transfer verification documents
      if (app.verificationDocuments && app.verificationDocuments.length > 0) {
        user.verificationDocuments = app.verificationDocuments.map(doc => ({
          url: doc.url,
          publicId: doc.publicId,
          validationDate: new Date()
        }));
      }
      
      await user.save();

      // 3. Create Database Notification
      const title = "Application Approved! 🎉";
      const body = "Congratulations! You are now a verified service provider on Servix.";
      
      await Notification.create({
        title,
        description: body,
        recipient: user._id,
      });

      // 4. Send Push Notification
      if (user.fcmToken?.length) {
        const invalid = await sendNotification(user.fcmToken, title, body);
        await removeInvalidTokens(user._id, invalid);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Application approved and user upgraded to provider",
      applicationId: app._id,
    });
  } catch (err) {
    console.error("approve error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
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

    // 1. Update Application Status
    app.applicationStatus = "rejected";
    app.rejectionReason = rejectionReason;
    app.reviewedAt = new Date();
    app.reviewedBy = req.user.id;
    if (adminNotes) app.adminNotes = adminNotes;
    await app.save();

    // 2. Notify User
    const user = await User.findById(app.userId);
    if (user) {
      const title = "Application Update";
      const body = "Your service provider application was not approved. Open the app to see the reason and resubmit.";
      
      await Notification.create({
        title,
        description: body,
        recipient: user._id,
      });

      if (user.fcmToken?.length) {
        const invalid = await sendNotification(user.fcmToken, title, body);
        await removeInvalidTokens(user._id, invalid);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Application rejected and user notified",
      applicationId: app._id,
    });
  } catch (err) {
    console.error("reject error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = status ? { applicationStatus: status } : {};
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [apps, total] = await Promise.all([
      Application.find(filter)
        .populate("userId", "firstName lastName email profileImage")
        .populate("providerProfile.categories", "name")
        .populate("reviewedBy", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Application.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
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
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const app = await Application.findById(req.params.id)
      .populate("userId", "firstName lastName email profileImage contact")
      .populate("providerProfile.categories", "name image")
      .populate("reviewedBy", "firstName lastName email");

    if (!app) return res.status(404).json({ message: "Application not found" });

    return res.status(200).json({ success: true, application: app });
  } catch (err) {
    console.error("get application error:", err.message);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
