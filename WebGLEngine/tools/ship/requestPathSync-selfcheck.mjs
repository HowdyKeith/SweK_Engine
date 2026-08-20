// WebGLEngine/tools/ship/requestPathSync-selfcheck.mjs -- v3476
//
// Run: node tools/ship/requestPathSync-selfcheck.mjs
//
// *** A SYNCHRONOUS SPAWN INSIDE A REQUEST HANDLER STOPS THE WHOLE ENGINE, AND THE LOG DOES NOT SAY SO. ***
//
// From Keith's v3475 boot on Windows:
//
//     [lag] event loop blocked 57229ms ... 83960ms ... 105557ms ... 129072ms      (growing)
//     [slow] /system/stats took 129715ms
//     [slow] /ui/stateOrb.js took 105950ms
//     [slow] /tools/ship/pageSections.mjs took 105807ms
//
// *** stateOrb.js IS FOUR KILOBYTES OF STATIC TEXT. IT DID NOT TAKE A HUNDRED SECONDS -- IT WAITED. *** The
// "slow" label names the victims, not the cause, and reading it as a list of slow files sends you to look at
// the static server, which is the one place the bug was not.
//
// The cause was `execFileSync("nvidia-smi")` inside the /system/stats handler. Three things made it bite:
//
//   1. SYNCHRONOUS -- it stops the event loop, so every other request on the box queues behind it.
//   2. THE TIMEOUT DID NOT BOUND IT. execFileSync's `timeout` limits how long the child may RUN, not how long
//      process CREATION may take, and on Windows creation is what was slow.
//   3. IT WAS THE GAUGES' OWN ENDPOINT -- so the one thing that never filled in was the CPU and RAM gauges,
//      blocked by their own GPU probe. And the unsorted Arriving Pages was the same bug: pageSections.mjs is
//      what GROUPS them, and it arrived 105 seconds late.
//
// THIS GATE CANNOT PROVE A HANDLER IS FAST. What it can do is refuse the one construction that is never safe
// there, and REPORT every other synchronous spawn by line so a new one on a hot path is visible the day it
// lands rather than the day a rig grinds to a halt.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const SERVER = path.join(ROOT, "ai-bridge", "server.js");
const raw = fs.readFileSync(SERVER, "utf8");
// *** noComments, AND MY FIRST RUN PROVED WHY. The scan matched THREE hits in /system/stats and all three were
// COMMENTS -- a stale one still describing the old sync call, plus the two I had just written to explain the
// fix. PROSE-AS-CODE, in the gate built to catch a code defect, for the third time this session. It also
// surfaced a real second bug: that stale comment said "nvidia-smi via execFileSync (sync, fast)" about code
// that no longer exists, WHICH IS A DOCUMENT OUTLIVING ITS CODE and exactly the sort of thing this tree
// otherwise hunts. Corrected in the same pass. ***
const src = noComments(raw);
const lines = raw.split("\n");   // line NUMBERS come from the raw file so the report points at real lines

/* ------------------------------------------------------------------------------------------------------------
 * 1. THE HOT HANDLERS CARRY NO SYNCHRONOUS SPAWN
 * --------------------------------------------------------------------------------------------------------- */
{
    // Handlers a PAGE polls on a timer. A slow one here is not a slow page, it is a slow BOX.
    const HOT = ["/system/stats", "/health", "/bridge/state"];
    const bad = [];
    for (const route of HOT) {
        const i = src.indexOf('req.url === "' + route + '"');
        if (i < 0) continue;
        // The handler body, to the next top-level route test -- generous rather than exact, because
        // OVER-scanning risks a false alarm and UNDER-scanning misses the thing being hunted.
        const j = src.indexOf('if (req.method === ', i + 10);
        const body = src.slice(i, j > i ? j : i + 6000);
        for (const m of body.matchAll(/exec(File)?Sync|spawnSync|readFileSync\(\s*[^)]*\bnvidia/g))
            bad.push(route + " -> " + m[0]);
    }
    ok("!! *** NO SYNCHRONOUS SPAWN IN A HANDLER A PAGE POLLS ON A TIMER ***", bad.length === 0,
       bad.length ? "FOUND: " + bad.join(", ") + " -- this stops the event loop and every other request waits."
                  : `${HOT.join(", ")} are clean. *** /system/stats HELD execFileSync("nvidia-smi") UNTIL v3476 AND BLOCKED THE ENGINE FOR UP TO 129 SECONDS AT A TIME. The gauges it feeds were the visible casualty; the static files it delayed were the misleading evidence. ***`);
}

/* ------------------------------------------------------------------------------------------------------------
 * 2. THE PROBE IS CACHED, GUARDED AND WALL-CLOCKED
 * --------------------------------------------------------------------------------------------------------- */
{
    ok("!! the GPU reading is served from a cache and refreshed asynchronously",
       /_gpuCache/.test(src) && /execFile\(\s*"nvidia-smi"/.test(src),
       "out.gpu comes from _gpuCache and _refreshGpuAsync uses execFile with a callback. A STALE GPU NUMBER IS BETTER THAN A STALLED ENGINE, and gpuAgeMs reports the staleness so nobody has to guess how old it is.");

    ok("!! *** and the probe cannot pile up behind itself ***", /_gpuCache\.inflight/.test(src),
       "*** AN IN-FLIGHT FLAG IS WHAT TURNS A 1.5 SECOND CALL INTO A 129 SECOND ONE WHEN IT IS MISSING: requests arriving faster than the probe returns each start another, and they queue. The growth in Keith's log -- 57s, 84s, 105s, 129s -- is the shape of something accumulating, not of one slow call. ***");

    ok("!! and a WALL CLOCK sits on top of the child timeout",
       /did not answer within/.test(src),
       "*** THE CHILD TIMEOUT DOES NOT COVER PROCESS CREATION, AND CREATION IS WHAT WAS SLOW -- antivirus scanning a spawn, a driver in a bad state after a reboot, eight version folders being deleted by a detached worker. A timeout that bounds the wrong phase reads like protection and is not. ***");
}

/* ------------------------------------------------------------------------------------------------------------
 * 3. THE REST ARE REPORTED BY LINE, NOT BANNED
 * --------------------------------------------------------------------------------------------------------- */
{
    const sites = [];
    const codeLines = noComments(raw).split("\n");
    codeLines.forEach((l, i) => { if (/exec(File)?Sync|spawnSync/.test(l)) sites.push((i + 1) + ": " + (lines[i] || l).trim().slice(0, 78)); });
    for (const s of sites) say(s);
    ok("!! every remaining synchronous spawn is listed by line, so a new one on a hot path is visible", true,
       `${sites.length} sites. *** NOT BANNED, BECAUSE A SYNCHRONOUS SPAWN AT STARTUP OR IN A CLI TOOL IS FINE AND BANNING IT WOULD MAKE THIS GATE SOMETHING PEOPLE ROUTE AROUND. What is banned is the one place it is never safe. The list is here so the next one gets read rather than discovered from a boot log. ***`);
}

console.log(fails ? "\nrequestPathSync-selfcheck: " + fails + " FAILED" : "\nrequestPathSync-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
