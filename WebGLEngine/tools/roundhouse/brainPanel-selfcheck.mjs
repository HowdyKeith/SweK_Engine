// tools/roundhouse/brainPanel-selfcheck.mjs
//
// v2964 -- THE BRAIN PANEL SHOWS WHAT THE BRAIN IS DOING.
//
// panel-brain.html was 29 lines: an animated SVG and the word "idle" or "solving". The brain had always emitted
// hellos, solves and narrations, and /ai/brain/health had always known whether it was alive, idle or stale --
// every bit of it was computed and discarded. Nothing RETAINED a readable trace, so there was nothing to show.
//
// This adds a bounded activity ring and lifts it into the panel alongside the health verdict. The rule it must
// not break: an operator glancing at a panel BELIEVES it, so a stale trace must never be presented as current.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const panel = fs.readFileSync(path.join(root, "panel-brain.html"), "utf8");
const bridge = fs.readFileSync(path.join(root, "ai-bridge", "gpuBrainBridge.js"), "utf8");

// ---- 1. SOMETHING IS ACTUALLY RETAINED NOW ------------------------------------------------------------------------------
{
    ok("!! the bridge keeps a bounded activity ring",
        /const _activity = \[\]/.test(bridge) && /ACTIVITY_KEEP = 300/.test(bridge) && /_activity\.splice\(0,/.test(bridge),
        "300 entries, trimmed on every write. Bounded because an unbounded log on a long-running hub is a memory " +
        "leak with a friendly name -- the same reason every other bridge here slices its logTail");

    const sites = (bridge.match(/\bnote\(/g) || []).length;
    ok("hellos, solves and narrations are recorded",
        sites >= 4 && /note\("solve"/.test(bridge) && /note\("hello"/.test(bridge) && /note\("narrate"/.test(bridge),
        (sites - 1) + " call sites on the routes that mean something. Before this, all three happened and left no trace");
}

// ---- 2. THE RING RECORDS, IT DOES NOT INTERPRET ---------------------------------------------------------------------------
{
    ok("!! the ring stores what happened, with no verdict or score attached",
        !/note\([^)]*verdict|note\([^)]*score|note\([^)]*grade/.test(bridge),
        "kind, text, timestamp. The panel decides how to display it and the reader decides what it means -- a " +
        "log that pre-judged its own entries would be an opinion wearing a timestamp");
}

// ---- 3. A STALE TAIL IS LABELLED, NOT PASSED OFF AS LIVE --------------------------------------------------------------------
{
    ok("!! the endpoint reports the AGE of the newest entry",
        /ageMs: newest \? Date\.now\(\) - newest : null/.test(bridge),
        "so the panel can tell the difference between a quiet brain and a dead one");

    ok("!! and the panel marks an old tail as stale rather than showing it as current",
        /STALE_MS/.test(panel) && /\(stale\)/.test(panel),
        "an operator glancing at a panel believes it. Showing an hour-old trace with no marking would be the " +
        "panel lying by omission -- the same reason the fleet roster reports age instead of a live/dead verdict");
}

// ---- 4. AN UNREACHABLE BRIDGE SAYS SO, RATHER THAN LOOKING IDLE -----------------------------------------------------------
{
    ok("!! losing the bridge is distinguished from the brain being idle",
        /brain bridge unreachable/.test(panel) && /is the engine running/.test(panel),
        "a failed fetch used to leave the panel showing 'idle' -- indistinguishable from a healthy quiet brain. " +
        "Now it says the bridge is unreachable and suggests why");

    ok("an empty ring is explained, not shown as a blank box",
        /nothing recorded yet/.test(panel),
        "'the brain has not said hello, solved a field, or narrated since this hub started' -- a blank panel " +
        "with no explanation reads as broken when it usually means nothing has happened yet");
}

// ---- 5. THE ORIGINAL ORNAMENT SURVIVED ---------------------------------------------------------------------------------------
{
    ok("the brain SVG and its idle/solving label still mount",
        /mountBrainSvg/.test(panel) && /onActive/.test(panel),
        "the animation was the whole panel and it is still there -- the console is added beside it, not in place " +
        "of it. Replacing a working thing while adding a feature is how a round breaks something nobody asked about");

    ok("fetched text is escaped before rendering",
        /const esc = /.test(panel) && /esc\(e\.text\)/.test(panel),
        "the tail is rendered as text; a narration containing markup cannot become markup");
}

console.log();
if (fails) { console.log("brainPanel-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("brainPanel-selfcheck: all checks pass");
