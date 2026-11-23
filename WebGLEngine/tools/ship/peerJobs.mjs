// WebGLEngine/tools/ship/peerJobs.mjs -- UNNUMBERED (the version is chosen at ship time) (the queue operations are tools/ship/peerJobsQueue.mjs; the command is tools/ship/peerJobsCmd.mjs; the gate is tools/ship/peerJobs-selfcheck.mjs)
//
// PEER JOBS: A GIT FOLDER AS THE QUEUE FOR LONG RUNS (Keith, 2026-11-23: "have the SweK Engine monitor a git repo folder for these pushed job runs, and then have whichever free SweK Engine peer ... pick it up, maybe queue it up if that peer was busy, and then when the
// peer was free check if the job was still needed ... run our job on just the GPU box, or the Intel CPU only box, as requested ... the results then pushed back to the git repo folder when completed").
// THIS FILE IS THE PURE HALF: what a job is, who may run it, whether this peer should, and in what order. It reads and writes nothing; the queue operations hand it the files.
//
//   THE FOLDER (a dedicated branch, `peer-jobs`, never the working branch):   jobs/<id>.json   a signed job      claims/<id>.json   who is running it, with a heartbeat      cancel/<id>.json   a request to stop wanting it      results/<id>/done.json (+ the result files)   finished
//   *** A JOB FILE IS NOT A COMMAND. *** Whoever can push to the branch could otherwise run anything on every peer. So a job names a KIND from a closed list (`rounds`: tools/ship/rigRunner.mjs --rounds ..., or `selftest`), the round numbers (digits only), a target and a commit; THE PEER BUILDS THE
//   COMMAND LINE ITSELF from those fields (argvFor), refuses any field it does not know, and refuses a job whose HMAC-SHA256 signature (a secret each peer holds) does not verify. A job text is data.
//   THE CLAIM IS THE PUSH: two peers that both write claims/<id>.json and push cannot both succeed, so the one whose push is refused has lost and goes on to the next job. A claim carries a heartbeat; one that has missed STALE_BEATS beats is dead and may be taken over.
"use strict";
import crypto from "node:crypto";

export const VERSION = 1, QUEUE_BRANCH = "peer-jobs", BEAT_S = 600, STALE_BEATS = 3, MAX_ROUNDS = 8, MAX_AFTER = 8;
export const KINDS = Object.freeze(["rounds", "selftest"]), GPU = Object.freeze(["any", "required", "forbidden"]);
const ID = /^[a-z0-9][a-z0-9-]{2,62}$/, ROUND = /^\d{1,3}$/, SHA = /^[0-9a-f]{40}$/, ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, PEER = /^[A-Za-z0-9][\w.-]{0,39}$/, TEXT = /^[\x20-\x7e]{0,200}$/, CPU = /^[\w .()@-]{1,40}$/;
const FIELDS = new Set(["version", "id", "kind", "rounds", "workers", "zip", "target", "priority", "created", "expires", "after", "commit", "by", "note", "sig"]), TARGET_FIELDS = new Set(["gpu", "minCores", "peers", "cpuMatch"]);
const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
/** JSON with the keys of every object sorted, so a signature does not depend on the order a file was written in. */
export function canonical(v) {
    if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canonical(v[k])).join(",") + "}";
    return JSON.stringify(v);
}
const body = (spec) => { const { sig, ...rest } = spec || {}; return canonical(rest); };
/** HMAC-SHA256 (hex) of the job without its `sig`. */
export const sign = (spec, key) => crypto.createHmac("sha256", String(key)).update(body(spec)).digest("hex");
/** True only for a 64-hex signature equal to the HMAC of the job under `key` (a missing or empty key never verifies). */
export function verify(spec, key) {
    if (!spec || typeof spec.sig !== "string" || !/^[0-9a-f]{64}$/.test(spec.sig) || typeof key !== "string" || key.length === 0) return false;
    return crypto.timingSafeEqual(Buffer.from(spec.sig, "hex"), Buffer.from(sign(spec, key), "hex"));
}
/** The reasons a job is not acceptable (an empty list: it is). Strict: an unknown field is a reason, so nothing rides along. */
export function validateJob(spec) {
    const e = [];
    if (!spec || typeof spec !== "object" || Array.isArray(spec)) return ["the job is not an object"];
    for (const k of Object.keys(spec)) if (!FIELDS.has(k)) e.push(`unknown field ${JSON.stringify(k)}`);
    if (spec.version !== VERSION) e.push(`version must be ${VERSION}`);
    if (typeof spec.id !== "string" || !ID.test(spec.id)) e.push("id must be 3 to 63 characters of a-z, 0-9 and -, starting with a letter or digit");
    if (!KINDS.includes(spec.kind)) e.push(`kind must be one of ${KINDS.join(", ")}`);
    if (spec.kind === "rounds") {
        if (!Array.isArray(spec.rounds) || spec.rounds.length < 1 || spec.rounds.length > MAX_ROUNDS || !spec.rounds.every((r) => typeof r === "string" && ROUND.test(r)) || new Set(spec.rounds).size !== spec.rounds.length) e.push(`rounds must be 1 to ${MAX_ROUNDS} different strings of 1 to 3 digits`);
    } else if (spec.kind === "selftest" && spec.rounds !== undefined && !(Array.isArray(spec.rounds) && spec.rounds.length === 0)) e.push("a selftest takes no rounds");
    if (spec.workers !== undefined && !isInt(spec.workers, 1, 64)) e.push("workers must be an integer from 1 to 64");
    if (spec.zip !== undefined && typeof spec.zip !== "boolean") e.push("zip must be true or false");
    const t = spec.target;
    if (!t || typeof t !== "object" || Array.isArray(t)) e.push("target is required: { gpu, minCores, peers, cpuMatch }");
    else {
        for (const k of Object.keys(t)) if (!TARGET_FIELDS.has(k)) e.push(`unknown target field ${JSON.stringify(k)}`);
        if (!GPU.includes(t.gpu)) e.push(`target.gpu must be one of ${GPU.join(", ")}`);
        if (t.minCores !== undefined && !isInt(t.minCores, 1, 256)) e.push("target.minCores must be an integer from 1 to 256");
        if (t.peers !== undefined && t.peers !== null && !(Array.isArray(t.peers) && t.peers.length >= 1 && t.peers.length <= 16 && t.peers.every((p) => typeof p === "string" && PEER.test(p)))) e.push("target.peers must be null or 1 to 16 peer names");
        if (t.cpuMatch !== undefined && !(typeof t.cpuMatch === "string" && CPU.test(t.cpuMatch))) e.push("target.cpuMatch must be 1 to 40 plain characters");
    }
    if (spec.priority !== undefined && !isInt(spec.priority, -9, 9)) e.push("priority must be an integer from -9 to 9");
    if (typeof spec.created !== "string" || !ISO.test(spec.created) || !Number.isFinite(Date.parse(spec.created))) e.push("created must be an ISO UTC time like 2026-11-23T12:00:00Z");
    if (spec.expires !== undefined && (typeof spec.expires !== "string" || !ISO.test(spec.expires) || !Number.isFinite(Date.parse(spec.expires)) || !(Date.parse(spec.expires) > Date.parse(spec.created)))) e.push("expires must be an ISO UTC time after created");
    if (spec.after !== undefined && !(Array.isArray(spec.after) && spec.after.length <= MAX_AFTER && spec.after.every((a) => typeof a === "string" && ID.test(a) && a !== spec.id) && new Set(spec.after).size === spec.after.length)) e.push(`after must be up to ${MAX_AFTER} other job ids`);
    if (typeof spec.commit !== "string" || !SHA.test(spec.commit)) e.push("commit must be a 40-character lowercase hex commit id");
    if (typeof spec.by !== "string" || !PEER.test(spec.by)) e.push("by must be a short name");
    if (spec.note !== undefined && !(typeof spec.note === "string" && TEXT.test(spec.note))) e.push("note must be up to 200 printable ASCII characters");
    return e;
}
/** The command line a peer runs for a job, built here from validated fields only (argv for `node`, relative to the checkout of the job's commit). `workers` is capped at the peer's cores. */
export function argvFor(spec, caps) {
    const bad = validateJob(spec);
    if (bad.length) throw new Error("peerJobs.argvFor: " + bad[0]);
    const workers = Math.max(1, Math.min(spec.workers || caps.cores, caps.cores));
    if (spec.kind === "selftest") return ["tools/ship/rigRunner.mjs", "--selftest"];
    return ["tools/ship/rigRunner.mjs", "--rounds", spec.rounds.join(","), "--workers", String(workers), ...(spec.zip === false ? [] : ["--zip"])];
}
/** { ok, why }: whether a peer with `caps` = { name, cores, gpu, cpu } is one the target asks for. */
export function matches(caps, target) {
    if (!caps || !target) return { ok: false, why: "no peer or no target" };
    if (target.gpu === "required" && caps.gpu !== true) return { ok: false, why: "needs a GPU" };
    if (target.gpu === "forbidden" && caps.gpu === true) return { ok: false, why: "wants a box without a GPU" };
    if (target.minCores !== undefined && !(caps.cores >= target.minCores)) return { ok: false, why: `needs ${target.minCores} cores` };
    if (target.peers && !target.peers.includes(caps.name)) return { ok: false, why: "names other peers" };
    if (target.cpuMatch && !String(caps.cpu || "").toLowerCase().includes(target.cpuMatch.toLowerCase())) return { ok: false, why: `needs a CPU matching ${target.cpuMatch}` };
    return { ok: true, why: "" };
}
/** A claim record. */
export const makeClaim = (peer, job, now) => ({ version: VERSION, id: job.id, peer: peer.name, host: peer.host || "", commit: job.commit, since: new Date(now).toISOString(), beat: new Date(now).toISOString() });
/** Seconds since a claim's last beat (Infinity for a claim that has none or an unreadable one). */
export function claimAge(claim, now) { const t = claim && typeof claim.beat === "string" && ISO.test(claim.beat) ? Date.parse(claim.beat) : NaN; return Number.isFinite(t) ? (now - t) / 1000 : Infinity; }
/** A claim is alive while it has not missed STALE_BEATS beats. */
export const claimFresh = (claim, now) => claimAge(claim, now) <= STALE_BEATS * BEAT_S;
/**
 * What this peer should do with one job: { action: "run" | "wait" | "skip", reason }. `state` = { claims: { id: claim }, done: { id: { status } }, cancels: { id: true }, busy: bool, now }.
 * THE ORDER IS THE POINT: a job that is done, cancelled or expired is never run, and is checked before anything about this peer, so a peer that has been busy for a day finds out a job is no longer needed before it asks whether it is free.
 */
export function decide(job, caps, state) {
    const { claims = {}, done = {}, cancels = {}, busy = false, now } = state || {};
    if (cancels[job.id]) return { action: "skip", reason: "cancelled" };
    if (done[job.id]) return { action: "skip", reason: "already done" };
    if (job.expires && now > Date.parse(job.expires)) return { action: "skip", reason: "expired" };
    const m = matches(caps, job.target);
    if (!m.ok) return { action: "skip", reason: "not for this peer: " + m.why };
    const after = job.after || [], failed = after.filter((a) => done[a] && done[a].status !== "ok"), unmet = after.filter((a) => !done[a]);
    if (failed.length) return { action: "skip", reason: "a job it comes after failed: " + failed.join(", ") };
    if (unmet.length) return { action: "wait", reason: "comes after " + unmet.join(", ") };
    const c = claims[job.id];
    if (c && c.peer === caps.name) return { action: "run", reason: "resuming this peer's own claim" };
    if (c && claimFresh(c, now)) return { action: "skip", reason: "claimed by " + c.peer };
    if (busy) return { action: "wait", reason: "this peer is busy" };
    return { action: "run", reason: c ? "taking over a stale claim from " + c.peer : "free" };
}
/** The job to run next out of `items` = [{ job, decision }]: those whose action is run, highest priority first, then the oldest created, then the smaller id; null when there is none. */
export function pick(items) {
    const runs = items.filter((x) => x.decision.action === "run");
    runs.sort((a, b) => (b.job.priority || 0) - (a.job.priority || 0) || Date.parse(a.job.created) - Date.parse(b.job.created) || (a.job.id < b.job.id ? -1 : a.job.id > b.job.id ? 1 : 0));
    return runs.length ? runs[0] : null;
}
