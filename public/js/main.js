/**
 * Galactic Warfare — Phaser Entry Point
 * Canvas: 960 × 600
 */

/* global Phaser, GW */

(function () {
  'use strict';

  // --------------------------------------------------
  // 1. Validate dependencies
  // --------------------------------------------------

  if (typeof Phaser === 'undefined') {
    console.error('[GW] Phaser failed to load.');

    const status = document.getElementById('loadStatus');
    if (status) {
      status.textContent = 'ERROR: Phaser failed to load.';
    }

    return;
  }

  if (typeof GW === 'undefined' || !GW.DISPLAY) {
    console.error('[GW] config.js was not loaded before main.js.');
    return;
  }

  // --------------------------------------------------
  // 2. Initialize progression
  // --------------------------------------------------

  if (!GW.progression && GW.ProgressionManager) {
    GW.progression = new GW.ProgressionManager();
  }

  let pixelArt = GW.DISPLAY.PIXEL_ART !== false;

  const savedProgression =
    GW.progression && GW.progression.state;

  if (
    savedProgression &&
    savedProgression.settings &&
    savedProgression.settings.pixelArt != null
  ) {
    pixelArt = !!savedProgression.settings.pixelArt;
  }

  // --------------------------------------------------
  // 3. Initialize logout UI in the CLOSED state
  // --------------------------------------------------

  const logoutModal = document.getElementById('gw-logout-modal');

  if (logoutModal) {
    logoutModal.hidden = true;
  }

  // --------------------------------------------------
  // 4. Phaser configuration
  // --------------------------------------------------

  const config = {
    type: Phaser.AUTO,

    width: GW.DISPLAY.BASE_WIDTH,
    height: GW.DISPLAY.BASE_HEIGHT,

    backgroundColor: GW.DISPLAY.BACKGROUND_COLOR,
    parent: 'game-container',

    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,

      width: GW.DISPLAY.BASE_WIDTH,
      height: GW.DISPLAY.BASE_HEIGHT,

      min: {
        width: GW.DISPLAY.MIN_WIDTH,
        height: GW.DISPLAY.MIN_HEIGHT
      }
    },

    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 0 },
        debug: false
      }
    },

    input: {
      keyboard: true,
      mouse: true,
      touch: true,
      gamepad: false
    },

    render: {
      antialias: !pixelArt,
      pixelArt: pixelArt,
      roundPixels: pixelArt,
      transparent: false,
      clearBeforeRender: true
    },

    scene: GW.SceneRegistry,
    disableContextMenu: true
  };

  // --------------------------------------------------
  // 5. Pause active scenes when required
  //    This must NOT open the logout modal.
  // --------------------------------------------------

  function pauseActiveScenes(game) {
    if (!game || !game.scene || !game.scene.scenes) {
      return;
    }

    game.scene.scenes.forEach(function (scene) {
      if (
        !scene ||
        !scene.scene ||
        !scene.scene.isActive ||
        !scene.scene.isActive()
      ) {
        return;
      }

      const ui = scene.uiManager;

      if (
        ui &&
        !ui.isPaused &&
        typeof ui._openPauseMenu === 'function'
      ) {
        try {
          ui._openPauseMenu();
        } catch (error) {
          console.error('[GW] Could not open pause menu:', error);
        }
      }
    });
  }

  // --------------------------------------------------
  // 6. Start the game
  // --------------------------------------------------

  try {
    const game = new Phaser.Game(config);

    window.__GW_GAME__ = game;
    window.__GW_ALLOW_NAVIGATION__ = false;

    const rotatedMobileViewport = window.matchMedia(
      '(orientation: portrait) and (pointer: coarse)'
    );
    function syncRotatedMobileScale() {
      if (!rotatedMobileViewport.matches) {
        return;
      }
      if (!game.scale.parent || !game.scale.canvas) {
        window.requestAnimationFrame(syncRotatedMobileScale);
        return;
      }
      game.scale.parentSize.setSize(
        game.scale.parent.clientWidth,
        game.scale.parent.clientHeight
      );
      game.scale.refresh();
    }
    window.addEventListener('resize', syncRotatedMobileScale);
    window.requestAnimationFrame(syncRotatedMobileScale);

    const gameUrl = window.location.href;

    // Preserve the existing browser navigation guard.
    try {
      window.history.replaceState(
        { gwGameGuard: true },
        '',
        gameUrl
      );

      window.history.pushState(
        { gwGameGuard: true },
        '',
        gameUrl
      );
    } catch (error) {
      console.warn('[GW] History guard unavailable:', error);
    }

    // ------------------------------------------------
    // 7. Handle tab visibility
    // ------------------------------------------------

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        return;
      }

      pauseActiveScenes(game);
    });

    // ------------------------------------------------
    // 8. Save battle state when leaving the page
    // ------------------------------------------------

    window.addEventListener('pagehide', function () {
      game.scene.scenes.forEach(function (scene) {
        if (typeof scene._saveBattleSnapshot === 'function') {
          try {
            scene._saveBattleSnapshot();
          } catch (error) {
            console.error('[GW] Failed to save battle snapshot:', error);
          }
        }
      });
    });

    // ------------------------------------------------
    // 9. Handle browser Back navigation
    // ------------------------------------------------

    window.addEventListener('popstate', function () {
      if (window.__GW_ALLOW_NAVIGATION__) {
        return;
      }

      pauseActiveScenes(game);

      try {
        window.history.pushState(
          { gwGameGuard: true },
          '',
          gameUrl
        );
      } catch (error) {
        console.warn('[GW] Could not restore history guard:', error);
      }
    });

    console.log('[GW] Phaser initialized successfully at 960 × 600.');
  } catch (error) {
    console.error('[GW] Failed to initialize Phaser:', error);

    const status = document.getElementById('loadStatus');

    if (status) {
      status.textContent = 'ERROR: ' + error.message;
    }
  }
})();
