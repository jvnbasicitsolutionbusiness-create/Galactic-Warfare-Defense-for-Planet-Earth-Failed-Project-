/* Original soundtrack playback and synthesized sound effects for Galactic Warfare. */
(function () {
  'use strict';

  const STORAGE_KEY = 'gw_audio_enabled';
  const MUSIC_ROOT = 'public/assets/audio/music/';
  const SFX_ROOT = 'public/assets/audio/sfx/';
  const TRACKS = {
    loading: 'loading-screen.wav',
    auth: 'authentication.wav',
    menu: 'main-menu.wav',
  };
  const ENVIRONMENT_TRACKS = {
    daytime: 'battle-daytime.wav',
    nighttime: 'battle-nighttime.wav',
    foggy: 'battle-foggy.wav',
    rainy_stormy: 'battle-storm.wav',
    radioactive: 'battle-radioactive.wav',
  };

  let audioUnlocked = false;
  let musicVolume = 0.6;
  let sfxVolume = 0.8;
  const activeSounds = new Set();
  let lastAlienStepAt = 0;
  let effectsAudioContext = null;
  const musicPlayer = new Audio();
  musicPlayer.loop = true;
  musicPlayer.preload = 'auto';
  musicPlayer.addEventListener('error', () => {
    console.error('[GWAudio] Background track failed to load:', musicPlayer.currentSrc || musicPlayer.src);
  });
  musicPlayer.addEventListener('canplay', startMusic);
  let currentScene = 'loading';
  let currentEnvironment = 'daytime';
  let enabled = readEnabled();

  function readEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch (_) { return true; }
  }

  function getVolumes() {
    const progression = window.GW && window.GW.progression;
    const music = progression && progression.getSetting
      ? progression.getSetting('musicVolume') : 0.6;
    const sfx = progression && progression.getSetting
      ? progression.getSetting('sfxVolume') : 0.8;
    return { music, sfx };
  }

  function normalizeVolume(value, fallback) {
    if (value == null || (typeof value === 'string' && !value.trim())) return fallback;
    const volume = Number(value);
    return Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : fallback;
  }

  function updateVolumes(musicValue, sfxValue) {
    const defaults = getVolumes();
    const music = musicValue === undefined ? defaults.music : musicValue;
    const sfx = sfxValue === undefined ? defaults.sfx : sfxValue;
    musicVolume = normalizeVolume(music, 0.6);
    sfxVolume = normalizeVolume(sfx, 0.8);
    musicPlayer.volume = enabled ? musicVolume : 0;
    activeSounds.forEach(sound => { sound.volume = enabled ? sfxVolume : 0; });
  }

  function selectedTrack() {
    const file = currentScene === 'battle'
      ? ENVIRONMENT_TRACKS[currentEnvironment] || ENVIRONMENT_TRACKS.daytime
      : TRACKS[currentScene] || TRACKS.menu;
    return MUSIC_ROOT + file;
  }

  function startMusic() {
    if (!enabled || document.hidden || !musicPlayer.paused) return;
    musicPlayer.play().catch(error => {
      if (!error || error.name !== 'AbortError') {
        console.warn('[GWAudio] Background playback did not start; it will retry on the next interaction.', error);
      }
    });
  }

  function unlock() {
    audioUnlocked = true;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!effectsAudioContext && AudioContextClass) effectsAudioContext = new AudioContextClass();
    if (effectsAudioContext && effectsAudioContext.state === 'suspended') {
      effectsAudioContext.resume().catch(error => {
        console.warn('[GWAudio] Effect audio could not resume.', error);
      });
    }
    updateVolumes();
    startMusic();
    document.querySelectorAll('[data-audio-toggle]').forEach(button => {
      button.textContent = enabled ? 'MUTE SOUND' : 'ENABLE SOUND';
      button.setAttribute('aria-pressed', String(enabled));
    });
  }

  function setScene(scene, environment) {
    if (!TRACKS[scene] && scene !== 'battle') return;
    currentScene = scene;
    if (environment && ENVIRONMENT_TRACKS[environment]) currentEnvironment = environment;
    const track = selectedTrack();
    if (musicPlayer.getAttribute('src') !== track) {
      musicPlayer.pause();
      musicPlayer.currentTime = 0;
      musicPlayer.src = track;
      musicPlayer.load();
    }
    startMusic();
  }

  function play(effect) {
    if (!audioUnlocked || !enabled || !effect) return;
    if (effect === 'horde-warning') {
      playApproachSiren();
      return;
    }
    if (effect === 'alien-step') {
      const now = performance.now();
      if (now - lastAlienStepAt < 260) return;
      lastAlienStepAt = now;
    }
    const sound = new Audio(SFX_ROOT + effect + '.wav');
    sound.volume = sfxVolume;
    activeSounds.add(sound);
    sound.addEventListener('ended', () => activeSounds.delete(sound), { once: true });
    sound.play().catch(() => activeSounds.delete(sound));
  }

  function playApproachSiren() {
    if (!effectsAudioContext) {
      console.warn('[GWAudio] Horde siren is unavailable in this browser.');
      return;
    }
    const context = effectsAudioContext;
    if (context.state === 'suspended') {
      context.resume().catch(error => {
        console.warn('[GWAudio] Horde siren could not resume.', error);
      });
    }

    const start = context.currentTime;
    const duration = 2.4;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(520, start);
    oscillator.frequency.linearRampToValueAtTime(880, start + 0.6);
    oscillator.frequency.linearRampToValueAtTime(520, start + 1.2);
    oscillator.frequency.linearRampToValueAtTime(880, start + 1.8);
    oscillator.frequency.linearRampToValueAtTime(520, start + duration);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.22 * sfxVolume, start + 0.08);
    gain.gain.setValueAtTime(0.22 * sfxVolume, start + duration - 0.15);
    gain.gain.linearRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function playButton(button) {
    if (!button || button.matches('[data-audio-toggle]')) return;
    let cue = button.dataset.audioCue;
    if (!cue && button.classList.contains('phase-tab')) cue = 'phase-' + button.dataset.phase;
    if (!cue && button.classList.contains('extras-tab-btn')) cue = 'extras-' + button.dataset.extab;
    if (!cue) cue = button.id || 'unassigned';
    const normalizedCue = cue.toLowerCase();
    play(normalizedCue === 'briefingstart' || normalizedCue === 'briefingdismiss'
      ? 'battle-deploy'
      : 'ui-' + normalizedCue);
  }

  function toggle() {
    enabled = !enabled;
    unlock();
    updateVolumes();
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch (_) {}
    if (!enabled) musicPlayer.pause();
    else startMusic();
    if (!enabled) {
      activeSounds.forEach(sound => { sound.pause(); sound.currentTime = 0; });
      activeSounds.clear();
    }
    document.querySelectorAll('[data-audio-toggle]').forEach(button => {
      button.textContent = enabled ? 'MUTE SOUND' : 'ENABLE SOUND';
      button.setAttribute('aria-pressed', String(enabled));
    });
    return enabled;
  }

  document.addEventListener('pointerdown', event => {
    const audioButton = event.target.closest('[data-audio-toggle]');
    if (audioButton) {
      event.preventDefault();
      toggle();
      return;
    }
    unlock();
    const button = event.target.closest('button');
    if (button) playButton(button);
  }, true);
  document.addEventListener('keydown', unlock, { once: true, capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) musicPlayer.pause();
    else startMusic();
  });

  window.GWAudio = { setScene, play, unlock, setVolumes: updateVolumes, toggle };
  document.querySelectorAll('[data-audio-toggle]').forEach(button => {
    button.textContent = enabled ? 'MUTE SOUND' : 'ENABLE SOUND';
    button.setAttribute('aria-pressed', String(enabled));
  });
})();