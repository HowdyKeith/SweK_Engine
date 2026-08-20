// demos_code/ocean_ecosystem.js — open-water ecosystem over real terrain
// VERSION: v1 — harvested from the "ocean systems" build session
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
//                   slow heading changes, gentle banking roll.
//   • Sea turtles — cruise <-> surface FSM: periodically rise to the
//                   water surface (window.waterField) to "breathe", hold,
//                   then dive back to mid-water.
//   • Octopus     — denned on the floor; ink-cloud particle burst when a
//                   fish strays into its threat radius (+ idle ink wisps).
//   • Fish school — trimmed Reynolds boids (sep/ali/coh + soft homing),
//                   flee from active ink clouds. Gives the scene life and
//                   something for the octopus to react to.
//   • Plankton    — drifting bioluminescent GPU particles, night-boosted.
//   • Bubble vents — fixed seabed points emitting rising bubble columns.
//
// PARKED (see OCEAN_TEARDOWN.md): SDF/L-system/metaball coral geometry,
// GPU-transform-feedback soft-body tentacles, shark sonar/thermal/pack
// sensing, per-instance camouflage + procedural shell textures. Those
// need real geometry/material work the engine doesn't expose to a demo.

const AREA_R   = 50;          // play radius around origin (inside WaterField patch + gridRadius)
const DEPTH_MARGIN_FLOOR = 2; // creatures stay this far above the seabed
const DEPTH_MARGIN_SURF  = 2; // ...and this far below the water surface

// Existing always-available base kinds reused as approximations (the same
// pragmatic move the aquarium makes — its "jelly" is wad_pickup_o2). The
// rigged_* kinds are lazy (only registered via window.rig.*), so we use the
// base kinds the aquarium proves are spawnable. Bespoke ray/turtle/octopus
// meshes are a parked follow-up. Coral kinds ARE registered at engine init
// (gpu/coralReef.js) so they spawn reliably here.
import { CORAL_KINDS } from "../gpu/coralReef.js";
import { SEA_RAY, SEA_TURTLE, SEA_OCTOPUS_MANTLE, TENTACLE_SEG, SEA_KELP } from "../gpu/seaCreatures.js";
import { createTentacle, stepTentacle } from "../simulation/verletTentacle.js";

const FISH_KIND    = "wad_pickup_bullet_pen";  // elongated → reads fishy
const RAY_KIND     = SEA_RAY;                  // v547 — real flat-diamond stingray voxel mesh
const TURTLE_KIND  = SEA_TURTLE;               // v547 — real domed shell + flippers + head
const OCTOPUS_KIND = SEA_OCTOPUS_MANTLE;       // v548 — mantle only; arms are Verlet chains
const KELP_KIND    = SEA_KELP;                 // v547 — tall swaying kelp (tilt wobble in tick)

// v548 — octopus Verlet arms
const OCTO_ARMS = 8, OCTO_ARM_NODES = 5, OCTO_REST = 1.1, OCTO_MANTLE_R = 1.5;

const NUM_CORAL   = 18;
const NUM_KELP    = 14;   // v547 — swaying kelp clumps on the seabed

const NUM_FISH    = 24;
const NUM_RAYS    = 3;
const NUM_TURTLES = 2;
const NUM_OCTOPUS = 2;

// Fish boids
const FISH_MAX_SPEED = 5.5;
const FISH_MAX_FORCE = 0.35;
const VISION    = 8,  VISION_SQ = VISION * VISION;
const SEP       = 2.5, SEP_SQ   = SEP * SEP;
const W_SEP = 2.4, W_ALI = 1.0, W_COH = 0.7, W_HOME = 0.5, W_INK_FLEE = 5.0;

// Sea turtle FSM
const TURTLE_SPEED      = 3.0;
const TURTLE_SURFACE_EVERY = 24.0;   // seconds between breaths
const TURTLE_HOLD       = 3.0;       // seconds held at the surface

// Octopus ink
const OCTO_THREAT_R    = 9,  OCTO_THREAT_R_SQ = OCTO_THREAT_R * OCTO_THREAT_R;
const OCTO_INK_COOLDOWN = 5.0;
// v549 — camouflage via the entity:tint hook. Idle = blended to the seabed;
// inking startles it to a pale alarm flash, then it re-blends.
const OCTO_CAMO_COLOR = [0.50, 0.46, 0.36];   // sandy seabed
const OCTO_CAMO_MIX   = 0.62;
const OCTO_FLASH_COLOR = [0.90, 0.93, 1.0];   // pale startle
const OCTO_FLASH_MIX  = 0.85;
const OCTO_FLASH_TIME = 1.0;
function tintOctopus(ctx, o, color, mix) {
    ctx.router?.exec?.({ type: "entity:tint", id: o.id, color, mix });
    for (const arm of o.arms) for (const sid of arm.segIds)
        if (sid != null) ctx.router?.exec?.({ type: "entity:tint", id: sid, color, mix });
}
const INK_LIFE_S        = 4.0;       // how long an ink cloud repels fish

let fish = [];
let rays = [];
let turtles = [];
let octopi = [];
let coral = [];
let kelp = [];
let vents = [];
let inkClouds = [];          // { x,y,z, age } active repellers
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

export default {
    id:    "ocean_ecosystem",
    label: "OCEAN ECOSYSTEM (open water)",
    hint:  "Stingrays glide the seabed, turtles surface to breathe, an octopus inks at passing fish; plankton + bubble vents",
    controls: [
        "Auto — open-water scene over the real terrain, between seabed and the live water surface",
        NUM_FISH + " schooling fish · " + NUM_RAYS + " stingrays · " + NUM_TURTLES + " sea turtles · " + NUM_OCTOPUS + " octopus",
        "Octopus inks when fish stray too close; fish flee the ink cloud",
        "Try time.set('night') — plankton glow brightens in the dark",
    ],

    start(ctx) {
        t = 0;
        fish = []; rays = []; turtles = []; octopi = []; coral = []; vents = []; inkClouds = [];

        const top = waterTop();

        // ---- Fish school ----
        for (let i = 0; i < NUM_FISH; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = ctx.rand() * AREA_R * 0.5;
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const floor = surfaceY(ctx, x, z);
            const y = Math.min(top - DEPTH_MARGIN_SURF, floor + 6 + ctx.rand() * 8);
            const id = ctx.spawnMesh(FISH_KIND, x, y, z, 0.5);
            if (id == null) continue;
            fish.push({ id, x, y, z,
                vx: rnd(ctx, -1, 1), vy: rnd(ctx, -0.4, 0.4), vz: rnd(ctx, -1, 1),
                ax: 0, ay: 0, az: 0, yaw: 0 });
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

        // ---- Octopus dens ----
        for (let i = 0; i < NUM_OCTOPUS; i++) {
            const a = ctx.rand() * Math.PI * 2;
            const r = rnd(ctx, 12, AREA_R * 0.7);
            const x = Math.cos(a) * r, z = Math.sin(a) * r;
            const y = surfaceY(ctx, x, z) + 1.2;
            const id = ctx.spawnMesh(OCTOPUS_KIND, x, y, z, 0.5);
            if (id == null) continue;
            const floorY = surfaceY(ctx, x, z);
            const oct = { id, x, y, z, sway: ctx.rand() * Math.PI * 2,
                inkCooldown: rnd(ctx, 0, OCTO_INK_COOLDOWN), wisp: 0, floorY, arms: [] };
            // 8 Verlet arms, each a chain of tapering tentacle_seg voxels.
            for (let a = 0; a < OCTO_ARMS; a++) {
                const ang = (a / OCTO_ARMS) * Math.PI * 2, dx = Math.cos(ang), dz = Math.sin(ang);
                const arm = createTentacle(x + dx * OCTO_MANTLE_R, y, z + dz * OCTO_MANTLE_R, dx, dz, OCTO_ARM_NODES, OCTO_REST);
                arm.ang = ang; arm.segIds = [];
                for (let n = 1; n < OCTO_ARM_NODES; n++) {
                    const sc = Math.max(0.18, 0.42 - (n - 1) * 0.06);   // taper toward the tip
                    const nd = arm.nodes[n];
                    arm.segIds.push(ctx.spawnMesh(TENTACLE_SEG, nd.x, nd.y, nd.z, sc));
                }
                oct.arms.push(arm);
            }
            oct.flashT = 0; oct.tintState = "camo";
            tintOctopus(ctx, oct, OCTO_CAMO_COLOR, OCTO_CAMO_MIX);   // spawn blended into the seabed
            octopi.push(oct);
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
        ctx.kpop?.info?.("Ocean ecosystem",
            fish.length + " fish · " + rays.length + " rays · " + turtles.length + " turtles · " + octopi.length + " octopus · " + coral.length + " coral");
        console.log("[ocean_ecosystem v1] started — " + fish.length + " fish, " +
            rays.length + " rays, " + turtles.length + " turtles, " + octopi.length + " octopus, " +
            coral.length + " coral, " + vents.length + " vents; surface=" + waterTop());
    },

    tick(ctx, dt) {
        if (dt > 0.1) dt = 0.1;
        t += dt;
        const G = gpu();
        const top = waterTop();
        const night = nightFactor();

        // ---- Age out ink clouds ----
        for (let i = inkClouds.length - 1; i >= 0; i--) {
            inkClouds[i].age += dt;
            if (inkClouds[i].age > INK_LIFE_S) inkClouds.splice(i, 1);
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

        // ---- Octopus (idle sway + ink defense) ----
        for (const o of octopi) {
            o.sway += dt;
            o.inkCooldown -= dt;
            // v549 — camouflage state: flash pale briefly after inking, else stay blended.
            o.flashT = Math.max(0, (o.flashT || 0) - dt);
            if (o.flashT > 0 && o.tintState !== "flash") { tintOctopus(ctx, o, OCTO_FLASH_COLOR, OCTO_FLASH_MIX); o.tintState = "flash"; }
            else if (o.flashT <= 0 && o.tintState !== "camo") { tintOctopus(ctx, o, OCTO_CAMO_COLOR, OCTO_CAMO_MIX); o.tintState = "camo"; }
            // threat check: nearest fish within radius triggers an ink cloud
            if (o.inkCooldown <= 0) {
                let threatened = false;
                for (const f of fish) {
                    const dx = f.x - o.x, dy = f.y - o.y, dz = f.z - o.z;
                    if (dx*dx + dy*dy + dz*dz < OCTO_THREAT_R_SQ) { threatened = true; break; }
                }
                if (threatened) {
                    inkClouds.push({ x: o.x, y: o.y + 1.0, z: o.z, age: 0 });
                    o.inkCooldown = OCTO_INK_COOLDOWN;
                    o.flashT = OCTO_FLASH_TIME;          // v549 — startle flash, then re-camouflage
                    if (G) {
                        for (let i = 0; i < 40; i++) {
                            const a = ctx.rand() * Math.PI * 2;
                            const sp = ctx.rand() * 2.5;
                            G.spawn({ x: o.x, y: o.y + 1.0, z: o.z,
                                vx: Math.cos(a) * sp, vy: rnd(ctx, 0, 1.2), vz: Math.sin(a) * sp,
                                life: INK_LIFE_S * 0.8, size: 0.6 + ctx.rand() * 0.8,
                                r: 0.05, g: 0.06, b: 0.09, shape: 0 });
                        }
                    }
                    console.log("[ocean_ecosystem] octopus inked");
                }
            }
            // idle ink wisp
            if (G) {
                o.wisp += dt * 1.5;
                while (o.wisp >= 1) {
                    o.wisp -= 1;
                    G.spawn({ x: o.x + rnd(ctx, -0.6, 0.6), y: o.y + 0.5, z: o.z + rnd(ctx, -0.6, 0.6),
                        vx: rnd(ctx, -0.2, 0.2), vy: rnd(ctx, 0.2, 0.5), vz: rnd(ctx, -0.2, 0.2),
                        life: 1.4, size: 0.4, r: 0.12, g: 0.10, b: 0.18, shape: 0 });
                }
            }
            ctx.router?.exec?.({ type: "entity:move", id: o.id, x: o.x, y: o.y, z: o.z,
                yaw: Math.sin(o.sway * 0.5) * 0.3 });

            // ---- Verlet arms: wave with the current, droop, rest on the seabed ----
            const env = { gravity: 1.6, damping: 0.86, iters: 3, floorY: o.floorY + 0.2,
                swayX: Math.sin(t * 0.7 + o.sway) * 0.7, swayZ: Math.cos(t * 0.55 + o.sway) * 0.7 };
            for (const arm of o.arms) {
                const ax = o.x + Math.cos(arm.ang) * OCTO_MANTLE_R;
                const az = o.z + Math.sin(arm.ang) * OCTO_MANTLE_R;
                stepTentacle(arm, { x: ax, y: o.y, z: az }, dt, env);
                for (let n = 1; n < arm.nodes.length; n++) {
                    const sid = arm.segIds[n - 1]; if (sid == null) continue;
                    const nd = arm.nodes[n];
                    ctx.router?.exec?.({ type: "entity:move", id: sid, x: nd.x, y: nd.y, z: nd.z });
                }
            }
        }

        // ---- Fish school (boids + ink flee) ----
        if (fish.length) {
            for (const f of fish) { f.ax = 0; f.ay = 0; f.az = 0; }
            for (let i = 0; i < fish.length; i++) {
                const a = fish[i];
                let sepX=0,sepY=0,sepZ=0,sepN=0, aliX=0,aliY=0,aliZ=0,aliN=0, cohX=0,cohY=0,cohZ=0,cohN=0;
                for (let j = 0; j < fish.length; j++) {
                    if (i === j) continue;
                    const b = fish[j];
                    const dx = a.x-b.x, dy = a.y-b.y, dz = a.z-b.z;
                    const d2 = dx*dx + dy*dy + dz*dz;
                    if (d2 < VISION_SQ && d2 > 0) {
                        if (d2 < SEP_SQ) { const d = Math.sqrt(d2); sepX+=dx/d; sepY+=dy/d; sepZ+=dz/d; sepN++; }
                        aliX+=b.vx; aliY+=b.vy; aliZ+=b.vz; aliN++;
                        cohX+=b.x;  cohY+=b.y;  cohZ+=b.z;  cohN++;
                    }
                }
                if (sepN) { a.ax += sepX/sepN*FISH_MAX_SPEED*W_SEP; a.ay += sepY/sepN*FISH_MAX_SPEED*W_SEP; a.az += sepZ/sepN*FISH_MAX_SPEED*W_SEP; }
                if (aliN) { a.ax += (aliX/aliN-a.vx)*W_ALI; a.ay += (aliY/aliN-a.vy)*W_ALI; a.az += (aliZ/aliN-a.vz)*W_ALI; }
                if (cohN) { a.ax += (cohX/cohN-a.x)/VISION*FISH_MAX_SPEED*W_COH; a.ay += (cohY/cohN-a.y)/VISION*FISH_MAX_SPEED*W_COH; a.az += (cohZ/cohN-a.z)/VISION*FISH_MAX_SPEED*W_COH; }
                // soft homing to center
                const hd = Math.hypot(a.x, a.z);
                if (hd > AREA_R * 0.6 && hd > 0) {
                    const k = (hd - AREA_R*0.6) / (AREA_R*0.4);
                    a.ax += -a.x/hd * FISH_MAX_SPEED * W_HOME * k;
                    a.az += -a.z/hd * FISH_MAX_SPEED * W_HOME * k;
                }
                // flee ink clouds
                for (const ink of inkClouds) {
                    const dx = a.x-ink.x, dy = a.y-ink.y, dz = a.z-ink.z;
                    const d2 = dx*dx + dy*dy + dz*dz;
                    if (d2 < 144 && d2 > 0) {   // 12u range
                        const d = Math.sqrt(d2); const k = 1 - d/12;
                        a.ax += dx/d*FISH_MAX_SPEED*W_INK_FLEE*k;
                        a.ay += dy/d*FISH_MAX_SPEED*W_INK_FLEE*k;
                        a.az += dz/d*FISH_MAX_SPEED*W_INK_FLEE*k;
                    }
                }
                const al = Math.hypot(a.ax, a.ay, a.az), maxA = FISH_MAX_FORCE*FISH_MAX_SPEED;
                if (al > maxA) { const s = maxA/al; a.ax*=s; a.ay*=s; a.az*=s; }
            }
            for (const f of fish) {
                f.vx += f.ax*dt; f.vy += f.ay*dt; f.vz += f.az*dt; f.vy *= 0.99;
                const vl = Math.hypot(f.vx, f.vy, f.vz);
                if (vl > FISH_MAX_SPEED) { const s = FISH_MAX_SPEED/vl; f.vx*=s; f.vy*=s; f.vz*=s; }
                f.x += f.vx*dt; f.y += f.vy*dt; f.z += f.vz*dt;
                const floor = surfaceY(ctx, f.x, f.z);
                const yLo = floor + DEPTH_MARGIN_FLOOR, yHi = top - DEPTH_MARGIN_SURF;
                if (f.y < yLo) { f.y = yLo; f.vy *= -0.3; }
                if (f.y > yHi) { f.y = yHi; f.vy *= -0.3; }
                if (Math.abs(f.vx) > 0.01 || Math.abs(f.vz) > 0.01) f.yaw = Math.atan2(f.vx, f.vz);
                ctx.router?.exec?.({ type: "entity:move", id: f.id, x: f.x, y: f.y, z: f.z, yaw: f.yaw });
            }
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
        for (const f of fish) ctx.despawnEntity?.(f.id);
        for (const r of rays) ctx.despawnEntity?.(r.id);
        for (const u of turtles) ctx.despawnEntity?.(u.id);
        for (const o of octopi) ctx.despawnEntity?.(o.id);
        for (const o of octopi) if (o.arms) for (const arm of o.arms) for (const sid of arm.segIds) ctx.despawnEntity?.(sid);
        for (const id of coral) ctx.despawnEntity?.(id);
        for (const k of kelp) ctx.despawnEntity?.(k.id);
        fish = []; rays = []; turtles = []; octopi = []; coral = []; kelp = []; vents = []; inkClouds = [];
        console.log("[ocean_ecosystem] stopped");
    },
};
