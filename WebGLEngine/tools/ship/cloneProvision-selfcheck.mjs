#!/usr/bin/env node
// tools/ship/cloneProvision-selfcheck.mjs -- v4668
//
// Run: node tools/ship/cloneProvision-selfcheck.mjs      (~7.2s)
//
// *** v4670 -- THIS LINE SAID 0.2s AND THE GATE TOOK 60.1s, AND THE HEADER WAS NOT THE DEFECT. ***
// 0.2s was TRUE at v4668, when every row drove _provision with an injected runner. v4668c added the kill-
// escalation rows, which spawn real children and wait out a real grace period: 7.1s of actual work. The other
// 53 SECONDS were a 60 s deadline timer in sourceChainBridge's resolver probe whose handle v4668 threw away --
// harmless, since the settle was once-only, and it held the event loop open for the full minute anyway.
// FOUND BY ASKING WHY THE DECLARATION DISAGREED WITH THE CLOCK. See tools/ship/deadlineLeak.mjs.
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/sourceChainBridge.js's provisioning step.
//
// *** WHY THIS EXISTS, MEASURED RATHER THAN ARGUED. *** At v4667 the rig ran the safe publish route and the
// fresh clone reported 121 NEW red where the provisioned working checkout reported 26. 116 of the 121 reach
// the browser harness. The cause was one line that was never written: cloneEngineSource does
// `git clone --depth 1` and stops, node_modules is gitignored, and playwright is a dependency of
// WebGLEngine/tools/render-qa. So `Publish the verified clone`, which refuses on a red verdict, could NEVER
// unlock -- and the ship skill's own note that 3 of 261 versions were ever published had a mechanism sitting
// under it the whole time. The 116 reds did not look like a missing install; they looked like broken code.
//
// Every row below DRIVES the function. The runner is injected, so the branches that would otherwise need a
// network -- a failed install, an install that exits 0 and lands nothing -- are reachable here.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHAIN = require(path.join(ENG, "ai-bridge", "sourceChainBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("cloneProvision-selfcheck -- the safe publish route could not pass, and this is the step it was missing\n");

// A throwaway tree shaped like a clone's WebGLEngine.
const mk = (opts = {}) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cloneprov-"));
    const qa = path.join(root, "tools", "render-qa");
    if (opts.pkg !== false) { fs.mkdirSync(qa, { recursive: true }); fs.writeFileSync(path.join(qa, "package.json"), "{}"); }
    if (opts.installed) fs.mkdirSync(path.join(qa, "node_modules", "playwright"), { recursive: true });
    return root;
};
const trees = [];
const tree = (o) => { const t = mk(o); trees.push(t); return t; };

// ---- 1. THE PATH IS THE RESOLVER'S, AND THE TWO FILES ARE HELD TOGETHER HERE ---------------------------
console.log("1. *** THE CHECK ASKS THE CONSUMER'S QUESTION, NOT npm's EXIT CODE AND NOT A PATH ***");
{
    const CHAIN_SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "sourceChainBridge.js"), "utf8");
    const RES = fs.readFileSync(path.join(ENG, "tools", "ship", "playwrightResolve.mjs"), "utf8");

    // *** v4668b -- THE FIRST VERSION OF THIS SECTION ASSERTED A COUPLING THAT SHOULD NOT EXIST, AND
    // DESCRIBED IT WRONGLY. *** It said the tree-local path was "the resolver's FIRST candidate" and held the
    // two files to it. PLAYWRIGHT_PATHS tries the bare specifiers "playwright" and "playwright-core" ahead
    // of it, so it is THIRD -- the row passed while its own sentence was false. Worse, the whole idea was
    // wrong: a provisioner that re-implements the resolver's search has to be updated whenever that search
    // moves. It asks the resolver now, so there is no order to get wrong and nothing to keep in step.
    ok("!! *** the tree-local path is NOT the resolver's first candidate, which the first draft of this row claimed ***",
        /PLAYWRIGHT_PATHS = \[\s*\n\s*"playwright",\s*\n\s*"playwright-core",/.test(RES),
        "two bare specifiers come first. The row that asserted otherwise was green the whole time it was " +
        "wrong, which is why the coupling was removed rather than corrected");

    ok("!! *** provisioning is confirmed by RUNNING the clone's own resolver, not by testing a directory ***",
        /_askTheResolver/.test(CHAIN_SRC) && /playwrightResolve\.mjs/.test(CHAIN_SRC) &&
        /browserSkipReason/.test(CHAIN_SRC),
        "a directory proves the npm PACKAGE landed. `playwright install chromium` is a POSTINSTALL script, " +
        "so --ignore-scripts, a failed script or a blocked CDN all leave the package there and no browser " +
        "anywhere -- and the verify then produces the same ~116 reds this round exists to stop, with " +
        "provisioning reporting success");

    ok("...and the probe is written to the OS temp dir, never into the clone",
        /mkdtempSync\(path\.join\(os\.tmpdir\(\)/.test(CHAIN_SRC) && !/writeFileSync\(path\.join\(cloneEngine/.test(CHAIN_SRC),
        "a provisioning step that leaves a file in the tree it is about to grade has changed the thing it " +
        "is measuring");
}

// ---- 2. EVERY BRANCH, DRIVEN ---------------------------------------------------------------------------
console.log("\n2. *** EVERY BRANCH IS DRIVEN, INCLUDING THE TWO THAT WOULD OTHERWISE NEED A NETWORK ***");
{
    const zero = async () => ({ code: 0 });
    const one  = async () => ({ code: 1 });

    const already = tree({ installed: true });
    let called = 0;
    const counting = async () => { called++; return { code: 0 }; };
    const r1 = await CHAIN._provision(already, { run: counting });
    ok("!! an already-provisioned clone is left alone, and the runner is NEVER CALLED",
        r1.ok === true && r1.already === true && called === 0,
        `ok=${r1.ok} already=${r1.already} runner called ${called} time(s). Counting the CALL rather than ` +
        "trusting the flag is _ensureCloneParent's `made` precedent in this same tree: it lets the row prove " +
        "the work was skipped instead of proving a variable was set");

    const bare = tree({ pkg: false });
    const r2 = await CHAIN._provision(bare, { run: zero });
    ok("!! a tree with no tools/render-qa/package.json is REFUSED, not installed into",
        r2.ok === false && /package\.json/.test(r2.reason || ""),
        r2.reason || "(no reason given)");

    const failing = tree();
    const r3 = await CHAIN._provision(failing, { run: one });
    ok("!! a failed npm install is a refusal that names the exit code",
        r3.ok === false && /exited 1/.test(r3.reason || ""),
        r3.reason || "(no reason given)");

    // *** THE ROW THIS FILE IS REALLY FOR. ***
    const lying = tree();
    const r4 = await CHAIN._provision(lying, { run: zero });
    ok("!! *** npm EXITING ZERO IS NOT PROVISIONED: the clone's own resolver is asked afterwards ***",
        r4.ok === false && /resolver still refuses/.test(r4.reason || ""),
        (r4.reason || "").slice(0, 120) + " -- a half-run postinstall, --ignore-scripts, an empty registry " +
        "answer or a blocked CDN all leave a zero behind. Taking the exit code as the answer is the same " +
        "shape as a gate that exits 1 having printed no FAIL row, which v4668 found from the other side");

    // *** AND THE SUCCESS PATH IS NOT DRIVEN HERE, WHICH IS SAID RATHER THAN FAKED. *** Reaching ok:true
    // now needs the clone's real playwrightResolve.mjs to find a real chromium, so the only honest way to
    // exercise it is a real install on a real clone. A stub tree that made this row green would be a
    // fixture asserting that the check it replaced still passes.
    report("NOT DRIVEN: the ok:true path. It requires the clone's own resolver to find a browser, so it is " +
        "exercised by the rig pressing Clone -> verify and by nothing here. The number that says it worked " +
        "is the clone's NEW-red count: 121 before provisioning, 37 after, measured on the rig at v4667.");
}

// ---- 3. THE PHASE, AND EVERY GUARD THAT MUST KNOW ABOUT IT ---------------------------------------------
console.log("\n3. *** A PHASE NO GUARD NAMES IS A WINDOW IN WHICH THE GUARD IS NOT THERE ***");
{
    // This file's own v4451 note records the last time that happened here: R.phase was set all through
    // start() and never once in publish(), so status().running read FALSE during the pack and the upload --
    // the one window containing the action the tree calls hardest to take back. A new phase repeats that
    // defect unless every predicate learns it, so they are checked by NAME rather than by counting.
    const SRC = fs.readFileSync(path.join(ENG, "ai-bridge", "sourceChainBridge.js"), "utf8");
    const guards = [
        ["status().running", /running:\s*R\.phase === "cloning" \|\| R\.phase === "provisioning"/],
        ["canPublish()", /s\.phase === "cloning" \|\| s\.phase === "provisioning" \|\| s\.phase === "verifying"/],
        ["start()'s busy check", /R\.phase === "cloning" \|\| R\.phase === "provisioning" \|\| R\.phase === "verifying"\)\n\s*return \{ ok: false, error: "busy"/],
        ["running()", /function running\(\) \{ return R\.phase === "cloning" \|\| R\.phase === "provisioning"/],
    ];
    for (const [name, re] of guards)
        ok(`!! ${name} names the provisioning phase`, re.test(SRC),
            "a guard blind to a phase is a guard that is off for the length of it -- and this one spans a " +
            "several-minute browser download");

    ok("!! *** the chain REFUSES to verify an unprovisioned clone rather than reporting its 116 reds ***",
        /refusing to verify a tree whose browser gates cannot run/.test(SRC) &&
        /R\.phase = "done"; R\.finishedAt = Date\.now\(\); R\.verified = false;/.test(SRC),
        "running it anyway spends an hour producing a verdict that describes the missing install, and a " +
        "reader takes it for 116 broken gates -- which is precisely what v4667 did");
}

// ---- THE TIMEOUT'S KILL, DRIVEN -- BECAUSE A KILL NOBODY RE-CHECKS IS A CLAIM RESTING ON NOTHING ---------
//
// v4668's first spelling of the provisioning timeout was `try { child.kill(); } catch {}` followed immediately
// by resolving with `timedOut: true`. boundaryLint reports that shape as KILL_NOT_VERIFIED and it is right to:
// kill() SENDS a signal. On Windows it is TerminateProcess against the npm launcher, whose own child tree can
// outlive it, and a surviving `npm install` holds the cache lock -- so the NEXT attempt fails too, with a
// different error, on a different run, pointing nowhere near this file.
//
// These rows run the real helper against real children. Nothing is mocked and nothing is grepped.
{
    const IGNORES_SIGTERM = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
    const t0 = Date.now();
    const stubborn = await CHAIN._spawnCmd(process.execPath, ["-e", IGNORES_SIGTERM], os.tmpdir(), "probe",
        { timeoutMs: 1000 });
    const tookMs = Date.now() - t0;
    ok("!! *** a child that IGNORES SIGTERM is escalated to SIGKILL and the result says it actually died ***",
        stubborn.timedOut === true && stubborn.killed === true && tookMs > 1000,
        `${JSON.stringify(stubborn)} after ${tookMs} ms -- the 1 s cap, then a grace period, then SIGKILL. ` +
        "`killed` is read off the child's own exit event, not assumed from having sent a signal");

    const easy = await CHAIN._spawnCmd(process.execPath, ["-e", "setInterval(() => {}, 1000);"], os.tmpdir(),
        "probe", { timeoutMs: 1000 });
    ok("...and one that respects it needs no escalation, so the ordinary case is not slowed by the hard case",
        easy.timedOut === true && easy.killed === true, JSON.stringify(easy));

    // THE CONTROL: the two rows above would both pass if the helper simply stamped killed:true on everything.
    const fine = await CHAIN._spawnCmd(process.execPath, ["-e", "process.exit(7)"], os.tmpdir(), "probe",
        { timeoutMs: 30000 });
    ok("...and a child that finishes on its own carries NEITHER stamp, so the stamps mean something",
        fine.code === 7 && fine.timedOut === undefined && fine.killed === undefined, JSON.stringify(fine));

    // v4668b's hang, kept driven. node emits "error" and NOT "exit" for ENOENT, so a promise settling only on
    // "exit" never settles -- which pinned the chain in "provisioning" with every guard closed.
    const t1 = Date.now();
    const gone = await CHAIN._spawnCmd("swek-definitely-not-a-binary", [], os.tmpdir(), "probe", { timeoutMs: 30000 });
    ok("...and a MISSING BINARY resolves at once on `error` rather than waiting out the 30 s cap",
        gone.code === -1 && /ENOENT/.test(String(gone.spawnError)) && Date.now() - t1 < 1000,
        `${gone.spawnError} in ${Date.now() - t1} ms -- if this ever hangs again, the cap is the only thing ` +
        "between the bridge and a permanently closed publish button");
}

for (const t of trees) { try { fs.rmSync(t, { recursive: true, force: true }); } catch {} }

console.log("\nunchecked here: A REAL npm install. Every row above injects the runner, so what is graded is the " +
    "DECISION -- which branch is taken and what is checked afterwards -- and not npm, the registry or the " +
    "Chromium download. The real install is exercised by the rig pressing Clone -> verify, and the number " +
    "that will say it worked is the clone's NEW-red count falling from 121 toward the provisioned tree's 26.");
console.log(fails ? `\ncloneProvision-selfcheck: ${fails} FAILED` : "\ncloneProvision-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
