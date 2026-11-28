// WebGLEngine/tools/ship/takeFlyTallyShare.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// DOES THE FLY'S OWN TALLY KEEP A FIXED SHARE OF THE PERFECT TALLY'S HOME? THE COMMAND (registered in brain/FLY_TALLY_SHARE_WIP.md; the arithmetic is tools/ship/flyTallyShare.mjs).
//
//   node tools/ship/takeFlyTallyShare.mjs run [--jobs N]   the 48 flies each flown four ways on the 200 fresh lives, HOMEP draw 1 a second time, and HOMEP draw 1 four ways on the
//                                                      OLD audit lives (the reproduction the checks compare to the committed rounds) (those
//                                                      brain/flyTallyShareRound.jsonl does not hold yet), that many processes at a time, a record a job appended as it ends.
//                                                      PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyTallyShare.mjs read     the checks and the reading, from the file and the committed rounds' files
//   node tools/ship/takeFlyTallyShare.mjs job ARM S   one fly flown four ways on the fresh lives (ARM is HOMEP, COURSE64, HOME16 or H16BYC), or `job REPRODUCE 1` the reproduction; its record on stdout (what `run` starts)
//
// About 150 seconds a job in the sandbox. tools/ship/flyTallyShare-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyTallyShare.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyTallyShare.mjs run [--jobs N] | read | job ARM S | job REPRODUCE 1";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const committedFiles = () => Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, PF.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const raw = process.argv.slice(2), isRep = raw[0] === "job" && raw[1] === "REPRODUCE" && raw[2] === "1";
const args = isRep ? { cmd: "reproduce" } : PF.parseArgs(raw);

function jobOnce(arm, s) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), "job", arm, String(s)], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${arm} draw ${s} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${arm} draw ${s} printed no record (${e.message})`)); } });
    });
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "reproduce") process.stdout.write(JSON.stringify(PF.reproduceOne(committedFiles())) + "\n");
else if (args.cmd === "job") process.stdout.write(JSON.stringify(PF.flyOne(args.arm, args.s, committedFiles())) + "\n");
else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, t0 = Date.now(), have = linesOf(), done = new Set(have.filter((r) => r.kind === "fly").map((r) => r.arm + "/" + r.s)), rechecked = have.some((r) => r.kind === "recheck"); const reproduced = have.some((r) => r.kind === "reproduce");
    const todo = []; for (const arm of PF.ARMS) for (const s of PF.SEEDS) if (!done.has(arm + "/" + s)) todo.push([arm, s, false]);
    if (!rechecked) todo.splice(Math.min(1, todo.length), 0, ["HOMEP", PF.SEEDS[0], true]);
    if (!reproduced) todo.unshift(["REPRODUCE", 1, false]);
    console.log(`${todo.length} jobs to run (${done.size} flies in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null;
    const worker = async () => { while (next < todo.length && !failed) { const [arm, s, again] = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s);
        fs.appendFileSync(FILE, JSON.stringify(again ? { kind: "recheck", arm, s, ownPlain: rec.ownPlain, ownType: rec.ownType, truePlain: rec.truePlain, trueType: rec.trueType } : rec) + "\n"); console.log(`  ${arm} draw ${s}${again ? " a second time" : ""} done (${((Date.now() - t) / 60000).toFixed(1)} min)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyTallyShare.mjs read).`);
}
