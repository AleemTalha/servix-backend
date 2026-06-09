const router = require("express").Router();
const admin = require("../config/firebase");

router.use("/auth", require("./auth.routes"));
router.use("/devices", require("./device.routes"));
router.use("/ads", require("./ads.routes"));
router.use("/admin", require("./admin.routes"));
router.use("/categories", require("./user/category.routes"));
router.use("/provider", require("./user/provider.routes"));
router.use("/profile", require("./user/profile.routes"));
router.use("/notifications", require("./user/notification.routes"));
router.use("/chat", require("./user/chat.routes"));
router.use("/dashboard", require("./user/dashboard.routes"));

router.post("/test-notification", async (req, res) => {
  try {
    const title = "Test Notification";
    const body =
      "This is a test notification sent from the backend using a hardcoded token.";

    if (!title || !body) {
      return res
        .status(400)
        .json({ message: "title and body are required in request body" });
    }

    const hardcodedToken =
      "ccQ-39NXRPOsIs0ELjVp1E:APA91bGzoyoBEtiXNU8PVdFNDI81auQJgrxqxxyEinmqdsHofw4rz-UtxBgOCF1gMWFsn2cXZmeDF76wvkDOnKg1bn9RoljtV2F52UxdOlDrEuPtKvdBxdY";

    const message = {
      token: hardcodedToken,

      // We put this back so Android/iOS refuse to drop the message
      notification: {
        title: "Check your Profile!",
        body: "Tap here to view your updated profile statistics.",
      },

      data: {
        screen: "/profile",
        show_actions: "true",
      },

      android: {
        priority: "high",
        notification: {
          // Connects it directly to the custom channel we initialized in Flutter
          channelId: "servix_action_channel",
          clickAction: "FLUTTER_NOTIFICATION_CLICK",
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: "Check your Profile!",
              body: "Tap here to view your updated profile statistics.",
            },
            category: "PROFILE_ACTIONS", // Links to custom buttons on iOS
            contentAvailable: true,
          },
        },
      },
    };

    console.log("\n========== SENDING HARDCODED TEST NOTIFICATION ==========");
    console.log("Target Token:", hardcodedToken);

    const response = await admin.messaging().send(message);

    console.log("Firebase Response ID:", response);
    console.log("=========================================================\n");

    return res.status(200).json({
      success: true,
      message: "Notification sent successfully via hardcoded token!",
      messageId: response,
    });
  } catch (error) {
    console.error("Hardcoded test notification error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
    });
  }
});


module.exports = router;
