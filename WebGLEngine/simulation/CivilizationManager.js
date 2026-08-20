// v772 — status effects on civs. Civs use .energy instead of HP, but
// the status effect framework only needs applyDamage. We attach a
// shim applyDamage to each civ at registration time so acid DoTs,
// future poison effects, etc. flow through cleanly. Ticked from
// CivilizationManager.tick after the normal civ loop.
import * as statusEffectsModule from "./statusEffects.js";
// VERSION: v4 - + EVENT BUS HOOK
//
// Owns the live set of CivilizationEntity instances. Each tick(), every
// civ tick()s -> emits voxel:set/remove actions which we forward through
// the CommandRouter (or the world directly as fallback).
//
// Fixes from v2:
//   * _findClosest now exists. Before, every scanner pass spawned a new
//     civ, runaway count.
//   * getAll() exists. UniverseOptimizer reads civ list via this; the
//     optional-chain protected against the crash but metrics stayed 0.
//   * Optional router arg, same pattern as AIActionQueue v2.
//   * MAX_CIVS cap with oldest-out so a runaway scan can't unbounded-grow.
//
// New in v4:
//   * Optional eventBus arg. When provided, manager publishes typed events
//     (birth/expand/collapse/death) for narrative + scaffold consumers.

import { getOverride } from "../gpu/assetOverrides.js";
import { MegastructureProject } from "./MegastructureProject.js";
import { getMegastructureForStyle } from "./megastructurePatterns.js";
import {
    TECH_THRESHOLDS, TECH_NAMES,
    buildWalls, buildWatchtowers,
} from "./civTechPatterns.js";

const MERGE_RADIUS = 8;        // clusters within this distance merge into existing civ
const MAX_CIVS     = 24;       // soft cap; oldest entity ejected when exceeded

export class CivilizationManager {
    constructor(memoryField, opts = {}) {
        this.memory = memoryField;
        this.router = opts.router || null;
        this.world  = opts.world  || null;     // fallback when no router
        this.events = opts.eventBus || null;   // optional CivilizationEventBus
        this.assetLoader = opts.assetLoader || null;  // round 14 — GLB attachment
        // Round 126 — OGRE scenario reference. Wired post-construction
        // by main.js. Used to gate hellspawn-summon eligibility (only
        // fires when an OGRE is active) and to read OGRE proximity.
        this.ogreScenario = opts.ogreScenario || null;

        this.civilizations = new Map();        // id -> CivilizationEntity
        this.megaprojects  = new Map();        // civId -> MegastructureProject (round 25)
        this.wallProjects  = new Map();        // civId -> wall build (round 27 tier 1)
        this.watchtowerProjects = new Map();   // civId -> watchtower build (round 27 tier 2)
        this.nextId = 1;
        this.lastIngested = 0;
        this.lastTicked = 0;

        // Round 13 — active civ vs civ conflicts. Pair-keyed by
        // sorted ids ("3_7"). Value: { aId, bId, age } — age in
        // ticks for cinematic pacing & narrative variation.
        this._conflicts = new Map();
    }

    // Round 126 — late-bind OGRE scenario from main.js
    setOgreScenario(scenario) {
        this.ogreScenario = scenario;
    }

    // Wraps a list of clusters into entities and ingests them. Each cluster
    // is matched against existing civs first via _findClosest; if no match,
    // a new entity is spawned at that cluster's center.
    //
    // Caller is the CivilizationLoop in main.js — it handles wrapping the
    // CivilizationScanner output before passing in here, BUT this method
    // is also tolerant to plain clusters with .__entity already attached
    // (matches the v2 contract).
    ingest(clusters, EntityCtor) {
        // Round 43 — clamp to playable area. The GPU scanner picks up
        // ALL memory voxels including kaiju portal corners (round 35)
        // and tech metal trees (round 37) — these spawned far out, so
        // civs were being birthed outside the loaded world. Half-extent
        // = gridRadius * chunkSize. Without world ref, fall through.
        const halfExt = this.world
            ? this.world.gridRadius * this.world.chunkSize
            : Infinity;
        const inBounds = (cluster) => {
            const cx = cluster.x ?? cluster.center?.x ?? 0;
            const cz = cluster.z ?? cluster.center?.z ?? 0;
            return Math.abs(cx) <= halfExt && Math.abs(cz) <= halfExt;
        };

        for (const cluster of clusters) {
            if (!inBounds(cluster)) continue;     // skip out-of-world
            const closest = this._findClosest(cluster);
            if (closest) {
                // Merge: pull this cluster's center / score in slowly so
                // the existing civ tracks the moving cluster centroid.
                closest.center.x = closest.center.x * 0.7 + cluster.x * 0.3;
                closest.center.z = closest.center.z * 0.7 + cluster.z * 0.3;
                closest.score    = (closest.score   ?? 0) * 0.5 + cluster.score    * 0.5;
                continue;
            }

            // Spawn a new entity. Preference order:
            //   1. cluster.__entity (already-wrapped, the v2 contract)
            //   2. EntityCtor(id, cluster) factory passed in
            //   3. nothing → skip
            let civ = cluster.__entity;
            if (!civ && EntityCtor) {
                civ = new EntityCtor(this.nextId++, cluster);
            }
            if (!civ) continue;

            this.civilizations.set(civ.id, civ);
            // v772 — attach applyDamage shim so status effects can burn
            // civs through their .energy field. Civs spawned from
            // external EntityCtor may not have applyDamage natively;
            // this gives status effects a uniform target shape across
            // tanks/planes/civs.
            if (typeof civ.applyDamage !== "function") {
                civ.applyDamage = function(d) {
                    this.energy = Math.max(0, (this.energy ?? 1) - d);
                };
            }
            this.lastIngested++;
            this._emit("birth", civ, /*intensity*/ Math.min(1, civ.score ?? 0.5));

            // Round 14 — GLB attachment for civ markers. If
            // civ_<style>.json mesh is loaded, spawn an ECS entity
            // anchored at the civ's center; the marker renderer skips
            // civs that have a mesh entity attached.
            this._tryAttachMesh(civ);

            // Cap: drop the oldest if we're over.
            if (this.civilizations.size > MAX_CIVS) {
                const oldest = this.civilizations.keys().next().value;
                const dying = this.civilizations.get(oldest);
                if (dying) {
                    this._emit("death", dying, /*intensity*/ 1);
                    this._tryDetachMesh(dying);
                }
                this.civilizations.delete(oldest);
            }
        }
    }

    // Round 14 — civ mesh attachment helpers
    _tryAttachMesh(civ) {
        if (!this.router || !this.assetLoader) return false;
        // Round 18 — override-aware lookup before defaults
        const defaultId = `civ_${civ.style}`;
        const assetId = getOverride(defaultId) || defaultId;
        let cached = this.assetLoader.cache?.get(assetId);
        // Round 44 — fall to designed default mesh if no on-disk asset
        // was loaded. Final visual rung before cube renderer.
        if (!cached && this.assetLoader.loadDefaultForKindOrStyle) {
            cached = this.assetLoader.loadDefaultForKindOrStyle(assetId, civ.style);
        }
        if (!cached) return false;
        // v454 — ground the civ marker to the terrain surface. center.y can be
        // a stale/fallback value (30), which left civ markers floating.
        let _markerY = civ.center.y;
        try {
            const gy = this._terrainTopAt(civ.center.x, civ.center.z, this.world);
            if (Number.isFinite(gy) && gy > 0) { _markerY = gy; civ.center.y = gy; }
        } catch {}
        const result = this.router.exec({
            type: "entity:spawnMesh",
            assetId,
            x: civ.center.x, y: _markerY, z: civ.center.z,
            scale: 2.5,
            kind: defaultId,    // tint by default style for consistency
        });
        if (result?.ok && result.id != null) {
            civ._meshEntityId = result.id;
            return true;
        }
        return false;
    }

    _tryDetachMesh(civ) {
        if (civ._meshEntityId != null && this.router) {
            this.router.exec({
                type: "entity:despawn",
                id: civ._meshEntityId,
            });
            civ._meshEntityId = null;
        }
    }

    tick(delta, world) {
        for (const civ of this.civilizations.values()) {
            // Snapshot pre-tick state so we can detect transitions.
            const preIntent = civ.intent;
            const preEnergy = civ.energy;

            const actions = civ.tick(delta, this.memory, world);
            for (const a of actions) this._dispatch(a);

            // Emit "expand" once per tick the civ crosses the expansion
            // threshold from below; "collapse" similarly when energy drops
            // into the danger band. Edge-triggered to avoid one-event-per-
            // tick spam (the scaffold subscribers don't need that volume).
            if (preIntent <= 0.6 && civ.intent > 0.6) {
                this._emit("expand", civ, civ.intent);
            }
            if (preEnergy >= 0.2 && civ.energy < 0.2) {
                this._emit("collapse", civ, 1 - civ.energy);
            }

            // Round 38 — civ-low-energy audio danger trigger. Edge-fires
            // exactly once when energy first crosses below 0.3, doesn't
            // re-fire until civ recovers above 0.4 (hysteresis).
            if (preEnergy >= 0.3 && civ.energy < 0.3 && !civ._dangerLatch) {
                civ._dangerLatch = true;
                if (window.audioManager?.triggerDanger) {
                    window.audioManager.triggerDanger(1);
                }
            }
            if (civ._dangerLatch && civ.energy > 0.4) {
                civ._dangerLatch = false;
            }

            // Round 10 + 34: desperation summon. Once-per-civ-lifetime
            // when energy crosses below the personality's summon
            // threshold (0.10 peaceful → 0.25 militaristic) with
            // age > 30s.
            const summonThreshold = civ.personalityMods?.summonThreshold ?? 0.15;
            if (preEnergy >= summonThreshold && civ.energy < summonThreshold && civ.age > 30 && !civ.hasSummoned) {
                civ.hasSummoned = true;
                this._emit("summon_kaiju", civ, /*intensity*/ 1 - civ.energy);
            }

            // Round 126 — HELLSPAWN SUMMON vs OGRE.
            // Distinct from the desperation summon above: triggers when
            // an OGRE is active AND the civ qualifies AND it hasn't
            // summoned hellspawn in this OGRE wave. Eligibility:
            //   * personality ∈ { religious, militaristic } — others
            //     don't engage with the dark arts / heavy warfare.
            //   * tech tier ≥ 3 — needs sufficient advancement to call
            //     forth hellspawn.
            //   * energy > 0.30 — costs cosmic energy to summon.
            //   * within 80u of the OGRE chassis — the threat is close
            //     enough to matter to this civ.
            //   * rate-limited: once per OGRE wave per civ.
            this._tickHellspawnSummon(civ);

            // Round 25 — megastructure projects. A civ that's been
            // alive long enough with sufficient energy starts a
            // monumental project. Tracked separately from civ entity
            // so completed structures persist as ruins after death.
            this._tickMegaproject(civ, delta, world);

            // Round 27 — tech progression. Research advances each
            // tick on the entity itself; manager detects transitions
            // here and triggers tier-specific actions (build wall,
            // build watchtowers, fire defender bolts, fire counter-
            // projectiles).
            this._tickTechProgression(civ, delta, world);

            if (!civ.isAlive()) {
                this._emit("death", civ, /*intensity*/ 1);
                this._tryDetachMesh(civ);
                // Round 15 — leave a RUIN marker + scatter scorched-earth
                // voxels at the civ center. Megastructures already persist
                // as voxels; this adds a visible "fallen civ" trace.
                this._spawnRuin(civ, world);
                // Round 15 — clean up any active mobile defenders
                if (civ._defenders) {
                    for (let i = civ._defenders.length - 1; i >= 0; i--) {
                        this._destroyDefender(civ, i);
                    }
                }
                this.civilizations.delete(civ.id);
            }
        }

        // Round 13 — civ vs civ conflict scan. Civs are static, so
        // proximity is the entire trigger: two civs within
        // CONFLICT_RANGE enter mutual hostility. Mutual energy drain
        // + visible voxel chips on each side's territory. Conflict
        // ends when one civ dies (energy < 0.05) — survivor publishes
        // civ_victory and the dying civ goes through the natural
        // death path on the next pass.
        this._scanCivConflicts();

        // v772 — status effect tick on civs. Acid DoTs damage their
        // .energy through the applyDamage shim attached at registration.
        // Cheap when no civ has effects (tickAll early-outs per target).
        try {
            statusEffectsModule.tickAll(Array.from(this.civilizations.values()), delta * 1000);
        } catch (e) {
            // Don't let status bugs crash the civ tick
        }

        this.lastTicked++;
    }

    // Round 25 — kick off and tick a civ's megastructure project.
    // Conditions for starting: civ age > 45s, energy > 0.7, style
    // matches a known megastructure pattern, no project already
    // running.
    _tickMegaproject(civ, delta, world) {
        let project = this.megaprojects.get(civ.id);

        // Try to start a project
        if (!project && civ.isAlive && civ.age > 45 && civ.energy > 0.7) {
            const spec = getMegastructureForStyle(civ.style);
            if (spec) {
                // Place build site 14 units east of civ center so the
                // monument has its own footprint, not on top of the
                // existing civ structures
                const offsetX = 14;
                const baseX = civ.center.x + offsetX;
                const baseZ = civ.center.z;
                const baseY = this._terrainTopAt(baseX, baseZ, world);
                project = new MegastructureProject({
                    civ,
                    type: spec.type,
                    name: spec.name,
                    voxels: spec.voxels,
                    baseY,
                });
                project.anchor.x = baseX;
                project.anchor.z = baseZ;
                this.megaprojects.set(civ.id, project);
                this._emit("megaproject_start", civ, /*intensity*/ 0.5, {
                    megaName: spec.name,
                    megaType: spec.type,
                    megaX: project.anchor.x,
                    megaY: project.anchor.y,
                    megaZ: project.anchor.z,
                });
                console.log(`[CivManager] ${civ.name} begins ${spec.name} at (${baseX},${baseY},${baseZ})`);
            }
        }

        // Tick existing project
        if (project) {
            const wasComplete = project.completed;
            project.tick(delta, this.router);
            if (!wasComplete && project.completed) {
                this._emit("megaproject_complete", civ, /*intensity*/ 1.0, {
                    megaName: project.name,
                    megaType: project.type,
                    megaX: project.anchor.x,
                    megaY: project.anchor.y,
                    megaZ: project.anchor.z,
                });
                console.log(`[CivManager] ${civ.name} completes ${project.name}`);
            }
        }
    }

    _terrainTopAt(x, z, world) {
        if (!world) return 12;
        // v454 — prefer procedural height (correct over unmeshed chunks); the
        // voxel scan otherwise returns a bogus high value there and floats
        // civ structures/markers in the sky.
        if (typeof world._heightAt === "function") {
            const h = world._heightAt(Math.floor(x), Math.floor(z));
            if (Number.isFinite(h) && h > 0) return h + 1;
        }
        const get = world.voxelAt
            ? (xx, yy, zz) => world.voxelAt(xx, yy, zz)
            : (world.getVoxel ? (xx, yy, zz) => world.getVoxel(xx, yy, zz) : null);
        if (!get) return 12;
        for (let y = 60; y >= 0; y--) {
            const v = get(Math.floor(x), y, Math.floor(z));
            if (v !== 0 && v !== undefined) return y + 1;
        }
        return 12;
    }

    // Round 27 — tech tier progression. Detects research crossing
    // thresholds, applies tier-specific effects.
    _tickTechProgression(civ, delta, world) {
        // Detect tier transition (research crossed threshold)
        const oldTech = civ.tech;
        let newTech = oldTech;
        for (let t = TECH_THRESHOLDS.length - 1; t > oldTech; t--) {
            if (civ.research >= TECH_THRESHOLDS[t]) {
                newTech = t;
                break;
            }
        }
        if (newTech > oldTech) {
            civ.tech = newTech;
            this._onTechAdvance(civ, newTech, world);
        }

        // Tick active tier-1 wall build
        const wallProject = this.wallProjects.get(civ.id);
        if (wallProject) {
            const wasComplete = wallProject.completed;
            wallProject.tick(delta, this.router);
            if (!wasComplete && wallProject.completed) {
                this._emit("tech_walls_complete", civ, 0.5, {
                    techTier: 1,
                });
            }
        }
        // Tick active tier-2 watchtower build
        const wtProject = this.watchtowerProjects.get(civ.id);
        if (wtProject) {
            const wasComplete = wtProject.completed;
            wtProject.tick(delta, this.router);
            if (!wasComplete && wtProject.completed) {
                this._emit("tech_watchtowers_complete", civ, 0.5, {
                    techTier: 2,
                });
            }
        }

        // Tier 3+ behavior — fire defender bolts (particle stream +
        // small damage). Cooldown-gated.
        if (civ.tech >= 3) {
            this._tickDefenderBolts(civ);
        }

        // Tier 4+ behavior — fire counter-projectile every ~10s
        if (civ.tech >= 4) {
            this._tickCounterProjectile(civ);
        }

        // Tier 5+ behavior — spawn mobile defenders that march out
        // toward nearby kaiju and engage on contact. Round 15.
        if (civ.tech >= 5) {
            this._tickMobileDefenders(civ, delta);
        }
    }

    // Called once when civ.tech advances. Schedules build projects
    // for tiers 1+2; tiers 3+4 are immediate behavioral unlocks.
    _onTechAdvance(civ, newTech, world) {
        const tierName = TECH_NAMES[newTech] ?? `tier ${newTech}`;
        console.log(`[CivManager] ${civ.name} reaches tech tier ${newTech}: ${tierName}`);
        this._emit("tech_advance", civ, 0.4, {
            techTier: newTech,
            techName: tierName,
        });

        if (newTech === 1) {
            // Walls — build a defensive ring around civ center
            const baseY = this._terrainTopAt(civ.center.x, civ.center.z, world);
            const project = new MegastructureProject({
                civ,
                type: "walls",
                name: "Walls",
                voxels: buildWalls(),
                baseY,
            });
            this.wallProjects.set(civ.id, project);
        } else if (newTech === 2) {
            // Watchtowers — 4 corner towers
            const baseY = this._terrainTopAt(civ.center.x, civ.center.z, world);
            const project = new MegastructureProject({
                civ,
                type: "watchtowers",
                name: "Watchtowers",
                voxels: buildWatchtowers(),
                baseY,
            });
            this.watchtowerProjects.set(civ.id, project);
        }
        // Tier 3 + 4: behavioral, no build action needed
    }

    // Tier 3 — fire a defender bolt at nearest kaiju within range.
    // Visualized as 8 cyan particles streaming from civ to kaiju over
    // 0.4s. Damages the target by 0.04 energy on impact.
    _tickDefenderBolts(civ) {
        // Round 34 — militaristic civs cycle 0.55× (faster), peaceful
        // 1.30× (slower). Default 1.0 for safety on missing field.
        const cooldownMul = civ.personalityMods?.boltCooldownMul ?? 1.0;
        // Round 37 — last-stand mode: civ energy below 0.4 → halve
        // cooldown. Defenders fire desperately as civ approaches death.
        const lastStandMul = (civ.energy ?? 1) < 0.4 ? 0.5 : 1.0;
        const COOLDOWN = 2.5 * cooldownMul * lastStandMul;
        const RANGE    = 25;         // detect range
        const RANGE2   = RANGE * RANGE;
        const DAMAGE   = 0.04;
        if (civ.age - civ._lastBoltTime < COOLDOWN) return;
        if (!this.kaijuManager?.kaiju) return;

        // Round 37 — threat-prioritized target selection. Score each
        // in-range kaiju by (closeness × energy) so close+healthy kaiju
        // get hit first instead of just "whoever is nearest." Bigger
        // threat dies first, smaller stragglers later.
        let target = null, bestScore = -1;
        for (const k of this.kaijuManager.kaiju.values()) {
            if (!k.isAlive || !k.isAlive()) continue;
            const dx = k.position.x - civ.center.x;
            const dy = k.position.y - civ.center.y;
            const dz = k.position.z - civ.center.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= RANGE2) continue;
            // Closer = higher score. Healthier = higher score (don't
            // waste shots on retreating low-energy kaiju). 0.001 floor
            // on d2 prevents division explosion at zero distance.
            const closeness = 1.0 / (d2 + 0.001);
            const healthiness = (k.energy ?? 1);
            const score = closeness * (0.5 + healthiness);    // 0.5 floor so even drained kaiju get shot
            if (score > bestScore) { bestScore = score; target = k; }
        }
        if (!target) return;
        civ._lastBoltTime = civ.age;

        // Spawn particle stream: 8 cyan glyphs along civ→kaiju line
        if (this.particles?.spawn) {
            const fromX = civ.center.x;
            const fromY = civ.center.y + 4;        // launch above civ
            const fromZ = civ.center.z;
            const toX = target.position.x;
            const toY = target.position.y;
            const toZ = target.position.z;
            const dx = toX - fromX, dy = toY - fromY, dz = toZ - fromZ;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
            const speed = 18;
            const flightTime = dist / speed;
            for (let i = 0; i < 8; i++) {
                const t = i / 8;        // 0..1 along the path at staggered start
                this.particles.spawn({
                    x: fromX + dx * t, y: fromY + dy * t, z: fromZ + dz * t,
                    vx: dx / flightTime, vy: dy / flightTime, vz: dz / flightTime,
                    ttl: flightTime * (1 - t) + 0.15,
                    size: 0.45,
                    r: 0.55, g: 0.95, b: 1.0,    // cyan-ish
                    a: 0.9,
                    gravity: -3,                  // slight upward drift over flight
                    sprite: 5,                    // GLYPH (cyan plus)
                });
            }
        }

        // Apply damage to kaiju + tag damage time for retreat AI
        target.energy = Math.max(0, (target.energy ?? 1) - DAMAGE);
        target._lastDamageTime = target.age;       // round 37 — flee trigger
    }

    // Tier 4 — fire a counter-projectile (stone chunk) at nearest
    // kaiju. Uses ProjectileManager. Damage scales via the
    // projectile's own splash math.
    _tickCounterProjectile(civ) {
        // Round 34 — militaristic ~0.65× (faster), peaceful ~1.30×.
        const cooldownMul = civ.personalityMods?.counterCooldownMul ?? 1.0;
        const COOLDOWN = 8 * cooldownMul;
        const RANGE = 35;
        const RANGE2 = RANGE * RANGE;
        if (civ.age - civ._lastFireTime < COOLDOWN) return;
        if (!this.kaijuManager?.kaiju || !this.projectileManager) return;

        let target = null, bestD2 = RANGE2;
        for (const k of this.kaijuManager.kaiju.values()) {
            if (!k.isAlive || !k.isAlive()) continue;
            const dx = k.position.x - civ.center.x;
            const dz = k.position.z - civ.center.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < bestD2) { bestD2 = d2; target = k; }
        }
        if (!target) return;
        civ._lastFireTime = civ.age;

        // Round 14 — Tier 5+ civs upgrade to fire-trail missiles
        const tier = civ.tier ?? 4;
        const isMissile = tier >= 5;
        this.projectileManager.launch({
            from: { x: civ.center.x, y: civ.center.y + 6, z: civ.center.z },
            to:   { x: target.position.x, y: target.position.y, z: target.position.z },
            kind: isMissile ? "civ_missile" : "stone_chunk",
            scale: isMissile ? 0.8 : 1.2,
            ownerKaijuId: -civ.id,
            damageMul: isMissile ? 1.0 : 0.7,
            trail: isMissile ? "fire" : "smoke",
            trailColor: isMissile ? [1.0, 0.6, 0.2] : [0.8, 0.7, 0.5],
        });

        this._emit("civ_fires_counter", civ, 0.5, {
            targetKaijuName: target.name,
            targetKaijuKind: target.kind,
        });
    }

    // Round 126 — civ-vs-OGRE hellspawn summon. Per-civ-per-wave check.
    // Religious and militaristic civs of tier 3+ with sufficient energy
    // call forth hellspawn kaiju to attack the OGRE when it's nearby.
    // The summon is one-per-wave per civ; tracked via civ._lastOgreWave.
    //
    // The visible cue (portal burst) and downstream spawn happens in
    // KaijuManager._handleHellspawnSummon — this method only fires the
    // event after validation.
    _tickHellspawnSummon(civ) {
        if (!this.ogreScenario?.getOgreState) return;
        const og = this.ogreScenario.getOgreState();
        if (!og) return;
        // Personality gate — religious/militaristic only
        const pers = civ.personality;
        if (pers !== "religious" && pers !== "militaristic") return;
        // Tech tier gate — need tier 3+ (defender bolt class or higher)
        if ((civ.tech ?? 0) < 3) return;
        // Energy gate — costs cosmic vigor to summon, not allowed when
        // already on the brink (those civs use the desperation summon)
        if (civ.energy < 0.30) return;
        // Proximity gate — OGRE must be within 80u (roughly two
        // arena widths). Civs out of range don't notice the threat.
        const dx = og.x - civ.center.x;
        const dz = og.z - civ.center.z;
        if (dx * dx + dz * dz > 80 * 80) return;
        // Rate-limit: one summon per OGRE wave per civ. Track by wave
        // number so each new wave (e.g. wave 5 → 6) re-enables the
        // ability. If wave is undefined, default to 0.
        const currentWave = og.wave ?? 0;
        if (civ._lastOgreWave != null && civ._lastOgreWave === currentWave) return;
        civ._lastOgreWave = currentWave;
        // Cost: drains 0.15 energy as the price of the summon
        civ.energy = Math.max(0, civ.energy - 0.15);

        // Fire the event. KaijuManager picks it up via its subscription
        // and spawns the hellspawn kaiju with _targetsOgre flag.
        this._emit("summon_hellspawn_kaiju", civ, 1 - civ.energy, {
            wave: currentWave,
            personality: pers,
            tech: civ.tech ?? 0,
        });
    }

    // Round 15 — leave a "fallen civ" trace at civ center. Scatters
    // ASH voxels in a ring at ground surface + spawns a marker entity
    // for the renderer (ash-gray cube placeholder). Megastructures
    // already persist; this surface-level scar is the visible obit.
    // Round 15 — Tier 5+ civs spawn mobile defender entities that
    // march from the civ center toward nearby kaiju and engage on
    // contact. Defenders are short-lived (15s lifespan or first hit).
    _tickMobileDefenders(civ, delta) {
        if (!civ._defenders) civ._defenders = [];
        const MAX_DEFENDERS = 3;
        const SPAWN_INTERVAL = 12.0;
        const DETECTION_RANGE = 50;
        const DEFENDER_SPEED = 6;
        const DEFENDER_LIFE = 15.0;
        const DEFENDER_RANGE = 3.0;
        const DEFENDER_DAMAGE = 0.25;       // per-hit damage to kaiju

        // Spawn a new defender on cooldown
        civ._defenderSpawnTimer = (civ._defenderSpawnTimer ?? 0) - delta;
        if (civ._defenderSpawnTimer <= 0 && civ._defenders.length < MAX_DEFENDERS) {
            civ._defenderSpawnTimer = SPAWN_INTERVAL;
            const angle = Math.random() * Math.PI * 2;
            const r = 3;
            const dx = Math.cos(angle) * r;
            const dz = Math.sin(angle) * r;
            const def = {
                x: civ.center.x + dx,
                y: (civ.center.y ?? 30) + 1,
                z: civ.center.z + dz,
                yaw: 0,
                age: 0,
                entityId: null,
            };
            if (this.router) {
                // v1406 — wear a downloaded Adventurer (Characters folder) if one is
                // preloaded (window._libDefenderModels, same pool the OGRE arena uses);
                // else the procedural civ_defender. kind stays "civ_defender" so the AI/
                // damage/cleanup code is unchanged.
                let _defAsset = "civ_defender";
                try { const L = (typeof window !== "undefined") ? window._libDefenderModels : null; if (Array.isArray(L) && L.length) _defAsset = L[(Math.random() * L.length) | 0]; } catch {}
                const r2 = this.router.exec({
                    type: "entity:spawnMesh",
                    assetId: _defAsset,
                    kind: "civ_defender",
                    x: def.x, y: def.y, z: def.z,
                    scale: 0.9,
                });
                if (r2?.ok && r2.id != null) def.entityId = r2.id;

                // v756 — opt-in multi-part tank shape. Enable via console:
                //   window._useMultiPartCivDefenders = true
                // before tier-5+ civs spawn defenders. Builds 3 extra obelisks
                // (hull/turret/barrel) around the base civ_defender entity so
                // defenders read as tanks. The base entity is still spawned so
                // existing AI + damage code keeps working unchanged.
                try {
                    if (typeof window !== "undefined" && window._useMultiPartCivDefenders) {
                        // Dynamic import so this module load is optional
                        import("./multiPartVehicle.js").then(mod => {
                            try {
                                def._tank = mod.buildTank(this.router, def.x, def.z, { yaw: def.yaw ?? 0 });
                            } catch (e) {
                                console.warn("[civDefender] multi-part build failed:", e?.message);
                            }
                        }).catch(() => {});
                    }
                } catch {}
            }
            civ._defenders.push(def);
        }

        // Tick existing defenders
        if (civ._defenders.length === 0) return;
        for (let i = civ._defenders.length - 1; i >= 0; i--) {
            const d = civ._defenders[i];
            d.age += delta;
            // Lifespan expired
            if (d.age > DEFENDER_LIFE) {
                this._destroyDefender(civ, i);
                continue;
            }
            // Find nearest kaiju in detection range
            let target = null, bestD2 = DETECTION_RANGE * DETECTION_RANGE;
            if (this.kaijuManager?.kaiju) {
                for (const k of this.kaijuManager.kaiju.values()) {
                    if (!k.isAlive || !k.isAlive()) continue;
                    const dx = k.position.x - d.x;
                    const dz = k.position.z - d.z;
                    const d2 = dx * dx + dz * dz;
                    if (d2 < bestD2) { bestD2 = d2; target = k; }
                }
            }
            if (!target) {
                // Wander gently if no target
                d.x += (Math.random() - 0.5) * 0.5 * delta;
                d.z += (Math.random() - 0.5) * 0.5 * delta;
            } else {
                const dx = target.position.x - d.x;
                const dz = target.position.z - d.z;
                const dist = Math.hypot(dx, dz) || 1;
                d.yaw = Math.atan2(dx, dz);
                if (dist < DEFENDER_RANGE) {
                    // Engage — deal damage and explode
                    if (target.applyDamage) target.applyDamage(DEFENDER_DAMAGE);
                    else if (target.energy != null) target.energy = Math.max(0, target.energy - DEFENDER_DAMAGE);
                    // Round 270 — floating damage number for civ defender hits.
                    // Orange to distinguish from player (yellow) and satellites
                    // (per-type color).
                    if (typeof window !== "undefined" && window.damageNumbers?.show && target.position) {
                        window.damageNumbers.show(
                            target.position.x, target.position.y + 1.5, target.position.z,
                            Math.round(DEFENDER_DAMAGE * 100),
                            { color: "#ff9944", prefix: "-", size: 14, durationMs: 800 }
                        );
                    }
                    // Round 270 — minimap pulse at impact
                    if (typeof window !== "undefined" && window._wadMap?.addPulse && target.position) {
                        window._wadMap.addPulse(target.position.x, target.position.z, {
                            color: "#ff9944", radius: 7, durationMs: 600,
                        });
                    }
                    // Particle burst
                    if (this.particles?.spawn) {
                        for (let n = 0; n < 18; n++) {
                            const a = Math.random() * Math.PI * 2;
                            this.particles.spawn({
                                x: d.x, y: d.y + 1, z: d.z,
                                vx: Math.cos(a) * 4,
                                vy: 1 + Math.random() * 3,
                                vz: Math.sin(a) * 4,
                                ttl: 0.7, size: 0.5,
                                r: 1.0, g: 0.85, b: 0.4, a: 1.0,
                                gravity: 8,
                            });
                        }
                    }
                    this._destroyDefender(civ, i);
                    continue;
                }
                // Move toward target
                d.x += (dx / dist) * DEFENDER_SPEED * delta;
                d.z += (dz / dist) * DEFENDER_SPEED * delta;
                // Track ground height
                d.y = (this.world?.getHeightAt?.(d.x, d.z) ?? d.y) + 1;
            }
            // Update entity transform
            if (d.entityId != null && this.router) {
                this.router.exec({
                    type: "entity:move",
                    id: d.entityId,
                    x: d.x, y: d.y, z: d.z, yaw: d.yaw,
                });
            }
            // v756 — also move multi-part tank shell if present
            if (d._tank) {
                d._tank.x = d.x; d._tank.z = d.z; d._tank.yaw = d.yaw;
                d._tank.turretYaw = d.yaw;
                import("./multiPartVehicle.js").then(mod => {
                    try { mod.updateTankTransform(this.router, d._tank); } catch {}
                }).catch(() => {});
            }
        }
    }

    _destroyDefender(civ, index) {
        const d = civ._defenders[index];
        if (d?.entityId != null && this.router) {
            this.router.exec({ type: "entity:despawn", id: d.entityId });
        }
        // v756 — also despawn multi-part tank if present
        if (d?._tank) {
            import("./multiPartVehicle.js").then(mod => {
                try { mod.despawnTank(this.router, d._tank); } catch {}
            }).catch(() => {});
        }
        civ._defenders.splice(index, 1);
    }

    _spawnRuin(civ, world) {
        if (!world?.setVoxel || !world?.getVoxel) return;
        const cx = Math.floor(civ.center.x);
        const cz = Math.floor(civ.center.z);
        // Surface scan + scatter ash in irregular ring
        const VOXEL_ASH = 6;
        const RUIN_RADIUS = 5;
        for (let dz = -RUIN_RADIUS; dz <= RUIN_RADIUS; dz++) {
            for (let dx = -RUIN_RADIUS; dx <= RUIN_RADIUS; dx++) {
                const r = Math.hypot(dx, dz);
                if (r > RUIN_RADIUS || r < 1) continue;
                // Sparse pattern — 35% of cells in ring get ash
                if (Math.random() > 0.35) continue;
                const wx = cx + dx, wz = cz + dz;
                // Find topmost solid voxel
                for (let y = 80; y > 0; y--) {
                    const v = world.getVoxel(wx, y, wz);
                    if (v != null && v !== 0 && v !== 10 && v !== 11) {
                        if (v !== VOXEL_ASH) {
                            world.setVoxel(wx, y, wz, VOXEL_ASH);
                        }
                        break;
                    }
                }
            }
        }
        // Spawn ruin marker entity at center
        if (this.router) {
            const cy = world.getHeightAt?.(cx, cz) ?? civ.center.y ?? 30;
            this.router.exec({
                type: "entity:spawnMesh",
                assetId: "civ_ruin",
                kind: "civ_ruin",
                x: cx, y: (cy ?? civ.center.y ?? 30) + 1, z: cz,
                scale: 1.6,
            });
        }
        // Smoke + dust particles erupt from ruin
        if (this.particles?.spawn) {
            for (let n = 0; n < 36; n++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * RUIN_RADIUS;
                this.particles.spawn({
                    x: civ.center.x + Math.cos(a) * r,
                    y: (civ.center.y ?? 30) + Math.random() * 4,
                    z: civ.center.z + Math.sin(a) * r,
                    vy: 1 + Math.random() * 2,
                    ttl: 1.5, size: 0.7,
                    r: 0.35, g: 0.35, b: 0.32, a: 0.7,
                    gravity: 4,
                });
            }
        }
    }

    _scanCivConflicts() {
        const CONFLICT_RANGE   = 35;     // distance for civs to detect each other
        const CIV_VS_CIV_DMG   = 0.005;  // per-tick energy drain (slow — ~20s fights)
        const DAMAGE_VOXEL_R   = 4;      // radius for random voxel chip
        const civs = this.getAll();

        for (let i = 0; i < civs.length; i++) {
            for (let j = i + 1; j < civs.length; j++) {
                const a = civs[i], b = civs[j];
                const dx = a.center.x - b.center.x;
                const dz = a.center.z - b.center.z;
                const distSq = dx * dx + dz * dz;
                const inRange = distSq < CONFLICT_RANGE * CONFLICT_RANGE;
                const pairKey = this._pairKey(a.id, b.id);
                const wasInConflict = this._conflicts.has(pairKey);

                // Edge-trigger: just entered combat range
                if (inRange && !wasInConflict) {
                    this._conflicts.set(pairKey, { aId: a.id, bId: b.id, age: 0 });
                    this._emit("civ_conflict", a, 0.8, { other: b });
                }

                // Sustained combat. Round 34 — personality scales the
                // damage each side takes: attacker's combatDamageMul ×
                // defender's warDrainMul. Militaristic vs peaceful is a
                // ~2.3× swing (1.55 × 1.50 = 2.32×).
                if (inRange && wasInConflict) {
                    const conflict = this._conflicts.get(pairKey);
                    conflict.age++;

                    const aAtk = a.personalityMods?.combatDamageMul ?? 1;
                    const bAtk = b.personalityMods?.combatDamageMul ?? 1;
                    const aDef = a.personalityMods?.warDrainMul    ?? 1;
                    const bDef = b.personalityMods?.warDrainMul    ?? 1;
                    a.energy = Math.max(0, a.energy - CIV_VS_CIV_DMG * bAtk * aDef);
                    b.energy = Math.max(0, b.energy - CIV_VS_CIV_DMG * aAtk * bDef);

                    // Visible destruction — one chip per side, per tick
                    if (this.router) {
                        const r = DAMAGE_VOXEL_R;
                        this.router.exec({
                            type: "voxel:remove",
                            x: Math.floor(a.center.x + (Math.random() * 2 - 1) * r),
                            y: Math.floor(a.center.y),
                            z: Math.floor(a.center.z + (Math.random() * 2 - 1) * r),
                        });
                        this.router.exec({
                            type: "voxel:remove",
                            x: Math.floor(b.center.x + (Math.random() * 2 - 1) * r),
                            y: Math.floor(b.center.y),
                            z: Math.floor(b.center.z + (Math.random() * 2 - 1) * r),
                        });
                    }

                    // Victory check — one below 0.05, the other still up.
                    // Civ_victory fires before the natural civ_death from
                    // the loser, so the cinematic order reads right.
                    if (a.energy < 0.05 && b.energy >= 0.05) {
                        this._emit("civ_victory", b, 1.0, { defeated: a });
                        this._conflicts.delete(pairKey);
                    } else if (b.energy < 0.05 && a.energy >= 0.05) {
                        this._emit("civ_victory", a, 1.0, { defeated: b });
                        this._conflicts.delete(pairKey);
                    }
                }
            }
        }

        // Defensive cleanup — remove conflict entries referencing
        // civs that no longer exist (could happen if a civ dies
        // outside of combat from passive decay during a war).
        for (const [pairKey, c] of this._conflicts) {
            if (!this.civilizations.has(c.aId) || !this.civilizations.has(c.bId)) {
                this._conflicts.delete(pairKey);
            }
        }
    }

    _pairKey(aId, bId) {
        return aId < bId ? `${aId}_${bId}` : `${bId}_${aId}`;
    }

    // Check if a given civ is currently at war with anyone. Used by
    // the civ panel to render the ⚔ war-status indicator.
    getConflictsFor(civId) {
        const out = [];
        for (const c of this._conflicts.values()) {
            if (c.aId === civId) out.push(c.bId);
            else if (c.bId === civId) out.push(c.aId);
        }
        return out;
    }

    _emit(type, civ, intensity, extras = null) {
        if (!this.events) return;
        const evt = {
            type,
            intensity,
            x: civ.center.x, y: civ.center.y, z: civ.center.z,
            civId: civ.id,
            civName: civ.name,         // v3: identity in payload
            civStyle: civ.style,       // v3: architectural style
            civPersonality: civ.personality,  // round 34
        };
        // Round 13 — civ war extras
        if (extras?.other) {
            evt.otherCivId    = extras.other.id;
            evt.otherCivName  = extras.other.name;
            evt.otherCivStyle = extras.other.style;
            evt.otherX = extras.other.center.x;
            evt.otherY = extras.other.center.y;
            evt.otherZ = extras.other.center.z;
        }
        if (extras?.defeated) {
            evt.defeatedCivId    = extras.defeated.id;
            evt.defeatedCivName  = extras.defeated.name;
            evt.defeatedCivStyle = extras.defeated.style;
        }
        // Generic extras fallthrough — any keys not handled above get
        // copied into the event verbatim. Round 25 megaproject events
        // (megaName, megaType, megaX/Y/Z) flow through here.
        if (extras && typeof extras === "object") {
            for (const k of Object.keys(extras)) {
                if (k === "other" || k === "defeated") continue;
                if (!(k in evt)) evt[k] = extras[k];
            }
        }
        this.events.publish(evt);
    }

    _dispatch(action) {
        if (!action || !action.type) return;
        if (this.router) {
            this.router.exec(action);
            return;
        }
        // Fallback (tests / no-router setups).
        if (this.world) {
            if (action.type === "voxel:set") {
                this.world.setVoxel(action.x, action.y, action.z, action.value);
            } else if (action.type === "voxel:remove") {
                this.world.setVoxel(action.x, action.y, action.z, 0);
            }
        }
    }

    // Squared-distance match against existing civ centers. Used to merge
    // overlapping cluster detections into a single entity rather than
    // spawning duplicates every scan.
    _findClosest(cluster) {
        const r2 = MERGE_RADIUS * MERGE_RADIUS;
        let best = null, bestD = Infinity;

        for (const civ of this.civilizations.values()) {
            const dx = (civ.center.x - cluster.x);
            const dz = (civ.center.z - cluster.z);
            const d  = dx * dx + dz * dz;
            if (d < bestD && d < r2) { bestD = d; best = civ; }
        }
        return best;
    }

    // Used by UniverseOptimizer + AwarenessAgent + HUD.
    getAll() {
        return [...this.civilizations.values()];
    }

    size() {
        return this.civilizations.size;
    }
}
