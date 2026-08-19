// WebGLEngine/tools/ship/buildName-selfcheck.mjs -- v2871
//
// Run: node tools/ship/buildName-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ai-bridge/buildName.js and every call site that used to carry its own copy of the pattern.
//
// THE BUG. Keith pressed Download in server.html's header and got EngineProject_v2727.zip -- 143 versions stale.
// Nothing had broken. The matcher was /^EngineProject_v(\d+)\.zip$/i, every build for over a hundred versions has
// been named SweK_Engine_vNNNN.zip, and so the newest file it could SEE was the last archive still carrying the
// old name. THE PROJECT WAS RENAMED AND THE FILE-NAME MATCHERS WERE NEVER TOLD.
//
// It was in six places: the download link, the self-update installer, the version parse, the old-folder
// housekeeping, the GitHub release asset picker, the Homebrew formula -- AND the ship gate's own nested-fork
// guard, which meant a nested SweK_Engine_vNNNN copy inside a shipped zip would NOT have been caught. That last
// one is why this is a gate and not just a fix: a stale download wastes an afternoon, a blind fork guard ships.
//
// THE RULE: one matcher, required by every site. Six copies of a regex are six chances to miss the next rename.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const B = require(path.join(ENG, "ai-bridge", "buildName.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// ---- 1. the matcher itself ---------------------------------------------------------------------------------
{
    ok("!! the CURRENT name is recognised", B.parseBuildZip("SweK_Engine_v2870.zip")?.version === 2870,
       "this is the one that was missing, and it is the name every recent build actually has");
    ok("the LEGACY name still is", B.parseBuildZip("EngineProject_v2727.zip")?.version === 2727,
       "old archives on real disks still carry it; an updater that cannot see the build you are running is worse");
    ok("folder names too", B.parseBuildDir("SweK_Engine_v2870")?.version === 2870 && B.parseBuildDir("EngineProject_v600")?.version === 600);
    for (const bad of ["random.zip", "SweK_Engine.zip", "SweK_Engine_vX.zip", "MySweK_Engine_v1.zip", "SweK_Engine_v1.zip.bak"]) {
        ok("rejects " + bad, B.parseBuildZip(bad) === null);
    }
    ok("...and a zip name is not a folder name", B.parseBuildDir("SweK_Engine_v2870.zip") === null);
}

// ---- 2. VERSION DECIDES, NOT THE PREFIX ----------------------------------------------------------------------
{
    const newest = B.newestBuildZip(["EngineProject_v2727.zip", "SweK_Engine_v2870.zip", "SweK_Engine_v100.zip", "notes.txt"]);
    ok("!! the NEWEST wins across both names", newest.version === 2870 && newest.name === "SweK_Engine_v2870.zip",
       "the exact case that produced the bug: a legacy 2727 sitting beside a current 2870");
    const legacyNewer = B.newestBuildZip(["EngineProject_v3000.zip", "SweK_Engine_v2870.zip"]);
    ok("...even when the LEGACY one is newer", legacyNewer.version === 3000,
       "the prefix carries no authority -- only the number does");
    ok("an empty list is null, not a crash", B.newestBuildZip([]) === null && B.newestBuildZip(null) === null);
}

// ---- 3. NO CALL SITE KEEPS ITS OWN COPY ------------------------------------------------------------------------
{
    const server = read("ai-bridge/server.js");
    const legacyOnly = /\/\^EngineProject_v\\d\+\\\.zip\$\/i/;
    ok("!! server.js no longer carries an EngineProject-only zip regex", !legacyOnly.test(server),
       "four sites lived there: the download link, the self-update scan, the version parse and the housekeeping");
    ok("...and it requires the shared matcher", /require\(["']\.\/buildName\.js["']\)/.test(server));
    ok("...and actually uses it", (server.match(/buildName\./g) || []).length >= 3, (server.match(/buildName\./g) || []).length + " uses");

    const gh = read("ai-bridge/githubBridge.js");
    ok("the GitHub release picker accepts both names", /SweK_Engine\|EngineProject/.test(gh));
    const brew = read("ai-bridge/brewFormulaBridge.js");
    ok("the Homebrew version parse accepts both names", /SweK_Engine\|EngineProject/.test(brew));
}

// ---- 4. THE ONE THAT WOULD HAVE SHIPPED: the nested-fork guard --------------------------------------------------
//
// verify.mjs refuses to ship a zip containing a nested copy of the project. It only knew the legacy name, so the
// name every build actually uses would have sailed through. A stale download costs an afternoon; this costs a
// release.
{
    const v = read("tools/ship/verify.mjs");
    ok("!! the nested-FOLDER guard knows the current name", /\(\?:SweK_Engine\|EngineProject\)_v\\d\+\$/.test(v),
       "a nested SweK_Engine_vNNNN directory was invisible to it");
    ok("!! the nested-IN-ZIP guard does too", /SweK_Engine\|EngineProject/.test(v) && /nestedInZip/.test(v));
    // Prove the widened pattern actually fires on the shape it is meant to catch.
    const P = "(?:SweK_Engine|EngineProject)";
    const listing = "SweK_Engine_v2870/WebGLEngine/x.js\nSweK_Engine_v2870/WebGLEngine/SweK_Engine_v2869/main.js\n";
    const caught = new RegExp(P + "_v\\d+\\/WebGLEngine\\/.*" + P + "_v\\d+\\/").test(listing);
    ok("!! SABOTAGE: a nested SweK_Engine copy IS now caught", caught,
       "the same listing under the old pattern was clean, which is exactly how it would have shipped");
    const clean = "SweK_Engine_v2870/WebGLEngine/x.js\nSweK_Engine_v2870/README.md\n";
    ok("...and an ordinary tree is not falsely flagged", !new RegExp(P + "_v\\d+\\/WebGLEngine\\/.*" + P + "_v\\d+\\/").test(clean));
}

// ---- 5. the download route says what it looked for ---------------------------------------------------------------
{
    const server = read("ai-bridge/server.js");
    ok("a 404 from /self/zip names BOTH patterns", /SweK_Engine_vNNNN\.zip.*EngineProject/.test(server),
       "'no zip found' without saying what it looked for is how this went unnoticed for 143 versions");
}

console.log(fails ? "\nbuildName-selfcheck: " + fails + " FAILED" : "\nbuildName-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
