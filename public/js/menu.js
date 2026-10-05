/**
 * Garden Warfare: Reborn — Main Menu Logic
 *
 * PART 1 REVISION:
 *  - 9 menu buttons with lock system (Adventure / Settings / Credits always open)
 *  - First-visit player name prompt
 *  - Lock states driven by GW.MENU_LOCKS + progression.isModeUnlocked()
 *  - Full character profile (Military + Aliens)
 *  - Dynamic level grid (all 50 with phase tabs)
 *  - Mode grids (mini-games, puzzle, survival)
 *  - Settings persistence via progression
 *  - Quit confirmation
 *  - Mixed leaf/plasma/dust particles
 */

(function () {
  'use strict';

  window._initMenu = function () {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
  };
  document.addEventListener('DOMContentLoaded', function () {
    var intro = document.getElementById('intro-screen');
    if (!intro || intro.classList.contains('gone')) { init(); }
    // Otherwise _initMenu() is called by the intro loader script in index.html
  });

  // ── Overlay registry ─────────────────────────────────────
  const OV_IDS = [
    'newPlayerOverlay','adventureOverlay','profilesOverlay',
    'survivalOverlay','miniGamesOverlay','puzzleOverlay',
    'extrasOverlay','settingsOverlay','creditsOverlay',
    'quitOverlay','notifyOverlay','comingSoonOverlay','lockedOverlay',
  ];
  const OV = {};

  function show(id) {
    const el = OV[id]; if (!el) return;
    el.hidden = false;
    const f = el.querySelector('button,[tabindex="0"],input');
    if (f) setTimeout(() => f.focus(), 60);
  }
  function hide(id)  { const el = OV[id]; if (el) el.hidden = true; }
  function hideAll() { OV_IDS.forEach(hide); }
  function g(id)     { return document.getElementById(id); }

  // ── Initialization ────────────────────────────────────────
  function init() {
    OV_IDS.forEach(id => { OV[id] = g(id); });

    _updateLockStates();
    _buildLevelGrid('daytime');
    _buildMilitaryGrid();
    _buildAliensGrid();
    _buildMiniGamesGrid();
    _buildPuzzleGrid();
    _buildSurvivalGrid();
    _loadSettings();
    _updateEndlessScore();
    _updatePlayerGreeting();
    _startParticles();
    _bindButtons();

    // Show first-visit prompt after a short delay
    const prog = window.GW && window.GW.progression;
    if (prog && prog.isNewPlayer()) {
      setTimeout(() => show('newPlayerOverlay'), 400);
    }
  }

  // ── Lock state management ─────────────────────────────────
  function _updateLockStates() {
    const prog = window.GW && window.GW.progression;
    const locks = window.GW && window.GW.MENU_LOCKS;
    if (!prog || !locks) return;

    const lockMap = {
      survival:          { btnId: 'btnSurvival',  lockId: 'lockSurvival'  },
      minigames:         { btnId: 'btnMiniGames', lockId: 'lockMiniGames' },
      puzzle:            { btnId: 'btnPuzzle',    lockId: 'lockPuzzle'    },
      characters_profile:{ btnId: 'btnProfiles',  lockId: 'lockProfiles'  },
    };

    Object.entries(lockMap).forEach(([modeId, { btnId, lockId }]) => {
      const btn   = g(btnId);
      const lockEl = g(lockId);
      if (!btn) return;
      const unlocked = prog.isModeUnlocked(modeId);
      btn.setAttribute('data-locked', unlocked ? 'false' : 'true');
      btn.setAttribute('aria-disabled', unlocked ? 'false' : 'true');
      if (lockEl) lockEl.style.display = unlocked ? 'none' : 'inline';
      if (unlocked) {
        btn.classList.remove('menu-btn--locked');
      } else {
        btn.classList.add('menu-btn--locked');
      }
    });
  }

  function _showLocked(modeId) {
    const locks = window.GW && window.GW.MENU_LOCKS;
    const req   = locks && locks[modeId] && locks[modeId].unlockReq;
    const msgEl = g('lockedMsg');
    if (msgEl && req && req.completeLevels) {
      msgEl.textContent = `Complete ${req.completeLevels} Adventure level${req.completeLevels > 1 ? 's' : ''} to unlock this mode.`;
    } else if (msgEl) {
      msgEl.textContent = 'Complete Adventure levels to unlock this mode.';
    }
    show('lockedOverlay');
  }

  function _tryOpen(modeId, overlayId) {
    const prog = window.GW && window.GW.progression;
    const configuredUnlocked = window.GW && window.GW.MENU_LOCKS &&
      window.GW.MENU_LOCKS[modeId] && window.GW.MENU_LOCKS[modeId].unlocked;
    if (prog ? prog.isModeUnlocked(modeId) : configuredUnlocked) {
      show(overlayId);
    } else {
      _showLocked(modeId);
    }
  }

  // ── Button bindings ───────────────────────────────────────
  function _bindButtons() {
    // Adventure — always unlocked
    g('btnAdventure').addEventListener('click', () => show('adventureOverlay'));

    // Locked modes
    g('btnSurvival').addEventListener('click',  () => _tryOpen('survival',           'survivalOverlay'));
    g('btnMiniGames').addEventListener('click', () => _tryOpen('minigames',          'miniGamesOverlay'));
    g('btnPuzzle').addEventListener('click',    () => _tryOpen('puzzle',             'puzzleOverlay'));
    g('btnProfiles').addEventListener('click',  () => _tryOpen('characters_profile', 'profilesOverlay'));
    g('btnExtras').addEventListener('click',    () => {
      _buildExtrasCatalog();
      _tryOpen('extras', 'extrasOverlay');
    });

    // Always unlocked
    g('btnSettings').addEventListener('click', () => show('settingsOverlay'));
    g('btnCredits').addEventListener('click',  () => show('creditsOverlay'));
    g('btnQuit').addEventListener('click',     () => window.gwLogout && window.gwLogout());
    g('btnNotify').addEventListener('click',   () => show('notifyOverlay'));

    // Quit confirm
    g('btnQuitConfirm').addEventListener('click', () => {
      hide('quitOverlay');
      // Web quit: close tab or go to a blank page
      try { window.close(); } catch (_) {}
      window.location.href = 'about:blank';
    });
    g('btnQuitCancel').addEventListener('click', () => hide('quitOverlay'));

    // Adventure close
    g('btnAdvClose').addEventListener('click',     () => hide('adventureOverlay'));
    g('btnProfilesClose').addEventListener('click',() => hide('profilesOverlay'));
    g('btnSurvivalClose').addEventListener('click',() => hide('survivalOverlay'));
    g('btnMGClose').addEventListener('click',      () => hide('miniGamesOverlay'));
    g('btnPuzzleClose').addEventListener('click',  () => hide('puzzleOverlay'));
    g('btnExtrasClose').addEventListener('click',  () => hide('extrasOverlay'));
    g('btnSettingsClose').addEventListener('click',() => { _saveSettings(); hideAll(); });
    g('btnCreditsClose').addEventListener('click', () => hide('creditsOverlay'));
    g('btnLockedClose').addEventListener('click',  () => hide('lockedOverlay'));
    g('btnNotifyClose').addEventListener('click',  () => hide('notifyOverlay'));
    g('btnCSClose').addEventListener('click',      () => hide('comingSoonOverlay'));
    g('btnEndless').addEventListener('click',      () => show('comingSoonOverlay'));

    // Profile tabs
    g('tabMilitary').addEventListener('click', () => {
      g('tabMilitary').classList.add('char-tab--active');
      g('tabAliens').classList.remove('char-tab--active');
      g('profilePanelMilitary').removeAttribute('hidden');
      g('profilePanelAliens').hidden = true;
    });
    g('tabAliens').addEventListener('click', () => {
      g('tabAliens').classList.add('char-tab--active');
      g('tabMilitary').classList.remove('char-tab--active');
      g('profilePanelAliens').removeAttribute('hidden');
      g('profilePanelMilitary').hidden = true;
    });

    // Level phase tabs
    document.querySelectorAll('.phase-tab').forEach(t => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.phase-tab').forEach(x => x.classList.remove('phase-tab--active'));
        t.classList.add('phase-tab--active');
        _buildLevelGrid(t.dataset.phase);
      });
    });

    // New player name form
    const nameInput = g('playerNameInput');
    const startBtn  = g('btnStartGame');
    const npError   = g('npError');

    if (startBtn && nameInput) {
      startBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name || name.length < 2) {
          if (npError) npError.textContent = 'Please enter at least 2 characters.';
          nameInput.focus();
          return;
        }
        const prog = window.GW && window.GW.progression;
        if (prog) prog.setPlayerName(name);
        hide('newPlayerOverlay');
        _updatePlayerGreeting();
        _updateLockStates();
      });
      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') startBtn.click();
      });
    }

    // Escape closes all
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideAll();
    });
    OV_IDS.forEach(id => {
      const el = OV[id];
      if (el) el.addEventListener('click', e => { if (e.target === el) hide(id); });
    });
  }

  // ── Player greeting ───────────────────────────────────────
  function _updatePlayerGreeting() {
    const el   = g('playerGreeting');
    const prog = window.GW && window.GW.progression;
    if (!el || !prog) return;
    if (prog.isGuest || sessionStorage.getItem('gw_mode') === 'guest') {
      el.textContent = 'GUEST DEMO  ·  SAVED UNTIL LOGOUT';
    } else if (!prog.isNewPlayer()) {
      const stats = prog.getStats();
      el.textContent = `Commander: ${stats.playerName}  ·  Level ${stats.currentLevel}  ·  ${stats.cardsCollected}/52 Cards`;
    }
  }

  // ── Level Grid ────────────────────────────────────────────
  const PHASE_RANGES = {
    daytime:     [1, 10],
    nighttime:   [11, 20],
    foggy:       [21, 30],
    rainy_stormy:[31, 40],
    radioactive: [41, 50],
  };

  function _buildLevelGrid(phase) {
    const grid = g('levelsGrid'); if (!grid) return;
    grid.innerHTML = '';
    const [s, e] = PHASE_RANGES[phase] || [1, 10];
    const prog = window.GW && window.GW.progression;

    for (let id = s; id <= e; id++) {
      const lv   = window.GW && window.GW.LEVELS ? window.GW.LEVELS[id] : null;
      const unlocked  = prog ? prog.isLevelUnlocked(id) : id === 1;
      const completed = prog ? prog.isLevelCompleted(id) : false;
      const name  = lv ? lv.name     : 'Level ' + id;
      const diff  = lv ? lv.difficulty : 'easy';
      const req   = (lv && lv.unlockRequirement)
        ? 'Complete Level ' + lv.unlockRequirement.level : 'Locked';

      const tag = unlocked ? 'button' : 'div';
      const card = document.createElement(tag);
      card.className = ['level-card',
        unlocked  ? 'level-card--unlocked' : 'level-card--locked',
        id === 1  ? 'level-card--current'  : '',
        completed ? 'level-card--completed': '',
      ].filter(Boolean).join(' ');
      if (unlocked) card.dataset.audioCue = 'level-' + id;

      if (!unlocked) {
        card.innerHTML =
          '<span class="level-lock">🔒</span>' +
          '<span class="level-num">' + id + '</span>' +
          '<span class="level-name">' + name + '</span>' +
          '<span class="level-diff level-diff--' + diff + '">' + diff.toUpperCase() + '</span>' +
          '<span class="level-req">' + req + '</span>';
      } else {
        card.innerHTML =
          '<span class="level-num">' + id + '</span>' +
          '<span class="level-name">' + name + '</span>' +
          '<span class="level-diff level-diff--' + diff + '">' + diff.toUpperCase() + '</span>' +
          (completed ? '<span class="level-complete">✓</span>' : '');
        card.addEventListener('click', () => {
          hide('adventureOverlay');
          setTimeout(() => {
            sessionStorage.setItem('gw_menu_return', '1');
            window.location.href = 'game.html?level=' + id;
          }, 100);
        });
      }
      grid.appendChild(card);
    }
  }

  // ── Military / Alien profile grids ───────────────────────
  // ── Character portrait SVGs (inline, matching the sprite-sheet designs) ──
  // These are miniature static portraits used in the profile overlay.
  // They match the colour palettes from sprites.js / the sprite-sheet references.
  const CHAR_PORTRAITS = {

    fire_lancer: `<svg viewBox="0 0 56 72" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow --><ellipse cx="28" cy="68" rx="16" ry="4" fill="#000" opacity="0.25"/>
      <!-- Boots --><rect x="18" y="52" width="9" height="7" fill="#1c1008"/><rect x="30" y="52" width="9" height="7" fill="#1c1008"/>
      <!-- Legs --><rect x="19" y="39" width="9" height="14" fill="#6b1a1a"/><rect x="30" y="39" width="9" height="14" fill="#6b1a1a"/>
      <!-- Knee guards --><rect x="18" y="42" width="11" height="3" fill="#5c3210"/><rect x="29" y="42" width="11" height="3" fill="#5c3210"/>
      <!-- Belt --><rect x="17" y="38" width="23" height="3" fill="#5c3210"/><rect x="25" y="38" width="5" height="3" fill="#d97706"/>
      <!-- Torso --><rect x="15" y="18" width="27" height="21" fill="#6b1a1a" rx="2"/>
      <!-- Armour ridge --><rect x="27" y="19" width="3" height="19" fill="#4a0f0f" opacity="0.7"/>
      <!-- Shoulder plate --><rect x="40" y="18" width="9" height="10" fill="#4a0f0f" rx="2"/>
      <!-- Left arm --><rect x="8" y="22" width="8" height="14" fill="#6b1a1a"/><circle cx="12" cy="35" r="4" fill="#d4956a"/>
      <!-- Right arm --><rect x="42" y="22" width="10" height="7" fill="#6b1a1a"/>
      <!-- Lance pole --><rect x="10" y="26" width="38" height="4" fill="#b45309"/>
      <!-- Bamboo rings --><rect x="18" y="26" width="2" height="4" fill="#78350f"/><rect x="28" y="26" width="2" height="4" fill="#78350f"/><rect x="38" y="26" width="2" height="4" fill="#78350f"/>
      <!-- Iron tip --><rect x="47" y="24" width="7" height="8" fill="#6b7280"/>
      <!-- Flame (ember) --><circle cx="54" cy="28" r="4" fill="#ff6b00" opacity="0.8"/><circle cx="54" cy="28" r="2" fill="#fef08a" opacity="0.7"/>
      <!-- Neck --><rect x="25" y="10" width="7" height="9" fill="#d4956a"/>
      <!-- Head --><rect x="18" y="-3" width="19" height="15" fill="#d4956a" rx="3"/>
      <!-- Face shadow --><rect x="19" y="3" width="16" height="5" fill="#9c5a38" opacity="0.35"/>
      <!-- Eyes --><rect x="21" y="4" width="3" height="3" fill="#1c1008"/><rect x="30" y="4" width="3" height="3" fill="#1c1008"/>
      <!-- Helmet --><rect x="17" y="-12" width="21" height="12" fill="#8b1a1a" rx="4"/>
      <!-- Helmet brim --><rect x="16" y="-2" width="23" height="3" fill="#4a0f0f"/>
      <!-- Plume base --><rect x="25" y="-21" width="5" height="10" fill="#dc2626"/>
      <!-- Plume strands --><line x1="26" y1="-21" x2="22" y2="-30" stroke="#dc2626" stroke-width="2.5"/><line x1="30" y1="-21" x2="34" y2="-30" stroke="#dc2626" stroke-width="2.5"/>
      <circle cx="22" cy="-31" r="2.5" fill="#dc2626"/><circle cx="34" cy="-31" r="2.5" fill="#dc2626"/>
    </svg>`,

    plasma_energy_generator: `<svg viewBox="-22 -58 44 82" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow --><ellipse cx="0" cy="22" rx="20" ry="5" fill="#000" opacity="0.22"/>
      <!-- Three claw feet --><rect x="-20" y="14" width="5" height="8" fill="#374151"/><rect x="-22" y="18" width="10" height="4" fill="#374151"/><rect x="-22" y="21" width="10" height="2" fill="#d97706"/>
      <rect x="-4"  y="14" width="5" height="8" fill="#374151"/><rect x="-6" y="18" width="10" height="4" fill="#374151"/><rect x="-6" y="21" width="10" height="2" fill="#d97706"/>
      <rect x="12"  y="14" width="5" height="8" fill="#374151"/><rect x="10" y="18" width="10" height="4" fill="#374151"/><rect x="10" y="21" width="10" height="2" fill="#d97706"/>
      <!-- Base platform --><rect x="-18" y="5" width="36" height="11" fill="#1e3a5f" rx="2"/>
      <rect x="-17" y="5" width="34" height="2" fill="#d97706" opacity="0.88"/><rect x="-17" y="14" width="34" height="2" fill="#d97706" opacity="0.88"/>
      <rect x="-12" y="8" width="9" height="5" fill="#2d5a8e"/><rect x="-1" y="8" width="9" height="5" fill="#2d5a8e"/><rect x="10" y="8" width="6" height="5" fill="#2d5a8e"/>
      <!-- Lower body --><rect x="-11" y="-16" width="22" height="23" fill="#2d5a8e" rx="3"/>
      <rect x="-12" y="-8" width="24" height="2" fill="#d97706" opacity="0.75"/><rect x="-12" y="-2" width="24" height="2" fill="#d97706" opacity="0.75"/>
      <circle cx="-12" cy="-5" r="2" fill="#6b7280"/><circle cx="12" cy="-5" r="2" fill="#6b7280"/>
      <rect x="-3" y="-15" width="6" height="22" fill="#1e3a5f" opacity="0.55"/>
      <!-- Mid ring --><rect x="-14" y="-19" width="28" height="5" fill="#d97706" rx="2"/>
      <!-- Upper body --><rect x="-9" y="-34" width="18" height="17" fill="#2d5a8e" rx="3"/>
      <rect x="-9" y="-34" width="3" height="17" fill="#3b82f6" opacity="0.28"/>
      <rect x="-10" y="-36" width="20" height="3" fill="#d97706" opacity="0.88"/>
      <rect x="-10" y="-18" width="20" height="3" fill="#d97706" opacity="0.88"/>
      <!-- LED --><circle cx="-5" cy="-26" r="2.5" fill="#22d3ee" opacity="0.8"/>
      <!-- Orb housing --><ellipse cx="0" cy="-38" rx="13" ry="4" fill="#1e3a5f"/>
      <ellipse cx="0" cy="-38" rx="13" ry="4" fill="none" stroke="#d97706" stroke-width="1.5"/>
      <!-- Orb glow halos --><circle cx="0" cy="-49" r="18" fill="#bfdbfe" opacity="0.09"/>
      <circle cx="0" cy="-49" r="14" fill="#3b82f6" opacity="0.22"/>
      <circle cx="0" cy="-49" r="10" fill="#3b82f6" opacity="0.92"/>
      <circle cx="-2" cy="-51" r="5" fill="#60a5fa" opacity="0.88"/>
      <circle cx="-4" cy="-53" r="2" fill="#fff" opacity="0.62"/>
      <!-- Lightning --><polyline points="0,-56 -3,-49 2,-49 -2,-42" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.8"/>
      <!-- Orbital ring --><ellipse cx="0" cy="-49" rx="14" ry="4" fill="none" stroke="#22d3ee" stroke-width="1.8" opacity="0.88"/>
      <circle cx="14" cy="-49" r="2.8" fill="#22d3ee"/>
    </svg>`,

    _default_military: `<svg viewBox="0 0 56 72" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="28" cy="68" rx="14" ry="4" fill="#000" opacity="0.2"/>
      <rect x="19" y="50" width="8" height="7" fill="#1c1008"/><rect x="30" y="50" width="8" height="7" fill="#1c1008"/>
      <rect x="20" y="37" width="8" height="14" fill="#4d7c0f"/><rect x="30" y="37" width="8" height="14" fill="#4d7c0f"/>
      <rect x="17" y="36" width="23" height="3" fill="#1c1008"/>
      <rect x="16" y="14" width="25" height="23" fill="#4d7c0f" rx="2"/>
      <rect x="38" y="18" width="14" height="5" fill="#374151"/>
      <rect x="9" y="18" width="8" height="15" fill="#4d7c0f"/>
      <rect x="25" y="8" width="7" height="7" fill="#d4956a"/>
      <rect x="19" y="-2" width="18" height="14" fill="#d4956a" rx="3"/>
      <rect x="18" y="-9" width="20" height="11" fill="#365314" rx="4"/>
      <rect x="22" y="5" width="3" height="3" fill="#1f2937"/><rect x="31" y="5" width="3" height="3" fill="#1f2937"/>
    </svg>`,

    vex_drone: `<svg viewBox="-26 -44 52 80" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow --><ellipse cx="0" cy="34" rx="20" ry="5" fill="#000" opacity="0.22"/>
      <!-- Legs --><line x1="-10" y1="12" x2="-22" y2="28" stroke="#4c3b7a" stroke-width="5" stroke-linecap="round"/>
      <line x1="10" y1="12" x2="22" y2="28" stroke="#4c3b7a" stroke-width="5" stroke-linecap="round"/>
      <!-- Shin --><line x1="-22" y1="28" x2="-18" y2="34" stroke="#7c6ab5" stroke-width="4" stroke-linecap="round"/>
      <line x1="22" y1="28" x2="18" y2="34" stroke="#7c6ab5" stroke-width="4" stroke-linecap="round"/>
      <!-- Foot claws --><polygon points="-22,34 -25,40 -20,40" fill="#9f7ded"/><polygon points="-18,34 -21,40 -16,40" fill="#9f7ded"/><polygon points="-14,34 -17,40 -12,40" fill="#9f7ded"/>
      <polygon points="22,34 19,40 24,40" fill="#9f7ded"/><polygon points="18,34 15,40 20,40" fill="#9f7ded"/><polygon points="14,34 11,40 16,40" fill="#9f7ded"/>
      <!-- Body --><ellipse cx="0" cy="2" rx="14" ry="17" fill="#4c3b7a"/>
      <!-- Body highlight --><ellipse cx="2" cy="2" rx="8" ry="10" fill="#7c6ab5" opacity="0.22"/>
      <!-- Core --><circle cx="0" cy="2" r="8" fill="#a855f7" opacity="0.3"/><circle cx="0" cy="2" r="4.5" fill="#a855f7" opacity="0.85"/><circle cx="0" cy="2" r="2" fill="#e879f9" opacity="0.7"/>
      <!-- Arms --><line x1="-13" y1="-1" x2="-26" y2="10" stroke="#4c3b7a" stroke-width="5" stroke-linecap="round"/>
      <line x1="13" y1="-1" x2="26" y2="10" stroke="#4c3b7a" stroke-width="5" stroke-linecap="round"/>
      <circle cx="-26" cy="10" r="4.5" fill="#9f7ded"/><circle cx="26" cy="10" r="4.5" fill="#9f7ded"/>
      <!-- Neck --><ellipse cx="0" cy="-13" rx="9" ry="7" fill="#4c3b7a"/>
      <!-- Head --><rect x="-17" y="-33" width="34" height="22" fill="#4c3b7a" rx="7"/>
      <!-- Cranial ridges --><polygon points="-12,-33 -15,-41 -9,-41" fill="#7c6ab5"/><polygon points="-4,-33 -7,-41 -1,-41" fill="#7c6ab5"/>
      <polygon points="4,-33 1,-41 7,-41" fill="#7c6ab5"/><polygon points="12,-33 9,-41 15,-41" fill="#7c6ab5"/>
      <!-- Eyes (3) --><circle cx="-9" cy="-23" r="5" fill="#e879f9"/>
      <circle cx="-9" cy="-23" r="2.5" fill="#fde047" opacity="0.6"/><circle cx="-9" cy="-23" r="1.2" fill="#1a0030"/>
      <circle cx="0" cy="-25" r="3.5" fill="#e879f9"/>
      <circle cx="0" cy="-25" r="1.8" fill="#fde047" opacity="0.5"/><circle cx="0" cy="-25" r="0.9" fill="#1a0030"/>
      <circle cx="9" cy="-23" r="5" fill="#e879f9"/>
      <circle cx="9" cy="-23" r="2.5" fill="#fde047" opacity="0.6"/><circle cx="9" cy="-23" r="1.2" fill="#1a0030"/>
      <!-- Eye glow --><circle cx="-9" cy="-23" r="7" fill="none" stroke="#e879f9" stroke-width="1" opacity="0.35"/>
      <circle cx="9" cy="-23" r="7" fill="none" stroke="#e879f9" stroke-width="1" opacity="0.35"/>
      <!-- Mouth --><rect x="-7" y="-14" width="14" height="4" fill="#0a0015" rx="2"/>
      <polygon points="-5,-14 -3,-10 -1,-14" fill="#7c6ab5"/><polygon points="1,-14 3,-10 5,-14" fill="#7c6ab5"/>
    </svg>`,

    vex_flag_bearer: `<svg viewBox="-26 -56 60 94" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow --><ellipse cx="4" cy="36" rx="20" ry="5" fill="#000" opacity="0.22"/>
      <!-- Legs --><line x1="-8" y1="14" x2="-20" y2="30" stroke="#e879f9" stroke-width="5" stroke-linecap="round"/>
      <line x1="12" y1="14" x2="24" y2="30" stroke="#e879f9" stroke-width="5" stroke-linecap="round"/>
      <!-- Shin --><line x1="-20" y1="30" x2="-16" y2="37" stroke="#c026d3" stroke-width="4" stroke-linecap="round"/>
      <line x1="24" y1="30" x2="20" y2="37" stroke="#c026d3" stroke-width="4" stroke-linecap="round"/>
      <!-- Claws --><polygon points="-22,37 -25,43 -19,43" fill="#f0abfc"/><polygon points="-16,37 -19,43 -13,43" fill="#f0abfc"/>
      <polygon points="24,37 21,43 27,43" fill="#f0abfc"/><polygon points="18,37 15,43 21,43" fill="#f0abfc"/>
      <!-- Body --><ellipse cx="2" cy="4" rx="13" ry="15" fill="#e879f9"/>
      <!-- Body accent --><ellipse cx="3" cy="4" rx="7" ry="9" fill="#f0abfc" opacity="0.2"/>
      <!-- Core --><circle cx="2" cy="4" r="7" fill="#c084fc" opacity="0.3"/><circle cx="2" cy="4" r="4" fill="#c084fc" opacity="0.85"/><circle cx="2" cy="4" r="1.8" fill="#fff" opacity="0.5"/>
      <!-- Left arm --><line x1="-11" y1="0" x2="-22" y2="10" stroke="#e879f9" stroke-width="5" stroke-linecap="round"/>
      <circle cx="-22" cy="10" r="4" fill="#f0abfc"/>
      <!-- Right arm (holds flag) --><line x1="13" y1="-1" x2="18" y2="-12" stroke="#e879f9" stroke-width="5" stroke-linecap="round"/>
      <circle cx="18" cy="-12" r="4" fill="#f0abfc"/>
      <!-- Flag pole --><line x1="18" y1="-12" x2="20" y2="-52" stroke="#d97706" stroke-width="3.5"/>
      <circle cx="20" cy="-54" r="3.5" fill="#fbbf24"/>
      <circle cx="20" cy="-54" r="2" fill="#7e22ce"/>
      <!-- Flag (red triangle) --><polygon points="22,-52 40,-44 22,-36" fill="#ef4444" opacity="0.95"/>
      <!-- Flag shading --><polygon points="22,-52 27,-44 22,-36" fill="#b91c1c" opacity="0.5"/>
      <!-- Flag emblem --><circle cx="32" cy="-44" r="3.5" fill="#fff" opacity="0.6"/><circle cx="32" cy="-44" r="1.5" fill="#7e22ce" opacity="0.8"/>
      <!-- Neck --><ellipse cx="2" cy="-12" rx="8" ry="6" fill="#e879f9"/>
      <!-- Head --><rect x="-14" y="-32" width="30" height="22" fill="#e879f9" rx="6"/>
      <!-- Head highlight --><rect x="-12" y="-32" width="26" height="9" fill="#f0abfc" opacity="0.18" rx="5"/>
      <!-- Left ear --><polygon points="-14,-22 -24,-36 -8,-18" fill="#e879f9"/>
      <polygon points="-14,-22 -20,-33 -10,-20" fill="#c026d3" opacity="0.5"/>
      <!-- Right ear --><polygon points="16,-22 26,-36 10,-18" fill="#e879f9"/>
      <polygon points="16,-22 22,-33 12,-20" fill="#c026d3" opacity="0.5"/>
      <!-- Cranial ridges --><polygon points="-9,-32 -12,-40 -6,-40" fill="#c026d3" opacity="0.85"/>
      <polygon points="-1,-32 -4,-40 2,-40" fill="#c026d3" opacity="0.85"/>
      <polygon points="7,-32 4,-40 10,-40" fill="#c026d3" opacity="0.85"/>
      <!-- Eyes (2 oval) --><ellipse cx="-6" cy="-22" rx="5" ry="6" fill="#a855f7"/>
      <ellipse cx="-6" cy="-22" rx="3" ry="4" fill="#c084fc" opacity="0.7"/>
      <ellipse cx="-6" cy="-22" rx="1.5" ry="2" fill="#1a0030"/>
      <ellipse cx="8" cy="-22" rx="5" ry="6" fill="#a855f7"/>
      <ellipse cx="8" cy="-22" rx="3" ry="4" fill="#c084fc" opacity="0.7"/>
      <ellipse cx="8" cy="-22" rx="1.5" ry="2" fill="#1a0030"/>
      <!-- Eye glow --><ellipse cx="-6" cy="-22" rx="7" ry="9" fill="none" stroke="#a855f7" stroke-width="1.2" opacity="0.38"/>
      <ellipse cx="8" cy="-22" rx="7" ry="9" fill="none" stroke="#a855f7" stroke-width="1.2" opacity="0.38"/>
      <!-- Fangs --><rect x="-6" y="-13" width="13" height="4" fill="#1a0030" rx="2"/>
      <polygon points="-4,-13 -2,-9 0,-13" fill="#fff" opacity="0.7"/><polygon points="2,-13 4,-9 6,-13" fill="#fff" opacity="0.7"/>
    </svg>`,
  };

  // Draw a mini portrait canvas for any unit that doesn't have an SVG portrait
  function _drawMiniCanvas(colorHex, accentHex, isAlien) {
    const cvs = document.createElement('canvas');
    cvs.width = 56; cvs.height = 72;
    const ctx = cvs.getContext('2d');
    const c = '#' + colorHex.toString(16).padStart(6, '0');
    const a = '#' + accentHex.toString(16).padStart(6, '0');
    if (isAlien) {
      // Simple alien silhouette
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(28, 42, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(12, 15, 30, 20, 6); ctx.fill();
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.ellipse(20, 24, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(36, 24, 5, 5, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      // Simple soldier silhouette
      ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(15, 22, 26, 24, 2); ctx.fill();
      ctx.fillStyle = '#d4956a'; ctx.beginPath(); ctx.roundRect(18, 8, 20, 14, 4); ctx.fill();
      ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(17, 4, 22, 10, 4); ctx.fill();
    }
    return cvs.toDataURL();
  }

  function _buildMilitaryGrid() {
    const grid = g('militaryGrid'); if (!grid) return;
    const prog  = window.GW && window.GW.progression;
    const cards = window.GW && window.GW.CARDS;
    if (!cards) return;
    grid.innerHTML = '';

    Object.values(cards).forEach(card => {
      const claimed     = prog ? prog.isCardClaimed(card.id) : card.unlockLevel === 'start';
      const rarityClass = card.rarity ? 'char-role--' + card.rarity : 'char-role--offense';
      const rarityLabel = card.rarity ? card.rarity.toUpperCase() : (card.role || card.era || '').toUpperCase();

      const el = document.createElement('div');
      el.className = 'char-card ' + (claimed ? 'char-card--unlocked' : 'char-card--locked');

      if (claimed) {
        // Pick portrait SVG: known units get detailed art, others get a mini canvas render
        const portraitSvg =
          CHAR_PORTRAITS[card.id] ||
          (card.id === 'fire_lancer'             ? CHAR_PORTRAITS.fire_lancer             : null) ||
          (card.id === 'plasma_energy_generator' ? CHAR_PORTRAITS.plasma_energy_generator : null) ||
          CHAR_PORTRAITS._default_military;

        const portraitHtml = portraitSvg
          ? '<div class="char-portrait char-portrait--svg">' + portraitSvg + '</div>'
          : '<div class="char-portrait char-portrait--canvas"><img src="' +
              _drawMiniCanvas(card.color || 0x4d7c0f, card.accentColor || 0xa3e635, false) +
              '" width="56" height="72" alt=""/></div>';

        el.innerHTML =
          portraitHtml +
          '<div class="char-name">' + card.name + '</div>' +
          '<div class="char-role ' + rarityClass + '">' + rarityLabel + '</div>' +
          '<div class="char-cost">⚡' + card.cost + '</div>';

        // Role sub-badge (small text showing unit role)
        if (card.role && card.role !== 'offense') {
          el.querySelector('.char-role').title = 'Role: ' + card.role;
        }
      } else {
        el.innerHTML =
          '<div class="char-portrait char-portrait--locked"><span class="char-silhouette-q">?</span></div>' +
          '<div class="char-name char-name--locked">' + card.name + '</div>' +
          '<div class="char-lock">🔒 Lv.' + card.unlockLevel + '</div>';
      }
      grid.appendChild(el);
    });
  }

  function _buildAliensGrid() {
    const grid    = g('aliensGrid'); if (!grid) return;
    const prog    = window.GW && window.GW.progression;
    const enemies = window.GW && window.GW.ENEMIES;
    if (!enemies) return;
    grid.innerHTML = '';

    Object.values(enemies).forEach(def => {
      const disc = prog ? prog.isEnemyDiscovered(def.id) : def.introducedLevel === 1;
      const el   = document.createElement('div');
      el.className = 'char-card ' + (disc ? 'char-card--alien' : 'char-card--locked');

      if (disc) {
        const portraitSvg =
          CHAR_PORTRAITS[def.id] ||
          (def.id === 'vex_drone'        ? CHAR_PORTRAITS.vex_drone        : null) ||
          (def.id === 'vex_flag_bearer'  ? CHAR_PORTRAITS.vex_flag_bearer  : null);

        const spritePath = window.GW.ASSETS && window.GW.ASSETS.SPRITES && window.GW.ASSETS.SPRITES[def.id];
        const portraitHtml = spritePath
          ? '<div class="char-portrait char-portrait--svg char-portrait--alien"><img src="' +
              spritePath + '" width="56" height="72" alt="' + def.name + '"/></div>'
          : portraitSvg
            ? '<div class="char-portrait char-portrait--svg char-portrait--alien">' + portraitSvg + '</div>'
            : '<div class="char-portrait char-portrait--canvas"><img src="' +
              _drawMiniCanvas(def.color || 0x4c3b7a, def.accentColor || 0x7c6ab5, true) +
              '" width="56" height="72" alt=""/></div>';

        const classLabel = def.class ? def.class.toUpperCase() : 'ALIEN';
        const rarityLabel = def.rarity ? def.rarity.toUpperCase() : '';

        el.innerHTML =
          portraitHtml +
          '<div class="char-name">' + def.name + '</div>' +
          '<div class="char-role char-role--alien">' + classLabel + '</div>' +
          (rarityLabel ? '<div class="char-rarity char-rarity--' + (def.rarity || 'common') + '">' + rarityLabel + '</div>' : '');
      } else {
        el.innerHTML =
          '<div class="char-portrait char-portrait--locked"><span class="char-silhouette-q">?</span></div>' +
          '<div class="char-name char-name--locked">???</div>' +
          '<div class="char-lock">🔒 Encounter to unlock</div>';
      }
      grid.appendChild(el);
    });
  }

  function _buildExtrasCatalog() {
    const militaryGrid = g('extrasMilitaryGrid');
    const aliensGrid = g('extrasAliensGrid');
    const militaryCount = g('extrasMilitaryCount');
    const alienCount = g('extrasAlienCount');
    const prog = window.GW && window.GW.progression;
    const cards = window.GW && window.GW.CARDS;
    const enemies = window.GW && window.GW.ENEMIES;
    if (!militaryGrid || !aliensGrid || !cards || !enemies) return;

    const cardDefs = Object.values(cards);
    const unlockedCards = cardDefs.filter(card =>
      prog ? prog.isCardClaimed(card.id) : card.unlockLevel === 'start'
    );
    const enemyDefs = Object.values(enemies);
    const encounteredEnemies = enemyDefs.filter(enemy =>
      prog ? prog.isEnemyDiscovered(enemy.id) : enemy.introducedLevel === 1
    );

    militaryGrid.replaceChildren();
    aliensGrid.replaceChildren();
    if (militaryCount) militaryCount.textContent = `${unlockedCards.length} / ${cardDefs.length}`;
    if (alienCount) alienCount.textContent = `${encounteredEnemies.length} / ${enemyDefs.length}`;

    unlockedCards.forEach(card => {
      const item = document.createElement('article');
      item.className = 'char-card char-card--unlocked';
      item.appendChild(_createCatalogPortrait(card.color, card.accentColor, false, card.id));
      _appendCatalogText(item, 'char-name', card.name);
      _appendCatalogText(item, 'char-role char-role--' + (card.role || 'offense'), (card.role || card.era || 'Military').toUpperCase());
      _appendCatalogText(item, 'char-cost', `${card.cost} P.E. · ${card.hp} HP`);
      const weapon = card.weapon && GW.WEAPONS && GW.WEAPONS[card.weapon];
      _appendCatalogText(item, 'extras-detail', card.description || (weapon && weapon.description) || 'Military unit available for deployment.');
      militaryGrid.appendChild(item);
    });

    encounteredEnemies.forEach(enemy => {
      const item = document.createElement('article');
      item.className = 'char-card char-card--alien';
      item.appendChild(_createCatalogPortrait(enemy.color, enemy.accentColor, true, enemy.id));
      _appendCatalogText(item, 'char-name', enemy.name);
      _appendCatalogText(item, 'char-role char-role--alien', (enemy.class || 'Alien').toUpperCase());
      _appendCatalogText(item, 'char-cost', `${enemy.hp} HP · ${enemy.speed} speed`);
      _appendCatalogText(item, 'extras-detail', enemy.description || enemy.specialAbility || 'Alien variant encountered in battle.');
      aliensGrid.appendChild(item);
    });
  }

  function _createCatalogPortrait(color, accentColor, isAlien, name) {
    const wrapper = document.createElement('div');
    wrapper.className = 'char-portrait char-portrait--canvas';
    const image = document.createElement('img');
    image.src = _drawMiniCanvas(color || (isAlien ? 0x4c3b7a : 0x4d7c0f), accentColor || (isAlien ? 0x7c6ab5 : 0xa3e635), isAlien);
    image.width = 56;
    image.height = 72;
    image.alt = `${name} portrait`;
    wrapper.appendChild(image);
    return wrapper;
  }

  function _appendCatalogText(parent, className, text) {
    const element = document.createElement('div');
    element.className = className;
    element.textContent = text == null ? '' : String(text);
    parent.appendChild(element);
    return element;
  }

  // ── Mode grids ────────────────────────────────────────────
  function _buildMiniGamesGrid() {
    const grid = g('miniGamesGrid');
    if (!grid || !window.GW || !window.GW.MINIGAMES) return;
    grid.innerHTML = '';
    GW.MINIGAMES.forEach(mg => {
      const el = document.createElement(mg.unlocked ? 'button' : 'div');
      el.className = 'mode-card ' + (mg.unlocked ? 'mode-card--unlocked' : 'mode-card--locked');
      el.innerHTML = '<span class="mode-icon">' + mg.icon + '</span>' +
        '<span class="mode-name">' + mg.name + '</span>' +
        (mg.unlocked ? '' : '<span class="mode-lock">🔒</span>') +
        '<span class="mode-desc">' + mg.description + '</span>';
      if (mg.unlocked) {
        el.addEventListener('click', () => {
          if (mg.id === 'free_play') {
            hide('miniGamesOverlay');
            setTimeout(() => {
              sessionStorage.setItem('gw_menu_return', '1');
              window.location.href = 'game.html?level=1';
            }, 100);
          } else { show('comingSoonOverlay'); }
        });
      }
      grid.appendChild(el);
    });
  }

  function _buildPuzzleGrid() {
    const grid = g('puzzleGrid');
    if (!grid || !window.GW || !window.GW.PUZZLES) return;
    grid.innerHTML = '';
    GW.PUZZLES.forEach(pz => {
      const el = document.createElement('div');
      el.className = 'mode-card mode-card--locked';
      el.innerHTML = '<span class="mode-icon">' + pz.icon + '</span>' +
        '<span class="mode-name">' + pz.name + '</span>' +
        '<span class="mode-lock">🔒</span>' +
        '<span class="mode-desc">' + pz.description + '</span>';
      grid.appendChild(el);
    });
  }

  function _buildSurvivalGrid() {
    const grid = g('survivalGrid');
    if (!grid || !window.GW || !window.GW.SURVIVAL_MODES) return;
    grid.innerHTML = '';
    GW.SURVIVAL_MODES.forEach(sv => {
      const el = document.createElement(sv.unlocked ? 'button' : 'div');
      el.className = 'mode-card ' + (sv.unlocked ? 'mode-card--unlocked' : 'mode-card--locked');
      el.innerHTML = '<span class="mode-icon">' + sv.icon + '</span>' +
        '<span class="mode-name">' + sv.name + '</span>' +
        (sv.unlocked ? '' : '<span class="mode-lock">🔒</span>') +
        '<span class="mode-desc">' + sv.description + '</span>';
      if (sv.unlocked) el.addEventListener('click', () => show('comingSoonOverlay'));
      grid.appendChild(el);
    });
  }

  // ── Endless score ─────────────────────────────────────────
  function _updateEndlessScore() {
    const el = g('endlessScore'); if (!el) return;
    const prog = window.GW && window.GW.progression;
    if (prog) el.textContent = 'Best: Wave ' + prog.state.bestEndlessWave;
  }

  // ── Settings ──────────────────────────────────────────────
  function _loadSettings() {
    const prog = window.GW && window.GW.progression; if (!prog) return;
    const sfx  = g('sfxVol'), music = g('musicVol'),
          tips = g('showTips'), px = g('pixelArt');
    if (sfx)   sfx.value    = Math.round(prog.getSetting('sfxVolume')   * 100);
    if (music) music.value  = Math.round(prog.getSetting('musicVolume') * 100);
    if (window.GWAudio) window.GWAudio.setVolumes(music ? music.value / 100 : undefined, sfx ? sfx.value / 100 : undefined);
    if (tips)  tips.checked = prog.getSetting('showTips');
    if (px)    px.checked   = prog.getSetting('pixelArt') !== false;
    ['graphicsResolution', 'graphicsQuality', 'textureQuality', 'modelQuality'].forEach(id => {
      const control = g(id);
      const key = id === 'graphicsResolution' ? 'resolution' : id;
      if (control) control.value = prog.getSetting(key) || (window.GWGraphics && window.GWGraphics.defaults[key]);
    });
    document.querySelectorAll('#settingsOverlay input, #settingsOverlay select').forEach(control => {
      control.addEventListener('change', _saveSettings);
    });
    if (window.GWGraphics) window.GWGraphics.apply();
  }

  function _saveSettings() {
    const prog = window.GW && window.GW.progression; if (!prog) return;
    const settings = prog.state.settings;
    const sfx  = g('sfxVol'), music = g('musicVol'),
          tips = g('showTips'), px = g('pixelArt');
    if (sfx)   settings.sfxVolume = parseInt(sfx.value, 10) / 100;
    if (music) settings.musicVolume = parseInt(music.value, 10) / 100;
    if (window.GWAudio) window.GWAudio.setVolumes(music ? music.value / 100 : undefined, sfx ? sfx.value / 100 : undefined);
    if (tips)  settings.showTips = tips.checked;
    if (px)    settings.pixelArt = px.checked;
    ['graphicsResolution', 'graphicsQuality', 'textureQuality', 'modelQuality'].forEach(id => {
      const control = g(id);
      const key = id === 'graphicsResolution' ? 'resolution' : id;
      if (control) settings[key] = control.value;
    });
    prog.save();
    if (window.GWGraphics) window.GWGraphics.apply();
  }

  // ── Particles ─────────────────────────────────────────────
  function _startParticles() {
    const bg = document.getElementById('bgParticles'); if (!bg) return;
    function create(type) {
      const p = document.createElement('div');
      const x = Math.random() * 110 - 5, d = 7 + Math.random() * 11, s = 4 + Math.random() * 8;
      if (type === 'leaf') {
        p.className = 'leaf-particle';
        const h = 80 + Math.random() * 70;
        p.style.cssText = 'left:'+x+'vw;bottom:-20px;width:'+s+'px;height:'+(s*.6)+'px;background:hsl('+h+',72%,50%);animation-duration:'+d+'s;animation-delay:'+(Math.random()*-d)+'s;border-radius:50% 0 50% 0;';
      } else if (type === 'plasma') {
        p.className = 'plasma-particle';
        const h = 260 + Math.random() * 40;
        p.style.cssText = 'left:'+x+'vw;bottom:-10px;width:'+(s*.65)+'px;height:'+(s*.65)+'px;background:hsl('+h+',80%,65%);animation-duration:'+(d*.8)+'s;animation-delay:'+(Math.random()*-d)+'s;border-radius:50%;box-shadow:0 0 6px hsl('+h+',80%,70%);';
      } else {
        p.className = 'dust-particle';
        const h = 25 + Math.random() * 20;
        p.style.cssText = 'left:'+x+'vw;bottom:-10px;width:'+(s*.4)+'px;height:'+(s*.4)+'px;background:hsl('+h+',55%,42%);animation-duration:'+(d*1.2)+'s;animation-delay:'+(Math.random()*-d)+'s;border-radius:50%;opacity:0.5;';
      }
      bg.appendChild(p);
      setTimeout(() => p.remove(), (d + 2) * 1000);
    }
    for (let i = 0; i < 8; i++) create('leaf');
    for (let i = 0; i < 4; i++) create('plasma');
    for (let i = 0; i < 3; i++) create('dust');
    function loop() {
      const r = Math.random();
      create(r < 0.55 ? 'leaf' : r < 0.8 ? 'plasma' : 'dust');
      setTimeout(loop, 500 + Math.random() * 1100);
    }
    loop();
  }

})();
