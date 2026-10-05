/**
 * Galactic Warfare — Adaptive Network Runtime
 * ────────────────────────────────────────────
 * Single source of truth for reaching the auth/data backend across every
 * hosting scenario:
 *
 *   • localhost:3000 (Express)      → same-origin  /api/*
 *   • Live Server / Five Server      → http://localhost:3000/api/* (if running)
 *   • Render / Vercel / Fly (https)  → same-origin  /api/*
 *   • GitHub Pages (static, no Node) → DIRECT to Google Apps Script web-app
 *
 * Strategy:
 *   1. Probe `{apiBase}/api/health`. If it answers `{status:"ok"}` we are in
 *      BACKEND mode and use the Express endpoints (which proxy Apps Script and
 *      issue HMAC session tokens).
 *   2. Otherwise we are in DIRECT mode: the browser talks straight to the
 *      Apps Script web-app. To dodge the CORS preflight that breaks
 *      `application/json` cross-origin POSTs, we send `text/plain` — Apps
 *      Script still parses `e.postData.contents`. Sessions use a local
 *      `direct.<base64>` token because there is no server to sign one.
 *
 * ── GITHUB PAGES / STATIC HOSTS ─────────────────────────────────────────────
 * Paste your deployed Apps Script "Web app URL" into APPS_SCRIPT_URL below.
 * It is a public "Anyone can access" endpoint, so exposing it client-side is
 * expected (the Express /api/sheets-url endpoint hands out the same value).
 * When left blank and a backend IS present, the URL is auto-fetched from
 * `/api/sheets-url`.
 */

(function () {
  'use strict';

  /* ───────────────────────── EDIT HERE ───────────────────────── */
  // Deployed Apps Script web-app URL. Used for DIRECT mode on static hosts
  // (GitHub Pages) where the Express backend is unavailable. On Render/Vercel/
  // localhost the backend is detected first and this is only a fallback.
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbylnBRPD17lVdvUFrLmqRNwiK5yFz_FJTessDFfTWMbGcddnyy_3UDP0ENmBetv1mEM/exec';
  /* ────────────────────────────────────────────────────────────── */

  var EXPRESS_PORT = '3000';

  // Candidate API bases, tried in order:
  //   1. same-origin  — works for the Express server on ANY port and for https
  //                     deployments (Render/Vercel); on static hosts it 404s fast.
  //   2. localhost:3000 — Live/Five Server page with a separate Express backend.
  function candidateList() {
    var list = [''];
    if (window.location.protocol !== 'https:' &&
        window.location.port !== EXPRESS_PORT) {
      list.push('http://localhost:' + EXPRESS_PORT);
    }
    return list;
  }

  function probeUrl(base) {
    var ctrl  = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 2000) : null;
    return fetch(base + '/api/health', {
      method: 'GET',
      signal: ctrl ? ctrl.signal : undefined,
      cache:  'no-store',
    })
      .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
      .then(function (d) { if (!(d && d.status === 'ok')) throw new Error('not ok'); return true; })
      .catch(function () { return false; })
      .then(function (v) { if (timer) clearTimeout(timer); return v; });
  }

  var state = {
    apiBase:       '',        // resolved by probeBackend(); same-origin default
    backend:       null,      // null = unknown, true/false after probe
    appsScriptUrl: APPS_SCRIPT_URL,
  };

  function getDeviceId() {
    var id = '';
    try { id = localStorage.getItem('gw_device_id') || ''; } catch (e) {}
    if (!id) {
      var match = document.cookie.match(/(?:^|; )gw_device_id=([^;]+)/);
      if (match) id = decodeURIComponent(match[1]);
    }
    if (!id) {
      id = window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID()
        : 'gw-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    }
    try { localStorage.setItem('gw_device_id', id); } catch (e) {}
    document.cookie = 'gw_device_id=' + encodeURIComponent(id) + '; max-age=31536000; path=/; samesite=lax' +
      (window.location.protocol === 'https:' ? '; secure' : '');
    return id;
  }
  var deviceId = getDeviceId();

  /* ── Backend probe ─────────────────────────────────────────── */
  function probeBackend(force) {
    if (!force && state.backend !== null) return Promise.resolve(state.backend);
    if (force) state.backend = null;
    var found = Promise.resolve(false);
    candidateList().forEach(function (base) {
      found = found.then(function (hit) {
        if (hit) return true;
        return probeUrl(base).then(function (ok) {
          if (ok) { state.apiBase = base; state.backend = true; }
          return ok;
        });
      });
    });
    return found.then(function (hit) {
      if (!hit) { state.apiBase = ''; state.backend = false; }
      return state.backend;
    });
  }

  /* ── Apps Script URL resolution ────────────────────────────── */
  function resolveAppsScript() {
    if (state.appsScriptUrl) return Promise.resolve(state.appsScriptUrl);
    return fetch(state.apiBase + '/api/sheets-url', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.url) state.appsScriptUrl = d.url; return state.appsScriptUrl; })
      .catch(function () { return ''; });
  }

  /* ── Direct Apps Script POST (text/plain → no preflight) ───── */
  function appsScriptPost(payload) {
    payload.deviceId = payload.deviceId || deviceId;
    return resolveAppsScript().then(function (url) {
      if (!url) throw new Error('No backend reachable and APPS_SCRIPT_URL is not configured.');
      return fetch(url, {
        method:   'POST',
        headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
        body:     JSON.stringify(payload),
        redirect: 'follow',
      });
    })
      .then(function (r) { return r.text(); })
      .then(function (txt) {
        try { return JSON.parse(txt); }
        catch (e) { throw new Error('Apps Script returned a non-JSON response.'); }
      });
  }

  /* ── Backend POST (Express /api) ───────────────────────────── */
  function backendPost(path, payload) {
    payload.deviceId = payload.deviceId || deviceId;
    return fetch(state.apiBase + path, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = {};
        try { d = JSON.parse(t); } catch (e) { /* non-JSON */ }
        return { ok: r.ok, status: r.status, data: d };
      });
    });
  }

  /* ── Local (direct-mode) session tokens ────────────────────── */
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/=/g, '');
  }
  function b64decode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(escape(atob(str)));
  }

  function issueLocalToken(email, commanderName, device) {
    var expiry  = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days
    var payload = b64encode(email + ':' + commanderName + ':' + (device || deviceId) + ':' + expiry);
    return 'direct.' + payload;
  }

  function decodeLocalToken(token) {
    if (!token || token.indexOf('direct.') !== 0) return null;
    try {
      var decoded     = b64decode(token.slice(7));
      var lastColon = decoded.lastIndexOf(':');
      var expiry = parseInt(decoded.slice(lastColon + 1), 10);
      var deviceColon = decoded.lastIndexOf(':', lastColon - 1);
      var nameColon = decoded.lastIndexOf(':', deviceColon - 1);
      var email, commanderName, tokenDevice;
      if (nameColon >= 0 && deviceColon >= 0) {
        email = decoded.slice(0, nameColon);
        commanderName = decoded.slice(nameColon + 1, deviceColon);
        tokenDevice = decoded.slice(deviceColon + 1, lastColon);
      } else {
        var secondColon = decoded.lastIndexOf(':', lastColon - 1);
        if (secondColon < 0) return null;
        email = decoded.slice(0, secondColon);
        commanderName = decoded.slice(secondColon + 1, lastColon);
      }
      if (!email || !commanderName || isNaN(expiry)) return null;
      if (expiry < Math.floor(Date.now() / 1000)) return null;
      return { email: email, commanderName: commanderName, deviceId: tokenDevice, expiry: expiry };
    } catch (e) { return null; }
  }

  /* ── Unified auth (login / register) ───────────────────────── */
  /**
   * @returns Promise<{ ok, status, data, mode, networkError? }>
   *   mode === 'backend' → data is the Express JSON ({ token, email, commanderName, progress })
   *   mode === 'direct'  → data is the Apps Script JSON ({ success, progress, duplicate? });
   *                        a local token is attached as data.token
   */
  function auth(action, payload) {
    return probeBackend().then(function (hasBackend) {
      if (hasBackend) {
        return backendPost('/api/auth/' + action, payload)
          .then(function (res) {
            return { ok: res.ok, status: res.status, data: res.data, mode: 'backend' };
          })
          .catch(function (e) {
            return { ok: false, status: 0, data: {}, networkError: e.message, mode: 'backend' };
          });
      }

      // ── Direct mode ──
      var body = { action: action, email: payload.email, password: payload.password };
      if (payload.commanderName) body.commanderName = payload.commanderName;

      return appsScriptPost(body).then(function (d) {
        var duplicate = d.duplicate === true ||
          (d.success === false && /already exist|duplicate|registered/i.test(d.message || ''));
        if (d.success) {
          var name  = (d.progress && d.progress.commanderName) ||
                      payload.commanderName || (payload.email || '').split('@')[0];
          d.token   = issueLocalToken((payload.email || '').toLowerCase(), name, deviceId);
          d.email   = (payload.email || '').toLowerCase();
          d.commanderName = name;
          return { ok: true, status: action === 'register' ? 201 : 200, data: d, mode: 'direct' };
        }
        return { ok: false, status: d.locked ? 429 : duplicate ? 409 : 401, data: d, mode: 'direct' };
      }).catch(function (e) {
        return { ok: false, status: 0, data: { error: e.message }, networkError: e.message, mode: 'direct' };
      });
    });
  }

  /* ── Unified verify ────────────────────────────────────────── */
  function verify(token) {
    if (token && token.indexOf('direct.') === 0) {
      var d = decodeLocalToken(token);
      var valid = !!d && (!d.deviceId || d.deviceId === deviceId);
      if (!valid) return Promise.resolve({ ok: false, local: true });
      return appsScriptPost({ action: 'checkLoginLock', email: d.email, deviceId: deviceId })
        .then(function (status) {
          return {
            ok: !status.locked,
            locked: !!status.locked,
            lockedUntil: status.lockedUntil,
            remainingSeconds: status.remainingSeconds,
            local: true,
            email: d.email,
            commanderName: d.commanderName,
            username: d.commanderName,
            deviceId: d.deviceId,
          };
        })
        .catch(function () {
          return { ok: true, local: true, email: d.email, commanderName: d.commanderName, username: d.commanderName, deviceId: d.deviceId };
        });
    }
    return probeBackend().then(function (hasBackend) {
      if (!hasBackend) {
        // No server to check an HMAC token against (static host). Keep the
        // session rather than logging the player out spuriously.
        return { ok: true, local: true };
      }
      return backendPost('/api/auth/verify', { token: token }).then(function (res) {
        return {
          ok: !!(res.ok && res.data && res.data.ok),
          locked: !!(res.status === 429 || (res.data && res.data.locked)),
          lockedUntil: res.data && res.data.lockedUntil,
          remainingSeconds: res.data && res.data.remainingSeconds,
          email: res.data && res.data.email,
          commanderName: res.data && res.data.commanderName,
          username: res.data && res.data.username,
        };
      });
    }).catch(function () { return { ok: true, local: true }; });
  }

  /* ── Best-effort logout ────────────────────────────────────── */
  function logout(token) {
    if (token && token.indexOf('direct.') === 0) return Promise.resolve({ ok: true });
    return probeBackend().then(function (hasBackend) {
      if (!hasBackend) return { ok: true };
      return backendPost('/api/auth/logout', { token: token }).then(function (r) { return r.data; });
    }).catch(function () { return { ok: true }; });
  }

  window.GWNet = {
    state:             state,
    probeBackend:      probeBackend,
    resolveAppsScript: resolveAppsScript,
    auth:              auth,
    verify:            verify,
    logout:            logout,
    issueLocalToken:   issueLocalToken,
    decodeLocalToken:  decodeLocalToken,
    deviceId:          deviceId,
  };
})();
