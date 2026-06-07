const { redisClient } = require("../config/redis");
const { generateOTP, sendOTPEmail } = require("./emailService");

const OTP_EXPIRY = 600;
const REGISTRATION_DATA_EXPIRY = 3600;

const createRegistrationSession = async (email, userData) => {
  const sessionKey = `register:${email}`;
  await redisClient.set(sessionKey, JSON.stringify(userData), {
    EX: REGISTRATION_DATA_EXPIRY,
  });
  return sessionKey;
};

const getRegistrationSession = async (email) => {
  const sessionKey = `register:${email}`;
  const data = await redisClient.get(sessionKey);
  return data ? JSON.parse(data) : null;
};

const deleteRegistrationSession = async (email) => {
  const sessionKey = `register:${email}`;
  await redisClient.del(sessionKey);
};

const storeOTP = async (email, otp) => {
  const otpKey = `otp:${email}`;
  await redisClient.set(otpKey, otp, { EX: OTP_EXPIRY });
};

const verifyOTP = async (email, otp) => {
  const otpKey = `otp:${email}`;
  const storedOTP = await redisClient.get(otpKey);
  return storedOTP === otp;
};

const deleteOTP = async (email) => {
  const otpKey = `otp:${email}`;
  await redisClient.del(otpKey);
};

const sendOTPToEmail = async (email, userName) => {
  const otp = generateOTP();
  await storeOTP(email, otp);
  const result = await sendOTPEmail(email, otp, userName);
  return result;
};

const checkOTPAttempts = async (email) => {
  const attemptsKey = `otp:attempts:${email}`;
  const attempts = await redisClient.get(attemptsKey);
  return attempts ? parseInt(attempts) : 0;
};

const incrementOTPAttempts = async (email) => {
  const attemptsKey = `otp:attempts:${email}`;
  const current = await checkOTPAttempts(email);
  const newAttempts = current + 1;
  await redisClient.set(attemptsKey, newAttempts.toString(), { EX: 3600 });
  return newAttempts;
};

const resetOTPAttempts = async (email) => {
  const attemptsKey = `otp:attempts:${email}`;
  await redisClient.del(attemptsKey);
};

module.exports = {
  createRegistrationSession,
  getRegistrationSession,
  deleteRegistrationSession,
  storeOTP,
  verifyOTP,
  deleteOTP,
  sendOTPToEmail,
  checkOTPAttempts,
  incrementOTPAttempts,
  resetOTPAttempts,
};
