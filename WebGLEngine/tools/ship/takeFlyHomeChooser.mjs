// WebGLEngine/tools/ship/takeFlyHomeChooser.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CHOOSING THE HOMING FLY'S POINT (ON 256 LIVES, OR BY ITS COURSE SCORE?): THE COMMAND (registered in brain/FLY_HOME_CHOOSER_WIP.md; the arithmetic is tools/ship/flyHomeChooser.mjs).
//
//   node tools/ship/takeFlyHomeChooser.mjs run [--jobs 4]   the 12 walks, then the 24 choices (those brain/flyHomeChooserRound.jsonl does not hold yet), that many processes at a time, a
//                                                      record a job appended as it ends. PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyHomeChooser.mjs read     the checks and the reading, from the file and round 4's committed files
//   node tools/ship/takeFlyHomeChooser.mjs job ARM S   one job, its record on stdout (what `run` starts): ARM is WALK, or a chooser, which reads its draw's walk from the file
//
// About half an hour a walk, 50 minutes a choice on 256 lives and 17 by the course score, in the sandbox. tools/ship/flyHomeChooser-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyHomeChooser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyHomeChooser.mjs run [--jobs N] | read | job ARM S";
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
async function phase(todo, jobs) {
    let next = 0, failed = null;
    const worker = async () => { while (next < todo.length && !failed) { const [arm, s] = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${arm} draw ${s} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker)); return failed;
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") {
    if (args.arm === "WALK") process.stdout.write(JSON.stringify(PF.walkOne(args.s)) + "\n");
    else { const walk = linesOf().find((r) => r.kind === "walk" && r.s === args.s); if (!walk) { console.error(`the walk of draw ${args.s} is not in ${PF.RESULTS}`); process.exitCode = 1; } else process.stdout.write(JSON.stringify(PF.chooseOne(args.arm, args.s, walk)) + "\n"); }
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, t0 = Date.now(), have = linesOf();
    const walked = new Set(have.filter((r) => r.kind === "walk").map((r) => r.s)), chosen = new Set(have.filter((r) => r.kind === "draw").map((r) => r.arm + "/" + r.s));
    const walks = PF.SEEDS.filter((s) => !walked.has(s)).map((s) => ["WALK", s]), choices = []; for (const s of PF.SEEDS) for (const arm of PF.ARMS) if (!chosen.has(arm + "/" + s)) choices.push([arm, s]);
    console.log(`${walks.length} walks and ${choices.length} choices to run (${walked.size} walks and ${chosen.size} choices are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    const failed = (await phase(walks, jobs)) || (await phase(choices, jobs));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyHomeChooser.mjs read).`);
}
