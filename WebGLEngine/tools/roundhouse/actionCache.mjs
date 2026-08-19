// WebGLEngine/tools/roundhouse/actionCache.mjs -- v3014
//
// THE MODEL DISCOVERS THE ANSWER ONCE. AFTER THAT IT IS REPLAY, NOT INFERENCE.
//
// The idea is Stagehand's (browserbase/stagehand, MIT, ~18k stars). Its pitch, verbatim: "Write once, run
// forever: auto-caching combined with self-healing remembers previous actions, RUNS WITHOUT LLM INFERENCE, and
// knows when to involve AI whenever the website changes and your automation breaks."
//
// The roundhouse calls a model EVERY round of EVERY run. But once a hypothesis has CRYSTALLISED for a given
// question on a given device, the model's contribution is finished -- it found a claim the physics accepted, and
// that claim is a fact about the device, not about the conversation. Re-deriving it costs a call and can just as
// easily come back worse.
//
// THE RULE THAT MAKES THIS SAFE, AND IT IS THE ONE THIS PROJECT KEEPS PAYING FOR: A CACHED ANSWER THAT NO LONGER
// WORKS MUST NOT REPORT SUCCESS. The replay is graded by THE SAME VERIFIER as a fresh run -- the real device,
// the real measurement, the real numericVerdict. If the cached claim still crystallises, that is a genuine pass
// that cost no inference. If it does not, the cache is REJECTED, said out loud, and the model is called. There
// is no path where a stale entry is believed.
//
// THAT IS ALSO WHY THIS IS NOT A MEMO TABLE. A memo returns a stored RESULT. This returns a stored HYPOTHESIS
// and then re-measures it, so the physics is run every time and only the SEARCH is skipped.
"use strict";
import { createHash } from "node:crypto";

/** A cache key must contain everything that could change the right answer, and nothing that cannot. */
export function cacheKey({ device, question, mode = null, engineVersion = null }) {
    if (!device || !question) return null;
    const basis = JSON.stringify({ device, question: String(question).trim(), mode, engineVersion });
    return createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

export const REPLAY = {
    HIT: "replayed",          // cached claim re-measured and still crystallises: a real pass, no inference
    REJECTED: "cache-stale",  // cached claim no longer crystallises: fall through to the model
    MISS: "no-entry",
    UNUSABLE: "malformed-entry",
};

/**
 * Try a cached hypothesis. THE VERIFIER IS PASSED IN and is the same one a fresh run uses -- this module never
 * decides whether something passed, it only decides whether to ask the model.
 *
 * @param {object} entry    { claim, at, engineVersion } or null
 * @param {Function} measure async (claim) => observable
 * @param {Function} verdictOf (claim, observable) => { done, ... }
 */
export async function tryReplay(entry, measure, verdictOf) {
    if (!entry) return { verdict: REPLAY.MISS, inference: true };
    if (!entry.claim || typeof entry.claim !== "object") {
        return { verdict: REPLAY.UNUSABLE, inference: true, why: "a cache entry without a claim cannot be re-measured, and guessing at one would be inventing a hypothesis nobody proposed" };
    }
    let observable = null, err = null;
    try { observable = await measure(entry.claim); }
    catch (e) { err = String((e && e.message) || e); }
    if (err) {
        return { verdict: REPLAY.REJECTED, inference: true, error: err,
                 why: "re-measuring the cached claim threw. A cache entry that cannot even be run is not a pass." };
    }
    const v = verdictOf(entry.claim, observable);
    if (v && v.done) {
        return { verdict: REPLAY.HIT, inference: false, claim: entry.claim, observable, roundhouseVerdict: v,
                 why: "the cached claim was RE-MEASURED against the real device and still crystallises -- a genuine pass that cost no model call" };
    }
    return {
        verdict: REPLAY.REJECTED, inference: true, claim: entry.claim, observable, roundhouseVerdict: v,
        why: "the cached claim no longer crystallises. THE CACHE IS REJECTED AND THE MODEL WILL BE CALLED -- a stored answer that stopped working must never report success.",
    };
}

/** What to store after a run crystallises. Only a crystallised run is worth remembering. */
export function entryFrom(result, engineVersion = null) {
    if (!result || !result.crystallized || !result.claim) return null;
    return { claim: result.claim, at: new Date().toISOString(), engineVersion, rounds: result.rounds ?? null };
}

/** Did skipping inference actually save anything? Reported, not assumed. */
export function savings(log) {
    const rows = log || [];
    const hits = rows.filter((r) => r.verdict === REPLAY.HIT).length;
    const calls = rows.filter((r) => r.inference).length;
    return {
        attempts: rows.length, hits, inferenceRuns: calls,
        hitRate: rows.length ? hits / rows.length : null,
        note: rows.length
            ? hits + " of " + rows.length + " runs replayed a cached claim and re-measured clean; " + calls + " still needed the model"
            : "nothing attempted",
    };
}
