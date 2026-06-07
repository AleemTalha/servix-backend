const mongoose = require("mongoose");

const CHATTING_DB_URI =
  process.env.CHATTING_DB_URI || "mongodb://localhost:27017/chatting_db";

const chattingDb = mongoose.createConnection(CHATTING_DB_URI, {
  serverSelectionTimeoutMS: 5000,
});

chattingDb.on("connected", () => {
  console.log("✅ Chatting DB connected successfully");
});

chattingDb.on("error", (err) => {
  console.error("❌ Chatting DB connection error:", err.message);
});

module.exports = chattingDb;
