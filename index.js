const express = require("express");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const morgan = require("morgan");
const cors = require("cors");

const connectDB = require("./config/db");
const { connectRedis } = require("./config/redis");

const serviceAccount = require("./firebase-admin-servix.json");
const admin = require("firebase-admin");

const app = express();

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

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log("✅ Uploads directory created at:", uploadsDir);
}

// Serve static files from uploads folder
app.use("/uploads", express.static(uploadsDir, {
  maxAge: '1d',
  etag: false,
  setHeaders: (res, filePath) => {
    // Allow all CORS headers for image files
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    // Set appropriate content type
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
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

const port = process.env.PORT || 8080;

app.listen(port, async () => {
  try {
    await connectDB();
    await connectRedis();

    console.log(`Server is running on port ${port}`);
  } catch (error) {
    console.error("Error starting server:", error);
    process.exit(1);
  }
});