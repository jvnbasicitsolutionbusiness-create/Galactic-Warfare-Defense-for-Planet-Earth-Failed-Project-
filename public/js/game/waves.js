/**
 * Garden Warfare: Reborn — Wave Manager
 *
 * Spawn modes:
 *  1. Normal (default)    — each enemy entry has a `delay` ms offset from wave start.
 *  2. halfHpChain:true    — first scouts are health-gated; later entries arrive in paced groups.
 *  3. isHorde:true        — flag bearer leads, followed by paced single/pair/triple arrivals.
 */

/* global GW */

GW.WaveManager = class WaveManager {
  constructor(scene, combatManager, waves) {
    this.scene         = scene;
    this.combatManager = combatManager;
    this.waves         = waves || [];

    this.currentWaveIndex  = -1;
    this.totalWaves        = this.waves.length;
    this.state             = 'waiting';
    this.started           = false;

    this.initialTimer    = GW.WAVES.INITIAL_DELAY;   // 20s before first alien
    this.betweenTimer    = 0;
    this._spawnTimers    = [];
    this._spawnedCount   = 0;
    this._totalInWave    = 0;
    this._spawnedEntryIndexes = [];
    this._hordeReleaseScheduled = false;
    this._hordeReleaseTimer = null;

    // Half-HP chain state
    this._chainIndex     = 0;        // next entry index to spawn in halfHpChain mode
    this._chainEnemy     = null;     // the live Enemy we are waiting on
    this._chainPollTimer = null;     // Phaser timer that polls HP

    this.progress = 0;

    this._totalSpawnedAllWaves   = 0;
    this._totalScheduledAllWaves = 0;

    // Callbacks
    this.onWaveStart    = null;
    this.onWaveClear    = null;
    this.onAllClear     = null;
    this.onCountdown    = null;
    this.onFlagAlien    = null;
    this.onAlienSpawned = null;
    this.onHordeWarning = null;
    this.onHordeApproach = null;
  }

  start() {
    this.started = true;
    this.state   = 'initial_wait';
    this._totalScheduledAllWaves = this.waves.reduce(
      (sum, w) => sum + (w.enemies ? w.enemies.length : 0), 0
    );
    this._totalSpawnedAllWaves = 0;
  }

  update(delta) {
    if (!this.started || this.state === 'done') return;

    if (this.state === 'initial_wait') {
      this.initialTimer -= delta;
      if (this.initialTimer <= 0) this._beginWave(0);
      return;
    }

    if (this.state === 'between') {
      if (this._hordeReleaseScheduled) return;
      this.betweenTimer -= delta;
      if (this.onCountdown) this.onCountdown(Math.max(0, Math.ceil(this.betweenTimer / 1000)));
      if (this.betweenTimer <= 0) {
        const nextIndex = this.currentWaveIndex + 1;
        const nextWave = this.waves[nextIndex];
        if (nextWave && nextWave.warnBeforeStart) {
          const warningDelay = Math.max(3000, Math.min(5000, nextWave.warningDelay || 5000));
          this._hordeReleaseScheduled = true;
          if (this.onHordeWarning) this.onHordeWarning(nextWave);
          this._hordeReleaseTimer = this.scene.time.delayedCall(warningDelay, () => {
            this._hordeReleaseScheduled = false;
            this._hordeReleaseTimer = null;
            this._beginWave(nextIndex);
            if (this.onHordeApproach) this.onHordeApproach(nextWave);
          });
        } else {
          this._beginWave(nextIndex);
        }
      }
      return;
    }

    if (this.state === 'clearing') {
      if (this.combatManager.activeEnemyCount === 0) this._waveClear();
      return;
    }
    // 'spawning' — managed by delayedCall timers or the HP-chain poll
  }

  // ── Begin a wave ──────────────────────────────────────────
  _beginWave(index) {
    if (index >= this.waves.length) {
      this.state = 'done';
      if (this.onAllClear) this.onAllClear();
      return;
    }

    this.currentWaveIndex = index;
    this._hordeReleaseScheduled = false;
    const waveDef = this.waves[index];
    this.state = 'spawning';

    this.progress = this.totalWaves > 1 ? index / (this.totalWaves - 1) : 0;
    if (this.onWaveStart) this.onWaveStart(index, waveDef);

    const enemies = waveDef.enemies || [];
    this._totalInWave  = enemies.length;
    this._spawnedCount = 0;
    this._spawnedEntryIndexes = [];

    this._cancelSpawnTimers();
    this._stopChainPoll();

    if (enemies.length === 0) {
      this.scene.time.delayedCall(500, () => {
        if (this.state === 'spawning') this.state = 'clearing';
      });
      return;
    }

    // ── Dispatch to the right spawn mode ──────────────────
    if (waveDef.halfHpChain) {
      this._beginHalfHpChain(enemies, waveDef);
    } else if (waveDef.isHorde || waveDef.hordeDelay) {
      this._beginHordeWave(enemies, waveDef);
    } else {
      this._beginNormalWave(enemies, waveDef);
    }
  }

  // ── MODE 1: Normal delay-based spawning ──────────────────
  _beginNormalWave(enemies, waveDef) {
    let approachDelay = 0;
    const approachRange = waveDef.approachInterval;
    enemies.forEach((entry, index) => {
      const delay = approachRange
        ? approachDelay
        : (entry.delay || 0);
      if (approachRange) {
        const [minDelay, maxDelay] = approachRange;
        approachDelay += minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
      }
      const timer = this.scene.time.delayedCall(delay, () => {
        this._spawnEnemy(entry, waveDef);
        this._spawnedCount++;
        this._spawnedEntryIndexes.push(index);
        if (this._spawnedCount >= this._totalInWave) {
          this.scene.time.delayedCall(500, () => {
            if (this.state === 'spawning') this.state = 'clearing';
          });
        }
      });
      this._spawnTimers.push(timer);
    });
  }

  // ── MODE 2: Half-HP chain (scouts) ───────────────────────
  // v1.0.1 rule:
  //   First 5 entries  → wait for previous alien to reach ≤ 50% HP before spawning next.
  //   Entries 6+       -> spawn freely on the wave's configured interval.
  _beginHalfHpChain(enemies, waveDef) {
    this._chainIndex      = 0;
    this._chainEnemy      = null;
    this._chainFreeCount  = 0;   // how many free-interval spawns have started
    this._spawnNextInChain(enemies, waveDef);
  }

  _spawnNextInChain(enemies, waveDef) {
    if (this._chainIndex >= enemies.length) {
      this.scene.time.delayedCall(500, () => {
        if (this.state === 'spawning') this.state = 'clearing';
      });
      return;
    }

    const entryIndex = this._chainIndex;
    const entry = enemies[entryIndex];
    this._chainIndex++;

    const enemy = this._spawnEnemy(entry, waveDef);
    this._spawnedCount++;
    this._spawnedEntryIndexes.push(entryIndex);
    this._chainEnemy = enemy;

    if (this._chainIndex >= enemies.length) {
      // Last enemy spawned — wait for field to clear
      this.scene.time.delayedCall(500, () => {
        if (this.state === 'spawning') this.state = 'clearing';
      });
      return;
    }

    // Decide spawn mode for the NEXT entry
    const spawnedSoFar = this._chainIndex; // already incremented above
    if (spawnedSoFar < 5) {
      // Still within the first-5 window → poll HP
      this._pollForHalfHp(enemies, waveDef);
    } else {
      this._scheduleChainBatch(enemies, waveDef);
    }
  }

  _scheduleChainBatch(enemies, waveDef) {
    const arrival = this._chooseArrivalGroup(enemies.length - this._chainIndex, waveDef);
    const groupSize = arrival.size;
    const delay = arrival.delay;
    this._chainBatchSize = groupSize;
    this._chainTimer = this.scene.time.delayedCall(delay, () => {
      this._chainTimer = null;
      const count = Math.min(this._chainBatchSize || 1, enemies.length - this._chainIndex);
      this._chainBatchSize = 0;
      for (let i = 0; i < count; i++) {
        const entryIndex = this._chainIndex++;
        this._spawnEnemy(enemies[entryIndex], waveDef);
        this._spawnedCount++;
        this._spawnedEntryIndexes.push(entryIndex);
      }
      if (this._chainIndex >= enemies.length) {
        this.scene.time.delayedCall(500, () => {
          if (this.state === 'spawning') this.state = 'clearing';
        });
      } else {
        this._scheduleChainBatch(enemies, waveDef);
      }
    });
    this._spawnTimers.push(this._chainTimer);
  }

  _chooseArrivalGroup(remaining, waveDef) {
    const size = GW.WAVES.chooseGroupSize(remaining);
    if (waveDef && waveDef.spawnInterval) {
      const [minDelay, maxDelay] = waveDef.spawnInterval;
      return { size, delay: minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1)) };
    }
    const [minDelay, maxDelay] = GW.WAVES.APPROACH_INTERVAL;
    return { size, delay: minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1)) };
  }

  _pollForHalfHp(enemies, waveDef) {
    this._chainPollTimer = this.scene.time.addEvent({
      delay:    200,
      loop:     true,
      callback: () => {
        if (this.state !== 'spawning') {
          this._stopChainPoll();
          return;
        }
        const en = this._chainEnemy;
        const halfHpReached = !en || !en.alive ||
          (en.hp !== undefined && en.maxHp && en.hp <= en.maxHp * 0.5);
        if (halfHpReached) {
          this._stopChainPoll();
          this._spawnNextInChain(enemies, waveDef);
        }
      },
    });
    this._spawnTimers.push(this._chainPollTimer);
  }

  _stopChainPoll() {
    if (this._chainPollTimer) {
      this._chainPollTimer.remove(false);
      this._chainPollTimer = null;
    }
    this._chainEnemy = null;
  }

  // ── MODE 3: Horde wave with delay ───────────────────────
  // 1. Flag bearer spawns immediately → triggers onFlagAlien / warning banner.
  // Drones follow weighted single/pair/triple delays after the flag bearer.
   // ── MODE 3: Staged horde ────────────────────────────────
   // The flag bearer leads; drones arrive in weighted groups with longer delays.
  _beginHordeWave(enemies, waveDef) {
     const flagIndexes = enemies.reduce((indexes, entry, index) => {
       if (entry.type === 'vex_flag_bearer') indexes.push(index);
       return indexes;
     }, []);
     const flagLimit = waveDef.flagBearerCount == null ? 1 : waveDef.flagBearerCount;
     const leadingFlagIndexes = flagIndexes.slice(0, flagLimit);
     const suppressedFlags = flagIndexes.length - leadingFlagIndexes.length;
     if (suppressedFlags > 0) {
       this._totalInWave -= suppressedFlags;
       this._totalScheduledAllWaves -= suppressedFlags;
     }
     leadingFlagIndexes.forEach(flagIndex => {
       this._spawnEnemy(enemies[flagIndex], waveDef);
       this._spawnedCount++;
       this._spawnedEntryIndexes.push(flagIndex);
     });
     const pending = enemies.map((entry, index) => ({ entry, index }))
       .filter(item => item.entry.type !== 'vex_flag_bearer');
     this._scheduleHordeBatch(pending, waveDef, true);
   }

  _scheduleHordeBatch(pending, waveDef, isFirstBatch) {
    if (!pending.length) {
      this.scene.time.delayedCall(500, () => {
        if (this.state === 'spawning') this.state = 'clearing';
      });
      return;
    }
    const arrival = this._chooseArrivalGroup(pending.length, waveDef);
    const delay = isFirstBatch
      ? (waveDef.firstHordeDelay == null ? 750 : Math.max(0, waveDef.firstHordeDelay))
      : arrival.delay;
    const timer = this.scene.time.delayedCall(delay, () => {
      if (this.state !== 'spawning') return;
      const batch = pending.splice(0, waveDef.isFinalWave ? pending.length : arrival.size);
      batch.forEach(({ entry, index }) => {
        this._spawnEnemy(entry, waveDef);
        this._spawnedCount++;
        this._spawnedEntryIndexes.push(index);
      });
      if (this._spawnedCount >= this._totalInWave) {
        this.scene.time.delayedCall(500, () => {
          if (this.state === 'spawning') this.state = 'clearing';
        });
      } else {
        this._scheduleHordeBatch(pending, waveDef, false);
      }
    });
    this._spawnTimers.push(timer);
  }

  // ── Spawn a single enemy ─────────────────────────────────
  // Returns the Enemy instance so callers can track it.
  _spawnEnemy(entry, waveDef) {
    const lane = Number.isInteger(entry.lane) ? entry.lane : GW.LANE_PRESSURE.pickLane(waveDef || {}, 1);
    const enemy = GW.EnemyFactory.create(this.scene, entry.type, lane, {
      waveDef,
      spawnDistance: entry.spawnDistance,
      warningTime: entry.warningTime,
      timeToImpact: entry.timeToImpact,
    });
    if (!enemy) return null;
    if (GW.progression && enemy.id) GW.progression.discoverEnemy(enemy.id);

    // Equipment
    if (entry.equipment && GW.ALIEN_EQUIPMENT) {
      const equipDef = GW.ALIEN_EQUIPMENT[entry.equipment];
      if (equipDef) enemy.applyEquipment(equipDef);
    }

    if (enemy.warningTime > 0) {
      const warning = this.scene.add.rectangle(
        GW.BOARD.ENEMY_SPAWN_X + 30,
        GW.BOARD.TOP_OFFSET + (lane - 0.5) * GW.BOARD.LANE_HEIGHT,
        18, 42, 0xef4444, 0.9
      ).setDepth(18);
      this.scene.tweens.add({
        targets: warning,
        alpha: 0,
        scaleX: 1.5,
        scaleY: 1.5,
        duration: Math.min(700, Math.max(260, enemy.warningTime * 0.5)),
        ease: 'Power2',
        onComplete: () => warning.destroy(),
      });
    }

    // Flag alien callback (fires warning banner in scenes.js)
    if (enemy.def && enemy.def.isFlag && this.onFlagAlien) {
      this.onFlagAlien(waveDef);
    }

    this.combatManager.addEnemy(enemy);

    this._totalSpawnedAllWaves++;
    if (this.onAlienSpawned) {
      this.onAlienSpawned(this._totalSpawnedAllWaves, this._totalScheduledAllWaves);
    }

    return enemy;
  }

  // ── Wave clear ───────────────────────────────────────────
  _waveClear() {
    const waveNum = this.currentWaveIndex + 1;
    if (this.onWaveClear) this.onWaveClear(waveNum);

    if (this.currentWaveIndex >= this.totalWaves - 1) {
      this.state = 'done';
      if (this.onAllClear) this.onAllClear();
      return;
    }

    const nextWave = this.waves[this.currentWaveIndex + 1];
    const scheduledBossWarning = nextWave && nextWave.isBossWave &&
      nextWave.warnBeforeStart && Number.isFinite(nextWave.startAfterMs);
    this.betweenTimer = scheduledBossWarning
      ? Math.max(0, nextWave.startAfterMs - (this.scene._gameRuntimeMs || 0) - (nextWave.warningDelay || 5000))
      : nextWave && nextWave.warnBeforeStart
        ? 0
        : GW.WAVES.BETWEEN_WAVE_DELAY;
    this.state = 'between';
  }

  // ── Cleanup ──────────────────────────────────────────────
  _cancelSpawnTimers() {
    this._spawnTimers.forEach(t => { if (t && t.remove) t.remove(false); });
    this._spawnTimers = [];
  }

  get currentWaveNumber() { return this.currentWaveIndex + 1; }
  get isComplete()        { return this.state === 'done'; }

  restoreSnapshot(saved) {
    this.started = !!saved.started;
    this.currentWaveIndex = saved.currentWaveIndex == null ? -1 : saved.currentWaveIndex;
    this.state = saved.state || 'waiting';
    this.initialTimer = saved.initialTimer;
    this.betweenTimer = saved.betweenTimer;
    this._totalSpawnedAllWaves = saved.totalSpawned || 0;
    this._totalScheduledAllWaves = saved.totalScheduled || 0;
    this._spawnedCount = saved.spawnedCount || 0;
    this._spawnedEntryIndexes = saved.spawnedEntryIndexes || [];
    this._chainIndex = saved.chainIndex == null
      ? Math.max(0, ...this._spawnedEntryIndexes.map(index => index + 1))
      : saved.chainIndex;
    const nextIndex = this.currentWaveIndex + 1;
    if (saved.hordeReleaseScheduled && this.waves[nextIndex] && this.waves[nextIndex].warnBeforeStart) {
      this._hordeReleaseScheduled = true;
      const releaseDelay = Math.max(0, saved.hordeReleaseRemaining || 0);
      this._hordeReleaseTimer = this.scene.time.delayedCall(releaseDelay, () => {
        this._hordeReleaseScheduled = false;
        this._hordeReleaseTimer = null;
        this._beginWave(nextIndex);
        if (this.onHordeApproach) this.onHordeApproach(this.waves[nextIndex]);
      });
    }

    if (this.state !== 'spawning') return;
    const waveDef = this.waves[this.currentWaveIndex];
    const entries = waveDef && waveDef.enemies || [];
    this._totalInWave = entries.length;
    const spawned = new Set(this._spawnedEntryIndexes);
    const pending = entries.map((entry, index) => ({ entry, index })).filter(item => !spawned.has(item.index));
    if (!pending.length) {
      this.state = 'clearing';
      return;
    }

    if (waveDef.approachInterval) {
      let delay = 0;
      const [minDelay, maxDelay] = waveDef.approachInterval;
      pending.forEach(item => {
        this._scheduleRestoredBatch([item], waveDef, delay);
        delay += minDelay + Math.floor(Math.random() * (maxDelay - minDelay + 1));
      });
      return;
    }

    if (waveDef.isHorde) {
      const flagPending = pending.filter(item => item.entry.type === 'vex_flag_bearer');
      const dronesPending = pending.filter(item => item.entry.type !== 'vex_flag_bearer');
      flagPending.forEach(item => this._scheduleRestoredBatch([item], waveDef, 0));
      this._scheduleRestoredBatch(dronesPending, waveDef);
      return;
    }

    if (waveDef.halfHpChain && this._chainIndex > 0 && this._chainIndex < 5) {
      const chainEnemy = this.combatManager.enemies[this.combatManager.enemies.length - 1];
      if (chainEnemy) {
        this._chainEnemy = chainEnemy;
        this._pollForHalfHp(entries, waveDef);
        return;
      }
    }

    this._scheduleRestoredBatch(pending, waveDef);
  }

  _scheduleRestoredBatch(pending, waveDef, delayOverride) {
    if (!pending.length) return;
    const arrival = this._chooseArrivalGroup(pending.length, waveDef);
    const delay = delayOverride == null ? arrival.delay : delayOverride;
    const timer = this.scene.time.delayedCall(delay, () => {
      if (this.state !== 'spawning') return;
      const batch = pending.splice(0, delayOverride === 0 ? 1 : arrival.size);
      batch.forEach(({ entry, index }) => {
        this._spawnEnemy(entry, waveDef);
        this._spawnedCount++;
        this._spawnedEntryIndexes.push(index);
        if (waveDef.halfHpChain) this._chainIndex = Math.max(this._chainIndex, index + 1);
      });
      if (this._spawnedCount >= this._totalInWave) {
        this.scene.time.delayedCall(500, () => {
          if (this.state === 'spawning') this.state = 'clearing';
        });
      } else {
        this._scheduleRestoredBatch(pending, waveDef);
      }
    });
    this._spawnTimers.push(timer);
  }
};
