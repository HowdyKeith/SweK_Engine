// FILE: ai-bridge/rigJobBridge.js
//
// v2870 - front door for the LONG PHYSICS EXPERIMENTS at /rigjob.
//
// WHY IT EXISTS, AND IT IS A CORRECTION. The standing rule in this project is that every tool needs a front door
// and a CLI-only deliverable is unfinished. I applied that carefully to policy-mass, to the terrain-wasm build,
// and to the cross-arch session -- and then shipped the two most expensive things in the tree, the Rayleigh-
// Benard sweep (v2869, ten minutes) and the f_drag = 2 f_lift experiment (v2862), as bare .mjs modules with no
// page and no route. Keith asked whether he could run them from server.html. He could not. This is that fixed.
//
// The long runs are exactly the ones that most need a door: you want to press something, walk away, and come
// back to a verdict -- not remember an incantation for a machine you are rarely sitting at.
//
// IT DRIVES THE RUNNERS AND REIMPLEMENTS NOTHING. tools/rig/run-*.mjs sequence the already-gated modules; this
// bridge spawns them and streams their output. If it computed anything itself it could disagree with the gate
// that proves the physics, and a dashboard that disagrees with its gate is worse than none because it is
// believed.
//
// ONE JOB AT A TIME, ON PURPOSE. These are CPU-bound lattice runs; two at once would halve both and make the
// timings meaningless. The refusal is explicit rather than a queue, because a queue would hide how long the
// thing you asked for is actually going to take.

const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

const PREFIX = "/rigjob";
function owns(url) { return typeof url === "string" && (url === PREFIX || url.startsWith(PREFIX + "/") || url.startsWith(PREFIX + "?")); }

const ENGINE = path.join(__dirname, "..");

// Every job says how long it takes and WHAT IT SETTLES. A runner that reports a number without naming the
// question it answers is a toy -- the same rule the cross-arch session follows.
const JOBS = [
    {
        // v3533 -- KEITH ASKED FOR A BUTTON RATHER THAN TWO TYPED COMMANDS, AND THIS IS THE REGISTRY THAT ALREADY
        // OWNS THAT SHAPE: a run that takes real time and SETTLES A QUESTION. It is deliberately NOT in
        // reportingTools -- terrain-parity EXITS 2 when the wasm package is missing, naming the file and the
        // command that builds it, and toolFrontDoor requires a reporting tool to PRINT AND EXIT ZERO. Making it
        // exit 0 to fit that registry would destroy the one thing it does well: REFUSING CLEANLY instead of
        // reporting a comfortable nothing, which is the v3201 defect (decisionIndex and gradedCoverage printed
        // NOTHING and exited ZERO, and an empty report is indistinguishable from a tool that never ran).
        id: "terrain-parity",
        label: "Terrain: JS vs WASM parity + speedup",
        script: "tools/terrain-parity.mjs",
        minutes: 2,
        settles: "WHETHER THE WASM FAST PATH IS WORTH SHIPPING, which nothing in this tree can currently answer. " +
                 "v3532 measured that the engine has been on the PURE-JS terrain path the whole time and nothing " +
                 "is broken -- both fallbacks demote silently BY DESIGN. This is the tool that puts a number on " +
                 "what that costs. IT REFUSES WITH exit 2 UNTIL wasm-terrain/build_wasm.bat HAS RUN (needs Rust), " +
                 "naming the missing file AND the command -- so a red run here is an instruction, not a failure.",
    },
    {
        id: "benard",
        label: "Rayleigh-Benard: Nusselt across the convective onset",
        script: "tools/rig/run-benard.mjs",
        minutes: 10,
        settles: "The EXACT key is that Nu = 1 below onset, because the convective term is identically absent. Above onset any exponent is a MEASUREMENT and not a key. Across onset the discoverer must REFUSE -- that refusal is how symbolic regression locates a bifurcation instead of papering over it.",
    },
    {
        id: "mutate",
        label: "Mutation suite: which of these gates could actually FAIL?",
        script: "tools/rig/run-mutate.mjs",
        minutes: 7,
        settles: "Breaks the code on purpose and asks whether the gate notices. A SURVIVING mutation is not a bug in the code -- it is a hole in the net. Found its first survivor at v2494 and has not been run since. RUNS ON ANY MACHINE (pure Node, no GPU), but it is the ONE JOB THAT EDITS SOURCE IN PLACE: run it on a tree nobody has open in an editor. A stranded marker protects against a kill; a save-over does not.",
        editsSource: true,
    },
    {
        // v3604 -- KEITH ASKED FOR A CLOTH BUTTON AND THERE IS NO CLOTH PAGE ANYWHERE IN THE TREE (physics-lab
        // and physics-showcase mention cloth in PROSE only; server.html knows windCloth and nothing else). This
        // registry is the door that already has the right shape, so no page was built to hold one button.
        //
        // AND IT IS HONEST ABOUT ITS COST: this is the CHEAPEST job here by two orders -- SECONDS, not minutes.
        // `minutes: 1` is an upper bound rather than an estimate. The registry is a front door, not a duration
        // club, and stretching the run to look like its neighbours would be inventing work to fit a list.
        id: "cloth-soak",
        label: "Cloth: the honest collision radius, and the soak re-run there",
        script: "tools/rig/run-cloth-soak.mjs",
        minutes: 1,
        settles: "WHAT RADIUS THIS CLOTH IS ENTITLED TO, which decides whether v3602's and v3603's collision " +
                 "numbers mean anything. Two ceilings, both DERIVED: coherence (2r <= h, or a particle overlaps " +
                 "the bonded neighbour adj makes the pass blind to) and feasibility (2r <= h*sqrt(5), bisected " +
                 "by alternating projection). The shipped 5x5 fixture cannot be run at either -- it never folds " +
                 "-- so the soak moves to a drape that does. RUNS ON ANY MACHINE (pure Node, no GPU) and takes " +
                 "SECONDS rather than minutes, unlike everything else on this list.",
    },
    {
        id: "twof",
        label: "f_drag = 2 f_lift: the shedding question open since v2797",
        script: "tools/rig/run-twof.mjs",
        minutes: 25,
        settles: "Whether drag oscillates at twice the lift frequency. The boundary condition is no longer the blocker (v2835's inlet holds to ~0.1%); what is needed is a wide enough channel at high enough Reynolds to hold a limit cycle. Buying Reynolds costs domain AREA quadratically, which is why this is a rig job and not a longer sandbox run.",
    },
];

const R = { running: null, log: "", exit: null, startedAt: 0, finishedAt: 0, quick: false, state: "idle" };

// v2988 -- THE LIFECYCLE IS DECLARED ONCE, in ui/machine.mjs, and this bridge VALIDATES ITS OWN TRANSITIONS
// against it. Before this, the panel inferred the state from a handful of fields (running non-null? exit set?
// finishedAt later than startedAt?) and the bridge never named a state at all -- so the declared machine and the
// real behaviour could disagree with nothing to notice.
//
// A REFUSED TRANSITION IS LOGGED, NOT THROWN. An event fired in the wrong state is a bug in the caller, and
// crashing the job runner over it would turn a reporting error into an outage. But it must not be SILENT: a
// silent no-op is exactly the orchestration failure the machine exists to end.
let _machine = null;
async function _lifecycle() {
    if (!_machine) _machine = (await import("../ui/machine.mjs")).RIG_JOB;
    return _machine;
}
async function _transition(event) {
    const m = await _lifecycle();
    const next = m.next(R.state, event);
    if (next === null) {
        console.warn("[rigjob] REFUSED transition: '" + event + "' is not handled in state '" + R.state +
                     "'. The declared lifecycle is in ui/machine.mjs; one of the two is wrong.");
        return R.state;
    }
    R.state = next;
    return next;
}
const push = (d) => { R.log = (R.log + String(d)).slice(-131072); };

function status() {
    return {
        ok: true,
        jobs: JOBS.map((j) => ({ id: j.id, label: j.label, minutes: j.minutes, settles: j.settles, editsSource: !!j.editsSource, present: fs.existsSync(path.join(ENGINE, j.script)) })),
        run: { running: R.running, exit: R.exit, startedAt: R.startedAt, finishedAt: R.finishedAt, quick: R.quick },
        note: "Long lattice runs. One at a time -- two would halve both and make the timings meaningless.",
    };
}

function start(id, quick) {
    if (R.running) return { ok: false, error: "busy", message: "'" + R.running + "' is still running. These are CPU-bound; running two would halve both." };
    const job = JOBS.find((j) => j.id === id);
    if (!job) return { ok: false, error: "unknown-job", available: JOBS.map((j) => j.id) };
    const scriptPath = path.join(ENGINE, job.script);
    if (!fs.existsSync(scriptPath)) return { ok: false, error: "missing-script", message: job.script + " is not in the tree" };

    R.running = id; R.exit = null; R.startedAt = Date.now(); R.finishedAt = 0; R.quick = !!quick;
    R.log = "[rigjob] " + job.label + "\n[rigjob] started " + new Date().toISOString() +
            (quick ? "  QUICK MODE -- coarse grid and short runs. This shows the SHAPE and settles NOTHING.\n" : "  expect roughly " + job.minutes + " minutes\n");
    let child;
    try {
        child = spawn(process.execPath, [scriptPath].concat(quick ? ["--quick"] : []), { cwd: ENGINE, windowsHide: true });
    } catch (e) {
        R.running = null; R.exit = -1; R.finishedAt = Date.now();
        push("spawn failed: " + (e && e.message) + "\n");
        return { ok: false, error: "spawn", message: String(e && e.message) };
    }
    child.on("error", (e) => { R.running = null; R.exit = -1; R.finishedAt = Date.now(); push("\nerror: " + (e && e.message) + "\n"); });
    if (child.stdout) child.stdout.on("data", push);
    if (child.stderr) child.stderr.on("data", push);
    child.on("exit", (c) => {
        R.running = null; R.exit = c; R.finishedAt = Date.now();
        push("\n[rigjob] exited " + c + (c === 0 ? "" : "  -- the run FAILED; the output above says where") + "\n");
        if (R.quick) push("[rigjob] REMINDER: that was QUICK MODE. It settles nothing.\n");
    });
    return { ok: true, started: true, id, quick: !!quick, minutes: job.minutes };
}

function readBody(req, limit = 16384) {
    return new Promise((resolve) => {
        let s = "";
        req.on("data", (c) => { s += c; if (s.length > limit) { s = s.slice(0, limit); req.destroy(); } });
        req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
        req.on("error", () => resolve({}));
    });
}

async function handle(req, res, { sendJson }) {
    const url = new URL(req.url, "http://x");
    const route = url.pathname.slice(PREFIX.length) || "/";
    if (route === "/status" || route === "/" || route === "/list") return sendJson(status());
    if (route === "/log") return sendJson({ ok: true, running: R.running, exit: R.exit, quick: R.quick, log: R.log.slice(-131072) });
    if (route === "/run") {
        if (req.method !== "POST") return sendJson({ ok: false, error: "method", message: "POST {id} to /rigjob/run" }, 405);
        const body = await readBody(req);
        const r = start(body.id, body.quick);
        return sendJson(r, r.ok ? 200 : 400);
    }
    return sendJson({ ok: false, error: "unknown-route", route }, 404);
}

module.exports = { owns, handle, PREFIX, JOBS, status, start };
