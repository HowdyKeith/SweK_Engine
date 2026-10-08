// WebGLEngine/tools/denoiseStudy.mjs -- the denoiser arc's study, from the command line
//
// Run:  node tools/denoiseStudy.mjs --harvest-r6   the emitter-mask round (section 21) -> render/denoise-results-r6.json
//       node tools/denoiseStudy.mjs --harvest-r5   the third-family round (section 19) -> render/denoise-results-r5.json
//       node tools/denoiseStudy.mjs --harvest-r4   the temporal round (section 17) -> render/denoise-results-r4.json
//       node tools/denoiseStudy.mjs --harvest-r3   the kernel-predicting round (section 15) -> render/denoise-results-r3.json
//       node tools/denoiseStudy.mjs --harvest-r2   the re-run (pre-registration section 13) -> render/denoise-results-r2.json
//       node tools/denoiseStudy.mjs --harvest-r1   round 1 exactly as harvested at b023baa4 (section 12) -> render/denoise-results.json
//       node tools/denoiseStudy.mjs --mini         the same pipeline on a miniature of NON-dataset scenes
//
// The pipeline is render/denoiseStudy.mjs (gated by render/denoiseStudy-selfcheck.mjs); this file only runs it and
// writes the results. *** A HARVEST NEVER OVERWRITES ONE. *** Each results file is its run's own output, committed
// unedited; this refuses to start when the file it would write already exists. It exports nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, MINI, ROUND1, ROUND2, ROUND3, ROUND4, ROUND5, ROUND6 } from "../render/denoiseStudy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const args = process.argv.slice(2);
    const round = args.includes("--harvest-r6") ? ROUND6 : args.includes("--harvest-r5") ? ROUND5 : args.includes("--harvest-r4") ? ROUND4 : args.includes("--harvest-r3") ? ROUND3 : args.includes("--harvest-r2") ? ROUND2 : args.includes("--harvest-r1") ? ROUND1 : null;
    if (args.includes("--mini")) {
        const out = runStudy({ ...MINI, c0: false, log: (m) => console.log("[denoiseStudy --mini] " + m) });
        console.log(JSON.stringify({ run: out.verdict.run, reasons: out.verdict.reasons, determinism: out.determinism }, null, 1));
    } else if (round) {
        const file = path.join(ENG, round.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${round.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const out = runStudy({ splits: round.splits, init: round.init, c0: round.c0, head: round.head, compareHeads: round.compareHeads, temporal: round.temporal, compareNoHistory: round.compareNoHistory,
                               compareTrainSplit: round.compareTrainSplit, emitterMask: round.emitterMask, compareNoMask: round.compareNoMask, harvest: true, log: (m) => console.log("[denoiseStudy] " + m) });
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        const H = out.verdict.hypotheses;
        console.log(`[denoiseStudy] run ${out.verdict.run}; H1 ${H.H1?.status ?? "not tested"}, H2 ${H.H2?.status ?? "not tested"} -> ${round.results}`);
    } else {
        console.log("usage: node tools/denoiseStudy.mjs --mini | --harvest-r6 | --harvest-r5 | --harvest-r4 | --harvest-r3 | --harvest-r2 | --harvest-r1   (a harvest renders the pre-registered dataset; see render/learned-denoiser-preregistration.md)");
        process.exit(2);
    }
}
