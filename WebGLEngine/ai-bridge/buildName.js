// FILE: ai-bridge/buildName.js
//
// v2871 -- ONE PLACE THAT KNOWS WHAT A SWEK BUILD IS CALLED.
//
// THE BUG THIS EXISTS FOR. Keith clicked Download in server.html's header and got EngineProject_v2727.zip -- a
// build 143 versions stale. Nothing was broken: the matcher was
//
//     /^EngineProject_v(\d+)\.zip$/i
//
// and every build shipped for the last hundred-odd versions is named SweK_Engine_vNNNN.zip. It never matched, so
// the newest thing it could find was the last archive that still carried the OLD name.
//
// THE PROJECT WAS RENAMED AND THE RENAME WAS NEVER FINISHED. main.js still says ENGINE_VERSION is "kept in
// lockstep with the EngineProject archive version"; the folder is SweK_Engine_vNNNN; the page says SweK Engine.
// Only the file-name matchers were left behind -- in the download link, the self-update installer, the GitHub
// release asset picker, the Homebrew formula, the old-folder housekeeping, AND the ship gate's own nested-fork
// guard, which meant a nested SweK_Engine_vNNNN copy inside a zip would NOT have been caught.
//
// WHY BOTH NAMES AND NOT JUST A RENAME. Old archives on real disks are still called EngineProject_vNNN, and an
// updater that suddenly cannot see the build you are currently running is worse than one that sees too much. So
// both are recognised, forever, and the version number decides which is newer -- not the name.
//
// CJS on purpose: the bridges are CJS and the ship tools are ESM, and ESM can require() this. One matcher, six
// call sites, no chance of them drifting apart again.
"use strict";

const BUILD_PREFIXES = ["SweK_Engine", "EngineProject"];   // current first; both always accepted
const ZIP_RE = /^(?:SweK_Engine|EngineProject)_v(\d+)\.zip$/i;
const DIR_RE = /^(?:SweK_Engine|EngineProject)_v(\d+)$/i;

/** @returns {{version:number, name:string}|null} */
function parseBuildZip(fileName) {
    const m = ZIP_RE.exec(String(fileName || ""));
    return m ? { version: parseInt(m[1], 10), name: String(fileName) } : null;
}

/** @returns {{version:number, name:string}|null} */
function parseBuildDir(dirName) {
    const m = DIR_RE.exec(String(dirName || ""));
    return m ? { version: parseInt(m[1], 10), name: String(dirName) } : null;
}

/** Newest build zip in a list of file names. Version decides, NOT the prefix -- see the header. */
function newestBuildZip(fileNames) {
    let best = null;
    for (const f of fileNames || []) {
        const p = parseBuildZip(f);
        if (p && (!best || p.version > best.version)) best = p;
    }
    return best;
}

module.exports = { BUILD_PREFIXES, ZIP_RE, DIR_RE, parseBuildZip, parseBuildDir, newestBuildZip };
