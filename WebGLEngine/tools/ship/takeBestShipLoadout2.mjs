// WebGLEngine/tools/ship/takeBestShipLoadout2.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// WHAT THE `best ship` BUTTON CARRIES, ASKED AGAIN. tools/ship/takeBestShipLoadout.mjs (read 2026-11-19) gave the button the car's always-firing gunner (car-big) under the cannon-aware fly-wired helm, over the hand gunner and the ships-sticky fly-wired gunner,
// in fleets with NO ESCORTS and WHOLE MAGAZINES. Two things it did not ask: escort fighters (where the page's fly-wired gunner, since then seatFlyWired8, leads the plain side by +0.40 and +0.24), and rationed magazines (where a gunner that always holds
// the trigger should pay; the button's note says so). Keith: "1 first, since it directly decides what the page's button carries".
//
//   node tools/ship/takeBestShipLoadout2.mjs [--workers n]
//
//   THE FIGHTS: fleets of THREE a side with SIX ESCORT FIGHTERS a side (the PD autopilot), with no cannon and with the cannon on both sides, on the same pairs (seeds 341001-); fleets of three, no escorts, the cannon on, every gun seat's magazine cut to A
//   QUARTER (battleshipDuel's `ammo` 0.25: a main gun 40 rounds; seeds 351001-). 300 pairs a fight, 75 of each of the duel's kinds. Side X is the loadout, side Y the plain ship (the bow-on rule, the hand gunner), both with the fight's cannon and ration.
//   THE ARMS, all with the cannon-aware fly-wired helm at its shipped weights: the car's always-firing gunner (`carBig`, THE BUTTON NOW); the hand gunner (`hand`); the page's fly-wired gunner (`fly`, seatFlyWired8 at -3, -3, 0.1).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; each CHALLENGER (hand, fly) LESS THE CAR'S GUNNER, pair by pair.
// FORECAST, for the record: with escorts the car's gunner still leads both challengers (it shoots fighters as it shoots ships, and holding the trigger costs nothing with whole magazines), so the fly gunner TRAILS it by about 0.2; rationed, the car's
//   gunner runs dry and the hand gunner LEADS it, by about 0.3, and the fly gunner by less. So most likely no challenger qualifies (each trails somewhere) and the button stays.
// WHAT IS DECIDED: a challenger REPLACES the car's gunner in the preset if it LEADS it in at least one fight and TRAILS it in none; of two that do, the one whose three gains have the larger mean. Otherwise the preset stays. Nothing is written but the
//   reading; a change to the preset is made by hand in render/spaceDuelCore.mjs and its gate pins the reading.
// READ 2026-11-20 (brain/bestShipLoadout2.reading.json): THE PRESET STAYS. The car's always-firing gunner leads the hand gunner by 1.283, 0.905 and 0.189 and the fly-wired gunner by 0.851, 0.796 and 0.381 (escorts without and with the cannon; rationed).
//   The forecast was wrong rationed: at a quarter of every magazine the car's gunner still leads. Seen in passing: under the cannon-aware helm the fly-wired gunner leads the plain side by only +0.136 with escorts and no cannon, where under the bow-on
//   rule it led by +0.40 (tools/ship/takeFlyWiredGunnerHoldSees.mjs, other pairs) -- the helm and that gunner do not add; not a reading of this study.
// Every arm's leads are kept (brain/rig-results/bestShipLoadout2/); the reading file (brain/bestShipLoadout2.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship a side and fleets with whole magazines and no escorts (the first study), other rations, escorts with the cannon AND a ration, fighters alone, other helms.
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
export const READING = path.join(BRAIN, "bestShipLoadout2.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "bestShipLoadout2");
export const HELM_FILE = path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), CAR_BIG_FILE = path.join(BRAIN, "seatTurretGunnerWeightsBig.json");
export const FIGHTS = Object.freeze(["escorts", "escortsCannon", "rationed"]), ARMS = Object.freeze(["carBig", "hand", "fly"]), CHALLENGERS = Object.freeze(["hand", "fly"]), INCUMBENT = "carBig", ESCORTS = 6, RATION = 0.25;
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const ESCORT_PAIRS = pairs(341001, 75);   // the two escort fleets fly the same pairs
export const SETS = Object.freeze({ escorts: ESCORT_PAIRS, escortsCannon: ESCORT_PAIRS, rationed: pairs(351001, 75) });
export const SETUP = Object.freeze({ escorts: Object.freeze({ ships: 3, escorts: ESCORTS, cannon: false, ammo: 1 }), escortsCannon: Object.freeze({ ships: 3, escorts: ESCORTS, cannon: true, ammo: 1 }), rationed: Object.freeze({ ships: 3, escorts: 0, cannon: true, ammo: RATION }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const helm = PB.importBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), read(HELM_FILE)), car = PB.importBrain(PB.describePolicy(ST.POLICY_ID, ST), read(CAR_BIG_FILE));
    if (!helm.ok) throw new Error(`takeBestShipLoadout2: ${HELM_FILE}: ${helm.reason}`); if (!car.ok) throw new Error(`takeBestShipLoadout2: ${CAR_BIG_FILE}: ${car.reason}`);
    return { helm: { policy: FS.POLICY_ID3, weights: Array.from(helm.weights) }, carBig: { policy: ST.POLICY_ID, weights: Array.from(car.weights) }, fly: { policy: FT.POLICY_ID8, weights: [-3, -3, 0.1] }, hand: null };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const { ships, escorts, cannon, ammo } = SETUP[fight];
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network: b[arm], helmNet: b.helm }, y: { id: "plain", cannon }, kind, seed, opts: { ships, ...(escorts ? { escorts } : {}), ...(ammo < 1 ? { ammo } : {}) } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = Object.fromEntries(ARMS.map((arm) => [arm, TA.stat(a[arm])]));
    for (const c of CHALLENGERS) r[`${c}OverCar`] = TA.stat(a[c].map((v, i) => v - a[INCUMBENT][i]));
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Which gunner the preset carries: a challenger that LEADS the car's gunner somewhere and TRAILS it nowhere, the larger mean gain of two; else the car's gunner stays. Pure. */
export function decide(out) {
    const ok = CHALLENGERS.filter((c) => FIGHTS.some((f) => out[f].reading[`${c}OverCar`].z >= 2) && FIGHTS.every((f) => out[f].reading[`${c}OverCar`].z > -2));
    const mean = (c) => FIGHTS.reduce((s, f) => s + out[f].reading[`${c}OverCar`].mean, 0) / FIGHTS.length;
    const winner = ok.length ? ok.slice().sort((p, q) => mean(q) - mean(p))[0] : INCUMBENT;
    return { winner, qualified: ok, means: Object.fromEntries(CHALLENGERS.map((c) => [c, mean(c)])) };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { escorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, NO CANNON`, escortsCannon: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORT FIGHTERS A SIDE, THE CANNON ON`, rationed: `FLEETS OF 3 A SIDE, THE CANNON ON, A ${RATION} RATION OF EVERY MAGAZINE` }, name = { hand: "the hand gunner", carBig: "the car's always-firing gunner", fly: "the fly-wired gunner (seatFlyWired8)" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.carBig.length} pairs, the cannon-aware fly-wired helm over each gunner, against the plain ship:`); for (const arm of ARMS) log(`     ${name[arm]}: ${TA.line(R[arm])}`); for (const c of CHALLENGERS) log(`  ${name[c].toUpperCase()} LESS THE CAR'S: ${TA.line(R[c + "OverCar"])}`);
    }
    const verdict = decide(out); log(verdict.winner === INCUMBENT ? "THE PRESET STAYS: no challenger leads the car's gunner somewhere and trails it nowhere." : `THE PRESET TAKES ${verdict.winner} (qualified: ${verdict.qualified.join(", ")}).`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeBestShipLoadout2: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeBestShipLoadout2: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
