/**
 * Garden Warfare: Reborn — Card System
 *
 * Manages:
 *  - 52-card military collection
 *  - Card claim/reveal interaction (manual, after level victory)
 *  - Card unlock status tied to progression
 *  - Card selection tray for battle
 *
 * CARD COUNT: 2 starting + 49 adventure + 1 boss = 52 total (validated in config.js)
 */

/* global GW */

GW.CardManager = class CardManager {
  constructor(progressionManager) {
    this.prog = progressionManager;
    // pendingClaim: card to be revealed after level
    this.pendingClaim = null;
  }

  // ── Claim system ──────────────────────────────────────────
  /** Set a card as pending claim (shown on victory screen). */
  setPendingClaim(cardId) {
    this.pendingClaim = cardId || null;
  }

  /** Called when player clicks to claim after victory. */
  claimPendingCard() {
    if (!this.pendingClaim) return null;
    const id = this.pendingClaim;
    this.pendingClaim = null;
    if (!this.isCardClaimed(id)) {
      this.prog.state.claimedCards.push(id);
      this.prog.save();
    }
    return id;
  }

  hasPendingClaim() { return !!this.pendingClaim; }

  // ── Status queries ────────────────────────────────────────
  isCardClaimed(cardId) {
    return this.prog.state.claimedCards.includes(cardId);
  }

  getClaimedCards() {
    return this.prog.state.claimedCards
      .map(id => GW.CARDS[id])
      .filter(Boolean);
  }

  getLockedCards() {
    return Object.values(GW.CARDS).filter(c => !this.isCardClaimed(c.id));
  }

  /**
   * Cards available for deployment in a specific level.
   * Returns all CLAIMED cards the player owns, prioritising the level's whitelist.
   * This ensures newly unlocked cards (from previous level rewards) appear here.
   */
  getAvailableForLevel(levelId) {
    const lvl = GW.LEVELS[levelId];
    if (!lvl) return [];
    // Start with level whitelist; add any additional claimed cards on top
    const whitelist    = lvl.availableDefenders || [];
    const claimedIds   = this.prog.getClaimedCardIds ? this.prog.getClaimedCardIds() : [];
    const poolSet      = new Set([...whitelist, ...claimedIds]);
    return Array.from(poolSet)
      .map(id => GW.CARDS[id])
      .filter(c => c && this.isCardClaimed(c.id))
      .slice(0, GW.LOADOUT.MAX_CARDS);
  }

  /** Full collection — claimed + locked with silhouette status. */
  getFullCollection() {
    return Object.values(GW.CARDS).map(card => ({
      ...card,
      claimed:   this.isCardClaimed(card.id),
      pending:   this.pendingClaim === card.id,
    }));
  }

  // ── Validation ────────────────────────────────────────────
  getCardCount() {
    const all       = Object.values(GW.CARDS);
    const starting  = all.filter(c => c.unlockLevel === 'start').length;
    const adventure = all.filter(c => typeof c.unlockLevel === 'number' && !c.isBossReward).length;
    const boss      = all.filter(c => c.isBossReward).length;
    return { total: all.length, starting, adventure, boss };
  }

  /** Get card definition by id — safe getter. */
  static getCard(id) {
    return GW.CARDS[id] || null;
  }
};
