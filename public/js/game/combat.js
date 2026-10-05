/**
 * Garden Warfare: Reborn — Combat Orchestrator
 *
 * REVISED: Passes weapon projectile color and size to ProjectileManager.fire().
 * All other logic unchanged.
 */

/* global GW */
function getAlienAttackCue(enemy) {
  const definition = enemy && enemy.def ? enemy.def : {};
  if (definition.attackSound) return definition.attackSound;
  const attackType = String(
    definition.attackType || definition.weaponType || definition.projectileType || 'melee'
  ).toLowerCase();
  if (attackType.includes('laser')) return 'alien-laser';
  if (attackType.includes('fire') || attackType.includes('flame')) return 'alien-fire';
  if (attackType.includes('plasma')) return 'alien-plasma';
  if (attackType.includes('bullet') || attackType.includes('gun')) return 'alien-bullet';
  return 'alien-melee';
}

GW.CombatManager = class CombatManager {
  constructor(scene, projectileManager, resourceManager, playerState) {
    this.scene             = scene;
    this.projectileManager = projectileManager;
    this.resourceManager   = resourceManager;
    this.playerState       = playerState;

    this.characters  = [];
    this.enemies     = [];

    this.onEnemyKilled      = null;
    this.onCharacterKilled  = null;
    this.onEnemyReachedHome = null;
  }

  addCharacter(character) { this.characters.push(character); }
  addEnemy(enemy)         { this.enemies.push(enemy); }

  update(delta) {
    this._updateCharacters(delta);
    this._updateEnemies(delta);
    this._updateProjectiles(delta);
    this._pruneDeadEntities();
  }

  _updateCharacters(delta) {
    for (const ch of this.characters) {
      if (!ch.alive) continue;
      const result = ch.update(delta, this.enemies, this.characters);
      if (result && result.explode) {
        this._detonateBomb(ch, result);
        continue;
      }
      if (result && result.shoot && result.target) {
        // Determine projectile type from weapon definition
        const wpnDef = (ch.def && ch.def.weapon && GW.WEAPONS)
          ? GW.WEAPONS[ch.def.weapon] : null;
        const projType = (wpnDef && wpnDef.projectileType) || null;
        const isFireLance = wpnDef && wpnDef.id === 'fire_lance';
        const weaponCue = isFireLance
          ? 'fire-lance-shot'
          : wpnDef && wpnDef.id
            ? 'weapon-' + wpnDef.id.replace(/_/g, '-')
          : 'military-melee';
        if (window.GWAudio) window.GWAudio.play(weaponCue);
        if (isFireLance && this.scene.textures.exists('gw-death-burst')) {
          const muzzleFlash = this.scene.add.image(ch.x + 32, ch.y - 8, 'gw-death-burst')
            .setDepth(22).setTint(0xffb347).setAlpha(0.2).setScale(0.35);
          this.scene.tweens.add({
            targets: muzzleFlash,
            alpha: 0.95,
            scale: 0.85,
            duration: 65,
            yoyo: true,
            onComplete: () => muzzleFlash.destroy(),
          });
        }
        if (!isFireLance) this._showMuzzleFlash(ch, wpnDef);

        this.projectileManager.fire(
          ch.x + 32,
          ch.y - 8,
          result.target,
          ch.damage,
          ch.projColor,
          ch.projSize,
          projType,
          ch.projectileSpeed,
          wpnDef
        );
        this._pulseAttacker(ch);
      }
    }
  }

  _detonateBomb(character, blast) {
    const blastGfx = this.scene.add.graphics().setDepth(26);
    blastGfx.lineStyle(5, 0xf97316, 0.9);
    blastGfx.strokeCircle(0, 0, 42);
    blastGfx.fillStyle(0xfbbf24, 0.4);
    blastGfx.fillCircle(0, 0, 42);
    blastGfx.setPosition(character.x, character.y - 8);
    this.scene.tweens.add({
      targets: blastGfx, scaleX: 3, scaleY: 3, alpha: 0,
      duration: 420, ease: 'Power2', onComplete: () => blastGfx.destroy(),
    });

    this.enemies.forEach(enemy => {
      const laneRadius = blast.laneRadius == null ? 1 : blast.laneRadius;
      if (enemy.alive && Math.abs(enemy.lane - blast.lane) <= laneRadius && Math.abs(enemy.x - character.x) <= blast.range) {
        enemy.takeDamage(blast.damage);
      }
    });
    character.die();
  }

  _updateEnemies(delta) {
    for (const en of this.enemies) {
      if (!en.alive) continue;

      if (en.reachedHome()) {
        en.alive = false;
        if (this.onEnemyReachedHome) this.onEnemyReachedHome(en);
        if (en.container) en.destroy();
        continue;
      }

      const result = en.update(delta, this.characters);
      if (result && result.attack && result.target) {
        if (window.GWAudio) window.GWAudio.play(getAlienAttackCue(en));
        if (en.def.projectileType && this.projectileManager.fireAlien) {
          this.projectileManager.fireAlien(en.x - 16, en.y - 8, result.target, en.damage, en.def);
        } else {
          result.target.takeDamage(en.damage);
          this._showAttackLine(en, result.target);
        }
      }
    }
  }

  _updateProjectiles(delta) {
    this.projectileManager.update(delta);
  }

  _pruneDeadEntities() {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const en = this.enemies[i];
      if (!en.alive) {
        if (en.hp <= 0) {
          this.resourceManager.earn(en.reward);
          this.playerState.addScore(en.reward * 5);
          this.playerState.recordKill();
          if (this.onEnemyKilled) this.onEnemyKilled(en);
        }
        if (en.container) en.destroy();
        this.enemies.splice(i, 1);
      }
    }

    for (let i = this.characters.length - 1; i >= 0; i--) {
      const ch = this.characters[i];
      if (!ch.alive) {
        if (this.onCharacterKilled) this.onCharacterKilled(ch);
        if (ch.container) ch.destroy();
        this.characters.splice(i, 1);
      }
    }
  }

  _pulseAttacker(ch) {
    if (!ch.container) return;
    this.scene.tweens.add({
      targets:  ch.container,
      scaleX:   1.16,
      scaleY:   1.16,
      duration: 75,
      yoyo:     true,
      ease:     'Power2',
    });
  }

  _showAttackLine(enemy, character) {
    if (!enemy.container || !character.container) return;
    const line = this.scene.add.graphics().setDepth(18);
    line.lineStyle(1.5, 0xef4444, 0.6);
    line.beginPath();
    line.moveTo(enemy.x, enemy.y);
    line.lineTo(character.x, character.y);
    line.strokePath();
    this.scene.time.delayedCall(100, () => line.destroy());
  }

  _showMuzzleFlash(character, weapon) {
    const color = weapon && weapon.projectileColor || character.projColor || 0xfde68a;
    const type = weapon && weapon.projectileType;
    const flash = this.scene.add.graphics().setDepth(22);
    flash.fillStyle(0xffffff, 0.9);
    flash.fillCircle(0, 0, type === 'rocket' || type === 'explosive' ? 5 : 3);
    flash.lineStyle(type === 'laser' ? 3 : 1.5, color, 0.95);
    flash.lineBetween(-4, 0, 9, 0);
    if (type === 'plasma' || type === 'plasma_cannon') {
      flash.lineStyle(1, color, 0.8);
      flash.strokeCircle(0, 0, 8);
    }
    flash.setPosition(character.x + 28, character.y - 8);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 1.8, scaleY: 1.8,
      duration: type === 'laser' ? 90 : 140, ease: 'Power2',
      onComplete: () => flash.destroy(),
    });
  }

  destroyAll() {
    this.characters.forEach(ch => { if (ch.container) ch.destroy(); });
    this.enemies.forEach(en    => { if (en.container) en.destroy(); });
    this.projectileManager.destroyAll();
    this.characters = [];
    this.enemies    = [];
  }

  get activeEnemyCount()     { return this.enemies.filter(e => e.alive).length; }
  get activeCharacterCount() { return this.characters.filter(c => c.alive).length; }
};
