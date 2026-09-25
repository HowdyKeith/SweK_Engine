#!/usr/bin/env node
// WebGLEngine/tools/ship/frameVerticalMeasure-selfcheck.mjs -- v4712: H10 as render/frame-vertical-preregistration.md
// declared it at v4711, re-derived from its committed cache, with C12 re-harvesting the first declared scene every run
// and C22 checked on the declared cell: every vertical x8 frame must differ from v4708's forward x8 frame.
// Run: node tools/ship/frameVerticalMeasure-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { declared, readDoc } from "./foldStats.mjs";
import { holeRow, CACHE_H8 } from "./frameHoles.mjs";
import { holedContrast, CACHE_H9 } from "./frameHoled.mjs";
import { PREREG_H10, CACHE_H10, RESULT_H10, VERT_KEYS, h10 } from "./frameVertical.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);
const J = (x) => JSON.stringify(x);
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));

const d = declared(readDoc(PREREG_H10), VERT_KEYS);
const R = JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H10), "utf8"));
const cache = gz(CACHE_H10);
const forward = gz(CACHE_H8)[d.speed];

console.log("frameVerticalMeasure-selfcheck -- holed frames against clean ones on vertical slab motion: H10, re-derived\n");

console.log("1. *** PROVENANCE, AND C22 ON THE DECLARED CELL ***");
const per = {};
{
    ok("*** the run's constants are the document's today ***", J(R.declared) === J(d));
    const complete = d.scenes.every((s) => Array.isArray(cache[s]) && cache[s].length > 0 && cache[s].every((r) => Number.isFinite(r.genDb) && Number.isFinite(r.cfDb)));
    ok("*** the cache holds every declared scene, with finite frame dB ***", complete, d.scenes.map((s) => (cache[s] ? cache[s].length : "MISSING")).join("/") + " frames");
    if (!complete) { console.log(`\nframeVerticalMeasure-selfcheck: ${fails} FAILED`); process.exit(1); }
    let same = 0, n = 0;
    for (const s of d.scenes) cache[s].forEach((r, i) => { const o = forward[s][i]; if (o && o.frame === r.frame) { n++; if (o.genDb === r.genDb && o.cfDb === r.cfDb) same++; } });
    ok("*** C22 ON THE DECLARED CELL: no vertical frame carries the dB v4708 read with the slab moving along x ***",
       same === 0 && n === d.scenes.length * 39, `${same} of ${n} frames identical to forward x8`);
    for (const s of d.scenes) per[s] = holedContrast(cache[s], d);
    ok("*** every scene contrast, recomputed from the cached rows, is the recorded one ***", J(per) === J(R.per));
}

console.log("\n2. *** C12: THE FIRST DECLARED SCENE, HARVESTED AGAIN ***");
{
    const s0 = d.scenes[0], t0 = Date.now();
    let again = null, err = "";
    try { again = await harvest({ scenes: [s0], upto: d.upto, speed: d.speed, settings: { slabdir: d.slabdir } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = again && again.length === cache[s0].length && again.every((r, i) => { const c = cache[s0][i];
        return r.frame === c.frame && r.genDb === c.genDb && r.cfDb === c.cfDb && J(r.y) === J(c.y) && J(r.x) === J(c.x); });
    ok(`*** C12: ${s0} at x${d.speed}, slab ${d.slabdir}, re-harvested reproduces every row exactly ***`, !!same,
       again ? `${again.length} frames against ${cache[s0].length}, in ${((Date.now() - t0) / 1000).toFixed(0)} s` : `the page did not run: ${err}`);
}

console.log("\n3. *** H10, RE-DERIVED -- NOT SUPPORTED, AND THE PATTERN REVERSES ON THE NEW GEOMETRY ***");
const H = h10(per, d);
{
    ok("*** the recomputed H10 is the recorded one ***", J(H) === J(R.h10));
    say("scene / holed frames at mean advantage / clean frames at mean / contrast -- " +
        d.scenes.map((s) => `${s} ${per[s].nHoled}@${per[s].holedAdv.toFixed(3)}/${per[s].nClean}@${per[s].cleanAdv.toFixed(3)}/${per[s].contrast.toFixed(3)}`).join("  "));
    const rev = d.scenes.filter((s) => per[s].contrast <= 0);
    ok("*** H10 IS NOT SUPPORTED: 5 of 7, t p 0.36 -- not the one-scene price, and NOT the unanswerable route ***",
       H.reportable && !H.supported && H.cell.test.sign.up === 5 && H.cell.test.t.p > 0.3 && H.cell.excluded.length === 0,
       `contrast mean ${H.cell.test.t.mean.toFixed(3)} dB, t p ${H.cell.test.t.p.toFixed(3)}, sign 5/7 p ${H.cell.test.sign.p.toFixed(4)}. Every scene carried ` +
       `${Math.min(...d.scenes.map((s) => per[s].nHoled))} to ${Math.max(...d.scenes.map((s) => per[s].nHoled))} holed frames, so the named no-answer route did not happen.`);
    // COMPUTED, NOT TYPED: the ceiling below is read off the three forward caches, because twice in this arc a typed
    // summary line was wrong.
    const fwdCells = [forward, ...Object.values(gz(CACHE_H9))];
    const fwdMax = Math.max(...fwdCells.flatMap((c) => d.scenes.map((s) => holedContrast(c[s], d).holedAdv).filter((v) => v !== null)));
    ok("*** and two scenes REVERSE HARD: on vertical motion their holed frames are where generation WINS, above anything the forward geometry produced ***",
       J(rev) === J(["smooth", "bars"]) && per.bars.holedAdv > fwdMax && per.smooth.holedAdv > fwdMax,
       `bars holed ${per.bars.holedAdv.toFixed(3)} dB against clean ${per.bars.cleanAdv.toFixed(3)}; smooth ${per.smooth.holedAdv.toFixed(3)} against ` +
       `${per.smooth.cleanAdv.toFixed(3)}. Across the three forward cells no scene's holed frames averaged above ${fwdMax.toFixed(3)} dB.`);
}

console.log("\n4. *** SECONDARIES -- REPORTED, NEVER PROMOTED ***");
{
    const cnt = (rows) => rows.map(holeRow).filter((f) => f.holes > 0).length;
    say("S33 holed frames per scene, vertical against forward x8: " + d.scenes.map((s) => `${s} ${cnt(cache[s])} vs ${cnt(forward[s])}`).join(", ") + ".");
    say("S34 headroom: " + d.scenes.map((s) => { const fr = cache[s].map(holeRow), orc = mean(fr.map((f) => Math.max(f.adv, 0))), best = Math.max(mean(fr.map((f) => f.adv)), 0);
        return `${s} ${fr.filter((f) => f.adv > 0).length}/${fr.length} won, oracle +${(orc - best).toFixed(3)}`; }).join("; ") + ".");
    const fwdBelow = [forward, ...Object.values(gz(CACHE_H9))].reduce((a, c) => a + d.scenes.filter((s) => (holedContrast(c[s], d).contrast || 0) > 0).length, 0);
    const worstRev = Math.min(...d.scenes.map((s) => per[s].contrast));
    say(`WHERE THE HOLED-FRAME PATTERN STANDS: ${fwdBelow} of 21 scene-cells on the forward geometry (x8 at three resolutions), ` +
        `${d.scenes.filter((s) => per[s].contrast > 0).length} of 7 on the vertical one, with its exceptions reversing by up to ${(-worstRev).toFixed(2)} dB. Holed frames lose when the slab moves WITH the ` +
        "dolly; whether they lose depends on the geometry, so a hole is not a signal a frame gate can carry to geometry it has " +
        "not seen. A description over four cells; no test is run on it.");
}

console.log(`\nframeVerticalMeasure-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: why bars and smooth reverse; a third geometry; a frame gate's value in dB.");
process.exit(fails ? 1 : 0);
