// WebGLEngine/tools/ship/takeButtonNoCannon.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BY-THE-FIGHT BUTTON'S PICKS WITHOUT A CANNON. Every study of the button's picks flew with the cannon on (the best-ship preset carries it); the page lets a user turn it off, and since tools/ship/takeFlyWiredHelmNoCannon.mjs the cannon-aware helm turns
// at -0.25 without one, not 0.25. The car's gunners were last weighed against the fly-wired gunners without a cannon under the old gain, or never. Keith: "then 4".
//
//   node tools/ship/takeButtonNoCannon.mjs [--workers n]
//
//   THE FIGHTS: NO CANNON on either side, side X under the page's cannon-aware fly-wired helm (brain/helmFlyWired3WeightsNoCannon.json), the plain ship opposite: ONE SHIP A SIDE (seeds 1251001-) and FLEETS OF THREE (1261001-), 300 pairs each, 75 of
//   each kind. None flown by anything before.
//   THE ARMS: `button` (its pick: one ship a side the no-window fly-wired gunner, in a fleet the 45-degree one), `big` (car-big, the car's always-firing gunner) and `today` (car-today).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; CAR-BIG LESS THE PICK and CAR-TODAY LESS THE PICK, pair by pair.
// FORECAST, for the record: without a cannon the gunners decide more of the fight; car-today and car-big level with the pick one ship a side, behind it in fleets (as with the cannon): the pick holds.
// WHAT IS DECIDED, each fight apart: the pick holds there unless a car gunner LEADS it; if one does, the button takes, IN A FIGHT WITHOUT A CANNON of that size, the car gunner with the larger lead. Nothing is written but the reading; the page is
//   changed by hand to what is decided.
// READ 2026-11-21 (brain/buttonNoCannon.reading.json; the kept arms in brain/rig-results/buttonNoCannon/): ONE SHIP A SIDE IT TAKES CAR-TODAY; IN FLEETS THE PICK HOLDS. One ship a side without a cannon: car-today less the no-window fly-wired gunner
//   +0.080 (z 2.36, LEADS), car-big less it -0.052 (z -1.72, cannot be told). In fleets of three: car-big -0.444 (z -8.40), car-today -0.321 (z -6.84), both TRAIL. The forecast was wrong one ship a side (car-today leads, not level) and held in fleets.
//   The by-the-fight button now takes car-today one ship a side with nothing else and no cannon (spaceDuelCore's bySize `oneNoCannon`).
// Every arm's leads are kept (brain/rig-results/buttonNoCannon/); the reading file (brain/buttonNoCannon.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, fighters, the bow-on rule, other helms, the rationed fight.
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
export const READING = path.join(BRAIN, "buttonNoCannon.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "buttonNoCannon");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), big: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["one", "fleet"]), ARMS = Object.freeze(["button", "big", "today"]), CARS = Object.freeze(["big", "today"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(1251001, 75), fleet: pairs(1261001, 75) });
export const SHIPS = Object.freeze({ one: 1, fleet: 3 });
/** The gunner each arm carries. */
export const gunnerOf = (arm, fight) => (arm === "button" ? (fight === "one" ? "flyOne" : "fly") : arm);
/** The shipped files the arms carry, each checked by its own policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeButtonNoCannon: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), big: one(FILES.big, ST.POLICY_ID, ST), today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: false, network: b[gunnerOf(arm, fight)], helmNet: b.helm }, y: { id: "plain", cannon: false }, kind, seed, opts: { ships: SHIPS[fight] } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { button: TA.stat(a.button), big: TA.stat(a.big), today: TA.stat(a.today), bigGain: TA.stat(a.big.map((v, i) => v - a.button[i])), todayGain: TA.stat(a.today.map((v, i) => v - a.button[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What each fight's pick becomes without a cannon: the pick, or the car gunner that LEADS it with the larger lead. Pure. */
export function decide(out) {
    const takes = {};
    for (const f of FIGHTS) { const lead = CARS.filter((c) => out[f].reading[c + "Gain"].z >= 2).sort((x, y) => out[f].reading[y + "Gain"].mean - out[f].reading[x + "Gain"].mean); takes[f] = lead.length ? lead[0] : "button"; }
    return { ok: FIGHTS.some((f) => takes[f] !== "button"), takes, reasons: FIGHTS.map((f) => `${f}: ${takes[f] === "button" ? "the pick holds" : "takes car-" + takes[f]}`) };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${f === "one" ? "ONE SHIP A SIDE" : "FLEETS OF 3 A SIDE"}, NO CANNON, the cannon-aware helm, ${a.button.length} pairs, against the plain ship:`);
        log(`     the button's pick (${f === "one" ? "the no-window fly-wired gunner" : "the 45-degree fly-wired gunner"}): ${TA.line(R.button)}`); log(`     car-big: ${TA.line(R.big)}`); log(`     car-today: ${TA.line(R.today)}`);
        log(`  CAR-BIG LESS THE PICK: ${TA.line(R.bigGain)}`); log(`  CAR-TODAY LESS THE PICK: ${TA.line(R.todayGain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeButtonNoCannon: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeButtonNoCannon: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
