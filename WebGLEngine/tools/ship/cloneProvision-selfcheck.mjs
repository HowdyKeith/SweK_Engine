#!/usr/bin/env node
// tools/ship/cloneProvision-selfcheck.mjs -- v4668
//
// Run: node tools/ship/cloneProvision-selfcheck.mjs      (~0.2s)
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
console.log("1. *** THE CHECK ASKS THE QUESTION THE RESOLVER ASKS, NOT WHETHER npm RETURNED ZERO ***");
{
    const RES = fs.readFileSync(path.join(ENG, "tools", "ship", "playwrightResolve.mjs"), "utf8");
    // playwrightResolve builds its first tree-local candidate with path.join(ENG, "tools", "render-qa", ...).
    const usesQa = /path\.join\(\s*ENG\s*,\s*"tools"\s*,\s*"render-qa"\s*,\s*"node_modules"\s*,\s*"playwright"\s*\)/.test(RES);
    ok("!! *** the resolver's tree-local candidate IS tools/render-qa/node_modules/playwright ***",
        usesQa,
        "read out of playwrightResolve.mjs rather than restated. If that file moves its candidate, THIS ROW " +
        "goes red and the provisioner below is pointed at a path nothing reads");

    const probe = tree({ installed: true });
    const at = CHAIN._provisionedAt(probe);
    ok("!! ...and the chain checks that same path, character for character",
        at === path.join(probe, "tools", "render-qa", "node_modules", "playwright"),
        at.slice(-52) + " -- a provisioner that installs somewhere the resolver does not look is a provisioner " +
        "that reports success and changes nothing");
    ok("...and QA_REL is the one spelling both of them come from",
        Array.isArray(CHAIN.QA_REL) && CHAIN.QA_REL.join("/") === "tools/render-qa",
        JSON.stringify(CHAIN.QA_REL));
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
    ok("!! *** npm EXITING ZERO IS NOT PROVISIONED: the path is checked afterwards ***",
        r4.ok === false && /exited 0 but/.test(r4.reason || ""),
        "a half-run postinstall, an empty registry answer or a download killed midway all leave a zero " +
        "behind. Taking the exit code as the answer is the same shape as a gate that exits 1 having printed " +
        "no FAIL row -- v4668 found that one too, from the other side");

    // and the success path, with the runner making the directory the way a real install would
    const good = tree();
    const landing = async () => { fs.mkdirSync(path.join(good, "tools", "render-qa", "node_modules", "playwright"), { recursive: true }); return { code: 0 }; };
    const r5 = await CHAIN._provision(good, { run: landing });
    ok("...and an install that DOES land is reported ok, with how long it took",
        r5.ok === true && !r5.already && typeof r5.ms === "number",
        `ok=${r5.ok} ms=${r5.ms}`);
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

for (const t of trees) { try { fs.rmSync(t, { recursive: true, force: true }); } catch {} }

console.log("\nunchecked here: A REAL npm install. Every row above injects the runner, so what is graded is the " +
    "DECISION -- which branch is taken and what is checked afterwards -- and not npm, the registry or the " +
    "Chromium download. The real install is exercised by the rig pressing Clone -> verify, and the number " +
    "that will say it worked is the clone's NEW-red count falling from 121 toward the provisioned tree's 26.");
console.log(fails ? `\ncloneProvision-selfcheck: ${fails} FAILED` : "\ncloneProvision-selfcheck: all checks pass");
process.exitCode = fails ? 1 : 0;
