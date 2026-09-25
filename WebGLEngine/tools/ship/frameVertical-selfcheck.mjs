#!/usr/bin/env node
// WebGLEngine/tools/ship/frameVertical-selfcheck.mjs -- v4711: H10's document and apparatus, and C22 -- the page's new slab
// direction proven honoured -- at x1, a speed the document does not declare.
//
// The statistic is v4709's and is gated there (tools/ship/frameHoled-selfcheck.mjs); this gate checks that H10 USES it,
// unmodified, and adds only what is new: the document, the one-cell verdict, and the direction control.
// Run: node tools/ship/frameVertical-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { N_FEATURES, FEATURE_NAMES } from "../../render/genGate.mjs";
import { declared, readDoc, minFoldsFor, seededRng } from "./foldStats.mjs";
import { HOLE_COL, CACHE_H8 } from "./frameHoles.mjs";
import { HOLED_KEYS, holedContrast, h9Cell } from "./frameHoled.mjs";
import { PREREG_H10, CACHE_H10, RESULT_H10, VERT_KEYS, h10 } from "./frameVertical.mjs";
import { harvest } from "./genGateTrain.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };
const J = (x) => JSON.stringify(x);

console.log("frameVertical-selfcheck -- holed frames against clean ones, on occlusion geometry nobody has harvested\n");

console.log("1. *** THE DOCUMENT, AND WHY ITS GEOMETRY IS NEW ***");
let d = null, dErr = "";
try { d = declared(readDoc(PREREG_H10), VERT_KEYS); } catch (e) { dErr = String(e.message).slice(0, 160); }
ok("*** the document parses under its own schema, and is refused under H9's ***",
   d !== null && throws(() => declared(readDoc(PREREG_H10), HOLED_KEYS), /does not declare|not a declared key/), dErr);
if (d === null) { console.log(`\nframeVertical-selfcheck: ${fails} FAILED`); process.exit(1); }
const html = fs.readFileSync(path.join(ENG, "fsr.html"), "utf8");
const opts = (id) => { const m = new RegExp(`<select id="${id}">([\\s\\S]*?)<\\/select>`).exec(html);
    return m ? [...m[1].matchAll(/<option value="([\w.]+)">/g)].map((x) => x[1]) : []; };
{
    const dirs = opts("slabdir");
    ok("*** the declared direction is a page option and is NOT the page default every earlier cell was harvested at ***",
       dirs.includes(d.slabdir) && dirs[0] !== d.slabdir, `declared ${d.slabdir}; page default ${dirs[0]}; options ${dirs.join(", ")}`);
    ok("*** the speed is a page option, minFolds is derived, and the scenes are the page's both ways ***",
       opts("slabspeed").includes(d.speed) && d.minFolds === minFoldsFor(d.alpha) && J(d.scenes.slice().sort()) === J(opts("scene").slice().sort()));
    // v4712 -- INVERTED, as every design gate in this arc has been: the measurement ran, under THIS document's constants.
    const resOk = fs.existsSync(path.join(ENG, CACHE_H10)) && fs.existsSync(path.join(ENG, RESULT_H10)) &&
        J(JSON.parse(fs.readFileSync(path.join(ENG, RESULT_H10), "utf8")).declared) === J(d);
    ok("*** the measurement exists, produced under THIS document's constants -- v4711's 'no data yet', inverted ***", resOk);
}

console.log("\n2. *** THE STATISTIC IS v4709's, APPLIED AS ONE CELL ***");
const mkRow = (frame, holes, adv, r) => { const x = [];
    for (let b = 0; b < 2; b++) for (let k = 0; k < N_FEATURES; k++) x.push(k === HOLE_COL ? holes : r() * 9);
    return { frame, x, y: [0, 0], genDb: 30 + adv, cfDb: 30 }; };
const world = (kind, seed) => { const r = seededRng(seed), per = {};
    d.scenes.forEach((s, k) => { const rows = [];
        for (let f = 0; f < 39; f++) { const holed = f % 7 === 0 && !(kind === "sparse" && k < 3 && f > 0);
            const eff = kind === "pos" ? -1 : kind === "oneRev" ? (s === "checker" ? 1 : -1) : 0;
            rows.push(mkRow(f, holed ? 0.001 : 0, (r() - 0.5) * 0.2 + (holed ? eff : 0), r)); }
        per[s] = holedContrast(rows, d); });
    return per; };
{
    const w = world("pos", 1);
    ok("*** H10's cell IS h9Cell's verdict on the same scenes -- nothing re-implemented ***",
       J(h10(w, d).cell) === J(h9Cell(w, d)) && h10(w, d).supported, "the contrast and the test are v4709's, gated in frameHoled-selfcheck.mjs");
    const one = h10(world("oneRev", 2), d);
    ok("*** checker reversed alone fails it -- the price the document names, 6 of 7 ***", !one.supported && one.cell.test.sign.up === 6);
    const sparse = h10(world("sparse", 3), d);
    ok("*** too few holed frames in three scenes is NOT REPORTED, not a null -- the second outcome the document names ***",
       !sparse.reportable && !sparse.supported, sparse.cell.why);
}

console.log("\n3. *** C22: THE PAGE HONOURS THE DIRECTION -- AT x1, WHICH THE DOCUMENT DOES NOT DECLARE ***");
{
    const OFF = "1";
    ok("*** the drive speed is not the declared one ***", OFF !== d.speed);
    const cached = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ENG, CACHE_H8))).toString("utf8"))[OFF].zone.slice(0, 3);
    let plain = null, vert = null, err = "";
    try { plain = await harvest({ scenes: ["zone"], upto: 12, speed: OFF });
          vert = await harvest({ scenes: ["zone"], upto: 12, speed: OFF, settings: { slabdir: d.slabdir } }); } catch (e) { err = String(e.message).slice(0, 160); }
    const same = plain && plain.slice(0, 3).every((r2, i) => r2.frame === cached[i].frame && r2.genDb === cached[i].genDb && r2.cfDb === cached[i].cfDb);
    ok("*** with NO extra setting the harvest reproduces v4708's cached x1 rows -- the default direction changed nothing ***", !!same,
       plain ? "first three frames bit-identical to the cache" : err);
    const moved = vert && plain && vert.slice(0, 3).every((r2, i) => r2.frame === plain[i].frame && (r2.genDb !== plain[i].genDb || r2.cfDb !== plain[i].cfDb));
    ok("*** and with ONLY slabdir set to z, every one of those frames' dB MOVES -- the direction is honoured ***", !!moved,
       vert ? "the unmodified drive reproduced the cache, so the difference is the direction's" : err);
    // *** AND THE SILHOUETTE MOVES THE RIGHT WAY, NOT JUST THE PIXELS. *** The direction reaches three geometry sites. If
    // hitBoth's vertical bounds were missed, the texture and motion vectors would travel vertically while the slab's
    // outline stayed put -- the dB would still move and the row above would pass. The slab is the NEAR cluster of the
    // per-block depth column (two planes, so two clusters); its block centroid must travel along the declared axis.
    const DEPTH = FEATURE_NAMES.indexOf("depth"), BW = 24;
    const centroid = (row) => { const nb = row.y.length, dep = Array.from({ length: nb }, (_, b) => row.x[b * N_FEATURES + DEPTH]);
        const lo = Math.min(...dep), hi = Math.max(...dep), mid = (lo + hi) / 2;
        const near = dep.map((v, b) => [v, b]).filter(([v]) => Math.abs(v - lo) < Math.abs(v - hi)).map(([, b]) => b);
        return near.length ? [near.reduce((a, b) => a + (b % BW), 0) / near.length, near.reduce((a, b) => a + Math.floor(b / BW), 0) / near.length] : [NaN, NaN]; };
    const shift = (rows) => { const a = centroid(rows[0]), b = centroid(rows[rows.length - 1]); return [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])]; };
    const sp = plain ? shift(plain) : [NaN, NaN], sv = vert ? shift(vert) : [NaN, NaN];
    ok("*** the slab's OUTLINE travels along the declared axis: across columns by default, down rows with slabdir = z ***",
       // BETWEEN the arms, not within one: the dolly drifts the view along x in BOTH, so the first draft's "one axis
       // dominates 3 to 1" read the vertical arm's 3 rows against 1 column of the camera's own drift and failed a slab that
       // was moving correctly. The direction's contribution is what one arm has and the other lacks.
       plain && vert && plain[0].y.length === BW * BW && sv[1] - sp[1] > 1 && sp[0] - sv[0] > 0.5,
       `near-cluster centroid shift over ${plain ? plain.length : 0} frames, in blocks (columns, rows): default ${sp.map((v) => v.toFixed(2)).join(", ")}; vertical ${sv.map((v) => v.toFixed(2)).join(", ")}`);
}

console.log(`\nframeVertical-selfcheck: ${fails ? fails + " FAILED" : "ALL GREEN"}`);
console.log("unchecked here: ANY DECLARED CELL -- nothing is harvested at x8 with the slab moving vertically.");
process.exit(fails ? 1 : 0);
