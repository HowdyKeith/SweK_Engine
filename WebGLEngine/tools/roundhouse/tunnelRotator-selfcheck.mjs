// tools/roundhouse/tunnelRotator-selfcheck.mjs
//
// v2957 -- ROTATION IS ADDITIVE, AND UPDATES ARE TOLD NOT PUSHED.
//
// Two policies, both of which the obvious implementation gets backwards.
//
// ROTATION. The natural rotation is stop-old, start-new, repoint everyone. That is wrong here because tunnel
// liveness is not monotonic (v2956): the new URL often does not work at first and the old one may be fine or may
// recover. Replacement therefore opens a window where the hub has NO reachable address and no peer holds an
// alternative. Rotation here ADDS a candidate and retires nothing.
//
// UPDATES. A peer reports its version and the hub replies with what it is running. It does not download and
// execute engine code on a remote machine. The engine's own updateManifest already refuses to auto-apply
// anything except vendored npm packages -- "external install, use the link" -- and shipping the whole engine to
// someone else's computer unasked is a much larger step than that precedent permits.

import { rotationDue, onTunnelStarted, onProbeResult, pruneOldest, rotationPlan, tick } from "./tunnelRotator.mjs";
import { prose } from "../ship/sourceScan.mjs";
import { emptyCandidates, orderedCandidates, addCandidate, recordAttempt } from "./tunnelCandidates.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const U = (n) => `https://${n}.trycloudflare.com`;

// ---- 1. ROTATION ADDS, IT DOES NOT REPLACE -----------------------------------------------------------------------------
{
    let reg = emptyCandidates();
    reg = onTunnelStarted(reg, U("one"), { at: "2026-07-25T00:00:00Z" }).registry;
    reg = onProbeResult(reg, U("one"), true, { at: "2026-07-25T00:01:00Z" });
    reg = onTunnelStarted(reg, U("two"), { at: "2026-07-25T06:00:00Z" }).registry;
    reg = onTunnelStarted(reg, U("three"), { at: "2026-07-25T12:00:00Z" }).registry;
    const ord = orderedCandidates(reg);
    ok("!! after three rotations a peer is handed all three addresses, oldest still included",
        ord.length === 3 && ord.includes(U("one")),
        "the first tunnel -- which actually worked -- is still offered after two rotations past it. Replacement " +
        "rotation would have discarded the only proven address in favour of two untested ones");

    ok("...and the proven one is FIRST in the try order",
        ord[0] === U("one"),
        "a recent success outranks a fresh unknown, so a peer reaches the hub on the first attempt rather than " +
        "timing out on a brand-new tunnel that has not come up yet");
}

// ---- 2. THE CAP NEVER DISCARDS SOMETHING THAT WORKED ---------------------------------------------------------------------
{
    let reg = emptyCandidates();
    for (let i = 0; i < 6; i++) { reg = addCandidate(reg, U("ok" + i)); reg = recordAttempt(reg, U("ok" + i), true, { at: "2026-07-2" + (i % 5) + "T00:00:00Z" }); }
    for (let i = 0; i < 6; i++) { reg = addCandidate(reg, U("bad" + i)); reg = recordAttempt(reg, U("bad" + i), false, { at: "2026-07-2" + (i % 5) + "T00:00:00Z" }); }
    const p = pruneOldest(reg, { keep: 8 });
    const kept = orderedCandidates(p.registry);
    ok("!! over the cap, only NEVER-SUCCEEDED candidates are retired",
        p.retired.length === 4 && p.retired.every((u) => u.includes("bad")) && [0,1,2,3,4,5].every((i) => kept.includes(U("ok" + i))),
        "12 candidates, cap 8, retired " + p.retired.length + " -- every one of them never worked, and all six " +
        "that ever succeeded are kept regardless of age. A URL that has demonstrated it CAN work is never " +
        "auto-discarded, because these come back");

    const allGood = pruneOldest((() => { let r = emptyCandidates(); for (let i = 0; i < 10; i++) { r = addCandidate(r, U("g" + i)); r = recordAttempt(r, U("g" + i), true); } return r; })(), { keep: 4 });
    ok("...and if every candidate has succeeded, the cap retires NOTHING",
        allGood.retired.length === 0 && /nothing auto-retired/.test(allGood.why),
        "the cap is a tidiness measure, not a mandate to reach a number. Ten proven addresses over a cap of four " +
        "stay, because the alternative is discarding something known to work to satisfy an arbitrary limit");
}

// ---- 3. ROTATION TIMING IS STATED, NOT GUESSED ----------------------------------------------------------------------------
{
    ok("a first run with no history is due immediately",
        rotationDue({ lastRotatedAt: null }).due === true, "nothing started yet");
    ok("due only after the interval, and it says how long is left",
        rotationDue({ lastRotatedAt: "2026-07-25T12:00:00Z", now: "2026-07-25T15:00:00Z", everyHours: 6 }).due === false &&
        /until the next rotation/.test(rotationDue({ lastRotatedAt: "2026-07-25T12:00:00Z", now: "2026-07-25T15:00:00Z", everyHours: 6 }).why),
        "3h in on a 6h cycle: not due, and the reason names the remaining time rather than just saying no");

    ok("the plan states the policy in words, so a caller cannot implement it backwards",
        /never retires the previous one/.test(rotationPlan(emptyCandidates(), {}).policy),
        "the whole failure mode of this feature is a caller 'tidying up' the old URL after starting a new one");
}

// ---- 4. UPDATES ARE REPORTED, NOT INSTALLED --------------------------------------------------------------------------------
{
    const peer = fs.readFileSync(path.join(here, "lighthouse_checkin.mjs"), "utf8");
    const hub = fs.readFileSync(path.resolve(here, "..", "..", "ai-bridge", "fingerprintBridge.js"), "utf8");

    ok("!! the peer reports its version and the hub answers with a comparison",
        /engineVersion/.test(peer) && /update = \{ hub: hubV, yours/.test(hub),
        "the peer learns whether it is behind, which is the useful part of an update check");

    // NOTE (v2957): the first version scanned the raw file and matched "unzip" inside the console message that
    // TELLS THE USER to unzip it themselves -- flagging the script for saying the right thing. That is the sixth
    // text-matching check this session to match documentation or reassurance instead of behaviour. Strip comments
    // and string literals first, so the scan sees only executable code.
    const codeOnly = peer
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/`(?:[^`\\]|\\.)*`/g, "``")
        .replace(/"(?:[^"\\]|\\.)*"/g, '""')
        .replace(/'(?:[^'\\]|\\.)*'/g, "''");
    const installs = /child_process|\bexec\(|\bspawn\(|\bunzip\b|\bextract\b/.test(codeOnly);
    ok("!! the peer does NOT download, unzip, or execute anything",
        !installs,
        "no child_process, no archive handling, no writing executable content. It is told a version and shown a " +
        "link. Fetching and running engine code on a cousin's machine because a tunnel said so is not an update " +
        "mechanism -- and the engine's own updateManifest already refuses to auto-apply anything but vendored " +
        "npm packages, so this is the established position, not a new caution");

    ok("...and the peer output points at the join page rather than performing the update",
        /nothing is installed for you/.test(peer),
        "a human fetches and unzips when they choose");
}

// ---- v3575 -- THE SWITCH MEANS "KEEP A TUNNEL UP", NOT ONLY "REPLACE IT EVERY N HOURS" -------------------------
{
    console.log("\n*** THE SWITCH NOW MEANS KEEP-A-TUNNEL-UP, AND UNKNOWN IS NOT ABSENT ***");
    const now = "2026-08-08T12:00:00Z";
    const recent = { enabled: true, everyHours: 4, lastRotatedAt: "2026-08-08T11:00:00Z" };

    ok("!! enabled, rotated an hour ago, and NO TUNNEL LIVE -> rotate now",
        tick(recent, { now, tunnelLive: false }).act === "rotate",
        "it used to decide purely on the clock, so with the box ticked and nothing serving, a box that had " +
        "rotated an hour ago answered 'wait' for three more hours. *** THE OPERATOR TICKED A CONTROL AND " +
        "REASONABLY EXPECTED A TUNNEL TO EXIST. ***");
    ok("...and with a tunnel live it still waits for the clock, so this is not 'rotate constantly'",
        tick(recent, { now, tunnelLive: true }).act === "wait",
        "liveness only ADDS a reason to act; it never removes the interval");
    ok("!! UNKNOWN liveness is treated as unknown rather than as absent",
        tick(recent, { now, tunnelLive: null }).act === "wait" &&
        tick(recent, { now }).act === "wait",
        "null is what the caller passes when hostingBridge cannot be asked. *** GUESSING 'NO TUNNEL' WOULD " +
        "SPAWN A DUPLICATE EVERY MINUTE, which is worse than the gap it would be trying to close. ***");
    ok("!! the switch still gates everything: off means off even with nothing serving",
        tick({ ...recent, enabled: false }, { now, tunnelLive: false }).act === "idle",
        "a liveness check that fired while disabled would make the checkbox a lie in the other direction");
    ok("!! and a failing cloudflared still backs off rather than spinning on a dead tunnel",
        tick({ ...recent, consecutiveFailures: 2, lastAttemptAt: now }, { now, tunnelLive: false }).act === "backoff",
        "the liveness branch is guarded on there being no prior failures, so a broken binary does not turn " +
        "'no tunnel is live' into a once-a-minute spawn loop -- the condition is PERMANENT while it is broken");
}

console.log();
if (fails) { console.log("tunnelRotator-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("tunnelRotator-selfcheck: all checks pass");
