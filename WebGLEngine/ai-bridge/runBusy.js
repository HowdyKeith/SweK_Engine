// WebGLEngine/ai-bridge/runBusy.js -- v4533 -- ONE answer to "is long work in flight", for every updater.
//
// *** THE GUARD EXISTED, IT WAS CORRECT, AND THE UPDATER THAT LAUNCHES A NEW VERSION NEVER ASKED IT. ***
//
// v3075 put a deferral in server.js's _applyIncremental and wrote down the principle: "the guard belongs
// where the update is applied, not in each runner". v4451 widened the predicate to see the GitHub chain after
// Keith asked for exactly that. Both were right about the path they were looking at -- and there are TWO
// UPDATERS IN THIS TREE, not one:
//
//   server.js::_applyIncremental        peer / Drive INCREMENTAL PACKAGE   -- guarded since v3075
//   sysadminBridge.js::updateCheck      the DOWNLOADS-ZIP INSTALLER, which extracts a build, spawns the
//                                       launcher and calls process.exit(0)  -- NEVER GUARDED, in any version
//
// The second is the one a person SEES: a new SweK window opening mid-run. Keith, at a release: "it gets to
// about 1200 and then I see the swek launcher go to start a new version. if it starts, the sweeps get
// canceled. if I watch for the new swek launcher and kill it immediately, the sweeps finish." Killing it beats
// the HANDOFF, not the decision -- by then the zip is extracted and the successor is already spawning.
//
// *** AND THE GATE THAT EXISTS TO PROVE AUTO-UPDATE PAUSES NEVER OPENED THAT FILE. *** updatePause-selfcheck
// reads server.js, gatesBridge.js, rigRunner.js and rig.html; the string "updateCheck" does not appear in it,
// and "sysadminBridge" is not among its reads. A check can be green for years about the wrong subject.
//
// *** WHY A MODULE AND NOT A SECOND COPY OF THE PREDICATE. *** updatePause-selfcheck's own standing rule is
// that the answer "derives from the runners' OWN state rather than a duplicate flag ... a second flag would
// one day disagree with the thing it describes". Two copies of the QUESTION have the same fault as two copies
// of the flag: the v4451 widening reached one caller and would have had to be remembered for the other. So the
// question is asked in one place and both updaters call it.
//
// Every bridge is required LAZILY and inside its own try/catch, for two reasons. server.js requires
// sysadminBridge (line 1628) BEFORE githubBridge and sourceChainBridge (2015-2016), so a top-level require
// here would resolve some bridges before they exist. And a bridge that throws must leave the update WORKING
// rather than crash the caller -- a guard that fails closed on its own error is a guard that stops updates
// forever the first time a module moves.
"use strict";

/** Each runner, with the name a human should see when it is what defers an update. */
const RUNNERS = Object.freeze([
    Object.freeze({ mod: "./renderQaBridge.js",   what: "render QA",
                    busy: (m) => { const s = m.status && m.status(); return !!(s && s.running); } }),
    Object.freeze({ mod: "./gatesBridge.js",      what: "the gate suite",
                    busy: (m) => !!(m.running && m.running()) }),
    Object.freeze({ mod: "./rigRunner.js",        what: "a rig job",
                    busy: (m) => !!(m.running && m.running()) }),
    Object.freeze({ mod: "./sourceChainBridge.js", what: "the source chain",
                    busy: (m) => !!(m.running && m.running()),
                    detail: (m) => (m.busyWhat && m.busyWhat()) || null }),
    Object.freeze({ mod: "./githubBridge.js",     what: "a GitHub operation",
                    busy: (m) => !!(m.busy && m.busy()),
                    detail: (m) => (m.busyWhat && m.busyWhat()) || null }),
    // v4612 -- *** THE ONE RUNNER THAT ANSWERS FROM DISK, BECAUSE THE WORK IT SEES IS NEVER IN THIS PROCESS. ***
    // Every runner above reports THIS process's own in-memory state -- correct for server.js's own async work,
    // blind to a SEPARATE node process. verify.mjs/ship.mjs run from a freshly cloned folder as their own
    // process; no in-process runner could ever see one running. Keith hit exactly this: an already-running
    // SweK instance's own poller found a real zip in Downloads while his terminal ran `node verify.mjs`
    // elsewhere, asked this module (which truthfully saw nothing busy), and applied it mid-sweep -- a launch he
    // never triggered. releaseHold.js is a lock FILE for exactly that reason: verify.mjs/ship.mjs acquire it,
    // every SweK instance on the box reads the same file regardless of which folder it runs from.
    Object.freeze({ mod: "./releaseHold.js",      what: "a release build (verify/ship) in progress on this machine",
                    busy: (m) => !!(m.running && m.running()),
                    detail: (m) => (m.busyWhat && m.busyWhat()) || null }),
]);

/**
 * { active, what } -- `what` names the runner in words a person can act on, never a boolean alone.
 * Returns the FIRST busy runner; the order above is only presentation, since any one of them defers.
 */
function active() {
    for (const r of RUNNERS) {
        try {
            const m = require(r.mod);
            if (m && r.busy(m)) {
                let what = r.what;
                try { what = (r.detail && r.detail(m)) || r.what; } catch {}
                return { active: true, what };
            }
        } catch {}
    }
    return { active: false, what: null };
}

module.exports = { active, RUNNERS };
