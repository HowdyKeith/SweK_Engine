// tools/roundhouse/roundhouse.mjs
//
// The roundhouse: a proposer/builder/evaluator loop that crystallizes on a measured observable, not on two models
// agreeing. The whole point of the pattern -- and the thing that separates it from an echo chamber -- is that the exit
// condition is a physics check. The evaluator is allowed to interpret and to steer the next proposal, but it is NOT the
// stopping oracle; the loop stops only when the number the simulation actually produced satisfies the claim. Wire an
// agreeable evaluator to it and it still will not crystallize until the sim says so.
//
// The model-calling seam is injectable, exactly like shedOnset's engine seams: a mock caller drives the gate in
// milliseconds, and the real Anthropic SDK drives it on the rig. The builder is never a model -- it runs the bound
// simulation and returns measured numbers.

import { runOnce, autoBracket, findOnset, defaultConfig } from "./shedOnset.mjs";

// ---- BUILD: turn a proposed hypothesis into a real simulation result. No model here -- just the sim. --------------
export function build(makeLBM, hyp, base = {}) {
    const cfg = { ...base, ...(hyp.config || {}) };
    if (hyp.mode === "single") return { kind: "single", ...runOnce(makeLBM, defaultConfig({ ...cfg, g: hyp.g })) };
    if (hyp.mode === "onset") {
        const br = autoBracket(makeLBM, { base: cfg });
        if (!br.ok) return { kind: "onset", error: br.reason };
        const on = findOnset(makeLBM, { gLo: br.gLo, gHi: br.gHi, base: cfg });
        return { kind: "onset", ...on };
    }
    return { error: "unknown-mode: " + hyp.mode };
}

// ---- CRYSTALLIZATION: the exit condition. A numeric check on the MEASURED observable against the claim. ----------
// This function never sees the evaluator's opinion. That is the anti-echo-chamber, in one place.
export function crystallized(hyp, obs) {
    const claim = hyp.claim || {};
    if (obs.error) return { done: false, reason: obs.error };
    if (claim.observable === "sheds") { const got = !!obs.sheds; return { done: got === claim.equals, measured: got, claimed: claim.equals }; }
    if (claim.observable === "reCritical") {
        const width = obs.reBracket ? Math.abs(obs.reBracket[1] - obs.reBracket[0]) : Infinity;
        return { done: !!obs.ok && width <= (claim.withinBracket || 1.0), measured: obs.reCritical, bracketWidth: width };
    }
    if (claim.observable === "reMeasured") { const d = Math.abs((obs.reMeasured || 0) - claim.target); return { done: d <= (claim.tol || 1.0), measured: obs.reMeasured, target: claim.target }; }
    return { done: false, reason: "no-measurable-claim" };
}

// ---- THE LOOP. propose -> build (real sim) -> crystallization check (physics) -> evaluate (interpret) -> repeat. --
export async function roundhouse({ callModel, makeLBM, question, maxRounds = 6, base = {} }) {
    const history = [];
    for (let round = 0; round < maxRounds; round++) {
        const hyp = await callModel("proposer", { question, history });          // 1. a falsifiable claim + parameters
        const observable = build(makeLBM, hyp, base);                            // 2. run the real sim -- measured numbers
        const verdict = crystallized(hyp, observable);                           // 3. PHYSICS decides the exit, not the model
        const critique = await callModel("evaluator", { hyp, observable, verdict });  // 4. evaluator interprets / steers next
        history.push({ round, hyp, observable, verdict, critique });
        if (verdict.done) return { crystallized: true, rounds: round + 1, claim: hyp.claim, verdict, observable, history };
    }
    return { crystallized: false, reason: "maxRounds-without-crystallizing", rounds: maxRounds, history };
}

// ---- RIG SEAM: the real model caller, using the Anthropic SDK. Documented; runs on the machine with an API key. ---
// Usage on the rig:
//   import Anthropic from "@anthropic-ai/sdk";
//   const client = new Anthropic();
//   const caller = anthropicCaller(client, "claude-sonnet-5");
//   const result = await roundhouse({ callModel: caller, makeLBM, question, base });
export const PROPOSER_SYS =
    "You are the PROPOSER in an automated fluid-dynamics experiment. State ONE falsifiable claim about a MEASURABLE " +
    "observable the LBM lab exposes (sheds, reCritical, reMeasured, strouhal), and the run parameters to test it. " +
    "Respond ONLY with JSON: {mode:'single'|'onset', g?, config?, claim:{observable, equals?|target?|withinBracket?|tol?}}. " +
    "You may not answer from priors -- the simulation decides. Use the history to refine toward a decisive run.";
export const EVALUATOR_SYS =
    "You are the EVALUATOR. You are shown a proposed claim and the MEASURED observable the simulation produced, plus a " +
    "physics verdict already computed from the numbers. Do NOT overrule the verdict; interpret it and suggest the next " +
    "parameters. Respond ONLY with JSON: {reading:string, suggestNext?:object}.";

export function anthropicCaller(client, model = "claude-sonnet-5") {
    const sys = { proposer: PROPOSER_SYS, evaluator: EVALUATOR_SYS };
    return async (role, payload) => {
        const r = await client.messages.create({ model, system: sys[role], max_tokens: 1024, messages: [{ role: "user", content: JSON.stringify(payload) }] });
        const text = (r.content.find((b) => b.type === "text") || {}).text || "{}";
        const m = text.match(/\{[\s\S]*\}/);
        return JSON.parse(m ? m[0] : "{}");
    };
}
