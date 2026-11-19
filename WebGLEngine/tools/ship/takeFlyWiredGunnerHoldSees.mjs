// WebGLEngine/tools/ship/takeFlyWiredGunnerHoldSees.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HOLDING MIXED GUNNER THAT SEES ITS TARGET MOVE. Two fly-wired gunners shipped on 2026-11-19 and were never flown against each other: the holding mixed gunner (seatFlyWired6, tools/ship/takeFlyWiredGunnerHold.mjs: the hand on fighters, the network's
// hold with no target; the page's `flywired` hand) and the gunner that sees its target move (seatFlyWired7, tools/ship/takeFlyWiredGunnerSees.mjs: the cells driven at the bearing plus 0.1 s times the target's own bearing rate). brain/flyTracking.mjs's
// `holdSees` (policy seatFlyWired8) is both: the slip on a ship, the hand on a fighter, the hold. Keith: "lets do the next round as your describe" (the backlog's fly-hold-sees).
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs, to the bit): AGAINST FIGHTERS ALONE IT IS seatFlyWired6, whatever tau (so that fight is not flown: its gain is 0 by construction); in fleets with no fighters it is seatFlyWired7, and
//   seatFlyWired6 there is the ships-sticky gunner -- so those two fights repeat, on fresh pairs, the seeing gunner's own fleet readings.
//
//   node tools/ship/takeFlyWiredGunnerHoldSees.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side WITH SIX ESCORT FIGHTERS A SIDE (the PD autopilot), with no cannon and with the cannon on both sides, on the same pairs (seeds 321001-); fleets of three with no escorts, with the cannon and without, on the same
//   pairs (331001-); 75 of each of the duel's kinds a fight. Side X's seats have the gunner, its helm the bow-on rule; side Y is plain. THE ARMS: the holding gunner (seatFlyWired6 at -3, -3, shipped) and the holding gunner that sees (seatFlyWired8 at -3, -3, 0.1).
//
// REGISTERED 2026-11-19, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: the seeing holding gunner against the plain side; the holding gunner against the plain side; THE ONE LESS THE OTHER, pair by pair.
// FORECAST, for the record: in the fleets without escorts the gain LEADS by about the seeing gunner's +0.10 and +0.11; with escorts LEADS by about as much, a little less (a fighter is the hand's either way).
// WHAT SHIPS: brain/seatFlyWired8WeightsDefault.json (policy seatFlyWired8, the weights -3, -3, 0.1) if the gain LEADS in at least one fight and TRAILS in none. It would replace the holding gunner as the `flywired` hand on space-duel.html.
// READ 2026-11-19 (brain/seatFlyWired8WeightsDefault.reading.json): the seeing holding gunner less the holding one +0.053 (z 1.5) and +0.055 (z 1.7) with escorts, without and with the cannon (CANNOT BE TOLD); +0.053 (z 2.5) and +0.116 (z 4.2)
//   without escorts, with and without the cannon (LEADS). IT SHIPS: brain/seatFlyWired8WeightsDefault.json, the `flywired` hand on space-duel.html. Against the plain side it leads in three fights of four and still trails in fleets with the
//   cannon and no escorts (-0.252): the own-cannon cost (tools/ship/takeFlyWiredGunnerShips.mjs) is still there.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerHoldSees/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship against fighters (seatFlyWired6 to the bit), one ship a side, other taus, the trained 6DOF pilot, rationed magazines.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired8WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerHoldSees");
export const REGIMES = Object.freeze(["escorts", "escortsCannon", "fleetCannon", "fleetNoCannon"]), ARMS = Object.freeze(["hold", "both"]), FLEET_SHIPS = 3, ESCORTS = 6, GAINS = Object.freeze([-3, -3]), TAU = 0.1;
export const POLICY = Object.freeze({ hold: FT.POLICY_ID6, both: FT.POLICY_ID8 });
export const WEIGHTS = Object.freeze({ hold: Object.freeze([...GAINS]), both: Object.freeze([...GAINS, TAU]) });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const ESCORT_PAIRS = pairs(D.KINDS, 321001, 75), FLEET_PAIRS = pairs(D.KINDS, 331001, 75);   // each pair of fights, with and without the cannon, flies the same pairs
export const SETS = Object.freeze({ escorts: ESCORT_PAIRS, escortsCannon: ESCORT_PAIRS, fleetCannon: FLEET_PAIRS, fleetNoCannon: FLEET_PAIRS });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: WEIGHTS[arm].slice() };
    const cannon = regime === "fleetCannon" || regime === "escortsCannon", opts = regime.startsWith("escorts") ? { ships: FLEET_SHIPS, escorts: ESCORTS } : { ships: FLEET_SHIPS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { both: TA.stat(a.both), hold: TA.stat(a.hold), gain: TA.stat(a.both.map((v, i) => v - a.hold[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in at least one fight and TRAILS in none. Pure. */
export function qualifies(out) {
    const reasons = [];
    if (!REGIMES.some((g) => out[g].reading.gain.z >= 2)) reasons.push(`the gain leads in no fight (z ${REGIMES.map((g) => out[g].reading.gain.z.toFixed(2)).join(", ")})`);
    for (const g of REGIMES) if (out[g].reading.gain.z <= -2) reasons.push(`in ${g} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { escorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, NO CANNON`, escortsCannon: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, THE CANNON ON`, fleetCannon: "FLEETS OF 3 A SIDE, NO ESCORTS, THE CANNON ON", fleetNoCannon: "FLEETS OF 3 A SIDE, NO ESCORTS, NO CANNON" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.both.length} pairs, each against the plain side:`); log(`     the holding gunner: ${TA.line(R.hold)}`); log(`     the holding gunner that sees its target move: ${TA.line(R.both)}`); log(`  IT LESS THE HOLDING GUNNER: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the holding gunner that sees its target move ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).both)}, the holding one ${TA.line(R(g).hold)}, the gain ${TA.line(R(g).gain)}`;
    const by = "tools/ship/takeFlyWiredGunnerHoldSees.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that sticks to capital ships; ON A SHIP its LC10a cells are driven at the bearing PLUS 0.1 s TIMES THE TARGET'S OWN BEARING RATE (low-passed over 0.2 s), ON A FIGHTER the seat is the hand gunner, and with no target it HOLDS its gun; against fighters alone it is seatFlyWired6 to the bit. Read once, each fight 300 pairs against the plain side: " +
        [part("escorts", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, NO CANNON`), part("escortsCannon", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, THE CANNON ON`), part("fleetCannon", "FLEETS OF THREE, NO ESCORTS, THE CANNON ON"), part("fleetNoCannon", "FLEETS OF THREE, NO ESCORTS, NO CANNON")].join("; ") + "; regular gunners, PD escorts";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID8, FT.holdSees), Float32Array.from(WEIGHTS.both), { score: Number(R("escorts").both.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerHoldSees: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerHoldSees: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
