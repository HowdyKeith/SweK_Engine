// WebGLEngine/tools/ship/takePlacesControl.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// IS IT THE FLY'S OWN PLACES, OR ONLY HAVING PLACES? tools/ship/takeFlyWiredGunner.mjs read that the fly-wired gunner with each LC10a cell at its place leads the same circuit with no places by 0.101 (K3, z 2.7). That reading mixes two things: with places the command is GRADED (it grows with the target's bearing) where
// without them it is a switch -- and with places it is the FLY'S cells that answer a given bearing, with the connections those cells have. The first needs only that cells have places; the second is the anatomy. THE CONTROL THAT SEPARATES THEM (brain/flyTracking.mjs's `scrambled:<seed>`): the same circuit and
// connections with each eye's cells trading places among themselves. Keith: "build the control that scrambles the cells' places."
//
//   node tools/ship/takePlacesControl.mjs [--study rig] [--workers n]      (study `rig`: four times the pairs and one more control, registered at STUDIES below; brain/RIG_COMMANDS_2026-11-16_PLACES.md)
//
//   THE FIGHT, THE JOBS AND THE CHOOSING are tools/ship/takeFlyWiredGunner.mjs's own: no cannon, the hand gunner on side Y, a wiring's gain the best of its gains on the train pairs, then the held-out pairs, then the audit pairs once.
//   THE ARMS: `fly:medial`, `fly:lateral`, THREE scrambles (`scrambled:4242`, `scrambled:1`, `scrambled:2` -- one scramble is one draw; three are a small measurement) and `flat`, each at three gains: -8, -3, -1 (the gain that lays the gun away lost by 3.3 for every wiring and is not flown again).
//
// REGISTERED 2026-11-16, BEFORE ANY PAIR BELOW WAS FLOWN (the scrambles' tuning curves were looked at: they are graded, flatter and less regular than the fly's, 90% of their peak by 31 to 63 degrees). Pairs: train seeds 61001-61075 of each kind, held-out 62001-62075, audit 63001-63150. Readings on the audit
// pairs, each a mean of paired differences with a word at |z| >= 2; THE SCRAMBLED lead of a pair is the mean of the three scrambles' leads on it:
//   P1 `fly:medial` LESS THE SCRAMBLED;   P2 `fly:lateral` LESS THE SCRAMBLED -- is it the fly's own places?   P3 THE SCRAMBLED LESS `flat` -- is it only having places?   and beside them each wiring against the hand gunner, and each scramble apart.
// FORECAST, for the record: P3 LEADS, by about 0.1 (what K3 saw is the graded command); P1 and P2 CANNOT BE TOLD (the two orientations could not be told apart, and the gradient the positions show is small).
// READ 2026-11-16 (brain/flyTrackingPlacesControl.reading.json): P1 +0.051 (z 1.7), P2 +0.043 (z 1.4), P3 +0.027 (z 0.9): ALL THREE CANNOT BE TOLD. The forecast was right for P1 and P2 and WRONG for P3. Not registered, from the same flights: medial less flat +0.078 (z 2.1), so the earlier +0.101 shows again at
// about its size -- and 600 pairs cannot divide it between the fly's own places and having places at all. To tell a difference of 0.05 at this spread (a standard error of 0.03 on 600 pairs) would take some 2,500 pairs.
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
/**
 * THE STUDIES (--study). 1 is this file's first registration (the header), read on 600 audit pairs: all three CANNOT BE TOLD, each under two standard errors. `rig` IS THE SAME QUESTION AT FOUR TIMES THE PAIRS, WITH ONE MORE CONTROL, REGISTERED 2026-11-16 BEFORE ANY OF ITS PAIRS WAS FLOWN: 2,500 audit pairs (seeds
 * 73001-73625 of each kind; train 71001-71075, held-out 72001-72075), so that a difference of 0.05 is about three standard errors; the gains -3 and -1 (-8 was no wiring's best); and THREE `unneighboured` circuits beside the three scrambles -- every cell at its place, only the LC10a cells' connections to each other
 * shuffled -- because a scramble breaks that neighbourhood too. Its readings: P1, P2, P3 as before, and N1 `fly:medial` LESS THE UNNEIGHBOURED (is it the cells' own neighbourhood?), N2 THE UNNEIGHBOURED LESS THE SCRAMBLED (is it the places onto the two pathways, the neighbourhood apart?). FORECAST: P1 and P2 LEAD by
 * about 0.05 (what 600 pairs hinted, now readable); P3 CANNOT BE TOLD or leads by under 0.05; N1 CANNOT BE TOLD; N2 LEADS by a little.
 */
export const STUDIES = Object.freeze({
    1: Object.freeze({ id: "1", wirings: WIRINGS, scrambles: SCRAMBLES, unneighboured: Object.freeze([]), gains: GAINS, sets: SETS, reading: READING, kept: KEPT_DIR }),
    rig: Object.freeze({ id: "rig", scrambles: SCRAMBLES, unneighboured: Object.freeze(["unneighboured:4242", "unneighboured:1", "unneighboured:2"]), wirings: Object.freeze(["fly:medial", "fly:lateral", ...SCRAMBLES, "unneighboured:4242", "unneighboured:1", "unneighboured:2", "flat"]), gains: Object.freeze([-3, -1]),
        sets: Object.freeze({ train: pairs(71001, 75), heldOut: pairs(72001, 75), audit: pairs(73001, 625) }), reading: path.join(BRAIN, "flyTrackingPlacesControlRig.reading.json"), kept: path.join(BRAIN, "rig-results", "placesControlRig") }),
});
export { jobsOf, choose, keptName };

/** The scrambled lead of each pair: the mean of the scrambles' leads on it. `leads`: one array a scramble, over the same pairs. Pure. */
export const scrambledOf = (leads) => leads[0].map((_, i) => leads.reduce((a, l) => a + l[i], 0) / leads.length);
/** The readings from the audit leads ({ wiring: leads }). Pure. */
export function readings(a, S = STUDIES[1]) {
    const d = (x, y) => TA.stat(x.map((v, i) => v - y[i])), sc = scrambledOf(S.scrambles.map((w) => a[w])), un = S.unneighboured.length ? scrambledOf(S.unneighboured.map((w) => a[w])) : null;
    const r = { P1: d(a["fly:medial"], sc), P2: d(a["fly:lateral"], sc), P3: d(sc, a.flat), ...(un ? { N1: d(a["fly:medial"], un), N2: d(un, sc), unneighboured: TA.stat(un) } : {}), scrambled: TA.stat(sc), ...Object.fromEntries(S.wirings.map((w) => [w, TA.stat(a[w])])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** The whole study. `fly(wiring, gain, setName)` -> Promise of leads. Returns { chosen, reading, words }. */
export async function study(fly, log = () => {}, S = STUDIES[1]) {
    const chosen = {}, WIRINGS = S.wirings, SETS = S.sets;
    for (const w of WIRINGS) { const byGain = {}; for (const g of S.gains) byGain[g] = await fly(w, g, "train"); chosen[w] = choose(byGain); log(`  ${w}: train leads by gain ${chosen[w].rows.slice().sort((a, b) => a.gain - b.gain).map((r) => `${r.gain}: ${r.stat.mean >= 0 ? "+" : ""}${r.stat.mean.toFixed(3)}`).join(", ")} -> its gain ${chosen[w].gain}`); }
    for (const w of WIRINGS) { chosen[w].heldOut = TA.stat(await fly(w, chosen[w].gain, "heldOut")); log(`  ${w} at ${chosen[w].gain}: train ${TA.line(chosen[w].train)}; held-out ${TA.line(chosen[w].heldOut)}`); }
    const a = {}; for (const w of WIRINGS) a[w] = await fly(w, chosen[w].gain, "audit");
    const { reading, words } = readings(a, S);
    log(`the ${SETS.audit.length} audit pairs, read once (each against the hand gunner):`);
    for (const w of WIRINGS) log(`     ${w} (gain ${chosen[w].gain}): ${TA.line(reading[w])}`);
    log(`     the scrambled (the mean of the three): ${TA.line(reading.scrambled)}`); if (reading.unneighboured) log(`     the unneighboured (the mean of the three): ${TA.line(reading.unneighboured)}`);
    log(`  P1 fly:medial LESS THE SCRAMBLED: ${TA.line(reading.P1)}`); log(`  P2 fly:lateral LESS THE SCRAMBLED: ${TA.line(reading.P2)}`); log(`  P3 THE SCRAMBLED LESS flat: ${TA.line(reading.P3)}`);
    if (reading.N1) { log(`  N1 fly:medial LESS THE UNNEIGHBOURED: ${TA.line(reading.N1)}`); log(`  N2 THE UNNEIGHBOURED LESS THE SCRAMBLED: ${TA.line(reading.N2)}`); }
    return { study: S.id, chosen, reading, words };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "out", "kept", "study"].includes(x.slice(2)));
    if (bad.length) { console.error(`takePlacesControl: unknown option ${bad.join(", ")}`); process.exit(2); }
    const S = STUDIES[arg("study", "1")]; if (!S) { console.error(`takePlacesControl: --study is ${Object.keys(STUDIES).join(" or ")} (got ${arg("study")})`); process.exit(2); }
    if (S.id !== "1") console.log(`study ${S.id}: ${S.wirings.length} wirings at gains ${S.gains.join(", ")}; ${S.sets.audit.length} audit pairs from seed ${S.sets.audit[0].seed}`);
    const readingFile = arg("out", S.reading), kept = arg("kept", S.kept);
    if (fs.existsSync(readingFile)) { console.error(`takePlacesControl: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (wiring, gain, set) => { const f = path.join(kept, keptName(wiring, gain, set)); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(wiring, gain, S.sets[set])); fs.writeFileSync(f, JSON.stringify({ wiring, gain, set, first: S.sets[set][0].seed, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m), S);
    fs.writeFileSync(readingFile, JSON.stringify({ study: S.id, chosen: Object.fromEntries(Object.entries(result.chosen).map(([w, c]) => [w, { gain: c.gain, train: c.train, heldOut: c.heldOut, rows: c.rows }])), reading: result.reading, words: result.words }) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
