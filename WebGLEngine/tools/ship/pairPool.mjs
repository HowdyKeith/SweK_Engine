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
//   A SIDE crosses to a worker as plain data (`sideSpec`): { id, gunners, helmRule, cannon, network: { policy, weights } | null, helmNet: { policy, weights } | null, pilotNet: { policy, weights } | null (the side's escorts' pilot) } -- the network's MODULE is named by its policy id and looked up in battleshipDuel.PEER_POLICIES on the other side, so nothing but numbers and names is sent.
//   sideOf(spec) builds the side; leadOf(job) flies the pair. THE POOL'S ANSWER IS leadOf's, TO THE BIT, whatever the number of workers and whatever order the workers finish in (the gate flies the same jobs serially and on one, two and four workers and compares).
//   A CONTROL WIRING: a turret-seat network's spec may carry `wiring: "control:<seed>"`; the weights are then flown over brain/seatTurretCircuit.mjs's random circuit of that seed and not over the fly's. A steering helm's spec (helmSteerPolicy) may carry one too: brain/helmSteerPolicy.mjs's wiringOf.
//   WHAT IS NOT HERE: seatNetworks (a different network per seat), escort pilots and fleets (the pair is one ship a side unless `opts` says more; the options cross as they are), a GPU, and any machine but this one -- the rig and the peers are reached by running this same file there.
"use strict";
import { Worker, isMainThread, parentPort } from "node:worker_threads";
import os from "node:os";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as TC from "../../brain/seatTurretCircuit.mjs";
import * as HS from "../../brain/helmSteerPolicy.mjs";
import * as HC from "../../brain/helmCompassPolicy.mjs";
import * as SK from "../../brain/seatTrackGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";

/** The policies whose network can be flown over another wiring (`wiring: "control:<seed>"`), each with the module whose wiringOf() names it. */
export const WIRED = Object.freeze({ gunnerPolicy: TC, helmSteerPolicy: HS, helmCompassPolicy: HC, seatTrackGunner: SK, helmFlyWired: FS, seatFlyWired: FT, seatFlyWired10: Object.freeze({ wiringOf: FT.nearTunableOver }) });   // seatFlyWired10 over another wiring (2026-11-20)

/** A side from its plain description (see the header). A policy this fight does not seat is refused by name. */
export function sideOf(spec) {
    const net = (n, role) => {
        if (!n) return null;
        const kind = D.PEER_POLICIES[n.policy]; if (!kind || kind.role !== role) throw new Error(`pairPool.sideOf: "${n.policy}" is not a ${role} policy this fight seats`);
        const other = n.wiring !== undefined && n.wiring !== "fly";
        const family = WIRED[n.policy];
        if (other && !family) throw new Error(`pairPool.sideOf: only ${Object.keys(WIRED).join(", ")} have another wiring to fly (got ${n.policy} with wiring ${n.wiring})`);
        return { module: other ? family.wiringOf(n.wiring) : kind.mod, weights: n.weights instanceof Float32Array ? n.weights : Float32Array.from(n.weights) };   // `wiring`: "control:<seed>" flies the same weights over a random circuit (brain/seatTurretCircuit.mjs)
    };
    return D.makeSide(spec.id, { gunners: spec.gunners ?? "regular", helmRule: spec.helmRule ?? "face", cannon: spec.cannon ?? true, network: net(spec.network, "seat"), helmNet: net(spec.helmNet, "helm"), pilot: net(spec.pilotNet, "pilot") });   // `pilotNet` (2026-11-20): the brain that flies the side's ESCORTS (null: the PD autopilot)
}
/** A fight against fighters in numbers: the share of the raiders destroyed, less the share of the ship side's hit points lost. In [-1, 1]; a ship that downs all eight and takes nothing scores 1. */
export const fighterScore = (t, fighters = BF.FIGHTERS) => t.killed / fighters - t.damageOnShips / (1500 * t.ships.length);
/**
 * A FIGHTER JOB ({ vsFighters: { network, helm, seed, kind, opts } }; `opts.pilotNet` ({ policy, weights }) gives the raiders a pilot brain by name): the same attack (battleshipFight.build's seed and kind, its other options as given) flown twice -- once against a ship with `network` in its seats and `helm` at its helm (each { policy, weights } or null, the module looked up in
 * battleshipDuel.PEER_POLICIES as a side's is), once against the plain ship (the hand gunner, the rule) -- and the first's fighterScore less the second's. Paired by construction: the raiders, their seeds and the sights' seeds are the same.
 */
export function fighterLead({ network = null, helm = null, seed, kind, opts = {} }) {
    const mod = (n, role) => { if (!n) return null; const k = D.PEER_POLICIES[n.policy]; if (!k || k.role !== role) throw new Error(`pairPool.fighterLead: "${n.policy}" is not a ${role} policy`); return { module: k.mod, weights: Float32Array.from(n.weights) }; };
    let o = opts;
    if (opts.pilotNet) { const k = D.PEER_POLICIES[opts.pilotNet.policy]; if (!k || k.role !== "pilot" || typeof k.mod.pilotFor !== "function") throw new Error(`pairPool.fighterLead: "${opts.pilotNet.policy}" is not a pilot policy`); const { pilotNet, ...rest } = opts; o = { ...rest, pilot: k.mod.pilotFor(Float32Array.from(pilotNet.weights)) }; }   // `pilotNet` ({ policy, weights }): the RAIDERS' pilot, the same brain in both fights
    const x = BF.fight(seed, kind, { ...o, network: mod(network, "seat"), helm: mod(helm, "helm") }), y = BF.fight(seed, kind, o);
    return fighterScore(x) - fighterScore(y);
}
/** One pair, flown here: the lead of side x over side y -- or, for a fighter job, fighterLead. */
export function leadOf(job) {
    if (job.vsFighters) return fighterLead(job.vsFighters); return D.pair(sideOf(job.x), sideOf(job.y), job.seed, job.kind, { countBrains: false, ...(job.opts || {}) }).lead; }

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
