const mongoose = require('mongoose');

// ── Schemas existentes ─────────────────────────────────────────────────────────
const clientSchema = new mongoose.Schema({
  name: String,
  phone: { type: String, default: null },
  channel: { type: String, default: 'web' },
  email: { type: String, default: null },
}, { timestamps: true });
clientSchema.index({ phone: 1 }, { unique: true, sparse: true });
clientSchema.index({ email: 1 }, { sparse: true });

const appointmentSchema = new mongoose.Schema({
  client_id: String,
  service_key: String,
  service_name: String,
  duration: Number,
  start_time: String,
  end_time: String,
  status: { type: String, default: 'confirmed' },
  notes: { type: String, default: null },
}, { timestamps: true });
appointmentSchema.index({ start_time: 1 });
appointmentSchema.index({ client_id: 1 });

const conversationSchema = new mongoose.Schema({
  client_id: { type: String, default: null },
  channel: String,
  channel_id: String,
}, { timestamps: true });
conversationSchema.index({ channel_id: 1 });

const messageSchema = new mongoose.Schema({
  conversation_id: String,
  role: String,
  content: String,
}, { timestamps: true });
messageSchema.index({ conversation_id: 1 });

// ── Schemas de monetización ────────────────────────────────────────────────────

// Plan: free | basic | pro | enterprise
const PLAN_CREDITS = { free: 0, basic: 500, pro: 2000, enterprise: 10000 };

const subscriptionSchema = new mongoose.Schema({
  client_id: { type: String, required: true, unique: true },
  plan: { type: String, enum: ['free', 'basic', 'pro', 'enterprise'], default: 'free' },
  status: { type: String, enum: ['active', 'canceled', 'past_due', 'trialing'], default: 'active' },
  stripe_customer_id: { type: String, default: null },
  stripe_subscription_id: { type: String, default: null },
  current_period_start: { type: Date, default: null },
  current_period_end: { type: Date, default: null },
}, { timestamps: true });
subscriptionSchema.index({ stripe_customer_id: 1 }, { sparse: true });
subscriptionSchema.index({ stripe_subscription_id: 1 }, { sparse: true });

const creditsSchema = new mongoose.Schema({
  client_id: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0, min: 0 },
  total_earned: { type: Number, default: 0 },
  total_consumed: { type: Number, default: 0 },
}, { timestamps: true });

const paymentHistorySchema = new mongoose.Schema({
  client_id: { type: String, required: true },
  stripe_payment_intent_id: { type: String, default: null },
  stripe_invoice_id: { type: String, default: null },
  amount: Number,          // en centavos
  currency: { type: String, default: 'usd' },
  status: { type: String, enum: ['succeeded', 'failed', 'refunded'], default: 'succeeded' },
  plan: String,
  description: String,
}, { timestamps: true });
paymentHistorySchema.index({ client_id: 1, createdAt: -1 });

const adRewardSchema = new mongoose.Schema({
  client_id: { type: String, required: true },
  credits_awarded: { type: Number, default: 5 },
  date: { type: String, required: true }, // YYYY-MM-DD
}, { timestamps: true });
adRewardSchema.index({ client_id: 1, date: 1 });

// ── Models ────────────────────────────────────────────────────────────────────
const Client        = mongoose.model('Client', clientSchema);
const Appointment   = mongoose.model('Appointment', appointmentSchema);
const Conversation  = mongoose.model('Conversation', conversationSchema);
const Message       = mongoose.model('Message', messageSchema);
const Subscription  = mongoose.model('Subscription', subscriptionSchema);
const Credits       = mongoose.model('Credits', creditsSchema);
const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);
const AdReward      = mongoose.model('AdReward', adRewardSchema);

// ── Funciones atómicas de créditos ────────────────────────────────────────────

/**
 * Consume créditos de un usuario. Devuelve { success, balance } o { success: false, error }.
 */
async function consumeCredits(clientId, amount) {
  const credits = await Credits.findOne({ client_id: clientId });
  if (!credits || credits.balance < amount) {
    return { success: false, error: 'Créditos insuficientes', balance: credits?.balance ?? 0 };
  }
  credits.balance -= amount;
  credits.total_consumed += amount;
  await credits.save();
  return { success: true, balance: credits.balance };
}

/**
 * Añade créditos a un usuario. Crea el documento si no existe.
 */
async function addCredits(clientId, amount, reason = 'manual') {
  const credits = await Credits.findOneAndUpdate(
    { client_id: clientId },
    { $inc: { balance: amount, total_earned: amount } },
    { upsert: true, new: true }
  );
  console.log(`[Credits] +${amount} créditos para ${clientId} (${reason}) → saldo: ${credits.balance}`);
  return { success: true, balance: credits.balance };
}

/**
 * Obtiene o crea la suscripción de un usuario (por defecto free).
 */
async function getOrCreateSubscription(clientId) {
  let sub = await Subscription.findOne({ client_id: clientId });
  if (!sub) {
    sub = await Subscription.create({ client_id: clientId, plan: 'free' });
    await addCredits(clientId, 0, 'account_created');
  }
  return sub;
}

// ── Connection ────────────────────────────────────────────────────────────────
async function connectDB(retries = 5, delayMs = 3000) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ ERROR: MONGODB_URI no configurada en .env');
    process.exit(1);
  }

  // Opciones para máxima resiliencia
  const opts = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
    maxPoolSize: 10,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(uri, opts);
      console.log('[DB] Conectado a MongoDB Atlas');
      break;
    } catch (err) {
      console.error(`[DB] Intento ${attempt}/${retries} fallido: ${err.message}`);
      if (attempt === retries) {
        console.error('[DB] No se pudo conectar a MongoDB. Abortando.');
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, delayMs * attempt));
    }
  }

  // Eventos de conexión para reconexión automática
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] Desconectado de MongoDB. Mongoose intentará reconectar automáticamente.');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[DB] Reconectado a MongoDB Atlas.');
  });
  mongoose.connection.on('error', (err) => {
    console.error('[DB] Error de conexión MongoDB:', err.message);
  });
}

module.exports = {
  connectDB,
  Client, Appointment, Conversation, Message,
  Subscription, Credits, PaymentHistory, AdReward,
  consumeCredits, addCredits, getOrCreateSubscription,
  PLAN_CREDITS,
};
