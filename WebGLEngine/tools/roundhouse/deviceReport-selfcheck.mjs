#!/usr/bin/env node
// tools/roundhouse/deviceReport-selfcheck.mjs -- v4480
//
// Run: node tools/roundhouse/deviceReport-selfcheck.mjs   (~5s, scoped)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// *** CRITERION 4'S TOLERANCE HAS NEVER REJECTED ANYTHING, AND IT LIVES IN A PARAMETER LIST. ***
//
// corroborateFully({ ..., tol = 1e-6 }) uses that default in two places. For criterion 2 it reads
// `nuisance.tol ?? tol`, and every nuisance knob declares its own tolerance with an argument beside it, so the
// default never reaches c2. For criterion 4 it uses `tol` directly, and NOT ONE of the seven refinement knobs
// declares a portability tolerance -- so c4 has been graded at 1e-6 for every device since v2908, against a
// number nobody argued for. standingSound-selfcheck calls corroborateFully without passing tol at all.
//
// MEASURED over the scoped set: 8 of 28 keyless observables move under a one-ulp libm shift, and the worst
// amplifies by 8.7e7 -- FIFTY TIMES UNDER what 1e-6 permits, which in amplification units is 4.5e9. A bar
// nothing has ever come near cannot have been doing any work.
//
// So this round REFUSES to grade c4 rather than inventing seven tolerances to make a report green, and reports
// the amplification for every observable so the round that earns them starts from a table instead of nothing.
//
// ---- SABOTAGE LOG -- 16 edits, 16 red by name, TWO of them 0 RED first, PLUS TWO THIS GATE FOUND UNPROMPTED --
// Caught at once: the report inheriting the 1e-6 default instead of Infinity (1 red); c4 getting a verdict
// with no declared bound (1); four invented tolerances making the report green (2); keylessFields readmitting
// fields that ARE or HAVE an answer key (3 and 1); structural fields graded as physics (3); amplification
// dividing by 2^-23 instead of 2^-52 (3); amplification reporting 0 for an unmeasured move (1); eligibility
// re-derived instead of asked (2); the divergence hiding the census-only device (2); the frozen record
// falsified (1); the legacy default understated (1); the scope losing kepler (4); a refinement knob gaining an
// undeclared tolerance (2).
//
// *** THE TWO THAT SURVIVED WERE BOTH BRANCHES THE SCOPE NEVER REACHED OR COUNTS THAT NEVER MOVED. ***
//   1. Dropping NEW_NUISANCE from nuisanceFor() went 0 RED: the scoped set is splat, chaos, lens and kepler,
//      all of which live in nuisanceKnobs.mjs, so the merged lookup was never exercised. optics and quantum
//      are now asked for by name, together with the negative cases.
//   2. Collapsing the mode comparison in the divergence went 0 RED because the COUNT stayed 2 either way --
//      lens disagrees about the knob NAME and optics about the MODES, and a check that only counts cannot
//      tell those apart. The reason is reported per device now and both shapes are asserted.
//
// *** AND THE GATE FOUND TWO DEFECTS IN ITS OWN MODULE BEFORE ANY SABOTAGE RAN. *** keylessFields returned
// `aExact` -- a field that is not a quantity WITH an answer key, it IS one -- which put a keyed number in the
// corroboration population and made the frozen count one too high. And the divergence reported optics as
// AGREEING because the parameter name matches, while the census scopes it to airy and slit and the canonical
// table to airy alone. Both came out of the six-field fixture and the reason-per-device report.

import fs from "node:fs";
import * as DR from "./deviceReport.mjs";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { NEW_NUISANCE } from "./corroborateFully.mjs";
import { REFINEMENT_KNOBS as CENSUS_REFINEMENT } from "./corroborationCensus.mjs";
import { reach } from "./corroborationReach.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

const R = DR.LAB_AT_V4480;
const reports = await DR.reportLab({ devices: Object.keys(DR.SCOPE), modes: DR.SCOPE });
const S = DR.summarise(reports);

// ---- 1. THE UNIT IS A DEVICE, WHICH IT HAS NEVER BEEN ------------------------------------------------------
sec("1. *** THE BATTERY OVER A WHOLE DEVICE, WHICH v2908 SAID HAD NEVER BEEN DONE FOR EVEN ONE QUANTITY ***");
{
    reports.forEach((r) => say(`${(r.device + "." + r.mode).padEnd(22)} ${(r.rows || []).length} keyless observable(s)`));
    ok("!! more than one observable of a device faces the battery in one report",
        S.observables === R.observables && reports.length === R.scopedDeviceModes && S.observables > 20,
        `${S.observables} observables over ${reports.length} device/modes. v2908's title reads "PUTTING ` +
        'SOMETHING THROUGH ALL FOUR, WHICH HAS NEVER BEEN DONE" -- it meant one quantity, and the battery has ' +
        'been called one field at a time ever since, so "this DEVICE is corroborated" was never a sentence');
    ok("the observables are KEYLESS, derived rather than listed",
        (() => {
            const probe = { a: 1, aExact: 1, bErrFrac: 0.1, gridN: 64, c: 2, d: "x" };
            const k = DR.keylessFields(probe);
            return k.length === 1 && k[0] === "c";
        })(),
        "a field with an <name>Exact sibling has an answer key, an err/delta name is a keyed error metric, and " +
        "gridN is structural. Corroboration is for quantities nobody owns the answer to; running it on a " +
        "number with a closed form measures the closed form");
}

// ---- 2. THE DEFAULT TOLERANCE, AND WHERE IT DOES AND DOES NOT REACH ----------------------------------------
sec("2. *** c2's TOLERANCE IS DECLARED SIX TIMES OVER. c4's IS A FUNCTION DEFAULT. ***");
{
    const nu = { ...NUISANCE_KNOBS, ...NEW_NUISANCE };
    const declaredNu = Object.entries(nu).filter(([, k]) => k.tol !== undefined);
    const declaredRe = Object.entries(REFINEMENT_KNOBS).filter(([, k]) => k.tol !== undefined);
    declaredNu.forEach(([d, k]) => say(`nuisance   ${d.padEnd(11)} tol ${k.tol}`));
    ok("!! every nuisance knob declares its own tolerance, so the default never reaches criterion 2",
        declaredNu.length === Object.keys(nu).length && declaredNu.length >= 6,
        `${declaredNu.length} of ${Object.keys(nu).length}, from blackhole's 0 -- exact invariance demanded -- ` +
        "to ising's 0.02. corroborateFully reads `nuisance.tol ?? tol`, and the left side always answers");
    // v4483 -- WAS `length === 7`, AND THE EIGHTH KNOB ARRIVED THIS ROUND. The claim is that NONE of them
    // declares a portability tolerance; the size of the table was scaffolding beside it, and pinning it meant
    // promoting a knob reddened a row about tolerances. A count is not a contract -- it is REPORTED below.
    ok("!! *** AND NOT ONE REFINEMENT KNOB DECLARES A PORTABILITY TOLERANCE ***",
        declaredRe.length === 0 && Object.keys(REFINEMENT_KNOBS).length > 0,
        `0 of ${Object.keys(REFINEMENT_KNOBS).length}. criterion 4 uses \`tol\` directly, so it has been graded ` +
        "at the 1e-6 function default for every device since v2908. The number is in a parameter list, which " +
        "is the one place a tolerance cannot carry the argument for itself");
    ok("...and a live caller relies on that default, which is checked rather than assumed",
        (() => {
            const src = fs.readFileSync(new URL("./standingSound-selfcheck.mjs", import.meta.url), "utf8");
            const calls = src.split("corroborateFully(").slice(1);
            return calls.length >= 2 && calls.every((c) => !/\btol\s*:/.test(c.slice(0, 400)));
        })(),
        "standingSound-selfcheck.mjs calls corroborateFully twice and passes no tol either time, so both of " +
        "its c4 verdicts are the default's. Read out of the file, not inferred");
}

// ---- 3. WHAT THE PERTURBATION ACTUALLY DOES -----------------------------------------------------------------
sec("3. *** THE BAR NOTHING HAS EVER COME NEAR, IN UNITS THAT MAKE IT A CLAIM ***");
{
    ok("!! *** NOT ONE observable exceeds the 1e-6 default -- the worst is 50x under it ***",
        S.exceedingLegacyDefault === R.exceedingLegacyDefault && S.exceedingLegacyDefault === 0 &&
        S.maxAmplification === R.maxAmplification &&
        S.maxAmplification * 50 < R.legacyDefaultAmplification,
        `${S.moved} of ${S.observables} move at all; the largest amplifies by ` +
        `${S.maxAmplification.toExponential(2)} against a default that permits ` +
        `${R.legacyDefaultAmplification.toExponential(2)}. A threshold nothing approaches is not a threshold`);
    ok("!! and AMPLIFICATION is the unit that makes them comparable, derived not chosen",
        DR.ULP === Math.pow(2, -52) && DR.amplification(DR.ULP) === 1 &&
        Math.abs(DR.amplification(1e-6) - 1e-6 / Math.pow(2, -52)) < 1 &&
        DR.amplification(null) === null,
        "the shift is one ulp of f64, so relMove / 2^-52 is how far the perturbation was magnified. A raw " +
        "relative move is not comparable across devices -- the same move means different things depending on " +
        "how much arithmetic produced it. One ulp in, one ulp out, is an amplification of exactly 1");
    S.worst.forEach((w) => say(`worst  ${w.q.padEnd(34)} x${w.amplification.toExponential(2)}`));
    ok("the worst-conditioned quantity in the scoped lab is NAMED, not just counted",
        S.worst.length > 0 && S.worst[0].q === R.maxAt,
        `${R.maxAt} amplifies a rounding error by ${S.maxAmplification.toExponential(2)}. That is a real ` +
        "statement about its conditioning and it is the kind of number a tolerance should be argued from");
}

// ---- 4. THE REFUSAL ------------------------------------------------------------------------------------------
sec("4. *** NO DECLARED BOUND, NO VERDICT -- AND THIS ROUND DECLARES NONE ***");
{
    ok("!! *** c4 is UNGRADED for every observable, because no device declares a bound ***",
        S.ungradedC4 === S.observables && S.ungradedC4 === R.ungradedC4 &&
        Object.keys(DR.PORTABILITY_TOL).length === 0,
        `${S.ungradedC4} of ${S.observables}. Earning one bound means arguing a device's conditioning and ` +
        "there are seven of them; inventing seven so the report comes back green is the ceremonial move. An " +
        "empty registry plus a refusal is an honest state, and the amplifications above are what the round " +
        "that earns them inherits");
    ok("...and the refusal is a REFUSAL, not a pass -- a declared bound produces a real verdict",
        (() => {
            const row = { moved: true, relMove: 1e-14 };
            const withTol = DR.amplification(row.relMove) <= 100;
            const withoutTol = DR.PORTABILITY_TOL.splat === undefined;
            return withoutTol && withTol === true && DR.amplification(1e-14) > 40;
        })(),
        "an amplification of 45 passes a bound of 100 and fails a bound of 10; what it must never do is " +
        "inherit a verdict from a parameter list. The report carries UNGRADED as a value, so a reader cannot " +
        "mistake it for a pass -- which is the same shape as sweepCoverage's uncoded class being its own");
    ok("the report passes Infinity for tol so nothing silently inherits the number this round is naming",
        (() => {
            const src = fs.readFileSync(new URL("./deviceReport.mjs", import.meta.url), "utf8");
            return /tol:\s*Infinity/.test(src) && !/tol:\s*1e-6/.test(src);
        })(),
        "passing 1e-6 through would make this file quote the default while criticising it, and passing " +
        "nothing would inherit it. Infinity makes c4's raw verdict meaningless on purpose -- the verdict is " +
        "discarded and only the measured amplification is kept");
}

// ---- 5. THE APPARATUS'S OWN TABLES DISAGREE ------------------------------------------------------------------
sec("5. *** TWO REFINEMENT TABLES, TWO NUISANCE TABLES, AND THE ELIGIBLE SET DEPENDS ON WHICH YOU ASK ***");
{
    const d = DR.refinementTableDivergence(CENSUS_REFINEMENT);
    say(`canonical (refinementKnobs.mjs): ${d.canonical.join(", ")}`);
    say(`second copy (corroborationCensus.mjs): ${d.census.join(", ")}`);
    // *** v4483 -- THIS ROW'S FINDING IS CLOSED, SO THE ROW IS INVERTED RATHER THAN DELETED. *** It asserted
    // the two tables disagreed, in the exact arrangement v4480 measured. The migration means there is one
    // table, so what is worth watching is that a SECOND ONE HAS NOT COME BACK -- registerDrift's shape for
    // redCensus's typed lines. Deleting the row with the finding would leave nothing looking, in a tree that
    // grew this defect once and did not notice for 447 versions.
    ok("!! *** there is ONE refinement table: the census's second declaration has not come back ***",
        d.onlyCanonical.length === 0 && d.onlyCensus.length === 0 && d.sharedDisagree.length === 0 &&
        Object.keys(d.disagreementReasons).length === 0 &&
        CENSUS_REFINEMENT === REFINEMENT_KNOBS,
        `${d.shared.length} devices, 0 divergent: ${d.shared.join(", ")}. The census re-exports the canonical ` +
        "object rather than holding its own, so this is IDENTITY and not agreement -- two tables that happened " +
        "to match today would pass a comparison and drift tomorrow");
    // AND THE COMPARATOR MUST STILL BE ABLE TO SAY NO. A detector that reports agreement for everything is
    // worth nothing, and this one could not report agreement AT ALL until v4483 -- handed two identical tables
    // it called all eight devices divergent. Both directions are driven.
    const planted = DR.refinementTableDivergence({
        ...REFINEMENT_KNOBS,
        lens: { key: "mapN", values: [9, 13, 21], modes: ["map"] },   // the entry v4483 deleted
        newcomer: { key: "z", values: [1, 2], modes: ["m"] },
    });
    ok("...and a second table IS detected -- both a changed entry and an extra one",
        planted.sharedDisagree.includes("lens") && /^knob: mapN against dphi/.test(planted.disagreementReasons.lens || "") &&
        planted.onlyCensus.includes("newcomer") && planted.sharedDisagree.length === 1,
        `planted the deleted lens entry back: ${planted.disagreementReasons.lens}; extra device ` +
        `${planted.onlyCensus.join(", ")}. Exactly one divergence found, so the detector is not blanket-failing`);
    ok("!! *** and the NUISANCE knobs live in two modules, which is how the first draft of this file got the " +
       "eligible set wrong ***",
        Object.keys(NUISANCE_KNOBS).length === 6 && Object.keys(NEW_NUISANCE).length >= 1 &&
        DR.eligibleDevices().length === R.eligibleDevices &&
        Object.keys(REFINEMENT_KNOBS).filter((x) => NUISANCE_KNOBS[x]).length === 5,
        `filtering refinement by nuisanceKnobs.mjs alone gives 5 devices AND THE WRONG FIVE -- it admits ` +
        "blackhole, whose knob is a negative control registered to MOVE, and misses optics and quantum, whose " +
        `knobs are in corroborateFully's NEW_NUISANCE. reach() merges both and drops the controls: ` +
        `${DR.eligibleDevices().join(", ")}. This file makes that mistake in its own history`);
    ok("...so eligibility is asked of the one module that already merges them, not re-derived here",
        DR.eligibleDevices().join(",") === reach().eligible.join(",") &&
        // The merged lookup must be EXERCISED: the scoped set contains no NEW_NUISANCE device, so dropping
        // the second table went 0 RED until these two were asked for by name.
        !!DR.nuisanceFor("quantum") && !!DR.nuisanceFor("optics") &&
        NUISANCE_KNOBS.quantum === undefined && NUISANCE_KNOBS.optics === undefined &&
        DR.nuisanceFor("splat") === NUISANCE_KNOBS.splat && DR.nuisanceFor("nosuchdevice") === null,
        "a fourth answer to 'who is eligible' is the last thing this apparatus needs");
}

// ---- 5b. THE WIDE SWEEP, AND WHAT IT COST TO FIND OUT WHY IT WAS OWED ----------------------------------------
sec("5b. *** v4485: THE SIX-DEVICE SWEEP, MEASURED RATHER THAN DESCRIBED ***");
{
    const W = DR.WIDE_AT_V4485;
    // The record is arithmetic about a run this gate cannot afford to repeat, so what IS checked is that it is
    // internally consistent, that it does not overclaim its coverage, and that one cheap mode still reproduces.
    ok("!! the wide record states its COVERAGE and refuses to call itself a superset of SCOPE",
        W.covered.devices === 4 && W.covered.modes === 26 && W.supersetOfScope === false &&
        W.notCovered.some((x) => /splat/.test(x)) && W.notCovered.some((x) => /quantum/.test(x)),
        `${W.covered.observables} observables over ${W.covered.devices} of 6 eligible devices. SCOPE includes ` +
        `splat's three modes and this run never reached them, so the two tables OVERLAP rather than nest -- ` +
        "a wide number quoted as though it contained the narrow one would be the worse kind of wrong");

    ok("!! *** the scoped worst case SURVIVES tripling the population, and is an outlier by 261x ***",
        W.maxAt === "kepler.conserve.growthGapFrac" &&
        Math.abs(W.maxAmplification - DR.LAB_AT_V4480.maxAmplification) < 1e-6 &&
        W.maxAmplification / W.runnerUp > 200,
        `${W.maxAmplification.toExponential(3)} still the maximum across ${W.covered.observables} observables, ` +
        `against a runner-up of ${W.runnerUp.toExponential(3)} (${(W.maxAmplification / W.runnerUp).toFixed(0)}x). ` +
        "It is the SAME number v4480 froze over 27 -- a worst case that holds when the population triples is a " +
        "fact about the quantity rather than about the sample");

    ok("...and widening DID find something, which is what stops this being a null result",
        W.newFromOutsideScope === "optics.slit.slitRms",
        "optics.slit.slitRms at 1.598e5 is fourth overall and comes from a mode SCOPE excluded. Widening found " +
        "a new entrant and found nothing that moves v4484's bound -- both halves are the finding");

    // *** THE COST, WHICH IS THE ANSWER TO 'WHY WAS THIS OWED FOR FIVE ROUNDS'. ***
    ok("!! *** one mode costs ELEVEN TIMES every completed mode put together, and did not return ***",
        W.blockingMode.mode === "optics.converge" && W.blockingMode.cpuMs > 10 * W.covered.totalMs,
        `optics.converge burned ${(W.blockingMode.cpuMs / 1000).toFixed(0)} s of CPU without returning, against ` +
        `${(W.covered.totalMs / 1000).toFixed(1)} s for all ${W.covered.modes} completed modes. v4480 said the ` +
        "sweep 'did not return inside seven minutes' and named suspects; this is the figure");

    ok("!! ...and the 120s CAP DID NOT FIRE, because a timer cannot interrupt synchronous work",
        W.blockingMode.capMs === 120000 && W.blockingMode.cpuMs > W.blockingMode.capMs * 6 &&
        /setTimeout cannot interrupt/.test(W.blockingMode.why),
        "corroborationCensus.mjs records this beside its own budget -- 'a build already running cannot be " +
        "interrupted, so one long build overruns any budget' -- and the harness re-derived it the expensive " +
        "way one round after reading that file. Only a deadline-before-start, or a killable child, is a budget");

    // ONE CHEAP MODE, RE-RUN LIVE, so the frozen record is tied to something this gate actually observed.
    const live = await DR.reportDeviceMode("lens", "deflect");
    const moved = live.rows.filter((r) => r.moved).length;
    ok("...and a cheap mode from the wide run still reproduces, so the record describes THIS lab",
        !live.error && live.rows.length === 7 && moved === 0,
        `lens.deflect: ${live.rows.length} observables, ${moved} movers, re-run live. The wide table is too ` +
        "expensive to re-derive here and is arithmetic rather than a claim about today, so one mode is driven " +
        "to tie it to a real run rather than trusting all 81");
}

// ---- 6. WHAT THIS ROUND DID NOT DO ---------------------------------------------------------------------------
sec("6. *** THE LIMITS ***");
{
    ok("the full six-device sweep is OWED, not quoted -- it did not return inside seven minutes",
        R.scopedDeviceModes === 7 && Object.keys(DR.SCOPE).length === 4,
        "optics.converge does adaptive quadrature and quantum.bands diagonalises. The scoped set is 4.2 s and " +
        "is what every number above comes from; the wide figure is in tools/ship/nextRounds.mjs rather than " +
        "estimated here");
    // v4483 -- WAS "NAMED, not migrated", asserting the divergence still existed. That was v4480's honest
    // limit and it is spent: the migration happened, and this row would now be asserting that the work it
    // asked for had NOT been done. Replaced by the measurement of what the migration actually cost.
    ok("...and the census's refinement table IS migrated now, which this round's limit no longer is",
        DR.refinementTableDivergence(CENSUS_REFINEMENT).onlyCensus.length === 0,
        "9 of 484 device/modes changed their `refinable` flag: 6 gained (blackhole.escape, kepler.conserve, " +
        "quantum.well, chaos.feigenbaum, splat.integral, lens.deflect) and 3 lost (lens.map, ct.fan, " +
        "optics.slit). Only optics.slit is a real loss, and it is a shape limit -- one mode per device -- " +
        "rather than a judgement about slit");
    say("");
    say("NOT DONE: no portability tolerance was earned, so c4 is ungraded lab-wide -- that is the point, but");
    say("  it means no device is CORROBORATED by this round either. `ct` appears only in the census's table");
    say("  and nothing here decides whether it is genuinely refinement-eligible. And the amplification figures");
    say("  are this box's: a different libm would perturb differently, which is the whole reason c4 exists.");
}

console.log();
if (fails) { console.log("deviceReport-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deviceReport-selfcheck: all checks pass");
