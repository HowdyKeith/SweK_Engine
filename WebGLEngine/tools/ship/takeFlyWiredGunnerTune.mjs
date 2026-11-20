// WebGLEngine/tools/ship/takeFlyWiredGunnerTune.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HAND'S WINDOW, SEARCHED. The page's fly-wired gunner (seatFlyWired9, tools/ship/takeFlyWiredGunnerNear.mjs) lets the hand lay the gun within 20 degrees of the sight's solution on a ship; the 20 was CHOSEN ON SCRATCH PAIRS. Its other two choices, the
// target-motion term (tau 0.1) and its smoothing (0.2 s), turn out to change NOTHING once the hand lays the last degrees (brain/flyTracking-selfcheck.mjs pins it), so the window is the one choice left to search. Keith: "then 3" -- round 3 (the search).
// The policy is seatFlyWired10 (brain/flyTracking.mjs's nearTunable): five weights, the window the fifth; at [-3, -3, 0.1, 0.2, 20 degrees] it is seatFlyWired9 to the bit.
//
//   node tools/ship/takeFlyWiredGunnerTune.mjs [--workers n] [--write]
//
//   STAGE 1, TRAIN: six windows -- 10, 15, 20, 30, 45 and 60 degrees -- each flown against the plain side in fleets of THREE a side with the cannon on both sides and with none, 96 pairs each (24 of each of the duel's kinds, the same pairs for both, seeds
//     401001-). A window's score is its mean lead over the 192. The best scores wins; a tie keeps 20.
//   STAGE 2, HELD OUT: if the winner is not 20, it and 20 are flown on 96 fresh pairs of each of the same two fights (seeds 411001-); the winner goes on only if it LEADS 20 there on the 192 pairs together (mean above 0) and does not TRAIL (z above -2).
//   STAGE 3, AUDIT, READ ONCE: the winner and 20 in four fights -- fleets of three with six escort fighters a side, without and with the cannon (seeds 421001-), and without escorts, with and without it (seeds 431001-) -- 300 pairs each, paired.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings: each window's train score; the held-out gain; in each audit fight the winner and 20 against the plain side and THE WINNER LESS 20, pair by pair.
// FORECAST, for the record: the score rises from 10 to about 20-30 degrees and falls by 60 (a hand gunner's laying everywhere is worse than the circuit's swings: seatFlyWired8 beat the hand gunner in fleets without the cannon); the winner is 20 or 30;
//   if 30, the audit gain is small (under 0.1) and may not be told.
// WHAT SHIPS: brain/seatFlyWired10WeightsDefault.json (policy seatFlyWired10, [-3, -3, 0.1, 0.2, the winning window in radians]) if the audit gain LEADS in at least one fight and TRAILS in none. It would replace seatFlyWired9 as the `flywired` hand.
// If the winner is 20, or it fails held out, NOTHING is audited and the shipped window stands.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerTune/); the reading file (brain/seatFlyWired10WeightsDefault.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the gains (the circuit now makes only the big swings, where its command is near full slew), tau and the smoothing (they change nothing), escorts in the train set, one ship a side.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired10WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerTune");
export const WINDOWS = Object.freeze([10, 15, 20, 30, 45, 60]), SHIPPED = 20, FLEET_SHIPS = 3, ESCORTS = 6;
export const weightsOf = (deg) => [-3, -3, 0.1, 0.2, deg * Math.PI / 180];
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const TRAIN = pairs(401001, 24), HELD = pairs(411001, 24), ESC = pairs(421001, 75), FLT = pairs(431001, 75);
export const TRAIN_FIGHTS = Object.freeze(["fleetCannon", "fleetNoCannon"]), AUDIT_FIGHTS = Object.freeze(["escorts", "escortsCannon", "fleetCannon", "fleetNoCannon"]);
export const SETS = Object.freeze({ train: TRAIN, held: HELD, audit: Object.freeze({ escorts: ESC, escortsCannon: ESC, fleetCannon: FLT, fleetNoCannon: FLT }) });
/** The jobs of one window in one fight on a list of pairs. */
export function jobsOf(fight, deg, list) {
    const cannon = fight === "fleetCannon" || fight === "escortsCannon", opts = fight.startsWith("escorts") ? { ships: FLEET_SHIPS, escorts: ESCORTS } : { ships: FLEET_SHIPS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network: { policy: FT.POLICY_ID10, weights: weightsOf(deg) } }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** The winner of the train scores ({ deg: mean }): the highest; a tie keeps the shipped window. Pure. */
export function pick(scores) { let best = SHIPPED; for (const d of WINDOWS) if (scores[d] > scores[best]) best = d; return best; }
/** Does the winner go on from the held-out pairs? Pure. */
export const holds = (gain) => gain.mean > 0 && gain.z > -2;
/** Does it ship? The audit gain LEADS in at least one fight and TRAILS in none. Pure. */
export function qualifies(audit) {
    const reasons = [];
    if (!AUDIT_FIGHTS.some((g) => audit[g].gain.z >= 2)) reasons.push(`the gain leads in no fight (z ${AUDIT_FIGHTS.map((g) => audit[g].gain.z.toFixed(2)).join(", ")})`);
    for (const g of AUDIT_FIGHTS) if (audit[g].gain.z <= -2) reasons.push(`in ${g} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(stage, fight, deg)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const train = {}, scores = {};
    for (const d of WINDOWS) { const all = []; for (const f of TRAIN_FIGHTS) { const l = await fly("train", f, d); train[`${f}_${d}`] = TA.stat(l); all.push(...l); } scores[d] = all.reduce((a, b) => a + b, 0) / all.length; log(`TRAIN, ${d} degrees: ${scores[d].toFixed(3)} (with the cannon ${TA.line(train[`fleetCannon_${d}`])}; without ${TA.line(train[`fleetNoCannon_${d}`])})`); }
    const winner = pick(scores); log(`THE TRAIN WINNER: ${winner} degrees`);
    if (winner === SHIPPED) { log("THE SHIPPED WINDOW STANDS: nothing is audited."); return { scores, winner, held: null, audit: null, verdict: { ok: false, reasons: ["the train winner is the shipped window"] } }; }
    const w = [], s = []; for (const f of TRAIN_FIGHTS) { w.push(...await fly("held", f, winner)); s.push(...await fly("held", f, SHIPPED)); }
    const held = TA.stat(w.map((v, i) => v - s[i])); log(`HELD OUT, ${winner} LESS ${SHIPPED}: ${TA.line(held)}`);
    if (!holds(held)) { log("IT DOES NOT HOLD: the shipped window stands; nothing is audited."); return { scores, winner, held, audit: null, verdict: { ok: false, reasons: ["it does not hold on the held-out pairs"] } }; }
    const audit = {};
    for (const g of AUDIT_FIGHTS) { const a = await fly("audit", g, winner), b = await fly("audit", g, SHIPPED); audit[g] = { winner: TA.stat(a), shipped: TA.stat(b), gain: TA.stat(a.map((v, i) => v - b[i])) }; log(`AUDIT ${g}: ${winner} degrees ${TA.line(audit[g].winner)}; ${SHIPPED} ${TA.line(audit[g].shipped)}; THE WINNER LESS ${SHIPPED}: ${TA.line(audit[g].gain)}`); }
    const verdict = qualifies(audit); log(verdict.ok ? `QUALIFIES: the ${winner}-degree window ships.` : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { scores, winner, held, audit, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const by = `tools/ship/takeFlyWiredGunnerTune.mjs: the near-hand fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED) with the hand laying the gun WITHIN ${result.winner} DEGREES of the sight's solution on a ship, chosen of ${WINDOWS.join(", ")} on 192 train pairs, held on 192 more (${TA.line(result.held)}), and read once against the shipped 20 degrees in four fleet fights of 300 pairs: ` + AUDIT_FIGHTS.map((g) => `${g} ${TA.line(result.audit[g].gain)}`).join("; ");
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID10, FT.nearTunable), Float32Array.from(weightsOf(result.winner)), { score: Number(result.audit.fleetCannon.winner.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerTune: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerTune: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const list = (stage, fight) => (stage === "train" ? SETS.train : stage === "held" ? SETS.held : SETS.audit[fight]);
    const fly = async (stage, fight, deg) => { const f = path.join(kept, `${stage}_${fight}_${deg}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, deg, list(stage, fight))); fs.writeFileSync(f, JSON.stringify({ stage, fight, deg, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
