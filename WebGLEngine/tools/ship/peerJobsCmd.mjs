// WebGLEngine/tools/ship/peerJobsCmd.mjs -- the command for tools/ship/peerJobs.mjs and tools/ship/peerJobsQueue.mjs (export-free on purpose). SweK PEER JOBS: a git branch as the queue for long runs.
//   node tools/ship/peerJobsCmd.mjs init   --url <git url of the repo that holds the queue branch> [--dir <this peer's queue checkout>]
//   node tools/ship/peerJobsCmd.mjs submit --id <job-id> --rounds 69,70 [--gpu any|required|forbidden] [--min-cores N] [--peers a,b] [--cpu-match Intel] [--priority N] [--after id,id] [--expires ISO] [--workers N] [--no-zip] [--commit <sha>] [--note "..."] | --selftest
//   node tools/ship/peerJobsCmd.mjs status                  every job with what this peer would do with it, the claims, the results
//   node tools/ship/peerJobsCmd.mjs cancel --id <job-id>    ask the peers to stop wanting it
//   node tools/ship/peerJobsCmd.mjs watch [--once] [--dry-run] [--interval 120] [--name <peer>] [--gpu] [--no-gpu] [--engine-dir <git clone of the engine> [--engine-url <url>]]     find a job this peer should run, claim it, run it, push the result, then look again
// An engine that was installed from a zip is not a git checkout: such a peer gives --engine-dir (and --engine-url to have it cloned there) so a job can run in a worktree of its commit.
// Shared: [--dir ~/.swek/peerjobs/queue] [--key-file ~/.swek/peerjobs.key] (or SWEK_PEERJOBS_KEY). The key is the secret every peer holds; a job whose signature does not verify under it is listed and never run.
// A peer is a GPU box when --gpu is given, SWEK_PEER_GPU=1 is set, or `nvidia-smi -L` lists a card; --no-gpu says it is not. A job runs in a clean checkout (git worktree) of the commit it names, and its result files (rig-out/) go back to results/<id>/ on the queue branch.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as P from "./peerJobs.mjs";
import * as Q from "./peerJobsQueue.mjs";
const args = process.argv.slice(2), cmd = args[0], val = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] !== undefined && !args[i + 1].startsWith("--") ? args[i + 1] : d; }, has = (k) => args.includes(k);
const home = process.env.SWEK_HOME || path.join(os.homedir(), ".swek");
const dir = path.resolve(val("--dir", path.join(home, "peerjobs", "queue"))), keyFile = path.resolve(val("--key-file", path.join(home, "peerjobs.key")));
const io = { fs, git: (a, o = {}) => { const r = spawnSync("git", a, { cwd: o.cwd, encoding: "utf8" }); return { status: r.status === null ? 1 : r.status, stdout: r.stdout || "", stderr: r.stderr || "" }; } };
const q = Q.queueOf({ dir });
const key = () => (process.env.SWEK_PEERJOBS_KEY || (fs.existsSync(keyFile) ? fs.readFileSync(keyFile, "utf8").trim() : ""));
const engine = () => {
    const given = val("--engine-dir", null), url = val("--engine-url", null);
    if (given) { const d = path.resolve(given); if (url && !fs.existsSync(path.join(d, ".git"))) { fs.mkdirSync(path.dirname(d), { recursive: true }); io.git(["clone", "-q", url, d]); } return fs.existsSync(path.join(d, ".git")) ? d : ""; }
    const r = io.git(["rev-parse", "--show-toplevel"], { cwd: path.dirname(fileURLToPath(import.meta.url)) }); return r.status === 0 ? r.stdout.trim() : "";
};
const gpuHere = () => { if (has("--no-gpu")) return false; if (has("--gpu") || process.env.SWEK_PEER_GPU === "1") return true; const r = spawnSync("nvidia-smi", ["-L"], { encoding: "utf8" }); return r.status === 0 && /GPU \d/.test(r.stdout || ""); };
const caps = () => ({ name: val("--name", os.hostname().replace(/[^\w.-]/g, "-").slice(0, 40)), host: os.hostname(), cores: os.cpus().length, cpu: (os.cpus()[0] || {}).model || "", gpu: gpuHere() });
const say = (s) => console.log(s);
const table = (st, c, now, busy) => st.jobs.map((j) => {
    if (!j.spec || j.errors.length) return { file: j.file, ok: false, line: `${j.file}: NOT RUN (${j.errors[0]})` };
    if (!P.verify(j.spec, key())) return { file: j.file, ok: false, line: `${j.spec.id}: NOT RUN (the signature does not verify under this peer's key)` };
    const d = P.decide(j.spec, c, { claims: st.claims, done: st.done, cancels: st.cancels, busy, now });
    return { file: j.file, ok: true, job: j.spec, decision: d, line: `${j.spec.id}: ${d.action.toUpperCase()} (${d.reason}) [${j.spec.kind}${j.spec.rounds ? " " + j.spec.rounds.join(",") : ""}, priority ${j.spec.priority || 0}, by ${j.spec.by}]` };
});
async function runJob(job, c) {
    const eng = engine(), work = path.join(os.tmpdir(), "swek-peerjob-" + job.id), t0 = Date.now();
    const fail = (note) => ({ status: "failed", exit: -1, seconds: (Date.now() - t0) / 1000, files: [], note });
    if (!eng) return fail("this peer has no engine checkout (a git clone): give --engine-dir, and --engine-url to clone it");
    if (io.git(["cat-file", "-e", job.commit + "^{commit}"], { cwd: eng }).status !== 0) io.git(["fetch", "-q", "origin", job.commit], { cwd: eng });
    if (io.git(["cat-file", "-e", job.commit + "^{commit}"], { cwd: eng }).status !== 0) return fail("the job's commit is not in this checkout");
    if (fs.existsSync(work)) { io.git(["worktree", "remove", "--force", work], { cwd: eng }); fs.rmSync(work, { recursive: true, force: true }); }
    if (io.git(["worktree", "add", "--detach", work, job.commit], { cwd: eng }).status !== 0) return fail("git worktree add failed");
    const nm = path.join(eng, "WebGLEngine", "node_modules"); if (fs.existsSync(nm) && !fs.existsSync(path.join(work, "WebGLEngine", "node_modules"))) fs.symlinkSync(nm, path.join(work, "WebGLEngine", "node_modules"), "dir");
    const argv = P.argvFor(job, c), logf = path.join(work, "peerjob.log"), out = fs.openSync(logf, "w");
    say(`[peerjobs] running ${job.id}: node ${argv.join(" ")} in ${work}/WebGLEngine`);
    const timer = setInterval(() => { try { const r = Q.beat(io, q, job.id, c, Date.now()); if (!r.ok) say(`[peerjobs] heartbeat not pushed: ${r.why}`); } catch (e) { say("[peerjobs] heartbeat failed: " + e.message); } }, P.BEAT_S * 1000);
    const code = await new Promise((resolve) => { const ch = spawn(process.execPath, argv, { cwd: path.join(work, "WebGLEngine"), stdio: ["ignore", out, out] }); ch.on("close", (x) => resolve(x === null ? 1 : x)); ch.on("error", () => resolve(1)); });
    clearInterval(timer); fs.closeSync(out);
    const files = [{ from: logf, to: "peerjob.log" }], ro = path.join(work, "WebGLEngine", "rig-out");
    if (fs.existsSync(ro)) for (const f of fs.readdirSync(ro)) if (fs.statSync(path.join(ro, f)).isFile()) files.push({ from: path.join(ro, f), to: "rig-out/" + f });
    const res = { status: code === 0 ? "ok" : "failed", exit: code, seconds: (Date.now() - t0) / 1000, files, note: code === 0 ? "" : "the runner exited " + code };
    return { res, work, eng };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (cmd === "init") {
    const url = val("--url", null); if (!url) { console.error("init needs --url"); process.exit(2); }
    say(JSON.stringify(Q.init(io, q, url)) + ` queue checkout: ${dir}`);
} else if (cmd === "submit") {
    const k = key(); if (!k) { console.error(`no signing key: put one in ${keyFile} or SWEK_PEERJOBS_KEY`); process.exit(2); }
    const c = caps(), head = io.git(["rev-parse", "HEAD"], { cwd: engine() }).stdout.trim();
    const spec = { version: P.VERSION, id: val("--id", ""), kind: has("--selftest") ? "selftest" : "rounds", target: { gpu: val("--gpu", "any"), ...(val("--min-cores") ? { minCores: Number(val("--min-cores")) } : {}), ...(val("--peers") ? { peers: val("--peers").split(",") } : {}), ...(val("--cpu-match") ? { cpuMatch: val("--cpu-match") } : {}) }, created: new Date().toISOString().replace(/\.\d+Z$/, "Z"), commit: val("--commit", head), by: c.name };
    if (spec.kind === "rounds") spec.rounds = val("--rounds", "").split(",").filter(Boolean);
    if (val("--priority")) spec.priority = Number(val("--priority")); if (val("--after")) spec.after = val("--after").split(","); if (val("--expires")) spec.expires = val("--expires"); if (val("--workers")) spec.workers = Number(val("--workers")); if (has("--no-zip")) spec.zip = false; if (val("--note")) spec.note = val("--note");
    const r = Q.submit(io, q, spec, k); say(r.ok ? `submitted ${spec.id} at commit ${spec.commit.slice(0, 10)}` : `NOT submitted: ${r.why}`); process.exitCode = r.ok ? 0 : 1;
} else if (cmd === "status") {
    Q.sync(io, q); const st = Q.read(io, q), c = caps(), now = Date.now();
    say(`this peer: ${c.name}, ${c.cores} cores, ${c.cpu}, GPU ${c.gpu ? "yes" : "no"}`);
    for (const t of table(st, c, now, false)) say("  " + t.line);
    for (const [id, cl] of Object.entries(st.claims)) say(`  claim ${id}: ${cl.peer}, beat ${Math.round(P.claimAge(cl, now))} s ago (${P.claimFresh(cl, now) ? "alive" : "STALE"})`);
    for (const [id, d] of Object.entries(st.done)) say(`  result ${id}: ${d.status} by ${d.peer} in ${Math.round(d.seconds)} s, ${d.files.length} files`);
} else if (cmd === "cancel") {
    const id = val("--id", ""); const r = Q.cancel(io, q, id, caps().name, Date.now()); say(r.ok ? `cancel requested for ${id}` : `NOT cancelled: ${r.why}`); process.exitCode = r.ok ? 0 : 1;
} else if (cmd === "watch") {
    const c = caps(), interval = Number(val("--interval", 120)) * 1000; say(`[peerjobs] watching ${dir} as ${c.name} (${c.cores} cores, GPU ${c.gpu ? "yes" : "no"})${has("--dry-run") ? " (DRY RUN)" : ""}`);
    for (;;) {
        Q.sync(io, q); const st = Q.read(io, q), now = Date.now(), rows = table(st, c, now, false);
        for (const t of rows) say("  " + t.line);
        const next = P.pick(rows.filter((t) => t.ok));
        if (next && has("--dry-run")) { say(`[peerjobs] would run ${next.job.id}`); break; }
        if (next) {
            const cl = Q.claim(io, q, next.job, c, Date.now());
            if (!cl.won) { say(`[peerjobs] did not get ${next.job.id}: ${cl.why}`); if (has("--once")) break; continue; }
            say(`[peerjobs] claimed ${next.job.id}`);
            const r = await runJob(next.job, c);
            const outcome = r.res || r, fin = Q.finish(io, q, next.job.id, c, outcome, Date.now());
            say(`[peerjobs] ${next.job.id}: ${outcome.status}${fin.ok ? ", result pushed" : ", RESULT NOT PUSHED: " + fin.why}`);
            if (r.work) { io.git(["worktree", "remove", "--force", r.work], { cwd: r.eng }); }
            if (has("--once")) break; continue;
        }
        if (has("--once")) { say("[peerjobs] nothing to run"); break; }
        await sleep(interval);
    }
} else { console.error("usage: init | submit | status | cancel | watch   (see the header)"); process.exit(2); }
