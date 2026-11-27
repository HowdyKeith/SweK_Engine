// WebGLEngine/tools/ship/peerJobs.mjs -- UNNUMBERED (the version is chosen at ship time) (the queue operations are tools/ship/peerJobsQueue.mjs; the command is tools/ship/peerJobsCmd.mjs; the gate is tools/ship/peerJobs-selfcheck.mjs)
//
// PEER JOBS: A GIT FOLDER AS THE QUEUE FOR LONG RUNS (Keith, 2026-11-23: "have the SweK Engine monitor a git repo folder for these pushed job runs, and then have whichever free SweK Engine peer ... pick it up, maybe queue it up if that peer was busy, and then when the
// peer was free check if the job was still needed ... run our job on just the GPU box, or the Intel CPU only box, as requested ... the results then pushed back to the git repo folder when completed").
// THIS FILE IS THE PURE HALF: what a job is, who may run it, whether this peer should, and in what order. It reads and writes nothing; the queue operations hand it the files.
//
//   THE FOLDER (a dedicated branch, `peer-jobs`, never the working branch):   jobs/<id>.json   a signed job      claims/<id>.json   who is running it, with a heartbeat      cancel/<id>.json   a request to stop wanting it      results/<id>/done.json (+ the result files)   finished
//   *** A JOB FILE IS NOT A COMMAND. *** Whoever can push to the branch could otherwise run anything on every peer. So a job names a KIND from a closed list (`rounds`: tools/ship/rigRunner.mjs --rounds ..., `selftest`, or `study`: tools/ship/studyRunner.mjs --study <a name from tools/ship/studyJobs.mjs's registry>), the round numbers (digits only), a target and a commit; THE PEER BUILDS THE
//   COMMAND LINE ITSELF from those fields (argvFor), refuses any field it does not know, and refuses a job whose HMAC-SHA256 signature (a secret each peer holds) does not verify. A job text is data.
//   THE CLAIM IS THE PUSH: two peers that both write claims/<id>.json and push cannot both succeed, so the one whose push is refused has lost and goes on to the next job. A claim carries a heartbeat; one that has missed STALE_BEATS beats is dead and may be taken over.
"use strict";
import crypto from "node:crypto";

export const VERSION = 1, QUEUE_BRANCH = "peer-jobs", BEAT_S = 600, STALE_BEATS = 3, MAX_ROUNDS = 8, MAX_AFTER = 8;
// A failed run is tried again (the runner resumes where it stopped) up to MAX_ATTEMPTS times, RETRY_S apart; a result file above RESULT_MAX_BYTES is left out (a git host refuses 100 MB); a saved state file above STATE_MAX_BYTES is not shared.
export const MAX_ATTEMPTS = 3, RETRY_S = 600, RESULT_MAX_BYTES = 90e6, STATE_MAX_BYTES = 40e6, PRESENCE_FRESH_S = 1800;
export const KINDS = Object.freeze(["rounds", "selftest", "study"]), GPU = Object.freeze(["any", "required", "forbidden"]);
const ID = /^[a-z0-9][a-z0-9-]{2,62}$/, STUDY = /^[a-z0-9][a-z0-9-]{2,62}$/, ROUND = /^\d{1,3}$/, SHA = /^[0-9a-f]{40}$/, ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/, PEER = /^[A-Za-z0-9][\w.-]{0,39}$/, TEXT = /^[\x20-\x7e]{0,200}$/, CPU = /^[\w .()@-]{1,40}$/;
const FIELDS = new Set(["version", "id", "kind", "rounds", "study", "workers", "zip", "target", "priority", "created", "expires", "after", "commit", "by", "note", "sig"]), TARGET_FIELDS = new Set(["gpu", "minCores", "peers", "cpuMatch"]);
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
    // 2026-11-26 -- a STUDY names one entry of tools/ship/studyJobs.mjs's closed registry; the name is all it carries, and the runner at the job's commit refuses a name its registry does not hold
    if (spec.kind === "study") {
        if (typeof spec.study !== "string" || !STUDY.test(spec.study)) e.push("study must be 3 to 63 characters of a-z, 0-9 and -, starting with a letter or digit");
        if (spec.rounds !== undefined && !(Array.isArray(spec.rounds) && spec.rounds.length === 0)) e.push("a study takes no rounds");
    } else if (spec.study !== undefined) e.push("only a study job names a study");
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
    if (spec.kind === "study") return ["tools/ship/studyRunner.mjs", "--study", spec.study, "--workers", String(workers)];
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
    const at = (state && state.attempts && state.attempts[job.id]) || null;
    if (at && at.n >= MAX_ATTEMPTS) return { action: "skip", reason: `failed ${at.n} times` };
    if (at && Number.isFinite(Date.parse(at.at)) && now < Date.parse(at.at) + RETRY_S * 1000) return { action: "wait", reason: `retrying after a failure (attempt ${at.n + 1} of ${MAX_ATTEMPTS})` };
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

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
// WHAT SURVIVES AN INTERRUPTION, WHAT THE PEERS SEE, AND THE ORDER A PLAN ASKS FOR (Keith, 2026-11-23: peers "keep resuming if interrupted, and return results on their own"; "the peers could see what is running, and on which peers")
/** Whether a file of the runner's data folder belongs to a job that runs `rounds`: head-to-head<round> then a dash or a dot (so round 7 never takes round 70's files), a plain name, not an archive. */
export function isStateFile(name, rounds) {
    if (typeof name !== "string" || !Array.isArray(rounds) || /[\\/]/.test(name) || /\.(zip|gz|tar)$/i.test(name)) return false;
    const m = /^head-to-head(\d{1,3})[-.][\w.-]*$/.exec(name);
    return !!m && rounds.includes(m[1]);
}
const lines = (t) => String(t).split("\n").filter((l) => l.trim()).length;
/** Which of two copies of one data file is further on: "a" or "b". Texts (null is no copy). A search file (.jsonl) by its lines, a state file (-state-<seed>.json) by its `iter`, any other file by its length; a tie keeps "a". */
export function betterFile(name, a, b) {
    if (a === null || a === undefined) return b === null || b === undefined ? "a" : "b";
    if (b === null || b === undefined) return "a";
    if (/\.jsonl$/.test(name)) return lines(b) > lines(a) ? "b" : "a";
    if (/-state-[\w.-]*\.json$/.test(name)) {
        const it = (t) => { try { const v = JSON.parse(t).iter; return Number.isInteger(v) ? v : -1; } catch (e) { return -1; } };
        return it(b) > it(a) ? "b" : "a";
    }
    return String(b).length > String(a).length ? "b" : "a";
}
/** What a peer is doing, from the tail of the runner's output: { round, phase } of the last "[rig] ... H<round> <search|fly|read>:" line, or null. */
export function progressOf(logTail) {
    const all = [...String(logTail || "").matchAll(/\[rig\] \S+ H(\d{1,3}) (search|fly|read):/g)];
    if (!all.length) return null;
    const m = all[all.length - 1]; return { round: m[1], phase: m[2] };
}
/** A peer's presence record, one file per peer: who it is and what it is doing (`doing` null when idle, else { job, round, phase, rounds }). */
export const makePresence = (caps, doing, now, extra = {}) => ({ version: VERSION, name: caps.name, host: caps.host || "", cores: caps.cores, cpu: caps.cpu || "", gpu: caps.gpu === true, doing: doing || null, since: extra.since || new Date(now).toISOString(), seen: new Date(now).toISOString() });
/** A presence record is fresh while it was seen within PRESENCE_FRESH_S seconds. */
export function presenceFresh(rec, now) { const t = rec && typeof rec.seen === "string" && ISO.test(rec.seen) ? Date.parse(rec.seen) : NaN; return Number.isFinite(t) && (now - t) / 1000 <= PRESENCE_FRESH_S; }
/** The lines that say what is running and where, from the folder's state ({ jobs: [{ spec }], claims, done, peers }): one per claim (job, peer, how long ago its last beat) and one per peer (idle, or what it runs; a stale one says so). */
export function whoLines(st, now) {
    const out = [];
    for (const [id, c] of Object.entries(st.claims || {})) out.push(`running ${id}: on ${c.peer}${c.host ? " (" + c.host + ")" : ""}, since ${c.since}, last beat ${Math.round(claimAge(c, now))} s ago (${claimFresh(c, now) ? "alive" : "STALE"})`);
    for (const [name, r] of Object.entries(st.peers || {}).sort()) {
        const fresh = presenceFresh(r, now), d = r.doing;
        out.push(`peer ${name}: ${r.cores} cores${r.gpu ? ", GPU" : ""}, ${fresh ? (d ? `running ${d.job}${d.round ? " H" + d.round + " " + d.phase : ""}` : "idle") : "NOT SEEN for " + Math.round((now - Date.parse(r.seen)) / 60000) + " min"}`);
    }
    return out;
}
/**
 * The jobs a plan asks for, in the order it asks for them. A plan = { prefix, jobs: [{ round | rounds, priority, target?, workers?, note? }] }; every job becomes ONE signed `rounds` job `<prefix>-h<round>` so
 * that free peers take different rounds at once, and the order is the priority (highest first; then the order written). `ctx` = { commit, by, now }. Throws a message on a bad plan; an id or priority repeated, a priority outside
 * -9 to 9 and a job that would not validate are all refused.
 */
export function planJobs(plan, ctx) {
    if (!plan || typeof plan !== "object" || !Array.isArray(plan.jobs) || plan.jobs.length < 1) throw new Error("planJobs: a plan is { prefix, jobs: [..] } with at least one job");
    const prefix = plan.prefix === undefined ? "rig" : plan.prefix;
    if (typeof prefix !== "string" || !/^[a-z0-9][a-z0-9-]{0,30}$/.test(prefix)) throw new Error("planJobs: the prefix is 1 to 31 characters of a-z, 0-9 and -");
    const seen = new Set(), out = [];
    plan.jobs.forEach((j, i) => {
        const rounds = j.rounds !== undefined ? j.rounds : [j.round];
        if (!Array.isArray(rounds) || rounds.length < 1 || !rounds.every((r) => typeof r === "string" && ROUND.test(r))) throw new Error(`planJobs: job ${i + 1} needs a round (digits as a string)`);
        const id = `${prefix}-h${rounds.join("-h")}`;
        if (seen.has(id)) throw new Error(`planJobs: job ${id} is in the plan twice`);
        seen.add(id);
        const spec = { version: VERSION, id, kind: "rounds", rounds, target: j.target || { gpu: "any" }, priority: j.priority === undefined ? 0 : j.priority, created: new Date(ctx.now + i * 1000).toISOString().replace(/\.\d+Z$/, "Z"), commit: ctx.commit, by: ctx.by, ...(j.workers !== undefined ? { workers: j.workers } : {}), ...(j.note !== undefined ? { note: j.note } : {}) };
        const bad = validateJob(spec);
        if (bad.length) throw new Error(`planJobs: job ${id}: ${bad[0]}`);
        out.push(spec);
    });
    return out;
}
/** The ids in the order the peers will take them (priority, then created, then id: `pick`'s order) for a list of specs. */
export const orderOf = (specs) => [...specs].sort((a, b) => (b.priority || 0) - (a.priority || 0) || Date.parse(a.created) - Date.parse(b.created) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((x) => x.id);
