// WebGLEngine/physics/mesh/blastEngine-selfcheck.mjs
//
// Run: node physics/mesh/blastEngine-selfcheck.mjs
//
// BVH-CSG ROUND 13: the gate for physics/mesh/blastEngine.mjs -- meshBoolean behind a flag in the engine -- and for
// its one caller, destructible.html. What it can be wrong about, and the section that would see it:
//   1. THE CONTRACT -- blastWith() returns polygons as blast() does: each with a plane that is its own and a SKIN/CUT
//      tag; every BVH output triangle has provenance; "bsp" is the default; an unknown engine throws.
//   2. THE PAGE'S WORKLOAD, BOTH ENGINES -- destructible.html's own blast parameters (radius 0.2..1.4, jaggedness
//      0..0.9, 4..14 facets, centred on the wall's mid-plane), 20 five-shot chains and 1 thirty-shot one: the same
//      solid to 1e-10 relative, the tag invariant on every polygon, BVH closed raw (the 1e-6 census) and measured
//      at the page's own 1e-9 census, timings printed.
//   3. SETTLE AND AFTER -- the page settles when the shooting stops and lets it start again: tags survive, the
//      solid does not move, and the BVH engine blasts a settled (polygon, not triangle) wall correctly.
//   4. THE PAGE, IN A REAL BROWSER -- the default is BSP, ?csg=bvh selects BVH, blasting and settling raise no page
//      error, the stats name the engine. (Its first run found the page dead: the handler declared `const r` twice.)
//   5. FINISHING (round 14) -- the BVH wall welded and merged shot by shot: closed at the page's 1e-9 census on seeds
//      it was not tuned on and at 1024x scale, a vertex the wall had never moved, untouched polygons passed through as
//      the same objects, every merged polygon convex and tiled exactly by the triangles the next blast reads.
//      Sections 2 and 3 hold the finished wall to the page's census (round 13's raw wall is section 2's control), and
//      the BVH settle -- a merge -- to opening no edge.
//
// SABOTAGE LOG (round 13) -- each applied to the real file, four gates run (THIS / meshCSG-selfcheck /
// meshBoolean-selfcheck / triArrangement-selfcheck), the file restored in a `finally` and md5 verified. Reds on the
// final files, 16 of 16:
//   U1  subtractLocal re-tags the near polygons SKIN (the chain bug)            -> 2 / 2 / 0 / 0
//   U2  far polygons left untagged                                               -> 4 / 2 / 0 / 0
//   U3  snapVertices drops the tag (settle's bug)                                -> 2 / 2 / 0 / 0
//   U4  mergeCoplanar ignores the tag                                            -> 0 / 1 / 0 / 0   (0 everywhere on the
//       first battery: unreachable on the page, where no CUT face lies on a wall plane; meshCSG's by-hand row added)
//   U5  provenance: a B piece names the next blob triangle                       -> 5 / 0 / 9 / 0   (the first battery
//       CRASHED this gate instead of failing it: the adapter now counts an out-of-range `from` as untraced, and
//       meshBoolean-selfcheck section 18 checks `from` geometrically)
//   U5b ...an A piece names the next wall triangle                               -> 6 / 0 / 9 / 0
//   U6  a CUT piece's plane not turned round                                     -> 3 / 0 / 0 / 0
//   U7  a wall piece's plane recomputed, not carried                             -> 4 / 0 / 0 / 0
//   U8  the outside-box shortcut says inside                                     -> 5 / 0 / 26 / 0
//   U9  Earcut's diagonal split off                                              -> 2 / 0 / 0 / 0
//   U10 the sliver path off                                                      -> 1 / 0 / 0 / 1
//   U11 a sliver's side point put on the nearest side, not its own               -> 0 / 0 / 0 / 1   (0 everywhere on the
//       first battery: the page hands a sliver 2 side points in 21 chains, both nearest their own side;
//       triArrangement-selfcheck section 6 added -- 292 of 2,000 wrong at wall scale)
//   U12 the injected-point duplicate test run across sides                       -> 2 / 0 / 0 / 0
//   U13 the page calls CSG.blast itself, bypassing blastWith                     -> 1 / 0 / 0 / 0
//   U14 the page defaults to bvh                                                 -> 1 / 0 / 0 / 0
//   U15 the module's default is bvh                                              -> 2 / 0 / 0 / 0
//
// SABOTAGE LOG (round 14) -- blastEngine.mjs and destructible.html, this gate (the only one that imports the adapter),
// each applied to the real file, restored in a `finally`, md5 verified. 15 of 15 red on the final files:
//   F1  finishing off by default                                  -> 7     F9  merge across source polygons       -> 6
//   F2  weld off                                                  -> 6     F10 the next blast re-fans merged ones -> 6
//   F3  weld at 4 snaps (the first try)                           -> 2     F11 kept polygons left untagged        -> 2
//   F4  weld not scaled with the operands                         -> 1     F12 kept when ANY triangle came whole  -> 7
//   F5  an old vertex may move onto a new one                     -> 1     F13 the BVH settle is meshCSG.settle   -> 2
//   F6  two old vertices may join                                 -> 1     F14 the page settles with meshCSG      -> 1
//   F7  the merge ignores convexity                               -> 1     F15 a merge drops the other's triangles -> 7
//   F16 a triangle the weld collapsed is kept                     -> 1
// F5 and F6 were 0 red on the first battery: over 91 chains no old vertex comes within the weld of a new one, so no
// workload builds the case; section 1's by-hand rows were added for them. F16 CRASHED this gate (a two-cornered
// "triangle" reached the next blast's buffer in section 2) and now fails by name in section 1 first. F8 -- the merge
// allowing a ring or figure of eight -- was 0 red because the test it sabotaged never fired: two convex polygons with
// disjoint interiors that share an edge share nothing else. The test was removed, and F8 with it.
"use strict";

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as M from "./meshCSG.mjs";
import { blastWith, blastBVH, settleWith, finishPieces, BLAST_ENGINES, DEFAULT_BLAST_ENGINE, FINISH_WELD_SNAPS } from "./blastEngine.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../../tools/ship/playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("blastEngine-selfcheck -- meshBoolean behind a flag, on the page's own workload\n");

const HALF = [4, 3, 0.35];                                    // destructible.html's wall
const MEASURED_ZERO = 18, MEASURED_PAGE_UN = 52;              // section 2's raw control (finish:false), measured on the final files
// a finished BVH wall's vertex may sit up to the weld tolerance off its polygon's plane (the weld moves a seam point
// within it); the BSP's stay within 1e-9
const WELD = FINISH_WELD_SNAPS * 1e-9, tolOf = (engine) => (engine === "bvh" ? WELD : 1e-9);
const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
// destructible.html's blast, with its Math.random replaced by a seeded stream
function pageBlasts(seed, n) {
    const r = rng(seed), out = [];
    for (let k = 0; k < n; k++) {
        const rad = 0.2 + r() * 1.2, rough = r() * 0.9, sub = 4 + Math.floor(r() * 11);
        const c = [(r() * 2 - 1) * (HALF[0] - rad), (r() * 2 - 1) * (HALF[1] - rad), 0];
        out.push(M.jaggedBlob(c, rad, sub, k + 1, { rough, floor: 1 - rough }));
    }
    return out;
}
// destructible.html's census, verbatim in substance: 1e-9 quantum, an edge unmatched unless used once each way
function pageCensus(wall) {
    const E = new Map(), Q = 1e-9, key = (v) => Math.round(v[0] / Q) + "," + Math.round(v[1] / Q) + "," + Math.round(v[2] / Q);
    for (const p of wall) for (let i = 0; i < p.vs.length; i++) {
        const a = p.vs[i], b = p.vs[(i + 1) % p.vs.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-12) continue;
        const k = key(a) + "|" + key(b); E.set(k, (E.get(k) || 0) + 1);
    }
    let un = 0;
    for (const [k] of E) { const [a, b] = k.split("|"); if ((E.get(b + "|" + a) || 0) !== 1 || E.get(k) !== 1) un++; }
    return un;
}
// the arc's census: a CRACK is an edge whose two directions disagree at the key (1e-6 unless said)
function cracks(wall, Q = 1e-6) {
    const E = new Map(), key = (v) => Math.round(v[0] / Q) + "," + Math.round(v[1] / Q) + "," + Math.round(v[2] / Q);
    for (const p of wall) for (let i = 0; i < p.vs.length; i++) {
        const a = key(p.vs[i]), b = key(p.vs[(i + 1) % p.vs.length]);
        if (a !== b) E.set(a + "|" + b, (E.get(a + "|" + b) || 0) + 1);
    }
    let c = 0;
    for (const [e, n] of E) { const [a, b] = e.split("|"); if ((E.get(b + "|" + a) || 0) !== n) c++; }
    return c;
}
const wallPlanes = M.boxPolys([0, 0, 0], HALF).map((p) => p.pl);
const dist = (p, pl) => Math.max(...p.vs.map((v) => Math.abs(v[0] * pl.n[0] + v[1] * pl.n[1] + v[2] * pl.n[2] - pl.w)));
// every SKIN polygon on the wall's planes, every CUT one on a blob's and off the wall's, every polygon on its own pl
function tagBad(wall, blobs, tol = 1e-9) {
    // a CUT polygon's plane IS a blob polygon's plane (turned round), carried, not recomputed -- so look blob planes up
    // by w, both signs, and then test the polygon's vertices against each candidate
    const byW = new Map();
    for (const q of blobs.flat()) for (const w of [q.pl.w, -q.pl.w]) { if (!byW.has(w)) byW.set(w, []); byW.get(w).push(q.pl); }
    let bad = 0, worstOwn = 0, degenerate = 0;
    for (const p of wall) {
        const own = dist(p, p.pl); worstOwn = Math.max(worstOwn, own);
        if (own > tol) bad++;
        // ...and FACING the way its plane says: distance alone cannot see a plane that was not turned round
        let nx = 0, ny = 0, nz = 0;
        for (let i = 1; i + 1 < p.vs.length; i++) {
            const a = p.vs[0], b = p.vs[i], c = p.vs[i + 1];
            const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            nx += u[1] * w[2] - u[2] * w[1]; ny += u[2] * w[0] - u[0] * w[2]; nz += u[0] * w[1] - u[1] * w[0];
        }
        // (a polygon of near-zero area -- twice its area under 1e-10 -- has no orientation to speak of: its winding is
        // rounding. Counted, not failed: one CUT triangle of area 3e-12 on section 3's settled walls faced backwards.)
        if (Math.hypot(nx, ny, nz) < 1e-10) degenerate++;
        else if (nx * p.pl.n[0] + ny * p.pl.n[1] + nz * p.pl.n[2] <= 0) bad++;
        if (p.src === M.SKIN) { if (!wallPlanes.some((pl) => dist(p, pl) < tol)) bad++; }
        else if (p.src === M.CUT) { if (!(byW.get(p.pl.w) || []).some((pl) => dist(p, pl) < tol) || wallPlanes.some((pl) => dist(p, pl) < tol)) bad++; }
        else bad++;
    }
    return { bad, worstOwn, degenerate };
}
const run = (engine, blobs, wall = M.boxPolys([0, 0, 0], HALF), opts = {}) => {
    let ms = 0, fb = 0, unknown = 0, worstShot = 0;
    for (const b of blobs) {
        const r = blastWith(engine, wall, b, opts); wall = r.polys; ms += r.stats.ms; worstShot = Math.max(worstShot, r.stats.ms);
        fb += r.stats.fallbackTris || 0; unknown += r.stats.unknown || 0;
    }
    return { wall, ms, fb, unknown, worstShot };
};

console.log("1. *** THE CONTRACT: blast()'s POLYGONS, PLANES AND TAGS ***");
{
    ok("the engines are \"bsp\" and \"bvh\", and \"bsp\" is the default -- the flag is off unless asked for",
        BLAST_ENGINES.join() === "bsp,bvh" && DEFAULT_BLAST_ENGINE === "bsp");
    let threw = false;
    try { blastWith("manifold", M.boxPolys([0, 0, 0], HALF), pageBlasts(1, 1)[0]); } catch { threw = true; }
    ok("an unknown engine throws rather than quietly using one", threw);
    const blobs = pageBlasts(3, 3);
    for (const engine of BLAST_ENGINES) {
        const r = run(engine, blobs), t = tagBad(r.wall, blobs, tolOf(engine));
        const shape = r.wall.every((p) => Array.isArray(p.vs) && p.vs.length >= 3 && p.pl && p.pl.n && typeof p.pl.w === "number");
        ok("!! " + engine + ": every polygon has vs, its own plane (within " + tolOf(engine) + ", facing its winding) and a tag that says where it came from",
            shape && t.bad === 0, r.wall.length + " polygons, " + t.bad + " astray, worst distance from its own plane " + t.worstOwn.toExponential(1));
    }
    const b1 = blastBVH(M.boxPolys([0, 0, 0], HALF), blobs[0], { finish: false });
    ok("!! bvh: every output triangle knows the input polygon it is a piece of (meshBoolean's `from`, round 13)",
        b1.stats.unknown === 0 && b1.polys.length === b1.stats.triangles, b1.stats.triangles + " triangles, " + b1.stats.unknown + " without provenance");
    // a piece of the wall shares its source polygon's plane OBJECT, as the BSP's splitPolygon does
    const wall0 = M.boxPolys([0, 0, 0], HALF), b2 = blastBVH(wall0, blobs[0]);
    ok("   a piece of the wall carries its source polygon's plane itself, not a recomputed one (settle groups by plane)",
        b2.polys.filter((p) => p.src === M.SKIN).every((p) => wall0.some((q) => q.pl === p.pl)));
}

{
    // finishPieces by hand (round 14): what its weld must never do, on cases the page's workload never builds -- over
    // 91 chains no old vertex came within the weld of a new one at all. Placed before section 2, which a broken weld
    // can crash before section 5 runs.
    const pl = { n: [0, 0, 1], w: 0 }, tri = (vs, oldCorner) => ({ vs, pl, src: M.SKIN, oldCorner });
    const has = (polys, v) => polys.some((p) => p.vs.some((u) => u[0] === v[0] && u[1] === v[1] && u[2] === v[2]));
    // a new vertex 3e-9 from an old one, and lexicographically SMALLER -- the representative is still the old one
    const o = [0, 0, 0], n = [-3e-9, 0, 0];
    const r1 = finishPieces([tri([o, [1, 0, 0], [0, 1, 0]], [true, true, true]), tri([n, [0, -1, 0], [1, 0, 0]], [false, false, true])], { merge: false });
    ok("   by hand: a new vertex welds onto an old one, never the old onto the new (the old may be a corner of a polygon kept whole)",
        has(r1.polys, o) && !has(r1.polys, n) && r1.stats.welded === 1, "old kept " + has(r1.polys, o) + ", new gone " + !has(r1.polys, n));
    // two old vertices 2e-9 apart: an earlier shot left them apart, and they stay so
    const o2 = [2e-9, 0, 0];
    const r2 = finishPieces([tri([o, [1, 0, 0], [0, 1, 0]], [true, true, true]), tri([o2, [0, -1, 0], [1, 0, 0]], [true, true, true])], { merge: false });
    ok("   by hand: two vertices the wall already had are never joined, however close", has(r2.polys, o) && has(r2.polys, o2) && r2.stats.refused === 1,
        "both kept " + (has(r2.polys, o) && has(r2.polys, o2)) + ", refused " + r2.stats.refused);
    // a triangle with a 3e-9 edge collapses with its vertices, and goes -- a two-cornered "triangle" would reach the
    // next blast's buffer
    const r3 = finishPieces([tri([[0, 0, 0], [1, 0, 0], [1, 3e-9, 0]], [false, false, false]), tri([[0, 0, 0], [1, 3e-9, 0], [0, 1, 0]], [false, false, false])], { merge: false });
    const short = r3.polys.filter((p) => new Set(p.vs.map(String)).size < 3 || (p.tris || []).some((t) => new Set(t.map(String)).size < 3));
    ok("   by hand: a triangle the weld collapses is dropped; no polygon or carried triangle is left with fewer than three corners",
        r3.stats.dropped === 1 && r3.polys.length === 1 && short.length === 0, r3.polys.length + " left, " + r3.stats.dropped + " dropped, " + short.length + " short");
}

console.log("\n2. *** THE PAGE'S WORKLOAD, BOTH ENGINES ***");
{
    let worstRel = 0, bad = 0, crackAll = 0, pageUn = 0, fb = 0, unknown = 0, runs = 0;
    let rawCrack7 = 0, rawUn = 0, rawZero = 0, rawPolys = 0;
    const ms = { bsp: 0, bvh: 0, raw: 0 }, polys = { bsp: 0, bvh: 0 }, bspUn = { n: 0 }, degen = { bsp: 0, bvh: 0 };
    const chains = [];
    for (let seed = 1; seed <= 20; seed++) chains.push(pageBlasts(seed, 5));
    chains.push(pageBlasts(107, 30));   // the chain that found round 13's three arrangement defects
    for (const blobs of chains) {
        const a = run("bsp", blobs), b = run("bvh", blobs), raw = run("bvh", blobs, undefined, { finish: false });
        const va = M.volume(a.wall), vb = M.volume(b.wall);
        worstRel = Math.max(worstRel, Math.abs(va - vb) / va);
        const ta = tagBad(a.wall, blobs), tb = tagBad(b.wall, blobs, WELD);
        bad += ta.bad + tb.bad; degen.bsp += ta.degenerate; degen.bvh += tb.degenerate;
        crackAll += cracks(b.wall) + cracks(b.wall, 1e-9); pageUn += pageCensus(b.wall);
        bspUn.n += pageCensus(a.wall);
        const ru = pageCensus(raw.wall); rawUn += ru; if (ru === 0) rawZero++; rawCrack7 += cracks(raw.wall, 1e-7); rawPolys += raw.wall.length;
        fb += b.fb + raw.fb; unknown += b.unknown + raw.unknown; runs++;
        ms.bsp += a.ms; ms.bvh += b.ms; ms.raw += raw.ms; polys.bsp += a.wall.length; polys.bvh += b.wall.length;
    }
    ok("!! *** " + runs + " CHAINS (20 of 5 shots, 1 of 30): THE TWO ENGINES CUT THE SAME SOLID TO 1e-10 RELATIVE ***",
        worstRel < 1e-10, "worst relative volume difference " + worstRel.toExponential(2));
    ok("!! every polygon of every final wall, both engines: tagged, on the right planes, on its own plane, facing its way", bad === 0,
        bad + " astray; polygons too small to have an orientation: BSP " + degen.bsp + ", BVH " + degen.bvh);
    ok("!! *** ROUND 14: the BVH engine's wall is CLOSED AT THE PAGE'S OWN 1e-9 CENSUS on every chain -- no settle -- and at the arc's 1e-6, with no fallback and no provenance gap ***",
        pageUn === 0 && crackAll === 0 && fb === 0 && unknown === 0,
        "unmatched (page census) " + pageUn + ", cracks " + crackAll + ", fallback triangles " + fb + ", untraced triangles " + unknown +
        "; the BSP's raw wall: " + bspUn.n + " -- the page's settle exists for that");
    ok("   control, finish:false (round 13's raw triangles): open at the page's census where the seam left two points apart, every one of them under 1e-7",
        rawCrack7 === 0 && rawZero >= MEASURED_ZERO && rawZero < runs && rawUn > 0 && rawUn <= 2.5 * MEASURED_PAGE_UN,
        "unmatched 0 on " + rawZero + " of " + runs + " chains, " + rawUn + " edges in all (measured " + MEASURED_ZERO + " and " + MEASURED_PAGE_UN +
        "), cracks at a 1e-7 key " + rawCrack7);
    report("timings (printed, not asserted): BSP " + ms.bsp + " ms, BVH " + ms.bvh + " ms finished (" + ms.raw + " raw) over " + runs + " chains (" +
        (ms.bsp / ms.bvh).toFixed(2) + "x); polygons at the end, summed: BSP " + polys.bsp + ", BVH " + polys.bvh + " finished (" + rawPolys + " raw triangles)");
}

console.log("\n3. *** SETTLE, AND BLASTING AGAIN AFTER IT ***");
{
    let untagged = 0, moved = 0, bad = 0, un = { bvh: 0, bsp: 0, bvhBefore: 0, bvhByMeshCSG: 0 }, worstRel = 0, degen3 = 0, after = 0;
    for (let seed = 1; seed <= 8; seed++) {
        const blobs = pageBlasts(200 + seed, 8), first = blobs.slice(0, 4), then = blobs.slice(4);
        const res = {};
        for (const engine of BLAST_ENGINES) {
            const a = run(engine, first).wall, v0 = M.volume(a), s = settleWith(engine, a).polys;
            untagged += s.filter((p) => p.src !== M.SKIN && p.src !== M.CUT).length;
            moved = Math.max(moved, Math.abs(M.volume(s) - v0) / v0);
            un[engine] += pageCensus(s);
            if (engine === "bvh") { un.bvhBefore += pageCensus(a); un.bvhByMeshCSG += pageCensus(M.settle(a).polys); }
            const b = run(engine, then, s).wall, tb = tagBad(b, blobs, tolOf(engine));
            bad += tb.bad; degen3 += tb.degenerate; res[engine] = M.volume(b);
            if (engine === "bvh") after += pageCensus(b);
        }
        worstRel = Math.max(worstRel, Math.abs(res.bsp - res.bvh) / res.bsp);
    }
    ok("!! settleWith() on either engine's wall keeps every tag and moves the solid by under 1e-10 relative", untagged === 0 && moved < 1e-10,
        untagged + " untagged, worst move " + moved.toExponential(1));
    ok("!! blasting a SETTLED wall: both engines, same solid to 1e-10, every tag right -- and the BVH wall still closed at the page's census",
        bad === 0 && worstRel < 1e-10 && after === 0,
        bad + " astray (" + degen3 + " too small to have an orientation), worst relative difference " + worstRel.toExponential(2) + ", BVH unmatched after " + after);
    ok("!! the BVH settle only merges, so it opens no edge: page census 0 before it and 0 after it (8 chains of 4)",
        un.bvhBefore === 0 && un.bvh === 0,
        "before " + un.bvhBefore + ", after " + un.bvh + "; control -- meshCSG.settle() on the same walls: " + un.bvhByMeshCSG + " (it drops collinear vertices a neighbour uses); the BSP's settled: " + un.bsp);
}

console.log("\n4. *** THE PAGE, IN A REAL BROWSER ***");
{
    const html = fs.readFileSync(path.join(ENG, "destructible.html"), "utf8");
    ok("destructible.html blasts through blastWith() and no longer calls CSG.blast() itself",
        /blastWith\(engine, wall, blob/.test(html) && !/CSG\.blast\(/.test(html));
    ok("destructible.html settles through settleWith(): the BVH merge only when no BSP blast came since the last settle",
        /settleWith\(bspSince \? "bsp" : "bvh", wall\)/.test(html) && /if \(engine === "bsp"\) bspSince = true/.test(html) && !/CSG\.settle\(/.test(html));
    const { chromium, from: pwFrom } = resolvePlaywright(createRequire(import.meta.url));
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: this section is the one that found the page dead.");
    } else {
        const srv = http.createServer((rq, rs) => {
            const f = path.join(ENG, decodeURIComponent(rq.url.split("?")[0]));
            if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); return rs.end("nf"); }
            const e = path.extname(f);
            rs.writeHead(200, { "Content-Type": e === ".js" || e === ".mjs" ? "text/javascript" : e === ".html" ? "text/html" : "application/octet-stream" });
            rs.end(fs.readFileSync(f));
        });
        await new Promise((r) => srv.listen(0, "127.0.0.1", r));
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
        const seen = {};
        for (const q of ["", "?csg=bvh"]) {
            const pg = await (await b.newContext()).newPage();
            const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message)));
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/destructible.html" + q, { waitUntil: "load" }).catch((e) => errs.push(String(e)));
            await pg.waitForTimeout(400);
            const engine = await pg.inputValue("#engine").catch(() => null);
            for (let i = 0; i < 4; i++) { await pg.click("#hit").catch((e) => errs.push(String(e))); await pg.waitForTimeout(60); }
            const stats = (await pg.textContent("#stats").catch(() => "")) || "";
            await pg.click("#settle").catch((e) => errs.push(String(e))); await pg.waitForTimeout(100);
            const after = (await pg.textContent("#stats").catch(() => "")) || "";
            seen[q || "default"] = { engine, errs, blasts: /blasts\s+4/.test(stats), named: new RegExp("engine\\s+" + engine).test(stats),
                                     settled: /\(settled\)/.test(after), un: +((stats.match(/unmatched\s+(\d+)/) || [])[1] ?? NaN) };
            await pg.close();
        }
        await b.close(); srv.close();
        const d = seen.default, v = seen["?csg=bvh"];
        ok("!! the page loads with no page error and BSP selected; four blasts and a settle run and the stats say so",
            d.errs.length === 0 && d.engine === "bsp" && d.blasts && d.named && d.settled, JSON.stringify(d));
        ok("!! ?csg=bvh selects the BVH engine; four blasts and a settle run with no page error, the stats name it",
            v.errs.length === 0 && v.engine === "bvh" && v.blasts && v.named && v.settled, JSON.stringify(v));
        report("unmatched (page census) after four random blasts, before settle: BSP " + d.un + ", BVH " + v.un);
    }
}

console.log("\n5. *** ROUND 14: FINISHING -- THE WELD AND THE MERGE, ON SEEDS IT WAS NOT TUNED ON ***");
{
    const scaled = (polys, k) => polys.map((p) => ({ vs: p.vs.map((v) => v.map((x) => x * k)), pl: { n: p.pl.n, w: p.pl.w * k } }));
    // (a) seeds never looked at while building it: 30 five-shot chains and 5 of twelve. Raw, the seam leaves points apart.
    let un = 0, rawUn = 0, rawChains = 0, chains = 0, fb = 0, worstMove = 0, ms = 0, finishMs = 0;
    const sets = [];
    for (let seed = 301; seed <= 330; seed++) sets.push(pageBlasts(seed, 5));
    for (let seed = 401; seed <= 405; seed++) sets.push(pageBlasts(seed, 12));
    for (const blobs of sets) {
        let wall = M.boxPolys([0, 0, 0], HALF), raw = wall;
        for (const b of blobs) {
            const r = blastWith("bvh", wall, b); wall = r.polys; fb += r.stats.fallbackTris; ms += r.stats.ms; finishMs += r.stats.finishMs;
            worstMove = Math.max(worstMove, r.stats.maxMove);
            raw = blastWith("bvh", raw, b, { finish: false }).polys;
        }
        un += pageCensus(wall); const ru = pageCensus(raw); rawUn += ru; if (ru) rawChains++; chains++;
    }
    ok("!! " + chains + " chains on fresh seeds (301-330 x5, 401-405 x12): every finished wall closed at the page's 1e-9 census; the raw ones are not",
        un === 0 && fb === 0 && rawUn > 0 && worstMove <= WELD,
        "finished " + un + " unmatched; raw " + rawUn + " on " + rawChains + " chains; fallbacks " + fb + "; largest weld move " + worstMove.toExponential(2) + " (tolerance " + WELD + ")");
    report("finishing took " + finishMs + " ms of " + ms + " (" + (100 * finishMs / ms).toFixed(0) + "%)");
    // (b) the weld's tolerance is a length at the operands' scale: the same chains 1024x larger close the same way
    let unS = 0, worstS = 0;
    for (const blobs of sets.slice(0, 10)) {
        let wall = scaled(M.boxPolys([0, 0, 0], HALF), 1024);
        for (const b of blobs) { const r = blastWith("bvh", wall, scaled(b, 1024)); wall = r.polys; worstS = Math.max(worstS, r.stats.maxMove); }
        const E = new Map(), Q = 1024e-9, key = (v) => Math.round(v[0] / Q) + "," + Math.round(v[1] / Q) + "," + Math.round(v[2] / Q);
        for (const p of wall) for (let i = 0; i < p.vs.length; i++) { const k = key(p.vs[i]) + "|" + key(p.vs[(i + 1) % p.vs.length]); E.set(k, (E.get(k) || 0) + 1); }
        for (const [k, n] of E) { const [x, y] = k.split("|"); if (x !== y && ((E.get(y + "|" + x) || 0) !== 1 || n !== 1)) unS++; }
    }
    ok("!! at 1024x scale (10 of those chains): closed at the census scaled with it, the weld scaled too",
        unS === 0 && worstS > WELD && worstS <= 1024 * WELD, "unmatched " + unS + ", largest weld move " + worstS.toExponential(2) + " (tolerance " + (1024 * WELD).toExponential(2) + ")");
    // (c) what the weld must never do: move a vertex the wall already had -- and what it must keep: an untouched
    // polygon is passed through as the same object
    let keptSame = 0, keptStat = 0, newNearOld = 0;
    for (const blobs of sets.slice(0, 8)) {
        let wall = blastWith("bvh", M.boxPolys([0, 0, 0], HALF), blobs[0]).polys;
        for (const b of blobs.slice(1)) {
            const before = new Set(); for (const p of wall) for (const v of p.vs) before.add(v.join());
            const ins = new Set(wall);
            const r = blastWith("bvh", wall, b);
            keptStat += r.stats.kept; keptSame += r.polys.filter((p) => ins.has(p)).length;
            const out = new Map(); for (const p of r.polys) for (const v of p.vs) out.set(v.join(), v);
            // an output vertex that is new but within the weld of an old one the output still has: the weld missed it,
            // or moved the old one onto it (a polygon kept whole still has the old one, so it stays in the output)
            const olds = [...out.values()].filter((v) => before.has(v.join()));
            const G = new Map(), ck = (v) => v.map((x) => Math.floor(x / WELD)).join();
            for (const v of olds) { const k = ck(v); if (!G.has(k)) G.set(k, []); G.get(k).push(v); }
            for (const v of out.values()) {
                if (before.has(v.join())) continue;
                const c = v.map((x) => Math.floor(x / WELD));
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++)
                    for (const w of G.get([c[0] + dx, c[1] + dy, c[2] + dz].join()) || []) if (Math.hypot(v[0] - w[0], v[1] - w[1], v[2] - w[2]) <= WELD) newNearOld++;
            }
            wall = r.polys;
        }
    }
    ok("!! a vertex the wall already had never moves: no new vertex is left within the weld of one, and every polygon kept whole is the same object",
        newNearOld === 0 && keptSame === keptStat && keptStat > 0,
        "new vertices within the weld of an old one " + newNearOld + "; polygons kept whole " + keptSame + " (stats say " + keptStat + ")");
    // (d) the merged polygons: convex (the fan needs it), and tiled exactly by the triangles they carry -- which are
    // what the next blast reads, so those must close too
    let reflex = 0, areaOff = 0, tileUn = 0, merged = 0, withTris = 0;
    const area = (vs) => { let x = 0, y = 0, z = 0; for (let i = 1; i + 1 < vs.length; i++) { const u = vs[i].map((c, k) => c - vs[0][k]), w = vs[i + 1].map((c, k) => c - vs[0][k]); x += u[1] * w[2] - u[2] * w[1]; y += u[2] * w[0] - u[0] * w[2]; z += u[0] * w[1] - u[1] * w[0]; } return Math.hypot(x, y, z) / 2; };
    for (const blobs of sets.slice(0, 10)) {
        let wall = M.boxPolys([0, 0, 0], HALF);
        for (const b of blobs) { const r = blastWith("bvh", wall, b); wall = r.polys; merged += r.stats.merged; }
        reflex += M.allConvex(wall).reflex;
        const tiles = [];
        for (const p of wall) {
            const ts = p.tris || M.toTriangles([p]);
            if (p.tris) { withTris++; const A = area(p.vs), T = ts.reduce((s2, t) => s2 + area(t), 0); if (Math.abs(A - T) > 1e-12 * Math.max(1, A)) areaOff++; }
            for (const t of ts) tiles.push({ vs: t });
        }
        tileUn += pageCensus(tiles);
    }
    ok("!! every merged polygon is convex and its triangles tile it exactly; the triangles the next blast reads close at the page's census",
        reflex === 0 && areaOff === 0 && tileUn === 0 && merged > 0,
        withTris + " polygons carrying triangles, " + merged + " merges; reflex vertices " + reflex + ", area mismatches " + areaOff + ", unmatched among the triangles " + tileUn);
}

console.log(`\nblastEngine-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: the page draws polygons on a 2D canvas and nothing here looks at the " +
    "picture; the finishing pass closes the seam's near-misses after the fact -- the arrangements still disagree on " +
    "seam points under 8 snaps apart, which snap rounding would fix at the root (backlog: round 16); a finished vertex " +
    "may sit up to the weld tolerance off its polygon's plane; meshBoolean rebuilds the whole wall's BVH every shot " +
    "(the BSP builds its polygon index every shot too); and the flag is the page's alone -- no other caller in the " +
    "engine cuts a mesh today.");
process.exit(fails ? 1 : 0);
