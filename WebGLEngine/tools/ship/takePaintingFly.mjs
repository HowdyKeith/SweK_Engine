// WebGLEngine/tools/ship/takePaintingFly.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE PAINTING FLY, ROUND 1: THE COMMAND (registered in brain/PAINTING_FLY_WIP.md; the arithmetic is tools/ship/paintingFly.mjs).
//
//   node tools/ship/takePaintingFly.mjs run [--jobs 4]   the 80 trainings (those brain/paintingFlyRound.jsonl does not hold yet), four processes at a time, a record a training appended as it ends;
//                                                         then FLY draw 1 a second time and the floors. PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takePaintingFly.mjs read             the checks and the reading, from the file
//   node tools/ship/takePaintingFly.mjs job ARM S        one training, its record on stdout (what `run` starts)
//
// About 25 s a training in the sandbox. tools/ship/paintingFly-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./paintingFly.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takePaintingFly.mjs run [--jobs N] | read | job ARM S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = PF.parseArgs(process.argv.slice(2));

function jobOnce(arm, s) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "job", arm, String(s)], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${arm} draw ${s} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${arm} draw ${s} printed no record (${e.message})`)); } });
    });
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") {
    process.stdout.write(JSON.stringify(PF.trainOne(args.arm, args.s)) + "\n");
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, have = linesOf(), done = new Set(have.filter((r) => r.kind === "draw").map((r) => r.arm + "/" + r.s));
    const todo = []; for (const s of PF.SEEDS) for (const arm of PF.ARMS) if (!done.has(arm + "/" + s)) todo.push([arm, s]);
    console.log(`${todo.length} trainings to run (${done.size} are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null; const t0 = Date.now();
    const worker = async () => { while (next < todo.length && !failed) { const [arm, s] = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${arm} draw ${s} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else {
        const now = linesOf();
        if (!now.some((r) => r.kind === "recheck")) { const r = await jobOnce("FLY", 1); fs.appendFileSync(FILE, JSON.stringify({ kind: "recheck", arm: "FLY", s: 1, weightsHash: r.weightsHash }) + "\n"); console.log("  FLY draw 1 trained a second time"); }
        if (!now.some((r) => r.kind === "floors")) { fs.appendFileSync(FILE, JSON.stringify(PF.floors()) + "\n"); console.log("  the floors"); }
        console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takePaintingFly.mjs read).`);
    }
}
