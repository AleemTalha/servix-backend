const router = require("express").Router();
const User = require("../../models/user.models");
const Application = require("../../models/application.model");
const Category = require("../../models/category.models");
const Notification = require("../../models/notification.models");
const admin = require("../../config/firebase");

const sendNotification = async (tokens, title, body) => {
  if (!tokens?.length) return [];
  try {
    const res = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      tokens,
    });
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

// ✨ GET all pending provider applications
router.get(
  "/applications/pending",
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const applications = await Application.find({
        applicationStatus: "pending",
        applicationType: "provider",
      })
        .populate("userId", "firstName lastName email contact profileImage")
        .populate("providerProfile.categories", "name")
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Application.countDocuments({
        applicationStatus: "pending",
        applicationType: "provider",
      });

      return res.status(200).json({
        applications,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      console.error("Error fetching applications:", err.message);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

// ✨ GET single application details
router.get(
  "/applications/:applicationId",
  async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email contact profileImage role")
        .populate("providerProfile.categories", "name image")
        .populate("reviewedBy", "firstName lastName email");

      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      return res.status(200).json(application);
    } catch (err) {
      console.error("Error fetching application:", err.message);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

// ✨ APPROVE provider application
router.post(
  "/applications/:applicationId/approve",
  async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { adminNotes } = req.body;
      const adminId = req.user.id;

      const application = await Application.findById(applicationId);

      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      if (!["pending", "resubmitted"].includes(application.applicationStatus)) {
        return res.status(400).json({
          message: `Cannot approve. Application status is ${application.applicationStatus}`,
        });
      }

      // 1. Update Application
      application.applicationStatus = "approved";
      application.reviewedBy = adminId;
      application.reviewedAt = new Date();
      if (adminNotes) {
        application.adminNotes = adminNotes;
      }
      await application.save();

      // 2. Update User to Provider
      const user = await User.findById(application.userId);
      if (user) {
        user.role = "provider";

        // Transfer provider profile data from application to user
        if (application.providerProfile) {
          user.providerProfile = {
            ...user.providerProfile,
            categories: application.providerProfile.categories || user.providerProfile.categories,
            bio: application.providerProfile.bio || user.providerProfile.bio,
            hourlyRate: application.providerProfile.hourlyRate || user.providerProfile.hourlyRate,
            experienceYears: application.providerProfile.experienceYears || user.providerProfile.experienceYears,
            location: application.providerProfile.location || user.providerProfile.location,
            isAvailable: application.providerProfile.isAvailable ?? true,
            verified: true,
            cnic: {
              url: application.providerProfile.cnic?.url || user.providerProfile.cnic?.url,
              publicId: application.providerProfile.cnic?.publicId || user.providerProfile.cnic?.publicId
            }
          };
        }

        // Transfer verification documents
        if (application.verificationDocuments && application.verificationDocuments.length > 0) {
          user.verificationDocuments = application.verificationDocuments.map(doc => ({
            url: doc.url,
            publicId: doc.publicId,
            validationDate: new Date()
          }));
        }

        await user.save();

        // 3. Notify User
        const title = "Application Approved! 🎉";
        const body = "Congratulations! You are now a verified service provider on Servix.";
        
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
        message: "Application approved successfully",
        application,
      });
    } catch (err) {
      console.error("Error approving application:", err.message);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

// ✨ REJECT provider application
router.post(
  "/applications/:applicationId/reject",
  async (req, res) => {
    try {
      const { applicationId } = req.params;
      const { rejectionReason, adminNotes } = req.body;
      const adminId = req.user.id;

      if (!rejectionReason || rejectionReason.trim().length === 0) {
        return res.status(400).json({ message: "Rejection reason is required" });
      }

      const application = await Application.findById(applicationId);

      if (!application) {
        return res.status(404).json({ message: "Application not found" });
      }

      if (!["pending", "resubmitted"].includes(application.applicationStatus)) {
        return res.status(400).json({
          message: `Cannot reject. Application status is ${application.applicationStatus}`,
        });
      }

      // 1. Update Application
      application.applicationStatus = "rejected";
      application.reviewedBy = adminId;
      application.reviewedAt = new Date();
      application.rejectionReason = rejectionReason.trim();
      if (adminNotes) {
        application.adminNotes = adminNotes;
      }
      await application.save();

      // 2. Notify User
      const user = await User.findById(application.userId);
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
        message: "Application rejected successfully",
        application,
      });
    } catch (err) {
      console.error("Error rejecting application:", err.message);
      return res.status(500).json({ message: "Internal Server Error" });
    }
  }
);

// ✨ GET all applications (for admin dashboard)
router.get("/applications", async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const query = { applicationType: "provider" };
    if (status) {
      query.applicationStatus = status;
    }

    const applications = await Application.find(query)
      .populate("userId", "firstName lastName email contact profileImage role")
      .populate("reviewedBy", "firstName lastName email")
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(query);

    return res.status(200).json({
      applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching applications:", err.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
