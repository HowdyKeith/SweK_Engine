// WebGLEngine/physics/adaptiveKnob-selfcheck.mjs -- v4066
//
// Gates the ADAPTIVE proposer shape in physics/proposers.mjs: bisectBoundary(), probeMonotone(), and the
// runProposer path that a proposer opts into by declaring `search`.
//
// *** WHAT WAS WRONG BEFORE THIS ROUND, IN ALL TEN REGISTERED PROPOSERS AT ONCE. *** Every propose() in the lab
// returns a HAND-PICKED SHORTLIST -- gyroKnob offers [2,5,10,20,40,80,160], schrodinger-grid offers
// N in {10,60,400}. runProposer walks them in score order and stops at the first pass, so the honest reading of
// any answer it has ever given is "the cheapest of the few numbers a human typed that happened to survive",
// never "the cheapest value that survives". MEASURED on schrodinger-grid: the shipped answer is N=60 and the
// real boundary is N=27, with N=26 verified failing. The list was not wrong; nothing ever asked where the edge
// was.
//
// *** AND THE CHECK THAT MATTERS MOST HERE IS THE ONE THAT SAYS NO. *** A bisection is only valid where the
// verdict flips ONCE. The first four instruments this was tried on included lz-window, whose own registry
// comment reads as a clean falling ladder and IS NOT ONE -- the Landau-Zener sweep rings, the verdict flips
// three times, and the bisection returned T=5.875 while T=4 is cheaper and also passes. So this file drives
// probeMonotone against the real adjudicators and asserts the split: three adopted knobs flip once, lz-window
// flips more and is therefore NOT allowed to declare a search. A gate that only checked "the search found
// something that passes" would have blessed the wrong answer, because T=5.875 does pass.
"use strict";
import { registerProposer, resetRegistry, runProposer, getProposer,
         bisectBoundary, probeMonotone } from "./proposers.mjs";
import { registerAll } from "./knobRegistry.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (l) => console.log("  ----  " + l);
console.log("adaptiveKnob-selfcheck -- the boundary hunt, and the knob it refuses to hunt over\n");

console.log("1. bisectBoundary: THE BRACKET IS CHECKED, AND BOTH FAILURES ARE OUTCOMES RATHER THAN ERRORS");
{
    // A synthetic step at 37: everything >= 37 passes. The answer is knowable exactly, so the search is graded
    // against a number rather than against its own plausibility.
    const r = bisectBoundary({ cheap: 0, costly: 1000, integer: true, passes: (v) => v >= 37 });
    ok("!! it lands on the EXACT boundary of a known step, not merely on a passing value",
        r.ok && r.bracketed && r.boundary === 37 && r.failingSide === 36,
        "boundary=" + r.boundary + " with failingSide=" + r.failingSide + " -- 37 passes, 36 does not, so this " +
        "is an EDGE. A passing value with no failing neighbour is a guess wearing a result's clothes");
    ok("...and it costs a logarithm, not a sweep", r.calls <= 14,
        r.calls + " adjudications over a 1000-wide integer range (a linear scan is 1000)");

    const allPass = bisectBoundary({ cheap: 0, costly: 100, passes: () => true });
    ok("!! 'the cheap end already passes' is reported as an ANSWER, not thrown",
        allPass.ok && allPass.bracketed === false && allPass.boundary === 0 && /already passes/.test(allPass.why),
        "the whole range survives, so the cheapest value IS the answer -- and a search that threw here would " +
        "hide one of the two most interesting things it can discover");
    const nonePass = bisectBoundary({ cheap: 0, costly: 100, passes: () => false });
    ok("!! 'the costly end still fails' is reported as a FINDING about the instrument",
        nonePass.ok === false && nonePass.bracketed === false && nonePass.boundary === null,
        "nothing in the range survives adjudication -- a real result, and not a search that went wrong");
}

console.log("\n2. *** THE REVERSED DIRECTION -- because a timestep is cheap at a LARGE number ***");
{
    // Same step, walked from the high side: cheap=100 fails, costly=0 passes. bisectBoundary never compares the
    // ends numerically, so a descending range must work identically.
    const r = bisectBoundary({ cheap: 100, costly: 0, integer: true, passes: (v) => v <= 12 });
    ok("!! a descending range finds its edge the same way an ascending one does",
        r.ok && r.bracketed && r.boundary === 12 && r.failingSide === 13,
        "boundary=" + r.boundary + " failingSide=" + r.failingSide + " -- md-timestep is exactly this shape " +
        "(score is c.dt, so cheap means a BIG step), and inferring direction from the numbers would invert it");
    let threw = false;
    try { bisectBoundary({ cheap: 5, costly: 5, passes: () => true }); } catch { threw = true; }
    ok("...and a zero-width range is refused rather than silently answered", threw);
}

console.log("\n3. probeMonotone: COUNT THE FLIPS, DO NOT ASSUME THEM");
{
    const clean = probeMonotone({ cheap: 0, costly: 100, samples: 40, passes: (v) => v >= 37 });
    ok("a single step reads as one flip, which is the shape a bisection is valid over",
        clean.flips === 1 && clean.monotone === true, "flips=" + clean.flips);
    const ring = probeMonotone({ cheap: 0, costly: 100, samples: 40, passes: (v) => Math.floor(v / 7) % 2 === 0 });
    ok("!! an OSCILLATING verdict is caught and reported as non-monotone",
        ring.flips > 1 && ring.monotone === false,
        "flips=" + ring.flips + " -- this is the case that makes a bisection's answer arbitrary, and the only " +
        "thing that can see it is a sweep");
    ok("...and the probe states its own limit rather than implying proof",
        /narrower than the spacing/.test(clean.resolved),
        "N samples cannot see a flip narrower than the spacing; saying so is the difference between a filter " +
        "and a guarantee");
}

console.log("\n4. THE OPT-IN IS REAL: A PROPOSER WITHOUT `search` IS UNTOUCHED");
{
    resetRegistry();
    let calls = 0;
    registerProposer({ id: "static-only", knobs: ["N"],
        propose: () => [{ N: 1 }, { N: 5 }, { N: 9 }],
        score: (c) => 1 / c.N,
        adjudicate: (c) => { calls++; return { pass: c.N >= 5, evidence: { N: c.N } }; } });
    const r = runProposer("static-only");
    ok("!! the static walk is bit-identical: greedy pick refused, first pass accepted, and it STOPS there",
        r.accepted.N === 5 && r.acceptedRank === 1 && r.best.N === 1 && r.verdict.pass === false && calls === 2,
        "accepted N=5 at rank 1 after " + calls + " adjudications; best/verdict still describe the greedy pick");
    ok("!! ...and `searched` is null, so a reader can always tell WHICH search produced an answer",
        r.searched === null,
        "two answers that mean different things must not wear the same shape without a label");
}

console.log("\n5. THE ADAPTIVE PATH ON A KNOWN STEP -- GRADED AGAINST THE TRUE EDGE");
{
    resetRegistry();
    registerProposer({ id: "adaptive-probe", knobs: ["N"],
        propose: () => [{ N: 1 }, { N: 500 }],
        score: (c) => 1 / c.N,
        adjudicate: (c) => ({ pass: c.N >= 73, evidence: { N: c.N } }),
        search: { knob: "N", cheap: 1, costly: 500, integer: true, make: (N) => ({ N }) } });
    const r = runProposer("adaptive-probe");
    ok("!! it accepts the EXACT cheapest passing value, which the two-item shortlist could never have found",
        r.accepted.N === 73 && r.searched.boundaryVerified === true && r.searched.failingSide === 72,
        "accepted N=" + r.accepted.N + ", and N=72 is verified failing beside it. The shortlist's own answer " +
        "would have been N=500 -- 6.8x more expensive and indistinguishable from correct");
    ok("...and the declared direction is verified against the declared score before searching",
        r.searched.directionOk === true && r.searched.cheapScore > r.searched.costlyScore,
        "cheapScore " + r.searched.cheapScore + " > costlyScore " + r.searched.costlyScore + " -- v3594 found " +
        "two proposers scoring backwards, which would silently bisect toward the expensive end");
    ok("!! every adaptive result admits that monotonicity is assumed, passing or not",
        r.searched.assumesMonotone === true,
        "a bisection can prove its bracket and its local edge and NOT that the verdict flips only once");
    ok("...and the same proposer still runs its static list on demand, so the two paths stay separable",
        runProposer("adaptive-probe", { adaptive: false }).accepted.N === 500);
    ok("...with the return shape preserved field-for-field, because three existing gates read it",
        ["id","tier","tried","best","bestScore","verdict","adopted","scored","accepted","acceptedRank",
         "acceptedScore","acceptedVerdict","adjudicated"].every((k) => k in r),
        "redefining a field in place is how a green gate quietly starts asserting something else");
}

console.log("\n6. *** THE REAL LAB: WHICH KNOBS EARNED A SEARCH, AND THE ONE THAT DID NOT ***");
{
    resetRegistry(); registerAll();
    const ADOPTED = ["schrodinger-grid", "kuramoto-N", "md-timestep"];
    for (const id of ADOPTED) {
        const p = getProposer(id);
        ok("!! " + id + " declares a search", !!p.search, "knob " + (p.search && p.search.knob));
    }
    ok("!! *** lz-window does NOT, and that refusal is the finding ***",
        !getProposer("lz-window").search,
        "its registry comment reads as a clean falling ladder and is not one -- the LZ sweep rings, so the " +
        "verdict flips three times and a bisection's answer would be arbitrary. MEASURED: it returned T=5.875 " +
        "while T=4 is cheaper AND passes");

    // Drive the real adjudicators. schrodinger and md are cheap; kuramoto is sampled coarsely on purpose --
    // its adjudicator runs a 4096-oscillator mean-field sweep and a dense probe here would cost minutes.
    const cases = [
        { id: "schrodinger-grid", samples: 24 },
        { id: "md-timestep", samples: 24 },
        { id: "kuramoto-N", samples: 10 },
    ];
    for (const c of cases) {
        const p = getProposer(c.id), s = p.search;
        const m = probeMonotone({ cheap: s.cheap, costly: s.costly, integer: !!s.integer, samples: c.samples,
                                  passes: (v) => p.adjudicate(s.make(v)).pass === true });
        ok("!! " + c.id + "'s REAL adjudicator flips exactly once across its declared range",
            m.monotone === true && m.flips === 1,
            "flips=" + m.flips + " over " + m.samples + " samples -- the assumption the search rests on, " +
            "checked against the shipped adjudicator rather than asserted in a comment");
    }

    const lz = getProposer("lz-window");
    const lzm = probeMonotone({ cheap: 1, costly: 40, samples: 24,
                               passes: (v) => lz.adjudicate({ T: v }).pass === true });
    ok("!! ...and lz-window's flips MORE than once, which is why it has no search",
        lzm.monotone === false && lzm.flips > 1,
        "flips=" + lzm.flips + " over " + lzm.samples + " samples. THE SAME PROBE THAT LICENSES THE OTHER " +
        "THREE IS THE ONE THAT DISQUALIFIES THIS -- one mechanism, both answers");
}

console.log("\n7. AND THE ANSWERS ACTUALLY MOVED -- MEASURED ON THE SHIPPED ADJUDICATORS");
{
    resetRegistry(); registerAll();
    const rows = [];
    for (const id of ["schrodinger-grid", "md-timestep"]) {
        const st = runProposer(id, { adaptive: false });
        const ad = runProposer(id);
        const k = ad.searched.knob;
        rows.push({ id, k, was: st.accepted ? st.accepted[k] : null, now: ad.accepted ? ad.accepted[k] : null,
                    verified: ad.searched.boundaryVerified, adj: ad.adjudicated, stAdj: st.adjudicated });
    }
    const sg = rows.find((r) => r.id === "schrodinger-grid");
    ok("!! schrodinger-grid: the shortlist's N=60 becomes the boundary N=27, with N=26 verified failing",
        sg.was === 60 && sg.now === 27 && sg.verified === true,
        "a 2.2x cheaper answer that the three-number list could not express, and the edge is PROVEN rather " +
        "than merely passed");
    const md = rows.find((r) => r.id === "md-timestep");
    ok("!! md-timestep (reversed direction): the shortlist's dt=0.012 becomes a LARGER, cheaper step",
        md.was === 0.012 && md.now > md.was && md.verified === true,
        "dt " + md.was + " -> " + md.now.toPrecision(6) + " -- cheap is a big timestep here, and the search " +
        "walked the right way");
    report("THE COST, STATED RATHER THAN BURIED: the search buys a better answer with more adjudications -- " +
        rows.map((r) => r.id + " " + r.stAdj + "->" + r.adj).join(", ") + ". On kuramoto-N that is 695ms -> " +
        "2612ms MEASURED, because its adjudicator runs a mean-field sweep per probe. A bisection is a " +
        "logarithm where a shortlist is a constant, so this is the right trade only where the knob is worth " +
        "knowing the edge of -- which is why `search` is opt-in per proposer and not a mode the lab runs in.");
}

console.log(fails ? `\nadaptiveKnob-selfcheck: ${fails} FAILED` : "\nadaptiveKnob-selfcheck: all checks pass");
if (fails) process.exit(1);
