// brain/rl/memoryPolicy-selfcheck.mjs
//
// v3146 -- A RECURRENT POLICY THAT NOTHING TRAINS, AND THE ABLATION THAT PROVES IT WORKS.
//
// brain/rl/memoryPolicy.js is a controller with a grid of memory pages it reads and writes each step, so unlike
// the reflex MLP -- which is live, in policyPilot.mjs and blobBrain.js -- it can carry information across time.
// It has no gate and no caller. Fifth capability in five rounds found finished and unwired.
//
// IT SHIPS ITS OWN PROOF, which is why this one can be settled here rather than deferred to the rig. RememberEnv
// shows a cue for the first two steps and zeros for the next ten, then scores |action - cue| at the end. A policy
// with no state sees 0 at the moment it must answer, so it cannot do better than a constant guess; a policy with
// memory can carry the cue. The task is built so the two are distinguishable.
//
// THE TEST IS AN ABLATION, NOT A THRESHOLD. "Error dropped below 0.25" would also pass if the environment were
// easy or the scoring were wrong. Wiping the memory every step -- same architecture, same ES budget, same seeds,
// same task, one thing changed -- is the control that says the memory is what did the work:
//
//     with memory      0.4771  ->  0.1336
//     memory ablated   0.4528  ->  0.3788
//
// DETERMINISM: measured, not assumed. The module uses no Math.random -- the env is mulberry32-seeded and ES
// perturbations derive from it -- and three identical runs gave 0.1336 with a spread of exactly 0. So these
// thresholds can sit close to the measurements without the gate becoming flaky.

import { MemoryPolicy, RememberEnv, esTrain } from "./memoryPolicy.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const ENV = new RememberEnv({ maxSteps: 12, cueLen: 2 });
const TRAIN = { iters: 120, pop: 12, sigma: 0.15, lr: 0.06 };

function trial(ablate) {
    const p = new MemoryPolicy(1, 1, { slots: 4, slotDim: 4 });
    const roll = (q) => {
        let total = 0;
        for (let ep = 0; ep < 8; ep++) {
            q.reset();
            let obs = ENV.reset(1000 + ep), r = 0;
            for (;;) {
                const a = q.act(obs);
                if (ablate) q.memory.fill(0);            // the one changed thing: no state survives a step
                const s = ENV.step(a);
                obs = s.obs;
                if (s.done) { r = -s.recallErr; break; }
            }
            total += r;
        }
        return total / 8;
    };
    const before = -roll(p);
    esTrain(p, roll, TRAIN);
    return { before, after: -roll(p) };
}

const mem = trial(false);
const abl = trial(true);

// ---- 1. IT LEARNS THE RECALL TASK ---------------------------------------------------------------------------------
{
    ok("!! the memory policy learns to carry a cue across ten blank steps",
        mem.after < 0.25 && mem.before > 0.4,
        `recall error ${mem.before.toFixed(4)} -> ${mem.after.toFixed(4)} in 120 ES iterations (~0.5s). The cue is ` +
        "shown for two steps and must be reproduced at step twelve, by which time the observation has been zero " +
        "for ten steps");
}

// ---- 2. THE ABLATION -- the part that makes the first claim mean anything -------------------------------------------
{
    ok("!! with the memory wiped each step, the SAME architecture cannot learn it",
        abl.after > 0.30,
        `ablated ${abl.before.toFixed(4)} -> ${abl.after.toFixed(4)}, against ${mem.after.toFixed(4)} with memory ` +
        "intact. Same network, same ES budget, same seeds, same task -- one thing changed. Without this control, " +
        "'error dropped below 0.25' would pass equally well on an environment that was simply easy");

    ok("...and the gap between them is large, not marginal",
        abl.after / mem.after > 2,
        `${(abl.after / mem.after).toFixed(1)}x. The ablated run still improves a little -- ${abl.before.toFixed(4)} ` +
        `to ${abl.after.toFixed(4)} -- which is exactly what a memoryless policy CAN do: learn a better constant ` +
        "guess. It cannot learn the cue, because at the moment it must answer, its input is zero");
}

// ---- 3. THE THRESHOLDS ARE SAFE BECAUSE THE TRAINING IS DETERMINISTIC ------------------------------------------------
{
    const again = trial(false);
    ok("!! repeating the identical training reproduces the identical result",
        Math.abs(again.after - mem.after) < 1e-12,
        `${mem.after.toFixed(6)} and ${again.after.toFixed(6)}. Measured before the thresholds above were chosen: ` +
        "the module uses no Math.random, so a stochastic optimiser that would normally make a gate flaky does not " +
        "here, and the bounds can sit near the measurements instead of being padded on a guess");
}

// ---- 4. STILL UNWIRED ------------------------------------------------------------------------------------------------
{
    ok("this gate does not adopt it anywhere",
        true,
        "the reflex MLP it improves on is live in policyPilot.mjs and blobBrain.js, so there is somewhere obvious " +
        "for this to go. Whether it belongs there is a question about whether those tasks need memory at all -- a " +
        "reflex policy is cheaper and this costs 577 parameters and a recurrent step. Proving the capability is " +
        "what can be settled here; whether it is wanted is not");
}

console.log();
if (fails) { console.log("memoryPolicy-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("memoryPolicy-selfcheck: all checks pass");
