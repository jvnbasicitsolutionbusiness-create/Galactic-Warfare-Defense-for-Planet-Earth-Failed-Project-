/**
 * Garden Warfare: Reborn — Human Defender System
 *
 * BATTLEFIELD REVISION:
 *  - Uses GW.CARDS (aliased via GW.CHARACTERS for compat)
 *  - P.E. Regen: randomized interval from GW.RESOURCES
 *  - Fire-Lance Gunner: first combat unit (10 dmg, 2800ms, 280 range)
 *  - Integrates SpriteRegistry animated drawing
 *  - Supports all card roles
 */

/* global GW */

GW.Character = class Character {
  constructor(scene, def, lane, cellIndex, x, y) {
    this.scene     = scene;
    this.def       = def;
    this.id        = def.id;
    this.name      = def.name;
    this.lane      = lane;
    this.cellIndex = cellIndex;
    this.x         = x;
    this.y         = y;
    this.role      = def.role || 'offense';

    this.maxHp = def.hp;
    this.hp    = def.hp;
    this.alive = true;
    this.target = null;

    // Combat stats from weapon def OR card def
    const isEnergyUnit = def.role === 'energy' || def.isEnergyGenerator;
    this.isEnergyUnit = isEnergyUnit;

    if (isEnergyUnit) {
      this.damage      = 0;
      this.attackSpeed = 0;
      this.range       = 0;
      this.projColor   = 0;
      this.projSize    = 0;
      this.isSupport   = true;
      // Use the configured midpoint as the initial generator interval.
      this.genInterval = def.genInterval || GW.RESOURCES.REGEN_UNIT_INTERVAL;
      this.genAmount   = def.genAmount   || GW.RESOURCES.REGEN_UNIT_AMOUNT;
      this.genTimer    = this.genInterval;  // start at full interval — no instant generation
    } else {
      const wpn = (def.weapon && GW.WEAPONS) ? GW.WEAPONS[def.weapon] : null;
      this.damage      = def.damage      == null ? ((wpn && wpn.damage) || 10) : def.damage;
      this.attackSpeed = def.attackSpeed || (wpn && wpn.attackSpeed) || 2800;
      this.range       = def.range       || (wpn && wpn.range) || 280;
      this.projColor   = (wpn && wpn.projectileColor)  || 0xff6b00;
      this.projSize    = (wpn && wpn.projectileSize)   || 5;
      this.projectileSpeed = def.projectileSpeed || (wpn && wpn.projectileSpeed) || GW.COMBAT.PROJECTILE_SPEED;
      this.isSupport   = !!def.isSupport && !def.weapon;
    }
    this._baseAttackSpeed = this.attackSpeed;
    this.attackSpeedMultiplier = 1;
    this.attackSpeedBuffTimer = 0;
    this.shieldHp = 0;
    this.shieldTimer = 0;
    this.genRateMultiplier = 1;
    this.genBoostTimer = 0;
    this.isStealthed = false;
    this.stealthTimer = 0;
    this.abilityRule = GW.CARD_ABILITY_RULES && GW.CARD_ABILITY_RULES[def.specialAbility];
    this.abilityTimer = this.abilityRule ? Math.min(1500, this.abilityRule.cooldown) : 0;
    this.bombFuseTimer = def.isSuicideUnit ? (def.fuseDuration || 2500) : 0;

    this._prefireCuePlayed = false;
    this.attackTimer = def.weapon === 'fire_lance' ? 500 : 0;
    this.container   = null;
    this.graphics    = null;
    this.animator    = null;
    this.onGenerateEnergy = null;

    this._build();
    if (this.container) this.container.setScale(this.isEnergyUnit ? 0.7 : 0.76);
  }

  _build() {
    this.container = this.scene.add.container(this.x, this.y).setDepth(10);

    if (this.def.isSuicideUnit) {
      const warning = this.scene.add.graphics();
      warning.lineStyle(2, 0xef4444, 0.9);
      warning.strokeCircle(0, -8, 30);
      warning.setAlpha(0.35);
      this.container.add(warning);
      this.scene.tweens.add({
        targets: warning, alpha: 0.95, scaleX: 1.2, scaleY: 1.2,
        duration: 300, yoyo: true, repeat: 3,
      });
    }

    const g = this.scene.add.graphics();
    this.graphics = g;
    this.container.add(g);

    // Use SpriteRegistry if available
    if (window.GW && GW.SpriteRegistry) {
      const drawFn = this.isSupport
        ? GW.SpriteRegistry.getCharDraw(this.id)
        : GW.SpriteRegistry.getCharDraw(this.id);
      if (drawFn) {
        this.animator = new GW.SpriteAnimator(this.scene, g, drawFn, this.def);
        this.animator.play('idle');
      } else {
        this._drawFallback(g);
      }
    } else {
      this._drawFallback(g);
    }

    // HP bar bg
    const hpBg = this.scene.add.graphics();
    hpBg.fillStyle(0x1a1a1a, 0.85);
    hpBg.fillRect(-20, -52, 40, 5);
    this.container.add(hpBg);

    this.hpBar = this.scene.add.graphics();
    this.container.add(this.hpBar);
    this._updateHpBar();

    // Name label
    this.label = this.scene.add.text(0, -62, this.name, {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '7px',
      color:      GW.UI_COLORS ? GW.UI_COLORS.TEXT_DIM : '#7a9e6a',
      align:      'center',
    }).setOrigin(0.5, 0);
    this.container.add(this.label);
  }

  _drawFallback(g) {
    g.clear();
    const c = this.def.color || 0x4d7c0f;
    if (this.isEnergyUnit) {
      // Generator device
      g.fillStyle(c, 0.9); g.fillRoundedRect(-7, -18, 14, 32, 3);
      g.fillStyle(this.def.accentColor || 0xfef3c7, 0.8); g.fillCircle(0, -22, 8);
      g.fillStyle(0xa78bfa, 0.7); g.fillCircle(0, -22, 5);
    } else if (this.def.isSuicideUnit) {
      // Bomber — soldier holding a large bomb (almost as big as the head)
      // Body
      g.fillStyle(c, 1); g.fillRoundedRect(-12, -12, 24, 22, 3);
      // Skin / face
      g.fillStyle(this.def.skinColor || 0xd4956a, 1); g.fillRoundedRect(-8, -24, 16, 14, 4);
      // Helmet
      g.fillStyle(this.def.helmetColor || 0x450a0a, 1); g.fillRoundedRect(-9, -28, 18, 10, 4);
      // Bomb body — large dark sphere held out in front
      g.fillStyle(0x1f2937, 1); g.fillCircle(14, -10, 9);
      // Bomb sheen
      g.fillStyle(0x4b5563, 0.6); g.fillCircle(11, -14, 3.5);
      // Fuse line
      g.lineStyle(1.5, 0x78350f, 1);
      g.beginPath(); g.moveTo(14, -19); g.lineTo(17, -26); g.strokePath();
      // Spark at fuse tip
      g.fillStyle(0xfbbf24, 1); g.fillCircle(17, -27, 2.5);
      g.fillStyle(0xef4444, 0.8); g.fillCircle(17, -27, 1.5);
    } else if (this.isSupport) {
      g.fillStyle(c, 1); g.fillRoundedRect(-12, -12, 24, 22, 3);
      g.fillStyle(this.def.skinColor || 0xd4956a, 1); g.fillRoundedRect(-8, -24, 16, 14, 4);
      g.fillStyle(this.def.helmetColor || 0x3d2008, 1); g.fillRoundedRect(-9, -28, 18, 10, 4);
      if (['heal_nearby', 'rapid_repair', 'neutralize_radiation'].includes(this.def.specialAbility)) {
        g.fillStyle(0xf8fafc, 1); g.fillRect(-2, -9, 5, 13); g.fillRect(-6, -5, 13, 5);
      } else if (['energy_shield', 'plasma_barrier', 'multi_buff'].includes(this.def.specialAbility)) {
        g.fillStyle(this.def.accentColor || 0x38bdf8, 0.9);
        g.fillTriangle(16, -17, 27, -12, 24, 2); g.fillTriangle(24, 2, 16, 7, 13, -12);
      } else {
        g.lineStyle(2, this.def.accentColor || 0x67e8f9, 0.9);
        g.strokeCircle(20, -5, 8); g.lineBetween(12, -5, 28, -5); g.lineBetween(20, -13, 20, 3);
      }
    } else {
      // Soldier — generic soldier with gun
      g.fillStyle(this.def.skinColor || 0xd4956a, 1); g.fillRoundedRect(-8, -24, 16, 14, 4);
      g.fillStyle(this.def.helmetColor || 0x3d2008, 1); g.fillRoundedRect(-9, -28, 18, 10, 4);
      g.fillStyle(0x374151, 1); g.fillRect(10, -8, 14, 4);
    }
  }

  _updateHpBar() {
    if (!this.hpBar) return;
    this.hpBar.clear();
    const ratio = Math.max(0, this.hp / this.maxHp);
    const col   = ratio > 0.5 ? 0x4ade80 : ratio > 0.25 ? 0xfbbf24 : 0xef4444;
    this.hpBar.fillStyle(col, 1);
    this.hpBar.fillRect(-20, -52, 40 * ratio, 5);
  }

  update(delta, enemies, characters) {
    if (!this.alive) return null;

    if (this.def.isSuicideUnit) {
      this.bombFuseTimer -= delta;
      return this.bombFuseTimer <= 0
        ? {
            explode: true,
            damage: this.def.damage,
            range: this.def.range,
            lane: this.lane,
            laneRadius: this.def.laneRadius == null ? 1 : this.def.laneRadius,
          }
        : null;
    }

      this._updateTemporaryEffects(delta);
      this._updateCardAbility(delta, enemies, characters || []);

      if (this.isEnergyUnit) {
      // The global range keeps every generator on the same 8–12 s cadence.
      // The timer counts DOWN; when it hits zero we begin the charge phase.
      const genMultiplier = this.genRateMultiplier || 1;
      const genMin = ((GW.RESOURCES && GW.RESOURCES.REGEN_UNIT_INTERVAL_MIN) || 20000) / genMultiplier;
      const genMax = ((GW.RESOURCES && GW.RESOURCES.REGEN_UNIT_INTERVAL_MAX) || 25000) / genMultiplier;

      this.genTimer -= delta;

      // ── Charge-phase visual (last 1 500 ms before production) ──────────────
      // A brightening orbital ring pulses as the generator "charges up".
      // We only start this once per cycle, keyed by _chargeStarted flag.
      if (this.genTimer <= 1500 && !this._chargeStarted) {
        this._chargeStarted = true;
        const charge = this.scene.add.graphics().setDepth(13);
        charge.lineStyle(2, 0x22d3ee, 0.6);
        charge.strokeCircle(this.x, this.y - 18, 12);
        charge.x = 0; charge.y = 0;
        // Spiral inward — shrinks from 1.4× to 1× then fades
        this.scene.tweens.add({
          targets: charge, scaleX: 0.6, scaleY: 0.6,
          duration: 1400, ease: 'Sine.easeIn',
        });
        this.scene.tweens.add({
          targets: charge, alpha: 0,
          delay: 1000, duration: 500, ease: 'Power1',
          onComplete: () => charge.destroy(),
        });
      }

      if (this.genTimer <= 0) {
        // Reset timer with fresh randomised interval BEFORE spawning the orb
        this.genTimer = genMin + Math.floor(Math.random() * (genMax - genMin + 1));
        this._chargeStarted = false;   // allow charge ring next cycle

        // ── Production animation ────────────────────────────────────────
        // Bright white flash at the orb housing
        const flash = this.scene.add.graphics().setDepth(14);
        flash.fillStyle(0xfef3c7, 0.95);
        flash.fillCircle(this.x, this.y - 18, 10);
        this.scene.tweens.add({
          targets: flash, scaleX: 2.6, scaleY: 2.6, alpha: 0,
          duration: 320, ease: 'Power3',
          onComplete: () => flash.destroy(),
        });

        // Outward rings — gold then amber
        const ring1 = this.scene.add.graphics().setDepth(13);
        ring1.lineStyle(2.5, 0xfbbf24, 0.9);
        ring1.strokeCircle(this.x, this.y - 18, 8);
        this.scene.tweens.add({
          targets: ring1, scaleX: 3.2, scaleY: 3.2, alpha: 0,
          duration: 500, ease: 'Power2',
          onComplete: () => ring1.destroy(),
        });

        const ring2 = this.scene.add.graphics().setDepth(13);
        ring2.lineStyle(1.5, 0xf59e0b, 0.6);
        ring2.strokeCircle(this.x, this.y - 18, 8);
        this.scene.tweens.add({
          targets: ring2, scaleX: 4.8, scaleY: 4.8, alpha: 0,
          duration: 700, delay: 80, ease: 'Sine.easeOut',
          onComplete: () => ring2.destroy(),
        });

        // Container scale-breathe
        if (this.container) {
          this.scene.tweens.add({
            targets: this.container, scaleX: 1.18, scaleY: 1.18,
            duration: 160, ease: 'Power2', yoyo: true,
          });
        }

        // Spawn the actual collectible plasma orb (via ResourceManager callback)
        // NO energy is added automatically — the player must click the orb.
        if (this.onGenerateEnergy) this.onGenerateEnergy(this.genAmount, this.x, this.y);

        if (this.animator) {
          this.animator.play('attack', 8);
          this.scene.time.delayedCall(400, () => {
            if (this.animator && this.alive) this.animator.play('idle');
          });
        }
      }
      return null;
    }

    if (this.isSupport) return null;

    // Combat unit
    this.target = this._findTarget(enemies);

    if (!this.target) {
      if (this._prefireCuePlayed) {
        this.attackTimer = Math.max(this.attackTimer, 500);
        this._prefireCuePlayed = false;
      }
      if (this.animator && this.animator.state === 'attack') {
        this.animator.play('idle');
      }
      return null;
    }

    this.attackTimer -= delta;
    if (this.def.weapon === 'fire_lance' && this.attackTimer <= 500 && !this._prefireCuePlayed) {
      if (window.GWAudio) window.GWAudio.play('fire-lance-windup');
      this._prefireCuePlayed = true;
    }
    if (this.attackTimer <= 0) {
      this.attackTimer = this.attackSpeed;
      this._prefireCuePlayed = false;
      if (this.animator) {
        this.animator.play('attack', 8);
        this.scene.time.delayedCall(this.attackSpeed * 0.55, () => {
          if (this.animator && this.alive) this.animator.play('idle');
        });
      }
      return { shoot: true, target: this.target };
    }
    return null;
  }

  _updateTemporaryEffects(delta) {
    if (this.attackSpeedBuffTimer > 0 && (this.attackSpeedBuffTimer -= delta) <= 0) {
      this.attackSpeedMultiplier = 1;
      this.attackSpeed = this._baseAttackSpeed;
    }
    if (this.shieldTimer > 0 && (this.shieldTimer -= delta) <= 0) {
      this.shieldHp = 0;
      if (this.shieldGfx) this.shieldGfx.setVisible(false);
    }
    if (this.genBoostTimer > 0 && (this.genBoostTimer -= delta) <= 0) this.genRateMultiplier = 1;
    if (this.stealthTimer > 0 && (this.stealthTimer -= delta) <= 0) {
      this.isStealthed = false;
      if (this.container) this.container.setAlpha(1);
    }
  }

  _updateCardAbility(delta, enemies, characters) {
    const rule = this.abilityRule;
    if (!rule) return;
    this.abilityTimer -= delta;
    if (this.abilityTimer > 0) return;
    const activated = this._activateCardAbility(rule, enemies, characters);
    this.abilityTimer = activated ? rule.cooldown : 500;
  }

  _activateCardAbility(rule, enemies, characters) {
    const allies = [...new Set(characters.concat(this))].filter(ally => {
      if (!ally.alive) return false;
      const withinLane = Math.abs(ally.lane - this.lane) <= (rule.laneRadius == null ? 1 : rule.laneRadius);
      const withinRange = Math.abs(ally.x - this.x) <= (rule.radius == null ? 260 : rule.radius);
      return withinLane && withinRange;
    });
    let activated = false;

    if (rule.self) {
      this.isStealthed = true;
      this.stealthTimer = Math.max(this.stealthTimer, rule.duration || 4000);
      if (this.container) this.container.setAlpha(0.45);
      activated = true;
    }
    if (rule.reveal) {
      enemies.forEach(enemy => {
        if (!enemy.alive) return;
        if (enemy.revealFor) enemy.revealFor(rule.duration || 8000);
        else enemy.revealed = true;
        activated = true;
      });
    }
    if (rule.heal) {
      allies.forEach(ally => { if (ally.heal(rule.heal)) activated = true; });
    }
    if (rule.shield) {
      allies.forEach(ally => {
        ally.applyShield(rule.shield, rule.duration || 6000);
        activated = true;
      });
    }
    if (rule.attackSpeedMultiplier) {
      allies.forEach(ally => {
        ally.applyAttackSpeedBoost(rule.attackSpeedMultiplier, rule.duration || 6000);
        activated = true;
      });
    }
    if (rule.regenMultiplier) {
      allies.filter(ally => ally.isEnergyUnit).forEach(ally => {
        ally.genRateMultiplier = Math.max(ally.genRateMultiplier, rule.regenMultiplier);
        ally.genBoostTimer = Math.max(ally.genBoostTimer, rule.duration || 7000);
        ally.genTimer = Math.min(ally.genTimer, ally.genInterval / ally.genRateMultiplier);
        activated = true;
      });
    }

    if (rule.damage || rule.slowMultiplier) {
      const range = rule.range || 600;
      const target = enemies.filter(enemy => enemy.alive && enemy.x >= this.x && enemy.x - this.x <= range)
        .sort((left, right) => left.x - right.x)[0];
      if (target) {
        const radius = rule.splash || 0;
        enemies.forEach(enemy => {
          if (!enemy.alive) return;
          const laneDistance = Math.abs(enemy.lane - target.lane) * (GW.BOARD.LANE_HEIGHT || 76);
          if (Math.hypot(enemy.x - target.x, laneDistance) > radius && enemy !== target) return;
          if (rule.damage) enemy.takeDamage(rule.damage);
          if (rule.slowMultiplier && enemy.applySlow) enemy.applySlow(rule.slowMultiplier, rule.duration || 5000);
        });
        this._showAbilityPulse(rule.color || 0xfbbf24, Math.max(28, radius), target.x, target.y);
        activated = true;
      }
    } else if (activated) {
      this._showAbilityPulse(rule.color || 0x4ade80, Math.max(36, rule.radius || 60));
    }

    return activated;
  }

  _showAbilityPulse(color, radius, x, y) {
    if (!this.scene || !this.scene.add || !this.scene.tweens) return;
    const pulse = this.scene.add.graphics().setDepth(24);
    pulse.lineStyle(3, color, 0.9);
    pulse.strokeCircle(0, 0, radius);
    pulse.x = x == null ? this.x : x;
    pulse.y = y == null ? this.y : y;
    this.scene.tweens.add({
      targets: pulse, scaleX: 1.5, scaleY: 1.5, alpha: 0,
      duration: 420, ease: 'Power2', onComplete: () => pulse.destroy(),
    });
  }

  applyAttackSpeedBoost(multiplier, duration) {
    this.attackSpeedMultiplier = Math.min(this.attackSpeedMultiplier, multiplier);
    this.attackSpeedBuffTimer = Math.max(this.attackSpeedBuffTimer, duration);
    this.attackSpeed = this._baseAttackSpeed * this.attackSpeedMultiplier;
  }

  applyShield(amount, duration) {
    this.shieldHp = Math.max(this.shieldHp, amount);
    this.shieldTimer = Math.max(this.shieldTimer, duration);
    if (!this.shieldGfx && this.scene && this.container) {
      this.shieldGfx = this.scene.add.graphics();
      this.shieldGfx.lineStyle(2, 0x38bdf8, 0.9);
      this.shieldGfx.strokeCircle(0, -4, 30);
      this.container.add(this.shieldGfx);
    }
    if (this.shieldGfx) this.shieldGfx.setVisible(true);
  }

  heal(amount) {
    if (!this.alive || this.hp >= this.maxHp) return false;
    const previousHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this._updateHpBar();
    return this.hp > previousHp;
  }

  _findTarget(enemies) {
    let closest = null;
    let closestDist = Infinity;
    for (const en of enemies) {
      if (!en.alive || (en.isStealth && !en.revealed)) continue;
      if (en.lane !== this.lane) continue;
      const dist = en.x - this.x;
      if (en.x <= GW.DISPLAY.BASE_WIDTH && dist > 0 && dist <= this.range && dist < closestDist) {
        closestDist = dist;
        closest = en;
      }
    }
    return closest;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    if (this.shieldHp > 0) {
      const absorbed = Math.min(this.shieldHp, amount);
      this.shieldHp -= absorbed;
      amount -= absorbed;
      if (this.shieldHp <= 0) {
        this.shieldTimer = 0;
        if (this.shieldGfx) this.shieldGfx.setVisible(false);
      }
      if (amount <= 0) return;
    }
    this.hp -= amount;
    this._updateHpBar();
    if (this.animator) {
      this.animator.play('hurt', 10);
      this.scene.time.delayedCall(150, () => {
        if (this.animator && this.alive) this.animator.play('idle');
      });
    } else {
      // Simple flash
      if (this.graphics) {
        this.graphics.setAlpha(0.3);
        this.scene.time.delayedCall(120, () => {
          if (this.graphics && this.alive) this.graphics.setAlpha(1);
        });
      }
    }
    if (this.hp <= 0) this.die();
  }

  die() {
    this.alive  = false;
    this.target = null;
    if (this.animator) this.animator.play('die', 8);
    this.scene.tweens.add({
      targets:  this.container,
      alpha:    0,
      scaleX:   0.3,
      scaleY:   0.3,
      duration: 380,
      ease:     'Power2',
      onComplete: () => this.destroy(),
    });
  }

  destroy() {
    if (this.animator) { this.animator.destroy(); this.animator = null; }
    if (this.container) { this.container.destroy(true); this.container = null; }
  }
};

GW.CharacterFactory = class CharacterFactory {
  static create(scene, defId, lane, cellIndex, x, y) {
    // Resolve from GW.CARDS first (primary), GW.CHARACTERS is aliased to GW.CARDS
    const def = (GW.CARDS && GW.CARDS[defId]) ||
                (GW.CHARACTERS && GW.CHARACTERS[defId]);
    if (!def) throw new Error('Unknown card/character: ' + defId);
    return new GW.Character(scene, def, lane, cellIndex, x, y);
  }
};
