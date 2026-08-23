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
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const src = fs.readFileSync(path.join(ENG, "ai-bridge", "sysadminBridge.js"), "utf8");
const code = codeOnly(src);
const text = noComments(src);

// --- 1. the two scanners exist and stay separate ---------------------------------------------------------
{
    // *** v3941 -- THESE TWO SPELLED THE PARAMETER LIST AND THE FUNCTIONS GREW A PARAMETER. ***
    // Both greps required `function scanDownloads()` with EMPTY parens. Both scanners now take a dirArg -- which
    // is the affordance that lets section 3 point them at a fixture instead of at the user's real Downloads
    // folder -- so the gate went red ON A CHANGE THAT MADE THE MODULE MORE TESTABLE, with the behaviour it grades
    // untouched. The property is that the function is DECLARED and that the complete scan is anchored to \.zip$;
    // how many arguments it takes is not this gate's business.
    ok("scanDownloads still exists and still requires a COMPLETE zip",
        /function scanDownloads\s*\(/.test(code) && /_versionRe\(false, "\\\\.zip\$"\)/.test(text),
        "matched by DECLARATION rather than by an empty parameter list -- scanDownloadsPartial and " +
        "scanDownloadsRejects do not satisfy this pattern, because it requires the ( to follow the name directly");
    ok("a SECOND scanner reports in-flight files", /function scanDownloadsPartial\s*\(/.test(code));
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
// Rebuilt here from the same pieces rather than imported, because scanDownloads and scanDownloadsPartial are
// PRIVATE to sysadminBridge -- module.exports carries updateStatus and updateCheck, not the two scanners.
//
// *** v3941 -- AND THE REASON THIS COMMENT USED TO GIVE WAS NOT TRUE. *** It said "sysadminBridge is a CJS
// module with side effects on require". Requiring it completes in ~15ms and, under a fresh HOME, writes nothing
// at all -- checked, because a stale excuse is what kept section 3 below grading its own copy of the logic for
// six hundred versions. THE REAL BARRIER IS VISIBILITY, NOT SAFETY, and it applies to these two functions only.
// Section 3 now drives the SHIPPED updateStatus, which is exported and takes the directory.
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

// --- 3. *** THE SCENARIO, END TO END, DRIVING THE SHIPPED MODULE RATHER THAN A COPY OF IT *** ---------------
//
// The exact folder state Keith had: an older complete zip plus a newer one still arriving.
//
// *** v3941 -- THIS SECTION USED TO REBUILD THE SCANNER AND THE arriving RULE INSIDE THE GATE. *** It wrote its
// own reC, its own reP, its own scan() and its own
//     arriving = (part && part.v > cur && (!found || part.v > found.v)) ? part.v : null
// and then checked that those agreed with each other. EVERY ONE OF THOSE ASSERTIONS COULD HAVE PASSED WITH
// sysadminBridge DELETED. A second walker re-deriving the shipped rule is the tree's own singleSource finding,
// and the excuse for it -- "side effects on require" -- was not true.
//
// It now requires the module and calls updateStatus(dir), which is EXPORTED and takes the directory. The two
// scanners stay private and section 2 above still exercises their shapes as rebuilt regexes, honestly labelled.
//
// THE FIXTURE VERSIONS ARE DERIVED FROM THE MODULE'S OWN current, NOT TYPED. The old section hard-coded cur =
// 3052 beside a v3052 fixture, so it tested a story rather than the tree; a real call reports the real current
// version and the fixture is placed either side of it, which keeps the scenario true at every future version.
const LIVE = (() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-dl-"));
    try {
        const bridge = require(path.join(ENG, "ai-bridge", "sysadminBridge.js"));
        if (typeof bridge.updateStatus !== "function") return { err: "sysadminBridge does not export updateStatus" };
        const cur = bridge.updateStatus(dir).current;
        if (!Number.isFinite(cur)) return { err: "updateStatus did not report a numeric current version" };
        const OLD = cur - 100, NEW = cur + 100;

        fs.writeFileSync(path.join(dir, `SweK_Engine_v${OLD}.zip`), "x");
        fs.writeFileSync(path.join(dir, `SweK_Engine_v${NEW}.zip.crdownload`), "x");
        const inflight = bridge.updateStatus(dir);

        fs.renameSync(path.join(dir, `SweK_Engine_v${NEW}.zip.crdownload`), path.join(dir, `SweK_Engine_v${NEW}.zip`));
        const landed = bridge.updateStatus(dir);

        fs.writeFileSync(path.join(dir, `SweK_Engine_v${OLD - 50}.zip.crdownload`), "x");
        const stale = bridge.updateStatus(dir);

        // *** THE CASE WHERE THE REFUSAL IS THE ONLY THING STANDING BETWEEN THE USER AND AN UNZIP OF HALF A
        // FILE: a partial with NO complete zip anywhere. Every state above keeps a complete zip in the folder,
        // so `found` was never asked to come back empty and the partial was never the newest thing present. ***
        const bare = fs.mkdtempSync(path.join(os.tmpdir(), "swek-dl-bare-"));
        let alone;
        try {
            fs.writeFileSync(path.join(bare, `SweK_Engine_v${NEW}.zip.crdownload`), "x");
            alone = bridge.updateStatus(bare);
        } finally { try { fs.rmSync(bare, { recursive: true, force: true }); } catch {} }

        return { cur, OLD, NEW, inflight, landed, stale, alone };
    } catch (e) { return { err: String((e && e.message) || e) };
    } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} }
})();
{
    ok("!! the gate can DRIVE the shipped module, rather than agreeing with its own copy of the rule",
        !LIVE.err, LIVE.err ? "FAILED TO DRIVE: " + LIVE.err
            : `required sysadminBridge and called updateStatus() against a fixture directory; it reports current ` +
              `v${LIVE.cur}, so the fixture is v${LIVE.OLD} complete and v${LIVE.NEW} in flight. A GATE THAT ` +
              "CANNOT REACH THE CODE IS NOT A GATE, and this line fails loudly rather than skipping.");

    if (!LIVE.err) {
        ok("SCENARIO: the installable answer is still the complete older zip",
            LIVE.inflight.found === LIVE.OLD,
            `found v${LIVE.inflight.found} -- the newest FINISHED file, which is the honest answer to that question`);
        ok("SCENARIO: and the in-flight build is reported as ARRIVING",
            LIVE.inflight.arriving === LIVE.NEW,
            `arriving v${LIVE.inflight.arriving}, straight out of the shipped updateStatus`);
        ok("!! *** SCENARIO: THE OLD CODE WOULD HAVE SAID 'not newer' HERE, AND THE PARTIAL IS STILL NOT OFFERED ***",
            LIVE.inflight.found < LIVE.cur && LIVE.inflight.arriving !== null && LIVE.inflight.updateAvailable === false,
            `found v${LIVE.inflight.found} is older than the running v${LIVE.cur}, so updateAvailable is ` +
            `${LIVE.inflight.updateAvailable} -- BOTH HALVES OF THE FIX IN ONE READING: the arriving build is ` +
            "SAID, and it is never offered as installable. Handing a .crdownload to an unzip is a corrupted " +
            "install, which is worse than a confusing message.");
        ok("SCENARIO: after the rename the install offer appears and ARRIVING clears",
            LIVE.landed.found === LIVE.NEW && LIVE.landed.arriving === null && LIVE.landed.updateAvailable === true,
            `found v${LIVE.landed.found}, arriving ${LIVE.landed.arriving}, updateAvailable ${LIVE.landed.updateAvailable}`);
        ok("an in-flight OLDER version is not announced",
            LIVE.stale.arriving === null,
            `a v${LIVE.OLD - 50} partial beside a complete v${LIVE.NEW} reports arriving ${LIVE.stale.arriving} -- ` +
            "arriving means NEWER THAN ANYTHING HERE, not merely unfinished");

        // *** v3941 -- THE HALF OF THE FIX THAT CAN CORRUPT AN INSTALL HAD NO TEST AT ALL. ***
        // Every state above keeps a complete zip in the folder, so scanDownloads always had something to return
        // and the refusal was never the load-bearing part. Planting `scanDownloads(dir) || scanDownloadsPartial(dir)`
        // -- the single most natural way to break this, and exactly what "make the arriving version installable"
        // looks like as a diff -- PASSED EVERY CHECK IN THIS FILE, because the || never fired while a complete
        // zip was present. With an empty Downloads folder and one build arriving it fires every time, and the
        // panel then offers a .crdownload to the unzip.
        ok("!! *** A PARTIAL WITH NO COMPLETE ZIP BESIDE IT IS ANNOUNCED AND STILL REFUSED ***",
            LIVE.alone.found === null && LIVE.alone.arriving === LIVE.NEW && LIVE.alone.updateAvailable === false,
            `an otherwise empty folder holding only v${LIVE.NEW}.zip.crdownload reports found ` +
            `${JSON.stringify(LIVE.alone.found)}, arriving v${LIVE.alone.arriving}, updateAvailable ` +
            `${LIVE.alone.updateAvailable}. *** found MUST COME BACK EMPTY: this is the state where nothing else ` +
            "stops a partial being handed to the installer, and the two halves of the fix are furthest apart -- " +
            "the folder has news, and none of it is installable yet.");
    }
}

// --- 4. it reaches the person, and names the folder it read ------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
    ok("updateCheck returns `arriving`", /arriving/.test(code) && /const base = \{[^}]*arriving/.test(code.replace(/\n/g, " ")));
    // v3941 -- this required the literal `updateStatus()` with empty parens and then `arriving` within 900
    // characters. updateStatus takes a dirArg now, so the grep missed and the gate reported a working field as
    // absent. THE FIELD IS READ OFF A REAL CALL IN SECTION 3, which no rename can break.
    ok("updateStatus returns it too, so the steady-state line can say it",
        !LIVE.err && Object.prototype.hasOwnProperty.call(LIVE.inflight, "arriving") && LIVE.inflight.arriving === LIVE.NEW,
        LIVE.err ? "could not drive the module: " + LIVE.err
                 : `updateStatus() returned arriving = v${LIVE.inflight.arriving} from the fixture directory -- ` +
                   "the field is OBSERVED on the returned object rather than grepped out of the source");
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
