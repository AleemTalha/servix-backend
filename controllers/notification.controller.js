const User = require("../models/user.models");

const saveNotificationToken = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { fcmToken } = req.body;

    console.log("\n========== SAVE FCM TOKEN ==========");
    console.log("User ID:", userId);
    console.log("Incoming Token:", fcmToken);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    if (!fcmToken || typeof fcmToken !== "string") {
      return res.status(400).json({ message: "Valid fcmToken is required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // FIXED: Using 'fcmToken' instead of 'fcmTokens'
    if (!Array.isArray(user.fcmToken)) {
      user.fcmToken = [];
    }

    console.log("Tokens before save:", user.fcmToken);

    const tokenExists = user.fcmToken.includes(fcmToken);

    if (!tokenExists) {
      user.fcmToken.push(fcmToken);
      await user.save();
      console.log("Token added successfully");
    } else {
      console.log("Token already exists");
    }

    // FIXED: Select 'fcmToken' from the database
    const updatedUser = await User.findById(userId).select("fcmToken");

    console.log("Tokens after save:", updatedUser?.fcmToken);
    console.log("========== SAVE COMPLETE ==========\n");

    return res.status(200).json({
      success: true,
      message: tokenExists
        ? "FCM token already exists"
        : "FCM token saved successfully",
      fcmTokens: updatedUser?.fcmToken || [], // Returning as 'fcmTokens' to avoid breaking frontend contracts
    });
  } catch (error) {
    console.error("saveNotificationToken error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const removeNotificationToken = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { fcmToken } = req.body;

    console.log("\n========== REMOVE FCM TOKEN ==========");
    console.log("User ID:", userId);
    console.log("Incoming Token:", fcmToken);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized user" });
    }

    if (!fcmToken || typeof fcmToken !== "string") {
      return res.status(400).json({ message: "Valid fcmToken is required" });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // FIXED: Using 'fcmToken' instead of 'fcmTokens'
    if (!Array.isArray(user.fcmToken)) {
      user.fcmToken = [];
    }

    console.log("Tokens before remove:", user.fcmToken);

    const initialLength = user.fcmToken.length;

    // FIXED: Filtering the correct schema property
    user.fcmToken = user.fcmToken.filter(
      (token) => token !== fcmToken
    );

    const tokenRemoved = user.fcmToken.length !== initialLength;

    await user.save();

    // FIXED: Selecting correct key
    const updatedUser = await User.findById(userId).select("fcmToken");

    console.log("Token removed:", tokenRemoved);
    console.log("Tokens after remove:", updatedUser?.fcmToken);
    console.log("========== REMOVE COMPLETE ==========\n");

    return res.status(200).json({
      success: true,
      message: tokenRemoved
        ? "FCM token removed successfully"
        : "FCM token was not found",
      fcmTokens: updatedUser?.fcmToken || [],
    });
  } catch (error) {
    console.error("removeNotificationToken error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  saveNotificationToken,
  removeNotificationToken,
};