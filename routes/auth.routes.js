const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const User = require("../models/user.models");
const { redisClient } = require("../config/redis");
const protect = require("../middlewares/protect");
const { sendOtpEmail } = require("../utils/mail");
const { generateOtp, hashOtp, verifyOtp } = require("../utils/otp");
const { hashEmail } = require("../utils/encryption");
const logger = require("../utils/logger");
const admin = require("../config/firebase");

const OTP_TTL = 60 * 10;
const OTP_RATE_LIMIT_TTL = 60;
const MAX_OTP_ATTEMPTS = 5;
const SESSION_TTL = 60 * 60 * 24 * 7;

const pendingKey = (email) => `pending:${email}`;
const rateLimitKey = (email) => `otp_rate:${email}`;
const sessionKey = (userId) => `session:${userId}`;

router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const hashedEmailField = hashEmail(email);
    const existingUser = await User.findOne({ emailHash: hashedEmailField });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const isRateLimited = await redisClient.get(rateLimitKey(email));
    if (isRateLimited) {
      return res.status(429).json({ message: "Please wait 60 seconds before requesting a new OTP" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();

    await redisClient.set(
      pendingKey(email),
      JSON.stringify({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        otp: hashOtp(otp),
        attempts: 0,
      }),
      { EX: OTP_TTL }
    );

    await redisClient.set(rateLimitKey(email), "1", { EX: OTP_RATE_LIMIT_TTL });

    await sendOtpEmail(email, otp, firstName);

    return res.status(200).json({
      message: "OTP sent to your email. Please verify within 10 minutes.",
      email,
    });
  } catch (err) {
    console.error("[register]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const raw = await redisClient.get(pendingKey(email));
    if (!raw) {
      return res.status(400).json({ message: "OTP expired or not found. Please register again." });
    }

    const pending = JSON.parse(raw);

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
      await redisClient.del(pendingKey(email));
      return res.status(429).json({ message: "Too many incorrect attempts. Please register again." });
    }

    const isValid = verifyOtp(otp.trim(), pending.otp);

    if (!isValid) {
      pending.attempts += 1;
      const ttl = await redisClient.ttl(pendingKey(email));
      await redisClient.set(pendingKey(email), JSON.stringify(pending), {
        EX: ttl > 0 ? ttl : OTP_TTL,
      });

      return res.status(400).json({
        message: `Invalid OTP. ${MAX_OTP_ATTEMPTS - pending.attempts} attempt(s) remaining.`,
      });
    }

    const hashedEmailField = hashEmail(pending.email);

    const newUser = new User({
      firstName: pending.firstName,
      lastName: pending.lastName,
      email: pending.email,
      emailHash: hashedEmailField,
      password: pending.password,
      profileImage: { url: "/uploads/profile.png" },
      isVerified: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      authMethods: { local: true, google: false, facebook: false },
      authProvider: "local",
    });

    await newUser.save();

    logger.signup(`New user registered: ${email}`, req.ip, newUser._id);

    await redisClient.del(pendingKey(email));
    await redisClient.del(rateLimitKey(email));

    return res.status(201).json({
      message: "Email verified successfully. You can now log in.",
    });
  } catch (err) {
    console.error("[verify-otp]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const isRateLimited = await redisClient.get(rateLimitKey(email));
    if (isRateLimited) {
      return res.status(429).json({ message: "Please wait 60 seconds before requesting a new OTP" });
    }

    const raw = await redisClient.get(pendingKey(email));
    if (!raw) {
      return res.status(400).json({ message: "No pending registration found. Please register again." });
    }

    const pending = JSON.parse(raw);
    const otp = generateOtp();

    pending.otp = hashOtp(otp);
    pending.attempts = 0;

    await redisClient.set(pendingKey(email), JSON.stringify(pending), { EX: OTP_TTL });
    await redisClient.set(rateLimitKey(email), "1", { EX: OTP_RATE_LIMIT_TTL });

    await sendOtpEmail(email, otp, pending.firstName);

    return res.status(200).json({ message: "New OTP sent to your email." });
  } catch (err) {
    console.error("[resend-otp]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const hashedEmailField = hashEmail(email);
    const user = await User.findOne({ emailHash: hashedEmailField });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.isVerified && !user.emailVerified) {
      return res.status(403).json({ message: "Email not verified. Please complete registration." });
    }

    if (!user.isLocalUser()) {
      return res.status(403).json({ message: `This account uses social login. Please sign in with ${user.authProvider}.` });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const incomingDeviceId = req.headers["x-device-id"];
    const deviceName = req.headers["x-device-name"] || "Unknown Device";
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";
    const userAgent = req.headers["user-agent"] || "Unknown";
    const now = new Date().toISOString();

    logger.auth(`User logged in: ${email}`, ip, user._id);

    user.loginHistory.push({
      ipAddress: ip,
      authProvider: "local"
    });
    await user.save();

    const existingRaw = await redisClient.get(sessionKey(user._id));
    let session = existingRaw ? JSON.parse(existingRaw) : null;
    let activeDeviceId;

    const findDeviceByHeaders = (devices) => {
      if (incomingDeviceId) {
        const idx = devices.findIndex((d) => d.deviceId === incomingDeviceId);
        if (idx !== -1) return { index: idx, key: "deviceId" };
      }
      const idx = devices.findIndex(
        (d) => d.deviceName === deviceName && d.userAgent === userAgent
      );
      if (idx !== -1) return { index: idx, key: "deviceName+userAgent" };
      return null;
    };

    if (session) {
      if (!Array.isArray(session.devices)) session.devices = [];

      const match = findDeviceByHeaders(session.devices);

      if (match) {
        session.devices[match.index].lastActive = now;
        session.devices[match.index].loginAt = now;
        session.devices[match.index].deviceName = deviceName;
        session.devices[match.index].ip = ip;
        session.devices[match.index].userAgent = userAgent;
        activeDeviceId = session.devices[match.index].deviceId;
      } else {
        activeDeviceId = incomingDeviceId || uuidv4();
        session.devices.push({ deviceId: activeDeviceId, deviceName, ip, userAgent, lastActive: now, loginAt: now });
      }

      session.role = user.role;
      session.name = `${user.firstName} ${user.lastName}`;
    } else {
      activeDeviceId = incomingDeviceId || uuidv4();
      session = {
        userId: user._id.toString(),
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        loginAt: now,
        devices: [{ deviceId: activeDeviceId, deviceName, ip, userAgent, lastActive: now, loginAt: now }],
      };
    }

    await redisClient.set(sessionKey(user._id), JSON.stringify(session), { EX: SESSION_TTL });

    let providerStatus = null;
    if (user.role === "provider") {
      providerStatus = user.providerProfile?.verified ? "approved" : "pending";
    }

    return res.status(200).json({
      message: "Login successful",
      token,
      deviceId: activeDeviceId,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profileImage: user.profileImage?.url || null,
        ...(user.role === "provider" && { providerStatus }),
      },
    });
  } catch (err) {
    console.error("[login]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get("/sync", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ valid: false, message: "User not found" });
    }

    let providerStatus = null;
    if (user.role === "provider") {
      providerStatus = user.providerProfile?.verified ? "approved" : "pending";
    }

    return res.status(200).json({
      valid: true,
      user: {
        id: user._id,
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage?.url || null,
        ...(user.role === "provider" && { providerStatus }),
      },
    });
  } catch (err) {
    console.error("[sync]", err);
    return res.status(500).json({ valid: false, message: "Internal Server Error" });
  }
});

router.post("/logout", protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const deviceId = req.deviceId;

    if (!deviceId) {
      return res.status(400).json({ success: false, message: "Device ID is required for logout" });
    }

    const raw = await redisClient.get(sessionKey(userId));
    if (!raw) {
      return res.status(200).json({ success: true, message: "Logged out successfully", remainingDevices: 0 });
    }

    const session = JSON.parse(raw);
    const deviceIndex = session.devices.findIndex((d) => d.deviceId === deviceId);

    if (deviceIndex === -1) {
      return res.status(200).json({ success: true, message: "Logged out successfully", remainingDevices: session.devices.length });
    }

    session.devices.splice(deviceIndex, 1);

    if (session.devices.length === 0) {
      await redisClient.del(sessionKey(userId));
    } else {
      await redisClient.set(sessionKey(userId), JSON.stringify(session), { EX: SESSION_TTL });
    }

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
      remainingDevices: session.devices.length,
    });
  } catch (err) {
    console.error("[logout]", err);
    return res.status(200).json({ success: true, message: "Logged out successfully" });
  }
});

router.post("/google", async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: "Firebase ID token is required" });
    }

    let firebaseUser;
    try {
      firebaseUser = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ message: "Invalid Firebase token" });
    }

    const { email, name, picture, uid } = firebaseUser;
    if (!email) {
      return res.status(400).json({ message: "Email not found in Google account" });
    }

    const hashedEmailField = hashEmail(email);
    let user = await User.findOne({ emailHash: hashedEmailField });

    if (user && user.isBlocked) {
      return res.status(403).json({ message: "Account is blocked. Contact support." });
    }

    if (!user) {
      const nameParts = (name || "User").split(" ");
      const firstName = nameParts[0] || "User";
      const lastName = nameParts.slice(1).join(" ") || "";

      user = new User({
        firstName,
        lastName,
        email,
        emailHash: hashedEmailField,
        googleId: uid,
        authProvider: "google",
        authMethods: { local: false, google: true, facebook: false },
        profileImage: { url: picture || "/uploads/profile.png" },
        isVerified: true,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });

      await user.save();
      logger.signup(`New Google user: ${email}`, req.ip, user._id);
    } else {
      if (!user.authMethods.google) {
        user.authMethods.google = true;
        user.googleId = uid;
        await user.save();
      }
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const incomingDeviceId = req.headers["x-device-id"];
    const deviceName = req.headers["x-device-name"] || "Unknown Device";
    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "Unknown";
    const userAgent = req.headers["user-agent"] || "Unknown";
    const now = new Date().toISOString();

    logger.auth(`Google login: ${email}`, ip, user._id);

    user.loginHistory.push({ ipAddress: ip, authProvider: "google" });
    await user.save();

    const existingRaw = await redisClient.get(sessionKey(user._id));
    let session = existingRaw ? JSON.parse(existingRaw) : null;
    let activeDeviceId;

    if (session) {
      if (!Array.isArray(session.devices)) session.devices = [];
      const matchIdx = incomingDeviceId
        ? session.devices.findIndex((d) => d.deviceId === incomingDeviceId)
        : -1;

      if (matchIdx !== -1) {
        session.devices[matchIdx].lastActive = now;
        session.devices[matchIdx].loginAt = now;
        session.devices[matchIdx].deviceName = deviceName;
        activeDeviceId = session.devices[matchIdx].deviceId;
      } else {
        activeDeviceId = incomingDeviceId || uuidv4();
        session.devices.push({ deviceId: activeDeviceId, deviceName, ip, userAgent, lastActive: now, loginAt: now });
      }
      session.role = user.role;
      session.name = `${user.firstName} ${user.lastName}`;
    } else {
      activeDeviceId = incomingDeviceId || uuidv4();
      session = {
        userId: user._id.toString(),
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        loginAt: now,
        devices: [{ deviceId: activeDeviceId, deviceName, ip, userAgent, lastActive: now, loginAt: now }],
      };
    }

    await redisClient.set(sessionKey(user._id), JSON.stringify(session), { EX: SESSION_TTL });

    let providerStatus = null;
    if (user.role === "provider") {
      providerStatus = user.providerProfile?.verified ? "approved" : "pending";
    }

    return res.status(200).json({
      message: "Login successful",
      token,
      deviceId: activeDeviceId,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profileImage: user.profileImage?.url || null,
        ...(user.role === "provider" && { providerStatus }),
      },
    });
  } catch (err) {
    console.error("[google-auth]", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;