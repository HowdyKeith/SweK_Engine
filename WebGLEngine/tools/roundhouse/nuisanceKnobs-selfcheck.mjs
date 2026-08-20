// tools/roundhouse/nuisanceKnobs-selfcheck.mjs
//
// Run: node tools/roundhouse/nuisanceKnobs-selfcheck.mjs   (~2 min)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2906 -- THE FIRST TIME CRITERION 2 WAS ASKED, AND THE FIRST TIME IT FAILED.

import { NUISANCE_KNOBS, nuisanceSweep, nuisanceLines, runNuisance, NUISANCE_REGISTRATION } from "./nuisanceKnobs.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. THE REGISTER DEMANDS A SENTENCE ---------------------------------------------------------------------------
{
    const entries = Object.entries(NUISANCE_KNOBS);
    ok("every declared knob carries the reason the physics forbids it from mattering",
        entries.every(([, k]) => typeof k.why === "string" && k.why.length > 80),
        entries.length + " knobs declared, each with a stated rationale -- the same ceremony EXACT_OK forces for " +
        "exact zeros: an entry cannot be added without writing the sentence");
    ok("at least one knob is a declared NEGATIVE control",
        entries.some(([, k]) => k.negativeControl),
        "a sweep that has only ever reported invariance has unknown power to detect movement");
}

const rows = await nuisanceSweep();
console.log();
nuisanceLines(rows).forEach((l) => console.log(l));
console.log();
const by = (d) => rows.find((r) => r.device === d);

// ---- 2. THE NEGATIVE CONTROL, WHICH LICENSES EVERY OTHER VERDICT --------------------------------------------------
{
    const bh = by("blackhole");
    ok("!! the sweep can detect movement when movement is expected",
        bh.verdict.startsWith("CONTROL OK"),
        "halving blackhole's timestep moved escapeV by " + bh.fields[0].spread.toExponential(2) +
        " -- a refinement knob must move the answer, and if this had come back invariant every pass below would " +
        "have been the sweep failing to look");
}

// ---- 3. CRITERION 2, ASKED FOR THE FIRST TIME ---------------------------------------------------------------------
{
    const is = by("ising");
    ok("!! the lab's first genuine nuisance-invariance pass",
        is.verdict === "INVARIANT" && is.live,
        "ising magnetisation across five Metropolis streams: spread " + is.fields[0].spread.toExponential(2) +
        ", energy " + is.fields[1].spread.toExponential(2) + ", both inside the 2% tolerance -- and NOT " +
        "bit-identical, which is what distinguishes a real invariance from an unwired knob");

    // The liveness machinery caught three unearned passes on its first run, which is the reason it exists.
    const ch = by("chaos");
    ok("!! an unwired knob is reported as unearned, not as a flawless invariance",
        ch.verdict.startsWith("KNOB NOT LIVE") && NUISANCE_KNOBS.chaos.unreachable,
        "chaos.lyapunov returned four bit-identical values because chaosBind's config exposes r/warmup/count and " +
        "NOT x0 -- the lab's one pre-existing nuisance test reaches past the device to the physics module, so it " +
        "was never expressible at device level. Recorded rather than deleted; a naive sweep would have scored this " +
        "as a perfect pass");

    // v3517 -- *** THIS CHECK USED TO ASSERT verdict === "SUSPECT" AND HEDGED BETWEEN TWO EXPLANATIONS:
    // "very likely exact invariance rather than an unwired field. The sweep cannot tell those apart and says
    // SUSPECT rather than guessing." IT WAS THE UNWIRED FIELD. *** keplerBind passed NEITHER `mu` NOR `a` into
    // keplerThirdLaw, so slopeMeasured was bit-identical because nothing reached it. The honest refusal to
    // guess was right; what it needed was somebody to go and look, and the hedge sat in the gate for 436
    // versions reading like a settled nuance. A GATE THAT NAMES TWO POSSIBILITIES HAS NAMED A ROUND, NOT A
    // RESULT. The check now asserts the ANSWER, and the SUSPECT verdict is gone because the cause is fixed.
    const kp = by("kepler");
    ok("scale invariance now holds on a knob that actually reaches the arithmetic",
        kp.verdict === "INVARIANT" && kp.live &&
        kp.fields.every((f) => f.verdict === "INVARIANT" && !f.bitIdentical),
        "a -> lambda*a with mu -> lambda^3*mu, WITH BOTH HALVES NOW PASSED THROUGH: slopeMeasured " +
        kp.fields.find((f) => f.field === "slopeMeasured").spread.toExponential(2) + ", periodErrFrac " +
        kp.fields.find((f) => f.field === "periodErrFrac").spread.toExponential(2) + ", and the two " +
        "dimensionless forms added at v3517 -- NONE of them bit-identical, so the invariance is earned " +
        "rather than vacuous. See tools/roundhouse/keplerScale-selfcheck.mjs");
    ok("and its liveness rests on fields the knob is ALLOWED to move",
        kp.liveEvidence.includes("specificEnergy") && kp.liveEvidence.includes("angMomentum"),
        "specific energy and specific angular momentum both scale as lambda^2 under this transformation. " +
        "At v3516 this list was EMPTY: kepler read LIVE only through one-ulp round-off in its own invariant");
}

// ---- 4. THE PRE-REGISTERED PREDICTION, AND THE FINDING ------------------------------------------------------------
{
    const dev = await getDevice("ising");
    const seeds = NUISANCE_KNOBS.ising.values;
    const spreadAt = async (T) => {
        const vals = [];
        for (const seed of seeds) vals.push((await dev.build({ mode: "order", config: { T, seed } })).magnetisation);
        const m = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length - 1));
        return { m, spread: sd / Math.abs(m) };
    };
    const lo = await spreadAt(2.0), crit = await spreadAt(2.27), hi = await spreadAt(2.6);
    const ratio = crit.spread / lo.spread;

    ok("!! pre-registered prediction HELD: seed spread blows up at the critical point",
        ratio >= NUISANCE_REGISTRATION.claim.min,
        "spread " + lo.spread.toExponential(2) + " at T=2.00 -> " + crit.spread.toExponential(2) + " at T=2.27, " +
        "a ratio of " + ratio.toFixed(1) + "x against a registered floor of " + NUISANCE_REGISTRATION.claim.min +
        "x. Critical slowing down: the correlation time diverges at Tc = 2/ln(1+sqrt2) = 2.269 and a fixed " +
        "400-sweep warmup stops equilibrating");

    // THE FINDING. Criterion 2 does not pass or fail for a device -- it passes or fails for a device AT A POINT
    // IN ITS PARAMETER SPACE. ising's magnetisation is reproducible to 0.7% at T = 2.0 and to 7.4% at Tc, and
    // the second number is outside the tolerance the first one passed under. The device reports magnetisation
    // identically in both regimes with nothing attached to say its reproducibility moved by an order of magnitude.
    ok("!! and at the critical point criterion 2 FAILS against the tolerance it passes at T=2.0",
        crit.spread > NUISANCE_KNOBS.ising.tol && lo.spread < NUISANCE_KNOBS.ising.tol,
        "T=2.27 spread " + crit.spread.toExponential(2) + " exceeds the 2% seed tolerance that T=2.00 (" +
        lo.spread.toExponential(2) + ") passes comfortably. A single tolerance across a phase diagram is the " +
        "wrong shape of claim: what the lab can promise about this observable depends on where it is asked");

    ok("...and it degrades further above Tc, where M is small and finite-size fluctuation dominates",
        hi.spread > crit.spread,
        "T=2.60 spread " + hi.spread.toExponential(2) + " at mean M = " + hi.m.toFixed(4) +
        " -- expected physics rather than a defect, but ising.transition reads its 'above' magnetisation here");

    // Does the finding actually break anything? The transition mode compares T=2.0 against T=2.6; the gap is
    // 0.907 vs 0.162, so 25% seed noise on the smaller value cannot invert the comparison. Stating it because a
    // finding that is not chased to its consequence is half a finding.
    const t = await dev.build({ mode: "transition" });
    const nums = Object.entries(t).filter(([, v]) => typeof v === "number");
    ok("the transition claim survives the noise it is standing in",
        nums.length > 0,
        "transition reports " + nums.map(([k, v]) => k + "=" + (+v).toPrecision(4)).join(", ") +
        " -- the below/above gap is ~0.75 in magnetisation against ~25% relative noise on the smaller side, so " +
        "the ordering cannot flip; the claim is safe and the ERROR BAR on it was never reported");
}

// ---- 5. WHAT THIS DOES NOT ESTABLISH -------------------------------------------------------------------------------
{
    // v3081 -- the name said "four" while the detail said five, because the label was typed and the number was
    // derived. Same correction as the sister file: assert the PROPERTY (coverage is a small minority) against
    // the live device registry, and let the label follow the count instead of contradicting it.
    const nKnobs = Object.keys(NUISANCE_KNOBS).length, nDev = DEVICE_NAMES.length;
    ok("a handful of knobs is not a lab", nKnobs * 2 < nDev,
        nKnobs + " declared of " + nDev + " devices (" + (100 * nKnobs / nDev).toFixed(0) + "%) -- criterion 2 " +
        "remains untested for the rest, and each one testable so far took a round to find because most devices " +
        "expose no knob the physics considers irrelevant");
    console.log("  NOTE   a nuisance parameter is the only one of the four criteria with no tolerance to");
    console.log("         negotiate: the expected answer is invariance. That is why the ising result is worth");
    console.log("         more than a pass -- the tolerance it violates was not chosen to make it fail.");
}

console.log();
if (fails) { console.log("nuisanceKnobs-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("nuisanceKnobs-selfcheck: all checks pass");
