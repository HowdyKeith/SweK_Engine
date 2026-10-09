// WebGLEngine/tools/denoiseStudy.mjs -- the denoiser arc's study, from the command line
//
// Run:  node tools/denoiseStudy.mjs --harvest-r10  the large network trained on family C (section 30) -> render/denoise-results-r10.json
//       node tools/denoiseStudy.mjs --harvest-r9   the large network, trained longer, the sign-flip test (section 28) -> render/denoise-results-r9.json
//       node tools/denoiseStudy.mjs --harvest-r8   round 7 with C1 on the training images (section 26) -> render/denoise-results-r8.json
//       node tools/denoiseStudy.mjs --harvest-r7   the randomized round (section 23) -> render/denoise-results-r7.json
//       node tools/denoiseStudy.mjs --harvest-r6   the emitter-mask round (section 21) -> render/denoise-results-r6.json
//       node tools/denoiseStudy.mjs --harvest-r5   the third-family round (section 19) -> render/denoise-results-r5.json
//       node tools/denoiseStudy.mjs --harvest-r4   the temporal round (section 17) -> render/denoise-results-r4.json
//       node tools/denoiseStudy.mjs --harvest-r3   the kernel-predicting round (section 15) -> render/denoise-results-r3.json
//       node tools/denoiseStudy.mjs --harvest-r2   the re-run (pre-registration section 13) -> render/denoise-results-r2.json
//       node tools/denoiseStudy.mjs --harvest-r1   round 1 exactly as harvested at b023baa4 (section 12) -> render/denoise-results.json
//       node tools/denoiseStudy.mjs --mini         the same pipeline on a miniature of NON-dataset scenes
//
//       ... --harvest-rN --cache <dir>   keep every rendered scene, tuned filter and trained network in <dir>; the same
//                                        command again resumes where the last stopped (section 24). The directory is
//                                        stamped with the round, the commit and the working tree's diff of the code, and
//                                        refused by any other.
//       ... --harvest-rN --workers <n>   train up to n networks at once in worker threads -- bit for bit the same
//                                        networks (render/denoisePool.mjs); the count is recorded beside the results.
//
// The pipeline is render/denoiseStudy.mjs (gated by render/denoiseStudy-selfcheck.mjs); this file only runs it and
// writes the results. *** A HARVEST NEVER OVERWRITES ONE. *** Each results file is its run's own output, committed
// unedited; this refuses to start when the file it would write already exists. It exports nothing.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { openCache, hashArrays } from "../render/denoiseCache.mjs";
import { runStudy, MINI, ROUND1, ROUND2, ROUND3, ROUND4, ROUND5, ROUND6, ROUND7, ROUND8, ROUND9, ROUND10 } from "../render/denoiseStudy.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const args = process.argv.slice(2);
    const round = args.includes("--harvest-r10") ? ROUND10 : args.includes("--harvest-r9") ? ROUND9 : args.includes("--harvest-r8") ? ROUND8 : args.includes("--harvest-r7") ? ROUND7 : args.includes("--harvest-r6") ? ROUND6 : args.includes("--harvest-r5") ? ROUND5 : args.includes("--harvest-r4") ? ROUND4 : args.includes("--harvest-r3") ? ROUND3 : args.includes("--harvest-r2") ? ROUND2 : args.includes("--harvest-r1") ? ROUND1 : null;
    if (args.includes("--mini")) {
        const out = runStudy({ ...MINI, c0: false, log: (m) => console.log("[denoiseStudy --mini] " + m) });
        console.log(JSON.stringify({ run: out.verdict.run, reasons: out.verdict.reasons, determinism: out.determinism }, null, 1));
    } else if (round) {
        const file = path.join(ENG, round.results);
        if (fs.existsSync(file)) { console.log(`[denoiseStudy] ${round.results} exists -- a harvest's results are never overwritten`); process.exit(2); }
        const at = args.indexOf("--cache"), dir = at >= 0 ? args[at + 1] : null;
        if (at >= 0 && !dir) { console.log("[denoiseStudy] --cache needs a directory"); process.exit(2); }
        const git = (...a) => execFileSync("git", a, { cwd: ENG, encoding: "utf8", maxBuffer: 1 << 28 });
        const cache = dir ? openCache(path.resolve(dir), { results: round.results, commit: git("rev-parse", "HEAD").trim(),
                                                         diff: hashArrays([git("diff", "HEAD", "--", "render", "brain", "physics", "tools/denoiseStudy.mjs")]) }) : null;
        if (cache) console.log(`[denoiseStudy] cache ${cache.dir}`);
        const wAt = args.indexOf("--workers"), workers = wAt >= 0 ? Number(args[wAt + 1]) : 0;
        if (wAt >= 0 && !(Number.isInteger(workers) && workers >= 1)) { console.log("[denoiseStudy] --workers needs a whole number of at least 1"); process.exit(2); }
        const out = runStudy({ splits: round.splits, init: round.init, c0: round.c0, head: round.head, compareHeads: round.compareHeads, temporal: round.temporal, compareNoHistory: round.compareNoHistory,
                               compareTrainSplit: round.compareTrainSplit, emitterMask: round.emitterMask, compareNoMask: round.compareNoMask, c1OnTraining: round.c1OnTraining, ...(round.size ? { size: round.size } : {}), ...(round.train ? { train: round.train } : {}),
                               ...(round.test ? { test: round.test } : {}), compareSize: round.compareSize ?? null, workers, harvest: true, cache, log: (m) => console.log("[denoiseStudy] " + m) });
        // disclosed beside the results: how much of this run was read back from an earlier, interrupted one
        if (cache) out.cache = { hits: cache.hits, misses: cache.misses };
        if (workers) out.workers = workers;
        fs.writeFileSync(file, JSON.stringify(out, (k, v) => (v instanceof Float64Array ? Array.from(v) : v), 1) + "\n");
        const H = out.verdict.hypotheses;
        console.log(`[denoiseStudy] run ${out.verdict.run}; H1 ${H.H1?.status ?? "not tested"}, H2 ${H.H2?.status ?? "not tested"} -> ${round.results}`);
    } else {
        console.log("usage: node tools/denoiseStudy.mjs --mini | --harvest-r10 | --harvest-r9 | --harvest-r8 | --harvest-r7 | --harvest-r6 | --harvest-r5 | --harvest-r4 | --harvest-r3 | --harvest-r2 | --harvest-r1 [--cache <dir>] [--workers <n>]   (a harvest renders the pre-registered dataset; see render/learned-denoiser-preregistration.md)");
        process.exit(2);
    }
}
