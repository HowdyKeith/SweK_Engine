// WebGLEngine/ai-bridge/partialSweep.mjs -- v3457
//
// *** WHICH `.part` FILES ARE SAFE TO DELETE -- AND THE WHOLE DIFFICULTY IS THAT SOME OF THEM ARE ALIVE. ***
//
// Keith: "we need to remove these partial files we are sometimes trailing", naming EngineProject_v3455.zip.part.
// They come from the WRITE-THEN-RENAME idiom, which this tree uses in at least seven places (githubBridge,
// ensureSpark, catalogSnapshot, assetSync, sysadminBridge, and two paths in server.js): write to `dest + ".part"`
// and rename on success, so a reader never sees a half-file. An interrupted transfer leaves the `.part` behind.
//
// *** SO A SWEEP THAT DELETES EVERY .part BREAKS THE VERY TRANSFERS THE IDIOM EXISTS TO PROTECT. A FILE BEING
// WRITTEN RIGHT NOW IS INDISTINGUISHABLE FROM ABANDONED DEBRIS BY NAME ALONE. *** The only cheap evidence is
// AGE: a partial nobody has touched for a long time is not being written; one touched seconds ago probably is.
// That is a heuristic and it is named as one -- it cannot prove a transfer is dead, only that nothing has
// written to it recently, which is why the default is generous rather than tight.
//
// THIS MODULE IS PURE ON PURPOSE: it takes a listing and a clock and returns a decision with a REASON PER FILE.
// The filesystem walk and the actual removal stay in sysadminBridge beside robustRemove, which already handles
// the retries, the read-only clearing and the Windows rmdir fallback. Deciding and deleting are different jobs
// and only the first one can be tested against a fixture.
"use strict";

/** Anything a partial can be called. `.partial` is applyStaged's spelling; both are the same idiom. */
export const PARTIAL_RE = /\.(part|partial)$/i;

/** Untouched for this long and it is treated as abandoned. Generous by design -- see the note above. */
export const DEFAULT_MIN_AGE_MS = 6 * 60 * 60 * 1000;   // 6 hours

/**
 * Decide which partials to sweep.
 *
 * `entries` is [{ path, mtimeMs, bytes }]. Returns { sweep, keep }, each entry carrying WHY -- because a sweep
 * that reports only a count cannot be argued with, and this one deletes things.
 */
export function stalePartials(entries, { now = Date.now(), minAgeMs = DEFAULT_MIN_AGE_MS } = {}) {
    const sweep = [], keep = [];
    for (const e of entries || []) {
        const name = String(e && e.path || "");
        if (!PARTIAL_RE.test(name)) { keep.push({ ...e, reason: "not a partial" }); continue; }
        const age = now - (Number(e.mtimeMs) || 0);
        if (!Number.isFinite(age) || age < 0) {
            // *** A FILE STAMPED IN THE FUTURE IS NOT OLD ENOUGH TO DELETE, IT IS A CLOCK PROBLEM. *** Clock skew
            // across a LAN is ordinary here and a negative age must never read as "very old" through a
            // comparison that only tests one side.
            keep.push({ ...e, reason: "mtime is in the future -- clock skew, not age" });
            continue;
        }
        if (age < minAgeMs) { keep.push({ ...e, reason: "touched " + Math.round(age / 1000) + "s ago -- may be a live transfer" }); continue; }
        sweep.push({ ...e, ageMs: age, reason: "untouched for " + Math.round(age / 3600000) + "h" });
    }
    return { sweep, keep };
}

/** Bytes a sweep would reclaim -- the number worth showing on a page beside the count. */
export const reclaimable = (sweep) => (sweep || []).reduce((a, e) => a + (Number(e.bytes) || 0), 0);
