// WebGLEngine/tools/ship/takeFlyWiredNext.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TWO SMALL STUDIES THE FLY-WIRED RESULTS LEFT OWING (the backlog's fly-wired-together and fly-helm-shuffle-seeds). Neither searches anything: the brains are the two shipped files as they are.
//
//   node tools/ship/takeFlyWiredNext.mjs together [--workers n]
//   node tools/ship/takeFlyWiredNext.mjs seeds [--workers n]
//
// `together` -- THE FLY-WIRED HELM AND THE FLY-WIRED GUNNER IN ONE SHIP. The helm (brain/helmFlyWired2WeightsDefault.json) was read with the cannon, the gunner (brain/seatFlyWiredWeightsDefault.json) without it, never in one fight. Side X is the helm alone, the gunner alone, or both; side Y is the bow-on rule and the
//   hand gunner; each in TWO fights, the cannon on both sides and on neither. REGISTERED 2026-11-16 BEFORE ANY OF ITS PAIRS WAS FLOWN: 600 pairs, seeds 81001-81150 of each kind, the same pairs for all six arms. Readings in EACH fight, a mean of paired differences with a word at |z| >= 2: the helm alone, the gunner
//   alone and both against the plain ship; BOTH LESS THE BETTER OF THE TWO ALONE (does the second part add?); and BOTH LESS THE SUM OF THE TWO ALONE (do the gains add?). FORECAST: with the cannon the helm leads by about 1 and the gunner by about 0.1, both is the helm's lead and no more (does not add: CANNOT BE TOLD
//   over the helm alone); without the cannon the gunner leads by about 0.75, the helm by little or nothing, and both is the gunner's lead (CANNOT BE TOLD over the gunner alone); in neither fight do the gains add up to more than the sum.
// `seeds` -- MORE SHUFFLE SEEDS FOR THE HELM. tools/ship/takeFlyWiredHelm.mjs's study 2 read the fly's wiring as worth 1.013 over the shuffled circuit -- ONE shuffle seed (4242). Here FIVE MORE (1 to 5), each `shuffled2:<seed>~odd` as there, each at ITS best of four gains (-2, -0.5, 0.5, 2) on 300 train pairs
//   (seeds 84001-84075), then on 600 audit pairs (86001-86150) beside the fly's helm at its shipped gain. REGISTERED THE SAME DAY BEFORE ANY OF ITS PAIRS. Readings: the fly's helm less EACH shuffle's, and less THE MEAN OF THE FIVE. FORECAST: the fly's leads the rule by about 1; each shuffle's helm cannot be told
//   from the rule or trails it; every difference LEADS.
//
// Every arm's leads are kept (brain/rig-results/flyWiredTogether, flyHelmShuffleSeeds); each study's reading file is the mark that it was read, and a second read is refused. NOTHING SHIPS.
// WHAT IS NOT HERE: fleets or fighters (the backlog's fly-wired-other-fights), gains re-chosen for the combined ship, a held-out set for `seeds` (a shuffle's gain is chosen on its train pairs and read on the audit pairs; nothing is chosen between).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { choose } from "./takeFlyWiredHelm.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const TOGETHER = Object.freeze({ pairs: pairs(81001, 150), arms: Object.freeze(["helm", "gunner", "both"]), fights: Object.freeze(["cannon", "nocannon"]), reading: path.join(BRAIN, "flyWiredTogether.reading.json"), kept: path.join(BRAIN, "rig-results", "flyWiredTogether") });
export const SEEDS = Object.freeze({ train: pairs(84001, 75), audit: pairs(86001, 150), seeds: Object.freeze([1, 2, 3, 4, 5]), gains: Object.freeze([-2, -0.5, 0.5, 2]), fly: "fly2~odd", reading: path.join(BRAIN, "flyHelmShuffleSeeds.reading.json"), kept: path.join(BRAIN, "rig-results", "flyHelmShuffleSeeds") });
export const shuffleName = (seed) => `shuffled2:${seed}~odd`;
/** The two shipped brains' weights, checked: { helm, gunner } as plain arrays. */
export function shipped(dir = BRAIN) {
    const read = (file, id, lib) => { const r = PB.importBrain(PB.describePolicy(id, lib), JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))); if (!r.ok) throw new Error(`takeFlyWiredNext.shipped: ${file} is refused: ${r.reason}`); return Array.from(r.weights); };
    return { helm: read("helmFlyWired2WeightsDefault.json", FS.POLICY_ID2, FS.second), gunner: read("seatFlyWiredWeightsDefault.json", FT.POLICY_ID, FT) };
}
/** `together`'s jobs: side X with the helm, the gunner or both; side Y the plain ship; the cannon on both sides or on neither. */
export function togetherJobs(arm, fight, w, list = TOGETHER.pairs) {
    const cannon = fight === "cannon", x = { id: "x", cannon };
    if (arm === "helm" || arm === "both") x.helmNet = { policy: FS.POLICY_ID2, weights: w.helm };
    if (arm === "gunner" || arm === "both") x.network = { policy: FT.POLICY_ID, weights: w.gunner };
    return list.map(({ kind, seed }) => ({ x, y: { id: "plain", cannon }, kind, seed }));
}
/** `together`'s readings for one fight from its three arms' leads. Pure. */
export function togetherReadings(a) {
    const d = (x, y) => TA.stat(x.map((v, i) => v - y[i])), mh = TA.stat(a.helm), mg = TA.stat(a.gunner), better = mh.mean >= mg.mean ? "helm" : "gunner";
    const r = { helm: mh, gunner: mg, both: TA.stat(a.both), overBetter: d(a.both, a[better]), overSum: TA.stat(a.both.map((v, i) => v - a.helm[i] - a.gunner[i])) };
    return { reading: r, better, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** `seeds`' jobs: a helm of the named wiring at `gain` on both axes, against the rule. */
export const seedJobs = (wiring, gain, list) => list.map(({ kind, seed }) => ({ x: { id: "net", helmNet: { policy: FS.POLICY_ID, weights: [gain, gain], wiring } }, y: { id: "rule" }, kind, seed }));
/** `seeds`' readings from the audit leads: { fly, shuffles: { seed: leads } }. Pure. */
export function seedReadings(a) {
    const d = (x, y) => TA.stat(x.map((v, i) => v - y[i])), ks = Object.keys(a.shuffles), mean = a.fly.map((_, i) => ks.reduce((s, k) => s + a.shuffles[k][i], 0) / ks.length);
    const r = { fly: TA.stat(a.fly), overMean: d(a.fly, mean), shuffledMean: TA.stat(mean), ...Object.fromEntries(ks.flatMap((k) => [[`shuffle${k}`, TA.stat(a.shuffles[k])], [`over${k}`, d(a.fly, a.shuffles[k])]])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The `together` study. `fly(arm, fight)` -> Promise of leads. */
export async function together(fly, log = () => {}) {
    const out = {};
    for (const fight of TOGETHER.fights) { const a = {}; for (const arm of TOGETHER.arms) a[arm] = await fly(arm, fight); out[fight] = togetherReadings(a); const R = out[fight].reading;
        log(`${fight === "cannon" ? "WITH THE CANNON" : "WITHOUT THE CANNON"}, ${TOGETHER.pairs.length} pairs, each against the plain ship:`); log(`     the helm alone: ${TA.line(R.helm)}`); log(`     the gunner alone: ${TA.line(R.gunner)}`); log(`     both: ${TA.line(R.both)}`);
        log(`  BOTH LESS THE BETTER ALONE (the ${out[fight].better}): ${TA.line(R.overBetter)}`); log(`  BOTH LESS THE SUM OF THE TWO ALONE: ${TA.line(R.overSum)}`); }
    return out;
}
/** The `seeds` study. `fly(wiring, gain, setName)` -> Promise of leads; `flyGain` the fly's shipped gain. */
export async function seeds(fly, flyGain, log = () => {}) {
    const chosen = {}, a = { shuffles: {} };
    for (const sd of SEEDS.seeds) { const w = shuffleName(sd), byGain = {}; for (const g of SEEDS.gains) byGain[g] = await fly(w, g, "train"); chosen[sd] = choose(byGain); log(`  ${w}: train leads by gain ${chosen[sd].rows.slice().sort((p, q) => p.gain - q.gain).map((r) => `${r.gain}: ${r.stat.mean >= 0 ? "+" : ""}${r.stat.mean.toFixed(3)}`).join(", ")} -> its gain ${chosen[sd].gain}`); }
    a.fly = await fly(SEEDS.fly, flyGain, "audit"); for (const sd of SEEDS.seeds) a.shuffles[sd] = await fly(shuffleName(sd), chosen[sd].gain, "audit");
    const { reading, words } = seedReadings(a);
    log(`the ${SEEDS.audit.length} audit pairs, read once:`); log(`     the fly's helm (gain ${flyGain}) against the rule: ${TA.line(reading.fly)}`);
    for (const sd of SEEDS.seeds) log(`     shuffle ${sd} (gain ${chosen[sd].gain}) against the rule: ${TA.line(reading[`shuffle${sd}`])}; THE FLY'S LESS IT: ${TA.line(reading[`over${sd}`])}`);
    log(`  THE FLY'S HELM LESS THE MEAN OF THE FIVE SHUFFLES': ${TA.line(reading.overMean)}`);
    return { chosen: Object.fromEntries(Object.entries(chosen).map(([k, c]) => [k, { gain: c.gain, train: c.train, rows: c.rows }])), flyGain, reading, words };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const [which, ...rest] = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "out", "kept"].includes(x.slice(2)));
    if (!["together", "seeds"].includes(which) || bad.length) { console.error(`takeFlyWiredNext: ${bad.length ? `unknown option ${bad.join(", ")}` : "the first argument is together or seeds"}`); process.exit(2); }
    const S = which === "together" ? TOGETHER : SEEDS, readingFile = arg("out", S.reading), kept = arg("kept", S.kept);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredNext: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const w = shipped(), pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {}), keep = async (name, jobs) => { const f = path.join(kept, name + ".json"); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobs); fs.writeFileSync(f, JSON.stringify({ name, first: jobs[0].seed, leads }) + "\n"); return leads; };
    let result;
    if (which === "together") result = await together((arm, fight) => keep(`${arm}_${fight}`, togetherJobs(arm, fight, w)), (m) => console.log(m));
    else result = await seeds((wiring, gain, set) => keep(`${wiring.replace(":", "").replace("~", "-")}_g${gain}_${set}`, seedJobs(wiring, gain, SEEDS[set])), w.helm[0], (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
