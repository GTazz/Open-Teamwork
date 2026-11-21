'use strict';

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

const PUBLIC_DIRECTORIES = ['assets', 'js', 'pages', 'icons'];
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
 * Serves index.html, manifest, service worker and four folders.
 * Everything else in the project folder (server code, .env, database,
 * package.json, docs...) is NOT reachable from the browser.
 */
function mountStaticFiles(app, rootDir) {
  const options = { dotfiles: 'ignore', index: false, setHeaders: setCacheHeaders };

  // Clean addresses: "/pages/perfil" serves perfil.html. The HTML links keep
  // ".html" because the app bundle (no server) needs it; on the website a
  // direct "/pages/perfil.html" or "/index.html" redirects to the clean one.
  const redirectClean = target => (req, res) => {
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    res.redirect(301, target(req) + query);
  };
  app.get(/^\/pages\/([a-z0-9-]+)\.html$/, redirectClean(req => `/pages/${req.params[0]}`));
  app.get('/index.html', redirectClean(() => '/'));

  PUBLIC_DIRECTORIES.forEach(directory => {
    const directoryOptions = directory === 'pages' ? { ...options, extensions: ['html'] } : options;
    app.use(`/${directory}`, onlyWebAssets, express.static(path.join(rootDir, directory), directoryOptions));
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
}

module.exports = {
  CONTENT_SECURITY_POLICY,
  securityHeaders,
  createRateLimiter,
  mountStaticFiles,
};
