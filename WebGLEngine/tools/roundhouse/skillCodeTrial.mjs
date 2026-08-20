// tools/roundhouse/skillCodeTrial.mjs
//
// Run: node tools/roundhouse/skillCodeTrial.mjs        (front door: a reportingTools row)
// Gated by tools/roundhouse/skillCodeTrial-selfcheck.mjs.
//
// v3711 -- CERTIFYING A CODE SKILL, AND THE THING THAT HAD TO BE BUILT FIRST IS A REFUSAL.
//
// skillbook.trial certifies a HINT: its treatment arm is literally `hints: [strategy.hint]`, so it cannot take
// a skill whose body is a function. This file is the code-skill counterpart. IT DOES NOT REIMPLEMENT THE
// STATISTICS -- proofStrength, deriveState, evidenceIsSound and the bars are IMPORTED, because two spellings of
// one derivation is a defect this tree has found repeatedly, and the maths is the part that transfers. What does
// NOT transfer is the injection mechanism: the treatment here is that THE SKILL RAN and its output reached the
// producer as context.
//
// *** THE MEASUREMENT THAT SHAPED THIS FILE. Before writing a line I put degenerate arms through the real
// functions: before 1 -> after 0 returns z = 8.94 at n = 40 and 6.32 at n = 20 -- PROVEN both times -- while a
// genuinely useful stochastic effect (0.60 -> 0.35 at n = 40) comes back UNDERPOWERED. The statistics are
// calibrated for a producer that VARIES. Pointed at a function that always works they RUBBER-STAMP, and the
// first code skill would certify itself. ***
//
// SO THE PRODUCER IS TESTED, NOT ASSUMED. runControlTwice replays the control arm over the SAME questions and
// compares the per-question issue sets. If the two replicates are identical the producer cannot vary, the
// z-test's premise (both arms are Bernoulli samples) does not hold, and the trial reports MIRROR -- never
// PROVEN. Cost: one extra arm.
//
// *** MIRROR IS NOT "THE SKILL FAILED". *** It says the MEASUREMENT could not have been evidence: against a
// producer that returns the same thing every time, a rate difference restates the function's definition. A
// model pinned at temperature 0 is deterministic too, and gets the same verdict for the same reason -- the
// answer there is to vary the producer, not to widen this file.
//
// WHEN THE MIRROR CHECK GOES RED, the correct response is to find a producer that varies -- NEVER to relax the
// replicate comparison, and never to add a flag that skips it.

import { proofStrength, deriveState, evidenceIsSound, MIN_IMPROVEMENT, Z_MIN, requiredN } from "./skillbook.mjs";
import { runSkillAsync } from "./skillCode.mjs";

/** The complete set of verdicts this file can return. MIRROR is the one skillbook has no equivalent of. */
export const TRIAL_STATES = Object.freeze(["MIRROR", "PROVEN", "UNDERPOWERED", "RETIRED", "PROPOSED"]);

/** The minimum questions per arm. Same bar as skillbook: a rate from a handful of runs is a rumour. */
export const MIN_QUESTIONS = 20;

/** Run one arm. `attempt` is (question, context) -> { issues: string[] }; context is null in the control. */
export async function runArm({ questions, attempt, context = null }) {
    const rows = [];
    for (const q of questions) {
        const r = await attempt(q, context ? await context(q) : null);
        rows.push({ question: q, issues: ((r && r.issues) || []).slice() });
    }
    return rows;
}

/** Fraction of questions whose critique named this trigger's text. */
export function rateFor(rows, match) {
    if (!rows.length) return 0;
    const hit = (r) => r.issues.some((i) => match.test(i));
    return rows.filter(hit).length / rows.length;
}

/** Two control replicates, compared question by question. Identical => the producer cannot vary. */
export function replicatesAgree(a, b) {
    if (a.length !== b.length) return false;
    return a.every((row, i) =>
        row.question === b[i].question &&
        row.issues.length === b[i].issues.length &&
        row.issues.every((s, j) => s === b[i].issues[j]));
}

/**
 * Trial one code skill.
 *   skill     -- from makeCodeSkill, in `book`
 *   questions -- >= MIN_QUESTIONS of them
 *   attempt   -- (question, context) -> { issues }
 *   match     -- RegExp identifying the issue the skill is meant to reduce
 * BOTH ARMS CALL `attempt` THE SAME NUMBER OF TIMES. Any intervention shaped as "ask again with better
 * context" beats one ask BY CONSTRUCTION, so an unmatched call count would measure RETRYING, not the skill.
 */
export async function codeTrial({ book, skill, questions, attempt, match }) {
    if (!questions || questions.length < MIN_QUESTIONS) {
        return { ok: false, state: "PROPOSED", why: `a trial needs at least ${MIN_QUESTIONS} questions; got ${questions ? questions.length : 0}. A rate from a handful of runs is a rumour.` };
    }
    if (!match || typeof match.test !== "function") {
        return { ok: false, state: "PROPOSED", why: "a trial needs the issue pattern the skill is meant to reduce; without it there is no outcome to measure and 'it ran' would be the only thing left to report" };
    }

    // THE DEGENERACY TEST COMES FIRST so a mirror is never dressed in a z-score.
    const controlA = await runArm({ questions, attempt });
    const controlB = await runArm({ questions, attempt });
    if (replicatesAgree(controlA, controlB)) {
        return { ok: true, state: "MIRROR", degenerate: true,
                 why: "the control arm replayed IDENTICALLY over the same questions, so this producer cannot vary. "
                    + "A rate difference against it would restate the skill's definition rather than measure it: "
                    + "measured through the real statistics, a deterministic 1 -> 0 scores z = 8.94 at n = 40 and is "
                    + "called PROVEN. FIND A PRODUCER THAT VARIES -- a fixture caller, or a model pinned at "
                    + "temperature 0, is exactly what this refuses.",
                 arms: { controlA: controlA.length, controlB: controlB.length } };
    }

    // The treatment: the skill RUNS, and whatever it computed reaches the producer as context. Anything the
    // skill throws on yields NO context for that question rather than a substituted guess -- a skill that
    // failed must not look like a skill that had nothing to say.
    // ASYNC BY DEFAULT: a real skill reaches for something (labSkills.tolFor imports the device registry), and
    // the sync runner now refuses a promise by name rather than reporting "ran" over a rejection (v3711).
    const context = async (q) => {
        const r = await runSkillAsync(book, skill.id, q);
        return r.state === "ran" ? r.value : null;
    };
    const treated = await runArm({ questions, attempt, context });

    const before = (rateFor(controlA, match) + rateFor(controlB, match)) / 2;   // both replicates, not the luckier one
    const after = rateFor(treated, match);
    const evidence = { before, after, n: questions.length, measuredAt: new Date().toISOString(),
                       arms: { controlA: controlA.length, controlB: controlB.length, treated: treated.length } };
    const sound = evidenceIsSound(evidence);
    const verdict = deriveState({ evidence });
    return { ok: true, state: verdict.state, why: verdict.why, evidence, sound, degenerate: false,
             drop: before - after, z: proofStrength(evidence), bar: MIN_IMPROVEMENT, zMin: Z_MIN,
             needN: verdict.state === "UNDERPOWERED" ? requiredN(evidence) : null,
             notClaimed: "that the skill is worth keeping -- only that this measurement was taken against a producer that varies" };
}

// ---- front door ------------------------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
    const { LAB_SKILLS, labBook } = await import("./labSkills.mjs");
    const book = labBook();
    console.log("[skillCodeTrial] certifying a code skill -- and refusing to, when the producer cannot vary\n");
    console.log("  states:", TRIAL_STATES.join(" / "));
    console.log("  skills available:", LAB_SKILLS.map((s) => s.id).join(", "), "\n");

    const questions = Array.from({ length: 40 }, (_, i) => ({ device: "blackhole", mode: "neutronstar", observable: "rsKm", i }));
    const match = /needs a "tol"/;

    // (1) THE DETERMINISTIC PRODUCER -- the shape of every trial this tree has ever run.
    const fixed = async (q, ctx) => ({ issues: ctx ? [] : ['A "target" needs a "tol" beside it, or the claim can never be satisfied.'] });
    const a = await codeTrial({ book, skill: book.get("tolFor"), questions, attempt: fixed, match });
    console.log("  against a producer that CANNOT vary ->", a.state);
    console.log("   ", a.why.split(" -- ")[0]);

    // (2) A PRODUCER THAT VARIES. Still a fixture -- what it is NOT is a claim that the skill works.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const varying = async (q, ctx) => ({ issues: rnd() < (ctx ? 0.25 : 0.70) ? ['A "target" needs a "tol" beside it, or the claim can never be satisfied.'] : [] });
    const b = await codeTrial({ book, skill: book.get("tolFor"), questions, attempt: varying, match });
    console.log("\n  against a producer that VARIES ->", b.state,
        `(${b.evidence.before.toFixed(3)} -> ${b.evidence.after.toFixed(3)}, z = ${b.z.toFixed(2)} against ${b.zMin})`);
    console.log("    NOT CLAIMED:", b.notClaimed);
    console.log("\n  A FIXTURE PRODUCER IS STILL A FIXTURE: the number above is real arithmetic over a coin I wrote.");
    console.log("  The certification that counts needs a REAL MODEL, which is the rig -- ollamaCaller is localhost.");
}
