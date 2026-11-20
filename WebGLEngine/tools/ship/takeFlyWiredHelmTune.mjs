// WebGLEngine/tools/ship/takeFlyWiredHelmTune.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CANNON-AWARE HELM'S GAIN, SEARCHED WITH THE GUNNERS THAT HOLD THE TRIGGER. tools/ship/takeBestShipLoadout3.mjs read the helm worth more than the gunner: under the bow-on rule both gunners lose 0.3 to 1.2 of their lead. The cannon-aware fly-wired
// helm (helmFlyWired3, brain/flySteering.mjs's `third`) turns at gains of -2 and -2 when its ship has a cannon -- chosen with the HAND GUNNER in the seats, before any gunner held its trigger. Keith: "then 2 (the biggest lever)".
// The search is of the gain with a cannon (both weights together); the gains without one (0.25, 0.25) are kept: every fight the buttons are for has the cannon.
//
//   node tools/ship/takeFlyWiredHelmTune.mjs [--workers n] [--write]
//
//   STAGE 1, TRAIN: six gains -- -0.5, -1, -2, -3, -4 and -6 -- each flown against the plain ship ONE SHIP A SIDE and in FLEETS OF THREE, the cannon on both sides, each with the car's always-firing gunner and with the page's fly-wired gunner (seatFlyWired11)
//     aboard: 96 pairs a fight and gunner (24 of each kind; seeds 561001- one a side, 571001- fleets). A gain's score is its mean lead over the 384. The best scores wins; a tie keeps -2.
//   STAGE 2, HELD OUT: if the winner is not -2, it and -2 are flown on 96 fresh pairs of each fight and gunner (seeds 581001-, 591001-); it goes on only if it LEADS -2 on the 384 together (mean above 0) and does not TRAIL (z above -2).
//   STAGE 3, AUDIT, READ ONCE: the winner and -2, one ship a side (601001-) and in fleets of three (611001-), with each gunner: four gains, 300 pairs each, paired.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each gain's train score; the held-out gain; in each audit fight and gunner the winner and -2 against the plain ship and THE WINNER LESS -2, pair by pair.
// FORECAST, for the record: a stronger turn (-3 or -4) wins, a gunner that always fires gaining from more of its guns on the target sooner; the audit gain small, about +0.1, larger in fleets than one a side.
// WHAT SHIPS: brain/helmFlyWired3WeightsTuned.json (policy helmFlyWired3, [the winner, the winner, 0.25, 0.25]) if the audit gain LEADS in at least one of the four and TRAILS in none; the page's cannon-aware helm then loads it. If -2 wins, or the winner fails
//   held out, nothing is audited and the shipped gain stands.
// Every arm's leads are kept (brain/rig-results/flyWiredHelmTune/); the reading file (brain/helmFlyWired3WeightsTuned.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: unequal gains, the gains without a cannon, escorts, the hand gunner, the other helms.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmFlyWired3WeightsTuned.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelmTune");
export const FILES = Object.freeze({ car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const GAINS = Object.freeze([-0.5, -1, -2, -3, -4, -6]), SHIPPED = -2, GUNNERS = Object.freeze(["car", "fly"]), FIGHTS = Object.freeze(["one", "fleet"]);
export const weightsOf = (g) => [g, g, 0.25, 0.25];
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: Object.freeze({ one: pairs(561001, 24), fleet: pairs(571001, 24) }), held: Object.freeze({ one: pairs(581001, 24), fleet: pairs(591001, 24) }), audit: Object.freeze({ one: pairs(601001, 75), fleet: pairs(611001, 75) }) });
/** The two gunners' shipped files, each checked by its policy. */
export function gunnersOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyWiredHelmTune: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one gain, fight and gunner on a list of pairs. */
export function jobsOf(fight, gunner, gain, b, list) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[gunner], helmNet: { policy: FS.POLICY_ID3, weights: weightsOf(gain) } }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** The winner of the train scores ({ gain: mean }): the highest; a tie keeps the shipped gain. Pure. */
export function pick(scores) { let best = SHIPPED; for (const g of GAINS) if (scores[g] > scores[best]) best = g; return best; }
/** Does the winner go on from the held-out pairs? Pure. */
export const holds = (gain) => gain.mean > 0 && gain.z > -2;
/** Does it ship? The audit gain LEADS in at least one fight and gunner and TRAILS in none. Pure. */
export function qualifies(audit) {
    const keys = Object.keys(audit), reasons = [];
    if (!keys.some((k) => audit[k].gain.z >= 2)) reasons.push(`the gain leads in none (z ${keys.map((k) => audit[k].gain.z.toFixed(2)).join(", ")})`);
    for (const k of keys) if (audit[k].gain.z <= -2) reasons.push(`in ${k} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
const each = () => FIGHTS.flatMap((f) => GUNNERS.map((g) => [f, g]));
/** The study. `fly(stage, fight, gunner, gain)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const scores = {};
    for (const gain of GAINS) { const all = []; for (const [f, g] of each()) all.push(...await fly("train", f, g, gain)); scores[gain] = all.reduce((a, b) => a + b, 0) / all.length; log(`TRAIN, gain ${gain}: ${scores[gain].toFixed(3)}`); }
    const winner = pick(scores); log(`THE TRAIN WINNER: ${winner}`);
    if (winner === SHIPPED) { log("THE SHIPPED GAIN STANDS: nothing is audited."); return { scores, winner, held: null, audit: null, verdict: { ok: false, reasons: ["the train winner is the shipped gain"] } }; }
    const w = [], s = []; for (const [f, g] of each()) { w.push(...await fly("held", f, g, winner)); s.push(...await fly("held", f, g, SHIPPED)); }
    const held = TA.stat(w.map((v, i) => v - s[i])); log(`HELD OUT, ${winner} LESS ${SHIPPED}: ${TA.line(held)}`);
    if (!holds(held)) { log("IT DOES NOT HOLD: the shipped gain stands; nothing is audited."); return { scores, winner, held, audit: null, verdict: { ok: false, reasons: ["it does not hold on the held-out pairs"] } }; }
    const audit = {};
    for (const [f, g] of each()) { const a = await fly("audit", f, g, winner), b = await fly("audit", f, g, SHIPPED), k = `${f}_${g}`; audit[k] = { winner: TA.stat(a), shipped: TA.stat(b), gain: TA.stat(a.map((v, i) => v - b[i])) }; log(`AUDIT ${k}: ${winner} ${TA.line(audit[k].winner)}; ${SHIPPED} ${TA.line(audit[k].shipped)}; THE WINNER LESS ${SHIPPED}: ${TA.line(audit[k].gain)}`); }
    const verdict = qualifies(audit); log(verdict.ok ? `QUALIFIES: the gain ${winner} ships.` : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { scores, winner, held, audit, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const by = `tools/ship/takeFlyWiredHelmTune.mjs: brain/flySteering.mjs's cannon-aware fly-wired helm (NOTHING INSIDE THE CIRCUIT IS LEARNED) at the gain ${result.winner} WITH A CANNON (0.25 without), chosen of ${GAINS.join(", ")} on 384 train pairs with the car's gunner and the fly-wired gunner aboard, held on 384 more (${TA.line(result.held)}), and read once against the shipped -2: ` + Object.keys(result.audit).map((k) => `${k} ${TA.line(result.audit[k].gain)}`).join("; ");
    return PB.exportBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), Float32Array.from(weightsOf(result.winner)), { score: Number(result.audit.one_car.winner.mean.toFixed(3)), by, citation: "male-cns central complex and DNa02 steering, Janelia FlyEM (vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelmTune: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelmTune: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = gunnersOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (stage, fight, gunner, gain) => { const f = path.join(kept, `${stage}_${fight}_${gunner}_${gain}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, gunner, gain, b, SETS[stage][fight])); fs.writeFileSync(f, JSON.stringify({ stage, fight, gunner, gain, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
