// WebGLEngine/physics/statmech/ising-selfcheck.mjs -- v2819
//
// Run: node physics/statmech/ising-selfcheck.mjs   (~15s -- it runs real Monte Carlo)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES physics/statmech/ising.js -- the 2D Ising model, the lab's first statistical-mechanics instrument and
// its first PHASE TRANSITION.
//
// FOUR EXACT ANSWER KEYS, none of them fed to the simulation:
//   Onsager 1944   T_c = 2/ln(1+sqrt(2)) = 2.269185314213022
//   Yang 1952      M(T) = [1 - sinh^-4(2/T)]^(1/8) below T_c -- an exact CURVE, checkable at many points
//   ground state   E/N = -2 and |M| = 1 exactly at T -> 0
//   universality   chi_max ~ L^(gamma/nu) with gamma/nu = 7/4 EXACTLY
//
// The exponent is the sharpest of them, and deliberately so: a lattice that merely had a bump in roughly the
// right place would still get it wrong, because the exponent is about how criticality SCALES, not where it sits.
//
// The transition is EMERGENT. Nothing in the update rule mentions a critical temperature -- there is only "flip
// if it lowers the energy, else flip with probability exp(-dE/T)".

import { ONSAGER_TC, GAMMA_OVER_NU, yangMagnetisation, makeIsing, measure, sweepTemperature, criticalExponent } from "./ising.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. the constants are what they claim to be
{
    ok("Onsager T_c = 2/ln(1+sqrt(2))", Math.abs(ONSAGER_TC - 2 / Math.log(1 + Math.SQRT2)) < 1e-15 && Math.abs(ONSAGER_TC - 2.269185314213022) < 1e-12, ONSAGER_TC.toFixed(12));
    ok("gamma/nu is exactly 7/4", GAMMA_OVER_NU === 1.75);
}

// 2. Yang's curve behaves like an order parameter
{
    ok("Yang: zero AT and above T_c (the order parameter stops existing)", yangMagnetisation(ONSAGER_TC) === 0 && yangMagnetisation(2.5) === 0 && yangMagnetisation(10) === 0);
    ok("Yang: tends to 1 as T -> 0", yangMagnetisation(0.1) > 0.999);
    ok("Yang: decreases monotonically toward T_c", yangMagnetisation(1.5) > yangMagnetisation(2.0) && yangMagnetisation(2.0) > yangMagnetisation(2.25));
}

// 3. GROUND STATE, exactly. Cold start, because a random start at low T freezes into stripe domains -- a real
// metastability of the model, not a bug, and the reason this check specifies its initial condition.
{
    const g = measure({ L: 24, T: 0.6, warmup: 400, samples: 200, cold: true });
    ok("ground state: |M| = 1 exactly at low T from a cold start", g.magnetisation === 1, g.magnetisation.toFixed(6));
    ok("ground state: E/N = -2 exactly (every bond satisfied, 4 neighbours, each bond once)", g.energy === -2, g.energy.toFixed(6));
    const frozen = measure({ L: 24, T: 0.6, warmup: 400, samples: 200, cold: false });
    ok("METASTABILITY IS REAL: a random start at low T can freeze below full order", frozen.magnetisation < 0.95, "|M| = " + frozen.magnetisation.toFixed(4));
}

// 4. high temperature destroys order
{
    const h = measure({ L: 24, T: 8, warmup: 300, samples: 400 });
    ok("high T: magnetisation collapses toward zero", h.magnetisation < 0.1, h.magnetisation.toFixed(4));
    ok("high T: energy per spin heads toward zero", h.energy > -0.4, h.energy.toFixed(4));
}

// 5. YANG'S EXACT CURVE, reproduced by Monte Carlo at several temperatures
{
    let worst = 0, rows = [];
    for (const T of [1.6, 1.8, 2.0, 2.1]) {
        const m = measure({ L: 32, T, warmup: 500, samples: 500 }).magnetisation;
        const y = yangMagnetisation(T);
        worst = Math.max(worst, Math.abs(m - y) / y);
        rows.push(`T=${T}: ${m.toFixed(4)} vs ${y.toFixed(4)}`);
    }
    ok("YANG: the measured magnetisation follows the exact curve below T_c", worst < 0.03, `worst ${(worst * 100).toFixed(2)}%  ${rows.join("  ")}`);
}

// 6. THE TRANSITION ITSELF: order below, disorder above
{
    const below = measure({ L: 24, T: 2.0, warmup: 400, samples: 400 }).magnetisation;
    const above = measure({ L: 24, T: 2.6, warmup: 400, samples: 400 }).magnetisation;
    ok("a PHASE TRANSITION: ordered below T_c, disordered above", below > 0.85 && above < 0.45 && below > 2 * above, `${below.toFixed(3)} -> ${above.toFixed(3)}`);
}

// 7. THE SHARPEST KEY: the critical exponent, recovered from scaling alone
{
    const e = criticalExponent({ sizes: [8, 16, 32] });
    ok("chi_max GROWS strongly with lattice size (a diverging susceptibility)", e.points[2].chiMax > 5 * e.points[0].chiMax,
        e.points.map((p) => `L=${p.L}:${p.chiMax.toFixed(1)}`).join(" "));
    ok("UNIVERSALITY: the measured exponent recovers gamma/nu = 7/4", e.exponentErrFrac < 0.10,
        `measured ${e.exponentMeasured.toFixed(4)} vs ${e.exponentTheory}  (${(e.exponentErrFrac * 100).toFixed(2)}%)`);
    ok("...and the peak sits near Onsager's temperature", Math.abs(e.points[2].peakT - ONSAGER_TC) < 0.2, `peak ${e.points[2].peakT.toFixed(3)} vs ${ONSAGER_TC.toFixed(3)}`);
}

// 8. determinism -- a measurement must be repeatable or it is not a measurement
{
    const a = measure({ L: 16, T: 2.2, seed: 999, warmup: 100, samples: 100 });
    const b = measure({ L: 16, T: 2.2, seed: 999, warmup: 100, samples: 100 });
    ok("same seed gives the identical measurement", a.magnetisation === b.magnetisation && a.energy === b.energy);
    const c = measure({ L: 16, T: 2.2, seed: 1000, warmup: 100, samples: 100 });
    ok("a different seed gives a different one (the RNG is actually used)", c.magnetisation !== a.magnetisation);
}

// 9. SABOTAGE: the Metropolis criterion is what creates the transition. Replace it with "always flip" and the
// lattice can no longer order at ANY temperature -- it becomes a coin toss per site.
{
    const L = 24, N = L * L;
    const s = new Int8Array(N).fill(1);
    const idx = (x, y) => ((y + L) % L) * L + ((x + L) % L);
    let a = 4242;
    const rand = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
    for (let sweep = 0; sweep < 400; sweep++) for (let n = 0; n < N; n++) {
        const x = (rand() * L) | 0, y = (rand() * L) | 0;
        s[idx(x, y)] = -s[idx(x, y)];                       // no energy test at all
    }
    let m = 0; for (let i = 0; i < N; i++) m += s[i];
    const ordered = measure({ L, T: 1.5, warmup: 400, samples: 200, cold: true }).magnetisation;
    ok("SABOTAGE: without the Metropolis test the lattice cannot order at low T", Math.abs(m / N) < 0.3 && ordered > 0.95,
        `sabotaged |M|=${Math.abs(m / N).toFixed(3)} vs real ${ordered.toFixed(3)}`);
}

// 10. mechanics
{
    const sim = makeIsing({ L: 8, T: 2, cold: true });
    ok("a cold lattice starts fully ordered", sim.magnetisation() === 1 && sim.energy() === -2);
    ok("spins are only ever +1 or -1", [...sim.spins].every((v) => v === 1 || v === -1));
    const sw = sweepTemperature({ L: 8, from: 2, to: 2.6, steps: 4, warmup: 100, samples: 100 });
    ok("sweepTemperature returns a row per temperature plus both peaks", sw.rows.length === 4 && typeof sw.chiPeakT === "number" && typeof sw.cPeakT === "number");
    ok("susceptibility and specific heat are non-negative", sw.rows.every((r) => r.susceptibility >= 0 && r.specificHeat >= 0));
}

// 11. browser-safe
{
    const src = (await import("node:fs")).readFileSync(new URL("./ising.js", import.meta.url), "utf8");
    ok("ising.js imports nothing and uses no DOM", !/^\s*import\s/m.test(src) && !/\bwindow\.|\bdocument\./.test(src));
}

// 12. v3282 -- THE BINDER CROSSING LANDS ON ONSAGER'S T_c. The peak-drift check above says the susceptibility
// peak approaches T_c; the Binder cumulant says WHERE the transition is: U4 curves for L=8 and L=16 cross at
// T_c to leading order. The reference 2.2692 is computed here from Onsager's closed form and appears nowhere in
// the sampling. The side-swap check keeps a graze from faking a crossing.
{
    const { binderCurve, binderCrossing } = await import("./ising.js");
    const temps = [2.10, 2.16, 2.22, 2.27, 2.33, 2.39, 2.45];
    const c8 = binderCurve({ L: 8, temps, seed: 7, warmup: 2000, samples: 12000 });
    const c16 = binderCurve({ L: 16, temps, seed: 7, warmup: 2000, samples: 12000 });
    const cross = binderCrossing(c8, c16);
    ok("!! Binder curves for L=8 and L=16 cross, and the crossing lands on Onsager's T_c",
       cross != null && Math.abs(cross - ONSAGER_TC) < 0.06,
       cross == null ? "no crossing in [2.10, 2.45]" : "crossing at T = " + cross.toFixed(4) + " vs T_c = " + ONSAGER_TC.toFixed(4) + " (|diff| " + Math.abs(cross - ONSAGER_TC).toFixed(4) + ")");
    const swap = (c16[0].U4 > c8[0].U4) && (c16[temps.length - 1].U4 < c8[temps.length - 1].U4);
    ok("...and the curves SWAP SIDES across the transition (a graze cannot fake it)", swap,
       "U4(16)-U4(8): " + (c16[0].U4 - c8[0].U4).toFixed(3) + " below, " + (c16[temps.length - 1].U4 - c8[temps.length - 1].U4).toFixed(3) + " above");
}

console.log("ising-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
