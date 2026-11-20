// WebGLEngine/tools/ship/takeSineTwins.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE BEST-SHIP LOADOUT AGAINST ITS SINE TWIN. Both wiring controls read a sine doing as well as the fly circuit -- in the gunner (tools/ship/takeFlyWiredGunnerControl.mjs) and in the helm (tools/ship/takeFlyWiredHelmControl.mjs), each alone. This flies the
// whole best-ship loadout against the same loadout with A SINE IN BOTH PLACES: the cannon-aware helm over sine~odd, the held-trigger gunner over sine, every other choice the same. Keith: "then 2" (a sine twin of the page's helm and gunner).
//
//   node tools/ship/takeSineTwins.mjs [--workers n]
//
//   THE FIGHTS, the cannon on both sides: ONE SHIP A SIDE (seeds 821001-; the gunner with no hand window, as the button seats there) and fleets of THREE a side (831001-; its 45-degree window). 300 pairs a fight, 75 of each of the duel's kinds. Side X is the
//   best-ship loadout (the shipped files), side Y its sine twin (the same files read over the sine: tools/ship/pairPool.mjs's `wiring`).
//
// REGISTERED 2026-11-20, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, a mean with a word at |z| >= 2: THE BEST-SHIP LOADOUT LESS ITS SINE TWIN, pair by pair (side X the loadout, side Y the twin).
// FORECAST, for the record: CANNOT BE TOLD in both (each control alone was within 0.06).
// WHAT IS DECIDED (nothing ships): the fly's wiring is CREDITED if the loadout LEADS its twin somewhere and trails it nowhere; the twin goes on the page as a CONTROL PRESET (`sine twin`) if it TRAILS the loadout in no fight.
// READ 2026-11-20 (brain/sineTwins.reading.json): the loadout less its sine twin -0.072 one ship a side (cannot be told), -0.082 in fleets (z -2.2): the fly's wiring is NOT credited; the twin is the page's `sine twin` preset, a control.
// Every fight's leads are kept (brain/rig-results/sineTwins/); the reading file (brain/sineTwins.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, no cannon, the twin of the best-fleet preset alone (in a fleet it is this loadout), other comparators.
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
export const READING = path.join(BRAIN, "sineTwins.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "sineTwins");
export const FILES = Object.freeze({ helm: path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), fly: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), flyOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["one", "fleet3"]), SHIPS = Object.freeze({ one: 1, fleet3: 3 });
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ one: pairs(821001, 75), fleet3: pairs(831001, 75) });
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeSineTwins: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { helm: one(FILES.helm, FS.POLICY_ID3, FS.third), fly: one(FILES.fly, FT.POLICY_ID11, FT.nearAlways), flyOne: one(FILES.flyOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The jobs of one fight and arm. */
export function jobsOf(fight, b, list = SETS[fight]) {
    const ships = SHIPS[fight], gun = ships > 1 ? b.fly : b.flyOne, side = (id, sine) => ({ id, cannon: true, network: { ...gun, ...(sine ? { wiring: "sine" } : {}) }, helmNet: { ...b.helm, ...(sine ? { wiring: "sine~odd" } : {}) } });
    return list.map(({ kind, seed }) => ({ x: side("fly", false), y: side("sine", true), kind, seed, opts: { ships } }));   // the best-ship loadout on side X, its sine twin on side Y
}
/** One fight's reading from its leads (the best-ship loadout less its sine twin). Pure. */
export function fightReadings(a) { const r = { flyOverSine: TA.stat(a) }; return { reading: r, words: { flyOverSine: TA.word(r.flyOverSine.z) } }; }
/** What is decided: the twin goes on the page as a control if it TRAILS the fly-wired loadout in no fight; the fly's wiring is credited if the loadout LEADS its twin somewhere and trails it nowhere. Pure. */
export function decide(out) {
    const z = FIGHTS.map((f) => out[f].reading.flyOverSine.z);
    return { twinOnPage: z.every((v) => v < 2), flyCredited: z.some((v) => v >= 2) && z.every((v) => v > -2) };
}
/** The study. `fly(fight)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) { const a = await fly(f); out[f] = fightReadings(a); log(`${f === "one" ? "ONE SHIP A SIDE" : "FLEETS OF 3 A SIDE"}, THE CANNON ON, ${a.length} pairs: THE BEST-SHIP LOADOUT LESS ITS SINE TWIN: ${TA.line(out[f].reading.flyOverSine)}`); }
    const verdict = decide(out); log(`${verdict.flyCredited ? "THE FLY'S WIRING IS CREDITED over its sine twin." : "THE FLY'S WIRING IS NOT CREDITED over its sine twin."} ${verdict.twinOnPage ? "The twin goes on the page as a control." : "The twin trails and does not go on the page."}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSineTwins: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSineTwins: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight) => { const f = path.join(kept, `${fight}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, b)); fs.writeFileSync(f, JSON.stringify({ fight, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
