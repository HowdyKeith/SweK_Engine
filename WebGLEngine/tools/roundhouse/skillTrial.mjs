// WebGLEngine/tools/roundhouse/skillTrial.mjs — v3395
// ---------------------------------------------------------------------------------------------------------------
// THE TRIAL: WHERE "SHOWN TO CHANGE AN OUTCOME" STOPS BEING A PROMISE.
//
// skillbook.mjs will not inject a strategy until its evidence says it lowers the malformed rate for its trigger.
// This produces that evidence, and it is deliberately the least clever file in the pair: a control arm, a
// treatment arm, the SAME caller and the SAME questions in both, and a rate difference.
//
// *** THE CONTROL ARM IS THE ENTIRE POINT AND IS THE THING ACE HAS NOT GOT. *** A Reflector that mines traces
// for "what worked" sees only the runs that happened. If the model got better between Tuesday and Thursday, the
// strategy added on Wednesday takes the credit, and nothing in the design can tell that apart from the strategy
// working. Running both arms against the same questions in the same session is what makes the difference
// attributable, and it costs exactly one extra run per trial.
//
// THREE THINGS THIS REFUSES TO DO:
//   IT WILL NOT TRIAL AGAINST REFUSED. modelBench: a REFUSED claim is well-formed and wrong, and "only a better
//   model fixes this". A hint that appeared to reduce refusals would be teaching the model to guess luckier,
//   which is not a skill and cannot be verified.
//   IT WILL NOT ACCEPT A ONE-ARM TRIAL. Without a control the number is a before-and-after across time, and this
//   tree has already been bitten by exactly that shape (the v3278 lag samples read as growth because nobody
//   computed the windowed rate).
//   IT WILL NOT ROUND A NULL RESULT UP. A trial that shows no movement RETIRES the strategy, and a retired
//   strategy stays in the book with its numbers attached, because "we tried this and it did nothing" is a result
//   the next person should not have to rediscover.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { triggerOf, evidenceIsSound, MIN_IMPROVEMENT, deriveState } from "./skillbook.mjs";

/**
 * Run one arm. `attempt` is a function (question, hints) -> { issues: string[] } describing what the critic said
 * about the model's claim. Injected so the trial can run against a real caller on a rig, or against a recorded
 * fixture here, without this file knowing which.
 */
export async function runArm({ questions, attempt, hints = [] }) {
    const rows = [];
    for (const q of questions) {
        const r = await attempt(q, hints);
        const issues = (r && r.issues) || [];
        rows.push({ question: q, issues, triggers: issues.map(triggerOf).filter(Boolean) });
    }
    return rows;
}

/** Malformed rate for ONE trigger: the fraction of questions whose critique named it. */
export function rateFor(rows, trigger) {
    if (!rows.length) return 0;
    return rows.filter((r) => r.triggers.includes(trigger)).length / rows.length;
}

/**
 * A two-arm trial for one strategy. Returns evidence in the exact shape skillbook.deriveState expects, so there
 * is no translation step in which a number could quietly change meaning.
 */
export async function trial({ strategy, questions, attempt }) {
    if (!questions || questions.length < 20) {
        return { ok: false, why: `a trial needs at least 20 questions; got ${questions ? questions.length : 0}. A rate from a handful of runs is a rumour.` };
    }
    const control = await runArm({ questions, attempt, hints: [] });
    const treated = await runArm({ questions, attempt, hints: [strategy.hint] });
    const before = rateFor(control, strategy.trigger);
    const after = rateFor(treated, strategy.trigger);
    const evidence = { before, after, n: questions.length, measuredAt: new Date().toISOString(),
                       arms: { control: control.length, treated: treated.length } };
    const sound = evidenceIsSound(evidence);
    const verdict = deriveState({ ...strategy, evidence });
    return { ok: true, evidence, sound, state: verdict.state, why: verdict.why,
             drop: before - after, bar: MIN_IMPROVEMENT };
}

/**
 * Trial a whole book. Returns the strategies with evidence attached, ready to save -- INCLUDING the ones that
 * failed, which stay with their numbers rather than being deleted.
 */
export async function trialAll({ strategies, questions, attempt }) {
    const out = [];
    for (const s of strategies) {
        const t = await trial({ strategy: s, questions, attempt });
        out.push(t.ok ? { ...s, evidence: t.evidence } : { ...s, evidence: null, trialError: t.why });
    }
    return out;
}
