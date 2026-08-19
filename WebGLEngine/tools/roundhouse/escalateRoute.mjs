// tools/roundhouse/escalateRoute.mjs
//
// Cheap -> verify -> escalate. The maturity move for the SweK agents (v2764): stop asking "which model is
// smartest" and instead route to THE CHEAPEST MODEL WHOSE OUTPUT SURVIVES A SweK CHECK. The adult in the room
// is not a bigger model -- it is the verifier, and SweK already has a wall of them (gates, fingerprints, measured
// observables). Inspired by Agent-as-a-Router (ACRouter, arXiv 2606.22902): try the cheap model, run a verifier,
// escalate to the strong one ONLY when the verifier fails.
//
// The verifier is LOAD-BEARING and injected. In the roundhouse it is a SweK gate: "does this proposed experiment's
// code pass its selfcheck?" or "does the measured observable match the truth we own?". `callModel` is the same
// injectable seam roundhouse.mjs already uses, so a mock drives this headless with no API key.
//
//
// v3108 -- A CONFIDENCE PRIOR, AND THE ASYMMETRY THAT MAKES IT SAFE.
//
// cactus-compute/cactus-hybrid ships on-device models that "know when they're wrong": every answer carries a
// confidence score for cloud handoff, and routing only 15-55% of queries out matches a much larger model. Real
// result -- but a confidence score is INFERENCE, not verification. It is the same thing frugon does: infer
// sufficiency because you have no way to know whether the answer was right. This router HAS a way. So confidence
// is admitted as a PRIOR and never as a verdict, and the rule is deliberately one-sided:
//
//     LOW CONFIDENCE MAY SKIP AHEAD.   HIGH CONFIDENCE BUYS NOTHING.
//
// The naive build is the mirror image -- "confident enough, skip the check" -- and that is precisely the frugon
// mistake with a local model attached. Here a low self-report is allowed to ESCALATE early (skipping a verify
// cycle on an answer the model itself doubts), because being wrong about that costs money and never correctness.
// A high self-report is allowed to do nothing at all: the gate still runs, and only the gate can accept. An
// answer is returned verified:true if and only if verify() said so.
//
// escalateRoute walks `chain` from cheap to strong, and returns the first model whose output the verifier accepts.
// If NOBODY passes, it does not pretend -- it returns the strongest attempt with verified:false and
// escalationExhausted:true, so the caller knows the answer is unverified rather than trusting it silently.

export async function escalateRoute({ task, chain, callModel, verify, confidenceOf = null, skipVerifyBelow = null }) {
    if (!Array.isArray(chain) || chain.length === 0) throw new Error("escalateRoute: chain must be a non-empty [cheap..strong]");
    if (typeof callModel !== "function") throw new Error("escalateRoute: callModel must be a function");
    if (typeof verify !== "function") throw new Error("escalateRoute: verify must be a function -- routing without a verifier is just guessing");

    const attempts = [];
    let lastOutput = null, lastModel = null;
    for (const model of chain) {
        const name = typeof model === "string" ? model : model.name;
        const cost = (typeof model === "object" && model.cost != null) ? model.cost : 1;
        const output = await callModel(name, task);
        lastOutput = output; lastModel = name;

        // v3108 -- THE PRIOR, and note what it is allowed to do. A low self-reported confidence may skip the
        // verify cycle and escalate immediately; it can never accept. There is no branch anywhere below in which
        // a high score reaches the `return verified: true` path without verify() having said so, which is the
        // whole difference between a router with a verifier and a router that infers sufficiency.
        let confidence = null, skippedVerify = false;
        if (typeof confidenceOf === "function") {
            try { const c = await confidenceOf(output, name, task); if (Number.isFinite(c)) confidence = c; } catch { confidence = null; }
        }
        const isLast = model === chain[chain.length - 1];
        if (confidence !== null && Number.isFinite(skipVerifyBelow) && confidence < skipVerifyBelow && !isLast) {
            // the model doubts itself and something stronger remains: escalate without paying for the gate.
            // Deliberately NOT done on the last model -- there is nothing to escalate to, so the only useful
            // thing left is to actually check the answer we have.
            skippedVerify = true;
            attempts.push({ model: name, cost, verified: false, confidence, skippedVerify: true });
            continue;
        }

        const pass = await verify(output, task, name);           // THE load-bearing line: consult the verifier
        attempts.push({ model: name, cost, verified: !!pass, confidence, skippedVerify });
        if (pass) {
            return {
                chosen: name, output, verified: true,
                escalations: attempts.length - 1,                // 0 = the cheapest model was enough
                totalCost: attempts.reduce((s, a) => s + a.cost, 0),
                attempts, escalationExhausted: false,
            };
        }
    }
    // Nobody's output survived the verifier. Return the strongest attempt, flagged honestly -- an unverified
    // answer labelled as such beats a verified-looking lie.
    return {
        chosen: lastModel, output: lastOutput, verified: false,
        escalations: attempts.length - 1,
        totalCost: attempts.reduce((s, a) => s + a.cost, 0),
        attempts, escalationExhausted: true,
    };
}

// Convenience: the money question -- what did routing SAVE vs always calling the strongest model?
export function savingsVsStrongest(result, chain) {
    const strongestCost = chain.reduce((mx, m) => Math.max(mx, (typeof m === "object" && m.cost != null) ? m.cost : 1), 0);
    return { spent: result.totalCost, ifAlwaysStrongest: strongestCost, saved: strongestCost - result.totalCost };
}
