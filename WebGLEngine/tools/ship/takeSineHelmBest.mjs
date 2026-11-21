// WebGLEngine/tools/ship/takeSineHelmBest.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE SINE TWIN AT THE BEST-SHIP BUTTON'S HELM? tools/ship/takeFlyVsSine.mjs flew the page's cannon-aware helm against its sine twin (the same weights, a sine where the fly's steering circuit was) on 1200 pairs a fight: one ship a side with the cannon
// THE FLY TRAILED THE SINE by 0.056 (z -3.90); in the other three fights neither could be told. The best-ship button carries the fly's helm at every size. Keith: "3" (if the sine is no worse anywhere, give the button the simpler helm).
//
//   node tools/ship/takeSineHelmBest.mjs [--workers n]
//
//   THE FIGHTS, takeFlyVsSine's four on FRESH PAIRS: ONE SHIP A SIDE WITH THE CANNON, 1200 PAIRS (seeds 1501001-1501300); FLEETS OF THREE WITH IT (1511001-), ONE SHIP A SIDE WITHOUT IT (1521001-), FLEETS OF THREE WITHOUT IT (1531001-), 600 pairs each;
//   300 or 150 of each kind; the cannon on both sides or on neither. None flown by anything before. Side X carries the best-ship button's gunner for that fight (takeFlyVsSine.gunnerOf), side Y is plain.
//   THE ARMS: takeFlyVsSine's -- `fly` (brain/helmFlyWired3WeightsNoCannon.json over the fly's circuit) and `sine` (brain/helmFlyWired3WeightsSineNoCannon.json over sine~odd).
//
// REGISTERED 2026-11-21, BEFORE ANY PAIR BELOW WAS FLOWN. Readings in each fight, each a mean with a word at |z| >= 2: each arm against the plain ship; THE FLY LESS THE SINE, pair by pair.
// FORECAST, for the record: one ship a side with the cannon the sine leads again, by about 0.05 (the fly TRAILS); the other three cannot be told.
// WHAT IS DECIDED: THE BEST-SHIP BUTTON'S HELM BECOMES THE SINE TWIN ("sine") if THE FLY LESS THE SINE TRAILS one ship a side with the cannon AND LEADS IN NO FIGHT; otherwise the button keeps the fly's helm. Either way the notes of both helms and of
//   the button say so. Nothing is written but the reading; the page is changed by hand to what is decided. The fleet button, a fleets-only loadout, is not decided here.
// @@READ@@
// Every arm's leads are kept (brain/rig-results/sineHelmBest/); the reading file (brain/sineHelmBest.reading.json) is the mark that it was read, and a second read is refused.
// WHAT IS NOT HERE: escorts, fighters, the gunners' own read-outs (tools/ship/takeSineTwins.mjs), other weights for the sine.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import * as FV from "./takeFlyVsSine.mjs";
import { createPool } from "./pairPool.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), BRAIN = path.resolve(HERE, "..", "..", "brain");
export const READING = path.join(BRAIN, "sineHelmBest.reading.json"), KEPT_DIR = path.join(BRAIN, "rig-results", "sineHelmBest");
export const FIGHTS = FV.FIGHTS, ARMS = FV.ARMS;
const pairs = (first, n) => Object.freeze(D.KINDS.flatMap((kind) => Array.from({ length: n }, (_, i) => Object.freeze({ kind, seed: first + i }))));
export const SETS = Object.freeze({ oneCannon: pairs(1501001, 300), fleetCannon: pairs(1511001, 150), oneNone: pairs(1521001, 150), fleetNone: pairs(1531001, 150) });
export const brainsOf = FV.brainsOf;
/** The jobs of one fight and arm: takeFlyVsSine's, on these pairs. */
export const jobsOf = (fight, arm, b, list = SETS[fight]) => FV.jobsOf(fight, arm, b, list);
export const fightReadings = FV.fightReadings;
/** What is decided: the sine at the best-ship button's helm if the fly TRAILS one ship a side with the cannon and LEADS nowhere. Pure. */
export function decide(out) {
    const z = (f) => out[f].reading.gain.z, trails = z("oneCannon") <= -2, leads = FIGHTS.filter((f) => z(f) >= 2);
    const sine = trails && leads.length === 0;
    return { ok: true, sine, helm: sine ? "sine" : "flywired", reasons: [trails ? "one ship a side with the cannon the fly TRAILS the sine" : "one ship a side with the cannon the fly does not trail the sine", ...leads.map((f) => `in ${f} the fly LEADS the sine`)] };
}
/** The study. `fly(fight, arm)` -> Promise of leads. */
export async function study(fly, log = () => {}) {
    const out = {};
    for (const f of FIGHTS) {
        const a = {}; for (const arm of ARMS) a[arm] = await fly(f, arm); out[f] = fightReadings(a); const R = out[f].reading, S = FV.SETUP[f];
        log(`${S.ships > 1 ? "FLEETS OF 3 A SIDE" : "ONE SHIP A SIDE"}, ${S.cannon ? "THE CANNON ON" : "NO CANNON"}, ${a.fly.length} pairs, against the plain ship:`); log(`     the fly's helm: ${TA.line(R.fly)}`); log(`     the sine twin: ${TA.line(R.sine)}`); log(`  THE FLY LESS THE SINE: ${TA.line(R.gain)}`);
    }
    const verdict = decide(out); log(`WHAT IS DECIDED: the best-ship button's helm is ${verdict.sine ? "THE SINE TWIN" : "the fly's, as it was"} (${verdict.reasons.join("; ")})`);
    return { ...out, verdict };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rest = process.argv.slice(2), arg = (k, d = null) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : d; }, bad = rest.filter((x) => x.startsWith("--") && !["workers", "reading", "kept"].includes(x.slice(2)));
    if (bad.length) { console.error(`takeSineHelmBest: unknown option ${bad.join(", ")}`); process.exit(2); }
    const readingFile = arg("reading", READING), kept = arg("kept", KEPT_DIR);
    if (fs.existsSync(readingFile)) { console.error(`takeSineHelmBest: ${readingFile} is already there -- THIS STUDY HAS BEEN READ ONCE and is not read again; its reading is that file`); process.exit(1); }
    const b = brainsOf(); fs.mkdirSync(kept, { recursive: true });
    const pool = createPool(arg("workers") ? { workers: Number(arg("workers")) } : {});
    const fly = async (fight, arm) => { const f = path.join(kept, `${fight}_${arm}.json`); if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8")).leads; const leads = await pool.leads(jobsOf(fight, arm, b)); fs.writeFileSync(f, JSON.stringify({ fight, arm, leads }) + "\n"); return leads; };
    const result = await study(fly, (m) => console.log(m));
    fs.writeFileSync(readingFile, JSON.stringify(result) + "\n"); console.log(`wrote ${readingFile}`);
    await pool.close(); process.exit(0);
}
