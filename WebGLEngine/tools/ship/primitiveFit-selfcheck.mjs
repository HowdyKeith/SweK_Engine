#!/usr/bin/env node
// tools/ship/primitiveFit-selfcheck.mjs -- v4220
//
// Run: node tools/ship/primitiveFit-selfcheck.mjs      (pure, no GL, no canvas; trains, so not instant)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES fx/primitiveFit.mjs, brain/rl/paintEnv.js, and the second omission this round found in
// brain/rl/dockPolicy.js's trainer.
//
// *** THE TWO IDEAS TAKEN FROM ondras/primitive.js (MIT) ARE BOTH CHECKABLE, SO THEY ARE CHECKED. *** The
// colour is claimed to be the EXACT least-squares optimum, so section 2 grid-searches all 256 values of a
// channel and asserts nothing beats it. The score is claimed to be computable over the shape rather than the
// picture, so section 4 computes it both ways and asserts they agree to the bit.
//
// The failures watched for are the ones that leave a fitter which RUNS and quietly lies:
//   * a shape wholly off-canvas producing spans, so the colour divides by zero and NaN scores as a huge win;
//   * the score modelling an ideal composite while the canvas stores 8-bit, so the reported distance drifts
//     optimistic and the drift COMPOUNDS with every shape;
//   * a deterministic policy with nothing to vary on, proposing one rejected shape twenty times;
//   * and a trainer that silently gives a 5-action environment a 2-action policy.
import {
    KINDS, DEFAULTS, blank, averageColour, cloneImage, pointsOf, spansOf, areaOf, quantise, optimalColour,
    difference, distanceOf, differenceChange, drawShape, randomShape, mutateShape, fitStep, fit, mulberry32,
} from "../../fx/primitiveFit.mjs";
import { PaintEnv, makeTarget, OBS_DIM, ACT_DIM, GRID } from "../../brain/rl/paintEnv.js";
import { trainDockES, evaluate, FlightPolicy } from "../../brain/rl/dockPolicy.js";
import { dims } from "../../render/perceptual.mjs";
import { codeOnly } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("primitiveFit-selfcheck -- a colour that is solved, and a score that is local\n");

const W = 48, H = 48;
const TARGET = makeTarget(W, H, 42);
const CANVAS = blank(W, H, averageColour(TARGET));

// ---- 1. RASTERISATION -------------------------------------------------------------------------------------
console.log("1. the scanline: every span clipped to the canvas, and an off-canvas shape covering nothing");
{
    const full = spansOf({ kind: "rect", x: 0, y: 0, w: W, h: H }, W, H);
    ok("a rect covering the canvas covers exactly every pixel", areaOf(full) === W * H, areaOf(full) + " of " + W * H);
    for (const s of [{ kind: "rect", x: -500, y: -500, w: 10, h: 10 },
                     { kind: "triangle", x1: 900, y1: 900, x2: 950, y2: 900, x3: 900, y3: 950 },
                     { kind: "ellipse", x: -80, y: -80, rx: 5, ry: 5 }]) {
        if (spansOf(s, W, H).length !== 0) fails++;
    }
    ok("!! a shape entirely off-canvas produces NO spans -- so nothing ever averages over zero pixels", true,
        "rect, triangle and ellipse all checked");
    const half = spansOf({ kind: "rect", x: -W / 2, y: 0, w: W, h: H }, W, H);
    ok("a half-off shape is clipped, not dropped", areaOf(half) > 0 && areaOf(half) < W * H,
        areaOf(half) + " px");
    // every span is inside the canvas, for every kind
    const rng = mulberry32(9);
    let bad = 0;
    for (let i = 0; i < 400; i++) {
        const s = randomShape(KINDS[(rng() * KINDS.length) | 0], W, H, rng);
        for (const [y, x0, x1] of spansOf(s, W, H)) if (y < 0 || y >= H || x0 < 0 || x1 > W || x1 <= x0) bad++;
    }
    ok("!! 400 random shapes of all four kinds produce only in-bounds, non-empty spans", bad === 0);
    ok("a rotated rect really rotates -- its corners move with the angle",
        JSON.stringify(pointsOf({ kind: "rotatedRect", x: 10, y: 10, w: 8, h: 4, angle: 0 }))
        !== JSON.stringify(pointsOf({ kind: "rotatedRect", x: 10, y: 10, w: 8, h: 4, angle: 0.7 })));
    const e = spansOf({ kind: "ellipse", x: 24, y: 24, rx: 10, ry: 10 }, W, H);
    const circle = Math.PI * 100;
    ok("an ellipse's area is within 5% of pi*rx*ry", Math.abs(areaOf(e) - circle) / circle < 0.05,
        areaOf(e) + " vs " + circle.toFixed(0));
}

// ---- 2. THE COLOUR IS SOLVED ------------------------------------------------------------------------------
console.log("\n2. *** THE ANALYTIC COLOUR IS THE EXACT LEAST-SQUARES OPTIMUM, NOT A GOOD GUESS ***");
{
    // *** THE THEOREM IS ABOUT THE CONTINUOUS OBJECTIVE, AND THIS GATE'S FIRST DRAFT CONFLATED THE TWO. ***
    // The derivation minimises (t - cur(1-a) - c*a)^2, which is smooth in c. What the canvas STORES is that
    // value rounded to 8 bits, and a step function has no such guarantee -- so an adjacent integer can be a
    // hair better in rare cases. Asserting "nothing beats it" against the quantised score therefore FAILED,
    // 7 times in 9216, and the failure was in the claim rather than in the code. Both are now stated exactly.
    const contDelta = (target, current, spans, colour, alpha) => {
        const t = dims(target), c = dims(current);
        let d = 0;
        for (const [y, x0, x1] of spans) for (let x = x0; x < x1; x++) {
            const i = (y * t.w + x) * 4;
            for (let k = 0; k < 3; k++) {
                const tv = t.data[i + k], cv = c.data[i + k], nv = cv * (1 - alpha) + colour[k] * alpha;
                d += (tv - nv) * (tv - nv) - (tv - cv) * (tv - cv);
            }
        }
        return d;
    };
    let checked = 0, contBeaten = 0, quantBeaten = 0, worstMargin = 0, interior = 0;
    for (const shape of [{ kind: "ellipse", x: 16, y: 18, rx: 9, ry: 7 },
                         { kind: "rect", x: 4, y: 30, w: 20, h: 12 },
                         { kind: "triangle", x1: 30, y1: 4, x2: 45, y2: 20, x3: 26, y3: 22 },
                         { kind: "rotatedRect", x: 24, y: 24, w: 22, h: 9, angle: 0.9 }]) {
        for (const alpha of [0.3, 0.5, 0.8]) {
            const spans = spansOf(shape, W, H);
            const opt = optimalColour(TARGET, CANVAS, spans, alpha);
            const mq = differenceChange(TARGET, CANVAS, spans, opt, alpha);
            const mc = contDelta(TARGET, CANVAS, spans, opt, alpha);
            for (let k = 0; k < 3; k++) {
                if (opt[k] > 0 && opt[k] < 255) interior++;
                for (let v = 0; v < 256; v++) {
                    const c = opt.slice(); c[k] = v;
                    if (contDelta(TARGET, CANVAS, spans, c, alpha) < mc - 1e-9) contBeaten++;
                    const q = differenceChange(TARGET, CANVAS, spans, c, alpha);
                    if (q < mq - 1e-9) { quantBeaten++; worstMargin = Math.max(worstMargin, (mq - q) / Math.abs(mq)); }
                }
                checked++;
            }
        }
    }
    ok("!! *** NO COLOUR BEATS IT ON THE OBJECTIVE THE DERIVATION IS ABOUT *** -- " + checked
       + " channels x 256 values, exhaustive", contBeaten === 0, contBeaten + " of " + (checked * 256));
    ok("!! ...and once the composite is stored as 8 bits, the closed form is beaten only negligibly",
        quantBeaten <= checked * 256 * 0.002 && worstMargin < 1e-3,
        `${quantBeaten} of ${checked * 256} = ${(100 * quantBeaten / (checked * 256)).toFixed(3)}%, `
        + `by at most ${(worstMargin * 100).toExponential(2)}% of the improvement -- rounding, not a wrong formula`);
    ok("...and this is not vacuous: the optimum is strictly INTERIOR (not pinned at 0 or 255) in most cases",
        interior >= checked / 2, interior + " of " + checked + " channels interior");
    ok("a shape covering nothing returns null rather than dividing by zero",
        optimalColour(TARGET, CANVAS, [], 0.5) === null);
}

// ---- 3. THE QUANTISATION ----------------------------------------------------------------------------------
console.log("\n3. *** THE CANVAS STORES 8-BIT AND ROUNDS HALF TO EVEN -- the score must model that ***");
{
    const probe = new Uint8ClampedArray(1);
    let mism = 0;
    for (let v = -3; v <= 258; v += 0.25) { probe[0] = v; if (probe[0] !== quantise(v)) mism++; }
    ok("!! quantise() matches Uint8ClampedArray exactly, including the .5 cases and both clamps", mism === 0,
        "1045 values checked; Uint8Clamped(0.5)=0 and (1.5)=2, which round() gets wrong");
    // the drift this fixed, asserted end to end at three shape counts
    let worst = 0, at = 0;
    for (const n of [10, 40, 120]) {
        const r = fit(TARGET, { shapes: n, alpha: 0.55, candidates: 30, mutations: 15, seed: 5 });
        const d = Math.abs(r.difference - difference(TARGET, r.canvas));
        if (d > worst) { worst = d; at = n; }
    }
    ok("!! the ACCUMULATED error equals the TRUE error exactly, at 10, 40 and 120 shapes", worst === 0,
        worst ? `off by ${worst} at ${at} shapes` : "drift 0 -- it was 0.13% at 10 and 2.38% at 120 before");
}

// ---- 4. THE SCORE IS LOCAL --------------------------------------------------------------------------------
console.log("\n4. *** THE SCORE IS COMPUTED OVER THE SHAPE, AND AGREES WITH THE WHOLE PICTURE EXACTLY ***");
{
    const rng = mulberry32(3);
    let worst = 0, area = 0, n = 0;
    for (let i = 0; i < 40; i++) {
        const s = randomShape(KINDS[(rng() * KINDS.length) | 0], W, H, rng);
        const spans = spansOf(s, W, H);
        if (!spans.length) continue;
        const colour = optimalColour(TARGET, CANVAS, spans, 0.5);
        const local = differenceChange(TARGET, CANVAS, spans, colour, 0.5);
        const c2 = cloneImage(CANVAS);
        drawShape(c2, spans, colour, 0.5);
        const whole = difference(TARGET, c2) - difference(TARGET, CANVAS);
        worst = Math.max(worst, Math.abs(local - whole));
        area += areaOf(spans); n++;
    }
    ok("!! over " + n + " random shapes the two agree to the bit", worst === 0, "worst disagreement " + worst);
    ok("...and that is why it is worth doing: the mean shape touches a fraction of the picture",
        area / n < W * H, `${(area / n).toFixed(0)} px of ${W * H} = ${(W * H / (area / n)).toFixed(1)}x less work per candidate`);
}

// ---- 5. THE FIT ------------------------------------------------------------------------------------------
console.log("\n5. the search: monotone, and it actually approximates the picture");
{
    const r = fit(TARGET, { shapes: 60, alpha: 0.55, candidates: 40, mutations: 20, seed: 7 });
    ok("!! the distance never increases -- a step that cannot improve is discarded, not drawn",
        r.trace.every((v, i) => i === 0 || v <= r.trace[i - 1] + 1e-15));
    ok("!! 60 shapes get most of the way there", r.distance < r.trace[0] * 0.4,
        `${r.trace[0].toFixed(4)} -> ${r.distance.toFixed(4)} (${(100 * (1 - r.distance / r.trace[0])).toFixed(1)}% closer)`);
    const again = fit(TARGET, { shapes: 60, alpha: 0.55, candidates: 40, mutations: 20, seed: 7 });
    ok("it is deterministic in its seed", again.distance === r.distance);
    ok("a different seed gives a different fit", fit(TARGET, { shapes: 60, alpha: 0.55, candidates: 40, mutations: 20, seed: 8 }).distance !== r.distance);
}

// ---- 6. THE ENVIRONMENT ------------------------------------------------------------------------------------
console.log("\n6. the painting environment, on the same drop-in interface as dock, rocket and drive");
{
    const env = new PaintEnv({ maxSteps: 20 });
    const o = env.reset(1);
    ok("obsDim/actDim are exported and match the instance", env.obsDim === OBS_DIM && env.actDim === ACT_DIM,
        `${OBS_DIM} obs, ${ACT_DIM} act`);
    ok("!! every element of reset()'s observation is finite", Array.from(o).every(Number.isFinite));
    const r = env.step([0.1, 0.2, 0.3, 0.4, 0.5]);
    ok("step returns { obs, reward, done, info } with the keys rollout reads",
        r.obs instanceof Float32Array && "docked" in r.info && "crashed" in r.info);
    // the canvas is monotone because non-improvements are rejected
    const e2 = new PaintEnv({ maxSteps: 40 });
    let ob = e2.reset(5), prev = e2.distance(), mono = true;
    const rng = mulberry32(2);
    for (let t = 0; t < 40; t++) {
        ob = e2.step([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1]).obs;
        if (e2.distance() > prev + 1e-15) mono = false;
        prev = e2.distance();
    }
    ok("!! a shape that would make the picture worse is REJECTED, so the canvas only improves", mono,
        `${e2.placed} placed, ${e2.rejected} rejected`);
    ok("targets vary with the seed -- the policy cannot memorise one picture",
        difference(makeTarget(32, 32, 1), makeTarget(32, 32, 2)) > 0);
}

// ---- 7. VARIATION, AND THE TRAINER OMISSION ----------------------------------------------------------------
console.log("\n7. *** TWO WAYS A POLICY IS SILENTLY UNABLE TO DO THE TASK ***");
{
    const p = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM, seed: 3 });
    const env = new PaintEnv({ maxSteps: 20 });
    let o = env.reset(900000);
    const acts = new Set();
    for (let t = 0; t < 20; t++) { const a = Array.from(p.act(o)); acts.add(a.join(",")); o = env.step(a).obs; }
    ok("!! a deterministic policy still proposes 20 DIFFERENT shapes -- it had 2, and 19 were rejected",
        acts.size >= 18, acts.size + " distinct actions in 20 steps");
    // the same episode seed must replay identically, or no evaluation in this file means anything
    const replay = new PaintEnv({ maxSteps: 20 });
    let o2 = replay.reset(900000); const acts2 = [];
    for (let t = 0; t < 20; t++) { const a = Array.from(p.act(o2)); acts2.push(a.join(",")); o2 = replay.step(a).obs; }
    ok("...and the variation is drawn from the EPISODE SEED, so a replay is identical",
        acts2.every((a) => acts.has(a)) && replay.distance() === env.distance());

    // *** THE OMISSION: the trainer built its policy with obsDim and NOT actDim. ***
    const mk = (opts = {}) => new PaintEnv({ maxSteps: 5, ...opts });
    const ev = evaluate(new FlightPolicy({ hidden: [8], obsDim: OBS_DIM, actDim: ACT_DIM }).getParams(),
                        { envFactory: mk, obsDim: OBS_DIM, actDim: ACT_DIM, hidden: [8], maxSteps: 5, episodes: 2 });
    ok("evaluate() drives a 5-action env without throwing", Number.isFinite(ev.avgReturn));
    const probeEnv = mk();
    const built = new FlightPolicy({ hidden: [8], obsDim: probeEnv.obsDim, actDim: probeEnv.actDim });
    ok("!! *** THE POLICY'S ACTION WIDTH COMES FROM THE ENV -- it was hard-wired to 2 ***",
        built.act(probeEnv.reset(1)).length === ACT_DIM,
        `${built.act(probeEnv.reset(1)).length} outputs for an env wanting ${ACT_DIM}; before v4220 it was 2, so width, height and angle were undefined`);
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "brain", "rl", "dockPolicy.js"), "utf8"));
    ok("...because trainDockES and evaluate both forward actDim now",
        /actDim:\s*opts\.actDim\s*\|\|\s*env\.actDim/.test(src) && /const actDim = opts\.actDim \|\| probe\.actDim/.test(src));
}

// ---- 8. IT LEARNS, AND WHAT IT DOES NOT BEAT ---------------------------------------------------------------
console.log("\n8. *** THE RESULT, AGAINST A MEASURED NOISE FLOOR RATHER THAN AGAINST NOTHING ***");
{
    const STEPS = 20, mk = (o = {}) => new PaintEnv({ maxSteps: STEPS, ...o });
    const HELD = Array.from({ length: 24 }, (_, k) => 900000 + k * 2237);
    const lcg = (s) => { let x = s >>> 0 || 1; return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; }; };
    const improvementOf = (act) => {
        let imp = 0;
        for (const s of HELD) { const e = mk(); let o = e.reset(s);
            for (let t = 0; t < STEPS; t++) o = e.step(act(o, t)).obs;
            imp += e.startDistance - e.distance(); }
        return imp / HELD.length;
    };
    // THE NOISE FLOOR: eight independent random painters on the same pictures.
    const runs = [];
    for (let k = 0; k < 8; k++) { const r = lcg(1000 + k * 7919); runs.push(improvementOf(() => [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1])); }
    const rMean = runs.reduce((a, b) => a + b) / runs.length;
    const rSd = Math.sqrt(runs.reduce((a, b) => a + (b - rMean) ** 2, 0) / runs.length);
    console.log(`  RANDOM floor (8 painters):  ${rMean.toFixed(4)} +/- ${rSd.toFixed(4)}`);

    // The obvious heuristic, which is WORSE than random and is why "it does not aim" was the wrong reading.
    const aimed = improvementOf((o) => {
        const g = Array.from(o).slice(0, GRID * GRID);
        let bi = 0; for (let i = 1; i < g.length; i++) if (g[i] > g[bi]) bi = i;
        const r = lcg(bi + 7);
        return [((bi % GRID + 0.5) / GRID) * 2 - 1, (((bi / GRID) | 0) + 0.5) / GRID * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1];
    });
    console.log(`  AIM AT THE WORST CELL:      ${aimed.toFixed(4)}`);
    ok("!! *** THE OBVIOUS HEURISTIC IS WORSE THAN RANDOM *** -- a shape's EXTENT matters more than its centre",
        aimed < rMean, `${aimed.toFixed(4)} vs ${rMean.toFixed(4)}; and a shape centred in a corner cell falls half off-canvas`);

    const untrained = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM, seed: 3 });
    const before = improvementOf((o) => untrained.act(o));
    const t0 = Date.now();
    const res = trainDockES({ envFactory: mk, obsDim: OBS_DIM, actDim: ACT_DIM, hidden: [16, 16], maxSteps: STEPS,
                              iters: 150, pop: 24, sigma: 0.14, lr: 0.05, seed: 3, trainEps: 8 });
    const trained = new FlightPolicy({ hidden: [16, 16], obsDim: OBS_DIM, actDim: ACT_DIM }).setParams(res.params);
    const after = improvementOf((o) => trained.act(o));
    const sd = (after - rMean) / (rSd || 1e-9);
    console.log(`  UNTRAINED policy:           ${before.toFixed(4)}`);
    console.log(`  TRAINED policy:             ${after.toFixed(4)}   (${sd.toFixed(1)} sd above the random floor, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    ok("an untrained policy is far below even random placement", before < rMean / 2);
    ok("!! *** the trained policy beats the random floor by more than 3 sd, on held-out pictures ***", sd > 3,
        `${((after / rMean - 1) * 100).toFixed(1)}% better than random, ${sd.toFixed(1)} sd`);

    // AND WHAT IT DOES NOT BEAT, measured in the same run so the comparison cannot rot.
    let searchImp = 0;
    for (const s of HELD.slice(0, 8)) {
        const e = mk(); e.reset(s);
        const rng = mulberry32(s);
        for (let t = 0; t < STEPS; t++) {
            const st = fitStep(e.target, e.canvas, { alpha: e.alpha, candidates: 60, mutations: 30, patience: 10, kinds: ["rotatedRect"], rng });
            if (st && st.delta < 0) { drawShape(e.canvas, st.spans, st.colour, e.alpha); e.diff += st.delta; }
        }
        searchImp += e.startDistance - e.distance();
    }
    searchImp /= 8;
    console.log(`  RANDOM SEARCH, 90 evals/shape: ${searchImp.toFixed(4)}`);
    ok("!! and it does NOT beat random search given 90x the evaluations -- stated, not hidden",
        searchImp > after, `search ${searchImp.toFixed(4)} vs policy ${after.toFixed(4)} at 1 evaluation per shape`);
}

// ---- 9. DISCIPLINE ------------------------------------------------------------------------------------------
console.log("\n9. one image convention, one fitter, no second copy of either");
{
    const fitSrc = codeOnly(fs.readFileSync(path.join(ROOT, "fx", "primitiveFit.mjs"), "utf8"));
    const envSrc = codeOnly(fs.readFileSync(path.join(ROOT, "brain", "rl", "paintEnv.js"), "utf8"));
    ok("!! both import dims() from render/perceptual.mjs rather than reading w/width themselves",
        /import \{ dims \}/.test(fitSrc) && /dims/.test(envSrc));
    ok("!! the env drives fx/primitiveFit.mjs and owns no rasteriser or colour solver of its own",
        /spansOf|optimalColour|differenceChange/.test(envSrc) && !/function spansOf|function optimalColour/.test(envSrc));
    ok("the env brings no trainer -- trainDockES drives it, as the fourth environment on that one trainer",
        !/function train/.test(envSrc));
    ok("the fitter needs no canvas, no DOM and no GL", !/document|canvas\.getContext|createElement/.test(fitSrc));
    ok("KINDS and DEFAULTS are frozen, so a caller cannot mutate them for everyone else",
        Object.isFrozen(KINDS) && Object.isFrozen(DEFAULTS));
}

console.log("\n----  WHAT THIS DOES NOT CLAIM");
console.log("      THAT THE LEARNED PAINTER IS THE BEST WAY TO FIT A PICTURE. It is not: random search with");
console.log("      90 evaluations per shape beats it comfortably, and section 8 measures that rather than");
console.log("      leaving it out. What the policy buys is a better shape PER EVALUATION -- one forward pass");
console.log("      against ninety rasterisations -- which is the comparison that matters if the shapes ever");
console.log("      have to be proposed in real time. Nothing here says the pictures are pretty.");

console.log("\nprimitiveFit-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
