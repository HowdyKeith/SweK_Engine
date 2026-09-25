#!/usr/bin/env node
// WebGLEngine/tools/ship/frameGain-selfcheck.mjs -- v4714: H11's document, score and statistic, and the runner proven on
// real rows at x1, which the document does not declare.
//
// *** H6's SCORE ONE LEVEL UP, AND THE ONE THING THAT MAKES IT A DIFFERENT QUESTION IS PROVEN RATHER THAN SAID. ***
// On a one-block frame the frame score IS H6's block score; over many blocks it sums before the ratio, so a flat block
// adds nothing -- where H6's mean counted it. Both are rows. The cells are checked against every cell any committed
// cache was harvested at, derived from the result files, so "nobody has harvested this" is measured.
// Run: node tools/ship/frameGain-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { N_FEATURES, FEATURE_NAMES } from "../../render/genGate.mjs";
import { FRAME_ARC } from "../../render/frameVerdicts.mjs";
import { SWEEP_SINCE_V4297 as CLOSINGS } from "./gateSweep.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { EPS, ruleScore } from "./genGateRule.mjs";
import { FRAME_KEYS, CACHE_H7, RESULT_H7 } from "./frameGate.mjs";
import { CACHE_H8, RESULT_H8 } from "./frameHoles.mjs";
import { RESULT_H9 } from "./frameHoled.mjs";
import { RESULT_H10, VERT_KEYS } from "./frameVertical.mjs";
import { PREREG_H11, CACHE_H11, RESULT_H11, GAIN_KEYS, cellOf, gainRow, gainSummary, h11Cell, h11 } from "./frameGain.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));

console.log("frameGain-selfcheck -- motion's gain over standing still, summed over the frame: H11's apparatus, no declared data\n");

console.log("1. *** THE DOCUMENT, AND WHY ITS CELLS ARE NEW ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H11), GAIN_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under H7's and H10's ***",
   d !== null && throws(() => declared(readDoc(PREREG_H11), FRAME_KEYS), /does not declare|not a declared key/) &&
   throws(() => declared(readDoc(PREREG_H11), VERT_KEYS), /does not declare|not a declared key/), dErr);
if (d === null) { console.log(`\nframeGain-selfcheck: ${fails} FAILED`); process.exit(1); }
const doc = readDoc(PREREG_H11);
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };
const cells = d.cells.map(cellOf), DEF = { slabdir: opts("slabdir")[0], ratio: opts("ratio")[0] };
{
    ok("*** every cell is speed/slabdir/ratio the page offers; minFolds is derived; the scenes are the page's both ways ***",
       cells.every((c) => opts("slabspeed").includes(c.speed) && opts("slabdir").includes(c.slabdir) && opts("ratio").includes(c.ratio)) &&
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()),
       cells.map((c) => `x${c.speed} ${c.slabdir} ${c.ratio}x`).join("; "));
    ok("*** two cells, two geometries -- the hypothesis the document states needs both, because H10 is why ***",
       cells.length === 2 && new Set(cells.map((c) => c.slabdir)).size === 2);
    // WHAT HAS BEEN HARVESTED, derived from the committed result files rather than listed from memory.
    const R7 = res(RESULT_H7).declared, R8 = res(RESULT_H8).declared, R9 = res(RESULT_H9).declared, R10 = res(RESULT_H10).declared;
    const seen = new Set([...R7.speeds.map((s) => `${s}/x/${DEF.ratio}`), ...R8.speeds.map((s) => `${s}/x/${DEF.ratio}`),
                          ...R9.ratios.map((r) => `${R9.speed}/x/${r}`), `${R10.speed}/${R10.slabdir}/${DEF.ratio}`]);
    // Every per-block harvest ran before v4709 made the harvest reset the page, so all of them are at the page's DEFAULT
    // direction and ratio, at whatever speed: a declared cell at both defaults would be one of them.
    const fresh = d.cells.filter((c) => !seen.has(c) && !(cellOf(c).slabdir === DEF.slabdir && cellOf(c).ratio === DEF.ratio));
    ok("*** NEITHER declared cell has been harvested by any round -- checked against the result files, and against every pre-v4709 harvest ***",
       fresh.length === d.cells.length, `harvested: ${[...seen].join(", ")}, plus every speed at ${DEF.slabdir}/${DEF.ratio}; declared: ${d.cells.join(", ")}`);
    ok("*** no data yet: no cache and no result for H11 -- the measurement round inverts this row ***",
       !fs.existsSync(path.join(ENG, CACHE_H11)) && !fs.existsSync(path.join(ENG, RESULT_H11)));
    const em = /`eps = ([\d.e-]+)`/.exec(doc);
    ok("*** the document's eps is the one the score imports, and that is H6's ***", !!em && Number(em[1]) === EPS, em ? `eps ${em[1]}` : "no eps in the document");
    // The document's facts about earlier rounds, each read from where it lives.
    const at4 = gz(CACHE_H7)["4"], wins = (s) => at4[s].filter((r) => r.genDb > r.cfDb).length;
    const h = FRAME_ARC.headroom, c385 = CLOSINGS.since385;
    const facts = [[`${wins("ramp")} and ${wins("smooth")} of ${at4.ramp.length} frames`, "v4706's wins, counted from H7's x4 cache"],
                   [`${h.scenes.ramp} dB`, "the headroom, from render/frameVerdicts.mjs"], [`${h.scenes.smooth} on`, "the headroom, second scene"],
                   [/(\d+-\d+%) of edges' blocks/.exec(c385.verdict)?.[1] || "??", "v4703's flat-block share, from its closing"]];
    const flatDoc = doc.replace(/\s+/g, " ");   // the document wraps lines; a quoted number may span one
    const missing = facts.filter(([f]) => !flatDoc.includes(f));
    ok("*** every number the document quotes from an earlier round is the one that round recorded ***",
       !missing.length, missing.length ? `not in the document: ${missing.map(([f, w]) => `"${f}" (${w})`).join("; ")}` : facts.map(([f]) => `"${f}"`).join(", "));
}

console.log("\n2. *** THE SCORE: H6's AT ONE BLOCK, AND NOT H6's OVER MANY ***");
// v4714 -- THE FIXTURE PLACES THE SADs BY genGate's NAMES, NOT BY THE RUNNER'S OWN MAP. The first draft built rows with
// SAD_COLS, so a runner that swapped sadApp and sadStill read them back swapped and consistent, and every row stayed green.
const COL = { app: FEATURE_NAMES.indexOf("sadApp"), flow: FEATURE_NAMES.indexOf("sadFlow"), still: FEATURE_NAMES.indexOf("sadStill") };
const blk = (a, f, s) => { const x = new Array(N_FEATURES).fill(0.5); x[COL.app] = a; x[COL.flow] = f; x[COL.still] = s; return x; };
const frame = (blocks, adv = 0) => ({ frame: 0, x: blocks.flat(), y: blocks.map(() => 0), genDb: 30 + adv, cfDb: 30 });
{
    const trip = [[3, 5, 11], [7, 2, 2], [0.4, 0.9, 0.1]];
    ok("*** on a one-block frame the frame score IS H6's block score, exactly ***",
       trip.every(([a, f, s]) => gainRow(frame([blk(a, f, s)])).gain === ruleScore(a, f, s)), trip.map(([a, f, s]) => ruleScore(a, f, s).toFixed(4)).join(", "));
    const base = [blk(3, 5, 11), blk(7, 2, 9)], flat = Array.from({ length: 6 }, () => blk(0, 0, 0));
    const g0 = gainRow(frame(base)), g1 = gainRow(frame([...base, ...flat]));
    ok("*** adding flat blocks leaves the frame score BIT-IDENTICAL, while H6's mean of block scores moves -- the difference is real ***",
       g0.gain === g1.gain && g0.blockMean !== g1.blockMean,
       `gain ${g0.gain.toFixed(6)} -> ${g1.gain.toFixed(6)}; H6's block mean ${g0.blockMean.toFixed(4)} -> ${g1.blockMean.toFixed(4)} with 6 of 8 blocks flat`);
    ok("*** a frame with no finite dB is refused, and a cell that is not speed/slabdir/ratio is refused ***",
       throws(() => gainRow({ ...frame(base), genDb: NaN }), /no finite genDb/) && throws(() => cellOf("4/y/2"), /not speed\/slabdir\/ratio/) &&
       throws(() => cellOf("x4"), /not speed\/slabdir\/ratio/));
}

console.log("\n3. *** THE STATISTIC ON MADE-UP WORLDS ***");
// Each scene: 39 frames whose gain varies, with advantage = slope * gain + noise.
// v4714 -- A "FLAT" SCENE STILL VARIES, BELOW THE FLOOR. The first draft held its gain exactly constant, where Spearman
// returns null on its own, so a runner with NO cv floor excluded the same scenes and stayed green. Here the gain moves by
// about 0.1% -- enough to rank, far under cvFloor -- and follows the advantage, so only the floor can exclude it.
const world = (slope, seed, flatScenes = 0) => { const r = seededRng(seed), per = {};
    d.scenes.forEach((s, k) => { const rows = [];
        for (let f = 0; f < 39; f++) { const st = k < flatScenes ? 10 * (1 + 0.001 * r()) : 5 + 10 * r(), best = k < flatScenes ? 5 : 1 + 3 * r();
            const g = Math.log((st + EPS) / (best + EPS)), sl = typeof slope === "function" ? slope(s) : slope;
            rows.push(frame([blk(best, best + 1, st), blk(0, 0, 0)], sl * g + (r() - 0.5) * 0.3)); }
        per[s] = gainSummary(rows, d); });
    return per; };
const byCell = (a, b) => ({ [d.cells[0]]: a, [d.cells[1]]: b });
{
    const pos = h11(byCell(world(1, 1), world(1, 2)), d);
    ok("*** a world where gain orders the advantage in every scene, in both cells, is SUPPORTED ***", pos.supported,
       d.cells.map((c) => `${c}: ${pos.cells[c].test.sign.up}/7`).join(", "));
    const one = h11(byCell(world(1, 3), world((s) => (s === "checker" ? -1 : 1), 4)), d);
    ok("*** one scene reversed in ONE cell fails it -- 6 of 7, the price the document names, even with the other cell clear ***",
       !one.supported && one.cells[d.cells[0]].cleared && one.cells[d.cells[1]].test.sign.up === 6);
    const neg = h11(byCell(world(-1, 5), world(-1, 6)), d);
    ok("*** a world where gain orders it BACKWARDS everywhere is not supported -- the test is one-sided, the negation is not tested ***",
       neg.reportable && !neg.supported && d.cells.every((c) => neg.cells[c].test.t.mean < 0));
    const flat = h11(byCell(world(1, 7), world(1, 8, 3)), d);
    ok("*** three scenes whose gain varies below cvFloor are EXCLUDED, and the cell is NOT REPORTED rather than null ***",
       !flat.reportable && !flat.supported && flat.cells[d.cells[1]].excluded.length === 3, flat.cells[d.cells[1]].why || "");
    ok("*** a missing declared cell is refused by name, and a minFolds the alpha does not derive is refused ***",
       throws(() => h11({ [d.cells[0]]: world(1, 9) }, d), new RegExp(d.cells[1].replace(/\./g, "\\."))) &&
       throws(() => h11Cell(world(1, 9), { ...d, minFolds: 4 }), /is not what alpha/));
}

console.log("\n4. *** THE RUNNER ON REAL ROWS -- AT x1, FORWARD, 2x, WHICH THE DOCUMENT DOES NOT DECLARE ***");
{
    const OFF = `1/${DEF.slabdir}/${DEF.ratio}`;
    ok("*** the drive cell is not a declared one ***", !d.cells.includes(OFF), OFF);
    const cached = gz(CACHE_H8)["1"].zone.slice(0, 3);
    let plain = null, explicit = null, err = "";
    try { plain = await harvest({ scenes: ["zone"], upto: 12, speed: "1" });
          explicit = await harvest({ scenes: ["zone"], upto: 12, speed: "1", settings: { slabdir: DEF.slabdir, ratio: DEF.ratio } }); }
    catch (e) { err = String(e.message).slice(0, 160); }
    const same = (a, b) => a && b && b.every((r, i) => r.frame === a[i].frame && r.genDb === a[i].genDb && r.cfDb === a[i].cfDb && J(r.x) === J(a[i].x));
    ok("*** the harvest reproduces v4708's cached x1 rows, features included ***", !!same(plain, cached), plain ? "first three frames bit-identical" : err);
    ok("*** and the runner's settings object, set to the page defaults, changes nothing -- the path H11's harvest takes ***",
       !!(explicit && plain && explicit.length === plain.length && same(plain, explicit)), explicit ? `${explicit.length} frames identical` : err);
    const g = plain ? plain.map(gainRow) : [];
    ok("*** every real frame yields a finite gain from all three SAD columns -- and nothing is correlated with it here ***",
       g.length > 0 && g.every((f) => Number.isFinite(f.gain) && Number.isFinite(f.blockMean)), `${g.length} frames`);
}

console.log(`\nframeGain-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL -- nothing is harvested at x4 forward 3x or x4 vertical, and no gain has been " +
            "computed on any frame at a declared cell.");
process.exit(fails ? 1 : 0);
