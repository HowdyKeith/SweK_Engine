#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGate-selfcheck.mjs -- v4705: the frame-level statistic and harvest, on SYNTHETIC frames,
// in the round that declares them -- and the page driven only at a speed the document does not declare.
//
// *** NO DECLARED CELL IS HARVESTED HERE. *** C18 needs the page: the harvested dB must be the dB the readout prints.
// It is checked at slab speed x8 on one scene, a cell render/frame-gate-preregistration.md never names, and the gate
// asserts equality of the two numbers without printing either's difference -- so nothing here is an advantage.
// Run: node tools/ship/frameGate-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor, seededRng, RULE_KEYS } from "./foldStats.mjs";
import { PREREG_H7, CACHE_H7, RESULT_H7, FRAME_KEYS, LAP_COL, frameRow, spearman, spearmanExactP, sceneSummary, h7Cell, h7 } from "./frameGate.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);

console.log("frameGate-selfcheck -- does a frame's detail decide it? The statistic, proven before the question is asked\n");

console.log("1. *** THE DOCUMENT ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H7), FRAME_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the frame document parses under its OWN schema, and is refused under the learned and the rule ones ***",
   d !== null && throws(() => declared(readDoc(PREREG_H7)), /does not declare|not a declared key/) && throws(() => declared(readDoc(PREREG_H7), RULE_KEYS), /does not declare|not a declared key/),
   d === null ? dErr : "three documents, three schemas, and each refuses the others' keys.");
if (d === null) { console.log(`\nframeGate-selfcheck: ${fails} FAILED`); process.exit(1); }
{
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
        return m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : []; };
    ok("*** minFolds is derived, the scenes are the page's in both directions, and every speed is a page option ***",
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()) && d.speeds.every((sp) => opts("slabspeed").includes(sp)),
       `${d.scenes.length} scenes at x${d.speeds.join(", x")}`);
    // v4706 -- INVERTED, AS v4705 SAID IT WOULD BE. At v4705 this row asserted that neither file existed: the
    // pre-registration's own claim, checked. v4706 ran the measurement, so both now exist -- and the claim worth keeping
    // is that the result was produced under THIS document's constants, which is what makes it the declared run.
    const resOk = fs.existsSync(path.join(ENG, CACHE_H7)) && fs.existsSync(path.join(ENG, RESULT_H7)) &&
        J(JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H7), "utf8")).declared) === J(d);
    ok("*** the measurement exists, and was produced under THIS document's constants -- v4705's 'no data yet', inverted ***", resOk,
       `${CACHE_H7}, ${RESULT_H7} -- tools/ship/frameGateMeasure-selfcheck.mjs re-derives them.`);
}

console.log("\n2. *** THE SIGNAL AND THE TARGET ***");
const mkRow = (frame, lapVals, genDb, cfDb, r = Math.random) => {
    const nb = lapVals.length, x = [];
    for (let b = 0; b < nb; b++) for (let k = 0; k < N_FEATURES; k++) x.push(k === LAP_COL ? lapVals[b] : r() * 9);
    return { frame, x, y: new Array(nb).fill(0), genDb, cfDb };
};
{
    ok("*** C17: the signal's column is the one NAMED laplacian, found by name ***",
       LAP_COL === FEATURE_NAMES.indexOf("laplacian") && LAP_COL >= 0, `column ${LAP_COL} of ${FEATURE_NAMES.length}: ${FEATURE_NAMES[LAP_COL]}`);
    const r1 = frameRow(mkRow(3, [0.1, 0.3, 0.5, 0.9], 30, 31, seededRng(1))), r2 = frameRow(mkRow(3, [0.1, 0.3, 0.5, 0.9], 30, 31, seededRng(2)));
    ok("*** frameRow's lap is the mean of that column and NOTHING else -- every other column rewritten, lap unchanged ***",
       Math.abs(r1.lap - 0.45) < 1e-12 && r1.lap === r2.lap && r1.adv === -1, `lap ${r1.lap}, adv ${r1.adv} (genDb - cfDb)`);
    ok("*** C19: a row harvested before v4705 -- no genDb -- is REFUSED, and so is a non-finite one ***",
       throws(() => frameRow({ frame: 1, x: [], y: [] }), /no finite genDb\/cfDb/) && throws(() => frameRow({ ...mkRow(1, [1], 30, 30), cfDb: Infinity }), /no finite/),
       "every earlier cache would otherwise read as an advantage of NaN, which averages silently.");
}

console.log("\n3. *** SPEARMAN, EXACTLY ***");
{
    ok("*** rho handles ties by MIDRANK, and has no value when a sample has no spread ***",
       Math.abs(spearman([1, 2, 2, 3], [1, 2, 3, 4]) - 0.9486832980505138) < 1e-12 && spearman([1, 1, 1], [1, 2, 3]) === null && spearman([1, 2, 3], [3, 2, 1]) === -1,
       "[1,2,2,3] against [1,2,3,4] reads 0.9487 -- index-order tie-breaking would read 1.");
    const a = [1, 2, 3, 4, 5, 6, 7];
    // rho = 1 - 6*sum(d^2)/(n(n^2-1)) = 1 - sum(d^2)/56 at n = 7, so 0.7143 is sum(d^2) = 16 and 0.6786 is 18: swapping
    // 1<->3 and 2<->4 gives 16, and adding 5<->6 gives 18. The first draft picked two orderings by eye and got 0.8929
    // and 0.8571 -- a row about the critical value, testing neither side of it.
    const perfect = spearmanExactP(a, a), crit = spearmanExactP(a, [3, 4, 1, 2, 5, 6, 7]), under = spearmanExactP(a, [3, 4, 1, 2, 6, 5, 7]);
    ok("*** the exact permutation p enumerates all 5,040 orderings: a perfect ranking is 1/5040 ***",
       perfect.total === 5040 && Math.abs(perfect.p - 1 / 5040) < 1e-15, `p ${perfect.p}`);
    ok("*** and the critical value the document states is the one the enumeration gives: 0.7143 clears, 0.6786 does not ***",
       Math.abs(crit.rho - 0.7142857142857143) < 1e-12 && crit.p < d.alpha && Math.abs(crit.p - 0.04404761904761905) < 1e-12 &&
       Math.abs(under.rho - 0.6785714285714286) < 1e-12 && under.p >= d.alpha && Math.abs(under.p - 0.05476190476190476) < 1e-12,
       `rho ${crit.rho.toFixed(4)} p ${crit.p.toFixed(4)}; rho ${under.rho.toFixed(4)} p ${under.p.toFixed(4)}`);
    ok("...and refuses a sample too large to enumerate rather than approximating quietly", throws(() => spearmanExactP([...Array(10).keys()], [...Array(10).keys()]), /capped at n = 9/));
}

console.log("\n4. *** H7 ON FOUR MADE-UP WORLDS -- ONE PER ROW OF THE DOCUMENT'S TABLE ***");
const world = (kind, seed) => {
    const r = seededRng(seed), per = {};
    d.scenes.forEach((s, k) => {
        const L = 0.05 + 0.1 * k, off = kind === "within" ? (k % 2 ? 2 : -2) * (1 - k / 7) : 0, rows = [];
        for (let f = 0; f < 30; f++) {
            const lap = L * (1 + 0.4 * (r() - 0.5)), noise = r() - 0.5;
            const adv = kind === "both" ? 20 * lap + 0.02 * noise
                      : kind === "across" ? 20 * L + noise
                      : kind === "within" ? 20 * (lap - L) + off + 0.02 * noise : noise;
            rows.push(mkRow(f, [lap, lap], 30 + adv, 30, r));
        }
        per[s] = sceneSummary(rows, d);
    });
    return per;
};
{
    // Worlds follow the DECLARED speeds, so a document that gains one gets a cell here rather than a crash.
    const cellsOf = (k, s0) => Object.fromEntries(d.speeds.map((sp, i) => [sp, world(k, s0 + 10 * i)]));
    const res = Object.fromEntries(["both", "across", "within", "neither"].map((k, i) => [k, h7(cellsOf(k, 10 + i), d)]));
    ok("*** detail deciding within AND across content reads 'both' and SUPPORTS H7 ***", res.both.supported && res.both.reading === "both",
       `x${d.speeds[0]} across rho ${res.both.cells[d.speeds[0]].across.rho.toFixed(3)} p ${res.both.cells[d.speeds[0]].across.p.toFixed(4)}; within sign ${res.both.cells[d.speeds[0]].within.test.sign.up}/7`);
    ok("*** detail that separates CONTENT but not frames reads 'across only' -- not supported ***", !res.across.supported && res.across.reading === "across only");
    ok("*** detail that ranks frames but whose level shifts with content reads 'within only' -- not supported ***", !res.within.supported && res.within.reading === "within only");
    ok("*** and no signal reads 'neither' ***", !res.neither.supported && res.neither.reading === "neither");
    const mixed = h7(Object.fromEntries(d.speeds.map((sp, i) => [sp, world(i === 0 ? "both" : "neither", 30 + i)])), d);
    ok("*** EVERY speed must hold: one good cell and the rest empty is not supported ***",
       !mixed.supported && mixed.cells[d.speeds[0]].across.cleared && d.speeds.slice(1).every((sp) => !mixed.cells[sp].across.cleared));
    ok("...and a declared speed with no data is refused by name rather than read as undefined",
       throws(() => h7(cellsOf("both", 35), { ...d, speeds: [...d.speeds, "8"] }), /no data for declared speed x8$/));
    // The within clause needs the SIGN test too: six strong positive rhos and one negative clear a t-test and fail
    // 6 of 7. The first draft's worlds all cleared both or neither, so a clause reading the t-test alone passed them.
    const lop = world("both", 45); lop.ramp = { ...lop.ramp, rho: -0.1 };
    const lc = h7Cell(lop, d);
    ok("*** the within clause needs the exact sign test as well: 6 of 7 positive fails it even when the t-test clears ***",
       lc.within.reportable && lc.within.test.t.p < d.alpha && lc.within.test.sign.up === 6 && !lc.within.cleared,
       `t p ${lc.within.test.t.p.toExponential(2)}, sign ${lc.within.test.sign.up}/7 p ${lc.within.test.sign.p}`);
    const flat = world("both", 40); for (const s of ["zone", "smooth", "checker"]) flat[s] = { ...flat[s], cv: 0, rho: null };
    const fc = h7Cell(flat, d);
    ok("*** a scene whose frame detail has no spread is EXCLUDED from (b), and four usable scenes are NOT reportable ***",
       fc.within.excluded.length === 3 && !fc.within.reportable && !fc.within.cleared,
       `excluded ${fc.within.excluded.join(", ")}`);
    // A spread UNDER the floor, not none: with identical values Spearman has no value anyway, so a row built on them
    // could not tell a floor that is applied from one that is not.
    const cvRow = sceneSummary([mkRow(1, [0.500, 0.500], 30, 30), mkRow(2, [0.501, 0.501], 31, 30), mkRow(3, [0.502, 0.502], 32, 30)], d);
    ok("...and sceneSummary is what sets that exclusion: frame detail spread UNDER cvFloor gives no rho, though Spearman alone would give 1",
       cvRow.cv > 0 && cvRow.cv < d.cvFloor && cvRow.rho === null && spearman([0.5, 0.501, 0.502], [0, 1, 2]) === 1 && cvRow.wins === 2,
       `cv ${cvRow.cv.toExponential(2)} against cvFloor ${d.cvFloor}`);
    ok("...and a contradicted minFolds is refused", throws(() => h7Cell(world("both", 50), { ...d, minFolds: 4 }), /not what alpha/));
}

console.log("\n5. *** C18: THE HARVESTED dB ARE THE READOUT'S dB -- AT x8, A CELL THE DOCUMENT DOES NOT DECLARE ***");
const OFF_CELL = "8";
ok("*** the page-drive cell is NOT a declared one ***", !d.speeds.includes(OFF_CELL), `x${OFF_CELL} against declared x${d.speeds.join(", x")}`);
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { speed: OFF_CELL }, script: `async (a) => {
    const ifr = document.createElement("iframe");
    ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
    document.body.appendChild(ifr);
    await new Promise((res) => { ifr.onload = res; });
    const d = ifr.contentDocument, $ = (id) => d.getElementById(id);
    const until = async (fn, ms) => { const t0 = Date.now();
        while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise(r2 => setTimeout(r2, 40)); } return false; };
    const fno = () => { const m = /frame (\\d+)/.exec((($("metric") || {}).textContent || "")); return m ? Number(m[1]) : -1; };
    await until(() => fno() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 180000);
    for (const [id, v] of [["scene", "smooth"], ["shading", "off"], ["reactive", "off"], ["camera", "objects"], ["slabspeed", a.speed],
                           ["genfield", "block"], ["gensource", "presented"], ["genengine", "cpu"], ["genframe", "on"]]) { const e = $(id); if (e) e.value = v; }
    $("genframe").dispatchEvent(new Event("change"));
    await until(() => fno() === 0, 60000);
    ifr.contentWindow.__gateHarvest = [];
    $("run").click();
    await until(() => ifr.contentWindow.__gateHarvest.length >= 2, 120000);
    $("run").click();
    await new Promise((res) => setTimeout(res, 200));
    const rows = ifr.contentWindow.__gateHarvest;
    return { n: rows.length, last: rows.length ? { genDb: rows[rows.length - 1].genDb, cfDb: rows[rows.length - 1].cfDb } : null,
             stat: ($("genstat") || {}).textContent || "" };
}` });
if (!r.ok) ok("the page ran", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 300)}`);
else {
    const { n, last, stat } = r.result;
    const shown = [...stat.matchAll(/scores (-?[\d.]+) dB/g)].map((m) => m[1]);
    ok("*** every harvested frame carries finite genDb and cfDb, and the LAST one equals what the readout printed for it ***",
       n >= 2 && !!last && Number.isFinite(last.genDb) && Number.isFinite(last.cfDb) &&
       shown.length >= 2 && shown[0] === last.genDb.toFixed(2) && shown[1] === last.cfDb.toFixed(2),
       `${n} frames harvested; the readout's two "scores ... dB" figures match the last row to their printed precision. No difference between them is printed here.`);
}

console.log(`\nframeGate-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL. No scene is harvested at x2 or x4, and no frame-level advantage exists yet for any scene v4697 added.");
process.exit(fails ? 1 : 0);
