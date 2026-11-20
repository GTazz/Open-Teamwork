'use strict';

/**
 * Copies the website (the same files the server serves) into ./www, the folder
 * Capacitor packages into the Android/iOS app.
 *
 *   npm run mobile:prepare
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const target = path.join(root, 'www');
const EXTENSIONS = new Set(['.html', '.css', '.js', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.ico']);

function copyDirectory(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) copyDirectory(source, destination);
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) fs.copyFileSync(source, destination);
  }
}

fs.rmSync(target, { recursive: true, force: true });
['assets', 'js', 'pages', 'icons'].forEach(directory => copyDirectory(path.join(root, directory), path.join(target, directory)));
fs.copyFileSync(path.join(root, 'index.html'), path.join(target, 'index.html'));

console.log('Pasta www/ pronta. Próximo passo: npx cap sync');
