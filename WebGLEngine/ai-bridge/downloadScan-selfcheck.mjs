// WebGLEngine/ai-bridge/downloadScan-selfcheck.mjs -- v3921
//
// *** THE ZIP WAS IN Downloads, NAMED CORRECTLY, ROOTED CORRECTLY, AND THE UPDATER DID NOT SEE IT. ***
//
// Keith: "when I had tried to autoupdate the new version in downloads, it wasn't reported as update so I
// extracted it and ran swek." Everything the ship ritual is careful about was right. What was wrong is that a
// browser appends a disambiguator when a file of that name is already there -- and the same zip had been
// delivered twice -- so what landed was `SweK_Engine_v3918 (1).zip`, and the scanner's pattern glued \.zip$
// directly to the version group.
//
// A SUFFIX BROKE IT AND A PREFIX DID NOT. The pattern was unanchored, so `9e6077e1-SweK_Engine_v3918.zip` had
// always matched. Nobody prefixes a download and every browser suffixes one, so the half that was tolerant was
// the half that never gets exercised.
//
// AND THERE WERE FOUR COPIES OF THE PATTERN, only one of which was the builder: the prune safety net, the
// engine-parent scan and patchScan's isBuild each spelled it out inline. Widening the builder alone would have
// fixed the scanner and left three siblings blind -- v3919's "there is one table", arriving again in another
// file one round later. This gate asserts the consolidation as well as the behaviour, because the behaviour can
// be restored by editing one regex and the defect grows back through the other three.
//
// THE SCANNER IS DRIVEN AGAINST REAL DIRECTORIES ON DISK. A regex tested against strings proves the regex; it
// does not prove that updateStatus reaches it, which is the wiring that actually failed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sb = require(path.join(HERE, "sysadminBridge.js"));

let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

// *** v3937 -- THIS GATE POINTED THE LIVE INSTALLER AT ITS OWN FIXTURES AND NEVER PUT IT BACK. ***
//
// statusIn() called setConfig({ downloadsDir: dir, enabled: true, autoApply: true }) to make the scanner look at
// the temp folder below. setConfig PERSISTS -- it ends in saveCfg() -- so after this file ran, the RUNNING
// ENGINE was aimed at a directory full of one-byte placeholders named SweK_Engine_v9101 (1).zip, v9102, v9103,
// and it had auto-apply switched on BY THE TEST. Keith's rig duly offered to install v9302 over v3936, and the
// only reason it did not is that he read the banner and asked.
//
// A TEST THAT MUTATES PRODUCTION STATE TO RUN WILL EVENTUALLY FORGET TO PUT IT BACK. So it no longer mutates
// anything: updateStatus(dir) takes the folder as an ARGUMENT. Nothing is written, nothing needs restoring, and
// there is no window in which a crash mid-gate leaves the updater armed. The fixtures are removed on the way
// out too -- a temp folder full of fake builds is not something to leave lying next to a scanner.
const _fixtures = [];
function fixture(files) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "swekdl-"));
    for (const f of files) fs.writeFileSync(path.join(d, f), "x");
    _fixtures.push(d);
    return d;
}
function statusIn(dir) {
    return sb.updateStatus(dir);
}
process.on("exit", () => { for (const d of _fixtures) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} } });

console.log("downloadScan-selfcheck -- the name a browser actually writes\n");

// ---- 1. THE EXACT NAME THAT FAILED ------------------------------------------------------------------------
{
    const d = fixture(["SweK_Engine_v9101 (1).zip"]);
    const st = statusIn(d);
    ok("!! *** the second download of a build IS an update -- `SweK_Engine_vNNNN (1).zip` ***",
       st.found === 9101 && st.updateAvailable === true,
       "found=" + st.found + ", updateAvailable=" + st.updateAvailable + ". THE OLD PATTERN MATCHED NOTHING HERE " +
       "and the status said only that there was nothing, which is indistinguishable from an empty folder");
}

// ---- 2. THE WHOLE FAMILY, BECAUSE ONE VARIANT IS AN ANECDOTE ----------------------------------------------
{
    const variants = {
        "SweK_Engine_v9102.zip": "the plain name",
        "SweK_Engine_v9103 (2).zip": "Chrome/Edge/Firefox, third copy",
        "SweK_Engine_v9104(1).zip": "no space before the paren",
        "SweK_Engine_v9105-1.zip": "hyphenated disambiguator",
        "SweK_Engine_v9106 copy.zip": "macOS Finder duplicate",
        "SweK_Engine_v9107 copy 2.zip": "macOS Finder, second duplicate",
        "9e6077e1-SweK_Engine_v9108.zip": "a hashed PREFIX, which always worked",
        "SweK Engine v9109.zip": "spaces instead of underscores",
        "EngineProject_v9110.zip": "the older prefix, still supported",
    };
    let worst = 0, missed = [];
    for (const [name, note] of Object.entries(variants)) {
        const want = parseInt(name.match(/v(\d+)/)[1], 10);
        const st = statusIn(fixture([name]));
        if (st.found !== want) missed.push(name + " (" + note + ")");
        else worst = Math.max(worst, want);
    }
    ok("!! ...and every disambiguator a file manager writes, not just the one that was reported",
       missed.length === 0,
       Object.keys(variants).length + " variants, " + missed.length + " missed" +
       (missed.length ? ": " + missed.join("; ") : ". Fixing the reported name and stopping is how the next " +
        "browser convention costs another round"));
}

// ---- 3. AND THE LINE THAT MUST NOT MOVE: A PARTIAL IS NEVER INSTALLABLE -------------------------------------
{
    const d = fixture(["SweK_Engine_v9200.zip.crdownload", "SweK_Engine_v9201 (1).zip.part"]);
    const st = statusIn(d);
    ok("!! *** a still-downloading zip is NEVER `found`, however it is named ***",
       st.found === null && st.arriving !== null,
       "found=" + st.found + ", arriving=" + st.arriving + ". The widened suffix admits `(1)` and MUST NOT " +
       "admit .crdownload/.part -- 'nothing downstream may ever hand a partial file to the installer'. The " +
       "partial-named variant is in this fixture precisely because widening one pattern could have let it in");
}

// ---- 4. A SILENT "no update" WAS THE REASON THIS TOOK A ROUND TO FIND ---------------------------------------
{
    const d = fixture(["SwekEngine-9300.zip", "random.zip", "SweK_Engine_v9301.zip.crdownload"]);
    const st = statusIn(d);
    const reasons = (st.rejected || []).map((r) => r.why).join(" | ");
    ok("!! every zip the scanner DECLINED is named with its reason",
       (st.rejected || []).length === 3 && /partial/.test(reasons) && /prefix/.test(reasons),
       (st.rejected || []).length + " rejected. `no update` and `an unreadable name` and `still arriving` were " +
       "one indistinguishable answer, so the miss was only findable by reading the source");
    ok("...and nothing is reported as rejected when a build IS found", statusIn(fixture(["SweK_Engine_v9302.zip"])).rejected.length === 0,
       "the list exists to explain an ABSENCE; printing it beside a successful find would be noise");
}

// ---- 5. THE CONSOLIDATION, BECAUSE THE DEFECT GROWS BACK THROUGH THE SIBLINGS -------------------------------
{
    const src = fs.readFileSync(path.join(HERE, "sysadminBridge.js"), "utf8");
    const inline = (src.match(/\/\^?\(\?:EngineProject\|SweK\[ _\]Engine\)/g) || []).length;
    ok("!! *** the version pattern is written ONCE, not four times ***", inline === 0,
       inline + " inline copies left beside _versionRe. There were four: the builder, the prune safety net, " +
       "the engine-parent scan and patchScan's isBuild -- and widening the builder alone would have fixed the " +
       "scanner while three siblings stayed blind. That is v3919's `there is one table` in a second file");
    ok("...and the prune path keeps its START ANCHOR, because it authorises a deletion",
       /_versionRe\(true, "\\\\.zip\$"\)/.test(src),
       "a stricter match on the destructive path fails toward NOT deleting, which is the direction a safety " +
       "net should fail in");
}

console.log(failed ? "\ndownloadScan-selfcheck: " + failed + " FAILED" : "\ndownloadScan-selfcheck: all checks pass");
process.exit(failed ? 1 : 0);
