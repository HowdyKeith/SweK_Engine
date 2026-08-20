// =============================================================================
// FILE: /simulation/BotManager.js
// ROUND: 216
// =============================================================================
//
// FP-bots that inhabit WAD-generated levels (round 213). Bots:
//   • spawn at room centers in the active OllamaLevelGenerator layout
//   • have a state machine: idle → patrol → alert → engage → dying
//   • request paths from BotPathfinderPool (workers, off main thread)
//   • see the player via line-of-sight + range check
//   • fire bullets at the player when in engage state
//   • take damage from player shots (registered with fpsShooter as enemies)
//   • talk via KPop /kpop/speak on spawn + on engage + on death
//   • use round-30-style ranged attack particles when firing
//
// Per-bot kind:
//   bot_grunt   — 2 hp, slow (3 u/s), close-range bullet, easy
//   bot_sniper  — 1 hp, slow, long-range high-damage shot, fragile
//   bot_heavy   — 5 hp, slowest, mid-range rapid fire
//
// Pathfinding usage pattern:
//   Each bot has _pathRequestPending + _path + _pathTargetMs. While a
//   path is in flight, the bot continues following the prior path. Path
//   recompute interval is 2-3 seconds, plus on state transitions.
//
// API:
//   const bm = new BotManager({ router, world, ecsWorld, particles,
//                                fpsShooter, pathfinderPool, kpop });
//   await bm.spawnFromLayout(layout, { density: 1 });
//   bm.tick(dt);
//   bm.clear();
//
// Console:
//   window.bots.spawnAtPlayer({ kind: "bot_grunt" })
//   window.bots.clear()
//   window.bots.count()
// =============================================================================

// Round 242 — period damage multipliers. Each kaiju origin has a
// "favored hour" range during which its damage is amplified +25%.
// Implements the "Hell King hits harder at midnight" feel without
// changing fire intervals or attacks themselves. Window is a [start,
// end) range; if start > end, the window wraps midnight.
const PERIOD_DAMAGE_WINDOWS = {
    hell:        { start: 22, end:  4, mult: 1.25, label: "midnight" }, // wraps
    sky:         { start: 10, end: 14, mult: 1.25, label: "midday" },
    space:       { start:  0, end:  5, mult: 1.25, label: "pre-dawn" },
    cave:        { start: 18, end: 22, mult: 1.25, label: "dusk" },
    underground: { start: 22, end:  6, mult: 1.25, label: "deep night" }, // wraps
    water:       { start: 17, end: 22, mult: 1.25, label: "twilight" },
    tech:        { start:  9, end: 17, mult: 1.25, label: "daylight" },
};

function _hourInWindow(h, start, end) {
    if (start <= end) return h >= start && h < end;
    return h >= start || h < end;   // wraps midnight
}

function periodDamageMultiplier(bot) {
    const origin = bot?.spec?.kaijuOrigin;
    if (!origin) return 1.0;
    const w = PERIOD_DAMAGE_WINDOWS[origin];
    if (!w) return 1.0;
    // Read current hour from window.time (exposed by DayNightCycle).
    // Fail-safe to 1.0 if the cycle isn't running.
    const hour = (typeof window !== "undefined" && window.time?.hour)
        ? window.time.hour() : null;
    if (hour == null) return 1.0;
    return _hourInWindow(hour, w.start, w.end) ? w.mult : 1.0;
}

// Round 248 — sprite-derived particle modifiers. The kaijuAttacks.js
// SPRITE enum (CIRCLE=0, SMOKE=1, SPARK=2, DUST=3, EMBER=4, GLYPH=5,
// HALO=6, RUNE=7) was a hint to a sprite atlas the FPS-side particle
// system doesn't have. Instead we honor it by varying size/count/ttl
// so each sprite kind reads as a different attack signature.
//
// Examples after applying:
//   GLYPH lightning → thick low-count beam (chunky bolts)
//   EMBER fireball  → small dense trail (stream of sparks)
//   HALO  plasma    → big puffy slow-fading orb
//   SPARK ice ray   → tiny fast pops (shimmer)
const SPRITE_MODS = {
    0: { sizeBoost: 1.0,  countBoost: 1.0,  ttlBoost: 1.0  },   // CIRCLE — neutral
    1: { sizeBoost: 1.4,  countBoost: 0.8,  ttlBoost: 1.8  },   // SMOKE  — big puffy slow
    2: { sizeBoost: 0.6,  countBoost: 1.6,  ttlBoost: 0.5  },   // SPARK  — small dense fast
    3: { sizeBoost: 0.85, countBoost: 1.3,  ttlBoost: 1.3  },   // DUST   — swirly
    4: { sizeBoost: 0.75, countBoost: 1.4,  ttlBoost: 0.85 },   // EMBER  — dense trail
    5: { sizeBoost: 1.35, countBoost: 0.7,  ttlBoost: 1.0  },   // GLYPH  — chunky distinct
    6: { sizeBoost: 1.55, countBoost: 0.6,  ttlBoost: 1.3  },   // HALO   — big slow rings
    7: { sizeBoost: 1.1,  countBoost: 0.9,  ttlBoost: 1.6  },   // RUNE   — lingering mark
};
const SPRITE_MODS_DEFAULT = SPRITE_MODS[0];

const BOT_KINDS = {
    bot_grunt: {
        hp: 2, speed: 3.0, sightRange: 25, fireRange: 18, fireInterval: 1.2,
        damage: 0.10, color: [1.0, 0.8, 0.3],
        speech: { spawn: "Contact!", engage: "Engaging the operator.", death: "I'm hit!" },
        // Round 272 — per-NPC voice profile. Used when BrowserTTS route
        // is active. {tag} = which base voice ("M1"/"M2"), {pitch} and
        // {rate} multiply against the base (1.0 = unchanged). Tuned per
        // kind to feel like each bot has its own actor.
        voice: { tag: "M2", pitch: 1.0,  rate: 1.1 },
    },
    bot_sniper: {
        hp: 1, speed: 1.5, sightRange: 50, fireRange: 45, fireInterval: 3.5,
        damage: 0.30, color: [0.5, 0.9, 1.0],
        speech: { spawn: "Setting up overwatch.", engage: "Target acquired.", death: "Spotted." },
        voice: { tag: "M2", pitch: 0.95, rate: 0.95 },   // cool/measured
    },
    bot_heavy: {
        hp: 5, speed: 2.0, sightRange: 22, fireRange: 16, fireInterval: 0.5,
        damage: 0.06, color: [1.0, 0.4, 0.2],
        speech: { spawn: "Heavy unit deployed.", engage: "Suppressing!", death: "Armor failed." },
        voice: { tag: "M2", pitch: 0.75, rate: 0.9 },    // gruff/deep
    },
    // Round 226 — mini-boss. Tanky, aggressive, larger silhouette.
    // Auto-spawned by FPSShooter on every Nth level. High HP, wide
    // sight range, heavy hits, slow but relentless. Drops a gravity
    // pickup on death (handled by main.js wiring).
    bot_miniboss: {
        hp: 15, speed: 2.4, sightRange: 40, fireRange: 22, fireInterval: 0.9,
        damage: 0.18, color: [0.9, 0.1, 0.6], scale: 2.6,
        speech: { spawn: "You should not have come this far.", engage: "Burn.", death: "...impossible." },
        voice: { tag: "M2", pitch: 0.65, rate: 0.85 },   // theatrical villain
    },
    // Round 251 — stationary turret. Used by OgreArena to populate
    // defender slots and (more generally) usable as a fixed-position
    // enemy in dungeon rooms. Doesn't move (speed=0), long sight, fast
    // fire, modest damage per shot. Squishy HP so they're not the
    // dominant threat — they're the SUPPORT fire that contributes
    // sustained pressure while you're focused on mobile enemies.
    bot_turret: {
        hp: 6, speed: 0, sightRange: 32, fireRange: 28, fireInterval: 0.6,
        damage: 0.05, color: [0.8, 0.4, 0.2], scale: 1.4,
        speech: { spawn: "Auto-defense online.", engage: "Target locked.", death: "Turret destroyed." },
        voice: { tag: "M2", pitch: 1.4,  rate: 1.15 },   // robotic/buzzy
        // Round 255 — destruction visuals
        destructionFx: true,    // emit smoke when hp < 50%, explosion on death
        smoothYaw: true,        // interpolate yaw rather than snap
    },
    // Round 254 — TANK. Slow ground vehicle for the kaiju sandbox.
    // High HP (takes several stomps), modest fire rate, BIG damage per
    // shot (sandbox uses different damage scale — kaiju HP is "size",
    // 1.0 damage = 0.5 size shrink). Tanks are the bread-and-butter
    // military response; expect 2-6 in the city at a time.
    bot_tank: {
        hp: 12, speed: 3.5, sightRange: 60, fireRange: 35, fireInterval: 2.5,
        damage: 2.0, color: [0.35, 0.45, 0.30], scale: 1.6,
        speech: { spawn: "Tank engaging.", engage: "Fire mission!", death: "Tank disabled." },
        voice: { tag: "M2", pitch: 0.70, rate: 0.95 },   // military radio
        military: true,    // round 254 marker — eaten = growth bonus
    },
    // Round 254 — PLANE. Fast aerial enemy. Flies at altitude above
    // the player (set by _tickBot when bot.spec.flying is true).
    // Lower HP than tanks but faster fire + harder to catch.
    bot_plane: {
        hp: 5, speed: 14, sightRange: 90, fireRange: 45, fireInterval: 1.5,
        damage: 1.2, color: [0.65, 0.65, 0.70], scale: 1.4,
        speech: { spawn: "Air support on station.", engage: "Engaging hostile.", death: "Mayday, mayday!" },
        voice: { tag: "M1", pitch: 1.1, rate: 1.2 },     // crisp radio chatter
        military: true, flying: true, altitudeOffset: 25,
    },
};

// Round 230 — fold in the kaiju-derived bot kinds so dungeons can spawn
// sky / space / cave / underground / water / hell / tech kaiju as
// enemies. Each entry mirrors a KAIJU_KINDS entry's color + scale +
// attack profile, so visual identity (tracer color, mesh size, themed
// speech) comes from the shared kaiju config.
import { KAIJU_BOT_KINDS, KAIJU_BOT_KIND_NAMES, isKaijuBotKind } from "./KaijuBotKinds.js";
// Round 234 — king-tier kaiju bots (boss roster). 7 kings with promoted
// attacks + multi-attack rotation. Merged into BOT_KINDS so spawn() and
// _ensureInstalled treat them like any other kind.
import { KING_KAIJU_BOT_KINDS, KING_KAIJU_BOT_KIND_NAMES, pickRandomKingKind, isKingBotKind } from "./KingKaijuBotKinds.js";
// Round 233 — per-attack-family visualization (beam vs projectile vs
// aoe). Each kaiju kind's signature attack now has a distinct visual
// signature instead of the generic tracer line. Imports keep this
// concern in BotManager rather than spreading through FPSShooter.
import { KAIJU_ATTACKS, KIND_TO_ATTACK, KIND_TO_RIG } from "../world/kaijuAttacks.js";
for (const [name, spec] of Object.entries(KAIJU_BOT_KINDS)) {
    BOT_KINDS[name] = spec;
}
for (const [name, spec] of Object.entries(KING_KAIJU_BOT_KINDS)) {
    BOT_KINDS[name] = spec;
}

const STATE_IDLE     = "idle";
const STATE_PATROL   = "patrol";
const STATE_ALERT    = "alert";
const STATE_ENGAGE   = "engage";
const STATE_DYING    = "dying";

const PATH_REPLAN_MS  = 2500;
const ALERT_DURATION_MS = 1500;
const REPATH_ON_ENGAGE_MS = 1500;

// Procedural bot mesh — humanoid silhouette, 3 boxes (body + head + legs).
const BOT_OBJ = `# bot
v -0.4 0 -0.3
v  0.4 0 -0.3
v  0.4 0  0.3
v -0.4 0  0.3
v -0.4 1 -0.3
v  0.4 1 -0.3
v  0.4 1  0.3
v -0.4 1  0.3
v -0.6 1 -0.5
v  0.6 1 -0.5
v  0.6 1  0.5
v -0.6 1  0.5
v -0.6 2.4 -0.5
v  0.6 2.4 -0.5
v  0.6 2.4  0.5
v -0.6 2.4  0.5
v -0.3 2.4 -0.3
v  0.3 2.4 -0.3
v  0.3 2.4  0.3
v -0.3 2.4  0.3
v -0.3 3.0 -0.3
v  0.3 3.0 -0.3
v  0.3 3.0  0.3
v -0.3 3.0  0.3
f 1 4 3 2
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
f 9 12 11 10
f 13 14 15 16
f 9 10 14 13
f 10 11 15 14
f 11 12 16 15
f 12 9 13 16
f 17 20 19 18
f 21 22 23 24
f 17 18 22 21
f 18 19 23 22
f 19 20 24 23
f 20 17 21 24
`;

export class BotManager {
    constructor({
        router, world, ecsWorld, particles,
        fpsShooter = null, pathfinderPool = null,
        kpop = null, assetLoader = null,
    }) {
        this.router = router;
        this.world = world;
        this.ecsWorld = ecsWorld;
        this.particles = particles;
        this.fpsShooter = fpsShooter;
        this.pathfinderPool = pathfinderPool;
        this.kpop = kpop;
        this.assetLoader = assetLoader;

        this.bots = new Map();          // entityId → bot record
        this._nextBotId = 1;
        this._installedMesh = false;
        this._counters = { spawned: 0, killed: 0, paths: 0, pathsFailed: 0, shots: 0 };
    }

    async _ensureInstalled() {
        if (this._installedMesh) return;
        if (!this.assetLoader?.installOBJText) return;
        await this.assetLoader.installOBJText("bot_grunt",  BOT_OBJ);
        await this.assetLoader.installOBJText("bot_sniper", BOT_OBJ);
        await this.assetLoader.installOBJText("bot_heavy",  BOT_OBJ);
        // Round 226 — mini-boss reuses the bot OBJ; the spec carries
        // a scale field that's applied at spawn time, so it appears
        // as a much larger silhouette without a separate model.
        await this.assetLoader.installOBJText("bot_miniboss", BOT_OBJ);
        // Round 230 — kaiju-derived bot kinds. All seven origins
        // (sky/space/cave/underground/water/hell/tech) share the
        // same OBJ; per-kind color tints tracer particles, per-kind
        // scale enlarges the silhouette. Installing them up front
        // keeps the first spawn fast (no async at gameplay time).
        for (const name of KAIJU_BOT_KIND_NAMES) {
            await this.assetLoader.installOBJText(name, BOT_OBJ);
        }
        // Round 234 — king-tier kaiju bosses
        for (const name of KING_KAIJU_BOT_KIND_NAMES) {
            await this.assetLoader.installOBJText(name, BOT_OBJ);
        }
        this._installedMesh = true;
    }

    // Spawn bots in each room of a WAD layout. density: 0..1 (per room)
    async spawnFromLayout(layout, opts = {}) {
        await this._ensureInstalled();
        const density = opts.density ?? 1.0;
        const fallbackKinds = opts.kinds || ["bot_grunt", "bot_sniper", "bot_heavy"];
        if (!layout?.rooms?.length) return { spawned: 0 };
        let count = 0;

        // Round 230 — Ollama may emit per-spawn kind hints via the
        // layout's spawns[] array. Honor those first (one bot per
        // hint), then fall through to the density-based randomized
        // fill so the rooms still feel populated. Hints with
        // "kaiju_X" map to "bot_kaiju_X" (BOT_KINDS has them merged).
        const consumedHints = new Set();
        if (Array.isArray(layout.spawns) && layout.spawns.length > 0) {
            for (let i = 0; i < layout.spawns.length; i++) {
                const hint = layout.spawns[i];
                const rawKind = (hint?.kind || "grunt").trim().toLowerCase();
                let botKind = "bot_grunt";
                if (rawKind.startsWith("kaiju_")) {
                    const candidate = `bot_${rawKind}`;
                    if (BOT_KINDS[candidate]) botKind = candidate;
                } else if (rawKind === "sniper")    botKind = "bot_sniper";
                else if (rawKind === "heavy")       botKind = "bot_heavy";
                else if (rawKind === "miniboss")    botKind = "bot_miniboss";
                else if (BOT_KINDS[`bot_${rawKind}`]) botKind = `bot_${rawKind}`;
                const x = hint.x ?? 0;
                const z = hint.z ?? 0;
                this.spawn({ x, z, kind: botKind });
                consumedHints.add(i);
                count++;
            }
        }

        // Density fill — only if the hint-driven spawn count is sparse
        // (gives Ollama-driven dungeons consistent crowding regardless
        // of how many hints the model emitted).
        for (const room of layout.rooms) {
            const area = room.w * room.d;
            const targetN = Math.max(0, Math.round(area / 70 * density));
            const inRoomHints = (layout.spawns || []).filter(h =>
                h.x >= room.x && h.x < room.x + room.w &&
                h.z >= room.z && h.z < room.z + room.d).length;
            const remaining = Math.max(0, targetN - inRoomHints);
            for (let i = 0; i < remaining; i++) {
                const margin = 1.5;
                const x = room.x + margin + Math.random() * (room.w - margin*2);
                const z = room.z + margin + Math.random() * (room.d - margin*2);
                const kind = fallbackKinds[Math.floor(Math.random() * fallbackKinds.length)];
                this.spawn({ x, z, kind });
                count++;
            }
        }
        if (this.kpop?.info && count > 0) {
            this.kpop.info("Hostiles deployed", `${count} bots across ${layout.rooms.length} rooms`).catch(()=>{});
        }
        return { spawned: count };
    }

    // Round 226 — spawn a single mini-boss in the exit room of the
    // current WAD layout. Falls back to the last room if no exit is
    // defined.
    // Round 234 — by default the boss is now a RANDOM KING-TIER
    // KAIJU. Each fight has a distinct identity (Hell King's
    // fire+curse rotation, Sky King's typhoon, Tide King's deluge).
    // Callers can override by passing opts.kind explicitly.
    async spawnMiniboss(layout, opts = {}) {
        await this._ensureInstalled();
        if (!layout?.rooms?.length) return null;
        const exitRoomId = layout.exit?.roomId;
        const room = (exitRoomId ? layout.rooms.find(r => r.id === exitRoomId) : null)
                  || layout.rooms[layout.rooms.length - 1];
        if (!room) return null;
        const cx = room.x + room.w / 2;
        const cz = room.z + room.d / 2;
        const kind = opts.kind || pickRandomKingKind();
        const bot = this.spawn({ x: cx, z: cz, kind });
        if (this.kpop?.info && bot) {
            const label = BOT_KINDS[kind]?.kingLabel || "MINI-BOSS";
            this.kpop.info(`⚠ ${label} awaits`, `In ${room.id || "exit room"}`).catch(()=>{});
        }
        return bot;
    }

    // Round 226 — list current bot kinds for HUD use (e.g. to show
    // a boss-HP bar). Returns Map<entityId, {kind, hp, maxHp}>.
    listBots() {
        const out = new Map();
        for (const [id, b] of this.bots) {
            out.set(id, { kind: b.kind, hp: b.hp, maxHp: b.maxHp, x: b.x, z: b.z });
        }
        return out;
    }

    spawn({ x, z, y: spawnY = null, kind = "bot_grunt", assetId = null, scale = null } = {}) {
        const spec = BOT_KINDS[kind] || BOT_KINDS.bot_grunt;
        const y = (spawnY != null) ? spawnY : ((this.world?._heightAt?.(x, z) ?? 5) + 1);   // explicit y wins (cave dwellers); else snap to surface
        // Round 226 — bot kinds may carry an explicit scale (boss = 2.6)
        // v1376 — optional explicit scale (height-normalised library bodies) wins.
        const useScale = (scale != null && scale > 0) ? scale : (spec.scale ?? 1);
        // v1374 — optional library-model body: keeps the logical kind (spec/hp/
        // behaviour) but renders a downloaded model when one is supplied + loaded.
        let useId = kind;
        if (assetId && this.assetLoader?.cache?.get(assetId)) useId = assetId;
        const r = this.router.exec({
            type: "entity:spawnMesh",
            assetId: useId,
            kind,
            x, y, z, scale: useScale, yaw: 0,
        });
        if (!r?.ok || r.id == null) return null;

        const bot = {
            entityId: r.id,
            kind, spec,
            state: STATE_IDLE,
            hp: spec.hp, maxHp: spec.hp,
            x, y, z,
            yaw: 0,
            path: null,
            pathIdx: 0,
            pathRequestId: 0,
            pathRequestPending: false,
            lastPathTime: 0,
            patrolTargetX: x + (Math.random()-0.5)*16,
            patrolTargetZ: z + (Math.random()-0.5)*16,
            lastFireMs: 0,
            stateChangedMs: performance.now(),
        };
        this.bots.set(r.id, bot);
        this._counters.spawned++;

        // Register with FPS shooter so the player can shoot back
        if (this.fpsShooter?.registerEnemy) {
            // Round 234 — kings use their kingLabel ("HELL KING",
            // "TIDE KING", etc.) as the display name so the boss bar
            // shows it correctly. Other bots use the cleaned-up kind.
            const displayName = spec.kingLabel || kind.replace("bot_", "").toUpperCase();
            this.fpsShooter.registerEnemy(r.id, {
                hp: spec.hp,
                kind,
                name: displayName,
                onDeath: (entityId) => this._onBotKilled(entityId),
            });
        }
        // Spawn announcement (per-kind speech)
        if (this.kpop?.speak && spec.speech?.spawn && Math.random() < 0.3) {
            // Round 270 — pass per-NPC portrait so the OLLAMA panel
            // can label this line with the bot's kind + accent color
            // instead of "OLLAMA" generic.
            // Round 272 — pass voice profile (pitch/rate modifiers) so
            // the BrowserTTS route can render this bot with a distinct
            // sound vs other kinds. Falls back to plain M2 if no voice
            // profile or if BrowserTTS isn't in use.
            this.kpop.speak({
                Voice: spec.voice?.tag ?? "M2",
                Text: spec.speech.spawn,
                Portrait: { name: kind.replace(/^bot_/, ""), color: spec.color },
                VoiceProfile: spec.voice ?? null,
            }).catch(()=>{});
        }
        // v834 — auto-attach rig template to this bot if its kaiju origin
        // has a mapping in KIND_TO_RIG AND a corresponding rig template
        // is registered on window.kaijuRigs AND the bot's mesh is rigged.
        // Best-effort — failures are silent (no rig means attack origins
        // fall back to bot center as before).
        this._autoAttachRig(bot);
        return bot;
    }

    /**
     * v834 — best-effort auto-attach. Looks up KIND_TO_RIG[bot.spec.kaijuOrigin],
     * resolves the template from window.kaijuRigs, then calls
     * window.rigSystem.attachEntityRig if the kaiju's mesh is rigged.
     */
    _autoAttachRig(bot) {
        try {
            const origin = bot.spec?.kaijuOrigin;
            if (!origin) return;          // not a kaiju
            const rigName = KIND_TO_RIG[origin];
            if (!rigName) return;
            const rig = window.kaijuRigs?.[rigName];
            if (!rig) return;             // template not loaded yet
            if (!window.rigSystem || !window.entityMeshRenderer) return;
            // Find the asset entry to get the mesh. The mesh's assetId is
            // typically the bot's kind (or some mapping). Best-effort lookup:
            // try kind directly, then assetId from the bot's spec.
            const assetEntry =
                window.entityMeshRenderer.assetVAOs?.get(bot.spec?.kind || bot.kind);
            const mesh = assetEntry?.mesh;
            if (!mesh?.isRigged) return;  // unrigged mesh — auto-attach skipped
            const r = window.rigSystem.attachEntityRig(bot.id, rig, null, { mesh });
            if (r?.ok) {
                this._counters.rigAutoAttached = (this._counters.rigAutoAttached || 0) + 1;
            }
        } catch (e) {
            // Silent failure — auto-attach is opportunistic
        }
    }

    spawnAtPlayer(opts = {}) {
        const cam = this.fpsShooter?.camera || null;
        if (!cam?.position) return null;
        const ang = Math.random() * Math.PI * 2;
        const r = 6 + Math.random() * 4;
        return this.spawn({
            x: cam.position.x + Math.cos(ang) * r,
            z: cam.position.z + Math.sin(ang) * r,
            kind: opts.kind ?? "bot_grunt",
        });
    }

    _onBotKilled(entityId) {
        const bot = this.bots.get(entityId);
        if (!bot) return;
        this._counters.killed++;
        if (this.kpop?.speak && bot.spec.speech?.death && Math.random() < 0.4) {
            this.kpop.speak({
                Voice: bot.spec.voice?.tag ?? "M2",
                Text: bot.spec.speech.death,
                Portrait: { name: bot.kind.replace(/^bot_/, ""), color: bot.spec.color },
                VoiceProfile: bot.spec.voice ?? null,
            }).catch(()=>{});
        }
        // Round 255 — destruction FX: burst of fire + smoke particles
        // at the death position. Turrets and other dramatic-destruction
        // bots opt in via spec.destructionFx.
        if (bot.spec?.destructionFx && this.particles?.spawn) {
            // Fire core
            for (let i = 0; i < 20; i++) {
                this.particles.spawn({
                    x: bot.x + (Math.random() - 0.5) * 0.5,
                    y: bot.y + 1 + Math.random() * 1,
                    z: bot.z + (Math.random() - 0.5) * 0.5,
                    vx: (Math.random() - 0.5) * 8,
                    vy: 2 + Math.random() * 5,
                    vz: (Math.random() - 0.5) * 8,
                    ttl: 0.7, size: 0.32,
                    r: 1.0, g: 0.65, b: 0.20, a: 0.95,
                    gravity: 6,
                });
            }
            // Dark smoke trail (slower, longer-lived)
            for (let i = 0; i < 12; i++) {
                this.particles.spawn({
                    x: bot.x + (Math.random() - 0.5) * 0.8,
                    y: bot.y + 0.8,
                    z: bot.z + (Math.random() - 0.5) * 0.8,
                    vx: (Math.random() - 0.5) * 2,
                    vy: 1 + Math.random() * 2,
                    vz: (Math.random() - 0.5) * 2,
                    ttl: 1.6, size: 0.50,
                    r: 0.20, g: 0.18, b: 0.16, a: 0.70,
                });
            }
            if (this.fpsShooter?.audio?.playProcedural) {
                try { this.fpsShooter.audio.playProcedural("fps_kill", 0.7); } catch {}
            }
        }
        // Despawn entity (FPSShooter normally does this, but if we own the
        // onDeath we have to do it ourselves)
        try { this.router?.exec({ type: "entity:despawn", id: entityId }); } catch {}
        this.bots.delete(entityId);
    }

    // Round 252 — external boost hook. Called by FPSShooter when a boss
    // is enraged (low HP triggers +30% fire rate). The fireMul applies
    // multiplicatively to the bot's fire interval; <1 = faster.
    _boost(entityId, { fireMul = 1.0 } = {}) {
        const bot = this.bots.get(entityId);
        if (!bot) return false;
        bot.fireMul = (bot.fireMul ?? 1.0) * fireMul;
        // Visual cue: shift color slightly redder so the boss reads as
        // "angrier". Won't bake unless renderer reads bot.color per-frame.
        if (bot.spec?.color) {
            bot.color = [
                Math.min(1, (bot.color?.[0] ?? bot.spec.color[0]) + 0.15),
                Math.max(0, (bot.color?.[1] ?? bot.spec.color[1]) - 0.10),
                Math.max(0, (bot.color?.[2] ?? bot.spec.color[2]) - 0.10),
            ];
        }
        return true;
    }

    tick(dt) {
        if (this.bots.size === 0) return;
        const playerPos = this._playerPos();
        const nowMs = performance.now();
        for (const bot of this.bots.values()) {
            this._tickBot(bot, dt, playerPos, nowMs);
        }
    }

    _tickBot(bot, dt, playerPos, nowMs) {
        if (bot.state === STATE_DYING) return;
        // Round 231 — invulnerable bots (boss during phase 2) stop
        // moving and stop firing. They effectively hold their position
        // until the phase clears.
        if (bot.invulnerable) return;

        // Round 255 — capture pre-tick yaw for smooth interpolation.
        // Must happen BEFORE state handling (which may snap bot.yaw to
        // the target). _displayYaw lags behind bot.yaw smoothly.
        if (bot.spec.smoothYaw && bot._displayYaw == null) {
            bot._displayYaw = bot.yaw;
        }

        // Update sense: can we see the player?
        const dx = playerPos.x - bot.x;
        const dz = playerPos.z - bot.z;
        const distSq = dx*dx + dz*dz;
        const dist = Math.sqrt(distSq);
        const seesPlayer = playerPos.valid && dist <= bot.spec.sightRange;

        // State machine
        switch (bot.state) {
            case STATE_IDLE:
                if (seesPlayer) this._transition(bot, STATE_ALERT);
                else if (nowMs - bot.stateChangedMs > 1500) this._transition(bot, STATE_PATROL);
                break;
            case STATE_PATROL:
                if (seesPlayer) this._transition(bot, STATE_ALERT);
                else this._tickPatrol(bot, dt, nowMs);
                break;
            case STATE_ALERT:
                bot.yaw = Math.atan2(dx, dz);
                if (nowMs - bot.stateChangedMs > ALERT_DURATION_MS) {
                    this._transition(bot, seesPlayer ? STATE_ENGAGE : STATE_PATROL);
                }
                break;
            case STATE_ENGAGE:
                this._tickEngage(bot, dt, playerPos, dist, nowMs);
                if (!seesPlayer) this._transition(bot, STATE_PATROL);
                break;
        }

        // Always update entity transform
        // Round 254 — flying bots (planes) hover at altitude above the
        // player. Set bot.y to playerPos.y + altitudeOffset so the bot
        // is always "in the air" relative to the kaiju.
        if (bot.spec.flying && playerPos.valid) {
            const targetY = playerPos.y + (bot.spec.altitudeOffset ?? 20);
            // Glide toward target altitude instead of snapping; gives a
            // nicer climb/descend feel.
            bot.y = bot.y + (targetY - bot.y) * Math.min(1, dt * 2);
        }
        // Round 255 — smooth yaw interpolation for bots that opt in.
        // The pre-tick capture happens at the top of _tickBot so the
        // display yaw can lag behind the true (snapped) bot.yaw.
        if (bot.spec.smoothYaw && bot._displayYaw != null) {
            // Shortest-angle interpolation. Wrap delta to [-π, π].
            let d = bot.yaw - bot._displayYaw;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            bot._displayYaw += d * Math.min(1, dt * 5);   // ~5 rad/sec rate
        }
        // Round 255 — turret destruction smoke. Below 50% HP the turret
        // smokes continuously. Read hp from fpsShooter._enemies which is
        // the authoritative HP store.
        if (bot.spec.destructionFx && this.fpsShooter?._enemies && this.particles?.spawn) {
            const info = this.fpsShooter._enemies.get(bot.entityId);
            if (info && info.maxHp > 0 && info.hp > 0 && info.hp < info.maxHp * 0.5) {
                // Throttle smoke to ~10 puffs/sec so we don't flood
                if (!bot._lastSmokeMs || nowMs - bot._lastSmokeMs > 100) {
                    bot._lastSmokeMs = nowMs;
                    this.particles.spawn({
                        x: bot.x + (Math.random() - 0.5) * 0.4,
                        y: bot.y + 1.2,
                        z: bot.z + (Math.random() - 0.5) * 0.4,
                        vx: (Math.random() - 0.5) * 0.5,
                        vy: 1.5 + Math.random() * 1.0,
                        vz: (Math.random() - 0.5) * 0.5,
                        ttl: 1.0, size: 0.45,
                        r: 0.35, g: 0.30, b: 0.28, a: 0.55,
                    });
                }
            }
        }
        this._updateEntityTransform(bot);
    }

    _transition(bot, newState) {
        if (bot.state === newState) return;
        bot.state = newState;
        bot.stateChangedMs = performance.now();
        if (newState === STATE_ENGAGE && this.kpop?.speak && bot.spec.speech?.engage && Math.random() < 0.3) {
            this.kpop.speak({
                Voice: bot.spec.voice?.tag ?? "M2",
                Text: bot.spec.speech.engage,
                Portrait: { name: bot.kind.replace(/^bot_/, ""), color: bot.spec.color },
                VoiceProfile: bot.spec.voice ?? null,
            }).catch(()=>{});
        }
    }

    _tickPatrol(bot, dt, nowMs) {
        // Refresh patrol target periodically
        const dx = bot.patrolTargetX - bot.x;
        const dz = bot.patrolTargetZ - bot.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 2) {
            // Round 269 — at night, civilian/wandering bots roam much
            // further. The world feels asleep all day if patrol radius
            // stays at ±8u. Reading the day/night cycle through
            // window._dayNight if available; falls back to daytime
            // radius when no cycle is wired.
            const period = (typeof window !== "undefined" && window._dayNight?.getPeriod)
                ? window._dayNight.getPeriod() : "day";
            const radius = (period === "night") ? 60 : 16;
            bot.patrolTargetX = bot.x + (Math.random() - 0.5) * radius;
            bot.patrolTargetZ = bot.z + (Math.random() - 0.5) * radius;
            return;
        }
        // Maybe request a path
        if (this.pathfinderPool && !bot.pathRequestPending &&
            (nowMs - bot.lastPathTime) > PATH_REPLAN_MS) {
            this._requestPath(bot, bot.patrolTargetX, bot.patrolTargetZ);
        }
        // Move along current path if any; else direct steer
        // Round 243 — water-aware speed: water kaiju move faster in
        // deep water, non-water kaiju get heavily slowed
        this._followPathOrSteer(bot, bot.patrolTargetX, bot.patrolTargetZ, dt, this._waterSpeedMul(bot));
    }

    _tickEngage(bot, dt, playerPos, dist, nowMs) {
        bot.yaw = Math.atan2(playerPos.x - bot.x, playerPos.z - bot.z);
        // Close to fireRange if too far, hold position otherwise
        const fireRange = bot.spec.fireRange;
        if (dist > fireRange) {
            // Move toward player; request path if stale
            if (this.pathfinderPool && !bot.pathRequestPending &&
                (nowMs - bot.lastPathTime) > REPATH_ON_ENGAGE_MS) {
                this._requestPath(bot, playerPos.x, playerPos.z);
            }
            this._followPathOrSteer(bot, playerPos.x, playerPos.z, dt, this._waterSpeedMul(bot));
        }
        // Fire if cooldown elapsed
        // Round 252 — fireMul lets external systems (FPSShooter enrage)
        // scale the bot's fire rate. Default 1.0; set <1 to fire faster.
        const fireMul = bot.fireMul ?? 1.0;
        const interval = bot.spec.fireInterval * 1000 * fireMul;
        if (nowMs - bot.lastFireMs >= interval && dist <= fireRange) {
            this._botFire(bot, playerPos);
            bot.lastFireMs = nowMs;
        }
    }

    _botFire(bot, playerPos) {
        this._counters.shots++;
        // Round 233 — kaiju bots fire with their signature attack
        // visualization. Non-kaiju bots (grunt/sniper/heavy/miniboss)
        // keep the original tracer-line look.
        const kaijuOrigin = bot.spec.kaijuOrigin;
        if (kaijuOrigin && this.particles?.spawn) {
            // Round 234 — kings rotate through multiple attacks
            let attackName;
            if (bot.spec.attackRotation?.length > 1) {
                const idx = (bot.attackRotIdx ?? 0) % bot.spec.attackRotation.length;
                attackName = bot.spec.attackRotation[idx];
                bot.attackRotIdx = idx + 1;
            } else {
                attackName = KIND_TO_ATTACK[kaijuOrigin];
            }
            const attack = attackName ? KAIJU_ATTACKS[attackName] : null;
            if (attack) {
                this._fireKaijuAttack(bot, playerPos, attack, attackName);
                if (this.fpsShooter?.takeDamage) {
                    // Round 242 — favored-hour damage boost (+25%)
                    const dmg = bot.spec.damage * periodDamageMultiplier(bot);
                    this.fpsShooter.takeDamage(dmg, bot.entityId);
                }
                return;
            }
        }
        // Default tracer line for non-kaiju bots
        const [r, g, b] = bot.spec.color;
        if (this.particles?.spawn) {
            const dx = playerPos.x - bot.x;
            const dy = (playerPos.y - bot.y);
            const dz = playerPos.z - bot.z;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const steps = Math.min(20, Math.floor(dist));
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                this.particles.spawn({
                    x: bot.x + dx * t,
                    y: bot.y + 1.5 + dy * t,
                    z: bot.z + dz * t,
                    ttl: 0.15, size: 0.18,
                    r, g, b, a: 0.9,
                });
            }
        }
        if (this.fpsShooter?.takeDamage) {
            this.fpsShooter.takeDamage(bot.spec.damage, bot.entityId);
        }
    }

    // Round 233 — visualize a kaiju attack based on its family. Damage
    // is applied at fire time (same as other bots) so the visual is
    // decoupled from hit timing — the player can't tell whether the
    // damage arrived with the visual or just before it, and the gain
    // in clarity ("you got hit by a fireball, not lightning") is real.
    //
    // Families:
    //   beam       — dense line of particles bot→player; lightning is
    //                special-cased to drop from above the player
    //   projectile — single fast-moving head + sparse trail along arc
    //   aoe        — expanding ring of particles at the player's feet
    _fireKaijuAttack(bot, playerPos, attack, attackName) {
        // Round 274 — mega-attack variants for absorb-tier kaiju. At
        // tier 7+ the absorbed energy converts into a damage + range
        // multiplier on the kaiju's outgoing attacks. Tier 7 = 1.5×,
        // tier 8 = 2×, tier 9 = 3× damage. (Tier 10 is termination —
        // attack never fires because the kaiju is gone.)
        const km = this.kaijuManager;
        let kSelf = null;
        if (km?.kaiju && bot.spec?.kaijuOrigin) {
            for (const k of km.kaiju.values()) {
                if (k.kind !== bot.spec.kaijuOrigin) continue;
                const dx = k.position.x - bot.x;
                const dz = k.position.z - bot.z;
                if (dx*dx + dz*dz > 0.6 * 0.6) continue;
                kSelf = k; break;
            }
        }
        const megaMul = (kSelf && kSelf.absorbTier >= 7)
            ? (kSelf.absorbTier === 7 ? 1.5 : kSelf.absorbTier === 8 ? 2.0 : 3.0)
            : 1.0;
        if (megaMul > 1) {
            // Clone the attack with bumped damage + range. Doesn't
            // mutate the shared KAIJU_ATTACKS registry.
            attack = { ...attack,
                damage: attack.damage * megaMul,
                range:  attack.range  * Math.min(1.6, 1 + (megaMul - 1) * 0.3),
            };
        }
        const [ar, ag, ab] = attack.color || bot.spec.color;
        const family = attack.family;
        let sx = bot.x, sy = bot.y + 1.5, sz = bot.z;
        // v829/v831 — resolve attack.originBone via rigSystem if the kaiju has
        // a rig bridge attached. Particles + projectiles spawn from the
        // anatomically-correct bone (mouth, eye, claw) instead of bot center.
        // v831 — cached boneIdx lookup avoids re-scanning rig.bones on every
        // attack fire (~25 attacks × N kaiju × per-frame searches add up).
        if (attack.originBone && window.rigSystem) {
            const ownerId = bot.id;
            // Cache key: "ownerId|boneName". Cache stored on the BotManager
            // so it's per-instance + GC'd with the manager.
            this._boneIdxCache = this._boneIdxCache || new Map();
            // v833 — per-bridge gen counter. If the bridge for this owner
            // is replaced, its _gen changes and the cache entry invalidates
            // only for THIS owner's cached lookups (not all owners' caches).
            const bridge = window.rigSystem._entityBridges?.get(ownerId);
            const gen = bridge?._gen ?? window.rigSystem._bridgeGen ?? 0;
            const cacheKey = ownerId + "|" + attack.originBone;
            let cached = this._boneIdxCache.get(cacheKey);
            if (!cached || cached.gen !== gen) {
                const idx = window.rigSystem.boneIdxByName(ownerId, attack.originBone);
                cached = { idx, gen };
                this._boneIdxCache.set(cacheKey, cached);
            }
            if (cached.idx >= 0) {
                const bonePos = window.rigSystem.getBoneWorldPos(ownerId, cached.idx);
                if (bonePos) { sx = bonePos[0]; sy = bonePos[1]; sz = bonePos[2]; }
            }
        }
        const tx = playerPos.x, ty = playerPos.y, tz = playerPos.z;
        // Round 248 — sprite-derived visual modifiers. Each kaiju attack
        // carries a SPRITE id (CIRCLE/SMOKE/SPARK/DUST/EMBER/GLYPH/HALO/RUNE)
        // that the v1 particle system ignored. We honor it here by scaling
        // particle size/count/ttl, giving each attack a distinct readable
        // signature — without needing a real texture atlas.
        const mod = SPRITE_MODS[attack.sprite | 0] || SPRITE_MODS_DEFAULT;

        // Round 234 — name-specific king visualizations. These are
        // cosmetic overrides on top of the family branches; for the
        // king-tier attacks the signature visuals matter more than
        // the generic family shape.
        if (attackName === "deluge") {
            // Heavy vertical rain — sustained downpour over a wide
            // area around the player. ~40 blue droplets falling from
            // y+12 downward, scattered within a 5u radius.
            for (let i = 0; i < 40; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * 5;
                this.particles.spawn({
                    x: tx + Math.cos(a) * r,
                    y: ty + 8 + Math.random() * 6,
                    z: tz + Math.sin(a) * r,
                    vy: -14 - Math.random() * 6,
                    ttl: 0.7, size: 0.18,
                    r: ar, g: ag, b: ab, a: 0.85,
                });
            }
            // Splash ring at ground level
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * Math.PI * 2;
                this.particles.spawn({
                    x: tx + Math.cos(a) * 0.6,
                    y: ty + 0.1,
                    z: tz + Math.sin(a) * 0.6,
                    vx: Math.cos(a) * 2, vy: 1, vz: Math.sin(a) * 2,
                    ttl: 0.5, size: 0.22,
                    r: 0.6, g: 0.8, b: 1.0, a: 0.7,
                    gravity: -1.5,
                });
            }
            return;
        }
        if (attackName === "typhoon") {
            // Rotating debris vortex around the player. 24 particles
            // arranged around a ring with TANGENTIAL velocity, plus a
            // central updraft.
            for (let i = 0; i < 24; i++) {
                const a = (i / 24) * Math.PI * 2;
                const r = 1.5 + Math.random() * 1.5;
                const px = tx + Math.cos(a) * r;
                const pz = tz + Math.sin(a) * r;
                // Tangential velocity (perpendicular to radius)
                const tangentX = -Math.sin(a) * 6;
                const tangentZ = Math.cos(a) * 6;
                this.particles.spawn({
                    x: px, y: ty + Math.random() * 2.5, z: pz,
                    vx: tangentX, vy: 1.5 + Math.random(), vz: tangentZ,
                    ttl: 0.8, size: 0.28,
                    r: ar, g: ag, b: ab, a: 0.85,
                    gravity: -0.8,
                });
            }
            return;
        }
        if (attackName === "plague") {
            // Lingering green particle cloud at the player's position.
            // Slow-moving, longer TTL — reads as a sustained sickly
            // miasma rather than a single hit.
            for (let i = 0; i < 28; i++) {
                this.particles.spawn({
                    x: tx + (Math.random() - 0.5) * 3,
                    y: ty + Math.random() * 2.5,
                    z: tz + (Math.random() - 0.5) * 3,
                    vx: (Math.random() - 0.5) * 1.2,
                    vy: 0.4 + Math.random() * 0.6,
                    vz: (Math.random() - 0.5) * 1.2,
                    ttl: 1.5 + Math.random(),
                    size: 0.40 + Math.random() * 0.20,
                    r: ar, g: ag, b: ab, a: 0.55,
                    gravity: -0.3,
                });
            }
            return;
        }
        if (attackName === "flamethrower") {
            // Cone of fire from bot toward player. Multiple particles
            // spread within ~20° cone, fast-moving, short-lived.
            const dx = tx - sx, dy = ty - sy, dz = tz - sz;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const dirX = dx / dist, dirY = dy / dist, dirZ = dz / dist;
            // Perpendicular vectors for cone spread
            const upX = 0, upY = 1, upZ = 0;
            // right = dir × up (cross product)
            const rightX = dirY * upZ - dirZ * upY;
            const rightY = dirZ * upX - dirX * upZ;
            const rightZ = dirX * upY - dirY * upX;
            for (let i = 0; i < 24; i++) {
                const spread = 0.25;
                const sx1 = (Math.random() - 0.5) * spread;
                const sy1 = (Math.random() - 0.5) * spread;
                const speed = 18 + Math.random() * 6;
                this.particles.spawn({
                    x: sx, y: sy, z: sz,
                    vx: (dirX + rightX * sx1) * speed,
                    vy: (dirY + sy1) * speed,
                    vz: (dirZ + rightZ * sx1) * speed,
                    ttl: 0.35 + Math.random() * 0.15,
                    size: 0.32 + Math.random() * 0.16,
                    // Hot-to-cool fade: yellow/orange near origin
                    r: 1.0, g: 0.55 + Math.random() * 0.25, b: 0.15,
                    a: 0.95,
                    gravity: -1,
                });
            }
            return;
        }

        if (family === "beam") {
            if (attackName === "lightning") {
                // Vertical lightning column striking down on the player
                const top = ty + 14;
                const steps = 18;
                for (let i = 0; i < steps; i++) {
                    const t = i / steps;
                    // Add small horizontal jitter so the bolt feels electric
                    const jx = (Math.random() - 0.5) * 0.4;
                    const jz = (Math.random() - 0.5) * 0.4;
                    this.particles.spawn({
                        x: tx + jx, y: top - t * (top - ty + 0.5), z: tz + jz,
                        ttl: 0.22 + Math.random() * 0.08,
                        size: 0.32 + Math.random() * 0.12,
                        r: ar, g: ag, b: ab, a: 0.95,
                    });
                }
                // Bright flash at the impact point
                for (let i = 0; i < 8; i++) {
                    const a = (i / 8) * Math.PI * 2;
                    this.particles.spawn({
                        x: tx + Math.cos(a) * 0.4,
                        y: ty + 0.2,
                        z: tz + Math.sin(a) * 0.4,
                        vx: Math.cos(a) * 3, vy: 0.5, vz: Math.sin(a) * 3,
                        ttl: 0.3, size: 0.30,
                        r: 1, g: 1, b: 0.7, a: 0.8,
                    });
                }
                return;
            }
            // Generic beam — denser/brighter than tracer, from bot to player
            const dx = tx - sx, dy = ty - sy, dz = tz - sz;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const steps = Math.max(20, Math.min(45, Math.floor(dist * 1.8 * mod.countBoost)));
            for (let i = 0; i < steps; i++) {
                const t = i / steps;
                this.particles.spawn({
                    x: sx + dx * t, y: sy + dy * t, z: sz + dz * t,
                    ttl: 0.30 * mod.ttlBoost, size: 0.28 * mod.sizeBoost,
                    r: ar, g: ag, b: ab, a: 0.95,
                });
            }
            // Muzzle flash at the bot end
            for (let i = 0; i < 6; i++) {
                this.particles.spawn({
                    x: sx + (Math.random()-0.5)*0.4,
                    y: sy + (Math.random()-0.5)*0.4,
                    z: sz + (Math.random()-0.5)*0.4,
                    ttl: 0.18, size: 0.36,
                    r: 1, g: 1, b: 1, a: 0.7,
                });
            }
            return;
        }

        if (family === "projectile") {
            // Fast-moving "head" particle with velocity toward player +
            // trail of slower particles spread along the path. The head
            // uses ttl/velocity so it actually travels; the trail uses
            // pre-positioned particles with brief lives to suggest motion.
            const dx = tx - sx, dy = ty - sy, dz = tz - sz;
            const dist = Math.hypot(dx, dy, dz) || 1;
            const speed = 32;             // m/s — fast enough to read as projectile
            const ttl = dist / speed;
            // Head
            this.particles.spawn({
                x: sx, y: sy, z: sz,
                vx: dx / ttl, vy: dy / ttl + 1.5, vz: dz / ttl,
                ttl: ttl + 0.05,
                size: 0.55 * mod.sizeBoost,
                r: ar, g: ag, b: ab, a: 1.0,
                gravity: -3,            // small arc downward
            });
            // Sparse trail — 8 particles distributed along the path,
            // each with a short TTL so they fade quickly
            const trailCount = Math.max(4, Math.round(8 * mod.countBoost));
            for (let i = 0; i < trailCount; i++) {
                const t = i / trailCount;
                this.particles.spawn({
                    x: sx + dx * t * 0.3,
                    y: sy + dy * t * 0.3,
                    z: sz + dz * t * 0.3,
                    vx: dx / ttl * (1 - t * 0.5),
                    vy: dy / ttl * (1 - t * 0.5) + 0.8,
                    vz: dz / ttl * (1 - t * 0.5),
                    ttl: (0.20 + Math.random() * 0.15) * mod.ttlBoost,
                    size: (0.28 + Math.random() * 0.08) * mod.sizeBoost,
                    r: ar * 0.9, g: ag * 0.5, b: ab * 0.3, a: 0.75,
                    gravity: -1,
                });
            }
            return;
        }

        if (family === "aoe") {
            // Expanding ring of particles centered on the player.
            // Suggests an area effect rather than a focused hit.
            const ringCount = Math.max(8, Math.round(16 * mod.countBoost));
            for (let i = 0; i < ringCount; i++) {
                const a = (i / ringCount) * Math.PI * 2;
                this.particles.spawn({
                    x: tx + Math.cos(a) * 0.3,
                    y: ty + 0.1,
                    z: tz + Math.sin(a) * 0.3,
                    vx: Math.cos(a) * 4.5,
                    vy: 0.8,
                    vz: Math.sin(a) * 4.5,
                    ttl: 0.55 * mod.ttlBoost, size: 0.34 * mod.sizeBoost,
                    r: ar, g: ag, b: ab, a: 0.9,
                    gravity: -0.5,
                });
            }
            // Central pulse
            const pulseCount = Math.max(4, Math.round(8 * mod.countBoost));
            for (let i = 0; i < pulseCount; i++) {
                this.particles.spawn({
                    x: tx + (Math.random()-0.5)*0.6,
                    y: ty + Math.random() * 1.5,
                    z: tz + (Math.random()-0.5)*0.6,
                    vy: 2 + Math.random() * 2,
                    ttl: 0.45 * mod.ttlBoost, size: 0.40 * mod.sizeBoost,
                    r: ar, g: ag, b: ab, a: 0.85,
                    gravity: -1.5,
                });
            }
            return;
        }

        // Unknown family — fall back to the tracer line
        const [r, g, b] = bot.spec.color;
        const dx = tx - sx, dy = ty - sy, dz = tz - sz;
        const dist = Math.hypot(dx, dy, dz) || 1;
        const steps = Math.min(20, Math.floor(dist));
        for (let i = 0; i < steps; i++) {
            const t = i / steps;
            this.particles.spawn({
                x: sx + dx * t, y: sy + dy * t, z: sz + dz * t,
                ttl: 0.15, size: 0.18,
                r, g, b, a: 0.9,
            });
        }
    }

    // Round 243 — water-aware bot speed. Returns a multiplier to apply
    // to base speed based on (a) the depth of water in the bot's current
    // room and (b) whether the bot is a water-origin kaiju.
    //   • water kaiju in deep water (≥3) → 1.30  (at home, hunts faster)
    //   • non-water kaiju in deep water  → 0.40  (badly slowed)
    //   • anyone in shallow/dry           → 1.00  (default)
    // Wading depth (3-4) and swimming depth (5+) both count as "deep"
    // for this purpose — the AI doesn't know the difference, and the
    // gameplay effect is the same: don't go in there unless you're built
    // for it.
    _waterSpeedMul(bot) {
        const depth = this._botRoomWaterDepth(bot);
        if (depth < 3) return 1.0;
        const origin = bot?.spec?.kaijuOrigin;
        if (origin === "water") return 1.30;
        return 0.40;
    }

    _botRoomWaterDepth(bot) {
        const layout = this.fpsShooter?.ollamaLevelGen?._lastLevel
            || this._ollamaLevelGen?._lastLevel
            || null;
        if (!layout?.rooms?.length) return 0;
        const bx = bot.x, bz = bot.z;
        for (const r of layout.rooms) {
            if (bx >= r.x && bx < r.x + r.w && bz >= r.z && bz < r.z + r.d) {
                return r.water | 0;
            }
        }
        return 0;
    }

    _followPathOrSteer(bot, gx, gz, dt, speedMul) {
        const speed = bot.spec.speed * speedMul;
        const path = bot.path;
        let tx, tz;
        if (path && bot.pathIdx < path.length) {
            // Follow current waypoint
            const wp = path[bot.pathIdx];
            tx = wp.x; tz = wp.z;
            const wdx = tx - bot.x, wdz = tz - bot.z;
            if (Math.hypot(wdx, wdz) < 1.5) {
                bot.pathIdx++;
                if (bot.pathIdx >= path.length) {
                    bot.path = null;
                    bot.pathIdx = 0;
                }
            }
        } else {
            tx = gx; tz = gz;
        }
        const dx = tx - bot.x, dz = tz - bot.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.01) {
            bot.x += (dx / dist) * speed * dt;
            bot.z += (dz / dist) * speed * dt;
            bot.yaw = Math.atan2(dx, dz);
        }
        // Snap Y to surface
        try { bot.y = (this.world?._heightAt?.(bot.x, bot.z) ?? bot.y) + 1; } catch {}
    }

    _requestPath(bot, gx, gz) {
        if (!this.pathfinderPool) return;
        // Round 276 — gate A* pathing to contexts that actually need it.
        // The bot patrol AI fires _requestPath every few seconds even
        // for off-OGRE demos (cube_d3d11, parallax_studio, etc.) which
        // burns the pathfinder workers + the worker-pool counters for
        // no visual benefit. Gate the call: only plan when an OGRE
        // scenario is live OR when the kaiju sandbox is up — those are
        // the modes where bots actually navigate complex environments.
        const ogreActive    = (window.ogreScenario?.active === true);
        const sandboxActive = (window.kaijuCity?.isActive?.() === true);
        const fpsActive     = (this.fpsShooter?.active === true);
        if (!ogreActive && !sandboxActive && !fpsActive) return;     // skip — direct steering only
        bot.pathRequestPending = true;
        const reqId = ++bot.pathRequestId;
        const t0 = performance.now();
        this.pathfinderPool.plan(bot.x, bot.z, gx, gz).then((res) => {
            // Stale check
            if (reqId !== bot.pathRequestId || !this.bots.has(bot.entityId)) return;
            bot.pathRequestPending = false;
            bot.lastPathTime = performance.now();
            if (res.found && Array.isArray(res.path)) {
                bot.path = res.path;
                bot.pathIdx = 0;
                this._counters.paths++;
            } else {
                this._counters.pathsFailed++;
                // Fall back to direct steering by leaving path null
            }
        }).catch(() => {
            bot.pathRequestPending = false;
        });
    }

    _playerPos() {
        const cam = this.fpsShooter?.camera;
        if (!cam?.position) return { x: 0, y: 0, z: 0, valid: false };
        return {
            x: cam.position.x,
            y: cam.position.y,
            z: cam.position.z,
            valid: this.fpsShooter.active === true,
        };
    }

    _updateEntityTransform(bot) {
        if (!this.ecsWorld?.getComponent) return;
        try {
            const pos = this.ecsWorld.getComponent(bot.entityId, "Position");
            if (pos) {
                pos.x = bot.x; pos.y = bot.y; pos.z = bot.z;
                // Round 255 — use interpolated _displayYaw if the bot
                // opted into smoothYaw, else snap to true yaw.
                pos.yaw = bot._displayYaw ?? bot.yaw;
            }
        } catch {}
    }

    clear() {
        for (const [id, _] of [...this.bots]) {
            try { this.router?.exec({ type: "entity:despawn", id }); } catch {}
            this.fpsShooter?.unregisterEnemy?.(id);
        }
        this.bots.clear();
    }

    // Round 273 — single-bot despawn for demos that own a fixed set of
    // bots and want to clean up just those on exit.
    despawn(id) {
        if (!this.bots.has(id)) return false;
        try { this.router?.exec({ type: "entity:despawn", id }); } catch {}
        this.fpsShooter?.unregisterEnemy?.(id);
        this.bots.delete(id);
        return true;
    }

    // Round 273 — read the spec for a given bot kind. Demos use this
    // to look up voice profiles and speech lines without having to
    // spawn the bot first.
    specFor(kind) {
        return BOT_KINDS[kind] || null;
    }

    count() { return this.bots.size; }
    getStats() { return { ...this._counters, alive: this.bots.size }; }
}
