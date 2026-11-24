// WebGLEngine/tools/ship/trainTrackSeat.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A SEARCH OVER THE FLY'S TARGET-TRACKING CIRCUIT IN A GUN SEAT, AND THE SAME SEARCH OVER A RANDOM CIRCUIT. brain/seatTrackGunner.mjs seats the turret seat's gunner over the fly's visual pursuit pathway (LC10a, AOTU019, AOTU025, DNa02: 281 neurons, 6,589 connections) with the race car's hand rule on it; nothing was
// trained, and tools/ship/trainTurretSeatBig.mjs cannot train it (it is bound to the 34-neuron seat: its children index the car's weights). This is that search with the library a parameter, as tools/ship/trainHelmSteer.mjs is for a helm:
//
//   node tools/ship/trainTrackSeat.mjs search --seed 9800 --iters 1000 --record brain/rig-results/trackSeat/s9800.json                                  (the fly's wiring)
//   node tools/ship/trainTrackSeat.mjs search --seed 9820 --iters 1000 --record brain/rig-results/trackSeatControl/s9820.json --wiring control:4242     (a random circuit of its size)
//   node tools/ship/trainTrackSeat.mjs finish --records-dir brain/rig-results/trackSeat --control-records-dir brain/rig-results/trackSeatControl [--write]
//
//   THE FIGHT IS THE ONE IN WHICH A TRIGGER IS WORTH LEARNING (tools/ship/takeAmmoStudy.mjs, confirmed on fresh pairs): one ship a side, regular sights, NO CANNON on either side and AN EIGHTH OF THE MAGAZINES, so the rounds-left sense is on (brain/seatTurretGunner.mjs's `ammoSense`). Side X's thirteen seats are the
//   network's; side Y's are the seat's hand gunner. With the cannon and whole magazines the answer is known and is not about a circuit: hold the trigger (the rig's round 1).
//   THE SEARCH: a (1+1)-ES from the hand weights (the car's hand rule on the wiring's first 34 neurons; it leads the hand gunner by itself, so the start IS flown). A child is kept only if it beats its parent by the staged paired test (z >= 2.5 over 300 train pairs). Children: SYNAPSE (a weight on a connection whose
//   source neuron is awake, and a read-out for its target if it has none), PATH (a live feature into a neuron and that neuron into an output), TUNE (1-3 of the weights that are not zero), BIAS (an output's bias). Only the three outputs a seat reads are touched. Then every weight that differs from the start is put
//   back unless the network with it beats the network without it by the same test. Resumable; a resumed search is the search not stopped, to the bit.
//   FINISH, WHICH READS THE AUDIT PAIRS ONCE: each wiring's champion is its record with the best held-out lead, flown over ITS OWN wiring. On the 600 audit pairs: T1 the fly's champion against the hand gunner; T2 WHAT THE TRAINING BOUGHT (the champion less the start); T3 its synapses (the champion less itself
//   with every synapse at zero); T4 THE FLY'S CHAMPION LESS THE CONTROL'S. WHAT SHIPS: the fly's champion, as brain/seatTrackGunnerWeightsDefault.json, if it leads the hand gunner AND leads the start (z >= 2 each) -- tools/ship/trainTurretSeatBig.mjs's rule. A control's weights are never a file.
//
// REGISTERED 2026-11-16, BEFORE ANY PAIR BELOW WAS FLOWN BY A SEARCH. Pairs: train seeds 34001-34075 of each kind (300), held-out 35001-35075 (300), audit 36001-36150 (600). FORECAST, for the record: T1 LEADS (the start already does, by about 0.1 with the cannon; here unknown); T2 LEADS if a trigger rule is found
// (a bias, or a path from the rounds-left feature to the trigger) and otherwise CANNOT BE TOLD; T3 and T4 CANNOT BE TOLD -- in five searches of this tree no synapse has yet carried a weight that paid. The sandbox's searches are 100 children a wiring, one each; the rig's are in
// brain/RIG_COMMANDS_2026-11-16_TRACK_SEAT.md and write a reading of their own (--out).
//
// WHAT IS NOT HERE: the eye (no LC10a cell here sees anything: every feature may reach every neuron through a learned encoder), transmitter signs, more than one control seed, a degree-preserving control, another fight than this one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as SK from "../../brain/seatTrackGunner.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { stagedTest, STAGES, Z_ACCEPT } from "./trainTurretSeatBig.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "seatTrackGunnerWeightsDefault.json");
export const RECIPE = Object.freeze({ iters: 100, seed: 9800, sigma: 0.5, maxK: 3 });
export const SHARE = Object.freeze({ synapse: 0.4, path: 0.2, tune: 0.2, bias: 0.2 });
export const FIGHT = Object.freeze({ cannon: false, ammo: 0.125 });
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const TRAIN_PAIRS = pairs(34001, 75), HELD_OUT_PAIRS = pairs(35001, 75), AUDIT_PAIRS = pairs(36001, 150);
export { stagedTest, STAGES, Z_ACCEPT };

/** The pool's jobs for weights `w` in side X's seats over the wiring `wiring`, against the hand gunner, over `list`, in THE fight (no cannon, an eighth of the magazines). */
export const jobsOf = (w, list, wiring = "fly") => list.map(({ kind, seed }) => ({ x: { id: "net", cannon: FIGHT.cannon, network: wiring === "fly" ? { policy: SK.POLICY_ID, weights: w } : { policy: SK.POLICY_ID, weights: w, wiring } }, y: { id: "hand", cannon: FIGHT.cannon }, kind, seed, opts: { ammo: FIGHT.ammo } }));

const gauss = (rng) => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }, pick = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
const fnv = (xs) => { const u = new Uint8Array(Float32Array.from(xs).buffer); let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
const featuresOf = (L) => L.LIVE_FEATURES_RATIONED;   // the features that vary in this fight: the rounds-left sense among them
/** The neurons of library `L` that weights `w` can make fire: one with a bias or an encoder weight on a live feature, and any a weighted synapse reaches from one. A Set of indices. */
export function awake(L, w) {
    const on = new Set(), F = featuresOf(L);
    for (let h = 0; h < L.HIDDEN; h++) if (w[L.hiddenBiasAt(h)] !== 0 || F.some((f) => w[L.encoderAt(h, f)] !== 0)) on.add(h);
    for (let grew = true; grew;) { grew = false; L.edges.forEach(([to, from], k) => { if (on.has(from) && !on.has(to) && w[L.synapseAt(k)] !== 0) { on.add(to); grew = true; } }); }
    return on;
}
export const isRead = (L, w, h) => L.READ_OUTPUTS.some((o) => w[L.outputAt(o, h)] !== 0);
/** The synapses a child may move: those whose source neuron is awake. */
export const reachable = (L, w) => { const on = awake(L, w), ks = []; L.edges.forEach(([, from], k) => { if (on.has(from)) ks.push(k); }); return ks; };
const readOut = (L, rng) => L.READ_OUTPUTS[pick(rng, L.READ_OUTPUTS.length)];
export function pathChild(L, w, sigma, rng) { const o = Float32Array.from(w), h = pick(rng, L.HIDDEN), F = featuresOf(L); o[L.encoderAt(h, F[pick(rng, F.length)])] += gauss(rng) * sigma; o[L.outputAt(readOut(L, rng), h)] += gauss(rng) * sigma; return o; }
export function biasChild(L, w, sigma, rng) { const o = Float32Array.from(w); o[L.biasAt(readOut(L, rng))] += gauss(rng) * sigma; return o; }
/** A synapse child, or null when no neuron is awake. The target gets a read-out if it has none. */
export function synapseChild(L, w, sigma, rng) {
    const ks = reachable(L, w); if (!ks.length) return null;
    const o = Float32Array.from(w), k = ks[pick(rng, ks.length)], to = L.edges[k][0]; o[L.synapseAt(k)] += gauss(rng) * sigma;
    if (!isRead(L, o, to)) o[L.outputAt(readOut(L, rng), to)] += gauss(rng) * sigma;
    return o;
}
/** The weights a tune child may move: those that are not zero, but for what goes to the two outputs a seat does not read. */
export const tunable = (L, w) => { const idx = [], lo = L.outputAt(3, 0), hi = L.outputAt(4, L.HIDDEN - 1); for (let i = 0; i < w.length; i++) if (w[i] !== 0 && !(i >= lo && i <= hi) && i !== L.biasAt(3) && i !== L.biasAt(4)) idx.push(i); return idx; };
export function tuneChild(L, w, sigma, rng, maxK) { const idx = tunable(L, w); if (!idx.length) return null; const o = Float32Array.from(w), k = 1 + pick(rng, maxK); for (let j = 0; j < k; j++) o[idx[pick(rng, idx.length)]] += gauss(rng) * sigma; return o; }
/** One child: { w, kind }. The kind is what was MADE. */
export function child(L, w, sigma, rng, maxK) {
    const r = rng(); let c = null, kind = r < SHARE.synapse ? "synapse" : r < SHARE.synapse + SHARE.path ? "path" : r < SHARE.synapse + SHARE.path + SHARE.tune ? "tune" : "bias";
    if (kind === "synapse") c = synapseChild(L, w, sigma, rng); else if (kind === "tune") c = tuneChild(L, w, sigma, rng, maxK); else if (kind === "bias") c = biasChild(L, w, sigma, rng);
    if (!c) { c = pathChild(L, w, sigma, rng); kind = "path"; }
    return { w: c, kind };
}
export const differs = (w, base) => { const idx = []; for (let i = 0; i < w.length; i++) if (w[i] !== base[i]) idx.push(i); return idx; };
export function ablate(L, w) { const o = Float32Array.from(w); for (let k = 0; k < L.REC_EDGES; k++) o[L.synapseAt(k)] = 0; return o; }

/** The search over the wiring `wiring`. `fly(w, list)` -> Promise of leads over that SAME wiring. Returns the record. */
export async function search(opts = {}, log = () => {}, { fly, train = TRAIN_PAIRS, stages = STAGES, checkpoint = null, wiring = "fly", startLeads = null } = {}) {
    const o = { ...RECIPE, ...opts }, L = SK.wiringOf(wiring), base = L.handWeights(), startHash = fnv(base), gen = { a: o.seed >>> 0 }, rng = () => { gen.a = (gen.a + 0x6D2B79F5) >>> 0; let t = gen.a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    let flown = 0; const leadsOn = async (w, from, to) => { const l = await fly(w, train.slice(from, to)); flown += l.length; return l; };
    const saved = checkpoint ? checkpoint.load() : null;
    if (saved && (saved.seed !== o.seed || saved.sigma !== o.sigma || saved.maxK !== o.maxK || saved.trainPairs !== train.length || saved.trainFirst !== train[0].seed || saved.wiring !== wiring || saved.startHash !== startHash)) throw new Error(`trainTrackSeat.search: the checkpoint is another search's (seed ${saved.seed}, sigma ${saved.sigma}, wiring ${saved.wiring}, ${saved.trainPairs} train pairs from seed ${saved.trainFirst})`);
    let best = saved ? Float32Array.from(saved.best) : Float32Array.from(base), bestLeads = saved ? saved.bestLeads.slice() : startLeads ? startLeads.slice() : await leadsOn(best, 0, train.length); const startTrain = saved ? saved.startTrain : mean(bestLeads);
    const by = saved ? saved.by : { synapse: 0, path: 0, tune: 0, bias: 0 }, tried = saved ? saved.tried : { synapse: 0, path: 0, tune: 0, bias: 0 }, dropped = saved ? saved.dropped : Object.fromEntries(stages.map((s) => [s.n, 0])), accepted = saved ? saved.accepted : [];
    const save = (i) => { if (checkpoint) checkpoint.save({ seed: o.seed, sigma: o.sigma, maxK: o.maxK, trainPairs: train.length, trainFirst: train[0].seed, wiring, startHash, i, gen: gen.a, best: Array.from(best), bestLeads, startTrain, by, tried, dropped, accepted, flown }); };
    if (saved) { gen.a = saved.gen; flown = saved.flown; log(`  seed ${o.seed}: resumed after child ${saved.i} (${accepted.length} accepted, ${flown} pairs flown)`); } else { log(`  seed ${o.seed} (${wiring}): the start (the car's hand rule) on the ${train.length} train pairs ${startTrain.toFixed(3)}`); save(0); }
    for (let i = saved ? saved.i + 1 : 1; i <= o.iters; i++) {
        const c = child(L, best, o.sigma, rng, o.maxK); tried[c.kind]++;
        const r = await stagedTest((from, to) => leadsOn(c.w, from, to), bestLeads, stages);
        if (r.accepted) { best = c.w; bestLeads = r.leads; by[c.kind]++; accepted.push({ i, kind: c.kind, z: r.z, mean: r.mean }); log(`    seed ${o.seed} child ${i}: a ${c.kind} child ACCEPTED, +${r.mean.toFixed(3)} over its parent (z ${r.z.toFixed(2)}); train ${mean(bestLeads).toFixed(3)}, ${L.synapsesUsed(best)} synapses`); }
        else dropped[r.stage]++;
        save(i);
        if (i % 20 === 0) log(`    seed ${o.seed} child ${i}: train ${mean(bestLeads).toFixed(3)}, ${accepted.length} accepted, ${flown} pairs flown`);
    }
    const moved = differs(best, base), synapsesBefore = L.synapsesUsed(best), pruned = [];   // the prune: a weight stays only if the network WITH it beats the network WITHOUT it
    for (const index of moved) {
        const without = Float32Array.from(best); without[index] = base[index];
        const wl = await leadsOn(without, 0, train.length), s = TA.stat(bestLeads.map((v, k) => v - wl[k])), kept = s.z >= Z_ACCEPT;
        pruned.push({ index, kept, z: s.z });
        if (!kept) { best = without; bestLeads = wl; }
    }
    log(`  seed ${o.seed} (${wiring}): train ${startTrain.toFixed(3)} -> ${mean(bestLeads).toFixed(3)}, ${accepted.length} accepted of ${o.iters} (${Object.entries(by).map(([k, v]) => `${k} ${v} of ${tried[k]}`).join(", ")}); dropped at ${Object.entries(dropped).map(([n, v]) => `${n}: ${v}`).join(", ")}; the prune kept ${pruned.filter((p) => p.kept).length} of ${moved.length} moved weights; ${synapsesBefore} synapses before it, ${L.synapsesUsed(best)} after; ${flown} pairs flown`);
    return { seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, wiring, startHash, trainFirst: train[0].seed, weights: Array.from(best), trainLeads: bestLeads, startTrain, train: mean(bestLeads), improved: accepted.length, by, tried, stages: dropped, accepted, pruned, moved: moved.length, kept: differs(best, base).length, synapsesBefore, synapses: L.synapsesUsed(best), pairsFlown: flown };
}

/** A wiring's champion: its record with the best held-out lead (the lower seed on a tie), flown over its own wiring. `startHeld`: the start's held-out leads, for a record that IS the start (it is not flown again). */
export async function choose(records, wiring, fly, { heldOut = HELD_OUT_PAIRS, trainFirst = TRAIN_PAIRS[0].seed, startHeld = null, log = () => {} } = {}) {
    if (!Array.isArray(records) || !records.length) throw new Error(`trainTrackSeat.choose: no search records for the wiring "${wiring}"`);
    const L = SK.wiringOf(wiring), base = L.handWeights(), startHash = fnv(base);
    for (const r of records) {
        if (r.wiring !== wiring) throw new Error(`trainTrackSeat.choose: the record of seed ${r.seed} was searched over the wiring "${r.wiring}", not "${wiring}": its weights mean nothing here`);
        if (r.trainFirst !== trainFirst) throw new Error(`trainTrackSeat.choose: the record of seed ${r.seed} was trained on other pairs (from seed ${r.trainFirst}, not ${trainFirst})`);
        if (!Array.isArray(r.weights) || r.weights.length !== L.WEIGHT_COUNT) throw new Error(`trainTrackSeat.choose: the record of seed ${r.seed} has ${r.weights?.length} weights, not ${L.WEIGHT_COUNT}`);
        if (r.startHash !== startHash) throw new Error(`trainTrackSeat.choose: the record of seed ${r.seed} started from other weights than the hand weights (${r.startHash} against ${startHash})`);
    }
    const runs = [];
    for (const r of records) { const w = Float32Array.from(r.weights), unchanged = differs(w, base).length === 0, h = TA.stat(unchanged && startHeld ? startHeld : await fly(w, heldOut)); runs.push({ ...r, heldOut: h, unchanged }); log(`  ${wiring} seed ${r.seed} (${r.kept} weights moved, ${r.synapses} synapses): held-out ${TA.line(h)}`); }
    runs.sort((a, b) => b.heldOut.mean - a.heldOut.mean || a.seed - b.seed);
    return { runs, champion: { ...runs[0], weights: Float32Array.from(runs[0].weights) } };
}
/** Does the fly's champion ship? It LEADS the hand gunner and LEADS the start on the audit pairs (z >= 2 each). Pure. */
export function qualifies(reading) {
    const reasons = [];
    if (!(reading.T1.z >= 2)) reasons.push(`against the hand gunner it reads ${TA.word(reading.T1.z)} (z ${reading.T1.z.toFixed(2)})`);
    if (!(reading.T2.z >= 2)) reasons.push(`against the start it reads ${TA.word(reading.T2.z)} (z ${reading.T2.z.toFixed(2)}): no better than the untrained hand rule that can be told`);
    return { ok: reasons.length === 0, reasons };
}
/** THE AUDIT, ONCE. `flyFly(w, list)` flies weights over the fly's wiring, `flyCtl` over the control's. The start (the hand weights: no synapse, so the same network over either wiring) is flown once, over the fly's. */
export async function finish(recsFly, recsCtl, { control = `control:${SK.CONTROL_SEED}`, flyFly, flyCtl, heldOut = HELD_OUT_PAIRS, audit = AUDIT_PAIRS, trainFirst = TRAIN_PAIRS[0].seed, log = () => {} } = {}) {
    const LF = SK.wiringOf("fly"), LC = SK.wiringOf(control), base = LF.handWeights(), isStart = (rs) => rs.some((r) => Array.isArray(r.weights) && r.weights.length === base.length && differs(Float32Array.from(r.weights), base).length === 0);
    const startHeld = isStart(recsFly) || isStart(recsCtl) ? await flyFly(base, heldOut) : null;
    const F = await choose(recsFly, "fly", flyFly, { heldOut, trainFirst, startHeld, log }), C = await choose(recsCtl, control, flyCtl, { heldOut, trainFirst, startHeld, log });
    const sl = await flyFly(base, audit), on = async (fly, c) => (c.unchanged ? sl : await fly(c.weights, audit)), d = (a, b) => TA.stat(a.map((v, i) => v - b[i]));
    const abl = async (fly, L, c, leads) => { const a = ablate(L, c.weights); return differs(a, c.weights).length === 0 ? leads : differs(a, base).length === 0 ? sl : await fly(a, audit); };
    const fl = await on(flyFly, F.champion), cl = await on(flyCtl, C.champion), fa = await abl(flyFly, LF, F.champion, fl), ca = await abl(flyCtl, LC, C.champion, cl);
    const reading = { T1: TA.stat(fl), T2: d(fl, sl), T3: d(fl, fa), T4: d(fl, cl), start: TA.stat(sl), control: TA.stat(cl), controlTraining: d(cl, sl), controlSynapses: d(cl, ca) }, words = Object.fromEntries(["T1", "T2", "T3", "T4"].map((k) => [k, TA.word(reading[k].z)])), verdict = qualifies(reading);
    log(`the fly's champion (seed ${F.champion.seed}; ${F.champion.kept} weights moved, ${F.champion.synapses} synapses) and the control's (seed ${C.champion.seed}; ${C.champion.kept} weights moved, ${C.champion.synapses} synapses), ${audit.length} audit pairs, read once:`);
    log(`     the start (the car's hand rule) against the hand gunner: ${TA.line(reading.start)}`);
    log(`  T1 the fly's champion against the hand gunner: ${TA.line(reading.T1)}`); log(`  T2 WHAT THE TRAINING BOUGHT (champion less the start): ${TA.line(reading.T2)}`); log(`  T3 its synapses (champion less its ablation): ${TA.line(reading.T3)}`);
    log(`     the control's champion against the hand gunner: ${TA.line(reading.control)}; its training: ${TA.line(reading.controlTraining)}; its synapses: ${TA.line(reading.controlSynapses)}`);
    log(`  T4 THE FLY'S WIRING LESS THE CONTROL'S: ${TA.line(reading.T4)}`);
    log(verdict.ok ? "QUALIFIES: it leads the hand gunner and it leads the start." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { fly: F, control: C, controlWiring: control, reading, words, verdict };
}
/** The file written when the fly's champion qualifies: a swek-brain-v1 blob whose `by` carries the recipe and the four readings. */
export function blobOf(result, { train = TRAIN_PAIRS, heldOut = HELD_OUT_PAIRS, audit = AUDIT_PAIRS } = {}) {
    const c = result.fly.champion, R = result.reading, seeds = (l) => `seeds ${l[0].seed}-${l[l.length - 1].seed} of each kind`;
    const by = `tools/ship/trainTrackSeat.mjs: (1+1)-ES from the race car's hand rule on the fly's target-tracking circuit, seed ${c.seed} of ${result.fly.runs.length} searches, ${c.iters} children (synapse, path, tune, bias), in fights with NO CANNON on either side and an EIGHTH of the magazines (the rounds-left sense on), a child kept only if it beat its parent by a paired test of z >= ${Z_ACCEPT} over ${train.length} train pairs (${seeds(train)}; ${c.improved} kept), then every moved weight put back unless it paid for itself: ${c.kept} of ${SK.WEIGHT_COUNT} weights differ from the start and ${c.synapses} of the circuit's ${SK.REC_EDGES} synapses carry a weight; ` +
        `champion picked on ${heldOut.length} held-out pairs: ${TA.line(c.heldOut)}; ${audit.length} audit pairs (${seeds(audit)}), read once: against the hand gunner ${TA.line(R.T1)}; the start ${TA.line(R.start)}; what the training bought (this less the start) ${TA.line(R.T2)}; its synapses (this less its ablation) ${TA.line(R.T3)}; THE WIRING -- this less the champion of the same search over a random circuit of its size (${result.controlWiring}, ${result.control.runs.length} searches, itself ${TA.line(R.control)}) -- ${TA.line(R.T4)}` +
        (c.synapses === 0 && result.control.champion.synapses === 0 ? ` *** NEITHER CHAMPION CARRIES A WEIGHT ON A SYNAPSE, SO THE WIRING TOOK NO PART: these weights fly the same fights over either circuit, and that difference is one search's luck against another's, not the fly's wiring ***` : "") + `; trained and read in one fight only`;
    return PB.exportBrain(PB.describePolicy(SK.POLICY_ID, SK), c.weights, { score: Number(R.T1.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02 (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const [step, ...rest] = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, known = ["seed", "iters", "record", "records-dir", "control-records-dir", "workers", "write", "out", "wiring"], bad = rest.filter((a) => a.startsWith("--") && !known.includes(a.slice(2)));
    if (!["search", "finish"].includes(step) || bad.length) { console.error(`trainTrackSeat: ${bad.length ? `unknown option ${bad.join(", ")}` : "the first argument is search or finish"}`); process.exit(2); }
    const wiring = arg("wiring", step === "finish" ? `control:${SK.CONTROL_SEED}` : "fly"); try { SK.wiringOf(wiring); } catch (e) { console.error("trainTrackSeat: " + e.message); process.exit(2); }
    if (step === "search" && !arg("record")) { console.error("trainTrackSeat: search needs --record <file.json>"); process.exit(2); }
    if (step === "finish" && (wiring === "fly" || !arg("records-dir") || !arg("control-records-dir"))) { console.error("trainTrackSeat: finish needs --records-dir <the fly's records>, --control-records-dir <the control's> and (if not control:4242) --wiring control:<seed>"); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json");
    if (step === "finish" && fs.existsSync(readingFile)) { console.error(`trainTrackSeat: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    if (step === "search" && fs.existsSync(arg("record"))) { console.log(`${arg("record")} is already there: this search is finished`); process.exit(0); }
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), flyOver = (wr) => (w, list) => pool.leads(jobsOf(Array.from(w), list, wr)), log = (m) => console.log(m);
    if (step === "search") {
        if (wiring !== "fly") console.log(`THE WIRING IS A CONTROL (${wiring}): a random circuit of the tracking circuit's size. Its weights are never a brain file.`);
        const ckpt = arg("record") + ".ckpt", checkpoint = { load: () => (fs.existsSync(ckpt) ? JSON.parse(fs.readFileSync(ckpt, "utf8")) : null), save: (st) => { fs.writeFileSync(ckpt + ".tmp", JSON.stringify(st)); fs.renameSync(ckpt + ".tmp", ckpt); } };
        fs.mkdirSync(path.dirname(path.resolve(arg("record"))), { recursive: true });
        const rec = await search({ seed: Number(arg("seed", RECIPE.seed)), iters: Number(arg("iters", RECIPE.iters)) }, log, { fly: flyOver(wiring), checkpoint, wiring }); fs.writeFileSync(arg("record"), JSON.stringify(rec) + "\n"); console.log(`wrote ${arg("record")}`);
    } else {
        const load = (d) => fs.readdirSync(d).filter((f) => /^s\d+\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(d, f), "utf8")));
        const result = await finish(load(arg("records-dir")), load(arg("control-records-dir")), { control: wiring, flyFly: flyOver("fly"), flyCtl: flyOver(wiring), log });
        const brief = (s) => ({ champion: s.champion.seed, runs: s.runs.map((r) => ({ seed: r.seed, iters: r.iters, heldOut: r.heldOut, kept: r.kept, synapses: r.synapses })) });
        fs.writeFileSync(readingFile, JSON.stringify({ control: wiring, fly: brief(result.fly), controlRuns: brief(result.control), reading: result.reading, words: result.words, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
        if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    }
    await pool.close(); process.exit(0);
}
