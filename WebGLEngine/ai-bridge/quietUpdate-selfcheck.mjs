// WebGLEngine/ai-bridge/quietUpdate-selfcheck.mjs — v2551
//
// Run: node ai-bridge/quietUpdate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// AN UPDATE MUST NOT OPEN A BROWSER ON A MACHINE NOBODY IS SITTING AT.
//
// This is a DELIBERATE REVERSAL, not a bug fix, and the history is why it needs a gate:
//
//   v1569  gated the auto-open on _WAS_RELAUNCH.
//   v1599  REMOVED that gate ON PURPOSE: "opens server.html when NOTHING is connected. Fixes the case where a
//          peer-pulled auto-update relaunched with no live tab, and no console appeared."
//   v2514  made the relaunch flag FRESHNESS-checked -- "a handoff flag is seconds old; yesterday's is not".
//   v2551  puts the gate back, with an escape hatch.
//
// v1599's reasoning was sound for its case: push an update from elsewhere, want the console. But this fleet now
// includes a laptop in someone else's house that runs for weeks unwatched, and there the same code pops Safari
// open in front of its owner at 3am.
//
// The two cases differ by ONE fact that is already in hand: DID A PERSON AT THIS MACHINE ASK FOR THIS BOOT?
// "No tab is connected" does not mean "the tab died". IT ALSO MEANS NOBODY IS HERE. The old code could not tell
// those apart and guessed the flattering one.
//
// Because this reverses a deliberate earlier decision, the gate exists so that anyone re-reading v1599's comment
// in a year and "fixing" it back gets a build failure and this explanation, rather than silently re-breaking a
// machine in another house.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. the server's auto-open is gated on the relaunch flag -------------------------------------------------
{
    const src = fs.readFileSync(path.join(here, "server.js"), "utf8");
    ok("the auto-open is gated on _WAS_RELAUNCH again",
       /if \(_WAS_RELAUNCH && process\.env\.SWEK_OPEN_ON_UPDATE !== "1"\)/.test(src),
       "v1599 removed this gate on purpose; v2551 puts it back because the fleet now has an unwatched machine in it");
    ok("...and it returns rather than falling through to the open", /NOT opening one[\s\S]{0,400}?return;/.test(src));
    ok("...and the escape hatch exists (v1599's case is still real)", /SWEK_OPEN_ON_UPDATE/.test(src),
       "someone who pushes a remote update and wants the console can still have it");
    ok("...and the flag is still FRESHNESS-checked, not merely present (v2514)", /_WAS_RELAUNCH = \(\(\) =>/.test(src),
       "existence alone would make every launch after an update look like a relaunch");
}

// ---- 2. THE MACHINE THAT PROMPTED THIS: the Mac launcher ------------------------------------------------------
// The server is one opener. The launcher is another, and it fires BEFORE the server can decide anything.
{
    const p = path.join(root, "Start Mac SweK Engine.command");
    ok("the Mac launcher exists where this expects it", fs.existsSync(p), p.replace(root, "<root>"));
    if (fs.existsSync(p)) {
        const src = fs.readFileSync(p, "utf8");
        ok("the Mac launcher checks for an update-restart before opening a browser",
           /SWEK_WAS_UPDATE/.test(src) && /if \[ "\$SWEK_WAS_UPDATE" = "1" \]/.test(src));
        // THE RACE: server.js reads-and-CLEARS the marker on a timer after boot, and the launcher starts the
        // server BEFORE it opens the browser. So the reading must be taken at the TOP or it races the answer.
        const iCheck = src.indexOf("SWEK_WAS_UPDATE=0");
        const iOpen = src.indexOf('open "http://localhost:8787/server.html"');
        ok("...and it takes that reading BEFORE starting the server (or it races the marker's deletion)",
           iCheck > 0 && iOpen > 0 && iCheck < iOpen,
           "check at char " + iCheck + ", open at char " + iOpen + " -- server.js clears the marker on a timer after boot");
    }
}

// ---- 3. the honest gap, recorded rather than hidden ------------------------------------------------------------
// TEN Windows launchers open browsers, 23 lines between them. They are NOT fixed: the self-update "respawns node
// directly (not the launcher)" (server.js), so on Windows the SERVER's auto-open is the one that fires after an
// update -- and that is gated now. A double-clicked launcher opening a browser is CORRECT: a person asked.
{
    const bats = fs.readdirSync(root).filter((f) => f.toLowerCase().endsWith(".bat"));
    const openers = bats.filter((f) => /start .*http|start "" .*http/i.test(fs.readFileSync(path.join(root, f), "utf8")));
    ok("the Windows launchers still open browsers, and that is CORRECT (a person double-clicked them)",
       openers.length > 0,
       openers.length + " of " + bats.length + " .bat files open a browser -- the self-update respawns node DIRECTLY, not a launcher, so these do not fire on update");
}

console.log(fails ? "\nquietUpdate-selfcheck: " + fails + " FAILED" : "\nquietUpdate-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
