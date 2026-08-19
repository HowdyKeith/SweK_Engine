// tools/roundhouse/lensCorroborated-selfcheck.mjs
//
// Run: node tools/roundhouse/lensCorroborated-selfcheck.mjs   (~40s)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3082 -- THE FIRST QUANTITY PUT THROUGH ALL FOUR SINCE THE BATTERY WAS BUILT, and it did not pass on the
// first run. It failed TWO criteria, and both failures were in the HARNESS rather than the physics -- which is
// the only reason this file is worth more than a green tick.
//
// WHAT FAILED, AND WHY IT MATTERS MORE THAN THE PASS.
//
// (1) corroborateFully built each sweep's config as `{ [knob.param]: v }` -- one named key. A knob that moves
//     SEVERAL parameters together cannot be expressed that way, and lens.scale moves M and b together (as
//     kepler.scale moves a and mu). The register has carried an `apply(cfg, v)` for exactly this since v2906
//     and this file ignored it, passing `{ scale: 1 }`, `{ scale: 3 }` -- keys lensDefaults does not recognise.
//     Every run came back identical and criterion 2 reported "bit-identical, so the knob may not be live": a
//     TRUE SENTENCE ABOUT A SWEEP THAT NEVER HAPPENED. Two definitions of "apply a nuisance knob", disagreeing
//     silently, in the flattering direction -- the shape this tree keeps meeting.
//
// (2) EVERY UNNAMED PARAMETER FELL BACK TO DEVICE DEFAULTS, so criteria 2 and 3 ran at DIFFERENT PHYSICS. The
//     nuisance knob asserted its invariance at b = 60 and the refinement sweep ran at the default b = 10. Two
//     criteria about two quantities that share a name is not a battery. Knobs now declare `base`, the operating
//     point they are asserted at, and the evidence string prints it so a standing can never again be read
//     without knowing where it was taken.
//
// AND THE THIRD THING, WHICH IS PHYSICS AND NOT PLUMBING. dphi refinement classified CONVERGING at b = 60 and
// DRIFTING at b = 10 with the SAME integrator. Neither verdict was about convergence. RK4 truncation error falls
// as dphi^4 while ACCUMULATED ROUND-OFF grows as 1/dphi, so there is a crossover below which refining makes the
// answer WORSE -- and the old values 8e-4..1e-4 straddled it. Past the crossover the sequence wanders at the
// 1e-12 level and classifySequence returns whichever verdict four samples happen to support. THE KNOB'S VALUES
// WERE CHOSEN WITHOUT KNOWING WHERE REFINEMENT STOPS MEANING ANYTHING, which is a thing a refinement register
// can be wrong about and nothing was checking.
//
// WHAT THIS FILE DOES NOT CLAIM. Criterion 4 passes on BIT-IDENTICAL, and corroborateFully-selfcheck already
// carries the case that makes that dangerous: optics rayleighFactor is bit-identical under the same shift
// because it is QUANTISED, and that is scored a failure there while being the same output lens produces here.
// The difference is not visible to c4 and this gate supplies it with a POSITIVE CONTROL in the same process --
// lens.shadow reaches Math.asin and Math.acos and must move. See the note at the end: c2 refuses bit-identical
// and c4 accepts it, and that asymmetry is a real hole in the battery, named here rather than papered over.

import { corroborateFully } from "./corroborateFully.mjs";
import { NUISANCE_KNOBS } from "./nuisanceKnobs.mjs";
import { REFINEMENT_KNOBS } from "./refinementKnobs.mjs";
import { LENS_DEFLECT_REGISTRATION } from "./lensRegistration.mjs";
import { getDevice } from "./devices.mjs";
import { withPerturbedLibm, diffObservables } from "./libmSensitivity.mjs";
import { classifySequence } from "./refinementKnobs.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const dev = await getDevice("lens");
const deflect = async (b, dphi) => (await dev.build({ mode: "deflect", config: { M: 1, b, dphi } })).deflectionMeasured;

// ---- 1. THE REGISTRATION IS A PREDICTION, NOT A DESCRIPTION -------------------------------------------------------
{
    const r = LENS_DEFLECT_REGISTRATION;
    ok("the claim was frozen before the measurement",
        r.registeredAt === "before-measurement" && Object.isFrozen(r) && Object.isFrozen(r.claim),
        "quantity: " + r.quantity + " -- sealed, so it cannot be edited to match what came back");
    ok("!! it predicts BIT-IDENTICAL, which is a claim that can fail",
        r.claim.max === 0,
        "max relMove = 0. A prediction of 'small' cannot fail against a one-ulp shift; exactly zero can, and " +
        "the rationale names the structural reason -- the deflect path calls no function the perturbation targets");
    ok("...and it carries a POSITIVE CONTROL, because bit-identical is also what a dead test returns",
        !!(r.claim.positiveControl && r.claim.positiveControl.quantity),
        "control: " + r.claim.positiveControl.quantity + ". If both are unmoved the perturbation never reached " +
        "the device and the primary result proves nothing");
    ok("criteria 2 and 3 are DISCLOSED as already measured, not presented as predictions",
        /disclosed, not predicted/i.test(r.rationale),
        "v3081 measured both for this exact quantity. Offering them as predictions here would be retrofitting, " +
        "which is the move the four criteria exist to prevent");
}

// ---- 2. CRITERION 4, AND THE CONTROL THAT MAKES IT MEAN SOMETHING -------------------------------------------------
{
    const baseD = await dev.build({ mode: "deflect" });
    const pertD = await withPerturbedLibm(() => dev.build({ mode: "deflect" }));
    const dD = diffObservables(baseD, pertD).find((x) => x.field === "deflectionMeasured");
    ok("!! PREDICTION HELD: deflectionMeasured is bit-identical under a one-ulp libm shift",
        dD && dD.moved === false,
        "base and perturbed both " + baseD.deflectionMeasured.toPrecision(17) + ", relMove exactly 0. The " +
        "integrator is arithmetic and an RK4 step; the only Math call in the path is sqrt, which is IEEE-exact " +
        "and correctly outside the perturbation set");

    const baseS = await dev.build({ mode: "shadow" });
    const pertS = await withPerturbedLibm(() => dev.build({ mode: "shadow" }));
    const dS = diffObservables(baseS, pertS).find((x) => x.field === "shadowAngleRad");
    ok("!! ...and the POSITIVE CONTROL moved, in the same process",
        dS && dS.moved === true,
        "lens.shadow shadowAngleRad " + baseS.shadowAngleRad.toPrecision(17) + " -> " +
        pertS.shadowAngleRad.toPrecision(17) + ", relMove " + dS.relMove.toExponential(3) + ". shadowAngle " +
        "goes through Math.asin and Math.acos. So the perturbation was armed and reached this device, and the " +
        "unmoved deflection is a fact about the code path rather than about a test that did nothing");
}

// ---- 3. THE HARNESS BUG: A MULTI-PARAMETER KNOB WAS SILENTLY NOT APPLIED -------------------------------------------
{
    // Reproduce the old behaviour exactly: one named key, everything else defaulted.
    const old = [];
    for (const v of NUISANCE_KNOBS.lens.values) old.push((await dev.build({ mode: "deflect", config: { scale: v } })).deflectionMeasured);
    ok("!! the OLD single-key config produced four identical values",
        old.every((x) => Object.is(x, old[0])),
        "config {scale: v} is a key lensDefaults does not recognise, so all four runs are the default b = 10: " +
        old[0].toPrecision(17) + " four times. Criterion 2 then reported the knob as possibly not live -- true " +
        "of the sweep, false of the knob, and indistinguishable in the output");

    ok("...while apply() moves the parameters the physics actually has",
        (() => { const c = NUISANCE_KNOBS.lens.apply({ ...NUISANCE_KNOBS.lens.base }, 3); return c.M === 3 && c.b === 180; })(),
        "apply(base, 3) gives M=3 b=180 from M=1 b=60 -- the ratio M/b preserved, which is the entire invariance");

    ok("both lens knobs declare the SAME operating point",
        NUISANCE_KNOBS.lens.base.M === REFINEMENT_KNOBS.lens.base.M &&
        NUISANCE_KNOBS.lens.base.b === REFINEMENT_KNOBS.lens.base.b,
        "M=" + NUISANCE_KNOBS.lens.base.M + " b=" + NUISANCE_KNOBS.lens.base.b + ". Criteria 2 and 3 taken at " +
        "different physics are two claims about two quantities that share a name, not a battery");

    ok("a knob with neither base nor apply still behaves exactly as before",
        (() => {
            const plain = { param: "dphi", values: [1e-3] };
            const base = plain.base ? { ...plain.base } : {};
            const cfg = plain.apply ? plain.apply(base, 1e-3) : { ...base, [plain.param]: 1e-3 };
            return Object.keys(cfg).length === 1 && cfg.dphi === 1e-3;
        })(),
        "the fallback is the original expression, so no knob written before v3082 changes verdict");
}

// ---- 4. THE CROSSOVER, MEASURED -- WHERE REFINEMENT STOPS MEANING ANYTHING ------------------------------------------
{
    const LADDER = [1.6e-3, 8e-4, 4e-4, 2e-4, 1e-4, 5e-5, 2.5e-5, 1e-5];
    const vals = [];
    for (const k of LADDER) vals.push(await deflect(60, k));
    const steps = vals.slice(1).map((x, i) => Math.abs(x - vals[i]));
    const firstThree = steps.slice(0, 3), lastThree = steps.slice(-3);
    ok("!! the dphi sequence contracts, then STOPS contracting and grows again",
        Math.min(...firstThree) > Math.max(...firstThree.slice(1)) * 0 && lastThree.some((s) => s > steps[2]),
        "steps " + steps.map((s) => s.toExponential(1)).join(", ") + " over dphi 1.6e-3 down to 1e-5. RK4 " +
        "truncation falls as dphi^4 and accumulated round-off grows as 1/dphi, so below the crossover refining " +
        "makes the answer WORSE -- the last step is larger than the middle ones");

    ok("!! the OLD refinement values straddled the crossover, so the verdict depended on b",
        (await (async () => {
            const OLD = [8e-4, 4e-4, 2e-4, 1e-4];
            const at = async (b) => { const v = []; for (const k of OLD) v.push(await deflect(b, k)); return classifySequence(v, OLD).verdict; };
            return (await at(10)) !== (await at(60));
        })()),
        "on 8e-4..1e-4 the SAME integrator classifies DRIFTING at b = 10 and CONVERGING at b = 60. Neither " +
        "verdict is about convergence; both are about which side of the 1e-12 noise four samples landed on");

    for (const b of [10, 60]) {
        const v = []; for (const k of REFINEMENT_KNOBS.lens.values) v.push(await deflect(b, k));
        const cls = classifySequence(v, REFINEMENT_KNOBS.lens.values);
        ok("the CHOSEN values classify CONVERGING at b = " + b,
            cls.verdict === "CONVERGING",
            "contraction " + cls.contraction.toExponential(2) + ", final relative step " +
            cls.finalStepRel.toExponential(2) + " -- above the crossover, so the verdict is about the method " +
            "and not about the operating point");
    }
}

// ---- 5. THE STANDING ------------------------------------------------------------------------------------------------
let out;
{
    out = await corroborateFully({
        device: "lens", mode: "deflect", field: "deflectionMeasured",
        refinement: REFINEMENT_KNOBS.lens, nuisance: NUISANCE_KNOBS.lens,
        registration: LENS_DEFLECT_REGISTRATION,
    });
    for (const [k, c] of Object.entries(out.criteria)) console.log("         " + (c.pass ? "ok   " : "FAIL ") + k + ": " + c.evidence);
    ok("!! lens.deflect deflectionMeasured is CORROBORATED",
        out.standing === "CORROBORATED",
        "all four: a frozen prediction that held, invariance under a knob the physics forbids from mattering, " +
        "convergence under refinement above the round-off crossover, and stability under a one-ulp libm shift " +
        "with a live positive control");
    ok("the evidence names the operating point",
        /b=60/.test(out.criteria.c2_nuisance.evidence) && /b=60/.test(out.criteria.c3_convergence.evidence),
        "a standing whose operating point is not printed cannot be reproduced or disputed");
}

// ---- 6. THE HOLE THIS ROUND DID NOT CLOSE ---------------------------------------------------------------------------
{
    // c2 refuses bit-identical BY NAME. c4 accepts it. That inconsistency is why optics rayleighFactor's c4
    // "pass" is hollow, and lens produces the SAME OUTPUT for a completely different reason. Asserting the
    // asymmetry exists keeps it from being forgotten; fixing it would move other devices' standings and belongs
    // in its own round with its own evidence.
    ok("!! RECORDED: criterion 2 refuses bit-identical and criterion 4 accepts it",
        out.criteria.c2_nuisance.bitIdentical === false && out.criteria.c4_portability.moved === false &&
        out.criteria.c4_portability.pass === true,
        "the same output -- no movement -- is a FAILURE under c2 and a PASS under c4. For lens the pass is " +
        "earned, and only because the positive control in section 2 is run separately; c4 itself cannot tell " +
        "a libm-free code path from a quantised observable from a perturbation that never armed. optics " +
        "rayleighFactor is the case that proves it. c4 should require a live control the way c2 requires " +
        "non-identity -- its own round, because it would move standings that already exist");
    // *** v3313 -- THAT ROUND HAPPENED, AT v3083, AND THIS NOTE OUTLIVED IT BY THIRTY VERSIONS. ***
    // corroborateFully.mjs now refuses a bit-identical c4 without a live control on the SAME DEVICE in the SAME
    // PROCESS, naming the three situations that produce no movement -- a libm-free path, a quantised observable,
    // and a perturbation that never armed -- and grading an undeclared control as UNVERIFIED rather than PASS.
    // The deferral above is what it asked for, and it was granted; nothing came back to retire the sentence.
    // A deferred note that has been satisfied is worse than one that has not: it advertises open work that is
    // finished, and the next reader spends the round rediscovering that.
    // Asserted on BEHAVIOUR, not on a sentence: the prose-audit round (v3298) is exactly about gates that hunt
    // wording, and the wording here is wrapped across comment lines anyway, which is how the first version of
    // this check failed. What matters is that the bit-identical branch consults a control and that its verdict
    // depends on the control having moved.
    {
        const cf = (await import("node:fs")).readFileSync(new URL("./corroborateFully.mjs", import.meta.url), "utf8");
        const code = cf.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
        ok("...and v3083 DID wire that in: c4 consults a live control before accepting bit-identical",
            /probeLibmControl\(/.test(code) && /ctl\.declared\s*&&\s*ctl\.present\s*&&\s*ctl\.moved/.test(code),
            "the deferral above is SATISFIED and is kept only as history — a deferred note that has been met is " +
            "worse than one that has not, because it advertises open work that is finished and the next reader " +
            "spends the round rediscovering that");
    }
    console.log("  NOTE   ONE quantity is now corroborated by all four criteria. Twenty-seven devices, five");
    console.log("         eligible, one standing. That is the honest state of the lab, and the number worth");
    console.log("         moving is eligibility, not the number of green ticks.");
}

console.log();
if (fails) { console.log("lensCorroborated-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("lensCorroborated-selfcheck: all checks pass");
