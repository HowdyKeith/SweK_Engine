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
// *** v3928 -- THE NAMED LIST WAS MISSING TWO LAUNCHERS, WHICH IS THE HOLE THE NEXT CHECK'S OWN WARNING NAMES.
// This file says "THE NAMES ARE THE CHECK, NOT THE COUNT: a tidy-up that left the right NUMBER of files while
// moving the one he double-clicks would pass a count and fail him on the first use" -- and then protected six
// names while TWO MORE DOUBLE-CLICK ENTRY POINTS SAT IN ROOT UNNAMED. A tidy-up could have moved either and
// this gate would have gone green.
//   "Check this Mac matches the fleet.command" -- its own SECOND LINE reads "DOUBLE-CLICK THIS ON THE MAC".
//   START_SweK_LATEST.bat -- a launcher whose header explains why it exists beside START_NODE_Engine.bat.
// Read, not guessed: both were opened before being added.
const KEITHS = ["START_NODE_Engine.bat", "MAKE_GMAIL_SAFE.bat", "Start Mac SweK Engine.command",
                "make_Mac_SweK_Runnable.sh", "make_gmail_safe.sh", "make Gmail safe zip run again.sh",
                "Check this Mac matches the fleet.command", "START_SweK_LATEST.bat"];
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

    // *** v3928 -- THE CEILING WAS TWELVE AND THIS FILE'S OWN OTHER CHECKS REQUIRE TWELVE. ***
    //
    // It was red from before v3904 and nobody saw it, because this gate had never been timed and so nothing in
    // the ritual ran it. Keith asked for the three CHANGELOG-*.md moved into docs/ and they were: 18 -> 15.
    // STILL RED, and counting the remainder is what settles it rather than moving more:
    //
    //   8 launchers named above (six original, two that were missing)     _SETUP.bat, asserted in section 1
    //   README.md, BACKLOG.md, TODO.md, asserted below                    STATUS.md, written by tools/ship/status.mjs
    //   .gitignore, which "only works where it is"                        .gitattributes, for the same reason
    //
    // THAT IS FIFTEEN FILES THIS FILE INSISTS ON, AGAINST A CEILING OF TWELVE. The ceiling could not be met
    // without moving something Keith double-clicks -- the exact failure section 1 warns about -- so it was never
    // a tidy-up target, it was an arithmetic impossibility that read as untidiness.
    //
    // SO THE COUNT BECOMES THE PROPERTY: every file in root is JUSTIFIED BY NAME, and a stray one fails on
    // arrival. That is STRICTLY STRONGER than `<= 12`, which would have accepted a stray file as long as a
    // launcher had been moved out to make room. A count is not a property -- the fifth time this session, after
    // areaHygiene's band, caseStudy's baked total, gateBudget's SLOWEST_GENERAL and moduleHistory's 0.70.
    const RITUAL_WRITTEN = ["README.md", "BACKLOG.md", "TODO.md", "STATUS.md"];
    const GIT_CONFIG = [".gitignore", ".gitattributes"];
    const JUSTIFIED = new Set([...KEITHS, "_SETUP.bat", ...RITUAL_WRITTEN, ...GIT_CONFIG]);
    const strays = loose.filter((f) => !JUSTIFIED.has(f));
    ok("!! every file in the root is there for a NAMED reason -- a stray one fails on arrival", strays.length === 0,
       strays.length ? "UNJUSTIFIED IN ROOT: " + strays.join(", ") + ". Move it, or add it to the list above " +
                       "WITH THE REASON -- the list is what a tidy-up is checked against"
                     : loose.length + " files, every one named: " + KEITHS.length + " launchers, _SETUP.bat, " +
                       RITUAL_WRITTEN.length + " written by the ship ritual or opened first by a stranger, and " +
                       GIT_CONFIG.length + " git files that only work where they are. THE THREE CHANGELOGS WENT " +
                       "TO docs/ THIS ROUND at Keith's word; nothing else here can leave without breaking a " +
                       "check in this same file");
    ok("...and the old ceiling of twelve is recorded as UNMEETABLE rather than quietly dropped",
       JUSTIFIED.size > 12,
       JUSTIFIED.size + " files are required by name against a ceiling that was 12. A number that cannot be " +
       "satisfied by any correct tree is not a strict check, it is a permanently red one -- and a gate that is " +
       "always red teaches everybody to stop reading it, which is how this one went unread for hundreds of " +
       "versions with a REAL finding inside it (two unprotected launchers)");

    // *** v3945 -- THIS CHECK WAS RED IN EVERY CLONE OF THE PUBLIC MIRROR, AND THE CHECK DIRECTLY ABOVE IT
    // SAYS WHY THAT MATTERS: "a number that cannot be satisfied by any correct tree is not a strict check, it
    // is a permanently red one -- and a gate that is always red teaches everybody to stop reading it." Same
    // fault, one line down, as a NAME rather than a number.
    //
    // BACKLOG.md AND TODO.md ARE IN .gitignore ON PURPOSE -- session notes deliberately held back from the
    // public mirror, in those words, at .gitignore's own line 74. So they sit in root on Keith's rig (where
    // this check passed) and cannot exist in any clone (where it could never pass). Asserting bare presence
    // asserted that nobody was running the gate on a checkout -- which is the first place a fresh contributor
    // would run it, and where this gate had in fact been red the whole time.
    //
    // WHAT THE CHECK WAS REACHING FOR IS STILL WORTH HAVING and is now asserted directly: the regression is a
    // tidy-up SWEEPING THEM INTO docs/ the way the three CHANGELOGs went at v3928, or into "Root Utils" the way
    // the scripts went. That fires on the rig and on a clone alike, because a moved file is present either way.
    // Presence in root is then required only of the files git actually carries -- and WHICH THOSE ARE IS READ
    // FROM .gitignore rather than retyped, because a second list of what is withheld would go stale the first
    // time one of them was published.
    const FRONT_DOOR = ["README.md", "BACKLOG.md", "TODO.md"];
    const withheld = new Set();
    try {
        for (const raw of fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").split(/\r?\n/)) {
            const s = raw.trim();
            if (s && !s.startsWith("#") && !s.startsWith("!")) withheld.add(s.replace(/^\//, ""));
        }
    } catch { /* no .gitignore: nothing is withheld, so every name below must be in root */ }

    // Scoped to the two places a tidy-up in THIS repository has actually put things, rather than a whole-tree
    // walk: vendored subprojects legitimately carry their own README.md (HomeAssistant/ha-vbaengine-addon has
    // one), so a walk looking for the basename anywhere would report a move that never happened.
    const SWEPT_TO = ["docs", "Root Utils"];
    const moved = [];
    for (const d of SWEPT_TO)
        for (const f of FRONT_DOOR)
            if (fs.existsSync(path.join(ROOT, d, f))) moved.push(d + "/" + f);

    ok("!! README, BACKLOG and TODO have not been swept into docs/ or Root Utils/",
       moved.length === 0,
       moved.length ? "MOVED OUT OF ROOT: " + moved.join(", ")
                    : "checked " + SWEPT_TO.length + " destinations x " + FRONT_DOOR.length + " names. They are the " +
                      "files a stranger opens first, and the three CHANGELOGs going to docs/ at v3928 is the " +
                      "precedent -- a tidy-up that hid the front door would be tidier and worse.");

    const missing = FRONT_DOOR.filter((f) => !loose.includes(f) && !withheld.has(f));
    ok("...and every one git actually carries is IN root",
       missing.length === 0,
       missing.length ? "MISSING FROM ROOT: " + missing.join(", ")
                      : FRONT_DOOR.filter((f) => withheld.has(f)).join(" + ") + " are withheld from the mirror by " +
                        ".gitignore, so they are absent HERE and present on the rig -- both correct. " +
                        FRONT_DOOR.filter((f) => !withheld.has(f)).join(", ") + " must be in root and is.");

    ok("!! ...and the withheld list can never quietly grow to cover README.md",
       !withheld.has("README.md"),
       "*** THE EXEMPTION ABOVE IS READ FROM .gitignore, SO ANYTHING ADDED THERE STOPS BEING REQUIRED IN ROOT. *** " +
       "That is right for session notes and wrong for the front page: one line in .gitignore would otherwise let " +
       "the README leave the root with this gate still green.");

    // *** v3941 -- THE README IS THE README, AND IT HAD BECOME THE CHANGELOG. ***
    //
    // Measured before the split: README.md was 620,317 bytes, and 607,579 of them -- 99.1% -- were 286
    // "## Since vNNN" sections. The 5,432 bytes a stranger actually opens the file FOR sat underneath 286
    // rounds of history, and the whole thing was past the size GitHub renders as markdown, so the front page
    // of the repository showed no documentation at all.
    //
    // *** NOTHING BUILT IT AND NOTHING WILL REBUILD IT, WHICH IS EXACTLY WHY THIS CHECK EXISTS. *** No tool in
    // tools/ or ai-bridge/ appends to README.md -- the growth was a HABIT, one section per round, and the
    // ship ritual's own step 3 said "update the changelog" without ever naming a file. A habit leaves no
    // artefact to fix; it just comes back. Fifty rounds from now the README is half a megabyte again unless
    // something says no on the round it starts.
    //
    // BOTH HALVES ARE ASSERTED, because the cheap way to satisfy the first is to DELETE the history: the
    // sections must be absent from README.md AND present in docs/CHANGELOG.md. A tidy-up that lost 286 rounds
    // of reasoning would pass a check written only one way round, and this project keeps the negative results.
    {
        const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
        const logPath = path.join(ROOT, "docs", "CHANGELOG.md");
        const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
        const inReadme = (readme.match(/^## Since v/gm) || []).length;
        const inLog = (log.match(/^## Since v/gm) || []).length;
        ok("!! *** the round-by-round history is in docs/CHANGELOG.md, NOT in README.md ***",
           inReadme === 0,
           inReadme
             ? inReadme + " '## Since vNNN' section(s) are back in README.md. They belong in docs/CHANGELOG.md, " +
               "beside the per-version changelogs Keith already had moved out of root. THE SHIP RITUAL'S STEP 3 " +
               "SAYS 'update the changelog' -- IT MEANS docs/CHANGELOG.md."
             : "README.md carries " + Math.round(readme.length / 1024) + " KB of documentation and none of the " +
               "history. It was 606 KB of history and 5 KB of documentation before v3941 split them.");
        ok("!! ...and the history is STILL THERE, because the cheap way to pass the line above is to delete it",
           inLog > 250,
           inLog + " section(s) in docs/CHANGELOG.md. *** A CHECK WRITTEN ONLY ONE WAY ROUND WOULD REWARD " +
           "LOSING 286 ROUNDS OF REASONING, which is the only record of what was TRIED AND REJECTED. *** The " +
           "count is a floor rather than an equality: the log may only grow, and pinning it would make the " +
           "next round's entry a failure.");
    }
}

console.log(fails ? "\nrootLayout-selfcheck: " + fails + " FAILED" : "\nrootLayout-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
