// WebGLEngine/tools/ship/takeFlyWiredHelm.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES THE FLY'S STEERING CIRCUIT, WIRED AS THE FLY WIRES IT, STEER A SHIP? brain/flySteering.mjs drives the compass cells with the ship's heading and the goal cells with the bearing of the enemy, runs the connectome's own signed weights, and hands a helm one number, D. Nothing inside it is learned, so there is
// nothing to search but the helm's GAIN -- and so this is not a search but a registered study: a few gains, three wirings, fresh pairs, read once.
//
//   node tools/ship/takeFlyWiredHelm.mjs [--study 2] [--workers n] [--write]      (study 2: a second attempt, registered at STUDIES below after study 1 was read)
//
//   THE FIGHT: battleshipDuel pairs, one ship a side, regular gunners, the cannon, the bow-on rule at both helms; side X's rule is corrected by the helm (a torque about the two axes that are not the nose; the thrust is the rule's), side Y's is not. A lead is X's score less Y's.
//   THE ARMS: three WIRINGS -- `fly` (the circuit), `shuffled:4242` (the same cells and weights, each pathway's targets shuffled within their type: it computes no steering signal), `sine` (no circuit: an ideal comparator of the fly circuit's own amplitude and sign) -- each at eight GAINS, the same on both axes:
//   -2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2 (a gain of 1 is full correction at the circuit's peak; the sign is not assumed).
//   THE PROCEDURE, the same for each wiring: fly its eight gains on the 300 TRAIN pairs; ITS GAIN is the one with the highest mean lead (the smaller magnitude on a tie, then the negative); fly that gain on the 300 HELD-OUT pairs (reported: how much of the train lead was the choosing); then on the 600 AUDIT pairs, ONCE.
//
// REGISTERED 2026-11-16, BEFORE ANY PAIR BELOW WAS FLOWN. Pairs: train seeds 41001-41075 of each kind, held-out 42001-42075, audit 43001-43150; none flown by anything else in the tree. Readings on the audit pairs, each a mean of paired differences with a word at |z| >= 2:
//   F1 the fly's helm against the rule;   F2 THE FLY'S HELM LESS THE SHUFFLED ONE'S (does the fly's topography help a ship?);   F3 the fly's helm less the sine's (what the circuit costs or adds beside an ideal comparator);   and beside them the shuffled helm and the sine helm against the rule.
// FORECAST, for the record: the throttle did the work in every trained helm so far and this helm cannot touch it, so F1 CANNOT BE TOLD or LEADS by under 0.2; F2 has F1's word (the shuffled helm should be the rule plus noise: CANNOT BE TOLD against the rule); F3 TRAILS or CANNOT BE TOLD (D wanders from heading to
// heading by half its amplitude; the sine does not).
// WHAT SHIPS: the fly's helm at its gain, as brain/helmFlyWiredWeightsDefault.json, if F1 LEADS (z >= 2). Whether the WIRING did it is F2, and the file says both.
//
// Every arm's leads are kept (brain/rig-results/flyWiredHelm/): a run that is stopped goes on from them. The reading file is the mark that the audit was read: a second read is refused.
// WHAT IS NOT HERE: more than one shuffle seed in a fight (eight are in the gate's tuning curves), gains that differ between the axes, another threshold than the one chosen on the tuning curve, another fight than this one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmFlyWiredWeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelm");
export const WIRINGS = Object.freeze(["fly", `shuffled:${FS.CONTROL_SEED}`, "sine"]), GAINS = Object.freeze([-2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const TRAIN_PAIRS = pairs(41001, 75), HELD_OUT_PAIRS = pairs(42001, 75), AUDIT_PAIRS = pairs(43001, 150);
export const SETS = Object.freeze({ train: TRAIN_PAIRS, heldOut: HELD_OUT_PAIRS, audit: AUDIT_PAIRS });
/**
 * THE STUDIES (--study). 1 is this file's first registration (the header), READ 2026-11-16: F1 -1.275 TRAILS, F2 +0.029 CANNOT BE TOLD, F3 -2.345 TRAILS; the sine helm +1.069 LEADS. The forecast was wrong where it mattered: steering alone is worth more than a point of lead when the signal is clean, and the fly's
 * circuit as first wired LOSES by more than a point -- as its shuffled twin does. Looking for why (unregistered, on 40 SCRATCH pairs, seeds 90001-90010 of each kind, which are in no registered set): a variant with a quarter of the wander (`fly2`) lost as badly at every gain (-2.1), so the wander's size was not it;
 * what kills is ANY torque when the ship is already on its goal (the cannon needs the bow held still) -- and the same circuit read the ODD way (`~odd`: asked twice, the goal on either side, half the difference: exactly zero on the goal) led on those scratch pairs, +0.88 at a gain of -2 for `fly2~odd`, +0.54 for
 * `fly~odd`, while `shuffled:4242~odd` trailed, -1.17.
 * STUDY 2, REGISTERED 2026-11-16 AFTER STUDY 1 WAS READ AND AFTER THAT PILOT, BEFORE ANY OF ITS PAIRS WAS FLOWN -- a SECOND attempt, and said to be one: the wirings `fly2~odd`, `shuffled2:4242~odd` and `sine`; the gains -4, -2, -1, -0.5, -0.25, 0.5, 2; train seeds 44001-44075 of each kind, held-out 45001-45075,
 * audit 46001-46150; the same procedure and the same three readings. FORECAST: F1 LEADS, +0.5 to +0.9; F2 LEADS (the shuffled circuit read the odd way has under a fifth of the signal and its own wander); F3 TRAILS (the sine leads by about 1). It ships as brain/helmFlyWired2WeightsDefault.json (policy helmFlyWired2)
 * if F1 leads.
 */
export const STUDIES = Object.freeze({
    1: Object.freeze({ id: 1, wirings: Object.freeze({ fly: WIRINGS[0], shuffled: WIRINGS[1], sine: WIRINGS[2] }), gains: GAINS, sets: SETS, out: DEFAULT_OUT, kept: KEPT_DIR, policy: FS.POLICY_ID, lib: FS, what: "the ship's heading into the fly's compass cells, the enemy's bearing into its goal cells, the connectome's own signed weights, DNa02 right less left out", threshold: FS.THRESHOLD }),
    2: Object.freeze({ id: 2, wirings: Object.freeze({ fly: "fly2~odd", shuffled: `shuffled2:${FS.CONTROL_SEED}~odd`, sine: "sine" }), gains: Object.freeze([-4, -2, -1, -0.5, -0.25, 0.5, 2]), sets: Object.freeze({ train: pairs(44001, 75), heldOut: pairs(45001, 75), audit: pairs(46001, 150) }), out: path.join(BRAIN, "helmFlyWired2WeightsDefault.json"), kept: path.join(BRAIN, "rig-results", "flyWiredHelm2"), policy: FS.POLICY_ID2, lib: FS.second,
        what: "A SECOND ATTEMPT, made after the first (brain/helmFlyWiredWeightsDefault.reading.json: that helm TRAILS the rule by 1.3) was read: the same circuit with a place's bump shared among the cells there, asked twice with the goal on either side of the heading and half the difference taken, so that it adds exactly nothing when the ship is on its goal", threshold: FS.THRESHOLD2 }),
});

/** The pool's jobs: the helm of `wiring` at `gain` (both axes) on side X, the rule alone on side Y. */
export const jobsOf = (wiring, gain, list) => list.map(({ kind, seed }) => ({ x: { id: "net", helmNet: wiring === "fly" ? { policy: FS.POLICY_ID, weights: [gain, gain] } : { policy: FS.POLICY_ID, weights: [gain, gain], wiring } }, y: { id: "rule" }, kind, seed }));
/** A wiring's gain: the one with the highest mean train lead; on a tie the smaller magnitude, then the negative. `byGain`: { gain: leads }. Pure. */
export function choose(byGain) {
    const rows = Object.entries(byGain).map(([g, l]) => ({ gain: Number(g), stat: TA.stat(l) })); if (!rows.length) throw new Error("takeFlyWiredHelm.choose: no gains to choose from");
    rows.sort((a, b) => b.stat.mean - a.stat.mean || Math.abs(a.gain) - Math.abs(b.gain) || a.gain - b.gain);
    return { gain: rows[0].gain, train: rows[0].stat, rows };
}
/** The readings from each wiring's audit leads ({ fly, shuffled, sine }: arrays over the same pairs). Pure. */
export function readings(a) {
    const d = (x, y) => TA.stat(x.map((v, i) => v - y[i])), r = { F1: TA.stat(a.fly), F2: d(a.fly, a.shuffled), F3: d(a.fly, a.sine), shuffled: TA.stat(a.shuffled), sine: TA.stat(a.sine) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
export const qualifies = (reading) => (reading.F1.z >= 2 ? { ok: true, reasons: [] } : { ok: false, reasons: [`against the rule it reads ${TA.word(reading.F1.z)} (z ${reading.F1.z.toFixed(2)})`] });
/**
 * The whole study. `fly(wiring, gain, setName)` -> Promise of leads on that set (the command's keeps them in files). Returns { chosen: { wiring: { gain, train, heldOut, rows } }, reading, words, verdict }.
 * The order is the registration's: every wiring's eight gains on the train pairs, then each chosen gain on the held-out pairs, then on the audit pairs.
 */
export async function study(fly, log = () => {}, S = STUDIES[1]) {
    const chosen = {}, WIRINGS = Object.values(S.wirings), AUDIT_PAIRS = S.sets.audit;
    for (const w of WIRINGS) { const byGain = {}; for (const g of S.gains) byGain[g] = await fly(w, g, "train"); chosen[w] = choose(byGain); log(`  ${w}: train leads by gain ${chosen[w].rows.slice().sort((a, b) => a.gain - b.gain).map((r) => `${r.gain}: ${r.stat.mean >= 0 ? "+" : ""}${r.stat.mean.toFixed(3)}`).join(", ")} -> its gain ${chosen[w].gain}`); }
    for (const w of WIRINGS) { chosen[w].heldOut = TA.stat(await fly(w, chosen[w].gain, "heldOut")); log(`  ${w} at ${chosen[w].gain}: train ${TA.line(chosen[w].train)}; held-out ${TA.line(chosen[w].heldOut)}`); }
    const a = {}; for (const [role, w] of Object.entries(S.wirings)) a[role] = await fly(w, chosen[w].gain, "audit");
    const { reading, words } = readings(a), verdict = qualifies(reading);
    log(`the ${AUDIT_PAIRS.length} audit pairs, read once:`);
    log(`  F1 the fly's helm (gain ${chosen[S.wirings.fly].gain}) against the rule: ${TA.line(reading.F1)}`);
    log(`     the shuffled helm (gain ${chosen[S.wirings.shuffled].gain}) against the rule: ${TA.line(reading.shuffled)}; the sine helm (gain ${chosen[S.wirings.sine].gain}): ${TA.line(reading.sine)}`);
    log(`  F2 THE FLY'S HELM LESS THE SHUFFLED ONE'S: ${TA.line(reading.F2)}`); log(`  F3 the fly's helm less the sine's: ${TA.line(reading.F3)}`);
    log(verdict.ok ? "QUALIFIES: it leads the rule." : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { study: S.id, chosen, reading, words, verdict };
}
/** The file written when the fly's helm qualifies: a swek-brain-v1 blob of its two gains whose `by` carries the procedure and every reading. */
export function blobOf(result, S = STUDIES[result.study ?? 1]) {
    const R = result.reading, sh = S.wirings.shuffled, c = { fly: result.chosen[S.wirings.fly], sine: result.chosen[S.wirings.sine], [sh]: result.chosen[sh] }, GAINS = S.gains, TRAIN_PAIRS = S.sets.train, AUDIT_PAIRS = S.sets.audit;
    const by = `tools/ship/takeFlyWiredHelm.mjs: NOTHING INSIDE THE CIRCUIT IS LEARNED (brain/flySteering.mjs, the wiring "${S.wirings.fly}": ${S.what}); the two weights are the helm's gain about its two axes, ` +
        `${c.fly.gain}, the best of ${GAINS.length} (${GAINS.join(", ")}) on ${TRAIN_PAIRS.length} train pairs (${TA.line(c.fly.train)}), held-out ${TA.line(c.fly.heldOut)}; ${AUDIT_PAIRS.length} audit pairs (seeds ${AUDIT_PAIRS[0].seed}-${AUDIT_PAIRS[AUDIT_PAIRS.length - 1].seed} of each kind), read once: against the rule ${TA.line(R.F1)}; ` +
        `THE WIRING -- this less the same helm over the circuit with each pathway's targets shuffled (${sh}, at its own best gain ${c[sh].gain}; itself ${TA.line(R.shuffled)}) -- ${TA.line(R.F2)}; this less an ideal comparator of the same amplitude (the sine, at its own best gain ${c.sine.gain}; itself ${TA.line(R.sine)}) ${TA.line(R.F3)}; ` +
        `the thrust is the rule's; one fight only: one ship a side, regular gunners, the cannon, the bow-on rule; the circuit's threshold (${S.threshold}) was chosen on its tuning curve, not in a fight`;
    return PB.exportBrain(PB.describePolicy(S.policy, S.lib), Float32Array.from([c.fly.gain, c.fly.gain]), { score: Number(R.F1.mean.toFixed(3)), by, citation: "male-cns central-complex steering circuit with its inputs, EPG/Delta7/FC2A-C/PFL2/PFL3/DNa02/DNa03 (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
/** The name of an arm's kept file. */
export const keptName = (wiring, gain, set) => `${wiring.replace(":", "").replace("~", "-")}_g${gain}_${set}.json`;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((a) => a.startsWith("--") && !["workers", "write", "out", "kept", "study"].includes(a.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelm: unknown option ${bad.join(", ")}`); process.exit(2); }
    const S = STUDIES[arg("study", "1")]; if (!S) { console.error(`takeFlyWiredHelm: --study is ${Object.keys(STUDIES).join(" or ")} (got ${arg("study")})`); process.exit(2); }
    if (S.id !== 1) console.log(`study ${S.id}: ${Object.values(S.wirings).join(", ")}; gains ${S.gains.join(", ")}; pairs from seed ${S.sets.train[0].seed}`);
    const outBase = arg("out", S.out), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", S.kept);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelm: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (wiring, gain, set) => { const f = path.join(kept, keptName(wiring, gain, set)); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(wiring, gain, S.sets[set])); fs.writeFileSync(f, JSON.stringify({ wiring, gain, set, first: S.sets[set][0].seed, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m), S);
    fs.writeFileSync(readingFile, JSON.stringify({ study: S.id, chosen: Object.fromEntries(Object.entries(result.chosen).map(([w, c]) => [w, { gain: c.gain, train: c.train, heldOut: c.heldOut, rows: c.rows }])), reading: result.reading, words: result.words, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
