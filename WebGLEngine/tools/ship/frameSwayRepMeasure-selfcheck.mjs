#!/usr/bin/env node
// WebGLEngine/tools/ship/frameSwayRepMeasure-selfcheck.mjs -- v4721: H15 as render/frame-sway2-preregistration.md declared it
// at v4720, re-derived from its committed cache. C25 (the slab stays whole) and C26 (the slab reverses in the picture at every
// turn) are checked on every declared scene-cell, and C12 re-harvests the first declared scene of the first declared cell.
// Run: node tools/ship/frameSwayRepMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { turnsBetween } from "../../render/slabPath.mjs";
import { declared, readDoc } from "./foldStats.mjs";
import { cellOf } from "./frameGain.mjs";
import { RESULT_H14, slabBlocks, nonTurnRows, swaySummary } from "./frameSway.mjs";
import { PREREG_H15, CACHE_H15, RESULT_H15, REP_KEYS, h15, reversalsNear } from "./frameSwayRep.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const signed = (x, k = 3) => x === null ? "null" : (x >= 0 ? "+" : "") + x.toFixed(k);

const d = declared(readDoc(PREREG_H15), REP_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H15), "utf8"));
const cache = gz(CACHE_H15);

console.log("frameSwayRepMeasure-selfcheck -- H14 replicated at x2 with the slab in view: H15, re-derived\n");

console.log("1. *** PROVENANCE, C25 AND C26 ON BOTH DECLARED CELLS ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.cells.every((c) => cache[c] && d.scenes.every((s) => Array.isArray(cache[c][s]) && cache[c][s].length > 0 &&
        cache[c][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared cell and scene, with finite frame dB ***", complete,
       d.cells.map((c) => `${c}: ` + d.scenes.map((s) => (cache[c] && cache[c][s] ? cache[c][s].length : "MISSING")).join("/")).join("; "));
    if (!complete) { console.log(`\nframeSwayRepMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
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
        ok(`*** C26 on ${c}: the slab reverses in the picture within 1.5 frames of EVERY turn, in every scene -- the path was honoured ***`,
           T.length > 0 && miss.length === 0, miss.length ? `no reversal: ${miss.join(", ")}` : `${T.length} turns x ${d.scenes.length} scenes, at t ${T.map((t) => t.toFixed(2)).join(", ")}`);
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

console.log("\n3. *** H15, RE-DERIVED ***");
const H = h15(per, d);
const R14 = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H14), "utf8"));
const twin = (c) => R14.declared.cells.find((q) => cellOf(q).slabdir === cellOf(c).slabdir);
const cellMean = (P, c) => mean(d.scenes.map((s) => P[c][s].rho));
const against = (P, c) => d.scenes.filter((s) => d.direction * P[c][s].rho < 0);
{
    ok("*** the recomputed H15 is the recorded one ***", J(H) === J(R.h15));
    for (const c of d.cells) say(`${c} ${d.path}: scene rho here | H14's at x${cellOf(twin(c)).speed} / partial given frame / turn frames out -- ` +
        d.scenes.map((s) => `${s} ${signed(per[c][s].rho)}|${signed(R14.per[twin(c)][s].rho)}/${signed(per[c][s].partial)}/${per[c][s].turns}`).join("  "));
    ok("*** H15 IS NOT SUPPORTED: NEITHER cell clears -- each stops at 6 of 7, with a DIFFERENT scene against it in each ***",
       H.reportable && !H.supported && d.cells.every((c) => !H.cells[c].cleared && H.cells[c].test.sign.up === 6 && against(per, c).length === 1) &&
       new Set(d.cells.map((c) => against(per, c)[0])).size === d.cells.length,
       // v4721 -- READ THROUGH A LOOKUP THAT CAN BE EMPTY. A sabotage that let a cell reach 7 of 7 left nobody against it, and the
       // first draft read `.rho` off a scene that did not exist -- a crash after two rows had reddened, not a verdict.
       d.cells.map((c) => { const a = against(per, c), t = H.cells[c].test;
           return `${c}: sign ${t ? t.sign.up : "?"}/7${t ? ` p ${t.sign.p.toFixed(4)}, t p ${t.t.p.toFixed(4)}` : ""}, ` +
                  (a.length ? a.map((s) => `${s} against at ${signed(per[c][s].rho)}`).join(", ") : "nobody against it"); }).join("; ") +
       `. The document named bars and zone as the scenes that had gone against it before; ${d.cells.map((c) => against(per, c)[0]).filter((s) => ["bars", "zone"].includes(s)).join(", ") || "neither"} did here.`);
    const back = d.cells.flatMap((c) => d.scenes.filter((s) => d.direction * per[c][s].rho > 0)).length;
    ok("*** the reading is the table's third row: neither clears and the rhos LEAN NEGATIVE -- the direction holds and the strength does not replicate ***",
       back >= 12 && d.cells.every((c) => d.direction * cellMean(per, c) > 0), `${back} of ${d.cells.length * d.scenes.length} scene-cells backwards; mean rho ${d.cells.map((c) => signed(cellMean(per, c))).join(", ")}`);
    const h14cleared = R14.declared.cells.filter((c) => R14.h14.cells[c].cleared).map((c) => cellOf(c).slabdir);
    ok("*** and H14's split does NOT recur: the geometry that cleared at x4 does not clear at x2 ***",
       h14cleared.length === 1 && d.cells.filter((c) => cellOf(c).slabdir === h14cleared[0]).every((c) => !H.cells[c].cleared),
       `H14 cleared on ${h14cleared.join("")} at x4; here ${d.cells.map((c) => `${cellOf(c).slabdir} ${H.cells[c].cleared ? "clears" : "does not"}`).join(", ")}`);
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    say("S43 mean rho here against H14's, same geometry: " + d.cells.map((c) => `${cellOf(c).slabdir} ${signed(cellMean(per, c))} at x2 | ${signed(cellMean(R14.per, twin(c)))} at x4`).join("; ") +
        ". The scene against it: " + d.cells.map((c) => `${cellOf(c).slabdir} ${against(per, c).join(",") || "none"} here, ${against(R14.per, twin(c)).join(",") || "none"} in H14`).join("; ") + ".");
    const share = d.cells.map((c) => Math.round(100 * (1 - mean(d.scenes.map((s) => per[c][s].partial)) / cellMean(per, c))));
    say(`S44 the clock on sway at x2: partialling out frame order moves the mean rho by ${share.join("% and ")}%.`);
    // The four sway cells together -- a description with no test, and no scene named after the fact.
    const four = [...d.cells.map((c) => per[c]), ...R14.declared.cells.map((c) => R14.per[c])];
    const back4 = four.reduce((a, P) => a + d.scenes.filter((s) => d.direction * P[s].rho > 0).length, 0);
    const always = d.scenes.filter((s) => four.every((P) => d.direction * P[s].rho > 0));
    const agAll = four.map((P) => d.scenes.filter((s) => d.direction * P[s].rho < 0));
    const cellNames = [...d.cells.map((c) => `${c} x2`), ...R14.declared.cells.map((c) => `${c} x4`)];
    say(`WHAT THIS IS, AS A DESCRIPTION: across the four sway cells, x4 and x2 on both geometries, ${back4} of ${four.length * d.scenes.length} scene-cells ` +
        `rank backwards, and the mean rho at x2 is close to H14's -- ${d.cells.map((c) => `${signed(cellMean(per, c))} against ${signed(cellMean(R14.per, twin(c)))}`).join(", ")}. ` +
        // COMPUTED, NOT TYPED: the first draft said "a different scene each time", and bars went against it in two of the four.
        `What did not replicate is the consistency the exact sign test asks for: the scenes against it, cell by cell, are ${agAll.map((a) => a.length ? a.join(",") : "none").join(" / ")} ` +
        `(${cellNames.join(" / ")}). ${always.length} scenes go backwards in all four cells (${always.join(", ")}). No test is attached to any of this, and no scene is dropped.`);
}

console.log(`\nframeSwayRepMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: frames at a turn; why one scene per cell goes the other way; a threshold, and a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
