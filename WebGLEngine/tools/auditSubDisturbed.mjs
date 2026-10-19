// WebGLEngine/tools/auditSubDisturbed.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/auditSubDisturbed.mjs pool  [--hulls nominal,munk3] [--pilots a.json,b.json]       (the SAFETY_POOL: may be read as often as you like)
//      node tools/auditSubDisturbed.mjs audit --base 14000 [--hulls ...] [--pilots ...]                (a FRESH range: read once per champion)
//
// Each pilot flies the set at each disturbance level of tools/subDisturb.mjs (sensor noise + control delay + gusts, 0 clean .. 3 bad day) on each hull, actuator limits on, against the PD autopilot DISTURBED THE SAME WAY
// (the same noise seeds, the same delay, the same gusts): mean score, dives ended that the autopilot completes, early ends, worst-5%. Pilots default to the PD autopilot's neighbours: the long, tail and wide champions.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as P from "../brain/pilotSubPolicy.mjs";
import * as AS from "../brain/autopilotSub.mjs";
import * as T from "../brain/subTask.mjs";
import { ACTUATORS } from "../physics/mechanics/subActuators.mjs";
import * as H from "../physics/mechanics/subHulls.mjs";
import * as D from "./subDisturb.mjs";
import { auditSets } from "./auditSubChampion.mjs";

const arg = (f, d = null) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const mode = process.argv[2], hulls = (arg("--hulls", "nominal,munk3")).split(","), B = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../brain") + path.sep;
const files = (arg("--pilots", B + "pilotSubWeightsRobustLongWip.json," + B + "pilotSubWeightsRobustTail2Wip.json," + B + "pilotSubWeightsRobustWideWip.json")).split(",");
if (!["pool", "audit"].includes(mode)) { console.error("usage: node tools/auditSubDisturbed.mjs pool|audit [--base N] [--hulls a,b] [--pilots f1,f2]"); process.exit(2); }
const sets = mode === "pool" ? [["SAFETY_POOL", T.SAFETY_POOL_SET]] : (() => { const a = auditSets(+arg("--base", 14000)); return [["SAFETY_AUDIT", a.safety], ["AUDIT", a.audit]]; })();
const pilotOf = (f) => P.pilotFor(Float32Array.from(JSON.parse(fs.readFileSync(f, "utf8")).weights));
for (const hull of hulls) for (const [setName, set] of sets) {
    console.log(`\n${setName} (${set.length}) on ${hull}: champion / PD autopilot (disturbed the same way); better-worse; newly ended; early ends c/a; worst-5% c/a`);
    for (const f of files) {
        const name = f.split("/").pop().replace(/^pilotSubWeights|Wip\.json$/g, "");
        for (const L of D.LEVELS.keys()) {
            const lv = D.LEVELS[L], gs = D.gustySet(set, lv.gust), o = { model: H.model(hull), actuators: ACTUATORS };
            const r = T.evaluate(D.disturbed(pilotOf(f), lv, 77), gs, o), ref = T.evaluate(D.disturbed(AS.pilot(), lv, 77), gs, o), c = T.compareRuns(r, ref);
            console.log(`  ${name.padEnd(12)} level ${L} ${lv.name.padEnd(20)} ${c.mean[0].toFixed(3)} / ${c.mean[1].toFixed(3)}   ${c.better}-${c.worse}   newly ${c.newlyEnded}   early ${c.early[0]}/${c.early[1]}   tail ${c.tail5[0].toFixed(3)}/${c.tail5[1].toFixed(3)}`);
        }
    }
}
