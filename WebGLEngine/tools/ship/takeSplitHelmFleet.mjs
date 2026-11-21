// WebGLEngine/tools/ship/takeSplitHelmFleet.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SPLIT HELM FOR THE FLEET BUTTON. tools/ship/takeSplitHelm.mjs moved the best-ship button to the split helm (a sine with the cannon, the fly's circuit
// without) on its one-ship lead (+0.055, z 3.88); in fleets of three it read +0.010 (cannot be told). The fleet button (fleets only: the 45-degree fly-wired
// gunner under the fly's helm) was not decided there. Across three studies the fly less the sine in fleets with the cannon read -0.016 (cannot be told),
// -0.048 (z -3.44) and -0.010 (cannot be told). Keith: "1" -- settle it for the fleet button.
//
//   node tools/ship/takeSplitHelmFleet.mjs [--workers n]
//
//   THE FIGHT: FLEETS OF THREE, THE CANNON ON both sides, the fleet button's gunner (the 45-degree fly-wired gunner, takeFlyVsSine's fleet jobs), 1200 FRESH
//   PAIRS (seeds 1561001-1561300, 300 of each kind). None flown by anything before. Side Y plain. Without the cannon the split helm IS the fly's helm, so
//   nothing is flown for it (takeSplitHelm's gate shows why).
//   THE ARMS: `fly` (the fleet button's helm) and `split` (with the cannon, the sine twin).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings, each a mean with a word at |z| >= 2: each arm against the plain ship; THE SPLIT LESS THE FLY,
// pair by pair.
// FORECAST, for the record: a small lead, about +0.02, that cannot be told.
// WHAT IS DECIDED: THE FLEET BUTTON'S HELM BECOMES THE SPLIT HELM if THE SPLIT LESS THE FLY LEADS; otherwise it keeps the fly's helm. Either way the button's
//   note says so. Nothing is written but the reading; the page is changed by hand only if it is decided.
// READ 2026-11-21 (brain/splitHelmFleet.reading.json; the kept arms in brain/rig-results/splitHelmFleet/): THE FLEET BUTTON TAKES THE SPLIT HELM. The split less the fly in fleets of three with the cannon:
//   +0.031 (z 3.68, 1200 pairs, LEADS -- the forecast said about +0.02 and that it could not be told). The fleet button carries the split helm (render/spaceDuelCore.mjs).
// Every arm's leads are kept (brain/rig-results/splitHelmFleet/); the reading file (brain/splitHelmFleet.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: fleets of two or four, escorts, fighters, other gunners.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "splitHelmFleet.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "splitHelmFleet");
export const FIGHTS = Object.freeze(["fleetCannon"]), ARMS = Object.freeze(["fly", "split"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ fleetCannon: pairs(1561001, 300) });
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
/** What is decided: the split helm on the fleet button if it LEADS in fleets. Pure. */
export function decide(out) {
    const z = out.fleetCannon.reading.gain.z, split = z >= 2;
    return { ok: true, split, helm: split ? "split" : "flywired", reasons: [split ? "in fleets the split LEADS" : "in fleets the split does not lead"] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`${FV.SETUP[f].ships > 1 ? "FLEETS OF 3 A SIDE" : "ONE SHIP A SIDE"}, THE CANNON ON, ${a.fly.length} pairs, against the plain ship:`); log(`     the fly's helm: ${TA.line(R.fly)}`); log(`     the split helm (here the sine): ${TA.line(R.split)}`); log(`  THE SPLIT LESS THE FLY: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: the fleet button's helm is ${verdict.split ? "THE SPLIT HELM" : "the fly's, as it was"} (${verdict.reasons.join("; ")})`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSplitHelmFleet: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSplitHelmFleet: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
