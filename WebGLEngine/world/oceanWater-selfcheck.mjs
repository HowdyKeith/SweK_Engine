// world/oceanWater-selfcheck.mjs -- grades the default water mesh (slice 2 of ocean-optin-surface).
//
// WHAT THIS GRADES. The one claim the module exists for: that what is DRAWN and what FLOATS are the same surface. Every vertex of the mesh is
// asked of the physics surface again -- sampled at the vertex's world (x, z), by the inverting route slice 1 grades -- and must read the same
// height and the same normal. Everything else is the mesh being a mesh: indexed correctly, wound upward, refined consistently, foamed where
// crests are and nowhere else, deterministic, and reading nothing it should not.
//
// WHAT IT DOES NOT GRADE, said plainly: that the result looks like water (that is the page's gate and then a person), the frame time of drawing it
// (a rig reading, slice 5), and the opt-in GPU sea (slice 4). No frozen record: every row is a closed form or a re-derivation.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as W from "./oceanWater.mjs";
import * as S from "../physics/ocean/oceanSurface.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const sea = S.defaultSurface(1);

console.log("1. WHAT IS DRAWN IS THE SURFACE THE PHYSICS STANDS ON");
{
    // f32 positions: the agreement is to float32 rounding of a coordinate up to ~150 m, so 1e-4 m, not 1e-12
    const m = W.buildWater(sea, { half: 120, n: 48, t: 7.25 });
    let dh = 0, dn = 0, worstInv = 0;
    const r = S.rng(5);
    for (let k = 0; k < 400; k++) {
        const i = Math.floor(r() * m.side), j = Math.floor(r() * m.side), v = W.vertexAt(m, i, j);
        const s = sea.sample(v.x, v.z, m.t);
        dh = Math.max(dh, Math.abs(s.h - v.y));
        dn = Math.max(dn, Math.hypot(s.nx - v.nx, s.ny - v.ny, s.nz - v.nz));
        worstInv = Math.max(worstInv, s.residual);
    }
    ok("!! every sampled vertex is ON the physics surface: the height sampled at its world (x, z) equals the vertex's own, over 400 vertices",
        dh < 2e-4, `worst ${dh.toExponential(2)} m (float32 positions out to ~150 m; the inversion converged to ${worstInv.toExponential(1)} m)`);
    ok("!! ...and the normal sampled there is the vertex's normal", dn < 2e-5, `worst ${dn.toExponential(2)}`);
    ok("CONTROL: a sea one second later is a DIFFERENT surface, so the agreement above is not two flat things agreeing",
        Math.abs(sea.sample(W.vertexAt(m, 20, 20).x, W.vertexAt(m, 20, 20).z, m.t + 1).h - W.vertexAt(m, 20, 20).y) > 0.02);
    const other = S.defaultSurface(2);
    let diff = 0;
    for (let k = 0; k < 50; k++) { const v = W.vertexAt(m, (k * 7) % m.side, (k * 11) % m.side); diff = Math.max(diff, Math.abs(other.sample(v.x, v.z, m.t).h - v.y)); }
    ok("CONTROL: and a different seed's surface does NOT agree with this mesh", diff > 0.05, `largest gap ${diff.toFixed(3)} m`);
}

console.log("\n2. THE MESH IS A MESH");
{
    const n = 40, m = W.buildWater(sea, { half: 100, n, t: 2 });
    ok("vertex, triangle and array counts follow from n", m.count === (n + 1) * (n + 1) && m.indices.length === n * n * 6 && m.positions.length === m.count * 3 && m.normals.length === m.count * 3 && m.foam.length === m.count && m.labels.length === m.count * 2,
        `${m.count} vertices, ${m.indices.length / 3} triangles`);
    ok("every index names a vertex that exists", m.indices.every((i) => i < m.count));
    let up = 0, tris = m.indices.length / 3;
    for (let k = 0; k < m.indices.length; k += 3) {
        const P = (v) => [m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]];
        const A = P(m.indices[k]), B = P(m.indices[k + 1]), C = P(m.indices[k + 2]);
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        if (u[2] * w[0] - u[0] * w[2] > 0) up++;
    }
    ok("!! every triangle faces UP at the default steepness: the particle map does not fold, which is the property the steepness limit exists to keep", up === tris, `${up} of ${tris}`);
    const flat = W.buildWater(S.createSurface({ components: [] }), { half: 10, n: 5 });
    ok("a sea with no waves is a plane: y = 0, normal (0, 1, 0), foam 0 at every vertex",
        flat.positions.every((v, i) => i % 3 !== 1 || v === 0) && flat.normals.every((v, i) => (i % 3 === 1 ? v === 1 : v === 0)) && flat.foam.every((f) => f === 0));
    const lab = m.labels;
    ok("the labels are the regular grid they say, in order", lab[0] === -100 && lab[1] === -100 && lab[(n) * 2] === 100 && lab[m.side * n * 2 + 1] === 100);
    const a = W.buildWater(sea, { half: 60, n: 20, t: 5 }), b = W.buildWater(sea, { half: 60, n: 20, t: 5 });
    ok("the same inputs give a bit-identical mesh", a.positions.every((v, i) => Object.is(v, b.positions[i])) && a.foam.every((v, i) => Object.is(v, b.foam[i])));
    let threw = 0;
    for (const bad of [{ n: 0 }, { n: 2.5 }, { half: 0 }, { half: -3 }]) { try { W.buildWater(sea, bad); } catch (e) { if (e instanceof RangeError) threw++; } }
    ok("a bad grid is refused with a RangeError, four ways", threw === 4, `${threw} of 4`);
}

console.log("\n3. LEVEL OF DETAIL: A COARSE MESH IS A SUBSET OF A FINE ONE");
{
    const fine = W.buildWater(sea, { half: 100, n: 64, t: 4 }), coarse = W.buildWater(sea, { half: 100, n: 16, t: 4 });
    let worst = 0;
    for (let j = 0; j < coarse.side; j++) for (let i = 0; i < coarse.side; i++) {
        const c = W.vertexAt(coarse, i, j), f = W.vertexAt(fine, i * 4, j * 4);
        worst = Math.max(worst, Math.abs(c.x - f.x), Math.abs(c.y - f.y), Math.abs(c.z - f.z));
    }
    ok("!! every vertex of the 16-cell mesh is exactly a vertex of the 64-cell mesh: detail changes the sampling, never the shape of the sea", worst === 0, `worst difference ${worst}`);
}

console.log("\n4. FOAM IS WHERE THE PARTICLES BUNCH");
{
    const mk = (q) => S.createSurface({ components: [S.component({ wavelength: 30, heading: 0, slope: 0.6, q })] });
    const calm = W.buildWater(mk(0), { half: 45, n: 90, t: 0 }), steep = W.buildWater(mk(1), { half: 45, n: 90, t: 0 });
    const maxOf = (m) => m.foam.reduce((a, b) => Math.max(a, b), 0);
    ok("with no steepness there is no foam anywhere (a sine's particles do not bunch)", maxOf(calm) === 0);
    ok("with steepness there is foam, and all of it lies in [0, 1]", maxOf(steep) > 0.3 && steep.foam.every((f) => f >= 0 && f <= 1), `largest ${maxOf(steep).toFixed(3)}`);
    let crest = -1, trough = 2;
    for (let v = 0; v < steep.count; v++) {
        const y = steep.positions[v * 3 + 1];
        if (y > 0.95 * mk(1).components[0].A) crest = Math.max(crest, steep.foam[v]);
        if (y < -0.95 * mk(1).components[0].A) trough = Math.min(trough, steep.foam[v]);
    }
    ok("!! foam is highest AT THE CRESTS and lowest in the troughs of a steep wave", crest > 0.3 && trough < 0.05 && crest > trough, `crest ${crest.toFixed(3)}, trough ${trough.toFixed(3)}`);
    ok("foamOf is monotone in the Jacobian's fall and clamps at both ends", W.foamOf(1) === 0 && W.foamOf(1.5) === 0 && W.foamOf(0) === 1 && W.foamOf(-3) === 1 && W.foamOf(0.8) < W.foamOf(0.5));
    ok("FOAM_SCALE is the slope of that rule: a fall of 1/FOAM_SCALE is full foam and half of it is half foam", W.FOAM_SCALE > 1 && Math.abs(W.foamOf(1 - 1 / W.FOAM_SCALE) - 1) < 1e-12 && Math.abs(W.foamOf(1 - 0.5 / W.FOAM_SCALE) - 0.5) < 1e-12, `FOAM_SCALE ${W.FOAM_SCALE}`);
}

console.log("\n5. A BUOY SITS ON THE SAME SEA");
{
    const t = 11.5;
    let worst = 0;
    for (let k = 0; k < 40; k++) {
        const x = (k * 13) % 200 - 100, z = (k * 29) % 200 - 100, b = W.buoy(sea, x, z, t);
        worst = Math.max(worst, Math.abs(sea.submergence(b.x, b.y, b.z, t)), Math.abs(Math.hypot(b.nx, b.ny, b.nz) - 1));
    }
    ok("a buoy at any (x, z) rests where submergence reads zero, with a unit normal", worst < 1e-9, `worst ${worst.toExponential(2)}`);
    const m = W.buildWater(sea, { half: 100, n: 100, t });
    // the nearest mesh vertex to a buoy is within a cell, and the buoy's height is within the sea's local slope * a cell of that vertex's
    const b = W.buoy(sea, 31.4, -27.2, t);
    let best = Infinity, by = 0;
    for (let v = 0; v < m.count; v++) { const d = Math.hypot(m.positions[v * 3] - b.x, m.positions[v * 3 + 2] - b.z); if (d < best) { best = d; by = m.positions[v * 3 + 1]; } }
    ok("the buoy is drawn within a cell's worth of slope of the mesh it floats on", Math.abs(by - b.y) < 2 * best + 1e-3 && best < 4, `nearest vertex ${best.toFixed(2)} m away, heights differ by ${Math.abs(by - b.y).toFixed(3)} m`);
}

console.log("\n5b. REFILLING IN PLACE IS BUILDING AGAIN (v4895)");
{
    const m = W.buildWater(sea, { half: 60, n: 24, t: 0 }), fresh = W.buildWater(sea, { half: 60, n: 24, t: 7.25 });
    const refs = [m.positions, m.normals, m.foam], back = W.refillWater(m, sea, 7.25);
    const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    ok("!! refillWater(mesh, surface, t) leaves the mesh's arrays the SAME objects and fills them with exactly what buildWater at t builds, bit for bit (positions, normals, foam), and returns t",
        refs[0] === m.positions && refs[1] === m.normals && refs[2] === m.foam && back === 7.25 && same(m.positions, fresh.positions) && same(m.normals, fresh.normals) && same(m.foam, fresh.foam) && same(m.labels, fresh.labels) && same(m.indices, fresh.indices));
    const before = Float32Array.from(m.positions); W.refillWater(m, sea, 7.25 + 2.5);
    ok("  and a later time moves the surface (the sea is not frozen by being refilled), without changing the labels or the index list", m.positions.some((v, i) => v !== before[i]) && same(m.labels, fresh.labels) && same(m.indices, fresh.indices));
}

console.log("\n6. THE MODULE READS NOTHING IT SHOULD NOT");
{
    const src = fs.readFileSync(path.join(HERE, "oceanWater.mjs"), "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const bad = ["Date.now", "performance.now", "Math.random", "new Date", "process.", "window", "document", "navigator", "require(", "WebGL", "THREE"].filter((t) => src.includes(t));
    ok("no clock, random source, global, DOM or graphics API is read: the mesh depends on (surface, grid, t) only", bad.length === 0, bad.length ? "found: " + bad.join(", ") : "scanned with comments stripped");
    const lines = W.reportLines();
    ok("its report prints the closed forms this gate derived", lines.some((l) => /every y = 0\.0/.test(l)) && lines.some((l) => /y = 0\.500000 = A sin\(x\)/.test(l)));
}

say("UNCHECKED, said plainly: that this looks like water; what drawing it costs on any GPU; bit-equality across engines; the opt-in GPU sea, which is slice 4.");
console.log("oceanWater-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
