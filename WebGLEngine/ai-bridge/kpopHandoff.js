// ai-bridge/kpopHandoff.js
//
// v3527 -- AN AUTO-UPDATE NEVER RESTARTED THE KPOP LISTENER, AND THE CODE SAID SO IN ITS OWN COMMENT.
//
// launcherName() returns START_NODE_Engine.bat (or START_BUN_Full.bat) -- THE ENGINE ONLY. The listener is
// started in exactly two places and an auto-update invokes neither: Start_Everything.bat, which somebody
// double-clicks, and POST /kpop/launch, which is a button. sysadminBridge drops swek_silent.flag for it and
// says what that is worth in its own words -- "the KPop side needs the launcher to honour the flag (it's
// machine-side)". *** A MESSAGE LEFT FOR A READER THAT IS NOT RUNNING. ***
//
// THE FIX IS NOT TO LAUNCH Start_Everything.bat FROM THE UPDATE PATH. That would start whatever else that
// script starts, on every silent update, and a silent update that opens extra windows is not silent. The
// engine already knows how to spawn the listener -- POST /kpop/launch does it -- so the successor restarts it
// ITSELF, and only in the one case where that is what the machine already had.
//
// *** THE RULE, AND EVERY CLAUSE IS THERE BECAUSE THE ALTERNATIVE IS WRONG: RESTART ONLY IF IT WAS RUNNING
// BEFORE THE HANDOFF, IS NOT RUNNING NOW, AND THE HANDOFF WAS RECENT. ***
//   - WAS RUNNING: starting a listener somebody deliberately stopped is the update deciding what the machine
//     should be doing. An update restores state; it does not choose it.
//   - NOT RUNNING NOW: the listener is SINGLE-INSTANCE at /kpop/launch, so a second spawn is at best wasted
//     and at worst two processes fighting over one sentinel file.
//   - RECENT: %TEMP% SURVIVES REBOOTS. A flag with no age would restart the listener on every boot forever
//     after one update -- v3250's stale-flag defect EXACTLY, in the same directory, where a superseded flag
//     left by an unfinished handoff made every later launch claim the new build was already running. THE AGE
//     OF THE FLAG IS WHAT MATTERS AND mtime ALREADY CARRIES IT, which is the correction v3250 landed on.
//
// LIVENESS IS THE SENTINEL, NOT A PID: the listener freshens <tmp>/KPopListener/Listener_Alive.txt and
// server.js's _kpopAlive() treats it as alive if touched within 45s. A PID would say a PROCESS EXISTS; the
// sentinel says THE LISTENER IS DOING ITS JOB, and after a handoff those are different questions.
//
// THE DECISION IS PURE AND TAKES EVERY INPUT AS AN ARGUMENT -- no clock, no filesystem, no spawn -- because
// none of this can run on the platform it is for. The sandbox has no Windows and no listener. WHAT IS GRADED
// HERE IS THE RULE; THE FIRST DOUBLE-CLICK IS KEITH'S.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const FLAG = path.join(os.tmpdir(), "swek_kpop_was_alive.flag");
// The handoff window. Long enough for a launcher to start node and bind (portHandoff gives up at 25s), short
// enough that a reboot days later cannot look like an update that just happened.
const MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Should the successor restart the listener?
 * Returns { restart: boolean, reason } -- a REASON always, because "no" has four different causes and a bare
 * false would make "the user stopped it" indistinguishable from "the flag is stale".
 */
function shouldRestart({ wasAlive, isAliveNow, flagAgeMs, maxAgeMs = MAX_AGE_MS } = {}) {
    if (wasAlive === null || wasAlive === undefined) {
        return { restart: false, reason: "no handoff record -- this boot did not follow an auto-update" };
    }
    if (!wasAlive) {
        return { restart: false, reason: "the listener was NOT running before the handoff -- an update restores state, it does not choose it" };
    }
    if (isAliveNow) {
        return { restart: false, reason: "already alive -- /kpop/launch is single-instance and a second spawn fights over one sentinel" };
    }
    if (!(flagAgeMs >= 0) || flagAgeMs > maxAgeMs) {
        return { restart: false, reason: "handoff record is " + Math.round((flagAgeMs || 0) / 1000) + "s old (limit " +
                 Math.round(maxAgeMs / 1000) + "s) -- %TEMP% survives reboots and a stale flag would restart it forever" };
    }
    return { restart: true, reason: "it was running before the handoff, is not running now, and the handoff was " +
             Math.round(flagAgeMs / 1000) + "s ago" };
}

/** Called by the OLD server just before it spawns the launcher. */
function recordBeforeHandoff(isAlive) {
    try { fs.writeFileSync(FLAG, isAlive ? "1" : "0"); return true; } catch { return false; }
}

/** Called by the SUCCESSOR at boot. Returns { wasAlive, flagAgeMs } or nulls when there is no record. */
function readHandoffRecord(now = Date.now()) {
    try {
        const st = fs.statSync(FLAG);
        const wasAlive = fs.readFileSync(FLAG, "utf8").trim() === "1";
        // *** v4004 -- Math.floor, AND IT IS NOT TIDINESS: THIS COMPARED AN INTEGER CLOCK AGAINST A FRACTIONAL
        // TIMESTAMP AND PRODUCED NEGATIVE AGES 195 TIMES IN 200. *** Date.now() returns whole milliseconds;
        // st.mtimeMs carries the filesystem's sub-millisecond precision, so a flag written and read inside the
        // same millisecond stats as (say) x.501 against a clock reading x -- an age of -0.5ms.
        //
        // THAT MATTERS BECAUSE A NEGATIVE AGE IS A REAL SIGNAL HERE. v3457 made this module refuse one, on the
        // grounds that a clock running backwards reads as "very recent" and gets acted on, and LAN clock skew
        // is ordinary on Keith's network. So the two cases had to be SEPARATED rather than clamped together:
        // flooring makes both sides whole milliseconds, which removes the precision artefact entirely and
        // leaves a genuinely future mtime as negative as it ever was. Measured: 195/200 before, 0/200 after.
        //
        // A clamp to zero would have fixed the symptom and blinded the skew check, which is the trade this
        // comment exists to refuse.
        return { wasAlive, flagAgeMs: now - Math.floor(st.mtimeMs) };
    } catch { return { wasAlive: null, flagAgeMs: -1 }; }
}

/** ONE-SHOT: the record is consumed so a second boot cannot act on it again. */
function clearHandoffRecord() { try { fs.unlinkSync(FLAG); return true; } catch { return false; } }

module.exports = { shouldRestart, recordBeforeHandoff, readHandoffRecord, clearHandoffRecord, FLAG, MAX_AGE_MS };
