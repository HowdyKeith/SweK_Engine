// brain/agent/arena-selfcheck.mjs
//
// Run: node brain/agent/arena-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The agent arena, held to the standard the command-center mockups never were. The engagement is deterministic, so the
// whole ladder replays bit-identically off a seed. Over the episodes the four policies must rank by competence -- random
// at the floor, greedy above it, the reactive reflex above that, and the learned bandit on top -- and the learner must
// actually LEARN, its late reward beating its early reward, by discovering that proactive flanking outscores both the
// naive dash and the hand reflex. A frozen bandit that cannot update must do worse than the learning one. The sabotage
// removes the value update, so the bandit can no longer tell a good tactic from a bad one -- the learning curve flattens
// and the discovery fails, because the learning is the whole point.
import { runLadder, makeBandit, sum, mean } from "./arena.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const SEED = 12345, M = 240;
const run = runLadder(SEED, M);
const tot = {}; for (const k of Object.keys(run.arms)) tot[k] = sum(run.arms[k]);

// ---- 1. THE ENGAGEMENT IS DETERMINISTIC ------------------------------------------------------------
{
    const a = runLadder(SEED, M), b = runLadder(SEED, M);
    ok("!! the whole ladder replays bit-identically from a seed", JSON.stringify(a) === JSON.stringify(b),
       "same seed, same arenas, same threat patrols, same reward for every arm and the same bandit picks -- the episodes are reproducible, so the result can be replayed and gated rather than narrated.");
}

// ---- 2. THE LEARNER BEATS EVERY BASELINE, IN ORDER -------------------------------------------------
{
    const ranked = tot.learned > tot.reflex && tot.reflex > tot.greedy && tot.greedy > tot.random;
    const margin = tot.learned - tot.reflex;
    ok("!! learned > reflex > greedy > random, and the learner's margin is real", ranked && margin > 1500,
       "totals over " + M + " episodes: random " + tot.random.toFixed(0) + ", greedy " + tot.greedy.toFixed(0) + ", reflex " + tot.reflex.toFixed(0) + ", learned " + tot.learned.toFixed(0) + " -- the learner clears the hand reflex by " + margin.toFixed(0) + ", measured, not asserted.");
}

// ---- 3. THE LEARNER ACTUALLY LEARNS ----------------------------------------------------------------
{
    const q = Math.floor(M / 4), early = mean(run.arms.learned.slice(0, q)), late = mean(run.arms.learned.slice(-q));
    ok("!! the learner improves over the run -- a learning curve, not a constant", late > early + 5,
       "learned reward rises from " + early.toFixed(1) + " early to " + late.toFixed(1) + " late as the bandit stops exploring and exploits what it found.");
}

// ---- 4. IT DISCOVERS THE WINNING TACTIC ------------------------------------------------------------
{
    const best = Object.keys(run.Q).reduce((b, k) => run.Q[k] > run.Q[b] ? k : b);
    ok("!! the bandit discovers that flanking wins and commits to it", best === "flank" && run.counts.flank > run.counts.rush + run.counts.hold,
       "it values flank at " + run.Q.flank.toFixed(0) + " against rush " + run.Q.rush.toFixed(0) + " (rushing gets you caught), and picks flank " + run.counts.flank + " of " + M + " times -- learned, not told.");
}

// ---- 5. LEARNING BEATS A FROZEN BANDIT -------------------------------------------------------------
{
    const frozen = runLadder(SEED, M, { bandit: { learn: false } });
    const fTot = sum(frozen.arms.learned);
    ok("!! a bandit that can learn outscores an identical one that cannot", tot.learned > fTot + 1000,
       "the learning arm scores " + tot.learned.toFixed(0) + " against a frozen bandit's " + fTot.toFixed(0) + " on the same seeds -- the improvement is the learning, not the arena being kind.");
}

console.log(fails ? "\narena-selfcheck: " + fails + " FAILED" : "\narena-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
