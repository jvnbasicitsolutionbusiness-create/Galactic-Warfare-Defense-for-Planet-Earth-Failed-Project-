/**
 * Garden Warfare: Reborn — Firebase Frontend Client
 *
 * Config values are served from /api/firebase-config.
 * Falls back gracefully to localStorage if Firebase is unavailable.
 * Database URL: https://garden-warfare-dbms-default-rtdb.firebaseio.com/
 */

/* global GW, firebase */

GW.FirebaseClient = class FirebaseClient {
  constructor() {
    this.db       = null;
    this.ready    = false;
    this._pending = [];
    // The canonical database URL for Garden Warfare: Reborn
    this.DATABASE_URL = 'https://garden-warfare-dbms-default-rtdb.firebaseio.com/';
  }

  /** Initialize Firebase using config fetched from the server. */
  async init() {
    try {
      // Resolve the API base first so we never probe a hardcoded foreign port.
      if (window.GWNet && window.GWNet.probeBackend) await window.GWNet.probeBackend();
      const apiBase = (window.GWNet && window.GWNet.state) ? window.GWNet.state.apiBase : '';
      const res = await fetch(apiBase + '/api/firebase-config');
      if (!res.ok) throw new Error('Firebase config endpoint returned ' + res.status);
      const cfg = await res.json();

      if (!cfg.apiKey) throw new Error('Firebase config missing apiKey');

      // Ensure the databaseURL is the correct one
      cfg.databaseURL = cfg.databaseURL || this.DATABASE_URL;

      // Initialize app (avoid re-init if already done)
      if (typeof firebase !== 'undefined') {
        if (!firebase.apps || firebase.apps.length === 0) {
          firebase.initializeApp(cfg);
        }
        this.db    = firebase.database();
        this.ready = true;
        console.log('[Firebase] Connected to:', this.DATABASE_URL);
      }

      // Flush any pending writes
      this._pending.forEach(fn => fn());
      this._pending = [];
    } catch (e) {
      console.warn('[Firebase] Unavailable, falling back to localStorage.', e.message);
      this.ready = false;
    }
  }

  /** Save player progression. Path: /players/{uid}/progression */
  async saveProgression(uid, state) {
    if (!uid || !state) return;
    if (this.ready && this.db) {
      try {
        await this.db.ref(`players/${uid}/progression`).set({
          ...state,
          _savedAt: firebase.database.ServerValue.TIMESTAMP,
        });
        console.log('[Firebase] Progression saved for:', uid);
      } catch (e) {
        console.warn('[Firebase] saveProgression failed:', e.message);
      }
    }
    // Always mirror to localStorage as backup
    try { localStorage.setItem('gwr_fb_progression', JSON.stringify(state)); } catch (_) {}
  }

  /** Load player progression from Firebase (or localStorage fallback). */
  async loadProgression(uid) {
    if (this.ready && this.db && uid) {
      try {
        const snap = await this.db.ref(`players/${uid}/progression`).once('value');
        if (snap.exists()) return snap.val();
      } catch (e) {
        console.warn('[Firebase] loadProgression failed:', e.message);
      }
    }
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('gwr_fb_progression');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  /** Save a high score entry. */
  async saveHighScore(uid, mode, data) {
    if (!this.ready || !this.db) return;
    try {
      await this.db.ref(`highscores/${mode}/${uid}`).set({
        ...data,
        uid,
        _savedAt: firebase.database.ServerValue.TIMESTAMP,
      });
    } catch (e) {
      console.warn('[Firebase] saveHighScore failed:', e.message);
    }
  }

  /** Save a game event (level complete, card claim, etc.) */
  async saveEvent(uid, eventType, data) {
    if (!this.ready || !this.db) return;
    try {
      const timestamp = Date.now();
      await this.db.ref(`players/${uid}/events/${timestamp}`).set({
        type: eventType,
        ...data,
        _savedAt: firebase.database.ServerValue.TIMESTAMP,
      });
    } catch (e) {
      console.warn('[Firebase] saveEvent failed:', e.message);
    }
  }
};

// Global singleton
GW.firebaseClient = new GW.FirebaseClient();
