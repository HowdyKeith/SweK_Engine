#!/usr/bin/env node
// WebGLEngine/tools/ship/frameSway-selfcheck.mjs -- v4718: the page's new slab path proven, and H14's document and statistic,
// with no declared data. The page is driven only at x1, which the document does not declare.
//
// *** THE PATH IS PROVEN THREE WAYS: IN ARITHMETIC, IN THE PICTURE, AND BY WHAT IT DOES NOT CHANGE. *** render/slabPath.mjs
// must reproduce the old linear expression exactly, keep the sway inside the view the page's own geometry allows, and
// place its turns where the offset's slope actually reverses. Driven, the linear path must reproduce v4708's cached rows,
// the sway must move every frame -- and the slab, counted in the harvested depth column, must stay whole on sway while it
// leaves on linear.
// Run: node tools/ship/frameSway-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { FEATURE_NAMES, N_FEATURES } from "../../render/genGate.mjs";
import { SLAB_DX, DOLLY, SWAY_AMP, SLAB_PATHS, slabOffset, turnsBetween } from "../../render/slabPath.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { EPS } from "./genGateRule.mjs";
import { CACHE_H7 } from "./frameGate.mjs";
import { CACHE_H8 } from "./frameHoles.mjs";
import { RESULT_H11, CACHE_H11, cellOf } from "./frameGain.mjs";
import { RESULT_H12, REV_KEYS } from "./frameReverse.mjs";
import { PREREG_H14, CACHE_H14, RESULT_H14, SWAY_KEYS, DEPTH_COL, SLAB_DEPTH_CUT, slabBlocks, nonTurnRows, swaySummary, h14 } from "./frameSway.mjs";
import { harvest } from "./genGateTrain.mjs";
import { noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);
const res = (rel) => JSON.parse(fs.readFileSync(path.join(ENG, rel), "utf8"));
const gz = (rel) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, rel))).toString("utf8"));
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };

console.log("frameSway-selfcheck -- a slab that never leaves the view, and H14 declared on it\n");

console.log("1. *** THE PATH, IN ARITHMETIC, AGAINST THE PAGE'S OWN GEOMETRY ***");
// The page's geometry, read from the page: the slab's half-width, the eye-to-slab distance, and the field of view.
const g = { half: Number((/const SLAB_X = \[(-?[\d.]+), ([\d.]+)\]/.exec(html) || [])[2]),
            dist: -Number((/const Y_NEAR = (-?[\d.]+)/.exec(html) || [])[1]) + Number((/dollyVP = \(f\) => viewProj\(\[f \* DOLLY, (-?[\d.]+)/.exec(html) || [])[1]) * -1 * -1,
            tan: Math.tan(Number((/TANFOV = Math\.tan\(([\d.]+)\)/.exec(html) || [])[1])) };
g.dist = Math.abs(Number((/const Y_NEAR = (-?[\d.]+)/.exec(html) || [])[1]) - Number((/dollyVP = \(f\) => viewProj\(\[f \* DOLLY, (-?[\d.]+)/.exec(html) || [])[1]));
const halfView = g.dist * g.tan;
{
    // v4718 -- NOT ONLY THE PAGE'S SPEEDS. Its 1, 2, 4 and 8 are powers of two, where both associations give the same bits,
    // so a sabotage re-associating the product passed a row that tried only those: an empty adversarial population. Speeds
    // that are not powers of two are where the association shows, so the row tries them too.
    const ts = Array.from({ length: 81 }, (_, i) => i * 0.5), speeds = [1, 2, 4, 8, 3, 1.5, 0.7, 6];
    ok("*** LINEAR is the old expression exactly -- t * SLAB_DX * speed, associated the same way, at every t and speed tried ***",
       ts.every((t) => speeds.every((s) => slabOffset(t, s, "linear") === t * 0.055 * s)) && SLAB_DX === 0.055 && DOLLY === 0.02,
       `${ts.length * speeds.length} offsets compared with ===`);
    const dev = Math.max(...speeds.flatMap((s) => ["x", "z"].flatMap((dir) => ts.map((t) => Math.abs(slabOffset(t, s, "sway", dir === "x" ? 1 : 0) - DOLLY * t * (dir === "x" ? 1 : 0))))));
    ok("*** SWAY keeps the slab WHOLE in view: its offset from the camera's track never exceeds the half-view less the slab's half-width ***",
       Number.isFinite(halfView) && dev <= SWAY_AMP + 1e-12 && SWAY_AMP <= halfView - g.half,
       `max offset ${dev.toFixed(4)} <= amplitude ${SWAY_AMP} <= ${halfView.toFixed(4)} - ${g.half} = ${(halfView - g.half).toFixed(4)}, from the page's own constants`);
    // Speed and turns, found NUMERICALLY from the offset's slope rather than trusted from turnsBetween's formula.
    // Step the offset (less the camera's track) in small increments: a turn is where the slope's sign flips, and every step
    // not touching a turn must move at exactly the linear speed. The step that straddles a turn is the only one allowed off.
    const dt = 1e-3, v = SLAB_DX * 4, found = [], off = [];
    let prev = null;
    for (let i = 0; i * dt < 40; i++) { const t = i * dt, sl = (slabOffset(t + dt, 4, "sway", 1) - slabOffset(t, 4, "sway", 1)) / dt - DOLLY;
        if (prev !== null && Math.sign(sl) !== Math.sign(prev)) found.push(t);
        if (Math.abs(Math.abs(sl) - v) > 1e-6) off.push(t);
        prev = sl; }
    const speedOk = off.every((t) => found.some((f) => Math.abs(f - t) <= 2 * dt));
    const formula = turnsBetween(0, 40, 4, "sway");
    ok("*** SWAY moves at the SAME speed as linear, and turnsBetween puts its turns where the slope actually reverses ***",
       speedOk && found.length === formula.length && found.every((f, i) => Math.abs(f - formula[i]) < 3 * dt) && turnsBetween(0, 40, 4, "linear").length === 0,
       `x4: |slope| ${(SLAB_DX * 4).toFixed(3)} everywhere off the turns; turns at ${formula.map((t) => t.toFixed(2)).join(", ")}`);
    const rows = Array.from({ length: 39 }, (_, i) => ({ frame: i + 2 }));
    const kept = nonTurnRows(rows, "4", "sway").map((r) => r.frame), gone = rows.map((r) => r.frame).filter((f) => !kept.includes(f));
    ok("*** the frames excluded are exactly those whose interval (t - 1, t] holds a turn -- computed from the path alone ***",
       J(gone) === J(formula.map((t) => Math.ceil(t))) && nonTurnRows(rows, "4", "linear").length === rows.length &&
       throws(() => nonTurnRows(rows, "4", "wobble"), /unknown path/), `x4 excludes frames ${gone.join(", ")}; linear excludes none`);
}

{
    // *** EVERY PLACE THE PAGE TURNS SCENE TIME INTO A SLAB OFFSET GOES THROUGH slabAt. *** Found while planning this gate's
    // sabotages: if the mid-frame truth kept the old `tMid * SLAB_DX * speed`, every sway frame would be scored against a
    // truth on the WRONG path, the dB would still move, the slab would still stay whole -- and no driven row would notice.
    const code = noComments(html);
    const sites = [/sx0 = objectsCam \? slabAt\(t0, slabSpeed\(\)\) : 0/, /const sxCur = objects \? slabAt\(sceneT\(\), speed\) : 0/,
                   /const sxPrev = objects \? slabAt\(sceneTPrev\(\), speed\) : 0/, /truthPersp\(dollyVP\(tMid\), kind, objects \? slabAt\(tMid, speed\) : 0/];
    const stray = (code.match(/\*\s*SLAB_DX\b|\bSLAB_DX\s*\*/g) || []).length;
    ok("*** the page computes a slab offset ONLY through slabAt -- reset, current, previous and the mid-frame truth -- and nowhere by hand ***",
       sites.every((r) => r.test(code)) && stray === 0 && (code.match(/slabAt\(/g) || []).length === sites.length && /const slabAt = \(t, speed\) => slabOffset\(t, speed, SLAB_PATH, SLAB_DIR\[0\]\);/.test(code),
       `${sites.filter((r) => r.test(code)).length} of ${sites.length} sites; ${stray} hand-written SLAB_DX products; slabAt called exactly there, and defined as slabOffset on the page's path and direction`);
}

console.log("\n2. *** THE DOCUMENT ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H14), SWAY_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under H12's -- `path` is a key H12 never read ***",
   d !== null && throws(() => declared(readDoc(PREREG_H14), REV_KEYS), /not a declared key/), dErr);
if (d === null) { console.log(`\nframeSway-selfcheck: ${fails} FAILED`); process.exit(1); }
const doc = readDoc(PREREG_H14).replace(/\s+/g, " ");
{
    const cells = d.cells.map(cellOf);
    ok("*** every cell is a page option, both geometries, the path is a page option and NOT the default every earlier harvest used ***",
       cells.every((c) => opts("slabspeed").includes(c.speed) && opts("slabdir").includes(c.slabdir) && opts("ratio").includes(c.ratio)) &&
       new Set(cells.map((c) => c.slabdir)).size === 2 && opts("slabpath").includes(d.path) && opts("slabpath")[0] !== d.path &&
       J(opts("slabpath")) === J([...SLAB_PATHS]) && d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()),
       `path ${d.path}; page default ${opts("slabpath")[0]}; cells ${d.cells.join(", ")}`);
    const R11 = res(RESULT_H11);
    ok("*** at the speed H11 saw the pattern, so the path is the only thing changed ***",
       cells.every((c) => R11.declared.cells.some((q) => cellOf(q).speed === c.speed)), `x${cells[0].speed}`);
    const R12 = res(RESULT_H12), signs = R12.declared.cells.map((c) => Math.sign(mean(R12.declared.scenes.map((s) => R12.per[c][s].rho))));
    ok("*** `direction` is the sign H12 recorded, the same in both of its cells ***", signs.every((s) => s === d.direction), `H12 ${signs.join(", ")}; declared ${d.direction}`);
    ok("*** no data yet: no cache and no result -- the measurement round inverts this row ***",
       !fs.existsSync(path.join(ENG, CACHE_H14)) && !fs.existsSync(path.join(ENG, RESULT_H14)));
    // The document's account of the window, counted from H11's committed rows -- geometry only, no gain and no dB read.
    const c11 = gz(CACHE_H11), cut = (rows) => { const full = slabBlocks(rows[0]);
        return { leave: (rows.find((r) => slabBlocks(r) < full) || {}).frame, gone: (rows.find((r) => slabBlocks(r) === 0) || {}).frame,
                 withSlab: rows.filter((r) => slabBlocks(r) > 0).length }; };
    const [fx, fz] = R11.declared.cells.map((c) => cut(c11[c].zone));
    const facts = [`starts to leave at frame **${fx.leave}**`, `gone by frame **${fx.gone}**`, `starts at frame **${fz.leave}**`,
                   `gone by frame **${fz.gone}**`, `in only **${fx.withSlab}** and **${fz.withSlab}**`];
    const every = R11.declared.cells.every((c) => new Set(R11.declared.scenes.map((s) => J(cut(c11[c][s])))).size === 1);
    const missing = facts.filter((f) => !doc.includes(f));
    ok("*** the document's account of H11's window is COUNTED from H11's rows, and holds for every scene alike ***",
       !missing.length && every, missing.length ? `not in the document: ${missing.join("; ")}` : facts.join("; "));
    // The depth cut is the midpoint of the two planes as they appear in committed rows.
    const depths = [...new Set(gz(CACHE_H7)["4"].ramp.slice(0, 3).flatMap((r) => Array.from({ length: r.y.length }, (_, b) => r.x[b * N_FEATURES + DEPTH_COL])))].sort();
    ok("*** the slab/background cut is the midpoint of the two depths the committed rows actually hold ***",
       depths.length === 2 && Math.abs(SLAB_DEPTH_CUT - (depths[0] + depths[1]) / 2) < 1e-3 && DEPTH_COL === FEATURE_NAMES.indexOf("depth"),
       `planes at ${depths.map((v) => v.toFixed(4)).join(" and ")}; cut ${SLAB_DEPTH_CUT}`);
}

console.log("\n3. *** THE STATISTIC: H12's, ON NON-TURN FRAMES, BOTH CELLS ***");
{
    const COL = { app: FEATURE_NAMES.indexOf("sadApp"), flow: FEATURE_NAMES.indexOf("sadFlow"), still: FEATURE_NAMES.indexOf("sadStill") };
    const fr = (f, gain, adv) => { const x = new Array(N_FEATURES).fill(0.5); x[COL.app] = 1; x[COL.flow] = 2; x[COL.still] = (1 + EPS) * Math.exp(gain) - EPS;
        return { frame: f, x, y: [0], genDb: 30 + adv, cfDb: 30 }; };
    // Backwards signal on ordinary frames; on TURN frames an opposite effect ten times larger, which only exclusion removes.
    const world = (seed, flip = null) => { const r = seededRng(seed), per = {}, c = d.cells[0];
        const turn = new Set(turnsBetween(1, 41, Number(cellOf(c).speed), d.path).map(Math.ceil));
        d.scenes.forEach((s) => { const rows = [];
            for (let f = 2; f <= 40; f++) { const gn = 1 + r(), sl = s === flip ? 1 : -1;
                rows.push(fr(f, turn.has(f) ? 5 + r() : gn, turn.has(f) ? 20 : sl * (gn - 1.5) + 0.1 * (r() - 0.5))); }
            per[s] = swaySummary(rows, d, c); });
        return per; };
    const both = (a, b) => ({ [d.cells[0]]: a, [d.cells[1]]: b });
    const w = h14(both(world(1), world(2)), d);
    ok("*** a backwards world whose TURN frames carry a huge opposite effect is SUPPORTED -- because those frames are excluded ***",
       w.supported && Object.values(world(1)).every((p) => p.turns === 5), `each scene lost ${world(1).zone.turns} turn frames`);
    const one = h14(both(world(3), world(4, "zone")), d);
    ok("*** zone against it in one cell fails it -- the price the document names ***", !one.supported && one.cells[d.cells[1]].test.sign.up === 6);
    ok("*** a missing cell is refused by name ***", throws(() => h14({ [d.cells[0]]: world(5) }, d), new RegExp(d.cells[1].replace(/\./g, "\\."))));
}

console.log("\n4. *** THE PAGE, DRIVEN AT x1 -- A SPEED THE DOCUMENT DOES NOT DECLARE ***");
{
    const OFF = "1";
    ok("*** the drive speed is not a declared one ***", !d.cells.some((c) => cellOf(c).speed === OFF));
    const cached = gz(CACHE_H8)[OFF].zone;
    let lin = null, sway = null, err = "";
    try { lin = await harvest({ scenes: ["zone"], upto: 40, speed: OFF });
          sway = await harvest({ scenes: ["zone"], upto: 40, speed: OFF, settings: { slabpath: d.path } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = lin && lin.every((r, i) => r.frame === cached[i].frame && r.genDb === cached[i].genDb && r.cfDb === cached[i].cfDb && J(r.x) === J(cached[i].x));
    ok("*** the LINEAR path reproduces v4708's whole cached x1 window, features included -- the default is inert ***", !!same,
       lin ? `${lin.length} frames bit-identical` : err);
    const moved = sway && lin && sway.every((r, i) => r.frame === lin[i].frame && (r.genDb !== lin[i].genDb || r.cfDb !== lin[i].cfDb));
    ok("*** with ONLY slabpath set to sway, every frame's dB moves -- the path is honoured ***", !!moved, sway ? `${sway.length} frames` : err);
    const cnt = (rows) => rows.map(slabBlocks), cl = lin ? cnt(lin) : [], cs = sway ? cnt(sway) : [];
    ok("*** and the slab stays WHOLE on sway -- every frame at 90% of its first count or more -- while on linear it starts to leave ***",
       cs.length > 0 && cs.every((n) => n >= 0.9 * cs[0]) && cl.some((n) => n < 0.9 * cl[0]),
       `slab blocks, sway: min ${Math.min(...cs)} of ${cs[0]}; linear: ${cl[0]} falling to ${cl[cl.length - 1]}`);
    // The turn in the picture: the slab's screen centroid runs one way, then back -- where turnsBetween said.
    const BW = 24, cen = (row) => { const b = []; for (let i = 0; i < row.y.length; i++) if (row.x[i * N_FEATURES + DEPTH_COL] < SLAB_DEPTH_CUT) b.push(i % BW);
        return b.length ? mean(b) : NaN; };
    const cx = sway ? sway.map(cen) : [], turn = turnsBetween(0, 41, 1, d.path)[0], peak = sway ? sway[cx.indexOf(Math.max(...cx))].frame : NaN;
    // v4718 -- A PATH WITH NO TURN FAILS THIS ROW; IT DOES NOT CRASH IT. Declaring the path `linear` left `turn` undefined and
    // the first draft called .toFixed on it after four rows had already reddened.
    ok("*** and it REVERSES in the picture: the slab's screen centroid peaks at the frame turnsBetween names ***",
       turn !== undefined && Math.abs(peak - turn) <= 1.5,
       turn !== undefined ? `turn at t ${turn.toFixed(2)}; centroid column peaks at frame ${peak}` : `the declared path "${d.path}" has no turn in the window`);
}

console.log(`\nframeSway-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL -- nothing is harvested on sway at x4; C25 on the declared cells and C12 are the measurement round's.");
process.exit(fails ? 1 : 0);
