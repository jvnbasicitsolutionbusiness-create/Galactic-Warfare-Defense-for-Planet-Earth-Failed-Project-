/**
 * Garden Warfare: Reborn — Digital Briefing System
 *
 * Handles two types of level introductions:
 *  1. CREATOR BITOS EVENT (levels 5/15/25/35/45) — portrait + dialogue
 *  2. DIGITAL BRIEFING (every 10th level: 10/20/30/40/50) — terminal-style text ONLY, no portrait
 *  3. STANDARD BRIEFING — simple text/recon for all other levels
 *
 * Renders over the Phaser canvas using DOM overlay for crisp text effects.
 */

/* global GW */

GW.BriefingSystem = class BriefingSystem {
  constructor() {
    this._overlay = null;
    this._resolve  = null;
  }

  /** Show the appropriate briefing for a level. Returns a Promise that resolves when dismissed. */
  show(levelId) {
    const levelDef = GW.LEVELS[levelId];
    if (!levelDef) return Promise.resolve();

    if (levelDef.creatorBitosEvent) {
      return this._showCreatorBitos(levelId);
    }
    if (levelDef.digitalBriefingEvent) {
      return this._showDigitalBriefing(levelId);
    }
    return this._showStandardBriefing(levelId);
  }

  // ── Creator Bitos Event ───────────────────────────────────
  _showCreatorBitos(levelId) {
    const lines = levelId === 5
      ? GW.CREATOR_BITOS.level5Dialogue
      : ['...', 'Pay attention.', 'This level is different.', 'Adapt.'];

    return new Promise(resolve => {
      this._resolve = resolve;
      const el = this._createOverlay('bitos-briefing');
      el.innerHTML = `
        <div class="bitos-portrait" aria-hidden="true">
          <div class="bitos-face">
            <div class="bitos-pixel-head"></div>
            <span class="bitos-name">${GW.CREATOR_BITOS.name}</span>
            <span class="bitos-title">${GW.CREATOR_BITOS.title}</span>
          </div>
        </div>
        <div class="bitos-dialogue" id="bitosDialogue" aria-live="polite"></div>
        <div class="bitos-controls">
          <button class="briefing-btn" id="briefingNext">CONTINUE ▶</button>
        </div>
      `;
      document.body.appendChild(el);

      let lineIndex = 0;
      const dialogueEl = el.querySelector('#bitosDialogue');
      const nextBtn    = el.querySelector('#briefingNext');

      const showLine = () => {
        if (lineIndex >= lines.length) {
          this._dismissOverlay();
          return;
        }
        this._typewriterEffect(dialogueEl, lines[lineIndex], 40);
        lineIndex++;
      };

      nextBtn.addEventListener('click', showLine);
      showLine();
    });
  }

  // ── Digital Briefing (no portrait, terminal style) ────────
  _showDigitalBriefing(levelId) {
    const level = GW.LEVELS[levelId];
    const env   = GW.ENVIRONMENTS[level.environment] || {};
    const tpl   = GW.CREATOR_BITOS.briefingTemplate;

    const envName = env.name || level.environment.toUpperCase();
    const lines = [
      tpl.prefix,
      tpl.separator,
      `LEVEL: ${levelId}`,
      `ENVIRONMENT: [${envName.toUpperCase()}]`,
      `MISSION: ${level.name}`,
      `DIFFICULTY: ${(level.difficulty || 'unknown').toUpperCase()}`,
      tpl.separator,
      `ALIEN THREAT: ELEVATED`,
      `NEW TACTICS REQUIRED.`,
      tpl.separator,
      tpl.suffix,
    ];

    return new Promise(resolve => {
      this._resolve = resolve;
      const el = this._createOverlay('digital-briefing');
      el.innerHTML = `
        <div class="terminal-screen" aria-live="polite">
          <div class="terminal-lines" id="terminalLines"></div>
          <div class="terminal-cursor" id="terminalCursor">█</div>
        </div>
        <button class="briefing-btn" id="briefingDismiss" style="display:none">DEPLOY ▶</button>
      `;
      document.body.appendChild(el);

      const container = el.querySelector('#terminalLines');
      const cursor    = el.querySelector('#terminalCursor');
      const btn       = el.querySelector('#briefingDismiss');

      let i = 0;
      const printNext = () => {
        if (i >= lines.length) {
          cursor.style.display = 'none';
          btn.style.display    = 'block';
          btn.addEventListener('click', () => this._dismissOverlay());
          return;
        }
        const row = document.createElement('div');
        row.className = 'terminal-row';
        container.appendChild(row);
        this._typewriterEffect(row, lines[i], 28, () => {
          i++;
          setTimeout(printNext, 120);
        });
      };
      printNext();
    });
  }

  // ── Standard Briefing ─────────────────────────────────────
  _showStandardBriefing(levelId) {
    const level = GW.LEVELS[levelId];
    return new Promise(resolve => {
      this._resolve = resolve;
      const el = this._createOverlay('standard-briefing');
      el.innerHTML = `
        <div class="std-briefing-panel">
          <div class="std-briefing-header">MISSION BRIEFING — LEVEL ${levelId}</div>
          <div class="std-briefing-title">${level.name}</div>
          <div class="std-briefing-text">${level.briefing || 'Defend the perimeter.'}</div>
          <button class="briefing-btn" id="briefingStart">DEPLOY ▶</button>
        </div>
      `;
      document.body.appendChild(el);
      el.querySelector('#briefingStart').addEventListener('click', () => this._dismissOverlay());
    });
  }

  // ── Helpers ───────────────────────────────────────────────
  _createOverlay(className) {
    const el = document.createElement('div');
    el.id = 'gw-briefing-overlay';
    el.className = `gw-briefing-overlay ${className}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    this._overlay = el;
    return el;
  }

  _dismissOverlay() {
    if (this._overlay) {
      this._overlay.classList.add('fade-out-fast');
      setTimeout(() => {
        if (this._overlay && this._overlay.parentNode) {
          this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        if (this._resolve) { this._resolve(); this._resolve = null; }
      }, 300);
    }
  }

  /** Animated typewriter text effect. */
  _typewriterEffect(el, text, msPerChar, onComplete) {
    el.textContent = '';
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        el.textContent += text[i++];
        setTimeout(tick, msPerChar + Math.random() * 20);
      } else if (onComplete) {
        onComplete();
      }
    };
    tick();
  }
};

// Global singleton
GW.briefingSystem = new GW.BriefingSystem();
