/**
 * Chrono-Front: Galactic War — Battlefield Scene (Part 4 Rebuild)
 *
 * ROOT CAUSE FIXES:
 *  1. Briefing shown after recon; waves only start after player clicks DEPLOY
 *  2. Camera recon uses Phaser tweens (alpha fade, not scrollX which breaks FIT scale)
 *  3. Sunflowers REMOVED from sentinel positions
 *  4. Continuous sky animation: moving clouds, sun pulse, wind particles
 *  5. Proper military command base with depth and details
 *  6. Individual alien spawning at 10-15s intervals via controlled timer
 *  7. Random plasma orbs correctly spawn in board area (TOP_OFFSET:160)
 *  8. All board coords use new layout (TOP_OFFSET:160, boardBottom:520)
 *  9. Wave manager state machine correctly wired
 * 10. MENU button fully functional
 */

/* global GW, Phaser */

// ═══════════════════════════════════════════════════════════
//  BOOT SCENE
// ═══════════════════════════════════════════════════════════
GW.BootScene = class BootScene extends Phaser.Scene {
  constructor() { super({ key: GW.SCENES.BOOT }); }

  preload() {
    const fill   = document.getElementById('loadBarFill');
    const status = document.getElementById('loadStatus');
    const burstPath = GW.ASSETS && GW.ASSETS.EFFECTS && GW.ASSETS.EFFECTS.deathBurst;
    if (burstPath) this.load.svg('gw-death-burst', burstPath, { width: 40, height: 40 });
    this.load.on('progress', v => { if (fill) fill.style.width = Math.round(v * 100) + '%'; });
    this.load.on('complete', () => { if (fill) fill.style.width = '100%'; if (status) status.textContent = 'Ready!'; });
  }

  create() {
    // ── Bootstrap game systems SYNCHRONOUSLY first ─────────
    if (!GW.progression) GW.progression = new GW.ProgressionManager();
    if (!GW.cardManager) GW.cardManager  = new GW.CardManager(GW.progression);
    if (window.GWGraphics) {
      try {
        window.GWGraphics.apply();
      } catch (error) {
        console.error('[GW] Could not apply saved graphics settings; using browser defaults.', error);
      }
    }

    // Firebase init: fire-and-forget, do not block scene transition
    if (GW.firebaseClient) {
      GW.firebaseClient.init().catch(error => {
        console.warn('[GW] Optional cloud services did not initialize.', error);
      });
    }

    const params = new URLSearchParams(window.location.search);
    const requestedLevel = Number(params.get('level') || 1);
    const levelId = Number.isInteger(requestedLevel) && GW.LEVELS[requestedLevel]
      ? requestedLevel
      : 1;
    const mode = params.get('mode') || 'adventure';
    const scenarioId = params.get('scenario') || '';
    const modeGate = {
      survival: 'survival',
      endless: 'survival',
      minigame: 'minigames',
      puzzle: 'puzzle',
    }[mode];

    if (mode !== 'adventure' && !modeGate) {
      const status = document.getElementById('loadStatus');
      if (status) status.textContent = 'Unknown game mode. Returning to the command menu…';
      console.error('[GW] Unknown game mode requested:', mode);
      window.setTimeout(() => window.location.replace('index.html'), 900);
      return;
    }
    if (modeGate && !GW.progression.isModeUnlocked(modeGate)) {
      const status = document.getElementById('loadStatus');
      if (status) status.textContent = 'This mode is locked. Returning to the command menu…';
      window.setTimeout(() => window.location.replace('index.html'), 900);
      return;
    }

    const loadScreen = document.getElementById('load-screen');
    const fill = document.getElementById('loadBarFill');
    const status = document.getElementById('loadStatus');
    if (fill) fill.style.width = '100%';
    const progress = document.getElementById('loadProgress');
    if (progress) progress.setAttribute('aria-valuenow', '100');
    if (status) status.textContent = 'Battle systems ready — deploying…';
    if (loadScreen) {
      loadScreen.classList.add('fade-out');
      window.setTimeout(() => loadScreen.classList.add('gone'), 650);
    }

    // Do not gate scene startup on an in-game timer; a paused/stalled boot
    // clock must never leave the DOM loading overlay covering the battlefield.
    this.scene.start(GW.SCENES.GAME, { levelId, mode, scenarioId });
  }
};

// ═══════════════════════════════════════════════════════════
//  GAME SCENE — Main battlefield
// ═══════════════════════════════════════════════════════════
GW.GameScene = class GameScene extends Phaser.Scene {
  constructor() { super({ key: GW.SCENES.GAME }); }

  init(data) {
    this.levelId         = (data && data.levelId) ? data.levelId : 1;
    this.gameMode        = (data && data.mode) || 'adventure';
    this.scenarioId      = (data && data.scenarioId) || '';
    this._endlessRound   = 0;
    this._endlessCompletedWaves = 0;
    if (window.GW && GW.progression && GW.progression.isGuest && this.levelId > 10) this.levelId = 10;
    this._gameOver       = false;
    this._gameWon        = false;
    this._selectedCharId = null;
    this._shovelMode     = false;
    this._paused         = false;
    this._reconDone      = false;
    this._gameRuntimeMs  = 0;
    this._runtimeStarted = false;
    this._missionDurationMs = 0;
    this._pendingVictory = false;
    this._timelineProgress = 0;
    this._timelineWaves = [];
    this._timelineFlagPositions = [];
  }

  create() {
    try {
    const W = GW.DISPLAY.BASE_WIDTH;   // 960
    const H = GW.DISPLAY.BASE_HEIGHT;  // 600

    const campaignLevel = GW.LEVELS[this.levelId] || GW.LEVELS[1];
    const modeData = this._resolveModeData(campaignLevel);
    const levelData = modeData.level;
    this._modeName = modeData.name;
    const envId     = levelData.environment || 'daytime';
    this._missionDurationMs = levelData.durationMs ||
      (GW.DIFFICULTY_PACING[levelData.difficulty] && GW.DIFFICULTY_PACING[levelData.difficulty].durationMs) ||
      4 * 60 * 1000;
    if (window.GWAudio) window.GWAudio.setScene('battle', envId);
    const env       = GW.ENVIRONMENTS[envId] || GW.ENVIRONMENTS.daytime;

    // ── Loadout: only claimed cards, max 6 ─────────────────
    const prog      = window.GW && window.GW.progression;
    // Build the card pool for this level:
    //   Start with the level's minimum whitelist (always included).
    //   Then add ALL cards the player has claimed — so newly unlocked cards
    //   appear in the tray immediately without needing the level config updated.
    const levelWhitelist = levelData.availableDefenders || GW.LOADOUT.DEFAULT_CARDS;
    const claimedByPlayer = prog && prog.getClaimedCardIds ? prog.getClaimedCardIds() : [];
    // Union: whitelist + any extra claimed cards, preserving order (whitelist first)
    const poolSet = new Set([...levelWhitelist, ...claimedByPlayer]);
    const loadout = Array.from(poolSet)
      .filter(id => GW.CARDS && GW.CARDS[id])            // only valid card ids
      .filter(id => prog ? (prog.isCardClaimed ? prog.isCardClaimed(id) : true) : true)
      .slice(0, GW.LOADOUT.MAX_CARDS);                   // cap at 6

    // ── Core subsystems ────────────────────────────────────
    this.playerState       = new GW.PlayerState();
    this.playerState.levelId = this.levelId;
    this.resourceManager   = new GW.ResourceManager(this);
    this.resourceManager.energy = GW.RESOURCES.STARTING_ENERGY;
    this.projectileManager = new GW.ProjectileManager(this);
    this.combatManager     = new GW.CombatManager(this, this.projectileManager, this.resourceManager, this.playerState);
    this.levelManager      = new GW.LevelManager();
    this.uiManager         = new GW.UIManager(this, this.resourceManager);
    this.uiManager.setLoadout(loadout);
    this.waveManager       = new GW.WaveManager(this, this.combatManager, levelData.waves);
    this.sentinelMgr       = new GW.SentinelManager(this);
    this.currencyManager   = new GW.CurrencyManager(this);

    // ── World layers (draw order matters) ──────────────────
    this._drawSky(W, H, env);
    this._drawMidground(W, H, env);
    this._drawBoard(W, H, env);
    this._drawMilitaryBase(H, env);
    this._drawEnvironmentDecor(W, H, env);

    // ── Sentinels (BEFORE clouds animation layer) ──────────
    this.sentinelMgr.build(levelData);

    // ── HUD ────────────────────────────────────────────────
    // Timeline markers track the campaign difficulty bands, with the final
    // marker reserved for the red final-wave marker.
    const majorWaves = (levelData.waves || []).filter(wave => wave.isMajorWave || wave.isFinalWave);
    const markerPositions = majorWaves.map((wave, index) => {
      const targetMs = Number.isFinite(wave.startAfterMs)
        ? wave.startAfterMs
        : this._missionDurationMs * (index + 1) / majorWaves.length;
      return Math.max(0, Math.min(1, targetMs / this._missionDurationMs));
    });
    this._timelineWaves = majorWaves;
    this._timelineFlagPositions = markerPositions;
    const _flagCount = markerPositions.length || GW.GameScene._getFlagCount(envId, this.levelId);
    this.uiManager.buildHUD(_flagCount, this.levelId, markerPositions);
    this.currencyManager.buildHUD();

    // ── Pause callbacks ────────────────────────────────────
    this.uiManager.onPauseRestart = () => this._restart();
    this.uiManager.onPauseToMap   = () => this._goToMenu();
    this.uiManager.onPauseQuit    = () => this._goToMenu();

    // ── Wire game callbacks ────────────────────────────────
    this._wireCallbacks();
    this._setupInput(W, H);
    const restoredBattle = this._restoreBattleSnapshot();

    // ── Start resource regen immediately; waves wait for Deploy ──
    // Wave manager is NOT started here — it starts only after the player
    // clicks the DEPLOY button in the briefing overlay. This ensures the
    // 20-second preparation countdown doesn't begin until the player is ready.
    this.resourceManager.startOrbSpawning();
    this._wavesStarted = !!(restoredBattle && this.waveManager.started);
    if (!restoredBattle) this._runtimeStarted = this._wavesStarted;
    this.uiManager.updateRuntime(this._gameRuntimeMs);
    if (this.uiManager.energyText) this.uiManager.energyText.setText(String(this.resourceManager.energy));

    // ── Animated environment (continuous) ──────────────────
    this._startEnvironmentAnimation(W, H, env);

    // Smooth fade-in from black to reveal the battlefield
    this.cameras.main.fadeIn(800, 0, 0, 0);

    // ── Intro recon + briefing overlay ──────────────────────
    // _playRecon() plays the cinematic intro (daytime L1-5 only), then
    // shows the mission briefing. Waves don't start until Deploy is clicked.
    if (restoredBattle && this._wavesStarted) this.uiManager._openPauseMenu();
    else this._playRecon(W, H, envId, this.levelId);
    } catch (err) {
      console.error('[GW] GameScene.create() FAILED:', err);
      // Emergency fallback: draw a minimal battlefield so the player isn't stuck
      this._emergencyFallback(err);
    }
  }

  _resolveModeData(campaignLevel) {
    if (this.gameMode === 'adventure') {
      return { level: campaignLevel, name: campaignLevel.name };
    }

    const modeGate = {
      survival: 'survival',
      endless: 'survival',
      minigame: 'minigames',
      puzzle: 'puzzle',
    }[this.gameMode];
    if (!modeGate || !GW.progression || !GW.progression.isModeUnlocked(modeGate)) {
      throw new Error('This game mode is unavailable for the current account.');
    }

    let name;
    let environment = 'daytime';
    let waves;
    if (this.gameMode === 'endless') {
      name = GW.ENDLESS.name;
      waves = GW.ENDLESS_BASE_WAVES;
    } else if (this.gameMode === 'survival') {
      const scenario = GW.SURVIVAL_MODES.find(mode => mode.id === this.scenarioId);
      if (!scenario || !GW.SURVIVAL_WAVE_SETS[scenario.id]) {
        throw new Error('The selected survival scenario is unavailable.');
      }
      name = scenario.name + ' Survival';
      environment = scenario.env;
      waves = GW.SURVIVAL_WAVE_SETS[scenario.id];
    } else if (this.gameMode === 'minigame') {
      const scenario = GW.MINIGAMES.find(mode => mode.id === this.scenarioId);
      if (!scenario || !GW.MINIGAME_WAVE_SETS[scenario.id]) {
        throw new Error('The selected mini-game is unavailable.');
      }
      name = scenario.name;
      waves = GW.MINIGAME_WAVE_SETS[scenario.id];
    } else {
      const scenario = GW.PUZZLES.find(puzzle => puzzle.id === this.scenarioId);
      if (!scenario || !GW.PUZZLE_WAVE_SETS[scenario.id]) {
        throw new Error('The selected puzzle is unavailable.');
      }
      name = scenario.name;
      waves = GW.PUZZLE_WAVE_SETS[scenario.id];
    }

    if (!GW.ENVIRONMENTS[environment]) environment = 'daytime';
    return {
      name,
      level: Object.assign({}, campaignLevel, {
        name,
        environment,
        waves,
        durationMs: 5 * 60 * 1000,
        availableDefenders: GW.LOADOUT.DEFAULT_CARDS,
      }),
    };
  }

  // ══════════════════════════════════════════════════════════
  //  CAMERA RECON — Cinematic sweep overlay (non-blocking, ~3s total)
  //  Phase 1 (0–600ms):   Reveal right side (alien zone), alien labels
  //  Phase 2 (600–2200ms): Scan line sweeps right→left, alien labels fade
  //  Phase 3 (2000–2600ms): Base revealed, base labels appear then fade
  //  Phase 4 (2900–3200ms): Scan line fades, all overlays destroyed
  //  Gameplay runs underneath the entire time.
  // ══════════════════════════════════════════════════════════
  /**
   * Intro recon sequence — requirements 1-6.
   * Only plays for Daytime levels 1-5. Always fires the prepare banner.
   * With intro: banner fires after ~3.2s. Without intro: fires after 200ms.
   */
  _playRecon(W, H, envId, levelId) {
    if (this.gameMode !== 'adventure') {
      this._onDeployClicked();
      return;
    }
    // Req 1+4: intro only for daytime levels 1 through 5
    const showIntro = (envId === 'daytime') && (levelId >= 1) && (levelId <= 5);

    if (!showIntro) {
      // No intro: show briefing immediately so the player can click Deploy
      if (GW.briefingSystem) {
        GW.briefingSystem.show(this.levelId)
          .then(() => this._onDeployClicked())
          .catch(() => this._onDeployClicked());
      } else {
        this._onDeployClicked();
      }
      return;
    }

    const DEPTH_OVERLAY = 200;
    const DEPTH_TEXT    = 201;

    // ── Full black start ──────────────────────────────────────
    const blackRect = this.add.rectangle(W/2, H/2, W, H, 0x000000, 1).setDepth(DEPTH_OVERLAY);

    // ── PHASE LABELS ─────────────────────────────────────────
    // Phase 1: Alien zone label (right side)
    const alienLabel = this.add.text(W * 0.72, H/2 - 10, '[ ALIEN INVASION ZONE ]', {
      fontFamily: '"Exo 2", monospace', fontSize: '16px', fontStyle: 'bold',
      color: '#e879f9', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_TEXT).setAlpha(0);

    const alienSub = this.add.text(W * 0.72, H/2 + 14, 'Scanning enemy approach vector\u2026', {
      fontFamily: '"Exo 2", monospace', fontSize: '10px', color: '#a78bfa',
    }).setOrigin(0.5).setDepth(DEPTH_TEXT).setAlpha(0);

    // Phase 3: Base label (left side)
    const baseLabel = this.add.text(W * 0.08, H/2 - 10, '[ YOUR BASE ]', {
      fontFamily: '"Exo 2", monospace', fontSize: '16px', fontStyle: 'bold',
      color: '#4ade80', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(DEPTH_TEXT).setAlpha(0);

    const baseSub = this.add.text(W * 0.08, H/2 + 14, 'Defend the perimeter.', {
      fontFamily: '"Exo 2", monospace', fontSize: '10px', color: '#86efac',
    }).setOrigin(0.5).setDepth(DEPTH_TEXT).setAlpha(0);

    // ── Scan cover panel (unused width, kept for cleanup) ─────
    const scanPanel = this.add.rectangle(0, H/2, 0, H, 0x000000, 0.85)
      .setOrigin(0, 0.5).setDepth(DEPTH_OVERLAY - 1);

    // ── Scan line: bright vertical bar sweeping right→left ────
    const scanLine = this.add.rectangle(W, H/2, 3, H, 0x7c3aed, 0.9)
      .setDepth(DEPTH_OVERLAY + 1);

    // ── TIMELINE ─────────────────────────────────────────────
    // t=0–400:   black rect fades from 1→0.6 (reveal right side dimly)
    this.tweens.add({
      targets: blackRect, alpha: 0.6,
      duration: 400, ease: 'Power2',
    });

    // t=200–500: alien labels fade in
    this.time.delayedCall(200, () => {
      this.tweens.add({ targets: [alienLabel, alienSub], alpha: 1, duration: 300, ease: 'Power1' });
    });

    // t=0–1800:  scan line sweeps from right (W) to left (-10)
    this.tweens.add({
      targets: scanLine, x: -10,
      duration: 1800, ease: 'Sine.easeInOut',
    });

    // t=600–1800: black rect fades further as scan progresses
    this.time.delayedCall(600, () => {
      this.tweens.add({ targets: blackRect, alpha: 0.25, duration: 1200, ease: 'Power1' });
    });

    // t=1400–1700: alien text fades out during pan
    this.time.delayedCall(1400, () => {
      this.tweens.add({ targets: [alienLabel, alienSub], alpha: 0, duration: 300, ease: 'Power1' });
    });

    // t=2000:    black rect fully clears, base labels appear
    this.time.delayedCall(2000, () => {
      this.tweens.add({ targets: blackRect, alpha: 0, duration: 400, ease: 'Power2' });
      this.tweens.add({ targets: [baseLabel, baseSub], alpha: 1, duration: 300, ease: 'Power1' });
    });

    // t=2600–2950: base labels fade out
    this.time.delayedCall(2600, () => {
      this.tweens.add({ targets: [baseLabel, baseSub], alpha: 0, duration: 350, ease: 'Power1' });
    });

    // t=2900–3200: scan line fades, cleanup, mark recon done
    this.time.delayedCall(2900, () => {
      this.tweens.add({
        targets: scanLine, alpha: 0, duration: 300, ease: 'Power2',
        onComplete: () => {
          [blackRect, alienLabel, alienSub, baseLabel, baseSub, scanPanel, scanLine].forEach(obj => {
            if (obj && obj.scene) obj.destroy();
          });
          this._reconDone = true;
          // After recon completes, show the briefing overlay.
          // The wave manager + prep banner fire only when the player clicks DEPLOY.
          if (GW.briefingSystem) {
            GW.briefingSystem.show(this.levelId)
              .then(() => this._onDeployClicked())
              .catch(() => this._onDeployClicked());
          } else {
            this._onDeployClicked();
          }
        },
      });
    });

    // Safety fallback: if tweens/timers fail for any reason, force-clear the overlay
    // after 6 seconds so the player is never permanently blocked.
    this.time.delayedCall(6000, () => {
      if (!this._reconDone) {
        console.warn('[GW] Recon fallback triggered — forcing overlay clear');
        [blackRect, alienLabel, alienSub, baseLabel, baseSub, scanPanel, scanLine].forEach(obj => {
          try { if (obj && obj.scene) obj.destroy(); } catch (_) {}
        });
        this._reconDone = true;
        if (GW.briefingSystem) {
          GW.briefingSystem.show(this.levelId)
            .then(() => this._onDeployClicked())
            .catch(() => this._onDeployClicked());
        } else {
          this._onDeployClicked();
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  //  DEPLOY — Called when the player clicks the DEPLOY button
  //  in the mission briefing overlay. This is the moment the
  //  20-second preparation countdown actually begins.
  // ══════════════════════════════════════════════════════════
  _onDeployClicked() {
    if (this._wavesStarted) return; // guard against double-fire
    this._wavesStarted = true;
    this._runtimeStarted = true;

    // Show the "20 sec to prepare" banner immediately on Deploy
    if (this.uiManager && this.uiManager.showBanner) {
      this.uiManager.showBanner(
        '20 SEC TO PREPARE \u2014 PLACE YOUR FORCES!',
        GW.UI_COLORS ? GW.UI_COLORS.GREEN_BRIGHT : '#22d3ee',
        2800
      );
    }

    // Let the banner fade completely, then start the full 20-second prep clock.
    this.time.delayedCall(3000, () => {
      if (this._gameOver || this._gameWon) return;
      if (this.gameMode === 'endless') this._prepareEndlessRound();
      else this.waveManager.start();
    });
  }

  // ══════════════════════════════════════════════════════════
  //  SKY BACKGROUND — Fills 0 to TOP_OFFSET (160px)
  // ══════════════════════════════════════════════════════════
  _drawSky(W, H, env) {
    const bg  = this.add.graphics().setDepth(0);
    const TOP = GW.BOARD.TOP_OFFSET; // 160
    const BOT = TOP + GW.BOARD.LANES * GW.BOARD.LANE_HEIGHT; // 520

    if (env.id === 'daytime') {
      // Sky gradient
      bg.fillGradientStyle(0x3ea8e5, 0x3ea8e5, 0x7dd3fc, 0x7dd3fc, 1);
      bg.fillRect(0, 0, W, TOP);

      // Distant hills (layered depth)
      const hills = this.add.graphics().setDepth(1);
      hills.fillStyle(0x4e9e3a, 0.35);
      hills.fillEllipse(200, TOP + 2, 320, 80);
      hills.fillEllipse(550, TOP + 5, 280, 65);
      hills.fillEllipse(850, TOP + 3, 240, 70);
      hills.fillStyle(0x5aaf42, 0.28);
      hills.fillEllipse(100, TOP + 8, 200, 55);
      hills.fillEllipse(400, TOP + 4, 350, 72);
      hills.fillEllipse(750, TOP + 6, 300, 60);

      // Far trees silhouette
      const farTrees = this.add.graphics().setDepth(2);
      farTrees.fillStyle(0x2d6b1a, 0.6);
      for (let tx = 0; tx < W + 20; tx += 28) {
        const h = 22 + Math.abs(Math.sin(tx * 0.08)) * 14;
        farTrees.fillTriangle(tx + 2, TOP - 2, tx + 14, TOP - 2 - h, tx + 26, TOP - 2);
        farTrees.fillRect(tx + 10, TOP - 2, 8, h * 0.38);
      }

      // Sun — drawn here, animated separately
      this._sun = this.add.graphics().setDepth(3);
      this._drawSun(this._sun);

    } else if (env.id === 'nighttime') {
      bg.fillGradientStyle(0x020810, 0x020810, 0x060f1e, 0x060f1e, 1);
      bg.fillRect(0, 0, W, TOP);
      // Stars — many more due to 160px sky
      const stars = this.add.graphics().setDepth(1);
      stars.fillStyle(0xffffff, 0.75);
      const starPositions = [
        [22,8,1.1],[68,18,0.8],[115,7,1.0],[170,22,0.9],[225,10,1.2],[285,5,0.8],
        [340,20,1.0],[395,12,0.9],[450,6,1.1],[505,24,0.8],[560,11,1.0],[615,18,0.9],
        [670,6,1.2],[725,22,0.8],[780,9,1.0],[835,16,0.9],[890,5,1.1],[945,20,0.8],
        [40,40,0.9],[95,50,1.0],[150,38,0.8],[210,55,0.9],[265,44,1.1],[320,36,0.8],
        [375,52,1.0],[430,42,0.9],[485,58,0.8],[540,48,1.0],[595,35,0.9],[650,54,1.1],
        [705,46,0.8],[760,38,1.0],[815,52,0.9],[870,40,1.2],[925,34,0.8],[50,70,0.9],
        [130,75,1.0],[200,65,0.8],[310,80,0.9],[410,68,1.1],[510,76,0.8],[630,72,1.0],
      ];
      starPositions.forEach(([x, y, r]) => stars.fillCircle(x, y, r));
      // Moon
      const moon = this.add.graphics().setDepth(2);
      moon.fillStyle(0xfef9c3, 0.95); moon.fillCircle(W - 80, 38, 24);
      moon.fillStyle(0x020810, 1); moon.fillCircle(W - 67, 32, 18);
    } else if (env.id === 'foggy') {
      bg.fillGradientStyle(0x4b8190, 0x4b8190, 0x9bcbd0, 0x9bcbd0, 1);
      bg.fillRect(0, 0, W, TOP);
      const flood = this.add.graphics().setDepth(2);
      flood.fillStyle(0x164e63, 0.35); flood.fillRect(0, TOP - 14, W, 18);
      flood.lineStyle(2, 0xa5f3fc, 0.42);
      for (let ripple = 0; ripple < 10; ripple++) {
        const y = TOP - 10 + ripple * 12;
        flood.beginPath(); flood.moveTo(0, y); flood.lineTo(W, y + (ripple % 2 ? 2 : -2)); flood.strokePath();
      }
    } else if (env.id === 'rainy_stormy') {
      bg.fillGradientStyle(0x0b1824, 0x0b1824, 0x162338, 0x162338, 1);
      bg.fillRect(0, 0, W, TOP);
      const storm = this.add.graphics().setDepth(2);
      storm.fillStyle(0x24364a, 0.7);
      [[90,22,180,55],[300,14,220,62],[520,26,200,58],[740,18,170,52]].forEach(
        ([cx,cy,rw,rh]) => storm.fillEllipse(cx,cy,rw,rh)
      );
    } else if (env.id === 'radioactive') {
      bg.fillGradientStyle(0x080e02, 0x080e02, 0x112206, 0x112206, 1);
      bg.fillRect(0, 0, W, TOP);
      const glow = this.add.graphics().setDepth(2);
      glow.fillStyle(0x44bb00, 0.06); glow.fillRect(0, 0, W, TOP);
      glow.fillStyle(0x88dd11, 0.12); glow.fillRect(0, TOP - 45, W, 48);
    }

    // Ground strip: 520-600 (thin, not massive)
    const BOT2 = TOP + GW.BOARD.LANES * GW.BOARD.LANE_HEIGHT;
    bg.fillStyle(env.soilColor || 0x5a3010, 1);
    bg.fillRect(0, BOT2, W, H - BOT2);
    // Grass transition
    bg.fillStyle(env.grassColor || 0x2d8a18, 1);
    bg.fillRect(0, BOT2 - 9, W, 14);
  }

  _drawSun(g) {
    g.clear();
    const sx = 820, sy = 42;
    g.fillStyle(0xfde68a, 0.15); g.fillCircle(sx, sy, 38);
    g.fillStyle(0xfef08a, 0.3);  g.fillCircle(sx, sy, 28);
    g.fillStyle(0xfef08a, 1);    g.fillCircle(sx, sy, 22);
    g.fillStyle(0xfbbf24, 0.4);  g.fillCircle(sx, sy, 16);
  }

  _startEnvironmentAnimation(W, H, env) {
    this._environmentId = env.id;
    if (env.id !== 'daytime') {
      this._ambientParticles = [];
      this._ambientElapsed = 0;
      this._ambientDelay = env.id === 'rainy_stormy' ? 45 : env.id === 'foggy' ? 260 : 420;
      this._lightningTimer = 4500 + Math.random() * 4500;
      return;
    }

    const TOP = GW.BOARD.TOP_OFFSET;

    // ── Moving cloud layer ──────────────────────────────────
    this._cloudGraphics = this.add.graphics().setDepth(4);
    this._cloudOffset   = 0;
    this._cloudSpeed    = 14; // px/s slow drift

    // Cloud definitions: [x, y, w, h, speed_mult]
    this._clouds = [
      { x: 70,  y: 22, w: 80, h: 28, sm: 1.0 },
      { x: 220, y: 14, w: 100, h: 32, sm: 0.7 },
      { x: 420, y: 32, w: 85, h: 26, sm: 1.3 },
      { x: 610, y: 18, w: 95, h: 30, sm: 0.85 },
      { x: 780, y: 28, w: 70, h: 24, sm: 1.2 },
      { x: 900, y: 12, w: 60, h: 20, sm: 0.65 },
      // Second layer (wrap-around clouds start offscreen right)
      { x: 1050, y: 25, w: 90, h: 28, sm: 1.0 },
      { x: 1200, y: 15, w: 75, h: 24, sm: 0.8 },
    ];

    // ── Sun pulse tween ─────────────────────────────────────
    if (this._sun) {
      this.tweens.add({
        targets: this._sun,
        alpha: 0.82,
        duration: 3200,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }

    // ── Wind/grass particles ────────────────────────────────
    this._windTimer = 0;
    this._nextWind  = 6000 + Math.random() * 4000;
  }

  _updateEnvironmentAnimation(delta) {
    if (!this._cloudGraphics) {
      this._updateEnvironmentSprites(delta);
      return;
    }

    const W   = GW.DISPLAY.BASE_WIDTH;
    const TOP = GW.BOARD.TOP_OFFSET;

    // Move clouds
    this._clouds.forEach(c => {
      c.x -= (this._cloudSpeed * c.sm * delta) / 1000;
      if (c.x + c.w < -20) {
        c.x = W + 20 + Math.random() * 80;
        c.y = 8 + Math.random() * 38;
      }
    });

    // Redraw clouds
    this._cloudGraphics.clear();
    this._cloudGraphics.fillStyle(0xffffff, 0.82);
    this._clouds.forEach(c => {
      this._cloudGraphics.fillEllipse(c.x, c.y, c.w, c.h);
      this._cloudGraphics.fillEllipse(c.x + c.w * 0.18, c.y - c.h * 0.3, c.w * 0.6, c.h * 0.65);
      this._cloudGraphics.fillEllipse(c.x - c.w * 0.12, c.y + c.h * 0.15, c.w * 0.5, c.h * 0.55);
    });

    // Wind particles
    this._windTimer += delta;
    if (this._windTimer >= this._nextWind) {
      this._windTimer = 0;
      this._nextWind  = 6000 + Math.random() * 4000;
      this._spawnWindEffect();
    }
  }

  _updateEnvironmentSprites(delta) {
    if (!this._ambientParticles || !this._environmentId) return;
    const W = GW.DISPLAY.BASE_WIDTH;
    const H = GW.BOARD.TOP_OFFSET + GW.BOARD.LANES * GW.BOARD.LANE_HEIGHT;
    const kind = this._environmentId;
    const limit = kind === 'foggy' ? 18 : kind === 'rainy_stormy' ? 36 : 14;
    this._ambientElapsed += delta;

    if (kind === 'rainy_stormy') {
      this._lightningTimer -= delta;
      if (this._lightningTimer <= 0) {
        this.cameras.main.flash(120, 185, 215, 238);
        this._lightningTimer = 6000 + Math.random() * 7000;
      }
    }

    if (this._ambientElapsed >= this._ambientDelay && this._ambientParticles.length < limit) {
      this._ambientElapsed = 0;
      const g = this.add.graphics().setDepth(7);
      const particle = { g, age: 0, x: Math.random() * W, y: Math.random() * H };

      if (kind === 'nighttime') {
        g.fillStyle(0xa3e635, 0.16); g.fillCircle(0, 0, 8);
        g.fillStyle(0xd9f99d, 0.95); g.fillRect(-1, -1, 3, 3);
        particle.vx = 8 + Math.random() * 12; particle.vy = -4;
      } else if (kind === 'foggy') {
        g.lineStyle(1, 0x9ce4e3, 0.24);
        g.strokeEllipse(0, 0, 28 + Math.random() * 18, 5 + Math.random() * 3);
        g.lineStyle(1, 0xd7ffff, 0.15);
        g.strokeEllipse(0, 0, 46 + Math.random() * 20, 8);
        particle.x = Math.random() * W;
        particle.y = GW.BOARD.TOP_OFFSET + Math.random() * GW.BOARD.LANES * GW.BOARD.LANE_HEIGHT;
        particle.vx = -9 - Math.random() * 16; particle.vy = 0;
      } else if (kind === 'rainy_stormy') {
        g.lineStyle(1, 0xb9d9e8, 0.36);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(-4, 14); g.strokePath();
        particle.y = -12; particle.vx = -32; particle.vy = 210 + Math.random() * 120;
      } else {
        g.fillStyle(0x86efac, 0.18); g.fillCircle(0, 0, 7);
        g.fillStyle(0xd9f99d, 0.88); g.fillCircle(0, 0, 2.5);
        g.lineStyle(1, 0x4ade80, 0.55); g.strokeCircle(0, 0, 4);
        particle.vx = -5 + Math.random() * 10; particle.vy = -8 - Math.random() * 8;
      }
      g.setPosition(particle.x, particle.y);
      particle.baseY = particle.y;
      particle.wobble = 5 + Math.random() * 12;
      this._ambientParticles.push(particle);
    }

    this._ambientParticles = this._ambientParticles.filter(particle => {
      particle.age += delta;
      particle.x += particle.vx * delta / 1000;
      particle.y += particle.vy * delta / 1000;
      if (kind !== 'rainy_stormy' && kind !== 'foggy') particle.y = particle.baseY + Math.sin(particle.age / 650) * particle.wobble;
      particle.g.setPosition(particle.x, particle.y);
      if (kind === 'nighttime' || kind === 'radioactive') particle.g.setAlpha(0.55 + (Math.sin(particle.age / 180) + 1) * 0.22);
      if (kind === 'foggy') {
        const pulse = 0.65 + Math.sin(particle.age / 260) * 0.25;
        particle.g.setAlpha(pulse);
        particle.g.setScale(pulse, 1);
      }
      const expired = particle.y > H + 24 || particle.x < -240 || particle.x > W + 240 || particle.age > 26000;
      if (expired) particle.g.destroy();
      return !expired;
    });
  }

  _spawnWindEffect() {
    const b   = GW.BOARD;
    const W   = GW.DISPLAY.BASE_WIDTH;
    // Spawn a few leaf/particle objects drifting right-to-left
    for (let i = 0; i < 4; i++) {
      const x = W - 10 + Math.random() * 60;
      const y = b.TOP_OFFSET + Math.random() * (b.LANES * b.LANE_HEIGHT);
      const p = this.add.graphics().setDepth(14);
      p.fillStyle(0x4ade80, 0.6 + Math.random() * 0.3);
      p.fillCircle(0, 0, 2 + Math.random() * 2);
      p.x = x; p.y = y;
      this.tweens.add({
        targets: p,
        x: x - 80 - Math.random() * 60,
        y: y + (Math.random() - 0.5) * 30,
        alpha: 0,
        duration: 2000 + Math.random() * 1500,
        ease: 'Power1',
        delay: i * 200,
        onComplete: () => p.destroy(),
      });
    }
  }

  // ══════════════════════════════════════════════════════════
  //  MIDGROUND — Horizon detail
  // ══════════════════════════════════════════════════════════
  _drawMidground(W, H, env) {
    const mg  = this.add.graphics().setDepth(5);
    const TOP = GW.BOARD.TOP_OFFSET;

    if (env.id === 'daytime') {
      // Garden hedge line
      mg.fillStyle(0x2d8a18, 0.65);
      mg.fillRect(0, TOP - 26, W, 28);
      // Top edge brighter grass
      mg.fillStyle(0x3daa22, 0.5);
      mg.fillRect(0, TOP - 32, W, 10);
      // Fence planks
      mg.fillStyle(0x8b4a18, 0.7);
      mg.fillRect(0, TOP - 9, W, 9);
      for (let fx = 8; fx < W; fx += 44) {
        mg.fillStyle(0x7c3a10, 0.8);
        mg.fillRect(fx, TOP - 22, 5, 24);
        mg.fillStyle(0x5c2a08, 0.6);
        mg.fillRect(fx - 2, TOP - 14, 10, 4);
      }
    } else {
      mg.fillStyle(env.grassColor || 0x2d6b1a, 0.4);
      mg.fillRect(0, TOP - 16, W, 18);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  BOARD — 5 lanes
  // ══════════════════════════════════════════════════════════
  _drawBoard(W, H, env) {
    const b    = GW.BOARD;
    const g    = this.add.graphics().setDepth(6);
    const even = env.laneEven || 0x2d6b1a;
    const odd  = env.laneOdd  || 0x26621a;

    for (let lane = 0; lane < b.LANES; lane++) {
      const ly = b.TOP_OFFSET + lane * b.LANE_HEIGHT;

      g.fillStyle(lane % 2 === 0 ? even : odd, 1);
      g.fillRect(0, ly, W, b.LANE_HEIGHT);

      // Soil strip
      g.fillStyle(env.soilColor || 0x5a3010, 0.5);
      g.fillRect(0, ly + b.LANE_HEIGHT - 8, W, 8);

      // Grass tufts
      g.fillStyle(env.grassColor || 0x2d8a18, 0.42);
      for (let gx = 10; gx < W; gx += 38) {
        g.fillRect(gx,      ly + 3, 2, 6);
        g.fillRect(gx + 5,  ly + 2, 2, 8);
        g.fillRect(gx + 10, ly + 4, 2, 5);
        g.fillRect(gx + 18, ly + 2, 2, 7);
      }

      // Lane divider
      g.lineStyle(1, 0x1a4a08, 0.28);
      g.lineBetween(0, ly, W, ly);

      // Lane number (subtle)
      this.add.text(7, ly + b.LANE_HEIGHT / 2, String(lane + 1), {
        fontFamily: '"Exo 2", monospace', fontSize: '10px', color: '#1a3a0a', alpha: 0.4,
      }).setOrigin(0, 0.5).setDepth(7);
    }

    // Bottom board border
    g.lineStyle(1, 0x1a4a08, 0.3);
    g.lineBetween(0, b.TOP_OFFSET + b.LANES * b.LANE_HEIGHT, W, b.TOP_OFFSET + b.LANES * b.LANE_HEIGHT);

    // Defender zone right fence
    const fenceX = b.PLACEMENT_START_X + b.CELLS_PER_LANE * b.CELL_WIDTH + 8;
    const fTop = b.TOP_OFFSET, fBot = b.TOP_OFFSET + b.LANES * b.LANE_HEIGHT;
    g.fillStyle(0x8b4a18, 0.8); g.fillRect(fenceX - 3, fTop, 6, fBot - fTop);
    for (let i = 0; i <= b.LANES; i++) {
      const py = fTop + i * b.LANE_HEIGHT;
      g.fillStyle(0x6b3410, 0.9); g.fillRect(fenceX - 5, py - 7, 10, 14);
    }

    // Zone labels
    this.add.text(b.PLACEMENT_START_X + (b.CELLS_PER_LANE * b.CELL_WIDTH) / 2, b.TOP_OFFSET - 8,
      'DEFENDERS', { fontFamily: '"Exo 2",monospace', fontSize: '8px', color: '#2d6b1a' }
    ).setOrigin(0.5, 1).setDepth(7);
    this.add.text(fenceX + (W - fenceX) / 2, b.TOP_OFFSET - 8,
      '⚠ ALIEN APPROACH ZONE', { fontFamily: '"Exo 2",monospace', fontSize: '8px', color: '#6b2fa0' }
    ).setOrigin(0.5, 1).setDepth(7);
  }

  // ══════════════════════════════════════════════════════════
  //  MILITARY COMMAND BASE — full depth pixel-art building
  //  Position: left of HOME_X (x=68), spans full lane height
  // ══════════════════════════════════════════════════════════
  _drawMilitaryBase(H, env) {
    const b   = GW.BOARD;
    const g   = this.add.graphics().setDepth(8);
    const wx  = b.HOME_X;
    const top = b.TOP_OFFSET;
    const bot = top + b.LANES * b.LANE_HEIGHT;
    const bw  = 56;   // building width
    const bx  = wx - bw - 2; // building left edge

    // ── LAYER 1: Deep background shadow ──
    g.fillStyle(0x111111, 0.35);
    g.fillRect(bx + 4, top + 4, bw, bot - top);

    // ── LAYER 2: Main wall structure ──
    g.fillStyle(0x3a4a5a, 0.95);
    g.fillRect(bx, top, bw, bot - top);

    // Concrete texture lines
    g.fillStyle(0x2e3e4e, 0.55);
    for (let ry = top + 20; ry < bot; ry += 26) {
      g.fillRect(bx, ry, bw, 3);
    }

    // ── LAYER 3: Wall panels (highlight edges) ──
    g.fillStyle(0x4a5e72, 0.6);
    g.fillRect(bx, top, 4, bot - top);      // left edge
    g.fillStyle(0x2a3848, 0.7);
    g.fillRect(bx + bw - 4, top, 4, bot - top); // right edge
    g.fillRect(bx + bw - 4, top, 4, 4);    // corner

    // ── LAYER 4: Per-lane windows ──
    for (let lane = 0; lane < b.LANES; lane++) {
      const wy = top + lane * b.LANE_HEIGHT + b.LANE_HEIGHT / 2;
      // Window frame
      g.fillStyle(0x1a2030, 0.95);
      g.fillRoundedRect(bx + 8, wy - 12, 24, 22, 2);
      // Window glass with light
      const isLit = lane % 2 === 0;
      g.fillStyle(isLit ? 0x7dd3fc : 0x4a6080, isLit ? 0.6 : 0.3);
      g.fillRoundedRect(bx + 10, wy - 10, 20, 18, 2);
      // Window reflection
      if (isLit) {
        g.fillStyle(0xffffff, 0.25);
        g.fillRect(bx + 11, wy - 9, 6, 4);
      }
      // Window sill
      g.fillStyle(0x5a6a7a, 0.8);
      g.fillRect(bx + 7, wy + 10, 26, 4);
    }

    // ── LAYER 5: Roof structure ──
    g.fillStyle(0x2a3848, 0.95);
    g.fillRect(bx - 4, top - 14, bw + 8, 16);
    // Battlements
    for (let bt = bx; bt < bx + bw; bt += 12) {
      g.fillStyle(0x3a4a5a, 0.9);
      g.fillRect(bt, top - 26, 8, 14);
    }
    // Parapet edge
    g.fillStyle(0x4a5e72, 0.7);
    g.fillRect(bx - 4, top - 14, bw + 8, 3);

    // ── LAYER 6: Antenna / radio mast ──
    g.fillStyle(0x7a8a9a, 0.9);
    g.fillRect(bx + bw / 2 - 2, top - 52, 3, 40);
    // Crossbar
    g.fillStyle(0x8a9aaa, 0.8);
    g.fillRect(bx + bw / 2 - 14, top - 38, 28, 2);
    g.fillRect(bx + bw / 2 - 10, top - 28, 20, 2);
    // Blinking red light
    this._antennaLight = this.add.graphics().setDepth(9);
    this._antennaLight.fillStyle(0xef4444, 1);
    this._antennaLight.fillCircle(bx + bw / 2, top - 54, 3);
    // Blink animation
    this.tweens.add({
      targets: this._antennaLight, alpha: 0.1,
      duration: 600, ease: 'Power2', yoyo: true, repeat: -1,
    });

    // ── LAYER 7: Door (center of building at bottom) ──
    g.fillStyle(0x1a2030, 0.95);
    g.fillRoundedRect(bx + bw / 2 - 9, bot - 30, 18, 28, 2);
    g.fillStyle(0x2a3848, 0.8);
    g.fillRoundedRect(bx + bw / 2 - 7, bot - 28, 14, 24, 2);
    // Door handle
    g.fillStyle(0x8a9aaa, 1);
    g.fillCircle(bx + bw / 2 + 4, bot - 18, 2);
    // Door frame
    g.lineStyle(1.5, 0x5a6a7a, 0.8);
    g.strokeRoundedRect(bx + bw / 2 - 9, bot - 30, 18, 28, 2);

    // ── LAYER 8: Supply crates at base ──
    const crates = [[bx + 4, bot - 18], [bx + 16, bot - 18], [bx + 28, bot - 18]];
    crates.forEach(([cx, cy]) => {
      g.fillStyle(0x8b4a18, 0.9); g.fillRect(cx, cy, 11, 11);
      g.fillStyle(0x6b3410, 0.6);
      g.fillRect(cx, cy + 4, 11, 2);
      g.fillRect(cx + 4, cy, 3, 11);
      g.lineStyle(1, 0xaa6030, 0.5);
      g.strokeRect(cx, cy, 11, 11);
    });

    // ── LAYER 9: HQ sign ──
    g.fillStyle(0x1a2030, 0.9); g.fillRoundedRect(bx + 14, top + 6, 26, 12, 2);
    g.fillStyle(0xfbbf24, 0.85); g.fillRoundedRect(bx + 15, top + 7, 24, 10, 2);
    this.add.text(bx + 27, top + 12, 'HQ', {
      fontFamily: '"Exo 2",monospace', fontSize: '8px', fontStyle: 'bold', color: '#1a2030',
    }).setOrigin(0.5).setDepth(9);

    // ── LAYER 10: HOME BASE line (glowing green) ──
    g.lineStyle(2, 0x4ade80, 0.65);
    g.lineBetween(wx, top, wx, bot);
    g.lineStyle(14, 0x4ade80, 0.05);
    g.lineBetween(wx, top, wx, bot);

    this.add.text(wx - bw / 2, top - 30, 'HOME BASE', {
      fontFamily: '"Exo 2",monospace', fontSize: '9px', fontStyle: 'bold', color: '#86efac',
    }).setOrigin(0.5, 1).setDepth(9);
  }

  // ══════════════════════════════════════════════════════════
  //  ENVIRONMENT DECORATIONS
  //  NOTE: NO FLOWERS AT SENTINEL POSITIONS (bx + b.HOME_X area)
  //  Sentinels are at SENTINEL_X=28, well to the left of HOME_X=68
  // ══════════════════════════════════════════════════════════
  _drawEnvironmentDecor(W, H, env) {
    const b  = GW.BOARD;
    const g  = this.add.graphics().setDepth(7);
    const lH = b.LANE_HEIGHT;

    // Sandbag defense positions — between sentinel line and home base
    // IMPORTANT: Keep x > 40 (sentinel zone) and < HOME_X (68)
    for (let ln = 0; ln < b.LANES; ln++) {
      const ly = b.TOP_OFFSET + ln * lH + lH * 0.52;
      // Position between sentinel (x≈28) and home wall (x=68)
      const sx = 50; // clear of both sentinel and home
      g.fillStyle(0x8b7355, 0.85); g.fillRoundedRect(sx, ly - 9, 16, 9, 3);
      g.fillStyle(0x7a6448, 0.85); g.fillRoundedRect(sx + 2, ly - 17, 12, 9, 3);
    }

    if (env.id === 'daytime') {
      // Garden plants IN the lanes (middle area — well away from sentinels)
      // Keep cx > 150 to not conflict with sentinel/base area
      const plantSpots = [
        [165, 2], [165, 4], [240, 1], [240, 3], [240, 5],
        [310, 2], [360, 4], [400, 1], [440, 3],
      ];
      plantSpots.forEach(([cx, lane]) => {
        const py = b.TOP_OFFSET + (lane - 1) * lH + lH - 13;
        g.fillStyle(0x166534, 0.75); g.fillCircle(cx, py, 9);
        g.fillStyle(0x15803d, 0.6);
        g.fillCircle(cx - 5, py - 3, 6);
        g.fillCircle(cx + 5, py - 3, 6);
        // Flower — ONLY in middle of field, NOT near sentinel positions
        const flHue = [0xfbbf24, 0xef4444, 0xf9a8d4][(Math.floor(cx / 70)) % 3];
        g.fillStyle(flHue, 0.9); g.fillCircle(cx, py - 9, 3.5);
      });

      // Barrels (odd lanes only, near base but not at sentinel x)
      [1, 3].forEach(ln => {
        const ly = b.TOP_OFFSET + ln * lH + lH * 0.5;
        const bx2 = b.HOME_X + 10; // right of home wall
        g.fillStyle(0x374151, 0.8); g.fillRect(bx2, ly - 13, 14, 22);
        g.fillStyle(0x4b5563, 0.6);
        g.fillRect(bx2, ly - 13, 14, 3);
        g.fillRect(bx2, ly - 3,  14, 3);
        g.fillRect(bx2, ly + 7,  14, 3);
      });

    } else if (env.id === 'nighttime') {
      [2, 4].forEach(lane => {
        const ly = b.TOP_OFFSET + (lane - 0.5) * lH;
        g.fillStyle(0xfef08a, 0.2);
        g.fillTriangle(b.HOME_X + 12, ly, b.HOME_X + 90, ly - 45, b.HOME_X + 90, ly + 45);
      });
    } else if (env.id === 'radioactive') {
      [1, 2, 3, 4, 5].forEach(lane => {
        const ly = b.TOP_OFFSET + (lane - 0.5) * lH;
        g.fillStyle(0x84cc16, 0.25); g.fillCircle(b.HOME_X + 18, ly, 14);
        g.fillStyle(0x4b5563, 0.85); g.fillRect(b.HOME_X + 10, ly - 14, 16, 24);
      });
    }

    // Alien approach markers (right edge, subtle)
    const warnX = W - b.RIGHT_MARGIN - 12;
    for (let ln = 0; ln < b.LANES; ln++) {
      const sy = b.TOP_OFFSET + ln * lH + lH / 2;
      g.fillStyle(0x7c3aed, 0.22);
      g.fillTriangle(warnX - 8, sy + 9, warnX + 8, sy + 9, warnX, sy - 9);
      g.lineStyle(1.5, 0xc4b5fd, 0.5);
      g.strokeTriangle(warnX - 8, sy + 9, warnX + 8, sy + 9, warnX, sy - 9);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  CALLBACKS — Wire wave/combat events to UI
  // ══════════════════════════════════════════════════════════
  _wireCallbacks() {
    this.waveManager.onWaveStart = index => {
      if (this.gameMode !== 'endless') return;
      this.uiManager.updateTimelineHead(index / Math.max(1, this.waveManager.totalWaves));
    };
    this.waveManager.onHordeApproach = () => {
      if (window.GWAudio) window.GWAudio.play('horde-warning');
    };

    this.waveManager.onCountdown = () => {};
    this.waveManager.onAllClear  = () => {
      if (this.gameMode === 'endless') {
        this._endlessCompletedWaves += this.waveManager.totalWaves;
        if (GW.progression) {
          GW.progression.updateEndlessHighScore(this._endlessCompletedWaves, this.playerState.score);
        }
        this.uiManager.showBanner(
          'ROUND ' + this._endlessRound + ' CLEARED — INCOMING ASSAULT',
          GW.UI_COLORS.GREEN_BRIGHT,
          2200
        );
        this.time.delayedCall(2400, () => {
          if (!this._gameOver && !this._gameWon) this._prepareEndlessRound();
        });
        return;
      }
      this._timelineProgress = 1;
      this.uiManager.updateTimelineHead(1);
      this._triggerWin();
    };
    this.waveManager.onHordeWarning = waveDef => {
      const flagIndex = this._timelineWaves.indexOf(waveDef);
      if (flagIndex !== -1) {
        this._timelineProgress = Math.max(this._timelineProgress, this._timelineFlagPositions[flagIndex]);
        this.uiManager.updateTimelineHead(this._timelineProgress);
      }
      this.uiManager.showBigBanner('⚠  A HUGE WAVE OF ALIEN HORDE IS APPROACHING!', waveDef.warningDelay || 5000);
    };
    this.combatManager.onEnemyKilled = en => {
      if (window.GWAudio) window.GWAudio.play('alien-death');
      this.uiManager.updateScore(this.playerState.score);
      if (GW.progression) GW.progression.discoverEnemy(en.id);
      // Track last kill position for the card-pop animation in _triggerWin
      if (en && en.x !== undefined) {
        this._lastKilledX = en.x;
        this._lastKilledY = en.y;
      }
    };
    this.combatManager.onEnemyReachedHome = () => {
      if (!this._gameOver && !this._gameWon) this._triggerLose();
    };
    this.combatManager.onCharacterKilled = () => {
      if (window.GWAudio) window.GWAudio.play('defender-death');
    };
  }

  _prepareEndlessRound() {
    const baseWaves = GW.ENDLESS_BASE_WAVES;
    const scale = GW.ENDLESS.difficultyScale;
    const enemyHpMultiplier = 1 + this._endlessCompletedWaves * scale.hpMultiplierPerWave;
    const enemySpeedMultiplier = Math.min(
      2.5,
      1 + this._endlessCompletedWaves * scale.speedMultiplierPerWave
    );
    const waves = baseWaves.map(wave => Object.assign({}, wave, {
      enemies: (wave.enemies || []).map(enemy => Object.assign({}, enemy)),
      enemyHpMultiplier,
      enemySpeedMultiplier,
    }));

    this._endlessRound++;
    this.waveManager.waves = waves;
    this.waveManager.totalWaves = waves.length;
    this.waveManager.currentWaveIndex = -1;
    this.waveManager.initialTimer = GW.WAVES.INITIAL_DELAY;
    this.waveManager.started = false;
    this.waveManager.start();
  }

  // ══════════════════════════════════════════════════════════
  //  INPUT
  // ══════════════════════════════════════════════════════════
  _setupInput(W, H) {
    this.uiManager.onCharacterSelected = id => {
      if (id && this._shovelMode) {
        this._shovelMode = false;
        this.uiManager.setShovelActive(false);
      }
      this._selectedCharId = id;
    };
    this.uiManager.onShovelSelected = active => {
      if (active && !this.resourceManager.canAfford(GW.SHOVEL.COST)) {
        this._feedback(GW.DISPLAY.BASE_WIDTH - 193, GW.BOARD.TRAY_HEIGHT / 2, false, 'Need 200 P.E.');
        return false;
      }
      this._shovelMode = active;
      if (active) {
        this._selectedCharId = null;
        this.uiManager.deselectAll();
      }
      return true;
    };

    this.input.on('pointerdown', ptr => {
      if (this._gameOver || this._gameWon || this._paused || this.uiManager.isPaused) return;
      if (ptr.y <= GW.BOARD.TRAY_HEIGHT) return;
      if (ptr.y >= GW.BOARD.TIMELINE_Y)  return;
      if (this._shovelMode) {
        this._tryRemoveCharacter(ptr.x, ptr.y);
        return;
      }
      if (!this._selectedCharId) return;
      this._tryPlaceCharacter(ptr.x, ptr.y);
    });

    this.input.on('pointermove', ptr => {
      if (this._gameOver || this._gameWon || this._paused || this.uiManager.isPaused) return;
      this.uiManager.updateGridHover(ptr.x, ptr.y, !!this._selectedCharId);
    });

    this.input.keyboard.on('keydown-ESC', () => {
      this._selectedCharId = null;
      this._shovelMode = false;
      this.uiManager.setShovelActive(false);
      this.uiManager.deselectAll();
      this.uiManager.updateGridHover(-1, -1, false);
    });

    this.input.keyboard.on('keydown-P', () => this.uiManager._openPauseMenu());
  }

  // ══════════════════════════════════════════════════════════
  //  PLACEMENT
  // ══════════════════════════════════════════════════════════
  _tryPlaceCharacter(worldX, worldY) {
    const cell = GW.Collision.worldToCell(worldX, worldY);
    if (!cell) { this._feedback(worldX, worldY, false, 'Invalid position'); return; }

    const def = GW.CARDS && GW.CARDS[this._selectedCharId];
    if (!def) return;

    if (!this.resourceManager.canAfford(def.cost)) {
      this._feedback(worldX, worldY, false, 'Need \u26a1' + def.cost); return;
    }
    if (GW.Collision.cellOccupied(this.combatManager.characters, cell.lane, cell.cellIndex)) {
      this._feedback(worldX, worldY, false, 'Cell occupied'); return;
    }

    const pos       = GW.Collision.cellToWorld(cell.lane, cell.cellIndex);
    const character = GW.CharacterFactory.create(this, this._selectedCharId, cell.lane, cell.cellIndex, pos.x, pos.y);

    if (character.isSupport && character.role === 'energy') {
      // P.E. Generator now spawns a clickable orb instead of directly adding energy.
      // Player must click the orb to collect it.
      character.onGenerateEnergy = (_amount, cx, cy) => {
        this.resourceManager.spawnGeneratorOrb(cx || character.x, cy || character.y);
      };
      // Randomize initial timer so all generators don't tick simultaneously
      const genMin = (GW.RESOURCES && GW.RESOURCES.REGEN_UNIT_INTERVAL_MIN) || 8000;
      const genMax = (GW.RESOURCES && GW.RESOURCES.REGEN_UNIT_INTERVAL_MAX) || 10000;
      character.genTimer = genMin + Math.floor(Math.random() * (genMax - genMin + 1));
    }

    this.combatManager.addCharacter(character);
    this.resourceManager.spend(def.cost);
    if (window.GWAudio) window.GWAudio.play('card-place');
    // Start per-card cooldown if configured (e.g. fire_lance_gunner = 7.5s)
    this.uiManager.startCooldown(this._selectedCharId);
    this._feedback(pos.x, pos.y, true, def.name + ' deployed');
  }

  _tryRemoveCharacter(worldX, worldY) {
    const cell = GW.Collision.worldToCell(worldX, worldY);
    if (!cell) { this._feedback(worldX, worldY, false, 'Invalid position'); return; }

    const character = this.combatManager.characters.find(candidate =>
      candidate.alive && candidate.lane === cell.lane && candidate.cellIndex === cell.cellIndex
    );
    if (!character) { this._feedback(worldX, worldY, false, 'No unit here'); return; }

    const cost = GW.SHOVEL.COST;
    if (!this.resourceManager.spend(cost)) {
      this._feedback(worldX, worldY, false, 'Need 200 P.E.');
      return;
    }

    this.combatManager.characters.splice(this.combatManager.characters.indexOf(character), 1);
    character.alive = false;
    character.target = null;
    character.destroy();
    this._shovelMode = false;
    this.uiManager.setShovelActive(false);
    this._feedback(character.x, character.y, true, 'Unit removed (-200 P.E.)');
  }

  _feedback(x, y, ok, msg) {
    const color = ok ? GW.UI_COLORS.GREEN_BRIGHT : GW.UI_COLORS.TEXT_DANGER;
    const txt = this.add.text(x, y - 20, msg, {
      fontFamily: '"Exo 2",monospace', fontSize: '11px', fontStyle: 'bold',
      color, stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(46);
    this.tweens.add({
      targets: txt, y: txt.y - 26, alpha: 0, duration: 900, ease: 'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  // ══════════════════════════════════════════════════════════
  //  WIN / LOSE
  // ══════════════════════════════════════════════════════════
  _triggerWin() {
    if (this._gameOver || this._gameWon) return;
    this._pendingVictory = false;
    this._clearBattleSnapshot();
    this._gameWon = true;
    this.resourceManager.stopOrbSpawning();

    if (this.gameMode !== 'adventure') {
      if (this.gameMode === 'survival' && GW.progression) {
        GW.progression.updateSurvivalScore(
          this.scenarioId,
          this.waveManager.totalWaves,
          this.playerState.score
        );
      }
      this.uiManager.showWinScreen(
        this.playerState,
        this.levelId,
        null,
        () => this._restart(),
        () => this._goToMenu(),
        null,
        this._modeName
      );
      return;
    }

    // 1. Mark level complete and unlock the next level in progression
    if (GW.progression) GW.progression.completeLevel(this.levelId);

    // 2. Determine reward card for this level
    const levelData = GW.LEVELS[this.levelId];
    const cardId    = levelData && levelData.reward && levelData.reward.cardId;

    // 3. Queue the card as pending claim (player must manually click it)
    if (cardId && GW.cardManager) GW.cardManager.setPendingClaim(cardId);

    // 4. Determine next level
    const nextLevelId  = this.levelId + 1;
    const hasNextLevel = !!GW.LEVELS[nextLevelId];

    this.uiManager.updateTimelineHead(1.0);

    // 5. If there is a card reward, play the card-pop animation from the last
    //    enemy position, then reveal the win screen after 10 seconds.
    //    Without a card, wait just 0.8s (original timing).
    const winDelay = cardId ? 10000 : 800;

    if (cardId) {
      const cardDef = GW.CARDS && GW.CARDS[cardId];
      // Find the last enemy killed position — fall back to centre-right of board
      const lastX = this._lastKilledX || (GW.DISPLAY.BASE_WIDTH * 0.75);
      const lastY = this._lastKilledY || (GW.BOARD.TOP_OFFSET + GW.BOARD.LANES * GW.BOARD.LANE_HEIGHT / 2);

      // Starburst flash at kill site
      const burst = this.add.graphics().setDepth(60);
      burst.fillStyle(0xfbbf24, 0.9);
      burst.fillCircle(lastX, lastY, 16);
      this.tweens.add({ targets: burst, scaleX: 4, scaleY: 4, alpha: 0, duration: 600, ease: 'Power3', onComplete: () => burst.destroy() });

      // Card panel rises from the kill site to screen centre
      const CW = 180, CH = 90;
      const cardPanel = this.add.graphics().setDepth(61);
      cardPanel.fillStyle(0x0a0a14, 0.97);
      cardPanel.lineStyle(3, 0xfbbf24, 1);
      cardPanel.fillRoundedRect(-CW / 2, -CH / 2, CW, CH, 10);
      cardPanel.strokeRoundedRect(-CW / 2, -CH / 2, CW, CH, 10);
      cardPanel.x = lastX; cardPanel.y = lastY;

      const cardLabel = this.add.text(0, -22, '★  NEW CARD  ★', {
        fontFamily: '"Exo 2", monospace', fontSize: '10px', fontStyle: 'bold',
        color: '#fbbf24', stroke: '#000', strokeThickness: 2, align: 'center',
      }).setOrigin(0.5).setDepth(62);

      const cardName = this.add.text(0, 0, cardDef ? cardDef.name.toUpperCase() : cardId.toUpperCase(), {
        fontFamily: '"Exo 2", monospace', fontSize: '15px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000', strokeThickness: 3, align: 'center',
      }).setOrigin(0.5).setDepth(62);

      const cardRarity = this.add.text(0, 22, cardDef && cardDef.rarity ? cardDef.rarity.toUpperCase() : 'COMMON', {
        fontFamily: '"Exo 2", monospace', fontSize: '9px',
        color: '#a78bfa', align: 'center',
      }).setOrigin(0.5).setDepth(62);

      const clickHint = this.add.text(0, 36, '★  CLAIM AND CONTINUE  ▶', {
        fontFamily: '"Exo 2", monospace', fontSize: '10px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000', strokeThickness: 2, align: 'center',
      }).setOrigin(0.5).setDepth(62);

      // Target centre of screen
      const targetX = GW.DISPLAY.BASE_WIDTH / 2;
      const targetY = GW.DISPLAY.BASE_HEIGHT / 2 - 30;

      [cardLabel, cardName, cardRarity].forEach(t => {
        t.x = lastX; t.y = lastY + (t === cardLabel ? -22 : t === cardName ? 0 : 22);
      });

      // Animate panel + labels to screen centre
      const panelObjs = [cardPanel, cardLabel, cardName, cardRarity];
      this.time.delayedCall(200, () => {
        this.tweens.add({
          targets: cardPanel,
          x: targetX, y: targetY,
          scaleX: 1.35, scaleY: 1.35,
          duration: 700, ease: 'Back.easeOut',
        });
        [cardLabel, cardName, cardRarity].forEach(t => {
          this.tweens.add({ targets: t, x: targetX, y: targetY + (t === cardLabel ? -22 : t === cardName ? 0 : 22), duration: 700, ease: 'Back.easeOut' });
        });
        // Pulse the panel
        this.tweens.add({ targets: cardPanel, alpha: 0.7, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      });

      // ── CLAIM AND CONTINUE button ──────────────────────────────────────
      // Orange pill button below the card panel. Clicking immediately claims
      // the card and shows the win screen. Auto-fires after 10s if not clicked.
      const BW = 220, BH = 36;
      const btnX = targetX - BW / 2;
      const btnY = targetY + 80;

      const btnBg = this.add.graphics().setDepth(63);
      const drawBtn = (hover) => {
        btnBg.clear();
        btnBg.fillStyle(hover ? 0xf59e0b : 0xd97706, 1);
        btnBg.lineStyle(2, 0xfbbf24, 0.9);
        btnBg.fillRoundedRect(btnX, btnY, BW, BH, 8);
        btnBg.strokeRoundedRect(btnX, btnY, BW, BH, 8);
      };
      drawBtn(false);

      const btnTxt = this.add.text(targetX, btnY + BH / 2, '★  CLAIM AND CONTINUE  ▶', {
        fontFamily: '"Exo 2", monospace', fontSize: '11px', fontStyle: 'bold',
        color: '#ffffff', stroke: '#000', strokeThickness: 2, align: 'center',
      }).setOrigin(0.5).setDepth(64);

      const btnZone = this.add.rectangle(targetX, btnY + BH / 2, BW, BH, 0x000000, 0)
        .setDepth(65).setInteractive({ useHandCursor: true });
      btnZone.on('pointerover',  () => drawBtn(true));
      btnZone.on('pointerout',   () => drawBtn(false));

      // Shared claim-and-proceed function — used by both click and auto-timer
      const claimAndProceed = () => {
        cdTimer.remove(false);
        btnZone.removeAllListeners();
        [btnBg, btnTxt, btnZone].forEach(o => { try { o.destroy(); } catch (_) {} });
        panelObjs.forEach(o => { try { o.destroy(); } catch (_) {} });
        if (countdown && countdown.scene) countdown.destroy();
        this.uiManager.showWinScreen(
          this.playerState, this.levelId, cardId,
          () => this._restart(),
          () => this._goToMenu(),
          hasNextLevel ? () => this._goToNextLevel(nextLevelId) : null
        );
      };

      btnZone.on('pointerdown', () => {
        if (window.GWAudio) window.GWAudio.play('victory-claim');
        claimAndProceed();
      });

      // Countdown label
      const countdown = this.add.text(targetX, btnY + BH + 10, 'Auto-claiming in 10…', {
        fontFamily: '"Exo 2", monospace', fontSize: '9px', color: '#6b7280', align: 'center',
      }).setOrigin(0.5).setDepth(62);

      let secs = 10;
      const cdTimer = this.time.addEvent({
        delay: 1000, repeat: 9,
        callback: () => {
          secs--;
          if (countdown && countdown.scene) {
            countdown.setText(secs > 0 ? ('Auto-claiming in ' + secs + '…') : 'Claiming…');
          }
        },
      });

      // Auto-fire after 10s
      this.time.delayedCall(winDelay, claimAndProceed);

    } else {
      // No card reward — short delay then win screen
      this.time.delayedCall(winDelay, () => {
        this.uiManager.showWinScreen(
          this.playerState, this.levelId, cardId,
          () => this._restart(),
          () => this._goToMenu(),
          hasNextLevel ? () => this._goToNextLevel(nextLevelId) : null
        );
      });
    }
  }

  /** Navigate to next level — saves state and starts next level directly. */
  _goToNextLevel(nextLevelId) {
    window.__GW_ALLOW_NAVIGATION__ = true;
    this._clearBattleSnapshot();
    // Unlock the next level in progression state
    if (GW.progression && GW.LEVELS[nextLevelId]) {
      if (!GW.progression.isLevelUnlocked(nextLevelId)) {
        // Force-unlock by treating it as completed through progression
        GW.LEVELS[nextLevelId].unlocked = true;
      }
      GW.progression.save();
    }
    // Destroy current scene objects
    this.combatManager.destroyAll();
    this.sentinelMgr.destroyAll();
    if (this.currencyManager) this.currencyManager.destroyAll();
    // Navigate — use BootScene transition to properly init the next level
    window.location.replace("game.html?level=" + nextLevelId);
  }

  _triggerLose() {
    if (this._gameOver || this._gameWon) return;
    this._clearBattleSnapshot();
    this._pendingVictory = false;
    this._gameOver = true;
    this.resourceManager.stopOrbSpawning();
    if (GW.progression && this.gameMode === 'endless') {
      const reachedWave = this._endlessCompletedWaves + Math.max(0, this.waveManager.currentWaveIndex + 1);
      GW.progression.updateEndlessHighScore(reachedWave, this.playerState.score);
    } else if (GW.progression && this.gameMode === 'survival') {
      GW.progression.updateSurvivalScore(
        this.scenarioId,
        this.waveManager.currentWaveNumber,
        this.playerState.score
      );
    }
    this.cameras.main.shake(380, 0.012);
    this.uiManager.showBanner('BASE BREACHED!', GW.UI_COLORS.TEXT_DANGER, 900);
    this.time.delayedCall(1000, () => {
      this.uiManager.showLoseScreen(() => this._restart(), () => this._goToMenu());
    });
  }

  _restart() {
    window.__GW_ALLOW_NAVIGATION__ = true;
    this._clearBattleSnapshot();
    this.combatManager.destroyAll();
    this.sentinelMgr.destroyAll();
    if (this.currencyManager) this.currencyManager.destroyAll();
    const params = new URLSearchParams({ level: String(this.levelId) });
    if (this.gameMode !== 'adventure') {
      params.set('mode', this.gameMode);
      if (this.scenarioId) params.set('scenario', this.scenarioId);
    }
    params.set('restart', String(Date.now()));
    window.location.replace('game.html?' + params.toString());
  }

  async _goToMenu() {
    try {
      await this._saveBattleSnapshot();
    } catch (error) {
      console.error('[Game] Battle checkpoint could not be completed before leaving.', error);
    }
    window.__GW_ALLOW_NAVIGATION__ = true;
    sessionStorage.removeItem('gw_menu_return');
    window.location.replace('index.html');
  }

  async _saveBattleSnapshot(force) {
    const progression = GW.progression;
    const token = localStorage.getItem('gw_session_token') || localStorage.getItem('gw_id_token');
    if (!progression || this._gameOver || this._gameWon || !this.combatManager) return false;
    if (this._battleSnapshotSaved && !force) return this._battleSnapshotSavePromise || true;

    const snapshot = {
      levelId: this.levelId,
      mode: this.gameMode,
      scenarioId: this.scenarioId,
      gameRuntimeMs: this._gameRuntimeMs,
      runtimeStarted: this._runtimeStarted,
      energy: this.resourceManager.energy,
      score: this.playerState.score,
      enemiesDefeated: this.playerState.enemiesDefeated,
      timelineProgress: this.uiManager._currentProgress || 0,
      pendingVictory: this._pendingVictory,
      wave: {
        started: this.waveManager.started,
        currentWaveIndex: this.waveManager.currentWaveIndex,
        state: this.waveManager.state,
        initialTimer: this.waveManager.initialTimer,
        betweenTimer: this.waveManager.betweenTimer,
        totalSpawned: this.waveManager._totalSpawnedAllWaves,
        totalScheduled: this.waveManager._totalScheduledAllWaves,
        spawnedCount: this.waveManager._spawnedCount,
        spawnedEntryIndexes: this.waveManager._spawnedEntryIndexes,
        chainIndex: this.waveManager._chainIndex,
        hordeReleaseScheduled: this.waveManager._hordeReleaseScheduled,
        hordeReleaseRemaining: this.waveManager._hordeReleaseTimer && this.waveManager._hordeReleaseTimer.getRemaining
          ? this.waveManager._hordeReleaseTimer.getRemaining() : 0,
      },
      characters: this.combatManager.characters.map(character => ({
        id: character.id,
        lane: character.lane,
        cellIndex: character.cellIndex,
        hp: character.hp,
        genTimer: character.genTimer,
        attackTimer: character.attackTimer,
        abilityTimer: character.abilityTimer,
        shieldHp: character.shieldHp,
        shieldTimer: character.shieldTimer,
        attackSpeedMultiplier: character.attackSpeedMultiplier,
        attackSpeedBuffTimer: character.attackSpeedBuffTimer,
        genRateMultiplier: character.genRateMultiplier,
        genBoostTimer: character.genBoostTimer,
        isStealthed: character.isStealthed,
        stealthTimer: character.stealthTimer,
      })),
      enemies: this.combatManager.enemies.map(enemy => ({
        id: enemy.id,
        lane: enemy.lane,
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        speed: enemy.speed,
        equipmentId: enemy.equipment && enemy.equipment.id,
        revealed: enemy.revealed,
        revealTimer: enemy.revealTimer,
        slowMultiplier: enemy.slowMultiplier,
        slowTimer: enemy.slowTimer,
      })),
      projectiles: this.projectileManager.projectiles.map(projectile => ({
        kind: projectile instanceof GW.FireProjectile ? 'fire' : 'normal',
        x: projectile.x,
        y: projectile.y,
        damage: projectile.damage,
        speed: projectile.speed,
        color: projectile.color,
        size: projectile.size,
        weaponId: projectile.weaponDef && projectile.weaponDef.id,
        age: projectile._age || 0,
        targetIndex: this.combatManager.enemies.indexOf(projectile.target),
      })),
      plasmaOrbs: this.resourceManager.orbs.map(orb => ({
        x: orb.x, y: orb.y, value: orb.value,
        lifetime: orb._expireTimer && orb._expireTimer.getRemaining ? orb._expireTimer.getRemaining() : orb.lifetime,
      })),
      currencyDrops: this.currencyManager.drops.map(drop => ({
        x: drop.x, y: drop.y, typeId: drop.typeDef.id,
        lifetime: drop._expireTimer && drop._expireTimer.getRemaining ? drop._expireTimer.getRemaining() : GW.CURRENCY.LIFETIME,
      })),
      savedAt: Date.now(),
    };
    progression.state.activeBattle = snapshot;
    progression.saveLocal();
    this._battleSnapshotSaved = true;
    this._battleSnapshotSavePromise = (async () => {
      if (progression.isGuest || !token) return true;
      const client = GW.sheetsClient;
      if (!client) return true;
      if (!client.ready && client.init) {
        await Promise.race([
          client.init().catch(() => {}),
          new Promise(resolve => window.setTimeout(resolve, 1500)),
        ]);
      }
      if (!client.ready) return true;
      let user = {};
      try { user = JSON.parse(localStorage.getItem('gw_user') || '{}'); } catch (_) {}
      if (!user.email) throw new Error('Cannot save a battle checkpoint without a registered account email.');
      return client.saveProgression(user.email, progression.state);
    })().catch(error => {
      console.warn('[Game] Cloud checkpoint failed; local checkpoint remains available.', error);
      this._battleSnapshotSaved = false;
      return false;
    });
    return this._battleSnapshotSavePromise;
  }

  _restoreBattleSnapshot() {
    const progression = GW.progression;
    const snapshot = progression && progression.state.activeBattle;
    if (!snapshot || snapshot.levelId !== this.levelId ||
        (snapshot.mode || 'adventure') !== this.gameMode ||
        (snapshot.scenarioId || '') !== this.scenarioId) return false;

    this.resourceManager.energy = snapshot.energy;
    this._gameRuntimeMs = Math.max(0, Number(snapshot.gameRuntimeMs) || 0);
    this._runtimeStarted = snapshot.runtimeStarted == null
      ? !!(snapshot.wave && snapshot.wave.started)
      : !!snapshot.runtimeStarted;
    this.playerState.score = snapshot.score || 0;
    this.playerState.enemiesDefeated = snapshot.enemiesDefeated || 0;
    (snapshot.characters || []).forEach(saved => {
      const pos = GW.Collision.cellToWorld(saved.lane, saved.cellIndex);
      const character = GW.CharacterFactory.create(this, saved.id, saved.lane, saved.cellIndex, pos.x, pos.y);
      character.hp = saved.hp;
      character.genTimer = saved.genTimer;
      character.attackTimer = saved.attackTimer;
      character.abilityTimer = saved.abilityTimer == null ? character.abilityTimer : saved.abilityTimer;
      character.shieldHp = saved.shieldHp || 0;
      character.shieldTimer = saved.shieldTimer || 0;
      character.attackSpeedMultiplier = saved.attackSpeedMultiplier || 1;
      character.attackSpeedBuffTimer = saved.attackSpeedBuffTimer || 0;
      character.attackSpeed = character._baseAttackSpeed * character.attackSpeedMultiplier;
      character.genRateMultiplier = saved.genRateMultiplier || 1;
      character.genBoostTimer = saved.genBoostTimer || 0;
      character.isStealthed = !!saved.isStealthed;
      character.stealthTimer = saved.stealthTimer || 0;
      if (character.isStealthed && character.container) character.container.setAlpha(0.45);
      character._updateHpBar();
      if (character.isSupport && character.role === 'energy') {
        character.onGenerateEnergy = (_amount, x, y) => this.resourceManager.spawnGeneratorOrb(x || character.x, y || character.y);
      }
      this.combatManager.addCharacter(character);
    });
    const restoredEnemies = [];
    (snapshot.enemies || []).forEach(saved => {
      const enemy = GW.EnemyFactory.create(this, saved.id, saved.lane);
      if (!enemy) return;
      enemy.x = saved.x;
      enemy.y = saved.y;
      enemy.speed = saved.speed;
      enemy.hp = saved.hp;
      enemy.container.setPosition(saved.x, saved.y);
      enemy.revealed = saved.revealed == null ? enemy.revealed : saved.revealed;
      enemy.revealTimer = saved.revealTimer || 0;
      enemy.slowMultiplier = saved.slowMultiplier || 1;
      enemy.slowTimer = saved.slowTimer || 0;
      if (enemy.isStealth && !enemy.revealed) enemy.container.setAlpha(0.2);
      if (saved.equipmentId && GW.ALIEN_EQUIPMENT && GW.ALIEN_EQUIPMENT[saved.equipmentId]) {
        enemy.applyEquipment(GW.ALIEN_EQUIPMENT[saved.equipmentId]);
      }
      enemy._updateHpBar();
      this.combatManager.addEnemy(enemy);
      restoredEnemies.push(enemy);
    });
    (snapshot.projectiles || []).forEach(saved => {
      const target = restoredEnemies[saved.targetIndex];
      if (!target) return;
      const projectile = this.projectileManager.fire(
        saved.x, saved.y, target, saved.damage, saved.color, saved.size,
        saved.kind === 'fire' ? 'fire' : undefined,
        saved.speed,
        saved.weaponId && GW.WEAPONS[saved.weaponId]
      );
      projectile.speed = saved.speed;
      if (saved.kind === 'fire') {
        projectile._age = saved.age || 0;
        projectile._drawFlame(projectile._age);
      }
    });
    (snapshot.plasmaOrbs || []).forEach(saved => {
      const orb = new GW.PlasmaOrb(this, saved.x, saved.y, saved.value, saved.lifetime, value => {
        this.resourceManager.earn(value);
        const index = this.resourceManager.orbs.indexOf(orb);
        if (index !== -1) this.resourceManager.orbs.splice(index, 1);
      });
      this.resourceManager.orbs.push(orb);
    });
    (snapshot.currencyDrops || []).forEach(saved => {
      const type = GW.CURRENCY.TYPES[saved.typeId];
      if (type) this.currencyManager.spawnDrop(saved.x, saved.y, type, saved.lifetime);
    });

    const savedWave = snapshot.wave || {};
    this.waveManager.restoreSnapshot(savedWave);
    this._wavesStarted = this.waveManager.started;
    this._pendingVictory = !!snapshot.pendingVictory || this.waveManager.isComplete;
    if (this.uiManager.energyText) this.uiManager.energyText.setText(String(this.resourceManager.energy));
    this.uiManager.updateScore(this.playerState.score);
    this._timelineProgress = Math.max(this._timelineProgress, Number(snapshot.timelineProgress) || 0);
    this.uiManager.updateTimelineHead(Math.max(
      this._timelineProgress,
      Math.min(1, this._gameRuntimeMs / this._missionDurationMs)
    ));
    this.uiManager.updateRuntime(this._gameRuntimeMs);
    return true;
  }

  _clearBattleSnapshot() {
    this._battleSnapshotSaved = false;
    if (GW.progression && GW.progression.state) {
      GW.progression.state.activeBattle = null;
      GW.progression.save();
    }
  }

  // ══════════════════════════════════════════════════════════
  //  GAME LOOP — Single authoritative update
  // ══════════════════════════════════════════════════════════
  update(time, delta) {
    if (this._gameOver || this._gameWon) return;
    if (this._paused || this.uiManager.isPaused) return;

    if (this._pendingVictory && this.waveManager.isComplete) {
      this._timelineProgress = 1;
      this.uiManager.updateTimelineHead(1);
      this._triggerWin();
      return;
    }

    if (this._runtimeStarted) {
      this._gameRuntimeMs += delta;
      this.uiManager.updateRuntime(this._gameRuntimeMs);
      this._timelineProgress = Math.max(
        this._timelineProgress,
        Math.min(1, this._gameRuntimeMs / this._missionDurationMs)
      );
      this.uiManager.updateTimelineHead(this._timelineProgress);
    }
    this.waveManager.update(delta);
    this.combatManager.update(delta);
    if (this.sentinelMgr) this.sentinelMgr.update(this.combatManager.enemies);
    if (this.currencyManager) this.currencyManager.update();
    this.uiManager.updateCooldowns(delta);
    this._updateEnvironmentAnimation(delta);
  }

  // ══════════════════════════════════════════════════════════
  //  EMERGENCY FALLBACK — shown when create() throws
  //  Ensures the player is never stuck on the green screen
  // ══════════════════════════════════════════════════════════
  // ── Static helper: flag count by environment + level ──
  static _getFlagCount(envId, levelId) {
    const level = GW.LEVELS && GW.LEVELS[levelId];
    if (level && level.isBossLevel) return 6;
    const flagsByDifficulty = { easy: 1, moderate: 2, medium: 3, hard: 4, expert: 5 };
    if (level && flagsByDifficulty[level.difficulty]) return flagsByDifficulty[level.difficulty];
    if (!levelId || levelId <= 6) return 1;
    if (levelId <= 14) return 2;
    if (levelId <= 23) return 3;
    if (levelId <= 35) return 4;
    return 5;
  }

  _emergencyFallback(err) {
    const W = GW.DISPLAY ? GW.DISPLAY.BASE_WIDTH  : 960;
    const H = GW.DISPLAY ? GW.DISPLAY.BASE_HEIGHT : 600;

    // Draw a basic dark overlay so it's not a mystery green
    const bg = this.add.graphics().setDepth(999);
    bg.fillStyle(0x0a1a08, 1);
    bg.fillRect(0, 0, W, H);

    this.add.text(W / 2, H / 2 - 30, 'INITIALIZATION ERROR', {
      fontFamily: '"Exo 2", monospace', fontSize: '20px', fontStyle: 'bold',
      color: '#ef4444', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(1000);

    this.add.text(W / 2, H / 2 + 10, (err && err.message) ? err.message : 'Unknown error', {
      fontFamily: '"Exo 2", monospace', fontSize: '11px',
      color: '#9ca3af', wordWrap: { width: 600 },
    }).setOrigin(0.5).setDepth(1000);

    this.add.text(W / 2, H / 2 + 60, 'Press F5 to reload  |  Check browser console for details', {
      fontFamily: '"Exo 2", monospace', fontSize: '10px', color: '#6b7280',
    }).setOrigin(0.5).setDepth(1000);

    // Allow returning to menu
    const menuBtn = this.add.text(W / 2, H / 2 + 100, '[ RETURN TO MENU ]', {
      fontFamily: '"Exo 2", monospace', fontSize: '13px', fontStyle: 'bold',
      color: '#4ade80', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1000).setInteractive({ useHandCursor: true });
    menuBtn.on('pointerdown', () => { window.location.href = 'index.html'; });
    menuBtn.on('pointerover', () => menuBtn.setColor('#86efac'));
    menuBtn.on('pointerout',  () => menuBtn.setColor('#4ade80'));
  }
};
