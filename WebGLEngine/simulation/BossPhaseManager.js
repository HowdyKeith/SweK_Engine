// =============================================================================
// FILE: /simulation/BossPhaseManager.js
// ROUND: 231
// =============================================================================
//
// Two-phase mini-boss encounters. When the boss's HP drops to 50%, it
// triggers a phase shift:
//
//   PHASE 1  → normal combat; boss attacks, takes damage
//   PHASE 2  → boss TELEPORTS to a different room, becomes
//              INVULNERABLE, and SPAWNS minions where the player
//              currently is. The player must clear the minions to
//              expose the boss again.
//   PHASE 3  → boss is vulnerable again, AI resumes; fight to 0 HP.
//
// Implementation:
//   • Polls FPSShooter._enemies each tick for any "bot_miniboss"
//   • On HP threshold crossing (Phase 1 → 2), runs the phase-2 setup:
//     - Mark boss.invulnerable on both _enemies entry AND BotManager
//       bot record (so FPSShooter skips damage AND BotManager AI
//       skips its tick)
//     - Teleport boss to a non-player room via direct ECS Position
//       write + BotManager record update
//     - Spawn 3 kaiju minions in the player's current room. Mix kinds
//       from the v230 kaiju roster for variety.
//   • Watches minion count each tick. Once all are dead, enters
//     phase 3: invulnerability cleared, boss attacks resume.
//
// Reuses existing pieces:
//   v226 bot_miniboss spec, v230 kaiju bot kinds (for minion variety),
//   FPSShooter._enemies registry, BotManager.spawn, ECS Position
//   component directly.
//
// API:
//   new BossPhaseManager({ fpsShooter, botManager, ollamaLevelGen,
//                          camera, kpop, audio, ecsWorld })
//   bpm.tick(dt);    // called from main loop
//   bpm.getPhase();  // "idle" | "phase1" | "phase2" | "phase3"
//   bpm.getStats();  // counters for the perf dashboard / debug
// =============================================================================

const PHASE_HP_THRESHOLD = 0.5;
const MINION_COUNT = 3;

// Round 240 — themed minion pools. Each pool is the LOYAL retinue a
// king-tier kaiju summons in phase 2. Picks favor the boss's origin
// kin but mix in neighbors so the spawn feels like a coherent court
// rather than a copy-paste of the boss. The boss's own kind is
// excluded from its pool — they're the only one of their kind.
//
// Empty/missing origin (legacy bot_miniboss) falls back to MIXED.
const MINION_POOLS_BY_ORIGIN = {
    hell:        ["bot_kaiju_hell",        "bot_kaiju_underground", "bot_kaiju_cave"],
    sky:         ["bot_kaiju_sky",         "bot_kaiju_space"],
    space:       ["bot_kaiju_space",       "bot_kaiju_tech",        "bot_kaiju_sky"],
    cave:        ["bot_kaiju_cave",        "bot_kaiju_underground"],
    underground: ["bot_kaiju_underground", "bot_kaiju_cave",        "bot_kaiju_hell"],
    water:       ["bot_kaiju_water"],    // tide king's court is small + pure
    tech:        ["bot_kaiju_tech",        "bot_kaiju_space"],
};
const MIXED_POOL = [
    "bot_kaiju_hell", "bot_kaiju_space", "bot_kaiju_cave",
    "bot_kaiju_water", "bot_grunt",
];
// 30% of spawn slots prefer a "loyal grunt" — a generic foot-soldier
// mixed into the kaiju retinue. Reads as the boss having mortal allies
// alongside the kaiju kin, and keeps the fight from being purely-kaiju.
const LOYAL_GRUNT_CHANCE = 0.30;

// Pick the minion pool that matches a boss kind. Strips "bot_king_"
// or "bot_kaiju_" prefix and looks up by origin. Bosses without a
// matching origin (legacy bot_miniboss) get MIXED_POOL.
function poolForBossKind(bossKind) {
    if (typeof bossKind !== "string") return MIXED_POOL;
    let origin = null;
    if (bossKind.startsWith("bot_king_"))   origin = bossKind.slice("bot_king_".length);
    else if (bossKind.startsWith("bot_kaiju_")) origin = bossKind.slice("bot_kaiju_".length);
    return MINION_POOLS_BY_ORIGIN[origin] || MIXED_POOL;
}

// Pick one minion kind for a slot. Mostly draws from the themed pool,
// sometimes injects a loyal grunt for variety. Filters out the boss's
// own kind so a Hell King doesn't summon another Hell King.
function pickMinionKind(pool, bossKind) {
    if (Math.random() < LOYAL_GRUNT_CHANCE) return "bot_grunt";
    const filtered = pool.filter(k => k !== bossKind);
    const choices = filtered.length > 0 ? filtered : pool;
    return choices[Math.floor(Math.random() * choices.length)];
}

export class BossPhaseManager {
    constructor({
        fpsShooter, botManager, ollamaLevelGen,
        camera, kpop = null, audio = null, ecsWorld = null,
    }) {
        this.fpsShooter = fpsShooter;
        this.botManager = botManager;
        this.ollamaLevelGen = ollamaLevelGen;
        this.camera = camera;
        this.kpop = kpop;
        this.audio = audio;
        this.ecsWorld = ecsWorld;

        this._phase = "idle";
        this._bossId = null;          // current boss entity id
        this._minionIds = new Set();
        this._currentBossKind = null;     // round 240 — captured on phase 2 entry
        this._counters = {
            phase2Triggers: 0,
            phase3Triggers: 0,
            minionsSpawned: 0,
        };
    }

    getPhase() { return this._phase; }
    getStats() { return { ...this._counters, phase: this._phase, minionsAlive: this._aliveMinions() }; }
    isInvulnerable() { return this._phase === "phase2"; }

    tick(dt) {
        if (!this.fpsShooter?._enemies) return;
        // Find the boss in the FPS enemy registry
        let boss = null;
        let bossId = null;
        for (const [id, info] of this.fpsShooter._enemies) {
            // Round 234 — boss can be the legacy bot_miniboss OR any
            // king-tier kaiju (bot_king_X). Both go through the same
            // phase machine.
            if (info.kind === "bot_miniboss" ||
                (typeof info.kind === "string" && info.kind.startsWith("bot_king_"))) {
                boss = info; bossId = id; break;
            }
        }
        if (!boss) {
            // No boss alive — reset if we were tracking one
            if (this._phase !== "idle") this._reset("boss-gone");
            return;
        }

        // First-time discovery — kick into phase 1
        if (this._phase === "idle" || bossId !== this._bossId) {
            this._phase = "phase1";
            this._bossId = bossId;
            this._minionIds.clear();
        }

        // Phase 1 → 2 on HP threshold crossing
        if (this._phase === "phase1") {
            const hpFrac = boss.hp / boss.maxHp;
            if (hpFrac <= PHASE_HP_THRESHOLD) {
                this._enterPhase2(boss, bossId);
            }
            return;
        }

        // Phase 2 — wait for minions to die
        if (this._phase === "phase2") {
            if (this._aliveMinions() === 0 && this._minionIds.size > 0) {
                this._enterPhase3(boss, bossId);
            }
            return;
        }

        // Phase 3 — passive; combat just continues to 0 HP. Reset
        // happens via the "boss-gone" path above when boss dies.
    }

    // ----- Internal -----------------------------------------------------

    _aliveMinions() {
        let alive = 0;
        for (const mid of this._minionIds) {
            if (this.fpsShooter._enemies.has(mid)) alive++;
        }
        return alive;
    }

    _enterPhase2(boss, bossId) {
        this._phase = "phase2";
        this._counters.phase2Triggers++;
        // Round 240 — stash the boss kind so _spawnMinions can pick
        // theme-matched minions (Hell King summons hell minions, etc).
        this._currentBossKind = boss.kind ?? null;
        // Mark invulnerable so FPSShooter damage path and BotManager
        // AI both bail out
        boss.invulnerable = true;
        const botRec = this.botManager.bots.get(bossId);
        if (botRec) botRec.invulnerable = true;

        // Pick a teleport destination — a room the player is NOT in
        const layout = this.ollamaLevelGen?._lastLevel;
        if (layout?.rooms?.length) {
            const cx = this.camera.position.x, cz = this.camera.position.z;
            const playerRoom = layout.rooms.find(r =>
                cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.d);
            const candidates = layout.rooms.filter(r => r !== playerRoom);
            const dest = candidates[Math.floor(Math.random() * candidates.length)] || layout.rooms[0];
            this._teleportBoss(bossId, botRec, dest);
        }

        // Spawn minions where the player currently stands
        this._spawnMinions();

        // Feedback
        if (this.kpop?.warn) {
            this.kpop.warn("⚠ BOSS PHASE 2", `Minions! Clear ${this._minionIds.size} of them to expose the boss`).catch(()=>{});
        }
        if (this.kpop?.speak) {
            this.kpop.speak({ Voice: "M1", Text: "The boss has retreated. Minions surround you." }).catch(()=>{});
        }
        if (this.audio?.playProcedural) {
            this.audio.playProcedural("fps_exit_open", 1.0);
            setTimeout(() => this.audio.playProcedural?.("fps_hit_player", 0.5), 250);
        }
    }

    _teleportBoss(bossId, botRec, destRoom) {
        const tx = destRoom.x + destRoom.w / 2;
        const tz = destRoom.z + destRoom.d / 2;
        const ty = 6 + (destRoom.y | 0);
        // Update ECS Position directly so the renderer reflects it
        // next frame. Both BotManager record and ECS need updating;
        // BotManager.bot.{x,y,z} drives its AI's view of itself, ECS
        // Position drives the visible mesh transform.
        if (this.ecsWorld?.getComponent) {
            try {
                const pos = this.ecsWorld.getComponent(bossId, "Position");
                if (pos) { pos.x = tx; pos.y = ty; pos.z = tz; }
            } catch {}
        }
        if (botRec) {
            botRec.x = tx; botRec.y = ty; botRec.z = tz;
            // Reset path so the boss doesn't keep walking toward the
            // OLD destination once invulnerability clears
            botRec.path = null;
            botRec.pathIdx = 0;
        }
        console.log(`[BossPhase] teleported boss to room "${destRoom.id}" at (${tx.toFixed(1)}, ${tz.toFixed(1)})`);
    }

    _spawnMinions() {
        this._minionIds.clear();
        // Round 240 — themed minion pool keyed off boss kind
        const bossKind = this._currentBossKind;
        const pool = poolForBossKind(bossKind);
        const cx = this.camera.position.x, cz = this.camera.position.z;
        const summary = [];
        for (let i = 0; i < MINION_COUNT; i++) {
            const ang = (i / MINION_COUNT) * Math.PI * 2 + Math.random() * 0.5;
            const r = 3 + Math.random() * 2;
            const x = cx + Math.cos(ang) * r;
            const z = cz + Math.sin(ang) * r;
            const kind = pickMinionKind(pool, bossKind);
            const minion = this.botManager.spawn({ x, z, kind });
            if (minion?.entityId) {
                this._minionIds.add(minion.entityId);
                this._counters.minionsSpawned++;
                summary.push(kind.replace("bot_kaiju_", "").replace("bot_", ""));
            }
        }
        console.log(`[BossPhase] phase2 minions for ${bossKind || "unknown boss"}: ${summary.join(", ")}`);
    }

    _enterPhase3(boss, bossId) {
        this._phase = "phase3";
        this._counters.phase3Triggers++;
        boss.invulnerable = false;
        const botRec = this.botManager.bots.get(bossId);
        if (botRec) botRec.invulnerable = false;
        // Round 240 — clear stashed boss kind; if a NEW boss starts a
        // phase 2 later it'll be re-captured on _enterPhase2.
        this._currentBossKind = null;

        if (this.kpop?.success) {
            this.kpop.success("⚔ BOSS EXPOSED", "Minions clear — finish the boss!").catch(()=>{});
        }
        if (this.kpop?.speak) {
            this.kpop.speak({ Voice: "M1", Text: "The boss returns. Finish it." }).catch(()=>{});
        }
        if (this.audio?.playProcedural) this.audio.playProcedural("fps_level_clear", 0.8);
    }

    _reset(reason = "manual") {
        if (this._phase !== "idle") {
            console.log(`[BossPhase] reset (${reason}); phase was ${this._phase}`);
        }
        // Clean up any tracked minion references; don't despawn them —
        // killing them is the player's job
        this._phase = "idle";
        this._bossId = null;
        this._minionIds.clear();
    }
}
