const logger = require("../utils/logger");

const requestLogger = (req, res, next) => {
  const start = Date.now();

  const originalEnd = res.end;
  const originalJson = res.json;

  let responseBody = null;

  res.json = function (body) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  res.end = function (...args) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    const logData = {
      method: req.method,
      url: req.originalUrl,
      status: statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.headers["x-forwarded-for"] || "unknown",
      userAgent: req.headers["user-agent"] || "unknown",
      deviceId: req.headers["x-device-id"] || null,
      userId: req.user?.id || null,
      contentType: req.headers["content-type"] || null,
      referer: req.headers["referer"] || null,
    };

    if (req.method !== "GET" && req.body && Object.keys(req.body).length > 0) {
      const safeBody = { ...req.body };
      if (safeBody.password) safeBody.password = "***";
      if (safeBody.token) safeBody.token = "***";
      if (safeBody.otp) safeBody.otp = "***";
      logData.requestBody = safeBody;
    }

    if (req.params && Object.keys(req.params).length > 0) {
      logData.params = req.params;
    }

    if (req.query && Object.keys(req.query).length > 0) {
      logData.query = req.query;
    }

    logger.request(logData);

    if (statusCode >= 400) {
      const errorData = {
        ...logData,
        responseMessage: responseBody?.message || null,
        responseSuccess: responseBody?.success ?? null,
      };
      logger.errorLog(errorData);
    }

    return originalEnd.apply(this, args);
  };

  next();
};

module.exports = requestLogger;
