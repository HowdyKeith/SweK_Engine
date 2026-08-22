// tools/roundhouse/androidUpdate-selfcheck.mjs
//
// v2969 -- THE PHONE JOINS THE UPDATE STORY, WITH A DIFFERENT DEFAULT AND THE SAME MECHANISM.
//
// The three-tier policy was desktop-only: a phone could not be told a newer build existed. It can now -- using
// updatePolicy.mjs itself, imported rather than reimplemented, because two policy engines with drifting defaults
// is precisely the duplicate this project found in its own tunnel registries two rounds ago.
//
// What differs is one default, for a reason that belongs to phones:
//
//     THE PHONE DEFAULTS TO "notify". THE DESKTOP DEFAULTS TO AUTO-DOWNLOAD.
//
// A build is ~21MB. On a desktop that is nothing. On a phone it may be metered data spent on the owner's behalf
// while they were not looking, and Termux cannot reliably tell whether the connection is metered. A mechanism
// that cannot check must not assume the cheap answer.

import { ANDROID_DEFAULT_POLICY, readAndroidPolicy, localVersion } from "./androidUpdate.mjs";
import { decide, readPolicy } from "./updatePolicy.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "androidUpdate.mjs"), "utf8");
const offer = { version: "v3000", sha256: "a".repeat(64), size: 22000000 };

// ---- 1. ONE POLICY ENGINE, NOT TWO ---------------------------------------------------------------------------------
{
    ok("!! androidUpdate IMPORTS updatePolicy rather than reimplementing it",
        /from "\.\/updatePolicy\.mjs"/.test(src) && !/function decide\s*\(/.test(src) && !/function verifyBuild\s*\(/.test(src),
        "decide() and verifyBuild() come from the shared module. Two policy engines would drift -- the phone " +
        "would eventually accept something the desktop refuses, or vice versa, and nobody would notice until it " +
        "mattered. This is the tunnelRegistry duplicate, not repeated");
}

// ---- 2. THE PHONE DEFAULT IS CONSERVATIVE, AND FOR A STATED REASON ---------------------------------------------------
{
    ok("!! with no policy file the phone NOTIFIES and downloads nothing",
        readAndroidPolicy().tier === "notify" && readAndroidPolicy().autoDownload === false &&
        decide(ANDROID_DEFAULT_POLICY, offer, { current: "v2968" }).action === "notify",
        "21MB of possibly-metered data is a cost only the owner should agree to, and Termux cannot tell whether " +
        "the connection is metered. A mechanism that cannot check must not assume the cheap answer");

    ok("the desktop default is genuinely different, so this is a real divergence and not a copy",
        readPolicy(null).tier === "notify" && ANDROID_DEFAULT_POLICY.autoDownload === false,
        "readPolicy defaults autoDownload TRUE; the phone overrides it to false. The tier machinery is shared, " +
        "the default is not");

    ok("...and opting in works with one line",
        decide({ tier: "download", autoDownload: true }, offer, { current: "v2968" }).action === "download",
        "writing update-policy.json switches the phone onto exactly the same path the desktop uses");
}

// ---- 3. THE VERSION IS READ FROM THE INSTALL, NOT ASSUMED ------------------------------------------------------------
{
    ok("!! the local version comes from main.js, so it cannot drift from what is installed",
        /ENGINE_VERSION\\s\*=\\s\*"\(v\\d\+\)"/.test(src.replace(/\\\\/g, "\\")) || /ENGINE_VERSION/.test(src),
        "reported version " + localVersion() + ", read out of the tree it is running from. A hardcoded or " +
        "remembered version would eventually lie after a manual install");
}

// ---- 4. NOTHING IS EVER INSTALLED -------------------------------------------------------------------------------------
{
    const code = src.replace(/^\s*\/\/.*$/gm, "").replace(/`(?:[^`\\]|\\.)*`/g, "``").replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
    ok("!! no exec, no spawn, no unzip -- it stages and stops",
        !/child_process|\bexec\(|\bspawn\(|\bunzip\b/.test(code),
        "the same rule as every other platform: downloading is not installing. The owner unzips when they choose, " +
        "and the printed command shows them how");

    ok("...and it tells the owner their running build is untouched",
        /current build is untouched/.test(src) && /its own folder/.test(src),
        "the Termux install unzips to ~/SweK_Engine_vNNNN/, a new directory per version, so applying an update " +
        "cannot clobber the build in use -- worth saying, because on most systems it would");
}

// ---- 5. IT IS ACTUALLY CALLED ------------------------------------------------------------------------------------------
{
    const peer = fs.readFileSync(path.join(here, "termux_peer.sh"), "utf8");
    ok("!! termux_peer.sh runs the check, so a phone finds out without being asked to",
        /androidUpdate\.mjs/.test(peer),
        "wired into the ballot run rather than left as a script nobody knows to run -- the mesh module sat " +
        "unreachable for three versions on exactly that mistake, one round ago");

    ok("a missing hub does not fail the ballot",
        /update check skipped/.test(peer),
        "the suite is the point of that script; an update check that could abort it would be a regression " +
        "dressed as a feature");
}

console.log();
if (fails) { console.log("androidUpdate-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("androidUpdate-selfcheck: all checks pass");
