#!/usr/bin/env node
// WebGLEngine/tools/ship/frameReverseMeasure-selfcheck.mjs -- v4717: H12 and H13 as render/frame-reverse-preregistration.md
// declared them at v4716, re-derived from their committed cache, with C12 re-harvesting the first declared scene of the first
// declared cell every run, and C24 checked on both declared cells: no frame may carry v4706's forward x2 2x dB.
// Run: node tools/ship/frameReverseMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { CACHE_H7 } from "./frameGate.mjs";
import { RESULT_H11, cellOf } from "./frameGain.mjs";
import { PREREG_H12, CACHE_H12, RESULT_H12, REV_KEYS, reverseSummary, reverse } from "./frameReverse.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const signed = (x, k = 3) => x === null ? "null" : (x >= 0 ? "+" : "") + x.toFixed(k);

const d = declared(readDoc(PREREG_H12), REV_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H12), "utf8"));
const cache = gz(CACHE_H12);
const ref = gz(CACHE_H7)["2"];   // v4706's forward x2 at the default 2x: the frames C24 says neither cell may reproduce

console.log("frameReverseMeasure-selfcheck -- H11's negation at x2 on both geometries, and with the clock taken out: H12 and H13, re-derived\n");

console.log("1. *** PROVENANCE, AND C24 ON BOTH DECLARED CELLS ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.cells.every((c) => cache[c] && d.scenes.every((s) => Array.isArray(cache[c][s]) && cache[c][s].length > 0 &&
        cache[c][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared cell and scene, with finite frame dB ***", complete,
       d.cells.map((c) => `${c}: ` + d.scenes.map((s) => (cache[c] && cache[c][s] ? cache[c][s].length : "MISSING")).join("/")).join("; "));
    if (!complete) { console.log(`\nframeReverseMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    for (const c of d.cells) {
        let same = 0, n = 0;
        for (const s of d.scenes) cache[c][s].forEach((r, i) => { const o = ref[s][i]; if (o && o.frame === r.frame) { n++; if (o.genDb === r.genDb && o.cfDb === r.cfDb) same++; } });
        const k = cellOf(c);
        ok(`*** C24 on ${c}: no frame carries the dB v4706 read at x2 forward 2x -- the ${k.slabdir !== "x" ? "direction" : "ratio"} was honoured ***`,
           same === 0 && n === d.scenes.length * 39, `${same} of ${n} frames identical`);
    }
    for (const c of d.cells) per[c] = Object.fromEntries(d.scenes.map((s) => [s, reverseSummary(cache[c][s], d)]));
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

console.log("\n3. *** H12 AND H13, RE-DERIVED ***");
const H = reverse(per, d);
const all = (key) => d.cells.flatMap((c) => d.scenes.map((s) => per[c][s][key]));
const mean$ = (c, key) => mean(d.scenes.map((s) => per[c][s][key]));
{
    ok("*** the recomputed H12 and H13 are the recorded ones ***", J(H.h12) === J(R.h12) && J(H.h13) === J(R.h13));
    for (const c of d.cells) say(`${c}: scene raw rho / partial given frame / gain~clock / advantage~clock / wins -- ` +
        d.scenes.map((s) => { const p = per[c][s]; return `${s} ${signed(p.rho)}/${signed(p.partial)}/${signed(p.rGainClock)}/${signed(p.rAdvClock)}/${p.wins}`; }).join("  "));
    // H12 FAILS BY THE PRICE THE DOCUMENT NAMED: one cell clears, the other stops at 6 of 7 with the named scene against it.
    const [cx, cz] = d.cells, against = (c) => d.scenes.filter((s) => d.direction * per[c][s].rho < 0);
    // v4717 -- READ THROUGH ONE CELL THAT MAY NOT EXIST. A sabotage that made the forward cell clear left `fails` empty, and the
    // first draft's rows indexed fails[0] and THREW after reddening -- a crash, not a verdict. Each row now reads the cell it
    // is about through a lookup that is null when the population it expects is not there, and fails on the null.
    const fails = d.cells.filter((c) => !H.h12.cells[c].cleared), clears = d.cells.filter((c) => H.h12.cells[c].cleared);
    const f0 = fails.length === 1 ? H.h12.cells[fails[0]] : null, c0 = clears.length === 1 ? H.h12.cells[clears[0]] : null;
    ok("*** H12 IS NOT SUPPORTED -- by the named price: one cell stops at 6 of 7 with ZONE against it, the scene the document named ***",
       H.h12.reportable && !H.h12.supported && !!f0 && f0.test.sign.up === 6 && J(against(fails[0])) === J(["zone"]) && f0.test.t.p < d.alpha,
       f0 ? `${fails[0]}: sign 6/7 p ${f0.test.sign.p.toFixed(4)} with ${against(fails[0]).join(", ")} against, while its t-test clears at ` +
            `p ${f0.test.t.p.toFixed(4)} -- the exact sign test is what the document required and what fails.`
          : `expected exactly one failing cell, found ${fails.length}: ${fails.join(", ") || "none"}`);
    ok(`*** and the other cell CLEARS -- reported as that cell's outcome and NOT promoted, as v4708 and v4710 were ***`,
       !!c0 && c0.test.sign.up === 7,
       c0 ? `${clears[0]}: 7/7, t p ${c0.test.t.p.toFixed(4)}. Calling H12 supported on it would re-declare the hypothesis after seeing which cell cleared.`
          : `expected exactly one clearing cell, found ${clears.length}: ${clears.join(", ") || "none"}`);
    const nNeg = all("rho").filter((r) => d.direction * r > 0).length;
    ok("*** H13 IS NOT SUPPORTED: with the frame's position partialled out, NEITHER cell clears ***",
       H.h13.reportable && !H.h13.supported && d.cells.every((c) => !H.h13.cells[c].cleared),
       d.cells.map((c) => `${c}: sign ${H.h13.cells[c].test.sign.up}/7 p ${H.h13.cells[c].test.sign.p.toFixed(4)}, t p ${H.h13.cells[c].test.t.p.toFixed(4)}`).join("; ") +
       `. Per the document's table H12 failed, so H13 is reported WITHOUT interpretation; section 4 describes it.`);
    ok("*** and the raw pattern DID replicate at the new speed -- in direction, scene by scene, which the test above does not count ***",
       nNeg >= 13, `${nNeg} of ${d.cells.length * d.scenes.length} scene-cells backwards at x2, against H11's 12 of 14 at x4`);
}

console.log("\n4. *** SECONDARIES AND WHAT THE CLOCK TOOK -- REPORTED, NEVER PROMOTED ***");
{
    const gc = all("rGainClock"), ac = all("rAdvClock");
    say(`S38 the clock: gain FALLS with frame index in ${gc.filter((r) => r < 0).length} of ${gc.length} scene-cells, advantage RISES with it in ` +
        `${ac.filter((r) => r > 0).length} of ${ac.length} -- so the two move apart over the window whatever else they do.`);
    say("S38 raw against partial, mean rho per cell: " + d.cells.map((c) => `${c} ${signed(mean$(c, "rho"))} -> ${signed(mean$(c, "partial"))} ` +
        `(${Math.round(100 * (1 - mean$(c, "partial") / mean$(c, "rho")))}% of it goes with the clock)`).join("; ") + ".");
    const keep = d.cells.flatMap((c) => d.scenes.filter((s) => d.direction * per[c][s].partial > 0.25).map((s) => `${s}@${c}`));
    say(`S38 where a backwards partial beyond 0.25 survives the clock: ${keep.join(", ") || "nowhere"} -- ${keep.length} of ${d.cells.length * d.scenes.length}.`);
    const byCell = d.cells.map((c) => d.scenes.filter((s) => d.direction * per[c][s].partial > 0.25));
    const sameSet = J(byCell[0]) === J(byCell[1]);
    const R11 = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H11), "utf8"));
    say("S39 raw rho, x2 here against x4 in H11, same geometry: " + d.cells.map((c) => { const k = cellOf(c);
        const h = R11.declared.cells.find((q) => cellOf(q).slabdir === k.slabdir);
        return `${k.slabdir}: ` + d.scenes.map((s) => `${s} ${signed(per[c][s].rho, 2)}|${signed(R11.per[h][s].rho, 2)}`).join(" "); }).join("; ") + ".");
    // COMPUTED, NOT TYPED: the first draft said "most of that ranking is the clock", which the vertical cell's share bears out
    // and the forward cell's does not.
    const share = d.cells.map((c) => Math.round(100 * (1 - mean$(c, "partial") / mean$(c, "rho"))));
    say(`WHAT THIS IS, AS A DESCRIPTION: motion's gain ranks frames backwards at x2 as it did at x4, on both geometries, and a large ` +
        `share of that ranking goes with the window's clock -- ${d.cells.map((c, i) => `${share[i]}% ${cellOf(c).slabdir === "x" ? "forward" : "vertical"}`).join(", ")} ` +
        "of the mean rho -- because gain falls and advantage rises as the window runs. What survives the partial does not clear in " +
        `either cell${sameSet && byCell[0].length ? `, though it survives in the SAME ${byCell[0].length} scenes on both geometries (${byCell[0].join(", ")})` : ""}. ` +
        "The partial removes a MONOTONE trend and nothing else; no mechanism is claimed.");
}

console.log(`\nframeReverseMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: a window in which the slab does not leave the view, which is the design that would separate the clock from the " +
            "signal rather than partial it out; why zone runs against the rest; a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
