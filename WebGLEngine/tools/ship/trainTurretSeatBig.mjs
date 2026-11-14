// WebGLEngine/tools/ship/trainTurretSeatBig.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE TURRET SEAT'S SEARCH AGAIN, JUDGED ON ENOUGH PAIRS TO SEE WHAT IT IS DOING. tools/ship/trainTurretSeat.mjs judged every child on 8 pairs and kept any that scored higher; tools/ship/takeTurretAudit.mjs then read its four results on 300 fresh pairs and the training had bought nothing that could be told
// (a pair's lead has a standard deviation of 0.8: 8 pairs see nothing under 0.5). This is the same search -- the same children (trainTurretSeat.child: two in five move a synapse where it can matter), the same start (the car's hand weights), the same fight against the hand gunner -- with the judging changed:
//
//   THE TEST      a child replaces its parent only if it is BETTER BY A PAIRED TEST on the train pairs: the differences child - parent, pair by pair on the same geometries, have a mean at least Z_ACCEPT (2.5) standard errors above nothing over all 300. It is read IN STAGES so that a child that is going nowhere costs little:
//                 after 60, 120 and 200 pairs a child whose z is not above 0, 0.75 and 1.5 is dropped (FUTILE). A child the fights cannot tell from its parent (every difference 0) is dropped at 60. The stages and the order of the pairs are fixed, so the search is deterministic.
//                 WHAT THIS BUYS AND WHAT IT DOES NOT: with a couple of hundred children tried, a z of 2.5 one-sided lets through about one child that is no better, so an accepted change is LIKELY real and not CERTAINLY; the held-out and audit pairs are what say.
//   THE PRUNE     each weight that differs from the start is put back unless the network WITH it beats the network WITHOUT it by the same test: a weight has to pay for itself on 300 pairs, a synapse included.
//   THE SETS      300 train pairs (seeds 3001-3075 of each kind), 300 held-out (4001-4075), 600 audit (5001-5150). None has been flown by any search, gate or audit before.
//   WHAT SHIPS    several searches (one after another: each uses every core through tools/ship/pairPool.mjs); the champion is the best on held-out; the audit is read once, with tools/ship/takeTurretAudit.mjs's words at its z of 2: the champion against the hand gunner, the champion less the START, the champion less its
//                 ABLATION. It is written (brain/seatTurretGunnerWeightsBig.json -- the earlier file is left as it is) only if it LEADS the hand gunner AND LEADS the start: a gunner no better than the car's untrained hand weights is not a trained gunner, which is what the first trainer's rule missed.
//
//     ... --round 2   on either step: the second round (see ROUNDS below): from the round-1 champion, on fresh pairs, into brain/seatTurretGunnerWeightsBig2.json. Keep its records in a directory of their own.
//     node tools/ship/trainTurretSeatBig.mjs search --seed 9000 --iters 200 --record <dir>/s9000.json [--workers 4]     # RESUMABLE: it keeps <record>.ckpt after every child; the same command goes on from it
//     node tools/ship/trainTurretSeatBig.mjs finish --records-dir <dir> [--write]                                        # every s<seed>.json there; REFUSES to read the audit a second time (the reading file is its mark)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as T from "./trainTurretSeat.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_OUT = path.resolve(HERE, "..", "..", "brain", "seatTurretGunnerWeightsBig.json");
export const RECIPE = Object.freeze({ iters: 200, seed: 9000, sigma: 0.5, maxK: 3 });
export const Z_ACCEPT = 2.5, STAGES = Object.freeze([Object.freeze({ n: 60, z: 0 }), Object.freeze({ n: 120, z: 0.75 }), Object.freeze({ n: 200, z: 1.5 }), Object.freeze({ n: 300, z: Z_ACCEPT })]);
const pairs = (from, count) => Object.freeze(Array.from({ length: count }, (_, i) => from + i).flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed }))));   // seed by seed, the four kinds in turn: every stage holds each kind equally
export const TRAIN_PAIRS = pairs(3001, 75), HELD_OUT_PAIRS = pairs(4001, 75), AUDIT_PAIRS = pairs(5001, 150);
/**
 * THE ROUNDS. Round 1 is the search above, from the car's hand weights; its champion (brain/seatTurretGunnerWeightsBig.json, 2026-11-14) learned one thing -- to hold the trigger whenever it has a target -- and four searches of 1,000 children found nothing else. ROUND 2 (Keith: "lets do option 2 first") STARTS FROM THAT CHAMPION,
 * so that 'always fire' is the baseline and anything kept has to be better than it: the same children, the same test, the prune back to the round's START (not to the car's weights), and FRESH pairs throughout -- train seeds 6101-6175, held-out 7001-7075, audit 8001-8150, none flown by anything before. Its champion ships
 * (brain/seatTurretGunnerWeightsBig2.json) only if on the audit it leads the hand gunner AND leads its start, the round-1 champion. `its synapses` in round 2 is the champion less the champion with every synapse put back to the START's value: the worth of the synapses this round added, not of the one it began with.
 */
export const ROUNDS = Object.freeze({
    1: Object.freeze({ round: 1, train: TRAIN_PAIRS, heldOut: HELD_OUT_PAIRS, audit: AUDIT_PAIRS, startFile: null, startLabel: "the car's hand weights", out: "seatTurretGunnerWeightsBig.json" }),
    2: Object.freeze({ round: 2, train: pairs(6101, 75), heldOut: pairs(7001, 75), audit: pairs(8001, 150), startFile: "seatTurretGunnerWeightsBig.json", startLabel: "the round-1 champion (brain/seatTurretGunnerWeightsBig.json: the car's hand weights that always fire)", out: "seatTurretGunnerWeightsBig2.json" }),
});
/** `w` with every synapse put back to `base`'s value: the ablation of what a round added. */
export function ablateTo(w, base) { const o = Float32Array.from(w); for (let k = 0; k < ST.REC_EDGES; k++) o[ST.synapseAt(k)] = base[ST.synapseAt(k)]; return o; }
const fnv = (w) => { const u = new Uint8Array(Float32Array.from(w).buffer); let h = 0x811c9dc5; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
const HAND = Object.freeze({ id: "hand" }), netSide = (w) => ({ id: "net", network: { policy: ST.POLICY_ID, weights: w } });
/** The jobs (tools/ship/pairPool.mjs) of weights `w` against the hand gunner over `list`. */
export const jobsOf = (w, list) => list.map(({ kind, seed }) => ({ x: netSide(w), y: HAND, kind, seed }));

/**
 * THE STAGED PAIRED TEST. `leadsOf(from, to)` -> Promise of the candidate's leads on pairs from..to-1 of the list; `base` the other network's leads on the whole list. Returns { accepted, stage (the number of pairs read), z, mean, leads (what was read) }: accepted only at the last stage with z >= its z;
 * dropped at an earlier stage whose z it is not ABOVE. Pure but for leadsOf.
 */
export async function stagedTest(leadsOf, base, stages = STAGES) {
    const leads = []; let s = { mean: 0, se: 0, z: 0 };
    for (let k = 0; k < stages.length; k++) {
        const got = await leadsOf(leads.length, stages[k].n); for (const v of got) leads.push(v);
        s = TA.stat(leads.map((v, i) => v - base[i]));
        const last = k === stages.length - 1;
        if (last ? !(s.z >= stages[k].z) : !(s.z > stages[k].z)) return { accepted: false, stage: leads.length, z: s.z, mean: s.mean, leads };
    }
    return { accepted: true, stage: leads.length, z: s.z, mean: s.mean, leads };
}

/**
 * The search. `fly(w, list)` -> Promise of leads (default: the pool's). Returns a record: { seed, iters, sigma, maxK, weights (an array), trainLeads (the final network's 300), startTrain, train (means), improved, by, tried, stages (children dropped at each stage and accepted), accepted: [{ i, kind, z, mean }],
 * pruned: [{ index, kept, z }], moved, kept, synapsesBefore, synapses, pairsFlown }.
 */
export async function search(opts = {}, log = () => {}, { fly, train = TRAIN_PAIRS, stages = STAGES, startLeads = null, checkpoint = null, start = null } = {}) {
    const o = { ...RECIPE, ...opts }, gen = { a: o.seed >>> 0 }, rng = () => { gen.a = (gen.a + 0x6D2B79F5) >>> 0; let t = gen.a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }, mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length; let flown = 0;
    const leadsOn = async (w, from, to) => { const l = await fly(w, train.slice(from, to)); flown += l.length; return l; };
    // A CHECKPOINT ({ load() -> state | null, save(state) }, the command's: a file) lets a search of hours be stopped and gone on with: the state after each child is everything the next child depends on (the generator's word, the parent, its leads, the counts), so a search resumed is the search not stopped, to the bit.
    const base = start ? Float32Array.from(start) : T.startWeights(), startHash = fnv(base);   // what the search starts from and the prune goes back to: the car's hand weights, or a round's start
    const saved = checkpoint ? checkpoint.load() : null;
    if (saved && (saved.seed !== o.seed || saved.sigma !== o.sigma || saved.maxK !== o.maxK || saved.trainPairs !== train.length || (saved.startHash ?? fnv(T.startWeights())) !== startHash || (saved.trainFirst ?? TRAIN_PAIRS[0].seed) !== train[0].seed)) throw new Error(`trainTurretSeatBig.search: the checkpoint is another search's (seed ${saved.seed}, sigma ${saved.sigma}, ${saved.trainPairs} train pairs)`);
    let best = saved ? Float32Array.from(saved.best) : Float32Array.from(base), bestLeads = saved ? saved.bestLeads.slice() : startLeads ? startLeads.slice() : await leadsOn(best, 0, train.length); const startTrain = saved ? saved.startTrain : mean(bestLeads);
    const by = saved ? saved.by : { synapse: 0, path: 0, tune: 0, bias: 0 }, tried = saved ? saved.tried : { synapse: 0, path: 0, tune: 0, bias: 0 }, dropped = saved ? saved.dropped : Object.fromEntries(stages.map((s) => [s.n, 0])), accepted = saved ? saved.accepted : [];
    if (saved) { gen.a = saved.gen; flown = saved.flown; log(`  seed ${o.seed}: resumed after child ${saved.i} (${accepted.length} accepted, ${flown} pairs flown)`); } else log(`  seed ${o.seed}: the start on the ${train.length} train pairs ${startTrain.toFixed(3)}`);
    for (let i = saved ? saved.i + 1 : 1; i <= o.iters; i++) {
        const c = T.child(best, o.sigma, rng, o.maxK); tried[c.kind]++;
        const r = await stagedTest((from, to) => leadsOn(c.w, from, to), bestLeads, stages);
        if (r.accepted) { best = c.w; bestLeads = r.leads; by[c.kind]++; accepted.push({ i, kind: c.kind, z: r.z, mean: r.mean }); log(`    seed ${o.seed} iteration ${i}: a ${c.kind} child ACCEPTED, +${r.mean.toFixed(3)} over its parent (z ${r.z.toFixed(2)}); train ${mean(bestLeads).toFixed(3)}, ${ST.synapsesUsed(best)} synapses`); }
        else dropped[r.stage]++;
        if (checkpoint) checkpoint.save({ seed: o.seed, sigma: o.sigma, maxK: o.maxK, trainPairs: train.length, trainFirst: train[0].seed, startHash, i, gen: gen.a, best: Array.from(best), bestLeads, startTrain, by, tried, dropped, accepted, flown });
        if (i % 20 === 0) log(`    seed ${o.seed} iteration ${i}: train ${mean(bestLeads).toFixed(3)}, ${accepted.length} accepted, ${flown} pairs flown`);
    }
    // the prune: a weight stays only if the network WITH it beats the network WITHOUT it
    const moved = T.differs(best, base), synapsesBefore = ST.synapsesUsed(best), pruned = [];
    for (const index of moved) {
        const without = Float32Array.from(best); without[index] = base[index];
        const wl = await leadsOn(without, 0, train.length), s = TA.stat(bestLeads.map((v, k) => v - wl[k])), kept = s.z >= Z_ACCEPT;
        pruned.push({ index, kept, z: s.z });
        if (!kept) { best = without; bestLeads = wl; }
    }
    log(`  seed ${o.seed}: train ${startTrain.toFixed(3)} -> ${mean(bestLeads).toFixed(3)}, ${accepted.length} accepted of ${o.iters} (${Object.entries(by).map(([k, v]) => `${k} ${v} of ${tried[k]}`).join(", ")}); dropped at ${Object.entries(dropped).map(([n, v]) => `${n}: ${v}`).join(", ")}; the prune kept ${pruned.filter((p) => p.kept).length} of ${moved.length} moved weights; ${synapsesBefore} synapses before it, ${ST.synapsesUsed(best)} after; ${flown} pairs flown`);
    return { seed: o.seed, iters: o.iters, sigma: o.sigma, maxK: o.maxK, startHash, trainFirst: train[0].seed, weights: Array.from(best), trainLeads: bestLeads, startTrain, train: mean(bestLeads), improved: accepted.length, by, tried, stages: dropped, accepted, pruned, moved: moved.length, kept: T.differs(best, base).length, synapsesBefore, synapses: ST.synapsesUsed(best), pairsFlown: flown };
}

/** Does the champion ship? It LEADS the hand gunner and LEADS the start on the audit pairs (z >= 2 each). Pure. */
export function qualifies(r) {
    const reasons = [];
    if (!(r.lead.z >= 2)) reasons.push(`against the hand gunner it reads ${TA.word(r.lead.z)} (z ${r.lead.z.toFixed(2)})`);
    if (!(r.training.z >= 2)) reasons.push(`against the start it reads ${TA.word(r.training.z)} (z ${r.training.z.toFixed(2)}): no better than the car's untrained hand weights that can be told`);
    return { ok: reasons.length === 0, reasons };
}
/** The choice: every record's held-out lead; the best is the champion (the lower seed on a tie); the audit, once: the champion, the start and the ablation on the same 600 pairs. */
export async function finish(records, log = () => {}, { fly, heldOut = HELD_OUT_PAIRS, audit = AUDIT_PAIRS, start = null } = {}) {
    if (!Array.isArray(records) || !records.length) throw new Error("trainTurretSeatBig.finish: no search records to choose from");
    const base = start ? Float32Array.from(start) : T.startWeights(), startHash = fnv(base);
    for (const r of records) if ((r.startHash ?? fnv(T.startWeights())) !== startHash) throw new Error(`trainTurretSeatBig.finish: the record of seed ${r.seed} started from other weights than this round's start (${r.startHash} against ${startHash}): it is another round's`);
    const runs = [];
    for (const r of records) { const w = Float32Array.from(r.weights), unchanged = T.differs(w, base).length === 0, h = TA.stat(await fly(w, heldOut)); runs.push({ ...r, heldOut: h, unchanged }); log(`  seed ${r.seed} (${r.kept} weights moved, ${r.synapses} synapses): held-out ${TA.line(h)}`); }
    runs.sort((a, b) => b.heldOut.mean - a.heldOut.mean || a.seed - b.seed);
    const c = runs[0], w = Float32Array.from(c.weights), cl = await fly(w, audit), sl = await fly(base, audit), abl = ablateTo(w, base), al = T.differs(abl, w).length ? await fly(abl, audit) : cl, d = (a, b) => TA.stat(a.map((v, i) => v - b[i]));
    const reading = { lead: TA.stat(cl), start: TA.stat(sl), training: d(cl, sl), synapses: d(cl, al), ablation: TA.stat(al) }, verdict = qualifies(reading);
    log(`champion (seed ${c.seed}, the best held-out of ${runs.length}; ${c.kept} weights moved, ${c.synapses} synapses), ${audit.length} audit pairs, read once:`);
    log(`  against the hand gunner: ${TA.line(reading.lead)}`); log(`  the start against the hand gunner: ${TA.line(reading.start)}`); log(`  WHAT THE TRAINING BOUGHT (champion less the start): ${TA.line(reading.training)}`); log(`  ITS SYNAPSES (champion less its ablation): ${TA.line(reading.synapses)}`);
    log(verdict.ok ? "QUALIFIES: it leads the hand gunner and it leads the start." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { runs, champion: { ...c, weights: w }, reading, verdict };
}
/** The file written when the champion qualifies. */
export function blobOf(result, round = ROUNDS[1]) {
    const c = result.champion, R = result.reading, TRAIN_PAIRS = round.train, HELD_OUT_PAIRS = round.heldOut, AUDIT_PAIRS = round.audit, seeds = (l) => `seeds ${l[0].seed}-${l[l.length - 1].seed} of each kind`;
    const by = `TRAINED IN A CAPITAL SHIP'S GUN SEAT, NOT ON THE RACE (tools/ship/trainTurretSeatBig.mjs, round ${round.round}): (1+1)-ES from ${round.startLabel}, seed ${c.seed} of ${result.runs.length} searches, ${c.iters} children (synapse, path, tune, bias), a child kept only if it beat its parent by a paired test of z >= ${Z_ACCEPT} over ${TRAIN_PAIRS.length} train pairs (${seeds(TRAIN_PAIRS)}; ${c.improved} kept), then every moved weight put back unless it paid for itself by the same test: ${c.kept} of ${ST.WEIGHT_COUNT} weights differ from ${round.round === 1 ? "the car's hand weights" : "that start"} and ${c.synapses} of the circuit's ${ST.REC_EDGES} synapses carry a weight; ` +
        `champion picked on ${HELD_OUT_PAIRS.length} held-out pairs: ${TA.line(c.heldOut)}; ${AUDIT_PAIRS.length} audit pairs (${seeds(AUDIT_PAIRS)}), read once: against the hand gunner ${TA.line(R.lead)}; the start ${TA.line(R.start)}; what the training bought (this less the start) ${TA.line(R.training)}; its synapses (this less its ablation) ${TA.line(R.synapses)}`;
    return PB.exportBrain(PB.describePolicy(ST.POLICY_ID, ST), c.weights, { score: Number(R.lead.mean.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const [step, ...rest] = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, known = ["seed", "iters", "record", "records", "records-dir", "workers", "write", "out", "round"], bad = rest.filter((a) => a.startsWith("--") && !known.includes(a.slice(2)));
    if (!["search", "finish"].includes(step) || bad.length) { console.error(`trainTurretSeatBig: ${bad.length ? `unknown option ${bad.join(", ")}` : "the first argument is search or finish"}`); process.exit(2); }
    const round = ROUNDS[arg("round", "1")]; if (!round) { console.error(`trainTurretSeatBig: --round is 1 or 2 (got ${arg("round")})`); process.exit(2); }
    const brainDir = path.resolve(HERE, "..", "..", "brain"), roundOut = path.join(brainDir, round.out);
    let start = null; if (round.startFile) { const r = PB.importBrain(PB.describePolicy(ST.POLICY_ID, ST), JSON.parse(fs.readFileSync(path.join(brainDir, round.startFile), "utf8"))); if (!r.ok) { console.error(`trainTurretSeatBig: round ${round.round} starts from brain/${round.startFile}, which is refused: ${r.reason}`); process.exit(2); } start = r.weights; console.log(`round ${round.round}: from ${round.startLabel}`); }
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), fly = (w, list) => pool.leads(jobsOf(Array.from(w), list)), log = (m) => console.log(m);
    if (step === "search") {
        if (!arg("record")) { console.error("trainTurretSeatBig: search needs --record <file.json>"); process.exit(2); }
        const ckpt = arg("record") + ".ckpt", checkpoint = { load: () => (fs.existsSync(ckpt) ? JSON.parse(fs.readFileSync(ckpt, "utf8")) : null), save: (st) => { fs.writeFileSync(ckpt + ".tmp", JSON.stringify(st)); fs.renameSync(ckpt + ".tmp", ckpt); } };
        if (fs.existsSync(arg("record"))) { console.log(`${arg("record")} is already there: this search is finished`); await pool.close(); process.exit(0); }
        fs.mkdirSync(path.dirname(path.resolve(arg("record"))), { recursive: true });
        const rec = await search({ seed: Number(arg("seed", RECIPE.seed)), iters: Number(arg("iters", RECIPE.iters)) }, log, { fly, checkpoint, train: round.train, start }); fs.writeFileSync(arg("record"), JSON.stringify(rec) + "\n"); console.log(`wrote ${arg("record")}`);
    } else {
        const dir = arg("records-dir"), files = dir ? fs.readdirSync(dir).filter((f) => /^s\d+\.json$/.test(f)).sort().map((f) => path.join(dir, f)) : (arg("records") || "").split(",").filter(Boolean);
        if (!files.length) { console.error("trainTurretSeatBig: finish needs --records a.json,b.json or --records-dir <dir of s<seed>.json>"); process.exit(2); }
        const outBase = arg("out", roundOut), readingFile = outBase.replace(/\.json$/, ".reading.json");
        if (fs.existsSync(readingFile)) { console.error(`trainTurretSeatBig: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
        console.log(`the records: ${files.join(", ")}`);
        const result = await finish(files.map((f) => JSON.parse(fs.readFileSync(f, "utf8"))), log, { fly, heldOut: round.heldOut, audit: round.audit, start });
        fs.writeFileSync(outBase.replace(/\.json$/, ".reading.json"), JSON.stringify({ round: round.round, champion: result.champion.seed, runs: result.runs.map((r) => ({ seed: r.seed, heldOut: r.heldOut, kept: r.kept, synapses: r.synapses })), reading: result.reading, verdict: result.verdict }) + "\n");
        if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { const blob = blobOf(result, round); fs.writeFileSync(outBase, JSON.stringify(blob) + "\n"); console.log(`wrote ${outBase}`); } }
    }
    await pool.close(); process.exit(0);
}
