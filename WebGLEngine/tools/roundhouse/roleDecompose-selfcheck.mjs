// WebGLEngine/tools/roundhouse/roleDecompose-selfcheck.mjs -- v2789
//
// Run: node tools/roundhouse/roleDecompose-selfcheck.mjs
// GATES tools/roundhouse/roleDecompose.mjs -- proposer/critic decomposition. Proves: the roundtrip loops and
// captures role turns; the critic's feedback is LOAD-BEARING (a proposer that uses critiques improves, one that
// ignores them does not); an eager critic stops early; and crucially the SweK GATE overrides the critic -- a
// critic saying "ok" on a wrong candidate does NOT make it verified, so escalation still happens. Trace is
// replay/stats-compatible.

import { roleRoundtrip, recordDecomposedRoute, roleTurnCount } from "./roleDecompose.mjs";
import { replayRoute, traceStats } from "./agentTrace.mjs";
import { faceCountGate, makeFaceCountTask } from "./swekGates.mjs";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const task = makeFaceCountTask(2, 3, 4);              // truth = 2*(6+12+8) = 52
const TRUTH = faceCountGate({}, task).truth;

// proposer that IMPROVES with critiques: answer = truth - max(0, initErr - fix*critiques.length)
const improvingProposer = (initErr, fix) => async (t, critiques) => ({ faceCount: TRUTH - Math.max(0, initErr - fix * critiques.length) });
// proposer that IGNORES critiques (always the same wrong answer)
const stubbornProposer = (err) => async () => ({ faceCount: TRUTH - err });
// critics
const neverOkCritic = async () => ({ ok: false, issues: ["recount the edges"] });
const eagerCritic = async () => ({ ok: true, issues: [] });

// 1. roundtrip loops + captures role turns (proposer + critic each round)
{
    const { candidate, turns } = await roleRoundtrip({ task, propose: improvingProposer(6, 3), critique: neverOkCritic, maxRounds: 3 });
    ok("roundtrip: runs maxRounds when critic never satisfied (6 turns = 3x proposer+critic)", turns.length === 6);
    ok("roundtrip: turns alternate proposer/critic", turns[0].role === "proposer" && turns[1].role === "critic" && turns[4].role === "proposer");
    ok("roundtrip: proposer improved to truth using critiques (6 - 3*2 = 0 error by round 2)", candidate.faceCount === TRUTH, "final=" + candidate.faceCount);
}

// 2. CRITIC IS LOAD-BEARING: using critiques improves; ignoring them does not
{
    const used = (await roleRoundtrip({ task, propose: improvingProposer(6, 3), critique: neverOkCritic, maxRounds: 3 })).candidate.faceCount;
    const ignored = (await roleRoundtrip({ task, propose: stubbornProposer(6), critique: neverOkCritic, maxRounds: 3 })).candidate.faceCount;
    ok("critic feedback USED -> reaches truth", used === TRUTH);
    ok("SABOTAGE: proposer ignoring critiques stays wrong", ignored === TRUTH - 6 && ignored !== TRUTH);
}

// 3. eager critic stops the loop early (one round)
{
    const { turns } = await roleRoundtrip({ task, propose: improvingProposer(6, 3), critique: eagerCritic, maxRounds: 3 });
    ok("eager critic: loop stops after round 0 (2 turns)", turns.length === 2);
}

// 4. THE GATE OVERRIDES THE CRITIC: eager critic 'ok' on a wrong cheap answer still fails the SweK gate -> escalate
{
    const chain = [{ name: "cheap", cost: 1 }, { name: "strong", cost: 25 }];
    // cheap: eager critic approves its wrong answer (truth-6); strong: reaches truth
    const propose = (model, t, crits) => model === "cheap" ? stubbornProposer(6)(t, crits) : improvingProposer(6, 6)(t, crits);
    const critique = (model) => model === "cheap" ? eagerCritic() : neverOkCritic();
    const { result, trace } = await recordDecomposedRoute({ task, chain, propose, critique, runGate: faceCountGate, maxRounds: 2 });
    ok("gate>critic: cheap's critic-approved answer still fails the SweK gate", trace.steps[0].verified === false);
    ok("gate>critic: escalates to strong, which passes the gate", result.chosen === "strong" && result.verified === true);
    ok("decompose: trace records role turns per tier", trace.steps[0].roleTurns.length >= 2 && trace.steps[1].roleTurns.length >= 2 && roleTurnCount(trace) >= 4);
    ok("decompose: trace marked decomposed", trace.decomposed === true);
}

// 5. the decomposed trace is replay/stats-compatible (audit re-verifies final candidates)
{
    const chain = [{ name: "cheap", cost: 1 }, { name: "strong", cost: 25 }];
    const propose = (model, t, crits) => model === "cheap" ? stubbornProposer(4)(t, crits) : improvingProposer(4, 4)(t, crits);
    const critique = () => neverOkCritic();
    const { trace } = await recordDecomposedRoute({ task, chain, propose, critique, runGate: faceCountGate, maxRounds: 2 });
    const audit = await replayRoute(trace, { runGate: faceCountGate });
    ok("replay: decomposed trace re-verifies consistently", audit.consistent === true);
    const st = traceStats(trace);
    ok("stats: works on decomposed trace (2 steps, 1 escalation)", st.steps === 2 && st.escalations === 1);
    // tamper the final candidate -> replay catches it
    trace.steps[0].output = { faceCount: TRUTH };
    const audit2 = await replayRoute(trace, { runGate: faceCountGate });
    ok("SABOTAGE: tampering a decomposed step's candidate makes replay inconsistent", audit2.consistent === false);
}

// 6. determinism
{
    const chain = [{ name: "cheap", cost: 1 }, { name: "strong", cost: 25 }];
    const propose = (model, t, crits) => improvingProposer(model === "cheap" ? 10 : 4, model === "cheap" ? 2 : 4)(t, crits);
    const critique = () => neverOkCritic();
    const a = (await recordDecomposedRoute({ task, chain, propose, critique, runGate: faceCountGate, maxRounds: 2 })).trace;
    const b = (await recordDecomposedRoute({ task, chain, propose, critique, runGate: faceCountGate, maxRounds: 2 })).trace;
    ok("determinism: same decomposed route -> same step verdicts", JSON.stringify(a.steps.map(s => [s.model, s.verified])) === JSON.stringify(b.steps.map(s => [s.model, s.verified])));
}

console.log("roleDecompose-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
