// WebGLEngine/brain/fleetRouting.mjs -- v4531
//
// FLEET BRAIN ROUTING, NAMED. What the tree calls a fleet brain request today is a POST to ai-bridge/gpuBrainBridge.js from a
// brain (a field solve, a hello, a learn report) that lands in the bridge's fleet registry: { id, gpu, role, kinds, solveMsEwma,
// posts, schedOptIn }. The gauges on server.html count those brains (registeredBrains, brainsBusy); brain-fleet.html's pool sums
// their training; report.html's peer grid shows each peer's version and activity. NONE of them says which peer took WHICH request
// or what it was: the scheduler of brain/agent/fleet.js (v2074's Phase C, and the learned router the fleet-arena page runs) assigns
// ROLES, and the registry counts POSTS, and a request that was routed somewhere has no record naming where.
//
// This module is the record. A request is { kind, scene, policy, ticks: [from, to) }; a routing is that request plus the peer that
// took it, the router's estimate, and the time -- an ATTRIBUTED row -- and the ledger is the rows. The router is fleet.js's learned
// scheduler over fleet.js's telemetry model of the live registry (solveMsEwma -> speed per kind), so the fast peer takes more of
// the work and a peer that handles no such kind is routed around. Then the two jobs the racing rounds already have are cut into
// requests: the trainer's episodes (one per candidate per seed) and the race's lockstep ticks (one per tick range), routed the
// same way, and RUN -- here by this box standing in for every named peer (said plainly on every result: `ranOn`), because a peer
// that could run a box3d episode on request is the rig's to build; the attribution is what this round adds and gates.
//
//   describeRequest(r)                      "train seed 1 / policy 3fa2c1b0 / ticks 0..1800"
//   telemetryOf(brains)                     the registry rows -> fleet.js's telemetry entries (id, gpu, kinds, solveMsEwma)
//   makeRouter(brains, opts)                the learned scheduler over the live fleet; route(request) -> an attributed row
//   routeAll(brains, requests, opts)        every request routed in order; { rows, summary, router }
//   ledgerSummary(rows)                     per peer: count, kinds, the last row; and the unattributed count, which must be zero
//   isAttributed(row)                       peer + kind + scene + policy + ticks all named
//   trainRequests(candidates, seeds, s)     the trainer's episodes as requests
//   raceRequests(rec, every)                the race's lockstep ticks as requests, `every` ticks a range
//   runRoutedTrain(worldFrom, D, rows)      each episode run, attributed; the scores are drivePolicy.episode's
//   runRoutedRace(worldFrom, D, rec, rows)  each range's fingerprint: the fold of the world's state hash over the range, from a
//                                           replay of the record; the ranges CHAIN (each starts from the previous fold) and the
//                                           last equals the race's own fingerprint -- the lockstep check, per peer
//
// Run: node tools/ship/fleetRouting-selfcheck.mjs
"use strict";
import { fleetFromTelemetry, schedLearned, taskTime } from "./agent/fleet.js";
import { CAR } from "../physics/raceCar.mjs";

export const KINDS = Object.freeze(["train", "race", "field", "policy"]);
export const LEDGER_CAP = 200;

/** One line naming what a request is. */
export function describeRequest(r) {
    const scene = r.scene == null ? "no scene" : (typeof r.scene === "number" ? "seed " + r.scene : String(r.scene));
    const ticks = Array.isArray(r.ticks) ? `ticks ${r.ticks[0]}..${r.ticks[1]}` : "no ticks";
    return `${r.kind} ${scene} / policy ${r.policy == null ? "none" : r.policy} / ${ticks}`;
}

/** A routed row's one line: what, and who took it. */
export function describeRow(row) { return `${describeRequest(row)} -> ${row.peer ? `${row.peer.id} (${row.peer.gpu || "?"})` : "NO PEER"}${row.estimateMs != null ? ` est ${row.estimateMs.toFixed(1)} ms` : ""}`; }

/** The registry's rows as fleet.js telemetry: id, gpu, the kinds it handles (all of KINDS when it names none), its measured time. */
export function telemetryOf(brains) {
    return (brains || []).filter((b) => b && (b.id || b.brainId)).map((b) => ({
        id: b.id || b.brainId, gpu: b.gpu || b.brainGpu || "?", kinds: Array.isArray(b.kinds) && b.kinds.length ? b.kinds.slice() : KINDS.slice(),
        solveMsEwma: b.solveMsEwma ?? b.lastSolveMs ?? null,
    }));
}

/** Everything a request needs to be attributed: who took it, and what it was, all four. */
export function isAttributed(row) {
    return !!(row && row.peer && row.peer.id && row.kind && row.scene != null && row.policy != null && Array.isArray(row.ticks) && row.ticks.length === 2 && Number.isFinite(row.ticks[0]) && Number.isFinite(row.ticks[1]) && row.at);
}

/**
 * The router: fleet.js's learned scheduler over the live fleet. route(request) picks the peer that would finish it soonest by
 * the estimates it has learned, charges that peer's load with the estimate, and returns the attributed row. observe(row, ms)
 * feeds a measured time back so the estimate learns. No live peers: every request is routed to `self` (this host), and says so.
 */
export function makeRouter(brains, { self = { id: "this host", gpu: "local" }, seed = 7, epsilon = 0, now = () => Date.now() } = {}) {
    const entries = telemetryOf(brains), kinds = KINDS.slice();
    const fleet = entries.length ? fleetFromTelemetry(entries, { kinds }) : null;
    const sched = fleet ? schedLearned(fleet, { seed, epsilon }) : null;
    // the scheduler's prior is an optimistic constant; seed it with the telemetry's own times so the fast peer is preferred from the first request
    if (sched) for (let b = 0; b < fleet.nBrains; b++) for (let k = 0; k < fleet.nKinds; k++) sched.est[b][k] = taskTime(fleet, b, { kind: k, size: 1 });
    const load = fleet ? new Float64Array(fleet.nBrains) : null;
    let n = 0;
    const size = (r) => Math.max(1, (Array.isArray(r.ticks) ? (r.ticks[1] - r.ticks[0]) : 60) / 60);   // seconds of ticks, at least one
    return {
        fleet, entries, sched, load,
        route(request) {
            // the request's own payload (weights, seed, fleet...) rides along; the four named fields are normalised on top of it
            const r = { ...request, kind: request.kind, scene: request.scene ?? null, policy: request.policy ?? null, ticks: Array.isArray(request.ticks) ? [request.ticks[0], request.ticks[1]] : null, note: request.note || null };
            const kind = Math.max(0, kinds.indexOf(r.kind)), task = { kind, size: size(r) };
            let peer = self, estimateMs = null, routedBy = "no live peer: this host";
            if (fleet) {
                // a peer that names its kinds and leaves this one out is not eligible: its load reads as infinite to the pick, so it is
                // routed around whenever ANY eligible peer exists (fleet.js's model only slows it by a factor, which a fast peer outruns)
                const eligible = entries.map((e) => e.kinds.includes(r.kind)), any = eligible.some(Boolean);
                const masked = any ? Float64Array.from(load, (l, b) => eligible[b] ? l : Infinity) : load;
                let b = sched.pick(task, masked, n);
                if (any && !eligible[b]) { let best = -1; for (let i = 0; i < fleet.nBrains; i++) if (eligible[i] && (best < 0 || masked[i] + sched.est[i][kind] < masked[best] + sched.est[best][kind])) best = i; b = best; }
                const t = taskTime(fleet, b, task);
                load[b] += t; estimateMs = t * 1000; peer = { id: entries[b].id, gpu: entries[b].gpu }; routedBy = any ? "learned scheduler (fleet.js) over the live registry" : "learned scheduler (fleet.js) over the live registry; no peer names this kind, so every peer was eligible";
                r.brain = b;
            }
            n++;
            return { id: n, ...r, peer, estimateMs, routedBy, at: new Date(now()).toISOString() };
        },
        /** a measured time for a routed row, so the estimate for that peer and kind learns */
        observe(row, ms) { if (fleet && row && row.brain != null) sched.observe(row.brain, { kind: Math.max(0, kinds.indexOf(row.kind)), size: size(row) }, ms / 1000); },
    };
}

/** Every request routed in order, with the summary. */
export function routeAll(brains, requests, opts = {}) {
    const router = makeRouter(brains, opts), rows = requests.map((q) => router.route(q));
    return { rows, summary: ledgerSummary(rows), router };
}

/** Per peer: how many, which kinds, the last one; and how many rows are not attributed (which must be zero). */
export function ledgerSummary(rows) {
    const peers = new Map(); let unattributed = 0;
    for (const row of rows || []) {
        if (!isAttributed(row)) { unattributed++; continue; }
        const k = row.peer.id, p = peers.get(k) || { id: k, gpu: row.peer.gpu || "?", count: 0, kinds: {}, last: null, estimateMs: 0 };
        p.count++; p.kinds[row.kind] = (p.kinds[row.kind] || 0) + 1; p.last = row; p.estimateMs += row.estimateMs || 0; peers.set(k, p);
    }
    return { peers: [...peers.values()].sort((a, b) => b.count - a.count), total: (rows || []).length, unattributed };
}

/** A ledger with a cap: the newest rows are kept, the oldest fall off. */
export function makeLedger(cap = LEDGER_CAP) {
    const rows = [];
    return { rows, push(row) { rows.push(row); while (rows.length > cap) rows.shift(); return row; }, summary() { return ledgerSummary(rows); }, cap };
}

/** The trainer's work as requests: one episode per candidate per seed. `policy` is the candidate's weights hash. */
export function trainRequests(candidates, seeds, { seconds = 30, hashOf = null } = {}) {
    const out = [];
    candidates.forEach((w, i) => { for (const seed of seeds) out.push({ kind: "train", scene: seed, policy: hashOf ? hashOf(w) : "candidate " + i, ticks: [0, Math.round(seconds * 60)], candidate: i, weights: w, seed }); });
    return out;
}

/** The race's lockstep ticks as requests: every `every` ticks a range, the policy the record's driver hash (or "log" for a replay). */
export function raceRequests(rec, every = 300) {
    const out = [], n = rec.ticks;
    for (let a = 0; a < n; a += every) out.push({ kind: "race", scene: rec.seed, policy: rec.weightsHash || rec.driver || "log", ticks: [a, Math.min(n, a + every)], fleet: rec.fleet || null });
    return out;
}

/** Run every routed training request here (this box standing in for the named peer): the score is drivePolicy.episode's. */
export function runRoutedTrain(worldFrom, D, rows, { seconds = 30, ranOn = "this box" } = {}) {
    return rows.map((row) => {
        const t0 = Date.now(), r = D.episode(worldFrom, row.weights, D.surfaceFor(row.seed), { seconds, seed: row.seed });
        return { ...row, ranOn, ms: Date.now() - t0, score: r.score, metres: r.metres, laps: r.laps, fingerprint: r.fingerprint };
    });
}

/** FNV-1a fold of one 32-bit word, drivePolicy's own (physics/raceCar.mjs's foldHash). */
export function foldHash(h, v) { for (let k = 0; k < 4; k++) { h ^= (v >>> (k * 8)) & 0xff; h = Math.imul(h, 0x01000193); } return h; }

/**
 * Run every routed race range here: a replay of the record with an observing onTick folding the world's state hash over the
 * range, STARTING FROM the fold the previous range reported (the chain). Each row carries its own fold; the last row's fold
 * is the race's fingerprint when every range agrees with the record. A world cannot be handed from one peer to the next (the
 * record can), so each range's replay runs from tick 0 to the range's end and folds only inside the range: the cost grows
 * with the square of the range count, said plainly, and the gate runs it on a short record. The world's stateHash is read
 * from the world the replay made (worldFrom's worlds expose stateHash; slugTicker's do), which onTick cannot see otherwise.
 */
export function runRoutedRace(worldFrom, D, rec, rows, { ranOn = "this box" } = {}) {
    let chain = 0x811c9dc5; const out = [];
    for (const row of rows) {
        const [a, b] = row.ticks; let h = chain, world = null, t0 = Date.now();
        const wf = () => { world = worldFrom(); return world; };
        D.replay(wf, rec, { seconds: b * CAR.dt, onTick: (t) => { if (t >= a && t < b) h = foldHash(h, world.stateHash()); } });
        chain = h;
        out.push({ ...row, ranOn, ms: Date.now() - t0, fold: (h >>> 0).toString(16).padStart(8, "0") });
    }
    return { rows: out, fingerprint: out.length ? out[out.length - 1].fold : null, matches: out.length ? out[out.length - 1].fold === rec.fingerprint : false };
}

export function reportLines() {
    return [
        `fleetRouting: a request is { kind, scene, policy, ticks }; a routing names the peer that took it (fleet.js's learned scheduler over the live registry, or this host when no peer is live)`,
        `the trainer's episodes and the race's lockstep tick ranges are cut into requests and routed the same way; run here by this box standing in for every named peer, attributed on every result`,
    ];
}
