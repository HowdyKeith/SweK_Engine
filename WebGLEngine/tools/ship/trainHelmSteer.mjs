// WebGLEngine/tools/ship/trainHelmSteer.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SEARCH OVER THE FLY'S STEERING CIRCUIT AT A HELM, AND THE SAME SEARCH OVER A RANDOM CIRCUIT. brain/helmSteerPolicy.mjs put the central complex's steering output (PFL2, PFL3, DNa02, DNa03) behind the rule that turns a capital ship; nothing was trained. tools/ship/trainHelm.mjs, which trained the escape circuit's
// helm, is bound to that circuit and judges a child on 8 pairs -- and tools/ship/takeTurretAudit.mjs showed what 8 pairs see (a pair's lead has a standard deviation of 0.8). So this is tools/ship/trainTurretSeatBig.mjs's search for a helm, WITH THE WIRING A PARAMETER:
//
//   node tools/ship/trainHelmSteer.mjs search --seed 9500 --iters 1000 --record brain/rig-results/helmSteer/s9500.json                                  (the fly's wiring)
//   node tools/ship/trainHelmSteer.mjs search --seed 9520 --iters 1000 --record brain/rig-results/helmSteerControl/s9520.json --wiring control:4242     (a random circuit of its size)
//   ... --circuit turn on every step: the steering circuit's search with THE THROTTLE LEFT TO THE RULE (registered at CIRCUITS below)
//   ... --circuit compass on every step: the same search over the circuit WITH ITS INPUTS (brain/helmCompassPolicy.mjs; registered at CIRCUITS below, pairs and file of its own)
//   node tools/ship/trainHelmSteer.mjs finish --records-dir brain/rig-results/helmSteer --control-records-dir brain/rig-results/helmSteerControl --wiring control:4242 [--write]
//
//   THE FIGHT: battleshipDuel pairs, one ship a side, regular gunners (the hand gunner), the cannon, the bow-on rule at both helms; side X's rule is corrected by the network, side Y's is not. A lead is X's score less Y's. THE ZERO WEIGHTS ARE THE RULE, so the start leads by exactly 0 and is never flown.
//   THE SEARCH: a (1+1)-ES from the zero weights. A child is kept only if it beats its parent by the staged paired test (z >= 2.5 over 300 train pairs; dropped early at 60, 120, 200 if it is not ahead). Children: SYNAPSE (a weight on a connection of the wiring whose source neuron is awake -- it has an encoder weight,
//   a bias, or a weighted synapse from an awake neuron -- and, if its target is read by no output, a read-out for the target), PATH (a feature into a neuron and that neuron into an output), TUNE (1-3 of the moved weights), BIAS (an output's bias). Only outputs 0-3 are touched: a helm does not read the fifth.
//   Then every moved weight is put back to zero unless the network with it beats the network without it by the same test. A search is resumable (a checkpoint beside the record) and a resumed search is the search not stopped, to the bit.
//   FINISH, WHICH READS THE AUDIT PAIRS ONCE (its reading file is its mark; a second read is refused): each wiring's champion is its record with the best held-out lead, flown over ITS OWN wiring. On the 600 audit pairs: each champion against the rule; each champion less its ablation (its synapses at zero);
//   THE FLY'S CHAMPION LESS THE CONTROL'S, pair by pair; and the escape circuit's shipped helm (brain/helmWeightsDefault.json) against the rule on the same pairs, with the fly's champion less it.
//   WHAT SHIPS: the fly's champion, as brain/helmSteerWeightsDefault.json, if it LEADS the rule on the audit pairs (z >= 2). A control's weights are never a file. That it ships says it is a better helm than the rule; whether the WIRING did anything is the comparison with the control, and that is said in the file.
//
// REGISTERED 2026-11-15, BEFORE ANY PAIR BELOW WAS FLOWN. Pairs: train seeds 21001-21075 of each kind (300), held-out 22001-22075 (300), audit 23001-23150 (600); none flown by anything else in the tree. Readings, each a mean of paired differences with a word at |z| >= 2: H1 the fly's champion against the rule;
// H2 its synapses (champion less ablation); H3 the fly's champion less the control's; H4 the fly's champion less the escape circuit's shipped helm. FORECAST, for the record: H1 LEADS (a helm correction was worth +0.376 over the escape circuit; bias and path children do not need the wiring); H2 and H3 CANNOT BE TOLD
// (nothing found so far in this tree has needed a synapse); H4 CANNOT BE TOLD. The sandbox's searches are 150 children a wiring, ONE search each; the rig's are 1,000 and four each (brain/RIG_COMMANDS_2026-11-15_HELM_STEER.md). A sandbox reading and a rig reading are two readings of the same pairs and the second is not
// independent of the first: the rig's finish writes to --out of its own and says so.
//
// READ, 2026-11-15 (the sandbox's one search a wiring, 150 children each; brain/helmSteerWeightsDefault.reading.json): H1 LEADS, +0.638 (z 18.9); H2 exactly 0 -- THE CHAMPION HAS NO SYNAPSE; H3 +0.366 (z 11.5) and H4 +0.197 (z 4.9), both LEADS, so the forecast was wrong on both words. *** BUT H3 IS NOT A FINDING ABOUT WIRING: neither
// champion carries a weight on a synapse (the fly's is three weights -- throttle back hard, and one path from the pointing error about z to the torque about z; the control's is one, throttle back a little), and the fly's champion flies the same fights over the control's wiring to the bit. H3 is one search's luck against
// another's. The registration named the reading before knowing that; the file's `by` now says it whenever both champions are without synapses. *** What IS shown: a helm correction of three weights beats the rule and the escape circuit's shipped helm in this one fight, and most of it is THROTTLING BACK.
//
// WHAT IS NOT HERE: the circuit's inputs (vendor/male-cns/cx-steering-inputs-circuit.json is vendored and unused), transmitter signs (every synapse weight is free in sign), more than one control seed, a degree-preserving control, another fight than this one (no broadside rule, no fighters, no fleets).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as HS from "../../brain/helmSteerPolicy.mjs";
import * as HP from "../../brain/helmPolicy.mjs";
import * as HC from "../../brain/helmCompassPolicy.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { stagedTest, STAGES, Z_ACCEPT } from "./trainTurretSeatBig.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmSteerWeightsDefault.json"), GFC_HELM_FILE = path.join(BRAIN, "helmWeightsDefault.json");
export const RECIPE = Object.freeze({ iters: 150, seed: 9500, sigma: 0.6, maxK: 3 });
export const SHARE = Object.freeze({ synapse: 0.4, path: 0.2, tune: 0.2, bias: 0.2 }), READ_OUTPUTS = Object.freeze([0, 1, 2, 3]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const TRAIN_PAIRS = pairs(21001, 75), HELD_OUT_PAIRS = pairs(22001, 75), AUDIT_PAIRS = pairs(23001, 150);
export { stagedTest, STAGES, Z_ACCEPT };
/**
 * THE CIRCUITS A HELM IS SEARCHED OVER (--circuit): each a module with wiringOf() and a policy id, its own pairs, its own file. `steer` is this file's first registration (the header). `compass` -- brain/helmCompassPolicy.mjs, the steering circuit WITH its inputs, 220 neurons and 7,981 connections --
 * REGISTERED 2026-11-15 BEFORE ANY OF ITS PAIRS WAS FLOWN: train seeds 24001-24075 of each kind, held-out 25001-25075, audit 26001-26150; the same four readings H1-H4 with ITS control (a random circuit of ITS size); FORECAST: H1 LEADS by a few weights that throttle back, as the steering circuit's did; H2 and H3
 * CANNOT BE TOLD or the synapses are not reached at all (7,981 synapses dilute nothing -- a synapse child still needs an awake neuron -- but 150 children reached none of 523); H4 CANNOT BE TOLD.
 * READ, 2026-11-16 (one search of 150 children a wiring, seeds 9600 and 9620; brain/helmCompassWeightsDefault.reading.json): H1 LEADS, +0.466 (z 15.2) -- it ships, brain/helmCompassWeightsDefault.json; H2 exactly 0; H3 +0.101 (z 3.9) LEADS; H4 +0.067 (z 1.6) CANNOT BE TOLD. AGAIN NO SYNAPSE: the champion is three
 * weights (throttle back, and the spin about z onto the torque about z through one neuron), the control's two (a constant path that throttles back); 52 synapse children were tried by each search and none kept. H3 is again one search's luck against another's and the file says the wiring took no part.
 */
export const CIRCUITS = Object.freeze({
    steer: Object.freeze({ id: "steer", mod: HS, label: "the fly's steering circuit", train: TRAIN_PAIRS, heldOut: HELD_OUT_PAIRS, audit: AUDIT_PAIRS, out: DEFAULT_OUT, citation: "male-cns central-complex steering output, PFL2/PFL3/DNa02/DNa03 (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" }),
    compass: Object.freeze({ id: "compass", mod: HC, label: "the fly's steering circuit with its inputs (the compass and the goal cells)", train: pairs(24001, 75), heldOut: pairs(25001, 75), audit: pairs(26001, 150), out: path.join(BRAIN, "helmCompassWeightsDefault.json"), citation: "male-cns central-complex steering circuit with its inputs, EPG/Delta7/FC2A-C/PFL2/PFL3/DNa02/DNa03 (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" }),
    // THE THROTTLE LEFT TO THE RULE. All three trained helms won by throttling back, and none put a weight on a synapse. `turn` is the steering circuit's search with the children kept off the throttle output (outputs 0-2 only: the three torque corrections), so the helm's thrust is the rule's and what is left to
    // find is STEERING. REGISTERED 2026-11-16 BEFORE ANY OF ITS PAIRS WAS FLOWN: train seeds 27001-27075 of each kind, held-out 28001-28075, audit 29001-29150; H1-H4 as before (H4, against the escape circuit's shipped helm, is against a helm that DOES throttle and is kept only to place this one beside it).
    // FORECAST: H1 LEADS by a little, 0.1 to 0.2 (the first search's one steering path was worth +0.15 on its train pairs) or CANNOT BE TOLD; H2 and H3 CANNOT BE TOLD; H4 TRAILS.
    // READ 2026-11-16 (one search of 150 children a wiring, seeds 9700 and 9720; brain/helmSteerTurnWeightsDefault.reading.json): H1 +0.006 CANNOT BE TOLD -- the fly-wiring search's one accepted child (+0.121 on the train pairs, z 3.5) did not hold (held-out -0.031): it does not ship. The CONTROL's search found a steering
    // correction of three weights that did hold (+0.420), so H3 reads TRAILS (-0.414) -- and NEITHER champion carries a synapse (0 of 38 and 0 of 39 synapse children kept): one search's luck against another's, the other way round. H4 TRAILS (-0.425). What it says: with a free encoder a search finds steering in some
    // runs and not in others and never through the wiring; tools/ship/takeFlyWiredHelm.mjs's study 2 is where the wiring is made to matter.
    turn: Object.freeze({ id: "turn", mod: HS, outputs: Object.freeze([0, 1, 2]), label: "the fly's steering circuit, the throttle left to the rule (no child touches the throttle output)", train: pairs(27001, 75), heldOut: pairs(28001, 75), audit: pairs(29001, 150), out: path.join(BRAIN, "helmSteerTurnWeightsDefault.json"), citation: "male-cns central-complex steering output, PFL2/PFL3/DNa02/DNa03 (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" }),
});

const RULE = Object.freeze({ id: "rule" });
/** The pool's jobs for weights `w` at side X's helm over the wiring `wiring`, against the rule alone, over `list`. `policy`: helmSteerPolicy, or helmPolicy for the escape circuit's helm (which has one wiring). */
export const jobsOf = (w, list, wiring = "fly", policy = HS.POLICY_ID) => list.map(({ kind, seed }) => ({ x: { id: "net", helmNet: wiring === "fly" ? { policy, weights: w } : { policy, weights: w, wiring } }, y: RULE, kind, seed }));

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }, pick = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
const fnv = (xs) => { const u = new Uint8Array(Float32Array.from(xs).buffer); let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
/** The neurons of library `L` that weights `w` can make fire: one with an encoder weight or a bias, and any a weighted synapse reaches from one. A Set of indices. */
export function awake(L, w) {
    const on = new Set();
    for (let h = 0; h < L.HIDDEN; h++) { if (w[L.hiddenBiasAt(h)] !== 0) { on.add(h); continue; } for (let f = 0; f < L.FEATURES; f++) if (w[L.encoderAt(h, f)] !== 0) { on.add(h); break; } }
    for (let grew = true; grew;) { grew = false; L.edges.forEach(([to, from], k) => { if (on.has(from) && !on.has(to) && w[L.synapseAt(k)] !== 0) { on.add(to); grew = true; } }); }
    return on;
}
export const isRead = (L, w, h, outs = READ_OUTPUTS) => outs.some((o) => w[L.outputAt(o, h)] !== 0);
/** The synapses a child may move: those whose source neuron is awake. Indices into the wiring's edges. */
export const reachable = (L, w) => { const on = awake(L, w), ks = []; L.edges.forEach(([, from], k) => { if (on.has(from)) ks.push(k); }); return ks; };
export function pathChild(L, w, sigma, rng, outs = READ_OUTPUTS) { const o = Float32Array.from(w), h = pick(rng, L.HIDDEN); o[L.encoderAt(h, pick(rng, L.FEATURES))] += gauss(rng) * sigma; o[L.outputAt(outs[pick(rng, outs.length)], h)] += gauss(rng) * sigma; return o; }
export function biasChild(L, w, sigma, rng, outs = READ_OUTPUTS) { const o = Float32Array.from(w); o[L.biasAt(outs[pick(rng, outs.length)])] += gauss(rng) * sigma; return o; }
/** A synapse child, or null when no neuron is awake (the caller makes a path child). The target gets a read-out if it has none, so that the synapse can be heard. */
export function synapseChild(L, w, sigma, rng, outs = READ_OUTPUTS) {
    const ks = reachable(L, w); if (!ks.length) return null;
    const o = Float32Array.from(w), k = ks[pick(rng, ks.length)], to = L.edges[k][0]; o[L.synapseAt(k)] += gauss(rng) * sigma;
    if (!isRead(L, o, to, outs)) o[L.outputAt(outs[pick(rng, outs.length)], to)] += gauss(rng) * sigma;
    return o;
}
export const movedOf = (w) => { const idx = []; for (let i = 0; i < w.length; i++) if (w[i] !== 0) idx.push(i); return idx; };
export function tuneChild(L, w, sigma, rng, maxK) { const idx = movedOf(w); if (!idx.length) return null; const o = Float32Array.from(w), k = 1 + pick(rng, maxK); for (let j = 0; j < k; j++) o[idx[pick(rng, idx.length)]] += gauss(rng) * sigma; return o; }
/** One child: { w, kind }. The kind is what was MADE: a synapse or tune child that cannot be made yet is a path child and is counted as one. */
export function child(L, w, sigma, rng, maxK, outs = READ_OUTPUTS) {
    const r = rng(); let c = null, kind = r < SHARE.synapse ? "synapse" : r < SHARE.synapse + SHARE.path ? "path" : r < SHARE.synapse + SHARE.path + SHARE.tune ? "tune" : "bias";
    if (kind === "synapse") c = synapseChild(L, w, sigma, rng, outs); else if (kind === "tune") c = tuneChild(L, w, sigma, rng, maxK); else if (kind === "bias") c = biasChild(L, w, sigma, rng, outs);
    if (!c) { c = pathChild(L, w, sigma, rng, outs); kind = "path"; }
    return { w: c, kind };
}
export const synapsesUsed = (L, w) => { let n = 0; for (let k = 0; k < L.REC_EDGES; k++) if (w[L.synapseAt(k)] !== 0) n++; return n; };
export function ablate(L, w) { const o = Float32Array.from(w); for (let k = 0; k < L.REC_EDGES; k++) o[L.synapseAt(k)] = 0; return o; }

/**
 * The search over the wiring `wiring`. `fly(w, list)` -> Promise of leads over that SAME wiring (the command sees to it). Returns the record: { seed, iters, sigma, maxK, wiring, trainFirst, weights, trainLeads, train, improved, by, tried, stages, accepted, pruned, moved, kept, synapsesBefore, synapses, pairsFlown }.
 */
export async function search(opts = {}, log = () => {}, { fly, circuit = CIRCUITS.steer, train = circuit.train, stages = STAGES, checkpoint = null, wiring = "fly" } = {}) {
    const o = { ...RECIPE, ...opts }, L = circuit.mod.wiringOf(wiring), gen = { a: o.seed >>> 0 }, rng = () => { gen.a = (gen.a + 0x6D2B79F5) >>> 0; let t = gen.a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    let flown = 0; const leadsOn = async (w, from, to) => { const l = await fly(w, train.slice(from, to)); flown += l.length; return l; };
    const saved = checkpoint ? checkpoint.load() : null;
    if (saved && (saved.seed !== o.seed || saved.sigma !== o.sigma || saved.maxK !== o.maxK || saved.trainPairs !== train.length || saved.trainFirst !== train[0].seed || saved.wiring !== wiring || (saved.circuit ?? "steer") !== circuit.id)) throw new Error(`trainHelmSteer.search: the checkpoint is another search's (seed ${saved.seed}, sigma ${saved.sigma}, wiring ${saved.wiring}, ${saved.trainPairs} train pairs from seed ${saved.trainFirst})`);
    let best = saved ? Float32Array.from(saved.best) : L.zeroWeights(), bestLeads = saved ? saved.bestLeads.slice() : train.map(() => 0);   // the zero weights are the rule: a lead of exactly 0 on every pair (the gate flies it)
    const by = saved ? saved.by : { synapse: 0, path: 0, tune: 0, bias: 0 }, tried = saved ? saved.tried : { synapse: 0, path: 0, tune: 0, bias: 0 }, dropped = saved ? saved.dropped : Object.fromEntries(stages.map((s) => [s.n, 0])), accepted = saved ? saved.accepted : [];
    if (saved) { gen.a = saved.gen; flown = saved.flown; log(`  seed ${o.seed}: resumed after child ${saved.i} (${accepted.length} accepted, ${flown} pairs flown)`); } else log(`  seed ${o.seed} (${wiring}): from the zero weights, the rule`);
    for (let i = saved ? saved.i + 1 : 1; i <= o.iters; i++) {
        const c = child(L, best, o.sigma, rng, o.maxK, circuit.outputs ?? READ_OUTPUTS); tried[c.kind]++;
        const r = await stagedTest((from, to) => leadsOn(c.w, from, to), bestLeads, stages);
        if (r.accepted) { best = c.w; bestLeads = r.leads; by[c.kind]++; accepted.push({ i, kind: c.kind, z: r.z, mean: r.mean }); log(`    seed ${o.seed} child ${i}: a ${c.kind} child ACCEPTED, +${r.mean.toFixed(3)} over its parent (z ${r.z.toFixed(2)}); train ${mean(bestLeads).toFixed(3)}, ${synapsesUsed(L, best)} synapses`); }
        else dropped[r.stage]++;
        if (checkpoint) checkpoint.save({ seed: o.seed, sigma: o.sigma, maxK: o.maxK, trainPairs: train.length, trainFirst: train[0].seed, wiring, circuit: circuit.id, i, gen: gen.a, best: Array.from(best), bestLeads, by, tried, dropped, accepted, flown });
        if (i % 20 === 0) log(`    seed ${o.seed} child ${i}: train ${mean(bestLeads).toFixed(3)}, ${accepted.length} accepted, ${flown} pairs flown`);
    }
    const moved = movedOf(best), synapsesBefore = synapsesUsed(L, best), pruned = [];   // the prune: a weight stays only if the network WITH it beats the network WITHOUT it
    for (const index of moved) {
        const without = Float32Array.from(best); without[index] = 0;
        const wl = movedOf(without).length ? await leadsOn(without, 0, train.length) : train.map(() => 0), s = TA.stat(bestLeads.map((v, k) => v - wl[k])), kept = s.z >= Z_ACCEPT;
        pruned.push({ index, kept, z: s.z });
        if (!kept) { best = without; bestLeads = wl; }
    }
    log(`  seed ${o.seed} (${wiring}): train 0.000 -> ${mean(bestLeads).toFixed(3)}, ${accepted.length} accepted of ${o.iters} (${Object.entries(by).map(([k, v]) => `${k} ${v} of ${tried[k]}`).join(", ")}); dropped at ${Object.entries(dropped).map(([n, v]) => `${n}: ${v}`).join(", ")}; the prune kept ${pruned.filter((p) => p.kept).length} of ${moved.length} moved weights; ${synapsesBefore} synapses before it, ${synapsesUsed(L, best)} after; ${flown} pairs flown`);
    return { seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, wiring, circuit: circuit.id, trainFirst: train[0].seed, weights: Array.from(best), trainLeads: bestLeads, train: mean(bestLeads), improved: accepted.length, by, tried, stages: dropped, accepted, pruned, moved: moved.length, kept: movedOf(best).length, synapsesBefore, synapses: synapsesUsed(L, best), pairsFlown: flown };
}

/** A wiring's champion: its record with the best held-out lead (the lower seed on a tie), flown over its own wiring. `records` must all be that wiring's and this trainer's pairs. Returns { runs, champion }. */
export async function choose(records, wiring, fly, { circuit = CIRCUITS.steer, heldOut = circuit.heldOut, trainFirst = circuit.train[0].seed, log = () => {} } = {}) {
    if (!Array.isArray(records) || !records.length) throw new Error(`trainHelmSteer.choose: no search records for the wiring "${wiring}"`);
    const L = circuit.mod.wiringOf(wiring);
    for (const r of records) {
        if ((r.circuit ?? "steer") !== circuit.id) throw new Error(`trainHelmSteer.choose: the record of seed ${r.seed} was searched over the circuit "${r.circuit ?? "steer"}", not "${circuit.id}"`);
        if (r.wiring !== wiring) throw new Error(`trainHelmSteer.choose: the record of seed ${r.seed} was searched over the wiring "${r.wiring}", not "${wiring}": its weights mean nothing here`);
        if (r.trainFirst !== trainFirst) throw new Error(`trainHelmSteer.choose: the record of seed ${r.seed} was trained on other pairs (from seed ${r.trainFirst}, not ${trainFirst})`);
        if (!Array.isArray(r.weights) || r.weights.length !== L.WEIGHT_COUNT) throw new Error(`trainHelmSteer.choose: the record of seed ${r.seed} has ${r.weights?.length} weights, not ${L.WEIGHT_COUNT}`);
    }
    const runs = [];
    for (const r of records) { const w = Float32Array.from(r.weights), h = movedOf(w).length ? TA.stat(await fly(w, heldOut)) : { n: heldOut.length, mean: 0, se: 0, z: 0 }; runs.push({ ...r, heldOut: h }); log(`  ${wiring} seed ${r.seed} (${r.kept} weights moved, ${r.synapses} synapses): held-out ${TA.line(h)}`); }
    runs.sort((a, b) => b.heldOut.mean - a.heldOut.mean || a.seed - b.seed);
    return { runs, champion: { ...runs[0], weights: Float32Array.from(runs[0].weights) } };
}
/** Does the fly's champion ship? It LEADS the rule on the audit pairs (z >= 2). Pure. */
export function qualifies(reading) { return reading.H1.z >= 2 ? { ok: true, reasons: [] } : { ok: false, reasons: [`against the rule it reads ${TA.word(reading.H1.z)} (z ${reading.H1.z.toFixed(2)})`] }; }
/**
 * THE AUDIT, ONCE. `flyFly(w, list)` flies weights over the fly's wiring, `flyCtl` over the control's, `flyGfc` flies the escape circuit's shipped helm; `gfc` its weights (null: H4 is not read). Returns { fly, control (their runs and champions), reading: { H1, H2, H3, H4, control, controlSynapses, gfc }, words, verdict }.
 */
export async function finish(recsFly, recsCtl, { circuit = CIRCUITS.steer, control = `control:${HS.CONTROL_SEED}`, flyFly, flyCtl, flyGfc = null, gfc = null, heldOut = circuit.heldOut, audit = circuit.audit, trainFirst = circuit.train[0].seed, log = () => {} } = {}) {
    const F = await choose(recsFly, "fly", flyFly, { circuit, heldOut, trainFirst, log }), C = await choose(recsCtl, control, flyCtl, { circuit, heldOut, trainFirst, log }), zero = audit.map(() => 0), LF = circuit.mod.wiringOf("fly"), LC = circuit.mod.wiringOf(control);
    const on = async (fly, w) => (movedOf(w).length ? await fly(w, audit) : zero), d = (a, b) => TA.stat(a.map((v, i) => v - b[i])), abl = async (fly, L, w, leads) => { const a = ablate(L, w); return movedOf(a).length === movedOf(w).length ? leads : await on(fly, a); };
    const fl = await on(flyFly, F.champion.weights), cl = await on(flyCtl, C.champion.weights), fa = await abl(flyFly, LF, F.champion.weights, fl), ca = await abl(flyCtl, LC, C.champion.weights, cl), gl = gfc && flyGfc ? await flyGfc(gfc, audit) : null;
    const reading = { H1: TA.stat(fl), H2: d(fl, fa), H3: d(fl, cl), H4: gl ? d(fl, gl) : null, control: TA.stat(cl), controlSynapses: d(cl, ca), gfc: gl ? TA.stat(gl) : null }, words = Object.fromEntries(["H1", "H2", "H3", "H4"].map((k) => [k, reading[k] ? TA.word(reading[k].z) : "NOT READ"])), verdict = qualifies(reading);
    log(`the fly's champion (seed ${F.champion.seed}; ${F.champion.kept} weights, ${F.champion.synapses} synapses) and the control's (seed ${C.champion.seed}; ${C.champion.kept} weights, ${C.champion.synapses} synapses), ${audit.length} audit pairs, read once:`);
    log(`  H1 the fly's champion against the rule: ${TA.line(reading.H1)}`); log(`  H2 its synapses (champion less its ablation): ${TA.line(reading.H2)}`);
    log(`     the control's champion against the rule: ${TA.line(reading.control)}; its synapses: ${TA.line(reading.controlSynapses)}`);
    log(`  H3 THE FLY'S WIRING LESS THE CONTROL'S: ${TA.line(reading.H3)}`);
    if (gl) { log(`     the escape circuit's shipped helm against the rule: ${TA.line(reading.gfc)}`); log(`  H4 the fly's champion less the escape circuit's helm: ${TA.line(reading.H4)}`); }
    log(verdict.ok ? "QUALIFIES: it leads the rule." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { fly: F, control: C, controlWiring: control, circuit: circuit.id, reading, words, verdict };
}
/** The file written when the fly's champion qualifies: a swek-brain-v1 blob whose `by` carries the recipe and all four readings. */
export function blobOf(result, { circuit = CIRCUITS[result.circuit ?? "steer"], train = circuit.train, heldOut = circuit.heldOut, audit = circuit.audit } = {}) {
    const M = circuit.mod, c = result.fly.champion, R = result.reading, seeds = (l) => `seeds ${l[0].seed}-${l[l.length - 1].seed} of each kind`;
    const by = `tools/ship/trainHelmSteer.mjs: (1+1)-ES from the zero weights (the rule), seed ${c.seed} of ${result.fly.runs.length} searches over ${circuit.label}, ${c.iters} children (synapse, path, tune, bias), a child kept only if it beat its parent by a paired test of z >= ${Z_ACCEPT} over ${train.length} train pairs (${seeds(train)}; ${c.improved} kept), then every moved weight put back unless it paid for itself: ${c.kept} of ${M.WEIGHT_COUNT} weights differ from zero and ${c.synapses} of the circuit's ${M.REC_EDGES} synapses carry a weight; ` +
        `champion picked on ${heldOut.length} held-out pairs: ${TA.line(c.heldOut)}; ${audit.length} audit pairs (${seeds(audit)}), read once: against the rule ${TA.line(R.H1)}; its synapses (this less its ablation) ${TA.line(R.H2)}; THE WIRING -- this less the champion of the same search over a random circuit of its size (${result.controlWiring}, ${result.control.runs.length} searches, itself ${TA.line(R.control)}) -- ${TA.line(R.H3)}` +
        (c.synapses === 0 && result.control.champion.synapses === 0 ? ` *** NEITHER CHAMPION CARRIES A WEIGHT ON A SYNAPSE, SO THE WIRING TOOK NO PART: these weights fly the same fights over either circuit, and that difference is one search's luck against another's, not the fly's wiring ***` : "") +
        (R.H4 ? `; this less the escape circuit's shipped helm (itself ${TA.line(R.gfc)}) ${TA.line(R.H4)}` : "") + `; trained and read in one fight only: one ship a side, regular gunners, the cannon, the bow-on rule`;
    return PB.exportBrain(PB.describePolicy(M.POLICY_ID, M), c.weights, { score: Number(R.H1.mean.toFixed(3)), by, citation: circuit.citation });
}
/** The escape circuit's shipped helm weights, or null with the reason logged. */
export function gfcHelm(file = GFC_HELM_FILE, log = () => {}) { if (!fs.existsSync(file)) { log(`  (no ${file}: H4 is not read)`); return null; } const r = PB.importBrain(PB.describePolicy("helmPolicy", HP), JSON.parse(fs.readFileSync(file, "utf8"))); if (!r.ok) { log(`  (${file} is refused: ${r.reason}; H4 is not read)`); return null; } return r.weights; }

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const [step, ...rest] = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, known = ["seed", "iters", "record", "records-dir", "control-records-dir", "workers", "write", "out", "wiring", "circuit"], bad = rest.filter((a) => a.startsWith("--") && !known.includes(a.slice(2)));
    if (!["search", "finish"].includes(step) || bad.length) { console.error(`trainHelmSteer: ${bad.length ? `unknown option ${bad.join(", ")}` : "the first argument is search or finish"}`); process.exit(2); }
    const circuit = CIRCUITS[arg("circuit", "steer")]; if (!circuit) { console.error(`trainHelmSteer: --circuit is ${Object.keys(CIRCUITS).join(", ")} (got ${arg("circuit")})`); process.exit(2); }
    if (circuit.id !== "steer") console.log(`the circuit: ${circuit.label} (${circuit.mod.HIDDEN} neurons, ${circuit.mod.REC_EDGES} connections); pairs from seed ${circuit.train[0].seed}`);
    const wiring = arg("wiring", step === "finish" ? `control:${HS.CONTROL_SEED}` : "fly"); try { circuit.mod.wiringOf(wiring); } catch (e) { console.error("trainHelmSteer: " + e.message); process.exit(2); }
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), flyOver = (wr, policy = circuit.mod.POLICY_ID) => (w, list) => pool.leads(jobsOf(Array.from(w), list, wr, policy)), log = (m) => console.log(m);
    if (step === "search") {
        if (!arg("record")) { console.error("trainHelmSteer: search needs --record <file.json>"); process.exit(2); }
        if (wiring !== "fly") console.log(`THE WIRING IS A CONTROL (${wiring}): a random circuit of the size of the circuit searched. Its weights are never a brain file.`);
        if (fs.existsSync(arg("record"))) { console.log(`${arg("record")} is already there: this search is finished`); await pool.close(); process.exit(0); }
        const ckpt = arg("record") + ".ckpt", checkpoint = { load: () => (fs.existsSync(ckpt) ? JSON.parse(fs.readFileSync(ckpt, "utf8")) : null), save: (st) => { fs.writeFileSync(ckpt + ".tmp", JSON.stringify(st)); fs.renameSync(ckpt + ".tmp", ckpt); } };
        fs.mkdirSync(path.dirname(path.resolve(arg("record"))), { recursive: true });
        const rec = await search({ seed: Number(arg("seed", RECIPE.seed)), iters: Number(arg("iters", RECIPE.iters)) }, log, { fly: flyOver(wiring), checkpoint, wiring, circuit }); fs.writeFileSync(arg("record"), JSON.stringify(rec) + "\n"); console.log(`wrote ${arg("record")}`);
    } else {
        if (wiring === "fly" || !arg("records-dir") || !arg("control-records-dir")) { console.error("trainHelmSteer: finish needs --records-dir <the fly's records>, --control-records-dir <the control's> and (if not control:4242) --wiring control:<seed>"); process.exit(2); }
        const outBase = arg("out", circuit.out), readingFile = outBase.replace(/\.json$/, ".reading.json");
        if (fs.existsSync(readingFile)) { console.error(`trainHelmSteer: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
        const load = (d) => fs.readdirSync(d).filter((f) => /^s\d+\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8"))), gfc = gfcHelm(GFC_HELM_FILE, log);
        const result = await finish(load(arg("records-dir")), load(arg("control-records-dir")), { circuit, control: wiring, flyFly: flyOver("fly"), flyCtl: flyOver(wiring), flyGfc: flyOver("fly", "helmPolicy"), gfc, log });
        const brief = (s) => ({ champion: s.champion.seed, runs: s.runs.map((r) => ({ seed: r.seed, iters: r.iters, heldOut: r.heldOut, kept: r.kept, synapses: r.synapses })) });
        fs.writeFileSync(readingFile, JSON.stringify({ circuit: circuit.id, control: wiring, fly: brief(result.fly), controlRuns: brief(result.control), reading: result.reading, words: result.words, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
        if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    }
    await pool.close(); process.exit(0);
}
