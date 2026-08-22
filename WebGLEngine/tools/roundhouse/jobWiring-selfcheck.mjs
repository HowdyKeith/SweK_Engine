// tools/roundhouse/jobWiring-selfcheck.mjs
//
// v2962 -- THE WIRING: /jobs routes on the hub, runJobs.mjs on the peer.
//
// The queue's rules were proven in v2961. This gate is about the wiring not leaking them: that the HTTP surface
// enforces the same constraints, and above all that EXECUTING a job stays what it claims to be -- calling one of
// the peer's own devices, never interpreting anything the hub sent as code.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emptyQueue, enqueue, claim, complete, queueSummary } from "./jobQueue.mjs";
import { deviceModeTable } from "./deviceModes.mjs";   // v3211: DERIVED -- MODES never existed here
const MODES = await deviceModeTable();
import { getDevice } from "./devices.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const strip = (t) => t.replace(/^\s*\/\/.*$/gm, "").replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
const runner = fs.readFileSync(path.join(here, "runJobs.mjs"), "utf8");
const bridge = fs.readFileSync(path.resolve(here, "..", "..", "ai-bridge", "fingerprintBridge.js"), "utf8");

// ---- 1. EXECUTION IS A REGISTRY LOOKUP, NOT AN INTERPRETATION -------------------------------------------------------------
{
    const code = strip(runner);
    ok("!! the runner has no eval, no dynamic import of a hub-supplied path, no shelling out",
        !/\beval\(|new Function|child_process|\bexec\(|\bspawn\(/.test(code) && !/import\(\s*job\./.test(code),
        "the only import() calls name fixed local modules. A job supplies a device NAME which is looked up in " +
        "this machine's own registry -- the worst a hostile hub can do is ask for a real device with silly " +
        "numbers, which wastes a minute rather than compromising anything");

    ok("!! the peer RE-VALIDATES the spec against its own MODES before running",
        /validateSpec\(/.test(code) && /refused locally/.test(runner),
        "the hub said it was runnable; this machine decides whether it agrees. A build that lacks the device " +
        "refuses locally rather than trusting the offer");

    ok("execution goes through getDevice -- the same registry every gate and census uses",
        /getDevice\(job\.device\)/.test(code) && /dev\.build\(\{ mode: job\.mode, config: job\.config \}\)/.test(code),
        "no separate execution path was invented for jobs, so a job runs exactly what a local run would");
}

// ---- 2. THE HUB VALIDATES BEFORE WORK IS EVER OFFERED ------------------------------------------------------------------------
{
    ok("!! /jobs/add validates each spec against the hub's own registry",
        /J\.enqueue\(q, sp, MODES\)/.test(bridge),
        "enqueue throws on an invalid spec, so a payload-bearing job never even reaches the queue, let alone a peer");

    ok("claim requires a peerKey and is capped",
        /claim needs a peerKey/.test(bridge) && /Math\.min\(4, Math\.max\(1, j\.max \|\| 1\)\)/.test(bridge),
        "an unbounded claim would let one peer drain the queue and then vanish, stranding all of it until every " +
        "lease expired");

    ok("!! completion failures are surfaced as 409, not swallowed",
        /sendJson\(\{ ok: false, error: r\.why \}, 409\)/.test(bridge),
        "a peer trying to complete a job it does not hold gets a conflict and a reason -- the queue's " +
        "holder-only rule is enforced in jobQueue.mjs and reported faithfully rather than being re-implemented here");
}

// ---- 3. ONE PLACE KNOWS WHERE THE QUEUE LIVES ---------------------------------------------------------------------------------
{
    const io = (bridge.match(/job-queue\.json/g) || []).length;
    ok("the queue path is defined once, in jobsIO",
        io === 1 && /async function jobsIO\(\)/.test(bridge),
        "four routes share one accessor. Two routes with their own path string is the duplicated-table bug this " +
        "lab keeps finding -- one gets updated, the other silently reads a stale file");
}

// ---- 4. A REAL JOB ACTUALLY RUNS AND PRODUCES A REAL MEASUREMENT ------------------------------------------------------------------
{
    let q = enqueue(emptyQueue(), { kind: "device-mode", device: "lens", mode: "deflect", config: { b: 5.22 } }, MODES).queue;
    const c = claim(q, "peerGATE", { max: 1 }); q = c.queue;
    const job = c.jobs[0];
    const dev = await getDevice(job.device);
    const res = await dev.build({ mode: job.mode, config: job.config });
    const done = complete(q, job.id, "peerGATE", res);
    ok("!! claim -> run -> complete works against a real device",
        done.ok && Number.isFinite(res.deflectionErrFrac) && queueSummary(done.queue).completed === 1,
        "lens/deflect at b=5.22 returned deflectionErrFrac " + res.deflectionErrFrac.toExponential(2) + " -- the " +
        "strong-field regime graded against Bozza's log limit, the same number a local run gives");

    ok("...and the result stored is the measurement, with no verdict attached",
        done.queue.jobs[job.id].result && !("verdict" in done.queue.jobs[job.id]),
        "the hub grades later with the same graders as everything else");
}

console.log();
if (fails) { console.log("jobWiring-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("jobWiring-selfcheck: all checks pass");
