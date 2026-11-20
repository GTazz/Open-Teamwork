'use strict';

// ========================================
// E-MAIL SENDING
// Production: Brevo HTTP API (free plan, 300 e-mails/day). An HTTP API is used
// because free hosting plans often block the SMTP ports.
// Without BREVO_API_KEY (development and automated tests) nothing is sent: the
// message is printed in the terminal and kept in `outbox`.
// ========================================

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';

/**
 * @param {{ env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} options
 */
function createMailer({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const apiKey = env.BREVO_API_KEY || '';
  const fromEmail = env.MAIL_FROM || '';
  const fromName = env.MAIL_FROM_NAME || 'Open Teamwork';
  const isProduction = env.NODE_ENV === 'production';
  const outbox = [];

  if (apiKey && !fromEmail) {
    throw new Error('MAIL_FROM must be set together with BREVO_API_KEY.');
  }

  return {
    /** "brevo" when e-mails really go out, "console" otherwise. */
    kind: apiKey ? 'brevo' : 'console',
    outbox,

    /**
     * Brevo disables API keys after 90 days without use. A cheap read call
     * (yesterday's sending statistics; sends nothing) keeps the key alive.
     * @returns {Promise<boolean>} True when the key answered.
     */
    async keepKeyAlive() {
      if (!apiKey) return false;
      try {
        const response = await fetchImpl(`${BREVO_URL.replace('/email', '/statistics/aggregatedReport')}?days=1`, {
          headers: { 'api-key': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) console.warn(`Brevo key check answered ${response.status}.`);
        return response.ok;
      } catch (error) {
        console.warn('Brevo key check failed:', error.message);
        return false;
      }
    },

    /**
     * @param {{ to: string, subject: string, text: string, html: string }} message
     */
    async send(message) {
      if (!apiKey) {
        if (isProduction) throw new Error('E-mail sending is not configured (BREVO_API_KEY).');
        outbox.push(message);
        if (env.NODE_ENV !== 'test') {
          console.log(`\n[e-mail não enviado: configure BREVO_API_KEY]\nPara: ${message.to}\nAssunto: ${message.subject}\n${message.text}\n`);
        }
        return;
      }

      const response = await fetchImpl(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Brevo answered ${response.status}: ${detail.slice(0, 300)}`);
      }
    },
  };
}

module.exports = { createMailer };
