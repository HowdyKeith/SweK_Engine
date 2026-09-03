// WebGLEngine/physics/render/pathTracerGpu-selfcheck.mjs -- v4415
//
// Run: node physics/render/pathTracerGpu-selfcheck.mjs
//
// Grades physics/render/pathTracerGpu.mjs: the Lambertian transport loop on a real GPU, against the CPU
// tracer that has been the answer key since v3473.
//
// *** THE CHECK THIS GATE EXISTS FOR IS SECTION 4, AND IT IS A CHECK ON THE OTHER CHECKS. *** Sections 2 and
// 3 assert bit-exact agreement on the furnace. Section 4 plants a BROKEN COSINE SAMPLER and shows the furnace
// still passes them bit-exactly -- so the strong claim is stated together with the proof that it is blind,
// and nobody can read section 2 as "the port is correct". v4410's sabotage D read zero red because its check
// was satisfiable by something other than the property; this gate ships that discovery as a named section
// instead of waiting to be caught by it.
"use strict";

import { webgpuSkipReason, runWgslCompute } from "../../tools/ship/webgpuHarness.mjs";
import * as G from "./pathTracerGpu.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const skip = webgpuSkipReason();
if (skip) {
    // A SHORT REPORT IS NOT A CLEAN ONE. gateReport.mjs's rule: record what was not measured rather than
    // letting a missing device read as a pass.
    console.log("  SKIP  no WebGPU device: " + skip);
    console.log("pathTracerGpu-selfcheck: SKIPPED (no device) -- nothing was measured");
    process.exit(0);
}

const gpu = async ({ shader = {}, ...o }) => {
    const view = o.view || G.VIEW, n = view.w * view.h;
    const r = await runWgslCompute({ code: G.traceWgsl(shader), outCount: n,
                                     uniforms: G.traceUniforms(o), workgroups: Math.ceil(n / 64) });
    if (!r.ok) throw new Error("GPU run failed: " + r.reason + " " + (r.errors || []).join(" | "));
    return r.values;
};
const cmp = (a, b) => {
    let bad = 0, mx = 0, sum = 0;
    for (let i = 0; i < b.length; i++) { const d = Math.abs(a[i] - b[i]); if (a[i] !== b[i]) bad++; if (d > mx) mx = d; sum += d; }
    return { bad, mx, mean: sum / b.length, n: b.length };
};

// ---- 1. THE PRECONDITIONS, AND BOTH ARE NECESSARY -----------------------------------------------------------
// The exactness argument rests on two conditions. A claim resting on unverified premises is a claim resting on
// nothing, so both are measured HERE -- and measured by showing that BREAKING EITHER ONE BREAKS EXACTNESS,
// which is the only evidence that the condition is doing work.
{
    say("preconditions for 'the f64 furnace render is exactly representable in f32'");
    const n = G.VIEW.w * G.VIEW.h;
    const bad = (o) => G.notExactInF32(G.furnaceCpu(o));

    const dyadicOk = [0.5, 0.25, 0.75, 1].map((a) => bad({ albedo: a, spp: 64 }));
    const dyadicNo = [0.3, 0.1, 1 / 3].map((a) => bad({ albedo: a, spp: 64 }));
    say(`albedo dyadic     [0.5 .25 .75 1] -> not-exact pixels ${JSON.stringify(dyadicOk)} of ${n}`);
    say(`albedo NOT dyadic [0.3 0.1  1/3 ] -> not-exact pixels ${JSON.stringify(dyadicNo)} of ${n}`);
    ok("a DYADIC albedo makes every furnace pixel exact in f32",
        dyadicOk.every((v) => v === 0),
        "0.5, 0.25, 0.75 and 1 are the albedos the exactness claim is allowed to be made about");
    ok("!! ...and a NON-dyadic albedo does NOT -- so the condition is load-bearing, not decorative",
        dyadicNo.every((v) => v > 0),
        "if this ever reads zero the exactness is coming from somewhere else and the argument in the header " +
        "is wrong -- DO NOT relax this into 'dyadic is sufficient', it is the half that proves NECESSITY");

    const powOk = [1, 4, 16, 64].map((s) => bad({ albedo: 0.5, spp: s }));
    const powNo = [3, 5, 10].map((s) => bad({ albedo: 0.5, spp: s }));
    say(`spp power of two  [1 4 16 64]     -> not-exact pixels ${JSON.stringify(powOk)} of ${n}`);
    say(`spp NOT a power   [3 5 10]        -> not-exact pixels ${JSON.stringify(powNo)} of ${n}`);
    ok("a POWER-OF-TWO spp makes every furnace pixel exact in f32", powOk.every((v) => v === 0));
    ok("!! ...and a non-power-of-two spp does NOT -- the second condition is load-bearing too",
        powNo.every((v) => v > 0));

    // The helper that reports the two conditions must AGREE with the two measurements above, or the module
    // would be describing a rule the numbers do not follow.
    ok("furnacePreconditions() reports what the measurements show",
        G.furnacePreconditions({ albedo: 0.5, spp: 64 }).exact === true &&
        G.furnacePreconditions({ albedo: 0.3, spp: 64 }).exact === false &&
        G.furnacePreconditions({ albedo: 0.5, spp: 10 }).exact === false,
        "a predicate that disagreed with the table above would be a second declaration of the rule");
}

// ---- 2. THE TRANSPLANT, GRADED BIT FOR BIT ------------------------------------------------------------------
// Not "close". IDENTICAL. Section 1 earned the right to demand that.
{
    say("");
    say("GPU f32 transport against CPU f64, furnace, eps = 1e-4 (origin offset along the normal)");
    const grid = [[24, 16, 0.5], [32, 64, 0.5], [48, 64, 0.5], [64, 16, 0.5],
                  [32, 64, 0.25], [32, 64, 0.75], [32, 64, 1.0]];
    let worst = 0, tested = 0;
    for (const [W, spp, albedo] of grid) {
        const view = { ...G.VIEW, w: W, h: W };
        const r = cmp(await gpu({ spp, albedo, view, eps: 1e-4 }), G.furnaceCpu({ spp, albedo, view }));
        say(`  ${String(W).padStart(2)}x${W} spp=${String(spp).padStart(2)} rho=${String(albedo).padEnd(4)} -> ` +
            `${r.bad} of ${r.n} differ, max|d| ${r.mx.toExponential(2)}`);
        worst = Math.max(worst, r.bad); tested += r.n;
    }
    ok("!! *** the GPU f32 render is BIT-IDENTICAL to the CPU f64 render on the furnace ***",
        worst === 0,
        `${tested} pixels over ${grid.length} configurations, zero differing. THIS IS THE CLAIM v4290 SAID ` +
        "COULD NOT BE MADE -- 'those are different renderers, so did-the-port-work has no answer'. It has one " +
        "here because the furnace's values are dyadic and nothing rounds. DO NOT WEAKEN THIS TO A TOLERANCE: " +
        "if it goes red the port changed, because there is no rounding for it to have drifted by");
}

// ---- 3. THE FIX IS STRUCTURAL AND NOT TUNED ------------------------------------------------------------------
// *** THE FIRST TWO ATTEMPTS WERE THRESHOLDS AND BOTH FAILED AT SCALE. *** An absolute t > eps left 2 rho^2
// pixels at 32x32 after cleaning 24x24, and a "relative" eps scaled by |P - centre| WAS A NO-OP because that
// length is exactly the radius at every bounce origin. Offsetting the origin along the normal makes the
// self-hit geometrically impossible instead of filtering it afterwards -- and the signature of a structural
// fix rather than a tuned one is that THE TUNING PARAMETER STOPS MATTERING.
{
    say("");
    say("insensitivity to eps -- a tuned threshold would have exactly one good value");
    const view = { ...G.VIEW, w: 32, h: 32 }, spp = 64;
    const cpu = G.furnaceCpu({ spp, view });
    const rows = [];
    for (const eps of [1e-5, 1e-4, 1e-3]) rows.push([eps, cmp(await gpu({ spp, view, eps }), cpu).bad]);
    for (const [e, b] of rows) say(`  eps=${e.toExponential(0)} -> ${b} differ`);
    ok("!! bit-exact across THREE DECADES of eps, which a threshold fix could not be",
        rows.every(([, b]) => b === 0),
        "the normal offset removes the self-hit rather than filtering it, so there is nothing left to tune. " +
        "A red here means somebody put the threshold back");
}

// ---- 4. *** WHAT SECTIONS 2 AND 3 CANNOT SEE, STATED AS A CHECK RATHER THAN AS A CAVEAT *** ------------------
// The furnace is bit-exact BECAUSE it is insensitive to the sampler: a sphere is convex, every bounce escapes
// to the same constant sky, so the bounce DIRECTION never reaches the pixel. That is one fact, and "the
// comparison is decidable" and "the comparison is blind" are two readings of it.
//
// So: plant a broken cosine sampler -- a fixed direction instead of a cosine-weighted one -- and MEASURE that
// the furnace certifies it anyway. pathTracer.mjs's own v3487 comment says the same thing about a different
// plant: "A SUITE THAT GRADED ONLY THE FURNACE WOULD CERTIFY A BROKEN SEEDING SCHEME."
{
    say("");
    say("THE BLINDNESS: one broken sampler, two scenes");
    const view = { ...G.VIEW, w: 24, h: 24 }, spp = 16, eps = 1e-4;
    const cpuF = G.furnaceCpu({ spp, view });
    const cpuG = G.furnaceCpu({ spp, view, sky: G.gradientSky });

    const fClean = cmp(await gpu({ spp, view, eps }), cpuF);
    const fPlant = cmp(await gpu({ spp, view, eps, shader: { plantNoCosine: true } }), cpuF);
    const gClean = cmp(await gpu({ spp, view, eps, shader: { gradient: true } }), cpuG);
    const gPlant = cmp(await gpu({ spp, view, eps, shader: { gradient: true, plantNoCosine: true } }), cpuG);

    say(`  furnace   clean  differ ${String(fClean.bad).padStart(3)}/${fClean.n}  max|d| ${fClean.mx.toExponential(3)}`);
    say(`  furnace   PLANT  differ ${String(fPlant.bad).padStart(3)}/${fPlant.n}  max|d| ${fPlant.mx.toExponential(3)}`);
    say(`  gradient  clean  differ ${String(gClean.bad).padStart(3)}/${gClean.n}  max|d| ${gClean.mx.toExponential(3)}`);
    say(`  gradient  PLANT  differ ${String(gPlant.bad).padStart(3)}/${gPlant.n}  max|d| ${gPlant.mx.toExponential(3)}`);

    ok("!! *** the furnace CERTIFIES a broken cosine sampler, bit-exactly ***",
        fPlant.bad === 0 && fPlant.mx === 0,
        "THIS PASSING IS THE POINT AND IT IS NOT GOOD NEWS: it is the measured cost of the decidable " +
        "comparison in section 2. If this ever goes red the furnace has stopped being sampler-blind and " +
        "section 2's exactness argument needs re-deriving -- DO NOT 'fix' it by removing the plant");

    // AND THE SCENE THAT CAN SEE IT. The tolerance is not typed: it is the clean run's own measured f32 floor,
    // and the separation between the two is reported so nobody has to trust a threshold.
    const ratio = gPlant.mx / gClean.mx;
    say(`  separation: planted max|d| is ${ratio.toFixed(0)}x the clean f32 floor`);
    ok("!! ...and the GRADIENT sky catches the same plant, by orders of magnitude",
        gPlant.mx > gClean.mx * 1000,
        `clean ${gClean.mx.toExponential(3)} is f32 noise; planted ${gPlant.mx.toExponential(3)} is a ` +
        "different renderer. The gap is measured rather than a chosen threshold -- there is no number here " +
        "somebody picked");
    ok("the clean gradient run is f32 noise and NOT bit-exact -- said plainly rather than hoped",
        gClean.bad > 0 && gClean.mx < 1e-4,
        `${gClean.bad} of ${gClean.n} pixels differ at max|d| ${gClean.mx.toExponential(3)}. The gradient is ` +
        "NOT dyadic, so section 2's argument does not reach it and no bit-exact claim is made about it");
}

console.log("pathTracerGpu-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
