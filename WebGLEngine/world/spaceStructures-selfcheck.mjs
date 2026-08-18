// WebGLEngine/world/spaceStructures-selfcheck.mjs — v3843
//
// Two failures make procedural props look like rendering bugs when they are generation bugs: a displaced sphere
// that stopped being a closed solid (unshared seam vertices, or a flipped face, both invisible until something
// lights it), and props placed inside one another. Both are arithmetic, so both are pinned here. The icosphere is
// also graded against a constant nobody told it: its volume must converge on 4*pi/3.
//
// Run: node world/spaceStructures-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { icosphere, makeAsteroidParams, asteroidRadius, asteroidMesh, meshVolume, asteroidField, stationSpec } from "./spaceStructures.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };

// Every edge of a closed triangle mesh belongs to exactly two triangles. Returns the count of edges that do not.
function openEdges(indices) {
    const seen = new Map();
    for (let k = 0; k < indices.length; k += 3) {
        const t = [indices[k], indices[k + 1], indices[k + 2]];
        for (let e = 0; e < 3; e++) {
            const a = t[e], b = t[(e + 1) % 3], key = a < b ? a + ":" + b : b + ":" + a;
            seen.set(key, (seen.get(key) || 0) + 1);
        }
    }
    let bad = 0;
    for (const n of seen.values()) if (n !== 2) bad++;
    return { bad, edges: seen.size };
}

// 1) THE ICOSPHERE is the right size, is closed, and shares its midpoints.
{
    let counts = true, closed = true, unit = true, euler = true;
    for (let n = 0; n <= 3; n++) {
        const { verts, faces } = icosphere(n);
        if (verts.length !== 10 * Math.pow(4, n) + 2 || faces.length !== 20 * Math.pow(4, n)) counts = false;
        const flat = new Float64Array(faces.length * 3);
        for (let f = 0; f < faces.length; f++) for (let k = 0; k < 3; k++) flat[f * 3 + k] = faces[f][k];
        const oe = openEdges(flat);
        if (oe.bad !== 0) closed = false;
        if (verts.length - oe.edges + faces.length !== 2) euler = false;   // V - E + F = 2, a sphere's own number
        for (const v of verts) if (Math.abs(Math.hypot(v[0], v[1], v[2]) - 1) > 1e-12) unit = false;
    }
    ok(counts, "vertex and triangle counts follow 10*4^n+2 and 20*4^n at every subdivision");
    ok(closed, "every edge is shared by exactly two triangles (the midpoints ARE shared)");
    ok(euler, "V - E + F = 2 at every subdivision (it is a sphere, not a sheet)");
    ok(unit, "every icosphere vertex is on the unit sphere");
}

// 2) THE VOLUME, AGAINST A CONSTANT NOBODY TOLD IT. An inscribed polyhedron is always SMALLER than its sphere,
//    and the shortfall must fall by ~4x per subdivision. This is what catches a flipped winding, a dropped
//    triangle, or a mesher that quietly stopped closing.
{
    const exact = 4 * Math.PI / 3;
    const vol = (n) => meshVolume(...(() => { const m = asteroidMesh(1, { subdiv: n, amp: 0, detailAmp: 0, squash: 0, radius: 1 }); return [m.positions, m.indices]; })());
    const v2 = vol(2), v3 = vol(3), v4 = vol(4);
    ok(v2 < exact && v3 < exact && v4 < exact, "the inscribed mesh is always smaller than its sphere");
    ok(Math.abs(v4 - exact) / exact < 3e-3, `subdiv 4 lands within 0.3% of 4*pi/3 (${v4.toFixed(6)} against ${exact.toFixed(6)})`);
    const r1 = (exact - v2) / (exact - v3), r2 = (exact - v3) / (exact - v4);
    ok(Math.abs(r1 - 4) < 0.5 && Math.abs(r2 - 4) < 0.5, `and the shortfall falls ~4x per subdivision (${r1.toFixed(2)}, ${r2.toFixed(2)})`);
}

// 3) A DISPLACED ASTEROID IS STILL A CLOSED SOLID, wound outward.
{
    let closed = true, positive = true, starShaped = true, unitN = true, outward = true;
    for (const seed of [1, 7, 99, 4242, 123456]) {
        const m = asteroidMesh(seed);
        if (openEdges(m.indices).bad !== 0) closed = false;
        if (meshVolume(m.positions, m.indices) <= 0) positive = false;
        if (!(m.rMin > 0)) starShaped = false;
        for (let i = 0; i < m.vertexCount; i++) {
            const n = [m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]];
            const p = [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
            if (Math.abs(Math.hypot(n[0], n[1], n[2]) - 1) > 1e-6) unitN = false;
            if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] <= 0) outward = false;
        }
    }
    ok(closed, "displacing the sphere does not open it (the seam vertices stay shared)");
    ok(positive, "signed volume is positive on every asteroid (winding is consistent and outward)");
    ok(starShaped, "no vertex is pushed through the origin (the body stays star-shaped)");
    ok(unitN, "every vertex normal is a unit vector");
    ok(outward, "every vertex normal points away from the body, not into it");
}

// 4) THE SURFACE IS A FUNCTION OF DIRECTION, and the displacement stays inside its declared band.
{
    const P = makeAsteroidParams();
    ok(asteroidRadius([0, 0, 3], P, 5) === asteroidRadius([0, 0, 1], P, 5), "radius depends on direction only, not on the vector's length");
    let inBand = true;
    const bound = (1 + P.squash) * (1 + P.amp + P.detailAmp), floor = (1 - P.squash) * (1 - P.amp - P.detailAmp);
    for (const seed of [3, 55, 909]) {
        const m = asteroidMesh(seed);
        if (m.rMax > bound + 1e-9 || m.rMin < floor - 1e-9) inBand = false;
    }
    ok(inBand, `every radius stays inside the band the parameters declare (${floor.toFixed(3)} .. ${bound.toFixed(3)})`);
    const a = asteroidMesh(88), b = asteroidMesh(88), c = asteroidMesh(89);
    let same = true, diff = false;
    for (let i = 0; i < a.positions.length; i++) { if (a.positions[i] !== b.positions[i]) same = false; if (a.positions[i] !== c.positions[i]) diff = true; }
    ok(same, "same seed -> byte-identical asteroid");
    ok(diff, "different seed -> different asteroid");
    ok(a.rMax > a.rMin * 1.15, `the body is actually lumpy, not a sphere with a seed attached (rMax/rMin ${(a.rMax / a.rMin).toFixed(2)})`);
}

// 5) A FIELD DOES NOT INTERPENETRATE, and says so honestly when the shell is full.
{
    const f = asteroidField(7);
    let clear = true, inside = true, worstGap = Infinity;
    for (let i = 0; i < f.rocks.length; i++) {
        const a = f.rocks[i];
        const rad = Math.hypot(a.pos[0], a.pos[2]);
        if (rad < 90 - 1e-9 || rad > 260 + 1e-9 || Math.abs(a.pos[1]) > 40 + 1e-9) inside = false;
        for (let j = i + 1; j < f.rocks.length; j++) {
            const b = f.rocks[j];
            const d = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) - (a.radius + b.radius);
            worstGap = Math.min(worstGap, d);
        }
    }
    if (worstGap <= 0) clear = false;
    ok(clear, `no two rocks intersect (closest surfaces still ${worstGap.toFixed(2)} apart)`);
    ok(inside, "every rock is inside the shell it was asked for");
    ok(f.placed === f.requested && f.placed === 40, "a field with room places everything it was asked for");
    // saturation: the shell is deliberately too small, and the placer must UNDER-DELIVER rather than overlap
    const tight = asteroidField(9, { count: 200, inner: 90, outer: 110, thickness: 8 });
    let tightClear = true;
    for (let i = 0; i < tight.rocks.length; i++) for (let j = i + 1; j < tight.rocks.length; j++) {
        const a = tight.rocks[i], b = tight.rocks[j];
        if (Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]) <= a.radius + b.radius) tightClear = false;
    }
    ok(tight.placed < tight.requested, `a full shell under-delivers instead of overlapping (${tight.placed} of ${tight.requested})`);
    ok(tightClear, "and the rocks it DID place still do not intersect");
    ok(tight.requested === 200, "the request is reported beside the result, so the shortfall is visible");
    ok(JSON.stringify(asteroidField(7)) === JSON.stringify(f), "fields are deterministic");
    ok(JSON.stringify(asteroidField(8)) !== JSON.stringify(f), "and seed-sensitive");
    let spinOk = true;
    for (const rk of f.rocks) if (Math.abs(Math.hypot(rk.axis[0], rk.axis[1], rk.axis[2]) - 1) > 1e-9) spinOk = false;
    ok(spinOk, "every rock's spin axis is a unit vector");
}

// 6) A STATION'S MODULES DO NOT OVERLAP, and its plates belong to the modules they came from.
{
    const st = stationSpec({ seed: 31337 });
    const solid = (a, b) => {
        for (let k = 0; k < 3; k++) if (!(Math.abs(a.center[k] - b.center[k]) < (a.size[k] + b.size[k]) * 0.5 - 1e-9)) return false;
        return true;   // strict overlap on all three axes; touching faces are adjacency, not interpenetration
    };
    let clear = true;
    for (let i = 0; i < st.parts.length; i++) for (let j = i + 1; j < st.parts.length; j++) if (solid(st.parts[i], st.parts[j])) clear = false;
    ok(clear, `no two of the ${st.parts.length} hull parts interpenetrate`);
    ok(st.parts.filter((p) => p.kind === "module").length === 10, "both arms of the spine are built (5 modules each way)");
    ok(st.parts[0].kind === "hub" && st.parts[0].center.every((c) => c === 0), "the hub is at the origin");
    ok(st.span > 0 && st.plates.length > 100, `the station is greebled (${st.plates.length} plates over ${st.span.toFixed(1)} of span)`);
    let attached = true;
    for (const pl of st.plates) {
        const part = st.parts[pl.part];
        let touching = false;
        for (let k = 0; k < 3; k++) {
            const inner = Math.abs(pl.center[k] - part.center[k]) - pl.size[k] * 0.5;
            if (Math.abs(inner - part.size[k] * 0.5) < 1e-9) touching = true;
        }
        if (!touching) attached = false;
    }
    ok(attached, "every plate is flush against a face of the part it belongs to (plates in world space, hull in world space)");
    ok(JSON.stringify(stationSpec({ seed: 31337 })) === JSON.stringify(st), "stations are deterministic");
    ok(JSON.stringify(stationSpec({ seed: 31338 })) !== JSON.stringify(st), "and seed-sensitive");
    const sym = stationSpec({ seed: 5, modules: 3 });
    ok(sym.parts.filter((p) => p.center[0] > 0).length > 0 && sym.parts.filter((p) => p.center[0] < 0).length > 0, "the spine runs both ways from the hub");
}

if (fail) { console.error(`\nspaceStructures-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`spaceStructures-selfcheck: all ${pass} pass`);
