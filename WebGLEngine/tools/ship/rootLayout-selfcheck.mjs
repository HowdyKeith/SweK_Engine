// WebGLEngine/tools/ship/rootLayout-selfcheck.mjs -- v3466
//
// Run: node tools/ship/rootLayout-selfcheck.mjs
//
// *** THE ROOT WENT FROM 41 FILES TO 11, AND THE ONLY THING THAT COULD HAVE GONE WRONG IS SILENT. ***
//
// Keith names the files he actually double-clicks: START_NODE_Engine.bat and MAKE_GMAIL_SAFE.bat on Windows;
// "Start Mac SweK Engine.command", make_Mac_SweK_Runnable.sh, make_gmail_safe.sh and "make Gmail safe zip run
// again.sh" on the Mac. Everything else moved to "Root Utils" -- and "some of the root files probably are
// useful and I just dont know" is exactly why they were MOVED rather than deleted.
//
// THE HAZARD IS NOT THE MOVE, IT IS THE ANCHOR. Nearly every launcher here starts with `cd /d "%~dp0"` and then
// reaches for WebGLEngine BESIDE ITSELF. Moved one directory down, %~dp0 points at "Root Utils", WebGLEngine is
// no longer there, AND THE WINDOW OPENS, THE cd FAILS AND THE SCRIPT CARRIES ON IN THE WRONG DIRECTORY. No
// error anybody reads. START_HERE_SILENT.vbs was the honourable exception -- it derives the root from its own
// path and pops "layout broken" -- which is the only reason that class of failure is visible at all.
//
// So every moved script must CLIMB ONE LEVEL, and this gate asserts it, because the failure cannot be seen from
// here: none of these run on Linux and none of them can be executed in the sandbox. *** A CHECK THAT READS THE
// SOURCE IS THE ONLY CHECK AVAILABLE, WHICH MAKES IT THE ONE THAT HAS TO BE RIGHT. ***
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const UTILS = path.join(ROOT, "Root Utils");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

/* 1. THE FILES KEITH NAMED ARE IN ROOT, BY NAME ------------------------------------------------------------ */
const KEITHS = ["START_NODE_Engine.bat", "MAKE_GMAIL_SAFE.bat", "Start Mac SweK Engine.command",
                "make_Mac_SweK_Runnable.sh", "make_gmail_safe.sh", "make Gmail safe zip run again.sh"];
const missing = KEITHS.filter((f) => !fs.existsSync(path.join(ROOT, f)));
ok("!! *** every launcher Keith actually uses is still in the ROOT, checked by name ***", missing.length === 0,
   missing.length ? "MISSING: " + missing.join(", ") : KEITHS.length + " named launchers present. THE NAMES ARE THE CHECK, NOT THE COUNT: a tidy-up that left the right NUMBER of files while moving the one he double-clicks would pass a count and fail him on the first use.");

ok("!! and _SETUP.bat is in ROOT, because it is the half of the workflow SOMEBODY ELSE runs",
   fs.existsSync(path.join(ROOT, "_SETUP.bat")),
   "MAKE_GMAIL_SAFE.bat's own text says 'Recipient then runs _SETUP.bat to rename everything back'. IT WAS MOVED OUT AND PUT BACK on reading that line: the recipient opens a zip they did not build, and burying their one instruction two folders down is the opposite of the tidy-up's point.");

/* 2. EVERY MOVED SCRIPT CLIMBS ONE LEVEL -------------------------------------------------------------------- */
{
    const scripts = fs.existsSync(UTILS) ? fs.readdirSync(UTILS).filter((f) => /\.(bat|sh|command|vbs)$/i.test(f)) : [];
    const bad = [];
    for (const f of scripts) {
        const src = fs.readFileSync(path.join(UTILS, f), "utf8");
        // Only scripts that actually REACH FOR THE TREE need an anchor; a pure netstat or curl wrapper does not.
        const reaches = /WebGLEngine|\.\\Shared|\bcloud\b/.test(src);
        if (!reaches) continue;
        // THE CLIMB HAS FOUR SPELLINGS IN THIS TREE AND MY FIRST VERSION KNEW THREE, so it failed
        // deploy-rendezvous-to-gcp.sh, which climbs correctly via ${BASH_SOURCE[0]}. Checked against the
        // PRISTINE copy before believing the gate over the script: the original read `dirname "${BASH_SOURCE[0]}"`
        // and used $SCRIPT_DIR/cloud/..., so with the climb added it still resolves to the same root. THE GATE
        // WAS WRONG AND THE SCRIPT WAS RIGHT -- which is the reading the tree insists on before anything is
        // "fixed" to satisfy a check.
        const climbs = /%~dp0\.\.|dirname "\$0"\)\/\.\.|BASH_SOURCE\[0\]\}"\)\/\.\.|GetParentFolderName\(fso\.GetParentFolderName/.test(src);
        if (!climbs) bad.push(f);
    }
    ok("!! *** every moved script that reaches for the tree CLIMBS OUT OF \"Root Utils\" first ***", bad.length === 0,
       bad.length ? "NOT CLIMBING: " + bad.join(", ") + " -- each will cd into a directory that has no WebGLEngine in it and carry on regardless."
                  : scripts.length + " scripts checked. A script that only runs netstat or curl needs no anchor and is not required to have one -- demanding it would be a check that fires on correct files.");
}

/* 3. NOTHING IN ROOT CALLS SOMETHING THAT MOVED ------------------------------------------------------------- */
{
    const rootScripts = fs.readdirSync(ROOT).filter((f) => /\.(bat|sh|command|vbs)$/i.test(f));
    const movedNames = fs.existsSync(UTILS) ? fs.readdirSync(UTILS) : [];
    const calls = [];
    for (const r of rootScripts) {
        const lines = fs.readFileSync(path.join(ROOT, r), "utf8").split(/\r?\n/);
        for (const line of lines) {
            // COMMENTS DO NOT COUNT, AND THAT DISTINCTION IS THE WHOLE CHECK: all four cross-references found
            // during the move were PROSE -- "the Node equivalent of START_BUN_Full.bat", "Recipient then runs
            // _SETUP.bat" -- and treating them as calls would have produced four phantom breakages.
            if (/^\s*(::|REM\b|#|')/i.test(line)) continue;
            // A reference that already says "Root Utils" is REPOINTED, not broken -- and the first version of
            // this check could not tell those apart, so it failed the two lines I had just corrected. The test
            // is whether the name is reached at the OLD location, not whether the name appears.
            if (/Root Utils/.test(line)) continue;
            for (const m of movedNames) if (line.includes(m)) calls.push(r + " -> " + m);
        }
    }
    ok("!! *** no root launcher CALLS a file that moved -- and comments are excluded, which is the point ***",
       calls.length === 0,
       calls.length ? "BROKEN CALLS: " + calls.join(", ")
                    : "checked " + rootScripts.length + " root scripts against " + movedNames.length + " moved files, comment lines skipped. Every cross-reference found during the move was PROSE; a check that counted those would have reported four breakages that do not exist.");
}

/* 4. THE ROOT IS ACTUALLY TIDY, AND THE CEILING IS A NUMBER SOMEBODY CHOSE ---------------------------------- */
{
    const loose = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
    ok("!! the root holds a dozen files or fewer", loose.length <= 12,
       loose.length + " files: " + loose.join(", ") + ". Was FORTY-ONE. The ceiling is deliberately a LITERAL rather than a re-measurement, so the next file dropped in root has to be argued for rather than absorbed.");

    ok("...and README, BACKLOG and TODO stayed, which is not an oversight",
       ["README.md", "BACKLOG.md", "TODO.md"].every((f) => loose.includes(f)),
       "They are the three files a stranger opens first, BACKLOG and TODO are written by the ship ritual every round, and .gitignore only works where it is. A tidy-up that hid the changelog would be tidier and worse.");
}

console.log(fails ? "\nrootLayout-selfcheck: " + fails + " FAILED" : "\nrootLayout-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
