'use strict';

/**
 * Sends the APK signing key (signing/signing.env + the .jks it points to) to the
 * GitHub repository secrets the Android workflow signs with. Needs the GitHub
 * CLI ("gh") logged in.
 *
 *   npm run mobile:secrets
 *
 * Android only installs an update signed with the same key as the installed
 * app: keep a backup of the signing/ folder and never replace the key.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const REPO = 'GTazz/Open-Teamwork';
const envFile = path.join(root, 'signing', 'signing.env');

if (!fs.existsSync(envFile)) {
  console.error('Falta signing/signing.env (veja signing/signing.env.example).');
  process.exit(1);
}

const config = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
);

const keystore = path.join(root, config.ANDROID_KEYSTORE_FILE || '');
if (!config.ANDROID_KEYSTORE_FILE || !fs.existsSync(keystore)) {
  console.error(`Chave não encontrada: ${config.ANDROID_KEYSTORE_FILE || '(ANDROID_KEYSTORE_FILE vazio)'}`);
  process.exit(1);
}
if (!config.ANDROID_KEYSTORE_PASSWORD || config.ANDROID_KEY_ALIAS !== 'open-teamwork') {
  console.error('Confira ANDROID_KEYSTORE_PASSWORD e ANDROID_KEY_ALIAS (o workflow usa o alias "open-teamwork").');
  process.exit(1);
}

// Values go through stdin, so they never appear in the command line.
const setSecret = (name, value) => {
  execFileSync('gh', ['secret', 'set', name, '-R', REPO], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
};
setSecret('ANDROID_KEYSTORE_BASE64', fs.readFileSync(keystore).toString('base64'));
setSecret('ANDROID_KEYSTORE_PASSWORD', config.ANDROID_KEYSTORE_PASSWORD);

console.log(`Secrets enviados para ${REPO}:`);
execFileSync('gh', ['secret', 'list', '-R', REPO], { stdio: 'inherit' });
