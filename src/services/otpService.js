// ─── services/otpService.js ──────────────────────────────────────────
// Centralised OTP logic: generate, store, verify, and consume one-time passwords.
// Extracted from authRoutes so it can be tested and reused independently.

'use strict';

const crypto = require('crypto');
const { query } = require('../db/database');
const { sendOTPEmail } = require('./emailService');

const OTP_EXPIRY_MINUTES = 15;
const MAX_ATTEMPTS       = 5;

// ── Generate & store OTP ─────────────────────────────────────────────

/**
 * Creates a 6-digit OTP for the given userId, stores its SHA-256 hash,
 * and sends it via email.
 *
 * @param {string} userId
 * @param {string} email
 * @param {string} name
 */
async function createAndSendOTP(userId, email, name) {
  const otp      = crypto.randomInt(100000, 999999).toString();
  const otpHash  = crypto.createHash('sha256').update(otp).digest('hex');
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await query(
    `INSERT INTO email_otps (user_id, otp_hash, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id)
     DO UPDATE SET otp_hash = $2, expires_at = $3, attempts = 0`,
    [userId, otpHash, expiresAt]
  );

  // Fire-and-forget — never let email failure break the auth flow
  sendOTPEmail(email, name, otp).catch((err) =>
    console.error('[OTP] Email send error:', err.message)
  );
}

// ── Verify OTP ───────────────────────────────────────────────────────

/**
 * Verifies the OTP submitted by the user.
 *
 * @param {string} userId
 * @param {string} otp   - the raw 6-digit code from the user
 * @returns {{ valid: boolean, reason?: string }}
 */
async function verifyOTP(userId, otp) {
  const result = await query(
    `SELECT otp_hash, expires_at, attempts
     FROM email_otps
     WHERE user_id = $1`,
    [userId]
  );

  if (!result.rows.length) {
    return { valid: false, reason: 'not_found' };
  }

  const { otp_hash, expires_at, attempts } = result.rows[0];

  if (attempts >= MAX_ATTEMPTS) {
    return { valid: false, reason: 'too_many_attempts' };
  }

  if (new Date() > new Date(expires_at)) {
    return { valid: false, reason: 'expired' };
  }

  // Constant-time comparison — prevents timing attacks
  const submittedHash = crypto.createHash('sha256').update(otp).digest('hex');
  const expectedBuf   = Buffer.from(otp_hash,       'utf8');
  const receivedBuf   = Buffer.from(submittedHash,  'utf8');

  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    await query(
      'UPDATE email_otps SET attempts = attempts + 1 WHERE user_id = $1',
      [userId]
    );
    return { valid: false, reason: 'invalid' };
  }

  return { valid: true };
}

// ── Consume (delete) OTP after successful verification ───────────────

/**
 * Deletes the OTP record — call this immediately after a successful verifyOTP.
 * @param {string} userId
 */
async function consumeOTP(userId) {
  await query('DELETE FROM email_otps WHERE user_id = $1', [userId]);
}

// ── Exports ───────────────────────────────────────────────────────────

module.exports = {
  createAndSendOTP,
  verifyOTP,
  consumeOTP,
  OTP_EXPIRY_MINUTES,
  MAX_ATTEMPTS,
};
