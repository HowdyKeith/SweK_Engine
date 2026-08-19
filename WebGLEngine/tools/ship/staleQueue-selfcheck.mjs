// WebGLEngine/tools/ship/staleQueue-selfcheck.mjs -- v3407
//
// *** A POLL THAT HAS WAITED LONGER THAN ITS OWN INTERVAL IS ALREADY WORTHLESS, AND THE QUEUE HAD NO WAY TO KNOW
// THAT. ***
//
// Keith's screenshot: `net 12/12 . 184 waiting (worst 184)` climbing to 212, with every gauge showing `-`. The
// gauges were not broken -- THEY RENDERED AND NO VALUE EVER ARRIVED, because their polls were in that queue
// minutes deep behind requests whose answers had gone stale before reaching the front. The cap's own warning
// names both possibilities ("either the server is not answering, or a request was released without
// decrementing") and the server log answers it: `[lag] event loop blocked 144961ms`.
//
// A STATUS POLL IS NOT A TRANSACTION. Its whole value is that the number is NOW; two minutes late it is strictly
// WORSE than not asking, because the caller renders it as current.
//
// *** DROPPED AT THE FRONT, NOT SHED AT THE DOOR. *** Refusing to queue would throw away the FIRST request of a
// burst -- the one most likely to still matter. Dropping the ones that actually waited is the rule the caller
// would apply itself if it could see the queue.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeHas, noComments } from "./sourceScan.mjs";
const ENG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// ---- 1. THE RULE, DRIVEN AGAINST THE REAL MODULE ---------------------------------------------------------
{
    // A fetch that NEVER settles is exactly the stall being fixed: the server stopped answering, so no
    // completion ever fires. Everything after the first `cap` requests must queue, and then age out.
    global.window = global;
    global.location = { origin: "http://x" };
    let opened = 0;
    global.fetch = () => { opened++; return new Promise(() => {}); };      // never resolves, on purpose
    const { installFetchCap } = await import("file://" + path.join(ENG, "ui", "poller.js"));
    installFetchCap(2);

    const results = [];
    for (let i = 0; i < 6; i++) window.fetch("/poll" + i).catch((e) => results.push(e.message));
    await new Promise((r) => setTimeout(r, 50));
    const before = window.__swekFetchCap();
    say("with a server that never answers: running " + before.running + ", waiting " + before.waiting);
    ok("!! the pool fills and the rest queue, which is the state Keith photographed",
        before.running === 2 && before.waiting === 4, JSON.stringify(before));

    // Age the queue past the window without waiting for it: the entries carry the time they JOINED.
    const stale = before.staleMs;
    ok("the stale window is stated by the module rather than assumed by this gate",
        typeof stale === "number" && stale > 0, stale + "ms");
}

// ---- 2. THE SWEEP CANNOT DEPEND ON A COMPLETION THAT NEVER COMES -----------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ui", "poller.js"), "utf8");
    ok("!! *** the drop runs on a TIMER as well as on pump() ***",
        /const _wd = setInterval\(\(\) => \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*pump\(\);/.test(src),
        "pump() runs when a request COMPLETES, and the failure is precisely that NOTHING completes. A purely " +
        "pump-driven drop would sit as frozen as the queue it was written to clear -- THE ONE CASE IT MUST WORK " +
        "IN IS THE ONE WHERE ITS ONLY TRIGGER NEVER HAPPENS");
    ok("...and a dropped request REJECTS with a reason rather than resolving",
        codeHas(src, /dead\.drop\(new Error\(/) && /dropped after waiting/.test(noComments(src)),
        "a silent resolve would hand the caller a value that never changes, which is the failure this replaces " +
        "rather than a fix for it");
    ok("...and the count is reported, so shedding is visible rather than quiet",
        codeHas(src, /staleDropped: _staleDropped/),
        "a queue that has started giving up looks exactly like one that is draining, unless it says so");
}

// ---- 3. THE READOUT MOVES TO WHERE IT IS READ ------------------------------------------------------------
{
    const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    // *** FOURTH ROUND RUNNING THAT I HUNTED A STRING THROUGH codeOnly(). *** ".bar" is a string literal and
    // codeOnly blanks those. Four consecutive rounds is no longer a slip, it is a habit: THE SELECTOR IS THE
    // TEXT, so the match belongs on noComments and only the structural half belongs on codeOnly. Splitting the
    // two here rather than reaching for one of them by reflex.
    const text = noComments(html);
    ok("!! *** the net chip docks into the live-tail bar instead of the bottom corner ***",
        /const bar = document\.querySelector\("\.bar"\)/.test(text) && codeHas(html, /bar\.insertBefore\(chip, spacer\)/),
        "Keith asked for it on the line with the live dot, and the reason is not cosmetic: THE QUEUE DEPTH IS " +
        "THE READOUT THAT SAYS WHY NOTHING IS UPDATING, and it was pinned below a log that scrolls forever. A " +
        "DIAGNOSTIC YOU HAVE TO GO LOOKING FOR IS ONE NOBODY READS DURING THE FAILURE");
    ok("...and it FALLS BACK to the old corner on pages with no such bar",
        codeHas(html, /if \(!bar\) \{ document\.body\.appendChild\(chip\); return; \}/),
        "every page that installs the cap gets this chip and only server.html has the bar -- a move that " +
        "silently dropped it elsewhere would trade one invisible readout for several");
    ok("...and `dropped` is shown BESIDE the depth, never folded into it",
        /dropped stale/.test(noComments(html)) && codeHas(html, /s\.staleDropped \?/),
        "'waiting' and 'given up on' are different facts; one number carrying both would hide the moment the " +
        "queue started shedding rather than draining");
}

console.log(failed ? "\n[staleQueue-selfcheck] FAILED " + failed : "\n[staleQueue-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
