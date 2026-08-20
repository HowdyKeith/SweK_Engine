// tools/roundhouse/splatNuisance-selfcheck.mjs
//
// v3516 -- SPLAT'S NUISANCE KNOB, AND THE REGISTER ENTRY THAT WAS A HARNESS BUG.
//
// v3512 examined splat as one of three "one knob short" devices and rejected every candidate, correctly, on
// integralErrFrac: that quantity reads 7.49e-14 with a spread of EXACTLY ZERO under sigma, alpha and count
// because it is graded against its own forward model -- THE EPSILON ANSWER -- and a pure discretisation error
// is precisely the thing nothing can be invariant under.
//
// It then recorded, honestly, that compose and perspective were NOT examined "because their build output did
// not enumerate under JSON.stringify". *** THAT REASON IS WRONG AND SECTION 1 SHOWS WHY. *** Both modes
// enumerate perfectly. `{}` is what JSON.stringify returns for an UN-AWAITED PROMISE, and getDevice() and
// build() are BOTH async -- so the symptom recorded as a property of the device is the signature of a missing
// `await`. The register entry is CORRECTED IN PLACE rather than deleted (v3202's stale-suppression rule, and
// v3514's precedent for a refuted reason): the fact that the question was asked is worth keeping.
//
// THE KNOB: projected area is (f*sigma/z)^2, so sigma and f are PURE MULTIPLICATIVE SCALE FACTORS. In log-log
// they add a constant to every y, which MOVES THE INTERCEPT AND CANNOT MOVE THE SLOPE. The graded quantity is
// the slope, so they are a nuisance parameter for it -- v3500's shape, where a constant factor shifts the
// intercept of a convergence line and not its gradient.
//
// AND THE ROUND IS NOT THE REGISTRATION, IT IS THE PLANT (section 5). Minimum-pixel dilation -- widening a
// sub-pixel splat to one pixel, which every real Gaussian-splat renderer does -- leaves the slope BIT-IDENTICAL
// TO CLEAN at the device default and is caught immediately by the sweep. The mode's own headline key certifies
// a real bug that the nuisance knob catches.
import { getDevice } from "./devices.mjs";
import { NUISANCE_KNOBS, runNuisance } from "./nuisanceKnobs.mjs";
import { REJECTED_KNOBS } from "./knobCandidates.mjs";
import { reach, nuisanceNames } from "./corroborationReach.mjs";
import { projectedAreaAtDepth, areaDepthFit } from "../../physics/splat/gaussianSplat.js";

let fails = 0;
const check = (ok, label, note = "") => {
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? "   " + note : ""}`);
};
const report = (label, note) => console.log(`  ----  ${label}${note ? "   " + note : ""}`);

const ZS = [2, 3, 5, 8, 13, 21];
const fitOf = (opts, area = projectedAreaAtDepth) => {
    const xs = ZS.map(Math.log), ys = ZS.map((z) => Math.log(area(z, opts)));
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) * (xs[i] - mx); }
    const slope = num / den;
    return { slope, intercept: my - slope * mx };
};

console.log("splatNuisance-selfcheck -- splat's nuisance knob, its plant, and a corrected register reason\n");

// ---------------------------------------------------------------------------
console.log("1. THE RECORDED REASON WAS A MISSING `await`, NOT A PROPERTY OF THE DEVICE");
{
    const devPromise = getDevice("splat");
    check(JSON.stringify(devPromise) === "{}", "JSON.stringify of an UN-AWAITED getDevice() is `{}`",
        "*** THIS IS THE ENTIRE SYMPTOM v3512 RECORDED AS 'did not enumerate'. A promise stringifies to an " +
        "empty object -- it does not throw, it does not warn, IT LOOKS EXACTLY LIKE A DEVICE THAT REPORTS " +
        "NOTHING. Both getDevice() and build() are async. ***");

    const dev = await getDevice("splat");
    const buildPromise = dev.build({ mode: "perspective", config: {} });
    check(JSON.stringify(buildPromise) === "{}", "...and so does an un-awaited build()",
        "Two awaits to forget, one symptom, and the symptom is silence.");

    const persp = await dev.build({ mode: "perspective", config: {} });
    const compose = await dev.build({ mode: "compose", config: {} });
    const numeric = (o) => Object.keys(o).filter((k) => typeof o[k] === "number" && Number.isFinite(o[k]));
    check(numeric(persp).length >= 2, "AWAITED, perspective enumerates", `finite numbers: ${numeric(persp).join(", ")}`);
    check(numeric(compose).length >= 6, "AWAITED, compose enumerates", `finite numbers: ${numeric(compose).length}`);
    check(JSON.stringify(persp) !== "{}" && JSON.stringify(compose) !== "{}",
        "!! BOTH MODES STRINGIFY TO REAL OBJECTS -- the register's stated reason is refuted",
        "A REASON RECORDED IN A REGISTER IS A CLAIM ABOUT THE TREE AND GOES STALE OR WRONG LIKE ANY OTHER. " +
        "This one described the author's harness and attributed it to the device.");

    const entry = REJECTED_KNOBS["splat.nuisance-candidates"];
    check(!!entry, "the rejected entry still EXISTS rather than having been deleted",
        "v3202's rule: a register entry whose reason has been refuted is CORRECTED, not dropped -- deleting " +
        "it would lose the fact that the question was asked and settled.");
    check(/refuted|await|promise/i.test(entry.gap || ""),
        "...and its `gap` now records the refutation",
        "The integralErrFrac half of that entry STANDS and is re-measured in section 6; only the reason for " +
        "not examining the other two modes was wrong.");
}

// ---------------------------------------------------------------------------
console.log("\n2. LIVENESS: sigma AND f REACH THE ARITHMETIC, EMPHATICALLY");
{
    const small = ZS.map((z) => projectedAreaAtDepth(z, { sigma: 0.05, f: 800 }));
    const big = ZS.map((z) => projectedAreaAtDepth(z, { sigma: 0.4, f: 800 }));
    const ratios = small.map((a, i) => big[i] / a);
    const allSame = ratios.every((r) => Math.abs(r - ratios[0]) / ratios[0] < 1e-12);
    check(Math.abs(ratios[0] - 64) < 1e-9, "sigma 0.05 -> 0.4 multiplies EVERY area by exactly 64",
        `(0.4/0.05)^2 = 64, measured ${ratios[0].toFixed(9)} -- the knob is not merely delivered, it dominates the numbers`);
    check(allSame, "!! and it multiplies every depth by the SAME factor, which is why the slope cannot move",
        "*** THAT IS THE WHOLE PHYSICS OF THE KNOB IN ONE MEASUREMENT: a constant factor on every y in a " +
        "log-log fit shifts the INTERCEPT and leaves the GRADIENT alone. ***");

    const lo = fitOf({ sigma: 0.05, f: 800 }), hi = fitOf({ sigma: 0.4, f: 800 });
    check(Object.is(lo.slope, hi.slope), "the two fits agree on the slope",
        `${lo.slope} both`);
    check(Math.abs(hi.intercept - lo.intercept) > 4,
        "!! ...and DISAGREE on the intercept by more than four log units",
        `${lo.intercept.toFixed(6)} -> ${hi.intercept.toFixed(6)}. A SWEEP THAT MOVES NOTHING THE DEVICE ` +
        `REPORTS CANNOT BE SHOWN LIVE, WHICH IS WHY THE INTERCEPT IS NOW REPORTED -- see section 4.`);
}

// ---------------------------------------------------------------------------
console.log("\n3. NON-DYADIC IS NOT ENOUGH ON ITS OWN, AND THAT IS THIS ROUND'S CORRECTION TO ITSELF");
{
    const dev = await getDevice("splat");
    const slopes = async (cfgs) => {
        const out = [];
        for (const c of cfgs) out.push((await dev.build({ mode: "perspective", config: c })).areaSlope);
        return out;
    };
    const sigDyadic = await slopes([0.05, 0.1, 0.2, 0.4].map((s) => ({ sigma: s })));
    const sigNon = await slopes([0.023, 0.07, 0.31, 0.53].map((s) => ({ sigma: s })));
    check(sigDyadic.every((x) => Object.is(x, sigDyadic[0])), "DYADIC sigma is bit-identical, as the lens entry predicts",
        "scaling by a power of two only moves the IEEE exponent, so it distributes exactly");
    check(sigNon.every((x) => Object.is(x, sigNon[0])),
        "!! *** NON-DYADIC sigma IS **ALSO** BIT-IDENTICAL, WHICH THE LENS RULE DOES NOT PREDICT ***",
        "*** MY FIRST READING OF THIS SWEEP SAW ONE VALUE MOVE (sigma 0.02) AND I TOOK THE KNOB FOR " +
        "NON-BIT-IDENTICAL ON THE STRENGTH OF IT. IT IS NOT: sigma enters as a SINGLE SQUARED FACTOR, so " +
        "perturbing one mantissa is often not enough to survive the fit's own cancellation. ONE VALUE MOVING " +
        "IS A SAMPLE, NOT THE SWEEP. Registering it here would have earned a SUSPECT verdict and been read " +
        "as a pass. ***");

    const knob = NUISANCE_KNOBS.splat;
    const pair = [];
    for (const lam of knob.values) pair.push((await dev.build({ mode: "perspective", config: knob.apply({ ...knob.base }, lam) })).areaSlope);
    check(!pair.every((x) => Object.is(x, pair[0])),
        "!! scaling sigma AND f together is NOT bit-identical -- two mantissas, not one",
        `${pair.map((x) => x.toFixed(17)).join(" ")} -- this is why the registered knob is the PAIR`);
}

// ---------------------------------------------------------------------------
console.log("\n4. THE REGISTERED KNOB THROUGH THE REAL HARNESS");
{
    const r = await runNuisance("splat");
    check(r.live === true, "runNuisance reports the knob LIVE");
    check(r.liveEvidence.includes("areaIntercept"),
        "!! ...ON A FIELD THE KNOB IS **ALLOWED** TO MOVE, WHICH IS THE PART THAT MATTERS",
        `liveEvidence: ${r.liveEvidence.join(", ")}. *** I FIRST WROTE THAT WITHOUT areaIntercept THE KNOB ` +
        `"COULD NOT HAVE READ LIVE". THE SABOTAGE PROVED ME WRONG: stripped back to slope and error alone it ` +
        `STILL READ LIVE, because areaSlope itself moves BY ONE ULP. See section 8 -- that is a defect in the ` +
        `shared liveness test, not a fact about splat. ***`);
    check(r.echoes.length === 0, "...and it is live on a COMPUTED field, not an echoed input",
        "areaIntercept is produced BY THE FIT. lens's impactParameter was the counter-example: a device " +
        "ignoring its config entirely still read LIVE by handing its own input back.");
    const f = r.fields.find((x) => x.field === "areaSlope");
    check(f && f.verdict === "INVARIANT", "verdict on areaSlope is INVARIANT (not SUSPECT, not VIOLATED)",
        `spread ${f ? f.spread.toExponential(3) : "?"}, bitIdentical ${f ? f.bitIdentical : "?"}`);
    check(f && f.spread < NUISANCE_KNOBS.splat.tol,
        "the measured spread sits inside the declared tolerance", `${f.spread.toExponential(3)} < ${NUISANCE_KNOBS.splat.tol}`);
    check(f && f.spread > 0 && NUISANCE_KNOBS.splat.tol / f.spread > 1e3,
        "!! and the ORDERING is asserted rather than the number trusted",
        "the tolerance is four orders above the measured spread and fourteen below anything the physics " +
        "could do, so it is not a threshold anybody had to choose carefully");

    check(NUISANCE_KNOBS.splat.invariants.length === 1 && NUISANCE_KNOBS.splat.invariants[0] === "areaSlope",
        "areaSlopeErr is DELIBERATELY NOT an invariant",
        "*** IT IS |slope + 2| AND SITS AT ~1e-16, SO A RELATIVE SPREAD DIVIDES A ROUND-OFF DIFFERENCE BY A " +
        "ROUND-OFF MEAN AND CAN REPORT ANYTHING. A quantity whose correct value is zero cannot be judged by " +
        "a relative tolerance, and listing it would have made the verdict a coin toss on a correct device. ***");
}

// ---------------------------------------------------------------------------
console.log("\n5. THE LOAD-BEARING NEGATIVE: MINIMUM-PIXEL DILATION");
{
    // Every real Gaussian-splat renderer widens a sub-pixel splat so it does not alias away (3DGS adds ~0.3px
    // to the covariance diagonal). It is not a typo and not a synthetic corruption -- it is a rendering
    // decision, and it makes the projected area STOP falling as 1/z^2 once the far splats hit the floor.
    const MIN_PX = 2.0;
    const dilated = (z, opts) => {
        const a = projectedAreaAtDepth(z, opts);
        return Math.sqrt(a) < MIN_PX ? MIN_PX * MIN_PX : a;
    };
    const atDefault = fitOf({ sigma: 0.1, f: 800 }, dilated);
    const clean = fitOf({ sigma: 0.1, f: 800 });
    check(Object.is(atDefault.slope, clean.slope),
        "!! *** AT THE DEVICE DEFAULT sigma=0.1 THE PLANTED SLOPE IS BIT-IDENTICAL TO CLEAN ***",
        `both ${clean.slope} -- so areaSlopeErr reads EXACTLY 0 AND THE MODE'S OWN HEADLINE KEY SIGNS THE ` +
        `BUG OFF. Not "within tolerance": identical. No threshold anywhere could have caught it.`);

    const rows = [0.02, 0.05, 0.1, 0.4].map((s) => ({ s, dev: Math.abs(fitOf({ sigma: s, f: 800 }, dilated).slope + 2) }));
    for (const r of rows) report(`sigma ${String(r.s).padEnd(5)} planted |slope + 2| = ${r.dev.toExponential(3)}`);
    const worst = Math.max(...rows.map((r) => r.dev));
    check(worst > 1e-2, "!! and SWEEPING sigma EXPOSES IT AT ONCE",
        `worst ${worst.toExponential(3)} against a clean 0 -- THE NUISANCE SWEEP CATCHES A REAL BUG THE ` +
        `DEVICE'S OWN KEY CANNOT SEE, which is worth more than the eligibility the knob was built for.`);
    check(rows.find((r) => r.s === 0.1).dev === 0 && rows.find((r) => r.s === 0.02).dev > 0.5,
        "the fault is INVISIBLE at the default and LOUDEST at the small end",
        "the same shape this arc keeps finding: the regime nobody tests first is the regime that sees it");

    // AND THE BLINDNESS IS STATED RATHER THAN LEFT TO BE DISCOVERED.
    report("STATED BLINDNESS", "this knob CANNOT fail while sigma and f remain pure multiplicative scale " +
        "factors -- it catches exactly the class where they STOP being one, i.e. an extent that couples to " +
        "z, which is the Jacobian family `shear` mode already grades. It is NOT vacuous-by-arithmetic like " +
        "blackhole's GM pair: there the INPUTS round-tripped bit-for-bit, here every float in the fit " +
        "differs by 64x and the invariance survives that.");
}

// ---------------------------------------------------------------------------
console.log("\n6. THE REJECTED HALF STILL STANDS -- AND ITS STATED NUMBER IS ALSO WRONG");
{
    const dev = await getDevice("splat");
    const vals = [];
    for (const sigma of [0.05, 0.1, 0.23, 0.4]) vals.push((await dev.build({ mode: "integral", config: { sigma } })).integralErrFrac);
    const bit = vals.every((x) => Object.is(x, vals[0]));
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
    const rel = sd / Math.abs(mean);

    check(!bit, "!! *** integralErrFrac IS **NOT** BIT-IDENTICAL UNDER sigma, WHICH THE ENTRY SAYS IT IS ***",
        `${vals.map((x) => x.toExponential(6)).join(" ")} -- sigma 0.23 differs from the rest. v3512 recorded ` +
        `"a spread of EXACTLY ZERO under sigma"; that was measured on DYADIC values, where a power-of-two ` +
        `scale distributes exactly, AND IT WAS QUOTED AS A PROPERTY OF THE OBSERVABLE. SECOND WRONG DETAIL ` +
        `IN THE SAME REGISTER ENTRY, found by re-measuring rather than quoting.`);
    check(vals[0] < 1e-12, "the quantity is at MACHINE SCALE", `${vals[0].toExponential(4)} -- the epsilon answer`);
    check(rel > 1e-4, "!! and its RELATIVE spread is enormous while its ABSOLUTE movement is one ulp of nothing",
        `sd/|mean| = ${rel.toExponential(3)} on a mean of ${mean.toExponential(3)}. A DIFFERENCE OF 1.1e-16 ` +
        `DIVIDED BY A MEAN OF 7.5e-14 IS A LARGE NUMBER ABOUT NOTHING AT ALL.`);
    report("SO THE REJECTION STANDS AND IS STRONGER THAN THE ENTRY CLAIMED",
        "*** BOTH ROADS LEAD TO REFUSAL. Bit-identical would earn SUSPECT (v2906) and prove nothing; NOT " +
        "bit-identical hands runNuisance a RELATIVE spread of ~1e-3 on a quantity whose correct value is " +
        "zero, so any tolerance that passed it would be a tolerance about round-off. A QUANTITY GRADED " +
        "AGAINST ITS OWN FORWARD MODEL CANNOT SERVE AS A NUISANCE OBSERVABLE IN EITHER DIRECTION -- which " +
        "is the same reason areaSlopeErr is excluded from the invariants in section 4, arriving twice in " +
        "one round from opposite ends of the device. ***");
}

// ---------------------------------------------------------------------------
console.log("\n7. ELIGIBILITY, ASKED OF THE CENSUS RATHER THAN REBUILT");
{
    // v3515: escTolKnob-selfcheck rebuilt the eligibility union INLINE, so the census was corrected and the
    // gate was not, and the two disagreed about who is eligible. THE SECOND COPY IS NEVER THE ONE THAT GETS
    // UPDATED. This gate calls reach() and nuisanceNames() and holds no set of its own.
    const r = reach();
    check(nuisanceNames().has("splat"), "the census counts splat as carrying a nuisance knob");
    check(r.eligible.includes("splat"), "!! splat is ELIGIBLE -- both knobs, for the first time",
        `eligible: ${r.eligible.join(" ")}`);
    // reach() returns `devices` AS A COUNT, not `total` and not an array. I ASSUMED THE SHAPE TWICE -- first
    // r.total, then r.devices.length -- and BOTH PRINTED "NaN%" WHILE THE CHECK BESIDE THEM PASSED, because
    // the assertion was on eligible.length and the percentage was only in the note. A WRONG NUMBER IN A
    // MESSAGE IS NOT CAUGHT BY THE CHECK THAT MESSAGE IS ATTACHED TO, which is why this line now asserts the
    // denominator is finite instead of merely printing it.
    const total = r.devices;
    check(Number.isFinite(total) && total > 0, "the census reports a usable device count", `${total} devices`);
    check(r.eligible.length === 6, "eligibility is 6 of 72", `${r.eligible.length} of ${total} = ${(100 * r.eligible.length / total).toFixed(1)}%`);
    check(!r.eligible.includes("blackhole"),
        "blackhole is still NOT eligible, and v3515's retraction still holds",
        "its only nuisance entry is a declared NEGATIVE CONTROL, registered to MOVE. A round that quietly " +
        "re-counted it would be undoing the correction rather than building on it.");

    // ELIGIBLE IS NOT CORROBORATED, said here rather than left to be inferred.
    report("ELIGIBLE IS NOT CORROBORATED", "splat can now be PUT THROUGH the battery; nothing here says it " +
        "passes. c1 needs a sealed pre-registration it does not have. THE FOUR CRITERIA SAY WELL-BEHAVED, " +
        "NOT MEANINGFUL (v3100), and this round moved a device from CANNOT BE ASKED to CAN BE ASKED.");
}

// ---------------------------------------------------------------------------
console.log("\n8. THE SABOTAGE DID NOT BITE, AND THAT IS THE ROUND'S REAL FINDING");
{
    // THE INTENDED SABOTAGE: remove areaIntercept and areaAtUnitDepth, leaving perspective reporting only the
    // slope and its error, and watch liveness go red. IT DID NOT. Reproduced here as a STUB DEVICE rather than
    // by editing the tree, so the claim is driven rather than described.
    const knob = NUISANCE_KNOBS.splat;
    const slim = [];
    for (const lam of knob.values) {
        const c = knob.apply({ ...knob.base }, lam);
        const fit = areaDepthFit(ZS, { sigma: c.sigma, f: c.f });
        slim.push({ areaSlope: fit.slope, areaSlopeErr: Math.abs(fit.slope + 2) });
    }
    const slopeMoved = !slim.every((o) => Object.is(o.areaSlope, slim[0].areaSlope));
    check(slopeMoved, "!! *** STRIPPED TO THE SLOPE ALONE, THE INVARIANT ITSELF STILL 'MOVES' ***",
        "*** SO THE SAME 6.4e-17 WOBBLE IS SIMULTANEOUSLY THE EVIDENCE THAT THE KNOB REACHES THE ARITHMETIC " +
        "AND THE EVIDENCE THAT THE PHYSICS DOES NOT CARE. THAT IS INCOHERENT: A QUANTITY CANNOT BE ITS OWN " +
        "LIVENESS WITNESS. v3081 split `delivered` from `live` because an ECHOED INPUT is not evidence; a " +
        "DECLARED INVARIANT is not evidence either, and nothing had noticed. ***");

    const r = await runNuisance("splat");
    check(Array.isArray(r.liveEvidence), "runNuisance now REPORTS which fields supplied the liveness",
        "`liveEvidence` excludes echoes AND invariants, so an empty list beside live:true is visible");

    // AND IT IS REPORTED RATHER THAN ENFORCED, WITH THE COST MEASURED BEFORE THAT WAS DECIDED.
    const audit = [];
    for (const name of Object.keys(NUISANCE_KNOBS)) {
        const x = await runNuisance(name);
        audit.push({ name, live: x.live, ev: x.liveEvidence });
        const ev = x.liveEvidence.join(", ") || "*** NONE -- rests on round-off in its own invariant ***";
        report(`${name.padEnd(10)} live=${String(x.live).padEnd(5)} evidence: ${ev}`);
    }
    // *** THIS LINE WENT RED AT v3517 AND THAT IS THE GATE WORKING. *** It used to assert that kepler is LIVE
    // WITH NO ADMISSIBLE EVIDENCE AT ALL, and named the fix as its own round. The round happened: keplerBind
    // was passing NEITHER half of the registered knob, so slopeMeasured was bit-identical because nothing
    // reached it, and kepler now reports specificEnergy and angMomentum, which scale as lambda^2. REWRITTEN TO
    // ASSERT THE NEW PROPERTY RATHER THAN LOOSENED -- v3196's antidote, and the second time in three rounds
    // that a line naming its own expiry has been collected.
    const kepler = audit.find((a) => a.name === "kepler");
    check(kepler && kepler.live && kepler.ev.length > 0,
        "!! kepler NOW HAS ADMISSIBLE EVIDENCE -- it did not when this gate was written",
        `evidence: ${kepler.ev.join(", ")}. At v3516 this was EMPTY and its liveness rested on one-ulp ` +
        `round-off in periodErrFrac, its own invariant. Fixed at v3517; see keplerScale-selfcheck.mjs.`);
    // *** RED AT v3518, AND THAT IS THE GATE WORKING FOR THE THIRD ROUND RUNNING. *** This line asserted that
    // lens survives only on deflectionErrFrac, "a SHADOW, not an independent witness". It was worse than a
    // shadow: in the weak regime lensBind ASSIGNS deflectionErrFrac = relWeak, so the witness was BIT FOR BIT
    // the declared invariant under a second name. v3518 declared the alias and added rMin -- the closest
    // approach, a LENGTH the integrator computes -- so lens now has evidence a dimensionless output could
    // never supply. REWRITTEN TO THE NEW PROPERTY, NOT LOOSENED (v3196's antidote, third collection).
    const lens = audit.find((a) => a.name === "lens");
    check(lens && lens.ev.includes("rMin"),
        "!! lens now has evidence a DIMENSIONLESS output could never supply",
        `evidence: ${lens.ev.join(", ")}. Its whole reported surface was dimensionless or echoed, and a scale ` +
        `knob cannot be proven live by a dimensionless number -- being unmoved is what dimensionless MEANS ` +
        `here. Fixed at v3518; see lensLiveness-selfcheck.mjs.`);
    const ising = audit.find((a) => a.name === "ising");
    check(ising && ising.ev.length >= 3, "ising's evidence is real", `${ising.ev.join(", ")} at 15-70%`);

    report("WHY THIS IS A REPORT AND NOT A RULE",
        "*** ENFORCING IT WAS TRIED AND MEASURED BEFORE BEING BACKED OUT: it turns kepler NOT LIVE and puts " +
        "lens on one derived field. THAT IS A BATTERY CHANGE EVERY DEVICE MUST SURVIVE AND TWO WOULD NOT ON " +
        "FIRST CONTACT -- v3132's standing warning, the same reason the sign test never became a criterion. " +
        "The fix for kepler is the fix splat just got: a second observable the knob is ALLOWED to move. ITS " +
        "OWN ROUND, AND IT IS NAMED RATHER THAN SLIPPED IN. ***");
}

console.log(`\nsplatNuisance-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
