// WebGLEngine/tools/roundhouse/externalLinalg-selfcheck.mjs -- v3687
//
// Run: node tools/roundhouse/externalLinalg-selfcheck.mjs   (~0.1s)
//
// *** THE DANGEROUS OBJECT IN THIS ROUND IS THE GRADER, NOT THE REFERENCE. *** A grader that returns "pass" when
// the external answers are missing would certify whatever it is handed, forever. So the first thing checked is
// that ABSENT IS NOT PASS, and the rest is checked against FIXTURE answer files written here.
//
// v3936: the fixtures are still the right way to test the GRADER -- they let it be handed a wrong answer on
// purpose, which a real reference will not do on request. What changed is the sentence that used to follow: this
// file said LAPACK "cannot run in this sandbox", and since the reference gained a Linux build line that is no
// longer true. The closing note ASKS the grader what state it is actually in rather than asserting one.
"use strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { grade, ours, problems, toleranceFor, EPS, writeProblemsText, ANSWER_FILE,
         solveIsDiscriminating } from "./externalLinalg.mjs";
import { ctrbMatrix, rank, cholesky } from "../../physics/control/controlStateSpace.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (l) => console.log("  ----  " + l);
// v3936 -- ONE PLACE THAT KNOWS THE SHAPE OF AN ANSWER. The fixtures below used to write { name, claim, value }
// by hand, which was right while every claim was a scalar. Adding solve made that silently DROP the vectors: the
// honest-reference fixture went red (correctly, and that is how this was found) and the omits-the-hard-problems
// fixture went GREEN FOR THE WRONG REASON -- it was asserting "disagrees" and getting it because every solve row
// had lost its answer, not because the rank rows were missing. A fixture builder that has to be updated in three
// places when a claim type is added will be updated in two.
const asAnswer = (o) => o.claim === "solve" ? { name: o.name, claim: o.claim, values: o.values }
    : o.claim === "chol" ? { name: o.name, claim: o.claim, definite: o.definite, values: o.values }
    : { name: o.name, claim: o.claim, value: o.value };

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
    const good = tmp({ answers: truth.map(asAnswer) });
    ok("!! an honest reference agrees across every problem", grade(good).state === "agrees",
        "if this failed, the two implementations disagree about something and THAT is the finding");

    const rk = truth.find((o) => o.claim === "rank");
    const bad = tmp({ answers: truth.map((o) => (o === rk ? { ...asAnswer(o), value: o.value + 1 } : asAnswer(o))) });
    const gb = grade(bad);
    ok("!! *** a rank off by ONE is a disagreement, with no tolerance to hide in ***",
        gb.state === "disagrees" && gb.disagreements.some((d) => d.name === rk.name),
        "rank decides controllability, and it is an INTEGER: two float answers agreeing to 1e-12 can always be " +
        "an accident of tolerance, but an integer agreeing across ELIMINATION and the SINGULAR VALUE SPECTRUM " +
        "cannot. That is why this comparison is worth more than the determinant one beside it.");

    const missing = tmp({ answers: truth.filter((o) => o.claim !== "rank").map(asAnswer) });
    ok("...and an answer file that simply OMITS the hard problems does not pass either",
        grade(missing).state === "disagrees",
        "a reference that skips what it found difficult is the same failure as one that gets it wrong, and it " +
        "is the easier of the two to ship by accident");
}

// ---- 3b. SOLVE: THE ONLY CLAIM THAT CAN SEE A TRANSPOSE, AND THE PROPERTY THAT LETS IT ---------------------------
{
    const solves = problems().filter((p) => p.claim === "solve");
    ok("!! *** the set contains a claim that is NOT transpose-invariant ***", solves.length > 0,
        "rank and det are EQUAL for A and its transpose, so on a square matrix neither can tell whether the "
        + "reference got row/column major right. Ax=b can: transposing A changes x. Without a claim of this kind "
        + "the reference's column-major handling rests entirely on rectangular problems.");

    // *** THE GUARD ON THE GUARD. *** For SYMMETRIC A the transpose IS A, and solve returns the identical vector --
    // measured at exactly 0.000e+0 for diag(1,2) and for hilbert4. A solve claim on a symmetric matrix looks like
    // coverage and tests nothing, which is the same failure this whole round was about, one level down.
    for (const p of solves)
        ok("!! ...and " + p.name + "'s matrix is NON-SYMMETRIC, which is what makes it able to see one",
            solveIsDiscriminating(p),
            "a symmetric A would make this claim as blind as rank and det are. IF A LATER ROUND TIDIES THIS "
            + "MATRIX INTO A SYMMETRIC FORM THE CHECK RETIRES ITSELF SILENTLY -- so it is asserted, not trusted.");

    const truth = ours();
    const sv = truth.find((o) => o.claim === "solve");
    const perturb = (i, d) => tmp({ answers: truth.map((o) => o === sv
        ? { ...asAnswer(o), values: o.values.map((v, k) => k === i ? v + d : v) } : asAnswer(o)) });

    // EVERY COMPONENT, NOT A NORM AND NOT THE FIRST ONE. A transposed solve moves some coordinates far more than
    // others, so a comparison that looked at one end of the vector would be blind exactly where this claim pays.
    for (let i = 0; i < sv.values.length; i++)
        ok("!! ...and a wrong answer in component " + i + " ALONE is caught",
            grade(perturb(i, 1e-3)).disagreements.some((d) => d.name === sv.name),
            "checking a norm, or the first entry, would pass a reference that got one coordinate wrong");

    const truncated = tmp({ answers: [{ name: sv.name, claim: "solve", values: sv.values.slice(0, -1) }] });
    ok("!! a solve answer of the WRONG LENGTH is a disagreement, not a crash and not a pass",
        grade(truncated).state === "disagrees",
        "a short vector is a reference that answered a different question; comparing what happens to line up "
        + "would be the worst of the three available behaviours");

    const scalar = tmp({ answers: [{ name: sv.name, claim: "solve", value: 1.375 }] });
    ok("...and a solve answer sent as a SCALAR is refused rather than coerced",
        grade(scalar).state === "disagrees",
        "the two sides must agree about the SHAPE of an answer before its value means anything");
}

// ---- 3c. CHOLESKY: THE ANSWER IS A DECISION, AND THE DECISION IS A STABILITY VERDICT ----------------------------
{
    const truth = ours();
    const chols = truth.filter((o) => o.claim === "chol");
    ok("!! *** the set contains a claim whose answer is a DECISION, not a number ***", chols.length > 0,
        "lyapunovStable decides whether a system is STABLE by whether cholesky(P) returns null. 'Is this matrix "
        + "positive definite' is not a numerical curiosity here -- it is the verdict a control engineer acts on.");

    // THE REFUSAL IS HALF THE CLAIM. A key that only grades successes cannot tell a solver that always says yes
    // from one that is right, and the refusal is the half that is easy to leave out.
    const refused = chols.find((o) => !o.definite);
    ok("!! ...and one problem must be REFUSED by both sides, not merely solved by both",
        !!refused, "the lab's own indefinite matrix, the one controlStateSpace-selfcheck uses verbatim to prove "
        + "its Cholesky is doing the work rather than a sign test");

    // *** THE TWO SIDES DECIDE BY DIFFERENT RULES, WHICH IS WHY AGREEING IS WORTH SOMETHING. *** This engine
    // rejects a pivot with `s <= tol` for a TYPED tol of 1e-12; dpotrf rejects only a pivot that is not positive.
    // A boolean agreeing across two unrelated decision rules cannot be an accident of tolerance.
    const flipped = tmp({ answers: truth.map((o) => o === refused
        ? { name: o.name, claim: "chol", definite: true, values: new Array(o.rows * o.cols).fill(0) }
        : asAnswer(o)) });
    ok("!! ...and a reference that ACCEPTS the indefinite matrix is a disagreement, with no tolerance to hide in",
        grade(flipped).disagreements.some((d) => d.name === refused.name),
        "the verdict is a boolean and gets NO tolerance, exactly like rank's integer -- a reference that never "
        + "refuses anything would otherwise sail through on the two problems it can factor");

    const pd = chols.find((o) => o.definite);
    const wrongFactor = tmp({ answers: truth.map((o) => o === pd
        ? { ...asAnswer(o), values: o.values.map((v, i) => i === 0 ? v + 1e-3 : v) } : asAnswer(o)) });
    ok("...and a correct VERDICT with a wrong FACTOR is still a disagreement",
        grade(wrongFactor).disagreements.some((d) => d.name === pd.name),
        "agreeing that a matrix is positive definite while producing a different L is two solvers agreeing about "
        + "the easy half; the factor is the corroboration and it is checked");

    // ---- THE DIVERGENCE THIS KEY FOUND THE FIRST TIME IT EVER RAN, PINNED SO IT CANNOT BE LOST ----------------
    // *** THE TWO SIDES DO NOT AGREE EVERYWHERE, AND THE PLACE THEY PART IS A DEFECT ON THIS SIDE. ***
    // Measured at v3936 against reference LAPACK:
    //     hilbert(8)   smallest pivot  5.6600e-9    both say POSITIVE DEFINITE
    //     hilbert(12)  smallest pivot  9.2436e-14   WE REFUSE IT, dpotrf ACCEPTS IT
    //     hilbert(14)  smallest pivot -5.3074e-16   both REFUSE
    // A Hilbert matrix is positive definite for EVERY n as a matter of mathematics -- it is a Gram matrix of
    // linearly independent functions. At n = 12 the smallest pivot is still POSITIVE, and dpotrf is right to
    // accept it. This engine rejects it because cholesky() tests `s <= tol` against a TYPED tol of 1e-12, so a
    // pivot that is small but genuinely positive is thrown away.
    //
    // THAT TYPED CONSTANT DECIDES A PHYSICS VERDICT. lyapunovStable calls a system UNSTABLE whenever cholesky(P)
    // returns null, so any Lyapunov P whose smallest pivot lands in (0, 1e-12] is reported unstable while being
    // stable. NOT FIXED HERE: changing that tolerance MOVES A STABILITY VERDICT, and this tree reserves that call.
    // It is asserted rather than described so that fixing it fails THIS check and sends the reader to this note.
    {
        const H = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => 1 / (i + j + 1)));
        const pivots = (M) => {
            const n = M.length, L = Array.from({ length: n }, () => new Array(n).fill(0)), ps = [];
            for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
                let x = M[i][j];
                for (let k = 0; k < j; k++) x -= L[i][k] * L[j][k];
                if (i === j) { ps.push(x); if (x <= 0) return ps; L[i][j] = Math.sqrt(x); }
                else L[i][j] = x / L[j][j];
            }
            return ps;
        };
        const p12 = Math.min(...pivots(H(12)));
        ok("!! *** the typed 1e-12 in cholesky() REFUSES A MATRIX THAT IS POSITIVE DEFINITE *** (measured, not fixed)",
            p12 > 0 && cholesky(H(12)) === null,
            "hilbert(12): smallest pivot " + p12.toExponential(4) + " -- POSITIVE, so dpotrf accepts it and this "
            + "engine does not. A Hilbert matrix is positive definite for every n. lyapunovStable calls a system "
            + "UNSTABLE when cholesky(P) is null, so this typed constant decides a stability verdict. NOT FIXED: "
            + "changing it moves a physics verdict, which is Keith's call. If this check ever goes red because the "
            + "tolerance was fixed, that is the good outcome -- delete it and say so in the changelog.");
        ok("...and the boundary really is a TOLERANCE and not a genuine indefiniteness",
            Math.min(...pivots(H(14))) < 0 && cholesky(H(14)) === null,
            "hilbert(14)'s smallest pivot goes genuinely NEGATIVE, and there both implementations refuse -- so "
            + "the disagreement at 12 is this engine's typed cut-off, not a difference of opinion about the maths");
    }

    ok("...and BOTH REFUSING is an agreement rather than a missing answer",
        grade(tmp({ answers: truth.map(asAnswer) })).rows.find((r) => r.name === refused.name).agrees,
        "there is no factor to compare when both correctly refuse, and demanding one would fail the refusal case "
        + "for having behaved properly");
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
    // *** v3936 -- THIS LINE USED TO BE A TYPED SENTENCE AND IT WENT STALE THE HOUR THE PORT LANDED. *** It read
    // "LAPACK HAS NOT RUN -- no Accelerate, no clang, no Apple hardware here", which was true for 250 versions and
    // false the moment the reference could be built on Linux. A NOTE THAT ASSERTS THE STATE OF THE WORLD IS A NOTE
    // THAT WILL EVENTUALLY LIE ABOUT IT, and this one sat in the closing position where a reader trusts it most.
    // It ASKS now instead of claiming, so it cannot describe a world that has moved on.
    {
        const live = grade();
        if (live.state === "agrees")
            say("*** LAPACK HAS RUN, AND IT AGREES ON ALL " + live.rows.length + " PROBLEMS. *** The outside half "
              + "of this key is EXERCISED: " + (live.rows.filter((r) => r.exact).length) + " ranks agreeing as "
              + "EXACT INTEGERS across elimination here and the singular-value spectrum there, and "
              + (live.rows.filter((r) => r.claim === "solve").length) + " solves -- the only claim that can see a "
              + "TRANSPOSED reference on a square matrix. Source: "
              + (JSON.parse(fs.readFileSync(ANSWER_FILE, "utf8")).source || "unrecorded") + ".");
        else if (live.state === "absent")
            say("*** LAPACK HAS NOT RUN HERE. *** The grader above is tested against fixtures, but no reference "
              + "answers are on disk, so THE CORROBORATION THIS KEY PROMISES DOES NOT YET EXIST. Build the "
              + "reference and re-run: see external-linalg.c's header, which now carries a Linux line as well as "
              + "a Mac one.");
        else
            say("*** THE REFERENCE IS PRESENT BUT THE STATE IS " + live.state.toUpperCase() + ". *** " + (live.why || "")
              + " This is NOT corroboration, and it is not absence either -- read it before trusting anything above.");
    }
}

if (fails) { console.log("\nexternalLinalg-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("\nexternalLinalg-selfcheck: all checks pass");
