'use strict';

/**
 * Nick rules: public handle, unique (case-insensitive) and immutable.
 * Pure functions used by the API.
 */

const NICK_PATTERN = /^[a-z0-9_]{3,20}$/;
const NICK_RULES_MESSAGE =
  'O nick deve ter de 3 a 20 caracteres, usando apenas letras minúsculas, números e _.';
const RESERVED_NICKS = new Set([
  'admin', 'administrador', 'root', 'support', 'suporte', 'api', 'me', 'null',
  'undefined', 'system', 'sistema', 'moderador', 'ajuda', 'help',
  'openteamwork', 'open_teamwork',
]);

/**
 * Validates and normalizes a nick (stored in lowercase).
 * @param {unknown} value
 * @returns {{nick: string} | {error: string}}
 */
function checkNick(value) {
  const nick = String(value || '').trim().toLowerCase();
  if (!NICK_PATTERN.test(nick)) return { error: NICK_RULES_MESSAGE };
  if (RESERVED_NICKS.has(nick)) return { error: 'Este nick não está disponível.' };
  return { nick };
}

module.exports = { NICK_PATTERN, NICK_RULES_MESSAGE, RESERVED_NICKS, checkNick };
