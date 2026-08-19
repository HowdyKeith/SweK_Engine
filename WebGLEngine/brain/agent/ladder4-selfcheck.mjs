// brain/agent/ladder4-selfcheck.mjs
//
// Run: node brain/agent/ladder4-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The async ladder: the bandit now chooses among FOUR tactics -- rush, flank, hold, and the per-tick flow field solved by
// the GPU brain's own solver. The brain is on the menu, and the bandit evaluates it fairly rather than being told to use
// it. The checks are deliberately robust: which tactic wins shifts with how many episodes run (flow leads early, flank
// overtakes with more data), so the gate does NOT hardcode a winner. It asserts what must hold regardless: the run
// replays bit-identically, the learned arm beats every baseline, every tactic including flow is genuinely tried, the
// bandit commits to whichever tactic it valued highest, and it improves across the run. The sabotage makes the bandit
// pick at random instead of exploiting its value estimates -- it never commits to its best tactic, so the convergence
// check fails, because exploiting what it has learned is the whole point of a bandit.
import { runLadderAsync, sum, mean } from "./arena.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SEED = 12345, M = 160;
const run = await runLadderAsync(SEED, M);
const tot = {}; for (const k of Object.keys(run.arms)) tot[k] = sum(run.arms[k]);

// ---- 1. DETERMINISTIC (async, but seeded) ----------------------------------------------------------
{
    const b = await runLadderAsync(SEED, M);
    ok("!! the async four-tactic ladder replays bit-identically from a seed", JSON.stringify(run) === JSON.stringify(b),
       "same seed, same arenas, same flow solves, same bandit picks -- async does not cost reproducibility, so it can be gated.");
}

// ---- 2. ONCE LEARNED, THE AGENT BEATS EVERY BASELINE -----------------------------------------------
{
    const q = Math.floor(M / 4);
    const lateLearned = mean(run.arms.learned.slice(-q));
    const beats = lateLearned > mean(run.arms.reflex) && mean(run.arms.reflex) > mean(run.arms.greedy) && mean(run.arms.greedy) > mean(run.arms.random);
    ok("!! once converged, the learner beats reflex > greedy > random", beats,
       "the learned arm's late average is " + lateLearned.toFixed(1) + " against reflex " + mean(run.arms.reflex).toFixed(1) + ", greedy " + mean(run.arms.greedy).toFixed(1) + ", random " + mean(run.arms.random).toFixed(1) + " -- compared after it has learned, since the total also pays for exploring four tactics.");
}

// ---- 3. THE BRAIN'S FLOW IS GENUINELY ON THE MENU --------------------------------------------------
{
    ok("!! every tactic including the brain's flow field is actually tried", Object.values(run.counts).every((c) => c > 0) && run.counts.flow > 0,
       "picks " + JSON.stringify(run.counts) + " -- flow is evaluated fairly against the hand tactics, not ignored and not blindly trusted.");
}

// ---- 4. THE BANDIT COMMITS TO WHAT IT VALUED HIGHEST ------------------------------------------------
{
    const bestQ = Object.keys(run.Q).reduce((b, k) => run.Q[k] > run.Q[b] ? k : b);
    const mostPicked = Object.keys(run.counts).reduce((b, k) => run.counts[k] > run.counts[b] ? k : b);
    ok("!! it commits to the tactic it valued highest (whichever that is)", bestQ === mostPicked,
       "highest Q and most-picked are both '" + bestQ + "' -- it exploits its best estimate. The winner shifts with episode count, which is why the gate checks convergence, not a fixed name.");
}

// ---- 5. IT LEARNS ----------------------------------------------------------------------------------
{
    const q = Math.floor(M / 4), early = mean(run.arms.learned.slice(0, q)), late = mean(run.arms.learned.slice(-q));
    ok("!! the learner improves across the run", late > early + 5,
       "learned reward climbs from " + early.toFixed(1) + " to " + late.toFixed(1) + " as it settles on its best tactic.");
}

console.log(fails ? "\nladder4-selfcheck: " + fails + " FAILED" : "\nladder4-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
