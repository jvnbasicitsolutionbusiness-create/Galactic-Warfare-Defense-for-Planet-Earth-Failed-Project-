# Garden Warfare: Reborn

A 2D lane-based tower defense strategy game built with Phaser 3, Node.js, and Express.
Defend your garden from waves of original enemies by placing plant defenders in 5 lanes.

## Technologies

- Frontend: HTML5, CSS3, JavaScript (ES6)
- Game Engine: Phaser 3 v3.80.1 (CDN)
- Server: Node.js + Express.js
- Security: Helmet, CORS, dotenv
- Account and progression data: Google Sheets via the Express/Apps Script API, with an account-scoped localStorage cache

## Installation

  npm install
  copy .env.example .env

## npm Commands

  npm start      Start production server
  npm run dev    Start with nodemon (auto-restart)

## Local Development

  npm run dev
  Open http://localhost:3000

  Main menu:  http://localhost:3000/
  Game:       http://localhost:3000/game.html
  Health API: http://localhost:3000/api/health

## Project Structure

  public/
    index.html          Main menu (HTML/CSS/JS)
    game.html           Phaser game container
    css/                main.css, menu.css, game.css
    js/
      config.js         All constants, character/enemy/level defs
      main.js           Phaser entry point
      menu.js           Menu button logic
      game/
        scenes.js       BootScene + GameScene
        characters.js   Character class + CharacterFactory
        enemies.js      Enemy class + EnemyFactory
        combat.js       CombatManager
        waves.js        WaveManager
        projectiles.js  Projectile system
        collision.js    Grid math helpers
        resources.js    Energy system
        ui.js           HUD and UI
        player.js       Player state
        levels.js       Level manager
        game.js         Scene registry
    assets/             sprites, backgrounds, ui, audio (future)
  server/
    server.js           Express server (static files + API)
    auth.js             Account authentication and progression API
  Backend/
    apps-script-webhook.js Google Sheets account and progression storage

## Prototype Features (Phase 1)

- Main menu: PLAY, CHARACTERS, PROFILE, EXTRAS, SETTINGS, CREDITS
- 5-lane game board with home wall and enemy spawn side
- Solar Sprout: original character, auto-attack, costs 50 energy
- Grove Crawler: moves left, attacks blockers, dies, gives reward
- Projectile combat: solar seed fires, travels, hits, deals damage
- 3-wave progression with banners and between-wave countdown
- Victory screen (LEVEL COMPLETE) with PLAY AGAIN and MAIN MENU
- Defeat screen (GAME OVER) with RETRY and MAIN MENU
- 50 starting P.E. per mission; click plasma orbs to collect energy, including generator output
- 12 modular JS files, centralized config, all-original procedural art
- Security: Helmet, CORS, dotenv, server/client separation

## How to Play

1. Click PLAY on the main menu
2. Wait 3 seconds for Wave 1 to begin
3. Click the Solar Sprout card in the bottom tray (costs 50 energy)
4. Click any lane cell to place the defender
5. Solar Sprout auto-attacks enemies that enter its range
6. Survive all 3 waves to win
7. If any enemy reaches the home side (left), you lose

## Campaign Combat Balance

The campaign starts with 50 P.E. and a Fire-Lancer that costs 50 P.E., has 100 HP, and deals 20 damage every 2.2 seconds. Alien health is normalized by class after enemy definitions load, so brute and boss balance values must be kept consistent with that normalization pass; the current Beacon Brute has 1,200 HP and the Level 50 Rift Matriarch has 50,000 HP.

Common scouts move at the 12 px/s baseline (1.0×); other alien archetypes retain their configured speeds, and bicycle equipment doubles its wearer's base speed. Save & Quit checkpoints the active level, deployed units, resources, wave state, and elapsed run time for registered accounts and guest sessions. Guest checkpoints are stored locally and cleared when the guest logs out. Restart Level clears the active checkpoint and starts the selected level from its initial state.

## Future Phases

  Phase 2: More characters, enemies, levels, original artwork
  Phase 3: User accounts, Gmail OTP authentication, profiles
  Phase 4: Cloud account and progression storage integration
  Phase 5: Achievements, settings, complete UI
  Phase 6: Deployment and MIT App Inventor WebViewer integration

## Notes

All game content is original. No assets from Plants vs. Zombies or any commercial game were used.
The prototype uses procedurally drawn Phaser Graphics as character placeholders.
Sprite sheets can be added by updating GW.ASSETS in config.js and loading in BootScene.preload().
This is Part 1 of a larger development process.

## Audio

Original loopable background tracks and individual interaction cues are stored as PCM WAV files in `public/assets/audio/music/` and `public/assets/audio/sfx/`. Loading, authentication, the main menu, and each battle environment use distinct tracks. They can all be regenerated with `node tools/generate-original-music.js`; no third-party recordings or samples are used. The audio manager automatically attempts the track for each visited page or battle environment. Browsers may block audible autoplay until the first user interaction; if that happens, use the loading-screen sound control or interact with the page and playback will retry. The sound control can mute or re-enable audio.

## Mission Pacing

Campaign levels use the midpoint of each requested time range as their target completion time. Individual approaches and each flagged horde wave have separate difficulty-based arrival intervals. The timeline head follows the target runtime, while markers light as major waves are cleared; victory waits for the target runtime if all waves are cleared early.

| Difficulty | Individual approach interval | Flagged horde intervals | Target duration |
| --- | --- | --- | --- |
| Easy | 10–15 seconds | 20–30 seconds | 10 minutes (9–11 minute range) |
| Moderate | 12–20 seconds | 15–20 seconds; final 20–30 seconds | 16 minutes (14–18 minute range) |
| Medium | 14–23 seconds | 8–10, 12–15, then 20–30 seconds | 22 minutes 30 seconds (20–25 minute range) |
| Hard | 18–29 seconds | 5–10, 12–15, 15–20, then 20–30 seconds | 35 minutes (30–40 minute range) |
| Expert | 26–39 seconds | 5–10, 8–12, 12–15, 15–20, then 20–30 seconds | 52 minutes 30 seconds (45–60 minute range) |
| Impossible | 34–36 seconds | 34–36 seconds | 30-minute assault, followed by a 5-minute boss phase |

The Plasma Energy Generator produces 25 P.E. every 8–12 seconds. A 25 P.E. field orb appears every 12–15 seconds.

Each alien can drop at most one currency item, with 70% of kills dropping nothing: silver 15%, gold 8%, emerald 4%, diamond 2%, or a wealth bag 1%. These are all below the requested maximum odds.
