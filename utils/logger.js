const fs = require("fs");
const path = require("path");

const LOG_DIR = path.join(__dirname, "..", "logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const levels = { info: "INFO", warn: "WARN", error: "ERROR" };

function logFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `alerts-${date}.log`);
}

function formatEntry(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...meta,
  };
  return JSON.stringify(entry) + "\n";
}

function append(level, message, meta = {}) {
  try {
    fs.appendFileSync(logFile(), formatEntry(level, message, meta), "utf8");
  } catch (err) {
    console.error("Logger write failed:", err.message);
  }
}

const logger = {
  info: (message, meta) => append("info", message, meta),
  warn: (message, meta) => append("warn", message, meta),
  error: (message, meta) => append("error", message, meta),

  auth: (message, ip, userId) =>
    append("info", message, { type: "auth", ip, userId }),

  block: (message, ip, adminId, targetId) =>
    append("warn", message, { type: "block", ip, adminId, targetId }),

  signup: (message, ip, userId) =>
    append("info", message, { type: "signup", ip, userId }),

  getAlerts: ({ page = 1, limit = 20, types } = {}) => {
    try {
      const files = fs
        .readdirSync(LOG_DIR)
        .filter((f) => f.startsWith("alerts-"))
        .sort()
        .reverse();

      const all = [];

      for (const file of files) {
        const lines = fs
          .readFileSync(path.join(LOG_DIR, file), "utf8")
          .split("\n")
          .filter(Boolean);

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (types && !types.includes(entry.type) && !types.includes(entry.level)) continue;
            all.push(entry);
          } catch {}
        }
      }

      const total = all.length;
      const skip = (page - 1) * limit;
      const items = all.slice(skip, skip + limit);

      return {
        alerts: items,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      console.error("Logger read failed:", err.message);
      return { alerts: [], pagination: { total: 0, page: 1, limit, totalPages: 0 } };
    }
  },

  clearOld: (days = 30) => {
    try {
      const cutoff = Date.now() - days * 86400000;
      const files = fs.readdirSync(LOG_DIR).filter((f) => f.startsWith("alerts-"));
      for (const file of files) {
        const dateStr = file.replace("alerts-", "").replace(".log", "");
        const fileDate = new Date(dateStr).getTime();
        if (fileDate < cutoff) {
          fs.unlinkSync(path.join(LOG_DIR, file));
        }
      }
    } catch (err) {
      console.error("Logger clear failed:", err.message);
    }
  },
};

module.exports = logger;
