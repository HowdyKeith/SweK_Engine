// WebGLEngine/tools/ship/pairPool.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// SHIP-AGAINST-SHIP PAIRS ON EVERY CORE. A brain/battleshipDuel.mjs pair -- one geometry flown from both seats -- costs about half a second of one core, and the larger audit of 2026-11-14 (tools/ship/takeTurretAudit.mjs) showed what that price had been hiding: a pair's lead has a standard deviation of 0.8, so a
// search judged on 8 pairs was fitting noise and only some hundreds of pairs see an effect of 0.1. Keith: "can we do a faster arena and many more core-hours?" THE ARENA'S OWN TICK WAS PROFILED FIRST AND IS FLAT (flightGuns.stepRounds 12%, the sight 11%, quaternion rotations 10%, the garbage collector 8%, the
// network 7%, nothing else above 6): there is no one slow thing to fix, and its files are pinned to the bit by a dozen gates. So the arena is left as it is and the PAIRS are spread over the cores: a pair is a pure function of its two sides, its kind and its seed, so it can be flown anywhere, in any order.
//
//   const pool = createPool({ workers: 4 });
//   const leads = await pool.leads(jobs);            // jobs: [{ x, y, kind, seed, opts }] -> a lead for each, in the jobs' order
//   await pool.close();
//
//   A SIDE crosses to a worker as plain data (`sideSpec`): { id, gunners, helmRule, cannon, network: { policy, weights } | null, helmNet: { policy, weights } | null } -- the network's MODULE is named by its policy id and looked up in battleshipDuel.PEER_POLICIES on the other side, so nothing but numbers and names is sent.
//   sideOf(spec) builds the side; leadOf(job) flies the pair. THE POOL'S ANSWER IS leadOf's, TO THE BIT, whatever the number of workers and whatever order the workers finish in (the gate flies the same jobs serially and on one, two and four workers and compares).
//   WHAT IS NOT HERE: seatNetworks (a different network per seat), escort pilots and fleets (the pair is one ship a side unless `opts` says more; the options cross as they are), a GPU, and any machine but this one -- the rig and the peers are reached by running this same file there.
"use strict";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import os from "node:os";
import * as D from "../../brain/battleshipDuel.mjs";

/** A side from its plain description (see the header). A policy this fight does not seat is refused by name. */
export function sideOf(spec) {
    const net = (n, role) => {
        if (!n) return null;
        const kind = D.PEER_POLICIES[n.policy]; if (!kind || kind.role !== role) throw new Error(`pairPool.sideOf: "${n.policy}" is not a ${role} policy this fight seats`);
        return { module: kind.mod, weights: n.weights instanceof Float32Array ? n.weights : Float32Array.from(n.weights) };
    };
    return D.makeSide(spec.id, { gunners: spec.gunners ?? "regular", helmRule: spec.helmRule ?? "face", cannon: spec.cannon ?? true, network: net(spec.network, "seat"), helmNet: net(spec.helmNet, "helm") });
}
/** One pair, flown here: the lead of side x over side y. */
export function leadOf(job) { return D.pair(sideOf(job.x), sideOf(job.y), job.seed, job.kind, { countBrains: false, ...(job.opts || {}) }).lead; }

/**
 * A pool of `workers` threads (default: the machine's cores). leads(jobs) -> Promise of the leads in the jobs' order; `onLead(i, lead)` is called as each arrives. close() ends the threads. `flown` counts the pairs flown since the pool was made.
 */
export function createPool({ workers = os.cpus().length } = {}) {
    if (!Number.isInteger(workers) || workers < 1) throw new Error(`pairPool.createPool: workers is a whole number, 1 or more (got ${workers})`);
    const idle = [], all = [], queue = [], pool = { workers, flown: 0 };
    const pump = () => { while (idle.length && queue.length) { const w = idle.pop(), t = queue.shift(); w.task = t; w.postMessage(t.job); } };
    for (let k = 0; k < workers; k++) {
        const w = new Worker(new URL(import.meta.url)); w.task = null; all.push(w); idle.push(w);
        w.on("message", (m) => { const t = w.task; w.task = null; idle.push(w); pool.flown++; if (m.error) t.reject(new Error(m.error)); else t.resolve(m.lead); pump(); });
        w.on("error", (e) => { if (w.task) w.task.reject(e); });
    }
    pool.leads = (jobs, onLead = null) => Promise.all(jobs.map((job, i) => new Promise((resolve, reject) => { queue.push({ job, resolve: (v) => { if (onLead) onLead(i, v); resolve(v); }, reject }); pump(); })));
    pool.close = () => Promise.all(all.map((w) => w.terminate()));
    return pool;
}

if (!isMainThread && parentPort) parentPort.on("message", (job) => { try { parentPort.postMessage({ lead: leadOf(job) }); } catch (e) { parentPort.postMessage({ error: String(e && e.message || e) }); } });
