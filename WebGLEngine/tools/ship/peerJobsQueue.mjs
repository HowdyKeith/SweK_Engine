// WebGLEngine/tools/ship/peerJobsQueue.mjs -- UNNUMBERED (the version is chosen at ship time) (the pure half is tools/ship/peerJobs.mjs; the command is tools/ship/peerJobsCmd.mjs; the gate is tools/ship/peerJobs-selfcheck.mjs)
//
// THE QUEUE OPERATIONS: the jobs folder as a git branch, read and written through an `io` handed in = { fs, git(args, { cwd }) -> { status, stdout, stderr } }. Every operation works in `q.dir`, a checkout of the queue branch that belongs to this peer alone
// (nothing else is ever done in it), and begins by making it equal to the remote branch. THE CLAIM IS THE PUSH: see peerJobs.mjs.
"use strict";
import path from "node:path";
import * as P from "./peerJobs.mjs";

const J = (x) => JSON.stringify(x, null, 1) + "\n";
const git = (io, q, args) => io.git(args, { cwd: q.dir });
const must = (io, q, args) => { const r = git(io, q, args); if (r.status !== 0) throw new Error(`peerJobsQueue: git ${args.join(" ")} failed: ${String(r.stderr || r.stdout).trim().slice(0, 200)}`); return r; };
/** A queue handle: { dir, remote, branch }. */
export const queueOf = ({ dir, remote = "origin", branch = P.QUEUE_BRANCH }) => ({ dir, remote, branch });
/** Makes `dir` a checkout of the queue branch of `url`: clones it if it exists, else creates an empty branch there and pushes it. Idempotent. */
export function init(io, q, url) {
    if (io.fs.existsSync(path.join(q.dir, ".git"))) return { created: false };
    io.fs.mkdirSync(q.dir, { recursive: true });
    must(io, q, ["init", "-q"]); must(io, q, ["remote", "add", q.remote, url]);
    const has = git(io, q, ["fetch", "-q", q.remote, q.branch]).status === 0;
    if (has) { must(io, q, ["checkout", "-q", "-B", q.branch, `${q.remote}/${q.branch}`]); return { created: false }; }
    must(io, q, ["checkout", "-q", "--orphan", q.branch]);
    io.fs.writeFileSync(path.join(q.dir, "README.md"), "The SweK peer job queue (tools/ship/peerJobs.mjs): jobs/, claims/, cancel/, results/. Written by peers; do not edit by hand.\n");
    must(io, q, ["add", "-A"]); must(io, q, ["-c", "user.name=swek-peer", "-c", "user.email=peer@swek.invalid", "commit", "-q", "-m", "queue: create"]);
    must(io, q, ["push", "-q", "-u", q.remote, q.branch]);
    return { created: true };
}
/** Makes the checkout equal to the remote branch (local commits and files are dropped). */
export function sync(io, q) {
    must(io, q, ["fetch", "-q", q.remote, q.branch]); must(io, q, ["reset", "-q", "--hard", `${q.remote}/${q.branch}`]); must(io, q, ["clean", "-fdq"]);
}
const readJson = (io, f) => { try { return { ok: true, value: JSON.parse(io.fs.readFileSync(f, "utf8")) }; } catch (e) { return { ok: false, error: String(e.message).slice(0, 80) }; } };
const listJson = (io, dir) => (io.fs.existsSync(dir) ? io.fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);
/** Reads the whole folder: { jobs: [{ file, spec, errors }], claims: { id: claim }, cancels: { id: record }, done: { id: record } }. A file that is not JSON is listed with its error and never run. */
export function read(io, q) {
    const out = { jobs: [], claims: {}, cancels: {}, done: {}, attempts: {}, peers: {} };
    for (const f of listJson(io, path.join(q.dir, "jobs"))) { const r = readJson(io, path.join(q.dir, "jobs", f)); out.jobs.push(r.ok ? { file: f, spec: r.value, errors: P.validateJob(r.value) } : { file: f, spec: null, errors: ["not JSON: " + r.error] }); }
    for (const f of listJson(io, path.join(q.dir, "claims"))) { const r = readJson(io, path.join(q.dir, "claims", f)); if (r.ok) out.claims[f.slice(0, -5)] = r.value; }
    for (const f of listJson(io, path.join(q.dir, "cancel"))) { const r = readJson(io, path.join(q.dir, "cancel", f)); if (r.ok) out.cancels[f.slice(0, -5)] = r.value; }
    for (const f of listJson(io, path.join(q.dir, "attempts"))) { const r = readJson(io, path.join(q.dir, "attempts", f)); if (r.ok) out.attempts[f.slice(0, -5)] = r.value; }
    for (const f of listJson(io, path.join(q.dir, "peers"))) { const r = readJson(io, path.join(q.dir, "peers", f)); if (r.ok && r.value && typeof r.value.name === "string") out.peers[f.slice(0, -5)] = r.value; }
    const rd = path.join(q.dir, "results");
    if (io.fs.existsSync(rd)) for (const id of io.fs.readdirSync(rd)) { const r = readJson(io, path.join(rd, id, "done.json")); if (r.ok) out.done[id] = r.value; }
    return out;
}
/** Commits what changed and pushes, rebasing on a refused push up to `tries` times (only files this peer owns are changed, so a rebase does not conflict); { ok, why }. */
function publish(io, q, message, tries = 5) {
    must(io, q, ["add", "-A"]);
    must(io, q, ["-c", "user.name=swek-peer", "-c", "user.email=peer@swek.invalid", "commit", "-q", "-m", message]);
    for (let i = 0; i < tries; i++) {
        if (git(io, q, ["push", "-q", q.remote, `HEAD:${q.branch}`]).status === 0) return { ok: true, why: "" };
        const rb = git(io, q, ["pull", "--rebase", "-q", q.remote, q.branch]);
        if (rb.status !== 0) { git(io, q, ["rebase", "--abort"]); return { ok: false, why: "rebase conflicted" }; }
    }
    return { ok: false, why: `push refused ${tries} times` };
}
/** Signs and adds a job (refused when invalid, when the id exists as a job or a result, or without a key); { ok, why, spec }. */
export function submit(io, q, spec, key) {
    if (!key) return { ok: false, why: "no signing key" };
    const body = (({ sig, ...r }) => r)(spec), bad = P.validateJob(body);
    if (bad.length) return { ok: false, why: bad[0] };
    sync(io, q);
    const f = path.join(q.dir, "jobs", spec.id + ".json");
    if (io.fs.existsSync(f) || io.fs.existsSync(path.join(q.dir, "results", spec.id))) return { ok: false, why: "a job or result with this id exists" };
    const signed = { ...body, sig: P.sign(body, key) };
    io.fs.mkdirSync(path.dirname(f), { recursive: true }); io.fs.writeFileSync(f, J(signed));
    const p = publish(io, q, `job ${spec.id}`);
    return p.ok ? { ok: true, why: "", spec: signed } : { ok: false, why: p.why };
}
/** Asks the peers to stop wanting a job (a request: a run that has begun is not killed by it). */
export function cancel(io, q, id, by, now) {
    sync(io, q);
    const f = path.join(q.dir, "cancel", id + ".json");
    if (io.fs.existsSync(f)) return { ok: true, why: "already cancelled" };
    io.fs.mkdirSync(path.dirname(f), { recursive: true }); io.fs.writeFileSync(f, J({ id, by, at: new Date(now).toISOString() }));
    return publish(io, q, `cancel ${id}`);
}
/**
 * Tries to claim a job for `peer`: the claim file is written and pushed. A refused push is not yet a loss (somebody may have pushed something else): the checkout is made equal to the remote again and the claim
 * is looked at; another peer's fresh claim is a loss, anything else is tried again, up to 4 times. { won, why }.
 */
export function claim(io, q, job, peer, now) {
    for (let i = 0; i < 4; i++) {
        sync(io, q);
        const state = read(io, q), c = state.claims[job.id];
        if (state.done[job.id] || state.cancels[job.id]) return { won: false, why: "no longer needed" };
        if (c && c.peer !== peer.name && P.claimFresh(c, now)) return { won: false, why: "claimed by " + c.peer };
        const f = path.join(q.dir, "claims", job.id + ".json");
        io.fs.mkdirSync(path.dirname(f), { recursive: true }); io.fs.writeFileSync(f, J(P.makeClaim(peer, job, now)));
        must(io, q, ["add", "-A"]); must(io, q, ["-c", "user.name=swek-peer", "-c", "user.email=peer@swek.invalid", "commit", "-q", "-m", `claim ${job.id} by ${peer.name}`]);
        if (git(io, q, ["push", "-q", q.remote, `HEAD:${q.branch}`]).status === 0) return { won: true, why: "" };
    }
    return { won: false, why: "push refused 4 times" };
}
/** Refreshes a claim's heartbeat (only the claimant's own file changes). */
export function beat(io, q, id, peer, now) {
    const f = path.join(q.dir, "claims", id + ".json"), r = readJson(io, f);
    if (!r.ok || r.value.peer !== peer.name) return { ok: false, why: "not this peer's claim" };
    io.fs.writeFileSync(f, J({ ...r.value, beat: new Date(now).toISOString() }));
    return publish(io, q, `beat ${id}`);
}
/** Writes the result: the files (`files` = [{ from, to }], `to` relative to results/<id>/), a done.json, removes the claim, pushes. { ok, why }. */
export function finish(io, q, id, peer, outcome, now) {
    const dir = path.join(q.dir, "results", id), skipped = [];
    io.fs.mkdirSync(dir, { recursive: true });
    for (const f of outcome.files || []) {
        if (io.fs.statSync(f.from).size > P.RESULT_MAX_BYTES) { skipped.push(f.to); continue; }
        const to = path.join(dir, f.to); io.fs.mkdirSync(path.dirname(to), { recursive: true }); io.fs.copyFileSync(f.from, to);
    }
    io.fs.writeFileSync(path.join(dir, "done.json"), J({ id, peer: peer.name, status: outcome.status, exit: outcome.exit, seconds: outcome.seconds, files: (outcome.files || []).map((f) => f.to).filter((t) => !skipped.includes(t)), skipped, finished: new Date(now).toISOString(), note: String(outcome.note || "").slice(0, 200) }));
    const c = path.join(q.dir, "claims", id + ".json");
    if (io.fs.existsSync(c)) io.fs.rmSync(c);
    const st = path.join(q.dir, "state", id);
    if (io.fs.existsSync(st)) io.fs.rmSync(st, { recursive: true, force: true });
    return publish(io, q, `result ${id}: ${outcome.status}`);
}
/** A failed run: counts the attempt, releases the claim so a peer (this one after RETRY_S) tries again from the saved state; at MAX_ATTEMPTS it becomes the result (status failed). { ok, final, n, why }. */
export function fail(io, q, id, peer, outcome, now) {
    sync(io, q);
    const f = path.join(q.dir, "attempts", id + ".json"), prev = readJson(io, f), n = (prev.ok && Number.isInteger(prev.value.n) ? prev.value.n : 0) + 1;
    io.fs.mkdirSync(path.dirname(f), { recursive: true });
    io.fs.writeFileSync(f, J({ id, n, peer: peer.name, exit: outcome.exit, note: String(outcome.note || "").slice(0, 200), at: new Date(now).toISOString() }));
    if (n >= P.MAX_ATTEMPTS) { const r = finish(io, q, id, peer, { ...outcome, status: "failed", note: `failed ${n} times: ${String(outcome.note || "").slice(0, 150)}` }, now); return { ok: r.ok, final: true, n, why: r.why }; }
    const c = path.join(q.dir, "claims", id + ".json");
    if (io.fs.existsSync(c)) io.fs.rmSync(c);
    const r = publish(io, q, `attempt ${n} of ${id} failed`);
    return { ok: r.ok, final: false, n, why: r.why };
}
/** Shares a job's data files so another peer (or this one after a restart) can resume: `files` = [{ from, name }] are copied to state/<id>/ and pushed, only when something differs. { ok, changed, why }. */
export function saveState(io, q, id, files, now) {
    sync(io, q);
    const dir = path.join(q.dir, "state", id); let changed = 0;
    io.fs.mkdirSync(dir, { recursive: true });
    for (const f of files) {
        if (!/^[\w.-]+$/.test(f.name)) continue;
        const to = path.join(dir, f.name), cur = io.fs.existsSync(to) ? io.fs.readFileSync(to) : null, now2 = io.fs.readFileSync(f.from);
        if (cur === null || !cur.equals(now2)) { io.fs.writeFileSync(to, now2); changed++; }
    }
    if (!changed) return { ok: true, changed: 0, why: "" };
    io.fs.writeFileSync(path.join(dir, "saved.json"), J({ id, at: new Date(now).toISOString(), files: files.map((f) => f.name) }));
    const r = publish(io, q, `state ${id}: ${changed} file(s)`);
    return { ok: r.ok, changed, why: r.why };
}
/** The shared data files of a job: [{ name, from }] (the checkout is made equal to the remote first). */
export function loadState(io, q, id) {
    sync(io, q);
    const dir = path.join(q.dir, "state", id);
    return io.fs.existsSync(dir) ? io.fs.readdirSync(dir).filter((n) => n !== "saved.json").sort().map((n) => ({ name: n, from: path.join(dir, n) })) : [];
}
/** Says what this peer is doing so every peer can see it: peers/<name>.json, pushed only when what it is doing changed or the last push is older than `minAgeS` (default 300) seconds. { ok, pushed, why }. */
export function presence(io, q, peer, doing, now, minAgeS = 300) {
    const f = path.join(q.dir, "peers", peer.name + ".json"), prev = readJson(io, f);
    const same = prev.ok && J(prev.value.doing || null) === J(doing || null) && P.presenceFresh(prev.value, now + (P.PRESENCE_FRESH_S - minAgeS) * 1000);
    if (same) return { ok: true, pushed: false, why: "" };
    sync(io, q);
    const before = readJson(io, f), since = before.ok && J(before.value.doing || null) === J(doing || null) ? before.value.since : undefined;
    io.fs.mkdirSync(path.dirname(f), { recursive: true }); io.fs.writeFileSync(f, J(P.makePresence(peer, doing, now, { since })));
    const r = publish(io, q, `peer ${peer.name}: ${doing ? "running " + doing.job : "idle"}`);
    return { ok: r.ok, pushed: r.ok, why: r.why };
}
