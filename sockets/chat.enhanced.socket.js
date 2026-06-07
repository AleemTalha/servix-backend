const jwt = require("jsonwebtoken");
const { redisClient } = require("../config/redis");
const User = require("../models/user.models");
const admin = require("../config/firebase");
const SocketHandler = require("../services/chat/SocketHandler");

const initializeEnhancedSocket = (io) => {
  const socketHandler = new SocketHandler(io);

  // Auth middleware (reused from existing socket)
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const sessionKey = `session:${decoded.id}`;
      const sessionData = await redisClient.get(sessionKey);

      if (!sessionData) {
        return next(new Error("Session expired"));
      }

      const user = await User.findById(decoded.id).select(
        "firstName lastName email profileImage role"
      );

      if (!user) {
        return next(new Error("User not found"));
      }

      socket.userId = user._id.toString();
      socket.user = user;
      next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return next(new Error("Token expired"));
      }
      return next(new Error("Authentication failed"));
    }
  });

  io.on("connection", (socket) => {
    console.log(`🔌 Enhanced socket connected: ${socket.userId}`);
    socketHandler.registerHandlers(socket);
  });
};

module.exports = initializeEnhancedSocket;
