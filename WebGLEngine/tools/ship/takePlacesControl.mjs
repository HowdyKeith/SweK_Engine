// WebGLEngine/tools/ship/takePlacesControl.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// IS IT THE FLY'S OWN PLACES, OR ONLY HAVING PLACES? tools/ship/takeFlyWiredGunner.mjs read that the fly-wired gunner with each LC10a cell at its place leads the same circuit with no places by 0.101 (K3, z 2.7). That reading mixes two things: with places the command is GRADED (it grows with the target's bearing) where
// without them it is a switch -- and with places it is the FLY'S cells that answer a given bearing, with the connections those cells have. The first needs only that cells have places; the second is the anatomy. THE CONTROL THAT SEPARATES THEM (brain/flyTracking.mjs's `scrambled:<seed>`): the same circuit and
// connections with each eye's cells trading places among themselves. Keith: "build the control that scrambles the cells' places."
//
//   node tools/ship/takePlacesControl.mjs [--workers n]
//
//   THE FIGHT, THE JOBS AND THE CHOOSING are tools/ship/takeFlyWiredGunner.mjs's own: no cannon, the hand gunner on side Y, a wiring's gain the best of its gains on the train pairs, then the held-out pairs, then the audit pairs once.
//   THE ARMS: `fly:medial`, `fly:lateral`, THREE scrambles (`scrambled:4242`, `scrambled:1`, `scrambled:2` -- one scramble is one draw; three are a small measurement) and `flat`, each at three gains: -8, -3, -1 (the gain that lays the gun away lost by 3.3 for every wiring and is not flown again).
//
// REGISTERED 2026-11-16, BEFORE ANY PAIR BELOW WAS FLOWN (the scrambles' tuning curves were looked at: they are graded, flatter and less regular than the fly's, 90% of their peak by 31 to 63 degrees). Pairs: train seeds 61001-61075 of each kind, held-out 62001-62075, audit 63001-63150. Readings on the audit
// pairs, each a mean of paired differences with a word at |z| >= 2; THE SCRAMBLED lead of a pair is the mean of the three scrambles' leads on it:
//   P1 `fly:medial` LESS THE SCRAMBLED;   P2 `fly:lateral` LESS THE SCRAMBLED -- is it the fly's own places?   P3 THE SCRAMBLED LESS `flat` -- is it only having places?   and beside them each wiring against the hand gunner, and each scramble apart.
// FORECAST, for the record: P3 LEADS, by about 0.1 (what K3 saw is the graded command); P1 and P2 CANNOT BE TOLD (the two orientations could not be told apart, and the gradient the positions show is small).
// NOTHING SHIPS: this is a control. The reading file is the mark that the audit was read.
// WHAT IS NOT HERE: more than three scrambles, a scramble of one eye only, a scramble that keeps a cell's neighbours (the LC10a cells also talk to each other, and a scramble breaks that neighbourhood too: P1 and P2 cannot say which of the two it was).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { jobsOf, choose, keptName } from "./takeFlyWiredGunner.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "flyTrackingPlacesControl.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "placesControl");
export const SCRAMBLES = Object.freeze(["scrambled:4242", "scrambled:1", "scrambled:2"]), WIRINGS = Object.freeze(["fly:medial", "fly:lateral", ...SCRAMBLES, "flat"]), GAINS = Object.freeze([-8, -3, -1]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: pairs(61001, 75), heldOut: pairs(62001, 75), audit: pairs(63001, 150) });
export { jobsOf, choose, keptName };

/** The scrambled lead of each pair: the mean of the scrambles' leads on it. `leads`: one array a scramble, over the same pairs. Pure. */
export const scrambledOf = (leads) => leads[0].map((_, i) => leads.reduce((a, l) => a + l[i], 0) / leads.length);
/** The readings from the audit leads ({ wiring: leads }). Pure. */
export function readings(a) {
    const d = (x, y) => TA.stat(x.map((v, i) => v - y[i])), sc = scrambledOf(SCRAMBLES.map((w) => a[w]));
    const r = { P1: d(a["fly:medial"], sc), P2: d(a["fly:lateral"], sc), P3: d(sc, a.flat), scrambled: TA.stat(sc), ...Object.fromEntries(WIRINGS.map((w) => [w, TA.stat(a[w])])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The whole study. `fly(wiring, gain, setName)` -> Promise of leads. Returns { chosen, reading, words }. */
export async function study(fly, log = () => {}) {
    const chosen = {};
    for (const w of WIRINGS) { const byGain = {}; for (const g of GAINS) byGain[g] = await fly(w, g, "train"); chosen[w] = choose(byGain); log(`  ${w}: train leads by gain ${chosen[w].rows.slice().sort((a, b) => a.gain - b.gain).map((r) => `${r.gain}: ${r.stat.mean >= 0 ? "+" : ""}${r.stat.mean.toFixed(3)}`).join(", ")} -> its gain ${chosen[w].gain}`); }
    for (const w of WIRINGS) { chosen[w].heldOut = TA.stat(await fly(w, chosen[w].gain, "heldOut")); log(`  ${w} at ${chosen[w].gain}: train ${TA.line(chosen[w].train)}; held-out ${TA.line(chosen[w].heldOut)}`); }
    const a = {}; for (const w of WIRINGS) a[w] = await fly(w, chosen[w].gain, "audit");
    const { reading, words } = readings(a);
    log(`the ${SETS.audit.length} audit pairs, read once (each against the hand gunner):`);
    for (const w of WIRINGS) log(`     ${w} (gain ${chosen[w].gain}): ${TA.line(reading[w])}`);
    log(`     the scrambled (the mean of the three): ${TA.line(reading.scrambled)}`);
    log(`  P1 fly:medial LESS THE SCRAMBLED: ${TA.line(reading.P1)}`); log(`  P2 fly:lateral LESS THE SCRAMBLED: ${TA.line(reading.P2)}`); log(`  P3 THE SCRAMBLED LESS flat: ${TA.line(reading.P3)}`);
    return { chosen, reading, words };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takePlacesControl: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("out", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takePlacesControl: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (wiring, gain, set) => { const f = path.join(kept, keptName(wiring, gain, set)); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(wiring, gain, SETS[set])); fs.writeFileSync(f, JSON.stringify({ wiring, gain, set, first: SETS[set][0].seed, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify({ chosen: Object.fromEntries(Object.entries(result.chosen).map(([w, c]) => [w, { gain: c.gain, train: c.train, heldOut: c.heldOut, rows: c.rows }])), reading: result.reading, words: result.words }) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
