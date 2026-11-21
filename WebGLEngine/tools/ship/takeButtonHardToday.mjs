// WebGLEngine/tools/ship/takeButtonHardToday.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BUTTON'S CAR-TODAY PICKS IN THE HARD FIGHTS. Since 2026-11-21 the by-the-fight button takes car-today one ship a side with escorts (tools/ship/takeCarTodayEscorts.mjs, PD-flown escorts, whole magazines) and one ship a side with nothing else and
// no cannon (tools/ship/takeButtonNoCannon.mjs, whole magazines). Neither pick was flown against the trained pilot's escorts or rationed; tools/ship/takeButtonOneHard.mjs flew the picks before them there. Keith: "the rationed fight and the trained
// pilot's escorts".
//
//   node tools/ship/takeButtonHardToday.mjs [--workers n]
//
//   THE FIGHTS, one ship a side, 300 pairs each, 75 of each kind, under the page's cannon-aware helm (brain/helmFlyWired3WeightsNoCannon.json) on side X, side Y plain:
//     escortsPilot      the cannon on both sides, FOUR ESCORTS A SIDE FLOWN BY THE TRAINED PILOT (brain/pilot6dofWeightsDefault-d18.json, both sides) -- seeds 1391001-
//     escortsRationed   the cannon on both sides, two escorts a side, A QUARTER OF EVERY MAGAZINE -- seeds 1401001-
//     oneRationedNone   NO CANNON on either side, nothing else, a quarter of every magazine -- seeds 1411001-
//   None flown by anything before. THE ARMS: `today` (car-today, the button's pick in all three) and `alt`, the pick before it: with escorts the 45-degree fly-wired gunner, with nothing else the no-window one.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; CAR-TODAY LESS THE OTHER, pair by pair.
// FORECAST, for the record: against the pilot's escorts car-today trails a little (the fly-wired gunner led the car's against the pilot's fighters) and cannot be told; rationed it cannot be told with escorts and leads a little without the cannon.
// WHAT IS DECIDED, as takeButtonOneHard: each pick HOLDS if car-today TRAILS the other in no fight of it (a lead is not needed: it is the pick already); where it trails, the by-the-fight hand's note says so. Nothing is written but the reading.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/buttonHardToday/); the reading file (brain/buttonHardToday.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets (their pick is unchanged: tools/ship/takeButtonOneHard.mjs, takePresetsHard.mjs), the pilot's escorts without the cannon, other rations, the pilot on one side only.
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
import * as PI from "./takeFlyWiredPilot.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "buttonHardToday.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "buttonHardToday");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["escortsPilot", "escortsRationed", "oneRationedNone"]), ARMS = Object.freeze(["today", "alt"]), RATION = 0.25;
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ escortsPilot: pairs(1391001, 75), escortsRationed: pairs(1401001, 75), oneRationedNone: pairs(1411001, 75) });
export const SETUP = Object.freeze({ escortsPilot: Object.freeze({ cannon: true, escorts: 4, pilot: true }), escortsRationed: Object.freeze({ cannon: true, escorts: 2, ammo: RATION }), oneRationedNone: Object.freeze({ cannon: false, escorts: 0, ammo: RATION }) });
/** The pick each fight's car-today replaced. */
export const PICK = Object.freeze({ escortsPilot: "escorts", escortsRationed: "escorts", oneRationedNone: "oneNoCannon" });
/** The gunner each arm carries. */
export const gunnerOf = (arm, fight) => (arm === "today" ? "today" : SETUP[fight].escorts ? "fly" : "flyOne");
/** The shipped files the arms carry, each checked by its own policy; the trained pilot. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeButtonHardToday: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways), pilot: PI.shipped().pilot };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], pilot = S.pilot ? { pilotNet: b.pilot } : {};
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: S.cannon, network: b[gunnerOf(arm, fight)], helmNet: b.helm, ...pilot }, y: { id: "plain", cannon: S.cannon, ...pilot }, kind, seed, opts: { ships: 1, ...(S.escorts ? { escorts: S.escorts } : {}), ...(S.ammo ? { ammo: S.ammo } : {}) } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { today: TA.stat(a.today), alt: TA.stat(a.alt), gain: TA.stat(a.today.map((v, i) => v - a.alt[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does each pick hold? Car-today TRAILS the other in no fight of it. Pure. */
export function decide(out) {
    const holds = {}; for (const p of new Set(Object.values(PICK))) holds[p] = !FIGHTS.some((f) => PICK[f] === p && out[f].reading.gain.z <= -2);
    const reasons = FIGHTS.filter((f) => out[f].reading.gain.z <= -2).map((f) => `in ${f} car-today TRAILS the pick before it`);
    return { ok: reasons.length === 0, holds, reasons };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { escortsPilot: "ONE SHIP A SIDE WITH 4 ESCORTS A SIDE FLOWN BY THE TRAINED PILOT, THE CANNON ON", escortsRationed: `ONE SHIP A SIDE WITH 2 ESCORTS A SIDE, THE CANNON ON, A ${RATION} RATION`, oneRationedNone: `ONE SHIP A SIDE, NO CANNON, A ${RATION} RATION` };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.today.length} pairs, under the cannon-aware helm, against the plain ship:`); log(`     car-today: ${TA.line(R.today)}`); log(`     ${SETUP[f].escorts ? "the 45-degree fly-wired gunner" : "the no-window fly-wired gunner"}: ${TA.line(R.alt)}`); log(`  CAR-TODAY LESS THE OTHER: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(verdict.ok ? "THE PICKS HOLD: car-today trails nowhere." : "WHERE IT TRAILS: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeButtonHardToday: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeButtonHardToday: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
