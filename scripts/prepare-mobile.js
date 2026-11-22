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

// Mandatory update check (js/app-update.js) on every page, with this APK's build
// number. The APK workflow sets APP_BUILD; local builds without it skip the check.
const build = Number(process.env.APP_BUILD) || 0;
if (build) {
  const pages = [path.join(target, 'index.html'), ...fs.readdirSync(path.join(target, 'pages'))
    .filter(file => file.endsWith('.html'))
    .map(file => path.join(target, 'pages', file))];
  for (const page of pages) {
    const src = path.dirname(page) === target ? './js/app-update.js' : '../js/app-update.js';
    const html = fs.readFileSync(page, 'utf8');
    if (!html.includes('</head>')) throw new Error(`Sem </head>: ${page}`);
    fs.writeFileSync(page, html.replace('</head>', `  <script src="${src}" data-build="${build}"></script>\n  </head>`));
  }
  console.log(`Verificação de atualização ativada (build ${build}).`);
}

console.log('Pasta www/ pronta. Próximo passo: npx cap sync');
