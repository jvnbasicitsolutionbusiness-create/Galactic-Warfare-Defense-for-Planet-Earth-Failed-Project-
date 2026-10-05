# Garden Warfare: Reborn — Public Assets

## Structure

`
public/assets/
├── audio/
│   ├── music/       — background music (OGG + MP3)
│   ├── sfx/         — gameplay sound effects
│   └── ui/          — UI interaction sounds
│
├── backgrounds/
│   ├── battlefield/ — per-environment battlefield backgrounds (SVG, 960x600)
│   │   ├── daytime.svg
│   │   ├── nighttime.svg
│   │   ├── flooded.svg
│   │   ├── storm.svg
│   │   └── radioactive.svg
│   ├── briefing/    — briefing screen background
│   ├── defeat/      — game over screen background
│   ├── garden/      — garden field overlay
│   ├── menu/        — main menu background
│   └── victory/     — victory screen background
│
├── sprites/
│   ├── characters/
│   │   ├── player/  — fire_lance_gunner.svg, plasma_energy_generator.svg
│   │   ├── enemy/   — original alien roster artwork
│   │   ├── allies/  — future allied units
│   │   └── special/ — Creator Bitos, sentinels
│   ├── enemies/
│   │   ├── basic/   — vex_drone.svg, vex_flag_bearer.svg
│   │   ├── elite/   — future elite enemies
│   │   └── boss/    — future boss enemies
│   ├── projectiles/ — fire-lance-shot.svg, plasma-shot.svg, bullet.svg
│   └── effects/     — hit-spark.svg, death-burst.svg, plasma-collect.svg, spawn-ring.svg
│
└── ui/
    ├── buttons/     — btn-primary.svg, btn-menu.svg
    ├── hud/         — plasma-icon.svg, wave-marker.svg
    ├── indicators/  — alien-head.svg, menu-icon.svg, pause-icon.svg
    └── panels/      — card-slot.svg, hud-bar.svg, timeline-bar.svg
`

## Deployment Notes

- All paths use web-safe relative URLs: /assets/...
- All filenames are lowercase (or match exactly) for Linux/production compatibility
- SVGs are used as placeholder assets — replace with final artwork when ready
- Audio cues are original WAV files — see README.md in each audio subfolder
- The battlefield currently uses Phaser procedural graphics (no image dependency)
- GW.ASSETS in config.js contains deployment-safe path references

## Filename Convention

- Use lowercase, hyphens for spaces: ire-lance-shot.svg
- Match exactly what config.js references

## Original Alien Roster

Enemy battle sprites are animated with the Phaser `SpriteRegistry`; the matching
SVG illustrations in `sprites/characters/enemy/` are used in the enemy profile
and asset registry. The roster is original artwork: Mosskin Scout, Signal Bearer,
Crater Raider, Beacon Brute, Vanta Pouncer, Glassback Stalker, Skyroot Titan,
Ion Wing, and the level-50 Rift Matriarch. Combat effects and projectiles also
use original vector artwork in `sprites/effects/` and `sprites/projectiles/`.
- No spaces, no uppercase (Linux servers are case-sensitive)