// WebGLEngine/tools/ship/takeFlyHome.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE FLY FINDS HOME (DOES THE COMPASS IT LEARNED CARRY IT BACK TO ITS DOOR?): THE COMMAND (registered in brain/FLY_FINDS_HOME_WIP.md; the arithmetic is tools/ship/flyHome.mjs).
//
//   node tools/ship/takeFlyHome.mjs run [--jobs 4]   the 60 audits of committed flies (those brain/flyHomeRound.jsonl does not hold yet), four processes at a time, a record an audit
//                                                         appended as it ends; then PLASTIC draw 1 a second time and the floors. NOTHING IS TRAINED. PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyHome.mjs read     the checks and the reading, from the file and the two committed files it audits (brain/flyCompassRound.jsonl, brain/flyCompassBalancedRound.jsonl)
//   node tools/ship/takeFlyHome.mjs job ARM S  one audit, its record on stdout (what `run` starts)
//
// About 30 to 45 seconds an audit in the sandbox (200 lives of 1,500 ticks). tools/ship/flyHome-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyHome.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlyHome.mjs run [--jobs N] | read | job ARM S";
const linesOf = () => (fs.existsSync(FILE) ? fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const args = PF.parseArgs(process.argv.slice(2));
const committedFiles = () => [PF.fileOf(fs.readFileSync(path.join(ENG, PF.COMPASS))), PF.fileOf(fs.readFileSync(path.join(ENG, PF.BALANCED)))];

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
    process.stdout.write(JSON.stringify(PF.auditOne(args.arm, args.s, ...committedFiles())) + "\n");
} else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), ...committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, have = linesOf(), done = new Set(have.filter((r) => r.kind === "fly").map((r) => r.arm + "/" + r.s));
    const todo = []; for (const s of PF.SEEDS) for (const arm of PF.ARMS) if (!done.has(arm + "/" + s)) todo.push([arm, s]);
    console.log(`${todo.length} audits to run (${done.size} are in ${PF.RESULTS}), ${jobs} at a time; no score is printed`);
    let next = 0, failed = null; const t0 = Date.now();
    const worker = async () => { while (next < todo.length && !failed) { const [arm, s] = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s); fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${arm} draw ${s} done (${((Date.now() - t) / 1000).toFixed(0)} s)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else {
        const now = linesOf();
        if (!now.some((r) => r.kind === "recheck")) { const r = await jobOnce(PF.LEAD, PF.SEEDS[0]); fs.appendFileSync(FILE, JSON.stringify({ kind: "recheck", arm: PF.LEAD, s: PF.SEEDS[0], home: r.home }) + "\n"); console.log("  the lead arm's first draw audited a second time"); }
        if (!now.some((r) => r.kind === "floors")) { fs.appendFileSync(FILE, JSON.stringify(PF.floors()) + "\n"); console.log("  the floors"); }
        console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyHome.mjs read).`);
    }
}
