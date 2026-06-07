const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ✨ Comprehensive MIME types for all common image formats
const ALLOWED_IMAGE_MIMES = [
  // Common formats
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  
  // Additional formats
  "image/bmp",
  "image/tiff",
  "image/x-tiff",
  "image/tiff-fx",
  
  // Apple formats
  "image/heic",
  "image/heif",
  "image/x-heic",
  "image/x-heif",
  
  // Microsoft formats
  "image/vnd.microsoft.icon",
  "image/x-icon",
  
  // Adobe formats
  "image/x-adobe-dng",
  
  // Raw image formats
  "image/x-canon-cr2",
  "image/x-canon-crw",
  "image/x-canon-raf",
  "image/x-nikon-nef",
  "image/x-sony-arw",
];

// ✨ Allowed file extensions (case-insensitive)
const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".bmp", ".tiff", ".tif", ".ico", ".icon",
  ".heic", ".heif", ".dng", ".cr2", ".crw", ".raf", ".nef", ".arw"
];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create organized directory structure: uploads/images/YYYY/MM
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const imageDir = path.join(uploadsDir, "images", String(year), month);
    
    if (!fs.existsSync(imageDir)) {
      fs.mkdirSync(imageDir, { recursive: true });
    }
    
    cb(null, imageDir);
  },
  
  filename: (req, file, cb) => {
    try {
      // Generate unique filename: timestamp-random-originalname
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const extension = path.extname(file.originalname).toLowerCase();
      const nameWithoutExt = path.basename(file.originalname, extension);
      
      // Sanitize original filename
      const sanitizedName = nameWithoutExt
        .replace(/[^a-zA-Z0-9-_]/g, "_")
        .substring(0, 30);
      
      const filename = `${sanitizedName}-${uniqueSuffix}${extension}`;
      cb(null, filename);
    } catch (err) {
      cb(err);
    }
  },
});

// ✨ Enhanced file filter with proper validation and mobile support
const fileFilter = (req, file, cb) => {
  try {
    const extension = path.extname(file.originalname).toLowerCase();
    
    console.log(`📥 [Multer] File upload attempt:`);
    console.log(`   - Filename: ${file.originalname}`);
    console.log(`   - Extension: ${extension}`);
    console.log(`   - MIME type: ${file.mimetype}`);
    console.log(`   - Encoding: ${file.encoding}`);
    console.log(`   - Size: ${file.size} bytes`);

    // ✨ Check file extension first (works for all devices including mobile)
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      console.warn(`❌ [Multer] Invalid extension: ${extension}`);
      return cb(
        new Error(`Invalid file extension: ${extension}. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`),
        false
      );
    }

    // ✨ MIME type validation with fallback for mobile devices
    const isValidMimeType = ALLOWED_IMAGE_MIMES.includes(file.mimetype);
    const isMobileOctetStream = file.mimetype === "application/octet-stream";
    
    // Accept file if:
    // 1. MIME type is recognized (good case)
    // 2. MIME type is octet-stream BUT extension is valid (mobile device case)
    // 3. MIME type is application/* but extension is valid (fallback)
    const isAcceptable = isValidMimeType || 
                         (isMobileOctetStream && ALLOWED_EXTENSIONS.includes(extension)) ||
                         (file.mimetype.startsWith("application/") && ALLOWED_EXTENSIONS.includes(extension));

    if (!isAcceptable) {
      console.warn(`❌ [Multer] Invalid or unsupported MIME type: ${file.mimetype}`);
      return cb(
        new Error(
          `Unsupported file format. Please upload JPEG, PNG, GIF, WebP, SVG, BMP, TIFF, HEIC, or raw image formats`
        ),
        false
      );
    }

    // Additional security: check original filename length
    if (file.originalname.length > 255) {
      console.warn(`❌ [Multer] Filename too long: ${file.originalname.length} characters`);
      return cb(new Error("Filename too long (max 255 characters)"), false);
    }

    console.log(`✅ [Multer] File accepted!`);
    cb(null, true);
  } catch (err) {
    console.error(`❌ [Multer] Filter error: ${err.message}`);
    cb(err, false);
  }
};

// ✨ Main upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit (increased from 5MB for better flexibility)
    files: 1,
  },
});

// ✨ Error handling wrapper with detailed logging
const handleMulterError = (err, req, res, next) => {
  // Log all errors for debugging
  console.log(`\n🔍 [Multer Error Handler] Processing error:`);
  console.log(`   - Error type: ${err?.constructor?.name}`);
  console.log(`   - Error code: ${err?.code}`);
  console.log(`   - Error message: ${err?.message}`);
  console.log(`   - File info: ${req.file ? JSON.stringify(req.file, null, 2) : "No file"}`);
  console.log(`   - Fields: ${JSON.stringify(req.body)}`);

  if (err instanceof multer.MulterError) {
    console.error(`\n❌ [Multer] MulterError detected:`, err.code);
    
    if (err.code === "LIMIT_FILE_SIZE") {
      console.warn(`   → File exceeds size limit (10MB max)`);
      return res.status(400).json({
        success: false,
        message: "File size too large. Maximum allowed: 10MB",
      });
    }
    
    if (err.code === "LIMIT_FILE_COUNT") {
      console.warn(`   → Too many files in single request`);
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum: 1 file per request",
      });
    }

    if (err.code === "LIMIT_PART_COUNT") {
      console.warn(`   → Too many form fields`);
      return res.status(400).json({
        success: false,
        message: "Form data too complex",
      });
    }

    console.warn(`   → Other MulterError: ${err.code}`);
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  }

  // Custom validation errors
  if (err && err.message) {
    console.warn(`\n⚠️  [Multer] Custom validation error:`, err.message);
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // Unknown error
  if (err) {
    console.error(`\n❌ [Multer] Unknown error:`, err);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred during file upload",
    });
  }

  // No error, continue
  console.log(`✅ [Multer] No errors, proceeding to next middleware\n`);
  next();
};

module.exports = {
  upload,
  handleMulterError,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_EXTENSIONS,
};