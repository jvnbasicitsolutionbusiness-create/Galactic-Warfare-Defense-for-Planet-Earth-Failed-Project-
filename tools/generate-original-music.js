'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SAMPLE_RATE = 22050;
const MUSIC_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'music');
const SFX_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'sfx');
const CHAR_PLAYER_MUSIC_DIR = path.join(MUSIC_DIR, 'characters', 'player');
const CHAR_ENEMY_MUSIC_DIR = path.join(MUSIC_DIR, 'characters', 'enemy');

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

// ─── 8 Rich Background Music Tracks (Upgraded Cinematic Editions) ─────────────
const TRACKS = [
  {
    file: 'loading-screen.wav',
    bpm: 78,
    bars: 12,
    tonic: 45, // A2
    scale: MINOR,
    progression: [0, 5, 3, 6],
    mood: 'space_ambience',
    seed: 314,
    description: 'Atmospheric space scanning theme with pulsing holographic arpeggios',
  },
  {
    file: 'authentication.wav',
    bpm: 86,
    bars: 16,
    tonic: 43, // G2
    scale: MINOR,
    progression: [0, 6, 3, 4],
    mood: 'terminal_command',
    seed: 521,
    description: 'High-tech military uplink console with steady cybernetic pulse',
  },
  {
    file: 'main-menu.wav',
    bpm: 104,
    bars: 16,
    tonic: 50, // D3
    scale: DORIAN,
    progression: [0, 3, 5, 4],
    mood: 'heroic_anthem',
    seed: 789,
    description: 'Grand heroic galactic defense anthem with triumphant brass leads and marching cadences',
  },
  {
    file: 'battle-daytime.wav',
    bpm: 114,
    bars: 16,
    tonic: 53, // F3
    scale: MAJOR,
    progression: [0, 4, 5, 3],
    mood: 'daytime_march',
    seed: 1011,
    description: 'Sunlit battlefield march with crisp military snare rolls and resolute brass harmonies',
  },
  {
    file: 'battle-nighttime.wav',
    bpm: 92,
    bars: 16,
    tonic: 45, // A2
    scale: MINOR,
    progression: [0, 5, 3, 6],
    mood: 'night_stealth',
    seed: 1273,
    description: 'Nocturnal spec-ops surveillance groove with echoing sonar pings and tense bassline',
  },
  {
    file: 'battle-foggy.wav',
    bpm: 82,
    bars: 16,
    tonic: 50, // D3
    scale: DORIAN,
    progression: [0, 3, 6, 4],
    mood: 'flooded_basin',
    seed: 1492,
    description: 'Murky waterlogged basin with fluid resonant filter sweeps and sunken sub-frequencies',
  },
  {
    file: 'battle-storm.wav',
    bpm: 124,
    bars: 16,
    tonic: 48, // C3
    scale: MINOR,
    progression: [0, 6, 3, 4],
    mood: 'tempest_storm',
    seed: 1735,
    description: 'Driving tempest battle with thunderous kick impacts and electrified synth stabs',
  },
  {
    file: 'battle-radioactive.wav',
    bpm: 110,
    bars: 16,
    tonic: 42, // F#2
    scale: PHRYGIAN,
    progression: [0, 1, 5, 4],
    mood: 'radioactive_hazard',
    seed: 1984,
    description: 'Futuristic contaminated zone with sizzling Geiger transients and heavy toxic bass',
  },
];

// ─── Button & UI Cues ─────────────────────────────────────────────────────────
const BUTTON_IDS = [
  'btnAdventure', 'btnSurvival', 'btnMiniGames', 'btnPuzzle', 'btnProfiles', 'btnExtras',
  'btnSettings', 'btnCredits', 'btnQuit', 'btnNotify', 'btnStartGame', 'btnAdvClose',
  'tabMilitary', 'tabAliens', 'btnProfilesClose', 'btnLockedClose', 'btnEndless',
  'btnSurvivalClose', 'btnMGClose', 'btnPuzzleClose', 'btnExtrasClose', 'btnSettingsClose',
  'btnCreditsClose', 'btnQuitConfirm', 'btnQuitCancel', 'btnNotifyClose', 'btnCSClose',
  'tabLogin', 'tabRegister', 'loginBtn', 'regBtn', 'briefingNext',
];
const UI_CUES = [
  ...BUTTON_IDS.map(id => `ui-${id.toLowerCase()}`),
  'ui-unassigned',
  ...['daytime', 'nighttime', 'foggy', 'rainy_stormy', 'radioactive'].map(id => `ui-phase-${id}`),
  ...['patchnotes', 'gameinfo', 'database', 'credits'].map(id => `ui-extras-${id}`),
  ...Array.from({ length: 50 }, (_, index) => `ui-level-${index + 1}`),
];

const GAME_CUES = [
  'card-select', 'card-deselect', 'card-place', 'coin-collect', 'plasma-collect', 'battle-deploy', 'battle-menu',
  'pause-resume', 'pause-restart', 'pause-quit', 'victory-claim', 'victory-next', 'victory-replay',
  'victory-menu', 'defeat-retry', 'defeat-menu', 'alien-death', 'defender-death',
  'fire-lance-windup', 'military-melee', 'alien-step', 'alien-melee', 'alien-bullet', 'alien-laser', 'alien-fire', 'alien-plasma',
  'fire-lance-shot', 'fire-impact',
  ...[
    'fire_lance', 'hand_cannon', 'musket', 'arquebus', 'rifle', 'sniper_rifle', 'mortar',
    'service_pistol', 'machine_gun', 'grenade_launcher', 'rocket_launcher', 'plasma_rifle',
    'laser_weapon', 'plasma_cannon',
  ].map(id => `weapon-${id.replace(/_/g, '-')}`),
];

// ─── Player Military Cards Roster ─────────────────────────────────────────────
const PLAYER_ROSTER = [
  'plasma_energy_generator', 'fire_lancer', 'bomber', 'hand_cannon_soldier', 'arquebus_soldier',
  'pikeman', 'drummer_boy', 'field_cannon', 'supply_officer', 'sharpshooter',
  'field_medic_early', 'machine_gunner', 'night_rifleman', 'scout', 'flare_operator',
  'trench_soldier', 'searchlight_operator', 'radio_operator', 'armored_soldier', 'night_medic',
  'sniper', 'recon_unit', 'gas_mask_soldier', 'mortar_team', 'field_mechanic',
  'heavy_rifleman', 'forward_observer', 'modern_rifleman', 'shield_operator', 'combat_medic',
  'drone_operator', 'rocket_specialist', 'mobile_generator', 'plasma_tech_engineer', 'grenadier',
  'hazmat_trooper', 'radiation_specialist', 'plasma_soldier', 'energy_shield_generator', 'combat_drone',
  'autonomous_robot', 'plasma_mech', 'laser_specialist', 'energy_specialist', 'heavy_plasma_trooper',
  'support_specialist', 'experimental_soldier', 'advanced_combatant', 'repair_technician', 'ammo_specialist',
  'plasma_shield_unit', 'plasma_cannon_warrior',
  // Aliases / alternate names from SVGs:
  'admiral_defender', 'amphibious_trooper', 'aqua_grenadier', 'atomic_sniper', 'biohazard_specialist',
  'bombman', 'chemical_warfare_soldier', 'depth_diver', 'fog_bomber', 'fog_recon',
  'ghost_gunner', 'heavy_gunner', 'hydro_gunner', 'marine_rifleman', 'mist_sniper',
  'mutant_hunter', 'naval_sniper', 'night_hunter', 'night_stalker', 'night_vision_gunner',
  'nuclear_engineer', 'phantom_commander', 'phantom_trooper', 'planetary_guardian', 'radar_specialist',
  'radiation_destroyer', 'radiation_gunner', 'reactor_guard', 'recon_specialist', 'rifleman',
  'rocket_trooper', 'sea_raider', 'shadow_commander', 'shadow_sniper', 'shield_soldier',
  'silent_ranger', 'smoke_trooper', 'specter_ranger', 'stealth_operative', 'submarine_engineer',
  'tactical_assassin', 'tactical_spotter', 'tank_commander', 'torpedo_soldier',
  'fire_lance_gunner', 'pe_generator',
];

// ─── Alien Attackers Roster ───────────────────────────────────────────────────
const ENEMY_ROSTER = [
  'vex_drone', 'vex_flag_bearer', 'alien_grunt', 'void_stalker', 'brute_invader',
  'plasma_launcher', 'life_drainer', 'barrier_drone', 'swarm_shooter', 'acid_bomber',
  'siege_behemoth', 'dusk_reaper', 'darkmatter_sniper', 'cloak_phantom', 'eclipse_gunner',
  'void_assassin', 'silent_predator', 'spectral_warrior', 'seeker_drone', 'moonfang_hunter',
  'overlord_of_darkness', 'abyssal_grunt', 'deepsea_stalker', 'tidal_tormentor', 'hydro_spitter',
  'amphibious_ravager', 'leviathan_marksman', 'abyssal_mechanic', 'toxic_tide_bomber', 'reef_raider',
  'abyssal_warlord', 'mist_seeker', 'phantom_marksman', 'smog_invader', 'signal_jammer',
  'toxic_mutator', 'wraith_gunner', 'mist_bomber', 'alien_pathfinder', 'specter_hunter',
  'ethereal_overlord', 'radwalker', 'gamma_gunner', 'plasma_devourer', 'reactor_parasite',
  'mutant_stalker', 'quantum_marksman', 'core_guardian', 'biohazard_abomination', 'radiation_colossus',
  'galactic_devastator',
  // Extra categories & bosses:
  'vex_runner', 'vex_bruiser', 'vex_leaper', 'vex_sniper', 'vex_warden', 'vex_stalker',
  'vex_healer', 'vex_colossus', 'vex_elite', 'vex_overlord', 'vex_agile', 'vex_raider',
  'vex_tiny_ship', 'vex_hover_bike',
];

function midiFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

function scaleNote(track, degree, octave) {
  const wrapped = ((degree % 7) + 7) % 7;
  const scaleOctave = Math.floor(degree / 7);
  return track.tonic + track.scale[wrapped] + (scaleOctave + octave) * 12;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

// ─── Note Renderer ────────────────────────────────────────────────────────────
function addNote(track, channel, event) {
  const startSample = Math.max(0, Math.floor(event.start * SAMPLE_RATE));
  const endSample = Math.min(channel.left.length, Math.floor((event.start + event.duration) * SAMPLE_RATE));
  const frequency = midiFrequency(event.note || 60);
  const pan = Math.max(-1, Math.min(1, event.pan || 0));
  const leftGain = Math.sqrt((1 - pan) * 0.5) * event.gain;
  const rightGain = Math.sqrt((1 + pan) * 0.5) * event.gain;
  const random = createRandom(track.seed + startSample + (event.note || 0));
  const attack = event.kind === 'pad' ? 0.35 : event.kind === 'lead' ? 0.012 : 0.005;

  for (let index = startSample; index < endSample; index++) {
    const time = (index - startSample) / SAMPLE_RATE;
    const progress = time / event.duration;
    let envelope;
    let sample;

    if (event.kind === 'pad') {
      envelope = Math.min(1, time / attack) * Math.min(1, Math.max(0.04, (event.duration - time) / 0.4));
      // Stereo detuned lush pad
      sample = Math.sin(2 * Math.PI * frequency * time) * 0.5
        + Math.sin(2 * Math.PI * frequency * 1.004 * time) * 0.3
        + Math.sin(2 * Math.PI * frequency * 0.996 * time) * 0.2
        + Math.sin(2 * Math.PI * frequency * 2 * time) * 0.1;
    } else if (event.kind === 'bass') {
      envelope = Math.min(1, time / attack) * Math.exp(-time * 2.2);
      // Sub punch + saturated second harmonic
      sample = Math.sin(2 * Math.PI * frequency * time) * 0.72
        + Math.sin(2 * Math.PI * frequency * 2 * time) * 0.22
        + Math.sin(2 * Math.PI * (frequency * 0.5) * time) * 0.25;
    } else if (event.kind === 'kick') {
      const sweptFrequency = 45 + 130 * Math.exp(-time * 24);
      envelope = Math.exp(-time * 14);
      sample = Math.sin(2 * Math.PI * sweptFrequency * time) * envelope;
      envelope = 1;
    } else if (event.kind === 'snare') {
      envelope = Math.exp(-time * 16);
      const noise = random() * 2 - 1;
      sample = noise * 0.72 + Math.sin(2 * Math.PI * 190 * time) * 0.28;
    } else if (event.kind === 'hat') {
      envelope = Math.exp(-time * 46);
      const noise = random() * 2 - 1;
      sample = noise * 0.95;
    } else if (event.kind === 'arp') {
      envelope = Math.min(1, time / 0.008) * Math.exp(-time * 8.5);
      const phase = 2 * Math.PI * frequency * time;
      sample = Math.sin(phase) * 0.65 + Math.sin(phase * 2) * 0.25 + Math.sin(phase * 3) * 0.1;
    } else {
      // Lead
      envelope = Math.min(1, time / attack) * Math.exp(-time * 4.2);
      const vibrato = Math.sin(time * 5.6) * 0.003;
      const phase = 2 * Math.PI * frequency * time * (1 + vibrato);
      sample = Math.sin(phase) * 0.68 + Math.sin(phase * 2) * 0.22 + Math.sin(phase * 3) * 0.1;
      sample *= 1 + Math.max(0, progress - 0.5) * 0.15;
    }

    const value = sample * envelope;
    channel.left[index] += value * leftGain;
    channel.right[index] += value * rightGain;
  }
}

// ─── Music Track Composer ─────────────────────────────────────────────────────
function compose(track) {
  const beat = 60 / track.bpm;
  const duration = track.bars * 4 * beat;
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  const channel = { left: new Float32Array(sampleCount), right: new Float32Array(sampleCount) };
  const progression = track.progression;
  const melodyA = [0, 2, 4, 7, 6, 4, 2, 0, 4, 6, 7, 9, 7, 6, 4, 2];
  const melodyB = [7, 9, 11, 9, 7, 6, 4, 6, 7, 6, 4, 2, 0, 2, 4, 0];
  const random = createRandom(track.seed);

  for (let bar = 0; bar < track.bars; bar++) {
    const chordDegree = progression[Math.floor(bar / 2) % progression.length];
    const barStart = bar * 4 * beat;
    const isSectionB = bar >= Math.floor(track.bars / 2);
    const melody = isSectionB ? melodyB : melodyA;

    // 1. Lush Pad Chords (Wide stereo)
    const chordTones = [chordDegree, chordDegree + 2, chordDegree + 4, chordDegree + 6];
    chordTones.forEach((degree, voice) => addNote(track, channel, {
      start: barStart,
      duration: 4 * beat,
      note: scaleNote(track, degree, voice === 0 ? 0 : 1),
      kind: 'pad',
      gain: voice === 0 ? 0.11 : 0.07,
      pan: [-0.62, -0.22, 0.22, 0.62][voice],
    }));

    // 2. Bassline
    [0, 1.5, 2, 3].forEach((beatOffset, index) => addNote(track, channel, {
      start: barStart + beatOffset * beat,
      duration: beat * 0.85,
      note: scaleNote(track, chordDegree + (index === 1 ? 4 : index === 3 ? 2 : 0), -1),
      kind: 'bass',
      gain: 0.18,
      pan: 0,
    }));

    // 3. Arpeggiator layer
    for (let step = 0; step < 8; step++) {
      const arpNote = chordTones[step % chordTones.length];
      addNote(track, channel, {
        start: barStart + step * beat * 0.5,
        duration: beat * 0.38,
        note: scaleNote(track, arpNote, 1),
        kind: 'arp',
        gain: 0.05,
        pan: Math.sin(bar + step * 0.8) * 0.45,
      });
    }

    // 4. Melodic Lead
    for (let eighth = 0; eighth < 8; eighth++) {
      const melodyIndex = (bar % 2) * 8 + eighth;
      const degree = melody[melodyIndex];
      if (degree !== undefined && (random() > 0.15 || eighth === 0 || eighth === 4)) {
        addNote(track, channel, {
          start: barStart + eighth * beat * 0.5,
          duration: beat * (eighth % 2 ? 0.4 : 0.65),
          note: scaleNote(track, chordDegree + degree, 1),
          kind: 'lead',
          gain: 0.15,
          pan: Math.sin(bar * 0.6 + eighth) * 0.28,
        });
      }
    }

    // 5. Dynamic Rhythm Section
    if (track.mood !== 'space_ambience') {
      for (let b = 0; b < 4; b++) {
        const beatStart = barStart + b * beat;
        // Kick on 1 and 3 (or all 4 for tempest / radioactive)
        if (b === 0 || b === 2 || track.mood === 'tempest_storm') {
          addNote(track, channel, { start: beatStart, duration: 0.32, note: 36, kind: 'kick', gain: 0.19, pan: 0 });
        }
        // Snare on 2 and 4
        if (b === 1 || b === 3) {
          addNote(track, channel, { start: beatStart, duration: 0.24, note: 60, kind: 'snare', gain: 0.11, pan: 0.05 });
        }
        // Hi-hats on 8ths
        addNote(track, channel, { start: beatStart, duration: 0.09, note: 82, kind: 'hat', gain: 0.03, pan: -0.25 });
        addNote(track, channel, { start: beatStart + beat * 0.5, duration: 0.09, note: 82, kind: 'hat', gain: 0.025, pan: 0.25 });
      }
    } else {
      // Atmospheric ambient pulse
      addNote(track, channel, { start: barStart, duration: 0.5, note: 36, kind: 'kick', gain: 0.12, pan: 0 });
      addNote(track, channel, { start: barStart + beat * 2, duration: 0.2, note: 78, kind: 'hat', gain: 0.025, pan: 0.3 });
    }
  }

  return { channel, sampleCount };
}

// ─── Character Signature Soundtrack Composer ───────────────────────────────────
function composeCharacterTrack(charId, isAlien) {
  const seed = hashString(charId);
  const random = createRandom(seed);
  const duration = 0.95 + (seed % 15) * 0.025; // ~0.95s to 1.32s
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  const channel = { left: new Float32Array(sampleCount), right: new Float32Array(sampleCount) };

  // Base root frequency
  const rootMidi = isAlien ? (38 + (seed % 14)) : (50 + (seed % 16));
  const chordSteps = isAlien
    ? [0, 3, 6, 10, 11] // Diminished / Alien Phrygian intervals
    : [0, 4, 7, 11, 14]; // Triumphant Major / Lydian military fanfare

  const noteCount = 4;
  for (let step = 0; step < noteCount; step++) {
    const noteStart = step * (duration * 0.18);
    const noteDur = duration - noteStart;
    const interval = chordSteps[step % chordSteps.length];
    const freq = midiFrequency(rootMidi + interval);
    const pan = (step % 2 === 0 ? -1 : 1) * 0.35;
    const leftGain = Math.sqrt((1 - pan) * 0.5) * 0.18;
    const rightGain = Math.sqrt((1 + pan) * 0.5) * 0.18;

    const startSample = Math.floor(noteStart * SAMPLE_RATE);
    const endSample = Math.min(sampleCount, Math.floor((noteStart + noteDur) * SAMPLE_RATE));

    for (let i = startSample; i < endSample; i++) {
      const time = (i - startSample) / SAMPLE_RATE;
      const env = Math.min(1, time / 0.008) * Math.exp(-time * (isAlien ? 6.5 : 7.8));

      // Harmonics
      let wave;
      if (isAlien) {
        // Alien frequency: FM modulated screech / eerie bio-pulse
        const modFreq = freq * 1.5;
        const mod = Math.sin(2 * Math.PI * modFreq * time) * 2.2;
        wave = Math.sin(2 * Math.PI * freq * time + mod) * 0.65
          + Math.sin(2 * Math.PI * freq * 2.7 * time) * 0.25;
        // Bio-transient hiss
        if (step === 0 && time < 0.2) {
          wave += (random() * 2 - 1) * Math.exp(-time * 18) * 0.4;
        }
      } else {
        // Military tactical: Brass-like rich harmonics + metallic attack
        wave = Math.sin(2 * Math.PI * freq * time) * 0.62
          + Math.sin(2 * Math.PI * freq * 2.0 * time) * 0.24
          + Math.sin(2 * Math.PI * freq * 3.0 * time) * 0.12;
        // Mechanical click transient
        if (step === 0 && time < 0.08) {
          wave += (random() * 2 - 1) * Math.exp(-time * 35) * 0.45;
        }
      }

      channel.left[i] += wave * env * leftGain;
      channel.right[i] += wave * env * rightGain;
    }
  }

  return { channel, sampleCount, duration };
}

// ─── Standard SFX Cue Composer ────────────────────────────────────────────────
function composeCue(cue) {
  const seed = hashString(cue);
  const duration = cue === 'alien-step' ? 0.19
    : cue === 'alien-death' ? 0.58
      : cue === 'fire-lance-shot' ? 0.42
    : cue === 'fire-impact' ? 0.34
      : cue.startsWith('ui-') ? 0.15 + (seed % 17) * 0.011
        : 0.24 + (seed % 19) * 0.016;
  const sampleCount = Math.ceil(duration * SAMPLE_RATE);
  const channel = { left: new Float32Array(sampleCount), right: new Float32Array(sampleCount) };
  const bright = /coin|plasma|select|tab|phase|extras/.test(cue);
  const root = (bright ? 66 : 46) + (seed % 29);
  const detune = ((seed >>> 12) % 1000) / 1000 * 0.32;
  const fireShot = cue === 'fire-lance-shot';
  const fireImpact = cue === 'fire-impact';
  const intervals = [0, [3, 5, 7, 12][(seed >>> 5) % 4], [7, 9, 12, 16][(seed >>> 9) % 4]];
  const voiceCount = cue.startsWith('ui-') ? 2 : 3;

  for (let voice = 0; voice < voiceCount; voice++) {
    const start = voice * duration * 0.17;
    const voiceDuration = duration - start;
    const frequency = midiFrequency(root + intervals[voice] + detune);
    const noiseRandom = createRandom(seed + voice * 7919);
    const pan = voice === 0 ? -0.18 : voice === 1 ? 0.18 : 0;
    const leftGain = Math.sqrt((1 - pan) * 0.5) * (voice === 0 ? 0.15 : 0.1);
    const rightGain = Math.sqrt((1 + pan) * 0.5) * (voice === 0 ? 0.15 : 0.1);
    const startSample = Math.floor(start * SAMPLE_RATE);
    const endSample = Math.min(sampleCount, Math.floor((start + voiceDuration) * SAMPLE_RATE));
    const attack = cue.includes('deploy') || cue.includes('place') ? 0.008 : 0.003;

    for (let i = startSample; i < endSample; i++) {
      const time = (i - startSample) / SAMPLE_RATE;
      const envelope = Math.min(1, time / attack) * Math.exp(-time * (voice === 0 ? 13 : 18));
      const sweep = fireImpact ? 1 + 0.42 * Math.exp(-time * 11) : fireShot ? 1 + 0.12 * Math.exp(-time * 16) : 1;
      const phase = 2 * Math.PI * frequency * time * sweep;
      const harmonics = Math.sin(phase) * 0.7 + Math.sin(phase * 2.01) * 0.2 + Math.sin(phase * 3.97) * 0.1;
      const noise = voice === 0 ? (noiseRandom() * 2 - 1) : 0;
      const transient = fireShot ? noise * Math.exp(-time * 24) * 0.7
        : fireImpact ? noise * Math.exp(-time * 14) * 0.9 : 0;
      const alienCue = cue.startsWith('alien-');
      const alienNoise = (noiseRandom() * 2 - 1) * Math.exp(-time * (cue === 'alien-death' ? 5 : 30));
      const bioPulse = Math.sin(phase * (cue === 'alien-step' ? 0.48 : 1.6))
        + Math.sin(phase * 2.13) * 0.18;
      const alienSample = cue === 'alien-step'
        ? bioPulse * Math.exp(-time * 19) * 0.55 + alienNoise * 0.32
        : cue === 'alien-death'
          ? bioPulse * Math.exp(-time * 4.8) * 0.6 + alienNoise * 0.42
          : bioPulse * envelope * 0.7 + alienNoise * envelope * 0.25;
      const sample = alienCue ? alienSample : (harmonics + transient) * envelope;
      channel.left[i] += sample * leftGain;
      channel.right[i] += sample * rightGain;
    }
  }

  return { channel, sampleCount, duration };
}

// ─── WAV Writer ───────────────────────────────────────────────────────────────
function writeWav(filePath, channel, sampleCount, fadeDuration = 0.08) {
  const headerSize = 44;
  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample * 2;
  const wav = Buffer.alloc(headerSize + dataSize);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(2, 22);
  wav.writeUInt32LE(SAMPLE_RATE, 24);
  wav.writeUInt32LE(SAMPLE_RATE * bytesPerSample * 2, 28);
  wav.writeUInt16LE(bytesPerSample * 2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(dataSize, 40);

  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    peak = Math.max(peak, Math.abs(channel.left[i]), Math.abs(channel.right[i]));
  }
  const gain = peak > 0 ? 0.82 / peak : 1;
  const fadeSamples = Math.max(1, Math.floor(SAMPLE_RATE * Math.min(fadeDuration, sampleCount / SAMPLE_RATE / 3)));
  let offset = headerSize;
  for (let i = 0; i < sampleCount; i++) {
    const fade = i >= sampleCount - fadeSamples ? (sampleCount - i) / fadeSamples : 1;
    for (const sample of [channel.left[i], channel.right[i]]) {
      const normalized = Math.tanh(sample * gain * fade);
      wav.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(normalized * 32767))), offset);
      offset += 2;
    }
  }
  fs.writeFileSync(filePath, wav);
}

// ─── Execution ────────────────────────────────────────────────────────────────
if (process.argv.includes('--alien-sfx-only')) {
  fs.mkdirSync(SFX_DIR, { recursive: true });
  for (const cue of ['alien-step', 'alien-melee', 'alien-bullet', 'alien-laser', 'alien-fire', 'alien-plasma', 'alien-death']) {
    const { channel, sampleCount } = composeCue(cue);
    writeWav(path.join(SFX_DIR, `${cue}.wav`), channel, sampleCount, 0.018);
    console.log(`[ALIEN SFX] Regenerated ${cue}.wav`);
  }
} else {
console.log('=== GALACTIC WARFARE: GENERATING AUDIO ASSETS ===');

// 1. Generate 8 Cinematic Background Music Tracks
fs.mkdirSync(MUSIC_DIR, { recursive: true });
for (const track of TRACKS) {
  const { channel, sampleCount } = compose(track);
  const output = path.join(MUSIC_DIR, track.file);
  writeWav(output, channel, sampleCount);
  const seconds = (sampleCount / SAMPLE_RATE).toFixed(1);
  const megabytes = (fs.statSync(output).size / (1024 * 1024)).toFixed(2);
  console.log(`[MUSIC] ${track.file}: ${seconds}s (${megabytes} MB) - ${track.description}`);
}

// 2. Generate Player Character Soundtracks and Cues
fs.mkdirSync(CHAR_PLAYER_MUSIC_DIR, { recursive: true });
fs.mkdirSync(SFX_DIR, { recursive: true });

const uniquePlayerUnits = [...new Set(PLAYER_ROSTER)];
for (const unitId of uniquePlayerUnits) {
  const { channel, sampleCount, duration } = composeCharacterTrack(unitId, false);
  // Write to music/characters/player/<id>.wav
  const musicPath = path.join(CHAR_PLAYER_MUSIC_DIR, `${unitId}.wav`);
  writeWav(musicPath, channel, sampleCount, 0.05);

  // Also write to sfx/unit-<id>.wav for immediate low-latency gameplay playback
  const sfxPath = path.join(SFX_DIR, `unit-${unitId}.wav`);
  writeWav(sfxPath, channel, sampleCount, 0.05);
}
console.log(`[CHARACTER] Generated ${uniquePlayerUnits.length} player military card soundtracks & SFX cues`);

// 3. Generate Alien Enemy Soundtracks and Cues
fs.mkdirSync(CHAR_ENEMY_MUSIC_DIR, { recursive: true });
const uniqueEnemyUnits = [...new Set(ENEMY_ROSTER)];
for (const enemyId of uniqueEnemyUnits) {
  const { channel, sampleCount, duration } = composeCharacterTrack(enemyId, true);
  // Write to music/characters/enemy/<id>.wav
  const musicPath = path.join(CHAR_ENEMY_MUSIC_DIR, `${enemyId}.wav`);
  writeWav(musicPath, channel, sampleCount, 0.05);

  // Also write to sfx/alien-<id>.wav for immediate low-latency gameplay playback
  const sfxPath = path.join(SFX_DIR, `alien-${enemyId}.wav`);
  writeWav(sfxPath, channel, sampleCount, 0.05);
}
console.log(`[CHARACTER] Generated ${uniqueEnemyUnits.length} alien attacker soundtracks & SFX cues`);

// 4. Generate Standard UI and Game SFX Cues
for (const cue of [...new Set([...UI_CUES, ...GAME_CUES])]) {
  const { channel, sampleCount, duration } = composeCue(cue);
  const output = path.join(SFX_DIR, `${cue}.wav`);
  writeWav(output, channel, sampleCount, 0.018);
}
console.log(`[SFX] Generated all UI, weapon, and battle event audio cues`);
console.log('=== AUDIO GENERATION COMPLETE ===');
}