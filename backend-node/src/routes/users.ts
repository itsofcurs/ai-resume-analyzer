import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../server';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { verifyMfaToken } from '../utils/mfa';
import { uploadExport, generateSignedUrl } from '../services/exportStorageService';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const archiver = require('archiver');

const router = Router();

const exportLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 2, // 2 exports per day
  message: { error: 'Too many export requests. Try again tomorrow.' },
});

// Phase 4A: GDPR Export Protection
router.post('/export', authenticateToken, exportLimiter, async (req: any, res) => {
  try {
    const { password, mfaToken } = req.body;
    
    // Auth Wall Verification
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Require password confirmation
    if (!(await bcrypt.compare(password, user.password))) {
      await prisma.auditLog.create({
        data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_AUTH_FAILED', resource: 'export', severity: 'WARNING', riskScore: 'MEDIUM' }
      });
      return res.status(401).json({ error: 'Invalid password' });
    }
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_AUTH_VERIFIED', resource: 'export' }
    });

    // Require recent authentication (< 15 mins)
    const tokenIat = req.user.iat;
    if (!tokenIat || (Date.now() / 1000 - tokenIat) > 15 * 60) {
      await prisma.auditLog.create({
        data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_REAUTH_REQUIRED', resource: 'export', severity: 'INFO' }
      });
      return res.status(401).json({ error: 'Fresh authentication required. Please login again.', requireReAuth: true });
    }

    // Require MFA verification if Admin
    if (user.role === 'ADMIN' && user.mfaEnabled) {
      if (!mfaToken || !user.mfaSecret || !verifyMfaToken(user.mfaSecret, mfaToken)) {
        await prisma.auditLog.create({
          data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_MFA_FAILED', resource: 'export', severity: 'WARNING', riskScore: 'MEDIUM' }
        });
        return res.status(401).json({ error: 'Invalid or missing MFA token' });
      }
      await prisma.auditLog.create({
        data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_MFA_VERIFIED', resource: 'export' }
    });
  }

  // Block concurrent exports
  const activeExports = await prisma.exportRequest.count({
    where: { userId: user.id, status: { in: ['PENDING', 'PROCESSING'] } }
  });

  if (activeExports > 0) {
    await prisma.auditLog.create({
      data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_REQUEST_BLOCKED', resource: 'export', severity: 'WARNING' }
    });
    return res.status(429).json({ error: 'An export is already processing.' });
  }

  // Start Generation
  const ipAddress = req.ip || req.socket.remoteAddress || 'Unknown';
  const exportReq = await prisma.exportRequest.create({
    data: {
      userId: user.id,
      status: 'PROCESSING'
    }
  });

  await prisma.auditLog.create({
    data: { userId: user.id, organizationId: user.organizationId || 'system', action: 'EXPORT_STARTED', resource: 'export', ipAddress }
  });

    // Generate JSON Export
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        sessions: true,
        auditLogs: true,
      }
    });

    const exportPath = path.join(__dirname, `../../uploads/temp_${exportReq.id}.json`);
    const zipPath = path.join(__dirname, `../../uploads/export_${exportReq.id}.zip`);
    fs.writeFileSync(exportPath, JSON.stringify(userData, null, 2));

    // Create ZIP
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', async () => {
      try {
        const filename = `gdpr_export_${user.id}_${Date.now()}`;
        const storagePath = await uploadExport(user.id, zipPath, filename);
        const signedUrl = await generateSignedUrl(storagePath);

        await prisma.exportRequest.update({
          where: { id: exportReq.id },
          data: {
            status: 'READY',
            storagePath,
            filename: `${filename}.enc`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        });

        // Cleanup local files
        fs.unlinkSync(exportPath);
        fs.unlinkSync(zipPath);

        res.json({ success: true, downloadUrl: signedUrl });
      } catch (err) {
        console.error('Export upload failed:', err);
        await prisma.exportRequest.update({ where: { id: exportReq.id }, data: { status: 'FAILED' } });
        res.status(500).json({ error: 'Failed to upload export' });
      }
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.file(exportPath, { name: 'user_data.json' });
    archive.finalize();

  } catch (error) {
    res.status(500).json({ error: 'Internal server error during export' });
  }
});

export default router;
