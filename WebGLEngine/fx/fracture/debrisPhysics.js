// fx/fracture/debrisPhysics.js -- hand the Voronoi fragments to a REAL solver. cellFracture's stepDebris is a toy
// integrator: gravity, drag, spin, no collisions -- fragments pass through the floor and each other and never settle.
// This gives each fragment a body in the physics world (Jolt or box3d, through the same backend facade the rest of the
// engine uses), sized to the fragment's own bounds, launched away from the impact, and then the solver does what a
// solver does: they collide, pile up and come to rest. Verified against real Jolt, headless -- no rig needed.
"use strict";

// A fragment's axis-aligned bounds -> the box body that stands in for it.
function fragBounds(frag) {
    const P = frag.positions, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { const v = P[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    const half = [Math.max(0.03, (hi[0] - lo[0]) / 2), Math.max(0.03, (hi[1] - lo[1]) / 2), Math.max(0.03, (hi[2] - lo[2]) / 2)];
    return { lo, hi, half, center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] };
}

// 2026-11-03 (unnumbered) -- A SPIN CAP, BECAUSE box3d PUTS NONE ON AN ANGULAR IMPULSE AND JOLT DOES. The tumble below is an IMPULSE,
// and a fragment's moments are tiny (a 6 x 18 x 12 cm sliver of density 1 weighs 1.3 g), so one impulse spins a sliver enormously.
// Jolt's AddAngularImpulse clamps the result at its default max angular velocity, 15 pi rad/s; box3d's ApplyAngularImpulse does not --
// a free sliver is brought to the same 15 pi only inside box3d's next step, and the debris does not wait for it. Measured on the blob
// pages' fallback (they ask for Jolt and take box3d when Jolt will not load), 40 seeds of each blob: slivers spun to 2.6 million rad/s
// at the throw, fragments thrown at up to 249 m/s, and 12 of the 1,410 fragments lost through the floor or over the rim. Capped at the
// throw, as Jolt caps it: none lost, the fastest 9.0 m/s.
// A spin is capped only above the cap by SPIN_SLACK, so Jolt's own spins -- at its cap or under it, in float32 -- are never touched,
// and the pages on Jolt, and the spinning body's fourth round that flew this module on Jolt, are byte for byte what they were.
// Gated in fx/fracture/debrisPhysics-selfcheck.mjs, sections 4 to 6. SINCE 2026-11-04 box3d's facade caps every angular impulse this same way first (physics/box3d/box3dLoader.js, SPIN CAP), so on box3d, as on Jolt, this finds nothing left to cap and the flights are byte for byte what they were; it stays for a world that does not.
const MAX_SPIN = 15 * Math.PI;   // rad/s: Jolt's default max angular velocity, a quarter turn per 1/60 s step
const SPIN_SLACK = 1.001;        // capped only above MAX_SPIN * SPIN_SLACK

/** Cap the spin of bodies `idxs` at `cap` rad/s, keeping each one's axis; returns the bodies it capped. A world that cannot read and set
 *  spin (neither backend here lacks it) is left as it is, and [] returned. */
function capSpin(world, idxs, cap = MAX_SPIN) {
    if (!(cap < Infinity) || typeof world.readAngularVelocities !== "function" || typeof world.setAngularVelocity !== "function") return [];
    const W = world.readAngularVelocities();
    if (!W) return [];
    const over = [];
    for (const i of idxs) { const w = [W[i * 3], W[i * 3 + 1], W[i * 3 + 2]], s = Math.hypot(w[0], w[1], w[2]); if (s > cap * SPIN_SLACK) over.push([i, w.map((c) => c * cap / s)]); }
    for (const [i, w] of over) world.setAngularVelocity(i, w);   // after the read is done with: box3d's view lasts only until its next call
    return over.map(([i]) => i);
}

// Give every fragment a real body, thrown away from the impact (closer = harder), with a tumble -- capped as above (`maxSpin`, rad/s;
// Infinity turns the cap off, which the gate uses to reproduce what box3d did without it). Each body says whether its spin was capped.
function makePhysicsDebris(world, fragments, impact, opts = {}) {
    const force = opts.force == null ? 2.6 : opts.force, spin = opts.spin == null ? 0.5 : opts.spin, rng = opts.rng || Math.random;
    const bodies = [];
    for (const f of fragments) {
        const b = fragBounds(f);
        const idx = world.addBox({ type: "dynamic", pos: b.center, half: b.half, density: opts.density == null ? 1 : opts.density });
        const d = [f.centroid[0] - impact[0], f.centroid[1] - impact[1], f.centroid[2] - impact[2]];
        const l = Math.hypot(d[0], d[1], d[2]) || 1e-6, k = force / (0.35 + l);
        world.setVelocity(idx, [d[0] / l * k, d[1] / l * k + 0.6, d[2] / l * k]);
        world.angularImpulse(idx, [(rng() - 0.5) * spin, (rng() - 0.5) * spin, (rng() - 0.5) * spin]);
        bodies.push({ frag: f, idx, center: b.center });
    }
    const capped = new Set(capSpin(world, bodies.map((b) => b.idx), opts.maxSpin == null ? MAX_SPIN : opts.maxSpin));
    for (const b of bodies) b.spinCapped = capped.has(b.idx);
    return bodies;
}

// A floor for them to land on (and walls, if you want them to pile rather than scatter).
// 2026-11-03 (unnumbered): `rim` is those walls -- four static walls of that height along the floor's edge -- because the
// spinning body's fourth round (physics/mechanics/SPINNING_BODY_WIP.md) found blob-herd.html's debris could slide off its floor:
// on one seed of forty a fragment went over the edge at 4.4 s and fell for good. No rim unless asked, so a caller that passes
// none builds exactly the floor it built before. Returns the floor's handle, as it always has.
function addGround(world, opts = {}) {
    const y = opts.y == null ? -1.5 : opts.y, extent = opts.extent || 8, rim = opts.rim || 0;
    const floor = world.addBox({ type: "static", pos: [0, y - 0.25, 0], half: [extent, 0.25, extent] });
    if (rim > 0) for (const [x, z, hx, hz] of [[extent + 0.25, 0, 0.25, extent + 0.5], [-extent - 0.25, 0, 0.25, extent + 0.5], [0, extent + 0.25, extent, 0.25], [0, -extent - 0.25, extent, 0.25]])
        world.addBox({ type: "static", pos: [x, y + rim / 2, z], half: [hx, rim / 2, hz] });
    return floor;
}

// Read the solver's transforms back for rendering: each fragment's verts are world-space around its own center, so
// draw them as q * (v - center) + p.
function readDebris(world, bodies) {
    const xf = world.readTransforms();
    return bodies.map(b => { const o = b.idx * 7; return { frag: b.frag, center: b.center, p: [xf[o], xf[o + 1], xf[o + 2]], q: [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]] }; });
}
// rotate a vertex by the body quaternion and place it (what a renderer does per fragment vertex)
function applyXf(d, v) {
    const x = v[0] - d.center[0], y = v[1] - d.center[1], z = v[2] - d.center[2];
    const [qx, qy, qz, qw] = d.q;
    const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
    return [ix * qw + iw * -qx + iy * -qz - iz * -qy + d.p[0], iy * qw + iw * -qy + iz * -qx - ix * -qz + d.p[1], iz * qw + iw * -qz + ix * -qy - iy * -qx + d.p[2]];
}
export { makePhysicsDebris, addGround, readDebris, applyXf, fragBounds, capSpin, MAX_SPIN, SPIN_SLACK };
