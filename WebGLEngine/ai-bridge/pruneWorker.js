// WebGLEngine/ai-bridge/pruneWorker.js -- v3406
//
// *** THE DELETION, MOVED OUT OF THE SERVER PROCESS. ***
//
// robustRemove is synchronous end to end -- recursive chmodSync + unlinkSync/rmdirSync over a tree of ~17,000
// files, six retries, then execFileSync("cmd /c rmdir /s /q") with a twenty-second timeout. Run in the bridge it
// blocks the event loop for the whole duration, and Keith's boot log measures the cost: `[lag] event loop blocked
// 29720ms` landing on the robustRemove line, then four static files each reporting `took 7082x ms`. THOSE WERE
// NOT SLOW FILE SERVES -- four requests reporting the SAME seventy seconds are four requests queued behind one
// blocking call.
//
// *** NOTHING WAITS ON THE RESULT, WHICH IS WHY THIS IS SAFE TO DETACH. *** The folders are superseded builds
// whose zips are still in Downloads; the bridge already decided WHICH ones (dry run) before spawning this, so
// this process makes no eligibility judgement of its own -- IT ONLY DELETES WHAT IT WAS HANDED. That split is
// deliberate: the dangerous half is deciding, and it stays in the file that has always done it.
//
// A deletion that outlives a server restart is fine. A deletion that freezes the server for a minute is not.
//
// REFUSES rather than guessing: a path that is not an absolute directory, or does not look like a versioned
// engine folder, is skipped and named. This process runs DETACHED with no supervision, so a wrong argument here
// has no one to catch it -- the guard is the whole reason it is allowed to run unattended.
"use strict";
const fs = require("fs");
const path = require("path");
const { robustRemove } = require("./robustRemove.js");

const VERSIONED = /_v\d{3,}$/;   // ..._v3286 -- the shape autoRemoveOld produces and nothing else

function main() {
    const targets = process.argv.slice(2);
    if (!targets.length) return;
    for (const t of targets) {
        try {
            if (!path.isAbsolute(t)) { console.log("[prune] refused (not absolute):", t); continue; }
            if (!VERSIONED.test(t.replace(/[\\/]+$/, ""))) { console.log("[prune] refused (not a versioned engine folder):", t); continue; }
            let st; try { st = fs.statSync(t); } catch { continue; }          // already gone is success
            if (!st.isDirectory()) { console.log("[prune] refused (not a directory):", t); continue; }
            const r = robustRemove(t, { retries: 6, delayMs: 150, winFallback: true, log: (...a) => console.log("[prune]", ...a) });
            console.log("[prune]", r.ok ? "removed" : "could NOT remove", t);
        } catch (e) {
            console.log("[prune] error on", t, "-", (e && e.message) || e);
        }
    }
}

main();
