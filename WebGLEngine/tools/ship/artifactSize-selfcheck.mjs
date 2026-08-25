// tools/ship/artifactSize-selfcheck.mjs
//
// Run: node tools/ship/artifactSize-selfcheck.mjs           (check against the recorded history)
//      node tools/ship/artifactSize-selfcheck.mjs --record   (append this version's census -- ship ritual)
// RUNTIME 1.4s MEASURED (median of 3 -- 1382/1401/1436 ms). One stat() per shippable file, no zip built.
//
// v4019 -- Keith: "SweK_Engine_v3940.zip is 27.6 megs and SweK_Engine_v4013.zip is 26 megs."
//
// *** A HUMAN READING TWO FILE SIZES IN A DOWNLOADS FOLDER WAS THE ENTIRE DETECTION MECHANISM. *** That is the
// finding, not the 1.6 MB. Measured after he asked: the tracked tree GREW across that window (72.83 -> 76.98 MB,
// 4499 -> 4592 files, and the only two deletions were tiny changelogs) and the packager's skip rules never
// changed -- so nothing was missing from v4013, and v3940's zip had simply been carrying extra rig-local
// content. Nothing was broken. NOTHING WOULD HAVE SAID SO EITHER WAY: this tree gates 1164 things about its
// source and, before this file, zero things about the artifact people actually download. A build that silently
// lost vendor/ would have produced the same shrug and the same wait for somebody to notice.
//
// WHY THIS IS A RATCHET AND NOT A LIMIT. A release SHOULD change size -- that is what shipping work looks like.
// The failure worth catching is not "it moved", it is "it moved and the tree did not move with it". So the
// check compares the census against the LAST RECORDED one and asks for a reason:
//   - files/bytes moved a little (under the band)         -> fine, silent
//   - moved a lot AND the direction is DOWN               -> RED, because a release losing content is the case
//                                                            nobody has ever noticed on purpose
//   - moved a lot and UP                                  -> reported, not failed: growth is normal, and a gate
//                                                            that fires on every big honest round gets ignored
// The asymmetry is deliberate. Growth is the everyday case and its false positives would cost trust; shrinkage
// is rare, and the one time it is real it is a shipped build missing files.
//
// AND IT COUNTS UNCOMPRESSED BYTES. Zip bytes move with the compressor's mood -- a zlib version, another
// machine, text that happens to dedupe better -- and a gate firing on that teaches everybody to ignore it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { artifactCensus, mb } from "./artifactCensus.mjs";
// v4019 -- codeOnly() because section 1's "never builds a zip" check FAILED ON ITS FIRST RUN against
// artifactCensus.mjs's own comment, which EXPLAINS why it does not call makeInstallable(). Searching raw text
// for a call reads the explanation as the call. Third time this species bit in two days (gateWalk-selfcheck,
// patchBase-selfcheck), and the file being searched is one I wrote ten minutes earlier.
import { codeOnly } from "./sourceScan.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HIST = path.join(ROOT, "tools", "ship", "artifact-history.json");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

// The band: how far files/bytes may move between two recorded versions before this wants a reason. 3% of the
// file count is roughly 140 files at today's size -- far above an ordinary round (v4018 added 2) and far below
// losing a directory (vendor/ alone is 500+).
const BAND_PCT = 3;

const engineVersion = () => {
    try { return (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION\s*=\s*"(v\d+)"/) || [])[1] || ""; }
    catch { return ""; }
};

const hist = JSON.parse(fs.readFileSync(HIST, "utf8"));
const census = artifactCensus();
const version = engineVersion();

// ---------------------------------------------------------------------------
if (process.argv.includes("--record")) {
    const byTop = Object.fromEntries(Object.entries(census.byTop).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, mb(v)]));
    const prior = hist.runs.findIndex((r) => r.version === version);
    const rec = { version, captured: new Date().toISOString().slice(0, 10), files: census.files, bytes: census.bytes, mb: mb(census.bytes), byTop };
    if (prior >= 0) hist.runs[prior] = Object.assign({}, hist.runs[prior], rec);   // re-recording a version replaces it
    else hist.runs.push(rec);
    fs.writeFileSync(HIST, JSON.stringify(hist, null, 1) + "\n");
    console.log("[artifactSize] recorded " + version + ": " + census.files + " files, " + mb(census.bytes) + " MB");
    process.exit(0);
}

console.log("artifactSize-selfcheck -- did the shipped tree lose content nobody asked it to?\n");

// ---------------------------------------------------------------------------
console.log("1. *** THE CENSUS IS THE PACKAGER'S OWN ANSWER, NOT A SECOND OPINION ***");
{
    ok("!! the census found a real project", census.files > 1000 && census.bytes > 1e7,
        census.files + " files, " + mb(census.bytes) + " MB -- a small number here would make every " +
        "comparison below pass against nothing");
    // The one property that makes this gate meaningful at all: it must predict what the packager DOES. Proven
    // by a real makeInstallable() run at v4019 -- 4795 both ways, exact -- and kept honest by importing the
    // packager's own SKIP_DIRS/SKIP_FILES/_skipFile rather than restating them.
    const src = codeOnly(fs.readFileSync(path.join(ROOT, "tools", "ship", "artifactCensus.mjs"), "utf8"));
    ok("!! ...and it reads the packager's rules rather than restating them",
        /PB\.SKIP_DIRS/.test(src) && /PB\.SKIP_FILES/.test(src) && /PB\._skipFile/.test(src),
        "counting with the two SETS ALONE was wrong by 5 files on this file's first run -- _skipFile carries " +
        "five pattern rules the sets do not show");
    ok("!! ...and it never builds a zip to answer", !/makeInstallable|_zip\(/.test(src),
        "half a minute and hundreds of MB of I/O is not a thing to do in a gate that runs every ritual");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** AGAINST THE LAST RECORDED BUILD ***");
{
    ok("!! there is a history to compare against", Array.isArray(hist.runs) && hist.runs.length > 0,
        (hist.runs || []).length + " recorded");

    const last = hist.runs[hist.runs.length - 1];
    const sameVersion = last && last.version === version;
    if (sameVersion && hist.runs.length === 1) {
        report("this IS the recorded version (" + version + ") and it is the only record -- nothing to compare yet.");
        report("the comparison starts biting at the next recorded version.");
    } else {
        // compare against the newest record that is NOT this version
        const prev = [...hist.runs].reverse().find((r) => r.version !== version) || last;
        const dFiles = census.files - prev.files;
        const dBytes = census.bytes - prev.bytes;
        const pctFiles = prev.files ? (dFiles / prev.files) * 100 : 0;
        const pctBytes = prev.bytes ? (dBytes / prev.bytes) * 100 : 0;
        report("since " + prev.version + ": " + (dFiles >= 0 ? "+" : "") + dFiles + " files (" +
               pctFiles.toFixed(2) + "%), " + (dBytes >= 0 ? "+" : "") + mb(dBytes) + " MB (" + pctBytes.toFixed(2) + "%)");

        // *** THE ASYMMETRY IS THE POINT. *** Shrinking past the band is the case nobody has ever done on
        // purpose without knowing; growing past it is Tuesday.
        const shrankHard = pctFiles < -BAND_PCT || pctBytes < -BAND_PCT;
        ok("!! *** THE SHIPPED TREE DID NOT SHRINK BY MORE THAN " + BAND_PCT + "% WITHOUT SAYING WHY ***",
            !shrankHard,
            shrankHard
                ? "LOST " + Math.abs(dFiles) + " files / " + Math.abs(mb(dBytes)) + " MB since " + prev.version +
                  ". If that is deliberate (a vendor drop, a directory retired), record it: " +
                  "node tools/ship/artifactSize-selfcheck.mjs --record. If it is NOT, a release is missing content."
                : "no unexplained loss");

        if (pctFiles > BAND_PCT || pctBytes > BAND_PCT) {
            report("GREW past the band (+" + pctFiles.toFixed(1) + "% files) -- REPORTED, NOT FAILED: growth is " +
                   "what shipping looks like, and a gate that fires on it gets ignored.");
        }

        // WHERE it moved, so a regression is readable rather than merely true.
        if (prev.byTop && (shrankHard || Math.abs(pctBytes) > BAND_PCT)) {
            const now = Object.fromEntries(Object.entries(census.byTop).map(([k, v]) => [k, mb(v)]));
            const keys = [...new Set([...Object.keys(prev.byTop), ...Object.keys(now)])];
            const moved = keys.map((k) => [k, (now[k] || 0) - (prev.byTop[k] || 0)])
                              .filter(([, d]) => Math.abs(d) >= 0.5).sort((a, b) => a[1] - b[1]);
            for (const [k, d] of moved) report("   " + (d >= 0 ? "+" : "") + d.toFixed(2) + " MB  " + k);
        }
    }
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE HISTORY ITSELF STAYS HONEST ***");
{
    const bad = hist.runs.filter((r) => !r.version || !Number.isFinite(r.files) || !Number.isFinite(r.bytes));
    ok("!! every record carries a version, a file count and a byte count", bad.length === 0,
        bad.length ? bad.length + " malformed" : hist.runs.length + " records, all complete");
    const vers = hist.runs.map((r) => r.version);
    ok("!! ...and no version is recorded twice", new Set(vers).size === vers.length,
        "a version recorded twice makes 'the last build' ambiguous");
}

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
