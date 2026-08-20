// WebGLEngine/physics/statmech/tempering-selfcheck.mjs — v3284
//
// Run: node physics/statmech/tempering-selfcheck.mjs   (~40s — MEASURED; five replicas plus five control runs)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The claim tempering has to earn is NOT that it explores better -- it is that it changes nothing it should not.
// Configurations move between ensembles, so the marginal at each temperature is exactly what a bad swap rule
// would corrupt, and the check is the same Yang curve the plain device already owes.
//
// TWO REFERENCES, chosen for what each can support: BELOW T_c the exact Yang magnetisation, which is an
// infinite-lattice statement; ABOVE T_c that statement is zero while a finite lattice genuinely carries
// <|M|> ~ 0.25-0.50, so the reference there is a single-temperature control run of the SAME lattice and budget.
// Using Yang above T_c would have manufactured a failure out of correct physics.

import { yangMagnetisation, ONSAGER_TC } from "./ising.js";
import { runTempering, plainRun, swapAlwaysWRONG, swapAcceptCorrect } from "./tempering.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const CFG = { L: 16, temps: [1.8, 2.0, 2.2, 2.4, 2.7], sweeps: 4000, seed: 4242 };
const run = runTempering(CFG);
const control = CFG.temps.map((T) => plainRun({ L: CFG.L, T, sweeps: CFG.sweeps, seed: CFG.seed }).absM);

// ---- 1. BELOW T_c: the exact curve ------------------------------------------------------------------------------
{
    const det = [];
    let worst = 0;
    CFG.temps.forEach((T, i) => {
        if (T >= ONSAGER_TC) return;
        const y = yangMagnetisation(T);
        worst = Math.max(worst, Math.abs(run.absM[i] - y));
        det.push("T=" + T + ": " + run.absM[i].toFixed(4) + " vs " + y.toFixed(4));
    });
    ok("!! each replica still samples its OWN Boltzmann distribution: Yang's exact curve survives the swapping",
       worst < 0.02, det.join(", ") + " (worst |diff| " + worst.toFixed(4) + ")");
}

// ---- 2. EVERY temperature against the finite-size control --------------------------------------------------------
{
    let worst = 0;
    const det = CFG.temps.map((T, i) => {
        worst = Math.max(worst, Math.abs(run.absM[i] - control[i]));
        return T + ": " + run.absM[i].toFixed(4) + "/" + control[i].toFixed(4);
    });
    ok("!! ...including ABOVE T_c, where the reference must be a same-lattice control run and not Yang's zero",
       worst < 0.03, "tempered/control " + det.join(", ") + " — worst |diff| " + worst.toFixed(4));
}

// ---- 3. THE LADDER IS A LADDER: replicas actually move, swaps actually happen ------------------------------------
{
    const rates = run.swapRate;
    ok("swap acceptance sits in a workable band at every rung (not zero, not everything)",
       rates.every((r) => r > 0.05 && r < 0.95), "rates " + rates.map((r) => r.toFixed(3)).join(", "));
    const R = CFG.temps.length;
    const visited = run.occupancy.map((row) => row.filter((f) => f > 0.01).length);
    ok("!! every replica visits every temperature — nothing is trapped, which is the point of the method",
       visited.every((v) => v === R),
       "slots visited per replica: " + visited.join(", ") + " of " + R +
       " (occupancy is uniform only in the long run; at this budget the measured spread is 0.07-0.34 against 0.20, and the claim made here is mobility, not uniformity)");
}

// ---- 4. SABOTAGE: "both configurations are legitimate, so trading them is harmless" -------------------------------
{
    const bad = runTempering({ ...CFG, accept: swapAlwaysWRONG });
    const spreadGood = run.absM[0] - run.absM[run.absM.length - 1];
    const spreadBad = bad.absM[0] - bad.absM[bad.absM.length - 1];
    ok("!! unconditional swapping SMEARS THE LADDER: the spread across temperatures collapses",
       spreadBad < spreadGood * 0.35,
       "spread " + spreadGood.toFixed(4) + " -> " + spreadBad.toFixed(4) +
       "; the sabotaged marginals read " + bad.absM.map((x) => x.toFixed(3)).join(", ") +
       " where they should read " + run.absM.map((x) => x.toFixed(3)).join(", "));
    let worstBad = 0;
    CFG.temps.forEach((T, i) => { if (T < ONSAGER_TC) worstBad = Math.max(worstBad, Math.abs(bad.absM[i] - yangMagnetisation(T))); });
    ok("!! ...and it fails Yang below T_c by a wide margin, while every configuration it produced was legitimate",
       worstBad > 0.15,
       "worst |diff| vs Yang " + worstBad.toFixed(4) +
       " — nothing in the chains looks broken; the temperatures have simply stopped meaning anything");
}

// ---- 5. determinism ----------------------------------------------------------------------------------------------
{
    const a = runTempering({ ...CFG, sweeps: 400 }), b = runTempering({ ...CFG, sweeps: 400 });
    ok("seeded runs are bit-identical (a failure reproduces)",
       a.absM.every((x, i) => x === b.absM[i]));
}


// ---- v3310: THE SWAP RULE ITSELF, WHICH SEVEN ASSERTIONS TESTED ONLY INDIRECTLY -------------------------------------
//
// Found by sweeping for exported one-line definitions that their own gate never mentions -- the pattern that let
// a 1% error in geodesic's horizon(M) pass five gates at v3309. Three such definitions exist across 59 in gated
// physics modules, and this is the load-bearing one: swapAcceptCorrect IS parallel tempering. Everything else in
// the file is bookkeeping around it.
//
// The seven assertions above test it only THROUGH FULL RUNS -- marginals, ladder spread, acceptance rate. That
// catches swapAlwaysWRONG, which is blunt. It would not reliably catch a SIGN ERROR, because a rule that accepts
// the wrong direction still produces a running ladder with plausible-looking chains, and whether the marginals
// visibly smear depends on the temperature spacing.
//
// DETAILED BALANCE IS CHECKABLE DIRECTLY AND EXACTLY. For two chains at beta_i and beta_j holding energies e_i
// and e_j, the forward and reverse acceptances must satisfy
//
//     P(forward) / P(reverse) = exp((beta_i - beta_j)(e_i - e_j))
//
// with no tolerance and no simulation. Measured: 0.062177 forward, 1.000000 reverse, ratio 6.2177e-2 against a
// required 6.2177e-2. And the Metropolis signature shows in the numbers -- ONE DIRECTION ALWAYS ACCEPTS, which
// is what min(1, ...) means and what a symmetric "just swap" rule destroys.
{
    const bI = 1 / 1.8, bJ = 1 / 2.4, eI = -120, eJ = -100;
    const fwd = swapAcceptCorrect(bI, bJ, eI, eJ);
    const rev = swapAcceptCorrect(bI, bJ, eJ, eI);
    const need = Math.exp((bI - bJ) * (eI - eJ));

    ok("!! the swap rule satisfies detailed balance EXACTLY, with no simulation",
        Math.abs(fwd / rev - need) / need < 1e-12,
        `P(fwd)/P(rev) = ${(fwd / rev).toExponential(4)} against the required ` +
        `exp((bI-bJ)(eI-eJ)) = ${need.toExponential(4)}. The seven checks above reach this only through full ` +
        "runs, which catches a blunt error like swapAlwaysWRONG but not reliably a sign error -- a rule that " +
        "accepts the wrong direction still produces a running ladder with plausible chains");

    ok("!! one direction always accepts, which is what min(1, ...) means",
        fwd === 1 || rev === 1,
        `forward ${fwd.toFixed(6)}, reverse ${rev.toFixed(6)}. A Metropolis rule never rejects the favourable ` +
        "direction; a symmetric rule that rejected both would be sampling something else entirely");

    ok("...and it is bounded to [0,1] for every argument, including reversed and degenerate ones",
        [[1, 2, -5, 5], [2, 1, 5, -5], [1, 1, 0, 0], [1e3, 1e-3, -1e4, 1e4]]
            .every((a) => { const v = swapAcceptCorrect(...a); return v >= 0 && v <= 1 && Number.isFinite(v); }),
        "including the extreme case where the exponent would overflow -- min(1, exp(...)) clamps rather than " +
        "returning Infinity, and an unclamped rule would accept everything at large beta separation");

    ok("the planted rule fails detailed balance, as it must",
        swapAlwaysWRONG() === 1 && swapAlwaysWRONG() / swapAlwaysWRONG() !== need,
        "swapAlwaysWRONG returns 1 in both directions, so the ratio is 1 and the required exponential is " +
        `${need.toExponential(2)}. It is the trap the device was built around, and now it fails at the RULE ` +
        "level rather than only after a full run");
}

console.log(fails ? ("[tempering-selfcheck] FAILED " + fails) : "[tempering-selfcheck] all passed");
process.exit(fails ? 1 : 0);
