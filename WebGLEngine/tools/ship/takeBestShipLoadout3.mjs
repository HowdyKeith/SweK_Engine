// WebGLEngine/tools/ship/takeBestShipLoadout3.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE `best ship` BUTTON CARRIES, ASKED A THIRD TIME: THE HELM AND THE GUNNER TOGETHER. Two loadout studies kept the car's always-firing gunner (car-big) under the cannon-aware fly-wired helm (helmFlyWired3). Since then the page's fly-wired gunner
// has become seatFlyWired11 (tools/ship/takeFlyWiredGunnerTrigger.mjs: the hand's last degrees and every fighter, the trigger held), and the second study saw in passing that under the cannon-aware helm a fly gunner led the plain side by far less than
// under the bow-on rule. So the helm is asked too. Keith: "then 3, with 4 folded in" -- round 3, with one ship a side (the page's default fight).
//
//   node tools/ship/takeBestShipLoadout3.mjs [--workers n]
//
//   THE FIGHTS: ONE SHIP A SIDE with the cannon on both sides (seeds 501001-); fleets of THREE a side with the cannon (511001-); fleets of three with SIX ESCORT FIGHTERS a side and the cannon (521001-). 300 pairs a fight, 75 of each of the duel's kinds.
//   Side X is the loadout, side Y the plain ship (the bow-on rule, the hand gunner), both with the cannon. THE ARMS -- a helm over a gunner, the shipped files: `helmCar` (the cannon-aware helm over the car's gunner: THE BUTTON NOW); `helmFly` (the
//   cannon-aware helm over seatFlyWired11); `faceCar` (the bow-on rule over the car's gunner); `faceFly` (the bow-on rule over seatFlyWired11).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; each CHALLENGER LESS THE BUTTON'S, pair by pair.
// FORECAST, for the record: helmFly LEADS the button (seatFlyWired11 holds the trigger as the car's gunner does and lays the gun better), by about 0.2; the bow-on arms TRAIL it one ship a side (the cannon-aware helm leads the bow-on rule by about 1.0 there
//   with the cannon) and are about level in the fleets. So helmFly takes the button.
// WHAT IS DECIDED: a challenger REPLACES the button's loadout if it LEADS it in at least one fight and TRAILS it in none; of several, the one whose three gains have the largest mean. Otherwise the preset stays. Nothing is written but the reading; a change
//   to the preset is made by hand in render/spaceDuelCore.mjs and its gate pins the reading.
// READ 2026-11-20 (brain/bestShipLoadout3.reading.json): THE BUTTON STAYS, by one fight. The cannon-aware helm over the fly gunner (seatFlyWired11) leads the button in fleets (+0.183, z 6.2) and with escorts (+0.344, z 8.6) but trails it one ship a side
//   (-0.097, z -2.9), the page's default fight; the bow-on arms trail it everywhere (-0.14 to -1.22). The helm is worth more than the gunner: under the bow-on rule both gunners lose 0.3 to 1.2 against the plain ship. The forecast was wrong one ship a side.
// Every arm's leads are kept (brain/rig-results/bestShipLoadout3/); the reading file (brain/bestShipLoadout3.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the other helms (trained, steer, compass), other gunners, fights without the cannon, rationed magazines, the trained pilot.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "bestShipLoadout3.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "bestShipLoadout3");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["oneCannon", "fleetCannon", "escortsCannon"]), ARMS = Object.freeze(["helmCar", "helmFly", "faceCar", "faceFly"]), INCUMBENT = "helmCar", CHALLENGERS = Object.freeze(ARMS.filter((a) => a !== "helmCar"));
export const LOADOUT = Object.freeze({ helmCar: Object.freeze({ helm: true, gunner: "car" }), helmFly: Object.freeze({ helm: true, gunner: "fly" }), faceCar: Object.freeze({ helm: false, gunner: "car" }), faceFly: Object.freeze({ helm: false, gunner: "fly" }) });
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneCannon: pairs(501001, 75), fleetCannon: pairs(511001, 75), escortsCannon: pairs(521001, 75) });
export const SETUP = Object.freeze({ oneCannon: Object.freeze({ ships: 1 }), fleetCannon: Object.freeze({ ships: 3 }), escortsCannon: Object.freeze({ ships: 3, escorts: 6 }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeBestShipLoadout3: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const L = LOADOUT[arm];
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[L.gunner], helmNet: L.helm ? b.helm : null }, y: { id: "plain", cannon: true }, kind, seed, opts: { ...SETUP[fight] } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = Object.fromEntries(ARMS.map((arm) => [arm, TA.stat(a[arm])]));
    for (const c of CHALLENGERS) r[`${c}OverButton`] = TA.stat(a[c].map((v, i) => v - a[INCUMBENT][i]));
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What the button carries: a challenger that LEADS the button's loadout somewhere and TRAILS it nowhere, the largest mean gain of several; else the button stays. Pure. */
export function decide(out) {
    const ok = CHALLENGERS.filter((c) => FIGHTS.some((f) => out[f].reading[`${c}OverButton`].z >= 2) && FIGHTS.every((f) => out[f].reading[`${c}OverButton`].z > -2));
    const mean = (c) => FIGHTS.reduce((s, f) => s + out[f].reading[`${c}OverButton`].mean, 0) / FIGHTS.length;
    return { winner: ok.length ? ok.slice().sort((p, q) => mean(q) - mean(p))[0] : INCUMBENT, qualified: ok, means: Object.fromEntries(CHALLENGERS.map((c) => [c, mean(c)])) };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { oneCannon: "ONE SHIP A SIDE, THE CANNON ON", fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", escortsCannon: "FLEETS OF 3 A SIDE WITH 6 ESCORTS A SIDE, THE CANNON ON" }, name = { helmCar: "the cannon-aware helm over the car's gunner (the button)", helmFly: "the cannon-aware helm over seatFlyWired11", faceCar: "the bow-on rule over the car's gunner", faceFly: "the bow-on rule over seatFlyWired11" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.helmCar.length} pairs, against the plain ship:`); for (const arm of ARMS) log(`     ${name[arm]}: ${TA.line(R[arm])}`); for (const c of CHALLENGERS) log(`  ${c.toUpperCase()} LESS THE BUTTON: ${TA.line(R[c + "OverButton"])}`);
    }
    const verdict = decide(out); log(verdict.winner === INCUMBENT ? "THE BUTTON STAYS: no challenger leads it somewhere and trails it nowhere." : `THE BUTTON TAKES ${verdict.winner} (qualified: ${verdict.qualified.join(", ")}).`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeBestShipLoadout3: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeBestShipLoadout3: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
