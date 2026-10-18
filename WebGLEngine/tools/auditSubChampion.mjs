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
export const SAFETY_AUDIT2_SET = Object.freeze(mk([["nominal", range(3000, 3099)], ["recovery", range(3000, 3299)], ["current", range(3000, 3099)]]));
export const AUDIT2_SET = Object.freeze(mk([["nominal", range(3500, 3511)], ["recovery", range(3500, 3511)], ["current", range(3500, 3511)]]));

const [file, mode] = process.argv.slice(2);
if (process.argv[1] && process.argv[1].endsWith("auditSubChampion.mjs")) {
    if (!file || !["pool", "audit"].includes(mode)) { console.error("usage: node tools/auditSubChampion.mjs <weights.json> pool|audit"); process.exit(2); }
    const w = Float32Array.from(JSON.parse(fs.readFileSync(file, "utf8")).weights), E = S.EXPLORER;
    const sets = mode === "pool" ? [["SAFETY_POOL_SET", T.SAFETY_POOL_SET]] : [["SAFETY_AUDIT2_SET", SAFETY_AUDIT2_SET], ["AUDIT2_SET", AUDIT2_SET]];
    for (const [hull, d] of [["nominal EXPLORER", {}], ["Munk x3 hull", { munk: 3000 }]]) {
        const model = S.createSubModel(Object.freeze({ ...E, ...d })), opts = { model, actuators: ACTUATORS };
        for (const [name, set] of sets) {
            const r = T.evaluate(P.pilotFor(w), set, opts), ref = T.evaluate(AS.pilot(), set, opts), c = T.compareRuns(r, ref);
            console.log(`${name.padEnd(18)} ${hull.padEnd(17)} n=${String(c.n).padStart(3)}  champion ${c.mean[0].toFixed(4)} vs autopilot ${c.mean[1].toFixed(4)}   better/worse ${c.better}/${c.worse}   ended-that-autopilot-completed ${c.newlyEnded}   early ${c.early[0]}/${c.early[1]}   worst-5% ${c.tail5[0].toFixed(3)}/${c.tail5[1].toFixed(3)}`);
        }
    }
}
