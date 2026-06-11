const router = require("express").Router();
const protect = require("../../middlewares/protect");
const {
  saveNotificationToken,
  removeNotificationToken,
} = require("../../controllers/notification.controller");

// Require authentication for all user notification endpoints
router.use(protect);

router.post("/notification-token", saveNotificationToken);
router.post("/remove-notification-token", removeNotificationToken);

module.exports = router;
