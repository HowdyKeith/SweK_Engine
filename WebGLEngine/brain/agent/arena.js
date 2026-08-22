// brain/agent/arena.js
//
// The next rung above the paramecium: not "which way do I crawl" but "which tactic do I run this engagement." A
// deterministic grid engagement -- an agent, a goal, and threats on fixed patrols -- and a ladder of four policies that
// must rank in order of competence: random at the floor, a greedy dash to the goal above it, a reactive reflex above
// that, and at the top a learned agent: an epsilon-greedy bandit that picks among tactics (rush / flank / hold) and
// updates its value estimates from the reward each episode returns. The point is not that the learner looks clever; it is
// that it provably outscores the three baselines over reproducible episodes, and that freezing its learning collapses the
// margin. Everything runs off a seed, so an episode replays bit-identically -- the gate and the page both run THIS code.
//
// Pure arithmetic and integer logic throughout (no trig, no pow), so it is deterministic here and a candidate to fold
// into the cross-architecture fingerprint later; for now it is gated.

// SweK's LCG, so streams match the rest of the engine.
export function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const sign = (v) => v < 0 ? -1 : v > 0 ? 1 : 0;
const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

// A deterministic arena from a seed: start on the left, goal on the right, threats patrolling line segments between them.
export function makeArena(seed, { size = 11, nThreats = 3, steps = 48 } = {}) {
    const rng = makeRng(seed);
    const start = [0, Math.floor(rng() * size)];
    const goal = [size - 1, Math.floor(rng() * size)];
    const threats = [];
    for (let i = 0; i < nThreats; i++) {
        const a = [2 + Math.floor(rng() * (size - 4)), Math.floor(rng() * size)];
        const b = [2 + Math.floor(rng() * (size - 4)), Math.floor(rng() * size)];
        threats.push({ a, b });
    }
    return { seed, size, start, goal, threats, steps };
}

// Threat position at tick t: an integer ping-pong between a and b along the longer axis.
export function threatAt(threat, t) {
    const [ax, ay] = threat.a, [bx, by] = threat.b;
    const dx = bx - ax, dy = by - ay, len = Math.max(Math.abs(dx), Math.abs(dy)) || 1;
    const cyc = 2 * len, p = t % cyc, step = p <= len ? p : cyc - p;   // 0..len..0
    const fx = ax + Math.round((dx * step) / len), fy = ay + Math.round((dy * step) / len);
    return [fx, fy];
}
const threatsAt = (arena, t) => arena.threats.map((th) => threatAt(th, t));

// one cardinal step reducing the larger axis gap to target first
function stepToward(pos, target) {
    const dx = target[0] - pos[0], dy = target[1] - pos[1];
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) return [sign(dx), 0];
    if (dy !== 0) return [0, sign(dy)];
    return [0, 0];
}
const MOVES = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
const nearestThreatDist = (pos, threats) => threats.reduce((m, tp) => Math.min(m, manhattan(pos, tp)), 99);

// ---- the policies (a policy maps state -> a move) --------------------------------------------------
export function randomPolicy(pos, arena, threats, rng) { const m = MOVES[Math.floor(rng() * 4)]; return m; }
export function greedyPolicy(pos, arena, threats) { return stepToward(pos, arena.goal); }          // rush: straight at the goal
export function reflexPolicy(pos, arena, threats) {                                                // reactive: dash, sidestep an adjacent threat
    const want = stepToward(pos, arena.goal);
    const next = [clamp(pos[0] + want[0], 0, arena.size - 1), clamp(pos[1] + want[1], 0, arena.size - 1)];
    if (nearestThreatDist(next, threats) <= 1) {
        let best = want, bestD = -1;
        for (const m of MOVES) { const n = [clamp(pos[0] + m[0], 0, arena.size - 1), clamp(pos[1] + m[1], 0, arena.size - 1)]; const d = nearestThreatDist(n, threats); if (d > bestD) { bestD = d; best = m; } }
        return best;
    }
    return want;
}
// tactics the bandit chooses among
export const flankTactic = (pos, arena, threats) => {                                              // proactive: progress that maximises threat distance
    let best = [0, 0], bestScore = -1e9;
    for (const m of MOVES) {
        const n = [clamp(pos[0] + m[0], 0, arena.size - 1), clamp(pos[1] + m[1], 0, arena.size - 1)];
        const progress = manhattan(pos, arena.goal) - manhattan(n, arena.goal);   // +1 closer, -1 farther
        const safety = Math.min(nearestThreatDist(n, threats), 4);
        const score = progress * 2 + safety;
        if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
};
export const holdTactic = (pos, arena, threats) => nearestThreatDist(pos, threats) <= 2 ? [0, 0] : stepToward(pos, arena.goal);  // wait out a close threat
export const rushTactic = greedyPolicy;
export const TACTICS = { rush: rushTactic, flank: flankTactic, hold: holdTactic };

// ---- one episode -----------------------------------------------------------------------------------
export function runEpisode(arena, policy, rng) {
    let pos = arena.start.slice(); const path = [pos.slice()];
    for (let t = 0; t < arena.steps; t++) {
        const threats = threatsAt(arena, t);
        if (threats.some((tp) => tp[0] === pos[0] && tp[1] === pos[1])) return { reward: -100, reachedGoal: false, caught: true, steps: t, path };
        if (pos[0] === arena.goal[0] && pos[1] === arena.goal[1]) return { reward: 100 - t, reachedGoal: true, caught: false, steps: t, path };
        const m = policy(pos, arena, threats, rng, t);
        pos = [clamp(pos[0] + m[0], 0, arena.size - 1), clamp(pos[1] + m[1], 0, arena.size - 1)];
        path.push(pos.slice());
    }
    return { reward: -manhattan(pos, arena.goal), reachedGoal: false, caught: false, steps: arena.steps, path };
}

// ---- the bandit (epsilon-greedy over tactics, incremental value update) -----------------------------
export function makeBandit({ epsilon = 0.15, alpha = 0.3, learn = true } = {}) {
    const keys = Object.keys(TACTICS), Q = {}, counts = {}; for (const k of keys) { Q[k] = 0; counts[k] = 0; }
    return {
        Q, counts,
        pick(rng) { if (rng() < epsilon) return keys[Math.floor(rng() * keys.length)]; let best = keys[0]; for (const k of keys) if (Q[k] > Q[best]) best = k; return best; },
        update(tactic, reward) { counts[tactic]++; if (learn) Q[tactic] += alpha * (reward - Q[tactic]); },
    };
}

// ---- the ladder: all four arms over the SAME M arenas, learned arm carrying its bandit across them ----
export function runLadder(seed, M = 240, opts = {}) {
    const bandit = makeBandit(opts.bandit || {});
    const bRng = makeRng((seed ^ 0x9e3779b9) >>> 0);
    const arms = { random: [], greedy: [], reflex: [], learned: [] }; const picks = [];
    for (let ep = 0; ep < M; ep++) {
        const arena = makeArena((seed + ep * 7919) >>> 0, opts.arena);
        arms.random.push(runEpisode(arena, randomPolicy, makeRng((seed + ep * 13) >>> 0)).reward);
        arms.greedy.push(runEpisode(arena, greedyPolicy, makeRng((seed + ep * 13) >>> 0)).reward);
        arms.reflex.push(runEpisode(arena, reflexPolicy, makeRng((seed + ep * 13) >>> 0)).reward);
        const tactic = bandit.pick(bRng);
        const r = runEpisode(arena, TACTICS[tactic], makeRng((seed + ep * 13) >>> 0)).reward;
        bandit.update(tactic, r); arms.learned.push(r); picks.push(tactic);
    }
    return { arms, picks, Q: bandit.Q, counts: bandit.counts, M };
}

export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const mean = (a) => a.length ? sum(a) / a.length : 0;

// ---- the flow tactic: navigate by the GPU brain's own flow-field solver (CPU mirror here) ------------
// This is the brain as the agent's EXECUTOR. The bandit could pick "use the flow field"; the brain solves it.
// Async (the solver matches the GPU signature), so this is GATED, not part of the sync cross-arch fingerprint.
import { FlowFieldSolverCPU } from "../flowfieldCpu.js";

// Build a cost terrain where the threats' patrol corridors are walls, and solve the flow toward the goal.
export async function solveArenaFlow(arena, { wallH = 24 } = {}) {
    const n = arena.size, heights = new Float32Array(n * n);
    for (const th of arena.threats) for (let t = 0; t < arena.steps; t++) { const tp = threatAt(th, t); if (tp[0] >= 0 && tp[0] < n && tp[1] >= 0 && tp[1] < n) heights[tp[1] * n + tp[0]] = wallH; }
    const solver = new FlowFieldSolverCPU(null, n, n);
    const { fx, fz } = await solver.solve(heights, [{ gx: arena.goal[0], gy: arena.goal[1] }]);
    return { fx, fz, n };
}

// A policy that steps along the solved flow vector -- the agent following the brain's field.
export function flowTacticFrom(flow) {
    return (pos) => {
        const i = pos[1] * flow.n + pos[0], vx = flow.fx[i], vz = flow.fz[i];
        if (vx === 0 && vz === 0) return [0, 0];
        return Math.abs(vx) >= Math.abs(vz) ? [sign(vx), 0] : [0, sign(vz)];
    };
}

// ---- per-tick flow: re-solve the field each tick with threats at their CURRENT position (moving walls) ----
// Threat positions repeat on their ping-pong, so distinct configurations are cached -- a handful of solves, not one per
// step. flowTacticPerTick reads the field for the current tick, so the agent's route bends around where the threats ARE.
export async function solveArenaFlowPerTick(arena, { wallH = 24 } = {}) {
    const n = arena.size, cache = new Map(), fields = [];
    for (let t = 0; t < arena.steps; t++) {
        const tp = arena.threats.map((th) => threatAt(th, t));
        const key = tp.map((p) => p[0] + "," + p[1]).join(";");
        if (!cache.has(key)) {
            const heights = new Float32Array(n * n);
            for (const p of tp) if (p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n) heights[p[1] * n + p[0]] = wallH;
            const solver = new FlowFieldSolverCPU(null, n, n);
            cache.set(key, await solver.solve(heights, [{ gx: arena.goal[0], gy: arena.goal[1] }]));
        }
        fields.push(cache.get(key));
    }
    return { fields, n, solves: cache.size };
}

export function flowTacticPerTick(perTick) {
    return (pos, arena, threats, rng, t) => {
        const flow = perTick.fields[t] || perTick.fields[perTick.fields.length - 1];
        const i = pos[1] * perTick.n + pos[0], vx = flow.fx[i], vz = flow.fz[i];
        if (vx === 0 && vz === 0) return [0, 0];
        return Math.abs(vx) >= Math.abs(vz) ? [sign(vx), 0] : [0, sign(vz)];
    };
}

// ---- the async ladder: the bandit now chooses among FOUR tactics, flow included (the brain in the running) ----
const TACTIC_KEYS4 = ["rush", "flank", "hold", "flow"];
export function makeBandit4({ epsilon = 0.15, alpha = 0.3, learn = true } = {}) {
    const Q = {}, counts = {}; for (const k of TACTIC_KEYS4) { Q[k] = 0; counts[k] = 0; }
    return {
        Q, counts,
        pick(rng) { if (rng() < epsilon) return TACTIC_KEYS4[Math.floor(rng() * TACTIC_KEYS4.length)]; let best = TACTIC_KEYS4[0]; for (const k of TACTIC_KEYS4) if (Q[k] > Q[best]) best = k; return best; },
        update(tactic, reward) { counts[tactic]++; if (learn) Q[tactic] += alpha * (reward - Q[tactic]); },
    };
}

export async function runLadderAsync(seed, M = 180, opts = {}) {
    const bandit = makeBandit4(opts.bandit || {});
    const bRng = makeRng((seed ^ 0x9e3779b9) >>> 0);
    const arms = { random: [], greedy: [], reflex: [], learned: [] }; const picks = [];
    for (let ep = 0; ep < M; ep++) {
        const arena = makeArena((seed + ep * 7919) >>> 0, opts.arena);
        arms.random.push(runEpisode(arena, randomPolicy, makeRng((seed + ep * 13) >>> 0)).reward);
        arms.greedy.push(runEpisode(arena, greedyPolicy, makeRng((seed + ep * 13) >>> 0)).reward);
        arms.reflex.push(runEpisode(arena, reflexPolicy, makeRng((seed + ep * 13) >>> 0)).reward);
        const tactic = bandit.pick(bRng);
        let policy; if (tactic === "flow") { const pt = await solveArenaFlowPerTick(arena); policy = flowTacticPerTick(pt); } else policy = TACTICS[tactic];
        const r = runEpisode(arena, policy, makeRng((seed + ep * 13) >>> 0)).reward;
        bandit.update(tactic, r); arms.learned.push(r); picks.push(tactic);
    }
    return { arms, picks, Q: bandit.Q, counts: bandit.counts, M };
}

// ---- sync per-tick flow (for the fingerprint): same fields, solved inline via solveSync ------------
// The raw fx/fz use Math.hypot (not guaranteed bit-identical across architectures), but the flow tactic discretises to a
// cardinal move by abs(fx) vs abs(fz) -- and since both are the same integer direction scaled by the same positive 1/hypot,
// that comparison is invariant to hypot's exact value. So the agent's INTEGER path is cross-architecture stable, and that
// is what the fingerprint hashes -- not the floats.
export function solveArenaFlowPerTickSync(arena, { wallH = 24 } = {}) {
    const n = arena.size, cache = new Map(), fields = [];
    for (let t = 0; t < arena.steps; t++) {
        const tp = arena.threats.map((th) => threatAt(th, t));
        const key = tp.map((p) => p[0] + "," + p[1]).join(";");
        if (!cache.has(key)) {
            const heights = new Float32Array(n * n);
            for (const p of tp) if (p[0] >= 0 && p[0] < n && p[1] >= 0 && p[1] < n) heights[p[1] * n + p[0]] = wallH;
            const solver = new FlowFieldSolverCPU(null, n, n);
            cache.set(key, solver.solveSync(heights, [{ gx: arena.goal[0], gy: arena.goal[1] }]));
        }
        fields.push(cache.get(key));
    }
    return { fields, n, solves: cache.size };
}

// Run a per-tick flow episode synchronously and return the integer trajectory summary (cross-arch safe).
export function perTickFlowTrace(seed) {
    const arena = makeArena(seed >>> 0);
    const pt = solveArenaFlowPerTickSync(arena);
    const res = runEpisode(arena, flowTacticPerTick(pt), makeRng((seed + 40 * 13) >>> 0));
    const flat = []; for (const p of res.path) { flat.push(p[0], p[1]); }
    return { path: flat, reward: res.reward, steps: res.steps, caught: res.caught ? 1 : 0, reached: res.reachedGoal ? 1 : 0 };
}
