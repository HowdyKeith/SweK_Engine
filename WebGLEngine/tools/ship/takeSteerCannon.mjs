// WebGLEngine/tools/ship/takeSteerCannon.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE STEERING HELM GIVEN A CANNON SWITCH, SEARCHED. tools/ship/takeHelmLadder.mjs put the cannon-aware fly-wired helm first and the trained steering helm (`steer`, brain/helmSteerPolicy.mjs) second, 0.6 to 1.0 behind. `steer` was trained with the hand gunner
// aboard and knows nothing of the cannon; brain/helmSteerCannon.mjs gives it the switch (its three learned weights with a cannon and without). Keith: "then 2" (a cannon-aware version of the steering/compass helm). This searches the set WITH a cannon (every
// button's fight has one); the set without is kept at the shipped three. The shipped three are an encoder weight (index 243), the output weight of the turning path (1143) and the throttle's bias (1246, -2.2: it throttles back).
//
//   node tools/ship/takeSteerCannon.mjs [--workers n] [--write]
//
//   THE CANDIDATES: the turning path's output weight times 0, 1, 2 or 3, and the throttle's bias times 0, 0.5, 1 or 1.5 -- sixteen, the shipped steer helm at (1, 1). The encoder weight is kept (scaling both ends of one path would square it).
//   STAGE 1, TRAIN: each candidate against the plain ship ONE SHIP A SIDE and in FLEETS OF THREE, the cannon on both sides, the by-size hand's gunner aboard (the no-window fly-wired gunner one a side, the 45-degree one in fleets): 96 pairs a fight
//     (24 of each kind; seeds 871001- one a side, 881001- fleets). A candidate's score is its mean lead over the 192. The best scores wins; a tie keeps the shipped (1, 1).
//   STAGE 2, HELD OUT: if the winner is not (1, 1), it and (1, 1) are flown on 96 fresh pairs of each fight (891001-, 901001-); it goes on only if it LEADS (1, 1) on the 192 together (mean above 0) and does not TRAIL (z above -2).
//   STAGE 3, AUDIT, READ ONCE: the winner, the shipped steer helm and the cannon-aware fly-wired helm, one ship a side (911001-) and in fleets of three (921001-): six arms, 300 pairs each, paired.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each candidate's train score; the held-out gain; in each audit fight the three helms against the plain ship, THE WINNER LESS THE STEER HELM and THE WINNER LESS THE FLY-WIRED HELM, pair by pair.
// FORECAST, for the record: a candidate that turns harder and throttles back less wins (the cannon wants the bow on the foe soon); the audit gain over steer about +0.1 to +0.3; the fly-wired helm still ahead by about 0.5.
// WHAT SHIPS: brain/helmSteerCannonWeightsTuned.json (policy helmSteerCannon: the winner's three with a cannon, the shipped three without) if THE WINNER LESS THE STEER HELM LEADS in at least one fight and TRAILS in neither; the duel page then gains it as a helm
//   (its note carries the audit, and where it stands against the fly-wired helm). It does not replace the fly-wired helm on any preset unless it LEADS it in both fights. If (1, 1) wins, or the winner fails held out, nothing is audited and steer stands.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/steerCannon/); the reading file (brain/helmSteerCannonWeightsTuned.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the encoder weight, the set without a cannon, escorts, fighters, the car's gunner, the compass helm.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as HSC from "../../brain/helmSteerCannon.mjs";
import * as HS from "../../brain/helmSteerPolicy.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmSteerCannonWeightsTuned.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "steerCannon");
export const FILES = Object.freeze({ steer: path.join(BRAIN, "helmSteerWeightsDefault.json"), flywired: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const TURNS = Object.freeze([0, 1, 2, 3]), THROTTLES = Object.freeze([0, 0.5, 1, 1.5]), SHIPPED = "1,1", FIGHTS = Object.freeze(["one", "fleet"]);
export const CANDIDATES = Object.freeze(TURNS.flatMap((t) => THROTTLES.map((h) => `${t},${h}`)));
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: Object.freeze({ one: pairs(871001, 24), fleet: pairs(881001, 24) }), held: Object.freeze({ one: pairs(891001, 24), fleet: pairs(901001, 24) }), audit: Object.freeze({ one: pairs(911001, 75), fleet: pairs(921001, 75) }) });
/** The six weights of a candidate "turn,throttle" over the shipped three `s`: with a cannon [s0, s1 * turn, s2 * throttle], without the shipped three. Pure. */
export function weightsOf(cand, s) { const [t, h] = cand.split(",").map(Number); return [s[0], s[1] * t, s[2] * h, s[0], s[1], s[2]]; }
/** The shipped files, each checked by its policy; `three` is the steer file's three learned weights. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeSteerCannon: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    const steer = one(FILES.steer, HS.POLICY_ID, HS);
    return { steer, three: Array.from(HSC.fromSteer(steer.weights).slice(0, 3)), flywired: one(FILES.flywired, FS.POLICY_ID3, FS.third), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The helm network of an arm: a candidate, or "steer" / "flywired" (the shipped files). */
export const helmOf = (arm, b) => (arm === "steer" ? b.steer : arm === "flywired" ? b.flywired : { policy: HSC.POLICY_ID, weights: weightsOf(arm, b.three) });
/** The jobs of one fight and arm on a list of pairs: the by-size hand's gunner (no window one a side, 45 degrees in fleets), the cannon on both sides. */
export function jobsOf(fight, arm, b, list) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: fight === "one" ? b.flyOne : b.fly, helmNet: helmOf(arm, b) }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: fight === "one" ? 1 : 3 } }));
}
/** The winner of the train scores ({ cand: mean }): the highest; a tie keeps the shipped. Pure. */
export function pick(scores) { let best = SHIPPED; for (const c of CANDIDATES) if (scores[c] > scores[best]) best = c; return best; }
/** Does the winner go on from the held-out pairs? Pure. */
export const holds = (gain) => gain.mean > 0 && gain.z > -2;
/** Does it ship? THE WINNER LESS THE STEER HELM LEADS in at least one fight and TRAILS in neither. Pure. */
export function qualifies(audit) {
    const reasons = [];
    if (!FIGHTS.some((f) => audit[f].gain.z >= 2)) reasons.push(`the gain over steer leads in neither fight (z ${FIGHTS.map((f) => audit[f].gain.z.toFixed(2)).join(", ")})`);
    for (const f of FIGHTS) if (audit[f].gain.z <= -2) reasons.push(`in ${f} the winner TRAILS the steer helm`);
    return { ok: reasons.length === 0, reasons };
}
/** Does it take the fly-wired helm's place on a preset? It LEADS it in both fights. Pure. */
export const replacesFlyWired = (audit) => FIGHTS.every((f) => audit[f].gap.z >= 2);
/** The study. `fly(stage, fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const scores = {};
    for (const c of CANDIDATES) { const all = []; for (const f of FIGHTS) all.push(...await fly("train", f, c)); scores[c] = all.reduce((a, b) => a + b, 0) / all.length; log(`TRAIN, (turn, throttle) (${c}): ${scores[c].toFixed(3)}`); }
    const winner = pick(scores); log(`THE TRAIN WINNER: (${winner})`);
    if (winner === SHIPPED) { log("THE SHIPPED STEER HELM STANDS: nothing is audited."); return { scores, winner, held: null, audit: null, verdict: { ok: false, reasons: ["the train winner is the shipped steer helm"] } }; }
    const w = [], s = []; for (const f of FIGHTS) { w.push(...await fly("held", f, winner)); s.push(...await fly("held", f, SHIPPED)); }
    const held = TA.stat(w.map((v, i) => v - s[i])); log(`HELD OUT, (${winner}) LESS (${SHIPPED}): ${TA.line(held)}`);
    if (!holds(held)) { log("IT DOES NOT HOLD: the steer helm stands; nothing is audited."); return { scores, winner, held, audit: null, verdict: { ok: false, reasons: ["it does not hold on the held-out pairs"] } }; }
    const audit = {};
    for (const f of FIGHTS) {
        const a = await fly("audit", f, winner), st = await fly("audit", f, "steer"), fw = await fly("audit", f, "flywired");
        audit[f] = { winner: TA.stat(a), steer: TA.stat(st), flywired: TA.stat(fw), gain: TA.stat(a.map((v, i) => v - st[i])), gap: TA.stat(a.map((v, i) => v - fw[i])) };
        log(`AUDIT ${f}: the winner ${TA.line(audit[f].winner)}; steer ${TA.line(audit[f].steer)}; fly-wired ${TA.line(audit[f].flywired)}`); log(`  THE WINNER LESS STEER: ${TA.line(audit[f].gain)}: ${TA.word(audit[f].gain.z)}`); log(`  THE WINNER LESS THE FLY-WIRED HELM: ${TA.line(audit[f].gap)}: ${TA.word(audit[f].gap.z)}`);
    }
    const verdict = qualifies(audit); log(verdict.ok ? `QUALIFIES: (${winner}) ships as a helm${replacesFlyWired(audit) ? ", and it leads the fly-wired helm in both fights" : "; the fly-wired helm keeps its presets"}.` : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { scores, winner, held, audit, verdict, replacesFlyWired: verdict.ok && replacesFlyWired(audit) };
}
/** The file written when it qualifies. */
export function blobOf(result, b) {
    const by = `tools/ship/takeSteerCannon.mjs: the steering helm (brain/helmSteerPolicy.mjs) with a cannon switch (brain/helmSteerCannon.mjs); WITH a cannon its turning path's output weight times ${result.winner.split(",")[0]} and its throttle bias times ${result.winner.split(",")[1]}, chosen of ${CANDIDATES.length} on 192 train pairs with the by-size hand's gunner aboard, held on 192 more (${TA.line(result.held)}), and read once against the steer helm (` + FIGHTS.map((f) => `${f}: ${TA.line(result.audit[f].gain)}`).join("; ") + ") and the fly-wired helm (" + FIGHTS.map((f) => `${f}: ${TA.line(result.audit[f].gap)}`).join("; ") + "); without a cannon the shipped three";
    return PB.exportBrain(PB.describePolicy(HSC.POLICY_ID, HSC), Float32Array.from(weightsOf(result.winner, b.three)), { score: Number(result.audit.one.winner.mean.toFixed(3)), by });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSteerCannon: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSteerCannon: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (stage, fight, arm) => { const f = path.join(kept, `${stage}_${fight}_${arm.replace(",", "x")}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b, SETS[stage][fight])); fs.writeFileSync(f, JSON.stringify({ stage, fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result, b)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
