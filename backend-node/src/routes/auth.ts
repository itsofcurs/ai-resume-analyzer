import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { prisma } from '../server';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} from '../utils/tokens';
import { generateOTP } from '../utils/email';
import { generateMfaSecret, verifyMfaToken } from '../utils/mfa';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth';
import { emailQueue } from '../queues/emailQueue';
import { otpTemplate, passwordResetTemplate } from '../templates';
import { configureOAuthProviders } from '../services/oauthService';
import { authLoginTotal, authFailedTotal, authLockedTotal, oauthLoginTotal, otpGeneratedTotal, otpVerifiedTotal, otpFailedTotal } from '../lib/telemetry';
import { validatePasswordPolicy } from '../lib/passwordPolicy';
import { sendSecurityNotification } from '../services/securityNotificationService';

// Initialize OAuth Providers
configureOAuthProviders();

const router = Router();

// Phase 8: Refresh Token Family Lifecycle Limit
const enforceRefreshTokenLimits = async (userId: string) => {
  const families = await prisma.refreshToken.findMany({
    where: { userId, revoked: false },
    select: { familyId: true },
    distinct: ['familyId'],
  });

  if (families.length > 10) {
    // Exceeded 10 devices, find oldest active tokens to revoke
    const excessCount = families.length - 10;
    
    // Get distinct family IDs ordered by their oldest token
    const oldestTokens = await prisma.refreshToken.findMany({
      where: { userId, revoked: false },
      orderBy: { createdAt: 'asc' },
    });

    const uniqueFamiliesInOrder = Array.from(new Set(oldestTokens.map(t => t.familyId)));
    const familiesToRevoke = uniqueFamiliesInOrder.slice(0, excessCount);

    if (familiesToRevoke.length > 0) {
      await prisma.refreshToken.updateMany({
        where: { familyId: { in: familiesToRevoke } },
        data: { revoked: true },
      });

      await prisma.auditLog.create({
        data: {
          userId,
          organizationId: 'system',
          action: 'SESSION_AUTO_REVOKED',
          resource: 'auth',
          severity: 'INFO',
          riskScore: 'LOW',
        }
      });
    }
  }
};

// --- Rate Limiters ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many registration attempts. Try again later.' },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification attempts. Try again later.' },
});

const resendOtpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many resend requests. Try again in 1 hour.' },
});

const pwdResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests. Try again in 1 hour.' },
});

// --- Routes ---

// 1. Registration
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, organizationName, termsAccepted, privacyAccepted } = req.body;
    
    const policyCheck = validatePasswordPolicy(password, email);
    if (!policyCheck.valid) {
      await prisma.auditLog.create({
        data: { userId: 'system', organizationId: 'system', action: 'PASSWORD_POLICY_FAILED', resource: 'auth' }
      }).catch(() => {});
      return res.status(400).json({ error: policyCheck.error });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.accountState === 'ACTIVE') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    let user = existing;
    if (!existing) {
      user = await prisma.user.create({
        data: { 
          email, 
          password: hashedPassword, 
          name,
          role: 'ADMIN',
          accountState: 'PENDING_VERIFICATION',
          organization: {
            create: { name: organizationName || `${name}'s Organization` }
          }
        },
        include: { organization: true }
      });

      // Record consent
      await prisma.userConsent.create({
        data: {
          userId: user.id,
          termsAccepted: !!termsAccepted,
          privacyAccepted: !!privacyAccepted,
          ipAddress: req.ip || 'Unknown'
        }
      });

      await prisma.auditLog.create({
        data: { userId: user.id, organizationId: user.organizationId!, action: 'user_register', resource: 'auth' }
      });
    } else {
      // Replace unverified user credentials
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, name }
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpHash = crypto.createHmac('sha256', process.env.OTP_SECRET || 'fallback_secret').update(otp).digest('hex');
    
    // Clear old OTPs
    await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });
    
    await prisma.emailOTP.create({
      data: {
        email,
        otpHash,
        type: 'REGISTER',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      }
    });

    // Queue email
    await emailQueue.add('send-otp', {
      to: email,
      subject: 'Verify your TalentAI Account',
      html: otpTemplate(otp),
      type: 'SEND_OTP'
    });

    otpGeneratedTotal.add(1);

    await prisma.auditLog.create({
      data: { userId: user!.id, organizationId: user!.organizationId || 'system', action: 'OTP_GENERATED', resource: 'auth' }
    });

    res.status(200).json({ success: true, message: 'OTP queued for delivery', email });
  } catch (error: any) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Verify OTP
router.post('/verify-otp', otpVerifyLimiter, async (req, res) => {
  try {
    const { email, otp, device, browser, os } = req.body;
    
    const record = await prisma.emailOTP.findFirst({
      where: { email, type: 'REGISTER' },
      orderBy: { createdAt: 'desc' }
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!record || !user) return res.status(400).json({ error: 'No pending verification found.' });

    if (record.attempts >= 5) {
      await prisma.emailOTP.delete({ where: { id: record.id } });
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'OTP_LOCKED', resource: 'auth' } });
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }

    if (record.expiresAt < new Date()) {
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'OTP_EXPIRED', resource: 'auth' } });
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    const hashedInput = crypto.createHmac('sha256', process.env.OTP_SECRET || 'fallback_secret').update(otp).digest('hex');
    if (hashedInput !== record.otpHash) {
      await prisma.emailOTP.update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } });
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'OTP_FAILED', resource: 'auth' } });
      otpFailedTotal.add(1);
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    // Success
    await prisma.user.update({
      where: { email },
      data: { accountState: 'ACTIVE', failedAttempts: 0, lockedUntil: null, lastLogin: new Date() }
    });

    await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });

    // Session creation
    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
    await prisma.session.create({
      data: {
        userId: user.id, device: device || 'Unknown', browser: browser || 'Unknown', os: os || 'Unknown',
        ipAddress, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');

    const familyId = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: { tokenHash, familyId, userId: user.id, device: device || 'Unknown', ip: ipAddress, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });
    
    // Phase 8 limit enforcement
    await enforceRefreshTokenLimits(user.id);
    
    // Audit log
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'REFRESH_TOKEN_ISSUED', resource: 'auth' } });

    otpVerifiedTotal.add(1);

    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'OTP_VERIFIED', resource: 'auth' } });
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'LOGIN_SUCCESS', resource: 'auth' } });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Resend OTP
router.post('/resend-otp', resendOtpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If registered, an OTP will be sent.' });
    if (user.accountState === 'ACTIVE') return res.status(400).json({ error: 'Email already verified.' });

    const otp = generateOTP();
    const otpHash = crypto.createHmac('sha256', process.env.OTP_SECRET || 'fallback_secret').update(otp).digest('hex');
    
    await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });
    await prisma.emailOTP.create({
      data: { email, otpHash, type: 'REGISTER', expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
    });

    await emailQueue.add('resend-otp', {
      to: email, subject: 'Verify your TalentAI Account', html: otpTemplate(otp), type: 'SEND_OTP'
    });

    res.json({ message: 'A new OTP has been queued.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, device, browser, os } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'Unknown';
    
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) {
      await prisma.loginAttempt.upsert({
        where: { email_ip: { email, ip } },
        update: { attempts: { increment: 1 } },
        create: { email, ip, attempts: 1 }
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(403).json({ error: 'Account locked. Try again later.' });
    }
    
    if (user.accountState === 'SUSPENDED' || user.accountState === 'DELETED') {
      return res.status(403).json({ error: 'Account suspended or deleted.' });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      const attempts = user.failedAttempts + 1;
      const lockedUntil = attempts >= 10 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedAttempts: attempts, lockedUntil }
      });
      await prisma.loginAttempt.upsert({
        where: { email_ip: { email, ip } },
        update: { attempts: { increment: 1 } },
        create: { email, ip, attempts: 1 }
      });
      if (lockedUntil) {
        authLockedTotal.add(1);
        await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'LOGIN_LOCKED', resource: 'auth' } });
      } else {
        authFailedTotal.add(1);
        await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'LOGIN_FAILED', resource: 'auth' } });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.accountState === 'PENDING_VERIFICATION') {
      return res.status(403).json({ error: 'Please verify your email before logging in.', unverified: true });
    }

    // Success
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() } });
    await prisma.loginAttempt.deleteMany({ where: { email } });

    // Risk-Based Authentication (RBA) Matrix
    const pastSessions = await prisma.session.findMany({ where: { userId: user.id } });
    const isNewDevice = pastSessions.length > 0 && !pastSessions.some(s => s.device === device);
    const isNewIp = pastSessions.length > 0 && !pastSessions.some(s => s.ipAddress === ip);
    
    let currentRiskScore = 0;
    if (isNewDevice) currentRiskScore += 30;
    if (isNewIp) currentRiskScore += 40;
    currentRiskScore += Math.min(30, user.failedAttempts * 10);
    
    if (isNewDevice) {
      await sendSecurityNotification(user.email, 'NEW_DEVICE', { device, location: ip });
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'NEW_DEVICE_LOGIN', resource: 'auth', severity: 'WARNING', riskScore: 'MEDIUM', numericRiskScore: currentRiskScore } });
    }
    
    // Phase 1 Heuristics: Treat New IP as New Country (mock)
    if (isNewIp) {
      await sendSecurityNotification(user.email, 'NEW_COUNTRY', { location: ip });
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'NEW_COUNTRY_LOGIN', resource: 'auth', severity: 'HIGH', riskScore: 'HIGH', numericRiskScore: currentRiskScore } });
    }

    if (user.mfaEnabled) {
      return res.json({ mfaRequired: true, userId: user.id });
    } else if (currentRiskScore >= 70) {
      // Adaptive MFA: Force Email Verification
      const otp = generateOTP();
      const otpHash = crypto.createHmac('sha256', process.env.OTP_SECRET || 'fallback_secret').update(otp).digest('hex');
      
      await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });
      await prisma.emailOTP.create({
        data: { email, otpHash, type: 'REGISTER', expiresAt: new Date(Date.now() + 10 * 60 * 1000) }
      });
  
      await emailQueue.add('send-otp', {
        to: email, subject: 'Security Alert: Verification Required', html: otpTemplate(otp), type: 'SEND_OTP'
      });
      
      return res.status(403).json({ error: 'Unusual login detected. Please verify your email.', unverified: true });
    }

    await prisma.session.create({
      data: {
        userId: user.id, device: device || 'Unknown', browser: browser || 'Unknown', os: os || 'Unknown',
        ipAddress: ip, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');

    const familyId = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: { tokenHash, familyId, userId: user.id, device: device || 'Unknown', ip, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });
    
    // Phase 8 limit enforcement
    await enforceRefreshTokenLimits(user.id);
    
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'REFRESH_TOKEN_ISSUED', resource: 'auth' } });

    authLoginTotal.add(1);

    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'LOGIN_SUCCESS', resource: 'auth' } });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. MFA Verification (Post-Login)
router.post('/verify-mfa-login', loginLimiter, async (req, res) => {
  try {
    const { userId, token, device, browser, os } = req.body;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) return res.status(400).json({ error: 'Invalid request' });

    if (!verifyMfaToken(user.mfaSecret, token)) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
    await prisma.session.create({
      data: {
        userId: user.id, device: device || 'Unknown', browser: browser || 'Unknown', os: os || 'Unknown',
        ipAddress, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');

    const familyId = crypto.randomUUID();
    await prisma.refreshToken.create({
      data: { tokenHash, familyId, userId: user.id, device: device || 'Unknown', ip: ipAddress, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });
    
    // Phase 8 limit enforcement
    await enforceRefreshTokenLimits(user.id);
    
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'REFRESH_TOKEN_ISSUED', resource: 'auth' } });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Refresh Token Rotation
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const dbToken = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    
    if (!dbToken) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    if (dbToken.revoked) {
      // REUSE DETECTED! Revoke all tokens in family
      await prisma.refreshToken.updateMany({
        where: { familyId: dbToken.familyId },
        data: { revoked: true }
      });
      await prisma.auditLog.create({
        data: { userId: dbToken.userId, organizationId: 'system', action: 'REFRESH_TOKEN_REUSE_DETECTED', resource: 'auth', severity: 'CRITICAL', riskScore: 'HIGH' }
      }).catch(() => {});
      
      const u = await prisma.user.findUnique({ where: { id: dbToken.userId }});
      if (u) {
        await sendSecurityNotification(u.email, 'TOKEN_COMPROMISE');
      }

      return res.status(401).json({ error: 'Token reuse detected. All sessions revoked.' });
    }
    
    if (dbToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Expired refresh token' });
    }

    const decoded = await verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || user.accountState !== 'ACTIVE') return res.status(401).json({ error: 'User not found or inactive' });

    // Rotate: Revoke the old token
    await prisma.refreshToken.update({
      where: { id: dbToken.id },
      data: { revoked: true }
    });
    
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'REFRESH_TOKEN_ROTATED', resource: 'auth' } }).catch(() => {});

    // Issue new tokens
    const newAccessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const newRefreshTokenStr = generateRefreshToken({ userId: user.id });
    const newTokenHash = crypto.createHash('sha256').update(newRefreshTokenStr).digest('hex');

    await prisma.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        familyId: dbToken.familyId,
        parentId: dbToken.id,
        userId: user.id,
        device: dbToken.device,
        ip: dbToken.ip,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    res.cookie('refreshToken', newRefreshTokenStr, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// 7. Logout
router.post('/logout', authenticateToken, async (req: any, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
    }
    
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'logout', resource: 'auth' } });

    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out' });
  }
});

// 8. Social OAuth
router.get('/google', (req, res, next) => {
  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Must be lax for OAuth redirects
    maxAge: 15 * 60 * 1000 // 15 minutes
  });
  
  // Log generation
  prisma.auditLog.create({
    data: { userId: 'system', organizationId: 'system', action: 'OAUTH_STATE_GENERATED', resource: 'auth' }
  }).catch(() => {});

  passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  const { state } = req.query;
  const { oauth_state } = req.cookies;

  if (!state || state !== oauth_state) {
    prisma.auditLog.create({
      data: { userId: 'system', organizationId: 'system', action: 'OAUTH_STATE_REJECTED', resource: 'auth' }
    }).catch(() => {});
    return res.status(400).json({ success: false, message: 'Invalid OAuth state' });
  }

  prisma.auditLog.create({
    data: { userId: 'system', organizationId: 'system', action: 'OAUTH_STATE_VALIDATED', resource: 'auth' }
  }).catch(() => {});
  
  res.clearCookie('oauth_state');
  next();
}, passport.authenticate('google', { session: false }), async (req, res) => {
  const user: any = req.user;
  
  const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
  const refreshTokenStr = generateRefreshToken({ userId: user.id });
  const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
  
  const familyId = crypto.randomUUID();
  await prisma.refreshToken.create({
    data: { tokenHash, familyId, userId: user.id, device: 'Google Auth', ip: req.ip, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });
  
  await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'REFRESH_TOKEN_ISSUED', resource: 'auth' } });

  oauthLoginTotal.add(1);

  await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'GOOGLE_LOGIN', resource: 'auth' } });

  res.cookie('refreshToken', refreshTokenStr, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth-success?token=${accessToken}`);
});

// 9. Forgot Password (Send OTP)
router.post('/forgot-password', pwdResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset code was queued.' });

    const otp = generateOTP();
    const otpHash = crypto.createHmac('sha256', process.env.OTP_SECRET || 'fallback_secret').update(otp).digest('hex');
    
    await prisma.emailOTP.deleteMany({ where: { email, type: 'RESET' } });
    await prisma.emailOTP.create({
      data: { email, otpHash, type: 'RESET', expiresAt: new Date(Date.now() + 15 * 60 * 1000) }
    });

    await emailQueue.add('send-reset', {
      to: email, subject: 'TalentAI Password Reset', html: passwordResetTemplate(otp), type: 'SEND_PASSWORD_RESET'
    });
    
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'PASSWORD_RESET_REQUESTED', resource: 'auth' } });

    res.json({ message: 'If that email exists, a reset code was queued.', email });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 10. Reset Password (Verify OTP & Change)
router.post('/reset-password', pwdResetLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    const policyCheck = validatePasswordPolicy(newPassword, email);
    if (!policyCheck.valid) {
      await prisma.auditLog.create({
        data: { userId: 'system', organizationId: 'system', action: 'PASSWORD_POLICY_FAILED', resource: 'auth' }
      }).catch(() => {});
      return res.status(400).json({ error: policyCheck.error });
    }

    const record = await prisma.emailOTP.findFirst({
      where: { email, type: 'RESET' },
      orderBy: { createdAt: 'desc' }
    });
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!record || !user) return res.status(400).json({ error: 'Invalid or expired OTP' });
    
    if (record.attempts >= 5) {
      await prisma.emailOTP.delete({ where: { id: record.id } });
      return res.status(400).json({ error: 'Too many attempts. Request a new code.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    const hashedInput = crypto.createHmac('sha256', process.env.OTP_SECRET || 'fallback_secret').update(otp).digest('hex');
    if (hashedInput !== record.otpHash) {
      await prisma.emailOTP.update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } });
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    // Check Password History
    const history = await prisma.passwordHistory.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    for (let old of history) {
      if (await bcrypt.compare(newPassword, old.password)) {
        return res.status(400).json({ error: 'You cannot reuse your last 5 passwords.' });
      }
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email },
      data: { password: hashedPassword, failedAttempts: 0, lockedUntil: null }
    });

    await prisma.passwordHistory.create({
      data: { userId: user.id, password: hashedPassword }
    });

    await prisma.emailOTP.deleteMany({ where: { email, type: 'RESET' } });
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'PASSWORD_CHANGED', resource: 'auth' } });
    
    await sendSecurityNotification(user.email, 'PASSWORD_CHANGED');

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 11. Sessions Management
router.get('/sessions', authenticateToken, async (req: any, res) => {
  try {
    const tokens = await prisma.refreshToken.findMany({
      where: { userId: req.user.id, revoked: false, expiresAt: { gt: new Date() } },
      select: { id: true, device: true, ip: true, createdAt: true, expiresAt: true }
    });
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load sessions' });
  }
});

router.post('/sessions/:id/revoke', authenticateToken, async (req: any, res) => {
  try {
    const token = await prisma.refreshToken.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!token) return res.status(404).json({ error: 'Session not found' });

    await prisma.refreshToken.update({ where: { id: token.id }, data: { revoked: true } });
    res.json({ message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

router.post('/sessions/revoke-all', authenticateToken, async (req: any, res) => {
  try {
    const { refreshToken } = req.cookies;
    const currentHash = refreshToken ? crypto.createHash('sha256').update(refreshToken).digest('hex') : null;
    
    await prisma.refreshToken.updateMany({
      where: { userId: req.user.id, tokenHash: { not: currentHash || undefined } },
      data: { revoked: true }
    });
    
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'logout_all_devices', resource: 'auth' } });

    res.json({ message: 'All other sessions revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// Enable/Confirm 2FA
router.post('/enable-2fa', authenticateToken, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { secret, qrCodeDataUrl } = await generateMfaSecret(user.email);
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

  res.json({ secret, qrCode: qrCodeDataUrl });
});

router.post('/confirm-2fa', authenticateToken, async (req: any, res) => {
  const { token } = req.body;
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.mfaSecret) return res.status(400).json({ error: 'Invalid request' });

  if (verifyMfaToken(user.mfaSecret, token)) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'mfa_enabled', resource: 'auth' } });
    
    await sendSecurityNotification(user.email, 'MFA_ENABLED');
    res.json({ message: '2FA enabled successfully' });
  } else {
    res.status(400).json({ error: 'Invalid token' });
  }
});

router.post('/recovery-codes/generate', authenticateToken, async (req: any, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user || !user.mfaEnabled) return res.status(400).json({ error: 'MFA not enabled' });

  // Invalidate old codes
  await prisma.mFARecoveryCode.deleteMany({ where: { userId: user.id } });

  await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'MFA_RECOVERY_INVALIDATED', resource: 'auth' } });

  const plainCodes: string[] = [];
  const hashedCodes: any[] = [];

  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8 chars e.g. 1A2B3C4D
    plainCodes.push(code);
    hashedCodes.push({
      userId: user.id,
      codeHash: crypto.createHmac('sha256', process.env.OTP_SECRET!).update(code).digest('hex')
    });
  }

  await prisma.mFARecoveryCode.createMany({ data: hashedCodes });
  await sendSecurityNotification(user.email, 'RECOVERY_CODES_GENERATED');

  await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'MFA_RECOVERY_REGENERATED', resource: 'auth' } });

  res.json({ codes: plainCodes });
});

router.post('/recovery-codes/acknowledge', authenticateToken, async (req: any, res) => {
  await prisma.auditLog.create({
    data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'MFA_RECOVERY_VIEWED', resource: 'auth' }
  });
  res.json({ message: 'Recovery codes acknowledged' });
});

router.post('/verify-mfa-recovery', async (req, res) => {
  try {
    const { email, code, device, browser, os } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !user.mfaEnabled) return res.status(400).json({ error: 'Invalid request' });

    const codeHash = crypto.createHmac('sha256', process.env.OTP_SECRET!).update(code).digest('hex');
    
    const recoveryCode = await prisma.mFARecoveryCode.findFirst({
      where: { userId: user.id, codeHash, used: false }
    });

    if (!recoveryCode) {
      await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'RECOVERY_CODE_FAILED', resource: 'auth', severity: 'WARNING' } });
      return res.status(401).json({ error: 'Invalid or already used recovery code' });
    }

    // Mark as used
    await prisma.mFARecoveryCode.update({
      where: { id: recoveryCode.id },
      data: { used: true, usedAt: new Date() }
    });

    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
    await prisma.session.create({
      data: {
        userId: user.id, device: device || 'Unknown', browser: browser || 'Unknown', os: os || 'Unknown',
        ipAddress, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
    const familyId = crypto.randomUUID();

    await prisma.refreshToken.create({
      data: { tokenHash, familyId, userId: user.id, device: device || 'Unknown', ip: ipAddress, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });
    
    await enforceRefreshTokenLimits(user.id);
    
    await prisma.auditLog.create({ data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'RECOVERY_CODE_USED', resource: 'auth' } });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
