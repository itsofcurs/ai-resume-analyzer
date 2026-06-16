import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { prisma } from '../server';
import bcrypt from 'bcryptjs';
import { generateSecureToken } from '../utils/email';
import { logWithTrace } from '../lib/telemetry';

export const configureOAuthProviders = () => {
  // Common profile handler
  const handleProfile = async (provider: string, profile: any, accessToken: string, refreshToken: string, done: any) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error(`No email found from ${provider} profile`), false);

      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            name: profile.displayName || profile.username || 'User',
            password: await bcrypt.hash(generateSecureToken(), 10),
            provider: provider.toUpperCase(),
            accountState: 'ACTIVE', // Trusted from OAuth
            role: 'RECRUITER',
            organization: {
              create: { name: `${profile.displayName || profile.username}'s Organization` }
            }
          }
        });
        await prisma.auditLog.create({
          data: { userId: user.id, organizationId: user.organizationId!, action: `${provider}_signup`, resource: 'auth' }
        });
      } else {
        // Auto-link account
        const updateData: any = { accountState: 'ACTIVE' }; // Auto verify if they log in with social
        if (provider === 'google') updateData.googleId = profile.id;
        
        user = await prisma.user.update({
          where: { id: user.id },
          data: updateData
        });
      }

      await prisma.oAuthAccount.upsert({
        where: { provider_providerAccountId: { provider, providerAccountId: profile.id } },
        update: { accessToken, refreshToken },
        create: {
          userId: user.id,
          provider,
          providerAccountId: profile.id,
          accessToken,
          refreshToken
        }
      });

      done(null, user);
    } catch (err) {
      logWithTrace('error', `OAuth error for ${provider}`, { error: err });
      done(err, false);
    }
  };

  // Google
  if (process.env.GOOGLE_CLIENT_ID) {
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackURL: "/api/auth/google/callback"
    }, (accessToken, refreshToken, profile, done) => handleProfile('google', profile, accessToken, refreshToken, done)));
  }

  // GitHub (Example of easily adding new providers)
  if (process.env.GITHUB_CLIENT_ID) {
    passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      callbackURL: "/api/auth/github/callback"
    }, (accessToken: string, refreshToken: string, profile: any, done: any) => handleProfile('github', profile, accessToken, refreshToken, done)));
  }
};
