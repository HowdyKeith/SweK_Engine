// headless: memory vs reflex on hunting a target through an asteroid's shadow. Memory should win: it remembers the
// target's heading while it's hidden and keeps leading it.
import { MemoryPolicy, esTrain } from "./memoryPolicy.js";
import { FlightPolicy } from "./dockPolicy.js";
import { OccludedHuntEnv } from "./occludedHuntEnv.js";
import { runTaxonomy, compare } from "./occlusionTaxonomy.js";   // v2851 -- the split a catch rate cannot make

function rollout(policy, K = 8) {
    let ret = 0;
    for (let e = 0; e < K; e++) { if (policy.reset) policy.reset(); const env = new OccludedHuntEnv({}); let o = env.reset(400 + e), a = [0, 0], tot = 0;
        for (let t = 0; t < env.maxSteps; t++) { a = policy.act(o); const r = env.step(a); tot += r.reward; o = r.obs; if (r.done) break; } ret += tot; }
    return ret / K;
}
function catchRate(policy, K = 40) {
    let c = 0;
    for (let e = 0; e < K; e++) { if (policy.reset) policy.reset(); const env = new OccludedHuntEnv({}); let o = env.reset(9000 + e);
        for (let t = 0; t < env.maxSteps; t++) { const r = env.step(policy.act(o)); o = r.obs; if (r.done) { if (r.info.caught) c++; break; } } }
    return c / K;
}
const reflex = new FlightPolicy({ obsDim: 8, actDim: 2, hidden: [16, 16], seed: 2 });
const memory = new MemoryPolicy(8, 2, { slots: 4, slotDim: 4, hidden: 16, seed: 2 });
esTrain(reflex, rollout, { iters: 40, pop: 16, seed: 4 });
esTrain(memory, rollout, { iters: 40, pop: 16, seed: 4 });
const rRate = catchRate(reflex), mRate = catchRate(memory);
console.log("hunt-through-occlusion catch rate:");
console.log("  reflex (memoryless) policy: " + (rRate * 100).toFixed(0) + "%");
console.log("  4-page MEMORY policy:       " + (mRate * 100).toFixed(0) + "%");
console.log("result: " + (mRate > rRate + 0.12 ? "MEMORY WINS: it tracks the target through the asteroid's shadow -- a concrete combat payoff" : "check (memory " + (mRate * 100).toFixed(0) + " vs reflex " + (rRate * 100).toFixed(0) + ")"));

// v2851 -- THE SAME COMPARISON, SPLIT BY FAILURE MODE.
//
// Everything above is a catch rate, and a catch rate could not explain why this gate and
// occlusion-bptt-selfcheck point in OPPOSITE directions. The split can: most episodes never engage the target at
// all even while it is VISIBLE, so the headline number was mostly measuring flying rather than memory. What
// memory is actually for is holding a track THROUGH the blackout, and that is reported separately below.
{
    const f = () => new OccludedHuntEnv({});
    const R = runTaxonomy({ envFactory: f, policy: reflex, episodes: 40 });
    const M = runTaxonomy({ envFactory: f, policy: memory, episodes: 40 });
    const pc = (x) => (x == null ? "n/a" : (100 * x).toFixed(0) + "%");
    console.log("");
    console.log("split by failure mode (v2851) -- 40 episodes each:");
    console.log("                caught  heldButMissed  lostInBlackout  neverEngaged");
    console.log("  reflex        " + pc(R.rates.caught).padStart(6) + pc(R.rates.heldButMissed).padStart(15) + pc(R.rates.lostInBlackout).padStart(16) + pc(R.rates.neverEngaged).padStart(14));
    console.log("  memory        " + pc(M.rates.caught).padStart(6) + pc(M.rates.heldButMissed).padStart(15) + pc(M.rates.lostInBlackout).padStart(16) + pc(M.rates.neverEngaged).padStart(14));
    console.log("  BLACKOUT HOLD RATE (what memory is FOR): reflex " + pc(R.blackoutHoldRate) + "  memory " + pc(M.blackoutHoldRate));
    const c = compare(R, M);
    if (c.tracksBetterButCannotConvert) console.log("  NOTE: memory holds its track better but does NOT convert it -- that points at the policy head, not the memory.");
    console.log("  (untrained policies: this is the INSTRUMENT, not a verdict on memory.)");
}
