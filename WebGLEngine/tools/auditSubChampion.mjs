// WebGLEngine/tools/auditSubChampion.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/auditSubChampion.mjs <weights.json> pool            (the safety pool: may be read as often as you like)
//      node tools/auditSubChampion.mjs <weights.json> audit           (the AUDIT2 sets: READ ONCE per champion -- record the verdict in brain/SUBMARINE_WIP.md and do not run it again after tuning)
//
// The first champion (seed 6002) spent AUDIT_SET and SAFETY_AUDIT_SET (brain/subTask.mjs). A later champion needs sets of its own, so the audit mode uses two NEW seed ranges that no training, tuning or earlier
// audit has touched: SAFETY_AUDIT2 (nominal 3000-3099, recovery 3000-3299, current 3000-3099 = 500 dives) and AUDIT2 (12 per kind from 3500 = 36 dives). Each is flown under the actuator limits on the nominal
// EXPLORER and on the Munk x3 hull, champion against the PD autopilot, with compareRuns' numbers (dives it ENDED that the autopilot completed, early ends, means, worst-5% tail, better/worse).
"use strict";
import fs from "node:fs";
import * as P from "../brain/pilotSubPolicy.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as T from "../brain/subTask.mjs";
import * as S from "../physics/mechanics/subModel6dof.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mk = (spec) => spec.flatMap(([kind, seeds]) => seeds.map((s) => T.scenario(s, kind)));
// base 3000 is the range spent for seed 9201; a later champion passes a fresh base (--base 6000 -> safety 6000.., audit 6500..). The ranges below 4000 and 4000-4299 (tail mining) and 5000-5179 (the tail evaluation sample) are taken.
export const auditSets = (base = 3000) => ({
    safety: Object.freeze(mk([["nominal", range(base, base + 99)], ["recovery", range(base, base + 299)], ["current", range(base, base + 99)]])),
    audit: Object.freeze(mk([["nominal", range(base + 500, base + 511)], ["recovery", range(base + 500, base + 511)], ["current", range(base + 500, base + 511)]])),
});
export const SAFETY_AUDIT2_SET = auditSets(3000).safety, AUDIT2_SET = auditSets(3000).audit;

const [file, mode] = process.argv.slice(2), baseI = process.argv.indexOf("--base"), BASE = baseI === -1 ? 3000 : +process.argv[baseI + 1], SETS = auditSets(BASE);
if (process.argv[1] && process.argv[1].endsWith("auditSubChampion.mjs")) {
    if (!file || !["pool", "audit"].includes(mode)) { console.error("usage: node tools/auditSubChampion.mjs <weights.json> pool|audit [--base N]"); process.exit(2); }
    const w = Float32Array.from(JSON.parse(fs.readFileSync(file, "utf8")).weights), E = S.EXPLORER;
    const sets = mode === "pool" ? [["SAFETY_POOL_SET", T.SAFETY_POOL_SET]] : [[`SAFETY_AUDIT(${BASE})`, SETS.safety], [`AUDIT(${BASE + 500})`, SETS.audit]];
    for (const [hull, d] of [["nominal EXPLORER", {}], ["Munk x3 hull", { munk: 3000 }]]) {
        const model = S.createSubModel(Object.freeze({ ...E, ...d })), opts = { model, actuators: ACTUATORS };
        for (const [name, set] of sets) {
            const r = T.evaluate(P.pilotFor(w), set, opts), ref = T.evaluate(AS.pilot(), set, opts), c = T.compareRuns(r, ref);
            console.log(`${name.padEnd(18)} ${hull.padEnd(17)} n=${String(c.n).padStart(3)}  champion ${c.mean[0].toFixed(4)} vs autopilot ${c.mean[1].toFixed(4)}   better/worse ${c.better}/${c.worse}   ended-that-autopilot-completed ${c.newlyEnded}   early ${c.early[0]}/${c.early[1]}   worst-5% ${c.tail5[0].toFixed(3)}/${c.tail5[1].toFixed(3)}`);
        }
    }
}
