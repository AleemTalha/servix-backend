const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const HMAC_SECRET = process.env.HMAC_SECRET;
const IV_LENGTH = 16;
const ALGORITHM = "aes-256-cbc";

if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY, "hex").length !== 32) {
  throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
}

if (!HMAC_SECRET) {
  throw new Error("HMAC_SECRET must be set in environment variables");
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  const encrypted = Buffer.concat([cipher.update(String(text)), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  if (!text) return text;
  try {
    const [ivHex, encryptedHex] = text.split(":");
    if (!ivHex || !encryptedHex) return text;
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY, "hex"),
      iv
    );
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString();
  } catch {
    return text;
  }
}

function hashEmail(email) {
  if (!email) return email;
  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(email.toLowerCase().trim())
    .digest("hex");
}

module.exports = { encrypt, decrypt, hashEmail };