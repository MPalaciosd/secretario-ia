const Stripe = require('stripe');
const { query } = require('../db/database');
const config = require('../config');
const { sendSubscriptionEmail } = require('./emailService');

const stripe = config.stripe.secretKey ? new Stripe(config.stripe.secretKey) : null;

// ─── CREATE OR GET STRIPE CUSTOMER ────────────────────────────────────────────

async function getOrCreateCustomer(userId, email, name) {
  if (!stripe) throw new Error('Stripe no configurado');
  
  // Check if user already has a Stripe customer ID
  const userResult = await query(
    'SELECT stripe_customer_id, email, name FROM users WHERE id = $1',
    [userId]
  );
  
  if (!userResult.rows.length) {
    throw new Error('Usuario no encontrado');
  }
  
  const user = userResult.rows[0];
  
  if (user.stripe_customer_id) {
    return user.stripe_customer_id;
  }
  
  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email: email || user.email,
    name: name || user.name,
    metadata: { userId }
  });
  
  // Save customer ID to database
  await query(
    'UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE id = $2',
    [customer.id, userId]
  );
  
  return customer.id;
}

// ─── CREATE CHECKOUT SESSION ──────────────────────────────────────────────────

async function createCheckoutSession(userId, email, name, successUrl, cancelUrl) {
  if (!stripe) throw new Error('Stripe no configurado');
  if (!config.stripe.priceId) throw new Error('STRIPE_PRICE_ID no configurado');
  
  const customerId = await getOrCreateCustomer(userId, email, name);
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [
      {
        price: config.stripe.priceId,
        quantity: 1
      }
    ],
    success_url: successUrl || `${process.env.APP_URL || 'http://localhost:3000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl || `${process.env.APP_URL || 'http://localhost:3000'}/subscription/cancel`,
    subscription_data: {
      metadata: { userId }
    }
  });
  
  return { url: session.url, sessionId: session.id };
}

// ─── CREATE CUSTOMER PORTAL SESSION ──────────────────────────────────────────

async function createPortalSession(userId, returnUrl) {
  if (!stripe) throw new Error('Stripe no configurado');
  
  const userResult = await query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );
  
  if (!userResult.rows.length || !userResult.rows[0].stripe_customer_id) {
    throw new Error('No se encontró suscripción activa');
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: userResult.rows[0].stripe_customer_id,
    return_url: returnUrl || `${process.env.APP_URL || 'http://localhost:3000'}`
  });
  
  return { url: session.url };
}

// ─── HANDLE WEBHOOK EVENTS ────────────────────────────────────────────────────

async function handleWebhook(rawBody, signature) {
  if (!stripe) throw new Error('Stripe no configurado');
  if (!config.stripe.webhookSecret) throw new Error('STRIPE_WEBHOOK_SECRET no configurado');
  
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${err.message}`);
  }
  
  console.log('[Stripe] Webhook event:', event.type);
  
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.subscription_data?.metadata?.userId;
      
      if (userId && session.subscription) {
        await query(
          `UPDATE users SET subscription_status = 'active', subscription_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [session.subscription, userId]
        );
        
        // Send confirmation email
        const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length) {
          await sendSubscriptionEmail(userResult.rows[0].email, userResult.rows[0].name, 'Premium');
        }
        
        console.log('[Stripe] ✅ Subscription activated for user:', userId);
      }
      break;
    }
    
    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      
      if (userId) {
        const status = subscription.status === 'active' ? 'active' : 
                      subscription.status === 'trialing' ? 'trial' : 'inactive';
        
        await query(
          'UPDATE users SET subscription_status = $1, updated_at = NOW() WHERE id = $2',
          [status, userId]
        );
        console.log('[Stripe] Subscription updated for user:', userId, '| Status:', status);
      }
      break;
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const userId = subscription.metadata?.userId;
      
      if (userId) {
        await query(
          `UPDATE users SET subscription_status = 'free', subscription_id = NULL, updated_at = NOW()
           WHERE id = $1`,
          [userId]
        );
        console.log('[Stripe] Subscription cancelled for user:', userId);
      }
      break;
    }
    
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      console.warn('[Stripe] Payment failed for customer:', invoice.customer);
      // TODO: Send payment failed email
      break;
    }
    
    default:
      console.log('[Stripe] Unhandled event type:', event.type);
  }
  
  return { received: true, type: event.type };
}

// ─── GET SUBSCRIPTION STATUS ──────────────────────────────────────────────────

async function getSubscriptionStatus(userId) {
  const result = await query(
    'SELECT subscription_status, subscription_id, stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );
  
  if (!result.rows.length) {
    throw new Error('Usuario no encontrado');
  }
  
  const user = result.rows[0];
  
  if (!stripe || !user.subscription_id) {
    return { status: user.subscription_status || 'free', plan: 'free' };
  }
  
  // Get live status from Stripe
  try {
    const subscription = await stripe.subscriptions.retrieve(user.subscription_id);
    return {
      status: subscription.status,
      plan: 'premium',
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    };
  } catch (err) {
    return { status: user.subscription_status, plan: 'premium' };
  }
}

module.exports = { createCheckoutSession, createPortalSession, handleWebhook, getSubscriptionStatus };
