import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../services/stripe';
import { prisma } from '../server';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
import { logWithTrace } from '../lib/telemetry';
import { logAudit } from './audit';

const router = Router();

router.get('/subscription', authenticateToken, requireExecutiveRole, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    let subscription = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    
    if (!subscription) {
      // Create default starter subscription if none exists
      subscription = await prisma.subscription.create({
        data: {
          organizationId: orgId,
          planTier: 'STARTER',
          status: 'active'
        }
      });
    }
    res.json(subscription);
  } catch (error: any) {
    logWithTrace('error', `Failed to fetch subscription: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

router.get('/usage', authenticateToken, requireExecutiveRole, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    let usage = await prisma.usageQuota.findUnique({ where: { organizationId: orgId } });
    
    if (!usage) {
      usage = await prisma.usageQuota.create({
        data: {
          organizationId: orgId,
          seatsLimit: 5,
          apiLimit: 1000
        }
      });
    }
    
    const invoices = await prisma.invoice.findMany({
      where: { organizationId: orgId },
      orderBy: { invoiceDate: 'desc' },
      take: 10
    });
    
    res.json({ usage, invoices });
  } catch (error: any) {
    logWithTrace('error', `Failed to fetch usage: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch usage quota' });
  }
});

router.post('/checkout', authenticateToken, requireExecutiveRole, async (req: AuthRequest, res: Response) => {
  try {
    const { priceId } = req.body;
    const orgId = req.user!.organizationId;
    
    let subscription = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    
    if (!subscription?.stripeCustomerId) {
      const customer = await stripe.customers.create({
        metadata: { organizationId: orgId }
      });
      subscription = await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: { stripeCustomerId: customer.id },
        create: { organizationId: orgId, stripeCustomerId: customer.id }
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: subscription.stripeCustomerId!,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing?canceled=true`,
      metadata: { organizationId: orgId }
    });

    res.json({ url: session.url });
  } catch (error: any) {
    logWithTrace('error', `Checkout failed: ${error.message}`);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

router.post('/portal', authenticateToken, requireExecutiveRole, async (req: AuthRequest, res: Response) => {
  try {
    const orgId = req.user!.organizationId;
    const subscription = await prisma.subscription.findUnique({ where: { organizationId: orgId } });
    
    if (!subscription?.stripeCustomerId) {
      return res.status(400).json({ error: 'No active Stripe customer found' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings/billing`
    });

    res.json({ url: portalSession.url });
  } catch (error: any) {
    logWithTrace('error', `Portal failed: ${error.message}`);
    res.status(500).json({ error: 'Customer portal failed' });
  }
});

// Note: Webhook must use express.raw({ type: 'application/json' }) before JSON parsing
// This will be mounted directly on app.use('/api/billing/webhook', express.raw(...))
export const webhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  let event: any;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig!, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    logWithTrace('error', `Webhook signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const stripeSub = event.data.object as any;
        const orgSub = await prisma.subscription.findFirst({ where: { stripeCustomerId: stripeSub.customer as string } });
        if (orgSub) {
          await prisma.subscription.updateMany({
            where: { stripeCustomerId: stripeSub.customer as string },
            data: {
              stripeSubscriptionId: stripeSub.id,
              status: stripeSub.status,
              currentPeriodEnd: new Date(stripeSub.current_period_end * 1000)
            }
          });
          await logAudit('system', orgSub.organizationId, event.type, 'subscription', null, { status: orgSub.status }, { status: stripeSub.status });
        }
        break;
      case 'invoice.paid':
        const invoice = event.data.object as any;
        if (invoice.customer) {
          const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: invoice.customer as string } });
          if (sub) {
            await prisma.invoice.create({
              data: {
                organizationId: sub.organizationId,
                stripeInvoiceId: invoice.id,
                amount: invoice.amount_paid / 100.0,
                status: invoice.status || 'paid',
                invoiceDate: new Date(invoice.created * 1000)
              }
            });
            await logAudit('system', sub.organizationId, 'invoice.paid', 'invoice', null, null, { amount: invoice.amount_paid / 100.0, invoiceId: invoice.id });
          }
        }
        break;
      case 'invoice.payment_failed':
        const failedInvoice = event.data.object as any;
        if (failedInvoice.customer) {
          const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: failedInvoice.customer as string } });
          if (sub) {
            await logAudit('system', sub.organizationId, 'invoice.payment_failed', 'invoice', null, null, { amount: failedInvoice.amount_due / 100.0, invoiceId: failedInvoice.id });
          }
        }
        break;
    }
    res.json({ received: true });
  } catch (error: any) {
    logWithTrace('error', `Webhook processing error: ${error.message}`);
    res.status(500).json({ error: 'Internal error during webhook processing' });
  }
};

// Subscription Lifecycle
router.post('/upgrade', async (req, res) => {
  const { organizationId, newPlan } = req.body;
  try {
    const sub = await prisma.subscription.update({
      where: { organizationId },
      data: { planTier: newPlan || 'PRO' }
    });
    res.json({ success: true, subscription: sub });
  } catch (error) {
    res.status(500).json({ error: 'Upgrade failed' });
  }
});

router.post('/downgrade', async (req, res) => {
  const { organizationId, newPlan } = req.body;
  try {
    const sub = await prisma.subscription.update({
      where: { organizationId },
      data: { planTier: newPlan || 'STARTER' }
    });
    res.json({ success: true, subscription: sub });
  } catch (error) {
    res.status(500).json({ error: 'Downgrade failed' });
  }
});

router.post('/cancel', async (req, res) => {
  const { organizationId } = req.body;
  try {
    const sub = await prisma.subscription.update({
      where: { organizationId },
      data: { status: 'canceled' }
    });
    res.json({ success: true, subscription: sub });
  } catch (error) {
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

export default router;
