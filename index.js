const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const morgan = require("morgan");
const cors = require("cors");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");
const logger = require("./utils/logger");
const requestLogger = require("./middlewares/requestLogger");

const Conversation = require("./models/conversation.models");
const Message = require("./models/message.models");

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-device-id", "x-device-name"],
  exposedHeaders: ["x-device-id"],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  logger.info("Uploads directory created", { path: uploadsDir });
}

app.use("/uploads", express.static(uploadsDir, {
  maxAge: '1d',
  etag: false,
  setHeaders: (res, filePath) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
  }
}));

app.use("/api", require("./routes/api.routes"));

app.get("/health", (req, res) => {
  res.json({ status: "Backend is running perfectly ✅" });
});

app.get("/uploads-check", (req, res) => {
  const files = fs.readdirSync(uploadsDir);
  res.json({
    uploadsDir: uploadsDir,
    filesCount: files.length,
    files: files.slice(0, 10),
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
  logger.errorLog({
    type: "unhandled_error",
    method: req.method,
    url: req.originalUrl,
    error: err.message,
    stack: err.stack,
    ip: req.ip,
  });
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const onlineUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    logger.socket({ event: "auth_failed", reason: "No token" });
    return next(new Error("No token"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    logger.socket({ event: "auth_failed", reason: "Invalid token" });
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.userId;
  onlineUsers.set(userId, socket.id);

  logger.socket({
    event: "connected",
    userId,
    socketId: socket.id,
    onlineCount: onlineUsers.size,
  });

  socket.join(userId);

  socket.on("sendMessage", async (data) => {
    try {
      const { conversationId, receiverId, text } = data;
      if (!text || !receiverId) return;

      let convId = conversationId;

      if (!convId) {
        let conv = await Conversation.findOne({
          participants: { $all: [userId, receiverId], $size: 2 },
        });
        if (!conv) {
          conv = await Conversation.create({
            participants: [userId, receiverId],
          });
        }
        convId = conv._id;
      }

      const message = await Message.create({
        conversation: convId,
        sender: userId,
        text: text,
      });

      await Conversation.findByIdAndUpdate(convId, {
        lastMessage: message._id,
      });

      const msgData = {
        _id: message._id,
        conversation: convId,
        sender: userId,
        text: message.text,
        read: false,
        createdAt: message.createdAt,
      };

      io.to(receiverId).emit("receiveMessage", msgData);
      io.to(userId).emit("receiveMessage", msgData);

      logger.socket({
        event: "message_sent",
        from: userId,
        to: receiverId,
        conversationId: convId.toString(),
        messageId: message._id.toString(),
      });
    } catch (err) {
      logger.socket({
        event: "message_error",
        userId,
        error: err.message,
      });
    }
  });

  socket.on("markRead", async (data) => {
    try {
      const { conversationId } = data;
      await Message.updateMany(
        { conversation: conversationId, sender: { $ne: userId }, read: false },
        { read: true }
      );

      logger.socket({
        event: "messages_read",
        userId,
        conversationId,
      });
    } catch (err) {
      logger.socket({
        event: "markRead_error",
        userId,
        error: err.message,
      });
    }
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    logger.socket({
      event: "disconnected",
      userId,
      socketId: socket.id,
      onlineCount: onlineUsers.size,
    });
  });
});

module.exports = { app, server };

const port = process.env.PORT || 8080;

server.listen(port, async () => {
  try {
    await connectDB();
    await connectRedis();

    logger.info("Server started", { port, env: process.env.NODE_ENV || "development" });
      console.log(`Server is running on port ${port}`);
      console.log(`Socket.IO ready on port ${port}`);
      console.log(`Logging to: ${path.join(__dirname, "logs")}`);
    } catch (error) {
      logger.errorLog({
        type: "startup_error",
        error: error.message,
        stack: error.stack,
      });
      console.error("Error starting server:", error);
      process.exit(1);
    }
  });