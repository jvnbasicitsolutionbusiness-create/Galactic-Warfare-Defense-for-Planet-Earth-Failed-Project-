/**
 * Chrono-Front: Galactic War — Auth Router
 *
 * DATABASE
 * ────────
 * Accounts live in Google Sheets (tab "GalacticWarfare") via a deployed
 * Apps Script web-app.  The Apps Script owns ALL password hashing — this
 * server forwards the plaintext password over HTTPS to the Apps Script,
 * which salts + SHA-256 hashes it before writing to the sheet.
 *
 * COLUMN LAYOUT (Apps Script / spreadsheet)
 *   A  Email
 *   B  Password  (salt:base64-SHA256)
 *   C  Command_N
 *   D  Modes Unlock
 *   E  Level
 *   F  Coins Collected
 *
 * SESSION TOKENS
 * ──────────────
 * Format : base64(email:commanderName:expiry) + "." + HMAC-SHA256(payload, APP_SECRET)
 * Expiry : 30 days.
 * Verified server-side on POST /api/auth/verify.
 *
 * PAYLOAD SENT TO APPS SCRIPT
 * ───────────────────────────
 * register : { action, email, password, commanderName }
 * login    : { action, email, password }
 *
 * APPS SCRIPT RESPONSES
 * ─────────────────────
 * { success: true,  progress: { commanderName, modesUnlock, level, coinsCollected } }
 * { success: false, message: "...", duplicate?: true }
 */

'use strict';

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

// ─── Token helpers ────────────────────────────────────────────────────────────

function makeToken(email, commanderName, deviceId) {
  const secret  = process.env.APP_SECRET || 'dev_secret_change_me';
  const expiry  = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
  const payload = Buffer.from(`${email}:${commanderName}:${deviceId || ''}:${expiry}`).toString('base64url');
  const sig     = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const secret  = process.env.APP_SECRET || 'dev_secret_change_me';
    const dotIdx  = token.lastIndexOf('.');
    if (dotIdx < 0) return null;
    const payload = token.slice(0, dotIdx);
    const sig     = token.slice(dotIdx + 1);
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    // Format: email:commanderName:expiry
    // email may contain ':', so split from the RIGHT
    const lastColon = decoded.lastIndexOf(':');
    const expiry = parseInt(decoded.slice(lastColon + 1), 10);
    const deviceColon = decoded.lastIndexOf(':', lastColon - 1);
    const nameColon = decoded.lastIndexOf(':', deviceColon - 1);
    let email, commanderName, deviceId = '';
    if (nameColon >= 0 && deviceColon >= 0) {
      email = decoded.slice(0, nameColon);
      commanderName = decoded.slice(nameColon + 1, deviceColon);
      deviceId = decoded.slice(deviceColon + 1, lastColon);
    } else {
      const secondColon = decoded.lastIndexOf(':', lastColon - 1);
      if (secondColon < 0) return null;
      email = decoded.slice(0, secondColon);
      commanderName = decoded.slice(secondColon + 1, lastColon);
    }
    if (!email || !commanderName || isNaN(expiry)) return null;
    if (expiry < Math.floor(Date.now() / 1000)) return null;
    return { email, commanderName, deviceId, expiry };
  } catch {
    return null;
  }
}

// ─── Apps Script communication ────────────────────────────────────────────────
//
// Node 18+ fetch() follows the Apps Script 302 redirect automatically,
// preserving the POST method and body so doPost() always receives the payload.

async function sheetsPost(payload) {
  const url = (process.env.GOOGLE_APPS_SCRIPT_URL || '').trim();
  if (!url || url.includes('YOUR_DEPLOYMENT_ID')) {
    console.warn('[Auth] GOOGLE_APPS_SCRIPT_URL not configured.');
    return null;
  }

  const maxAttempts = String(payload.action).toLowerCase() === 'login' ? 2 : 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method:   'POST',
        headers:  { 'Content-Type': 'application/json' },
        body:     JSON.stringify({ ...payload, spreadsheetId: (process.env.GOOGLE_SHEETS_ID || '').trim() }),
        redirect: 'follow',
        signal:   AbortSignal.timeout(30000),
      });

      const text = await res.text();
      if (!res.ok) {
        console.warn('[Auth] Sheets HTTP', res.status, text.slice(0, 120));
        if (res.status >= 500 && attempt < maxAttempts) continue;
        return null;
      }
      if (!text.trim()) return null;

      try {
        return JSON.parse(text);
      } catch {
        console.warn('[Auth] Sheets non-JSON:', text.slice(0, 120));
        return null;
      }
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn('[Auth] Sheets POST failed:', err.message);
        return null;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return null;
}

// ─── Rate limiter (in-memory) ─────────────────────────────────────────────────

const _attempts = new Map();

function checkRateLimit(ip, limit, windowMs) {
  const now   = Date.now();
  const entry = _attempts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  _attempts.set(ip, entry);
  return entry.count <= limit;
}

// ─── Login Failure & Lockout Tracker (5 attempts → 5 minutes locked) ───────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
const _loginLockouts = new Map();

function getLoginIdentifier(ip, email, deviceId) {
  return `${deviceId || ip || 'unknown'}:${(email || '').trim().toLowerCase()}`;
}

function getLockoutStatus(identifier) {
  const record = _loginLockouts.get(identifier);
  if (!record) return { locked: false, attempts: 0, remainingMs: 0, remainingSeconds: 0 };
  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMs = record.lockedUntil - now;
    return {
      locked: true,
      attempts: record.attempts,
      remainingMs,
      remainingSeconds: Math.ceil(remainingMs / 1000),
      lockedUntil: record.lockedUntil,
    };
  }
  // Lockout expired: reset attempts
  if (record.lockedUntil && now >= record.lockedUntil) {
    _loginLockouts.delete(identifier);
    return { locked: false, attempts: 0, remainingMs: 0, remainingSeconds: 0 };
  }
  return { locked: false, attempts: record.attempts || 0, remainingMs: 0, remainingSeconds: 0 };
}

function recordFailedLogin(identifier) {
  const now = Date.now();
  const record = _loginLockouts.get(identifier) || { attempts: 0, firstAttemptAt: now };
  record.attempts = (record.attempts || 0) + 1;
  record.lastAttemptAt = now;
  if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  _loginLockouts.set(identifier, record);
  return getLockoutStatus(identifier);
}

function resetLoginAttempts(identifier) {
  _loginLockouts.delete(identifier);
}

// ─── Validators ───────────────────────────────────────────────────────────────

const validEmail = e =>
  typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

const validPassword = p =>
  typeof p === 'string' && p.length >= 12;

const validCommanderName = n =>
  typeof n === 'string' &&
  n.trim().length >= 3 && n.trim().length <= 24 &&
  /^[a-zA-Z0-9_\- ]+$/.test(n.trim());

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/register
//
//  Flow:
//    1. Validate inputs server-side.
//    2. POST { action, email, password, commanderName } to Apps Script.
//    3. Apps Script hashes password, checks duplicate, appends row.
//    4. Return 201 ONLY when Apps Script confirms success:true.
//    5. On any failure return the error — never issue a ghost token.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    // Rate limit: 10 registrations / IP / hour (was 5 — too aggressive for real use)
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (!checkRateLimit(ip, 10, 60 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many registration attempts. Please wait an hour.' });
    }

    // Accept either 'username' or 'commanderName' from the frontend
    const email         = String(req.body?.email         || '').trim();
    const password      = String(req.body?.password      || '');
    const commanderName = String(req.body?.commanderName || req.body?.username || '').trim();

    if (!validEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!validPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 12 characters.' });
    }
    if (!validCommanderName(commanderName)) {
      return res.status(400).json({ error: 'Commander name must be 3–24 characters (letters, numbers, spaces, _ or -).' });
    }

    // ── Call Apps Script ─────────────────────────────────────────────────────
    const result = await sheetsPost({
      action:        'register',
      email:         email.toLowerCase(),
      password,               // Apps Script salts + hashes this
      commanderName,
      deviceId:      String(req.body?.deviceId || '').slice(0, 128),
    });

    // ── Handle Sheets being unreachable ───────────────────────────────────────
    if (result === null) {
      console.error('[Auth] Sheets unreachable during registration — refusing ghost token.');
      return res.status(503).json({
        error: 'The database is temporarily unavailable. Please try again in a moment.',
      });
    }

    // ── Duplicate account ─────────────────────────────────────────────────────
    // Detect via explicit flag OR message text (covers old and new Apps Script versions)
    const isDuplicate =
      result.duplicate === true ||
      (result.success === false &&
        /already exist|duplicate|registered/i.test(result.message || ''));

    if (isDuplicate) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    // ── Any other Apps Script failure ─────────────────────────────────────────
    if (result.success !== true) {
      console.warn('[Auth] Sheets register rejected:', result.message);
      return res.status(400).json({ error: result.message || 'Registration failed. Please try again.' });
    }

    // ── Success — issue session token ─────────────────────────────────────────
    const deviceId = String(req.body?.deviceId || '').slice(0, 128);
    const token    = makeToken(email.toLowerCase(), commanderName, deviceId);
    const progress = result.progress || {
      commanderName,
      modesUnlock:    'Adventure',
      level:          1,
      coinsCollected: 0,
    };

    return res.status(201).json({
      ok:   true,
      email: email.toLowerCase(),
      commanderName,
      token,
      progress,
    });

  } catch (err) {
    console.error('[Auth] /register error:', err.message);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/login
//
//  Flow:
//    1. POST { action, email, password } to Apps Script.
//    2. Apps Script finds the row, re-hashes with stored salt, compares.
//    3. On success return a signed token + progress.
//    4. On failure return 401.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const email    = String(req.body?.email    || '').trim();
    const password = String(req.body?.password || '');
    const deviceId = String(req.body?.deviceId || '').slice(0, 128);
    const identifier = getLoginIdentifier(ip, email, deviceId);

    // ── Check if locked out (5 attempts reached → 5 minutes locked) ────────
    const lockStatus = getLockoutStatus(identifier);
    if (lockStatus.locked) {
      const minutes = Math.floor(lockStatus.remainingSeconds / 60);
      const seconds = lockStatus.remainingSeconds % 60;
      const timeStr = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      return res.status(429).json({
        error: `Authentication locked: 5 failed attempts reached. Please wait ${timeStr} before trying again.`,
        locked: true,
        attempts: lockStatus.attempts,
        lockedUntil: lockStatus.lockedUntil,
        remainingSeconds: lockStatus.remainingSeconds,
      });
    }

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const result = await sheetsPost({
      action:   'login',
      email:    email.toLowerCase(),
      password,
      deviceId,
    });

    // ── Sheets unreachable ────────────────────────────────────────────────────
    if (result === null) {
      return res.status(503).json({
        error: 'The database is temporarily unavailable. Please try again in a moment.',
      });
    }

    if (result.locked) {
      const lockedUntil = Number(result.lockedUntil) || Date.now() + LOCKOUT_MS;
      _loginLockouts.set(identifier, { attempts: MAX_LOGIN_ATTEMPTS, lockedUntil });
      const remainingSeconds = Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000));
      return res.status(429).json({
        error: 'Authentication locked: 5 failed attempts reached. Unable to sign in for 5 minutes.',
        locked: true,
        attempts: MAX_LOGIN_ATTEMPTS,
        lockedUntil,
        remainingSeconds,
      });
    }

    // ── Wrong credentials ─────────────────────────────────────────────────────
    if (result.success !== true) {
      const failStatus = recordFailedLogin(identifier);
      if (failStatus.locked) {
        return res.status(429).json({
          error: 'Authentication locked: 5 failed attempts reached. Unable to sign in for 5 minutes.',
          locked: true,
          attempts: failStatus.attempts,
          lockedUntil: failStatus.lockedUntil,
          remainingSeconds: failStatus.remainingSeconds,
        });
      }
      const attemptsLeft = MAX_LOGIN_ATTEMPTS - failStatus.attempts;
      return res.status(401).json({
        error: `Incorrect email or password. Attempt ${failStatus.attempts} of ${MAX_LOGIN_ATTEMPTS} (${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining).`,
        locked: false,
        attempts: failStatus.attempts,
        attemptsRemaining: attemptsLeft,
        maxAttempts: MAX_LOGIN_ATTEMPTS,
      });
    }

    // ── Success — resets the attempts (after 2, 3, or 5 attempts) ─────────────
    resetLoginAttempts(identifier);

    const commanderName = result.progress?.commanderName || email.split('@')[0];
    const token         = makeToken(email.toLowerCase(), commanderName, deviceId);

    return res.status(200).json({
      ok:   true,
      email: email.toLowerCase(),
      commanderName,
      token,
      progress: result.progress || {},
      progression: result.progression || null,
      attemptsReset: true,
    });

  } catch (err) {
    console.error('[Auth] /login error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/verify
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify', async (req, res) => {
  try {
    const t = req.body?.token || req.body?.idToken || '';
    if (!t) return res.status(401).json({ error: 'No token provided.' });

    const decoded = verifyToken(t);
    if (!decoded) return res.status(401).json({ error: 'Invalid or expired session.' });
    if (decoded.deviceId && decoded.deviceId !== String(req.body?.deviceId || '')) {
      return res.status(401).json({ error: 'Session is bound to another device.' });
    }

    const identifier = getLoginIdentifier(req.ip || req.socket?.remoteAddress || 'unknown', decoded.email, decoded.deviceId);
    const localLock = getLockoutStatus(identifier);
    if (localLock.locked) {
      return res.status(429).json({ locked: true, lockedUntil: localLock.lockedUntil, remainingSeconds: localLock.remainingSeconds });
    }
    const storedLock = await sheetsPost({ action: 'checkLoginLock', email: decoded.email, deviceId: decoded.deviceId });
    if (storedLock && storedLock.locked) {
      const lockedUntil = Number(storedLock.lockedUntil) || Date.now() + LOCKOUT_MS;
      _loginLockouts.set(identifier, { attempts: MAX_LOGIN_ATTEMPTS, lockedUntil });
      return res.status(429).json({ locked: true, lockedUntil, remainingSeconds: Math.max(1, Math.ceil((lockedUntil - Date.now()) / 1000)) });
    }

    return res.status(200).json({
      ok:             true,
      email:          decoded.email,
      commanderName:  decoded.commanderName,
      // Keep 'username' alias so existing index.html / game.html guards work
      username:       decoded.commanderName,
    });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  res.status(200).json({ ok: true });
});

router.post('/progression', async (req, res) => {
  const decoded = verifyToken(req.body?.token);
  const state = req.body?.progression;
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired session.' });
  if (decoded.deviceId && decoded.deviceId !== String(req.body?.deviceId || '')) {
    return res.status(401).json({ error: 'Session is bound to another device.' });
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return res.status(400).json({ error: 'Invalid progression data.' });
  }

  const result = await sheetsPost({
    action: 'saveProgression',
    uid: decoded.email,
    commanderName: decoded.commanderName,
    deviceId: decoded.deviceId,
    progression_json: JSON.stringify(state),
    saved_at: new Date().toISOString(),
  });
  if (!result) return res.status(503).json({ error: 'Google Sheets is temporarily unavailable.' });
  if (result.success !== true) return res.status(502).json({ error: result.message || 'Progression could not be saved.' });
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/auth/register-confirm  (legacy no-op)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register-confirm', (_req, res) => {
  res.status(200).json({ ok: true });
});

module.exports = router;
