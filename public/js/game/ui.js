/**
 * Garden Warfare: Reborn — Battlefield HUD & UI Manager
 *
 * FULL BATTLEFIELD REVISION per spec §§4-32:
 *
 * Layout (960×560 canvas):
 *  TOP-LEFT:    Plasma counter + horizontal card tray (max 6 cards)
 *  TOP-RIGHT:   MENU button
 *  CENTER:      Battlefield (no HUD overlap)
 *  BOTTOM:      Tactical invasion timeline with alien-head marker
 *
 * Removed: WAVE X/Y text display
 * Added:   Tactical timeline, MENU button, pause overlay, loadout enforcement
 */

/* global GW, Phaser */

GW.UIManager = class UIManager {
  constructor(scene, resourceManager) {
    this.scene           = scene;
    this.resourceManager = resourceManager;
    this.W               = GW.DISPLAY.BASE_WIDTH;
    this.H               = GW.DISPLAY.BASE_HEIGHT;

    // HUD element references
    this.plasmaText      = null;
    this.plasmaIcon      = null;
    this.scoreText       = null;
    this.trayCards       = [];
    this.selectedCardId  = null;
    this.gridOverlay     = null;
    // Cooldown tracking: cardId → remaining ms
    this._cooldowns      = {};
    this.bannerText      = null;
    this.currentLevelText = null;
    this.runtimeText     = null;
    this._runtimeDisplayedSeconds = -1;
    this.shovelActive    = false;
    this.shovelButton    = null;

    // Timeline
    this.timelineBar     = null;
    this.timelineMarker  = null;
    this._waveMarkers    = [];
    this._totalWaves     = 0;
    this._currentProgress = 0;

    // Menu button
    this.menuBtn         = null;
    this.menuBtnZone     = null;

    // Pause state
    this.isPaused        = false;
    this._pauseOverlay   = null;

    // Loadout (max 6 card ids from the level's available defenders)
    this._loadout        = [];

    // Callbacks
    this.onCharacterSelected = null;
    this.onShovelSelected    = null;
    this.onMenuPressed       = null;
    this.onPauseResume       = null;
    this.onPauseRestart      = null;
    this.onPauseToMap        = null;
    this.onPauseQuit         = null;
  }

  /** Set the active loadout (up to MAX_LOADOUT card ids). */
  setLoadout(cardIds) {
    this._loadout = (cardIds || []).slice(0, GW.LOADOUT.MAX_CARDS);
  }

  /** Build all HUD elements. Call after subsystems are ready. */
  buildHUD(totalWaves, levelId, markerPositions) {
    this._totalWaves = totalWaves || 1;
    this._buildTopBar();
    this._buildTray();
    this._buildShovelButton();
    this._buildMenuButton();
    this._buildTimeline(levelId, markerPositions);
    this._buildBanner();
    this._buildGridOverlay();
  }

  // ══════════════════════════════════════════════════════════
  //  TOP BAR: Plasma + Cards
  // ══════════════════════════════════════════════════════════
  _buildTopBar() {
    const s  = this.scene;
    const TH = GW.BOARD.TRAY_HEIGHT; // 60px
    const W  = this.W;

    // Semi-transparent tray background
    const bg = s.add.graphics().setDepth(30);
    bg.fillStyle(0x050d05, 0.88);
    bg.fillRect(0, 0, W, TH);
    bg.lineStyle(1, 0x4ade80, 0.2);
    bg.lineBetween(0, TH, W, TH);

    // ── Plasma collector box (purple square, left-centred in tray) ──────────
    // Positioned away from the card tray start — sits between left edge and cards.
    // Box: 100px wide, full tray height minus 4px padding each side.
    const BOX_X = 8;
    const BOX_W = 108;
    const BOX_H = TH - 8;
    const BOX_Y = 4;

    // Purple square border (the "collector machine")
    const boxGfx = s.add.graphics().setDepth(31);
    boxGfx.fillStyle(0x2d1b4e, 0.92);
    boxGfx.lineStyle(2, 0x7c3aed, 0.85);
    boxGfx.fillRoundedRect(BOX_X, BOX_Y, BOX_W, BOX_H, 5);
    boxGfx.strokeRoundedRect(BOX_X, BOX_Y, BOX_W, BOX_H, 5);

    // Inner glow line (top edge accent)
    boxGfx.lineStyle(1, 0xc4b5fd, 0.3);
    boxGfx.lineBetween(BOX_X + 6, BOX_Y + 2, BOX_X + BOX_W - 6, BOX_Y + 2);

    // ⚡ icon inside box (left side)
    const ICX = BOX_X + 14;
    const ICY = TH / 2;
    const plasmaIconGfx = s.add.graphics().setDepth(33);
    plasmaIconGfx.fillStyle(0xa78bfa, 0.9);
    plasmaIconGfx.fillCircle(0, 0, 9);
    plasmaIconGfx.fillStyle(0xc4b5fd, 0.55);
    plasmaIconGfx.fillCircle(-2, -2, 4);
    plasmaIconGfx.x = ICX;
    plasmaIconGfx.y = ICY;
    this.plasmaIcon = plasmaIconGfx;

    s.add.text(ICX - 4, ICY - 5, '⚡', {
      fontSize: '10px', color: '#a78bfa',
    }).setDepth(33);

    // Plasma value (right of icon, inside box)
    const startEnergy = (GW.RESOURCES && GW.RESOURCES.STARTING_ENERGY) || 0;
    this.plasmaText = s.add.text(ICX + 16, ICY, String(startEnergy), {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '17px',
      fontStyle:  'bold',
      color:      '#c4b5fd',
    }).setOrigin(0, 0.5).setDepth(33);

    // "PLASMA" micro label (below value)
    s.add.text(ICX + 16, ICY + 10, 'PLASMA', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '6px',
      color:      '#7c3aed',
      letterSpacing: 1,
    }).setOrigin(0, 0).setDepth(33);

    // Score (top-centre)
    this.scoreText = s.add.text(W / 2, 4, 'SCORE: 0', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '10px',
      color:      '#4a5a3a',
    }).setOrigin(0.5, 0).setDepth(31);

    // Update display whenever energy changes (collect orb, spend, kill reward)
    this.resourceManager.onChange(energy => {
      if (this.plasmaText) {
        this.plasmaText.setText(String(energy));
        // Brief pulse when plasma changes
        this.scene.tweens.add({
          targets: this.plasmaText,
          scaleX: 1.25, scaleY: 1.25,
          duration: 90, yoyo: true, ease: 'Power2',
        });
      }
    });
  }

  // ══════════════════════════════════════════════════════════
  //  CARD TRAY (horizontal, top-left, max 6 cards)
  // ══════════════════════════════════════════════════════════
  _buildTray() {
    const s  = this.scene;
    const TH = GW.BOARD.TRAY_HEIGHT;
    const CW = GW.BOARD.TRAY_CARD_W;     // 62
    const CH = GW.BOARD.TRAY_CARD_H;     // 50
    const PAD = GW.BOARD.TRAY_CARD_PAD;  // 4
    const startX = GW.BOARD.TRAY_START_X; // 120 — after plasma area

    // Determine which cards to show: only loadout (max 6)
    const prog = window.GW && window.GW.progression;

    // Build display list — claimed cards in loadout, plus locked slots up to MAX_LOADOUT
    const displaySlots = [];
    for (let i = 0; i < GW.LOADOUT.MAX_CARDS; i++) {
      const cardId = this._loadout[i] || null;
      const def    = cardId ? (GW.CARDS && GW.CARDS[cardId]) : null;
      const claimed = def && prog ? prog.isCardClaimed(cardId) : !!def;
      displaySlots.push({ cardId, def, claimed });
    }

    displaySlots.forEach((slot, i) => {
      const cx = startX + i * (CW + PAD) + CW / 2;
      const cy = TH / 2;
      this._buildCardSlot(slot.cardId, slot.def, slot.claimed, cx, cy, CW, CH);
    });
  }

  _buildShovelButton() {
    const s = this.scene;
    const BW = 70, BH = 34;
    const BX = this.W - 228;
    const BY = (GW.BOARD.TRAY_HEIGHT - BH) / 2;
    const bg = s.add.graphics().setDepth(35);
    const draw = (hover) => {
      bg.clear();
      bg.fillStyle(this.shovelActive ? 0x365314 : (hover ? 0x1f2937 : 0x111b10), 1);
      bg.lineStyle(1.5, this.shovelActive ? 0x86efac : 0xfbbf24, this.shovelActive ? 1 : 0.75);
      bg.fillRoundedRect(BX, BY, BW, BH, 4);
      bg.strokeRoundedRect(BX, BY, BW, BH, 4);
    };
    draw(false);

    const icon = s.add.graphics().setDepth(36);
    icon.fillStyle(0xd1d5db, 0.95);
    icon.fillTriangle(BX + 8, BY + 15, BX + 21, BY + 15, BX + 14, BY + 25);
    icon.lineStyle(2.5, 0xd1d5db, 1);
    icon.lineBetween(BX + 14, BY + 17, BX + 23, BY + 8);

    s.add.text(BX + 47, BY + 10, 'SHOVEL', {
      fontFamily: '"Exo 2", monospace', fontSize: '7px', fontStyle: 'bold', color: '#fef3c7',
    }).setOrigin(0.5).setDepth(36);
    s.add.text(BX + 47, BY + 23, '200 P.E.', {
      fontFamily: '"Exo 2", monospace', fontSize: '8px', fontStyle: 'bold', color: '#fbbf24',
    }).setOrigin(0.5).setDepth(36);

    const zone = s.add.rectangle(BX + BW / 2, BY + BH / 2, BW, BH, 0, 0)
      .setDepth(37)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerover', () => draw(true));
    zone.on('pointerout', () => draw(false));
    zone.on('pointerdown', () => {
      if (this.isPaused) return;
      const nextState = !this.shovelActive;
      if (this.onShovelSelected && this.onShovelSelected(nextState) === false) return;
      this.setShovelActive(nextState);
    });

    this.shovelButton = { bg, zone, draw };
  }

  setShovelActive(active) {
    this.shovelActive = !!active;
    if (this.shovelButton) this.shovelButton.draw(false);
  }

  _buildCardSlot(cardId, def, claimed, cx, cy, w, h) {
    const s = this.scene;
    const D = 32;
    const container = s.add.container(cx, cy).setDepth(D);

    const bg = s.add.graphics();

    if (!claimed || !def) {
      // Locked slot
      bg.fillStyle(0x0a100a, 0.8);
      bg.lineStyle(1, 0x2d3a2d, 0.6);
      bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
      bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
      container.add(bg);

      const lockText = s.add.text(0, 0, '🔒', { fontSize: '14px' }).setOrigin(0.5);
      container.add(lockText);
      this.trayCards.push({ id: null, card: { container, bg, w, h }, locked: true });
      return;
    }

    // Active card slot
    bg.fillStyle(0x0a1508, 0.92);
    bg.lineStyle(1.5, 0x3d6b1a, 0.5);
    bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
    bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
    container.add(bg);

    // Mini icon — role-based visual
    const icon = s.add.graphics();
    this._drawCardIcon(icon, def);
    icon.y = -4;
    container.add(icon);

    // Card name (very compact)
    const nameLabel = def.name.length > 8 ? def.name.substring(0, 7) + '.' : def.name;
    const nameTxt = s.add.text(0, h/2 - 16, nameLabel, {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '7px',
      color:      '#9ca3af',
      align:      'center',
    }).setOrigin(0.5, 0);
    container.add(nameTxt);

    // Cost
    const costTxt = s.add.text(0, h/2 - 6, `⚡${def.cost}`, {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '9px',
      fontStyle:  'bold',
      color:      '#a78bfa',
      align:      'center',
    }).setOrigin(0.5, 0);
    container.add(costTxt);

    // Hit zone
    const hitZone = s.add.rectangle(0, 0, w, h, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerdown', () => {
      if (!this.isPaused) this._selectCard(cardId);
    });
    hitZone.on('pointerover', () => {
      if (this.selectedCardId !== cardId) {
        bg.clear();
        bg.fillStyle(0x0f2a10, 0.95);
        bg.lineStyle(1.5, 0x4ade80, 0.7);
        bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
        bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
      }
    });
    hitZone.on('pointerout', () => {
      if (this.selectedCardId !== cardId) this._deselectCardVisual(bg, w, h);
    });

    // ── Cooldown overlay (hidden until startCooldown is called) ──
    // Dark tint covers the whole card
    const cdOverlay = s.add.graphics();
    cdOverlay.fillStyle(0x000000, 0.62);
    cdOverlay.fillRoundedRect(-w/2, -h/2, w, h, 4);
    cdOverlay.setVisible(false);
    container.add(cdOverlay);

    // Countdown text centred on the card
    const cdText = s.add.text(0, -2, '', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '15px',
      fontStyle:  'bold',
      color:      '#fbbf24',
      stroke:     '#000',
      strokeThickness: 3,
      align:      'center',
    }).setOrigin(0.5).setVisible(false);
    container.add(cdText);

    this.trayCards.push({ id: cardId, card: { container, bg, w, h, cdOverlay, cdText }, locked: false });
  }

  _drawCardIcon(g, def) {
    g.clear();
    if (!def) return;

    if (def.role === 'energy' || def.isEnergyGenerator) {
      // ── PE Generator card tray icon ──────────────────────────────────────
      // Mini version of the blue tower: 3-leg base, cylindrical body, glowing orb
      // Base platform (dark navy + amber trim)
      g.fillStyle(0x1e3a5f, 1);
      g.fillRoundedRect(-9, 6, 18, 7, 2);
      g.fillStyle(0xd97706, 0.9);
      g.fillRect(-8, 6, 16, 1);
      g.fillRect(-8, 12, 16, 1);

      // Three tiny legs
      g.fillStyle(0x374151, 1);
      g.fillRect(-8, 12, 3, 4);
      g.fillRect(-2, 12, 3, 4);
      g.fillRect(5,  12, 3, 4);

      // Body cylinder (blue, two amber rings)
      g.fillStyle(0x2d5a8e, 1);
      g.fillRoundedRect(-6, -8, 12, 16, 2);
      g.fillStyle(0xd97706, 0.8);
      g.fillRect(-7, -3, 14, 1);
      g.fillRect(-7, 2,  14, 1);

      // Amber mid-ring
      g.fillStyle(0xd97706, 0.9);
      g.fillRoundedRect(-7, -10, 14, 3, 1);

      // Plasma orb (blue, cyan glow ring)
      g.fillStyle(0x3b82f6, 0.9);
      g.fillCircle(0, -17, 7);
      g.fillStyle(0x60a5fa, 0.85);
      g.fillCircle(-1, -18, 4);
      g.fillStyle(0xffffff, 0.55);
      g.fillCircle(-2, -19, 1.5);
      // Cyan orbital ring hint
      g.lineStyle(1, 0x22d3ee, 0.8);
      g.strokeEllipse(0, -17, 16, 5);
    } else if (def.isSuicideUnit) {
      // Bomber card tray icon — soldier silhouette + oversized bomb
      g.fillStyle(def.color || 0x7f1d1d, 1);
      g.fillRoundedRect(-6, -10, 12, 16, 2);
      g.fillStyle(def.skinColor || 0xd4956a, 1);
      g.fillRoundedRect(-5, -18, 10, 10, 3);
      g.fillStyle(def.helmetColor || 0x450a0a, 1);
      g.fillRoundedRect(-6, -21, 12, 7, 3);
      // Bomb — large circle replacing gun
      g.fillStyle(0x1f2937, 1); g.fillCircle(9, -6, 6);
      g.fillStyle(0x4b5563, 0.5); g.fillCircle(7, -9, 2);
      // Fuse + spark
      g.lineStyle(1, 0x78350f, 1);
      g.beginPath(); g.moveTo(9, -12); g.lineTo(11, -16); g.strokePath();
      g.fillStyle(0xfbbf24, 1); g.fillCircle(11, -17, 1.5);
    } else if (def.isSupport && !def.weapon) {
      const ability = def.specialAbility;
      const color = def.accentColor || 0x67e8f9;
      if (['heal_nearby', 'rapid_repair', 'neutralize_radiation'].includes(ability)) {
        g.fillStyle(color, 0.9); g.fillRoundedRect(-7, -10, 14, 22, 3);
        g.fillStyle(0xf8fafc, 1); g.fillRect(-2, -6, 4, 14); g.fillRect(-7, -1, 14, 4);
      } else if (['energy_shield', 'plasma_barrier', 'multi_buff'].includes(ability)) {
        g.fillStyle(color, 0.9); g.fillTriangle(0, -13, 11, -8, 9, 7); g.fillTriangle(9, 7, 0, 12, -9, 7);
        g.lineStyle(1.5, 0xffffff, 0.8); g.strokeTriangle(0, -13, 11, -8, 9, 7);
      } else {
        g.lineStyle(2, color, 0.95); g.strokeCircle(0, 0, 10);
        g.lineBetween(-14, 0, 14, 0); g.lineBetween(0, -14, 0, 14);
        g.fillStyle(color, 1); g.fillCircle(0, 0, 3);
      }
    } else if (def.id === 'fire_lancer') {
      // ── Fire-Lancer card icon ──────────────────────────────────────
      // Miniature version of the sprite: dark maroon uniform, red plume helmet,
      // orange fire-lance pole extending right with a small flame at the tip.

      // Body (dark maroon armour)
      g.fillStyle(0x6b1a1a, 1);
      g.fillRoundedRect(-6, -10, 13, 17, 2);
      // Armour ridge
      g.fillStyle(0x4a0f0f, 0.8);
      g.fillRect(-1, -9, 2, 15);

      // Head (skin)
      g.fillStyle(def.skinColor || 0xd4956a, 1);
      g.fillRoundedRect(-5, -20, 11, 11, 3);

      // Helmet (dark red)
      g.fillStyle(0x8b1a1a, 1);
      g.fillRoundedRect(-6, -24, 13, 8, 3);
      // Helmet visor brow
      g.fillStyle(0x4a0f0f, 1);
      g.fillRect(-7, -17, 15, 2);

      // Red plume tassel above helmet
      g.fillStyle(0xdc2626, 0.95);
      g.fillRect(-1, -30, 4, 7);
      g.fillRect(-2, -30, 1, 10);  // left strand
      g.fillRect(4,  -30, 1, 10);  // right strand

      // Fire-lance pole (amber, horizontal)
      g.fillStyle(0xb45309, 1);
      g.fillRect(-12, -7, 26, 3);

      // Flame tip (orange circle at far right of pole)
      g.fillStyle(0xff6b00, 0.9);
      g.fillCircle(14, -5, 4);
      // Bright inner
      g.fillStyle(0xfef08a, 0.75);
      g.fillCircle(14, -5, 2);
    } else {
      // Generic offense soldier icon
      g.fillStyle(def.color || 0x4d7c0f, 1);
      g.fillRoundedRect(-6, -10, 12, 16, 2);
      g.fillStyle(def.skinColor || 0xd4956a, 1);
      g.fillRoundedRect(-5, -18, 10, 10, 3);
      g.fillStyle(def.helmetColor || 0x365314, 1);
      g.fillRoundedRect(-6, -21, 12, 7, 3);
      g.fillStyle(0x374151, 1);
      g.fillRect(5, -8, 8, 3);
    }
  }

  _selectCard(id) {
    // Block selection if this card is on cooldown
    if (id && this._cooldowns[id] && this._cooldowns[id] > 0) return;

    // Deselect all visually first
    this.trayCards.forEach(({ id: cid, card }) => {
      if (!card) return;
      this._deselectCardVisual(card.bg, card.w, card.h);
    });

    if (this.selectedCardId === id) {
      this.selectedCardId = null;
      if (window.GWAudio) window.GWAudio.play('card-deselect');
      if (this.onCharacterSelected) this.onCharacterSelected(null);
      return;
    }

    this.selectedCardId = id;
    if (window.GWAudio) window.GWAudio.play('card-select');
    const found = this.trayCards.find(c => c.id === id);
    if (found && found.card) {
      const { bg, w, h } = found.card;
      bg.clear();
      bg.fillStyle(0x14532d, 1);
      bg.lineStyle(2, 0x86efac, 1);
      bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
      bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
    }
    if (this.onCharacterSelected) this.onCharacterSelected(id);
  }

  _deselectCardVisual(bg, w, h) {
    if (!bg) return;
    bg.clear();
    bg.fillStyle(0x0a1508, 0.92);
    bg.lineStyle(1.5, 0x3d6b1a, 0.5);
    bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
    bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
  }

  deselectAll() {
    this.selectedCardId = null;
    this.trayCards.forEach(({ card }) => {
      if (card) this._deselectCardVisual(card.bg, card.w, card.h);
    });
  }

  // ══════════════════════════════════════════════════════════
  //  MENU BUTTON (TOP-RIGHT)
  // ══════════════════════════════════════════════════════════
  _buildMenuButton() {
    const s  = this.scene;
    const BW = 56, BH = 28;
    const BX = this.W - BW - 8;
    const BY = (GW.BOARD.TRAY_HEIGHT - BH) / 2;

    const bg = s.add.graphics().setDepth(35);
    const draw = (hover) => {
      bg.clear();
      bg.fillStyle(hover ? 0x4b5563 : 0x374151, 1);
      bg.lineStyle(1.5, hover ? 0x86efac : 0x4ade80, hover ? 0.9 : 0.5);
      bg.fillRoundedRect(0, 0, BW, BH, 5);
      bg.strokeRoundedRect(0, 0, BW, BH, 5);
    };
    draw(false);
    bg.x = BX; bg.y = BY;

    const label = s.add.text(BX + BW/2, BY + BH/2, 'MENU', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '11px',
      fontStyle:  'bold',
      color:      '#d1fae5',
    }).setOrigin(0.5).setDepth(36);

    const zone = s.add.rectangle(BX + BW/2, BY + BH/2, BW, BH, 0, 0)
      .setDepth(37)
      .setInteractive({ useHandCursor: true });

    zone.on('pointerover',  () => draw(true));
    zone.on('pointerout',   () => draw(false));
    zone.on('pointerdown',  () => {
      if (window.GWAudio) window.GWAudio.play('battle-menu');
      draw(false);
      this._openPauseMenu();
    });

    this.menuBtn     = { bg, label, zone, BX, BY, BW, BH };
    this.menuBtnZone = zone;
  }

  // ══════════════════════════════════════════════════════════
  //  INVASION PROGRESS BAR (BOTTOM)
  //  v1.0.1: renamed from "INVASION TIMELINE", bar shortened
  //  to 400 px and centred, progress smoothly reaches 1.0.
  // ══════════════════════════════════════════════════════════
  _buildTimeline(levelId, markerPositions) {
    const s   = this.scene;
    const TLY = GW.BOARD.TIMELINE_Y;      // 522
    const TLH = GW.BOARD.TIMELINE_HEIGHT; // 55
    const W   = this.W;                   // 960

    // Background strip
    const bg = s.add.graphics().setDepth(28);
    bg.fillStyle(0x050d05, 0.9);
    bg.fillRect(0, TLY, W, TLH);
    bg.lineStyle(1, 0x2d3a2d, 0.6);
    bg.lineBetween(0, TLY, W, TLY);

    const LEVEL_W = 132;
    const GROUP_GAP = 18;
    const BAR_W = 520;
    const TIMER_W = 104;
    const GROUP_X = Math.floor((W - LEVEL_W - GROUP_GAP - BAR_W - GROUP_GAP - TIMER_W) / 2);
    const BAR_MARGIN = GROUP_X + LEVEL_W + GROUP_GAP;
    const TIMER_X = BAR_MARGIN + BAR_W + GROUP_GAP;

    const levelPanel = s.add.graphics().setDepth(29);
    levelPanel.fillStyle(0x0d1a0d, 1);
    levelPanel.lineStyle(1, 0x4ade80, 0.45);
    levelPanel.fillRoundedRect(GROUP_X, TLY + 11, LEVEL_W, 34, 4);
    levelPanel.strokeRoundedRect(GROUP_X, TLY + 11, LEVEL_W, 34, 4);
    s.add.text(GROUP_X + 10, TLY + 16, 'CURRENT LEVEL', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '6px',
      color:      '#86efac',
      letterSpacing: 1,
    }).setDepth(29);
    this.currentLevelText = s.add.text(GROUP_X + 10, TLY + 27, 'LEVEL ' + (levelId || 1), {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '12px',
      fontStyle:  'bold',
      color:      '#f0fdf4',
    }).setDepth(29);

    const timerPanel = s.add.graphics().setDepth(29);
    timerPanel.fillStyle(0x0d1a0d, 1);
    timerPanel.lineStyle(1, 0x4ade80, 0.45);
    timerPanel.fillRoundedRect(TIMER_X, TLY + 11, TIMER_W, 34, 4);
    timerPanel.strokeRoundedRect(TIMER_X, TLY + 11, TIMER_W, 34, 4);
    s.add.text(TIMER_X + 10, TLY + 16, 'RUN TIME', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '6px',
      color:      '#86efac',
      letterSpacing: 1,
    }).setDepth(29);
    this.runtimeText = s.add.text(TIMER_X + 10, TLY + 27, '0:00', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '12px',
      fontStyle:  'bold',
      color:      '#f0fdf4',
    }).setDepth(29);

    s.add.text(BAR_MARGIN + BAR_W / 2, TLY + 4, 'INVASION TIMELINE', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '7px',
      color:      '#4a5a3a',
      letterSpacing: 1,
    }).setOrigin(0.5, 0).setDepth(29);

    const BAR_H = 8;
    const BAR_Y = TLY + 32;

    const barBg = s.add.graphics().setDepth(29);
    barBg.fillStyle(0x0d1a0d, 1);
    barBg.fillRoundedRect(BAR_MARGIN, BAR_Y, BAR_W, BAR_H, 4);
    barBg.lineStyle(1, 0x2d3a2d, 0.5);
    barBg.strokeRoundedRect(BAR_MARGIN, BAR_Y, BAR_W, BAR_H, 4);

    this.timelineBar = s.add.graphics().setDepth(30);
    this._drawTimelineProgress(0);

    // Wave flag markers
    this._waveMarkers = [];
    const waveCount = this._totalWaves;
    const bossMission = !!(GW.LEVELS[levelId] && GW.LEVELS[levelId].isBossLevel && waveCount === 6);
    for (let i = 0; i < waveCount; i++) {
      // v1.0.1 fix: for a single-wave level pct = 1.0 so the marker sits at
      // the far-right end of the bar and progress correctly reaches it.
      const pct = markerPositions && Number.isFinite(markerPositions[i])
        ? markerPositions[i]
        : bossMission && i < 5
        ? ((i + 1) * 6) / 35
        : (waveCount === 1 ? 1 : (i + 1) / waveCount);
      const mx     = BAR_MARGIN + BAR_W * pct;
      const isLast = (i === waveCount - 1);

      const marker = s.add.graphics().setDepth(31);
      marker.fillStyle(isLast ? 0xef4444 : 0xfbbf24, 0.9);
      marker.fillCircle(mx, BAR_Y + BAR_H / 2, isLast ? 6 : 4);

      const wLabel = isLast ? (bossMission ? 'BOSS' : 'FINAL') : ('W' + (i + 1));
      s.add.text(mx, BAR_Y - 3, wLabel, {
        fontFamily: '"Exo 2", monospace',
        fontSize:   '6px',
        color:      isLast ? '#fca5a5' : '#fde68a',
        align:      'center',
      }).setOrigin(0.5, 1).setDepth(31);

      this._waveMarkers.push({ marker, pct, x: mx, y: BAR_Y + BAR_H / 2 });
    }

    // Store bar geometry for draw helpers
    this._BAR_MARGIN = BAR_MARGIN;
    this._BAR_W      = BAR_W;
    this._BAR_Y      = BAR_Y;
    this._BAR_H      = BAR_H;

    this.timelineMarker = s.add.graphics().setDepth(33);
    this._drawAlienMarker(0);
  }

  _drawTimelineProgress(progress) {
    if (!this.timelineBar) return;
    const g   = this.timelineBar;
    const W   = this._BAR_W  || (this.W - 24);
    const M   = this._BAR_MARGIN || 12;
    const Y   = this._BAR_Y  || (GW.BOARD.TIMELINE_Y + 22);
    const H   = this._BAR_H  || 8;

    g.clear();
    const fillW = Math.max(0, Math.min(W * progress, W));
    if (fillW > 0) {
      g.fillStyle(0x4ade80, 0.7);
      g.fillRoundedRect(M, Y, fillW, H, 4);
    }
  }

  _drawAlienMarker(progress) {
    if (!this.timelineMarker) return;
    const g = this.timelineMarker;
    const M = this._BAR_MARGIN || 12;
    const W = this._BAR_W      || (this.W - 24);
    const BY = this._BAR_Y     || (GW.BOARD.TIMELINE_Y + 22);
    const BH = this._BAR_H     || 8;
    const x = M + W * Math.max(0, Math.min(progress, 1));
    const y = BY + BH / 2;

    g.clear();
    // Alien head — compact to fit the 6px bar
    // Outer glow
    g.fillStyle(0x7c3aed, 0.3);
    g.fillCircle(x, y, 8);
    // Head
    g.fillStyle(0x7c3aed, 1);
    g.fillCircle(x, y, 6);
    // Eyes
    g.fillStyle(0x00ff88, 1);
    g.fillCircle(x - 2, y - 1, 1.5);
    g.fillCircle(x + 2, y - 1, 1.5);
    // Spine ridges (top) — 3 small nubs
    g.fillStyle(0xc4b5fd, 0.8);
    for (let i = -1; i <= 1; i++) {
      g.fillTriangle(x + i * 3, y - 6, x + i * 3 - 2, y - 9, x + i * 3 + 2, y - 9);
    }

    // Warning glow when near final wave
    if (progress > 0.8) {
      g.lineStyle(1.5, 0xef4444, 0.8);
      g.strokeCircle(x, y, 8);
    }
  }

  /** Update invasion progress. Call when a wave starts or clears.
   *  v1.0.1: for a 1-wave level totalWaves===1, so we pass progress directly
   *  (0 at start, 1.0 when the wave clears) rather than dividing by zero. */
  updateTimeline(progress) {
    this._currentProgress = Math.max(0, Math.min(1, progress));
    this._drawTimelineProgress(this._currentProgress);
    this._drawAlienMarker(this._currentProgress);

    // Highlight the reached wave markers
    this._waveMarkers.forEach(({ marker, pct }, i) => {
      if (pct <= this._currentProgress + 0.01) {
        marker.clear();
        const isLast = (i === this._waveMarkers.length - 1);
        marker.fillStyle(isLast ? 0xef4444 : 0x86efac, 1);
        marker.fillCircle(
          this._BAR_MARGIN + this._BAR_W * pct,
          this._BAR_Y + this._BAR_H / 2,
          isLast ? 7 : 5
        );
      }
    });
  }

  updateRuntime(elapsedMs) {
    if (!this.runtimeText) return;
    const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
    if (totalSeconds === this._runtimeDisplayedSeconds) return;
    this._runtimeDisplayedSeconds = totalSeconds;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    this.runtimeText.setText(minutes + ':' + seconds);
  }

  // ══════════════════════════════════════════════════════════
  //  BANNER (mid-screen temporary announcements)
  // ══════════════════════════════════════════════════════════
  _buildBanner() {
    this.bannerText = this.scene.add.text(this.W / 2, this.H / 2 - 60, '', {
      fontFamily:      '"Exo 2", monospace',
      fontSize:        '28px',
      fontStyle:       'bold',
      color:           GW.UI_COLORS.GREEN_BRIGHT,
      stroke:          '#000',
      strokeThickness: 4,
      align:           'center',
    }).setOrigin(0.5).setDepth(42).setAlpha(0);

    // Larger variant used for high-priority warnings (e.g. horde approach)
    this.bigBannerText = this.scene.add.text(this.W / 2, this.H / 2 - 50, '', {
      fontFamily:      '"Exo 2", monospace',
      fontSize:        '22px',
      fontStyle:       'bold',
      color:           GW.UI_COLORS.TEXT_DANGER,
      stroke:          '#000',
      strokeThickness: 5,
      align:           'center',
      wordWrap:        { width: this.W - 80 },
    }).setOrigin(0.5).setDepth(43).setAlpha(0);
  }

  showBanner(text, color, duration) {
    color    = color    || GW.UI_COLORS.GREEN_BRIGHT;
    duration = duration || 1800;
    this.scene.tweens.killTweensOf(this.bannerText);
    this.bannerText.setText(text).setColor(color).setAlpha(0);
    this.scene.tweens.add({
      targets:  this.bannerText,
      alpha:    1,
      duration: 50,
      ease:     'Linear',
      onComplete: () => {
        this.scene.tweens.add({
          targets:  this.bannerText,
          alpha:    0,
          delay:    Math.max(0, duration - 400),
          duration: 350,
          ease:     'Power1',
        });
      },
    });
  }

  /**
   * Show the high-priority warning banner (larger, red, word-wrapped).
   * Used for the horde approach warning.
   */
  showBigBanner(text, duration) {
    duration = duration || 2200;
    if (!this.bigBannerText) return;
    // Kill any running tween on this object first
    this.scene.tweens.killTweensOf(this.bigBannerText);
    this.bigBannerText.setText(text).setAlpha(1);
    // Shake the text slightly for urgency
    this.scene.tweens.add({
      targets:  this.bigBannerText,
      x:        this.W / 2 + 4,
      duration: 60,
      yoyo:     true,
      repeat:   5,
      ease:     'Linear',
    });
    this.scene.tweens.add({
      targets:  this.bigBannerText,
      alpha:    0,
      delay:    duration - 400,
      duration: 400,
      ease:     'Power1',
    });
  }

  // ══════════════════════════════════════════════════════════
  //  GRID OVERLAY (placement helper)
  // ══════════════════════════════════════════════════════════
  _buildGridOverlay() {
    this.gridOverlay = this.scene.add.graphics().setDepth(5);
    this._drawGrid(false, -1, -1);
  }

  _drawGrid(showHover, hoverLane, hoverCell) {
    const g = this.gridOverlay;
    const b = GW.BOARD;
    g.clear();
    for (let lane = 1; lane <= b.LANES; lane++) {
      for (let ci = 0; ci < b.CELLS_PER_LANE; ci++) {
        const cx = b.PLACEMENT_START_X + ci * b.CELL_WIDTH;
        const cy = b.TOP_OFFSET + (lane - 1) * b.LANE_HEIGHT;
        const isHover = showHover && lane === hoverLane && ci === hoverCell;
        g.fillStyle(0x86efac, isHover ? 0.14 : 0.03);
        g.lineStyle(1, 0x86efac, isHover ? 0.5 : 0.06);
        g.fillRect(cx - b.CELL_WIDTH / 2, cy, b.CELL_WIDTH, b.LANE_HEIGHT);
        g.strokeRect(cx - b.CELL_WIDTH / 2, cy, b.CELL_WIDTH, b.LANE_HEIGHT);
      }
    }
  }

  updateGridHover(worldX, worldY, cardSelected) {
    if (!cardSelected) { this._drawGrid(false, -1, -1); return; }
    const cell = GW.Collision.worldToCell(worldX, worldY);
    if (cell) this._drawGrid(true, cell.lane, cell.cellIndex);
    else       this._drawGrid(false, -1, -1);
  }

  // ══════════════════════════════════════════════════════════
  //  PAUSE MENU
  // ══════════════════════════════════════════════════════════
  _openPauseMenu() {
    if (this.isPaused) {
      this._closePauseMenu();
      return;
    }
    this.isPaused = true;
    if (this.scene._paused !== undefined) this.scene._paused = true;
    if (this.scene.time) this.scene.time.paused = true;
    if (this.scene.tweens && this.scene.tweens.pauseAll) this.scene.tweens.pauseAll();
    if (this.scene._saveBattleSnapshot) this.scene._saveBattleSnapshot();
    this._buildPauseOverlay();
    window.dispatchEvent(new Event('gw:pause-open'));
    if (this.onMenuPressed) this.onMenuPressed();
  }

  _closePauseMenu() {
    this.isPaused = false;
    if (this.scene._paused !== undefined) this.scene._paused = false;
    this.scene._battleSnapshotSaved = false;
    if (this.scene.time) this.scene.time.paused = false;
    if (this.scene.tweens && this.scene.tweens.resumeAll) this.scene.tweens.resumeAll();
    if (this._pauseOverlay) {
      this._pauseOverlay.destroy(true);
      this._pauseOverlay = null;
    }
    window.dispatchEvent(new Event('gw:pause-close'));
    if (this.onPauseResume) this.onPauseResume();
  }

  async _saveAndQuit() {
    if (this._saveQuitPending) return;
    this._saveQuitPending = true;
    try {
      if (this.scene._saveBattleSnapshot) await this.scene._saveBattleSnapshot(true);
    } catch (error) {
      console.warn('[Game] Cloud checkpoint failed; local checkpoint remains available.', error);
    }
    if (this.onPauseQuit) this.onPauseQuit();
  }

  _buildPauseOverlay() {
    const s = this.scene;
    const W = this.W, H = this.H;

    const container = s.add.container(0, 0).setDepth(90);
    this._pauseOverlay = container;

    // Dim overlay
    const dim = s.add.graphics();
    dim.fillStyle(0x000000, 0.82);
    dim.fillRect(0, 0, W, H);
    container.add(dim);

    // Panel
    const PW = 300, PH = 560;
    const PX = W / 2 - PW / 2;
    const PY = H / 2 - PH / 2;

    const panel = s.add.graphics();
    panel.fillStyle(0x060e06, 0.97);
    panel.lineStyle(2, 0x4ade80, 0.7);
    panel.fillRoundedRect(PX, PY, PW, PH, 12);
    panel.strokeRoundedRect(PX, PY, PW, PH, 12);
    container.add(panel);

    // Title
    const title = s.add.text(W / 2, PY + 22, '— PAUSED —', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '18px',
      fontStyle:  'bold',
      color:      '#86efac',
    }).setOrigin(0.5, 0);
    container.add(title);

    // Buttons
    const options = [
      { label: 'RESUME',        color: 0x15803d, cue: 'battle-menu', cb: () => this._closePauseMenu() },
      { label: 'RESTART LEVEL', color: 0x374151, cue: 'battle-menu', cb: () => { this._closePauseMenu(); if (this.onPauseRestart) this.onPauseRestart(); }},
      { label: 'SAVE & QUIT',   color: 0x7f1d1d, cue: 'battle-menu', cb: () => this._saveAndQuit() },
    ];

    options.forEach((opt, i) => {
      const BW = 220, BH = 40;
      const BX = W / 2 - BW / 2;
      const BY = PY + 68 + i * 52;

      const btnBg = s.add.graphics();
      const drawBtn = (hover) => {
        btnBg.clear();
        btnBg.fillStyle(opt.color, hover ? 1 : 0.85);
        btnBg.lineStyle(1.5, 0x86efac, hover ? 0.8 : 0.3);
        btnBg.fillRoundedRect(0, 0, BW, BH, 8);
        btnBg.strokeRoundedRect(0, 0, BW, BH, 8);
      };
      drawBtn(false);
      btnBg.x = BX; btnBg.y = BY;
      container.add(btnBg);

      const btnTxt = s.add.text(BX + BW/2, BY + BH/2, opt.label, {
        fontFamily: '"Exo 2", monospace',
        fontSize:   '13px',
        fontStyle:  'bold',
        color:      '#ffffff',
      }).setOrigin(0.5);
      container.add(btnTxt);

      const zone = s.add.rectangle(BX + BW/2, BY + BH/2, BW, BH, 0, 0)
        .setInteractive({ useHandCursor: true });
      container.add(zone);

      zone.on('pointerover',  () => drawBtn(true));
      zone.on('pointerout',   () => drawBtn(false));
      zone.on('pointerdown', () => {
        if (window.GWAudio) window.GWAudio.play(opt.cue);
        zone.removeAllListeners(); opt.cb();
        if (opt.label === 'SAVE & QUIT') btnTxt.setText('SAVING...');
      });
    });

    // ── Volume Sliders ──────────────────────────────────────
    const slBase = PY + 68 + options.length * 52 + 10;
    [
      { label: 'MUSIC', key: 'musicVolume', def: 0.6 },
      { label: 'SOUND EFFECTS', key: 'sfxVolume', def: 0.8 },
    ].forEach(function(sl, si) {
      const SY = slBase + si * 50, SX = PX + 20, SW = PW - 40;
      const lbl = s.add.text(SX, SY, sl.label, {
        fontFamily: '"Exo 2", monospace', fontSize: '10px', fontStyle: 'bold', color: '#86efac',
      }).setDepth(92);
      container.add(lbl);
      const track = s.add.graphics().setDepth(92);
      track.fillStyle(0x1a3a1a, 1); track.lineStyle(1, 0x4ade80, 0.3);
      track.fillRoundedRect(SX, SY + 16, SW, 8, 4);
      track.strokeRoundedRect(SX, SY + 16, SW, 8, 4);
      container.add(track);
      const prog = window.GW && window.GW.progression;
      const curV = (prog && prog.state && prog.state.settings && prog.state.settings[sl.key] != null)
                   ? prog.state.settings[sl.key] : sl.def;
      const fill = s.add.graphics().setDepth(93);
      const drawFill = function(v) {
        fill.clear(); fill.fillStyle(0x4ade80, 0.8);
        fill.fillRoundedRect(SX, SY + 16, Math.max(8, SW * v), 8, 4);
      };
      drawFill(curV); container.add(fill);
      const handle = s.add.graphics().setDepth(94);
      handle.fillStyle(0x86efac, 1); handle.fillCircle(0, 0, 8);
      handle.x = SX + SW * curV; handle.y = SY + 20; container.add(handle);
      const valTxt = s.add.text(SX + SW + 10, SY + 20, Math.round(curV * 100) + '%', {
        fontFamily: '"Exo 2", monospace', fontSize: '9px', color: '#9ca3af',
      }).setOrigin(0, 0.5).setDepth(93);
      container.add(valTxt);
      const slZone = s.add.rectangle(SX + SW / 2, SY + 20, SW + 16, 28, 0, 0)
        .setDepth(95).setInteractive({ useHandCursor: true });
      container.add(slZone);
      const upd = function(px) {
        const v = Math.max(0, Math.min(1, (px - SX) / SW));
        drawFill(v); handle.x = SX + SW * v; valTxt.setText(Math.round(v * 100) + '%');
        if (prog && prog.state && prog.state.settings) {
          prog.state.settings[sl.key] = v;
          if (prog.save) prog.save();
          if (window.GWAudio) {
            window.GWAudio.setVolumes(prog.state.settings.musicVolume, prog.state.settings.sfxVolume);
          }
        }
      };
      slZone.on('pointerdown', function(ptr) { upd(ptr.x); });
      slZone.on('pointermove', function(ptr) { if (ptr.isDown) upd(ptr.x); });
    });

    const graphicsOptions = [
      { label: 'RESOLUTION', key: 'resolution', values: ['low', 'standard', 'high'] },
      { label: 'GRAPHICS QUALITY', key: 'graphicsQuality', values: ['performance', 'balanced', 'high'] },
      { label: 'TEXTURES', key: 'textureQuality', values: ['crisp', 'smooth'] },
      { label: 'MODEL / ANIMATION', key: 'modelQuality', values: ['low', 'balanced', 'high'] },
    ];
    const graphicsTop = slBase + 2 * 50 + 4;
    graphicsOptions.forEach((option, index) => {
      const rowY = graphicsTop + index * 38;
      const prog = window.GW && window.GW.progression;
      const defaultValue = option.values[Math.floor(option.values.length / 2)];
      let selected = option.values.indexOf(prog && prog.getSetting(option.key));
      if (selected < 0) selected = option.values.indexOf(defaultValue);

      const label = s.add.text(PX + 20, rowY + 12, option.label, {
        fontFamily: '"Exo 2", monospace', fontSize: '8px', fontStyle: 'bold', color: '#86efac',
      }).setOrigin(0, 0.5).setDepth(92);
      const value = s.add.text(PX + PW - 20, rowY + 12, option.values[selected].toUpperCase(), {
        fontFamily: '"Exo 2", monospace', fontSize: '9px', fontStyle: 'bold', color: '#e8f0ff',
      }).setOrigin(1, 0.5).setDepth(93);
      const zone = s.add.rectangle(W / 2, rowY + 12, PW - 36, 28, 0x0b1e14, 0.65)
        .setDepth(91).setInteractive({ useHandCursor: true });

      container.add([zone, label, value]);
      zone.on('pointerdown', () => {
        selected = (selected + 1) % option.values.length;
        const next = option.values[selected];
        value.setText(next.toUpperCase());
        if (window.GWGraphics) window.GWGraphics.saveSetting(option.key, next);
        else if (prog) {
          prog.setSetting(option.key, next);
        }
      });
    });
  }

  // ════════════════════════════════════════
  //  SCORE
  // ══════════════════════════════════════════════════════════
  // forward-only alien-head position driver
  /** Move the alien head. Progress is clamped to never decrease. */
  updateTimelineHead(progress) {
    const p = Math.max(0, Math.min(1, progress));
    this._currentProgress = p;
    this._drawTimelineProgress(p);
    this._drawAlienMarker(p);
    this._waveMarkers.forEach(({ marker, pct }, i) => {
      if (pct > p + 0.01) return;
      marker.clear();
      const isLast = i === this._waveMarkers.length - 1;
      marker.fillStyle(isLast ? 0xef4444 : 0x86efac, 1);
      marker.fillCircle(
        this._BAR_MARGIN + this._BAR_W * pct,
        this._BAR_Y + this._BAR_H / 2,
        isLast ? 7 : 5
      );
    });
  }

  /**
   * Light up the wave-flag marker nearest to markerFraction (0.0-1.0).
   * Also advances the head to at least that position.
   */
  highlightTimelineMarker(markerFraction) {
    if (!this._waveMarkers || !this._waveMarkers.length) return;
    let best = null, bestDist = Infinity;
    this._waveMarkers.forEach(function(m) {
      const d = Math.abs(m.pct - markerFraction);
      if (d < bestDist) { bestDist = d; best = m; }
    });
    if (!best) return;
    // Glow the marker
    const isLast = Math.abs(best.pct - 1.0) < 0.02;
    best.marker.clear();
    best.marker.fillStyle(isLast ? 0xef4444 : 0x86efac, 1);
    best.marker.fillCircle(
      this._BAR_MARGIN + this._BAR_W * best.pct,
      this._BAR_Y + this._BAR_H / 2,
      isLast ? 8 : 6
    );
  }

  updateScore(score) {
    if (this.scoreText) this.scoreText.setText('SCORE: ' + score);
  }

  // ══════════════════════════════════════════════════════════
  //  STATUS (brief status line — used sparingly)
  // ══════════════════════════════════════════════════════════
  setStatus(text) {
    // Display brief status as a short banner rather than permanent text
    if (text) this.showBanner(text, GW.UI_COLORS.TEXT_DIM, 2200);
  }

  // Legacy compat
  updateWaveDisplay() { /* replaced by timeline */ }
  showCountdown()     { /* replaced by timeline */ }
  get energyText()    { return this.plasmaText; }

  // ══════════════════════════════════════════════════════════
  //  COOLDOWN SYSTEM
  // ══════════════════════════════════════════════════════════
  /**
   * Start the deployment cooldown for a card.
   * Called by the scene immediately after a successful placement.
   * @param {string} cardId
   */
  startCooldown(cardId) {
    const def = GW.CARDS && GW.CARDS[cardId];
    if (!def || !def.deployCooldown) return;   // card has no cooldown configured

    this._cooldowns[cardId] = def.deployCooldown;

    // Force-deselect the card if it's currently held
    if (this.selectedCardId === cardId) {
      this.selectedCardId = null;
      if (this.onCharacterSelected) this.onCharacterSelected(null);
      this.deselectAll();
    }

    // Show the overlay immediately
    this._refreshCooldownVisual(cardId);
  }

  /**
   * Tick all active cooldowns. Called every game-loop frame by GameScene.
   * @param {number} delta — ms since last frame
   */
  updateCooldowns(delta) {
    Object.keys(this._cooldowns).forEach(cardId => {
      if (this._cooldowns[cardId] <= 0) return;
      this._cooldowns[cardId] -= delta;
      if (this._cooldowns[cardId] <= 0) {
        this._cooldowns[cardId] = 0;
      }
      this._refreshCooldownVisual(cardId);
    });
  }

  /**
   * Update the overlay + countdown text for a single card.
   * @param {string} cardId
   */
  _refreshCooldownVisual(cardId) {
    const entry = this.trayCards.find(c => c.id === cardId);
    if (!entry || !entry.card) return;
    const { cdOverlay, cdText, bg, w, h } = entry.card;
    if (!cdOverlay || !cdText) return;

    const remaining = this._cooldowns[cardId] || 0;
    const active    = remaining > 0;

    cdOverlay.setVisible(active);
    cdText.setVisible(active);

    if (active) {
      // Show seconds with one decimal, e.g. "7.4"
      cdText.setText((remaining / 1000).toFixed(1));
      // Redraw card bg in a dimmed/greyed style while on cooldown
      if (bg) {
        bg.clear();
        bg.fillStyle(0x050a05, 0.95);
        bg.lineStyle(1.5, 0x4b5563, 0.5);
        bg.fillRoundedRect(-w/2, -h/2, w, h, 4);
        bg.strokeRoundedRect(-w/2, -h/2, w, h, 4);
      }
    } else {
      // Cooldown finished — restore normal card appearance
      if (bg) this._deselectCardVisual(bg, w, h);
    }
  }

  // ══════════════════════════════════════════════════════════
  //  WIN / LOSE SCREENS
  // ══════════════════════════════════════════════════════════
  /**
   * Victory screen with card reward, next level, play again, main menu.
   * @param {object}   playerState
   * @param {number}   levelId
   * @param {string|null} cardId       - reward card id (null = no card this level)
   * @param {Function} onPlayAgain     - restart same level
   * @param {Function} onMainMenu      - go to main menu
   * @param {Function|null} onNextLevel - go to next level (null if no next level)
   */
  showWinScreen(playerState, levelId, cardId, onPlayAgain, onMainMenu, onNextLevel) {
    const lvl     = (window.GW && window.GW.LEVELS && window.GW.LEVELS[levelId]) || null;
    const nextId  = levelId + 1;
    const nextLvl = window.GW && window.GW.LEVELS && window.GW.LEVELS[nextId];
    const hasNext = !!(onNextLevel && nextLvl);
    const cardDef = cardId && window.GW && window.GW.CARDS ? window.GW.CARDS[cardId] : null;
    const cm      = window.GW && window.GW.cardManager;
    const pendingCard = !!(cardId && cm && cm.hasPendingClaim && cm.hasPendingClaim());

    // ── Info lines ──────────────────────────────────────────
    const lines = [
      'LEVEL ' + levelId + (lvl ? (': ' + lvl.name.toUpperCase()) : '') + ' — COMPLETE',
      'Aliens Defeated: ' + (playerState.enemiesDefeated || 0),
      'Score: '           + (playerState.score || 0),
    ];

    if (pendingCard && cardDef) {
      lines.push('');
      lines.push('\u2605  NEW CARD UNLOCKED  \u2605');
      lines.push(cardDef.name.toUpperCase());
    } else if (hasNext) {
      lines.push('');
      lines.push('Level ' + nextId + ' is now unlocked!');
    } else if (!hasNext && !cardDef) {
      lines.push('Sector secured. Outstanding work, Commander.');
    }

    // ── Button layout ───────────────────────────────────────
    // Priority:
    //   [CLAIM CARD] if reward pending
    //   [NEXT LEVEL] if next level exists and no pending claim
    //   [PLAY AGAIN] always
    //   [MAIN MENU]  always
    const callbacks = [];

    if (pendingCard) {
      const claimLabel = cardDef
        ? '\u2605 CLAIM: ' + cardDef.name.toUpperCase() + ' \u25b6'
        : '\u2605 CLAIM REWARD \u25b6';
      callbacks.push({
        label: claimLabel,
        color: 0xd97706,
        cue: 'victory-claim',
        cb: () => {
          if (cm) cm.claimPendingCard();
          // After claiming, go to next level if available, otherwise replay
          if (onNextLevel) onNextLevel();
          else if (onPlayAgain) onPlayAgain();
        },
      });
    } else if (hasNext) {
      const nextName = nextLvl && nextLvl.name ? nextLvl.name.toUpperCase() : 'LEVEL ' + nextId;
      callbacks.push({
        label: 'NEXT LEVEL \u2192 ' + nextName,
        color: 0x166534,
        cue: 'victory-next',
        cb: onNextLevel,
      });
    }

    callbacks.push({ label: 'PLAY AGAIN',   color: 0x374151, cue: 'victory-replay', cb: onPlayAgain });
    callbacks.push({ label: 'SAVE & QUIT',  color: 0x1e3a5f, cue: 'victory-menu', cb: onMainMenu  });

    this._showEndScreen({
      title:      'SECTOR SECURED!',
      titleColor: GW.UI_COLORS.GREEN_BRIGHT,
      lines,
      buttons:    callbacks,
    });
  }
  showLoseScreen(onRetry, onMainMenu) {
    const s = this.scene;
    const W = this.W, H = this.H;

    // Full dim
    const dim = s.add.graphics().setDepth(50);
    dim.fillStyle(0x000000, 0.88);
    dim.fillRect(0, 0, W, H);

    // Large red "GAME OVER" at the top of the screen
    s.add.text(W / 2, 38, 'GAME OVER', {
      fontFamily:      '"Exo 2", monospace',
      fontSize:        '52px',
      fontStyle:       'bold',
      color:           '#ef4444',
      stroke:          '#000',
      strokeThickness: 6,
      align:           'center',
    }).setOrigin(0.5, 0).setDepth(52);

    // Panel box (smaller — just body text + 2 buttons)
    const PW = 420, PH = 200;
    const PX = W / 2 - PW / 2;
    const PY = H / 2 - PH / 2 + 20;

    const panel = s.add.graphics().setDepth(51);
    panel.fillStyle(0x0a0505, 0.97);
    panel.lineStyle(2, 0xef4444, 0.8);
    panel.fillRoundedRect(PX, PY, PW, PH, 12);
    panel.strokeRoundedRect(PX, PY, PW, PH, 12);

    // Body text
    s.add.text(W / 2, PY + 30, 'YOUR BASE HAS BEEN BREACHED', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '14px',
      fontStyle:  'bold',
      color:      '#fca5a5',
      stroke:     '#000',
      strokeThickness: 2,
      align:      'center',
    }).setOrigin(0.5, 0).setDepth(52);

    s.add.text(W / 2, PY + 58, 'The aliens have overrun the perimeter.\nReinforce every lane and try again.', {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '11px',
      color:      '#9ca3af',
      align:      'center',
    }).setOrigin(0.5, 0).setDepth(52);

    // Buttons side-by-side
    const BTN_W = 160, BTN_H = 44;
    const gap   = 16;
    const totalBW = BTN_W * 2 + gap;
    const bStartX = W / 2 - totalBW / 2;
    const bY      = PY + PH - BTN_H - 18;

    this._makeEndBtn(bStartX, bY, BTN_W, BTN_H, 'TRY AGAIN', 0x15803d, onRetry, 'defeat-retry');
    this._makeEndBtn(bStartX + BTN_W + gap, bY, BTN_W, BTN_H, 'MAIN MENU', 0x1e3a5f, onMainMenu, 'defeat-menu');
  }

  _showEndScreen({ title, titleColor, lines, buttons }) {
    const s = this.scene;
    const W = this.W, H = this.H;

    const dim = s.add.graphics().setDepth(50);
    dim.fillStyle(0x000000, 0.85);
    dim.fillRect(0, 0, W, H);

    const PW = 440, PH = 60 + lines.length * 26 + 60 + buttons.length * 54;
    const panel = s.add.graphics().setDepth(51);
    const bCol  = titleColor === GW.UI_COLORS.TEXT_DANGER ? 0xef4444 : 0x86efac;
    panel.fillStyle(0x060e06, 0.97);
    panel.lineStyle(2, bCol, 0.8);
    panel.fillRoundedRect(W/2 - PW/2, H/2 - PH/2, PW, PH, 14);
    panel.strokeRoundedRect(W/2 - PW/2, H/2 - PH/2, PW, PH, 14);

    s.add.text(W/2, H/2 - PH/2 + 22, title, {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '24px',
      fontStyle:  'bold',
      color:      titleColor,
      stroke:     '#000',
      strokeThickness: 3,
    }).setOrigin(0.5, 0).setDepth(52);

    lines.forEach((line, i) => {
      s.add.text(W/2, H/2 - PH/2 + 58 + i * 26, line, {
        fontFamily: '"Exo 2", monospace',
        fontSize:   '12px',
        color:      GW.UI_COLORS.TEXT_PRIMARY,
        align:      'center',
      }).setOrigin(0.5, 0).setDepth(52);
    });

    const BTN_W = 180, BTN_H = 42;
    const btnsTop = H/2 + PH/2 - buttons.length * 52 - 8;

    buttons.forEach((btn, i) => {
      const bx = W/2 - BTN_W/2;
      const by = btnsTop + i * 52;
      this._makeEndBtn(bx, by, BTN_W, BTN_H, btn.label, btn.color, btn.cb, btn.cue);
    });
  }

  _makeEndBtn(x, y, w, h, label, color, callback, cue) {
    const s = this.scene;
    const D = 53;
    const bg = s.add.graphics().setDepth(D);
    const draw = (hover) => {
      bg.clear();
      bg.fillStyle(color, hover ? 1 : 0.85);
      bg.lineStyle(1.5, 0x86efac, hover ? 0.8 : 0.3);
      bg.fillRoundedRect(0, 0, w, h, 8);
      bg.strokeRoundedRect(0, 0, w, h, 8);
    };
    draw(false);
    bg.x = x; bg.y = y;

    const txt = s.add.text(x + w/2, y + h/2, label, {
      fontFamily: '"Exo 2", monospace',
      fontSize:   '13px', fontStyle: 'bold', color: '#ffffff',
    }).setOrigin(0.5).setDepth(D + 1);

    const zone = s.add.rectangle(x + w/2, y + h/2, w, h, 0, 0)
      .setDepth(D + 2).setInteractive({ useHandCursor: true });

    zone.on('pointerover',  () => draw(true));
    zone.on('pointerout',   () => draw(false));
    zone.on('pointerdown',  () => {
      if (window.GWAudio && cue) window.GWAudio.play(cue);
      zone.removeAllListeners(); callback();
    });

    return { bg, txt, zone };
  }
};
