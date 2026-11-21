// WebGLEngine/tools/ship/takeSplitHelm.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A HELM CHOSEN BY THE CANNON. Two studies of the page's cannon-aware helm against its sine twin split the same way: WITH the cannon the sine led one
// ship a side (the fly less the sine -0.056, z -3.90, tools/ship/takeFlyVsSine.mjs; -0.048, z -3.30, tools/ship/takeSineHelmBest.mjs) and in fleets
// (-0.016, cannot be told; -0.048, z -3.44); WITHOUT it the fly led one ship a side (+0.016, cannot be told; +0.057, z 2.67). takeSineHelmBest kept the
// fly's helm on the best-ship button because of that no-cannon lead. Keith: "1" -- a helm that is the sine when the cannon is on and the fly's when it is off.
//
//   node tools/ship/takeSplitHelm.mjs [--workers n]
//
// WHY ONLY CANNON FIGHTS ARE FLOWN. The split helm IS the fly's helm in every fight without the cannon (the cannon is on both sides or neither), so there
// the two arms are the same jobs and their difference is zero by construction; the gate shows that, and nothing is flown for it. With the cannon the
// split helm IS the sine twin.
//   THE FIGHTS, the cannon on both sides, takeFlyVsSine's jobs (the best-ship button's gunner by the fight) on FRESH pairs: ONE SHIP A SIDE, 1200 PAIRS
//   (seeds 1541001-1541300), FLEETS OF THREE, 600 PAIRS (1551001-1551150). None flown by anything before. Side Y plain.
//   THE ARMS: `fly` (the page's cannon-aware helm, what the best-ship button carries) and `split` (with the cannon, the sine twin).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship;
// THE SPLIT LESS THE FLY, pair by pair.
// FORECAST, for the record: one ship a side the split leads by about 0.05 (LEADS); in fleets it leads by about 0.03 (cannot be told).
// WHAT IS DECIDED: THE BEST-SHIP BUTTON'S HELM BECOMES THE SPLIT HELM if THE SPLIT LESS THE FLY LEADS one ship a side AND does not TRAIL in fleets;
//   otherwise the button keeps the fly's helm. Either way the notes of the button and both helms say so. Nothing is written but the reading; the page
//   gains the split helm (a helm entry that names one file with the cannon and another without) by hand only if it is decided.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/splitHelm/); the reading file (brain/splitHelm.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, fighters, the fleet button (fleets only, where the sine was told once and not once), other weights.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "splitHelm.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "splitHelm");
export const FIGHTS = Object.freeze(["oneCannon", "fleetCannon"]), ARMS = Object.freeze(["fly", "split"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneCannon: pairs(1541001, 300), fleetCannon: pairs(1551001, 150) });
export const brainsOf = FV.brainsOf;
/** The helm the split arm carries in a fight: the sine twin with the cannon, the fly's helm without. Pure. */
export const splitArmOf = (fight) => (FV.SETUP[fight].cannon ? "sine" : "fly");
/** The jobs of one fight and arm: takeFlyVsSine's, the split arm as the helm it is in that fight. */
export const jobsOf = (fight, arm, b, list = SETS[fight]) => FV.jobsOf(fight, arm === "split" ? splitArmOf(fight) : "fly", b, list);
/** One fight's readings: each arm, and THE SPLIT LESS THE FLY. Pure. */
export function fightReadings(a) {
    const r = { fly: TA.stat(a.fly), split: TA.stat(a.split), gain: TA.stat(a.split.map((v, i) => v - a.fly[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided: the split helm if it LEADS one ship a side and does not TRAIL in fleets. Pure. */
export function decide(out) {
    const one = out.oneCannon.reading.gain.z, fleet = out.fleetCannon.reading.gain.z, split = one >= 2 && fleet > -2;
    return { ok: true, split, helm: split ? "split" : "flywired", reasons: [one >= 2 ? "one ship a side the split LEADS" : "one ship a side the split does not lead", fleet <= -2 ? "in fleets the split TRAILS" : "in fleets the split does not trail"] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${FV.SETUP[f].ships > 1 ? "FLEETS OF 3 A SIDE" : "ONE SHIP A SIDE"}, THE CANNON ON, ${a.fly.length} pairs, against the plain ship:`); log(`     the fly's helm: ${TA.line(R.fly)}`); log(`     the split helm (here the sine): ${TA.line(R.split)}`); log(`  THE SPLIT LESS THE FLY: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: the best-ship button's helm is ${verdict.split ? "THE SPLIT HELM" : "the fly's, as it was"} (${verdict.reasons.join("; ")})`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSplitHelm: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSplitHelm: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
