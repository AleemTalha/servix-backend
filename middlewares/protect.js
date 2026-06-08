const jwt = require("jsonwebtoken");
const { redisClient } = require("../config/redis");

const logAuthEvent = (req, status, message, extra = {}) => {
  const logData = {
    timestamp: new Date().toISOString(),
    status,
    message,
    ip: req.ip,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers["user-agent"],
    deviceId: req.headers["x-device-id"],
    ...extra,
  };

  if (status >= 500) {
    console.error(JSON.stringify(logData));
  } else {
    console.warn(JSON.stringify(logData));
  }
};

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logAuthEvent(
        req,
        401,
        "Missing or invalid authorization header"
      );

      return res.status(401).json({
        message: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.slice(7);

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        logAuthEvent(req, 401, "Token expired");

        return res.status(401).json({
          message: "Token has expired",
        });
      }

      logAuthEvent(req, 401, "Invalid token");

      return res.status(401).json({
        message: "Invalid token",
      });
    }

    const sessionKey = `session:${decoded.id}`;
    const sessionData = await redisClient.get(sessionKey);

    if (!sessionData) {
      logAuthEvent(req, 401, "Session expired or logged out", {
        userId: decoded.id,
      });

      return res.status(401).json({
        message: "Session expired or logged out",
      });
    }

    const session = JSON.parse(sessionData);

    const deviceId = req.headers["x-device-id"];

    if (!deviceId) {
      logAuthEvent(req, 401, "Missing device ID header", {
        userId: decoded.id,
      });

      return res.status(401).json({
        message: "Missing device ID header (x-device-id)",
      });
    }

    const device = session.devices.find(
      (d) => d.deviceId === deviceId
    );

    if (!device) {
      logAuthEvent(req, 401, "Device not recognized", {
        userId: decoded.id,
        deviceId,
      });

      return res.status(401).json({
        message: "Device not recognized. Please login again",
      });
    }

    const now = new Date();
    const lastActive = new Date(device.lastActive);
    const diffMinutes = (now - lastActive) / 1000 / 60;

    if (diffMinutes > 1) {
      device.lastActive = now.toISOString();

      await redisClient.set(
        sessionKey,
        JSON.stringify(session),
        { EX: 60 * 60 * 24 * 7 }
      );
    }

    const User = require("../models/user.models");
    const user = await User.findById(decoded.id).select("isBlocked");

    if (user && user.isBlocked) {
      await redisClient.del(sessionKey);
      return res.status(403).json({
        message: "Account is blocked. Contact support.",
      });
    }

    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: session.name,
      role: decoded.role || session.role,
    };

    req.session_data = session;
    req.deviceId = deviceId;

    next();
  } catch (err) {
    logAuthEvent(req, 500, "Error in protect middleware", {
      error: err.message,
      stack: err.stack,
    });

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

module.exports = protect;