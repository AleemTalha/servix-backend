const router = require("express").Router();
const User = require("../../models/user.models");
const Application = require("../../models/application.model");

// ✨ GET all pending provider applications
router.get(
  "/applications/pending",
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      console.log("========== FETCH PENDING APPLICATIONS START ==========");
      console.log("Page:", page, "Limit:", limit);

      const applications = await Application.find({
        applicationStatus: "pending",
        applicationType: "provider",
      })
        .populate("userId", "firstName lastName email phone")
        .populate("providerProfile.categories", "name")
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Application.countDocuments({
        applicationStatus: "pending",
        applicationType: "provider",
      });

      console.log("Applications found:", applications.length);
      console.log("Total:", total);
      console.log("========== FETCH PENDING APPLICATIONS END ==========");

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
      return res.status(500).json({
        message: "Internal Server Error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  }
);

// ✨ GET single application details
router.get(
  "/applications/:applicationId",
  async (req, res) => {
    try {
      const { applicationId } = req.params;

      console.log("========== FETCH APPLICATION DETAILS START ==========");
      console.log("Application ID:", applicationId);

      const application = await Application.findById(applicationId)
        .populate("userId", "firstName lastName email phone role")
        .populate("providerProfile.categories", "name")
        .populate("reviewedBy", "firstName lastName email");

      if (!application) {
        console.warn("Application not found:", applicationId);
        return res.status(404).json({ message: "Application not found" });
      }

      console.log("Application details retrieved");
      console.log("========== FETCH APPLICATION DETAILS END ==========");

      return res.status(200).json(application);
    } catch (err) {
      console.error("Error fetching application:", err.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
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

      console.log("========== APPROVE APPLICATION START ==========");
      console.log("Application ID:", applicationId);
      console.log("Admin ID:", adminId);

      const application = await Application.findById(applicationId);

      if (!application) {
        console.warn("Application not found:", applicationId);
        return res.status(404).json({ message: "Application not found" });
      }

      if (application.applicationStatus !== "pending") {
        console.warn("Application already reviewed:", {
          applicationId,
          status: application.applicationStatus,
        });

        return res.status(400).json({
          message: `Cannot approve. Application status is ${application.applicationStatus}`,
        });
      }

      // Update application
      application.applicationStatus = "approved";
      application.reviewedBy = adminId;
      application.reviewedAt = new Date();
      if (adminNotes) {
        application.adminNotes = adminNotes;
      }

      await application.save();

      // Update user role to provider
      const user = await User.findById(application.userId);
      if (user) {
        user.role = "provider";

        // ✨ Transfer provider profile data from application to user
        if (application.providerProfile) {
          user.providerProfile = {
            categories: application.providerProfile.categories,
            bio: application.providerProfile.bio,
            hourlyRate: application.providerProfile.hourlyRate,
            experienceYears: application.providerProfile.experienceYears,
            location: application.providerProfile.location,
            isAvailable: application.providerProfile.isAvailable,
            verified: true,
            totalRating: 0,
            totalReviews: 0,
            jobsCompleted: 0,
          };
        }

        await user.save();
      }

      console.log("Application approved successfully");
      console.log("User role updated to provider");
      console.log("========== APPROVE APPLICATION END ==========");

      return res.status(200).json({
        message: "Application approved successfully",
        application,
      });
    } catch (err) {
      console.error("Error approving application:", err.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
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
        return res.status(400).json({
          message: "Rejection reason is required",
        });
      }

      console.log("========== REJECT APPLICATION START ==========");
      console.log("Application ID:", applicationId);
      console.log("Admin ID:", adminId);
      console.log("Reason:", rejectionReason);

      const application = await Application.findById(applicationId);

      if (!application) {
        console.warn("Application not found:", applicationId);
        return res.status(404).json({ message: "Application not found" });
      }

      if (application.applicationStatus !== "pending") {
        console.warn("Application already reviewed:", {
          applicationId,
          status: application.applicationStatus,
        });

        return res.status(400).json({
          message: `Cannot reject. Application status is ${application.applicationStatus}`,
        });
      }

      // Update application
      application.applicationStatus = "rejected";
      application.reviewedBy = adminId;
      application.reviewedAt = new Date();
      application.rejectionReason = rejectionReason.trim();
      if (adminNotes) {
        application.adminNotes = adminNotes;
      }

      await application.save();

      console.log("Application rejected successfully");
      console.log("========== REJECT APPLICATION END ==========");

      return res.status(200).json({
        message: "Application rejected successfully",
        application,
      });
    } catch (err) {
      console.error("Error rejecting application:", err.message);
      return res.status(500).json({
        message: "Internal Server Error",
        error: process.env.NODE_ENV === "development" ? err.message : undefined,
      });
    }
  }
);

// ✨ GET all applications (for admin dashboard)
router.get("/applications", async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    console.log("========== FETCH ALL APPLICATIONS START ==========");
    console.log("Status filter:", status);
    console.log("Page:", page, "Limit:", limit);

    const query = { applicationType: "provider" };
    if (status) {
      query.applicationStatus = status;
    }

    const applications = await Application.find(query)
      .populate("userId", "firstName lastName email phone role")
      .populate("reviewedBy", "firstName lastName email")
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Application.countDocuments(query);

    console.log("Applications found:", applications.length);
    console.log("Total:", total);
    console.log("========== FETCH ALL APPLICATIONS END ==========");

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
    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

module.exports = router;
