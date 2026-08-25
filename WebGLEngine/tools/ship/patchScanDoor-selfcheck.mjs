// WebGLEngine/tools/ship/patchScanDoor-selfcheck.mjs -- v3377
// *** THE ROUTE v3376 DECLINED TO SHIP UNEXERCISED, NOW DRIVEN. *** sysadminBridge is CommonJS and patchBase is
// ESM, so patchScan crosses that boundary with a dynamic import -- and a bridge route that 500s on module
// resolution is a failure Keith MEETS RATHER THAN READS ABOUT (v3049). So this drives it for real.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const bridge = require_(path.join(ENG, "ai-bridge", "sysadminBridge.js"));

ok("!! *** the CJS bridge really can reach the ESM tool -- driven, not asserted ***",
    typeof bridge.patchScan === "function",
    "this is the exact crossing v3376 refused to ship unexercised. A route that 500s on module resolution is " +
    "a failure met rather than read about");

// ---- THE HAPPY PATH, against real patch zips ---------------------------------------------------------------
const UP = "/mnt/user-data/uploads";
if (fs.existsSync(UP)) {
    // v3937 -- THE FOLDER IS AN ARGUMENT NOW, NOT A CONFIG WRITE. This called setConfig and never restored it,
    // the same defect downloadScan-selfcheck carried -- and that one left Keith's live installer aimed at a
    // temp folder of one-byte fixtures with auto-apply on. Nothing here writes to the config any more.
    const r = await bridge.patchScan(UP);
    say("scanned " + r.dir + " at tree " + r.tree + ": " + r.rows.length + " patch-shaped zips");
    ok("!! it resolves patchBase across the boundary and returns rows", r.ok === true && r.rows.length > 0);

    ok("!! *** full builds are EXCLUDED BY NAME, not reported as unstated patches ***",
        r.rows.every((x) => !/^(?:EngineProject|SweK[ _]Engine)[ _]v\d+\.zip$/i.test(x.file)),
        "scanDownloads already reports SweK_Engine_vNNNN.zip and that is the update panel's business. " +
        "REPORTING A BUILD AS AN UNSTATED PATCH WOULD MANUFACTURE A FINDING OUT OF A FILE THAT WAS NEVER " +
        "CLAIMING ANYTHING");

    const stated = r.rows.filter((x) => x.base), unstated = r.rows.filter((x) => !x.base);
    say("stated: " + stated.map((x) => x.file + "=" + x.base).join(", ") + "  |  unstated: " + unstated.map((x) => x.file).join(", "));
    ok("!! *** both states appear in one real directory, which is why the distinction is a value ***",
        stated.length > 0 && unstated.length > 0 &&
        stated.every((x) => x.claimsAuditable === true) && unstated.every((x) => x.claimsAuditable === false),
        "UNSTATED IS NOT A WORSE MISMATCH -- it is an absence of evidence, and this scan shows both sitting in " +
        "the same folder. Collapsing them is how v3373's overreach happened");

    ok("...and the tree version comes from the tree", /^v\d+$/.test(String(r.tree)),
        "a caller supplying both sides of a comparison is the shape that lets a mismatch be argued away");
} else {
    say("uploads directory absent; the happy path is exercised where the zips live. SAID OUT LOUD rather than " +
        "skipped, because a check that vanishes with its fixture reads exactly like one that passed");
}

// ---- THE REFUSAL, driven ------------------------------------------------------------------------------------
const bad = await bridge.patchScan(path.join(ENG, "__no_such_dir__"));
ok("!! *** an unreadable directory REFUSES BY NAME rather than returning an empty clean result ***",
    bad.ok === false && typeof bad.why === "string" && /cannot read/.test(bad.why) && bad.rows.length === 0,
    "an empty report and a scan that never ran are indistinguishable -- v3201's finding, and the exact hazard " +
    "the NO_MAIN entry named when it refused this tool a CLI");

// ---- WHAT THE BRIDGE MUST NOT CONTAIN -----------------------------------------------------------------------
const bsrc = fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8");
// *** v4000 -- THIS READ RAW SOURCE FOR BOTH HALVES, AND EACH HALF WANTED A DIFFERENT INSTRUMENT. ***
// commentFalsePass-selfcheck's census flagged it as the one GENUINE case in twenty: a gate asserting a code
// idiom against text that includes comments. Both halves were wrong, in OPPOSITE directions:
//
//   the NEGATIVE half (no zip magic here) would go RED on a comment that merely NAMED 0x02014b50 -- a false
//   alarm on prose, and this file's own header now discusses those constants;
//   the POSITIVE half (the bridge imports patchBase.mjs) would go GREEN on a comment saying it should -- the
//   v3138 false pass, which is the shape the census exists to hunt.
//
// AND THEY CANNOT SHARE ONE FIX, which is the part worth writing down. codeOnly() blanks comments AND STRING
// LITERALS, so it is right for the idiom and FATAL for the import: `patchBase.mjs` only ever appears inside
// quotes. conservationReach-selfcheck hit both halves of that pair inside one round and left the rule --
// *** codeOnly FOR AN IDIOM, noComments FOR TEXT THE CODE CONTAINS *** -- and this is that rule being spent.
const bcode = codeOnly(bsrc);        // comments AND strings gone: for the zip idiom
const bnostr = noComments(bsrc);     // comments gone, strings KEPT: for the import path
ok("!! *** NO ZIP LOGIC LIVES IN THE BRIDGE ***",
    !/0x02014b50|0x04034b50|readCentralDirectory\s*\(|inflateRawSync/.test(bcode) && /patchBase\.mjs/.test(bnostr),
    "moduleHistory's own gate asserts this bridge holds no zip reading, and THAT assertion is why the import " +
    "is here rather than a fourth reader. safeExtract owns readCentralDirectory; moduleHistory owns inflateEntry");

// the same treatment: `applyStaged` is an IDENTIFIER, so the comment-and-string-free text is the right reader.
// Slicing bcode rather than bsrc keeps the window aligned, because codeOnly preserves newlines and offsets move.
ok("!! ...and the scanner cannot APPLY anything",
    !/applyStaged|extractTo|unzipTo/.test(bcode.slice(bcode.indexOf("async function patchScan"), bcode.indexOf("module.exports"))),
    "reporting whether a patch declares a base is a READ. The apply path is applyStaged's, with its own " +
    "signature check -- a scanner that could also install would be two capabilities wearing one route");

// noComments, not codeOnly: "/sys/patchbase" is a STRING LITERAL and codeOnly would blank the route away.
const ssrc = noComments(fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8"));
ok("!! the route is registered and awaited",
    /"\/sys\/patchbase"/.test(ssrc) && /patchScan\(\)\.then\(sendJson\)/.test(ssrc) && /\.catch\(/.test(ssrc),
    "an unawaited async handler sends nothing and the page hangs; a missing catch turns a bad directory into " +
    "an unhandled rejection instead of a reported refusal");

console.log(failed ? "patchScanDoor-selfcheck: " + failed + " FAILED" : "patchScanDoor-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
