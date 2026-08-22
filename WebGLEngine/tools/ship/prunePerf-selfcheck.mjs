// WebGLEngine/tools/ship/prunePerf-selfcheck.mjs -- v3406
//
// *** THE EVENT-LOOP BLOCK WAS THE FOLDER DELETE, AND KEITH'S OWN LOG TIMESTAMPS PIN IT WITHOUT A PROFILER. ***
//
//     4:26:47  [lag] event loop blocked 29720ms at 43s
//     4:26:57  [sys] robustRemove: trying `rmdir /s /q`: ...SweK_Engine_v3286   -> EBUSY
//     4:27:27  [sys] auto-removed old version folder: ...v3403
//     4:27:28  [lag] event loop blocked 40887ms
//     4:27:28  [slow] /engine/favicon-inject.js took 70822ms   (and three more, all ~71s)
//
// *** THOSE WERE NEVER SLOW FILE SERVES. Four static files reporting the SAME seventy seconds are four requests
// QUEUED BEHIND ONE BLOCKING CALL *** -- which is what the lag line says in words: "every request in flight
// waited exactly this long." Serving a JS file is a disk read; it is never 71 seconds.
//
// robustRemove is synchronous end to end: recursive chmodSync + unlinkSync/rmdirSync over ~17,000 files, six
// retries, then execFileSync("cmd /c rmdir /s /q") WITH A TWENTY-SECOND TIMEOUT. Three changes, and the gate
// holds each to the property rather than to the arrangement:
//
//   1. THE DELETION RUNS DETACHED -- nothing waits on it, so it never blocks the loop.
//   2. A HELD FOLDER IS NOT RE-ATTEMPTED AT FULL COST EVERY BOOT -- memoised on the folder's own mtime.
//   3. IT RUNS LONG AFTER THE PAGE -- the old 9s delay was chosen when the work was assumed cheap.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { codeHas, noComments } from "./sourceScan.mjs";
const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const SYS = fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8");
const WORKER = path.join(ENG, "ai-bridge", "pruneWorker.js");

// ---- 1. THE WORKER DELETES WHAT IT IS HANDED AND REFUSES EVERYTHING ELSE ---------------------------------
{
    ok("the worker exists and is spawned detached, with its handle unref'd",
        fs.existsSync(WORKER) && codeHas(SYS, /detached: true/) && codeHas(SYS, /child\.unref\(\)/),
        "detached so a delete never blocks the loop; unref'd so it never holds the server open. A deletion " +
        "that outlives a restart is FINE where one that freezes the server for a minute is not");
    // *** THIRD ROUND RUNNING THAT I HUNTED A STRING THROUGH codeOnly(), WHICH BLANKS STRING LITERALS. ***
    // "ignore" is a string. codeOnly for an IDIOM, noComments for TEXT the code CONTAINS -- written down more
    // than twenty times in this tree's record, and three of those instances are now mine in consecutive rounds.
    ok("...and its stdio is ignored, so a full pipe cannot stall it",
        /stdio: "ignore"/.test(noComments(SYS)),
        "an unread pipe is how a detached child quietly becomes a blocked one");

    // DRIVEN, not read: a real temp tree, deleted, plus two refusals.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "swek-prune-"));
    const good = path.join(root, "SweK_Engine_v0001");
    const bad = path.join(root, "notversioned");
    fs.mkdirSync(path.join(good, "sub"), { recursive: true });
    fs.writeFileSync(path.join(good, "sub", "a.txt"), "x");
    fs.mkdirSync(bad, { recursive: true });
    const out = execFileSync(process.execPath, [WORKER, good, bad, "relative/path"], { encoding: "utf8" });
    say(out.trim().split("\n").join(" | "));
    ok("!! *** it removes a versioned engine folder and REFUSES the two that are not ***",
        !fs.existsSync(good) && fs.existsSync(bad) &&
        /refused \(not a versioned engine folder\)/.test(out) && /refused \(not absolute\)/.test(out),
        "THIS RUNS DETACHED WITH NO SUPERVISION, so a wrong argument has nobody to catch it -- the guard is the " +
        "whole reason it is allowed to run unattended");
    fs.rmSync(root, { recursive: true, force: true });
}

// ---- 2. THE DECIDING STAYS WHERE IT ALWAYS WAS -----------------------------------------------------------
{
    const w = fs.readFileSync(WORKER, "utf8");
    ok("!! the worker makes NO eligibility judgement -- the bridge dry-runs and hands it paths",
        codeHas(SYS, /pruneOldVersions\(\{ apply: false \}\)/) && !codeHas(w, /scanDownloads|_oldVersionFolders|eligible/),
        "the dangerous half is DECIDING what may be deleted, and it stays in the file that has always done it. " +
        "A worker that re-derived eligibility would be a second definition of 'safe to delete'");
}

// ---- 3. A HELD FOLDER IS REMEMBERED, AND THE MEMO EXPIRES ON ITS OWN ------------------------------------
{
    ok("!! *** a folder held open is not re-attempted at full cost every boot ***",
        codeHas(SYS, /_heldMemo/) && codeHas(SYS, /memo\.mtimeMs === st\.mtimeMs/),
        "v3286 is EBUSY in every boot log Keith has sent, so the whole dance -- recursive chmod, recursive " +
        "unlink, six retries, a 20-second rmdir -- ran and failed identically EVERY BOOT, FOREVER");
    ok("...and the memo is keyed on what would make the answer different",
        codeHas(SYS, /fs\.statSync\(f\.path\)\.mtimeMs/),
        "the folder's own mtime: if nothing inside changed, nothing can have released it in a way this would " +
        "notice. IF THE MTIME MOVES THE MEMO IS STALE BY CONSTRUCTION and the attempt runs -- a skip that " +
        "re-opens itself, not a permanent list");
    ok("!! and a held folder is REPORTED rather than silently skipped",
        /SKIPPED -- held by a live process/.test(noComments(SYS)) && codeHas(SYS, /held\.length/),
        "a folder that quietly stopped being attempted would look exactly like one that was successfully " +
        "deleted, and this tree has spent a session on things that failed silently");
}

// ---- 4. AND IT RUNS AFTER THE PAGE, NOT DURING IT --------------------------------------------------------
{
    const m = SYS.match(/autoRemoveOld: handed[\s\S]{0,400}?\}, (\d+)\);/);
    const delay = m ? Number(m[1]) : 0;
    say("boot prune delay: " + (delay / 1000) + "s");
    ok("!! the boot prune waits well past the page rather than landing on it",
        delay >= 60000,
        delay / 1000 + "s. The page was served at 13s and the loop went away at 43s, so the OLD 9s grace was " +
        "covering the wrong interval entirely. THE PAGE COMES FIRST -- the rule v3271 applied to the peer " +
        "version check, arriving at the other end of the same boot");
}

console.log(failed ? "\n[prunePerf-selfcheck] FAILED " + failed : "\n[prunePerf-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
