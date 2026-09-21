#!/usr/bin/env node
// WebGLEngine/render/reactiveGPU-selfcheck.mjs -- v4657, section 4 at v4659
//
// Run: node render/reactiveGPU-selfcheck.mjs
// RUNTIME: recorded at the foot of this file.
//
// *** THE FACTOR PASS'S THIRD INPUT, WHICH HAS BEEN A BINDING WITH NO SOURCE SINCE v4594. ***
//
// render/temporalRejectWgsl.mjs's FACTOR kernel multiplies three independent reasons the history might be
// wrong. DISOCCLUSION got a producer at v4593 and SHADING at v4654; REACTIVE had none, and
// temporalRejectGPU's own closing line said so in as many words.
//
// *** THE DEPTH GATE IS THE DESIGN, AND WITHOUT IT THIS IS A SECOND DISOCCLUSION DETECTOR. *** A pixel is
// reactive where the colour disagrees with its reprojected history AND the depth says the reprojection was
// sound. Where the surface genuinely changed, the colour disagrees too -- so a mask without the gate reports
// a disocclusion under another name and multiplies one reason into the factor twice. Section 3 drives that.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "../tools/ship/webgpuHarness.mjs";
import { reactiveCPU } from "./reactive.mjs";
import { disocclusionCPU } from "./temporalReject.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

// NON-SQUARE, because v4592's sabotage found a square fixture cannot see a w/h swap.
const W = 96, H = 64, N = W * H;
const THRESH = 0.02, SCALE = 1;

// *** THE FIXTURE CARRIES ALL FOUR CASES THE MASK MUST TELL APART, and they are placed in separate bands so
// a row can name which one moved. Static camera, so motion is zero and every pixel reprojects to itself --
// the geometry is deliberately trivial, because the subject is the COLOUR test and the DEPTH GATE, not the
// reprojection, which render/motionVectors-selfcheck owns.
const cur = new Float32Array(N * 4), hist = new Float32Array(N * 4);
const motion = new Float32Array(N * 4), prevDepth = new Float32Array(N);
// *** THE LAST BAND IS TWO BANDS SINCE v4659, BECAUSE noHistory WAS ONE COUNTER FOR THREE EVENTS. *** The
// fixture had no OFF-SCREEN case at all -- every pixel reprojected to itself -- so `declinedOffscreen` would
// have shipped as a counter no row could move. The two halves sum to the sixteen rows the old band had, so
// every figure section 1 quotes is unchanged.
const BAND = (y) => (y < 16 ? "same" : y < 32 ? "reactive" : y < 48 ? "disoccluded" : y < 56 ? "invalid" : "offscreen");
const NOHIST = ["invalid", "offscreen"];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4;
    const base = 0.30 + 0.20 * Math.sin(x * 0.21);
    for (let c = 0; c < 3; c++) { hist[o + c] = base; cur[o + c] = base; }
    hist[o + 3] = 1; cur[o + 3] = 1;
    motion[o] = 0; motion[o + 1] = 0; motion[o + 2] = 1; motion[o + 3] = 0.50;   // valid, expects depth 0.50
    prevDepth[i] = 0.50;                                                          // ...and that is what was there
    const band = BAND(y);
    if (band === "reactive") {
        // SAME SURFACE (depth agrees), DIFFERENT COLOUR -- the case only this mask can see. Chromatic on
        // purpose: the blue channel alone moves, so a luma-only detector would read almost nothing.
        cur[o + 2] = base + 0.40;
    } else if (band === "disoccluded") {
        // the surface changed: what was there last frame was NEARER than this pixel expects
        prevDepth[i] = 0.50 - 0.10;
        for (let c = 0; c < 3; c++) cur[o + c] = base + 0.40;    // and so the colour differs too
    } else if (band === "invalid") {
        motion[o + 2] = 0;                                       // no reprojection at all
        for (let c = 0; c < 3; c++) cur[o + c] = base + 0.40;
    } else if (band === "offscreen") {
        // VALID motion that reprojects clean off the left edge. It must stay valid, or it never reaches the
        // bounds test and counts as invalid instead -- which is precisely the confusion this band exists for.
        motion[o] = -2;
        for (let c = 0; c < 3; c++) cur[o + c] = base + 0.40;
    }
}
const R = reactiveCPU({ current: cur, history: hist, motion, prevDepth, w: W, h: H, threshold: THRESH, scale: SCALE });
const bandMean = (name) => {
    const want = Array.isArray(name) ? name : [name];
    let s = 0, n = 0;
    for (let y = 0; y < H; y++) if (want.includes(BAND(y))) for (let x = 0; x < W; x++) { s += R.data[y * W + x]; n++; }
    return s / n;
};
const bandSize = (name) => {
    const want = Array.isArray(name) ? name : [name];
    let n = 0;
    for (let y = 0; y < H; y++) if (want.includes(BAND(y))) n += W;
    return n;
};

console.log("\n1. THE FOUR CASES, TOLD APART");
say("band means", ["same", "reactive", "disoccluded", "invalid", "offscreen"].map((b) => `${b} ${bandMean(b).toFixed(4)}`).join(", "));
say("counts", `flagged ${R.flagged}, noHistory ${R.noHistory} of ${N}`);
ok("!! *** the REACTIVE band fires: same surface, sound reprojection, different colour ***",
   bandMean("reactive") > 0.3,
   `${bandMean("reactive").toFixed(4)} mean. Only the BLUE channel moves there, by 0.40 -- chromatic on ` +
   "purpose, because a particle can change the colour without moving the luma at all and that is exactly " +
   "the case render/temporalLock.mjs's luma ring cannot see.");
ok("!! *** ...and the unchanged band does NOT, so the mask is not simply on ***",
   bandMean("same") < 1e-6,
   `${bandMean("same").toExponential(2)} mean over ${16 * W} pixels. Same colour, same depth, valid motion.`);
ok("!! *** ...and the DISOCCLUDED band is SILENT, which is the whole design ***",
   bandMean("disoccluded") < 1e-6,
   `${bandMean("disoccluded").toExponential(2)} mean -- and its colour differs by the SAME 0.40 the reactive ` +
   "band's does. Without the depth gate this band would fire just as hard, and the factor pass would " +
   "multiply one reason in twice: disocclusionCPU already writes 1 there.");
ok("  ...and disocclusionCPU really does claim that band, so the row above is a division of labour and not a coincidence",
   (() => {
       const D = disocclusionCPU({ motion, prevDepth, w: W, h: H, threshold: THRESH });
       let inBand = 0;
       for (let y = 32; y < 48; y++) for (let x = 0; x < W; x++) if (D.data[y * W + x] === 1) inBand++;
       say("  disocclusion", `claims ${D.flagged} pixels, ${inBand} of them in the disoccluded band`);
       return inBand === 16 * W;
   })(), "every pixel this mask declined, the other one took");
ok("!! ...and the NO-HISTORY band reads 0 and not 1, which is the same rule",
   bandMean(NOHIST) < 1e-6 && R.noHistory >= 16 * W,
   `${bandMean(NOHIST).toExponential(2)} mean, noHistory ${R.noHistory}. A pixel with no reprojection ` +
   "is already fully handled by the disocclusion mask's 1; writing 1 here as well discards a history the " +
   "chain had decided to discard, twice.");

console.log("\n2. WHAT IT REFUSES");
ok("a non-positive threshold is refused rather than defaulted",
   (() => { try { reactiveCPU({ current: cur, history: hist, motion, prevDepth, w: W, h: H, threshold: 0 }); return false; }
            catch (e) { return /positive depth/.test(e.message); } })(),
   "a [0,1] projection and a [-1,1] one do not share a scale, which is disocclusionCPU's own refusal");
ok("...and a non-positive scale is refused, because it is the CALLER's colour range",
   (() => { try { reactiveCPU({ current: cur, history: hist, motion, prevDepth, w: W, h: H, threshold: THRESH, scale: 0 }); return false; }
            catch (e) { return /scale must be positive/.test(e.message); } })());
ok("!! ...and a NULL history gives an all-zero mask and counts every pixel as unjudged",
   (() => { const f = reactiveCPU({ current: cur, history: null, motion, prevDepth, w: W, h: H, threshold: THRESH });
            return f.flagged === 0 && f.noHistory === N && f.data.every((v) => v === 0); })(),
   "frame one has nothing to disagree with. Zero and NOT one: the disocclusion mask writes 1 for a pixel " +
   "with no history, and a second 1 here would multiply the same reason into the factor twice.");

console.log("\n3. ON THE DEVICE");
const skip = await webgpuSkipReason();
if (skip) { ok("a WebGPU adapter is available", false, skip); }
else {
const r = await runInEngineOrigin({ engineRoot: ENG, args: {
        W, H, THRESH, SCALE, cur: Array.from(cur), hist: Array.from(hist),
        motion: Array.from(motion), prevDepth: Array.from(prevDepth),
    }, script: `async (a) => {
    const { requestDevice } = await import("/gfx/device.js");
    const { ReactiveGPU } = await import("/render/reactiveGPU.mjs");
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const dev = await requestDevice(cv, { backend: "webgpu", offscreen: true });
    const errs = []; if (dev.gpu && dev.gpu.addEventListener) dev.gpu.addEventListener("uncapturederror", (e) => errs.push(String(e.error && e.error.message).slice(0, 200)));
    const g = new ReactiveGPU(dev);
    const common = { current: new Float32Array(a.cur), motion: new Float32Array(a.motion),
                     prevDepth: new Float32Array(a.prevDepth), w: a.W, h: a.H, threshold: a.THRESH, scale: a.SCALE };
    const withHist = await g.reactive({ ...common, history: new Float32Array(a.hist) });
    const noHist = await g.reactive({ ...common, history: null });
    const counted = await g.reactive({ ...common, history: new Float32Array(a.hist), counted: true });
    const countedNoHist = await g.reactive({ ...common, history: null, counted: true });
    const refuse = async (fn) => { try { await fn(); return null; } catch (e) { return String(e.message).slice(0, 150); } };
    const rThresh = await refuse(() => g.reactive({ ...common, history: new Float32Array(a.hist), threshold: 0 }));
    let rBackend = null;
    try { const c2 = document.createElement("canvas"); const d2 = await requestDevice(c2, { backend: "webgl2", offscreen: true }); new ReactiveGPU(d2); }
    catch (e) { rBackend = String(e.message).slice(0, 150); }
    return { backend: dev.backend, errs, withHist: Array.from(withHist.data), noHist: Array.from(noHist.data),
             rThresh, rBackend,
             stats: counted.stats, statsNoHist: countedNoHist.stats, countedData: Array.from(counted.data),
             uncountedStats: withHist.stats, uncountedReason: withHist.statsReason, countedReason: counted.statsReason };
}` });

ok("the kernel ran on a real WebGPU device",
   r.ok && r.result && r.result.backend === "webgpu" && r.result.errs.length === 0,
   r.ok ? `${r.result && r.result.backend}; errors ${(r.result && r.result.errs || []).join(" | ")}` : (r.reason || (r.pageErrors || []).join("; ")));
if (r.ok && r.result) {
    let worst = 0;
    for (let i = 0; i < N; i++) worst = Math.max(worst, Math.abs(r.result.withHist[i] - R.data[i]));
    say("parity", `worst |gpu - cpu| ${worst.toExponential(2)} over ${N} pixels`);
    ok("!! *** the kernel is reactiveCPU's field, including the depth gate and the bilinear history fetch ***",
       worst < 1e-6,
       `${worst.toExponential(2)}. f32 on the device against f64 in JS through a gate, a bilinear fetch and ` +
       "a three-channel max.");
    ok("!! ...and the device's NULL-history pass is all zero, so `hasHistory` is a FLAG and not an inference",
       r.result.noHist.every((v) => v === 0),
       "the history buffer is still BOUND on that pass -- a bind group is complete or it is nothing -- so a " +
       "kernel that inferred 'no history' from a zeroed buffer would read every pixel as maximally reactive " +
       "against black. It is told instead.");
    ok("...and a non-positive threshold is refused on the device too",
       /positive depth/.test(r.result.rThresh || ""), r.result.rThresh || "NOT REFUSED");
    ok("...and a non-webgpu device throws at construction",
       /needs a gfx\/device\.js device on the webgpu backend/.test(r.result.rBackend || ""), r.result.rBackend || "NOT REFUSED");

    console.log("\n4. ONE COUNTER WAS THREE ANSWERS");
    // *** WHAT `noHistory` WAS HIDING. *** Until v4659 the three declines shared one counter and one name, and
    // the name fits two of them: a DEPTH-GATED pixel has a history, the history is sound, and this module
    // turned it away because the disagreement is disocclusion's to report. A caller reading the sum cannot
    // tell a frame where the reprojection collapsed from a frame where the gate did its job.
    const nInv = bandSize("invalid"), nOff = bandSize("offscreen"), nDep = bandSize("disoccluded");
    say("the three declines", `invalid ${R.declinedInvalid}, offscreen ${R.declinedOffscreen}, ` +
        `depth-gated ${R.declinedDepth}  (bands: ${nInv}, ${nOff}, ${nDep})`);
    ok("!! *** the three declines are three DIFFERENT numbers, each the size of the band that causes it ***",
       R.declinedInvalid === nInv && R.declinedOffscreen === nOff && R.declinedDepth === nDep,
       `A single counter cannot be wrong about this and a split one can, which is the point. The OFF-SCREEN ` +
       `band is new this round: the fixture had no such case at all, so a counter for it would have shipped ` +
       `unmovable.`);
    ok("!! ...and noHistory is exactly their sum, so the split did not half-land",
       R.noHistory === R.declinedInvalid + R.declinedOffscreen + R.declinedDepth,
       `${R.noHistory} === ${R.declinedInvalid} + ${R.declinedOffscreen} + ${R.declinedDepth}. It is DERIVED ` +
       `from the three and never accumulated beside them -- a fourth increment at the same three sites is a ` +
       `fourth chance to miss one.`);
    // *** AND THIS IS WHY THEY MUST BE COUNTED AS THEY HAPPEN. *** Every decline writes 0.0 to the mask, and
    // so does a pixel examined and found in perfect agreement. A reader who tried to recover the declined set
    // by counting zeroes gets the WHOLE quiet half of the image.
    let zeros = 0;
    for (let i = 0; i < N; i++) if (R.data[i] === 0) zeros++;
    say("  recovering it from the mask", `${zeros} pixels read 0.0, against ${R.noHistory} actually declined`);
    ok("!! *** counting zeroes in the mask does NOT recover the declined set, and is wrong by a whole band ***",
       zeros !== R.noHistory && zeros - R.noHistory === bandSize("same"),
       `${zeros} - ${R.noHistory} = ${zeros - R.noHistory}, which is exactly the SAME band: ${bandSize("same")} ` +
       `pixels the mask examined and found in perfect agreement. An absence is not a pass, and here the two ` +
       `are the same float. Only the moment the branch is taken knows which happened -- hence the atomics.`);

    const g = r.result.stats;
    say("  the device's own count", g ? `flagged ${g.flagged}, invalid ${g.declinedInvalid}, offscreen ` +
        `${g.declinedOffscreen}, depth ${g.declinedDepth}, noHistory ${g.noHistory}` : "MISSING");
    ok("!! *** mainCounted's atomics agree with reactiveCPU on all five figures ***",
       !!g && g.flagged === R.flagged && g.declinedInvalid === R.declinedInvalid &&
       g.declinedOffscreen === R.declinedOffscreen && g.declinedDepth === R.declinedDepth &&
       g.noHistory === R.noHistory,
       "Two implementations of the same five counts, one of them 6144 concurrent atomicAdds. The 0.05 that " +
       "defines `flagged` is hard-coded in BOTH mirrors on purpose: it is not a threshold the mask applies, " +
       "it is the one number the two must agree to report, and a uniform would let a caller move it on one side.");
    ok("!! ...and the counted entry point leaves the mask itself bit-identical to main's",
       !!r.result.countedData && r.result.countedData.every((v, i) => v === r.result.withHist[i]),
       "the predicate is factored into one `evaluate` the two entry points share, so a fix to one cannot miss " +
       "the other -- and main pays no atomic, because the auto layout is per entry point.");
    ok("!! ...and a NULL history counts every pixel as INVALID, not as offscreen or depth-gated",
       !!r.result.statsNoHist && r.result.statsNoHist.declinedInvalid === N &&
       r.result.statsNoHist.declinedOffscreen === 0 && r.result.statsNoHist.declinedDepth === 0 &&
       r.result.statsNoHist.noHistory === N,
       "There is no motion to follow anywhere on frame one, which is not the same as following it off the " +
       "frame. reactiveCPU's early return buckets it the same way.");
    ok("!! ...and stats is NULL without counted: true, with a reason, rather than five zeroes",
       r.result.uncountedStats === null && /Null rather than zeroes/.test(r.result.uncountedReason || "") &&
       r.result.countedReason === null,
       `A frame where the mask examined every pixel and found nothing and a frame nobody counted must not ` +
       `read the same. Reason given when absent, null when present: ${JSON.stringify(String(r.result.uncountedReason || "").slice(0, 60))}`);
}
}

console.log(fails ? `\nreactiveGPU-selfcheck: ${fails} FAILED` : "\nreactiveGPU-selfcheck: ALL GREEN");
console.log("unchecked here: whether the mask IMPROVES a reconstruction, which is a paired measurement on a " +
            "page and is the next round's -- v4656 established that an effect this size is eighteen times " +
            "smaller than the frame-to-frame spread and invisible unpaired; a MOVING camera, since this " +
            "fixture is static so every pixel reprojects to itself and the subject is the colour test rather " +
            "than the reprojection, which render/motionVectors-selfcheck owns; and whether an APPLICATION-" +
            "supplied mask would beat this derived one, which is FSR2's actual design and needs content that " +
            "knows which of its own pixels are particles.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   S1  the CPU's depth gate removed                     2 RED (the disoccluded band, and parity)
//   S2  the kernel's depth gate removed                  1 RED, parity
//   S3  the CPU writes 1 for no-history instead of 0     2 RED (the no-history row, and parity)
//   S4  the kernel uses LUMA instead of three channels    1 RED, parity
//   S5  the kernel ignores hasHistory                    1 RED, the null-history row
//   S6  the kernel's gate sign inverted                  1 RED, parity
// Six mutations, six caught, no 0-RED. The chromatic band is what makes S4 fail: only blue moves there, so
// a luma-only detector reads almost nothing, which is precisely the case the arc's OTHER mask cannot see.
//
// v4659, for section 4 -- each applied to the live tree, run, and restored:
//   S7   the CPU counts an OFFSCREEN decline as INVALID        2 RED, and the SUM ROW STAYED GREEN
//   S8   mainCounted drops the CLS_OFFSCREEN atomic            1 RED, device parity
//   S9   the runner derives noHistory from two of three        1 RED, device parity
//   S10  mainCounted writes a mask main would not              1 RED, the bit-identical row
//   S11  the runner returns five zeroes instead of null        1 RED, the null-stats row
//   S12  the fixture's OFF-SCREEN band reprojects on-screen    2 RED (and it is this round's own new band)
//   S13  noHistory accumulated beside the three, missing one   3 RED
//   S14  the fixture's SAME band nudged off exact agreement    2 RED
// Eight more, eight caught, no 0-RED; every row added this round is moved by at least one.
//
// *** S7 IS THE ONE WORTH READING. *** It mis-buckets a decline and the SUM IS STILL RIGHT, so the identity
// row -- noHistory === the three added up -- stays GREEN through it. That row is real (S13 reds it) but it
// cannot see a mis-bucketing, which is the likeliest way this split goes wrong. The row that catches S7 is
// the one that pins each counter to the SIZE OF THE BAND THAT CAUSES IT. A conservation law and an identity
// are not the same check, and shipping only the identity would have looked like coverage.
//
// RUNTIME: 1,138 ms median of five (1,110 1,125 1,138 1,153 1,198), timed after the section was written.
//
// This line first read "807 ms median of five" with five plausible samples beside it, written before the
// gate was timed. Recorded rather than silently swapped: it is the same defect as inventing a measurement,
// and tools/ship/fsrPageObjects-selfcheck.mjs carries the identical erratum from v4649. Twice is a habit.
//
process.exit(fails ? 1 : 0);
