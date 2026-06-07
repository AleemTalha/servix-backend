const router = require("express").Router();
const { redisClient } = require("../config/redis");
const protect = require("../middlewares/protect");

const SESSION_TTL = 60 * 60 * 24 * 7;
const sessionKey = (userId) => `session:${userId}`;

router.get("/", protect, async (req, res) => {
  try {
    const session = req.session_data;

    if (!session?.devices) {
      return res.status(200).json({ devices: [] });
    }

    return res.status(200).json({
      devices: session.devices.map((d) => ({
        deviceId: d.deviceId,
        deviceName: d.deviceName,
        ip: d.ip,
        userAgent: d.userAgent,
        lastActive: d.lastActive,
        loginAt: d.loginAt,
        isCurrent: d.deviceId === req.deviceId,
      })),
    });
  } catch (err) {
    console.error("[devices]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/:deviceId", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const targetDeviceId = req.params.deviceId;

    if (targetDeviceId === req.deviceId) {
      return res.status(400).json({ message: "Cannot remove current device. Use /logout instead." });
    }

    const raw = await redisClient.get(sessionKey(userId));
    if (!raw) return res.status(401).json({ message: "Session not found" });

    const session = JSON.parse(raw);
    const deviceIndex = session.devices.findIndex((d) => d.deviceId === targetDeviceId);

    if (deviceIndex === -1) return res.status(404).json({ message: "Device not found" });

    const [removed] = session.devices.splice(deviceIndex, 1);

    if (session.devices.length === 0) {
      await redisClient.del(sessionKey(userId));
    } else {
      await redisClient.set(sessionKey(userId), JSON.stringify(session), { EX: SESSION_TTL });
    }

    return res.status(200).json({
      message: `Device '${removed.deviceName}' removed successfully`,
      remainingDevices: session.devices.length,
    });
  } catch (err) {
    console.error("[delete-device]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/logout-all", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    await redisClient.del(sessionKey(userId));
    return res.status(200).json({
      success: true,
      message: "Logged out from all devices successfully",
    });
  } catch (err) {
    console.error("[logout-all]", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

module.exports = router;
