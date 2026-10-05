/**
 * Garden Warfare: Reborn - Galactic Currency System
 * Coin pill positioned LEFT of MENU button, centred in top tray.
 */
/* global GW, Phaser */

GW.CurrencyDrop = class CurrencyDrop {
  constructor(scene, x, y, typeDef, onCollect, lifetime) {
    this.scene = scene; this.x = x; this.y = y;
    this.typeDef = typeDef; this.onCollect = onCollect; this.active = true;
    this.lifetime = lifetime || (GW.CURRENCY && GW.CURRENCY.LIFETIME) || 14000;
    this._build(); this._startLifetime();
  }
  _build() {
    const td = this.typeDef;
    this.gfxOuter = this.scene.add.graphics().setDepth(16);
    this.gfxOuter.fillStyle(td.glowColor, 0.25); this.gfxOuter.fillCircle(0,0,16);
    this.gfxOuter.x = this.x; this.gfxOuter.y = this.y;
    this.gfxCore = this.scene.add.graphics().setDepth(17);
    if (td.id === "coin_bag") {
      this.gfxCore.fillStyle(td.color, 0.95); this.gfxCore.fillRoundedRect(-8,-7,16,15,5);
      this.gfxCore.lineStyle(2, td.glowColor, 0.8); this.gfxCore.lineBetween(-5,-7,5,-7);
      this.gfxCore.lineBetween(-4,-10,4,-10);
    } else {
      this.gfxCore.fillStyle(td.color, 0.95); this.gfxCore.fillCircle(0,0,9);
      this.gfxCore.fillStyle(td.glowColor, 0.55); this.gfxCore.fillCircle(-2,-2,3);
    }
    this.gfxCore.x = this.x; this.gfxCore.y = this.y;
    const col = "#" + td.glowColor.toString(16).padStart(6,"0");
    this.label = this.scene.add.text(this.x, this.y-16, "+" + td.value + "G", {
      fontFamily: "\"Exo 2\", monospace", fontSize: "8px", fontStyle: "bold", color: col,
    }).setOrigin(0.5,1).setDepth(17);
    this.scene.tweens.add({ targets:[this.gfxOuter,this.gfxCore,this.label],
      y:"-=5", duration:700, ease:"Sine.easeInOut", yoyo:true, repeat:-1 });
    this.scene.tweens.add({ targets:this.gfxOuter,
      alpha:0.55, scaleX:1.3, scaleY:1.3, duration:600, ease:"Sine.easeInOut", yoyo:true, repeat:-1 });
    this.hitZone = this.scene.add.circle(this.x,this.y,18,0x000000,0).setDepth(17).setInteractive({useHandCursor:true});
    this.hitZone.on("pointerdown", () => this._collect());
    this.hitZone.on("pointerover", () => this.gfxCore.setAlpha(0.7));
    this.hitZone.on("pointerout",  () => this.gfxCore.setAlpha(1));
  }
  _startLifetime() {
    const lifetime = this.lifetime;
    this._warnTimer = this.scene.time.delayedCall(lifetime * 0.65, () => {
      if (!this.active) return;
      this.scene.tweens.add({ targets:[this.gfxOuter,this.gfxCore,this.label], alpha:0.3, duration:250, yoyo:true, repeat:5 });
    });
    this._expireTimer = this.scene.time.delayedCall(lifetime, () => { if (this.active) this._expire(); });
  }
  _collect() {
    if (!this.active) return; this.active = false;
    if (window.GWAudio) window.GWAudio.play('coin-collect');
    if (this._warnTimer)  this._warnTimer.remove(false);
    if (this._expireTimer) this._expireTimer.remove(false);
    const dur = (GW.CURRENCY && GW.CURRENCY.FLOAT_DURATION) || 800;
    const mgr = this.scene && this.scene.currencyManager;
    const targetX = (mgr && mgr._coinTargetX) || (GW.DISPLAY ? GW.DISPLAY.BASE_WIDTH - 113 : 847);
    const targetY = (mgr && mgr._coinTargetY) || 19;
    this.scene.tweens.add({
      targets: [this.gfxCore, this.gfxOuter, this.label],
      x: targetX, y: targetY, alpha:0, scaleX:0.4, scaleY:0.4, duration:dur, ease:"Power2",
      onComplete: () => { this._destroyObjects(); if (this.onCollect) this.onCollect(this.typeDef.value); },
    });
  }
  _expire() {
    this.active = false; if (this._warnTimer) this._warnTimer.remove(false);
    this.scene.tweens.add({ targets:[this.gfxOuter,this.gfxCore,this.label], alpha:0, duration:400, ease:"Power1",
      onComplete: () => this._destroyObjects() });
  }
  _destroyObjects() {
    [this.gfxOuter,this.gfxCore,this.label,this.hitZone].forEach(o => { if(o) { try{o.destroy();}catch(_){} } });
    this.gfxOuter=null; this.gfxCore=null; this.label=null; this.hitZone=null;
  }
  destroy() {
    this.active = false;
    if (this._warnTimer)  this._warnTimer.remove(false);
    if (this._expireTimer) this._expireTimer.remove(false);
    this._destroyObjects();
  }
};

GW.CurrencyManager = class CurrencyManager {
  constructor(scene) {
    this.scene = scene; this.drops = [];
    // Restore wallet from saved progression so coins persist across levels and modes
    this.balance = (window.GW && window.GW.progression)
      ? window.GW.progression.getCurrency()
      : 0;
    this._counterText = null; this._counterIcon = null;
    this._coinTargetX = 0; this._coinTargetY = 0;
  }
  buildHUD() {
    const s  = this.scene;
    const W  = GW.DISPLAY ? GW.DISPLAY.BASE_WIDTH  : 960;
    const TH = GW.BOARD   ? GW.BOARD.TRAY_HEIGHT   : 60;
    const D  = 34;
    // Positioned LEFT of MENU button.
    // MENU is at x=W-64 (BX=W-8-56), centred in tray. Coin pill goes W-148 to W-78.
    const CX = W - 150;
    const CY = Math.floor((TH - 22) / 2);
    const pillGfx = s.add.graphics().setDepth(D);
    pillGfx.fillStyle(0x0a1a08, 0.88);
    pillGfx.lineStyle(1, 0xffd700, 0.3);
    pillGfx.fillRoundedRect(CX, CY, 70, 22, 5);
    pillGfx.strokeRoundedRect(CX, CY, 70, 22, 5);
    const iconGfx = s.add.graphics().setDepth(D + 1);
    iconGfx.fillStyle(0xffd700, 0.95); iconGfx.fillCircle(0, 0, 7);
    iconGfx.fillStyle(0xffed4a, 0.55); iconGfx.fillCircle(-2, -2, 3);
    iconGfx.x = CX + 10; iconGfx.y = CY + 11;
    this._counterIcon = iconGfx;
    s.add.text(CX + 10, CY + 11, "G", {
      fontFamily: "\"Exo 2\", monospace", fontSize: "6px", fontStyle: "bold", color: "#1f2937",
    }).setOrigin(0.5).setDepth(D + 2);
    this._counterText = s.add.text(CX + 22, CY + 11, String(this.balance), {
      fontFamily: "\"Exo 2\", monospace", fontSize: "13px", fontStyle: "bold", color: "#ffd700",
    }).setOrigin(0, 0.5).setDepth(D + 1);
    this._coinTargetX = CX + 35;
    this._coinTargetY = CY + 11;
  }
  spawnDrop(x, y, typeDef, lifetime) {
    const drop = new GW.CurrencyDrop(this.scene, x, y, typeDef, (value) => {
      this.collect(value);
      const idx = this.drops.indexOf(drop); if (idx !== -1) this.drops.splice(idx, 1);
    }, lifetime);
    this.drops.push(drop);
  }
  collect(amount) {
    this.balance += amount;
    if (this._counterText) {
      this._counterText.setText(String(this.balance));
      this.scene.tweens.add({ targets:this._counterText, scaleX:1.4, scaleY:1.4, duration:90, yoyo:true, ease:"Power2" });
    }
    if (window.GW && window.GW.progression && window.GW.progression.addCurrency) window.GW.progression.addCurrency(amount);
  }
  update() { this.drops = this.drops.filter(d => d.active); }
  destroyAll() { this.drops.forEach(d => d.destroy()); this.drops = []; }
};
