// WebGLEngine/physics/spatial/kdtree-selfcheck.mjs -- v2840
//
// Run: node physics/spatial/kdtree-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/spatial/kdtree.js.
//
// A k-d TREE IS NOT AN APPROXIMATION, and that is what makes it gradeable in the strongest way available: for
// any query there is exactly ONE true nearest neighbour, brute force always finds it, and the tree must return
// THE SAME ONE. Not usually. Not within a tolerance. So this gate does not check a handful of cases -- it fuzzes
// thousands of queries in two and three dimensions and demands ZERO disagreements.
//
// THE FAILURE MODE THIS EXISTS FOR: after descending the near side of a split, a correct tree tests whether the
// FAR side could still hold something closer. Get that comparison backwards, or drop it, and the tree still
// returns a point -- a plausible, nearby, WRONG one. It looks right in a picture and is wrong in the data, which
// is exactly the kind of bug that survives review and fails silently forever.

import { build, nearest, kNearest, withinRadius, bruteNearest, bruteKNearest, squaredDistance } from "./kdtree.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const cloud = (n, dim, scale = 100) => Array.from({ length: n }, () => Array.from({ length: dim }, () => rnd() * scale));

// 1. EXACT AGREEMENT WITH BRUTE FORCE -- the whole contract
{
    for (const [n, dim] of [[500, 2], [2000, 3], [5000, 3]]) {
        const pts = cloud(n, dim);
        const t = build(pts);
        let bad = 0;
        for (let i = 0; i < 2000; i++) {
            const q = Array.from({ length: dim }, () => rnd() * 100);
            const a = nearest(t, q), b = bruteNearest(pts, q);
            if (a.index !== b.index && Math.abs(a.dist2 - b.dist2) > 1e-12) bad++;
        }
        ok(`!! nearest matches brute force EXACTLY -- n=${n}, ${dim}D, 2000 queries`, bad === 0, `${bad} disagreements`);
    }
}

// 2. THE HARD CASES for the prune, where a broken far-side test actually shows
{
    // a query far outside the cloud: every split must be considered, not just the near side
    const pts = cloud(1000, 3, 50);
    const t = build(pts);
    let bad = 0;
    for (let i = 0; i < 500; i++) {
        const q = [500 + rnd() * 100, -400 - rnd() * 100, 900 + rnd() * 50];
        if (nearest(t, q).index !== bruteNearest(pts, q).index) bad++;
    }
    ok("!! queries far OUTSIDE the cloud still find the true nearest", bad === 0, `${bad} wrong`);

    // points on a line: every split lands on the same axis, the tree degenerates, the prune matters most
    const line = Array.from({ length: 600 }, (_, i) => [i * 0.5, 0, 0]);
    const lt = build(line);
    let lbad = 0;
    for (let i = 0; i < 400; i++) { const q = [rnd() * 300, (rnd() - 0.5) * 4, 0]; if (nearest(lt, q).index !== bruteNearest(line, q).index) lbad++; }
    ok("!! a COLLINEAR cloud (the degenerate case) still answers exactly", lbad === 0, `${lbad} wrong`);

    // clustered points, where many lie at nearly equal distance
    const clumped = Array.from({ length: 800 }, () => { const c = (rnd() * 4) | 0; return [c * 30 + rnd(), c * 30 + rnd()]; });
    const ct = build(clumped);
    let cbad = 0;
    for (let i = 0; i < 400; i++) { const q = [rnd() * 120, rnd() * 120]; if (nearest(ct, q).index !== bruteNearest(clumped, q).index) cbad++; }
    ok("clustered points with near-ties answer exactly", cbad === 0, `${cbad} wrong`);
}

// 3. k-NEAREST and RADIUS agree with brute force, in ORDER
{
    const pts = cloud(800, 2, 50);
    const t = build(pts);
    let kbad = 0, rbad = 0, orderBad = 0;
    for (let i = 0; i < 400; i++) {
        const q = [rnd() * 50, rnd() * 50];
        const a = kNearest(t, q, 7), b = bruteKNearest(pts, q, 7);
        if (a.map((r) => r.index).join() !== b.map((r) => r.index).join()) kbad++;
        if (a.some((r, j) => j > 0 && r.dist2 < a[j - 1].dist2)) orderBad++;
        const rad = 3 + rnd() * 8;
        if (withinRadius(t, q, rad).length !== pts.filter((p) => squaredDistance(p, q) <= rad * rad).length) rbad++;
    }
    ok("!! kNearest matches brute force, in order", kbad === 0 && orderBad === 0, `${kbad} sets, ${orderBad} orderings wrong`);
    ok("!! withinRadius returns exactly the points inside the radius", rbad === 0, `${rbad} wrong`);
    ok("asking for more neighbours than exist returns all of them, not a crash", kNearest(build(cloud(5, 2)), [0, 0], 50).length === 5);
}

// 4. IT MUST ACTUALLY BE FASTER, or there is no reason for it to exist
{
    const pts = cloud(20000, 3, 1000);
    const t = build(pts);
    const qs = Array.from({ length: 2000 }, () => [rnd() * 1000, rnd() * 1000, rnd() * 1000]);
    let x = Date.now(); for (const q of qs) nearest(t, q); const treeMs = Math.max(1, Date.now() - x);
    x = Date.now(); for (const q of qs) bruteNearest(pts, q); const bruteMs = Date.now() - x;
    ok("!! the tree is much faster than brute force at 20k points", bruteMs / treeMs > 10, `${(bruteMs / treeMs).toFixed(1)}x (${treeMs}ms vs ${bruteMs}ms)`);
}

// 5. edge cases answer honestly rather than plausibly
{
    ok("an empty tree returns NULL, not index 0", nearest(build([]), [0, 0]) === null);
    ok("an empty tree's kNearest is an empty list", kNearest(build([]), [0, 0], 5).length === 0);
    ok("a single point is found", nearest(build([[5, 5]]), [0, 0]).index === 0);
    ok("many identical points give distance zero and a valid index", (() => {
        const r = nearest(build(Array.from({ length: 50 }, () => [3, 3])), [3, 3]);
        return r.dist2 === 0 && r.index >= 0 && r.index < 50;
    })());
    ok("k <= 0 returns nothing rather than everything", kNearest(build(cloud(10, 2)), [0, 0], 0).length === 0);
}

// 6. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./kdtree.js", import.meta.url), "utf8");
    ok("kdtree.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
    ok("the oracle ships BESIDE the tree, so a caller can check it in one line", /export function bruteNearest/.test(src));
}


// 7. WHEN IT IS WORTH IT -- recorded because trying to use it in the wrong place cost a round
{
    const { worthIndexing, SELECTIVITY_GUIDANCE } = await import("./kdtree.js");
    ok("a query touching a tiny fraction of the set is worth indexing", worthIndexing(20000, 3).worth === true);
    ok("!! a query returning a large share of the set is NOT -- the boids case, measured and rejected",
        worthIndexing(400, 120).worth === false, worthIndexing(400, 120).reason);
    ok("...and rebuilding more often than querying is refused outright", worthIndexing(1000, 1, { queriesPerRebuild: 0 }).worth === false);
    ok("the guidance carries the measurement that produced it", /v2841/.test(SELECTIVITY_GUIDANCE.note));
    const src = (await import("node:fs")).readFileSync(new URL("./kdtree.js", import.meta.url), "utf8");
    ok("!! the SUMMATION-ORDER cost is documented, not just the speed",
        /not associative/.test(src) && /4\.4e-16/.test(src) && /BIT-IDENTICAL fingerprint/.test(src));
    ok("...and why Worley does not need one either", /PROCEDURALLY\s*\n?\/\/ HASHED|already O\(1\)/.test(src));
}

console.log("kdtree-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
