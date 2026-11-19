// WebGLEngine/tools/ship/takeFlyWiredGunnerHold.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MIXED GUNNER THAT HOLDS. tools/ship/takeFlyWiredGunnerMixed.mjs read the mixed gunner (the fly circuit lays the gun on ships, the hand gunner on fighters) LEADING the ships-sticky one with escorts and the cannon (+0.154, z 3.6) and TRAILING it in fleets
// without escorts (-0.269, z -7.3), where all that differed was that a seat with no target let its gun go back to rest. brain/flyTracking.mjs's `mixedHold` (policy seatFlyWired6) keeps the network gunner's HOLD there (brain/seatTurretGunner.mjs's
// `handRest: false`). Keith: "2 first, ... then 1" -- round 1 of the rounds suggested on 2026-11-18.
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs, to the bit): IN FLEETS WITH NO FIGHTERS IT IS THE SHIPS-STICKY GUNNER (so that fight is not flown: its gain is 0 by construction); against fighters alone it is the hand's laying with
//   the network's hold, which is NOT the plain ship (whose gun rests). So the questions are the escort fleets and the fighters.
//
//   node tools/ship/takeFlyWiredGunnerHold.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side WITH SIX ESCORT FIGHTERS A SIDE (the PD autopilot), with no cannon and with the cannon on both sides, on the SAME pairs (seeds 241001-, 75 of each of the duel's kinds); and one ship against eight fighters
//   (battleshipFight, as tools/ship/pairPool.mjs's fighterLead; seeds 251001-, 75 of each attack). Side X's seats have the gunner, its helm the bow-on rule; side Y (or the fighters' target) is plain. THE ARMS: the ships-sticky gunner (seatFlyWired3, shipped)
//   and the mixed gunner that holds (seatFlyWired6), on the same pairs, both at the gains -3.
//
// REGISTERED 2026-11-19, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: the holding gunner against the plain side; the ships-sticky against the plain side; THE HOLDING LESS THE SHIPS-STICKY, pair by pair.
// FORECAST, for the record: with escorts and the cannon the gain LEADS, by about the mixed gunner's +0.15; with escorts and no cannon a small lead (the mixed gunner's -0.09 was its rest); against fighters LEADS by about the ships-sticky gunner's
//   deficit to the plain ship (+0.15), or a little less if holding costs the hand's laying anything.
// WHAT SHIPS: brain/seatFlyWired6WeightsDefault.json (policy seatFlyWired6, the gains -3) if the gain LEADS in at least one escort fleet and TRAILS in no fight. It would replace the ships-sticky gunner as the `flywired` hand on space-duel.html.
// READ 2026-11-19 (brain/seatFlyWired6WeightsDefault.reading.json): the holding less the ships-sticky +0.350 (z 7.2) in escort fleets without the cannon, +0.368 (z 8.3) with it, +0.156 (z 18.7) against fighters. IT SHIPS: brain/seatFlyWired6WeightsDefault.json,
//   the `flywired` hand on space-duel.html. Against the plain side it now LEADS in both escort fleets (+0.333, +0.121) and is level against fighters (+0.001), where the ships-sticky gunner trailed (-0.246 with the cannon, -0.154 against fighters).
//   The forecast was under in both escort fleets: the gain is twice what the mixed gunner's was there, so its rest had been costing it with escorts too.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerHold/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets without escorts (the ships-sticky gunner to the bit), the trained 6DOF fighter pilot, escorts with other autopilots, a fighter told by anything but the aim radius.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired6WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerHold");
export const REGIMES = Object.freeze(["escorts", "escortsCannon", "fighters"]), ARMS = Object.freeze(["ships", "hold"]), FLEET_SHIPS = 3, ESCORTS = 6, GAINS = Object.freeze([-3, -3]);
export const POLICY = Object.freeze({ ships: FT.POLICY_ID3, hold: FT.POLICY_ID6 });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const ESCORT_PAIRS = pairs(D.KINDS, 241001, 75);   // the two escort fleets fly the same pairs
export const SETS = Object.freeze({ escorts: ESCORT_PAIRS, escortsCannon: ESCORT_PAIRS, fighters: pairs(BF.KINDS, 251001, 75) });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: GAINS.slice() };
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network, helm: null, seed, kind, opts: {} } }));
    const cannon = regime === "escortsCannon", opts = { ships: FLEET_SHIPS, escorts: ESCORTS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { hold: TA.stat(a.hold), ships: TA.stat(a.ships), gain: TA.stat(a.hold.map((v, i) => v - a.ships[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in at least one escort fleet and TRAILS in no fight. Pure. */
export function qualifies(out) {
    const reasons = [];
    if (!["escorts", "escortsCannon"].some((g) => out[g].reading.gain.z >= 2)) reasons.push(`the gain leads in neither escort fleet (z ${out.escorts.reading.gain.z.toFixed(2)} and ${out.escortsCannon.reading.gain.z.toFixed(2)})`);
    for (const g of REGIMES) if (out[g].reading.gain.z <= -2) reasons.push(`in ${g} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { escorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, NO CANNON`, escortsCannon: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, THE CANNON ON`, fighters: "ONE SHIP AGAINST EIGHT FIGHTERS" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.hold.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the ships-sticky gunner: ${TA.line(R.ships)}`); log(`     the mixed gunner that holds: ${TA.line(R.hold)}`); log(`  THE HOLDING LESS THE SHIPS-STICKY: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the mixed gunner that holds ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).hold)}, the ships-sticky one ${TA.line(R(g).ships)}, the gain ${TA.line(R(g).gain)}`;
    const by = "tools/ship/takeFlyWiredGunnerHold.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that sticks to capital ships, LAYING THE GUN ITSELF ONLY ON A SHIP: on a fighter (an aim radius of 3 or under) the seat is the hand gunner, and with no target it HOLDS its gun; in fleets with no fighters it is the ships-sticky gunner to the bit. Read once, each fight 300 pairs or attacks against the plain side: " +
        [part("escorts", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, NO CANNON`), part("escortsCannon", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, THE CANNON ON`), part("fighters", "ONE SHIP AGAINST EIGHT FIGHTERS")].join("; ") + "; regular gunners, PD escorts and fighters";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID6, FT.mixedHold), Float32Array.from(GAINS), { score: Number(R("escortsCannon").hold.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerHold: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerHold: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
