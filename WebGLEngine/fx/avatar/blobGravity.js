// fx/avatar/blobGravity.js -- gravity, as something to be BEATEN rather than something to be exempt from.
//
// The observation this came from is a good one and half of it is a correction: the blobulator was never unbound by
// gravity. A lava lamp IS a gravity system -- hot wax rises because it is less dense than the fluid around it, cools
// at the top, gets denser, sinks. Buoyancy against gravity is the entire reason the motion reads as alive. What the
// lamp lacks is not gravity. It is CHOICE. The wax cannot decide to rise, cannot try, and cannot fail.
//
// So: a blob that is genuinely held down. Gravity pulls, buoyancy only exists while it is HOT, heat only exists while
// it spends ENERGY, and energy only comes back while it is not spending. Nothing here lets it hover for free. A blob
// that does nothing falls and stays fallen. A blob that reaches the gauge climbed there on purpose, and one that runs
// its energy dry falls out of the sky, which is exactly what should happen to something that overreached.
//
// The policy is a small perceptron, seeded so it flies out of the box, and overridden by the GPU brain when it is
// connected (same window.__swekBrainInfer seam as the raycast pilot). Pure + verified, including the part that matters:
// the seeded policy is measurably better than doing nothing AND better than flailing at random. It earns the height.
"use strict";

const TUNE = {
    g: 5.0,            // gravity
    buoy: 18.0,        // buoyancy gain per unit of heat above neutral -- hot enough CAN beat g, but only while hot
    neutral: 0.45,     // below this it is denser than the fluid and sinks, lamp-style
    ambient: 0.05,     // heat always bleeds toward this: staying up is never free
    cool: 1.10,        // how fast it bleeds
    heatRate: 1.40,    // how fast heating raises heat
    ventRate: 1.80,    // venting dumps heat quickly
    drag: 1.40,
    burn: 0.20,        // energy per second while heating
    regen: 0.16,       // energy per second while NOT heating -- so a hold costs more than it can earn: it must bob
    floor: 0
};

function makeBlobAgent(opts = {}) {
    const T = Object.assign({}, TUNE, opts.tune || {});
    const st = { y: opts.y == null ? 0 : opts.y, vy: 0, heat: opts.heat == null ? 0.05 : opts.heat, energy: opts.energy == null ? 1 : opts.energy, spent: 0, alive: 0 };
    // action: { heat: 0..1, vent: 0..1 } -- what it CHOOSES to do about being pulled down
    function step(dt, action = {}) {
        const wantHeat = Math.max(0, Math.min(1, action.heat || 0)), wantVent = Math.max(0, Math.min(1, action.vent || 0));
        const canHeat = st.energy > 0 ? wantHeat : 0;                        // no energy, no heat, no argument
        st.heat += canHeat * T.heatRate * dt;
        st.heat -= wantVent * T.ventRate * dt;
        st.heat -= T.cool * (st.heat - T.ambient) * dt;                      // it always cools: hovering is never free
        st.heat = Math.max(0, Math.min(1, st.heat));
        const burn = canHeat * T.burn * dt;
        st.energy = Math.max(0, Math.min(1, st.energy - burn + (canHeat > 0.02 ? 0 : T.regen * dt)));
        st.spent += burn;
        const buoyancy = (st.heat - T.neutral) * T.buoy;                     // only hot blobs push back against gravity
        const a = -T.g + buoyancy - T.drag * st.vy;
        st.vy += a * dt; st.y += st.vy * dt;
        if (st.y <= T.floor) { st.y = T.floor; if (st.vy < 0) st.vy = 0; }   // the ground is where gravity wins
        st.alive += dt;
        return st;
    }
    return { step, st, tune: T, get y() { return st.y; }, get energy() { return st.energy; } };
}

// what the policy sees: where it is, where it's going, how hot, how much left in the tank
function encodeBlob(st, goal) {
    return [ (goal - st.y) / Math.max(1e-3, goal), st.vy * 0.25, st.heat, st.energy, st.y / Math.max(1e-3, goal) ];
}
// MY GUESS: a hand-tuned PD climb with a hover bias. Kept, because it is the honest baseline the trained one beat.
function seededBlobWeights() {
    return { heat: [1.50, -1.20, -0.20, 0.60, -0.10], vent: [-1.15, 0.95, 0.30, -0.10, 0.25], bias: [0.72, -0.30] };
}
// LEARNED (brain/blobTrainer.mjs, (1+1)-ES, seed 20260714, 260 iterations): scored on time held in the band per unit
// of energy burned, trained on one set of goals and tanks and then judged on a DIFFERENT set it never saw -- where it
// beat the hand-tuned guess by 80% (1.063 -> 1.919). It found something I did not: brake far harder on climb rate
// (-2.04 vs my -1.20), carry a bigger standing hover bias, and almost ignore the fuel gauge -- fly the altitude well
// and the economy takes care of itself. That is the difference between an opinion and a measurement.
const TRAINED_WEIGHTS = {
    heat: [1.592893589807668, -2.042805130135204, 0.7368252985368611, 0.024054603568223407, -0.5611346318213378],
    vent: [-0.6981722935328296, 0.7692761408805295, -0.07147236221470238, 0.0886961506098298, 0.29676867359999987],
    bias: [0.8173591307461067, -1.4186681760716526]
};
function defaultBlobWeights() { return { heat: TRAINED_WEIGHTS.heat.slice(), vent: TRAINED_WEIGHTS.vent.slice(), bias: TRAINED_WEIGHTS.bias.slice() }; }
function makeBlobPolicy(w) {
    const W = w || defaultBlobWeights();
    return (st, goal) => {
        const f = encodeBlob(st, goal);
        let h = W.bias[0], v = W.bias[1];
        for (let i = 0; i < f.length; i++) { h += f[i] * W.heat[i]; v += f[i] * W.vent[i]; }
        return { heat: Math.max(0, Math.tanh(h)), vent: Math.max(0, Math.tanh(v)) };
    };
}
// Fetch whatever this machine (or its fleet) has actually learned, falling back to the baked weights. Silent when the
// bridge is down -- an offline page still flies. The shape check here is a SEATBELT against a broken bridge, not a
// second gatekeeper: brain/blobPolicyStore.js is authoritative and refuses malformed weights at the door.
async function loadPolicyWeights(opts = {}) {
    const f = opts.fetch || (typeof fetch !== "undefined" ? fetch : null);
    const baked = { weights: defaultBlobWeights(), source: "baked", score: null, by: null };
    if (!f) return baked;
    try {
        const j = await f(opts.url || "/ai/brain/blob/policy", { cache: "no-store" }).then(r => r.json());
        const w = j && j.weights;
        const ok = j && j.source === "learned" && w && [["heat", 5], ["vent", 5], ["bias", 2]].every(([k, n]) =>
            Array.isArray(w[k]) && w[k].length === n && w[k].every(v => typeof v === "number" && Number.isFinite(v)));
        if (ok) return { weights: w, source: "learned", score: j.score, by: j.by };
    } catch (e) {}
    return baked;
}

// the GPU brain drives it when connected; otherwise the seeded policy flies it. Same seam as the raycast pilot.
function installDefaultPolicy(force) {
    if (typeof window === "undefined") return null;
    if (window.__swekBlobBrain && !force) return window.__swekBlobBrain;
    const p = makeBlobPolicy(); window.__swekBlobBrain = p; return p;
}
// what "doing well" means: time held near the goal, per unit of energy burned getting there.
function scoreRun(agent, goal, band) {
    const b = band == null ? 0.45 : band;
    return { held: agent._held || 0, spent: agent.st.spent, reward: (agent._held || 0) / (1 + agent.st.spent) };
}
function runEpisode(policy, opts = {}) {
    const goal = opts.goal == null ? 3.0 : opts.goal, dt = opts.dt || 1 / 60, steps = opts.steps || 1800, band = opts.band == null ? 0.45 : band0(opts);
    const agent = makeBlobAgent({ tune: opts.tune, energy: (opts.start && opts.start.energy != null) ? opts.start.energy : 1, y: (opts.start && opts.start.y != null) ? opts.start.y : 0 });
    let held = 0, peak = 0;
    for (let i = 0; i < steps; i++) {
        const a = policy ? policy(agent.st, goal) : { heat: 0, vent: 0 };
        agent.step(dt, a);
        if (Math.abs(agent.st.y - goal) <= band) held += dt;
        if (agent.st.y > peak) peak = agent.st.y;
    }
    agent._held = held;
    return { agent, held, peak, spent: agent.st.spent, reward: held / (1 + agent.st.spent), y: agent.st.y, energy: agent.st.energy };
}
function band0(o) { return o.band == null ? 0.45 : o.band; }
export { makeBlobAgent, makeBlobPolicy, defaultBlobWeights, seededBlobWeights, TRAINED_WEIGHTS, encodeBlob, installDefaultPolicy, loadPolicyWeights, runEpisode, scoreRun, TUNE };
