// WebGLEngine/tools/ship/takeFlyWiredGunner.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES THE FLY'S TRACKING CIRCUIT, WIRED AS THE FLY WIRES IT, LAY A SHIP'S GUNS? brain/flyTracking.mjs drives the LC10a cells of one eye, each at its own place, with a target's bearing from where the gun points, runs the connectome's own signed weights and hands a gunner one number for each of the gun's two
// axes. Nothing inside it is learned, so, as for the helm (tools/ship/takeFlyWiredHelm.mjs), there is nothing to search but the GAIN: a registered study, fresh pairs, read once.
//
//   node tools/ship/takeFlyWiredGunner.mjs [--workers n] [--write]
//
//   THE FIGHT: battleshipDuel pairs, one ship a side, regular sights, NO CANNON ON EITHER SIDE (so that gunnery decides the fight) and the whole magazines. Side X's thirteen seats are the fly-wired gunner's; side Y's are the seat's hand gunner. The trigger is the sight's own rule on both sides.
//   THE ARMS: five WIRINGS -- `fly:medial` and `fly:lateral` (the circuit with each cell at its place, straight ahead at the medial end of the dendritic sheet or at the lateral: the data does not say which), `flat` (the circuit with no places: only the target's SIDE is carried), `shuffled:4242` (`fly:medial` with each
//   pathway's targets shuffled within their type) and `sine` (no circuit) -- each at four GAINS, the same on both axes: -8, -3, -1, 2 (a gain of 1 is a full-rate command at the circuit's peak; a negative gain lays the gun toward the target).
//   THE PROCEDURE, the same for each wiring: its four gains on the 300 TRAIN pairs; ITS GAIN is the one with the highest mean lead (tools/ship/takeFlyWiredHelm.mjs's choose); that gain on the 300 HELD-OUT pairs; then on the 600 AUDIT pairs, ONCE. THE FLY'S ORIENTATION is whichever of the two leads by more on the
//   HELD-OUT pairs (`fly:medial` on a tie), chosen before the audit pairs are flown. Beside them on the audit pairs: the race car's untrained hand rule in the same seats (brain/seatTurretGunner.mjs's hand weights), which lays by rates as this does and has its own trigger.
//
// REGISTERED 2026-11-16, BEFORE ANY PAIR BELOW WAS FLOWN (one scratch pair, crossing seed 90003, was flown while building the module and its gate: `fly:medial` at -4 led the hand gunner on it, at +4 trailed). Pairs: train seeds 51001-51075 of each kind, held-out 52001-52075, audit 53001-53150. Readings on the audit
// pairs, each a mean of paired differences with a word at |z| >= 2:
//   K1 `fly:medial` against the hand gunner;   K2 `fly:lateral` against the hand gunner;   K3 THE FLY'S (its chosen orientation) LESS `flat` -- do the cells' PLACES help?;   K4 the fly's less the shuffled one's;   K5 the fly's less the sine's;   K6 the fly's less the race car's hand rule.
// FORECAST, for the record: K1 and K2 LEAD (a gunner that lays by rates led the hand gunner wherever it was flown); K3 CANNOT BE TOLD or TRAILS (a switch slews a gun faster than a graded command, and a gun has no cannon's aim to spoil); K4 LEADS by a little or CANNOT BE TOLD -- A SHUFFLE IS A WEAK CONTROL HERE
// (brain/flyTracking-selfcheck.mjs: this circuit is 275 cells onto two onto two, and seed 4242's shuffle keeps the command's sign to a quarter turn and reverses it behind); K5 and K6 CANNOT BE TOLD.
// WHAT SHIPS: `fly:medial` at its gain, as brain/seatFlyWiredWeightsDefault.json (policy seatFlyWired), if K1 LEADS (z >= 2). What the PLACES are worth is K3, and the file says it.
//
// Every arm's leads are kept (brain/rig-results/flyWiredGunner/): a run that is stopped goes on from them. The reading file is the mark that the audit was read: a second read is refused.
// WHAT IS NOT HERE: gains that differ between the axes, the sheet's other axis, a moving target's motion (an LC10a cell answers a small moving object), more than one shuffle seed, another fight than this one (no cannon; with the cannon the guns matter less).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FT from "../../brain/flyTracking.mjs";
import * as ST from "../../brain/seatTurretGunner.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { choose } from "./takeFlyWiredHelm.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "seatFlyWiredWeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredGunner");
export const WIRINGS = Object.freeze(["fly:medial", "fly:lateral", "flat", `shuffled:${FT.CONTROL_SEED}`, "sine"]), GAINS = Object.freeze([-8, -3, -1, 2]), CAR = "car";
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const TRAIN_PAIRS = pairs(51001, 75), HELD_OUT_PAIRS = pairs(52001, 75), AUDIT_PAIRS = pairs(53001, 150);
export const SETS = Object.freeze({ train: TRAIN_PAIRS, heldOut: HELD_OUT_PAIRS, audit: AUDIT_PAIRS });
export { choose };

/** The pool's jobs: the gunner of `wiring` at `gain` (both axes) in side X's seats -- or, for the wiring CAR, the race car's untrained hand rule -- against the hand gunner, no cannon on either side. */
export const jobsOf = (wiring, gain, list) => list.map(({ kind, seed }) => ({ x: { id: "net", cannon: false, network: wiring === CAR ? { policy: ST.POLICY_ID, weights: Array.from(ST.handWeights()) } : { policy: FT.POLICY_ID, weights: [gain, gain], wiring } }, y: { id: "hand", cannon: false }, kind, seed }));
/** The fly's orientation: whichever of the two leads by more on the held-out pairs; `fly:medial` on a tie. Pure. */
export const orientationOf = (heldMedial, heldLateral) => (heldLateral.mean > heldMedial.mean ? "fly:lateral" : "fly:medial");
/** The readings from the audit leads ({ medial, lateral, flat, shuffled, sine, car }: arrays over the same pairs) and the fly's orientation. Pure. */
export function readings(a, orientation) {
    const d = (x, y) => TA.stat(x.map((v, i) => v - y[i])), fly = orientation === "fly:lateral" ? a.lateral : a.medial;
    const r = { K1: TA.stat(a.medial), K2: TA.stat(a.lateral), K3: d(fly, a.flat), K4: d(fly, a.shuffled), K5: d(fly, a.sine), K6: d(fly, a.car), flat: TA.stat(a.flat), shuffled: TA.stat(a.shuffled), sine: TA.stat(a.sine), car: TA.stat(a.car) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
export const qualifies = (reading) => (reading.K1.z >= 2 ? { ok: true, reasons: [] } : { ok: false, reasons: [`\`fly:medial\` against the hand gunner reads ${TA.word(reading.K1.z)} (z ${reading.K1.z.toFixed(2)})`] });
/** The whole study. `fly(wiring, gain, setName)` -> Promise of leads (gain is null for the car). Returns { chosen, orientation, reading, words, verdict }. */
export async function study(fly, log = () => {}) {
    const chosen = {}, role = { "fly:medial": "medial", "fly:lateral": "lateral", flat: "flat", [WIRINGS[3]]: "shuffled", sine: "sine" };
    for (const w of WIRINGS) { const byGain = {}; for (const g of GAINS) byGain[g] = await fly(w, g, "train"); chosen[w] = choose(byGain); log(`  ${w}: train leads by gain ${chosen[w].rows.slice().sort((a, b) => a.gain - b.gain).map((r) => `${r.gain}: ${r.stat.mean >= 0 ? "+" : ""}${r.stat.mean.toFixed(3)}`).join(", ")} -> its gain ${chosen[w].gain}`); }
    for (const w of WIRINGS) { chosen[w].heldOut = TA.stat(await fly(w, chosen[w].gain, "heldOut")); log(`  ${w} at ${chosen[w].gain}: train ${TA.line(chosen[w].train)}; held-out ${TA.line(chosen[w].heldOut)}`); }
    const orientation = orientationOf(chosen["fly:medial"].heldOut, chosen["fly:lateral"].heldOut); log(`  the fly's orientation, by the held-out pairs: ${orientation}`);
    const a = {}; for (const w of WIRINGS) a[role[w]] = await fly(w, chosen[w].gain, "audit"); a.car = await fly(CAR, null, "audit");
    const { reading, words } = readings(a, orientation), verdict = qualifies(reading);
    log(`the ${AUDIT_PAIRS.length} audit pairs, read once:`);
    log(`  K1 fly:medial (gain ${chosen["fly:medial"].gain}) against the hand gunner: ${TA.line(reading.K1)}`); log(`  K2 fly:lateral (gain ${chosen["fly:lateral"].gain}) against the hand gunner: ${TA.line(reading.K2)}`);
    log(`     flat (gain ${chosen.flat.gain}): ${TA.line(reading.flat)}; shuffled (gain ${chosen[WIRINGS[3]].gain}): ${TA.line(reading.shuffled)}; sine (gain ${chosen.sine.gain}): ${TA.line(reading.sine)}; the race car's hand rule: ${TA.line(reading.car)}`);
    log(`  K3 THE FLY'S (${orientation}) LESS flat -- what the cells' PLACES are worth: ${TA.line(reading.K3)}`); log(`  K4 the fly's less the shuffled one's: ${TA.line(reading.K4)}`); log(`  K5 the fly's less the sine's: ${TA.line(reading.K5)}`); log(`  K6 the fly's less the race car's hand rule: ${TA.line(reading.K6)}`);
    log(verdict.ok ? "QUALIFIES: fly:medial leads the hand gunner." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { chosen, orientation, reading, words, verdict };
}
/** The file written when `fly:medial` qualifies: a swek-brain-v1 blob of its two gains whose `by` carries the procedure and every reading. */
export function blobOf(result) {
    const c = result.chosen, R = result.reading, m = c["fly:medial"];
    const by = `tools/ship/takeFlyWiredGunner.mjs: NOTHING INSIDE THE CIRCUIT IS LEARNED (brain/flyTracking.mjs, \"fly:medial\": a target's bearing onto the fly's LC10a cells of one eye, each at its own place across its dendritic sheet with straight ahead at the medial end, the connectome's own signed weights, DNa02 right less left read the odd way; THE TRIGGER IS THE SIGHT'S OWN RULE); the two weights are the gunner's gain on its two axes, ` +
        `${m.gain}, the best of ${GAINS.length} (${GAINS.join(", ")}) on ${TRAIN_PAIRS.length} train pairs (${TA.line(m.train)}), held-out ${TA.line(m.heldOut)}; fights with NO CANNON on either side; ${AUDIT_PAIRS.length} audit pairs (seeds ${AUDIT_PAIRS[0].seed}-${AUDIT_PAIRS[AUDIT_PAIRS.length - 1].seed} of each kind), read once: against the hand gunner ${TA.line(R.K1)}; the other orientation (fly:lateral, gain ${c["fly:lateral"].gain}) ${TA.line(R.K2)}; ` +
        `WHAT THE CELLS' PLACES ARE WORTH -- the fly's (${result.orientation}, the better on the held-out pairs) less the same circuit with no places (flat, gain ${c.flat.gain}; itself ${TA.line(R.flat)}) -- ${TA.line(R.K3)}; less the shuffled circuit's (${WIRINGS[3]}, gain ${c[WIRINGS[3]].gain}; itself ${TA.line(R.shuffled)}; a weak control: this circuit is 275 cells onto two onto two) ${TA.line(R.K4)}; less the sine's (gain ${c.sine.gain}; itself ${TA.line(R.sine)}) ${TA.line(R.K5)}; less the race car's untrained hand rule (itself ${TA.line(R.car)}) ${TA.line(R.K6)}; ` +
        `one fight only; the circuit's sigma, overlap and constant drive were chosen by hand, not in a fight`;
    return PB.exportBrain(PB.describePolicy(FT.POLICY_ID, FT), Float32Array.from([m.gain, m.gain]), { score: Number(R.K1.mean.toFixed(3)), by, citation: "male-cns visual target-tracking pathway, LC10a/AOTU019/AOTU025/DNa02, with the LC10a cells' dendrite positions (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
/** The name of an arm's kept file. */
export const keptName = (wiring, gain, set) => `${wiring.replace(":", "-")}_g${gain === null ? "none" : gain}_${set}.json`;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((a) => a.startsWith("--") && !["workers", "write", "out", "kept"].includes(a.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredGunner: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredGunner: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (wiring, gain, set) => { const f = path.join(kept, keptName(wiring, gain, set)); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(wiring, gain, SETS[set])); fs.writeFileSync(f, JSON.stringify({ wiring, gain, set, first: SETS[set][0].seed, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify({ chosen: Object.fromEntries(Object.entries(result.chosen).map(([w, c]) => [w, { gain: c.gain, train: c.train, heldOut: c.heldOut, rows: c.rows }])), orientation: result.orientation, reading: result.reading, words: result.words, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
