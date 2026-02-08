/**
 * Stripe payments: checkout session creation and webhooks.
 * Updates user access_level from payments (pro / free_trial / none).
 * Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO, STRIPE_PRICE_FREE_TRIAL (Stripe Price IDs)
 */
const express = require('express');
const router = express.Router();
const Stripe = require('stripe');

const STRIPE_SECRET = (process.env.STRIPE_SECRET_KEY || '').trim();
const WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const PRICE_PRO = (process.env.STRIPE_PRICE_PRO || '').trim();
const PRICE_FREE_TRIAL = (process.env.STRIPE_PRICE_FREE_TRIAL || '').trim();

let stripe = null;
let findUserById = null;
let updateUserAccessLevel = null;
let findUserByStripeCustomerId = null;
let updateUserStripeIds = null;

try {
  const db = require('../db/db');
  findUserById = db.findUserById;
  updateUserAccessLevel = db.updateUserAccessLevel;
  findUserByStripeCustomerId = db.findUserByStripeCustomerId;
  updateUserStripeIds = db.updateUserStripeIds;
} catch (e) {
  console.warn('[stripe] DB not available:', e.message);
}

if (STRIPE_SECRET) {
  stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' });
}

/**
 * POST /stripe/create-checkout-session
 * Body: { successUrl, cancelUrl, accessLevel: 'pro' | 'free_trial' }
 * Requires auth. Creates a Stripe Checkout Session and returns { url }.
 */
async function createCheckoutSession(req, res) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe is not configured' });
  }
  const userId = req.currentUserId;
  const { successUrl, cancelUrl, accessLevel } = req.body || {};
  if (!successUrl || !cancelUrl) {
    return res.status(400).json({ error: 'successUrl and cancelUrl are required' });
  }
  const level = accessLevel === 'free_trial' ? 'free_trial' : 'pro';
  const priceId = level === 'pro' ? PRICE_PRO : PRICE_FREE_TRIAL;
  if (!priceId) {
    return res.status(400).json({
      error: level === 'pro' ? 'STRIPE_PRICE_PRO is not set' : 'STRIPE_PRICE_FREE_TRIAL is not set'
    });
  }

  try {
    const user = await findUserById(userId);
    if (!user || !user.email) {
      return res.status(404).json({ error: 'User not found' });
    }

    const sessionConfig = {
      mode: level === 'pro' ? 'subscription' : 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: String(userId),
      metadata: {
        user_id: String(userId),
        email: user.email,
        access_level: level
      }
    };

    if (user.stripe_customer_id) {
      sessionConfig.customer = user.stripe_customer_id;
    } else {
      sessionConfig.customer_email = user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    return res.json({ url: session.url, sessionId: session.id });
  } catch (e) {
    console.error('[stripe create-checkout-session]', e);
    return res.status(500).json({ error: e.message || 'Failed to create checkout session' });
  }
}

/**
 * Webhook handler (must receive raw body for signature verification).
 * Handles: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted
 */
async function handleStripeWebhook(req, res) {
  if (!stripe || !WEBHOOK_SECRET) {
    console.warn('[stripe webhook] Stripe or WEBHOOK_SECRET not configured');
    return res.status(503).send('Webhook not configured');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.user_id;
        const accessLevel = session.metadata?.access_level || 'pro';
        const customerId = session.customer || null;
        const subscriptionId = session.subscription || null;

        if (userId && findUserById) {
          const user = await findUserById(Number(userId));
          if (user) {
            await updateUserAccessLevel(user.id, accessLevel);
            const updates = {};
            if (customerId) updates.stripeCustomerId = customerId;
            if (subscriptionId) updates.stripeSubscriptionId = subscriptionId;
            if (Object.keys(updates).length) await updateUserStripeIds(user.id, updates);
            console.log('[stripe webhook] Updated user', user.id, 'access_level to', accessLevel);
          }
        } else if (customerId && findUserByStripeCustomerId) {
          const user = await findUserByStripeCustomerId(customerId);
          if (user) {
            await updateUserAccessLevel(user.id, accessLevel);
            if (subscriptionId) await updateUserStripeIds(user.id, { stripeSubscriptionId: subscriptionId });
            console.log('[stripe webhook] Updated user by customer', user.id, 'access_level to', accessLevel);
          }
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
        const status = subscription.status;
        const newLevel = (status === 'active' || status === 'trialing') ? 'pro' : 'none';

        if (customerId && findUserByStripeCustomerId) {
          const user = await findUserByStripeCustomerId(customerId);
          if (user) {
            await updateUserAccessLevel(user.id, newLevel);
            if (event.type === 'customer.subscription.deleted' && updateUserStripeIds) {
              await updateUserStripeIds(user.id, { stripeSubscriptionId: null });
            }
            console.log('[stripe webhook] Subscription', event.type, 'user', user.id, 'access_level ->', newLevel);
          }
        }
        break;
      }
      default:
        // ignore other events
        break;
    }
  } catch (e) {
    console.error('[stripe webhook] Handler error:', e);
    return res.status(500).send('Webhook handler failed');
  }
  res.sendStatus(200);
}

router.post('/create-checkout-session', createCheckoutSession);

module.exports = { router, handleStripeWebhook };
