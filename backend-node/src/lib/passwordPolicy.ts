export const validatePasswordPolicy = (password: string, email: string): { valid: boolean; error?: string } => {
  if (password.length < 12) {
    return { valid: false, error: 'Password must be at least 12 characters long.' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one uppercase letter.' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one lowercase letter.' };
  }

  if (!/\d/.test(password)) {
    return { valid: false, error: 'Password must contain at least one number.' };
  }

  if (!/[@$!%*?&]/.test(password)) {
    return { valid: false, error: 'Password must contain at least one special character (@$!%*?&).' };
  }

  const commonPasswords = ['password123', 'admin123', 'qwertyuiop', 'talentai123'];
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    return { valid: false, error: 'Password is too common.' };
  }

  if (password.toLowerCase().includes('talentai')) {
    return { valid: false, error: 'Password cannot contain the brand name.' };
  }

  const emailLocalPart = email.split('@')[0].toLowerCase();
  if (emailLocalPart.length > 3 && password.toLowerCase().includes(emailLocalPart)) {
    return { valid: false, error: 'Password cannot contain your email prefix.' };
  }

  return { valid: true };
};
