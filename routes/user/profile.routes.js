const router = require("express").Router();
const { upload, handleMulterError } = require("../../config/multer");
const User = require("../../models/user.models");
const protect = require("../../middlewares/protect");

router.get("/", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("providerProfile.categories");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let profileImageUrl = null;
    if (user.verificationDocuments && user.verificationDocuments.length > 0) {
      const imageUrl = user.verificationDocuments[0].url;
      if (imageUrl) {
        if (imageUrl.startsWith('http')) {
          profileImageUrl = imageUrl;
        } else {
          const baseUrl = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
          const path = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
          profileImageUrl = `${baseUrl}${path}`;
        }
      }
    }

    console.log(`✅ [Profile] Fetched profile for user ID: ${user._id}`);
    console.log(`   - Profile Image URL: ${profileImageUrl}`);

    return res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        profileImageUrl, // Add properly constructed image URL
      },
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

router.put("/update", protect, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      contact,
      bio,
      hourlyRate,
      experienceYears,
      location,
    } = req.body;

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (contact) user.contact = contact;

    if (user.role === "provider") {
      if (!user.providerProfile) user.providerProfile = {};

      if (bio !== undefined) user.providerProfile.bio = bio;
      if (hourlyRate !== undefined)
        user.providerProfile.hourlyRate = hourlyRate;
      if (experienceYears !== undefined)
        user.providerProfile.experienceYears = experienceYears;

      if (location) {
        user.providerProfile.location = {
          address:
            location.address ||
            user.providerProfile.location?.address,
          city:
            location.city ||
            user.providerProfile.location?.city,
          lat:
            location.lat !== undefined
              ? location.lat
              : user.providerProfile.location?.lat,
          lng:
            location.lng !== undefined
              ? location.lng
              : user.providerProfile.location?.lng,
        };
      }
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password")
      .populate("providerProfile.categories");

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Error updating profile fields:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

router.put(
  "/photo",
  protect,
  upload.single("profilePhoto"),
  (err, req, res, next) => handleMulterError(err, req, res, next),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No image file provided",
        });
      }

      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Construct URL from upload directory structure
      // File saved to: uploads/images/YYYY/MM/filename.jpg
      // URL becomes: /uploads/images/YYYY/MM/filename.jpg
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const uploadedUrl = `/uploads/images/${year}/${month}/${req.file.filename}`;

      console.log(`✅ [Profile] Photo upload:`);
      console.log(`   - Full path: ${req.file.path}`);
      console.log(`   - URL: ${uploadedUrl}`);
      console.log(`   - Filename: ${req.file.filename}`);

      const publicId = req.file.filename;

      user.verificationDocuments = [
        {
          url: uploadedUrl,
          publicId,
          validationDate: new Date(),
        },
      ];

      await user.save();

      return res.status(200).json({
        success: true,
        message: "Profile photo updated successfully",
        photo: {
          url: uploadedUrl,
          publicId,
        },
      });
    } catch (err) {
      console.error("Error uploading profile photo:", err);
      return res.status(500).json({
        success: false,
        message: "Internal Server Error",
      });
    }
  }
);

module.exports = router;