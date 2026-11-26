// WebGLEngine/tools/ship/takeFlyHomeCoursePredicts.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES HOLDING A COURSE PREDICT FINDING HOME? THE COMMAND (registered in brain/FLY_HOME_COURSE_PREDICTS_WIP.md; the arithmetic is tools/ship/flyHomeCoursePredicts.mjs).
//
//   node tools/ship/takeFlyHomeCoursePredicts.mjs run [--jobs N]   the 24 walks' points flown home and on the course, and the HOMEP walk of draw 1 a second time (those
//                                                      brain/flyHomeCoursePredictsRound.jsonl does not hold yet), that many processes at a time, a record a job appended as it ends.
//                                                      PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyHomeCoursePredicts.mjs read     the checks and the reading, from the file and the committed rounds' files
//   node tools/ship/takeFlyHomeCoursePredicts.mjs job ARM S   one walk's points flown (ARM is the walk set, HOMEP or HOME16), its record on stdout (what `run` starts)
//
// About 6 minutes a job in the sandbox. tools/ship/flyHomeCoursePredicts-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyHomeCoursePredicts.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyHomeCoursePredicts.mjs run [--jobs N] | read | job ARM S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const committedFiles = () => Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, PF.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const args = PF.parseArgs(process.argv.slice(2));

function jobOnce(set, s) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "job", set, String(s)], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${set} draw ${s} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${set} draw ${s} printed no record (${e.message})`)); } });
    });
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") process.stdout.write(JSON.stringify(PF.flyWalk(args.arm, args.s, committedFiles())) + "\n");
else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, t0 = Date.now(), have = linesOf(), done = new Set(have.filter((r) => r.kind === "walk").map((r) => r.set + "/" + r.s)), rechecked = have.some((r) => r.kind === "recheck");
    const todo = []; for (const set of PF.SETS) for (const s of PF.SEEDS) if (!done.has(set + "/" + s)) todo.push([set, s, false]);
    if (!rechecked) todo.splice(Math.min(1, todo.length), 0, ["HOMEP", PF.SEEDS[0], true]);
    console.log(`${todo.length} jobs to run (${done.size} walks in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null;
    const worker = async () => { while (next < todo.length && !failed) { const [set, s, again] = todo[next++], t = Date.now(); try { const rec = await jobOnce(set, s);
        fs.appendFileSync(FILE, JSON.stringify(again ? { kind: "recheck", set, s, flies: rec.flies } : rec) + "\n"); console.log(`  ${set} draw ${s}${again ? " a second time" : ""} done (${((Date.now() - t) / 60000).toFixed(1)} min)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyHomeCoursePredicts.mjs read).`);
}
