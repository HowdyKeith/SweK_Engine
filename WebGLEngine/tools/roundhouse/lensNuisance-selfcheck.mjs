// tools/roundhouse/lensNuisance-selfcheck.mjs
//
// Run: node tools/roundhouse/lensNuisance-selfcheck.mjs   (~30s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3081 -- THE FIFTH ELIGIBLE DEVICE, AND TWO THINGS FOUND ON THE WAY TO IT.
//
// corroborateFully can only judge a quantity whose device declares BOTH a refinement knob and a nuisance knob,
// and v2908 measured that intersection at TWO devices; it stood at four when this round began, out of 27.
// ELIGIBILITY, not tolerance, is what limits the battery -- so a knob added is a device promoted, and that is
// worth more per round than another instrument.
//
// THE PHYSICS. Schwarzschild deflection depends only on M/b. Those are the only length scales in the problem and
// the deflection angle is dimensionless, so alpha is a function of the single ratio -- the series
// alpha = 4(M/b) + (15pi/4)(M/b)^2 + (128/3)(M/b)^3 says so term by term, and v3077 already gated those
// coefficients by their power law. Scaling M and b together is therefore an EXACT invariance with a physical
// reason rather than a tolerance someone chose.
//
// IT REACHES THE ARITHMETIC, which is the part that makes it a test rather than a tautology. tracePhoton carries
// u = 1/r with du/dphi = 1/b and accel(u) = 3M u^2 - u, so u -> u/lambda scales the whole RK4 state by 1/lambda
// while phi and dphi are untouched. Every float in the loop differs; the angle must not.
//
// FINDING 1 -- A DYADIC SCALE FACTOR IS BIT-IDENTICAL, so the obvious choice of knob values would have made this
// knob indistinguishable from an unwired one. Scaling by a power of two in IEEE-754 only moves the exponent, so
// it distributes exactly over every add and multiply in the integrator and the answer comes back unchanged to
// the last bit. Measured below. That is the SUSPECT verdict the sweep was built to report, arrived at by an
// invariance that is genuinely exact -- which is exactly why SUSPECT is not a pass.
//
// FINDING 2 -- AN ECHOED INPUT WAS COUNTING AS PROOF OF LIVENESS. runNuisance asked whether ANY reported number
// moved. lens.deflect hands back impactParameter (which IS the config's b) and bCrit (the closed form
// 3 sqrt(3) M). Both scale by lambda, neither has been near the integrator, so a device whose physics ignored
// its configuration entirely would still have reported LIVE. Two claims were wearing one label -- the config
// was DELIVERED to the device, versus the COMPUTATION used it -- and they are now separate. Demonstrated with a
// stub below, not argued.

import { NUISANCE_KNOBS, runNuisance } from "./nuisanceKnobs.mjs";
import { REFINEMENT_KNOBS, classifySequence } from "./refinementKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { getDevice, DEVICE_NAMES } from "./devices.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dev = await getDevice("lens");
const deflect = (M, b, dphi = 2e-4) => dev.build({ mode: "deflect", config: { M, b, dphi } });

// ---- 1. THE BLOCKER FROM THE PREVIOUS SESSION, NAMED AND CLOSED --------------------------------------------------
// The handoff recorded "could not resolve the lens device's config shape -- getDevice('lens') returned no modes".
// It has one: lensDefaults declares eleven modes and a config, and deflect takes {M, b, dphi}. Asserting the
// route works is what stops the same hour being spent again.
{
    const o = await deflect(1, 60);
    ok("the lens device answers on mode 'deflect' with a {M, b, dphi} config",
        typeof o?.deflectionMeasured === "number" && Number.isFinite(o.deflectionMeasured),
        "deflectionMeasured = " + o.deflectionMeasured.toPrecision(12) + ", regime " + o.deflectionRegime +
        " -- the config shape the previous session could not resolve");
    ok("b = 60 sits in the WEAK regime, where the answer key is valid",
        o.deflectionRegime === "weak" && Number.isFinite(o.deflectionErrFrac),
        "b/bCrit = " + (60 / o.bCrit).toFixed(2) + " > 10. The default b = 10 lands in the MID band where " +
        "lensBind correctly reports deflectionErrFrac as null, so a knob based on it would have swept a field " +
        "that is absent by design and read as ABSENT rather than as invariant");
}

// ---- 2. THE DYADIC TRAP, MEASURED --------------------------------------------------------------------------------
{
    const dy = [];
    for (const lam of [1, 2, 4, 8]) dy.push((await deflect(1 * lam, 60 * lam)).deflectionMeasured);
    ok("!! a POWER-OF-TWO scale factor returns bit-identical values",
        dy.every((x) => Object.is(x, dy[0])),
        "lambda 1, 2, 4, 8 all give " + dy[0].toPrecision(17) + ". Scaling by 2^k in IEEE-754 moves only the " +
        "exponent, so it distributes exactly over every operation in the RK4 -- the invariance is real AND the " +
        "sweep cannot see it happen. Choosing the natural values would have produced a flawless-looking SUSPECT");

    const nd = [];
    for (const lam of NUISANCE_KNOBS.lens.values) nd.push((await deflect(1 * lam, 60 * lam)).deflectionMeasured);
    ok("...while the NON-DYADIC values in the register do move the arithmetic",
        !nd.every((x) => Object.is(x, nd[0])),
        "lambda " + NUISANCE_KNOBS.lens.values.join(", ") + " give " + nd.map((x) => x.toPrecision(17)).join(" / ") +
        " -- different in the last digits, which is what distinguishes a live invariance from an unwired knob");
    ok("the register does not contain a dyadic ratio between any two values",
        NUISANCE_KNOBS.lens.values.every((a, i) => NUISANCE_KNOBS.lens.values.every((b, j) => {
            if (i === j) return true;
            const r = a / b, l = Math.log2(r);
            return Math.abs(l - Math.round(l)) > 1e-9;
        })),
        "a pair related by a power of two would be bit-identical to each other and silently reduce the sweep's " +
        "effective width -- the hazard is between VALUES, not only against 1");
}

// ---- 3. THE INVARIANCE ITSELF, AND A TOLERANCE THAT IS DERIVED ---------------------------------------------------
let row;
{
    row = await runNuisance("lens");
    ok("!! deflection is invariant under joint scaling of M and b",
        row.verdict === "INVARIANT",
        row.fields.map((f) => f.field + " spread " + f.spread.toExponential(2)).join(", ") +
        " against tol " + NUISANCE_KNOBS.lens.tol.toExponential(0) + ". No tolerance was negotiated: the " +
        "expected answer is exact invariance because alpha is a function of M/b alone");
    ok("...and NOT bit-identical, so the knob demonstrably reached the integrator",
        row.fields.every((f) => f.bitIdentical === false),
        "every declared invariant moved in its last digits and none moved beyond tolerance -- the arithmetic " +
        "differed and the physics did not care, which is the only shape that counts as a pass here");

    // DERIVED, NOT TYPED. The invariance must hold TIGHTER than the method's own discretisation error, or it is
    // being judged inside its own noise -- a pass that would survive the integrator being wrong.
    const vals = [];
    for (const dphi of REFINEMENT_KNOBS.lens.values) vals.push((await deflect(1, 60, dphi)).deflectionMeasured);
    const cls = classifySequence(vals, REFINEMENT_KNOBS.lens.values);
    const spread = row.fields.find((f) => f.field === "deflectionMeasured").spread;
    ok("!! the nuisance spread is far smaller than the integrator's own refinement residual",
        spread < cls.finalStepRel,
        "nuisance spread " + spread.toExponential(2) + " versus refinement residual " +
        cls.finalStepRel.toExponential(2) + " (ratio " + (cls.finalStepRel / spread).toFixed(0) + "x). This is " +
        "the assertion the tolerance is standing in for: an invariance judged looser than the discretisation " +
        "error of the method is not evidence about the physics, it is evidence about the step size");
    ok("dphi is a CONVERGING refinement knob for this quantity",
        cls.verdict === "CONVERGING",
        "dphi over " + REFINEMENT_KNOBS.lens.values.join(", ") + ": " + cls.verdict +
        ", final relative step " + cls.finalStepRel.toExponential(2));
}

// ---- 4. SABOTAGE: BREAK THE INVARIANCE AND IT MUST BE SEEN --------------------------------------------------------
{
    // Scale M alone. M/b then changes, so the deflection MUST move -- if this passes, the sweep is measuring
    // nothing and section 3 is a control that cannot fail.
    const bad = [];
    for (const lam of NUISANCE_KNOBS.lens.values) bad.push((await deflect(1 * lam, 60)).deflectionMeasured);
    const mean = bad.reduce((a, b) => a + b, 0) / bad.length;
    const sd = Math.sqrt(bad.reduce((a, b) => a + (b - mean) ** 2, 0) / (bad.length - 1));
    const spread = sd / Math.abs(mean);
    ok("!! SABOTAGE: scaling M WITHOUT b is caught, by a wide margin",
        spread > NUISANCE_KNOBS.lens.tol * 1e6,
        "M-only scaling moves the deflection by a relative spread of " + spread.toExponential(2) + " against a " +
        "tolerance of " + NUISANCE_KNOBS.lens.tol.toExponential(0) + " -- " +
        Math.round(Math.log10(spread / NUISANCE_KNOBS.lens.tol)) + " orders of magnitude. The invariance is " +
        "about the RATIO, and a sweep that could not tell the two apart would be reporting dimensional analysis " +
        "rather than measuring it");

    // And the sabotage must not be caught for a trivial reason: these are real, finite deflections, not NaN.
    ok("...and the sabotaged runs are real deflections, not refusals",
        bad.every((x) => Number.isFinite(x) && x > 0),
        "values " + bad.map((x) => x.toPrecision(6)).join(", ") + " -- each a photon that escaped and was " +
        "measured. A check that passed because the sabotage produced NaN would prove nothing about the sweep");
}

// ---- 5. THE ECHO HAZARD, DEMONSTRATED WITH A STUB -----------------------------------------------------------------
{
    ok("the lens knob declares its echoed fields",
        Array.isArray(NUISANCE_KNOBS.lens.echoes) && NUISANCE_KNOBS.lens.echoes.length > 0,
        "echoes: " + (NUISANCE_KNOBS.lens.echoes || []).join(", ") + " -- impactParameter IS the config's b, " +
        "and bCrit is 3 sqrt(3) M. Both scale, neither is a measurement");

    // A device whose physics is a frozen constant, which nonetheless echoes its input back. This is the shape
    // the old liveness test could not distinguish from a working integrator.
    const FROZEN = 0.07015080831645637;
    const stub = {
        name: "echo-stub",
        async build({ config }) {
            return { impactParameter: config.b, bCrit: 3 * Math.sqrt(3) * config.M,
                     deflectionMeasured: FROZEN, relWeak: 0.05226212474684556 };
        },
    };
    const knob = { ...NUISANCE_KNOBS.lens };
    const patched = { ...knob, echoes: [] };
    const runStub = async (k) => {
        const runs = [];
        for (const v of k.values) runs.push(await stub.build({ config: k.apply({}, v) }));
        const moved = (f) => { const vv = runs.map((r) => r[f]); return !vv.every((x) => Object.is(x, vv[0])); };
        const ech = new Set(k.echoes || []);
        const keys = Object.keys(runs[0]);
        return { delivered: keys.some(moved), live: keys.some((f) => moved(f) && !ech.has(f)) };
    };
    const without = await runStub(patched), with_ = await runStub(knob);
    ok("!! WITHOUT the echo list, a device that ignores its config reports LIVE",
        without.live === true,
        "the stub's deflection is the frozen constant " + FROZEN.toPrecision(12) + " at every lambda, and it " +
        "still reads live because impactParameter moved by 107% -- this is the bug, reproduced");
    ok("!! WITH the echo list, the same stub is correctly NOT LIVE",
        with_.live === false && with_.delivered === true,
        "delivered = true (the config reached the device) and live = false (nothing computed noticed). Two " +
        "different facts that shared one field until this round");
    ok("...and the REAL device is still live under the same rule",
        row.live === true && row.delivered === true,
        "the fix must not buy its specificity by failing the working case -- lens.deflect moves " +
        "deflectionMeasured, which is not an echo of anything");
}

// ---- 6. WHAT THIS PROMOTES, AND WHAT IT DOES NOT -------------------------------------------------------------------
{
    // THE NUISANCE REGISTER LIVES IN TWO FILES, and this check's first run reported 3 eligible devices when the
    // real answer is 5 -- because it consulted NUISANCE_KNOBS alone. v2908 added quantum.L and optics.lambda as
    // NEW_NUISANCE inside corroborateFully.mjs rather than into the v2906 register, so there are two places a
    // nuisance knob can be declared and anything counting them must union both. Same shape as the three
    // definitions of "a gate exists here" that disagreed for 153 versions at v3041: a second register is not a
    // problem until something counts, and then the count is quietly wrong in the flattering direction.
    const nuis = new Set([...Object.keys(NUISANCE_KNOBS), ...Object.keys(NEW_NUISANCE)]);
    const refi = new Set(Object.keys(REFINEMENT_KNOBS));
    const eligible = [...nuis].filter((d) => refi.has(d)).sort();
    ok("the two nuisance registers do not both declare the same device",
        Object.keys(NEW_NUISANCE).every((d) => !(d in NUISANCE_KNOBS)),
        "NUISANCE_KNOBS holds " + Object.keys(NUISANCE_KNOBS).join(", ") + " and corroborateFully's NEW_NUISANCE " +
        "holds " + Object.keys(NEW_NUISANCE).join(", ") + ". Two entries for one device would mean two answers " +
        "to criterion 2 and no rule for which one a caller gets -- flagged now, while the sets are still small");
    ok("!! lens is now eligible for the full four-criterion battery",
        eligible.includes("lens"),
        "eligible: " + eligible.join(", ") + " -- " + eligible.length + " of " + DEVICE_NAMES.length +
        " devices. Eligibility is what limits corroborateFully, so this is the measure the round moved");
    ok("eligibility is still the binding constraint, and says so",
        eligible.length * 4 < DEVICE_NAMES.length,
        eligible.length + " of " + DEVICE_NAMES.length + " (" +
        (100 * eligible.length / DEVICE_NAMES.length).toFixed(0) + "%). A device outside this set has not " +
        "failed the battery, it has never faced it -- and a summary that counted only verdicts could not tell " +
        "those apart");
    console.log("  NOTE   this round makes lens ASKABLE. It does not claim lens is CORROBORATED: criterion 1");
    console.log("         (a frozen prediction) and criterion 4 (one-ulp libm stability) are corroborateFully's");
    console.log("         to answer, and running that battery is its own round with its own evidence.");
}

console.log();
if (fails) { console.log("lensNuisance-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lensNuisance-selfcheck: all checks pass");
