import { emailQueue } from '../queues/emailQueue';
import { redisClient, prisma } from '../server';

export const sendSecurityNotification = async (
  email: string,
  event: 'NEW_DEVICE' | 'NEW_COUNTRY' | 'PASSWORD_CHANGED' | 'MFA_ENABLED' | 'MFA_DISABLED' | 'ACCOUNT_LOCKED' | 'RECOVERY_CODES_GENERATED' | 'TOKEN_COMPROMISE',
  metadata?: any
) => {
  try {
    // Throttling Logic
    const throttleKey = `throttle:notify:${email}:${event}`;
    
    if (redisClient.isOpen) {
      const existing = await redisClient.get(throttleKey);
      if (existing) {
        // Find user to log the throttle event
        const user = await prisma.user.findUnique({ where: { email } });
        if (user) {
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              organizationId: user.organizationId || 'system',
              action: 'SECURITY_NOTIFICATION_THROTTLED',
              resource: 'notification',
              severity: 'INFO'
            }
          });
        }
        return; // Suppress notification
      }
      
      // Set 24 hour TTL
      await redisClient.setEx(throttleKey, 86400, '1');
    }
  } catch (err) {
    // Ignore redis errors, fail open
    console.error('Redis throttle error:', err);
  }

  let subject = 'Security Alert: TalentAI';
  let html = '<p>A security event has occurred on your account.</p>';

  switch (event) {
    case 'NEW_DEVICE':
      subject = 'Security Alert: New Device Login';
      html = `<p>We detected a login from a new device.</p><p>Device: ${metadata?.device || 'Unknown'}</p><p>Location: ${metadata?.location || 'Unknown'}</p>`;
      break;
    case 'NEW_COUNTRY':
      subject = 'Security Alert: Login from New Country';
      html = `<p>We detected a login from a new country.</p><p>Location: ${metadata?.location || 'Unknown'}</p>`;
      break;
    case 'PASSWORD_CHANGED':
      subject = 'Security Alert: Password Changed';
      html = `<p>Your password was recently changed. If this was not you, please contact support immediately.</p>`;
      break;
    case 'MFA_ENABLED':
      subject = 'Security Alert: 2FA Enabled';
      html = `<p>Two-factor authentication has been enabled on your account.</p>`;
      break;
    case 'MFA_DISABLED':
      subject = 'Security Alert: 2FA Disabled';
      html = `<p>Two-factor authentication has been disabled on your account.</p>`;
      break;
    case 'ACCOUNT_LOCKED':
      subject = 'Security Alert: Account Locked';
      html = `<p>Your account has been locked due to too many failed login attempts.</p>`;
      break;
    case 'RECOVERY_CODES_GENERATED':
      subject = 'Security Alert: Recovery Codes Generated';
      html = `<p>New MFA recovery codes were generated for your account. Old codes are now invalid.</p>`;
      break;
    case 'TOKEN_COMPROMISE':
      subject = 'CRITICAL Security Alert: Token Reuse Detected';
      html = `<p>We detected suspicious session activity (token reuse). All your active sessions have been revoked.</p>`;
      break;
  }

  await emailQueue.add('security-notification', {
    to: email,
    subject,
    html,
    type: 'SECURITY_NOTIFICATION'
  });
};
