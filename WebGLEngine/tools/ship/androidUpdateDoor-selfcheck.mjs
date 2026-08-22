// WebGLEngine/tools/ship/androidUpdateDoor-selfcheck.mjs -- v2993
//
// Run: node tools/ship/androidUpdateDoor-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// THE LAST ORPHANED UTILITY, AND THE ONLY ONE WHOSE FIX WAS A ROUTE RATHER THAN A USE.
//
// tools/roundhouse/androidUpdate.mjs was written at v2969 to let a phone learn it is behind. It was reachable
// ONLY as `node tools/roundhouse/androidUpdate.mjs [hub-url]`. Under this project's own standing law -- EVERY
// TOOL NEEDS A FRONT DOOR, a CLI-only deliverable is unfinished -- that is not a legitimate gate-only module.
// It is unfinished work that had been sitting for twenty-four rounds.
//
// WITH THIS, THE ORPHANED-UTILITY COUNT REACHES ZERO. The debt raised at v2985 -- when the census reported
// TWELVE gate-only modules after ninety-seven versions of nobody running it -- is cleared: nine turned out to be
// ANALYSIS RECORDS whose consumer is correctly the gate, and the four genuine orphans are all wired.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readAndroidPolicy, localVersion, ANDROID_DEFAULT_POLICY } from "../roundhouse/androidUpdate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the door exists and is served -------------------------------------------------------------------------
{
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "androidPeerBridge.js"), "utf8");
    ok("!! /android/update is a route, not just a CLI", /"\/android\/update"/.test(bridge),
       "a CLI-only deliverable is unfinished under this project's own standing law");
    ok("...and it imports the module rather than reimplementing it", /androidUpdate\.mjs/.test(bridge),
       "two policy engines with drifting defaults is the duplicate this project already found in its tunnel registries");
    ok("...and fails with a reason rather than silently", /ok: false, error:/.test(bridge));
}

// ---- 2. what it reports is real -------------------------------------------------------------------------------
{
    const p = readAndroidPolicy();
    ok("a policy is readable", p && typeof p === "object" && !!p.tier, "tier=" + p.tier);
    ok("!! the DEFAULT is notify, not auto-install", ANDROID_DEFAULT_POLICY.tier === "notify" && ANDROID_DEFAULT_POLICY.autoDownload === false,
       "a phone is not a rig -- telling it a build exists is a different act from putting one on it");
    const v = localVersion();
    ok("the local version is read from the tree", /^v\d+$/.test(String(v)), String(v));
    ok("...and matches main.js", (() => {
        const m = fs.readFileSync(path.join(ENG, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/);
        return m && m[1] === String(v);
    })(), "a version read from somewhere else would drift the moment one of them moved");
}

// ---- 3. THIS MODULE IS NOT AN ORPHAN, which is the fact this gate is about ------------------------------------
//
// *** v3900 -- THIS ASSERTED A GLOBAL COUNT TO PROVE A LOCAL FACT, AND THE COUNT WAS REDEFINED UNDER IT. ***
//
// The old check read `ORPHAN_UTIL_BASELINE === 0` and this file's own header explains why: at v2993, wiring
// androidUpdate.mjs took the orphaned-utility census to zero, and the gate pinned that as a victory lap. IT WAS
// TRUE THAT DAY. Then v3223 CHANGED WHAT THE NUMBER COUNTS -- every gate-only module rather than every
// unexplained one -- and it went 0 -> 14 -> 104 -> 100 -> 88 -> 86, each move by hand with a written reason,
// each one leaving this assertion further behind. IT HAS BEEN RED FOR ROUGHLY SEVEN HUNDRED VERSIONS and the
// tree kept lowering the number it was complaining about.
//
// *** SO TWO GATES DEMANDED OPPOSITE THINGS: *** graveyard-selfcheck ratchets the count and passes at 86 of 86
// with every raise carrying its reason; this one required that same literal to be nought. graveyard-selfcheck's
// own v3223 note already names this exact shape -- "TWO CHECKS DEMANDING OPPOSITE THINGS ... neither of these
// cares about the VALUE 8" -- and the resolution there is the resolution here: ASK FOR THE PROPERTY, NOT THE
// NUMBER. A gate about the Android update door has no business adjudicating the size of a tree-wide debt pile,
// and it never wanted to; it wanted to know that ITS OWN MODULE got a front door and kept it.
//
// MEASURED, which is why this is a rewrite and not a deletion: androidUpdate.mjs is imported at runtime by
// ai-bridge/androidPeerBridge.js and driven as a command by tools/roundhouse/taskerStages.mjs. It has real
// callers, so it is not in the 86, and the thing the old check was reaching for is TRUE -- it was just reaching
// for it through a number that had stopped meaning it.
{
    const g = fs.readFileSync(path.join(ENG, "tools", "ship", "graveyard-selfcheck.mjs"), "utf8");
    // The census's classifier counts a module as an orphaned utility when it EXPORTS and nothing imports it.
    // So the property is asserted where it lives: a non-gate consumer, in the tree, by name.
    const consumers = [
        ["ai-bridge/androidPeerBridge.js", /androidUpdate\.mjs/],
        ["tools/roundhouse/taskerStages.mjs", /androidUpdate\.mjs/],
    ].filter(([f, re]) => {
        try { return re.test(fs.readFileSync(path.join(ENG, f), "utf8")); } catch { return false; }
    });
    ok("!! androidUpdate.mjs HAS A NON-GATE CONSUMER, so it is not an orphaned utility",
       consumers.length >= 1,
       consumers.map(([f]) => f).join(", ") + " -- the census counts a module as orphaned when it exports and " +
       "NOTHING imports it, so this is the property the old ORPHAN_UTIL_BASELINE === 0 check was reaching for. " +
       "*** IT REACHED FOR IT THROUGH A TREE-WIDE COUNT THAT v3223 REDEFINED, and had been red ever since. ***");
    ok("...and the tree-wide census is still RATCHETED rather than unbounded, which is graveyard's job not this one's",
       /const ORPHAN_UTIL_BASELINE = \d+;/.test(g) && /RAISED FROM \d+ TO \d+|LOWERED/.test(g),
       "the literal is still in the source with its history beside it. THIS GATE NO LONGER ASSERTS ITS VALUE: " +
       "a number two gates disagree about is a number one of them should not be reading");
    ok("...and the census still distinguishes records from orphans", /isAnalysisRecord/.test(g),
       "analysis records are not debt -- their consumer is correctly the gate that re-derives them");
}

console.log(fails ? "\nandroidUpdateDoor-selfcheck: " + fails + " FAILED" : "\nandroidUpdateDoor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
