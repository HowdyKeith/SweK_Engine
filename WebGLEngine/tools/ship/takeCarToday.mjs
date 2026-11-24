// WebGLEngine/tools/ship/takeCarToday.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE CAR'S GUNNER TRAINED IN TODAY'S FIGHT, FLOWN WHERE THE BUTTON IS USED. tools/ship/trainTurretSeatToday.mjs trained the car's gunner one ship a side under the cannon-aware helm against the no-window fly-wired gunner, and it qualified there (+0.051, z 2.12);
// the duel page carries it as the hand `car-today`, and the by-the-fight button kept its pick until it was flown where the button is used. Keith: "then do 1" (if the new gunner ships, fly it wherever the button is used).
//
//   node tools/ship/takeCarToday.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides, side Y (or the fighters' target) plain: under the cannon-aware helm ONE SHIP A SIDE with nothing else (seeds 1081001-), FLEETS OF THREE a side (1091001-), ONE SHIP A SIDE WITH TWO ESCORTS a side (1101001-), ONE SHIP
//   AGAINST EIGHT PD FIGHTERS (battleshipFight, 1111001-); under the BOW-ON RULE, no helm network, one ship a side (1121001-) and fleets of three (1131001-). 300 pairs or attacks a fight, 75 of each kind. None flown by anything before.
//   THE ARMS: `today` (brain/seatTurretGunnerWeightsToday.json) and `button` (the by-size hand's pick: one ship a side with nothing else the no-window fly-wired gunner; with escorts, fighters or a fleet the 45-degree one).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; THE NEW GUNNER'S LESS THE BUTTON'S PICK, pair by pair.
// FORECAST, for the record: one ship a side under the helm it LEADS by about the training's +0.05 (that is where it was trained); in a fleet, with escorts and against fighters it TRAILS (it is car-big trained on a little, and car-big trailed the
//   fly-wired gunner by about 0.3 in fleets); under the bow-on rule it is level one ship a side and trails in fleets.
// WHAT IS DECIDED, the button's two picks apart (spaceDuelCore's bySize: `one` is one ship a side with nothing else, `fleet` is the rest):
//   `one` takes car-today if it LEADS in `one`; `fleet` takes it if it LEADS in at least one of `fleet`, `escorts`, `fighters` and TRAILS in none. The bow-on rule fights are read for the hand's note and decide nothing (the button flies the helm).
//   Nothing is written but the reading; the page is changed by hand to what is decided, and the car-today note says where it was flown.
// READ 2026-11-21 (brain/carToday.reading.json; the kept arms in brain/rig-results/carToday/): BOTH PICKS HOLD. Car-today less the button's pick, under the cannon-aware helm: one ship a side +0.032 (z 1.67, CANNOT BE TOLD -- the training's +0.051
//   did not come back on fresh pairs against the plain side); fleets of three -0.177 (z -5.40, TRAILS); one ship with two escorts +0.112 (z 2.47, LEADS); against eight PD fighters -0.013 (z -5.88, TRAILS). Under the bow-on rule: one ship a side +0.030
//   (CANNOT BE TOLD), fleets -0.335 (z -7.49, TRAILS). `one` keeps the no-window gunner, `fleet` the 45-degree one (it trails in a fleet and against fighters, though it leads with escorts). The forecast had one ship a side a lead and escorts a trail: both wrong.
// Every arm's leads are kept (brain/rig-results/carToday/); the reading file (brain/carToday.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: the other helms, six escorts, the trained pilot's fighters, the rationed fight, the gunner network's own training.
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
export const READING = path.join(BRAIN, "carToday.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "carToday");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["one", "fleet", "escorts", "fighters", "oneFace", "fleetFace"]), ARMS = Object.freeze(["today", "button"]);
/** The fights each of the button's picks is decided on; the bow-on rule fights decide nothing. */
export const DECIDES = Object.freeze({ one: Object.freeze(["one"]), fleet: Object.freeze(["fleet", "escorts", "fighters"]) });
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(D.KINDS, 1081001, 75), fleet: pairs(D.KINDS, 1091001, 75), escorts: pairs(D.KINDS, 1101001, 75), fighters: pairs(BF.KINDS, 1111001, 75), oneFace: pairs(D.KINDS, 1121001, 75), fleetFace: pairs(D.KINDS, 1131001, 75) });
export const SETUP = Object.freeze({
    one: Object.freeze({ ships: 1, escorts: 0, helm: true }), fleet: Object.freeze({ ships: 3, escorts: 0, helm: true }), escorts: Object.freeze({ ships: 1, escorts: 2, helm: true }),
    fighters: Object.freeze({ ships: 1, raiders: 8, helm: true }), oneFace: Object.freeze({ ships: 1, escorts: 0, helm: false }), fleetFace: Object.freeze({ ships: 3, escorts: 0, helm: false }) });
/** The gunner each arm carries: the new one; the by-size hand's pick -- one ship a side with nothing else the no-window gunner, otherwise the 45-degree one. */
export const gunnerOf = (arm, fight) => { const S = SETUP[fight]; return arm === "today" ? "today" : S.ships === 1 && !S.escorts && !S.raiders ? "flyOne" : "fly"; };
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeCarToday: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], g = gunnerOf(arm, fight), helmNet = S.helm ? b.helm : null;
    if (S.raiders) return list.map(({ kind, seed }) => ({ vsFighters: { network: b[g], helm: helmNet, seed, kind, opts: {} } }));
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[g], helmNet }, y: { id: "plain", cannon: true }, kind, seed, opts: S.escorts ? { ships: S.ships, escorts: S.escorts } : { ships: S.ships } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = { today: TA.stat(a.today), button: TA.stat(a.button), gain: TA.stat(a.today.map((v, i) => v - a.button[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What the button's two picks become. `one` takes the new gunner if it LEADS in `one`; `fleet` if it LEADS in one of its fights and TRAILS in none. Pure. */
export function qualifies(out) {
    const z = (f) => out[f].reading.gain.z, takes = { one: z("one") >= 2, fleet: DECIDES.fleet.some((f) => z(f) >= 2) && !DECIDES.fleet.some((f) => z(f) <= -2) };
    const reasons = Object.entries(DECIDES).map(([pick, fs2]) => `${pick}: ${takes[pick] ? "TAKES car-today" : "keeps its pick"} (${fs2.map((f) => `${f} ${TA.word(z(f))}`).join(", ")})`);
    return { ok: takes.one || takes.fleet, takes, reasons };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { one: "ONE SHIP A SIDE, THE CANNON-AWARE HELM", fleet: "FLEETS OF 3 A SIDE, THE CANNON-AWARE HELM", escorts: "ONE SHIP A SIDE WITH 2 ESCORTS A SIDE, THE CANNON-AWARE HELM", fighters: "ONE SHIP AGAINST EIGHT PD FIGHTERS, THE CANNON-AWARE HELM", oneFace: "ONE SHIP A SIDE, THE BOW-ON RULE (NO HELM NETWORK)", fleetFace: "FLEETS OF 3 A SIDE, THE BOW-ON RULE" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, the cannon on, ${a.today.length} ${SETUP[f].raiders ? "attacks" : "pairs"}, against the plain side:`); log(`     car-today: ${TA.line(R.today)}`); log(`     the button's pick (${gunnerOf("button", f) === "flyOne" ? "the no-window fly-wired gunner" : "the 45-degree fly-wired gunner"}): ${TA.line(R.button)}`); log(`  CAR-TODAY LESS THE PICK: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeCarToday: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeCarToday: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
