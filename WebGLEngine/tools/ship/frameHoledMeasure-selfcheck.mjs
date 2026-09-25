#!/usr/bin/env node
// WebGLEngine/tools/ship/frameHoledMeasure-selfcheck.mjs -- v4710: H9 as render/frame-holed-preregistration.md declared it at
// v4709, re-derived from its committed cache -- with C12 re-harvesting the first declared cell every run, and C21 checked
// again ON THE DECLARED CELLS: every frame at each ratio must differ from v4708's ratio-2 frame at the same speed.
// Run: node tools/ship/frameHoledMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { holeRow, CACHE_H8 } from "./frameHoles.mjs";
import { PREREG_H9, CACHE_H9, RESULT_H9, HOLED_KEYS, holedContrast, h9 } from "./frameHoled.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));

const d = declared(readDoc(PREREG_H9), HOLED_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H9), "utf8"));
const cache = gz(CACHE_H9);
const ratio2 = gz(CACHE_H8)[d.speed];

console.log("frameHoledMeasure-selfcheck -- holed frames against clean ones at upscale 1.5x and 3x: H9, re-derived\n");

console.log("1. *** PROVENANCE, AND C21 ON THE DECLARED CELLS ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.ratios.every((q) => cache[q] && d.scenes.every((s) => Array.isArray(cache[q][s]) && cache[q][s].length > 0 &&
        cache[q][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared scene at every declared ratio, with finite frame dB ***", complete,
       d.ratios.map((q) => `${q}x: ` + d.scenes.map((s) => (cache[q] && cache[q][s] ? cache[q][s].length : "MISSING")).join("/")).join("; "));
    if (!complete) { console.log(`\nframeHoledMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    const moved = d.ratios.map((q) => { let same = 0, n = 0;
        for (const s of d.scenes) cache[q][s].forEach((r, i) => { const o = ratio2[s][i]; if (o && o.frame === r.frame) { n++; if (o.genDb === r.genDb && o.cfDb === r.cfDb) same++; } });
        return [q, same, n]; });
    ok("*** C21 ON THE DECLARED CELLS: no frame at either ratio carries the dB v4708 read at ratio 2 -- the ratio was honoured ***",
       moved.every(([, same, n]) => same === 0 && n === d.scenes.length * 39),
       moved.map(([q, same, n]) => `${q}x: ${same} of ${n} frames identical to ratio 2`).join("; "));
    for (const q of d.ratios) per[q] = Object.fromEntries(d.scenes.map((s) => [s, holedContrast(cache[q][s], d)]));
    ok("*** every scene contrast, recomputed from the cached rows, is the recorded one ***", J(per) === J(R.per));
}

console.log("\n2. *** C12: THE FIRST DECLARED SCENE AT THE FIRST DECLARED RATIO, HARVESTED AGAIN ***");
{
    const s0 = d.scenes[0], q0 = d.ratios[0], t0 = Date.now();
    let again = null, err = "";
    try { again = await harvest({ scenes: [s0], upto: d.upto, speed: d.speed, settings: { ratio: q0 } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = again && again.length === cache[q0][s0].length && again.every((r, i) => { const c = cache[q0][s0][i];
        return r.frame === c.frame && r.genDb === c.genDb && r.cfDb === c.cfDb && J(r.y) === J(c.y) && J(r.x) === J(c.x); });
    ok(`*** C12: ${s0} at x${d.speed}, ratio ${q0}, re-harvested reproduces every row exactly ***`, !!same,
       again ? `${again.length} frames against ${cache[q0][s0].length}, in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `the page did not run: ${err}`);
}

console.log("\n3. *** H9, RE-DERIVED -- NOT SUPPORTED, AT EXACTLY THE PRICE THE DOCUMENT NAMED ***");
const H = h9(per, d);
{
    ok("*** the recomputed H9 is the recorded one ***", J(H) === J(R.h9));
    for (const q of d.ratios) say(`${q}x: scene / holed frames at mean advantage / clean frames at mean / contrast (clean minus holed) -- ` +
        d.scenes.map((s) => `${s} ${per[q][s].nHoled}@${per[q][s].holedAdv.toFixed(3)}/${per[q][s].nClean}@${per[q][s].cleanAdv.toFixed(3)}/${per[q][s].contrast.toFixed(3)}`).join("  "));
    const c15 = H.cells["1.5"], c3 = H.cells["3"];
    const rev = d.scenes.filter((s) => per["1.5"][s].contrast <= 0);
    ok("*** at 1.5x the t-test clears and the EXACT SIGN TEST DOES NOT: 6 of 7 is 8/128 -- and the one scene against it is checker ***",
       c15.reportable && !c15.cleared && c15.test.t.p < d.alpha && c15.test.sign.up === 6 && c15.test.sign.p === 8 / 128 && J(rev) === J(["checker"]),
       `contrast mean ${c15.test.t.mean.toFixed(3)} dB, t p ${c15.test.t.p.toExponential(2)}, sign 6/7 p ${c15.test.sign.p}. checker's holed frames ` +
       `score ${per["1.5"].checker.holedAdv.toFixed(3)} against its clean ${per["1.5"].checker.cleanAdv.toFixed(3)} -- they do BETTER. Section 4 of ` +
       "v4707's document and of this one: one scene against the direction fails the clause, and a failed clause is not 'trending'.");
    ok("*** at 3x the cell clears, 7 of 7 -- and like v4708's x8 cell, it is a cell, not H9 ***",
       c3.reportable && c3.cleared && c3.test.sign.up === 7, `contrast mean ${c3.test.t.mean.toFixed(3)} dB, t p ${c3.test.t.p.toExponential(2)}, sign 7/7 p ${c3.test.sign.p}`);
    ok("*** H9 IS NOT SUPPORTED: it was declared as BOTH ratios, and one failed ***", H.reportable && !H.supported);
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const holedIdx = (rows) => new Set(rows.map(holeRow).filter((f) => f.holes > 0).map((f) => f.frame));
    const ov = d.scenes.map((s) => { const a = holedIdx(ratio2[s]), parts = d.ratios.map((q) => { const b = holedIdx(cache[q][s]);
        const both = [...b].filter((f) => a.has(f)).length; return `${q}x ${b.size} (${both} shared)`; });
        return `${s}: 2x ${a.size}; ${parts.join(", ")}`; });
    say(`S30 WHICH FRAMES ARE HOLED, BY RATIO -- the document predicted "largely known in advance": ${ov.join("; ")}. ` +
        "Mostly shared, and not everywhere: checker at 3x has far more holed frames than at 2x. The resolution moves the reconciler's " +
        "vectors and with them the splat, so the prediction held for most scenes and not for the one that decided the outcome.");
    for (const q of d.ratios) {
        const hd = d.scenes.map((s) => { const fr = cache[q][s].map(holeRow), orc = mean(fr.map((f) => Math.max(f.adv, 0))), best = Math.max(mean(fr.map((f) => f.adv)), 0);
            return `${s} ${fr.filter((f) => f.adv > 0).length}/${fr.length} won, oracle +${(orc - best).toFixed(3)}`; });
        say(`S31 ${q}x headroom: ${hd.join("; ")}.`);
    }
    // v4710 -- COMPUTED, NOT WRITTEN. The first draft of this line said checker was "the exception twice" and had the weakest
    // rho at v4708; the weakest was bars, and at 2x checker's holed frames WERE below its clean ones. So the line now counts.
    const below = (rowsByScene) => d.scenes.filter((s) => { const c = holedContrast(rowsByScene[s], d); return c.contrast !== null && c.contrast > 0; });
    const cells = [["2x (v4708, chose the signal)", ratio2], ...d.ratios.map((q) => [`${q}x`, cache[q]])];
    say("ACROSS THE THREE CELLS THIS SIGNAL HAS BEEN READ AT, the scenes whose holed frames sit below their clean ones: " +
        cells.map(([nm, rows]) => { const b = below(rows); return `${nm} ${b.length} of 7${b.length < 7 ? " (not " + d.scenes.filter((s) => !b.includes(s)).join(", ") + ")" : ""}`; }).join("; ") +
        ". A description over three cells, the first of which chose the signal; no test is run on it.");
}

console.log(`\nframeHoledMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: H9, which is not supported; why checker differs; any geometry but this camera path; a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
