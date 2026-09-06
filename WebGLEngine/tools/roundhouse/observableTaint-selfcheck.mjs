// tools/roundhouse/observableTaint-selfcheck.mjs -- v4479 -- the gate for tools/roundhouse/observableTaint.mjs.
//
// Run: node tools/roundhouse/observableTaint-selfcheck.mjs
//
// *** THE INSTRUMENT MAKES A CLAIM OF THE FORM "THIS NUMBER IS DOWNSTREAM OF THAT CALL", SO IT IS GRADED
// AGAINST DEVICES WHOSE ANSWER IS KNOWN BEFORE IT RUNS. *** Sections 1 and 2 use synthetic builds where the
// dependence structure is written by hand -- one observable that uses cos, one that uses nothing, one that
// uses a DIFFERENT function -- because a detector run only against real devices can be graded on whether its
// output looks plausible, which is not a grading at all.
//
// ---- *** SIX SABOTAGES, RESULTS BY NAME, AND NONE WENT ZERO-RED *** ------------------------------------------
//
//  A. Perturb nothing: return the original function unchanged  -> 6 RED
//  B. Report every observable as moved                         -> 8 RED
//  C. Skip the determinism check and attribute anyway          -> 1 RED
//  D. Perturb ALL functions at once instead of one at a time   -> 2 RED
//  E. Expose the unmoved set under the name `portable`         -> 1 RED
//  F. Leave Math patched after the build                       -> 3 RED
//
// C and E read 1 because each is owned by a single assertion, and both are assertions nothing else can stand
// in for: C's fixture is the only non-deterministic build in the file, and E is a claim about the SHAPE of the
// result rather than about any number in it. A low count is reported rather than argued away -- but neither is
// a check that merely restates its neighbours, which is what a low count usually means.
//
// ---- *** TWO CHECKS IN THIS FILE COULD NOT FAIL AND BOTH WERE MINE, WHICH IS NOW A PATTERN AND NOT A SLIP ***
//
// The first draft carried `ok(name, (() => true)())` -- an IIFE returning true, a placeholder for the measured
// check below it that read PASS on its own -- and `ok(name, async () => {...}())`, which hands `ok` a PROMISE.
// A promise object is truthy, so that line reported PASS whether the tripwire disarmed or not. v4478's gate
// had the same defect in the same shape (`ok(name, async () => true)`), so this session has now written it
// THREE TIMES, every time in a round whose subject is checks that cannot see what they are for.
//
// The cause is not carelessness about the assertion, it is that `ok(name, condition)` takes ANY value and a
// function or a promise is a value. The repair here is local -- both are deleted rather than fixed, because
// each sat next to a real measurement that already did the work -- but the general repair is a signature that
// refuses a function, and that belongs to whichever round owns the `ok` helper rather than to this one.
//
// ---- *** WHAT THIS GATE DOES NOT CLAIM *** ------------------------------------------------------------------
//
// That an unmoved observable is portable. That is the one thing the method cannot establish and the gate
// asserts the shape REFUSES to say it. That the real-device numbers in the record are reproducible on another
// machine -- they are this box's, and the record says so. And that perturbation finds every dependence: a
// smaller epsilon finds less, and section 4 measures that rather than assuming it.

import {
    UNSPEC, EPS, runInstrumented, attribute, bounds, numericKeys, TAINT_AT_V4479 as REC,
} from "./observableTaint.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const say = (m) => console.log("  ----  " + m);

console.log("observableTaint-selfcheck -- which of a build's numbers are actually downstream\n");

// ---- 1. A BUILD WHOSE DEPENDENCE STRUCTURE IS KNOWN BEFORE THE INSTRUMENT RUNS -------------------------------
console.log("1. a synthetic device: one observable uses cos, one uses pow, one uses neither");

const known = () => ({
    fromCos: Math.cos(0.7) * 2,
    fromPow: Math.pow(1.3, 2.5),
    fromNothing: 6 * 7,
    alsoNothing: 1 / 3,
});

const a1 = await attribute(known);
say(`status ${a1.status}; used ${a1.used.join(",")}; moved ${a1.moved.join(",")}`);
ok("!! the observable built from cos is found, BY NAME", a1.moved.includes("fromCos"));
ok("!! the observable built from pow is found too, and attributed to pow rather than to cos",
    a1.byFn.pow.includes("fromPow") && !a1.byFn.cos.includes("fromPow"),
    "sabotage D: perturbing every function at once gets the union right and every attribution wrong");
ok("!! the two that use neither are NOT reported as moved",
    !a1.moved.includes("fromNothing") && !a1.moved.includes("alsoNothing"),
    "sabotage B: reporting everything as moved makes the lower bound equal the upper one and says nothing");
ok("cos is not credited with the pow observable and vice versa",
    a1.byFn.cos.includes("fromCos") && !a1.byFn.pow.includes("fromCos"));
ok("only the functions the build actually called are perturbed at all",
    a1.used.length === 2 && a1.used.includes("cos") && a1.used.includes("pow"),
    `used ${JSON.stringify(a1.used)} of ${UNSPEC.length} instrumented`);

// ---- 2. THE PERTURBATION IS REAL, AND THE DETERMINISM GUARD IS NOT DECORATIVE ---------------------------------
console.log("\n2. the two ways this instrument could quietly produce nonsense");

{
    const ignores = () => { Math.cos(0.3); return { count: 42 }; };
    const r = await attribute(ignores);
    say(`a build calling cos and discarding it: used ${r.used.join(",")}, moved ${JSON.stringify(r.moved)}`);
    ok("...measured: called, and not one observable downstream of the answer",
        r.status === "attributed" && r.used.includes("cos") && r.moved.length === 0,
        "THE CENSUS CONDEMNS THIS BUILD'S EVERY NUMBER. This is the shape of all six in the record");
    ok("and that is reported as unattributed rather than as PORTABLE",
        Object.prototype.hasOwnProperty.call(r, "unmoved") && !("portable" in r),
        "sabotage E: a field called `portable` would claim exactly what perturbation cannot establish");
}
{
    let n = 0;
    const flaky = () => ({ stable: Math.cos(0.5), drifts: n++ });
    const r = await attribute(flaky);
    say(`a build whose second run disagrees: status ${r.status}, drifted ${JSON.stringify(r.drifted)}`);
    ok("!! a non-deterministic build is REFUSED attribution rather than attributed badly",
        r.status === "nondeterministic" && r.drifted.includes("drifts") && !("moved" in r),
        "sabotage C: attributing it anyway makes every moved/unmoved answer noise that looks like a result");
    ok("...and the guard names the observable that drifted", r.drifted.length === 1);
}

// ---- 3. THE TRIPWIRE PUTS Math BACK ---------------------------------------------------------------------------
console.log("\n3. a tripwire that does not disarm corrupts every measurement after it");

{
    const before = UNSPEC.map((n) => Math[n]);
    await attribute(known);
    const after = UNSPEC.map((n) => Math[n]);
    ok("!! every patched function is the original again once the run returns",
        before.every((f, i) => f === after[i]),
        "sabotage F: a build that throws must still disarm, which is why the restore is before the await");
}
{
    const before = UNSPEC.map((n) => Math[n]);
    let threw = false;
    try { await runInstrumented(() => { throw new Error("boom"); }); } catch { threw = true; }
    ok("...including when the build THROWS, and the throw still reaches the caller",
        threw && before.every((f, i) => f === Math[UNSPEC[i]]),
        "the restore runs before the await precisely so a synchronous throw cannot leave Math patched");
}

// ---- 4. THE EPSILON BOUNDS WHAT "DID NOT MOVE" CAN MEAN -------------------------------------------------------
console.log("\n4. a smaller nudge finds less, and that is measured rather than assumed");

{
    const shallow = () => ({ direct: Math.cos(0.7), rounded: Math.round(Math.cos(0.7) * 1e3) });
    const big = await attribute(shallow, { eps: 1e-9 });
    const tiny = await attribute(shallow, { eps: 1e-18 });
    say(`eps 1e-9 moved ${JSON.stringify(big.moved)}; eps 1e-18 moved ${JSON.stringify(tiny.moved)}`);
    ok("!! the ROUNDED observable is downstream of cos and does not move at either epsilon",
        !big.moved.includes("rounded"),
        "*** THE CLEAREST CASE FOR WHY UNMOVED IS NOT PORTABLE: *** it IS downstream, provably by construction, " +
        "and no perturbation this instrument makes will show it");
    ok("the direct one moves at 1e-9", big.moved.includes("direct"));
    ok("and a nudge below the double's own resolution moves nothing at all",
        tiny.moved.length === 0,
        "so 'did not move' is a statement about THIS epsilon, which is why the epsilon is exported and recorded");
}

// ---- 5. THE ROLL-UP REPORTS MEMBERS AND TWO BOUNDS OF OPPOSITE KINDS -------------------------------------------
console.log("\n5. the two bounds are never combined into one verdict");

{
    const rows = [
        { ...(await attribute(known)), label: "known" },
        { ...(await attribute(() => { Math.cos(1); return { a: 1, b: 2 }; })), label: "ignores" },
        { ...(await attribute(() => ({ c: 3 }))), label: "nocalls" },
    ];
    const b = bounds(rows);
    say(JSON.stringify(b));
    ok("!! a build that calls nothing is 'clean' and is not counted as attributed",
        b.clean === 1 && b.builds === 2);
    ok("the upper bound condemns every observable of every calling build",
        b.condemnedByCallCount === b.observables && b.observables === 6);
    ok("!! the lower bound is strictly smaller here, and the gap is named rather than called portable",
        b.provenDownstream === 2 && b.unattributed === 4 && !("portable" in b));
    ok("the builds where nothing moved are listed BY LABEL, not counted",
        b.buildsWhereNothingMoved.includes("ignores") && b.buildsWhereNothingMoved.length === 1,
        "v4399's rule: freeze by name, not by count");
}

// ---- 6. THE RECORD --------------------------------------------------------------------------------------------
console.log("\n6. the frozen record of what forty real builds said on this box");

ok("the record's share is its own arithmetic",
    Math.abs(100 * REC.provenDownstream / REC.observables - REC.sharePct) < 0.1,
    `${REC.provenDownstream}/${REC.observables} = ${(100 * REC.provenDownstream / REC.observables).toFixed(1)}%`);
ok("the record's epsilon is the one the code uses", REC.eps === EPS);
// *** v4487 -- `builds` AND `buildsWhereNothingMoved` WERE GUARDED BY NOTHING, WHICH THE CORRUPTION SWEEP
// FOUND BY BUMPING EACH BY SEVEN AND WATCHING THIS GATE PASS. *** They are the shape of a 40-build sweep and
// re-deriving them here would mean running it, which is why they are frozen in the first place. SO WHAT IS
// ADDED IS A CONSISTENCY CHECK AND NOT A RE-DERIVATION, AND THE DIFFERENCE IS STATED RATHER THAN BLURRED:
// this cannot notice the sweep drifting, only the record contradicting itself. A number that no longer
// describes the tree and a number that never described anything are different failures, and only the second
// one is caught here.
ok("!! the build counts are at least CONSISTENT, which is less than re-derived and more than nothing",
    REC.buildsWhereNothingMoved <= REC.builds && REC.builds > 0 &&
    REC.examples.length <= REC.builds &&
    new Set(REC.examples.map((e) => e.build)).size === REC.examples.length,
    `${REC.buildsWhereNothingMoved} of ${REC.builds} builds moved nothing, ${REC.examples.length} examples, ` +
    "all distinct. NOT a re-derivation: the sweep is what those numbers came from and this gate does not run it");
ok("every recorded example moved fewer observables than the build reports",
    REC.examples.every((e) => e.moved < e.observables && e.moved >= 0));
ok("the record is frozen", Object.isFrozen(REC) && Object.isFrozen(REC.examples) && REC.examples.every(Object.isFrozen));

console.log(`\nobservableTaint-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
