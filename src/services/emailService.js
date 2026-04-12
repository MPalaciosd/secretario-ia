const { Resend } = require('resend');

// Instancia con placeholder si no hay clave — send() lo detecta y loguea sin romper
const resend = new Resend(process.env.RESEND_API_KEY || 'placeholder');
const FROM     = process.env.EMAIL_FROM  || 'noreply@secretario-ia.com';
const APP_NAME = process.env.SHOP_NAME   || 'Secretario IA';

// ─── Helper: envía sin romper si Resend no está configurado ───
async function send(to, subject, html) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(`[Email] RESEND_API_KEY no configurada. Email no enviado a ${to}: ${subject}`);
    return;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) console.error('[Email] Error Resend:', error);
    else console.log(`[Email] ✅ Enviado a ${to}: ${subject}`);
  } catch (err) {
    console.error('[Email] Error:', err.message);
  }
}

// ─── Base template ─────────────────────────────────────────────
function baseTemplate(content) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background:#f5f5f5; margin:0; padding:20px; }
  .container { max-width:600px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,.1); }
  .header { background:linear-gradient(135deg,#8B1A1A 0%,#6B0F0F 100%); padding:32px; text-align:center; }
  .header h1 { color:#fff; margin:0; font-size:28px; }
  .body { padding:32px; color:#333; line-height:1.6; }
  .btn { display:inline-block; background:#8B1A1A; color:#fff; text-decoration:none; padding:12px 28px; border-radius:8px; font-weight:600; margin:16px 0; }
  .footer { background:#f9f9f9; padding:16px 32px; text-align:center; color:#888; font-size:12px; }
</style></head>
<body><div class="container">
  <div class="header"><h1>${APP_NAME}</h1></div>
  <div class="body">${content}</div>
  <div class="footer">© ${new Date().getFullYear()} ${APP_NAME}</div>
</div></body></html>`;
}

// ─── Email: evento creado ──────────────────────────────────────
async function sendEventCreatedEmail(to, name, event) {
  if (!to || !event) return;
  const dateStr = new Date(event.start_time).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const timeStr = new Date(event.start_time).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
  const html = baseTemplate(`
    <h2>📅 Evento creado, ${name || 'usuario'}!</h2>
    <p>Tu evento ha sido añadido a la agenda:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Evento</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${event.title}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Fecha</td><td style="padding:8px;border-bottom:1px solid #eee;">${dateStr}</td></tr>
      <tr><td style="padding:8px;color:#666;">Hora</td><td style="padding:8px;">${timeStr}</td></tr>
    </table>
    <p>Puedes ver y gestionar tus eventos desde la app.</p>
  `);
  await send(to, `📅 Evento creado: ${event.title}`, html);
}

// ─── Email: plan creado ───────────────────────────────────────
async function sendPlanCreatedEmail(to, name, plan, sessionsCount = 0) {
  if (!to || !plan) return;
  const html = baseTemplate(`
    <h2>🏋️ Plan creado, ${name || 'usuario'}!</h2>
    <p>Tu plan de entrenamiento está listo:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Plan</td><td style="padding:8px;border-bottom:1px solid #eee;font-weight:600;">${plan.title}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Objetivo</td><td style="padding:8px;border-bottom:1px solid #eee;">${plan.goal}</td></tr>
      <tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666;">Duración</td><td style="padding:8px;border-bottom:1px solid #eee;">${plan.weeks} semanas</td></tr>
      <tr><td style="padding:8px;color:#666;">Sesiones programadas</td><td style="padding:8px;">${sessionsCount}</td></tr>
    </table>
    <p>¡A por ello! Puedes ver tu calendario en la app.</p>
  `);
  await send(to, `🏋️ Tu plan está listo: ${plan.title}`, html);
}

// ─── Email: bienvenida ────────────────────────────────────────
async function sendWelcome(to, name) {
  const html = baseTemplate(`
    <h2>¡Bienvenido/a a ${APP_NAME}, ${name}! 👋</h2>
    <p>Tu cuenta está lista. Puedes empezar a organizar tu agenda y crear planes de entrenamiento ahora mismo.</p>
  `);
  await send(to, `¡Bienvenido/a a ${APP_NAME}!`, html);
}

// ─── Email: suscripción (alias genérico para stripeService) ───
async function sendSubscriptionEmail(to, name, subject, message) {
  const html = baseTemplate(`<h2>${subject}</h2><p>Hola ${name || 'usuario'},</p><p>${message}</p>`);
  await send(to, subject, html);
}

// ─── Email: pago confirmado ───────────────────────────────────
async function sendPaymentConfirmation(to, name, planName, amount) {
  const html = baseTemplate(`
    <h2>Pago confirmado ✅</h2>
    <p>Hola ${name}, hemos recibido tu pago correctamente.</p>
    <p>Plan: <strong>${planName}</strong> — ${amount ? '$' + amount.toFixed(2) + '/mes' : ''}</p>
  `);
  await send(to, `Confirmación de pago — ${planName}`, html);
}

// ─── Email: pago fallido ──────────────────────────────────────
async function sendPaymentFailed(to, name) {
  const html = baseTemplate(`
    <h2>Problema con tu pago ⚠️</h2>
    <p>Hola ${name}, no hemos podido procesar el pago de tu suscripción.</p>
  `);
  await send(to, 'Acción requerida: problema con tu pago', html);
}

// ─── Email: cancelación ───────────────────────────────────────
async function sendCancellationConfirmation(to, name) {
  const html = baseTemplate(`
    <h2>Suscripción cancelada</h2>
    <p>Hola ${name}, hemos cancelado tu suscripción. Seguirás teniendo acceso hasta el final del período actual.</p>
  `);
  await send(to, 'Tu suscripción ha sido cancelada', html);
}

module.exports = {
  sendEventCreatedEmail,
  sendPlanCreatedEmail,
  sendWelcome,
  sendSubscriptionEmail,
  sendPaymentConfirmation,
  sendPaymentFailed,
  sendCancellationConfirmation,
};
