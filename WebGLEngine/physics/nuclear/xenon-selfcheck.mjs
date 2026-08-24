// physics/nuclear/xenon-selfcheck.mjs
//
// Run: node physics/nuclear/xenon-selfcheck.mjs
// RUNTIME 102ms MEASURED (median of 3 -- 106/102/102 -- with date(1) around the run). GUESSED 1.35s BEFORE
// MEASURING, which is THIRTEEN TIMES the real figure; the guess is named rather than quietly replaced. The
// estimate assumed the peak scan would dominate -- it walks forty simulated hours at two-second resolution,
// several times over -- but that is only ~72k evaluations of a closed form, which is nothing.
//
// *** THE THING THIS MODULE CLAIMS IS COUNTERINTUITIVE, WHICH IS WHY IT NEEDS KEYS AND NOT A PLOT. *** Shut a
// reactor down and its worst neutron poison INCREASES for about half a day. Anyone can be talked into that
// sentence; what has to be checked is that the code produces it for the right reason and puts the peak in the
// right place, because a model that peaked at three hours or at thirty would look equally plausible on a graph.
"use strict";
import {
    XENON_U235, SIGMA_F_LWR, FLUX_LWR,
    equilibrium, afterScram, afterScramIntegrated,
    peakAfterScram, peakTimeLimit, pitThreshold, pitRising, xenonReactivity,
} from "./xenon.mjs";
import { batemanChain } from "./decay.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
const H = 3600;

console.log("xenon-selfcheck -- the poison that grows after you switch the reactor off\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE CLOSED FORM IS decay.mjs's, REUSED BY SUPERPOSITION RATHER THAN REIMPLEMENTED ***");
{
    // If this file had written its own two-step chain solution, the tree would own the same algebra twice and
    // the agreement below would only prove the copy was faithful. Superposition is why there is one owner:
    // the ODEs are linear, so the xenon already present decays on its own while the iodine feeds a Bateman
    // daughter, and the two simply add.
    const X = XENON_U235;
    let worst = 0;
    for (const phi of [1e13, 3e13, 1e14]) {
        const eq = equilibrium(phi);
        for (const h of [1, 6, 12, 24]) {
            const t = h * H;
            const direct = eq.Xe * Math.exp(-X.lambdaXe * t) +
                eq.I * X.lambdaI / (X.lambdaXe - X.lambdaI) * (Math.exp(-X.lambdaI * t) - Math.exp(-X.lambdaXe * t));
            worst = Math.max(worst, rel(afterScram(phi, t).Xe, direct));
        }
    }
    ok("!! the superposed form is EXACTLY a hand-written closed form, not merely close", worst === 0,
        "worst relative difference " + worst.toExponential(3));
    ok("...and it really is decay.mjs's Bateman doing the work",
        rel(afterScram(FLUX_LWR, 6 * H).Xe - equilibrium(FLUX_LWR).Xe * Math.exp(-X.lambdaXe * 6 * H),
            batemanChain(equilibrium(FLUX_LWR).I, X.lambdaI, X.lambdaXe, 6 * H).B) < 1e-12);
    report("one owner for the chain algebra: a second copy would be a second thing to keep right");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** CLOSED FORM AGAINST RK4: ALGEBRA vs QUADRATURE, SHARING NO LINE ***");
{
    let worst = 0, n = 0;
    for (const phi of [1e13, 3e13, 1e14]) {
        for (const h of [1, 6, 12, 24]) {
            const a = afterScram(phi, h * H), b = afterScramIntegrated(phi, h * H);
            worst = Math.max(worst, rel(b.Xe, a.Xe), rel(b.I, a.I)); n++;
        }
    }
    ok("!! the two routes agree to better than 1e-12 across every flux and time tried", worst < 1e-12,
        n + " points, worst " + worst.toExponential(3));
    report("decay.mjs earned its place the same way (Bateman against RK4 at 8.2e-15) and this is that " +
           "discipline reused, not restated");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE PIT ITSELF: XENON RISES AFTER SHUTDOWN, AND PEAKS WHERE IT SHOULD ***");
{
    const p = peakAfterScram(FLUX_LWR);
    ok("!! *** at a real LWR flux the xenon RISES after a scram, which is the whole point ***",
        p.ratio > 1 && p.hours > 1, "peaks at " + p.hours.toFixed(2) + "h at " + p.ratio.toFixed(3) + "x its operating level");
    ok("...and it is a genuine interior maximum, not the endpoint of the window",
        p.hours > 0.1 && p.hours < 39, p.hours.toFixed(2) + "h inside a 40h scan");

    // THE LIMIT, and it is approached rather than hit -- the stronger kind of statement
    const limit = peakTimeLimit();
    const times = [1e14, 1e15, 1e16, 1e18].map((phi) => peakAfterScram(phi).hours);
    ok("!! the peak time approaches ln(lI/lXe)/(lI-lXe) as the flux rises",
        rel(times[times.length - 1], limit) < 1e-3, times.map((t) => t.toFixed(3)).join(" -> ") + "  limit " + limit.toFixed(3) + "h");
    ok("...monotonically, which is what makes it a check rather than one lucky value",
        times.every((t, i, a) => i === 0 || t > a[i - 1]));
    ok("...and that limit is the familiar 'about half a day after shutdown'",
        limit > 10 && limit < 12, limit.toFixed(3) + "h");
    report("the analytic limit and the search that finds the peak share no line -- one is a logarithm of two " +
           "decay constants, the other scans the closed form second by second");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** THE THRESHOLD, EMERGENT: BELOW A CERTAIN FLUX THERE IS NO PIT AT ALL ***");
{
    // Same shape as prompt criticality in kinetics.mjs: a threshold RECOVERED from where behaviour changes,
    // against a closed form derived independently -- rather than a number written down and compared to itself.
    const closed = pitThreshold();
    // bisect the SIMULATION for the sign change in dXe/dt at t=0
    let lo = 1e9, hi = 1e15;
    for (let k = 0; k < 300; k++) { const m = Math.sqrt(lo * hi); if (pitRising(m) > 0) hi = m; else lo = m; }
    const found = Math.sqrt(lo * hi);
    ok("!! the threshold bisected from the model matches the closed form", rel(found, closed) < 1e-6,
        "bisected " + found.toExponential(5) + " vs closed " + closed.toExponential(5));
    ok("!! BELOW it a scrammed core's xenon just decays -- there is no pit to wait out",
        pitRising(0.5 * closed) < 0 && peakAfterScram(0.5 * closed).hours < 0.01,
        "dXe/dt = " + pitRising(0.5 * closed).toExponential(3) + " at half the threshold");
    ok("!! ABOVE it the pit forms", pitRising(2 * closed) > 0 && peakAfterScram(2 * closed).hours > 0.1);
    ok("...and a real LWR runs a hundred times above the threshold, which is why the pit is a fact of life",
        FLUX_LWR / closed > 50, (FLUX_LWR / closed).toFixed(0) + "x");
    report("the fission cross-section CANCELS out of the threshold, so it is a property of the nuclides and " +
           "not of the reactor -- which is the sort of thing that is easy to state and worth checking");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** EQUILIBRIUM, AND THE SATURATION THAT MAKES XENON SELF-LIMITING WHILE RUNNING ***");
{
    const X = XENON_U235;
    const eq = equilibrium(FLUX_LWR);
    ok("iodine equilibrium is production over decay, exactly",
        rel(eq.I, X.yieldI * SIGMA_F_LWR * FLUX_LWR / X.lambdaI) < 1e-15);
    ok("xenon equilibrium carries the BURNUP term in its denominator, not just decay",
        rel(eq.Xe, (X.yieldI + X.yieldXe) * SIGMA_F_LWR * FLUX_LWR / (X.lambdaXe + X.sigmaXe * FLUX_LWR)) < 1e-15);
    // saturation: at high flux the burnup term dominates and xenon stops growing with flux
    const ratios = [1e13, 1e14, 1e15, 1e16].map((phi) => equilibrium(phi).Xe);
    const growth = ratios.slice(1).map((v, i) => v / ratios[i]);
    ok("!! xenon SATURATES: ten times the flux stops giving ten times the xenon",
        growth[growth.length - 1] < 1.5, "per-decade growth " + growth.map((g) => g.toFixed(2)).join(" -> "));
    report("that is the burnup term doing its job -- past a point the neutrons remove xenon as fast as iodine " +
           "can make it, which is also why the pit is so much deeper than the operating level");
    ok("xenon reactivity is negative and grows with concentration",
        xenonReactivity(eq.Xe) < 0 && xenonReactivity(2 * eq.Xe) < xenonReactivity(eq.Xe));
}

// ---------------------------------------------------------------------------
console.log("\n6. *** SABOTAGE ***");
{
    const X = XENON_U235;
    // PLANT 1: no direct xenon yield. The chain still works, the pit still forms, the peak still lands near 11h
    // -- and the THRESHOLD vanishes, because it exists only through that small direct yield.
    const noDirect = { ...X, yieldXe: 0 };
    ok("!! with no direct xenon yield the pit threshold collapses to zero -- a pit at ANY flux",
        pitThreshold(noDirect) === 0 && pitRising(1e6, noDirect) > 0,
        "threshold " + pitThreshold(noDirect) + " vs real " + pitThreshold().toExponential(4));
    ok("...while the peak time barely moves, so section 3 alone would NOT have caught it",
        rel(peakAfterScram(FLUX_LWR, noDirect).hours, peakAfterScram(FLUX_LWR).hours) < 0.2,
        peakAfterScram(FLUX_LWR, noDirect).hours.toFixed(2) + "h vs " + peakAfterScram(FLUX_LWR).hours.toFixed(2) + "h");
    report("SECTION 4 IS THE ONLY THING THAT CATCHES THAT ONE, which is the argument for having it");

    // PLANT 2: swap the two half-lives. *** THIS CHECK WAS WRITTEN THE WRONG WAY ROUND FIRST AND PASSED ON
    // FLOAT NOISE, WHICH IS WORTH RECORDING RATHER THAN QUIETLY FIXING. *** It asserted that the swap MOVES the
    // peak-time limit. It does not: ln(a/b)/(a-b) is SYMMETRIC in a and b, since negating both the logarithm and
    // the denominator leaves the quotient alone. The two evaluations differ by 5.3e-15 -- last-bit noise from a
    // different order of operations -- and an `!==` fallback in the original wording turned that noise into a
    // PASS. A check that cannot fail for the stated reason is worse than no check, so the symmetry is asserted
    // as the real property it is, and the swap is caught by the quantities that genuinely do move.
    const swapped = { ...X, lambdaI: X.lambdaXe, lambdaXe: X.lambdaI };
    ok("!! the peak-time limit is SYMMETRIC under swapping the two decay constants -- a real property",
        rel(peakTimeLimit(swapped), peakTimeLimit()) < 1e-12,
        "base " + peakTimeLimit().toFixed(12) + "h, swapped " + peakTimeLimit(swapped).toFixed(12) + "h");
    ok("...so the swap has to be caught by the THRESHOLD, which is not symmetric, and is",
        rel(pitThreshold(swapped), pitThreshold()) > 0.3,
        pitThreshold().toExponential(4) + " -> " + pitThreshold(swapped).toExponential(4));
    ok("...and by the equilibrium xenon, which carries lambdaXe in its burnup denominator",
        rel(equilibrium(FLUX_LWR, swapped).Xe, equilibrium(FLUX_LWR).Xe) > 0.05,
        equilibrium(FLUX_LWR).Xe.toExponential(4) + " -> " + equilibrium(FLUX_LWR, swapped).Xe.toExponential(4));

    // and the routes must be capable of disagreeing at all
    const bad = afterScramIntegrated(FLUX_LWR, 6 * H, { ...X, lambdaXe: X.lambdaXe * 1.05 });
    ok("!! a 5% error in one decay constant makes the two routes disagree",
        rel(bad.Xe, afterScram(FLUX_LWR, 6 * H).Xe) > 1e-3,
        "rel " + rel(bad.Xe, afterScram(FLUX_LWR, 6 * H).Xe).toExponential(2));
}

console.log("\n" + (fails ? `${fails} FAILED` : "ALL PASS"));
process.exit(fails ? 1 : 0);
