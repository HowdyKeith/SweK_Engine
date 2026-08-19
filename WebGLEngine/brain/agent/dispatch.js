// brain/agent/dispatch.js
//
// The fleet agent stops reading the fleet and starts running it. Until now the scheduler chose which brain should get a
// task from a synthetic speed model; here it dispatches the task for real, waits for the result, and learns each brain's
// speed from the time the work actually took. sendFn(peer, task) is the one injectable seam: in the gate it runs the work
// in-process (a genuine flow-field solve, so the result is real and checkable) and reports a time from a heterogeneous
// peer model; on the rig it is the peer RPC over the LAN, and the time is the real measured solve time the peer reports.
// Either way the loop is the same -- pick a peer, dispatch, collect the result, learn the speed, route the next task
// better -- and that loop is the orchestrator actually driving the fleet.

import { schedLearned } from "./fleet.js";
import { FlowFieldSolverCPU } from "../flowfieldCpu.js";

// The real work a brain does for a task: solve a flow field and return a compact integer checksum of it. Deterministic,
// so a result can be re-derived and checked -- a dispatched answer is verifiable, not taken on faith.
export function solveTaskWork(task) {
    const n = (task.size | 0) + 6;
    const solver = new FlowFieldSolverCPU(null, n, n);
    const heights = new Float32Array(n * n);
    const gx = n - 1, gy = task.kind % n;
    const { fx, fz } = solver.solveSync(heights, [{ gx, gy }]);
    let sum = 0; for (let i = 0; i < fx.length; i++) sum += Math.abs(fx[i]) + Math.abs(fz[i]);
    return Math.round(sum * 1000);
}

// Dispatch a whole task stream across nPeers through a scheduler, executing each task via sendFn and learning from the
// time each returns. Returns makespan, the collected results, the assignments, and the scheduler's learned estimates.
export async function dispatchTasks(tasks, nPeers, sendFn, scheduler) {
    const load = new Float64Array(nPeers), results = [], assign = [];
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const peer = scheduler.pick(task, load, i);
        const res = await sendFn(peer, task);            // real execution on the (real or in-process) peer
        const solveMs = res.solveMs;
        load[peer] += solveMs; scheduler.observe(peer, task, solveMs);   // learn the brain's real speed
        results.push(res.result); assign.push(peer);
    }
    let makespan = 0; for (const l of load) if (l > makespan) makespan = l;
    return { makespan, load: Array.from(load), assign, results, est: scheduler.est };
}

// Convenience: dispatch through a fresh learned scheduler sized for the fleet.
export async function dispatchLearned(tasks, nPeers, nKinds, sendFn, opts = {}) {
    return dispatchTasks(tasks, nPeers, sendFn, schedLearned({ nBrains: nPeers, nKinds }, opts));
}
