// tools/roundhouse/modelBench.mjs
//
// v2827 -- run the SAME physics devices against SEVERAL models on SEVERAL peers, and collate one report.
//
// WHY THIS IS A MEASUREMENT AND NOT A LEADERBOARD: every model is judged by the same gate. The simulation
// decides whether a claim stands, whoever proposed it, so the numbers below compare models rather than opinions
// about models.
//
// THE CLASSIFICATION IS THE WHOLE POINT, and it is a FOUR-way split rather than pass/fail, because merging these
// would destroy the only information worth having:
//
//   CRYSTALLISED  the claim stood against the measurement. This is the cheap-win rate -- the number that decides
//                 which model belongs at the cheap end of an escalation chain.
//   REFUSED       a WELL-FORMED claim the physics rejected. The model was WRONG. Only a better model fixes this.
//   MALFORMED     the model could not produce a usable claim at all -- no observable, an observable this device
//                 does not have, a non-numeric one, or no comparator. This is a PLUMBING problem: JSON-constrained
//                 decoding, better prompting, or salvageJson attack it, and a bigger model may not.
//   SIM ERROR     the simulation itself failed (diverged, no crossing found). NOT the model's fault, and counting
//                 it against the model would slander it.
//
// A report that folded MALFORMED into REFUSED would say "this model is bad at physics" when the truth might be
// "this model cannot emit JSON", and those have opposite fixes.
//
// SCHEDULING: one model per peer, sequential within a peer, parallel across peers. Nothing ever swaps -- the
// swap-thrash that makes model-cycling a bad idea on ONE box does not exist across a fleet.
//
// LATENCY IS NOT COMPARABLE ACROSS PEERS and the report says so in its own shape: msPerRound is recorded per
// (model, peer) and never averaged across peers, because a CPU box and a GPU report wildly different numbers for
// identical work. The CORRECTNESS rates ARE comparable, because the gate is identical everywhere.
//
// Pure except for the injected caller factory; no imports beyond the device loop.

import { roundhouseDevice } from "./deviceBind.mjs";

export const OUTCOMES = ["crystallised", "refused", "malformed", "simError", "callerError"];

// Malformed reasons come from numericVerdict and name a claim the model could not form properly.
const MALFORMED = /^(no-measurable-claim|no-comparator-in-claim|observable-missing|observable-not-numeric)/;

// Classify ONE round's verdict. Exported because the taxonomy is the load-bearing idea here and deserves its own
// gate rather than being buried in a loop.
export function classifyVerdict(verdict) {
    if (!verdict) return "callerError";
    if (verdict.done) return "crystallised";
    const reason = String(verdict.reason || "");
    if (!reason) return "refused";                       // a real measurement that did not satisfy the claim
    if (MALFORMED.test(reason)) return "malformed";
    return "simError";                                   // obs.error -- the simulation broke, not the model
}

// A run's outcome is its LAST round: earlier rounds are the loop refining, and counting them separately would
// make a model that converges in three rounds look worse than one that gave up in one.
export function classifyRun(result) {
    if (!result || result.error) return { outcome: "callerError", rounds: 0, detail: result && result.error };
    if (result.crystallized) return { outcome: "crystallised", rounds: result.rounds, detail: null };
    const hist = result.history || [];
    const last = hist.length ? hist[hist.length - 1].verdict : null;
    return { outcome: classifyVerdict(last), rounds: hist.length, detail: last && last.reason ? last.reason : null };
}

// One device, one model, once.
export async function runOne({ device, caller, question, maxRounds = 4 }) {
    const t0 = Date.now();
    let result = null, err = null;
    try {
        result = await roundhouseDevice({ callModel: caller, device, question: question || "Make and test one falsifiable claim.", maxRounds });
    } catch (e) { err = e && e.message ? e.message : String(e); }
    const ms = Date.now() - t0;
    const c = err ? { outcome: "callerError", rounds: 0, detail: err } : classifyRun(result);
    return { ...c, ms, msPerRound: c.rounds > 0 ? ms / c.rounds : ms };
}

// THE EVENT LOOP MUST BE RELEASED BETWEEN RUNS, and this one line is why.
//
// A device build is SYNCHRONOUS CPU work -- an LBM sim is a tight loop for seconds. During it Node cannot serve
// anything: a /progress poll waits, and a /bench/stop request is not even parsed until the loop ends. Measured
// before this was added: a 20-run windtunnel matrix returned its FIRST progress reading at 47.8 seconds, with
// every row already present. The page would have shown a frozen bar and then jumped to 100%, and the stop button
// would have done nothing at all.
//
// Yielding to the macrotask queue between runs lets pending HTTP be served, so progress streams and a stop
// request lands within ONE run rather than never. It cannot help DURING a single long sim -- that would need a
// worker thread -- so a run in progress still blocks, and that limit is stated rather than hidden.
//
// NOTE the asymmetry: with a REAL model caller each round also awaits network I/O for seconds, which yields
// anyway. The pure-CPU mock path is the pathological case, which is exactly the path that looked fine.
const yieldToLoop = () => new Promise((r) => setTimeout(r, 0));

// One peer works through its whole assignment SEQUENTIALLY, holding one model resident throughout.
export async function runPeer({ peer, model, devices, runsPer = 3, makeCaller, maxRounds = 4, onProgress = null, shouldStop = null, minIntervalMs = 0 }) {
    const caller = await makeCaller({ peer, model });
    const runs = [];
    for (const device of devices) {
        for (let i = 0; i < runsPer; i++) {
            if (shouldStop && shouldStop()) return { peer: peer.name, model, runs, stopped: true };
            const runStarted = Date.now();
            const r = await runOne({ device: device.device, caller, maxRounds });
            const row = { peer: peer.name, model, device: device.name, run: i, ...r };
            runs.push(row);
            if (onProgress) { try { await onProgress(row); } catch { /* an observer must never break the run */ } }
            await yieldToLoop();          // serve pending /progress and /bench/stop before the next sim
            // A REMOTE peer on a free tier is per-minute limited, so it paces itself. Local hardware sets
            // minIntervalMs to 0 and is limited by its own speed instead. Pacing is cheaper than discovering
            // the ceiling as a wall of 429s halfway through a matrix.
            if (minIntervalMs > 0) {
                const spent = Date.now() - runStarted;
                if (spent < minIntervalMs) await new Promise((r) => setTimeout(r, minIntervalMs - spent));
            }

        }
    }
    return { peer: peer.name, model, runs, stopped: false };
}

// PARALLEL ACROSS PEERS. Each peer is independent hardware, so there is nothing to serialise between them, and
// wall-clock falls by roughly the peer count. One slow peer cannot block the others.
export async function runMatrix({ assignments, devices, runsPer = 3, makeCaller, maxRounds = 4, onProgress = null, shouldStop = null }) {
    const started = Date.now();
    const settled = await Promise.all(assignments.map(async (a) => {
        if (!a.model) return { peer: a.peer, model: null, runs: [], skipped: true, reason: a.reason || "no model assigned" };
        try {
            return await runPeer({ peer: { name: a.peer, url: a.url, kind: a.kind, provider: a.provider }, model: a.model, devices, runsPer, makeCaller, maxRounds, onProgress, shouldStop, minIntervalMs: a.minIntervalMs || 0 });
        } catch (e) {
            // a peer that dies must not take the matrix with it -- record it and keep the others' data
            return { peer: a.peer, model: a.model, runs: [], failed: true, reason: e && e.message ? e.message : String(e) };
        }
    }));
    return { peers: settled, elapsedMs: Date.now() - started, runs: settled.flatMap((p) => p.runs) };
}

// --- collation ------------------------------------------------------------------------------------------
const pct = (n, d) => (d > 0 ? n / d : 0);

// Per-model rows. Latency stays attached to its peer; the rates do not.
export function collate(runs) {
    const byModel = new Map();
    for (const r of runs) {
        const key = r.model;
        if (!byModel.has(key)) byModel.set(key, { model: key, peers: new Set(), total: 0, counts: Object.fromEntries(OUTCOMES.map((o) => [o, 0])), roundsSum: 0, roundsN: 0, msByPeer: new Map() });
        const m = byModel.get(key);
        m.peers.add(r.peer);
        m.total++;
        m.counts[r.outcome] = (m.counts[r.outcome] || 0) + 1;
        if (r.outcome === "crystallised") { m.roundsSum += r.rounds; m.roundsN++; }
        if (!m.msByPeer.has(r.peer)) m.msByPeer.set(r.peer, []);
        m.msByPeer.get(r.peer).push(r.msPerRound);
    }
    return [...byModel.values()].map((m) => {
        const usable = m.total - m.counts.simError - m.counts.callerError;   // runs the model could actually be judged on
        return {
            model: m.model,
            peers: [...m.peers],
            total: m.total,
            // THE HEADLINE: of the runs where the model was actually judged, how often did its claim survive?
            cheapWinRate: pct(m.counts.crystallised, usable),
            refusedRate: pct(m.counts.refused, usable),
            malformedRate: pct(m.counts.malformed, usable),
            // excluded from the rates above, and reported separately so they cannot be mistaken for model failure
            simErrors: m.counts.simError,
            callerErrors: m.counts.callerError,
            usableRuns: usable,
            meanRoundsToCrystallise: m.roundsN ? m.roundsSum / m.roundsN : null,
            // per PEER, never averaged across them -- see the header
            msPerRoundByPeer: Object.fromEntries([...m.msByPeer].map(([p, arr]) => [p, arr.reduce((a, b) => a + b, 0) / arr.length])),
            counts: m.counts,
        };
    }).sort((a, b) => b.cheapWinRate - a.cheapWinRate);
}

// Per-device view: which experiments are hard for EVERY model? That is a property of the device, not the models,
// and it is worth knowing before concluding anything about a model.
export function collateByDevice(runs) {
    const byDev = new Map();
    for (const r of runs) {
        if (!byDev.has(r.device)) byDev.set(r.device, { device: r.device, total: 0, crystallised: 0, malformed: 0 });
        const d = byDev.get(r.device);
        d.total++;
        if (r.outcome === "crystallised") d.crystallised++;
        if (r.outcome === "malformed") d.malformed++;
    }
    return [...byDev.values()].map((d) => ({ ...d, winRate: pct(d.crystallised, d.total) })).sort((a, b) => a.winRate - b.winRate);
}

export function benchReport(runs) {
    const rows = collate(runs);
    const devs = collateByDevice(runs);
    const L = [];
    L.push("MODEL COMPARISON -- every model judged by the same gate, so these are measurements not opinions.");
    L.push("");
    L.push("model                cheap-win   refused  malformed   usable  mean rounds");
    for (const r of rows) {
        L.push(
            r.model.padEnd(20) +
            (r.cheapWinRate * 100).toFixed(1).padStart(8) + "%" +
            (r.refusedRate * 100).toFixed(1).padStart(9) + "%" +
            (r.malformedRate * 100).toFixed(1).padStart(10) + "%" +
            String(r.usableRuns).padStart(9) +
            (r.meanRoundsToCrystallise != null ? r.meanRoundsToCrystallise.toFixed(2).padStart(13) : "           --")
        );
    }
    L.push("");
    L.push("REFUSED means the model was WRONG; MALFORMED means it could not state a claim at all. Different fixes:");
    L.push("a bigger model for the first, constrained decoding or better prompting for the second.");
    L.push("");
    L.push("latency is per (model, peer) and is NOT comparable across peers:");
    for (const r of rows) for (const [p, ms] of Object.entries(r.msPerRoundByPeer)) L.push("  " + r.model.padEnd(20) + p.padEnd(16) + (ms / 1000).toFixed(1) + " s/round");
    const excluded = rows.reduce((a, r) => a + r.simErrors + r.callerErrors, 0);
    if (excluded > 0) { L.push(""); L.push(`${excluded} run(s) excluded from the rates: simulation or transport failures, which are not the model's fault.`); }
    L.push("");
    L.push("hardest devices (low win rate across ALL models is a property of the DEVICE, not the models):");
    for (const d of devs.slice(0, 5)) L.push("  " + d.device.padEnd(28) + (d.winRate * 100).toFixed(0) + "% of " + d.total);
    return L.join("\n");
}
