// ai-bridge/bootTrace.js
//
// v3522 -- THE HANDOFF'S EVIDENCE WAS GOING TO A MINIMISED WINDOW NOBODY READS.
//
// *** THE ROUND BEFORE THIS ONE WAS WRONG AND READING THE TREE KILLED IT. *** From Keith's 21-hour boot log --
// every [blame] frame naming C:\Intel\SweK_Engine_v3486, dozens of "[sys] launched vNNNN" for eight different
// versions, "[autoPull] already pulled vNNNN (awaiting apply)" forever -- I concluded the Windows relaunch
// branch should exit like the macOS one, gated on the successor answering. IT ALREADY HAS A HANDOFF AND IT IS
// THE OTHER WAY ROUND: portHandoff.js has existed since v2224, is wired at server.js:20392 immediately before
// listen, and makes the SUCCESSOR do the work -- on EADDRINUSE it waits, and after 8s it FREES THE PORT ITSELF
// (netstat -> taskkill on the stale holder) and binds. Its own comment gives the reason the old server does not
// exit: "Because it never voluntarily gives up the old server until it has the port, THERE IS NO 'NO SERVER'
// GAP." That is correct, and my exit-and-poll would have created exactly the gap it avoids -- A SECOND
// DECLARATION OF ONE HANDOFF, with each half waiting on the other.
//
// SO THE QUESTION IS NOT WHAT TO BUILD, IT IS WHY THE EXISTING MECHANISM NEVER FIRED. Three candidates:
//   (1) THE SUCCESSOR NEVER REACHES listen -- the launcher dies, or node never starts. installHandoff is never
//       armed, so nothing kills anyone and the old server keeps holding the port.
//   (2) freePort FAILS ON THE BOX -- netstat/taskkill blocked or the parse misses. It waits and never heals.
//   (3) THE SUCCESSOR BINDS A DIFFERENT PORT -- PORT set in the new window, so it never contends at all.
//
// *** AND ALL THREE ARE INDISTINGUISHABLE FROM THE SURVIVING PROCESS, WHICH IS WHY THIS FILE EXISTS BEFORE ANY
// FIX DOES. *** installHandoff's evidence -- "[bridge] :8787 busy", "freeing it" -- goes to console.log in the
// SUCCESSOR'S window, which the silent auto-update opens MINIMISED (`start "" /MIN`). Across 21 hours and dozens
// of launches Keith's log contains NOT ONE [bridge] line, and it could not: those lines were never going to the
// window he is reading. THE DIAGNOSIS HAS BEEN WRITTEN TO A SURFACE NOBODY WATCHES, and guessing which of the
// three is true without it would be the fourth guess in a row (v3411's rule: THREE GUESSES IS THE SIGNAL THAT
// THE INSTRUMENT IS MISSING, NOT THAT THE NEXT GUESS WILL BE BETTER).
//
// SO THE SUCCESSOR APPENDS TO A FILE IN %TEMP% THAT THE SURVIVOR CAN READ. Two properties decide the design:
//   - IT IS WRITTEN AS EARLY AS POSSIBLE. Candidate (1) is a process that dies BEFORE listen, so a trace
//     written at bind time cannot see it. `boot` is recorded at require time, before anything else can throw.
//   - IT IS APPENDED SYNCHRONOUSLY, because a process that is about to die is exactly the one whose evidence
//     matters, and a buffered write is evidence that dies with it.
//
// THE READER RETURNS THREE STATES AND NEVER TWO, because that is the whole discriminator:
//   NO-TRACE   -> nothing from that folder ever ran node                       -> candidate (1)
//   BOOTED     -> node ran and never reported a successful bind                -> candidate (2) or (3)
//   BOUND      -> the successor owns a port and said which                     -> the handoff worked
// Collapsing BOOTED into NO-TRACE would merge "the launcher is broken" with "the port fight is broken", which
// are opposite repairs -- the two-things-one-label defect this tree names more often than any other.
//
// *** THIS SHIPS NO FIX AND THAT IS DELIBERATE. *** Which candidate is true is a fact about Keith's Windows box
// and the sandbox has none. What is gradeable here is the INSTRUMENT, and it is gradeable completely: real
// processes, a real port, a real bind conflict, a real file. THE ANSWER IS HIS NEXT BOOT, NOT A FOURTH GUESS.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const TRACE_NAME = "swek_boot_trace.jsonl";
// A bounded file, because %TEMP% survives reboots and an unbounded append is a disk leak that outlives every
// build that wrote to it -- v3250 learned that about a flag in this same directory.
const MAX_BYTES = 256 * 1024;
const KEEP_LINES = 400;

function tracePath(dir) { return path.join(dir || os.tmpdir(), TRACE_NAME); }

/** Append one event. Synchronous and swallow-all: a trace that can throw would take down the boot it is
 *  recording, which would make the instrument the defect. */
function record(event, fields = {}, opts = {}) {
    const file = tracePath(opts.dir);
    const line = JSON.stringify({
        at: opts.now ? opts.now() : Date.now(),
        pid: opts.pid == null ? process.pid : opts.pid,
        event: String(event),
        ...fields,
    });
    try {
        // Trim BEFORE appending so the cap is a ceiling on what is on disk rather than on what we just wrote.
        try {
            const st = fs.statSync(file);
            if (st.size > MAX_BYTES) {
                const kept = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).slice(-KEEP_LINES);
                fs.writeFileSync(file, kept.join("\n") + "\n");
            }
        } catch {}
        fs.appendFileSync(file, line + "\n");
        return true;
    } catch { return false; }
}

function readAll(opts = {}) {
    try {
        return fs.readFileSync(tracePath(opts.dir), "utf8")
            .split(/\r?\n/).filter(Boolean)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
    } catch { return []; }
}

const norm = (s) => String(s || "").replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
/** Case-folded and separator-normalised, because Windows hands back C:\Intel\... where the spawn was given
 *  c:\intel\..., and a strict compare would report a successful handoff as no trace at all. */
function inFolder(root, folder) {
    if (!root || !folder) return false;
    const a = norm(root), b = norm(folder);
    return a === b || a.startsWith(b + "/");
}

/**
 * What happened to the build we launched from `folder`?
 * `since` (ms epoch) scopes the answer to THIS launch: %TEMP% survives reboots, so an unscoped read would
 * report a successor that bound three days ago as evidence that today's handoff worked.
 */
function classify(folder, since, opts = {}) {
    const rows = readAll(opts).filter((r) => r.at >= (since || 0) && inFolder(r.root, folder));
    if (!rows.length) return { state: "NO-TRACE", rows: [], detail: "no build from " + folder + " reported starting" };
    const bound = rows.filter((r) => r.event === "bind-ok");
    if (bound.length) {
        const last = bound[bound.length - 1];
        return { state: "BOUND", rows, port: last.port, pid: last.pid,
                 detail: "pid " + last.pid + " is serving :" + last.port };
    }
    const why = rows.filter((r) => r.event !== "boot").map((r) => r.event);
    return { state: "BOOTED", rows, detail: "node started (pid " + rows[0].pid + ") and never reported a bind" +
             (why.length ? "; saw " + [...new Set(why)].join(", ") : "; saw nothing after boot") };
}

module.exports = { record, readAll, classify, inFolder, tracePath, TRACE_NAME, MAX_BYTES, KEEP_LINES };
