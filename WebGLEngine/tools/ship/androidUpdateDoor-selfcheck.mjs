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

// ---- 3. THE DEBT IS CLOSED, and the number is checked rather than claimed --------------------------------------
{
    const g = fs.readFileSync(path.join(ENG, "tools", "ship", "graveyard-selfcheck.mjs"), "utf8");
    const m = g.match(/const ORPHAN_UTIL_BASELINE = (\d+);/);
    ok("!! the orphaned-utility baseline is ZERO", m && Number(m[1]) === 0,
       m ? "baseline " + m[1] + " -- v2985 raised this to four after ninety-seven versions of nobody running the census" : "not found");
    ok("...and the census still distinguishes records from orphans", /isAnalysisRecord/.test(g),
       "nine analysis records remain and are not debt -- their consumer is correctly the gate that re-derives them");
}

console.log(fails ? "\nandroidUpdateDoor-selfcheck: " + fails + " FAILED" : "\nandroidUpdateDoor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
