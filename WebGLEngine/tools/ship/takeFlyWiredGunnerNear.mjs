// WebGLEngine/tools/ship/takeFlyWiredGunnerNear.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HAND FOR THE LAST DEGREES. The page's fly-wired gunner (seatFlyWired8, tools/ship/takeFlyWiredGunnerHoldSees.mjs) still trails the plain side in fleets with the cannon and no escorts (-0.252). Scratch diagnostics (tools/ship/takeFlyWiredGunnerShips.mjs's
// header) found its gun, not firing, a median 3-5 degrees off the sight's lead solution -- just outside the trigger's window, where the circuit's command is soft -- and a stiffer gain lost. brain/flyTracking.mjs's `holdNear` (policy seatFlyWired9) lets
// the HAND lay the gun once it is within 20 degrees of the solution on a ship: the circuit makes the big swings, the hand the fine laying. Keith: "then 2" -- round 2 of the rounds suggested on 2026-11-19 (the own-cannon cost).
// WHAT IS KNOWN BEFORE ANY FLIGHT (brain/flyTracking-selfcheck.mjs, to the bit): against fighters alone it IS seatFlyWired8 (so that fight is not flown); with a window of 0 it is seatFlyWired8 everywhere. The 20 DEGREES WERE CHOSEN ON SCRATCH PAIRS
//   (133001-133012 of each kind: +0.173 with the cannon, +0.258 without; 10 degrees +0.170 and +0.201; 6 degrees +0.063 and +0.056).
//
//   node tools/ship/takeFlyWiredGunnerNear.mjs [--workers n] [--write]
//
//   THE FIGHTS: fleets of THREE ships a side WITH SIX ESCORT FIGHTERS A SIDE (the PD autopilot), with no cannon and with the cannon on both sides, on the same pairs (seeds 361001-); fleets of three with no escorts, with the cannon and without, on the same
//   pairs (371001-); 75 of each of the duel's kinds a fight. Side X's seats have the gunner, its helm the bow-on rule; side Y is plain. THE ARMS: the page's gunner (seatFlyWired8 at -3, -3, 0.1) and the gunner whose hand lays the last degrees (seatFlyWired9, the same weights).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: seatFlyWired9 against the plain side; seatFlyWired8 against the plain side; THE ONE LESS THE OTHER, pair by pair.
// FORECAST, for the record: in fleets without escorts LEADS, by about the scratch pairs' +0.17 with the cannon and +0.25 without, perhaps less (the window was chosen on those pairs); with escorts a smaller lead (a fighter is the hand's either way).
//   With the cannon and no escorts it should then be about level with the plain side (-0.25 + 0.17).
// WHAT SHIPS: brain/seatFlyWired9WeightsDefault.json (policy seatFlyWired9) if the gain LEADS in at least one fight and TRAILS in none. It would replace seatFlyWired8 as the `flywired` hand on space-duel.html.
// READ 2026-11-20 (brain/seatFlyWired9WeightsDefault.reading.json): the near-hand gunner less the page's +0.224 (z 4.7) and +0.308 (z 6.4) with escorts, without and with the cannon; +0.363 (z 8.0) and +0.177 (z 4.1) without escorts. IT SHIPS:
//   brain/seatFlyWired9WeightsDefault.json, the `flywired` hand on space-duel.html. It now leads the plain side in all four fights, +0.141 in fleets with the cannon and no escorts, the fight every fly-wired gunner before it lost. The own-cannon cost
//   was the gun hovering just outside the trigger's window; the hand closing the last degrees removes it.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerNear/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: other windows (chosen on scratch, not searched here), one ship a side, the trained 6DOF pilot, rationed magazines.
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
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWired9WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerNear");
export const REGIMES = Object.freeze(["escorts", "escortsCannon", "fleetCannon", "fleetNoCannon"]), ARMS = Object.freeze(["sees", "near"]), FLEET_SHIPS = 3, ESCORTS = 6, GAINS = Object.freeze([-3, -3]), TAU = 0.1;
export const POLICY = Object.freeze({ sees: FT.POLICY_ID8, near: FT.POLICY_ID9 });
export const WEIGHTS = Object.freeze({ sees: Object.freeze([...GAINS, TAU]), near: Object.freeze([...GAINS, TAU]) });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const ESCORT_PAIRS = pairs(D.KINDS, 361001, 75), FLEET_PAIRS = pairs(D.KINDS, 371001, 75);   // each pair of fights, with and without the cannon, flies the same pairs
export const SETS = Object.freeze({ escorts: ESCORT_PAIRS, escortsCannon: ESCORT_PAIRS, fleetCannon: FLEET_PAIRS, fleetNoCannon: FLEET_PAIRS });
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, list = SETS[regime]) {
    const network = { policy: POLICY[arm], weights: WEIGHTS[arm].slice() };
    const cannon = regime === "fleetCannon" || regime === "escortsCannon", opts = regime.startsWith("escorts") ? { ships: FLEET_SHIPS, escorts: ESCORTS } : { ships: FLEET_SHIPS };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { near: TA.stat(a.near), sees: TA.stat(a.sees), gain: TA.stat(a.near.map((v, i) => v - a.sees[i])) };
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
        log(`${title[g]}, ${a.near.length} pairs, each against the plain side:`); log(`     the page's gunner (seatFlyWired8): ${TA.line(R.sees)}`); log(`     the hand for the last degrees (seatFlyWired9): ${TA.line(R.near)}`); log(`  IT LESS THE PAGE'S: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the gunner whose hand lays the last degrees ships." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}
/** The file written when it qualifies. */
export function blobOf(result) {
    const R = (g) => result[g].reading, part = (g, what) => `${what}: it ${TA.line(R(g).near)}, seatFlyWired8 ${TA.line(R(g).sees)}, the gain ${TA.line(R(g).gain)}`;
    const by = "tools/ship/takeFlyWiredGunnerNear.mjs: brain/flyTracking.mjs's fly-wired gunner (NOTHING INSIDE THE CIRCUIT IS LEARNED; the gains -3) behind a sight that sticks to capital ships; ON A SHIP its LC10a cells are driven at the bearing PLUS 0.1 s TIMES THE TARGET'S OWN BEARING RATE (low-passed over 0.2 s) UNTIL THE GUN IS WITHIN 20 DEGREES OF THE SIGHT'S SOLUTION, WHERE THE HAND LAYS IT; ON A FIGHTER the seat is the hand gunner, and with no target it HOLDS its gun; against fighters alone it is seatFlyWired8 to the bit. Read once, each fight 300 pairs against the plain side: " +
        [part("escorts", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, NO CANNON`), part("escortsCannon", `FLEETS OF THREE WITH ${ESCORTS} ESCORTS A SIDE, THE CANNON ON`), part("fleetCannon", "FLEETS OF THREE, NO ESCORTS, THE CANNON ON"), part("fleetNoCannon", "FLEETS OF THREE, NO ESCORTS, NO CANNON")].join("; ") + "; regular gunners, PD escorts";
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID9, FT.holdNear), Float32Array.from(WEIGHTS.near), { score: Number(R("fleetCannon").near.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerNear: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerNear: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
