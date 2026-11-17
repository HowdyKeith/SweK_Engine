// WebGLEngine/tools/ship/takeFlyWiredGunnerShips.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY-WIRED GUNNER WITH A SIGHT THAT STICKS TO SHIPS ONLY. tools/ship/takeFlyWiredGunnerFix.mjs read a sticky sight (keep the target while it can be shot) helping the fly-wired gunner in fleets (+0.660 without the cannon, +0.274 with) and costing it a little against fighters (-0.029, z -2.9), so it did not ship.
// brain/flyTracking.mjs's `stickyShips` (policy seatFlyWired3) sticks to a capital ship and re-picks among fighters every tick, as the plain sight does (brain/seatTurretGunner.mjs's SHIPS_ONLY: an aim radius over 3). Keith: "run the next step".
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs, to the bit): against fighters alone it IS the shipped gunner; in a fleet with no fighters it IS the sticky gunner. So the question here is the fight with BOTH: fleets with escort fighters.
//
//   node tools/ship/takeFlyWiredGunnerShips.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side with no cannon and with the cannon (no escorts); fleets of three a side WITH SIX ESCORT FIGHTERS A SIDE, no cannon (battleshipDuel's escorts: the PD autopilot); one ship against eight fighters (battleshipFight, as tools/ship/pairPool.mjs's fighterLead). Side X's seats have the gunner,
//   its helm the bow-on rule; side Y is plain. 300 pairs or attacks a fight, seeds 161001- (fleets), 171001- (fleets with escorts), 181001- (fighters), 75 of each kind. THE ARMS: the shipped gunner and the gunner that sticks to ships, on the same pairs.
//
// REGISTERED 2026-11-17, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: the ships-sticky gunner against the plain side; the shipped against the plain side; THE SHIPS-STICKY LESS THE SHIPPED, pair by pair.
// FORECAST, for the record: in the fleets without escorts the gain is what the sticky gunner's was (it is the same gunner there): LEADS by about 0.6 without the cannon and 0.3 with; against fighters EXACTLY 0 (the same gunner); in fleets with escorts LEADS, by less (about 0.3).
// WHAT SHIPS: brain/seatFlyWired3WeightsDefault.json (policy seatFlyWired3, the gains -3) if the gain LEADS in both fleets without escorts and TRAILS in no fight. It would replace the shipped gunner on space-duel.html.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerShips/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the trained 6DOF fighter pilot, escorts with the cannon on, a sight that remembers the other targets while it sticks, a radius rule told by anything but the aim radius the arena shows.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired3WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerShips");
export const REGIMES = Object.freeze(["fleetNoCannon", "fleetCannon", "fleetEscorts", "fighters"]), ARMS = Object.freeze(["shipped", "ships"]), FLEET_SHIPS = 3, ESCORTS = 6, GAINS = Object.freeze([-3, -3]);
export const POLICY = Object.freeze({ shipped: FT.POLICY_ID, ships: FT.POLICY_ID3 });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const FLEET = pairs(D.KINDS, 161001, 75);   // the two fleets without escorts fly the same pairs
export const SETS = Object.freeze({ fleetNoCannon: FLEET, fleetCannon: FLEET, fleetEscorts: pairs(D.KINDS, 171001, 75), fighters: pairs(BF.KINDS, 181001, 75) });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: GAINS.slice() };
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network, helm: null, seed, kind, opts: {} } }));
    const cannon = regime === "fleetCannon", opts = regime === "fleetEscorts" ? { ships: FLEET_SHIPS, escorts: ESCORTS } : { ships: FLEET_SHIPS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { ships: TA.stat(a.ships), shipped: TA.stat(a.shipped), gain: TA.stat(a.ships.map((v, i) => v - a.shipped[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in both fleets without escorts and TRAILS in no fight. Pure. */
export function qualifies(out) {
    const reasons = [];
    for (const g of ["fleetNoCannon", "fleetCannon"]) if (!(out[g].reading.gain.z >= 2)) reasons.push(`in ${g} the gain reads ${TA.word(out[g].reading.gain.z)} (z ${out[g].reading.gain.z.toFixed(2)})`);
    for (const g of REGIMES) if (out[g].reading.gain.z <= -2) reasons.push(`in ${g} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleetNoCannon: "FLEETS OF 3 A SIDE, NO CANNON", fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", fleetEscorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, NO CANNON`, fighters: "ONE SHIP AGAINST EIGHT FIGHTERS" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.ships.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the shipped gunner: ${TA.line(R.shipped)}`); log(`     the gunner that sticks to ships: ${TA.line(R.ships)}`); log(`  THE SHIPS-STICKY LESS THE SHIPPED: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the gunner that sticks to ships ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).ships)}, the shipped one ${TA.line(R(g).shipped)}, the gain ${TA.line(R(g).gain)}`;
    const by = `tools/ship/takeFlyWiredGunnerShips.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that STICKS TO CAPITAL SHIPS ONLY (brain/seatTurretGunner.mjs's SHIPS_ONLY: an aim radius over 3) and re-picks among fighters every tick; one ship a side and against fighters alone it is the shipped gunner to the bit. Read once, each against the plain side: ` +
        [part("fleetNoCannon", "FLEETS OF THREE, NO CANNON"), part("fleetCannon", "FLEETS OF THREE, THE CANNON ON"), part("fleetEscorts", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, NO CANNON`), part("fighters", "ONE SHIP AGAINST EIGHT FIGHTERS")].join("; ") + "; regular gunners, PD fighters and escorts";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID3, FT.stickyShips), Float32Array.from(GAINS), { score: Number(R("fleetNoCannon").ships.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerShips: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerShips: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
