#!/usr/bin/env node
// WebGLEngine/tools/ship/frameSwayRep-selfcheck.mjs -- v4720: H15's document, statistic and controls, with no declared data.
// The page is driven only at x1, which the document does not declare.
//
// *** A REPLICATION IS GRADED ON WHAT IT KEEPS AND WHAT IT CHANGES. *** It keeps H14's path, statistic and direction -- the
// direction read from H14's result through the document's own `replicates` key -- and changes the speed. Its ratio is not
// the default, and the reason is COMPUTED here: at 2x the vertical sway would re-walk frames H12 already harvested.
// Run: node tools/ship/frameSwayRep-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { slabOffset, turnsBetween } from "../../render/slabPath.mjs";
import { FRAME_VERDICTS } from "../../render/frameVerdicts.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { EPS } from "./genGateRule.mjs";
import { RESULT_H7 } from "./frameGate.mjs";
import { RESULT_H8 } from "./frameHoles.mjs";
import { RESULT_H9 } from "./frameHoled.mjs";
import { RESULT_H10 } from "./frameVertical.mjs";
import { RESULT_H11, cellOf } from "./frameGain.mjs";
import { RESULT_H12 } from "./frameReverse.mjs";
import { PREREG_H14, RESULT_H14, SWAY_KEYS, swaySummary, h14, slabBlocks } from "./frameSway.mjs";
import { PREREG_H15, CACHE_H15, RESULT_H15, REP_KEYS, h15, centroidAlong, reversalsNear, GRID } from "./frameSwayRep.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };

console.log("frameSwayRep-selfcheck -- H14 replicated at x2: H15's apparatus, no declared data\n");

console.log("1. *** THE DOCUMENT: WHAT IT KEEPS, WHAT IT CHANGES, AND WHY ITS RATIO IS 3 ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H15), REP_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under H14's -- `replicates` is a key H14 never read ***",
   d !== null && throws(() => declared(readDoc(PREREG_H15), SWAY_KEYS), /not a declared key/), dErr);
if (d === null) { console.log(`\nframeSwayRep-selfcheck: ${fails} FAILED`); process.exit(1); }
const doc = readDoc(PREREG_H15).replace(/\s+/g, " ");
const d14 = declared(readDoc(PREREG_H14), SWAY_KEYS), cells = d.cells.map(cellOf);
{
    const src = FRAME_VERDICTS.find((v) => v.id === d.replicates);
    ok("*** `replicates` names a hypothesis in the page's verdict table, and it is H14 -- whose document this keeps the path of ***",
       !!src && src.doc === PREREG_H14 && d.path === d14.path && d.replicates === "H14", src ? `${src.id}: ${src.verdict} at ${src.round}` : `no ${d.replicates} in the table`);
    const R14 = res(RESULT_H14), signs = R14.declared.cells.map((c) => Math.sign(mean(R14.declared.scenes.map((s) => R14.per[c][s].rho))));
    ok("*** `direction` is the sign the replicated hypothesis recorded, the same in both of its cells ***",
       signs.every((s) => s === d.direction), `${d.replicates} ${signs.join(", ")}; declared ${d.direction}`);
    ok("*** it CHANGES the speed and keeps everything else of H14's cells but the ratio: both geometries, one ratio for both ***",
       cells.every((c) => !d14.cells.some((q) => cellOf(q).speed === c.speed)) && new Set(cells.map((c) => c.slabdir)).size === 2 &&
       new Set(cells.map((c) => c.ratio)).size === 1 && cells.every((c) => opts("slabspeed").includes(c.speed) && opts("ratio").includes(c.ratio)) &&
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()),
       `H14 at x${cellOf(d14.cells[0]).speed}; this at x${cells[0].speed}, ratio ${cells[0].ratio}`);
    // EVERY HARVESTED CELL, with its path: the frame results before v4718 are all linear, H14's are sway.
    const lin = (spd, dir, r) => `${spd}/${dir}/${r}/linear`, DEFR = opts("ratio")[0];
    const R7 = res(RESULT_H7).declared, R8 = res(RESULT_H8).declared, R9 = res(RESULT_H9).declared, R10 = res(RESULT_H10).declared;
    const seen = new Set([...R7.speeds.map((s) => lin(s, "x", DEFR)), ...R8.speeds.map((s) => lin(s, "x", DEFR)), ...R9.ratios.map((r) => lin(R9.speed, "x", r)),
        lin(R10.speed, R10.slabdir, DEFR), ...res(RESULT_H11).declared.cells.map((c) => `${c}/linear`), ...res(RESULT_H12).declared.cells.map((c) => `${c}/linear`),
        ...d14.cells.map((c) => `${c}/${d14.path}`)]);
    const pre = (c) => c.slabdir === "x" && c.ratio === DEFR;    // every pre-v4709 harvest: the page defaults, any speed, linear
    // Which declared frames sit on a LINEAR path someone harvested: where sway and linear coincide at t - 1, t - 1/2 and t.
    const coincide = (c, f) => [f - 1, f - 0.5, f].every((u) => Math.abs(slabOffset(Math.max(0, u), Number(c.speed), d.path, c.slabdir === "x" ? 1 : 0) -
                                                                   slabOffset(Math.max(0, u), Number(c.speed), "linear", c.slabdir === "x" ? 1 : 0)) < 1e-9);
    const frames = Array.from({ length: d.upto - 1 }, (_, i) => i + 2);
    const seenFrames = (c) => (seen.has(lin(c.speed, c.slabdir, c.ratio)) || pre(c)) ? frames.filter((f) => coincide(c, f)) : [];
    ok("*** NO declared cell has been harvested, and NO declared frame sits on a linear path anyone harvested ***",
       d.cells.every((c) => !seen.has(`${c}/${d.path}`)) && cells.every((c) => seenFrames(c).length === 0),
       `${cells.map((c) => `${c.speed}/${c.slabdir}/${c.ratio}: ${frames.filter((f) => coincide(c, f)).length} frames coincide with linear, whose twin was ${seen.has(lin(c.speed, c.slabdir, c.ratio)) ? "HARVESTED" : "never harvested"}`).join("; ")}`);
    // AND THE REASON THE RATIO IS NOT THE DEFAULT, computed: the vertical cell at 2x would re-walk H12's harvested frames.
    const at2 = { ...cells.find((c) => c.slabdir === "z"), ratio: DEFR }, would = seenFrames(at2);
    const facts = [`frames **${would[0]} to ${would[would.length - 1]}**`, `That is **${would.length}** of each scene's`,
                   ...turnsBetween(1, d.upto, Number(cells[0].speed), d.path).map((t) => t.toFixed(2))];
    const missing = facts.filter((f) => !doc.includes(f));
    ok("*** the document's reason for ratio 3 is COMPUTED: at 2x the vertical sway would re-walk H12's harvested frames, and its turns are the path's ***",
       would.length > 0 && seen.has(lin(at2.speed, "z", DEFR)) && !missing.length,
       missing.length ? `not in the document: ${missing.join("; ")}` : `at ${DEFR}x: frames ${would.join(", ")} seen; turns ${facts.slice(2).join(", ")}`);
    const v14 = FRAME_VERDICTS.find((v) => v.id === "H14"), quoted = ["**13 of 14**", "**57%**", "**65%**"];
    ok("*** the numbers it quotes from H14 are the ones the page's verdict table holds for H14 ***",
       quoted.every((q) => doc.includes(q) && v14.numbers.includes(q.replace(/\*/g, ""))), quoted.join(", "));
    ok("*** no data yet: no cache and no result -- the measurement round inverts this row ***",
       !fs.existsSync(path.join(ENG, CACHE_H15)) && !fs.existsSync(path.join(ENG, RESULT_H15)));
}

console.log("\n2. *** THE STATISTIC IS H14's, AND THE TURNS ARE x2's ***");
{
    const COL = { app: FEATURE_NAMES.indexOf("sadApp"), flow: FEATURE_NAMES.indexOf("sadFlow"), still: FEATURE_NAMES.indexOf("sadStill") };
    const fr = (f, gain, adv) => { const x = new Array(N_FEATURES).fill(0.5); x[COL.app] = 1; x[COL.flow] = 2; x[COL.still] = (1 + EPS) * Math.exp(gain) - EPS;
        return { frame: f, x, y: [0], genDb: 30 + adv, cfDb: 30 }; };
    const world = (seed, flip = null) => { const r = seededRng(seed), out = {};
        for (const c of d.cells) { out[c] = {}; for (const s of d.scenes) { const rows = [];
            for (let f = 2; f <= d.upto; f++) { const g = 1 + r(); rows.push(fr(f, g, (s === flip && c === d.cells[1] ? 1 : -1) * (g - 1.5) + 0.1 * (r() - 0.5))); }
            out[c][s] = swaySummary(rows, d, c); } }
        return out; };
    const w = world(1), one = world(2, "bars");
    ok("*** H15 IS H14's verdict on the same numbers -- nothing re-implemented -- and it fails with bars against it in one cell ***",
       J(h15(w, d)) === J(h14(w, d)) && h15(w, d).supported && !h15(one, d).supported && h15(one, d).cells[d.cells[1]].test.sign.up === 6);
    const turns = w[d.cells[0]].zone.turns, expect = turnsBetween(1, d.upto, Number(cells[0].speed), d.path).length;
    ok("*** at x2 the path turns twice in the window, and exactly those frames are excluded ***", turns === expect && expect === 2, `${turns} frames excluded per scene`);
}

{
    // *** C26 ON MADE-UP PICTURES, FOR THE TWO WAYS ITS REAL-ROW CONTROL COULD NOT FAIL. *** The first draft's only negative
    // case was the linear path, whose extreme sits at the far end of the window -- so a sabotage dropping the sign condition
    // and one dropping the location check each passed. Each condition gets the case that needs it: a monotone slab whose rows
    // END just after the turn has its extreme beside the turn and no reversal (the sign); and a real reversal asked about at
    // the wrong time -- 2 frames late -- has opposite movements but its extreme 2 frames away (the location). Slab blocks are placed by the depth
    // column, one column of four blocks at the centroid the case asks for.
    const DEPTH = FEATURE_NAMES.indexOf("depth");
    const pic = (frame, col) => { const x = new Array(576 * N_FEATURES).fill(0.977), y = new Array(576).fill(0);
        for (let r = 0; r < 4; r++) x[(r * 24 + col) * N_FEATURES + DEPTH] = 0.952;
        return { frame, x, y }; };
    const up = (f) => f, peak = (T) => (f) => (f <= T ? f : 2 * T - f);
    const T = 12, speed = "2";                                   // W at x2 is 8 frames
    const real = Array.from({ length: 23 }, (_, i) => pic(i + 2, peak(T)(i + 2)));
    const mono = Array.from({ length: 12 }, (_, i) => pic(i + 2, up(i + 2)));     // rows end at frame 13, one after T
    const r1 = reversalsNear(real, [T], "x", speed)[0], r2 = reversalsNear(real, [T + 2], "x", speed)[0], r3 = reversalsNear(mono, [T], "x", speed)[0];
    ok("*** a reversal at the turn is found; the SAME reversal asked about 2 frames late is not; a monotone slab ending just past the turn is not ***",
       r1.reversed && !r2.reversed && !r3.reversed,
       `at the turn: ${r1.reversed} (extreme at ${r1.at}); asked 2 late: ${r2.reversed} (net ${r2.before} then ${r2.after}, opposite) ; monotone, cut short: ${r3.reversed} (net ${r3.before} then ${r3.after})`);
}

console.log("\n3. *** THE PAGE, DRIVEN AT x1 -- A SPEED THE DOCUMENT DOES NOT DECLARE ***");
{
    const OFF = "1";
    ok("*** the drive speed is not a declared one ***", !cells.some((c) => c.speed === OFF));
    let x2 = null, x3 = null, z3 = null, err = "";
    try { x2 = await harvest({ scenes: ["zone"], upto: 20, speed: OFF, settings: { slabpath: d.path, ratio: "2" } });
          x3 = await harvest({ scenes: ["zone"], upto: 20, speed: OFF, settings: { slabpath: d.path, ratio: cells[0].ratio } });
          z3 = await harvest({ scenes: ["zone"], upto: 20, speed: OFF, settings: { slabpath: d.path, ratio: cells[0].ratio, slabdir: "z" } }); }
    catch (e) { err = String(e.message).slice(0, 160); }
    const moved = x2 && x3 && x3.every((r, i) => r.frame === x2[i].frame && (r.genDb !== x2[i].genDb || r.cfDb !== x2[i].cfDb));
    ok("*** the RATIO is honoured together with the sway path: every frame's dB moves from 2x to 3x ***", !!moved, x3 ? `${x3.length} frames` : err);
    const whole = (rows) => rows && rows.every((r) => slabBlocks(r) >= 0.9 * slabBlocks(rows[0]) && slabBlocks(rows[0]) > 0);
    // GRID is read off the page, not trusted: the centroid's axes are only columns and rows if the harvested block field is
    // GRID x GRID, at the default ratio and at the declared one alike.
    ok("*** the harvested block field is GRID x GRID at both ratios -- so the centroid's columns and rows are the screen's axes ***",
       !!(x2 && x3) && x2[0].y.length === GRID * GRID && x3[0].y.length === GRID * GRID, x3 ? `${x3[0].y.length} blocks = ${GRID} x ${GRID}` : err);
    ok("*** and at 3x the slab stays whole on both geometries ***", whole(x3) && whole(z3),
       x3 && z3 ? `slab blocks x: ${Math.min(...x3.map(slabBlocks))}-${Math.max(...x3.map(slabBlocks))}; z: ${Math.min(...z3.map(slabBlocks))}-${Math.max(...z3.map(slabBlocks))}` : err);
    // C26 ON REAL ROWS: the reversal read off the picture, on each geometry, at the turn the path names -- and, as the control
    // that makes it a test, NOT found on the linear path, which never turns.
    const T = turnsBetween(1, 20, 1, d.path);
    const rx = x3 ? reversalsNear(x3, T, "x", OFF) : [], rz = z3 ? reversalsNear(z3, T, "z", OFF) : [];
    let lin = null; try { lin = await harvest({ scenes: ["zone"], upto: 20, speed: OFF, settings: { ratio: cells[0].ratio } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const rl = lin ? reversalsNear(lin, T, "x", OFF) : [];
    ok("*** C26's reversal is read off the picture at the turn the path names, on BOTH geometries -- and not found on the linear path ***",
       T.length === 1 && rx.every((q) => q.reversed) && rz.every((q) => q.reversed) && rl.length === 1 && !rl[0].reversed,
       `turn at t ${T.map((t) => t.toFixed(2)).join(", ")}: sway x extreme at frame ${rx.map((q) => q.at === undefined ? "-" : q.at.toFixed(1)).join("")}, ` +
       `sway z at ${rz.map((q) => q.at === undefined ? "-" : q.at.toFixed(1)).join("")}; linear net movement ${rl.map((q) => `${(q.before || 0).toFixed(2)} then ${(q.after || 0).toFixed(2)}`).join("")}, the same sign`);
}

console.log(`\nframeSwayRep-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL -- nothing is harvested on sway at x2; C25, C26 and C12 on the declared cells are the " +
            "measurement round's.");
process.exit(fails ? 1 : 0);
