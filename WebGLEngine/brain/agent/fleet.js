// brain/agent/fleet.js
//
// The fleet agent: orchestration as a learned scheduler. The single-agent arena asked "which tactic do I run"; this asks
// "which brain solves which task." A stream of tasks arrives, each of a KIND; a fleet of brains each has different
// per-kind speeds -- one is fast at nav and slow at render, another the reverse. A scheduler assigns each task to a brain,
// and the goal is the lowest MAKESPAN: the moment the last brain finishes. The naive schedulers ignore capability --
// round-robin just cycles, greedy-load only balances queue length -- so they hand slow work to slow brains. The learned
// scheduler LEARNS each brain's speed per kind from the times it observes and routes each task to whoever will finish it
// soonest, specialising fast brains onto their strong kinds. It is the distributed thread turned into a scheduler with a
// goal, and it is gated against round-robin the way the agent is gated against random.
//
// Pure arithmetic (LCG + divides + compares), so it could join the cross-arch fingerprint later; gated for now.

export function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const argmin = (arr) => { let bi = 0; for (let i = 1; i < arr.length; i++) if (arr[i] < arr[bi]) bi = i; return bi; };

// A fleet of brains with heterogeneous per-kind speeds: each brain is fast (high speed) at a couple of kinds, slow at the
// rest. taskTime = size / speed, so a brain fast at a kind clears it quickly.
export function makeFleet(seed, { nBrains = 5, nKinds = 4 } = {}) {
    const rng = makeRng(seed), speed = [];
    for (let b = 0; b < nBrains; b++) {
        const row = [];
        for (let k = 0; k < nKinds; k++) row.push(0.35 + rng() * 0.4);   // baseline: everyone mediocre
        const fast = Math.floor(rng() * nKinds);                          // one kind this brain is genuinely fast at
        row[fast] = 1.6 + rng() * 1.4;
        speed.push(row);
    }
    return { nBrains, nKinds, speed };
}

export function makeTaskStream(seed, { nTasks = 120, nKinds = 4 } = {}) {
    const rng = makeRng((seed ^ 0x5bd1e995) >>> 0), tasks = [];
    for (let i = 0; i < nTasks; i++) tasks.push({ kind: Math.floor(rng() * nKinds), size: 1 + Math.floor(rng() * 4) });
    return tasks;
}

export const taskTime = (fleet, brain, task) => task.size / fleet.speed[brain][task.kind];

// ---- the schedulers (each returns a stateful instance: pick(task, load, i) + observe(brain, task, time)) ----
export function schedRandom(fleet, opts = {}) { const rng = makeRng(opts.seed ?? 1); return { pick: () => Math.floor(rng() * fleet.nBrains), observe() {} }; }
export function schedRoundRobin(fleet) { return { pick: (task, load, i) => i % fleet.nBrains, observe() {} }; }
export function schedGreedyLoad(fleet) { return { pick: (task, load) => argmin(load), observe() {} }; }        // balances queue length, capability-blind

// The learned scheduler: estimate each brain's time-per-kind, route to whoever finishes soonest, learn from what it sees.
export function schedLearned(fleet, { alpha = 0.4, epsilon = 0.08, learn = true, seed = 7 } = {}) {
    const est = []; for (let b = 0; b < fleet.nBrains; b++) { const r = []; for (let k = 0; k < fleet.nKinds; k++) r.push(2.0); est.push(r); }  // optimistic prior
    const rng = makeRng(seed);
    return {
        est,
        pick(task, load) {
            if (rng() < epsilon) return Math.floor(rng() * fleet.nBrains);   // explore to learn a brain's speed
            const finish = load.map((l, b) => l + est[b][task.kind]);        // when would each brain finish this task
            return argmin(finish);
        },
        observe(brain, task, time) { if (learn) est[brain][task.kind] += alpha * (time - est[brain][task.kind]); },
    };
}

// ---- run a whole task stream through a scheduler; return makespan (lower is better) ----------------
export function runFleet(fleet, tasks, scheduler) {
    const load = new Float64Array(fleet.nBrains), sched = scheduler, assign = [];
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i], b = sched.pick(task, load, i), t = taskTime(fleet, b, task);
        load[b] += t; sched.observe(b, task, t); assign.push(b);
    }
    let makespan = 0, total = 0; for (const l of load) { if (l > makespan) makespan = l; total += l; }
    return { makespan, total, load: Array.from(load), assign };
}

// ---- the ladder: same fleet + task stream through all four schedulers -------------------------------
export function runFleetLadder(seed, opts = {}) {
    const fleet = makeFleet(seed, opts.fleet), tasks = makeTaskStream(seed, { nTasks: opts.nTasks || 120, nKinds: fleet.nKinds });
    const random = runFleet(fleet, tasks, schedRandom(fleet, { seed: seed + 1 }));
    const roundRobin = runFleet(fleet, tasks, schedRoundRobin(fleet));
    const greedy = runFleet(fleet, tasks, schedGreedyLoad(fleet));
    const learnedSched = schedLearned(fleet, opts.learned || {});
    const learned = runFleet(fleet, tasks, learnedSched);
    return { fleet, tasks, random, roundRobin, greedy, learned, est: learnedSched.est };
}

export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

// ---- real LAN wiring: build the fleet model from measured brain telemetry, not synthetic speeds ----
// The fleet scoreboard (/ai/brain/fleet) reports, per brain, a solveMsEwma (its measured solve time) and the kinds it
// handles. A brain's speed at a kind it handles is the inverse of its measured time; at a kind it does not handle it is
// deliberately slow, so the scheduler routes around it. Feed this to runFleet + schedLearned and the orchestrator is
// scheduling the ACTUAL fleet by the times it really posts. Gated here with sample telemetry; the live fetch is rig-side.
export function fleetFromTelemetry(entries, { kinds = null } = {}) {
    const kindSet = kinds || [...new Set(entries.flatMap((e) => e.kinds || []))];
    const K = kindSet.length || 1;
    const speed = entries.map((e) => {
        const ms = e.solveMsEwma || e.lastSolveMs || 100, base = 1000 / ms;   // lower measured time -> higher speed
        const handles = e.kinds && e.kinds.length ? new Set(e.kinds) : null;
        return kindSet.map((k) => (handles && !handles.has(k)) ? base * 0.15 : base);
    });
    return { nBrains: entries.length, nKinds: K, speed, kindNames: kindSet };
}

// Fetch the live scoreboard and map it to telemetry entries (browser or node with fetch).
export async function fetchFleetTelemetry(base = "") {
    const r = await fetch(base + "/ai/brain/fleet", { cache: "no-store" }); const j = await r.json();
    const list = (j && (j.fleet || j.brains || j.pool)) || [];
    return list.map((e) => ({ id: e.id || e.brainId, kinds: e.kinds || null, solveMsEwma: e.solveMsEwma ?? e.lastSolveMs ?? null }));
}
