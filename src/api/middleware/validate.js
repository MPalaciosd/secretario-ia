// ─── middleware/validate.js ───────────────────────────────────────────
// Centralised validation helpers — reusable across all routes.
// Returns an Express middleware that validates req.body / req.params / req.query.
// On failure calls next(err) so the global errorHandler sends the 400 response.

'use strict';

// ── Primitive validators ─────────────────────────────────────────────

/**
 * Returns true if the string looks like a valid email.
 */
function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

/**
 * Trims and clamps a string to maxLen chars. Returns '' if not a string.
 */
function sanitizeString(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.trim().substring(0, maxLen);
}

/**
 * Returns true if value is a positive integer (or a numeric string).
 */
function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

/**
 * Returns true if the string is a valid IANA timezone.
 * Falls back to checking against Intl.supportedValuesOf when available.
 */
function isValidTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ── Validation rule builders ─────────────────────────────────────────

/**
 * Builds an Express middleware that validates the request using a rule set.
 *
 * @param {Function} ruleFn  - receives (req) and returns an array of
 *                             { field, value, check, message } objects.
 *                             If check(value) is falsy, the request is rejected.
 */
function validate(ruleFn) {
  return (req, res, next) => {
    const rules = ruleFn(req);
    for (const { field, value, check, message } of rules) {
      if (!check(value)) {
        const err = new Error(message || `Campo inválido: ${field}`);
        err.status = 400;
        return next(err);
      }
    }
    next();
  };
}

// ── Prebuilt rule sets ────────────────────────────────────────────────

/** Validates email in req.body */
const validateEmailBody = validate((req) => [
  {
    field: 'email',
    value: req.body.email,
    check: isValidEmail,
    message: 'Email inválido',
  },
]);

/** Validates register body: email + name */
const validateRegister = validate((req) => [
  {
    field: 'email',
    value: req.body.email,
    check: isValidEmail,
    message: 'Email inválido',
  },
  {
    field: 'name',
    value: req.body.name,
    check: (v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 100,
    message: 'Nombre inválido (1-100 caracteres)',
  },
]);

/** Validates OTP verify body: email + 6-digit otp */
const validateOTPVerify = validate((req) => [
  {
    field: 'email',
    value: req.body.email,
    check: isValidEmail,
    message: 'Email inválido',
  },
  {
    field: 'otp',
    value: req.body.otp,
    check: (v) => typeof v === 'string' && /^\d{6}$/.test(v),
    message: 'Código OTP inválido (debe ser 6 dígitos)',
  },
]);

/** Validates profile update body: optional name and/or timezone */
const validateProfileUpdate = validate((req) => {
  const rules = [];
  if (req.body.name !== undefined) {
    rules.push({
      field: 'name',
      value: req.body.name,
      check: (v) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 100,
      message: 'Nombre inválido (1-100 caracteres)',
    });
  }
  if (req.body.timezone !== undefined) {
    rules.push({
      field: 'timezone',
      value: req.body.timezone,
      check: isValidTimezone,
      message: 'Timezone inválido',
    });
  }
  return rules;
});

/** Validates chat message body */
const validateChat = validate((req) => [
  {
    field: 'message',
    value: req.body.message,
    check: (v) => typeof v === 'string' && v.trim().length >= 1 && v.length <= 2000,
    message: 'El mensaje debe tener entre 1 y 2000 caracteres',
  },
]);

// ── Exports ───────────────────────────────────────────────────────────

module.exports = {
  // primitives — for use in services/controllers
  isValidEmail,
  sanitizeString,
  isPositiveInt,
  isValidTimezone,
  // middleware builder
  validate,
  // prebuilt middleware
  validateEmailBody,
  validateRegister,
  validateOTPVerify,
  validateProfileUpdate,
  validateChat,
};
