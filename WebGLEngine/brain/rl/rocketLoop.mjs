// brain/rl/rocketLoop.mjs -- v2216 -- the headless training/eval loop for the RL spike.
//
// The feasibility claim this proves: a continuous-control head (rocketPolicy.js) can be
// DRIVEN BY A REWARD COMPUTED FROM A PHYSICS STEP and measurably improve, with no GPU, no
// game files, and no backprop -- so the same head + loop transfer straight to real physics
// by swapping the env backend to RocketSim.
//
// It uses EVOLUTION STRATEGIES (OpenAI-ES): perturb the whole flat parameter vector with
// Gaussian noise, evaluate episodic return for +/- each perturbation (antithetic pairs),
// and step the parameters toward the noise that scored better. ES is chosen deliberately:
//   - no gradients, so the physics step can stay a black box (the real RocketSim IS one);
//   - it is embarrassingly parallel across perturbations, so it fans out over the LAN fleet
//     exactly like the field-solver benchmark -- each peer evaluates a slice of the population;
//   - a few lines, robust, and enough to demonstrate improvement for a spike. (PPO is the
//     obvious upgrade once real physics is in the loop; the head/env interface do not change.)
//
// CLI (run under Deno on the rig, or node here):
//   node brain/rl/rocketLoop.mjs --backend stub --iters 30 --pairs 12 --episodes 2
//   deno run -A brain/rl/rocketLoop.mjs --backend rocketsim --iters 200 --save brain/rl/rocket_policy.json
//
// Importable: trainES() and evaluate() are exported so the selfcheck drives them directly.

import { RocketPolicy } from "./rocketPolicy.js";
import { pathToFileURL } from "node:url";
import { makeEnv } from "./rocketEnv.js";

const IS_DENO = !!globalThis.Deno;

// ---- seeded Gaussian (Box-Muller over a seeded uniform) -----------------------------------
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function gaussians(n, rnd) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i += 2) {
        const u1 = Math.max(1e-9, rnd()), u2 = rnd();
        const mag = Math.sqrt(-2 * Math.log(u1));
        out[i] = mag * Math.cos(2 * Math.PI * u2);
        if (i + 1 < n) out[i + 1] = mag * Math.sin(2 * Math.PI * u2);
    }
    return out;
}

// Run `episodes` episodes with the current policy on an already-started env; return the mean
// episodic return. Seeds are COMMON across candidates (passed in) so ES compares policies on
// the same situations -- essential for low-episode ES to have any signal.
export async function evaluate(policy, env, episodes, seeds) {
    let total = 0;
    for (let e = 0; e < episodes; e++) {
        let obs = await env.reset(seeds ? seeds[e] : undefined);
        let done = false, ret = 0, guard = 0;
        while (!done && guard++ < 100000) {
            const a = policy.act(obs);
            const r = await env.step(a);
            obs = r.obs; ret += r.reward; done = r.done;
        }
        total += ret;
    }
    return total / episodes;
}

// Centered-rank fitness shaping (Wierstra et al. / OpenAI-ES): map returns to utilities in
// [-0.5, 0.5] by RANK, not raw value. This is scale-free and robust to reward variance --
// the thing that made the z-scored version blow up when all perturbations scored similarly.
function centeredRanks(R) {
    const idx = R.map((_, i) => i).sort((a, b) => R[a] - R[b]);   // ascending
    const u = new Array(R.length);
    const denom = Math.max(1, R.length - 1);
    for (let r = 0; r < idx.length; r++) u[idx[r]] = r / denom - 0.5;
    return u;
}

// Train with ES. Returns { policy, history:[{iter,mean,best,base}], best:{params,return} }.
//
// Two design choices make it actually learn on the stub (the first cut did not):
//   - COMMON RANDOM NUMBERS: one FIXED set of evaluation seeds is reused every iteration, so
//     ES optimises a STATIONARY objective. With only a handful of episodes per candidate, a
//     moving objective (fresh seeds each iter) is mostly noise and the walk drifts.
//   - CENTERED-RANK shaping (above) instead of z-scoring the raw returns.
// `history[].base` is the base policy's return on those fixed seeds, so it is comparable
// across iterations and is the honest "is the loop working" signal.
export async function trainES(opts = {}) {
    const iters    = opts.iters ?? 30;
    const pairs    = opts.pairs ?? 12;       // antithetic pairs -> 2*pairs evals/iter
    const episodes = opts.episodes ?? 2;
    const sigma    = opts.sigma ?? 0.08;
    const lr       = opts.lr ?? 0.06;
    const decay    = opts.decay ?? 0.001;    // gentle L2 pull, keeps tanh out of saturation
    const seed     = opts.seed ?? 20260710;
    const log      = opts.log || (() => {});
    const backend  = opts.backend || "stub";
    const maxSteps = opts.maxSteps ?? 300;

    const policy = opts.policy || new RocketPolicy({ hidden: opts.hidden || [32, 32], seed });
    let theta = policy.getParams();
    const P = theta.length;
    const rnd = mulberry32(seed ^ 0x51ed270b);

    // FIXED evaluation seeds (common random numbers) -- the same situations every iteration.
    const evalSeeds = opts.evalSeeds || Array.from({ length: episodes }, (_, e) => (seed + 1009 * (e + 1)) >>> 0);

    const env = await makeEnv({ backend, maxSteps });
    const history = [];
    let best = { params: theta.slice(), return: -Infinity };

    try {
        policy.setParams(theta);
        const base0 = await evaluate(policy, env, episodes, evalSeeds);
        best = { params: theta.slice(), return: base0 };
        history.push({ iter: 0, mean: base0, best: base0, base: base0 });
        log(`[rl-es] iter 0 (baseline)  base=${base0.toFixed(3)}`);

        for (let it = 1; it <= iters; it++) {
            const eps = [];
            const rets = new Array(2 * pairs);   // [plus_0..plus_{p-1}, minus_0..minus_{p-1}]
            const cand = new Float32Array(P);

            for (let k = 0; k < pairs; k++) {
                const e = gaussians(P, rnd);
                eps.push(e);
                for (let i = 0; i < P; i++) cand[i] = theta[i] + sigma * e[i];
                policy.setParams(cand);
                rets[k] = await evaluate(policy, env, episodes, evalSeeds);
                for (let i = 0; i < P; i++) cand[i] = theta[i] - sigma * e[i];
                policy.setParams(cand);
                rets[pairs + k] = await evaluate(policy, env, episodes, evalSeeds);
            }

            // centered-rank utilities over ALL 2*pairs returns, then antithetic gradient
            const u = centeredRanks(rets);
            const g = new Float32Array(P);
            for (let k = 0; k < pairs; k++) {
                const adv = u[k] - u[pairs + k];
                const e = eps[k];
                for (let i = 0; i < P; i++) g[i] += adv * e[i];
            }
            const scale = lr / (pairs * sigma);
            for (let i = 0; i < P; i++) theta[i] += scale * g[i] - decay * theta[i];

            policy.setParams(theta);
            const baseRet = await evaluate(policy, env, episodes, evalSeeds);
            const iterBest = Math.max(...rets, baseRet);
            const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
            if (baseRet > best.return) best = { params: theta.slice(), return: baseRet };
            history.push({ iter: it, mean, best: iterBest, base: baseRet });
            log(`[rl-es] iter ${it}  base=${baseRet.toFixed(3)}  popMean=${mean.toFixed(3)}  popBest=${iterBest.toFixed(3)}`);
        }
    } finally {
        if (env.close) { try { await env.close(); } catch {} }
    }

    policy.setParams(best.params);
    return { policy, history, best };
}

// ---- CLI --------------------------------------------------------------------------------
function argOf(name, def) {
    const argv = IS_DENO ? Deno.args : process.argv.slice(2);
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : def;
}
async function writeText(path, text) {
    if (IS_DENO) return Deno.writeTextFile(path, text);
    const fs = await import("node:fs/promises"); return fs.writeFile(path, text);
}
async function readText(path) {
    if (IS_DENO) return Deno.readTextFile(path);
    const fs = await import("node:fs/promises"); return fs.readFile(path, "utf8");
}

async function main() {
    const backend  = argOf("--backend", "stub");
    const iters    = parseInt(argOf("--iters", "30"), 10);
    const pairs    = parseInt(argOf("--pairs", "12"), 10);
    const episodes = parseInt(argOf("--episodes", "2"), 10);
    const sigma    = parseFloat(argOf("--sigma", "0.10"));
    const lr       = parseFloat(argOf("--lr", "0.05"));
    const seed     = parseInt(argOf("--seed", "20260710"), 10);
    const savePath = argOf("--save", null);
    const loadPath = argOf("--load", null);

    let policy = null;
    if (loadPath) {
        try { policy = RocketPolicy.fromJSON(JSON.parse(await readText(loadPath))); console.log(`[rl-es] loaded ${loadPath}`); }
        catch (e) { console.log(`[rl-es] could not load ${loadPath}: ${e.message} -- starting fresh`); }
    }

    console.log(`[rl-es] backend=${backend} iters=${iters} pairs=${pairs} episodes=${episodes} sigma=${sigma} lr=${lr}`);
    if (backend === "rocketsim") console.log("[rl-es] NOTE: rocketsim backend is RIG-ONLY (needs RocketSim + dumped collision meshes; see rocketsim_bridge.py).");

    const { policy: trained, history } = await trainES({ backend, iters, pairs, episodes, sigma, lr, seed, policy, log: (s) => console.log(s) });

    if (history.length) {
        const first = history[0].base, last = history[history.length - 1].base;
        console.log(`[rl-es] done. base return ${first.toFixed(3)} -> ${last.toFixed(3)}  (delta ${(last - first).toFixed(3)})`);
    }
    if (savePath) { await writeText(savePath, JSON.stringify(trained.toJSON())); console.log(`[rl-es] saved policy -> ${savePath}`); }
}

// run only when invoked directly (not when imported by the selfcheck)
const invokedDirectly = IS_DENO
    ? (Deno.mainModule && import.meta.url === Deno.mainModule)
    : (process.argv[1] && import.meta.url === new URL(pathToFileURL(process.argv[1] || "").href).href);
if (invokedDirectly) main().catch(e => { console.error(e); (IS_DENO ? Deno.exit : process.exit)(1); });
