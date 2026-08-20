// WebGLEngine/brain/bench/bandit.mjs — v2547
//
// THE WALL THAT DOES NOT MOVE.
//
// "Is there a standard ai test we can benchmark GPU brain against? Like marking height of a child's growth?"
//
// The metaphor is the answer. A growth chart works because THE WALL DOES NOT MOVE. The brain's own hit rate
// cannot do that: the game changes under it -- new tactics, new NPCs, new maps -- so 84% in v2540 and 79% in
// v2546 might mean it got worse, or might mean the world got harder. You cannot mark a child against a wall that
// is being rebuilt.
//
// ---- WHY NOT CARTPOLE -------------------------------------------------------------------------------------
//
// CartPole-v1 is the famous wall (spec, web-verified: +1 reward per step; terminate at pole angle beyond +/-12
// degrees or cart position beyond +/-2.4; truncate at 500 steps; SOLVED = average >= 475 over 100 consecutive
// episodes; reset uniform in (-0.05, 0.05)). It is also the WRONG SHAPE for this brain. CartPole demands
// SEQUENTIAL CREDIT ASSIGNMENT -- the pole falls fifty steps after the bad action. This brain gets hit/miss per
// decision, which makes it a CONTEXTUAL BANDIT, not an RL agent. Marking it against CartPole would measure a wall
// it is not built to climb, and the score would say nothing about whether it is getting better at what it does.
//
// ---- WHAT THIS IS INSTEAD ---------------------------------------------------------------------------------
//
// A Bernoulli k-armed bandit, which is EXACTLY the brain's shape, with a PROVEN FLOOR underneath it.
//
// Lai & Robbins (1985) proved that any uniformly-good algorithm must pull each suboptimal arm at least
//     E[N_i(T)] >= log(T) / d(mu_i, mu*)
// times, where d(p,q) = p log(p/q) + (1-p) log((1-p)/(1-q)) is the Bernoulli KL divergence. So the regret of ANY
// algorithm satisfies
//     Regret(T) >= SUM over suboptimal arms of  delta_i * log(T) / d(mu_i, mu*)
//
// THAT IS THE MARK ON THE DOOR FRAME. It is not a score another program got; it is the floor of what any program
// could get. It cannot be tuned, it cannot drift, and it does not care what version the engine is on.
//
// !! AND THE FLOOR TURNED OUT NOT TO BE A FLOOR AT ANY HORIZON YOU WOULD ACTUALLY RUN. MEASURED:
//
//        T      UCB1 ratio   Thompson ratio
//     1000       3.08x          0.39x
//    10000       5.17x          0.43x
//   100000       5.93x          0.42x
//
// Thompson sits at 0.4x AND DOES NOT CLIMB. A lower bound that a real algorithm beats by 2.5x at every horizon
// tested is not a lower bound you can mark a child against. My first draft waved this away as "the run was too
// short" -- which is exactly the sentence you write when you want to keep a broken number.
//
// The theorem is not wrong; my use of it was. Lai-Robbins is liminf E[N_i(T)]/log(T) >= 1/d -- ASYMPTOTIC, with
// an o(1) that is NOT small when log(T) is 11.5. On an easy instance a good policy finds the best arm in far
// fewer pulls than the T->infinity tail demands, and beating the tail early violates nothing.
//
// SO THE RATIO IS KEPT AS A REFERENCE AND NOT AS A SCORE, and it is labelled: below 1.0 means the asymptotics
// have not bitten, NOT that the policy is superhuman.
//
// ---- WHAT THE GROWTH CHART ACTUALLY IS ---------------------------------------------------------------------
//
// Keith's metaphor was more right than my theory. A GROWTH CHART IS NOT A THEORY OF MAXIMUM HEIGHT. IT IS A
// FIXED WALL AND A PENCIL.
//
// So the mark on the wall is REGRET ON A FIXED INSTANCE WITH A FIXED SEED AND A FIXED HORIZON. That is all it
// has to be. It does not need a theorem underneath it; it needs to NOT MOVE. INSTANCES below is the wall, and
// the one rule a growth chart has is: DO NOT TUNE THE WALL. If those arrays change, every mark ever made against
// them becomes meaningless -- which is exactly what is wrong with marking the brain against its own hit rate in
// a game that keeps changing.
//
// UCB1's regret on the same instance is the other mark: a real algorithm, on the same wall, on the same day.
//
// ---- HOW A BRAIN PLUGS IN ---------------------------------------------------------------------------------
//
// A policy is { name, reset(k), pick(t) -> armIndex, update(arm, reward) }. That is the whole interface, and it
// is deliberately the shape brain.js already has: choose an option, find out if it hit. brain.js itself cannot be
// driven from Node (it is a Deno module -- "Deno is not defined"), so the brain is run against this ON THE RIG.
// The reference policies below are here so the mark on the wall has other marks beside it.
"use strict";

/** Bernoulli KL divergence. The floor is stated in terms of this, so it is not decoration. */
export function klBernoulli(p, q) {
    const e = 1e-12;
    p = Math.min(1 - e, Math.max(e, p));
    q = Math.min(1 - e, Math.max(e, q));
    return p * Math.log(p / q) + (1 - p) * Math.log((1 - p) / (1 - q));
}

/**
 * The Lai-Robbins asymptotic lower bound on cumulative regret at horizon T.
 * NOTHING CAN BEAT THIS. If a policy reports less, the run is too short for the bound to bite -- it is asymptotic
 * -- and that is a fact about the experiment, not an achievement.
 */
export function laiRobbinsFloor(means, T) {
    const best = Math.max(...means);
    let floor = 0;
    for (const mu of means) {
        const delta = best - mu;
        if (delta <= 0) continue;
        floor += (delta * Math.log(T)) / klBernoulli(mu, best);
    }
    return floor;
}

/** A seeded Bernoulli bandit. Seeded because a benchmark you cannot re-run identically is an anecdote. */
export function makeBandit(means, seed = 20250716) {
    let s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const best = Math.max(...means);
    return {
        k: means.length,
        means,
        pull: (i) => (rnd() < means[i] ? 1 : 0),
        regretOf: (i) => best - means[i],   // EXPECTED regret: the gap. Not the sampled reward -- that is noise,
    };                                       // and measuring realised reward makes a lucky run look like skill.
}

/**
 * Run one policy against one bandit for T pulls.
 * @returns {{name, regret, floor, ratio, pulls, bestArmShare}}
 */
export function run(policy, means, T, seed = 20250716) {
    const b = makeBandit(means, seed);
    policy.reset(b.k);
    const pulls = new Array(b.k).fill(0);
    let regret = 0;
    for (let t = 1; t <= T; t++) {
        const a = policy.pick(t);
        if (!(a >= 0 && a < b.k)) throw new Error(policy.name + " picked arm " + a + ", which does not exist");
        const r = b.pull(a);
        policy.update(a, r);
        pulls[a]++;
        regret += b.regretOf(a);
    }
    const floor = laiRobbinsFloor(means, T);
    const bestArm = means.indexOf(Math.max(...means));
    return { name: policy.name, regret, floor, ratio: regret / floor, pulls, bestArmShare: pulls[bestArm] / T };
}

// ---- reference policies: other marks on the wall -------------------------------------------------------------

/** UCB1 (Auer et al. 2002). The standard yardstick: provably within a constant factor of the floor. */
export const ucb1 = () => {
    let n = [], sum = [], k = 0;
    return {
        name: "UCB1",
        reset(kk) { k = kk; n = new Array(k).fill(0); sum = new Array(k).fill(0); },
        pick(t) {
            for (let i = 0; i < k; i++) if (n[i] === 0) return i;   // each arm once first: the log is undefined otherwise
            let best = 0, bv = -Infinity;
            for (let i = 0; i < k; i++) {
                const v = sum[i] / n[i] + Math.sqrt((2 * Math.log(t)) / n[i]);
                if (v > bv) { bv = v; best = i; }
            }
            return best;
        },
        update(a, r) { n[a]++; sum[a] += r; },
    };
};

/** Thompson sampling with a Beta(1,1) prior. Seeded, or it is not a benchmark. */
export const thompson = (seed = 7) => {
    let a = [], b = [], k = 0, s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    // Beta sampling via the ratio of two Gammas would need a Gamma sampler; for integer shape (which Beta(1,1)
    // plus integer counts always gives) the sum of exponentials is exact and needs only log().
    const gamma = (shape) => { let x = 0; for (let i = 0; i < shape; i++) x -= Math.log(1 - rnd()); return x; };
    return {
        name: "Thompson",
        reset(kk) { k = kk; a = new Array(k).fill(1); b = new Array(k).fill(1); },
        pick() {
            let best = 0, bv = -1;
            for (let i = 0; i < k; i++) { const g1 = gamma(a[i]), g2 = gamma(b[i]); const v = g1 / (g1 + g2); if (v > bv) { bv = v; best = i; } }
            return best;
        },
        update(arm, r) { if (r) a[arm]++; else b[arm]++; },
    };
};

/** Epsilon-greedy. The brain's own selection_stats A/B tests something like this, so it belongs on the wall. */
export const epsilonGreedy = (eps = 0.1, seed = 11) => {
    let n = [], sum = [], k = 0, s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return {
        name: "eps-greedy(" + eps + ")",
        reset(kk) { k = kk; n = new Array(k).fill(0); sum = new Array(k).fill(0); },
        pick() {
            if (rnd() < eps) return Math.floor(rnd() * k);
            let best = 0, bv = -Infinity;
            for (let i = 0; i < k; i++) { const v = n[i] ? sum[i] / n[i] : Infinity; if (v > bv) { bv = v; best = i; } }
            return best;
        },
        update(a, r) { n[a]++; sum[a] += r; },
    };
};

/** Uniform random. The floor of effort, not of theory -- if the brain cannot beat this, nothing else matters. */
export const uniformRandom = (seed = 3) => {
    let k = 0, s = seed >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    return { name: "random", reset(kk) { k = kk; }, pick() { return Math.floor(rnd() * k); }, update() {} };
};

// ---- the standard instances: THE WALL. Do not tune these. ----------------------------------------------------
// If these change, every past mark on the door frame becomes meaningless. That is the one rule a growth chart has.
export const INSTANCES = {
    // The classic: one clearly good arm. Easy -- a policy that fails here is broken, not merely unlucky.
    easy: [0.9, 0.6, 0.6, 0.6, 0.6],
    // Close arms: the regime where exploration actually costs. This is where policies separate.
    hard: [0.55, 0.5, 0.5, 0.5, 0.5],
    // Many arms, one slightly better. The shape the brain's own option-lists actually have.
    wide: [0.35, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3],
};

// ---- CLI -----------------------------------------------------------------------------------------------------
// A CLI GUARD THAT RUNS IN A BROWSER IS NOT A GUARD, IT IS A CRASH.
// paramecium.html imports { ucb1, uniformRandom } from this file. `.mjs` told the browser "ES module",
// which was TRUE -- so it parsed it, ran it, and hit `process` on this line. THE EXTENSION IS A CLAIM
// ABOUT THE PARSER, NOT ABOUT THE ENVIRONMENT. Ask whether node is here before assuming it.
const IS_NODE = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
if (IS_NODE && process.argv[1] && process.argv[1].endsWith("bandit.mjs")) {
    const T = 20000;
    console.log("\n  THE WALL: a Bernoulli k-armed bandit. FIXED arms, FIXED seed, FIXED horizon.");
    console.log("  THE MARK IS `regret`. Lower is better. Compare it to UCB1 on the same line, and to");
    console.log("  the same number from the last engine version. THAT is the growth chart.");
    console.log("");
    console.log("  `ratio` is regret / the Lai-Robbins asymptotic bound, kept as a REFERENCE not a score:");
    console.log("  measured, Thompson sits at ~0.4x from T=1e3 to T=1e5 and does not climb, so the bound");
    console.log("  does not bite at any horizon you would run. Below 1.0 means the asymptotics have not");
    console.log("  kicked in -- NOT that the policy beat mathematics.\n");
    for (const [name, means] of Object.entries(INSTANCES)) {
        console.log("  " + name + "  arms=" + JSON.stringify(means) + "  T=" + T);
        console.log("    " + "policy".padEnd(18) + "regret".padStart(10) + "floor".padStart(10) + "ratio".padStart(9) + "   best arm chosen");
        for (const p of [ucb1(), thompson(), epsilonGreedy(0.1), uniformRandom()]) {
            const r = run(p, means, T);
            console.log("    " + r.name.padEnd(18) + r.regret.toFixed(0).padStart(10) + r.floor.toFixed(0).padStart(10) +
                        (r.ratio.toFixed(2) + "x").padStart(9) + "   " + (100 * r.bestArmShare).toFixed(1) + "%");
        }
        console.log("");
    }
    console.log("  To mark the GPU brain: implement { name, reset(k), pick(t), update(arm, reward) } around it");
    console.log("  and pass it to run(). brain.js is Deno-only, so that happens on the rig, not here.");
}
