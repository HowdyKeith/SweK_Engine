// WebGLEngine/tools/ship/takeButtonLast.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BY-THE-FIGHT HAND IN ITS LAST UNTRIED FIGHTS. The best-ship button's `bysize` hand's note says it was NOT flown with fighters only, nor without the helm (a page user can put it under any helm). Keith: "and then 3".
//
//   node tools/ship/takeButtonLast.mjs [--workers n]
//
//   THE FIGHTS: ONE SHIP AGAINST EIGHT PD FIGHTERS, the ship under the cannon-aware helm (battleshipFight, as tools/ship/pairPool.mjs's fighter job; seeds 841001-, 75 of each attack); ONE SHIP A SIDE under the BOW-ON RULE, no helm network (851001-); fleets of
//   THREE a side under the bow-on rule (861001-); the cannon on. 300 pairs or attacks a fight. Side Y (or the fighters' target) is plain. THE ARMS: `car` (the car's always-firing gunner) and `button` (the by-size hand's pick: one ship a side with nothing
//   else the no-window fly-wired gunner, against fighters or in a fleet the 45-degree one).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; THE BUTTON'S LESS THE CAR'S, pair by pair.
// FORECAST, for the record: against fighters a small lead (+0.01 against PD fighters, tools/ship/takeBySightLoadout.mjs); one ship a side under the bow-on rule the car's gunner LEADS (tools/ship/takeBestShipLoadout3.mjs: the bow-on rule over the 45-degree
//   gunner trailed it over the car's by about 0.2 -- the no-window gunner is not that one, so perhaps less); in fleets under the bow-on rule the fly-wired one leads (by about 0.3).
// WHAT IS DECIDED: the pick HOLDS if it TRAILS the car's gunner in no fight; where it trails, the by-size note says so. Nothing is written but the reading.
// Every arm's leads are kept (brain/rig-results/buttonLast/); the reading file (brain/buttonLast.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the other helms (tools/ship/takeHelmLadder.mjs), the trained pilot's fighters (tools/ship/takePresetsHard.mjs).
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
export const READING = path.join(BRAIN, "buttonLast.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "buttonLast");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["fighters", "oneFace", "fleetFace"]), ARMS = Object.freeze(["car", "button"]);
/** The gunner each arm carries: the car's; the by-size hand's pick -- one ship a side with nothing else the no-window gunner, with fighters or a fleet the 45-degree one. */
export const gunnerOf = (arm, fight) => (arm === "car" ? "car" : fight === "oneFace" ? "flyOne" : "fly");
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ fighters: pairs(BF.KINDS, 841001, 75), oneFace: pairs(D.KINDS, 851001, 75), fleetFace: pairs(D.KINDS, 861001, 75) });
export const SETUP = Object.freeze({ fighters: Object.freeze({ ships: 1, helm: true }), oneFace: Object.freeze({ ships: 1, helm: false }), fleetFace: Object.freeze({ ships: 3, helm: false }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeButtonLast: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], g = gunnerOf(arm, fight), helmNet = S.helm ? b.helm : null;
    if (fight === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network: b[g], helm: helmNet, seed, kind, opts: {} } }));
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[g], helmNet }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: S.ships } }));
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
    const out = {}, title = { fighters: "ONE SHIP AGAINST EIGHT PD FIGHTERS, THE CANNON-AWARE HELM", oneFace: "ONE SHIP A SIDE, THE BOW-ON RULE (NO HELM NETWORK), THE CANNON ON", fleetFace: "FLEETS OF 3 A SIDE, THE BOW-ON RULE, THE CANNON ON" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.car.length} ${f === "fighters" ? "attacks" : "pairs"}, against the plain ship:`); log(`     the car's gunner: ${TA.line(R.car)}`); log(`     the button's pick (${f === "oneFace" ? "the no-window fly-wired gunner" : "the 45-degree fly-wired gunner"}): ${TA.line(R.button)}`); log(`  THE BUTTON'S LESS THE CAR'S: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "THE BUTTON'S PICK HOLDS: it trails the car's gunner nowhere." : "THE BUTTON'S PICK DOES NOT HOLD: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeButtonLast: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeButtonLast: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
