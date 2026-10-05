/**
 * Garden Warfare: Reborn — Projectile System
 *
 * REVISED: Projectile color/size driven by character weapon definition.
 * ProjectileManager.fire() now accepts optional color and size params.
 */

/* global GW */

GW.Projectile = class Projectile {
  /**
   * @param {Phaser.Scene} scene
   * @param {number}  x
   * @param {number}  y
   * @param {GW.Enemy} target
   * @param {number}  damage
   * @param {number}  speed
   * @param {number}  color    - hex color for the projectile
   * @param {number}  size     - radius of core circle
   */
  constructor(scene, x, y, target, damage, speed, color, size, weaponDef) {
    this.scene   = scene;
    this.x       = x;
    this.y       = y;
    this.target  = target;
    this.damage  = damage;
    this.speed   = speed || GW.COMBAT.PROJECTILE_SPEED;
    this.color   = color || 0xfde68a;
    this.size    = size  || 5;
    this.weaponDef = weaponDef || {};
    this.originX = x;
    this.originY = y;
    this.active  = true;

    this._build();
  }

  _build() {
    this.gfx = this.scene.add.graphics().setDepth(20);
    this._draw();
  }

  _draw() {
    this.gfx.clear();
    const type = this.weaponDef.projectileType;
    this.gfx.fillStyle(this.color, 0.12);
    this.gfx.fillEllipse(-this.size * 1.8, 0, this.size * 5, this.size * 2.5);
    this.gfx.fillStyle(this.color, 0.3);
    this.gfx.fillCircle(0, 0, this.size + 5);
    this.gfx.fillStyle(this.color, 1);
    if (type === 'laser') {
      this.gfx.lineStyle(Math.max(3, this.size + 2), this.color, 0.35);
      this.gfx.lineBetween(-16, 0, 12, 0);
      this.gfx.lineStyle(Math.max(1.5, this.size), 0xffffff, 0.9);
      this.gfx.lineBetween(-13, 0, 10, 0);
    } else if (type === 'sniper') {
      this.gfx.lineStyle(2, this.color, 0.95);
      this.gfx.lineBetween(-18, 0, this.size + 2, 0);
      this.gfx.fillTriangle(this.size + 3, 0, this.size - 2, -3, this.size - 2, 3);
    } else if (type === 'burst') {
      this.gfx.fillCircle(0, 0, this.size);
      this.gfx.fillCircle(-this.size * 1.4, -this.size * 0.7, this.size * 0.5);
      this.gfx.fillCircle(-this.size * 1.4, this.size * 0.7, this.size * 0.5);
    } else if (type === 'gas') {
      this.gfx.lineStyle(2, this.color, 0.9);
      this.gfx.strokeCircle(0, 0, this.size);
      this.gfx.fillCircle(-this.size * 0.35, -this.size * 0.2, this.size * 0.35);
      this.gfx.fillCircle(this.size * 0.3, this.size * 0.2, this.size * 0.25);
    } else if (type === 'plasma' || type === 'plasma_cannon') {
      this.gfx.lineStyle(2, 0xffffff, 0.8);
      this.gfx.strokeCircle(0, 0, this.size + 1);
      this.gfx.fillTriangle(this.size, 0, -this.size * 0.55, -this.size * 0.7, -this.size * 0.55, this.size * 0.7);
    } else if (['rocket', 'torpedo', 'explosive', 'acid', 'spore', 'cannonball'].includes(type)) {
      this.gfx.fillRoundedRect(-this.size, -this.size * 0.55, this.size * 2.2, this.size * 1.1, 2);
      this.gfx.fillTriangle(this.size * 1.5, 0, this.size * 0.8, -this.size * 0.8, this.size * 0.8, this.size * 0.8);
      this.gfx.fillStyle(0xffffff, 0.7);
      this.gfx.fillCircle(-this.size * 0.25, -this.size * 0.15, Math.max(1, this.size * 0.22));
    } else {
      this.gfx.fillCircle(0, 0, this.size);
      this.gfx.fillStyle(0xffffff, 0.55);
      this.gfx.fillCircle(-Math.floor(this.size * 0.4), -Math.floor(this.size * 0.4), Math.max(1.5, this.size * 0.4));
    }
    this.gfx.x = this.x;
    this.gfx.y = this.y;
  }

  update(delta) {
    if (!this.active) return true;

    if (!this.target || !this.target.alive) {
      this.destroy();
      return true;
    }

    const tx = this.target.x;
    const ty = this.target.y;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = (this.speed * delta) / 1000;

    if (dist <= step + this.size + 4) {
      // Hit!
      this.target.takeDamage(this.damage);
      this._applyWeaponEffects(tx, ty);
      this._spawnHitEffect(tx, ty);
      this.destroy();
      return true;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.gfx.x = this.x;
    this.gfx.y = this.y;
    this.gfx.rotation = Math.atan2(dy, dx);

    if (this.x > GW.DISPLAY.BASE_WIDTH + 60 || this.x < -60) {
      this.destroy();
      return true;
    }
    return false;
  }

  _applyWeaponEffects(hitX, hitY) {
    const enemies = this.scene.combatManager && this.scene.combatManager.enemies || [];
    const alreadyHit = new Set([this.target]);
    const weapon = this.weaponDef;
    if (weapon.piercing) {
      enemies.forEach(enemy => {
        if (!enemy.alive || enemy.lane !== this.target.lane || alreadyHit.has(enemy)) return;
        if (enemy.x >= Math.min(this.originX, hitX) && enemy.x <= Math.max(this.originX, hitX)) {
          enemy.takeDamage(this.damage);
          alreadyHit.add(enemy);
        }
      });
    }
    if (weapon.splash) {
      enemies.forEach(enemy => {
        if (!enemy.alive || alreadyHit.has(enemy)) return;
        if (Math.hypot(enemy.x - hitX, enemy.y - hitY) <= weapon.splash) {
          enemy.takeDamage(this.damage);
          alreadyHit.add(enemy);
        }
      });
    }
  }

  _spawnHitEffect(x, y) {
    const fx = this.scene.add.graphics().setDepth(25);
    const type = this.weaponDef.projectileType;
    if (type === 'laser') {
      fx.lineStyle(Math.max(2, this.size), this.color, 0.95);
      fx.lineBetween(this.originX - x, this.originY - y, 0, 0);
    } else if (type === 'sniper') {
      fx.lineStyle(2, this.color, 0.95);
      fx.lineBetween(this.originX - x, this.originY - y, 0, 0);
      fx.fillStyle(0xffffff, 0.9);
      fx.fillCircle(0, 0, this.size + 4);
    } else if (type === 'burst') {
      fx.fillStyle(this.color, 0.8);
      fx.fillCircle(-4, -3, this.size);
      fx.fillCircle(4, 3, this.size);
    } else if (type === 'gas') {
      fx.lineStyle(3, this.color, 0.75);
      fx.strokeCircle(0, 0, this.size + 5);
      fx.fillStyle(this.color, 0.2);
      fx.fillCircle(0, 0, this.size + 3);
    } else if (type === 'plasma' || type === 'plasma_cannon') {
      fx.lineStyle(3, this.color, 0.8);
      fx.strokeCircle(0, 0, this.size + 4);
      fx.fillStyle(0xffffff, 0.8);
      fx.fillCircle(0, 0, this.size);
    } else if (this.weaponDef.splash) {
      fx.lineStyle(3, this.color, 0.85);
      fx.strokeCircle(0, 0, this.size + 8);
      fx.fillStyle(this.color, 0.28);
      fx.fillCircle(0, 0, this.size + 5);
    }
    fx.lineStyle(2, this.color, 0.85);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      fx.beginPath();
      fx.moveTo(Math.cos(angle) * 3, Math.sin(angle) * 3);
      fx.lineTo(Math.cos(angle) * (this.size + 12), Math.sin(angle) * (this.size + 12));
      fx.strokePath();
    }
    fx.fillStyle(0xffffff, 0.8);
    fx.fillCircle(0, 0, Math.max(2, this.size * 0.55));
    fx.x = x; fx.y = y;
    this.scene.tweens.add({
      targets:  fx,
      alpha:    0,
      scaleX:   2.5,
      scaleY:   2.5,
      duration: 200,
      ease:     'Power2',
      onComplete: () => fx.destroy(),
    });
  }

  destroy() {
    this.active = false;
    if (this.gfx) { this.gfx.destroy(); this.gfx = null; }
  }
};

GW.ProjectileManager = class ProjectileManager {
  constructor(scene) {
    this.scene       = scene;
    this.projectiles = [];
    this.alienProjectiles = [];
  }

  /**
   * Fire a projectile.
   * @param {number}   x
   * @param {number}   y
   * @param {GW.Enemy} target
   * @param {number}   damage
   * @param {number}   [color]  - hex color (from weapon def)
   * @param {number}   [size]   - radius (from weapon def)
   * @param {string}   [type]   - 'fire' uses GW.FireProjectile; others use default
   */
  fire(x, y, target, damage, color, size, type, speed, weaponDef) {
    let p;
    if (type === 'fire') {
      p = new GW.FireProjectile(this.scene, x, y, target, damage);
    } else {
      p = new GW.Projectile(
        this.scene, x, y, target, damage,
        speed || GW.COMBAT.PROJECTILE_SPEED, color, size, weaponDef
      );
    }
    this.projectiles.push(p);
    return p;
  }

  fireAlien(x, y, target, damage, enemyDef) {
    const projectile = new GW.AlienProjectile(
      this.scene, x, y, target, damage, enemyDef
    );
    this.alienProjectiles.push(projectile);
    return projectile;
  }

  update(delta) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (this.projectiles[i].update(delta)) {
        this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.alienProjectiles.length - 1; i >= 0; i--) {
      if (this.alienProjectiles[i].update(delta)) {
        this.alienProjectiles.splice(i, 1);
      }
    }
  }

  destroyAll() {
    this.projectiles.forEach(p => p.destroy());
    this.alienProjectiles.forEach(p => p.destroy());
    this.projectiles = [];
    this.alienProjectiles = [];
  }
};

GW.AlienProjectile = class AlienProjectile {
  constructor(scene, x, y, target, damage, enemyDef) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.target = target;
    this.damage = damage;
    this.color = enemyDef.projectileColor || enemyDef.eyeColor || 0xa78bfa;
    this.size = enemyDef.projectileSize || 6;
    this.speed = enemyDef.projectileSpeed || 320;
    this.type = enemyDef.projectileType || 'spore';
    this.splash = enemyDef.splash || 0;
    this.active = true;
    this.gfx = scene.add.graphics().setDepth(21);
    this._draw();
  }

  _draw() {
    this.gfx.clear();
    this.gfx.fillStyle(this.color, 0.18);
    this.gfx.fillCircle(-this.size, 0, this.size * 1.8);
    this.gfx.fillStyle(this.color, 1);
    if (this.type === 'laser') {
      this.gfx.lineStyle(this.size, this.color, 0.45);
      this.gfx.lineBetween(-14, 0, 5, 0);
      this.gfx.lineStyle(Math.max(2, this.size * 0.45), 0xffffff, 0.9);
      this.gfx.lineBetween(-11, 0, 5, 0);
    } else if (this.type === 'plasma_cannon' || this.type === 'plasma') {
      this.gfx.fillCircle(0, 0, this.size);
      this.gfx.lineStyle(2, 0xffffff, 0.85);
      this.gfx.strokeCircle(0, 0, this.size + 2);
    } else if (this.type === 'explosive' || this.type === 'acid') {
      this.gfx.fillTriangle(this.size, 0, -this.size * 0.7, -this.size, -this.size * 0.7, this.size);
      this.gfx.fillCircle(0, 0, this.size * 0.55);
    } else {
      this.gfx.fillCircle(0, 0, this.size);
      this.gfx.fillStyle(0xffffff, 0.8);
      this.gfx.fillCircle(-this.size * 0.25, -this.size * 0.25, this.size * 0.35);
    }
    this.gfx.setPosition(this.x, this.y);
  }

  update(delta) {
    if (!this.active) return true;
    if (!this.target || !this.target.alive) {
      this.destroy();
      return true;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);
    const step = this.speed * delta / 1000;
    if (distance <= step + this.size + 4) {
      const impactX = this.target.x;
      const impactY = this.target.y;
      this.target.takeDamage(this.damage);
      if (this.splash > 0) {
        (this.scene.combatManager && this.scene.combatManager.characters || []).forEach(character => {
          if (character !== this.target && character.alive &&
              Math.hypot(character.x - impactX, character.y - impactY) <= this.splash) {
            character.takeDamage(this.damage);
          }
        });
      }
      this._impact(impactX, impactY);
      this.destroy();
      return true;
    }
    this.x += dx / distance * step;
    this.y += dy / distance * step;
    this.gfx.setPosition(this.x, this.y);
    this.gfx.rotation = Math.atan2(dy, dx);
    return false;
  }

  _impact(x, y) {
    const effect = this.scene.add.graphics().setDepth(26).setPosition(x, y);
    effect.lineStyle(this.type === 'plasma_cannon' ? 5 : 2.5, this.color, 0.9);
    effect.strokeCircle(0, 0, this.size + (this.splash ? 10 : 4));
    effect.fillStyle(this.color, this.splash ? 0.3 : 0.65);
    effect.fillCircle(0, 0, this.size);
    if (this.type === 'laser') {
      effect.lineStyle(2, 0xffffff, 0.9);
      effect.lineBetween(-12, 0, 12, 0);
    }
    this.scene.tweens.add({
      targets: effect, alpha: 0, scaleX: this.splash ? 2.5 : 1.8,
      scaleY: this.splash ? 2.5 : 1.8, duration: 260, ease: 'Power2',
      onComplete: () => effect.destroy(),
    });
  }

  destroy() {
    this.active = false;
    if (this.gfx) {
      this.gfx.destroy();
      this.gfx = null;
    }
  }
};

// ─── Fire Projectile (v1.0.1) ────────────────────────────────────────────────
// Animated 2D fire blast for Fire-Lancer units.
// Rendered as a layered fireball with animated flame particles so it looks
// like a literal burst of fire rather than a small solid dot.

GW.FireProjectile = class FireProjectile {
  /**
   * @param {Phaser.Scene} scene
   * @param {number}  x        - origin X (muzzle of fire-lance)
   * @param {number}  y        - origin Y
   * @param {GW.Enemy} target
   * @param {number}  damage
   */
  constructor(scene, x, y, target, damage) {
    this.scene   = scene;
    this.x       = x;
    this.y       = y;
    this.target  = target;
    this.damage  = damage;
    this.speed   = GW.COMBAT.PROJECTILE_SPEED * 1.1;
    this.active  = true;
    this._age    = 0; // ms since creation — drives flicker

    this._build();
  }

  _build() {
    // Container travels as one unit
    this.container = this.scene.add.container(this.x, this.y).setDepth(20);

    // ── Outer heat shimmer (large, low opacity amber) ──────
    this._shimmer = this.scene.add.graphics();
    this._shimmer.fillStyle(0xff8c00, 0.18);
    this._shimmer.fillCircle(0, 0, 18);
    this.container.add(this._shimmer);

    // ── Mid flame ring (orange) ────────────────────────────
    this._midRing = this.scene.add.graphics();
    this.container.add(this._midRing);

    // ── Core (bright yellow-white) ─────────────────────────
    this._core = this.scene.add.graphics();
    this.container.add(this._core);

    // ── Trailing embers: 4 small dots offset behind ────────
    this._embers = [];
    for (let i = 0; i < 4; i++) {
      const e = this.scene.add.graphics();
      this.container.add(e);
      this._embers.push(e);
    }

    this._drawFlame(0);
  }

  _drawFlame(age) {
    const flicker = Math.sin(age * 0.022) * 0.5 + 0.5; // 0–1 oscillation

    // Mid ring — orange lobe shape, flickers in size
    this._midRing.clear();
    const mr = 10 + flicker * 3;
    this._midRing.fillStyle(0xff4500, 0.85);
    this._midRing.fillCircle(0, 0, mr);
    // Lobe toward the front of travel (positive x = right = toward enemy)
    this._midRing.fillStyle(0xff6a00, 0.6);
    this._midRing.fillEllipse(mr * 0.5, 0, mr * 1.4, mr * 0.7);

    // Core — yellow-white hot centre
    this._core.clear();
    const cr = 6 + flicker * 2;
    this._core.fillStyle(0xfef08a, 0.95);
    this._core.fillCircle(0, 0, cr);
    this._core.fillStyle(0xffffff, 0.7);
    this._core.fillCircle(-1, -1, cr * 0.45);

    // Embers — trail behind the core (negative x = toward origin)
    const emberColors = [0xff4500, 0xff6a00, 0xfbbf24, 0xfef08a];
    this._embers.forEach((e, i) => {
      e.clear();
      const ox    = -(8 + i * 5) - flicker * 2;
      const oy    = Math.sin(age * 0.015 + i * 1.4) * 4;
      const er    = Math.max(1.5, 4 - i * 0.7);
      const alpha = Math.max(0, 0.8 - i * 0.15);
      e.fillStyle(emberColors[i % emberColors.length], alpha);
      e.fillCircle(ox, oy, er);
    });
  }

  update(delta) {
    if (!this.active) return true;

    if (!this.target || !this.target.alive) {
      this.destroy();
      return true;
    }

    this._age += delta;
    this._drawFlame(this._age);

    const tx   = this.target.x;
    const ty   = this.target.y;
    const dx   = tx - this.x;
    const dy   = ty - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = (this.speed * delta) / 1000;

    // Rotate container to face direction of travel
    if (dist > 1) {
      this.container.setRotation(Math.atan2(dy, dx));
    }

    if (dist <= step + 14) {
      // Hit — deal damage and spawn explosion
      if (window.GWAudio) window.GWAudio.play('fire-impact');
      this.target.takeDamage(this.damage);
      this._spawnImpact(tx, ty);
      this.destroy();
      return true;
    }

    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    this.container.x = this.x;
    this.container.y = this.y;

    // Out of bounds guard
    if (this.x > GW.DISPLAY.BASE_WIDTH + 80 || this.x < -80) {
      this.destroy();
      return true;
    }
    return false;
  }

  _spawnImpact(x, y) {
    const scene = this.scene;

    // Outer explosion bloom
    const bloom = scene.add.graphics().setDepth(26);
    bloom.fillStyle(0xff4500, 0.7);
    bloom.fillCircle(0, 0, 22);
    bloom.x = x; bloom.y = y;
    scene.tweens.add({
      targets: bloom, scaleX: 2.8, scaleY: 2.8, alpha: 0,
      duration: 280, ease: 'Power2', onComplete: () => bloom.destroy(),
    });

    // Bright core flash
    const flash = scene.add.graphics().setDepth(27);
    flash.fillStyle(0xfef08a, 0.9);
    flash.fillCircle(0, 0, 12);
    flash.x = x; flash.y = y;
    scene.tweens.add({
      targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0,
      duration: 180, ease: 'Power3', onComplete: () => flash.destroy(),
    });

    // 5 flying fire sparks
    for (let i = 0; i < 5; i++) {
      const spark = scene.add.graphics().setDepth(25);
      spark.fillStyle(i % 2 === 0 ? 0xff6a00 : 0xfbbf24, 0.85);
      spark.fillCircle(0, 0, 3);
      spark.x = x; spark.y = y;
      const angle  = (Math.PI * 2 / 5) * i + Math.random() * 0.5;
      const radius = 18 + Math.random() * 20;
      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * radius,
        y: y + Math.sin(angle) * radius,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 320 + Math.random() * 120,
        ease: 'Power1',
        onComplete: () => spark.destroy(),
      });
    }
  }

  destroy() {
    this.active = false;
    if (this.container) { this.container.destroy(true); this.container = null; }
  }
};
