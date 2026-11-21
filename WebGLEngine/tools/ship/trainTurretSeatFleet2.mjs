// WebGLEngine/tools/ship/trainTurretSeatFleet2.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CAR'S GUNNER NETWORK, TRAINED IN FLEETS OF THREE AGAIN, IN SMALLER STEPS. tools/ship/trainTurretSeatFleet.mjs searched from car-today in fleets of three with trainTurretSeatBig's recipe (sigma 0.5, up to three moves a child) and accepted none of
// 150 children: 139 were dropped at the first stage of 60 pairs, so every step it tried cost car-today something that could be seen. Keith: "4" (the same search with smaller steps).
// This is trainTurretSeatFleet's search -- trainTurretSeatBig's children, staged paired test, prune, held-out choice and once-read audit -- with SIGMA 0.1 AND ONE MOVE A CHILD, on fresh pairs.
//
//   node tools/ship/trainTurretSeatFleet2.mjs [--workers n] [--write]      (resumable: the search keeps a checkpoint in the system's temporary folder; the records go to brain/rig-results/turretSeatFleet2/)
//
//   THE FIGHT     as trainTurretSeatFleet's: FLEETS OF THREE a side, the cannon on both sides, BOTH under the cannon-aware fly-wired helm (brain/helmFlyWired3WeightsNoCannon.json); the network in every seat of its fleet against the 45-degree fly-wired
//                 gunner (brain/seatFlyWired11WeightsDefault.json, the button's pick in a fleet). A lead is the network's side's against it.
//   THE START     car-today (brain/seatTurretGunnerWeightsToday.json); the prune goes back to it.
//   THE SEARCH    ONE, seed 9510, 150 children, SIGMA 0.1, ONE MOVE AT MOST (trainTurretSeatBig.search's `sigma` and `maxK`).
//   THE SETS      300 train pairs (seeds 1291001-1291075 of each kind), 300 held-out (1301001-1301075), 600 audit (1311001-1311150), seed by seed with the four kinds in turn. None flown by anything before.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings (trainTurretSeatBig.finish's): the champion against the 45-degree gunner; the start against it; WHAT THE TRAINING BOUGHT (the champion less the start, pair by pair); its synapses
//   (the champion less its ablation).
// FORECAST, for the record: smaller steps are accepted (a few of 150) and buy a little (+0.02 to +0.05, perhaps not told), nowhere near the 0.25 car-today trails by: nothing ships.
// WHAT SHIPS: brain/seatTurretGunnerWeightsFleet2.json (policy gunnerPolicy) only if on the audit the champion LEADS the 45-degree gunner AND LEADS its start (trainTurretSeatBig.qualifies). The duel page then gains it as a hand (its note carrying
//   the audit); the by-the-fight button keeps its pick until a study flies the new hand where the button is used.
// trainTurretSeatBig.finish's log says "the hand gunner" for the other side: here that side is the 45-degree fly-wired gunner.
// READ 2026-11-21 (brain/seatTurretGunnerWeightsFleet2.reading.json; the kept search in brain/rig-results/turretSeatFleet2/): IT DOES NOT QUALIFY, AND NOTHING WAS WRITTEN. In steps of sigma 0.1, one weight a child, the search
//   accepted none of its 150 children either (train -0.272 -> -0.272; 127 dropped at the first stage of 60 pairs), so the champion is car-today itself: on the audit it TRAILS the 45-degree gunner by 0.242 (z -7.14), and the training bought
//   nothing (+0.000). The forecast (a few accepted, +0.02 to +0.05) was wrong. TWO SEARCHES FROM CAR-TODAY, BIG STEPS AND SMALL, FOUND NO MOVE THAT HELPS IT IN A FLEET; the by-the-fight button keeps the 45-degree gunner there.
// WHAT IS NOT HERE: one ship a side, escorts, fighters, the bow-on rule, the rationed fight, the fly-wired gunner's own weights, other step sizes.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatTurretGunnerWeightsFleet2.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "turretSeatFleet2");
export const FILES = Object.freeze({ start: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), foe: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json") });
export const SEEDS = Object.freeze([9510]), ITERS = 150, SIGMA = 0.1, MAX_K = 1;
/** The options of one search. */
export const searchOpts = (seed) => ({ seed, iters: ITERS, sigma: SIGMA, maxK: MAX_K });
const pairs = (from, count) => Object.freeze(Array.from({ length: count }, (_, i) => from + i).flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed }))));
export const SETS = Object.freeze({ train: pairs(1291001, 75), held: pairs(1301001, 75), audit: pairs(1311001, 150) });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`trainTurretSeatFleet2: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
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
    const by = `TRAINED IN FLEETS OF THREE IN SMALL STEPS (tools/ship/trainTurretSeatFleet2.mjs, sigma ${SIGMA}, ${MAX_K} move a child): trainTurretSeatBig's (1+1)-ES from car-today (trained in today's fight), seed ${c.seed} of ${result.runs.length} searches of ${ITERS} children, fleets of three a side, the cannon on both sides, both under the cannon-aware fly-wired helm, against the 45-degree fly-wired gunner; held-out ${TA.line(c.heldOut)}; 600 audit pairs read once: against the fly-wired gunner ${TA.line(R.lead)}; the start ${TA.line(R.start)}; what the training bought ${TA.line(R.training)}; its synapses ${TA.line(R.synapses)}`;
    return PB.exportBrain(PB.describePolicy(ST.POLICY_ID, ST), c.weights, { score: Number(R.lead.mean.toFixed(3)), by, citation: "male-cns Giant Fiber Circuit (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`trainTurretSeatFleet2: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`trainTurretSeatFleet2: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(), start = Float32Array.from(b.start.weights); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), fly = (w, list) => pool.leads(jobsOf(w, list, b)), log = (m) => console.log(m);
    const search = async (seed) => {
        const rec = path.join(kept, `s${seed}.json`); if (fs.existsSync(rec)) return JSON.parse(fs.readFileSync(rec, "utf8"));
        const ckpt = path.join(os.tmpdir(), `turretSeatFleet2-${path.basename(path.resolve(kept))}-s${seed}.ckpt`), checkpoint = { load: () => (fs.existsSync(ckpt) ? JSON.parse(fs.readFileSync(ckpt, "utf8")) : null), save: (st) => { fs.writeFileSync(ckpt + ".tmp", JSON.stringify(st)); fs.renameSync(ckpt + ".tmp", ckpt); } };
        const r = await B.search(searchOpts(seed), log, { fly, checkpoint, train: SETS.train, start }); fs.writeFileSync(rec, JSON.stringify(r) + "\n"); fs.rmSync(ckpt, { force: true }); return r;
    };
    const result = await study({ fly, search, start }, log);
    fs.writeFileSync(readingFile, JSON.stringify({ champion: result.champion.seed, runs: result.runs.map((r) => ({ seed: r.seed, heldOut: r.heldOut, kept: r.kept, synapses: r.synapses, improved: r.improved })), reading: result.reading, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
