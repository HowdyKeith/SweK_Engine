#!/usr/bin/env node
// WebGLEngine/tools/ship/frameHolesMeasure-selfcheck.mjs -- v4708: H8 as render/frame-holes-preregistration.md declared it
// at v4707, re-derived from its committed cache, with C12 re-harvesting the first declared cell every time it runs.
// Run: node tools/ship/frameHolesMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { FRAME_KEYS, spearman } from "./frameGate.mjs";
import { PREREG_H8, CACHE_H8, RESULT_H8, holeRow, holeSummary, h8 } from "./frameHoles.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

const d = declared(readDoc(PREREG_H8), FRAME_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H8), "utf8"));
const cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, CACHE_H8))).toString("utf8"));

console.log("frameHolesMeasure-selfcheck -- are the frames generation loses the ones with the most occlusion? H8, re-derived\n");

console.log("1. *** PROVENANCE ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.speeds.every((sp) => cache[sp] && d.scenes.every((s) => Array.isArray(cache[sp][s]) && cache[sp][s].length > 0 &&
           cache[sp][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared scene at every declared speed, with finite frame dB on every row ***", complete,
       d.speeds.map((sp) => `x${sp}: ` + d.scenes.map((s) => (cache[sp] && cache[sp][s] ? cache[sp][s].length : "MISSING")).join("/")).join("; ") + " frames");
    if (!complete) { console.log(`\nframeHolesMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    for (const sp of d.speeds) per[sp] = Object.fromEntries(d.scenes.map((s) => [s, holeSummary(cache[sp][s], d)]));
    ok("*** every scene summary, recomputed from the cached rows, is the recorded one ***", J(per) === J(R.per));
}

console.log("\n2. *** C12: THE FIRST DECLARED SCENE AT THE FIRST DECLARED SPEED, HARVESTED AGAIN ***");
{
    const s0 = d.scenes[0], sp0 = d.speeds[0], t0 = Date.now();
    let again = null, err = "";
    try { again = await harvest({ scenes: [s0], upto: d.upto, speed: sp0 }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = again && again.length === cache[sp0][s0].length && again.every((r, i) => {
        const c = cache[sp0][s0][i];
        return r.frame === c.frame && r.genDb === c.genDb && r.cfDb === c.cfDb && J(r.y) === J(c.y) && J(r.x) === J(c.x); });
    ok(`*** C12: ${s0} at x${sp0} re-harvested reproduces every row exactly ***`, !!same,
       again ? `${again.length} frames against ${cache[sp0][s0].length}, in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `the page did not run: ${err}`);
}

console.log("\n3. *** H8, RE-DERIVED -- NOT REPORTED, BY THE ROUTE THE DOCUMENT NAMED IN ADVANCE ***");
const H = h8(per, d);
{
    ok("*** the recomputed H8 is the recorded one ***", J(H) === J(R.h8));
    for (const sp of d.speeds) say(`x${sp}: scene / mean hole fraction / frames with any hole / mean genDb-cfDb / within rho -- ` +
        d.scenes.map((s) => `${s} ${per[sp][s].holes.toFixed(5)}/${cache[sp][s].map(holeRow).filter((f) => f.holes > 0).length}of${per[sp][s].n}/${per[sp][s].adv.toFixed(3)}/${per[sp][s].rho === null ? "none" : per[sp][s].rho.toFixed(2)}`).join("  "));
    const x1 = H.cells["1"], noHoles = d.scenes.filter((s) => cache["1"][s].every((r) => holeRow(r).holes === 0));
    ok("*** x1 CANNOT ANSWER: the splat leaves no hole in any frame of six scenes, one scene is usable, five were needed ***",
       !x1.reportable && x1.usable.length === 1 && noHoles.length === 6,
       `no hole anywhere in ${noHoles.join(", ")}. Section 4, before the data: "if the splat leaves almost no holes, every scene falls under the floor. x1 is then unreportable, so H8 is not reported."`);
    ok("*** H8 IS NOT REPORTED -- neither supported nor refuted -- because one of its two declared speeds cannot answer ***",
       !H.reportable && !H.supported);
    const x8 = H.cells["8"];
    ok("*** the x8 CELL met its declared test -- 7 of 7 negative, t p < 0.001 -- and that is a CELL, not H8 ***",
       x8.reportable && x8.cleared && x8.test.sign.up === 7 && x8.test.t.p < 0.001,
       `-rho mean ${x8.test.t.mean.toFixed(3)}, t p ${x8.test.t.p.toExponential(2)}, sign 7/7 p ${x8.test.sign.p}. H8 was declared as BOTH speeds; ` +
       "promoting the one that answered would re-declare the hypothesis after seeing which half cleared.");
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const parts = d.scenes.map((s) => { const fr = cache["8"][s].map(holeRow), a = fr.filter((f) => f.holes > 0).map((f) => f.adv), b = fr.filter((f) => f.holes === 0).map((f) => f.adv);
        return `${s} ${a.length} holed at ${mean(a).toFixed(3)} vs ${b.length} clean at ${mean(b).toFixed(3)}`; });
    say(`S27 WHAT THE x8 CELL IS MADE OF: holes appear in only a few frames per scene, and those frames lose far more -- ${parts.join("; ")}. ` +
        "With most frames at exactly zero, the rho is close to a holed-against-clean comparison over a handful of frames, and the " +
        "mean hole fraction is a few hundredths of a percent of the frame. It says the holed frames are bad frames; it does not say " +
        "the pixels in the holes are why.");
    for (const sp of d.speeds) {
        const hd = d.scenes.map((s) => { const fr = cache[sp][s].map(holeRow); const orc = mean(fr.map((f) => Math.max(f.adv, 0))), best = Math.max(mean(fr.map((f) => f.adv)), 0);
            return `${s} ${per[sp][s].wins}/${fr.length} won, oracle +${(orc - best).toFixed(3)}`; });
        say(`S26 x${sp} headroom: ${hd.join("; ")}.`);
    }
    const seq = Object.fromEntries(d.scenes.map((s) => [s, cache["8"][s].map(holeRow).map((f) => f.holes)]));
    const rs = [];
    for (let i = 0; i < d.scenes.length; i++) for (let j = i + 1; j < d.scenes.length; j++) { const r = spearman(seq[d.scenes[i]], seq[d.scenes[j]]); if (r !== null) rs.push(r); }
    rs.sort((a, b) => a - b);
    say(`S28 section 3 PREDICTED the seven scenes' hole sequences would be nearly the same sequence. At x8 their pairwise rho runs from ` +
        `${rs[0].toFixed(2)} to ${rs[rs.length - 1].toFixed(2)}, median ${rs[rs.length >> 1].toFixed(2)} over ${rs.length} pairs: related, NOT ` +
        "nearly identical. The texture moves the holes more than the document expected, through the reconciler's choice of vector. " +
        "The prediction was only a reason for dropping an across-scene clause, and it is recorded as partly wrong rather than quietly kept.");
}

console.log(`\nframeHolesMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: H8 ITSELF, which is not reported; any cell other than x1 and x8; a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
