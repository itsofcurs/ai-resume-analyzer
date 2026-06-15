import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { prisma } from '../server';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} from '../utils/tokens';
import { 
  sendOtpEmail,
  sendPasswordResetOtpEmail,
  generateOTP,
  generateSecureToken 
} from '../utils/email';
import { generateMfaSecret, verifyMfaToken } from '../utils/mfa';
import crypto from 'crypto';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// --- Rate Limiters ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
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

// --- Passport Google OAuth Setup ---
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-client-secret',
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0].value;
    if (!email) return done(new Error('No email found from Google profile'), false);

    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: profile.displayName,
          password: await bcrypt.hash(generateSecureToken(), 10), // random pass
          provider: 'GOOGLE',
          googleId: profile.id,
          emailVerified: true, // Trusted from Google
          role: 'ADMIN',
          organization: {
            create: { name: `${profile.displayName}'s Organization` }
          }
        }
      });
      await prisma.auditLog.create({
        data: { userId: user.id, organizationId: user.organizationId!, action: 'user_register', resource: 'auth' }
      });
    } else if (!user.googleId) {
      // Auto-link account
      user = await prisma.user.update({
        where: { id: user.id },
        data: { googleId: profile.id, provider: 'GOOGLE', emailVerified: true }
      });
    }

    await prisma.oAuthAccount.upsert({
      where: { providerAccountId: profile.id },
      update: { accessToken, refreshToken },
      create: {
        userId: user.id,
        provider: 'google',
        providerAccountId: profile.id,
        accessToken,
        refreshToken
      }
    });

    done(null, user);
  } catch (err) {
    done(err, false);
  }
}));

// --- Routes ---

// 1. Registration (Sends OTP)
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, organizationName } = req.body;
    
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!pwdRegex.test(password)) {
      return res.status(400).json({ error: 'Password does not meet security requirements.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing && existing.emailVerified) {
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
          organization: {
            create: { name: organizationName || `${name}'s Organization` }
          }
        },
        include: { organization: true }
      });

      await prisma.auditLog.create({
        data: { userId: user.id, organizationId: user.organizationId!, action: 'user_register', resource: 'auth' }
      });
    } else {
      // Unverified user replacing credentials
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword, name }
      });
    }

    // Generate & Save OTP
    const otp = generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    
    // Clear old OTPs for this email
    console.log('[AUTH] Clearing old OTPs for', email);
    await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });
    
    console.log('[AUTH] Creating new OTP record');
    await prisma.emailOTP.create({
      data: {
        email,
        otpHash,
        type: 'REGISTER',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      }
    });

    console.log('[AUTH] Sending OTP email to', email);
    await sendOtpEmail(email, otp);
    console.log('[AUTH] OTP email sent successfully');
    
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'otp_sent', resource: 'auth' }
    });

    res.status(200).json({ message: 'OTP sent to email. Please verify.', email });
  } catch (error: any) {
    console.error('[AUTH] Register error:', error);
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

    if (!record) return res.status(400).json({ error: 'No pending verification found.' });

    if (record.attempts >= 5) {
      await prisma.emailOTP.delete({ where: { id: record.id } });
      return res.status(400).json({ error: 'Too many attempts. Please request a new code.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new code.' });
    }

    const hashedInput = crypto.createHash('sha256').update(otp).digest('hex');
    if (hashedInput !== record.otpHash) {
      await prisma.emailOTP.update({
        where: { id: record.id },
        data: { attempts: record.attempts + 1 }
      });
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    // Success! Verify user
    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: true, failedAttempts: 0, lockedUntil: null, lastLogin: new Date() }
    });

    await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });

    // Session creation
    const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        device: device || 'Unknown',
        browser: browser || 'Unknown',
        os: os || 'Unknown',
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');

    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        device: device || 'Unknown',
        ip: ipAddress,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'otp_verified', resource: 'auth' }
    });
    
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'login_success', resource: 'auth' }
    });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
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
    if (user.emailVerified) return res.status(400).json({ error: 'Email already verified.' });

    const otp = generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    
    await prisma.emailOTP.deleteMany({ where: { email, type: 'REGISTER' } });
    await prisma.emailOTP.create({
      data: {
        email,
        otpHash,
        type: 'REGISTER',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      }
    });

    await sendOtpEmail(email, otp);
    res.json({ message: 'A new OTP has been sent.' });
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

    if (!(await bcrypt.compare(password, user.password))) {
      const attempts = user.failedAttempts + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
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
        await prisma.auditLog.create({
          data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'account_locked', resource: 'auth' }
        });
      } else {
        await prisma.auditLog.create({
          data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'login_failed', resource: 'auth' }
        });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.', unverified: true });
    }

    // Success
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() } });
    await prisma.loginAttempt.deleteMany({ where: { email } });

    if (user.mfaEnabled) {
      return res.json({ mfaRequired: true, userId: user.id });
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        device: device || 'Unknown',
        browser: browser || 'Unknown',
        os: os || 'Unknown',
        ipAddress: ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');

    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        device: device || 'Unknown',
        ip,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'login_success', resource: 'auth' }
    });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
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
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        device: device || 'Unknown',
        browser: browser || 'Unknown',
        os: os || 'Unknown',
        ipAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshTokenStr = generateRefreshToken({ userId: user.id });
    const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');

    await prisma.refreshToken.create({
      data: { tokenHash, userId: user.id, device: device || 'Unknown', ip: ipAddress, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
    });

    res.cookie('refreshToken', refreshTokenStr, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Refresh Token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const dbToken = await prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!dbToken || dbToken.revoked || dbToken.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'User not found' });

    const newAccessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
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
      await prisma.refreshToken.update({ where: { tokenHash }, data: { revoked: true } });
    }
    
    await prisma.auditLog.create({
      data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'logout', resource: 'auth' }
    });

    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out' });
  }
});

// 8. Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
  const user: any = req.user;
  
  const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
  const refreshTokenStr = generateRefreshToken({ userId: user.id });
  const tokenHash = crypto.createHash('sha256').update(refreshTokenStr).digest('hex');
  
  await prisma.refreshToken.create({
    data: { tokenHash, userId: user.id, device: 'Google Auth', ip: req.ip, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }
  });

  await prisma.auditLog.create({
    data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'google_login', resource: 'auth' }
  });

  res.cookie('refreshToken', refreshTokenStr, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });

  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth-success?token=${accessToken}`);
});

// 9. Forgot Password (Send OTP)
router.post('/forgot-password', pwdResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset code was sent.' });

    const otp = generateOTP();
    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    
    await prisma.emailOTP.deleteMany({ where: { email, type: 'RESET' } });
    await prisma.emailOTP.create({
      data: {
        email,
        otpHash,
        type: 'RESET',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
      }
    });

    await sendPasswordResetOtpEmail(email, otp);
    
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'password_reset_request', resource: 'auth' }
    });

    res.json({ message: 'If that email exists, a reset code was sent.', email });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 10. Reset Password (Verify OTP & Change)
router.post('/reset-password', pwdResetLimiter, async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!pwdRegex.test(newPassword)) {
      return res.status(400).json({ error: 'Password does not meet security requirements.' });
    }

    const record = await prisma.emailOTP.findFirst({
      where: { email, type: 'RESET' },
      orderBy: { createdAt: 'desc' }
    });
    
    if (!record) return res.status(400).json({ error: 'Invalid or expired OTP' });
    
    if (record.attempts >= 5) {
      await prisma.emailOTP.delete({ where: { id: record.id } });
      return res.status(400).json({ error: 'Too many attempts. Request a new code.' });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({ error: 'OTP has expired.' });
    }

    const hashedInput = crypto.createHash('sha256').update(otp).digest('hex');
    if (hashedInput !== record.otpHash) {
      await prisma.emailOTP.update({ where: { id: record.id }, data: { attempts: record.attempts + 1 } });
      return res.status(400).json({ error: 'Invalid OTP code.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword, failedAttempts: 0, lockedUntil: null }
    });

    await prisma.emailOTP.deleteMany({ where: { email, type: 'RESET' } });
    
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'password_reset_success', resource: 'auth' }
    });

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

    await prisma.refreshToken.update({
      where: { id: token.id },
      data: { revoked: true }
    });
    
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
    
    await prisma.auditLog.create({
      data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'logout_all_devices', resource: 'auth' }
    });

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
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'mfa_enabled', resource: 'auth' }
    });
    res.json({ message: '2FA enabled successfully' });
  } else {
    res.status(400).json({ error: 'Invalid token' });
  }
});

export default router;
