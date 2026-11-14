// WebGLEngine/tools/ship/takeHelmAudit.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE LARGER AUDIT OF THE TRAINED HELM. brain/helmWeightsDefault.json qualified on 16 audit pairs (+0.670, 13 pairs won and 2 lost) under the rule tools/ship/trainHelm.mjs had: a lead above 0 and no more pairs lost than won. The turret seat's first trained gunner qualified under the same kind of rule on 16 pairs and its
// training was worth nothing on 300 (tools/ship/takeTurretAudit.mjs). Keith: "lets do 3" -- read the helm the same way. WHAT IT WILL BE READ AS WAS WRITTEN HERE BEFORE ANY PAIR WAS FLOWN (2026-11-14).
//
//   THE PAIRS    300 fresh battleshipDuel pairs, seeds 10001-10075 of each of the four kinds. Nothing has flown them (the helm's own sets are seeds 31-54; every other trainer and audit is below 9000).
//   THE FIGHT    trainHelm.evaluate's: the helm network correcting a rule on one side, the same rule alone on the other, the same sights and cannon on both, each geometry from both seats. The rule scores 0 by construction, so a mean is the helm's lead over the rule.
//   THE READINGS a mean over the 300 pairs, its standard error, z, and LEADS (z >= 2) / TRAILS (z <= -2) / CANNOT BE TOLD.
//                H1  THE HELM AS IT WAS TRAINED   correcting the bow-on rule, regular sights, the cannon. THE ONE REGISTERED CLAIM: the file says it leads the rule. Forecast, for the record: it holds (its 16-pair lead was 2.4 standard errors by this audit's spread, not 0.6 as the gunner's was).
//                H2  WITH NO CANNON ON EITHER SIDE (the file says it TRAILS there: -0.197 on 16 pairs)
//                H3  CORRECTING THE BROADSIDE RULE (the file says it TRAILS: -0.776)
//                H4  BEHIND GREEN SIGHTS (the file says it LEADS: +0.725)
//                H2-H4 are where it was NOT trained; they are read to say what the file's 16-pair lines were worth, and nothing is chosen on any of the four.
//
//     node tools/ship/takeHelmAudit.mjs run --out <dir>      # one jsonl an arm, a line a pair; resumed if there
//     node tools/ship/takeHelmAudit.mjs report --in <dir>
"use strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as D from "../../brain/battleshipDuel.mjs";
import * as TA from "./takeTurretAudit.mjs";
import { createPool } from "./pairPool.mjs";

export const SEEDS = Object.freeze(Array.from({ length: 75 }, (_, i) => 10001 + i));
export const PAIRS = Object.freeze(SEEDS.flatMap((seed) => D.KINDS.map((kind) => Object.freeze({ kind, seed }))));
export const ARMS = Object.freeze([
    Object.freeze({ id: "trained", label: "H1 THE HELM AS IT WAS TRAINED (the bow-on rule, regular sights, the cannon)", side: Object.freeze({}) }),
    Object.freeze({ id: "no-cannon", label: "H2 with no cannon on either side", side: Object.freeze({ cannon: false }) }),
    Object.freeze({ id: "broadside", label: "H3 correcting the broadside rule", side: Object.freeze({ helmRule: "broadside" }) }),
    Object.freeze({ id: "green", label: "H4 behind green sights", side: Object.freeze({ gunners: "green" }) }),
]);
/** The jobs (tools/ship/pairPool.mjs) of an arm: the helm network on one side, the same side without it on the other. */
export const jobsOf = (arm, weights, list = PAIRS) => list.map(({ kind, seed }) => ({ x: { id: "helm", ...arm.side, helmNet: { policy: "helmPolicy", weights } }, y: { id: "rule", ...arm.side }, kind, seed }));
/** The readings from { armId: [lead, ...] }: { armId: { n, mean, se, z, word } }. */
export const readings = (leads) => Object.fromEntries(Object.entries(leads).map(([k, xs]) => { const s = TA.stat(xs); return [k, { ...s, word: TA.word(s.z) }]; }));

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const [step, ...rest] = process.argv.slice(2), arg = (k) => { const i = rest.indexOf("--" + k); return i >= 0 ? rest[i + 1] : null; };
    if (step === "run") {
        const out = arg("out"); if (!out) { console.error("takeHelmAudit: run needs --out <dir>"); process.exit(2); }
        fs.mkdirSync(out, { recursive: true });
        const weights = JSON.parse(fs.readFileSync(new URL("../../brain/helmWeightsDefault.json", import.meta.url), "utf8")).weights, pool = createPool();
        for (const arm of ARMS) {
            const file = path.join(out, arm.id + ".jsonl"), done = new Set(fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => { const r = JSON.parse(l); return r.kind + "|" + r.seed; }) : []), todo = PAIRS.filter((p) => !done.has(p.kind + "|" + p.seed));
            await pool.leads(jobsOf(arm, weights, todo), (i, lead) => fs.appendFileSync(file, JSON.stringify({ arm: arm.id, kind: todo[i].kind, seed: todo[i].seed, lead }) + "\n"));
            console.log(`${arm.id}: ${PAIRS.length} pairs in ${file}`);
        }
        await pool.close();
    } else if (step === "report") {
        const dir = arg("in"), leads = {};
        for (const arm of ARMS) leads[arm.id] = fs.readFileSync(path.join(dir, arm.id + ".jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).lead);
        const R = readings(leads);
        console.log(`[takeHelmAudit] ${PAIRS.length} pairs (seeds ${SEEDS[0]}-${SEEDS[74]} of ${D.KINDS.join(", ")}): the trained helm against the rule it corrects`);
        for (const arm of ARMS) console.log(`  ${arm.label}: ${TA.line(R[arm.id])}`);
    } else { console.error("takeHelmAudit: the first argument is run or report"); process.exit(2); }
    process.exit(0);
}
