// tools/roundhouse/jobQueue-selfcheck.mjs
//
// v2961 -- JOB DISTRIBUTION, AND THE TWO WAYS A WORK QUEUE GOES WRONG.
//
//   1. IT BECOMES A CODE CHANNEL. A job that carries a command, a script or a module path is remote code
//      execution wearing a work queue's clothes -- and with a dozen rotating tunnel URLs, impersonating the hub
//      is not hard. A job here NAMES work from a fixed catalog; the peer resolves it in its OWN registry and
//      refuses anything it does not already know how to do.
//
//   2. IT SILENTLY STALLS. A peer that claims work and vanishes -- phone reaped, laptop shut, tunnel dropped --
//      must not hold that job forever. Claims are LEASES that expire and return the work to the pool, so an
//      abandoned job is recovered rather than lost. A queue full of jobs held by machines that are never coming
//      back looks busy and is stalled.

import { emptyQueue, enqueue, claim, complete, claimable, queueSummary, validateSpec, JOB_KINDS } from "./jobQueue.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED -- MODES never existed here
const MODES = await deviceModeTable();

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const spec = (o = {}) => ({ kind: "device-mode", device: "lens", mode: "deflect", config: { b: 10 }, ...o });

// ---- 1. A JOB NAMES WORK; IT CANNOT CARRY IT -----------------------------------------------------------------------------
{
    const bad = [
        ["a shell command", spec({ command: "rm -rf /" })],
        ["a script field", spec({ script: "evil()" })],
        ["a module path", spec({ module: "/tmp/payload.mjs" })],
        ["a script inside config", spec({ config: { script: "evil()" } })],
        ["an object in config", spec({ config: { b: { nested: 1 } } })],
        ["an array in config", spec({ config: { b: [1, 2, 3] } })],
    ];
    const refused = bad.filter(([, s]) => !validateSpec(s, MODES).ok);
    ok("!! every payload-bearing job is refused",
        refused.length === bad.length,
        refused.length + "/" + bad.length + " refused: commands, scripts, module paths, and any non-primitive " +
        "config value. An object is where a payload hides, so config takes numbers, strings and booleans only");

    ok("!! the catalog is closed -- an unknown kind is refused",
        !validateSpec(spec({ kind: "run-arbitrary" }), MODES).ok && JOB_KINDS.length === 3,
        "three kinds exist and nothing else is accepted. A queue that accepted novel kinds would let a hub " +
        "invent work the peer never agreed to do");
}

// ---- 2. THE REGISTRY IS THE AUTHORITY, NOT THE JOB -------------------------------------------------------------------------
{
    ok("!! an unknown device, and a known device with an unknown mode, are both refused",
        !validateSpec(spec({ device: "notreal" }), MODES).ok &&
        !validateSpec(spec({ mode: "nonsense" }), MODES).ok,
        "the peer resolves device and mode in its own MODES map. A job cannot introduce a device -- it can only " +
        "select one that already exists on the machine being asked");

    ok("...and a genuinely valid job passes",
        validateSpec(spec(), MODES).ok,
        "lens/deflect with b=10 -- real device, real mode, primitive config");
}

// ---- 3. A CLAIM IS A LEASE, AND AN ABANDONED ONE COMES BACK -----------------------------------------------------------------
{
    let q = enqueue(emptyQueue(), spec(), MODES, { at: "2026-07-25T10:00:00Z" }).queue;
    const c = claim(q, "peerA", { now: "2026-07-25T10:00:00Z", leaseMs: 60000 });
    q = c.queue;
    ok("a claimed job is not claimable by anyone else while the lease holds",
        c.jobs.length === 1 && claimable(q, { now: "2026-07-25T10:00:30Z" }).length === 0,
        "peerA holds it for the lease duration; a second peer asking 30s later gets nothing");

    ok("!! when the lease expires the job returns to the pool",
        claimable(q, { now: "2026-07-25T10:02:00Z" }).length === 1,
        "two minutes on a one-minute lease and the job is claimable again. A peer that was reaped mid-run " +
        "cannot strand the work -- which is the difference between a fleet that recovers and one that quietly " +
        "fills with jobs nobody is doing");

    const again = claim(q, "peerB", { now: "2026-07-25T10:02:00Z" });
    ok("...and the reclaim is counted, so a job that keeps failing is visible",
        again.jobs[0].attempts === 2 && queueSummary(again.queue, { now: "2026-07-25T10:02:01Z" }).inFlight === 1,
        "attempts=2. A job claimed repeatedly and never completed is telling you something about the job or the " +
        "peers, and the summary surfaces any job at three or more attempts as 'struggling'");
}

// ---- 4. ONLY THE HOLDER CAN COMPLETE A JOB --------------------------------------------------------------------------------
{
    let q = enqueue(emptyQueue(), spec(), MODES).queue;
    q = claim(q, "peerA", { max: 1 }).queue;
    const id = Object.keys(q.jobs)[0];

    const thief = complete(q, id, "peerB", { deflectionErrFrac: 0 });
    ok("!! a peer cannot complete a job it does not hold",
        thief.ok === false && /held by peerA/.test(thief.why),
        "otherwise any peer could close out another's work with whatever result it liked, and the queue would " +
        "report finished work that nobody did");

    const good = complete(q, id, "peerA", { deflectionErrFrac: 0.0025 });
    ok("the holder can complete it, once",
        good.ok === true && complete(good.queue, id, "peerA", {}).ok === false,
        "a second completion is refused -- results are recorded, not overwritten");

    ok("the queue summary counts it as completed and no longer pending",
        queueSummary(good.queue).completed === 1 && queueSummary(good.queue).pending === 0,
        "pending / in-flight / completed / reclaimed are separate counts, so a stalled fleet cannot look like a " +
        "busy one");
}

// ---- 5. THE PEER REPORTS A MEASUREMENT, NOT A VERDICT ------------------------------------------------------------------------
{
    let q = enqueue(emptyQueue(), spec(), MODES).queue;
    q = claim(q, "peerA", { max: 1 }).queue;
    const id = Object.keys(q.jobs)[0];
    const done = complete(q, id, "peerA", { deflectionErrFrac: 0.0025, deflectionRegime: "strong" });
    ok("!! the stored result is the peer's measurement; nothing in the queue grades it",
        done.ok && !("verdict" in done.queue.jobs[id]) && !("graded" in done.queue.jobs[id]),
        "the job record holds what was measured. Grading happens on the hub with the same graders everything " +
        "else goes through -- the same phone-measures / desktop-adjudicates split as the ballot, the magmap " +
        "report, the persistence ledger and the lighthouse check-in");
}

console.log();
if (fails) { console.log("jobQueue-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("jobQueue-selfcheck: all checks pass");
