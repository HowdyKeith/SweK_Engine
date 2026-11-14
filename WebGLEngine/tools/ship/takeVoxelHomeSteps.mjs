// WebGLEngine/tools/ship/takeVoxelHomeSteps.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE VOXEL HOME, ROUND 5 (THE TRAINER'S STEP AND ITS SAMPLES): THE COMMAND (registered in brain/VOXEL_HOME_STEPS_WIP.md; the arithmetic is tools/ship/voxelHomeSteps.mjs).
//
//   node tools/ship/takeVoxelHomeSteps.mjs run [--jobs 4]       the 64 trainings (those brain/voxelHomeStepsRound.jsonl does not hold yet), four processes at a time, a record a training appended as it ends;
//                                                               then SMALL FLY draw 1 a second time. It prints no score. Stopped, it goes on where it was.
//   node tools/ship/takeVoxelHomeSteps.mjs read                 the checks and the reading, from the file and round 2's
//   node tools/ship/takeVoxelHomeSteps.mjs job SETTING ARM S    one training, its record on stdout (what `run` starts)
//
// SMALL about 8 s a training in the sandbox, MANY about 30. tools/ship/voxelHomeSteps-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./voxelHomeSteps.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeVoxelHomeSteps.mjs run [--jobs N] | read | job SETTING ARM S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = PF.parseArgs(process.argv.slice(2));

function jobOnce(setting, arm, s) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "job", setting, arm, String(s)], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${setting} ${arm} draw ${s} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${setting} ${arm} draw ${s} printed no record (${e.message})`)); } });
    });
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") {
    process.stdout.write(JSON.stringify(PF.trainOne(args.setting, args.arm, args.s)) + "\n");
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const BEFORE_FILE = path.join(ENG, PF.BEFORE), before = fs.existsSync(BEFORE_FILE) ? fs.readFileSync(BEFORE_FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];   // round 2's records: the control
        const R = PF.reading(linesOf(), before); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, have = linesOf(), done = new Set(have.filter((r) => r.kind === "draw").map((r) => r.setting + "/" + r.arm + "/" + r.s));
    const todo = []; for (const [setting, arm] of PF.CELLS) for (const s of PF.SEEDS) if (!done.has(setting + "/" + arm + "/" + s)) todo.push([setting, arm, s]);
    console.log(`${todo.length} trainings to run (${done.size} are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null; const t0 = Date.now();
    const worker = async () => { while (next < todo.length && !failed) { const [setting, arm, s] = todo[next++], t = Date.now(); try { const rec = await jobOnce(setting, arm, s); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${setting} ${arm} draw ${s} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else {
        const now = linesOf();
        if (!now.some((r) => r.kind === "recheck")) { const r = await jobOnce("SMALL", "FLY", 1); fs.appendFileSync(FILE, JSON.stringify({ kind: "recheck", setting: "SMALL", arm: "FLY", s: 1, weightsHash: r.weightsHash }) + "\n"); console.log("  SMALL FLY draw 1 trained a second time"); }
        console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeVoxelHomeSteps.mjs read).`);
    }
}
