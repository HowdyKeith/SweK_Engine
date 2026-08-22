// brain/agent/dispatch-selfcheck.mjs
//
// Run: node brain/agent/dispatch-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The orchestrator actually running the fleet. Each task is dispatched for real -- a genuine flow-field solve -- and the
// result comes back to be checked, so a dispatched answer is verifiable and not taken on faith. The scheduler learns each
// peer's speed from the time the work took and must beat both a naive round-robin dispatch and an identical dispatch that
// is denied the timing feedback -- because the whole point of running the fleet, rather than round-robining across it, is
// that the times you observe teach you where to send the next task. The sabotage cuts the feedback line: the scheduler
// stops learning from what it dispatched, and its makespan collapses to the frozen one, which is the proof that the
// learning loop -- dispatch, observe, route better -- is what does the work.
import { dispatchTasks, dispatchLearned, solveTaskWork } from "./dispatch.js";
import { makeTaskStream, schedRoundRobin } from "./fleet.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const nPeers = 5, nKinds = 4;
const speed = []; for (let p = 0; p < nPeers; p++) { const row = []; for (let k = 0; k < nKinds; k++) row.push(0.4); row[p % nKinds] = 2.2; speed.push(row); }
const makeSend = () => async (peer, task) => ({ result: solveTaskWork(task), solveMs: task.size / speed[peer][task.kind] });
const tasks = makeTaskStream(42, { nTasks: 120, nKinds });

const learned = await dispatchLearned(tasks, nPeers, nKinds, makeSend());

// ---- 1. IT DISPATCHES REAL WORK AND THE RESULTS COME BACK CORRECT ----------------------------------
{
    let correct = 0; for (let i = 0; i < tasks.length; i++) if (learned.results[i] === solveTaskWork(tasks[i])) correct++;
    ok("!! every dispatched task returns the correct, re-derivable result", correct === tasks.length,
       "all " + tasks.length + " results match a fresh solve of the same task -- real work went out and verifiable answers came back, not placeholders.");
}

// ---- 2. IT LEARNS FROM THE RETURNED TIMES (beats an identical dispatch denied the feedback) --------
{
    const frozen = await dispatchLearned(tasks, nPeers, nKinds, makeSend(), { learn: false });
    ok("!! learning from the times it observes beats an identical dispatch that cannot", learned.makespan < frozen.makespan * 0.9,
       "makespan " + learned.makespan.toFixed(1) + " against a feedback-blind dispatch's " + frozen.makespan.toFixed(1) + " -- the improvement is the loop learning where the fast peers are from what it dispatched.");
}

// ---- 3. IT BEATS A NAIVE ROUND-ROBIN DISPATCH ------------------------------------------------------
{
    const rr = await dispatchTasks(tasks, nPeers, makeSend(), schedRoundRobin({ nBrains: nPeers }));
    ok("!! the learned orchestrator finishes sooner than round-robining the work", learned.makespan < rr.makespan,
       "makespan " + learned.makespan.toFixed(1) + " to round-robin's " + rr.makespan.toFixed(1) + " -- routing on measured speed, not just taking turns.");
}

// ---- 4. DETERMINISTIC ------------------------------------------------------------------------------
{
    const again = await dispatchLearned(tasks, nPeers, nKinds, makeSend());
    ok("!! the dispatch replays identically for the same tasks and peers", again.makespan === learned.makespan && JSON.stringify(again.assign) === JSON.stringify(learned.assign),
       "same stream, same assignments, same makespan -- the orchestration is reproducible, so its win can be gated.");
}

console.log(fails ? "\ndispatch-selfcheck: " + fails + " FAILED" : "\ndispatch-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
