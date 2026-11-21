// WebGLEngine/tools/ship/takeCarTodayNoCannon.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CAR-TODAY WITHOUT A CANNON, AGAIN AND WITH ESCORTS. tools/ship/takeButtonNoCannon.mjs gave the by-the-fight button car-today one ship a side with nothing else and no cannon on a lead near the line (+0.080 over the no-window fly-wired gunner, z 2.36);
// and one ship a side with escorts the button takes car-today with or without a cannon, though it was flown there only with one (tools/ship/takeCarTodayEscorts.mjs). Keith: "2" (car-today without a cannon, on fresh pairs) and "3" (with escorts and no cannon).
//
//   node tools/ship/takeCarTodayNoCannon.mjs [--workers n]
//
//   THE FIGHTS, NO CANNON on either side, side X under the page's cannon-aware fly-wired helm (brain/helmFlyWired3WeightsNoCannon.json: -0.25 without a cannon), side Y plain: ONE SHIP A SIDE with nothing else, 600 PAIRS (seeds 1321001-1321150);
//   ONE SHIP A SIDE WITH TWO ESCORTS A SIDE (1331001-) and WITH SIX (1341001-), 300 pairs each. 150 or 75 of each kind. None flown by anything before.
//   THE ARMS: `today` (brain/seatTurretGunnerWeightsToday.json) and `alt`, what the button took there before car-today: one ship a side the no-window fly-wired gunner (brain/seatFlyWired11WeightsOne.json), with escorts the 45-degree one
//   (brain/seatFlyWired11WeightsDefault.json).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; CAR-TODAY LESS THE OTHER, pair by pair.
// FORECAST, for the record: one ship a side the lead comes back smaller and cannot be told (it was near the line); with escorts car-today leads with two (as with the cannon) and cannot be told with six.
// WHAT IS DECIDED, each pick apart. ONE SHIP A SIDE WITHOUT A CANNON: car-today stays unless it TRAILS there; if it trails, the button's `oneNoCannon` pick is dropped (the no-window gunner again). WITH ESCORTS AND NO CANNON: car-today stays unless it
//   TRAILS in either escorts fight; if it trails, the button gains an `escortsNoCannon` pick, the 45-degree gunner. Nothing is written but the reading; the page is changed by hand to what is decided.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/carTodayNoCannon/); the reading file (brain/carTodayNoCannon.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets, fighters, the bow-on rule, other helms, the rationed fight and the trained pilot's escorts (tools/ship/takeButtonHardToday.mjs).
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
export const READING = path.join(BRAIN, "carTodayNoCannon.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "carTodayNoCannon");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["one", "escorts2", "escorts6"]), ARMS = Object.freeze(["today", "alt"]), ESCORT_FIGHTS = Object.freeze(["escorts2", "escorts6"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(1321001, 150), escorts2: pairs(1331001, 75), escorts6: pairs(1341001, 75) });
export const SETUP = Object.freeze({ one: Object.freeze({ ships: 1, escorts: 0 }), escorts2: Object.freeze({ ships: 1, escorts: 2 }), escorts6: Object.freeze({ ships: 1, escorts: 6 }) });
/** The gunner each arm carries. */
export const gunnerOf = (arm, fight) => (arm === "today" ? "today" : fight === "one" ? "flyOne" : "fly");
/** The shipped files the arms carry, each checked by its own policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeCarTodayNoCannon: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight];
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: false, network: b[gunnerOf(arm, fight)], helmNet: b.helm }, y: { id: "plain", cannon: false }, kind, seed, opts: { ships: S.ships, ...(S.escorts ? { escorts: S.escorts } : {}) } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { today: TA.stat(a.today), alt: TA.stat(a.alt), gain: TA.stat(a.today.map((v, i) => v - a.alt[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided, each pick apart: it stays unless car-today TRAILS (one ship a side) or trails in either escorts fight. Pure. */
export function decide(out) {
    const trails = (f) => out[f].reading.gain.z <= -2, one = !trails("one"), escorts = !ESCORT_FIGHTS.some(trails);
    return { ok: one && escorts, one, escorts, reasons: [one ? "one ship a side car-today stays" : "one ship a side car-today TRAILS: the oneNoCannon pick is dropped", escorts ? "with escorts car-today stays" : "with escorts car-today TRAILS: the button gains escortsNoCannon, the 45-degree gunner"] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`ONE SHIP A SIDE${SETUP[f].escorts ? ` WITH ${SETUP[f].escorts} ESCORTS A SIDE` : ""}, NO CANNON, the cannon-aware helm, ${a.today.length} pairs, against the plain ship:`); log(`     car-today: ${TA.line(R.today)}`); log(`     ${f === "one" ? "the no-window fly-wired gunner" : "the 45-degree fly-wired gunner"}: ${TA.line(R.alt)}`); log(`  CAR-TODAY LESS THE OTHER: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeCarTodayNoCannon: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeCarTodayNoCannon: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
