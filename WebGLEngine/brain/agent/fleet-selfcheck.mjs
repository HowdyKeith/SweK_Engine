// brain/agent/fleet-selfcheck.mjs
//
// Run: node brain/agent/fleet-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The fleet agent -- a learned scheduler -- held to the same standard as the single agent. The engagement is a task
// stream routed across brains with heterogeneous per-kind speeds, and the goal is the lowest makespan, the moment the
// last brain finishes. The learned scheduler must beat the naive ones in order (random, round-robin, greedy-load), it
// must actually SPECIALISE -- routing each kind to the brain that is genuinely fastest at it, far above chance -- and the
// learning must be load-bearing: an identical scheduler that cannot learn the speeds must do measurably worse. The
// sabotage removes the speed update, so the scheduler is stuck with a flat prior and collapses to plain load-balancing --
// it stops specialising and stops beating greedy, because learning who is fast at what is the entire point.
import { runFleetLadder, runFleet, makeFleet, makeTaskStream, schedLearned, schedGreedyLoad, fleetFromTelemetry, mean } from "./fleet.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SEEDS = []; for (let s = 0; s < 30; s++) SEEDS.push(1000 + s * 13);
const avg = (pick) => mean(SEEDS.map((s) => pick(runFleetLadder(s))));
const ms = { random: avg((r) => r.random.makespan), roundRobin: avg((r) => r.roundRobin.makespan), greedy: avg((r) => r.greedy.makespan), learned: avg((r) => r.learned.makespan) };

// ---- 1. DETERMINISTIC ------------------------------------------------------------------------------
{
    const a = runFleetLadder(1234), b = runFleetLadder(1234);
    ok("!! the whole fleet schedule replays bit-identically from a seed", JSON.stringify(a) === JSON.stringify(b),
       "same seed, same fleet, same task stream, same assignments and makespans -- the schedule is reproducible, so its win can be gated rather than claimed.");
}

// ---- 2. THE LEARNED SCHEDULER BEATS EVERY NAIVE ONE (lower makespan) --------------------------------
{
    const ranked = ms.learned < ms.greedy && ms.greedy < ms.roundRobin && ms.roundRobin < ms.random;
    const gain = (ms.greedy - ms.learned) / ms.greedy;
    ok("!! learned < greedy < round-robin < random makespan, with a real margin over greedy", ranked && gain > 0.1,
       "avg makespan: random " + ms.random.toFixed(1) + ", round-robin " + ms.roundRobin.toFixed(1) + ", greedy " + ms.greedy.toFixed(1) + ", learned " + ms.learned.toFixed(1) + " -- the learner clears load-balancing greedy by " + (gain * 100).toFixed(0) + "%, by routing on capability, not just queue length.");
}

// ---- 3. IT SPECIALISES: routes each kind to the brain that is genuinely fastest --------------------
{
    let match = 0, total = 0;
    for (const s of SEEDS) {
        const r = runFleetLadder(s);
        for (let k = 0; k < r.fleet.nKinds; k++) {
            let trueFast = 0; for (let b = 1; b < r.fleet.nBrains; b++) if (r.fleet.speed[b][k] > r.fleet.speed[trueFast][k]) trueFast = b;
            let estFast = 0; for (let b = 1; b < r.fleet.nBrains; b++) if (r.est[b][k] < r.est[estFast][k]) estFast = b;
            if (trueFast === estFast) match++; total++;
        }
    }
    const rate = match / total;
    ok("!! it learns which brain is fastest at each kind, far above chance", rate > 0.5,
       "it matches the true-fastest brain on " + match + " of " + total + " kinds (" + (rate * 100).toFixed(0) + "%), against a 1-in-5 chance -- it discovered the fleet's specialities from the times it observed.");
}

// ---- 4. THE LEARNING IS LOAD-BEARING: it beats an identical scheduler that cannot learn ------------
{
    let learnedMS = 0, frozenMS = 0;
    for (const s of SEEDS) {
        const fleet = makeFleet(s), tasks = makeTaskStream(s, { nKinds: fleet.nKinds });
        learnedMS += runFleet(fleet, tasks, schedLearned(fleet, {})).makespan;
        frozenMS += runFleet(fleet, tasks, schedLearned(fleet, { learn: false })).makespan;
    }
    ok("!! a scheduler that learns the speeds beats an identical one that cannot", learnedMS < frozenMS * 0.9,
       "learning makespan " + (learnedMS / SEEDS.length).toFixed(1) + " against a frozen scheduler's " + (frozenMS / SEEDS.length).toFixed(1) + " -- the improvement is the learning, not the fleet being easy.");
}

// ---- 5. IT SCHEDULES FROM REAL MEASURED TELEMETRY, NOT JUST SYNTHETIC SPEEDS ----------------------
{
    const sample = [
        { id: "a", kinds: ["nav", "physics"], solveMsEwma: 8 },
        { id: "b", kinds: ["render"], solveMsEwma: 12 },
        { id: "c", kinds: ["nav", "render"], solveMsEwma: 40 },
        { id: "d", kinds: ["physics"], solveMsEwma: 20 },
    ];
    const fleet = fleetFromTelemetry(sample);
    const tasks = makeTaskStream(42, { nKinds: fleet.nKinds });
    const learned = runFleet(fleet, tasks, schedLearned(fleet, {})).makespan;
    const greedy = runFleet(fleet, tasks, schedGreedyLoad(fleet)).makespan;
    const kindsOk = fleet.nBrains === 4 && fleet.kindNames.length === 3;
    ok("!! it builds a fleet from measured brain telemetry and still beats greedy", kindsOk && learned < greedy,
       "from four brains' reported solve-times and handled kinds it derives a real speed model and routes by it -- makespan " + learned.toFixed(1) + " to greedy's " + greedy.toFixed(1) + ". On the rig fetchFleetTelemetry pulls this live from /ai/brain/fleet, so the orchestrator schedules the actual fleet.");
}

console.log(fails ? "\nfleet-selfcheck: " + fails + " FAILED" : "\nfleet-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
