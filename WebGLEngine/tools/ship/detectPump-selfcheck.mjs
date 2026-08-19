// tools/ship/detectPump-selfcheck.mjs
//
// Run: node tools/ship/detectPump-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3116 -- THE OFF-THREAD DETECT: MAKE THE UNTESTABLE PART THIN AND THE TESTABLE PART REAL.
//
// v3110 found detectForVideo() running SYNCHRONOUSLY inside a requestAnimationFrame tick with no worker -- the
// third appearance of this tree's oldest lesson. It diagnosed and gated it; nothing fixed it, because the fix
// needs a browser and a camera and this sandbox has neither.
//
// SO THE SHAPE OF THE FIX IS THE FINDING. The worker shell and the ImageBitmap transfer cannot be exercised
// here, so they are kept to a few dozen lines with no decisions in them. Everything that DECIDES anything --
// when to send, what a missing reply means, whether the pipeline is alive -- lives in face/detectPump.js, is
// pure, and is checked below. A design whose only evidence is "it looked fine on the rig" is what this whole
// project is arranged against.
//
// AND THE WORKER PATH IS OPT-IN, NOT A REPLACEMENT. Swapping a working synchronous detect for an unverified
// asynchronous one would trade a KNOWN cost for an UNKNOWN risk, which is the wrong direction even when the
// known cost is real.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const { createPump, SILENCE_MS } = await import(pathToFileURL(path.join(ENG, "face", "detectPump.js")).href);
const workerRaw = fs.readFileSync(path.join(ENG, "face", "faceWorker.js"), "utf8");
const trackerRaw = fs.readFileSync(path.join(ENG, "face", "MediaPipeFaceTracker.js"), "utf8");
// v3116 -- TWO VIEWS, BECAUSE TWO KINDS OF QUESTION. codeOnly() blanks comments AND STRINGS, which is right
// for "does this file CALL detectForVideo" and wrong for "does it post a message typed 'initFailed'". The first
// draft of this gate matched string literals against codeOnly and failed two checks on code that was plainly
// there -- the same split v3107 had to make for exit listeners, and the reason sourceScan ships both.
const worker = codeOnly(workerRaw), tracker = codeOnly(trackerRaw);
const workerStr = noComments(workerRaw), trackerStr = noComments(trackerRaw);

// ---- 1. BACKPRESSURE: DROP, NEVER QUEUE -------------------------------------------------------------------------
{
    const p = createPump({ targetHz: 30 });
    ok("!! a second frame while one is in flight is DROPPED, not queued",
        p.shouldSend(0) === true && p.shouldSend(1) === false && p.stats().dropped === 1,
        "queueing grows latency without bound and leaks a bitmap a frame at a time, and the symptom -- a face " +
        "lagging further behind the longer you watch -- looks like a slow model rather than a full queue");

    p.onResult(20);
    ok("...and the rate limit still applies after a reply",
        p.shouldSend(25) === false && p.shouldSend(40) === true,
        "33ms at 30Hz. Off-thread does not mean unbounded");

    const q = createPump({});
    q.shouldSend(0); q.onSendFailed();
    ok("!! a failed SEND clears the slot, so the pump cannot wedge",
        q.shouldSend(100) === true,
        "if the bitmap never left, nothing will ever reply -- and without this the pump would wait forever for " +
        "an answer to a question it never asked");
}

// ---- 2. THE DISTINCTION THIS FILE EXISTS FOR ----------------------------------------------------------------------
{
    const p = createPump({ silenceMs: 2000 });
    ok("!! a pump that has been asked NOTHING is idle, not silent",
        p.health(0) === "idle",
        "'nothing has happened yet' is not a fault, and reporting it as one would make every page load look " +
        "like a broken pipeline");

    p.shouldSend(0);
    ok("...alive while a frame is genuinely in flight",
        p.health(10) === "alive");

    ok("!! and SILENT once a sent frame goes unanswered past the budget",
        p.health(2500) === "silent",
        "SILENCE_MS = " + SILENCE_MS + ". *** A SILENT WORKER LOOKS EXACTLY LIKE AN EMPTY ROOM: *** if it dies, " +
        "blendshapes just stop arriving, and v3114's wiring reads absent blendshapes as 'noface' -- which means " +
        "the camera works and nobody is in frame. Wrong fact, wrong fix, user goes and checks the lighting");

    p.onResult(2600);
    ok("...and recovers the moment a reply lands",
        p.health(2610) === "alive",
        "silence is a current condition, not a latch -- a pipeline that recovered must not keep accusing itself");
}

// ---- 3. THE TRACKER REFUSES TO VOUCH FOR A COMPONENT IT HAS NOT HEARD FROM ------------------------------------------
{
    ok("!! snapshot() reports active:false when the pipeline is silent",
        /health\(performance\.now\(\)\) === "silent"/.test(trackerStr) &&
        /active: this\._enabled && !silent,/.test(tracker),
        "a silent pipeline is not an active tracker whatever the enable flag says. Reporting active:true would " +
        "be the tracker vouching for something it has not heard from -- and it is what routes v3114's robot to " +
        "'unavailable' instead of 'noface'");

    ok("...and the pipeline reports on ITSELF, separately from what it saw",
        /pipeline: \{/.test(tracker) && /mode:/.test(tracker) && /health:/.test(tracker) && /fellBack:/.test(tracker),
        "mode / health / stats / fellBack. A page can then say WHICH thing is wrong rather than showing one " +
        "word for a dead worker and an empty chair");
}

// ---- 4. THE WORKER'S TWO WAYS TO BE QUIETLY WRONG -------------------------------------------------------------------
{
    ok("!! the bitmap is closed in a finally",
        /finally \{[\s\S]{0,120}?bitmap\.close\(\)/.test(worker),
        "an ImageBitmap holds GPU memory until close(). A detect that throws would leak one image PER FRAME, " +
        "and the symptom is the tab slowly dying with nothing pointing at this line");

    ok("!! and only the fields the main thread reads are posted back",
        /faceLandmarks: r\?\.faceLandmarks/.test(worker) && !/postMessage\(\{ type: "result", seq: msg\.seq, result: r \}/.test(worker),
        "posting the whole result structured-clones 478 landmarks every frame for the sake of the few that are " +
        "used -- which would hand back on the main thread exactly what moving off it was meant to save");

    ok("...and an init failure is NAMED, not swallowed",
        /type: "initFailed", error:/.test(workerStr),
        "the main thread falls back to the synchronous path on this message, and a fallback that happens " +
        "silently is a performance change nobody can account for six months later");
}

// ---- 5. WHAT IS NOT CLAIMED ------------------------------------------------------------------------------------------
{
    ok("!! the synchronous path is still the DEFAULT",
        /STILL THE SYNCHRONOUS PATH, AND STILL THE DEFAULT/.test(trackerRaw) &&
        /detectForVideo\(this\._videoEl, now\)/.test(tracker),
        "opt-in via useWorker. Replacing a working detect with an unverified one trades a KNOWN cost for an " +
        "UNKNOWN risk, which is the wrong direction even when the known cost is real");
    console.log("  NOTE   NOT VERIFIED HERE, and cannot be: that a worker actually loads the model, that an");
    console.log("         ImageBitmap transfers, or that main-thread stalls actually go away. v3110's");
    console.log("         responsiveness probes are the instrument for the last one -- run them on face-mirror");
    console.log("         with useWorker on and off and compare. What IS verified is every decision the loop makes.");
}

console.log();
if (fails) { console.log("detectPump-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("detectPump-selfcheck: all checks pass");
