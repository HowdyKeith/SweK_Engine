// tools/ship/artifactCensus.mjs -- WHAT WOULD ACTUALLY END UP IN THE ZIP, WITHOUT BUILDING ONE.
//
// v4019 -- Keith: "SweK_Engine_v3940.zip is 27.6 megs and SweK_Engine_v4013.zip is 26 megs."
//
// A newer build 1.6 MB SMALLER after seventy-three versions of added work, noticed by a human reading two
// numbers in a Downloads folder. Measured here: the tracked tree GREW over that window (72.83 -> 76.98 MB,
// 4499 -> 4592 files, two tiny changelogs the only deletions) and the packager's skip rules never changed, so
// nothing was missing from v4013 -- v3940's zip had been carrying something extra. Fine. THE PROBLEM IS THAT
// NOTHING MEASURED IT EITHER WAY. This tree gates 1164 things about its source and, until now, zero things
// about the artifact people actually download. A build that quietly LOST a directory would have looked exactly
// like this one, and would also have waited for somebody to happen to read two file sizes.
//
// *** IT DOES NOT BUILD A ZIP. *** makeInstallable() copies the whole project to a temp dir and shells out to
// a zipper -- half a minute and hundreds of megabytes of I/O, which is not a thing to do in a gate that should
// run in the ritual every time. Instead it walks the project with THE PACKAGER'S OWN RULES, imported rather
// than re-typed: packagerBridge exported SKIP_DIRS and SKIP_FILES at v3948 with the comment that they were
// exported "so that a caller asking 'would this path end up in a release?'" could ask. This is that caller.
// Re-declaring the rules here would be a second copy of the answer, and v3527's rule (met four times this
// week) is that the second copy is never the one that gets updated.
//
// WHAT IT COUNTS IS UNCOMPRESSED BYTES AND FILES, NOT ZIP BYTES. Compressed size moves with the compressor's
// mood -- a zlib version, a different machine, text that happens to dedupe better -- and a gate that fires on
// that teaches everybody to ignore it. Files and raw bytes move only when CONTENT moves.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// THE PACKAGER'S OWN RULES, NOT A COPY OF THEM.
// *** AND THE SETS ALONE ARE NOT THE RULE, WHICH THIS FILE LEARNED ON ITS FIRST RUN. *** Counting with
// SKIP_DIRS + SKIP_FILES gave 4797 against the real copy's 4792: _skipFile ALSO carries five pattern rules
// (*.zip, petfbi-*.json, *-seen.json, ha-*.json) that a caller cannot see from the sets. Re-typing them here
// would have been the exact second copy this file's header warns about, five lines under the warning. The
// PREDICATE is imported instead, and packagerBridge exports it as of v4019 for that reason.
const PB = require_("../../ai-bridge/packagerBridge.js");
export const SKIP_DIRS = PB.SKIP_DIRS;
export const SKIP_FILES = PB.SKIP_FILES;
export const skipFile = PB._skipFile;
export const PROJECT_ROOT = PB.PROJECT_ROOT;

/**
 * Walk the project exactly as _copyTree does: skip the named dirs, the named files, and any
 * EngineProject_GmailSafe_* folder a previous packaging run left behind.
 * Returns { files, bytes, byTop } -- byTop is the per-top-level-directory split, which is what makes a
 * regression READABLE ("vendor lost 3 MB") instead of merely true ("the number changed").
 */
export function artifactCensus(root = PROJECT_ROOT) {
    let files = 0, bytes = 0;
    const byTop = {};
    const walk = (dir, top) => {
        let ents;
        try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.isDirectory()) {
                if (SKIP_DIRS.has(e.name) || e.name.startsWith("EngineProject_GmailSafe_")) continue;
                walk(path.join(dir, e.name), top || e.name);
            } else {
                if (skipFile(e.name)) continue;   // the packager's predicate: the sets AND the pattern rules
                let st; try { st = fs.statSync(path.join(dir, e.name)); } catch { continue; }
                files++; bytes += st.size;
                const k = top || "(root)";
                byTop[k] = (byTop[k] || 0) + st.size;
            }
        }
    };
    walk(root, "");
    return { files, bytes, byTop };
}

export const mb = (n) => +(n / 1048576).toFixed(2);
