#!/usr/bin/env node
// WebGLEngine/tools/ship/frameDisagreeMeasure-selfcheck.mjs -- v4723: H16 as render/frame-disagree-preregistration.md declared it
// at v4722, re-derived from its committed cache. C25 (the slab stays whole) and C26 (the slab reverses in the picture at every
// turn) are checked on every declared scene-cell, and C12 re-harvests the first declared scene of the first declared cell.
// Run: node tools/ship/frameDisagreeMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { turnsBetween } from "../../render/slabPath.mjs";
import { declared, readDoc } from "./foldStats.mjs";
import { spearman } from "./frameGate.mjs";
import { cellOf } from "./frameGain.mjs";
import { slabBlocks, nonTurnRows, RESULT_H14 } from "./frameSway.mjs";
import { reversalsNear } from "./frameSwayRep.mjs";
import { PREREG_H16, CACHE_H16, RESULT_H16, DIS_KEYS, disagreeSummary, h16 } from "./frameDisagree.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const signed = (x, k = 3) => x === null || x === undefined ? "null" : (x >= 0 ? "+" : "") + x.toFixed(k);

const d = declared(readDoc(PREREG_H16), DIS_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H16), "utf8"));
const cache = gz(CACHE_H16);

console.log("frameDisagreeMeasure-selfcheck -- the chain's two motion estimates disagreeing: H16, re-derived\n");

console.log("1. *** PROVENANCE, C25 AND C26 ON BOTH DECLARED CELLS ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.cells.every((c) => cache[c] && d.scenes.every((s) => Array.isArray(cache[c][s]) && cache[c][s].length > 0 &&
        cache[c][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared cell and scene, with finite frame dB ***", complete,
       d.cells.map((c) => `${c}: ` + d.scenes.map((s) => (cache[c] && cache[c][s] ? cache[c][s].length : "MISSING")).join("/")).join("; "));
    if (!complete) { console.log(`\nframeDisagreeMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    for (const c of d.cells) {
        const low = [], counts = [];
        for (const s of d.scenes) { const rows = nonTurnRows(cache[c][s], cellOf(c).speed, d.path), first = slabBlocks(cache[c][s][0]);
            for (const r of rows) { const n = slabBlocks(r); counts.push(n); if (!(first > 0) || n < 0.9 * first) low.push(`${s}@${r.frame}:${n}/${first}`); } }
        ok(`*** C25 on ${c}: the slab stays whole in EVERY non-turn frame of every scene ***`, low.length === 0 && counts.length > 0,
           low.length ? `below 90%: ${low.slice(0, 6).join(", ")}` : `${counts.length} frames, slab blocks ${Math.min(...counts)} to ${Math.max(...counts)}`);
    }
    for (const c of d.cells) {
        const k = cellOf(c), T = turnsBetween(1, d.upto, Number(k.speed), d.path), miss = [];
        for (const s of d.scenes) for (const q of reversalsNear(cache[c][s], T, k.slabdir, k.speed)) if (!q.reversed) miss.push(`${s}@${q.turn.toFixed(2)}`);
        ok(`*** C26 on ${c}: the slab reverses in the picture within 1.5 frames of EVERY turn, in every scene ***`,
           T.length > 0 && miss.length === 0, miss.length ? `no reversal: ${miss.join(", ")}` : `${T.length} turns x ${d.scenes.length} scenes, at t ${T.map((t) => t.toFixed(2)).join(", ")}`);
    }
    for (const c of d.cells) per[c] = Object.fromEntries(d.scenes.map((s) => [s, disagreeSummary(cache[c][s], d, c)]));
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

console.log("\n3. *** H16, RE-DERIVED ***");
const H = h16(per, d);
const cellMean = (c, key) => mean(d.scenes.map((s) => per[c][s][key]));
const against = (c) => d.scenes.filter((s) => d.direction * per[c][s].rho < 0);
const R14 = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H14), "utf8"));
const gainOnSway = (c) => { const q = R14.declared.cells.find((x) => cellOf(x).slabdir === cellOf(c).slabdir && cellOf(x).speed === cellOf(c).speed);
    return q ? mean(R14.declared.scenes.map((s) => R14.per[q][s].rho)) : null; };
{
    ok("*** the recomputed H16 is the recorded one ***", J(H) === J(R.h16));
    for (const c of d.cells) say(`${c} ${d.path}: scene signal / rho with advantage / rho with H11's gain / partial given frame -- ` +
        d.scenes.map((s) => { const p = per[c][s]; return `${s} ${p.signal.toFixed(3)}/${signed(p.rho)}/${signed(p.withGain)}/${signed(p.partial)}`; }).join("  "));
    ok("*** the qualifier holds: the signal is DISTINCT from H11's gain -- so whatever H16 says, it says about a different signal ***",
       H.distinct && H.meanAbsWithGain <= d.distinctMax, `mean |rho| with gain ${H.meanAbsWithGain.toFixed(3)} against a ceiling of ${d.distinctMax}`);
    ok("*** H16 IS NOT SUPPORTED: neither cell clears ***",
       H.reportable && !H.clears && !H.supported && d.cells.every((c) => !H.cells[c].cleared),
       d.cells.map((c) => { const t = H.cells[c].test; return `${c}: sign ${t.sign.up}/7 p ${t.sign.p.toFixed(4)}, t p ${t.t.p.toFixed(4)}, against: ${against(c).join(", ") || "none"}`; }).join("; "));
    // The reading table's third row, read off the data: the forward cell is near chance and the vertical leans but misses.
    ok("*** the reading is the table's third row -- vector disagreement does not rank the frame decision here -- and it is WEAK, not reversed ***",
       // COMPUTED, NOT TYPED: the gain's strength on sway at x4, same geometry, is read from H14's result.
       d.cells.every((c) => Math.abs(cellMean(c, "rho")) < 0.2),
       `mean rho ${d.cells.map((c) => signed(cellMean(c, "rho"))).join(", ")}, against motion's gain at ${d.cells.map((c) => signed(gainOnSway(c))).join(" and ")} on sway at x4 (H14) -- no cell's mean reaches 0.2 in either direction`);
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    say(`S45 the signal against the gain, per scene: ${d.cells.map((c) => `${c} ${d.scenes.map((s) => signed(per[c][s].withGain, 2)).join(" ")}`).join("; ")}.`);
    say(`S46 partial given frame, mean per cell: ${d.cells.map((c) => `${c} ${signed(cellMean(c, "partial"))} against raw ${signed(cellMean(c, "rho"))}`).join("; ")}.`);
    say("S47 across scenes, mean signal against mean advantage (no test): " +
        d.cells.map((c) => `${c} rho ${signed(spearman(d.scenes.map((s) => per[c][s].signal), d.scenes.map((s) => per[c][s].adv)))}`).join(", ") + ".");
    const back = d.cells.flatMap((c) => d.scenes.filter((s) => d.direction * per[c][s].rho > 0)).length;
    say(`WHAT THIS IS, AS A DESCRIPTION: ${back} of ${d.cells.length * d.scenes.length} scene-cells lean the declared way, at mean rho ` +
        `${d.cells.map((c) => signed(cellMean(c, "rho"))).join(" and ")}. Vector disagreement is a different signal from motion's gain -- the ` +
        "qualifier measured that -- and within a scene it barely orders which frames generation wins. No mechanism is claimed.");
}

console.log(`\nframeDisagreeMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: why the colour flow wins where it wins; a threshold, and a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
