// WebGLEngine/tools/ship/bakeShrinkGuard.mjs — v4336
//
// *** A BAKE THAT READS THE WORKING TREE MUST NOT BE RUN FROM A TREE THAT IS MISSING FILES, AND UNTIL NOW
// *** NOTHING SAID SO.
//
// v4335 hit this for real. `node tools/ship/orreryBake.mjs --write` was run in a sandbox that does not carry
// the rig-only build artefacts, so the re-bake dropped native/gate_probe and its neighbours and took
// orrery.json from 3,767,005 bytes to 1,226,434. IT REPORTED "15 bodies" BOTH TIMES. Nothing in the write path
// compared what was leaving with what arrived, so a bake performed a deletion and called it a bake.
//
// IT DID NOT SURFACE HERE. It surfaced two gates downstream, in playerShip-selfcheck, because the git economy
// is built from orrery.json: a smaller world has different ports, so a five-tonne purchase stopped conserving
// and the ledger refused. That is the whole argument for this file -- THE DAMAGE WAS SILENT AT THE POINT IT WAS
// DONE and loud somewhere with no obvious connection to it. A guard at the write is worth more than a smarter
// gate at the far end.
//
// ---- WHY IDENTITIES AND NOT BYTES ----------------------------------------------------------------------------
//
// The obvious check is "refuse if the file got smaller", and it is the wrong one in both directions. A real
// edit may legitimately shrink a bake (a body retired, a vendored library slimmed), so bytes false-fault; and a
// bake could lose an entry while GROWING, if the surviving entries gained more than the lost one weighed, so
// bytes also fail to catch the thing they are aimed at. WHAT ACTUALLY WENT WRONG IS THAT NAMES DISAPPEARED.
// So the property asserted is: EVERY NAME THE OLD BAKE CARRIED IS STILL IN THE NEW ONE. Bytes are reported
// beside it, never asserted.
//
// The walk is shape-agnostic on purpose -- it collects `name` and `path` strings wherever they appear, so it
// serves orrery.json (bodies as an array, each with a files list) and orrery-fleet.json (bodies as an object of
// arrays) without either being taught about the other, and it keeps working if a third bake arrives.
//
// A DELIBERATE removal is still allowed, and has to say so: --allow-shrink prints the refusal it overrode, so
// the loss appears in the run's output instead of only in a diff nobody reads.
//
// Gated in tools/ship/bakeShrinkGuard-selfcheck.mjs.

// Every identity a bake carries: `name` and `path` strings at any depth, as a Set.
export function identities(json) {
    const out = new Set();
    const walk = (v) => {
        if (Array.isArray(v)) { for (const x of v) walk(x); return; }
        if (!v || typeof v !== "object") return;
        for (const [k, x] of Object.entries(v)) {
            if ((k === "name" || k === "path") && typeof x === "string") out.add(k + ":" + x);
            else walk(x);
        }
    };
    walk(json);
    return out;
}

/**
 * What a write would LOSE. Returns null when nothing is lost, else a refusal naming the missing identities.
 * `before` and `after` are parsed JSON; either may be null (a first write loses nothing).
 */
export function shrinkRefusal(before, after, opts = {}) {
    if (before == null) return null;
    const had = identities(before), has = identities(after);
    const missing = [...had].filter((k) => !has.has(k));
    if (!missing.length) return null;
    const show = missing.slice(0, opts.show || 6).map((m) => m.replace(/^(name|path):/, ""));
    const more = missing.length > show.length ? ` (+${missing.length - show.length} more)` : "";
    return `this write would DROP ${missing.length} of ${had.size} baked ${missing.length === 1 ? "entry" : "entries"}: ` +
           show.join(", ") + more +
           ". A bake reads the working tree, so the usual cause is a tree that is MISSING FILES rather than a " +
           "tree that changed -- re-run where the files exist. If the removal is deliberate, pass --allow-shrink.";
}

/**
 * The write-path helper both bakers use. Returns { ok, refusal } and prints the refusal or the override.
 * `argv` is the process argv; the override is --allow-shrink.
 */
export function guardWrite(beforeText, afterJson, argv = [], log = console.log) {
    let before = null;
    if (beforeText) { try { before = JSON.parse(beforeText); } catch { before = null; } }
    const refusal = shrinkRefusal(before, afterJson);
    if (!refusal) return { ok: true, refusal: null };
    if (argv.includes("--allow-shrink")) {
        log("  [bakeShrinkGuard] OVERRIDDEN with --allow-shrink: " + refusal);
        return { ok: true, refusal };
    }
    log("  [bakeShrinkGuard] REFUSED: " + refusal);
    return { ok: false, refusal };
}
