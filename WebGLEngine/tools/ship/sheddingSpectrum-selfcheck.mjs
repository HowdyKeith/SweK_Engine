// WebGLEngine/tools/ship/sheddingSpectrum-selfcheck.mjs -- v2797
//
// Run: node tools/ship/sheddingSpectrum-selfcheck.mjs   (~121s -- MEASURED; the last section runs a real LBM sim)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES simulation/lbm/sheddingSpectrum.mjs on two levels, both with real answer keys:
//   1. THE ESTIMATOR is graded on SYNTHETIC sinusoids, where the true frequency is exact by construction.
//   2. THE PHYSICS is graded by AGREEMENT BETWEEN TWO INDEPENDENT OBSERVABLES: the integrated surface force on
//      the cylinder (lift) and a point velocity probe in the wake share no information, yet must report the same
//      shedding frequency. That agreement is the claim; neither is assumed correct on its own.

import { dominantFrequency, zeroCrossFrequency, removeMean, detrend, amplitude, isSustained, strouhal, recordSeries } from "../../simulation/lbm/sheddingSpectrum.mjs";
import { makeLBM } from "../../simulation/lbm/lbm2d.js";
import { solidForce } from "../../simulation/lbm/windTunnel.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sine = (N, f, amp = 1, phase = 0, dc = 0) => Array.from({ length: N }, (_, n) => dc + amp * Math.sin(2 * Math.PI * f * n + phase));

// 1. ESTIMATOR ANSWER KEY: exact synthetic frequencies
{
    let worst = 0, rows = [];
    for (const f of [0.01, 0.037, 0.08, 0.15]) {
        const g = dominantFrequency(sine(2000, f, 3.2, 0.7, 5)).freq;
        worst = Math.max(worst, Math.abs(g - f) / f);
        rows.push(`${f}->${g.toFixed(5)}`);
    }
    ok("estimator: DFT recovers known synthetic frequencies within 0.1%", worst < 0.001, `worst=${(worst * 100).toFixed(4)}%  ${rows.join(" ")}`);
}

// 2. an INDEPENDENT estimator agrees (two methods, one answer)
{
    const f = 0.043, s = sine(3000, f, 2, 1.1, -4);
    const a = dominantFrequency(s).freq, b = zeroCrossFrequency(s).freq;
    ok("estimator: DFT and zero-crossing agree on the same signal", Math.abs(a - b) / f < 0.01, `dft=${a.toFixed(5)} zc=${b.toFixed(5)}`);
}

// 3. robust to additive interference, and DC offset is irrelevant
{
    const f = 0.05, N = 3000;
    const noisy = Array.from({ length: N }, (_, n) => Math.sin(2 * Math.PI * f * n) + 0.4 * (Math.sin(n * 1.7) + Math.cos(n * 0.31)));
    ok("estimator: finds the dominant tone under interference", Math.abs(dominantFrequency(noisy).freq - f) / f < 0.01);
    const off = sine(1500, 0.06, 1, 0, 1000);
    ok("estimator: DC offset does not shift the answer", Math.abs(dominantFrequency(off).freq - 0.06) / 0.06 < 0.01);
    ok("removeMean: zero mean out", Math.abs(removeMean([1, 2, 3, 4]).reduce((a, b) => a + b, 0)) < 1e-12);
}

// 4. harmonic separation: a 2f signal reads as exactly twice f (the lift/drag relation depends on this)
{
    const f = 0.05, N = 3000;
    const r = dominantFrequency(sine(N, 2 * f, 0.3, 0, 2)).freq / dominantFrequency(sine(N, f)).freq;
    ok("estimator: resolves a 2f harmonic as exactly 2x", Math.abs(r - 2) < 0.01, `ratio=${r.toFixed(4)}`);
}

// 5. detrend removes a linear drift without moving the tone
{
    const f = 0.04, N = 2000;
    const drifting = sine(N, f, 1).map((v, i) => v + 0.01 * i);
    const before = dominantFrequency(drifting).freq, after = dominantFrequency(detrend(drifting)).freq;
    ok("detrend: recovers the tone from a drifting signal", Math.abs(after - f) / f < 0.01, `raw=${before.toFixed(5)} detrended=${after.toFixed(5)}`);
}

// 6. a STEADY signal has no oscillation to report (null case)
{
    const flat = new Array(500).fill(3.7);
    ok("null case: constant signal -> zero-crossing frequency is 0", zeroCrossFrequency(flat).freq === 0);
    ok("null case: constant signal has zero amplitude", amplitude(flat) === 0);
    ok("isSustained: a decaying transient is NOT a limit cycle", !isSustained(Array.from({ length: 400 }, (_, n) => Math.exp(-n / 60) * Math.sin(n * 0.2))));
    ok("isSustained: a steady oscillation IS a limit cycle", isSustained(sine(400, 0.05, 1)));
}

// 7. strouhal arithmetic
{
    ok("strouhal: f*D/U", Math.abs(strouhal(0.003, 7, 0.14) - 0.15) < 1e-9);
    ok("strouhal: undefined at zero speed", !isFinite(strouhal(0.003, 7, 0)));
}

// 8. THE PHYSICS CLAIM: lift and wake report the SAME shedding frequency (independent observables)
{
    const nx = 160, ny = 61, D = 7, cx = 40, cy = (ny - 1) / 2 + 0.5, tau = 0.53, g = 2e-5;
    const inCyl = (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (D / 2) ** 2;
    const lbm = makeLBM({ nx, ny, tau, force: [g, 0], solidAt: inCyl });
    for (let t = 0; t < 12000; t++) lbm.step();                       // shed the startup transient
    let U = 0; for (let dy = -2; dy <= 2; dy++) U = Math.max(U, lbm.ux[lbm.idx(cx - 3 * D, Math.round(cy) + dy)]);
    const rec = recordSeries(lbm, {
        steps: 7500, sampleEvery: 3,
        forceOf: (L) => solidForce(L, (x, y) => ((x - cx) ** 2 + (y - cy) ** 2) <= (D / 2) ** 2 + 2),
        probe: (L) => L.uy[L.idx(cx + 3 * D, Math.round(cy) + 2)],
    });
    const half = (a) => a.slice(Math.floor(a.length / 2));
    const clH = half(rec.cl), uyH = half(rec.uy);
    const Re = U * D / lbm.nu;
    ok("sim: the wake is genuinely oscillating (a limit cycle, not a decaying transient)", isSustained(uyH) && amplitude(uyH) > 0.05 * U, `Re=${Re.toFixed(0)} wakeAmp=${amplitude(uyH).toExponential(2)}`);
    const fL = dominantFrequency(clH).freq / rec.sampleEvery;
    const fW = dominantFrequency(uyH).freq / rec.sampleEvery;
    const disagree = Math.abs(fL - fW) / Math.max(fL, fW);
    ok("TWO INDEPENDENT OBSERVABLES AGREE: lift-force frequency == wake-probe frequency", disagree < 0.05,
        `St_lift=${strouhal(fL, D, U).toFixed(4)}  St_wake=${strouhal(fW, D, U).toFixed(4)}  apart=${(disagree * 100).toFixed(2)}%`);
    const St = strouhal(fW, D, U);
    ok("Strouhal is in the physical band for a cylinder (0.08-0.30 at this resolution)", St > 0.08 && St < 0.30, `St=${St.toFixed(4)}`);
}

// 9. browser/worker-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("../../simulation/lbm/sheddingSpectrum.mjs", import.meta.url), "utf8");
    ok("source: sheddingSpectrum imports nothing / uses no DOM (matches window./document. usage, not the WORD 'window')", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

console.log("sheddingSpectrum-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
