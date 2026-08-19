// WebGLEngine/ui/webgpuOrigin-selfcheck.mjs -- v3816
//
// Run: node ui/webgpuOrigin-selfcheck.mjs
//
// *** THIS IS THE SAME COMPLAINT TWICE, FROM THE SAME PERSON, ABOUT THE SAME SENTENCE. ***
//
// v3666, Keith: "this computer has webgpu and it works with our blob webgpu and all the webgpu.com demos", and
// server.html said "this browser has no WebGPU". ui/webgpuProbe.mjs was written to answer it, and its header
// names the cause exactly: WebGPU is gated on a SECURE CONTEXT, so over http://<lan-ip>:8787 the browser has
// WebGPU and does not expose it to that origin. It even names a LAN address: 192.168.50.53:8787.
//
// v3815, Keith: "http://192.168.50.194:8787/mpm-gpu-check.html and mpm-gpu.html report no gpu, but webgpu is
// confirmed to be working on this pc, we have had the detector mis-report before."
//
// *** HE WAS RIGHT THAT IT HAD HAPPENED BEFORE, AND THE PAGE THAT DID IT THE SECOND TIME WAS MINE. *** I wrote
// mpm-gpu.html at v3809 with a fresh `if (!navigator.gpu) throw "This browser has no WebGPU. Chrome or Edge
// will run it."` -- a second detector, carrying the exact sentence webgpuProbe.mjs's header quotes as the one
// to stop saying, in a tree that already had the fix sitting in ui/. I did not look for it.
//
// REPRODUCED before it was diagnosed: the same page served from 127.0.0.1 reports isSecureContext=true and
// navigator.gpu=true; served from a non-loopback address it reports false and false, and printed "This browser
// has no WebGPU. Chrome or Edge will run it." to a browser that has WebGPU. THE DETECTOR WAS NOT WRONG ABOUT
// THE FACT. IT WAS WRONG ABOUT THE CAUSE, AND THE CAUSE IS THE ONLY PART A PERSON CAN ACT ON.
//
// *** SO WHAT IS PINNED HERE IS THE CLASS, NOT THE TWO PAGES. *** Asserting "mpm-gpu.html imports the probe"
// would go green forever and catch the seventh page never. What is asserted is that NO PAGE DECIDES FOR ITSELF
// WHAT AN ABSENT navigator.gpu MEANS -- six were found saying it and all six now ask the module.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describeWebGPU } from "./webgpuProbe.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

console.log("1. THE MODULE STILL ANSWERS THE QUESTION IT WAS WRITTEN FOR");
{
    const lan = describeWebGPU({ navigator: {}, isSecureContext: false, location: { protocol: "http:", host: "192.168.50.194:8787", hostname: "192.168.50.194", pathname: "/mpm-gpu.html" } });
    ok("!! *** KEITH'S EXACT ORIGIN IS CLASSIFIED AS insecure-origin, NOT AS A MISSING BROWSER FEATURE ***",
        lan.reason === "insecure-origin" && lan.actionable === true,
        "reason=" + lan.reason + " actionable=" + lan.actionable);
    ok("...and the message names the origin and does NOT blame the browser",
        /secure origin/i.test(lan.message) && /192\.168\.50\.194/.test(lan.message) && !/browser has no WebGPU/i.test(lan.message),
        "a reader told \"this browser has no WebGPU\" goes and checks a driver, a browser version and a GPU, " +
        "NONE OF WHICH IS THE PROBLEM");
    ok("...and it offers localhost and the tunnel, which are the two routes that actually exist",
        /localhost/i.test(lan.message) && /trycloudflare|tunnel/i.test(lan.message),
        "the rig is reachable from another machine only over the LAN IP or the tunnel, and only one of those " +
        "is a secure context");

    const loop = describeWebGPU({ navigator: {}, isSecureContext: false, location: { hostname: "localhost", host: "localhost:8787" } });
    ok("!! localhost is NOT called insecure even when the flag says false", loop.reason !== "insecure-origin",
        "the browser treats localhost and 127.0.0.1 as secure over plain http; a check that trusted " +
        "isSecureContext alone would send somebody chasing a certificate they do not need");
    const real = describeWebGPU({ navigator: { gpu: {} }, isSecureContext: true, location: { hostname: "x" } });
    ok("a present navigator.gpu is reported available", real.available === true && real.reason === "present");
    const none = describeWebGPU({ navigator: {}, isSecureContext: true, location: { hostname: "example.com" } });
    ok("!! and a SECURE origin with no gpu is still 'no-webgpu' -- the honest version of the old sentence",
        none.reason === "no-webgpu" && none.actionable === false,
        "on https with no WebGPU the old message was RIGHT. It was only wrong about a LAN origin, which is " +
        "why it survived: it was correct wherever anybody normally tested it");
}

const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
// The branch where a page has decided WebGPU is absent. Only what it says HERE can mislead.
const ABSENCE = /!\s*navigator\.gpu|navigator\.gpu\s*===?\s*(?:undefined|null)/g;
// Naming a browser, a browser setting, or the reader's hardware as the cause.
const ATTRIBUTES = /(this|your)\s+browser|in this browser|Chrome|Edge|Safari|Firefox|Brave|chrome:\/\/|machine with a GPU|hardware acceleration|not supported|unsupported/i;
const MENTIONS = /WebGPU|navigator\.gpu/i;
// *** THE ESCAPE IS BRANCH-LOCAL, NOT PAGE-LOCAL, AND THAT IS A SECOND TIGHTENING. *** The old rule excused
// a page that mentioned webgpuProbe ANYWHERE in it, so a page could ask about the origin in one branch and
// still blame the browser in another. The probe has to be consulted in the branch that draws the conclusion.
const ASKS = /describeWebGPU|isSecureContext/;
const BRANCH = 420;   // characters of the absence branch read; long enough for the message, short enough to stay inside it
function blamesWithoutAsking(code) {
    const c = strip(code);
    ABSENCE.lastIndex = 0;
    for (let m = ABSENCE.exec(c); m; m = ABSENCE.exec(c)) {
        const region = c.slice(m.index, m.index + BRANCH);
        if (MENTIONS.test(region) && ATTRIBUTES.test(region) && !ASKS.test(region)) return true;
    }
    return false;
}

console.log("\n2. NO PAGE DECIDES FOR ITSELF WHAT AN ABSENT navigator.gpu MEANS");
{
    // *** v3845 -- THIS CHECK CLAIMED TO PIN A CLASS AND PINNED FOUR SPELLINGS. ***
    // The v3816 version matched /browser has no WebGPU|no WebGPU support|WebGPU is not supported|this browser
    // does not support WebGPU/ -- which is the wording of the six pages that round fixed, and nothing else. Its
    // own comment promised "a seventh page written next month is covered without anybody editing this file".
    // THE SEVENTH PAGE DID NOT NEED TO BE WRITTEN. Seven were already in the tree, saying the same wrong thing
    // in their own words, and the check reported all-clear over every one of them:
    //     celltrack-viewer-gpu  "WebGPU isn't available in this browser. Use Chrome or Edge 113+"
    //     webgpu-bench          "WebGPU is not available in this browser" + a chrome://gpu checklist
    //     hmc-bench, ising-bench "WebGPU unavailable -- run it on a machine with a GPU"
    //     magmap-bench          "WebGPU unavailable -- needs Chrome/Android or Safari 18+"
    //     magmap-android        "WebGPU unavailable" + a chrome://flags hint
    //     multigrid             "this browser exposes no navigator.gpu"
    // A PHRASE LIST IS A RECORD OF WHAT WAS ALREADY FIXED. What makes the sentence wrong is not its wording, it
    // is ATTRIBUTION: telling the reader the absence belongs to their browser, their browser's settings or their
    // machine, without having asked whether the ORIGIN is what withheld it.
    const pages = readdirSync(ROOT).filter((f) => f.endsWith(".html"));
    const offenders = [];
    let usingGpu = 0;
    for (const f of pages) {
        const raw = readFileSync(path.join(ROOT, f), "utf8");
        if (!/navigator\.gpu/.test(raw)) continue;
        usingGpu++;
        if (blamesWithoutAsking(raw)) offenders.push(f);
    }
    ok("!! *** NOT ONE OF THE " + usingGpu + " WebGPU PAGES ATTRIBUTES THE ABSENCE WITHOUT ASKING ABOUT THE ORIGIN ***",
        offenders.length === 0,
        offenders.length ? "still blaming: " + offenders.join(", ")
            : "six were fixed at v3816 by their wording; SEVEN MORE were saying it in words the v3816 rule did " +
              "not know, and are fixed at v3845 one file at a time. What is asserted now is attribution, not spelling");

    // THE OLD RULE, KEPT AND RUN, so the gap it left is a measurement rather than a story in a changelog.
    const OLD_PHRASES = /browser has no WebGPU|no WebGPU support|WebGPU is not supported|this browser does not support WebGPU/i;
    const FIXED_AT_3845 = ["celltrack-viewer-gpu.html", "webgpu-bench.html", "hmc-bench.html", "ising-bench.html",
                           "magmap-bench.html", "magmap-android.html", "multigrid.html"];
    const oldWouldCatch = FIXED_AT_3845.filter((f) => OLD_PHRASES.test(strip(readFileSync(path.join(ROOT, f), "utf8"))));
    ok("!! *** the four-phrase rule would have caught NONE of the seven it passed ***", oldWouldCatch.length === 0,
        "0 of 7 match any of the four spellings. THIS IS THE SIZE OF THE GAP between 'pins the class' and 'pins " +
        "the wording', measured on the tree rather than argued: the rule was green the whole time");

    const wired = pages.filter((f) => /webgpuProbe/.test(readFileSync(path.join(ROOT, f), "utf8")));
    ok("!! the pages that name a cause for a missing navigator.gpu ask the shared probe first", wired.length >= 13,
        wired.length + " pages import it: " + wired.join(", "));
    say("NOT ASSERTED: that all " + usingGpu + " import it. Most never claim a CAUSE -- they fall back quietly " +
        "or never mention WebGPU to the reader -- and a page that says nothing wrong is not a page with a bug. " +
        "*** THE DEFECT IS SAYING THE WRONG THING, NOT FAILING TO SAY THE RIGHT ONE, and widening this check to " +
        "\"every page must import the probe\" would turn " + (usingGpu - wired.length) + " working pages red to " +
        "flatter the rule. *** anime4k.html's \"CPU reference (no WebGPU here)\" is the shape that stays legal: " +
        "it names a STATE, not a cause, and sends nobody anywhere.");

    // The rule has to survive its own limits being stated: it reads a fixed window after the branch opens, and
    // it cannot read intent. What it pins is narrow and exact -- an attribution word inside the branch that
    // concluded WebGPU is absent, with no origin question in the same branch.
    say("WHAT THIS RULE IS NOT: a reader. It matches attribution WORDS in the branch, so a page could still " +
        "mislead in a sentence using none of them, and a " + BRANCH + "-character window could in principle run " +
        "past a very long branch into the next one. It is broader than four spellings by the seven files above, " +
        "and that is the whole of the claim.");
}

console.log("\n3. SABOTAGE");
{
    // *** THESE DRIVE THE SHIPPED PREDICATE, NOT A COPY OF IT. *** The v3816 version of this section declared
    // its own BLAMES and ASKS, so the sabotages proved a rule that no page was ever measured against -- a second
    // declaration of exactly the kind the rest of this tree keeps finding. blamesWithoutAsking is now the one
    // definition, used by the census above and sabotaged here.
    const relapse = 'const x = 1;\nif (!navigator.gpu) throw new Error("This browser has no WebGPU. Chrome or Edge will run it.");';
    ok("!! SABOTAGE: a page naming the cause WITHOUT checking the origin IS caught", blamesWithoutAsking(relapse),
        "which is precisely what I did at v3809, three years of tree-time after the module that answers it was " +
        "written");

    // *** THE ONE THAT MATTERS AT v3845: WORDING THE OLD RULE HAD NEVER SEEN. *** None of these four contains
    // any of the four phrases the v3816 list held, and each is the shape a real page in this tree was using.
    const OLD_PHRASES = /browser has no WebGPU|no WebGPU support|WebGPU is not supported|this browser does not support WebGPU/i;
    const freshWordings = [
        'if (!navigator.gpu) { show("WebGPU unavailable -- update Chrome and try again"); return; }',
        'if (!navigator.gpu) { show("WebGPU is not available in this browser."); return; }',
        'if (!navigator.gpu) { show("WebGPU unavailable -- run this on a machine with a GPU"); return; }',
        'if (!navigator.gpu) return { why: "this browser exposes no navigator.gpu" };',
    ];
    ok("!! ...and so is wording the four-phrase rule had never seen", freshWordings.every(blamesWithoutAsking),
        "all four are caught by ATTRIBUTION. This is the check that would have fired on the seven pages v3816 " +
        "passed, and it is the difference between pinning a class and pinning a changelog");
    ok("!! ...which the OLD rule demonstrably would not have", !freshWordings.some((w) => OLD_PHRASES.test(w)),
        "0 of 4 -- a phrase list cannot generalise, and its own comment claimed it could");

    const guarded = 'if (!navigator.gpu) { const p = describeWebGPU({ navigator, isSecureContext: window.isSecureContext, location }); throw new Error(p.reason === "insecure-origin" ? p.message : "This browser has no WebGPU"); }';
    ok("!! ...and the SAME sentence guarded by an origin check is NOT caught", !blamesWithoutAsking(guarded),
        "brain-bench.html keeps that sentence for the case where it is TRUE, and a rule that punished it would " +
        "have been loosened until it caught nothing");

    // *** THE ESCAPE IS BRANCH-LOCAL NOW, AND THIS IS WHAT THAT BUYS. *** A page that asks properly in one
    // branch and blames the browser in ANOTHER passed the v3816 rule, because the excuse was page-wide.
    const twoBranches = 'async function a(){ const p = describeWebGPU({ navigator, isSecureContext: window.isSecureContext, location }); if (!p.available) show(p.message); }\n' +
        'async function b(){ if (!navigator.gpu) { show("WebGPU unavailable -- use Chrome or Edge"); return; } }';
    ok("!! ...and asking in ONE branch no longer excuses blaming in another", blamesWithoutAsking(twoBranches),
        "the old rule tested the whole file for the word webgpuProbe, so half a fix read as a whole one");

    const commented = '// historical: it used to say "This browser has no WebGPU. Chrome or Edge will run it."\nconst x = 1;';
    ok("!! ...and a page EXPLAINING the old sentence in a comment is NOT caught either", !blamesWithoutAsking(commented),
        "the fix's own note quotes the wrong sentence on purpose. A check that could not tell prose from code " +
        "would make the history unwritable, which is how a lesson gets deleted to keep a gate green");

    // The legal shape, pinned so the rule cannot drift into forbidding a quiet fallback.
    const quiet = 'if (!navigator.gpu) { document.getElementById("engine").textContent = "CPU reference (no WebGPU here)"; return; }';
    ok("!! ...and a page that names a STATE rather than a cause stays legal", !blamesWithoutAsking(quiet),
        "anime4k.html's line. It tells the reader what is running and sends them nowhere -- there is nothing to " +
        "be wrong about, and a rule that reddened it would be a rule about vocabulary");
}

say("\nWHAT THIS DOES NOT DO: it cannot see Keith's screen. VERIFIED IN A HEADLESS CHROMIUM over a real " +
    "non-loopback address -- all six pages load with no page error and print the secure-origin message instead " +
    "of blaming the browser -- but a headless shell has NO ADAPTER EITHER, so what has been proven is that the " +
    "DIAGNOSIS is right, not that the tunnel or localhost route then produces a running kernel. *** THE OPEN " +
    "QUESTION IS KEITH'S: opening the same page as http://localhost:8787 ON THE RIG, or over the Public " +
    "tunnel's https address from another machine, should show the particles. If it still says no adapter " +
    "THERE, that is a different fault and a real one. *** brain-bench.html's sentence was corrected too, but " +
    "its #why element was empty on a headless load BEFORE AND AFTER the edit, so that one is unverified in situ.");

console.log("\nwebgpuOrigin-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
