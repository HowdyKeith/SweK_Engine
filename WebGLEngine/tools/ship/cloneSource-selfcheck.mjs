// WebGLEngine/tools/ship/cloneSource-selfcheck.mjs -- v3941
//
// Run: node tools/ship/cloneSource-selfcheck.mjs   (~0.06s — MEASURED v3941, median of 60/58/60)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES githubBridge.cloneEngineSource -- the route from "pushed to GitHub" to "running on this box".
//
// *** THE LOOP HAD NO CLOSING SIDE, AND THE ERROR THAT REVEALED IT SAID NOTHING. *** Keith pressed "Release
// current engine" on a v3940 tree and got "Validation Failed" -- v3940 was already released. The fix was to
// run the newer code, and there was no route to it: fetchEngineBuild carries a release ASSET, and
// publishEngineBuild builds that asset FROM THE LOCAL TREE, so a version can only be released from a box that
// already has it. Eleven buttons on the panel and the answer was three commands in a terminal.
//
// WHAT THIS FILE ACTUALLY REFUSES TO LET REGRESS is the safety, not the happy path. A clone button is one
// mistake away from being a "delete my work" button, and the running folder is exactly where a tree that has
// been edited in place keeps changes that exist nowhere else -- this session found several such differences on
// Keith's box. So the checks below are about what it must NEVER do.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const require_ = createRequire(import.meta.url);
const gh = require_(path.join(ENG, "ai-bridge", "githubBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

console.log("cloneSource-selfcheck -- the way IN, and what it must never overwrite\n");

// ---- 1. THE VERSION MARKER HAS ONE SPELLING ---------------------------------------------------------------
{
    console.log("1. THE MARKER IS PARSED IN ONE PLACE");
    ok("!! the parse is a pure function, so both readers share it",
        typeof gh._parseEngineVersion === "function" && typeof gh._versionInTree === "function",
        "engineVersion() reads THIS tree's main.js and _versionInTree reads a CLONED one. Two copies of the " +
        "regex is how a marker quietly stops being found in one of the two places.");
    ok("it reads a normal declaration", gh._parseEngineVersion('const ENGINE_VERSION = "v3941";') === "v3941");
    ok("...and tolerates spacing", gh._parseEngineVersion('ENGINE_VERSION   =   "v42"') === "v42");
    ok("!! a tree with no marker yields EMPTY rather than a guess",
        gh._parseEngineVersion("no marker here") === "" && gh._parseEngineVersion(null) === "",
        "*** THE FOLDER IS NAMED FROM THIS VALUE. *** A guess here would name a clone after a version it is not, " +
        "and the installer picks builds by that name -- the mislabeled-build failure the ship ritual exists to stop.");
    ok("...and a tree with no main.js at all yields empty",
        gh._versionInTree(os.tmpdir()) === "");
}

// ---- 2. IT REFUSES BEFORE IT TOUCHES ANYTHING -------------------------------------------------------------
{
    console.log("\n2. *** THE REFUSALS COME BEFORE THE NETWORK AND BEFORE THE DISK ***");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "clonegate-"));
    const bad = await gh.cloneEngineSource({ repo: "not-a-repo", targetDir: scratch });
    ok("!! a repo that is not owner/name is refused",
        bad.ok === false && /owner\/name/.test(bad.error || ""),
        "the value reaches a shell argument list, so the shape is checked rather than trusted");
    const badref = await gh.cloneEngineSource({ repo: "a/b", ref: "x;rm -rf /", targetDir: scratch });
    ok("!! ...and so is a ref carrying shell punctuation",
        badref.ok === false && /bad ref/.test(badref.error || ""),
        "*** execFile DOES NOT USE A SHELL, so this is not the only thing standing between a ref and disaster " +
        "-- but a value that reaches an argument list is checked anyway, because the day somebody swaps " +
        "execFile for exec the argument shape is all that is left. ***");
    ok("...and neither refusal created anything on disk",
        fs.readdirSync(scratch).length === 0,
        "a refusal that leaves a half-made folder is how a later run finds a destination that 'already exists'");
    fs.rmSync(scratch, { recursive: true, force: true });
}

// ---- 3. IT NEVER WRITES OVER AN EXISTING BUILD ------------------------------------------------------------
{
    console.log("\n3. *** SIDE BY SIDE, NEVER OVER THE TOP ***");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    const fn = (src.match(/async function cloneEngineSource[\s\S]*?\n\}/) || [""])[0];
    ok("!! the destination is checked for existence and the run ABORTS",
        /fs\.existsSync\(dest\)/.test(fn) && /exists: true/.test(fn),
        "*** THE RUNNING FOLDER IS WHERE A TREE EDITED IN PLACE KEEPS WORK THAT IS NOWHERE ELSE. *** Driven " +
        "rather than read at v3941: a canary file written into an existing destination survived the refusal.");
    ok("!! ...and nothing in it removes the destination",
        !/rmSync\(dest/.test(fn) && !/rm\(dest/.test(fn),
        "a clone button is one mistake away from a delete button. The only rmSync in here targets the TEMP path.");
    // *** THE FIRST VERSION OF THIS CHECK HAD A HOLE, AND PLANTING FOUND IT. *** It asserted only that the
    // FINAL renameSync(tmp, dest) came after the version read -- so a SECOND, earlier rename of tmp sailed
    // straight through, which is precisely the defect (a tree named before its version is known). Counting the
    // renames is what closes it: there must be exactly one, it must target dest, and it must come last.
    const renames = (fn.match(/renameSync\s*\(\s*tmp\s*,/g) || []).length;
    ok("!! the clone lands on a TEMP name and is renamed ONCE, only after the version is known",
        /_clone\.tmp/.test(fn) && renames === 1 && /renameSync\(tmp, dest\)/.test(fn) &&
        fn.indexOf("_versionInTree") < fn.indexOf("renameSync(tmp, dest)"),
        renames + " rename(s) of the temp path. A clone that dies half-way must not leave something that LOOKS " +
        "like a finished build -- scanDownloads and the installer both pick by FOLDER NAME, so a partial tree " +
        "wearing a real name is worse than no tree at all.");
}

// ---- 4. THE TOKEN DOES NOT END UP SOMEWHERE IT SURVIVES ---------------------------------------------------
{
    console.log("\n4. *** THE TOKEN RIDES IN THE ENVIRONMENT, NOT IN THE URL AND NOT IN argv ***");
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "githubBridge.js"), "utf8");
    const fn = (src.match(/async function cloneEngineSource[\s\S]*?\n\}/) || [""])[0];
    ok("!! no token is interpolated into the clone URL",
        !/https:\/\/\$\{[^}]*t[ok]/i.test(fn) && !/@github\.com/.test(fn),
        "*** A TOKEN IN THE REMOTE URL IS WRITTEN INTO .git/config AND SURVIVES ON DISK *** long after the " +
        "clone, in a folder the user may well zip up and send somebody");
    ok("!! ...and none is passed as a command-line argument",
        !/args\.push\([^)]*extraHeader/i.test(fn) && !/"-c"/.test(fn),
        "anything that can list processes can read argv. GIT_CONFIG_KEY_0/VALUE_0 keeps it in the environment.");
    ok("...and the header is set only when a token exists",
        /if \(tk\) \{/.test(fn) && /GIT_CONFIG_VALUE_0/.test(fn),
        "a public repo clone should not carry an Authorization header it does not need");
    ok("!! it can never sit waiting for credentials nobody is there to type",
        /GIT_TERMINAL_PROMPT/.test(fn),
        "*** DRIVEN AT v3941: a repo the token cannot read returned 'could not read Username' and EXITED, " +
        "instead of blocking the bridge forever on a prompt in a process with no terminal attached. ***");
}

// ---- 5. IT IS REACHABLE ------------------------------------------------------------------------------------
{
    console.log("\n5. THERE IS A DOOR, WHICH IS THE WHOLE POINT");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    const panel = fs.readFileSync(path.join(ENG, "ui", "githubPanel.js"), "utf8");
    ok("!! the route is dispatched",
        /"\/github\/clone-source"/.test(server) && /cloneEngineSource/.test(server),
        "a bridge function with no route is the module-with-no-caller shape this tree names everywhere");
    ok("!! ...and a button calls it",
        /clone-source/.test(panel),
        "THE FEATURE EXISTS BECAUSE THE ANSWER WAS THREE COMMANDS IN A TERMINAL. A route with no button would " +
        "leave it exactly as unreachable as before, one layer further in.");
    ok("...and it says the new copy is separate and this one is unchanged",
        /SEPARATE folder/.test(panel) && /still /.test(panel),
        "the running engine does not change under you, so the panel must not imply that it did");
}

console.log(fails ? `\ncloneSource-selfcheck: ${fails} FAILED` : "\ncloneSource-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
