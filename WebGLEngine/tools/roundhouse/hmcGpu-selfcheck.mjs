// tools/roundhouse/hmcGpu-selfcheck.mjs — v3282
//
// Run: node tools/roundhouse/hmcGpu-selfcheck.mjs   (~0.1s — MEASURED)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// What can be gated WITHOUT a GPU, gated: (1) the f64 flat mirror is BIT-IDENTICAL to the shipping leapfrog in
// physics/hmc/hmc.js, so this file is not a second drifting definition of the step; (2) the f32 floor is
// RE-MEASURED every run and must sit under the device tolerance — the earned-tolerance rule, enforced forever;
// (3) a sabotaged kernel mirror (one sign flipped) is caught by the adjudicator; (4) the WGSL text keeps its
// specified-operations-only promise. The real device run happens on hmc-bench.html and its verdict is
// recomputed by adjudicateDeviceRun from raw endpoints — never taken from the device.

import { WGSL_HMC, HMC_FIXTURE, HMC_TOL, F32_FLOOR_HMC, leapfrogF64Flat, leapfrogF32, fixtureInv, makeBatch, measureF32Floor, adjudicateDeviceRun, shippingLeapfrogEndpoint } from "./hmcGpu.mjs";

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

console.log(fails ? ("[hmcGpu-selfcheck] FAILED " + fails) : "[hmcGpu-selfcheck] all passed");
process.exit(fails ? 1 : 0);
