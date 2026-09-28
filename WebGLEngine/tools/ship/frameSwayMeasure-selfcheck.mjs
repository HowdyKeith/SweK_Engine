#!/usr/bin/env node
// WebGLEngine/tools/ship/frameSwayMeasure-selfcheck.mjs -- v4719: H14 as render/frame-sway-preregistration.md declared it at
// v4718, re-derived from its committed cache. C25 -- the slab stays whole in view -- is checked on every non-turn frame of
// both declared cells; C26 checks the path was honoured there, against the linear frames at the same speed, direction and
// ratio; and C12 re-harvests the first declared scene of the first declared cell every run.
// Run: node tools/ship/frameSwayMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { CACHE_H7 } from "./frameGate.mjs";
import { CACHE_H11, RESULT_H11, cellOf } from "./frameGain.mjs";
import { PREREG_H14, CACHE_H14, RESULT_H14, SWAY_KEYS, slabBlocks, nonTurnRows, swaySummary, h14 } from "./frameSway.mjs";
import { slabOffset } from "../../render/slabPath.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const signed = (x, k = 3) => x === null ? "null" : (x >= 0 ? "+" : "") + x.toFixed(k);

const d = declared(readDoc(PREREG_H14), SWAY_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H14), "utf8"));
const cache = gz(CACHE_H14);
// The LINEAR frames at each declared cell's speed, direction and ratio: v4706's forward x4 2x, and H11's vertical x4 2x.
const h7 = gz(CACHE_H7), h11 = gz(CACHE_H11);
const linearAt = (c) => { const k = cellOf(c);
    if (k.slabdir === "x" && k.ratio === "2") return h7[k.speed];
    const hit = Object.keys(h11).find((q) => J(cellOf(q)) === J(k));
    return hit ? h11[hit] : null; };

console.log("frameSwayMeasure-selfcheck -- motion's gain with the slab in view throughout: H14, re-derived\n");

console.log("1. *** PROVENANCE, C25 AND C26 ON BOTH DECLARED CELLS ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.cells.every((c) => cache[c] && d.scenes.every((s) => Array.isArray(cache[c][s]) && cache[c][s].length > 0 &&
        cache[c][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared cell and scene, with finite frame dB ***", complete,
       d.cells.map((c) => `${c}: ` + d.scenes.map((s) => (cache[c] && cache[c][s] ? cache[c][s].length : "MISSING")).join("/")).join("; "));
    if (!complete) { console.log(`\nframeSwayMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    // C25 -- THE SLAB STAYS WHOLE: every non-turn frame holds at least 90% of its scene-cell's first-frame slab blocks.
    for (const c of d.cells) {
        const low = [], counts = [];
        for (const s of d.scenes) { const rows = nonTurnRows(cache[c][s], cellOf(c).speed, d.path), first = slabBlocks(cache[c][s][0]);
            for (const r of rows) { const n = slabBlocks(r); counts.push(n); if (!(first > 0) || n < 0.9 * first) low.push(`${s}@${r.frame}:${n}/${first}`); } }
        ok(`*** C25 on ${c}: the slab stays whole in EVERY non-turn frame of every scene -- the design did what the document says ***`,
           low.length === 0 && counts.length > 0, low.length ? `below 90%: ${low.slice(0, 6).join(", ")}${low.length > 6 ? ", ..." : ""}` :
           `${counts.length} frames, slab blocks ${Math.min(...counts)} to ${Math.max(...counts)}`);
    }
    // C26 -- THE PATH WAS HONOURED ON THE DECLARED CELLS. *** THE FIRST DRAFT DEMANDED THAT EVERY SWAY FRAME DIFFER FROM ITS
    // LINEAR TWIN, AND IT WAS WRONG ABOUT THE PATH, NOT THE DATA. *** Vertically the sway has no camera term, and a triangle
    // wave rises at exactly the linear speed until its first turn -- at x4, t = 4.09 -- so frames 2, 3 and 4 sit on the SAME
    // path either way, to 1e-15, and 21 frames (3 per scene) carried the linear dB. Where the two paths coincide is computed
    // from render/slabPath.mjs at the three times a frame reads -- t - 1, t - 1/2 and t -- and C26 now requires every frame
    // whose path DIFFERS to carry different dB, and only a coinciding frame to be allowed the linear one.
    for (const c of d.cells) {
        const lin = linearAt(c), k = cellOf(c), dirX = k.slabdir === "x" ? 1 : 0;
        const coincide = (t) => [t - 1, t - 0.5, t].every((u) => Math.abs(slabOffset(Math.max(0, u), Number(k.speed), d.path, dirX) - slabOffset(Math.max(0, u), Number(k.speed), "linear", dirX)) < 1e-9);
        let same = 0, n = 0, bad = 0, onPath = 0;
        if (lin) for (const s of d.scenes) cache[c][s].forEach((r, i) => { const o = lin[s][i]; if (!o || o.frame !== r.frame) return; n++;
            const eq = o.genDb === r.genDb && o.cfDb === r.cfDb, co = coincide(r.frame); if (co) onPath++; if (eq) same++; if (eq && !co) bad++; });
        ok(`*** C26 on ${c}: every frame whose path DIFFERS from linear carries different dB -- only a coinciding frame may match ***`,
           !!lin && n === d.scenes.length * 39 && bad === 0,
           lin ? `${same} of ${n} frames match the linear dB, all of them among the ${onPath} whose path coincides with linear; ${bad} match off it` : "no linear cache at this cell");
    }
    for (const c of d.cells) per[c] = Object.fromEntries(d.scenes.map((s) => [s, swaySummary(cache[c][s], d, c)]));
    ok("*** every scene summary, recomputed from the cached rows, is the recorded one ***", J(per) === J(R.per));
}

console.log("\n2. *** C12: THE FIRST DECLARED SCENE OF THE FIRST DECLARED CELL, HARVESTED AGAIN ***");
{
    const c0 = d.cells[0], k = cellOf(c0), s0 = d.scenes[0], t0 = Date.now();
    let again = null, err = "";
    try { again = await harvest({ scenes: [s0], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio, slabpath: d.path } }); }
    catch (e) { err = String(e.message).slice(0, 160); }
    const same = again && again.length === cache[c0][s0].length && again.every((r, i) => { const c = cache[c0][s0][i];
        return r.frame === c.frame && r.genDb === c.genDb && r.cfDb === c.cfDb && J(r.y) === J(c.y) && J(r.x) === J(c.x); });
    ok(`*** C12: ${s0} at ${c0} on ${d.path}, re-harvested, reproduces every row exactly ***`, !!same,
       again ? `${again.length} frames against ${cache[c0][s0].length}, in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `the page did not run: ${err}`);
}

console.log("\n3. *** H14, RE-DERIVED ***");
const H = h14(per, d);
const cellMean = (c, key) => mean(d.scenes.map((s) => per[c][s][key]));
const R11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H11), "utf8"));
const h11Cell = (c) => R11.declared.cells.find((q) => cellOf(q).speed === cellOf(c).speed && cellOf(q).slabdir === cellOf(c).slabdir);
{
    ok("*** the recomputed H14 is the recorded one ***", J(H) === J(R.h14));
    for (const c of d.cells) say(`${c} ${d.path}: scene raw rho / partial given frame / gain~clock / advantage~clock / turn frames out -- ` +
        d.scenes.map((s) => { const p = per[c][s]; return `${s} ${signed(p.rho)}/${signed(p.partial)}/${signed(p.rGainClock)}/${signed(p.rAdvClock)}/${p.turns}`; }).join("  "));
    const fails = d.cells.filter((c) => !H.cells[c].cleared), clears = d.cells.filter((c) => H.cells[c].cleared);
    const f0 = fails.length === 1 ? H.cells[fails[0]] : null, c0 = clears.length === 1 ? H.cells[clears[0]] : null;
    const against = f0 ? d.scenes.filter((s) => d.direction * per[fails[0]][s].rho < 0) : [];
    // The document named zone as the likely price. It was not zone that paid it: computed, and said.
    ok("*** H14 IS NOT SUPPORTED: one cell stops at 6 of 7 -- and the scene against it is NOT the one the document named ***",
       H.reportable && !H.supported && !!f0 && f0.test.sign.up === 6 && against.length === 1 && against[0] !== "zone",
       f0 ? `${fails[0]}: sign 6/7 p ${f0.test.sign.p.toFixed(4)}, t p ${f0.test.t.p.toFixed(4)}, with ${against.join(", ")} against it (${signed(per[fails[0]][against[0]].rho)}). ` +
            `The document named zone; zone went WITH the direction in both cells (${d.cells.map((c) => signed(per[c].zone.rho)).join(", ")}).`
          : `expected exactly one failing cell, found ${fails.length}`);
    ok("*** and the other cell CLEARS, 7 of 7 -- reported as that cell's outcome and NOT promoted ***",
       !!c0 && c0.test.sign.up === 7, c0 ? `${clears[0]}: t p ${c0.test.t.p.toFixed(4)}, sign p ${c0.test.sign.p.toFixed(4)}` : `expected one clearing cell, found ${clears.length}`);
    // THE READING TABLE'S THIRD ROW, READ OFF THE DATA: rhos lean negative, so a weaker version survives -- how much weaker
    // is measured against H11 at the same speed and geometry on the linear path.
    const back = d.cells.flatMap((c) => d.scenes.filter((s) => d.direction * per[c][s].rho > 0)).length;
    const kept = d.cells.map((c) => cellMean(c, "rho") / mean(R11.declared.scenes.map((s) => R11.per[h11Cell(c)][s].rho)));
    ok("*** the reading is the table's third row: the rhos LEAN NEGATIVE, a weaker version survives -- reported, not promoted ***",
       back >= 12 && d.cells.every((c) => d.direction * cellMean(c, "rho") > 0) && kept.every((k) => k > 0 && k < 1),
       `${back} of ${d.cells.length * d.scenes.length} scene-cells backwards with the slab in view; mean rho ` +
       d.cells.map((c, i) => `${signed(cellMean(c, "rho"))} (${Math.round(100 * kept[i])}% of H11's ${signed(mean(R11.declared.scenes.map((s) => R11.per[h11Cell(c)][s].rho)))} on the linear path)`).join(", "));
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const share = d.cells.map((c) => Math.round(100 * (1 - cellMean(c, "partial") / cellMean(c, "rho"))));
    const gc = d.cells.flatMap((c) => d.scenes.map((s) => Math.abs(per[c][s].rGainClock)));
    say(`S40 the clock on sway: partialling out frame order moves the mean rho by ${d.cells.map((c, i) => `${share[i]}% ${cellOf(c).slabdir === "x" ? "forward" : "vertical"}`).join(" and ")} ` +
        `(v4717 on the linear path: 39% and 68%); gain follows frame order at mean |rho| ${mean(gc).toFixed(3)}.`);
    say(`S41 turn frames excluded: ${d.cells.map((c) => `${c} ${d.scenes.map((s) => per[c][s].turns).join("/")}`).join("; ")} of ${cache[d.cells[0]][d.scenes[0]].length} per scene.`);
    say("S42 raw rho, sway here against H11's linear path at the same speed and geometry: " + d.cells.map((c) =>
        `${cellOf(c).slabdir}: ` + d.scenes.map((s) => `${s} ${signed(per[c][s].rho, 2)}|${signed(R11.per[h11Cell(c)][s].rho, 2)}`).join(" ")).join("; ") + ".");
    const kept = d.cells.map((c) => Math.round(100 * cellMean(c, "rho") / mean(R11.declared.scenes.map((s) => R11.per[h11Cell(c)][s].rho))));
    say("WHAT THIS IS, AS A DESCRIPTION: with the slab whole in view in every scored frame, motion's gain still ranks frames " +
        `backwards in ${d.cells.flatMap((c) => d.scenes.filter((s) => d.direction * per[c][s].rho > 0)).length} of 14 scene-cells, at ` +
        `${kept.join("% and ")}% of the strength it had on the linear path -- so what separates the two paths, the slab leaving the view most ` +
        "visibly, accounts for part of H11's ranking and not all of it. The paths also differ in how the slab moves against the camera, and " +
        "nothing here separates those. " +
        "It clears on forward motion and misses vertically by one scene. No mechanism is claimed, and no threshold is fixed.");
}

console.log(`\nframeSwayMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: frames at a turn, which are excluded and not studied; why bars runs against the rest vertically; " +
            "a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
