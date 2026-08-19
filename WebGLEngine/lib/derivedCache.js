// lib/derivedCache.js
//
// THE CONTRACT, FACTORED OUT (v3065). Four caches in this tree now implement the same discipline by hand:
//
//   voxel/rleVolumeCache.js   RLE chunk  -> 3D texture volume        (v3041)
//   voxel/rleBrickMap.js      RLE chunk  -> coarse occupancy         (v3042)
//   voxel/rleRegionVolume.js  RLE chunks -> one windowed volume      (v3045)
//   render/voxelVolumeStream  the window -> a texture on the GPU     (v3045)
//
// Each re-derived: a cheap signature to decide whether to rebuild, a position-sensitive walk to decide whether
// it is CORRECT, and a hard refusal to repair on divergence. Writing that four times is how the fifth one gets
// it subtly wrong, and there is already a fifth in the tree that DID: sysadminBridge's updateStatus keeps
// reporting the last version it ever found when the scan now finds nothing -- a remembered result presented as a
// current measurement, which is this contract's failure mode exactly.
//
// THE THREE RULES, and why each is separate:
//
//   1. STALE != WRONG.       A fingerprint MISMATCH proves the source moved. A MATCH proves nothing: it says
//                            nothing about whether the derivation was correct in the first place. Conflating
//                            them is how a cache gets called verified because a hash agreed.
//   2. VERIFY NEVER WRITES.  A divergence is a finding. Re-deriving on divergence means the cache can never be
//                            observed wrong, and you meet the same bug again with less information.
//   3. REPORT A COORDINATE.  "They differ" is not actionable. "They differ first at (37,12,45), expected 4, got
//                            6" is. Same reason box3dSyncCompare reports divergedAt.
//
// Browser-safe: no imports, no DOM, no node builtins.

/**
 * spec:
 *   name        -- for messages
 *   derive(src) -> value                    the ONLY thing that may produce a value
 *   fingerprint(src) -> string|number       cheap; used ONLY to answer "did the source move?"
 *   positions(src) -> iterable of keys      what a full check walks
 *   expected(src, key)                      what the source says at key
 *   actual(value, key)                      what the cache holds at key
 *   describe(key)                           key -> readable coordinate (default: JSON)
 */
export function makeDerivedCache(spec) {
    for (const k of ["derive", "fingerprint", "positions", "expected", "actual"])
        if (typeof spec[k] !== "function") throw new Error("makeDerivedCache: " + k + " must be a function");

    const name = spec.name || "cache";
    const describe = spec.describe || ((k) => JSON.stringify(k));
    let value = null, stamp = null;
    const stats = { derives: 0, verifies: 0, staleChecks: 0, skipped: 0 };

    return {
        name,
        get value() { return value; },
        get stamp() { return stamp; },
        stats,

        /** The only way a value is produced. Deliberate, never automatic on a failed check. */
        rebuild(src) {
            value = spec.derive(src);
            stamp = spec.fingerprint(src);
            stats.derives++;
            return value;
        },

        /**
         * Cheap. TRUE means the source definitely moved. FALSE means nothing we track moved -- it is NOT a
         * correctness claim, and the name says so rather than being called isValid().
         */
        isStale(src) {
            stats.staleChecks++;
            if (value === null) return true;
            const s = spec.fingerprint(src) !== stamp;
            if (!s) stats.skipped++;
            return s;
        },

        /** rebuild only if the source moved. Returns { changed, reason }. */
        sync(src) {
            if (!this.isStale(src)) return { changed: false, reason: "fingerprint unchanged" };
            this.rebuild(src);
            return { changed: true, reason: value === null ? "derive returned null" : "rebuilt" };
        },

        /**
         * THE REAL CHECK. Position-sensitive, read-only, stops at the first divergence by default and reports
         * WHERE. opts.maxReport > 1 collects more; opts.countAll walks everything.
         * Returns { ok, checked, first, mismatches, reason }.
         */
        verify(src, opts = {}) {
            stats.verifies++;
            if (value === null) return { ok: false, checked: 0, first: null, mismatches: [], reason: "nothing derived yet" };
            const maxReport = opts.maxReport == null ? 1 : opts.maxReport;
            const mismatches = [];
            let checked = 0;
            for (const key of spec.positions(src)) {
                const e = spec.expected(src, key), a = spec.actual(value, key);
                checked++;
                if (e !== a) {
                    mismatches.push({ key, where: describe(key), expected: e, actual: a });
                    if (mismatches.length >= maxReport && !opts.countAll) break;
                }
            }
            return { ok: mismatches.length === 0, checked, first: mismatches[0] || null, mismatches, reason: null };
        },

        describeResult(res) {
            if (res.reason) return name + ": " + res.reason;
            if (res.ok) return name + ": parity ok, " + res.checked + " positions agree";
            const m = res.first;
            return name + ": DIVERGED at " + m.where + " -- expected " + m.expected + ", cache holds " + m.actual +
                "   [not repaired; find out why first]";
        },
    };
}

/**
 * A cache whose verify() repairs. EXPORTED SO IT CAN BE SABOTAGED IN A GATE, never for use -- the whole point of
 * the contract is that this shape reports a clean pass on corrupt data, and a gate that could not demonstrate
 * that would be asserting the rule rather than testing it.
 */
export function makeHealingCache(spec) {
    const c = makeDerivedCache(spec);
    const honest = c.verify.bind(c);
    c.verify = (src, opts) => { c.rebuild(src); return honest(src, opts); };
    c.name = (spec.name || "cache") + " (HEALING -- do not ship)";
    return c;
}
