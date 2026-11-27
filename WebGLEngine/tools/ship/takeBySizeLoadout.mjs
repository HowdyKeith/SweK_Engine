// WebGLEngine/tools/ship/takeBySizeLoadout.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A BUTTON THAT PICKS ITS GUNNER BY THE FIGHT'S SIZE. tools/ship/takeBestShipLoadout3.mjs (read 2026-11-20) kept the best-ship button's loadout (the cannon-aware fly-wired helm over the car's always-firing gunner) by one fight: the same helm over the
// page's fly-wired gunner (seatFlyWired11) led it in fleets (+0.183) and with escorts (+0.344) but trailed it one ship a side (-0.097). So: the car's gunner one ship a side, the fly-wired gunner in a fleet. Keith: "lets do the natural next round as
// suggested: a button that picks the gunner by fight size".
// WHAT IS KNOWN BEFORE ANY FLIGHT: ONE SHIP A SIDE IT IS THE BUTTON TO THE BIT (the same gunner, the same helm), so that fight is not flown.
//
//   node tools/ship/takeBySizeLoadout.mjs [--workers n]
//
//   THE FIGHTS: fleets of TWO a side with the cannon on both sides (a size no study has flown; seeds 531001-); fleets of THREE with the cannon (541001-); fleets of three with SIX ESCORT FIGHTERS a side and the cannon (551001-). 300 pairs a fight, 75 of
//   each of the duel's kinds. Side X is the loadout, side Y the plain ship. THE ARMS, both with the cannon-aware helm at its shipped weights: `button` (the car's gunner, the shipped file) and `bySize` (in these fleets the fly-wired gunner, the shipped
//   seatFlyWired11 file).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; BY SIZE LESS THE BUTTON, pair by pair.
// FORECAST, for the record: LEADS in fleets of three (about +0.18) and with escorts (about +0.34), as the third loadout study read on other pairs; fleets of two between one ship and three, about +0.05, perhaps CANNOT BE TOLD.
// WHAT SHIPS: if the gain LEADS in at least one fight and TRAILS in none, the page gets a hand `bysize` (the car's gunner when a side has one ship, the fly-wired gunner when it has more) and the best-ship button carries it. Nothing is written but the
//   reading; the page is changed by hand in render/spaceDuelCore.mjs and its gate pins the reading.
// READ 2026-11-20 (brain/bySizeLoadout.reading.json): by size less the button +0.157 (z 5.3) in fleets of two, +0.241 (z 7.2) of three, +0.374 (z 9.8) with escorts. IT SHIPS: render/spaceDuelCore.mjs's `bysize` hand, which the best-ship button carries.
// Every arm's leads are kept (brain/rig-results/bySizeLoadout/); the reading file (brain/bySizeLoadout.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship a side (the button to the bit), fleets of four or more, fights without the cannon, the bow-on rule (it trailed both helmed arms everywhere).
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
export const READING = path.join(BRAIN, "bySizeLoadout.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "bySizeLoadout");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["twoCannon", "fleetCannon", "escortsCannon"]), ARMS = Object.freeze(["button", "bySize"]);
/** The gunner an arm carries in a fight of `ships` a side: the button's always the car's; by size the car's one ship a side and the fly-wired one in a fleet. */
export const gunnerOf = (arm, ships) => (arm === "bySize" && ships > 1 ? "fly" : "car");
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ twoCannon: pairs(531001, 75), fleetCannon: pairs(541001, 75), escortsCannon: pairs(551001, 75) });
export const SETUP = Object.freeze({ twoCannon: Object.freeze({ ships: 2 }), fleetCannon: Object.freeze({ ships: 3 }), escortsCannon: Object.freeze({ ships: 3, escorts: 6 }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeBySizeLoadout: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const g = gunnerOf(arm, SETUP[fight].ships);
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[g], helmNet: b.helm }, y: { id: "plain", cannon: true }, kind, seed, opts: { ...SETUP[fight] } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = { bySize: TA.stat(a.bySize), button: TA.stat(a.button), gain: TA.stat(a.bySize.map((v, i) => v - a.button[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does it ship? The gain LEADS in at least one fight and TRAILS in none. Pure. */
export function qualifies(out) {
    const reasons = [];
    if (!FIGHTS.some((f) => out[f].reading.gain.z >= 2)) reasons.push(`the gain leads in no fight (z ${FIGHTS.map((f) => out[f].reading.gain.z.toFixed(2)).join(", ")})`);
    for (const f of FIGHTS) if (out[f].reading.gain.z <= -2) reasons.push(`in ${f} the gain TRAILS`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { twoCannon: "FLEETS OF 2 A SIDE, THE CANNON ON", fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", escortsCannon: "FLEETS OF 3 A SIDE WITH 6 ESCORTS A SIDE, THE CANNON ON" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.button.length} pairs, against the plain ship:`); log(`     the button (the cannon-aware helm over the car's gunner): ${TA.line(R.button)}`); log(`     by size (the fly-wired gunner in a fleet): ${TA.line(R.bySize)}`); log(`  BY SIZE LESS THE BUTTON: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: the button picks its gunner by the fight's size." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeBySizeLoadout: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeBySizeLoadout: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
