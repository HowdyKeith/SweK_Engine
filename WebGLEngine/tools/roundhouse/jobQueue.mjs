// tools/roundhouse/jobQueue.mjs
//
// v2961 -- JOB DISTRIBUTION. The hub knows who is out there (lighthouse), results can come home (submit,
// outbox), and a peer can run any of 24 devices across 91 modes. What was missing is the middle: handing work
// out. This is that queue.
//
// THE RULE, and it is the update-policy lesson in a second costume:
//
//     A JOB NAMES WORK FROM A FIXED CATALOG. IT NEVER CARRIES CODE.
//
// The tempting design is a job that contains a command, or a script, or a module path -- infinitely flexible and
// exactly a remote-code-execution channel wearing a work queue's clothes. A hub that can send code to a peer is
// a hub that can own that machine, and one of a dozen rotating tunnel URLs is all it would take to impersonate
// one. So a job says "run device `lens`, mode `deflect`, with b=10". The peer looks those up in ITS OWN registry
// and refuses anything it does not already know how to do. Config values must be primitives -- numbers, strings,
// booleans -- because an object is where a payload hides.
//
// AND THE SECOND RULE, which keeps the queue honest rather than merely safe:
//
//     A CLAIM IS A LEASE, NOT A TRANSFER.
//
// A peer that claims a job and vanishes -- phone reaped, laptop closed, tunnel died -- must not strand that work
// forever. Claims expire and the job returns to the pool. The alternative is a queue that slowly fills with jobs
// held by machines that are never coming back, which looks like a busy fleet and is actually a stalled one.

export const JOB_KINDS = ["device-mode", "magmap", "suite"];
export const DEFAULT_LEASE_MS = 45 * 60 * 1000;   // long enough for the ~25min suite plus slack

export function emptyQueue() { return { kind: "swek-job-queue", version: 1, jobs: {}, seq: 0 }; }

const isPrimitive = (v) => v === null || ["number", "string", "boolean"].includes(typeof v);

/**
 * Validate a job spec against the catalog. `modes` is the peer's or hub's own MODES map -- the authority is the
 * registry, never the job.
 */
export function validateSpec(spec, modes) {
    const problems = [];
    if (!spec || typeof spec !== "object") return { ok: false, problems: ["no spec"] };
    if (!JOB_KINDS.includes(spec.kind)) problems.push(`unknown kind ${JSON.stringify(spec.kind)} -- catalog is ${JOB_KINDS.join(", ")}`);
    if (spec.kind === "device-mode") {
        // v3211 -- TWO THINGS WERE WEARING ONE LABEL, AND IT COST THE WHOLE JOB SUBSYSTEM.
        // `!modes` and `!modes[spec.device]` reported the SAME sentence: `unknown device "lens"`. The first
        // means MY TABLE IS MISSING, a wiring fault on this side; the second means YOU NAMED A DEVICE THAT DOES
        // NOT EXIST, a bad spec from the caller. For as long as MODES has been a broken import, POST /jobs/add
        // has answered a perfectly good lens/deflect job with "unknown device \"lens\"" -- BLAMING THE CALLER FOR
        // THE SERVER'S OWN BROKEN IMPORT, which is why nobody went looking. The guard failing CLOSED is what
        // kept this a dead subsystem rather than an open door, and that `!modes ||` was deliberate; only the
        // MESSAGE was wrong.
        if (!modes) problems.push("no device-mode table was supplied -- this is a WIRING FAULT on the validating side, not a bad spec");
        else if (!modes[spec.device]) problems.push(`unknown device ${JSON.stringify(spec.device)} -- known: ${Object.keys(modes).sort().join(", ")}`);
        else if (!modes[spec.device].includes(spec.mode)) problems.push(`device ${spec.device} has no mode ${JSON.stringify(spec.mode)}`);
    }
    // config must be flat primitives: an object or a function is where code would hide
    const cfg = spec.config || {};
    if (typeof cfg !== "object" || Array.isArray(cfg)) problems.push("config must be a flat object");
    else for (const [k, v] of Object.entries(cfg)) {
        if (!isPrimitive(v)) problems.push(`config.${k} is ${Array.isArray(v) ? "an array" : typeof v} -- only numbers, strings and booleans are accepted`);
    }
    // explicit belt-and-braces: reject anything that smells like a payload even if it were a string
    for (const key of ["script", "command", "cmd", "exec", "module", "path", "eval", "code"]) {
        if (key in (spec || {}) || key in cfg) problems.push(`'${key}' is not a job field -- jobs name work, they do not carry it`);
    }
    return { ok: problems.length === 0, problems };
}

/** Add a job. Returns the queue and the created job, or throws with the reasons. */
export function enqueue(queue, spec, modes, { at = null } = {}) {
    const v = validateSpec(spec, modes);
    if (!v.ok) throw new Error("invalid job: " + v.problems.join("; "));
    const out = { ...queue, jobs: { ...queue.jobs }, seq: (queue.seq || 0) + 1 };
    const id = "job-" + String(out.seq).padStart(5, "0");
    out.jobs[id] = {
        id, kind: spec.kind, device: spec.device || null, mode: spec.mode || null,
        config: { ...(spec.config || {}) },
        createdAt: at || new Date().toISOString(),
        claimedBy: null, claimedAt: null, leaseUntil: null,
        completedAt: null, result: null, attempts: 0,
    };
    return { queue: out, job: out.jobs[id] };
}

/** Jobs available to claim right now: never completed, and not under a live lease. */
export function claimable(queue, { now = null } = {}) {
    const t = now ? new Date(now).getTime() : Date.now();
    return Object.values(queue.jobs || {}).filter((j) => !j.completedAt && (!j.leaseUntil || new Date(j.leaseUntil).getTime() <= t));
}

/**
 * A peer claims up to `max` jobs. The lease is what makes an abandoned claim recoverable: when it expires the
 * job is claimable again, and `attempts` records how many times that has happened -- a job that keeps being
 * claimed and never finished is telling you something.
 */
export function claim(queue, peerKey, { max = 1, now = null, leaseMs = DEFAULT_LEASE_MS } = {}) {
    const t = now ? new Date(now) : new Date();
    const out = { ...queue, jobs: { ...queue.jobs } };
    const taken = [];
    for (const j of claimable(out, { now: t.toISOString() })) {
        if (taken.length >= max) break;
        out.jobs[j.id] = { ...j, claimedBy: peerKey, claimedAt: t.toISOString(), leaseUntil: new Date(t.getTime() + leaseMs).toISOString(), attempts: j.attempts + 1 };
        taken.push(out.jobs[j.id]);
    }
    return { queue: out, jobs: taken };
}

/**
 * Record a completed job. The peer supplies the RESULT it measured; it does not supply a verdict, and it cannot
 * complete a job it does not hold -- otherwise any peer could close out another's work with whatever it liked.
 */
export function complete(queue, id, peerKey, result, { at = null } = {}) {
    const j = (queue.jobs || {})[id];
    if (!j) return { queue, ok: false, why: "no such job" };
    if (j.completedAt) return { queue, ok: false, why: "already completed" };
    if (j.claimedBy !== peerKey) return { queue, ok: false, why: `job is held by ${j.claimedBy || "nobody"}, not ${peerKey}` };
    const out = { ...queue, jobs: { ...queue.jobs } };
    out.jobs[id] = { ...j, completedAt: at || new Date().toISOString(), result: result === undefined ? null : result, leaseUntil: null };
    return { queue: out, ok: true };
}

export function queueSummary(queue, { now = null } = {}) {
    const all = Object.values(queue.jobs || {});
    const t = now ? new Date(now).getTime() : Date.now();
    const held = all.filter((j) => !j.completedAt && j.leaseUntil && new Date(j.leaseUntil).getTime() > t);
    const expired = all.filter((j) => !j.completedAt && j.leaseUntil && new Date(j.leaseUntil).getTime() <= t);
    return {
        total: all.length,
        pending: claimable(queue, { now }).length,
        inFlight: held.length,
        completed: all.filter((j) => j.completedAt).length,
        reclaimed: expired.length,
        // a job claimed repeatedly and never finished is a signal, not noise
        struggling: all.filter((j) => !j.completedAt && j.attempts >= 3).map((j) => ({ id: j.id, attempts: j.attempts, device: j.device, mode: j.mode })),
    };
}
