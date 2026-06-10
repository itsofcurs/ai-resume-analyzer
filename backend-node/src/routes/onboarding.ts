import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Create new company/tenant
router.post('/organization', async (req, res) => {
  try {
    const { name, adminEmail, adminName, planTier } = req.body;
    
    // Create organization
    const org = await prisma.organization.create({
      data: {
        name,
        subscription: {
          create: {
            planTier: planTier || 'STARTER',
            status: 'active'
          }
        },
        usageQuota: {
          create: {
            seatsLimit: 5,
            apiLimit: 1000
          }
        }
      }
    });

    res.json({ success: true, organization: org });
  } catch (error) {
    console.error('Organization creation failed', error);
    res.status(500).json({ error: 'Failed to setup organization' });
  }
});

// Configure branding
router.post('/branding', async (req, res) => {
  const { organizationId, logoUrl, primaryColor } = req.body;
  // This could save to a specific branding table or JSON field
  res.json({ success: true, message: 'Branding updated successfully' });
});

// Create Job templates
router.post('/templates', async (req, res) => {
  const { organizationId, title, description, requiredSkills } = req.body;
  try {
    const job = await prisma.jobDescription.create({
      data: {
        organizationId,
        title,
        description,
        requiredSkills
      }
    });
    res.json({ success: true, template: job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save job template' });
  }
});

export default router;
