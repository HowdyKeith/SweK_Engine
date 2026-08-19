// WebGLEngine/tools/ship/stepProgress-selfcheck.mjs -- v3007
//
// Run: node tools/ship/stepProgress-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/stepProgress.mjs -- did each escalation actually help?
//
// From TRM (SamsungSAILMontreal/TinyRecursiveModels): a 7M-parameter network reaching 45% on ARC-AGI-1 by
// recursively improving its ANSWER and being supervised AT EVERY REFINEMENT STEP rather than graded once at the
// end. The model does not port -- no PyTorch here, no training loop, and the repo was archived read-only in
// April 2026. THE SUPERVISION TARGET DOES.
//
// The roundhouse runs up to six propose/measure/verdict rounds and grades the FINAL claim. Every round already
// records its own verdict and NOTHING EVER COMPARED ROUND N TO ROUND N-1. So a run that improved steadily and a
// run that got worse three times and lucked into it on the fourth both read as "crystallized: true, rounds: 4".
// The escalation machinery is the expensive part of this system and nothing had measured whether it works.
import { shortfall, stepProgress, TRAJECTORY } from "../roundhouse/stepProgress.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const hist = (vals, claim) => vals.map((m, i) => ({ round: i, hyp: { claim }, verdict: { measured: m, done: false } }));
const MAXC = { observable: "e", max: 0.01 };

// ---- 1. SHORTFALL IS DEFINED FOR EVERY CLAIM SHAPE, and honestly absent where there is no gradient -----------
{
    ok("max-claim: satisfied is <= 0", shortfall({ measured: 0.005 }, { max: 0.01 }) < 0);
    ok("max-claim: unsatisfied is > 0", shortfall({ measured: 0.05 }, { max: 0.01 }) > 0);
    ok("min-claim inverts correctly", shortfall({ measured: 0.99 }, { min: 0.95 }) < 0 && shortfall({ measured: 0.5 }, { min: 0.95 }) > 0);
    ok("target-claim uses delta against tol", shortfall({ measured: 1.5, delta: 0.0 }, { target: 1.5, tol: 1e-9 }) <= 0);
    ok("!! an EQUALS claim returns null rather than a made-up distance", shortfall({ measured: 3 }, { equals: 3 }) === null,
       "a boolean has no gradient, and inventing one would make a trajectory out of nothing");
    ok("a non-numeric measurement returns null", shortfall({ measured: "yes" }, { max: 1 }) === null);
}

// ---- 2. THE FOUR TRAJECTORIES ARE DISTINGUISHED --------------------------------------------------------------------
{
    const t = (vals) => stepProgress(hist(vals, MAXC)).trajectory;
    ok("!! monotone improvement is recognised", t([0.09, 0.05, 0.02, 0.005]) === TRAJECTORY.MONOTONE);
    ok("!! a run that ENDED WORSE is recognised", t([0.02, 0.05, 0.09]) === TRAJECTORY.WORSENED,
       "this is the case the final verdict alone could never show");
    ok("...and a mixed run that improved OVERALL is distinguished from a monotone one",
       t([0.09, 0.20, 0.03]) === TRAJECTORY.IMPROVED && t([0.09, 0.20, 0.03]) !== TRAJECTORY.MONOTONE,
       "it ended better AND one escalation made it worse -- both facts, not one");
    ok("a flat run is not called an improvement", t([0.05, 0.05, 0.05]) === TRAJECTORY.FLAT,
       "the escalations cost time and changed nothing measurable");
    ok("the four verdicts are genuinely distinct",
       new Set([t([0.09, 0.05, 0.02]), t([0.02, 0.09]), t([0.09, 0.2, 0.03]), t([0.05, 0.05])]).size === 4);
}

// ---- 3. IT REFUSES WHERE IT CANNOT GRADE -------------------------------------------------------------------------------
{
    const one = stepProgress(hist([0.05], MAXC));
    ok("!! a single round is UNGRADED, not called flat", one.trajectory === TRAJECTORY.UNGRADED,
       "nothing to compare it to -- and 'flat' would read as a measured finding");
    const eq = stepProgress(hist([3, 3, 3], { observable: "n", equals: 3 }));
    ok("...and an equals-claim run is UNGRADED with the reason", eq.trajectory === TRAJECTORY.UNGRADED && /boolean/.test(eq.why || ""));
    ok("an empty history does not throw", stepProgress([]).trajectory === TRAJECTORY.UNGRADED);
    ok("...nor does a null one", stepProgress(null).trajectory === TRAJECTORY.UNGRADED);
}

// ---- 4. IT REPORTS THE SHAPE AND DOES NOT GRADE IT ------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "stepProgress.mjs"), "utf8");
    ok("!! a worsening step is not called a failure", /legitimate search/.test(src),
       "a proposer exploring a range may get worse before better; what was never visible is whether it happens, and how often");
    const m = stepProgress(hist([0.09, 0.20, 0.03], MAXC));
    ok("...and every step is reported, not just the summary", Array.isArray(m.steps) && m.steps.length === 2,
       "a trajectory without its steps is a label nobody can audit");
    ok("helped/hurt are counted separately", m.helped === 1 && m.hurt === 1);

    const bind = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "deviceBind.mjs"), "utf8");
    ok("!! the roundhouse attaches progress to BOTH outcomes", (bind.match(/progress: stepProgress\(history\)/g) || []).length === 2,
       "a run that never crystallised is exactly where knowing whether it was getting closer matters most");
}

console.log(fails ? "\nstepProgress-selfcheck: " + fails + " FAILED" : "\nstepProgress-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
