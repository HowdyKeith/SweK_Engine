// WebGLEngine/tools/ship/trainTurretSeatToday.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CAR'S GUNNER NETWORK, TRAINED IN TODAY'S FIGHT. The car's gunner (brain/seatTurretGunnerWeightsBig.json, tools/ship/trainTurretSeatBig.mjs round 1) was trained against the HAND gunner with no helm network on either side; what it learned is to hold the trigger whenever it has a target.
// Today the duel page's best ship carries the cannon-aware fly-wired helm (helmFlyWired3), and one ship a side its gunner is the no-window fly-wired gunner -- which the car's gunner is level with there (tools/ship/takeFlyWiredOneWindow.mjs, tools/ship/takeButtonOneHard.mjs).
// Keith: "then 3" (a gunner network trained in today's fight). This is trainTurretSeatBig's search -- the same children, the same staged paired test (z 2.5 at 300 pairs), the same prune, the same choice of a champion on held-out pairs and the same once-read audit -- in that fight.
//
//   node tools/ship/trainTurretSeatToday.mjs [--workers n] [--write]      (resumable: each search keeps a checkpoint in the system's temporary folder; the records go to brain/rig-results/turretSeatToday/)
//
//   THE FIGHT     one ship a side, the cannon on both sides, BOTH under the cannon-aware fly-wired helm; the network in the seats against the no-window fly-wired gunner (brain/seatFlyWired11WeightsOne.json). A lead is the network's side's against it.
//   THE START     the car's gunner (brain/seatTurretGunnerWeightsBig.json); the prune goes back to it.
//   THE SEARCHES  two, seeds 9400 and 9401, 150 children each, one after the other (RECIPE's sigma 0.5 and three moves at most).
//   THE SETS      300 train pairs (seeds 931001-931075 of each kind), 300 held-out (941001-941075), 600 audit (951001-951150), seed by seed with the four kinds in turn. None flown by anything before.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings (trainTurretSeatBig.finish's): the champion against the fly-wired gunner; the start against it; WHAT THE TRAINING BOUGHT (the champion less the start, pair by pair); its synapses (the champion less its ablation).
// FORECAST, for the record: the search finds little (four searches of 1,000 children found nothing past always-fire in round 2); the training buys something under 0.05 that cannot be told; nothing ships.
// WHAT SHIPS: brain/seatTurretGunnerWeightsToday.json (policy seatTurretGunner) only if on the audit the champion LEADS the fly-wired gunner AND LEADS its start (trainTurretSeatBig.qualifies). The duel page then gains it as a hand (its note carrying the audit); the
//   by-the-fight button keeps its pick until a study flies the new hand where the button is used.
// trainTurretSeatBig.finish's log says "the hand gunner" for the other side: here that side is the no-window fly-wired gunner.
// @@READ@@
// WHAT IS NOT HERE: fleets, escorts, fighters, the rationed fight, the bow-on rule, the fly-wired gunner's own weights.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as B from "./trainTurretSeatBig.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "turretSeatToday");
export const FILES = Object.freeze({ start: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), foe: path.join(BRAIN, "seatFlyWired11WeightsOne.json"), helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json") });
export const SEEDS = Object.freeze([9400, 9401]), ITERS = 150;
const pairs = (from, count) => Object.freeze(Array.from({ length: count }, (_, i) => from + i).flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed }))));
export const SETS = Object.freeze({ train: pairs(931001, 75), held: pairs(941001, 75), audit: pairs(951001, 150) });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`trainTurretSeatToday: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { start: one(FILES.start, ST.POLICY_ID, ST), foe: one(FILES.foe, FT.POLICY_ID11, FT.nearAlways), helm: one(FILES.helm, FS.POLICY_ID3, FS.third) };
}
/** The jobs of the gunner weights `w` on `list`: today's fight. */
export const jobsOf = (w, list, b) => list.map(({ kind, seed }) => ({ x: { id: "net", cannon: true, network: { policy: ST.POLICY_ID, weights: Array.from(w) }, helmNet: b.helm }, y: { id: "fly", cannon: true, network: b.foe, helmNet: b.helm }, kind, seed, opts: { ships: 1 } }));
/** The study: the searches (each `search(seed)` -> Promise of a record), then trainTurretSeatBig.finish over them. `fly(w, list)` -> Promise of leads. */
export async function study({ fly, search, start }, log = () => {}) {
    const records = []; for (const seed of SEEDS) records.push(await search(seed));
    return B.finish(records, log, { fly, heldOut: SETS.held, audit: SETS.audit, start, trainFirst: SETS.train[0].seed });
}
/** The file written when the champion qualifies. */
export function blobOf(result) {
    const c = result.champion, R = result.reading;
    const by = `TRAINED IN TODAY'S FIGHT (tools/ship/trainTurretSeatToday.mjs): trainTurretSeatBig's (1+1)-ES from the car's gunner, seed ${c.seed} of ${result.runs.length} searches of ${ITERS} children, one ship a side, the cannon on both sides, both under the cannon-aware fly-wired helm, against the no-window fly-wired gunner; held-out ${TA.line(c.heldOut)}; 600 audit pairs read once: against the fly-wired gunner ${TA.line(R.lead)}; the start ${TA.line(R.start)}; what the training bought ${TA.line(R.training)}; its synapses ${TA.line(R.synapses)}`;
    return PB.exportBrain(PB.describePolicy(ST.POLICY_ID, ST), c.weights, { score: Number(R.lead.mean.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`trainTurretSeatToday: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`trainTurretSeatToday: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(), start = Float32Array.from(b.start.weights); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), fly = (w, list) => pool.leads(jobsOf(w, list, b)), log = (m) => console.log(m);
    const search = async (seed) => {
        const rec = path.join(kept, `s${seed}.json`); if (fs.existsSync(rec)) return JSON.parse(fs.readFileSync(rec, "utf8"));
        const ckpt = path.join(os.tmpdir(), `turretSeatToday-${path.basename(path.resolve(kept))}-s${seed}.ckpt`), checkpoint = { load: () => (fs.existsSync(ckpt) ? JSON.parse(fs.readFileSync(ckpt, "utf8")) : null), save: (st) => { fs.writeFileSync(ckpt + ".tmp", JSON.stringify(st)); fs.renameSync(ckpt + ".tmp", ckpt); } };
        const r = await B.search({ seed, iters: ITERS }, log, { fly, checkpoint, train: SETS.train, start }); fs.writeFileSync(rec, JSON.stringify(r) + "\n"); fs.rmSync(ckpt, { force: true }); return r;
    };
    const result = await study({ fly, search, start }, log);
    fs.writeFileSync(readingFile, JSON.stringify({ champion: result.champion.seed, runs: result.runs.map((r) => ({ seed: r.seed, heldOut: r.heldOut, kept: r.kept, synapses: r.synapses, improved: r.improved })), reading: result.reading, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
