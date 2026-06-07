const router = require("express").Router();
const bcrypt = require("bcrypt");
const User = require("../../models/user.models");
const { upload } = require("../../config/multer");
const { hashEmail } = require("../../utils/encryption");

router.post("/create", upload.single("profileImage"), async (req, res) => {
  try {
    if (process.env.NODE_ENV !== "development") {
      return res.status(403).json({
        message:
          "Access denied. Admin initialization is only available in development mode.",
      });
    }

    const { email, firstName, lastName, password, contact, bio } = req.body;

    if (!email || !firstName || !lastName || !password) {
      return res.status(400).json({
        message:
          "Required fields missing: email, firstName, lastName, and password must be provided.",
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: "Invalid email format.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be secure and contain at least 8 characters.",
      });
    }

    const hashedEmailField = hashEmail(email);
    const existingUser = await User.findOne({ emailHash: hashedEmailField });
    if (existingUser) {
      return res.status(400).json({
        message: "An account with this email already exists.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let profileImage = { url: "/uploads/profile.png", publicId: "" };
    if (req.file) {
      profileImage = {
        url: req.file.path || req.file.location || "/uploads/profile.png",
        publicId: req.file.filename || req.file.key,
      };
    }

    const newAdmin = new User({
      firstName,
      lastName,
      email,
      emailHash: hashedEmailField,
      password: hashedPassword,
      role: "admin",
      isVerified: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authProvider: "local",
      authMethods: { local: true, google: false, facebook: false },
      profileImage,
      contact: contact || "",
      providerProfile: undefined,
    });

    await newAdmin.save();

    return res.status(201).json({
      message: "Admin account initialized successfully.",
      user: {
        id: newAdmin._id,
        firstName: newAdmin.firstName,
        lastName: newAdmin.lastName,
        email: newAdmin.email,
        role: newAdmin.role,
        isVerified: newAdmin.isVerified,
        profileImage: newAdmin.profileImage.url || null,
        contact: newAdmin.contact,
      },
    });
  } catch (err) {
    console.error("[create-admin]", err);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
});

module.exports = router;
