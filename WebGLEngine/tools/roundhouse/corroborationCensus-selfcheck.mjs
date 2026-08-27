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

import { corroborationCensus, censusLines, CENSUS_REGISTRATION, REFINEMENT_KNOBS } from "./corroborationCensus.mjs";
import { buildLens } from "./lensBind.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const report = (name, detail) => console.log("  ----  " + name + (detail ? "   " + detail : ""));

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
const flush = () => {
    if (lastDevice === null) return;
    console.log("    " + lastDevice.padEnd(22) + String(deviceModes).padStart(2) + " modes  " +
        (deviceMs / 1000).toFixed(2).padStart(7) + " s" + (deviceMs > 1000 ? "   <-- over a second" : ""));
};
const c = await corroborationCensus({
    budgetMs,
    onProgress: ({ device, mode, ms, done, total }) => {
        if (device !== lastDevice) { flush(); lastDevice = device; deviceMs = 0; deviceModes = 0; }
        deviceMs += ms; deviceModes++;
        if (done === total) flush();
    },
});
flush();
const s = c.summary;
console.log("  swept " + s.deviceModes + " of " + s.plannedDeviceModes + " device/modes" +
    (c.complete ? "" : "  -- PARTIAL, " + s.skippedDeviceModes + " skipped at the budget"));
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
    // *** AND THE TOTALS BELOW ARE NOT ASSERTED FROM A PARTIAL SWEEP. *** Each is a sum over the rows that were
    // built, so a budgeted run makes every one of them smaller and some of the comparisons still hold on the
    // smaller lab -- `unkeyedTotal > keyedTotal` would pass on half the devices and mean nothing. A partial run
    // reports them and says it cannot vouch for them; it does not quietly pass.
    const pinned = (name, cond, detail) => c.complete
        ? ok(name, cond, detail)
        : report(name, "NOT ASSERTED -- the sweep was PARTIAL (" + s.deviceModes + " of " +
                 s.plannedDeviceModes + "). " + detail);

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
    ok("build-level granularity demonstrably overstates the taint",
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

console.log();
if (fails) { console.log("corroborationCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("corroborationCensus-selfcheck: all checks pass");
