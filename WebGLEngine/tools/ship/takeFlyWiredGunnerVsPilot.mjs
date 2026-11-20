// WebGLEngine/tools/ship/takeFlyWiredGunnerVsPilot.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PAGE'S FLY-WIRED GUNNER AGAINST THE TRAINED PILOT. tools/ship/takeFlyWiredPilot.mjs flew the fighters with the trained 6DOF pilot (brain/pilot6dofWeightsDefault-d18.json, frozen) against the ships-sticky fly-wired gunner (seatFlyWired3): it trailed
// the plain ship by 0.31. The page's gunner since 2026-11-19 (seatFlyWired8, tools/ship/takeFlyWiredGunnerHoldSees.mjs) gives a fighter to the hand gunner, so against the pilot it should be about the plain ship. Keith: "then 2, then 3, and 4" -- round 4.
// NOTHING SHIPS HERE: this reads where the page's gunner stands against the pilot, and whether the hand on fighters holds up against a pilot that was trained to beat ships.
//
//   node tools/ship/takeFlyWiredGunnerVsPilot.mjs [--workers n]
//
//   THE FIGHTS: one ship against eight fighters flown by the trained pilot (battleshipFight, as tools/ship/pairPool.mjs's fighter job with `pilotNet`; seeds 381001-, 75 of each attack); fleets of THREE ships a side with SIX ESCORTS A SIDE, BOTH SIDES' escorts
//   flown by the trained pilot (tools/ship/pairPool.mjs's side `pilotNet`), with no cannon and with the cannon on both sides, on the same pairs (seeds 391001-, 75 of each of the duel's kinds). Side X's seats have the gunner, its helm the bow-on rule; side Y
//   (or the fighters' target) is plain. THE ARMS: the ships-sticky gunner (seatFlyWired3, its shipped file) and the page's gunner (seatFlyWired8, its shipped file), on the same pairs.
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; THE PAGE'S LESS THE SHIPS-STICKY, pair by pair.
// FORECAST, for the record: against the pilot's fighters the page's gunner is about level with the plain ship (it is the hand's laying, holding with no target: +0.001 against the PD fighters) and leads the ships-sticky one by about the 0.31 it trailed;
//   in the escort fleets it leads the plain side (as it does with PD escorts, +0.40 and +0.24), by less, the pilot's escorts being harder to shoot.
// READ 2026-11-20 (brain/flyWiredGunnerVsPilot.reading.json): against the trained pilot's fighters the page's gunner (seatFlyWired8) is level with the plain ship (-0.003) and +0.316 over the ships-sticky one; with pilot-flown escorts it LEADS the plain side,
//   +0.363 without the cannon and +0.258 with it (+0.253 and +0.398 over the ships-sticky one). The pilot does not undo it. The page's gunner has since become seatFlyWired9, which against fighters alone is seatFlyWired8 to the bit; its escort fleets
//   with the pilot are not flown here.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerVsPilot/); the reading file (brain/flyWiredGunnerVsPilot.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts flown by the pilot on one side only, the cannon-aware helm, other pilots, rationed magazines.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as BF from "../../brain/battleshipFight.mjs";
import * as PI from "./takeFlyWiredPilot.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "flyWiredGunnerVsPilot.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerVsPilot"), PAGE_FILE = path.join(BRAIN, "seatFlyWired8WeightsDefault.json");
export const REGIMES = Object.freeze(["fighters", "escorts", "escortsCannon"]), ARMS = Object.freeze(["ships", "page"]), FLEET_SHIPS = 3, ESCORTS = 6;
const pairs = (kinds, first, n) => Object.freeze(kinds.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const ESCORT_PAIRS = pairs(D.KINDS, 391001, 75);   // the two escort fleets fly the same pairs
export const SETS = Object.freeze({ fighters: pairs(BF.KINDS, 381001, 75), escorts: ESCORT_PAIRS, escortsCannon: ESCORT_PAIRS });
/** The shipped brains, each checked by its policy: { ships, page, pilot } as { policy, weights }. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const s = PI.shipped(), r = PB.importBrain(PB.describePolicy(FT.POLICY_ID8, FT.holdSees), read(PAGE_FILE));
    if (!r.ok) throw new Error(`takeFlyWiredGunnerVsPilot: ${PAGE_FILE}: ${r.reason}`);
    return { ships: s.gunner, page: { policy: FT.POLICY_ID8, weights: Array.from(r.weights) }, pilot: s.pilot };
}
/** The jobs of one fight and arm. */
export function jobsOf(regime, arm, b, list = SETS[regime]) {
    if (regime === "fighters") return list.map(({ kind, seed }) => ({ vsFighters: { network: b[arm], helm: null, seed, kind, opts: { pilotNet: b.pilot } } }));
    const cannon = regime === "escortsCannon";
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network: b[arm], pilotNet: b.pilot }, y: { id: "plain", cannon, pilotNet: b.pilot }, kind, seed, opts: { ships: FLEET_SHIPS, escorts: ESCORTS } }));
}
/** One fight's readings from its two arms' leads. Pure. */
export function fightReadings(a) {
    const r = { page: TA.stat(a.page), ships: TA.stat(a.ships), gain: TA.stat(a.page.map((v, i) => v - a.ships[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The study. `fly(regime, arm)` -> Promise of leads. Nothing is decided: it reads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fighters: "ONE SHIP AGAINST EIGHT FIGHTERS FLOWN BY THE TRAINED PILOT", escorts: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORTS A SIDE FLOWN BY THE TRAINED PILOT, NO CANNON`, escortsCannon: `FLEETS OF 3 A SIDE WITH ${ESCORTS} ESCORTS A SIDE FLOWN BY THE TRAINED PILOT, THE CANNON ON` };
    for (const g of REGIMES) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(g, arm); out[g] = fightReadings(a); const R = out[g].reading;
        log(`${title[g]}, ${a.page.length} ${g === "fighters" ? "attacks" : "pairs"}, each against the plain side:`); log(`     the ships-sticky gunner: ${TA.line(R.ships)}`); log(`     the page's gunner (seatFlyWired8): ${TA.line(R.page)}`); log(`  THE PAGE'S LESS THE SHIPS-STICKY: ${TA.line(R.gain)}`);
    }
    return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerVsPilot: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerVsPilot: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (regime, arm) => { const f = path.join(kept, `${regime}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(regime, arm, b)); fs.writeFileSync(f, JSON.stringify({ regime, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
