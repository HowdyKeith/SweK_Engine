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
//   6. A SHOT'S COST (round 15) -- the same wall with and without the conformity scan restricted, and what a pin-prick
//      on the 30-shot wall touches: its neighbourhood, not the wall.
//   7. THE SEAM AGREED BEFORE CUTTING (round 16) -- what the finishing weld still finds, by size, with the consensus off
//      as control.
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
//
// SABOTAGE LOG (round 15) -- meshBoolean.mjs, mesh/meshBVH.mjs, blastEngine.mjs; three gates (tools/ship/meshBVH-
// selfcheck / meshBoolean-selfcheck / THIS), each on the real file, restored in a `finally`, md5 verified. 9 of 9 red:
//   G1 conformity: only the split triangles themselves receive points    -> 0 / 2 / 0
//   G2 conformity: the box query open (touching triangles missed)        -> 0 / 4 / 0
//   G3 conformAll ignored (the control runs the restricted scan)         -> 0 / 1 / 0
//   G4 BVH: children given each other's boxes                            -> 7 / 47 / 9
//   G5 BVH: the split sweep reads the prefix one bin short               -> 1 / 3 / 0
//   G6 BVH: one scratch slot for every depth                             -> 7 / 9 / 10
//   G7 BVH: the chosen axis keeps the first axis's range                 -> 6 / 10 / 11
//   G8 adapter: pieces built for kept polygons too                       -> 0 / 0 / 1   (on the first battery THIS
//       gate passed section 1 and then ran away in section 2 -- the wall doubles every shot -- and was stopped; section
//       1's "every surface there once" row was added for it: volume 5.37x off, 2,810 edges open)
//   G9 adapter: every triangle counted as come through whole             -> 0 / 0 / 7
// G1 and G2 are 0 here: on the page's shots no triangle the restricted scan misses would have received a point --
// meshBoolean-selfcheck's flush boxes, where conformity was born, are where they show. G5 changes the tree's shape and
// so the output's bits, never its solid (round 15's measurement), which only the tree comparison sees.
// SABOTAGE LOG (round 19) -- the default flip and the soak's fix; blastEngine.mjs, destructible.html, uvUnwrap.mjs, each on
// the real file, restored and md5 verified. 5 of 5 red (rows red in the gate run / in section 9):
//   V1 DEFAULT_BLAST_ENGINE back to "bsp"                                -> 2 / 0   (sections 1 and 4)
//   V2 the page choosing "bsp" when nothing is asked                     -> 1 / 0   (section 4, the page in Chromium)
//   V3 uvUnwrap.texelDensity's Math.min(...ratios) back                  -> uvUnwrap-selfcheck 1 (it throws RangeError)
//   V4 a piece of the blob tagged SKIN                                   -> 6 / 2
//   V5 finishing off by default                                          -> 12 / 3
//       First run: 8, none in section 9 -- section 7 (round 16) read r.stats.weldMoves, which only finishing makes, and
//       threw before section 9 ran. Section 7 now reads it as NaN when absent and fails by name; the gate runs on.
// SABOTAGE LOG (round 19b) -- triArrangement.mjs's flat-ear repair and meshBoolean.mjs's fold join; three gates (THIS /
// meshBoolean-selfcheck / triArrangement-selfcheck), each on the real file, restored and md5 verified. 5 of 5 red:
//   W1 the flat-ear repair gone (every zero-area ear refused)            -> 1 / 0 / 0   (section 10's session)
//   W2 folds off by default                                              -> 1 / 0 / 0   (section 10's shot 80)
//   W3 any short neighbour joined, doubling back or not                  -> 3 / 5 / 0   (the rotated band too)
//   W4 the repair's split keeping one of its two pieces                  -> 1 / 0 / 0
//       0 red on the first battery: the face's area sum had been taken BEFORE the repair, so a lost piece passed it.
//       It is summed again after the repair now, and the lost piece refuses the face (44 edges, section 10's session).
//   W5 FOLD_SNAPS 1 (no fold is ever long enough)                        -> 1 / 0 / 0
// SABOTAGE LOG (round 18b) -- blastEngine.mjs's booleanBVH, against THIS gate, each on the real file, restored and md5
// verified. 6 of 6 red (rows red, all in section 11):
//   X1 union tags the other operand's pieces CUT                         -> 2
//   X2 the other operand's plane turned round for every op               -> 2
//   X3 no finishing but for subtract                                     -> 2   (the 50 ops; the KNOWN pin, 4 -> 22)
//   X4 opts.otherTag ignored                                             -> 1
//   X5 union ignoring the other operand's own tags (all SKIN)            -> 1
//   X6 no op check in the adapter                                        -> 1
//       0 red on the first battery: meshBoolean throws on an unknown op too, and the row asked only that something
//       threw. It now asks that the adapter's own check threw (first, before it builds two BVHs).
// SABOTAGE LOG (round 19c) -- on the exact arrangement section 13 leans on, each on the real file, restored and md5 verified.
// 4 of 4 red. Rows red in THIS gate / exactArrangement-selfcheck:
//   Z1 strictly-between reversed (segments)                                0 / 1   (no vertex lies exactly on a seam in
//        seed 8's chain: section 13 cannot see it; the arrangement gate's hand-built row does)
//   Z2 Delaunay off by default                                             2 / 1   (section 12's self-crossing, and
//        section 13's seed-8 chain: needles turn over when rounded)
//   Z3 coplanar pairs give no points                                       0 / 3   (no coplanar pair in seed 8's chain)
//   Z4 the flag taking the snapped arrangement                             4 / -   (shot 84's input: 31 open)
// SABOTAGE LOG (round 16f) -- in exactArrangement-selfcheck.mjs's header: 15 sabotages across implicitPoints.mjs,
// exactArrangement.mjs, meshBoolean.mjs and blastEngine.mjs, with this gate's red rows in their column.
// SABOTAGE LOG (round 16g) -- the exact default, its weld, its precondition, the page census and the SNAPPED pins; each on
// the real file, restored and md5 verified. 8 of 8 red. Rows red in meshBoolean-selfcheck / THIS gate:
//   W1 MESH_BOOLEAN_EXACT_DEFAULT false                                    4 / 6   (25(d), 25(e); the page's exact label,
//        section 14's defaults and controls, section 9's seed-8 row)
//   W2 EXACT_FINISH_WELD 0                                                 - / 4   (texel spread 1.4, section 12's
//        self-crossings, section 11's KNOWN intersect chain 68 open, section 9's uvUnwrap row)
//   W3 the precondition skipped                                            1 / 2   (25(e); section 14: 0 declined)
//   W4 the weld chosen by the flag asked for, not the path that ran        - / 1   (a declined shot welded 2.98e-15 at
//        most: section 14's weld row, added for it -- the volume row stayed green)
//   W5 the page census back at a 1e-9 key                                  - / 1   (0 red on the first battery: four
//        unseeded blasts left no points closer than 1e-9. The seeded twenty-blast page row was added; it reads the
//        wall open after 6 of 20)
//   W6 the twin looked up in the edge's own direction                      7 / 9   (every edge "open": every exact
//        run declines)
//   W7 THIS gate's SNAPPED pin dropped                                     - / 9   (the snapped path's own rows: raw
//        control, 1024x weld, pin-prick conformity, sub-snap moves, translate:false, flatEars:false)
//   W8 meshBoolean-selfcheck's SNAPPED pin dropped                        13 / -   (normalize, conformity, rounding,
//        joins, exactSeam rows)
// SABOTAGE LOG (round 16h) -- meshBoolean.mjs's conformNear, each on the real file, restored and md5 verified. 8 of 8 red.
// Rows red in meshBoolean-selfcheck / THIS gate:
//   V1 conforming off unless asked                                         1 / 2   (25(f); section 15's chains: seed 3
//        exact 2 of 10, seed 12 3 of 9)
//   V2 CONFORM_MERGE a rounding (1e-12)                                    0 / 2   (25's near-miss is 1e-14, inside
//        either radius; section 15: seed 3 1 declined, seed 12 2 -- the corner 1.6e-9 off)
//   V3 CONFORM_SPLIT 1e-10                                                 1 / 1   (the T-junction 7e-10 off)
//   V4 edges indexed over the region only (the round's first draft)       0 / 1   (seed 12's rim: 5 openings of its own)
//   V5 `from` not mapped back to the caller's triangles                    1 / 1   (the fin row: 42 output triangles off
//        their source; seed 3's chain 4.1e-3 off the snapped volume)
//   V6 a split that turns a triangle over accepted                         1 / 0   (0 red on the first battery: no such
//        configuration in either gate; 25(g)'s turn-over fixture was added for it)
//   V7 a triangle the merge collapsed kept                                 1 / 0   (0 red on the first battery; 25(g)'s
//        collapse fixture was added: 1 degenerate triangle in the output)
//   V8 the merge applied inside the region only                            0 / 2   (a moved vertex's triangles outside
//        it keep the old bits: seed 3 210 openings of its own, seed 12 324)
// SABOTAGE LOG (round 20) -- in manifoldAudit-selfcheck.mjs's header: 8 sabotages (X1-X8), 8 red; THIS gate red on X1 (1)
// and X8 (6: EXACT_FINISH_WELD 0, three of them section 16's).
"use strict";

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as M from "./meshCSG.mjs";
import { blastWith, blastBVH, booleanBVH, settleWith, finishPieces, BLAST_ENGINES, DEFAULT_BLAST_ENGINE, FINISH_WELD_SNAPS, EXACT_FINISH_WELD } from "./blastEngine.mjs";
import { meshBoolean, MESH_BOOLEAN_EXACT_DEFAULT } from "./meshBoolean.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";
import { exactPair } from "./exactArrangement.mjs";
import { pairOverlap } from "./bvhPairOverlap.mjs";
import { manifoldAudit } from "./manifoldAudit.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../../tools/ship/playwrightResolve.mjs";
import { polysToMesh, unwrap, texelDensity } from "./uvUnwrap.mjs";
import { concreteAt } from "../../render/solidTexture.mjs";
import { rebarDistance } from "../../render/rebar.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
// round 16g: meshBoolean's default arrangement is exact; a row whose subject is the snapped path's own mechanism (the 8e-9
// weld's moves, the seam consensus and its folds, the conformity pass, the flat-ear repair, round 17's translation as a
// necessity) runs it by name
const SNAPPED = { exactArrangement: false };
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
// the page's own census, as destructible.html counts it -- since round 16g at the exact-bits key (it was a 1e-9 key, which
// the exact arrangement's distinct close points read as T-junctions)
function pageCensus(wall) {
    const E = new Map(), key = (v) => v[0] + "," + v[1] + "," + v[2];
    for (const p of wall) for (let i = 0; i < p.vs.length; i++) {
        const a = p.vs[i], b = p.vs[(i + 1) % p.vs.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-12) continue;
        const k = key(a) + "|" + key(b); E.set(k, (E.get(k) || 0) + 1);
    }
    let un = 0;
    for (const [k] of E) { const [a, b] = k.split("|"); if ((E.get(b + "|" + a) || 0) !== 1 || E.get(k) !== 1) un++; }
    return un;
}
// the page's census as it was until round 16g -- a 1e-9 key -- for the rows whose measured numbers were taken with it
function pageCensus9(wall) {
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
    ok("the engines are \"bsp\" and \"bvh\", and \"bvh\" is the default since round 19 (section 9's soak decided it)",
        BLAST_ENGINES.join() === "bsp,bvh" && DEFAULT_BLAST_ENGINE === "bvh");
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
    // and the wall is the solid, once: a polygon kept whole must not ALSO come back as pieces (round 15's adapter
    // decides what it keeps before building any) -- the rows above see planes and tags, which a duplicate has right
    const a3 = run("bsp", blobs).wall, b3 = run("bvh", blobs).wall, rel = Math.abs(M.volume(b3) - M.volume(a3)) / M.volume(a3);
    ok("!! bvh: after the same three blasts, the BSP's solid to 1e-10 and closed at the page's census -- every surface there once",
        rel < 1e-10 && pageCensus(b3) === 0, "relative volume difference " + rel.toExponential(2) + ", unmatched " + pageCensus(b3));
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
        const a = run("bsp", blobs), b = run("bvh", blobs), raw = run("bvh", blobs, undefined, { finish: false, ...SNAPPED });
        const va = M.volume(a.wall), vb = M.volume(b.wall);
        worstRel = Math.max(worstRel, Math.abs(va - vb) / va);
        const ta = tagBad(a.wall, blobs), tb = tagBad(b.wall, blobs, WELD);
        bad += ta.bad + tb.bad; degen.bsp += ta.degenerate; degen.bvh += tb.degenerate;
        crackAll += cracks(b.wall) + cracks(b.wall, 1e-9); pageUn += pageCensus(b.wall);
        bspUn.n += pageCensus(a.wall);
        // measured at round 13 with the 1e-9 key
        const ru = pageCensus9(raw.wall); rawUn += ru; if (ru === 0) rawZero++; rawCrack7 += cracks(raw.wall, 1e-7); rawPolys += raw.wall.length;
        fb += b.fb + raw.fb; unknown += b.unknown + raw.unknown; runs++;
        ms.bsp += a.ms; ms.bvh += b.ms; ms.raw += raw.ms; polys.bsp += a.wall.length; polys.bvh += b.wall.length;
    }
    ok("!! *** " + runs + " CHAINS (20 of 5 shots, 1 of 30): THE TWO ENGINES CUT THE SAME SOLID TO 1e-10 RELATIVE ***",
        worstRel < 1e-10, "worst relative volume difference " + worstRel.toExponential(2));
    ok("!! every polygon of every final wall, both engines: tagged, on the right planes, on its own plane, facing its way", bad === 0,
        bad + " astray; polygons too small to have an orientation: BSP " + degen.bsp + ", BVH " + degen.bvh);
    ok("!! *** ROUND 14: the BVH engine's wall is CLOSED AT THE PAGE'S OWN CENSUS on every chain -- no settle -- and at the arc's 1e-6, with no fallback and no provenance gap ***",
        pageUn === 0 && crackAll === 0 && fb === 0 && unknown === 0,
        "unmatched (page census) " + pageUn + ", cracks " + crackAll + ", fallback triangles " + fb + ", untraced triangles " + unknown +
        "; the BSP's raw wall: " + bspUn.n + " -- the page's settle exists for that");
    ok("   control, finish:false on the snapped path (round 13's raw triangles): open at the page's 1e-9 census of the time where the seam left two points apart, every one of them under 1e-7",
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
        for (const q of ["", "?csg=bsp"]) {
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
                                     settled: /\(settled\)/.test(after), exact: /\(exact,/.test(stats), un: +((stats.match(/unmatched\s+(\d+)/) || [])[1] ?? NaN) };
            await pg.close();
        }
        // round 16g: twenty blasts, Math.random seeded, the census read after every one. The exact arrangement keeps
        // distinct points closer than 1e-9 (in node, every one of 12 such chains has them by shot 18, up to 22 edges at
        // a 1e-9 key), so a census that merged them would read this wall open
        let seeded = { errs: [], open: -1, shots: 0, exact: 0 };
        {
            const pg = await (await b.newContext()).newPage();
            pg.on("pageerror", (e) => seeded.errs.push(String(e.message)));
            await pg.addInitScript(() => { let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; });
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/destructible.html", { waitUntil: "load" }).catch((e) => seeded.errs.push(String(e)));
            await pg.waitForTimeout(300);
            let open = 0;
            for (let i = 0; i < 20; i++) {
                await pg.click("#hit").catch((e) => seeded.errs.push(String(e)));
                const st = (await pg.textContent("#stats").catch(() => "")) || "";
                if (+((st.match(/unmatched\s+(\d+)/) || [])[1] ?? NaN) !== 0) open++;
                if (/\(exact,/.test(st)) seeded.exact++;
                seeded.shots++;
            }
            seeded.open = open;
            await pg.close();
        }
        await b.close(); srv.close();
        const d = seen.default, v = seen["?csg=bsp"];
        ok("!! the page loads with no page error and BVH selected (the default since round 19); four blasts and a settle run and the stats say so -- and that the last shot ran the exact arrangement (round 16g)",
            d.errs.length === 0 && d.engine === "bvh" && d.blasts && d.named && d.settled && d.exact, JSON.stringify(d));
        ok("!! ?csg=bsp selects the BSP engine; four blasts and a settle run with no page error, the stats name it",
            v.errs.length === 0 && v.engine === "bsp" && v.blasts && v.named && v.settled, JSON.stringify(v));
        report("unmatched (page census) after four random blasts, before settle: BVH " + d.un + ", BSP " + v.un);
        ok("!! round 16g: the page's own census (the exact-bits key) reads its default wall closed after four blasts, before settle", d.un === 0, "unmatched " + d.un);
        ok("!! round 16g: twenty seeded blasts through the page -- every shot exact, and the page's census reads the wall closed after every one (a 1e-9 key would not)",
            seeded.errs.length === 0 && seeded.shots === 20 && seeded.exact === 20 && seeded.open === 0, "shots " + seeded.shots + ", exact " + seeded.exact + ", read open after " + seeded.open + ", errors " + seeded.errs.length);
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
    ok("!! " + chains + " chains on fresh seeds (301-330 x5, 401-405 x12): every finished wall closed at the page's census; the raw ones are not",
        un === 0 && fb === 0 && rawUn > 0 && worstMove <= WELD,
        "finished " + un + " unmatched; raw " + rawUn + " on " + rawChains + " chains; fallbacks " + fb + "; largest weld move " + worstMove.toExponential(2) + " (tolerance " + WELD + ")");
    report("finishing took " + finishMs + " ms of " + ms + " (" + (100 * finishMs / ms).toFixed(0) + "%)");
    // (b) the weld's tolerance is a length at the operands' scale: the same chains 1024x larger close the same way
    let unS = 0, worstS = 0;
    for (const blobs of sets.slice(0, 10)) {
        let wall = scaled(M.boxPolys([0, 0, 0], HALF), 1024);
        for (const b of blobs) { const r = blastWith("bvh", wall, scaled(b, 1024), SNAPPED); wall = r.polys; worstS = Math.max(worstS, r.stats.maxMove); }   // the snapped weld's scaling
        unS += pageCensus(wall);                                  // round 16g: at the exact-bits key, scale-free
    }
    ok("!! at 1024x scale (10 of those chains), the snapped path: closed at the page's census (exact bits), the 8e-9 weld scaled too",
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

console.log("\n6. *** ROUND 15: WHAT A SHOT COSTS ON A BIG WALL -- THE SAME OUTPUT, LESS OF THE WALL TOUCHED ***");
{
    // Round 15 measured the fixed cost of a shot -- what a 0.02-radius pin-prick costs on the same wall -- at 36% of the
    // 30-shot chain and 63-80 ms a shot at its end, growing with the wall (~6 us a triangle), and found three things
    // that touched every wall triangle every shot without needing to: meshBoolean's edge-conformity scan (two string
    // keys per edge of every triangle), MeshBVH's build waste (tools/ship/meshBVH-selfcheck holds the new build to the
    // old tree), and the adapter building a piece for every output triangle before discarding those of kept polygons.
    const sig = (polys) => polys.map((p) => p.src + ":" + p.pl.n.join(",") + "," + p.pl.w + ":" + p.vs.map((v) => v.join(",")).join(";") + "|" + (p.tris ? p.tris.map((t) => t.join(";")).join("/") : "")).join("\n");
    const chains = [pageBlasts(107, 30)];
    for (let seed = 1; seed <= 10; seed++) chains.push(pageBlasts(seed, 5));
    let shots = 0, differ = 0, last = null;
    for (const blobs of chains) {
        let a = M.boxPolys([0, 0, 0], HALF), b = a;
        for (const blob of blobs) {
            a = blastWith("bvh", a, blob).polys; b = blastWith("bvh", b, blob, { conformAll: true }).polys; shots++;
            if (sig(a) !== sig(b)) { differ++; b = a; }
        }
        if (!last) last = a;
    }
    ok("!! " + shots + " shots (the 30-shot chain and ten of 5): the conformity scan restricted by the BVH gives the very same wall as scanning every triangle",
        differ === 0, differ + " shots differing");
    // a pin-prick through the 30-shot chain's final wall's front face: what it touches is the blast's neighbourhood,
    // not the wall. (Round 15's fixed-cost measurement put the pin INSIDE the wall, where it cuts no face at all and
    // leaves a cavity -- the cost of a shot that cuts nothing, i.e. the wall's. This one cuts.)
    const pin = M.jaggedBlob([3.7, -2.7, HALF[2]], 0.02, 6, 99, { rough: 0, floor: 1 });
    const r = blastWith("bvh", last, pin, SNAPPED), s = r.stats;          // the conformity scan is the snapped path's
    // (measured: the scan takes 279 triangles, 2.1% -- the triangles the pin splits are big face triangles whose boxes
    // reach across much of the wall, and the BVH returns all that touch them. The bound is 5%, against 100% before.)
    ok("!! a pin-prick on the 30-shot wall (" + s.wallTriangles + " triangles) scans and rebuilds only its neighbourhood: conformity scan under 5% of the wall, pieces under 1%, the rest kept whole",
        s.conformScanned < 0.05 * s.wallTriangles && s.piecesBuilt < 0.01 * s.wallTriangles && s.kept > 0.99 * last.length && s.kept < last.length && s.conformScanned > 0,
        "conformity scan " + s.conformScanned + " triangles, pieces built " + s.piecesBuilt + ", polygons kept " + s.kept + " of " + last.length);
    const t = []; for (let i = 0; i < 5; i++) { const t0 = performance.now(); blastWith("bvh", last, pin); t.push(performance.now() - t0); }
    report("that pin-prick: " + t.sort((x, y) => x - y)[2].toFixed(1) + " ms (median of 5), printed, not asserted. Round 15 measured one inside the wall (no face cut) at 71.5 ms before, 25.7 ms after: conformity 33.4 -> 2.6, BVH build 21.8 -> 12.4, pieces and finishing 6.4 -> ~2");
}

console.log("\n7. *** ROUND 16: WHAT THE FINISHING WELD STILL FINDS, NOW THE ARRANGEMENTS AGREE ON THE SEAM FIRST ***");
{
    // Round 14's weld closes after the fact what the arrangements leave apart. Round 16 makes them agree before cutting
    // where the disagreement was theirs alone: a crossing on a shared edge is one point (triTriIntersect, canonical), and
    // a seam segment no longer than snap is one point for every arrangement (meshBoolean's seamConsensus) -- the ends
    // of 11 of round 14's 20 gaps. The weld's moves by size, on section 2's 21 chains, with the consensus off as control.
    const tally = (opts) => {
        const t = { ulp: 0, subSnap: 0, overSnap: 0 };
        const chains = []; for (let seed = 1; seed <= 20; seed++) chains.push(pageBlasts(seed, 5)); chains.push(pageBlasts(107, 30));
        for (const blobs of chains) { let w = M.boxPolys([0, 0, 0], HALF); for (const b of blobs) { const r = blastWith("bvh", w, b, opts); w = r.polys; for (const k in t) t[k] += (r.stats.weldMoves || {})[k] ?? NaN; } }
        return t;
    };
    const on = tally(SNAPPED), off = tally({ seamConsensus: false, ...SNAPPED });     // the 8e-9 weld's moves: the snapped path's
    ok("!! the weld moves NO vertex by more than an ULP and up to snap any more -- those were sub-snap seam segments, now one point before cutting",
        on.subSnap === 0 && off.subSnap > 0 && on.ulp < off.ulp,
        "sub-snap moves " + on.subSnap + " (consensus off: " + off.subSnap + "); ULP-level " + on.ulp + " (" + off.ulp + "); beyond snap " + on.overSnap + " (" + off.overSnap + ")");
    report("KNOWN, left to the weld: the " + on.overSnap + " moves beyond snap join two seam ends 1.2e-9..7e-9 apart, each the end of a triTriIntersect segment of a different pair (measured; why the two pairs end apart is not traced). Merging such ends before cutting (all within 8 snaps that share a triangle) closed 37 of 65 on 99 chains -- and wrecked the rotated-copy family (its band 2.8e-2 -> 1e-1, outside it 1.4e-9 -> 1.1e-4), whose twin surfaces are dense with genuinely distinct points that close. Tried and not kept.");
}

console.log("\n8. *** ROUND 17: THE WALL FAR FROM THE ORIGIN -- A BIG LEVEL ***");
{
    // the page's wall and blasts moved 2^27 out on every axis (the wall's corners exactly; the blobs' vertices round to
    // ulp(2^27) = 1.5e-8 on the way, which is the geometry out there). meshBoolean moves each shot's operands back to the
    // origin exactly (its translationFor) and the result out again; with translate:false it works out there, where a
    // coordinate's ulp is fifteen times the arrangement's 1e-9 snap.
    const D = 2 ** 27, off = (P) => P.map((p) => { const vs = p.vs.map((v) => [v[0] + D, v[1] + D, v[2] + D]); return { vs, pl: M.planeOf(vs) }; });
    const vol = (polys, c) => { let v = 0; for (const p of polys) for (let i = 1; i + 1 < p.vs.length; i++) { const a = p.vs[0].map((x) => x - c), b = p.vs[i].map((x) => x - c), d = p.vs[i + 1].map((x) => x - c); v += a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0]); } return v / 6; };
    const go = (opts) => {
        let fb = 0, open = 0, worst = 0;
        for (const seed of [107, 101, 202]) {
            let near = M.boxPolys([0, 0, 0], HALF), far = off(M.boxPolys([0, 0, 0], HALF));
            for (const b of pageBlasts(seed, 10)) {
                near = blastWith("bvh", near, b).polys;
                const r = blastWith("bvh", far, off(b), opts); far = r.polys; fb += r.stats.fallbackTris || 0;
            }
            open += pageCensus(far); worst = Math.max(worst, Math.abs(vol(far, D) - vol(near, 0)));
        }
        return { fb, open, worst };
    };
    const on = go({}), offR = go({ translate: false, ...SNAPPED });
    // the blobs' own rounding out there moves their surface by up to ulp(2^27)/2 = 7.5e-9: over ~1e2 of blob area, 1e-6
    ok("!! three ten-shot chains with the wall at 2^27: closed at the page's census, no fallback, within 1e-6 of the same chains at the origin (the blobs' own rounding out there)",
        on.open === 0 && on.fb === 0 && on.worst < 1e-6, "open edges " + on.open + ", fallback triangles " + on.fb + ", |volume - at the origin| " + on.worst.toExponential(2));
    ok("   control: translate:false on the snapped path -- the shots worked out there -- falls back and opens the wall", offR.fb > 0 && offR.open > 0,
        "fallback triangles " + offR.fb + ", open edges " + offR.open + ", |volume - at the origin| " + offR.worst.toExponential(2));
}

console.log("\n9. *** ROUND 19: THE SOAK THAT MADE \"bvh\" THE DEFAULT ***");
{
    // Round 19 soaked both engines -- twelve 100-shot chains each in node, 100 shots through the page in Chromium -- and
    // ran the code that reads the tags (uvUnwrap, solidTexture, rebar) on BVH walls for the first time. One chain of it
    // is held here: seed 1, 100 shots, each engine.
    const chain = (engine, seed, n) => {
        let wall = M.boxPolys([0, 0, 0], HALF), fb = 0; const t0 = Date.now();
        for (const b of pageBlasts(seed, n)) { const r = blastWith(engine, wall, b, { select: engine === "bsp" ? M.bvhSelect(wall).select : null }); wall = r.polys; fb += r.stats.fallbackTris || 0; }
        return { wall, fb, ms: Date.now() - t0 };
    };
    const area = (p) => { const a = [0, 0, 0]; for (let i = 1; i + 1 < p.vs.length; i++) { const u = p.vs[i].map((x, k) => x - p.vs[0][k]), w = p.vs[i + 1].map((x, k) => x - p.vs[0][k]); a[0] += u[1] * w[2] - u[2] * w[1]; a[1] += u[2] * w[0] - u[0] * w[2]; a[2] += u[0] * w[1] - u[1] * w[0]; } return Math.hypot(...a) / 2; };
    const onBox = (p) => [0, 1, 2].some((ax) => [-1, 1].some((sg) => p.vs.every((v) => Math.abs(v[ax] - sg * HALF[ax]) < 1e-9)));
    const tags = (wall) => { let bad = 0, skin = 0, cut = 0; for (const p of wall) { if ((p.src === "skin") !== onBox(p) || (p.src !== "skin" && p.src !== "cut")) bad++; if (p.src === "skin") skin += area(p); else cut += area(p); } return { bad, skin, cut }; };
    const v = chain("bvh", 1, 100), s = chain("bsp", 1, 100), tv = tags(v.wall), ts = tags(s.wall);
    const vOpen = pageCensus(v.wall), sOpen = pageCensus(s.wall), sSettled = pageCensus(settleWith("bsp", s.wall).polys);
    const dVol = Math.abs(M.volume(v.wall) - M.volume(s.wall)) / M.volume(s.wall);
    ok("!! *** 100 SHOTS (seed 1): THE BVH WALL CLOSED AT THE PAGE'S CENSUS RAW, NO FALLBACK, THE BSP'S SOLID TO 1e-10, ITS SKIN AND CUT AREAS TO 1e-10, EVERY TAG RIGHT ***",
        vOpen === 0 && v.fb === 0 && dVol < 1e-10 && Math.abs(tv.cut - ts.cut) / ts.cut < 1e-10 && Math.abs(tv.skin - ts.skin) / ts.skin < 1e-10 && tv.bad === 0 && ts.bad === 0,
        "open " + vOpen + ", fallback triangles " + v.fb + ", volume " + dVol.toExponential(1) + ", CUT area " + (Math.abs(tv.cut - ts.cut) / ts.cut).toExponential(1) + ", SKIN area " + (Math.abs(tv.skin - ts.skin) / ts.skin).toExponential(1) + ", tags wrong " + tv.bad + " / " + ts.bad);
    ok("   and faster, with a tenth of the polygons -- the BSP's own wall open raw and still open after its settle",
        v.ms < s.ms && v.wall.length * 5 < s.wall.length && sOpen > 0,
        "BVH " + v.ms + " ms, " + v.wall.length + " polygons; BSP " + s.ms + " ms, " + s.wall.length + " polygons, open " + sOpen + " raw, " + sSettled + " settled");
    // the code that reads the tags, on the BVH wall: the CUT faces unwrapped (isometric -- a texel is a texel), the solid
    // texture and the rebar sampled on them
    const cut = v.wall.filter((p) => p.src === "cut"), mesh = polysToMesh(v.wall, { only: "cut" }), uw = unwrap(cut), td = texelDensity(cut, uw.uvs);
    let uvOut = 0; for (const x of mesh.uvs) if (!(x >= 0 && x <= 1)) uvOut++;
    let finite = 0, rodArea = 0, cutArea = 0;
    for (const p of cut) { const c = [0, 1, 2].map((k) => p.vs.reduce((t, q) => t + q[k], 0) / p.vs.length), col = concreteAt(...c), rd = rebarDistance(...c);
        if ([].concat(col).flat().every((x) => typeof x !== "number" || Number.isFinite(x))) finite++; if (rd.inside) rodArea += area(p); cutArea += area(p); }
    ok("!! uvUnwrap, solidTexture and rebar on the BVH wall's CUT faces: every face unwrapped with UVs in [0,1], texel density one number (spread under 1e-3), the texture finite everywhere, the rebar exposed on a share of the cut",
        mesh.polys === cut.length && mesh.triangles > 0 && uvOut === 0 && td.spread < 1e-3 && td.degenerate === 0 && finite === cut.length && rodArea > 0 && rodArea < cutArea,
        cut.length + " CUT polygons, " + mesh.triangles + " triangles, UVs out of [0,1] " + uvOut + ", texel spread " + td.spread.toExponential(1) + " (a vertex the weld left ~2e-9 off its plane, in a small polygon), rebar on " + (100 * rodArea / cutArea).toFixed(1) + "% of the cut");
    // KNOWN: the openings the soak found in the BVH engine, with their reproductions
    const k8 = chain("bvh", 8, 100), o8 = pageCensus(k8.wall);   // round 16g: the default engine's arrangement is exact
    report("seed 8 stands at " + o8 + " open edges after 100 shots (13 at round 19, 10 after round 19b): its shot-84 opening was a fan of wall slivers as thin as the snap, which only the exact arrangement resolves (round 19c, section 13) -- the default since round 16g. The BSP: open raw on every chain, and after settle on every one (382 edges over the 12, at the old 1e-9 key).");
    ok("!! round 16g: seed 8, the soak's one chain the default engine left open (10 edges, the snapped path's -- section 13), is closed at the page's census after 100 shots", o8 === 0, String(o8));
}

console.log("\n10. *** ROUND 19b: TWO OF THE SOAK'S OPENINGS, ROOT-CAUSED AND CLOSED ***");
{
    // (a) a session of the page's own range of blasts -- radius 0.20..1.40 in the slider's steps of 5, jaggedness to 0.90,
    // 4..14 facets, Math.random seeded as round 19 seeded the page -- 100 shots. Round 19 found one blob triangle refused
    // 'earcut' at shot 98: Earcut joined a hole's edge to an outer-ring vertex lying exactly on its line, a triangle of
    // zero area, and the plane path that took the whole triangle opened 44 edges. Now the flat triangle goes and the one
    // across its long edge is split at its middle vertex (triArrangement.mjs, round 19b).
    let st = 12345; const rnd = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
    let wall = M.boxPolys([0, 0, 0], HALF), seed = 1, worst = 0, fb = 0, at98 = null;
    for (let k = 0; k < 100; k++) {
        const sl = (n) => ((k * 2654435761 + n * 40503) >>> 0) / 4294967296;
        const r = (20 + Math.round(sl(1) * 120)) / 100, rough = Math.round(sl(2) * 90) / 100, sub = 4 + Math.floor(sl(3) * 11);
        const c = [(rnd() * 2 - 1) * (HALF[0] - r), (rnd() * 2 - 1) * (HALF[1] - r), 0];
        const blob = M.jaggedBlob(c, r, sub, seed++, { rough, floor: 1 - rough });
        if (k === 97) at98 = { wall, blob };
        const out = blastWith("bvh", wall, blob); wall = out.polys; fb += out.stats.fallbackTris || 0;
        worst = Math.max(worst, pageCensus(wall));
    }
    const ctrlA = pageCensus(blastWith("bvh", at98.wall, at98.blob, { flatEars: false, ...SNAPPED }).polys);
    ok("!! a session of the page's range of blasts, 100 shots: the wall closed at the page's census after EVERY shot, no fallback",
        worst === 0 && fb === 0, "worst open edges after any shot " + worst + ", fallback triangles " + fb);
    ok("   control: on the snapped path with the flat-triangle repair off (flatEars:false), shot 98 opens the wall again", ctrlA > 0, ctrlA + " open edges");
    // (b) the soak's seed 8, shot 80: two pairs' segments meet at b, where a wall edge crosses the blob's plane 4e-10 from
    // a blob edge, and the next pair's segment runs 1.5e-8 straight back -- a FOLD. The triangle across split a-b at its
    // far end, the triangles beyond kept a-b whole: 3 edges open, past the weld. The seam consensus joins a fold's ends.
    let w8 = M.boxPolys([0, 0, 0], HALF); const b8 = pageBlasts(8, 81);
    for (let k = 0; k < 80; k++) w8 = blastWith("bvh", w8, b8[k], SNAPPED).polys;
    const on = pageCensus(blastWith("bvh", w8, b8[80], SNAPPED).polys), off = pageCensus(blastWith("bvh", w8, b8[80], { seamFolds: false, ...SNAPPED }).polys);
    ok("!! the soak's seed 8, shot 80, on the snapped path: closed at the page's census -- with the seam's folds joined -- where seamFolds:false opens it",
        on === 0 && off > 0, "open " + on + "; seamFolds:false " + off);
}

console.log("\n11. *** ROUND 18b: THE FINISHING FOR EVERY OP -- booleanBVH ***");
{
    // Round 18 measured every op's raw meshBoolean output leaving seam ends ~1e-9 apart, open at the page's census, and
    // only the blast (subtract) finishing them. booleanBVH(polys, other, op) is the blast for any op, in its contract.
    // meshBoolean throws on it too; the adapter's own check throws first, before it builds two BVHs, and names itself
    let threw = ""; try { booleanBVH(M.boxPolys([0, 0, 0], HALF), pageBlasts(1, 1)[0], "difference"); } catch (e) { threw = e.message; }
    ok("an unrecognized op throws, from the adapter's own check", threw.startsWith("blastEngine: unrecognized op"), threw || "no throw");
    // subtract through it IS the blast, bit for bit, over a chain
    let w1 = M.boxPolys([0, 0, 0], HALF), w2 = w1, same = true;
    for (const b of pageBlasts(5, 6)) { w1 = blastWith("bvh", w1, b).polys; w2 = booleanBVH(w2, b, "subtract").polys;
        same = same && w1.length === w2.length && w1.every((p, i) => p.src === w2[i].src && p.vs.length === w2[i].vs.length && p.vs.every((v, j) => v[0] === w2[i].vs[j][0] && v[1] === w2[i].vs[j][1] && v[2] === w2[i].vs[j][2])); }
    ok("   subtract through booleanBVH is blastWith(\"bvh\") bit for bit (a six-shot chain)", same);
    // the mixed chains of meshBoolean-selfcheck section 24(d) -- even shots ADD a page blob, odd shots blast one, every
    // fourth keeps what lies inside a big blob -- finished, against the same chains through the BSP; raw as the control
    const cracksBuf = (buf) => { const key = (o) => Math.round(buf[o] / 1e-9) + "," + Math.round(buf[o + 1] / 1e-9) + "," + Math.round(buf[o + 2] / 1e-9), E = new Map();
        for (let o = 0; o < buf.length; o += 9) { const k = [key(o), key(o + 3), key(o + 6)]; for (let i = 0; i < 3; i++) if (k[i] !== k[(i + 1) % 3]) { const e = k[i] + "|" + k[(i + 1) % 3]; E.set(e, (E.get(e) || 0) + 1); } }
        let c = 0; for (const [e, n] of E) { const [a, b] = e.split("|"); if ((E.get(b + "|" + a) || 0) !== n) c++; } return c; };
    let worst = 0, open = 0, rawOpen = 0, fb = 0, ops = 0, bare = 0;
    for (const seed of [1, 2, 3, 107, 202]) {
        let fin = M.boxPolys([0, 0, 0], HALF), bsp = fin, raw = M.toTriangleBuffer(fin);
        pageBlasts(seed, 10).forEach((b, k) => {
            const op = k % 4 === 3 ? "intersect" : (k % 2 === 0 ? "union" : "subtract"), P = op === "intersect" ? M.jaggedBlob([0, 0, 0], 3.6, 10, seed * 7 + k) : b;
            const r = booleanBVH(fin, P, op); fin = r.polys; fb += r.stats.fallbackTris || 0; ops++;
            bsp = M[op](bsp, P); worst = Math.max(worst, Math.abs(M.volume(fin) - M.volume(bsp)) / M.volume(bsp));
            open += pageCensus(fin);
            const Bb = M.toTriangleBuffer(P); raw = meshBoolean(raw, new MeshBVH(raw), Bb, new MeshBVH(Bb), op, SNAPPED).tris; rawOpen += cracksBuf(raw);
        });
        for (const p of fin) if (!p.src || !p.pl) bare++;
    }
    ok("!! *** " + ops + " OPS THAT ADD, BLAST AND TRIM THE PAGE'S WALL, FINISHED: CLOSED AT THE PAGE'S CENSUS AFTER EVERY STEP, THE BSP'S SOLID TO 1e-10, NO FALLBACK, EVERY POLYGON TAGGED ON ITS PLANE ***",
        open === 0 && worst < 1e-10 && fb === 0 && bare === 0, "open (summed over every step) " + open + ", |volume - BSP| " + worst.toExponential(1) + ", fallbacks " + fb + ", untagged " + bare);
    ok("   control: the same steps raw on the snapped path (meshBoolean alone) are open at a 1e-9 census", rawOpen > 0, "open (summed over every step) " + rawOpen);
    // the tags and planes each op gives the other operand's pieces
    const wall = M.boxPolys([0, 0, 0], HALF), blob = M.jaggedBlob([0.5, 0.2, 0], 0.9, 8, 3), big = M.jaggedBlob([0, 0, 0], 3.6, 10, 9);
    const rule = (polys, other, op, want, turned) => {
        const r = booleanBVH(polys, other, op, { finish: false }).polys, plOf = new Set(other.map((q) => q.pl));
        let bad = 0, n = 0;
        for (const p of r) {
            const onWall = polys.some((q) => q.pl === p.pl);
            if (onWall) { if (p.src !== "skin") bad++; continue; }   // the wall's pieces keep theirs (its faces are SKIN)
            n++; if (p.src !== want || plOf.has(p.pl) === turned) bad++;
        }
        return { bad, n };
    };
    const u = rule(wall, blob, "union", "skin", false), i = rule(wall, big, "intersect", "cut", false), s2 = rule(wall, blob, "subtract", "cut", true);
    ok("!! the other operand's pieces: union keeps its tag (SKIN) on its own plane, intersect tags them CUT on their own plane, subtract CUT on the plane turned round; the wall's keep SKIN",
        u.bad + i.bad + s2.bad === 0 && u.n > 0 && i.n > 0 && s2.n > 0, "union " + u.bad + "/" + u.n + ", intersect " + i.bad + "/" + i.n + ", subtract " + s2.bad + "/" + s2.n + " wrong");
    // a tagged other keeps its tags through a union (a wall grown by another wall's pieces); opts.otherTag overrides
    const tagged = blob.map((q, k) => ({ ...q, src: k % 2 ? "cut" : "skin" })), tagOf = new Map(tagged.map((q) => [q.pl, q.src]));
    let kept = 0, keptN = 0, forced = 0, forcedN = 0;
    for (const p of booleanBVH(wall, tagged, "union", { finish: false }).polys) if (tagOf.has(p.pl)) { keptN++; if (p.src !== tagOf.get(p.pl)) kept++; }
    for (const p of booleanBVH(wall, blob, "union", { finish: false, otherTag: "cut" }).polys) if (!wall.some((q) => q.pl === p.pl)) { forcedN++; if (p.src !== "cut") forced++; }
    ok("   a union keeps the other operand's own tags (SKIN and CUT, alternating), and otherTag overrides them",
        kept + forced === 0 && keptN > 0 && forcedN > 0, "own tags " + kept + "/" + keptN + ", otherTag " + forced + "/" + forcedN + " wrong");
    // KNOWN: an intersect chain the finishing does not close -- its opening is a fallback's, not a near-miss's
    let wk = M.boxPolys([0, 0, 0], HALF), ofb = 0;
    for (let k = 0; k < 5; k++) { const r = booleanBVH(wk, M.jaggedBlob([0, 0, 0], 3.8, 10, 4 * 7 + k), "intersect"); wk = r.polys; ofb += r.stats.fallbackTris || 0; }
    const ko = pageCensus(wk);
    report("KNOWN  five intersects with big blobs centred at the origin (seed 4): " + ko + " open edges, from " + ofb + " wall triangles refused 'dangling' (every blob's equator lies in z = 0) -- the plane path's, which no finishing closes. Raw, that chain had 21; 20 chains of each op raw / finished: union 0 / 0, subtract 3 / 0, intersect 21 / 4. Backlog bvh-csg-r19c-sliver-fan-openings (the z = 0 contacts).");
    ok("   (KNOWN, pinned) that chain stays within 2.5x its measured 4 open edges -- a regression alarm, not a correctness claim", ko <= 10, String(ko));
}

console.log("\n12. *** ROUND 16f: THE EXACT ARRANGEMENT ON THE PAGE'S CHAIN (opts.exactArrangement; the default since round 16g) ***");
{
    // The page's blasts through the exact arrangement: finished by MERGING only (the weld would join its distinct points),
    // checked at the EXACT-BITS key -- every edge's twin the same two doubles. (The page's 1e-9 census lumps distinct points
    // closer than 1e-9, which the exact arrangement keeps, and reports them as T-junctions.)
    const bitsOpen = (wall) => { const E = new Map(), key = (v) => v[0] + "," + v[1] + "," + v[2];
        for (const p of wall) for (let i = 0; i < p.vs.length; i++) { const a = key(p.vs[i]), b = key(p.vs[(i + 1) % p.vs.length]); if (a === b) continue; const e = a + "|" + b; E.set(e, (E.get(e) || 0) + 1); }
        let c = 0; for (const [e, k] of E) { const [a, b] = e.split("|"); if ((E.get(b + "|" + a) || 0) !== k) c++; } return c; };
    // the wall crossing itself: wall triangles meeting along a segment that is not an edge they share
    const selfCross = (wall) => { const tris = []; for (const p of wall) for (const t of p.tris || M.toTriangles([p])) tris.push(t);
        const buf = new Float64Array(tris.length * 9); tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = t[v][c]; });
        const bvh = new MeshBVH(buf); let L = 0, n = 0;
        for (const [a, b] of pairOverlap(bvh, bvh, 0)) { if (a >= b) continue; const T1 = tris[a], T2 = tris[b], e = exactPair(T1, T2); if (e.kind !== "segment") continue;
            if (T1.filter((x) => T2.some((y) => y[0] === x[0] && y[1] === x[1] && y[2] === x[2])).length === 2) continue;
            n++; L = Math.max(L, Math.hypot(e.P0.r[0] - e.P1.r[0], e.P0.r[1] - e.P1.r[1], e.P0.r[2] - e.P1.r[2])); }
        return { n, L }; };
    const chain = (opts) => { let wall = M.boxPolys([0, 0, 0], HALF), fb = 0, openShots = 0, welded = 0;
        let maxMove = 0;
        for (const b of pageBlasts(1, 20)) { const r = blastWith("bvh", wall, b, opts); wall = r.polys; fb += r.stats.fallbackTris || 0; welded += r.stats.welded || 0; maxMove = Math.max(maxMove, r.stats.maxMove || 0); if (bitsOpen(wall)) openShots++; }
        return { wall, fb, openShots, welded, maxMove }; };
    const ex = chain({ exactArrangement: true }), df = chain(SNAPPED), nd = chain({ exactArrangement: true, delaunay: false });
    const sx = selfCross(ex.wall), sn = selfCross(nd.wall), dv = Math.abs(M.volume(ex.wall) - M.volume(df.wall));
    ok("!! *** SEED 1, 20 SHOTS, EXACT ARRANGEMENT: NO FALLBACK, CLOSED BIT FOR BIT AFTER EVERY SHOT, WELDED ONLY WITHIN A ROUNDING (EXACT_FINISH_WELD), THE SNAPPED ENGINE'S SOLID TO 1e-10 ***",
        ex.fb === 0 && ex.openShots === 0 && ex.maxMove <= EXACT_FINISH_WELD && dv < 1e-10, "fallbacks " + ex.fb + ", shots open at bits " + ex.openShots + ", welded " + ex.welded + " (largest move " + ex.maxMove.toExponential(1) + "), |volume - snapped| " + dv.toExponential(1));
    ok("!! the wall never crosses itself (Delaunay, and since round 16g the rounding weld, which joins the folds finer than a rounding that merge-only left, 7.5e-17 long); without Delaunay (delaunay:false) needles beside nearly straight seams turn over when rounded and it does",
        sx.n === 0 && sn.L > 1e-3, "longest self-crossing " + sx.L.toExponential(1) + " (" + sx.n + "), delaunay:false " + sn.L.toExponential(1) + " (" + sn.n + ")");
    report("the soak since round 16g (12 chains x 100 shots, the default): 0 fallbacks, closed bit for bit after every shot; seed 11's T-junction 3.5e-18 wide (open 26 shots, merge-only) is joined by the rounding weld. Section 14 has the weld and the precondition.");
}

console.log("\n13. *** ROUND 19c: SEED 8'S SHOT 84 -- A FAN OF SLIVERS AS THIN AS THE SNAP, WHICH ONLY THE EXACT ARRANGEMENT RESOLVES ***");
{
    // The opening section 9 pins: at shot 84 the blob's triangle B58 crosses a fan of wall slivers 1.1e-9..3.7e-9 high and
    // 0.11 long (the snapped arrangement's sliver path), cutting their long sides at points 1.1e-9..3.5e-9 apart. Every
    // arrangement decides them at a 1e-9 snap of its own -- the slivers project each point onto their side, B58 keeps it --
    // and they disagree: 29 edges open raw, 10 after the weld (whose chained joins moved one point 2.2e-8). Measured and
    // dropped: keeping a point's own bits when it lies on the side (29 -> 19 raw, 10 still after the weld; the 12-chain
    // soak identical). The exact arrangement decides them exactly.
    const bitsT = (t) => { const E = new Map(), key = (o) => t[o] + "," + t[o + 1] + "," + t[o + 2];
        for (let o = 0; o < t.length; o += 9) for (let i = 0; i < 3; i++) { const a = key(o + i * 3), b = key(o + ((i + 1) % 3) * 3); if (a !== b) E.set(a + "|" + b, (E.get(a + "|" + b) || 0) + 1); }
        const open = []; for (const [e, k] of E) { const [a, b] = e.split("|"); if ((E.get(b + "|" + a) || 0) !== k) open.push(e); } return open; };
    const bitsP = (wall) => { const E = new Map(), key = (v) => v[0] + "," + v[1] + "," + v[2];
        for (const p of wall) for (let i = 0; i < p.vs.length; i++) { const a = key(p.vs[i]), b = key(p.vs[(i + 1) % p.vs.length]); if (a === b) continue; const e = a + "|" + b; E.set(e, (E.get(e) || 0) + 1); }
        let c = 0; for (const [e, k] of E) { const [a, b] = e.split("|"); if ((E.get(b + "|" + a) || 0) !== k) c++; } return c; };
    const toBuf = (polys) => { const tris = []; for (const p of polys) for (const t of p.tris || M.toTriangles([p])) tris.push(t); const b = new Float64Array(tris.length * 9); tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) b[i * 9 + v * 3 + c] = t[v][c]; }); return b; };
    const bl = pageBlasts(8, 100);
    let w = M.boxPolys([0, 0, 0], HALF);
    for (let k = 0; k < 84; k++) w = blastWith("bvh", w, bl[k], SNAPPED).polys;
    const A = toBuf(w), B = toBuf(bl[84]);
    const raw = meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), "subtract", SNAPPED), ex = meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), "subtract", { exactArrangement: true });
    // which output triangles carry the raw openings, and how thin their source triangles are
    const ro = bitsT(raw.tris), at = new Set(ro.flatMap((e) => e.split("|")));
    let slivers = 0;
    for (let i = 0; i < raw.from.length; i++) {
        const f = raw.from[i]; if (f < 0) continue;
        const o = i * 9; if (![0, 3, 6].some((c) => at.has(raw.tris[o + c] + "," + raw.tris[o + c + 1] + "," + raw.tris[o + c + 2]))) continue;
        const q = f * 9, u = [A[q + 3] - A[q], A[q + 4] - A[q + 1], A[q + 5] - A[q + 2]], v = [A[q + 6] - A[q], A[q + 7] - A[q + 1], A[q + 8] - A[q + 2]];
        const L = Math.max(Math.hypot(...u), Math.hypot(...v), Math.hypot(v[0] - u[0], v[1] - u[1], v[2] - u[2])), h = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / L;
        if (h <= 4e-9) slivers++;
    }
    ok("   the reproduction: the snapped engine's raw output of shot 84 is open, at wall pieces of slivers no higher than 4e-9 (round 19's 29 edges)",
        ro.length > 0 && slivers > 0, ro.length + " open directed edges, " + slivers + " output triangles of slivers on them");
    const xo = bitsT(ex.tris);
    ok("!! *** THE SAME INPUT THROUGH THE EXACT ARRANGEMENT: CLOSED BIT FOR BIT, NO FALLBACK ***", xo.length === 0 && ex.stats.a.fallbackTris + ex.stats.b.fallbackTris === 0,
        xo.length + " open, " + (ex.stats.a.fallbackTris + ex.stats.b.fallbackTris) + " fallbacks");
    // and the whole chain, exact: closed bit for bit after every shot
    let we = M.boxPolys([0, 0, 0], HALF), openShots = 0, fbe = 0;
    for (const b of bl) { const r = blastWith("bvh", we, b, { exactArrangement: true }); we = r.polys; fbe += r.stats.fallbackTris || 0; if (bitsP(we)) openShots++; }
    ok("!! seed 8's 100 shots through the exact arrangement: closed bit for bit after every shot, no fallback (the default: open from shot 84, 10 edges at the end)",
        openShots === 0 && fbe === 0, "shots open " + openShots + ", fallbacks " + fbe);
}

console.log("\n14. *** ROUND 16g: THE EXACT ARRANGEMENT IS THE DEFAULT -- A ROUNDING WELD, AND A PRECONDITION ***");
{
    // (a) the defaults: meshBoolean's arrangement is exact, and a default page shot ran it, welded only within a rounding
    const r0 = blastWith(DEFAULT_BLAST_ENGINE, M.boxPolys([0, 0, 0], HALF), pageBlasts(1, 1)[0]);
    ok("!! the page's default shot runs the exact arrangement (MESH_BOOLEAN_EXACT_DEFAULT) and its finishing weld moves nothing past EXACT_FINISH_WELD (1e-14)",
        MESH_BOOLEAN_EXACT_DEFAULT === true && r0.stats.exact === true && (r0.stats.maxMove || 0) <= EXACT_FINISH_WELD,
        "MESH_BOOLEAN_EXACT_DEFAULT " + MESH_BOOLEAN_EXACT_DEFAULT + ", stats.exact " + r0.stats.exact + ", largest move " + (r0.stats.maxMove || 0).toExponential(1));
    // (b) the rounding weld. Exact output keeps points a few ulps apart -- edges 1e-17 long, which no texture can map: the
    // unwrap's texel density is noise there. Measured on seed 1's 20 shots: spread 3.75e-6, shortest edge 3.7e-10 with it;
    // without it (finishWeld:0) 1.47 and 3.5e-18, 32 degenerate.
    const minEdge = (w) => { let m = Infinity; for (const p of w) for (let i = 0; i < p.vs.length; i++) { const a = p.vs[i], c = p.vs[(i + 1) % p.vs.length], L = Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]); if (L > 0 && L < m) m = L; } return m; };
    const weldChain = (opts) => { let w = M.boxPolys([0, 0, 0], HALF), openShots = 0;
        for (const b of pageBlasts(1, 20)) { w = blastWith("bvh", w, b, opts).polys; if (pageCensus(w)) openShots++; }
        const cut = w.filter((p) => p.src === "cut"), td = texelDensity(cut, unwrap(cut).uvs); return { openShots, spread: td.spread, degenerate: td.degenerate, minEdge: minEdge(w) }; };
    const wd = weldChain({}), w0 = weldChain({ finishWeld: 0 });
    ok("!! *** SEED 1, 20 SHOTS, THE DEFAULT: CLOSED AT THE PAGE'S CENSUS AFTER EVERY SHOT, THE CUT FACES' TEXEL DENSITY EVEN (spread < 1e-3), NO EDGE SHORTER THAN 1e-14 ***",
        wd.openShots === 0 && wd.spread < 1e-3 && wd.minEdge > 1e-14, "shots open " + wd.openShots + ", spread " + wd.spread.toExponential(2) + ", degenerate " + wd.degenerate + ", shortest edge " + wd.minEdge.toExponential(2));
    ok("   control: the exact output unwelded (finishWeld:0) keeps edges a rounding long, and the texel density is noise", w0.spread > 0.1 || w0.minEdge < 1e-15,
        "spread " + w0.spread.toExponential(2) + ", degenerate " + w0.degenerate + ", shortest edge " + w0.minEdge.toExponential(2));
    // (c) the precondition. A meshCSG BSP wall is non-conforming -- a long edge against two short ones whose middle vertex
    // lies near it (up to 1.03e-9 off, measured at 16h), and near-miss vertices -- and the exact arrangement's seam has a gap there through which a region floods. Where
    // the operands meet non-conforming, the operation takes the snapped path. Measured on a page session switching engines
    // (seed 3: 10 shots bvh, 10 bsp, 10 bvh): the default within 3.9e-12 of the snapped chain; unchecked
    // (exactConforming:false) 6.9e-3 off. In the page itself, switching every 25 shots: 6.2 units of the wall lost by shot 100.
    const mixed = (opts) => { const bl = pageBlasts(3, 30); let w = M.boxPolys([0, 0, 0], HALF), declined = 0, exactAfter = 0, moveDeclined = 0;
        for (let k = 0; k < 30; k++) { const eng = Math.floor(k / 10) % 2 ? "bsp" : "bvh";
            const r = blastWith(eng, w, bl[k], { select: eng === "bsp" ? M.bvhSelect(w).select : null, ...opts }); w = r.polys;
            if (eng === "bvh" && k >= 20) { if (r.stats.exact) exactAfter++; else { declined++; moveDeclined = Math.max(moveDeclined, r.stats.maxMove || 0); } } }
        return { vol: M.volume(w), declined, exactAfter, moveDeclined }; };
    // (round 16h makes such a wall conforming first; these rows pin 16g's precondition and its weld, so they run without)
    const md = mixed({ conform: false }), ms = mixed(SNAPPED), mu = mixed({ conform: false, exactConforming: false });
    const dd = Math.abs(md.vol - ms.vol), du = Math.abs(mu.vol - ms.vol);
    ok("!! *** A SESSION SWITCHING ENGINES (10 bvh / 10 bsp / 10 bvh, seed 3), NOT CONFORMED: THE EXACT PATH DECLINES ON THE BSP'S WALL AND MATCHES THE SNAPPED CHAIN TO 1e-9 ***",
        md.declined > 0 && dd < 1e-9, "declined " + md.declined + " of the 10 shots after the BSP's (exact " + md.exactAfter + "), |volume - snapped| " + dd.toExponential(1));
    // the weld is the one for the path that RAN: a declined shot's snapped output gets the 8e-9 weld, which closes its near-misses
    ok("   a declined shot is finished by the snapped path's weld (moves past EXACT_FINISH_WELD), not the rounding one", md.moveDeclined > EXACT_FINISH_WELD && md.moveDeclined <= WELD,
        "largest move on a declined shot " + md.moveDeclined.toExponential(2));
    ok("   control: without the precondition (exactConforming:false) the exact path floods through the BSP wall's T-junctions", du > 1e-6, "|volume - snapped| " + du.toExponential(1));
}

console.log("\n15. *** ROUND 16h: A WALL THE BSP HAS CUT, MADE CONFORMING NEAR THE SEAM -- THEN EXACT ***");
{
    // Measured on the switching chains (12 seeds, 10 bvh / 10 bsp / 10 bvh), every edge of the BSP's wall near the seam that
    // has no twin is one of two things: a NEAR-MISS -- two vertices that should be one, a rounding apart (1.2e-14 at most)
    // or a corner 1.6e-9 from its neighbour's -- or a T-JUNCTION, its middle vertex up to 1.03e-9 off the long side (none of
    // 2,077 exactly on it; round 16g's "only to rounding" was wrong). meshBoolean now merges and splits them within meshCSG's
    // EPS (conformNear) and runs exact: 120 of 120 such shots, where 100 of 120 declined before; every chain within 8.0e-11
    // of the snapped one; no output edge open that the wall had not already opened (on the blob's side none).
    const buf = (polys) => { const t = []; for (const p of polys) for (const x of p.tris || M.toTriangles([p])) t.push(x); const b = new Float64Array(t.length * 9); t.forEach((x, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) b[i * 9 + v * 3 + c] = x[v][c]; }); return b; };
    const opens = (b) => { const key = (o) => b[o] + "," + b[o + 1] + "," + b[o + 2], E = new Map(), tri = new Map();
        for (let o = 0; o < b.length; o += 9) for (let i = 0; i < 3; i++) { const a = key(o + i * 3), c = key(o + ((i + 1) % 3) * 3); if (a !== c) { const e = a + "|" + c; E.set(e, (E.get(e) || 0) + 1); tri.set(e, o / 9); } }
        const out = []; for (const [e, n] of E) { const [a, c] = e.split("|"); if ((E.get(c + "|" + a) || 0) !== n) out.push([e, tri.get(e)]); } return out; };
    const P = (k) => k.split(",").map(Number);
    const onSeg = (x, a, b) => { const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l2 = e[0] ** 2 + e[1] ** 2 + e[2] ** 2, t = ((x[0] - a[0]) * e[0] + (x[1] - a[1]) * e[1] + (x[2] - a[2]) * e[2]) / l2;
        return t > -1e-9 && t < 1 + 1e-9 && Math.hypot(a[0] + t * e[0] - x[0], a[1] + t * e[1] - x[1], a[2] + t * e[2] - x[2]) < 2e-8; };
    // a switching chain: every shot after the BSP's through meshBoolean raw (exact? which openings are its own?), then the page's
    const chain = (seed, n, opts) => { const bl = pageBlasts(seed, n); let w = M.boxPolys([0, 0, 0], HALF), exact = 0, declined = 0, fb = 0, seam = 0, own = 0, inherited = 0;
        for (let k = 0; k < n; k++) { const eng = Math.floor(k / 10) % 2 ? "bsp" : "bvh";
            if (eng === "bvh" && k >= 20) {
                const A = buf(w), B = buf(bl[k]), r = meshBoolean(A, new MeshBVH(A), B, new MeshBVH(B), "subtract", opts);
                if (r.exact) exact++; else declined++;
                fb += r.stats.a.fallbackTris + r.stats.b.fallbackTris;
                if (r.exact) { const oA = opens(A), inA = new Set(oA.map((x) => x[0])), segs = oA.map(([e]) => e.split("|").map(P));
                    for (const [e, t] of opens(r.tris)) { if (inA.has(e)) continue; if (r.from[t] < 0) { seam++; continue; }
                        const [a, b] = e.split("|").map(P); if (segs.some(([u, v]) => onSeg(a, u, v) && onSeg(b, u, v))) inherited++; else own++; } }
            }
            w = blastWith(eng, w, bl[k], { select: eng === "bsp" ? M.bvhSelect(w).select : null, ...opts }).polys;
        }
        return { exact, declined, fb, seam, own, inherited, vol: M.volume(w) }; };
    const c3 = chain(3, 30, {}), s3 = chain(3, 30, SNAPPED), n3 = chain(3, 30, { conform: false }), dv = Math.abs(c3.vol - s3.vol);
    ok("!! *** SEED 3, 10 bvh / 10 bsp / 10 bvh: EVERY SHOT AFTER THE BSP'S EXACT (CONFORMED), NO FALLBACK, NO OPENING OF ITS OWN OR ON THE BLOB'S SIDE, THE SNAPPED CHAIN'S SOLID TO 1e-9 ***",
        c3.exact === 10 && c3.declined === 0 && c3.fb === 0 && c3.seam === 0 && c3.own === 0 && dv < 1e-9,
        "exact " + c3.exact + ", declined " + c3.declined + ", fallbacks " + c3.fb + ", new open edges: blob's side " + c3.seam + ", own " + c3.own + ", along the wall's own cracks " + c3.inherited + "; |volume - snapped| " + dv.toExponential(1));
    ok("   control: not conformed (conform:false), most of them decline (round 16g)", n3.declined >= 5, "declined " + n3.declined + " of 10");
    // seed 12, shot 28: a sliver 1.4e-8 wide beside a region's rim -- the edge census must reach every twin (round 16h's own
    // first draft read an edge on the rim as open and split it at a point its twin already had: 5 edges doubled)
    const c12 = chain(12, 29, {});
    ok("!! seed 12's chain to shot 28 (a wall sliver 1.4e-8 wide on the region's rim): every shot after the BSP's exact, no opening of its own or on the blob's side",
        c12.exact === 9 && c12.declined === 0 && c12.seam === 0 && c12.own === 0, "exact " + c12.exact + ", declined " + c12.declined + ", blob's side " + c12.seam + ", own " + c12.own + ", along the wall's cracks " + c12.inherited);
}

console.log("\n16. *** ROUND 20: IS THE WALL TWO-MANIFOLD? -- THE QUESTION bvh-csg-speed-vs-manifold-tradeoff WAS OPENED TO WEIGH ***");
{
    // three-bvh-csg's README: "due to numerical precision and corner cases resulting geometry may not be correctly completely
    // two-manifold". manifoldAudit.mjs counts, at exact bits: zero-area triangles, open and non-manifold edges, pinched
    // vertices, crossings, touches, coplanar overlaps -- and how deep each crossing is.
    const buf = (polys) => { const t = []; for (const p of polys) for (const x of p.tris || M.toTriangles([p])) t.push(x); const b = new Float64Array(t.length * 9); t.forEach((x, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) b[i * 9 + v * 3 + c] = x[v][c]; }); return b; };
    const KEYS = ["degenerate", "open", "nonManifoldEdges", "pinchedVertices", "crossings", "touches", "coplanarOverlaps"];
    const show = (r) => KEYS.filter((k) => r[k]).map((k) => k + " " + r[k]).join(", ") || "clean";
    const topo = (r) => r.degenerate + r.open + r.nonManifoldEdges + r.pinchedVertices + r.touches + r.coplanarOverlaps;
    // (a) the page's seed 1, 20 shots
    let w1 = M.boxPolys([0, 0, 0], HALF);
    for (const b of pageBlasts(1, 20)) w1 = blastWith("bvh", w1, b).polys;
    const a1 = manifoldAudit(buf(w1));
    ok("!! *** SEED 1, 20 SHOTS, THE DEFAULT ENGINE: TWO-MANIFOLD -- NO DEGENERATE TRIANGLE, NO OPEN OR NON-MANIFOLD EDGE, NO PINCHED VERTEX, NO CROSSING, TOUCH OR COPLANAR OVERLAP ***",
        topo(a1) === 0 && a1.crossings === 0, a1.triangles + " triangles: " + show(a1));
    // (b) meshCSG's own stress case (its header: twelve overlapping blasts on one wall, shot 12 at 318.8 ms), every engine
    const WALL12 = () => M.boxPolys([0, 0, 0], [4, 3, 0.3]), BLOB12 = (k) => M.jaggedBlob([(k % 5 - 2) * 1.4, ((k * 7) % 5 - 2) * 1.0, 0], 0.9, 8, 1000 + k * 37);
    const twelve = (step) => { let w = WALL12(); const ms = []; for (let k = 1; k <= 12; k++) { const t = Date.now(); w = step(w, BLOB12(k)); ms.push(Date.now() - t); } return { w, ms }; };
    const tv = twelve((w, b) => blastWith("bvh", w, b).polys), tb = twelve((w, b) => M.blast(w, b, { select: M.bvhSelect(w).select }).polys);
    const ts = settleWith("bsp", tb.w).polys, av = [], ab = [], as = [];
    const rv = manifoldAudit(buf(tv.w), { detail: av }), rb = manifoldAudit(buf(tb.w), { detail: ab }), rs = manifoldAudit(buf(ts), { detail: as });
    const deep = (d) => (d.length ? Math.max(...d.map((x) => x.depth)) : 0), dv = Math.abs(M.volume(tv.w) - M.volume(tb.w));
    report("twelve overlapping blasts: BVH " + tv.ms.reduce((x, y) => x + y) + " ms (shot 1 " + tv.ms[0] + ", shot 12 " + tv.ms[11] + "), " + tv.w.length + " polygons; BSP localised " + tb.ms.reduce((x, y) => x + y) + " ms (shot 12 " + tb.ms[11] + "), " + tb.w.length + " polygons, settled " + ts.length);
    ok("!! *** meshCSG's TWELVE-BLAST STRESS CASE, THE DEFAULT ENGINE: TWO-MANIFOLD, THE BSP's SOLID TO 1e-10 ***", topo(rv) === 0 && rv.crossings === 0 && dv < 1e-10, show(rv) + "; |volume - BSP| " + dv.toExponential(1));
    ok("   control: the BSP on the same twelve, raw -- open, pinched, crossing itself for real (deeper than 1e-6); settled, still open at its triangles",
        rb.open > 0 && rb.pinchedVertices > 0 && deep(ab) > 1e-6 && rs.open > 0,
        "raw: " + show(rb) + ", deepest " + deep(ab).toExponential(1) + "; settled: " + show(rs) + ", deepest " + deep(as).toExponential(1));
    // (c) the default's one departure: crossings a rounding deep. Seed 12's shot 44 cuts slivers 3e-10 high near the
    // blobs' z = 0 equators; rounded to doubles, two nearly coplanar slivers sharing a corner cross along 4e-10 and reach
    // 7.7e-17 past each other. Measured, 12 chains x 100 shots every 25: 6 of 48 walls with 2..9, every one at most 1.8e-16 deep.
    let w12 = M.boxPolys([0, 0, 0], HALF);
    for (const b of pageBlasts(12, 50)) w12 = blastWith("bvh", w12, b).polys;
    const d12 = [], a12 = manifoldAudit(buf(w12), { detail: d12 });
    ok("!! seed 12, 50 shots: every topological property holds (closed, edge- and vertex-manifold, no degenerate triangle, touch or coplanar overlap); its crossings no deeper than an ulp at the wall's coordinates (8.9e-16)",
        topo(a12) === 0 && deep(d12) <= 8.9e-16, show(a12) + ", deepest " + deep(d12).toExponential(2) + ", longest " + (d12.length ? Math.max(...d12.map((x) => x.length)).toExponential(2) : "-"));
    report("KNOWN  rounding the exact arrangement to doubles: " + a12.crossings + " crossings on seed 12's wall at shot 50 (measured 2), a rounding deep. Closing them needs the output rounded with its topology checked (snap rounding) -- backlog bvh-csg-r20b-embedded-rounding.");
    ok("   (KNOWN, pinned) that wall's crossings stay within 2.5x the measured 2 -- a regression alarm", a12.crossings <= 5, String(a12.crossings));
    // (d) union and intersect (round 18b's booleanBVH): three five-op chains each
    const rng = (s0) => { let s = s0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
    let opsBad = 0; const opsShow = [];
    for (const op of ["union", "intersect"]) for (let seed = 1; seed <= 3; seed++) {
        const r = rng(seed * 101); let w = M.boxPolys([0, 0, 0], HALF);
        for (let k = 0; k < 5; k++) { const c = [(r() * 2 - 1) * 3, (r() * 2 - 1) * 2, (r() * 2 - 1) * 0.3]; w = booleanBVH(w, M.jaggedBlob(c, 0.4 + r() * 1.4, 4 + Math.floor(r() * 10), seed * 10 + k, { rough: r() * 0.9, floor: 0.3 }), op).polys; }
        const a = manifoldAudit(buf(w)); if (topo(a) || a.crossings) { opsBad++; opsShow.push(op + seed + ": " + show(a)); }
    }
    ok("!! union and intersect, three five-op chains each: two-manifold", opsBad === 0, opsBad + " of 6 with a defect" + (opsShow.length ? " -- " + opsShow.join("; ") : ""));
}

console.log(`\nblastEngine-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: the page draws polygons on a 2D canvas and nothing here looks at the " +
    "picture; the finishing pass closes the seam's near-misses after the fact -- the arrangements still disagree on " +
    "seam points under 8 snaps apart, which snap rounding would fix at the root (backlog: round 16); a finished vertex " +
    "may sit up to the weld tolerance off its polygon's plane; meshBoolean rebuilds the whole wall's BVH every shot " +
    "(the BSP builds its polygon index every shot too); and the flag is the page's alone -- no other caller in the " +
    "engine cuts a mesh today.");
process.exit(fails ? 1 : 0);
