// WebGLEngine/tools/ship/takeFlyVsSine.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY'S HELM AGAINST ITS SINE TWIN, ON MANY PAIRS. Every reading of the cannon-aware helm against a sine where the fly's steering circuit was has been small: with the cannon -0.063 one ship a side (z -2.2) and +0.007 in fleets
// (tools/ship/takeFlyWiredHelmControl.mjs, the old gunners), without it +0.021 and +0.010 (tools/ship/takeSineHelmNoCannon.mjs). Each on 300 pairs, so each could hide 0.1 either way. Keith: "5" (settle it).
//
//   node tools/ship/takeFlyVsSine.mjs [--workers n]
//
//   THE FIGHTS, four, 1200 PAIRS EACH (300 of each kind): ONE SHIP A SIDE WITH THE CANNON (seeds 1351001-1351300), FLEETS OF THREE WITH IT (1361001-), ONE SHIP A SIDE WITHOUT IT (1371001-), FLEETS OF THREE WITHOUT IT (1381001-); the cannon on both sides
//   or on neither. None flown by anything before. Side X carries the by-the-fight button's pick for that fight (one ship a side with the cannon the no-window fly-wired gunner, without it car-today; in fleets the 45-degree one); side Y is plain.
//   THE ARMS: `fly` (the page's cannon-aware helm, brain/helmFlyWired3WeightsNoCannon.json, over the fly's circuit) and `sine` (the page's sine twin, brain/helmFlyWired3WeightsSineNoCannon.json, over sine~odd): the same weights, -2, -2 with a cannon and
//   -0.25 without, the read-out the only difference.
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; THE FLY LESS THE SINE, pair by pair.
// FORECAST, for the record: none can be told; the largest is one ship a side with the cannon, the sine ahead by about 0.04.
// WHAT IS DECIDED (nothing ships; the fly-wired helm's note says it): if THE FLY LESS THE SINE can be told in no fight, the note says the fly's wiring adds nothing a sine does not, to within the largest two standard errors read; where it can be told,
//   the note says where and by how much, either way.
// READ 2026-11-21 (brain/flyVsSine.reading.json; the kept arms in brain/rig-results/flyVsSine/): TOLD ONCE, THE SINE AHEAD. The fly less the sine: one ship a side with the cannon -0.056 (z -3.90, TRAILS -- the forecast had the sine ahead by
//   about 0.04 but not told); fleets of three with it -0.016 (z -1.81), one ship a side without it +0.016 (z 1.07), fleets without it +0.013 (z 1.30), none of the three can be told. The fly-wired helm's note says so (and the sine's).
// Every arm's leads are kept (brain/rig-results/flyVsSine/); the reading file (brain/flyVsSine.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, fighters, the shuffled circuit (takeFlyWiredHelmControl: the fly leads it by 2.0), the gunners' own read-outs (tools/ship/takeSineTwins.mjs).
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
export const READING = path.join(BRAIN, "flyVsSine.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyVsSine");
export const FILES = Object.freeze({ fly: path.join(BRAIN, "helmFlyWired3WeightsNoCannon.json"), sine: path.join(BRAIN, "helmFlyWired3WeightsSineNoCannon.json"), today: path.join(BRAIN, "seatTurretGunnerWeightsToday.json"), gun: path.join(BRAIN, "seatFlyWired11WeightsDefault.json"), gunOne: path.join(BRAIN, "seatFlyWired11WeightsOne.json") });
export const FIGHTS = Object.freeze(["oneCannon", "fleetCannon", "oneNone", "fleetNone"]), ARMS = Object.freeze(["fly", "sine"]), SINE = "sine~odd";
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneCannon: pairs(1351001, 300), fleetCannon: pairs(1361001, 300), oneNone: pairs(1371001, 300), fleetNone: pairs(1381001, 300) });
export const SETUP = Object.freeze({ oneCannon: Object.freeze({ ships: 1, cannon: true }), fleetCannon: Object.freeze({ ships: 3, cannon: true }), oneNone: Object.freeze({ ships: 1, cannon: false }), fleetNone: Object.freeze({ ships: 3, cannon: false }) });
/** The by-the-fight button's gunner in each fight. */
export const gunnerOf = (fight) => (SETUP[fight].ships > 1 ? "gun" : SETUP[fight].cannon ? "gunOne" : "today");
/** The shipped files, each checked by its policy. */
export function brainsOf(read = (f) => JSON.parse(fs.readFileSync(f, "utf8"))) {
    const one = (f, id, mod) => { const r = PB.importBrain(PB.describePolicy(id, mod), read(f)); if (!r.ok) throw new Error(`takeFlyVsSine: ${f}: ${r.reason}`); return { policy: id, weights: Array.from(r.weights) }; };
    return { fly: one(FILES.fly, FS.POLICY_ID3, FS.third), sine: one(FILES.sine, FS.POLICY_ID3, FS.thirdOver(SINE)), today: one(FILES.today, ST.POLICY_ID, ST), gun: one(FILES.gun, FT.POLICY_ID11, FT.nearAlways), gunOne: one(FILES.gunOne, FT.POLICY_ID11, FT.nearAlways) };
}
/** The helm each arm carries. */
export const helmOf = (arm, b) => (arm === "fly" ? b.fly : { ...b.sine, wiring: SINE });
/** The jobs of one fight and arm. */
export function jobsOf(fight, arm, b, list = SETS[fight]) {
    const S = SETUP[fight];
    return list.map(({ kind, seed }) => ({ x: { id: "x", cannon: S.cannon, network: b[gunnerOf(fight)], helmNet: helmOf(arm, b) }, y: { id: "plain", cannon: S.cannon }, kind, seed, opts: { ships: S.ships } }));
}
/** One fight's readings. Pure. */
export function fightReadings(a) {
    const r = { fly: TA.stat(a.fly), sine: TA.stat(a.sine), gain: TA.stat(a.fly.map((v, i) => v - a.sine[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What the note says: where the fly less the sine can be told (either way), and the bound if nowhere -- the largest |mean| + 2 se read. Pure. */
export function decide(out) {
    const told = FIGHTS.filter((f) => Math.abs(out[f].reading.gain.z) >= 2), bound = Math.max(...FIGHTS.map((f) => Math.abs(out[f].reading.gain.mean) + 2 * out[f].reading.gain.se));
    return { ok: told.length === 0, told: told.map((f) => ({ fight: f, mean: out[f].reading.gain.mean, word: TA.word(out[f].reading.gain.z) })), bound, reasons: told.length ? told.map((f) => `${f} ${TA.word(out[f].reading.gain.z)}`) : [`told nowhere, within ${bound.toFixed(3)}`] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading, S = SETUP[f];
        log(`${S.ships > 1 ? "FLEETS OF 3 A SIDE" : "ONE SHIP A SIDE"}, ${S.cannon ? "THE CANNON ON" : "NO CANNON"}, ${a.fly.length} pairs, against the plain ship:`); log(`     the fly's helm: ${TA.line(R.fly)}`); log(`     the sine twin: ${TA.line(R.sine)}`); log(`  THE FLY LESS THE SINE: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(verdict.ok ? `THE FLY'S WIRING ADDS NOTHING A SINE DOES NOT, to within ${verdict.bound.toFixed(3)}.` : `TOLD: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyVsSine: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyVsSine: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
