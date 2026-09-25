#!/usr/bin/env node
// WebGLEngine/tools/ship/frameSwayRep.mjs -- v4720: H15, which render/frame-sway2-preregistration.md declares.
//
// *** H14 REPLICATED AT A SECOND SPEED, WITH ITS OWN STATISTIC IMPORTED. *** The only new code is which document is read and
// where the harvest is written; the summary, the turn exclusion and the intersection-union test are H14's, and a
// replication that re-implemented them would be testing a different statistic. NOT RUN on a declared cell in the round that
// commits it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { cellOf } from "./frameGain.mjs";
import { SWAY_KEYS, swaySummary, h14, DEPTH_COL, SLAB_DEPTH_CUT } from "./frameSway.mjs";
import { SWAY_AMP, SLAB_DX } from "../../render/slabPath.mjs";
import { N_FEATURES } from "../../render/genGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PREREG_H15 = "render/frame-sway2-preregistration.md";
export const CACHE_H15 = "tools/ship/frameSwayRep-cache.json.gz";
export const RESULT_H15 = "tools/ship/frameSwayRep-result.json";
// H14's keys plus the one a replication adds: which hypothesis it replicates, whose recorded sign `direction` must be.
export const REP_KEYS = Object.freeze({ ...SWAY_KEYS, replicates: "str" });

/** H15 is H14's test, applied as it stands. */
export const h15 = (perByCell, d) => h14(perByCell, d);

// *** C26 -- THE REVERSAL, READ OFF THE PICTURE. *** The slab's blocks are found in the harvested depth column (H14's cut), and
// their mean position along the slab's own screen axis -- columns for x, rows for z -- must turn round at each turn the path
// names. The page's block grid is square (24 x 24 at the harvest resolution), so the axis is read from the block index.
export const GRID = 24;
export function centroidAlong(row, slabdir) {
    const out = [];
    for (let b = 0; b < row.y.length; b++) if (row.x[b * N_FEATURES + DEPTH_COL] < SLAB_DEPTH_CUT) out.push(slabdir === "x" ? b % GRID : Math.floor(b / GRID));
    return out.length ? out.reduce((a, v) => a + v, 0) / out.length : NaN;
}
/**
 * For each turn T: over the frames within W of it -- W half of the half-period, so no other turn is inside -- the centroid's
 * net movement BEFORE T and AFTER T must have opposite signs, and the extreme centroid in that span (the mean frame of any
 * tie) must sit within `tol` of T.
 *
 * *** v4720 -- THE FIRST DRAFT ASKED FOR TWO CONSECUTIVE STEPS OF OPPOSITE SIGN, AND THE PICTURE HAS PLATEAUS. *** At x1 the
 * slab moves about a third of a block a frame, so its block-quantised centroid moves in steps with flat runs between, and a
 * turn that lands on a flat run has no sign change between neighbours. The page, driven at x1, turned on both geometries and
 * the first draft saw neither.
 */
export function reversalsNear(rows, turns, slabdir, speed, tol = 1.5) {
    const W = Math.max(2, Math.floor(SWAY_AMP / (SLAB_DX * Number(speed))));          // half of the half-period 2A/v
    const c = rows.map((r) => ({ f: r.frame, v: centroidAlong(r, slabdir) })).filter((q) => Number.isFinite(q.v));
    return turns.map((T) => {
        const pre = c.filter((q) => q.f >= T - W && q.f <= T), post = c.filter((q) => q.f >= T && q.f <= T + W), span = c.filter((q) => Math.abs(q.f - T) <= W);
        if (pre.length < 2 || post.length < 2) return { turn: T, reversed: false, why: "the rows do not span the turn" };
        const before = pre[pre.length - 1].v - pre[0].v, after = post[post.length - 1].v - post[0].v;
        if (!(before * after < 0)) return { turn: T, reversed: false, before, after };
        const ext = before > 0 ? Math.max(...span.map((q) => q.v)) : Math.min(...span.map((q) => q.v));
        const at = span.filter((q) => q.v === ext).reduce((a, q, _, arr) => a + q.f / arr.length, 0);
        return { turn: T, reversed: Math.abs(at - T) <= tol, before, after, at };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const d = declared(readDoc(PREREG_H15), REP_KEYS);
    const { harvest } = await import("./genGateTrain.mjs");
    const cache = {};
    for (const c of d.cells) { const k = cellOf(c); cache[c] = {};
        for (const s of d.scenes) cache[c][s] = await harvest({ scenes: [s], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio, slabpath: d.path } }); }
    fs.writeFileSync(path.join(ENG, CACHE_H15), zlib.gzipSync(JSON.stringify(cache), { level: 9 }));
    const per = Object.fromEntries(d.cells.map((c) => [c, Object.fromEntries(d.scenes.map((s) => [s, swaySummary(cache[c][s], d, c)]))]));
    const out = { declared: d, per, h15: h15(per, d) };
    fs.writeFileSync(path.join(ENG, RESULT_H15), JSON.stringify(out, null, 1) + "\n");
    console.log(JSON.stringify({ h15: out.h15.reportable ? out.h15.supported : "not reportable" }));
}
