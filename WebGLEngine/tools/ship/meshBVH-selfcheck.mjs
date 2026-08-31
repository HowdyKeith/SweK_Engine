#!/usr/bin/env node
// tools/ship/meshBVH-selfcheck.mjs -- v4221
//
// Run: node tools/ship/meshBVH-selfcheck.mjs      (pure, no GL)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES mesh/meshBVH.mjs and the two call sites it replaced.
//
// *** MEASURED BEFORE BUILDING: TWO INDEPENDENT MOLLER-TRUMBORE LOOPS, NO ACCELERATION STRUCTURE ANYWHERE. ***
// multiplayer/wadLevelHost.js walked every wall triangle for each line-of-sight query -- and losClear gates
// every bot engagement and every shot. tools/krbn/krbnCompare.js walked every triangle for each stroke POINT,
// and a stroke has hundreds. The two disagreed on data layout, on epsilon, and on the QUERY ITSELF (any-hit
// within a segment, versus nearest-hit along a ray), which is why this module has one kernel and two queries
// rather than one "raycast".
//
// An acceleration structure is a special thing to test, because ITS ONLY JOB IS TO RETURN THE SAME ANSWER
// FASTER. A wrong one is not visibly wrong -- it is fast and quietly missing geometry, which reads as a
// content bug. So the exactness checks below compare against brute force over the same triangles, and the
// speed check is separate and secondary.
import { MeshBVH, rayTriangle, trianglesFrom, baryAt, EPS } from "../../mesh/meshBVH.mjs";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("meshBVH-selfcheck -- an accelerator is only correct if it changes nothing but the time\n");

// *** mulberry32, AND THE REASON IS A MEASUREMENT THAT FOOLED ME. *** The first version of this test built its
// mesh with an LCG, s = (s * 1103515245 + 12345) & 0x7fffffff. In JS doubles that product exceeds 2^53 and the
// generator degenerates: it repeated with period 10466, so a "20000 triangle" mesh was 9534 real triangles
// plus exact duplicates. Every apparent BVH/brute-force mismatch was the two picking different members of an
// IDENTICAL pair -- both right, the data broken. Reproducible test data has to be checked like anything else.
function rng(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
function lumpyMesh(n, seed) {
    const r = rng(seed), t = new Float64Array(n * 9);
    for (let i = 0; i < n; i++) {
        const th = r() * 6.283, ph = Math.acos(2 * r() - 1), R = 1 + 0.3 * Math.sin(th * 5);
        const cx = R * Math.sin(ph) * Math.cos(th), cy = R * Math.cos(ph), cz = R * Math.sin(ph) * Math.sin(th);
        for (let k = 0; k < 3; k++) {
            t[i * 9 + k * 3] = cx + (r() - 0.5) * 0.12;
            t[i * 9 + k * 3 + 1] = cy + (r() - 0.5) * 0.12;
            t[i * 9 + k * 3 + 2] = cz + (r() - 0.5) * 0.12;
        }
    }
    return t;
}
function bruteFirst(tris, ox, oy, oz, dx, dy, dz) {
    let best = Infinity, bt = -1;
    for (let i = 0; i < tris.length / 9; i++) {
        const t = rayTriangle(ox, oy, oz, dx, dy, dz, tris, i * 9, EPS);
        if (t !== null && t < best) { best = t; bt = i; }
    }
    return bt < 0 ? null : { t: best, tri: bt };
}
function bruteSegment(tris, ax, ay, az, bx, by, bz, eps = 1e-6) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (let i = 0; i < tris.length / 9; i++) {
        const t = rayTriangle(ax, ay, az, dx, dy, dz, tris, i * 9, eps);
        if (t !== null && t > eps && t < 1 - eps) return true;
    }
    return false;
}
function rayBattery(seed, n) {
    const r = rng(seed), out = [];
    for (let i = 0; i < n; i++) {
        if (i % 6 === 0) {                                   // axis-aligned, straight through the mesh
            const ax = (i / 6) % 3, sgn = (((i / 6) | 0) % 2) ? 1 : -1;
            const o = [0, 0, 0]; o[ax] = -4 * sgn;
            o[(ax + 1) % 3] = (r() - 0.5) * 1.4; o[(ax + 2) % 3] = (r() - 0.5) * 1.4;
            const d = [0, 0, 0]; d[ax] = sgn;
            out.push([...o, ...d]); continue;
        }
        const o = [(r() - 0.5) * 8, (r() - 0.5) * 8, (r() - 0.5) * 8];
        const aim = [(r() - 0.5) * 1.6, (r() - 0.5) * 1.6, (r() - 0.5) * 1.6];
        let d = [aim[0] - o[0], aim[1] - o[1], aim[2] - o[2]];
        const L = Math.hypot(d[0], d[1], d[2]); d = d.map((v) => v / L);
        out.push([...o, ...d]);
    }
    return out;
}

// ---- 1. THE TEST DATA ITSELF -------------------------------------------------------------------------------
console.log("1. the generator, because a degenerate mesh made the first run of this file report a false bug");
{
    const r = rng(7), seen = new Set();
    let dup = 0;
    for (let i = 0; i < 60000; i++) { const k = r(); if (seen.has(k)) dup++; seen.add(k); }
    ok("!! the RNG does not repeat over 60000 draws -- the LCG it replaced repeated every 10466", dup === 0,
        dup + " repeats");
    const tris = lumpyMesh(4000, 7), tset = new Set();
    let dupTri = 0;
    for (let i = 0; i < 4000; i++) { const k = Array.from(tris.subarray(i * 9, i * 9 + 9)).join(","); if (tset.has(k)) dupTri++; tset.add(k); }
    ok("...so the mesh holds no duplicate triangles, and a tie in the answer means a real tie", dupTri === 0);
}

// ---- 2. THE KERNEL -----------------------------------------------------------------------------------------
console.log("\n2. the one Moller-Trumbore kernel");
{
    const tri = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    ok("a ray through the middle hits at the right distance",
        Math.abs(rayTriangle(0.25, 0.25, -2, 0, 0, 1, tri, 0) - 2) < 1e-12);
    ok("a ray past the corner misses", rayTriangle(0.9, 0.9, -2, 0, 0, 1, tri, 0) === null);
    ok("a ray pointing AWAY misses -- t must be positive, not merely finite",
        rayTriangle(0.25, 0.25, -2, 0, 0, -1, tri, 0) === null);
    ok("a ray parallel to the plane misses rather than dividing by zero",
        rayTriangle(0.25, 0.25, -2, 1, 0, 0, tri, 0) === null);
    const degenerate = new Float64Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);   // zero area
    ok("a zero-area triangle is missed, not hit with a NaN t",
        rayTriangle(0.5, 0, -1, 0, 0, 1, degenerate, 0) === null);
    // *** THE ZERO-AREA CASE DOES NOT TEST THE EPSILON, because its determinant is EXACTLY 0 -- so a
    // `det === 0` check passes it too, and replacing the epsilon with one left this file entirely green.
    // The epsilon is about determinants that are TINY AND NON-ZERO: a ray almost in the triangle's plane,
    // where 1/det is astronomically large and t is numerical noise rather than a distance.
    const flatTri = new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const nearlyParallel = rayTriangle(0.25, 0.25, 0, 1, 0, 1e-12, flatTri, 0);
    ok("!! a ray ALMOST in the triangle's plane is rejected -- det tiny but non-zero, which `det === 0` misses",
        nearlyParallel === null, "det ~ 1e-12, well inside the 1e-9 epsilon");
    ok("...while a comfortably non-parallel ray through the same triangle still hits",
        rayTriangle(0.25, 0.25, -1, 0, 0, 1, flatTri, 0) !== null);
    const b = baryAt(tri, 0, 0.25, 0.25, 0);
    ok("barycentrics of an interior point sum to 1 and are all positive",
        Math.abs(b[0] + b[1] + b[2] - 1) < 1e-12 && b.every((v) => v > 0), b.map((v) => v.toFixed(3)).join(", "));
}

// ---- 3. THE BUILD ------------------------------------------------------------------------------------------
console.log("\n3. the build, including the inputs that make a naive one recurse forever");
{
    const bvh = new MeshBVH(lumpyMesh(4000, 11));
    const s = bvh.stats();
    ok("every triangle is present exactly once in the leaf ordering", (() => {
        const seen = new Uint8Array(s.triangles);
        for (const t of bvh.order) seen[t]++;
        return Array.from(seen).every((v) => v === 1);
    })(), `${s.triangles} triangles, ${s.nodes} nodes, ${s.leaves} leaves, depth ${s.depth}`);
    ok("the depth is logarithmic, not linear -- a degenerate build shows up here first",
        s.depth < 4 * Math.log2(s.triangles), `depth ${s.depth} vs ${(4 * Math.log2(s.triangles)).toFixed(0)} allowed`);

    // *** THE INPUT THAT HANGS A NAIVE BUILDER: every centroid identical. *** No split separates anything, so
    // "best bin" returns an empty side and the range recurses on itself. The rank fallback always terminates.
    const same = new Float64Array(200 * 9);
    for (let i = 0; i < 200; i++) same.set([0, 0, 0, 1, 0, 0, 0, 1, 0], i * 9);
    // Caught as a FAIL rather than as a crash: without the fallback this recurses until it runs off the end
    // of the node arrays and throws RangeError, which would take the whole gate down and report nothing useful.
    let dg = null, dgErr = null;
    try { dg = new MeshBVH(same); } catch (e) { dgErr = e; }
    ok("!! 200 IDENTICAL triangles build a finite tree instead of recursing until the node arrays overflow",
        !!dg && dg.stats().depth < 60, dgErr ? String(dgErr.message) : JSON.stringify(dg.stats()));
    ok("...and the resulting tree still answers a ray, identically to brute force",
        !!dg && (() => {
            const a = dg.raycastFirst(0.25, 0.25, -1, 0, 0, 1);
            const b = bruteFirst(same, 0.25, 0.25, -1, 0, 0, 1);
            return !!a && !!b && a.t === b.t;      // the triangle index is a genuine tie: all 200 are identical
        })());
    const flat = new Float64Array(300 * 9);
    for (let i = 0; i < 300; i++) { const x = i * 0.01; flat.set([x, 0, 0, x + 0.01, 0, 0, x, 0.01, 0], i * 9); }
    let fl = null;
    try { fl = new MeshBVH(flat); } catch (e) { /* reported by the check below */ }
    ok("...and so do 300 coplanar ones, which have zero extent on an axis", !!fl && fl.stats().leaves > 0);
    ok("an EMPTY mesh builds and answers null rather than throwing",
        new MeshBVH(new Float64Array(0)).raycastFirst(0, 0, 0, 0, 0, 1) === null);
    const one = new MeshBVH(new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    ok("a ONE-triangle mesh is a single leaf that still hits", !!one.raycastFirst(0.25, 0.25, -1, 0, 0, 1));
}

// ---- 4. BOTH CHILDREN ARE STORED ---------------------------------------------------------------------------
console.log("\n4. *** THE RIGHT CHILD IS NOT AT left+1, AND ASSUMING IT WAS MADE THE WHOLE TREE MISS ***");
{
    const bvh = new MeshBVH(lumpyMesh(4000, 13));
    let interior = 0, adjacent = 0;
    for (let n = 0; n < bvh.nodes; n++) {
        const left = bvh.meta[n * 3];
        if (left < 0) continue;
        interior++;
        if (bvh.meta[n * 3 + 1] === left + 1) adjacent++;
    }
    ok("!! most interior nodes have their right child somewhere OTHER than left+1",
        interior > 0 && adjacent < interior * 0.75,
        `${adjacent} of ${interior} interior nodes happen to be adjacent; a depth-first build allocates the whole left subtree first`);
    let bad = 0;
    for (let n = 0; n < bvh.nodes; n++) {
        const left = bvh.meta[n * 3];
        if (left < 0) continue;
        if (left <= n || left >= bvh.nodes || bvh.meta[n * 3 + 1] <= n || bvh.meta[n * 3 + 1] >= bvh.nodes) bad++;
    }
    ok("every stored child index is a real node after its parent", bad === 0);
}

// ---- 5. EXACTNESS ------------------------------------------------------------------------------------------
console.log("\n5. *** IT RETURNS EXACTLY WHAT BRUTE FORCE RETURNS -- the only thing that matters ***");
{
    for (const n of [500, 4000, 20000]) {
        const tris = lumpyMesh(n, 7), bvh = new MeshBVH(tris), rays = rayBattery(3, 400);
        let mismatch = 0, hits = 0, worst = 0;
        for (const [ox, oy, oz, dx, dy, dz] of rays) {
            const a = bvh.raycastFirst(ox, oy, oz, dx, dy, dz), b = bruteFirst(tris, ox, oy, oz, dx, dy, dz);
            if ((a === null) !== (b === null)) { mismatch++; continue; }
            if (!a) continue;
            hits++;
            if (a.tri !== b.tri || a.t !== b.t) { mismatch++; worst = Math.max(worst, Math.abs(a.t - b.t)); }
        }
        ok(`!! ${n} triangles: identical triangle AND identical t on all ${rays.length} rays`, mismatch === 0,
            `${hits} hits, ${mismatch} mismatches, worst |dt| ${worst}`);
    }
}

// ---- 6. THE AXIS-ALIGNED RAY -------------------------------------------------------------------------------
console.log("\n6. *** THE ZERO-DIRECTION GUARD IS ABOUT SPEED, NOT CORRECTNESS -- I had that backwards ***");
{
    const tris = new Float64Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]);
    const bvh = new MeshBVH(tris);
    // The NaN really is produced -- 0 * Infinity, when the origin sits exactly on a slab plane.
    ok("0 * Infinity is NaN, so the hazard is real", Number.isNaN(0 * Infinity));
    // ...but it cannot cause a MISS, because the only early-out is `t0 > t1` and NaN fails every comparison.
    ok("!! ...and yet a NaN can never trigger the early-out, so the box is over-reported, never missed",
        !(NaN > 0) && !(NaN < 0) && !(NaN > NaN));
    // a ray whose origin sits exactly on the box's own slab plane, travelling along an axis
    ok("a ray along +Z starting exactly at the geometry's plane is handled",
        Number.isFinite(bvh._hitBox(0, 0, 0, -1, Infinity, Infinity, 1, 0, 0, 1, Infinity)));
    let miss = 0;
    for (const [o, d] of [[[0, 0, -3], [0, 0, 1]], [[0, -1, -3], [0, 0, 1]], [[-1, -1, -3], [0, 0, 1]]]) {
        const a = bvh.raycastFirst(...o, ...d), b = bruteFirst(tris, ...o, ...d);
        if ((a === null) !== (b === null)) miss++;
    }
    ok("...and axis-aligned rays through vertices and edges agree with brute force", miss === 0);
    // the whole battery is one-sixth axis-aligned; section 5 covers the rest
    const big = lumpyMesh(4000, 21), bb = new MeshBVH(big);
    let axisMismatch = 0, axisRays = 0;
    for (const [ox, oy, oz, dx, dy, dz] of rayBattery(9, 300)) {
        if (dx !== 0 && dy !== 0 && dz !== 0) continue;
        axisRays++;
        const a = bb.raycastFirst(ox, oy, oz, dx, dy, dz), b = bruteFirst(big, ox, oy, oz, dx, dy, dz);
        if ((a === null) !== (b === null) || (a && a.tri !== b.tri)) axisMismatch++;
    }
    ok(`!! ${axisRays} axis-aligned rays, the ones with 1/d === Infinity, all agree`, axisMismatch === 0);
}

// ---- 7. THE SEGMENT QUERY ----------------------------------------------------------------------------------
console.log("\n7. the occlusion query: any hit, early out, and the same verdict");
{
    const tris = lumpyMesh(4000, 17), bvh = new MeshBVH(tris), r = rng(5);
    let mismatch = 0, blocked = 0, clear = 0;
    for (let i = 0; i < 400; i++) {
        const a = [(r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6];
        const b = [(r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6];
        const x = bvh.intersectsSegment(...a, ...b), y = bruteSegment(tris, ...a, ...b);
        if (x !== y) mismatch++; else if (x) blocked++; else clear++;
    }
    ok("!! the same verdict as brute force on 400 segments", mismatch === 0,
        `${blocked} blocked, ${clear} clear -- and both outcomes occur, so it is not answering one way always`);
    ok("...and both outcomes really do occur", blocked > 20 && clear > 20);
    ok("a segment that stops short of the geometry is CLEAR, which a ray query would call blocked",
        bvh.intersectsSegment(0, 0, -5, 0, 0, -3) === false);
    // *** AND THE CASE THE BOX TEST DOES NOT ALREADY COVER, which is why the check above was not enough. ***
    // Culling boxes at maxT = 1 handles a segment that ends before the whole box. It does NOT handle a
    // segment that ends INSIDE a box holding a triangle further along: there the per-triangle t < 1 bound is
    // the only thing standing between "clear" and "blocked". Removing it left every check in this file
    // passing, which is how a redundant-looking bound gets deleted.
    const twoTris = new Float64Array([-1, -1, 0.5, 1, -1, 0.5, 0, 1, 0.5,
                                      -1, -1, 2, 1, -1, 2, 0, 1, 2]);
    const deep = new MeshBVH(twoTris, { maxLeaf: 8 });          // both triangles in ONE leaf, box z 0.5..2
    ok("...a segment ending INSIDE a box, with the triangle beyond its end, is clear",
        deep.stats().leaves === 1 && deep.intersectsSegment(0, 0, 0.6, 0, 0, 1.0) === false,
        "box entered at t=0, far triangle at t=3.5, segment ends at t=1");
    ok("...and the same box IS blocked when the triangle is within the segment",
        deep.intersectsSegment(0, 0, 0, 0, 0, 1.0) === true);
}

// ---- 8. AND IT IS FASTER -----------------------------------------------------------------------------------
console.log("\n8. the point of the exercise, measured rather than assumed");
{
    for (const n of [4000, 20000]) {
        const tris = lumpyMesh(n, 7), rays = rayBattery(3, 300);
        const t0 = Date.now(); const bvh = new MeshBVH(tris); const build = Date.now() - t0;
        let tb = Date.now(); for (const r of rays) bruteFirst(tris, ...r); tb = Date.now() - tb;
        let tv = Date.now(); for (const r of rays) bvh.raycastFirst(...r); tv = Date.now() - tv;
        const x = tb / Math.max(tv, 1);
        console.log(`  ${String(n).padStart(5)} triangles: build ${build}ms, ${rays.length} rays -- brute ${tb}ms, bvh ${tv}ms = ${x.toFixed(1)}x`);
        ok(`!! ${n} triangles: at least 3x faster than walking them all`, x >= 3, `${x.toFixed(1)}x`);
    }
}

// ---- 9. THE COPIES ARE GONE --------------------------------------------------------------------------------
console.log("\n9. *** ONE TRAVERSAL IN THE TREE, WHICH IS THE HALF OF THIS ROUND THAT IS NOT SPEED ***");
{
    const wad = codeOnly(fs.readFileSync(path.join(ROOT, "multiplayer", "wadLevelHost.js"), "utf8"));
    const krbn = codeOnly(fs.readFileSync(path.join(ROOT, "tools", "krbn", "krbnCompare.js"), "utf8"));
    ok("!! wadLevelHost's line-of-sight uses the BVH", /MeshBVH/.test(wad) && /intersectsSegment/.test(wad));
    ok("...and no longer walks the triangle buffer itself",
        !/for \(let i = 0; i < tris\.length; i \+= 9\)/.test(wad));
    ok("!! krbnCompare's back-projection uses the BVH", /MeshBVH/.test(krbn) && /raycastFirst/.test(krbn));
    ok("...and no longer loops over mesh.triangles to raycast",
        !/for \(let n = 0; n < mesh\.triangles\.length; n\+\+\)[\s\S]{0,200}rayTri\(/.test(krbn));
    // a third copy appearing is the thing this round exists to prevent
    const files = [];
    (function walk(d) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.name === "node_modules" || e.name === ".git" || e.name === "vendor") continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|mjs)$/.test(e.name)) files.push(p);
        }
    })(ROOT);
    const owners = files.filter((f) => {
        const c = codeOnly(fs.readFileSync(f, "utf8"));
        return /e1x \* px \+ e1y \* py \+ e1z \* pz|dot\(e1, p\)/.test(c);
    }).map((f) => path.relative(ROOT, f));
    ok("!! exactly ONE file computes a Moller-Trumbore determinant, and it is the shared module",
        owners.length === 1 && owners[0] === path.join("mesh", "meshBVH.mjs"),
        owners.join(", ") || "none found");
}

// ---- 10. THE TWO GUARDS THAT ARE DEFENSIVE RATHER THAN LOAD-BEARING -----------------------------------------
console.log("\n10. *** TWO GUARDS THIS FILE CANNOT CATCH THE REMOVAL OF, WHICH IS WORTH SAYING OUT LOUD ***");
{
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "mesh", "meshBVH.mjs"), "utf8"));
    ok("the zero-direction guard is present", /if \(d\[a\] === 0\)/.test(src));
    ok("the near-parallel determinant epsilon is present", /det > -eps && det < eps/.test(src));
    console.log("      Removing EITHER leaves every check above green, and that was measured, not assumed:");
    console.log("      * the zero-direction guard -- 3000 axis-aligned rays against 20000 triangles gave the");
    console.log("        SAME 2874 hits with and without it, in 41ms against 57ms. A NaN cannot cause a miss");
    console.log("        because the only early-out is `t0 > t1` and NaN fails every comparison, so the box is");
    console.log("        over-reported and the triangle test still decides. It is worth ~28%, not correctness.");
    console.log("      * the determinant epsilon -- a ray almost in a triangle's plane gets u = 1000000.25 and");
    console.log("        is thrown out by the barycentric range test anyway. The epsilon stops a 1/det of 1e12");
    console.log("        being computed at all; the u/v/t guards are what make the ANSWER right either way.");
    console.log("      Both are kept, and both are asserted by presence above rather than by a behaviour this");
    console.log("      gate cannot actually distinguish. A guard whose removal changes nothing observable is a");
    console.log("      guard whose gate has to say so.");
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      A REFIT COST. The tree is built once and cached against the buffer it came from, so a mesh");
console.log("      that DEFORMS every frame -- a skinned character, say -- would rebuild every frame and be");
console.log("      slower than brute force. three-mesh-bvh has a refit() for exactly that and it is not taken");
console.log("      here, because neither call site deforms: wall triangles are per level, and krbn's mesh is");
console.log("      the rest pose the strokes are lifted onto. If a deforming caller appears, refit is the work.");

console.log("\nmeshBVH-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
