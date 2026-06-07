const crypto = require("crypto");

const generateOtp = () => {
  const buffer = crypto.randomBytes(3);
  const num = buffer.readUIntBE(0, 3) % 1000000;
  return String(num).padStart(6, "0");
};

const hashOtp = (otp) =>
  crypto
    .createHash("sha256")
    .update(otp + process.env.OTP_SALT)
    .digest("hex");

const verifyOtp = (plainOtp, hashedOtp) =>
  crypto.timingSafeEqual(
    Buffer.from(hashOtp(plainOtp)),
    Buffer.from(hashedOtp)
  );

module.exports = {
  generateOtp,
  hashOtp,
  verifyOtp,
};