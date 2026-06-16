import { Router } from 'express';
import { prisma } from '../server';
import { logWithTrace } from '../lib/telemetry';

const router = Router();

// Endpoint for Resend Webhooks
router.post('/resend', async (req, res) => {
  try {
    const { type, data } = req.body;
    
    // Validate it's from Resend (usually done via Svix or webhook secret check)
    // For now, we trust the structure

    if (!data?.email_id) return res.status(400).json({ error: 'Invalid webhook payload' });

    let status = 'PROCESSING';
    if (type === 'email.delivered') status = 'DELIVERED';
    else if (type === 'email.bounced') status = 'BOUNCED';
    else if (type === 'email.complained') status = 'FAILED'; // Treat spam complaint as failure
    
    // Update Delivery Log
    await prisma.emailDeliveryLog.updateMany({
      where: { messageId: data.email_id },
      data: { status, updatedAt: new Date() }
    });

    logWithTrace('info', `Resend webhook processed: ${type} for message ${data.email_id}`);

    res.json({ success: true });
  } catch (error) {
    logWithTrace('error', 'Failed to process Resend webhook', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
