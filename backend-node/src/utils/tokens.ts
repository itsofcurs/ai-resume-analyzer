import jwt, { JwtHeader, SigningKeyCallback } from "jsonwebtoken";
import { logger } from "./logger"; // Assumes a logger exists, or we use console.

// Helper to safely parse keys
const parseKeys = (jsonStr: string | undefined): Record<string, string> => {
  if (!jsonStr) return {};
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse JWT_KEYS", e);
    return {};
  }
};

const ACCESS_KEYS = parseKeys(process.env.JWT_KEYS);
const REFRESH_KEYS = parseKeys(process.env.JWT_REFRESH_KEYS);

// Fallbacks for backwards compatibility/dev
const FALLBACK_ACCESS_SECRET = process.env.JWT_SECRET || "fallback-access-secret-for-dev";
const FALLBACK_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "fallback-refresh-secret-for-dev";

// Active Key IDs
const ACTIVE_ACCESS_KID = process.env.JWT_ACTIVE_KID || 'default';
const ACTIVE_REFRESH_KID = process.env.JWT_REFRESH_ACTIVE_KID || 'default';

if (!ACCESS_KEYS[ACTIVE_ACCESS_KID]) {
  ACCESS_KEYS[ACTIVE_ACCESS_KID] = FALLBACK_ACCESS_SECRET;
}
if (!REFRESH_KEYS[ACTIVE_REFRESH_KID]) {
  REFRESH_KEYS[ACTIVE_REFRESH_KID] = FALLBACK_REFRESH_SECRET;
}

export interface TokenPayload {
  userId: string;
  organizationId: string | null;
  role: string;
  iat?: number;
}

export const generateAccessToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, ACCESS_KEYS[ACTIVE_ACCESS_KID], {
    keyid: ACTIVE_ACCESS_KID,
    expiresIn: "15m", // 15 minutes
    issuer: "TalentAI",
    audience: "TalentAI-App",
  });
};

export const generateRefreshToken = (payload: { userId: string }): string => {
  return jwt.sign(payload, REFRESH_KEYS[ACTIVE_REFRESH_KID], {
    keyid: ACTIVE_REFRESH_KID,
    expiresIn: "7d", // 7 days
    issuer: "TalentAI",
    audience: "TalentAI-App",
  });
};

const getAccessSecret = (header: JwtHeader, callback: SigningKeyCallback) => {
  const kid = header.kid || 'default';
  const key = ACCESS_KEYS[kid];
  if (!key) {
    return callback(new Error(`Unknown kid: ${kid}`));
  }
  callback(null, key);
};

const getRefreshSecret = (header: JwtHeader, callback: SigningKeyCallback) => {
  const kid = header.kid || 'default';
  const key = REFRESH_KEYS[kid];
  if (!key) {
    return callback(new Error(`Unknown kid: ${kid}`));
  }
  callback(null, key);
};

export const verifyAccessToken = async (token: string): Promise<TokenPayload> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getAccessSecret, {
      issuer: "TalentAI",
      audience: "TalentAI-App",
    }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded as TokenPayload);
    });
  });
};

export const verifyRefreshToken = async (token: string): Promise<{ userId: string }> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getRefreshSecret, {
      issuer: "TalentAI",
      audience: "TalentAI-App",
    }, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded as { userId: string });
    });
  });
};
