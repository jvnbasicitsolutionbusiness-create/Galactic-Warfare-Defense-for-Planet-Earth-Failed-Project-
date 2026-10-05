/**
 * Garden Warfare: Reborn — Phaser Entry Point
 * Canvas: 960×600 (corrected sky proportions)
 */

/* global Phaser, GW */

(function () {
  'use strict';

  if (typeof Phaser === 'undefined') {
    console.error('[GW] Phaser failed to load.');
    const status = document.getElementById('loadStatus');
    if (status) status.textContent = 'ERROR: Phaser failed to load.';
    return;
  }

  if (typeof GW === 'undefined' || !GW.DISPLAY) {
    console.error('[GW] config.js not loaded before main.js.');
    return;
  }

  if (!GW.progression && GW.ProgressionManager) {
    GW.progression = new GW.ProgressionManager();
  }

  let pixelArt = GW.DISPLAY.PIXEL_ART !== false;
  const savedProgression = GW.progression && GW.progression.state;
  if (savedProgression && savedProgression.settings && savedProgression.settings.pixelArt != null) {
    pixelArt = !!savedProgression.settings.pixelArt;
  }

  const config = {
    type: Phaser.AUTO,
    width:  GW.DISPLAY.BASE_WIDTH,   // 960
    height: GW.DISPLAY.BASE_HEIGHT,  // 600
    backgroundColor: GW.DISPLAY.BACKGROUND_COLOR,
    parent: 'game-container',
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width:      GW.DISPLAY.BASE_WIDTH,
      height:     GW.DISPLAY.BASE_HEIGHT,
      min: {
        width:  GW.DISPLAY.MIN_WIDTH,
        height: GW.DISPLAY.MIN_HEIGHT,
      },
    },
    physics: {
      default: 'arcade',
      arcade:  { gravity: { y: 0 }, debug: false },
    },
    input: {
      keyboard: true,
      mouse:    true,
      touch:    true,
      gamepad:  false,
    },
    render: {
      antialias:         !pixelArt,
      pixelArt,
      roundPixels:       pixelArt,
      transparent:       false,
      clearBeforeRender: true,
    },
    scene:               GW.SceneRegistry,
    disableContextMenu:  true,
  };

  try {
    const game = new Phaser.Game(config);
    window.__GW_GAME__ = game;
    window.__GW_ALLOW_NAVIGATION__ = false;
    const gameUrl = window.location.href;
    try {
      window.history.replaceState({ gwGameGuard: true }, '', gameUrl);
      window.history.pushState({ gwGameGuard: true }, '', gameUrl);
    } catch (_) {}

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      game.scene.scenes.forEach(scene => {
        if (scene.scene.isActive() && scene.uiManager && !scene.uiManager.isPaused) {
          scene.uiManager._openPauseMenu();
        }
      });
    });
    window.addEventListener('pagehide', () => {
      game.scene.scenes.forEach(scene => {
        if (scene._saveBattleSnapshot) scene._saveBattleSnapshot();
      });
    });
    window.addEventListener('popstate', () => {
      if (window.__GW_ALLOW_NAVIGATION__) return;
      game.scene.scenes.forEach(scene => {
        if (scene.scene.isActive() && scene.uiManager && !scene.uiManager.isPaused) {
          scene.uiManager._openPauseMenu();
        }
      });
      try { window.history.pushState({ gwGameGuard: true }, '', gameUrl); } catch (_) {}
    });

    console.log('[GW] Garden Warfare: Reborn — initialized 960×600');
  } catch (err) {
    console.error('[GW] Failed to initialize Phaser:', err);
    const status = document.getElementById('loadStatus');
    if (status) status.textContent = 'ERROR: ' + err.message;
  }
})();
