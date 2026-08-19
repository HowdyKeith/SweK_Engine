// WebGLEngine/tools/roundhouse/externalLinalg-selfcheck.mjs -- v3687
//
// Run: node tools/roundhouse/externalLinalg-selfcheck.mjs   (~1s)
//
// *** THE DANGEROUS OBJECT IN THIS ROUND IS THE GRADER, NOT THE REFERENCE. *** A grader that returns "pass" when
// the external answers are missing would certify whatever it is handed, forever, on every machine that is not a
// Mac -- which is every machine this engine's gates run on. So the first thing checked is that ABSENT IS NOT
// PASS, and the rest is checked against FIXTURE answer files written here, because LAPACK cannot run in this
// sandbox and a check that needs it would skip in exactly the situation it exists to guard.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { grade, ours, problems, toleranceFor, EPS, writeProblemsText } from "./externalLinalg.mjs";
import { ctrbMatrix, rank } from "../../physics/control/controlStateSpace.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);
const tmp = (obj) => {
    const f = path.join(os.tmpdir(), "exlin-" + Math.random().toString(36).slice(2) + ".json");
    fs.writeFileSync(f, JSON.stringify(obj)); return f;
};

console.log("externalLinalg-selfcheck -- the grader, and whether it can be fooled\n");

// ---- 1. ABSENT IS NOT PASS. This is the whole safety property. --------------------------------------------------
{
    const g = grade(path.join(os.tmpdir(), "definitely-not-here-" + Date.now() + ".json"));
    ok("!! *** a missing reference reports ABSENT, never agreement ***", g.state === "absent",
        "state=" + g.state + ". A grader that passed with no reference on disk would certify whatever it was " +
        "handed, on every machine that is not a Mac -- which is every machine these gates run on. IT WOULD LOOK " +
        "LIKE CORROBORATION AND BE NOTHING.");
    ok("...and it says so in words a reader will act on", /NOT A PASS/.test(g.why || ""),
        "the state is for the code; the sentence is for the person reading a green run and wondering what it proved");
}

// ---- 2. THE PROBLEMS ARE THE LAB'S OWN MATRICES, NOT NICE ONES INVENTED HERE ------------------------------------
{
    const ps = problems();
    const ctrb = ps.find((p) => p.name === "double-integrator.ctrb");
    const direct = ctrbMatrix([[0, 1], [0, 0]], [[0], [1]]);
    ok("!! the exported matrix IS the one the engine's own verdict rests on",
        JSON.stringify(ctrb.M) === JSON.stringify(direct),
        "it comes from ctrbMatrix, the same call controllability is decided by. INVENTING A TIDY SET OF " +
        "MATRICES WOULD GRADE A PROGRAM NOBODY RUNS -- the reference has to answer the question actually asked.");
    ok("...and the set contains an ILL-CONDITIONED case on purpose",
        ps.some((p) => p.name.startsWith("hilbert4")),
        "a Hilbert matrix is where 'the two agree to 1e-12' becomes a claim about the PROBLEM rather than about " +
        "either solver, and where a fixed tolerance would be dishonest");
    say("problems exported: " + ps.length + "   claims: " + [...new Set(ps.map((p) => p.claim))].join(", "));
}

// ---- 3. THE GRADER CATCHES A WRONG ANSWER, AND THE INTEGER CLAIM GETS NO TOLERANCE ------------------------------
{
    const truth = ours();
    const good = tmp({ answers: truth.map((o) => ({ name: o.name, claim: o.claim, value: o.value })) });
    ok("!! an honest reference agrees across every problem", grade(good).state === "agrees",
        "if this failed, the two implementations disagree about something and THAT is the finding");

    const rk = truth.find((o) => o.claim === "rank");
    const bad = tmp({ answers: truth.map((o) => (o === rk ? { ...o, value: o.value + 1 } : { name: o.name, claim: o.claim, value: o.value })) });
    const gb = grade(bad);
    ok("!! *** a rank off by ONE is a disagreement, with no tolerance to hide in ***",
        gb.state === "disagrees" && gb.disagreements.some((d) => d.name === rk.name),
        "rank decides controllability, and it is an INTEGER: two float answers agreeing to 1e-12 can always be " +
        "an accident of tolerance, but an integer agreeing across ELIMINATION and the SINGULAR VALUE SPECTRUM " +
        "cannot. That is why this comparison is worth more than the determinant one beside it.");

    const missing = tmp({ answers: truth.filter((o) => o.claim !== "rank").map((o) => ({ name: o.name, claim: o.claim, value: o.value })) });
    ok("...and an answer file that simply OMITS the hard problems does not pass either",
        grade(missing).state === "disagrees",
        "a reference that skips what it found difficult is the same failure as one that gets it wrong, and it " +
        "is the easier of the two to ship by accident");
}

// ---- 4. THE TOLERANCE IS DERIVED, AND IT IS NOT DOING THE WORK --------------------------------------------------
{
    const detRow = ours().find((o) => o.claim === "det");
    const t = toleranceFor(detRow);
    ok("!! the float tolerance is built from EPS and the problem's size, not typed",
        t > 0 && t < 1e-9 && Number.isFinite(t),
        "tol=" + t.toExponential(3) + " for " + detRow.name + " (rows " + detRow.rows + ", EPS=" +
        EPS.toExponential(2) + "). A TYPED 1e-9 WOULD PASS THE EASY MATRICES AND FAIL THE HARD ONE FOR A REASON " +
        "THAT HAS NOTHING TO DO WITH EITHER SOLVER BEING WRONG.");
    ok("...and a rank claim carries NO tolerance at all",
        (() => { const r = ours().find((o) => o.claim === "rank");
                 const g = grade(tmp({ answers: [{ name: r.name, claim: "rank", value: r.value + 1 }] }));
                 return g.disagreements.some((d) => d.name === r.name); })(),
        "adding one to an integer is not within any tolerance, and the grader must not invent one for it");
}

// ---- 5. WHAT HAS NOT HAPPENED, SAID PLAINLY --------------------------------------------------------------------
{
    const f = writeProblemsText(path.join(os.tmpdir(), "exlin-problems-" + Date.now() + ".txt"));
    const txt = fs.readFileSync(f, "utf8").trim().split("\n");
    ok("!! the exchange file is FLAT TEXT the C side cannot mis-parse",
        Number(txt[0]) === problems().length && /^[\w.-]+ (rank|det) \d+ \d+$/.test(txt[1]),
        "problems go out as text because A JSON PARSER HAND-WRITTEN IN C WOULD BE THE LEAST TRUSTWORTHY LINK IN " +
        "A CHAIN WHOSE WHOLE PURPOSE IS TRUST -- a reference that mis-reads its input produces a disagreement " +
        "indistinguishable from a real one. Answers come back as JSON, which printf cannot get wrong.");
    say("*** LAPACK HAS NOT RUN. *** No Accelerate, no clang, no Apple hardware here, so the outside half of " +
        "this key is UNEXERCISED and the corroboration it promises DOES NOT YET EXIST. Everything above tests " +
        "the grader against fixtures; only a Mac can test the reference. See external-linalg.c's header.");
}

if (fails) { console.log("\nexternalLinalg-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\nexternalLinalg-selfcheck: all checks pass");
