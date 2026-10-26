#!/usr/bin/env node
// WebGLEngine/render/denoiseUpscaleGPU-selfcheck.mjs -- round 31 (backlog denoise-halfres-rig-timing): round 30's
// emitter-aware chain on a device, held to its CPU references before the rig times it.
//
//   1. the CPU reference of the bounded fill (render/denoiseUpscale.mjs's fillEmittersBounded) against fillEmitters
//   2. the kernels: each validates against render/wgslSpec.mjs, and the constants they carry are the CPU's
//   3. ON THE DEVICE (Chromium's WebGPU through tools/ship/webgpuHarness.mjs -- SwiftShader here, the GPU on the rig):
//      coverage against emitterRadiance on three of round 30's R scenes, the bounded fill against fillEmittersBounded, and
//      the whole chain on one encoder against emitterAwareUpscale(..., "easu", full)
//
// The tolerances are f32 against f64 and were fixed from this file's first run on SwiftShader, which is said beside each.
//
// SABOTAGED (round 31), each by the byte-safe runner in render/denoiser-arc-handoff.md, restored, sha-256 identical. The kernels
// were then in a module of their own, render/denoiseUpscaleWgsl.mjs, since folded into the runner unchanged:
//   G1  a ring fills a pixel only with two known neighbours            2 RED (the device fill; the chain)
//   G2  the composite without (1 - cov)                                1 RED (the chain)
//   G3  the coverage kernel takes the farther root                     1 RED (coverage). 0 RED at first: no sphere overlapped
//       another, and then the far roots order as the near ones do -- the fourth scene's overlapping sphere is the fix
//   G4  the transfer records no brightest t                            1 RED (the chain)
//   G5  a pixel no ring reached keeps its value on the device          1 RED (the device fill, short of rings)
//   G6  the CPU bound leaves those pixels at their value               3 RED (the two CPU rows it states; the device fill)
//   G7  the runner does not swap the ring buffers                      2 RED (the device fill; the chain)
//   G8  EASU reads the frame before the fill                           1 RED (the chain). Its first form -- EASU bound to the
//       input buffer -- was no sabotage at all: 24 rings is an even number of swaps, so the filled frame IS that buffer
//   G9  the camera uniform's aspect inverted                           1 RED (the layout row; every frame here is square)
//   and section 4's caller, by the same runner:
//   T1  timeHalfChain's sum leaves the fill out                        1 RED (the sum row)
//   T2  the fill on the device's clock past 30 passes                  1 RED (the sum row: the fill must be the wall's)
//   T3  the page's table without the fill's row                        1 RED (the page row: 7 rows, not 8)
//   T4  the full-size page timed from the half-size row                1 RED (the sum row). 0 RED at first: nothing held which
//       ladder row each network time came from; the row now names both
//   and section 6's accumulation on the device (round 33), by the same runner:
//   X1  the accumulation kernel ignores its clamp                      3 RED (given the CPU's hits; the composite; with its own hits)
//   X2  the history lengthens by two a frame                           3 RED (the same three)
//   X3  the first hits' normal left unnormalised                       2 RED (the hits row; the accumulation with its own hits)
//   X4  the shift kernel the wrong way                                 3 RED (the three accumulation rows)
//   X5  frame 0 reprojected onto itself, not onto sky                  0 RED, AND IT IS AN EQUIVALENT MUTANT: the history starts at
//       zero with n = 0, so whatever frame 0 finds is clamped into the current range and blended at n = 0 + 1 = 1 -- the current
//       frame either way. The buffer of sky stays, so the rule is stated rather than relied on.
//   X6  the temporal sum without the composite                         1 RED (the timing sum row)
//   X7  the position tolerance at 30 footprints                        2 RED (the constants row; the uniform's layout row, which
//       reads the tolerance at its offset). 0 RED at first: on smooth spheres
//       a looser tolerance turns no tap valid; the row holding the kernel's constants to round 4's is the fix
//   and section 5's verdict (section 94), by the same runner:
//   V1  the rule asks one GPU, not both                                1 RED (the rule row)
//   V2  a run counts at any commit                                     1 RED (the rule row: a stale run must leave it owed)
//   V3  H holding at 0.9 x                                             1 RED (the rule row)
//   V4  C2 dropped -- any ring count                                   1 RED (the rule row). 0 RED at first: no fixture's fill
//       used all 96 rings; one does now
//   V5  the Intel's predicted range widened to 1.3                     1 RED (the predictions row)
//   and section 7's verdict (section 98), by the same runner:
//   W1  the rule asks the Intel alone                                  1 RED (the rule row)
//   W2  C1 dropped -- a run counts with a red gate                     1 RED (the rule row: the 1080 would hold)
//   W3  C3 dropped for the history's passes                            1 RED (the rule row: a pass on the wall clock must leave it owed)
//   W4  H holding at 0.9 x                                             1 RED (the rule row)
//   W5  the Intel's predicted history cost widened to 90 ms            1 RED (the predictions row)
//   W6  H read off the chain without its history                       1 RED (the rule row)
//   and section 3's list fill (round 34), by the same runner:
//   Y1  a ring reads neighbours filled in the same ring (<= for <)     3 RED (against the CPU; against round 31's fill; the chain)
//   Y2  the args kernel rounds the list's workgroups down              4 RED (the constants row; the same three)
//   Y3  the rings counted from 0, so the known pixels are no ring below 3 RED (the same three)
//   Y4  the left pass counts a pixel no ring reached but keeps its value 2 RED (against the CPU; against round 31's fill)
//   Y5  timeHalfChain's halfList sums the ring fill                    1 RED (section 4's list sum row)
//   Y6  the page's table without the list fill's row                   1 RED (the page row: 13 rows, not 14)
//   Y7  fill() runs the rings whatever it is asked                     1 RED (the row against round 31's fill). 0 RED at first: the
//       two fills agree float for float, so nothing could tell which ran; the list's length, read back as `listed`, is the fix
//   and section 8's verdict (section 100), by the same runner:
//   Z1  the rule asks the Intel alone                                  1 RED (the rule row)
//   Z2  C1 dropped -- a run counts with a red gate                     1 RED (the rule row). 0 RED at first: both Intel runs were
//       green and no fixture had a red gate; one does now
//   Z3  a run counts at any commit                                     1 RED (the rule row)
//   Z4  H holding with the list fill up to 5 % slower                  1 RED (the rule row)
//   Z5  section 98's owed run taken as the LAST 1080 run, not the first 1 RED (the owed-run row)
//   Z6  section 98's verdict read off the green extra-a run            1 RED (the owed-run row)
//   Z7  the Intel's predicted list fill narrowed to 15-20 ms           1 RED (the predictions row)
//   and section 9's verdict (section 102), by the same runner:
//   A1  the rule asks the Intel alone                                  1 RED (the rule row)
//   A2  the 1080's runs' commit, bc6fbed2, left out of section 99's    2 RED (the read-back row; the rule row)
//   A3  H holding with the list fill up to 5 % slower                  1 RED (the rule row)
//   A4  a solo run's trace swapped for r34-a's, which is not whole     1 RED (round 35's row)
//   A5  the 1080's missed prediction read against 30 ms, not 6         1 RED (the predictions row)
//   and round 36's default (section 103), by the same runner:
//   B1  fill()'s default back to round 31's ring fill                  1 RED (the default fill row)
//   B2  chain()'s default back to round 31's ring fill                 1 RED (the default chain row)
//   B3  timeHalfChain's half sums the ring fill                        1 RED (section 4's default sum row)
//   B4  timeHalfChain's halfRing sums the list fill                    2 RED (section 4's ring sum row; the history row on it)
//   B5  the page's table without the ring fill's chain row             1 RED (the page row: 14 rows, not 15)
//   B6  section 93's line made from half, not halfRing                 1 RED (the rig lines row)
//   and round 37's tile fill (section 104), by the same runner:
//   C1  a ring reading neighbours filled in the same ring: one phase,  4 RED (against the CPU; against the list fill; the chain;
//       writing as it goes, with <= for <                                  the pilot's tile check). 0 RED at first, as <= alone:
//       under two phases no cell carries this ring's number while the means are taken, so <= changed nothing. Its control --
//       one phase with < -- is 0 RED, as it should be: that is the list fill's in-place rule, and the answer is the same
//   C2  a halo of 7 with 8 rings a pass                                3 RED (the constants row; against the CPU; the list fill)
//   C3  the cells outside the frame marked UNKNOWN, not OUT            6 RED (the constants row; the CPU; the list fill; the chain;
//                                                                         two pilot rows)
//   C4  the interior fills not counted                                 4 RED (the CPU; the list fill; the chain; the pilot's tile row)
//   C5  the tile option running the list fill                          3 RED (the list fill row, by tilePasses; the chain; the pilot)
//   C6  timeHalfChain's halfTile sums fillList                         1 RED (section 4's tile sum row)
//   C7  the page's table without the tile fill's chain row             1 RED (the page row: 17 rows, not 18)
//   and section 10's verdict (section 105), by the same runner:
//   D1  the rule asks the 1080 alone -- the Intel's no-slower dropped   1 RED (the rule row: the tile fill would become the default)
//   D2  a run counts at any commit                                     1 RED (the rule row's fixture: a run at 468766f9 must leave it owed)
//   D3  C2 dropped -- a run counts with a pixel left                   1 RED (the rule row's fixture)
//   D4  H37 at 1.0 x, not 0.9 x                                        1 RED (the rule row's fixture: 0.95 x is no hold)
//   D5  the 1080's predicted tile fill widened to 2-20 ms              1 RED (the predictions row)
//   and round 38's listed tile fill (section 106), by the same runner:
//   E1  the init pass not copying the image into the second buffer     3 RED (against the CPU; the list and tile fills; the chain --
//                                                                         an unlisted tile is then 0 wherever an odd pass count ends)
//   E2  a tile listed by its column alone                              3 RED (the same three)
//   E3  the args kernel dispatching four times the list (pre-registered 3 RED (the kernel row, by its text; the fills' row and the
//       as every tile; the args kernel is not given the frame's size)     chain's, by the fills tile 0's extra workgroups count again)
//   E4  the listed option running the tile fill                        3 RED (the fills' row, by tilesListed; the chain; the pilot)
//   E5  timeHalfChain's halfLTile sums fillTile                        1 RED (section 4's listed tile sum row)
//   E6  the page's table without the listed tile fill's chain row      1 RED (the page row: 20 rows, not 21)
//   and round 39's bounded coverage (section 107), by the same runner:
//   F1  the slack and the arc factor dropped (asin alone)              3 RED (the kernel row; the device row, rim pixels lost; the pilot)
//   F2  the bound tested against every sphere, not the emitters        3 RED (the kernel row; the device row, the floor traced; the pilot)
//   F3  a skipped pixel's coverage written 1, not 0                    3 RED (the kernel row; the device row; the pilot)
//   F4  bound: true running round 31's kernel, its counter unbound     2 RED (the device row, by traced; the pilot). As first written,
//       (pre-registered as round 31's kernel alone)                       with the counter still bound, the device refused the binding
//                                                                         and the gate died before those rows: red, but for the wrong reason
//   F5  timeHalfChain's halfBound sums covFull                         1 RED (section 4's bounded sum row)
//   F6  the page's table without the bounded chain's row               1 RED (the page row: 24 rows, not 25)
//   and round 42's split of the rest (section 110), by the same runner:
//   I1  TO_T_FREE_WGSL keeping its atomic                              2 RED (the kernel row; the page row -- the diagnostic, given no tMax,
//                                                                         no longer builds)
//   I2  restEasu timing the composite                                  1 RED (the split row, by the kernels each step dispatched). It could
//                                                                         not have gone red before the steps recorded what they dispatched:
//                                                                         a time does not say which kernel made it
//   I3  restToT run as the whole rest frame                            1 RED (the split row, by the same record)
//   and section 11's verdicts (section 111), by the same runner:
//   J1  H38 at 0.5 x, not 0.9 x                                        1 RED (the H38 row: 0.55-0.84 x is no hold at 0.5)
//   J2  the 1920 x 1080 traced count read off the half size           2 RED (H39 owed again; the traced-count row)
//   J3  EASU read off the composite's figure                           2 RED (the reading row: spread, not EASU; the predictions row)
//   J6  the verdict read off round 37's reports                        7 RED (every row: no section 106-110 line, and not at ce1cca35)
//   and round 43's default (section 112), by the same runner:
//   K1  fill()'s default back to the list fill                         1 RED (round 43's fill-default row)
//   K2  chain()'s default back to the list fill                        1 RED (round 43's chain-default row)
//   K3  { list: true } running the listed tile fill                    5 RED (the list fill's own rows and the reference row)
//   K4  half summing fillList                                          1 RED (section 4's default sum row)
//   K5  halfList summing fillLTile                                     1 RED (section 4's list fill sum row)
//   K6  the page without the list fill's chain row                     1 RED (the page's 26 rows)
//   and round 44's default (section 113), by the same runner:
//   L1  coverage()'s default back to round 31's                        1 RED (round 44's coverage-default row)
//   L2  { bound: false } running the bounded kernel                    as first written it left "traced" unbound, so the device threw
//                                                                         and no row judged it; redone with the binding whole: 2 RED
//                                                                         (round 39's row and round 44's: round 31's pass counts nothing)
//   L3  full summing covFull                                           1 RED (section 4's default sum row)
//   L4  half summing covHalf                                           1 RED (the same row)
//   L5  fullUnbound summing covFullB                                   1 RED (section 4's round 31 row)
//   L6  the page without round 31's mask's page row                    1 RED (the page's 26 rows)
//   L7  section 93's line made from full                               1 RED (the lines row: section 93's page is round 31's mask)
//   and round 46's quads (section 115), by the same runner:
//   N1  the quad's base texel at q, not q - 1                          2 RED (the text row; the bit-for-bit row)
//   N2  an output's sub-texel offset from the quad's first output      2 RED (the same two)
//   N3  a quad's fourth output skipped                                 1 RED (the bit-for-bit row)
//   N4  the fused pass with its neighbour's coverage                   2 RED (the text row's composite line; the bit-for-bit row). As
//                                                                         first written N4 dropped the clamp to tMax, which cannot go red:
//                                                                         EASU's dering keeps every output within its nearest texels
//   N5  restEasuComp timing EASU_QUAD_WGSL                             1 RED (the step row: it dispatches easuC alone)
//   N6  a ratio of 3 accepted                                          2 RED (the refusal rows, on the CPU and on the device)
//   and round 48's tiled accumulation (section 117), by the same runner:
//   P1  the tile's columns loaded one to the right                     1 RED (the bit-for-bit row)
//   P2  the clamp reading the tile one column left                     1 RED (the same)
//   P3  the barrier removed                                            2 RED (the text row; the bit-for-bit row)
//   P4  accumulate({ tile: true }) running the plain kernel            0 RED as first written: plain against plain is bit for bit. So
//                                                                         accumulate returns the kernel it dispatched and the row asks
//                                                                         for it; redone, 1 RED
//   P5  the accumT step timing the plain kernel                        1 RED (the step row: accumT records its kernel, as rest's do)
//   and round 54's default rest (section 125), by the same runner:
//   X1  chain()'s default back to the three passes                     1 RED (round 54's default row: it says "easu")
//   X2  the result's rest always saying "fused"                        2 RED (the default row: the reference says "fused"; the ratio-3 row)
//   X3  the fallback dropped, a ratio of 3 asked nothing refused       1 RED (the ratio-3 row)
//   X4  half summing rest                                              1 RED (section 4's default sum row)
//   X5  restF timing the composite after the fused pass                1 RED (round 54's step row, by the kernels it dispatched)
//   X6  the page without the reference's chain row                     1 RED (the page's 29 rows)
//   and round 55's default accumulation (section 126), by the same runner:
//   Q1  accumulate()'s default back to the plain pass                  1 RED (rounds 48 and 55's row, by the kernels each call ran)
//   Q2  { tile: false } running the tiled kernel                       1 RED (the same row)
//   Q3  temporal summing accum                                         2 RED (section 4's default sum row; round 55's reference row)
//   Q4  temporalUntiled summing accumT                                 1 RED (round 55's reference row)
//   Q5  the page without the reference's chain row                     1 RED (the page's 31 rows)
//   Q6  the section 103 line without the accumulation                  1 RED (the lines row)
"use strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { EASU_WGSL } from "../fx/fsr/fsrKernels.js";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInEngineOrigin } from "../tools/ship/webgpuHarness.mjs";
import { validateWgsl } from "./wgslSpec.mjs";
import { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, FILL_LIST_WGSL, FILL_ARGS_WGSL, FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL, FILL_UNKNOWN, FILL_LIST_WG, FILL_TILEINIT_WGSL, FILL_TILE_WGSL, FILL_TILELEFT_WGSL, FILL_TILE_RINGS, FILL_TILE_INNER, FILL_TILE_SIDE, FILL_OUT, FILL_LTINIT_WGSL, FILL_LTARGS_WGSL, FILL_LTILE_WGSL, COVERAGE_BOUND_WGSL, COVERAGE_BOUND_SLACK, COVERAGE_BOUND_ARC, coverageMayHit, TO_T_WGSL, TO_T_FREE_WGSL, COMPOSITE_WGSL, EASU_QUAD_WGSL, EASU_COMP_WGSL, EASU_PIECES, easuQuadRefusal, COVERAGE_GRID_WGSL, SPHERE_STRIDE, packSpheres, cameraUniform, DenoiseUpscaleGPU, TEMPORAL_CONSTANTS, GEO_STRIDE, FIRSTHITS_WGSL, SHIFT_WGSL, ACCUM_WGSL, ACCUM_TILE_WGSL, ACCUM_TILE_EDITS, accumTileWgsl, FINAL_WGSL, accumUniform, packGeometry } from "./denoiseUpscaleGPU.mjs";
import { fillEmitters, fillEmittersBounded, emitterAwareUpscale, GAMMA } from "./denoiseUpscale.mjs";
import { emitterRadiance, COVERAGE_GRID } from "./denoiseMask.mjs";
import { makeScene } from "./denoiseScenes.mjs";
import { gateReport } from "../tools/ship/gateReport.mjs";
const REPORT = gateReport("render/denoiseUpscaleGPU-selfcheck.mjs");

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (s) => console.log(`  ----  ${s}`);

let sd = 31;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/** A w x h rgb frame of smooth light with grain, and a coverage of round discs (radius in pixels) -- the fill's shapes. */
function synth(w, h, discs) {
    const img = new Float64Array(w * h * 3), cov = new Float64Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = y * w + x;
        for (let c = 0; c < 3; c++) img[p * 3 + c] = 0.2 + 0.6 * (x / w) * (c + 1) / 3 + 0.3 * (y / h) + 0.05 * rnd();
        for (const [cx, cy, r] of discs) {
            const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
            if (d < r) { cov[p] = Math.min(1, Math.max(cov[p], r - d)); for (let c = 0; c < 3; c++) img[p * 3 + c] = 20 + c; }
        }
    }
    return { img, cov };
}
const maxRel = (a, b, floor = 1e-3) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / (Math.abs(b[i]) + floor)); return m; };

console.log("denoiseUpscaleGPU-selfcheck -- round 30's emitter-aware chain on a device, against its CPU references\n");

console.log("1. THE BOUNDED FILL'S CPU REFERENCE");
const F1 = synth(24, 20, [[6, 6, 3.2], [17, 13, 5.5], [23, 1, 2]]);
{
    const full = fillEmitters(F1.img, F1.cov, 24, 20), b = fillEmittersBounded(F1.img, F1.cov, 24, 20, 16);
    ok("!! with rings to spare, fillEmittersBounded is fillEmitters value for value, and leaves nothing",
        b.left === 0 && b.rings > 2 && b.rings < 16 && b.y.every((v, i) => Object.is(v, full[i])), `${b.rings} rings, ${b.left} left`);
    const s = fillEmittersBounded(F1.img, F1.cov, 24, 20, 2);
    const unknown = F1.cov.reduce((k, c) => k + (c > 0 ? 1 : 0), 0);
    ok("  ...and short of rings it stops there: 2 rings, the rest left at 0 -- never an emitter's radiance",
        s.rings === 2 && s.left > 0 && s.left < unknown && [...Array(24 * 20).keys()].every((p) => F1.cov[p] === 0 || s.y[p * 3] < 20),
        `${s.left} of ${unknown} emitter pixels left`);
    const all = fillEmittersBounded(new Float64Array(12).fill(5), new Float64Array(4).fill(1), 2, 2, 4);
    ok("  ...a frame that is all emitter leaves every pixel, at 0, and refuses no call", all.rings === 0 && all.left === 4 && all.y.every((v) => v === 0));
    let threw = 0;
    for (const m of [-1, 1.5, NaN]) try { fillEmittersBounded(F1.img, F1.cov, 24, 20, m); } catch { threw++; }
    ok("  ...and a ring count that is not a whole number is refused", threw === 3);
}

console.log("\n2. THE KERNELS");
{
    const ks = { COVERAGE_WGSL, FILL_RING_WGSL, FILL_LEFT_WGSL, TO_T_WGSL, COMPOSITE_WGSL, FIRSTHITS_WGSL, SHIFT_WGSL, ACCUM_WGSL, FINAL_WGSL, FILL_LIST_WGSL, FILL_ARGS_WGSL, FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL, FILL_TILEINIT_WGSL, FILL_TILE_WGSL, FILL_TILELEFT_WGSL, FILL_LTINIT_WGSL, FILL_LTARGS_WGSL, FILL_LTILE_WGSL, COVERAGE_BOUND_WGSL, TO_T_FREE_WGSL, EASU_QUAD_WGSL, EASU_COMP_WGSL, ACCUM_TILE_WGSL };
    const bad = Object.entries(ks).map(([k, s]) => [k, validateWgsl(s)]).filter(([, p]) => p.length);
    ok("every kernel validates against the spec scanner", !bad.length, bad.map(([k, p]) => `${k}: ${p.join("; ")}`).join(" | "));
    ok("  the constants the kernels carry are the CPU's: the coverage grid, the transfer's gamma, its top below the pole",
        COVERAGE_GRID_WGSL === COVERAGE_GRID && GAMMA === 2.2 && /pow\(v \/ \(1\.0 \+ v\), 1\.0 \/ 2\.2\)/.test(TO_T_WGSL) && /pow\(tt, 2\.2\)/.test(COMPOSITE_WGSL) &&
        /1\.0 - 5\.9604645e-8/.test(COMPOSITE_WGSL) && Math.abs(5.9604645e-8 - 2 ** -24) < 1e-14 && /> 1e-6/.test(COVERAGE_WGSL),
        `grid ${COVERAGE_GRID_WGSL} against ${COVERAGE_GRID}; gamma ${GAMMA}`);
    const S = makeScene("R", 44001), sp = packSpheres(S.scene), em = S.scene.findIndex((s) => s.emit);
    ok("  a scene packs as SPHERE_STRIDE floats a sphere, its emitter flagged and its emission spread to rgb",
        SPHERE_STRIDE === 8 && sp.length === S.scene.length * 8 && sp[em * 8 + 7] === 1 && sp[7] === 0 && sp[em * 8 + 4] === Math.fround(typeof S.scene[em].emit === "number" ? S.scene[em].emit : S.scene[em].emit[0]));
    // round 34: the list fill's marker is no ring a fill can reach, and its kernels carry it and the workgroup the runner sizes by
    ok("  round 34: the list fill's UNKNOWN ring is u32's top, written into the list and both list kernels, and its rings and left pass run FILL_LIST_WG to a workgroup, as the args kernel counts them",
        FILL_UNKNOWN === 0xffffffff && FILL_LIST_WG === 64 && [FILL_LIST_WGSL, FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL].every((k) => k.includes(`${FILL_UNKNOWN}u`)) &&
        [FILL_LISTRING_WGSL, FILL_LISTLEFT_WGSL].every((k) => k.includes(`@workgroup_size(${FILL_LIST_WG},1,1)`)) && FILL_ARGS_WGSL.includes(`/ ${FILL_LIST_WG}u`) && FILL_ARGS_WGSL.includes(`+ ${FILL_LIST_WG - 1}u`));
    // round 37: the tile is its interior and a halo of as many pixels as rings a pass, its four arrays within WebGPU's default
    // 16 KB of workgroup memory, one workgroup thread to each interior pixel and a whole number of tile cells to each thread
    const wgBytes = 4 * 4 * FILL_TILE_SIDE * FILL_TILE_SIDE;
    ok("  round 37: the tile fill's tile is its interior and a halo of FILL_TILE_RINGS on every side (32 = 16 + 2 x 8), 16 KB of workgroup memory, the halo and the rings a pass the kernel's, OUT and UNKNOWN apart",
        FILL_TILE_RINGS === 8 && FILL_TILE_INNER === 16 && FILL_TILE_SIDE === FILL_TILE_INNER + 2 * FILL_TILE_RINGS && wgBytes <= 16384 &&
        (FILL_TILE_SIDE * FILL_TILE_SIDE) % (FILL_TILE_INNER * FILL_TILE_INNER) === 0 && FILL_TILE_WGSL.includes(`const HALO = ${FILL_TILE_RINGS}i;`) &&
        FILL_TILE_WGSL.includes(`@workgroup_size(${FILL_TILE_INNER},${FILL_TILE_INNER},1)`) && (FILL_TILE_WGSL.match(/workgroupBarrier\(\)/g) || []).length === 3 &&
        FILL_OUT !== FILL_UNKNOWN && FILL_OUT > 0xffff && FILL_TILE_WGSL.includes(`${FILL_OUT}u`) && FILL_TILEINIT_WGSL.includes(`${FILL_UNKNOWN}u`) && FILL_TILELEFT_WGSL.includes(`${FILL_UNKNOWN}u`),
        `tile ${FILL_TILE_SIDE} x ${FILL_TILE_SIDE}, ${wgBytes} bytes of workgroup memory`);
    // round 38: the listed tile kernel is the tile kernel's text with its tile read from the list -- every other line the same --
    // and round 37's text as it was (its line count and its own origin), so a change to one is not hidden in the other
    const tl = FILL_TILE_WGSL.split("\n"), ll = FILL_LTILE_WGSL.split("\n"), only = ll.filter((l) => !tl.includes(l)), gone = tl.filter((l) => !ll.includes(l));
    ok("  round 38: the listed tile kernel is round 37's tile kernel line for line but for the list's binding and the tile read from it; round 37's own kernel keeps its origin from the workgroup id",
        only.length === 7 && only.some((l) => /@binding\(7\)/.test(l) && /read> tiles:array<u32>;$/.test(l)) && only.some((l) => /let t = tiles\[wg\.x\];/.test(l)) &&
        gone.length === 2 && gone.every((l) => /let o[xy] = i32\(wg\.[xy] \* INNER\) - HALO;/.test(l)) && tl.length === 90 &&
        FILL_LTINIT_WGSL.includes(`${FILL_UNKNOWN}u`) && FILL_LTINIT_WGSL.includes(`/ ${FILL_TILE_INNER}u`) && /args\[0\] = tcnt\[0\];/.test(FILL_LTARGS_WGSL),
        `${only.length} line(s) only in the listed kernel, ${gone.length} only in round 37's; round 37's kernel ${tl.length} lines`);
    // round 39: the bounded coverage kernel is round 31's line for line with the bound added before the rays -- every line of round
    // 31's kernel still in it, in order -- and it carries the bound's slack and arc factor
    const cl = COVERAGE_WGSL.split("\n"), bl = COVERAGE_BOUND_WGSL.split("\n");
    let at = 0; const inOrder = cl.every((l) => { const i = bl.indexOf(l, at); if (i < 0) return false; at = i + 1; return true; });
    ok("  round 39: the bounded coverage kernel is round 31's coverage kernel with the bound added -- every line of round 31's, in order -- carrying COVERAGE_BOUND_ARC (1.6) and COVERAGE_BOUND_SLACK (2e-3), and its skip writing 0",
        inOrder && bl.length - cl.length === 20 && COVERAGE_BOUND_ARC === 1.6 && COVERAGE_BOUND_SLACK === 2e-3 && COVERAGE_BOUND_WGSL.includes(`* ${COVERAGE_BOUND_ARC};`) &&
        COVERAGE_BOUND_WGSL.includes(`+ pxHalf + ${COVERAGE_BOUND_SLACK})`) && /if \(!may\) \{ cov\[p0\] = 0\.0; emis\[p0 \* 3u\] = 0\.0;/.test(COVERAGE_BOUND_WGSL) && /sph\[b \+ 7u\] > 0\.5\) \{\n\s+let oc/.test(COVERAGE_BOUND_WGSL),
        `${bl.length - cl.length} line(s) added to round 31's ${cl.length}`);
    // round 42 (section 110): the transfer's diagnostic is the transfer less exactly its one atomicMax line -- the only line that touches tMax
    const tl0 = TO_T_WGSL.split("\n"), tf0 = TO_T_FREE_WGSL.split("\n"), gone42 = tl0.filter((l) => !tf0.includes(l));
    ok("  round 42: TO_T_FREE_WGSL, a timing diagnostic, is TO_T_WGSL less exactly its one atomicMax line, and nothing else",
        tl0.length - tf0.length === 1 && gone42.length === 1 && /^\s*atomicMax\(&tMax\[0\], bitcast<u32>\(m\)\);$/.test(gone42[0]) && tf0.every((l) => tl0.includes(l)) && !/atomicMax/.test(TO_T_FREE_WGSL),
        gone42.join(" | ").trim());
    // round 46 (section 115): the quad kernels are EASU_WGSL's own text, sliced -- its head (uniform, bindings, four functions), its
    // 12 loads, and its per-pixel statements from the edge analysis through pix -- and COMPOSITE_WGSL's fromT and line; EASU_WGSL
    // itself is frozen by sha256, taken at fx/fsr/fsrKernels.js's last commit (8325eaec) before this round
    const sha = (t) => crypto.createHash("sha256").update(t).digest("hex"), has = (k, t) => k.includes(t);
    const pieces = [EASU_PIECES.head, EASU_PIECES.loads, EASU_PIECES.body], cline = "dst[p * 3u + ch] = emis[p * 3u + ch] + (1.0 - cov[p]) * x;";
    ok("  round 46: EASU_QUAD_WGSL and EASU_COMP_WGSL carry EASU_WGSL's head, loads and per-pixel statements byte for byte, the fused one COMPOSITE_WGSL's fromT and its line, and EASU_WGSL is unchanged (sha256)",
        sha(EASU_WGSL) === "610abfb492a5bd8f45bd9095b91078b52b711bce5ec89e6d2de97f8dd1cec49b" && pieces.every((t) => t.length > 100 && has(EASU_WGSL, t) && has(EASU_QUAD_WGSL, t) && has(EASU_COMP_WGSL, t)) &&
        /let pix = min\(mx, max\(mn, t\.c \/ t\.w\)\);\n$/.test(EASU_PIECES.body) && has(EASU_PIECES.body, "a = easuSet(a, (1.0 - ppx) * (1.0 - ppy), lB, lE, lF, lG, lJ);") &&
        has(COMPOSITE_WGSL, EASU_PIECES.fromT) && has(EASU_COMP_WGSL, EASU_PIECES.fromT) && has(COMPOSITE_WGSL, cline) && has(EASU_COMP_WGSL, cline) && !has(EASU_QUAD_WGSL, "fromT") &&
        has(EASU_QUAD_WGSL, "let fx = i32(q.x) - 1;") && has(EASU_QUAD_WGSL, "var ppx = (f32(ox) + 0.5) * f32(u.rw) / f32(u.dw) - 0.5;"),
        `head ${EASU_PIECES.head.length} chars, loads ${EASU_PIECES.loads.length}, body ${EASU_PIECES.body.length}; EASU_WGSL ${sha(EASU_WGSL).slice(0, 12)}`);
    // round 48 (section 117): the tiled accumulation is ACCUM_WGSL with exactly its three edits -- the tile, its load before any
    // return, and the clamp's one load line -- every other line the accumulation's own, and the tile read only by the clamp
    const al = ACCUM_WGSL.split("\n"), atl = ACCUM_TILE_WGSL.split("\n"), gone48 = al.filter((l) => !atl.includes(l));
    let refusedEdit = null; try { accumTileWgsl(ACCUM_WGSL.replace("let v = vec3<f32>(cur[s], cur[s + 1u], cur[s + 2u]);", "let v = vec3<f32>(cur[s]);")); } catch (e) { refusedEdit = e.message; }
    ok("  round 48: ACCUM_TILE_WGSL is ACCUM_WGSL with exactly three edits -- the tile, its load and barrier before the first return, the clamp's load from it -- and an edit that does not land once is refused",
        ACCUM_TILE_EDITS.length === 3 && gone48.length === 3 && gone48.some((l) => /fn main\(@builtin\(global_invocation_id\) g:vec3<u32>\) \{$/.test(l)) && gone48.some((l) => /let v = vec3<f32>\(cur\[s\]/.test(l)) &&
        (ACCUM_TILE_WGSL.match(/workgroupBarrier\(\);/g) || []).length === 1 && ACCUM_TILE_WGSL.indexOf("workgroupBarrier();") < ACCUM_TILE_WGSL.indexOf("return;") &&
        (ACCUM_TILE_WGSL.match(/T\[/g) || []).length === 2 && /exactly|not once/.test(refusedEdit || ""),
        `${gone48.length} lines replaced: ${gone48.map((l) => l.trim().slice(0, 40)).join(" | ")}`);
    ok("  ...and the quads run at exactly 2 x only: any other ratio is refused by name",
        easuQuadRefusal(480, 270, 960, 540) === null && easuQuadRefusal(13, 9, 26, 18) === null && /exactly 2 x only -- 13 x 9 -> 39 x 27 is not/.test(easuQuadRefusal(13, 9, 39, 27) || "") && !!easuQuadRefusal(13, 9, 26, 19));
    let mesh = null; try { packSpheres([{ bvh: {} }]); } catch (e) { mesh = e.message; }
    ok("  ...and a scene with a mesh is refused by name -- the coverage kernel intersects spheres only", /spheres only/.test(mesh || ""));
    // round 33: the accumulation's uniform (two cameras, then w h clamp frames, then the scales and tolerances) and the packed geometry
    const au = new DataView(accumUniform(S, S.eye, S.eye, 32, 24).buffer), pg0 = packGeometry({ pos: [1, 2, 3], nrm: [0, 1, 0], obj: [4] }, 1);
    ok("  round 33: the accumulation's uniform is the kernel's struct (five vec4, w h clamp frames, then prevScale aspect curScale posTol normalDot), and a pixel's geometry packs as GEO_STRIDE floats",
        au.byteLength === 128 && au.getUint32(80, true) === 32 && au.getUint32(84, true) === 24 && au.getUint32(88, true) === 1 && au.getUint32(92, true) === 8 &&
        Math.abs(au.getFloat32(100, true) - 32 / 24) < 1e-6 && au.getFloat32(108, true) === 3 && Math.abs(au.getFloat32(112, true) - 0.9) < 1e-7 &&
        pg0.length === GEO_STRIDE && pg0[0] === 1 && pg0[4] === 1 && pg0[6] === 4);
    const cu = new DataView(cameraUniform(S, 32, 24, 6).buffer);
    ok("  the camera uniform's layout is the kernel's struct: four vec4, w h nSph grid, scale and aspect",
        cu.byteLength === 96 && cu.getUint32(64, true) === 32 && cu.getUint32(68, true) === 24 && cu.getUint32(72, true) === 6 && cu.getUint32(76, true) === 8 &&
        Math.abs(cu.getFloat32(84, true) - 32 / 24) < 1e-6);
}

console.log("\n3. ON THE DEVICE");
// three of round 30's R images with an emitter in view (section 92: 44001, 44002, 44004), at 64 x 64 full and 32 x 32 half,
// and a fourth, built by hand: one sphere between the camera and the light, covering part of it, and one OVERLAPPING the light.
// Sabotage G3 (the coverage kernel taking the farther root) went 0 RED on the three R scenes and on the first draft of this
// one, which had the in-front sphere alone: where spheres do not overlap, their far roots come in the same order as their
// near ones, so the nearest sphere -- all coverage asks -- never changes. The arc's scenes keep their spheres apart, so on
// them G3 is no change at all; the overlapping sphere is here so the kernel is held to the root rule anyway (measured on
// the CPU at 32 x 32: 1,806 rays reach the light with the near root, 1,832 with the far one).
const OCCLUDED = { seed: "occluded", eye: [0, 1.5, 5], look: [0, 1.5, 0], up: [0, 1, 0], fovDeg: 40, scene: [
    { centre: [0, -100, 0], radius: 100, albedo: [0.5, 0.5, 0.5] },
    { centre: [0, 1.5, 0], radius: 0.6, albedo: 0, emit: [12, 10, 8] },
    { centre: [-0.35, 1.5, 2.2], radius: 0.3, albedo: [0.6, 0.6, 0.6] },
    { centre: [0.35, 1.5, 0.5], radius: 0.6, albedo: [0.6, 0.6, 0.6] }] };
const SCENES = [...[44001, 44002, 44004].map((s) => makeScene("R", s)), OCCLUDED];
// round 39: the light behind the camera -- the bounded coverage must trace nothing, and still be round 31's (all 0)
const BEHIND = { seed: "behind", eye: [0, 1.5, 5], look: [0, 1.5, 0], up: [0, 1, 0], fovDeg: 40, scene: [
    { centre: [0, -100, 0], radius: 100, albedo: [0.5, 0.5, 0.5] },
    { centre: [0, 1.5, 8], radius: 0.6, albedo: 0, emit: [12, 10, 8] },
    { centre: [0.35, 1.5, 0.5], radius: 0.6, albedo: [0.6, 0.6, 0.6] }] };
const W = 64, Hh = 32, wire = (S) => ({ scene: S.scene, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg });
const CPU = SCENES.map((S) => ({ full: emitterRadiance(S, W, W), half: emitterRadiance(S, Hh, Hh) }));
// each chain's input: smooth light, and the emitters' own radiance where they cover a pixel -- what a traced frame holds there
const chainIn = CPU.map(({ half }) => {
    const img = new Float64Array(Hh * Hh * 3);
    for (let p = 0; p < Hh * Hh; p++) for (let c = 0; c < 3; c++) img[p * 3 + c] = half.E[p * 3 + c] + (1 - half.cov[p]) * (0.1 + 0.5 * ((p % Hh) / Hh) + 0.2 * c * Math.floor(p / Hh) / Hh);
    return img;
});
const RINGS = 24;
// round 46: the rest's fixtures -- each scene's chain input with its full-size guide, and two odd half sizes (partial quads at the
// right and bottom edges) of a seeded, rough image with values past the transfer's top and an emitter-like guide
const lcg = (seed) => { let x = seed >>> 0; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
const oddRest = [[13, 9, 71], [7, 11, 72]].map(([w, h, seed]) => {
    const r = lcg(seed), img = Array.from({ length: w * h * 3 }, () => (r() < 0.1 ? 4 + 8 * r() : r())), W2 = 2 * w, H2 = 2 * h;
    const cov = Array.from({ length: W2 * H2 }, () => (r() < 0.2 ? r() : 0)), E = cov.flatMap((c) => [c * 3, c * 2, c]);
    return { w, h, img, full: { cov, E } };
});
// round 34's list fill on a frame whose fill is long: a disc 22 pixels in radius and two more, one cut by the frame's corner
const F2 = synth(96, 64, [[30, 30, 22], [70, 40, 14], [95, 0, 6]]);
const payload = { scenes: SCENES.map(wire), behind: wire(BEHIND), fill: { img: Array.from(F1.img), cov: Array.from(F1.cov) }, fill2: { img: Array.from(F2.img), cov: Array.from(F2.cov) }, chainIn: chainIn.map((a) => Array.from(a)), oddRest,
    covHalf: CPU.map((c) => Array.from(c.half.cov)), full: CPU.map((c) => ({ cov: Array.from(c.full.cov), E: Array.from(c.full.E) })), W, Hh, RINGS };
const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 900000, args: { payload }, script: `async (a) => {
    const P = a.payload;
    const { requestDevice } = await import("/gfx/device.js");
    const { DenoiseUpscaleGPU } = await import("/render/denoiseUpscaleGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = [];
    if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new DenoiseUpscaleGPU(dev), A = (x) => Array.from(x);
    const cov = [];
    for (const S of P.scenes) { const f = await g.coverage(S, P.W, P.W, { bound: false }), h = await g.coverage(S, P.Hh, P.Hh, { bound: false }); cov.push({ full: { cov: A(f.cov), E: A(f.E) }, half: { cov: A(h.cov), E: A(h.E) } }); }
    // round 39: the bounded coverage on the same scenes and sizes, held to round 31's bit for bit here, and on the light behind the camera
    const bitsEq = (x, y) => x.length === y.length && x.every((v, i) => Object.is(v, y[i]));
    const covB = [];
    for (const [i, S] of P.scenes.entries()) for (const [k, n] of [["full", P.W], ["half", P.Hh]]) {
        const u = await g.coverage(S, n, n, { bound: false }), b = await g.coverage(S, n, n, { bound: true });
        // round 44: and the coverage with nothing asked, which is the bounded one
        const d = await g.coverage(S, n, n);
        covB.push({ i, k, n, traced: b.traced, unboundedTraced: u.traced, same: bitsEq(A(u.cov), A(b.cov)) && bitsEq(A(u.E), A(b.E)), litMissed: A(u.cov).filter((c, p) => c > 0 && b.cov[p] === 0).length,
                    dflt: { traced: d.traced, sameAsBound: bitsEq(A(d.cov), A(b.cov)) && bitsEq(A(d.E), A(b.E)) } });
    }
    const bh = await g.coverage(P.behind, P.W, P.W, { bound: true }), bhu = await g.coverage(P.behind, P.W, P.W, { bound: false }), bhd = await g.coverage(P.behind, P.W, P.W);
    const behind = { traced: bh.traced, same: bitsEq(A(bh.cov), A(bhu.cov)), lit: A(bhu.cov).filter((c) => c > 0).length, dflt: { traced: bhd.traced, sameAsBound: bitsEq(A(bhd.cov), A(bh.cov)) && bitsEq(A(bhd.E), A(bh.E)) } };
    const fills = [];
    for (const m of [16, 2]) { const f = await g.fill(Float64Array.from(P.fill.img), Float64Array.from(P.fill.cov), 24, 20, m, { list: false }); fills.push({ ...f, y: A(f.y) }); }
    // round 34: the list fill beside round 31's, on the same frames and ring budgets, and on a frame of all emitter and one of none
    const lists = [];
    for (const [k, F, w, h, m] of [["F1/16", P.fill, 24, 20, 16], ["F1/2", P.fill, 24, 20, 2], ["F2/40", P.fill2, 96, 64, 40], ["F2/8", P.fill2, 96, 64, 8],
                                   ["all", { img: new Array(12).fill(5), cov: new Array(4).fill(1) }, 2, 2, 4], ["none", { img: P.fill.img, cov: new Array(24 * 20).fill(0) }, 24, 20, 4]]) {
        const ring = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m, { list: false }), list = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m, { list: true });
        // round 36: and the fill with nothing asked -- the list fill then, round 38's listed tile fill since round 43
        const dflt = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m);
        // round 37: and the tile fill
        const tile = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m, { tile: true });
        // round 38: and the tile fill over the listed tiles
        const lt = await g.fill(Float64Array.from(F.img), Float64Array.from(F.cov), w, h, m, { tile: "listed" });
        lists.push({ k, m, w, h, cov: F.cov, ring: { ...ring, y: A(ring.y) }, list: { ...list, y: A(list.y) }, dflt: { ...dflt, y: A(dflt.y) }, tile: { ...tile, y: A(tile.y) }, lt: { ...lt, y: A(lt.y) } });
    }
    // round 37: a ring budget that is not a whole number of tile passes -- the last runs 5 of its 8
    const t13 = { list: await g.fill(Float64Array.from(P.fill2.img), Float64Array.from(P.fill2.cov), 96, 64, 13, { list: true }), tile: await g.fill(Float64Array.from(P.fill2.img), Float64Array.from(P.fill2.cov), 96, 64, 13, { tile: true }),
                  lt: await g.fill(Float64Array.from(P.fill2.img), Float64Array.from(P.fill2.cov), 96, 64, 13, { tile: "listed" }) };
    for (const k of ["list", "tile", "lt"]) t13[k] = { ...t13[k], y: A(t13[k].y) };
    const chains = [];
    for (let i = 0; i < P.chainIn.length; i++) {
        const c = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS, { list: false });
        const cl = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS, { list: true });
        const cd = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS);
        const ct = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS, { tile: true });
        const clt = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS, { tile: "listed" });
        // round 54: and the three-pass rest asked for by name, the reference the fused default is held to
        const c2 = await g.chain(Float64Array.from(P.chainIn[i]), Float64Array.from(P.covHalf[i]), P.Hh, P.Hh, P.W, P.W,
            { cov: Float64Array.from(P.full[i].cov), E: Float64Array.from(P.full[i].E) }, P.RINGS, { rest: "easu" });
        chains.push({ ...c, y: A(c.y), list: { ...cl, y: A(cl.y) }, dflt: { ...cd, y: A(cd.y) }, tile: { ...ct, y: A(ct.y) }, lt: { ...clt, y: A(clt.y) }, two: { ...c2, y: A(c2.y) } });
    }
    // round 54 (section 125): a ratio of 3, where the fused pass does not run -- asked nothing, the three passes; asked fused, refused
    const odd3 = () => [new Float64Array(13 * 9 * 3).fill(0.25), new Float64Array(13 * 9), 13, 9, 39, 27, { cov: new Float64Array(39 * 27), E: new Float64Array(39 * 27 * 3) }, 4];
    let chainOdd = null; try { const oc = await g.chain(...odd3()); chainOdd = { rest: oc.rest, n: oc.y.length, finite: Array.from(oc.y).every(Number.isFinite) }; } catch (e) { chainOdd = { error: String(e.message).slice(0, 160) }; }
    let chainOddRefused = null; try { await g.chain(...odd3(), { rest: "fused" }); } catch (e) { chainOddRefused = String(e.message).slice(0, 160); }
    let wrongBackend = null;
    try { new DenoiseUpscaleGPU(await requestDevice(document.createElement("canvas"), { backend: "webgl2", offscreen: true })); } catch (e) { wrongBackend = String(e.message).slice(0, 160); }
    const ad = await navigator.gpu.requestAdapter(), info = ad.info || {};
    // round 46 (section 115): the rest three ways on each fixture -- EASU then the composite, EASU in quads then the composite, and
    // the fused pass -- compared bit for bit here, so only counts cross back; and a ratio other than 2 refused on the device too
    const bitsSame = (x, y) => { let d = 0; for (let i = 0; i < x.length; i++) if (!Object.is(x[i], y[i])) d++; return d; };
    const restCases = [...P.chainIn.map((img, i) => ({ k: "scene " + i, w: P.Hh, h: P.Hh, img, full: P.full[i] })), ...P.oddRest.map((o) => ({ k: o.w + " x " + o.h, ...o }))];
    const rests = [];
    for (const c of restCases) {
        const args = [Float64Array.from(c.img), c.w, c.h, 2 * c.w, 2 * c.h, { cov: Float64Array.from(c.full.cov), E: Float64Array.from(c.full.E) }];
        const e = await g.rest(...args, "easu"), q = await g.rest(...args, "quad"), f = await g.rest(...args, "fused");
        rests.push({ k: c.k, n: e.y.length, upDiff: bitsSame(e.up, q.up), yQuadDiff: bitsSame(e.y, q.y), yFusedDiff: bitsSame(e.y, f.y), tMax: e.tMax, clamped: e.y.some((v) => v > 0) && e.tMax > 0,
                     lenOk: e.up.length === q.up.length && e.y.length === f.y.length && f.up === null });
    }
    let restRefused = null; try { await g.rest(new Float64Array(13 * 9 * 3), 13, 9, 39, 27, { cov: new Float64Array(39 * 27), E: new Float64Array(39 * 27 * 3) }, "fused"); } catch (e) { restRefused = String(e.message).slice(0, 160); }
    return { cov, covB, behind, fills, lists, t13, chains, chainOdd, chainOddRefused, rests, restRefused, errs, backend: dev.backend, wrongBackend, adapter: [info.vendor, info.architecture, info.description].filter(Boolean).join(" / ") };
}` });

if (r.skipped) console.log("  SKIP  " + r.reason);
else if (!r.ok) ok("!! the device ran the chain", false, `${r.reason || "no result"} ${JSON.stringify(r.pageErrors || []).slice(0, 400)}`);
else {
    const R = r.result;
    say(`adapter: ${R.adapter || "unnamed"}; backend ${R.backend}`);
    ok("  the device ran with no uncaptured WebGPU error, and the runner refuses a WebGL2 device by name",
        !R.errs.length && /webgpu backend/.test(R.wrongBackend || ""), R.errs.join("; ") || (R.wrongBackend || "").slice(0, 100));
    // COVERAGE: rays are counted, so a difference is a whole ray. f32 against f64 can flip a ray that grazes a silhouette.
    // First run on SwiftShader: one ray different over all six frames (R 44001 at half size), E within 3.8e-7 where the count
    // agreed. Held at no more than 1 in 10,000 of a frame's rays, and E within 1e-5.
    const cmp = R.cov.flatMap((g, i) => [["full", W, CPU[i].full, g.full], ["half", Hh, CPU[i].half, g.half]].map(([k, n, c, d]) => {
        let rays = 0, eMax = 0, inView = 0;
        for (let p = 0; p < n * n; p++) {
            rays += Math.abs(Math.round(c.cov[p] * 64) - Math.round(d.cov[p] * 64));
            if (c.cov[p] > 0) inView++;
            if (Math.round(c.cov[p] * 64) === Math.round(d.cov[p] * 64)) for (let ch = 0; ch < 3; ch++) eMax = Math.max(eMax, Math.abs(c.E[p * 3 + ch] - d.E[p * 3 + ch]) / (Math.abs(c.E[p * 3 + ch]) + 1e-6));
        }
        return { k: `R ${SCENES[i].seed} ${k}`, rays, eMax, inView, budget: Math.floor(n * n * 64 / 10000) };
    }));
    ok("!! coverage on the device is emitterRadiance's: per frame, no more rays different than 1 in 10,000, and E within 1e-5 where the count agrees -- on frames with an emitter in view",
        cmp.length === 8 && cmp.every((c) => c.rays <= c.budget && c.eMax <= 1e-5) && cmp.every((c) => c.inView > 0),
        cmp.map((c) => `${c.k}: ${c.rays} ray(s) (of ${c.budget} allowed), E ${c.eMax.toExponential(1)}, ${c.inView} px in view`).join("; "));
    // ROUND 39 (section 107), THE BOUNDED COVERAGE: round 31's bit for bit wherever it traces or skips, every lit pixel traced, its
    // traced count the CPU twin's within 2 % (the twin is f64, the kernel f32, so a pixel on the bound's edge may go either way)
    const twin = SCENES.map((S) => ({ full: coverageMayHit(S, W, W), half: coverageMayHit(S, Hh, Hh) }));
    const sumOf = (a) => a.reduce((x, y) => x + y, 0);
    ok("!! round 39: the bounded coverage is round 31's bit for bit on the four scenes at both sizes, every lit pixel traced, its traced count the CPU twin's within 2 % and well short of the frame -- and with the light behind the camera it traces nothing",
        R.covB.length === 8 && R.covB.every((c) => c.same && c.litMissed === 0 && c.unboundedTraced === 0 && Math.abs(c.traced - sumOf(twin[c.i][c.k])) <= Math.max(1, 0.02 * sumOf(twin[c.i][c.k])) && c.traced < c.n * c.n / 4) &&
        R.behind.traced === 0 && R.behind.same && R.behind.lit === 0,
        R.covB.map((c) => `${SCENES[c.i].seed} ${c.k}: ${c.traced} traced (twin ${sumOf(twin[c.i][c.k])}) of ${c.n * c.n}`).join("; ") + `; behind: ${R.behind.traced} traced`);
    // ROUND 44 (section 113), THE DEFAULT: coverage() asked nothing is the bounded coverage -- the same pixels traced, the same bits --
    // and { bound: false } is round 31's, which counts nothing (the rows above hold it to emitterRadiance)
    ok("!! round 44: coverage() asked nothing is the bounded coverage -- the same pixels traced and the same bits -- on the four scenes at both sizes and with the light behind the camera, and { bound: false } traces nothing",
        R.covB.length === 8 && R.covB.every((c) => c.dflt.traced === c.traced && c.dflt.sameAsBound && c.unboundedTraced === 0) && R.covB.some((c) => c.dflt.traced > 0) &&
        R.behind.dflt.traced === R.behind.traced && R.behind.dflt.sameAsBound,
        R.covB.map((c) => `${SCENES[c.i].seed} ${c.k}: ${c.dflt.traced} traced`).join("; ") + `; behind: ${R.behind.dflt.traced}`);
    // and the twin itself, on the CPU: it traces every pixel emitterRadiance lights, on these views and the pilot's scene
    const tw = [...SCENES.flatMap((S, i) => [[twin[i].full, CPU[i].full.cov], [twin[i].half, CPU[i].half.cov]]),
                (() => { const S = makeScene("R", 990000); return [coverageMayHit(S, 128, 72), emitterRadiance(S, 128, 72).cov]; })()];
    ok("!! ...and its CPU twin traces every pixel emitterRadiance lights, on the four scenes at both sizes and R 990000 at 128 x 72, and skips most of each frame",
        tw.length === 9 && tw.every(([m, c]) => c.every((v, p) => !(v > 0) || m[p] === 1) && sumOf(m) < m.length / 4),
        tw.map(([m, c]) => `${sumOf(m)} traced for ${c.filter((v) => v > 0).length} lit`).join("; "));
    // THE FILL: each ring's mean in f32 against f64. First run: worst relative difference 1.2e-7. Held at 1e-5.
    const b16 = fillEmittersBounded(F1.img, F1.cov, 24, 20, 16), b2 = fillEmittersBounded(F1.img, F1.cov, 24, 20, 2), [g16, g2] = R.fills;
    ok("!! the bounded fill on the device is fillEmittersBounded's: the same rings and pixels left, and every value within 1e-5 -- with rings to spare and short of them",
        g16.rings === b16.rings && g16.left === b16.left && g2.rings === b2.rings && g2.left === b2.left && maxRel(g16.y, b16.y) <= 1e-5 && maxRel(g2.y, b2.y) <= 1e-5,
        `16: ${g16.rings} rings, ${g16.left} left, worst ${maxRel(g16.y, b16.y).toExponential(1)}; 2: ${g2.rings} rings, ${g2.left} left, worst ${maxRel(g2.y, b2.y).toExponential(1)}; per ring ${g16.perRing.slice(0, g16.rings + 1).join(",")}`);
    // THE CHAIN: against emitterAwareUpscale(..., "easu", full) -- the f64 chain round 30 measured. EASU in f32 against the CPU's
    // f64, through the transfer's inverse, which stretches a difference near the frame's brightest t. First run: worst 2.3e-6.
    // Held at 1e-3, relative with a floor of 1e-3.
    const ref = chainIn.map((img, i) => emitterAwareUpscale(img, CPU[i].half.cov, Hh, Hh, W, W, "easu", CPU[i].full));
    const ch = R.chains.map((c, i) => ({ k: `R ${SCENES[i].seed}`, rel: maxRel(c.y, ref[i]), rings: c.rings, left: c.left }));
    ok("!! the whole chain on one encoder -- bounded fill, transfer, EASU, inverse, composite -- is emitterAwareUpscale's with EASU, within 1e-3, every emitter pixel reached",
        ch.length === 4 && ch.every((c) => c.rel <= 1e-3 && c.left === 0 && c.rings > 0 && c.rings < RINGS),
        ch.map((c) => `${c.k}: worst ${c.rel.toExponential(1)}, ${c.rings} rings, ${c.left} left`).join("; "));
    // ROUND 34, THE LIST FILL (Y7 -- fill() running the rings whatever it is asked -- went 0 RED before `listed`: the two fills agree,
    // so only the list's own length, read back, says which ran): the same rule as round 31's device fill, run over the lights' pixels only and in place. Against
    // fillEmittersBounded at round 31's tolerance, and against round 31's device fill: the same sums in the same order, so the same
    // floats wherever the two compilers keep them -- held at 1e-6, the count of floats that differ at all reported
    const cpuOf = { F1: [F1, 24, 20], F2: [F2, 96, 64] };
    const L = R.lists.map((x) => {
        const [F, w, h] = cpuOf[x.k.split("/")[0]] || [null], ref = F ? fillEmittersBounded(F.img, F.cov, w, h, x.m) : null;
        let diff = 0; for (let i = 0; i < x.list.y.length; i++) if (!Object.is(x.list.y[i], x.ring.y[i])) diff++;
        return { ...x, ref, diff, vsRing: maxRel(x.list.y, x.ring.y), vsCpu: ref ? maxRel(x.list.y, ref.y) : null };
    });
    const same = (a, b) => a.rings === b.rings && a.left === b.left && a.perRing.length === b.perRing.length && a.perRing.every((v, i) => v === b.perRing[i]);
    ok("!! round 34: the list fill is fillEmittersBounded's -- the same rings, ring by ring, and pixels left, every value within 1e-5 -- with rings to spare and short of them, on a 24 x 20 and a 96 x 64 frame",
        L.filter((x) => x.ref).length === 4 && L.filter((x) => x.ref).every((x) => x.list.rings === x.ref.rings && x.list.left === x.ref.left && x.vsCpu <= 1e-5) &&
        L.some((x) => x.ref && x.list.left === 0 && x.list.rings > 8) && L.some((x) => x.ref && x.list.left > 0),
        L.filter((x) => x.ref).map((x) => `${x.k}: ${x.list.rings} rings, ${x.list.left} left, worst ${x.vsCpu.toExponential(1)}`).join("; "));
    ok("!! ...and it is round 31's device fill: the same filled count in every ring, the same pixels left, every value within 1e-6 -- and on a frame of all emitter or of none",
        L.length === 6 && L.every((x) => same(x.list, x.ring) && x.vsRing <= 1e-6 && x.ring.listed === 0) && L.every((x) => x.list.listed === (x.k === "none" ? 0 : x.k === "all" ? 4 : cpuOf[x.k.split("/")[0]][0].cov.filter((c) => c > 0).length)) && L.find((x) => x.k === "all").list.left === 4 && L.find((x) => x.k === "all").list.rings === 0 &&
        L.find((x) => x.k === "none").list.rings === 0 && L.find((x) => x.k === "none").list.left === 0 && maxRel(L.find((x) => x.k === "none").list.y, F1.img) <= 1e-6,
        L.map((x) => `${x.k}: ${x.list.listed} listed, ${x.diff} of ${x.list.y.length} floats differ, worst ${x.vsRing.toExponential(1)}`).join("; "));
    const chL = R.chains.map((c, i) => ({ k: `R ${SCENES[i].seed}`, rel: maxRel(c.list.y, ref[i]), vs: maxRel(c.list.y, c.y), same: same(c.list, c) }));
    ok("!! ...and the whole chain with it is emitterAwareUpscale's within 1e-3, and round 31's chain within 1e-6, every emitter pixel reached",
        chL.length === 4 && chL.every((c) => c.rel <= 1e-3 && c.vs <= 1e-6 && c.same) && R.chains.every((c, i) => c.list.left === 0 && c.listed === 0 && c.list.listed === CPU[i].half.cov.filter((v) => v > 0).length),
        chL.map((c) => `${c.k}: worst ${c.rel.toExponential(1)} against the CPU, ${c.vs.toExponential(1)} against round 31's`).join("; "));
    // ROUND 36 (section 103) made the list fill the default; ROUND 43 (section 112) makes it round 38's listed tile fill. fill() and
    // chain() asked nothing are the listed tile fill, bit for bit -- the same tiles listed, the same passes, the same floats, read
    // back -- while { list: true } is still round 34's (its pixels listed, no tile) and { list: false } round 31's (nothing listed)
    const bits = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
    const tilesOf0 = (cov, w, h) => { const t = new Set(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cov[y * w + x] > 0) t.add(Math.floor(y / FILL_TILE_INNER) * Math.ceil(w / FILL_TILE_INNER) + Math.floor(x / FILL_TILE_INNER)); return t.size; };
    ok("!! round 43: fill() asked nothing is the listed tile fill -- the same tiles listed (the CPU's count), the same passes, the same rings, ring by ring, and the same floats bit for bit, on all six frames",
        L.length === 6 && L.every((x) => x.dflt.tilesListed === x.lt.tilesListed && x.dflt.tilesListed === tilesOf0(x.cov, x.w, x.h) && x.dflt.tilePasses === x.lt.tilePasses && x.dflt.listed === 0 &&
            same(x.dflt, x.lt) && bits(x.dflt.y, x.lt.y)) && L.some((x) => x.dflt.tilesListed > 0),
        L.map((x) => `${x.k}: ${x.dflt.tilesListed} tiles, ${x.dflt.tilePasses} passes, ${x.dflt.rings} rings`).join("; "));
    ok("!! ...and { list: true } is still round 34's list fill -- every unknown pixel listed, no tile -- and { list: false } round 31's, nothing listed, on all six frames",
        L.every((x) => x.list.listed === x.cov.filter((v) => v > 0).length && x.list.tilesListed === 0 && x.list.tilePasses === 0 && x.ring.listed === 0 && x.ring.tilesListed === 0 && x.ring.tilePasses === 0) && L.some((x) => x.list.listed > 0),
        L.map((x) => `${x.k}: list ${x.list.listed} listed, ring ${x.ring.listed}`).join("; "));
    ok("!! ...and chain() asked nothing is the listed tile fill's chain, bit for bit, over the CPU's count of tiles, every emitter pixel reached, on all four scenes",
        R.chains.length === 4 && R.chains.every((c, i) => c.dflt.tilesListed === c.lt.tilesListed && c.dflt.tilesListed === tilesOf0(CPU[i].half.cov, Hh, Hh) && c.dflt.listed === 0 && c.dflt.left === 0 &&
            same(c.dflt, c.lt) && bits(c.dflt.y, c.lt.y)),
        R.chains.map((c, i) => `R ${SCENES[i].seed}: ${c.dflt.tilesListed} tiles, ${c.dflt.rings} rings`).join("; "));
    // ROUND 54 (section 125), THE DEFAULT REST: chain() asked nothing runs the transfer and round 46's fused EASU and composite, and
    // says so -- bit for bit the three passes asked by name, which say so too; at a ratio the fused pass refuses, the three passes
    ok("!! round 54: chain() asked nothing is the fused rest -- it says \"fused\" -- and is { rest: \"easu\" }'s chain bit for bit, which says \"easu\", every emitter pixel reached, on all four scenes",
        R.chains.length === 4 && R.chains.every((c) => c.dflt.rest === "fused" && c.two.rest === "easu" && bits(c.dflt.y, c.two.y) && same(c.dflt, c.two) && c.dflt.left === 0 && c.dflt.tMax === c.two.tMax),
        R.chains.map((c, i) => `R ${SCENES[i].seed}: ${c.dflt.rest} against ${c.two.rest}, tMax ${c.dflt.tMax.toFixed(3)}`).join("; "));
    ok("!! ...and at 13 x 9 -> 39 x 27, a ratio of 3, chain() asked nothing runs the three passes and says so, while { rest: \"fused\" } there is refused by name",
        !!R.chainOdd && R.chainOdd.rest === "easu" && R.chainOdd.n === 39 * 27 * 3 && R.chainOdd.finite && /chain: the quad EASU runs at exactly 2 x only -- 13 x 9 -> 39 x 27 is not/.test(R.chainOddRefused || ""),
        `${JSON.stringify(R.chainOdd)}; ${R.chainOddRefused}`);
    // ROUND 37 (section 104), THE TILE FILL: eight rings a pass in workgroup tiles. Against fillEmittersBounded at round 31's
    // tolerance, and against the list fill bit for bit -- the same sums in the same order -- with its passes read back, as two
    // fills that agree float for float cannot otherwise tell which ran (round 34's Y7)
    const passesFor = (m) => Math.ceil(m / FILL_TILE_RINGS);
    ok("!! round 37: the tile fill is fillEmittersBounded's -- the same rings and pixels left, every value within 1e-5 -- with rings to spare and short of them, on a 24 x 20 and a 96 x 64 frame",
        L.filter((x) => x.ref).length === 4 && L.filter((x) => x.ref).every((x) => x.tile.rings === x.ref.rings && x.tile.left === x.ref.left && maxRel(x.tile.y, x.ref.y) <= 1e-5),
        L.filter((x) => x.ref).map((x) => `${x.k}: ${x.tile.rings} rings, ${x.tile.left} left, ${x.tile.tilePasses} passes, worst ${maxRel(x.tile.y, x.ref.y).toExponential(1)}`).join("; "));
    ok("!! ...and it is the list fill bit for bit -- the same filled count in every ring, the same pixels left, the same floats -- on all six frames and at 13 rings, where the last pass runs 5, each in ceil(rings / 8) passes",
        L.length === 6 && L.every((x) => same(x.tile, x.list) && bits(x.tile.y, x.list.y) && x.tile.tilePasses === passesFor(x.m) && x.tile.listed === 0 && x.list.tilePasses === 0) &&
        same(R.t13.tile, R.t13.list) && bits(R.t13.tile.y, R.t13.list.y) && R.t13.tile.tilePasses === 2 && R.t13.tile.rings === 13 && R.t13.tile.left > 0,
        L.map((x) => `${x.k}: ${x.tile.tilePasses} passes, ${x.tile.rings} rings, ${x.tile.left} left`).join("; ") + `; F2/13: ${R.t13.tile.tilePasses} passes, ${R.t13.tile.rings} rings, ${R.t13.tile.left} left`);
    ok("!! ...and the whole chain with it is the list fill's chain bit for bit, every emitter pixel reached, on all four scenes",
        R.chains.length === 4 && R.chains.every((c) => same(c.tile, c.list) && bits(c.tile.y, c.list.y) && c.tile.left === 0 && c.tile.tilePasses === passesFor(RINGS)),
        R.chains.map((c, i) => `R ${SCENES[i].seed}: ${c.tile.tilePasses} passes, ${c.tile.rings} rings`).join("; "));
    // ROUND 38 (section 106), THE TILE FILL OVER THE LISTED TILES: against fillEmittersBounded, against the list fill and the tile fill
    // bit for bit, its passes read back, and the tiles it listed against the CPU's count of 16 x 16 tiles holding an unknown pixel
    const tilesOf = (cov, w, h) => { const t = new Set(); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (cov[y * w + x] > 0) t.add(Math.floor(y / FILL_TILE_INNER) * Math.ceil(w / FILL_TILE_INNER) + Math.floor(x / FILL_TILE_INNER)); return t.size; };
    ok("!! round 38: the listed tile fill is fillEmittersBounded's -- the same rings and pixels left, every value within 1e-5 -- with rings to spare and short of them, on a 24 x 20 and a 96 x 64 frame",
        L.filter((x) => x.ref).length === 4 && L.filter((x) => x.ref).every((x) => x.lt.rings === x.ref.rings && x.lt.left === x.ref.left && maxRel(x.lt.y, x.ref.y) <= 1e-5),
        L.filter((x) => x.ref).map((x) => `${x.k}: ${x.lt.rings} rings, ${x.lt.left} left, ${x.lt.tilesListed} tiles, worst ${maxRel(x.lt.y, x.ref.y).toExponential(1)}`).join("; "));
    // a frame with no unknown pixel lists no tile, so its tile passes dispatch no workgroup and none is counted (first run: the row
    // asked ceil(rings / 8) of the "none" frame too, and read 0)
    ok("!! ...and it is the list fill and the tile fill bit for bit, on all six frames and at 13 rings, in ceil(rings / 8) passes (none where no tile is listed), over exactly the tiles the CPU counts with an unknown pixel",
        L.length === 6 && L.every((x) => same(x.lt, x.list) && bits(x.lt.y, x.list.y) && bits(x.lt.y, x.tile.y) && x.lt.tilePasses === (x.lt.tilesListed ? passesFor(x.m) : 0) && x.lt.tilesListed === tilesOf(x.cov, x.w, x.h) && x.tile.tilesListed === 0) &&
        L.find((x) => x.k === "F2/40").lt.tilesListed > 1 && L.find((x) => x.k === "F2/40").lt.tilesListed < Math.ceil(96 / 16) * Math.ceil(64 / 16) && L.find((x) => x.k === "none").lt.tilesListed === 0 &&
        same(R.t13.lt, R.t13.list) && bits(R.t13.lt.y, R.t13.list.y) && R.t13.lt.tilePasses === 2,
        L.map((x) => `${x.k}: ${x.lt.tilesListed} of ${Math.ceil(x.w / 16) * Math.ceil(x.h / 16)} tiles (CPU ${tilesOf(x.cov, x.w, x.h)}), ${x.lt.tilePasses} passes`).join("; "));
    ok("!! ...and the whole chain with it is the list fill's chain bit for bit, every emitter pixel reached, over the CPU's count of tiles, on all four scenes",
        R.chains.length === 4 && R.chains.every((c, i) => same(c.lt, c.list) && bits(c.lt.y, c.list.y) && c.lt.left === 0 && c.lt.tilePasses === passesFor(RINGS) && c.lt.tilesListed === tilesOf(CPU[i].half.cov, Hh, Hh)),
        R.chains.map((c, i) => `R ${SCENES[i].seed}: ${c.lt.tilesListed} tiles, ${c.lt.rings} rings`).join("; "));
    // ROUND 46 (section 115): EASU in quads is EASU's buffer bit for bit, and the fused pass is EASU then the composite bit for bit,
    // on the four scenes and at two odd half sizes whose right and bottom quads are partial -- and the device refuses other ratios
    ok("!! round 46: EASU in 2 x 2 quads writes EASU's buffer bit for bit, and so its composite; the fused pass is EASU then the composite, bit for bit -- on the four scenes and at 13 x 9 and 7 x 11, partial quads at the edges",
        R.rests.length === 6 && R.rests.every((c) => c.lenOk && c.upDiff === 0 && c.yQuadDiff === 0 && c.yFusedDiff === 0 && c.clamped),
        R.rests.map((c) => `${c.k}: ${c.upDiff} / ${c.yQuadDiff} / ${c.yFusedDiff} of ${c.n} differ, tMax ${c.tMax.toFixed(3)}`).join("; "));
    ok("  ...and on the device a ratio other than 2 is refused by name, before any pass", /exactly 2 x only -- 13 x 9 -> 39 x 27 is not/.test(R.restRefused || ""), R.restRefused || "not refused");
}

console.log("\n4. THE CALLER: denoise.html's \"Time the half-size chain\", at its pilot size, in Chromium");
{
    const drive = (size, ms) => runInEngineOrigin({ engineRoot: ENG, timeoutMs: ms + 60000, args: { size, ms }, script: `async (a) => {
        const f = document.createElement("iframe"); f.style.width = "1200px"; f.style.height = "900px"; f.src = "/denoise.html?net=shipped"; document.body.appendChild(f);
        await new Promise((r) => f.onload = r);
        const d = f.contentDocument, $ = (id) => d.getElementById(id), wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 0; i < 100 && !$("chain"); i++) await wait(50);
        $("chainSize").value = a.size; $("chain").click();
        const t = Date.now();
        while (Date.now() - t < a.ms && ($("chain").disabled || !$("chainJson").textContent) && !/failed|no WebGPU/.test($("chainStatus").textContent)) await wait(100);
        return { status: $("chainStatus").textContent, json: $("chainJson").textContent, shown: $("chainTable").style.display !== "none", rows: $("chainTable").querySelectorAll("tbody tr").length };
    }` });
    const pg = await drive("128x72", 540000);
    if (pg.skipped) console.log("  SKIP  " + pg.reason);
    else {
        let J = null; try { J = JSON.parse(pg.result?.json || "null"); } catch {}
        const st = J && J.chain && J.chain.steps, keys = ["covHalf", "covFull", "fill", "rest", "whole", "hits", "shift", "accum", "final", "fillList", "wholeList", "fillTile", "wholeTile", "fillLTile", "wholeLTile", "covHalfB", "covFullB", "restToT", "restEasu", "restComp", "restToTFree", "restEasuQ", "restEasuComp", "accumT", "restF"];
        const fine = (x) => !!x && Number.isFinite(x.ms) && x.ms > 0 && (x.clock === "device" || x.clock === "wall");
        // THE RIG'S LINES, from a report: sections 94, 98, 100 and 102 read them out of committed reports, so each keeps its meaning
        // (section 103) -- 93's and 97's chain is round 31's ring fill (halfRing, temporalRing), 99's "with the list fill" the list
        // fill (half, temporal since round 36); 103's names the default fill
        const rigLines = (K) => {
            const ks = K.chain.steps, row = (x) => (x.skipped ? `not measured (${x.reason})` : `${(x.gpu ? x.gpu.median : x.wall.median).toFixed(3)} ms (${x.gpu ? "device" : "wall"})`), [lh, lf] = K.ladder.rows[K.kernels];
            const at = (W, H) => `${W} x ${H}`, [Wf, Hf, Wh, Hh2] = [lf.W, lf.H, lh.W, lh.H];
            return [`section 93: ${K.ladder.adapter.name}, kernels ${K.kernels}; the network at ${at(Wf, Hf)} ${row(lf)}, at ${at(Wh, Hh2)} ${row(lh)}; ` +
                    (K.fullUnbound && K.halfRing ? `today's page (network and mask) ${K.fullUnbound.ms.toFixed(3)} ms (${K.fullUnbound.clocks.join(" + ")}); the half-size chain ${K.halfRing.ms.toFixed(3)} ms (${K.halfRing.clocks.join(" + ")}); ratio ${(K.fullUnbound.ms / K.halfRing.ms).toFixed(3)} x` : "no ratio: a part was not measured"),
                "section 93: the chain's steps -- " + ["covHalf", "covFull", "fill", "rest", "whole"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    `; ${K.chain.rings} of ${K.chain.maxRings} rings filled`,
                // round 33 (section 97): the history's passes and the chain with them, in a line of their own -- section 94 reads the two above
                "section 97: the history's passes -- " + ["hits", "shift", "accum", "final"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.fullUnbound && K.temporalRing ? `; the half-size chain with its history ${K.temporalRing.ms.toFixed(3)} ms (${K.temporalRing.clocks.join(" + ")}); ratio ${(K.fullUnbound.ms / K.temporalRing.ms).toFixed(3)} x` : "; no ratio: a part was not measured"),
                // round 34 (section 99): the fill over the lights' pixels, beside round 31's, in a line of its own
                "section 99: the fills -- " + ["fill", "fillList", "whole", "wholeList"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.chain.listCheck ? `; the list fill ${K.chain.listCheck.listed} listed, ${K.chain.listCheck.rings} of ${K.chain.maxRings} rings, ${K.chain.listCheck.left} left` : "; the list fill not checked") +
                    (K.fullUnbound && K.halfList && K.temporalList ? `; the half-size chain with the list fill ${K.halfList.ms.toFixed(3)} ms, ratio ${(K.fullUnbound.ms / K.halfList.ms).toFixed(3)} x; with its history ${K.temporalList.ms.toFixed(3)} ms, ratio ${(K.fullUnbound.ms / K.temporalList.ms).toFixed(3)} x` : "; no ratio: a part was not measured"),
                // round 36 (section 103): which fill the default chain runs, and its chain
                `section 103: the default fill ${K.fill || "ring (a report from before round 36)"}, coverage ${K.coverage || "round 31's (a report from before round 44)"}, rest ${K.rest || "three passes (a report from before round 54)"}, accumulation ${K.accumulation || "plain (a report from before round 55)"}` +
                    (K.full && K.half ? `; the half-size chain ${K.half.ms.toFixed(3)} ms, ratio ${(K.full.ms / K.half.ms).toFixed(3)} x` : "; no ratio: a part was not measured") +
                    (K.full && K.temporal ? `; with its history ${K.temporal.ms.toFixed(3)} ms, ratio ${(K.full.ms / K.temporal.ms).toFixed(3)} x` : ""),
                // round 37 (section 104): the tile fill beside the list fill, in a line of its own
                "section 104: the tile fill -- " + ["fillList", "fillTile", "wholeList", "wholeTile"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.chain.tileCheck ? `; the tile fill ${K.chain.tileCheck.passes} passes, ${K.chain.tileCheck.rings} of ${K.chain.maxRings} rings, ${K.chain.tileCheck.left} left` : "; the tile fill not checked") +
                    (K.fullUnbound && K.halfTile && K.temporalTile ? `; the half-size chain with the tile fill ${K.halfTile.ms.toFixed(3)} ms, ratio ${(K.fullUnbound.ms / K.halfTile.ms).toFixed(3)} x; with its history ${K.temporalTile.ms.toFixed(3)} ms, ratio ${(K.fullUnbound.ms / K.temporalTile.ms).toFixed(3)} x` : "; no ratio: a part was not measured"),
                // round 38 (section 106): the tile fill over the lights' tiles beside the list fill, in a line of its own
                "section 106: the listed tile fill -- " + ["fillList", "fillLTile", "wholeList", "wholeLTile"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.chain.ltileCheck ? `; the listed tile fill ${K.chain.ltileCheck.tiles} of ${K.chain.ltileCheck.of} tiles, ${K.chain.ltileCheck.passes} passes, ${K.chain.ltileCheck.rings} of ${K.chain.maxRings} rings, ${K.chain.ltileCheck.left} left` : "; the listed tile fill not checked") +
                    (K.fullUnbound && K.halfUnbound && K.temporalUnbound ? `; the half-size chain with the listed tile fill ${K.halfUnbound.ms.toFixed(3)} ms, ratio ${(K.fullUnbound.ms / K.halfUnbound.ms).toFixed(3)} x; with its history ${K.temporalUnbound.ms.toFixed(3)} ms, ratio ${(K.fullUnbound.ms / K.temporalUnbound.ms).toFixed(3)} x` : "; no ratio: a part was not measured"),
                // round 39 (section 107): the coverage bounded beside round 31's, at both sizes, in a line of its own
                "section 107: the bounded coverage -- " + ["covHalf", "covHalfB", "covFull", "covFullB"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.chain.boundCheck ? `; traced ${K.chain.boundCheck.half} of ${K.chain.boundCheck.ofHalf} and ${K.chain.boundCheck.full} of ${K.chain.boundCheck.ofFull}; bit for bit ${K.chain.boundCheck.sameHalf && K.chain.boundCheck.sameFull ? "at both sizes" : "NOT at both sizes"}` : "; the bounded coverage not checked") +
                    (K.full && K.half && K.temporal ? `; today's page with it ${K.full.ms.toFixed(3)} ms; the half-size chain with it ${K.half.ms.toFixed(3)} ms, ratio ${(K.full.ms / K.half.ms).toFixed(3)} x; with its history ${K.temporal.ms.toFixed(3)} ms, ratio ${(K.full.ms / K.temporal.ms).toFixed(3)} x` : "; no ratio: a part was not measured"),
                // round 42 (section 110): rest's three passes timed apart, and the transfer without its atomic (a diagnostic), beside rest
                "section 110: rest's passes -- " + ["rest", "restToT", "restEasu", "restComp", "restToTFree"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; "),
                // round 46 (section 115): EASU in quads, and fused with the composite, beside the two passes they stand in for
                "section 115: EASU in quads -- " + ["restEasu", "restComp", "restEasuQ", "restEasuComp"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; "),
                // round 48 (section 117): the accumulation with its clamp read from a workgroup tile, beside the accumulation
                "section 117: the accumulation tiled -- " + ["accum", "accumT"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; "),
                // round 54 (section 125): the fused rest the chain runs by default, beside the three passes it stands in for, and the chains with each
                "section 125: the fused rest -- " + ["rest", "restF"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.full && K.half && K.halfTwoPass && K.temporal && K.temporalTwoPass ? `; the half-size chain fused ${K.half.ms.toFixed(3)} ms, in three passes ${K.halfTwoPass.ms.toFixed(3)} ms; with its history fused ${K.temporal.ms.toFixed(3)} ms, in three passes ${K.temporalTwoPass.ms.toFixed(3)} ms` : "; no sum: a part was not measured"),
                // round 55 (section 126): the tiled accumulation the history runs by default, beside the plain one, and the chain with each
                "section 126: the accumulation by default -- " + ["accum", "accumT"].map((k) => `${k} ${fine(ks[k]) ? ks[k].ms.toFixed(3) + " ms (" + ks[k].clock + ")" : "not measured"}`).join("; ") +
                    (K.temporal && K.temporalUntiled ? `; the half-size chain with its history tiled ${K.temporal.ms.toFixed(3)} ms, untiled ${K.temporalUntiled.ms.toFixed(3)} ms` : "; no sum: a part was not measured")];
        };
        ok("!! the page timed every step of the chain and both networks at its pilot size -- each a positive time on a named clock, the table shown, no page error",
            pg.ok && !!st && keys.every((k) => fine(st[k])) && fine(J.networkFull) && fine(J.networkHalf) && !!J.full && !!J.half && !!J.temporal && !!J.halfRing && !!J.temporalRing && !!J.halfTile && !!J.temporalTile && !!J.halfList && !!J.temporalList && !J.halfLTile && !J.temporalLTile && !!J.fullUnbound && !!J.halfUnbound && !!J.temporalUnbound && !J.fullBound && !J.halfBound && !J.temporalBound && J.fill === "listedTile" && J.coverage === "bound" && J.rest === "fused" && !!J.halfTwoPass && !!J.temporalTwoPass && J.accumulation === "tiled" && !!J.temporalUntiled && J.network === "shipped (asked by ?net=)" && J.params === 33329 && pg.result.shown && pg.result.rows === 31 && !pg.pageErrors.length,
            pg.ok ? (pg.result?.status || "").slice(0, 200) : pg.reason);
        if (st) {
            // the network times are the ladder's rows, w x h then W x H (T4 went 0 RED before this held which was which); today's page
            // is the full-size network and its mask, the chain the half-size network and every step
            const [halfRow, fullRow] = J.ladder.rows[J.kernels], med = (x) => (x.gpu ? x.gpu.median : x.wall.median);
            const parts = J.halfRing ? J.halfRing.ms : NaN, sum = med(halfRow) + ["covHalf", "covFull", "fill", "rest"].reduce((a, k) => a + st[k].ms, 0);
            ok("  ...round 31's chain in all (halfRing since round 36) is the half-size network plus the four steps, today's page the full-size network and its mask, each network its own ladder row, the fill by the wall clock, on scene R 990000 with its light in view, every ring budgeted and some used",
                Math.abs(parts - sum) < 1e-9 && st.fill.clock === "wall" && fullRow.W === 128 && fullRow.H === 72 && halfRow.W === 64 && halfRow.H === 36 &&
                J.networkFull.ms === med(fullRow) && J.networkHalf.ms === med(halfRow) && Math.abs(J.fullUnbound.ms - (med(fullRow) + st.covFull.ms)) < 1e-9 && st.whole.clock === "wall" && J.chain.maxRings === 96 && J.chain.rings > 0 && J.chain.rings < 96 &&
                J.chain.inView > 0 && JSON.stringify(J.scene) === JSON.stringify(["R", 990000]) && J.chain.W === 128 && J.chain.w === 64,
                `${J.chain.rings} of 96 rings filled; ${J.chain.inView} px in view at 64 x 36; ${keys.map((k) => `${k} ${st[k].ms.toFixed(2)} ms (${st[k].clock})`).join(", ")}`);
            // round 33: the chain with its history is the chain and round 32's four passes, each one pass on the device's clock where it has one
            const hist = ["hits", "shift", "accum", "final"];
            ok("  round 33: the chain with its history is the half-size chain plus the history's four passes -- first hits, shift, accumulation, composite -- each one pass, on the device's clock where the device has one",
                !!J.temporalRing && Math.abs(J.temporalRing.ms - (J.halfRing.ms + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 && hist.every((k) => st[k].clock === st.covHalf.clock),
                hist.map((k) => `${k} ${st[k].ms.toFixed(2)} ms (${st[k].clock})`).join(", "));
            // round 34: the chain with the list fill is the same sum with fillList in fill's place, and with its history the same
            const listSum = med(halfRow) + ["covHalf", "covFull", "fillList", "rest"].reduce((a, k) => a + st[k].ms, 0);
            ok("  round 43: the list fill's chain (halfList, the default in rounds 36-42) is the half-size chain with fillList in the fill's place, by the wall clock as the fill is, and with its history (temporalList) the history's four passes more",
                !!J.halfList && Math.abs(J.halfList.ms - listSum) < 1e-9 && st.fillList.clock === "wall" && st.wholeList.clock === "wall" &&
                !!J.temporalList && Math.abs(J.temporalList.ms - (listSum + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 &&
                !!J.chain.listCheck && J.chain.listCheck.listed === J.chain.inView && J.chain.listCheck.rings === J.chain.rings && J.chain.listCheck.left === 0,
                `the list fill: ${J.chain.listCheck ? `${J.chain.listCheck.listed} listed, ${J.chain.listCheck.rings} rings, ${J.chain.listCheck.left} left` : "not checked"}; fill ${st.fill.ms.toFixed(2)} ms, the list fill ${st.fillList.ms.toFixed(2)} ms; whole ${st.whole.ms.toFixed(2)}, with the list fill ${st.wholeList.ms.toFixed(2)}`);
            // round 36 (section 103): the rig's four lines, made from this report, each carry the figure of the sum it names
            const [l93, , l97, l99, l103] = rigLines(J), n = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : NaN; }, at3 = (x) => Number(x.ms.toFixed(3));
            ok("  rounds 43 and 44: the rig's lines keep their meaning -- section 93's page round 31's mask (fullUnbound) and its and 97's chain the ring fill's, section 99's \"with the list fill\" the list fill's (halfList), section 103's the default's, which is the listed tile fill on the bounded coverage",
                n(/the half-size chain ([0-9.]+) ms/, l93) === at3(J.halfRing) && n(/with its history ([0-9.]+) ms/, l97) === at3(J.temporalRing) &&
                n(/with the list fill ([0-9.]+) ms/, l99) === at3(J.halfList) && n(/with its history ([0-9.]+) ms/, l99) === at3(J.temporalList) &&
                /^section 103: the default fill listedTile, coverage bound, rest fused, accumulation tiled; the half-size chain ([0-9.]+) ms/.test(l103) && n(/^section 93: .*today's page \(network and mask\) ([0-9.]+) ms/, l93) === at3(J.fullUnbound) && n(/the half-size chain ([0-9.]+) ms/, l103) === at3(J.half) && n(/with its history ([0-9.]+) ms/, l103) === at3(J.temporal),
                l103);
            // round 37 (section 104): the chain with the tile fill is the same sum with fillTile in the fill's place, by the wall
            // clock as the list fill is, its check filling every pixel in view in ceil(96 / 8) passes; the rig's line carries both
            const tileSum = med(halfRow) + ["covHalf", "covFull", "fillTile", "rest"].reduce((a, k) => a + st[k].ms, 0), l104 = rigLines(J)[5], tc = J.chain.tileCheck;
            ok("  round 37: the chain with the tile fill is the half-size chain with fillTile in the fill's place, by the wall clock as the list fill is, and with its history the four passes more; its check fills every pixel in 12 passes; the rig's line carries both sums",
                !!J.halfTile && Math.abs(J.halfTile.ms - tileSum) < 1e-9 && st.fillTile.clock === "wall" && st.wholeTile.clock === "wall" &&
                !!J.temporalTile && Math.abs(J.temporalTile.ms - (tileSum + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 &&
                !!tc && tc.passes === Math.ceil(J.chain.maxRings / FILL_TILE_RINGS) && tc.rings === J.chain.rings && tc.left === 0 &&
                n(/with the tile fill ([0-9.]+) ms/, l104) === at3(J.halfTile) && n(/with its history ([0-9.]+) ms/, l104) === at3(J.temporalTile),
                l104);
            // round 38 (section 106): the chain with the listed tile fill, the same sum with fillLTile; its check lists the tiles the CPU's
            // coverage of the pilot's scene has a light in (64 x 36: a 4 x 3 grid of tiles), in 12 passes; the rig's line carries both sums
            const ltSum = med(halfRow) + ["covHalf", "covFull", "fillLTile", "rest"].reduce((a, k) => a + st[k].ms, 0), l106 = rigLines(J)[6], lc6 = J.chain.ltileCheck;
            const pc = emitterRadiance(makeScene(...J.scene), J.chain.w, J.chain.h).cov, pT = new Set();
            for (let y = 0; y < J.chain.h; y++) for (let x = 0; x < J.chain.w; x++) if (pc[y * J.chain.w + x] > 0) pT.add(Math.floor(y / FILL_TILE_INNER) * Math.ceil(J.chain.w / FILL_TILE_INNER) + Math.floor(x / FILL_TILE_INNER));
            ok("  rounds 38, 43 and 44: the listed tile fill's chain on round 31's coverage (halfUnbound) is the half-size chain with fillLTile in the fill's place, by the wall clock, and with its history (temporalUnbound) the four passes more; its check lists the CPU's tiles in 12 passes; the rig's section 106 line carries both sums",
                !!J.halfUnbound && Math.abs(J.halfUnbound.ms - ltSum) < 1e-9 && st.fillLTile.clock === "wall" && st.wholeLTile.clock === "wall" &&
                !!J.temporalUnbound && Math.abs(J.temporalUnbound.ms - (ltSum + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 &&
                !!lc6 && lc6.passes === Math.ceil(J.chain.maxRings / FILL_TILE_RINGS) && lc6.rings === J.chain.rings && lc6.left === 0 && lc6.tiles === pT.size && lc6.of === 12 && lc6.tiles < lc6.of &&
                n(/with the listed tile fill ([0-9.]+) ms/, l106) === at3(J.halfUnbound) && n(/with its history ([0-9.]+) ms/, l106) === at3(J.temporalUnbound),
                l106);
            // round 39 (section 107): the page and the chain with the bounded coverage, their sums; its check bit for bit at both sizes
            // and its traced counts the CPU twin's within 2 %; the rig's line carries the sums
            const bc = J.chain.boundCheck, l107 = rigLines(J)[7], twinN = (ww, hh) => coverageMayHit(makeScene(...J.scene), ww, hh).reduce((a, b) => a + b, 0);
            const histT = ["hits", "shift", "accumT", "final"];   // round 55: the history's default accumulation is the tiled one
            const hb = med(halfRow) + ["covHalfB", "covFullB", "fillLTile", "restF"].reduce((a, k) => a + st[k].ms, 0), tH = twinN(J.chain.w, J.chain.h), tF = twinN(J.chain.W, J.chain.H);
            ok("  rounds 39, 44, 54 and 55: today's page and the chain, their defaults (full, half, temporal), are their sums with covHalfB and covFullB (the chain's with restF, its history's with accumT), each one pass on the coverage's clock; its check is round 31's bit for bit at both sizes, tracing the twin's count within 2 %; the rig's section 107 line carries the sums",
                !!J.half && Math.abs(J.half.ms - hb) < 1e-9 && Math.abs(J.full.ms - (med(fullRow) + st.covFullB.ms)) < 1e-9 &&
                Math.abs(J.temporal.ms - (hb + histT.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 && st.covHalfB.clock === st.covHalf.clock && st.covFullB.clock === st.covFull.clock &&
                !!bc && bc.sameHalf && bc.sameFull && Math.abs(bc.half - tH) <= Math.max(1, 0.02 * tH) && Math.abs(bc.full - tF) <= Math.max(1, 0.02 * tF) && bc.full < bc.ofFull / 4 &&
                n(/today's page with it ([0-9.]+) ms/, l107) === at3(J.full) && n(/the half-size chain with it ([0-9.]+) ms/, l107) === at3(J.half) && n(/with its history ([0-9.]+) ms/, l107) === at3(J.temporal),
                `${l107.slice(0, 260)}; twin ${tH} / ${tF}`);
            // round 42 (section 110): the split steps, one pass each on rest's own clock, and the line carrying each one's figure
            const l110 = rigLines(J)[8], split = ["restToT", "restEasu", "restComp", "restToTFree"];
            ok("  round 42: rest's three passes and the transfer's diagnostic, each timed alone as one pass on rest's own clock, and the rig's section 110 line carries each figure",
                split.every((k) => fine(st[k]) && st[k].clock === st.rest.clock && st[k].runs.length === st.rest.runs.length) &&
                JSON.stringify(["rest", ...split].map((k) => st[k].kernels)) === JSON.stringify([["toT", "easu", "comp"], ["toT"], ["easu"], ["comp"], ["toTFree"]]) &&
                split.every((k) => n(new RegExp(`${k} ([0-9.]+) ms`), l110) === at3(st[k])) && n(/rest ([0-9.]+) ms/, l110) === at3(st.rest),
                `${l110}; dispatched ${["rest", ...split].map((k) => `${k} ${(st[k].kernels || []).join("+")}`).join(", ")}`);
            // round 46 (section 115): the quad EASU and the fused pass, one pass each on rest's own clock, each dispatching its own
            // kernel alone, and the rig's section 115 line carrying each figure
            const l115 = rigLines(J)[9], q46 = ["restEasuQ", "restEasuComp"];
            ok("  round 46: EASU in quads and the fused pass are each one pass on rest's own clock, dispatching easuQ and easuC alone, and the rig's section 115 line carries each figure beside restEasu and restComp",
                q46.every((k) => fine(st[k]) && st[k].clock === st.rest.clock && st[k].runs.length === st.rest.runs.length) &&
                JSON.stringify(q46.map((k) => st[k].kernels)) === JSON.stringify([["easuQ"], ["easuC"]]) && /^section 115: /.test(l115 || "") &&
                ["restEasu", "restComp", ...q46].every((k) => n(new RegExp(`${k} ([0-9.]+) ms`), l115) === at3(st[k])),
                `${l115}; dispatched ${q46.map((k) => `${k} ${(st[k].kernels || []).join("+")}`).join(", ")}`);
            // round 48 (section 117): the tiled accumulation, one pass on the accumulation's own clock, and the line carrying both
            const l117 = rigLines(J)[10];
            ok("  round 48: the tiled accumulation is one pass on the accumulation's own clock, and the rig's section 117 line carries it beside accum",
                fine(st.accumT) && st.accumT.clock === st.accum.clock && st.accumT.runs.length === st.accum.runs.length && JSON.stringify(st.accumT.kernels) === '["accumT"]' && !st.accum.kernels && /^section 117: /.test(l117 || "") &&
                n(/accum ([0-9.]+) ms/, l117) === at3(st.accum) && n(/accumT ([0-9.]+) ms/, l117) === at3(st.accumT), l117);
            // round 54 (section 125): the fused rest, one frame on rest's own clock dispatching the transfer and the fused pass; the
            // three-pass chains its reference, the same sums with rest; the rig's section 125 line carrying each figure
            const l125 = rigLines(J)[11], two = med(halfRow) + ["covHalfB", "covFullB", "fillLTile", "rest"].reduce((a, k) => a + st[k].ms, 0);
            ok("  round 54: restF is one frame on rest's own clock dispatching toT and easuC; the three-pass chains (halfTwoPass, temporalTwoPass) are the defaults' sums with rest in restF's place; the rig's section 125 line carries each figure",
                fine(st.restF) && st.restF.clock === st.rest.clock && st.restF.runs.length === st.rest.runs.length && JSON.stringify(st.restF.kernels) === '["toT","easuC"]' &&
                !!J.halfTwoPass && Math.abs(J.halfTwoPass.ms - two) < 1e-9 && !!J.temporalTwoPass && Math.abs(J.temporalTwoPass.ms - (two + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 &&
                /^section 125: /.test(l125 || "") && n(/rest ([0-9.]+) ms/, l125) === at3(st.rest) && n(/restF ([0-9.]+) ms/, l125) === at3(st.restF) &&
                n(/the half-size chain fused ([0-9.]+) ms/, l125) === at3(J.half) && n(/, in three passes ([0-9.]+) ms; with/, l125) === at3(J.halfTwoPass) &&
                n(/with its history fused ([0-9.]+) ms/, l125) === at3(J.temporal) && n(/with its history fused [0-9.]+ ms, in three passes ([0-9.]+) ms/, l125) === at3(J.temporalTwoPass),
                `${l125}; restF dispatched ${(st.restF.kernels || []).join("+")}`);
            // round 55 (section 126): the chain with its history on the plain accumulation (temporalUntiled), the reference -- the
            // default's sum with accum in accumT's place; the rig's section 126 line carrying each figure
            const l126 = rigLines(J)[12];
            ok("  round 55: the chain with its history on the plain accumulation (temporalUntiled) is the default's sum with accum in accumT's place, and the rig's section 126 line carries accum, accumT and both chains",
                !!J.temporalUntiled && Math.abs(J.temporalUntiled.ms - (J.temporal.ms - st.accumT.ms + st.accum.ms)) < 1e-9 && Math.abs(J.temporalUntiled.ms - (hb + hist.reduce((a, k) => a + st[k].ms, 0))) < 1e-9 &&
                /^section 126: /.test(l126 || "") && n(/accum ([0-9.]+) ms/, l126) === at3(st.accum) && n(/accumT ([0-9.]+) ms/, l126) === at3(st.accumT) &&
                n(/with its history tiled ([0-9.]+) ms/, l126) === at3(J.temporal) && n(/untiled ([0-9.]+) ms/, l126) === at3(J.temporalUntiled),
                l126);
        }
        // ON A GPU, THE RIG'S SIZE (pre-registration section 93): 960 x 540 -> 1920 x 1080, every step a measured line the rig's
        // report keeps. Not on a software adapter: SwiftShader's 1080p would be minutes of a CPU's time that decides nothing.
        // SWEK_HALFCHAIN_RIGSIZE=1 runs it on any adapter -- how its plumbing was driven here once, on SwiftShader
        if (J && J.ladder.adapter.software && process.env.SWEK_HALFCHAIN_RIGSIZE !== "1") console.log(`  SKIP  the rig's size, 1920 x 1080: ${J.ladder.adapter.name} is a software adapter -- section 93 reads a GPU's`);
        else if (J) {
            const rg = await drive("1920x1080", 1500000);
            let K = null; try { K = JSON.parse(rg.result?.json || "null"); } catch {}
            const ks = K && K.chain && K.chain.steps;
            ok("!! section 93: at 1920 x 1080 the page timed both networks and every step of the chain, the fill reaching every pixel in its 96 rings -- and round 34's list fill the same, every listed pixel reached",
                rg.ok && !!ks && keys.every((k) => fine(ks[k])) && fine(K.networkFull) && fine(K.networkHalf) && !!K.full && !!K.half && !!K.temporal && !!K.halfRing && !!K.temporalRing && !!K.halfTile && !!K.temporalTile && !!K.halfList && !!K.temporalList && K.fill === "listedTile" && K.coverage === "bound" && K.rest === "fused" && K.accumulation === "tiled" && K.network === "shipped (asked by ?net=)" && !!K.fullUnbound && !!K.halfUnbound && K.chain.rings > 0 && K.chain.rings < 96 && !rg.pageErrors.length &&
                !!K.chain.listCheck && K.chain.listCheck.listed === K.chain.inView && K.chain.listCheck.rings === K.chain.rings && K.chain.listCheck.left === 0 &&
                !!K.chain.tileCheck && K.chain.tileCheck.rings === K.chain.rings && K.chain.tileCheck.left === 0 && K.chain.tileCheck.passes === 12 &&
                !!K.chain.ltileCheck && K.chain.ltileCheck.rings === K.chain.rings && K.chain.ltileCheck.left === 0 && K.chain.ltileCheck.passes === 12 && K.chain.ltileCheck.tiles > 0 && K.chain.ltileCheck.tiles < K.chain.ltileCheck.of &&
                !!K.chain.boundCheck && K.chain.boundCheck.sameHalf && K.chain.boundCheck.sameFull,
                rg.ok ? (rg.result?.status || "").slice(0, 200) : rg.reason);
            if (ks) {
                for (const l of rigLines(K)) say(l);
            }
        }
    }
}

console.log("\n5. SECTION 94: ROUND 31'S VERDICT, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // the commits that carry section 93 and that the rig ran: 1c60b346 brought it, 77aaece5 added one sentence to it
    const SECTION93_COMMITS = Object.freeze(["1c60b346", "77aaece5"]);
    const GPUS = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" };
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    // one report: its commit, every gate's verdict, and the two section-93 lines of the chain's gate, read back to numbers
    const readRun = (rep) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "";
        const step = (k) => ({ ms: num(new RegExp(`${k} ([0-9.]+) ms`), b), clock: (b.match(new RegExp(`${k} [0-9.]+ ms \\((\\w+)\\)`)) || [])[1] || null });
        return { commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok), adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null,
            kernels: (a.match(/kernels (\w+);/) || [])[1] || null,
            netFull: { ms: num(/1920 x 1080 ([0-9.]+) ms/, a), clock: (a.match(/1920 x 1080 [0-9.]+ ms \((\w+)\)/) || [])[1] || null },
            netHalf: { ms: num(/at 960 x 540 ([0-9.]+) ms/, a), clock: (a.match(/at 960 x 540 [0-9.]+ ms \((\w+)\)/) || [])[1] || null },
            full: num(/today's page \(network and mask\) ([0-9.]+) ms/, a), half: num(/the half-size chain ([0-9.]+) ms/, a), ratio: num(/ratio ([0-9.]+) x/, a),
            covHalf: step("covHalf"), covFull: step("covFull"), fill: step("fill"), rest: step("rest"), whole: step("whole"),
            rings: num(/; (\d+) of 96 rings filled/, b) };
    };
    // section 93's rule: a run counts when it is at a commit carrying section 93, every gate is green (C1), the fill reached every
    // pixel and filled on fewer than 96 rings (C2), and both networks are on the device's clock (C3); H holds on a GPU when both
    // its runs count and the ratio, re-made from the two times, is above 1.0 in each
    const counts = (r) => SECTION93_COMMITS.includes(r.commit) && r.allGreen && r.rings > 0 && r.rings < 96 && r.netFull.clock === "device" && r.netHalf.clock === "device" &&
        [r.full, r.half, r.ratio].every((v) => Number.isFinite(v) && v > 0) && Math.abs(r.full / r.half - r.ratio) < 0.002;
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.full / r.half > 1) ? "holds" : "fails") : "no verdict");
    const rule94 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "fsr2-temporal" : v.includes("no verdict") ? "owed again" : "name the steps"; };
    const R = {};
    for (const g of Object.keys(GPUS)) R[g] = ["a", "b"].map((k) => readRun(JSON.parse(fs.readFileSync(path.join(ENG, "render", `denoise-rig-r31-${k}-${g}.json`), "utf8"))));
    const all = Object.values(R).flat();
    ok("!! section 94: the four reports read back -- each at a commit carrying section 93, on its GPU's adapter and the page's kernel set for it, every gate green, the fill short of its 96 rings, both networks on the device's clock",
        Object.entries(R).every(([g, rs]) => rs.every((r) => counts(r) && r.adapter === GPUS[g] && r.kernels === (g === "gtx1080" ? "r18t" : "r18u"))),
        all.map((r) => `${r.adapter} ${r.commit}: ${r.kernels}, ${r.rings} rings, ratio ${r.ratio}`).join("; "));
    const slow = (rs, i) => rs.map((r, j) => (j === i ? { ...r, half: r.full * 1.01, ratio: Math.round(100000 / 1.01) / 100000 } : r));
    const stale = (rs) => rs.map((r, j) => (j === 0 ? { ...r, commit: "502091b1" } : r));
    // and a run whose fill used every ring: C2 then cannot say every pixel was reached (V4 went 0 RED before this fixture)
    const full96 = (rs) => rs.map((r, j) => (j === 0 ? { ...r, rings: 96 } : r));
    ok("!! *** section 94's rule, as section 93 fixed it: the chain cheaper than today's page in both runs on both GPUs -- so denoise-fsr2-temporal is the arc's next round ***",
        H(R["intel-gen9"]) === "holds" && H(R.gtx1080) === "holds" && rule94(R) === "fsr2-temporal" &&
        rule94({ ...R, gtx1080: slow(R.gtx1080, 1) }) === "name the steps" && rule94({ ...R, "intel-gen9": stale(R["intel-gen9"]) }) === "owed again" && rule94({ ...R, gtx1080: full96(R.gtx1080) }) === "owed again" && H(R.gtx1080.slice(0, 1)) === "no verdict",
        Object.entries(R).map(([g, rs]) => `${g}: ${rs.map((r) => (r.full / r.half).toFixed(3)).join(" and ")} x`).join("; "));
    // the predictions, read off the reports: they decided nothing, and section 94 says which held
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi);
    const I = R["intel-gen9"], N = R.gtx1080, cov = (r) => r.covHalf.ms + r.covFull.ms;
    const P = { ratio1080: within(N, (r) => r.ratio, 1.4, 3.0), ratioIntel: within(I, (r) => r.ratio, 2.0, 4.0), net1080: within(N, (r) => r.netHalf.ms, 18, 25),
                cov1080: within(N, cov, 1, 10), fill1080: within(N, (r) => r.fill.ms, 3, 15), rest1080: within(N, (r) => r.rest.ms, 1, 3), rings: all.every((r) => r.rings === 87) };
    ok("  section 94's account of section 93's predictions: the 1080's ratio, its half-size network, its last three passes and the 87 rings held; the Intel's ratio, and the 1080's coverage and fill, did not",
        P.ratio1080 && P.net1080 && P.rest1080 && P.rings && !P.ratioIntel && !P.cov1080 && !P.fill1080 && all.every((r) => r.fill.clock === "wall" && r.whole.clock === "wall" && r.covFull.clock === "device"),
        `Intel ratio ${I.map((r) => r.ratio).join(", ")} (2.0-4.0 predicted); 1080 coverage ${N.map((r) => cov(r).toFixed(1)).join(", ")} ms (1-10), fill ${N.map((r) => r.fill.ms).join(", ")} ms (3-15)`);
    // reported: what the chain's own steps cost against the half-size network they sit beside
    // the verdict's numbers, kept past the terminal (tools/ship/gateReport.mjs)
    REPORT.table("section 94: today's page against the half-size chain at 1920 x 1080, ms", ["GPU", "run", "today's page", "the chain", "ratio", "rings"],
        Object.entries(R).flatMap(([g, rs]) => rs.map((r, i) => [g, "ab"[i], r.full, r.half, r.ratio, r.rings])));
    for (const [g, rs] of Object.entries(R)) say(`section 94, ${g}: the network at 960 x 540 ${rs.map((r) => r.netHalf.ms.toFixed(1)).join(" / ")} ms; the chain's own steps (both coverages, the fill, the rest) ${rs.map((r) => (r.half - r.netHalf.ms).toFixed(1)).join(" / ")} ms -- reported, deciding nothing`);
}

console.log("\n6. ROUND 33: ROUND 32'S ACCUMULATION ON THE DEVICE, AGAINST render/denoiseTemporalUpscale.mjs");
{
    const { firstHits: hitsCPU, cameraPath } = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporal.mjs")).href);
    const { accumulateUpscaled, JITTER, halfShift } = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporalUpscale.mjs")).href);
    const { compositeEmitters } = await import(pathToFileURL(path.join(ENG, "render", "denoiseUpscale.mjs")).href);
    // the constants the accumulation kernel carries are round 4's, exactly (X7 -- the position tolerance at 30 -- went 0 RED before this
    // row: on a sequence of smooth spheres a looser tolerance turns no tap valid that 3 footprints did not)
    const RT = await import(pathToFileURL(path.join(ENG, "render", "denoiseTemporal.mjs")).href);
    ok("  round 33: the accumulation kernel's constants are render/denoiseTemporal.mjs's -- POS_TOL, NORMAL_DOT and FRAMES -- and its geometry is GEO_STRIDE floats a pixel",
        TEMPORAL_CONSTANTS.posTol === RT.POS_TOL && TEMPORAL_CONSTANTS.normalDot === RT.NORMAL_DOT && TEMPORAL_CONSTANTS.frames === RT.FRAMES && GEO_STRIDE === 8 && Object.isFrozen(TEMPORAL_CONSTANTS),
        JSON.stringify(TEMPORAL_CONSTANTS));
    const N = 64, S = makeScene("R", 990000), eyes = cameraPath(S).eyes, geo = eyes.map((e) => hitsCPU(S, e, N, N)), full = emitterRadiance(S, N, N);
    let sd2 = 77; const r2 = () => (sd2 = (sd2 * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    // each frame smooth light with grain, on its jittered grid -- the shape of an upscaled frame, cost and content aside
    const frames = eyes.map((_, f) => ({ y: Float64Array.from({ length: N * N * 3 }, (_, i) => 0.3 + 0.4 * ((i / 3 | 0) % N) / N + 0.1 * (i % 3) + 0.05 * r2()), shift: halfShift(JITTER[f]) }));
    const ref = accumulateUpscaled(frames, geo, N, N), refNo = accumulateUpscaled(frames, geo, N, N, { clamp: false }), refY = compositeEmitters(ref.A, full);
    const wireS = { scene: S.scene, eye: S.eye, look: S.look, up: S.up, fovDeg: S.fovDeg };
    const A = (x) => Array.from(x), g64 = geo.map((g) => ({ pos: A(g.pos), nrm: A(g.nrm), obj: A(g.obj) }));
    const pl = { S: wireS, eyes, N, frames: frames.map((f) => ({ y: A(f.y), shift: f.shift })), geo: g64, full: { cov: A(full.cov), E: A(full.E) } };
    const q = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 600000, args: { pl }, script: `async (a) => {
        const P = a.pl, { requestDevice } = await import("/gfx/device.js"), { DenoiseUpscaleGPU } = await import("/render/denoiseUpscaleGPU.mjs");
        const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
        const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true }), errs = [];
        if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
        const g = new DenoiseUpscaleGPU(dev), A = (x) => Array.from(x), fr = P.frames.map((f) => ({ y: Float64Array.from(f.y), shift: f.shift }));
        const hits = []; for (const e of [P.eyes[0], P.eyes[P.eyes.length - 1]]) { const h = await g.firstHits(P.S, e, P.N, P.N); hits.push({ pos: A(h.pos), nrm: A(h.nrm), obj: A(h.obj) }); }
        const geo = P.geo.map((x) => ({ pos: Float64Array.from(x.pos), nrm: Float64Array.from(x.nrm), obj: Int32Array.from(x.obj) })), full = { cov: Float64Array.from(P.full.cov), E: Float64Array.from(P.full.E) };
        const withCpuGeo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, full }), noClamp = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, clamp: false });
        const ownGeo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { full });
        const pk = (r) => ({ A: A(r.A), n: A(r.n), y: A(r.y) });
        // round 48 (section 117): the accumulation with its clamp read from a workgroup tile, against the kernel's own, bit for bit --
        // clamped and not on this fixture, and at 61 x 45 with the device's own hits, where the right and bottom tiles are partial
        const diff = (x, y) => { let d = 0; for (const k of ["A", "n", "y"]) for (let i = 0; i < x[k].length; i++) if (!Object.is(x[k][i], y[k][i])) d++; return d; };
        // round 55 (section 126): the tiled pass is the default, so the calls above run it and the plain pass is asked for by name
        const pl = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, full, tile: false }), plNo = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, clamp: false, tile: false });
        const tl = await g.accumulate(P.S, P.eyes, fr, P.N, P.N, { geo, full, tile: true });
        const W2 = 61, H2 = 45, fr2 = fr.map((f, k) => ({ y: Float64Array.from({ length: W2 * H2 * 3 }, (_, i) => 0.2 + 0.5 * ((i * 7 + k * 13) % 97) / 97), shift: f.shift }));
        const odd = await g.accumulate(P.S, P.eyes, fr2, W2, H2, { tile: false }), oddT = await g.accumulate(P.S, P.eyes, fr2, W2, H2, {});
        const tile48 = { clamped: diff(pl, withCpuGeo), unclamped: diff(plNo, noClamp), asked: diff(withCpuGeo, tl), odd: diff(odd, oddT), oddN: odd.A.length, clampBites: diff(withCpuGeo, noClamp),
                         kernels: [pl, withCpuGeo, noClamp, ownGeo, tl, odd, oddT].map((r) => r.kernel) };
        return { hits, withCpuGeo: pk(withCpuGeo), noClamp: pk(noClamp), ownGeo: pk(ownGeo), tile48, errs };
    }` });
    if (q.skipped) console.log("  SKIP  " + q.reason);
    else if (!q.ok) ok("!! round 33: the device ran the accumulation", false, `${q.reason || "no result"} ${JSON.stringify(q.pageErrors || []).slice(0, 300)}`);
    else {
        const Q = q.result;
        // FIRST HITS: an object index differing is a ray that went to another sphere; f32 against f64 can flip one at a silhouette.
        // First run on SwiftShader: no flip at either eye, position and normal within 1.7e-4 (relative to 1 + |x|) -- the ground is a
        // sphere of radius 100, and its ray-sphere arithmetic cancels in f32. Held at 1 in 1,000 pixels and 1e-3.
        const hitCmp = Q.hits.map((h, k) => { const c = geo[k ? geo.length - 1 : 0]; let flips = 0, worst = 0;
            for (let p = 0; p < N * N; p++) { if (h.obj[p] !== c.obj[p]) { flips++; continue; } if (c.obj[p] < 0) continue;
                for (let i = 0; i < 3; i++) worst = Math.max(worst, Math.abs(h.pos[p * 3 + i] - c.pos[p * 3 + i]) / (1 + Math.abs(c.pos[p * 3 + i])), Math.abs(h.nrm[p * 3 + i] - c.nrm[p * 3 + i])); }
            return { flips, worst }; });
        ok("!! round 33: the device's first hits are render/denoiseTemporal.mjs's -- the same sphere at all but 1 in 1,000 pixels, position and normal within 1e-3 where it agrees",
            !Q.errs.length && hitCmp.every((h) => h.flips <= N * N / 1000 && h.worst <= 1e-3), hitCmp.map((h, k) => `eye ${k ? "last" : "first"}: ${h.flips} flip(s), worst ${h.worst.toExponential(1)}`).join("; ") + (Q.errs.length ? "; " + Q.errs[0] : ""));
        // the history length n is a weighted sum of the taps' lengths, so it is fractional and f32 moves it: first run, within 3.1e-5
        // given the CPU's hits and 5.1e-5 with the device's own; the light within 5.5e-7 and 2.6e-6. Held at 1e-4 and 1e-5 / 1e-3.
        const cmp = (d, r) => { let nDiff = 0, worst = 0, nWorst = 0; for (let p = 0; p < N * N; p++) { nWorst = Math.max(nWorst, Math.abs(d.n[p] - r.n[p])); if (Math.abs(d.n[p] - r.n[p]) > 1e-4) nDiff++; for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(d.A[p * 3 + c] - r.A[p * 3 + c]) / (Math.abs(r.A[p * 3 + c]) + 1e-3)); } return { nDiff, worst, nWorst }; };
        const c1 = cmp(Q.withCpuGeo, ref), c0 = cmp(Q.noClamp, refNo), cOwn = cmp(Q.ownGeo, ref);
        const T48 = Q.tile48;
        ok("!! rounds 48 and 55: accumulate() asked nothing is the tiled accumulation, and it is { tile: false }'s plain pass bit for bit -- light, history length and composite -- clamped and not, asked for by name, and at 61 x 45 with partial tiles",
            !!T48 && T48.clamped === 0 && T48.unclamped === 0 && T48.asked === 0 && T48.odd === 0 && T48.oddN === 61 * 45 * 3 && T48.clampBites > 0 && !Q.errs.length &&
                T48.kernels.join() === "accum,accumT,accumT,accumT,accumT,accum,accumT",
            T48 ? `${T48.clamped} / ${T48.unclamped} / ${T48.asked} / ${T48.odd} values differ; the clamp moves ${T48.clampBites} values, so it is exercised; kernels ${T48.kernels.join(", ")}` : "no result");
        ok("!! round 33: given the CPU's first hits, the device's accumulation is accumulateUpscaled's -- the history length within 1e-4 at every pixel, the light within 1e-5, clamped and not",
            c1.nDiff === 0 && c1.worst <= 1e-5 && c0.nDiff === 0 && c0.worst <= 1e-5 && Q.noClamp.A.some((v, i) => Math.abs(v - Q.withCpuGeo.A[i]) > 1e-4),
            `clamped: ${c1.nDiff} n differ by over 1e-4 (worst ${c1.nWorst.toExponential(1)}), light worst ${c1.worst.toExponential(1)}; unclamped: ${c0.nDiff}, ${c0.worst.toExponential(1)}`);
        let yw = 0; for (let i = 0; i < refY.length; i++) yw = Math.max(yw, Math.abs(Q.withCpuGeo.y[i] - refY[i]) / (Math.abs(refY[i]) + 1e-3));
        ok("  ...and its composite is compositeEmitters on the accumulated light, within 1e-5", yw <= 1e-5, `worst ${yw.toExponential(1)}`);
        ok("  ...and with its own first hits the whole accumulation has at most 1 in 1,000 pixels with a history length off by over 1e-4, and the light within 1e-3",
            cOwn.nDiff <= N * N / 1000 && cOwn.worst <= 1e-3, `${cOwn.nDiff} of ${N * N} pixels' n differ by over 1e-4 (worst ${cOwn.nWorst.toExponential(1)}); light worst ${cOwn.worst.toExponential(1)}`);
    }
}

console.log("\n7. SECTION 98: ROUND 33'S VERDICT, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // the commit that carries section 97 and that the rig ran, all four runs. Section 98 owes the 1080 one run, in place of its run b:
    // when it arrives it is committed as received, read in here, and its commit -- a later one, carrying section 97 -- added
    const SECTION97_COMMITS = Object.freeze(["e5908338"]);
    const GPUS = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" }, HIST = ["hits", "shift", "accum", "final"];
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    // one report: its commit, every gate's verdict, and the chain gate's section-93 and section-97 lines, read back to numbers
    const readRun = (rep) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "", c = m.find((l) => /^section 97: /.test(l)) || "";
        const step = (k, t) => ({ ms: num(new RegExp(`${k} ([0-9.]+) ms`), t), clock: (t.match(new RegExp(`${k} [0-9.]+ ms \\((\\w+)\\)`)) || [])[1] || null });
        const red = rep.gates.filter((x) => !x.ok);
        return { commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && !red.length, red: red.map((x) => ({ gate: x.gate, fails: (x.fails || []).length, ms: x.ms })),
            chainGreen: !!g && g.ok, adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null, kernels: (a.match(/kernels (\w+);/) || [])[1] || null,
            netFull: step("1920 x 1080", a), netHalf: step("at 960 x 540", a), full: num(/today's page \(network and mask\) ([0-9.]+) ms/, a),
            half: num(/the half-size chain ([0-9.]+) ms/, a), temporal: num(/the half-size chain with its history ([0-9.]+) ms/, c), ratio: num(/ratio ([0-9.]+) x/, c),
            hist: Object.fromEntries(HIST.map((k) => [k, step(k, c)])), rings: num(/; (\d+) of 96 rings filled/, b) };
    };
    const histMs = (r) => HIST.reduce((s, k) => s + r.hist[k].ms, 0);
    // section 97's rule: a run counts when it is at a commit carrying section 97, every denoise gate is green (C1), the fill filled on
    // fewer than 96 rings (C2), and both networks and the history's four passes are on the device's clock (C3); H holds on a GPU when
    // both its runs count and full / temporal, re-made from the two times, is above 1.0 in each
    const counts = (r) => SECTION97_COMMITS.includes(r.commit) && r.allGreen && r.rings > 0 && r.rings < 96 && r.netFull.clock === "device" && r.netHalf.clock === "device" &&
        HIST.every((k) => r.hist[k].clock === "device" && Number.isFinite(r.hist[k].ms)) && [r.full, r.temporal, r.ratio].every((v) => Number.isFinite(v) && v > 0) && Math.abs(r.full / r.temporal - r.ratio) < 0.002;
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.full / r.temporal > 1) ? "holds" : "fails") : "no verdict");
    const rule98 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "the page carries the history" : v.includes("no verdict") ? "owed again" : "name the passes"; };
    const R = {};
    for (const g of Object.keys(GPUS)) R[g] = ["a", "b"].map((k) => readRun(JSON.parse(fs.readFileSync(path.join(ENG, "render", `denoise-rig-r33-${k}-${g}.json`), "utf8"))));
    const all = Object.values(R).flat(), [Na, Nb] = R.gtx1080;
    ok("!! section 98: the four reports read back -- each at the commit carrying section 97, on its GPU's adapter and kernel set, the chain's gate green with the fill short of its 96 rings and every network and history pass on the device's clock",
        Object.entries(R).every(([g, rs]) => rs.every((r) => SECTION97_COMMITS.includes(r.commit) && r.chainGreen && r.adapter === GPUS[g] && r.kernels === (g === "gtx1080" ? "r18t" : "r18u") && r.rings === 87 &&
            r.netFull.clock === "device" && r.netHalf.clock === "device" && HIST.every((k) => r.hist[k].clock === "device") && Math.abs(r.full / r.temporal - r.ratio) < 0.002)),
        all.map((r) => `${r.adapter} ${r.commit}: ${r.kernels}, ${r.rings} rings, ratio ${r.ratio}`).join("; "));
    // C1, as the reports have it: three runs all green; the 1080's run b red in the timing gate alone, with no FAIL line, 17.7 s in
    ok("!! section 98's C1: the Intel's two runs and the 1080's run a are green in every gate; the 1080's run b is red in render/denoiseTiming-selfcheck.mjs alone, with no FAIL line",
        R["intel-gen9"].every((r) => r.allGreen) && Na.allGreen && !Nb.allGreen && Nb.red.length === 1 && Nb.red[0].gate === "render/denoiseTiming-selfcheck.mjs" && Nb.red[0].fails === 0,
        `1080 run b: ${Nb.red.map((x) => `${x.gate} red after ${(x.ms / 1000).toFixed(1)} s, ${x.fails} FAIL line(s)`).join("; ")}`);
    const green = (r) => ({ ...r, allGreen: true }), slow = (r) => ({ ...r, temporal: r.full * 1.01, ratio: Math.round(100000 / 1.01) / 100000 });
    const stale = (r) => ({ ...r, commit: "1c60b346" }), wall = (r) => ({ ...r, hist: { ...r.hist, accum: { ...r.hist.accum, clock: "wall" } } }), full96 = (r) => ({ ...r, rings: 96 });
    ok("!! *** section 98's rule, as section 97 fixed it: H holds on the Intel; the 1080 has no verdict, its run b red -- so the 1080's run b is owed again ***",
        H(R["intel-gen9"]) === "holds" && H(R.gtx1080) === "no verdict" && rule98(R) === "owed again" &&
        rule98({ ...R, gtx1080: [Na, green(Nb)] }) === "the page carries the history" && rule98({ ...R, gtx1080: [Na, slow(green(Nb))] }) === "name the passes" &&
        rule98({ ...R, "intel-gen9": [stale(R["intel-gen9"][0]), R["intel-gen9"][1]] }) === "owed again" && H([wall(R["intel-gen9"][0]), R["intel-gen9"][1]]) === "no verdict" &&
        H([full96(R["intel-gen9"][0]), R["intel-gen9"][1]]) === "no verdict" && H(R["intel-gen9"].slice(0, 1)) === "no verdict",
        Object.entries(R).map(([g, rs]) => `${g}: ${rs.map((r) => (r.full / r.temporal).toFixed(3)).join(" and ")} x, ${H(rs)}`).join("; "));
    // the predictions, read off the reports: they decided nothing, and section 98 says which held. The 1080's run b is read for them
    // as a report, not as a run that counts
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi), I = R["intel-gen9"], N = R.gtx1080;
    const P = { ratio1080: within(N, (r) => r.ratio, 1.3, 1.5), ratioIntel: within(I, (r) => r.ratio, 1.25, 1.55), hist1080: within(N, histMs, 1, 4), histIntel: within(I, histMs, 15, 60), rings: all.every((r) => r.rings === 87) };
    ok("  section 98's account of section 97's predictions: both ratios and the 1080's history cost held, as did C2; the Intel's history cost did not, and C1 did not on the 1080",
        P.ratio1080 && P.ratioIntel && P.hist1080 && P.rings && !P.histIntel && !Nb.allGreen,
        `history passes: Intel ${I.map((r) => histMs(r).toFixed(1)).join(", ")} ms (15-60 predicted), 1080 ${N.map((r) => histMs(r).toFixed(2)).join(", ")} ms (1-4)`);
    REPORT.table("section 98: today's page against the chain with its history at 1920 x 1080, ms", ["GPU", "run", "today's page", "the chain with its history", "the history's passes", "ratio", "all gates green"],
        Object.entries(R).flatMap(([g, rs]) => rs.map((r, i) => [g, "ab"[i], r.full, r.temporal, histMs(r), r.ratio, r.allGreen ? "yes" : "no"])));
    for (const [g, rs] of Object.entries(R)) say(`section 98, ${g}: the history's four passes ${rs.map((r) => histMs(r).toFixed(2)).join(" / ")} ms, the accumulation ${rs.map((r) => r.hist.accum.ms.toFixed(2)).join(" / ")} of it; the chain without them ${rs.map((r) => (r.full / r.half).toFixed(3)).join(" / ")} x -- reported, deciding nothing`);
}

console.log("\n8. SECTION 100: ROUND 34'S VERDICT, AND SECTION 98'S OWED RUN, RE-DERIVED FROM THE REPORTS AS COMMITTED");
{
    // the commit that carries section 99, and the one section 98 pinned the 1080's owed run to
    const SECTION99_COMMITS = Object.freeze(["3abe4471"]), PINNED98 = "468766f9";
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const load = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
    const readRun = (rep, file) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "", d = m.find((l) => /^section 99: /.test(l)) || "";
        const clk = (re, t) => (t.match(re) || [])[1] || null;
        return { file, at: rep.at, commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok),
            red: rep.gates.filter((x) => !x.ok).map((x) => ({ gate: x.gate, fails: (x.fails || []).length, ms: x.ms, measured: (x.measured || []).length })),
            adapter: clk(/^section 93: ([^,]+),/, a), netClocks: [clk(/1920 x 1080 [0-9.]+ ms \((\w+)\)/, a), clk(/at 960 x 540 [0-9.]+ ms \((\w+)\)/, a)],
            rings: num(/; (\d+) of 96 rings filled/, b), has99: !!d, fill: num(/fill ([0-9.]+) ms \(wall\)/, d), fillList: num(/fillList ([0-9.]+) ms \(wall\)/, d),
            listed: num(/the list fill (\d+) listed/, d), listRings: num(/listed, (\d+) of 96 rings/, d), listLeft: num(/rings, (\d+) left/, d),
            ratioList: num(/with the list fill [0-9.]+ ms, ratio ([0-9.]+) x/, d), ratioListHist: num(/with its history [0-9.]+ ms, ratio ([0-9.]+) x/, d), ratio97: num(/^section 97: .*ratio ([0-9.]+) x/, m.find((l) => /^section 97: /.test(l)) || "") };
    };
    // section 99's rule: a run counts when it is at a commit carrying section 99, every denoise gate is green (C1), the ring fill
    // filled on fewer than 96 rings and the checked list fill reached every listed pixel in that count (C2), and both networks are
    // on the device's clock (C3); H holds on a GPU when both its runs count and fillList is below fill in each
    const counts = (r) => SECTION99_COMMITS.includes(r.commit) && r.allGreen && r.has99 && r.rings > 0 && r.rings < 96 && r.listLeft === 0 && r.listRings === r.rings && r.listed > 0 &&
        r.netClocks.every((c) => c === "device") && [r.fill, r.fillList].every((v) => Number.isFinite(v) && v > 0);
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.fillList < r.fill) ? "holds" : "fails") : "no verdict");
    const rule100 = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "the list fill becomes the chain's" : v.includes("no verdict") ? "owed again" : "the ring fill stays"; };
    const I = ["a", "b"].map((k) => readRun(load(`denoise-rig-r34-${k}-intel-gen9.json`), k));
    // the GTX 1080's reports after section 98, all at the pinned commit: b2, section 98's owed run, and two more that arrived named r34
    const N = [["b2", "denoise-rig-r33-b2-gtx1080.json"], ["extra-a", "denoise-rig-r33-extra-a-gtx1080.json"], ["extra-b", "denoise-rig-r33-extra-b-gtx1080.json"]].map(([k, f]) => readRun(load(f), k));
    const N99 = N.filter((r) => SECTION99_COMMITS.includes(r.commit));
    ok("!! section 100: the Intel's two round-34 runs read back -- at the commit carrying section 99, every gate green, the ring fill and the checked list fill both 87 rings, all 25,765 listed pixels reached, both networks on the device's clock",
        I.every((r) => counts(r) && r.adapter === "intel / gen-9" && r.rings === 87 && r.listRings === 87 && r.listed === 25765 && r.listLeft === 0),
        I.map((r) => `run ${r.file}: fill ${r.fill} ms, fillList ${r.fillList} ms, ${r.listed} listed, ${r.listRings} rings, ${r.listLeft} left`).join("; "));
    ok("!! ...and the GTX 1080 has no run at a commit carrying section 99: its three reports since section 98 are all at 468766f9, and none carries a section 99 line",
        N99.length === 0 && N.every((r) => r.commit === PINNED98 && !r.has99), N.map((r) => `${r.file}: ${r.commit}, ${r.has99 ? "a" : "no"} section 99 line`).join("; "));
    // and a run with a red gate, the 1080's own failure (Z2 -- C1 dropped -- went 0 RED before this fixture: both Intel runs are green)
    const slow = (r) => ({ ...r, fillList: r.fill * 1.01 }), stale = (r) => ({ ...r, commit: "e5908338" }), short = (r) => ({ ...r, listLeft: 3 }), offby = (r) => ({ ...r, listRings: r.rings + 1 });
    const redGate = (r) => ({ ...r, allGreen: false });
    ok("!! *** section 100's rule, as section 99 fixed it: H holds on the Intel; the 1080 has no verdict, with no run -- so round 34 is owed on the 1080 ***",
        H(I) === "holds" && H(N99) === "no verdict" && rule100({ "intel-gen9": I, gtx1080: N99 }) === "owed again" &&
        rule100({ "intel-gen9": I, gtx1080: I }) === "the list fill becomes the chain's" && rule100({ "intel-gen9": [I[0], slow(I[1])], gtx1080: I }) === "the ring fill stays" &&
        H([stale(I[0]), I[1]]) === "no verdict" && H([short(I[0]), I[1]]) === "no verdict" && H([offby(I[0]), I[1]]) === "no verdict" && H([I[0], redGate(I[1])]) === "no verdict",
        `Intel: ${I.map((r) => (r.fill / r.fillList).toFixed(1)).join(" and ")} x faster, ${H(I)}; GTX 1080: ${N99.length} runs, ${H(N99)}`);
    // SECTION 98's OWED RUN: the 1080's first report at the pinned commit after section 98 -- by its start time, b2. Section 98 fixed
    // that if its timing gate died again the 1080 keeps no verdict and the next round is the crash. A later green run at the same
    // commit is not the owed run: reading it in would be choosing the run after the data (section 76).
    const owed = [...N].sort((x, y) => String(x.at).localeCompare(String(y.at)))[0], tg = (r) => r.red.find((x) => x.gate === "render/denoiseTiming-selfcheck.mjs");
    const verdict98 = (o) => (o.allGreen ? "read H off run a and the owed run" : tg(o) ? "no verdict -- the crash is next" : "no verdict");
    ok("!! *** section 98's owed run is b2, and its timing gate died again -- so the 1080 keeps no verdict for round 33, and round 35 is the crash ***",
        owed.file === "b2" && !owed.allGreen && !!tg(owed) && tg(owed).fails === 0 && verdict98(owed) === "no verdict -- the crash is next" &&
        N.find((r) => r.file === "extra-a").allGreen && verdict98({ ...owed, allGreen: true, red: [] }) === "read H off run a and the owed run",
        `b2 (${owed.at}): ${owed.red.map((x) => `${x.gate.split("/").pop()} red after ${(x.ms / 1000).toFixed(1)} s, ${x.fails} FAIL, ${x.measured} measured line(s)`).join("; ")}`);
    // the predictions, read off the reports: the Intel's held; the 1080's were not reached
    const within = (rs, f, lo, hi) => rs.every((r) => f(r) >= lo && f(r) <= hi);
    ok("  section 100's account of section 99's predictions: on the Intel the list fill was inside 15-80 ms and the chain 1.8-2.2 x against today's page, as predicted; on the 1080 none was reached",
        within(I, (r) => r.fillList, 15, 80) && within(I, (r) => r.ratioList, 1.8, 2.2) && N99.length === 0,
        `Intel fillList ${I.map((r) => r.fillList).join(", ")} ms, full / halfList ${I.map((r) => r.ratioList).join(", ")} x, with its history ${I.map((r) => r.ratioListHist).join(", ")} x`);
    REPORT.table("section 100: the ring fill against the list fill at 960 x 540, ms", ["GPU", "run", "ring fill", "list fill", "listed", "rings", "left", "chain ratio with the list fill"],
        I.map((r) => ["intel-gen9", r.file, r.fill, r.fillList, r.listed, r.listRings, r.listLeft, r.ratioList]));
    // reported: the timing gate on the 1080 since round 33, run by realGpuRun
    const all1080 = [["a", "denoise-rig-r33-a-gtx1080.json"], ["b", "denoise-rig-r33-b-gtx1080.json"]].map(([k, f]) => readRun(load(f), k)).concat(N);
    say(`section 100, gtx1080: the timing gate died in ${all1080.filter((r) => tg(r)).length} of ${all1080.length} realGpuRun runs (${all1080.filter((r) => tg(r)).map((r) => `${r.file} at ${(tg(r).ms / 1000).toFixed(1)} s`).join(", ")}), each with no FAIL line, and once more run alone -- reported, deciding nothing`);
}

console.log("\n9. SECTION 102: ROUND 35'S CRASH RUNS AND ROUND 34 ON THE GTX 1080, RE-DERIVED FROM THE FILES AS COMMITTED");
{
    // section 101 named the 1080's round-34 runs as its step 2, at the branch head it was run from; bc6fbed2 carries sections 99-101
    const SECTION99_COMMITS = Object.freeze(["3abe4471", "bc6fbed2"]), ROUND35_COMMIT = "bc6fbed2";
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const rd = (f) => fs.readFileSync(path.join(ENG, "render", f), "utf8");
    const readRun = (rep, file) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", b = m.find((l) => /^section 93: the chain's steps/.test(l)) || "", d = m.find((l) => /^section 99: /.test(l)) || "";
        const tg = rep.gates.find((x) => x.gate === "render/denoiseTiming-selfcheck.mjs") || {};
        const clk = (re, t) => (t.match(re) || [])[1] || null;
        return { file, commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok),
            exits: rep.gates.map((x) => (x.exit ? x.exit.status : undefined)), adapter: clk(/^section 93: ([^,]+),/, a),
            netClocks: [clk(/1920 x 1080 [0-9.]+ ms \((\w+)\)/, a), clk(/at 960 x 540 [0-9.]+ ms \((\w+)\)/, a)], rings: num(/; (\d+) of 96 rings filled/, b),
            fill: num(/fill ([0-9.]+) ms \(wall\)/, d), fillList: num(/fillList ([0-9.]+) ms \(wall\)/, d), listed: num(/the list fill (\d+) listed/, d),
            listRings: num(/listed, (\d+) of 96 rings/, d), listLeft: num(/rings, (\d+) left/, d), ratioList: num(/with the list fill [0-9.]+ ms, ratio ([0-9.]+) x/, d),
            r27wNative: num(/^native r27w: 1920 x 1080: ([0-9.]+) ms a pass/, (tg.measured || []).find((l) => /^native r27w: 1920 x 1080:/.test(l)) || ""),
            r27wPage: num(/^page r27w: 1920 x 1080: ([0-9.]+) ms a pass/, (tg.measured || []).find((l) => /^page r27w: 1920 x 1080:/.test(l)) || "") };
    };
    // section 99's rule, unchanged: at a commit carrying it, every gate green (C1), the ring fill short of 96 rings and the checked list
    // fill reaching every listed pixel in the same count (C2), both networks on the device's clock (C3); H: fillList below fill in both runs
    const counts = (r) => SECTION99_COMMITS.includes(r.commit) && r.allGreen && r.rings > 0 && r.rings < 96 && r.listLeft === 0 && r.listRings === r.rings && r.listed > 0 &&
        r.netClocks.every((c) => c === "device") && [r.fill, r.fillList].every((v) => Number.isFinite(v) && v > 0);
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.fillList < r.fill) ? "holds" : "fails") : "no verdict");
    const rule = (byGpu) => { const v = Object.values(byGpu).map(H); return v.every((x) => x === "holds") ? "the list fill becomes the chain's" : v.includes("no verdict") ? "owed again" : "the ring fill stays"; };
    const R = { "intel-gen9": ["a", "b"].map((k) => readRun(JSON.parse(rd(`denoise-rig-r34-${k}-intel-gen9.json`)), k)),
                gtx1080: ["a", "b"].map((k) => readRun(JSON.parse(rd(`denoise-rig-r34-${k}-gtx1080.json`)), k)) };
    const N = R.gtx1080;
    ok("!! section 102: the GTX 1080's round-34 runs read back -- at bc6fbed2, every gate green with exit 0, both fills 87 rings, all 25,765 listed pixels reached, both networks on the device's clock",
        N.every((r) => r.commit === ROUND35_COMMIT && counts(r) && r.adapter === "nvidia / pascal" && r.exits.every((e) => e === 0) && r.rings === 87 && r.listRings === 87 && r.listed === 25765),
        N.map((r) => `run ${r.file}: fill ${r.fill} ms, fillList ${r.fillList} ms, exits ${r.exits.join("/")}`).join("; "));
    const slow = (r) => ({ ...r, fillList: r.fill }), red = (r) => ({ ...r, allGreen: false });
    ok("!! *** section 102's rule, as section 99 fixed it: H holds on both GPUs -- so the list fill becomes the chain's fill: backlog denoise-listfill-default ***",
        H(R["intel-gen9"]) === "holds" && H(N) === "holds" && rule(R) === "the list fill becomes the chain's" &&
        rule({ ...R, gtx1080: [N[0], slow(N[1])] }) === "the ring fill stays" && rule({ ...R, gtx1080: [N[0], red(N[1])] }) === "owed again",
        `the 1080's list fill ${N.map((r) => (100 * (1 - r.fillList / r.fill)).toFixed(1) + " %").join(" and ")} below its ring fill; the Intel's ${R["intel-gen9"].map((r) => (r.fill / r.fillList).toFixed(1) + " x").join(" and ")} faster`);
    ok("  section 102's account of section 99's 1080 predictions: the list fill was NOT 1-6 ms, and the chain was NOT 1.9-2.3 x -- both missed",
        N.every((r) => r.fillList > 6) && N.every((r) => r.ratioList < 1.9),
        `fillList ${N.map((r) => r.fillList).join(", ")} ms; full / halfList ${N.map((r) => r.ratioList).join(", ")} x`);
    // ROUND 35: the three solo runs (the console and their traces) and the two realGpuRun runs' timing gates
    const con = rd("denoise-rig-r35-console-gtx1080.txt").replace(/\r/g, "");
    const levels = [...con.matchAll(/echo %ERRORLEVEL%\n(-?\d+)\n/g)].map((m) => Number(m[1])), greens = (con.match(/^ALL GREEN \(\d+ ms\)$/gm) || []).length;
    const tr = (k) => rd(`denoise-rig-r35-trace-${k}-gtx1080.txt`).split("\n").filter(Boolean);
    const whole = (t) => t.some((l) => /native: the ladder returned$/.test(l)) && /the gate ends, 0 fail\(s\)$/.test(t[t.length - 1] || "");
    const solo = ["alone-1", "alone-2", "alone-3"].map(tr), pair = ["r34-a", "r34-b"].map(tr);
    const deaths = levels.filter((v) => v !== 0).length + N.filter((r) => !r.exits.every((e) => e === 0)).length;
    ok("!! *** section 102, round 35: no run died -- three solo timing-gate runs exit 0 and ALL GREEN with whole traces, and both realGpuRun runs' gates exit 0 -- so the crash is NOT REPRODUCED ***",
        con.includes(`HEAD -> ccr-6c3eeb7c-pxz6kx`) && con.includes(ROUND35_COMMIT) && levels.length === 3 && greens === 3 && deaths === 0 && solo.every(whole),
        `exit codes ${levels.join(", ")}; ${greens} ALL GREEN; solo traces ${solo.map((t) => t.length + " lines").join(", ")}, each to "the gate ends, 0 fail(s)"`);
    // reported, not deciding: the one trace that is not whole as received, though its gate (which reads it) passed; and r27w's stall
    ok("  ...and the one trace that is not whole is named: r34-a's ends mid-ladder as received, while that run's timing gate -- whose own row reads the trace to its end -- passed",
        !whole(pair[0]) && whole(pair[1]) && /native 1920x1080: round 2 time r27w$/.test(pair[0][pair[0].length - 1]) && N[0].allGreen,
        `r34-a: ${pair[0].length} lines, last "${pair[0][pair[0].length - 1]}"; r34-b: ${pair[1].length} lines, whole`);
    say(`section 102, gtx1080: r27w at 1920 x 1080 -- native ${N.map((r) => r.r27wNative).join(" / ")} ms a pass, page ${N.map((r) => r.r27wPage).join(" / ")} ms (about 250 ms is its usual reading) -- reported, deciding nothing`);
    REPORT.table("section 102: round 34 on both GPUs, the ring fill against the list fill at 960 x 540, ms", ["GPU", "run", "ring fill", "list fill", "chain ratio with the list fill", "all gates green"],
        Object.entries(R).flatMap(([g, rs]) => rs.map((r) => [g, r.file, r.fill, r.fillList, r.ratioList, r.allGreen ? "yes" : "no"])));
}

console.log("\n10. SECTION 105: ROUND 37'S TILE FILL ON BOTH GPUS, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // section 104 was carried by 49e124cb and 3d2ae54c; 49e124cb's module did not load (its kernel comment closed the WGSL template),
    // so no gate at it could pass and only 3d2ae54c, the rig's commit, can count
    const SECTION104_COMMITS = Object.freeze(["3d2ae54c"]);
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const rd = (f) => fs.readFileSync(path.join(ENG, "render", f), "utf8");
    const readRun = (rep, file) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const e = m.find((l) => /^section 104: /.test(l)) || "", a = m.find((l) => /^section 93: .*kernels/.test(l)) || "";
        return { file, commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok && x.exit && x.exit.status === 0),
            adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null,
            fillList: num(/fillList ([0-9.]+) ms \(wall\)/, e), fillTile: num(/fillTile ([0-9.]+) ms \(wall\)/, e),
            passes: num(/the tile fill (\d+) passes/, e), tileRings: num(/passes, (\d+) of 96 rings/, e), tileLeft: num(/of 96 rings, (\d+) left/, e),
            listRings: num(/^section 93: the chain's steps.*; (\d+) of 96 rings filled/, m.find((l) => /^section 93: the chain's steps/.test(l)) || ""),
            ratioTile: num(/with the tile fill [0-9.]+ ms, ratio ([0-9.]+) x/, e), ratioList: num(/^section 103: .*the half-size chain [0-9.]+ ms, ratio ([0-9.]+) x/, m.find((l) => /^section 103: /.test(l)) || "") };
    };
    // section 104's rule: at its commit, every gate green with exit 0 (C1); the tile fill's rings the list fill's, none left, in 12 passes (C2);
    // H37 on a GPU when, in both runs, fillTile <= 0.9 x fillList
    const counts = (r) => SECTION104_COMMITS.includes(r.commit) && r.allGreen && r.tileLeft === 0 && r.tileRings === r.listRings && r.tileRings > 0 && r.passes === 12 &&
        [r.fillList, r.fillTile].every((v) => Number.isFinite(v) && v > 0);
    const H = (runs) => (runs.length === 2 && runs.every(counts) ? (runs.every((r) => r.fillTile <= 0.9 * r.fillList) ? "holds" : "fails") : "no verdict");
    const rule = (byGpu) => {
        const h = { intel: H(byGpu["intel-gen9"]), nv: H(byGpu.gtx1080) };
        if (Object.values(h).includes("no verdict")) return "owed again";
        if (h.nv === "holds" && byGpu["intel-gen9"].every((r) => r.fillTile <= r.fillList)) return "the tile fill becomes the default";
        const n = Object.values(h).filter((x) => x === "holds").length;
        return n === 1 ? "one GPU only: reported, the fill per adapter to the backlog" : n === 0 ? "neither: a measured negative, the 1080's fill lever closed" : "the tile fill becomes the default";
    };
    const R = Object.fromEntries(["intel-gen9", "gtx1080"].map((g) => [g, ["a", "b"].map((k) => readRun(JSON.parse(rd(`denoise-rig-r37-${k}-${g}.json`)), k))]));
    const GPU = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" };
    ok("!! section 105: the four reports read back -- each at 3d2ae54c on its GPU, every gate green with exit 0, the tile fill 87 rings in 12 passes with none left, as the list fill's",
        Object.entries(R).every(([g, rs]) => rs.every((r) => counts(r) && r.adapter === GPU[g] && r.tileRings === 87)),
        Object.entries(R).map(([g, rs]) => rs.map((r) => `${g} ${r.file}: list ${r.fillList} ms, tile ${r.fillTile} ms (${(r.fillTile / r.fillList).toFixed(3)} x)`).join("; ")).join("; "));
    const v = rule(R);
    // the rule's own fixtures: a run at another commit, or with a pixel left, leaves it owed; a 1080 short of 10 % is no hold; an Intel
    // whose tile fill is no slower in both runs, though short of 10 %, lets the 1080's hold make it the default
    const shift = (k, f) => ({ ...R, [k]: R[k].map((r, i) => (i === 1 ? f(r) : r)) });
    const fx = [rule(shift("gtx1080", (r) => ({ ...r, commit: "468766f9" }))), rule(shift("gtx1080", (r) => ({ ...r, tileLeft: 3 }))),
                rule(shift("gtx1080", (r) => ({ ...r, fillTile: 0.95 * r.fillList }))), rule({ ...R, "intel-gen9": R["intel-gen9"].map((r) => ({ ...r, fillTile: 0.95 * r.fillList })) })];
    ok("!! *** section 105, by section 104's rule: H37 HOLDS ON THE GTX 1080 AND FAILS ON THE INTEL -- one GPU only, so the default stays the list fill and the fill per adapter goes to the backlog ***",
        H(R.gtx1080) === "holds" && H(R["intel-gen9"]) === "fails" && v === "one GPU only: reported, the fill per adapter to the backlog" &&
        fx[0] === "owed again" && fx[1] === "owed again" && fx[2] === "neither: a measured negative, the 1080's fill lever closed" && fx[3] === "the tile fill becomes the default",
        `1080 ${H(R.gtx1080)}, Intel ${H(R["intel-gen9"])} -> ${v}; fixtures: ${fx.join(" | ")}`);
    // the predictions, stated so they could miss: the 1080 2-10 ms (missed); the Intel 10-60 ms "could cost", no call on H37 (outside it)
    const nv = R.gtx1080.map((r) => r.fillTile), it = R["intel-gen9"].map((r) => r.fillTile);
    ok("  ...and section 104's predictions are read as made: the 1080's tile fill MISSED its 2-10 ms in both runs, and the Intel's fell outside the 10-60 ms it could cost",
        nv.every((x) => !(x >= 2 && x <= 10)) && it.every((x) => !(x >= 10 && x <= 60)),
        `1080 ${nv.join(" / ")} ms against 2-10; Intel ${it.join(" / ")} ms against 10-60`);
    say(`section 105: the half-size chain against today's page with the tile fill -- 1080 ${R.gtx1080.map((r) => r.ratioTile).join(" / ")} x, with the list fill ${R.gtx1080.map((r) => r.ratioList).join(" / ")} x; Intel ${R["intel-gen9"].map((r) => r.ratioTile).join(" / ")} x, with the list fill ${R["intel-gen9"].map((r) => r.ratioList).join(" / ")} x -- reported, deciding nothing`);
    REPORT.table("section 105: round 37 on both GPUs, the list fill against the tile fill at 960 x 540, ms", ["GPU", "run", "list fill", "tile fill", "tile / list", "chain ratio, tile", "chain ratio, list"],
        Object.entries(R).flatMap(([g, rs]) => rs.map((r) => [g, r.file, r.fillList, r.fillTile, Number((r.fillTile / r.fillList).toFixed(3)), r.ratioTile, r.ratioList])));
}

console.log("\n11. SECTION 111: ROUNDS 38, 39 AND 42 ON BOTH GPUS, RE-DERIVED FROM THE FOUR REPORTS AS COMMITTED");
{
    // the rig ran ce1cca35, which carries sections 106-110 (first carried by 2721c3ac, 3d3f8bc7 and ce1cca35); only the rig's commit counts
    const RIG_COMMITS = Object.freeze(["ce1cca35"]);
    const num = (re, t) => { const m = t.match(re); return m ? Number(m[1]) : null; };
    const rd = (f) => fs.readFileSync(path.join(ENG, "render", f), "utf8");
    const readRun = (rep, file) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const line = (n) => m.find((l) => l.startsWith(`section ${n}: `)) || "", e = line(106), c = line(107), r = line(110);
        const a = m.find((l) => /^section 93: .*kernels/.test(l)) || "", st = m.find((l) => /^section 93: the chain's steps/.test(l)) || "";
        const dev = (k, t) => num(new RegExp(`\\b${k} ([0-9.]+) ms \\(device\\)`), t);
        return { file, commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok && x.exit && x.exit.status === 0),
            adapter: (a.match(/^section 93: ([^,]+),/) || [])[1] || null, listRings: num(/; (\d+) of 96 rings filled/, st),
            fillList: num(/fillList ([0-9.]+) ms \(wall\)/, e), fillLTile: num(/fillLTile ([0-9.]+) ms \(wall\)/, e),
            tiles: num(/the listed tile fill (\d+) of 2040 tiles/, e), passes: num(/ tiles, (\d+) passes/, e), rings: num(/passes, (\d+) of 96 rings/, e), left: num(/of 96 rings, (\d+) left/, e),
            covHalf: dev("covHalf", c), covHalfB: dev("covHalfB", c), covFull: dev("covFull", c), covFullB: dev("covFullB", c),
            tracedFull: num(/ and (\d+) of 2073600;/, c), tracedHalf: num(/traced (\d+) of 518400/, c), same: /; bit for bit at both sizes;/.test(c),
            ratioBound: num(/the half-size chain with it [0-9.]+ ms, ratio ([0-9.]+) x/, c),
            rest: dev("rest", r), toT: dev("restToT", r), easu: dev("restEasu", r), comp: dev("restComp", r), toTFree: dev("restToTFree", r) };
    };
    const R = Object.fromEntries(["intel-gen9", "gtx1080"].map((g) => [g, ["a", "b"].map((k) => readRun(JSON.parse(rd(`denoise-rig-r42-${k}-${g}.json`)), k))]));
    const GPU = { "intel-gen9": "intel / gen-9", gtx1080: "nvidia / pascal" };
    const c1 = (r) => RIG_COMMITS.includes(r.commit) && r.allGreen;
    ok("!! section 111: the four reports read back -- each at ce1cca35 on its GPU, every gate green with exit 0, and the section 106, 107 and 110 lines whole",
        Object.entries(R).every(([g, rs]) => rs.every((r) => c1(r) && r.adapter === GPU[g] && [r.fillList, r.fillLTile, r.covFull, r.covFullB, r.rest, r.toT, r.easu, r.comp, r.toTFree].every((v) => Number.isFinite(v) && v > 0))),
        Object.entries(R).map(([g, rs]) => rs.map((r) => `${g} ${r.file}: ${r.commit}, ${r.adapter}`).join("; ")).join("; "));

    // H38 (section 106): C2 the listed tile fill reaches the list fill's rings, 0 left, 12 passes, 123 tiles; holds when fillLTile <= 0.9 x fillList in both runs
    const counts38 = (r) => c1(r) && r.left === 0 && r.rings === r.listRings && r.rings > 0 && r.passes === 12 && r.tiles === 123;
    const H38 = (runs) => (runs.length === 2 && runs.every(counts38) ? (runs.every((r) => r.fillLTile <= 0.9 * r.fillList) ? "holds" : "fails") : "no verdict");
    const rule38 = (byGpu) => { const h = [H38(byGpu["intel-gen9"]), H38(byGpu.gtx1080)]; const n = h.filter((x) => x === "holds").length;
        return h.includes("no verdict") ? "owed again" : n === 2 ? "the listed tile fill becomes the default; the fill per adapter closes unbuilt" : n === 1 ? "the fill per adapter goes ahead" : "a measured negative; the fill per adapter goes ahead on round 37's figures"; };
    const shift = (D, k, f) => ({ ...D, [k]: D[k].map((r, i) => (i === 1 ? f(r) : r)) });
    const fx38 = [rule38(shift(R, "gtx1080", (r) => ({ ...r, left: 2 }))), rule38(shift(R, "intel-gen9", (r) => ({ ...r, fillLTile: 0.95 * r.fillList }))),
                  rule38({ "intel-gen9": R["intel-gen9"].map((r) => ({ ...r, fillLTile: r.fillList })), gtx1080: R.gtx1080.map((r) => ({ ...r, fillLTile: r.fillList })) })];
    ok("!! *** section 111, by section 106's rule: H38 HOLDS ON BOTH GPUS -- the listed tile fill 87 rings in 12 passes over 123 tiles, none left, at 0.55-0.84 x the list fill -- so it becomes the default as denoise-listedtile-default, and the fill per adapter closes unbuilt ***",
        H38(R["intel-gen9"]) === "holds" && H38(R.gtx1080) === "holds" && rule38(R) === "the listed tile fill becomes the default; the fill per adapter closes unbuilt" &&
        fx38[0] === "owed again" && fx38[1] === "the fill per adapter goes ahead" && fx38[2] === "a measured negative; the fill per adapter goes ahead on round 37's figures",
        `${Object.entries(R).map(([g, rs]) => `${g} ${rs.map((r) => `${r.fillLTile} / ${r.fillList} = ${(r.fillLTile / r.fillList).toFixed(3)}`).join(", ")}`).join("; ")}; fixtures: ${fx38.join(" | ")}`);
    ok("  ...and section 106's predictions are read as made: the 1080's 2-8 ms and the Intel's 5-15 ms both MISSED in both runs (17-19 ms on each); H38 held on both, as predicted",
        R.gtx1080.every((r) => !(r.fillLTile >= 2 && r.fillLTile <= 8)) && R["intel-gen9"].every((r) => !(r.fillLTile >= 5 && r.fillLTile <= 15)),
        `1080 ${R.gtx1080.map((r) => r.fillLTile).join(" / ")} ms against 2-8; Intel ${R["intel-gen9"].map((r) => r.fillLTile).join(" / ")} ms against 5-15`);

    // H39 (section 107): C2 bit for bit at both sizes and 106,709 +- 2 % traced at 1920 x 1080; C3 every coverage on the device's clock
    // (readRun reads only "(device)" figures, so a wall-clock one is null); holds when covFullB <= 0.5 x covFull in both runs
    const counts39 = (r) => c1(r) && r.same && Math.abs(r.tracedFull - 106709) <= 0.02 * 106709 && [r.covHalf, r.covHalfB, r.covFull, r.covFullB].every((v) => Number.isFinite(v) && v > 0);
    const H39 = (runs) => (runs.length === 2 && runs.every(counts39) ? (runs.every((r) => r.covFullB <= 0.5 * r.covFull) ? "holds" : "fails") : "no verdict");
    const fx39 = [H39(R.gtx1080.map((r, i) => (i ? { ...r, same: false } : r))), H39(R.gtx1080.map((r, i) => (i ? { ...r, tracedFull: 100000 } : r))),
                  H39(R.gtx1080.map((r, i) => (i ? { ...r, covFull: null } : r))), H39(R.gtx1080.map((r, i) => (i ? { ...r, covFullB: 0.6 * r.covFull } : r)))];
    ok("!! *** section 111, by section 107's rule: H39 HOLDS ON BOTH GPUS -- the bounded coverage bit for bit at both sizes, on the device's clock, at 0.07-0.09 x round 31's at 1920 x 1080 -- so it becomes the chain's and the page's mask as denoise-coverage-bound-default, and the coverage lever closes ***",
        H39(R["intel-gen9"]) === "holds" && H39(R.gtx1080) === "holds" && fx39.slice(0, 3).every((x) => x === "no verdict") && fx39[3] === "fails",
        `${Object.entries(R).map(([g, rs]) => `${g} ${rs.map((r) => `${r.covFullB} / ${r.covFull} = ${(r.covFullB / r.covFull).toFixed(3)}, traced ${r.tracedFull}`).join(", ")}`).join("; ")}; fixtures: ${fx39.join(" | ")}`);
    const inR = (v, a, b) => v >= a && v <= b;
    ok("  ...and section 107's predictions are read as made: all four MET in both runs -- the Intel's covFullB in 10-40 ms and covHalfB in 3-15, the 1080's in 1-4 and 0.3-1.5",
        R["intel-gen9"].every((r) => inR(r.covFullB, 10, 40) && inR(r.covHalfB, 3, 15)) && R.gtx1080.every((r) => inR(r.covFullB, 1, 4) && inR(r.covHalfB, 0.3, 1.5)),
        Object.entries(R).map(([g, rs]) => `${g} full ${rs.map((r) => r.covFullB).join(" / ")}, half ${rs.map((r) => r.covHalfB).join(" / ")}`).join("; "));
    // reported, deciding nothing: the Intel traced 106,622 and 26,994 where the twin traces 106,709 and 27,023 -- 87 and 29 pixels fewer,
    // bit for bit all the same, so every pixel it skipped and the twin traced had no ray meeting a light; the 1080 traced the twin's counts
    ok("  ...and the traced counts are named: the 1080 traced exactly the twin's 106,709 and 27,023 in both runs; the Intel 87 and 29 fewer, bit for bit all the same",
        R.gtx1080.every((r) => r.tracedFull === 106709 && r.tracedHalf === 27023) && R["intel-gen9"].every((r) => r.tracedFull === 106622 && r.tracedHalf === 26994 && r.same),
        Object.entries(R).map(([g, rs]) => `${g} ${rs.map((r) => `${r.tracedFull} / ${r.tracedHalf}`).join(", ")}`).join("; "));

    // section 110's reading, on the Intel: the pass at least half of toT + easu + comp in both runs is the target; the brightest t's
    // reduction instead if toT - toTFree is at least half of toT in both runs; neither half: the rest is spread
    const read110 = (runs) => {
        if (!runs.every((r) => c1(r) && [r.toT, r.easu, r.comp, r.toTFree].every((v) => Number.isFinite(v) && v > 0))) return "owed again";
        if (runs.every((r) => r.toT - r.toTFree >= 0.5 * r.toT)) return "the brightest t's reduction";
        const big = ["toT", "easu", "comp"].find((k) => runs.every((r) => r[k] >= 0.5 * (r.toT + r.easu + r.comp)));
        return big ? { toT: "the transfer", easu: "EASU", comp: "the composite" }[big] : "spread";
    };
    const it = R["intel-gen9"], fx110 = [read110(it.map((r) => ({ ...r, toTFree: 0.4 * r.toT }))), read110(it.map((r) => ({ ...r, easu: r.comp }))), read110(it.map((r, i) => (i ? { ...r, easu: null } : r)))];
    ok("!! *** section 111, by section 110's reading: ON THE INTEL, EASU IS AT LEAST HALF OF THE REST'S THREE PASSES IN BOTH RUNS, AND THE SINGLE-WORD ATOMIC COSTS NOTHING MEASURABLE -- EASU is the next round's target ***",
        read110(it) === "EASU" && it.every((r) => r.toT - r.toTFree < 0.05 * r.toT) && fx110[0] === "the brightest t's reduction" && fx110[1] === "spread" && fx110[2] === "owed again",
        `${it.map((r) => `run ${r.file}: toT ${r.toT}, easu ${r.easu} (${(r.easu / (r.toT + r.easu + r.comp)).toFixed(3)} of the three), comp ${r.comp}, toT less its atomic ${r.toTFree}`).join("; ")}; fixtures: ${fx110.join(" | ")}`);
    ok("  ...and section 110's predictions are read as made: EASU's 20-35 ms MET in both runs, the composite's 4-12 MISSED in both (17-23), restToT's 2-12 met in run a and MISSED in run b, the atomic's third MISSED; the 1080's three sum to its 1.0 ms (met)",
        it.every((r) => inR(r.easu, 20, 35) && !inR(r.comp, 4, 12) && r.toT - r.toTFree < r.toT / 3) && inR(it[0].toT, 2, 12) && !inR(it[1].toT, 2, 12) &&
        R.gtx1080.every((r) => Math.abs(r.toT + r.easu + r.comp - r.rest) <= 0.05 * r.rest),
        `Intel easu ${it.map((r) => r.easu).join(" / ")}, comp ${it.map((r) => r.comp).join(" / ")}, toT ${it.map((r) => r.toT).join(" / ")}; 1080 ${R.gtx1080.map((r) => (r.toT + r.easu + r.comp).toFixed(3)).join(" / ")} against rest ${R.gtx1080.map((r) => r.rest).join(" / ")}`);
    say(`section 111: the half-size chain against today's page with the bounded coverage -- 1080 ${R.gtx1080.map((r) => r.ratioBound).join(" / ")} x, Intel ${it.map((r) => r.ratioBound).join(" / ")} x (each against today's page with the bounded mask too) -- reported, deciding nothing`);
    REPORT.table("section 111: rounds 38, 39 and 42 on both GPUs, ms", ["GPU", "run", "list fill", "listed tile fill", "covFull", "covFullB", "toT", "EASU", "composite", "toT, no atomic"],
        Object.entries(R).flatMap(([g, rs]) => rs.map((r) => [g, r.file, r.fillList, r.fillLTile, r.covFull, r.covFullB, r.toT, r.easu, r.comp, r.toTFree])));
}

console.log("\n12. SECTION 123: ROUNDS 46 AND 48 ON THE INTEL, RE-DERIVED FROM THE TWO REPORTS AS COMMITTED");
{
    // the rig ran 7b871372, which carries sections 115 and 117 (first carried by a9162ea4 and fec43b2c); only the rig's commit counts.
    // Section 121's runs at d77592b2 do not: their timing gate died, so C1 failed there
    const RIG_COMMITS = Object.freeze(["7b871372"]);
    const rd = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "render", f), "utf8"));
    const dev = (k, t) => { const m = t.match(new RegExp(`\\b${k} ([0-9.]+) ms \\(device\\)`)); return m ? Number(m[1]) : null; };
    const readRun = (rep, file) => {
        const g = rep.gates.find((x) => x.gate === "render/denoiseUpscaleGPU-selfcheck.mjs"), m = (g && g.measured) || [];
        const l115 = m.find((l) => l.startsWith("section 115: ")) || "", l117 = m.find((l) => l.startsWith("section 117: ")) || "";
        return { file, commit: String(rep.commit || "").slice(0, 8), allGreen: rep.gates.length === 4 && rep.gates.every((x) => x.ok && x.exit && x.exit.status === 0),
            easu: dev("restEasu", l115), comp: dev("restComp", l115), quad: dev("restEasuQ", l115), fused: dev("restEasuComp", l115), accum: dev("accum", l117), accumT: dev("accumT", l117) };
    };
    const runs = ["a", "b"].map((k) => readRun(rd(`denoise-rig-r52-${k}-intel-gen9.json`), k));
    const c1 = (r) => RIG_COMMITS.includes(r.commit) && r.allGreen;
    // section 115's rule (H46): C1; C2 all four steps on the device's clock (dev() reads "(device)" figures only); restEasuComp <= 0.8 x (restEasu + restComp) in both
    const H46 = (rs) => (rs.every((r) => c1(r) && [r.easu, r.comp, r.quad, r.fused].every((v) => Number.isFinite(v) && v > 0)) ? (rs.every((r) => r.fused <= 0.8 * (r.easu + r.comp)) ? "holds" : "fails") : "no verdict");
    // section 117's rule (H48): C1; C2 both steps on the device's clock; accumT <= 0.8 x accum in both
    const H48 = (rs) => (rs.every((r) => c1(r) && [r.accum, r.accumT].every((v) => Number.isFinite(v) && v > 0)) ? (rs.every((r) => r.accumT <= 0.8 * r.accum) ? "holds" : "fails") : "no verdict");
    const shift = (f) => runs.map((r, i) => (i ? f(r) : r));
    const fx = [H46(shift((r) => ({ ...r, fused: 0.81 * (r.easu + r.comp) }))), H46(shift((r) => ({ ...r, commit: "d77592b2" }))), H48(shift((r) => ({ ...r, accumT: 0.81 * r.accum }))), H48(shift((r) => ({ ...r, accumT: null })))];
    ok("!! *** section 123, by section 115's rule: H46 HOLDS -- every gate green at 7b871372, the fused EASU and composite at 0.794 and 0.799 x the two passes it replaces, both inside 0.8 -- so it becomes the chain's, as denoise-easu-fused-default ***",
        H46(runs) === "holds" && fx[0] === "fails" && fx[1] === "no verdict",
        `${runs.map((r) => `run ${r.file}: ${r.fused} / ${(r.easu + r.comp).toFixed(3)} = ${(r.fused / (r.easu + r.comp)).toFixed(3)}`).join("; ")}; fixtures: ${fx[0]} | ${fx[1]}`);
    ok("!! *** section 123, by section 117's rule: H48 HOLDS -- the tiled accumulation at 0.523 and 0.544 x the accumulation, on the device's clock in both runs -- so it becomes the history's, as denoise-accum-tile-default ***",
        H48(runs) === "holds" && fx[2] === "fails" && fx[3] === "no verdict",
        `${runs.map((r) => `run ${r.file}: ${r.accumT} / ${r.accum} = ${(r.accumT / r.accum).toFixed(3)}`).join("; ")}; fixtures: ${fx[2]} | ${fx[3]}`);
    // the predictions as made: H46's fused pass 0.55-0.80 (met, at its edge); the quads alone 0.5-0.8 x EASU (MISSED: no faster);
    // H48's 0.60-0.85 (MISSED, faster than predicted)
    const inR = (v, a2, b2) => v >= a2 && v <= b2;
    ok("  ...and sections 115 and 117's predictions are read as made: the fused pass's 0.55-0.80 MET at its edge; the quads alone 0.5-0.8 x EASU MISSED (1.015 / 1.053); the tiled accumulation's 0.60-0.85 MISSED, faster (0.523 / 0.544)",
        runs.every((r) => inR(r.fused / (r.easu + r.comp), 0.55, 0.80) && !inR(r.quad / r.easu, 0.5, 0.8) && r.quad >= r.easu && !inR(r.accumT / r.accum, 0.60, 0.85) && r.accumT / r.accum < 0.60),
        runs.map((r) => `run ${r.file}: quads ${(r.quad / r.easu).toFixed(3)} x EASU, tiled ${(r.accumT / r.accum).toFixed(3)} x`).join("; "));
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nALL GREEN");
console.log("not read here: any time section 4 printed. On SwiftShader a kernel's time is a CPU's; the rig round reads them (backlog denoise-halfres-rig-timing).");
REPORT.write();
process.exit(fails ? 1 : 0);
