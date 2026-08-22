// WebGLEngine/tools/ship/downloadScan-selfcheck.mjs -- v3054
//
// Run: node tools/ship/downloadScan-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// A DOWNLOAD IN FLIGHT IS NOT AN ABSENT DOWNLOAD.
//
// Chrome writes <name>.zip.crdownload and renames to .zip only once the transfer is fully resolved -- including
// a "keep this file" safety hold, which macOS Chrome applies far more often than Windows. scanDownloads()
// required \.zip$, so a newer build arriving RIGHT NOW was invisible, and the panel said:
//
//     "Downloads has v3052 (not newer)"
//
// Every word true. The whole sentence misleading. It answered "what is the newest FINISHED file" while the
// reader was asking "is the new version here yet" -- with the newer one mid-flight in that same folder. Keith
// reasonably concluded the Mac was scanning the wrong directory. It was scanning the right one.
//
// THE FIX HAS TWO HALVES AND BOTH ARE LOAD-BEARING:
//   1. an arriving version is REPORTED, so the sentence is about the folder rather than about a subset of it
//   2. it is NEVER returned as installable -- scanDownloads() still yields only complete zips, because handing a
//      partial file to an unzip is a corrupted install, which is far worse than a confusing message
//
// The gate keeps those two apart, since collapsing them is the only way this fix could do harm.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codeOnly, noComments } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const src = fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8");
const code = codeOnly(src);
const text = noComments(src);

// --- 1. the two scanners exist and stay separate ---------------------------------------------------------
{
    ok("scanDownloads still exists and still requires a COMPLETE zip",
        /function scanDownloads\(\)/.test(code) && /_versionRe\(false, "\\\\.zip\$"\)/.test(text));
    ok("a SECOND scanner reports in-flight files", /function scanDownloadsPartial\(\)/.test(code));
    ok("!! the partial scanner is never used as the install source", (() => {
        // find every assignment that feeds the apply path
        const bad = /found\s*=\s*scanDownloadsPartial\(/.test(code) || /best\s*=\s*scanDownloadsPartial\(/.test(code);
        return !bad;
    })(), "handing a .crdownload to an unzip is a corrupted install -- worse than a confusing message");
    ok("the partial suffixes cover the browsers this fleet uses",
        ["crdownload", "part", "download", "opdownload"].every((x) => text.includes(x)),
        "Chrome/Edge .crdownload, Firefox .part, Safari .download, Opera .opdownload");
}

// --- 2. the REGEX behaves: this is the actual matching logic, exercised on real filenames -----------------
// Rebuilt here from the same pieces rather than imported, because sysadminBridge is a CJS module with side
// effects on require. The shapes are pinned against the shipping source above.
{
    const names = ["EngineProject", "SweK[ _]Engine"];
    const complete = new RegExp("(?:" + names.join("|") + ")[ _]v(\\d+)\\.zip$", "i");
    const PARTIAL = ["\\.crdownload", "\\.part", "\\.download", "\\.opdownload"];
    const partial = new RegExp("(?:" + names.join("|") + ")[ _]v(\\d+)\\.zip(?:" + PARTIAL.join("|") + ")$", "i");

    ok("a finished zip matches COMPLETE and not PARTIAL",
        complete.test("SweK_Engine_v3053.zip") && !partial.test("SweK_Engine_v3053.zip"));
    ok("!! an in-flight Chrome download matches PARTIAL and not COMPLETE",
        partial.test("SweK_Engine_v3053.zip.crdownload") && !complete.test("SweK_Engine_v3053.zip.crdownload"),
        "this exact filename is what the old scan could not see");
    ok("Firefox .part, Safari .download and Opera .opdownload all match PARTIAL",
        partial.test("SweK_Engine_v3053.zip.part") && partial.test("SweK_Engine_v3053.zip.download") && partial.test("SweK_Engine_v3053.zip.opdownload"));
    ok("the version number is read correctly out of a partial", partial.exec("SweK Engine v3060.zip.crdownload")[1] === "3060");
    ok("an unrelated file is matched by neither", !complete.test("holiday-photos.zip") && !partial.test("holiday-photos.zip.crdownload"));
    ok("a partial is not mistaken for a complete zip by a loose suffix check",
        !complete.test("SweK_Engine_v3053.zip.crdownload"),
        "if \\.zip$ were unanchored this would pass and the installer would get a half file");
}

// --- 3. THE SCENARIO, end to end, on a real temp directory ------------------------------------------------
// The exact folder state Keith had: an older complete zip plus a newer one still arriving.
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-dl-"));
    try {
        fs.writeFileSync(path.join(dir, "SweK_Engine_v3052.zip"), "x");
        fs.writeFileSync(path.join(dir, "SweK_Engine_v3053.zip.crdownload"), "x");

        const names = ["EngineProject", "SweK[ _]Engine"];
        const reC = new RegExp("(?:" + names.join("|") + ")[ _]v(\\d+)\\.zip$", "i");
        const reP = new RegExp("(?:" + names.join("|") + ")[ _]v(\\d+)\\.zip(?:\\.crdownload|\\.part|\\.download|\\.opdownload)$", "i");
        const scan = (re) => { let b = null; for (const f of fs.readdirSync(dir)) { const m = f.match(re); if (m) { const v = +m[1]; if (!b || v > b.v) b = { v, file: f }; } } return b; };

        const found = scan(reC), part = scan(reP);
        const cur = 3052;
        const arriving = (part && part.v > cur && (!found || part.v > found.v)) ? part.v : null;

        ok("SCENARIO: the installable answer is still the complete v3052", found && found.v === 3052);
        ok("SCENARIO: and v3053 is reported as ARRIVING", arriving === 3053);
        ok("!! SCENARIO: the old code would have said 'not newer' here", found.v <= cur && arriving !== null,
            "true, and the reason it read as a broken folder scan");

        // once it lands, arriving clears and the install offer appears
        fs.renameSync(path.join(dir, "SweK_Engine_v3053.zip.crdownload"), path.join(dir, "SweK_Engine_v3053.zip"));
        const found2 = scan(reC), part2 = scan(reP);
        const arriving2 = (part2 && part2.v > cur && (!found2 || part2.v > found2.v)) ? part2.v : null;
        ok("SCENARIO: after the rename the install offer appears and ARRIVING clears",
            found2.v === 3053 && arriving2 === null);

        // a partial OLDER than what we run is not news
        fs.writeFileSync(path.join(dir, "SweK_Engine_v3000.zip.crdownload"), "x");
        const p3 = scan(reP);
        ok("an in-flight OLDER version is not announced", ((p3 && p3.v > 3053) ? p3.v : null) === null);
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
}

// --- 4. it reaches the person, and names the folder it read ------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("updateCheck returns `arriving`", /arriving/.test(code) && /const base = \{[^}]*arriving/.test(code.replace(/\n/g, " ")));
    ok("updateStatus returns it too, so the steady-state line can say it", /updateStatus\(\)[\s\S]{0,900}arriving/.test(code));
    // ORDER IS COMPARED IN CODE, NOT PROSE. The comment above the fix QUOTES the misleading sentence, so a raw
    // indexOf finds the explanation before the implementation and reports the fix as unfixed. Fifth time this
    // session that a scan hit the sentence describing the rule -- noComments() keeps strings, drops commentary.
    const pageCode = noComments(page);
    ok("!! the panel LEADS with the arriving version rather than the stale-but-true one",
        /downloads\.arriving[\s\S]{0,220}still downloading/.test(pageCode) &&
        pageCode.indexOf("downloads.arriving") < pageCode.indexOf("Downloads has v"),
        "an arriving build must be said BEFORE 'not newer', which is the sentence that misled");
    ok("the details view prints the folder it actually scanned", /scanned: " \+ downloads\.downloadsDir/.test(page),
        "the report that made this look like a wrong-directory bug now shows the directory");
}

// --- v3070: `found` IS THE CURRENT SCAN, NOT A REMEMBERED ONE --------------------------------------------------
// Spotted at v3054 while fixing the .crdownload bug and left open for sixteen versions: updateStatus() did
//     const f = scanDownloads(); if (f) lastFound = f.v; ... const found = (lastFound || 0) || null;
// so when the zip was deleted, moved or renamed, the panel kept naming the last version it had ever seen. A
// REMEMBERED RESULT PRESENTED AS A CURRENT MEASUREMENT -- the same class as the count that was really a cap
// (v3043), and the shape lib/derivedCache.js (v3065) exists to make impossible.
//
// It is worse here than a wrong number: the panel offers an INSTALL for what it reports, so this offers to
// install a file that is no longer on disk -- a failure the user MEETS rather than reads.
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8");
    const code = codeOnly(src);
    ok("!! `found` comes from THIS scan, not from lastFound", /const found = f \? f\.v : null;/.test(code),
        "the old form was `(lastFound || 0) || null`, which survives the file being deleted");
    ok("!! updateAvailable follows the CURRENT scan too", /updateAvailable: \(found \|\| 0\) > cur/.test(code),
        "otherwise the panel would still offer an install for a zip that is gone");
    ok("lastFound is KEPT and still reported, because it is a genuinely different fact",
        /lastFound,/.test(code) && /if \(f\) lastFound = f\.v;/.test(code),
        "'the newest we have ever seen' is useful; it is simply not the answer to 'is there an update in Downloads'");
    ok("...and the two meanings are separate fields rather than one field wearing both",
        /found, lastFound,/.test(code));
    ok("the reason is recorded where the next reader meets it",
        /REMEMBERED RESULT PRESENTED AS A\s*(\/\/\s*)?CURRENT MEASUREMENT/.test(src.replace(/\n\s*\/\/\s?/g, " ")) ||
        /remembered result presented as a current measurement/i.test(src.replace(/\n\s*\/\/\s?/g, " ")));
}

console.log("downloadScan-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
