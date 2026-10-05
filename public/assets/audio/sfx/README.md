# Original Sound Effects

This folder contains individual, original WAV cues for interface buttons, level selectors, and gameplay actions. Each interface control has its own named file; gameplay cues include card selection/placement, coin and plasma collection, deployment, pause/end-screen choices, and separate alien/defender deaths. Military weapons have distinct launch cues; Fire-Lancer uses `fire-lance-shot.wav`, with a separate `fire-lance-windup.wav` and `fire-impact.wav`. Alien movement (`alien-step`), melee, bullet, laser, fire, and plasma attacks have separate cues.

The cues are generated without samples or third-party recordings. Regenerate the
alien movement, attack, and death cues only with
`node tools/generate-original-music.js --alien-sfx-only`. Regenerate all cues
and background tracks from the project root with `node tools/generate-original-music.js`.
