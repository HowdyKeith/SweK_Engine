// tools/roundhouse/corroborationCensus-selfcheck.mjs
//
// Run: node tools/roundhouse/corroborationCensus-selfcheck.mjs        (it builds the whole lab, in every mode)
//      node tools/roundhouse/corroborationCensus-selfcheck.mjs --budget 120000   (a labelled PARTIAL run)
//
// *** v4036 -- THE "~60s" THAT USED TO BE ON THIS LINE WAS OFF BY MORE THAN AN ORDER OF MAGNITUDE, AND THE RUN
// WAS SILENT WHILE IT RAN. *** Three timed-out attempts this session -- 400 s, 800 s, then 1500 s on an
// otherwise idle machine -- every one returning zero bytes, because `await corroborationCensus({})` did all the
// work before the first console.log. A slow run and a hung one were indistinguishable, and the estimate on this
// line was the only thing anyone had to go on. It dates from a lab of 54 devices; there are now 129, several
// with single builds costing minutes. THE COST OF A CENSUS IS THE COST OF WHAT IT ENUMERATES, and this one had
// never been asked what that was. It now reports each build as it lands and accepts a budget.
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2904 -- WHAT THE LAB CANNOT VOUCH FOR.
//
// The census is not a pass/fail gate on the physics. It is an inventory of standing, and the honest result is
// that most of the lab's unkeyed numbers have none. The assertions below therefore mostly pin FINDINGS in place
// so they cannot quietly improve by being forgotten: if a later round narrows the portability taint or fills in
// refinement knobs, these numbers move and the check says so.

// v4130 -- the UNION of what both sides of the tier-2 merge imported. The branch added
// measurePortabilitySampled (its new section 3b) and this side already used costVsCalls at the ms-per-Mcall
// check below; taking either import list alone left the other's call site referencing an undefined name, which
// is a ReferenceError at RUN time that no syntax check would have caught.
import { corroborationCensus, censusLines, CENSUS_REGISTRATION, REFINEMENT_KNOBS,
         measurePortabilitySampled, costVsCalls } from "./corroborationCensus.mjs";
import { writeCostRecord, readCostRecord, dearest, COST_BASELINE } from "./costRecord.mjs";
import { buildLens } from "./lensBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (name, detail) => console.log("  ----  " + name + (detail ? "   " + detail : ""));

// *** AND THE LAB-WIDE TOTALS ARE NOT ASSERTED FROM A PARTIAL SWEEP. *** Each is a sum over the rows that were
// built, so a budgeted run makes every one smaller while some comparisons still hold on the smaller lab --
// `unkeyedTotal > keyedTotal` would pass on half the devices and mean nothing. A partial run REPORTS them and
// says it cannot vouch for them; it does not quietly pass.
//
// *** v4039a -- THIS LIVES AT MODULE SCOPE BECAUSE IT WAS DECLARED INSIDE ONE SECTION'S BLOCK AND USED IN THE
// NEXT, AND `const` IS BLOCK-SCOPED. *** The unbudgeted run swept all 484 device/modes, passed every
// assertion, and then died with `ReferenceError: pinned is not defined` on the last one. The budgeted runs
// crashed there too and I READ THE TRAILING STACK TRACE AS THE END OF THE OUTPUT and reported the guards as
// firing correctly. They did -- and the gate still exited non-zero one line later, which is exactly the kind
// of thing a gate exists to make impossible to miss.
//
// *** AND IT WAS FOUND TWICE, INDEPENDENTLY, FROM OPPOSITE ENDS OF THE SWEEP -- BOTH ACCOUNTS KEPT. ***
// The tier-2 merge brought in a second write-up of this same defect, v4080's, which reached it from the
// SHORT end (`--budget 5000`, 82 of 484 device/modes) where v4039a above reached it from the long one.
// Neither is deleted: that a block-scoping bug is reachable from a two-minute partial AND from a full
// unbudgeted sweep is evidence about how exposed the defect was, and one account alone hides it.
// *** v4080 -- THIS LIVES AT MODULE SCOPE BECAUSE IT WAS DECLARED INSIDE SECTION 2's BLOCK AND USED IN SECTION
// 3, AND `const` IS BLOCK-SCOPED. *** MEASURED WHILE TRYING TO FREEZE A COST RECORD THIS ROUND: `node
// tools/roundhouse/corroborationCensus-selfcheck.mjs --budget 5000` reported 82 of 484 device/modes, printed
// section 2's PARTIAL notices correctly, and then died one line into section 3 --
// `ReferenceError: pinned is not defined` -- because `pinned` only existed inside section 2's `{ }` and
// section 3 is a second block. The unbudgeted (freeze) attempt this round hit an unrelated wall first (it
// never finished within the time this round had -- see costRecord.mjs and device-cost-baseline.json's
// absence), so this was found from the SHORT end rather than the long one, but it is the identical defect:
// declared where it is used once, used again one section later, and `const` does not survive the block
// boundary in between.
let censusComplete = true, sweptSoFar = "";
const pinned = (name, cond, detail) => censusComplete
    ? ok(name, cond, detail)
    : report(name, "NOT ASSERTED -- the sweep was PARTIAL (" + sweptSoFar + "). " + detail);

// --budget <ms> bounds the sweep and produces a PARTIAL result that says so. Absent, the run is unbounded,
// which is what CI wants: the assertions below are lab-wide totals and a shortened run understates every one.
const argv = process.argv.slice(2);
const budgetArg = argv.includes("--budget") ? parseInt(argv[argv.indexOf("--budget") + 1] || "", 10) : NaN;
const budgetMs = Number.isFinite(budgetArg) && budgetArg > 0 ? budgetArg : Infinity;

// *** PROGRESSIVE OUTPUT, ONE LINE PER DEVICE RATHER THAN PER MODE. *** Per mode is 400+ lines and buries the
// gate; per device is enough to see the sweep is alive and to see WHICH device it is sitting on -- which is the
// question three timeouts could not answer. A build over a second is marked, because that is the whole story of
// why this stopped being runnable.
console.log("sweeping the lab" + (budgetMs === Infinity ? "" : " with a " + budgetMs + " ms budget") + " ...");
let lastDevice = null, deviceMs = 0, deviceModes = 0;
// v4040 -- (rawCalls, ms) per device/mode, collected from the sweep THIS GATE ALREADY RUNS. It costs nothing
// extra and it is the evidence for section 3c.
const costPairs = [];
const flush = () => {
    if (lastDevice === null) return;
    console.log("    " + lastDevice.padEnd(22) + String(deviceModes).padStart(2) + " modes  " +
        (deviceMs / 1000).toFixed(2).padStart(7) + " s" + (deviceMs > 1000 ? "   <-- over a second" : ""));
};
const c = await corroborationCensus({
    budgetMs,
    onProgress: ({ device, mode, ms, rawCalls, done, total }) => {
        if (device !== lastDevice) { flush(); lastDevice = device; deviceMs = 0; deviceModes = 0; }
        deviceMs += ms; deviceModes++;
        costPairs.push({ device, mode, ms, rawCalls });
        if (done === total) flush();
    },
});
flush();
const s = c.summary;
censusComplete = c.complete;
sweptSoFar = s.deviceModes + " of " + s.plannedDeviceModes;
console.log("  swept " + s.deviceModes + " of " + s.plannedDeviceModes + " device/modes" +
    (c.complete ? "" : "  -- PARTIAL, " + s.skippedDeviceModes + " skipped at the budget, " +
                       s.declinedDeviceModes + " declined as too costly for what was left"));
for (const d of c.declined) console.log("    declined: " + d);
console.log();
censusLines(c).forEach((l) => console.log("  " + l));
console.log();

// ---- 1. THE CONTROL, WHICH IS THE ONLY REASON THE REST OF THE CENSUS MEANS ANYTHING ------------------------------
{
    const by = (m) => c.rows.find((r) => r.device === "lens" && r.mode === m);
    const shadow = by("shadow"), aim = by("aim"), deflect = by("deflect");

    // *** v4036 -- THIS SECTION READS ROWS BY NAME, AND A BUDGETED SWEEP MAY NOT HAVE BUILT THEM. *** The first
    // budgeted run of this gate CRASHED here -- `Cannot read properties of undefined (reading 'rawCalls')` --
    // because lens was never reached. That is the honest consequence of adding a budget and it is guarded
    // rather than papered over: a control that was not run is REPORTED as not run, never passed and never
    // thrown. And the guard is `report`, not a lenient `ok`: this is the control the whole census rests on, so
    // "we did not check" must not print as a pass.
    if (!shadow || !aim || !deflect) {
        report("the tripwire control could not be evaluated",
            "lens rows absent -- the sweep was PARTIAL (" + s.deviceModes + " of " + s.plannedDeviceModes +
            "). *** EVERY PORTABLE VERDICT IN THIS CENSUS RESTS ON THIS CONTROL, so a partial run has not " +
            "established them. Run without --budget to assert it. ***");
    } else {
    ok("!! the tripwire demonstrably reaches device builds (pre-registered control)",
        shadow.rawCalls > 0 && aim.rawCalls > 0,
        "lens.shadow " + shadow.rawCalls + " calls, lens.aim " + aim.rawCalls + " -- had these come back clean, " +
        "every PORTABLE verdict in this census would have been an instrument failure rather than a result");

    // THE PRE-REGISTRATION WAS WRONG, AND IT IS RECORDED WRONG RATHER THAN QUIETLY EDITED.
    // CENSUS_REGISTRATION claimed all three of shadow/aim/deflect must report unspecified libm calls, on the
    // authority of lensBind.mjs's own comment ("The shadow, aim and deflection modes still use raw trig") and of
    // open item 5, which inherited that sentence. Measurement says deflect makes ZERO. The instrument is fine --
    // its two siblings fired -- so the comment is wrong, and the handoff repeated it for two rounds.
    //
    // Checked against the house rule about experiments that did not run: lens.deflect returns a FINITE 0.5904 rad
    // at b = 10M against a weak-field 0.4, i.e. the strong-field correction is present and the integration
    // happened. The single Math.cos/Math.sin pair in geodesic.js sits in a visualisation branch that builds
    // trajectory points, and the deflection path never reaches it.
    ok("!! the pre-registered claim FAILED for lens.deflect, and the failure is documentation, not instrument",
        deflect.rawCalls === 0 && CENSUS_REGISTRATION.claim.min === 1,
        "predicted >=1 unspecified call, measured 0 -- lensBind.mjs's comment and open item 5 both overstate the " +
        "conversion work outstanding by one mode");
    const d = buildLens({ mode: "deflect" });
    ok("...and the mode was genuinely exercised, so the zero is not an experiment that failed to run",
        Number.isFinite(d.deflectionMeasured) && d.deflectionMeasured > d.deflectionWeak * 1.4,
        "measured " + d.deflectionMeasured.toFixed(4) + " rad vs weak-field " + d.deflectionWeak.toFixed(4) +
        " -- a 48% strong-field excess; a stub returning Infinity would also have made zero libm calls");
    }
}

// ---- 2. THE HEADLINE: HOW MUCH OF THE LAB NOTHING VOUCHES FOR ----------------------------------------------------
{
    // *** v4036 -- THE DENOMINATOR, NOT A FLOOR. *** This asked `deviceModes >= 80`, which is satisfied by any
    // run that reached 80 -- including a budgeted one that stopped at 85 of 400 while every headline total
    // below silently shrank to match. That is the identical shape strictConfig's mirrorAudit carried until
    // v4032, where `scanned > 40` was comfortably satisfied by 81 of 116 and "zero offenders" meant "zero
    // among the ones I could find". Adding a budget without fixing this would have reintroduced it here.
    ok("!! the census swept EVERY device/mode it planned to, not merely a lot of them",
        c.complete && s.deviceModes === s.plannedDeviceModes && c.failed === 0,
        s.deviceModes + " of " + s.plannedDeviceModes + " device/modes built, " + c.failed + " refused" +
        (c.complete ? "" : ", PARTIAL -- " + s.skippedDeviceModes + " skipped at the budget"));
    pinned("!! most of the lab's numbers have no answer key",
        s.unkeyedTotal > s.keyedTotal,
        s.unkeyedTotal + " unkeyed vs " + s.keyedTotal + " keyed -- the tautology census (v2898) audited the " +
        s.keyedTotal + "; nothing had ever audited the " + s.unkeyedTotal);
    pinned("!! more than half the lab's modes touch unspecified libm",
        s.nonPortableModes > s.portableModes,
        s.nonPortableModes + " of " + s.deviceModes + " modes non-portable");
    pinned("!! the number this round exists to surface",
        s.unkeyedAtRisk >= 150,
        s.unkeyedAtRisk + " of " + s.unkeyedTotal + " unkeyed observables are reported by a non-portable build: " +
        "no answer key checks them, and the fleet's bit-identity guarantee does not cover them. The fingerprint's " +
        "50 subsystems agree across three machines; these are not among the 50");
    pinned("!! criterion 3 is untestable for almost the whole lab",
        s.unrefinableUnkeyed / s.unkeyedTotal > 0.9,
        s.unrefinableUnkeyed + " of " + s.unkeyedTotal + " unkeyed observables live in modes with no declared " +
        "refinement knob (" + Object.keys(REFINEMENT_KNOBS).length + " devices have one). Convergence is not " +
        "failing here -- it has never been asked");
    ok("!! criterion 1 stands at one quantity for the entire lab",
        s.preRegistered === 1,
        "pre-registration cannot be retrofitted, so this number can only be improved going forward");
}

// ---- 3. THE VERDICT IS CONSERVATIVE, AND SAYS SO ------------------------------------------------------------------
{
    // kerr reports 33 unkeyed observables across three non-portable modes -- on 20 to 28 libm calls each. A build
    // making twenty calls is very unlikely to have tainted all eleven of its outputs, so this is the clearest
    // evidence that build-level granularity overstates the damage. Narrowing it needs per-observable
    // instrumentation, which is the follow-on round this census is meant to justify.
    const kerr = c.rows.filter((r) => r.device === "kerr");
    // *** v4036 -- `kerr.length > 0` IS NOT PADDING. *** [].every(...) is TRUE, so on any run that never
    // reached kerr this line passed by having nothing to check -- the vacuous pass this session already found
    // in mpmstep's sideways negative, where a grid too small to hold the block satisfied "driftX is exactly
    // zero" by never moving it. Unreachable before a budget existed; reachable the moment one did.
    // `pinned`, for the same reason as the totals above: on a partial sweep kerr may simply not have been
    // reached, which is missing data and not a defect. MEASURED this round at --budget 5000: kerr was one of
    // the 402 device/modes skipped, and the un-fixed `ok` here reported "kerr modes: " (an empty list) as a
    // FAILURE rather than an admission -- exactly the vacuous-pass shape this file's own v4036 comment already
    // named for `kerr.length > 0`, just on the other side of the guard. The kerr.length > 0 check inside the
    // condition still stands for the COMPLETE run, where an empty list would mean the rows vanished rather
    // than that the budget ran out.
    pinned("build-level granularity demonstrably overstates the taint",
        kerr.length > 0 && kerr.every((r) => !r.portable && r.rawCalls < 100 && r.unkeyed.length >= 10),
        "kerr modes: " + kerr.map((r) => r.mode + "(" + r.rawCalls + " calls, " + r.unkeyed.length + " unkeyed)").join(", ") +
        " -- twenty-odd calls cannot plausibly have reached all eleven outputs; the census reports them at risk anyway " +
        "because it cannot yet prove otherwise, and overstating is the safe direction");

    const worst = c.rows.slice().sort((a, b) => b.rawCalls - a.rawCalls)[0];
    pinned("!! and the reason nobody had run this sweep before is measurable",
        !!worst && worst.rawCalls > 1e8,
        (worst ? worst.device + "." + worst.mode + " makes " + worst.rawCalls.toLocaleString() : "no rows") +
        " unspecified libm calls. The existing tripwire captures a stack trace per call, so pointing it at the " +
        "lab does not finish; the sampling variant in this module counts exactly and samples sites. *** v4036 " +
        "STRUCK THE CLAIM THAT THIS 'gets the sweep down to ~60s'. *** It does not, and had not for a long " +
        "time: ONE build of each device's FIRST MODE ALONE now measures 307.1 s across 129 devices, and this " +
        "census builds every mode. The sampling variant is still the reason the sweep is possible at all -- " +
        "the stack-capturing one never finished its second device -- but the number beside it was inherited " +
        "from a smaller lab and never remeasured.");
}

// ---- 3b. v4039 -- THE COUNTER IS FASTER AND COUNTS THE SAME ---------------------------------------------------------
console.log("\n3b. *** THE COUNT IS THE PRODUCT, SO A FASTER WRAPPER THAT COUNTS DIFFERENTLY IS WORTHLESS ***");
{
    // Every portable/non-portable verdict above turns on rawCalls. v4039 replaced three Map operations and a
    // rest/spread allocation per call with a closure counter and fixed-arity wrappers, so exactness is checked
    // against SYNTHETIC FUNCTIONS THAT MAKE A KNOWN NUMBER OF CALLS -- a stronger check than agreeing with the
    // previous implementation would have been, because an implementation is not an answer key.
    const unary = await measurePortabilitySampled(() => { let s = 0; for (let i = 0; i < 1000; i++) s += Math.sin(i); return s; });
    const binary = await measurePortabilitySampled(() => { let s = 0; for (let i = 0; i < 500; i++) s += Math.atan2(i, 2) + Math.pow(i, 2); return s; });
    const variadic = await measurePortabilitySampled(() => { let s = 0; for (let i = 0; i < 300; i++) s += Math.hypot(i, 2, 3); return s; });
    ok("!! *** THE COUNT IS EXACT IN ALL THREE ARITY CLASSES ***",
        unary.rawCalls === 1000 && binary.rawCalls === 1000 && variadic.rawCalls === 300,
        "1000 unary, 500 atan2 + 500 pow, 300 hypot(3 args) -> " + unary.rawCalls + ", " + binary.rawCalls +
        ", " + variadic.rawCalls + ". Nineteen of the twenty-two are unary, two take two arguments, and only " +
        "hypot is truly variadic -- the fixed-arity wrappers are what remove the per-call allocation, so each " +
        "class needs its own check.");

    const a2 = await measurePortabilitySampled(() => Math.atan2(1, 2));
    const hy = await measurePortabilitySampled(() => Math.hypot(3, 4));
    const pw = await measurePortabilitySampled(() => Math.pow(2, 10));
    ok("!! and arguments survive the fixed-arity wrappers untouched",
        a2.value === Math.atan2(1, 2) && hy.value === 5 && pw.value === 1024,
        "atan2(1,2), hypot(3,4)=5, pow(2,10)=1024 -- a wrapper that dropped its second argument would still " +
        "count correctly and return nonsense, which is the failure this line exists for.");

    const brk = await measurePortabilitySampled(() => { for (let i = 0; i < 7; i++) Math.cos(i); for (let i = 0; i < 3; i++) Math.log(i + 1); return 0; });
    // *** THE PATTERN IS THE INSTRUMENT'S MODULE, NOT ANY FILE WHOSE NAME LOOKS LIKE IT. *** The first draft
    // asked for no site matching /corroborationCensus/ and FAILED HERE while passing from a scratch file --
    // because the correct caller frame is corroborationCensus-SELFCHECK.mjs, which matches. A check that
    // fails on the right answer because it cannot tell two filenames apart is worse than no check.
    ok("!! the per-function breakdown and the site frames still point at the CALLER",
        brk.byFn[0] === "7x cos" && brk.byFn[1] === "3x log" && brk.sites.length > 0 &&
        !brk.sites.some((x) => /corroborationCensus\.mjs/.test(x)) &&
        brk.sites.every((x) => /-selfcheck\.mjs:\d+/.test(x)),
        brk.byFn.join(", ") + " | sites: " + brk.sites.join("; ") + ". *** THE STACK FRAME INDEX HAD TO MOVE " +
        "FROM [2] TO [3]: the site capture is now a separate function so it stays off the hot path, and that " +
        "adds a frame. Left alone, every site would have blamed the instrument itself. ***");

    report("*** AND WHAT THIS SPEED-UP IS WORTH, WHICH IS LESS THAN IT FIRST LOOKED ***",
        "A census log showed `kuramoto 3 modes 1044.15 s` against a 7.3 s uninstrumented build, and the " +
        "obvious inference was a seventyfold instrument. MEASURED ON kuramoto ITSELF: curve 7343 -> 13971 ms " +
        "(1.9x), onset 11319 -> 13776 ms (1.2x), pendulum 5 -> 0 ms. TWENTY-EIGHT SECONDS INSTRUMENTED, " +
        "AGAINST 1044 IN THE LOG -- the rest was CPU contention from other jobs running beside it, and the " +
        "reading was being attributed to the code. The wrapper is ~2x and v4039 makes it ~1.3x. The real " +
        "number in that measurement is 354,000,000 libm calls in one build, three thousand times the 1e8 " +
        "this file already calls the reason nobody had run the sweep before.");
}

// ---- 3c. v4040 -- rawCalls IS NOT A COST MODEL, AND THE SWEEP ABOVE PROVES IT FOR FREE --------------------------------
console.log("\n3c. *** rawCalls MEASURES A KIND OF WORK, NOT AN AMOUNT OF TIME ***");
{
    // The idea was attractive and wrong: this census already measures rawCalls for every build, its headline
    // verdict turns on it, and a cost model derived from a number already in hand would have replaced the
    // hand-calibrated ms-per-step constant twof carries (v4038). MEASURED FIRST, and the measurement killed it.
    //
    //     twof.inlet          115714 ms   108,192,309 calls   1069.52 ms per Mcall
    //     kuramoto.curve        7807 ms   353,976,576 calls     22.06 ms per Mcall
    //     stability.response   20186 ms     3,430,000 calls   5885.13 ms per Mcall
    //     em.vacuum                1 ms             0 calls   no calls at all
    //
    // *** kuramoto MAKES 3.3x MORE LIBM CALLS THAN twof AND TAKES 15x LESS TIME. *** rawCalls does not weakly
    // predict cost, it ANTI-predicts it across the two extremes, and no linear fit survives a 267x spread in
    // ms-per-Mcall.
    //
    // The reason is the useful part. 22 ns per call is about what an instrumented Math.sin costs, so kuramoto
    // sits ON THE FLOOR: it does almost nothing but transcendentals. Every device above that floor is paying
    // for work the counter cannot see -- lattice sweeps, neighbour searches, arithmetic. So ms-per-Mcall is
    // really a measure of HOW MUCH NON-TRANSCENDENTAL WORK A DEVICE DOES, which is precisely the quantity
    // rawCalls is blind to. A counter of one kind of work cannot price the others.
    const withCalls = costPairs.filter((p) => p.rawCalls > 1e5 && p.ms > 50);
    const rate = (p) => p.ms * 1e6 / p.rawCalls;
    const sorted = withCalls.slice().sort((a, b) => rate(a) - rate(b));
    const lo = sorted[0], hi = sorted[sorted.length - 1];
    pinned("!! *** ms PER MILLION CALLS SPANS ORDERS OF MAGNITUDE, SO NO LINEAR COST MODEL FITS ***",
        withCalls.length >= 5 && hi && lo && rate(hi) / rate(lo) > 20,
        !hi || !lo ? "not enough rows with both a real call count and a real duration"
            : "cheapest " + lo.device + "." + lo.mode + " at " + rate(lo).toFixed(1) + " ms/Mcall against " +
              "dearest " + hi.device + "." + hi.mode + " at " + rate(hi).toFixed(1) + " -- a " +
              (rate(hi) / rate(lo)).toFixed(0) + "x spread across " + withCalls.length + " device/modes that " +
              "make real calls and take real time. *** THE COST MODEL FROM rawCalls WAS PROPOSED, MEASURED, " +
              "AND REFUSED. It is pinned here so it is not re-derived from the fact that the number is " +
              "conveniently already in hand. ***");

    report("AND WHAT WOULD WORK INSTEAD, STATED RATHER THAN BUILT",
        "a MEASURED RECORD, not a fitted proxy: this sweep already produces (device, mode, ms) for all " +
        costPairs.length + " builds, which is a better prior than any model of it. What that needs is somewhere " +
        "to live, and it must not be here -- a gate that wrote a cost cache would be a report and a gate at " +
        "once, which capabilityCard-selfcheck records a round being refused for. The census returns the " +
        "timings; persisting them is a caller's job and a round of its own.");
}

// ---- 3d. v4041 -- THE MEASURED RECORD -------------------------------------------------------------------------------
console.log("\n3d. *** WHAT EACH BUILD COST, KEPT, BECAUSE THE PROXY DID NOT WORK ***");
{
    // *** THE FREEZE IS OPT-IN AND THE GATE READS BY DEFAULT, WHICH IS corroborationReach's CONVENTION
    // (SWEK_FREEZE_CORROBORATION_REACH=1) AND NOT AN INVENTION HERE. *** A gate that wrote on every run would
    // be a gate and a report at once, which capabilityCard-selfcheck records a round being refused for.
    //
    // *** AND ONLY A COMPLETE SWEEP MAY FREEZE. *** A budgeted run measures a prefix of the lab; writing that
    // would record the cheap devices and silently drop every expensive one -- which is exactly the population
    // a cost record exists to describe. The refusal is louder than the write.
    if (process.env.SWEK_FREEZE_DEVICE_COST === "1") {
        if (!c.complete) {
            report("REFUSED TO FREEZE", "the sweep was PARTIAL (" + sweptSoFar + "). A record written from a " +
                "budgeted run would hold the cheap devices and omit every expensive one, which is the " +
                "population it exists to describe. Re-run without --budget.");
        } else {
            const w = writeCostRecord(costPairs, { note: "measured by corroborationCensus-selfcheck" });
            report("FROZE " + w.entries + " device/mode costs into device-cost-baseline.json",
                "dearest: " + dearest(w).slice(0, 5).join(", "));
        }
    }

    const rec = readCostRecord();
    const have = Object.keys(rec.costs || {}).length;
    if (!have) {
        report("no cost record on this machine, which is a normal state and not a failure",
            "every consumer treats a missing entry as UNKNOWN and schedules exactly as it did before this " +
            "existed -- null never means free, or the most expensive unmeasured device would be attempted " +
            "first. Freeze one with SWEK_FREEZE_DEVICE_COST=1 on a complete run.");
    } else {
        ok("!! the record prices device/modes that declare no hint of their own",
            have > 100,
            have + " entries, frozen " + rec.frozenOn + ". *** THIS IS THE COVERAGE A DECLARED HINT CANNOT " +
            "REACH: exactly one device in the lab declares costHint, and the record prices all the rest " +
            "without anyone calibrating a constant. *** dearest: " + dearest(rec, 4).join(", "));
        ok("...and it is milliseconds on the machine that froze it, so nothing asserts a value",
            typeof rec.frozenOn === "string" && !("expected" in rec),
            "the same twof build measured 115.7 s idle and 205.0 s under load in one session, a 1.8x spread " +
            "from contention. A record frozen on a busy machine OVER-states, which declines work that would " +
            "have fitted -- the wrong direction -- so this carries provenance and no assertion. " +
            "corroboration-reach-baseline.json ratchets because a number falling there is a regression; a " +
            "device getting slower is news about the device.");
    }
}

// ---- 4. WHAT THIS CENSUS DOES NOT ESTABLISH ------------------------------------------------------------------------
{
    ok("no unkeyed observable is reported as corroborated by this sweep",
        !("corroborated" in s),
        "the census measures STANDING, not truth: a portable number with a refinement knob is still uncorroborated " +
        "until someone actually varies the knob and pre-registers what they expect");
    console.log("  NOTE   criterion 2 is absent above on purpose. v2902 established the lab has no stochastic");
    console.log("         input, so seed sweeps are vacuous and were replaced by nuisance-parameter invariance --");
    console.log("         which needs a per-device knob the physics says cannot matter, and nobody has declared one.");
}

// ---- 5. v4080 -- rawCalls IS NOT A COST MODEL, MEASURED ON THE ROWS THIS SWEEP ACTUALLY BUILT ---------------------
{
    const cv = costVsCalls(c.rows);
    if (!cv.rows.length) {
        report("costVsCalls has nothing to compare", "no row in this sweep made a libm call, so ms-per-Mcall " +
            "cannot be computed. That is a fact about which rows were reached, not about the finding.");
    } else {
        // *** THIS IS THE SAME MISTAKE A COST HINT DERIVED FROM rawCalls WOULD HAVE MADE, MEASURED RATHER THAN
        // ARGUED. *** A call counter prices transcendental-function work and nothing else; a build whose inner
        // loop is mostly SPH neighbour search, an LBM lattice update, or a linear solve can cost far more wall
        // time than one that is almost nothing BUT trig, however many million calls the second one makes.
        pinned("!! *** ms-per-Mcall SPANS ORDERS OF MAGNITUDE ACROSS THE ROWS THIS SWEEP BUILT ***",
            cv.spanX > 10,
            cv.cheapest.device + "." + cv.cheapest.mode + " " + cv.cheapest.msPerMcall.toFixed(1) +
            " ms/Mcall (" + cv.cheapest.rawCalls.toLocaleString() + " calls, " + cv.cheapest.ms + " ms) vs " +
            cv.priciest.device + "." + cv.priciest.mode + " " + cv.priciest.msPerMcall.toFixed(1) +
            " ms/Mcall (" + cv.priciest.rawCalls.toLocaleString() + " calls, " + cv.priciest.ms + " ms) -- " +
            cv.spanX.toFixed(1) + "x apart. A device that counts calls to schedule by this number alone would " +
            "treat these as interchangeable and be off by " + cv.spanX.toFixed(0) + "x.");
        report("directly measured, outside this sweep, on the applying machine (see costRecord.mjs's header)",
            "kuramoto.curve, twof.inlet and stability.response -- three devices with wildly different inner " +
            "loops -- were built once each and timed: the call count and the wall time do not merely fail to " +
            "agree, the RANKING inverts between them at the extremes, which is what makes rawCalls an " +
            "ANTI-predictor rather than merely an imprecise one. Full numbers are in that file's header comment " +
            "so they are not duplicated and cannot drift out of sync with it.");
    }

    // *** THE FREEZE IS OPT-IN AND THE GATE READS BY DEFAULT, WHICH IS corroborationReach's CONVENTION
    // (SWEK_FREEZE_CORROBORATION_REACH=1) AND NOT AN INVENTION HERE. *** A gate that wrote on every run would
    // be a gate and a report at once, which capabilityCard-selfcheck records a round being refused for.
    //
    // *** AND ONLY A COMPLETE SWEEP MAY FREEZE. *** A budgeted run measures a prefix of the lab; writing that
    // would record the cheap devices and silently drop every expensive one -- which is exactly the population
    // a cost record exists to describe. The refusal is louder than the write.
    if (process.env.SWEK_FREEZE_DEVICE_COST === "1") {
        if (!c.complete) {
            report("REFUSED TO FREEZE", "the sweep was PARTIAL (" + s.deviceModes + " of " + s.plannedDeviceModes +
                "). A record written from a budgeted run would hold the cheap devices and omit every expensive " +
                "one, which is the population it exists to describe. Re-run without --budget.");
        } else {
            const w = writeCostRecord(c.rows.map((r) => ({ device: r.device, mode: r.mode, ms: r.ms })),
                { note: "measured by corroborationCensus-selfcheck, " + s.deviceModes + " device/modes, complete sweep" });
            report("FROZE " + w.entries + " device/mode costs into device-cost-baseline.json",
                "dearest: " + dearest(readCostRecord()).slice(0, 5).join(", "));
        }
    }

    const rec = readCostRecord();
    const have = Object.keys(rec.costs || {}).length;
    if (!have) {
        report("no cost record on this machine, which is a normal state and not a failure",
            "every consumer treats a missing entry as UNKNOWN and schedules exactly as it did before this " +
            "existed -- null never means free, or the most expensive unmeasured device would be attempted " +
            "first. Freeze one with SWEK_FREEZE_DEVICE_COST=1 on a complete, unbudgeted run.");
    } else {
        report("cost record present", "frozen " + rec.frozenOn + ", " + have + " device/modes. dearest: " +
            dearest(rec).slice(0, 5).join(", "));
    }
}

console.log();
if (fails) { console.log("corroborationCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("corroborationCensus-selfcheck: all checks pass");
