// WebGLEngine/tools/ship/trainTurretSeatFleet.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CAR'S GUNNER NETWORK, TRAINED AGAIN, IN FLEETS OF THREE. tools/ship/trainTurretSeatToday.mjs trained the car's gunner one ship a side under the cannon-aware helm against the no-window fly-wired gunner and it qualified (+0.051 there, z 2.12;
// the training bought +0.117): the page carries it as `car-today`. Flown where the button is used (tools/ship/takeCarToday.mjs) it TRAILS the 45-degree fly-wired gunner in fleets of three by 0.177 (z -5.40). Keith: "then 2" (train it in fleets).
// This is trainTurretSeatToday's search -- trainTurretSeatBig's children, staged paired test, prune, held-out choice and once-read audit -- in a fleet.
//
//   node tools/ship/trainTurretSeatFleet.mjs [--workers n] [--write]      (resumable: the search keeps a checkpoint in the system's temporary folder; the records go to brain/rig-results/turretSeatFleet/)
//
//   THE FIGHT     FLEETS OF THREE a side, the cannon on both sides, BOTH under the cannon-aware fly-wired helm (the page's file, brain/helmFlyWired3WeightsNoCannon.json: with a cannon the shipped helm to the bit); the network in every seat of its
//                 fleet against the 45-degree fly-wired gunner (brain/seatFlyWired11WeightsDefault.json, the button's pick in a fleet). A lead is the network's side's against it.
//   THE START     car-today (brain/seatTurretGunnerWeightsToday.json); the prune goes back to it.
//   THE SEARCH    ONE, seed 9500, 150 children (RECIPE's sigma 0.5 and three moves at most) -- one, not two: a fleet's pair costs about three of one ship a side's.
//   THE SETS      300 train pairs (seeds 1161001-1161075 of each kind), 300 held-out (1171001-1171075), 600 audit (1181001-1181150), seed by seed with the four kinds in turn. None flown by anything before.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings (trainTurretSeatBig.finish's): the champion against the 45-degree gunner; the start against it; WHAT THE TRAINING BOUGHT (the champion less the start, pair by pair); its synapses
//   (the champion less its ablation).
// FORECAST, for the record: the training buys something (about +0.1, as one ship a side), not enough to lead the 45-degree gunner from 0.18 behind: nothing ships.
// WHAT SHIPS: brain/seatTurretGunnerWeightsFleet.json (policy gunnerPolicy) only if on the audit the champion LEADS the 45-degree gunner AND LEADS its start (trainTurretSeatBig.qualifies). The duel page then gains it as a hand (its note carrying the
//   audit); the by-the-fight button keeps its pick until a study flies the new hand where the button is used.
// trainTurretSeatBig.finish's log says "the hand gunner" for the other side: here that side is the 45-degree fly-wired gunner.
// @@READ@@
// WHAT IS NOT HERE: one ship a side, escorts, fighters, the bow-on rule, the rationed fight, the fly-wired gunner's own weights.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatTurretGunnerWeightsFleet.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "turretSeatFleet");
export const FILES = Object.freeze({ start: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), foe: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json") });
export const SEEDS = Object.freeze([9500]), ITERS = 150;
const pairs = (from, count) => Object.freeze(Array.from({ length: count }, (_, i) => from + i).flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed }))));
export const SETS = Object.freeze({ train: pairs(1161001, 75), held: pairs(1171001, 75), audit: pairs(1181001, 150) });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`trainTurretSeatFleet: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { start: one(FILES.start, ST.POLICY_ID, ST), foe: one(FILES.foe, FT.POLICY_ID11, FT.nearAlways), helm: one(FILES.helm, FS.POLICY_ID3, FS.third) };
}
/** The jobs of the gunner weights `w` on `list`: fleets of three. */
export const jobsOf = (w, list, b) => list.map(({ kind, seed }) => ({ x: { id: "net", cannon: true, network: { policy: ST.POLICY_ID, weights: Array.from(w) }, helmNet: b.helm }, y: { id: "fly", cannon: true, network: b.foe, helmNet: b.helm }, kind, seed, opts: { ships: 3 } }));
/** The study: the searches (each `search(seed)` -> Promise of a record), then trainTurretSeatBig.finish over them. `fly(w, list)` -> Promise of leads. */
export async function study({ fly, search, start }, log = () => {}) {
    const records = []; for (const seed of SEEDS) records.push(await search(seed));
    return B.finish(records, log, { fly, heldOut: SETS.held, audit: SETS.audit, start, trainFirst: SETS.train[0].seed });
}
/** The file written when the champion qualifies. */
export function blobOf(result) {
    const c = result.champion, R = result.reading;
    const by = `TRAINED IN FLEETS OF THREE (tools/ship/trainTurretSeatFleet.mjs): trainTurretSeatBig's (1+1)-ES from car-today (trained in today's fight), seed ${c.seed} of ${result.runs.length} searches of ${ITERS} children, fleets of three a side, the cannon on both sides, both under the cannon-aware fly-wired helm, against the 45-degree fly-wired gunner; held-out ${TA.line(c.heldOut)}; 600 audit pairs read once: against the fly-wired gunner ${TA.line(R.lead)}; the start ${TA.line(R.start)}; what the training bought ${TA.line(R.training)}; its synapses ${TA.line(R.synapses)}`;
    return PB.exportBrain(PB.describePolicy(ST.POLICY_ID, ST), c.weights, { score: Number(R.lead.mean.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`trainTurretSeatFleet: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`trainTurretSeatFleet: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(), start = Float32Array.from(b.start.weights); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), fly = (w, list) => pool.leads(jobsOf(w, list, b)), log = (m) => console.log(m);
    const search = async (seed) => {
        const rec = path.join(kept, `s${seed}.json`); if (fs.existsSync(rec)) return JSON.parse(fs.readFileSync(rec, "utf8"));
        const ckpt = path.join(os.tmpdir(), `turretSeatFleet-${path.basename(path.resolve(kept))}-s${seed}.ckpt`), checkpoint = { load: () => (fs.existsSync(ckpt) ? JSON.parse(fs.readFileSync(ckpt, "utf8")) : null), save: (st) => { fs.writeFileSync(ckpt + ".tmp", JSON.stringify(st)); fs.renameSync(ckpt + ".tmp", ckpt); } };
        const r = await B.search({ seed, iters: ITERS }, log, { fly, checkpoint, train: SETS.train, start }); fs.writeFileSync(rec, JSON.stringify(r) + "\n"); fs.rmSync(ckpt, { force: true }); return r;
    };
    const result = await study({ fly, search, start }, log);
    fs.writeFileSync(readingFile, JSON.stringify({ champion: result.champion.seed, runs: result.runs.map((r) => ({ seed: r.seed, heldOut: r.heldOut, kept: r.kept, synapses: r.synapses, improved: r.improved })), reading: result.reading, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
