/**
 * Garden Warfare: Reborn — Player State
 * Tracks high-level player state: lives, score, current level, etc.
 * Does NOT hold energy (that lives in ResourceManager).
 */

/* global GW */
GW.PlayerState = class PlayerState {
  constructor() {
    this.reset();
  }

  reset() {
    this.score          = 0;
    this.enemiesDefeated = 0;
    this.isAlive        = true;
    this.levelId        = 1;
  }

  addScore(amount) {
    this.score += amount;
  }

  recordKill() {
    this.enemiesDefeated += 1;
  }

  die() {
    this.isAlive = false;
  }
};
