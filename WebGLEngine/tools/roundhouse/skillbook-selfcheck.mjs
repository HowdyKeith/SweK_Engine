// WebGLEngine/tools/roundhouse/skillbook-selfcheck.mjs — v3395
//
// Run: node tools/roundhouse/skillbook-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// The idea is ACE's (kayba-ai/agentic-context-engine, arXiv 2510.04618). Not adopted as a dependency -- uv,
// LiteLLM, an API key and a hosted product all fail this tree's bar. The idea is taken and none of the code is.
//
// THE ROUNDHOUSE ALREADY HAD TWO OF THE THREE ROLES, and its Reflector is better than the paper's: deviceCritic
// is DETERMINISTIC, so it cannot hallucinate, rate-limit or be charged for, and it names the exact defect from a
// fixed list. ACE's Reflector infers what worked from traces with no ground truth. What was missing is
// persistence: every critique the roundhouse produced died with its session.
//
// *** AND THE SCOPE IS NARROWER THAN ACE's ON PURPOSE, WHICH IS WHAT MAKES IT HONEST. *** modelBench already
// separates MALFORMED ("could not produce a usable claim" -- an interface failure a hint can fix) from REFUSED
// ("well-formed and wrong -- only a better model fixes this"). A Skillbook that mined REFUSED would be teaching a
// model to guess luckier. The book triggers on the five MALFORMED reasons and on nothing else.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { TRIGGERS, triggerOf, makeStrategy, deriveState, evidenceIsSound, MIN_IMPROVEMENT,
         load, save, hintsFor, summary } from "./skillbook.mjs";
import { trial, runArm, rateFor } from "./skillTrial.mjs";
import { critiqueClaim } from "./deviceCritic.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

// ---- 1. TRIGGERS COME FROM THE DETERMINISTIC CRITIC, NOT FROM INFERENCE ---------------------------------------
{
    const obs = ["alphaMeasured", "alphaErrFrac", "steps"];
    const cases = [
        [null, "no-claim"],
        [{ max: 1 }, "observable-missing"],
        [{ observable: "alphaMeasure", max: 1 }, "observable-unknown"],
        [{ observable: "steps" }, "comparator-missing"],
        [{ observable: "steps", target: 5 }, "target-without-tol"],
    ];
    const got = cases.map(([claim, want]) => {
        const c = critiqueClaim(claim, obs);
        const t = c.issues.map(triggerOf).filter(Boolean);
        return { want, hit: t.includes(want), t };
    });
    ok("!! every MALFORMED reason the critic can name maps to a trigger",
       got.every((g) => g.hit),
       got.map((g) => g.want + (g.hit ? "" : " MISSED")).join(", ") +
       " — deviceCritic names the defect from a fixed list, so the trigger is KNOWN rather than inferred from a trace");
    ok("!! ...and an issue this file does not understand yields NO strategy rather than a guess",
       triggerOf("the physics rejected your claim") === null && triggerOf("") === null,
       "triggerOf returns null for anything outside the five, which is how a REFUSED can never become a trigger");
}

// ---- 2. THE RATCHET: STATE IS DERIVED, NEVER READ ------------------------------------------------------------------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-skill-"));
    const file = path.join(dir, "skillbook.json");
    try {
        // hand-write a book that CLAIMS proven with no evidence at all
        fs.writeFileSync(file, JSON.stringify({ kind: "swek-skillbook", schemaVersion: 1, strategies: [
            { id: "liar", trigger: "comparator-missing", hint: "add a comparator", state: "proven", evidence: null },
            { id: "thin", trigger: "observable-missing", hint: "name an observable", state: "PROVEN",
              evidence: { before: 0.9, after: 0.1, n: 4 } },
        ] }));
        const b = load({ file });
        const liar = b.strategies.find((s) => s.id === "liar");
        const thin = b.strategies.find((s) => s.id === "thin");
        ok("!! a strategy claiming PROVEN with no evidence loads as PROPOSED",
           liar.state === "PROPOSED" && liar.claimOverridden,
           liar.claimOverridden + " — the licence ratchet from physics/proposers.mjs, applied to strategies: what is stored is a CLAIM, not a grant");
        ok("!! ...and a big improvement over FOUR trials is still PROPOSED, because four runs is a rumour",
           thin.state === "PROPOSED" && /rumour/.test(thin.why),
           "0.900 -> 0.100 looks spectacular and is measured on n=4; the bar is 20");
        // and a PROPOSED strategy is never injected
        const h = hintsFor(["The claim has no comparator. Add one of: max, min, target (with tol), equals, or withinBracket."], { file });
        ok("!! a PROPOSED strategy is NOT injected, however good it claims to be",
           h.hints.length === 0 && h.skipped.length === 1,
           "skipped: " + h.skipped[0].id + " (" + h.skipped[0].state + ") — there is no state in which an unmeasured strategy reaches a prompt");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- 3. THE TRIAL: A CONTROL ARM, AND A STRATEGY THAT DOES NOTHING IS RETIRED -----------------------------------------
// The control arm is what ACE has not got: a Reflector mining "what worked" sees only the runs that happened, so
// a model that improved on its own gets credited to whatever strategy was added that week.
{
    const questions = Array.from({ length: 40 }, (_, i) => "q" + i);
    // a fixture caller: without the hint it forgets the comparator two thirds of the time; with it, rarely.
    const helpful = async (q, hints) => {
        const n = Number(q.slice(1));
        const forgets = hints.length ? (n % 20 === 0) : (n % 3 !== 0);
        return { issues: forgets ? ["The claim has no comparator. Add one of: max, min, target (with tol), equals, or withinBracket."] : [] };
    };
    // and one whose hint changes nothing at all
    const inert = async (q) => {
        const n = Number(q.slice(1));
        return { issues: n % 3 !== 0 ? ["The claim has no comparator. Add one of: max, min, target (with tol), equals, or withinBracket."] : [] };
    };
    const strat = makeStrategy({ id: "say-comparator", trigger: "comparator-missing", hint: "Every claim needs a comparator." });

    const good = await trial({ strategy: strat, questions, attempt: helpful });
    ok("!! a strategy that lowers the malformed rate is PROVEN, with both arms recorded",
       good.state === "PROVEN" && good.evidence.arms.control === 40 && good.evidence.arms.treated === 40,
       "rate " + good.evidence.before.toFixed(3) + " -> " + good.evidence.after.toFixed(3) + " over " + good.evidence.n +
       " questions, drop " + good.drop.toFixed(3) + " against a bar of " + good.bar);

    const dud = await trial({ strategy: strat, questions, attempt: inert });
    ok("!! a strategy that changes NOTHING is RETIRED, not quietly kept",
       dud.state === "RETIRED" && Math.abs(dud.drop) < 1e-9,
       "rate " + dud.evidence.before.toFixed(3) + " -> " + dud.evidence.after.toFixed(3) +
       " — identical arms, so the hint did nothing, and it stays in the book WITH ITS NUMBERS because 'we tried this and it did nothing' is a result the next person should not rediscover");

    const short = await trial({ strategy: strat, questions: questions.slice(0, 8), attempt: helpful });
    ok("!! a trial with too few questions REFUSES rather than reporting a rate",
       !short.ok && /rumour/.test(short.why), short.why);
}

// ---- 4. THE SCOPE BOUNDARY: NO STRATEGY CAN EVER TRIGGER ON A REFUSED --------------------------------------------------
{
    ok("!! the trigger list is exactly the five MALFORMED reasons, and REFUSED is not among them",
       TRIGGERS.length === 5 && !TRIGGERS.some((t) => /refus|wrong|reject/i.test(t)),
       TRIGGERS.join(", ") + " — modelBench says a REFUSED claim is well-formed and wrong and that 'only a better " +
       "model fixes this'. A hint that appeared to reduce refusals would be teaching the model to guess luckier, " +
       "which is not a skill and cannot be verified");
    let threw = false;
    try { makeStrategy({ id: "x", trigger: "physics-rejected-it", hint: "be right" }); } catch { threw = true; }
    ok("!! a strategy on an invented trigger THROWS at construction",
       threw, "a strategy that fires on an inferred condition is exactly what this file exists to avoid");
}

// ---- 5. ROUND TRIP, AND THE SHIPPED BOOK ------------------------------------------------------------------------------
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-skill2-"));
    const file = path.join(dir, "skillbook.json");
    try {
        const proven = makeStrategy({ id: "a", trigger: "observable-missing", hint: "Name exactly one observable from the menu.",
            evidence: { before: 0.60, after: 0.05, n: 40 } });
        const retired = makeStrategy({ id: "b", trigger: "target-without-tol", hint: "A target needs a tol.",
            evidence: { before: 0.30, after: 0.29, n: 40 } });
        save([proven, retired], { file });
        const b = load({ file });
        const s = summary(b);
        ok("saved and reloaded, states survive the round trip and are re-derived",
           s.proven === 1 && s.retired === 1 && s.total === 2, JSON.stringify(s));
        const h = hintsFor(["The claim names no observable. Choose exactly one from: a, b", 'A "target" needs a "tol" beside it, or the claim can never be satisfied.'], { file });
        ok("!! only the PROVEN hint is injected, though both triggers fired",
           h.hints.length === 1 && h.used[0].id === "a" && h.skipped.length === 1 && h.skipped[0].id === "b",
           "injected 1 of 2 — the retired one is present, matched its trigger, and was still not used");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    const shipped = load({});
    ok("!! the shipped book is EMPTY, and says so rather than shipping untested advice",
       shipped.missing || shipped.strategies.length === 0,
       (shipped.missing ? "no skillbook.json yet" : "0 strategies") +
       " — ACE ships with strategies mined from someone else's traces. This ships with none, because a strategy " +
       "that has not been trialled on THIS tree's devices has no evidence here, and evidence is the only thing " +
       "that lets one be used");
}

console.log(fails ? ("[skillbook-selfcheck] FAILED " + fails) : "[skillbook-selfcheck] all passed");
process.exit(fails ? 1 : 0);
