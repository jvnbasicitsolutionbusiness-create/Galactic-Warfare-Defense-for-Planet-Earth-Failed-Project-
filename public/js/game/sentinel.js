/**
 * Garden Warfare: Reborn — Defense Sentinel
 *
 * FULL REVISION per spec §§18-21:
 *  - Sentinel is a futuristic military machine positioned at the home side
 *  - On trigger: activates, TRAVELS through the lane clearing alien enemies
 *  - NEVER damages friendly military units (GW.SENTINEL.FRIENDLY_FIRE = false)
 *  - One use per level (no recharge by default)
 *  - Original pixel-art tracked machine design
 *  - Animations: Idle → Activation → Travel → Lane sweep → Complete
 */

/* global GW, Phaser */

GW.DefenseSentinel = class DefenseSentinel {
  /**
   * @param {Phaser.Scene} scene
   * @param {number}       lane     - 1-indexed
   * @param {Function}     onFire   - callback(lane) when sentinel fires
   */
  constructor(scene, lane, onFire) {
    this.scene   = scene;
    this.lane    = lane;
    this.onFire  = onFire;
    this.active  = true;
    this.charged = true;
    this.used    = false;
    this._traveling = false;

    const y = GW.BOARD.TOP_OFFSET + (lane - 0.5) * GW.BOARD.LANE_HEIGHT;
    this.x = GW.BOARD.SENTINEL_X;
    this.y = y;

    this._build();
  }

  _build() {
    this.container = this.scene.add.container(this.x, this.y).setDepth(6);

    // ── Original futuristic military machine ──
    // Design: compact tracked vehicle with energy blade
    const g = this.scene.add.graphics();
    this._drawMachine(g, true); // charged state
    this.machineGfx = g;
    this.container.add(g);

    // Idle pulse (green glow)
    this._idleTween = this.scene.tweens.add({
      targets:  this.container,
      alpha:    0.65,
      duration: 1400,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1,
    });
  }

  _drawMachine(g, charged) {
    g.clear();

    // Shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(2, 18, 38, 8);

    // ── Tracks (bottom) ──
    g.fillStyle(0x374151, 0.95);
    g.fillRoundedRect(-16, 8, 32, 8, 3);
    // Track links
    g.fillStyle(0x4b5563, 0.7);
    for (let i = -14; i <= 12; i += 6) {
      g.fillRect(i, 8, 4, 8);
    }

    // ── Hull body ──
    g.fillStyle(0x1f2937, 1);
    g.fillRoundedRect(-14, -6, 28, 16, 4);
    // Armored plating
    g.fillStyle(0x374151, 0.8);
    g.fillRect(-12, -4, 12, 12);
    g.fillRect(2, -4, 10, 12);

    // ── Energy barrel pointing right ──
    g.fillStyle(0x0891b2, 1);
    g.fillRect(12, -3, 20, 5);
    // Barrel tip glow
    g.fillStyle(charged ? 0x86efac : 0x4b5563, charged ? 0.9 : 0.4);
    g.fillCircle(32, 0, charged ? 5 : 3);

    // ── Antenna / sensor ──
    g.fillStyle(0x6b7280, 1);
    g.fillRect(-2, -12, 3, 7);
    g.fillStyle(charged ? 0x4ade80 : 0xef4444, 1);
    g.fillCircle(-1, -13, 2.5);

    // Military star marking (drawn manually — fillStar doesn't exist in Phaser 3 Graphics)
    g.fillStyle(0xd1fae5, 0.35);
    g.fillRect(-1, -5, 2, 10);   // vertical bar
    g.fillRect(-5, -1, 10, 2);   // horizontal bar

    // ── Warning light (top of hull) ──
    if (charged) {
      g.fillStyle(0x4ade80, 0.7);
      g.fillCircle(6, -8, 3);
    }
  }

  checkTrigger(enemies) {
    if (!this.active || !this.charged || this.used || this._traveling) return;

    for (const en of enemies) {
      if (!en.alive) continue;
      if (en.lane !== this.lane) continue;
      if (en.x <= GW.SENTINEL.TRIGGER_X + 20) {
        this._activate();
        return;
      }
    }
  }

  _activate() {
    if (!this.charged || this._traveling) return;
    this.charged    = false;
    this._traveling = true;

    // Stop idle animation
    if (this._idleTween) { this._idleTween.stop(); this._idleTween = null; }

    // Flash the container
    this.container.setAlpha(1);

    // Camera flash
    this.scene.cameras.main.flash(150, 134, 239, 172, true);

    // Activation warning glow
    const warnGfx = this.scene.add.graphics().setDepth(22);
    warnGfx.fillStyle(0x86efac, 0.4);
    warnGfx.fillRect(0, this.y - GW.BOARD.LANE_HEIGHT / 2, GW.DISPLAY.BASE_WIDTH, GW.BOARD.LANE_HEIGHT);
    this.scene.tweens.add({
      targets: warnGfx, alpha: 0,
      duration: 300, ease: 'Power2',
      onComplete: () => warnGfx.destroy(),
    });

    // Update visual to armed state
    this.machineGfx && this._drawMachine(this.machineGfx, false);

    // Notify
    if (this.onFire) this.onFire(this.lane);

    // Travel through the lane (spec §20: moves through, destroys aliens)
    const TRAVEL_SPEED = GW.SENTINEL.TRAVEL_SPEED; // 480 px/s
    const DEST_X = GW.DISPLAY.BASE_WIDTH + 50;
    const DIST   = DEST_X - this.x;
    const DURATION = (DIST / TRAVEL_SPEED) * 1000;

    // Emit energy trail
    this._startTrail();

    this.scene.tweens.add({
      targets:  this.container,
      x:        DEST_X,
      duration: DURATION,
      ease:     'Linear',
      onUpdate: () => {
        // Damage only ENEMIES in this lane as we pass them
        // (NEVER friendly military units — FRIENDLY_FIRE: false)
        const currentX = this.container.x;
        const allEnemies = this.scene.combatManager
          ? this.scene.combatManager.enemies
          : [];

        allEnemies.forEach(en => {
          if (!en.alive) return;
          if (en.lane !== this.lane) return;
          // Only hit enemies we've reached
          if (Math.abs(en.x - currentX) < 30) {
            en.takeDamage(GW.SENTINEL.DAMAGE);
          }
        });
        // NOTE: We explicitly do NOT call takeDamage on characters/military units
      },
      onComplete: () => {
        this._traveling = false;
        this.used       = true;
        this._stopTrail();
        this.destroy();
      },
    });
  }

  _startTrail() {
    // Energy trail behind the sentinel as it travels
    this._trailTimer = this.scene.time.addEvent({
      delay: 80,
      loop:  true,
      callback: () => {
        if (!this.container) return;
        const cx = this.container.x;
        const cy = this.container.y;
        const trail = this.scene.add.graphics().setDepth(21);
        trail.fillStyle(0x86efac, 0.5);
        trail.fillCircle(cx - 20, cy, 4 + Math.random() * 4);
        this.scene.tweens.add({
          targets: trail, alpha: 0, scaleX: 2.5, scaleY: 2.5,
          duration: 300, ease: 'Power2',
          onComplete: () => trail.destroy(),
        });
      },
    });
  }

  _stopTrail() {
    if (this._trailTimer) {
      this._trailTimer.remove(false);
      this._trailTimer = null;
    }
  }

  _setDepletedVisual() {
    if (!this.container) return;
    this.container.setAlpha(0.3);
  }

  destroy() {
    this.active = false;
    this._stopTrail();
    if (this._idleTween) { this._idleTween.stop(); this._idleTween = null; }
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
  }
};

// ─── Sentinel Manager ─────────────────────────────────────────────────────────
GW.SentinelManager = class SentinelManager {
  constructor(scene) {
    this.scene     = scene;
    this.sentinels = [];
  }

  /** Build one sentinel per lane if the level allows sentinels. */
  build(levelData) {
    const available = levelData.sentinelAvailable !== false && GW.SENTINEL.AVAILABLE;
    if (!available) return;

    for (let lane = 1; lane <= GW.BOARD.LANES; lane++) {
      const sentinel = new GW.DefenseSentinel(
        this.scene,
        lane,
        (firedLane) => {
          console.log(`[Sentinel] Lane ${firedLane} activated — traveling through lane.`);
        }
      );
      this.sentinels.push(sentinel);
    }
  }

  /** Call every frame from GameScene.update(). Pass active enemies array. */
  update(enemies) {
    for (const s of this.sentinels) {
      if (s.active && s.charged && !s.used && !s._traveling) {
        s.checkTrigger(enemies);
      }
    }
    // Prune destroyed sentinels
    for (let i = this.sentinels.length - 1; i >= 0; i--) {
      if (!this.sentinels[i].active) this.sentinels.splice(i, 1);
    }
  }

  destroyAll() {
    this.sentinels.forEach(s => s.destroy());
    this.sentinels = [];
  }
};
