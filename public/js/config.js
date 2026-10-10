/**
 * Chrono-Front: Galactic War â€” Central Game Configuration
 *
 * PART 1 REVISION:
 *  - Exact 52-card military system (2 starting + 49 adventure + 1 boss = 52)
 *  - 5 canonical environments: Daytime / Nighttime / Flooded / Storm / Radioactive
 *  - Creator Bitos event flags (levels 5/15/25/35/45)
 *  - Every-10th digital briefing flags (10/20/30/40/50 â€” NO Creator Bitos)
 *  - 50-level reward schedule (each level 2-49 = 1 card; level 50 boss = 1 final card)
 *  - Wave timeline system config
 *  - Flag Alien definition
 *  - Menu lock system config
 *  - Google Sheets URL via server for progression sync
 *  - Database: Google Sheets (Apps Script web-app)
 */

/* global GW */
window.GW = window.GW || {};

// â”€â”€â”€ Canvas / Display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.DISPLAY = {
  BASE_WIDTH:   960,
  BASE_HEIGHT:  600,   // taller canvas for proper sky proportions
  MIN_WIDTH:    320,
  MIN_HEIGHT:   320,
  BACKGROUND_COLOR: '#0a1a08',   // Dark military green â€” visible fallback if scene fails
  PIXEL_ART:    true,
};

// â”€â”€â”€ Game Board Layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.BOARD = {
  LANES:             5,
  LANE_HEIGHT:       72,
  TOP_OFFSET:        160,  // ample sky â€” background fills 0 to 160px
  LEFT_MARGIN:       10,
  RIGHT_MARGIN:      10,
  CELL_WIDTH:        80,
  CELLS_PER_LANE:    9,    // 9 cells â€” fenceX = 100 + 9Ã—80 + 8 = 828; alien zone = 828â†’960 (132px)
  HOME_X:            68,      // home base line
  ENEMY_SPAWN_X:     962,     // aliens enter right at screen edge (visible immediately)
  PLACEMENT_START_X: 100,     // first defender column, clear of building (HOME_X=68, bx ends at ~68)
  SENTINEL_X:        76,      // sentinel just RIGHT of home wall â€” visible in first board column
  // Timeline area at very bottom
  TIMELINE_Y:        522,
  TIMELINE_HEIGHT:   55,
  // Card tray: top-left, below sky
  TRAY_Y:            0,
  TRAY_HEIGHT:       60,
  TRAY_CARD_W:       64,
  TRAY_CARD_H:       52,
  TRAY_CARD_PAD:     5,
  TRAY_START_X:      124,     // after plasma collector box (box occupies 8â†’116)
  MAX_LOADOUT:       6,
};

// â”€â”€â”€ Wave Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.WAVE_TIMELINE = {
  BAR_Y:        570,    // bottom of 600px canvas
  BAR_HEIGHT:   10,
  MARKER_SIZE:  14,
  COLORS: {
    bar:         0x1a2d0a,
    progress:    0x4ade80,
    waveMarker:  0xfbbf24,
    finalWave:   0xef4444,
    flagAlien:   0xe879f9,
  },
};

// â”€â”€â”€ Plasma Energy System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.RESOURCES = {
  STARTING_ENERGY:       50,    // 50 plasma at start
  MAX_ENERGY:            9999,
  // Battlefield plasma and generators follow separate, readable cadences.
  ORB_SPAWN_INTERVAL:    13500,
  ORB_SPAWN_INTERVAL_MIN:12000,
  ORB_SPAWN_INTERVAL_MAX:15000,
  ORB_SPAWN_COUNT:       1,
  ORB_VALUE:             25,
  ORB_LIFETIME:          18000,
  KILL_REWARD_BASE:      10,
  REGEN_UNIT_INTERVAL:   10000, // midpoint; production timing is randomized below
  REGEN_UNIT_INTERVAL_MIN: 8000,
  REGEN_UNIT_INTERVAL_MAX: 12000,
  REGEN_UNIT_AMOUNT:     25,
};

// â”€â”€â”€ Galactic Currency System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.CURRENCY = {
  // Mutually exclusive per-kill odds; a kill can drop at most one currency type.
  DROP_CHANCES: { silver_coin: 0.15, gold_coin: 0.08, emerald: 0.04, diamond: 0.02, coin_bag: 0.01 },
  // Currency types with their values
  TYPES: {
    silver_coin: { id: 'silver_coin',  name: 'Silver Galactic Coin', value: 1,  color: 0xc0c0c0, glowColor: 0xe8e8ff },
    gold_coin:   { id: 'gold_coin',    name: 'Gold Galactic Coin',   value: 5,  color: 0xffd700, glowColor: 0xffed4a },
    emerald:     { id: 'emerald',      name: 'Emerald Galactic Coin',value: 10, color: 0x10b981, glowColor: 0x6ee7b7 },
    diamond:     { id: 'diamond',      name: 'Diamond Galactic Coin',value: 20, color: 0x67e8f9, glowColor: 0xcffafe },
    coin_bag:    { id: 'coin_bag',     name: 'Galactic Coin Bag',    value: 50, contents: { silver_coin: 5, gold_coin: 3, emerald: 1, diamond: 1 }, color: 0xf59e0b, glowColor: 0xfde68a },
  },
  LIFETIME:       14000,   // ms before uncollected currency fades
  FLOAT_DURATION:  800,    // ms for collection float animation
};

GW.DIFFICULTY_PACING = {
  easy:       { durationRangeMinutes: [4, 6], durationMs: 6 * 60 * 1000, individualInterval: [10000, 15000], waveIntervals: [[1500, 2500]], scoutCountRange: [8, 12], assaultCountRange: [10, 15], variantCountRange: [0, 1], eliteCount: 0 },
  moderate:   { durationRangeMinutes: [8, 12], durationMs: 10 * 60 * 1000, individualInterval: [10000, 15000], waveIntervals: [[1500, 2500], [2000, 3000]], scoutCountRange: [10, 15], assaultCountRange: [12, 18], variantCountRange: [1, 3], eliteCount: 0 },
  medium:     { durationRangeMinutes: [12, 18], durationMs: 15 * 60 * 1000, individualInterval: [8000, 12000], waveIntervals: [[1200, 2200], [1500, 2500], [2000, 3000]], scoutCountRange: [12, 18], assaultCountRange: [15, 20], variantCountRange: [5, 10], eliteCount: 3 },
  hard:       { durationRangeMinutes: [18, 24], durationMs: 21 * 60 * 1000, individualInterval: [7000, 10000], waveIntervals: [[1000, 2000], [1200, 2200], [1500, 2500], [2000, 3000]], scoutCountRange: [15, 20], assaultCountRange: [18, 24], variantCountRange: [8, 12], eliteCount: 5 },
  expert:     { durationRangeMinutes: [24, 30], durationMs: 27 * 60 * 1000, individualInterval: [6000, 9000], waveIntervals: [[900, 1800], [1000, 2000], [1200, 2200], [1500, 2500], [2000, 3000]], scoutCountRange: [20, 25], assaultCountRange: [20, 25], variantCountRange: [10, 15], eliteCount: 10 },
  impossible: { durationRangeMinutes: [30, 35], durationMs: 35 * 60 * 1000, assaultDurationMs: 30 * 60 * 1000, bossDurationMs: 5 * 60 * 1000, individualInterval: [5000, 8000], waveIntervals: [[5000, 8000]], interval: [5000, 8000], scoutCountRange: [25, 30], assaultCountRange: [25, 35], variantCountRange: [10, 15], eliteCount: 10 },
};

// â”€â”€â”€ Wave System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.WAVES = {
  BETWEEN_WAVE_DELAY:  9000,    // 8-10s pause between pre-wave and assault wave
  SPAWN_DELAY:         40000,   // fallback spawn delay for non-campaign modes
  INITIAL_DELAY:       20000,   // 20s before first alien appears (player prep time)
  PRESSURE_DELAY:      40000,
  APPROACH_INTERVAL:   [30000, 50000], // fallback interval; campaign uses DIFFICULTY_PACING
  SPAWN_GROUP_CHANCES: { SINGLE: 0.75, TRIPLE_WITHIN_MULTI: 0.5 },
  chooseGroupSize(remaining) {
    if (Math.random() < this.SPAWN_GROUP_CHANCES.SINGLE) return 1;
    return Math.min(Math.random() < this.SPAWN_GROUP_CHANCES.TRIPLE_WITHIN_MULTI ? 3 : 2, remaining);
  },
};

GW.LANE_PRESSURE = {
  DEFAULT_PROFILE: { 1: 0.20, 2: 0.24, 3: 0.30, 4: 0.16, 5: 0.10 },
  pickLane(waveDef = {}, fallbackLane = 1) {
    const profile = waveDef && waveDef.lanePressure ? waveDef.lanePressure : this.DEFAULT_PROFILE;
    const lanes = [1, 2, 3, 4, 5];
    const total = lanes.reduce((sum, lane) => sum + (Number(profile[lane]) || 0), 0);
    if (!total) return Number.isInteger(fallbackLane) ? fallbackLane : 1;
    let roll = Math.random() * total;
    for (const lane of lanes) {
      roll -= Number(profile[lane]) || 0;
      if (roll <= 0) return lane;
    }
    return lanes[lanes.length - 1];
  },
};

GW.ALIEN_APPROACH = {
  MOVE_SCALE: 1,
  FALLBACK_SPAWN_DISTANCE: 220,
  FALLBACK_WARNING_TIME: 1200,
  LEVEL_CLASS_DEFAULTS: {
    basic:   { spawnDistance: 220, warningTime: 1500 },
    fast:    { spawnDistance: 180, warningTime: 1200 },
    armored: { spawnDistance: 260, warningTime: 1800 },
    boss:    { spawnDistance: 360, warningTime: 2200 },
  },
  getEffectiveSpeed(enemyDef = {}) {
    const baseSpeed = Number(enemyDef.speed) || 20;
    return baseSpeed * (GW.ALIEN_APPROACH.MOVE_SCALE || 1);
  },
  getTimeToImpact(enemyDef = {}, spawnDistance) {
    const distance = Number(spawnDistance ?? enemyDef.spawnDistance ?? this.FALLBACK_SPAWN_DISTANCE) || this.FALLBACK_SPAWN_DISTANCE;
    const speed = this.getEffectiveSpeed(enemyDef);
    return Math.max(0.5, distance / Math.max(1, speed) * 1000);
  },
  normalizeEnemy(def = {}) {
    const category = (def.class || 'basic').toLowerCase();
    const defaults = this.LEVEL_CLASS_DEFAULTS[category] || this.LEVEL_CLASS_DEFAULTS.basic;
    const spawnDistance = Number(def.spawnDistance ?? defaults.spawnDistance ?? this.FALLBACK_SPAWN_DISTANCE);
    const warningTime = Number(def.warningTime ?? defaults.warningTime ?? this.FALLBACK_WARNING_TIME);
    return {
      spawnDistance,
      warningTime,
      movementSpeed: Number(def.speed) || 20,
      effectiveSpeed: this.getEffectiveSpeed(def),
      timeToImpact: this.getTimeToImpact(def, spawnDistance),
    };
  },
};

GW.SHOVEL = { COST: 200 };

// â”€â”€â”€ Combat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.COMBAT = {
  PROJECTILE_SPEED:  380,
  DAMAGE_FLASH_MS:   120,
};

// â”€â”€â”€ Defense Sentinel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.SENTINEL = {
  TRIGGER_X:      60,     // px â€” alien must reach this x to trigger
  DAMAGE:         9999,   // one-shots all non-boss aliens
  TRAVEL_SPEED:   480,    // px/s â€” sentinel travels through lane
  ANIMATION_MS:   1200,   // activation + travel animation
  RECHARGE_MS:    0,      // 0 = single use per level
  AVAILABLE:      true,
  FRIENDLY_FIRE:  false,  // NEVER damages military units
};

// â”€â”€â”€ Camera Reconnaissance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.CAMERA_RECON = {
  ENABLED:     false,  // Disabled: camera fadeIn used instead,   // Disabled: black overlay was causing black screen bug
  DURATION:    3500,   // total recon duration (ms)
  ALIEN_SIDE_HOLD: 1200,   // time spent showing alien side
  PAN_DURATION: 1000,      // pan from alien side to player base
  BASE_HOLD:   600,        // time showing player base before unlock
};

// â”€â”€â”€ Alien Equipment Variants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/* Legacy equipment data is replaced by the normalized table below.
GW.ALIEN_EQUIPMENT = {
  // â”€â”€ 10 equipment tiers matching the spec table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Each entry: baseHp=100 (the alien body HP), extraHp=shield/armor HP on top,
  // speedMult=speed multiplier relative to base 28px/s.
  // breakAnim: visual played when equipment is destroyed.
  // speedAfterBreak: if set, speed multiplier changes when equipment breaks.

  bare: {
    id: 'bare', name: 'Common Alien', tier: 1,
    id: 'night_rifleman', name: 'Night Stalker',
    speedMult: 1.0,
    specialAbility: 'stealth',
  },
  cap: {
    era: 'industrial', role: 'offense', cardSlot: 'adv_12',
    hp: 90, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    speedMult: 1.0,
    equipColor: 0x1d4ed8, equipName: 'Stolen Cap',
    era: 'industrial', role: 'offense', cardSlot: 'adv_13',
    hp: 80, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    isSupport: false,
    description: 'Uses concealment to avoid alien attacks while firing a service pistol.',
    baseHp: 200, extraHp: 100, totalHp: 300,
    specialAbility: 'stealth',
    equipColor: 0x78716c, equipName: 'Iron Mask',
    breakAnim: 'mask_crack',
  },
    hp: 280, weapon: 'rifle', damage: 45, attackSpeed: 1600, range: 420,
    id: 'steel_helmet', name: 'Steel Helmet Alien', tier: 4,
    baseHp: 200, extraHp: 150, totalHp: 350,
    era: 'industrial', role: 'offense', cardSlot: 'adv_15',
    hp: 80, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    isSupport: false,
    description: 'Conceals itself and attacks from close range.',
  armored_vest: {
    specialAbility: 'stealth',
    baseHp: 200, extraHp: 220, totalHp: 420,
    speedMult: 0.85,
    era: 'modern', role: 'offense', cardSlot: 'adv_16',
    hp: 85, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    isSupport: false,
    description: 'Silent long-range marksman with a high-powered rifle.',
    id: 'shield', name: 'Shield Alien', tier: 5,
    speedMult: 0.8,
    equipColor: 0x0369a1, equipName: 'Energy Shield',
    breakAnim: 'shield_break',
    shieldType: true,    // shield is separate from body â€” blocks projectiles
  },
  heavy_helmet: {
    id: 'heavy_helmet', name: 'Heavy Helmet Alien', tier: 6,
    baseHp: 200, extraHp: 300, totalHp: 500,
    speedMult: 0.8,
    equipColor: 0x1e3a5f, equipName: 'Reinforced Helmet',
    breakAnim: 'heavy_helmet_break',
  },
  full_armor: {
    id: 'full_armor', name: 'Full Armor Alien', tier: 7,
    baseHp: 200, extraHp: 400, totalHp: 600,
    speedMult: 0.75,
    equipColor: 0x1f2937, equipName: 'Full Armor',
    breakAnim: 'armor_collapse',
  },
  riot_shield: {
    id: 'riot_shield', name: 'Riot Shield Alien', tier: 8,
    baseHp: 200, extraHp: 600, totalHp: 800,
    speedMult: 0.7,
    equipColor: 0x0c1445, equipName: 'Heavy Shield + Helmet',
    breakAnim: 'riot_break',
    shieldType: true,
  },
  tactical_armor: {
    id: 'tactical_armor', name: 'Tactical Armor Alien', tier: 9,
    baseHp: 200, extraHp: 800, totalHp: 1000,
    speedMult: 0.8,
    equipColor: 0x292524, equipName: 'Combat Armor',
    breakAnim: 'tactical_shatter',
  },
  wooden_shield: {
    id: 'wooden_shield', name: 'Wooden Shield Alien', tier: 4,
    baseHp: 200, extraHp: 100, totalHp: 300, speedMult: 0.95,
    equipColor: 0x92400e, equipName: 'Wooden Shield',
  },
  bicycle: {
    id: 'bicycle', name: 'Bicycle Alien', tier: 4,
    baseHp: 200, extraHp: 50, totalHp: 250, speedMult: 1.4,
    equipColor: 0x0f766e, equipName: 'Bicycle',
  },
  newspaper: {
    id: 'newspaper', name: 'Newspaper Alien', tier: 4,
    baseHp: 200, extraHp: 50, totalHp: 250, speedMult: 1.0,
    equipColor: 0xe5e7eb, equipName: 'Newspaper Armor',
  },
  museum_armor: {
    id: 'museum_armor', name: 'Museum Armor Alien', tier: 5,
    baseHp: 200, extraHp: 300, totalHp: 500, speedMult: 0.8,
    equipColor: 0x78716c, equipName: 'Museum Suit of Armor',
  },
};

// â”€â”€â”€ Battlefield Loadout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
*/
// Common alien gear adds 50-300 HP above the 200 HP base.
GW.ALIEN_EQUIPMENT = {
  bare: { id: 'bare', name: 'Common Alien', tier: 1 },
  cap: {
    id: 'cap', name: 'Blue Cap', tier: 2, extraHp: 50, speedMult: 1.0,
    equipColor: 0x1d4ed8, equipName: 'Stolen Cap',
  },
  iron_mask: {
    id: 'iron_mask', name: 'Iron Mask', tier: 2, extraHp: 100, speedMult: 1.0,
    equipColor: 0x78716c, equipName: 'Iron Mask', breakAnim: 'mask_crack',
  },
  steel_helmet: {
    id: 'steel_helmet', name: 'Steel Helmet', tier: 3, extraHp: 150, speedMult: 0.95,
    equipColor: 0x9ca3af, equipName: 'Steel Helmet', breakAnim: 'helmet_crack',
  },
  armored_vest: {
    id: 'armored_vest', name: 'Armored Vest', tier: 3, extraHp: 200, speedMult: 0.9,
    equipColor: 0x374151, equipName: 'Armored Vest', breakAnim: 'armor_collapse',
  },
  shield: {
    id: 'shield', name: 'Energy Shield', tier: 3, extraHp: 250, speedMult: 0.9,
    equipColor: 0x0369a1, equipName: 'Energy Shield',
    breakAnim: 'shield_break', shieldType: true,
  },
  heavy_helmet: {
    id: 'heavy_helmet', name: 'Heavy Helmet Alien', tier: 4, extraHp: 300,
    speedMult: 0.8, equipColor: 0x1e3a5f, equipName: 'Reinforced Helmet',
    breakAnim: 'heavy_helmet_break',
  },
  full_armor: {
    id: 'full_armor', name: 'Full Armor Alien', tier: 4, extraHp: 300,
    speedMult: 0.75, equipColor: 0x1f2937, equipName: 'Full Armor',
    breakAnim: 'armor_collapse',
  },
  riot_shield: {
    id: 'riot_shield', name: 'Riot Shield Alien', tier: 4, extraHp: 300,
    speedMult: 0.7, equipColor: 0x0c1445, equipName: 'Heavy Shield + Helmet',
    breakAnim: 'riot_break', shieldType: true,
  },
  tactical_armor: {
    id: 'tactical_armor', name: 'Tactical Armor Alien', tier: 4, extraHp: 300,
    speedMult: 0.8, equipColor: 0x292524, equipName: 'Combat Armor',
    breakAnim: 'tactical_shatter',
  },
  wooden_shield: {
    id: 'wooden_shield', name: 'Wooden Shield Alien', tier: 3,
    extraHp: 100, speedMult: 0.95, equipColor: 0x92400e, equipName: 'Wooden Shield',
  },
  bicycle: {
    id: 'bicycle', name: 'Bicycle Alien', tier: 3,
    extraHp: 50, speedMult: 2.0, equipColor: 0x0f766e, equipName: 'Bicycle',
  },
  newspaper: {
    id: 'newspaper', name: 'Newspaper Alien', tier: 3,
    extraHp: 50, speedMult: 1.0, equipColor: 0xe5e7eb, equipName: 'Newspaper Armor',
  },
  museum_armor: {
    id: 'museum_armor', name: 'Museum Armor Alien', tier: 4,
    extraHp: 300, speedMult: 0.8, equipColor: 0x78716c, equipName: 'Museum Suit of Armor',
  },
};

GW.LOADOUT = {
  MAX_CARDS:     6,
  DEFAULT_CARDS: ['plasma_energy_generator', 'fire_lancer'],
};

// â”€â”€â”€ Pause System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.PAUSE = {
  KEY:           'P',     // Keyboard shortcut to pause
  MENU_OPTIONS: ['RESUME', 'RESTART', 'MUSIC', 'SFX', 'SETTINGS', 'RETURN TO MAP', 'QUIT'],
};

// â”€â”€â”€ Menu Lock System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Defines which modes are available from the start.
// Other modes unlock through Adventure progression.
GW.MENU_LOCKS = {
  adventure:         { unlocked: true,  unlockReq: null },
  survival:          { unlocked: false, unlockReq: { completeLevels: 10 } },
  minigames:         { unlocked: false, unlockReq: { completeLevels: 5 }  },
  puzzle:            { unlocked: false, unlockReq: { completeLevels: 15 } },
  characters_profile:{ unlocked: false, unlockReq: { completeLevels: 1 }  },
  extras:            { unlocked: true,  unlockReq: null },
  settings:          { unlocked: true,  unlockReq: null },
  credits:           { unlocked: true,  unlockReq: null },
};

// â”€â”€â”€ Creator Bitos System â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.CREATOR_BITOS = {
  // Levels where Creator Bitos actually APPEARS (rare)
  appearsOnLevels:    [5, 15, 25, 35, 45],

  // Levels with digital briefing ONLY (no Creator Bitos portrait)
  digitalBriefingLevels: [10, 20, 30, 40, 50],

  name:    'Creator Bitos',
  title:   'The Game Creator',
  color:   0xd4a843,
  accentColor: 0xfbbf24,

  // Level 5 dialogue lines
  level5Dialogue: [
    '...WAIT.',
    'You think this is a normal alien invasion?',
    'Let me show you something.',
    'The Vex aren\'t just here to destroy.',
    'They are TESTING you.',
    'Your Gunner is good. But you\'ll need more.',
    'One Plasma Generator. That\'s all you started with.',
    'Use it wisely.',
    '...This is just the beginning.',
  ],

  // Digital briefing template (10/20/30/40/50 - no portrait)
  briefingTemplate: {
    prefix:    'TACTICAL SYSTEM INITIALIZING...',
    separator: 'â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€',
    suffix:    'MISSION: SURVIVE THE INVASION.',
  },
};

// â”€â”€â”€ Weapon Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.WEAPONS = {
  // v1.0.1: fire_lance range extended so ranged attackers can target enemies in alien zone
  fire_lance: {
    id: 'fire_lance', name: 'Fire Lance', era: 'early',
    damage: 20, attackSpeed: 2200, range: 900, projectileSpeed: 380,
    projectileColor: 0xff6b00, projectileSize: 5, projectileType: 'fire',
    description: '10th-century Chinese fire-lance. Long range. 20 damage per shot.',
  },
  hand_cannon: {
    id: 'hand_cannon', name: 'Hand Cannon', era: 'early',
    damage: 40, attackSpeed: 2200, range: 450, projectileSpeed: 475,
    projectileColor: 0xd97706, projectileSize: 6, projectileType: 'cannonball',
    description: 'Early-era hand-held cannon. Slow reload, powerful at range.',
  },
  musket: {
    id: 'musket', name: 'Musket', era: 'early',
    damage: 35, attackSpeed: 2000, range: 350,
    projectileColor: 0xfbbf24, projectileSize: 5, projectileType: 'bullet',
    description: 'Muzzle-loaded musket. Reliable early ranged weapon.',
  },
  arquebus: {
    id: 'arquebus', name: 'Arquebus', era: 'early',
    damage: 30, attackSpeed: 2400, range: 450, projectileSpeed: 732,
    projectileColor: 0xfde68a, projectileSize: 5, projectileType: 'bullet',
    description: 'Early matchlock firearm.',
  },
  // Era: industrial
  rifle: {
    id: 'rifle', name: 'Rifle', era: 'industrial',
    damage: 45, attackSpeed: 1600, range: 450, projectileSpeed: 475,
    projectileColor: 0xfde68a, projectileSize: 5, projectileType: 'bullet',
    description: 'Accurate bolt-action rifle.',
  },
  sniper_rifle: {
    id: 'sniper_rifle', name: 'Sniper Rifle', era: 'industrial',
    damage: 120, attackSpeed: 4000, range: 700, projectileSpeed: 665,
    projectileColor: 0xfef3c7, projectileSize: 4, projectileType: 'sniper',
    description: 'Very high damage, very slow fire rate. Long range.',
  },
  mortar: {
    id: 'mortar', name: 'Mortar', era: 'industrial',
    damage: 75, attackSpeed: 4500, range: 450,
    projectileColor: 0x9ca3af, projectileSize: 10, projectileType: 'explosive',
    splash: 80, description: 'Lobbed mortar shell. Large area damage.',
  },
  // Era: modern
  service_pistol: {
    id: 'service_pistol', name: 'Service Pistol', era: 'modern',
    damage: 25, attackSpeed: 1400, range: 300,
    projectileColor: 0xfef3c7, projectileSize: 4, projectileType: 'bullet',
    description: 'Standard sidearm. Rapid fire.',
  },
  machine_gun: {
    id: 'machine_gun', name: 'Machine Gun', era: 'modern',
    damage: 20, attackSpeed: 600, range: 340,
    projectileColor: 0xfde68a, projectileSize: 4, projectileType: 'burst',
    description: 'High rate of fire. Effective against groups.',
  },
  grenade_launcher: {
    id: 'grenade_launcher', name: 'Grenade Launcher', era: 'modern',
    damage: 80, attackSpeed: 3000, range: 400,
    projectileColor: 0x65a30d, projectileSize: 8, projectileType: 'explosive',
    splash: 60, description: 'Lobbed grenades. Splash damage.',
  },
  rocket_launcher: {
    id: 'rocket_launcher', name: 'Rocket Launcher', era: 'modern',
    damage: 140, attackSpeed: 5000, range: 480,
    projectileColor: 0xef4444, projectileSize: 9, projectileType: 'rocket',
    splash: 100, description: 'High damage rocket. Large explosion.',
  },
  tank_cannon: {
    id: 'tank_cannon', name: 'Tank Cannon', era: 'modern',
    damage: 90, attackSpeed: 3500, range: 500, projectileSpeed: 440,
    projectileColor: 0xf59e0b, projectileSize: 10, projectileType: 'cannonball',
    splash: 80, description: 'Heavy cannon shell with a controlled blast radius.',
  },
  torpedo_launcher: {
    id: 'torpedo_launcher', name: 'Torpedo Launcher', era: 'modern',
    damage: 90, attackSpeed: 4800, range: 550, projectileSpeed: 300,
    projectileColor: 0x38bdf8, projectileSize: 9, projectileType: 'torpedo',
    splash: 130, description: 'Long-range torpedo with a wide impact blast.',
  },
  chemical_launcher: {
    id: 'chemical_launcher', name: 'Chemical Launcher', era: 'advanced',
    damage: 45, attackSpeed: 3000, range: 420, projectileSpeed: 320,
    projectileColor: 0x84cc16, projectileSize: 8, projectileType: 'gas',
    splash: 95, description: 'Chemical payload spreads damage across a compact area.',
  },
  // Era: advanced
  plasma_rifle: {
    id: 'plasma_rifle', name: 'Plasma Rifle', era: 'advanced',
    damage: 60, attackSpeed: 1200, range: 420,
    projectileColor: 0xa78bfa, projectileSize: 7, projectileType: 'plasma',
    description: 'Plasma weapon. Effective against armored targets.',
  },
  // Era: futuristic
  laser_weapon: {
    id: 'laser_weapon', name: 'Laser Carbine', era: 'futuristic',
    damage: 90, attackSpeed: 1000, range: 480,
    projectileColor: 0x67e8f9, projectileSize: 3, projectileType: 'laser',
    piercing: true, description: 'High-energy laser. Pierces light targets.',
  },
  plasma_cannon: {
    id: 'plasma_cannon', name: 'Plasma Cannon', era: 'futuristic_22c',
    damage: 200, attackSpeed: 2500, range: 560,
    projectileColor: 0xe879f9, projectileSize: 14, projectileType: 'plasma_cannon',
    splash: 120, description: '22nd-century plasma cannon. The ultimate weapon.',
  },
};

// â”€â”€â”€ Military Card Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// EXACT COUNT VALIDATION:
//   Starting cards (unlockLevel = 0 or 'start'): 2
//   Adventure rewards (unlockLevel 2-49): 49
//   Boss reward (unlockLevel 50, isBossReward): 1
//   TOTAL: 52
//
// NOTE: plasma_energy_generator and fire_lancer are the 2 starting cards.

GW.CARDS = {

  // â•â•â• STARTING CARDS (2) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  plasma_energy_generator: {
    id: 'plasma_energy_generator', name: 'Plasma Energy Generator',
    era: 'early', role: 'energy', cardSlot: 'start_1',
    // v1.0.1 NERF: HP reduced from 100 to 50
    hp: 50, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 50, unlockLevel: 'start', isBossReward: false,
    rarity: 'common',
    deployCooldown: 10000,
    color: 0xf59e0b, accentColor: 0xfef3c7,
    isSupport: true, genInterval: 10000, genAmount: 25,
    description: 'Common Plasma Energy Generator. Generates 25 Plasma every 8â€“12 seconds.',
    environment: 'all',
    strengthsText: 'Essential resource production.',
    weaknessesText: 'Cannot defend itself. Aliens will attack it.',
  },
  // v1.0.1: renamed from fire_lance_gunner â†’ fire_lancer
  fire_lancer: {
    id: 'fire_lancer', name: 'Fire-Lancer',
    era: 'early_10c', role: 'offense', cardSlot: 'start_2',
    hp: 100, weapon: 'fire_lance', damage: 20, attackSpeed: 2200, range: 900,
    cost: 100, unlockLevel: 'start', isBossReward: false,
    rarity: 'common',
    // v1.0.1 NERF: deploy cooldown 10s (was 7.5s)
    deployCooldown: 10000,
    color: 0x7c3d0a, accentColor: 0xff6b00,
    helmetColor: 0x3d1a00, skinColor: 0xd4956a,
    isSupport: false,
    description: '10th-century Chinese fire-lance soldier. 20 damage per shot. Costs 100 Plasma.',
    environment: 'daytime',
    strengthsText: 'Low cost. Long range. First ranged attacker.',
    weaknessesText: 'Needs support to handle a large horde alone.',
  },

  // â•â•â• LEVEL 1 REWARD â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  bomber: {
    id: 'bomber', name: 'Bomb Man',
    era: 'early', role: 'offense', cardSlot: 'adv_1',
    hp: 70, weapon: null, damage: 500, attackSpeed: 0, range: 260, laneRadius: 1,
    cost: 120, unlockLevel: 1, isBossReward: false,
    rarity: 'common',
    deployCooldown: 12000,  // 12s deploy cooldown
    color: 0x7f1d1d, accentColor: 0xfca5a5,
    helmetColor: 0x450a0a, skinColor: 0xd4956a,
    isSupport: false,
    isSuicideUnit: true,
    fuseDuration: 2500,
    description: 'A timed demolition unit that deals heavy area damage. Costs 120 Plasma.',
    environment: 'daytime',
    strengthsText: 'High burst AoE. Clears clustered aliens.',
    weaknessesText: 'Destroys itself on use. Long cooldown.',
  },

  // Level 2 reward
  hand_cannon_soldier: {
    id: 'hand_cannon_soldier', name: 'Rifleman',
    era: 'early_15c', role: 'offense', cardSlot: 'adv_2',
    hp: 150, weapon: 'hand_cannon', damage: 40, attackSpeed: 2200, range: 450,
    cost: 100, unlockLevel: 2, isBossReward: false,
    color: 0x5c3d1e, accentColor: 0xd97706,
    helmetColor: 0x3d2008, skinColor: 0xd4956a,
    isSupport: false,
    description: '15th-century hand-cannon soldier. Slow reload, powerful shot.',
    environment: 'daytime',
  },

  // Level 3 reward
  arquebus_soldier: {
    id: 'arquebus_soldier', name: 'Sniper',
    era: 'early_16c', role: 'offense', cardSlot: 'adv_3',
    hp: 130, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 100, unlockLevel: 3, isBossReward: false,
    color: 0x6b4c1e, accentColor: 0xd97706,
    helmetColor: 0x3d2a0a, skinColor: 0xd4956a,
    isSupport: false,
    description: 'Long-range sniper rifle delivers precise, high-impact shots.',
    environment: 'daytime',
  },

  // Level 4 reward
  pikeman: {
    id: 'pikeman', name: 'Heavy Gunner',
    era: 'early_15c', role: 'heavy', cardSlot: 'adv_4',
    hp: 220, weapon: 'machine_gun', damage: 20, attackSpeed: 600, range: 340,
    cost: 75, unlockLevel: 4, isBossReward: false,
    color: 0x4a3728, accentColor: 0x7c5c2a,
    isSupport: false,
    description: 'Heavy gunner suppresses aliens with sustained machine-gun fire.',
    environment: 'daytime',
  },

  // Level 5 reward (Creator Bitos event level)
  drummer_boy: {
    id: 'drummer_boy', name: 'Rocket Trooper',
    era: 'early', role: 'heavy', cardSlot: 'adv_5',
    hp: 80, weapon: 'rocket_launcher', damage: 140, attackSpeed: 5000, range: 480,
    cost: 75, unlockLevel: 5, isBossReward: false,
    color: 0x7c5c2a, accentColor: 0xd97706,
    isSupport: false,
    description: 'Fires heavy rockets that blast nearby aliens.',
    environment: 'daytime',
  },

  // Level 6 reward
  field_cannon: {
    id: 'field_cannon', name: 'Combat Medic',
    era: 'early_18c', role: 'medic', cardSlot: 'adv_6',
    hp: 180, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    cost: 175, unlockLevel: 6, isBossReward: false,
    color: 0x374151, accentColor: 0x9ca3af,
    isSupport: true,
    description: 'Fires a service pistol and heals nearby defenders over time.',
    environment: 'daytime',
    specialAbility: 'heal_nearby',
  },

  // Level 7 reward
  supply_officer: {
    id: 'supply_officer', name: 'Shield Soldier',
    era: 'early', role: 'defense', cardSlot: 'adv_7',
    hp: 90, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 75, unlockLevel: 7, isBossReward: false,
    color: 0x92400e, accentColor: 0xfbbf24,
    isSupport: true,
    description: 'Recharges a protective shield on nearby defenders.',
    environment: 'daytime',
    specialAbility: 'energy_shield',
  },

  // Level 8 reward
  sharpshooter: {
    id: 'sharpshooter', name: 'Machine Gunner',
    era: 'industrial', role: 'offense', cardSlot: 'adv_8',
    hp: 120, weapon: 'machine_gun', damage: 20, attackSpeed: 600, range: 340,
    cost: 125, unlockLevel: 8, isBossReward: false,
    color: 0x3d4a2a, accentColor: 0x65a30d,
    helmetColor: 0x1e2d0e, skinColor: 0xc8956a,
    isSupport: false,
    description: 'Sustained machine-gun fire for defending a lane.',
    environment: 'daytime',
  },

  // Level 9 reward
  field_medic_early: {
    id: 'field_medic_early', name: 'Grenadier',
    era: 'industrial', role: 'offense', cardSlot: 'adv_9',
    hp: 100, weapon: 'grenade_launcher', damage: 80, attackSpeed: 3000, range: 400,
    cost: 100, unlockLevel: 9, isBossReward: false,
    color: 0xdcfce7, accentColor: 0xffffff,
    isSupport: false,
    description: 'Lobs grenades that damage groups of aliens.',
    environment: 'daytime',
  },

  // Level 10 reward (digital briefing milestone)
  machine_gunner: {
    id: 'machine_gunner', name: 'Tank Commander',
    era: 'modern', role: 'heavy', cardSlot: 'adv_10',
    hp: 200, weapon: 'tank_cannon', damage: 90, attackSpeed: 3500, range: 500,
    cost: 200, unlockLevel: 10, isBossReward: false,
    color: 0x374151, accentColor: 0x9ca3af,
    helmetColor: 0x1f2937, skinColor: 0xc8956a,
    isSupport: false,
    description: 'Tank cannon fires heavy shells with a blast radius.',
    environment: 'daytime',
  },

  // Level 11 reward
  night_rifleman: {
    id: 'night_rifleman', name: 'Night Stalker',
    era: 'industrial', role: 'offense', cardSlot: 'adv_11',
    hp: 140, weapon: 'rifle', damage: 50, attackSpeed: 1800, range: 380,
    cost: 125, unlockLevel: 11, isBossReward: false,
    color: 0x1e2d3d, accentColor: 0x4b6cb7,
    helmetColor: 0x111827, skinColor: 0xc8956a,
    isSupport: false,
    description: 'Trained for night operations. Better accuracy in low light.',
    environment: 'nighttime',
    specialAbility: 'stealth',
  },

  // Level 12 reward
  scout: {
    id: 'scout', name: 'Shadow Sniper',
    era: 'industrial', role: 'offense', cardSlot: 'adv_12',
    hp: 90, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 75, unlockLevel: 12, isBossReward: false,
    color: 0x2d3a2a, accentColor: 0x6b9e6b,
    isSupport: false,
    description: 'Long-range sniper detects and eliminates concealed alien threats.',
    environment: 'nighttime',
    specialAbility: 'detect',
  },

  // Level 13 reward
  flare_operator: {
    id: 'flare_operator', name: 'Stealth Operative',
    era: 'industrial', role: 'offense', cardSlot: 'adv_13',
    hp: 80, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    cost: 75, unlockLevel: 13, isBossReward: false,
    color: 0xfbbf24, accentColor: 0xfef08a,
    isSupport: false,
    description: 'Uses concealment to avoid alien attacks while firing a service pistol.',
    environment: 'nighttime',
    specialAbility: 'stealth',
  },

  // Level 14 reward
  trench_soldier: {
    id: 'trench_soldier', name: 'Night Vision Gunner',
    era: 'industrial', role: 'defense', cardSlot: 'adv_14',
    hp: 280, weapon: 'rifle', damage: 45, attackSpeed: 1600, range: 420,
    cost: 150, unlockLevel: 14, isBossReward: false,
    color: 0x4a3728, accentColor: 0x9c7a4a,
    isSupport: false,
    description: 'Night-vision optics reveal concealed aliens for the whole defense.',
    environment: 'nighttime',
    specialAbility: 'detect',
  },

  // Level 15 reward (Creator Bitos event level)
  searchlight_operator: {
    id: 'searchlight_operator', name: 'Tactical Assassin',
    era: 'industrial', role: 'offense', cardSlot: 'adv_15',
    hp: 80, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    cost: 100, unlockLevel: 15, isBossReward: false,
    color: 0xfef08a, accentColor: 0xfbbf24,
    isSupport: false,
    description: 'Conceals itself and attacks from close range.',
    environment: 'nighttime',
    specialAbility: 'stealth',
  },

  // Level 16 reward
  radio_operator: {
    id: 'radio_operator', name: 'Silent Ranger',
    era: 'modern', role: 'offense', cardSlot: 'adv_16',
    hp: 85, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 100, unlockLevel: 16, isBossReward: false,
    color: 0x374151, accentColor: 0x93c5fd,
    isSupport: false,
    description: 'Silent long-range marksman with a high-powered rifle.',
    environment: 'nighttime',
  },

  // Level 17 reward
  armored_soldier: {
    id: 'armored_soldier', name: 'Phantom Trooper',
    era: 'modern', role: 'defense', cardSlot: 'adv_17',
    hp: 350, weapon: 'service_pistol', damage: 20, attackSpeed: 1600, range: 240,
    cost: 175, unlockLevel: 17, isBossReward: false,
    color: 0x374151, accentColor: 0x6b7280,
    isSupport: false,
    description: 'Heavy armor. Absorbs damage for nearby allies.',
    environment: 'nighttime',
    specialAbility: 'energy_shield',
  },

  // Level 18 reward
  night_medic: {
    id: 'night_medic', name: 'Recon Specialist',
    era: 'modern', role: 'recon', cardSlot: 'adv_18',
    hp: 110, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    cost: 125, unlockLevel: 18, isBossReward: false,
    color: 0x1d4ed8, accentColor: 0x93c5fd,
    isSupport: false,
    description: 'Reveals hidden alien threats while defending its lane.',
    environment: 'nighttime',
    specialAbility: 'detect',
  },

  // Level 19 reward
  sniper: {
    id: 'sniper', name: 'Night Hunter',
    era: 'industrial', role: 'offense', cardSlot: 'adv_19',
    hp: 100, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 175, unlockLevel: 19, isBossReward: false,
    color: 0x2d3a1a, accentColor: 0x65a30d,
    helmetColor: 0x1a2d0a, skinColor: 0xc8956a,
    isSupport: false,
    description: 'Extreme range. Very high damage per shot. Slow reload.',
    environment: 'nighttime',
  },

  // Level 20 reward (digital briefing milestone)
  recon_unit: {
    id: 'recon_unit', name: 'Shadow Commander',
    era: 'modern', role: 'recon', cardSlot: 'adv_20',
    hp: 90, weapon: 'rifle', damage: 45, attackSpeed: 1600, range: 420,
    cost: 100, unlockLevel: 20, isBossReward: false,
    color: 0x2d3a2a, accentColor: 0x86efac,
    isSupport: false,
    description: 'Commander reveals threats and accelerates nearby defenders.',
    environment: 'foggy',
    specialAbility: 'speed_boost',
  },

  // Level 21 reward
  gas_mask_soldier: {
    id: 'gas_mask_soldier', name: 'Marine Rifleman',
    era: 'industrial', role: 'offense', cardSlot: 'adv_21',
    hp: 160, weapon: 'rifle', damage: 40, attackSpeed: 1800, range: 360,
    cost: 125, unlockLevel: 21, isBossReward: false,
    color: 0x4a5a2a, accentColor: 0x9ca3af,
    isSupport: false,
    description: 'Rifleman equipped for flooded battlefield conditions.',
    environment: 'foggy',
  },

  // Level 22 reward
  mortar_team: {
    id: 'mortar_team', name: 'Depth Diver',
    era: 'industrial', role: 'artillery', cardSlot: 'adv_22',
    hp: 150, weapon: 'torpedo_launcher', damage: 90, attackSpeed: 4800, range: 550,
    cost: 175, unlockLevel: 22, isBossReward: false,
    color: 0x374151, accentColor: 0x6b7280,
    isSupport: false,
    description: 'Long-range torpedoes burst across nearby alien lanes.',
    environment: 'foggy',
  },

  // Level 23 reward
  field_mechanic: {
    id: 'field_mechanic', name: 'Torpedo Soldier',
    era: 'modern', role: 'artillery', cardSlot: 'adv_23',
    hp: 110, weapon: 'torpedo_launcher', damage: 90, attackSpeed: 4800, range: 550,
    cost: 125, unlockLevel: 23, isBossReward: false,
    color: 0xfbbf24, accentColor: 0xf59e0b,
    isSupport: false,
    description: 'Launches torpedoes that detonate across nearby alien lanes.',
    environment: 'foggy',
  },

  // Level 24 reward
  heavy_rifleman: {
    id: 'heavy_rifleman', name: 'Hydro Gunner',
    era: 'modern', role: 'offense', cardSlot: 'adv_24',
    hp: 190, weapon: 'machine_gun', damage: 25, attackSpeed: 800, range: 340,
    cost: 150, unlockLevel: 24, isBossReward: false,
    color: 0x374151, accentColor: 0x9ca3af,
    isSupport: false,
    description: 'Heavier armor. Standard rifle. All-purpose soldier.',
    environment: 'foggy',
  },

  // Level 25 reward (Creator Bitos event level)
  forward_observer: {
    id: 'forward_observer', name: 'Amphibious Trooper',
    era: 'modern', role: 'recon', cardSlot: 'adv_25',
    hp: 95, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 100, unlockLevel: 25, isBossReward: false,
    color: 0x2d4a2a, accentColor: 0x86efac,
    isSupport: true,
    description: 'Calls in heavy artillery strikes. Requires setup time.',
    environment: 'foggy',
    specialAbility: 'artillery_call',
  },

  // Level 26 reward
  modern_rifleman: {
    id: 'modern_rifleman', name: 'Naval Sniper',
    era: 'modern', role: 'offense', cardSlot: 'adv_26',
    hp: 170, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 175, unlockLevel: 26, isBossReward: false,
    color: 0x2d3a4a, accentColor: 0x4b6cb7,
    isSupport: false,
    description: 'Naval sniper rifle with extreme range and high impact.',
    environment: 'rainy_stormy',
  },

  // Level 27 reward
  shield_operator: {
    id: 'shield_operator', name: 'Submarine Engineer',
    era: 'modern', role: 'defense', cardSlot: 'adv_27',
    hp: 250, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 175, unlockLevel: 27, isBossReward: false,
    color: 0x1d4ed8, accentColor: 0x93c5fd,
    isSupport: true,
    description: 'Deploys energy shield. Protects adjacent units from projectiles.',
    environment: 'rainy_stormy',
    specialAbility: 'energy_shield',
  },

  // Level 28 reward
  combat_medic: {
    id: 'combat_medic', name: 'Aqua Grenadier',
    era: 'modern', role: 'offense', cardSlot: 'adv_28',
    hp: 130, weapon: 'grenade_launcher', damage: 80, attackSpeed: 3000, range: 400,
    cost: 150, unlockLevel: 28, isBossReward: false,
    color: 0xdcfce7, accentColor: 0xffffff,
    isSupport: false,
    description: 'Lobs aqua grenades that splash across clustered enemies.',
    environment: 'rainy_stormy',
  },

  // Level 29 reward
  drone_operator: {
    id: 'drone_operator', name: 'Sea Raider',
    era: 'modern', role: 'aerial', cardSlot: 'adv_29',
    hp: 100, weapon: 'machine_gun', damage: 25, attackSpeed: 800, range: 340,
    cost: 200, unlockLevel: 29, isBossReward: false,
    color: 0x374151, accentColor: 0x93c5fd,
    isSupport: false,
    description: 'Deploys armed drone. Attacks from above. Bypasses ground defenses.',
    environment: 'rainy_stormy',
    specialAbility: 'deploy_drone',
  },

  // Level 30 reward (digital briefing milestone)
  rocket_specialist: {
    id: 'rocket_specialist', name: 'Admiral Defender',
    era: 'modern', role: 'heavy', cardSlot: 'adv_30',
    hp: 175, weapon: 'rocket_launcher', damage: 140, attackSpeed: 5000, range: 480,
    cost: 225, unlockLevel: 30, isBossReward: false,
    color: 0x374151, accentColor: 0xef4444,
    isSupport: false,
    description: 'Rocket launcher. Massive explosion. Destroys armored aliens.',
    environment: 'rainy_stormy',
  },

  // Level 31 reward
  mobile_generator: {
    id: 'mobile_generator', name: 'Fog Recon',
    era: 'modern', role: 'recon', cardSlot: 'adv_31',
    hp: 140, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    cost: 100, unlockLevel: 31, isBossReward: false,
    color: 0xfbbf24, accentColor: 0xf59e0b,
    isSupport: false,
    description: 'Scouts through fog and reveals concealed alien threats.',
    environment: 'rainy_stormy',
    specialAbility: 'detect',
  },

  // Level 32 reward
  plasma_tech_engineer: {
    id: 'plasma_tech_engineer', name: 'Mist Sniper',
    era: 'advanced', role: 'offense', cardSlot: 'adv_32',
    hp: 120, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 150, unlockLevel: 32, isBossReward: false,
    color: 0x7c3aed, accentColor: 0xc4b5fd,
    isSupport: false,
    description: 'Long-range sniper trained to fire through dense mist.',
    environment: 'rainy_stormy',
  },

  // Level 33 reward
  grenadier: {
    id: 'grenadier', name: 'Smoke Trooper',
    era: 'modern', role: 'offense', cardSlot: 'adv_33',
    hp: 170, weapon: 'grenade_launcher', damage: 80, attackSpeed: 3000, range: 380,
    cost: 175, unlockLevel: 33, isBossReward: false,
    color: 0x4d6b2a, accentColor: 0x84cc16,
    isSupport: false,
    description: 'Grenade launcher leaves a slowing smoke cloud on impact.',
    environment: 'rainy_stormy',
    specialAbility: 'smoke_bomb',
  },

  // Level 34 reward
  hazmat_trooper: {
    id: 'hazmat_trooper', name: 'Radar Specialist',
    era: 'advanced', role: 'recon', cardSlot: 'adv_34',
    hp: 160, weapon: 'service_pistol', damage: 25, attackSpeed: 1400, range: 300,
    cost: 200, unlockLevel: 34, isBossReward: false,
    color: 0xfde68a, accentColor: 0xfbbf24,
    helmetColor: 0xca8a04, skinColor: 0xfbbf24,
    isSupport: false,
    description: 'Radar pulses reveal hidden threats and improve lane awareness.',
    environment: 'radioactive',
    specialAbility: 'detect',
  },

  // Level 35 reward (Creator Bitos event level)
  radiation_specialist: {
    id: 'radiation_specialist', name: 'Chemical Warfare Soldier',
    era: 'advanced', role: 'offense', cardSlot: 'adv_35',
    hp: 100, weapon: 'chemical_launcher', damage: 45, attackSpeed: 3000, range: 420,
    cost: 125, unlockLevel: 35, isBossReward: false,
    color: 0x65a30d, accentColor: 0xd9f99d,
    isSupport: false,
    description: 'Launches chemical payloads and shields nearby allies from hazards.',
    environment: 'radioactive',
    specialAbility: 'neutralize_radiation',
  },

  // Level 36 reward
  plasma_soldier: {
    id: 'plasma_soldier', name: 'Ghost Gunner',
    era: 'advanced', role: 'offense', cardSlot: 'adv_36',
    hp: 180, weapon: 'plasma_rifle', damage: 60, attackSpeed: 1200, range: 420,
    cost: 225, unlockLevel: 36, isBossReward: false,
    color: 0x7c3aed, accentColor: 0xc4b5fd,
    helmetColor: 0x4c1d95, skinColor: 0xfbbf24,
    isSupport: false,
    description: 'Plasma rifle specialist. Effective against armored aliens.',
    environment: 'radioactive',
  },

  // Level 37 reward
  energy_shield_generator: {
    id: 'energy_shield_generator', name: 'Fog Bomber',
    era: 'advanced', role: 'offense', cardSlot: 'adv_37',
    hp: 160, weapon: 'grenade_launcher', damage: 80, attackSpeed: 3000, range: 400,
    cost: 200, unlockLevel: 37, isBossReward: false,
    color: 0x1d4ed8, accentColor: 0x67e8f9,
    isSupport: false,
    description: 'Drops a fog bomb that slows aliens caught in its blast.',
    environment: 'radioactive',
    specialAbility: 'fog_bomb',
  },

  // Level 38 reward
  combat_drone: {
    id: 'combat_drone', name: 'Tactical Spotter',
    era: 'futuristic', role: 'recon', cardSlot: 'adv_38',
    hp: 80, weapon: 'laser_weapon', damage: 70, attackSpeed: 900, range: 460,
    cost: 250, unlockLevel: 38, isBossReward: false,
    color: 0x0891b2, accentColor: 0x67e8f9,
    isSupport: false,
    description: 'Autonomous laser drone. Rapid-fire aerial attacker.',
    environment: 'radioactive',
    specialAbility: 'detect',
  },

  // Level 39 reward
  autonomous_robot: {
    id: 'autonomous_robot', name: 'Specter Ranger',
    era: 'futuristic', role: 'offense', cardSlot: 'adv_39',
    hp: 220, weapon: 'machine_gun', damage: 30, attackSpeed: 700, range: 340,
    cost: 250, unlockLevel: 39, isBossReward: false,
    color: 0x374151, accentColor: 0x67e8f9,
    isSupport: false,
    description: 'Self-operating combat robot. No morale issues.',
    environment: 'radioactive',
    specialAbility: 'stealth',
  },

  // Level 40 reward (digital briefing milestone)
  plasma_mech: {
    id: 'plasma_mech', name: 'Phantom Commander',
    era: 'futuristic', role: 'heavy', cardSlot: 'adv_40',
    hp: 400, weapon: 'plasma_rifle', damage: 90, attackSpeed: 1400, range: 380,
    cost: 300, unlockLevel: 40, isBossReward: false,
    color: 0x7c3aed, accentColor: 0xe879f9,
    isSupport: false,
    description: 'Plasma-powered combat mech. Heavy armor and firepower.',
    environment: 'radioactive',
  },

  // Level 41 reward
  laser_specialist: {
    id: 'laser_specialist', name: 'Hazmat Trooper',
    era: 'futuristic', role: 'offense', cardSlot: 'adv_41',
    hp: 160, weapon: 'laser_weapon', damage: 90, attackSpeed: 1000, range: 480,
    cost: 275, unlockLevel: 41, isBossReward: false,
    color: 0x0891b2, accentColor: 0x67e8f9,
    helmetColor: 0x0e7490, skinColor: 0xfbbf24,
    isSupport: false,
    description: 'Laser carbine pierces targets; the hazmat suit protects nearby allies.',
    environment: 'radioactive',
    specialAbility: 'neutralize_radiation',
  },

  // Level 42 reward
  energy_specialist: {
    id: 'energy_specialist', name: 'Radiation Gunner',
    era: 'advanced', role: 'offense', cardSlot: 'adv_42',
    hp: 110, weapon: 'plasma_rifle', damage: 60, attackSpeed: 1200, range: 420,
    cost: 175, unlockLevel: 42, isBossReward: false,
    color: 0xfef08a, accentColor: 0xfbbf24,
    isSupport: false,
    description: 'Radiation gunner boosts allied energy units while firing plasma.',
    environment: 'radioactive',
    specialAbility: 'boost_regen',
  },

  // Level 43 reward
  heavy_plasma_trooper: {
    id: 'heavy_plasma_trooper', name: 'Plasma Soldier',
    era: 'futuristic', role: 'heavy', cardSlot: 'adv_43',
    hp: 260, weapon: 'plasma_rifle', damage: 80, attackSpeed: 1100, range: 440,
    cost: 325, unlockLevel: 43, isBossReward: false,
    color: 0x4c1d95, accentColor: 0xe879f9,
    isSupport: false,
    description: 'Heavy armor + plasma rifle. Extremely resilient.',
    environment: 'radioactive',
  },

  // Level 44 reward
  support_specialist: {
    id: 'support_specialist', name: 'Nuclear Engineer',
    era: 'futuristic', role: 'support', cardSlot: 'adv_44',
    hp: 120, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 175, unlockLevel: 44, isBossReward: false,
    color: 0x0891b2, accentColor: 0x67e8f9,
    isSupport: true,
    description: 'Advanced tactical support. Multi-role buffs for entire lane.',
    environment: 'radioactive',
    specialAbility: 'multi_buff',
  },

  // Level 45 reward (Creator Bitos event level)
  experimental_soldier: {
    id: 'experimental_soldier', name: 'Mutant Hunter',
    era: 'futuristic', role: 'offense', cardSlot: 'adv_45',
    hp: 200, weapon: 'laser_weapon', damage: 110, attackSpeed: 1200, range: 500,
    cost: 350, unlockLevel: 45, isBossReward: false,
    color: 0x0f172a, accentColor: 0x818cf8,
    isSupport: false,
    description: 'Experimental weapons technology. Highly effective against all classes.',
    environment: 'radioactive',
  },

  // Level 46 reward
  advanced_combatant: {
    id: 'advanced_combatant', name: 'Atomic Sniper',
    era: 'futuristic', role: 'offense', cardSlot: 'adv_46',
    hp: 230, weapon: 'sniper_rifle', damage: 120, attackSpeed: 4000, range: 700,
    cost: 325, unlockLevel: 46, isBossReward: false,
    color: 0x1e1b4b, accentColor: 0x818cf8,
    isSupport: false,
    description: 'Elite advanced combatant. Full combat specialization.',
    environment: 'radioactive',
  },

  // Level 47 reward
  repair_technician: {
    id: 'repair_technician', name: 'Reactor Guard',
    era: 'futuristic', role: 'engineer', cardSlot: 'adv_47',
    hp: 130, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 175, unlockLevel: 47, isBossReward: false,
    color: 0xfbbf24, accentColor: 0xf59e0b,
    isSupport: true,
    description: 'Rapid field repair. Instantly restores significant HP to any unit.',
    environment: 'radioactive',
    specialAbility: 'rapid_repair',
  },

  // Level 48 reward
  ammo_specialist: {
    id: 'ammo_specialist', name: 'Biohazard Specialist',
    era: 'futuristic', role: 'support', cardSlot: 'adv_48',
    hp: 105, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 150, unlockLevel: 48, isBossReward: false,
    color: 0x92400e, accentColor: 0xfbbf24,
    isSupport: true,
    description: 'Resupplies ammunition. Boosts attack speed of adjacent units.',
    environment: 'radioactive',
    specialAbility: 'ammo_boost',
  },

  // Level 49 reward
  plasma_shield_unit: {
    id: 'plasma_shield_unit', name: 'Radiation Destroyer',
    era: 'futuristic', role: 'defense', cardSlot: 'adv_49',
    hp: 300, weapon: null, damage: 0, attackSpeed: 0, range: 0,
    cost: 250, unlockLevel: 49, isBossReward: false,
    color: 0x7c3aed, accentColor: 0xe879f9,
    isSupport: true,
    description: 'Deploys massive plasma barrier. Absorbs alien attacks for the entire team.',
    environment: 'radioactive',
    specialAbility: 'plasma_barrier',
  },

  // â•â•â• FINAL BOSS REWARD â€” Level 50 (1) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  plasma_cannon_warrior: {
    id: 'plasma_cannon_warrior', name: 'Planetary Guardian',
    era: 'futuristic_22c', role: 'heavy', cardSlot: 'boss_50',
    hp: 200, weapon: 'plasma_cannon', damage: 200, attackSpeed: 2500, range: 560,
    cost: 400, unlockLevel: 50, isBossReward: true,
    color: 0x1a0050, accentColor: 0xe879f9,
    helmetColor: 0x4c1d95, skinColor: 0xfbbf24,
    isSupport: false,
    description: '22nd-century plasma cannon soldier. The ultimate military card. Unlocked by defeating the Vex Overlord.',
    environment: 'all',
    specialAbility: 'plasma_cannon_barrage',
    claimText: 'FINAL MILITARY TECHNOLOGY DETECTED',
    claimPrompt: 'CLICK TO REVEAL',
  },
};

// â”€â”€â”€ CARD COUNT VALIDATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.CARD_ABILITY_RULES = {
  speed_boost: { cooldown: 9000, duration: 6000, radius: 240, laneRadius: 1, attackSpeedMultiplier: 0.75, color: 0xfbbf24 },
  stealth: { cooldown: 12000, duration: 5000, self: true, color: 0x67e8f9 },
  detect: { cooldown: 7000, duration: 9000, reveal: true, color: 0x22d3ee },
  energy_shield: { cooldown: 9000, duration: 7000, radius: 220, laneRadius: 1, shield: 60, color: 0x38bdf8 },
  heal_nearby: { cooldown: 5000, radius: 240, laneRadius: 1, heal: 40, color: 0x4ade80 },
  artillery_call: { cooldown: 12000, range: 900, splash: 130, damage: 90, allLanes: true, color: 0xf97316 },
  deploy_drone: { cooldown: 5000, range: 650, damage: 45, allLanes: true, color: 0x67e8f9 },
  boost_regen: { cooldown: 9000, duration: 7000, radius: 700, laneRadius: 5, regenMultiplier: 1.6, color: 0xfbbf24 },
  smoke_bomb: { cooldown: 9000, range: 550, splash: 100, duration: 5000, slowMultiplier: 0.55, color: 0x9ca3af },
  neutralize_radiation: { cooldown: 10000, duration: 8000, radius: 260, laneRadius: 1, shield: 50, heal: 15, color: 0x84cc16 },
  fog_bomb: { cooldown: 10000, range: 600, splash: 130, damage: 80, duration: 6000, slowMultiplier: 0.55, color: 0x67e8f9 },
  multi_buff: { cooldown: 10000, duration: 7000, radius: 260, laneRadius: 1, heal: 25, shield: 40, attackSpeedMultiplier: 0.82, color: 0xa78bfa },
  rapid_repair: { cooldown: 6000, radius: 260, laneRadius: 1, heal: 80, color: 0x4ade80 },
  ammo_boost: { cooldown: 9000, duration: 6500, radius: 260, laneRadius: 1, attackSpeedMultiplier: 0.7, color: 0xfbbf24 },
  plasma_barrier: { cooldown: 12000, duration: 9000, radius: 900, laneRadius: 0, shield: 140, color: 0x22d3ee },
  plasma_cannon_barrage: { cooldown: 12000, range: 900, splash: 180, damage: 200, allLanes: true, color: 0xe879f9 },
};

(function applyCardBalanceTiers() {
  const tiers = [
    { maxLevel: 3, rarity: 'common' },
    { maxLevel: 10, rarity: 'uncommon' },
    { maxLevel: 20, rarity: 'rare' },
    { maxLevel: 30, rarity: 'very_rare' },
    { maxLevel: 38, rarity: 'ultra_rare' },
    { maxLevel: 48, rarity: 'legendary' },
    { maxLevel: Infinity, rarity: 'mythical' },
  ];
  Object.values(GW.CARDS).forEach(card => {
    const level = typeof card.unlockLevel === 'number' ? card.unlockLevel : 0;
    const tier = tiers.find(entry => level <= entry.maxLevel);
    card.rarity = tier.rarity;

    const weapon = card.weapon && GW.WEAPONS[card.weapon];
    if (weapon && card.weapon === 'rifle') {
      card.range = GW.WEAPONS.rifle.range;
      card.projectileSpeed = GW.WEAPONS.rifle.projectileSpeed;
    } else if (weapon && card.weapon === 'sniper_rifle') {
      card.projectileSpeed = GW.WEAPONS.sniper_rifle.projectileSpeed;
    } else if (weapon && card.weapon === 'fire_lance') {
      card.projectileSpeed = GW.WEAPONS.fire_lance.projectileSpeed;
    }
  });
})();

(function validateCardCount() {
  const all = Object.values(GW.CARDS);
  const starting  = all.filter(c => c.unlockLevel === 'start').length;
  const adventure = all.filter(c => typeof c.unlockLevel === 'number' && !c.isBossReward).length;
  const boss      = all.filter(c => c.isBossReward).length;
  const total     = all.length;
  if (total !== 52 || starting !== 2 || adventure !== 49 || boss !== 1) {
    console.error('[GW] CARD COUNT VALIDATION FAILED:', { total, starting, adventure, boss });
  } else {
    console.log('[GW] Card count validated: 2 starting + 49 adventure + 1 boss = 52 total.');
  }
})();

// â”€â”€â”€ Alias: GW.CHARACTERS points to GW.CARDS for game system compatibility â”€â”€â”€
// The game engine uses GW.CHARACTERS; cards extend this.
Object.defineProperty(GW, 'CHARACTERS', {
  get() { return GW.CARDS; },
  configurable: true,
});

// â”€â”€â”€ Alien Enemy Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.ENEMIES = {
  // Original common alien: moss-toned shell and twin glow-sensors.
  vex_drone: {
    id: 'vex_drone', name: 'Mosskin Scout', class: 'basic', tier: 1, rarity: 'common',
    // Common aliens use the 12px/s baseline (1.0x).
    hp: 200, speed: 12, damage: 20, attackCooldown: 2500, reward: 10,
    color: 0x56856c, accentColor: 0xa5c98c, eyeColor: 0x62f2d1,
    description: 'Common alien scout with a living moss shell and bright sensory eyes.',
    specialAbility: null, introducedLevel: 1,
    equipment: 'bare',
  },
  // FLAG variant â€” pinkish horde leader
  vex_flag_bearer: {
    id: 'vex_flag_bearer', name: 'Signal Bearer', class: 'fast', tier: 1, rarity: 'special',
    // Horde leader variant is slightly slower than the 12px/s baseline.
    hp: 200, speed: 10.8, damage: 20, attackCooldown: 2500, reward: 30,
    color: 0x9aa7ae, accentColor: 0xcbd5d9, eyeColor: 0x090d12,
    description: 'Ash-grey scout with dark glass eyes, carrying a red signal standard.',
    specialAbility: 'flag_rush', introducedLevel: 1, isFlag: true,
  },
  vex_runner: {
    id: 'vex_runner', name: 'Mosskin Sprinter', class: 'fast', tier: 2, rarity: 'common',
    hp: 40, speed: 30, damage: 8, attackCooldown: 1800, reward: 25,
    color: 0xf59e0b, accentColor: 0xfef3c7, eyeColor: 0xff6b00,
    description: 'Fast alien. Low health, rapid movement.',
    specialAbility: 'sprint', introducedLevel: 4,
  },
  vex_bruiser: {
    id: 'vex_bruiser', name: 'Vex Bruiser', class: 'armored', tier: 3,
    hp: 280, speed: 18, damage: 20, attackCooldown: 2000, reward: 50,
    color: 0x374151, accentColor: 0x6b7280, eyeColor: 0xff4444,
    description: 'Heavily armored. Slow but very durable.',
    specialAbility: 'armor', introducedLevel: 7,
  },
  vex_leaper: {
    id: 'vex_leaper', name: 'Vex Leaper', class: 'jumping', tier: 3,
    hp: 70, speed: 36, damage: 12, attackCooldown: 2000, reward: 40,
    color: 0x16a34a, accentColor: 0x86efac, eyeColor: 0x00ffcc,
    description: 'Can leap over one defender.',
    specialAbility: 'leap', introducedLevel: 9,
  },
  vex_sniper: {
    id: 'vex_sniper', name: 'Vex Sniper', class: 'ranged', tier: 4,
    hp: 60, speed: 14, damage: 25, attackCooldown: 3000, reward: 60,
    color: 0x1e293b, accentColor: 0x94a3b8, eyeColor: 0x00ccff,
    description: 'Fires at defenders from long range.',
    specialAbility: 'long_range_attack', introducedLevel: 12,
  },
  vex_warden: {
    id: 'vex_warden', name: 'Vex Warden', class: 'shield', tier: 4,
    hp: 120, speed: 24, damage: 15, attackCooldown: 2200, reward: 70,
    color: 0x0369a1, accentColor: 0x7dd3fc, eyeColor: 0x00ffff,
    description: 'Shields block incoming projectiles.',
    specialAbility: 'shield', introducedLevel: 15,
  },
  vex_stalker: {
    id: 'vex_stalker', name: 'Vex Stalker', class: 'stealth', tier: 5,
    hp: 90, speed: 20, damage: 18, attackCooldown: 1800, reward: 80,
    color: 0x1c1917, accentColor: 0x57534e, eyeColor: 0xff00aa,
    description: 'Becomes semi-transparent.',
    specialAbility: 'stealth', introducedLevel: 18,
  },
  vex_healer: {
    id: 'vex_healer', name: 'Vex Healer', class: 'support', tier: 4,
    hp: 70, speed: 14, damage: 8, attackCooldown: 3000, reward: 65,
    color: 0x15803d, accentColor: 0x86efac, eyeColor: 0x00ff66,
    description: 'Heals nearby alien units.',
    specialAbility: 'heal_nearby', introducedLevel: 20,
  },
  vex_colossus: {
    id: 'vex_colossus', name: 'Vex Colossus', class: 'brute', tier: 5,
    hp: 6000, speed: 12, damage: 35, attackCooldown: 1600, reward: 150,
    color: 0x7f1d1d, accentColor: 0xef4444, eyeColor: 0xff0000,
    description: 'Massive alien brute. Enormous health pool.',
    specialAbility: 'stomp', introducedLevel: 25,
  },
  vex_elite: {
    id: 'vex_elite', name: 'Vex Elite', class: 'elite', tier: 5,
    hp: 700, speed: 34, damage: 28, attackCooldown: 1500, reward: 120,
    color: 0x581c87, accentColor: 0xe879f9, eyeColor: 0xff00ff,
    description: 'Elite alien armed with advanced laser and cannon technology.',
    specialAbility: 'elite_charge', introducedLevel: 11,
  },
  vex_overlord: {
    id:            'vex_overlord',
    name:          'The Rift Queen Matriarch',
    class:         'boss',
    tier:          6,
    rarity:        'mythical',
    hp:            50000,
    speed:         6,
    damage:        50,
    attackCooldown:1200,
    reward:        500,
    color:         0x0f172a,
    accentColor:   0x818cf8,
    eyeColor:      0x6366f1,
    description:   'The giant Rift Queen Matriarch, an ancient radioactive hive-guardian. 50,000 HP.',
    specialAbility: 'boss_phase',
    introducedLevel: 50,
    isBoss:        true,
    phases:        [
      { hpThreshold: 0.75, name: 'Phase 1', speedBonus: 0 },
      { hpThreshold: 0.50, name: 'Phase 2', speedBonus: 2 },
      { hpThreshold: 0.25, name: 'Phase 3', speedBonus: 4, summons: true },
    ],
  },
};
// â”€â”€â”€ Extended Alien Variety â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Architecture for future alien classes. Speed values are multiples of the
// 12px/s baseline (vex_drone). Not all may be implemented in combat yet â€”
// this registers them so wave generator and future scenes can reference them.
GW.ENEMY_CATEGORIES = {

  crater_raider: {
    id: 'crater_raider', name: 'Crater Raider', class: 'uncommon', tier: 2, rarity: 'uncommon',
    hp: 320, speed: 14, damage: 14, attackCooldown: 2100, reward: 35,
    color: 0xb65d3a, accentColor: 0xe3a06c, eyeColor: 0xffd36b,
    description: 'A rust-shelled scavenger that raids in coordinated bursts.',
    specialAbility: 'charge', introducedLevel: 6,
  },
  beacon_brute: {
    id: 'beacon_brute', name: 'Beacon Brute', class: 'brute', tier: 3, rarity: 'rare',
    hp: 1200, speed: 8, damage: 30, attackCooldown: 2500, reward: 100,
    color: 0x5b9f59, accentColor: 0xa3d477, eyeColor: 0xffdf73,
    description: 'A towering, single-lensed guardian protected by a living glass shell.',
    specialAbility: 'armor', introducedLevel: 16,
  },
  vanta_pouncer: {
    id: 'vanta_pouncer', name: 'Vanta Pouncer', class: 'elite', tier: 4, rarity: 'very-rare',
    hp: 850, speed: 25, damage: 28, attackCooldown: 1700, reward: 125,
    color: 0x253340, accentColor: 0x668394, eyeColor: 0xff5a72,
    description: 'A silent, long-limbed ambusher marked by luminous sensory fins.',
    specialAbility: 'leap', introducedLevel: 25,
  },
  glassback_stalker: {
    id: 'glassback_stalker', name: 'Glassback Stalker', class: 'elite', tier: 5, rarity: 'ultra-rare',
    hp: 980, speed: 18, damage: 34, attackCooldown: 1900, reward: 160,
    color: 0x252c3b, accentColor: 0x8a9db1, eyeColor: 0x65f0d2,
    description: 'A segmented, obsidian-toned hunter with a translucent dorsal crest.',
    specialAbility: 'stealth', introducedLevel: 32,
  },
  skyroot_titan: {
    id: 'skyroot_titan', name: 'Skyroot Titan', class: 'advanced', tier: 6, rarity: 'legendary',
    hp: 2600, speed: 10, damage: 38, attackCooldown: 2300, reward: 260,
    color: 0x477e72, accentColor: 0xb2c982, eyeColor: 0xf4cc70,
    description: 'A towering spore-crowned alien whose luminous frills signal its approach.',
    specialAbility: 'stomp', introducedLevel: 41,
  },
  ion_wing: {
    id: 'ion_wing', name: 'Ion Wing', class: 'aerial', tier: 6, rarity: 'legendary',
    hp: 1800, speed: 22, damage: 26, attackCooldown: 1800, reward: 220,
    color: 0x4d6687, accentColor: 0xb0d8ed, eyeColor: 0x72f6ff,
    description: 'A gliding bio-electric scout with broad, translucent fins.',
    specialAbility: 'hover', introducedLevel: 43,
    isAerial: true,
  },

  // â”€â”€ UNCOMMON (faster than common, introduced in mid-game) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  vex_agile: {
    id: 'vex_agile', name: 'Vex Agile', class: 'uncommon', tier: 2,
    hp: 60, speed: 24, damage: 8, attackCooldown: 1800, reward: 20,
    color: 0x34d399, accentColor: 0x6ee7b7, eyeColor: 0x00ffcc,
    description: 'Quick, lightweight alien. 2Ã— baseline speed. Low HP.',
    specialAbility: null, introducedLevel: 5,
  },
  vex_raider: {
    id: 'vex_raider', name: 'Vex Raider', class: 'uncommon', tier: 2,
    hp: 80, speed: 28, damage: 12, attackCooldown: 1600, reward: 30,
    color: 0xf97316, accentColor: 0xfed7aa, eyeColor: 0xff6b00,
    description: 'Aggressive uncommon. 2.3Ã— speed, moderate HP.',
    specialAbility: 'charge', introducedLevel: 6,
  },

  // â”€â”€ ADVANCED MOBILE (vehicle/hover-based) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  vex_tiny_ship: {
    id: 'vex_tiny_ship', name: 'Floating Tiny Ship', class: 'aerial', tier: 4,
    hp: 1200, speed: 24, damage: 12, attackCooldown: 2000, reward: 55,
    color: 0x818cf8, accentColor: 0xc7d2fe, eyeColor: 0x6366f1,
    description: 'Flies over ground-level obstacles. 2Ã— speed. Medium HP.',
    specialAbility: 'hover', introducedLevel: 11,
    isAerial: true,
  },
  vex_hover_bike: {
    id: 'vex_hover_bike', name: 'Hover Bike Alien', class: 'vehicle', tier: 4,
    hp: 1600, speed: 30, damage: 15, attackCooldown: 1800, reward: 65,
    color: 0x6366f1, accentColor: 0xa5b4fc, eyeColor: 0x818cf8,
    description: 'Mounted on hover bike. 2.5Ã— speed. Bypasses ground traps.',
    specialAbility: 'hover_speed', introducedLevel: 11,
    isVehicle: true,
  },
  vex_vehicle_rider: {
    id: 'vex_vehicle_rider', name: 'Vehicle Rider', class: 'vehicle', tier: 5,
    hp: 2500, speed: 30, damage: 22, attackCooldown: 1600, reward: 80,
    color: 0x475569, accentColor: 0x94a3b8, eyeColor: 0x60a5fa,
    description: 'Heavy alien vehicle. 2.5Ã— speed, high HP.',
    specialAbility: 'ram', introducedLevel: 11,
    isVehicle: true,
  },
  vex_jetpack: {
    id: 'vex_jetpack', name: 'Jetpack Alien', class: 'aerial', tier: 5,
    hp: 1200, speed: 36, damage: 18, attackCooldown: 1800, reward: 90,
    color: 0xef4444, accentColor: 0xfca5a5, eyeColor: 0xff0000,
    description: 'Jetpack propulsion. 3Ã— speed, can jump over one defender.',
    specialAbility: 'jetpack_leap', introducedLevel: 11,
    isAerial: true,
  },
  vex_hover_alien: {
    id: 'vex_hover_alien', name: 'Hover Alien', class: 'aerial', tier: 4,
    hp: 1500, speed: 22, damage: 14, attackCooldown: 2000, reward: 60,
    color: 0x7c3aed, accentColor: 0xc4b5fd, eyeColor: 0xe879f9,
    description: 'Levitates above ground. Immune to lane hazards. 1.8Ã— speed.',
    specialAbility: 'hover', introducedLevel: 11,
    isAerial: true,
  },

  // â”€â”€ SPECIAL / ABILITY-BASED â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  vex_burrower: {
    id: 'vex_burrower', name: 'Burrower Alien', class: 'special', tier: 5,
    hp: 120, speed: 16, damage: 20, attackCooldown: 2400, reward: 95,
    color: 0x92400e, accentColor: 0xd97706, eyeColor: 0xff6b00,
    description: 'Digs underground to bypass defenders. Slow on surface.',
    specialAbility: 'burrow', introducedLevel: 26,
  },
  vex_teleporter: {
    id: 'vex_teleporter', name: 'Teleporter Alien', class: 'special', tier: 5,
    hp: 80, speed: 14, damage: 16, attackCooldown: 2000, reward: 100,
    color: 0x7c3aed, accentColor: 0xa78bfa, eyeColor: 0xffffff,
    description: 'Teleports forward periodically. Unpredictable movement.',
    specialAbility: 'teleport', introducedLevel: 32,
  },
  vex_phantom: {
    id: 'vex_phantom', name: 'Phantom Alien', class: 'special', tier: 5,
    hp: 75, speed: 18, damage: 14, attackCooldown: 2000, reward: 100,
    color: 0x1e1b4b, accentColor: 0x818cf8, eyeColor: 0xa5b4fc,
    description: 'Cloaked alien. Invisible until very close to defenders.',
    specialAbility: 'cloak', introducedLevel: 34,
  },
  vex_medic: {
    id: 'vex_medic', name: 'Medic Alien', class: 'support', tier: 4,
    hp: 80, speed: 12, damage: 8, attackCooldown: 3000, reward: 70,
    color: 0x16a34a, accentColor: 0x86efac, eyeColor: 0x00ff66,
    description: 'Heals nearby alien units. Priority target.',
    specialAbility: 'heal_allies', introducedLevel: 20,
  },
  vex_emp: {
    id: 'vex_emp', name: 'EMP Alien', class: 'special', tier: 5,
    hp: 90, speed: 16, damage: 10, attackCooldown: 4000, reward: 85,
    color: 0xfbbf24, accentColor: 0xfde68a, eyeColor: 0xffff00,
    description: 'Emits EMP pulse that disables nearby defenders temporarily.',
    specialAbility: 'emp_pulse', introducedLevel: 36,
  },
  vex_saboteur: {
    id: 'vex_saboteur', name: 'Saboteur Alien', class: 'special', tier: 5,
    hp: 100, speed: 20, damage: 18, attackCooldown: 2200, reward: 110,
    color: 0x374151, accentColor: 0x9ca3af, eyeColor: 0xff4444,
    description: 'Targets and destroys energy generators specifically.',
    specialAbility: 'sabotage', introducedLevel: 38,
  },
  vex_engineer: {
    id: 'vex_engineer', name: 'Engineer Alien', class: 'support', tier: 4,
    hp: 85, speed: 14, damage: 10, attackCooldown: 2800, reward: 75,
    color: 0xd97706, accentColor: 0xfbbf24, eyeColor: 0xff9500,
    description: 'Builds alien barricades and turrets. Tactical support.',
    specialAbility: 'build_barricade', introducedLevel: 28,
  },
  vex_advanced: {
    id: 'vex_advanced', name: 'Vex Advanced Unit', class: 'advanced', tier: 6,
    hp: 1500, speed: 11, damage: 35, attackCooldown: 1800, reward: 200,
    color: 0x0f766e, accentColor: 0x5eead4, eyeColor: 0xf0fdfa,
    description: 'Advanced alien infantry with high-tech armor and precision weapons.',
    specialAbility: 'advanced_weaponry', introducedLevel: 11,
  },
};

// Merge ENEMY_CATEGORIES into GW.ENEMIES for backwards compat
// (Future: EnemyFactory can resolve from both maps)
Object.assign(GW.ENEMIES, GW.ENEMY_CATEGORIES);
const alienAttackProfiles = {
  common:   { projectileType: 'spore', projectileColor: 0x62f2d1, projectileSize: 5, projectileSpeed: 300, attackSound: 'alien-bullet' },
  variant:  { projectileType: 'acid', projectileColor: 0xf59e0b, projectileSize: 6, projectileSpeed: 330, attackSound: 'alien-fire', splash: 16 },
  ranged:   { projectileType: 'laser', projectileColor: 0x38bdf8, projectileSize: 5, projectileSpeed: 420, attackSound: 'alien-laser', piercing: true },
  elite:    { projectileType: 'laser', projectileColor: 0xe879f9, projectileSize: 7, projectileSpeed: 460, attackSound: 'alien-laser', piercing: true, splash: 24 },
  advanced: { projectileType: 'plasma', projectileColor: 0x5eead4, projectileSize: 9, projectileSpeed: 360, attackSound: 'alien-plasma', splash: 36 },
  heavy:    { projectileType: 'explosive', projectileColor: 0xfb7185, projectileSize: 11, projectileSpeed: 250, attackSound: 'alien-fire', splash: 52 },
  boss:     { projectileType: 'plasma_cannon', projectileColor: 0x818cf8, projectileSize: 16, projectileSpeed: 280, attackSound: 'alien-vex_overlord', splash: 90 },
};
Object.values(GW.ENEMIES).forEach(enemy => {
  if (!enemy || typeof enemy !== 'object') return;
  const className = enemy.class;
  const attackProfile = enemy.isBoss ? alienAttackProfiles.boss
    : className === 'basic' ? alienAttackProfiles.common
      : className === 'ranged' ? alienAttackProfiles.ranged
        : className === 'elite' ? alienAttackProfiles.elite
          : className === 'advanced' || className === 'aerial' || className === 'vehicle'
            ? alienAttackProfiles.advanced
            : className === 'brute' || className === 'armored' || className === 'shield'
              ? alienAttackProfiles.heavy
              : alienAttackProfiles.variant;
  Object.keys(attackProfile).forEach(key => {
    if (enemy[key] == null) enemy[key] = attackProfile[key];
  });
  const defaults = GW.ALIEN_APPROACH.normalizeEnemy(enemy);
  enemy.spawnDistance = Number(enemy.spawnDistance ?? defaults.spawnDistance);
  enemy.warningTime = Number(enemy.warningTime ?? defaults.warningTime);
  enemy.movementSpeed = Number(enemy.movementSpeed ?? enemy.speed ?? defaults.movementSpeed ?? 20);
  enemy.effectiveSpeed = Number(enemy.effectiveSpeed ?? defaults.effectiveSpeed ?? GW.ALIEN_APPROACH.getEffectiveSpeed(enemy));
  enemy.timeToImpact = Number(enemy.timeToImpact ?? defaults.timeToImpact ?? GW.ALIEN_APPROACH.getTimeToImpact(enemy, enemy.spawnDistance));
  enemy.speedScale = Number(enemy.speedScale ?? 1);
});

Object.values(GW.ENEMIES).forEach(enemy => {
  if (enemy.id === 'vex_overlord') {
    enemy.hp = 50000;
    return;
  }
  if (enemy.isFlag) return;
  if (enemy.class === 'basic') {
    enemy.hp = 200;
  } else if (enemy.class === 'elite') {
    enemy.hp = Math.max(500, Math.min(1000, enemy.hp));
  } else if (enemy.class === 'advanced' || enemy.class === 'aerial' || enemy.class === 'vehicle') {
    enemy.hp = Math.max(1000, Math.min(5000, enemy.hp));
  } else if (enemy.class === 'brute') {
    enemy.hp = Math.max(1000, Math.min(2500, enemy.hp));
  } else {
    enemy.hp = Math.max(250, Math.min(500, enemy.hp));
  }
});


// â”€â”€â”€ Environment Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SPEC Â§9: Exact 5 environments with exact level ranges
GW.ENVIRONMENTS = {
  daytime: {
    id: 'daytime', name: 'Daytime', levelRange: [1, 10],
    skyColors: [0x87ceeb, 0xbae6fd],
    groundColor: 0x3d6b1a, laneEven: 0x2d5a1b, laneOdd: 0x26501a,
    grassColor: 0x16a34a, soilColor: 0x7c4a1a,
    ambientLight: 1.0, fogEnabled: false, waterEnabled: false,
    description: 'Clear daytime garden. Historical warfare era.',
    menuAnimType: 'clouds_wind',
    // Keep backward compat alias
    alias: 'day',
  },
  nighttime: {
    id: 'nighttime', name: 'Nighttime', levelRange: [11, 20],
    skyColors: [0x060d1a, 0x0a1a2a],
    groundColor: 0x1a2d0a, laneEven: 0x0d2010, laneOdd: 0x0a1a0d,
    grassColor: 0x0d4a1a, soilColor: 0x3d2008,
    ambientLight: 0.4, fogEnabled: false, waterEnabled: false,
    description: 'Night operations. Specialized military tech required.',
    menuAnimType: 'stars_lights',
    alias: 'night',
  },
  foggy: {
    id: 'foggy', name: 'Flooded', levelRange: [21, 30],
    skyColors: [0x6b9aa8, 0xb5d8dc],
    groundColor: 0x31535a, laneEven: 0x28525a, laneOdd: 0x234951,
    grassColor: 0x3f786d, soilColor: 0x3b5554,
    ambientLight: 0.72, fogEnabled: false, waterEnabled: true,
    description: 'Waterlogged lowlands. Hold the lanes through the flooded basin.',
    menuAnimType: 'water_ripples',
    alias: 'flooded',
  },
  rainy_stormy: {
    id: 'rainy_stormy', name: 'Rainy / Stormy', levelRange: [31, 40],
    skyColors: [0x1e3a5f, 0x0f2040],
    groundColor: 0x2d3a1a, laneEven: 0x2d3a4a, laneOdd: 0x263344,
    grassColor: 0x365314, soilColor: 0x3d4a2a,
    ambientLight: 0.7, fogEnabled: false, rainEnabled: true, lightningEnabled: true,
    description: 'Storm conditions. Modern military technology.',
    menuAnimType: 'rain_lightning',
    alias: 'rooftop',
  },
  radioactive: {
    id: 'radioactive', name: 'Radioactive', levelRange: [41, 50],
    skyColors: [0x1a2d0a, 0x0d1a00],
    groundColor: 0x2d4a0a, laneEven: 0x1a3d0a, laneOdd: 0x163308,
    grassColor: 0x65a30d, soilColor: 0x3a4d0a,
    ambientLight: 0.75, fogEnabled: false, radioactive: true,
    description: 'Contaminated zone. Futuristic military technology.',
    menuAnimType: 'radiation_pulse',
    alias: 'radioactive',
  },
  // Extra environments (for mini-games/puzzle/survival)
  winter:    { id: 'winter',    name: 'Winter',    laneEven: 0xdbeafe, laneOdd: 0xbfdbfe, alias: 'winter' },
  spring:    { id: 'spring',    name: 'Spring',    laneEven: 0xfce7f3, laneOdd: 0xfbcfe8, alias: 'spring' },
  summer:    { id: 'summer',    name: 'Summer',    laneEven: 0xfef9c3, laneOdd: 0xfef08a, alias: 'summer' },
  spaceship: { id: 'spaceship', name: 'Spaceship', laneEven: 0x140a24, laneOdd: 0x10081e, alias: 'spaceship' },
};

// â”€â”€â”€ Level Definitions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(function _buildLevels() {
  const L = {};
  const levelOneIndividualInterval = [10000, 15000];
  const levelOneHordeInterval = [1500, 2500];

  // Helper: get environment id for level
  function envForLevel(id) {
    if (id <= 10)  return 'daytime';
    if (id <= 20)  return 'nighttime';
    if (id <= 30)  return 'foggy';
    if (id <= 40)  return 'rainy_stormy';
    return 'radioactive';
  }

  // Level 1 â€” Fully implemented with proper wave structure (spec Â§38)
  L[1] = {
    id: 1, name: 'First Light', environment: envForLevel(1),
    unlocked: true, completed: false, difficulty: 'easy',
    durationMs: GW.DIFFICULTY_PACING.easy.durationMs,
    availableDefenders: ['plasma_energy_generator', 'fire_lancer'],
    availableEnemies:   ['vex_drone', 'vex_runner', 'vex_flag_bearer'],
    sentinelAvailable:  true,
    reward: { cardId: 'bomber' },  // Level 1 reward: Bomber (common â€” unlocked by clearing First Light)
    unlockRequirement: null,
    victoryCondition: 'survive_waves',
    defeatCondition:  'enemy_reaches_home',
    creatorBitosEvent:       false,
    digitalBriefingEvent:    false,
    briefing: 'Alien scouts have breached the perimeter. Deploy your Plasma Generator first. Keep your Fire-Lance Gunner ready.',
    waves: [
      // â”€â”€ Phase 1: 30 individual scouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // halfHpChain:true â€” WaveManager will spawn the NEXT scout only when the
      // PREVIOUS one reaches half HP, rather than using fixed delay offsets.
      // Lanes are randomised (not staircase) so aliens appear unpredictably.
      { id: 'scouts', label: 'SCOUTS', approachInterval: levelOneIndividualInterval, enemies: [
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
      ]},
      // â”€â”€ Phase 2: The Horde â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // hordeDelay:4000 â€” WaveManager waits 4s after the flag bearer warning
      // before spawning the thirteen drones so the player has time to react.
      // Drones are spread across random lanes so they form a visible line,
      // not a staircase. Flag Bearer (1.5Ã— speed) leads from lane 3.
      { id: 'horde', label: 'THE HORDE', isHorde: true, warningDelay: 5000, warnBeforeStart: true, spawnInterval: levelOneHordeInterval, isMajorWave: true, isFinalWave: true, enemies: [
        { type: 'vex_flag_bearer', lane: 3, delay: 0 },   // leads â€” 1.5Ã— speed, pinkish
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
        { type: 'vex_drone', lane: 1, delay: 0 },
        { type: 'vex_drone', lane: 2, delay: 0 },
        { type: 'vex_drone', lane: 5, delay: 0 },
        { type: 'vex_drone', lane: 4, delay: 0 },
        { type: 'vex_drone', lane: 3, delay: 0 },
      ]},
    ],
  };
  L[1].waves[0].enemies = L[1].waves[0].enemies.slice(0, 10);
  L[1].waves[1].enemies = L[1].waves[1].enemies.slice(0, 13);
  L[1].waves[0].enemies[7].type = 'vex_runner';
  L[1].waves[1].startAfterMs = L[1].durationMs - 30000;

  // Levels 2-50: stubs with reward schedule
  const levelData = [
    // Daytime (2-10)
    { id:2,  name:'Morning Patrol',      env:'daytime',     diff:'easy',   cardId:'hand_cannon_soldier' },
    { id:3,  name:'Garden Perimeter',    env:'daytime',     diff:'easy',   cardId:'arquebus_soldier' },
    { id:4,  name:'Fast Approach',       env:'daytime',     diff:'easy',   cardId:'pikeman' },
    { id:5,  name:'Backyard Rush',       env:'daytime',     diff:'easy',     cardId:'drummer_boy',        creatorBitos:true },
    { id:6,  name:'The Fence Line',      env:'daytime',     diff:'easy',     cardId:'field_cannon' },
    { id:7,  name:'Armored Vanguard',    env:'daytime',     diff:'moderate', cardId:'supply_officer' },
    { id:8,  name:'Greenhouse Stand',    env:'daytime',     diff:'moderate', cardId:'sharpshooter' },
    { id:9,  name:'Leaper Assault',      env:'daytime',     diff:'moderate', cardId:'field_medic_early' },
    { id:10, name:'Day Garden Finale',   env:'daytime',     diff:'moderate', cardId:'machine_gunner',     digitalBriefing:true },
    // Nighttime (11-20)
    { id:11, name:'Darkness Falls',      env:'nighttime',   diff:'moderate', cardId:'night_rifleman' },
    { id:12, name:'Shadow Scouts',       env:'nighttime',   diff:'moderate', cardId:'scout' },
    { id:13, name:'Night Patrol',        env:'nighttime',   diff:'moderate', cardId:'flare_operator' },
    { id:14, name:'Ambush at Dusk',      env:'nighttime',   diff:'moderate', cardId:'trench_soldier' },
    { id:15, name:'Shield Wall Night',   env:'nighttime',   diff:'medium', cardId:'searchlight_operator', creatorBitos:true },
    { id:16, name:'Midnight Siege',      env:'nighttime',   diff:'medium', cardId:'radio_operator' },
    { id:17, name:'Signal Disruption',   env:'nighttime',   diff:'medium', cardId:'armored_soldier' },
    { id:18, name:'Night Stalkers',      env:'nighttime',   diff:'medium', cardId:'night_medic' },
    { id:19, name:'Infiltration',        env:'nighttime',   diff:'medium', cardId:'sniper' },
    { id:20, name:'Night Finale',        env:'nighttime',   diff:'medium', cardId:'recon_unit',          digitalBriefing:true },
    // Foggy (21-30)
    { id:21, name:'Rising Waters',       env:'foggy',       diff:'medium', cardId:'gas_mask_soldier' },
    { id:22, name:'Submerged Path',      env:'foggy',       diff:'medium', cardId:'mortar_team' },
    { id:23, name:'Aquatic Assault',     env:'foggy',       diff:'medium', cardId:'field_mechanic' },
    { id:24, name:'Bog Defense',         env:'foggy',       diff:'hard',   cardId:'heavy_rifleman' },
    { id:25, name:'Colossus Emergence',  env:'foggy',       diff:'hard',   cardId:'forward_observer',    creatorBitos:true },
    { id:26, name:'Flood Surge',         env:'foggy',       diff:'hard',   cardId:'modern_rifleman' },
    { id:27, name:'Waterlogged',         env:'foggy',       diff:'hard', cardId:'shield_operator' },
    { id:28, name:'Delta Breach',        env:'foggy',       diff:'hard', cardId:'combat_medic' },
    { id:29, name:'Tide of Aliens',       env:'foggy',       diff:'hard', cardId:'drone_operator' },
    { id:30, name:'Flooded Finale',       env:'foggy',       diff:'hard', cardId:'rocket_specialist',   digitalBriefing:true },
    // Rainy-Stormy (31-40)
    { id:31, name:'Storm Warning',       env:'rainy_stormy',diff:'hard',   cardId:'mobile_generator' },
    { id:32, name:'Lightning Assault',   env:'rainy_stormy',diff:'hard',   cardId:'plasma_tech_engineer' },
    { id:33, name:'Thunder Line',       env:'rainy_stormy',diff:'hard',   cardId:'grenadier' },
    { id:34, name:'Tempest Defense',    env:'rainy_stormy',diff:'hard',   cardId:'hazmat_trooper' },
    { id:35, name:'Eye of the Storm',   env:'rainy_stormy',diff:'hard',   cardId:'radiation_specialist', creatorBitos:true },
    { id:36, name:'Storm Surge',         env:'rainy_stormy',diff:'expert', cardId:'plasma_soldier' },
    { id:37, name:'Hurricane Breach',    env:'rainy_stormy',diff:'expert', cardId:'energy_shield_generator' },
    { id:38, name:'Cyclone Defense',     env:'rainy_stormy',diff:'expert', cardId:'combat_drone' },
    { id:39, name:'Typhoon Protocol',    env:'rainy_stormy',diff:'expert', cardId:'autonomous_robot' },
    { id:40, name:'Storm Finale',        env:'rainy_stormy',diff:'expert', cardId:'plasma_mech',          digitalBriefing:true },
    // Radioactive (41-50)
    { id:41, name:'Contaminated Garden', env:'radioactive', diff:'expert', cardId:'laser_specialist' },
    { id:42, name:'Mutant Swarm',        env:'radioactive', diff:'expert', cardId:'energy_specialist' },
    { id:43, name:'Toxic Advance',       env:'radioactive', diff:'expert', cardId:'heavy_plasma_trooper' },
    { id:44, name:'Irradiated Zone',     env:'radioactive', diff:'expert', cardId:'support_specialist' },
    { id:45, name:'Mutation Protocol',   env:'radioactive', diff:'expert', cardId:'experimental_soldier',  creatorBitos:true },
    { id:46, name:'Aboard the Vessel',   env:'radioactive', diff:'expert', cardId:'advanced_combatant' },
    { id:47, name:'Bio-Dome Breach',     env:'radioactive', diff:'expert', cardId:'repair_technician' },
    { id:48, name:'Command Sector',      env:'radioactive', diff:'expert', cardId:'ammo_specialist' },
    { id:49, name:'Overlord Approach',   env:'radioactive', diff:'expert', cardId:'plasma_shield_unit' },
    { id:50, name:'FINAL MISSION',       env:'radioactive', diff:'impossible', cardId:'plasma_cannon_warrior', isBossLevel:true, digitalBriefing:true },
  ];

  levelData.forEach(d => {
    L[d.id] = {
      id: d.id,
      name: d.name,
      environment: d.env,
      unlocked: false,
      completed: false,
      difficulty: d.diff,
      durationMs: GW.DIFFICULTY_PACING[d.diff].durationMs,
      assaultDurationMs: GW.DIFFICULTY_PACING[d.diff].assaultDurationMs || null,
      bossDurationMs: GW.DIFFICULTY_PACING[d.diff].bossDurationMs || null,
      availableDefenders: ['plasma_energy_generator', 'fire_lancer'],
      availableEnemies:   ['vex_drone'],
      sentinelAvailable:  true,
      reward: { cardId: d.cardId },
      unlockRequirement: { level: d.id - 1, completed: true },
      victoryCondition:  'survive_waves',
      defeatCondition:   'enemy_reaches_home',
      creatorBitosEvent:    !!d.creatorBitos,
      digitalBriefingEvent: !!d.digitalBriefing,
      isBossLevel:          !!d.isBossLevel,
      briefing: `Level ${d.id}: ${d.name}`,
      waves: [],
    };
  });

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  //  PROCEDURAL WAVE GENERATOR
  //  Generates wave[] data for levels 2-50, survival, endless, puzzle,
  //  mini-games.
  //
  // Campaign pacing is configured by difficulty; non-campaign modes use fallback intervals.
  //
  //  ALIEN TYPE PROGRESSION by level tier:
  //  â”€ Easy     (L2â€“10):  bare, cap
  //  â”€ Medium   (L11â€“20): bare, cap, iron_mask, steel_helmet
  //  â”€ Hard     (L21â€“30): steel_helmet, armored_vest, shield
  //  â”€ Expert   (L31â€“40): heavy_helmet, full_armor, riot_shield
  //  â”€ Extreme  (L41â€“50): riot_shield, tactical_armor + specials
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Returns an equipment tier pool for a given level id.
   * Pool is an array of equipment ids with their spawn weights.
   */
  function equipPoolForLevel(levelId) {
    if (levelId <= 2)  return [['bare',1]];
    if (levelId <= 5)  return [['bare',2],['cap',1],['iron_mask',1]];
    if (levelId <= 10) return [['bare',2],['cap',1],['iron_mask',1],['wooden_shield',1],['bicycle',1],['newspaper',1],['museum_armor',1]];
    if (levelId <= 13) return [['bare',2],['cap',2],['iron_mask',1]];
    if (levelId <= 16) return [['bare',1],['cap',2],['iron_mask',2],['steel_helmet',1]];
    if (levelId <= 20) return [['cap',1],['iron_mask',2],['steel_helmet',2],['armored_vest',1]];
    if (levelId <= 24) return [['iron_mask',2],['steel_helmet',2],['armored_vest',2],['shield',1]];
    if (levelId <= 28) return [['steel_helmet',1],['armored_vest',2],['shield',2],['heavy_helmet',1]];
    if (levelId <= 32) return [['armored_vest',1],['shield',2],['heavy_helmet',2],['full_armor',1]];
    if (levelId <= 36) return [['shield',1],['heavy_helmet',2],['full_armor',2],['riot_shield',1]];
    if (levelId <= 40) return [['heavy_helmet',1],['full_armor',2],['riot_shield',2],['tactical_armor',1]];
    if (levelId <= 44) return [['full_armor',1],['riot_shield',2],['tactical_armor',3]];
    if (levelId <= 48) return [['riot_shield',2],['tactical_armor',4]];
    return [['tactical_armor',1]]; // L49-50 â€” pure tactical
  }

  /** Pick a random equipment id from a weighted pool. Uses a simple seeded index. */
  function pickEquip(pool, seed) {
    const total = pool.reduce((s, e) => s + e[1], 0);
    let r = ((seed * 1013904223 + 1664525) % 2147483648) / 2147483648 * total;
    for (var pi = 0; pi < pool.length; pi++) {
      r -= pool[pi][1];
      if (r <= 0) return pool[pi][0];
    }
    return pool[pool.length-1][0];
  }

  /**
   * Pick a pseudo-random lane from 1-5 using a simple hash.
   *
   * BUG FIX: The original LCG used multiplier 1664525 which is evenly
   * divisible by 5, so (seed * 1664525) % 5 === 0 for every seed â€” meaning
   * every alien spawned in the same lane (lane 4).
   *
   * Fix: use a multiplier that is NOT a multiple of 5, combined with a
   * bit-mixing step to ensure good distribution across all lanes.
   */
  function pickLane(seed) {
    // Mix the seed with a multiplier coprime to 5 and a large prime addend
    var h = Math.imul(seed + 1, 2654435761);  // Knuth multiplicative hash (coprime to 2^32)
    h = h ^ (h >>> 16);
    return (Math.abs(h) % 5) + 1;
  }

  function pickWaveLane(seed, index) {
    return ((Math.abs(seed) % 5 + index) % 5) + 1;
  }

  /**
   * Scout delay: cumulative ms from wave start.
  * Campaign gaps come from the difficulty spawn profile; this fallback is for other modes.
   * Uses deterministic pseudo-random (seed-based) so values are consistent.
   */
  function scoutDelays(count, seed, spawnProfile) {
    const delays = [];
    let acc = 0;
    for (let i = 0; i < count; i++) {
      delays.push(acc);
      if (spawnProfile) {
        const interval = spawnProfile.individualInterval || spawnProfile.interval;
        acc += interval[0] + Math.floor(Math.random() * (interval[1] - interval[0] + 1));
      } else {
        const r = ((seed + i * 7919) * 1664525 + 1013904223) % 2147483648;
        const [minDelay, maxDelay] = GW.WAVES.APPROACH_INTERVAL;
        acc += minDelay + (Math.abs(r) % (maxDelay - minDelay + 1));
      }
    }
    return delays;
  }

  /**
  * Assault wave fallback delays for non-campaign modes.
   * Returns array of cumulative ms delays from wave start.
   */
  function assaultDelays(count, seed) {
    const delays = [];
    let acc = 0;
    for (let i = 0; i < count; i++) {
      delays.push(acc);
      const r = ((seed + i * 6271) * 22695477 + 1) % 2147483648;
      const [minDelay, maxDelay] = GW.WAVES.APPROACH_INTERVAL;
      const gap = minDelay + (Math.abs(r) % (maxDelay - minDelay + 1));
      acc += gap;
    }
    return delays;
  }

  /**
   * Build waves array for a level.
   * @param {number} levelId   â€” for pool selection
  * @param {number} difficulty â€” 0=easy 1=moderate 2=medium 3=hard 4=expert 5=impossible
   * @param {boolean} isBoss
   */
  function buildLevelWaves(levelId, difficulty, isBoss, spawnProfile) {
    const pool = equipPoolForLevel(levelId);
    const seed = levelId * 31337;

    // Scout count scales with difficulty from Easy through the boss tier.
    const diff = Math.min(difficulty, 5);
    const pacing = [
      GW.DIFFICULTY_PACING.easy,
      GW.DIFFICULTY_PACING.moderate,
      GW.DIFFICULTY_PACING.medium,
      GW.DIFFICULTY_PACING.hard,
      GW.DIFFICULTY_PACING.expert,
      GW.DIFFICULTY_PACING.impossible,
    ][diff];
    const effectiveProfile = Object.assign({}, pacing, spawnProfile || {});
    const tierRanges = [[1,6],[7,14],[15,23],[24,35],[36,49],[50,50]];
    const [tierMin, tierMax] = tierRanges[diff] || [1, 50];
    const approachRange = effectiveProfile.scoutCountRange;
    const [approachMin, approachMax] = approachRange;
    const tierProgress = Math.max(0, Math.min(1, (levelId - tierMin) / Math.max(1, tierMax - tierMin)));
    const scoutCount = Math.round(approachMin + tierProgress * (approachMax - approachMin));
    const enemyTypeForLevel = () => {
      const roll = Math.random();
      // Mutually exclusive rarity bands: common variants lead at 75%, then
      // the introduced uncommon raiders lead at 72% before later tiers open.
      if (levelId < 6) return 'vex_drone';
      if (levelId < 16) return roll < 0.72 ? 'crater_raider' : 'vex_drone';
      if (levelId < 25) {
        if (roll < 0.72) return 'crater_raider';
        if (roll < 0.92) return 'beacon_brute';
        return 'vex_drone';
      }
      if (levelId < 32) {
        if (roll < 0.58) return 'crater_raider';
        if (roll < 0.84) return 'beacon_brute';
        if (roll < 0.96) return 'vanta_pouncer';
        return 'vex_drone';
      }
      if (levelId < 41) {
        if (roll < 0.40) return 'crater_raider';
        if (roll < 0.66) return 'beacon_brute';
        if (roll < 0.86) return 'vanta_pouncer';
        if (roll < 0.98) return 'glassback_stalker';
        return 'vex_drone';
      }
      if (roll < 0.34) return 'crater_raider';
      if (roll < 0.54) return 'beacon_brute';
      if (roll < 0.71) return 'vanta_pouncer';
      if (roll < 0.83) return 'glassback_stalker';
      if (roll < 0.95) return 'skyroot_titan';
      return 'ion_wing';
    };

    // Base assault size per difficulty tier â€” scales up within each tier by level.
    // Within a 10-level tier, the first level gets the BASE, the last gets BASE+tier_growth.
    // This ensures L2 (easy tier start) has ~5-6 in final wave, while L10 (easy tier end)
    // has ~15, and the scale keeps climbing through all 5 environments.
    const assaultBases  = [5, 8, 12, 18, 24, 32];
    const assaultMaxes  = [15, 18, 22, 26, 30, 42];
    // Position within this difficulty tier (0.0 = first level, 1.0 = last level)
    // Use the configured global campaign bands to interpolate within each tier.

    // Number of full assault waves: 1 easy, 2 medium, 3+ hard
    const waveCounts = [1, 2, 3, 4, 5, 5];
    const numWaves = waveCounts[diff];

    const waves = [];

    // â”€â”€ Pre-wave scouts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const preDelays = scoutDelays(scoutCount, seed, effectiveProfile);
    const preEnemies = preDelays.map(function(delay, i) {
      return {
        type:      enemyTypeForLevel(i),
        lane:      pickWaveLane(seed, i),
        delay:     delay,
        equipment: pickEquip(pool, seed + i * 1000),
      };
    });
    waves.push({ id: 'pre_wave', label: 'ADVANCE SCOUTS', enemies: preEnemies });

    // â”€â”€ Assault waves â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let w = 0; w < numWaves; w++) {
      const isFinal  = w === numWaves - 1;
      const waveSeed = seed + (w + 1) * 99991;
      const assaultRange = effectiveProfile.assaultCountRange;
      const waveSize = assaultRange
        ? assaultRange[0] + ((levelId + w) % (assaultRange[1] - assaultRange[0] + 1))
        : (diff >= 4 ? 25 + ((levelId + w) % 11) : 20 + ((levelId + w) % 11));
      const flagCount = 1;
      const enemies = Array.from({ length: waveSize }, function(_, i) {
        return {
          type:      enemyTypeForLevel(i + w),
          lane:      pickWaveLane(waveSeed, i),
          delay:     0,
          equipment: pickEquip(pool, waveSeed + i * 777),
        };
      });
      for (let i = 0; i < flagCount; i++) {
        enemies.push({ type: 'vex_flag_bearer', lane: 3, delay: 0, equipment: 'bare' });
      }

      waves.push({
        id:          isFinal ? 'wave_final' : 'wave_' + (w + 1),
        label:       isFinal ? 'FINAL WAVE' : (w === 0 ? 'FIRST WAVE' : 'WAVE ' + (w + 1)),
        isMajorWave: true,
        isFinalWave: isFinal,
        isHorde:     true,
        warningDelay: 5000,
        warnBeforeStart: true,
        flagBearerCount: flagCount,
        spawnInterval: (effectiveProfile.waveIntervals && effectiveProfile.waveIntervals[w]) || effectiveProfile.interval,
        enemies:     enemies,
      });

      // Between waves: add a pressure scout phase (except after final)
      if (!isFinal && diff < 5) {
        const pressSeed   = seed + (w + 1) * 55557;
        const pressCount  = scoutCount;
        const pressDelays = scoutDelays(pressCount, pressSeed, effectiveProfile);
        const pressEnemies = pressDelays.map(function(delay, i) {
          return {
            type:      enemyTypeForLevel(i + pressSeed),
            lane:      pickWaveLane(pressSeed, i),
            delay:     delay,
            equipment: pickEquip(pool, pressSeed + i * 1337),
          };
        });
        waves.push({ id: 'pressure_' + (w + 1), label: 'PRESSURE', enemies: pressEnemies });
      }
    }

    // â”€â”€ Boss wave (level 50 only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (isBoss) {
      const bossDelays = (spawnProfile
        ? scoutDelays(10, seed + 888888, effectiveProfile)
        : assaultDelays(10, seed + 888888)).map(delay => delay + 5000);
      waves.push({
        id: 'wave_boss', label: 'OVERLORD APPROACHES', isMajorWave: true, isBossWave: true,
        startAfterMs: effectiveProfile.assaultDurationMs,
        warningDelay: 5000,
        warnBeforeStart: true,
        spawnInterval: effectiveProfile.interval,
        enemies: [{ type: 'vex_flag_bearer', lane: 3, delay: 0, equipment: 'bare' }].concat(bossDelays.map(function(delay, i) {
          return {
            type:      diff === 5 ? (i === 0 ? 'vex_overlord' : 'vex_elite') : (i === 9 ? 'vex_overlord' : 'vex_elite'),
            lane:      pickLane(seed + 888888 + i),
            delay:     delay,
            equipment: (diff === 5 ? i === 0 : i === 9) ? 'bare' : 'tactical_armor',
          };
        })),
      });
    }

    const missionDurationMs = effectiveProfile.durationMs;
    const majorHordes = waves.filter(wave => wave.isHorde);
    const hordeWindowMs = isBoss && effectiveProfile.assaultDurationMs
      ? effectiveProfile.assaultDurationMs
      : Math.max(0, missionDurationMs - 30000);
    majorHordes.forEach((wave, index) => {
      wave.startAfterMs = hordeWindowMs * (index + 1) / (majorHordes.length + (isBoss ? 1 : 0));
    });

    const variantRange = effectiveProfile.variantCountRange;
    const variantCount = variantRange[0] + (levelId % (variantRange[1] - variantRange[0] + 1));
    const commonEntries = waves.reduce((entries, wave) => entries.concat(wave.enemies || []), [])
      .filter(entry => entry.type !== 'vex_flag_bearer' && entry.type !== 'vex_elite' && entry.type !== 'vex_overlord');
    for (let i = 0; i < Math.min(variantCount, commonEntries.length); i++) {
      commonEntries[(i * 7 + levelId) % commonEntries.length].type = 'vex_runner';
    }

    const eliteWaves = majorHordes;
    for (let i = 0; i < effectiveProfile.eliteCount && eliteWaves.length; i++) {
      const wave = eliteWaves[i % eliteWaves.length];
      wave.enemies.push({
        type: 'vex_elite',
        lane: (i % 5) + 1,
        delay: 0,
        equipment: 'tactical_armor',
      });
    }

    return waves;
  }

  // â”€â”€ Difficulty mapping â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const diffMap = { easy: 0, moderate: 1, medium: 2, hard: 3, expert: 4, impossible: 5, extreme: 5 };
  const nonAdventureSpawnProfile = {
    interval: [1500, 2500],
  };

  // â”€â”€ Assign waves to ALL levels 2-50 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  for (let id = 2; id <= 50; id++) {
    if (!L[id]) continue;
    const diff = diffMap[L[id].difficulty] ?? 0;
    L[id].waves = buildLevelWaves(id, diff, !!L[id].isBossLevel, GW.DIFFICULTY_PACING[L[id].difficulty]);
    // Update available enemies pool based on level tier
    if (id >= 41) L[id].availableEnemies = ['vex_drone','crater_raider','beacon_brute','vanta_pouncer','glassback_stalker','skyroot_titan','ion_wing','vex_overlord'];
    else if (id >= 32) L[id].availableEnemies = ['vex_drone','crater_raider','beacon_brute','vanta_pouncer','glassback_stalker'];
    else if (id >= 25) L[id].availableEnemies = ['vex_drone','crater_raider','beacon_brute','vanta_pouncer'];
    else if (id >= 16) L[id].availableEnemies = ['vex_drone','crater_raider','beacon_brute'];
    else if (id >= 6) L[id].availableEnemies = ['vex_drone','vex_runner','crater_raider'];
    else               L[id].availableEnemies = ['vex_drone','vex_runner'];
  }

  // â”€â”€ Survival mode wave sets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Survival modes use the same generator but at expert difficulty
  // and cycle indefinitely (handled by WaveManager when waves[] repeats).
  GW.SURVIVAL_WAVE_SETS = {};
  if (typeof GW.SURVIVAL_MODES !== 'undefined') {
    const survivalDiffByEnv = {
      daytime: 1, nighttime: 2, foggy: 2, rainy_stormy: 3, radioactive: 3,
    };
    GW.SURVIVAL_MODES.forEach(function(mode, idx) {
      const diff = survivalDiffByEnv[mode.env] || 2;
      // Use a high fake levelId (100+) so pool gives hard alien types
      GW.SURVIVAL_WAVE_SETS[mode.id] = buildLevelWaves(30 + idx * 5, diff, false, nonAdventureSpawnProfile);
    });
  }

  // â”€â”€ Mini-game wave sets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  GW.MINIGAME_WAVE_SETS = {};
  if (typeof GW.MINIGAMES !== 'undefined') {
    GW.MINIGAMES.forEach(function(mg, idx) {
      // Mini-games: medium difficulty, shorter waves
      GW.MINIGAME_WAVE_SETS[mg.id] = buildLevelWaves(10 + idx * 2, 1, false, nonAdventureSpawnProfile);
    });
  }

  // â”€â”€ Puzzle wave sets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  GW.PUZZLE_WAVE_SETS = {};
  if (typeof GW.PUZZLES !== 'undefined') {
    GW.PUZZLES.forEach(function(pz, idx) {
      // Puzzles: fixed small wave, easy-medium
      GW.PUZZLE_WAVE_SETS[pz.id] = buildLevelWaves(5 + idx, Math.min(1, idx % 2), false, nonAdventureSpawnProfile);
    });
  }

  // â”€â”€ Endless mode base wave set â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Endless starts at medium and scales; base template for wave 1
  GW.ENDLESS_BASE_WAVES = buildLevelWaves(15, 1, false, nonAdventureSpawnProfile);
  GW.buildLevelWaves = buildLevelWaves;
  GW.NON_ADVENTURE_SPAWN_PROFILE = nonAdventureSpawnProfile;

  GW.LEVELS = L;
})();

// â”€â”€â”€ Mini-Games / Puzzle / Survival / Endless â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.MINIGAMES = [
  { id:'rapid_defense',  name:'Rapid Defense',     icon:'âš¡', unlocked:false, description:'Survive waves with limited placement time.' },
  { id:'target_range',   name:'Alien Target Range', icon:'ðŸŽ¯', unlocked:false, description:'Shoot alien targets. Time challenge.' },
  { id:'energy_rush',    name:'Energy Rush',        icon:'ðŸ”‹', unlocked:false, description:'Collect as much Plasma as possible in 60s.' },
  { id:'lane_switch',    name:'Lane Switch',        icon:'â†”ï¸', unlocked:false, description:'Aliens switch lanes. Adapt your defense.' },
  { id:'last_stand',     name:'Last Stand',         icon:'ðŸ›¡', unlocked:false, description:'Hold with limited defenders. 10 waves.' },
  { id:'escort',         name:'Escort Mission',     icon:'ðŸš¶', unlocked:false, description:'Protect a moving supply convoy.' },
  { id:'resource_rush',  name:'Resource Challenge', icon:'ðŸ’Ž', unlocked:false, description:'No orbs. Kill rewards only.' },
  { id:'precision',      name:'Precision Shooting', icon:'ðŸŽ–', unlocked:false, description:'Only precision shots count.' },
  { id:'relay',          name:'Defense Relay',      icon:'ðŸ“¡', unlocked:false, description:'3 boards back-to-back.' },
  { id:'alien_hunt',     name:'Alien Hunt',         icon:'ðŸ‘¾', unlocked:false, description:'Special aliens scatter across lanes.' },
  { id:'minimal',        name:'Minimal Defense',    icon:'âš—', unlocked:false, description:'Only 2 defenders. Placement is everything.' },
  { id:'speed_run',      name:'Speed Run',          icon:'â±', unlocked:false, description:'Clear all waves as fast as possible.' },
  { id:'tank_mode',      name:'Tank Mode',          icon:'ðŸ›¡', unlocked:false, description:'Enemies have 10x health.' },
  { id:'fog_mini',       name:'Fog Assault',        icon:'ðŸŒ«', unlocked:false, description:'Dense fog. React to hints.' },
  { id:'blitz',          name:'Blitz',              icon:'ðŸ’¥', unlocked:false, description:'Aliens from both sides.' },
  { id:'sniper_only',    name:'Sniper Only',        icon:'ðŸ”­', unlocked:false, description:'Long-range only.' },
  { id:'no_regen',       name:'Iron Budget',        icon:'ðŸ’°', unlocked:false, description:'No generators. Starting plasma only.' },
  { id:'survival_mini',  name:'Quick Survival',     icon:'ðŸŒŠ', unlocked:false, description:'5-minute unlimited waves.' },
  { id:'boss_rush',      name:'Boss Preview',       icon:'ðŸ‘¹', unlocked:false, description:'Mini-boss variants in sequence.' },
  { id:'free_play',      name:'Free Play',          icon:'ðŸŽ®', unlocked:true,  description:'Level 1 with no restrictions.' },
];

GW.PUZZLES = [
  { id:'p01', name:'First Puzzle',      icon:'ðŸ§©', unlocked:false, description:'Place 3 defenders to stop all aliens.' },
  { id:'p02', name:'Energy Puzzle',     icon:'âš¡', unlocked:false, description:'No generators. Use 75 Plasma to win.' },
  { id:'p03', name:'Single Lane',       icon:'âž¡ï¸', unlocked:false, description:'All aliens in Lane 3. Stop with 2 units.' },
  { id:'p04', name:'Timing Challenge',  icon:'â°', unlocked:false, description:'Placement locked after 5 seconds.' },
  { id:'p05', name:'Shield Breaker',    icon:'ðŸ›¡', unlocked:false, description:'Shield aliens only. Find the counter.' },
  { id:'p06', name:'Leaper Logic',      icon:'ðŸ¦˜', unlocked:false, description:'Leapers bypass front row.' },
  { id:'p07', name:'Fog Logic',         icon:'ðŸŒ«', unlocked:false, description:'Limited visibility.' },
  { id:'p08', name:'Five Lane Perfect', icon:'5ï¸âƒ£', unlocked:false, description:'Cover all 5 lanes on a budget.' },
  { id:'p09', name:'No Combat',         icon:'ðŸš«', unlocked:false, description:'Support only. Use the Sentinel.' },
  { id:'p10', name:'Low HP Puzzle',     icon:'â¤ï¸', unlocked:false, description:'Defenders start at 10 HP.' },
  { id:'p11', name:'Lane Swap',         icon:'ðŸ”€', unlocked:false, description:'Aliens switch lanes each wave.' },
  { id:'p12', name:'Speed Puzzle',      icon:'ðŸ’¨', unlocked:false, description:'Fast aliens only.' },
  { id:'p13', name:'Dense Formation',   icon:'ðŸ‘¾', unlocked:false, description:'Massive groups. Need splash damage.' },
  { id:'p14', name:'Minimal Budget',    icon:'ðŸ’Ž', unlocked:false, description:'100 Plasma total. No generators.' },
  { id:'p15', name:'Multi-Role',        icon:'ðŸŽ­', unlocked:false, description:'Must use offense, support, medic.' },
  { id:'p16', name:'Boss Puzzle',       icon:'ðŸ‘¹', unlocked:false, description:'One boss alien. Limited resources.' },
  { id:'p17', name:'Blind Shot',        icon:'ðŸ‘',  unlocked:false, description:'No HP bars visible.' },
  { id:'p18', name:'The Final Puzzle',  icon:'ðŸ†', unlocked:false, description:'All mechanics combined.' },
];

GW.SURVIVAL_MODES = [
  { id:'sv_daytime',   name:'Daytime',       icon:'â˜€ï¸', unlocked:true,  env:'daytime',     description:'Survive in daylight. Classic invasion.' },
  { id:'sv_nighttime', name:'Nighttime',     icon:'ðŸŒ™', unlocked:false, env:'nighttime',   description:'Night survival. Limited visibility.' },
  { id:'sv_foggy',     name:'Flooded',       icon:'ðŸŒŠ', unlocked:false, env:'foggy',       description:'Flooded basin. Defend the submerged lanes.' },
  { id:'sv_storm',     name:'Storm',         icon:'â›ˆ', unlocked:false, env:'rainy_stormy',description:'Storm conditions. Brutal.' },
  { id:'sv_radio',     name:'Radioactive',   icon:'â˜¢ï¸', unlocked:false, env:'radioactive', description:'Contaminated zone. Mutated aliens.' },
  { id:'sv_winter',    name:'Winter',        icon:'â„ï¸', unlocked:false, env:'winter',      description:'Winter mini-game environment.' },
  { id:'sv_spaceship', name:'Alien Vessel',  icon:'ðŸš€', unlocked:false, env:'spaceship',   description:'Aboard the enemy ship.' },
  { id:'sv_heavy',     name:'Heavy Assault', icon:'âš”ï¸', unlocked:false, env:'daytime',     description:'Armored and brute aliens only.' },
  { id:'sv_boss_rush', name:'Boss Rush',     icon:'ðŸ‘¹', unlocked:false, env:'spaceship',   description:'Consecutive boss-class enemies.' },
  { id:'sv_last_stand',name:'Last Stand',    icon:'ðŸ›¡', unlocked:false, env:'rainy_stormy',description:'All lanes assault simultaneously.' },
];

GW.SURVIVAL_WAVE_SETS = {};
const _survivalDifficultyByEnv = {
  daytime: 1, nighttime: 2, foggy: 2, rainy_stormy: 3, radioactive: 3,
};
GW.SURVIVAL_MODES.forEach((mode, index) => {
  GW.SURVIVAL_WAVE_SETS[mode.id] = GW.buildLevelWaves(
    30 + index * 5,
    _survivalDifficultyByEnv[mode.env] || 2,
    false,
    GW.NON_ADVENTURE_SPAWN_PROFILE
  );
});

GW.MINIGAME_WAVE_SETS = {};
GW.MINIGAMES.forEach((mode, index) => {
  GW.MINIGAME_WAVE_SETS[mode.id] = GW.buildLevelWaves(
    10 + index * 2, 1, false, GW.NON_ADVENTURE_SPAWN_PROFILE
  );
});

GW.PUZZLE_WAVE_SETS = {};
GW.PUZZLES.forEach((puzzle, index) => {
  GW.PUZZLE_WAVE_SETS[puzzle.id] = GW.buildLevelWaves(
    5 + index, Math.min(1, index % 2), false, GW.NON_ADVENTURE_SPAWN_PROFILE
  );
});

GW.ENDLESS = {
  id: 'endless', name: 'Endless Survival',
  description: 'Waves never stop. Difficulty scales. Score scales with wave.',
  highScore: { wave: 0, score: 0, time: 0, aliensDefeated: 0 },
  difficultyScale: {
    hpMultiplierPerWave: 0.06,
    speedMultiplierPerWave: 0.03,
    spawnDelayReduction: 0.02,
    specialAlienChanceBase: 0.1,
    bossChanceEvery: 15,
  },
};

// â”€â”€â”€ Game Modes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.GAME_MODES = {
  adventure:          { id:'adventure',          name:'Adventure',          unlocked:true },
  survival:           { id:'survival',           name:'Survival / Endless', unlocked:false },
  minigames:          { id:'minigames',           name:'Mini-Games',         unlocked:false },
  puzzle:             { id:'puzzle',             name:'Puzzle',             unlocked:false },
  characters_profile: { id:'characters_profile', name:'Characters Profile', unlocked:false },
  extras:             { id:'extras',             name:'Extras',             unlocked:true  },
  settings:           { id:'settings',           name:'Settings',           unlocked:true },
  credits:            { id:'credits',            name:'Credits',            unlocked:true },
};

// â”€â”€â”€ Progression Schema â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.PROGRESSION_SCHEMA = {
  version:          2,
  playerName:       '',
  isNewPlayer:      true,
  currentLevel:     1,
  completedLevels:  [],
  claimedCards:     ['plasma_energy_generator', 'fire_lancer'],
  discoveredEnemies:['vex_drone'],
  unlockedModes:    ['adventure', 'extras', 'settings', 'credits'],
  unlockedEnvs:     ['daytime'],
  achievements:     [],
  bestSurvivalScores: {},
  bestEndlessWave:  0,
  bestEndlessScore: 0,
  settings: {
    sfxVolume: 0.8, musicVolume: 0.6, showTips: true, pixelArt: true,
    resolution: 'standard', graphicsQuality: 'balanced', textureQuality: 'crisp', modelQuality: 'high',
  },
};

// â”€â”€â”€ Asset Registry â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Asset Paths (deployment-safe web paths) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// All paths are root-relative (/assets/...) and work identically
// on localhost AND on any production server.
// Filenames are lowercase to match Linux/production filesystem case-sensitivity.
GW.ASSETS = {
  // â”€â”€ Sprite paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Currently null â€” game uses procedural Phaser graphics.
  // When real sprite sheets arrive, replace null with the path string.
  // Example: plasma_energy_generator: "/assets/sprites/characters/player/plasma_energy_generator.svg"
  SPRITES: {
    plasma_energy_generator: "/assets/sprites/characters/player/plasma_energy_generator.svg",
    fire_lancer:             "/assets/sprites/characters/player/fire_lancer.svg",
    vex_drone:               "/assets/sprites/characters/enemy/pipkin-scout.svg",
    vex_flag_bearer:         "/assets/sprites/characters/enemy/signal-bearer.svg",
    crater_raider:           "/assets/sprites/characters/enemy/crater_raider.svg",
    beacon_brute:            "/assets/sprites/characters/enemy/beacon-brute.svg",
    vanta_pouncer:           "/assets/sprites/characters/enemy/vanta-pouncer.svg",
    glassback_stalker:       "/assets/sprites/characters/enemy/glassback-stalker.svg",
    skyroot_titan:           "/assets/sprites/characters/enemy/skyroot-titan.svg",
    ion_wing:                "/assets/sprites/characters/enemy/ion-wing.svg",
    vex_overlord:            "/assets/sprites/characters/enemy/rift-matriarch.svg",
    sentinel:                null,  // sentinel uses procedural graphics
    creator_bitos:           null,  // Creator Bitos uses procedural graphics
  },
  BASIC_ENEMIES: {
    common: "/assets/sprites/enemies/basic/mosskin-scout.svg",
    flagBearer: "/assets/sprites/enemies/basic/signal-bearer.svg",
  },

  // Full sprite-sheet roster manifest (generated by tools/generate-sprite-sheets.js).
  // 52 player sheets + 51 enemy sheets, each a labelled IDLE/WALK/ATTACK/
  // HURT/DEATH animation grid. Fetched lazily when a scene needs a sheet.
  SPRITE_MANIFEST: "/assets/sprites/sprite-manifest.json",

  // â”€â”€ Audio paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Paths to audio assets. OGG primary (open, compact), MP3 fallback.
  // null = file not yet available; the audio manager skips null entries.
  // Five battle themes â€” one per environment (daytime/nighttime/foggy/storm/radioactive).
  AUDIO: {
    // â”€â”€ Music â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    menuMusic:         '/assets/audio/music/menu-theme.ogg',
    loadingMusic:      '/assets/audio/music/loading-theme.ogg',
    battleDaytime:     '/assets/audio/music/battle-daytime.ogg',
    battleNighttime:   '/assets/audio/music/battle-nighttime.ogg',
    battleFoggy:       '/assets/audio/music/battle-foggy.ogg',
    battleStorm:       '/assets/audio/music/battle-storm.ogg',
    battleRadioactive: '/assets/audio/music/battle-radioactive.ogg',
    victoryMusic:      '/assets/audio/music/victory.ogg',
    defeatMusic:       '/assets/audio/music/defeat.ogg',
    briefingMusic:     '/assets/audio/music/briefing.ogg',

    // â”€â”€ SFX â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    fireLanceShoot:    '/assets/audio/sfx/fire-lance-shoot.ogg',
    plasmaShoot:       '/assets/audio/sfx/plasma-shoot.ogg',
    bulletShoot:       '/assets/audio/sfx/bullet-shoot.ogg',
    enemyHit:          '/assets/audio/sfx/enemy-hit.ogg',
    enemyDeath:        '/assets/audio/sfx/enemy-death.ogg',
    defenderPlaced:    '/assets/audio/sfx/defender-placed.ogg',
    plasmaCollect:     '/assets/audio/sfx/plasma-collect.ogg',
    waveStart:         '/assets/audio/sfx/wave-start.ogg',
    sentinelActivate:  '/assets/audio/sfx/sentinel-activate.ogg',
    baseHit:           '/assets/audio/sfx/base-hit.ogg',
    hordeWarning:      '/assets/audio/sfx/horde-warning.ogg',
    explosion:         '/assets/audio/sfx/explosion.ogg',

    // â”€â”€ UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    btnClick:          '/assets/audio/ui/btn-click.ogg',
    btnHover:          '/assets/audio/ui/btn-hover.ogg',
    menuOpen:          '/assets/audio/ui/menu-open.ogg',
    menuClose:         '/assets/audio/ui/menu-close.ogg',
    cardSelect:        '/assets/audio/ui/card-select.ogg',
    levelUnlock:       '/assets/audio/ui/level-unlock.ogg',
    notification:      '/assets/audio/ui/notification.ogg',
    deploy:            '/assets/audio/ui/deploy.ogg',
  },

  // â”€â”€ Background image paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Battlefield backgrounds per environment â€” SVG format, 960x600.
  // The battlefield currently renders via Phaser procedural graphics,
  // so these serve as reference / fallback background layers.
  BACKGROUNDS: {
    daytime:      "/assets/backgrounds/battlefield/daytime.svg",
    nighttime:    "/assets/backgrounds/battlefield/nighttime.svg",
    flooded:      "/assets/backgrounds/battlefield/flooded.svg",
    storm:        "/assets/backgrounds/battlefield/storm.svg",
    radioactive:  "/assets/backgrounds/battlefield/radioactive.svg",
    foggy:        "/assets/backgrounds/battlefield/flooded.svg",
    rainy_stormy: "/assets/backgrounds/battlefield/storm.svg",
    menu:         "/assets/backgrounds/menu/menu-bg.svg",
    briefing:     "/assets/backgrounds/briefing/briefing-bg.svg",
    victory:      "/assets/backgrounds/victory/victory-bg.svg",
    defeat:       "/assets/backgrounds/defeat/defeat-bg.svg",
  },

  // â”€â”€ UI asset paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  UI: {
    plasmaIcon:    "/assets/ui/hud/plasma-icon.svg",
    waveMarker:    "/assets/ui/hud/wave-marker.svg",
    alienHead:     "/assets/ui/indicators/alien-head.svg",
    menuIcon:      "/assets/ui/indicators/menu-icon.svg",
    pauseIcon:     "/assets/ui/indicators/pause-icon.svg",
    hudBar:        "/assets/ui/panels/hud-bar.svg",
    timelineBar:   "/assets/ui/panels/timeline-bar.svg",
    cardSlot:      "/assets/ui/panels/card-slot.svg",
  },

  // â”€â”€ Effect paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  EFFECTS: {
    hitSpark:      "/assets/sprites/effects/resonance-hit.svg",
    deathBurst:    "/assets/sprites/effects/matriarch-burst.svg",
    plasmaCollect: "/assets/sprites/effects/plasma-collect.svg",
    spawnRing:     "/assets/sprites/effects/spawn-ring.svg",
  },

  // â”€â”€ Projectile paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  PROJECTILES: {
    fireLance: "/assets/sprites/projectiles/fire-lance-shot.svg",
    plasma:    "/assets/sprites/projectiles/ion-lance.svg",
    bullet:    "/assets/sprites/projectiles/kinetic-bolt.svg",
  },
};

// â”€â”€â”€ Scene Keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
GW.SCENES = {
  BOOT:     'BootScene',
  INTRO:    'IntroScene',
  MENU:     'MenuScene',
  MAP:      'MapScene',
  BRIEFING: 'BriefingScene',
  CARD_SEL: 'CardSelectionScene',
  GAME:     'GameScene',
  WIN:      'WinScene',
  LOSE:     'LoseScene',
};

// â”€â”€â”€ UI Colors â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// CHRONO-FRONT: GALACTIC WAR â€” theme palette
// Primary: cosmic amber/gold + galactic teal. Deep space backgrounds.
GW.UI_COLORS = {
  TEXT_PRIMARY:    '#e8f0ff',   // near-white with blue tint
  TEXT_DIM:        '#6b85a0',   // muted blue-grey
  TEXT_ACCENT:     '#f59e0b',   // amber gold
  TEXT_DANGER:     '#ef4444',   // red (unchanged)
  TEXT_ALIEN:      '#c4b5fd',   // alien purple (unchanged)
  GREEN_BRIGHT:    '#22d3ee',   // galactic teal â€” replaces garden green
  GREEN_GRASS:     '#06b6d4',   // deeper teal
  GREEN_MILITARY:  '#1d4ed8',   // military blue
  GREEN_DARK:      '#1e3a5f',   // dark navy
  EARTH_BROWN:     '#7c4a1a',   // unchanged (terrain)
  SKY_BLUE:        '#bfdbfe',   // light cosmic blue
  PLASMA:          '#a78bfa',   // plasma purple (unchanged)
  PLASMA_BRIGHT:   '#c4b5fd',   // plasma bright (unchanged)
  GOLD:            '#f59e0b',   // amber gold â€” main accent
  PANEL_BG:        '#040c18',   // deep space panel
  HEALTH_FULL:     '#22d3ee',   // teal health bar
  HEALTH_LOW:      '#ef4444',   // red low health (unchanged)
  BITOS_GOLD:      '#f59e0b',   // amber
  DIGITAL_GREEN:   '#22d3ee',   // terminal teal
  TRAY_BG:         '#060d1a',   // dark space tray
  TRAY_BORDER:     'rgba(34,211,238,0.3)', // teal border
  TIMELINE_BG:     '#030810',   // deep space timeline
  TIMELINE_FILL:   '#22d3ee',   // teal fill
  WAVE_MARKER:     '#f59e0b',   // gold wave marker
  FINAL_MARKER:    '#ef4444',   // red final (unchanged)
  FLAG_MARKER:     '#e879f9',   // alien flag (unchanged)
  PLASMA_ICON:     '#a78bfa',   // plasma icon (unchanged)
  SENTINEL_COLOR:  '#22d3ee',   // teal sentinel
  SENTINEL_WARN:   '#f59e0b',   // gold warning
  PAUSE_OVERLAY:   'rgba(0,0,0,0.88)',
  MENU_BTN:        '#1e3a5f',   // navy menu
};

// Freeze immutable sections
Object.freeze(GW.DISPLAY);
Object.freeze(GW.BOARD);
Object.freeze(GW.RESOURCES);
Object.freeze(GW.WAVES);
Object.freeze(GW.COMBAT);
Object.freeze(GW.SENTINEL);
Object.freeze(GW.WAVE_TIMELINE);
Object.freeze(GW.SCENES);
Object.freeze(GW.UI_COLORS);
Object.freeze(GW.ENDLESS.difficultyScale);
