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
"use strict";

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as M from "./meshCSG.mjs";
import { blastWith, blastBVH, BLAST_ENGINES, DEFAULT_BLAST_ENGINE } from "./blastEngine.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "../../tools/ship/playwrightResolve.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("blastEngine-selfcheck -- meshBoolean behind a flag, on the page's own workload\n");

const HALF = [4, 3, 0.35];                                    // destructible.html's wall
const MEASURED_ZERO = 18, MEASURED_PAGE_UN = 52;              // section 2, measured on the final files
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
function tagBad(wall, blobs) {
    // a CUT polygon's plane IS a blob polygon's plane (turned round), carried, not recomputed -- so look blob planes up
    // by w, both signs, and then test the polygon's vertices against each candidate
    const byW = new Map();
    for (const q of blobs.flat()) for (const w of [q.pl.w, -q.pl.w]) { if (!byW.has(w)) byW.set(w, []); byW.get(w).push(q.pl); }
    let bad = 0, worstOwn = 0, degenerate = 0;
    for (const p of wall) {
        const own = dist(p, p.pl); worstOwn = Math.max(worstOwn, own);
        if (own > 1e-9) bad++;
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
        if (p.src === M.SKIN) { if (!wallPlanes.some((pl) => dist(p, pl) < 1e-9)) bad++; }
        else if (p.src === M.CUT) { if (!(byW.get(p.pl.w) || []).some((pl) => dist(p, pl) < 1e-9) || wallPlanes.some((pl) => dist(p, pl) < 1e-9)) bad++; }
        else bad++;
    }
    return { bad, worstOwn, degenerate };
}
const run = (engine, blobs, wall = M.boxPolys([0, 0, 0], HALF)) => {
    let ms = 0, fb = 0, unknown = 0, worstShot = 0;
    for (const b of blobs) {
        const r = blastWith(engine, wall, b); wall = r.polys; ms += r.stats.ms; worstShot = Math.max(worstShot, r.stats.ms);
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
        const r = run(engine, blobs), t = tagBad(r.wall, blobs);
        const shape = r.wall.every((p) => Array.isArray(p.vs) && p.vs.length >= 3 && p.pl && p.pl.n && typeof p.pl.w === "number");
        ok("!! " + engine + ": every polygon has vs, its own plane (within 1e-9, facing its winding) and a tag that says where it came from",
            shape && t.bad === 0, r.wall.length + " polygons, " + t.bad + " astray, worst distance from its own plane " + t.worstOwn.toExponential(1));
    }
    const b1 = blastBVH(M.boxPolys([0, 0, 0], HALF), blobs[0]);
    ok("!! bvh: every output triangle knows the input polygon it is a piece of (meshBoolean's `from`, round 13)",
        b1.stats.unknown === 0 && b1.polys.length === b1.stats.triangles, b1.stats.triangles + " triangles, " + b1.stats.unknown + " without provenance");
    // a piece of the wall shares its source polygon's plane OBJECT, as the BSP's splitPolygon does
    const wall0 = M.boxPolys([0, 0, 0], HALF), b2 = blastBVH(wall0, blobs[0]);
    ok("   a piece of the wall carries its source polygon's plane itself, not a recomputed one (settle groups by plane)",
        b2.polys.filter((p) => p.src === M.SKIN).every((p) => wall0.some((q) => q.pl === p.pl)));
}

console.log("\n2. *** THE PAGE'S WORKLOAD, BOTH ENGINES ***");
{
    let worstRel = 0, bad = 0, crackAll = 0, crack7 = 0, pageUn = 0, fb = 0, unknown = 0, runs = 0, zeroShots = 0;
    const ms = { bsp: 0, bvh: 0 }, polys = { bsp: 0, bvh: 0 }, bspUn = { n: 0 }, degen = { bsp: 0, bvh: 0 };
    const chains = [];
    for (let seed = 1; seed <= 20; seed++) chains.push(pageBlasts(seed, 5));
    chains.push(pageBlasts(107, 30));   // the chain that found this round's three arrangement defects (below)
    for (const blobs of chains) {
        const a = run("bsp", blobs), b = run("bvh", blobs);
        const va = M.volume(a.wall), vb = M.volume(b.wall);
        worstRel = Math.max(worstRel, Math.abs(va - vb) / va);
        const ta = tagBad(a.wall, blobs), tb = tagBad(b.wall, blobs);
        bad += ta.bad + tb.bad; degen.bsp += ta.degenerate; degen.bvh += tb.degenerate;
        crackAll += cracks(b.wall); crack7 += cracks(b.wall, 1e-7);
        const u = pageCensus(b.wall); pageUn += u; if (u === 0) zeroShots++;
        bspUn.n += pageCensus(a.wall);
        fb += b.fb; unknown += b.unknown; runs++;
        ms.bsp += a.ms; ms.bvh += b.ms; polys.bsp += a.wall.length; polys.bvh += b.wall.length;
    }
    ok("!! *** " + runs + " CHAINS (20 of 5 shots, 1 of 30): THE TWO ENGINES CUT THE SAME SOLID TO 1e-10 RELATIVE ***",
        worstRel < 1e-10, "worst relative volume difference " + worstRel.toExponential(2));
    ok("!! every polygon of every final wall, both engines: tagged, on the right planes, on its own plane, facing its way", bad === 0,
        bad + " astray; polygons too small to have an orientation: BSP " + degen.bsp + ", BVH " + degen.bvh);
    ok("!! the BVH engine's raw output is CLOSED at the arc's 1e-6 census on every chain, with no fallback and no provenance gap",
        crackAll === 0 && fb === 0 && unknown === 0, "cracks " + crackAll + ", fallback triangles " + fb + ", untraced triangles " + unknown);
    ok("   ...and at the PAGE's own 1e-9 census it is closed on most chains; what is left joins vertices under 1e-7 apart (no crack at a 1e-7 key)",
        crack7 === 0 && zeroShots >= MEASURED_ZERO && pageUn <= 2.5 * MEASURED_PAGE_UN,
        "unmatched 0 on " + zeroShots + " of " + runs + " chains, " + pageUn + " edges in all (measured " + MEASURED_ZERO + " and " + MEASURED_PAGE_UN +
        "), cracks at a 1e-7 key " + crack7 + "; BSP raw: " + bspUn.n + " -- the page's settle exists for that");
    report("timings (printed, not asserted): BSP " + ms.bsp + " ms, BVH " + ms.bvh + " ms over " + runs + " chains (" + (ms.bsp / ms.bvh).toFixed(2) +
        "x); polygons at the end, summed: BSP " + polys.bsp + ", BVH " + polys.bvh + " (all triangles)");
}

console.log("\n3. *** SETTLE, AND BLASTING AGAIN AFTER IT ***");
{
    let untagged = 0, moved = 0, bad = 0, un = { bvh: 0, bsp: 0, bvhRaw: 0 }, worstRel = 0, degen3 = 0;
    for (let seed = 1; seed <= 8; seed++) {
        const blobs = pageBlasts(200 + seed, 8), first = blobs.slice(0, 4), then = blobs.slice(4);
        const res = {};
        for (const engine of BLAST_ENGINES) {
            const a = run(engine, first).wall, v0 = M.volume(a), s = M.settle(a).polys;
            untagged += s.filter((p) => p.src !== M.SKIN && p.src !== M.CUT).length;
            moved = Math.max(moved, Math.abs(M.volume(s) - v0) / v0);
            un[engine] += pageCensus(s); if (engine === "bvh") un.bvhRaw += pageCensus(a);
            const b = run(engine, then, s).wall, tb = tagBad(b, blobs);
            bad += tb.bad; degen3 += tb.degenerate; res[engine] = M.volume(b);
        }
        worstRel = Math.max(worstRel, Math.abs(res.bsp - res.bvh) / res.bsp);
    }
    ok("!! settle() on either engine's wall keeps every tag and moves the solid by under 1e-10 relative", untagged === 0 && moved < 1e-10,
        untagged + " untagged, worst move " + moved.toExponential(1));
    ok("!! blasting a SETTLED wall (merged polygons, not triangles): both engines, same solid to 1e-10, every tag right",
        bad === 0 && worstRel < 1e-10, bad + " astray (" + degen3 + " too small to have an orientation), worst relative difference " + worstRel.toExponential(2));
    report("page census after settle, 8 chains of 4: BSP " + un.bsp + ", BVH " + un.bvh + " (BVH raw before it: " + un.bvhRaw +
        "). settle's coplanar merge can open an edge in BVH output -- round 9 measured it -- and leaves about as many on the BSP's.");
}

console.log("\n4. *** THE PAGE, IN A REAL BROWSER ***");
{
    const html = fs.readFileSync(path.join(ENG, "destructible.html"), "utf8");
    ok("destructible.html blasts through blastWith() and no longer calls CSG.blast() itself",
        /blastWith\(engine, wall, blob/.test(html) && !/CSG\.blast\(/.test(html));
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

console.log(`\nblastEngine-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
console.log("unchecked here, named honestly: the page draws polygons on a 2D canvas and nothing here looks at the " +
    "picture; the BVH wall is all triangles, so the page draws more edges for the same solid until settle merges them; " +
    "meshBoolean rebuilds the whole wall's BVH every shot (the BSP builds its polygon index every shot too); and the " +
    "flag is the page's alone -- no other caller in the engine cuts a mesh today.");
process.exit(fails ? 1 : 0);
