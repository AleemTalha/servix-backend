const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const sendOtpEmail = async (toEmail, otp, firstName) => {
  const mailOptions = {
    from: `Servix | Daily Life, Simplified <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject: "Verify your email address",
    html: `
      <div style="
        margin:0;
        padding:40px 20px;
        background:#ffffff;
        font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        color:#111111;
      ">
        <div style="
          max-width:560px;
          margin:0 auto;
          border:1px solid #e5e5e5;
          border-radius:12px;
          padding:48px 40px;
          box-sizing:border-box;
        ">

          <div style="
            font-size:18px;
            font-weight:700;
            letter-spacing:-0.02em;
            margin-bottom:32px;
          ">
            Your App Name
          </div>

          <h1 style="
            margin:0 0 12px;
            font-size:28px;
            font-weight:700;
            line-height:1.2;
            color:#000000;
          ">
            Verify your email
          </h1>

          <p style="
            margin:0;
            font-size:16px;
            line-height:1.7;
            color:#444444;
          ">
            Hi ${firstName},
          </p>

          <p style="
            margin:24px 0;
            font-size:16px;
            line-height:1.7;
            color:#444444;
          ">
            Welcome! Use the verification code below to confirm your email address and complete your account setup.
          </p>

          <div style="
            text-align:center;
            margin:40px 0;
          ">
            <div style="
              display:inline-block;
              padding:18px 28px;
              border:1px solid #d4d4d4;
              border-radius:10px;
              background:#fafafa;
              font-size:36px;
              font-weight:700;
              letter-spacing:12px;
              color:#000000;
            ">
              ${otp}
            </div>
          </div>

          <p style="
            margin:0;
            font-size:15px;
            line-height:1.7;
            color:#444444;
          ">
            This verification code will expire in 10 minutes.
          </p>

          <p style="
            margin:16px 0 0;
            font-size:15px;
            line-height:1.7;
            color:#444444;
          ">
            If you didn't request this code, you can safely ignore this email.
          </p>

          <div style="
            margin-top:40px;
            padding-top:24px;
            border-top:1px solid #eeeeee;
          ">
            <p style="
              margin:0;
              font-size:13px;
              color:#777777;
              line-height:1.6;
            ">
              This is an automated email. Please do not reply.
            </p>
          </div>

        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendOtpEmail };
