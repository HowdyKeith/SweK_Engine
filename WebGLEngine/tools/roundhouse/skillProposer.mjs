// WebGLEngine/tools/roundhouse/skillProposer.mjs -- v3415
// ---------------------------------------------------------------------------------------------------------------
// THE PROPOSER GETS A REAL PATH. v3398 shipped the front door with a SEEDED MOCK whose malformed rate was a known
// input, and said so in the JSON rather than in a footnote: `proposer: "mock"`. That made the numbers a test OF
// THE HARNESS. This file is the other half -- an `attempt` for skillTrial that asks a LOCAL MODEL for the claim
// and grades it with the SAME deterministic critic.
//
// *** NOTHING HERE IS NEW INFRASTRUCTURE, AND THAT IS DELIBERATE. *** The tree already had every piece:
//     ollamaRoleCaller.mjs   dispatches by ROLE, and "proposer" is one of its two roles
//     deviceCritic.mjs       critiqueClaim(claim, observables) -- the same critic the mock is graded by
//     ollamaReadiness.mjs    tells NOT-RUNNING from NO-MODELS from PINNED-MODEL-MISSING
//     skillTrial.mjs         owns the two arms, the rate difference and the evidence shape
// Writing a second caller, a second critic or a second notion of readiness is the shape this tree names most
// often -- A SECOND DECLARATION NOBODY COMPARED. So this file composes and adds exactly two things of its own:
// a LEDGER of what the model actually said, and the refusal below.
//
// *** THE REFUSAL IS THE LOAD-BEARING HALF, AND IT IS THE v3396 DEFECT IN NEW CLOTHES. ***
// A trial computes z from n questions per arm. That arithmetic assumes n INDEPENDENT samples. Ask a model at
// temperature 0 the same question forty times and it answers identically forty times -- so the arm carries ONE
// sample and the trial reports a z computed over forty copies of it. The dangerous direction is not the null:
// a control that is malformed every time beside a treated arm that is well-formed every time gives z = 10 and
// the word PROVEN, off ONE observation per arm. THAT IS EXACTLY WHAT v3396 FIXED IN THE OTHER DIRECTION -- there
// the bar sat inside the noise, here the sample size is a fiction -- and neither is visible in the verdict.
// A DEGENERATE ARM IS REFUSED BY NAME, WITH ITS NUMBERS ATTACHED, rather than reported with a caveat beside it.
//
// AND IT CATCHES A SECOND FAILURE FOR FREE, WHICH IS WHY IT SITS HERE RATHER THAN IN THE PAGE. When the model is
// unreachable or unparseable, ollamaRoleCaller's final fallback returns a FIXED claim ({observable:"captured"})
// to keep the loop alive -- correct for the roundhouse, and here it would make both arms identical and constant,
// so the trial would report a tidy null result from a model that never answered. The distinctness check sees
// that as one distinct claim across the whole arm and refuses it, without needing to know why.
//
// WHAT THIS FILE DOES NOT CLAIM: that a hint helps a real model. It supplies the path; the number comes from a
// run on a machine with a model on it. The mock is KEPT rather than replaced -- it is the only proposer whose
// effect size is known, so it stays as the harness check it was built to be.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { critiqueClaim } from "./deviceCritic.mjs";

/** The caller kinds this proposer path understands. Matches deviceBridge's vocabulary rather than inventing one. */
export const PROPOSER_KINDS = ["mock", "ollama"];

/** Why a trial was refused. Exported so the bridge and the gate name the same thing. */
export const REFUSALS = {
    DEGENERATE: "degenerate-arm",
    CALLER_FAILED: "caller-failed",
    BUDGET: "budget-exceeded",
};

export const DEGENERATE_WHY =
    "An arm answered with ONE distinct claim for every question, so it carries ONE sample and not n. " +
    "z is computed as though the n were independent, which would turn a single observation into PROVEN. " +
    "Raise the proposer temperature above 0, or give the questions something to differ about.";

/**
 * Build an `attempt(question, hints)` for skillTrial that asks a real model and grades the answer with the real
 * critic. Returns the attempt AND the ledger, because the thing that knows what the model said is the thing that
 * asked -- skillTrial only ever sees {issues}, and it should stay that way.
 *
 * @param {object}   device      the built device (its `observables` are the menu the critic grades against)
 * @param {string}   deviceName  the name that goes into the system prompt
 * @param {function} caller      (role, payload) -> parsed JSON. ollamaRoleCaller's contract, injectable for gates.
 * @param {number}   deadlineMs  wall-clock budget for the WHOLE trial; a local model is seconds per call and a
 *                               trial is 2n calls, so an unbounded run from a URL bar is a hang.
 */
export function makeModelAttempt({ device, deviceName, caller, deadlineMs = 10 * 60 * 1000, now = Date.now }) {
    const observables = (device && device.observables) || [];
    const log = [];
    const started = now();
    let calls = 0;

    const attempt = async (question, hints) => {
        const hinted = !!(hints && hints.length);
        if (now() - started > deadlineMs) {
            const e = new Error(`the trial passed its ${deadlineMs >= 1000 ? Math.round(deadlineMs / 1000) + "s" : deadlineMs + "ms"} budget after ${calls} model calls. ` +
                                "A partially completed trial is not a result, so it is refused rather than reported.");
            e.refusal = REFUSALS.BUDGET; e.calls = calls;
            throw e;
        }
        // The payload differs between arms ONLY by `hints`. If the caller dropped them the two arms would be
        // identical and every trial would return a tidy null forever -- a check that cannot fail. The gate
        // asserts the hint text reaches the request body, which is the only place that can be observed.
        const payload = { device: deviceName, observables, question };
        if (hinted) payload.hints = hints.slice();

        let parsed;
        try {
            parsed = await caller("proposer", payload);
            calls++;
        } catch (err) {
            const e = new Error(`the proposer failed after ${calls} successful call(s): ${(err && err.message) || err}`);
            e.refusal = REFUSALS.CALLER_FAILED; e.calls = calls;
            throw e;
        }
        const claim = parsed && typeof parsed === "object" ? parsed.claim : null;
        // The claim is graded by the SAME function that grades the mock. Two critics would be two definitions of
        // MALFORMED, and the whole trial is a difference between two malformed rates.
        const verdict = critiqueClaim(claim, observables);
        log.push({ hinted, key: stableKey(claim), issues: verdict.issues.length });
        return verdict;
    };

    return { attempt, log, calls: () => calls };
}

/** A claim as a comparable string. Key order is sorted so {a,b} and {b,a} are one answer, not two. */
export function stableKey(claim) {
    if (!claim || typeof claim !== "object") return "\u0000none";
    const keys = Object.keys(claim).sort();
    return JSON.stringify(keys.map((k) => [k, claim[k]]));
}

/**
 * How many DISTINCT claims each arm produced. This is the whole sampling question and nothing else in the stack
 * can answer it: skillTrial records issues, and two different claims can be malformed for the same reason.
 */
export function sampling(log) {
    const arm = (hinted) => {
        const rows = log.filter((r) => r.hinted === hinted);
        return { n: rows.length, distinct: new Set(rows.map((r) => r.key)).size };
    };
    return { control: arm(false), treated: arm(true) };
}

/** The arms whose n is a fiction. Named, because "the trial is degenerate" does not say which half to fix. */
export function degenerateArms(s) {
    const out = [];
    for (const name of ["control", "treated"]) {
        const a = s[name];
        if (a && a.n > 1 && a.distinct <= 1) out.push(name);
    }
    return out;
}
