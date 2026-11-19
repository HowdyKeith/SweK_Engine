// WebGLEngine/tools/ship/takeBestShipLoadout.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE `best ship` BUTTON SHOULD CARRY. space-duel.html's preset (render/spaceDuelCore.mjs's PRESETS) puts the cannon-aware fly-wired helm (helmFlyWired3) over the HAND GUNNER, and says it was NOT searched for: the race car's always-firing gunner
// (car-big, brain/seatTurretGunnerWeightsBig.json) has led the hand gunner in a seat and was never tried with this helm. Keith: "then 3" -- round 3 of the rounds suggested on 2026-11-18.
//
//   node tools/ship/takeBestShipLoadout.mjs [--workers n]
//
//   THE FIGHTS: one ship a side, the cannon on both sides; fleets of THREE a side, the cannon on; fleets of three, no cannon. No escorts. 300 pairs a fight, 75 of each of the duel's kinds, seeds 261001-, 271001-, 281001-. Side X is the loadout, side Y
//   the plain ship (the bow-on rule, the hand gunner), both with the fight's cannon. THE ARMS, all with the cannon-aware fly-wired helm at its shipped weights: the hand gunner (`hand`, the preset now); the car's always-firing gunner (`carBig`, its shipped
//   file); the ships-sticky fly-wired gunner (`ships`, seatFlyWired3 at -3, -3, the page's `flywired` hand). The mixed gunner that holds (seatFlyWired6) is not an arm: with no fighters it is the ships-sticky gunner to the bit.
//
// REGISTERED 2026-11-19, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; each CHALLENGER (carBig, ships) LESS THE HAND ARM, pair by pair.
// FORECAST, for the record: carBig LEADS the hand arm in all three fights (by about 0.5 one a side, where it led by 0.85 without this helm, and about 0.3 in fleets); ships TRAILS it with the cannon (the ships-sticky gunner's -0.27 in fleets with the
//   cannon) and is level without it.
// WHAT IS DECIDED: a challenger REPLACES the hand gunner in the preset if it LEADS the hand arm in at least one fight and TRAILS it in none; of two that do, the one whose three gains have the larger mean. Otherwise the preset stays as it is. Nothing
//   is written but the reading: the preset is changed by hand in render/spaceDuelCore.mjs and its gate pins the reading.
// Every arm's leads are kept (brain/rig-results/bestShipLoadout/); the reading file (brain/bestShipLoadout.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: other helms, escorts and fighters (the fly-wired mixed gunners' question), rationed magazines (where a gunner that always fires should pay), green or perfect sights.
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
export const READING = path.join(BRAIN, "bestShipLoadout.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "bestShipLoadout");
export const HELM_FILE = path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), CAR_BIG_FILE = path.join(BRAIN, "seatTurretGunnerWeightsBig.json");
export const FIGHTS = Object.freeze(["oneCannon", "fleetCannon", "fleetNoCannon"]), ARMS = Object.freeze(["hand", "carBig", "ships"]), CHALLENGERS = Object.freeze(["carBig", "ships"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneCannon: pairs(261001, 75), fleetCannon: pairs(271001, 75), fleetNoCannon: pairs(281001, 75) });
export const SETUP = Object.freeze({ oneCannon: Object.freeze({ ships: 1, cannon: true }), fleetCannon: Object.freeze({ ships: 3, cannon: true }), fleetNoCannon: Object.freeze({ ships: 3, cannon: false }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const helm = PB.importBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), read(HELM_FILE)), car = PB.importBrain(PB.describePolicy(ST.POLICY_ID, ST), read(CAR_BIG_FILE));
    if (!helm.ok) throw new Error(`takeBestShipLoadout: ${HELM_FILE}: ${helm.reason}`); if (!car.ok) throw new Error(`takeBestShipLoadout: ${CAR_BIG_FILE}: ${car.reason}`);
    return { helm: { policy: FS.POLICY_ID3, weights: Array.from(helm.weights) }, carBig: { policy: ST.POLICY_ID, weights: Array.from(car.weights) }, ships: { policy: FT.POLICY_ID3, weights: [-3, -3] }, hand: null };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const { ships, cannon } = SETUP[fight];
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network: b[arm], helmNet: b.helm }, y: { id: "plain", cannon }, kind, seed, opts: { ships } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = Object.fromEntries(ARMS.map((arm) => [arm, TA.stat(a[arm])]));
    for (const c of CHALLENGERS) r[`${c}OverHand`] = TA.stat(a[c].map((v, i) => v - a.hand[i]));
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Which gunner the preset carries: a challenger that LEADS the hand arm somewhere and TRAILS it nowhere, the larger mean gain of two; else the hand. Pure. */
export function decide(out) {
    const ok = CHALLENGERS.filter((c) => FIGHTS.some((f) => out[f].reading[`${c}OverHand`].z >= 2) && FIGHTS.every((f) => out[f].reading[`${c}OverHand`].z > -2));
    const mean = (c) => FIGHTS.reduce((s, f) => s + out[f].reading[`${c}OverHand`].mean, 0) / FIGHTS.length;
    const winner = ok.length ? ok.slice().sort((p, q) => mean(q) - mean(p))[0] : "hand";
    return { winner, qualified: ok, means: Object.fromEntries(CHALLENGERS.map((c) => [c, mean(c)])) };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { oneCannon: "ONE SHIP A SIDE, THE CANNON ON", fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", fleetNoCannon: "FLEETS OF 3 A SIDE, NO CANNON" }, name = { hand: "the hand gunner", carBig: "the car's always-firing gunner", ships: "the ships-sticky fly-wired gunner" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.hand.length} pairs, the cannon-aware fly-wired helm over each gunner, against the plain ship:`); for (const arm of ARMS) log(`     ${name[arm]}: ${TA.line(R[arm])}`); for (const c of CHALLENGERS) log(`  ${name[c].toUpperCase()} LESS THE HAND: ${TA.line(R[c + "OverHand"])}`);
    }
    const verdict = decide(out); log(verdict.winner === "hand" ? "THE PRESET STAYS: no challenger leads the hand gunner somewhere and trails it nowhere." : `THE PRESET TAKES ${verdict.winner} (qualified: ${verdict.qualified.join(", ")}).`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeBestShipLoadout: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeBestShipLoadout: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
