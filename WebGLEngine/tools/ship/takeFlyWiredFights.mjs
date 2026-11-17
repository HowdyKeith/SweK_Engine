// WebGLEngine/tools/ship/takeFlyWiredFights.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE TWO SHIPPED FLY-WIRED BRAINS OUTSIDE THEIR ONE FIGHT (the backlog's fly-wired-other-fights). The cannon-aware fly-wired helm (brain/helmFlyWired3WeightsDefault.json) and the fly-wired gunner (brain/seatFlyWiredWeightsDefault.json) were each chosen and read with ONE SHIP A SIDE. This flies them, as they are,
// in two other fights. Nothing is searched or chosen: one registered reading a regime and arm.
//
//   node tools/ship/takeFlyWiredFights.mjs [--workers n]
//
//   FLEETS: battleshipDuel pairs with THREE SHIPS A SIDE (every ship of side X has the brains; side Y is the plain fleet: the hand gunner, the bow-on rule), the cannon on both sides and on neither; 300 pairs, seeds 111001-111075 of each kind, the same pairs for every arm. A lead is side X's score less side Y's.
//   FIGHTERS: brain/battleshipFight.mjs -- one capital ship (the cannon on) against EIGHT fighters flown by the PD autopilot, in the four kinds of attack (bow, beam, stern, swarm), regular gunners; 300 attacks, seeds 121001-121075 of each kind. A lead is the fly-wired ship's score less the plain ship's IN THE SAME ATTACK,
//   a score being the share of the fighters destroyed less the share of the ship's hit points lost (tools/ship/pairPool.mjs's fighterScore).
//   THE ARMS in each: the helm alone, the gunner alone, both.
//
// REGISTERED 2026-11-17, BEFORE ANY PAIR BELOW WAS FLOWN (one scratch attack of each kind, seed 99001, and one scratch fleet pair, crossing seed 99002, were flown while building the fighter job; in no registered set). Readings, each a mean with a word at |z| >= 2: every arm against the plain side in each of the
// three regimes (fleets with the cannon, fleets without, fighters), and in each regime BOTH LESS THE BETTER ALONE.
// FORECAST, for the record: in fleets, the duel's story -- with the cannon the helm LEADS (about 0.9) and the gunner adds a little, without it the gunner LEADS (about 0.7) and the helm adds a little; against fighters the helm CANNOT BE TOLD (a few fighters are not a ship to hold a bow on) and the gunner TRAILS
// (it lays by rates, and a fighter crosses the sky faster than a ship; the hand gunner's sight leads its target), so both TRAILS too.
// READ 2026-11-17 (brain/flyWiredFights.reading.json): FLEETS WITH THE CANNON helm +1.220, gunner -0.504, both +0.574; FLEETS WITHOUT helm +0.061 (cannot be told), gunner -0.500, both -0.445; FIGHTERS helm +0.027, gunner -0.154, both -0.045. The helm holds (more than holds, with the cannon); THE GUNNER
// TRAILS EVERYWHERE BUT THE ONE-SHIP DUEL. Not registered, on 48 scratch pairs (seeds 131001-131012 of each kind, no cannon): the race car's untrained gunner, which also lays its gun by rates, does the same -- +0.735 one ship a side, -0.488 in fleets of three, beside the fly's +0.813 and -0.538 -- so the fleet's
// loss is laying a gun by rates where there are several ships to lay it on, not the fly's circuit.
// NOTHING SHIPS: it says where the shipped brains hold and where they do not. Every arm's leads are kept (brain/rig-results/flyWiredFights/); the reading file is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the trained 6DOF fighter pilot (the page's real threat), fleets of two or four, escorts, green or ace gunners, a fleet whose ships fly in formation.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "flyWiredFights.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredFights");
export const ARMS = Object.freeze(["helm", "gunner", "both"]), REGIMES = Object.freeze(["fleetCannon", "fleetNoCannon", "fighters"]), FLEET_SHIPS = 3;
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const FLEET_PAIRS = pairs(D.KINDS, 111001, 75), FIGHTER_ATTACKS = pairs(BF.KINDS, 121001, 75);
/** The two shipped brains, checked: { helm, gunner } as { policy, weights }. */
export function shipped(dir = BRAIN) {
    const read = (file, id, lib) => { const r = PB.importBrain(PB.describePolicy(id, lib), JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))); if (!r.ok) throw new Error(`takeFlyWiredFights.shipped: ${file} is refused: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: read("helmFlyWired3WeightsDefault.json", FS.POLICY_ID3, FS.third), gunner: read("seatFlyWiredWeightsDefault.json", FT.POLICY_ID, FT) };
}
const parts = (arm, b) => ({ helm: arm === "helm" || arm === "both" ? b.helm : null, network: arm === "gunner" || arm === "both" ? b.gunner : null });
/** The jobs of one regime and arm (pairPool's: a fleet pair, or a fighter job). */
export function jobsOf(regime, arm, b, list = regime === "fighters" ? FIGHTER_ATTACKS : FLEET_PAIRS) {
    const p = parts(arm, b);
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network: p.network, helm: p.helm, seed, kind, opts: {} } }));
    const cannon = regime === "fleetCannon", x = { id: "x", cannon, ...(p.helm ? { helmNet: p.helm } : {}), ...(p.network ? { network: p.network } : {}) };
    return list.map(({ kind, seed }) => ({ x, y: { id: "plain", cannon }, kind, seed, opts: { ships: FLEET_SHIPS } }));
}
/** One regime's readings from its three arms' leads. Pure. */
export function regimeReadings(a) {
    const mh = TA.stat(a.helm), mg = TA.stat(a.gunner), better = mh.mean >= mg.mean ? "helm" : "gunner", r = { helm: mh, gunner: mg, both: TA.stat(a.both), overBetter: TA.stat(a.both.map((v, i) => v - a[better][i])) };
    return { reading: r, better, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The study. `fly(regime, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleetCannon: `FLEETS OF ${FLEET_SHIPS} A SIDE, WITH THE CANNON`, fleetNoCannon: `FLEETS OF ${FLEET_SHIPS} A SIDE, WITHOUT THE CANNON`, fighters: "ONE SHIP AGAINST EIGHT FIGHTERS" };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = regimeReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.helm.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); for (const arm of ARMS) log(`     the ${arm === "both" ? "helm and the gunner" : arm + " alone"}: ${TA.line(R[arm])}`);
        log(`  BOTH LESS THE BETTER ALONE (the ${out[g].better}): ${TA.line(R.overBetter)}`);
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredFights: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("out", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredFights: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const b = shipped(), pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm, b)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
