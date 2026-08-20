// tools/fingerprint/observableCompare-selfcheck.mjs
//
// Run: node tools/fingerprint/observableCompare-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2927 -- ITEM 4, CLOSED: the fleet now compares MEASURED PHYSICS, not just the 50 subsystem hashes.
//
// The audit of item 4 found that the pieces were nearly all there and had been since the v2916 baseline merge:
// peerReport re-measures every baselined observable with the libm tripwire armed and carries each with its
// portability PREDICTION. What was missing was two wires: localFingerprint() never called peerReport (so no peer
// emitted observables), and compareFingerprints() only diffed hashes (so nothing compared them). Both are now
// connected, and fingerprint.html renders the result under the hash table.
//
// This gate tests the comparison logic directly with synthetic peers, because the real path needs two live
// machines and the point is the VERDICT RULE, not the transport.

import fp from "../../ai-bridge/fingerprintBridge.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const { compareFingerprints } = fp;

// two peers agreeing on hashes; the observable verdict is the new thing
const peer = (url, master, obs) => ({ url, ok: true, arch: "x64", master, subsystems: [{ name: "strict-libm", hash: master }], observables: obs });
const o = (id, bits, portable, kind = "keyed") => ({ id, bits, value: 1, portable, kind });

// ---- 1. THE HASH PATH IS UNTOUCHED -----------------------------------------------------------------------------------
{
    const c = compareFingerprints([peer("a", "H1", []), peer("b", "H1", [])]);
    ok("hash comparison still works and observables are simply empty when peers carry none",
        c.masterAgree === true && Array.isArray(c.observables) && c.observables.length === 0,
        "two hash-only peers agree, and the observable block stays dark rather than erroring -- older peers that " +
        "predate the v2916 merge still compare cleanly");
}

// ---- 2. AGREEMENT ON A PORTABLE OBSERVABLE IS THE EXPECTED CASE -------------------------------------------------------
{
    const c = compareFingerprints([
        peer("a", "H1", [o("quantum-well-ratio21", "3ff0", true)]),
        peer("b", "H1", [o("quantum-well-ratio21", "3ff0", true)]),
    ]);
    const v = c.observables.find((x) => x.id === "quantum-well-ratio21");
    ok("!! a portable observable that agrees across the fleet reads 'agree-as-predicted'",
        v && v.verdict === "agree-as-predicted" && c.observableBreaks.length === 0,
        "the fleet reproduced a number the libm tripwire said it would -- the prediction held, which is the " +
        "quiet, expected outcome and the whole point of pinning it");
}

// ---- 3. THE HEADLINE: A PORTABLE OBSERVABLE THAT DIVERGED IS A BROKEN PREDICTION --------------------------------------
{
    const c = compareFingerprints([
        peer("a", "H1", [o("edge-first-fringe", "AAAA", true)]),
        peer("b", "H1", [o("edge-first-fringe", "BBBB", true)]),   // same hash master, DIFFERENT observable bits
    ]);
    const v = c.observables.find((x) => x.id === "edge-first-fringe");
    ok("!! the fleet can agree on every HASH and still break on the measured physics",
        c.masterAgree === true && v.verdict === "DIVERGED-BROKEN-PREDICTION",
        "master hashes identical, edge-first-fringe bits differ -- this is invisible to the 50-subsystem view " +
        "and is exactly the gap item 4 existed to close: the hashes cover 50 computations, the physics baseline " +
        "covers others the fingerprint never hashed");
    ok("...and it is surfaced as a headline break, not buried in a table",
        c.observableBreaks.length === 1 && c.observableBreaks[0].id === "edge-first-fringe",
        "observableBreaks is the field the page turns red on");
}

// ---- 4. AN UNPORTABLE OBSERVABLE THAT DIVERGES WAS PREDICTED TO -------------------------------------------------------
{
    const c = compareFingerprints([
        peer("a", "H1", [o("chaos-delta-spread", "AAAA", false, "artefact")]),
        peer("b", "H1", [o("chaos-delta-spread", "CCCC", false, "artefact")]),
    ]);
    const v = c.observables.find((x) => x.id === "chaos-delta-spread");
    ok("!! chaos-delta-spread diverging is 'as predicted', NOT a break",
        v.verdict === "diverged-as-predicted" && c.observableBreaks.length === 0,
        "v2905 measured this moves 110x under a one-ulp libm shift, so it was pinned as NOT portable. Two " +
        "machines disagreeing on it confirms the prediction rather than violating it -- the grader must not cry " +
        "wolf on the one observable the lab already knows is machine-dependent");
}

// ---- 5. INSUFFICIENT PEERS IS STATED, NOT GUESSED --------------------------------------------------------------------
{
    const c = compareFingerprints([peer("a", "H1", [o("isco-schwarzschild", "AAAA", true)])]);
    // one peer carries the observable, but withObs needs >= 2 to compare, so the block is empty rather than
    // declaring agreement with itself
    ok("a single observable-bearing peer yields no false 'agreement'",
        c.observables.length === 0,
        "one peer cannot agree with the fleet; the comparison needs two, and says nothing rather than something wrong");
}

console.log();
if (fails) { console.log("observableCompare-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("observableCompare-selfcheck: all checks pass");
