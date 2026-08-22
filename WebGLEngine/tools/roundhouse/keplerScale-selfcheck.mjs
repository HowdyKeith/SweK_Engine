// tools/roundhouse/keplerScale-selfcheck.mjs
//
// v3517 -- KEPLER'S NUISANCE KNOB WAS HALF DEAD, AND THE HALF THAT WORKED COULD NOT BE SEEN.
//
// v3516 audited every registered nuisance knob for ADMISSIBLE liveness evidence -- a field the knob is allowed
// to move -- and kepler came back with NONE AT ALL. Its `live` flag rested entirely on one-ulp round-off in
// periodErrFrac, ITS OWN DECLARED INVARIANT. Following that back found something worse than a missing
// observable.
//
// *** THE REGISTERED KNOB IS a -> lambda*a TOGETHER WITH mu -> lambda^3*mu, AND THE BIND PASSED NEITHER. ***
// keplerThirdLaw and measurePeriod BOTH accept `mu` and BOTH default it to 1; keplerBind called them without
// it. So the compensating half of a compensated pair was dropped on the floor and what was actually under test
// was invariance under `a` alone -- a different and weaker claim than the one the register writes down. And
// keplerThirdLaw sweeps its OWN `axes`, so `a` never reached the slope fit either: slopeMeasured, slopeTheory
// and slopeErrFrac were BIT-IDENTICAL UNDER EVERY CONFIG. Invariant because UNREAD, not because the physics
// forbids it -- lens's impactParameter and blackhole's GM pair, in a device registered as eligible since v3081.
//
// The register's own prose said "every floating-point operation in the integrator sees different numbers, so
// this knob is emphatically live". IT WAS FALSE WHEN WRITTEN AND STAYED FALSE FOR 436 VERSIONS. Nothing
// compared the claim to the call.
import { getDevice } from "./devices.mjs";
import { NUISANCE_KNOBS, runNuisance } from "./nuisanceKnobs.mjs";
import { keplerThirdLaw, measurePeriod, atPerihelion } from "../../physics/orbits/kepler.js";

let fails = 0;
const check = (ok, label, note = "") => {
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? "   " + note : ""}`);
};
const report = (label, note) => console.log(`  ----  ${label}${note ? "   " + note : ""}`);

const AXES = [0.6, 0.8, 1.0, 1.4, 2.0];
const dev = await getDevice("kepler");
const k3 = (config) => dev.build({ mode: "kepler3", config });

console.log("keplerScale-selfcheck -- a dead parameter, and the observable that makes the live half visible\n");

// ---------------------------------------------------------------------------
console.log("1. THE OLD CALL SHAPE, DRIVEN: mu REACHED NOTHING");
{
    // The exact call keplerBind used to make -- no `mu`, no `axes`. Reproduced against the physics module so
    // the claim is driven rather than described, and so it keeps working after the bind is fixed.
    const old = (mu) => keplerThirdLaw({ e: 0.2, integrator: "verlet" });
    const a = old(1), b = old(1000);
    check(Object.is(a.slopeMeasured, b.slopeMeasured),
        "!! *** THE OLD CALL IS BIT-IDENTICAL FOR mu 1 AND mu 1000 -- BECAUSE mu WAS NEVER AN ARGUMENT ***",
        `both ${a.slopeMeasured}. The parameter was not merely ineffective, it was NOT PASSED. A knob whose ` +
        `transformation is never applied is invariant for the one reason that proves nothing.`);

    const withMu = [1, 50, 1000].map((mu) => keplerThirdLaw({ axes: AXES, e: 0.2, mu, integrator: "verlet" }).slopeMeasured);
    check(!withMu.every((x) => Object.is(x, withMu[0])),
        "...and PASSING it does move the arithmetic",
        `${withMu.map((x) => x.toFixed(16)).join(" ")} -- so the function always could; only the caller was wrong`);
    check(withMu.every((x) => Math.abs(x - 1.5) < 1e-12),
        "!! while the exponent still comes back 3/2, WHICH IS THE POINT",
        "T = 2*pi*sqrt(a^3/mu), so log T = const + 1.5*log a - 0.5*log mu: mu shifts the INTERCEPT of the fit " +
        "and CANNOT shift its GRADIENT. The same shape as splat's sigma at v3516, one round later in a " +
        "different device -- and here it had been hiding a wiring fault rather than a reporting one.");
}

// ---------------------------------------------------------------------------
console.log("\n2. AND `a` NEVER REACHED THE SLOPE FIT EITHER");
{
    const fixedAxes = [0.3, 1, 40].map((a) => keplerThirdLaw({ e: 0.2, mu: 1, integrator: "verlet" }).slopeMeasured);
    check(fixedAxes.every((x) => Object.is(x, fixedAxes[0])),
        "keplerThirdLaw sweeps its OWN axes, so a single `a` cannot enter it", `all ${fixedAxes[0]}`);
    const scaled = [1, 2, 7.3, 0.31].map((lam) =>
        keplerThirdLaw({ axes: AXES.map((x) => x * lam), e: 0.2, mu: lam ** 3, integrator: "verlet" }).slopeMeasured);
    check(!scaled.every((x) => Object.is(x, scaled[0])),
        "!! scaling the AXES by `a` is what makes the knob's own transformation reach the fit",
        `${scaled.map((x) => x.toFixed(16)).join(" ")}`);
    check(scaled.every((x) => Math.abs(x - 1.5) < 1e-12),
        "and the fitted exponent holds at 3/2 across a 23-fold range of scale",
        `worst |slope - 1.5| = ${Math.max(...scaled.map((x) => Math.abs(x - 1.5))).toExponential(3)}`);
}

// ---------------------------------------------------------------------------
console.log("\n3. THE SECOND OBSERVABLE, AND WHY IT IS THESE TWO");
{
    // Under a -> lambda*a with mu -> lambda^3*mu the period is UNCHANGED -- that is the whole content of the
    // invariance -- so nothing time-like can serve as evidence. The specific energy -mu/(2a) and the specific
    // angular momentum sqrt(mu*a*(1-e^2)) both carry lambda^2, so they are exactly what the knob is ALLOWED
    // to move. DERIVED FROM THE TRANSFORMATION, not chosen because they happened to wobble.
    const base = await k3({ a: 1, mu: 1 });
    for (const lam of [2, 7.3, 0.31]) {
        const o = await k3({ a: lam, mu: lam ** 3 });
        const eR = o.specificEnergy / base.specificEnergy, lR = o.angMomentum / base.angMomentum;
        check(Math.abs(eR / lam ** 2 - 1) < 1e-12 && Math.abs(lR / lam ** 2 - 1) < 1e-12,
            `lambda ${String(lam).padEnd(5)} energy and angular momentum BOTH scale as lambda^2`,
            `E ratio ${eR.toExponential(10)} vs lambda^2 ${(lam ** 2).toExponential(10)}; L ratio ${lR.toExponential(10)}`);
    }
    report("WHY A RATIO AND NOT A VALUE", "the ratio is the falsifiable form: a device that IGNORED its " +
        "config would hold specificEnergy CONSTANT and the ratio would be 1, not lambda^2. THE CHECK THAT " +
        "PROVES THE KNOB IS LIVE IS THE SAME CHECK THAT WOULD CATCH THE FAULT THIS ROUND FIXED.");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE DIMENSIONLESS FORMS ARE STRONGER INVARIANTS THAN THE TWO ALREADY REGISTERED");
{
    for (const lam of [1, 2, 7.3, 0.31]) {
        const o = await k3({ a: lam, mu: lam ** 3 });
        check(Math.abs(o.energyDimensionless + 0.5) < 1e-14 && Math.abs(o.angMomDimensionless - 1) < 1e-14,
            `lambda ${String(lam).padEnd(5)} E*a/mu = -1/2 and L/sqrt(mu*a*(1-e^2)) = 1 EXACTLY`,
            `${o.energyDimensionless} and ${o.angMomDimensionless}`);
    }
    report("WHY STRONGER", "*** slopeMeasured and periodErrFrac were satisfied by a device that read NEITHER " +
        "HALF OF ITS OWN KNOB -- that is how this fault survived 436 versions. These two are built FROM the " +
        "quantities the knob moves, so they cannot be satisfied by ignoring it: the numerator and the " +
        "denominator have to move together. AN INVARIANT WORTH HAVING IS ONE A DEAD DEVICE WOULD FAIL. ***");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE SWEEP THROUGH THE REAL HARNESS");
{
    const r = await runNuisance("kepler");
    check(r.live === true, "kepler reads LIVE");
    check(r.liveEvidence.includes("specificEnergy") && r.liveEvidence.includes("angMomentum"),
        "!! *** AND FOR THE FIRST TIME ON ADMISSIBLE EVIDENCE ***",
        `liveEvidence: ${r.liveEvidence.join(", ")}. At v3516 this list was EMPTY and the live flag rested on ` +
        `one-ulp round-off in its own invariant. A QUANTITY CANNOT BE ITS OWN LIVENESS WITNESS.`);
    check(r.verdict === "INVARIANT", "verdict INVARIANT across all four declared invariants");
    const inv = NUISANCE_KNOBS.kepler.invariants;
    check(inv.includes("energyDimensionless") && inv.includes("angMomDimensionless"),
        "the two new invariants are registered, not merely reported", inv.join(", "));
    for (const f of r.fields) {
        check(!f.bitIdentical, `${f.field} is not bit-identical`, `spread ${f.spread.toExponential(3)}`);
    }
    check(NUISANCE_KNOBS.kepler.values.includes(0.31),
        "a NON-DYADIC lambda was added", "1 and 2 differ only in the exponent, so two of the three original " +
        "values could not perturb a mantissa between them -- splat's v3516 lesson applied here");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE LOAD-BEARING NEGATIVE: A DEVICE THAT IGNORES mu");
{
    // The fault this round fixed, reproduced as a stub: compute the state with mu pinned to 1 while `a` scales,
    // which is EXACTLY what the old bind did. The old invariants accept it; the new ones do not.
    const planted = (lam) => {
        const st = atPerihelion(1 * lam, 0.5, 1); // mu PINNED -- the bug
        const r0 = Math.hypot(st.x, st.y);
        const E = 0.5 * (st.vx * st.vx + st.vy * st.vy) - 1 / r0;
        const L = st.x * st.vy - st.y * st.vx;
        return { E, L, energyDimensionless: (E * (1 * lam)) / (lam ** 3), angMomDimensionless: L / Math.sqrt(lam ** 3 * lam * (1 - 0.25)) };
    };
    const rows = [1, 2, 7.3].map(planted);
    const eDimSame = rows.every((r) => Math.abs(r.energyDimensionless + 0.5) < 1e-12);
    check(!eDimSame, "!! *** THE PLANTED DEVICE FAILS energyDimensionless ***",
        `E*a/mu reads ${rows.map((r) => r.energyDimensionless.toExponential(4)).join(" ")} instead of -0.5 at ` +
        `every lambda. The dimensionless form DIVIDES BY THE mu THE DEVICE IGNORED, so ignoring it cannot cancel.`);
    const lDimSame = rows.every((r) => Math.abs(r.angMomDimensionless - 1) < 1e-12);
    check(!lDimSame, "...and angMomDimensionless likewise",
        rows.map((r) => r.angMomDimensionless.toExponential(4)).join(" "));

    // MY FIRST VERSION OF THIS CHECK WAS WRONG AND IT MATTERED: it compared keplerThirdLaw WITHOUT mu against
    // the same call WITH mu:1000, which of course differ -- the fixed call, not the broken one. The claim being
    // made is about THE OLD CALL SHAPE, so the sweep has to be over what the CALLER intended while the callee
    // is invoked exactly as the bind used to invoke it. Flipping the assertion would have made it pass and
    // proved nothing.
    const oldShape = [1, 2, 7.3].map(() => keplerThirdLaw({ e: 0.2, integrator: "verlet" }).slopeMeasured);
    const slopeBlind = oldShape.every((x) => Object.is(x, oldShape[0]));
    check(slopeBlind, "!! while the ORIGINAL invariant is BIT-BLIND to the same fault",
        "*** THAT IS THE WHOLE ARGUMENT FOR THIS ROUND: the fault lived for 436 versions BECAUSE THE " +
        "REGISTERED INVARIANTS COULD NOT SEE IT, and a knob that is never applied passes an invariance test " +
        "perfectly. THE TEST AND THE FAULT WERE INVISIBLE TO EACH OTHER. *** " +
        `Old-shape slope at every lambda: ${oldShape[0]} -- one value, three lambdas.`);

    report("STATED BLINDNESS", "these two invariants are built from a CLOSED FORM the integrator never runs, " +
        "so they check the CONFIGURATION PATH and not the integrator. A wrong force law would leave both " +
        "exactly right -- that is what energyErrFinal, angularMomentumErr and precessionPerOrbit are for, in " +
        "the `conserve` and `closure` modes. NOT A GENERAL CORRECTNESS CHECK, AND NOT OFFERED AS ONE.");
}

console.log(`\nkeplerScale-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
