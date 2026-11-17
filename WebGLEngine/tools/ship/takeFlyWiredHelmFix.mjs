// WebGLEngine/tools/ship/takeFlyWiredHelmFix.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY-WIRED HELM WITHOUT THE CANNON. tools/ship/takeFlyWiredNext.mjs's `together` read the second fly-wired helm (brain/helmFlyWired2WeightsDefault.json: the fly's steering circuit read the odd way, two gains of -2) LEADING the bow-on rule by 0.945 with the cannon and TRAILING it by 0.692 (z -15) without -- a helm tuned to
// a fight the cannon decides. brain/flySteering.mjs's THIRD helm (helmFlyWired3) knows which fight it is in and has a second pair of gains for a ship with no cannon. This chooses that pair, by a registered study.
//
//   node tools/ship/takeFlyWiredHelmFix.mjs [--workers n] [--write]
//
//   THE FIGHT: battleshipDuel pairs, one ship a side, regular gunners, NO CANNON ON EITHER SIDE, the bow-on rule at both helms; side X's rule is corrected by the helm, side Y's is not. THE ARMS: the fly's circuit (`fly2~odd`) and the ideal comparator (`sine`), each at nine gains: -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2 (THE
//   GAIN 0 IS THE RULE: its leads are exactly 0 and it is not flown -- so `turn the helm off` is one of the choices, and is chosen if every other gain trails). THE PROCEDURE: each wiring's gain is its best mean lead on the 300 TRAIN pairs (tools/ship/takeFlyWiredHelm.mjs's choose); that gain on the 300 HELD-OUT pairs;
//   then on the 600 AUDIT pairs, ONCE, with the fly's helm at its shipped gain (-2) beside it.
//
// REGISTERED 2026-11-17, BEFORE ANY PAIR BELOW WAS FLOWN. Pairs: train seeds 101001-101075 of each kind, held-out 102001-102075, audit 103001-103150; none flown by anything else in the tree. Readings on the audit pairs, each a mean of paired differences with a word at |z| >= 2:
//   R1 the fly's helm at ITS no-cannon gain against the rule;   R2 the fly's helm at the shipped gain (-2) against the rule (a replication of `together`'s -0.692);   R3 R1's helm LESS R2's -- does the chosen gain help?;   S1 the sine at ITS no-cannon gain against the rule.
// FORECAST, for the record: the fly's best no-cannon gain is 0 or a small positive one (turning a little AWAY lets more turrets bear); R1 CANNOT BE TOLD; R2 TRAILS (about -0.7); R3 LEADS; S1 CANNOT BE TOLD.
// WHAT SHIPS: brain/helmFlyWired3WeightsDefault.json (policy helmFlyWired3: [-2, -2, g, g], g the fly's chosen no-cannon gain) if R3 LEADS and R1 does not TRAIL. With the cannon it is the second helm to the bit (brain/flySteering-selfcheck.mjs), so what is read here is all that changes.
//
// Every arm's leads are kept (brain/rig-results/flyWiredHelmFix/); the reading file is the mark that the audit was read, and a second read is refused.
// WHAT IS NOT HERE: gains that differ between the axes, the broadside rule, a fleet, fighters, the gain with the cannon re-chosen (it is the shipped -2, read three times).
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as FS from "../../brain/flySteering.mjs";
import * as PB from "../../brain/peerBrain.mjs";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { choose } from "./takeFlyWiredHelm.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const DEFAULT_OUT = path.join(BRAIN, "helmFlyWired3WeightsDefault.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "flyWiredHelmFix");
export const WIRINGS = Object.freeze(["fly2~odd", "sine"]), GAINS = Object.freeze([-2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2]), SHIPPED_GAIN = -2;
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ train: pairs(101001, 75), heldOut: pairs(102001, 75), audit: pairs(103001, 150) });
export { choose };

/** The pool's jobs: the helm of `wiring` at `gain` (both axes) on side X, the rule alone on side Y, NO CANNON on either side. */
export const jobsOf = (wiring, gain, list) => list.map(({ kind, seed }) => ({ x: { id: "net", cannon: false, helmNet: { policy: FS.POLICY_ID, weights: [gain, gain], wiring } }, y: { id: "rule", cannon: false }, kind, seed }));
/** The readings from the audit leads ({ fly, shipped, sine }). Pure. */
export function readings(a) {
    const r = { R1: TA.stat(a.fly), R2: TA.stat(a.shipped), R3: TA.stat(a.fly.map((v, i) => v - a.shipped[i])), S1: TA.stat(a.sine) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
export const qualifies = (r) => { const reasons = []; if (!(r.R3.z >= 2)) reasons.push(`against the shipped gain the chosen one reads ${TA.word(r.R3.z)} (z ${r.R3.z.toFixed(2)})`); if (r.R1.z <= -2) reasons.push(`against the rule it TRAILS (z ${r.R1.z.toFixed(2)})`); return { ok: reasons.length === 0, reasons }; };
/** The whole study. `fly(wiring, gain, setName)` -> Promise of leads; the gain 0 is never asked for (its leads are 0). */
export async function study(fly, log = () => {}) {
    const zero = (set) => SETS[set].map(() => 0), on = (w, g, set) => (g === 0 ? zero(set) : fly(w, g, set)), chosen = {};
    for (const w of WIRINGS) { const byGain = {}; for (const g of GAINS) byGain[g] = await on(w, g, "train"); chosen[w] = choose(byGain); log(`  ${w}: train leads by gain ${chosen[w].rows.slice().sort((p, q) => p.gain - q.gain).map((r) => `${r.gain}: ${r.stat.mean >= 0 ? "+" : ""}${r.stat.mean.toFixed(3)}`).join(", ")} -> its gain ${chosen[w].gain}`); }
    for (const w of WIRINGS) { chosen[w].heldOut = TA.stat(await on(w, chosen[w].gain, "heldOut")); log(`  ${w} at ${chosen[w].gain}: train ${TA.line(chosen[w].train)}; held-out ${TA.line(chosen[w].heldOut)}`); }
    const g = chosen["fly2~odd"].gain, flyA = await on("fly2~odd", g, "audit"), a = { fly: flyA, shipped: g === SHIPPED_GAIN ? flyA : await on("fly2~odd", SHIPPED_GAIN, "audit"), sine: await on("sine", chosen.sine.gain, "audit") };
    const { reading, words } = readings(a), verdict = qualifies(reading);
    log(`the ${SETS.audit.length} audit pairs, NO CANNON, read once:`);
    log(`  R1 the fly's helm at its no-cannon gain (${g}) against the rule: ${TA.line(reading.R1)}`); log(`  R2 the fly's helm at the shipped gain (${SHIPPED_GAIN}) against the rule: ${TA.line(reading.R2)}`);
    log(`  R3 THE CHOSEN GAIN LESS THE SHIPPED ONE: ${TA.line(reading.R3)}`); log(`  S1 the sine at its no-cannon gain (${chosen.sine.gain}) against the rule: ${TA.line(reading.S1)}`);
    log(verdict.ok ? `QUALIFIES: the third helm is [${SHIPPED_GAIN}, ${SHIPPED_GAIN}, ${g}, ${g}].` : "DOES NOT QUALIFY: " + verdict.reasons.join("; "));
    return { chosen, reading, words, verdict };
}
/** The file written when it qualifies: a helmFlyWired3 brain of [-2, -2, g, g] whose `by` carries the procedure and the readings. */
export function blobOf(result) {
    const c = result.chosen["fly2~odd"], R = result.reading, g = c.gain;
    const by = `tools/ship/takeFlyWiredHelmFix.mjs: brain/flySteering.mjs's THIRD helm -- the second fly-wired helm (the fly's steering circuit read the odd way; NOTHING INSIDE IT IS LEARNED) that asks whether its ship has a cannon; WITH ONE its gains are the second helm's shipped ${SHIPPED_GAIN} (it is that helm to the bit: with the cannon it leads the rule by about 1.0, read three times), WITHOUT ONE ${g}, ` +
        `the best of ${GAINS.length} (${GAINS.join(", ")}; 0 is the rule) on ${SETS.train.length} train pairs with no cannon on either side (${TA.line(c.train)}), held-out ${TA.line(c.heldOut)}; ${SETS.audit.length} audit pairs (seeds ${SETS.audit[0].seed}-${SETS.audit[SETS.audit.length - 1].seed} of each kind), read once, no cannon: against the rule ${TA.line(R.R1)}; ` +
        `the shipped gain there ${TA.line(R.R2)}; THE CHOSEN GAIN LESS THE SHIPPED ONE ${TA.line(R.R3)}; the ideal comparator at its own no-cannon gain ${result.chosen.sine.gain} ${TA.line(R.S1)}; one ship a side, regular gunners, the bow-on rule`;
    return PB.exportBrain(PB.describePolicy(FS.POLICY_ID3, FS.third), Float32Array.from([SHIPPED_GAIN, SHIPPED_GAIN, g, g]), { score: Number(R.R1.mean.toFixed(3)), by, citation: "male-cns central-complex steering circuit with its inputs, EPG/Delta7/FC2A-C/PFL2/PFL3/DNa02/DNa03 (Janelia FlyEM, vendor/male-cns/PROVENANCE.md)" });
}
export const keptName = (wiring, gain, set) => `${wiring.replace("~", "-")}_g${gain}_${set}.json`;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "write", "out", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeFlyWiredHelmFix: unknown option ${bad.join(", ")}`); process.exit(2); }
    const outBase = arg("out", DEFAULT_OUT), readingFile = outBase.replace(/\.json$/, ".reading.json"), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeFlyWiredHelmFix: ${readingFile} is already there -- THE AUDIT HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (wiring, gain, set) => { const f = path.join(kept, keptName(wiring, gain, set)); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(wiring, gain, SETS[set])); fs.writeFileSync(f, JSON.stringify({ wiring, gain, set, first: SETS[set][0].seed, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify({ chosen: Object.fromEntries(Object.entries(result.chosen).map(([w, c]) => [w, { gain: c.gain, train: c.train, heldOut: c.heldOut, rows: c.rows }])), reading: result.reading, words: result.words, verdict: result.verdict }) + "\n"); console.log(`wrote ${readingFile}`);
    if (rest.includes("--write")) { if (!result.verdict.ok) console.log("not written: " + result.verdict.reasons.join("; ")); else { fs.writeFileSync(outBase, JSON.stringify(blobOf(result)) + "\n"); console.log(`wrote ${outBase}`); } }
    await pool.close(); process.exit(0);
}
