// WebGLEngine/tools/ship/takeButtonOneHard.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BEST-SHIP BUTTON ONE SHIP A SIDE IN THE HARD FIGHTS. The button's one-ship pick became the fly-wired gunner with NO HAND WINDOW (tools/ship/takeFlyWiredOneWindow.mjs, whole magazines), and with escorts the 45-degree one (tools/ship/takeBySightLoadout.mjs,
// PD escorts). Neither was flown rationed nor against the trained pilot one ship a side. Keith: "then 3".
//
//   node tools/ship/takeButtonOneHard.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides, one ship a side: A QUARTER OF EVERY MAGAZINE and nothing else (seeds 781001-); FOUR ESCORTS A SIDE FLOWN BY THE TRAINED PILOT (brain/pilot6dofWeightsDefault-d18.json, both sides; seeds 791001-). 300 pairs a fight,
//   75 of each of the duel's kinds. Side X has the cannon-aware helm at its shipped weights; side Y is plain. THE ARMS: `car` (the car's always-firing gunner) and `button` (the button's pick: rationed the no-window gunner, with escorts the 45-degree one).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; THE BUTTON'S LESS THE CAR'S, pair by pair.
// FORECAST, for the record: rationed CANNOT BE TOLD or a small lead (both hold the trigger; whole magazines it was +0.02 with the cannon); with the pilot's escorts a lead, as the fly-wired gunner led the car's against the pilot's fighters (+0.13).
// WHAT IS DECIDED: the button's pick HOLDS if it TRAILS the car's gunner in neither fight; if it trails, the by-size hand's note says where. Nothing is written but the reading.
// READ 2026-11-20 (brain/buttonOneHard.reading.json): THE PICK HOLDS -- +0.008 rationed, +0.055 with pilot-flown escorts, both cannot be told. The by-size hand's note says so.
// Every arm's leads are kept (brain/rig-results/buttonOneHard/); the reading file (brain/buttonOneHard.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets (tools/ship/takeButtonUntried.mjs, takePresetsHard.mjs), other rations, the pilot on one side only.
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
import * as PI from "./takeFlyWiredPilot.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "buttonOneHard.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "buttonOneHard");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["oneRationed", "onePilotEscorts"]), ARMS = Object.freeze(["car", "button"]), RATION = 0.25;
/** The gunner each arm carries: the car's; the button's pick -- one ship a side with nothing else the no-window gunner, with escorts the 45-degree one. */
export const gunnerOf = (arm, fight) => (arm === "car" ? "car" : fight === "oneRationed" ? "flyOne" : "fly");
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneRationed: pairs(D.KINDS, 781001, 75), onePilotEscorts: pairs(D.KINDS, 791001, 75) });
export const SETUP = Object.freeze({ oneRationed: Object.freeze({ ships: 1, escorts: 0, ammo: RATION }), onePilotEscorts: Object.freeze({ ships: 1, escorts: 4, pilot: true }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeButtonOneHard: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways), pilot: PI.shipped().pilot };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], g = gunnerOf(arm, fight), pilot = S.pilot ? { pilotNet: b.pilot } : {};
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[g], helmNet: b.helm, ...pilot }, y: { id: "plain", cannon: true, ...pilot }, kind, seed, opts: { ships: S.ships, ...(S.escorts ? { escorts: S.escorts } : {}), ...(S.ammo ? { ammo: S.ammo } : {}) } }));
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
    const out = {}, title = { oneRationed: `ONE SHIP A SIDE, THE CANNON ON, A ${RATION} RATION`, onePilotEscorts: "ONE SHIP A SIDE WITH 4 ESCORTS A SIDE FLOWN BY THE TRAINED PILOT, THE CANNON ON" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.car.length} pairs, under the cannon-aware helm, against the plain ship:`); log(`     the car's gunner: ${TA.line(R.car)}`); log(`     the button's pick (${f === "oneRationed" ? "the no-window fly-wired gunner" : "the 45-degree fly-wired gunner"}): ${TA.line(R.button)}`); log(`  THE BUTTON'S LESS THE CAR'S: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "THE BUTTON'S PICK HOLDS: it trails the car's gunner nowhere." : "THE BUTTON'S PICK DOES NOT HOLD: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeButtonOneHard: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeButtonOneHard: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
