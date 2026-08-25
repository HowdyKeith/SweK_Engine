// ai-bridge/tools/self-zip-selfcheck.mjs
//
// GATES ai-bridge/packagerBridge.js's selfZipCandidate() -- what /self/zip actually serves.
//
// *** KEITH CAUGHT THIS LIVE, NOT A HYPOTHETICAL. *** On a box whose own header read "running v3995", clicking
// the download link served v3940 -- correctly named v3940 in the Content-Disposition, so the mismatch was never
// hidden, only unnoticed next to a big "download" button beside a version number that reads as "get what this
// box is running". The old logic picked the HIGHEST-numbered zip sitting in ~/Downloads, with no comparison
// against what is actually running at all -- so a box updated by extraction, patch, or in-place git pull (no
// fresh zip left behind), or one whose newest zip was simply moved or deleted after install, silently served
// whatever stale build happened to still be sitting there.
"use strict";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PB = createRequire(import.meta.url)(path.join(HERE, "..", "packagerBridge.js"));

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n) => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("self-zip-selfcheck -- does the download route serve what is actually running?\n");

// *** THE FIXTURE VERSION IS THE REPO'S REAL LIVE ONE, NOT A MADE-UP NUMBER. *** A first draft hardcoded
// "v4012" as liveVersion for the fallback-build sections -- but makeInstallable() reads engineVersion() OFF
// THE REAL main.js ITSELF, ignoring any override passed here for the COMPARISON half, so a fictional
// liveVersion made the freshly-built zip's real name (matching the actual repo) disagree with the fixture's
// fictional one. In real use liveVersion is never overridden, so the two always read the same file and always
// agree; the fixture now agrees with them on purpose, catching an error a fictional number could not.
const LIVE = PB.engineVersion();                 // "vNNNN", the real one
const LIVE_NUM = parseInt(LIVE.replace(/^v/i, ""), 10);
const STALE_NUM = LIVE_NUM - 71;                 // comfortably below LIVE_NUM, never equal by construction

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "swek-selfzip-gate-"));
const dirs = {};
for (const name of ["matching", "stale-only", "empty"]) {
    dirs[name] = path.join(SCRATCH, name);
    fs.mkdirSync(dirs[name], { recursive: true });
}
// "matching": a fixture with the REAL live version PLUS a HIGHER-numbered stale one -- the fast path must pick
// the one that matches, never merely the biggest number, which is the defect species this file exists for.
fs.writeFileSync(path.join(dirs.matching, "SweK_Engine_" + LIVE + ".zip"), "fixture");
fs.writeFileSync(path.join(dirs.matching, "SweK_Engine_v" + (LIVE_NUM + 9987) + ".zip"), "fixture");
// "stale-only": Keith's exact shape -- Downloads has an older build and nothing matching live.
fs.writeFileSync(path.join(dirs["stale-only"], "SweK_Engine_v" + STALE_NUM + ".zip"), "fixture");
// legacy-named stale zip too, proving the legacy pattern is still read (v2871) but still version-checked
fs.writeFileSync(path.join(dirs["stale-only"], "EngineProject_v" + (STALE_NUM - 3840) + ".zip"), "fixture");

let built = [];

// ---------------------------------------------------------------------------
console.log("1. *** THE FAST PATH PICKS THE MATCH, NOT THE BIGGEST NUMBER ***");
{
    const r = await PB.selfZipCandidate({ dlDir: dirs.matching, liveVersion: LIVE });
    ok("!! it succeeds", r.ok === true, r.error || "");
    ok("!! it did NOT need to build one", r.built === false);
    ok("!! *** it picked the zip matching the LIVE version, not the higher-numbered stale one ***",
        r.name === "SweK_Engine_" + LIVE + ".zip",
        "picked " + r.name + " -- a v" + (LIVE_NUM + 9987) + " fixture sat right beside it, and the old logic would have taken THAT");
    ok("...and its version is reported as a number, matching parseBuildZip's own shape", r.version === LIVE_NUM);
}

// ---------------------------------------------------------------------------
console.log("\n2. *** KEITH'S EXACT SHAPE: NOTHING IN DOWNLOADS MATCHES WHAT IS RUNNING ***");
{
    const r = await PB.selfZipCandidate({ dlDir: dirs["stale-only"], liveVersion: LIVE });
    if (r.built) built.push(r.path);
    ok("!! it succeeds by building fresh rather than falling back to the stale zip", r.ok === true, r.error || "");
    ok("!! *** it built one, and did not silently serve the stale (or legacy-named) zip sitting right there ***",
        r.built === true, "built=" + r.built + " path=" + (r.path || ""));
    ok("!! the freshly built zip's OWN name carries the live version, not a stale one",
        r.name === "SweK_Engine_" + LIVE + ".zip", "name: " + r.name);
    report("this is the exact reproduction of the live bug: a box running vNNNN with only an older zip in " +
           "Downloads must never hand that older zip out labelled as itself");
}

// ---------------------------------------------------------------------------
console.log("\n3. *** AN EMPTY DOWNLOADS FOLDER TAKES THE SAME FALLBACK, NOT A 404 ***");
{
    const r = await PB.selfZipCandidate({ dlDir: dirs.empty, liveVersion: LIVE });
    if (r.built) built.push(r.path);
    ok("!! no zip anywhere still succeeds -- it builds one rather than refusing", r.ok === true, r.error || "");
    ok("...and it is the live version", r.built === true && r.name === "SweK_Engine_" + LIVE + ".zip");
}

// ---------------------------------------------------------------------------
console.log("\n4. *** SABOTAGE: THE OLD 'HIGHEST NUMBER FOUND' LOGIC IS PROVEN WRONG ON THE SAME FIXTURE ***");
{
    // The exact algorithm this file replaced: no live-version comparison at all, just the biggest match.
    const buildName = createRequire(import.meta.url)(path.join(HERE, "..", "buildName.js"));
    let oldBest = null;
    for (const f of fs.readdirSync(dirs["stale-only"])) {
        const p2 = buildName.parseBuildZip(f);
        if (p2 && (!oldBest || p2.version > oldBest.version)) oldBest = p2;
    }
    ok("!! *** the OLD algorithm would have served v" + (oldBest && oldBest.version) + " while v4012 is running ***",
        !!oldBest && oldBest.version !== 4012,
        "reproduced on the identical fixture section 2 just proved the NEW code handles correctly");
}

// ---------------------------------------------------------------------------
console.log("\n5. *** THE VERSION COMPARISON IS NUMERIC, NOT A STRING/NUMBER MISMATCH ***");
{
    // engineVersion() returns "vNNNN" (with the letter); parseBuildZip() returns a bare number. A first draft
    // of this file compared them with `===` directly, which is never true regardless of digits -- caught before
    // shipping by actually running this section, not assumed correct from writing it.
    const r = await PB.selfZipCandidate({ dlDir: dirs.matching, liveVersion: LIVE });
    ok("!! passing liveVersion WITH the v-prefix still finds the numeric match", r.ok && r.built === false);
    const r2 = await PB.selfZipCandidate({ dlDir: dirs.matching, liveVersion: LIVE_NUM });
    ok("!! ...and passing it as a bare number works identically", r2.ok && r2.built === false && r2.name === r.name);
}

for (const p of built) { try { fs.rmSync(p, { force: true }); } catch {} }
try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {}

console.log();
if (fails) { console.log("self-zip-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("self-zip-selfcheck: all checks pass");
