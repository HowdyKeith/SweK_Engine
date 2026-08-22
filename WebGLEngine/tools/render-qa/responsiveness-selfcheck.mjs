// tools/render-qa/responsiveness-selfcheck.mjs
//
// v3110 -- RENDER-QA COULD NOT SEE STUTTER, AND THE PAGE THAT NEEDED IT MOST WAS NOT IN THE MANIFEST.
//
// Two findings, one round:
//
//   1. EVERY CHECK IN checks.mjs IS A PIXEL CHECK. notAllBlack, notUniform, colorPresent, luminanceInRange --
//      the right shape for "did this render", and structurally blind to work that blocks the thread which has to
//      stay responsive. A page blocking main for 80ms a frame screenshots IDENTICALLY to one that does not.
//
//   2. face-mirror.html WAS NOT IN THE MANIFEST AT ALL. It is the only page driving MediaPipeFaceTracker, whose
//      detectForVideo() is synchronous and is called from a requestAnimationFrame tick with no worker anywhere in
//      the file. The page where the defect would show was the page nothing looked at, because it needs a camera
//      and nothing had told headless Chromium to fake one.
//
// WHAT THIS GATE CAN AND CANNOT DO, stated rather than blurred. There is no browser in the sandbox -- render-qa's
// own header says so -- so this cannot measure a frame time. It checks the things that are decidable from source:
// that the instrument exists, parses, resolves, and is pointed at the right page. The NUMBERS come from a run on
// the rig, and until they exist the probe stays DATA and no threshold is invented from taste.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROBES, mainThreadResponsiveness } from "./probes.mjs";
import { CHECKS } from "./checks.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const rq = fs.readFileSync(path.join(HERE, "render-qa.mjs"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "manifest.json"), "utf8"));
const pages = manifest.pages || manifest;

// ---- 1. THE BLINDNESS THAT MOTIVATED THIS, STATED AS A CHECK -------------------------------------------------------
{
    const names = Object.keys(CHECKS);
    const anyTiming = names.some((n) => /frame|fps|jank|respons|timing|latency/i.test(n));
    ok("!! every render-qa CHECK is a pixel check -- none can see a stutter",
        !anyTiming && names.length >= 5,
        names.join(", ") + ". This is not a complaint about checks.mjs, which does its job. It is why a probe was " +
        "needed: a blocked main thread renders a perfect screenshot, just late, so no pixel invariant can ever " +
        "catch it");
}

// ---- 2. THE INSTRUMENT EXISTS AND IS VALID JAVASCRIPT ----------------------------------------------------------------
{
    ok("the probe is a single EXPRESSION, which is how render-qa evaluates it",
        (() => { try { new Function("return " + mainThreadResponsiveness); return true; } catch { return false; } })(),
        "render-qa wraps it as `(() => { try { return <probe>; } ... })()`, so a statement rather than an " +
        "expression would fail at run time on the rig with a syntax error and no page result");

    ok("!! it measures TWO independent ways, so a disagreement is visible",
        /longtask/.test(mainThreadResponsiveness) && /requestAnimationFrame/.test(mainThreadResponsiveness),
        "PerformanceObserver('longtask') is the browser's own >50ms report and is authoritative where supported; " +
        "rAF deltas work everywhere and catch what longtask cannot -- a run of 30ms blocks never trips the 50ms " +
        "threshold and still destroys the feel");

    ok("...and it reports whether longtask was supported rather than reading its absence as zero",
        /longtaskSupported/.test(mainThreadResponsiveness) && /longtaskSupported \? \{/.test(mainThreadResponsiveness),
        "an engine without the API would otherwise report a serenely empty longTasks list, which is the exact " +
        "shape of a green build that checked nothing");

    ok("it returns numbers and NO verdict",
        !/\bpass\b|\bfail\b|\bok:\s*(true|false)/.test(mainThreadResponsiveness),
        "a probe is data and never flips a page's ok. Nobody has a defensible jank threshold for these pages yet, " +
        "and inventing one here would be choosing a tolerance instead of measuring it");
}

// ---- 3. IT IS POINTED AT THE PAGE THAT NEEDED IT ----------------------------------------------------------------------
{
    const fm = pages.find((p) => p.url === "/face-mirror.html");
    ok("!! face-mirror.html is in the manifest -- it was not, and it is the MediaPipe page",
        !!fm,
        "the only page driving MediaPipeFaceTracker, and the only one where a synchronous detectForVideo in a rAF " +
        "tick would show. It was absent because it needs a camera and nothing faked one");

    ok("...and it carries the responsiveness probe",
        fm && fm.probe === "@mainThreadResponsiveness",
        "referenced by NAME rather than inlined -- an inline probe copied across entries is the duplicated-table " +
        "bug in a JSON file, and this tree has met that shape often enough not to invite it");

    ok("the named probe resolves, and an unknown name is an ERROR rather than a silent skip",
        /PROBES\[pg\.probe\.slice\(1\)\]/.test(rq) && /unknown named probe/.test(rq),
        "a typo in a probe name must not look like a page that simply had no probe -- that is a green run that " +
        "measured nothing");

    ok("!! headless Chromium is told to fake a camera",
        /--use-fake-device-for-media-stream/.test(rq) && /--use-fake-ui-for-media-stream/.test(rq),
        "without both, getUserMedia either prompts and hangs or is denied. The fake device feeds a test pattern, " +
        "which answers 'does it render and stay responsive' and NOT 'does it track a real face' -- the manifest " +
        "note says so rather than letting a green run imply the stronger claim");
}

// ---- 4. THE DEFECT THIS EXISTS FOR IS STILL THERE, AND UNFIXED -----------------------------------------------------------
{
    const tracker = fs.readFileSync(path.join(HERE, "..", "..", "face", "MediaPipeFaceTracker.js"), "utf8");
    const sync = /detectForVideo\s*\(/.test(tracker);
    const worker = /new Worker|Worker\(/.test(tracker);
    ok("!! the tracker still calls detectForVideo synchronously with no worker -- measured, not fixed",
        sync && !worker,
        "this round did NOT fix it, and says so. The fix is a web worker, the page needs a camera to verify, and " +
        "shipping an untested rewrite of a working face tracker to fix a cost nobody has measured yet would be " +
        "the wrong order. Run render-qa on the rig, read frameMs.p95 and framesOver50ms, then decide");
}

console.log();
if (fails) { console.log("responsiveness-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("responsiveness-selfcheck: all checks pass");
