'use strict';

// ========================================
// ONE-TIME E-MAIL CODES
// 6-digit codes for confirming the e-mail ("verify") and for resetting the
// password ("reset"). Only a keyed hash is stored, each code expires and
// accepts a limited number of wrong guesses, and a new one can only be sent
// after a short cooldown.
// ========================================

const crypto = require('node:crypto');

const CODE_TTL_MS = 15 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 5;
// Transparent 96px logo (works on light and dark e-mail themes).
const DEFAULT_LOGO_URL = 'https://otw.gtazz.dev/icons/email-logo.png';

const MESSAGES = {
  verify: {
    subject: code => `${code} é o seu código do Open Teamwork`,
    intro: 'Use o código abaixo para confirmar seu e-mail e ativar sua conta no Open Teamwork.',
  },
  reset: {
    subject: code => `${code} é o seu código para redefinir a senha`,
    intro: 'Use o código abaixo para criar uma nova senha no Open Teamwork.',
  },
};

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => `&#${char.charCodeAt(0)};`);
}

/**
 * @param {'verify'|'reset'} purpose @param {string} code @param {string} name
 * @param {string} logoUrl Public address of the logo (e-mail clients download it).
 */
function buildMessage(purpose, code, name, logoUrl) {
  const { subject, intro } = MESSAGES[purpose];
  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  const minutes = CODE_TTL_MS / 60_000;
  const footer = 'Se você não pediu este código, ignore este e-mail: nada muda na sua conta.';
  return {
    subject: subject(code),
    text: `${greeting}\n\n${intro}\n\n${code}\n\nO código vale por ${minutes} minutos.\n\n${footer}`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2328">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
          <td style="padding-right:12px;vertical-align:middle"><img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="Open Teamwork" style="display:block;border:0;border-radius:12px"></td>
          <td style="vertical-align:middle;font-size:20px;font-weight:700;color:#1a7f37">Open Teamwork</td>
        </tr></table>
        <p>${escapeHtml(greeting)}</p>
        <p>${escapeHtml(intro)}</p>
        <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0;padding:16px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;text-align:center">${code}</p>
        <p style="color:#59636e">O código vale por ${minutes} minutos.</p>
        <p style="color:#59636e;font-size:12px">${escapeHtml(footer)}</p>
      </div>`,
  };
}

/**
 * @param {{ db: object, mailer: object, secret: string, logoUrl?: string, now?: () => number }} deps
 */
function createEmailCodes({ db, mailer, secret, logoUrl = DEFAULT_LOGO_URL, now = Date.now }) {
  const hash = (userId, purpose, code) =>
    crypto.createHmac('sha256', secret).update(`${userId}:${purpose}:${code}`).digest('hex');

  return {
    CODE_TTL_MS,
    RESEND_COOLDOWN_MS,

    /**
     * Creates a new code and e-mails it, unless one was sent moments ago.
     * @param {{ id: number, email: string, name?: string }} user
     * @param {'verify'|'reset'} purpose
     * @returns {Promise<{ sent: boolean, retryAfter: number }>} retryAfter in seconds.
     */
    async send(user, purpose) {
      const current = await db.get(
        'SELECT sent_at FROM email_code WHERE user_id = ? AND purpose = ?',
        [user.id, purpose]
      );
      const wait = current ? current.sent_at + RESEND_COOLDOWN_MS - now() : 0;
      if (wait > 0) return { sent: false, retryAfter: Math.ceil(wait / 1000) };

      const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
      const sentAt = now();
      await db.run(
        `INSERT INTO email_code (user_id, purpose, code_hash, attempts, sent_at, expires_at)
         VALUES (?, ?, ?, 0, ?, ?)
         ON CONFLICT (user_id, purpose) DO UPDATE SET
           code_hash = excluded.code_hash, attempts = 0,
           sent_at = excluded.sent_at, expires_at = excluded.expires_at`,
        [user.id, purpose, hash(user.id, purpose, code), sentAt, sentAt + CODE_TTL_MS]
      );
      try {
        await mailer.send({ to: user.email, ...buildMessage(purpose, code, user.name, logoUrl) });
      } catch (error) {
        // Not sent: forget the code so the person can ask again right away.
        await db.run('DELETE FROM email_code WHERE user_id = ? AND purpose = ?', [user.id, purpose]);
        throw error;
      }
      return { sent: true, retryAfter: RESEND_COOLDOWN_MS / 1000 };
    },

    /**
     * Checks a typed code. A right code is used up; wrong guesses are counted
     * and the code stops working after MAX_ATTEMPTS of them or when it expires.
     * @returns {Promise<boolean>}
     */
    async consume(userId, purpose, typedCode) {
      const code = String(typedCode || '').replace(/\D/g, '');
      const row = await db.get(
        'SELECT code_hash, attempts, expires_at FROM email_code WHERE user_id = ? AND purpose = ?',
        [userId, purpose]
      );
      if (!row || row.expires_at < now() || row.attempts >= MAX_ATTEMPTS) return false;

      const expected = Buffer.from(row.code_hash, 'hex');
      const given = Buffer.from(hash(userId, purpose, code), 'hex');
      if (code.length === 6 && crypto.timingSafeEqual(expected, given)) {
        await db.run('DELETE FROM email_code WHERE user_id = ? AND purpose = ?', [userId, purpose]);
        return true;
      }
      await db.run(
        'UPDATE email_code SET attempts = attempts + 1 WHERE user_id = ? AND purpose = ?',
        [userId, purpose]
      );
      return false;
    },
  };
}

module.exports = { createEmailCodes, CODE_TTL_MS, RESEND_COOLDOWN_MS, MAX_ATTEMPTS };
