const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPEmail = async (email, otp, userName) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify Your Servix Account - OTP",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #03714A; text-align: center;">Welcome to Servix!</h2>
          <p style="font-size: 16px; color: #333;">Hello ${userName},</p>
          <p style="font-size: 14px; color: #666;">Thank you for registering with Servix. Please verify your email address using the OTP below:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
            <p style="font-size: 32px; font-weight: bold; color: #03714A; letter-spacing: 5px; margin: 0;">${otp}</p>
            <p style="font-size: 12px; color: #999; margin: 10px 0 0 0;">This code will expire in 10 minutes</p>
          </div>
          <p style="font-size: 14px; color: #666;">If you did not request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="font-size: 12px; color: #999; text-align: center;">Servix © 2026. All rights reserved.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending OTP email:", error);
    return { success: false, error: error.message };
  }
};

const sendWelcomeEmail = async (email, userName) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome to Servix!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #03714A; text-align: center;">Welcome to Servix!</h2>
          <p style="font-size: 16px; color: #333;">Hello ${userName},</p>
          <p style="font-size: 14px; color: #666;">Your email has been verified successfully. You can now login and start using Servix.</p>
          <a href="${process.env.FRONTEND_URL || "https://servix.app"}/login" style="display: inline-block; background-color: #03714A; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin-top: 20px;">Go to Login</a>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="font-size: 12px; color: #999; text-align: center;">Servix © 2026. All rights reserved.</p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
};
