/**
 * Garden Warfare: Reborn — Level Manager
 * Provides level data and tracks current level state.
 * Level wave definitions live in GW.LEVELS (config.js).
 */

/* global GW */
GW.LevelManager = class LevelManager {
  constructor() {
    this.currentLevelId = 1;
  }

  /** Return the full level data object for the given level id. */
  getLevel(id) {
    const data = GW.LEVELS[id];
    if (!data) throw new Error(`Level ${id} not found in config.`);
    return data;
  }

  /** Return wave array for the current level. */
  getWaves(levelId) {
    return this.getLevel(levelId || this.currentLevelId).waves;
  }

  /** Total number of enemies across all waves in a level. */
  getTotalEnemies(levelId) {
    const waves = this.getWaves(levelId);
    return waves.reduce((sum, w) => sum + w.enemies.length, 0);
  }
};
