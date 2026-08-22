// tools/roundhouse/lensLiveness-selfcheck.mjs
//
// v3518 -- THE LAST SHADOW, AND THE RULE IT PAID FOR.
//
// v3516 audited every registered nuisance knob for ADMISSIBLE liveness evidence -- a moving field that is
// neither an ECHO of the config nor one of the knob's own DECLARED INVARIANTS -- and found three cases:
//   ising, splat   REAL     several fields moving by 15-200%
//   kepler         NONE     fixed at v3517: the bind passed NEITHER half of its own knob
//   lens           SHADOW   one field, deflectionErrFrac, at 5.6e-13
//
// *** LENS IS WORSE THAN A SHADOW AND SECTION 1 SHOWS IT. In the weak regime lensBind assigns
// `deflectionErrFrac = relWeak`, so the field counted as EVIDENCE THE KNOB IS LIVE is BIT FOR BIT the field
// declared as the thing being HELD STILL. The same number was simultaneously proof the knob reaches the
// arithmetic and proof the physics ignores it -- two declarations about one quantity that nobody compared,
// deciding a whole device's verdict. ***
//
// AND IT COULD NOT BE FIXED BY DECLARING THE ALIAS, because that leaves lens with nothing at all: EVERY other
// number the mode reports is either DIMENSIONLESS -- and therefore invariant under M -> lambda*M with
// b -> lambda*b by exactly the argument that makes the knob worth registering -- or an ECHO of the config.
// A DEVICE WHOSE ENTIRE OUTPUT IS DIMENSIONLESS CANNOT PROVE A SCALE KNOB IS LIVE. The fix is a LENGTH the
// integrator computes: the closest approach r_min = 1/u_max, carried out of tracePhoton at v3518.
import { getDevice } from "./devices.mjs";
import { NUISANCE_KNOBS, runNuisance } from "./nuisanceKnobs.mjs";
import { tracePhoton } from "../../physics/blackhole/geodesic.js";

let fails = 0;
const check = (ok, label, note = "") => {
    if (!ok) fails++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${note ? "   " + note : ""}`);
};
const report = (label, note) => console.log(`  ----  ${label}${note ? "   " + note : ""}`);

const knob = NUISANCE_KNOBS.lens;
const dev = await getDevice("lens");
const runAt = (lam) => dev.build({ mode: knob.mode, config: knob.apply({ ...knob.base }, lam) });

console.log("lensLiveness-selfcheck -- an alias that decided a verdict, and the rule it paid for\n");

// ---------------------------------------------------------------------------
console.log("1. THE ALIAS: THE EVIDENCE AND THE INVARIANT WERE THE SAME NUMBER");
{
    const runs = [];
    for (const lam of knob.values) runs.push(await runAt(lam));
    check(runs.every((o) => o.deflectionRegime === "weak"),
        "the registered operating point is in the WEAK regime at every lambda",
        "b/bCrit is about 11.5, and the regime is what decides which reference deflectionErrFrac grades against");
    check(runs.every((o) => Object.is(o.deflectionErrFrac, o.relWeak)),
        "!! *** deflectionErrFrac IS BIT-FOR-BIT relWeak -- THE SAME NUMBER UNDER TWO NAMES ***",
        `${runs[0].deflectionErrFrac} at lambda 1. The bind assigns one from the other; relWeak was DECLARED ` +
        `an invariant and deflectionErrFrac was NOT, so the liveness test counted it as a witness while ` +
        `holding its twin still. A DEVICE'S VERDICT RESTED ON WHICH NAME THE REGISTER HAPPENED TO LIST.`);
    check(knob.invariants.includes("deflectionErrFrac"),
        "...so it is now DECLARED, which is what it always was",
        "not a new constraint -- the same constraint, written down once instead of half-written");
}

// ---------------------------------------------------------------------------
console.log("2. AND DECLARING IT WOULD HAVE LEFT LENS WITH NOTHING");
{
    const a = await runAt(1), b = await runAt(3);
    const dimensionless = ["deflectionMeasured", "deflectionWeak", "relWeak", "deflectionErrFrac", "rMinOverB"];
    // THE THRESHOLD IS THE KNOB'S OWN DECLARED tol, NOT A NUMBER TYPED HERE. My first version used 1e-12 and
    // two fields failed at 1.15e-12 -- comfortably inside the 1e-10 the register derived from the integrator's
    // refinement residual, and outside a limit I had picked because it looked small. NEVER TYPE A REFERENCE
    // VALUE A GATE COMPARES AGAINST; ASK THE THING THAT DECLARED IT.
    for (const f of dimensionless) {
        const rel = Math.abs(b[f] - a[f]) / Math.abs(a[f]);
        check(rel < knob.tol, `${f.padEnd(20)} is dimensionless and does not move`,
            `relative change ${rel.toExponential(2)} against the register's declared tol ${knob.tol}`);
    }
    check(Math.abs(b.impactParameter / a.impactParameter - 3) < 1e-12 && Math.abs(b.bCrit / a.bCrit - 3) < 1e-12,
        "while impactParameter and bCrit DO scale -- and both are declared ECHOES",
        "b is handed straight back and bCrit is the closed form 3*sqrt(3)*M; NEITHER HAS BEEN NEAR THE " +
        "INTEGRATOR, which is why v3081 introduced echoes in the first place");
    report("SO THE GAP WAS STRUCTURAL", "*** EVERY NUMBER THIS MODE REPORTED WAS EITHER DIMENSIONLESS OR AN " +
        "ECHO. A scale knob cannot be proven live by a dimensionless output, because being unmoved is exactly " +
        "what dimensionless MEANS here. The device needed a LENGTH IT COMPUTED ITSELF. ***");
}

// ---------------------------------------------------------------------------
console.log("3. THE CLOSEST APPROACH: A LENGTH THE INTEGRATOR PRODUCES");
{
    const base = await runAt(1);
    for (const lam of knob.values.filter((v) => v !== 1)) {
        const o = await runAt(lam);
        const ratio = o.rMin / base.rMin;
        check(Math.abs(ratio / lam - 1) < 1e-12, `lambda ${String(lam).padEnd(5)} rMin scales by EXACTLY lambda`,
            `ratio ${ratio.toFixed(12)} against lambda ${lam}; rMin/lambda = ${(o.rMin / lam).toFixed(12)} ` +
            `against ${(base.rMin).toFixed(12)} at lambda 1`);
    }
    check(Math.abs(base.rMin - 1 / tracePhoton(knob.base.M, knob.base.b, { dphi: knob.base.dphi }).uMax) < 1e-12,
        "and it comes from the trace, not from a formula",
        "rMin = 1/uMax where uMax is the largest u the RK4 reached -- the perihelion. NOTHING IN THIS TREE " +
        "HAS A CLOSED FORM FOR IT, which is precisely why it is admissible: it cannot be produced by a device " +
        "that ignores its config and recites a constant.");
    check(base.rMin < knob.base.b && base.rMin > 0.9 * knob.base.b,
        "sanity: the photon's closest approach is just inside its impact parameter",
        `rMin ${base.rMin.toFixed(6)} against b ${knob.base.b} -- light bends TOWARD the mass, so r_min < b, ` +
        `and only slightly at b/bCrit = 11.5`);
}

// ---------------------------------------------------------------------------
console.log("4. rMinOverB IS A STRONGER INVARIANT THAN THE TWO ALREADY REGISTERED");
{
    const vals = [];
    for (const lam of knob.values) vals.push((await runAt(lam)).rMinOverB);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
    check(sd / Math.abs(mean) < knob.tol, "r_min/b holds across the sweep", `spread ${(sd / Math.abs(mean)).toExponential(3)} < tol ${knob.tol}`);
    check(!vals.every((x) => Object.is(x, vals[0])), "and it is NOT bit-identical, so it is not vacuous",
        `${vals.map((x) => x.toFixed(16)).join(" ")}`);
    report("WHY STRONGER", "deflectionMeasured and relWeak are both compared against 4M/b, WHICH THE BIND " +
        "COMPUTES FROM THE SAME M AND b. r_min/b is a nontrivial function of M/b with NO closed form here at " +
        "all -- it falls out of the RK4 and nowhere else -- so satisfying it requires actually integrating " +
        "the geodesic at the scaled parameters. AN INVARIANT WORTH HAVING IS ONE A DEAD DEVICE WOULD FAIL.");
}

// ---------------------------------------------------------------------------
console.log("5. THE RULE, PROMOTED -- AND THE COST MEASURED BEFORE PROMOTING IT");
{
    const audit = [];
    for (const name of Object.keys(NUISANCE_KNOBS)) audit.push({ name, r: await runNuisance(name) });
    for (const { name, r } of audit) {
        report(`${name.padEnd(10)} live=${String(r.live).padEnd(5)} evidence: ${r.liveEvidence.join(", ") || "NONE"}`);
    }
    const liveOnes = audit.filter((a) => a.r.live);
    check(liveOnes.every((a) => a.r.liveEvidence.length > 0),
        "!! *** EVERY LIVE REGISTRATION NOW CARRIES ADMISSIBLE EVIDENCE ***",
        `${liveOnes.length} live knobs, none resting on round-off. At v3516 kepler had NONE and lens had an ` +
        `ALIAS. THE RULE COSTS NOTHING TODAY BECAUSE THE TWO ROUNDS THAT PAID FOR IT CAME FIRST.`);
    check(liveOnes.every((a) => !/LIVE ONLY ON ROUND-OFF/.test(a.r.verdict)),
        "and runNuisance now REFUSES such a knob rather than reporting it",
        "v3516 reported liveEvidence and did NOT enforce it, because enforcing it then would have turned " +
        "kepler NOT LIVE -- v3132's rule that a new criterion is a BATTERY CHANGE EVERY DEVICE MUST SURVIVE. " +
        "The measurement, not the hope, is what changed.");

    const chaos = audit.find((a) => a.name === "chaos");
    check(chaos && !chaos.r.live && chaos.r.liveEvidence.length === 0,
        "chaos is still NOT LIVE and the rule does not touch it",
        "its knob reaches PAST the device to the physics module and was never expressible at device level -- " +
        "recorded rather than deleted, and NOT LIVE remains the correct verdict rather than a failure to fix");
}

// ---------------------------------------------------------------------------
console.log("6. THE LOAD-BEARING NEGATIVE: A DEVICE THAT REPORTS ONLY DIMENSIONLESS NUMBERS");
{
    // The state lens was in before this round, reproduced as a stub: the real outputs with rMin withheld.
    const runs = [];
    for (const lam of knob.values) {
        const o = await runAt(lam);
        runs.push({ deflectionMeasured: o.deflectionMeasured, relWeak: o.relWeak, deflectionErrFrac: o.deflectionErrFrac });
    }
    const invariantSet = new Set(knob.invariants);
    const evidence = Object.keys(runs[0]).filter((f) => {
        const v = runs.map((r) => r[f]);
        return !v.every((x) => Object.is(x, v[0])) && !invariantSet.has(f);
    });
    check(evidence.length === 0, "!! *** WITH rMin WITHHELD THERE IS NO ADMISSIBLE EVIDENCE AT ALL ***",
        "every remaining field is a declared invariant, so the promoted rule REFUSES this device. THAT IS " +
        "THE STATE LENS SHIPPED IN FROM v3081 TO v3517, AND THE OLD CODE CALLED IT INVARIANT.");

    const moved = Object.keys(runs[0]).filter((f) => {
        const v = runs.map((r) => r[f]);
        return !v.every((x) => Object.is(x, v[0]));
    });
    check(moved.length > 0, "...while something DID move, which is how it passed for 437 versions",
        `${moved.join(", ")} -- all of them invariants wobbling at the last bit. THE OLD TEST ASKED "DID ` +
        `ANYTHING MOVE" AND THE ANSWER WAS ALWAYS YES, BECAUSE FLOATING POINT.`);

    report("STATED BLINDNESS", "rMin proves the knob reaches the INTEGRATOR; it says nothing about whether " +
        "the geodesic is the RIGHT one. That is what deflect's own answer keys are for -- the weak-field 4M/b " +
        "and Bozza's log limit -- and what lensDeflectReference-selfcheck grades. NOT A CORRECTNESS CHECK, " +
        "AND NOT OFFERED AS ONE.");
}

console.log(`\nlensLiveness-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
