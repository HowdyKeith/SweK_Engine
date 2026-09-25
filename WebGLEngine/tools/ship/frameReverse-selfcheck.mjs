#!/usr/bin/env node
// WebGLEngine/tools/ship/frameReverse-selfcheck.mjs -- v4716: H12's and H13's document and statistic, with no declared data.
//
// *** THE DIRECTION IS READ FROM H11, AND THE CLOCK IS A ROW. *** The document may not choose which way the test points:
// `direction` must be the sign H11 recorded in both of its cells, read from its committed result. And H13 exists to
// separate the ranking from the window's clock, so a made-up world where gain and advantage both merely FOLLOW the frame
// number must clear H12 and fail H13 -- if it did not, the partial would be decoration.
// Run: node tools/ship/frameReverse-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { N_FEATURES, FEATURE_NAMES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { EPS } from "./genGateRule.mjs";
import { spearman, RESULT_H7 } from "./frameGate.mjs";
import { RESULT_H8, CACHE_H8 } from "./frameHoles.mjs";
import { RESULT_H9 } from "./frameHoled.mjs";
import { RESULT_H10 } from "./frameVertical.mjs";
import { RESULT_H11, GAIN_KEYS, cellOf } from "./frameGain.mjs";
import { PREREG_H12, CACHE_H12, RESULT_H12, REV_KEYS, partialSpearman, reverseSummary, reverseCell, reverse } from "./frameReverse.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

console.log("frameReverse-selfcheck -- H11's negation on cells it has not seen, and the same with the clock taken out\n");

console.log("1. *** THE DOCUMENT: ITS CELLS ARE NEW AND ITS DIRECTION IS H11's ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H12), REV_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under H11's -- `direction` is a key H11 never read ***",
   d !== null && throws(() => declared(readDoc(PREREG_H12), GAIN_KEYS), /not a declared key/), dErr);
if (d === null) { console.log(`\nframeReverse-selfcheck: ${fails} FAILED`); process.exit(1); }
const doc = readDoc(PREREG_H12).replace(/\s+/g, " ");
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };
const cells = d.cells.map(cellOf), DEF = { slabdir: opts("slabdir")[0], ratio: opts("ratio")[0] };
const R11 = res(RESULT_H11);
{
    ok("*** every cell is a page option; minFolds is derived; the scenes are the page's both ways; one cell per geometry ***",
       cells.every((c) => opts("slabspeed").includes(c.speed) && opts("slabdir").includes(c.slabdir) && opts("ratio").includes(c.ratio)) &&
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()) &&
       cells.length === 2 && new Set(cells.map((c) => c.slabdir)).size === 2, cells.map((c) => `x${c.speed} ${c.slabdir} ${c.ratio}x`).join("; "));
    const h11Speeds = new Set(R11.declared.cells.map((c) => cellOf(c).speed));
    ok("*** and at a speed H11 did NOT use -- the negation must transfer, not be re-read where it was seen ***",
       cells.every((c) => !h11Speeds.has(c.speed)), `declared x${[...new Set(cells.map((c) => c.speed))].join(", x")}; H11 ran at x${[...h11Speeds].join(", x")}`);
    const R7 = res(RESULT_H7).declared, R8 = res(RESULT_H8).declared, R9 = res(RESULT_H9).declared, R10 = res(RESULT_H10).declared;
    const seen = new Set([...R7.speeds.map((s) => `${s}/x/${DEF.ratio}`), ...R8.speeds.map((s) => `${s}/x/${DEF.ratio}`),
                          ...R9.ratios.map((r) => `${R9.speed}/x/${r}`), `${R10.speed}/${R10.slabdir}/${DEF.ratio}`, ...R11.declared.cells]);
    const fresh = d.cells.filter((c) => !seen.has(c) && !(cellOf(c).slabdir === DEF.slabdir && cellOf(c).ratio === DEF.ratio));
    ok("*** NEITHER declared cell has been harvested by any round -- H11's cells included, and every pre-v4709 harvest ***",
       fresh.length === d.cells.length, `harvested: ${[...seen].join(", ")}, plus every speed at ${DEF.slabdir}/${DEF.ratio}; declared: ${d.cells.join(", ")}`);
    // THE DIRECTION IS NOT CHOSEN: it is the sign of H11's mean rho, which must be the same in both of H11's cells.
    const signs = R11.declared.cells.map((c) => Math.sign(mean(R11.declared.scenes.map((s) => R11.per[c][s].rho))));
    ok("*** `direction` is the sign H11 recorded, and H11 recorded the same sign in both of its cells ***",
       signs.every((s) => s === signs[0]) && d.direction === signs[0], `H11's mean-rho signs ${signs.join(", ")}; declared ${d.direction}`);
    const negs = R11.declared.cells.flatMap((c) => R11.declared.scenes.filter((s) => R11.per[c][s].rho < 0));
    const exc = R11.declared.cells.map((c) => R11.declared.scenes.filter((s) => R11.per[c][s].rho > 0));
    const means = R11.declared.cells.map((c) => mean(R11.declared.scenes.map((s) => R11.per[c][s].rho)).toFixed(3));
    const facts = [`${negs.length} of ${R11.declared.cells.length * R11.declared.scenes.length}`, ...means, J(exc[0]) === J(exc[1]) && exc[0].length === 1 ? `\`${exc[0][0]}\`` : "??"];
    const missing = facts.filter((f) => !doc.includes(f));
    ok("*** every number the document quotes from H11 is the one H11's result holds, and the shared exception is computed ***",
       !missing.length, missing.length ? `not in the document: ${missing.join(", ")}` : facts.join(", "));
    // v4717 -- INVERTED, as every design gate in this arc has been: the measurement ran, under THIS document's constants.
    ok("*** the measurement exists, produced under THIS document's constants -- v4716's 'no data yet', inverted ***",
       fs.existsSync(path.join(ENG, CACHE_H12)) && fs.existsSync(path.join(ENG, RESULT_H12)) && J(res(RESULT_H12).declared) === J(d));
}

console.log("\n2. *** THE PARTIAL, AND WHAT IT MUST SEPARATE ***");
{
    const x = [3, 1, 4, 1.5, 9, 2.6, 5.3], y = [2, 7, 1, 8, 2.8, 1.8, 2.9], z = [1, 2, 3, 4, 5, 6, 7];
    const rxy = spearman(x, y), rxz = spearman(x, z), ryz = spearman(y, z);
    ok("*** the partial is the formula the document states, on Spearman's midrank rhos, and symmetric in x and y ***",
       Math.abs(partialSpearman(x, y, z) - (rxy - rxz * ryz) / Math.sqrt((1 - rxz ** 2) * (1 - ryz ** 2))) < 1e-15 &&
       partialSpearman(x, y, z) === partialSpearman(y, x, z), `partial ${partialSpearman(x, y, z).toFixed(4)} from raw ${rxy.toFixed(4)}`);
    ok("*** a variable the clock ranks PERFECTLY has no partial -- null, so its scene is excluded rather than scored ***",
       partialSpearman(z.map((v) => v * 2), y, z) === null && partialSpearman(x, z.map((v) => 10 - v), z) === null);
}
// Made-up frames: one block with the SADs placed by genGate's NAMES, so gain = log(still/best); advantage as given.
const COL = { app: FEATURE_NAMES.indexOf("sadApp"), flow: FEATURE_NAMES.indexOf("sadFlow"), still: FEATURE_NAMES.indexOf("sadStill") };
const frameOf = (f, gain, adv) => { const x = new Array(N_FEATURES).fill(0.5), best = 1;
    x[COL.app] = best; x[COL.flow] = best + 1; x[COL.still] = (best + EPS) * Math.exp(gain) - EPS;
    return { frame: f, x, y: [0], genDb: 30 + adv, cfDb: 30 }; };
// kind: "clock" -- gain and advantage both follow the frame number and NOTHING else; "signal" -- advantage follows the
// gain, and the gain is independent of time; slope sets the signal's sign; flip reverses one named scene; flat stills N scenes.
const world = ({ kind, slope = -1, seed, flip = null, flat = 0 }) => { const r = seededRng(seed), per = {};
    d.scenes.forEach((s, k) => { const rows = [];
        for (let f = 0; f < 39; f++) {
            const t = f / 38, sl = s === flip ? -slope : slope;
            const g = k < flat ? 1 + 0.001 * r() : kind === "clock" ? 1 + t + 0.15 * r() : 1 + r();
            const a = kind === "clock" ? sl * t + 0.15 * (r() - 0.5) : sl * (g - 1.5) + 0.15 * (r() - 0.5);
            rows.push(frameOf(f, g, a)); }
        per[s] = reverseSummary(rows, d); });
    return per; };
const two = (a, b) => ({ [d.cells[0]]: a, [d.cells[1]]: b });
{
    const clk = reverse(two(world({ kind: "clock", seed: 1 }), world({ kind: "clock", seed: 2 })), d);
    ok("*** a world where gain and advantage merely FOLLOW THE CLOCK clears H12 and FAILS H13 -- the partial separates them ***",
       clk.h12.supported && !clk.h13.supported,
       `H12 ${clk.h12.supported}, H13 ${clk.h13.supported}; mean partial ${d.cells.map((c) => mean(clk.h13.cells[c].vals || [0]).toFixed(3)).join(", ")}`);
    const sig = reverse(two(world({ kind: "signal", seed: 3 }), world({ kind: "signal", seed: 4 })), d);
    ok("*** a world where the gain itself orders the advantage backwards, independent of time, clears BOTH ***", sig.h12.supported && sig.h13.supported);
    const fwd = reverse(two(world({ kind: "signal", slope: 1, seed: 5 }), world({ kind: "signal", slope: 1, seed: 6 })), d);
    ok("*** the FORWARD world -- H11's own direction -- clears neither: the test is one-sided, the way `direction` points ***",
       fwd.h12.reportable && !fwd.h12.supported && !fwd.h13.supported);
    const up = { ...d, direction: 1 }, sigUp = reverse(two(world({ kind: "signal", seed: 3 }), world({ kind: "signal", seed: 4 })), up);
    ok("*** `direction` is READ: the same backwards world with direction +1 clears nothing ***", !sigUp.h12.supported && !sigUp.h13.supported);
    const one = reverse(two(world({ kind: "signal", seed: 7 }), world({ kind: "signal", seed: 8, flip: "zone" })), d);
    ok("*** zone reversed in ONE cell fails both -- the price the document names, the scene H11 found against it ***",
       !one.h12.supported && !one.h13.supported && one.h12.cells[d.cells[1]].test.sign.up === 6);
    const fl = reverse(two(world({ kind: "signal", seed: 9 }), world({ kind: "signal", seed: 10, flat: 3 })), d);
    ok("*** three scenes whose gain varies below cvFloor are excluded, and the cell is NOT REPORTED rather than null ***",
       !fl.h12.reportable && !fl.h13.reportable && fl.h12.cells[d.cells[1]].excluded.length === 3, fl.h12.cells[d.cells[1]].why || "");
    ok("*** a missing cell, a direction of 0 and a minFolds the alpha does not derive are all refused ***",
       throws(() => reverse({ [d.cells[0]]: world({ kind: "signal", seed: 11 }) }, d), new RegExp(d.cells[1].replace(/\./g, "\\."))) &&
       throws(() => reverseCell(world({ kind: "signal", seed: 11 }), { ...d, direction: 0 }, "rho"), /direction must be/) &&
       throws(() => reverseCell(world({ kind: "signal", seed: 11 }), { ...d, minFolds: 4 }, "rho"), /is not what alpha/));
}

console.log("\n3. *** THE SUMMARY ON REAL COMMITTED ROWS -- x1 FORWARD, WHICH NOTHING HERE DECLARES ***");
{
    const rows = gz(CACHE_H8)["1"].zone, s = reverseSummary(rows, d);
    const fin = (v) => v === null || Number.isFinite(v);
    ok("*** every field of the per-scene summary is finite or an honest null on 39 real frames -- no correlation is printed ***",
       s.n === rows.length && [s.rho, s.partial, s.rGainClock, s.rAdvClock].every(fin) && Number.isFinite(s.gain), `${s.n} frames`);
}

console.log(`\nframeReverse-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: THE DECLARED CELLS -- they are tools/ship/frameReverseMeasure-selfcheck.mjs's, which re-derives H12 and " +
            "H13 from their cache, checks C24 on both cells and re-harvests one scene.");
process.exit(fails ? 1 : 0);
