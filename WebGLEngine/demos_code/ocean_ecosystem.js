// demos_code/ocean_ecosystem.js — open-water ecosystem over real terrain
// VERSION: v2 — emergent fish/octopus population (see simulation/OceanPopulation.mjs)
//
// This is the IDIOMATIC, working distillation of the standalone
// underwater code. The original used self-rendering WebGL classes that
// owned their own GL programs/VAOs and called waterSystem.getCurrentWaterLevel()
// (a method that never existed). Here every creature is a spawned engine
// KIND driven by ctx.router.exec, every particle goes through the real
// window.gpuParticles system, and the water surface comes from the now-live
// window.waterField. The behaviors are what survived the teardown:
//
//   • Stingrays   — bottom gliders: hug the seabed via ctx.getSurfaceY,
//                   slow heading changes, gentle banking roll. (fixed count)
//   • Sea turtles — cruise <-> surface FSM: periodically rise to the
//                   water surface (window.waterField) to "breathe", hold,
//                   then dive back to mid-water. (fixed count)
//   • Fish school — POPULATION EMERGES from per-fish energy budgets, not a
//                   spawn count. simulation/OceanPopulation.mjs runs a
//                   headless sim (food-grid grazing, metabolism, movement
//                   cost, reproduction, death) and this file just reconciles
//                   spawned meshes against whichever agent ids are alive
//                   each tick — birth spawns a mesh, death despawns one,
//                   survivors get moved to the agent's x/z. NUM_FISH below
//                   is the STARTING population, not a cap.
//   • Octopus     — same emergent-population treatment: octopus hunt fish
//                   in the population sim (a real catch chance within a
//                   catch radius, not guaranteed), gain energy from a catch,
//                   pay a slow metabolism, starve if they go too long
//                   without eating, and reproduce on a much longer
//                   timescale than fish. A catch fires the same ink-cloud
//                   particle burst this file always had — it now marks a
//                   real kill instead of a cosmetic near-miss deterrent.
//                   Simplification made here on purpose: the old
//                   "threat radius -> idle ink deterrence" near-miss
//                   behavior is gone; every ink burst now comes from an
//                   actual catch, which is the sim's own source of truth
//                   for predation. Idle ink wisps (ambient, not
//                   predation-linked) are unchanged.
//   • Plankton    — drifting bioluminescent GPU particles, night-boosted.
//   • Bubble vents — fixed seabed points emitting rising bubble columns.
//
// PARKED (see OCEAN_TEARDOWN.md): SDF/L-system/metaball coral geometry,
// GPU-transform-feedback soft-body tentacles beyond what octopus arms
// already do, shark sonar/thermal/pack sensing, per-instance camouflage +
// procedural shell textures beyond the existing camo/flash tint. Those
// need real geometry/material work the engine doesn't expose to a demo.
//
// Headless/deterministic: simulation/OceanPopulation.mjs has no GL/ctx
// dependency and no Date.now()/Math.random() of its own — see
// tools/ship/oceanPopulation-selfcheck.mjs for the population curves this
// produces, checked by a gate instead of eyeballed in the browser.

import { CORAL_KINDS } from "../gpu/coralReef.js";
import { SEA_RAY, SEA_TURTLE, SEA_OCTOPUS_MANTLE, TENTACLE_SEG, SEA_KELP } from "../gpu/seaCreatures.js";
import { createTentacle, stepTentacle } from "../simulation/verletTentacle.js";
import { OceanPopulation } from "../simulation/OceanPopulation.mjs";

const FISH_KIND    = "wad_pickup_bullet_pen";  // elongated → reads fishy
const RAY_KIND     = SEA_RAY;                  // v547 — real flat-diamond stingray voxel mesh
const TURTLE_KIND  = SEA_TURTLE;               // v547 — real domed shell + flippers + head
const OCTOPUS_KIND = SEA_OCTOPUS_MANTLE;       // v548 — mantle only; arms are Verlet chains
const KELP_KIND    = SEA_KELP;                 // v547 — tall swaying kelp (tilt wobble in tick)

const AREA_R   = 50;          // play radius around origin (inside WaterField patch + gridRadius)
const DEPTH_MARGIN_FLOOR = 2; // creatures stay this far above the seabed
const DEPTH_MARGIN_SURF  = 2; // ...and this far below the water surface

// v548 — octopus Verlet arms
const OCTO_ARMS = 8, OCTO_ARM_NODES = 5, OCTO_REST = 1.1, OCTO_MANTLE_R = 1.5;

const NUM_CORAL   = 18;
const NUM_KELP    = 14;   // v547 — swaying kelp clumps on the seabed

const NUM_FISH    = 24;   // STARTING population fed into OceanPopulation, not a cap
const NUM_RAYS    = 3;
const NUM_TURTLES = 2;
const NUM_OCTOPUS = 2;    // STARTING population fed into OceanPopulation, not a cap

// Sea turtle FSM
const TURTLE_SPEED      = 3.0;
const TURTLE_SURFACE_EVERY = 24.0;   // seconds between breaths
const TURTLE_HOLD       = 3.0;       // seconds held at the surface

// Octopus ink / camouflage. v549 — camouflage via the entity:tint hook. Idle = blended to the
// seabed; a catch startles it to a pale alarm flash, then it re-blends.
const OCTO_CAMO_COLOR = [0.50, 0.46, 0.36];   // sandy seabed
const OCTO_CAMO_MIX   = 0.62;
const OCTO_FLASH_COLOR = [0.90, 0.93, 1.0];   // pale startle
const OCTO_FLASH_MIX  = 0.85;
const OCTO_FLASH_TIME = 1.0;
const INK_LIFE_S      = 4.0;   // ink particle burst lifetime

function tintOctopus(ctx, rec, color, mix) {
    ctx.router?.exec?.({ type: "entity:tint", id: rec.meshId, color, mix });
    for (const arm of rec.arms) for (const sid of arm.segIds)
        if (sid != null) ctx.router?.exec?.({ type: "entity:tint", id: sid, color, mix });
}

let population = null;        // OceanPopulation — source of truth for fish/octopus counts
let fishMeshes = new Map();   // agent id -> { meshId, yaw, depthPhase }
let octoMeshes = new Map();   // agent id -> { meshId, arms, sway, wisp, flashT, tintState }

let rays = [];
let turtles = [];
let coral = [];
let kelp = [];
let vents = [];
let t = 0;

function rnd(ctx, min, max) { return min + ctx.rand() * (max - min); }

function gpu() {
    return (typeof window !== "undefined" && window.gpuParticles?.isSupported?.())
        ? window.gpuParticles : null;
}
function surfaceY(ctx, x, z) {
    try { const y = ctx.getSurfaceY?.(x, z); if (typeof y === "number") return y; } catch {}
    return 4;  // conservative fallback floor
}
function waterTop() {
    try {
        const w = (typeof window !== "undefined") ? window.waterField : null;
        const y = w?.getCurrentWaterLevel?.();
        if (typeof y === "number") return y;
    } catch {}
    return 9;  // matches baked WaterField baseLevel
}
function nightFactor() {
    const time = typeof window !== "undefined" ? window.time : null;
    if (time?.getDarkness) return time.getDarkness();
    return 0.3;
}

// ---- fish/octopus mesh spawners, shared by start() (initial population) and tick() (births) ----
function spawnFishMesh(ctx, top, agent) {
    const floor = surfaceY(ctx, agent.x, agent.z);
    const y = Math.min(top - DEPTH_MARGIN_SURF, floor + 6 + ctx.rand() * 8);
    const id = ctx.spawnMesh(FISH_KIND, agent.x, y, agent.z, 0.5);
    if (id == null) return null;
    return { meshId: id, yaw: 0, depthPhase: ctx.rand() * Math.PI * 2 };
}

function spawnOctoMesh(ctx, agent) {
    const y = surfaceY(ctx, agent.x, agent.z) + 1.2;
    const id = ctx.spawnMesh(OCTOPUS_KIND, agent.x, y, agent.z, 0.5);
    if (id == null) return null;
    const rec = { meshId: id, arms: [], sway: ctx.rand() * Math.PI * 2, wisp: 0,
                  flashT: 0, tintState: "camo" };
    // 8 Verlet arms, each a chain of tapering tentacle_seg voxels.
    for (let a = 0; a < OCTO_ARMS; a++) {
        const ang = (a / OCTO_ARMS) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
        const arm = createTentacle(agent.x + dx * OCTO_MANTLE_R, y, agent.z + dz * OCTO_MANTLE_R, dx, dz, OCTO_ARM_NODES, OCTO_REST);
        arm.ang = ang; arm.segIds = [];
        for (let n = 1; n < OCTO_ARM_NODES; n++) {
            const sc = Math.max(0.18, 0.42 - (n - 1) * 0.06);   // taper toward the tip
            const nd = arm.nodes[n];
            arm.segIds.push(ctx.spawnMesh(TENTACLE_SEG, nd.x, nd.y, nd.z, sc));
        }
        rec.arms.push(arm);
    }
    tintOctopus(ctx, rec, OCTO_CAMO_COLOR, OCTO_CAMO_MIX);   // spawn blended into the seabed
    return rec;
}

export default {
    id:    "ocean_ecosystem",
    label: "OCEAN ECOSYSTEM (open water)",
    hint:  "Fish and octopus populations EMERGE from per-agent energy budgets; stingrays glide the seabed, turtles surface to breathe; plankton + bubble vents",
    controls: [
        "Auto — open-water scene over the real terrain, between seabed and the live water surface",
        "Population EMERGES from per-fish/per-octopus energy budgets — starts at " + NUM_FISH +
            " fish / " + NUM_OCTOPUS + " octopus · " + NUM_RAYS + " stingrays · " + NUM_TURTLES + " sea turtles (fixed)",
        "Octopus really hunt: a catch removes the fish, feeds the octopus, and inks the water; well-fed fish/octopus reproduce, starved ones die",
        "Try time.set('night') — plankton glow brightens in the dark",
    ],

    start(ctx) {
        t = 0;
        fishMeshes = new Map(); octoMeshes = new Map();
        rays = []; turtles = []; coral = []; kelp = []; vents = [];

        const top = waterTop();

        // ---- Emergent fish/octopus population ----
        population = new OceanPopulation({ areaR: AREA_R, rng: ctx.rand, initFish: NUM_FISH, initOctopus: NUM_OCTOPUS });
        for (const agent of population.fishList()) {
            const rec = spawnFishMesh(ctx, top, agent);
            if (rec) fishMeshes.set(agent.id, rec);
        }
        for (const agent of population.octopusList()) {
            const rec = spawnOctoMesh(ctx, agent);
            if (rec) octoMeshes.set(agent.id, rec);
        }

        // ---- Stingrays (seabed gliders) ----
        for (let i = 0; i < NUM_RAYS; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = rnd(ctx, 10, AREA_R * 0.8);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const id = ctx.spawnMesh(RAY_KIND, x, surfaceY(ctx, x, z) + 2, z, 0.5);
            if (id == null) continue;
            rays.push({ id, x, z, heading: ctx.rand() * Math.PI * 2,
                turnT: rnd(ctx, 2, 6), bob: ctx.rand() * Math.PI * 2,
                speed: rnd(ctx, 2.5, 4.0) });
        }

        // ---- Sea turtles (cruise <-> surface FSM) ----
        for (let i = 0; i < NUM_TURTLES; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = rnd(ctx, 8, AREA_R * 0.6);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const floor = surfaceY(ctx, x, z);
            const y = floor + 6;
            const id = ctx.spawnMesh(TURTLE_KIND, x, y, z, 0.5);
            if (id == null) continue;
            turtles.push({ id, x, y, z, heading: ctx.rand() * Math.PI * 2,
                state: "cruise", stateT: 0,
                breatheAt: rnd(ctx, 8, TURTLE_SURFACE_EVERY),
                cruiseY: y, turnT: rnd(ctx, 3, 7) });
        }

        // ---- Coral reef (static voxel kinds scattered on the seabed) ----
        if (CORAL_KINDS && CORAL_KINDS.length) {
            for (let i = 0; i < NUM_CORAL; i++) {
                const a = ctx.rand() * Math.PI * 2;
                const r = rnd(ctx, 4, AREA_R * 0.95);
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const kind = CORAL_KINDS[(ctx.rand() * CORAL_KINDS.length) | 0];
                const scale = rnd(ctx, 0.6, 1.4);
                const y = surfaceY(ctx, x, z) + 2 * scale;   // approx: base near the floor
                const id = ctx.spawnMesh(kind, x, y, z, scale);
                if (id == null) continue;
                // one-shot yaw so the reef isn't axis-aligned (coral is static after)
                ctx.router?.exec?.({ type: "entity:move", id, x, y, z, yaw: ctx.rand() * Math.PI * 2 });
                coral.push(id);
            }
        }

        // ---- Kelp forest (tall voxel clumps, base on the seabed) ----
        for (let i = 0; i < NUM_KELP; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = rnd(ctx, 5, AREA_R * 0.95);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const scale = rnd(ctx, 0.35, 0.6);
            const y = surfaceY(ctx, x, z);                // base sits on the floor
            const id = ctx.spawnMesh(KELP_KIND, x, y, z, scale);
            if (id == null) continue;
            kelp.push({ id, x, y, z,
                yaw: ctx.rand() * Math.PI * 2,            // fixed facing
                phase: ctx.rand() * Math.PI * 2,          // sway offset
                swayAmp: rnd(ctx, 0.12, 0.26),            // tilt radians
                swayHz: rnd(ctx, 0.18, 0.34) });
        }

        // ---- Bubble vents (fixed seabed points) ----
        for (let i = 0; i < 4; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = rnd(ctx, 6, AREA_R * 0.9);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            vents.push({ x, z, y: surfaceY(ctx, x, z) + 0.5,
                rate: rnd(ctx, 4, 9), carry: 0 });
        }

        try { ctx.lookAt?.(0, waterTop() - 6, 0); } catch {}
        const pc = population.counts();
        ctx.kpop?.info?.("Ocean ecosystem",
            pc.fish + " fish (emergent) · " + pc.octopus + " octopus (emergent) · " + rays.length + " rays · " + turtles.length + " turtles · " + coral.length + " coral");
        console.log("[ocean_ecosystem v2] started — " + pc.fish + " fish, " +
            pc.octopus + " octopus (both emergent from OceanPopulation), " + rays.length + " rays, " + turtles.length + " turtles, " +
            coral.length + " coral, " + vents.length + " vents; surface=" + waterTop());
    },

    tick(ctx, dt) {
        if (dt > 0.1) dt = 0.1;
        t += dt;
        const G = gpu();
        const top = waterTop();
        const night = nightFactor();

        // ---- Advance the population sim one tick; reconcile meshes against it below ----
        const events = population.update(dt);

        // ---- Fish: birth spawns a mesh, death despawns one, survivors get moved ----
        const liveFish = population.fishList();
        const liveFishIds = new Set();
        for (const agent of liveFish) {
            liveFishIds.add(agent.id);
            let rec = fishMeshes.get(agent.id);
            if (!rec) {
                rec = spawnFishMesh(ctx, top, agent);
                if (!rec) continue;
                fishMeshes.set(agent.id, rec);
            }
            const floor = surfaceY(ctx, agent.x, agent.z);
            const yLo = floor + DEPTH_MARGIN_FLOOR, yHi = top - DEPTH_MARGIN_SURF;
            const y = Math.min(yHi, Math.max(yLo, floor + 6 + Math.sin(t * 0.4 + rec.depthPhase) * 3));
            if (Math.abs(agent.vx) > 0.01 || Math.abs(agent.vz) > 0.01) rec.yaw = Math.atan2(agent.vx, agent.vz);
            ctx.router?.exec?.({ type: "entity:move", id: rec.meshId, x: agent.x, y, z: agent.z, yaw: rec.yaw });
        }
        for (const [id, rec] of fishMeshes) {
            if (!liveFishIds.has(id)) { ctx.despawnEntity?.(rec.meshId); fishMeshes.delete(id); }
        }

        // ---- Octopus: same birth/death reconciliation, plus arms + camo tint + idle wisp ----
        const liveOcto = population.octopusList();
        const liveOctoIds = new Set();
        for (const agent of liveOcto) {
            liveOctoIds.add(agent.id);
            let rec = octoMeshes.get(agent.id);
            if (!rec) {
                rec = spawnOctoMesh(ctx, agent);
                if (!rec) continue;
                octoMeshes.set(agent.id, rec);
            }
            rec.sway += dt;
            rec.flashT = Math.max(0, rec.flashT - dt);
            if (rec.flashT > 0 && rec.tintState !== "flash") { tintOctopus(ctx, rec, OCTO_FLASH_COLOR, OCTO_FLASH_MIX); rec.tintState = "flash"; }
            else if (rec.flashT <= 0 && rec.tintState !== "camo") { tintOctopus(ctx, rec, OCTO_CAMO_COLOR, OCTO_CAMO_MIX); rec.tintState = "camo"; }

            const floorY = surfaceY(ctx, agent.x, agent.z);
            const y = floorY + 1.2;
            ctx.router?.exec?.({ type: "entity:move", id: rec.meshId, x: agent.x, y, z: agent.z,
                yaw: Math.sin(rec.sway * 0.5) * 0.3 });

            // idle ink wisp (ambient, not tied to predation)
            if (G) {
                rec.wisp += dt * 1.5;
                while (rec.wisp >= 1) {
                    rec.wisp -= 1;
                    G.spawn({ x: agent.x + rnd(ctx, -0.6, 0.6), y: y + 0.5, z: agent.z + rnd(ctx, -0.6, 0.6),
                        vx: rnd(ctx, -0.2, 0.2), vy: rnd(ctx, 0.2, 0.5), vz: rnd(ctx, -0.2, 0.2),
                        life: 1.4, size: 0.4, r: 0.12, g: 0.10, b: 0.18, shape: 0 });
                }
            }

            // ---- Verlet arms: wave with the current, droop, rest on the seabed ----
            const env = { gravity: 1.6, damping: 0.86, iters: 3, floorY: floorY + 0.2,
                swayX: Math.sin(t * 0.7 + rec.sway) * 0.7, swayZ: Math.cos(t * 0.55 + rec.sway) * 0.7 };
            for (const arm of rec.arms) {
                const ax = agent.x + Math.cos(arm.ang) * OCTO_MANTLE_R;
                const az = agent.z + Math.sin(arm.ang) * OCTO_MANTLE_R;
                stepTentacle(arm, { x: ax, y, z: az }, dt, env);
                for (let n = 1; n < arm.nodes.length; n++) {
                    const sid = arm.segIds[n - 1]; if (sid == null) continue;
                    const nd = arm.nodes[n];
                    ctx.router?.exec?.({ type: "entity:move", id: sid, x: nd.x, y: nd.y, z: nd.z });
                }
            }
        }
        for (const [id, rec] of octoMeshes) {
            if (!liveOctoIds.has(id)) {
                ctx.despawnEntity?.(rec.meshId);
                for (const arm of rec.arms) for (const sid of arm.segIds) ctx.despawnEntity?.(sid);
                octoMeshes.delete(id);
            }
        }

        // ---- A catch is a real kill: fire the same ink-cloud burst this file always had ----
        for (const e of events) {
            if (e.type !== "catch") continue;
            const oy = surfaceY(ctx, e.x, e.z) + 1.2 + 1.0;
            const rec = octoMeshes.get(e.octopusId);
            if (rec) rec.flashT = OCTO_FLASH_TIME;   // v549 — startle flash, then re-camouflage
            if (G) {
                for (let i = 0; i < 40; i++) {
                    const a = ctx.rand() * Math.PI * 2;
                    const sp = ctx.rand() * 2.5;
                    G.spawn({ x: e.x, y: oy, z: e.z,
                        vx: Math.cos(a) * sp, vy: rnd(ctx, 0, 1.2), vz: Math.sin(a) * sp,
                        life: INK_LIFE_S * 0.8, size: 0.6 + ctx.rand() * 0.8,
                        r: 0.05, g: 0.06, b: 0.09, shape: 0 });
                }
            }
            console.log("[ocean_ecosystem] octopus " + e.octopusId + " caught fish " + e.fishId);
        }

        // ---- Stingrays ----
        for (const r of rays) {
            r.turnT -= dt;
            if (r.turnT <= 0) { r.heading += rnd(ctx, -0.9, 0.9); r.turnT = rnd(ctx, 2, 6); }
            // steer back toward center if drifting out of bounds
            const dc = Math.hypot(r.x, r.z);
            if (dc > AREA_R) r.heading = Math.atan2(-r.z, -r.x);
            r.x += Math.cos(r.heading) * r.speed * dt;
            r.z += Math.sin(r.heading) * r.speed * dt;
            r.bob += dt * 2.2;
            const y = surfaceY(ctx, r.x, r.z) + 2 + Math.sin(r.bob) * 0.5;
            const roll = Math.sin(r.bob) * 0.25;   // gentle banking via yaw wobble
            ctx.router?.exec?.({ type: "entity:move", id: r.id, x: r.x, y, z: r.z, yaw: r.heading + roll });
        }

        // ---- Sea turtles ----
        for (const u of turtles) {
            u.stateT += dt;
            u.turnT -= dt;
            if (u.turnT <= 0) { u.heading += rnd(ctx, -0.7, 0.7); u.turnT = rnd(ctx, 3, 7); }
            const dc = Math.hypot(u.x, u.z);
            if (dc > AREA_R) u.heading = Math.atan2(-u.z, -u.x);

            u.x += Math.cos(u.heading) * TURTLE_SPEED * dt;
            u.z += Math.sin(u.heading) * TURTLE_SPEED * dt;
            const floor = surfaceY(ctx, u.x, u.z);

            if (u.state === "cruise") {
                const targetY = Math.max(floor + 4, Math.min(u.cruiseY, top - 4));
                u.y += (targetY - u.y) * 1.5 * dt;
                if (u.stateT >= u.breatheAt) { u.state = "surface"; u.stateT = 0; }
            } else if (u.state === "surface") {
                const targetY = top - DEPTH_MARGIN_SURF;
                u.y += (targetY - u.y) * 1.2 * dt;
                if (u.y >= targetY - 0.4 && u.stateT >= TURTLE_HOLD) {
                    u.state = "cruise"; u.stateT = 0;
                    u.breatheAt = rnd(ctx, TURTLE_SURFACE_EVERY * 0.7, TURTLE_SURFACE_EVERY * 1.3);
                    u.cruiseY = floor + rnd(ctx, 5, 10);
                }
            }
            ctx.router?.exec?.({ type: "entity:move", id: u.id, x: u.x, y: u.y, z: u.z, yaw: u.heading });
        }

        // ---- Kelp sway (gentle tilt wobble; two-axis so it bends, not spins) ----
        for (const k of kelp) {
            const a = t * k.swayHz * Math.PI * 2 + k.phase;
            const tiltX = Math.sin(a) * k.swayAmp;
            const tiltZ = Math.cos(a * 0.8) * k.swayAmp * 0.6;
            ctx.router?.exec?.({ type: "entity:move", id: k.id, x: k.x, y: k.y, z: k.z, yaw: k.yaw, tiltX, tiltZ });
        }

        // ---- Bubble vents ----
            for (const v of vents) {
                v.carry += dt * v.rate;
                while (v.carry >= 1) {
                    v.carry -= 1;
                    G.spawn({ x: v.x + rnd(ctx, -0.4, 0.4), y: v.y, z: v.z + rnd(ctx, -0.4, 0.4),
                        vx: rnd(ctx, -0.3, 0.3), vy: 2.5 + ctx.rand() * 1.5, vz: rnd(ctx, -0.3, 0.3),
                        life: Math.max(0.6, (top - v.y) / 3), size: 0.18 + ctx.rand() * 0.18,
                        r: 0.8, g: 0.92, b: 1.0, shape: 0 });
                }
            }
            // ---- Bioluminescent plankton drift (night-boosted) ----
            const planktonBudget = Math.round(4 + 8 * night);
            for (let i = 0; i < planktonBudget; i++) {
                const a = ctx.rand() * Math.PI * 2;
                const r = ctx.rand() * AREA_R;
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                const floor = surfaceY(ctx, x, z);
                const y = floor + ctx.rand() * Math.max(2, (top - floor) - 1);
                G.spawn({ x, y, z, vx: rnd(ctx, -0.1, 0.1), vy: rnd(ctx, -0.05, 0.15), vz: rnd(ctx, -0.1, 0.1),
                    life: 1.2 + ctx.rand() * 0.8, size: 0.12 + ctx.rand() * 0.1,
                    r: 0.35 + 0.2*night, g: 0.8, b: 1.0, shape: 2 });
            }
    },

    stop(ctx) {
        for (const [, rec] of fishMeshes) ctx.despawnEntity?.(rec.meshId);
        for (const r of rays) ctx.despawnEntity?.(r.id);
        for (const u of turtles) ctx.despawnEntity?.(u.id);
        for (const [, rec] of octoMeshes) {
            ctx.despawnEntity?.(rec.meshId);
            for (const arm of rec.arms) for (const sid of arm.segIds) ctx.despawnEntity?.(sid);
        }
        for (const id of coral) ctx.despawnEntity?.(id);
        for (const k of kelp) ctx.despawnEntity?.(k.id);
        fishMeshes = new Map(); octoMeshes = new Map();
        rays = []; turtles = []; coral = []; kelp = []; vents = [];
        population = null;
        console.log("[ocean_ecosystem] stopped");
    },
};
