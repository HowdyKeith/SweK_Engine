#!/usr/bin/env node
// WebGLEngine/tools/ship/frameHoled-selfcheck.mjs -- v4709: H9's statistic on SYNTHETIC frames, and C21 -- the ratio control
// proven honoured by the page -- at x1, a speed the document does not declare.
// Run: node tools/ship/frameHoled-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { N_FEATURES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { FRAME_KEYS, PREREG_H7 } from "./frameGate.mjs";
import { PREREG_H8, CACHE_H8, HOLE_COL } from "./frameHoles.mjs";
import { PREREG_H9, CACHE_H9, RESULT_H9, HOLED_KEYS, holedContrast, h9Cell, h9 } from "./frameHoled.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);

console.log("frameHoled-selfcheck -- holed frames against clean ones, at resolutions nobody has read\n");

console.log("1. *** THE DOCUMENT, AND WHAT MAKES ITS CELLS FRESH ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H9), HOLED_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under the frame schema ***",
   d !== null && throws(() => declared(readDoc(PREREG_H9), FRAME_KEYS), /does not declare|not a declared key/), dErr);
if (d === null) { console.log(`\nframeHoled-selfcheck: ${fails} FAILED`); process.exit(1); }
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };
{
    const h7 = declared(readDoc(PREREG_H7), FRAME_KEYS), h8 = declared(readDoc(PREREG_H8), FRAME_KEYS);
    ok("*** the speed is the one v4708's cell answered at, and NOT one v4707 forbade -- both read from those documents ***",
       h8.speeds.includes(d.speed) && !h7.speeds.includes(d.speed) && opts("slabspeed").includes(d.speed),
       `x${d.speed}; forbidden x${h7.speeds.join(", x")}`);
    const pageDefault = opts("ratio")[0];
    ok("*** every declared ratio is a page option and NONE is the page default v4708 harvested at ***",
       d.ratios.every((r) => opts("ratio").includes(r)) && !d.ratios.includes(pageDefault),
       `ratios ${d.ratios.join(", ")}; the page default -- the harvest never set it before v4709 -- is ${pageDefault}`);
    ok("*** minFolds is derived, and the scenes are the page's both ways ***",
       d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()));
    // v4710 -- INVERTED, as v4706 and v4708 inverted theirs: the measurement ran, under THIS document's constants.
    const resOk = fs.existsSync(path.join(ENG, CACHE_H9)) && fs.existsSync(path.join(ENG, RESULT_H9)) &&
        J(JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H9), "utf8")).declared) === J(d);
    ok("*** the measurement exists, produced under THIS document's constants -- v4709's 'no data yet', inverted ***", resOk);
}

console.log("\n2. *** THE CONTRAST ***");
const mkRow = (frame, holes, adv, r) => { const x = [];
    for (let b = 0; b < 2; b++) for (let k = 0; k < N_FEATURES; k++) x.push(k === HOLE_COL ? holes : r() * 9);
    return { frame, x, y: [0, 0], genDb: 30 + adv, cfDb: 30 }; };
{
    const r = seededRng(1);
    const c = holedContrast([mkRow(1, 0, 0.2, r), mkRow(2, 0, 0.4, r), mkRow(3, 1e-6, -1, r), mkRow(4, 0.01, -2, r)], d);
    ok("*** 'holed' is EXACTLY nonzero -- 1e-6 counts -- and the contrast is clean minus holed, positive as hypothesised ***",
       c.nHoled === 2 && c.nClean === 2 && Math.abs(c.contrast - 1.8) < 1e-12, `clean ${c.cleanAdv}, holed ${c.holedAdv}, contrast ${c.contrast}`);
    const thin = holedContrast([mkRow(1, 0, 0, r), mkRow(2, 0, 0, r), mkRow(3, 0.01, -1, r)], d);
    ok("*** fewer than minGroup frames on a side gives NO contrast rather than a one-frame mean ***", thin.contrast === null && thin.nHoled === 1,
       `minGroup ${d.minGroup}`);
}

console.log("\n3. *** H9 ON MADE-UP WORLDS ***");
const world = (kind, seed) => { const r = seededRng(seed), per = {};
    d.scenes.forEach((s, k) => { const rows = [];
        for (let f = 0; f < 39; f++) { const holed = f % 7 === 0 && !(kind === "sparse" && k < 3 && f > 0);
            const base = r() - 0.5, eff = kind === "pos" ? -1 : kind === "rev" ? 1 : kind === "oneRev" ? (s === "ramp" ? 1 : -1) : 0;
            rows.push(mkRow(f, holed ? 0.001 : 0, base * 0.2 + (holed ? eff : 0), r)); }
        per[s] = holedContrast(rows, d); });
    return per; };
const cellsOf = (k, s0) => Object.fromEntries(d.ratios.map((q, i) => [q, world(k, s0 + 10 * i)]));
{
    const pos = h9(cellsOf("pos", 1), d), rev = h9(cellsOf("rev", 2), d), nul = h9(cellsOf("null", 3), d);
    ok("*** holed frames losing in every scene at both ratios SUPPORTS H9 ***", pos.supported, `sign ${pos.cells[d.ratios[0]].test.sign.up}/7`);
    ok("*** holed frames WINNING fails it -- the direction is declared ***", rev.reportable && !rev.supported);
    ok("*** no effect fails it ***", nul.reportable && !nul.supported);
    const one = h9Cell(world("oneRev", 4), d);
    ok("*** one scene reversed fails the exact sign test: 6 of 7 ***", !one.cleared && one.test.sign.up === 6);
    const mixed = h9(Object.fromEntries(d.ratios.map((q, i) => [q, world(i === 0 ? "pos" : "null", 5 + i)])), d);
    ok("*** BOTH ratios must clear ***", !mixed.supported && mixed.cells[d.ratios[0]].cleared);
    const sparse = h9(Object.fromEntries(d.ratios.map((q, i) => [q, world(i === 0 ? "sparse" : "pos", 7 + i)])), d);
    ok("*** three scenes with too few holed frames make that ratio UNREPORTABLE, and H9 is not reported ***",
       !sparse.reportable && !sparse.supported && sparse.cells[d.ratios[0]].excluded.length === 3, sparse.cells[d.ratios[0]].why);
    ok("...a declared ratio with no data is refused by name", throws(() => h9(cellsOf("pos", 9), { ...d, ratios: [...d.ratios, "2"] }), /no data for declared ratio 2$/));
    ok("...and a contradicted minFolds is refused", throws(() => h9Cell(world("pos", 12), { ...d, minFolds: 4 }), /not what alpha/));
}

console.log("\n4. *** C21: THE PAGE HONOURS THE RATIO -- AT x1, A SPEED THIS DOCUMENT DOES NOT DECLARE ***");
{
    const OFF = "1";
    ok("*** the drive speed is not the declared one ***", OFF !== d.speed);
    const cached = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, CACHE_H8))).toString("utf8"))[OFF].zone.slice(0, 3);
    let plain = null, three = null, err = "";
    try { plain = await harvest({ scenes: ["zone"], upto: 4, speed: OFF });
          three = await harvest({ scenes: ["zone"], upto: 4, speed: OFF, settings: { ratio: "3" } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = plain && plain.slice(0, 3).every((r2, i) => r2.frame === cached[i].frame && r2.genDb === cached[i].genDb && r2.cfDb === cached[i].cfDb);
    ok("*** with NO extra setting the harvest reproduces v4708's cached x1 rows exactly -- the settings path changed nothing ***", !!same,
       plain ? `${plain.length} frames; first three identical to the cache` : err);
    const moved = three && plain && three.slice(0, 3).every((r2, i) => r2.frame === plain[i].frame && (r2.genDb !== plain[i].genDb || r2.cfDb !== plain[i].cfDb));
    ok("*** and with ONLY the ratio set to 3, every one of those frames' dB MOVES -- the control is honoured, not silently dropped ***", !!moved,
       three ? "the difference is the ratio's, because the unmodified drive above reproduced the cache bit for bit" : err);
}

console.log(`\nframeHoled-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL -- nothing is harvested at x8 at either ratio.");
process.exit(fails ? 1 : 0);
