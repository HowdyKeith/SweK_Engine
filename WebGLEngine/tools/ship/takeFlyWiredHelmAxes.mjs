// WebGLEngine/tools/ship/takeFlyWiredHelmAxes.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CANNON-AWARE HELM'S TWO GAINS WITH A CANNON, SEARCHED APART. The cannon-aware fly-wired helm (helmFlyWired3) turns with a cannon at -2 about each of the two axes that are not the nose (brain/flySteering.mjs: one gain an axis).
// tools/ship/takeFlyWiredHelmTune.mjs searched the two together once the gunners held their triggers (flat from -1 to -6; the shipped -2 stood) and listed unequal gains as not searched. Keith: "then 3". The gains without a cannon are kept (0.25, 0.25; -0.25, -0.25 since the amendment below).
//
//   node tools/ship/takeFlyWiredHelmAxes.mjs [--workers n] [--write]
//
//   THE CANDIDATES: the first gain 0, -1, -2 or -4 by the second 0, -1, -2 or -4 -- sixteen, the shipped (-2, -2) among them.
//   STAGE 1, TRAIN: each against the plain ship ONE SHIP A SIDE and in FLEETS OF THREE, THE CANNON ON both sides, the by-size hand's gunner aboard (the no-window fly-wired gunner one a side, the 45-degree one in fleets): 96 pairs a fight
//     (24 of each kind; seeds 1021001- one a side, 1031001- fleets). A candidate's score is its mean lead over the 192. The best scores wins; a tie keeps (-2, -2).
//   STAGE 2, HELD OUT: if the winner is not (-2, -2), it and (-2, -2) are flown on 96 fresh pairs of each fight (1041001-, 1051001-); it goes on only if it LEADS (-2, -2) on the 192 together (mean above 0) and does not TRAIL (z above -2).
//   STAGE 3, AUDIT, READ ONCE: the winner and (-2, -2), one ship a side (1061001-) and in fleets of three (1071001-): four arms, 300 pairs each, paired.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each candidate's train score; the held-out gain; in each audit fight the winner and (-2, -2) against the plain ship and THE WINNER LESS (-2, -2), pair by pair.
// FORECAST, for the record: as when the two moved together, the gains barely matter once the helm turns about both axes; an axis at 0 loses; (-2, -2) stands or a winner fails held out.
// WHAT SHIPS: brain/helmFlyWired3WeightsAxes.json (policy helmFlyWired3, [the winner's two, -0.25, -0.25]) if THE WINNER LESS (-2, -2) LEADS in at least one fight and TRAILS in neither; the duel page's cannon-aware helm then loads it (without a cannon it is the
//   shipped helm to the bit). If (-2, -2) wins, or the winner fails held out, nothing is audited and the shipped gains stand.
// AMENDED 2026-11-21, STILL BEFORE ANY PAIR BELOW WAS FLOWN: tools/ship/takeFlyWiredHelmNoCannon.mjs shipped -0.25 without a cannon (the page's helm is now brain/helmFlyWired3WeightsNoCannon.json), so the helm read here and the file written
//   carry that file's gains without a cannon (-0.25, -0.25) in place of 0.25. Every fight below has the cannon on both sides, so no pair, score or reading changes: only the two weights a winner's file carries for a fight without one.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/flyWiredHelmAxes/); the reading file (brain/helmFlyWired3WeightsAxes.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the gains without a cannon, escorts, fighters, the car's gunner, gains past -4.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmFlyWired3WeightsAxes.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelmAxes");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const AXIS = Object.freeze([0, -1, -2, -4]), GAINS = Object.freeze(AXIS.flatMap((a) => AXIS.map((c) => `${a},${c}`))), SHIPPED = "-2,-2", FIGHTS = Object.freeze(["one", "fleet"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: Object.freeze({ one: pairs(1021001, 24), fleet: pairs(1031001, 24) }), held: Object.freeze({ one: pairs(1041001, 24), fleet: pairs(1051001, 24) }), audit: Object.freeze({ one: pairs(1061001, 75), fleet: pairs(1071001, 75) }) });
/** The helm's four weights at a candidate "a,b": the two gains with a cannon, then the shipped file's two without. Pure. */
export const weightsOf = (g, shipped) => [...g.split(",").map(Number), shipped[2], shipped[3]];
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyWiredHelmAxes: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and candidate on a list of pairs: the cannon on both sides, the by-size hand's gunner aboard. */
export function jobsOf(fight, gain, b, list) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: fight === "one" ? b.flyOne : b.fly, helmNet: { policy: FS.POLICY_ID3, weights: weightsOf(gain, b.helm.weights) } }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** The winner of the train scores ({ gain: mean }): the highest; a tie keeps the shipped. Pure. */
export function pick(scores) { let best = SHIPPED; for (const g of GAINS) if (scores[g] > scores[best]) best = g; return best; }
/** Does the winner go on from the held-out pairs? Pure. */
export const holds = (gain) => gain.mean > 0 && gain.z > -2;
/** Does it ship? THE WINNER LESS (-2, -2) LEADS in at least one fight and TRAILS in neither. Pure. */
export function qualifies(audit) {
    const reasons = [];
    if (!FIGHTS.some((f) => audit[f].gain.z >= 2)) reasons.push(`the gain leads in neither fight (z ${FIGHTS.map((f) => audit[f].gain.z.toFixed(2)).join(", ")})`);
    for (const f of FIGHTS) if (audit[f].gain.z <= -2) reasons.push(`in ${f} the winner TRAILS (-2, -2)`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(stage, fight, gain)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const scores = {};
    for (const g of GAINS) { const all = []; for (const f of FIGHTS) all.push(...await fly("train", f, g)); scores[g] = all.reduce((a, b) => a + b, 0) / all.length; log(`TRAIN, gains (${g}): ${scores[g].toFixed(3)}`); }
    const winner = pick(scores); log(`THE TRAIN WINNER: ${winner}`);
    if (winner === SHIPPED) { log("THE SHIPPED GAIN STANDS: nothing is audited."); return { scores, winner, held: null, audit: null, verdict: { ok: false, reasons: ["the train winner is the shipped gain"] } }; }
    const w = [], s = []; for (const f of FIGHTS) { w.push(...await fly("held", f, winner)); s.push(...await fly("held", f, SHIPPED)); }
    const held = TA.stat(w.map((v, i) => v - s[i])); log(`HELD OUT, ${winner} LESS ${SHIPPED}: ${TA.line(held)}`);
    if (!holds(held)) { log("IT DOES NOT HOLD: the shipped gain stands; nothing is audited."); return { scores, winner, held, audit: null, verdict: { ok: false, reasons: ["it does not hold on the held-out pairs"] } }; }
    const audit = {};
    for (const f of FIGHTS) { const a = await fly("audit", f, winner), b = await fly("audit", f, SHIPPED); audit[f] = { winner: TA.stat(a), shipped: TA.stat(b), gain: TA.stat(a.map((v, i) => v - b[i])) }; log(`AUDIT ${f}: ${winner} ${TA.line(audit[f].winner)}; ${SHIPPED} ${TA.line(audit[f].shipped)}; THE WINNER LESS ${SHIPPED}: ${TA.line(audit[f].gain)}: ${TA.word(audit[f].gain.z)}`); }
    const verdict = qualifies(audit); log(verdict.ok ? `QUALIFIES: the gains (${winner}) with a cannon ship.` : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { scores, winner, held, audit, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result, b) {
    const by = `tools/ship/takeFlyWiredHelmAxes.mjs: brain/flySteering.mjs's cannon-aware fly-wired helm (NOTHING INSIDE THE CIRCUIT IS LEARNED) at the gains (${result.winner}) WITH a cannon and the shipped ${b.helm.weights[2]} WITHOUT one, chosen of ${GAINS.length} pairs of gains on 192 train pairs with the cannon on both sides and the by-size hand's gunner aboard, held on 192 more (${TA.line(result.held)}), and read once against the shipped (-2, -2) (` + FIGHTS.map((f) => `${f}: ${TA.line(result.audit[f].gain)}`).join("; ") + ")";
    return PB.exportBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), Float32Array.from(weightsOf(result.winner, b.helm.weights)), { score: Number(result.audit.one.winner.mean.toFixed(3)), by, citation: "male-cns central complex and DNa02 steering, Janelia FlyEM (vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelmAxes: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelmAxes: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (stage, fight, gain) => { const f = path.join(kept, `${stage}_${fight}_${String(gain).replace(",", "x")}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, gain, b, SETS[stage][fight])); fs.writeFileSync(f, JSON.stringify({ stage, fight, gain, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result, b)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
