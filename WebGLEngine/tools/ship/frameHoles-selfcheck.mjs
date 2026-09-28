#!/usr/bin/env node
// WebGLEngine/tools/ship/frameHoles-selfcheck.mjs -- v4707: H8's statistic on SYNTHETIC frames, in the round that declares
// it. No page drive: v4705's C18 already proved the harvested dB are the readout's, and the harvest has not changed.
// Run: node tools/ship/frameHoles-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { FRAME_KEYS, PREREG_H7, spearman } from "./frameGate.mjs";
import { PREREG_H8, CACHE_H8, RESULT_H8, HOLE_COL, holeRow, holeSummary, h8Cell, h8 } from "./frameHoles.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);

console.log("frameHoles-selfcheck -- are the frames generation loses the ones with the most occlusion? The statistic, first\n");

console.log("1. *** THE DOCUMENT, AND WHY ITS CELLS ARE FRESH ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H8), FRAME_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under v4705's frame schema ***", d !== null, dErr);
if (d === null) { console.log(`\nframeHoles-selfcheck: ${fails} FAILED`); process.exit(1); }
{
    const h7 = declared(readDoc(PREREG_H7), FRAME_KEYS);
    ok("*** the cells share NOTHING with v4705's -- read from that document, not restated ***",
       d.speeds.every((sp) => !h7.speeds.includes(sp)),
       `H8 at x${d.speeds.join(", x")}; H7 was measured at x${h7.speeds.join(", x")}. The signal was chosen after v4706, so v4706's cells are forbidden to it.`);
    const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
    const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
        return m ? [...m[1].matchAll(/<option value="(\w+)">/g)].map((x) => x[1]) : []; };
    ok("*** minFolds is derived, the scenes are the page's both ways, every speed is a page option ***",
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()) && d.speeds.every((sp) => opts("slabspeed").includes(sp)));
    // v4708 -- INVERTED, as this row said it would be: the measurement ran, and what is worth keeping is that it ran under
    // THIS document's constants.
    const resOk = fs.existsSync(path.join(ENG, CACHE_H8)) && fs.existsSync(path.join(ENG, RESULT_H8)) &&
        J(JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H8), "utf8")).declared) === J(d);
    ok("*** the measurement exists, and was produced under THIS document's constants -- v4707's 'no data yet', inverted ***", resOk,
       "tools/ship/frameHolesMeasure-selfcheck.mjs re-derives it.");
}

console.log("\n2. *** C20: THE SIGNAL IS holeFrac AND NOTHING ELSE ***");
const mkRow = (frame, holeVals, genDb, cfDb, r) => {
    const x = [];
    for (const hv of holeVals) for (let k = 0; k < N_FEATURES; k++) x.push(k === HOLE_COL ? hv : r() * 9);
    return { frame, x, y: new Array(holeVals.length).fill(0), genDb, cfDb };
};
{
    ok("*** the column is the one NAMED holeFrac, found by name ***", HOLE_COL === FEATURE_NAMES.indexOf("holeFrac") && HOLE_COL >= 0, `column ${HOLE_COL}`);
    const a = holeRow(mkRow(4, [0, 0.2, 0.4, 0.2], 30, 30.5, seededRng(1))), b = holeRow(mkRow(4, [0, 0.2, 0.4, 0.2], 30, 30.5, seededRng(2)));
    ok("*** the frame's hole fraction is that column's mean, unmoved by rewriting every other column ***",
       Math.abs(a.holes - 0.2) < 1e-12 && a.holes === b.holes && a.adv === -0.5, `holes ${a.holes}, adv ${a.adv}`);
    ok("*** a row without finite frame dB is refused (C19, carried) ***", throws(() => holeRow({ frame: 1, x: [], y: [] }), /no finite genDb/));
}

console.log("\n3. *** H8 ON MADE-UP WORLDS ***");
const world = (kind, seed) => {
    const r = seededRng(seed), per = {};
    d.scenes.forEach((s, k) => { const rows = [];
        for (let f = 0; f < 30; f++) {
            const holes = kind === "none" ? 0 : 0.02 + 0.08 * r(), noise = r() - 0.5;
            const adv = kind === "neg" ? -10 * holes + 0.05 * noise : kind === "pos" ? 10 * holes + 0.05 * noise
                      : kind === "negOne" ? (s === "ramp" ? 10 : -10) * holes + 0.05 * noise : noise;
            rows.push(mkRow(f, [holes, holes], 30 + adv, 30, r)); }
        per[s] = holeSummary(rows, d); });
    return per;
};
const cellsOf = (k, s0) => Object.fromEntries(d.speeds.map((sp, i) => [sp, world(k, s0 + 10 * i)]));
{
    const neg = h8(cellsOf("neg", 1), d), pos = h8(cellsOf("pos", 2), d), nul = h8(cellsOf("null", 3), d);
    ok("*** more holes, worse generation, in every scene at every speed SUPPORTS H8 ***", neg.supported,
       `x${d.speeds[0]} sign ${neg.cells[d.speeds[0]].test.sign.up}/7`);
    ok("*** the SIGN is part of the hypothesis: more holes, BETTER generation, fails it ***", pos.reportable && !pos.supported,
       "a two-sided test would have passed this world; the document fixed the direction before the data.");
    ok("*** and no relation fails it ***", nul.reportable && !nul.supported);
    const one = h8Cell(world("negOne", 4), d);
    ok("*** one scene against the direction fails the exact sign test: 6 of 7 is 8/128, even when t clears ***",
       !one.cleared && one.test.sign.up === 6 && one.test.sign.p === 8 / 128 && one.test.t.p < d.alpha,
       `t p ${one.test.t.p.toExponential(2)}, sign 6/7`);
    const mixed = h8(Object.fromEntries(d.speeds.map((sp, i) => [sp, world(i === 0 ? "neg" : "null", 5 + i)])), d);
    ok("*** EVERY speed must clear ***", !mixed.supported && mixed.cells[d.speeds[0]].cleared);
    const none = h8(Object.fromEntries(d.speeds.map((sp, i) => [sp, world(i === 0 ? "none" : "neg", 7 + i)])), d);
    ok("*** a speed with NO holes is UNREPORTABLE, not a null -- the outcome section 4 names for x1 ***",
       !none.reportable && !none.supported && none.cells[d.speeds[0]].excluded.length === 7 && /cannot reach/.test(none.cells[d.speeds[0]].why),
       none.cells[d.speeds[0]].why);
    const small = holeSummary([mkRow(1, [0.100, 0.100], 30, 30, seededRng(9)), mkRow(2, [0.1005, 0.1005], 31, 30, seededRng(9)), mkRow(3, [0.101, 0.101], 32, 30, seededRng(9))], d);
    ok("*** a hole fraction spread UNDER cvFloor gives no rho, though Spearman alone would give 1 ***",
       small.cv > 0 && small.cv < d.cvFloor && small.rho === null && spearman([0.1, 0.1005, 0.101], [0, 1, 2]) === 1, `cv ${small.cv.toExponential(2)}`);
    ok("...and a declared speed with no data is refused by name", throws(() => h8(cellsOf("neg", 11), { ...d, speeds: [...d.speeds, "3"] }), /no data for declared speed x3$/));
    ok("...and a contradicted minFolds is refused", throws(() => h8Cell(world("neg", 12), { ...d, minFolds: 4 }), /not what alpha/));
}

console.log(`\nframeHoles-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL. No frame at x1 or x8 has been harvested with its dB.");
process.exit(fails ? 1 : 0);
