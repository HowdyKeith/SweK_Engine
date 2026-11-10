// WebGLEngine/tools/ship/trainMlp6dofLuck.mjs -- UNNUMBERED
//
// THE COMMAND for tools/ship/train6dofMlpLuck.mjs (the library the gate holds): Round 4 of the GPU Brain's 6-DOF arc, "network or luck", as brain/SIXDOF_GPU_BRAIN_WIP.md registers it.
//
//     node tools/ship/trainMlp6dofLuck.mjs [--workers 4]                                 # the registered round: writes brain/sixdofGpuLuckResults.json (never overwrites it) and prints only where it is
//     node tools/ship/trainMlp6dofLuck.mjs --search <seed> --brain fly|mlp [--iters N]   # one search of one brain, its JSON on stdout (what a worker runs)
//
// *** THE RESULTS ARE NOT PRINTED. *** The registration commits the results file byte for byte before anyone reads it. Nothing else is written, whatever H1 reads. NO EXPORTS ON PURPOSE.
"use strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, run, searchOne, refuseExisting, serialize } from "./train6dofMlpLuck.mjs";

const SELF = fileURLToPath(import.meta.url);
let opts; try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("trainMlp6dofLuck: " + e.message); process.exit(2); }
if (opts.search != null) { process.stdout.write(JSON.stringify(searchOne({ brain: opts.brain, seed: opts.search, iters: opts.iters, sigma: opts.sigma, maxK: opts.maxK })) + "\n"); process.exit(0); }
const refused = refuseExisting(opts.results); if (refused) { console.error("trainMlp6dofLuck: " + refused); process.exit(2); }

/** The searches in `workers` processes at a time, each this command's own --search mode: the same answer to the bit as one after another (each search is deterministic for its brain and seed). */
const parallel = (workers) => async (jobs) => {
    const out = new Array(jobs.length); let next = 0;
    const one = (k) => new Promise((resolve, reject) => {
        const args = [SELF, "--search", String(jobs[k].seed), "--brain", jobs[k].brain, "--iters", String(jobs[k].iters), "--sigma", String(jobs[k].sigma)], child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] });
        let buf = ""; child.stdout.on("data", (d) => { buf += d; });
        child.on("close", (code) => { if (code !== 0) return reject(new Error(`search ${jobs[k].brain} ${jobs[k].seed} exited ${code}`)); out[k] = JSON.parse(buf); resolve(); });
    });
    const lane = async () => { while (next < jobs.length) await one(next++); };
    await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, lane));
    return out;
};
const result = await run(opts, parallel(Math.max(1, opts.workers)));
fs.writeFileSync(opts.results, serialize(result));
console.log(`wrote ${opts.results}${result.stopped ? " (stopped: " + result.stopped + ")" : ""} -- commit it before reading it`);
process.exit(0);
