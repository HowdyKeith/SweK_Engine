#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGainMeasure-selfcheck.mjs -- v4715: H11 as render/frame-gain-preregistration.md declared it
// at v4714, re-derived from its committed cache, with C12 re-harvesting the first declared scene of the first declared cell
// every run, and C23 checked on both declared cells: every frame must differ from v4706's forward x4 2x frame.
// Run: node tools/ship/frameGainMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { CACHE_H7 } from "./frameGate.mjs";
import { spearman } from "./frameGate.mjs";
import { PREREG_H11, CACHE_H11, RESULT_H11, GAIN_KEYS, cellOf, gainRow, gainSummary, h11 } from "./frameGain.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const signed = (x, k = 3) => (x >= 0 ? "+" : "") + x.toFixed(k);

const d = declared(readDoc(PREREG_H11), GAIN_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H11), "utf8"));
const cache = gz(CACHE_H11);
const ref = gz(CACHE_H7)["4"];   // v4706's forward x4 at the default 2x: the frames C23 says neither cell may reproduce

console.log("frameGainMeasure-selfcheck -- motion's gain over standing still, summed over the frame: H11, re-derived\n");

console.log("1. *** PROVENANCE, AND C23 ON BOTH DECLARED CELLS ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.cells.every((c) => cache[c] && d.scenes.every((s) => Array.isArray(cache[c][s]) && cache[c][s].length > 0 &&
        cache[c][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared cell and scene, with finite frame dB ***", complete,
       d.cells.map((c) => `${c}: ` + d.scenes.map((s) => (cache[c] && cache[c][s] ? cache[c][s].length : "MISSING")).join("/")).join("; "));
    if (!complete) { console.log(`\nframeGainMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    for (const c of d.cells) {
        let same = 0, n = 0;
        for (const s of d.scenes) cache[c][s].forEach((r, i) => { const o = ref[s][i]; if (o && o.frame === r.frame) { n++; if (o.genDb === r.genDb && o.cfDb === r.cfDb) same++; } });
        const k = cellOf(c);
        ok(`*** C23 on ${c}: no frame carries the dB v4706 read at x4 forward 2x -- the ${k.slabdir !== "x" ? "direction" : "ratio"} was honoured ***`,
           same === 0 && n === d.scenes.length * 39, `${same} of ${n} frames identical`);
    }
    for (const c of d.cells) per[c] = Object.fromEntries(d.scenes.map((s) => [s, gainSummary(cache[c][s], d)]));
    ok("*** every scene summary, recomputed from the cached rows, is the recorded one ***", J(per) === J(R.per));
}

console.log("\n2. *** C12: THE FIRST DECLARED SCENE OF THE FIRST DECLARED CELL, HARVESTED AGAIN ***");
{
    const c0 = d.cells[0], k = cellOf(c0), s0 = d.scenes[0], t0 = Date.now();
    let again = null, err = "";
    try { again = await harvest({ scenes: [s0], upto: d.upto, speed: k.speed, settings: { slabdir: k.slabdir, ratio: k.ratio } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = again && again.length === cache[c0][s0].length && again.every((r, i) => { const c = cache[c0][s0][i];
        return r.frame === c.frame && r.genDb === c.genDb && r.cfDb === c.cfDb && J(r.y) === J(c.y) && J(r.x) === J(c.x); });
    ok(`*** C12: ${s0} at ${c0}, re-harvested, reproduces every row exactly ***`, !!same,
       again ? `${again.length} frames against ${cache[c0][s0].length}, in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `the page did not run: ${err}`);
}

console.log("\n3. *** H11, RE-DERIVED -- NOT SUPPORTED, AND BY THE ROUTE THE DOCUMENT NAMED AS THE REASON TO EXPECT IT ***");
const H = h11(per, d);
const neg = (c) => d.scenes.filter((s) => per[c][s].rho !== null && per[c][s].rho < 0);
const pos = (c) => d.scenes.filter((s) => per[c][s].rho !== null && per[c][s].rho > 0);
{
    ok("*** the recomputed H11 is the recorded one ***", J(H) === J(R.h11));
    for (const c of d.cells) say(`${c}: scene rho / H6's block-mean rho / mean gain / mean advantage / wins -- ` +
        d.scenes.map((s) => { const p = per[c][s]; return `${s} ${signed(p.rho)}/${signed(p.blockRho)}/${p.gain.toFixed(3)}/${signed(p.adv)}/${p.wins}`; }).join("  "));
    ok("*** H11 IS NOT SUPPORTED: both cells reportable with no scene excluded, and NEITHER clears -- not a one-scene price ***",
       H.reportable && !H.supported && d.cells.every((c) => H.cells[c].excluded.length === 0 && !H.cells[c].cleared && H.cells[c].test.sign.up <= 1),
       d.cells.map((c) => `${c}: sign ${H.cells[c].test.sign.up}/7, t mean ${signed(H.cells[c].test.t.mean)}`).join("; ") +
       ". The one-sided p-values are near 1, which is what a test in the wrong direction reads.");
    // THE DOCUMENT'S NAMED REASON TO EXPECT FAILURE: frame rhos that lean NEGATIVE would replicate H6's shape where the
    // decision is made. Counted, and the exception compared across geometries -- not typed.
    const same = J(pos(d.cells[0])) === J(pos(d.cells[1]));
    ok("*** and the rhos lean NEGATIVE in both cells, with the SAME exception on both geometries -- H6's shape, replicated at the frame ***",
       d.cells.every((c) => neg(c).length >= 6) && same,
       `${d.cells.map((c) => `${c}: ${neg(c).length} of 7 negative`).join(", ")}; the exception on both: ${pos(d.cells[0]).join(", ") || "none"}. ` +
       `Mean rho ${d.cells.map((c) => signed(mean(d.scenes.map((s) => per[c][s].rho)))).join(" and ")}. THE NEGATION IS NOT TESTED: v4703 required a ` +
       "negation to get its own document and data it has not seen, and these are the data it has now seen.");
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const agree = d.cells.reduce((a, c) => a + d.scenes.filter((s) => Math.sign(per[c][s].rho) === Math.sign(per[c][s].blockRho)).length, 0);
    say(`S37 summing against H6's mean of block scores: the two rhos share a sign in ${agree} of ${d.cells.length * d.scenes.length} scene-cells -- ` +
        "summing, which gives flat blocks no weight, did not change the direction.");
    say("S36 across scenes, mean gain against mean advantage (no test): " +
        d.cells.map((c) => `${c} rho ${signed(spearman(d.scenes.map((s) => per[c][s].gain), d.scenes.map((s) => per[c][s].adv)))}`).join(", ") + ".");
    say("S35 headroom per cell: " + d.cells.map((c) => `${c} ` + d.scenes.map((s) => { const fr = cache[c][s].map(gainRow),
        orc = mean(fr.map((f) => Math.max(f.adv, 0))), best = Math.max(mean(fr.map((f) => f.adv)), 0);
        return `${s} +${(orc - best).toFixed(3)}`; }).join(" ")).join("; ") + ".");
    const all = d.cells.flatMap((c) => d.scenes.map((s) => per[c][s].rho)), nNeg = all.filter((r) => r < 0).length;
    say(`WHAT THIS IS, AS A DESCRIPTION: ${nNeg} of ${all.length} scene-cells rank backwards, on two geometries that H10 showed disagree about ` +
        "holes. It is the first frame-level pattern in this arc to hold its sign across geometry -- and it is the opposite of the direction " +
        "v4695 and v4702 fixed. The window confound v4705's document named still applies: the slab leaves the view within the harvest, " +
        "moving a frame's motion and its advantage together, and nothing here separates them. No mechanism is claimed.");
}

console.log(`\nframeGainMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: the negation, which owes its own document and fresh cells; why zone is the exception; a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
