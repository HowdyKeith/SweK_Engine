// WebGLEngine/tools/ship/actionCache-selfcheck.mjs -- v3014
//
// Run: node tools/ship/actionCache-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES tools/roundhouse/actionCache.mjs -- the model discovers the answer once, then it is replay.
//
// From browserbase/stagehand (MIT, ~18k stars): "Write once, run forever: auto-caching combined with
// self-healing remembers previous actions, RUNS WITHOUT LLM INFERENCE, and knows when to involve AI whenever the
// website changes and your automation breaks."
//
// The roundhouse calls a model every round of every run. But once a hypothesis has CRYSTALLISED for a question
// on a device, the model's contribution is finished: it found a claim the physics accepted, and that claim is a
// fact about the DEVICE, not about the conversation. Re-deriving it costs a call and can come back worse --
// which v3007 measured, and found runs that ended WORSE than they started.
//
// THE RULE THAT MAKES IT SAFE IS THE ONE THIS PROJECT KEEPS PAYING FOR: A CACHED ANSWER THAT NO LONGER WORKS
// MUST NOT REPORT SUCCESS. Every replay is graded by THE SAME VERIFIER as a fresh run -- real device, real
// measurement, real verdict. There is no path where a stale entry is believed.
import { cacheKey, tryReplay, entryFrom, savings, REPLAY } from "../roundhouse/actionCache.mjs";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "actionCache.mjs"), "utf8");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const claim = { observable: "e", max: 0.01 };
const verdictOf = (c, o) => ({ done: o.e <= c.max, measured: o.e });

// ---- 1. A HIT IS RE-MEASURED, NOT REMEMBERED ---------------------------------------------------------------
{
    const hit = await tryReplay({ claim }, async () => ({ e: 0.005 }), verdictOf);
    ok("!! a cache hit RE-RUNS the physics", hit.verdict === REPLAY.HIT && hit.observable && hit.observable.e === 0.005,
       "this is not a memo table: a memo returns a stored RESULT, this returns a stored HYPOTHESIS and measures it again, so only the SEARCH is skipped");
    ok("...and reports that no inference happened", hit.inference === false,
       "the saving is the model call, and it has to be visible or it cannot be believed");
    ok("...and carries the real verdict object", !!(hit.roundhouseVerdict && hit.roundhouseVerdict.done),
       "graded by the SAME verifier a fresh run uses -- this module never decides whether something passed");
}

// ---- 2. A STALE ENTRY IS REJECTED, LOUDLY --------------------------------------------------------------------------
{
    const stale = await tryReplay({ claim }, async () => ({ e: 0.9 }), verdictOf);
    ok("!! a cached claim that no longer crystallises is REJECTED", stale.verdict === REPLAY.REJECTED,
       "measured 0.9 against a max of 0.01 -- the stored answer stopped working");
    ok("...and falls through to the model", stale.inference === true,
       "self-healing: the cache says it cannot help, rather than saying nothing is wrong");
    ok("!! ...and says so in words", /must never report success/i.test(stale.why || ""),
       "a silently-wrong cache is the single most expensive failure available here");
    ok("the observable that rejected it is carried", stale.observable && stale.observable.e === 0.9,
       "so a reader can see WHY it was rejected rather than trusting the verdict");
}

// ---- 3. IT REFUSES WHAT IT CANNOT USE ---------------------------------------------------------------------------------
{
    const threw = await tryReplay({ claim }, async () => { throw new Error("boom"); }, verdictOf);
    ok("!! a claim that cannot even be RUN is not a pass", threw.verdict === REPLAY.REJECTED && threw.inference === true,
       "an exception during re-measurement is the clearest possible signal that the cache is not usable");
    ok("no entry is a MISS, distinct from a rejection", (await tryReplay(null, async () => ({}), verdictOf)).verdict === REPLAY.MISS,
       "never having cached is a different fact from having cached something that broke");
    ok("a malformed entry is UNUSABLE, not silently skipped",
       (await tryReplay({}, async () => ({}), verdictOf)).verdict === REPLAY.UNUSABLE);
    ok("...and says why guessing would be wrong", /inventing a hypothesis nobody proposed/i.test(
       (await tryReplay({}, async () => ({}), verdictOf)).why || ""));
    ok("all four verdicts are distinct", new Set(Object.values(REPLAY)).size === 4);
}

// ---- 4. THE KEY CONTAINS WHAT CHANGES THE ANSWER, AND NOTHING THAT DOES NOT --------------------------------------------
{
    ok("the key is stable across whitespace", cacheKey({ device: "d", question: "q" }) === cacheKey({ device: "d", question: " q " }));
    ok("!! ...and differs by DEVICE", cacheKey({ device: "d", question: "q" }) !== cacheKey({ device: "e", question: "q" }),
       "the same question on a different device is a different question");
    ok("...and by MODE", cacheKey({ device: "d", question: "q", mode: "a" }) !== cacheKey({ device: "d", question: "q", mode: "b" }));
    ok("...and by ENGINE VERSION", cacheKey({ device: "d", question: "q", engineVersion: "v1" }) !== cacheKey({ device: "d", question: "q", engineVersion: "v2" }),
       "the physics can change under a cached claim, and a key that ignored the build would hide exactly that");
    ok("an incomplete key is refused", cacheKey({ device: "d" }) === null && cacheKey({}) === null);
}

// ---- 5. ONLY A CRYSTALLISED RUN IS WORTH REMEMBERING, and the saving is measured not claimed ---------------------------
{
    ok("!! a run that did NOT crystallise is not cached", entryFrom({ crystallized: false, claim }) === null,
       "storing a claim the physics rejected would guarantee a stale hit on every future run");
    ok("a crystallised run is", !!entryFrom({ crystallized: true, claim, rounds: 3 }));
    const s = savings([{ verdict: REPLAY.HIT, inference: false }, { verdict: REPLAY.REJECTED, inference: true }, { verdict: REPLAY.MISS, inference: true }]);
    ok("!! the saving is REPORTED, not assumed", s.hits === 1 && s.inferenceRuns === 2 && Math.abs(s.hitRate - 1 / 3) < 1e-9,
       s.note + " -- a cache that claims a hit rate without counting is the same class of decoration as a control that cannot fail");
    ok("the module states it is not a memo table", /not a memo table/i.test(src),
       "the distinction is the whole safety argument and belongs in the file, not only in a gate");
}

console.log(fails ? "\nactionCache-selfcheck: " + fails + " FAILED" : "\nactionCache-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
