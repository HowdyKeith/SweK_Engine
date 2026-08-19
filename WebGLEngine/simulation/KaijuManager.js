// FILE: simulation/KaijuManager.js
// VERSION: v2 — multiple kinds + spawn origins
//
// Owns the live kaiju set, drives ticks, dispatches damage actions,
// and publishes lifecycle events on the civEvents bus.
//
// v2 changes:
//   * Auto-spawn picks a random KIND from kaijuKinds.js, not always
//     sky. Each kind has its own spawn position picker that decides
//     where the kaiju enters the world.
//   * Spawn fires an origin-themed debris burst (lava chunks for
//     hell, water splash for water, stone for sky, etc.) via
//     voxelDebrisSystem if available.
//   * Hell kaiju additionally carve a lava ring at the spawn point
//     using structureBuilder primitives — a signature visual for the
//     most dramatic origin.
//
// Spawn triggers:
//   * Auto: random per-tick check, ~1/60s on average.
//   * Manual: summon() called from Settings debug button (which
//     cycles through kinds across clicks for easy showcasing).

import { availableAttacksFor, getAttackForKind, getAttackForKaiju, KAIJU_ATTACKS, KIND_TO_ATTACK, KIND_TO_ATTACK_ALT, KIND_TO_ATTACK_ALT2, KING_ATTACK_ROTATION, KING_ATTACK_OVERRIDES, advanceKingAttackRotation } from "../world/kaijuAttacks.js";
// v770 — apply status effects from attack metadata. Mirrors what
// CentipedeManager has done since v769 so real kaiju (not just
// centipedes) actually apply acid DoT / slow / disabled / pulled.
import { applyEffect as applyStatusEffect } from "./statusEffects.js";
import { Kaiju } from "./Kaiju.js";
import { PathPlanner } from "./PathPlanner.js";
import { pickKindConfig, biomeWeightedKind } from "../world/kaijuKinds.js";
import { expandStructures } from "../world/structureBuilder.js";
import { civHueRGB } from "../world/civColors.js";
import { getOverride } from "../gpu/assetOverrides.js";
import { VOXEL } from "../world/voxelFormat.js";   // round 128 — crater carving
import { makeKaijuRivalry } from "./KaijuRivalry.js";   // round 287
import { makeKingPack } from "./KingPack.js";            // round 287

// Round 52 - skeletal animation clip mapping for kaiju FSM states.
// Standard glTF rig clip names: rigs ship with "idle"/"walk"/"attack"/
// "death" at minimum. If a clip is missing on a given rig, the renderer
// silently keeps whatever clip is active (setClipByName is a no-op for
// unknown names), so this is safe regardless of which kaiju is involved.
// Some kinds (e.g., flying alien) may swap "walk" -> "fly" via a per-
// kind override; for now we use generic names.
const STATE_TO_CLIP = {
    spawning:   "idle",
    seeking:    "walk",
    engaging:   "attack",
    retreating: "walk",
    dying:      "death",
};

// Round 56 - per-kind clip override. OGRE doesn't stop walking to attack
// (its turrets do that), and flying kinds shouldn't "walk" — they "fly".
// If a kind isn't in this map, falls through to STATE_TO_CLIP. If a STATE
// isn't in the kind's map, also falls through to STATE_TO_CLIP[state].
// Per-state lookup, not per-kind-replaces-whole-map.
const KIND_TO_CLIPS = {
    // OGRE-class kinds: chassis keeps walking through engagement; the
    // hardpoints + turrets are the actual weapons.
    ogre: {
        engaging:   "walk",
        retreating: "walk",
    },
    // Sky/space/tech: flying kinds. "walk" -> "fly" when the rig has
    // a fly clip; otherwise the fuzzy matcher falls back to whatever
    // it can find. "walk" stays as the fallback name.
    sky:   { seeking: "fly",   retreating: "fly" },
    space: { seeking: "fly",   retreating: "fly" },
    tech:  { seeking: "fly",   retreating: "fly" },
    // Water: swimming locomotion
    water: { seeking: "swim",  retreating: "swim" },
};

function clipForKaijuState(kind, state) {
    const kindMap = KIND_TO_CLIPS[kind];
    if (kindMap && kindMap[state]) return kindMap[state];
    return STATE_TO_CLIP[state] || "idle";
}

const SPAWN_RATE_PER_S      = 1 / 60;
const MAX_KAIJU              = 6;     // v3: bumped from 4 so duels are likely
const DEBRIS_BURSTS_ON_SPAWN = 3;

export class KaijuManager {
    constructor(opts = {}) {
        this.civManager = opts.civManager;
        this.router     = opts.router  || null;
        this.events     = opts.eventBus || null;
        this.debris     = opts.debris  || null;     // optional VoxelDebrisSystem
        this.world      = opts.world   || null;     // optional, for terrain lookups
        this.biomeMap   = opts.biomeMap || null;    // Round 29+ — biome-weighted spawn kind
        this.assetLoader = opts.assetLoader || null; // round 14 — GLB attachment
        this.treeSpawner = opts.treeSpawner || null;     // round 21 — tree grab
        this.projectileManager = opts.projectileManager || null; // round 21
        // Round 126 — OGRE scenario reference for hellspawn-vs-ogre.
        // Set via setOgreScenario() so the engine boot order doesn't
        // force a constructor-time dependency (main.js wires this
        // after both managers exist).
        this.ogreScenario = opts.ogreScenario || null;

        this.kaiju = new Map();
        this.nextId = 1;
        this._libByKind = {}; this._libAny = [];   // v1373 — asset-roles library models usable as kaiju bodies
        this._engagedFlags = new Map();

        // Round 287 — kaiju-vs-kaiju ranged duels + king pack mechanics
        this._rivalry = makeKaijuRivalry();
        this._kingPack = makeKingPack();
        this._lastSeenKings = new Set();    // for death detection

        // Round 158 — pathfinder for ground kaiju. Constructed only
        // when world exposes a height query; otherwise kaiju fall back
        // to straight-line movement (the pre-158 behavior). Tuned for
        // a 4u grid: ~50x50 cells covers a 200u kaiju seek radius
        // comfortably within the 2000-node search budget.
        this.pathPlanner = null;
        if (this.world && typeof this.world._heightAt === "function") {
            this.pathPlanner = new PathPlanner({
                heightAt: (x, z) => this.world._heightAt(x, z),
                gridSize: 4,
                maxStepUp: 3,
                maxStepDown: 6,
                maxSearch: 2000,
                slopePenalty: 0.4,
            });
        }

        this.spawnsTotal = 0;
        this.deathsTotal = 0;

        // Round 10 — civs in desperation publish summon_kaiju on the
        // shared event bus; we subscribe here and spawn an allied
        // kaiju on demand.
        // Round 126 — also subscribe to summon_hellspawn_kaiju, a
        // distinct event published when a civ summons specifically to
        // attack the OGRE (separate from generic desperation summon).
        if (this.events) {
            this.events.subscribe((evt) => {
                if (evt.type === "summon_kaiju")            this._handleSummon(evt);
                if (evt.type === "summon_hellspawn_kaiju")  this._handleHellspawnSummon(evt);
            });
        }
    }

    // Round 126 — late-bind OGRE scenario so callers from main.js can
    // wire up after both managers exist.
    setOgreScenario(scenario) {
        this.ogreScenario = scenario;
    }

    // Round 294 — kaiju array cache helpers. Sized to match the Map at
    // tick start. Consumers that need an array (KingPack, KaijuRivalry)
    // get the cache; if the Map mutated mid-tick (a kaiju died or
    // spawned), _getKaijuArray() rebuilds.
    _refreshKaijuArrayCache() {
        if (!this._kaijuArrCache) this._kaijuArrCache = [];
        this._kaijuArrCache.length = 0;
        for (const k of this.kaiju.values()) this._kaijuArrCache.push(k);
        this._kaijuArrCacheSize = this.kaiju.size;
    }

    _getKaijuArray() {
        if (!this._kaijuArrCache || this._kaijuArrCacheSize !== this.kaiju.size) {
            this._refreshKaijuArrayCache();
        }
        return this._kaijuArrCache;
    }

    tick(delta) {
        this._lastDelta = delta;        // round 45 — for king aura cadence
        // Round 294 — build the kaiju array ONCE per tick instead of
        // 3-5 times via separate this._getKaijuArray() calls
        // scattered through the frame. Reused for pack dispersal, rival
        // targeting, demoralized expiry. The cache becomes stale only
        // when kaiju are added/removed during the same tick; consumers
        // that need a fresh view post-mutation call _getKaijuArray()
        // which rebuilds when the size has changed.
        this._refreshKaijuArrayCache();
        if (this.kaiju.size < MAX_KAIJU && Math.random() < SPAWN_RATE_PER_S * delta) {
            this._tryAutoSpawn();
        }

        for (const k of this.kaiju.values()) {
            const wasEngaging = this._engagedFlags.get(k.id) ?? false;
            // Round 274 — ABSORB termination resolution. When a kaiju
            // hits tier 10 and the manager sees _terminating set, fire
            // the chosen termination FX and kill the kaiju. Done before
            // the regular tick so a terminating kaiju never gets another
            // turn of action.
            if (k._terminating && k.state !== "dying") {
                this._fireAbsorbTermination(k);
                continue;
            }
            // Round 274 — sync the live render-scale to bot/entity.
            // absorbScale changes mid-life on absorb hits; without this
            // push the visible mesh stays at its spawn scale. Throttle
            // by checking if _lastSyncedAbsorb differs to avoid setting
            // the component every frame.
            if (typeof k.absorbScale === "number" &&
                k.absorbScale !== k._lastSyncedAbsorb) {
                this._pushAbsorbScale(k);
                k._lastSyncedAbsorb = k.absorbScale;
                // Particle burst on the swell — gives a visible pulse
                // distinguishable from a regular damage flash.
                this._emitAbsorbPulse(k);
            }
            // Pass self so kaiju can see other kaiju (v3 cross-target)
            const actions = k.tick(delta, this.civManager, this);
            for (const a of actions) {
                // Round 20 — kaiju-specific action types intercepted
                // before falling through to the router.
                if (a.type === "kaiju:queen_rises") {
                    this._emit("kaiju_queen_rises", k);
                    continue;
                }
                if (a.type === "kaiju:king_rises") {
                    // Round 36 — king coronation. Bigger event, narrative
                    // "ruler of all kinds" framing.
                    this._emit("kaiju_king_rises", k);
                    continue;
                }
                if (a.type === "kaiju:king_rises") {
                    this._emit("kaiju_king_rises", k);
                    console.log(`[KaijuManager] ${k.name} ascends to KING`);
                    continue;
                }
                if (a.type === "kaiju:queen_spawn") {
                    this._handleQueenSpawn(k, a);
                    continue;
                }
                if (a.type === "kaiju:portal_drop") {
                    this._handlePortalDrop(k, a);
                    continue;
                }
                if (a.type === "kaiju:metal_tree_drop") {
                    this._handleMetalTreeDrop(k, a);
                    continue;
                }
                if (a.type === "kaiju:want_throw") {
                    this._handleThrow(k, a);
                    continue;
                }
                this._dispatch(a);
            }

            // v428 — ground kinds walk ON the terrain. position.y is
            // otherwise never reassigned after spawn, so every kaiju froze
            // at its fixed spawnLandY (20-25) and floated over any eroded
            // valley below that height. Clamp walking kinds to the live
            // surface each frame; flying (sky/space/tech) and swimming
            // (water) kinds keep their own Y by design. Skip during the
            // spawn emergence + death anims so those play out untouched.
            {
                const kd = k.kind;
                if (k.state !== "spawning" && k.state !== "dying") {
                    const gy = this._terrainTop(k.position.x, k.position.z);
                    if (gy > 0) {
                        // v454 — flying kinds cruise at an altitude ABOVE the
                        // terrain (following it) instead of a fixed spawn Y that
                        // left them stranded high in the sky; ground + water
                        // kinds sit on the surface. All kinds now track terrain
                        // so nothing floats over eroded valleys or unloaded land.
                        const flying = (kd === "sky" || kd === "space" || kd === "tech");
                        const swimming = (kd === "water");
                        if (flying) {
                            // v512 — cruise well ABOVE the terrain so flyers read
                            // as flying, not hovering just over the hills. sky is
                            // the highest, then space, then tech.
                            const clr = k._flyClearance || (kd === "sky" ? 34 : kd === "space" ? 28 : 24);
                            const target = gy + clr;
                            k.position.y += (target - k.position.y) * Math.min(1, delta * 1.5);
                        } else if (swimming) {
                            // v512 — amphibious: ride the WATER SURFACE over the sea
                            // (half-submerged = actually IN the ocean), and walk
                            // ashore where the land rises above it. WATER_LEVEL = 8.
                            const target = Math.max(gy, 8);
                            k.position.y += (target - k.position.y) * Math.min(1, delta * 2.0);
                        } else {
                            k.position.y = gy;
                        }
                        // v516 — splash + trailing wake when a kaiju wades or
                        // swims through water (terrain top at/below the sea, or a
                        // swimming kind riding the surface).
                        this._waterWake(k, delta, swimming || gy <= 8);
                    }
                }
            }

            // Round 20 — biome scatter. Each active kaiju scatters its
            // signature material into the terrain around it over time.
            this._biomeScatter(k, delta);

            // Round 30 — kind-specific ranged attack. Lightning/fireball/
            // plasma/ice ray/rad pulse/rock spike based on kaiju.kind.
            this._tickRangedAttack(k);

            const isEngaging = k.state === "engaging";
            const targetType = k.target?.type;

            // Edge-triggered events on transitioning into engaging
            if (!wasEngaging && isEngaging) {
                if (targetType === "kaiju") {
                    // Dedupe: only the lower-id kaiju publishes the
                    // clash event. The other one entering combat at
                    // the same instant would otherwise emit a duplicate.
                    const other = k.target.ref;
                    if (k.id < other.id) {
                        this._emit("kaiju_clash", k, { other });
                    }
                } else if (targetType === "civ") {
                    this._emit("kaiju_engage", k);
                }
            }
            this._engagedFlags.set(k.id, isEngaging);

            // Victory — survivor's _lastVictim is set in Kaiju._engageKaiju
            // when it reduces another kaiju to 0 energy. Manager reads
            // it here, publishes the event, and clears the flag.
            if (k._lastVictim) {
                this._emit("kaiju_victory", k, { victim: k._lastVictim });
                k._lastVictim = null;
            }

            // Round 53 — compute tilt + yaw from movement delta. Tracks
            // _prevPos; horizontal speed scales the tilt amount, vertical
            // change drives the pitch angle. Smooth toward target with
            // an exponential approach.
            const prev = k._prevPos;
            if (!prev) {
                k._prevPos = { x: k.position.x, y: k.position.y, z: k.position.z };
                k.tiltX    = 0;
                k.yaw      = 0;
            } else {
                const dx = k.position.x - prev.x;
                const dy = k.position.y - prev.y;
                const dz = k.position.z - prev.z;
                const horiz = Math.hypot(dx, dz);
                const horizSpeed = horiz / Math.max(0.001, delta);
                // Slope angle: rise / run, clamped at run >= 0.5 to keep
                // the angle bounded when nearly stationary.
                const slopeAngle = Math.atan2(dy, Math.max(0.5, horiz));
                // Speed factor saturates at 5 u/s — kaiju walk-speed
                // ceiling. At rest, factor = 0 → no tilt.
                const speedFactor = Math.min(1, horizSpeed / 5);
                const targetTilt = slopeAngle * speedFactor;
                // Yaw target: heading from horizontal motion, only if
                // moving meaningfully. Otherwise hold last yaw.
                let targetYaw = k.yaw ?? 0;
                if (horiz > 0.05) targetYaw = Math.atan2(dx, dz);
                // Smooth — 1 - exp(-rate * dt) is frame-rate independent
                const lerp = 1 - Math.exp(-8 * delta);
                k.tiltX = (k.tiltX ?? 0) + (targetTilt - (k.tiltX ?? 0)) * lerp;
                // Yaw needs angular wrap-aware lerp
                let dYaw = targetYaw - (k.yaw ?? 0);
                while (dYaw >  Math.PI) dYaw -= 2 * Math.PI;
                while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
                k.yaw = (k.yaw ?? 0) + dYaw * lerp;
                prev.x = k.position.x;
                prev.y = k.position.y;
                prev.z = k.position.z;
            }

            // Round 14 — sync attached mesh entity to kaiju position.
            // Kaiju moves at up to ~5 u/s; per-frame entity:move keeps
            // the mesh visually locked.
            if (k._meshEntityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: k._meshEntityId,
                    x: k.position.x, y: k.position.y, z: k.position.z,
                    yaw:   k.yaw   ?? k.heading ?? 0,    // round 125 — heading from player input
                    tiltX: k.tiltX ?? 0,           // round 53
                });

                // Round 52 - state-driven skeletal animation clip. Map kaiju
                // FSM state to a standard clip name. The renderer's rigged
                // path picks this up via Render.animClip and triggers a
                // soft blend (~200ms) on transitions. If the GLB doesn't
                // have a clip with this name, setClipByName is a no-op
                // (animator keeps its current clip), so this is safe to
                // fire on every state regardless of asset coverage.
                // Round 56 - per-kind override for OGRE/flying/water kinds.
                //
                // Round 125 — when the kaiju is player-driven, the FSM
                // state stays static, so we'd be stuck on whatever clip
                // the AI last selected. Switch to velocity-based clip
                // selection instead: compute speed from position delta
                // and pick idle/walk/run by thresholds. Matches common
                // Mixamo clip names so the standard rigged GLBs play
                // their library locomotion clips out of the box.
                let wantClip;
                let clipKey;
                if (k._isPlayerDriven) {
                    // Compute speed from position delta over delta time
                    let speed = 0;
                    if (k._lastPos) {
                        const dx = k.position.x - k._lastPos.x;
                        const dy = k.position.y - k._lastPos.y;
                        const dz = k.position.z - k._lastPos.z;
                        speed = Math.hypot(dx, dy, dz) / Math.max(delta, 1e-4);
                    }
                    if (!k._lastPos) k._lastPos = { x: 0, y: 0, z: 0 };
                    k._lastPos.x = k.position.x;
                    k._lastPos.y = k.position.y;
                    k._lastPos.z = k.position.z;
                    // Thresholds tuned to the drive speeds set in
                    // _moveKaijuDrive: walk=8 u/s, sprint=14 u/s.
                    if      (speed < 0.5) wantClip = "idle";
                    else if (speed < 11)  wantClip = "walk";
                    else                  wantClip = "run";
                    clipKey = `drive:${wantClip}`;
                } else {
                    wantClip = clipForKaijuState(k.kind, k.state);
                    clipKey = `state:${k.state}`;
                }
                if (k._lastClipKey !== clipKey) {
                    this.router.exec({
                        type: "entity:setAnimClip",
                        id: k._meshEntityId,
                        clip: wantClip,
                    });
                    k._lastClipKey = clipKey;
                    k._lastClipState = k.state;   // preserved for back-compat
                }
            }

            if (!k.isAlive() || k.state === "dying") {
                // Round 287 — if this is a king dying, disperse its pack
                // (apply 20s demoralized status to all aura'd members).
                // Done BEFORE the death-rattle and despawn so the side-
                // effects fire while kaiju list is still complete.
                if (k.becameKing && !k._packDispersed) {
                    k._packDispersed = true;
                    try {
                        const all = this._getKaijuArray();
                        this._kingPack.onKingDeath(k.id, k, all);
                    } catch (e) {
                        console.warn("[KingPack.onKingDeath]", e?.message ?? e);
                    }
                }
                // Round 50 - death-rattle. Kings fire one final attack
                // at their last target on death. Bypasses cooldown.
                // Limited to kings so non-king deaths don't spam.
                // Skip if no last target (kaiju died idle) or target's
                // already gone. Wrapped in try/catch so a buggy attack
                // can't block the despawn pipeline.
                if (k.becameKing && k._lastAttackTarget) {
                    try {
                        const finalAttack = getAttackForKaiju(k);
                        if (finalAttack) {
                            if (finalAttack.family === "beam")        this._executeBeam(k, finalAttack, k._lastAttackTarget);
                            else if (finalAttack.family === "projectile") this._executeProjectileAttack(k, finalAttack, k._lastAttackTarget);
                            else if (finalAttack.family === "aoe")    this._executeAoEAttack(k, finalAttack, k._lastAttackTarget);
                            if (this.events?.publish) {
                                this.events.publish({
                                    type: "kaiju_death_rattle",
                                    kaijuId: k.id, kaijuName: k.name, kaijuKind: k.kind,
                                    verb: finalAttack.narrativeVerb,
                                    x: k.position.x, y: k.position.y, z: k.position.z,
                                });
                            }
                        }
                    } catch (e) {
                        console.warn("[KaijuManager] death-rattle failed:", e);
                    }
                }
                // Round 14 — despawn attached mesh entity before removing
                // kaiju. Otherwise the mesh would float orphaned in space.
                if (k._meshEntityId != null && this.router) {
                    this.router.exec({
                        type: "entity:despawn",
                        id: k._meshEntityId,
                    });
                }

                this._emit("kaiju_death", k);
                this.kaiju.delete(k.id);
                this._engagedFlags.delete(k.id);
                this.deathsTotal++;
            }
        }

        // Round 36 — apply king buff aura to nearby kaiju each tick.
        // _attackBuffMul is read by ranged attacks + tree throws and
        // reset to 1.0 by the king-aura scan each frame.
        this._applyKingAuras();
        // Round 287 — expire demoralized statuses after their 20s window
        try {
            this._kingPack.tickDemoralized(this._getKaijuArray(), this._lastDelta);
        } catch (e) {
            console.warn("[KingPack.tickDemoralized]", e?.message ?? e);
        }
        this._scanDuels();
        // Round 15 — tick hell portals (open → spew imps → fade)
        this._tickHellPortals(this._lastDelta);
        // Round 127 — tick civ-summoned hellspawn portal channels
        // (caster + entrance/exit portals visible for ~8s before despawn)
        this._tickHellspawnChannels(this._lastDelta);

        // Round 38 — FP-mode danger trigger. If camera is in FP mode
        // and any kaiju is within 25u, fire danger sting once (8s
        // global cooldown to avoid spam during prolonged proximity).
        const cam = window._fpCamera ?? null;
        if (cam && cam.mode === "fp" && window.audioManager?.triggerDanger) {
            const now = performance.now();
            if (now - (this._lastDangerSting ?? -Infinity) > 8000) {
                let nearest = Infinity;
                for (const k of this.kaiju.values()) {
                    if (!k.isAlive || !k.isAlive()) continue;
                    const dx = k.position.x - cam.position.x;
                    const dy = k.position.y - cam.position.y;
                    const dz = k.position.z - cam.position.z;
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 < nearest) nearest = d2;
                }
                if (nearest < 25 * 25) {
                    window.audioManager.triggerDanger(2);
                    this._lastDangerSting = now;
                }
            }
        }
    }

    // Round 36 — detect mutual targeting between kaiju. Two kaiju
    // each having the other as their current target = a duel. Mark
    // k.duelMode = true so cooldown halves; emit kaiju_duel event
    // edge-triggered to feed cinematics + narrative.
    _scanDuels() {
        // Reset all duel flags first
        for (const k of this.kaiju.values()) {
            k.duelMode = false;
        }
        if (!this._duelPairs) this._duelPairs = new Set();
        const stillActive = new Set();

        const all = this._getKaijuArray();
        for (const a of all) {
            const tgt = a.target?.ref;
            if (a.target?.type !== "kaiju" || !tgt) continue;
            // Mutual? — check that target.ref's target is back at a
            const tgtTgt = tgt.target?.ref;
            if (tgt.target?.type !== "kaiju" || tgtTgt !== a) continue;
            // Mutual pair confirmed
            const pairKey = a.id < tgt.id ? `${a.id}|${tgt.id}` : `${tgt.id}|${a.id}`;
            stillActive.add(pairKey);
            a.duelMode = true;
            tgt.duelMode = true;
            // Edge-trigger event
            if (!this._duelPairs.has(pairKey) && a.id < tgt.id) {
                this._emitDuel(a, tgt);
            }
        }

        // Reset old pairs no longer active so re-entering re-fires event
        this._duelPairs = stillActive;
    }

    _emitDuel(a, b) {
        if (!this.events?.publish) return;
        const midX = (a.position.x + b.position.x) / 2;
        const midY = (a.position.y + b.position.y) / 2;
        const midZ = (a.position.z + b.position.z) / 2;
        // Round 14 — DUEL cinematic burst. Bright crossed sparks at
        // midpoint, ground dust ring, dramatic synth sting.
        if (this.particles?.spawn) {
            // Centered radial burst
            for (let n = 0; n < 60; n++) {
                const ang = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 6;
                this.particles.spawn({
                    x: midX, y: midY + 2 + Math.random() * 2, z: midZ,
                    vx: Math.cos(ang) * speed,
                    vy: 1 + Math.random() * 4,
                    vz: Math.sin(ang) * speed,
                    ttl: 1.0, size: 0.55,
                    r: 1.0, g: 1.0, b: 0.7, a: 1.0,
                    gravity: 10,
                });
            }
            // Ground dust ring
            for (let n = 0; n < 36; n++) {
                const ang = Math.random() * Math.PI * 2;
                const r = 4 + Math.random() * 3;
                this.particles.spawn({
                    x: midX + Math.cos(ang) * r,
                    y: midY - 1, z: midZ + Math.sin(ang) * r,
                    vy: 0.5 + Math.random() * 1.5,
                    ttl: 0.8, size: 0.6,
                    r: 0.7, g: 0.6, b: 0.5, a: 0.7,
                    gravity: 7,
                });
            }
        }
        // Audio sting via OGRE phase-transition cue (dramatic descender)
        if (typeof window !== "undefined" && window.audioManager?.audio?.playSpatial) {
            try {
                window.audioManager.audio.playSpatial("ogre_phase_transition", midX, midY, midZ, this.camera);
            } catch {}
        }
        this.events.publish({
            type: "kaiju_duel",
            kaijuAId: a.id, kaijuAName: a.name, kaijuAKind: a.kind,
            kaijuBId: b.id, kaijuBName: b.name, kaijuBKind: b.kind,
            x: midX, y: midY, z: midZ,
            aX: a.position.x, aY: a.position.y, aZ: a.position.z,
            bX: b.position.x, bY: b.position.y, bZ: b.position.z,
        });
        console.log(`[KaijuManager] duel: ${a.name} (${a.kind}) vs ${b.name} (${b.kind})`);
    }

    // Manual summon entry point. opts.kind picks origin; if absent,
    // falls back to "sky". opts.x/y/z override the kind's default
    // spawn position picker if provided.
    summon(opts = {}) {
        if (this.kaiju.size >= MAX_KAIJU) {
            console.warn(`[KaijuManager] at MAX_KAIJU=${MAX_KAIJU}, ignoring summon`);
            return null;
        }
        const kind = opts.kind ?? "sky";
        const config = pickKindConfig(kind);

        // Resolve spawn position. Caller can pass explicit coords;
        // otherwise we ask the kind config to pick one based on the
        // chosen target.
        let spawnPos;
        if (opts.x != null && opts.y != null && opts.z != null) {
            spawnPos = { x: opts.x, y: opts.y, z: opts.z };
        } else {
            const civs = this.civManager?.getAll() ?? [];
            let target;
            if (civs.length === 0) {
                // v2152 -- an empty world used to ABORT the summon (console.warn only),
                // so the Summon button looked dead: "nothing happens". The control panel
                // literally offers "Summon kaiju (at camera)", and a kaiju with no target
                // civ is already a supported spawn path (see targetCivId: null below).
                // pickSpawnPos only reads target.center.{x,z}, so a synthetic target
                // centred on the camera is enough. No civs is now a fallback, not a dead end.
                const cam = opts.camera
                    ?? (typeof window !== "undefined" ? (window._camera && window._camera.position) : null);
                if (!cam || !Number.isFinite(cam.x) || !Number.isFinite(cam.z)) {
                    console.warn("[KaijuManager] no civs and no camera position — summon aborted");
                    return null;
                }
                target = { id: null, center: { x: cam.x, z: cam.z } };
                console.log("[KaijuManager] no civs to target — summoning at the camera instead");
            } else {
                target = opts.targetCivId != null
                    ? civs.find(c => c.id === opts.targetCivId) ?? civs[0]
                    : civs[(Math.random() * civs.length) | 0];
            }
            spawnPos = config.pickSpawnPos(target);
            opts.targetCivId = target.id ?? null;
        }

        return this._spawn({
            x: spawnPos.x, y: spawnPos.y, z: spawnPos.z,
            kind,
            targetCivId: opts.targetCivId,
        });
    }

    getAll() { return [...this.kaiju.values()]; }
    size()   { return this.kaiju.size; }

    // Round 10 — civ in desperation summons a patron kaiju via
    // event bus. KaijuManager spawns a kaiju with allegiance set
    // to the summoner. Allied kaiju never attack their patron.
    _handleSummon(evt) {
        if (this.kaiju.size >= MAX_KAIJU) {
            console.warn(`[KaijuManager] at MAX_KAIJU=${MAX_KAIJU}, ignoring summon from civ ${evt.civId}`);
            return;
        }
        // Random kind — variety in what gets summoned
        const kindNames = ["sky", "space", "cave", "underground", "water", "hell"];
        const kind = kindNames[(Math.random() * kindNames.length) | 0];
        const config = pickKindConfig(kind);

        // Pick a target civ excluding the summoner. If only the
        // summoner exists, the kaiju spawns without a target and
        // wanders idly (still defends if attacked).
        const civs = (this.civManager?.getAll() ?? []).filter(c => c.id !== evt.civId);
        const target = civs.length > 0
            ? civs[(Math.random() * civs.length) | 0]
            : { center: { x: evt.x, y: evt.y, z: evt.z } };
        const pos = config.pickSpawnPos(target);

        const kaiju = this._spawn({
            x: pos.x, y: pos.y, z: pos.z,
            kind,
            targetCivId: target.id ?? null,
            allegiance: evt.civId,
            allegianceColor: civHueRGB(evt.civId),
        });
        if (kaiju) {
            console.log(`[KaijuManager] ${kaiju.name} (${kind}) summoned by civ "${evt.civName ?? evt.civId}"`);
        }
    }

    // Round 126 — civ summons hellspawn kaiju to attack the OGRE.
    // Distinct from generic _handleSummon: spawns hell-themed kaiju
    // (always "hell" kind) marked _targetsOgre so they prioritize the
    // OGRE over civs. Up to 2 per event (intensity-scaled). Spawns
    // near the summoning civ with a hell-portal visual burst.
    //
    // Round 127 — PORTAL TELEPORT. The civ's caster (wizard for
    // religious, tech-tank for militaristic) opens an entrance portal
    // at the civ and an exit portal 70% of the way to the OGRE. The
    // hellspawn emerges at the EXIT portal, dramatically closer to its
    // target, saving the long traversal. Both portals + the caster
    // persist for ~8s with visual particle channeling, then despawn.
    //
    // Eligibility check already happened in CivilizationManager — by
    // the time we get the event the civ has been validated as
    // qualifying (tier, personality, OGRE-active, rate-limit). Our
    // job is just to spawn.
    _handleHellspawnSummon(evt) {
        if (this.kaiju.size >= MAX_KAIJU) {
            console.warn(`[KaijuManager] at MAX_KAIJU=${MAX_KAIJU}, ignoring hellspawn summon from civ ${evt.civId}`);
            return;
        }
        if (!this.ogreScenario?.getOgreState) {
            console.warn(`[KaijuManager] hellspawn summon requested but no OGRE scenario wired`);
            return;
        }
        const ogreState = this.ogreScenario.getOgreState();
        if (!ogreState) {
            console.warn(`[KaijuManager] hellspawn summon requested but OGRE not active`);
            return;
        }

        // Civ position is the channeling origin (where the caster stands).
        const cx = evt.x ?? 0, cz = evt.z ?? 0;
        const cy = this._terrainTop ? this._terrainTop(cx, cz) : (evt.y ?? 0);

        // Exit portal position: 70% of the way from civ to OGRE. Close
        // enough that the kaiju arrives in striking range without
        // landing right on top of the OGRE (which would feel cheap).
        // Lateral jitter avoids two hellspawn from the same civ
        // landing on the same voxel.
        const dxOg = ogreState.x - cx;
        const dzOg = ogreState.z - cz;
        const distOg = Math.hypot(dxOg, dzOg);
        const t = 0.70;                       // travel fraction
        const exitDistFromOgre = Math.max(15, distOg * (1 - t));    // never inside OGRE
        const exitT = 1 - (exitDistFromOgre / distOg);
        let exitX = cx + dxOg * exitT;
        let exitZ = cz + dzOg * exitT;
        // Lateral spread perpendicular to the civ→OGRE axis
        const perpX = -dzOg / (distOg || 1);
        const perpZ =  dxOg / (distOg || 1);

        // Spawn the caster at the civ. Visual marker only — doesn't
        // do damage or take damage. Picks wizard/tank entity kind by
        // civ personality. Religious civs get a wizard, militaristic
        // get a tech tank. Eligibility already ensured one of these
        // two; default to wizard if missing.
        // Personality lives on the event under civPersonality (auto-
        // added by CivManager._emit) AND under .personality (passed
        // via the extras object) — accept either for robustness.
        const civPers = evt.civPersonality ?? evt.personality;
        const casterKind = (civPers === "militaristic")
            ? "caster_tank"
            : "caster_wizard";
        let casterEntityId = null;
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: casterKind,
                kind: casterKind,
                x: cx, y: cy + 0.5, z: cz,
                scale: 1.5,
            });
            if (r?.id != null) casterEntityId = r.id;
        }

        // Spawn the two portal entities (entrance + exit).
        // Round 128 — portal kind varies by civ personality so the
        // visual reads the summoner's nature at a glance:
        //   religious  → "portal_holy"  (white-gold, sacred)
        //   militaristic → "portal_tech" (gunmetal, engineered)
        // Falls back to "hellspawn_portal" (round 15 magenta) for any
        // kind not explicitly recognized — currently unused since
        // eligibility limits to those two personalities, but the
        // fallback keeps the code robust to future personality types.
        const portalKind =
            civPers === "religious"    ? "portal_holy" :
            civPers === "militaristic" ? "portal_tech" :
                                         "hellspawn_portal";
        let entrancePortalId = null, exitPortalId = null;
        if (this.router) {
            const r1 = this.router.exec({
                type: "entity:spawnMesh",
                assetId: portalKind,
                kind: portalKind,
                x: cx, y: cy + 1.5, z: cz,
                scale: 2.0,
            });
            if (r1?.id != null) entrancePortalId = r1.id;

            const exitY = this._terrainTop ? this._terrainTop(exitX, exitZ) : cy;
            const r2 = this.router.exec({
                type: "entity:spawnMesh",
                assetId: portalKind,
                kind: portalKind,
                x: exitX, y: exitY + 1.5, z: exitZ,
                scale: 2.2,
            });
            if (r2?.id != null) exitPortalId = r2.id;
        }

        // Count: 1 by default, 2 if the civ is desperate (low energy)
        const count = (evt.intensity != null && evt.intensity > 0.6) ? 2 : 1;
        const config = pickKindConfig("hell");
        let spawned = 0;
        for (let i = 0; i < count; i++) {
            if (this.kaiju.size >= MAX_KAIJU) break;
            // Spawn at the EXIT portal with small angular offset so
            // multiple hellspawn fan out
            const angle = (i / Math.max(1, count)) * Math.PI * 2 + Math.random() * 0.5;
            const r = 1.5 + Math.random() * 2;
            const sx = exitX + Math.cos(angle) * r + perpX * (Math.random() - 0.5) * 2;
            const sz = exitZ + Math.sin(angle) * r + perpZ * (Math.random() - 0.5) * 2;
            const sy = this._terrainTop ? this._terrainTop(sx, sz) : (evt.y ?? 0);

            const kaiju = this._spawn({
                x: sx, y: sy + (config.spawnFallSpeed > 0 ? 30 : 0), z: sz,
                kind: "hell",
                targetCivId: null,         // not targeting a civ
                allegiance: evt.civId,
                allegianceColor: civHueRGB(evt.civId),
            });
            if (kaiju) {
                // Mark for OGRE-targeting. _resolveTarget reads this
                // to prefer the OGRE over civs/other kaiju.
                kaiju._targetsOgre = true;
                // Round 127 — initialize _lastPos so the first
                // velocity-based clip read isn't a spike from
                // uninitialized (undefined → 0,0,0) to spawn point.
                kaiju._lastPos = { x: sx, y: sy, z: sz };
                spawned++;
            }
        }
        if (spawned > 0) {
            console.log(`[KaijuManager] ${spawned} hellspawn portal-summoned by civ "${evt.civName ?? evt.civId}" — exit ${Math.round(exitDistFromOgre)}u from OGRE`);
            // Two-ended portal burst (entrance + exit) + caster channeling beam
            this._spawnHellspawnPortalFX(cx, cy, cz);
            this._spawnHellspawnPortalFX(exitX, (this._terrainTop ? this._terrainTop(exitX, exitZ) : cy), exitZ);
            this._spawnPortalChannelBeam(cx, cy, cz, exitX, exitZ);
            // Track for TTL despawn
            if (!this._hellspawnChannels) this._hellspawnChannels = [];
            this._hellspawnChannels.push({
                ttl: 8.0,
                casterEntityId,
                entrancePortalId,
                exitPortalId,
                cx, cy, cz, exitX, exitZ,
                personality: civPers,
            });
            if (this.events?.publish) {
                this.events.publish({
                    type: "hellspawn_summoned",
                    civId: evt.civId, civName: evt.civName,
                    count: spawned,
                    x: evt.x, y: evt.y, z: evt.z,
                    exitX, exitZ,
                });
            }
        }
    }

    // Round 127 — channeling beam between entrance and exit portals.
    // Sparse particle line visualizes the magical / tech connection
    // between caster and exit point. Lives 0.6s; the per-frame portal
    // tick re-spawns the beam each tick of the channel duration.
    _spawnPortalChannelBeam(x1, y1, z1, x2, z2) {
        if (!this.particles?.spawn) return;
        const STEPS = 14;
        const dx = x2 - x1, dz = z2 - z1;
        for (let s = 0; s < STEPS; s++) {
            const t = s / (STEPS - 1);
            const bx = x1 + dx * t + (Math.random() - 0.5) * 0.6;
            const bz = z1 + dz * t + (Math.random() - 0.5) * 0.6;
            const by = y1 + 3 + Math.sin(t * Math.PI) * 4 + (Math.random() - 0.5) * 0.4;
            this.particles.spawn({
                x: bx, y: by, z: bz,
                vx: 0, vy: 0, vz: 0,
                ttl: 0.55 + Math.random() * 0.25,
                size: 0.40 + Math.random() * 0.20,
                r: 1.0, g: 0.35, b: 0.15, a: 1.0,
                gravity: -0.5,
            });
        }
    }

    // Round 127 — tick hellspawn portal channels. Decrements TTL,
    // re-emits the beam every ~0.3s for sustained visibility,
    // despawns entities when TTL expires.
    _tickHellspawnChannels(delta) {
        if (!this._hellspawnChannels || this._hellspawnChannels.length === 0) return;
        for (let i = this._hellspawnChannels.length - 1; i >= 0; i--) {
            const ch = this._hellspawnChannels[i];
            ch.ttl -= delta;
            ch._beamT = (ch._beamT || 0) + delta;
            if (ch._beamT > 0.3) {
                ch._beamT = 0;
                this._spawnPortalChannelBeam(ch.cx, ch.cy, ch.cz, ch.exitX, ch.exitZ);
            }
            if (ch.ttl <= 0) {
                // Despawn portals + caster
                if (this.router) {
                    if (ch.casterEntityId != null) {
                        this.router.exec({ type: "entity:despawn", id: ch.casterEntityId });
                    }
                    if (ch.entrancePortalId != null) {
                        this.router.exec({ type: "entity:despawn", id: ch.entrancePortalId });
                    }
                    if (ch.exitPortalId != null) {
                        this.router.exec({ type: "entity:despawn", id: ch.exitPortalId });
                    }
                }
                // Round 128 — PERSISTENT CRATER at the exit portal. The
                // ground stays scorched after the channel closes, so
                // the player can see where hellspawn emerged even after
                // the visual portal vanishes. A small hemispherical
                // bowl (radius 3) carved into the terrain, with ASH
                // voxels lining the rim for the charred look.
                // Skipped at the entrance portal because the civ
                // structures are there — we don't want to destroy the
                // summoner's home. Exit portal is in neutral terrain.
                this._carveCrater(ch.exitX, ch.exitZ, 3);
                // Final fade-out burst
                if (this.particles?.spawn) {
                    for (let n = 0; n < 12; n++) {
                        this.particles.spawn({
                            x: ch.cx + (Math.random() - 0.5) * 2,
                            y: ch.cy + 1 + Math.random() * 2,
                            z: ch.cz + (Math.random() - 0.5) * 2,
                            vy: 0.4 + Math.random(),
                            ttl: 0.5, size: 0.35,
                            r: 0.8, g: 0.3, b: 0.1, a: 0.7,
                        });
                    }
                }
                this._hellspawnChannels.splice(i, 1);
            }
        }
    }

    // Round 128 — persistent crater carver. Bowl-shaped depression at
    // ground surface: AIR voxels inside the bowl, ASH voxels on the
    // rim. Hemispherical profile so the depth scales with the radius.
    //
    // Used by:
    //   * Hellspawn portal exit on channel TTL expire (radius 3)
    //   * Moon meteor impacts in OgreScenario (smaller radius via
    //     direct world.setVoxel for now — see OgreScenario)
    //
    // Skipped silently if world has no setVoxel/getVoxel (test envs).
    // Won't carve below y=2 to avoid bottomless pits.
    _carveCrater(cx, cz, radius) {
        if (!this.world?.setVoxel || !this.world?.getVoxel) return;
        const r = Math.max(1, Math.floor(radius));
        const cxi = Math.floor(cx), czi = Math.floor(cz);
        // Find surface Y at center
        let surfaceY = 0;
        for (let y = 80; y >= 2; y--) {
            const v = this.world.getVoxel(cxi, y, czi);
            if (v != null && v !== 0 && v !== VOXEL.WATER && v !== VOXEL.FLOWING_WATER) {
                surfaceY = y;
                break;
            }
        }
        if (surfaceY === 0) return;
        // Hemispherical bowl: depth scales with radius. depth = r/2.
        const depth = Math.max(1, Math.floor(r * 0.7));
        const r2 = r * r;
        for (let dx = -r; dx <= r; dx++) {
            for (let dz = -r; dz <= r; dz++) {
                const d2 = dx * dx + dz * dz;
                if (d2 > r2) continue;
                const xi = cxi + dx, zi = czi + dz;
                // Depth at this column — deeper toward the center
                const colDepth = Math.floor(depth * (1 - d2 / r2));
                // Carve air down to surfaceY - colDepth, leaving the
                // floor as ASH for the scorched look
                for (let y = surfaceY; y > surfaceY - colDepth; y--) {
                    if (y < 2) break;
                    const v = this.world.getVoxel(xi, y, zi);
                    if (v != null && v !== 0) {
                        this.world.setVoxel(xi, y, zi, VOXEL.AIR);
                    }
                }
                // Rim/floor ASH stamp on the topmost remaining solid voxel
                const floorY = Math.max(2, surfaceY - colDepth);
                const vFloor = this.world.getVoxel(xi, floorY, zi);
                if (vFloor != null && vFloor !== 0 && vFloor !== VOXEL.WATER && vFloor !== VOXEL.LAVA) {
                    this.world.setVoxel(xi, floorY, zi, VOXEL.ASH);
                }
            }
        }
    }

    // Round 126 — visual burst for hellspawn summon. Red+orange burst
    // (vs the magenta of queen portals), rising plume of embers,
    // ground glow. ~40 particles over a 2-3 voxel radius.
    _spawnHellspawnPortalFX(x, y, z) {
        if (!this.particles?.spawn) return;
        // Initial burst — embers + smoke
        for (let n = 0; n < 40; n++) {
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * 2.5;
            const px = x + Math.cos(a) * r;
            const pz = z + Math.sin(a) * r;
            this.particles.spawn({
                x: px, y: y + Math.random() * 2, z: pz,
                vx: Math.cos(a) * (1 + Math.random()),
                vy: 2 + Math.random() * 4,
                vz: Math.sin(a) * (1 + Math.random()),
                ttl: 1.2 + Math.random() * 0.6,
                size: 0.4 + Math.random() * 0.3,
                r: 1.0,
                g: 0.25 + Math.random() * 0.4,
                b: 0.05 + Math.random() * 0.15,
                a: 1.0,
                gravity: -3,                    // rise, like flames
            });
        }
        // Rising central column
        for (let n = 0; n < 12; n++) {
            this.particles.spawn({
                x: x + (Math.random() - 0.5) * 0.8,
                y: y + n * 0.4,
                z: z + (Math.random() - 0.5) * 0.8,
                vx: 0, vy: 5 + Math.random() * 2, vz: 0,
                ttl: 1.0, size: 0.55,
                r: 1.0, g: 0.55, b: 0.15, a: 1.0,
                gravity: -1,
            });
        }
    }

    // ---- internals --------------------------------------------------

    // Round 29+ — choose a kaiju kind weighted by the biome at the
    // target's location. Samples biomeMap.getBiomeAt(center); if there's
    // no biomeMap (or no center), biomeWeightedKind falls back to uniform.
    _pickKindForSpawn(target) {
        let biome = null;
        if (this.biomeMap && typeof this.biomeMap.getBiomeAt === "function") {
            try {
                const c = target && target.center ? target.center : null;
                if (c) biome = this.biomeMap.getBiomeAt(c.x, c.z);
            } catch {}
        }
        return biomeWeightedKind(biome);
    }

    _tryAutoSpawn() {
        const civs = this.civManager?.getAll() ?? [];
        if (civs.length === 0) return null;

        // Pick the target first, then weight the kaiju KIND by the biome
        // the target sits in (volcano->hell, tundra->space, mountains->
        // cave, etc). Baseline keeps every kind possible; falls back to
        // uniform random when no biomeMap is wired. The full menagerie
        // still shows up — biomes just tilt the odds.
        const target = civs[(Math.random() * civs.length) | 0];
        const kind = this._pickKindForSpawn(target);
        const config = pickKindConfig(kind);
        const pos = config.pickSpawnPos(target);

        return this._spawn({
            x: pos.x, y: pos.y, z: pos.z,
            kind,
            targetCivId: target.id,
        });
    }

    _spawn(opts) {
        const id = this.nextId++;
        const k = new Kaiju(id, {
            x: opts.x, y: opts.y, z: opts.z,
            kind: opts.kind,
            targetCivId: opts.targetCivId,
            allegiance: opts.allegiance ?? null,
            allegianceColor: opts.allegianceColor ?? null,
        });
        this.kaiju.set(id, k);
        this.spawnsTotal++;
        // Round 127 — initialize position-delta tracking so the first
        // mesh-sync tick reads zero velocity instead of a spike
        // (undefined → spawn-position). Picks up the velocity-based
        // clip selection on the second tick once real movement starts.
        k._lastPos = { x: k.position.x, y: k.position.y, z: k.position.z };
        // Origin-themed debris burst at spawn point. Each spawn() call
        // on VoxelDebrisSystem fires 6 particles; doing it 3× = 18
        // particles for a substantial visual punch.
        if (this.debris) {
            const debrisVoxel = k.config.debrisVoxel ?? 1;
            const burstY = k.config.spawnFallSpeed > 0
                ? Math.max(20, k.position.y - 5)   // descending: burst at landing height
                : k.config.spawnLandY;             // rising: burst at emergence height
            for (let i = 0; i < DEBRIS_BURSTS_ON_SPAWN; i++) {
                const ox = (Math.random() * 2 - 1) * 2.5;
                const oz = (Math.random() * 2 - 1) * 2.5;
                this.debris.spawn(
                    Math.floor(k.position.x + ox),
                    Math.floor(burstY),
                    Math.floor(k.position.z + oz),
                    debrisVoxel,
                );
            }
        }

        // Hell kaiju: carve a lava ring at the spawn point. Signature
        // visual — ground splits in a circle when they emerge.
        if (k.config.eruptRing && this.router) {
            const ringY = this._terrainTop(k.position.x, k.position.z);
            const ring = expandStructures([{
                kind: "ring",
                cx: Math.floor(k.position.x),
                cy: ringY,
                cz: Math.floor(k.position.z),
                radius: 4,
                material: 12,    // LAVA
            }]);
            for (const v of ring) {
                this.router.exec({ type: "voxel:set", x: v.x, y: v.y, z: v.z, v: v.v });
            }
        }

        // Round 14 — GLB attachment. If kaiju_<kind> mesh is loaded,
        // spawn a synced ECS mesh entity. Marker renderer skips this
        // kaiju to avoid double-render.
        this._tryAttachMesh(k);

        this._emit("kaiju_spawn", k);
        console.log(`[KaijuManager] spawned ${k.name} (${k.kind}) at (${k.position.x|0}, ${k.position.y|0}, ${k.position.z|0}) targeting civ ${k.targetCivId ?? "none"}`);
        return k;
    }

    // Round 14 — try to attach a GLB-backed mesh entity to this kaiju.
    // Returns true if mesh was attached. The kaiju gets a _meshEntityId
    // field that tick() syncs and death cleans up.
    // v1373 — register downloaded library models (asset-roles "kaiju") as possible
    // kaiju bodies, grouped by kind (themed by folder) with an "any" fallback pool.
    setLibraryModels(byKind, any) { this._libByKind = byKind || {}; this._libAny = Array.isArray(any) ? any : []; }
    _pickLibModel(kind) {
        const byk = this._libByKind && this._libByKind[kind];
        const arr = (byk && byk.length) ? byk : this._libAny;
        if (!arr || !arr.length) return null;
        return arr[(Math.random() * arr.length) | 0];
    }
    _tryAttachMesh(k) {
        if (!this.router || !this.assetLoader) return false;
        // Round 18 — prefer user-set override, otherwise default
        // kaiju_<kind> name convention.
        const defaultId = `kaiju_${k.kind}`;
        const assetId = getOverride(defaultId) || defaultId;
        let cached = this.assetLoader.cache?.get(assetId);
        // Round 44 — designed default fallback by kind. Final visual
        // rung before the cube renderer takes over.
        if (!cached && this.assetLoader.loadDefaultForKindOrStyle) {
            cached = this.assetLoader.loadDefaultForKindOrStyle(assetId, k.kind);
        }
        let useId = assetId, usedLib = false;
        if (!cached) {   // v1373 — fall back to a downloaded library model for this kaiju role
            const lib = this._pickLibModel(k.kind);
            if (lib && this.assetLoader.cache?.get(lib)) { useId = lib; cached = this.assetLoader.cache.get(lib); usedLib = true; }
        }
        if (!cached) return false;
        // v1376 — height-normalise LIBRARY kaiju bodies: treat config.scale as the TARGET
        // height (so a downloaded demon/mech lands at the kind's tuned size regardless of its
        // native size). Designed kaiju_<kind> assets keep raw config.scale.
        let scale = k.config.scale;
        if (usedLib && typeof window !== "undefined" && window.assetRoles?.scaleFor) {
            const ns = window.assetRoles.scaleFor(useId, "kaiju", k.config.scale);
            if (ns != null) scale = ns;
        }
        const result = this.router.exec({
            type: "entity:spawnMesh",
            assetId: useId,
            x: k.position.x, y: k.position.y, z: k.position.z,
            scale,
            kind: defaultId,    // tinting still uses the default kind so
                                // hell-overridden-to-tower still tints orange
        });
        if (result?.ok && result.id != null) {
            k._meshEntityId = result.id;
            return true;
        }
        return false;
    }

    // Round 20 — scatter biome material near each active kaiju.
    // Hell kaiju trail lava behind, water kaiju leave puddles, space
    // kaiju leave memory crystals, etc. Builds up over time so the
    // longer a kaiju is in an area, the more transformed it gets.
    //
    // Cumulative effect: a hell kaiju walking through grass for 30s
    // turns the path into a charred, lava-pocked corridor.
    _biomeScatter(k, delta) {
        if (!this.router || !this.world) return;
        if (k.state !== "seeking" && k.state !== "engaging") return;
        // Skip aerial — sky kaiju don't transform ground (yet)
        if (k.kind === "sky") return;
        const mat = k.config.debrisVoxel;
        if (!mat) return;

        k._biomeAccum += delta;
        // Queens corrupt twice as fast as regular kaiju
        const interval = k.becameQueen ? 0.75 : 1.5;
        if (k._biomeAccum < interval) return;
        k._biomeAccum = 0;

        // Place voxels at random positions within a radius. Surface-
        // replacement (top - 1) is more dramatic than top-of-pile.
        const r = k.becameQueen ? 9 : 6;   // queens corrupt wider
        const count = k.becameQueen ? 4 : 3;
        for (let i = 0; i < count; i++) {
            const ox = (Math.random() * 2 - 1) * r;
            const oz = (Math.random() * 2 - 1) * r;
            const x = Math.floor(k.position.x + ox);
            const z = Math.floor(k.position.z + oz);
            const top = this._terrainTop(x, z);
            // _terrainTop returns "next-air-y", so top-1 is the actual
            // surface voxel position.
            if (top > 1) {
                this.router.exec({
                    type: "voxel:set",
                    x, y: top - 1, z, v: mat,
                });
            }
        }
    }

    // Round 21 — kaiju wants to throw a projectile. Find nearest live
    // tree (radius 20 — kaiju has long arms), consume it, hand off to
    // ProjectileManager. If no tree in range, throw silently no-ops —
    // the cooldown still resets so kaiju doesn't try again instantly.
    _handleThrow(k, action) {
        if (!this.projectileManager || !this.treeSpawner) return;
        const tree = this.treeSpawner.findAndConsumeNearest(
            k.position.x, k.position.z, 20
        );
        if (!tree) return;
        // Round 14 — visible windup particles around the kaiju before
        // the projectile launches. Yellow-orange dust spiral + ground
        // dust kicks up at kaiju feet.
        if (this.particles?.spawn) {
            for (let n = 0; n < 22; n++) {
                const a = (n / 22) * Math.PI * 2;
                const r = 2 + Math.random() * 1.5;
                this.particles.spawn({
                    x: k.position.x + Math.cos(a) * r,
                    y: k.position.y + 1 + Math.random() * 3,
                    z: k.position.z + Math.sin(a) * r,
                    vy: 1 + Math.random() * 1.5,
                    ttl: 0.4, size: 0.5,
                    r: 1.0, g: 0.85, b: 0.35, a: 0.85,
                    gravity: 6,
                });
            }
            // Ground dust kick
            for (let n = 0; n < 14; n++) {
                const a = Math.random() * Math.PI * 2;
                const speed = 1 + Math.random() * 3;
                this.particles.spawn({
                    x: k.position.x + (Math.random() - 0.5) * 2.5,
                    y: k.position.y - 0.5,
                    z: k.position.z + (Math.random() - 0.5) * 2.5,
                    vx: Math.cos(a) * speed,
                    vy: 0.5 + Math.random() * 1.5,
                    vz: Math.sin(a) * speed,
                    ttl: 0.7, size: 0.55,
                    r: 0.6, g: 0.5, b: 0.4, a: 0.7,
                    gravity: 9,
                });
            }
        }
        const projectile = this.projectileManager.launch({
            from: { x: k.position.x, y: k.position.y, z: k.position.z },
            to:   { x: action.toX,   y: action.toY,   z: action.toZ },
            kind: tree.assetId,
            scale: tree.scale,
            ownerKaijuId: k.id,
            damageMul: action.damageMul,
            // Round 14 — trees leave a faint ember trail, sparks
            // shed as they fly through the air.
            trail: "ember",
            trailColor: [0.9, 0.7, 0.35],
        });
        // Round 280 — offer the throw to the cinematic camera. No-op
        // unless cinematicCam is enabled and off cooldown. Returns
        // true if the camera engaged so we could log a beat if needed.
        try { this.throwCinematic?.onThrow(projectile); } catch {}
        if (this.events?.publish) {
            this.events.publish({
                type: "kaiju_throws",
                kaijuId: k.id, kaijuName: k.name, kaijuKind: k.kind,
                fromX: k.position.x, fromY: k.position.y, fromZ: k.position.z,
                toX: action.toX, toY: action.toY, toZ: action.toZ,
                x: k.position.x, y: k.position.y, z: k.position.z,
                otherX: action.toX, otherY: action.toY, otherZ: action.toZ,
            });
        }
    }

    // Round 36 — king buff aura. Reset every kaiju's attack-buff
    // multiplier each frame, then for each king, boost any kaiju
    // within KING_AURA_RANGE to 1.4× attack damage. Buff applies
    // regardless of kind (kings rule across kaiju kinds).
    _applyKingAuras() {
        const KING_AURA_RANGE = 30;
        const KING_AURA_RANGE_SQ = KING_AURA_RANGE * KING_AURA_RANGE;
        const KING_BUFF = 1.4;

        // Reset all
        for (const k of this.kaiju.values()) {
            k._attackBuffMul = 1.0;
        }

        // Round 270b — orbital SIGNAL satellite suppression. Reduces
        // attack effectiveness by 50% on kaiju inside a SIGNAL sat's
        // radius for ~6s after a ping. Stacks against king-aura
        // (king-buffed kaiju at 1.4 + signal at 0.5 = 0.7, still
        // suppressed below baseline). Runs unconditionally; the king-
        // aura code below has its own early-out path. _signalSuppress-
        // Until is set by SatelliteFleet during passive ticks.
        const nowMsSig = (typeof performance !== "undefined") ? performance.now() : Date.now();
        for (const k of this.kaiju.values()) {
            if (k._signalSuppressUntil && nowMsSig < k._signalSuppressUntil) {
                k._attackBuffMul *= 0.5;
            }
        }

        // Scan kings, apply buff
        const kings = [];
        for (const k of this.kaiju.values()) {
            if (k.becameKing) kings.push(k);
        }
        if (kings.length === 0) return;

        for (const target of this.kaiju.values()) {
            for (const king of kings) {
                const dx = target.position.x - king.position.x;
                const dy = target.position.y - king.position.y;
                const dz = target.position.z - king.position.z;
                if (dx * dx + dy * dy + dz * dz < KING_AURA_RANGE_SQ) {
                    target._attackBuffMul = KING_BUFF;
                    // Round 287 — track which king is buffing this kaiju
                    // for pack-dispersal-on-king-death.
                    this._kingPack.markBuffed(king.id, target.id);
                    // PATCH-B12 -- pack focus-fire. When the GPU brain (or
                    // the pack>=3 heuristic) says COORDINATE, aura members
                    // inherit the king's current target; _resolveTarget
                    // honors it while fresh (Kaiju.js PATCH-B13), and
                    // demoralized kaiju ignore orders -- leaderless packs
                    // scatter, per the round-287 design intent.
                    if (king._lastAttackTarget) {
                        const ord = (typeof window !== "undefined" && window.getBrainPackOrder)
                            ? window.getBrainPackOrder(king.id) : null;
                        const focus = ord ? !!ord.focus
                            : (this._kingPack.packSizeOf?.(king.id) ?? 0) >= 3;
                        if (focus) {
                            target._packFocusTarget = king._lastAttackTarget;
                            target._packFocusAt = performance.now();
                        }
                    }
                    break;
                }
            }
        }

        // Round 15 — TECH RACE COORDINATION. Tech kaiju within
        // TECH_COORD_RANGE of another tech kaiju get a small
        // attack-speed buff (formation behavior — tech alien race
        // coordinates fire). Stacks with king buff (multiplicative).
        const TECH_COORD_RANGE = 22;
        const TECH_COORD_RANGE_SQ = TECH_COORD_RANGE * TECH_COORD_RANGE;
        const TECH_COORD_BUFF = 1.25;
        const techs = [];
        for (const k of this.kaiju.values()) {
            if (k.kind === "tech") techs.push(k);
        }
        if (techs.length >= 2) {
            for (let i = 0; i < techs.length; i++) {
                const a = techs[i];
                for (let j = 0; j < techs.length; j++) {
                    if (i === j) continue;
                    const b = techs[j];
                    const dx = a.position.x - b.position.x;
                    const dy = a.position.y - b.position.y;
                    const dz = a.position.z - b.position.z;
                    if (dx * dx + dy * dy + dz * dz < TECH_COORD_RANGE_SQ) {
                        a._attackBuffMul = (a._attackBuffMul ?? 1) * TECH_COORD_BUFF;
                        break;
                    }
                }
            }
        }

        // Round 45 — visual aura. Every 0.25s, each king emits a small
        // burst of golden particles in a ring around its base.
        this._kingAuraTimer = (this._kingAuraTimer ?? 0) - this._lastDelta;
        if (this._kingAuraTimer <= 0 && this.particles?.spawn) {
            this._kingAuraTimer = 0.25;
            const ringR = 4;
            for (const king of kings) {
                for (let i = 0; i < 6; i++) {
                    const a = (i / 6) * Math.PI * 2 + (Math.random() * 0.4);
                    this.particles.spawn({
                        x: king.position.x + Math.cos(a) * ringR,
                        y: king.position.y + 0.2,
                        z: king.position.z + Math.sin(a) * ringR,
                        vx: Math.cos(a) * 0.3,
                        vy: 1.6 + Math.random() * 0.5,
                        vz: Math.sin(a) * 0.3,
                        ttl: 1.2,
                        size: 0.55,
                        r: 1.0, g: 0.85, b: 0.25, a: 0.85,
                        gravity: -0.5,
                        sprite: 5,    // GLYPH
                    });
                }
            }
        }
    }

    // Round 30 — kind-specific ranged attack. Cooldown-gated.
    // Finds best target in range (current kaiju.target preferred,
    // else nearest civ via civManager). Dispatches by attack family.
    _tickRangedAttack(k) {
        // Round 45 — king-aware lookup pivots to scarier attacks when
        // the kaiju has been promoted (becameKing). Falls through to
        // the regular kind attack otherwise.
        // PATCH-B9 -- situational selection. The GPU brain scores each of
        // this kaiju's LEGAL attacks (availableAttacksFor -- king rotations
        // and kind rotations respected) against the tactical picture and
        // publishes a per-kaiju pick; the blind primary/alt/alt2 rotation
        // becomes the fallback. A suggestion naming anything outside the
        // legal set is ignored. No brain -> rotation, exactly as before.
        let attack = null;
        let attackSource = "rotation";           // PATCH-B11 -- provenance for propensity logging
        {
            const rec = (typeof window !== "undefined" && window.getBrainAttack)
                ? window.getBrainAttack(k.id) : null;
            if (rec?.name) {
                attack = availableAttacksFor(k).find(a => a.name === rec.name) ?? null;
                if (attack) attackSource = rec.explore ? "brain-explore" : "brain";
            }
        }
        if (!attack) attack = getAttackForKaiju(k);
        if (!attack) return;
        // Round 36 — king aura speeds attacks (buff 1.4× → CD 1/1.4×).
        // Active duels halve cooldowns further for both sides for visual
        // intensity. Combined: a buffed kaiju in a duel fires ~2.8× as
        // fast.
        // Round 287 — demoralized kaiju (king died) fire 0.55× as fast.
        const buff = k._attackBuffMul ?? 1;
        const duelMul = k.duelMode ? 0.5 : 1.0;
        const demoMul = this._kingPack.attackSpeedMult(k);    // 0.55 if demoralized, else 1.0
        const effectiveCooldown = (attack.cooldown / buff) * duelMul / demoMul;
        if (k.age - k._lastAttackTime < effectiveCooldown) return;

        // Use current target if it's in range, else find nearest civ
        const target = this._findRangedTarget(k, attack.range);
        if (!target) return;

        k._lastAttackTime = k.age;
        if (attack.family === "beam")        this._executeBeam(k, attack, target);
        else if (attack.family === "projectile") this._executeProjectileAttack(k, attack, target);
        else if (attack.family === "aoe")    this._executeAoEAttack(k, attack, target);
        // Round 50 - advance the king rotation index so the next fire
        // picks the OTHER attack in the rotation. No-op for non-kings or
        // kinds without a rotation list. Stash last-fired target so
        // death-rattle can re-aim at it.
        advanceKingAttackRotation(k);
        k._lastAttackTarget = target;

        // Publish a generic ranged-attack event for narrative
        if (this.events?.publish) {
            this.events.publish({
                type: "kaiju_ranged_attack",
                kaijuId: k.id, kaijuName: k.name, kaijuKind: k.kind,
                attackName: attack.name ?? KIND_TO_ATTACK[k.kind] ?? "unknown",   // PATCH-B9: report what actually fired
                attackSource,                                                       // PATCH-B11: who chose it (brain | brain-explore | rotation)
                verb: attack.narrativeVerb,
                targetName: target.name ?? null,
                targetType: target._type,
                fromX: k.position.x, fromY: k.position.y, fromZ: k.position.z,
                toX: target.x, toY: target.y, toZ: target.z,
                x: k.position.x, y: k.position.y, z: k.position.z,
            });
        }
    }

    // Find a ranged-attack target. Returns { x, y, z, ref, _type, name, applyDamage }
    // or null if nothing in range.
    _findRangedTarget(k, range) {
        const range2 = range * range;
        // v758 — external target hook. Demos can populate
        // window._extraRangedTargets with target descriptors {x, y, z,
        // ref, _type, name, applyDamage} so kaiju see custom entities
        // (e.g. the city-attack demo's tanks/planes) as valid targets.
        // Highest-priority targets evaluated first; falls through to the
        // normal civ/OGRE search if nothing in range.
        try {
            if (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets) && window._extraRangedTargets.length) {
                let nearest = null, bestD2 = range2;
                for (const t of window._extraRangedTargets) {
                    if (!t || typeof t.x !== "number") continue;
                    const dx = t.x - k.position.x;
                    const dy = (t.y ?? 0) - k.position.y;
                    const dz = t.z - k.position.z;
                    const d2 = dx*dx + dy*dy + dz*dz;
                    if (d2 < bestD2) { bestD2 = d2; nearest = t; }
                }
                if (nearest) return nearest;
            }
        } catch {}

        // Round 122 — civ retaliation wrapper. Defined at method top so
        // both the pursuit-target civ branch and the nearest-civ scan
        // branch can wrap their applyDamage closures uniformly. See
        // _triggerCivRetaliation below for the actual counter-fire logic.
        const wrapCivDamage = (origApply, civ, attacker) => (d) => {
            origApply(d);
            this._triggerCivRetaliation(civ, attacker);
        };
        // Round 126 — hellspawn priority. If this kaiju was summoned
        // specifically to attack the OGRE, the OGRE chassis is the
        // top-priority target whenever it's active and in range.
        // Falls through to normal civ/kaiju target selection if the
        // OGRE is not in range or not active.
        if (k._targetsOgre && this.ogreScenario?.getOgreState) {
            const og = this.ogreScenario.getOgreState();
            if (og) {
                const dx = og.x - k.position.x;
                const dy = og.y - k.position.y;
                const dz = og.z - k.position.z;
                if (dx * dx + dy * dy + dz * dz < range2) {
                    return {
                        x: og.x, y: og.y + 2, z: og.z,
                        ref: this.ogreScenario, _type: "ogre", name: "OGRE",
                        applyDamage: (d) => {
                            // Hellspawn damage scales with intensity —
                            // d is the attack's per-fire damage already
                            // scaled by kaiju multipliers. 100× because
                            // OGRE HP is in the hundreds, kaiju damage
                            // is in units of 0.01-1.0 (civ-energy
                            // scale).
                            this.ogreScenario.applyOgreDamage(d * 100, k);
                        },
                    };
                }
            }
        }
        // Round 39 — player retaliation. If kaiju has the player as
        // its current target, fire at the player. Damage hits
        // PlayerEnergy via the global ref set by main.js.
        if (k.target?.type === "player" && k.target.ref) {
            const p = k.target.ref;
            const dx = p.position.x - k.position.x;
            const dy = p.position.y - k.position.y;
            const dz = p.position.z - k.position.z;
            if (dx * dx + dy * dy + dz * dz < range2) {
                return {
                    x: p.position.x, y: p.position.y, z: p.position.z,
                    ref: p, _type: "player", name: "player",
                    applyDamage: (d) => {
                        const pe = window._playerEnergy;
                        if (pe?.applyDamage) pe.applyDamage(d * 100);
                    },
                };
            }
        }
        // Prefer current pursuit target if in range
        if (k.target?.type === "civ" && k.target.ref) {
            const c = k.target.ref;
            const dx = c.center.x - k.position.x;
            const dy = c.center.y - k.position.y;
            const dz = c.center.z - k.position.z;
            if (dx * dx + dy * dy + dz * dz < range2) {
                const orig = (d) => { c.energy = Math.max(0, (c.energy ?? 1) - d); };
                return {
                    x: c.center.x, y: c.center.y, z: c.center.z,
                    ref: c, _type: "civ", name: c.name,
                    applyDamage: wrapCivDamage(orig, c, k),
                };
            }
        }
        if (k.target?.type === "kaiju" && k.target.ref) {
            const ok = k.target.ref;
            const dx = ok.position.x - k.position.x;
            const dy = ok.position.y - k.position.y;
            const dz = ok.position.z - k.position.z;
            if (dx * dx + dy * dy + dz * dz < range2) {
                return {
                    x: ok.position.x, y: ok.position.y, z: ok.position.z,
                    ref: ok, _type: "kaiju", name: ok.name,
                    applyDamage: (d) => {
                        ok.energy = Math.max(0, (ok.energy ?? 1) - d);
                        ok._lastDamageTime = ok.age;       // round 37 — flee trigger
                    },
                };
            }
        }
        // Else scan civilizations for nearest in range
        if (this.civManager?.getAll) {
            let best = null, bestD2 = range2;
            for (const c of this.civManager.getAll()) {
                if (!c.center) continue;
                if (c.id === k.allegiance) continue;     // patron civ — don't shoot
                const dx = c.center.x - k.position.x;
                const dy = c.center.y - k.position.y;
                const dz = c.center.z - k.position.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < bestD2) { bestD2 = d2; best = c; }
            }
            if (best) {
                const orig = (d) => { best.energy = Math.max(0, (best.energy ?? 1) - d); };
                return {
                    x: best.center.x, y: best.center.y, z: best.center.z,
                    ref: best, _type: "civ", name: best.name,
                    applyDamage: wrapCivDamage(orig, best, k),
                };
            }
        }
        // Round 287 — last-resort: rival kaiju within range. Only kicks
        // in when no civ/OGRE target found, so duels happen in lulls
        // (empty maps, between waves). 0.7× damage to keep duels from
        // trivializing boss fights.
        try {
            const rival = this._rivalry?.findRivalTarget(
                k, range, this._getKaijuArray());
            if (rival) return rival;
        } catch (e) {
            console.warn("[KaijuRivalry.findRivalTarget]", e?.message ?? e);
        }
        return null;
    }

    // Round 122 — reactive civ retaliation. When ANY civ takes damage
    // from a kaiju attack, fires back a small projectile aimed at the
    // attacker. Independent of the scheduled tier-4 counter-projectile
    // system — that fires on an 8s cooldown scanning for nearest kaiju;
    // this fires immediately at the SPECIFIC attacker, but limited to
    // once per 1.5s per civ to keep visual chaos manageable.
    //
    // Scale by tier: tier 0-1 civs throw "pebbles" (low damage, slow,
    // dust trail). Tier 2-3 throw stone chunks. Tier 4+ throw arrows or
    // upgrade to the existing missile family. The visual variety reads
    // back the civ's tech state at a glance.
    _triggerCivRetaliation(civ, kaiju) {
        if (!civ || !kaiju) return;
        if (!this.projectileManager) return;
        const now = civ.age ?? 0;
        const last = civ._lastReactiveT ?? -Infinity;
        if (now - last < 1.5) return;
        civ._lastReactiveT = now;

        // Power + visual pick by tier
        const tier = civ.tech ?? civ.tier ?? 0;
        let kind, scale, damageMul, trail, trailColor;
        if (tier >= 5) {
            kind = "civ_missile"; scale = 0.7; damageMul = 0.6;
            trail = "fire"; trailColor = [1.0, 0.55, 0.15];
        } else if (tier >= 2) {
            kind = "stone_chunk"; scale = 0.9; damageMul = 0.4;
            trail = "smoke"; trailColor = [0.8, 0.7, 0.5];
        } else {
            // Tier 0-1 civs — small pebble with dust trail. Mostly a
            // morale gesture; barely damages the kaiju but visually
            // satisfying when a primitive civ defies a hulking attacker.
            kind = "stone_chunk"; scale = 0.45; damageMul = 0.15;
            trail = "smoke"; trailColor = [0.65, 0.6, 0.5];
        }

        this.projectileManager.launch({
            from: { x: civ.center.x, y: civ.center.y + 5, z: civ.center.z },
            to:   { x: kaiju.position.x, y: kaiju.position.y, z: kaiju.position.z },
            kind,
            scale,
            ownerKaijuId: -civ.id,
            damageMul,
            trail,
            trailColor,
        });

        // Publish for narrative — different event than scheduled counter
        // so listeners can react to the surprise factor differently
        if (this.events?.publish) {
            this.events.publish({
                type: "civ_retaliates",
                civId: civ.id, civName: civ.name, civTier: tier,
                kaijuId: kaiju.id, kaijuName: kaiju.name, kaijuKind: kaiju.kind,
                x: civ.center.x, y: civ.center.y, z: civ.center.z,
            });
        }
    }

    // _unused — placeholder anchor (replaced by retaliation method above)
    _civRetaliationAnchor() { return; }

    // Beam attacks — instant. Stream particles from kaiju to target
    // (lightning falls down from cloud height; ice ray comes from
    // kaiju body). Damage applied immediately.
    _executeBeam(k, attack, target) {
        if (!this.particles?.spawn) return;
        // v782 — audio for AI-fired beams (same helper player uses)
        // v788 — look up the registry name so per-attack mapping kicks in
        let aiAttackName = null;
        for (const [n, d] of Object.entries(KAIJU_ATTACKS)) if (d === attack) { aiAttackName = n; break; }
        this._playFireAudio(k, attack, aiAttackName);
        // v798 — AI beam ribbon (brief tracer). Adds a sustained ribbon
        // for 150ms; refreshed on each fire (so a rapid-fire AI looks
        // continuous, slower AIs get visible discrete tracers).
        if (target && (target.x != null) && k.position) {
            if (!this._activeBeams) this._activeBeams = new Map();
            this._activeBeams.set(k.id, {
                source: { x: k.position.x, y: k.position.y, z: k.position.z },
                target: { x: target.x, y: target.y ?? k.position.y, z: target.z },
                attackName: aiAttackName,
                expiresAt: (typeof performance !== "undefined" ? performance.now() : Date.now()) + 150,
            });
        }
        const isLightning = (k.kind === "sky");
        // Lightning starts up high; ice ray + others start at kaiju body
        const fromX = isLightning ? target.x : k.position.x;
        const fromY = isLightning ? 60 : (k.position.y + 4);
        const fromZ = isLightning ? target.z : k.position.z;
        const toX = target.x, toY = target.y, toZ = target.z;
        const dx0 = toX - fromX, dy0 = toY - fromY, dz0 = toZ - fromZ;
        const dist0 = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0) || 1;
        const speed = isLightning ? 60 : 25;
        const [r, g, b] = attack.color;

        // Round 14 — burstCount: machinegun volley fires multiple
        // tracers per cycle, each with slight cone spread.
        const burst = attack.burstCount ?? 1;
        const spread = attack.burstSpread ?? 0;
        for (let bi = 0; bi < burst; bi++) {
            // Apply random cone spread to direction
            let dx = dx0, dy = dy0, dz = dz0;
            if (spread > 0) {
                const ax = (Math.random() - 0.5) * spread;
                const ay = (Math.random() - 0.5) * spread;
                const cax = Math.cos(ax), sax = Math.sin(ax);
                const cay = Math.cos(ay), say = Math.sin(ay);
                // Yaw spread (around Y)
                const tdx = dx * cax - dz * sax;
                const tdz = dx * sax + dz * cax;
                dx = tdx; dz = tdz;
                // Pitch spread (around X)
                const tdy = dy * cay - dz * say;
                dz = dy * say + dz * cay;
                dy = tdy;
            }
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            const flightTime = dist / speed;
            const particleCount = isLightning ? 14 : (burst > 1 ? 6 : 10);
            for (let i = 0; i < particleCount; i++) {
                const t = i / particleCount;
                this.particles.spawn({
                    x: fromX + dx * t, y: fromY + dy * t, z: fromZ + dz * t,
                    vx: dx / flightTime, vy: dy / flightTime, vz: dz / flightTime,
                    ttl: flightTime * (1 - t) + 0.18,
                    size: isLightning ? 0.8 : (burst > 1 ? 0.32 : 0.5),
                    r, g, b, a: 1.0,
                    gravity: -2,
                    sprite: attack.sprite,
                });
            }
        }
        // Apply damage to target — round 36 king aura buff. For volley
        // attacks, total damage is per-pellet × burstCount.
        const totalDamageMul = burst > 1 ? burst : 1;
        const dmg = attack.damage * totalDamageMul * (k._attackBuffMul ?? 1);
        target.applyDamage(dmg);
        // v782 — hit confirmation audio. Spatialized at the target so
        // the player hears WHERE their hit landed. Throttled per-kaiju.
        // v798 — gate relaxed: now plays for AI beam hits too (was player-
        // only). The spatial impact is information regardless of who fired —
        // hearing a beam hit a civ across town is valid awareness. Still
        // throttled per-attacker so a beam-spammer doesn't drown the mix.
        try {
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            if (!k._lastHitAudioMs || (now - k._lastHitAudioMs) > 150) {
                k._lastHitAudioMs = now;
                const audio = window.audio;
                const tx = target.x ?? target.center?.x ?? 0;
                const ty = target.y ?? target.center?.y ?? 0;
                const tz = target.z ?? target.center?.z ?? 0;
                if (audio?.playSpatial && window.camera) {
                    audio.playSpatial("hit", tx, ty, tz, window.camera);
                } else if (audio?.play) {
                        audio.play("hit");
                    }
                }
        } catch {}
        // v770 — apply status effect on beam hit (acid DoT, slow, etc).
        // For "pulled" effects, snapshot the kaiju's position as the
        // pull anchor — the tractor beam drags victims TOWARD the caster.
        if (attack.statusEffect) {
            const effect = (attack.statusEffect.type === "pulled")
                ? { ...attack.statusEffect, anchorX: k.position.x, anchorY: k.position.y, anchorZ: k.position.z }
                : attack.statusEffect;
            try { applyStatusEffect(target, effect); } catch {}
        }

        // Round 15 — soul drain: spawn reverse-flow particles from
        // victim back to caster, heal caster a fraction of damage.
        if (attack.soulDrain && this.particles?.spawn) {
            const tx = target.x, ty = target.y, tz = target.z;
            const cx = k.position.x, cy = k.position.y + 4, cz = k.position.z;
            const ddx = cx - tx, ddy = cy - ty, ddz = cz - tz;
            const ddist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) || 1;
            const speedR = 18;
            const flightR = ddist / speedR;
            for (let i = 0; i < 8; i++) {
                const tt = i / 8;
                this.particles.spawn({
                    x: tx + ddx * tt, y: ty + ddy * tt, z: tz + ddz * tt,
                    vx: ddx / flightR, vy: ddy / flightR, vz: ddz / flightR,
                    ttl: flightR * (1 - tt) + 0.2,
                    size: 0.4,
                    r: 0.85, g: 0.20, b: 0.85, a: 1.0,
                    sprite: attack.sprite,
                });
            }
            // Heal caster
            if (attack.healFactor != null && k.energy != null) {
                k.energy = Math.min((k._maxEnergy ?? 1.0), k.energy + dmg * attack.healFactor);
            }
        }
    }

    // Projectile attacks — use ProjectileManager. Visual via the
    // existing projectile pipeline (entity mesh fallback). Color tint
    // emerges from the kind binding in entityVisuals (modders can map
    // "fireball"/"plasma_orb"/"rock_spike" to specific assets).
    _executeProjectileAttack(k, attack, target) {
        if (!this.projectileManager) return;
        // v782 — audio for AI-fired projectiles
        // v788 — per-attack-name override (e.g. fireball, plasma)
        let aiAttackName = null;
        for (const [n, d] of Object.entries(KAIJU_ATTACKS)) if (d === attack) { aiAttackName = n; break; }
        this._playFireAudio(k, attack, aiAttackName);
        const buff = k._attackBuffMul ?? 1;
        let trail = null, trailColor = null;
        if (attack.projectileKind === "fireball")    { trail = "fire";  trailColor = attack.color; }
        else if (attack.projectileKind === "plasma_orb") { trail = "ember"; trailColor = attack.color; }
        else if (attack.projectileKind === "rock_spike") { trail = "smoke"; trailColor = attack.color; }
        else if (attack.projectileKind === "meteor")     { trail = "fire";  trailColor = attack.color; }
        // Round 15 — meteors launch from sky altitude over the target,
        // not from the kaiju position. Creates the iconic dropping-
        // -from-the-heavens look.
        let fromX, fromY, fromZ;
        if (attack.meteorAltitude != null) {
            fromX = target.x + (Math.random() - 0.5) * 4;
            fromY = attack.meteorAltitude;
            fromZ = target.z + (Math.random() - 0.5) * 4;
        } else {
            fromX = k.position.x;
            fromY = k.position.y + 3;
            fromZ = k.position.z;
        }
        this.projectileManager.launch({
            from: { x: fromX, y: fromY, z: fromZ },
            to:   { x: target.x, y: target.y, z: target.z },
            kind:  attack.projectileKind,
            scale: attack.scale ?? 1.0,
            ownerKaijuId: k.id,
            damageMul: (attack.damage / 0.5) * buff,
            trail, trailColor,
        });
        // v770 — apply status effect at launch (consistent with how
        // CentipedeManager v769 handles projectiles). The visual hit
        // happens later but the gameplay effect lands now.
        if (attack.statusEffect && target) {
            const effect = (attack.statusEffect.type === "pulled")
                ? { ...attack.statusEffect, anchorX: k.position.x, anchorY: k.position.y, anchorZ: k.position.z }
                : attack.statusEffect;
            try { applyStatusEffect(target, effect); } catch {}
        }
    }

    // AoE attacks — ring of particles expanding from kaiju, damage
    // anything within radius. Round 35 — additional aoeStyle variants:
    // "wave" sweeping line, "rain" falling cloud, "vortex" spiral,
    // "miasma" lingering drift. Default style is the original ring.
    _executeAoEAttack(k, attack, target) {
        if (!this.particles?.spawn) return;
        // v782 — audio for AI-fired AoE
        // v788 — per-attack-name override (e.g. acid_spit, sonic_scream)
        let aiAttackName = null;
        for (const [n, d] of Object.entries(KAIJU_ATTACKS)) if (d === attack) { aiAttackName = n; break; }
        this._playFireAudio(k, attack, aiAttackName);
        // v788 — track hits for centroid impact-audio below
        let aoeHitCount = 0;
        const style = attack.aoeStyle ?? "ring";
        const ringRadius = attack.range;
        const particleCount = attack.particleCount ?? 32;
        const [r, g, b] = attack.color;

        if (style === "ring") {
            // Original radiation pulse — outward from kaiju
            const flightTime = 1.5;
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2;
                this.particles.spawn({
                    x: k.position.x, y: k.position.y + 1, z: k.position.z,
                    vx: Math.cos(angle) * (ringRadius / flightTime),
                    vy: 0,
                    vz: Math.sin(angle) * (ringRadius / flightTime),
                    ttl: flightTime, size: 0.7,
                    r, g, b, a: 0.85, gravity: 0, sprite: attack.sprite,
                });
            }
        } else if (style === "wave") {
            // Tidal wave — line of large droplets sweeping kaiju → target
            const dx = target.x - k.position.x;
            const dz = target.z - k.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz) || 1;
            const dirX = dx / dist, dirZ = dz / dist;
            const perpX = -dirZ, perpZ = dirX;            // perpendicular for wall width
            const speed = 14;
            const flightTime = dist / speed;
            const wallHalfWidth = 4;
            for (let i = 0; i < particleCount; i++) {
                // 8 frontline columns × 5 rows (40 total at default count)
                const col = (i % 8) - 4;                  // -4..+3
                const row = Math.floor(i / 8);            // 0..4
                const startX = k.position.x + perpX * col * (wallHalfWidth / 4);
                const startZ = k.position.z + perpZ * col * (wallHalfWidth / 4);
                const startY = k.position.y - 0.5 + Math.sin(row) * 0.8;
                this.particles.spawn({
                    x: startX, y: startY, z: startZ,
                    vx: dirX * speed, vy: 0.5, vz: dirZ * speed,
                    ttl: flightTime + 0.4, size: 0.85,
                    r, g, b, a: 0.9, gravity: 1.5, sprite: attack.sprite,
                });
            }
        } else if (style === "rain") {
            // Deluge — particles drop from above target zone into 16-radius circle
            const flightTime = 1.8;
            for (let i = 0; i < particleCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.sqrt(Math.random()) * ringRadius;   // sqrt for uniform area distribution
                const startX = target.x + Math.cos(angle) * radius;
                const startZ = target.z + Math.sin(angle) * radius;
                const startY = target.y + 12 + Math.random() * 6;
                this.particles.spawn({
                    x: startX, y: startY, z: startZ,
                    vx: 0, vy: -22, vz: 0,
                    ttl: flightTime, size: 0.4,
                    r, g, b, a: 0.85, gravity: 0, sprite: attack.sprite,
                });
            }
        } else if (style === "vortex") {
            // Typhoon — particles orbit around target in spiral, closing in
            const flightTime = 1.6;
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2 * 3;     // 3 turns of spiral
                const radiusFrac = 0.3 + (i / particleCount) * 0.7;
                const radius = ringRadius * radiusFrac;
                const startX = target.x + Math.cos(angle) * radius;
                const startZ = target.z + Math.sin(angle) * radius;
                const startY = target.y + 1 + (i % 5) * 1.2;
                // Tangential velocity (orbiting) + slight inward
                const tangentX = -Math.sin(angle) * 6;
                const tangentZ =  Math.cos(angle) * 6;
                const inwardX = -Math.cos(angle) * 3;
                const inwardZ = -Math.sin(angle) * 3;
                this.particles.spawn({
                    x: startX, y: startY, z: startZ,
                    vx: tangentX + inwardX, vy: 0.5, vz: tangentZ + inwardZ,
                    ttl: flightTime, size: 0.55,
                    r, g, b, a: 0.85, gravity: 0, sprite: attack.sprite,
                });
            }
        } else if (style === "miasma") {
            // Plague — slow drifting toxic cloud at target, lingers
            const flightTime = 4.0;
            for (let i = 0; i < particleCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * ringRadius;
                const startX = target.x + Math.cos(angle) * radius;
                const startZ = target.z + Math.sin(angle) * radius;
                const startY = target.y + Math.random() * 4;
                this.particles.spawn({
                    x: startX, y: startY, z: startZ,
                    vx: (Math.random() - 0.5) * 1.0,
                    vy: 0.3,
                    vz: (Math.random() - 0.5) * 1.0,
                    ttl: flightTime, size: 1.0,
                    r, g, b, a: 0.55, gravity: -0.3, sprite: attack.sprite,
                });
            }
        } else if (style === "geyser") {
            // Geyser — vertical column under target. Particles erupt
            // upward fast then arc back down. Tight horizontal spread,
            // tall vertical reach.
            for (let i = 0; i < particleCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 1.6;        // tight column
                const startX = target.x + Math.cos(angle) * radius;
                const startZ = target.z + Math.sin(angle) * radius;
                const startY = target.y;
                this.particles.spawn({
                    x: startX, y: startY, z: startZ,
                    vx: Math.cos(angle) * 0.6,
                    vy: 9 + Math.random() * 3,             // strong upward jet
                    vz: Math.sin(angle) * 0.6,
                    ttl: 1.6, size: 0.8,
                    r, g, b, a: 0.95, gravity: 14, sprite: attack.sprite,
                });
            }
            // Crown of mist at jet peak
            for (let i = 0; i < 16; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 1.5 + Math.random() * 1.5;
                this.particles.spawn({
                    x: target.x + Math.cos(angle) * radius,
                    y: target.y + 8,
                    z: target.z + Math.sin(angle) * radius,
                    vx: Math.cos(angle) * 1.2,
                    vy: 0.5,
                    vz: Math.sin(angle) * 1.2,
                    ttl: 1.0, size: 0.9,
                    r: r * 1.1, g: g * 1.1, b: b, a: 0.65, gravity: 4,
                });
            }
        } else if (style === "tremor") {
            // Round 50 — vertical dust column + outward ground ring.
            // Roughly 2/3 of the budget goes into the column (visible
            // far away), 1/3 into the spreading ring (damage hint at
            // ground level). Heavier gravity than geyser so dust falls
            // back faster — looks like ground impact, not water jet.
            const colCount = Math.floor(particleCount * 0.66);
            const ringCount = particleCount - colCount;
            for (let i = 0; i < colCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.random() * 2.0;          // wider than geyser
                const startX = target.x + Math.cos(angle) * radius;
                const startZ = target.z + Math.sin(angle) * radius;
                this.particles.spawn({
                    x: startX, y: target.y, z: startZ,
                    vx: Math.cos(angle) * 1.2,
                    vy: 5 + Math.random() * 4,               // shorter than geyser
                    vz: Math.sin(angle) * 1.2,
                    ttl: 1.2, size: 0.95,
                    r, g, b, a: 0.90, gravity: 18,           // heavy dust, falls fast
                    sprite: attack.sprite,
                });
            }
            // Spreading ground ring (debris arc)
            const ringFlight = 0.9;
            for (let i = 0; i < ringCount; i++) {
                const angle = (i / ringCount) * Math.PI * 2;
                const speed = ringRadius / ringFlight;
                this.particles.spawn({
                    x: target.x, y: target.y + 0.2, z: target.z,
                    vx: Math.cos(angle) * speed,
                    vy: 1.5,                                    // small upward kick
                    vz: Math.sin(angle) * speed,
                    ttl: ringFlight, size: 0.7,
                    r: r * 0.85, g: g * 0.85, b: b * 0.85, a: 0.80,
                    gravity: 6, sprite: attack.sprite,
                });
            }
        }

        // Damage anything (civs) in ring radius. Wave applies damage
        // along its sweep path — same in/out as ring for simplicity.
        // Round 36 — king aura boost
        // v772 — also apply status effects to civs (acid DoT, slow,
        // etc) when the attack has them. Civs now have applyDamage
        // shims via CivilizationManager v772 registration.
        const damage = attack.damage * (k._attackBuffMul ?? 1);
        if (this.civManager?.getAll) {
            const r2 = ringRadius * ringRadius;
            const makeStatusEffect = () => attack.statusEffect
                ? ((attack.statusEffect.type === "pulled")
                    ? { ...attack.statusEffect, anchorX: k.position.x, anchorY: k.position.y, anchorZ: k.position.z }
                    : attack.statusEffect)
                : null;
            for (const c of this.civManager.getAll()) {
                if (!c.center) continue;
                if (c.id === k.allegiance) continue;
                const cx = (style === "ring" || style === "wave") ? k.position.x : target.x;
                const cz = (style === "ring" || style === "wave") ? k.position.z : target.z;
                const dx = c.center.x - cx;
                const dy = c.center.y - (k.position.y);
                const dz = c.center.z - cz;
                if (dx * dx + dy * dy + dz * dz < r2) {
                    c.energy = Math.max(0, (c.energy ?? 1) - damage);
                    aoeHitCount++;
                    // v772 — status effects on civs in AoE
                    if (attack.statusEffect) {
                        try { applyStatusEffect(c, makeStatusEffect()); } catch {}
                    }
                }
            }
        }
        // v788 — AoE hit audio. After the radius scan, if at least one civ
        // (or extra-ranged target) was damaged AND this AoE was player-fired
        // recently, play a single centroid impact sound. Spatialized at the
        // AoE epicenter so the player hears WHERE the blast landed. One
        // sound per AoE blast (not per-target — that'd be noisy).
        try {
            const nowAoE = (typeof performance !== "undefined") ? performance.now() : Date.now();
            const playerFiredRecently = k._lastPlayerFireMs && (nowAoE - k._lastPlayerFireMs) < 100;
            if (playerFiredRecently && aoeHitCount > 0) {
                const audio = (typeof window !== "undefined") ? window.audio : null;
                if (audio?.playSpatial && window.camera) {
                    const cx = (style === "ring" || style === "wave") ? k.position.x : target.x;
                    const cy = k.position.y;
                    const cz = (style === "ring" || style === "wave") ? k.position.z : target.z;
                    audio.playSpatial("ogre_artillery_impact", cx, cy, cz, window.camera);
                } else if (audio?.play) {
                    audio.play("ogre_artillery_impact");
                }
            }
        } catch {}
        // v770 — apply status effect to the primary target (and to any
        // _extraRangedTargets in the AoE radius for tank/plane sieges).
        // Civs don't currently support status effects (they take damage
        // via .energy, not .applyDamage), so the framework skips them
        // gracefully — null-safe via applyEffect's target check.
        if (attack.statusEffect) {
            const makeEffect = () => (attack.statusEffect.type === "pulled")
                ? { ...attack.statusEffect, anchorX: k.position.x, anchorY: k.position.y, anchorZ: k.position.z }
                : attack.statusEffect;
            if (target) {
                try { applyStatusEffect(target, makeEffect()); } catch {}
            }
            // Sweep additional tank/plane targets within the AoE.
            const extra = (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets))
                ? window._extraRangedTargets : [];
            const cx0 = (style === "ring" || style === "wave") ? k.position.x : target.x;
            const cz0 = (style === "ring" || style === "wave") ? k.position.z : target.z;
            const r2  = ringRadius * ringRadius;
            for (const t of extra) {
                if (!t || t === target || typeof t.x !== "number") continue;
                const dx = t.x - cx0, dz = t.z - cz0;
                if (dx*dx + dz*dz <= r2) {
                    try { applyStatusEffect(t, makeEffect()); } catch {}
                }
            }
        }
    }

    // Round 35 — hellspawn portal sculpture. Hell queens drop these
    // periodically. Pattern: 5x5 ring footprint centered on queen,
    // STONE outer ring with MEMORY corner pillars (1 high) and LAVA
    // center pool. Reads as "hell is bleeding through here."
    _handlePortalDrop(queen, action) {
        if (!this.router) return;
        const cx = action.x | 0, cz = action.z | 0;
        const cy = this._terrainTop(cx, cz);
        if (cy < 1) return;

        // Outer 5x5 ring of stone (outline only)
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const onEdge = (Math.abs(dx) === 2 || Math.abs(dz) === 2);
                if (!onEdge) continue;
                this.router.exec({
                    type: "voxel:set",
                    x: cx + dx, y: cy, z: cz + dz, v: 1,    // STONE
                });
            }
        }
        // 4 corner MEMORY pillars (1 voxel above the ring)
        for (const [dx, dz] of [[-2,-2],[2,-2],[-2,2],[2,2]]) {
            this.router.exec({
                type: "voxel:set",
                x: cx + dx, y: cy + 1, z: cz + dz, v: 30,    // MEMORY
            });
        }
        // Inner 3x3 LAVA pool
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                this.router.exec({
                    type: "voxel:set",
                    x: cx + dx, y: cy, z: cz + dz, v: 12,    // LAVA
                });
            }
        }
        // Single MEMORY at the center, 2 above lava — the "eye" of the portal
        this.router.exec({
            type: "voxel:set",
            x: cx, y: cy + 2, z: cz, v: 30,
        });

        if (this.events?.publish) {
            this.events.publish({
                type: "kaiju_portal_drop",
                kaijuId: queen.id, kaijuName: queen.name, kaijuKind: queen.kind,
                x: cx, y: cy, z: cz,
            });
        }
        console.log(`[KaijuManager] ${queen.name} dropped a hellspawn portal at (${cx},${cy},${cz})`);
    }

    // Round 37 — tech kaiju metal tree. 4-voxel vertical MEMORY pillar
    // on a single stone base. Narrow footprint (1 voxel), tall and
    // glowing — reads as "alien technology marker."
    _handleMetalTreeDrop(kaiju, action) {
        if (!this.router) return;
        const cx = action.x | 0, cz = action.z | 0;
        const cy = this._terrainTop(cx, cz);
        if (cy < 1) return;

        // Stone foot at terrain level
        this.router.exec({ type: "voxel:set", x: cx, y: cy, z: cz, v: 1 });
        // 4-voxel MEMORY pillar above
        for (let h = 1; h <= 4; h++) {
            this.router.exec({
                type: "voxel:set",
                x: cx, y: cy + h, z: cz, v: 30,    // MEMORY
            });
        }

        if (this.events?.publish) {
            this.events.publish({
                type: "kaiju_metal_tree_drop",
                kaijuId: kaiju.id, kaijuName: kaiju.name, kaijuKind: kaiju.kind,
                x: cx, y: cy, z: cz,
            });
        }
        console.log(`[KaijuManager] ${kaiju.name} placed a metal tree at (${cx},${cy},${cz})`);
    }

    // Round 20 — queen spawns a child kaiju of same kind nearby.
    // Child has no allegiance (wild) — but since queen has no
    // allegiance, they won't fight each other (same-allegiance check
    // in Kaiju._resolveTarget treats both null as "different").
    //
    // Actually in v3 the check is `this.allegiance != null && k.allegiance === this.allegiance`,
    // so both-null kaiju CAN target each other. To prevent siblings
    // from killing each other, give them a shared allegiance string
    // tied to the queen's id.
    // Round 15 — Hell queens open a magenta PORTAL that births 2 imps
    // (smaller, faster hell kaiju) instead of a single standard child.
    // Portal entity persists 6s with sustained magenta particle column.
    _spawnHellPortal(queen, action) {
        const px = action.x, py = (queen.position.y) + 0.5, pz = action.z;
        let portalEntityId = null;
        if (this.router) {
            const r = this.router.exec({
                type: "entity:spawnMesh",
                assetId: "hellspawn_portal",
                kind: "hellspawn_portal",
                x: px, y: py + 1, z: pz,
                scale: 2.2,
            });
            if (r?.ok && r.id != null) portalEntityId = r.id;
        }
        if (!this._hellPortals) this._hellPortals = [];
        this._hellPortals.push({
            x: px, y: py, z: pz,
            ttl: 6.0, maxTtl: 6.0,
            entityId: portalEntityId,
            queen, action,
            _impsLaunched: 0,
            _nextImpAt: 0.8,    // first imp 0.8s after portal opens
        });
        // Burst on portal open
        if (this.particles?.spawn) {
            for (let n = 0; n < 50; n++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * 2.2;
                this.particles.spawn({
                    x: px + Math.cos(a) * r,
                    y: py + Math.random() * 3,
                    z: pz + Math.sin(a) * r,
                    vy: 1 + Math.random() * 3,
                    ttl: 0.9, size: 0.55,
                    r: 1.0, g: 0.2, b: 0.55, a: 1.0,
                    gravity: -2,
                });
            }
        }
    }

    _tickHellPortals(delta) {
        if (!this._hellPortals || this._hellPortals.length === 0) return;
        for (let i = this._hellPortals.length - 1; i >= 0; i--) {
            const p = this._hellPortals[i];
            p.ttl -= delta;
            // Sustained magenta particle column
            if (this.particles?.spawn && Math.random() < 0.6) {
                for (let n = 0; n < 3; n++) {
                    const a = Math.random() * Math.PI * 2;
                    const r = Math.random() * 1.8;
                    this.particles.spawn({
                        x: p.x + Math.cos(a) * r,
                        y: p.y + Math.random() * 3,
                        z: p.z + Math.sin(a) * r,
                        vy: 0.8 + Math.random() * 1.5,
                        ttl: 0.5, size: 0.45,
                        r: 1.0, g: 0.25 + Math.random() * 0.2, b: 0.6, a: 0.9,
                    });
                }
            }
            // Spawn an imp at scheduled point during the portal lifetime.
            // Two imps total per portal, staggered.
            const elapsed = p.maxTtl - p.ttl;
            if (p._impsLaunched < 2 && elapsed >= p._nextImpAt && this.kaiju.size < MAX_KAIJU) {
                const offsetAngle = Math.random() * Math.PI * 2;
                const offsetDist = 2;
                const ix = p.x + Math.cos(offsetAngle) * offsetDist;
                const iz = p.z + Math.sin(offsetAngle) * offsetDist;
                const imp = this._spawn({
                    x: ix, y: pickKindConfig("hell").spawnLandY, z: iz,
                    kind: "hell",
                    targetCivId: p.queen.targetCivId,
                    allegiance: -p.queen.id,
                    allegianceColor: p.queen.allegianceColor,
                });
                if (imp) {
                    // Imps are smaller + faster than standard hell kaiju.
                    imp.config = {
                        ...imp.config,
                        scale: imp.config.scale * 0.55,
                        moveSpeed: imp.config.moveSpeed * 1.4,
                        maxLifetime: imp.config.maxLifetime * 0.6,
                    };
                    imp.energy = 0.7;
                    imp.state = "seeking";
                    p.queen.allegiance = -p.queen.id;
                    console.log(`[KaijuManager] hellspawn imp ${imp.name} born from ${p.queen.name}'s portal`);
                }
                p._impsLaunched++;
                p._nextImpAt = elapsed + 1.8;
            }
            // Despawn closed portal
            if (p.ttl <= 0) {
                if (p.entityId != null && this.router) {
                    this.router.exec({ type: "entity:despawn", id: p.entityId });
                }
                this._hellPortals.splice(i, 1);
            }
        }
    }

    _handleQueenSpawn(queen, action) {
        if (this.kaiju.size >= MAX_KAIJU) return;

        // Round 15 — HELLSPAWN PORTAL. Hell queens (and hell kings)
        // don't spawn ordinary minions — they open a magenta portal
        // that births 2 small "imps" instead of 1 standard child.
        // The portal entity persists for 6s with sustained particles.
        const isHellQueen = (queen.kind === "hell" || action.kind === "hell");
        if (isHellQueen && !action.crossKind) {
            this._spawnHellPortal(queen, action);
            return;
        }

        // Round 36 — kings spawn cross-kind.
        let spawnKind = action.kind;
        if (action.crossKind) {
            const allKinds = Object.keys(KAIJU_ATTACKS).length > 0
                ? Object.keys(this._knownKindNames())
                : ["sky", "hell", "space", "water", "underground", "cave"];
            const others = allKinds.filter(k => k !== queen.kind);
            if (others.length) {
                spawnKind = others[(Math.random() * others.length) | 0];
            }
        }

        const config = pickKindConfig(spawnKind);
        const sharedAllegiance = -queen.id;   // negative = "kaiju family", not a civ id

        // Spawn at offset so kaiju doesn't overlap queen
        const offsetAngle = Math.random() * Math.PI * 2;
        const offsetDist = 4;
        const spawnX = action.x + Math.cos(offsetAngle) * offsetDist;
        const spawnZ = action.z + Math.sin(offsetAngle) * offsetDist;

        const child = this._spawn({
            x: spawnX, y: config.spawnLandY, z: spawnZ,
            kind: spawnKind,
            targetCivId: queen.targetCivId,
            allegiance: sharedAllegiance,
            allegianceColor: queen.allegianceColor,
        });
        if (child) {
            // Child skips the spawning state — already at land y
            child.state = "seeking";
            // Queens also share allegiance with their children
            queen.allegiance = sharedAllegiance;
            const tag = action.crossKind ? "king cross-spawn" : "queen spawn";
            console.log(`[KaijuManager] ${queen.name} ${tag}: ${child.name} (${child.kind}) — ${queen._queenChildren} total`);
        }
    }

    // Helper: enumerate currently-known kaiju kinds. Reads from
    // kaijuKinds module via the live KAIJU_KINDS object (shape:
    // string keys → config). Used by king cross-spawn.
    _knownKindNames() {
        // Lazy import the registry — avoids circular import order issues
        // by using the pickKindConfig closure's registry indirectly.
        // We always have the 6 base kinds; modders extend via registerKaijuKind.
        const baseKinds = ["sky", "hell", "space", "water", "underground", "cave", "tech"];
        const result = {};
        for (const k of baseKinds) result[k] = true;
        return result;
    }

    // Scan from y=60 downward for the first non-air voxel — terrain
    // top at (x, z). Used to position lava rings and other surface
    // effects. Cheap and only runs at spawn time.
    _terrainTop(x, z) {
        // v454 — prefer the PROCEDURAL surface height. The voxel scan below
        // returns a bogus high value over chunks that aren't meshed yet (an
        // unloaded cell reads as non-air at y=60 → kaiju snap to ~61 and float
        // in the sky). _heightAt has a procedural fallback that's correct
        // everywhere, so use it first and only scan voxels as a backstop.
        if (this.world && typeof this.world._heightAt === "function") {
            const h = this.world._heightAt(Math.floor(x), Math.floor(z));
            if (Number.isFinite(h) && h > 0) return h + 1;
        }
        if (!this.world) return 12;
        const get = this.world.voxelAt
            ? (xx, yy, zz) => this.world.voxelAt(xx, yy, zz)
            : this.world.getVoxel
                ? (xx, yy, zz) => this.world.getVoxel(xx, yy, zz)
                : null;
        if (!get) return 12;
        const ix = Math.floor(x), iz = Math.floor(z);
        for (let y = 60; y >= 0; y--) {
            if (get(ix, y, iz) !== 0) return y + 1;
        }
        return 1;
    }

    // v516 — water splash + wake. Throttled per-kaiju: while touching water and
    // actually moving, emit a footstep ripple at the feet, a trailing ripple
    // behind the travel direction, and a small spray. Force scales with the
    // kaiju's size. No-op off the water or when the water globals are absent.
    _waterWake(k, delta, inWater) {
        if (!inWater) { k._wfT = 0; return; }
        const wf = (typeof window !== "undefined") ? window.waterField  : null;
        const gp = (typeof window !== "undefined") ? window.gpuParticles : null;
        k._wfT = (k._wfT || 0) + (delta || 0);
        if (k._wfT < 0.18) return;                       // ~5 wakes/sec max
        k._wfT = 0;
        const px = k.position.x, pz = k.position.z;
        const last = k._wfLast;
        const moved = last ? Math.hypot(px - last.x, pz - last.z) : 0;
        k._wfLast = { x: px, z: pz };
        if (moved < 0.05) return;                        // only when moving
        const scale = (k.config?.scale || 1) * (k.absorbScale || 1);
        const force = Math.min(2.6, 0.6 + scale * 0.25 + moved * 0.4);
        if (wf) {
            try { wf.splash(px, pz, force, 1.5 + scale * 0.3); } catch {}
            if (last) {                                  // trailing wake behind travel
                const bx = px - (px - last.x) * 3, bz = pz - (pz - last.z) * 3;
                try { wf.splash(bx, bz, force * 0.6, 1.2); } catch {}
            }
        }
        if (gp?.spawnBurst) {
            try {
                gp.spawnBurst({ x: px, y: 8.6, z: pz, count: Math.min(16, 4 + (scale | 0) * 2),
                    speed: 3 + scale, direction: [0, 1, 0], spreadAngle: 1.1,
                    life: 0.5, size: 0.4, r: 0.85, g: 0.93, b: 1.0, shape: 0 });
            } catch {}
        }
    }

    _emit(type, kaiju, extras = {}) {
        if (!this.events) return;
        const evt = {
            type,
            intensity: type === "kaiju_death" ? 1.0 : 0.8,
            x: kaiju.position.x,
            y: kaiju.position.y,
            z: kaiju.position.z,
            kaijuId:     kaiju.id,
            kaijuName:   kaiju.name,
            kaijuKind:   kaiju.kind,
            kaijuOrigin: kaiju.origin,
        };
        // Optional extras: { other } for clash, { victim } for victory
        if (extras.other) {
            evt.otherKaijuId   = extras.other.id;
            evt.otherKaijuName = extras.other.name;
            evt.otherKaijuKind = extras.other.kind;
            evt.otherX = extras.other.position.x;
            evt.otherZ = extras.other.position.z;
        }
        if (extras.victim) {
            evt.victimKaijuId   = extras.victim.id;
            evt.victimKaijuName = extras.victim.name;
            evt.victimKaijuKind = extras.victim.kind;
        }
        this.events.publish(evt);
    }

    // ====================== ABSORB MECHANIC =================================
    // Round 274 — kaiju with an absorb affinity grow instead of taking
    // damage of their type. Tier 0..10. At tier 10 a termination event
    // fires (one of OVERLOAD/MELT/DISINTEGRATE/DEMON_PULL).

    // Push the kaiju's current absorbScale into the rendered entity's
    // Render component so the world mesh visibly swells. Called by the
    // tick loop when k.absorbScale has changed since last sync.
    _pushAbsorbScale(k) {
        if (!this.ecsWorld?.getComponent) return;
        // Find the bot entity for this kaiju. KaijuManager owns kaiju
        // game-state; the visible enemy is the BotManager entity it
        // spawned as a wrapper. We don't have direct kaiju→bot mapping
        // here, so we look up by kaijuOrigin tag in BotManager.
        const bm = this.botManager;
        if (!bm?.bots) return;
        for (const bot of bm.bots.values()) {
            // Match on kaijuOrigin (kind name) + position proximity —
            // there can be multiple kaiju of the same kind alive at
            // once, so kind alone isn't enough. Position within 0.6u
            // is tight enough since both reads happen on the same tick.
            if (bot.spec?.kaijuOrigin !== k.kind) continue;
            const dx = bot.x - k.position.x;
            const dz = bot.z - k.position.z;
            if (dx*dx + dz*dz > 0.6 * 0.6) continue;
            try {
                const render = this.ecsWorld.getComponent(bot.entityId, "Render");
                if (render) {
                    // Multiply baseline kind-scale by absorbScale.
                    // The original baseline lives on spec.scale (already
                    // factored through SCALE_RATIO at spawn). We undo
                    // any previous multiply by reading the cached
                    // _baseScale we stash on first sync.
                    if (bot._baseScale == null) bot._baseScale = render.scale;
                    render.scale = bot._baseScale * k.absorbScale;
                }
                // Also bump the bot's logical scale so bot-bot collision
                // + sight ranges scale with it (heavy kaiju have bigger
                // hitboxes).
                bot.scaleMul = k.absorbScale;
            } catch {}
            break;
        }
    }

    // Emit a brief particle burst at the kaiju feet. Visually distinct
    // from the standard "damage flash" — uses bright cyan/white particles
    // and an upward spiral so the player reads it as ABSORPTION not HIT.
    _emitAbsorbPulse(k) {
        const particles = this.particles;
        if (!particles?.spawn) return;
        const p = k.position;
        const BURST = 24;
        for (let i = 0; i < BURST; i++) {
            const angle = (i / BURST) * Math.PI * 2;
            const r = 1.2 + Math.random() * 1.4;
            particles.spawn({
                x: p.x + Math.cos(angle) * r,
                y: p.y + 0.4,
                z: p.z + Math.sin(angle) * r,
                vx: Math.cos(angle) * 1.2,
                vy: 5 + Math.random() * 2,        // upward spiral
                vz: Math.sin(angle) * 1.2,
                r: 0.7, g: 0.95, b: 1.0, a: 0.85,
                size: 0.6, lifeMs: 900,
                gravity: -1.5,                     // float up
            });
        }
    }

    // Termination resolution. Kaiju has hit tier 10 and absorbsType
    // termination tag was picked at that moment. Apply the FX, then
    // mark the kaiju as dying so the normal cleanup paths kick in.
    _fireAbsorbTermination(k) {
        const kind = k._terminating;
        const p = k.position;
        const particles = this.particles;
        console.log(`[KaijuManager] ${k.name} TERMINATING via ${kind} (tier ${k.absorbTier} absorbs=${k.absorbsType})`);
        switch (kind) {
            case "OVERLOAD": {
                // 24u radius AOE blast. Damages all other kaiju in radius
                // (no absorb — overload is multi-spectral and bypasses
                // affinity) plus pushes any tank/bot away from the blast.
                const R = 24, R2 = R * R;
                for (const o of this.kaiju.values()) {
                    if (o === k) continue;
                    if (!o.isAlive?.()) continue;
                    const op = o.position;
                    const dx = op.x - p.x, dz = op.z - p.z;
                    const d2 = dx*dx + dz*dz;
                    if (d2 < R2) {
                        const falloff = 1 - Math.sqrt(d2 / R2) * 0.7;
                        o.energy = Math.max(0, (o.energy ?? 1) - 0.5 * falloff);
                    }
                }
                if (particles?.spawn) {
                    for (let i = 0; i < 80; i++) {
                        const a = (i / 80) * Math.PI * 2;
                        const s = 8 + Math.random() * 8;
                        particles.spawn({
                            x: p.x, y: p.y + 2, z: p.z,
                            vx: Math.cos(a) * s, vy: Math.random() * 6, vz: Math.sin(a) * s,
                            r: 1.0, g: 0.85, b: 0.20, a: 1.0,
                            size: 1.4, lifeMs: 1400,
                            gravity: 4,
                        });
                    }
                }
                try { window._damageFlash?.flash?.(0.8); } catch {}
                break;
            }
            case "MELT": {
                // Collapse into a lava pool. Place LAVA voxels in a
                // small disk under the kaiju that persist as a hazard.
                const world = this.world;
                if (world?.setVoxel) {
                    const cy = Math.floor(p.y);
                    for (let dx = -3; dx <= 3; dx++) {
                        for (let dz = -3; dz <= 3; dz++) {
                            if (dx*dx + dz*dz > 9) continue;
                            try { world.setVoxel(Math.floor(p.x) + dx, cy, Math.floor(p.z) + dz, 12); } catch {}
                        }
                    }
                }
                if (particles?.spawn) {
                    for (let i = 0; i < 40; i++) {
                        particles.spawn({
                            x: p.x + (Math.random() - 0.5) * 4,
                            y: p.y + 1,
                            z: p.z + (Math.random() - 0.5) * 4,
                            vx: 0, vy: -1.5, vz: 0,
                            r: 1.0, g: 0.4, b: 0.05, a: 0.85,
                            size: 0.9, lifeMs: 1800,
                            gravity: 1,
                        });
                    }
                }
                break;
            }
            case "DISINTEGRATE": {
                // Dissolve into bright sparkles. No after-effect.
                if (particles?.spawn) {
                    for (let i = 0; i < 100; i++) {
                        const a = Math.random() * Math.PI * 2;
                        const r = Math.random() * 2;
                        particles.spawn({
                            x: p.x + Math.cos(a) * r,
                            y: p.y + Math.random() * 4,
                            z: p.z + Math.sin(a) * r,
                            vx: (Math.random() - 0.5) * 3,
                            vy: Math.random() * 3,
                            vz: (Math.random() - 0.5) * 3,
                            r: 0.9, g: 0.95, b: 1.0, a: 0.9,
                            size: 0.5, lifeMs: 1600,
                            gravity: -0.5,
                        });
                    }
                }
                break;
            }
            case "DEMON_PULL": {
                // Hellspawn portal opens — dark vortex of red particles
                // spiraling DOWN at the kaiju position. Distinct from
                // disintegrate's bright sparkle.
                if (particles?.spawn) {
                    for (let i = 0; i < 80; i++) {
                        const a = (i / 80) * Math.PI * 2 + Math.random() * 0.5;
                        const r = 3 + Math.random() * 2;
                        particles.spawn({
                            x: p.x + Math.cos(a) * r,
                            y: p.y + 4 - Math.random() * 4,
                            z: p.z + Math.sin(a) * r,
                            vx: -Math.cos(a) * 4,          // inward
                            vy: -3,                          // downward
                            vz: -Math.sin(a) * 4,
                            r: 0.9, g: 0.1, b: 0.1, a: 0.85,
                            size: 0.8, lifeMs: 1500,
                            gravity: -2,                     // accelerate down
                        });
                    }
                }
                break;
            }
        }
        // Mark as dying — KaijuManager's normal death cleanup picks
        // it up next tick (state=dying, energy=0).
        k.state = "dying";
        k.energy = 0;
        this._emit("kaiju_terminated", k, {});
    }

    // v772 — fire a named attack on demand. Public-callable for
    // console testing + scripted scenarios.
    //   window.kaijuManager.fireSpecific(kaijuOrId, "tractor_beam");
    //   window.kaijuManager.fireSpecific(123, "acid_spit", { x:0, y:0, z:0 });
    // If no target is provided, uses the kaiju's nearest valid target.
    // Returns true if fired, false if attack/kaiju/target couldn't be
    // resolved.
    fireSpecific(kaijuOrId, attackName, target = null) {
        // Resolve kaiju
        const k = (typeof kaijuOrId === "object")
            ? kaijuOrId
            : this.kaiju?.get?.(kaijuOrId);
        if (!k || !k.isAlive?.()) {
            console.warn("[kaiju.fireSpecific] kaiju not found or not alive:", kaijuOrId);
            return false;
        }
        // Resolve attack from registry
        const attack = KAIJU_ATTACKS[attackName];
        if (!attack) {
            console.warn("[kaiju.fireSpecific] unknown attack:", attackName);
            return false;
        }
        // Resolve target — use kaiju's nearest if not provided
        let tgt = target;
        if (!tgt) {
            try { tgt = this._findRangedTarget?.(k, attack.range ?? 30); } catch {}
        }
        if (!tgt) {
            console.warn("[kaiju.fireSpecific] no target in range for", attackName);
            return false;
        }
        // Dispatch by family
        try {
            if (attack.family === "beam")        this._executeBeam(k, attack, tgt);
            else if (attack.family === "projectile") this._executeProjectileAttack(k, attack, tgt);
            else if (attack.family === "aoe")    this._executeAoEAttack(k, attack, tgt);
            else {
                console.warn("[kaiju.fireSpecific] unknown family:", attack.family);
                return false;
            }
            console.log(`[kaiju.fireSpecific] ${attackName} (${attack.family}) → target at (${tgt.x?.toFixed?.(1)}, ${tgt.z?.toFixed?.(1)})`);
            return true;
        } catch (e) {
            console.warn("[kaiju.fireSpecific] execute failed:", e?.message);
            return false;
        }
    }

    // v774 — first-person kaiju drive fire button (round 31). Called
    // from the camera's mousedown handler when mode === "kaiju_drive".
    // Picks the kaiju's primary attack via the registry rotation, checks
    // weapon energy + cooldown, and fires through fireSpecific so the
    // existing status-effect + civ-damage paths all run.
    //
    // Returns one of:
    //   { ok: true, attack }                — fired successfully
    //   { ok: false, reason: "no_energy" }  — not enough _weaponEnergy
    //   { ok: false, reason: "no_target" }  — nothing in range
    //   { ok: false, reason: "cooldown" }   — last shot too recent
    //   { ok: false, reason: "no_attack" }  — no attack found for kind
    //
    // v775 — accepts optional `cam` so target selection is crosshair-
    // aware (closest along the camera's forward ray, not just nearest
    // to the kaiju). Backward-compatible: no cam = previous behavior.
    playerFire(k, cam = null) {
        if (!k || !k.isAlive?.()) return { ok: false, reason: "no_kaiju" };
        if (k._weaponEnergy == null) k._weaponEnergy = 1.0;

        // Resolve the primary attack for this kaiju (king-aware rotation
        // taken care of by getAttackForKaiju)
        const attack = getAttackForKaiju(k);
        if (!attack) return { ok: false, reason: "no_attack" };

        // Energy cost. v779 — family-specific costs paired with
        // family-specific cooldowns below so sustained fire (LMB held)
        // produces the right feel per family:
        //   beam       80ms × 0.05 = 0.625/s drain → 2.4s of held fire
        //   aoe       150ms × 0.10 = 0.66/s drain  → 2.2s of held fire
        //   projectile 250ms × 0.20 = 0.80/s drain → 1.7s of held fire
        // Continuous beam reads as a stream (12.5Hz spawn); aoe as
        // rapid flame pulses; projectile as discrete shots.
        const cost = attack.energyCost ?? (
            attack.family === "aoe"        ? 0.10 :
            attack.family === "projectile" ? 0.20 :
            attack.family === "beam"       ? 0.05 :
            0.20
        );
        if (k._weaponEnergy < cost) {
            // v782 — empty-energy click. Plays a soft beep so the player
            // knows their click failed (vs the click just being silently
            // ignored). Throttle to 200ms so held LMB doesn't beep-spam.
            try {
                const now2 = (typeof performance !== "undefined") ? performance.now() : Date.now();
                if (!k._lastEmptyBeepMs || (now2 - k._lastEmptyBeepMs) > 200) {
                    k._lastEmptyBeepMs = now2;
                    window.audio?.play?.("cs_beep");
                }
            } catch {}
            return { ok: false, reason: "no_energy" };
        }

        // v779 — family-specific cooldown. Beam is fastest so held LMB
        // looks like a continuous laser/ice ray instead of a stutter.
        const cooldownMs = attack.cooldownMsPlayer ?? (
            attack.family === "beam"       ?  80 :
            attack.family === "aoe"        ? 150 :
            attack.family === "projectile" ? 250 :
            250
        );
        const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
        if (k._lastPlayerFireMs && (now - k._lastPlayerFireMs) < cooldownMs) {
            return { ok: false, reason: "cooldown" };
        }

        // Find target via the crosshair-aware finder (v775). If no
        // target lies in the aim cone, falls back to proximity, so a
        // wild click on open terrain may still pick something nearby.
        const target = cam
            ? this._findCrosshairTarget(k, attack.range ?? 30, cam)
            : this._findRangedTarget(k, attack.range ?? 30);
        if (!target) return { ok: false, reason: "no_target" };

        // Find the attack name from the registry so fireSpecific can
        // resolve it. Walk KAIJU_ATTACKS for an exact value match.
        let attackName = null;
        for (const [name, def] of Object.entries(KAIJU_ATTACKS)) {
            if (def === attack) { attackName = name; break; }
        }
        if (!attackName) return { ok: false, reason: "no_attack_name" };

        const fired = this.fireSpecific(k, attackName, target);
        if (!fired) return { ok: false, reason: "fire_failed" };

        // Drain + record cooldown timestamp
        k._weaponEnergy = Math.max(0, k._weaponEnergy - cost);
        k._lastPlayerFireMs = now;
        // v778 — record the just-hit target for lock-on stickiness.
        // Stored on the kaiju so each driven kaiju has its own lock.
        // The next _findCrosshairTarget call will give this target
        // preference (wider effective cone) for ~1.5s.
        k._lockTarget    = target;
        k._lockExpiresAt = now + 1500;

        // v780 — camera shake on fire. AoE gives the biggest punch
        // (heavy attack feel); beams give a subtle quiver; projectiles
        // a micro-thump per shot. Tied to the player camera only via
        // window.camera.shake so this doesn't accidentally shake AI
        // kaiju attacks (which use a different code path).
        try {
            const playerCam = (typeof window !== "undefined") ? window.camera : null;
            if (playerCam?.shake && playerCam.mode === "kaiju_drive" && playerCam._kaijuTarget === k) {
                if      (attack.family === "aoe")        playerCam.shake(0.60, 280);
                else if (attack.family === "beam")       playerCam.shake(0.20, 120);
                else if (attack.family === "projectile") playerCam.shake(0.10,  80);
            }
        } catch {}

        // v781 — audio feedback. Map attack family to an existing ogre
        // combat sound: beam→laser-fire, aoe→artillery-fire,
        // projectile→mg-fire. Played spatially at the kaiju position.
        // v782 — extracted to _playFireAudio helper, shared with AI fire paths.
        // v788 — pass attackName for per-attack-name override (e.g. flamethrower → gas_blast)
        this._playFireAudio(k, attack, attackName);

        return { ok: true, attack, attackName, cost };
    }

    // v775 (round 31 polish) — crosshair-aware targeting. Ranks targets
    // by how close they lie to the camera's forward ray instead of by
    // raw distance to the kaiju. Returns the closest-along-ray target
    // within `aimConeR` units of the ray (3u default — generous, so
    // grazing aim still hits). Falls back to _findRangedTarget if
    // nothing's directly aimed at, so wild clicks still do something.
    //
    // cam:        { position, yaw, pitch }   (Camera object)
    // range:      max distance along the ray
    // aimConeR:   max perpendicular distance from the ray (defaults 3)
    _findCrosshairTarget(k, range, cam, aimConeR = 3.0) {
        if (!cam) return this._findRangedTarget(k, range);
        // Forward direction in engine convention (yaw=0 → -Z, +pitch up).
        const cy = Math.cos(cam.yaw),  sy = Math.sin(cam.yaw);
        const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        const fx =  sy * cp;
        const fy =  sp;
        const fz = -cy * cp;
        const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
        const aimConeR2 = aimConeR * aimConeR;

        // Helper: score a single target along the camera ray. Returns
        // dot-distance if in cone, -1 if behind/too far/out of cone.
        const scoreTarget = (t) => {
            if (!t || typeof t.x !== "number") return -1;
            const ty = (typeof t.y === "number") ? t.y : (t.center?.y ?? 0);
            const tz = (typeof t.z === "number") ? t.z : (t.center?.z ?? 0);
            const tx = (typeof t.x === "number") ? t.x : (t.center?.x ?? 0);
            const dx = tx - ox, dy = ty - oy, dz = tz - oz;
            const dot = dx*fx + dy*fy + dz*fz;
            if (dot < 0.5 || dot > range) return -1;       // behind or too far
            const d2 = dx*dx + dy*dy + dz*dz;
            const perp2 = d2 - dot*dot;
            if (perp2 > aimConeR2) return -1;              // outside aim cone
            return dot;                                    // lower = closer along ray
        };

        let bestT = null;
        let bestDot = Infinity;

        // Pass 1: _extraRangedTargets (tanks, planes, custom)
        try {
            if (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets)) {
                for (const t of window._extraRangedTargets) {
                    const score = scoreTarget(t);
                    if (score >= 0 && score < bestDot) { bestDot = score; bestT = t; }
                }
            }
        } catch {}

        // Pass 2: civs (use .center for position)
        if (this.civManager?.getAll) {
            try {
                for (const c of this.civManager.getAll()) {
                    if (!c.center) continue;
                    const proxy = { x: c.center.x, y: c.center.y, z: c.center.z };
                    const score = scoreTarget(proxy);
                    if (score >= 0 && score < bestDot) {
                        bestDot = score;
                        // Civs don't natively expose .applyDamage to fireSpecific
                        // (only via the v772 shim). Pass the civ itself so
                        // _executeAoEAttack's civ-radius logic can damage it.
                        bestT = { x: c.center.x, y: c.center.y, z: c.center.z, ref: c, applyDamage: (d) => c.applyDamage?.(d) };
                    }
                }
            } catch {}
        }

        if (bestT) return bestT;

        // v778 — lock-on stickiness. If we recently hit a target and
        // it's still alive + still roughly in view, prefer it even
        // when the normal aim cone missed. Wider cone (6u) gives soft
        // aim-assist without being magnet-style snap.
        const k_arg = k;   // alias for clarity in this block
        if (k_arg && k_arg._lockTarget && k_arg._lockExpiresAt) {
            const lockNow = (typeof performance !== "undefined") ? performance.now() : Date.now();
            if (lockNow < k_arg._lockExpiresAt) {
                const lt = k_arg._lockTarget;
                // Verify the locked target is still valid (not removed,
                // not despawned). Tanks/planes get removed from
                // _extraRangedTargets on death; civs are in the civ map.
                // v779 — civs are valid lock targets too: their proxy
                // target wraps a civ ref; check the civManager registry.
                let stillValid = false;
                try {
                    if (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets)
                            && window._extraRangedTargets.includes(lt)) {
                        stillValid = true;
                    } else if (this.civManager?.civilizations && lt?.ref?.id != null) {
                        stillValid = this.civManager.civilizations.has(lt.ref.id);
                    }
                } catch {}
                if (stillValid) {
                    // Wider cone — 6u instead of 3u — for the locked target
                    const tx = (typeof lt.x === "number") ? lt.x : (lt.center?.x ?? 0);
                    const ty = (typeof lt.y === "number") ? lt.y : (lt.center?.y ?? 0);
                    const tz = (typeof lt.z === "number") ? lt.z : (lt.center?.z ?? 0);
                    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
                    const dot = dx*fx + dy*fy + dz*fz;
                    if (dot > 0.5 && dot <= range) {
                        const perp2 = (dx*dx + dy*dy + dz*dz) - dot*dot;
                        if (perp2 <= 36) {   // 6u radius
                            return lt;
                        }
                    }
                }
            }
        }

        // Fallback: nothing in the aim cone — use the AI's proximity finder
        // so the click doesn't silently fail when there's a target nearby.
        return this._findRangedTarget(k, range);
    }

    // v788 — per-attack audio mapping. Looked up first; falls through to
    // family defaults when not specified. Each entry is a sound name from
    // the engine's audio catalog (see ai-bridge or engine/audio.js for
    // the full list). Empty / unknown attacks fall to family default.
    static get ATTACK_SOUND_MAP() {
        return {
            // Beam family
            "laser":         "ogre_laser_fire",
            "ice_ray":       "ogre_laser_fire",
            "flamethrower":  "ogre_gas_blast",       // fire breath, not laser
            "tractor_beam":  "ogre_laser_fire",
            "lightning":     "ogre_internal_explosion",  // hard CRACK
            "hell_curse":    "ogre_gas_blast",
            // Projectile family
            "fireball":      "ogre_missile_fire",
            "magic_orb":     "ogre_missile_fire",
            "plasma":        "ogre_missile_fire",
            "ion_lance":     "ogre_laser_fire",       // beam-feel projectile
            "guns":          "ogre_mg_fire",
            // AoE family
            "rad_pulse":     "ogre_artillery_fire",
            "meteor":        "ogre_artillery_fire",
            "acid_spit":     "ogre_gas_blast",
            "plague":        "ogre_gas_blast",
            "sonic_scream":  "ogre_internal_explosion",
            "emp_burst":     "ogre_internal_explosion",
            "deluge":        "ogre_artillery_fire",
            "typhoon":       "ogre_artillery_fire",
            "tidal_wave":    "ogre_artillery_fire",
        };
    }

    // v782 — shared audio helper used by both playerFire (LMB) AND
    // the AI fire paths (_executeBeam/Projectile/AoE). Throttle is
    // per-kaiju so each kaiju's audio rate-limits independently.
    // v788 — attackName-first lookup before family fallback so each
    // attack can have its own distinctive sound.
    _playFireAudio(k, attack, attackName = null) {
        try {
            const audio = (typeof window !== "undefined") ? window.audio : null;
            if (!audio || (!audio.play && !audio.playSpatial)) return;
            const now = (typeof performance !== "undefined") ? performance.now() : Date.now();
            const audioThrottleMs = (attack.family === "beam") ? 300
                                   : (attack.family === "aoe")  ? 200
                                   :                              60;
            if (k._lastFireAudioMs && (now - k._lastFireAudioMs) <= audioThrottleMs) return;
            k._lastFireAudioMs = now;
            // v788 — per-attack lookup wins; falls back to family default
            const specific = attackName ? KaijuManager.ATTACK_SOUND_MAP[attackName] : null;
            const familyDefault = (attack.family === "beam")        ? "ogre_laser_fire"
                                : (attack.family === "aoe")          ? "ogre_artillery_fire"
                                : (attack.family === "projectile")   ? "ogre_mg_fire"
                                : "fps_fire";
            const soundName = specific || familyDefault;
            if (audio.playSpatial && typeof window !== "undefined" && window.camera) {
                audio.playSpatial(soundName, k.position.x, k.position.y, k.position.z, window.camera);
            } else if (audio.play) {
                audio.play(soundName);
            }
        } catch {}
    }

    // v776 — read-only crosshair peek for HUD. Same geometry as
    // _findCrosshairTarget but returns null if nothing in the aim cone
    // (no proximity fallback — the HUD wants to know specifically
    // whether the player has a direct lock, not whether SOMETHING is
    // around). Also returns the distance along the ray so the HUD can
    // show a range readout.
    peekCrosshairTarget(cam, range = 60, aimConeR = 3.0) {
        if (!cam) return null;
        const cy = Math.cos(cam.yaw),  sy = Math.sin(cam.yaw);
        const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
        const fx =  sy * cp, fy = sp, fz = -cy * cp;
        const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
        const aimConeR2 = aimConeR * aimConeR;

        const scoreT = (tx, ty, tz, name, ref) => {
            const dx = tx - ox, dy = ty - oy, dz = tz - oz;
            const dot = dx*fx + dy*fy + dz*fz;
            if (dot < 0.5 || dot > range) return null;
            const perp2 = (dx*dx + dy*dy + dz*dz) - dot*dot;
            if (perp2 > aimConeR2) return null;
            return { dot, name, ref, x: tx, y: ty, z: tz };
        };

        let best = null;
        try {
            if (typeof window !== "undefined" && Array.isArray(window._extraRangedTargets)) {
                for (const t of window._extraRangedTargets) {
                    if (!t || typeof t.x !== "number") continue;
                    const s = scoreT(t.x, t.y ?? 0, t.z, t.name || t._type || "target", t);
                    if (s && (!best || s.dot < best.dot)) best = s;
                }
            }
        } catch {}
        if (this.civManager?.getAll) {
            try {
                for (const c of this.civManager.getAll()) {
                    if (!c.center) continue;
                    const s = scoreT(c.center.x, c.center.y, c.center.z, c.name || `civ#${c.id}`, c);
                    if (s && (!best || s.dot < best.dot)) best = s;
                }
            } catch {}
        }
        return best;   // { dot, name, ref, x, y, z } or null
    }

    // v776 — read-only attack preview. Returns {attackName, attack, cost,
    // rotIdx, rotLen, nextAttackName} for what playerFire would dispatch
    // right now (and what'll fire next after rotation advances).
    // v777 — also returns rotation position [N/M] for HUD display.
    // v778 — rotLen now read from the actual rotation tables, and
    // nextAttackName added so the player can see what's queued up.
    peekPlayerAttack(k) {
        if (!k) return null;
        const attack = getAttackForKaiju(k);
        if (!attack) return null;
        const cost = attack.energyCost ?? (
            attack.family === "aoe"        ? 0.10 :
            attack.family === "projectile" ? 0.20 :
            attack.family === "beam"       ? 0.05 :
            0.20
        );
        let attackName = null;
        for (const [name, def] of Object.entries(KAIJU_ATTACKS)) {
            if (def === attack) { attackName = name; break; }
        }

        // v778 — derive the ACTUAL rotation list this kaiju uses, then
        // read length + lookup next attack from it.
        let rotation, rotIdx;
        if (k.becameKing) {
            const kingRot = KING_ATTACK_ROTATION[k.kind];
            if (Array.isArray(kingRot) && kingRot.length > 0) {
                rotation = kingRot;
                rotIdx = (k._kingAttackRotIdx ?? 0) % rotation.length;
            } else {
                // King with no rotation: just KING_ATTACK_OVERRIDES (single entry)
                const name = KING_ATTACK_OVERRIDES[k.kind] || KIND_TO_ATTACK[k.kind];
                rotation = name ? [name] : [];
                rotIdx = 0;
            }
        } else {
            const prim = KIND_TO_ATTACK[k.kind];
            const alt  = KIND_TO_ATTACK_ALT[k.kind];
            const alt2 = KIND_TO_ATTACK_ALT2[k.kind];
            rotation = [prim, alt, alt2].filter(Boolean);
            rotIdx = rotation.length > 0 ? (k._attackRotIdx ?? 0) % rotation.length : 0;
        }
        const rotLen = rotation.length || 1;
        const nextAttackName = rotation.length > 1
            ? rotation[(rotIdx + 1) % rotation.length]
            : null;

        return {
            attackName: attackName || "?", attack, cost,
            rotIdx, rotLen, nextAttackName,
        };
    }

    _dispatch(action) {
        if (!action || !action.type) return;
        if (this.router) this.router.exec(action);
    }
}
