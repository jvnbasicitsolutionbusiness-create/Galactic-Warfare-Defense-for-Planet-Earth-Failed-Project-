/**
 * Chrono-Front: Galactic War — Client-side Auth
 *
 * REGISTRATION FLOW
 * ─────────────────
 * 1. Client-side validation (email, password ≥ 8 chars, commander name 3-24 chars,
 *    passwords match).
 * 2. POST /api/auth/register  { email, password, commanderName }
 *    → Server forwards to Apps Script → Apps Script hashes password, writes row.
 *    → Server returns 201 ONLY after Apps Script confirms success:true.
 * 3. Store token + user in localStorage → redirect to index.html.
 *
 * LOGIN FLOW
 * ──────────
 * 1. POST /api/auth/login  { email, password }
 *    → Server forwards to Apps Script → Apps Script re-hashes, compares.
 * 2. Store token + user → redirect to index.html.
 *
 * SESSION CHECK
 * ─────────────
 * POST /api/auth/verify  { token }
 * Success → skip auth page.  Failure → clear session, show form.
 *
 * TOKEN STORAGE
 * ─────────────
 * localStorage key 'gw_session_token'  — HMAC-signed server token
 * localStorage key 'gw_user'           — { email, commanderName }
 * localStorage key 'gw_id_token'       — alias kept for auth guards in
 *                                         index.html / game.html
 */

'use strict';

(function () {

  /* ── Constants ─────────────────────────────────────────── */
  const TOKEN_KEY    = 'gw_session_token';
  const USER_KEY     = 'gw_user';
  const REDIRECT_URL = 'index.html';
  const DEVICE_ID    = (window.GWNet && window.GWNet.deviceId) || 'default-device';
  const LOCK_KEY     = 'gw_login_lock:' + DEVICE_ID;
  const LEGACY_LOCK_KEY = 'gw_login_lock';
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION = 5 * 60 * 1000; // 5 minutes (300,000 ms)
  const SAVED_SESSION_WINDOW = 7 * 24 * 60 * 60 * 1000;

  // All network access goes through window.GWNet (public/js/runtime.js), which
  // auto-detects the Express backend and falls back to a direct Google Apps
  // Script connection on static hosts (GitHub Pages). This makes login and
  // registration work identically on Live Server, Five Server, Render, Vercel
  // and GitHub Pages.
  const Net = window.GWNet;

  /* ── DOM refs ──────────────────────────────────────────── */
  let tabLogin, tabRegister, sectionLogin, sectionRegister;
  let formLogin,    loginEmail,   loginPassword,  loginStatus,  loginBtn;
  let formRegister, regUsername,  regEmail,       regPassword,  regConfirm;
  let regStrengthBar, regStatus,  regBtn;
  let continueSessionBtn, continueSessionNote, guestModeBtn;
  let lockoutInterval = null;

  /* ── Lockout Helpers ───────────────────────────────────── */
  function getLockState() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) {
        const legacy = localStorage.getItem(LEGACY_LOCK_KEY);
        if (!legacy) return { attempts: 0, lockedUntil: 0 };
        localStorage.setItem(LOCK_KEY, legacy);
        localStorage.removeItem(LEGACY_LOCK_KEY);
        return JSON.parse(legacy);
      }
      const parsed = JSON.parse(raw);
      const now = Date.now();
      if (parsed.lockedUntil && now >= parsed.lockedUntil) {
        localStorage.removeItem(LOCK_KEY);
        return { attempts: 0, lockedUntil: 0 };
      }
      return parsed;
    } catch (_) {
      return { attempts: 0, lockedUntil: 0 };
    }
  }

  function saveLockState(state) {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function clearLockState() {
    try {
      localStorage.removeItem(LOCK_KEY);
      localStorage.removeItem(LEGACY_LOCK_KEY);
    } catch (_) {}
    if (lockoutInterval) {
      clearInterval(lockoutInterval);
      lockoutInterval = null;
    }
    if (loginBtn) {
      loginBtn.disabled = false;
      loginBtn.classList.remove('locked');
      loginBtn.textContent = 'DEPLOY TO BASE';
    }
    if (loginEmail) loginEmail.disabled = false;
    if (loginPassword) loginPassword.disabled = false;
    if (continueSessionBtn) continueSessionBtn.disabled = false;
  }

  function startLockoutTimer(lockedUntil) {
    if (lockoutInterval) clearInterval(lockoutInterval);

    function tick() {
      const now = Date.now();
      const remainingSeconds = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
      if (remainingSeconds <= 0) {
        clearLockState();
        showStatus(loginStatus, 'Lockout period ended. Authentication attempts have been reset. You may now sign in.', 'success');
        return;
      }
      const mins = Math.floor(remainingSeconds / 60);
      const secs = remainingSeconds % 60;
      const timeStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
      showStatus(
        loginStatus,
        `Authentication locked: 5 failed attempts reached. Please wait ${timeStr} before signing in.`,
        'error'
      );
      if (loginBtn) {
        loginBtn.disabled = true;
        loginBtn.classList.add('locked');
        loginBtn.textContent = `LOCKED (${timeStr})`;
      }
      if (loginEmail) loginEmail.disabled = true;
      if (loginPassword) loginPassword.disabled = true;
      if (continueSessionBtn) continueSessionBtn.disabled = true;
    }

    tick();
    lockoutInterval = setInterval(tick, 1000);
  }

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindDomRefs();
    bindTabs();
    bindPasswordToggles();
    bindForms();
    bindEntryChoices();

    const savedToken = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('gw_id_token');
    const lastLoginAt = Number(localStorage.getItem('gw_last_login_at')) || 0;
    const savedSessionRecent = !!savedToken && lastLoginAt > 0 && Date.now() - lastLoginAt < SAVED_SESSION_WINDOW;
    if (continueSessionBtn) continueSessionBtn.hidden = !savedSessionRecent;
    if (continueSessionNote) continueSessionNote.hidden = !savedSessionRecent;
    if (savedToken && !savedSessionRecent) localStorage.removeItem('gw_last_login_at');

    // Check for active lockout
    const lock = getLockState();
    if (lock.lockedUntil && Date.now() < lock.lockedUntil) {
      startLockoutTimer(lock.lockedUntil);
    } else if (lock.attempts > 0) {
      const remaining = MAX_ATTEMPTS - lock.attempts;
      showStatus(loginStatus, `Incorrect email or password. Attempt ${lock.attempts} of ${MAX_ATTEMPTS} (${remaining} attempt${remaining === 1 ? '' : 's'} remaining).`, 'error');
    }

    // Deep-link: auth.html?tab=register
    if (new URLSearchParams(window.location.search).get('tab') === 'register') {
      switchTab('register');
    }

    // Keep the auth page available for account switching; validate saved sessions quietly.
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      verifyTokenQuiet(saved).then(ok => {
        if (!ok && localStorage.getItem(TOKEN_KEY) === saved) clearSession();
      }).catch(() => {});
    }
  }

  /* ══════════════════════════════════════════════════════════
     DOM BINDING
  ══════════════════════════════════════════════════════════ */
  function bindDomRefs() {
    tabLogin        = document.getElementById('tabLogin');
    tabRegister     = document.getElementById('tabRegister');
    sectionLogin    = document.getElementById('sectionLogin');
    sectionRegister = document.getElementById('sectionRegister');

    formLogin     = document.getElementById('formLogin');
    loginEmail    = document.getElementById('loginEmail');
    loginPassword = document.getElementById('loginPassword');
    loginStatus   = document.getElementById('loginStatus');
    loginBtn      = document.getElementById('loginBtn');

    formRegister   = document.getElementById('formRegister');
    regUsername    = document.getElementById('regUsername');   // Commander Name input
    regEmail       = document.getElementById('regEmail');
    regPassword    = document.getElementById('regPassword');
    regConfirm     = document.getElementById('regConfirm');
    regStrengthBar = document.getElementById('regStrengthBar');
    regStatus      = document.getElementById('regStatus');
    regBtn         = document.getElementById('regBtn');
  }

  function bindTabs() {
    tabLogin?.addEventListener('click',    () => switchTab('login'));
    tabRegister?.addEventListener('click', () => switchTab('register'));
  }

  function switchTab(tab) {
    const isLogin = (tab === 'login');
    tabLogin?.classList.toggle('active',  isLogin);
    tabRegister?.classList.toggle('active', !isLogin);
    tabLogin?.setAttribute('aria-selected', String(isLogin));
    tabRegister?.setAttribute('aria-selected', String(!isLogin));
    sectionLogin?.classList.toggle('active',  isLogin);
    sectionRegister?.classList.toggle('active', !isLogin);
    clearStatus(loginStatus);
    clearStatus(regStatus);
  }

  function bindForms() {
    regPassword?.addEventListener('input', () => updateStrength(regPassword.value));
    formLogin?.addEventListener('submit',    async e => { e.preventDefault(); await handleLogin(); });
    formRegister?.addEventListener('submit', async e => { e.preventDefault(); await handleRegister(); });
  }

  function bindPasswordToggles() {
    document.querySelectorAll('[data-password-toggle]').forEach(button => {
      const input = document.getElementById(button.getAttribute('aria-controls'));
      if (!input) return;
      button.setAttribute('aria-label', 'Show password');
      button.addEventListener('click', () => {
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'HIDE' : 'SHOW';
        button.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
        button.setAttribute('aria-pressed', String(visible));
      });
    });
  }

  function bindEntryChoices() {
    continueSessionBtn = document.getElementById('continueSessionBtn');
    continueSessionNote = document.getElementById('continueSessionNote');
    guestModeBtn = document.getElementById('guestModeBtn');
    continueSessionBtn?.addEventListener('click', async () => {
      const lock = getLockState();
      if (lock.lockedUntil && Date.now() < lock.lockedUntil) {
        startLockoutTimer(lock.lockedUntil);
        return;
      }
      const token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('gw_id_token');
      if (!token) { continueSessionBtn.hidden = true; return; }
      continueSessionBtn.disabled = true;
      const result = await Net.verify(token);
      continueSessionBtn.disabled = false;
      if (result && result.locked) {
        const lockedUntil = result.lockedUntil || (Date.now() + (result.remainingSeconds || 300) * 1000);
        saveLockState({ attempts: MAX_ATTEMPTS, lockedUntil });
        startLockoutTimer(lockedUntil);
        return;
      }
      if (!result || !result.ok) {
        clearSession();
        continueSessionBtn.hidden = true;
        showStatus(loginStatus, 'Saved session expired. Sign in to continue.', 'error');
        return;
      }
      sessionStorage.removeItem('gw_guess_mode');
      sessionStorage.setItem('gw_mode', 'registered');
      sessionStorage.setItem('gw_entry_authorized', '1');
      localStorage.setItem('gw_last_login_at', String(Date.now()));
      window.location.replace(REDIRECT_URL);
    });
    guestModeBtn?.addEventListener('click', () => {
      sessionStorage.setItem('gw_guess_mode', '1');
      sessionStorage.setItem('gw_mode', 'guest');
      sessionStorage.setItem('gw_entry_authorized', '1');
      window.location.replace(REDIRECT_URL);
    });
  }

  /* ══════════════════════════════════════════════════════════
     LOGIN
  ══════════════════════════════════════════════════════════ */
  async function handleLogin() {
    clearStatus(loginStatus);

    const lock = getLockState();
    if (lock.lockedUntil && Date.now() < lock.lockedUntil) {
      startLockoutTimer(lock.lockedUntil);
      return;
    }

    const email    = loginEmail?.value.trim()  || '';
    const password = loginPassword?.value       || '';

    if (!email || !password) {
      showStatus(loginStatus, 'Please enter your email and password.', 'error');
      return;
    }

    window.GWAudio?.setScene('loading');
    setLoading(loginBtn, true);

    const { ok, status, data, networkError } =
      await Net.auth('login', { email, password });

    setLoading(loginBtn, false);

    if (networkError) {
      window.GWAudio?.setScene('auth');
      showStatus(loginStatus, 'Cannot reach the server. Is it running?', 'error');
      return;
    }

    if (status === 503) {
      window.GWAudio?.setScene('auth');
      showStatus(loginStatus, 'The database is temporarily unavailable. Please try again.', 'error');
      return;
    }

    if (status === 429 || data?.locked) {
      window.GWAudio?.setScene('auth');
      const lockedUntil = data.lockedUntil || (Date.now() + (data.remainingSeconds ? data.remainingSeconds * 1000 : LOCK_DURATION));
      saveLockState({ attempts: MAX_ATTEMPTS, lockedUntil });
      startLockoutTimer(lockedUntil);
      return;
    }

    if (!ok) {
      window.GWAudio?.setScene('auth');
      const currentLock = getLockState();
      const localAttempts = currentLock.attempts + 1;
      const currentAttempts = Math.min(MAX_ATTEMPTS, Math.max(localAttempts, Number(data.attempts) || 0));

      if (currentAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = Date.now() + LOCK_DURATION;
        saveLockState({ attempts: MAX_ATTEMPTS, lockedUntil });
        startLockoutTimer(lockedUntil);
        return;
      }

      saveLockState({ attempts: currentAttempts, lockedUntil: 0 });
      const remaining = MAX_ATTEMPTS - currentAttempts;
      showStatus(
        loginStatus,
        data.error || `Incorrect email or password. Attempt ${currentAttempts} of ${MAX_ATTEMPTS} (${remaining} attempt${remaining === 1 ? '' : 's'} remaining).`,
        'error'
      );
      return;
    }

    // ── Successful Sign-In (resets attempts even after 2, 3, or 5 attempts) ──
    clearLockState();

    // Server returns { ok, email, commanderName, token, progress }
    const commanderName = data.commanderName || data.username || email.split('@')[0];
    const accountEmail = data.email || email;
    persistSession(data.token, { email: accountEmail, commanderName });
    if (data.progression && typeof data.progression === 'object' && !Array.isArray(data.progression)) {
      try {
        localStorage.setItem(progressionStorageKey(accountEmail), JSON.stringify(data.progression));
      } catch (e) {
        console.warn('[Auth] Could not cache the account progression.', e);
      }
    }
    sessionStorage.removeItem('gw_guess_mode');
    sessionStorage.setItem('gw_mode', 'registered');
    sessionStorage.setItem('gw_entry_authorized', '1');

    showStatus(loginStatus, `Welcome back, ${commanderName}. Establishing uplink…`, 'success');
    setTimeout(() => window.location.replace(REDIRECT_URL), 800);
  }

  /* ══════════════════════════════════════════════════════════
     REGISTER
  ══════════════════════════════════════════════════════════ */
  async function handleRegister() {
    window.GWAudio?.setScene('loading');
    clearStatus(regStatus);

    // The "Commander Name" input is bound to regUsername DOM element
    const commanderName = regUsername?.value.trim() || '';
    const email         = regEmail?.value.trim()    || '';
    const password      = regPassword?.value         || '';
    const confirm       = regConfirm?.value           || '';

    /* ── Client-side validation ─────────────────────────── */
    if (!commanderName || commanderName.length < 3 || commanderName.length > 24) {
      showStatus(regStatus, 'Commander name must be 3–24 characters.', 'error');
      regUsername?.focus(); return;
    }
    if (!/^[a-zA-Z0-9_\- ]+$/.test(commanderName)) {
      showStatus(regStatus, 'Commander name: letters, numbers, spaces, _ or - only.', 'error');
      regUsername?.focus(); return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showStatus(regStatus, 'Please enter a valid email address.', 'error');
      regEmail?.focus(); return;
    }
    if (password.length < 12) {
      showStatus(regStatus, 'Password must be at least 12 characters.', 'error');
      regPassword?.focus(); return;
    }
    if (password !== confirm) {
      showStatus(regStatus, 'Passwords do not match.', 'error');
      regConfirm?.focus(); return;
    }

    setLoading(regBtn, true);

    // GWNet routes to the Express backend, or straight to Apps Script on
    // static hosts. Both accept 'commanderName'.
    const { ok, status, data, networkError } =
      await Net.auth('register', { email, password, commanderName });

    setLoading(regBtn, false);

    if (networkError) {
      window.GWAudio?.setScene('auth');
      showStatus(regStatus, 'Cannot reach the server. Is it running?', 'error');
      return;
    }

    if (status === 503) {
      window.GWAudio?.setScene('auth');
      showStatus(regStatus, 'The database is temporarily unavailable. Please try again in a moment.', 'error');
      return;
    }

    if (status === 409) {
      window.GWAudio?.setScene('auth');
      showStatus(regStatus, 'An account with that email already exists.', 'error');
      return;
    }

    if (!ok) {
      window.GWAudio?.setScene('auth');
      // Show the exact error from the server / Apps Script (e.g. validation messages)
      showStatus(regStatus, data.error || data.message || 'Registration failed. Please try again.', 'error');
      return;
    }

    // Registration confirmed by Sheets — clear any lockout and persist session and redirect
    clearLockState();
    const resolvedName = data.commanderName || commanderName;
    persistSession(data.token, { email: data.email || email, commanderName: resolvedName });
    sessionStorage.removeItem('gw_guess_mode');
    sessionStorage.setItem('gw_mode', 'registered');
    sessionStorage.setItem('gw_entry_authorized', '1');

    showStatus(regStatus, `Account created, ${resolvedName}! Deploying you to the frontline…`, 'success');
    setTimeout(() => window.location.replace(REDIRECT_URL), 900);
  }

  /* ══════════════════════════════════════════════════════════
     SESSION HELPERS
  ══════════════════════════════════════════════════════════ */
  function persistSession(token, user) {
    localStorage.setItem(TOKEN_KEY,      token || '');
    localStorage.setItem('gw_id_token',  token || '');   // auth-guard alias
    localStorage.setItem(USER_KEY,       JSON.stringify(user));
    localStorage.setItem('gw_last_login_at', String(Date.now()));
  }

  function progressionStorageKey(email) {
    return 'gwr_progression_v2:' + encodeURIComponent(String(email || '').trim().toLowerCase());
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('gw_id_token');
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('gw_last_login_at');
  }

  async function verifyTokenQuiet(token) {
    const res = await Net.verify(token);
    if (res && res.ok) {
      // Refresh stored user so commanderName is always up-to-date
      const stored = JSON.parse(localStorage.getItem(USER_KEY) || '{}');
      if (res.commanderName) stored.commanderName = res.commanderName;
      if (res.username)      stored.commanderName = stored.commanderName || res.username;
      localStorage.setItem(USER_KEY, JSON.stringify(stored));
    }
    return !!(res && res.ok);
  }

  /* ══════════════════════════════════════════════════════════
     PASSWORD STRENGTH INDICATOR
  ══════════════════════════════════════════════════════════ */
  function updateStrength(pw) {
    if (!regStrengthBar) return;
    let score = 0;
    if (pw.length >= 12)           score++;
    if (pw.length >= 16)           score++;
    if (/[A-Z]/.test(pw))          score++;
    if (/[0-9]/.test(pw))          score++;
    if (/[^A-Za-z0-9]/.test(pw))   score++;
    const colors = ['#ef4444', '#f97316', '#eab308', '#22d3ee', '#4ade80'];
    regStrengthBar.style.width      = `${(score / 5) * 100}%`;
    regStrengthBar.style.background = colors[Math.max(0, score - 1)] || '#ef4444';
  }

  /* ══════════════════════════════════════════════════════════
     UI HELPERS
  ══════════════════════════════════════════════════════════ */
  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  function showStatus(el, msg, type) {
    if (!el) return;
    el.textContent = msg;
    el.className   = 'auth-status visible ' + (type || 'error');
  }

  function clearStatus(el) {
    if (!el) return;
    el.textContent = '';
    el.className   = 'auth-status';
  }

})();
