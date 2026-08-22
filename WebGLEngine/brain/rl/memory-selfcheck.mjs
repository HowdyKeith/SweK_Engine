// headless: a cue is shown then blanked; only a policy WITH memory can recall it at the end.
import { MemoryPolicy, RememberEnv, esTrain } from "./memoryPolicy.js";
import { FlightPolicy } from "./dockPolicy.js";

function rollout(policy, K = 14) {
    let err = 0;
    for (let e = 0; e < K; e++) { if (policy.reset) policy.reset(); const env = new RememberEnv({}); let o = env.reset(700 + e), a = [0];
        for (let t = 0; t < env.maxSteps; t++) { a = policy.act(o); const r = env.step(a); o = r.obs; if (r.done) { err += r.recallErr; break; } } }
    return -err / K;   // maximize -> minimize recall error
}
// average |cue| is ~0.5, so a policy that can't remember is stuck near that error
const memoryless = new FlightPolicy({ obsDim: 1, actDim: 1, hidden: [16, 16], seed: 2 });
const memory = new MemoryPolicy(1, 1, { slots: 4, slotDim: 4, hidden: 16, seed: 2 });

const mlErr = -esTrain(memoryless, rollout, { iters: 55, pop: 20, seed: 4 });
const memErr = -esTrain(memory, rollout, { iters: 55, pop: 20, seed: 4 });
console.log("recall error after training (0 = perfect memory, ~0.5 = can't remember):");
console.log("  memoryless reflex policy: " + mlErr.toFixed(3));
console.log("  4-page memory policy:     " + memErr.toFixed(3));
console.log("result: " + (memErr < mlErr * 0.5 && memErr < 0.2 ? "MEMORY WORKS: the 4-page policy remembers the cue through the blank; the reflex policy cannot" : "check"));
