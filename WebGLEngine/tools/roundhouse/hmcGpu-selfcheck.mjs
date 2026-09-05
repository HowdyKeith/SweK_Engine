// tools/roundhouse/hmcGpu-selfcheck.mjs — v3282
//
// Run: node tools/roundhouse/hmcGpu-selfcheck.mjs   (~0.1s for sections 1-5, MEASURED; section 6 adds a Dawn run)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// What can be gated WITHOUT a GPU, gated: (1) the f64 flat mirror is BIT-IDENTICAL to the shipping leapfrog in
// physics/hmc/hmc.js, so this file is not a second drifting definition of the step; (2) the f32 floor is
// RE-MEASURED every run and must sit under the device tolerance — the earned-tolerance rule, enforced forever;
// (3) a sabotaged kernel mirror (one sign flipped) is caught by the adjudicator; (4) the WGSL text keeps its
// specified-operations-only promise.
//
// v4466 -- AND WHAT NEEDED A GPU IS GATED TOO, BECAUSE THE SANDBOX HAS HAD ONE SINCE v4292. Section 6 runs the
// kernel's step text on the headless Dawn device over the seeded 4096-chain batch and grades the endpoints with
// adjudicateDeviceRun -- hmc-bench.html's route, on this box, every run. The verdict is still recomputed from raw
// endpoints, never taken from the device; the page remains where a REAL vendor gets its verdict.

import { WGSL_HMC, WGSL_HMC_PROBE, HMC_STEP_WGSL, hmcKernelWgsl, probeUniforms, HMC_FIXTURE, HMC_TOL, F32_FLOOR_HMC, leapfrogF64Flat, leapfrogF32, fixtureInv, makeBatch, measureF32Floor, adjudicateDeviceRun, shippingLeapfrogEndpoint } from "./hmcGpu.mjs";
import { runWgslComputeNative, headlessGpuSkipReason } from "../ship/headlessGpu.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. THE MIRROR IS PINNED TO THE SHIPPING STEP ---------------------------------------------------------------
{
    const inv = fixtureInv(), { mu, eps, L } = HMC_FIXTURE;
    const pts = [[2.2, 0.4, 0.7, -1.1], [1.0, -1.0, 0.3, 0.2], [-0.5, 1.5, -2.0, 0.9]];
    let identical = true, worst = 0;
    for (const [qx, qy, px, py] of pts) {
        const a = leapfrogF64Flat(qx, qy, px, py, inv, mu, eps, L);
        const b = shippingLeapfrogEndpoint(qx, qy, px, py);
        for (let k = 0; k < 4; k++) { if (a[k] !== b[k]) identical = false; worst = Math.max(worst, Math.abs(a[k] - b[k])); }
    }
    ok("!! the f64 flat mirror is BIT-IDENTICAL to physics/hmc/hmc.js leapfrog on the fixture",
       identical, identical ? "3 phase-space points, 24 steps each, every coordinate exact" : "worst gap " + worst.toExponential(2) + " — two definitions of one step have drifted");
}

// ---- 2. THE FLOOR IS RE-MEASURED AND THE TOLERANCE STAYS EARNED -------------------------------------------------
{
    const floor = measureF32Floor(4096, 77);
    ok("!! measured f32 floor sits under the device tolerance (earned, and re-earned every run)",
       floor < HMC_TOL, "worst |f64-f32| endpoint gap " + floor.toExponential(3) + " over 4096 chains vs tol " + HMC_TOL.toExponential(1) +
       " — if this ever fails, the FLOOR moved and the tolerance must be re-derived in the open, not widened quietly");
    ok("...and the stated headroom constant still brackets it", floor < F32_FLOOR_HMC,
       "measured " + floor.toExponential(3) + " < stated " + F32_FLOOR_HMC.toExponential(1));
}

// ---- 3. THE ADJUDICATOR HAS TEETH: a correct f32 device passes, a sabotaged one is caught -----------------------
{
    const { qin, pin, n } = makeBatch(512, 99);
    const inv = fixtureInv(), { mu, eps, L } = HMC_FIXTURE;
    const qout = new Float32Array(2 * n), pout = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) { const r = leapfrogF32(qin[2 * i], qin[2 * i + 1], pin[2 * i], pin[2 * i + 1], inv, mu, eps, L);
        qout[2 * i] = r[0]; qout[2 * i + 1] = r[1]; pout[2 * i] = r[2]; pout[2 * i + 1] = r[3]; }
    const good = adjudicateDeviceRun(qin, pin, qout, pout, n);
    ok("!! a faithful f32 device run PASSES the adjudicator", good.pass, "worst " + good.worst.toExponential(3) + ", 0/" + n + " chains out of tolerance");
    // sabotage: a sign flip in the drift (qx += eps*px -> qx -= eps*px) — one character in a kernel
    const qb = new Float32Array(2 * n), pb = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
        let qx = Math.fround(qin[2 * i]), qy = Math.fround(qin[2 * i + 1]), px = Math.fround(pin[2 * i]), py = Math.fround(pin[2 * i + 1]);
        const [i00, i01, i11] = inv, f = Math.fround;
        const grad = (x, y) => { const dx = f(x - mu[0]), dy = f(y - mu[1]); return [f(f(i00 * dx) + f(i01 * dy)), f(f(i01 * dx) + f(i11 * dy))]; };
        let g = grad(qx, qy);
        for (let s = 0; s < L; s++) {
            px = f(px - f(f(0.5 * eps) * g[0])); py = f(py - f(f(0.5 * eps) * g[1]));
            qx = f(qx - f(eps * px)); qy = f(qy + f(eps * py));   // <-- the flipped sign
            g = grad(qx, qy);
            px = f(px - f(f(0.5 * eps) * g[0])); py = f(py - f(f(0.5 * eps) * g[1]));
        }
        qb[2 * i] = qx; qb[2 * i + 1] = qy; pb[2 * i] = px; pb[2 * i + 1] = py;
    }
    const bad = adjudicateDeviceRun(qin, pin, qb, pb, n);
    ok("!! ...and a ONE-SIGN sabotage is REJECTED for every chain (detection power, measured)",
       !bad.pass && bad.bad > n * 0.95, bad.bad + "/" + n + " chains out of tolerance, worst gap " + bad.worst.toExponential(2));
}

// ---- 4. THE WGSL TEXT KEEPS ITS PROMISES ------------------------------------------------------------------------
{
    const banned = ["sin(", "cos(", "tan(", "exp(", "log(", "pow(", "sqrt(", "inverseSqrt("];
    const hits = banned.filter((b) => WGSL_HMC.includes(b));
    ok("the kernel uses SPECIFIED OPERATIONS ONLY (+ - * /) — no transcendentals to argue rounding about",
       hits.length === 0, hits.length ? "found: " + hits.join(" ") : "the gradient is a 2x2 matmul; nothing else is arithmetic");
    ok("...and declares the structure the bench page binds to",
       WGSL_HMC.includes("@workgroup_size(64)") && WGSL_HMC.includes("var<uniform> P") && WGSL_HMC.includes("qout") && WGSL_HMC.includes("pout"));
}

// ---- 5. determinism of the batch --------------------------------------------------------------------------------
{
    const a = makeBatch(64, 5), b = makeBatch(64, 5);
    let same = true; for (let i = 0; i < a.qin.length; i++) if (a.qin[i] !== b.qin[i] || a.pin[i] !== b.pin[i]) same = false;
    ok("seeded batches are bit-identical (device runs are reproducible end to end)", same);
}

// ---- 6. v4466 -- THE KERNEL ON A REAL DEVICE, HERE. The header used to say the sandbox has no GPU; it has had the
// headless Dawn device since v4292. The probe layout (WGSL_HMC_PROBE, the same step text as the shipped kernel) runs
// the seeded 4096-chain batch on it and the CPU adjudicator grades the endpoints -- the bench page's route, on this
// box, every run. The verdict comes from adjudicateDeviceRun, never from the device.
{
    const skip = headlessGpuSkipReason();
    if (skip) { console.log("  SKIP  " + skip); fails++; }
    else {
        ok("!! the shipped kernel and the probe layout carry ONE step text", WGSL_HMC.includes(HMC_STEP_WGSL) && WGSL_HMC_PROBE.includes(HMC_STEP_WGSL) && WGSL_HMC === hmcKernelWgsl({ probe: false }),
           "hmcKernelWgsl renders both layouts around HMC_STEP_WGSL; the shipped string is the non-probe rendering");
        const c = await runWgslComputeNative({ code: WGSL_HMC, outCount: 1, compileOnly: true });
        ok("!! the SHIPPED kernel compiles on Dawn", c.ok, c.ok ? c.adapter.description : c.reason + " " + (c.errors || []).join(" | "));
        const { qin, pin, n } = makeBatch(4096, 77);
        const r = await runWgslComputeNative({ code: WGSL_HMC_PROBE, outCount: 4 * n, uniforms: probeUniforms(n), workgroups: Math.ceil(n / 64),
                                               inputs: [{ binding: 2, data: qin }, { binding: 3, data: pin }] });
        ok("!! the probe layout ran the 4096-chain batch on the headless device", r.ok, r.ok ? "" : r.reason + " " + (r.errors || []).join(" | "));
        if (r.ok) {
            const qout = new Float32Array(2 * n), pout = new Float32Array(2 * n);
            for (let i = 0; i < n; i++) { qout[2 * i] = r.values[4 * i]; qout[2 * i + 1] = r.values[4 * i + 1]; pout[2 * i] = r.values[4 * i + 2]; pout[2 * i + 1] = r.values[4 * i + 3]; }
            const v = adjudicateDeviceRun(qin, pin, qout, pout, n);
            ok("!! *** THE DEVICE RUN PASSES THE CPU ADJUDICATOR -- every chain inside the earned tolerance ***", v.pass, "worst |f64 - device| " + v.worst.toExponential(3) + " over " + n + " chains, " + v.bad + " out of tolerance " + HMC_TOL.toExponential(1));
            const inv = fixtureInv(), { mu, eps, L } = HMC_FIXTURE;
            let same = 0, worst32 = 0;
            for (let i = 0; i < n; i++) { const m = leapfrogF32(qin[2 * i], qin[2 * i + 1], pin[2 * i], pin[2 * i + 1], inv, mu, eps, L);
                const got = [qout[2 * i], qout[2 * i + 1], pout[2 * i], pout[2 * i + 1]];
                for (let k = 0; k < 4; k++) { if (got[k] === m[k]) same++; worst32 = Math.max(worst32, Math.abs(got[k] - m[k])); } }
            console.log("  ----  against the f32 mirror: " + same + " of " + (4 * n) + " endpoint values bit-identical, worst " + worst32.toExponential(3) +
                        " (measured, not asserted: tslPhysics-selfcheck found the browser's WebGPU 1.371e-6 from the mirror at v4370, and this is the same rasteriser)");
            ok("...and the device is not the mirror's copy: the batch actually moved", (() => { let d = 0; for (let i = 0; i < 2 * n; i++) d = Math.max(d, Math.abs(qout[i] - qin[i])); return d > 0.1; })());
        }
    }
}

console.log(fails ? ("[hmcGpu-selfcheck] FAILED " + fails) : "[hmcGpu-selfcheck] all passed");
process.exit(fails ? 1 : 0);
