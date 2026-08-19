// fx/fracture/cellFracture.js -- Voronoi cell fracture: shatter a mesh into fragments. This is the ownable core of the
// cell-fracture idea (JFracture / Blender's cell fracture are addons bound to their host; the ALGORITHM is portable):
// scatter seed sites through the mesh's bounds, assign every triangle to its nearest site, and each site's triangles
// become one fragment. Sites can be biased toward an impact point, so a hit shatters finely where it landed and coarsely
// far away -- the way real things break. Fragments then get an impulse away from the impact and tumble (CPU here;
// hand the same bodies to Jolt/box3d on the rig). For Avataro, fracture is just merge run backwards: shatter the blob,
// let the pieces fly, and the metaball cores re-form into normal shape. Pure + verified by
// cellFracture-selfcheck.mjs (v2621): triangle-conserving partition, finer-near-impact, one-frame real-time,
// debris that flies outward and falls. It is CLUSTER fracture (whole triangles to nearest site), NOT sealed
// convex shards -- the gate names that boundary so "verified" cannot quietly mean more than was checked.
"use strict";

// Scatter n sites in bounds; `bias` (0..1) pulls them toward `impact` so the break is finer at the hit.
function makeSites(bounds, n, opts = {}) {
    const rng = opts.rng || Math.random, impact = opts.impact || null, bias = opts.bias == null ? 0.5 : opts.bias;
    const [lo, hi] = bounds, sites = [];
    for (let i = 0; i < n; i++) {
        let p = [lo[0] + rng() * (hi[0] - lo[0]), lo[1] + rng() * (hi[1] - lo[1]), lo[2] + rng() * (hi[2] - lo[2])];
        if (impact) { const t = bias * rng(); p = [p[0] + (impact[0] - p[0]) * t, p[1] + (impact[1] - p[1]) * t, p[2] + (impact[2] - p[2]) * t]; }
        sites.push(p);
    }
    return sites;
}

function _bounds(positions) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    return [lo, hi];
}

// Assign each triangle to the nearest site (its Voronoi cell). mesh: { positions, indices? } -- no indices = triangle soup.
function fractureMesh(mesh, sites) {
    const P = mesh.positions;
    const idx = mesh.indices || null, triCount = idx ? idx.length / 3 : P.length / 9;
    const groups = sites.map((s, i) => ({ site: i, sitePos: s, positions: [], tris: 0, centroid: [0, 0, 0] }));
    for (let t = 0; t < triCount; t++) {
        const a = idx ? idx[t * 3] * 3 : t * 9, b = idx ? idx[t * 3 + 1] * 3 : t * 9 + 3, c = idx ? idx[t * 3 + 2] * 3 : t * 9 + 6;
        const cx = (P[a] + P[b] + P[c]) / 3, cy = (P[a + 1] + P[b + 1] + P[c + 1]) / 3, cz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        let best = 0, bd = Infinity;
        for (let s = 0; s < sites.length; s++) { const dx = cx - sites[s][0], dy = cy - sites[s][1], dz = cz - sites[s][2]; const d = dx * dx + dy * dy + dz * dz; if (d < bd) { bd = d; best = s; } }
        const g = groups[best];
        g.positions.push(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
        g.centroid[0] += cx; g.centroid[1] += cy; g.centroid[2] += cz; g.tris++;
    }
    const out = [];
    for (const g of groups) { if (!g.tris) continue; g.centroid = [g.centroid[0] / g.tris, g.centroid[1] / g.tris, g.centroid[2] / g.tris]; out.push(g); }
    return out;
}

// Each fragment flies AWAY from the impact (closer = harder), with a spin. Hand these to Jolt/box3d on the rig.
function makeDebris(fragments, impact, opts = {}) {
    const force = opts.force || 2.2, rng = opts.rng || Math.random;
    return fragments.map(f => {
        const d = [f.centroid[0] - impact[0], f.centroid[1] - impact[1], f.centroid[2] - impact[2]];
        const l = Math.hypot(d[0], d[1], d[2]) || 1e-6, k = force / (0.35 + l);
        return { frag: f, p: [0, 0, 0], v: [d[0] / l * k, d[1] / l * k + 0.35, d[2] / l * k], rot: 0, spin: (rng() - 0.5) * 5, age: 0 };
    });
}
function stepDebris(bodies, dt, opts = {}) {
    const g = opts.gravity == null ? -3.2 : opts.gravity, drag = opts.drag == null ? 0.995 : opts.drag;
    for (const b of bodies) { b.v[1] += g * dt; for (let k = 0; k < 3; k++) { b.v[k] *= drag; b.p[k] += b.v[k] * dt; } b.rot += b.spin * dt; b.age += dt; }
    return bodies;
}
export { makeSites, fractureMesh, makeDebris, stepDebris, _bounds };
