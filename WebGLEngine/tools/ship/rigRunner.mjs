// WebGLEngine/tools/ship/rigRunner.mjs -- runs head-to-head rounds one after another on a rig: search (if the round has one), then fly (or read), times every phase,
// and can zip and push what it produced. Export-free on purpose (a command, not a library). Every round command it calls is resumable, so you can stop it,
// reboot, and run the same line again: finished rounds are skipped, an interrupted search resumes from its saved state, an interrupted flight starts over.
//
//   node tools/ship/rigRunner.mjs --rounds 63,61,59 [--workers 6] [--push] [--push-branch rig-data] [--zip] [--dry-run] [--selftest]
//
//   --rounds a,b,c   the rounds to run, in this order (numbers as in headToHeadNNCmd.mjs). Default: 63,61,59,58,57,56,55
//   --workers N      processes per search and per flight (default: the number of cores)
//   --push           after each finished round: git add the round's data and the timings, commit, push to origin HEAD:<push-branch> (default branch name rig-data,
//                    NOT the working branch, so the rig and the cloud session never fight over one branch). Retries 4 times (2, 4, 8, 16 s).
//   --zip            after each finished round: zip the round's data files into rig-out/HNN.zip (uses tar -a on Windows and macOS, zip on Linux; best effort)
//   --dry-run        print what would run and exit
//   --selftest       run H63's smoke search (a few seconds, writes only to the temp directory) and print its output, so its numbers can be compared with another machine's
//
// Output: brain/rig-results/head-to-headNN*.json[l] (what the round commands write), brain/rig-results/rig-timings.jsonl (one JSON line per phase: round, phase, start, seconds,
// exit code, workers, cores, cpu model, platform, node, host) and rig-out/HNN-<phase>.log (everything the phase printed).
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const eng = fileURLToPath(new URL("../../", import.meta.url)), RR = path.join(eng, "brain", "rig-results"), OUT = path.join(eng, "rig-out");
const args = process.argv.slice(2), val = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; }, has = (k) => args.includes(k);
const rounds = val("--rounds", "63,61,59,58,57,56,55").split(",").map((s) => s.trim()).filter(Boolean);
const workers = Number(val("--workers", os.cpus().length)), pushBranch = val("--push-branch", "rig-data");
const cmdOf = (n) => path.join(eng, "tools", "ship", `headToHead${n}Cmd.mjs`);
const resultOf = (n) => path.join(RR, `head-to-head${n}.json`);
const stamp = () => new Date().toISOString();
const sh = (c, a, o = {}) => spawnSync(c, a, { cwd: eng, encoding: "utf8", shell: false, ...o });

if (!Number.isInteger(workers) || workers < 1) { console.error("--workers must be a positive integer"); process.exit(2); }
fs.mkdirSync(RR, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

/** Is the round's flight result already there (and not a smoke result)? */
function finished(n) {
    const f = resultOf(n); if (!fs.existsSync(f)) return false;
    try { const j = JSON.parse(fs.readFileSync(f, "utf8")); return !j.smoke; } catch (e) { return false; }
}
/** What the round's command offers. */
function offers(n) {
    const f = cmdOf(n); if (!fs.existsSync(f)) return null;
    const t = fs.readFileSync(f, "utf8");
    return { search: /args\[0\] === "search"/.test(t), fly: /args\[0\] === "fly"/.test(t), read: /args\[0\] === "read"/.test(t) };
}
/** Runs one phase of a round, tees its output to rig-out/HNN-phase.log and to the console, records the timing. Resolves to the exit code. */
function phase(n, name, cmdArgs) {
    return new Promise((resolve) => {
        const start = Date.now(), log = fs.createWriteStream(path.join(OUT, `H${n}-${name}.log`), { flags: "a" });
        log.write(`\n=== ${stamp()} node ${cmdArgs.join(" ")}\n`);
        console.log(`[rig] ${stamp()} H${n} ${name}: node ${cmdArgs.join(" ")}`);
        const child = spawn(process.execPath, cmdArgs, { cwd: eng, stdio: ["ignore", "pipe", "pipe"] });
        const tee = (d) => { process.stdout.write(d); log.write(d); };
        child.stdout.on("data", tee); child.stderr.on("data", tee);
        child.on("close", (code) => {
            const seconds = Math.round((Date.now() - start) / 1000);
            log.end();
            const rec = { round: `H${n}`, phase: name, start: new Date(start).toISOString(), seconds, code, workers, cores: os.cpus().length, cpu: os.cpus()[0] && os.cpus()[0].model, platform: `${os.platform()} ${os.release()}`, node: process.version, host: os.hostname() };
            fs.appendFileSync(path.join(RR, "rig-timings.jsonl"), JSON.stringify(rec) + "\n");
            console.log(`[rig] H${n} ${name} finished in ${seconds} s (exit ${code})`);
            resolve(code);
        });
    });
}
function zipRound(n) {
    const files = fs.readdirSync(RR).filter((f) => f.startsWith(`head-to-head${n}`) || f === "rig-timings.jsonl").map((f) => path.join("brain", "rig-results", f));
    const out = path.join("rig-out", `H${n}.zip`);
    let r = process.platform === "linux" ? sh("zip", ["-q", out, ...files]) : sh("tar", ["-a", "-c", "-f", out, ...files]);
    if (r.error || r.status !== 0) { r = sh("tar", ["-czf", out.replace(/\.zip$/, ".tar.gz"), ...files]); console.log(r.status === 0 ? `[rig] zip tool missing: wrote ${out.replace(/\.zip$/, ".tar.gz")}` : "[rig] could not zip (tar/zip not found); the files are in brain/rig-results"); }
    else console.log(`[rig] wrote ${out}`);
}
async function pushRound(n) {
    const files = fs.readdirSync(RR).filter((f) => f.startsWith(`head-to-head${n}`) || f === "rig-timings.jsonl").map((f) => path.join("brain", "rig-results", f));
    let r = sh("git", ["add", "--", ...files]); if (r.status !== 0) { console.log("[rig] git add failed:", (r.stderr || "").trim()); return; }
    r = sh("git", ["commit", "-m", `rig: H${n} data and timings (${os.hostname()}, ${os.cpus().length} cores)`]);
    if (r.status !== 0) { console.log("[rig] git commit said:", ((r.stdout || "") + (r.stderr || "")).trim().split("\n")[0]); }
    for (const wait of [0, 2, 4, 8, 16]) {
        if (wait) await new Promise((res) => setTimeout(res, wait * 1000));
        const p = sh("git", ["push", "origin", `HEAD:refs/heads/${pushBranch}`]);
        if (p.status === 0) { console.log(`[rig] pushed H${n} to origin/${pushBranch}`); return; }
        console.log(`[rig] push failed (${wait ? "retry after " + wait + " s" : "first try"}): ${(p.stderr || "").trim().split("\n").pop()}`);
    }
    console.log("[rig] gave up pushing; the commit is local, push it by hand or send the zip");
}

if (has("--selftest")) {
    const c = cmdOf("63"); if (!fs.existsSync(c)) { console.error("headToHead63Cmd.mjs is not in this checkout"); process.exit(2); }
    const tmp = path.join(os.tmpdir(), "h63-smoke-state"); fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(path.join(os.tmpdir(), "h63-smoke-search.jsonl"), { force: true });
    console.log(`[rig] selftest on ${os.hostname()} (${os.platform()} ${os.release()}, node ${process.version}, ${os.cpus().length} cores): H63 smoke search, writes only to ${os.tmpdir()}`);
    const r = spawnSync(process.execPath, [c, "search", "--smoke", "--workers", String(Math.min(workers, 4))], { cwd: eng, stdio: "inherit" });
    process.exit(r.status || 0);
}

console.log(`[rig] ${stamp()} host ${os.hostname()}, ${os.cpus().length} cores (${os.cpus()[0] && os.cpus()[0].model}), node ${process.version}, workers ${workers}; rounds ${rounds.map((n) => "H" + n).join(" ")}${has("--push") ? `; pushing to origin/${pushBranch}` : ""}`);
const plan = rounds.map((n) => ({ n, o: offers(n), done: finished(n) }));
for (const p of plan) console.log(`[rig] plan H${p.n}: ${!p.o ? "NO COMMAND FILE (skipped)" : p.done ? "already finished (skipped)" : [p.o.search && "search", p.o.fly ? "fly" : p.o.read ? "read" : "(nothing to run)"].filter(Boolean).join(" then ")}`);
if (has("--dry-run")) process.exit(0);

let failed = 0;
for (const p of plan) {
    if (!p.o || p.done) continue;
    const c = cmdOf(p.n), rel = path.relative(eng, c);
    if (p.o.search) {
        const code = await phase(p.n, "search", [rel, "search", "--workers", String(workers)]);
        if (code !== 0) { failed++; console.log(`[rig] H${p.n} search did not finish (exit ${code}); run the same line again to resume it. Going on to the next round.`); continue; }
    }
    const code = p.o.fly ? await phase(p.n, "fly", [rel, "fly", "--parts", String(workers)]) : p.o.read ? await phase(p.n, "read", [rel, "read"]) : 0;
    if (code !== 0) { failed++; console.log(`[rig] H${p.n} flight did not finish (exit ${code}); run the same line again to redo it. Going on to the next round.`); continue; }
    if (has("--zip")) zipRound(p.n);
    if (has("--push")) await pushRound(p.n);
}
console.log(`[rig] ${stamp()} done${failed ? `, ${failed} round(s) did not finish` : ""}. Timings: brain/rig-results/rig-timings.jsonl`);
process.exitCode = failed ? 1 : 0;
