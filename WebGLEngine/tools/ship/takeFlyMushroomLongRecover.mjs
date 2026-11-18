// WebGLEngine/tools/ship/takeFlyMushroomLongRecover.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE RECOVERING FLY TRAINED FOUR TIMES LONGER (DOES IT REACH THE HAND RULE WHEN THE MEANINGS SWAP?): THE COMMAND (registered in brain/FLY_MUSHROOM_LONG_RECOVER_WIP.md; the arithmetic is
// tools/ship/flyMushroomLongRecover.mjs).
//
//   node tools/ship/takeFlyMushroomLongRecover.mjs run [--jobs 4]   the 24 trainings (those brain/flyMushroomLongRecoverRound.jsonl does not hold yet), that many processes at a time, a record a
//                                                         training appended as it ends; then REV RLONG draw 1 a second time and the floors. PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyMushroomLongRecover.mjs read     the checks and the reading, from the file and the committed recovery, mushroom trainer and mushroom rounds' files
//   node tools/ship/takeFlyMushroomLongRecover.mjs job TASK S  one training, its record on stdout (what `run` starts)
//
// About a minute a training in the sandbox (240 iterations of lives of 30 trials). tools/ship/flyMushroomLongRecover-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyMushroomLongRecover.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyMushroomLongRecover.mjs run [--jobs N] | read | job TASK S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const committedFiles = () => Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, PF.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const args = PF.parseArgs(process.argv.slice(2));

function jobOnce(task, s) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "job", task, String(s)], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${task} draw ${s} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${task} draw ${s} printed no record (${e.message})`)); } });
    });
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") {
    process.stdout.write(JSON.stringify(PF.trainOne(args.task, args.s)) + "\n");
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, have = linesOf(), done = new Set(have.filter((r) => r.kind === "draw").map((r) => r.task + "/" + r.s));
    const todo = []; for (const task of PF.TASKS) for (const s of PF.SEEDS) if (!done.has(task + "/" + s)) todo.push([task, s]);
    console.log(`${todo.length} trainings to run (${done.size} are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null; const t0 = Date.now();
    const worker = async () => { while (next < todo.length && !failed) { const [task, s] = todo[next++], t = Date.now(); try { const rec = await jobOnce(task, s); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${task} draw ${s} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else {
        const now = linesOf();
        if (!now.some((r) => r.kind === "recheck")) { const r = await jobOnce("REV", PF.SEEDS[0]); fs.appendFileSync(FILE, JSON.stringify({ kind: "recheck", task: "REV", arm: PF.LEAD, s: PF.SEEDS[0], weightsHash: r.weightsHash }) + "\n"); console.log("  REV draw 1 trained a second time"); }
        if (!now.some((r) => r.kind === "floors")) { fs.appendFileSync(FILE, JSON.stringify(PF.floors()) + "\n"); console.log("  the floors"); }
        console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyMushroomLongRecover.mjs read).`);
    }
}
