# Original Music Tracks

These loopable WAV files are generated from original compositions in `tools/generate-original-music.js`. They use no samples, recordings, or third-party music.

- `loading-screen.wav` — loading screens
- `authentication.wav` — login and registration
- `main-menu.wav` — main menu
- `battle-daytime.wav` — daytime levels
- `battle-nighttime.wav` — nighttime levels
- `battle-foggy.wav` — foggy levels
- `battle-storm.wav` — rainy and stormy levels
- `battle-radioactive.wav` — radioactive levels

Regenerate the tracks from the project root with `node tools/generate-original-music.js`. Files are stereo PCM WAV for broad browser support; the game loads only the current scene's track.
