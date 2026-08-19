// tools/roundhouse/skillCodeTrial-selfcheck.mjs
//
// Run: node tools/roundhouse/skillCodeTrial-selfcheck.mjs
//
// v3711. The dangerous object is the RUBBER STAMP: a trial that returns PROVEN for a skill measured against a
// producer that could not have said anything else. Section 2 is the whole point of the file.

import { codeTrial, replicatesAgree, runArm, rateFor, TRIAL_STATES, MIN_QUESTIONS } from "./skillCodeTrial.mjs";
import { runSkillAsync, runSkill } from "./skillCode.mjs";
import { labBook, LAB_SKILLS } from "./labSkills.mjs";
import { proofStrength } from "./skillbook.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const book = labBook();
const QS = Array.from({ length: 40 }, (_, i) => ({ device: "blackhole", mode: "neutronstar", observable: "rsKm", i }));
const MATCH = /needs a "tol"/;
const ISSUE = 'A "target" needs a "tol" beside it, or the claim can never be satisfied.';

// ---- 1. THE SKILLS ARE REAL: THEY RUN THE DEVICE --------------------------------------------------------------
{
    const r = await runSkillAsync(book, "tolFor", { device: "blackhole", mode: "neutronstar", observable: "rsKm" });
    ok("!! tolFor BUILDS THE DEVICE and derives a tolerance from the measured value",
        r.state === "ran" && r.value && r.value.value > 0 && r.value.suggestedTol === 0.1,
        `rsKm ${r.value && r.value.value} -> magnitude ${r.value && r.value.magnitude} -> tol ${r.value && r.value.suggestedTol}` +
        " -- a hint string fixed at authoring time cannot measure this, which is why the skill is code");

    const absent = await runSkillAsync(book, "tolFor", { device: "blackhole", mode: "neutronstar", observable: "notAnObservable" });
    ok("!! an observable the device does not have yields null, not a guessed scale",
        absent.state === "ran" && absent.value === null, "ABSENT IS NOT A NUMBER");

    const noDev = await runSkillAsync(book, "tolFor", { device: "notADevice", mode: "x", observable: "y" });
    ok("a device that is not in the registry yields null", noDev.state === "ran" && noDev.value === null);
}

// ---- 2. *** THE RUBBER STAMP: A DETERMINISTIC PRODUCER MUST NOT YIELD A CERTIFICATION *** ----------------------
// MEASURED through the real statistics before this file existed: before 1 -> after 0 gives z = 8.94 at n = 40
// and 6.32 at n = 20, PROVEN both times, while a real 0.60 -> 0.35 effect is UNDERPOWERED at n = 40. The bars
// assume a producer that VARIES. WHEN THIS SECTION GOES RED the fix is a producer that varies -- NEVER a flag
// that skips the replicate comparison.
{
    const fixed = async (q, ctx) => ({ issues: ctx ? [] : [ISSUE] });
    const t = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: fixed, match: MATCH });
    ok("!! a PERFECT skill against a producer that cannot vary is MIRROR, not PROVEN",
        t.state === "MIRROR" && t.degenerate === true && t.evidence === undefined,
        "this producer goes 1.000 -> 0.000, which would score z = " + proofStrength({ before: 1, after: 0, n: 40 }).toFixed(2) +
        " and certify on the first run");

    // THE PUNCHLINE, AND IT IS ABOUT THIS TREE: the fixture caller in skillbook-selfcheck -- the ONLY trial ever
    // run here -- is deterministic in exactly this way. Its shape is reproduced (NOT imported: importing a
    // selfcheck's internals would couple two gates), and it too is a MIRROR.
    const skillbookShape = async (q, ctx) => {
        const forgets = ctx ? (q.i % 20 === 0) : (q.i % 3 !== 0);
        return { issues: forgets ? [ISSUE] : [] };
    };
    const s = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: skillbookShape, match: MATCH });
    ok("!! the hand-written fixture shape every trial in this tree has used is ALSO a MIRROR",
        s.state === "MIRROR",
        "an effect written by hand and then measured is arithmetic, not evidence -- the number was never in doubt");

    ok("MIRROR is one of the declared states and PROVEN is not reachable from a degenerate run",
        TRIAL_STATES.includes("MIRROR") && t.state !== "PROVEN");
}

// ---- 3. A PRODUCER THAT VARIES GETS A REAL VERDICT -------------------------------------------------------------
{
    const mk = (seed, pCtl, pTrt) => { let s = seed; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
        return async (q, ctx) => ({ issues: rnd() < (ctx ? pTrt : pCtl) ? [ISSUE] : [] }); };

    const big = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: mk(7, 0.70, 0.25), match: MATCH });
    ok("!! a large effect against a varying producer is measured, with both control replicates recorded",
        big.state === "PROVEN" && big.evidence.arms.controlA === 40 && big.evidence.arms.controlB === 40 && big.evidence.arms.treated === 40,
        `${big.evidence.before.toFixed(3)} -> ${big.evidence.after.toFixed(3)}, z ${big.z.toFixed(2)} vs ${big.zMin}`);

    const none = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: mk(11, 0.50, 0.50), match: MATCH });
    ok("!! a skill that changes nothing is NOT rounded up",
        none.state === "RETIRED" || none.state === "UNDERPOWERED",
        `${none.evidence.before.toFixed(3)} -> ${none.evidence.after.toFixed(3)} -> ${none.state}` +
        " -- a null result keeps its numbers rather than being deleted");

    const small = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: mk(3, 0.60, 0.45), match: MATCH });
    ok("UNDERPOWERED, when it happens, says how many runs would decide",
        small.state !== "UNDERPOWERED" || (typeof small.needN === "number" && small.needN > 0),
        small.state + (small.needN ? ", needs n = " + small.needN : ""));
}

// ---- 4. THE ARMS ARE MATCHED, AND THE BARS ARE NOT RE-TYPED ---------------------------------------------------
{
    let calls = 0;
    const counting = async (q, ctx) => { calls++; return { issues: Math.random() < (ctx ? 0.3 : 0.7) ? [ISSUE] : [] }; };
    const r = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: counting, match: MATCH });
    ok("!! every arm calls the producer the same number of times",
        calls === QS.length * 3 && r.ok,
        `${calls} calls over 3 arms of ${QS.length} -- an intervention shaped as "ask again" beats one ask BY CONSTRUCTION, so an unmatched count would measure RETRYING`);

    const short = await codeTrial({ book, skill: book.get("tolFor"), questions: QS.slice(0, 5), attempt: counting, match: MATCH });
    ok("fewer than the minimum questions refuses rather than reporting a rate",
        short.ok === false && short.state === "PROPOSED" && /rumour/.test(short.why), "MIN_QUESTIONS " + MIN_QUESTIONS);

    const noMatch = await codeTrial({ book, skill: book.get("tolFor"), questions: QS, attempt: counting });
    ok("!! a trial with no named outcome refuses instead of falling back on 'it ran'",
        noMatch.ok === false && /it ran/.test(noMatch.why));
}

// ---- 5. *** THE v3710 DEFECT THIS ROUND FOUND: AN ASYNC BODY'S FAILURE ARRIVED AFTER runSkill RETURNED *** -----
// Measured: `async () => { throw }` came back state "ran" with a rejected promise as its value. That is exactly
// "the code did not throw", in the file written to refuse it. WHEN THIS GOES RED the fix is to call
// runSkillAsync -- never to let a thenable through the sync runner.
{
    const { makeCodeSkill, codeBook } = await import("./skillCode.mjs");
    const boom = codeBook([makeCodeSkill({ id: "boom", trigger: "malformed", run: async () => { throw new Error("async failure"); } })]);
    const sync = runSkill(boom, "boom", 1);
    ok("!! the sync runner REFUSES a promise instead of reporting 'ran' over a rejection",
        sync.state === "threw" && /returned a promise/.test(sync.error), "found by the first real skill that needed an await");

    const asy = await runSkillAsync(boom, "boom", 1);
    ok("!! the async runner sees the rejection as a threw", asy.state === "threw" && /async failure/.test(asy.error));

    const composed = await runSkillAsync(book, "tolFor", { device: "blackhole", mode: "neutronstar", observable: "escapeFrac" });
    ok("an async skill composes a sync one through the awaited ctx.call",
        composed.state === "ran" && composed.value.magnitude === -1 && composed.value.suggestedTol === 0.01,
        "escapeFrac 0.613 -> magnitude -1 -> tol 0.01; an UNAWAITED ctx.call silently yields NaN and nothing else complains");
}

// ---- 6. NOTHING HERE CERTIFIES ANYTHING ON DISK ----------------------------------------------------------------
{
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    ok("!! no skill has been written to a book on disk by this round",
        !fs.existsSync(path.join(HERE, "skillbook.json")),
        "PROPOSED is the honest state until a REAL producer runs -- ollamaCaller is localhost and there is no model here");
    ok("both lab skills are exported and neither claims a state", LAB_SKILLS.length === 2 && LAB_SKILLS.every((s) => !("state" in s)));
}

console.log();
if (fails) { console.log("skillCodeTrial-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("skillCodeTrial-selfcheck: all checks pass");
