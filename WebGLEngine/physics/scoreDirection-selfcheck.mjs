// WebGLEngine/physics/scoreDirection-selfcheck.mjs -- v3594
// ---------------------------------------------------------------------------------------------------------------
// THE PROPOSER LOOP HAD TWO UNDECLARED PROPERTIES AND BOTH WERE BEING VIOLATED.
//
// (1) DIRECTION. runProposer sorts DESCENDING and takes scored[0], so a bigger score is a better candidate.
//     Every proposer registered before v3591 follows it -- 1/N, 1/T, 1/reps, 1/L, dt, all CHEAPNESS -- and
//     nothing anywhere said so. gyroKnob and pileKnob returned an ERROR, which is smaller-is-better, so the
//     loop handed the adjudicator the WORST candidate in the list on every run.
//
// (2) INDEPENDENCE, AND THIS IS THE ONE WORTH A GATE. proposers.mjs's header calls the separation between
//     score and adjudicate "the entire safety property": a proposer that could write its own verdict would
//     tune the verdict. Both offending scores READ the verdict -- `adjudicate(c).evidence.relErr` -- so the
//     search was optimising the number it exists to be graded by. THAT IS NOT VISIBLE IN ANY OUTPUT. The loop
//     runs, the report prints, every earlier gate stays green, and the adjudicator has quietly stopped being
//     a second opinion.
//
// *** SO THE INDEPENDENCE CHECK IS DRIVEN AND NOT READ. *** A source scan for the word "adjudicate" inside a
// score function would be prose-as-code, would miss an indirect call through a helper, and would trip over
// this file's own comments -- twenty-plus instances of that in this tree. Instead each proposer's adjudicate
// is REPLACED WITH A SPY and its score is called: if the spy fires, the score consulted the verdict. The plant
// is a score that does consult it, so the check is shown failing rather than only passing.
//
// (3) AND THE FINDING THAT MADE THE ROUND: runProposer adjudicated ONLY scored[0], so on all EIGHT registered
//     proposers -- not the two broken ones, ALL EIGHT -- its only possible answer was "refused", while a
//     passing candidate sat further down the list. The greedy pick is MEANT to be refused (the module's own
//     header records the HMC tuner's greedy optimum being 89x worse). A loop that reports only that reports
//     that the search failed and can never report what survived.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { pathToFileURL } from "node:url";
import { registerProposer, getProposer, listProposers, runProposer, resetRegistry, SCORE_IS_A_REWARD }
    from "./proposers.mjs";
import { registerAll } from "./knobRegistry.mjs";

let pass = 0, fail = 0;
const ok = (name, cond, note = "") => {
    if (cond) { pass++; console.log("  ok   " + name + (note ? "  -- " + note : "")); }
    else { fail++; console.log("  FAIL " + name + (note ? "  -- " + note : "")); }
};
const section = (n) => console.log("\n== " + n + " ==");

// ---------------------------------------------------------------------------------------------------------------
section("1. DIRECTION: the sort is a maximisation, driven on a synthetic proposer");
// A candidate list whose scores are deliberately NOT in offer order, so a loop that ignored the sort and took
// candidates[0] would pass a weaker test and fail this one.
{
    resetRegistry();
    const SCORES = { a: 1, b: 9, c: 5 };
    registerProposer({
        id: "dir-probe", knobs: ["x"],
        propose: () => ["a", "b", "c"],
        score: (c) => SCORES[c],
        adjudicate: (c) => ({ pass: true, evidence: { c } }),
    });
    const r = runProposer("dir-probe");
    ok("best is the ARGMAX and not the argmin", r.best === "b", "best=" + r.best + " scores a1 b9 c5");
    ok("best is not merely the first offered", r.best !== "a");
    ok("scored[] is in descending score order",
       r.scored.map((s) => s.score).join(",") === "9,5,1", r.scored.map((s) => s.score).join(","));
    ok("SCORE_IS_A_REWARD states the direction", /HIGHER IS BETTER/.test(SCORE_IS_A_REWARD.direction));
}

// ---------------------------------------------------------------------------------------------------------------
section("2. THE FIRST PASSING CANDIDATE IN SCORE ORDER, and the cost of finding it");
{
    resetRegistry();
    const SCORES = { hi: 9, mid: 5, lo: 1 };
    let calls = 0;
    registerProposer({
        id: "accept-probe", knobs: ["x"],
        propose: () => ["hi", "mid", "lo"],
        score: (c) => SCORES[c],
        adjudicate: (c) => { calls++; return { pass: c === "mid", evidence: { c } }; },
    });
    const r = runProposer("accept-probe");
    ok("accepted is the first PASSING candidate in score order", r.accepted === "mid", "accepted=" + r.accepted);
    ok("acceptedRank is its position in the sorted list", r.acceptedRank === 1, "rank=" + r.acceptedRank);
    ok("acceptedScore is that candidate's score", r.acceptedScore === 5);
    ok("acceptedVerdict passes", r.acceptedVerdict && r.acceptedVerdict.pass === true);
    ok("it STOPS at the first pass rather than sweeping", calls === 2 && r.adjudicated === 2,
       "adjudications=" + calls + " of 3 candidates");
    // The old fields must mean exactly what they meant before, because three existing gates read them.
    ok("best/verdict still describe the GREEDY pick", r.best === "hi" && r.verdict.pass === false);
    ok("adopted is unchanged (tier 'propose' never adopts)", r.adopted === false);
}
{
    // THE NO-EXTRA-COST CLAIM, MEASURED RATHER THAN ASSERTED: when the greedy pick passes, exactly one
    // adjudication runs, so this change is free on every proposer whose search already succeeded.
    resetRegistry();
    let calls = 0;
    registerProposer({
        id: "cheap-probe", knobs: ["x"],
        propose: () => ["hi", "mid", "lo"],
        score: (c) => ({ hi: 9, mid: 5, lo: 1 }[c]),
        adjudicate: (c) => { calls++; return { pass: true, evidence: { c } }; },
    });
    const r = runProposer("cheap-probe");
    ok("a passing greedy pick costs ONE adjudication, as before", calls === 1 && r.adjudicated === 1);
    ok("accepted is the greedy pick at rank 0", r.accepted === "hi" && r.acceptedRank === 0);
}
{
    // EVERY CANDIDATE REFUSED IS A REAL OUTCOME AND NOT AN ERROR: the proposer offered nothing this
    // instrument's own key will stand behind, and a null that said so is more use than a throw.
    resetRegistry();
    registerProposer({
        id: "none-probe", knobs: ["x"],
        propose: () => ["a", "b"],
        score: (c) => (c === "a" ? 2 : 1),
        adjudicate: (c) => ({ pass: false, evidence: { c, why: "nothing here is good enough" } }),
    });
    const r = runProposer("none-probe");
    ok("accepted is null when everything is refused", r.accepted === null && r.acceptedRank === -1);
    ok("and it did sweep the whole list before saying so", r.adjudicated === 2);
    ok("every scored row carries its own verdict", r.scored.every((s) => s.verdict && s.verdict.pass === false));
}

// ---------------------------------------------------------------------------------------------------------------
section("3. INDEPENDENCE: no registered score may consult its own adjudicator (DRIVEN, with a spy)");
// The spy replaces adjudicate on the live registry entry, so what is tested is the function the loop will
// actually call -- not a copy, and not the source text.
function spyScore(id, candidate, opts = {}) {
    const p = getProposer(id);
    const real = p.adjudicate;
    let fired = 0;
    p.adjudicate = (...a) => { fired++; return real(...a); };
    let threw = null;
    try { p.score(candidate, opts); } catch (e) { threw = e; }
    p.adjudicate = real;
    return { fired, threw };
}
{
    resetRegistry();
    registerAll();
    const all = listProposers();
    ok("the registry is non-empty, so this section is not vacuous", all.length >= 8, all.length + " proposers");
    const consulted = [];
    for (const p of all) {
        const cand = getProposer(p.id).propose({})[0];
        const { fired, threw } = spyScore(p.id, cand);
        if (threw) { ok("score(" + p.id + ") runs without throwing", false, String(threw.message)); continue; }
        if (fired > 0) consulted.push(p.id + "(" + fired + ")");
    }
    ok("NO score consults its own adjudicator", consulted.length === 0,
       consulted.length ? "CONSULTED: " + consulted.join(", ") : "checked " + all.length + " proposers");
    ok("SCORE_IS_A_REWARD states the independence rule",
       /must not call its own adjudicate/i.test(SCORE_IS_A_REWARD.independence));
}
{
    // THE PLANT, so the green above is not a check that cannot fail. This IS the shape gyroKnob and pileKnob
    // shipped: a score that returns the adjudicator's own error.
    resetRegistry();
    registerProposer({
        id: "plant-verdict-score", knobs: ["x"],
        propose: () => [1, 2],
        score: (c) => getProposer("plant-verdict-score").adjudicate(c).evidence.relErr,
        adjudicate: (c) => ({ pass: c > 1, evidence: { relErr: 1 / c } }),
    });
    const { fired } = spyScore("plant-verdict-score", 1);
    ok("PLANT: a verdict-derived score IS caught by the spy", fired === 1, "spy fired " + fired + " time(s)");
}

// ---------------------------------------------------------------------------------------------------------------
section("4. THE TWO CORRECTED KNOBS, driven end to end");
{
    resetRegistry();
    registerAll();

    const g = runProposer("gyro-spin");
    ok("gyro-spin's greedy pick is the SLOWEST spin (score = precession rate)", g.best === 2,
       "best=" + g.best + " score=" + g.bestScore.toFixed(4));
    ok("gyro-spin's greedy pick is REFUSED, which is the tension the loop is for", g.verdict.pass === false,
       "relErr=" + (g.verdict.evidence.relErr ?? NaN).toFixed(4) + " tol=" + g.verdict.evidence.tol);
    ok("gyro-spin now REPORTS a spin that survives adjudication", g.accepted !== null,
       "accepted omega=" + g.accepted);
    ok("and the accepted spin is faster than the greedy one", g.accepted > g.best);

    const s = runProposer("pile-friction");
    ok("pile-friction's greedy pick is the ROUGHEST surface (score = mu)", s.best === 1.3,
       "best=" + s.best);
    ok("pile-friction's greedy pick is REFUSED (a cube topples at tan = 1)", s.verdict.pass === false);
    ok("pile-friction now REPORTS a mu that survives adjudication", s.accepted !== null,
       "accepted mu=" + s.accepted);
    ok("and the accepted mu is below the topple boundary", s.accepted < 1);

    // Neither score may return the adjudicator's error any more -- checked by VALUE, since the two quantities
    // are now different numbers, which is a second and independent way of saying the same thing as section 3.
    const gp = getProposer("gyro-spin"), sp = getProposer("pile-friction");
    ok("gyro score is NOT the adjudicator's relErr",
       gp.score(20) !== gp.adjudicate(20).evidence.relErr);
    ok("pile score is NOT the adjudicator's relErr",
       sp.score(0.3) !== sp.adjudicate(0.3).evidence.relErr);
}

// ---------------------------------------------------------------------------------------------------------------
section("5. THE CENSUS -- REPORTED, NOT FROZEN");
// *** A COUNT OF HOW MANY GREEDY PICKS ARE REFUSED IS A ROUND'S OUTCOME AND NOT A PROPERTY. *** Today it is
// eight of eight, which is the finding; if somebody later writes a score whose optimum the key accepts, that
// is PROGRESS and a frozen count would call it a failure -- the species this tree has committed twenty-three
// times. What is asserted is the property that makes the loop honest: wherever a passing candidate exists, the
// loop now names it.
// ANTIDOTE, IN ADVANCE (v3196's idiom): if a proposer is ever added whose candidates ALL fail, this section's
// last check goes red. It should then be rewritten to assert that the loop REPORTS accepted:null for that
// proposer by name -- not weakened, and not deleted, because "the search found nothing" is a real answer and
// the thing that must never happen is it being indistinguishable from "the loop only looked at one candidate".
{
    resetRegistry();
    registerAll();
    const rows = listProposers().map((p) => ({ id: p.id, r: runProposer(p.id) }));
    const greedyRefused = rows.filter((x) => !x.r.verdict.pass);
    const haveAccepted = rows.filter((x) => x.r.accepted !== null);
    console.log("     greedy pick refused: " + greedyRefused.length + " of " + rows.length +
                "   |   a passing candidate exists: " + haveAccepted.length + " of " + rows.length);
    for (const x of rows)
        console.log("       " + x.id.padEnd(17) + " greedy " + JSON.stringify(x.r.best).padEnd(12) +
                    (x.r.verdict.pass ? "PASS   " : "refused") +
                    "  -> accepted " + JSON.stringify(x.r.accepted) + " (rank " + x.r.acceptedRank +
                    ", " + x.r.adjudicated + " adjudications)");
    ok("every proposer reports a coherent accepted/rank pair",
       rows.every((x) => (x.r.accepted === null) === (x.r.acceptedRank === -1)));
    ok("an accepted candidate always carries a PASSING verdict",
       rows.every((x) => x.r.accepted === null || x.r.acceptedVerdict.pass === true));
    ok("where the greedy pick is refused, the loop still names a survivor",
       greedyRefused.every((x) => x.r.accepted !== null),
       greedyRefused.length + " refused, " + greedyRefused.filter((x) => x.r.accepted !== null).length +
       " with a survivor named");
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
