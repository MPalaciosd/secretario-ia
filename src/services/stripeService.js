// src/services/stripeService.js
'use strict';

const Stripe = require('stripe');
const { query } = require('../db/database');
const config = require('../config');

// Only instantiate Stripe if key is present
const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' }) : null;

// ─── PLAN CONFIG ───────────────────────────────────────────────────────────────
const PLAN_NAMES = { free: 'Gratuito', active: 'PRO', trial: 'Trial PRO' };

// ─── HELPER: get or create Stripe customer ─────────────────────────────────────
async function getOrCreateCustomer(userId, email, name) {
  if (!stripe) throw new Error('Stripe no configurado');
  const userResult = await query(
    'SELECT stripe_customer_id, email, name FROM users WHERE id = $1',
    [userId]
  );
  if (!userResult.rows.length) throw new Error('Usuario no encontrado');
  const user = userResult.rows[0];
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe.customers.create({
    email: email || user.email,
    name: name || user.name || '',
    metadata: { userId }
  });
  await query(
    'UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
    [customer.id, userId]
  );
  return customer.id;
}

// ─── CREATE CHECKOUT SESSION ───────────────────────────────────────────────────
async function createCheckoutSession(userId, email, name, successUrl, cancelUrl) {
  if (!stripe) throw new Error('Stripe no configurado');
  if (!config.stripe.priceId) throw new Error('STRIPE_PRICE_ID no configurado');

  const customerId = await getOrCreateCustomer(userId, email, name);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: config.stripe.priceId, quantity: 1 }],
    success_url: successUrl || (appUrl + '/subscription/success?session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: cancelUrl || (appUrl + '/subscription/cancel'),
    allow_promotion_codes: true,
    subscription_data: { metadata: { userId } },
    metadata: { userId }
  });

  return { url: session.url, sessionId: session.id };
}

// ─── CREATE CUSTOMER PORTAL SESSION ───────────────────────────────────────────
async function createPortalSession(userId, returnUrl) {
  if (!stripe) throw new Error('Stripe no configurado');
  const userResult = await query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );
  if (!userResult.rows.length || !userResult.rows[0].stripe_customer_id) {
    throw new Error('No se encontro suscripcion activa');
  }
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const session = await stripe.billingPortal.sessions.create({
    customer: userResult.rows[0].stripe_customer_id,
    return_url: returnUrl || appUrl
  });
  return { url: session.url };
}

// ─── WEBHOOK HANDLER ───────────────────────────────────────────────────────────
async function handleWebhook(rawBody, signature) {
  if (!stripe) throw new Error('Stripe no configurado');
  if (!config.stripe.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET no configurado');

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    throw new Error('Webhook signature verification failed: ' + err.message);
  }

  console.log('[Stripe] Webhook event:', event.type);

  switch (event.type) {

    case 'checkout.session.completed': {
      const session = event.data.object;
      // userId can be in session.metadata or subscription_data.metadata
      const userId = (session.metadata && session.metadata.userId) ||
                     (session.subscription_data && session.subscription_data.metadata && session.subscription_data.metadata.userId);
      if (userId && session.subscription) {
        await query(
          "UPDATE users SET subscription_status = 'active', stripe_subscription_id = $1, updated_at = NOW() WHERE id = $2",
          [session.subscription, userId]
        );
        console.log('[Stripe] Subscription activated for user:', userId);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object;
      const userId = sub.metadata && sub.metadata.userId;
      if (userId) {
        let status = 'free';
        if (sub.status === 'active') status = 'active';
        else if (sub.status === 'trialing') status = 'trial';
        else if (sub.status === 'past_due') status = 'active'; // keep access during grace period

        const periodEnd = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null;
        const cancelAt = sub.cancel_at_period_end ? periodEnd : null;

        await query(
          "UPDATE users SET subscription_status = $1, subscription_period_end = $2, subscription_cancelled_at = $3, updated_at = NOW() WHERE id = $4",
          [status, periodEnd, cancelAt, userId]
        );
        console.log('[Stripe] Subscription updated for user:', userId, '| Status:', status);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const userId = sub.metadata && sub.metadata.userId;
      if (userId) {
        await query(
          "UPDATE users SET subscription_status = 'free', stripe_subscription_id = NULL, subscription_period_end = NULL, subscription_cancelled_at = NOW(), updated_at = NOW() WHERE id = $1",
          [userId]
        );
        console.log('[Stripe] Subscription cancelled for user:', userId);
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      // Update period end on renewal
      if (invoice.subscription && invoice.lines && invoice.lines.data && invoice.lines.data[0]) {
        const period = invoice.lines.data[0].period;
        const periodEnd = period && period.end
          ? new Date(period.end * 1000).toISOString()
          : null;
        if (invoice.customer) {
          await query(
            "UPDATE users SET subscription_period_end = $1, updated_at = NOW() WHERE stripe_customer_id = $2",
            [periodEnd, invoice.customer]
          ).catch(function(e) { console.warn('[Stripe] period update warn:', e.message); });
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      // Log only — do not immediately revoke access (Stripe retries)
      console.warn('[Stripe] Payment failed for customer:', invoice.customer);
      break;
    }

    default:
      console.log('[Stripe] Unhandled event type:', event.type);
  }

  return { received: true, type: event.type };
}

// ─── GET SUBSCRIPTION STATUS ───────────────────────────────────────────────────
async function getSubscriptionStatus(userId) {
  const result = await query(
    'SELECT subscription_status, stripe_subscription_id, stripe_customer_id, subscription_period_end, subscription_cancelled_at FROM users WHERE id = $1',
    [userId]
  );
  if (!result.rows.length) throw new Error('Usuario no encontrado');

  const user = result.rows[0];
  const planName = PLAN_NAMES[user.subscription_status] || PLAN_NAMES.free;

  // If no Stripe sub or Stripe not configured, return DB status
  if (!stripe || !user.stripe_subscription_id) {
    return {
      status: user.subscription_status || 'free',
      plan: planName,
      periodEnd: user.subscription_period_end || null,
      cancelAtPeriodEnd: !!user.subscription_cancelled_at
    };
  }

  // Get live status from Stripe
  try {
    const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    let liveStatus = 'free';
    if (sub.status === 'active') liveStatus = 'active';
    else if (sub.status === 'trialing') liveStatus = 'trial';
    else if (sub.status === 'past_due') liveStatus = 'active'; // grace period

    // Sync DB if live status differs
    if (liveStatus !== user.subscription_status) {
      await query(
        'UPDATE users SET subscription_status = $1, updated_at = NOW() WHERE id = $2',
        [liveStatus, userId]
      ).catch(function() {});
    }

    return {
      status: liveStatus,
      plan: PLAN_NAMES[liveStatus] || 'Gratuito',
      periodEnd: new Date(sub.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: sub.cancel_at_period_end
    };
  } catch (err) {
    // Stripe API down — return cached DB status
    return {
      status: user.subscription_status || 'free',
      plan: planName,
      periodEnd: user.subscription_period_end || null,
      cancelAtPeriodEnd: !!user.subscription_cancelled_at
    };
  }
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  handleWebhook,
  getSubscriptionStatus
};
