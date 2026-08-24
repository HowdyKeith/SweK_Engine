// tools/roundhouse/codemapBridge-selfcheck.mjs
//
// Run: node tools/roundhouse/codemapBridge-selfcheck.mjs   (<1s, sandboxed -- never reads or mutates the real tree)
//
// v3976 -- THE CAP WAS 9999, AND KEITH FOUND IT BY LOOKING AT THE PAGE. codemap.html coloured almost the whole
// city near-black. The reason: newestMarker() capped its scan at literal 9999 rather than at the tree's real
// newest version, and eight of THIS TREE'S OWN SELFCHECKS plant `"v9999"` as synthetic test data for the
// marker-parsing convention itself -- fixture strings, never a shipped version. The scanner could not tell a
// fixture from a fact, so `stats.newest` came back v9999 against a tree actually at v3975, and the colour scale
// (marker - oldest) / (newest - oldest) squeezed every real file into the bottom ~40% of its range. THE MAP WAS
// NOT DARK, THE SCALE WAS LYING TO IT -- and there was no gate here to have caught it: this bridge shipped at
// v2519 and has run ungated for 1457 versions.
//
// THE FIX AND THE GATE ARE THE SAME SHAPE THIS SESSION KEEPS FINDING: a scanner that cannot distinguish real
// data from a fixture describing itself. codemapBridge now caps at main.js's own ENGINE_VERSION rather than an
// arbitrary ceiling, so the cap tracks the tree instead of a number chosen once and never revisited.
//
// SANDBOXED, DRIVING configure() RATHER THAN THE REAL TREE. The bug can only be PROVEN against a tree where
// "the real newest version" and "a fixture pretending to be newer" are both known values the test chose, not
// read off whatever this box happens to ship at today -- the real tree's actual newest will keep moving every
// round this file is run, which is fine for a demonstration and useless for an assertion.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const bridge = require(path.join(ROOT, "ai-bridge", "codemapBridge.js"));

// ---- SANDBOX: a synthetic tree with a KNOWN real ceiling and a KNOWN fictional one ------------------------------
const box = fs.mkdtempSync(path.join(os.tmpdir(), "swek-codemap-gate-"));
fs.writeFileSync(path.join(box, "main.js"), 'const ENGINE_VERSION = "v4200"; // the sandbox\'s "real" ship version\n');

// a normal file with an ordinary, real-looking marker
fs.writeFileSync(path.join(box, "normal.js"), "// v4100 -- an ordinary recent file\nconsole.log(1);\n");

// a fixture file, exactly the shape the real offenders take: it plants a marker ABOVE the real ceiling as
// synthetic test data, with a genuine, lower marker elsewhere in the same file
fs.writeFileSync(path.join(box, "fixture.mjs"),
    "// v3900 -- a real marker on this file\n" +
    "const zip = mkzip(\"main.js\", 'const ENGINE_VERSION = \"v9999\";');   // synthetic test data, not a version\n");

// a file whose ONLY token is fictional -- nothing real to fall back to
fs.writeFileSync(path.join(box, "onlyFake.mjs"), "// planted string for a parser test: v8888\n");

bridge.configure({ engineDir: box });
const r = bridge.codemap(true);
const get = (name) => r.files.find((f) => f.path === name);

// ---- 1. THE CAP TRACKS THE TREE, NOT A CONSTANT ------------------------------------------------------------------
ok("!! stats.newest is the SANDBOX'S real ceiling (4200), not the old hardcoded 9999",
    r.stats.newest === 4200, "newest=" + r.stats.newest);

// ---- 2. A FIXTURE ABOVE THE CEILING DOES NOT WIN, AND DOES NOT ERASE THE REAL MARKER BESIDE IT -------------------
ok("!! fixture.mjs reports its REAL marker (3900), not the planted v9999",
    get("fixture.mjs") && get("fixture.mjs").marker === 3900,
    "marker=" + (get("fixture.mjs") && get("fixture.mjs").marker));

// ---- 3. A FILE WITH NOTHING PLAUSIBLE BELOW THE CAP IS UNMARKED, NOT FALSELY DATED ------------------------------
ok("!! onlyFake.mjs (only an above-cap token) comes back UNMARKED rather than v8888",
    get("onlyFake.mjs") && get("onlyFake.mjs").marker === null,
    "marker=" + (get("onlyFake.mjs") && get("onlyFake.mjs").marker));

// ---- 4. AN ORDINARY FILE IS UNAFFECTED -----------------------------------------------------------------------
ok("...and an ordinary in-range marker is read normally",
    get("normal.js") && get("normal.js").marker === 4100, "marker=" + (get("normal.js") && get("normal.js").marker));

// ---- 5. THE OLD BEHAVIOUR, REPRODUCED ON PURPOSE, TO PROVE THE FIX IS THE CAP AND NOT SOMETHING ELSE -------------
{
    const oldNewestMarker = (text) => {
        let best = 0; const re = /\bv(\d{3,4})\b/g; let m;
        while ((m = re.exec(text))) { const n = parseInt(m[1], 10); if (n > best && n <= 9999) best = n; }
        return best || null;
    };
    const fixtureText = fs.readFileSync(path.join(box, "fixture.mjs"), "utf8");
    ok("!! *** the pre-v3976 scan WOULD have read fixture.mjs as v9999 -- this is the exact bug ***",
        oldNewestMarker(fixtureText) === 9999,
        "old cap gives " + oldNewestMarker(fixtureText) + "; the new cap (above) gives 3900. Same input, " +
        "different cap, different answer -- the fixture text never changes, only what bounds a plausible marker");
}

// ---- 6. NO MEMOIZED SHIP VERSION SURVIVES A CONFIGURE() CALL, SO A LONG-RUNNING SERVER CANNOT GO STALE -----------
//
// force:true WOULD PASS EVEN IF THE CACHE WERE NEVER CLEARED -- codemap(force) skips the 60s TTL check entirely
// when force is true, so a first draft of this check that called codemap(true) here proved nothing about
// configure()'s cache-clearing at all; it just re-walked regardless, whatever configure() did or didn't do.
// The real question is what a NON-forced call sees, which is what ai-bridge/server.js actually issues on every
// unforced /codemap request. Caught only by writing it, then breaking configure()'s cache-clear on purpose and
// watching THIS check stay green while it should have gone red.
{
    fs.writeFileSync(path.join(box, "main.js"), 'const ENGINE_VERSION = "v4300"; // the tree "shipped" again\n');
    bridge.configure({ engineDir: box });   // same box, re-issued -- this is the call that must drop the cache
    const r2 = bridge.codemap(false);       // NOT forced: only a cleared cache can see the new main.js this way
    ok("!! *** a re-configured tree with a NEW ship version is re-read on the very next UNFORCED call ***",
        r2.stats.newest === 4300, "newest=" + r2.stats.newest + " (expected 4300 after the sandbox's own bump)");
}

// ---- 7. configure() POINTS BACK AT THE REAL TREE ON DEMAND, PROVING THE SEAM IS TWO-WAY --------------------------
// Same module instance as `bridge` above (require() is a singleton): re-pointing it at ROOT and re-reading proves
// configure() is not a one-shot sandbox switch, and that the real tree's own ENGINE_VERSION is what a production
// caller (never invoking configure() at all) would have been reading the whole time.
{
    bridge.configure({ engineDir: path.resolve(ROOT) });
    const rr = bridge.codemap(true);
    ok("...and pointed back at the real tree, the real ENGINE_VERSION is what comes back",
        typeof rr.stats.newest === "number" && rr.stats.newest < 9999 && rr.stats.newest > 3000,
        "newest=" + rr.stats.newest + " -- plausible for this tree, and nowhere near the old 9999 ceiling");
}

try { fs.rmSync(box, { recursive: true, force: true }); } catch { }
console.log("\ncodemapBridge-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
