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

  // Using a test account for development
  const testAccount = await nodemailer.createTestAccount();

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.ethereal.email",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER || testAccount.user,
      pass: process.env.SMTP_PASS || testAccount.pass,
    },
  });
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const transporter = await createTransporter();
  const verifyUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/verify-email?token=${token}`;

  const info = await transporter.sendMail({
    from: '"TalentAI Security" <security@talentai.app>',
    to: email,
    subject: "Verify your TalentAI Account",
    html: `
      <h2>Welcome to TalentAI</h2>
      <p>Please verify your email address by clicking the link below:</p>
      <a href="${verifyUrl}" style="padding: 10px 20px; background: #4f46e5; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
    `,
  });

  console.log("Verification email preview URL: %s", nodemailer.getTestMessageUrl(info));
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
  const transporter = await createTransporter();
  const resetUrl = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${token}`;

  const info = await transporter.sendMail({
    from: '"TalentAI Security" <security@talentai.app>',
    to: email,
    subject: "Reset your TalentAI Password",
    html: `
      <h2>Password Reset Request</h2>
      <p>You requested to reset your password. Click the link below to set a new one:</p>
      <a href="${resetUrl}" style="padding: 10px 20px; background: #e11d48; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
      <p>This link will expire in 15 minutes. If you did not request this, please ignore this email.</p>
    `,
  });

  console.log("Password reset email preview URL: %s", nodemailer.getTestMessageUrl(info));
};

export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};
