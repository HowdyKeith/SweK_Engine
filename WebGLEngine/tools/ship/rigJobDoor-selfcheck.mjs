// WebGLEngine/tools/ship/rigJobDoor-selfcheck.mjs -- v2870
//
// Run: node tools/ship/rigJobDoor-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/rigJobBridge.js + the rig-jobs panel on server.html + the runner scripts.
//
// WHY IT EXISTS, AND IT IS A CORRECTION. The rule here is that a tool without a front door is unfinished. I
// applied it to policy-mass, the terrain build and the cross-arch session, then shipped the two most expensive
// things in the tree -- the Rayleigh-Benard sweep and the 2f experiment -- as bare modules with no page and no
// route. Keith asked whether he could run them from server.html; he could not.
//
// SO THE LAST CHECK IN THIS FILE IS THE ONE THAT MATTERS: every long-running experiment module in the tree must
// be REACHABLE from a runner. It is a ratchet against exactly this mistake happening again, and it names the
// offender rather than merely failing.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "rigJobBridge.js"));
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const srcRaw = fs.readFileSync(path.join(ENG, "ai-bridge", "rigJobBridge.js"), "utf8");
// STRIP COMMENTS BEFORE ASKING WHAT THE CODE DOES. This check first failed on the word "queue" inside the comment
// EXPLAINING why there is no queue -- the fifth time this session an instrument of mine has read prose as code
// (new Function on module scripts, "the models are missing", the /codemap guard quoted in its own fix note, the
// aholo swap note, and now this). The lesson is not subtle any more: ask the code, not the commentary.
const src = srcRaw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url, method = "GET", body = null) {
    let captured = null, code = 200;
    const chunk = body == null ? null : JSON.stringify(body);
    const req = { url, method, destroy() {}, on(ev, cb) { if (ev === "data" && chunk) cb(chunk); if (ev === "end") cb(); return req; } };
    await bridge.handle(req, {}, { sendJson: (o, c = 200) => { captured = o; code = c; } });
    return { body: captured, code };
}

// ---- 1. routing ------------------------------------------------------------------------------------------------
{
    ok("owns /rigjob and subpaths", bridge.owns("/rigjob") && bridge.owns("/rigjob/run") && bridge.owns("/rigjob/log"));
    ok("owns NOT a lookalike", !bridge.owns("/rigjobs") && !bridge.owns("/rig") && !bridge.owns("/"));
    ok("unknown subroute -> 404", (await call("/rigjob/wat")).code === 404);
    ok("run via GET -> 405", (await call("/rigjob/run", "GET")).code === 405);
    ok("unknown job is refused with the list", (await call("/rigjob/run", "POST", { id: "nope" })).body.error === "unknown-job");
}

// ---- 2. EVERY JOB SAYS HOW LONG IT TAKES AND WHAT IT SETTLES -----------------------------------------------------
{
    const s = (await call("/rigjob/status")).body;
    ok("status lists jobs", s.ok && s.jobs.length >= 2, s.jobs.map((j) => j.id).join(", "));
    for (const j of s.jobs) {
        ok("job '" + j.id + "' declares a duration", typeof j.minutes === "number" && j.minutes > 0, "~" + j.minutes + " min");
        ok("...and NAMES WHAT IT SETTLES", (j.settles || "").length > 60,
           "a runner that reports a number without naming the question is a toy");
        ok("...and its script exists", j.present === true);
    }
}

// ---- 3. ONE AT A TIME, and the refusal explains itself -------------------------------------------------------------
{
    ok("the busy refusal is explicit in source", /a build is already running|is still running/.test(src));
    ok("!! ...and says WHY, not just no", /CPU-bound|halve both/.test(src),
       "two lattice runs at once halve each other and make the timings meaningless");
    ok("a queue was deliberately not used", !/queue|enqueue/i.test(src),
       "a queue would hide how long the thing you asked for is actually going to take (checked against CODE, comments stripped)");
    ok("...and the reason survives in the source", /queue/i.test(srcRaw),
       "a design decision without its reason gets reversed by the next person");
}

// ---- 4. QUICK MODE MUST NEVER LOOK LIKE A RESULT ---------------------------------------------------------------------
{
    ok("!! quick mode announces that it settles NOTHING", /settles NOTHING/.test(src),
       "a coarse short run that printed a plausible number would be the worst output this could have");
    ok("...and repeats it after the run", /REMINDER: that was QUICK MODE/.test(src));
    const benard = fs.readFileSync(path.join(ENG, "tools", "rig", "run-benard.mjs"), "utf8");
    ok("the runner says so too", /settles NOTHING|shape only/.test(benard));
}

// ---- 5. IT DRIVES THE RUNNERS AND REIMPLEMENTS NOTHING ----------------------------------------------------------------
{
    ok("the bridge spawns scripts rather than computing", /spawn\(/.test(src) && !/makeThermal|nusselt|powerLaw/.test(src));
    const benard = fs.readFileSync(path.join(ENG, "tools", "rig", "run-benard.mjs"), "utf8");
    ok("the benard runner imports the gated module", /benardSweep\.mjs/.test(benard) && !/makeThermal\(/.test(benard),
       "the physics lives in the module; a runner with its own copy could disagree with the gate that proves it");
    ok("...and the analysis comes from the gated discoverer", /symbolicFit\.js/.test(benard));
    const cloth = fs.readFileSync(path.join(ENG, "tools", "rig", "run-cloth-soak.mjs"), "utf8");
    ok("the cloth runner imports the gated module", /clothSoak\.mjs/.test(cloth) && !/findCollisionPairs|solveColorPass/.test(cloth),
       "a runner with its own copy of the soak could disagree with the gate that proves it");
    ok("!! ...and its quick mode does not change the FIXTURE", /NEVER CHANGES THE FIXTURE/.test(cloth),
       "the first quick mode here used a smaller drape, which does not fold, and reported a confident zero");
    const twof = fs.readFileSync(path.join(ENG, "tools", "rig", "run-twof.mjs"), "utf8");
    ok("the 2f runner uses the DERIVED config, not a guessed one", /STABLE_TAU_FLOOR/.test(twof),
       "tau 0.55 is a margin over the 0.545 that actually diverged -- traceable to a measurement, not taste");
}

// ---- 6. WIRED IN + the panel ---------------------------------------------------------------------------------------
{
    ok("server.js requires the bridge", /require\(["']\.\/rigJobBridge\.js["']\)/.test(server));
    ok("server.js dispatches it", /rigJobBridge\.owns\(/.test(server) && /rigJobBridge\.handle\(/.test(server));
    ok("server.html has the panel", /rjList/.test(html) && /\/rigjob\/run/.test(html));
    ok("...polls the log", /\/rigjob\/log/.test(html));
    ok("...and surfaces the duration and what it settles", /j\.minutes/.test(html) && /j\.settles/.test(html));
}

// ---- 7. THE RATCHET: no long experiment may be CLI-only again -----------------------------------------------------
//
// This is the check that exists because I made the mistake. Any module matching the long-experiment shape must be
// reachable from something in tools/rig/, and the failure NAMES the offender rather than just failing.
{
    const LONG = ["simulation/lbm/benardSweep.mjs", "simulation/lbm/twoFExperiment.mjs", "physics/xpbd/clothSoak.mjs"];
    const runnerDir = path.join(ENG, "tools", "rig");
    const runners = fs.existsSync(runnerDir) ? fs.readdirSync(runnerDir).map((f) => fs.readFileSync(path.join(runnerDir, f), "utf8")).join("\n") : "";
    const orphans = LONG.filter((m) => !runners.includes(path.basename(m)));
    ok("!! EVERY LONG EXPERIMENT IS REACHABLE FROM A RUNNER", orphans.length === 0,
       orphans.length ? "CLI-ONLY: " + orphans.join(", ") : LONG.length + " experiments, all with a front door");
    const ids = bridge.JOBS.map((j) => j.id);
    ok("...and every runner is offered as a job", ids.includes("benard") && ids.includes("twof") && ids.includes("cloth-soak"), ids.join(", "));
}

// ---- 8. THE JOB THAT EDITS SOURCE MUST SAY SO (v2885) ------------------------------------------------------------
//
// Keith asked which machine the mutation job runs on. The answer is ANY of them -- it drives verify.mjs in a
// subprocess, pure Node, no GPU, no assets, no toolchain. But it is the ONE JOB THAT EDITS SOURCE IN PLACE, and
// THAT decides where to run it rather than what it needs: not the checkout you have open in an editor, because a
// stranded marker protects against a kill and an editor saving over the restore defeats it.
//
// A property that changes where you may run something has to be visible BEFORE the button, not buried in prose.
{
    const mut = bridge.JOBS.find((j) => j.id === "mutate");
    ok("the mutation suite is registered as a job", !!mut, "it was runnable only by remembering a path");
    ok("!! ...and DECLARES that it edits source", mut && mut.editsSource === true,
       "the one property that decides which machine it may run on");
    ok("...and says so in its description too", /EDITS SOURCE|edits source/i.test(mut.settles || ""));
    ok("...and states it needs no GPU, unlike its neighbours", /ANY MACHINE|any machine/i.test(mut.settles || ""));
    ok("the flag reaches /status", (await call("/rigjob/status")).body.jobs.some((j) => j.editsSource === true));
    ok("!! and the panel flags it BEFORE the button", /EDITS SOURCE/.test(html) && /editsSource/.test(html),
       "a warning inside a description nobody expands is not a warning");
    const runner = fs.readFileSync(path.join(ENG, "tools", "rig", "run-mutate.mjs"), "utf8");
    ok("the runner warns about an open editor", /editing|editor/i.test(runner));
    ok("!! ...and checks for a leftover stranded marker AFTER the run", /marker REMAINS|stranded marker/i.test(runner),
       "a killed run can leave a mutation in the tree, and shipping that would be worse than not running at all");
}

console.log(fails ? "\nrigJobDoor-selfcheck: " + fails + " FAILED" : "\nrigJobDoor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
