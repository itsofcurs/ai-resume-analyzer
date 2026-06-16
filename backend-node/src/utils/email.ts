import crypto from "crypto";

export const generateOTP = (): string => {
  return crypto.randomInt(100000, 1000000).toString();
};

export const generateSecureToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};
