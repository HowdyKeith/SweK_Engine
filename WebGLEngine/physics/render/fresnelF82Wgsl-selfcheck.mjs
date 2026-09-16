#!/usr/bin/env node
// WebGLEngine/physics/render/fresnelF82Wgsl-selfcheck.mjs -- v4584
//
// Run: node physics/render/fresnelF82Wgsl-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// *** F82-TINT, ASKED ON A REAL DEVICE RATHER THAN A MODEL OF ONE. *** fresnelF82.mjs's own construction is
// graded at f64 in fresnelF82-selfcheck.mjs. This dispatches the WGSL twin through tools/ship/headlessGpu.mjs's
// native Dawn/SwiftShader path (no browser launch -- splitSumWgsl-selfcheck.mjs's own convention) and compares
// the device's f32 output against the SAME CPU calls, same (f0, b, cosI) grid. Disagreement is reported as a
// number, not assumed to be zero and not assumed to fit a tolerance picked before the device answered.
"use strict";
import { runWgslComputeNative, headlessGpuSkipReason } from "../../tools/ship/headlessGpu.mjs";
import { F82_TINT_WGSL, packF82Params } from "./fresnelF82Wgsl.mjs";
import { f82Tint } from "./fresnelF82.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (s) => console.log("  ----  " + s);

async function main() {
    const skip = headlessGpuSkipReason();
    if (skip) { ok("device jobs ran", false, "SKIP: " + skip + " -- a SKIP counts as a fail here"); console.log("\nfresnelF82Wgsl-selfcheck: 1 FAILED"); process.exit(1); }

    console.log("1. *** THE CURVE ON A DEVICE, EVERY SAMPLED ANGLE, AGAINST THE SAME CPU CALL fresnelF82-selfcheck.mjs USES ***");
    const COUNT = 33;   // odd, so mu = 0.5 lands exactly -- and mu = 0 and mu = 1 both land exactly regardless
    const CASES = [
        { f0: 0, b: 0 }, { f0: 0.04, b: 0.3 }, { f0: 0.5, b: 0.9 }, { f0: 1, b: 1 }, { f0: 0.9, b: 0.1 },
    ];
    let worstOverall = 0, worstAt = "";
    for (const { f0, b } of CASES) {
        const res = await runWgslComputeNative({
            code: F82_TINT_WGSL, outCount: COUNT,
            uniforms: Array.from(packF82Params(f0, b, COUNT)),
            workgroups: [Math.ceil(COUNT / 64), 1, 1],
        });
        ok(`!! f0=${f0} b=${b}: the shader compiles and runs`, res.ok, res.ok ? "" : JSON.stringify(res.errors || res.reason));
        if (!res.ok) continue;
        let worst = 0, worstMu = 0;
        for (let i = 0; i < COUNT; i++) {
            const mu = i / (COUNT - 1);
            const cpu = f82Tint(mu, f0, b);
            const d = Math.abs(res.values[i] - cpu);
            if (d > worst) { worst = d; worstMu = mu; }
        }
        if (worst > worstOverall) { worstOverall = worst; worstAt = `f0=${f0} b=${b} mu=${worstMu.toFixed(4)}`; }
        ok(`!! f0=${f0} b=${b}: device f32 agrees with the f64 CPU reference to the f32 floor across ${COUNT} angles`,
           worst < 1e-4, `worst |gpu - cpu| = ${worst.toExponential(3)} at mu=${worstMu.toFixed(4)}`);

        // the two exact grid endpoints (mu = 0 and mu = 1, both hit exactly by this shader's own i/(count-1)
        // grid) are the structural identities fresnelF82-selfcheck.mjs section 1 asserts at f64 -- checked here
        // on the device too, not assumed to survive f32 unexamined.
        const normalD = Math.abs(res.values[COUNT - 1] - f0), grazingD = Math.abs(res.values[0] - 1);
        ok(`!! f0=${f0} b=${b}: F(1) = f0 and F(0) = 1 hold on the device too`,
           normalD < 1e-5 && grazingD < 1e-5, `|F(1)-f0|=${normalD.toExponential(2)}, |F(0)-1|=${grazingD.toExponential(2)}`);
    }
    report(`worst disagreement across all cases and angles: ${worstOverall.toExponential(3)} at ${worstAt}`);

    console.log("\n2. *** SABOTAGE: THE CORRECTION'S SIGN FLIPPED -- CAUGHT ON THE DEVICE, NOT JUST ARGUED ***");
    {
        // fresnelF82.mjs subtracts the correction (Fs - edgeShape*(...)); adding it instead is a realistic
        // one-character slip that still compiles and still hits the two untouched endpoints exactly (edgeShape
        // is zero there regardless of sign), so ONLY an interior angle can catch it -- which is why this sabotage
        // targets the same mid-curve region the real check above already covers, not a specially chosen point.
        const sabotaged = F82_TINT_WGSL.replace(
            "return fs - edgeShapeF(mu) * (fsPin - b) / pinWeight;",
            "return fs + edgeShapeF(mu) * (fsPin - b) / pinWeight;",
        );
        if (sabotaged === F82_TINT_WGSL) throw new Error("sabotage string not found -- the shader text changed under this check");
        const f0 = 0.5, b = 0.9;
        const res = await runWgslComputeNative({
            code: sabotaged, outCount: COUNT, uniforms: Array.from(packF82Params(f0, b, COUNT)),
            workgroups: [Math.ceil(COUNT / 64), 1, 1],
        });
        let worst = 0;
        if (res.ok) for (let i = 0; i < COUNT; i++) worst = Math.max(worst, Math.abs(res.values[i] - f82Tint(i / (COUNT - 1), f0, b)));
        ok("!! *** the sign-flipped shader disagrees with the true CPU curve by far more than f32 rounding ***",
           res.ok && worst > 1e-2, `worst |sabotaged_gpu - true_cpu| across ${COUNT} angles: ${worst.toExponential(3)} (the correct shader measured ${worstOverall.toExponential(3)} above)`);
        // and the two endpoints STILL agree under the sabotage, which is exactly why they alone would not have
        // caught it -- named here as the reason section 1 also samples the interior, not only F(0) and F(1).
        const stillNormal = res.ok ? Math.abs(res.values[COUNT - 1] - f0) : NaN;
        ok("...and confirming WHY the endpoints alone can't see this: F(1) = f0 still holds under the sabotage",
           res.ok && stillNormal < 1e-5, `|F(1)-f0| under sabotage: ${stillNormal.toExponential(2)}`);
    }

    console.log(fails ? "\nfresnelF82Wgsl-selfcheck: " + fails + " FAILED" : "\nfresnelF82Wgsl-selfcheck: all checks pass");
    console.log("unchecked here: this file grades the SHADER's numbers against the CPU reference at a fixed grid of angles for a handful of (f0, b) pairs -- it does not sweep f0 and b themselves the way fresnelF82-selfcheck.mjs's section 1 does, and no real material (physics/render/principled.mjs, on a device) reads this shader yet -- principled.mjs's own edgeTint wiring runs the CPU function only, gated in principled-selfcheck.mjs.");
    process.exit(fails ? 1 : 0);
}

main().catch((e) => { console.error("fresnelF82Wgsl-selfcheck: threw " + (e && e.stack || e)); process.exit(1); });
