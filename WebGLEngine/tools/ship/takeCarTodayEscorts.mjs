// WebGLEngine/tools/ship/takeCarTodayEscorts.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CAR-TODAY WITH ESCORTS, AGAIN, ON FRESH PAIRS. tools/ship/takeCarToday.mjs flew car-today where the by-the-fight button is used: one ship a side with two escorts a side it LED the button's pick (the 45-degree fly-wired gunner) by +0.112 (z 2.47) --
// one fight of six, near the line -- and the button's `fleet` pick kept the 45-degree gunner because car-today trails in fleets and against fighters. Keith: "do 1" (a third pick, for escorts).
//
//   node tools/ship/takeCarTodayEscorts.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides, under the cannon-aware fly-wired helm (the page's file, brain/helmFlyWired3WeightsNoCannon.json -- with a cannon the shipped helm to the bit), side Y plain:
//   ONE SHIP A SIDE WITH TWO ESCORTS A SIDE (seeds 1141001-) and ONE SHIP A SIDE WITH SIX (1151001-). 300 pairs a fight, 75 of each kind. None flown by anything before.
//   THE ARMS: `today` (brain/seatTurretGunnerWeightsToday.json) and `button` (the pick with escorts: the 45-degree fly-wired gunner).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; CAR-TODAY LESS THE PICK, pair by pair.
// FORECAST, for the record: the +0.11 comes back smaller and cannot be told with two escorts; with six it cannot be told either.
// WHAT IS DECIDED: if CAR-TODAY LESS THE PICK LEADS in at least one fight and TRAILS in neither, the by-the-fight button gains a third pick: one ship a side with escorts takes car-today (a fleet, with or without escorts, keeps the 45-degree gunner).
//   Nothing is written but the reading; the page is changed by hand to what is decided.
// Every arm's leads are kept (brain/rig-results/carTodayEscorts/); the reading file (brain/carTodayEscorts.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets with escorts, the bow-on rule, other helms, fighters, the rationed fight.
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
export const READING = path.join(BRAIN, "carTodayEscorts.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "carTodayEscorts");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["escorts2", "escorts6"]), ARMS = Object.freeze(["today", "button"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ escorts2: pairs(1141001, 75), escorts6: pairs(1151001, 75) });
export const SETUP = Object.freeze({ escorts2: Object.freeze({ ships: 1, escorts: 2 }), escorts6: Object.freeze({ ships: 1, escorts: 6 }) });
/** The shipped files the arms carry, each checked by its own policy (a file another policy's, or a weight short, is refused by name). */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeCarTodayEscorts: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight], g = arm === "today" ? "today" : "fly";
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: b[g], helmNet: b.helm }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: S.ships, escorts: S.escorts } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = { today: TA.stat(a.today), button: TA.stat(a.button), gain: TA.stat(a.today.map((v, i) => v - a.button[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does the button gain the third pick? Car-today LEADS in one fight and TRAILS in neither. Pure. */
export function qualifies(out) {
    const z = (f) => out[f].reading.gain.z, ok = FIGHTS.some((f) => z(f) >= 2) && !FIGHTS.some((f) => z(f) <= -2);
    return { ok, reasons: ok ? [] : [FIGHTS.map((f) => `${f} ${TA.word(z(f))}`).join(", ")] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`ONE SHIP A SIDE WITH ${SETUP[f].escorts} ESCORTS A SIDE, THE CANNON-AWARE HELM, the cannon on, ${a.today.length} pairs, against the plain side:`); log(`     car-today: ${TA.line(R.today)}`); log(`     the button's pick (the 45-degree fly-wired gunner): ${TA.line(R.button)}`); log(`  CAR-TODAY LESS THE PICK: ${TA.line(R.gain)}`);
    }
    const verdict = qualifies(out); log(verdict.ok ? "QUALIFIES: one ship a side with escorts, the button takes car-today." : "DOES NOT QUALIFY: the button keeps the 45-degree gunner with escorts (" + verdict.reasons.join("; ") + ").");
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeCarTodayEscorts: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeCarTodayEscorts: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
