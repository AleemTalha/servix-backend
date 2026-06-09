const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(__dirname, "..", "logs", "app.log");

const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

function timestamp() {
  return new Date().toISOString();
}

function write(level, category, message, meta = {}) {
  try {
    const entry = {
      timestamp: timestamp(),
      level,
      category,
      message,
      ...meta,
    };
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("Logger write failed:", err.message);
  }
}

const logger = {
  info: (message, meta) => write("info", "general", message, meta),
  warn: (message, meta) => write("warn", "general", message, meta),
  error: (message, meta) => write("error", "general", message, meta),

  auth: (message, ip, userId) =>
    write("info", "auth", message, { ip, userId }),

  block: (message, ip, adminId, targetId) =>
    write("warn", "auth", message, { ip, adminId, targetId }),

  signup: (message, ip, userId) =>
    write("info", "auth", message, { ip, userId }),

  request: (data) => write("info", "request", `${data.method} ${data.url} ${data.status}`, data),

  errorLog: (data) => write("error", "request", `${data.method} ${data.url} ${data.status}`, data),

  socket: (data) => write("info", "socket", data.event || "socket_event", data),

  getAlerts: ({ page = 1, limit = 20, types } = {}) => {
    try {
      if (!fs.existsSync(LOG_FILE)) {
        return { alerts: [], pagination: { total: 0, page: 1, limit, totalPages: 0 } };
      }

      const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
      const all = [];

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (types && !types.includes(entry.category) && !types.includes(entry.level)) continue;
          all.push(entry);
        } catch {}
      }

      all.reverse();
      const total = all.length;
      const skip = (page - 1) * limit;
      const items = all.slice(skip, skip + limit);

      return {
        alerts: items,
        pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    } catch (err) {
      console.error("Logger read failed:", err.message);
      return { alerts: [], pagination: { total: 0, page: 1, limit, totalPages: 0 } };
    }
  },

  clearOld: (days = 30) => {
    try {
      if (!fs.existsSync(LOG_FILE)) return;
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
      const kept = lines.filter((line) => {
        try {
          const entry = JSON.parse(line);
          return entry.timestamp >= cutoff;
        } catch {
          return false;
        }
      });
      fs.writeFileSync(LOG_FILE, kept.join("\n") + (kept.length ? "\n" : ""), "utf8");
    } catch (err) {
      console.error("Logger clear failed:", err.message);
    }
  },
};

module.exports = logger;
