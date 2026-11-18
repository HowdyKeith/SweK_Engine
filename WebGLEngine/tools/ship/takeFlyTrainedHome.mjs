// WebGLEngine/tools/ship/takeFlyTrainedHome.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// TRAINED TO FIND HOME (DOES A COMPASS FLY TRAINED FOR HOMING DO BETTER THAN ONE TRAINED TO HOLD A COURSE?): THE COMMAND (registered in brain/FLY_TRAINED_HOME_WIP.md; the arithmetic is tools/ship/flyTrainedHome.mjs).
//
//   node tools/ship/takeFlyTrainedHome.mjs run [--jobs 4]   the 24 trainings and 12 COURSE64 audits (those brain/flyTrainedHomeRound.jsonl does not hold yet), four processes at a time,
//                                                         the trainings first, a record each appended as it ends; then HOMEP draw 1 a second time and the floors. PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyTrainedHome.mjs read     the checks and the reading, from the file and the committed brain/flyHomeRound.jsonl and brain/flyCompassTrainerRound.jsonl
//                                                         (and the compass and balanced rounds' files they are checked against)
//   node tools/ship/takeFlyTrainedHome.mjs job ARM S  one training (HOMEP, HOMES) or audit (COURSE64), its record on stdout (what `run` starts)
//
// About 25 minutes a training in the sandbox, four at a time (a life is 1,500 ticks; 64 battery lives an iteration). tools/ship/flyTrainedHome-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyTrainedHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyTrainedHome.mjs run [--jobs N] | read | job ARM S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = PF.parseArgs(process.argv.slice(2));
const committedFiles = () => Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, PF.fileOf(fs.readFileSync(path.join(ENG, f)))]));

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
    process.stdout.write(JSON.stringify(args.arm === "COURSE64" ? PF.courseOne(args.s, committedFiles().trainer) : PF.trainOne(args.arm, args.s)) + "\n");
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, have = linesOf(), done = new Set(have.filter((r) => r.kind === "draw" || r.kind === "fly").map((r) => r.arm + "/" + r.s));
    const todo = []; for (const arm of PF.ARMS) for (const s of PF.SEEDS) if (!done.has(arm + "/" + s)) todo.push([arm, s]);
    console.log(`${todo.length} trainings and audits to run (${done.size} are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null; const t0 = Date.now();
    const worker = async () => { while (next < todo.length && !failed) { const [arm, s] = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${arm} draw ${s} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else {
        const now = linesOf();
        if (!now.some((r) => r.kind === "recheck")) { const r = await jobOnce(PF.LEAD, PF.SEEDS[0]); fs.appendFileSync(FILE, JSON.stringify({ kind: "recheck", arm: PF.LEAD, s: PF.SEEDS[0], weightsHash: r.weightsHash }) + "\n"); console.log("  the lead arm's first draw trained a second time"); }
        if (!now.some((r) => r.kind === "floors")) { fs.appendFileSync(FILE, JSON.stringify(PF.floors()) + "\n"); console.log("  the floors"); }
        console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyTrainedHome.mjs read).`);
    }
}
