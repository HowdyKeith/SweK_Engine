// WebGLEngine/physics/sync/kuramoto-selfcheck.mjs — v3283
//
// Run: node physics/sync/kuramoto-selfcheck.mjs   (~12s — MEASURED: 4096 oscillators, six couplings, both rules)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The key is the ENTIRE closed-form curve for Lorentzian frequencies: K_c = 2*gamma and r(K) = sqrt(1 - Kc/K),
// neither anywhere in the update rule. Finite N leaves an O(1/sqrt(N)) floor below threshold and small
// deviations above; the tolerances carry that, and the sabotaged coupling misses them by far more.

import { measureR, exactR, rCurve, couplingWRONG } from "./kuramoto.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const gamma = 0.5, Kc = 2 * gamma;   // the reference lives in the GATE

// ---- 1. BELOW THRESHOLD: the crowd never organizes ---------------------------------------------------------------
{
    const r = measureR({ K: 0.6, gamma, seed: 11 });
    ok("!! below K_c = 2*gamma the order parameter stays at the finite-N noise floor",
       r < 0.12, "r(K=0.6) = " + r.toFixed(4) + " (floor ~ 1/sqrt(N) = " + (1 / Math.sqrt(4096)).toFixed(4) + ")");
}

// ---- 2. ABOVE THRESHOLD: the measured branch lies ON the exact curve --------------------------------------------
{
    let worst = 0, detail = [];
    for (const K of [1.5, 2.0, 2.5]) {
        const r = measureR({ K, gamma, seed: 11 + Math.round(K * 100) });
        const ex = exactR(K, gamma);
        worst = Math.max(worst, Math.abs(r - ex));
        detail.push("r(" + K + ")=" + r.toFixed(4) + " vs " + ex.toFixed(4));
    }
    ok("!! above threshold r(K) matches sqrt(1 - Kc/K) at three couplings — the WHOLE branch, not one point",
       worst < 0.04, detail.join(", ") + " (worst |diff| " + worst.toFixed(4) + ")");
}

// ---- 3. THE THRESHOLD ITSELF EMERGES NEAR 2*gamma ----------------------------------------------------------------
{
    const below = measureR({ K: Kc * 0.85, gamma, seed: 31 });
    const above = measureR({ K: Kc * 1.25, gamma, seed: 37 });
    ok("!! the transition sits between 0.85*Kc and 1.25*Kc (incoherent one side, organized the other)",
       below < 0.15 && above > 0.35,
       "r(0.85 Kc) = " + below.toFixed(4) + ", r(1.25 Kc) = " + above.toFixed(4) + " — the update rule was never told where Kc is");
}

// ---- 4. SABOTAGE: the plausible mean-field slip lands on the WRONG curve ----------------------------------------
{
    // K r^2 coupling still synchronizes at strong K — every oscillator's motion is locally sensible — but the
    // branch is displaced: near threshold it stays incoherent where the true rule organizes.
    const rBad = measureR({ K: 1.5, gamma, seed: 161, coupling: couplingWRONG });
    const ex = exactR(1.5, gamma);
    ok("the K*r^2 coupling FAILS the exact-branch key where the true rule passes (detection power, measured)",
       Math.abs(rBad - ex) > 0.3, "sabotaged r(1.5) = " + rBad.toFixed(4) + " vs exact " + ex.toFixed(4) + " — locally sensible, globally the wrong physics");
}

// ---- 5. determinism ---------------------------------------------------------------------------------------------
{
    const a = measureR({ K: 2.0, gamma, seed: 5, N: 1024, transient: 400, samples: 400 });
    const b = measureR({ K: 2.0, gamma, seed: 5, N: 1024, transient: 400, samples: 400 });
    ok("seeded runs are bit-identical (a failure reproduces)", a === b);
}

console.log(fails ? ("[kuramoto-selfcheck] FAILED " + fails) : "[kuramoto-selfcheck] all passed");
process.exit(fails ? 1 : 0);
