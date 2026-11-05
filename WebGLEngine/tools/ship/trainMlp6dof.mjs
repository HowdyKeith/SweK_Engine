// WebGLEngine/tools/ship/trainMlp6dof.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/train6dofMlp.mjs (the library the gate holds): the GPU Brain's space-duel pilot trained by the fruit fly's Default recipe, as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
//
//     node tools/ship/trainMlp6dof.mjs [--workers 4]                 # the registered round: writes brain/sixdofGpuBrainResults.json (never overwrites it) and prints only where it is
//     node tools/ship/trainMlp6dof.mjs --runs 2 --iters 40 --results <file>   # smaller, to any file
//     node tools/ship/trainMlp6dof.mjs --search <seed> [--iters N]   # one search, its JSON on stdout (what a worker runs)
//     node tools/ship/trainMlp6dof.mjs --write-from <results>        # write brain/pilot6dofMlpWeightsDefault.json from a committed results file, only if its champion qualified
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it, so this command writes it and says where; the scores are read from the committed file. The weight
// file is a SEPARATE step from that file, so writing it cannot happen before the results are committed either.
//
// NO EXPORTS ON PURPOSE: a command-line entry point, as tools/ship/trainPilot6dof.mjs is. Its door is the command.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseOrExit } from "./cliArgs.mjs";
import { parseArgs, run, searchOne, blobOf, refuseExisting } from "./train6dofMlp.mjs";
import { weightsHash } from "../../brain/drivePolicy.mjs";

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
if (argv.includes("--write-from")) {
    // 2026-11-05 -- the --write-from mode reads its two options through cliArgs (an unknown or misspelt option is refused, never a silent default), as the rest of the tools do since v4826
    const cli = parseOrExit("trainMlp6dof", { values: { "--write-from": "string", "--out": "string" }, flags: [] }, argv);
    const file = cli.values["--write-from"], out = cli.values["--out"] || path.resolve(path.dirname(SELF), "..", "..", "brain", "pilot6dofMlpWeightsDefault.json");
    if (!file || !fs.existsSync(file)) { console.error("trainMlp6dof: --write-from needs a results file"); process.exit(2); }
    const result = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!result.verdict || !result.verdict.ok) { console.log("not written: the champion did not qualify -- " + ((result.verdict && result.verdict.reasons) || ["no verdict in the file"]).join("; ")); process.exit(1); }
    const blob = blobOf(result); fs.writeFileSync(out, JSON.stringify(blob) + "\n");
    console.log(`wrote ${out}: ${blob.weightCount} weights, hash ${weightsHash(Float32Array.from(result.champion.weights))}`);
    process.exit(0);
}

parseOrExit("trainMlp6dof", { values: { "--runs": "number", "--iters": "number", "--seed": "number", "--sigma": "number", "--workers": "number", "--search": "number", "--out": "string", "--results": "string" }, flags: ["--write", "--quiet"] }, argv);   // 2026-11-05 -- the command line is checked by cliArgs first (an option nobody has spelled is refused with the options this tool takes, never a default); the library parser then reads the values
let opts; try { opts = parseArgs(argv); } catch (e) { console.error("trainMlp6dof: " + e.message); process.exit(2); }
if (opts.search != null) { process.stdout.write(JSON.stringify(searchOne({ seed: opts.search, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK })) + "\n"); process.exit(0); }
const refused = refuseExisting(opts.results); if (refused) { console.error("trainMlp6dof: " + refused); process.exit(2); }

/** The searches in `workers` processes at a time, each this command's own --search mode: the same answer to the bit as one after another (each search is deterministic for its seed). */
const parallel = (workers) => async (seeds) => {
    const out = new Array(seeds.length); let next = 0;
    const one = (k) => new Promise((resolve, reject) => {
        const args = [SELF, "--search", String(seeds[k]), "--iters", String(opts.iters), "--sigma", String(opts.sigma)], child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] });
        let buf = ""; child.stdout.on("data", (d) => { buf += d; });
        child.on("close", (code) => { if (code !== 0) return reject(new Error(`search ${seeds[k]} exited ${code}`)); out[k] = JSON.parse(buf); if (!opts.quiet) console.log(`  search seed ${seeds[k]} done in ${(out[k].ms / 1000).toFixed(0)} s`); resolve(); });
    });
    const lane = async () => { while (next < seeds.length) await one(next++); };
    await Promise.all(Array.from({ length: Math.min(workers, seeds.length) }, lane));
    return out;
};
const progress = opts.quiet ? () => {} : (m) => { if (/^C-twin/.test(m)) console.log(m.replace(/ on .*$/, " -- checked")); };
const result = await run(opts, progress, opts.workers > 1 ? parallel(opts.workers) : undefined);
fs.writeFileSync(opts.results, JSON.stringify(result, null, 1) + "\n");
console.log(`wrote ${opts.results}${result.stopped ? " (stopped: " + result.stopped + ")" : ""} -- commit it before reading it`);
