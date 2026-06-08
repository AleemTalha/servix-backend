const router = require("express").Router();
const User = require("../../models/user.models");
const { redisClient } = require("../../config/redis");
const logger = require("../../utils/logger");

const SENSITIVE_FIELDS = "-password -emailHash -fcmToken -loginHistory -verificationDocuments";

router.get("/", async (req, res) => {
  try {
    const { category = "all", page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    let filter = {};

    if (category === "customers") {
      filter.role = "user";
    } else if (category === "providers") {
      filter.role = "provider";
    } else if (category === "admin") {
      filter.role = "admin";
    }

    let query = User.find(filter)
      .select(SENSITIVE_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    if (category === "providers" || category === "all") {
      query = query.populate("providerProfile.categories", "name");
    }

    const users = await query;
    const total = await User.countDocuments(filter);

    return res.status(200).json({
      success: true,
      users,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Error fetching users:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("providerProfile.categories", "name")
      .select(SENSITIVE_FIELDS);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    console.error("Error fetching user:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

router.patch("/:id/block", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Cannot block another admin account",
      });
    }

    if (user.isBlocked) {
      return res.status(400).json({
        success: false,
        message: "User is already blocked",
      });
    }

    user.isBlocked = true;
    await user.save();

    await redisClient.del(`session:${user._id}`);

    logger.block(
      `Admin blocked user ${user.email}`,
      req.ip,
      req.user.id,
      user._id,
    );

    const admin = require("../config/firebase");
    const Notification = require("../models/notification.models");

    const notificationTitle = "Account Blocked";
    const notificationBody =
      "Your session has expired and your account has been blocked. Please contact support.";

    if (user.fcmToken && user.fcmToken.length > 0) {
      const payload = {
        notification: { title: notificationTitle, body: notificationBody },
        data: { type: "account_blocked", screen: "/profile" },
        android: {
          priority: "high",
          notification: { channelId: "servix_action_channel" },
        },
        apns: {
          payload: {
            aps: { sound: "default", contentAvailable: true },
          },
        },
      };

      await Promise.allSettled([
        Notification.create({
          title: notificationTitle,
          description: notificationBody,
          recipient: user._id,
        }),
        ...user.fcmToken.map((token) =>
          admin
            .messaging()
            .send({ ...payload, token })
            .catch((err) => {
              console.error(
                `FCM send failed for token ${token.slice(-8)}:`,
                err.message,
              );
            }),
        ),
      ]);
    } else {
      await Notification.create({
        title: notificationTitle,
        description: notificationBody,
        recipient: user._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "User blocked successfully. All sessions terminated.",
    });
  } catch (err) {
    console.error("Error blocking user:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

router.patch("/:id/unblock", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.isBlocked) {
      return res.status(400).json({
        success: false,
        message: "User is not blocked",
      });
    }

    user.isBlocked = false;
    await user.save();

    logger.info(`Admin unblocked user ${user.email}`, {
      type: "block",
      ip: req.ip,
      adminId: req.user.id,
      targetId: user._id,
    });

    return res.status(200).json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (err) {
    console.error("Error unblocking user:", err.message);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
});

module.exports = router;