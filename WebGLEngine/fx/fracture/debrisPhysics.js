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

// Give every fragment a real body, thrown away from the impact (closer = harder), with a tumble.
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
    return bodies;
}

// A floor for them to land on (and walls, if you want them to pile rather than scatter).
function addGround(world, opts = {}) {
    const y = opts.y == null ? -1.5 : opts.y, extent = opts.extent || 8;
    return world.addBox({ type: "static", pos: [0, y - 0.25, 0], half: [extent, 0.25, extent] });
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
export { makePhysicsDebris, addGround, readDebris, applyXf, fragBounds };
