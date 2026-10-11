#!/usr/bin/env node
// WebGLEngine/render/flicker-selfcheck.mjs -- v4746
//
// render/flicker.mjs's flickerCPU on sequences whose answer is known in closed form: a scene changing linearly (no flicker,
// which the plain alternating sum it replaced got wrong), a constant with a(-1)^j on it (a), a frame held for two refreshes
// while the scene moves (a quarter of its step: judder), an error on every other frame (half of it), and the signs and
// weights. fx/fsr/fsrFlicker-selfcheck.mjs measures frame generation with it.
"use strict";
import { flickerCPU } from "./flicker.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const W = 8, H = 4, N = 12;
let sd = 3; const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
/** A sequence of n grey frames, pixel i of frame j at f(i, j). */
const seq = (n, f) => Array.from({ length: n }, (_, j) => { const b = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) { const v = f(i, j); b[i * 4] = v; b[i * 4 + 1] = v; b[i * 4 + 2] = v; b[i * 4 + 3] = 1; } return b; });
const base = Array.from({ length: W * H }, () => 0.2 + 0.3 * rnd()), slope = Array.from({ length: W * H }, () => (rnd() - 0.5) * 0.04);

console.log("\n1. WHAT IT REFUSES");
{
    const s3 = seq(3, () => 0.5);
    const got = [threw(() => flickerCPU({ frames: s3, truths: s3.slice(0, 2), w: W, h: H })), threw(() => flickerCPU({ frames: s3.slice(0, 2), truths: s3.slice(0, 2), w: W, h: H })),
                 threw(() => flickerCPU({ frames: [s3[0], s3[1], s3[2].subarray(4)], truths: s3, w: W, h: H }))];
    ok("frames and truths of different lengths, fewer than three frames, and a short frame are refused", /same length/.test(got[0] || "") && /three frames/.test(got[1] || "") && /w\*h\*4/.test(got[2] || ""),
       got.join(" | "));
}

console.log("\n2. WHAT IS NOT FLICKER, AND WHAT IS");
{
    // every pixel changing linearly, each at its own rate: the scene moving smoothly
    const ramp = seq(N, (i, j) => base[i] + slope[i] * j), r = flickerCPU({ frames: ramp, truths: ramp, w: W, h: H });
    // the plain alternating sum the first draft used, for the record
    let naive = 0; for (let i = 0; i < W * H; i++) { let a = 0; for (let j = 0; j < N; j++) a += (j % 2 ? -1 : 1) * (base[i] + slope[i] * j); naive += Math.abs(a) / N; } naive /= W * H;
    ok(`*** a scene changing LINEARLY has no flicker: ${r.shown.toExponential(1)} -- where the plain alternating sum reads ${(naive * 255).toFixed(3)} / 255 on the same ${N} frames ***`,
       r.shown < 1e-6 && r.truth < 1e-6 && naive * 255 > 0.5, "the second difference takes the trend out; the sum does not, and the first draft of this round's probe read the truth itself as flickering");
    const a = 0.03, alt = seq(N, (i, j) => base[i] + (j % 2 ? -a : a)), still = seq(N, (i) => base[i]), q = flickerCPU({ frames: alt, truths: still, w: W, h: H });
    ok(`a still scene shown with ${a} added and taken away on alternate frames reads ${q.shown.toFixed(6)}, the excess and the error the same`, Math.abs(q.shown - a) < 1e-6 && Math.abs(q.excess - a) < 1e-6 && Math.abs(q.error - a) < 1e-6 && q.truth === 0);
    // a frame held for two refreshes while the scene moves s per real frame: shown x_j = truth at 2 floor(j / 2)
    const s = 0.04, truth = seq(N, (i, j) => base[i] + s * j / 2), held = seq(N, (i, j) => base[i] + s * Math.floor(j / 2)), hq = flickerCPU({ frames: held, truths: truth, w: W, h: H });
    ok(`...and a frame HELD for two refreshes while the scene moves ${s} a real frame reads a quarter of that, ${hq.excess.toFixed(6)} -- judder is alternation too`, Math.abs(hq.excess - s / 4) < 1e-6 && hq.truth < 1e-6);
    // an error on every other frame alone: E_j = e on the even frames -- e / 2 + (e / 2)(-1)^j
    const e = 0.02, half = seq(N, (i, j) => base[i] + slope[i] * j + (j % 2 ? 0 : e)), hr = flickerCPU({ frames: half, truths: ramp, w: W, h: H });
    ok(`...and an error of ${e} on every other frame reads half of it, ${hr.error.toFixed(6)}, over a scene that moves`, Math.abs(hr.error - e / 2) < 1e-6);
}

console.log("\n3. MOTION THAT IS NOT AT HALF THE RATE: THE TAPER");
{
    // a pattern translating past each pixel at 0.21 cycles a frame -- a stripe under a pan -- with a phase per pixel: no
    // half-rate component at all, so its truth is 0. Read on 12 frames with the taper, and with the plain mean it replaced
    const f = 0.21, amp = 0.2, ph = base.map((b) => b * 40), n = 12;
    const wave = seq(n, (i, j) => 0.5 + amp * Math.sin(2 * Math.PI * f * j + ph[i])), r = flickerCPU({ frames: wave, truths: wave, w: W, h: H });
    let plain = 0; for (let i = 0; i < W * H; i++) { let a = 0; for (let j = 1; j < n - 1; j++) { const x = (k) => 0.5 + amp * Math.sin(2 * Math.PI * f * k + ph[i]);
        a += (j % 2 ? -1 : 1) * (x(j) - (x(j - 1) + x(j + 1)) / 2); } plain += Math.abs(a / (n - 2) / 2); } plain /= W * H;
    ok(`*** a pattern moving at ${f} cycles a frame reads ${(r.shown / amp * 100).toFixed(2)}% of its amplitude as half-rate alternation, where the untapered mean read ${(plain / amp * 100).toFixed(2)}% ***`,
       r.shown < plain / 5 && r.shown / amp < 0.01, "the plain mean over a short window leaks every frequency into the half-rate bin, with a sign that depends on the window: the device gate's first run read a held frame under a pan as +0.30 over the scene on 16 frames and -1.14 on 12");
}

console.log("\n4. THE MAP'S SIGN, THE WEIGHTS, AND THE CLAMP");
{
    const a = 0.03, still = seq(N, (i) => base[i]);
    const pos = flickerCPU({ frames: seq(N, (i, j) => base[i] + (j % 2 ? -a : a)), truths: still, w: W, h: H }), neg = flickerCPU({ frames: seq(N, (i, j) => base[i] + (j % 2 ? a : -a)), truths: still, w: W, h: H });
    ok("the map is positive where the even frames are brighter than the truth and negative where the odd ones are", pos.map.every((v) => v > 0) && neg.map.every((v) => v < 0));
    const blue = Array.from({ length: N }, (_, j) => { const b = new Float32Array(W * H * 4); for (let i = 0; i < W * H; i++) { b[i * 4] = 0.5; b[i * 4 + 1] = 0.5; b[i * 4 + 2] = 0.5 + (j % 2 ? -a : a); b[i * 4 + 3] = 1; } return b; });
    const flat = seq(N, () => 0.5), bq = flickerCPU({ frames: blue, truths: flat, w: W, h: H });
    ok(`an alternation in blue alone reads Rec. 709's share of it: ${(bq.shown / a).toFixed(4)} of ${a}`, Math.abs(bq.shown / a - 0.0722) < 1e-4);
    const over = flickerCPU({ frames: seq(N, (i, j) => (j % 2 ? 1.5 : 1.0)), truths: seq(N, () => 1), w: W, h: H });
    ok("and the colour is clamped to [0, 1] first, as the display does: 1.0 and 1.5 alternating is no flicker", over.shown === 0);
}

// ---- v4746 SABOTAGE LOG ----------------------------------------------------------------------------------------
// Against render/flicker.mjs, here and in fx/fsr/fsrFlicker-selfcheck.mjs:
//   L1  the value itself, no second difference                -> 6 here, 1 there    L5  excess as a magnitude       -> 0, 1
//   L2  the alternation not halved                            -> 5, 0               L6  the map's sign flipped      -> 1, 0
//   L3  no taper                                              -> 1, 0               L7  red and blue weights swapped-> 1, 0
//   L4  the colour not clamped                                -> 1, 0               L8  the sign from the odd frames-> 1, 0
// L5 is the device gate's alone: every sequence here that has an excess has a positive one, and FSR3 under the pan is the
// case in this tree where the shown sequence alternates LESS than the scene.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what flicker a person SEES, which depends on the display's rate, the viewer's temporal contrast sensitivity " +
    "and where they look -- this is a signal measure, in luma, averaged over the frame; and the device, which fx/fsr/fsrFlicker-selfcheck.mjs runs.");
process.exitCode = fails ? 1 : 0;
