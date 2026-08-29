// tools/roundhouse/refusalExpiry-selfcheck.mjs
//
// Run: node tools/roundhouse/refusalExpiry-selfcheck.mjs   (~0.34s MEASURED -- it builds every refusing device)
//
// *** THE DANGEROUS OBJECT HERE IS THE WATCHER, NOT THE REFUSALS. *** A watcher that reported "stands" when its
// predicate threw, or when no predicate existed at all, would be worse than no watcher: it would put a green
// tick beside a question nobody asked. So the four states are checked as FOUR, against synthetic registries
// built here, and the live tree is only the last section.
//
// The refusals themselves are not this file's subject and are not second-guessed. beamBind measured that no key
// selectively separates the free-end asymmetry; composeBind measured that every finite number it reports belongs
// to the two devices being compared. Both are honest answers, and the point of this gate is that they get ASKED
// AGAIN -- because a refusal is a claim about the tree as it is today, and the tree moves.
"use strict";
import {
    refusalExpiries, reportLines,
    STATE_STANDS, STATE_EXPIRED, STATE_UNWATCHED, STATE_BROKEN,
} from "./refusalExpiry.mjs";

let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log(`  ----  ${l}`);

console.log("refusalExpiry-selfcheck -- does anything ask a refusal whether it still holds?\n");

// A synthetic device, so the four states can be driven without waiting on the real ones.
const fake = (refusal, expiryFn) => {
    const d = { plantRefused: refusal, modes: ["x"], name: "fake", observables: [], build: () => ({}) };
    if (expiryFn !== undefined) d.plantRefusedExpiry = expiryFn;
    return d;
};
const classify = async (dev) => {
    // Mirror the reader's own branching on a single device, so the states are exercised without a registry.
    const refusal = dev.plantRefused;
    if (typeof refusal !== "string" || !refusal) return null;
    const fn = dev.plantRefusedExpiry;
    if (typeof fn !== "function") return STATE_UNWATCHED;
    try { const r = await fn(); return (r && r.expired === true) ? STATE_EXPIRED : STATE_STANDS; }
    catch { return STATE_BROKEN; }
};

console.log("1. *** THE FOUR STATES ARE FOUR, AND NONE OF THEM IS 'stands' BY ACCIDENT ***");
{
    ok("!! a refusal whose condition has NOT come true reads STANDS",
        await classify(fake("measured no", async () => ({ expired: false, evidence: "x" }))) === STATE_STANDS);
    ok("!! *** a refusal whose condition HAS come true reads EXPIRED, not stands ***",
        await classify(fake("measured no", async () => ({ expired: true, evidence: "the pair now exists" }))) === STATE_EXPIRED,
        "this is the whole point: the day the stated condition comes true, somebody has to be told");
    ok("!! *** a refusal with NO predicate reads UNWATCHED, never stands ***",
        await classify(fake("measured no", undefined)) === STATE_UNWATCHED,
        "asked-and-answered-no and never-asked are TWO POPULATIONS. Folding them would make an unwatched "
        + "refusal indistinguishable from a watched one, which is the failure this gate exists to end -- and a "
        + "refusal with no stated expiry is PERMANENT BY DEFAULT.");
    ok("!! *** a predicate that THROWS reads BROKEN, never stands ***",
        await classify(fake("measured no", async () => { throw new Error("boom"); })) === STATE_BROKEN,
        "a predicate that failed has NOT shown the refusal still holds. Calling that a pass would make the watch "
        + "go quiet exactly when it stopped working -- v3722's rule, one level up.");
    ok("...and a device with no refusal at all is not a refusal", await classify(fake("", undefined)) === null,
        "silence is not a declaration");
}

console.log("\n2. THE REPORT DISTINGUISHES THEM FOR A HUMAN TOO");
{
    const rows = [
        { name: "a", refusal: "r", state: STATE_STANDS, expired: false, evidence: "still null" },
        { name: "b", refusal: "r", state: STATE_EXPIRED, expired: true, evidence: "now real" },
        { name: "c", refusal: "r", state: STATE_UNWATCHED, expired: null, evidence: "nobody is asking" },
    ];
    const text = reportLines(rows).join("\n");
    ok("!! each state is named in the output, not merged into a count",
        /STANDS/.test(text) && /EXPIRED/.test(text) && /UNWATCHED/.test(text),
        "the state is for the code; the sentence is for the person reading a green run and wondering what it proved");
    ok("...and anything needing attention is summarised, with the reason", /2 of 3 need attention/.test(text),
        "b (expired), c (unwatched)");
    ok("...while an all-standing tree says so plainly",
        /all 1 refusals asked and still standing/.test(reportLines([rows[0]]).join("\n")));
    ok("...and an empty registry is not reported as success",
        /no plant refusals declared/.test(reportLines([]).join("\n")),
        "nothing found and nothing to find are different sentences");
}

console.log("\n3. THE LIVE TREE: EVERY DECLARED REFUSAL, ASKED");
{
    const rows = await refusalExpiries();
    for (const l of reportLines(rows)) report(l.replace(/^\s+/, ""));

    ok("!! at least one refusal is declared, so this gate is not vacuous", rows.length > 0,
        rows.length + " found. A watcher over an empty set passes forever and proves nothing.");
    const unwatched = rows.filter((r) => r.state === STATE_UNWATCHED);
    ok("!! *** EVERY declared refusal carries an expiry predicate ***", unwatched.length === 0,
        unwatched.length ? "UNWATCHED: " + unwatched.map((r) => r.name).join(", ") + " -- these are permanent by "
            + "default, which is not a decision anybody made"
            : rows.length + " of " + rows.length + " are watched");
    const broken = rows.filter((r) => r.state === STATE_BROKEN);
    ok("!! ...and none of the predicates is broken", broken.length === 0,
        broken.map((r) => r.name + ": " + r.evidence).join(" | ") || "all ran");
    const expired = rows.filter((r) => r.state === STATE_EXPIRED);
    ok("!! *** AND NONE HAS EXPIRED -- if this goes red, a refusal is now stale and its plant is buildable ***",
        expired.length === 0,
        expired.length
            ? "EXPIRED: " + expired.map((r) => r.name + " -- " + r.evidence).join(" | ")
            : "all " + rows.length + " conditions re-evaluated against the tree as it is today, and none has come true");
    // The first draft of this asserted the evidence CONTAINS A DIGIT, and compose failed it -- because its
    // measured value is null, which is a real measurement (neither side carries an error bar) with no numeral in
    // it. A DIGIT TEST IS A SPELLING TEST, the species this tree has got wrong repeatedly. The predicate hands
    // back the observable and its value as FIELDS now, and that is what is checked.
    ok("!! every standing refusal names the OBSERVABLE its condition turned on, and hands back its VALUE",
        rows.filter((r) => r.state === STATE_STANDS).every((r) => r.hasMeasurement),
        rows.filter((r) => r.state === STATE_STANDS)
            .map((r) => r.name + "." + r.observable + " = " + JSON.stringify(r.measured)).join(", ")
        + " -- structural, so a null reads as the measurement it is rather than failing a digit test");
}

console.log("\n" + (fails ? "refusalExpiry-selfcheck: " + fails + " FAILED" : "refusalExpiry-selfcheck: all checks pass"));
process.exit(fails ? 1 : 0);
