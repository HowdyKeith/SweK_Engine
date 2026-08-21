// WebGLEngine/tools/roundhouse/externalLinalg.mjs -- v3687
// ---------------------------------------------------------------------------------------------------------------
// AN ANSWER KEY FROM OUTSIDE THIS ENGINE, FOR THE LINEAR ALGEBRA THE LAB ROLLS BY HAND.
//
// physics/control/controlStateSpace.mjs computes rank, det, cholesky and solve itself, and its own header says the
// thing this file is built on: "a subject with six independent roads to one number is a subject where a wrong
// answer has nowhere to hide." Every road it has is one WE WROTE. Apple's Accelerate ships LAPACK -- dgesvd,
// dgetrf, dpotrf -- written by people who have never seen this tree, and that is the whole point: AN OUTSIDE
// REFERENCE IS WHAT AN ANSWER KEY IS SUPPOSED TO BE, in the same class as the published zeta zeros this lab
// already grades against.
//
// *** THE STRONGEST CLAIM HERE IS AN INTEGER, AND THAT IS DELIBERATE. *** rank() decides controllability and
// observability, and it decides them by ELIMINATION AGAINST A TYPED TOLERANCE (tol = 1e-9). LAPACK decides the
// same integer from the SINGULAR VALUE SPECTRUM. Those are unrelated derivations, and an integer agreeing across
// them cannot be an accident of tolerance -- where two float answers agreeing to 1e-12 always can be.
//
// WHAT THIS FILE CANNOT DO, STATED FIRST BECAUSE IT SHAPES EVERYTHING BELOW: IT CANNOT RUN LAPACK. There is no
// Accelerate, no clang and no Apple hardware where this engine's gates run. So the work is SPLIT: this module
// EXPORTS the problems and GRADES the answers, and a tiny C program compiled on the Mac produces them. The gate
// SKIPS -- loudly, by name -- when no answer file is present. A grader that passed when the reference was absent
// would be the worst object in this tree: a key that certifies whatever it is handed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rank, det, solve, transpose, ctrbMatrix, obsvMatrix } from "../../physics/control/controlStateSpace.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ANSWER_FILE = path.join(HERE, "external-linalg-answers.json");
export const PROBLEM_FILE = path.join(HERE, "external-linalg-problems.json");

/** Machine epsilon for float64 -- derived, not typed, because the tolerance below is built from it. */
export const EPS = (() => { let e = 1; while (1 + e / 2 !== 1) e /= 2; return e; })();

/**
 * The problems are BUILT FROM THE LAB'S OWN MATRICES, not invented for this file. Each is a state-space pair the
 * control module already forms, and the matrix handed to LAPACK is the SAME ctrb/obsv matrix whose rank decides
 * the engine's controllability verdict. Inventing a set of nice matrices would grade a program nobody runs.
 */
export function problems() {
    const out = [];
    // b is an INPUT, not a reference value -- the answer being graded is x, and that comes from LAPACK. Typing b
    // is therefore not the thing v3520 forbids; typing x would be.
    const pushSolve = (name, A, b) => out.push({ name: name + ".solve", M: A, b, claim: "solve" });
    const push = (name, A, B, C) => {
        if (B) out.push({ name: name + ".ctrb", M: ctrbMatrix(A, B), claim: "rank" });
        if (C) out.push({ name: name + ".obsv", M: obsvMatrix(A, C), claim: "rank" });
        out.push({ name: name + ".A", M: A, claim: "det" });
    };
    // A controllable double integrator, an uncontrollable pair, and a defective (Jordan-block) system: the three
    // shapes where a rank test can differ. THE UNCONTROLLABLE ONE IS THE CASE THAT MATTERS -- it is where a
    // tolerance decides an integer, and where two methods can legitimately disagree.
    push("double-integrator", [[0, 1], [0, 0]], [[0], [1]], [[1, 0]]);
    push("uncontrollable", [[1, 0], [0, 2]], [[1], [0]], [[1, 0]]);
    push("jordan", [[2, 1, 0], [0, 2, 1], [0, 0, 2]], [[0], [0], [1]], [[1, 0, 0]]);
    // *** v3936 -- THE PROBLEM THAT MAKES A GUARD LOAD-BEARING, AND IT TOOK TWO TRIES TO FIND IT. ***
    // external-linalg.c transposes row-major into column-major explicitly, and its own comment says why: get it
    // backwards and you have A-transpose, which has THE SAME RANK AND THE SAME DETERMINANT, so the mistake passes
    // silently. That warning was written and never tested -- every other problem here is SQUARE, and deleting the
    // transpose outright was MEASURED to leave all ten answers byte-identical. A guard nothing can fail is decor.
    //
    // FIRST GUESS WAS WRONG AND THE MEASUREMENT SAID SO. "Make it rectangular" is not enough: on a non-square
    // matrix the mistake stops being a transpose and becomes a genuine reshuffle, but a reshuffle of a FULL-RANK
    // matrix is still full rank, so a controllable multi-input system reads 3 either way and catches nothing. What
    // discriminates is RANK DEFICIENCY plus rectangularity -- the reshuffle scatters a dependent column's entries
    // across independent ones and the rank goes UP.
    //
    // So: diag(1,2,3) with the third mode unreachable. ctrb is 3x6 of rank 2, and the reshuffle reads 3. This is
    // the multi-input twin of the "uncontrollable" pair already above, whose own note says the uncontrollable case
    // is the one that matters -- not a matrix invented to trip a checker. THE ROW THAT DOES THE CATCHING IS
    // uncontrollable-2in.ctrb; its obsv is rectangular too and is blind, which is stated rather than implied.
    push("uncontrollable-2in", [[1, 0, 0], [0, 2, 0], [0, 0, 3]], [[1, 0], [0, 1], [0, 0]], [[1, 0, 0], [0, 1, 0]]);
    // *** v3936 -- SOLVE IS THE ONLY CLAIM HERE THAT IS NOT TRANSPOSE-INVARIANT, AND THAT IS WHY IT EXISTS. ***
    // rank and det cannot see a row/column-major mixup on a square matrix, because both are equal for A and its
    // transpose; the whole set was blind to it until one rectangular rank-deficient problem was added above. Ax=b
    // is different: transposing A changes x. So solve puts the reference's column-major handling under test on
    // SQUARE problems, where the guard previously rested on a single rectangular row.
    //
    // *** BUT ONLY IF A IS NOT SYMMETRIC -- WHICH IS THE SAME BLINDNESS ONE LEVEL DOWN. *** For symmetric A the
    // transpose IS A and solve returns the identical vector: measured at exactly 0.000e+0 difference for diag(1,2)
    // and for hilbert4. Every other square matrix in this set is symmetric or singular, so a solve claim on any of
    // them would have looked like coverage and tested nothing. Both matrices below are NON-SYMMETRIC on purpose and
    // the gate ASSERTS that rather than trusting this comment -- a later round that "tidies" one into a symmetric
    // form would otherwise silently retire the check.
    pushSolve("jordan", [[2, 1, 0], [0, 2, 1], [0, 0, 2]], [1, -2, 3]);            // det 8,  max|x-x_T| = 8.75e-1
    pushSolve("companion", [[0, 1, 0], [0, 0, 1], [-6, -11, -6]], [1, -2, 3]);     // det -6, max|x-x_T| = 3.50e+0
    // A deliberately ill-conditioned symmetric matrix: the case where "agrees to 1e-12" is a claim about the
    // PROBLEM rather than about either solver, and where a fixed tolerance would be dishonest.
    push("hilbert4", hilbert(4), null, null);
    return out;
}

export function hilbert(n) {
    const H = [];
    for (let i = 0; i < n; i++) { H.push([]); for (let j = 0; j < n; j++) H[i].push(1 / (i + j + 1)); }
    return H;
}

/** What this engine says, computed here, so the comparison has a left-hand side even with no Mac in the room. */
export function ours() {
    return problems().map((p) => {
        const base = { name: p.name, claim: p.claim, rows: p.M.length, cols: p.M[0].length };
        if (p.claim === "solve") return { ...base, values: solve(p.M, p.b) };
        return { ...base, value: p.claim === "rank" ? rank(p.M) : det(p.M) };
    });
}

/** True when a solve problem's matrix could actually detect a transposed reference. */
export function solveIsDiscriminating(p) {
    return p.claim === "solve" && JSON.stringify(p.M) !== JSON.stringify(transpose(p.M));
}

/**
 * *** THE TWO SIDES EXCHANGE IN THE FORMAT EACH ONE FINDS EASY, AND THAT IS A TRUST DECISION, NOT A CONVENIENCE.
 * *** Problems go out as FLAT TEXT because a JSON parser hand-written in C would be the least trustworthy link
 * in a chain whose entire purpose is trust -- a reference that mis-reads its input produces a disagreement that
 * looks exactly like a real one. Answers come back as JSON because printf writes it in one line and Node reads
 * it natively. Each side does the job it cannot get wrong.
 * Format: one problem per block -- name claim rows cols, then rows*cols doubles, whitespace-separated.
 */
export function problemsText() {
    const ps = problems();
    const L = [String(ps.length)];
    for (const p of ps) {
        L.push(p.name + " " + p.claim + " " + p.M.length + " " + p.M[0].length);
        for (const row of p.M) L.push(row.map((x) => x.toPrecision(17)).join(" "));
        // A solve block carries ONE EXTRA LINE: the right-hand side, rows long. The claim word already on the
        // header line tells the C reader whether to expect it, so nothing has to be counted or guessed -- the
        // format stays something printf writes and fscanf reads, which is the whole reason it is not JSON.
        if (p.claim === "solve") L.push(p.b.map((x) => x.toPrecision(17)).join(" "));
    }
    return L.join("\n") + "\n";
}

export function writeProblemsText(file = PROBLEM_FILE.replace(/\.json$/, ".txt")) {
    fs.writeFileSync(file, problemsText());
    return file;
}

export function writeProblems(file = PROBLEM_FILE) {
    fs.writeFileSync(file, JSON.stringify({ note: "written by externalLinalg.mjs -- feed to the Accelerate reference", problems: problems() }, null, 1));
    return file;
}

/**
 * *** THE TOLERANCE IS DERIVED FROM THE PROBLEM, NOT TYPED. *** Two float answers from different LAPACK-class
 * algorithms agree to about ||M|| * max(rows,cols) * EPS * kappa -- the conditioning is the whole story, which is
 * why hilbert4 is in the set. A FIXED 1e-9 WOULD PASS THE EASY MATRICES AND FAIL THE HARD ONE FOR A REASON THAT
 * HAS NOTHING TO DO WITH EITHER SOLVER BEING WRONG.
 * Integer claims get NO tolerance at all: rank must agree exactly or it is a disagreement.
 */
export function toleranceFor(p) {
    const n = Math.max(p.rows || 0, p.cols || 0);
    // A solve answer is a VECTOR, and its scale is its largest component -- not its first, and not one. Using the
    // first component would make the tolerance depend on which corner of the answer happened to be small.
    const magnitude = p.claim === "solve"
        ? Math.max(...(p.values || [0]).map(Math.abs))
        : Math.abs(p.value) || 1;
    const scale = Math.max(1, magnitude || 1);
    return n * scale * EPS * 64;   // 64 = a generous conditioning allowance, and it is a FACTOR not a floor
}

/**
 * Grade an answer file against what this engine computes. RETURNS A STATE, NEVER A BARE BOOLEAN: "absent" is not
 * "pass", and the caller must be able to tell them apart. That distinction is the reason this function exists.
 */
export function grade(answerFile = ANSWER_FILE) {
    if (!fs.existsSync(answerFile)) {
        return { state: "absent", file: answerFile, rows: [], disagreements: [],
                 why: "no external answers on disk. THIS IS NOT A PASS -- LAPACK has not run, so nothing has been corroborated." };
    }
    let ext;
    try { ext = JSON.parse(fs.readFileSync(answerFile, "utf8")); }
    catch (e) { return { state: "unreadable", file: answerFile, rows: [], disagreements: [], why: String(e && e.message || e) }; }

    // *** v3936 -- A KEY IS ONLY A KEY FOR THE QUESTIONS IT WAS ASKED. *** Once the answers are committed, the
    // problems can be edited without them, and a stale key still LOOKS like corroboration. The loud version of
    // that is harmless: add a problem and its answer is missing, which already fails below. THE QUIET VERSION IS
    // THE DANGEROUS ONE -- change a matrix in a way that happens to preserve rank and det, and a key computed on
    // the OLD matrix agrees with the engine's reading of the NEW one, certifying a comparison nobody made.
    // So the problems as they stand NOW are re-derived and checked against the text that was actually fed to
    // LAPACK. This is a content comparison, not a timestamp: touching a file is not editing it, and v3936 spent
    // a round on a freshness check that could not tell those apart.
    // TWO POPULATIONS, TWO TREATMENTS. This only applies to THE REAL KEY. A caller handing in an explicit fixture
    // built from ours() is asking a different question -- "does the grader catch a wrong answer" -- and the
    // problems file on disk has nothing to do with it. Folding the two made a corrupt problems file turn every
    // fixture check stale, which is how this was found: the gate's own wrong-answer fixture stopped grading.
    const textFile = PROBLEM_FILE.replace(/\.json$/, ".txt");
    if (answerFile === ANSWER_FILE && fs.existsSync(textFile)) {
        const onDisk = fs.readFileSync(textFile, "utf8");
        const now = problemsText();
        if (onDisk !== now) {
            return { state: "stale", file: answerFile, rows: [], disagreements: [],
                     why: "the problems have changed since this key was produced. LAPACK answered a DIFFERENT set of "
                        + "questions, so these answers corroborate nothing about the current ones. Re-run the "
                        + "reference: see external-linalg.c's header." };
        }
    }
    const byName = new Map((ext.answers || []).map((a) => [a.name + "|" + a.claim, a]));
    const rows = [];
    for (const o of ours()) {
        const a = byName.get(o.name + "|" + o.claim);
        if (!a) { rows.push({ ...o, external: null, agrees: false, missing: true }); continue; }
        const tol = toleranceFor(o);
        let agrees, external;
        if (o.claim === "solve") {
            // EVERY COMPONENT MUST AGREE. A vector comparison that checked a norm, or the first entry, would pass
            // a reference that got one coordinate wrong -- and a transposed solve typically moves some components
            // far more than others, so the loose version would be blind exactly where this claim earns its keep.
            external = Array.isArray(a.values) ? a.values : null;
            agrees = external !== null && Array.isArray(o.values) && external.length === o.values.length
                     && o.values.every((v, i) => Math.abs(external[i] - v) <= tol);
        } else {
            external = a.value;
            agrees = o.claim === "rank" ? a.value === o.value : Math.abs(a.value - o.value) <= tol;
        }
        rows.push({ ...o, external, tol, agrees, missing: false, exact: o.claim === "rank" });
    }
    const bad = rows.filter((r) => !r.agrees);
    return { state: bad.length ? "disagrees" : "agrees", file: answerFile, rows, disagreements: bad };
}

/** A vector answer has to print as a vector; String([1,2]) reads "1,2" and hides its own shape. */
const fmt = (v) => Array.isArray(v) ? "[" + v.map((x) => Number(x.toPrecision(8))).join(", ") + "]" : String(v);

export function reportLines() {
    const g = grade();
    const L = ["[externalLinalg] the lab's linear algebra against LAPACK, which nobody here wrote"];
    L.push("  state: " + g.state + (g.why ? "   " + g.why : ""));
    for (const r of g.rows) {
        L.push("  " + (r.agrees ? "AGREE " : "DIFFER") + "  " + r.name.padEnd(26) + r.claim.padEnd(6) +
               " ours=" + fmt(r.value !== undefined ? r.value : r.values) + (r.missing ? "   (no external answer)" :
               "  lapack=" + fmt(r.external) + (r.exact ? "   EXACT INTEGER" : "   tol=" + r.tol.toExponential(2))));
    }
    if (g.state === "absent") L.push("  Run tools/roundhouse/external-linalg.c on a Mac to produce the answers. See its header.");
    return L;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    if (process.argv.includes("--write-problems")) console.log("wrote " + writeProblems() + " and " + writeProblemsText());
    console.log(reportLines().join("\n"));
}
