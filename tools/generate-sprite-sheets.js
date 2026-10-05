/**
 * Galactic Warfare — Sprite-Sheet Generator
 * ──────────────────────────────────────────
 * Produces "pure sprite sheet" SVG assets for every unit in the roster:
 *   • 50 player cards  → public/assets/sprites/characters/player/<slug>.svg
 *   • 49 enemy units   → public/assets/sprites/characters/enemy/<slug>.svg
 *
 * Each sheet is a labelled animation grid matching the existing reference
 * format (see public/assets/sprites/enemies/basic/vex_drone.svg):
 *   IDLE (6) · WALK (6) · ATTACK (8) · TAKE DAMAGE (4) · DEATH (6)
 *
 * Art is stylised/geometric so every unit reads clearly at game scale and is
 * visually distinct via its environment palette + archetype silhouette.
 *
 * Usage:  node tools/generate-sprite-sheets.js
 * Also writes a manifest: public/assets/sprites/sprite-manifest.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT        = path.join(__dirname, '..');
const PLAYER_DIR  = path.join(ROOT, 'public', 'assets', 'sprites', 'characters', 'player');
const ENEMY_DIR   = path.join(ROOT, 'public', 'assets', 'sprites', 'characters', 'enemy');

/* ── Layout ─────────────────────────────────────────────────── */
const CELL_W   = 64;
const CELL_H   = 78;
const GUTTER   = 92;      // left column for row labels
const HEADER_H = 48;
const PAD      = 12;

const ROWS = [
  { key: 'IDLE',        label: 'IDLE (6)',         frames: 6 },
  { key: 'WALK',        label: 'WALK (6)',         frames: 6 },
  { key: 'ATTACK',      label: 'ATTACK (8)',       frames: 8 },
  { key: 'TAKE DAMAGE', label: 'TAKE DAMAGE (4)',  frames: 4 },
  { key: 'DEATH',       label: 'DEATH (6)',        frames: 6 },
];
const MAX_COLS = Math.max(...ROWS.map(r => r.frames));
const WIDTH    = GUTTER + MAX_COLS * CELL_W + PAD;
const HEIGHT   = HEADER_H + ROWS.length * CELL_H + PAD;

/* ── Environment palettes ───────────────────────────────────── */
const PLAYER_PAL = {
  daytime:     { bg:'#1a2410', uniform:'#4d7c0f', uniformDark:'#33550a', helmet:'#3d2008', skin:'#d4956a', accent:'#f59e0b', glow:'#fde68a', weapon:'#374151', metal:'#9ca3af', title:'#fbbf24' },
  nighttime:   { bg:'#0b1020', uniform:'#1e2d3d', uniformDark:'#111827', helmet:'#0b1220', skin:'#c8956a', accent:'#4b6cb7', glow:'#67e8f9', weapon:'#1f2937', metal:'#94a3b8', title:'#818cf8' },
  flooded:     { bg:'#06262f', uniform:'#0e7490', uniformDark:'#155e75', helmet:'#164e63', skin:'#d4956a', accent:'#22d3ee', glow:'#a5f3fc', weapon:'#0f172a', metal:'#7dd3fc', title:'#22d3ee' },
  foggy:       { bg:'#1b2027', uniform:'#64748b', uniformDark:'#475569', helmet:'#334155', skin:'#cbd5e1', accent:'#cbd5e1', glow:'#e2e8f0', weapon:'#1e293b', metal:'#cbd5e1', title:'#cbd5e1' },
  radioactive: { bg:'#111a06', uniform:'#3f6212', uniformDark:'#1a2e05', helmet:'#365314', skin:'#d9f99d', accent:'#a3e635', glow:'#bef264', weapon:'#14532d', metal:'#84cc16', title:'#a3e635' },
};

const ENEMY_PAL = {
  daytime:     { bg:'#12081f', body:'#4c3b7a', accent:'#7c6ab5', eye:'#e879f9', core:'#a855f7', dark:'#1a0a2e', title:'#c4b5fd' },
  nighttime:   { bg:'#07040f', body:'#2a1a5e', accent:'#4c1d95', eye:'#f0abfc', core:'#a855f7', dark:'#0b0724', title:'#a78bfa' },
  flooded:     { bg:'#04212b', body:'#0e7490', accent:'#06b6d4', eye:'#67e8f9', core:'#0891b2', dark:'#082f49', title:'#22d3ee' },
  foggy:       { bg:'#141a20', body:'#475569', accent:'#94a3b8', eye:'#e2e8f0', core:'#cbd5e1', dark:'#1e293b', title:'#cbd5e1' },
  radioactive: { bg:'#0d1a05', body:'#3f6212', accent:'#84cc16', eye:'#bef264', core:'#a3e635', dark:'#14532d', title:'#a3e635' },
};

/* ── Rosters ────────────────────────────────────────────────── */
// Player cards — Levels 1-50 (obtainable / usable by player)
const PLAYERS = [
  [1,'Bombman','daytime','bomb'],        [2,'Rifleman','daytime','rifle'],
  [3,'Sniper','daytime','sniper'],       [4,'Heavy Gunner','daytime','heavy'],
  [5,'Rocket Trooper','daytime','rocket'],[6,'Combat Medic','daytime','medic'],
  [7,'Shield Soldier','daytime','shield'],[8,'Machine Gunner','daytime','mg'],
  [9,'Grenadier','daytime','grenade'],   [10,'Tank Commander','daytime','tank'],

  [11,'Night Stalker','nighttime','stealth'],[12,'Shadow Sniper','nighttime','sniper'],
  [13,'Stealth Operative','nighttime','stealth'],[14,'Night Vision Gunner','nighttime','nv'],
  [15,'Tactical Assassin','nighttime','assassin'],[16,'Silent Ranger','nighttime','rifle'],
  [17,'Phantom Trooper','nighttime','phantom'],[18,'Recon Specialist','nighttime','recon'],
  [19,'Night Hunter','nighttime','hunter'],[20,'Shadow Commander','nighttime','commander'],

  [21,'Marine Rifleman','flooded','rifle'],[22,'Depth Diver','flooded','diver'],
  [23,'Torpedo Soldier','flooded','torpedo'],[24,'Hydro Gunner','flooded','mg'],
  [25,'Amphibious Trooper','flooded','rifle'],[26,'Naval Sniper','flooded','sniper'],
  [27,'Submarine Engineer','flooded','engineer'],[28,'Aqua Grenadier','flooded','grenade'],
  [29,'Sea Raider','flooded','raider'],[30,'Admiral Defender','flooded','commander'],

  [31,'Fog Recon','foggy','recon'],[32,'Mist Sniper','foggy','sniper'],
  [33,'Smoke Trooper','foggy','rifle'],[34,'Radar Specialist','foggy','radar'],
  [35,'Chemical Warfare Soldier','foggy','chem'],[36,'Ghost Gunner','foggy','phantom'],
  [37,'Fog Bomber','foggy','bomb'],[38,'Tactical Spotter','foggy','spotter'],
  [39,'Specter Ranger','foggy','phantom'],[40,'Phantom Commander','foggy','commander'],

  [41,'Hazmat Trooper','radioactive','hazmat'],[42,'Radiation Gunner','radioactive','mg'],
  [43,'Plasma Soldier','radioactive','plasma'],[44,'Nuclear Engineer','radioactive','engineer'],
  [45,'Mutant Hunter','radioactive','hunter'],[46,'Atomic Sniper','radioactive','sniper'],
  [47,'Reactor Guard','radioactive','shield'],[48,'Biohazard Specialist','radioactive','chem'],
  [49,'Radiation Destroyer','radioactive','heavy'],[50,'Planetary Guardian','radioactive','commander'],
];

// Starting cards (unlockLevel 'start') — the two units whose old traced SVGs
// (Fire-Lance_Gunner.svg / P.E Generator.svg) are converted to sheet format.
const START_PLAYERS = [
  ['start','Fire-Lancer','daytime','firelance'],
  ['start','Plasma Energy Generator','daytime','generator'],
];

// Enemy units — Levels 2-50 (enemy-only, not obtainable)
const ENEMIES = [
  [2,'Alien Grunt','daytime','grunt'],     [3,'Void Stalker','daytime','stalker'],
  [4,'Brute Invader','daytime','brute'],   [5,'Plasma Launcher','daytime','launcher'],
  [6,'Life Drainer','daytime','drainer'],  [7,'Barrier Drone','daytime','drone'],
  [8,'Swarm Shooter','daytime','gunner'],  [9,'Acid Bomber','daytime','bomber'],
  [10,'Siege Behemoth','daytime','behemoth'],

  [11,'Dusk Reaper','nighttime','reaper'], [12,'Darkmatter Sniper','nighttime','marksman'],
  [13,'Cloak Phantom','nighttime','phantom'],[14,'Eclipse Gunner','nighttime','gunner'],
  [15,'Void Assassin','nighttime','assassin'],[16,'Silent Predator','nighttime','predator'],
  [17,'Spectral Warrior','nighttime','phantom'],[18,'Seeker Drone','nighttime','drone'],
  [19,'Moonfang Hunter','nighttime','hunter'],[20,'Overlord of Darkness','nighttime','overlord'],

  [21,'Abyssal Grunt','flooded','grunt'],  [22,'Deepsea Stalker','flooded','stalker'],
  [23,'Tidal Tormentor','flooded','brute'],[24,'Hydro-Spitter','flooded','spitter'],
  [25,'Amphibious Ravager','flooded','predator'],[26,'Leviathan Marksman','flooded','marksman'],
  [27,'Abyssal Mechanic','flooded','mechanic'],[28,'Toxic Tide Bomber','flooded','bomber'],
  [29,'Reef Raider','flooded','raider'],   [30,'Abyssal Warlord','flooded','overlord'],

  [31,'Mist Seeker','foggy','seeker'],     [32,'Phantom Marksman','foggy','marksman'],
  [33,'Smog Invader','foggy','grunt'],     [34,'Signal Jammer','foggy','jammer'],
  [35,'Toxic Mutator','foggy','mutator'],  [36,'Wraith Gunner','foggy','phantom'],
  [37,'Mist Bomber','foggy','bomber'],     [38,'Alien Pathfinder','foggy','pathfinder'],
  [39,'Specter Hunter','foggy','hunter'],  [40,'Ethereal Overlord','foggy','overlord'],

  [41,'Radwalker','radioactive','walker'], [42,'Gamma Gunner','radioactive','gunner'],
  [43,'Plasma Devourer','radioactive','devourer'],[44,'Reactor Parasite','radioactive','parasite'],
  [45,'Mutant Stalker','radioactive','stalker'],[46,'Quantum Marksman','radioactive','marksman'],
  [47,'Core Guardian','radioactive','guardian'],[48,'Biohazard Abomination','radioactive','abomination'],
  [49,'Radiation Colossus','radioactive','behemoth'],[50,'Galactic Devastator','radioactive','devastator'],
];

// Existing reference enemies (vex_drone.svg / vex_flag_bearer.svg) regenerated
// in the unified sheet format so every enemy lives in one folder.
const START_ENEMIES = [
  [1,'Vex Drone','daytime','grunt'],
  [1,'Vex Flag Bearer','daytime','flagbearer'],
];

/* ── Small SVG helpers ──────────────────────────────────────── */
const r2 = n => Math.round(n * 100) / 100;
function rect(x,y,w,h,fill,extra='') { return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}" ${extra}/>`; }
function rrect(x,y,w,h,rx,fill,extra='') { return `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="${r2(rx)}" fill="${fill}" ${extra}/>`; }
function circ(cx,cy,r,fill,extra='') { return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${fill}" ${extra}/>`; }
function poly(pts,fill,extra='') { return `<polygon points="${pts.map(p=>p.map(r2).join(',')).join(' ')}" fill="${fill}" ${extra}/>`; }
function line(x1,y1,x2,y2,stroke,w,extra='') { return `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${w}" ${extra}/>`; }
function slug(name) { return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,''); }
function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

/* ── Pose computation ───────────────────────────────────────── */
function poseFor(state, i, frames) {
  const t = frames > 1 ? i / (frames - 1) : 0;
  const p = { bob:0, legPhase:0, armRecoil:0, muzzle:false, lean:0, alpha:1, flash:false, collapse:0, swing:0 };
  switch (state) {
    case 'IDLE':
      p.bob = Math.sin(t * Math.PI * 2) * 1.2;
      p.armRecoil = 0.05;
      break;
    case 'WALK':
      p.legPhase = Math.sin(t * Math.PI * 2);
      p.bob = Math.abs(Math.cos(t * Math.PI * 2)) * -1.6;
      p.armRecoil = 0.1;
      break;
    case 'ATTACK': {
      // wind-up → fire → recoil settle
      const fire = (i === 3 || i === 4);
      p.armRecoil = fire ? 1 : (i < 3 ? t * 0.6 : 0.4 * (1 - t));
      p.muzzle = fire;
      p.lean = fire ? -2 : 0;
      break;
    }
    case 'TAKE DAMAGE':
      p.lean = 6 + t * 4;
      p.flash = (i % 2 === 0);
      p.armRecoil = 0.2;
      break;
    case 'DEATH':
      p.collapse = t;
      p.lean = t * 78;
      p.alpha = 1 - t * 0.55;
      break;
  }
  return p;
}

/* ── Player soldier figure ────────────────────────────────────
   Drawn in a 64x78 cell; ground at y=70, centred x=32.          */
function soldier(pal, arch, pose) {
  const g = [];
  const cx = 32, ground = 70;

  // ── Support device: Plasma Energy Generator (not humanoid) ──
  if (arch === 'generator') {
    const pulse = 0.5 + 0.5 * Math.sin(pose.legPhase * Math.PI + pose.bob);
    const alpha = pose.alpha;
    g.push(`<g opacity="${r2(alpha)}" transform="rotate(${r2(pose.lean*0.4)} ${cx} ${ground}) translate(0 ${r2(pose.collapse*8)})">`);
    // pylon base
    g.push(poly([[cx-12,ground],[cx-8,ground-26],[cx+8,ground-26],[cx+12,ground]], pal.uniformDark));
    g.push(rect(cx-9, ground-30, 18, 6, pal.uniform));
    // housing + orb
    g.push(rrect(cx-7, ground-46, 14, 18, 3, pal.metal));
    g.push(circ(cx, ground-50, 9, pal.accent, `opacity="${r2(0.55+0.4*pulse)}"`));
    g.push(circ(cx, ground-50, 5, pal.glow, `opacity="${r2(0.7+0.3*pulse)}"`));
    // charge ring (attack = production flash)
    if (pose.muzzle) {
      g.push(circ(cx, ground-50, 13, 'none', `stroke="${pal.glow}" stroke-width="2" opacity="0.8"`));
      g.push(circ(cx, ground-50, 17, 'none', `stroke="${pal.accent}" stroke-width="1.2" opacity="0.5"`));
    }
    // side vents
    g.push(rect(cx-11, ground-42, 3, 8, pal.uniformDark));
    g.push(rect(cx+8,  ground-42, 3, 8, pal.uniformDark));
    if (pose.flash) g.push(rrect(cx-13, ground-58, 26, 58, 4, '#ef4444', 'opacity="0.35"'));
    g.push('</g>');
    return g.join('');
  }

  const ghost = ['stealth','phantom','assassin'].includes(arch);
  const alpha = pose.alpha * (ghost ? 0.82 : 1);
  const bodyY = ground - 40 + pose.bob;      // torso top
  const hipY  = ground - 22 + pose.bob;

  g.push(`<g opacity="${r2(alpha)}" transform="rotate(${r2(pose.lean)} ${cx} ${ground}) translate(0 ${r2(pose.collapse*10)})">`);

  // ── Legs ──
  const lp = pose.legPhase * 6;
  g.push(rect(cx-9+lp*0.4, hipY, 7, 22 - Math.abs(lp)*0.3, pal.uniformDark));
  g.push(rect(cx+2-lp*0.4, hipY, 7, 22 - Math.abs(lp)*0.3, pal.uniformDark));
  // boots
  g.push(rect(cx-10+lp*0.4, ground-4, 9, 4, pal.helmet));
  g.push(rect(cx+1-lp*0.4, ground-4, 9, 4, pal.helmet));

  // ── Torso ──
  const bulk = ['tank','heavy','commander','hazmat'].includes(arch) ? 3 : 0;
  g.push(rrect(cx-11-bulk, bodyY, 22+bulk*2, 26, 4, pal.uniform));
  // chest strap / emblem
  g.push(rect(cx-11-bulk, bodyY+8, 22+bulk*2, 3, pal.uniformDark));

  // ── Backpack / gear by archetype ──
  if (['diver','engineer','chem','hazmat','torpedo','recon','radar','spotter'].includes(arch)) {
    g.push(rrect(cx-16-bulk, bodyY+3, 6, 16, 2, pal.metal));
  }
  if (['chem','hazmat'].includes(arch)) {
    g.push(circ(cx-13-bulk, bodyY+7, 3, pal.glow));
    g.push(circ(cx-13-bulk, bodyY+15, 3, pal.accent));
  }

  // ── Head + helmet ──
  const headY = bodyY - 12;
  if (['chem','hazmat'].includes(arch)) {
    // gas mask
    g.push(circ(cx, headY+5, 8, pal.helmet));
    g.push(circ(cx-3, headY+4, 2.4, pal.glow));
    g.push(circ(cx+3, headY+4, 2.4, pal.glow));
    g.push(rrect(cx-3, headY+8, 6, 4, 2, pal.metal));
  } else {
    g.push(rrect(cx-6, headY+3, 12, 10, 3, pal.skin));       // face
    g.push(rrect(cx-8, headY-1, 16, 7, 3, pal.helmet));       // helmet
    if (['commander','tank'].includes(arch)) g.push(rect(cx-8, headY-3, 16, 3, pal.accent)); // beret band
    if (['nv','recon','radar','spotter','hunter'].includes(arch)) {
      g.push(rect(cx-7, headY+3, 14, 3, pal.metal));          // visor
      g.push(circ(cx+4, headY+4, 1.6, pal.glow));
    }
    if (ghost) { // hood
      g.push(poly([[cx-9,headY+13],[cx-9,headY-1],[cx,headY-6],[cx+9,headY-1],[cx+9,headY+13]], pal.uniformDark, 'opacity="0.9"'));
      g.push(circ(cx-3, headY+5, 1.6, pal.glow)); g.push(circ(cx+3, headY+5, 1.6, pal.glow));
    }
  }

  // ── Arms + weapon ──
  const recoil = pose.armRecoil * 5;
  const wx = cx + 8 - recoil;   // weapon origin (facing right)
  const wy = bodyY + 10;
  drawWeapon(g, pal, arch, wx, wy, recoil, pose.muzzle);

  // front arm
  g.push(rect(cx+2, wy-2, 10 - recoil*0.4, 5, pal.uniform));

  // ── Shield (front) ──
  if (arch === 'shield') {
    g.push(rrect(cx+12, bodyY-2, 7, 34, 3, pal.metal));
    g.push(rect(cx+14, bodyY+4, 3, 22, pal.accent));
  }

  // ── Medic cross ──
  if (arch === 'medic') {
    g.push(rect(cx-3, bodyY+9, 6, 2, '#ffffff'));
    g.push(rect(cx-1, bodyY+7, 2, 6, '#ffffff'));
  }

  // hurt flash
  if (pose.flash) g.push(rrect(cx-13-bulk, headY-2, 26+bulk*2, ground-headY, 4, '#ef4444', 'opacity="0.35"'));

  g.push('</g>');
  return g.join('');
}

function drawWeapon(g, pal, arch, wx, wy, recoil, muzzle) {
  const flash = muzzle ? circ(wx+16, wy+1, 4, pal.glow, 'opacity="0.95"') + circ(wx+16, wy+1, 2, '#ffffff') : '';
  switch (arch) {
    case 'firelance':
      g.push(rect(wx-4, wy-1, 28, 3, '#7c3d0a'));          // lance shaft
      g.push(poly([[wx+24,wy-3],[wx+32,wy+0.5],[wx+24,wy+3]], '#ff6b00')); // flame tip
      if (muzzle) { g.push(circ(wx+32, wy+0.5, 5, '#ff6b00', 'opacity="0.9"')); g.push(circ(wx+32, wy+0.5, 2.4, '#fde68a')); }
      break;
    case 'sniper':
      g.push(rect(wx-2, wy-1, 26, 3, pal.weapon));
      g.push(rect(wx+6, wy-5, 7, 3, pal.metal));       // scope
      g.push(rect(wx-6, wy, 6, 5, pal.uniformDark));    // stock
      if (muzzle) g.push(flash);
      break;
    case 'mg': case 'heavy':
      g.push(rect(wx-2, wy-1, 20, 5, pal.weapon));
      g.push(rect(wx+2, wy+3, 7, 7, pal.metal));        // mag
      g.push(rect(wx-7, wy, 7, 4, pal.uniformDark));
      if (muzzle) g.push(flash);
      break;
    case 'rocket':
      g.push(rrect(wx-4, wy-6, 26, 7, 3, pal.weapon));  // tube on shoulder
      g.push(poly([[wx+22,wy-6],[wx+30,wy-2.5],[wx+22,wy+1]], pal.accent));
      if (muzzle) g.push(circ(wx+30, wy-2.5, 5, pal.glow, 'opacity="0.9"'));
      break;
    case 'grenade':
      g.push(rect(wx-2, wy-1, 14, 3, pal.weapon));
      g.push(circ(wx+12, wy+4, 4, pal.accent));         // grenade
      if (muzzle) g.push(flash);
      break;
    case 'bomb':
      g.push(circ(wx+6, wy+2, 9, '#1f2937'));           // big bomb
      g.push(circ(wx+3, wy-1, 3.5, '#4b5563', 'opacity="0.7"'));
      g.push(line(wx+6, wy-7, wx+10, wy-13, '#78350f', 1.5));
      g.push(circ(wx+10, wy-14, 2.6, '#fbbf24'));
      break;
    case 'plasma':
      g.push(rect(wx-2, wy-1, 18, 4, pal.weapon));
      g.push(circ(wx+16, wy+1, 4, pal.glow));
      if (muzzle) g.push(circ(wx+18, wy+1, 6, pal.accent, 'opacity="0.85"'));
      break;
    case 'torpedo':
      g.push(rrect(wx-4, wy-5, 24, 6, 3, pal.metal));
      g.push(poly([[wx+20,wy-5],[wx+27,wy-2],[wx+20,wy+1]], pal.accent));
      break;
    case 'shield':
      g.push(rect(wx-2, wy, 10, 3, pal.weapon));        // sidearm
      break;
    case 'medic':
      break;                                            // unarmed
    default: // rifle, stealth, phantom, assassin, recon, radar, spotter, hunter, commander, diver, engineer, chem, hazmat, raider, nv, tank
      g.push(rect(wx-2, wy-1, 20, 3, pal.weapon));
      g.push(rect(wx-6, wy, 6, 5, pal.uniformDark));
      if (['assassin','stealth','phantom'].includes(arch)) g.push(rect(wx+14, wy-3, 6, 2, pal.metal)); // suppressor/blade
      if (muzzle) g.push(flash);
  }
}

/* ── Enemy alien figure ─────────────────────────────────────── */
function alien(pal, arch, pose) {
  const g = [];
  const cx = 32, ground = 70;
  const hover = ['drone','seeker','jammer','parasite','pathfinder'].includes(arch);
  const big   = ['brute','behemoth','colossus','devastator','overlord','warlord','abomination','guardian','devourer'].includes(arch);
  const ghost = ['phantom','reaper','wraith','spectral','ethereal','assassin','predator','stalker','hunter','marksman'].includes(arch);
  const alpha = pose.alpha * (ghost ? 0.85 : 1);
  const scale = big ? 1.22 : (hover ? 0.9 : 1);
  const bob = pose.bob + (hover ? Math.sin(pose.legPhase*Math.PI)*3 : 0);
  const bodyY = ground - (big ? 46 : 38) + bob;

  g.push(`<g opacity="${r2(alpha)}" transform="rotate(${r2(pose.lean)} ${cx} ${ground}) translate(0 ${r2(pose.collapse*10)}) scale(${scale}) translate(${r2(cx*(1-scale))} ${r2(ground*(1-scale))})">`);

  // hover thruster / shadow
  if (hover) {
    g.push(`<ellipse cx="${cx}" cy="${ground-2}" rx="12" ry="3" fill="${pal.core}" opacity="0.35"/>`);
    g.push(circ(cx, bodyY+34, 6, pal.eye, 'opacity="0.5"'));
  } else {
    // legs / tentacles
    const lp = pose.legPhase * 5;
    if (['drainer','devourer','parasite','spitter','mutator','walker'].includes(arch)) {
      for (let k=-1;k<=1;k++) g.push(`<path d="M${cx+k*7} ${bodyY+22} q ${k*4+lp} 12 ${k*8} 20" stroke="${pal.accent}" stroke-width="4" fill="none" stroke-linecap="round"/>`);
    } else {
      g.push(rect(cx-9+lp*0.4, bodyY+20, 7, 20, pal.dark));
      g.push(rect(cx+2-lp*0.4, bodyY+20, 7, 20, pal.dark));
    }
  }

  // ── Body ──
  g.push(rrect(cx-13, bodyY, 26, 30, 9, pal.body));
  g.push(rrect(cx-13, bodyY, 26, 12, 9, pal.accent, 'opacity="0.5"'));
  // core
  g.push(circ(cx, bodyY+16, 5, pal.core));
  g.push(circ(cx, bodyY+16, 2.4, pal.eye, 'opacity="0.9"'));

  // ── Head / eyes ──
  const headY = bodyY - 8;
  g.push(rrect(cx-9, headY, 18, 13, 6, pal.body));
  if (['grunt','raider','invader','smog'].includes(arch) || arch === 'grunt') {
    g.push(circ(cx, headY+6, 4, pal.eye));                       // cyclops
  } else {
    g.push(circ(cx-4, headY+6, 2.4, pal.eye));
    g.push(circ(cx+4, headY+6, 2.4, pal.eye));
  }
  // horns / crest
  if (big || ['reaper','predator','overlord','devastator','behemoth','colossus'].includes(arch)) {
    g.push(poly([[cx-9,headY+2],[cx-14,headY-8],[cx-5,headY-1]], pal.dark));
    g.push(poly([[cx+9,headY+2],[cx+14,headY-8],[cx+5,headY-1]], pal.dark));
  }
  if (['drone','seeker','jammer','pathfinder'].includes(arch)) {
    g.push(line(cx, headY, cx, headY-9, pal.accent, 1.5));
    g.push(circ(cx, headY-10, 2.4, pal.eye));                    // antenna
  }

  // ── Arms / weapon ──
  const recoil = pose.armRecoil * 5;
  const ax = cx + 10 - recoil, ay = bodyY + 12;
  if (['launcher','gunner','marksman','spitter','shooter'].includes(arch)) {
    g.push(rect(cx-14, ay-2, 8, 6, pal.dark));                   // back arm
    g.push(rrect(ax-2, ay-2, 20, 6, 2, pal.dark));               // arm cannon
    g.push(circ(ax+18, ay+1, 3, pal.eye));
    if (pose.muzzle) { g.push(circ(ax+22, ay+1, 5, pal.eye, 'opacity="0.9"')); g.push(circ(ax+22, ay+1, 2.4, '#fff')); }
  } else if (['stalker','predator','reaper','assassin','hunter','devourer','drainer'].includes(arch)) {
    // claws / scythe
    g.push(`<path d="M${cx+10} ${ay-2} l 14 -6 M${cx+10} ${ay+1} l 15 0 M${cx+10} ${ay+4} l 14 6" stroke="${pal.accent}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);
    if (arch === 'reaper') g.push(`<path d="M${cx+8} ${ay-6} q 16 -6 14 10" stroke="${pal.eye}" stroke-width="2.4" fill="none"/>`);
  } else if (['bomber'].includes(arch)) {
    g.push(circ(ax+6, ay+2, 8, pal.core));                       // acid orb
    g.push(circ(ax+3, ay-1, 3, pal.eye, 'opacity="0.7"'));
    if (pose.muzzle) g.push(circ(ax+6, ay+2, 11, pal.eye, 'opacity="0.5"'));
  } else if (['drone','jammer','seeker','parasite','mechanic','engineer','pathfinder'].includes(arch)) {
    g.push(rect(cx-16, ay-1, 6, 5, pal.dark));
    g.push(rect(cx+10, ay-1, 6, 5, pal.dark));
    if (arch === 'jammer' || arch === 'seeker') g.push(circ(cx, bodyY+16, 10, pal.eye, 'opacity="0.18"'));
  } else if (['guardian','barrier'].includes(arch) || arch === 'guardian') {
    g.push(rrect(cx+12, bodyY-2, 7, 32, 3, pal.accent));         // barrier plate
  } else if (arch === 'flagbearer') {
    // invasion flag
    g.push(line(cx+11, ay+2, cx+11, headY-16, '#d97706', 2));
    g.push(poly([[cx+11,headY-16],[cx+30,headY-12],[cx+11,headY-7]], '#ef4444'));
    g.push(circ(cx+19, headY-11.5, 2.2, '#ffffff'));
    g.push(rect(cx-15, ay, 6, 6, pal.dark));
  } else {
    g.push(rect(cx-15, ay, 6, 6, pal.dark));
    g.push(rect(cx+9, ay, 6, 6, pal.dark));
  }

  if (pose.flash) g.push(rrect(cx-14, headY-2, 28, ground-headY, 8, '#ef4444', 'opacity="0.35"'));

  g.push('</g>');
  return g.join('');
}

/* ── Sheet assembly ─────────────────────────────────────────── */
function buildSheet(opts) {
  const { title, code, subtitle, pal, kind, arch, bg } = opts;
  const drawFn = kind === 'player' ? soldier : alien;
  const out = [];

  out.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}">`);
  out.push(`  <!-- ${esc(title)} (${code}) — Sprite Sheet · ${ROWS.map(r=>r.key).join(' / ')} -->`);
  out.push(`  <defs><style>.lbl{font:bold 8px monospace;fill:#94a3b8}.hdr{font:bold 12px monospace;fill:${pal.title}}.sub{font:bold 8px monospace;fill:#64748b}</style></defs>`);
  out.push(`  <rect width="${WIDTH}" height="${HEIGHT}" fill="${bg}"/>`);
  out.push(`  <rect width="${WIDTH}" height="${HEADER_H-14}" fill="#0f172a" opacity="0.85"/>`);
  out.push(`  <text x="10" y="18" class="hdr">${esc(title.toUpperCase())}</text>`);
  out.push(`  <text x="10" y="31" class="sub">${esc(code)} · ${esc(subtitle)}</text>`);

  ROWS.forEach((row, ri) => {
    const y0 = HEADER_H + ri * CELL_H;
    // row band
    out.push(`  <rect x="${GUTTER-8}" y="${y0}" width="${MAX_COLS*CELL_W+4}" height="${CELL_H-6}" fill="#ffffff" opacity="0.02"/>`);
    out.push(`  <text x="8" y="${y0 + CELL_H/2}" class="lbl">${esc(row.label)}</text>`);
    for (let i = 0; i < row.frames; i++) {
      const x0 = GUTTER + i * CELL_W;
      // cell frame
      out.push(`  <rect x="${x0}" y="${y0}" width="${CELL_W-4}" height="${CELL_H-6}" fill="none" stroke="#334155" stroke-width="0.5" opacity="0.5"/>`);
      const pose = poseFor(row.key, i, row.frames);
      out.push(`  <g transform="translate(${x0} ${y0})">${drawFn(pal, arch, pose)}</g>`);
    }
  });

  out.push(`</svg>`);
  return out.join('\n');
}

/* ── Main ───────────────────────────────────────────────────── */
function main() {
  fs.mkdirSync(PLAYER_DIR, { recursive: true });
  fs.mkdirSync(ENEMY_DIR,  { recursive: true });

  const manifest = { generated: new Date().toISOString(), players: [], enemies: [] };

  const codeFor = (level, kind) =>
    (level === 'start' ? 'START' : 'L' + String(level).padStart(2, '0')) + ' / ' + kind;

  const allPlayers = [...START_PLAYERS, ...PLAYERS];
  const allEnemies = [...START_ENEMIES, ...ENEMIES];

  for (const [level, name, env, arch] of allPlayers) {
    const pal  = PLAYER_PAL[env];
    const file = `${slug(name)}.svg`;
    const svg  = buildSheet({
      title: name, code: codeFor(level, 'PLAYER'),
      subtitle: `${env.toUpperCase()} · ${arch.toUpperCase()}`,
      pal, kind:'player', arch, bg: pal.bg,
    });
    fs.writeFileSync(path.join(PLAYER_DIR, file), svg, 'utf8');
    manifest.players.push({ level, name, env, arch, path: `/assets/sprites/characters/player/${file}` });
  }

  for (const [level, name, env, arch] of allEnemies) {
    const pal  = ENEMY_PAL[env];
    const file = `${slug(name)}.svg`;
    const svg  = buildSheet({
      title: name, code: codeFor(level, 'ENEMY'),
      subtitle: `${env.toUpperCase()} · ${arch.toUpperCase()}`,
      pal, kind:'enemy', arch, bg: pal.bg,
    });
    fs.writeFileSync(path.join(ENEMY_DIR, file), svg, 'utf8');
    manifest.enemies.push({ level, name, env, arch, path: `/assets/sprites/characters/enemy/${file}` });
  }

  fs.writeFileSync(
    path.join(ROOT, 'public', 'assets', 'sprites', 'sprite-manifest.json'),
    JSON.stringify(manifest, null, 2), 'utf8'
  );

  console.log(`✔ Generated ${manifest.players.length} player + ${manifest.enemies.length} enemy sprite sheets.`);
  console.log(`  → ${PLAYER_DIR}`);
  console.log(`  → ${ENEMY_DIR}`);
}

main();
