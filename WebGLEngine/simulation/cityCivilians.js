// FILE: simulation/cityCivilians.js
// VERSION: v757
//
// Tiny civilian pedestrians with boids-style flocking. Scale ~0.18 so
// they read as TINY next to the multi-part tanks (which sit at scale 0.55+).
// Adds scale reference to the city and makes the kaiju feel actually
// huge instead of "big-relative-to-tanks-only".
//
// Behaviors:
//   * Separation — civilians push apart when too close (avoids stacking)
//   * Alignment  — match neighbors' velocity (creates marching clusters)
//   * Cohesion   — drift toward neighbor centroid (loose flocks)
//   * Flee       — run from kaiju when within FLEE_RADIUS
//   * Build avoid — repel from building footprints
//   * Wander     — Perlin-like meander when no other forces apply
//
// Reusable: any demo that wants city crowds can import buildCivilians /
// updateCivilians / despawnCivilians. The state object is fully
// self-contained; pass it back into update each tick.
//
// Sample use (matching the city-attack demo's pattern):
//
//   import { buildCivilians, updateCivilians, despawnCivilians } from "../simulation/cityCivilians.js";
//   const pedestrians = buildCivilians(router, { count: 30, area: 40, buildings, center: {x:0,z:0} });
//   // each tick:
//   updateCivilians(router, pedestrians, dt, kaijuPos, buildings);
//   // on cleanup:
//   despawnCivilians(router, pedestrians);

const PED_KIND          = "city_pedestrian";
const VISION_RADIUS     = 3.5;
const SEP_RADIUS        = 0.9;
const FLEE_RADIUS       = 18;
const MAX_SPEED         = 2.4;
const MAX_FLEE_SPEED    = 4.6;
const SEP_WEIGHT        = 1.6;
const ALI_WEIGHT        = 0.6;
const COH_WEIGHT        = 0.45;
const FLEE_WEIGHT       = 3.5;
const BUILD_REPEL       = 2.8;

const _now = () => (typeof performance !== "undefined") ? performance.now() : Date.now();

function _spawn(router, x, y, z, scale, yaw) {
    if (!router?.exec) return null;
    try {
        const r = router.exec({
            type: "entity:spawnMesh", assetId: "obelisk",
            kind: PED_KIND, x, y, z, scale, yaw,
        });
        return (r?.ok && r.id != null) ? r.id : null;
    } catch { return null; }
}

function _move(router, id, x, y, z, yaw) {
    if (id == null || !router?.exec) return;
    try { router.exec({ type: "entity:move", id, x, y, z, yaw }); } catch {}
}

function _despawn(router, id) {
    if (id == null || !router?.exec) return;
    try { router.exec({ type: "entity:despawn", id }); } catch {}
}

export function buildCivilians(router, opts = {}) {
    const count   = opts.count   ?? 30;
    const area    = opts.area    ?? 35;
    const center  = opts.center  ?? { x: 0, z: 0 };
    const peds    = [];
    for (let i = 0; i < count; i++) {
        // Spawn in a ring around the city, not inside buildings
        const ringR = area * (0.5 + Math.random() * 0.45);
        const angle = Math.random() * Math.PI * 2;
        const x = center.x + Math.cos(angle) * ringR;
        const z = center.z + Math.sin(angle) * ringR;
        const yaw = Math.random() * Math.PI * 2;
        const id = _spawn(router, x, 0.15, z, 0.18, yaw);
        if (id == null) continue;
        peds.push({
            id, x, y: 0.15, z, yaw,
            vx: (Math.random() - 0.5) * 0.6,
            vz: (Math.random() - 0.5) * 0.6,
            wanderTheta: Math.random() * Math.PI * 2,
            _phase: Math.random() * 10,   // for wander oscillation
        });
    }
    return peds;
}

export function updateCivilians(router, peds, dt, kaijuPos, buildings) {
    if (!peds || peds.length === 0) return;
    const now = _now() * 0.001;
    // Build a grid for O(n) neighbor lookups
    // (n is ~30 here so O(n²) is also fine; using flat scan for simplicity)
    for (let i = 0; i < peds.length; i++) {
        const a = peds[i];
        let sepX = 0, sepZ = 0;
        let aliX = 0, aliZ = 0, aliN = 0;
        let cohX = 0, cohZ = 0, cohN = 0;

        for (let j = 0; j < peds.length; j++) {
            if (j === i) continue;
            const b = peds[j];
            const dx = b.x - a.x, dz = b.z - a.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > VISION_RADIUS * VISION_RADIUS) continue;
            const d = Math.sqrt(d2);
            if (d < SEP_RADIUS && d > 0.001) {
                // Push away (proportional to closeness)
                sepX -= (dx / d) * (SEP_RADIUS - d);
                sepZ -= (dz / d) * (SEP_RADIUS - d);
            }
            aliX += b.vx; aliZ += b.vz; aliN++;
            cohX += b.x; cohZ += b.z; cohN++;
        }
        if (aliN > 0) { aliX /= aliN; aliZ /= aliN; }
        if (cohN > 0) {
            cohX = cohX / cohN - a.x;
            cohZ = cohZ / cohN - a.z;
            const cm = Math.hypot(cohX, cohZ) || 1;
            cohX /= cm; cohZ /= cm;
        }

        // Flee force from kaiju
        let fleeX = 0, fleeZ = 0;
        let fleeing = false;
        if (kaijuPos) {
            const dx = a.x - kaijuPos.x, dz = a.z - kaijuPos.z;
            const d = Math.hypot(dx, dz);
            if (d < FLEE_RADIUS && d > 0.001) {
                fleeing = true;
                const strength = (FLEE_RADIUS - d) / FLEE_RADIUS;
                fleeX = (dx / d) * strength;
                fleeZ = (dz / d) * strength;
            }
        }

        // Building repulsion
        let bRX = 0, bRZ = 0;
        if (buildings) {
            for (const b of buildings) {
                const dx = a.x - b.x, dz = a.z - b.z;
                const d = Math.hypot(dx, dz);
                if (d < b.radius + 1.5 && d > 0.001) {
                    const strength = (b.radius + 1.5 - d) / (b.radius + 1.5);
                    bRX += (dx / d) * strength;
                    bRZ += (dz / d) * strength;
                }
            }
        }

        // Wander (perlin-like wobble)
        a.wanderTheta += (Math.random() - 0.5) * 0.4 * dt;
        const wanderX = Math.cos(a.wanderTheta) * 0.3;
        const wanderZ = Math.sin(a.wanderTheta) * 0.3;

        // Combine
        let ax = sepX * SEP_WEIGHT + aliX * ALI_WEIGHT + cohX * COH_WEIGHT
              + fleeX * FLEE_WEIGHT + bRX * BUILD_REPEL + wanderX;
        let az = sepZ * SEP_WEIGHT + aliZ * ALI_WEIGHT + cohZ * COH_WEIGHT
              + fleeZ * FLEE_WEIGHT + bRZ * BUILD_REPEL + wanderZ;

        // Integrate velocity (damped) and clamp speed
        a.vx = a.vx * 0.92 + ax * dt * 4;
        a.vz = a.vz * 0.92 + az * dt * 4;
        const speed = Math.hypot(a.vx, a.vz);
        const maxV = fleeing ? MAX_FLEE_SPEED : MAX_SPEED;
        if (speed > maxV) {
            a.vx = (a.vx / speed) * maxV;
            a.vz = (a.vz / speed) * maxV;
        }

        // Update position
        a.x += a.vx * dt;
        a.z += a.vz * dt;

        // Update yaw to face motion (only when actually moving)
        const moving = speed > 0.05;
        if (moving) a.yaw = Math.atan2(a.vx, a.vz);

        // Tiny vertical bob to suggest "walking" — purely cosmetic
        a.y = 0.15 + Math.sin(now * 6 + a._phase) * 0.04;

        _move(router, a.id, a.x, a.y, a.z, a.yaw);
    }
}

export function despawnCivilians(router, peds) {
    if (!peds) return;
    for (const p of peds) _despawn(router, p.id);
    peds.length = 0;
}
