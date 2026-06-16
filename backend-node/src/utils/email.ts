import nodemailer from "nodemailer";
import crypto from "crypto";

// Mock Ethereal Email Configuration
// In production, replace with actual SMTP credentials (e.g., SendGrid, AWS SES)
export const createTransporter = async () => {
  if (process.env.NODE_ENV === 'production' && !process.env.SMTP_HOST) {
    // Return a mock transporter if no SMTP config is provided in production
    return {
      sendMail: async (opts: any) => {
        console.log(`[MOCK EMAIL] To: ${opts.to}, Subject: ${opts.subject}`);
        return { messageId: 'mock-id' };
      }
    } as any;
  }

  let user = process.env.SMTP_USER;
  let pass = process.env.SMTP_PASS?.replace(/\s+/g, ''); // Remove spaces from app password

  console.log('[EMAIL] Using SMTP_USER:', user, 'SMTP_HOST:', process.env.SMTP_HOST);

  // Only generate a test account if we do not have real credentials
  if (!user || !pass) {
    console.log('[EMAIL] No credentials found, generating test account...');
    const testAccount = await nodemailer.createTestAccount();
    user = testAccount.user;
    pass = testAccount.pass;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.ethereal.email",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: { user, pass },
    connectionTimeout: 10000, // 10 seconds to fail fast
    greetingTimeout: 10000,
    family: 4, // Force IPv4 to prevent hanging on Render's IPv6 network with Gmail
  });
};

export const sendOtpEmail = async (email: string, otp: string) => {
  console.log('[EMAIL] Creating transporter...');
  const transporter = await createTransporter();
  console.log('[EMAIL] Transporter created, sending mail...');

  const info = await transporter.sendMail({
    from: '"TalentAI Security" <security@talentai.app>',
    to: email,
    subject: "Verify your TalentAI Account",
    html: `
      <div style="font-family: sans-serif; max-w-md; margin: auto;">
        <h2>Welcome to TalentAI</h2>
        <p>Please verify your email address by entering the following 6-digit code:</p>
        <div style="padding: 20px; background: #f8fafc; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #0f172a;">
          ${otp}
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">This code will expire in 10 minutes.</p>
      </div>
    `,
  });

  if (info.messageId !== 'mock-id') {
    console.log("OTP email preview URL: %s", nodemailer.getTestMessageUrl(info));
  }
};

export const sendPasswordResetOtpEmail = async (email: string, otp: string) => {
  const transporter = await createTransporter();

  const info = await transporter.sendMail({
    from: '"TalentAI Security" <security@talentai.app>',
    to: email,
    subject: "Reset your TalentAI Password",
    html: `
      <div style="font-family: sans-serif; max-w-md; margin: auto;">
        <h2>Password Reset Request</h2>
        <p>You requested to reset your password. Use the following 6-digit code to verify your identity:</p>
        <div style="padding: 20px; background: #f8fafc; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #0f172a;">
          ${otp}
        </div>
        <p style="color: #64748b; font-size: 14px; margin-top: 20px;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `,
  });

  if (info.messageId !== 'mock-id') {
    console.log("Password reset OTP preview URL: %s", nodemailer.getTestMessageUrl(info));
  }
};

// Now generates 6-digit OTP
export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};
