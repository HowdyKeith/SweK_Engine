#!/usr/bin/env node
// WebGLEngine/tools/ship/frameDisagree-selfcheck.mjs -- v4722: H16's document, signal, qualifier and statistic, no declared data.
//
// *** A NEW SIGNAL IS GRADED ON BEING NEW. *** Its column must be one no earlier frame runner used as its signal, read from
// those runners' own exports; its spread at x1 -- which nothing declares -- is what the document quotes, computed here; and a
// made-up world where it merely re-ranks H11's gain must clear the test and still NOT be supported, because the qualifier
// the document fixed says so. No correlation with the advantage is computed on any real frame.
// Run: node tools/ship/frameDisagree-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { slabOffset, turnsBetween } from "../../render/slabPath.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { EPS } from "./genGateRule.mjs";
import { LAP_COL, RESULT_H7 } from "./frameGate.mjs";
import { HOLE_COL, CACHE_H8, RESULT_H8 } from "./frameHoles.mjs";
import { RESULT_H9 } from "./frameHoled.mjs";
import { RESULT_H10 } from "./frameVertical.mjs";
import { SAD_COLS, RESULT_H11, cellOf } from "./frameGain.mjs";
import { RESULT_H12 } from "./frameReverse.mjs";
import { RESULT_H14, SWAY_KEYS } from "./frameSway.mjs";
import { RESULT_H15 } from "./frameSwayRep.mjs";
import { PREREG_H16, CACHE_H16, RESULT_H16, DIS_KEYS, signalCol, frameSignal, disagreeSummary, h16 } from "./frameDisagree.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);
const f3 = (v) => (v === null || v === undefined ? "null" : v.toFixed(3));   // a null distinctness is a failed row, not a crash
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));
// Memoised: sections 1 and 3 both read the x1 cache, and unzipping it twice took this gate to within 250 ms of the sweep's budget.
const GZ = new Map();
const gz = (rel) => { if (!GZ.has(rel)) GZ.set(rel, JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"))); return GZ.get(rel); };
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };

console.log("frameDisagree-selfcheck -- the chain's two motion estimates disagreeing: H16's apparatus, no declared data\n");

console.log("1. *** THE DOCUMENT, AND WHY ITS SIGNAL AND CELLS ARE NEW ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H16), DIS_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under H14's -- `signal` and `distinctMax` are keys H14 never read ***",
   d !== null && throws(() => declared(readDoc(PREREG_H16), SWAY_KEYS), /not a declared key/), dErr);
if (d === null) { console.log(`\nframeDisagree-selfcheck: ${fails} FAILED`); process.exit(1); }
const doc = readDoc(PREREG_H16).replace(/\s+/g, " ");
const cells = d.cells.map(cellOf);
{
    // An unknown signal FAILS this row; it does not crash the gate before the row can say so.
    const col = (() => { try { return signalCol(d.signal); } catch { return -1; } })(), used = { "H7 laplacian": LAP_COL, "H8-H10 holeFrac": HOLE_COL, "H11-H15 sadApp": SAD_COLS.app, "H11-H15 sadFlow": SAD_COLS.flow, "H11-H15 sadStill": SAD_COLS.still };
    ok("*** the signal is a column genGate has, and NONE of the frame arc's earlier runners used it -- read from their own exports ***",
       col >= 0 && !Object.values(used).includes(col), `${d.signal} is column ${col}; used before: ${Object.entries(used).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    ok("*** the direction is the one the document argues in words, fixed before data: more disagreement, generation does WORSE ***",
       d.direction === -1 && doc.includes("more disagreement means generation does WORSE"), `direction ${d.direction}`);
    // Every harvested cell WITH its path, from the committed results; sway cells are H14's and H15's.
    const DEFR = opts("ratio")[0], lin = (s, dir, r) => `${s}/${dir}/${r}/linear`;
    const R7 = res(RESULT_H7).declared, R8 = res(RESULT_H8).declared, R9 = res(RESULT_H9).declared, R10 = res(RESULT_H10).declared;
    const R14 = res(RESULT_H14).declared, R15 = res(RESULT_H15).declared;
    const seen = new Set([...R7.speeds.map((s) => lin(s, "x", DEFR)), ...R8.speeds.map((s) => lin(s, "x", DEFR)), ...R9.ratios.map((r) => lin(R9.speed, "x", r)),
        lin(R10.speed, R10.slabdir, DEFR), ...res(RESULT_H11).declared.cells.map((c) => `${c}/linear`), ...res(RESULT_H12).declared.cells.map((c) => `${c}/linear`),
        ...R14.cells.map((c) => `${c}/${R14.path}`), ...R15.cells.map((c) => `${c}/${R15.path}`)]);
    const coincide = (c, f) => [f - 1, f - 0.5, f].every((u) => Math.abs(slabOffset(Math.max(0, u), Number(c.speed), d.path, c.slabdir === "x" ? 1 : 0) -
                                                                   slabOffset(Math.max(0, u), Number(c.speed), "linear", c.slabdir === "x" ? 1 : 0)) < 1e-9);
    const frames = Array.from({ length: d.upto - 1 }, (_, i) => i + 2);
    const seenFrames = (c) => (seen.has(lin(c.speed, c.slabdir, c.ratio)) || (c.slabdir === "x" && c.ratio === DEFR)) ? frames.filter((f) => coincide(c, f)) : [];
    ok("*** every cell is a page option on both geometries; NO declared cell has been harvested; NO declared frame sits on a harvested linear path ***",
       cells.every((c) => opts("slabspeed").includes(c.speed) && opts("slabdir").includes(c.slabdir) && opts("ratio").includes(c.ratio)) &&
       new Set(cells.map((c) => c.slabdir)).size === 2 && opts("slabpath").includes(d.path) && opts("slabpath")[0] !== d.path &&
       d.cells.every((c) => !seen.has(`${c}/${d.path}`)) && cells.every((c) => seenFrames(c).length === 0) &&
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()),
       `declared ${d.cells.map((c) => `${c}/${d.path}`).join(", ")}; sway harvested: ${[...seen].filter((k) => !k.endsWith("linear")).join(", ")}`);
    // The spread the document quotes, at x1 -- a cell nothing declares -- computed with the runner's own frameSignal.
    const x1 = gz(CACHE_H8)["1"], cvs = d.scenes.map((s) => { const v = x1[s].map((r) => frameSignal(r, col)), m = v.reduce((a, b) => a + b, 0) / v.length;
        return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) / m; });
    const lo = Math.min(...cvs).toFixed(3), hi = Math.max(...cvs).toFixed(3);
    ok("*** the spread the document quotes is COMPUTED at x1, where nothing is declared -- the signal varies within every scene ***",
       doc.includes(`**${lo}**`) && doc.includes(`**${hi}**`) && cvs.every((v) => v >= d.cvFloor), `cv ${lo} to ${hi}; no correlation computed`);
    ok("*** no data yet: no cache and no result -- the measurement round inverts this row ***",
       !fs.existsSync(path.join(ENG, CACHE_H16)) && !fs.existsSync(path.join(ENG, RESULT_H16)));
}
// A document naming a signal genGate does not have has failed its row above; nothing below can run without the column,
// so the gate stops here with that failure counted rather than throwing on the first made-up frame.
if (FEATURE_NAMES.indexOf(d.signal) < 0) { console.log(`\nframeDisagree-selfcheck: ${fails} FAILED -- no column "${d.signal}", sections 2-3 not run`); process.exit(1); }

console.log("\n2. *** THE STATISTIC AND THE QUALIFIER, ON MADE-UP FRAMES ***");
// A frame of `nb` blocks: `k` of them flagged as flow-beat (the signal is k/nb), and SADs placing H11's gain where asked.
const COL = { app: FEATURE_NAMES.indexOf("sadApp"), flow: FEATURE_NAMES.indexOf("sadFlow"), still: FEATURE_NAMES.indexOf("sadStill"), fb: FEATURE_NAMES.indexOf(d.signal) };
const frame = (f, k, gain, adv, nb = 10) => { const x = [];
    for (let b = 0; b < nb; b++) { const v = new Array(N_FEATURES).fill(0.5); v[COL.app] = 1; v[COL.flow] = 2; v[COL.still] = (1 + EPS) * Math.exp(gain) - EPS; v[COL.fb] = b < k ? 1 : 0; x.push(...v); }
    return { frame: f, x, y: new Array(nb).fill(0), genDb: 30 + adv, cfDb: 30 }; };
// kind "own": the signal orders the advantage and the gain is independent; "gain": the signal is a monotone copy of the gain.
// *** A "FLAT" SCENE HERE VARIES *** -- by one block in 200 on one frame, below cvFloor but enough for Spearman to rank --
// because an exactly constant signal is excluded by Spearman's own null and never by the floor (v4714).
// *** THE TURN EXCLUSION IS CHECKED BY COUNT, NOT BY EFFECT, AND THE FIRST DRAFT CLAIMED OTHERWISE. *** It gave every turn
// frame an opposite effect ten times the signal's and said only the exclusion kept the world backwards. A sabotage dropping the
// exclusion passed: five frames in 39 do not move a rank correlation that far -- measured across six seeds and two placements
// of the outliers, the verdict never changed. So the row below asks the summary which frames it scored.
const world = ({ kind = "own", slope = -1, seed, flip = null, flat = 0 }) => { const r = seededRng(seed), out = {};
    for (const c of d.cells) { out[c] = {}; const turn = new Set(turnsBetween(1, d.upto + 1, Number(cellOf(c).speed), d.path).map(Math.ceil));
        d.scenes.forEach((s, i) => { const rows = [];
        for (let f = 2; f <= d.upto; f++) { const g = 1 + r(), sl = s === flip && c === d.cells[1] ? -slope : slope;
            if (i < flat && c === d.cells[1]) { rows.push(frame(f, f === 20 ? 101 : 100, g, sl * 0.5 + 0.1 * (r() - 0.5), 200)); continue; }
            const k = kind === "gain" ? Math.min(10, Math.floor(g * 5)) : Math.floor(r() * 11);
            rows.push(frame(f, k, g, sl * (k / 10 - 0.5) + 0.1 * (r() - 0.5))); }
        out[c][s] = disagreeSummary(rows, d, c); }); }
    return out; };
{
    const own = h16(world({ seed: 1 }), d);
    ok("*** a world where disagreement orders the advantage backwards, independent of the gain, is SUPPORTED and DISTINCT ***",
       own.supported && own.distinct, `mean |rho| with gain ${f3(own.meanAbsWithGain)} <= ${d.distinctMax}`);
    const w1 = world({ seed: 1 }), T = d.cells.map((c) => turnsBetween(1, d.upto, Number(cellOf(c).speed), d.path).length);
    ok("*** the summary scores ONLY the non-turn frames: each scene loses exactly the turns the path names in that cell ***",
       d.cells.every((c, i) => T[i] > 0 && d.scenes.every((s) => w1[c][s].turns === T[i] && w1[c][s].n === d.upto - 1 - T[i])),
       d.cells.map((c, i) => `${c}: ${T[i]} turns, ${w1[c][d.scenes[0]].n} frames scored`).join("; "));
    const copy = h16(world({ kind: "gain", seed: 2 }), d);
    ok("*** a world where the signal is only the gain re-ranked CLEARS the test and is NOT supported -- the qualifier the document fixed ***",
       copy.clears && !copy.distinct && !copy.supported, `mean |rho| with gain ${f3(copy.meanAbsWithGain)} > ${d.distinctMax}`);
    const one = h16(world({ seed: 3, flip: "checker" }), d);
    // A cell that could not be tested has no `test`: the row fails on it rather than reading `.sign` off nothing.
    ok("*** one scene against it in one cell fails it ***", !one.supported && !!one.cells[d.cells[1]].test && one.cells[d.cells[1]].test.sign.up === 6,
       one.cells[d.cells[1]].test ? "" : `the cell was not testable: ${one.cells[d.cells[1]].why}`);
    const up = h16(world({ seed: 1 }), { ...d, direction: 1 });
    ok("*** `direction` is READ: the same backwards world with direction +1 is not supported ***", !up.supported && !up.clears);
    const fl = h16(world({ seed: 4, flat: 3 }), d);
    ok("*** three scenes whose signal varies below cvFloor are excluded, and the cell is NOT REPORTED ***", !fl.reportable && !fl.supported, fl.cells[d.cells[1]].why || "");
    ok("*** a missing cell and a signal genGate does not have are both refused by name ***",
       throws(() => h16({ [d.cells[0]]: world({ seed: 5 })[d.cells[0]] }, d), new RegExp(d.cells[1].replace(/\./g, "\\."))) &&
       throws(() => signalCol("srcIsMagic"), /no feature "srcIsMagic"/));
}

console.log("\n3. *** THE SUMMARY ON REAL COMMITTED ROWS -- x1, WHICH NOTHING HERE DECLARES ***");
{
    const rows = gz(CACHE_H8)["1"].zone, s = disagreeSummary(rows, { ...d, path: "linear" }, "1/x/2");
    const fin = (v) => v === null || Number.isFinite(v);
    ok("*** every field of the summary is finite or an honest null on 39 real frames -- and no correlation is printed ***",
       s.n === rows.length && s.turns === 0 && Number.isFinite(s.signal) && [s.rho, s.withGain, s.partial].every(fin), `${s.n} frames`);
}

console.log(`\nframeDisagree-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL -- nothing is harvested on sway at x4 and 3x; C25, C26 and C12 there are the measurement round's.");
process.exit(fails ? 1 : 0);
