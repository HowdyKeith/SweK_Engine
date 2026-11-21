// WebGLEngine/tools/ship/takeFlyWiredHelmNoCannon.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CANNON-AWARE HELM'S GAIN WITHOUT A CANNON, SEARCHED WITH THE GUNNERS THAT HOLD THE TRIGGER. The cannon-aware fly-wired helm (helmFlyWired3, brain/flySteering.mjs's `third`) turns at -2, -2 with a cannon and at 0.25, 0.25 without one.
// tools/ship/takeFlyWiredHelmTune.mjs searched the gain WITH a cannon again once the gunners held their triggers (the shipped -2 stood); the gain WITHOUT one was chosen by tools/ship/takeFlyWiredHelmFix.mjs with the HAND gunner aboard and has not been searched since.
// The duel page lets a user turn the cannon off; there the helm turns at 0.25. Keith: "then 2". The gain with a cannon is kept (-2, -2): every fight with a cannon is the same fight to the bit whatever is chosen here.
//
//   node tools/ship/takeFlyWiredHelmNoCannon.mjs [--workers n] [--write]
//
//   THE GAINS: -2, -1, -0.25, 0 (the rule), 0.25 (the shipped), 0.5, 1 and 2, both weights together.
//   STAGE 1, TRAIN: each gain against the plain ship ONE SHIP A SIDE and in FLEETS OF THREE, NO CANNON on either side, the by-size hand's gunner aboard (the no-window fly-wired gunner one a side, the 45-degree one in fleets): 96 pairs a fight
//     (24 of each kind; seeds 961001- one a side, 971001- fleets). A gain's score is its mean lead over the 192. The best scores wins; a tie keeps 0.25.
//   STAGE 2, HELD OUT: if the winner is not 0.25, it and 0.25 are flown on 96 fresh pairs of each fight (981001-, 991001-); it goes on only if it LEADS 0.25 on the 192 together (mean above 0) and does not TRAIL (z above -2).
//   STAGE 3, AUDIT, READ ONCE: the winner and 0.25, one ship a side (1001001-) and in fleets of three (1011001-): four arms, 300 pairs each, paired.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each gain's train score; the held-out gain; in each audit fight the winner and 0.25 against the plain ship and THE WINNER LESS 0.25, pair by pair.
// FORECAST, for the record: as with the cannon, the gain barely matters once the helm turns at all; 0.25 stands, or a winner fails held out.
// WHAT SHIPS: brain/helmFlyWired3WeightsNoCannon.json (policy helmFlyWired3, [-2, -2, the winner, the winner]) if THE WINNER LESS 0.25 LEADS in at least one fight and TRAILS in neither; the duel page's cannon-aware helm then loads it (with the cannon it is the
//   shipped helm to the bit, so no fight with a cannon changes). If 0.25 wins, or the winner fails held out, nothing is audited and the shipped gains stand.
// READ 2026-11-21 (brain/helmFlyWired3WeightsNoCannon.reading.json; the kept arms in brain/rig-results/flyWiredHelmNoCannon/): IT SHIPS, and the forecast was wrong. Train scores: -2 1.632, -1 1.665, -0.25 1.665, 0 1.537, 0.25 1.091, 0.5 -0.248,
//   1 -0.575, 2 -1.274 -- the helm without a cannon should turn the SAME way it turns with one, and a little; -0.25 won by a hair over -1. Held out, -0.25 less 0.25 +0.618 (z 8.62, 192 pairs). The audit, read once: -0.25 less 0.25 +0.720 one ship a side
//   (z 10.59) and +0.457 in fleets of three (z 9.69), both LEADS. brain/helmFlyWired3WeightsNoCannon.json is [-2, -2, -0.25, -0.25]; the duel page's cannon-aware helm loads it (the sine twin keeps 0.25: it was not searched here).
// Every arm's leads are kept (brain/rig-results/flyWiredHelmNoCannon/); the reading file (brain/helmFlyWired3WeightsNoCannon.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: unequal gains, escorts, fighters, the car's gunner, the gain with a cannon.
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
export const DEFAULT_OUT = path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelmNoCannon");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const GAINS = Object.freeze([-2, -1, -0.25, 0, 0.25, 0.5, 1, 2]), SHIPPED = 0.25, FIGHTS = Object.freeze(["one", "fleet"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: Object.freeze({ one: pairs(961001, 24), fleet: pairs(971001, 24) }), held: Object.freeze({ one: pairs(981001, 24), fleet: pairs(991001, 24) }), audit: Object.freeze({ one: pairs(1001001, 75), fleet: pairs(1011001, 75) }) });
/** The helm's four weights at a gain without a cannon: the shipped file's two with a cannon, then the gain twice. Pure. */
export const weightsOf = (g, shipped) => [shipped[0], shipped[1], g, g];
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyWiredHelmNoCannon: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and gain on a list of pairs: no cannon on either side, the by-size hand's gunner aboard. */
export function jobsOf(fight, gain, b, list) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: false, network: fight === "one" ? b.flyOne : b.fly, helmNet: { policy: FS.POLICY_ID3, weights: weightsOf(gain, b.helm.weights) } }, y: { id: "plain", cannon: false }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** The winner of the train scores ({ gain: mean }): the highest; a tie keeps the shipped. Pure. */
export function pick(scores) { let best = SHIPPED; for (const g of GAINS) if (scores[g] > scores[best]) best = g; return best; }
/** Does the winner go on from the held-out pairs? Pure. */
export const holds = (gain) => gain.mean > 0 && gain.z > -2;
/** Does it ship? THE WINNER LESS 0.25 LEADS in at least one fight and TRAILS in neither. Pure. */
export function qualifies(audit) {
    const reasons = [];
    if (!FIGHTS.some((f) => audit[f].gain.z >= 2)) reasons.push(`the gain leads in neither fight (z ${FIGHTS.map((f) => audit[f].gain.z.toFixed(2)).join(", ")})`);
    for (const f of FIGHTS) if (audit[f].gain.z <= -2) reasons.push(`in ${f} the winner TRAILS 0.25`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(stage, fight, gain)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const scores = {};
    for (const g of GAINS) { const all = []; for (const f of FIGHTS) all.push(...await fly("train", f, g)); scores[g] = all.reduce((a, b) => a + b, 0) / all.length; log(`TRAIN, gain ${g}: ${scores[g].toFixed(3)}`); }
    const winner = pick(scores); log(`THE TRAIN WINNER: ${winner}`);
    if (winner === SHIPPED) { log("THE SHIPPED GAIN STANDS: nothing is audited."); return { scores, winner, held: null, audit: null, verdict: { ok: false, reasons: ["the train winner is the shipped gain"] } }; }
    const w = [], s = []; for (const f of FIGHTS) { w.push(...await fly("held", f, winner)); s.push(...await fly("held", f, SHIPPED)); }
    const held = TA.stat(w.map((v, i) => v - s[i])); log(`HELD OUT, ${winner} LESS ${SHIPPED}: ${TA.line(held)}`);
    if (!holds(held)) { log("IT DOES NOT HOLD: the shipped gain stands; nothing is audited."); return { scores, winner, held, audit: null, verdict: { ok: false, reasons: ["it does not hold on the held-out pairs"] } }; }
    const audit = {};
    for (const f of FIGHTS) { const a = await fly("audit", f, winner), b = await fly("audit", f, SHIPPED); audit[f] = { winner: TA.stat(a), shipped: TA.stat(b), gain: TA.stat(a.map((v, i) => v - b[i])) }; log(`AUDIT ${f}: ${winner} ${TA.line(audit[f].winner)}; ${SHIPPED} ${TA.line(audit[f].shipped)}; THE WINNER LESS ${SHIPPED}: ${TA.line(audit[f].gain)}: ${TA.word(audit[f].gain.z)}`); }
    const verdict = qualifies(audit); log(verdict.ok ? `QUALIFIES: the gain ${winner} without a cannon ships.` : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { scores, winner, held, audit, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result, b) {
    const by = `tools/ship/takeFlyWiredHelmNoCannon.mjs: brain/flySteering.mjs's cannon-aware fly-wired helm (NOTHING INSIDE THE CIRCUIT IS LEARNED) at the shipped ${b.helm.weights[0]} WITH a cannon and ${result.winner} WITHOUT one, chosen of ${GAINS.join(", ")} on 192 train pairs with no cannon on either side and the by-size hand's gunner aboard, held on 192 more (${TA.line(result.held)}), and read once against the shipped 0.25 (` + FIGHTS.map((f) => `${f}: ${TA.line(result.audit[f].gain)}`).join("; ") + ")";
    return PB.exportBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), Float32Array.from(weightsOf(result.winner, b.helm.weights)), { score: Number(result.audit.one.winner.mean.toFixed(3)), by, citation: "male-cns central complex and DNa02 steering, Janelia FlyEM (vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelmNoCannon: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelmNoCannon: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (stage, fight, gain) => { const f = path.join(kept, `${stage}_${fight}_${gain}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, gain, b, SETS[stage][fight])); fs.writeFileSync(f, JSON.stringify({ stage, fight, gain, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result, b)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
