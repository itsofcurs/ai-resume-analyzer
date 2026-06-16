export const otpTemplate = (otp: string) => `
  <div style="font-family: sans-serif; max-w-md; margin: auto;">
    <h2>Welcome to TalentAI</h2>
    <p>Please verify your email address by entering the following 6-digit code:</p>
    <div style="padding: 20px; background: #f8fafc; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #0f172a;">
      ${otp}
    </div>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">This code will expire in 10 minutes.</p>
  </div>
`;

export const passwordResetTemplate = (otp: string) => `
  <div style="font-family: sans-serif; max-w-md; margin: auto;">
    <h2>Password Reset Request</h2>
    <p>You requested to reset your password. Use the following 6-digit code to verify your identity:</p>
    <div style="padding: 20px; background: #f8fafc; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; color: #0f172a;">
      ${otp}
    </div>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">This code will expire in 10 minutes. If you did not request this, please ignore this email.</p>
  </div>
`;

export const invitationTemplate = (orgName: string, link: string) => `
  <div style="font-family: sans-serif; max-w-md; margin: auto;">
    <h2>You're invited to join ${orgName} on TalentAI</h2>
    <p>Click the link below to accept the invitation and set up your account:</p>
    <a href="${link}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 10px;">Accept Invitation</a>
  </div>
`;

export const billingAlertTemplate = (message: string) => `
  <div style="font-family: sans-serif; max-w-md; margin: auto;">
    <h2>TalentAI Billing Alert</h2>
    <p>${message}</p>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">Please check your billing dashboard for details.</p>
  </div>
`;

export const supportTicketTemplate = (ticketId: string, status: string) => `
  <div style="font-family: sans-serif; max-w-md; margin: auto;">
    <h2>Support Ticket Update: #${ticketId}</h2>
    <p>The status of your support ticket has been updated to: <strong>${status}</strong>.</p>
    <p style="color: #64748b; font-size: 14px; margin-top: 20px;">We will keep you posted on any further updates.</p>
  </div>
`;
