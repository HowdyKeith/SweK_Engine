// WebGLEngine/tools/ship/takeFlyWiredGunnerMixed.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE MIXED GUNNER: THE FLY CIRCUIT LAYS THE GUN ON SHIPS, THE HAND GUNNER ON FIGHTERS. tools/ship/takeFlyWiredGunnerShips.mjs shipped the fly-wired gunner whose sight sticks to ships (seatFlyWired3): level with the plain side in fleets, but still behind it against fighters
// (-0.148: the circuit lays the gun by rates, and a fighter turns faster than a rate-laid gun follows). brain/flyTracking.mjs's `mixed` (policy seatFlyWired4) does what the hand gunner does whenever the sight's target is a fighter (brain/seatTurretGunner.mjs's `handOn`;
// a fighter is what SHIPS_ONLY is not: an aim radius of 3 or under) and the ships-sticky gunner's laying on a ship. Keith: "lay the gun with the fly circuit when the target is a ship, and the hand gunner's way when it's a fighter" (item 1 of "Let's do 1, 2, 3, and 4").
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs and brain/seatTurretGunner-selfcheck.mjs, to the bit): AGAINST FIGHTERS ALONE IT IS THE PLAIN SHIP (no fight is flown for that: its lead is 0 by construction, and the ships-sticky gunner's there was -0.148);
//   in a fleet with no fighters it is the ships-sticky gunner but for one thing, a seat with no target lets its gun go back to rest as the hand's does (the network gunner's holds). So the question is the fleets WITH escort fighters, and whether that rest costs anything without them.
//
//   node tools/ship/takeFlyWiredGunnerMixed.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side WITH SIX ESCORT FIGHTERS A SIDE (battleshipDuel's escorts: the PD autopilot), with no cannon and with the cannon on both sides, on the SAME pairs; and fleets of three a side with no escorts and no cannon. Side X's seats have the gunner, its helm the bow-on rule;
//   side Y is plain. 300 pairs a fight, seeds 221001- (both escort fleets) and 231001- (the fleet with no escorts), 75 of each of the duel's kinds. THE ARMS: the ships-sticky gunner (seatFlyWired3, shipped) and the mixed gunner (seatFlyWired4), on the same pairs, both at the gains -3.
//
// REGISTERED 2026-11-18, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: the mixed gunner against the plain side; the ships-sticky against the plain side; THE MIXED LESS THE SHIPS-STICKY, pair by pair.
// FORECAST, for the record: in the escort fleets the gain LEADS, by about 0.1 (the fighters are a sixth of what each side shoots at for most of a fight, and against fighters alone the hand's way was 0.15 better); with the cannon about the same; in the fleet with no escorts
//   CANNOT BE TOLD (only the idle rest differs, and a seat is seldom without a target there).
// WHAT SHIPS: brain/seatFlyWired4WeightsDefault.json (policy seatFlyWired4, the gains -3) if the gain LEADS in at least one escort fleet and TRAILS in no fight. It would replace the ships-sticky gunner as the `flywired` hand on space-duel.html.
// READ 2026-11-18 (brain/seatFlyWired4WeightsDefault.reading.json): the mixed less the ships-sticky -0.094 (z -1.9, CANNOT BE TOLD) in escort fleets without the cannon, +0.154 (z 3.6, LEADS) with it, -0.269 (z -7.3, TRAILS) in fleets without escorts.
//   IT DOES NOT SHIP (it trails in a fight) and no file was written; the page keeps the ships-sticky gunner. The forecast was wrong twice: no lead without the cannon, and a large loss with no escorts, where all that differs is that a seat with
//   no target lets its gun go back to rest (the network gunner holds it where it was). So RESTING THE GUN COSTS a gun that lays itself by rates: it then starts every new target from its rest, not from near the last one. A mixed gunner that keeps
//   the network's hold when it has no target is the obvious next arm; it is not flown here.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerMixed/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship against fighters (the plain ship to the bit: nothing to fly), the trained 6DOF fighter pilot, a hand gunner on ships with the circuit on fighters (the other way round), a rule for which target is a fighter told by anything but the aim radius.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired4WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerMixed");
export const REGIMES = Object.freeze(["escorts", "escortsCannon", "fleet"]), ARMS = Object.freeze(["ships", "mixed"]), FLEET_SHIPS = 3, ESCORTS = 6, GAINS = Object.freeze([-3, -3]);
export const POLICY = Object.freeze({ ships: FT.POLICY_ID3, mixed: FT.POLICY_ID4 });
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const ESCORT_PAIRS = pairs(221001, 75);   // the two escort fleets fly the same pairs
export const SETS = Object.freeze({ escorts: ESCORT_PAIRS, escortsCannon: ESCORT_PAIRS, fleet: pairs(231001, 75) });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: GAINS.slice() }, cannon = regime === "escortsCannon", opts = regime === "fleet" ? { ships: FLEET_SHIPS } : { ships: FLEET_SHIPS, escorts: ESCORTS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { mixed: TA.stat(a.mixed), ships: TA.stat(a.ships), gain: TA.stat(a.mixed.map((v, i) => v - a.ships[i])) };
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
    const out = {}, title = { escorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, NO CANNON`, escortsCannon: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, THE CANNON ON`, fleet: "FLEETS OF 3 A SIDE, NO ESCORTS, NO CANNON" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.mixed.length} pairs, each against the plain side:`); log(`     the ships-sticky gunner: ${TA.line(R.ships)}`); log(`     the mixed gunner: ${TA.line(R.mixed)}`); log(`  THE MIXED LESS THE SHIPS-STICKY: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the mixed gunner ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).mixed)}, the ships-sticky one ${TA.line(R(g).ships)}, the gain ${TA.line(R(g).gain)}`;
    const by = "tools/ship/takeFlyWiredGunnerMixed.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that sticks to capital ships, LAYING THE GUN ITSELF ONLY ON A SHIP: on a fighter (an aim radius of 3 or under) and with no target the seat is the hand gunner; against fighters alone it is the plain ship to the bit. Read once, each fight 300 pairs against the plain side: " +
        [part("escorts", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, NO CANNON`), part("escortsCannon", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, THE CANNON ON`), part("fleet", "FLEETS OF THREE, NO ESCORTS, NO CANNON")].join("; ") + "; regular gunners, PD escorts";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID4, FT.mixed), Float32Array.from(GAINS), { score: Number(R("escorts").mixed.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerMixed: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerMixed: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
