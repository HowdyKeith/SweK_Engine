// WebGLEngine/physics/mesh/blastEngine.mjs
//
// *** BVH-CSG ROUND 13: meshBoolean BEHIND A FLAG IN THE ENGINE. *** The arc's notes: "only after rounds 9-12 would I
// consider putting meshBoolean behind a flag in the engine; nothing calls it today." One thing in the engine cuts a
// mesh -- destructible.html's blast, which calls meshCSG.mjs's blast() (a BSP, localised to the polygons the blob's
// box reaches) -- and one contract comes out of it that the rest of the engine reads: POLYGONS, each with its exact
// plane `pl` and a `src` tag, SKIN (the surface that was always there) or CUT (made by a blast), which
// render/solidTexture.mjs, render/rebar.mjs and physics/mesh/uvUnwrap.mjs select by. This file puts the two engines
// behind one call with that contract:
//
//   blastWith(engine, polys, blob, opts) -> { polys, stats }      engine: "bsp" (DEFAULT_BLAST_ENGINE) or "bvh"
//
// "bsp" is meshCSG.blast() exactly. "bvh" is meshBoolean.mjs's subtract, and its output is brought back into the
// contract by meshBoolean's per-triangle provenance (`from`, round 13): a piece of the wall keeps its source polygon's
// plane (exactly -- the same object, as the BSP's splitPolygon shares it) and tag (SKIN if it had none); a piece of the
// blob gets the blob polygon's plane turned round and the tag CUT. The wall goes in as polygons of any size and comes
// out as triangles -- meshBoolean's output is a triangle soup -- so a BVH wall is all triangles from its first shot.
// [ROUND 14: no longer -- below.]
//
// *** BVH-CSG ROUND 14: THE BVH WALL FINISHED, SHOT BY SHOT -- CLOSED AT THE PAGE'S OWN CENSUS WITH NO SETTLE. ***
// Round 13 left the raw output open at the page's 1e-9 census on 3 of its 21 chains (52 edges), every one between two
// points under 1e-7 apart, and all triangles. MEASURED, before anything was built: the pairs are not a rounding
// artefact of the census key -- 52 of the 58 nearest-vertex distances are 1e-10..1.4e-9, 6 are an ULP -- and they are
// SEAM points, each used by pieces of both operands: the seam itself leaves two points where one was meant. Of the 20
// distinct gaps, 11 are exactly the two ends of a sub-snap seam segment (<= 1e-9) that triArrangement.mjs counts as a
// point contact and drops; 6 are 1.07..1.36e-9 apart, past snap, so not that (the chain-end join, which moves a point
// up to JOIN x snap, is the likely cause and was NOT traced); one, 4.6e-10, touches one end of a dropped segment; 2
// are ULP twins. The
// final walls also hold 2,362 vertex pairs under 1e-15 apart that are not the same bits (the 1e-9 key hides them; an
// indexed mesh would not). A fix at the root makes every arrangement agree on its seam points before cutting -- snap
// rounding, the backlog's round 16. This round finishes the output instead (finishPieces, below):
//   - WELD each shot's new vertices within 8 snaps (JOIN: the arrangement's own largest move). Tried first: 4 snaps,
//     with the ends of a matched edge never joined -- that left a 5.5e-9 gap on section 3's seeds, and the protection
//     itself made a FOLD on the 30-shot chain (two coplanar edges coinciding, used twice each way) and blocked the last
//     crack on seed 346. Without it: none of either, on 91 chains. An edge under 8e-9 collapses with its vertices.
//   - an untouched polygon (every triangle of it came through bit for bit) is passed through as the same object, and a
//     vertex the wall already had never moves -- so the weld only ever touches this shot's pieces.
//   - MERGE the pieces of one source polygon while convex, every vertex kept; the triangles go with the polygon and are
//     what the next blast reads. (Re-triangulating merged polygons instead -- fan or ear-clipped -- opened 2,890 and
//     712 cracks over the 21 chains: long thin triangles along the collinear runs.)
//   - settleWith(): a wall only the BVH engine cut since the last settle is MERGED, not settled -- meshCSG.settle()
//     drops collinear vertices a neighbour uses and opened 3 edges on section 3's finished walls.
// AFTER (blastEngine-selfcheck): closed at the page's 1e-9 census on all 21 chains (raw: 52 edges on 3) and on 35
// fresh ones (raw: 135 on 17), and at 1024x scale; 0 fallbacks; the solid within 5.1e-13 of the BSP's (raw: 6.6e-12);
// 31,487 polygons where the raw wall has 50,834 triangles and the BSP's 105,836 polygons; finishing is 14% of the
// time. A finished vertex may sit up to the weld tolerance off its polygon's plane (worst measured 1.9e-9).
"use strict";

import * as M from "./meshCSG.mjs";
import { meshBoolean } from "./meshBoolean.mjs";
import { MeshBVH } from "../../mesh/meshBVH.mjs";

export const BLAST_ENGINES = ["bsp", "bvh"];
export const DEFAULT_BLAST_ENGINE = "bsp";

// polygons -> flat triangle buffer, with each triangle's source polygon. A polygon this file finished (round 14)
// carries the triangles it was merged from, and those go in exactly: the next shot sees the surface the last one
// made, not a re-triangulation of it. Any other polygon goes in as meshCSG.toTriangles' own fan, so its triangles are
// exactly the ones meshCSG would make (it drops fan triangles that cover nothing).
function trianglesOf(polys) {
    const tris = [], owner = [];
    polys.forEach((p, i) => { for (const t of p.tris || M.toTriangles([p])) { tris.push(t); owner.push(i); } });
    const buf = new Float64Array(tris.length * 9);
    tris.forEach((t, i) => { for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) buf[i * 9 + v * 3 + c] = t[v][c]; });
    return { buf, owner: Int32Array.from(owner), count: polys.map((p) => (p.tris ? p.tris.length : 0)) };
}

// *** ROUND 14: FINISHING. *** meshBoolean's output is a triangle soup whose seam can leave two points a few 1e-10
// apart where it should have one (this file's ROUND 14 paragraph, above), and every piece of it is a triangle. The pass:
//   WELD -- a vertex this shot made moves onto another within `weld` (8 x the arrangement's snap at the operands'
//     scale: JOIN, the farthest the arrangement itself moves a point). An edge that short collapses with it, and the
//     triangles on it go. A vertex the wall already had never moves, and two of them never join.
//   MERGE -- the pieces of one source polygon (same plane object, same tag) join across shared edges while the join
//     stays convex, keeping every vertex (a neighbour uses it). Each merged polygon keeps its triangles in `tris`.
// The polygons that came through untouched are kept as they were, objects and all.
export const FINISH_WELD_SNAPS = 8;   // triArrangement.mjs's JOIN: the farthest the arrangement itself moves a point
const SNAP = 1e-9;   // triArrangement.mjs's SNAP_EPS, at the operands' scale
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

export function finishPieces(pieces, { weld = FINISH_WELD_SNAPS * SNAP, merge = true, convexTol = 1e-10 } = {}) {
    const t0 = Date.now();
    const idOf = new Map(), P = [], old = [];
    const id = (v, isOld) => {
        const k = v[0] + "," + v[1] + "," + v[2];
        let i = idOf.get(k);
        if (i === undefined) { i = P.length; idOf.set(k, i); P.push(v); old.push(false); }
        if (isOld) old[i] = true;
        return i;
    };
    // a piece is a triangle (its own triangle), or a polygon with its triangles in `tris` -- or none (a polygon this
    // file did not make: it goes on with no triangles, and the next blast fans it as meshCSG would)
    const F = pieces.map((p) => p.vs.map((v, j) => id(v, p.oldCorner && p.oldCorner[j])));
    const T = pieces.map((p) => (p.tris ? p.tris.map((t) => t.map((v) => id(v, false))) : null));
    const W = 4294967296;
    const par = P.map((_, i) => i), hasOld = old.slice();
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const grid = new Map(), cellOf = (v) => [Math.floor(v[0] / weld), Math.floor(v[1] / weld), Math.floor(v[2] / weld)];
    if (weld > 0) P.forEach((v, i) => { const k = cellOf(v).join(); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); });
    let pairs = 0, refused = 0;
    if (weld > 0) P.forEach((v, i) => {
        const c = cellOf(v);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            for (const j of grid.get((c[0] + dx) + "," + (c[1] + dy) + "," + (c[2] + dz)) || []) {
                if (j <= i || len3(sub3(P[i], P[j])) > weld) continue;
                const a = find(i), b = find(j);
                if (a === b) continue;
                // two vertices the wall already had are never joined: one of them may be a corner of a polygon kept
                // whole, which this pass does not see (never on the page's workload -- a guard, and counted)
                if (hasOld[a] && hasOld[b]) { refused++; continue; }
                const lo = Math.min(a, b), hi = Math.max(a, b);
                par[hi] = lo; hasOld[lo] = hasOld[a] || hasOld[b]; pairs++;
            }
        }
    });
    // representative: the old vertex if the cluster has one, else its lexicographically smallest point
    const lex = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
    const rep = new Map();
    P.forEach((v, i) => {
        const r = find(i), c = rep.get(r);
        if (c === undefined || (old[i] && !old[c]) || (old[i] === old[c] && lex(v, P[c]) < 0)) rep.set(r, i);
    });
    const R = P.map((_, i) => rep.get(find(i)));
    let welded = 0, maxMove = 0, dropped = 0;
    R.forEach((r, i) => { if (r !== i) { welded++; maxMove = Math.max(maxMove, len3(sub3(P[i], P[r]))); } });
    let G = [];
    F.forEach((f, pi) => {
        const g = [];
        for (const x of f) if (R[x] !== g[g.length - 1]) g.push(R[x]);
        while (g.length > 1 && g[0] === g[g.length - 1]) g.pop();
        if (new Set(g).size < 3) { dropped++; return; }                               // collapsed by the weld
        const tris = pieces[pi].tris ? T[pi].map((t) => t.map((x) => R[x])).filter((t) => t[0] !== t[1] && t[1] !== t[2] && t[2] !== t[0])
                   : f.length === 3 ? [g] : null;
        G.push({ ids: g, tris, pl: pieces[pi].pl, src: pieces[pi].src });
    });
    let merged = 0;
    if (merge) {
        const byPl = new Map(); let ng = 0;
        const grp = G.map((p) => { let m = byPl.get(p.pl); if (!m) byPl.set(p.pl, (m = new Map())); let x = m.get(p.src); if (x === undefined) m.set(p.src, (x = ng++)); return x; });
        const alive = G.map(() => true), owner = new Map();
        const reg = (pi, on) => { const f = G[pi].ids; for (let i = 0; i < f.length; i++) { const k = f[i] * W + f[(i + 1) % f.length]; if (on) owner.set(k, pi); else if (owner.get(k) === pi) owner.delete(k); } };
        G.forEach((_, i) => reg(i, true));
        const convexAt = (u, v, w, n) => { const a = sub3(P[v], P[u]), b = sub3(P[w], P[v]); return dot3(cross3(a, b), n) >= -convexTol * len3(a) * len3(b); };
        const queue = G.map((_, i) => i);
        while (queue.length) {
            const pi = queue.pop();
            if (!alive[pi]) continue;
            const f = G[pi].ids;
            for (let e = 0; e < f.length; e++) {
                const a = f[e], b = f[(e + 1) % f.length], qi = owner.get(b * W + a);
                if (qi === undefined || qi === pi || !alive[qi] || grp[qi] !== grp[pi]) continue;
                // (no test for a second shared vertex -- a ring or a figure of eight: two convex polygons with disjoint
                // interiors that share an edge share nothing else, and the join below must stay convex. It never fired
                // on 91 chains, and was removed as redundant.)
                const g = G[qi].ids;
                const pf = [...f.slice(e + 1), ...f.slice(0, e + 1)];           // b ... a
                const ia = g.indexOf(a), qa = [...g.slice(ia), ...g.slice(0, ia)]; // a ... b
                const m = pf.concat(qa.slice(1, -1)), L = m.length, n = G[pi].pl.n, ai = pf.length - 1;
                if (!convexAt(m[(ai + L - 1) % L], m[ai], m[(ai + 1) % L], n) || !convexAt(m[L - 1], m[0], m[1], n)) continue;
                reg(pi, false); reg(qi, false); alive[qi] = false;
                G[pi] = { ids: m, tris: G[pi].tris && G[qi].tris ? G[pi].tris.concat(G[qi].tris) : null, pl: G[pi].pl, src: G[pi].src };
                reg(pi, true); merged++; queue.push(pi);
                break;
            }
        }
        G = G.filter((_, i) => alive[i]);
    }
    const polys = G.map((g) => (g.tris ? { vs: g.ids.map((i) => P[i]), pl: g.pl, src: g.src, tris: g.tris.map((t) => t.map((i) => P[i])) }
                                       : { vs: g.ids.map((i) => P[i]), pl: g.pl, src: g.src }));
    return { polys, stats: { pieces: pieces.length, welded, maxMove, pairs, refused, dropped, merged, ms: Date.now() - t0 } };
}

/**
 * The BVH engine's blast: wall - blob by meshBoolean, back in blast()'s contract.
 * @param {{vs:number[][], pl:{n:number[], w:number}, src?:string, tris?:number[][][]}[]} polys  the wall, closed
 * @param {{vs:number[][], pl:{n:number[], w:number}}[]} blob  the blast shape, closed
 * @param {object} [opts]  finish (round 14, default true): weld and merge the output (finishPieces); false gives
 *   round 13's raw triangles. Anything else is passed to meshBoolean (e.g. contacts, normalize).
 * @returns {{polys:object[], stats:object}}
 */
export function blastBVH(polys, blob, { finish = true, ...opts } = {}) {
    const t0 = Date.now();
    const A = trianglesOf(polys), B = trianglesOf(blob);
    const r = meshBoolean(A.buf, new MeshBVH(A.buf), B.buf, new MeshBVH(B.buf), "subtract", opts);
    const pieces = new Array(r.triCount), flipped = new Map();
    const whole = new Int32Array(polys.length), total = new Int32Array(polys.length);
    for (let i = 0; i < A.owner.length; i++) total[A.owner[i]]++;
    let unknown = 0;
    for (let i = 0; i < r.triCount; i++) {
        const o = i * 9, t = r.tris;
        const vs = [[t[o], t[o + 1], t[o + 2]], [t[o + 3], t[o + 4], t[o + 5]], [t[o + 6], t[o + 7], t[o + 8]]];
        const f = r.from[i];
        // a `from` out of either operand's range is no provenance at all: counted with the untraced, never indexed
        const p = f >= 0 && f < A.owner.length ? polys[A.owner[f]] : null;
        const q = f < 0 && -f - 1 < B.owner.length ? blob[B.owner[-f - 1]] : null;
        if (p) {
            // which corners are the source triangle's own (the wall had them: they never move), and is it all of it
            const oldCorner = vs.map((v) => { for (let c = 0; c < 3; c++) if (v[0] === A.buf[f * 9 + c * 3] && v[1] === A.buf[f * 9 + c * 3 + 1] && v[2] === A.buf[f * 9 + c * 3 + 2]) return true; return false; });
            let same = true;
            for (let k = 0; k < 9 && same; k++) same = t[o + k] === A.buf[f * 9 + k];
            if (same) whole[A.owner[f]]++;
            pieces[i] = { vs, pl: p.pl, src: p.src ?? M.SKIN, poly: A.owner[f], oldCorner };
        } else if (q) {
            let pl = flipped.get(q);
            if (!pl) { pl = { n: [-q.pl.n[0], -q.pl.n[1], -q.pl.n[2]], w: -q.pl.w }; flipped.set(q, pl); }
            pieces[i] = { vs, pl, src: M.CUT, poly: -1 };
        } else {
            unknown++;                                       // no provenance: not reached by any path today
            pieces[i] = { vs, pl: M.planeOf(vs), src: M.CUT, poly: -1 };
        }
    }
    const sa = r.stats.a, sb = r.stats.b;
    const stats = { engine: "bvh", triangles: r.triCount, fallbackTris: (sa.fallbackTris || 0) + (sb.fallbackTris || 0),
                    ambiguous: r.ambiguousTriIndices.length, capped: r.capped, emptyOperand: r.emptyOperand, unknown };
    if (!finish) {
        stats.ms = Date.now() - t0;
        return { polys: pieces.map(({ vs, pl, src }) => ({ vs, pl, src })), stats };
    }
    // a polygon every one of whose triangles came through whole is kept as it was; the rest is finished
    const keep = polys.map((_, i) => total[i] > 0 && whole[i] === total[i]);
    // (tagged as a piece of it would be: a wall polygon with no tag is SKIN -- boxPolys' own faces carry none)
    const kept = polys.filter((_, i) => keep[i]).map((p) => (p.src ? p : { ...p, src: M.SKIN }));
    const fin = finishPieces(pieces.filter((pc) => !(pc.poly >= 0 && keep[pc.poly])),
                             { weld: FINISH_WELD_SNAPS * SNAP * 2 ** (r.scaleExponent || 0) });
    Object.assign(stats, { kept: kept.length, finished: fin.polys.length, welded: fin.stats.welded, maxMove: fin.stats.maxMove,
                           weldRefused: fin.stats.refused, collapsed: fin.stats.dropped, merged: fin.stats.merged, finishMs: fin.stats.ms,
                           ms: Date.now() - t0 });
    return { polys: kept.concat(fin.polys), stats };
}

/**
 * Settle, by engine. "bsp" is meshCSG.settle(): snap, merge and weld the T-junctions a BSP wall is full of. "bvh" is
 * for a wall every blast since the last settle made with the BVH engine -- already closed, and welded shot by shot --
 * so it only MERGES, across shots: the pieces of one source polygon join while convex, every vertex kept (a merge
 * that keeps every vertex cannot open an edge; meshCSG.settle()'s drops collinear ones and opened 3 on section 3 of
 * the gate). A wall that mixes engines wants "bsp".
 */
export function settleWith(engine, polys) {
    const t0 = Date.now();
    if (engine === "bsp") { const r = M.settle(polys); return { polys: r.polys, stats: { engine, ...r.stats, ms: Date.now() - t0 } }; }
    if (engine !== "bvh") throw new Error('blastEngine: unrecognized engine "' + engine + '" (expected "bsp" or "bvh")');
    const pieces = polys.map((p) => ({ vs: p.vs, pl: p.pl, src: p.src ?? M.SKIN, tris: p.tris }));
    const r = finishPieces(pieces, { weld: 0 });
    return { polys: r.polys, stats: { engine, merged: r.stats.merged, ms: Date.now() - t0 } };
}

/**
 * One blast through the named engine. `select` is the BSP's polygon query (meshCSG.bvhSelect(polys).select); it is
 * built here when not given, and the BVH engine does not use it.
 */
export function blastWith(engine, polys, blob, { select = null, ...opts } = {}) {
    if (engine === "bsp") {
        const t0 = Date.now();
        const r = M.blast(polys, blob, { select: select || M.bvhSelect(polys).select });
        return { polys: r.polys, stats: { engine: "bsp", ...r.stats, ms: Date.now() - t0 } };
    }
    if (engine === "bvh") return blastBVH(polys, blob, opts);
    throw new Error('blastEngine: unrecognized engine "' + engine + '" (expected "bsp" or "bvh")');
}
