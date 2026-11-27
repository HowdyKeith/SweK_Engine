// WebGLEngine/tools/ship/takeFlySceneLift.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// THE 26-TYPE SCENE'S LIFT: THE COMMAND (registered in brain/FLY_SCENE_LIFT_WIP.md; the arithmetic is tools/ship/flySceneLift.mjs).
//
//   node tools/ship/takeFlySceneLift.mjs run [--jobs N]   the 24 trainings (HOMEP in the plain scene and HOMET in the 26-type, draws 13 to 24) and their audits, those
//                                                        brain/flySceneLiftRound.jsonl does not hold yet, that many processes at a time, a record a job appended as it ends; then HOMET
//                                                        draw 13's weights audited a second time in a process of their own. PRINTS NO SCORE: the file is committed before it is read.
//   node tools/ship/takeFlySceneLift.mjs read     the checks and the reading, from the file and the committed rounds' files
//   node tools/ship/takeFlySceneLift.mjs job ARM S   HOMEP S or HOMET S: one draw trained and audited; RECHECK 13: HOMET draw 13's weights, from the file, audited again (what `run` starts)
//
// About 22 minutes a training in the sandbox. tools/ship/flySceneLift-selfcheck.mjs never runs any of this.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as PF from "./flySceneLift.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), FILE = path.join(ENG, PF.RESULTS);
const USAGE = "usage: node tools/ship/takeFlySceneLift.mjs run [--jobs N] | read | job ARM S";
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
function recheckOf(s) {
    const r = linesOf().find((x) => x.kind === "draw" && x.arm === PF.RECHECK.arm && x.s === s); if (!r) throw new Error(`${PF.RECHECK.arm} draw ${s} is not in ${PF.RESULTS}: the recheck comes after it`);
    return { kind: "recheck", arm: PF.RECHECK.arm, s, weightsHash: r.weightsHash, ...PF.auditOne(r) };
}

if (!args || (args.cmd === "run" && !(args.jobs >= 1))) { console.error(USAGE); process.exitCode = 2; }
else if (args.cmd === "job") process.stdout.write(JSON.stringify(args.arm === "RECHECK" ? recheckOf(args.s) : PF.trainOne(args.arm, args.s)) + "\n");
else if (args.cmd === "read") {
    if (!fs.existsSync(FILE)) { console.error(`${PF.RESULTS} is not there: the round has not been run`); process.exitCode = 1; }
    else { const R = PF.reading(linesOf(), committedFiles()); for (const l of PF.readingLines(R)) console.log(l); process.exitCode = R.checks.length ? 1 : 0; }
} else {
    const jobs = args.jobs, t0 = Date.now(), have = linesOf(), done = new Set(have.filter((r) => r.kind === "draw").map((r) => r.arm + "/" + r.s)), rechecked = have.some((r) => r.kind === "recheck");
    const todo = PF.SEEDS.flatMap((s) => PF.ARMS.map((arm) => ({ arm, s }))).filter((j) => !done.has(j.arm + "/" + j.s));
    console.log(`${todo.length} trainings to run (${done.size} draws in ${PF.RESULTS}), ${jobs} at a time${rechecked ? "" : ", then the second audit"}; no score is printed`);
    let next = 0, failed = null;
    const worker = async () => { while (next < todo.length && !failed) { const { arm, s } = todo[next++], t = Date.now(); try { const rec = await jobOnce(arm, s);
        fs.appendFileSync(FILE, JSON.stringify(rec) + "\n"); console.log(`  ${arm} draw ${s} done (${((Date.now() - t) / 60000).toFixed(1)} min)`); } catch (e) { failed = e; } } };
    await Promise.all(Array.from({ length: jobs }, worker));
    if (!failed && !rechecked) { try { fs.appendFileSync(FILE, JSON.stringify(await jobOnce("RECHECK", PF.RECHECK.s)) + "\n"); console.log(`  ${PF.RECHECK.arm} draw ${PF.RECHECK.s} audited a second time`); } catch (e) { failed = e; } }
    if (failed) { console.error(`stopped: ${failed.message}; run again to go on`); process.exitCode = 1; }
    else console.log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${PF.RESULTS}. Commit it before reading it (node tools/ship/takeFlySceneLift.mjs read).`);
}
