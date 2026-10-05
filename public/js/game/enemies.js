/**
 * Chrono-Front: Galactic War — Alien Enemy System
 *
 * SPRITE SYSTEM UPGRADE:
 *  - Enemies now use GW.SpriteRegistry + GW.SpriteAnimator (same as characters)
 *  - vex_drone  → full pixel-art common alien (purple, 3 pink eyes, cranial ridges)
 *  - vex_flag_bearer → full pixel-art pink horde-leader (ears, red flag, gold pole)
 *  - Equipment (cap/helmet/shield) drawn on a separate graphics layer on top
 *  - Walk / attack / hurt / die animation states driven by SpriteAnimator
 *  - Legacy _drawBody() replaced — SpriteRegistry is the single source of truth
 */

/* global GW */

GW.Enemy = class Enemy {
  constructor(scene, def, lane, x, y) {
    this.scene    = scene;
    this.def      = def;
    this.id       = def.id;
    this.name     = def.name;
    this.lane     = lane;
    this.x        = x;
    this.y        = y;

    this.maxHp    = def.hp;
    this.hp       = def.hp;

    this.speed    = def.speed;
    this.spawnDistance = Number(def.spawnDistance ?? GW.ALIEN_APPROACH?.normalizeEnemy(def).spawnDistance ?? 220);
    this.warningTime   = Number(def.warningTime ?? GW.ALIEN_APPROACH?.normalizeEnemy(def).warningTime ?? 1200);
    this.timeToImpact  = Number(def.timeToImpact ?? GW.ALIEN_APPROACH?.normalizeEnemy(def).timeToImpact ?? 0);
    this.effectiveSpeed = Number(def.effectiveSpeed ?? GW.ALIEN_APPROACH?.getEffectiveSpeed(def) ?? this.speed);
    this.damage   = def.damage;          // base damage; scales at low HP
    this.attackCooldown = def.attackCooldown;
    this.reward   = def.reward;
    this.isStealth = def.specialAbility === 'stealth' || def.specialAbility === 'cloak';
    this.revealed = !this.isStealth;
    this.revealTimer = 0;
    this.slowMultiplier = 1;
    this.slowTimer = 0;
    this._footstepTimer = 0;

    // Stick-swing state for vex_drone / stick weapon enemies
    this._stickAngle    = 0;    // current swing angle (radians)
    this._swingDir      = 1;    // +1 forward, -1 return
    this._swingActive   = false;
    this._hitDelivered  = false; // prevent multi-hit per swing
    this._stickGfx      = null; // graphics object for the stick

    // Equipment system (cap/helmet/shield)
    this.equipment     = null;  // current equipment def
    this.equipHp       = 0;     // equipment durability remaining
    this.equipMaxHp    = 0;
    this.equipBroken   = false;
    this.shieldActive  = false; // true if shield-type equipment

    this.alive        = true;
    this.blocked      = false;
    this.attackTarget = null;
    this.attackTimer  = def.attackCooldown;

    // SpriteAnimator (replaces manual walk-frame timer)
    this.animator     = null;
    this._animState   = 'walk';   // current animation state label

    this.container = null;
    this.graphics  = null;
    this.equipGfx  = null;  // separate graphics for equipment (cap/helmet/shield)
    this.hpBar     = null;
    this.hpBarBg   = null;

    this._build();
  }

  // ── Equipment ────────────────────────────────────────────
  applyEquipment(equipDef) {
    if (!equipDef || equipDef.id === 'bare') return;
    this.equipment  = equipDef;
    this.equipHp    = equipDef.extraHp;
    this.equipMaxHp = equipDef.extraHp;
    this.shieldActive = !!equipDef.shieldType;
    if (equipDef.speedMult && equipDef.speedMult !== 1.0) {
      this.speed = Math.round(this.def.speed * equipDef.speedMult);
    }
    // Equipment is drawn on the equipGfx layer — redraw it
    if (this.equipGfx) this._drawEquipment(this.equipGfx);
    // If using legacy path, also redraw body
    if (!this.animator && this.graphics) this._drawBody(this.graphics, 0);
  }

  // ── Visual ────────────────────────────────────────────────
  _build() {
    this.container = this.scene.add.container(this.x, this.y);
    this.container.setDepth(15);
    if (this.def.isBoss) {
      this.container.setScale(2.2);
      const aura = this.scene.add.graphics();
      aura.lineStyle(3, this.def.eyeColor || 0xa78bfa, 0.7);
      aura.strokeCircle(0, -5, 46);
      aura.lineStyle(1.5, this.def.accentColor || 0xc4b5fd, 0.45);
      aura.strokeCircle(0, -5, 56);
      this.container.add(aura);
      this.scene.tweens.add({
        targets: aura, alpha: 0.2, scaleX: 1.2, scaleY: 1.2,
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    }
    if (this.isStealth) this.container.setAlpha(0.2);

    // ── Main enemy graphics — driven by SpriteRegistry ───
    const g = this.scene.add.graphics();
    this.graphics = g;
    this.container.add(g);

    // Use SpriteRegistry draw function if registered, otherwise fall back
    if (window.GW && GW.SpriteRegistry) {
      const drawFn = GW.SpriteRegistry.getEnemyDraw(this.id);
      if (drawFn) {
        this.animator = new GW.SpriteAnimator(this.scene, g, drawFn, this.def);
        this.animator.play('walk');   // enemies start walking in immediately
      } else {
        this._drawBody(g, 0);
      }
    } else {
      this._drawBody(g, 0);
    }

    // Equipment graphics (drawn on top of body)
    const eg = this.scene.add.graphics();
    this.equipGfx = eg;
    this.container.add(eg);
    if (this.equipment && !this.equipBroken) {
      this._drawEquipment(eg);
    }

    // HP bar background
    this.hpBarBg = this.scene.add.graphics();
    this.hpBarBg.fillStyle(0x1a0a2e, 0.85);
    this.hpBarBg.fillRect(-22, -58, 44, 6);
    this.container.add(this.hpBarBg);

    // HP bar fill
    this.hpBar = this.scene.add.graphics();
    this.container.add(this.hpBar);
    this._updateHpBar();

    // ── Stick weapon graphics (for vex_drone and stick-type enemies) ────────
    if (this.def.weaponType === 'stick') {
      this._stickGfx = this.scene.add.graphics();
      this._stickGfx.setDepth(16);
      this.container.add(this._stickGfx);
      this._drawStick(0); // initial resting position
    }
  }

  /**
   * Legacy fallback draw — only used if SpriteRegistry has no entry for this enemy id.
   * The SpriteRegistry draw functions (sprites.js) are the primary rendering path.
   */
  _drawBody(g, frame) {
    g.clear();
    const c  = this.def.color       || 0x4c3b7a;
    const ac = this.def.accentColor || 0x7c6ab5;
    const ec = this.def.eyeColor    || 0xe879f9;
    const bob = Math.sin((frame || 0) * 0.8) * 2.5;

    g.fillStyle(0x000000, 0.22); g.fillEllipse(0, 35, 44, 10);

    const lk = ((frame || 0) < 4) ? 2 : -2;
    const rk = ((frame || 0) < 4) ? -2 : 2;
    g.fillStyle(c, 0.95);
    g.fillRect(-10, 12 + bob, 8, 14 + lk); g.fillRect(-12, 24 + bob + lk, 10, 12);
    g.fillStyle(ac, 0.8); g.fillRoundedRect(-14, 34 + bob, 12, 5, 2);
    g.fillStyle(c, 0.95);
    g.fillRect(2, 12 + bob, 8, 14 + rk); g.fillRect(2, 24 + bob + rk, 10, 12);
    g.fillStyle(ac, 0.8); g.fillRoundedRect(2, 34 + bob, 12, 5, 2);

    g.fillStyle(c, 1); g.fillEllipse(0, 2 + bob, 34, 28);
    g.fillStyle(c, 0.9);
    g.fillRect(-22, 0 + bob, 14, 7); g.fillCircle(-22, 3 + bob, 4);
    g.fillRect(8, 0 + bob, 14, 7);   g.fillCircle(22, 3 + bob, 4);
    g.fillStyle(c, 0.9); g.fillEllipse(0, -8 + bob, 18, 14);
    g.fillStyle(c, 1); g.fillRoundedRect(-17, -30 + bob, 34, 24, 6);
    g.fillStyle(ac, 0.85);
    for (let i = -8; i <= 8; i += 4) g.fillTriangle(i, -30 + bob, i - 3, -38 + bob, i + 3, -38 + bob);
    g.fillStyle(ec, 1);
    g.fillCircle(-8, -20 + bob, 5); g.fillCircle(0, -22 + bob, 3.5); g.fillCircle(8, -20 + bob, 5);
    g.lineStyle(1.5, ec, 0.4);
    g.strokeCircle(-8, -20 + bob, 7); g.strokeCircle(8, -20 + bob, 7);
    g.fillStyle(0x0a0015, 0.9); g.fillRect(-7, -10 + bob, 14, 3);
    g.fillStyle(ec, 0.3); g.fillCircle(0, 4 + bob, 9);
    g.fillStyle(ec, 0.8); g.fillCircle(0, 4 + bob, 5);
  }

  _drawEquipment(g) {
    g.clear();
    if (!this.equipment || this.equipBroken) return;
    const eq = this.equipment;

    // Equipment Y offset matches body bob — use frame 0 position
    const bob = 0;

    if (eq.id === 'cap') {
      // Stolen cap — blue cap on head
      g.fillStyle(eq.equipColor, 0.9);
      g.fillRoundedRect(-18, -36 + bob, 36, 10, 4);
      g.fillStyle(eq.equipColor, 0.7);
      g.fillRect(-22, -30 + bob, 44, 4);
      // Cap logo
      g.fillStyle(0xfbbf24, 0.8);
      g.fillRect(-4, -34 + bob, 8, 6);

    } else if (eq.id === 'iron_mask') {
      g.fillStyle(eq.equipColor, 0.95);
      g.fillRoundedRect(-13, -24 + bob, 26, 16, 4);
      g.fillStyle(0x111827, 0.9);
      g.fillRect(-9, -19 + bob, 5, 3); g.fillRect(4, -19 + bob, 5, 3);
      g.lineStyle(2, 0x9ca3af, 0.9);
      g.lineBetween(-6, -12 + bob, 6, -12 + bob);

    } else if (eq.id === 'helmet' || eq.id === 'steel_helmet' || eq.id === 'heavy_helmet') {
      // Metal helmet — grey military helmet
      g.fillStyle(eq.equipColor, 0.95);
      g.fillRoundedRect(-19, -38 + bob, 38, 14, 6);
      // Helmet rim
      g.fillStyle(0x4b5563, 0.85);
      g.fillRect(-22, -26 + bob, 44, 5);
      // Helmet markings
      g.lineStyle(1, 0x9ca3af, 0.6);
      g.lineBetween(-6, -36 + bob, -6, -26 + bob);
      g.lineBetween(6, -36 + bob, 6, -26 + bob);

    } else if (eq.id === 'armored_vest' || eq.id === 'full_armor' || eq.id === 'tactical_armor') {
      g.fillStyle(eq.equipColor, 0.95);
      g.fillRoundedRect(-17, -10 + bob, 34, 24, 5);
      g.lineStyle(2, 0x9ca3af, 0.75);
      g.lineBetween(-10, -5 + bob, 10, -5 + bob);
      g.lineBetween(-10, 2 + bob, 10, 2 + bob);

    } else if (eq.id === 'wooden_shield') {
      g.fillStyle(eq.equipColor, 0.95);
      g.fillRoundedRect(-34, -28 + bob, 20, 42, 5);
      g.lineStyle(2, 0xfbbf24, 0.9);
      g.strokeRoundedRect(-34, -28 + bob, 20, 42, 5);
      g.lineBetween(-30, -8 + bob, -18, -8 + bob);

    } else if (eq.id === 'bicycle') {
      g.lineStyle(3, eq.equipColor, 0.95);
      g.strokeCircle(-17, 22 + bob, 10); g.strokeCircle(18, 22 + bob, 10);
      g.lineBetween(-17, 22 + bob, -4, 7 + bob);
      g.lineBetween(-4, 7 + bob, 7, 22 + bob);
      g.lineBetween(7, 22 + bob, -17, 22 + bob);
      g.lineBetween(-4, 7 + bob, 18, 22 + bob);

    } else if (eq.id === 'newspaper') {
      g.fillStyle(eq.equipColor, 0.95);
      g.fillRect(-13, -28 + bob, 26, 38);
      g.lineStyle(1, 0x6b7280, 0.9);
      g.lineBetween(-9, -22 + bob, 9, -22 + bob);
      g.lineBetween(-9, -16 + bob, 9, -16 + bob);
      g.lineBetween(-9, -10 + bob, 9, -10 + bob);

    } else if (eq.id === 'museum_armor') {
      g.fillStyle(eq.equipColor, 0.95);
      g.fillRoundedRect(-19, -38 + bob, 38, 16, 5);
      g.fillRoundedRect(-22, -14 + bob, 44, 26, 5);
      g.lineStyle(2, 0xd6d3d1, 0.9);
      g.lineBetween(0, -36 + bob, 0, 10 + bob);

    } else if (eq.id === 'shield' || eq.id === 'riot_shield') {
      // Stolen shield — renders IN FRONT (higher x, left side of alien)
      g.fillStyle(eq.equipColor, 0.85);
      // Shield shape (tall rectangle with rounded top)
      g.fillRoundedRect(-32, -28 + bob, 18, 40, 4);
      // Shield border
      g.lineStyle(2, 0x7dd3fc, 0.8);
      g.strokeRoundedRect(-32, -28 + bob, 18, 40, 4);
      // Shield emblem
      g.fillStyle(0x7dd3fc, 0.5);
      g.fillCircle(-23, -8 + bob, 6);
      // Damage cracks based on remaining HP
      if (this.equipHp < this.equipMaxHp * 0.5) {
        g.lineStyle(1, 0xfbbf24, 0.6);
        g.lineBetween(-30, -24 + bob, -24, -10 + bob);
        g.lineBetween(-26, -14 + bob, -20, -4 + bob);
      }
    }
  }

  _updateHpBar() {
    this.hpBar.clear();

    // If shield is active, show shield HP in blue, body HP in purple
    if (this.shieldActive && !this.equipBroken && this.equipHp > 0) {
      // Shield bar (blue, extends further)
      const shieldRatio = Math.max(0, this.equipHp / this.equipMaxHp);
      this.hpBar.fillStyle(0x3b82f6, 1);
      this.hpBar.fillRect(-22, -54, 44 * shieldRatio, 6);
      // Small body HP indicator below
      const bodyRatio = Math.max(0, this.hp / this.maxHp);
      this.hpBar.fillStyle(0xa78bfa, 0.7);
      this.hpBar.fillRect(-22, -47, 44 * bodyRatio, 3);
    } else {
      // Normal HP bar
      const totalHp  = this.maxHp + (this.equipBroken ? 0 : this.equipHp);
      const totalMax = this.maxHp + (this.equipment ? this.equipment.extraHp : 0);
      const ratio    = Math.max(0, (this.hp + (this.equipBroken ? 0 : this.equipHp)) / Math.max(1, totalMax));
      const col      = ratio > 0.5 ? 0xa78bfa : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
      this.hpBar.fillStyle(col, 1);
      this.hpBar.fillRect(-22, -54, 44 * ratio, 6);
    }
  }

  // ── Game Logic ────────────────────────────────────────────
  update(delta, characters) {
    if (!this.alive) return null;

    if (this.revealTimer > 0 && (this.revealTimer -= delta) <= 0) {
      this.revealed = false;
      if (this.isStealth && this.container) this.container.setAlpha(0.2);
    }
    if (this.slowTimer > 0 && (this.slowTimer -= delta) <= 0) this.slowMultiplier = 1;

    const blocker = this._findBlocker(characters);

    if (blocker) {
      this.blocked      = true;
      this.attackTarget = blocker;
      this.attackTimer -= delta;

      // Switch to attack animation while blocked
      if (this.animator && this._animState !== 'attack') {
        this._animState = 'attack';
        this.animator.play('attack', 8);
      }

      // ── Stick-swing attack ──────────────────────────────
      if (this.def.weaponType === 'stick') {
        if (this.attackTimer <= 0) {
          this.attackTimer = this.attackCooldown;
          this._startStickSwing(blocker);
        }
        // Animate swing while active
        if (this._swingActive) {
          this._updateStickSwing(delta, blocker);
        }
        return null; // damage handled inside swing, not here
      }

      // Default (non-stick) attack
      if (this.attackTimer <= 0) {
        this.attackTimer = this.attackCooldown;
        return { attack: true, target: blocker };
      }
    } else {
      this.blocked      = false;
      this.attackTarget = null;
      this.attackTimer  = Math.max(0, this.attackTimer - delta);

      // Return stick to rest when not attacking
      if (this.def.weaponType === 'stick' && !this._swingActive) {
        this._drawStick(0);
      }

      // Switch to walk animation while moving
      if (this.animator && this._animState !== 'walk') {
        this._animState = 'walk';
        this.animator.play('walk', 7);
      }
      // Legacy fallback: manual walk frame redraw
      if (!this.animator && this.graphics) {
        this._walkTimer = (this._walkTimer || 0) + delta;
        if (this._walkTimer >= 1000 / 8) {
          this._walkTimer -= 1000 / 8;
          this._walkFrame = ((this._walkFrame || 0) + 1) % 8;
          this._drawBody(this.graphics, this._walkFrame);
        }
      }

      const speedScale = GW.ALIEN_APPROACH && GW.ALIEN_APPROACH.MOVE_SCALE ? GW.ALIEN_APPROACH.MOVE_SCALE : 1;
      const moveAmt = ((this.speed * speedScale) * this.slowMultiplier * delta) / 1000;
      this.effectiveSpeed = (this.speed * speedScale) * this.slowMultiplier;
      this._footstepTimer -= delta;
      if (this._footstepTimer <= 0) {
        this._footstepTimer = 1200 + Math.random() * 400;
        if (window.GWAudio) window.GWAudio.play('alien-step');
      }
      this.x -= moveAmt;
      this.container.x = this.x;
    }

    return null;
  }

  // ── Stick weapon drawing ──────────────────────────────────
  // Draws on the right arm of the alien (right side = toward the target/home base).
  // angle: radians — 0 = resting at side, positive swings left (toward target)
  _drawStick(angle) {
    if (!this._stickGfx) return;
    const g     = this._stickGfx;
    // v1.0.1: light-purple colour, right-arm pivot
    const color = 0xc4b5fd;  // light purple (as seen in sprite reference)
    const len   = 28;
    // Pivot at the alien's RIGHT hand position (right side, mid-body)
    const pivX = 18;
    const pivY = 5;
    // Swing toward the left (toward home base / target)
    // angle=0 → stick points right (resting); positive angle → swings left
    const endX = pivX + Math.cos(Math.PI - angle) * len;
    const endY = pivY + Math.sin(Math.PI - angle) * len;

    g.clear();
    // Stick shadow
    g.lineStyle(4, 0x3b0764, 0.35);
    g.beginPath(); g.moveTo(pivX + 1, pivY + 2); g.lineTo(endX + 1, endY + 2); g.strokePath();
    // Stick body — light purple
    g.lineStyle(4, color, 1);
    g.beginPath(); g.moveTo(pivX, pivY); g.lineTo(endX, endY); g.strokePath();
    // Bright tip
    g.fillStyle(0xf0abfc, 0.95);  // even lighter pink-purple tip
    g.fillCircle(endX, endY, 4);
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(endX, endY, 2);
  }

  _startStickSwing(target) {
    if (this._swingActive) return;
    this._swingActive  = true;
    this._swingDir     = 1;
    this._stickAngle   = 0;
    this._hitDelivered = false;
    this._swingTarget  = target;
  }

  _updateStickSwing(delta, blocker) {
    const SWING_SPEED = 6.5; // radians per second
    const MAX_ANGLE   = Math.PI * 0.75; // ~135° forward swing
    const dt          = delta / 1000;

    this._stickAngle += SWING_SPEED * this._swingDir * dt;

    if (this._swingDir === 1 && this._stickAngle >= MAX_ANGLE) {
      this._stickAngle = MAX_ANGLE;
      this._swingDir   = -1; // start returning

      // Hit moment: deliver damage at peak of swing
      if (!this._hitDelivered && blocker && blocker.alive) {
        const dmg = this._calcScaledDamage();
        if (window.GWAudio) window.GWAudio.play(this.def.attackSound || 'alien-melee');
        blocker.takeDamage(dmg);
        this._hitDelivered = true;
        // Impact flash on stick tip
        this._spawnStickHitFx();
      }
    } else if (this._swingDir === -1 && this._stickAngle <= 0) {
      this._stickAngle = 0;
      this._swingActive = false; // swing complete
    }

    this._drawStick(this._stickAngle);
  }

  /** Base 20 damage; scales +30–50% as HP drops toward 0. */
  _calcScaledDamage() {
    const base     = this.def.damage || 20;
    const hpRatio  = Math.max(0, Math.min(1, this.hp / this.maxHp));
    // At full HP: 0% bonus. At 0 HP: 50% bonus. Linear interpolation.
    const bonus    = (1 - hpRatio) * 0.50;            // 0 → 0.50
    const clampedBonus = Math.min(0.50, Math.max(0, bonus)); // cap at 50%
    return Math.round(base * (1 + clampedBonus));
  }

  _spawnStickHitFx() {
    const scene = this.scene;
    // Purple spark at the alien's RIGHT arm tip (toward the target)
    const fx = scene.add.graphics().setDepth(25);
    fx.fillStyle(0xf0abfc, 0.9);
    fx.fillCircle(this.x + 28, this.y + 5, 8);
    scene.tweens.add({
      targets: fx, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 180,
      ease: 'Power2', onComplete: () => fx.destroy(),
    });
  }

  _findBlocker(characters) {
    const THRESHOLD = 52;
    let blocker = null;
    let closestDist = Infinity;
    for (const ch of characters) {
      if (!ch.alive || ch.isStealthed) continue;
      if (ch.lane !== this.lane) continue;
      const dist = this.x - ch.x;
      if (dist >= 0 && dist <= THRESHOLD && dist < closestDist) {
        closestDist = dist;
        blocker = ch;
      }
    }
    return blocker;
  }

  revealFor(duration) {
    this.revealed = true;
    this.revealTimer = Math.max(this.revealTimer, duration);
    if (this.container) this.container.setAlpha(1);
  }

  applySlow(multiplier, duration) {
    this.slowMultiplier = Math.min(this.slowMultiplier, multiplier);
    this.slowTimer = Math.max(this.slowTimer, duration);
  }

  takeDamage(amount) {
    if (!this.alive) return;

    // Damage hits shield first
    if (this.shieldActive && !this.equipBroken && this.equipHp > 0) {
      this.equipHp -= amount;
      if (this.equipHp <= 0) {
        this.equipHp   = 0;
        this.equipBroken = true;
        this.shieldActive = false;
        this._breakEquipment();
      }
    } else if (this.equipment && !this.equipBroken && this.equipHp > 0) {
      // Cap/helmet — damage goes to equip first
      this.equipHp -= amount;
      if (this.equipHp <= 0) {
        this.equipHp = 0;
        this.equipBroken = true;
        this._breakEquipment();
      }
    } else {
      // Direct body damage
      this.hp -= amount;
    }

    this._updateHpBar();
    this._flashDamage();
    if (this.hp <= 0) this.die();
  }

  _breakEquipment() {
    // Apply speed change if equipment specifies speedAfterBreak
    if (this.equipment && this.equipment.speedAfterBreak) {
      this.speed = Math.round(this.def.speed * this.equipment.speedAfterBreak);
    }
    // Visual break effect
    if (this.equipGfx) this.equipGfx.clear();

    // Small particle burst at head position
    const burst = this.scene.add.graphics().setDepth(25);
    const color = this.equipment ? (this.equipment.equipColor || 0x9ca3af) : 0x9ca3af;
    burst.fillStyle(color, 0.9);
    burst.fillRect(-4, -32, 8, 6);
    this.scene.tweens.add({
      targets: burst,
      x: burst.x + (Math.random() - 0.5) * 30,
      y: burst.y - 20,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 400,
      ease: 'Power2',
      onComplete: () => burst.destroy(),
    });

    // Redraw without equipment (animator continues; equipment layer is cleared above)
    if (!this.animator && this.graphics) this._drawBody(this.graphics, 0);
    this._updateHpBar();
  }

  _flashDamage() {
    // Trigger hurt animation state
    if (this.animator) {
      if (this._animState !== 'hurt') {
        this._animState = 'hurt';
        this.animator.play('hurt', 10);
        // Return to walk/attack after 180ms
        this.scene.time.delayedCall(180, () => {
          if (this.animator && this.alive) {
            this._animState = this.blocked ? 'attack' : 'walk';
            this.animator.play(this._animState, this.blocked ? 8 : 7);
          }
        });
      }
    } else {
      // Legacy flash
      this.container.setAlpha(0.3);
      this.scene.time.delayedCall(GW.COMBAT.DAMAGE_FLASH_MS, () => {
        if (this.container && this.alive) this.container.setAlpha(1);
      });
    }
  }

  die() {
    this.alive        = false;
    this.attackTarget = null;
    this._tryDropCurrency();

    // Play death animation then fade out
    if (this.animator) {
      this._animState = 'die';
      this.animator.play('die', 6);
    }

    this.scene.tweens.add({
      targets:  this.container,
      alpha:    0,
      y:        this.container.y - 18,
      scaleX:   0.5,
      scaleY:   0.5,
      duration: 380,
      delay:    80,
      ease:     'Power2',
      onComplete: () => this.destroy(),
    });
  }

  _tryDropCurrency() {
    if (!GW.CURRENCY || !this.scene) return;
    if (!this.scene.currencyManager) return;
    let roll = Math.random();
    for (const [id, chance] of Object.entries(GW.CURRENCY.DROP_CHANCES)) {
      if (roll < chance && GW.CURRENCY.TYPES[id]) {
        this.scene.currencyManager.spawnDrop(this.x, this.y, GW.CURRENCY.TYPES[id]);
        return;
      }
      roll -= chance;
    }
  }

  destroy() {
    if (this.animator) { this.animator.destroy(); this.animator = null; }
    if (this._stickGfx) { this._stickGfx.destroy(); this._stickGfx = null; }
    if (this.container) {
      this.container.destroy(true);
      this.container = null;
    }
  }

  reachedHome() {
    return this.x <= GW.BOARD.HOME_X;
  }
};

// ─── Enemy Factory ────────────────────────────────────────────────────────────
GW.EnemyFactory = class EnemyFactory {
  static create(scene, defId, lane, options = {}) {
    const def = GW.ENEMIES[defId];
    if (!def) {
      console.warn('[EnemyFactory] Unknown enemy:', defId);
      return null;
    }
    const laneNumber = Number.isInteger(lane) ? lane : GW.LANE_PRESSURE ? GW.LANE_PRESSURE.pickLane(options.waveDef || {}, lane || 1) : 1;
    const approach = GW.ALIEN_APPROACH ? GW.ALIEN_APPROACH.normalizeEnemy({ ...def, ...options }) : { spawnDistance: 220, warningTime: 1200 };
    const effectiveDistance = Number(options.spawnDistance ?? def.spawnDistance ?? approach.spawnDistance ?? 220);
    const y = GW.BOARD.TOP_OFFSET + (laneNumber - 0.5) * GW.BOARD.LANE_HEIGHT;
    const x = GW.BOARD.ENEMY_SPAWN_X + effectiveDistance;
    const enemy = new GW.Enemy(scene, { ...def, ...approach, spawnDistance: effectiveDistance, warningTime: Number(options.warningTime ?? def.warningTime ?? approach.warningTime ?? 1200) }, laneNumber, x, y);
    enemy.spawnDistance = effectiveDistance;
    enemy.warningTime = Number(options.warningTime ?? def.warningTime ?? approach.warningTime ?? 1200);
    enemy.timeToImpact = Number(options.timeToImpact ?? def.timeToImpact ?? GW.ALIEN_APPROACH?.getTimeToImpact({ ...def, spawnDistance: effectiveDistance }, effectiveDistance) ?? 0);
    return enemy;
  }
};
