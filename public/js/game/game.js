/**
 * Garden Warfare: Reborn — Game Orchestrator
 *
 * This file is the final wiring point loaded before main.js.
 * It collects all scene classes into the GW namespace so main.js
 * can register them with Phaser without importing individual files.
 *
 * Architecture notes:
 *  - Each scene is a self-contained class defined in scenes.js
 *  - This file adds nothing executable — it is a registry/manifest
 *  - When new scenes are added (e.g. ShopScene, MapScene), add them here
 */

/* global GW */

GW.SceneRegistry = [
  GW.BootScene,
  GW.GameScene,
];
