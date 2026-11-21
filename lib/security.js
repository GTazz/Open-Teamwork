'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

// ---------------------------------------------------------------------------
// Security headers (no extra dependency needed)
// ---------------------------------------------------------------------------

/**
 * Content-Security-Policy tailored to this app: all scripts and styles come
 * from this server, avatars may be remote https images and the only embedded
 * third party is the YouTube player on the "Sobre" page.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  // blob: lets the profile page read a picked photo before resizing it.
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders({ isProduction }) {
  return (req, res, next) => {
    res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (isProduction && req.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Rate limiting (in memory: enough for a single free instance)
// ---------------------------------------------------------------------------

/**
 * Fixed-window counter per key.
 * @param {{ windowMs: number, max: number }} options
 */
function createRateLimiter({ windowMs, max }) {
  const hits = new Map();

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }, Math.min(windowMs, 60_000));
  cleanup.unref();

  /** @returns {{ limited: boolean, retryAfter: number }} */
  function hit(key) {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return {
      limited: entry.count > max,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  /** Express middleware limiting by client IP. */
  function middleware(message = 'Muitas tentativas. Tente novamente em instantes.') {
    return (req, res, next) => {
      const result = hit(req.ip || 'unknown');
      if (!result.limited) return next();
      res.setHeader('Retry-After', String(result.retryAfter));
      return res.status(429).json({ error: message });
    };
  }

  return { hit, middleware };
}

// ---------------------------------------------------------------------------
// Static files: only what the browser needs
// ---------------------------------------------------------------------------

const PUBLIC_DIRECTORIES = ['assets', 'js', 'icons'];
const PUBLIC_FILES = ['index.html', 'manifest.webmanifest', 'sw.js'];
const PUBLIC_EXTENSIONS = new Set([
  '.html', '.css', '.js', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
  '.webmanifest', '.woff2',
]);

function setCacheHeaders(res, filePath) {
  const revalidate = /\.(html|js|css|webmanifest)$/i.test(filePath);
  res.setHeader('Cache-Control', revalidate ? 'no-cache' : 'public, max-age=86400');
}

/** Rejects design sources (.psd) and anything else that is not a web asset. */
function onlyWebAssets(req, res, next) {
  let decodedPath;
  try {
    // Decoded first, so "%2Epsd" cannot sneak past the extension check.
    decodedPath = decodeURIComponent(req.path);
  } catch {
    return res.status(400).end();
  }
  const extension = path.extname(decodedPath).toLowerCase();
  if (extension && !PUBLIC_EXTENSIONS.has(extension)) return res.status(404).end();
  return next();
}

/**
 * Serves the site: index.html at "/", every page of pages/ at its own name
 * ("/perfil", "/membros", "/admin"...), manifest, service worker and the
 * asset folders. Everything else in the project folder (server code, .env,
 * database, package.json, docs...) is NOT reachable from the browser.
 *
 * The HTML links keep "pages/x.html" because the app bundle (no server) needs
 * real file names; on the website those addresses redirect to "/x".
 */
function mountStaticFiles(app, rootDir) {
  const options = { dotfiles: 'ignore', index: false, setHeaders: setCacheHeaders };
  const pagesDir = path.join(rootDir, 'pages');
  const pageNames = new Set(
    fs.readdirSync(pagesDir).filter(file => file.endsWith('.html')).map(file => file.slice(0, -5))
  );

  const redirectTo = (res, req, target) => {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, target + query);
  };
  app.get(/^\/pages\/([a-z0-9-]+)(?:\.html)?$/, (req, res, next) => (
    pageNames.has(req.params[0]) ? redirectTo(res, req, `/${req.params[0]}`) : next()
  ));
  app.get(/^\/([a-z0-9-]+)\.html$/, (req, res, next) => {
    if (req.params[0] === 'index') return redirectTo(res, req, '/');
    return pageNames.has(req.params[0]) ? redirectTo(res, req, `/${req.params[0]}`) : next();
  });

  PUBLIC_DIRECTORIES.forEach(directory => {
    app.use(`/${directory}`, onlyWebAssets, express.static(path.join(rootDir, directory), options));
  });

  PUBLIC_FILES.filter(file => file !== 'index.html').forEach(file => {
    app.get(`/${file}`, (_req, res) => {
      setCacheHeaders(res, file);
      res.sendFile(path.join(rootDir, file), { dotfiles: 'deny' });
    });
  });

  app.get('/', (_req, res) => {
    setCacheHeaders(res, 'index.html');
    res.sendFile(path.join(rootDir, 'index.html'));
  });

  app.get('/:page', (req, res, next) => {
    if (!pageNames.has(req.params.page)) return next();
    setCacheHeaders(res, 'page.html');
    return res.sendFile(path.join(pagesDir, `${req.params.page}.html`));
  });
}

/**
 * Last handler: unknown addresses get the "page not found" screen (status 404)
 * when a browser asks for a page, and an empty 404 for anything else.
 */
function mountNotFoundPage(app, rootDir) {
  app.use((req, res) => {
    res.status(404);
    if ((req.method === 'GET' || req.method === 'HEAD') && req.accepts(['html', 'json']) === 'html') {
      setCacheHeaders(res, '404.html');
      return res.sendFile(path.join(rootDir, '404.html'));
    }
    return res.end();
  });
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  securityHeaders,
  createRateLimiter,
  mountStaticFiles,
  mountNotFoundPage,
};
