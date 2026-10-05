/**
 * Galactic Warfare: Defense for Planet Earth — Express Server
 *
 * Deployable to:
 *   • Local dev      → node server/server.js  (PORT 3000)
 *   • Vercel         → vercel.json routes all requests here via serverless
 *   • Railway / Fly  → set PORT env var; server listens on process.env.PORT
 *   • GitHub Pages   → frontend-only (static); backend needs a separate host
 *
 * Database: Google Sheets via Apps Script web-app (no Firebase).
 *
 * API endpoints:
 *   GET  /api/health          — liveness probe
 *   GET  /api/sheets-url      — returns Apps Script URL to trusted clients
 *   GET  /api/version         — version info
 *   POST /api/auth/register   — account registration → Google Sheets
 *   POST /api/auth/login      — account login        → Google Sheets
 *   POST /api/auth/verify     — validate session token
 *   POST /api/auth/logout     — client token drop (stateless)
 *
 * Google Sheets storage flow (register):
 *   1. server/auth.js validates input
 *   2. POSTs { action:'register', email, password, commanderName } to
 *      GOOGLE_APPS_SCRIPT_URL (deployed Apps Script web-app)
 *   3. Apps Script salts + SHA-256 hashes the password, appends a row
 *      to the GalacticWarfare sheet, returns { success:true, progress:{...} }
 *   4. Server issues a signed JWT-style token ONLY on success:true
 *   5. If Apps Script is unreachable → HTTP 503 (no ghost tokens)
 */

'use strict';

require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const authRouter = require('./auth');

const app      = express();
const PORT     = process.env.PORT     || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD  = NODE_ENV === 'production';

// ─── Startup validation ───────────────────────────────────────────────────────
(function validateEnv() {
  const warn = [];
  if (!process.env.APP_SECRET || process.env.APP_SECRET.startsWith('REPLACE_')) {
    warn.push('  APP_SECRET is not set — tokens use the insecure fallback.');
  }
  const url = (process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  if (!url || url.includes('YOUR_DEPLOYMENT_ID')) {
    warn.push('  GOOGLE_APPS_SCRIPT_URL not configured — registration will return 503.');
  }
  if (warn.length) {
    console.warn('\n⚠  CONFIGURATION WARNINGS:');
    warn.forEach(w => console.warn(w));
    console.warn('   → Set the missing values in .env (local) or your host env vars.\n');
  }
})();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:  ["'self'"],
        scriptSrc:   [
          "'self'", "'unsafe-inline'",
          'https://cdn.jsdelivr.net',      // Phaser 3
          'https://cdnjs.cloudflare.com',
          'https://fonts.googleapis.com',
          'https://www.gstatic.com',       // Firebase compat SDK
        ],
        connectSrc:  [
          "'self'",
          'https://script.google.com',         // Apps Script web-app
          'https://script.googleusercontent.com',
          // Allow localhost for development regardless of port
          'http://localhost:*',
          'http://127.0.0.1:*',
        ],
        styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
        imgSrc:      ["'self'", 'data:', 'blob:'],
        objectSrc:   ["'none'"],
        frameSrc:    ["'none'"],
        // Only upgrade to HTTPS in production; avoids breaking local HTTP dev
        upgradeInsecureRequests: IS_PROD ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// In production the ALLOWED_ORIGINS env var MUST be set to your real domain(s).
// Examples:
//   Vercel:          ALLOWED_ORIGINS=https://your-app.vercel.app
//   Custom domain:   ALLOWED_ORIGINS=https://galacticwarfare.example.com
//   Multiple:        ALLOWED_ORIGINS=https://a.vercel.app,https://b.com
//
// In development the fallback permits localhost on common Live-Server ports.

function buildOriginList() {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
  }
  // Development fallback — never used in production
  return [
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'http://localhost:5501', 'http://127.0.0.1:5501',
  ];
}

const allowedOrigins = buildOriginList();

app.use(cors({
  origin: (origin, cb) => {
    // Same-origin requests (no Origin header) and all known origins → allow.
    // In production, an unlisted origin is rejected.
    // In development, unlisted origins are also allowed for easier tooling.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    if (!IS_PROD) return cb(null, true); // dev: allow everything
    cb(new Error(`CORS: origin ${origin} not in ALLOWED_ORIGINS`));
  },
  methods:      ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials:  true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ─── Static files ─────────────────────────────────────────────────────────────
// 1. /css/*, /js/*, /assets/* → served from public/
app.use(express.static(path.join(__dirname, '..', 'public')));
// 2. auth.html, index.html, game.html → served from project root
app.use(express.static(path.join(__dirname, '..')));

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ─── Health / info endpoints ──────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status:      'ok',
    game:        'Galactic Warfare: Defense for Planet Earth',
    version:     '1.0.1',
    environment: NODE_ENV,
    database:    'Google Sheets',
    timestamp:   new Date().toISOString(),
  });
});

// Serve the Apps Script URL to trusted client-side JS so it never appears
// in source code. The Sheets client calls this once on init.
app.get('/api/sheets-url', (_req, res) => {
  const url = (process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  if (!url || url.includes('YOUR_DEPLOYMENT_ID')) {
    return res.status(503).json({ error: 'Google Sheets not configured.' });
  }
  res.json({ url });
});

app.get('/api/version', (_req, res) => {
  res.json({ version: '1.0.1', game: 'galactic-warfare', database: 'google-sheets' });
});

// Firebase is optional. Return real config only when the env vars are present;
// otherwise an empty 200 so the client falls back to localStorage without a 404.
app.get('/api/firebase-config', (_req, res) => {
  const apiKey = (process.env.FIREBASE_API_KEY || '').trim();
  if (!apiKey) return res.json({ configured: false });
  res.json({
    apiKey,
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN || '',
    databaseURL:       process.env.FIREBASE_DATABASE_URL || 'https://garden-warfare-dbms-default-rtdb.firebaseio.com/',
    projectId:         process.env.FIREBASE_PROJECT_ID || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID || '',
  });
});

// ─── Catch-all: unknown /api/* routes return JSON, not HTML ──────────────────
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────
// Any non-API GET that didn't match a static file goes to the root index.html.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  // Never expose stack traces to clients
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start (local dev / Railway / Fly.io / Render) ────────────────────────────
// Vercel's serverless adapter calls the exported app directly; it never
// reaches app.listen(), so this block is harmless in that environment.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Galactic Warfare: Defense for Planet Earth          ║');
    console.log(`║  http://localhost:${PORT}                                 ║`);
    console.log(`║  Environment : ${NODE_ENV.padEnd(38)}║`);
    console.log('║  Database    : Google Sheets (Apps Script)           ║');
    console.log('╚══════════════════════════════════════════════════════╝');
  });
}

// Export for Vercel serverless and test suites
module.exports = app;
