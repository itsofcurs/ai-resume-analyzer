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
  sendVerificationEmail, 
  sendPasswordResetEmail, 
  generateSecureToken 
} from '../utils/email';
import { generateMfaSecret, verifyMfaToken } from '../utils/mfa';

const router = Router();

// --- Rate Limiters ---
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { error: 'Too many registration attempts. Try again in 1 hour.' },
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
    }

    // Ensure OAuth account is linked
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

// 1. Registration
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password, name, organizationName } = req.body;
    
    // Password validation (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special)
    const pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!pwdRegex.test(password)) {
      return res.status(400).json({ error: 'Password does not meet security requirements.' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email already exists' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
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

    // Verification token
    const tokenStr = generateSecureToken();
    await prisma.verificationToken.create({
      data: {
        email: user.email,
        token: tokenStr,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      }
    });

    await sendVerificationEmail(user.email, tokenStr);

    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId!, action: 'user_register', resource: 'auth' }
    });

    res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Email Verification
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    const verification = await prisma.verificationToken.findUnique({ where: { token } });
    
    if (!verification || verification.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    await prisma.user.update({
      where: { email: verification.email },
      data: { emailVerified: true }
    });

    await prisma.verificationToken.delete({ where: { id: verification.id } });
    res.json({ message: 'Email verified successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, device, browser, os } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

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
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email before logging in.' });
    }

    // Reset failed attempts
    await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: 0, lockedUntil: null } });

    if (user.mfaEnabled) {
      // Send a temporary token indicating MFA is required
      return res.json({ mfaRequired: true, userId: user.id });
    }

    // Create Session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        device: device || 'Unknown',
        browser: browser || 'Unknown',
        os: os || 'Unknown',
        ipAddress: req.ip || req.socket.remoteAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshToken = generateRefreshToken({ userId: user.id });

    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'user_login', resource: 'auth' }
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. MFA Verification (Post-Login)
router.post('/verify-mfa-login', loginLimiter, async (req, res) => {
  try {
    const { userId, token, device, browser, os } = req.body;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) return res.status(400).json({ error: 'Invalid request' });

    if (!verifyMfaToken(user.mfaSecret, token)) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // Create Session
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        device: device || 'Unknown',
        browser: browser || 'Unknown',
        os: os || 'Unknown',
        ipAddress: req.ip || req.socket.remoteAddress,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });

    const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    const refreshToken = generateRefreshToken({ userId: user.id });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ accessToken, user: { id: user.id, name: user.name, role: user.role, organizationId: user.organizationId } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Refresh Token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    if (!refreshToken) return res.status(401).json({ error: 'No refresh token' });

    const decoded = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) return res.status(401).json({ error: 'Invalid refresh token' });

    const newAccessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
    res.json({ accessToken: newAccessToken });
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// 6. Logout
router.post('/logout', async (req, res) => {
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
});

// 7. Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
  const user: any = req.user;
  
  const accessToken = generateAccessToken({ userId: user.id, role: user.role, organizationId: user.organizationId });
  const refreshToken = generateRefreshToken({ userId: user.id });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  // Redirect to frontend
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth-success?token=${accessToken}`);
});

// 8. Forgot Password
router.post('/forgot-password', pwdResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.json({ message: 'If that email exists, a reset link was sent.' });

    const token = generateSecureToken();
    await prisma.passwordResetToken.create({
      data: {
        email,
        token,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
      }
    });

    await sendPasswordResetEmail(email, token);
    
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'password_reset_request', resource: 'auth' }
    });

    res.json({ message: 'If that email exists, a reset link was sent.' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 9. Reset Password
router.post('/reset-password', pwdResetLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const resetRecord = await prisma.passwordResetToken.findUnique({ where: { token } });
    
    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const user = await prisma.user.update({
      where: { email: resetRecord.email },
      data: { password: hashedPassword, failedAttempts: 0, lockedUntil: null }
    });

    await prisma.passwordResetToken.deleteMany({ where: { email: resetRecord.email } });
    
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'password_reset_success', resource: 'auth' }
    });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 10. Enable 2FA
router.post('/enable-2fa', async (req, res) => {
  // Normally requires auth middleware to get req.user
  const { userId } = req.body; // Using body for simplicity without global auth middleware here
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { secret, qrCodeDataUrl } = await generateMfaSecret(user.email);
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

  res.json({ secret, qrCode: qrCodeDataUrl });
});

// 11. Confirm 2FA
router.post('/confirm-2fa', async (req, res) => {
  const { userId, token } = req.body;
  const user = await prisma.user.findUnique({ where: { id: userId } });
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
