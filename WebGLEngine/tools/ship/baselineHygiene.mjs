import { pathToFileURL, fileURLToPath } from "node:url";
// WebGLEngine/tools/ship/baselineHygiene.mjs -- v3202
//
// DOES EVERY BASELINE ENTRY STILL DESCRIBE WHAT IT CLAIMS?
//
// v3195 found ONE stale entry: physics/spacefill/hilbert.mjs, baselined "unwired by design" at v3187 and WIRED
// at v3188, sitting there for seven rounds. I called it a one-off. *** IT IS NOT. FIVE OF FOURTEEN ORPHAN
// BASELINE ENTRIES NO LONGER DESCRIBE AN ORPHAN. ***
//
// AND A STALE SUPPRESSION IS NOT MERELY USELESS -- IT IS AN ACTIVE BLIND SPOT. If ui/knownState.js becomes a
// real orphan again tomorrow, its baseline entry SILENTLY SWALLOWS IT. The entry looks like protection and holds
// nothing, which is strictly worse than no entry: nobody audits a list they believe is doing its job.
//
// ONE OF THE FIVE MAKES THE POINT. ui/knownState.js was deleted by the v3159 sweep, restored at v3176, and then
// BASELINED AS AN ORPHAN -- while main.js, the engine's own entry point, imports it THREE TIMES. It was never an
// orphan. I wrote the entry.
//
// *** THE RIGHT RESPONSE TO A STALE ENTRY IS DELETION, NOT A LOOSENED CHECK. *** An entry that stops describing
// an orphan means the module got adopted, which is progress -- and the way to record progress is to stop
// suppressing it, not to keep a note that no longer refers to anything.

import fs from "node:fs";
import path from "node:path";

/**
 * @returns { entries, live, stale, missing } -- STALE and MISSING are separate. An entry whose file is GONE is a
 *          different problem from one whose file became reachable: the first is a dangling reference, the second
 *          is a suppression that outlived its reason, and they need different work.
 */
export function orphanBaselineHygiene(engRoot, liveCandidates) {
    // v3222 -- *** IT REFUSES A MISSING CANDIDATE SET INSTEAD OF ANSWERING FROM ONE. ***
    //
    // `new Set(undefined)` is an EMPTY SET, not an error -- so a caller that forgot this argument got a report
    // saying EVERY suppression was stale, with total confidence. That is exactly what happened: v3219's main
    // block called this with engRoot alone, and the tool answered "9 of 9 STALE, 0 live" twice, in writing.
    //
    // *** THE WRONG ANSWER POINTED AT DELETING THE RIGHT FILES. *** Two of those nine are render/SSAOPass.js and
    // simulation/SpatialHash.js -- swept at v3159, caught by orphanScan naming them BY HAND, restored from the
    // shipped zip, and deliberately re-added to this baseline so the next sweep would leave them alone. SSAOPass
    // carries its own verdict: "A REVIVE CANDIDATE, NOT DEAD WEIGHT". Clearing those entries as stale debt would
    // have unprotected both, and the next sweep would have taken them again.
    //
    // "I WAS NOT TOLD" AND "NOTHING IS LIVE" ARE OPPOSITE CLAIMS, and a Set constructor collapses them silently.
    // Same refusal deviceModeTable makes about a zero-device table and recoverable() makes about a zero-archive
    // index -- both written after this same mistake, in this same tree, for the same reason.
    if (liveCandidates === undefined || liveCandidates === null) {
        throw new Error("orphanBaselineHygiene: liveCandidates was not supplied. Refusing to answer -- an absent " +
                        "candidate set would make EVERY baseline entry look stale, and clearing a live " +
                        "suppression un-protects the file it was written to save. Pass orphanScan(root).candidates.");
    }
    const p = path.join(engRoot, "tools", "ship", "orphan-baseline.json");
    const base = JSON.parse(fs.readFileSync(p, "utf8"));
    const live = new Set(liveCandidates);
    const entries = base.files.slice();
    return {
        entries,
        live: entries.filter((f) => live.has(f)),
        // still on disk, but no longer an orphan -- the suppression has outlived its reason
        stale: entries.filter((f) => !live.has(f) && fs.existsSync(path.join(engRoot, f))),
        // named in the baseline and not on disk at all -- a dangling reference
        missing: entries.filter((f) => !fs.existsSync(path.join(engRoot, f))),
    };
}

const ENGROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// v3219 -- A FRONT DOOR. *** RUNNING THIS FILE PRINTED NOTHING AND EXITED 0, WHICH READS AS A CLEAN BILL. ***
// EIGHT of this tree's analysis tools did that, not the two on record: an empty report and a tool that never
// ran are indistinguishable from a shell, and every one of them was ALSO reported by graveyard-selfcheck as an
// orphaned utility -- because its only consumer was its own gate. One main block answers both: the tool becomes
// runnable by a person, and it acquires a caller that is not a test.

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    // THE CANDIDATES COME FROM orphanScan, WHICH IS THE ONLY THING THAT KNOWS THEM. Deriving them here would be
    // a second definition of "what is an orphan" -- the defect this tree has found in nine files, three and four.
    const { orphanScan } = await import("./orphanScan.mjs");
    const scan = orphanScan(ENGROOT);
    const candidates = (scan.candidates || []).map((c) => (typeof c === "string" ? c : (c.file || c.path)));
    const r = orphanBaselineHygiene(ENGROOT, candidates);
    // THE FIELDS ARE ARRAYS, NOT COUNTS -- my first version printed them straight and produced a comma-joined
    // list where a number belonged. THE NAMES DID NOT SAY WHICH, and reading the shape took one probe.
    console.log("[baselineHygiene] " + r.entries.length + " baseline entries: " + r.live.length + " live, " +
                r.stale.length + " STALE, " + r.missing.length + " missing.");
    if (r.stale.length) {
        console.log("[baselineHygiene] STALE, DELETE THESE -- each names something that is no longer an orphan:");
        for (const e of r.stale) console.log("      " + (typeof e === "string" ? e : JSON.stringify(e)));
    }
    console.log("[baselineHygiene] A STALE SUPPRESSION IS AN ACTIVE BLIND SPOT -- if the thing it names becomes a");
    console.log("[baselineHygiene] real orphan again the entry silently swallows it. THE RIGHT RESPONSE IS DELETION, NOT LOOSENING.");
}
