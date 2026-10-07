// WebGLEngine/tools/denoiseStudy.mjs -- the denoiser arc's study, from the command line
//
// Run:  node tools/denoiseStudy.mjs --harvest      the real study on the real splits (the harvest round's command)
//       node tools/denoiseStudy.mjs --mini         the same pipeline on a miniature of NON-dataset scenes
//
// The pipeline is render/denoiseStudy.mjs (gated by render/denoiseStudy-selfcheck.mjs); this file only runs it and,
// with --harvest, writes render/denoise-results.json. It exports nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runStudy, MINI, RESULTS } from "../render/denoiseStudy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const args = process.argv.slice(2);
    if (args.includes("--mini")) {
        const out = runStudy({ ...MINI, log: (m) => console.log("[denoiseStudy --mini] " + m) });
        console.log(JSON.stringify({ run: out.verdict.run, reasons: out.verdict.reasons, determinism: out.determinism }, null, 1));
    } else if (args.includes("--harvest")) {
        const out = runStudy({ harvest: true, log: (m) => console.log("[denoiseStudy] " + m) });
        fs.writeFileSync(path.join(ENG, RESULTS), JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        console.log(`[denoiseStudy] run ${out.verdict.run}; H1 ${out.verdict.hypotheses.H1.status}, H2 ${out.verdict.hypotheses.H2.status} -> ${RESULTS}`);
    } else {
        console.log("usage: node tools/denoiseStudy.mjs --mini | --harvest   (--harvest renders the pre-registered dataset; see render/learned-denoiser-preregistration.md)");
        process.exit(2);
    }
}
