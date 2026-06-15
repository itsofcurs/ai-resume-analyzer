import speakeasy from "speakeasy";
import QRCode from "qrcode";

export const generateMfaSecret = async (email: string) => {
  const secret = speakeasy.generateSecret({
    name: `TalentAI (${email})`,
  });

  let qrCodeDataUrl = "";
  if (secret.otpauth_url) {
    qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);
  }

  return {
    secret: secret.base32,
    qrCodeDataUrl,
  };
};

export const verifyMfaToken = (secret: string, token: string): boolean => {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 1, // Allow 30 seconds drift before or after
  });
};
