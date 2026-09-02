// WebGLEngine/render/hitBurst.js — v3844 (the cockpit's hit VFX, ported to the 3D fight)
//
// cockpit.html sprays particles when a ship is hit, and the part worth taking is NOT the spray -- it is the RULE
// behind it. cockpit's hit() absorbs damage into shields first, and then picks the burst from the shield state
// AFTER absorption: shields still up gives a small cyan spark shower, shields gone gives a bigger red one, and a
// kill adds a third amber burst on top of the second. So the shot that BREAKS a shield already throws hull-
// coloured debris, and a killing blow throws two bursts, not one. That is the behaviour this file reproduces
// exactly, and es-box3d-fly3d already runs the same damage model (ev/combat.js applyDamage: shield absorbs, the
// overflow hits armour, dead at armour <= 0), so the rule maps onto it without being invented.
//
// TWO THINGS ARE DELIBERATELY NOT COPIED.
//   1. Math.random. cockpit picks every angle and speed from it; a burst here is a pure function of its seed, so
//      the same hit throws the same debris and the gate can hold a burst still and measure it. The hash is
//      render/valueNoise.js's, already shared by the skybox, the star and greeble. *** v4327 -- THIS LINE USED
//      TO CALL IT "THE TREE'S ONE INTEGER HASH ... SHARED BY THE SKYBOX, STAR, PLANET AND GREEBLE", AND THE
//      PLANET WAS NEVER IN IT: *** world/procPlanet.js carries a different hash on a quintic fade, agreeing with
//      this one on none of 360 sampled points. Two noises, deliberately -- see render/valueNoise.js's header.
//   2. THE PER-FRAME DRAG. cockpit does `q.vx *= 0.94` once per frame, which means its spray travels FURTHER ON A
//      FASTER MACHINE -- the decay is per frame, not per second. Here drag is exponential in TIME and the position
//      is its analytic integral, so splitting a step into substeps lands on the same place to float precision.
//      That is the property the gate pins hardest, because it is the one the source actually gets wrong.
//
// WHY NOT render/particleSystem.js: that pool is raw WebGL -- it takes a `gl` context and owns its own instanced
// billboard draw -- and its ImpactBurstEmitter is wired to the voxel eventBus. es-box3d-fly3d is a Three scene
// that already draws its shots as a THREE.Points cloud. So this file owns ARITHMETIC ONLY (no GL, no Three, no
// DOM, no Math.random) and the page packs the result into the Points buffer it already has.
//
// Gated in render/hitBurst-selfcheck.mjs.

import { hash3 } from "./valueNoise.js";   // v4327 -- the skybox lineage's integer hash, from its own file

// The three tiers, straight off cockpit.html's hit(): counts 6 / 12 / 40 and its cyan / red / amber, converted
// from its hex to linear-ish floats. Speeds and lifetimes are scaled for the 3D scene's units, which are not
// cockpit's pixels; everything else is the source's.
export const BURST_TIERS = {
    shield: { count: 6,  color: [0.35, 0.82, 1.00], speed: [1.6, 5.0], life: [0.35, 0.75], size: 2.0 },
    hull:   { count: 12, color: [1.00, 0.36, 0.42], speed: [2.2, 7.5], life: [0.40, 0.90], size: 2.4 },
    kill:   { count: 40, color: [0.96, 0.65, 0.14], speed: [3.0, 11.0], life: [0.55, 1.30], size: 3.0 },
};

const DEFAULTS = {
    drag: 2.2,        // per SECOND, not per frame (see the header)
    inherit: 0.35,    // fraction of the victim's velocity the debris carries; 0 is cockpit's own behaviour
    cap: 900,         // hard pool ceiling; the oldest particles are retired first when a fight gets busy
};
export function makeBurstParams(opts = {}) { return { ...DEFAULTS, ...opts }; }

// WHICH BURSTS A HIT THROWS. Mirrors cockpit's hit() against ev/combat.js's damage model: the tier is read from
// the shield AFTER absorption (so the shot that empties the shield is already a hull hit), and a kill appends a
// SECOND burst rather than replacing the first. Pure: it reads the ship's numbers, it does not write them.
export function burstsFor(shieldBefore, armorBefore, damage) {
    const absorbed = Math.min(Math.max(0, shieldBefore), damage);
    const shieldAfter = Math.max(0, shieldBefore) - absorbed;
    const armorAfter = armorBefore - (damage - absorbed);
    const tiers = [shieldAfter > 0 ? "shield" : "hull"];
    if (armorAfter <= 0) tiers.push("kill");
    return tiers;
}

// A unit vector from two hashes, by the exact area-preserving construction (z uniform in [-1,1], then the angle).
// Normalising a cube of uniforms would bias toward the corners; this one is isotropic, and the gate checks it.
function hashDir(seed, i) {
    const z = hash3(i, 0, 1, seed) * 2 - 1;
    const a = hash3(i, 0, 2, seed) * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    return [Math.cos(a) * r, z, Math.sin(a) * r];
}
const mix = (a, b, t) => a + (b - a) * t;

// Append one burst's particles to `parts`. `origin` and `vel` are in the CALLER's units -- this file never learns
// the scene's scale. Returns the number of particles added.
export function spawnBurst(parts, origin, vel, tier, seed, opts = {}) {
    const P = makeBurstParams(opts), T = BURST_TIERS[tier];
    if (!T) return 0;
    for (let i = 0; i < T.count; i++) {
        const d = hashDir(seed, i);
        const sp = mix(T.speed[0], T.speed[1], hash3(i, 1, 3, seed));
        const life = mix(T.life[0], T.life[1], hash3(i, 1, 4, seed));
        parts.push({
            x: origin[0], y: origin[1], z: origin[2],
            vx: d[0] * sp + (vel ? vel[0] * P.inherit : 0),
            vy: d[1] * sp + (vel ? vel[1] * P.inherit : 0),
            vz: d[2] * sp + (vel ? vel[2] * P.inherit : 0),
            life, life0: life, color: T.color, size: T.size, tier,
        });
    }
    if (parts.length > P.cap) parts.splice(0, parts.length - P.cap);   // oldest out first
    return T.count;
}

// Advance every particle and retire the dead ones IN PLACE. Exponential drag, integrated analytically:
//   v' = v * e^(-k dt),  x' = x + v * (1 - e^(-k dt)) / k
// which is exact, so ten steps of dt/10 land where one step of dt does. Returns the live count.
export function stepBurst(parts, dt, opts = {}) {
    const P = makeBurstParams(opts), k = P.drag;
    const decay = Math.exp(-k * dt);
    const travel = k > 1e-12 ? (1 - decay) / k : dt;
    let w = 0;
    for (let i = 0; i < parts.length; i++) {
        const q = parts[i];
        q.life -= dt;
        if (q.life <= 0) continue;
        q.x += q.vx * travel; q.y += q.vy * travel; q.z += q.vz * travel;
        q.vx *= decay; q.vy *= decay; q.vz *= decay;
        parts[w++] = q;
    }
    parts.length = w;
    return w;
}

// Fade of one particle, 1 at birth to 0 at death. Independent of how long it was born to live, so a kill's long
// embers and a shield's short sparks fade on the same curve.
export function fadeOf(q) { return q.life0 > 0 ? Math.max(0, Math.min(1, q.life / q.life0)) : 0; }

// Fill flat position/colour arrays for a points draw, and the per-particle sizes if the caller wants them.
// Colour is premultiplied by the fade, so the page needs no per-particle alpha attribute -- additive blending on
// a black sky does the rest. Returns the count written, which is bounded by the smallest buffer given.
export function packPoints(parts, positions, colors, sizes) {
    let n = Math.min(parts.length, Math.floor(positions.length / 3), Math.floor(colors.length / 3));
    if (sizes) n = Math.min(n, sizes.length);
    for (let i = 0; i < n; i++) {
        const q = parts[i], f = fadeOf(q), o = i * 3;
        positions[o] = q.x; positions[o + 1] = q.y; positions[o + 2] = q.z;
        colors[o] = q.color[0] * f; colors[o + 1] = q.color[1] * f; colors[o + 2] = q.color[2] * f;
        if (sizes) sizes[i] = q.size;
    }
    return n;
}
