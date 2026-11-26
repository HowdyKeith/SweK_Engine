// WebGLEngine/tools/ship/takeSplitHelmSizes.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SPLIT HELM IN FLEETS OF TWO AND FOUR. Both buttons carry the split helm (a sine with the cannon, the fly's circuit without) on readings one ship a side
// (+0.055, tools/ship/takeSplitHelm.mjs) and in fleets of three (+0.031, tools/ship/takeSplitHelmFleet.mjs). The page offers fleets of one to four. Keith: "1" --
// check it is not tuned to three.
//
//   node tools/ship/takeSplitHelmSizes.mjs [--workers n]
//
//   THE FIGHTS: FLEETS OF TWO (seeds 1621001-1621150) and FLEETS OF FOUR (1631001-1631150), the cannon on both sides, 600 pairs each (150 of each kind), side X
//   with both buttons' fleet gunner (the 45-degree fly-wired gunner), side Y plain. None flown by anything before. Without the cannon the split helm IS the fly's.
//   THE ARMS: `fly` (the fly's helm) and `split` (with the cannon, the sine twin).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings, each a mean with a word at |z| >= 2: each arm against the plain ship; THE SPLIT LESS THE FLY.
// FORECAST, for the record: a small lead at both sizes, about +0.03, perhaps not told at 600 pairs.
// WHAT IS DECIDED: BOTH BUTTONS KEEP THE SPLIT HELM unless it TRAILS at either size; if it trails anywhere, both go back to the fly's helm (a helm that loses
//   in some fleets the page offers is not the best helm). Either way the buttons' notes say so. Nothing is written but the reading.
// READ 2026-11-21 (brain/splitHelmSizes.reading.json; the kept arms in brain/rig-results/splitHelmSizes/): BOTH BUTTONS KEEP THE SPLIT HELM. The split less the
//   fly's helm: fleets of two -0.008 (z -0.45, cannot be told), fleets of four -0.008 (z -0.80, cannot be told). It trails at neither size. The forecast's small
//   lead did not come: at two and four a side the split and the fly's helm cannot be told apart (both +1.68 to +1.79 over the plain ship); the lead it showed
//   in fleets of three (+0.031, z 3.68) is not one that grows or holds across sizes.
// Every arm's leads are kept (brain/rig-results/splitHelmSizes/); the reading file (brain/splitHelmSizes.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, fighters, one ship a side and fleets of three (read already), other gunners.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "splitHelmSizes.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "splitHelmSizes");
export const FIGHTS = Object.freeze(["fleet2", "fleet4"]), ARMS = Object.freeze(["fly", "split"]);
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ fleet2: pairs(1621001, 150), fleet4: pairs(1631001, 150) });
export const SHIPS = Object.freeze({ fleet2: 2, fleet4: 4 });
export const brainsOf = FV.brainsOf;
/** The jobs of one fight and arm: takeFlyVsSine's fleet jobs (the cannon on, the 45-degree gunner) at this fight's fleet size; the split arm is the sine twin. */
export const jobsOf = (fight, arm, b, list = SETS[fight]) => FV.jobsOf("fleetCannon", arm === "split" ? "sine" : "fly", b, list).map((j) => ({ ...j, opts: { ...j.opts, ships: SHIPS[fight] } }));
/** One fight's readings: each arm, and THE SPLIT LESS THE FLY. Pure. */
export function fightReadings(a) {
    const r = { fly: TA.stat(a.fly), split: TA.stat(a.split), gain: TA.stat(a.split.map((v, i) => v - a.fly[i])) };
    return { reading: r, words: Object.fromEntries(Object.entries(r).map(([k, s]) => [k, TA.word(s.z)])) };
}
/** What is decided: both buttons keep the split helm unless it TRAILS at either size. Pure. */
export function decide(out) {
    const trails = FIGHTS.filter((f) => out[f].reading.gain.z <= -2), keep = trails.length === 0;
    return { ok: true, keep, helm: keep ? "split" : "flywired", trails, reasons: keep ? ["the split trails at neither size: both buttons keep it"] : [`the split TRAILS in ${trails.join(", ")}: both buttons go back to the fly's helm`] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading;
        log(`FLEETS OF ${SHIPS[f]} A SIDE, THE CANNON ON, ${a.fly.length} pairs, against the plain ship:`); log(`     the fly's helm: ${TA.line(R.fly)}`); log(`     the split helm (here the sine): ${TA.line(R.split)}`); log(`  THE SPLIT LESS THE FLY: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: ${verdict.reasons.join("; ")}`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSplitHelmSizes: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSplitHelmSizes: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
