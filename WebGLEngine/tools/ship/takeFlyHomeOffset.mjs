// WebGLEngine/tools/ship/takeFlyHomeOffset.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// OFFSET AGAINST WOBBLE (WHICH HEADING ERROR DOES FINDING HOME FORGIVE?): THE COMMAND (registered in brain/FLY_HOME_OFFSET_WIP.md; the arithmetic is tools/ship/flyHomeOffset.mjs).
//
//   node tools/ship/takeFlyHomeOffset.mjs run [--jobs 3]   the three arms (those brain/flyHomeOffsetRound.jsonl does not hold yet), a process each, a record an arm appended as it ends;
//                                                         then OFFSET a second time. PRINTS NO SCORE: the file is committed before it is read. NOTHING IS TRAINED.
//   node tools/ship/takeFlyHomeOffset.mjs read     the checks and the reading, from the file
//   node tools/ship/takeFlyHomeOffset.mjs job ARM  one arm's 400 lives, its record on stdout (what `run` starts)
//
// About two minutes an arm in the sandbox. tools/ship/flyHomeOffset-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyHomeOffset.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyHomeOffset.mjs run [--jobs N] | read | job ARM";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = PF.parseArgs(process.argv.slice(2));

function jobOnce(arm) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "job", arm], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${arm} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${arm} printed no record (${e.message})`)); } });
    });
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") {
    process.stdout.write(JSON.stringify(PF.armRecord(args.arm)) + "\n");
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, have = linesOf(), done = new Set(have.filter((r) => r.kind === "arm").map((r) => r.arm));
    const todo = PF.ARMS.filter((a) => !done.has(a));
    console.log(`${todo.length} arms to fly (${done.size} are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null; const t0 = Date.now();
    const worker = async () => { while (next < todo.length && !failed) { const arm = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${arm} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else {
        if (!linesOf().some((r) => r.kind === "recheck")) { const r = await jobOnce(PF.LEAD); fs.appendFileSync(FILE, JSON.stringify(PF.recheckOf(r)) + "\n"); console.log("  OFFSET flown a second time"); }
        console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyHomeOffset.mjs read).`);
    }
}
