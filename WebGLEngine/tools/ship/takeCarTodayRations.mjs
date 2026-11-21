// WebGLEngine/tools/ship/takeCarTodayRations.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CAR-TODAY'S ESCORTS PICK ACROSS THE PAGE'S RATIONS. One ship a side with escorts the by-the-fight button takes car-today. Against the 45-degree fly-wired
// gunner it led with whole magazines (+0.219, tools/ship/takeCarTodayEscorts.mjs) and on a quarter ration (+0.144, tools/ship/takeButtonHardToday.mjs), but
// could not be told on half (+0.027) or an eighth (-0.039, tools/ship/takeButtonHarder.mjs) -- not in step with scarcity. Keith: "1" -- fly every ration the page
// offers (render/spaceDuelCore.mjs RATIONS: 1, 1/2, 1/4, 1/8, 1/16) on fresh pairs and see whether the button should switch picks when the ammunition is short.
//
//   node tools/ship/takeCarTodayRations.mjs [--workers n]
//
//   THE FIGHTS: one ship a side, TWO ESCORTS A SIDE, the cannon on both sides, a ration of 1, 1/2, 1/4, 1/8 and 1/16, 300 pairs each (75 of each kind), seeds
//   1571001-, 1581001-, 1591001-, 1601001-, 1611001-. None flown by anything before. Side Y plain.
//   THE HELM: what the best-ship button carries since tools/ship/takeSplitHelm.mjs -- the split helm, which with the cannon is the sine twin
//   (brain/helmFlyWired3WeightsSineNoCannon.json over sine~odd). Earlier escort studies flew the fly's helm; this flies today's button.
//   THE ARMS: `today` (car-today, the button's pick) and `alt` (the 45-degree fly-wired gunner).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship;
// CAR-TODAY LESS THE 45-DEGREE GUNNER, pair by pair.
// FORECAST, for the record: car-today leads with whole magazines and trails nowhere; the rationed fights cannot be told.
// WHAT IS DECIDED: car-today stays the escorts pick at every ration where it does NOT TRAIL. If it TRAILS at one ration or more, the button gains a ration-aware
//   escorts pick: the 45-degree gunner one ship a side with escorts at rations AT OR BELOW the largest ration where car-today trailed (render/spaceDuelCore.mjs's
//   sideOf is then told the fight's ration). Either way the by-the-fight hand's note gives every ration's reading.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/carTodayRations/); the reading file (brain/carTodayRations.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: six escorts, the pilot's escorts, fleets, one ship with nothing else, the fly's helm.
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
export const READING = path.join(BRAIN, "carTodayRations.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "carTodayRations");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsSineNoCannon.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const RATIONS = Object.freeze([1, 0.5, 0.25, 0.125, 0.0625]), FIGHTS = Object.freeze(["r1", "r2", "r4", "r8", "r16"]), ARMS = Object.freeze(["today", "alt"]), SINE = "sine~odd";
export const RATION_OF = Object.freeze(Object.fromEntries(FIGHTS.map((f, i) => [f, RATIONS[i]])));
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze(Object.fromEntries(FIGHTS.map((f, i) => [f, pairs(1571001 + 10000 * i, 75)])));
/** The shipped files, each checked by its policy: the split helm's cannon half (the sine twin), car-today, the 45-degree gunner. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeCarTodayRations: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: { ...one(FILES.helm, FS.POLICY_ID3, FS.thirdOver(SINE)), wiring: SINE }, today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const ammo = RATION_OF[fight];
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: arm === "today" ? b.today : b.fly, helmNet: b.helm }, y: { id: "plain", cannon: true }, kind, seed, opts: { ships: 1, escorts: 2, ...(ammo < 1 ? { ammo } : {}) } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { today: TA.stat(a.today), alt: TA.stat(a.alt), gain: TA.stat(a.today.map((v, i) => v - a.alt[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided: car-today stays where it does not trail; if it trails anywhere, the 45-degree gunner at and below the largest trailing ration. Pure. */
export function decide(out) {
    const trailing = FIGHTS.filter((f) => out[f].reading.gain.z <= -2).map((f) => RATION_OF[f]);
    const below = trailing.length ? Math.max(...trailing) : null;
    return { ok: true, changes: below !== null, scarceAtOrBelow: below, trailing, reasons: below === null ? ["car-today trails at no ration: the escorts pick stays"] : [`car-today trails at ${trailing.join(", ")}: the 45-degree gunner at rations of ${below} and less`] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`ONE SHIP A SIDE, 2 ESCORTS, THE CANNON ON, A RATION OF ${RATION_OF[f]}, under the split helm, ${a.today.length} pairs:`); log(`     car-today: ${TA.line(R.today)}`); log(`     the 45-degree fly-wired gunner: ${TA.line(R.alt)}`); log(`  CAR-TODAY LESS THE 45-DEGREE GUNNER: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeCarTodayRations: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeCarTodayRations: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
