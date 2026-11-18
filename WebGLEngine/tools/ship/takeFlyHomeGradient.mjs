// WebGLEngine/tools/ship/takeFlyHomeGradient.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE HOMING FLY'S WALK ON 16 LIVES A FLY: THE COMMAND (registered in brain/FLY_HOME_GRADIENT_WIP.md; the arithmetic is tools/ship/flyHomeGradient.mjs).
//
//   node tools/ship/takeFlyHomeGradient.mjs run [--jobs N]   first the two checks of the machine (round 4's HOMEP draw 1 flown home again, and the homing round's floors, each to the
//                                                      committed numbers to the bit: it stops before any training if either fails), then the 12 trainings and the second training of draw 1
//                                                      (those brain/flyHomeGradientRound.jsonl does not hold yet), that many processes at a time, a record a job appended as it ends.
//                                                      PRINTS NO SCORE: the file is committed before it is read. Stopped part way, run it again: it goes on.
//   node tools/ship/takeFlyHomeGradient.mjs read     the checks and the reading, from the file and round 4's committed files
//   node tools/ship/takeFlyHomeGradient.mjs job ARM S   one training, its record on stdout (what `run` starts)
//
// About an hour a training in the sandbox; the checks of the machine about 2.5 minutes. tools/ship/flyHomeGradient-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyHomeGradient.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyHomeGradient.mjs run [--jobs N] | read | job ARM S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const committedFiles = () => Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, PF.fileOf(fs.readFileSync(path.join(ENG, f)))]));
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
else if (args.cmd === "job") process.stdout.write(JSON.stringify(PF.trainOne(args.s)) + "\n");
else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, t0 = Date.now(), F = committedFiles();
    let stop = null;
    // the machine first: a record is appended only if it is the committed numbers to the bit
    if (!linesOf().some((r) => r.kind === "refly")) { const r = PF.reflyOne(F.trained); if (!PF.reflyHolds(r, F)) stop = `this machine does not fly round 4's HOMEP draw ${PF.REFLY_S} home to its committed score to the bit`; else { fs.appendFileSync(FILE, JSON.stringify(r) + "\n"); console.log(`  the machine flies round 4's HOMEP draw ${PF.REFLY_S} home to the bit`); } }
    if (!stop && !linesOf().some((r) => r.kind === "floors")) { const r = PF.floors(); if (!PF.floorsHold(r, F)) stop = "this machine does not fly the homing round's floors to its committed floors to the bit"; else { fs.appendFileSync(FILE, JSON.stringify(r) + "\n"); console.log("  the machine flies the homing round's floors to the bit"); } }
    if (stop) { console.error(`stopped before any training: ${stop}. Nothing of this round's is worth running here.`); process.exitCode = 1; }
    else {
        const have = linesOf(), done = new Set(have.filter((r) => r.kind === "draw").map((r) => r.arm + "/" + r.s)), rechecked = have.some((r) => r.kind === "recheck");
        const todo = PF.SEEDS.filter((s) => !done.has(PF.LEAD + "/" + s)).map((s) => [PF.LEAD, s, false]);
        if (!rechecked) todo.splice(Math.min(1, todo.length), 0, [PF.LEAD, PF.SEEDS[0], true]);
        console.log(`${todo.length} trainings to run (${done.size} draws ${rechecked ? "and the second training " : ""}in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
        let next = 0, failed = null;
        const worker = async () => { while (next < todo.length && !failed) { const [arm, s, again] = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s);
            fs.appendFileSync(FILE, JSON.stringify(again ? { kind: "recheck", arm, s, weightsHash: rec.weightsHash, pointsHash: rec.pointsHash } : rec) + "\n"); console.log(`  ${arm} draw ${s}${again ? " a second time" : ""} done (${((Date.now() - t) / 60000).toFixed(1)} min)`); } catch (e) { failed = e; } } };
        await Promise.all(Array.from({ length: jobs }, worker));
        if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
        else console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyHomeGradient.mjs read).`);
    }
}
