// tools/roundhouse/corroborationCensus-selfcheck.mjs
//
// Run: node tools/roundhouse/corroborationCensus-selfcheck.mjs   (~60s: it builds the whole lab)
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

const c = await corroborationCensus({});
const s = c.summary;
console.log();
censusLines(c).forEach((l) => console.log("  " + l));
console.log();

// ---- 1. THE CONTROL, WHICH IS THE ONLY REASON THE REST OF THE CENSUS MEANS ANYTHING ------------------------------
{
    const by = (m) => c.rows.find((r) => r.device === "lens" && r.mode === m);
    const shadow = by("shadow"), aim = by("aim"), deflect = by("deflect");

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

// ---- 2. THE HEADLINE: HOW MUCH OF THE LAB NOTHING VOUCHES FOR ----------------------------------------------------
{
    ok("the census actually swept the lab", s.deviceModes >= 80 && c.failed === 0,
        s.deviceModes + " device/modes built, " + c.failed + " refused");
    ok("!! most of the lab's numbers have no answer key",
        s.unkeyedTotal > s.keyedTotal,
        s.unkeyedTotal + " unkeyed vs " + s.keyedTotal + " keyed -- the tautology census (v2898) audited the " +
        s.keyedTotal + "; nothing had ever audited the " + s.unkeyedTotal);
    ok("!! more than half the lab's modes touch unspecified libm",
        s.nonPortableModes > s.portableModes,
        s.nonPortableModes + " of " + s.deviceModes + " modes non-portable");
    ok("!! the number this round exists to surface",
        s.unkeyedAtRisk >= 150,
        s.unkeyedAtRisk + " of " + s.unkeyedTotal + " unkeyed observables are reported by a non-portable build: " +
        "no answer key checks them, and the fleet's bit-identity guarantee does not cover them. The fingerprint's " +
        "50 subsystems agree across three machines; these are not among the 50");
    ok("!! criterion 3 is untestable for almost the whole lab",
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
    ok("build-level granularity demonstrably overstates the taint",
        kerr.every((r) => !r.portable && r.rawCalls < 100 && r.unkeyed.length >= 10),
        "kerr modes: " + kerr.map((r) => r.mode + "(" + r.rawCalls + " calls, " + r.unkeyed.length + " unkeyed)").join(", ") +
        " -- twenty-odd calls cannot plausibly have reached all eleven outputs; the census reports them at risk anyway " +
        "because it cannot yet prove otherwise, and overstating is the safe direction");

    const worst = c.rows.slice().sort((a, b) => b.rawCalls - a.rawCalls)[0];
    ok("!! and the reason nobody had run this sweep before is measurable",
        worst.rawCalls > 1e8,
        worst.device + "." + worst.mode + " makes " + worst.rawCalls.toLocaleString() + " unspecified libm calls. " +
        "The existing tripwire captures a stack trace per call, so pointing it at the lab does not finish; the " +
        "sampling variant in this module counts exactly and samples sites, and gets the sweep down to ~60s");
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
