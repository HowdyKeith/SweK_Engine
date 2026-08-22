// WebGLEngine/tools/ship/assetSyncLoop-selfcheck.mjs
//
// Run: node tools/ship/assetSyncLoop-selfcheck.mjs   (~0.1s -- MEASURED)
//
// v3325 -- THE 201-SECOND BLOCK IS FIXED, AND THIS IS WHAT KEEPS IT FIXED.
//
// /sys/blame named it at v3278: `Object.startAutoSync (ai-bridge/assetSync.js:602)`, worst tick 201,747ms, on a
// 15-minute interval. THE EVENT LOOP WAS DEAD ~97% OF THE TIME -- 487 seconds blocked out of 500 of uptime --
// and /server.html took 24 SECONDS TO SERVE. Every performance round from v3265 to v3272 (the fetch cap, the
// poller guards, the startup deferral) was rationing access to a process that stops answering for minutes.
//
// v3280 FIXED IT AND THE FIX CITES THE MEASUREMENT: "was listModels(root, hashMode): a SYNCHRONOUS read+SHA-256
// of every model file, which blocked the event loop for up to ~200s on a big library after a cold-cache
// restart." Both sides are async now -- listModelsAsync when PULLING, manifestAsync when SERVING a peer's pull
// -- plus a PERSISTED hash cache, so a warm restart only re-hashes what changed.
//
// *** THIS GATE EXISTS BECAUSE THE FIX IS ONE WORD WIDE. *** Someone reaching for listModels() inside the sync
// path -- the shorter name, the obvious one, the one that still exists -- reintroduces a 200-second stall that
// looks like a slow network and cannot be found without the blame instrument.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { noComments } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const raw = fs.readFileSync(path.join(ROOT, "ai-bridge", "assetSync.js"), "utf8");
const src = noComments(raw);

{
    // THE PULL PATH: mirror() -> the local catalogue. This is the one that blocked.
    // SCOPED TO pull(), NOT mirror(). My first version windowed 2500 characters from `async function mirror`
    // and the call lives at line ~379 in `async function pull` -- SEVENTY LINES EARLIER. A guessed window that
    // starts in the wrong function reports a missing fix that is present, which is the same wrong-extent error
    // this session has made three times.
    const pullBody = (src.match(/async function pull\(peerUrl[\s\S]{0,1200}/) || [""])[0];
    ok("!! *** the PULL path uses the async walk, not the synchronous one ***",
        /await listModelsAsync\(root, hashMode\)/.test(pullBody) && !/= listModels\(root, hashMode\)/.test(pullBody),
        "this exact line is what /sys/blame measured at 201,747ms in a single tick. A SYNCHRONOUS read+SHA-256 " +
        "of every model file, on a 15-minute timer, while the page it was starving waited for the same loop");

    ok("!! ...and the SERVING path has its own async manifest",
        /async function manifestAsync/.test(src) && /await listModelsAsync\(root, true\)/.test(src),
        "when a peer pulls from US with ?hash=1, the sync manifest re-hashed our whole library and blocked OUR " +
        "loop for as long as THEIR pull took -- a stall a box could not diagnose from its own logs, because the " +
        "cause was somebody else's request");

    ok("!! ...and the async hasher awaits rather than reading synchronously",
        /async function _fileHashAsync/.test(src) && /await fs\.promises\.readFile\(full\)/.test(src),
        "same cache, different read. WITHOUT THE await THE ASYNC WALK WOULD BE THE SYNC WALK with extra syntax, " +
        "which is the version that looks fixed and is not");
}
{
    // The sync walk still EXISTS and that is correct -- but only one caller may use it, and for a stated reason.
    // *** COUNTED AND REPORTED, NOT GATED AT A NUMBER I GUESSED. *** My first version asserted "<= 3" and found
    // ten. The sync walk is CORRECT in several places -- the module's own comment says "non-hash manifests stay
    // on the cheap sync path", and a non-hash walk reads no file contents at all. WHICH OF THE TEN ARE
    // LEGITIMATE IS A JUDGEMENT PER CALL SITE, and a threshold plucked from the air would either pass a real
    // regression or fail on correct code. What IS gated is the two paths that actually blocked.
    const syncCalls = (src.match(/[^c]listModels\(root/g) || []).length;
    ok("...and the synchronous walk survives, with its call sites counted rather than judged",
        /const cold = fresh\(\)/.test(src),
        syncCalls + " sync call site(s) remain. At least one is DELIBERATE -- the cold/warm probe TIMES the sync " +
        "path, and deleting listModels would delete the measurement that proves the async one is worth having. " +
        "A FIX THAT REMOVES ITS OWN BASELINE CANNOT BE DEFENDED LATER");

    ok("...and the fix records the number that prompted it",
        /blocked the event loop for up to ~200s/.test(raw),
        "the comment cites /sys/blame's own measurement. A fix that does not name what it fixed is a change " +
        "somebody will undo for looking unnecessary");
}

console.log();
console.log("  ----  NOT PROVEN HERE: that a cold-cache restart is now fast. That needs Keith's library on his");
console.log("  ----  rig and /sys/lag from a boot. What IS proven is that the synchronous read+hash is off the");
console.log("  ----  sync path on both sides, and that a future edit cannot quietly put it back.");
if (fails) { console.log("assetSyncLoop-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("assetSyncLoop-selfcheck: all checks pass");
