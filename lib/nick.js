'use strict';

/**
 * Nick rules: public handle, unique (case-insensitive) and immutable.
 * Pure functions, shared by the API and by the database upgrade.
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

/** Builds a valid, unused nick from free text (used to upgrade existing accounts). */
function generateUniqueNick(source, taken) {
  let base = String(source || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  if (base.length < 3) base = `${base}user`.slice(0, 20);

  let candidate = base;
  let counter = 1;
  while (taken.has(candidate) || RESERVED_NICKS.has(candidate)) {
    counter += 1;
    const suffix = `_${counter}`;
    candidate = `${base.slice(0, 20 - suffix.length)}${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

module.exports = { NICK_PATTERN, NICK_RULES_MESSAGE, RESERVED_NICKS, checkNick, generateUniqueNick };
