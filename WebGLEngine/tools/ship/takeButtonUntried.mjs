// WebGLEngine/tools/ship/takeButtonUntried.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BEST-SHIP BUTTON IN THE FIGHTS ITS NOTE SAYS IT WAS NOT FLOWN IN. The button's `bysize` hand (tools/ship/takeBySizeLoadout.mjs, takeBySightLoadout.mjs, takeFlyWiredOneWindow.mjs) takes the fly-wired gunner with its 45-degree window whenever a side has more
// than one ship or the fight has escorts; its note says it was not flown in fleets of four (the most a duel allows) nor without the cannon. Keith: "Let's do 4".
//
//   node tools/ship/takeButtonUntried.mjs [--workers n]
//
//   THE FIGHTS: fleets of FOUR a side with the cannon on both sides (seeds 721001-) and with none (731001-); fleets of THREE with no cannon (741001-); ONE SHIP A SIDE WITH FOUR ESCORTS a side and no cannon (751001-). 300 pairs a fight, 75 of each of the
//   duel's kinds. Side X has the cannon-aware helm at its shipped weights; side Y is plain. THE ARMS: `car` (the car's always-firing gunner, the shipped file) and `button` (the button's pick in these fights: seatFlyWired11 with its 45-degree window).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; THE BUTTON'S LESS THE CAR'S, pair by pair.
// FORECAST, for the record: the button's pick LEADS in fleets of four with the cannon (as in fleets of three, about +0.2) and in all three without the cannon (the fly-wired gunner led the car's without the cannon one ship a side, +0.145); so it holds.
// WHAT IS DECIDED: the button's pick HOLDS if it TRAILS the car's gunner in no fight; if it trails somewhere, the by-size hand's note says where (and a change to the rule would be another study). Nothing is written but the reading.
// Every arm's leads are kept (brain/rig-results/buttonUntried/); the reading file (brain/buttonUntried.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship a side with nothing else (the no-window gunner's, tools/ship/takeFlyWiredOneWindow.mjs), the trained pilot, rationed magazines (tools/ship/takePresetsHard.mjs).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as FS from "../../brain/flySteering.mjs";
import * as FT from "../../brain/flyTracking.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "buttonUntried.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "buttonUntried");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["fleet4Cannon", "fleet4NoCannon", "fleet3NoCannon", "oneEscortsNoCannon"]), ARMS = Object.freeze(["car", "button"]);
/** The gunner each arm carries: the car's; the button's pick in these fights (more than one ship, or escorts) the fly-wired gunner with its window. */
export const gunnerOf = (arm) => (arm === "button" ? "fly" : "car");
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ fleet4Cannon: pairs(D.KINDS, 721001, 75), fleet4NoCannon: pairs(D.KINDS, 731001, 75), fleet3NoCannon: pairs(D.KINDS, 741001, 75), oneEscortsNoCannon: pairs(D.KINDS, 751001, 75) });
export const SETUP = Object.freeze({ fleet4Cannon: Object.freeze({ ships: 4, escorts: 0, cannon: true }), fleet4NoCannon: Object.freeze({ ships: 4, escorts: 0, cannon: false }), fleet3NoCannon: Object.freeze({ ships: 3, escorts: 0, cannon: false }), oneEscortsNoCannon: Object.freeze({ ships: 1, escorts: 4, cannon: false }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeButtonUntried: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], g = gunnerOf(arm);
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: S.cannon, network: b[g], helmNet: b.helm }, y: { id: "plain", cannon: S.cannon }, kind, seed, opts: { ships: S.ships, ...(S.escorts ? { escorts: S.escorts } : {}) } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = { button: TA.stat(a.button), car: TA.stat(a.car), gain: TA.stat(a.button.map((v, i) => v - a.car[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does the button's pick hold? It TRAILS the car's gunner in no fight (a lead is not needed: it is the pick already). Pure. */
export function qualifies(out) {
    const reasons = []; for (const f of FIGHTS) if (out[f].reading.gain.z <= -2) reasons.push(`in ${f} the button's pick TRAILS the car's gunner`);
    return { ok: reasons.length === 0, reasons };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleet4Cannon: "FLEETS OF 4 A SIDE, THE CANNON ON", fleet4NoCannon: "FLEETS OF 4 A SIDE, NO CANNON", fleet3NoCannon: "FLEETS OF 3 A SIDE, NO CANNON", oneEscortsNoCannon: "ONE SHIP A SIDE WITH 4 ESCORTS A SIDE, NO CANNON" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.car.length} pairs, under the cannon-aware helm, against the plain ship:`); log(`     the car's gunner: ${TA.line(R.car)}`); log(`     the button's pick (the fly-wired gunner): ${TA.line(R.button)}`); log(`  THE BUTTON'S LESS THE CAR'S: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "THE BUTTON'S PICK HOLDS: it trails the car's gunner nowhere." : "THE BUTTON'S PICK DOES NOT HOLD: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeButtonUntried: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeButtonUntried: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
