// tools/roundhouse/termuxPeerScript-selfcheck.mjs
//
// Run: node tools/roundhouse/termuxPeerScript-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2928 -- THE TWO SAFE ENHANCEMENTS TO termux_peer.sh, AND THE LINE THEY MUST NOT CROSS.
//
// A second assistant reviewing the Android peer page suggested three script changes. Two are genuine robustness
// wins on mobile and are folded in here: an arch-aware Node heap size (mobile V8 OOMs on the ~20-minute suite
// without it) and a wake-lock trap that survives Ctrl-C and TERM, not just clean exit. The third suggestion --
// having the script SET the symlink claim's outcome when it makes the symlink -- was declined, because it would
// make the script configure the experiment to confirm itself.
//
// This gate is text-level: it cannot run bash-on-Android, so it pins the PROPERTIES that make the enhancements
// safe, so a later edit that quietly undoes them fails here rather than on someone's phone at 2am.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.join(here, "termux_peer.sh"), "utf8");

// ---- 1. THE HEAP FLAG IS ARCH-AWARE, NOT A HARDCODED 2048 ------------------------------------------------------------
{
    ok("!! the Node heap size is chosen from pointer width, not hardcoded",
        /case "\$SWEK_BITS"/.test(script) && /SWEK_HEAP=2048/.test(script) && /SWEK_HEAP=1024/.test(script),
        "the reviewer's suggestion was a flat --max-old-space-size=2048. On a 32-bit bionic Node that size can " +
        "fail to allocate, so the script picks 2048 only for 64-bit arches (arm64/x64/...) and 1024 otherwise. A " +
        "robustness flag that itself crashes the smaller phones would be worse than none");

    ok("the flag is exported so the spawned selfchecks inherit it",
        /export NODE_OPTIONS=/.test(script),
        "androidRunner spawns each check as a child `node`, and NODE_OPTIONS is inherited by children -- so " +
        "exporting it once reaches all ~40 checks rather than only the parent");

    ok("a pre-existing NODE_OPTIONS is preserved, not clobbered",
        /NODE_OPTIONS:\+/.test(script) || /\$\{NODE_OPTIONS/.test(script),
        "an operator who set their own NODE_OPTIONS keeps it; the heap flag is prepended, not substituted");
}

// ---- 2. THE WAKE-LOCK TRAP SURVIVES SIGNALS, NOT JUST CLEAN EXIT -----------------------------------------------------
{
    const trapLine = (script.match(/trap '[^']*termux-wake-unlock[^']*'[^\n]*/) || [""])[0];
    ok("!! the wake-lock release trap covers INT and TERM, not only EXIT",
        /trap .*EXIT INT TERM/.test(script),
        "v2920 trapped EXIT only, so a Ctrl-C during the 20-minute suite left the phone pinned awake. The trap " +
        "now fires on interrupt and termination too: '" + trapLine.slice(0, 70) + "...'");

    ok("acquisition failure is non-fatal -- the suite still runs",
        /wake-lock unavailable|may sleep/.test(script) && !/exit 1[^\n]*wake/.test(script),
        "a phone without termux-api still completes the round (it may just sleep); the wake-lock is courtesy, " +
        "not a precondition, and treating it as required would block the very devices the round wants to test");

    ok("the trap only unlocks if it actually locked",
        /SWEK_WAKE" = "1"/.test(script) || /SWEK_WAKE=1/.test(script),
        "guarded so a failed acquisition does not fire termux-wake-unlock and print a misleading 'released'");
}

// ---- 3. THE LINE THAT WAS NOT CROSSED: the script FIXES, the runner MEASURES -----------------------------------------
{
    // The symlink block may create the symlink. It must NOT set the claim's value. If a future edit adds
    // something like SYMLINK_NEEDED=1 or writes autoUpdateSymlinksRequired, the experiment starts confirming
    // itself and this fails.
    const symlinkBlock = script.slice(script.indexOf("autoUpdateSymlinksRequired"), script.indexOf("wake"));
    const asserts = /SYMLINK_NEEDED\s*=\s*1|autoUpdateSymlinksRequired\s*=|--symlink-applied=1|SWEK_SYMLINK_OK=1/.test(symlinkBlock);
    ok("!! the script performs the symlink FIX but never asserts the symlink CLAIM",
        !asserts,
        "declined the reviewer's SYMLINK_NEEDED=1: the runner's ~/Downloads probe measures whether the symlink " +
        "was required, independently of whether this script made one. A script that both applied the fix and " +
        "recorded 'it was required' would be the experiment grading its own intervention -- the exact failure " +
        "the frozen registration exists to prevent");

    ok("...and the boundary is stated in the script for the next editor",
        /performs the FIX; the RUNNER performs the MEASUREMENT|configuring the experiment to confirm itself/.test(script),
        "the comment is load-bearing: it tells whoever adds the next feature why the obvious shortcut is wrong");
}

// ---- 4. NOTHING ELSE MOVED ------------------------------------------------------------------------------------------
{
    ok("the env contract the runner reads is unchanged",
        /SWEK_NPM_INSTALL_OK/.test(script),
        "androidRunner reads SWEK_NPM_INSTALL_OK for the npm claim; the enhancements did not touch how the " +
        "ballot's inputs are passed");
    ok("the ballot still travels through shared Downloads",
        /storage\/downloads\/android-phone\.json/.test(script),
        "the road the auto-update claim certifies is the road the ballot goes home on -- unchanged");
}


// ---- 5. THE RUNNER CLI CONTRACT IS POSITIONAL, AND THE SCRIPT SAYS SO ------------------------------------------------
{
    ok("!! the script documents that androidRunner takes POSITIONAL args, not flags",
        /CLI CONTRACT/.test(script) && /--npm-exit|NaN/.test(script),
        "an external review proposed calling androidRunner.mjs with --out=/--npm-exit=/--symlink-applied= flags. " +
        "The runner parses argv[2] as outFile and argv[3] as budgetSeconds, so those flags would create a file " +
        "literally named '--out=...' and set the budget to NaN, killing every check. Verified by simulation. The " +
        "warning is in the script so the refactor cannot be applied without meeting it");
}

console.log();
if (fails) { console.log("termuxPeerScript-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("termuxPeerScript-selfcheck: all checks pass");
