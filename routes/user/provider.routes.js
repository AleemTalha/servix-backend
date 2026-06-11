const router = require("express").Router();
const path = require("path"); // Added for safe local file path routing
const User = require("../../models/user.models");
const Application = require("../../models/application.model");
const protect = require("../../middlewares/protect");
const { upload, handleMulterError } = require("../../config/multer");
const Tesseract = require("tesseract.js");

router.post(
  "/apply",
  protect,
  upload.single("cnic"),
  (err, req, res, next) => handleMulterError(err, req, res, next),
  async (req, res) => {

    try {
      console.log("Cats: " , req.body.categories)
      console.log("========== PROVIDER APPLICATION START ==========");
      console.log("User ID:", req.user?.id);
      console.log("Body:", req.body);
      console.log("File:", req.file);

      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        console.warn("[404] User not found:", userId);
        return res.status(404).json({ message: "User not found" });
      }

      // ✨ Check if user is already a provider
      if (user.role === "provider") {
        console.warn("[400] User already provider:", {
          userId,
          role: user.role,
        });

        return res.status(400).json({ message: "You are already a provider" });
      }

      // ✨ Check if user has a pending application
      const pendingApplication = await Application.findOne({
        userId,
        applicationStatus: "pending",
      });

      if (pendingApplication) {
        console.warn("[400] Application already pending:", {
          userId,
          applicationId: pendingApplication._id,
          submittedAt: pendingApplication.submittedAt,
        });

        return res.status(400).json({
          message: "Your application is already under review",
          applicationId: pendingApplication._id,
        });
      }

      // ✨ Check if user has a rejected application (allow resubmission)
      const rejectedApplication = await Application.findOne({
        userId,
        applicationStatus: "rejected",
      });

      if (rejectedApplication && !req.body.isResubmission) {
        console.warn("[400] Application rejected - resubmission required:", {
          userId,
          rejectionReason: rejectedApplication.rejectionReason,
        });

        return res.status(400).json({
          message: "Your previous application was rejected",
          rejectionReason: rejectedApplication.rejectionReason,
          canResubmit: true,
        });
      }

      const { bio, hourlyRate, experienceYears, location } = req.body;

      const categories = req.body.categories

      console.log("Categories:", categories);

      if (!categories || categories.length === 0) {
        console.warn("[400] Categories missing", {
          bodyKeys: Object.keys(req.body),
        });

        return res.status(400).json({
          message: "At least one category is required",
        });
      }

      if (!req.file) {
        console.warn("[400] CNIC image missing");

        return res.status(400).json({
          message: "CNIC image is required",
        });
      }

      if (!experienceYears || experienceYears < 0) {
        console.warn("[400] Invalid experience years:", experienceYears);

        return res.status(400).json({
          message: "Valid experience years are required",
        });
      }

      if (!bio || bio.trim().length < 20) {
        console.warn("[400] Invalid bio:", {
          length: bio?.trim()?.length || 0,
          bio,
        });

        return res.status(400).json({
          message: "Bio must be at least 20 characters",
        });
      }

      if (!hourlyRate || hourlyRate <= 0) {
        console.warn("[400] Invalid hourly rate:", hourlyRate);

        return res.status(400).json({
          message: "Valid hourly rate is required",
        });
      }

      if (!location || !location.address || !location.city) {
        console.warn("[400] Invalid location:", location);

        return res.status(400).json({
          message: "Location address and city are required",
        });
      }

      const cnicPath = req.file.path;

      console.log("Starting OCR...");
      console.log("CNIC Path:", cnicPath);

      let detectedCnic = null;
      let ocrText = "";

      // ✨ Try OCR with proper error handling - don't crash the app
      try {
        const ocrResult = await Tesseract.recognize(cnicPath, "eng", {
          logger: () => {},
        });

        ocrText = ocrResult.data.text;

        console.log("✅ OCR TEXT:");
        console.log(ocrText);

        const cnicRegex = /\d{5}-\d{7}-\d/;
        const cnicMatch = ocrText.match(cnicRegex);
        detectedCnic = cnicMatch ? cnicMatch[0] : null;

        console.log("✅ Detected CNIC:", detectedCnic);
      } catch (ocrError) {
        console.warn("⚠️ [OCR] Failed to extract CNIC - continuing without OCR");
        console.warn("⚠️ [OCR] Error:", ocrError.message);
        // ✨ Don't crash - continue without OCR detection
        detectedCnic = null;
        ocrText = "";
      }

      // ✨ Create application instead of saving to user model
      let application;

      if (rejectedApplication && req.body.isResubmission) {
        // Resubmit the rejected application
        console.log("Resubmitting application...");

        rejectedApplication.applicationStatus = "pending";
        rejectedApplication.providerProfile = {
          categories,
          bio: bio.trim(),
          hourlyRate: Number(hourlyRate),
          experienceYears: Number(experienceYears),
          location: {
            address: location.address,
            city: location.city,
            lat: location.lat ? Number(location.lat) : undefined,
            lng: location.lng ? Number(location.lng) : undefined,
          },
          isAvailable: false,
        };

        rejectedApplication.verificationDocuments = [
          {
            url: `/${cnicPath}`,
            publicId: req.file.filename,
            type: "cnic",
            validationDate: null,
          },
        ];

        rejectedApplication.cnic = {
          url: `/${cnicPath}`,
          publicId: req.file.filename,
          detectedNumber: detectedCnic,
        };

        rejectedApplication.resubmissionCount += 1;
        rejectedApplication.lastResubmittedAt = new Date();
        rejectedApplication.rejectionReason = null;

        application = await rejectedApplication.save();

        console.log("Application resubmitted successfully");
      } else {
        // Create new application
        console.log("Creating new application...");

        application = new Application({
          userId,
          applicationType: "provider",
          applicationStatus: "pending",
          providerProfile: {
            categories,
            bio: bio.trim(),
            hourlyRate: Number(hourlyRate),
            experienceYears: Number(experienceYears),
            location: {
              address: location.address,
              city: location.city,
              lat: location.lat ? Number(location.lat) : undefined,
              lng: location.lng ? Number(location.lng) : undefined,
            },
            isAvailable: false,
            cnic: {
              url: `/${cnicPath}`,
              publicId: req.file.filename,
              detectedNumber: detectedCnic,
            },
          },
          verificationDocuments: [
            {
              url: `/${cnicPath}`,
              publicId: req.file.filename,
              type: "cnic",
              validationDate: null,
            },
          ],
        });

        application = await application.save();

        console.log("New application created successfully");
      }

      console.log("Saving user...");

      // Do NOT modify user verification documents
      // User role will be updated by admin when application is approved
      await user.save();

      console.log("Provider application submitted successfully");
      console.log("========== PROVIDER APPLICATION END ==========");

      return res.status(200).json({
        message: req.body.isResubmission
          ? "Provider application resubmitted successfully. Pending admin approval."
          : "Provider application submitted successfully. Pending admin approval.",
        status: "pending",
        applicationId: application._id,
        cnicDetected: detectedCnic !== null,
        detectedCnicNumber: detectedCnic,
        isResubmission: req.body.isResubmission ? true : false,
        ocrStatus: detectedCnic ? "success" : "skipped",
      });
    } catch (err) {
      console.error("========== PROVIDER APPLICATION ERROR ==========");
      console.error("Message:", err.message);
      console.error("Stack:", err.stack);
      console.error("Full Error:", err);
      console.error("===============================================");

      // ✨ Ensure app never crashes - send error response instead
      if (!res.headersSent) {
        return res.status(500).json({
          message: "Failed to process provider application",
          error: process.env.NODE_ENV === "development" ? err.message : "Internal Server Error",
        });
      }
    }
  },
);

// ✨ GET user's provider application status
router.get("/status", protect, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log("========== FETCH APPLICATION STATUS START ==========");
    console.log("User ID:", userId);

    // ✨ Check if user is already a provider
    const user = await User.findById(userId).select("role");

    if (!user) {
      console.warn("User not found:", userId);
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "provider") {
      console.log("User is already a provider");
      return res.status(200).json({
        status: "provider",
        message: "You are already a provider",
      });
    }

    // ✨ Find latest application (any status)
    const latestApplication = await Application.findOne({ userId })
      .sort({ createdAt: -1 })
      .select(
        "applicationStatus rejectionReason submittedAt reviewedAt _id resubmissionCount"
      );

    if (!latestApplication) {
      console.log("No application found for user");
      return res.status(200).json({
        status: "none",
        message: "You have not applied to become a provider yet",
      });
    }

    console.log("Application found:", {
      applicationId: latestApplication._id,
      status: latestApplication.applicationStatus,
    });

    console.log("========== FETCH APPLICATION STATUS END ==========");

    return res.status(200).json({
      status: latestApplication.applicationStatus,
      applicationId: latestApplication._id,
      rejectionReason:
        latestApplication.applicationStatus === "rejected"
          ? latestApplication.rejectionReason
          : null,
      submittedAt: latestApplication.submittedAt,
      reviewedAt: latestApplication.reviewedAt,
      resubmissionCount: latestApplication.resubmissionCount,
      canResubmit: latestApplication.applicationStatus === "rejected",
    });
  } catch (err) {
    console.error("========== FETCH APPLICATION STATUS ERROR ==========");
    console.error("Message:", err.message);
    console.error("Stack:", err.stack);
    console.error("===============================================");

    if (!res.headersSent) {
      return res.status(500).json({
        message: "Failed to fetch application status",
        error: process.env.NODE_ENV === "development" ? err.message : "Internal Server Error",
      });
    }
  }
});
// ✨ GET Provider Bookings (Provider)
router.get("/bookings", protect, async (req, res) => {
  try {
    if (req.user.role !== "provider") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Provider role required.",
      });
    }

    const Booking = require("../../models/booking.models");
    const bookings = await Booking.find({ provider: req.user.id })
      .populate("customer", "firstName lastName email")
      .populate("category", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      bookings,
    });
  } catch (err) {
    console.error("Error fetching provider bookings:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

module.exports = router;