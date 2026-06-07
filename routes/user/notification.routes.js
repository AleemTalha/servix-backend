const router = require("express").Router();
const protect = require("../../middlewares/protect");
const {
  saveNotificationToken,
  removeNotificationToken,
} = require("../../controllers/notification.controller");

router.post("/notification-token", protect, saveNotificationToken);

router.post("/remove-notification-token", protect, removeNotificationToken);

module.exports = router;