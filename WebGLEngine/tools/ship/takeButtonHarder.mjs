// WebGLEngine/tools/ship/takeButtonHarder.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BY-THE-FIGHT BUTTON'S PICKS IN THE FIGHTS NOT YET FLOWN. tools/ship/takeButtonHardToday.mjs held car-today one ship a side with escorts against four pilot-flown escorts a side with the cannon and on a quarter ration; it did not fly the pilot's
// escorts without the cannon, the pilot on one side only, other rations, or fleets in any hard fight (the fleet pick, the 45-degree fly-wired gunner, was last flown hard before car-today existed: tools/ship/takeButtonOneHard.mjs,
// takePresetsHard.mjs). Keith: "1" (the pilot's escorts without the cannon), "2" (the pilot on one side only), "4" (the fleet pick in the hard fights), "6" (other rations).
//
//   node tools/ship/takeButtonHarder.mjs [--workers n]
//
//   THE FIGHTS, 300 pairs each, 75 of each kind, under the page's cannon-aware helm (brain/helmFlyWired3WeightsNoCannon.json) on side X, side Y plain; "the pilot" is brain/pilot6dofWeightsDefault-d18.json flying a side's escorts:
//     pilotNone          one ship a side, NO CANNON, four escorts a side, the pilot on BOTH sides -- seeds 1421001-
//     pilotTheirs        one ship a side, the cannon, four escorts a side, the pilot on SIDE Y ONLY (side X's escorts the PD autopilot) -- 1431001-
//     pilotOurs          one ship a side, the cannon, four escorts a side, the pilot on SIDE X ONLY -- 1441001-
//     escortsHalf        one ship a side, the cannon, two escorts a side, HALF of every magazine -- 1451001-
//     escortsEighth       one ship a side, the cannon, two escorts a side, AN EIGHTH of every magazine (the page's rations are 1, 1/2, 1/4, 1/8, 1/16) -- 1461001-
//     fleetRationed      FLEETS OF THREE, the cannon, a quarter of every magazine -- 1471001-
//     fleetRationedNone  fleets of three, NO CANNON, a quarter of every magazine -- 1481001-
//     fleetPilot         fleets of three, the cannon, four escorts a side, the pilot on both sides -- 1491001-
//   None flown by anything before. THE ARMS: `today` (car-today) and `alt` (the 45-degree fly-wired gunner). One ship a side with escorts the button's pick is car-today; in fleets it is the 45-degree gunner.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; CAR-TODAY LESS THE 45-DEGREE GUNNER, pair by pair.
// FORECAST, for the record: with escorts car-today leads in all five (the pilot's escorts cancel, as before, so pilotNone cannot be told); the eighth leads most; in fleets car-today trails in all three.
// WHAT IS DECIDED, as takeButtonHardToday: THE ESCORTS PICK (car-today) HOLDS if car-today TRAILS in none of the five escorts fights; THE FLEET PICK (the 45-degree gunner) HOLDS if car-today LEADS in none of the three fleet fights. Where a pick
//   does not hold, the by-the-fight hand's note says where; nothing is written but the reading and the page's picks are not changed by this study.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/buttonHarder/); the reading file (brain/buttonHarder.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship a side with nothing else (its picks: tools/ship/takeCarTodayNoCannon.mjs, takeButtonHardToday.mjs), fighters, other helms, the bow-on rule, fleets of two or four.
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
export const READING = path.join(BRAIN, "buttonHarder.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "buttonHarder");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["pilotNone", "pilotTheirs", "pilotOurs", "escortsHalf", "escortsEighth", "fleetRationed", "fleetRationedNone", "fleetPilot"]), ARMS = Object.freeze(["today", "alt"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze(Object.fromEntries(FIGHTS.map((f, i) => [f, pairs(1421001 + 10000 * i, 75)])));
const S = (o) => Object.freeze(o);
export const SETUP = Object.freeze({
    pilotNone: S({ ships: 1, cannon: false, escorts: 4, pilotX: true, pilotY: true }), pilotTheirs: S({ ships: 1, cannon: true, escorts: 4, pilotX: false, pilotY: true }), pilotOurs: S({ ships: 1, cannon: true, escorts: 4, pilotX: true, pilotY: false }),
    escortsHalf: S({ ships: 1, cannon: true, escorts: 2, ammo: 0.5 }), escortsEighth: S({ ships: 1, cannon: true, escorts: 2, ammo: 0.125 }),
    fleetRationed: S({ ships: 3, cannon: true, escorts: 0, ammo: 0.25 }), fleetRationedNone: S({ ships: 3, cannon: false, escorts: 0, ammo: 0.25 }), fleetPilot: S({ ships: 3, cannon: true, escorts: 4, pilotX: true, pilotY: true }),
});
/** The button's pick each fight tests: one ship a side with escorts car-today, in fleets the 45-degree gunner. */
export const PICK = Object.freeze(Object.fromEntries(FIGHTS.map((f) => [f, SETUP[f].ships > 1 ? "fleet" : "escorts"])));
/** The shipped files the arms carry, each checked by its own policy; the trained pilot. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeButtonHarder: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), today: one(FILES.today, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), pilot: PI.shipped().pilot };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const s = SETUP[fight], px = s.pilotX ? { pilotNet: b.pilot } : {}, py = s.pilotY ? { pilotNet: b.pilot } : {};
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: s.cannon, network: arm === "today" ? b.today : b.fly, helmNet: b.helm, ...px }, y: { id: "plain", cannon: s.cannon, ...py }, kind, seed, opts: { ships: s.ships, ...(s.escorts ? { escorts: s.escorts } : {}), ...(s.ammo ? { ammo: s.ammo } : {}) } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { today: TA.stat(a.today), alt: TA.stat(a.alt), gain: TA.stat(a.today.map((v, i) => v - a.alt[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** Does each pick hold? The escorts pick if car-today TRAILS in none of its fights, the fleet pick if car-today LEADS in none of its. Pure. */
export function decide(out) {
    const against = (f) => (PICK[f] === "escorts" ? out[f].reading.gain.z <= -2 : out[f].reading.gain.z >= 2), holds = {};
    for (const p of new Set(Object.values(PICK))) holds[p] = !FIGHTS.some((f) => PICK[f] === p && against(f));
    const reasons = FIGHTS.filter(against).map((f) => `in ${f} car-today ${PICK[f] === "escorts" ? "TRAILS" : "LEADS"} the 45-degree gunner`);
    return { ok: reasons.length === 0, holds, reasons };
}
const title = (f) => { const s = SETUP[f]; return `${s.ships > 1 ? "FLEETS OF THREE" : "ONE SHIP A SIDE"}${s.escorts ? ` WITH ${s.escorts} ESCORTS A SIDE` : ""}, ${s.cannon ? "THE CANNON ON" : "NO CANNON"}${s.ammo ? `, A ${s.ammo} RATION` : ""}${s.pilotX && s.pilotY ? ", THE PILOT ON BOTH SIDES" : s.pilotY ? ", THE PILOT ON SIDE Y ONLY" : s.pilotX ? ", THE PILOT ON SIDE X ONLY" : ""}`; };
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title(f)}, ${a.today.length} pairs, under the cannon-aware helm, against the plain ship:`); log(`     car-today: ${TA.line(R.today)}`); log(`     the 45-degree fly-wired gunner: ${TA.line(R.alt)}`); log(`  CAR-TODAY LESS THE 45-DEGREE GUNNER: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(verdict.ok ? "THE PICKS HOLD." : "WHERE A PICK DOES NOT HOLD: " + verdict.reasons.join("; "));
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeButtonHarder: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeButtonHarder: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
