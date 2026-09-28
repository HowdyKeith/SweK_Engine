#!/usr/bin/env node
// WebGLEngine/render/edgeReveal-selfcheck.mjs -- v4650
//
// Run: node render/edgeReveal-selfcheck.mjs
// RUNTIME: 53 ms median of five (53 53 53 54 54). CPU only -- no adapter, no page, and the page's ten
// measured frames are RECORDED rather than re-driven, which is what keeps it at 53 and not 3,358.
//
// *** v4649 MEASURED AN ALTERNATION, COULD NOT EXPLAIN IT, AND SAID SO. THIS IS THE EXPLANATION. ***
//
// fsr.html's object-motion camera reports a genuine disocclusion count that goes 212, 106, 212, 106, 212 while
// the same camera with a static slab reads a flat 106. v4649's closing line named that unexplained rather than
// offering a plausible story, which is the only reason it was still there to be answered.
//
// The law is exact:   genuine(f) = H * (E(f-1) - E(f-2))
//
// H is the occluder's screen height in whole pixels and E(f) the integer column of its trailing edge. A
// disocclusion is one column of newly uncovered background down that edge, so the count is the height times
// the boundaries crossed. The alternation is an INTEGER SAMPLING OF A NON-INTEGER SPEED and not a property of
// the disocclusion test: the edge advances 1.538 px/frame, which lies between 1 and 2.
//
// TWO WRONG ANSWERS WERE WRITTEN BEFORE THE RIGHT ONE, both defended in prose, both measured false -- and
// the SECOND correction was itself a correction of the first:
//   * floor(p) for the edge column, with a paragraph citing temporalLockWgsl's floor. 5 of 11 against the
//     page's own hit(); ceil(p - 0.5) is 11 of 11. That one was simply wrong.
//   * "the SPEED model cannot produce this sequence". Written at length, and FALSE: searching every phase,
//     floor(f*v + 0.237) - floor((f-1)*v + 0.237) reproduces all ten frames including the doubled 212, and
//     such a difference repeats values perfectly happily. It could hardly be otherwise -- the edge position
//     is LINEAR in f, so the two forms are the same function written twice. The first attempt left the phase
//     at zero and blamed the formula.
// Both are kept RUNNABLE below rather than described, which is how the second one was caught: the row
// asserting the speed model failed is the row that failed.
//
// SABOTAGE, seven mutations, ALL SEVEN CAUGHT -- two only after the gate was repaired:
//   X1  edgeColumn back to floor(p)                    FAIL  4 rows
//   X2  edgeColumn uses Math.round                     0-RED at first; now FAIL, the tie row
//   X3  span drops its factor of 2                     FAIL  4 rows
//   X4  reveal counts columns, not pixels              FAIL  2 rows
//   X5  frame 0 reveals a full column                  0-RED at first; now FAIL, the frame-0 row
//   X6  the fractional-height refusal removed          FAIL  the refusal row
//   X7  eyeX ignored, so camera motion is dropped      FAIL  4 rows
//
// *** X2 IS v4648's SHIFT ROW IN A NEW COSTUME. *** The row meant to catch it read
// `Math.round(2.5) !== Math.ceil(2.5 - 0.5)` -- a fact about JavaScript, asserted without ever calling
// edgeColumn. The page's frames never land on an exact tie, so round and ceil agree everywhere the fixture
// looked and the row passed while testing nothing. It drives edgeColumn AT a constructed tie now, with every
// value a power of two so p is exactly 2.5 rather than 2.4999999.
//
// X5 is the plainer kind: every comparison in section 3 starts at index 1, so nothing looked at frame 0 at
// all. A first frame that claimed a reveal is the same defect as a motion vector reporting zero velocity
// before there is any history, which render/motionVectors.mjs refuses by returning null.
"use strict";
import { edgeColumn, revealSequence, revealFromSpeed } from "./edgeReveal.mjs";
import { viewProj } from "./rasterProbe.js";
import { mat4Invert, transform4 } from "./motionVectors.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// fsr.html's constants, restated here because this gate's subject is that page's phenomenon. A drift between
// these and the page is caught by tools/ship/fsrPageObjects-selfcheck.mjs, which reads them from the source.
const D = 192, TANFOV = Math.tan(0.5), NEAR = 0.1, FAR = 100;
const DOLLY = 0.02, SLAB_DX = 0.055, SLAB_X = [-1.2, 1.2], SLAB_Z = [-1.2, 1.2];
const Y_NEAR = -4, Y_FAR = 0, DIST = 4;

// *** THE INDEPENDENT ANSWER: fsr.html's OWN ray-plane intersection, replayed. *** Not a copy of the module
// under test -- a full inverse-matrix ray cast per pixel, which is what the page actually does to decide
// which surface a pixel sees. If these two agreed because they were the same arithmetic the row would be
// worth nothing.
const dollyVP = (f) => viewProj([f * DOLLY, -8, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1], TANFOV, 1, NEAR, FAR);
function hit(inv, u, v, sx) {
    const nx = 2 * u - 1, ny = 1 - 2 * v;
    const a = transform4(inv, nx, ny, -1, 1), b = transform4(inv, nx, ny, 1, 1);
    const ax = a[0] / a[3], ay = a[1] / a[3], az = a[2] / a[3];
    const bx = b[0] / b[3], by = b[1] / b[3], bz = b[2] / b[3];
    const at = (py) => { const t = (py - ay) / (by - ay); return [ax + t * (bx - ax), py, az + t * (bz - az)]; };
    const n = at(Y_NEAR);
    const on = n[0] >= SLAB_X[0] + sx && n[0] <= SLAB_X[1] + sx && n[2] >= SLAB_Z[0] && n[2] <= SLAB_Z[1];
    return on ? n : at(Y_FAR);
}
/** The slab's first and last screen column, and its height, scanned out of the page's own hit(). */
function scanSlab(f) {
    const inv = mat4Invert(dollyVP(f)), sx = f * SLAB_DX;
    let lo = -1, hi = -1, h = 0;
    const midV = (96 + 0.5) / D, midU = (96 + 0.5) / D;
    for (let x = 0; x < D; x++) if (hit(inv, (x + 0.5) / D, midV, sx)[1] === Y_NEAR) { if (lo < 0) lo = x; hi = x; }
    for (let y = 0; y < D; y++) if (hit(inv, midU, (y + 0.5) / D, sx)[1] === Y_NEAR) h++;
    return { lo, hi, h };
}

const FRAMES = 13;
const scan = [];
for (let f = 0; f < FRAMES; f++) scan.push(scanSlab(f));
const H = scan[0].h;

// *** MEASURED ON A REAL ADAPTER AT v4650, frames 2..11 of fsr.html's object-motion camera. *** Recorded
// rather than re-driven: this gate is CPU-only and costs 60 ms, and putting a browser in it to re-read ten
// numbers would buy nothing the page's own device gate does not already hold.
const PAGE_GENUINE = Object.freeze([212, 106, 212, 106, 212, 212, 106, 212, 106, 212]);

console.log("\n1. THE OCCLUDER, from the page's own ray cast");
say("slab", `${H} px tall; trailing edge at column ${scan.map((s) => s.lo).slice(0, 8).join(", ")} ...`);
ok("!! *** the slab is a WHOLE number of pixels tall and it is the 106 the page reports for a STATIC occluder ***",
   H === 106,
   `${H} px. fsr.html's prose calls its dolly disocclusion "a one-pixel sliver down the slab's trailing edge" ` +
   "and reads a flat 106 there; this says what that 106 IS. Derived from the world size it would be 105.4 -- " +
   "2.4 units at 43.932 px per unit -- so the continuous figure is 0.6% out and the buffer's count is not.");
ok("...and its height does not change while it moves, which is what lets one number stand for the whole run",
   scan.every((s) => s.h === H), `heights: ${[...new Set(scan.map((s) => s.h))].join(", ")}`);

console.log("\n2. THE EDGE COLUMN: the module against the page's ray cast");
const mine = [];
for (let f = 0; f < FRAMES; f++) mine.push(edgeColumn({ edgeX: SLAB_X[0] + f * SLAB_DX, eyeX: f * DOLLY, dist: DIST, tanFov: TANFOV, w: D }));
const diff = mine.filter((c, i) => c !== scan[i].lo).length;
ok("!! *** edgeColumn is the page's own hit() at every frame, and the two are not the same arithmetic ***",
   diff === 0,
   `${diff} of ${FRAMES} differ. One is a closed-form projection of a single edge; the other casts a ray ` +
   "through an inverse view-projection per pixel and reports the first column whose CENTRE lands on the slab.");
// THE WRONG CONVENTION, RUN RATHER THAN DESCRIBED.
const floored = [];
for (let f = 0; f < FRAMES; f++) floored.push(Math.floor(((SLAB_X[0] + f * SLAB_DX - f * DOLLY) / (2 * DIST * TANFOV) + 0.5) * D));
const floorHits = floored.filter((c, i) => c === scan[i].lo).length;
ok("!! ...and floor(p) -- what the first draft wrote, with a paragraph defending it -- is WRONG at most frames",
   floorHits < FRAMES && diff === 0,
   `floor(p) agrees at ${floorHits} of ${FRAMES}; ceil(p - 0.5) at ${FRAMES}. The defence cited ` +
   "temporalLockWgsl's floor, which answers a different question: that one picks the texel a uv falls INSIDE, " +
   "this one picks the first column whose centre is inside a region, and x is inside iff x + 0.5 >= p.");
// *** THE ROW BELOW USED TO READ `Math.round(2.5) !== Math.ceil(2.5 - 0.5)`, WHICH IS A FACT ABOUT
// JAVASCRIPT AND NOT ABOUT THIS MODULE. *** A sabotage swapping edgeColumn's ceil for Math.round scored
// ZERO failing rows against it: the page's frames never land on an exact tie, so the two spellings agree
// everywhere the fixture looks and the row passed while testing nothing. Same shape as v4648's shift row.
// This drives edgeColumn AT a tie instead. Every value is a power of two, so p is exactly 2.5 and not
// 2.4999999: span 8 = 2*4*1, and (-1.5/8 + 0.5)*8 = 2.5 with nothing rounded on the way.
const TIE = { edgeX: -1.5, eyeX: 0, dist: 4, tanFov: 1, w: 8 };
const tieP = ((TIE.edgeX - TIE.eyeX) / (2 * TIE.dist * TIE.tanFov) + 0.5) * TIE.w;
say("tie fixture", `p = ${tieP} exactly; edgeColumn -> ${edgeColumn(TIE)}, Math.round(p) -> ${Math.round(tieP)}`);
ok("!! ...and AT AN EXACT TIE edgeColumn takes the lower column, which Math.round does not",
   tieP === 2.5 && edgeColumn(TIE) === 2 && Math.round(tieP) === 3,
   `p = ${tieP}, edgeColumn = ${edgeColumn(TIE)}, round = ${Math.round(tieP)}. A pixel x is inside iff ` +
   "x + 0.5 >= p, so at p = 2.5 the first column whose centre is inside is 2. round gives 3. The two agree " +
   "on every frame the page produces, which is exactly why a row that did not construct a tie could not " +
   "tell them apart -- and ties are the class v4559 measured costing this arc 8.6e-1 of contrast.");

console.log("\n3. THE LAW, against ten frames the page actually produced");
const seq = revealSequence({ edgeAt: (f) => SLAB_X[0] + f * SLAB_DX, eyeAt: (f) => f * DOLLY,
                             dist: DIST, tanFov: TANFOV, w: D, height: H, frames: FRAMES });
const predicted = PAGE_GENUINE.map((_, i) => seq.reveal[i + 1]);
say("predicted", predicted.join(" "));
say("measured ", PAGE_GENUINE.join(" "));
ok("!! *** genuine(f) = H * (E(f-1) - E(f-2)) on ALL TEN frames, including the phase slip ***",
   predicted.every((p, i) => p === PAGE_GENUINE[i]),
   `${predicted.filter((p, i) => p === PAGE_GENUINE[i]).length} of ${PAGE_GENUINE.length}. The count is the ` +
   "occluder's height times the column boundaries its trailing edge crossed, so the alternation is an integer " +
   "sampling of a non-integer speed and not a property of the disocclusion test at all.");
// *** FRAME 0 REVEALS NOTHING, AND NOTHING CHECKED IT. *** A sabotage making frame 0 report a full column
// scored zero failing rows: every comparison above starts at index 1. There is no previous frame for
// anything to be uncovered from, and a first frame that claimed a reveal would be the same defect as a
// motion vector that reports zero velocity before there is any history -- render/motionVectors.mjs refuses
// exactly that, and returns null rather than a plausible zero.
ok("!! ...and frame 0 reveals NOTHING, because there is no previous frame to uncover anything from",
   seq.cols[0] === 0 && seq.reveal[0] === 0,
   `cols[0] = ${seq.cols[0]}, reveal[0] = ${seq.reveal[0]}`);
ok("...and the sequence is not constant, so the row above is not satisfied by a flat prediction",
   new Set(PAGE_GENUINE).size === 2 && PAGE_GENUINE.includes(106) && PAGE_GENUINE.includes(212),
   `values ${[...new Set(PAGE_GENUINE)].join(" and ")} -- exactly H and 2H, which is the claim's whole content`);

console.log("\n4. THE OTHER MODEL, WHICH IS THE SAME MODEL WHEN THE PHASE IS RIGHT");
const v = (SLAB_DX - DOLLY) * D / (2 * DIST * TANFOV);
const zeroPhase = revealFromSpeed({ speed: v, height: H, frames: FRAMES });
const zeroPred = PAGE_GENUINE.map((_, i) => zeroPhase[i + 1]);
say("speed model, phase 0", `${zeroPred.join(" ")}   (v = ${v.toFixed(4)} px/frame)`);
ok("the speed model at PHASE ZERO -- what the first draft used -- does not reproduce the page",
   !zeroPred.every((p, i) => p === PAGE_GENUINE[i]),
   `${zeroPred.filter((p, i) => p === PAGE_GENUINE[i]).length} of ${PAGE_GENUINE.length} frames agree`);
// *** AND THIS IS THE ROW THAT CORRECTED THIS FILE. *** It was first written to assert the speed model
// FAILS at every phase. Searching the phases is what showed it succeeds at one.
let bestRun = 0, bestPhase = -1;
for (let k = 0; k <= 1000; k++) {
    const ph = k / 1000;
    const sp = revealFromSpeed({ speed: v, height: H, frames: FRAMES + 2, phase: ph });
    for (let off = 1; off <= 3; off++) {
        const pred = PAGE_GENUINE.map((_, i) => sp[i + off]);
        let n = 0; while (n < pred.length && pred[n] === PAGE_GENUINE[n]) n++;
        if (n > bestRun) { bestRun = n; bestPhase = ph; }
    }
}
say("best phase", `${bestPhase} reproduces ${bestRun} of ${PAGE_GENUINE.length} frames`);
ok("!! *** ...but at the RIGHT phase it reproduces every frame, so the two models are NOT rivals ***",
   bestRun === PAGE_GENUINE.length,
   `phase ${bestPhase} gives ${bestRun} of ${PAGE_GENUINE.length}. The edge's position is LINEAR in f, so ` +
   "ceil(p0 + f*v - 0.5) and a phased floor difference are the same function written twice. This row was " +
   "first written to assert the opposite -- at length, in this file's header and the module's -- and " +
   "searching the phases is what falsified it. The phase IS the edge's sub-pixel offset at frame 0.");
ok("!! ...so revealSequence earns its place by DERIVING that phase, not by being a different law",
   (() => {
       const sp = revealFromSpeed({ speed: v, height: H, frames: FRAMES, phase: bestPhase });
       const a2 = PAGE_GENUINE.map((_, i) => seq.reveal[i + 1]);
       let off = -1;
       for (let o = 1; o <= 3; o++) if (PAGE_GENUINE.every((g, i) => sp[i + o] === g)) { off = o; break; }
       return off > 0 && a2.every((x, i) => x === PAGE_GENUINE[i]);
   })(),
   "a caller who had to supply the phase would be computing this module's job in order to call it, and a " +
   "caller who guessed zero gets the sequence the row above fails on. That is the whole difference and it " +
   "is smaller than the header used to claim.");
// *** THE GENERALITY, EXERCISED. *** A module justified by a case nobody runs is justified by nothing.
const accel = revealSequence({ edgeAt: (f) => -1.2 + 0.03 * f + 0.004 * f * f, eyeAt: (f) => f * DOLLY,
                               dist: DIST, tanFov: TANFOV, w: D, height: H, frames: 12 });
const steps = [...new Set(accel.cols.slice(1))].sort((x, y) => x - y);
say("accelerating occluder", `steps ${accel.cols.slice(1).join(" ")}`);
ok("!! ...and an ACCELERATING occluder has no single speed for the other form to take at all",
   steps.length > 2,
   `step sizes ${steps.join(", ")} -- ${steps.length} distinct values. A constant-speed floor difference ` +
   "takes at most two, floor(v) and ceil(v), whatever its phase. This is the case that makes edgeAt and " +
   "eyeAt functions rather than numbers, and it is driven here rather than asserted in a header.");

console.log("\n5. WHAT IT REFUSES");
ok("a non-positive distance is refused rather than projecting through the eye",
   (() => { try { edgeColumn({ edgeX: 0, eyeX: 0, dist: 0, tanFov: 1, w: 8 }); return false; } catch (e) { return /dist must be positive/.test(e.message); } })(),
   "an edge at or behind the eye has no screen column, and a division by zero would report one anyway");
ok("...and a fractional height is refused, because it is a pixel COUNT and not a length",
   (() => { try { revealSequence({ edgeAt: () => 0, eyeAt: () => 0, dist: 1, tanFov: 1, w: 8, height: 105.4, frames: 4 }); return false; } catch (e) { return /whole number of pixels/.test(e.message); } })(),
   "105.4 is exactly the figure the world size gives and exactly the one the buffer does not hold -- section 1 " +
   "is the measurement, and accepting it here would let that 0.6% back in silently");
ok("...and a single frame is refused, since one frame has no previous frame to reveal anything from",
   (() => { try { revealSequence({ edgeAt: () => 0, eyeAt: () => 0, dist: 1, tanFov: 1, w: 8, height: 4, frames: 1 }); return false; } catch (e) { return /at least 2/.test(e.message); } })());

console.log(fails ? `\nedgeReveal-selfcheck: ${fails} FAILED` : "\nedgeReveal-selfcheck: ALL GREEN");
console.log("unchecked here: whether the law holds for an occluder moving VERTICALLY or diagonally -- the " +
            "page's slab moves along x and the reveal is a column, and nothing here says what the unit " +
            "becomes when the edge is not axis-aligned; ROTATION, which changes the occluder's screen height " +
            "frame to frame and so breaks the single H this whole law is written around; the LEADING edge, " +
            "which occludes rather than reveals and is not counted by the disocclusion test at all; and the " +
            "page's numbers themselves, which are RECORDED here from a v4650 adapter run rather than " +
            "re-driven -- tools/ship/fsrPageObjects-selfcheck.mjs is what holds the page to still producing " +
            "them, and if it ever stops, this gate would go on agreeing with a memory.");
process.exit(fails ? 1 : 0);
