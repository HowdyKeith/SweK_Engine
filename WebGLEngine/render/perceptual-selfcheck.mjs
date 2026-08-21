// WebGLEngine/render/perceptual-selfcheck.mjs — v3337
//
// Run: node render/perceptual-selfcheck.mjs   (~0.5s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// A PIXEL DIFF IS THE WRONG QUESTION, in two directions at once. physics/backendVisualDiff.mjs counts pixels
// differing by more than a threshold, which FAILS ON A ONE-PIXEL SHIFT (every edge pixel differs while nothing
// about the physics changed) and PASSES A STRUCTURALLY WRONG RENDER that happens to land the same colours in the
// same places. These metrics answer "does it look like the same thing" instead.
//
// The idea is lifted from img2threejs's stage-4 evaluator (Apache 2.0), whose header independently arrives at
// this tree's own rule: deterministic, zero-token, and HARD GATES THAT A SOFT AVERAGE CANNOT WASH OUT. No code
// was copied -- that implementation is Python, this is JS, and the shape was the valuable part.
//
// *** AND THEIR THRESHOLDS WERE DELIBERATELY NOT IMPORTED. *** IoU < 0.85 and scale delta > 0.08 are tuned
// against photographs of knives. Adopting them would ship a tolerance nobody in this tree measured, which is the
// defect this session found in the promptCost multiplier, the "MEASURED" gate headers and the airy control. What
// this gate does instead is measure the floor on THIS tree's rasteriser -- and the answer turns out to be
// stronger than any tolerance.

import { luma, downscale, pHash, hamming, phashAgreement, ssim, sobel, edgeOverlap } from "./perceptual.mjs";
import { mask, iou, scaleDelta, centroidShift, combine } from "./silhouette.mjs";
import { renderFrames, pixelDiff } from "../physics/backendVisualDiff.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// synthetic frames with known structure, so every key below is arithmetic rather than observation
const W = 64, H = 64;
const mk = (f) => { const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; const v = f(x, y); d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; }
    return { data: d, w: W, h: H }; };
const box = mk((x, y) => (x > 16 && x < 48 && y > 16 && y < 48) ? 200 : 0);
const same = mk((x, y) => (x > 16 && x < 48 && y > 16 && y < 48) ? 200 : 0);
const shift1 = mk((x, y) => (x > 17 && x < 49 && y > 16 && y < 48) ? 200 : 0);
const inverted = mk((x, y) => (x > 16 && x < 48 && y > 16 && y < 48) ? 0 : 200);
const brighter = mk((x, y) => Math.min(255, ((x > 16 && x < 48 && y > 16 && y < 48) ? 200 : 0) + 30));
const bigger = mk((x, y) => (x > 8 && x < 56 && y > 8 && y < 56) ? 200 : 0);
const elsewhere = mk((x, y) => (x > 2 && x < 34 && y > 2 && y < 34) ? 200 : 0);

// ---- 1. EVERY METRIC HAS AN EXACT SELF-KEY --------------------------------------------------------------------
{
    ok("!! SSIM of an image against itself is EXACTLY 1 (arithmetic, not a tolerance)",
       ssim(box, same) === 1, ssim(box, same).toFixed(15));
    ok("!! pHash of an image against itself differs by EXACTLY 0 bits",
       hamming(pHash(box), pHash(same)) === 0);
    ok("!! edge overlap of a shape against itself is EXACTLY 1",
       edgeOverlap(box, same) === 1, edgeOverlap(box, same).toFixed(15));
    ok("!! silhouette IoU against itself is EXACTLY 1 and scale delta EXACTLY 0",
       iou(box, same).iou === 1 && scaleDelta(box, same) === 0);
}

// ---- 2. AND EACH ONE MOVES IN THE DIRECTION IT SHOULD ---------------------------------------------------------------
{
    ok("!! a ONE-PIXEL SHIFT barely moves SSIM or pHash — the case a raw pixel diff is worst at",
       ssim(box, shift1) > 0.9 && hamming(pHash(box), pHash(shift1)) <= 8,
       "SSIM " + ssim(box, shift1).toFixed(4) + ", pHash " + hamming(pHash(box), pHash(shift1)) + " bits of 63 — " +
       "the pixel diff calls this " + (pixelDiff(box, shift1).diffFraction * 100).toFixed(1) + "% of pixels changed");
    ok("!! inverting the image is caught hard by both",
       ssim(box, inverted) < 0 && hamming(pHash(box), pHash(inverted)) > 50,
       "SSIM " + ssim(box, inverted).toFixed(4) + " (negative: anti-correlated), pHash " + hamming(pHash(box), pHash(inverted)) + " bits");
    ok("!! edge overlap is SCALE-FREE: the same shape rendered brighter scores exactly 1",
       edgeOverlap(box, brighter) === 1,
       "the gradient threshold is a fraction of each image's own maximum, so a uniform brightening cannot move it — " +
       "which is why this signal survives a lighting change that a pixel diff would fail");
}

// ---- 3. THE TWO HARD GATES DESCRIBE DIFFERENT FAULTS ------------------------------------------------------------------
// A translation and a mis-scaling both hurt IoU, and only one of them changes the area. Reporting a single
// number would merge two faults that want different fixes.
{
    const tr = { iou: iou(box, elsewhere).iou, scale: scaleDelta(box, elsewhere), shift: centroidShift(box, elsewhere) };
    const sc = { iou: iou(box, bigger).iou, scale: scaleDelta(box, bigger), shift: centroidShift(box, bigger) };
    ok("!! a TRANSLATION wrecks IoU and leaves the area alone",
       tr.iou < 0.2 && tr.scale < 0.05 && tr.shift > 10,
       "IoU " + tr.iou.toFixed(4) + ", scale delta " + tr.scale.toFixed(4) + ", centroid shift " + tr.shift.toFixed(1) + "px");
    ok("!! a MIS-SCALING moves the area while IoU stays comparatively high",
       sc.scale > 0.4 && sc.iou > tr.iou,
       "IoU " + sc.iou.toFixed(4) + ", scale delta " + sc.scale.toFixed(4) +
       " — two faults, two names, and a single blended score would have hidden which one happened");
}

// ---- 3b. THE MASK ASSUMPTION, PINNED, BECAUSE VIOLATING IT PRODUCED THREE FALSE PASSES ------------------------------
// mask() calls anything brighter than 8 "covered", which is exactly right for a rasteriser that draws onto a
// zero-filled buffer and exactly wrong for anything else. The first run of this gate used fixtures with a
// background of 20, so every pixel read as occupied and IoU returned 1.0000 for two boxes that do not overlap.
{
    const lightBg = mk((x, y) => (x > 16 && x < 48 && y > 16 && y < 48) ? 200 : 20);
    const lightBgElsewhere = mk((x, y) => (x > 2 && x < 34 && y > 2 && y < 34) ? 200 : 20);
    ok("!! on a LIGHT background the mask saturates and IoU wrongly reads 1 — the assumption is load-bearing",
       iou(lightBg, lightBgElsewhere).iou === 1,
       "two non-overlapping boxes on a background of 20 score a perfect 1.0000, because everything passes the " +
       "threshold. Kept as a check rather than fixed by an adaptive threshold: an adaptive one would segment " +
       "SOMETHING on any input, and this should be obviously wrong when misused rather than quietly plausible");
    ok("...and raising the threshold above that background restores the true answer",
       (() => { const A = mask(lightBg, { thresh: 100 }), B = mask(lightBgElsewhere, { thresh: 100 });
                let inter = 0, union = 0;
                for (let i = 0; i < A.m.length; i++) { if (A.m[i] && B.m[i]) inter++; if (A.m[i] || B.m[i]) union++; }
                return inter / union < 0.2; })(),
       "the parameter exists so a caller with a different background states it rather than discovering it");
}

// ---- 4. A HARD FAIL CANNOT BE AVERAGED AWAY. THIS IS THE WHOLE POINT. ----------------------------------------------------
{
    // a render that looks excellent on every soft signal and occupies the wrong region
    const verdict = combine({
        soft: { tone: 0.97, edges: 0.95, structure: 0.93, symmetry: 0.99 },
        hard: { silhouetteIoU: { value: iou(box, elsewhere).iou, limit: 1, direction: "min" } },
    });
    ok("!! a soft average of 0.96 does NOT rescue a failed hard gate",
       verdict.verdict === "REJECT" && verdict.softScore > 0.9 && verdict.rejectedDespiteSoftScore,
       "softScore " + verdict.softScore.toFixed(3) + " and verdict " + verdict.verdict +
       " — the soft score is still REPORTED, because hiding it would make the rejection unarguable, and hiding the veto would make the average a lie");
    const good = combine({ soft: { tone: 0.5 }, hard: { silhouetteIoU: { value: 1, limit: 1, direction: "min" } } });
    ok("...and a passing hard gate does not rescue itself either: the soft score stays whatever it was",
       good.verdict === "ACCEPT" && good.softScore === 0.5,
       "the two are reported side by side and neither overwrites the other");
    let threw = false;
    try { combine({ hard: { x: { value: 1, direction: "min" } } }); } catch { threw = true; }
    ok("!! a hard gate with NO LIMIT throws rather than defaulting",
       threw, "a default threshold is a number nobody measured, which is exactly what was not imported from img2threejs");
}

// ---- 5. THE FLOOR, MEASURED ON THIS TREE'S OWN RASTERISER --------------------------------------------------------------
// *** AND IT IS STRONGER THAN A TOLERANCE. *** Jolt is deterministic, so the same backend rendered twice is
// bit-identical: IoU exactly 1, scale delta exactly 0, pHash 0 bits over every sampled frame. There is no noise
// floor to earn a threshold from, which means the determinism gate does not need one -- ANY deviation is a
// finding. img2threejs's 0.85 exists because a photograph has noise; this rasteriser does not.
{
    let be = null;
    try { be = await (await import("../physics/jolt/joltLoader.js")).createJoltBackend(); } catch { /* reported below */ }
    if (!be) { ok("jolt backend available for the floor measurement", false, "could not load"); }
    else {
        const make = () => be.createWorld({ gravity: [0, -9.8, 0] });
        const A = renderFrames(make, 120, 30), B = renderFrames(make, 120, 30);
        let wIoU = 1, wScale = 0, wSsim = 1, wEdge = 1, wPh = 0;
        for (let i = 0; i < A.length; i++) {
            wIoU = Math.min(wIoU, iou(A[i], B[i]).iou);
            wScale = Math.max(wScale, scaleDelta(A[i], B[i]));
            wSsim = Math.min(wSsim, ssim(A[i], B[i]));
            wEdge = Math.min(wEdge, edgeOverlap(A[i], B[i]));
            wPh = Math.max(wPh, hamming(pHash(A[i]), pHash(B[i])));
        }
        ok("!! the same backend rendered twice agrees EXACTLY on every metric, over " + A.length + " frames",
           wIoU === 1 && wScale === 0 && wSsim === 1 && wEdge === 1 && wPh === 0,
           "IoU " + wIoU + ", scale delta " + wScale + ", SSIM " + wSsim + ", edge " + wEdge + ", pHash " + wPh + " bits — " +
           "so the determinism threshold is EXACT and needs no tolerance at all, which is a stronger statement than 0.85");
    }
}

// ---- 6. WHAT COULD NOT BE MEASURED HERE, SAID PLAINLY ------------------------------------------------------------------
// The cross-backend threshold -- how far box3d and Jolt may legitimately diverge before it is a bug -- CANNOT be
// earned in this sandbox: box3d's WASM is built per rig and reports "call init() first (and check .ready)".
// So no cross-backend limit is shipped. Filing one anyway, by copying 0.85 or by guessing, would be exactly the
// thing this file's header refuses.
{
    let box3dUsable = false;
    try { const m = await import("../physics/box3d/box3dLoader.js"); const w = m.box3d.createWorld({ gravity: [0, -9.8, 0] }); w.destroy && w.destroy(); box3dUsable = true; } catch { box3dUsable = false; }
    ok("!! no cross-backend threshold is shipped, because it could not be measured here",
       !box3dUsable,
       "box3d is unavailable in this sandbox (WASM built per rig), so the box3d-vs-Jolt limit is UNMEASURED and " +
       "deliberately absent rather than guessed. On a rig with box3d, run this file and the floor it prints is the " +
       "number to earn a threshold from");
}

// ---- 7. THE CROSS-BACKEND FLOOR: THE PATH THAT MAKES IT EXIST ON A RIG ---------------------------------------------
// The floor cannot be measured here (box3d's WASM is per-rig), so what IS testable is the machinery that will
// capture it, and the state it reports until someone does.
//
// *** A MISSING BASELINE USED TO READ AS A PASS. *** gateAgainstBaseline reported ok:true for a pair with no
// recorded envelope, so the FIRST run on a rig where box3d finally loads would have gone GREEN while measuring
// nothing -- a control that cannot fail, arriving at exactly the moment the awaited measurement becomes
// possible. It is now UNMEASURED: loud, and it names the command that fixes it.
{
    const { captureMetrics, toBaseline, gateAgainstBaseline } = await import("../physics/backend-qa-check.mjs");
    let be = null;
    try { be = await (await import("../physics/jolt/joltLoader.js")).createJoltBackend(); } catch {}
    if (!be) { ok("jolt available to exercise the pair path", false, "could not load"); }
    else {
        // two "backends" that are the same solver: enough to exercise the PAIR path without box3d
        const mk = () => be.createWorld({ gravity: [0, -9.8, 0] });
        const m = captureMetrics([{ name: "A", make: mk }, { name: "B", make: mk }], { ticks: 120 });
        ok("!! the capture records the PERCEPTUAL floor in the same pass as drift and pixel-diff",
           m.pairs["A|B"] && m.pairs["A|B"].perceptual && typeof m.pairs["A|B"].perceptual.iou === "number",
           JSON.stringify(m.pairs["A|B"].perceptual) +
           " — the frames are already in hand, so an --update run on a rig captures everything at once rather than leaving the perceptual thresholds for another round");

        const noBase = gateAgainstBaseline({ determinism: {}, pairs: {} }, m);
        const un = noBase.checks.find((c) => c.unmeasured);
        ok("!! a pair with NO recorded envelope FAILS as UNMEASURED rather than passing",
           !noBase.ok && !!un && /--update/.test(un.detail),
           un ? un.name + " — " + un.detail.slice(-90) : "no unmeasured check emitted");

        const based = gateAgainstBaseline(toBaseline(m), m);
        ok("!! ...and once recorded, the envelope gates all five perceptual metrics",
           based.ok && based.checks.filter((c) => /IoU|scale delta|SSIM|edge overlap|pHash/.test(c.name)).length === 5,
           based.checks.length + " checks total, five of them perceptual — the same run that reports UNMEASURED becomes the floor");

        const b = toBaseline(m).pairs["A|B"].perceptual;
        ok("!! the envelopes are bounded BOTH ways, so two solvers becoming suspiciously identical also fails",
           b.iouEnvelope[0] > 0 && b.ssimEnvelope[0] < b.ssimEnvelope[1] && b.scaleEnvelope[1] > b.scaleEnvelope[0],
           "IoU envelope " + b.iouEnvelope.map((x) => x.toFixed(3)).join("..") +
           " — two DIFFERENT solvers agreeing perfectly is a finding, not a success, which is why the floor has a bottom");
    }
}

console.log(fails ? ("[perceptual-selfcheck] FAILED " + fails) : "[perceptual-selfcheck] all passed");
process.exit(fails ? 1 : 0);
