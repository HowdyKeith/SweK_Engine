// WebGLEngine/tools/ship/trainMlp6dofClose.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/train6dofMlpClose.mjs (the library the gate holds): Round 3 of the GPU Brain's 6-DOF arc, as brain/SIXDOF_GPU_BRAIN_WIP.md registers it -- the close-quarters recipe.
//
//     node tools/ship/trainMlp6dofClose.mjs [--workers 5]              # the registered round: writes brain/sixdofGpuCloseResults.json (never overwrites it) and prints only where it is
//     node tools/ship/trainMlp6dofClose.mjs --search <seed> [--iters N] # one search, its JSON on stdout (what a worker runs)
//     node tools/ship/trainMlp6dofClose.mjs --write-from <results>      # write brain/pilot6dofMlpWeightsClose.json from a committed results file, only if its champion qualified
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it. The weight file is a SEPARATE step from that file. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, run, searchOne, blobOf, refuseExisting, DEFAULT_OUT } from "./train6dofMlpClose.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2), wf = argv.indexOf("--write-from");
if (wf >= 0) {
    const file = argv[wf + 1], outAt = argv.indexOf("--out"), out = outAt >= 0 ? argv[outAt + 1] : DEFAULT_OUT;
    if (!file || !fs.existsSync(file)) { console.error("trainMlp6dofClose: --write-from needs a results file"); process.exit(2); }
    const result = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!result.verdict || !result.verdict.ok) { console.log("not written: the champion did not qualify -- " + ((result.verdict && result.verdict.reasons) || ["no verdict in the file"]).join("; ")); process.exit(1); }
    const blob = blobOf(result); fs.writeFileSync(out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${out}: ${blob.weightCount} weights, hash ${weightsHash(Float32Array.from(result.champion.weights))}`);
    process.exit(0);
}

let opts; try { opts = parseArgs(argv); } catch (e) { console.error("trainMlp6dofClose: " + e.message); process.exit(2); }
if (opts.search != null) { process.stdout.write(JSON.stringify(searchOne({ seed: opts.search, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK, train: opts.train })) + "\n"); process.exit(0); }
const refused = refuseExisting(opts.results); if (refused) { console.error("trainMlp6dofClose: " + refused); process.exit(2); }

/** The searches in `workers` processes at a time, each this command's own --search mode: the same answer to the bit as one after another (each search is deterministic for its seed). */
const parallel = (workers) => async (seeds) => {
    const out = new Array(seeds.length); let next = 0;
    const one = (k) => new Promise((resolve, reject) => {
        const args = [SELF, "--search", String(seeds[k]), "--iters", String(opts.iters), "--sigma", String(opts.sigma), "--train", String(opts.train)], child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] });
        let buf = ""; child.stdout.on("data", (d) => { buf += d; });
        child.on("close", (code) => { if (code !== 0) return reject(new Error(`search ${seeds[k]} exited ${code}`)); out[k] = JSON.parse(buf); resolve(); });
    });
    const lane = async () => { while (next < seeds.length) await one(next++); };
    await Promise.all(Array.from({ length: Math.min(workers, seeds.length) }, lane));
    return out;
};
const result = await run(opts, parallel(Math.max(1, opts.workers)));
fs.writeFileSync(opts.results, JSON.stringify(result, null, 1) + "\n");
console.log(`wrote ${opts.results}${result.stopped ? " (stopped: " + result.stopped + ")" : ""} -- commit it before reading it`);
process.exit(0);
