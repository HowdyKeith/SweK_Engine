// WebGLEngine/tools/ship/takeFlyWiredGunnerControl.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES THE FLY'S WIRING STILL DO ANYTHING IN THE PAGE'S GUNNER? The page's fly-wired gunner (seatFlyWired10, tools/ship/takeFlyWiredGunnerTune.mjs) gives every fighter to the hand gunner and lets the hand lay the last 45 degrees onto a ship; the circuit only
// makes the big swings, where its command is near full slew. Before any flight it was seen on scratch fights (seeds 135001-135004 of each kind, 64 fights of four sorts): the same gunner over a SINE RULE flies the fly's own fight TO THE BIT in 48,
// over the cells' places SCRAMBLED in 34-36, over the FLAT circuit (no places) in 20, over a SHUFFLED wiring in 2 (brain/flyTracking-selfcheck.mjs pins the count on eight of them: 7, 6, 2, 0). Keith: "1 first" -- does the fly's wiring still matter.
//
//   node tools/ship/takeFlyWiredGunnerControl.mjs [--workers n]
//
//   THE FIGHTS: fleets of THREE a side with the cannon on both sides and with none, on the same pairs (seeds 441001-); ONE SHIP A SIDE with the cannon (the page's default fight; seeds 451001-). 300 pairs a fight, 75 of each of the duel's kinds. Side X's seats
//   have the gunner, its helm the bow-on rule; side Y is plain. THE ARMS, all seatFlyWired10 at its shipped weights [-3, -3, 0.1, 0.2, 45 degrees] with its read-out taken from a wiring (brain/flyTracking.mjs's nearTunableOver): `fly` (the gunner itself),
//   `sine` (no circuit), `scrambled:4242` (the fly's circuit with its cells' places scrambled within each eye), `flat` (the circuit with no places), `shuffled:4242` (each pathway's targets shuffled within their type).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain side; THE FLY LESS EACH CONTROL, pair by pair.
// FORECAST, for the record: against sine, the scramble and flat CANNOT BE TOLD in every fight (they fly the same fight most of the time); against the shuffle the fly LEADS (its read-out has the wrong sign at a quarter turn and more).
// WHAT IS DECIDED (nothing ships): the fly's wiring is CREDITED against a control if the fly LEADS it in at least one fight and TRAILS it in none. If it is credited against NONE of sine, the scramble and flat, the page's `flywired` note says so -- in this
//   gunner the circuit's shape is not shown to matter, only that it swings the gun the right way. Either way the reading is pinned and said on the page.
// READ 2026-11-20 (brain/flyWiredGunnerControl.reading.json): THE CIRCUIT'S SHAPE IS NOT SHOWN TO MATTER in this gunner. The fly less sine, the scramble and flat CANNOT BE TOLD in every fight but one (one ship a side it TRAILS flat, -0.025, z -2.3);
//   it is credited against the shuffle only (+1.30, +2.11, +0.55), whose read-out swings the gun the wrong way. What the page's gunner needs from the circuit is that it swings the gun toward the target; the fly's own wiring, places and connections do no
//   more here than a sine. (The earlier fly-wired gunners, whose circuits laid the gun themselves, had their own controls: tools/ship/takeFlyWiredGunner.mjs, takePlacesControl.mjs.) The page's flywired note says so.
// Every arm's leads are kept (brain/rig-results/flyWiredGunnerControl/); the reading file (brain/flyWiredGunnerControl.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts and fighters (the hand's, in every arm alike), other scramble and shuffle seeds (one draw each), the earlier fly-wired gunners (their own controls were flown: tools/ship/takeFlyWiredGunner.mjs, takePlacesControl.mjs).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "flyWiredGunnerControl.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunnerControl");
export const FIGHTS = Object.freeze(["fleetCannon", "fleetNoCannon", "oneCannon"]), ARMS = Object.freeze(["fly", "sine", "scrambled:4242", "flat", "shuffled:4242"]), CONTROLS = Object.freeze(ARMS.slice(1)), SHAPE_CONTROLS = Object.freeze(["sine", "scrambled:4242", "flat"]);
export const WEIGHTS = Object.freeze([-3, -3, 0.1, 0.2, Math.PI / 4]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
const FLEET = pairs(441001, 75);   // both fleet fights fly the same pairs
export const SETS = Object.freeze({ fleetCannon: FLEET, fleetNoCannon: FLEET, oneCannon: pairs(451001, 75) });
export const SETUP = Object.freeze({ fleetCannon: Object.freeze({ ships: 3, cannon: true }), fleetNoCannon: Object.freeze({ ships: 3, cannon: false }), oneCannon: Object.freeze({ ships: 1, cannon: true }) });
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, list = SETS[fight]) {
    const { ships, cannon } = SETUP[fight], network = { policy: FT.POLICY_ID10, weights: WEIGHTS.slice(), ...(arm === "fly" ? {} : { wiring: arm }) };
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon, network }, y: { id: "plain", cannon }, kind, seed, opts: { ships } }));
}
/** One fight's readings from its arms' leads. Pure. */
export function fightReadings(a) {
    const r = Object.fromEntries(ARMS.map((arm) => [arm, TA.stat(a[arm])]));
    for (const c of CONTROLS) r[`flyOver:${c}`] = TA.stat(a.fly.map((v, i) => v - a[c][i]));
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided: the controls the fly's wiring is CREDITED against (leads in one fight, trails in none), and whether that includes any shape control. Pure. */
export function decide(out) {
    const credited = CONTROLS.filter((c) => FIGHTS.some((f) => out[f].reading[`flyOver:${c}`].z >= 2) && FIGHTS.every((f) => out[f].reading[`flyOver:${c}`].z > -2));
    return { credited, shapeMatters: SHAPE_CONTROLS.some((c) => credited.includes(c)) };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {}, title = { fleetCannon: "FLEETS OF 3 A SIDE, THE CANNON ON", fleetNoCannon: "FLEETS OF 3 A SIDE, NO CANNON", oneCannon: "ONE SHIP A SIDE, THE CANNON ON" };
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${title[f]}, ${a.fly.length} pairs, the page's gunner over each wiring, against the plain side:`); for (const arm of ARMS) log(`     ${arm}: ${TA.line(R[arm])}`); for (const c of CONTROLS) log(`  THE FLY LESS ${c.toUpperCase()}: ${TA.line(R["flyOver:" + c])}`);
    }
    const verdict = decide(out); log(verdict.shapeMatters ? `THE FLY'S WIRING IS CREDITED against ${verdict.credited.join(", ")}.` : `THE CIRCUIT'S SHAPE IS NOT SHOWN TO MATTER in this gunner: credited against ${verdict.credited.length ? verdict.credited.join(", ") + " only" : "no control"}.`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunnerControl: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunnerControl: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm.replace(":", "-")}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
