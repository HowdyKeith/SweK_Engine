#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGateMeasure-selfcheck.mjs -- v4706: H7 as render/frame-gate-preregistration.md declared it
// at v4705, re-derived from its committed cache rather than read off the runner's summary.
//
// *** C12 IS RUN HERE, NOT REMEMBERED. *** v4705 promised that re-harvesting the first declared scene at the first declared
// speed reproduces its rows exactly. That is a page drive of forty frames, which takes this gate well over the quick
// sweep's budget -- so its timing is hand-filed, as tools/ship/genGateMeasure-selfcheck.mjs's is, and the check is a row
// that runs every time the gate does rather than a sentence saying it passed once.
// Run: node tools/ship/frameGateMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { PREREG_H7, CACHE_H7, RESULT_H7, FRAME_KEYS, frameRow, sceneSummary, h7 } from "./frameGate.mjs";
import { harvest, rowsMatch, rowsMatchDetail, ulpsApart, ulpStep, DB_ULPS } from "./genGateTrain.mjs";
import { gateReport } from "./gateReport.mjs";
const REPORT = gateReport("tools/ship/frameGateMeasure-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);

const d = declared(readDoc(PREREG_H7), FRAME_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H7), "utf8"));
const cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, CACHE_H7))).toString("utf8"));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

console.log("frameGateMeasure-selfcheck -- does a frame's detail decide it? H7 as declared, re-derived from its data\n");

console.log("1. *** PROVENANCE ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.speeds.every((sp) => cache[sp] && d.scenes.every((s) => Array.isArray(cache[sp][s]) && cache[sp][s].length > 0 &&
           cache[sp][s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb))));
    ok("*** the cache holds every declared scene at every declared speed, and every row carries finite frame dB ***", complete,
       d.speeds.map((sp) => `x${sp}: ` + d.scenes.map((s) => (cache[sp] && cache[sp][s] ? cache[sp][s].length : "MISSING")).join("/")).join("; ") + " frames");
    // Nothing below can be computed on an incomplete cache: stop with the failure counted, rather than let the next line
    // throw on the missing scene and turn a red row into a crash.
    if (!complete) { console.log(`\nframeGateMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    for (const sp of d.speeds) per[sp] = Object.fromEntries(d.scenes.map((s) => [s, sceneSummary(cache[sp][s], d)]));
    ok("*** every scene summary, recomputed from the cached rows, is the recorded one ***", J(per) === J(R.per));
}

console.log("\n2. *** C12: THE FIRST DECLARED SCENE AT THE FIRST DECLARED SPEED, HARVESTED AGAIN ***");
{
    const s0 = d.scenes[0], sp0 = d.speeds[0], t0 = Date.now();
    {   // rig run 12 (option 2): the rule every C12 row in the frame*Measure gates now uses, on the cached rows themselves --
        // each way a re-harvest can differ, made by hand. No browser.
        const base = cache[sp0][s0], copy = () => base.map((r) => JSON.parse(J(r)));
        const step = ulpStep;
        const edit = (fn) => { const rows = copy(); fn(rows); return rowsMatch(rows, base); };
        const i = 5, cases = [
            ["the cache against itself", edit(() => {}), true],
            [`genDb ${DB_ULPS} ulp off on one frame`, edit((R) => { R[i].genDb = step(R[i].genDb, DB_ULPS); }), true],
            [`cfDb ${DB_ULPS + 1} ulp off on one frame`, edit((R) => { R[i].cfDb = step(R[i].cfDb, DB_ULPS + 1); }), false],
            ["one feature 1 ulp off", edit((R) => { R[i].x[0] = step(R[i].x[0], 1); }), false],
            ["one label flipped", edit((R) => { R[i].y[0] = R[i].y[0] ? 0 : 1; }), false],
            ["one frame number changed", edit((R) => { R[i].frame += 1; }), false],
            ["one row short", edit((R) => { R.pop(); }), false],
        ];
        const wrong = cases.filter(([, k, want]) => k.ok !== want).map(([what, k]) => `${what}: ${k.ok ? "matched" : k.why}`);
        ok(`  the C12 rule, on edits of this cache: dB within ${DB_ULPS} ulp matches, and one ulp more, a feature, a label, a frame or a row does not`,
           wrong.length === 0 && ulpsApart(1, -1) === Infinity && ulpsApart(0.1, step(0.1, 3)) === 3, wrong.join("; ") || cases.map(([w, k]) => `${w}: ${k.ok ? "match" : "no"}`).join(", "));
    }
    let again = null, err = "";
    try { again = await harvest({ scenes: [s0], upto: d.upto, speed: sp0 }); } catch (e) { err = String(e.message).slice(0, 160); }
    // rig run 12 (option 2): frame, labels and features exact, the two dB to DB_ULPS -- see genGateTrain.mjs rowsMatch
    const match = rowsMatch(again, cache[sp0][s0]), same = again && match.ok;
    ok(`*** C12: ${s0} at x${sp0} re-harvested reproduces every row -- frame, labels and features exactly, both dB to ${DB_ULPS} ulp ***`, !!same,
       again ? `${rowsMatchDetail(match)}, in ${((Date.now() - t0) / 1000).toFixed(0)} s. The page is deterministic for a declared cell, so the cache is the page and not one draw of it.` : `the page did not run: ${err}`);
}

console.log("\n3. *** H7, RE-DERIVED -- NOT SUPPORTED: 'NEITHER' ***");
const H = h7(per, d);
{
    ok("*** the recomputed H7 is the recorded one ***", J(H) === J(R.h7));
    for (const sp of d.speeds) {
        say(`x${sp}: scene / mean frame laplacian / mean genDb-cfDb / frames generation won / within rho -- ` +
            d.scenes.map((s) => `${s} ${per[sp][s].lap.toFixed(4)}/${per[sp][s].adv.toFixed(3)}/${per[sp][s].wins}of${per[sp][s].n}/${per[sp][s].rho.toFixed(2)}`).join("  "));
            REPORT.table(`H7 per scene at x${sp}: does a frame's detail decide it`, ["scene", "mean frame laplacian", "mean genDb - cfDb", "frames generation won", "frames", "within rho"],
                d.scenes.map((s) => [s, per[sp][s].lap, per[sp][s].adv, per[sp][s].wins, per[sp][s].n, per[sp][s].rho]));
        const c = H.cells[sp];
        ok(`*** x${sp} (a) ACROSS fails: rho ${c.across.rho.toFixed(4)}, exact p ${c.across.p.toFixed(4)} -- the 0.7143 it needed is far off ***`,
           !c.across.cleared && c.across.rho < 0.7143 && c.across.p > d.alpha);
        const neg = c.within.rhos.filter((x) => x < 0).length;
        ok(`*** x${sp} (b) WITHIN fails, and the rhos lean NEGATIVE: ${neg} of 7 below zero, mean ${c.within.test.t.mean.toFixed(3)} ***`,
           c.within.reportable && !c.within.cleared && c.within.test.t.mean < 0 && c.within.excluded.length === 0,
           `t p ${c.within.test.t.p.toFixed(3)}, sign ${c.within.test.sign.up}/7. No scene excluded: every frame-laplacian cv is at least ${Math.min(...d.scenes.map((s) => per[sp][s].cv)).toFixed(3)} against a floor of ${d.cvFloor}.`);
    }
    ok("*** H7 IS NOT SUPPORTED, AND THE READING IS THE TABLE'S LAST ROW: the spatial gradient does not decide the frame ***",
       !H.supported && H.reading === "neither",
       "v4683's sentence -- \"a compensation's worth scales with the spatial gradient\" -- is not supported at frame level, across content or within it.");
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    for (const sp of d.speeds) {
        const parts = d.scenes.map((s) => { const fr = cache[sp][s].map(frameRow);
            const oracle = mean(fr.map((f) => Math.max(f.adv, 0))), best = Math.max(mean(fr.map((f) => f.adv)), 0);
            return `${s} ${per[sp][s].wins}/${fr.length} won, oracle +${(oracle - best).toFixed(3)} dB over the better fixed policy`; });
        say(`S23 x${sp} headroom: ${parts.join("; ")}.`);
    }
    say("S23b THERE IS FRAME-LEVEL HEADROOM WHERE THE SPLIT IS MIXED -- at x4, smooth, noise and ramp win 16-19 frames of 39 -- and the " +
        "spatial gradient is not what separates those frames. The oracle column is what a frame-level decision could reach, and " +
        "nothing here has been shown to reach it.");
    say(`S24 overlap with earlier rounds: checker at x4 reads ${per[4].checker.adv.toFixed(3)} dB over 39 frames here against v4683's +0.107 ` +
        `over four; smooth ${per[4].smooth.adv.toFixed(3)} against -0.857; zone ${per[4].zone.adv.toFixed(3)} against -0.965. Different ` +
        "windows: v4683 read four frames, this reads frames up to 40, across which v4684 showed the slab leaves the frame.");
    say("S25 A DESCRIPTION, NOT A FINDING: the within-scene rhos lean negative at both speeds -- frames with more detail are, " +
        "within most scenes, where generation does WORSE. The document named v4684's window defect in advance: the slab leaves " +
        "frame across this window, which moves a frame's detail and its moving content together. Which of the two the rho is " +
        "tracking is not separable here, and no mechanism is claimed.");
}

// ---- RIG RUN 12 (option 2) SABOTAGE LOG ----
// Against tools/ship/genGateTrain.mjs rowsMatch: T1 the dB never compared -> 1 red, the C12-rule row ("cfDb 5 ulp off on one
// frame: matched"); T2 the features never compared -> 1 red, same row ("one feature 1 ulp off: matched"); T3 labels skipped by
// default -> 1 red, same row ("one label flipped: matched"); T4 DB_ULPS = 0, the exact rule as it was, re-harvested on headless
// shell 1243 -> 1 red each in frameVerticalMeasure ("row 31 (frame 33): dB 1 ulp apart") and frameSway's LINEAR row ("row 7
// (frame 9): dB 1 ulp apart"). All restored, md5 verified.
REPORT.write();
console.log(`\nframeGateMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: anything beyond seven synthetic scenes at two speeds; a frame gate's value in dB; whether ANY other " +
            "frame-level signal separates the mixed scenes -- that would owe its own document.");
process.exit(fails ? 1 : 0);
