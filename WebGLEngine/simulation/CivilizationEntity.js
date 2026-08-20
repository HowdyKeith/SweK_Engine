// FILE: simulation/CivilizationEntity.js
// VERSION: v3 - STRUCTURE-BUILDING BEHAVIOR
//
// Civs now produce architectural structures rather than random DIRT
// voxels. Each civ has a deterministic style (tower / ring_wall /
// plaza / spire_field / step_pyramid) and emits one
// structureBuilder primitive per build step on a 4-second cooldown
// when stability and intent are high enough.
//
// Action shape uses `v` (matching core/commandRouter.js) instead of
// the older `value` field so actions flow through the router cleanly
// rather than relying on the legacy world.setVoxel fallback.

import { generateCivilizationName } from "../world/civilizationNames.js";
import { pickStyle, nextBuildVoxels } from "./CivilizationArchitecture.js";
import { pickPersonality, getPersonalityMods } from "./civPersonalities.js";

const BUILD_COOLDOWN_S = 4.0;        // min seconds between successive builds
const MIN_BUILD_AGE_S  = 1.0;        // civs need to settle before first build
const MIN_STABILITY    = 0.3;
const MIN_INTENT       = 0.5;

export class CivilizationEntity {

    constructor(id, seedCluster) {
        this.id = id;
        this.name = generateCivilizationName();

        this.center = {
            x: seedCluster.x,
            y: seedCluster.y,
            z: seedCluster.z
        };

        this.radius = 5;
        this.score = seedCluster.score;
        this.stability = seedCluster.stability;
        this.age = 0;

        this.energy = 1.0;
        this.intent = 0.5;
        this.directionBias = { x: 0, y: 0, z: 0 };

        // v3 — architectural identity
        this.style = pickStyle(id);
        this.buildStep = 0;             // index of next primitive to emit
        this._lastBuildTime = -Infinity; // age at last successful build

        // v4 (round 10) — desperation summon flag. Civs can summon a
        // patron kaiju once per lifetime when they cross the energy
        // threshold below 0.15 after age > 30s. Manager edge-triggers
        // the actual summon_kaiju event; this flag prevents re-summon.
        this.hasSummoned = false;

        // Round 27 — tech progression. Research accumulates while
        // civ is alive; manager reads .tech to gate tier-specific
        // behavior (walls/towers/defenders/counter-projectiles).
        this.research = 0;
        this.tech = 0;          // 0 = none, 1=walls, 2=watchtowers, 3=defender, 4=counter
        this._lastFireTime = -Infinity;   // counter-projectile cooldown anchor
        this._lastBoltTime = -Infinity;   // defender bolt cooldown anchor

        // Round 34 — personality archetype. Picked deterministically
        // from id so reload + persistence don't reroll. Mods cached
        // for hot path access (research, combat, summon, mega).
        this.personality = pickPersonality(id);
        this.personalityMods = getPersonalityMods(this.personality);
    }

    // ------------------------------------------------------------
    // UPDATE STATE
    // ------------------------------------------------------------

    tick(delta, memoryField, world) {
        this.age += delta;

        const samples = memoryField.queryNear(
            this.center.x,
            this.center.y,
            this.center.z,
            this.radius
        );

        // Stability — average sample strength, clamped to [0, 1] so
        // it reads as a fraction. (Memory samples can have strength
        // > 1 when reinforced over time; the panel showed >100% before
        // this clamp was added.)
        let strength = 0;
        for (const s of samples) {
            strength += s.strength ?? 1;
        }
        const rawStability = samples.length > 0 ? strength / samples.length : 0;
        this.stability = Math.max(0, Math.min(1, rawStability));

        // Energy dynamics
        this.energy += this.stability * 0.01;
        this.energy -= 0.005;
        this.energy  = Math.max(0, Math.min(1, this.energy));

        // Round 27 — research accumulation. Healthy civs progress
        // through tech tiers in 30s/80s/150s/250s of healthy uptime.
        // Stability multiplier means civs in trouble research slowly.
        // Round 34 — personality scales the rate (tech civs ~1.55×,
        // peaceful ~0.65×).
        const researchMul = this.personalityMods?.researchMul ?? 1;
        this.research += delta * (0.5 + this.stability) * researchMul;

        // Intent (smooth low-pass of energy*stability)
        // Intent (smooth low-pass of energy*stability). Round 34
        // adds a personality intent bonus so expansionist civs push
        // territory faster than peaceful ones.
        const intentBonus = this.personalityMods?.intentBonus ?? 0;
        this.intent = 0.7 * this.intent + 0.3 * (this.energy * this.stability + intentBonus);
        this.intent = Math.max(0, Math.min(1, this.intent));

        // Territory pressure — radius grows / shrinks with intent
        const expansionForce = (this.intent - 0.4) * 0.5;
        this.radius += expansionForce;
        this.radius  = Math.max(2, Math.min(40, this.radius));

        // Slow drift (currently no civ has nonzero directionBias, but
        // the migration hook is here for future work).
        this.center.x += this.directionBias.x * 0.01;
        this.center.z += this.directionBias.z * 0.01;

        return this._act(world);
    }

    // ------------------------------------------------------------
    // ACTIONS — STRUCTURE BUILDS + DECAY
    // ------------------------------------------------------------

    _act(world) {
        const actions = [];

        if (this._shouldBuild()) {
            const terrainY = this._terrainTopY(world);
            const voxels = nextBuildVoxels(this, terrainY);
            if (voxels.length > 0) {
                for (const v of voxels) {
                    actions.push({
                        type: "voxel:set",
                        x: v.x, y: v.y, z: v.z,
                        v: v.v,            // router-compatible field name
                    });
                }
                this.buildStep++;
                this._lastBuildTime = this.age;
            }
        }

        // Decay — when energy is critically low, chip a random voxel
        // in the civ's footprint. Centered random offset (the v2 code
        // had a stale bug that always biased to +X +Z; now properly
        // centered around civ.center).
        if (this.energy < 0.2) {
            const r = this.radius;
            const x = Math.floor(this.center.x + (Math.random() * 2 - 1) * r);
            const y = Math.floor(this.center.y);
            const z = Math.floor(this.center.z + (Math.random() * 2 - 1) * r);
            actions.push({
                type: "voxel:remove",
                x, y, z,
            });
        }

        return actions;
    }

    _shouldBuild() {
        return (
            this.age > MIN_BUILD_AGE_S &&
            this.stability > MIN_STABILITY &&
            this.intent > MIN_INTENT &&
            (this.age - this._lastBuildTime) > BUILD_COOLDOWN_S
        );
    }

    // Scan from y=60 downward for the first non-air voxel — that's
    // the terrain top. Cheap (≤60 voxel queries per build event,
    // which fires at most every 4 seconds per civ).
    _terrainTopY(world) {
        if (!world?.voxelAt && !world?.getVoxel) {
            return Math.max(1, Math.floor(this.center.y));
        }
        const get = world.voxelAt
            ? (x, y, z) => world.voxelAt(x, y, z)
            : (x, y, z) => world.getVoxel(x, y, z);
        const x = Math.floor(this.center.x);
        const z = Math.floor(this.center.z);
        for (let y = 60; y >= 0; y--) {
            if (get(x, y, z) !== 0) return y + 1;
        }
        return 1;
    }

    isAlive() {
        return this.energy > 0.05;
    }
}
