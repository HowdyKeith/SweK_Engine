// tools/roundhouse/installDocs-selfcheck.mjs
//
// v2952 -- THE INSTRUCTIONS A PERSON ACTUALLY READS.
//
// v2943/v2944 fixed the Termux install walkthrough -- in PEER_ROUND.md, a markdown file. The page a person
// actually opens is android-peer.html, and it still carried the original one-line command for nine versions:
//
//     cd ~ && unzip ~/storage/downloads/SweK_Engine_v*.zip && cd SweK_Engine_v*/WebGLEngine
//
// which failed on a real phone with "cannot find or open .../SweK_Engine_v*.zip" -- the literal asterisk reaching
// unzip, i.e. the glob matching nothing. Fixing a doc while leaving the live page stale is the documentation
// version of the duplicated-table bug this lab keeps finding in code: two copies, one updated.
//
// So this gate holds the PAGE to the same standard as the doc, and pins the two dangerous shortcuts out.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const page = fs.readFileSync(path.join(root, "android-peer.html"), "utf8");
const doc = fs.readFileSync(path.join(root, "tools", "roundhouse", "PEER_ROUND.md"), "utf8");

// ---- 1. THE PAGE NO LONGER CARRIES THE COMMAND THAT FAILED ON HARDWARE ------------------------------------------------
{
    const bare = /cd ~ &amp;&amp; unzip ~\/storage\/downloads\/SweK_Engine_v\*\.zip/.test(page) ||
                 /cd ~ && unzip ~\/storage\/downloads\/SweK_Engine_v\*\.zip/.test(page);
    ok("!! the bare glob install command is GONE from android-peer.html",
        !bare,
        "this exact line produced 'unzip: cannot find or open .../SweK_Engine_v*.zip' on a real phone. The glob " +
        "matched nothing and the literal asterisk reached unzip. It survived nine versions in the live page while " +
        "the markdown doc was being fixed");
}

// ---- 2. THE PAGE AND THE DOC BOTH CARRY THE WORKING BLOCK --------------------------------------------------------------
{
    for (const [name, text] of [["android-peer.html", page], ["PEER_ROUND.md", doc]]) {
        ok(`${name} carries the version-picking, permission-waiting install block`,
            /sort -rn \| head -1/.test(text) && /while \[ ! -d "\$HOME\/storage\/downloads" \]/.test(text),
            "picks the highest version number (surviving Chrome's '(1)' duplicates) and WAITS for the storage " +
            "permission dialog rather than racing it");
    }
}

// ---- 3. THE FOUR FAILURE MODES ARE DOCUMENTED WHERE THE FAILURE HAPPENS -------------------------------------------------
{
    ok("!! the page explains the exact error a person will see, not just the happy path",
        /cannot find or open/.test(page) && /extract the member named/.test(page) && /never granted/.test(page),
        "the multi-zip glob trap, Chrome's '(1)' rename, ungranted storage, and missing unzip -- each with its " +
        "fix, in a details block on the page itself. A troubleshooting section that lives only in a markdown " +
        "file is a troubleshooting section nobody in trouble will find");
}

// ---- 4. THE TWO DANGEROUS SHORTCUTS ARE NAMED AND REFUSED ---------------------------------------------------------------
{
    ok("!! the page warns that chaining termux-setup-storage RACES the permission dialog",
        /races the permission dialog/i.test(page) || /returns immediately/.test(page),
        "termux-setup-storage returns before the Android prompt is answered, so an && chain runs the next command " +
        "against a directory that does not exist yet. This is the single most likely reason a one-paste install " +
        "'works' for the author and fails for everyone else");

    ok("!! and that creating the symlink by hand CONTAMINATES claim 4",
        /contaminates claim 4/i.test(page) && /measure/.test(page),
        "autoUpdateSymlinksRequired is a prediction the phone MEASURES. The probe records what it found; " +
        "termux_peer.sh performs the fix separately. A person creating the symlink first turns the experiment " +
        "into a confirmation of their own action -- the same self-confirming shortcut declined in v2928 and v2950");

    ok("the page does not auto-launch the 15-25 minute suite from the install paste",
        /does <strong>not<\/strong> launch the suite/.test(page),
        "an installer that silently starts a 25-minute job is a surprise, not a convenience");
}

console.log();
if (fails) { console.log("installDocs-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("installDocs-selfcheck: all checks pass");
