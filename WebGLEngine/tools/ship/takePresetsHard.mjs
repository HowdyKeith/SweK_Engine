// WebGLEngine/tools/ship/takePresetsHard.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE TWO PRESETS IN THE FIGHTS THEIR NOTES SAY THEY WERE NOT TRIED IN. space-duel.html's `best ship` (the cannon-aware fly-wired helm over the car's always-firing gunner) and `best fleet` (the same helm over the page's fly-wired gunner, seatFlyWired11) say
// in their notes what was not tried: magazines rationed under this helm for the fleet one, the trained 6DOF pilot for both, fighters alone. Keith: "then 4" -- round 4. NOTHING SHIPS HERE: it reads, and the notes say what it read.
//
//   node tools/ship/takePresetsHard.mjs [--workers n]
//
//   THE FIGHTS: fleets of THREE a side, the cannon on both sides, A QUARTER OF EVERY MAGAZINE (seeds 621001-); fleets of three with SIX ESCORTS A SIDE, BOTH SIDES' escorts flown by the trained pilot (brain/pilot6dofWeightsDefault-d18.json), the cannon on
//   (seeds 631001-); one ship against EIGHT FIGHTERS flown by the trained pilot, the ship's helm the preset's (battleshipFight, as tools/ship/pairPool.mjs's fighter job; seeds 641001-). 300 pairs or attacks a fight, 75 of each kind. Side X is the preset,
//   side Y (or the fighters' target) the plain ship. THE ARMS, the shipped files: `ship` (the best-ship preset) and `fleet` (the best-fleet preset).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each preset against the plain ship; THE FLEET PRESET LESS THE SHIP PRESET, pair by pair.
// FORECAST, for the record: both LEAD the plain ship rationed (the second loadout study: the car's gunner +1.55 rationed under this helm) and with pilot-flown escorts; against the pilot's fighters both about level with the plain ship or a little ahead
//   (the helm turns the ship; the fly gunner gives fighters to the hand, the car's gunner holds the trigger on them). The fleet preset LEADS the ship preset with escorts, and is about level rationed.
// Every arm's leads are kept (brain/rig-results/presetsHard/); the reading file (brain/presetsHard.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: one ship a side, other rations, escorts flown by the pilot on one side only, the helm's gain search (tools/ship/takeFlyWiredHelmTune.mjs) -- the presets as they are shipped at registration.
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
import * as PI from "./takeFlyWiredPilot.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "presetsHard.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "presetsHard");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), car: path.join(BRAIN, "seatTurretGunnerWeightsBig.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json") });
export const FIGHTS = Object.freeze(["rationed", "pilotEscorts", "pilotFighters"]), ARMS = Object.freeze(["ship", "fleet"]), RATION = 0.25;
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ rationed: pairs(D.KINDS, 621001, 75), pilotEscorts: pairs(D.KINDS, 631001, 75), pilotFighters: pairs(BF.KINDS, 641001, 75) });
/** The shipped files and the pilot, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takePresetsHard: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), car: one(FILES.car, ST.POLICY_ID, ST), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), pilot: PI.shipped().pilot };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const gunner = arm === "ship" ? b.car : b.fly;
    if (fight === "pilotFighters") return list.map(({ kind, seed }) => ({ vsFighters: { network: gunner, helm: b.helm, seed, kind, opts: { pilotNet: b.pilot } } }));
    const pilot = fight === "pilotEscorts" ? { pilotNet: b.pilot } : {}, opts = fight === "rationed" ? { ships: 3, ammo: RATION } : { ships: 3, escorts: 6 };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: true, network: gunner, helmNet: b.helm, ...pilot }, y: { id: "plain", cannon: true, ...pilot }, kind, seed, opts }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { ship: TA.stat(a.ship), fleet: TA.stat(a.fleet), fleetOverShip: TA.stat(a.fleet.map((v, i) => v - a.ship[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The study. `fly(fight, arm)` -> Promise of leads. Nothing is decided: it reads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { rationed: `FLEETS OF 3 A SIDE, THE CANNON ON, A ${RATION} RATION`, pilotEscorts: "FLEETS OF 3 A SIDE WITH 6 ESCORTS A SIDE FLOWN BY THE TRAINED PILOT, THE CANNON ON", pilotFighters: "ONE SHIP AGAINST EIGHT FIGHTERS FLOWN BY THE TRAINED PILOT" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.ship.length} ${f === "pilotFighters" ? "attacks" : "pairs"}, against the plain ship:`); log(`     best ship: ${TA.line(R.ship)}`); log(`     best fleet: ${TA.line(R.fleet)}`); log(`  BEST FLEET LESS BEST SHIP: ${TA.line(R.fleetOverShip)}`);
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takePresetsHard: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takePresetsHard: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
