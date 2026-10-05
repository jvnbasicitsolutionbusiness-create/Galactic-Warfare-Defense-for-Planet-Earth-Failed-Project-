/**
 * Garden Warfare: Reborn — Progression Manager
 *
 * REVISED for Part 1:
 *  - playerName + isNewPlayer support
 *  - claimedCards instead of unlockedDefenders
 *  - Menu lock computation via GW.MENU_LOCKS
 *  - Firebase sync via GW.firebaseClient
 *  - Card claim and discovery tracking
 *  - Mode unlock based on completedLevels count
 */

/* global GW */

const GUEST_STORAGE_KEY = 'gwr_guest_progression_v1';

GW.ProgressionManager = class ProgressionManager {
  constructor() {
    this.isGuest = this._isGuestMode();
    this._key = this.isGuest ? GUEST_STORAGE_KEY : this._getStorageKey();
    this.state = this._load();
  }

  _isGuestMode() {
    try { return sessionStorage.getItem('gw_mode') === 'guest'; } catch (_) { return false; }
  }

  _getStorageKey() {
    try {
      const user = JSON.parse(localStorage.getItem('gw_user') || 'null');
      const email = user && typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
      return email ? 'gwr_progression_v2:' + encodeURIComponent(email) : null;
    } catch (e) {
      console.warn('[Progression] Could not identify the signed-in account.', e);
      return null;
    }
  }

  // ── Load / Save ───────────────────────────────────────────
  _load() {
    if (!this._key) return this._defaultState();
    try {
      const raw = localStorage.getItem(this._key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const state = Object.assign({}, this._defaultState(), parsed);
        state.settings = Object.assign({}, this._defaultState().settings, parsed.settings || {});
        // Merge any schema-default starters the save predates (e.g. saves written
        // while the Fire-Lancer card id was stale), so both starter slots always exist.
        const defaults = (GW.PROGRESSION_SCHEMA && GW.PROGRESSION_SCHEMA.claimedCards) || [];
        defaults.forEach(id => {
          if (!state.claimedCards.includes(id)) state.claimedCards.push(id);
        });
        return state;
      }
    } catch (e) {
      console.warn('[Progression] Load failed, using defaults.', e);
    }
    return this._defaultState();
  }

  _defaultState() {
    const schema = GW.PROGRESSION_SCHEMA;
    return {
      version:          schema.version || 2,
      playerName:       schema.playerName || '',
      isNewPlayer:      schema.isNewPlayer !== false,
      currentLevel:     schema.currentLevel || 1,
      completedLevels:  [],
      claimedCards:     (schema.claimedCards || ['plasma_energy_generator', 'fire_lancer']).slice(),
      discoveredEnemies:['vex_drone'],
      unlockedModes:    ['adventure', 'extras', 'settings', 'credits'],
      unlockedEnvs:     ['daytime'],
      achievements:     [],
      bestSurvivalScores: {},
      bestEndlessWave:  0,
      bestEndlessScore: 0,
      galacticCoins:    0,   // persistent wallet — never resets between levels or modes
      settings: {
        sfxVolume: 0.8, musicVolume: 0.6, showTips: true, pixelArt: true,
        resolution: 'standard', graphicsQuality: 'balanced', textureQuality: 'crisp', modelQuality: 'high',
      },
    };
  }

  saveLocal() {
    if (!this._key) {
      console.warn('[Progression] Save skipped because no registered account email is available.');
      return;
    }
    try { localStorage.setItem(this._key, JSON.stringify(this.state)); } catch (e) {
      console.warn('[Progression] Save failed.', e);
    }
  }

  save() {
    this.saveLocal();
    if (this.isGuest || this._isGuestMode()) return;
    // Async Sheets sync (fire-and-forget) — uses sheetsClient which also aliases firebaseClient
    const client = (window.GW && window.GW.sheetsClient) || (window.GW && window.GW.firebaseClient);
    if (client && client.ready) {
      let user = {};
      try { user = JSON.parse(localStorage.getItem('gw_user') || '{}'); } catch (_) {}
      if (!user.email) {
        console.warn('[Progression] Cloud save skipped because the account email is missing.');
        return;
      }
      client.saveProgression(user.email, this.state).catch(e => {
        console.warn('[Progression] Cloud save failed.', e);
      });
    }
  }

  reset() {
    this.state = this._defaultState();
    this.save();
  }

  // ── Player Profile ────────────────────────────────────────
  setPlayerName(name) {
    this.state.playerName = name.trim().substring(0, 24);
    this.state.isNewPlayer = false;
    this.save();
  }

  isNewPlayer() { return this.state.isNewPlayer; }
  getPlayerName() { return this.state.playerName || 'Commander'; }

  // ── Level Progress ────────────────────────────────────────
  isLevelUnlocked(levelId) {
    if ((this.isGuest || this._isGuestMode()) && levelId > 10) return false;
    if (levelId === 1) return true;
    const levelDef = GW.LEVELS[levelId];
    if (!levelDef) return false;
    if (!levelDef.unlockRequirement) return true;
    return this.isLevelCompleted(levelDef.unlockRequirement.level);
  }

  isLevelCompleted(levelId) {
    return this.state.completedLevels.includes(levelId);
  }

  completeLevel(levelId) {
    if (!this.isLevelCompleted(levelId)) {
      this.state.completedLevels.push(levelId);
    }
    if (levelId >= this.state.currentLevel) {
      this.state.currentLevel = Math.min(50, levelId + 1);
    }

    // Unlock modes based on completion count
    this._updateModeUnlocks();

    this.save();
  }

  _updateModeUnlocks() {
    const count = this.state.completedLevels.length;
    const locks = GW.MENU_LOCKS;
    Object.entries(locks).forEach(([modeId, cfg]) => {
      if (!cfg.unlockReq) return;
      if (cfg.unlockReq.completeLevels && count >= cfg.unlockReq.completeLevels) {
        if (!this.state.unlockedModes.includes(modeId)) {
          this.state.unlockedModes.push(modeId);
        }
      }
    });
  }

  // ── Cards ─────────────────────────────────────────────────
  isCardClaimed(cardId) {
    return this.state.claimedCards.includes(cardId);
  }

  claimCard(cardId) {
    if (cardId && !this.isCardClaimed(cardId)) {
      this.state.claimedCards.push(cardId);
      this.save();
    }
  }

  getClaimedCardIds() { return [...this.state.claimedCards]; }

  // ── Enemies ───────────────────────────────────────────────
  isEnemyDiscovered(enemyId) {
    return this.state.discoveredEnemies.includes(enemyId);
  }

  discoverEnemy(enemyId) {
    if (!this.isEnemyDiscovered(enemyId)) {
      this.state.discoveredEnemies.push(enemyId);
      this.save();
    }
  }

  // ── Modes ─────────────────────────────────────────────────
  isModeUnlocked(modeId) {
    if (modeId === 'extras') return true;
    if (this.isGuest || this._isGuestMode()) return ['adventure', 'extras', 'settings', 'credits'].includes(modeId);
    return this.state.unlockedModes.includes(modeId);
  }

  // ── Scores ────────────────────────────────────────────────
  updateEndlessHighScore(wave, score) {
    if (wave > this.state.bestEndlessWave || score > this.state.bestEndlessScore) {
      this.state.bestEndlessWave  = Math.max(this.state.bestEndlessWave, wave);
      this.state.bestEndlessScore = Math.max(this.state.bestEndlessScore, score);
      this.save();
      const client = (window.GW && window.GW.sheetsClient) || (window.GW && window.GW.firebaseClient);
      if (client && client.ready) {
        client.saveHighScore(this.state.playerName, 'endless', {
          wave: this.state.bestEndlessWave,
          score: this.state.bestEndlessScore,
        }).catch(() => {});
      }
    }
  }

  updateSurvivalScore(modeId, wave, score) {
    const existing = this.state.bestSurvivalScores[modeId] || { wave: 0, score: 0 };
    if (wave > existing.wave || score > existing.score) {
      this.state.bestSurvivalScores[modeId] = {
        wave:  Math.max(existing.wave, wave),
        score: Math.max(existing.score, score),
      };
      this.save();
    }
  }

  // ── Galactic Currency ─────────────────────────────────────
  /** Add collected coins to the persistent wallet and save. */
  addCurrency(amount) {
    if (!amount || amount <= 0) return;
    this.state.galacticCoins = (this.state.galacticCoins || 0) + amount;
    this.save();
  }

  /** Return the current wallet balance. */
  getCurrency() {
    return this.state.galacticCoins || 0;
  }

  // ── Settings ──────────────────────────────────────────────
  getSetting(key)       { return this.state.settings[key]; }
  setSetting(key, val)  { this.state.settings[key] = val; this.save(); }

  // ── Stats ─────────────────────────────────────────────────
  getStats() {
    return {
      playerName:        this.getPlayerName(),
      levelsCompleted:   this.state.completedLevels.length,
      currentLevel:      this.state.currentLevel,
      cardsCollected:    this.state.claimedCards.length,
      aliensDiscovered:  this.state.discoveredEnemies.length,
      bestEndlessWave:   this.state.bestEndlessWave,
      galacticCoins:     this.state.galacticCoins || 0,
    };
  }
};

// Global singleton — re-instantiates if already exists (hot reload safe)
GW.progression = new GW.ProgressionManager();
