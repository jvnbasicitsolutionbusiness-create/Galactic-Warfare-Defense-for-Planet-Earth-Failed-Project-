/**
 * Chrono-Front: Galactic War — Sprite / Animation System
 *
 * Full pixel-art draw functions for all four core characters, based on
 * the uploaded sprite-sheet references:
 *
 *   fire_lance_gunner       — 10th-century Chinese soldier, bamboo fire-lance
 *   plasma_energy_generator — Sci-fi energy tower, glowing plasma orb
 *   vex_drone               — Mosskin Scout, moss shell and twin glow-sensors
 *   vex_flag_bearer         — Ash-grey Signal Bearer with red standard
 *
 * Architecture:
 *   GW.SpriteAnimator  — timer-driven redraw; calls drawFn(g, def, frame, state)
 *   GW.SpriteRegistry  — maps unit-id → drawFn; falls back to _default_*
 *
 * Animation states: idle | walk | attack | hurt | die | deploy
 */

/* global GW, Phaser */

// ─── Sprite Registry ─────────────────────────────────────────────────────────
GW.SpriteRegistry = {
  _chars:   {},
  _enemies: {},

  registerChar(id, drawFn)  { this._chars[id]   = drawFn; },
  registerEnemy(id, drawFn) { this._enemies[id]  = drawFn; },

  getCharDraw(id)  { return this._chars[id]   || this._chars['_default_char'];   },
  getEnemyDraw(id) { return this._enemies[id]  || this._enemies['_default_enemy']; },
};

// ─── Sprite Animator ─────────────────────────────────────────────────────────
GW.SpriteAnimator = class SpriteAnimator {
  constructor(scene, graphics, drawFn, def) {
    this.scene  = scene;
    this.gfx    = graphics;
    this.drawFn = drawFn;
    this.def    = def;
    this.frame  = 0;
    this.state  = 'idle';
    this._timer = null;
    this._fps   = 6;
    this._qualityMultiplier = window.GWGraphics ? window.GWGraphics.getModelRate(
      GW.progression && GW.progression.getSetting('modelQuality')
    ) : 1;
  }

  play(state, fps) {
    if (this.state === state && this._timer) return;
    this.state = state;
    this._fps  = fps || this._getDefaultFps(state);
    this.frame = 0;
    this._startTimer();
  }

  stop() {
    if (this._timer) { this._timer.remove(false); this._timer = null; }
  }

  setQualityMultiplier(multiplier) {
    const next = Math.max(0.25, Math.min(1, Number(multiplier) || 1));
    if (next === this._qualityMultiplier) return;
    this._qualityMultiplier = next;
    if (this._timer) this._startTimer();
  }

  _getDefaultFps(state) {
    return { idle: 3, walk: 6, attack: 8, hurt: 10, die: 6, deploy: 6 }[state] || 6;
  }

  _startTimer() {
    if (this._timer) this._timer.remove(false);
    this._timer = this.scene.time.addEvent({
      delay:         Math.round(1000 / (this._fps * this._qualityMultiplier)),
      callback:      this._tick,
      callbackScope: this,
      loop:          true,
    });
    this._draw();
  }

  _tick()  { this.frame++; this._draw(); }

  _draw() {
    if (!this.gfx || !this.drawFn) return;
    try { this.drawFn(this.gfx, this.def, this.frame, this.state); } catch (_) {}
  }

  destroy() { this.stop(); this.gfx = null; this.drawFn = null; }
};

// ─────────────────────────────────────────────────────────────────────────────
//  HELPER — tiny pixel-rect shorthand used internally
// ─────────────────────────────────────────────────────────────────────────────
function _px(g, x, y, w, h, col, alpha) {
  g.fillStyle(col, alpha !== undefined ? alpha : 1);
  g.fillRect(x, y, w, h);
}

// Shade a hex colour: f<0 darkens toward black, f>0 lightens toward white (|f| 0..1).
function _shade(hex, f) {
  const r = (hex >> 16) & 0xff, gg = (hex >> 8) & 0xff, b = hex & 0xff;
  const t = f < 0 ? 0 : 255, p = Math.min(1, Math.abs(f));
  const nr = Math.round((t - r) * p) + r;
  const ng = Math.round((t - gg) * p) + gg;
  const nb = Math.round((t - b) * p) + b;
  return (nr << 16) | (ng << 8) | nb;
}


// ═════════════════════════════════════════════════════════════════════════════
//  1.  FIRE-LANCE GUNNER
//      Sprite-sheet ref: IDLE(6), WALK(6), RUN(6), FIRE-LANCE ATTACK(8),
//                        RELOAD/RECOVER(6), TAKE DAMAGE(4), DEFEAT(6)
// ═════════════════════════════════════════════════════════════════════════════
GW.SpriteRegistry.registerChar('fire_lance_gunner', (g, def, frame, state) => {
  g.clear();

  // ── Colour palette (matches sprite sheet) ────────────────────────────────
  const BODY    = 0x6b1a1a;   // dark maroon armour
  const DARK    = 0x4a0f0f;   // darker armour details
  const LEATHER = 0x5c3210;   // brown leather straps / under-sleeve
  const SKIN    = def.skinColor   || 0xd4956a;  // tan skin
  const HELMET  = def.helmetColor || 0x8b1a1a;  // dark-red helmet
  const PLUME   = 0xdc2626;   // bright red tassel
  const POLE    = 0xb45309;   // amber bamboo lance pole
  const BAMBOO  = 0x78350f;   // darker bamboo ring
  const IRON    = 0x6b7280;   // iron tip cap
  const FLAME   = def.accentColor || 0xff6b00;  // fire orange
  const GLOW    = 0xfef08a;   // hot yellow glow
  const BOOT    = 0x1c1008;   // near-black boots

  // ── Per-state animation parameters ───────────────────────────────────────
  let bob      = 0;   // vertical breathing offset
  let leanX    = 0;   // horizontal body lean
  let lanceExt = 0;   // lance extension (attack thrust)
  let flameR   = 0;   // flame radius
  let hurtX    = 0;   // hurt stagger (x shift left)
  let falling  = 0;   // die: progressive fall offset

  const f = frame % 8;

  switch (state) {
    case 'idle':
    case 'deploy': {
      const b = frame % 6;
      bob = b < 3 ? b * 0.7 : (6 - b) * 0.7;
      break;
    }
    case 'walk': {
      // Gentle walking bob
      bob = Math.sin(frame * 0.9) * 2;
      leanX = Math.sin(frame * 0.45) * 1.5;
      break;
    }
    case 'attack': {
      if (f < 2) {
        // Wind-up: pull back
        lanceExt = -3 + f * 1.5;
        leanX    = -2;
      } else if (f < 6) {
        // Thrust → burst
        lanceExt = (f - 2) * 6;         // up to +24px
        flameR   = (f - 2) * 4.5;       // up to 18px radius
        leanX    = (f - 2) * 1.5;
      } else {
        // Recoil / recover
        lanceExt = Math.max(0, 24 - (f - 5) * 12);
        flameR   = Math.max(0, 18 - (f - 5) * 9);
        leanX    = Math.max(0, 5 - (f - 5) * 3);
      }
      break;
    }
    case 'hurt': {
      const hf = frame % 4;
      hurtX = hf < 2 ? -(hf + 1) * 4 : -8 + (hf - 1) * 4;
      bob   = 2;
      break;
    }
    case 'die': {
      falling = Math.min(frame, 5) * 6;
      break;
    }
  }

  const bx = leanX + hurtX;
  const by = bob + falling;

  // ── Prone (die) ───────────────────────────────────────────────────────────
  if (state === 'die' && frame >= 4) {
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(2, 20 + by * 0.4, 56, 10);

    _px(g, -22 + bx,  8 + by, 46, 12, BODY, 0.82);                   // prone body
    _px(g, -22 + bx,  4 + by, 14, 10, SKIN, 0.82);                   // head
    _px(g, -28 + bx,  6 + by, 12,  8, HELMET, 0.72);                 // helmet off
    _px(g, -29 + bx,  4 + by,  3, 10, PLUME, 0.65);                  // plume beside
    _px(g, -16 + bx, 18 + by, 42,  3, POLE, 0.68);                   // lance on ground
    return;
  }

  // ── Ground shadow ─────────────────────────────────────────────────────────
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(2 + bx, 28 + by, 38, 8);

  // ── Boots ─────────────────────────────────────────────────────────────────
  _px(g, -11 + bx, 18 + by,  9, 7, BOOT);
  _px(g,   2 + bx, 18 + by,  9, 7, BOOT);
  // Boot highlight
  _px(g,  -9 + bx, 18 + by,  3, 2, 0x2d1a0a, 0.5);
  _px(g,   4 + bx, 18 + by,  3, 2, 0x2d1a0a, 0.5);

  // ── Legs (armoured greaves) ───────────────────────────────────────────────
  // Walk/run: legs alternate position
  let leftLegY = 0, rightLegY = 0;
  if (state === 'walk') {
    leftLegY  = Math.sin(frame * 0.9) * 2;
    rightLegY = Math.sin(frame * 0.9 + Math.PI) * 2;
  }
  _px(g, -10 + bx, 6 + by + leftLegY,  9, 13, BODY);
  _px(g,   2 + bx, 6 + by + rightLegY, 9, 13, BODY);

  // Knee guards
  _px(g, -11 + bx,  9 + by + leftLegY,  11, 3, LEATHER);
  _px(g,   1 + bx,  9 + by + rightLegY, 11, 3, LEATHER);

  // Greave highlight line
  g.fillStyle(DARK, 0.55);
  g.fillRect(-7 + bx, 6 + by + leftLegY,  2, 11);
  g.fillRect( 5 + bx, 6 + by + rightLegY, 2, 11);

  // ── Belt ──────────────────────────────────────────────────────────────────
  _px(g, -12 + bx, 5 + by, 25, 3, LEATHER);
  // Belt buckle
  g.fillStyle(0xd97706, 0.9);
  g.fillRect(-2 + bx, 5 + by, 5, 3);

  // ── Torso armour plates ───────────────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillRoundedRect(-13 + bx, -14 + by, 27, 21, 3);

  // Centre armour ridge
  _px(g, -1 + bx, -13 + by, 3, 19, DARK, 0.7);

  // Armour side plates (raised edges)
  _px(g, -13 + bx, -12 + by, 3, 17, DARK, 0.55);
  _px(g,  11 + bx, -12 + by, 3, 17, DARK, 0.55);

  // Shoulder plate (right / lance arm)
  g.fillStyle(DARK, 1);
  g.fillRoundedRect(12 + bx, -14 + by, 9, 10, 2);
  // Shoulder highlight
  g.fillStyle(0x7a2020, 0.6);
  g.fillRect(13 + bx, -13 + by, 4, 3);

  // ── Left arm (passive, supports lance grip) ───────────────────────────────
  _px(g, -19 + bx, -10 + by, 8, 14, BODY);
  // Left hand gripping pole
  g.fillStyle(SKIN, 1);
  g.fillCircle(-15 + bx, 3 + by, 4);

  // ── Right arm (lance arm, extends with attack) ────────────────────────────
  _px(g, 12 + bx + Math.round(lanceExt * 0.25), -10 + by, 10, 7, BODY);

  // ── Fire-Lance pole ───────────────────────────────────────────────────────
  const poleStartX = -14 + bx;
  const poleTipX   =  28 + bx + lanceExt;

  _px(g, poleStartX, -6 + by, poleTipX - poleStartX, 4, POLE);

  // Bamboo segment rings (dark bands every ~10px)
  g.fillStyle(BAMBOO, 0.65);
  for (let sx = poleStartX + 8; sx < poleTipX - 5; sx += 10) {
    g.fillRect(sx, -6 + by, 2, 4);
  }

  // Lance iron tip
  _px(g, poleTipX, -8 + by, 7, 8, IRON);
  // Tip highlight
  g.fillStyle(0x9ca3af, 0.5);
  g.fillRect(poleTipX + 1, -7 + by, 2, 3);

  // ── Flame / fire burst at tip ─────────────────────────────────────────────
  if (flameR > 0) {
    // Outer soft halo
    g.fillStyle(GLOW, 0.18);
    g.fillCircle(poleTipX + 4, -4 + by, flameR + 8);
    // Mid glow ring
    g.fillStyle(FLAME, 0.35);
    g.fillCircle(poleTipX + 4, -4 + by, flameR + 4);
    // Core flame
    g.fillStyle(FLAME, 0.92);
    g.fillCircle(poleTipX + 4, -4 + by, flameR);
    // Bright hot centre
    g.fillStyle(GLOW, 0.88);
    g.fillCircle(poleTipX + 4, -4 + by, flameR * 0.42);

    // Orbiting sparks (4 dots)
    if (flameR > 8) {
      g.fillStyle(FLAME, 0.85);
      for (let si = 0; si < 5; si++) {
        const ang = (si / 5) * Math.PI * 2 + frame * 0.8;
        const r   = flameR * 0.78;
        g.fillCircle(
          poleTipX + 4 + Math.cos(ang) * r,
          -4 + by  + Math.sin(ang) * r * 0.55,
          1.8
        );
      }
      // Drip sparks falling down-forward
      g.fillStyle(GLOW, 0.6);
      g.fillCircle(poleTipX + 6, 2 + by, 2);
      g.fillCircle(poleTipX + 9, 4 + by, 1.5);
    }
  } else if (state === 'idle' || state === 'deploy' || state === 'walk') {
    // Smouldering ember: tiny pulsing glow at tip
    const ember = 0.3 + Math.sin(frame * 0.7) * 0.2;
    g.fillStyle(FLAME, ember);
    g.fillCircle(poleTipX + 4, -4 + by, 3.5);
    g.fillStyle(GLOW, ember * 0.5);
    g.fillCircle(poleTipX + 4, -4 + by, 1.8);
  }

  // ── Neck ──────────────────────────────────────────────────────────────────
  _px(g, -3 + bx, -23 + by, 7, 10, SKIN);
  // Neck shadow
  _px(g, -1 + bx, -23 + by, 2, 10, 0x9c5a38, 0.4);

  // ── Head ──────────────────────────────────────────────────────────────────
  g.fillStyle(SKIN, 1);
  g.fillRoundedRect(-9 + bx, -39 + by, 19, 17, 4);

  // Facial shadow (cheekbone / brow)
  _px(g, -7 + bx, -35 + by, 15, 6, 0x9c5a38, 0.35);

  // Eyes
  _px(g, -6 + bx, -34 + by, 3, 3, 0x1c1008);
  _px(g,  3 + bx, -34 + by, 3, 3, 0x1c1008);

  // Beard stubble (bottom of face)
  g.fillStyle(0x7c3d0a, 0.4);
  g.fillRect(-5 + bx, -26 + by, 11, 4);

  // ── Helmet ────────────────────────────────────────────────────────────────
  g.fillStyle(HELMET, 1);
  g.fillRoundedRect(-10 + bx, -44 + by, 21, 13, 5);

  // Helmet brow rim
  _px(g, -11 + bx, -33 + by, 23, 3, DARK);

  // Helmet highlight (left bevel)
  g.fillStyle(0xa02828, 0.55);
  g.fillRect(-9 + bx, -43 + by, 3, 11);

  // Centre rib on helmet
  _px(g, -1 + bx, -44 + by, 3, 13, DARK, 0.6);

  // ── Red plume (tassel on helmet top) ─────────────────────────────────────
  _px(g, -2 + bx, -52 + by, 5, 10, PLUME);
  _px(g, -3 + bx, -53 + by, 7,  3, PLUME, 0.8);

  // Plume flowing strands (two arcs that wave with idle bob)
  const pWave = Math.sin(frame * 0.9) * 2.5;
  g.lineStyle(2.5, PLUME, 0.92);
  g.beginPath(); g.moveTo(0 + bx, -52 + by); g.lineTo(-5 + bx + pWave, -62 + by); g.strokePath();
  g.beginPath(); g.moveTo(4 + bx, -52 + by); g.lineTo( 9 + bx + pWave, -62 + by); g.strokePath();
  // Plume tips
  g.fillStyle(PLUME, 0.82);
  g.fillCircle(-5 + bx + pWave, -63 + by, 2.5);
  g.fillCircle( 9 + bx + pWave, -63 + by, 2.5);

  // ── Damage flash overlay ──────────────────────────────────────────────────
  if (state === 'hurt' && frame % 2 === 0) {
    g.fillStyle(0xffffff, 0.24);
    g.fillRoundedRect(-14 + bx, -44 + by, 30, 72, 4);
  }
});

// v1.0.1: fire_lancer is the renamed id — register same draw function under new key
GW.SpriteRegistry.registerChar('fire_lancer',
  GW.SpriteRegistry.getCharDraw('fire_lance_gunner')
);


// ═════════════════════════════════════════════════════════════════════════════
//  2.  PLASMA ENERGY GENERATOR
//      Sprite-sheet ref: IDLE(8), SPIN/CHARGE(8), ENERGY BUILD UP(8),
//                        DROP/RELEASE(4), COLLECT/RECHARGE(6), COLLECT EFFECT(6)
// ═════════════════════════════════════════════════════════════════════════════
GW.SpriteRegistry.registerChar('plasma_energy_generator', (g, def, frame, state) => {
  g.clear();

  // ── Colour palette ────────────────────────────────────────────────────────
  const BODY_DK  = 0x1e3a5f;   // dark navy body
  const BODY_MD  = 0x2d5a8e;   // mid-blue panels
  const RING_AMB = 0xd97706;   // golden amber trim
  const LEG      = 0x374151;   // claw-foot grey
  const ORB_FILL = 0x3b82f6;   // plasma orb blue
  const ORB_LIT  = 0x60a5fa;   // bright orb centre
  const ORB_GLOW = 0xbfdbfe;   // outer halo
  const ORBIT    = 0x22d3ee;   // cyan orbital ring
  const LIGHTNING = 0xffffff;  // inner bolt
  const AMBER    = 0xf59e0b;   // warm energy accent
  const RIVET    = 0x6b7280;   // body bolts

  // ── Per-state values ──────────────────────────────────────────────────────
  const f8 = frame % 8;
  const f6 = frame % 6;

  const idleBob = (state === 'idle' || state === 'deploy')
    ? Math.sin(frame * 0.4) * 1.2
    : 0;

  const orbitSpeed = state === 'attack' ? 0.6  : 0.2;
  const orbitAngle = frame * orbitSpeed;

  let chargeLevel = 0;
  if (state === 'idle' || state === 'deploy') {
    chargeLevel = 0.35 + Math.sin(frame * 0.38) * 0.12;
  } else if (state === 'attack') {
    chargeLevel = f8 < 4
      ? 0.4 + (f8 / 4) * 0.5
      : 0.9 + ((f8 - 4) / 4) * 0.1;
  } else if (state === 'hurt') {
    chargeLevel = 0.15 + Math.sin(frame * 0.5) * 0.1;
  } else if (state === 'die') {
    chargeLevel = Math.max(0, 0.5 - frame * 0.1);
  }

  const orbR     = 10 + chargeLevel * 6;
  const glowR    = orbR + 8 + chargeLevel * 10;
  const by       = idleBob;

  // ── Ground shadow ─────────────────────────────────────────────────────────
  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(0, 26 + by, 44, 9);

  // ── Three claw-feet ───────────────────────────────────────────────────────
  const fy = 18 + by;
  g.fillStyle(LEG, 1);
  // Left foot
  g.fillRect(-18, fy,     5, 8);
  g.fillRect(-22, fy + 4, 10, 4);
  // Centre foot
  g.fillRect(-3,  fy,     5, 8);
  g.fillRect(-5,  fy + 4, 10, 4);
  // Right foot
  g.fillRect(12,  fy,     5, 8);
  g.fillRect( 8,  fy + 4, 10, 4);
  // Amber foot-cap strips
  g.fillStyle(RING_AMB, 0.82);
  g.fillRect(-22, fy + 7, 10, 2);
  g.fillRect(-5,  fy + 7, 10, 2);
  g.fillRect( 8,  fy + 7, 10, 2);
  // Foot claw-tips (3 tiny points per foot)
  g.fillStyle(LEG, 0.85);
  [-21, -19, -17].forEach(cx => g.fillTriangle(cx, fy + 12, cx - 1, fy + 15, cx + 1, fy + 15));
  [-4,  -2,   0].forEach(cx => g.fillTriangle(cx, fy + 12, cx - 1, fy + 15, cx + 1, fy + 15));
  [ 9,  11,  13].forEach(cx => g.fillTriangle(cx, fy + 12, cx - 1, fy + 15, cx + 1, fy + 15));

  // ── Base platform ─────────────────────────────────────────────────────────
  const baseY = 8 + by;
  g.fillStyle(BODY_DK, 1);
  g.fillRoundedRect(-18, baseY, 36, 12, 3);
  // Amber trim top & bottom
  g.fillStyle(RING_AMB, 0.88);
  g.fillRect(-17, baseY,      34, 2);
  g.fillRect(-17, baseY + 10, 34, 2);
  // Panel detail (3 rectangles inside base)
  g.fillStyle(BODY_MD, 1);
  g.fillRect(-12, baseY + 3,  9, 5);
  g.fillRect( -1, baseY + 3,  9, 5);
  g.fillRect( 10, baseY + 3,  6, 5);
  // Panel bevel highlight
  g.fillStyle(0x3b82f6, 0.18);
  g.fillRect(-12, baseY + 3, 2, 5);
  g.fillRect( -1, baseY + 3, 2, 5);

  // ── Lower cylindrical tower body ──────────────────────────────────────────
  g.fillStyle(BODY_MD, 1);
  g.fillRoundedRect(-11, -16 + by, 22, 26, 4);

  // Centre dark stripe
  g.fillStyle(BODY_DK, 0.55);
  g.fillRect(-3, -15 + by, 7, 24);

  // Left-edge highlight
  g.fillStyle(0x3b82f6, 0.2);
  g.fillRect(-11, -16 + by, 3, 26);

  // Horizontal amber groove rings (3)
  g.fillStyle(RING_AMB, 0.78);
  g.fillRect(-12, -9  + by, 24, 2);
  g.fillRect(-12, -2  + by, 24, 2);
  g.fillRect(-12,  5  + by, 24, 2);

  // Side rivet bolts
  g.fillStyle(RIVET, 1);
  g.fillCircle(-12, -5 + by, 2);
  g.fillCircle( 12, -5 + by, 2);

  // ── Mid amber accent ring (wider, separates lower from upper) ─────────────
  g.fillStyle(RING_AMB, 0.92);
  g.fillRoundedRect(-14, -18 + by, 28, 5, 2);
  // Ring inner shadow
  g.fillStyle(BODY_DK, 0.4);
  g.fillRect(-12, -17 + by, 24, 3);

  // ── Upper tower segment (narrower) ────────────────────────────────────────
  g.fillStyle(BODY_MD, 0.92);
  g.fillRoundedRect(-9, -34 + by, 18, 18, 4);

  // Left highlight
  g.fillStyle(0x3b82f6, 0.28);
  g.fillRect(-9, -34 + by, 3, 18);

  // Upper amber rings
  g.fillStyle(RING_AMB, 0.88);
  g.fillRect(-10, -36 + by, 20, 3);
  g.fillRect(-10, -17 + by, 20, 3);

  // Small indicator LED
  const ledCol = state === 'attack' ? AMBER : ORBIT;
  const ledPulse = 0.55 + Math.sin(frame * 0.9) * 0.35;
  g.fillStyle(ledCol, ledPulse);
  g.fillCircle(-5, -24 + by, 2.5);
  g.lineStyle(1, ledCol, ledPulse * 0.4);
  g.strokeCircle(-5, -24 + by, 4.5);

  // ── Orb housing platform ring ─────────────────────────────────────────────
  const houseY = -38 + by;
  g.fillStyle(BODY_DK, 1);
  g.fillEllipse(0, houseY, 26, 8);
  g.lineStyle(2, RING_AMB, 0.88);
  g.strokeEllipse(0, houseY, 26, 8);

  // ── Plasma orb (main feature, top of tower) ───────────────────────────────
  const orbY = -49 + by;

  // Outer soft halo
  g.fillStyle(ORB_GLOW, 0.08 + chargeLevel * 0.14);
  g.fillCircle(0, orbY, glowR);

  // Secondary glow ring
  g.fillStyle(ORB_FILL, 0.18 + chargeLevel * 0.24);
  g.fillCircle(0, orbY, orbR + 5);

  // Main orb body
  g.fillStyle(ORB_FILL, 0.92);
  g.fillCircle(0, orbY, orbR);

  // Bright inner core (offset up-left for 3D look)
  g.fillStyle(ORB_LIT, 0.88);
  g.fillCircle(-2, orbY - 2, orbR * 0.52);

  // Specular glint (top-left)
  g.fillStyle(0xffffff, 0.62);
  g.fillCircle(-orbR * 0.4, orbY - orbR * 0.4, orbR * 0.22);

  // ── Lightning bolt inside orb (visible at charge > 0.5) ─────────────────
  if (chargeLevel > 0.5) {
    const la = (chargeLevel - 0.5) / 0.5;
    g.lineStyle(1.8, LIGHTNING, la * 0.92);
    g.beginPath();
    g.moveTo(0,  orbY - orbR * 0.55);
    g.lineTo(-3, orbY);
    g.lineTo( 2, orbY);
    g.lineTo(-2, orbY + orbR * 0.55);
    g.strokePath();
    if (la > 0.45) {
      g.lineStyle(1.2, LIGHTNING, la * 0.6);
      g.beginPath();
      g.moveTo( 4, orbY - orbR * 0.38);
      g.lineTo( 2, orbY - 2);
      g.lineTo( 5, orbY + orbR * 0.38);
      g.strokePath();
    }
  }

  // ── Orbital ring ──────────────────────────────────────────────────────────
  const rW = orbR * 2.4 + chargeLevel * 4;
  const rH = rW * 0.28;

  g.lineStyle(2, ORBIT, 0.88);
  g.strokeEllipse(0, orbY, rW, rH);

  // Primary dot on ring (orbits around)
  const dotX = Math.cos(orbitAngle) * (rW / 2);
  const dotY = Math.sin(orbitAngle) * (rH / 2) + orbY;
  g.fillStyle(ORBIT, 1);
  g.fillCircle(dotX, dotY, 2.8);

  // Trailing dot (opposite side, dimmer)
  const dot2X = Math.cos(orbitAngle + Math.PI) * (rW / 2);
  const dot2Y = Math.sin(orbitAngle + Math.PI) * (rH / 2) + orbY;
  g.fillStyle(ORBIT, 0.38);
  g.fillCircle(dot2X, dot2Y, 1.6);

  // ── Floating energy particles (during attack / charge) ────────────────────
  if (state === 'attack' && chargeLevel > 0.55) {
    const particleCount = 5;
    for (let pi = 0; pi < particleCount; pi++) {
      const ang  = (pi / particleCount) * Math.PI * 2 + frame * 0.65;
      const dist = 16 + chargeLevel * 10;
      const px   = Math.cos(ang) * dist;
      const py   = orbY + Math.sin(ang) * dist * 0.5;
      g.fillStyle(AMBER, 0.38 + chargeLevel * 0.5);
      g.fillCircle(px, py, 2 + chargeLevel * 1.5);
    }
  }

  // ── Hurt flash ────────────────────────────────────────────────────────────
  if (state === 'hurt' && frame % 2 === 0) {
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(-18, -55 + by, 36, 80, 4);
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  3.  COMMON ALIEN  (vex_drone / ALN-001)
//      Sprite-sheet ref: IDLE(6), WALK(6), RUN(8), ATTACK(8), TAKE DAMAGE(4),
//                        DEATH(6), HURT(4), BITE/MELEE(6), JUMP(6), SPECIAL(4)
//
//  Drawn as proper alien: large domed head with cranial ridges, three glowing
//  magenta eyes, spindly arm-claws, chunky purple body with energy core,
//  digitigrade legs (bent-knee), ground claws.
// ═════════════════════════════════════════════════════════════════════════════
GW.SpriteRegistry.registerEnemy('vex_drone', (g, def, frame, state) => {
  g.clear();

  // ── Colour palette ────────────────────────────────────────────────────────
  const BODY   = def.color       || 0x4c3b7a;  // deep purple body
  const LIGHT  = def.accentColor || 0x7c6ab5;  // lighter purple accent
  const DARK   = 0x2a1a4e;                      // very dark purple shadow
  const EYE    = def.eyeColor    || 0xe879f9;  // hot pink / magenta eyes
  const CORE   = 0xa855f7;                      // violet chest core
  const CLAW   = 0x9f7ded;                      // claw highlight

  const f8 = frame % 8;
  const f6 = frame % 6;

  // ── Per-state parameters ──────────────────────────────────────────────────
  let bob      = 0;
  let walkLeg  = 0;  // leg phase for walk
  let armRaiseL = 0; // left arm raised (attack)
  let armExtR   = 0; // right arm extended (attack)
  let hurtX     = 0;
  let dying     = false;

  switch (state) {
    case 'idle':
      bob = Math.sin(frame * 0.5) * 1.5;
      break;
    case 'walk':
      bob     = Math.sin(frame * 1.0) * 2;
      walkLeg = frame;
      break;
    case 'attack': {
      bob = Math.sin(frame * 0.5) * 1;
      // frames 0-3: rear back; 4-7: lunge forward
      if (f8 < 4) {
        armRaiseL = f8 * 3;
        armExtR   = -f8 * 2;
      } else {
        armExtR   = (f8 - 4) * 6;
        armRaiseL = Math.max(0, 12 - (f8 - 4) * 4);
      }
      break;
    }
    case 'hurt':
      hurtX = (frame % 4 < 2) ? -5 : 0;
      bob   = 2;
      break;
    case 'die':
      dying = true;
      break;
  }

  const bx = hurtX;
  const by = bob;

  // ── Prone / death ─────────────────────────────────────────────────────────
  if (dying && frame >= 4) {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0 + bx, 20, 50, 10);
    // Body slouched forward-flat
    g.fillStyle(BODY, 0.78);
    g.fillEllipse(-2 + bx, 12, 44, 16);
    // Head to the side
    g.fillStyle(BODY, 0.78);
    g.fillRoundedRect(-18 + bx, 2, 26, 16, 5);
    // Eyes dim
    g.fillStyle(EYE, 0.25);
    g.fillCircle(-10 + bx, 9, 4);
    g.fillCircle(-4  + bx, 9, 3);
    // Core faded
    g.fillStyle(CORE, 0.12);
    g.fillCircle(-2 + bx, 14, 6);
    return;
  }

  // ── Ground shadow ─────────────────────────────────────────────────────────
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0 + bx, 32 + by, 46, 10);

  // ── Legs: digitigrade (bent-knee style) ───────────────────────────────────
  // Upper thigh
  const lThighX = walkLeg ? Math.sin(frame * 0.9) * 3 : 0;
  const rThighX = walkLeg ? Math.sin(frame * 0.9 + Math.PI) * 3 : 0;

  g.fillStyle(BODY, 1);
  g.fillRect(-12 + bx + lThighX, 10 + by, 8, 14);  // left thigh
  g.fillRect(  4 + bx + rThighX, 10 + by, 8, 14);  // right thigh

  // Lower leg (shin, angled out)
  g.fillStyle(LIGHT, 0.85);
  g.fillRect(-14 + bx + lThighX,  22 + by, 6, 10);
  g.fillRect(  8 + bx + rThighX,  22 + by, 6, 10);

  // Ground claws (3 toe-spikes each)
  g.fillStyle(CLAW, 1);
  [-17, -14, -11].forEach(cx => {
    g.fillTriangle(cx + bx + lThighX, 32 + by, cx - 1 + bx + lThighX, 37 + by, cx + 2 + bx + lThighX, 37 + by);
  });
  [7, 10, 13].forEach(cx => {
    g.fillTriangle(cx + bx + rThighX, 32 + by, cx - 1 + bx + rThighX, 37 + by, cx + 2 + bx + rThighX, 37 + by);
  });

  // ── Body (torso — bulbous, oval) ──────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillEllipse(0 + bx, 0 + by, 32, 26);

  // Body side ridges
  g.lineStyle(1.5, DARK, 0.6);
  g.beginPath(); g.moveTo(-10 + bx, -9 + by); g.lineTo(-12 + bx, 10 + by); g.strokePath();
  g.beginPath(); g.moveTo( 10 + bx, -9 + by); g.lineTo( 12 + bx, 10 + by); g.strokePath();

  // Belly highlight
  g.fillStyle(LIGHT, 0.28);
  g.fillEllipse(2 + bx, 2 + by, 18, 14);

  // ── Chest energy core ─────────────────────────────────────────────────────
  const corePulse = 0.5 + Math.sin(frame * 0.6) * 0.25;
  g.fillStyle(CORE, 0.32);
  g.fillCircle(0 + bx, 0 + by, 10);
  g.fillStyle(CORE, corePulse);
  g.fillCircle(0 + bx, 0 + by, 5);
  // Core bright centre
  g.fillStyle(EYE, corePulse * 0.7);
  g.fillCircle(0 + bx, 0 + by, 2.5);

  // ── Arms (spindly, long, 4 segments each) ─────────────────────────────────
  // Left arm
  const laAngle = (-0.6 + armRaiseL * 0.06);
  const laEndX  = -22 + bx + Math.cos(laAngle) * 20;
  const laEndY  =   5 + by + Math.sin(laAngle) * 20;
  g.fillStyle(BODY, 1);
  g.lineStyle(5, BODY, 1);
  g.beginPath(); g.moveTo(-10 + bx, -1 + by); g.lineTo(laEndX, laEndY); g.strokePath();
  g.lineStyle(4, LIGHT, 0.6);
  g.beginPath(); g.moveTo(-10 + bx, -1 + by); g.lineTo(laEndX, laEndY); g.strokePath();
  // Left claw
  g.fillStyle(CLAW, 1);
  g.fillCircle(laEndX, laEndY, 4.5);
  g.fillStyle(LIGHT, 0.7);
  g.fillCircle(laEndX - 1, laEndY - 1, 2);

  // Right arm — static, gripping the weapon stick.
  // The stick itself is drawn/animated by the enemy's _stickGfx layer
  // (pivot at ~18,5), so this arm no longer extends or glows on attack.
  const raBaseX = 10 + bx;
  const raBaseY = -1 + by;
  const raEndX  = 18 + bx;   // meets the stick pivot
  const raEndY  =  5 + by;
  g.lineStyle(5, BODY, 1);
  g.beginPath(); g.moveTo(raBaseX, raBaseY); g.lineTo(raEndX, raEndY); g.strokePath();
  g.lineStyle(4, LIGHT, 0.6);
  g.beginPath(); g.moveTo(raBaseX, raBaseY); g.lineTo(raEndX, raEndY); g.strokePath();
  // Gripping claw (holds the stick)
  g.fillStyle(CLAW, 1);
  g.fillCircle(raEndX, raEndY, 4.5);
  g.fillStyle(LIGHT, 0.7);
  g.fillCircle(raEndX - 1, raEndY - 1, 2);

  // ── Neck (short, thick) ───────────────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillEllipse(0 + bx, -11 + by, 18, 12);

  // ── Head (large dome cranium, wider than body) ────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillRoundedRect(-17 + bx, -32 + by, 34, 22, 7);

  // Head lighter top
  g.fillStyle(LIGHT, 0.22);
  g.fillRoundedRect(-15 + bx, -32 + by, 30, 10, 5);

  // ── Cranial ridges on top of head ─────────────────────────────────────────
  g.fillStyle(LIGHT, 0.88);
  const ridgePositions = [-10, -4, 2, 8];
  ridgePositions.forEach(rx => {
    g.fillTriangle(rx + bx, -32 + by, rx - 3 + bx, -40 + by, rx + 3 + bx, -40 + by);
  });
  // Ridge shadow
  g.fillStyle(DARK, 0.55);
  ridgePositions.forEach(rx => {
    g.fillTriangle(rx + 1 + bx, -32 + by, rx + 1 + bx, -40 + by, rx + 3 + bx, -40 + by);
  });

  // ── Eyes — three glowing orbs ─────────────────────────────────────────────
  // Left eye (large)
  g.fillStyle(DARK, 1);
  g.fillCircle(-9 + bx, -21 + by, 6);
  g.fillStyle(EYE, 1);
  g.fillCircle(-9 + bx, -21 + by, 5);
  g.fillStyle(0xfde047, 0.6);  // inner iris
  g.fillCircle(-9 + bx, -21 + by, 2.5);
  g.fillStyle(DARK, 1);
  g.fillCircle(-9 + bx, -21 + by, 1.2); // pupil

  // Middle eye (smaller, central)
  g.fillStyle(DARK, 1);
  g.fillCircle(0 + bx, -23 + by, 4.2);
  g.fillStyle(EYE, 1);
  g.fillCircle(0 + bx, -23 + by, 3.5);
  g.fillStyle(0xfde047, 0.5);
  g.fillCircle(0 + bx, -23 + by, 1.8);

  // Right eye (large)
  g.fillStyle(DARK, 1);
  g.fillCircle(9 + bx, -21 + by, 6);
  g.fillStyle(EYE, 1);
  g.fillCircle(9 + bx, -21 + by, 5);
  g.fillStyle(0xfde047, 0.6);
  g.fillCircle(9 + bx, -21 + by, 2.5);
  g.fillStyle(DARK, 1);
  g.fillCircle(9 + bx, -21 + by, 1.2);

  // Eye glow rings (pulsing during attack or idle)
  const eyeGlow = (state === 'attack') ? 0.7 : 0.25 + Math.sin(frame * 0.5) * 0.15;
  g.lineStyle(1.5, EYE, eyeGlow);
  g.strokeCircle(-9 + bx, -21 + by, 7);
  g.strokeCircle( 9 + bx, -21 + by, 7);

  // ── Mouth ─────────────────────────────────────────────────────────────────
  // Slit opening with teeth
  g.fillStyle(0x0a0015, 0.9);
  g.fillRoundedRect(-8 + bx, -12 + by, 16, 4, 2);
  g.fillStyle(LIGHT, 0.75);
  for (let ti = 0; ti < 3; ti++) {
    g.fillTriangle(-5 + bx + ti * 5, -12 + by, -3 + bx + ti * 5, -8 + by, -1 + bx + ti * 5, -12 + by);
  }

  // ── Damage flash ──────────────────────────────────────────────────────────
  if (state === 'hurt' && frame % 2 === 0) {
    g.fillStyle(0xffffff, 0.26);
    g.fillRoundedRect(-18 + bx, -42 + by, 36, 78, 6);
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  4.  VEX FLAG BEARER  (ALN-015 — pink horde leader)
//      Sprite-sheet ref: IDLE(6), WALK(6), RUN(8), ATTACK(8),
//                        THROW/FLAG WAVE(8), TAKE DAMAGE(4), HURT(4), DEATH(6),
//                        JUMP(6), SPECIAL(4)
//
//  Based on same body shape as vex_drone but:
//    • Hot-pink/fuchsia colouring (#e879f9 → #c026d3 accents)
//    • Pointed elf-like ears
//    • Two large violet oval eyes (not three)
//    • Holds a red flag on a gold pole in right hand always
//    • Flag "throws"/swings overhead on THROW animation
//    • Slightly leaner / faster look (1.5× speed canon)
// ═════════════════════════════════════════════════════════════════════════════
GW.SpriteRegistry.registerEnemy('vex_flag_bearer', (g, def, frame, state) => {
  g.clear();

  // ── Colour palette ────────────────────────────────────────────────────────
  const BODY    = def.color       || 0xe879f9;  // hot pink body
  const ACC     = def.accentColor || 0xc026d3;  // deep magenta accent
  const DARK    = 0x7e22ce;                      // dark purple shadow
  const EYE     = def.eyeColor    || 0xa855f7;  // violet eyes
  const CORE    = 0xc084fc;                      // lighter violet core
  const CLAW    = 0xf0abfc;                      // pale pink claws
  const POLE    = 0xd97706;                      // gold flag pole
  const FLAG    = 0xef4444;                      // red flag
  const EMBLEM  = 0xffffff;                      // emblem on flag

  const f8 = frame % 8;
  const f6 = frame % 6;

  // ── Per-state parameters ──────────────────────────────────────────────────
  let bob       = 0;
  let walkLeg   = 0;
  let armSwing  = 0;   // flag pole swing angle for THROW
  let hurtX     = 0;
  let dying     = false;
  let flagWave  = Math.sin(frame * 0.9) * 5;  // default gentle flag wave

  switch (state) {
    case 'idle':
      bob = Math.sin(frame * 0.5) * 1.5;
      break;
    case 'walk':
      bob     = Math.sin(frame * 1.1) * 2.5;
      walkLeg = frame;
      break;
    case 'attack':
      bob = Math.sin(frame * 0.6) * 1;
      // Claw slash: left arm lunges
      break;
    case 'hurt':
      hurtX = (frame % 4 < 2) ? -6 : 0;
      bob   = 3;
      flagWave = Math.sin(frame * 2.5) * 8;  // flag flails
      break;
    case 'die':
      dying = true;
      break;
  }
  // THROW / flag-wave state: flag swings aggressively overhead
  const isThrow = (state === 'attack' && def.isFlag);
  if (state === 'attack') {
    flagWave = Math.sin(frame * 1.8) * 10;
  }

  const bx = hurtX;
  const by = bob;

  // ── Prone / death ─────────────────────────────────────────────────────────
  if (dying && frame >= 4) {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0 + bx, 22, 52, 10);
    // Fallen body
    g.fillStyle(BODY, 0.72);
    g.fillEllipse(2 + bx, 14, 46, 16);
    // Head sideways
    g.fillStyle(BODY, 0.72);
    g.fillRoundedRect(-18 + bx, 2, 26, 16, 5);
    g.fillStyle(EYE, 0.22);
    g.fillEllipse(-8 + bx, 9, 8, 10);
    // Flag pole lying flat
    g.fillStyle(POLE, 0.65);
    g.fillRect(10 + bx, 18, 42, 3);
    // Flag flat
    g.fillStyle(FLAG, 0.45);
    g.fillRect(26 + bx, 12, 24, 10);
    return;
  }

  // ── Ground shadow ─────────────────────────────────────────────────────────
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(0 + bx, 34 + by, 48, 10);

  // ── Legs (digitigrade, slightly longer/leaner than drone) ─────────────────
  const lTX = walkLeg ? Math.sin(frame * 1.0) * 3.5 : 0;
  const rTX = walkLeg ? Math.sin(frame * 1.0 + Math.PI) * 3.5 : 0;

  g.fillStyle(BODY, 1);
  g.fillRect(-12 + bx + lTX, 12 + by, 8, 14);
  g.fillRect(  4 + bx + rTX, 12 + by, 8, 14);

  g.fillStyle(ACC, 0.85);
  g.fillRect(-14 + bx + lTX, 24 + by, 6, 11);
  g.fillRect(  8 + bx + rTX, 24 + by, 6, 11);

  // Ground claws
  g.fillStyle(CLAW, 1);
  [-17, -14, -11].forEach(cx => {
    g.fillTriangle(cx + bx + lTX, 35 + by, cx - 1 + bx + lTX, 40 + by, cx + 2 + bx + lTX, 40 + by);
  });
  [7, 10, 13].forEach(cx => {
    g.fillTriangle(cx + bx + rTX, 35 + by, cx - 1 + bx + rTX, 40 + by, cx + 2 + bx + rTX, 40 + by);
  });

  // ── Body ──────────────────────────────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillEllipse(0 + bx, 2 + by, 30, 24);

  // Body accent stripes
  g.lineStyle(1.5, ACC, 0.5);
  g.beginPath(); g.moveTo(-9 + bx, -7 + by); g.lineTo(-11 + bx, 12 + by); g.strokePath();
  g.beginPath(); g.moveTo( 9 + bx, -7 + by); g.lineTo( 11 + bx, 12 + by); g.strokePath();

  // Belly highlight
  g.fillStyle(CLAW, 0.22);
  g.fillEllipse(1 + bx, 3 + by, 16, 12);

  // ── Chest core ────────────────────────────────────────────────────────────
  const cp = 0.5 + Math.sin(frame * 0.7) * 0.25;
  g.fillStyle(CORE, 0.3);
  g.fillCircle(0 + bx, 2 + by, 9);
  g.fillStyle(CORE, cp);
  g.fillCircle(0 + bx, 2 + by, 4.5);
  g.fillStyle(EMBLEM, cp * 0.5);
  g.fillCircle(0 + bx, 2 + by, 2);

  // ── Left arm (attack / slash) ─────────────────────────────────────────────
  const laY    = (state === 'attack' && f8 >= 4) ? -5 - (f8 - 4) * 5 : 4;
  const laExtX = (state === 'attack' && f8 >= 4) ? -8 - (f8 - 4) * 4 : 0;

  g.lineStyle(5, BODY, 1);
  g.beginPath(); g.moveTo(-10 + bx, -2 + by); g.lineTo(-24 + bx + laExtX, laY + by); g.strokePath();
  g.lineStyle(4, ACC, 0.55);
  g.beginPath(); g.moveTo(-10 + bx, -2 + by); g.lineTo(-24 + bx + laExtX, laY + by); g.strokePath();

  g.fillStyle(CLAW, 1);
  g.fillCircle(-24 + bx + laExtX, laY + by, 4.5);

  // Slash marks (attack only)
  if (state === 'attack' && f8 >= 4) {
    g.lineStyle(1.5, BODY, 0.7);
    const sx = -24 + bx + laExtX;
    const sy = laY + by;
    g.beginPath(); g.moveTo(sx - 8, sy - 6); g.lineTo(sx + 2, sy + 4); g.strokePath();
    g.beginPath(); g.moveTo(sx - 5, sy - 8); g.lineTo(sx + 5, sy + 2); g.strokePath();
  }

  // ── Right arm (always holds flag pole) ────────────────────────────────────
  g.lineStyle(5, BODY, 1);
  g.beginPath(); g.moveTo(10 + bx, -2 + by); g.lineTo(16 + bx, -14 + by); g.strokePath();
  g.lineStyle(4, ACC, 0.5);
  g.beginPath(); g.moveTo(10 + bx, -2 + by); g.lineTo(16 + bx, -14 + by); g.strokePath();

  g.fillStyle(CLAW, 1);
  g.fillCircle(16 + bx, -14 + by, 4);

  // ── Flag pole + flag ──────────────────────────────────────────────────────
  // Pole base at right hand, extends upward
  const poleBaseX = 16 + bx;
  const poleBaseY = -14 + by;
  const poleLen   = 52;

  // Calculate pole angle: normally vertical, swings during attack/throw
  let poleAngleDeg = 0;
  if (state === 'attack' || state === 'hurt') {
    // Swing angle: -30 to +30 degrees based on flagWave
    poleAngleDeg = flagWave * 1.2;
  }
  const poleRad = poleAngleDeg * (Math.PI / 180);
  const poleTipX = poleBaseX + Math.sin(poleRad) * poleLen;
  const poleTipY = poleBaseY - Math.cos(poleRad) * poleLen;

  // Draw pole as a thick line
  g.lineStyle(3.5, POLE, 1);
  g.beginPath(); g.moveTo(poleBaseX, poleBaseY); g.lineTo(poleTipX, poleTipY); g.strokePath();

  // Pole gold end-cap / ornament
  g.fillStyle(0xfbbf24, 1);
  g.fillCircle(poleTipX, poleTipY, 3.5);
  // Skull emblem on ornament
  g.fillStyle(DARK, 1);
  g.fillCircle(poleTipX, poleTipY, 2);

  // ── Red flag (hangs/waves from near-top of pole) ───────────────────────────
  // Flag attaches at ~75% up the pole
  const flagAttachX = poleBaseX + Math.sin(poleRad) * (poleLen * 0.75);
  const flagAttachY = poleBaseY - Math.cos(poleRad) * (poleLen * 0.75);

  // Flag shape: triangle pointing right + waving offset
  const fw = 18;  // flag width
  const fh = 14;  // flag height
  const fWave = flagWave * 0.8;

  // Flag body (red triangle/parallelogram)
  g.fillStyle(FLAG, 0.95);
  g.fillTriangle(
    flagAttachX,          flagAttachY,
    flagAttachX + fw,     flagAttachY + fh * 0.3 + fWave,
    flagAttachX,          flagAttachY + fh
  );

  // Flag shading (darker left edge)
  g.fillStyle(0xb91c1c, 0.55);
  g.fillTriangle(
    flagAttachX,      flagAttachY,
    flagAttachX + 6,  flagAttachY + fh * 0.3 + fWave,
    flagAttachX,      flagAttachY + fh
  );

  // Flag emblem (white circle + mark)
  const embX = flagAttachX + fw * 0.5;
  const embY = flagAttachY + fh * 0.5 + fWave * 0.5;
  g.fillStyle(EMBLEM, 0.62);
  g.fillCircle(embX, embY, 3.5);
  // Small alien skull mark inside flag emblem
  g.fillStyle(DARK, 0.8);
  g.fillCircle(embX, embY, 1.5);

  // ── Neck ──────────────────────────────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillEllipse(0 + bx, -9 + by, 16, 11);

  // ── Head ──────────────────────────────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillRoundedRect(-16 + bx, -30 + by, 32, 22, 6);

  // Head lighter top dome
  g.fillStyle(CLAW, 0.18);
  g.fillRoundedRect(-14 + bx, -30 + by, 28, 10, 5);

  // ── Pointed ears ──────────────────────────────────────────────────────────
  // Left ear
  g.fillStyle(BODY, 1);
  g.fillTriangle(-16 + bx, -22 + by, -26 + bx, -36 + by, -10 + bx, -18 + by);
  // Left ear inner
  g.fillStyle(ACC, 0.55);
  g.fillTriangle(-16 + bx, -22 + by, -22 + bx, -33 + by, -12 + bx, -20 + by);

  // Right ear
  g.fillStyle(BODY, 1);
  g.fillTriangle(16 + bx, -22 + by, 26 + bx, -36 + by, 10 + bx, -18 + by);
  // Right ear inner
  g.fillStyle(ACC, 0.55);
  g.fillTriangle(16 + bx, -22 + by, 22 + bx, -33 + by, 12 + bx, -20 + by);

  // ── Cranial ridges ────────────────────────────────────────────────────────
  g.fillStyle(ACC, 0.85);
  [-9, -3, 3, 9].forEach(rx => {
    g.fillTriangle(rx + bx, -30 + by, rx - 3 + bx, -38 + by, rx + 3 + bx, -38 + by);
  });
  // Ridge shadow
  g.fillStyle(DARK, 0.45);
  [-9, -3, 3, 9].forEach(rx => {
    g.fillTriangle(rx + 1 + bx, -30 + by, rx + 1 + bx, -38 + by, rx + 3 + bx, -38 + by);
  });

  // ── Eyes — two large oval eyes (vs three for common drone) ────────────────
  // Left eye
  g.fillStyle(DARK, 1);
  g.fillEllipse(-8 + bx, -20 + by, 10, 13);
  g.fillStyle(EYE, 1);
  g.fillEllipse(-8 + bx, -20 + by, 9, 12);
  // Iris gradient (lighter inner)
  g.fillStyle(CORE, 0.7);
  g.fillEllipse(-8 + bx, -20 + by, 5, 7);
  g.fillStyle(DARK, 1);
  g.fillEllipse(-8 + bx, -20 + by, 2.5, 3.5);  // pupil

  // Right eye
  g.fillStyle(DARK, 1);
  g.fillEllipse(8 + bx, -20 + by, 10, 13);
  g.fillStyle(EYE, 1);
  g.fillEllipse(8 + bx, -20 + by, 9, 12);
  g.fillStyle(CORE, 0.7);
  g.fillEllipse(8 + bx, -20 + by, 5, 7);
  g.fillStyle(DARK, 1);
  g.fillEllipse(8 + bx, -20 + by, 2.5, 3.5);

  // Eye glow
  const eyeA = state === 'attack' ? 0.75 : 0.3 + Math.sin(frame * 0.6) * 0.18;
  g.lineStyle(1.8, EYE, eyeA);
  g.strokeEllipse(-8 + bx, -20 + by, 12, 16);
  g.strokeEllipse( 8 + bx, -20 + by, 12, 16);

  // ── Fanged mouth ──────────────────────────────────────────────────────────
  g.fillStyle(0x1a0030, 0.9);
  g.fillRoundedRect(-7 + bx, -11 + by, 14, 4, 2);
  // Fangs (3 triangles)
  g.fillStyle(EMBLEM, 0.72);
  g.fillTriangle(-5 + bx, -11 + by, -3 + bx, -7 + by, -1 + bx, -11 + by);
  g.fillTriangle( 1 + bx, -11 + by,  3 + bx, -7 + by,  5 + bx, -11 + by);

  // ── Damage flash ──────────────────────────────────────────────────────────
  if (state === 'hurt' && frame % 2 === 0) {
    g.fillStyle(0xffffff, 0.26);
    g.fillRoundedRect(-18 + bx, -42 + by, 36, 82, 6);
  }
});


// ═════════════════════════════════════════════════════════════════════════════
//  FALLBACK DEFAULTS  (used for any unregistered unit ids)
// ═════════════════════════════════════════════════════════════════════════════

/** Default character — generic pixel soldier. */
GW.SpriteRegistry.registerChar('_default_char', (g, def, frame, state) => {
  g.clear();

  // ── Palette derived from the card def (matches reference pixel style) ────
  const BODY   = def.color       || 0x4d7c0f;
  const DARK   = _shade(BODY, -0.45);
  const LIGHT  = _shade(BODY,  0.28);
  const ACCENT = def.accentColor || 0xa3e635;
  const SKIN   = def.skinColor   || 0xd4956a;
  const HELMET = def.helmetColor || _shade(BODY, -0.25);
  const BOOT   = 0x1c1008;
  const IRON   = 0x6b7280;
  const GLOW   = 0xfef08a;

  // ── Archetype flags drive loadout silhouettes ────────────────────────────
  const isSuicide = !!def.isSuicideUnit;
  const isEnergy  = !isSuicide && (def.role === 'energy' || def.isEnergyGenerator);
  const isSupport = !isSuicide && !!def.isSupport && !def.weapon;
  const hasGun    = !isSuicide && !!def.weapon;

  // ── Per-state animation parameters ───────────────────────────────────────
  let bob = 0, leanX = 0, recoil = 0, hurtX = 0, falling = 0, muzzle = 0, armSwing = 0;
  const f8 = frame % 8;
  switch (state) {
    case 'idle':
    case 'deploy': {
      const b = frame % 6;
      bob = b < 3 ? b * 0.6 : (6 - b) * 0.6;
      break;
    }
    case 'walk':
      bob   = Math.sin(frame * 0.9) * 2;
      leanX = Math.sin(frame * 0.45) * 1.2;
      armSwing = Math.sin(frame * 0.9 + Math.PI) * 3;
      break;
    case 'attack':
      if (f8 < 2)       { recoil = -2;          leanX = -1.5; }
      else if (f8 < 5)  { recoil = (f8 - 2) * 2.5; muzzle = 1; leanX = (f8 - 2); }
      else              { recoil = Math.max(0, 8 - (f8 - 4) * 4); }
      break;
    case 'hurt': {
      const hf = frame % 4;
      hurtX = hf < 2 ? -(hf + 1) * 3 : -6 + (hf - 1) * 3;
      bob   = 2;
      break;
    }
    case 'die':
      falling = Math.min(frame, 5) * 5;
      break;
  }
  const bx = leanX + hurtX;
  const by = bob + falling;

  // ── Prone (defeated) ───────────────────────────────────────────────────────
  if (state === 'die' && frame >= 4) {
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(2, 20, 54, 10);
    _px(g, -22, 8, 44, 12, BODY, 0.85);          // body slumped
    _px(g, -22, 4, 14, 10, SKIN, 0.85);          // head
    _px(g, -28, 6, 12,  8, HELMET, 0.75);        // helmet knocked off
    if (hasGun) _px(g, -14, 18, 40, 3, IRON, 0.7); // weapon on ground
    return;
  }

  // ── Ground shadow ──────────────────────────────────────────────────────────
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(2 + bx, 28 + by, 38, 8);

  // ── Boots ──────────────────────────────────────────────────────────────────
  _px(g, -11 + bx, 18 + by, 9, 7, BOOT);
  _px(g,   2 + bx, 18 + by, 9, 7, BOOT);
  _px(g,  -9 + bx, 18 + by, 3, 2, _shade(BOOT, 0.25), 0.5);
  _px(g,   4 + bx, 18 + by, 3, 2, _shade(BOOT, 0.25), 0.5);

  // ── Legs (armoured greaves, alternate on walk) ─────────────────────────────
  let lLeg = 0, rLeg = 0;
  if (state === 'walk') {
    lLeg = Math.sin(frame * 0.9) * 2;
    rLeg = Math.sin(frame * 0.9 + Math.PI) * 2;
  }
  _px(g, -10 + bx, 6 + by + lLeg, 9, 13, BODY);
  _px(g,   2 + bx, 6 + by + rLeg, 9, 13, BODY);
  _px(g, -11 + bx, 9 + by + lLeg, 11, 3, DARK, 0.6);   // knee guards
  _px(g,   1 + bx, 9 + by + rLeg, 11, 3, DARK, 0.6);
  g.fillStyle(DARK, 0.5);
  g.fillRect(-7 + bx, 6 + by + lLeg, 2, 11);
  g.fillRect( 5 + bx, 6 + by + rLeg, 2, 11);

  // ── Belt ───────────────────────────────────────────────────────────────────
  _px(g, -12 + bx, 5 + by, 25, 3, _shade(BODY, -0.6));
  g.fillStyle(ACCENT, 0.9); g.fillRect(-2 + bx, 5 + by, 5, 3);

  // ── Torso armour ───────────────────────────────────────────────────────────
  g.fillStyle(BODY, 1);
  g.fillRoundedRect(-13 + bx, -14 + by, 27, 21, 3);
  _px(g, -1  + bx, -13 + by, 3, 19, DARK, 0.6);      // centre ridge
  _px(g, -13 + bx, -12 + by, 3, 17, LIGHT, 0.35);    // left bevel highlight
  _px(g,  11 + bx, -12 + by, 3, 17, DARK, 0.5);      // right shade
  g.fillStyle(ACCENT, 0.75); g.fillRect(-8 + bx, -9 + by, 5, 5); // chest emblem

  // ── Shoulder plates ────────────────────────────────────────────────────────
  g.fillStyle(DARK, 1);
  g.fillRoundedRect( 12 + bx, -14 + by, 9, 10, 2);
  g.fillRoundedRect(-20 + bx, -14 + by, 9, 10, 2);
  g.fillStyle(LIGHT, 0.4); g.fillRect(13 + bx, -13 + by, 4, 3);

  // ── Backpack: support antenna / suicide explosive ──────────────────────────
  if (isSupport || isSuicide) {
    _px(g, -23 + bx, -12 + by, 9, 16, _shade(BODY, -0.3));
    if (isSuicide) {
      _px(g, -22 + bx, -10 + by, 7, 12, 0x7f1d1d);
      const blink = (frame % 6 < 3) ? 1 : 0.25;
      g.fillStyle(0xef4444, blink); g.fillCircle(-18 + bx, -6 + by, 2.2);
    } else {
      g.lineStyle(1.5, ACCENT, 0.9);
      g.beginPath(); g.moveTo(-19 + bx, -12 + by); g.lineTo(-21 + bx, -26 + by); g.strokePath();
      g.fillStyle(ACCENT, 0.6 + Math.sin(frame * 0.8) * 0.3);
      g.fillCircle(-21 + bx, -27 + by, 2.4);
    }
  }

  // ── Left arm (passive) ─────────────────────────────────────────────────────
  _px(g, -19 + bx, -10 + by + armSwing, 8, 14, BODY);
  g.fillStyle(SKIN, 1); g.fillCircle(-15 + bx, 3 + by + armSwing, 3.5);

  // ── Right arm (weapon arm, recoils on attack) ──────────────────────────────
  const rax = Math.round(recoil * 0.3);
  _px(g, 12 + bx + rax, -10 + by - armSwing, 10, 7, BODY);
  g.fillStyle(SKIN, 1); g.fillCircle(20 + bx + rax, -6 + by - armSwing, 3.5);

  if (hasGun) {
    const gx = 18 + bx + recoil;
    _px(g, gx,      -8 + by - armSwing, 20, 4, IRON);                 // barrel
    _px(g, gx + 4,  -4 + by - armSwing,  5, 6, _shade(IRON, -0.4));   // grip
    _px(g, gx + 18, -9 + by - armSwing,  5, 6, DARK);                 // muzzle block
    if (muzzle) {
      g.fillStyle(GLOW, 0.9);   g.fillCircle(gx + 27, -6 + by, 5);
      g.fillStyle(ACCENT, 0.55); g.fillCircle(gx + 27, -6 + by, 8);
    }
  } else if (isSupport) {
    const ability = def.specialAbility;
    if (isEnergy) {
      const pulse = 0.5 + Math.sin(frame * 0.7) * 0.3;
      g.fillStyle(ACCENT, pulse * 0.4); g.fillCircle(23 + bx, -5 + by, 8);
      g.fillStyle(ACCENT, pulse);       g.fillCircle(23 + bx, -5 + by, 4);
    } else if (['heal_nearby', 'rapid_repair', 'neutralize_radiation'].includes(ability)) {
      g.fillStyle(0xf8fafc, 0.95); g.fillRect(19 + bx, -12 + by, 4, 14); g.fillRect(14 + bx, -7 + by, 14, 4);
    } else if (['energy_shield', 'plasma_barrier', 'multi_buff'].includes(ability)) {
      g.fillStyle(ACCENT, 0.9);
      g.fillTriangle(17 + bx, -15 + by, 28 + bx, -10 + by, 25 + bx, 3 + by);
      g.fillTriangle(25 + bx, 3 + by, 17 + bx, 8 + by, 14 + bx, -10 + by);
    } else {
      g.lineStyle(2, ACCENT, 0.9);
      g.strokeCircle(21 + bx, -5 + by, 7);
      g.lineBetween(13 + bx, -5 + by, 29 + bx, -5 + by);
      g.lineBetween(21 + bx, -13 + by, 21 + bx, 3 + by);
    }
  } else if (!isSuicide) {
    // Melee blade
    _px(g, 20 + bx + recoil, -9 + by, 3, 16, IRON);
    _px(g, 19 + bx + recoil, -11 + by, 5, 3, ACCENT);
  }

  // ── Neck + head ────────────────────────────────────────────────────────────
  _px(g, -3 + bx, -23 + by, 7, 10, SKIN);
  _px(g, -1 + bx, -23 + by, 2, 10, _shade(SKIN, -0.35), 0.4);
  g.fillStyle(SKIN, 1); g.fillRoundedRect(-9 + bx, -39 + by, 19, 17, 4);
  _px(g, -7 + bx, -35 + by, 15, 5, _shade(SKIN, -0.3), 0.35);  // brow shade
  _px(g, -6 + bx, -34 + by, 3, 3, 0x1c1008);                   // eyes
  _px(g,  3 + bx, -34 + by, 3, 3, 0x1c1008);

  // ── Helmet ─────────────────────────────────────────────────────────────────
  g.fillStyle(HELMET, 1); g.fillRoundedRect(-10 + bx, -44 + by, 21, 13, 5);
  _px(g, -11 + bx, -33 + by, 23, 3, _shade(HELMET, -0.4));         // brow rim
  g.fillStyle(_shade(HELMET, 0.3), 0.5); g.fillRect(-9 + bx, -43 + by, 3, 11); // bevel
  _px(g, -1 + bx, -45 + by, 3, 6, ACCENT, 0.9);                    // crest

  // ── Damage flash overlay ───────────────────────────────────────────────────
  if (state === 'hurt' && frame % 2 === 0) {
    g.fillStyle(0xffffff, 0.24);
    g.fillRoundedRect(-14 + bx, -45 + by, 30, 73, 4);
  }
});

/** Default enemy — detailed pixel alien matching the vex_drone reference style.
 *  Silhouette varies by def.class (brute/fast/aerial/ranged/shield/stealth). */
GW.SpriteRegistry.registerEnemy('_default_enemy', (g, def, frame, state) => {
  g.clear();

  // ── Palette from the enemy def ───────────────────────────────────────────
  const BODY  = def.color       || 0x7c3aed;
  const LIGHT = def.accentColor || _shade(BODY, 0.3);
  const DARK  = _shade(BODY, -0.5);
  const EYE   = def.eyeColor    || 0xe879f9;
  const CORE  = EYE;
  const CLAW  = _shade(BODY, 0.45);

  // ── Class-driven silhouette ──────────────────────────────────────────────
  const cls       = def.class || 'basic';
  const isBrute   = (cls === 'brute' || cls === 'armored' || cls === 'elite');
  const isFast    = (cls === 'fast');
  const isAerial  = (cls === 'aerial' || cls === 'vehicle');
  const isRanged  = (cls === 'ranged');
  const isShield  = (cls === 'shield');
  const isStealth = (cls === 'stealth' || cls === 'special');
  const sw        = isBrute ? 1.3 : isFast ? 0.85 : 1;   // width scale

  // ── Per-state parameters ─────────────────────────────────────────────────
  const f8 = frame % 8;
  let bob = 0, walkLeg = 0, hurtX = 0, dying = false, lunge = 0, hover = 0, armSwing = 0;
  switch (state) {
    case 'idle':
      bob = Math.sin(frame * 0.5) * 1.5;
      break;
    case 'walk':
      bob = Math.sin(frame * 1.0) * 2;
      walkLeg = frame;
      armSwing = Math.sin(frame * 0.9) * 3;
      break;
    case 'attack':
      bob   = Math.sin(frame * 0.5);
      lunge = f8 < 4 ? -f8 : (f8 - 4) * 3;
      break;
    case 'hurt':
      hurtX = (frame % 4 < 2) ? -5 : 0;
      bob = 2;
      break;
    case 'die':
      dying = true;
      break;
  }
  if (isAerial) hover = Math.sin(frame * 0.6) * 4 - 12;  // float above ground

  const bx = hurtX + (isFast ? 2 : 0);
  const by = bob + hover;

  // ── Prone / death ────────────────────────────────────────────────────────
  if (dying && frame >= 4) {
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 20, 50 * sw, 10);
    g.fillStyle(BODY, 0.78);
    g.fillEllipse(-2, 12, 44 * sw, 16);
    g.fillRoundedRect(-18, 2, 26 * sw, 16, 5);
    g.fillStyle(EYE, 0.25);
    g.fillCircle(-10, 9, 4); g.fillCircle(-4, 9, 3);
    return;
  }

  // ── Ground shadow ────────────────────────────────────────────────────────
  g.fillStyle(0x000000, isAerial ? 0.12 : 0.2);
  g.fillEllipse(0, isAerial ? 36 : 32, 46 * sw, 10);

  // ── Legs (digitigrade) or thrusters ──────────────────────────────────────
  if (isAerial) {
    const t = 0.5 + Math.sin(frame * 1.2) * 0.3;
    g.fillStyle(EYE, t * 0.45);
    g.fillEllipse(-8, 22 + by, 10, 16); g.fillEllipse(8, 22 + by, 10, 16);
    g.fillStyle(0xffffff, t * 0.4);
    g.fillEllipse(-8, 20 + by, 4, 8);   g.fillEllipse(8, 20 + by, 4, 8);
  } else {
    const lThighX = walkLeg ? Math.sin(frame * 0.9) * 3 : 0;
    const rThighX = walkLeg ? Math.sin(frame * 0.9 + Math.PI) * 3 : 0;
    g.fillStyle(BODY, 1);
    g.fillRect(-12 * sw + bx + lThighX, 10 + by, 8 * sw, 14);
    g.fillRect(  4 * sw + bx + rThighX, 10 + by, 8 * sw, 14);
    g.fillStyle(LIGHT, 0.85);
    g.fillRect(-14 * sw + bx + lThighX, 22 + by, 6 * sw, 10);
    g.fillRect(  8 * sw + bx + rThighX, 22 + by, 6 * sw, 10);
    g.fillStyle(CLAW, 1);
    g.fillTriangle(-16 * sw + bx + lThighX, 32 + by, -18 * sw + bx + lThighX, 37 + by, -13 * sw + bx + lThighX, 37 + by);
    g.fillTriangle( 12 * sw + bx + rThighX, 32 + by,  10 * sw + bx + rThighX, 37 + by,  15 * sw + bx + rThighX, 37 + by);
  }

  // ── Body (torso) ─────────────────────────────────────────────────────────
  g.fillStyle(BODY, isStealth ? 0.72 : 1);
  g.fillEllipse(0 + bx, 0 + by, 32 * sw, 26);
  g.fillStyle(LIGHT, 0.25);
  g.fillEllipse(2 + bx, 2 + by, 18 * sw, 14);
  if (isBrute) {   // armour plating
    g.fillStyle(DARK, 0.7);
    g.fillRoundedRect(-14 * sw + bx, -8 + by, 28 * sw, 8, 3);
    g.fillStyle(LIGHT, 0.4);
    g.fillRect(-10 * sw + bx, -6 + by, 20 * sw, 2);
  }

  // ── Chest energy core ────────────────────────────────────────────────────
  const corePulse = 0.5 + Math.sin(frame * 0.6) * 0.25;
  g.fillStyle(CORE, 0.3);        g.fillCircle(0 + bx, 0 + by, 9);
  g.fillStyle(CORE, corePulse);  g.fillCircle(0 + bx, 0 + by, 4.5);
  g.fillStyle(0xffffff, corePulse * 0.5); g.fillCircle(0 + bx, 0 + by, 2);

  // ── Arms ─────────────────────────────────────────────────────────────────
  const armY = -1 + by;
  g.lineStyle(5, BODY, 1);
  g.beginPath(); g.moveTo(-10 * sw + bx, armY); g.lineTo(-22 * sw + bx, 5 + by + armSwing); g.strokePath();
  g.fillStyle(CLAW, 1); g.fillCircle(-22 * sw + bx, 5 + by + armSwing, 4.5);

  const rEndX = 10 * sw + 12 + lunge + bx;
  g.lineStyle(5, BODY, 1);
  g.beginPath(); g.moveTo(10 * sw + bx, armY); g.lineTo(rEndX, 5 + by - armSwing); g.strokePath();
  if (isRanged) {
    g.fillStyle(DARK, 1); g.fillRect(rEndX - 2, 1 + by - armSwing, 12, 6);
    if (state === 'attack' && f8 >= 4) {
      g.fillStyle(EYE, 0.9);       g.fillCircle(rEndX + 12, 4 + by - armSwing, 4);
      g.fillStyle(0xffffff, 0.6);  g.fillCircle(rEndX + 12, 4 + by - armSwing, 2);
    }
  } else {
    g.fillStyle(CLAW, 1); g.fillCircle(rEndX, 5 + by - armSwing, 4.5);
  }

  // ── Neck + domed cranium ─────────────────────────────────────────────────
  g.fillStyle(BODY, isStealth ? 0.75 : 1);
  g.fillEllipse(0 + bx, -11 + by, 18 * sw, 12);
  g.fillRoundedRect(-17 * sw + bx, -32 + by, 34 * sw, 22, 7);
  g.fillStyle(LIGHT, 0.2);
  g.fillRoundedRect(-15 * sw + bx, -32 + by, 30 * sw, 10, 5);

  // ── Cranial ridges ───────────────────────────────────────────────────────
  g.fillStyle(LIGHT, 0.85);
  [-10, -3, 4, 10].forEach(rx => {
    g.fillTriangle(rx * sw + bx, -32 + by, (rx - 3) * sw + bx, -40 + by, (rx + 3) * sw + bx, -40 + by);
  });

  // ── Eyes (glowing orbs) ──────────────────────────────────────────────────
  const eyeGlow = (state === 'attack') ? 0.7 : 0.3 + Math.sin(frame * 0.5) * 0.15;
  g.fillStyle(DARK, 1);
  g.fillCircle(-8 * sw + bx, -21 + by, 5.5); g.fillCircle(8 * sw + bx, -21 + by, 5.5);
  g.fillStyle(EYE, 1);
  g.fillCircle(-8 * sw + bx, -21 + by, 4.5); g.fillCircle(8 * sw + bx, -21 + by, 4.5);
  g.fillStyle(0xfde047, 0.55);
  g.fillCircle(-8 * sw + bx, -21 + by, 2.2); g.fillCircle(8 * sw + bx, -21 + by, 2.2);
  g.lineStyle(1.5, EYE, eyeGlow);
  g.strokeCircle(-8 * sw + bx, -21 + by, 7); g.strokeCircle(8 * sw + bx, -21 + by, 7);

  // ── Mouth slit ───────────────────────────────────────────────────────────
  g.fillStyle(0x0a0015, 0.9);
  g.fillRoundedRect(-8 * sw + bx, -12 + by, 16 * sw, 4, 2);

  // ── Shield bubble ────────────────────────────────────────────────────────
  if (isShield) {
    const sp = 0.25 + Math.sin(frame * 0.7) * 0.12;
    g.lineStyle(2, EYE, sp + 0.3);
    g.strokeEllipse(0 + bx, -4 + by, 56 * sw, 72);
    g.fillStyle(EYE, sp * 0.25);
    g.fillEllipse(0 + bx, -4 + by, 56 * sw, 72);
  }

  // ── Damage flash ─────────────────────────────────────────────────────────
  if (state === 'hurt' && frame % 2 === 0) {
    g.fillStyle(0xffffff, 0.26);
    g.fillRoundedRect(-18 * sw + bx, -42 + by, 36 * sw, 78, 6);
  }
});

function drawOriginalInvader(g, def, frame, state, kind) {
  g.clear();
  const body = def.color || 0x56856c;
  const light = def.accentColor || _shade(body, 0.35);
  const dark = _shade(body, -0.55);
  const eye = def.eyeColor || 0x62f2d1;
  const f = frame || 0;
  const bob = state === 'walk' ? Math.sin(f * 0.9) * 2 : Math.sin(f * 0.45) * 1;
  const stride = state === 'walk' ? Math.sin(f * 0.9) * 3 : 0;
  const hurt = state === 'hurt' && f % 2 === 0;
  const dying = state === 'die' && f >= 4;
  const flag = kind === 'flag';
  const brute = kind === 'beacon' || kind === 'matriarch' || kind === 'titan';
  const width = brute ? 1.35 : kind === 'pouncer' ? 0.82 : 1;
  const cx = state === 'attack' ? 3 : 0;
  const cy = dying ? 10 : bob;

  g.fillStyle(0x000000, 0.22);
  g.fillEllipse(cx, 34, brute ? 62 : 46, 10);
  if (dying) {
    g.fillStyle(body, 0.75);
    g.fillEllipse(cx, 16, 48 * width, 16);
    g.fillStyle(eye, 0.2);
    g.fillCircle(cx - 10, 12, 3);
    return;
  }

  if (kind === 'ion') {
    g.fillStyle(light, 0.48);
    g.fillTriangle(-10, -4 + cy, -36, -17 + cy, -25, 10 + cy);
    g.fillTriangle(10, -4 + cy, 36, -17 + cy, 25, 10 + cy);
    g.lineStyle(2, eye, 0.7);
    g.beginPath(); g.moveTo(-10, -4 + cy); g.lineTo(-36, -17 + cy); g.lineTo(-25, 10 + cy); g.strokePath();
    g.beginPath(); g.moveTo(10, -4 + cy); g.lineTo(36, -17 + cy); g.lineTo(25, 10 + cy); g.strokePath();
  }

  const legWidth = brute ? 11 : 7;
  g.fillStyle(dark, 1);
  g.fillRoundedRect(-13 * width + stride, 12 + cy, legWidth, 22, 3);
  g.fillRoundedRect(5 * width - stride, 12 + cy, legWidth, 22, 3);
  g.fillStyle(light, 1);
  g.fillTriangle(-16 * width + stride, 33 + cy, -20 * width + stride, 39 + cy, -10 * width + stride, 37 + cy);
  g.fillTriangle(15 * width - stride, 33 + cy, 11 * width - stride, 39 + cy, 21 * width - stride, 37 + cy);

  g.fillStyle(body, 1);
  g.fillEllipse(cx, 2 + cy, 32 * width, brute ? 34 : 27);
  g.fillStyle(light, 0.35);
  g.fillEllipse(cx - 2, -1 + cy, 18 * width, 17);

  if (kind === 'raider') {
    g.fillStyle(light, 0.95);
    g.fillTriangle(-11, -25 + cy, -17, -39 + cy, -4, -28 + cy);
    g.fillTriangle(2, -28 + cy, 8, -43 + cy, 12, -25 + cy);
    g.fillTriangle(13, -23 + cy, 23, -35 + cy, 20, -18 + cy);
    g.lineStyle(2, dark, 0.9);
    g.beginPath(); g.moveTo(-12, -1 + cy); g.lineTo(12, 10 + cy); g.strokePath();
  }
  if (kind === 'pouncer' || kind === 'glassback') {
    g.fillStyle(dark, 0.95);
    g.fillTriangle(-11, -10 + cy, -18, -25 + cy, -4, -12 + cy);
    g.fillTriangle(11, -10 + cy, 18, -25 + cy, 4, -12 + cy);
    g.lineStyle(2, light, 0.85);
    g.beginPath(); g.moveTo(-12, -4 + cy); g.lineTo(-22, -13 + cy); g.strokePath();
    g.beginPath(); g.moveTo(12, -4 + cy); g.lineTo(22, -13 + cy); g.strokePath();
  }

  if (kind === 'titan' || kind === 'matriarch') {
    g.fillStyle(kind === 'matriarch' ? 0x56c6b4 : light, 0.92);
    [-14, -7, 0, 7, 14].forEach((x, i) => {
      const top = kind === 'matriarch' ? -48 - (i % 2) * 8 : -40 - (i % 2) * 6;
      g.fillTriangle(x + cx, -21 + cy, x - 5 + cx, top + cy, x + 5 + cx, top + cy);
    });
  }

  g.lineStyle(brute ? 7 : 5, body, 1);
  g.beginPath(); g.moveTo(-12 * width, -3 + cy); g.lineTo(-23 * width, 8 + cy); g.strokePath();
  g.beginPath(); g.moveTo(12 * width, -3 + cy); g.lineTo(22 * width + (state === 'attack' ? 8 : 0), 6 + cy); g.strokePath();
  g.fillStyle(light, 1);
  g.fillCircle(-23 * width, 8 + cy, 4);
  g.fillCircle(22 * width + (state === 'attack' ? 8 : 0), 6 + cy, 4);

  g.fillStyle(body, 1);
  if (kind === 'beacon') {
    g.fillRoundedRect(-21, -39 + cy, 42, 26, 12);
    g.lineStyle(3, light, 0.9);
    g.strokeEllipse(0, -27 + cy, 48, 38);
    g.fillStyle(dark, 1);
    g.fillEllipse(0, -26 + cy, 21, 24);
    g.fillStyle(eye, 1);
    g.fillCircle(0, -26 + cy, 7);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(-2, -28 + cy, 2);
  } else if (flag) {
    g.fillEllipse(0, -23 + cy, 36, 30);
    g.fillStyle(0x05070a, 1);
    g.fillEllipse(-8, -24 + cy, 10, 14);
    g.fillEllipse(8, -24 + cy, 10, 14);
    g.lineStyle(3, 0xc49a45, 1);
    g.beginPath(); g.moveTo(18, -7 + cy); g.lineTo(20, -58 + cy); g.strokePath();
    g.fillStyle(0xb92e35, 1);
    g.fillTriangle(21, -55 + cy, 42, -48 + cy, 21, -40 + cy);
    g.fillStyle(0xf4d9bd, 0.8);
    g.fillCircle(28, -48 + cy, 2);
  } else {
    g.fillEllipse(0, -23 + cy, kind === 'matriarch' ? 41 : 36, kind === 'matriarch' ? 35 : 29);
    if (kind === 'glassback') {
      g.fillStyle(0x8bd9cb, 0.46);
      g.fillTriangle(-14, -17 + cy, -4, -52 + cy, 5, -18 + cy);
      g.fillTriangle(-3, -16 + cy, 11, -48 + cy, 15, -15 + cy);
      g.lineStyle(1.5, 0xc2fff2, 0.75);
      g.beginPath(); g.moveTo(-4, -50 + cy); g.lineTo(2, -28 + cy); g.lineTo(11, -46 + cy); g.strokePath();
    } else {
      g.fillStyle(light, 0.9);
      g.fillTriangle(-13, -34 + cy, -17, -45 + cy, -5, -35 + cy);
      g.fillTriangle(13, -34 + cy, 17, -45 + cy, 5, -35 + cy);
    }
    if (kind === 'pipkin') {
      g.fillStyle(light, 0.95);
      g.fillEllipse(-15, -12 + cy, 9, 6);
      g.fillEllipse(15, -12 + cy, 9, 6);
    }
    g.fillStyle(dark, 1);
    const sensorY = kind === 'matriarch' ? -23 : -24;
    g.fillEllipse(-8, sensorY + cy, 9, 12);
    g.fillEllipse(8, sensorY + cy, 9, 12);
    g.fillStyle(eye, 0.95);
    g.fillCircle(-8, sensorY + cy, 3);
    g.fillCircle(8, sensorY + cy, 3);
    g.fillStyle(dark, 0.9);
    g.fillRoundedRect(-7, -12 + cy, 14, 4, 2);
  }

  if (hurt) {
    g.fillStyle(0xffffff, 0.3);
    g.fillEllipse(0, cy - 3, 42 * width, 74);
  }
}

[
  ['vex_drone', 'pipkin'],
  ['vex_runner', 'pipkin'],
  ['vex_flag_bearer', 'flag'],
  ['crater_raider', 'raider'],
  ['beacon_brute', 'beacon'],
  ['vanta_pouncer', 'pouncer'],
  ['glassback_stalker', 'glassback'],
  ['skyroot_titan', 'titan'],
  ['ion_wing', 'ion'],
  ['vex_overlord', 'matriarch'],
].forEach(([id, kind]) => {
  GW.SpriteRegistry.registerEnemy(id, (g, def, frame, state) => drawOriginalInvader(g, def, frame, state, kind));
});
