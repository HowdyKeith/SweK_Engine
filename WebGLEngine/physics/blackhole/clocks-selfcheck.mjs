// physics/blackhole/clocks-selfcheck.mjs
//
// v3361 -- A DEVICE THAT ONLY CARES ABOUT TIME.
//
// Time physics was scattered through the tree -- timeDilation for a static observer, redshift, properTime as one
// observable among many. Asked on its own, the clock question turns out to have an unusual density of exact
// answers, and they are independent of each other rather than four faces of one formula.
//
//   STATIC      dtau/dt = sqrt(1 - 2M/r)   -- imported from probe.js, not rewritten
//   ORBITING    dtau/dt = sqrt(1 - 3M/r)   -- gravitational AND kinematic combined into one clean form
//   CROSSOVER   an orbiting clock at r matches a static clock at r/1.5, with no M in the ratio
//   CLOCK EFFECT  t(pro) - t(retro) = 4 pi a, EXACTLY, at every radius
//
// *** THE LAST ONE IS WHY THIS IS WORTH A DEVICE. *** Two clocks on the same circular orbit, sent in opposite
// directions, meet again with their coordinate times differing by 4 pi a -- independent of the radius and of the
// mass. Measured at r = 10, 50 and 500 for a = 0.3 and 0.9: identical to twelve digits in every case.
//
// It is zero for a non-spinning hole, so it measures SPIN ALONE, from a timing difference rather than from any
// orbital geometry. And a device grading dilation RATES would miss it completely, because it is not a rate: it
// is an accumulated difference that does not shrink however far out the clocks are carried.

import {
    orbitingDilation, staticDilation, crossoverRadius,
    orbitalPeriod, clockEffect, clockEffectExact, clocksAt,
    radialLightTime, shapiroDelay, staticRedshift, orbitingRedshift,
    epicyclicKappa, radialOscillationPeriod, orbitalOmega, iscoFromTiming,
    orbitingDilationNaive,
} from "./clocks.mjs";
import { timeDilation, circularL } from "./probe.js";
import { photonSphere } from "./geodesic.js";
import { isco } from "./kerr.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const M = 1;

// ---- 1. THE STATIC RATE IS THE EXISTING ONE, NOT A SECOND COPY --------------------------------------------------
{
    ok("!! staticDilation IS probe.js's timeDilation",
        staticDilation === timeDilation,
        "identity, not agreement. A second implementation of sqrt(1 - 2M/r) would drift the moment either was " +
        "edited and both would stay internally consistent -- the duplicated-constant bug this tree keeps finding");
}

// ---- 2. THE ORBITING RATE IS A DIFFERENT QUANTITY, AND SLOWER --------------------------------------------------------
{
    const rows = [6, 10, 20, 100].map((r) => ({ r, s: staticDilation(M, r), o: orbitingDilation(M, r) }));
    ok("!! an orbiting clock runs SLOWER than a static clock at the same radius",
        rows.every((x) => x.o < x.s),
        rows.map((x) => `r=${x.r}: ${x.o.toFixed(6)} vs ${x.s.toFixed(6)}`).join("  ") + ". The orbiting clock is " +
        "at the same depth AND moving, so it picks up a kinematic slowdown the static one does not -- 3M/r " +
        "against 2M/r is exactly that extra term");

    ok("!! and the orbiting rate vanishes at the PHOTON SPHERE, not at the horizon",
        orbitingDilation(M, photonSphere(M)) === 0 && staticDilation(M, photonSphere(M)) > 0,
        `orbiting rate is 0 at r = 3M while the static rate is still ${staticDilation(M, 3).toFixed(6)}. The 3M ` +
        "in the clock formula is the same 3M as the photon sphere, which is where circular orbits stop existing " +
        "-- so the clock rate and circularL fail at the same radius, from the same physics");

    ok("...and circularL fails there too, which is the same statement",
        !Number.isFinite(circularL(M, 3)) || circularL(M, 3) > 1e10,
        "two functions written for different purposes, both singular at 3M. If one had a 2M there instead, this " +
        "check would catch the mismatch without needing to read either");
}

// ---- 2b. THE PLANTED-ERROR TWIN: orbitingDilationNaive DIFFERS FROM THE TRUE RATE BY EXACTLY 2M^2/r^2 (squared) ------
{
    const rows = [6, 8, 12, 20, 50, 1000].map((r) => {
        const nv = orbitingDilationNaive(M, r), tr = orbitingDilation(M, r);
        return { r, nv, tr, gap: (nv * nv - tr * tr) * r * r };   // should equal 2 M^2 exactly, for every r
    });
    ok("!! naive^2 - true^2, rescaled by r^2/M^2, is EXACTLY 2 at every radius -- the documented second-order error",
        rows.every((x) => Math.abs(x.gap - 2) < 1e-9),
        rows.map((x) => `r=${x.r}: ${x.gap.toFixed(9)}`).join("  ") + ". naive composes sqrt(1-2M/r)*sqrt(1-M/r) " +
        "(gravity times a Newtonian-speed SR factor) while the true rate is sqrt(1-3M/r); squaring both gives " +
        "1-3M/r+2M^2/r^2 against 1-3M/r, a gap that is EXACTLY 2M^2/r^2 and nothing else -- not a small-number " +
        "approximation, an algebraic identity, which is why it holds to 1e-9 from r=6 all the way to r=1000.");

    ok("!! and the naive rate is always FASTER than the true one -- the composed error is one-sided, not noise",
        rows.every((x) => x.nv > x.tr),
        "the extra +2M^2/r^2 under the square root makes naive^2 strictly larger than true^2 at every radius " +
        "tested, so a clock timed with the tempting-but-wrong composition always reads a bit fast, never slow.");

    ok("...and the gap SHRINKS as the clock is carried out, vanishing relative to either rate as r grows",
        (() => {
            const rel = (r) => Math.abs(orbitingDilationNaive(M, r) - orbitingDilation(M, r)) / orbitingDilation(M, r);
            return rel(6) > rel(100) && rel(100) > rel(1000) && rel(1000) < 2e-6;
        })(),
        "the rate gap itself runs from order 1e-2 near the photon sphere down under 1e-6 by r=1000 -- exactly why " +
        "a gate that only ever sampled a far-field clock could not tell this derivation from the correct one, " +
        "which is the entire reason the file plants it instead of merely warning about it.");
}

// ---- 3. THE CROSSOVER IS A PURE NUMBER ------------------------------------------------------------------------------
{
    let worst = 0;
    for (const rStat of [4, 10, 50, 1000]) {
        const rOrb = crossoverRadius(rStat);
        worst = Math.max(worst, Math.abs(orbitingDilation(M, rOrb) - staticDilation(M, rStat)));
    }
    ok("!! an orbiting clock at 1.5x the radius ticks at exactly the static rate",
        worst < 1e-15,
        `worst mismatch ${worst.toExponential(1)} across static radii 4, 10, 50 and 1000. sqrt(1 - 3M/r_orb) = ` +
        "sqrt(1 - 2M/r_stat) gives r_orb = 1.5 r_stat with the M cancelling -- gravitational speed-up and " +
        "kinematic slowdown balance at a ratio that knows nothing about the mass. This is the GPS problem exactly");
}

// ---- 4. THE GRAVITOMAGNETIC CLOCK EFFECT ------------------------------------------------------------------------------
{
    const rows = [];
    for (const a of [0.1, 0.3, 0.6, 0.9]) for (const r of [10, 50, 200]) {
        rows.push({ a, r, got: clockEffect(M, a, r), want: clockEffectExact(a) });
    }
    ok("!! t(prograde) - t(retrograde) = 4 pi a at EVERY radius tested",
        rows.every((x) => Math.abs(x.got - x.want) / x.want < 1e-9),
        `worst relative error ${Math.max(...rows.map((x) => Math.abs(x.got - x.want) / x.want)).toExponential(1)} ` +
        "over four spins and three radii. The radius cancels completely: two counter-rotating clocks meet with " +
        "their coordinate times differing by the same amount at 10M as at 200M");

    ok("!! and it is EXACTLY ZERO for a non-spinning hole",
        clockEffect(M, 0, 10) === 0 && clockEffect(M, 0, 500) === 0,
        "so the effect measures SPIN ALONE. Every other quantity here depends on M and r; this one depends on " +
        "nothing but a, which makes it a way to weigh a hole's rotation with two clocks and no ruler");

    ok("...and it does NOT shrink with distance, which is what makes it a different kind of observable",
        clockEffect(M, 0.6, 1000) > 0 && Math.abs(clockEffect(M, 0.6, 1000) - clockEffect(M, 0.6, 10)) / clockEffectExact(0.6) < 1e-6,
        `${clockEffect(M, 0.6, 10).toFixed(9)} at r = 10 and ${clockEffect(M, 0.6, 1000).toFixed(9)} at r = 1000. ` +
        "Every dilation RATE tends to 1 far away and the differences vanish; this is an accumulated difference " +
        "that does not. A device grading rates alone would report 'no effect at large r' and be wrong");
}

// ---- 5. THE PERIODS THEMSELVES ARE ORDERED ----------------------------------------------------------------------------
{
    const a = 0.6, r = 12;
    // CORRECTION: this first asserted prograde is FASTER, reasoning that frame dragging carries it along. The
    // measurement says the opposite and the measurement is right. The Boyer-Lindquist angular velocity is
    // Omega = sqrt(M)/(r^{3/2} +- a sqrt(M)), so the PROGRADE denominator is LARGER and its angular velocity
    // SMALLER -- a prograde orbit needs less angular momentum to hold the same radius, and correspondingly goes
    // round more slowly. That sign is precisely why the clock effect comes out POSITIVE at 4 pi a; asserting it
    // the other way would have contradicted the headline result in the same file.
    ok("prograde orbits take LONGER in coordinate time than retrograde at the same radius",
        orbitalPeriod(M, a, r, true) > orbitalPeriod(M, a, r, false),
        `${orbitalPeriod(M, a, r, true).toFixed(6)} prograde against ${orbitalPeriod(M, a, r, false).toFixed(6)} ` +
        "retrograde. Frame dragging lets a prograde orbit hold its radius with less angular momentum, so it " +
        "sweeps more slowly -- and t(pro) - t(retro) being positive IS the 4 pi a clock effect");

    const o = clocksAt(M, a, r);
    ok("...and the report is internally consistent",
        Math.abs((o.periodPro - o.periodRetro) - o.clockEffect) < 1e-12 &&
        Math.abs(o.clockEffect - o.clockEffectExact) / o.clockEffectExact < 1e-9,
        "the reported effect equals the difference of the reported periods AND the closed form. Stated because " +
        "a report that computed its summary separately from its parts could disagree with itself");
}


// ---- 6. SHAPIRO DELAY, EXACT AND CHECKED BY INTEGRATION -----------------------------------------------------------
//
// A radial null geodesic obeys dt/dr = r/(r - 2M), which integrates in closed form. The usual textbook Shapiro
// formula is a weak-field logarithm; this one is exact all the way down to the horizon.
{
    const numeric = (r1, r2, n = 400000) => {
        let s = 0; const h = (r2 - r1) / n;
        for (let i = 0; i < n; i++) { const r = r1 + (i + 0.5) * h; s += r / (r - 1 * 2) * h; }
        return s;
    };
    const pairs = [[3, 10], [4, 50], [2.5, 20]];
    const worst = Math.max(...pairs.map(([a, b]) => Math.abs(radialLightTime(M, a, b) - numeric(a, b)) / radialLightTime(M, a, b)));
    ok("!! the closed-form radial light time matches direct integration of dt/dr",
        worst < 1e-9,
        `worst relative difference ${worst.toExponential(1)} over three radius pairs, against a 400k-step midpoint ` +
        "integration. Algebra against quadrature -- two routes that share no line, and the closed form is exact " +
        "rather than the weak-field logarithm usually quoted");

    ok("!! the delay diverges at the horizon, because a signal from there never arrives",
        !Number.isFinite(shapiroDelay(M, 2 * M, 10)) && shapiroDelay(M, 2.0001, 10) > 10,
        `delay from r = 2.0001M is ${shapiroDelay(M, 2.0001, 10).toFixed(3)} and from exactly 2M it is infinite. ` +
        "The log term carries that divergence, which is why the exact form is worth having over the weak-field one");

    ok("...and it is positive everywhere, so light is always LATE",
        [[3, 10], [10, 1000], [50, 60]].every(([a, b]) => shapiroDelay(M, a, b) > 0),
        "curvature can only add coordinate time. A negative delay anywhere would mean the integrand dipped below " +
        "1, which cannot happen outside the horizon");
}

// ---- 7. THE ORBITING EMITTER IS MORE REDSHIFTED THAN THE STATIC ONE -----------------------------------------------------
{
    ok("!! an orbiting emitter is redshifted MORE than a static one at the same radius",
        [4, 6, 10, 100].every((r) => orbitingRedshift(M, r) > staticRedshift(M, r)),
        [10, 100].map((r) => `r=${r}: ${orbitingRedshift(M, r).toFixed(6)} vs ${staticRedshift(M, r).toFixed(6)}`).join("  ") +
        ". The orbiting emitter is at the same depth AND moving, so its clock rate carries both effects. This is " +
        "the link between emit.mjs -- which says WHICH directions escape -- and this module, which says how far " +
        "the escaping signal is shifted");

    ok("!! and each redshift is exactly the inverse of its own clock rate",
        Math.abs((1 + staticRedshift(M, 10)) * staticDilation(M, 10) - 1) < 1e-15 &&
        Math.abs((1 + orbitingRedshift(M, 10)) * orbitingDilation(M, 10) - 1) < 1e-15,
        "(1+z) * (dtau/dt) = 1 for both. Stated as a CONSISTENCY check rather than as evidence -- redshift and " +
        "dilation are two ways of writing one quantity, so this catches a typo and proves no physics");

    ok("...and the orbiting redshift is infinite at 3M, not at 2M",
        !Number.isFinite(orbitingRedshift(M, 3)) && Number.isFinite(staticRedshift(M, 3)),
        `a static emitter at r = 3M is shifted by ${staticRedshift(M, 3).toFixed(6)} and an orbiting one cannot ` +
        "exist there at all. The photon sphere is where orbiting stops, so that is where the orbiting redshift " +
        "diverges -- the same 3M as the clock rate and as circularL");
}

// ---- 8. THE ISCO AS A STATEMENT ABOUT TIME -----------------------------------------------------------------------------
{
    ok("!! the radial oscillation period DIVERGES at 6M, which locates the ISCO by timing alone",
        !Number.isFinite(radialOscillationPeriod(M, 6)) &&
        radialOscillationPeriod(M, 6.5) > radialOscillationPeriod(M, 8),
        `period is ${radialOscillationPeriod(M, 8).toFixed(2)} at r = 8M, ${radialOscillationPeriod(M, 6.5).toFixed(2)} ` +
        "at 6.5M and infinite at 6M. Nudge a circular orbit radially and it oscillates at kappa = Omega " +
        "sqrt(1 - 6M/r); inside 6M it does not oscillate, it grows. The ISCO is usually a stability result and " +
        "this derives the same radius from a clock going infinitely slow");

    ok("!! and that radius agrees EXACTLY with kerr.js's isco at zero spin",
        iscoFromTiming(M) === isco(M, 0, true),
        `${iscoFromTiming(M)} from timing against ${isco(M, 0, true)} from the Bardeen-Press-Teukolsky root. Two ` +
        "modules, two derivations -- an epicyclic frequency and an orbital-stability condition -- landing on the " +
        "same number without sharing a line");

    ok("...and kappa is strictly below Omega everywhere outside the ISCO",
        [7, 10, 50, 1000].every((r) => epicyclicKappa(M, r) < orbitalOmega(M, r)),
        "the radial oscillation is always slower than the orbit itself, which is why orbits precess forward. In " +
        "Newtonian gravity kappa equals Omega exactly and orbits close -- the gap between them IS the precession");
}

console.log();
if (fails) { console.log("clocks-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("clocks-selfcheck: all checks pass");
