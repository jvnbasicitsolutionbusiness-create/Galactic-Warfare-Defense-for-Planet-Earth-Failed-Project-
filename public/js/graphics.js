/* Persistent runtime graphics settings shared by the menu and Phaser game. */
(function () {
  'use strict';

  const RESOLUTION_ZOOM = { low: 0.75, standard: 0.9, high: 1 };
  const QUALITY_FPS = { performance: 30, balanced: 45, high: 60 };
  const MODEL_RATE = { low: 0.55, balanced: 0.8, high: 1 };
  const DEFAULTS = {
    resolution: 'standard',
    graphicsQuality: 'balanced',
    textureQuality: 'crisp',
    modelQuality: 'high',
  };

  function getSettings() {
    const progression = window.GW && window.GW.progression;
    return Object.assign({}, DEFAULTS, progression && progression.state && progression.state.settings);
  }

  function getModelRate(value) {
    return MODEL_RATE[value] || MODEL_RATE.high;
  }

  function apply() {
    const settings = getSettings();
    const game = window.__GW_GAME__ || (window.GW && window.GW.game);
    document.documentElement.dataset.textureQuality = settings.textureQuality;
    document.documentElement.dataset.pixelArt = String(settings.pixelArt !== false);
    const imageRendering = settings.pixelArt === false || settings.textureQuality === 'smooth' ? 'auto' : 'pixelated';
    document.querySelectorAll('canvas, img').forEach(element => { element.style.imageRendering = imageRendering; });
    if (!game) return;

    if (game.scale && typeof game.scale.setZoom === 'function') {
      game.scale.setZoom(RESOLUTION_ZOOM[settings.resolution] || RESOLUTION_ZOOM.standard);
    }
    if (game.loop) game.loop.targetFps = QUALITY_FPS[settings.graphicsQuality] || QUALITY_FPS.balanced;
    if (game.canvas) {
      game.canvas.style.imageRendering = imageRendering;
    }

    const rate = getModelRate(settings.modelQuality);
    if (game.scene && Array.isArray(game.scene.scenes)) {
      game.scene.scenes.forEach(scene => {
        const entities = [
          ...(scene.combatManager ? scene.combatManager.characters : []),
          ...(scene.combatManager ? scene.combatManager.enemies : []),
        ];
        entities.forEach(entity => {
          if (entity.animator && entity.animator.setQualityMultiplier) {
            entity.animator.setQualityMultiplier(rate);
          }
        });
      });
    }
  }

  function saveSetting(key, value) {
    const progression = window.GW && window.GW.progression;
    if (progression && progression.setSetting) progression.setSetting(key, value);
    else if (progression && progression.state) {
      progression.state.settings[key] = value;
      progression.save();
    }
    apply();
  }

  window.GWGraphics = { defaults: DEFAULTS, getSettings, getModelRate, saveSetting, apply };
})();