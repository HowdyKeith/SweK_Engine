// tools/ship/loopTrace.mjs -- v3750
//
// *** STEP 6 OF THE SIX, AND THE LAST. A trace is not a log of what worked -- IT IS THE RECORD THAT MAKES
// REWARD HACKING VISIBLE AFTERWARDS, which is the one failure the whole plan is built around (v3742's reading
// of the tennis-XGBoost run). So the design points are all about what it REFUSES to leave out. ***
//
// (1) *** IT RECORDS REJECTIONS. A trace of accepted attempts only is A HIGHLIGHT REEL, NOT A RECORD, and it
//     is precisely the shape that hides a search circling the bar: fifty attempts landing one iteration under
//     the floor look like nothing at all if only the winner is written down. ***
// (2) *** IT IS APPEND-ONLY, ASSERTED BY MECHANISM -- no splice, no pop, no delete, no unlink anywhere in the
//     module. A TRACE THAT CAN BE REWRITTEN IS NOT A TRACE. ***
// (3) *** EVERY ENTRY CARRIES THE RULE THAT JUDGED IT -- the floor in force and the holdout peek count at that
//     moment. A trace that records only outcomes cannot answer "did the bar move during the run?", and that
//     question is the whole reason to keep one. ***
//
// AND THE SUMMARY IS THE POINT, NOT THE STORAGE. summarise() names three shapes a reader would otherwise have
// to notice by eye, all of them measurable and none of them a verdict:
//   NEAR-MISSES  -- rejected gains within 1 iteration of the floor. A SEARCHER CIRCLING THE BAR.
//   BARE PASSES  -- accepted gains sitting EXACTLY at the floor. Winning by the minimum, repeatedly.
//   FLOOR DRIFT  -- the floor in force changing across the run. The bar itself moved.
// *** NONE OF THESE IS EVIDENCE OF CHEATING AND THE MODULE DOES NOT SAY IT IS. They are the things worth
// LOOKING AT, and naming them is what a person needs in order to look. ***

const _entries = [];

/**
 * Record one attempt. `what` is the caller's description of the change tried -- REQUIRED, because an
 * unattributed attempt is a row nobody can act on, and a trace of anonymous deltas is a spreadsheet.
 */
export function record(what, verdict) {
    if (typeof what !== "string" || !what.trim()) {
        throw new Error("loopTrace.record(what, verdict): `what` is required -- an attempt nobody can name is " +
                        "a row nobody can act on. Describe the change that was tried.");
    }
    const ev = verdict && verdict.eval ? verdict.eval : verdict || {};
    _entries.push(Object.freeze({
        n: _entries.length,
        what: what.trim(),
        accept: !!(verdict && verdict.accept),
        why: (verdict && verdict.why) || "",
        gain: typeof ev.gain === "number" ? ev.gain : null,
        floor: typeof ev.floor === "number" ? ev.floor : null,
        holdout: verdict && verdict.holdout ? verdict.holdout.map((r) => ({ id: r.id, delta: r.delta, regressed: r.regressed })) : null,
        peeks: typeof (verdict && verdict.peeks) === "number" ? verdict.peeks : null,
    }));
    return _entries[_entries.length - 1];
}

/** The whole record, oldest first. A COPY -- the caller cannot reach in and edit history. */
export function entries() { return _entries.slice(); }
export function resetTrace() { _entries.length = 0; }   // fixtures only; a real run never calls this

/** JSON Lines, so a caller can persist it. THE MODULE ITSELF WRITES NO FILE -- where a trace lives is the
 *  caller's decision, and a tool that picks a path for you is one you have to fight later. */
export function toJSONL() { return _entries.map((e) => JSON.stringify(e)).join("\n"); }

/**
 * *** THE THREE SHAPES WORTH LOOKING AT. Each is COUNTED AND THE ROWS ARE NAMED -- a count with no rows is a
 * number nobody can check, which is the shape this tree keeps finding in its own censuses. ***
 */
export function summarise() {
    const all = entries();
    const accepted = all.filter((e) => e.accept);
    const rejected = all.filter((e) => !e.accept);
    const withGain = (rows) => rows.filter((e) => typeof e.gain === "number" && typeof e.floor === "number");

    // *** THE FIRST VERSION OF THIS TEST WAS `e.gain > 0 && e.floor - e.gain <= 1`, AND THE WORKED EXAMPLE
    // EXPOSED IT IMMEDIATELY: an attempt with gain 6 against floor 3 was counted a NEAR-MISS because 3-6 = -3
    // is also <= 1. It had CLEARED the bar by double and was rejected BY THE HOLDOUT. A near-miss means JUST
    // UNDER THE BAR; a holdout veto is a different rejection entirely, and conflating them would have inflated
    // the one count whose whole job is to look suspicious. TWO THINGS WEARING ONE LABEL, in the summary built
    // to make things visible. FOUND BY READING THE OUTPUT, NOT BY TRUSTING IT. ***
    const nearMisses = withGain(rejected).filter((e) => e.gain > 0 && e.gain < e.floor && e.floor - e.gain <= 1);
    const barePasses = withGain(accepted).filter((e) => e.gain === e.floor);
    const floors = [...new Set(all.map((e) => e.floor).filter((f) => typeof f === "number"))];
    const vetoed = rejected.filter((e) => /HOLDOUT VETO/.test(e.why));

    return {
        attempts: all.length, accepted: accepted.length, rejected: rejected.length,
        nearMisses: nearMisses.length, nearMissRows: nearMisses.map((e) => e.n + ":" + e.what),
        barePasses: barePasses.length, barePassRows: barePasses.map((e) => e.n + ":" + e.what),
        vetoed: vetoed.length, vetoedRows: vetoed.map((e) => e.n + ":" + e.what),
        floorsSeen: floors, floorDrift: floors.length > 1,
        // *** NOT A VERDICT. The module reports; a person decides. Saying "suspicious" here would be the
        // checker grading intent, and intent is not something a counter can see. ***
        note: "counts, not conclusions -- near-misses and bare passes are worth READING, not acting on alone",
    };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
    resetTrace();
    // A worked example of the shape the summary is FOR: a search circling the bar and finally clearing it.
    record("widen the smoother window", { accept: false, why: "gain 1 is inside the noise floor 3", eval: { gain: 1, floor: 3 } });
    record("two extra pre-smooths", { accept: false, why: "gain 2 is inside the noise floor 3", eval: { gain: 2, floor: 3 } });
    record("skip the coarsest level", { accept: false, why: "HOLDOUT VETO on kindBlob (+9 > floor 5)", eval: { gain: 6, floor: 3 } });
    record("W-cycle instead of V", { accept: true, why: "36 -> 31", eval: { gain: 5, floor: 3 }, peeks: 4 });
    const s = summarise();
    console.log("[loopTrace] " + s.attempts + " attempts: " + s.accepted + " accepted, " + s.rejected + " rejected");
    console.log("[loopTrace]   NEAR-MISSES (rejected within 1 of the floor): " + s.nearMisses + "  " + s.nearMissRows.join(", "));
    console.log("[loopTrace]   BARE PASSES (accepted exactly at the floor):  " + s.barePasses);
    console.log("[loopTrace]   HOLDOUT VETOES: " + s.vetoed + "  " + s.vetoedRows.join(", "));
    console.log("[loopTrace]   floors seen: " + s.floorsSeen.join(", ") + "   drift: " + s.floorDrift);
    console.log("[loopTrace] " + s.note);
}
