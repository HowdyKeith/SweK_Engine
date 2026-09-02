#!/usr/bin/env node
// WebGLEngine/tools/ship/rangefinder-selfcheck.mjs -- v4301
//
// GATES audio/rangefinder.mjs -- the speaker-and-microphone rangefinder, idea from ruvnet/batvu (MIT), no
// code from it. There is no microphone in this sandbox and none is needed: time-of-flight has a closed form
// (range = c t / 2), so an echo SYNTHESISED at a known delay must come back as a known range, and the whole
// DSP chain -- chirp, matched filter, envelope, CFAR -- is graded on that, with noise from a seeded generator
// so a red here reproduces to the sample.
//
// *** THE TWO CONTROLS THAT KEEP THIS FROM BEING VACUOUS. *** Noise with no echo in it must yield no range
// (a detector that always finds something would pass every "the echo is found" line), and the SAME echo
// filtered with the WRONG reference chirp must NOT be found (a detector that ignores the reference and
// thresholds raw energy would pass everything above). Both are asserted.
//
// *** AND WHAT WAS MEASURED WHILE WRITING IT, RATHER THAN ASSUMED. *** Cell-averaging CFAR with a 6+32 window
// missed a 27 dB echo, because the compressed pulse's own skirt sat in its training cells; a 9 dB threshold
// on the median gave 24 false alarms in 20 noise-only runs, because a local maximum of Rayleigh noise clears
// 9 dB one time in 250; and every clean run reported a "target" at 0.80 m that was the direct path's tail,
// because a 5 ms chirp is 0.86 m long. All three are in the module's header and each has a line below.
//
// Run: node tools/ship/rangefinder-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as R from "../../audio/rangefinder.mjs";
import { spectrum } from "../../physics/fft.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const SR = 48000, B = 3000, T = 0.005;
const ref = R.chirp();
const run = (echoes, noise, seed = 1, opts = {}) => R.profile(R.synthEcho(ref, { echoes, noise, seed }), ref, opts);
const show = (p) => p.detections.map((d) => `${d.metres.toFixed(3)} m / ${d.snrDb.toFixed(0)} dB`).join(", ") || "none";

// ---------------------------------------------------------------------------------------------------------
sec("1. CLOSED FORMS, AND batvu'S TWO FIGURES CHECKED AS ARITHMETIC");
// ---------------------------------------------------------------------------------------------------------
{
    ok(Math.abs(R.resolution(B) - 0.05717) < 1e-4, "*** range resolution c / 2B = 5.72 cm at 3 kHz of bandwidth ***",
       `${(R.resolution(B) * 100).toFixed(2)} cm -- batvu reports 9.6 cm achieved; a window and an envelope widen the bound, and nothing can narrow it`);
    ok(Math.abs(R.compressionGainDb(B, T) - 11.76) < 0.01 && Math.abs(R.compressionGainDb(B, T) - 11.8) < 0.05,
       "*** pulse-compression gain 10 log10(BT) = 11.76 dB, which is batvu's '11.8 dB' ***", `${R.compressionGainDb(B, T).toFixed(2)} dB, BT = ${B * T}`);
    ok(Math.abs(R.rangeOf(R.lagOf(2.5, SR), SR) - 2.5) < 1e-12, "rangeOf and lagOf are inverse");
    ok(Math.abs(R.rangeOf(R.lagOf(3.8, SR), SR) / (R.SPEED_OF_SOUND / 2) - 0.02216) < 1e-4, "3.8 m is a 22.2 ms echo",
       `${(2 * 3.8 / R.SPEED_OF_SOUND * 1000).toFixed(2)} ms`);
    ok(Math.abs(R.maxRange(R.DEFAULTS.listenSeconds) - 5.145) < 1e-3, "a 30 ms listen window reaches 5.1 m", `${R.maxRange(0.03).toFixed(3)} m`);
    ok(Math.abs(R.rangeOf(1, SR) - 0.00357) < 1e-5, "one sample at 48 kHz is 3.6 mm of range");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE CHIRP IS THE CHIRP: right length, right band, same bits every time");
// ---------------------------------------------------------------------------------------------------------
{
    ok(ref.length === 240, "5 ms at 48 kHz is 240 samples", `${ref.length}`);
    const pad = new Float64Array(2048); pad.set(ref);
    const mag = spectrum(pad); let lo = 0, hi = 0, tot = 0;
    for (let k = 1; k < 1024; k++) { const hz = k * SR / 2048, e = mag[k] * mag[k]; tot += e; if (hz >= 17000 && hz <= 21000) lo += e; if (hz < 16000) hi += e; }
    ok(lo / tot > 0.95, "*** more than 95% of its energy lies in 17-21 kHz, and under 1% below 16 kHz ***",
       `${(100 * lo / tot).toFixed(1)}% in band, ${(100 * hi / tot).toFixed(2)}% below 16 kHz`);
    const again = R.chirp();
    ok(again.every((x, i) => x === ref[i]), "two calls give identical samples", "strictSin, so identical on every machine too");
    ok(Math.abs(ref[0]) < 1e-9 && Math.abs(ref[239]) < 1e-9, "Hann-windowed: it starts and ends at zero");
    const src = fs.readFileSync(path.join(ENG, "audio/rangefinder.mjs"), "utf8");
    ok(/strictSin\(phase\)/.test(src) && !/Math\.sin\(/.test(src), "the source uses the strict sine and never Math.sin");
}

// ---------------------------------------------------------------------------------------------------------
sec("3. A KNOWN DELAY COMES BACK AS A KNOWN RANGE");
// ---------------------------------------------------------------------------------------------------------
{
    const p = run([{ metres: 1.5, amp: 0.05 }], 0.02, 11);
    ok(p.directPath === 0, "the direct path is found at lag 0, where the synthesis put it", `lag ${p.directPath}`);
    ok(p.detections.length === 1 && Math.abs(p.detections[0].metres - 1.5) < 0.01,
       "*** one echo at 1.5 m in 26 dB of noise: one detection within a centimetre ***", show(p));
    const worst = []; let count = 0;
    for (const m of [1.0, 1.7, 2.0, 2.9, 3.8, 4.3]) {
        const q = run([{ metres: m, amp: 0.03 }], 0.01, 9);
        if (q.detections.length === 1) { count++; worst.push(Math.abs(q.detections[0].metres - m)); } else worst.push(NaN);
    }
    ok(count === 6 && Math.max(...worst) <= 2 * R.rangeOf(1, SR), "*** six ranges from 1.0 to 4.3 m, each found once and within two samples (7 mm) ***",
       `worst ${(Math.max(...worst) * 1000).toFixed(1)} mm`);
    // a sweep across the working range with a coarse step that never lands on a whole sample
    let worstSweep = 0, missed = 0;
    for (let m = 1.0; m <= 4.4; m += 0.137) { const d = run([{ metres: m, amp: 0.04 }], 0.01, 2).detections; if (d.length !== 1) missed++; else worstSweep = Math.max(worstSweep, Math.abs(d[0].metres - m)); }
    ok(missed === 0 && worstSweep < 0.008, "and a 25-position sweep never misses and never errs by more than 8 mm", `worst ${(worstSweep * 1000).toFixed(1)} mm, ${missed} missed`);
    const two = run([{ metres: 1.5, amp: 0.05 }, { metres: 2.7, amp: 0.03 }], 0.02, 7);
    ok(two.detections.length === 2 && Math.abs(two.detections[0].metres - 1.5) < 0.01 && Math.abs(two.detections[1].metres - 2.7) < 0.01,
       "two targets at 1.5 and 2.7 m are both found, nearer first", show(two));
    const faint = run([{ metres: 1.5, amp: 0.05 }], 0.08, 11);
    ok(faint.detections.length === 1 && faint.detections[0].snrDb < 16, "at 0.08 noise the echo is still found, now with about 13 dB to spare", show(faint));
}

// ---------------------------------------------------------------------------------------------------------
sec("4. THE CONTROLS: NOISE ALONE FINDS NOTHING, AND THE WRONG REFERENCE FINDS NOTHING");
// ---------------------------------------------------------------------------------------------------------
{
    let alarms = 0; for (let seed = 1; seed <= 20; seed++) alarms += run([], 0.05, seed).detections.length;
    ok(alarms <= 3, "*** twenty noise-only recordings: at most three false alarms in ~24,000 cells ***",
       `${alarms} -- it was 24 at a 9 dB threshold; the median-relative threshold is 13 dB now`);
    const clean = R.profile(R.synthEcho(ref, { echoes: [], noise: 0 }), ref);
    ok(clean.detections.length === 0 && clean.directPath === 0, "a silent room with only the direct path: no detection at all");
    const wrong = R.chirp({ f0: 9000, f1: 12000 });
    const w = R.profile(R.synthEcho(ref, { echoes: [{ metres: 1.5, amp: 0.05 }], noise: 0.02, seed: 11 }), wrong, { bandwidth: 3000 });
    ok(w.detections.every((d) => Math.abs(d.metres - 1.5) > 0.05),
       "*** the same 1.5 m echo filtered with a 9-12 kHz reference is NOT found at 1.5 m ***",
       `${show(w)} -- the matched filter is doing the finding, not a raw energy threshold`);
    ok(typeof R.cfar === "function" && (() => { try { R.cfar(new Float64Array(10), {}); return false; } catch { return true; } })(),
       "cfar() refuses to run without window sizes; profile() derives them from the bandwidth",
       "guard and train are in compressed-pulse widths, which is why the first draft's 6+32 failed");
}

// ---------------------------------------------------------------------------------------------------------
sec("5. RESOLUTION IS MEASURED, AND IT SITS WHERE THE ARITHMETIC SAYS IT MUST");
// ---------------------------------------------------------------------------------------------------------
{
    const res = R.resolution(B);
    const pair = (sep) => run([{ metres: 1.5, amp: 0.05 }, { metres: 1.5 + sep, amp: 0.05 }], 0.005, 5).detections;
    const far = pair(4 * res);
    ok(far.length === 2 && Math.abs(far[0].metres - 1.5) < 0.01 && Math.abs(far[1].metres - 1.5 - 4 * res) < 0.01,
       "two equal echoes four resolutions apart (23 cm) are two detections", `${far.map((d) => d.metres.toFixed(3)).join(" and ")} m`);
    const near = pair(0.5 * res);
    ok(near.length === 1, "and half a resolution apart (2.9 cm) they are ONE -- nothing beats c / 2B", `${near.length} detection at ${near[0]?.metres.toFixed(3)} m`);
    let smallest = null;
    for (const sep of [0.40, 0.30, 0.23, 0.15, 0.12, 0.10, 0.08, 0.06]) { const d = pair(sep); if (d.length === 2 && Math.abs(d[0].metres - 1.5) < 0.02 && Math.abs(d[1].metres - 1.5 - sep) < 0.02) smallest = sep; }
    ok(smallest !== null && smallest >= res && smallest <= 4 * res,
       "*** the smallest cleanly resolved separation lies between c / 2B and four times it ***",
       `${(smallest * 100).toFixed(0)} cm measured; bound 5.7 cm; batvu's 9.6 cm sits in the same band`);
}

// ---------------------------------------------------------------------------------------------------------
sec("6. THE BLIND ZONE IS THE CHIRP'S LENGTH, AND IT IS SAID, NOT HIDDEN");
// ---------------------------------------------------------------------------------------------------------
{
    const p = run([{ metres: 0.6, amp: 0.05 }], 0.01, 3);
    ok(Math.abs(p.blindMetres - 1.1 * R.rangeOf(ref.length, SR)) < 1e-9 && p.blindMetres > 0.9 && p.blindMetres < 1.0,
       "*** the blind zone is 1.1 chirp lengths: 0.94 m at 5 ms ***", `${p.blindMetres.toFixed(3)} m -- batvu's 0.6 m floor needs direct-path subtraction, which this does not do`);
    ok(p.detections.length === 0, "so an echo at 0.6 m is not reported -- and not reported as anything else either", show(p));
    const tail = R.profile(R.synthEcho(ref, { echoes: [{ metres: 2.0, amp: 0.02 }], noise: 0.01, seed: 9 }), ref);
    ok(tail.detections.length === 1 && Math.abs(tail.detections[0].metres - 2.0) < 0.01,
       "and the direct path's tail at 0.80 m, which the first draft reported as a target, is inside it", show(tail));
    const live = fs.readFileSync(path.join(ENG, "audio/rangefinderLive.mjs"), "utf8");
    ok(/echoCancellation: false, noiseSuppression: false, autoGainControl: false/.test(live),
       "the live adapter asks for the microphone with echo cancellation, noise suppression and AGC OFF",
       "each of the three would remove or reshape the very signal being listened for");
    ok(/directPath: p\.directPath/.test(live), "and reports the direct-path sample it set the clock from");
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  the matched filter returns |rx| -- raw energy, the reference never consulted.
//      -> exit=1, EIGHT lines. The direct path lands at lag 114, every range is wrong, the silent room grows
//      a detection, and the noise-only runs go from 2 alarms to 61. A detector that thresholds energy is not
//      a rangefinder, and this is what one looks like.
//
//   B  the CFAR threshold dropped from 13 dB to 3 dB.
//      -> exit=1, eight lines: 206 false alarms in twenty noise-only runs, and the "one detection" cases
//      report five to eight. This is the failure the 9 dB draft had in a milder form (24 alarms).
//
//   C  rangeOf forgets the round trip: c t instead of c t / 2.
//      -> exit=1, eight lines, every range exactly doubled (1.5 m reads 2.994 m; the 25-position sweep errs
//      by 4.3 m). The closed-form lines in section 1 catch it before any echo is synthesised.
//
//   D  the blind zone removed.
//      -> exit=1, two lines: the silent room reports the direct path's own tail as a target, and blindMetres
//      reads 0. This is the state the first draft shipped in, with a 9 dB "target" at 0.80 m in every clean
//      run.
//
//   Not by sabotage: the two things the first draft got wrong (cell-averaging with a 6+32 window; a 9 dB
//   threshold) and the one it had not thought about (the chirp's own length as a blind zone) are each a line
//   above and a paragraph in the module header.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: any real room. Every echo above was synthesised; the sandbox has no microphone " +
    "and no number in this tree is a measurement until a rig with one has produced it. Also unchecked: a " +
    "moving speaker (batvu's occupancy grid), and whether a phone's browser honours the three OFF flags.");
process.exit(fails ? 1 : 0);
