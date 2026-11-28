// WebGLEngine/tools/ship/takeFlyTallyCorrect.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// CAN THE FLY'S TALLY LEARN FROM ITS COMPASS'S CORRECTIONS? THE COMMAND (registered in brain/FLY_TALLY_CORRECT_WIP.md; the arithmetic is tools/ship/flyTallyCorrect.mjs).
//
//   node tools/ship/takeFlyTallyCorrect.mjs dev [--jobs N]   the 48 flies on the 50 DEV lives at each of the 20 settings (those brain/flyTallyCorrectDev.jsonl does not hold yet), then the
//                                                         choice line. PRINTS THE CHOICE AND NOTHING ELSE: the DEV file is committed before HELD is flown.
//   node tools/ship/takeFlyTallyCorrect.mjs run [--jobs N]   HELD at the committed DEV file's choice: the setting line, g 0 against today's tally, the 48 flies five ways on 200 lives,
//                                                         HOMEP draw 1 a second time (those brain/flyTallyCorrectRound.jsonl does not hold yet). PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlyTallyCorrect.mjs read          the checks and the reading
//   node tools/ship/takeFlyTallyCorrect.mjs job ARM S | devjob ARM S | zerojob   one job's record on stdout (what `dev` and `run` start)
//
// About 2 minutes a DEV job and 3 a HELD job in the sandbox. tools/ship/flyTallyCorrect-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flyTallyCorrect.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS), DEVFILE = path.join(ENG, PF.DEV_RESULTS);
const USAGE = "usage: node tools/ship/takeFlyTallyCorrect.mjs dev [--jobs N] | run [--jobs N] | read | job ARM S | devjob ARM S | zerojob";
const linesOf = (f) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const committedFiles = () => Object.fromEntries(Object.entries(PF.FILES).map(([k, f]) => [k, PF.fileOf(fs.readFileSync(path.join(ENG, f)))]));
const args = PF.parseArgs(process.argv.slice(2));

function jobOnce(argv) {
    return new Promise((resolve, reject) => {
        const c = spawn(process.execPath, [fileURLToPath(import.meta.url), ...argv], { stdio: ["ignore", "pipe", "inherit"] }); let out = "";
        c.stdout.on("data", (d) => { out += d; });
        c.on("error", reject);
        c.on("close", (code) => { if (code !== 0) return reject(new Error(`${argv.join(" ")} ended with ${code}`)); try { resolve(JSON.parse(out)); } catch (e) { reject(new Error(`${argv.join(" ")} printed no record (${e.message})`)); } });
    });
}
async function pool(todo, jobs, file, label) {
    let next = 0, failed = null;
    const worker = async () => { while (next < todo.length && !failed) { const [argv, wrapRec] = todo[next++], t = Date.now(); try { const rec = await jobOnce(argv);
        fs.appendFileSync(file, JSON.stringify(wrapRec ? wrapRec(rec) : rec) + "\n"); console.log(`  ${label} ${argv.slice(1).join(" ")} done (${((Date.now() - t) / 60000).toFixed(1)} min)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    return failed;
}

if (!args || ((args.cmd === "run" || args.cmd === "dev") && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "devjob") process.stdout.write(JSON.stringify(PF.devOne(args.arm, args.s, committedFiles())) + "\n");
else if (args.cmd === "zerojob") process.stdout.write(JSON.stringify(PF.zeroOne(committedFiles())) + "\n");
else if (args.cmd === "job") { const at = linesOf(DEVFILE).find((r) => r.kind === "choice"); process.stdout.write(JSON.stringify(PF.heldOne(args.arm, args.s, committedFiles(), at)) + "\n"); }
else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(FILE), linesOf(DEVFILE), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else if (args.cmd === "dev") {
    const have = linesOf(DEVFILE);
    if (have.some((r) => r.kind === "choice")) { console.error(`${PF.DEV_RESULTS} already holds its choice: DEV is flown once`); process.exitCode = 2; }
    else {
        const done = new Set(have.filter((r) => r.kind === "dev").map((r) => r.arm + "/" + r.s)), todo = [];
        for (const arm of PF.ARMS) for (const s of PF.SEEDS) if (!done.has(arm + "/" + s)) todo.push([["devjob", arm, String(s)], null]);
        console.log(`${todo.length} DEV jobs to run, ${args.jobs} at a time; only the choice is printed`);
        const failed = await pool(todo, args.jobs, DEVFILE, "DEV");
        if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
        else { const ch = PF.choose(linesOf(DEVFILE)); fs.appendFileSync(DEVFILE, JSON.stringify({ kind: "choice", g: ch.g, tau: ch.tau, means: ch.means }) + "\n");
            console.log(`chosen on DEV: g ${ch.g}, tau ${ch.tau}. Commit ${PF.DEV_RESULTS} before flying HELD (node tools/ship/takeFlyTallyCorrect.mjs run).`); }
    }
} else {
    const dev = linesOf(DEVFILE), db = PF.checkDev(dev, committedFiles());
    if (db.length) { console.error(`the DEV file is not ready: ${db[0]}`); process.exitCode = 1; }
    else {
        const at = dev.find((r) => r.kind === "choice"), have = linesOf(FILE), t0 = Date.now();
        if (!have.some((r) => r.kind === "held")) fs.appendFileSync(FILE, JSON.stringify({ kind: "held", g: at.g, tau: at.tau }) + "\n");
        const done = new Set(have.filter((r) => r.kind === "fly").map((r) => r.arm + "/" + r.s)), todo = [];
        if (!have.some((r) => r.kind === "zero")) todo.push([["zerojob"], null]);
        for (const arm of PF.ARMS) for (const s of PF.SEEDS) if (!done.has(arm + "/" + s)) todo.push([["job", arm, String(s)], null]);
        if (!have.some((r) => r.kind === "recheck")) todo.splice(Math.min(2, todo.length), 0, [["job", "HOMEP", String(PF.SEEDS[0])], (rec) => ({ kind: "recheck", arm: rec.arm, s: rec.s, ownType: rec.ownType, corrType: rec.corrType, ownPlain: rec.ownPlain, corrPlain: rec.corrPlain, trueType: rec.trueType })]);
        console.log(`${todo.length} HELD jobs to run at g ${at.g}, tau ${at.tau}, ${args.jobs} at a time; no score is printed`);
        const failed = await pool(todo, args.jobs, FILE, "HELD");
        if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
        else console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlyTallyCorrect.mjs read).`);
    }
}
