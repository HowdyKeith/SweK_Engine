#!/usr/bin/env node
// WebGLEngine/tools/ship/solverFit-selfcheck.mjs -- v4262
//
// Run: node tools/ship/solverFit-selfcheck.mjs
//
// *** BACKLOG #133 PUT ITS OWN DISCIPLINE IN THE TITLE: FIND THE CONSUMER BEFORE TAKING THE SOLVER. *** This
// gate is the search, and every number math/solverFit.mjs records is RE-MEASURED here from the tree's own
// matrices rather than read out of the table. A census whose figures are only in its own data file is a
// sentence with extra steps.
//
// The verdict is REFUSED and the reason is structural: the two properties a sublinear solver needs are, in
// this tree, in DIFFERENT FILES. Every diagonally dominant system is consumed in full; the one consumer that
// genuinely reads a single coordinate is solving a matrix at 0.333 dominance that refinement never improves.
//
// *** AND THE THIRD ENTRY IS THE ONE THE ITEM WAS WRITTEN ABOUT. *** The import graph WOULD fit the solver's
// shape, and nothing in this tree asks it anything. Recording that as ABSENT rather than as a roadmap is the
// whole of the discipline, and section 5 asserts the absence instead of trusting the note.
"use strict";
import * as SF from "../../math/solverFit.mjs";
import { stiffness, solve } from "../../physics/elasticity/beam.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
const near = (a, b, tol) => Math.abs(a - b) <= tol;

console.log("solverFit-selfcheck -- find the consumer before taking the solver, and the consumer disqualifies\n");

// =============================================================================================================
console.log("1. *** THE MEASUREMENT ITSELF, before it is pointed at anything ***");
{
    // dominance() has to be right about matrices whose answer is known by hand, or nothing below means anything.
    const I = [[1, 0], [0, 1]].map((r) => Float64Array.from(r));
    ok("the identity is trivially dominant, and an empty off-diagonal is Infinity not a divide-by-zero",
        SF.dominance(I).worst === Infinity && SF.dominance(I).allDominant);
    const exact = [[2, 1, 1], [1, 2, 1], [1, 1, 2]].map((r) => Float64Array.from(r));
    ok("a row at exactly the boundary (2 against 1+1) counts as dominant", SF.dominance(exact).worst === 1 &&
        SF.dominance(exact).allDominant, "worst " + SF.dominance(exact).worst);
    const under = [[2, 1, 1], [1, 1.9, 1], [1, 1, 2]].map((r) => Float64Array.from(r));
    ok("one row under the line makes the matrix not dominant, and the row is NAMED",
        !SF.dominance(under).allDominant && SF.dominance(under).worstRow === 1 &&
        near(SF.dominance(under).worst, 0.95, 1e-12),
        "worst " + SF.dominance(under).worst.toFixed(4) + " at row " + SF.dominance(under).worstRow);
    ok("sign is irrelevant -- dominance is about magnitudes",
        SF.dominance([[-4, 1, 1], [1, -4, 1], [1, 1, -4]].map((r) => Float64Array.from(r))).worst === 2);
    // The sparse form must agree with the dense one on the same matrix, or the graph result is unfounded.
    const rows = [[4, -1, -1], [-1, 4, -1], [-1, -1, 4]].map((r) => Float64Array.from(r));
    const sparse = SF.dominanceSparse(3, (i) => [...rows[i].entries()].filter(([, v]) => v !== 0));
    ok("dominanceSparse agrees with dominance on the same matrix",
        sparse.worst === SF.dominance(rows).worst && sparse.allDominant === SF.dominance(rows).allDominant,
        "both " + sparse.worst);
}

// =============================================================================================================
console.log("\n2. *** THE POISSON OPERATOR: the precondition holds PERFECTLY, and it is the wrong file ***");
{
    // The 5-point stencil, built here so the number is measured rather than quoted from the census.
    const build = (g) => { const n = g * g, rows = [];
        for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) { const r = new Float64Array(n); let d = 0;
            for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const x = i + di, y = j + dj;
                if (x >= 0 && x < g && y >= 0 && y < g) { r[y * g + x] = -1; d++; } }
            r[j * g + i] = d; rows.push(r); } return rows; };
    for (const g of [8, 16, 32]) {
        const d = SF.dominance(build(g));
        ok("  " + g + "x" + g + " Poisson is dominant in every row", d.allDominant && d.worst >= 1,
            "worst ratio " + d.worst.toFixed(4) + ", " + d.dominantRows + "/" + d.n + " rows");
    }
    const entry = SF.SYSTEMS.find((s) => s.name === "poisson-pressure");
    ok("the census's recorded dominance matches what was just measured", entry.dominanceWorst === 1.0 && entry.allDominant);
    // The consumer is the half that disqualifies it, and it is asserted against the SOURCE, not from memory.
    const flip = fs.readFileSync(path.join(ROOT, "fluid/flip2d.mjs"), "utf8");
    ok("*** and its consumer reads the WHOLE pressure field: flip2d loops every cell ***",
        /for \(let j = 1; j < ny - 1; j\+\+\) for \(let i = 1; i < nx - 1; i\+\+\)/.test(flip),
        "a divergence-free projection touches all " + entry.n + " cells");
    ok("so it fails on FEW_COORDS and on nothing else", JSON.stringify(SF.fits(entry).failed) ===
        JSON.stringify([SF.CRITERIA.FEW_COORDS]));
}

// =============================================================================================================
console.log("\n3. *** THE BEAM: the consumer is exactly right and the matrix is exactly wrong ***");
{
    // *** THE FINDING OF THE ROUND, RE-MEASURED. *** Bending is fourth-order: 6 on the diagonal against
    // |1|+|-4|+|-4|+|1| = 10 off it. And it does not improve with refinement, which is what kills the
    // "use a bigger problem" escape before anyone reaches for it.
    const ratios = [8, 20, 60, 160].map((n) => ({ n, d: SF.dominance(stiffness(n)) }));
    for (const { n, d } of ratios)
        ok("  n=" + String(n).padStart(3) + " beam stiffness worst ratio " + d.worst.toFixed(4),
            d.worst < 0.5 && !d.allDominant, d.dominantRows + " of " + d.n + " rows dominant");
    ok("*** the ratio is IDENTICAL at every n, so refinement never approaches the precondition ***",
        ratios.every((r) => near(r.d.worst, ratios[0].d.worst, 1e-12)),
        "0.3333 at n = " + ratios.map((r) => r.n).join(", ") + " -- 6 against 10, which is the stencil, not the mesh");
    // *** AND WHICH ROW IS WORST IS NOT THE ONE I ASSUMED. *** The first draft asserted 6/10 = 0.6, the
    // INTERIOR stencil [1,-4,6,-4,1]. The measured worst is 1/3, and it belongs to the FREE-END row, which
    // beam.js scales to a half cell: 1 against |-2| + |1|. Both are below the precondition, so the verdict
    // is unchanged -- but the gate re-measures from the matrix and that is how the wrong number was caught.
    const K = stiffness(160), w = ratios[3].d.worstRow;
    let off = 0; for (let j = 0; j < K[w].length; j++) if (j !== w) off += Math.abs(K[w][j]);
    ok("  the worst row is the FREE END (1 against 3), not the interior stencil (6 against 10)",
        w === 159 && K[w][w] === 1 && off === 3, "row " + w + ": diagonal " + K[w][w] + ", off-diagonals " + off);
    ok("  and the interior row really is 6 against 10, so neither is dominant",
        (() => { const i = 80; let o = 0; for (let j = 0; j < K[i].length; j++) if (j !== i) o += Math.abs(K[i][j]);
                 return K[i][i] === 6 && o === 10 && 6 / 10 < 1; })(), "interior ratio 0.6, free end 0.3333");
    // The consumer: one coordinate out of N, asserted against beamBind's actual source line.
    const bind = fs.readFileSync(path.join(ROOT, "tools/roundhouse/beamBind.mjs"), "utf8");
    ok("*** beamBind really does solve and then read ONE entry ***",
        /solve\(K, unit\(N, i2\)\)\[i1\]/.test(bind) && /solve\(K, unit\(N, i1\)\)\[i2\]/.test(bind),
        "Maxwell-Betti reciprocity: 2 numbers wanted, 320 computed");
    const entry = SF.SYSTEMS.find((s) => s.name === "beam-reciprocity");
    ok("the census records 1 coordinate read of n=" + entry.n, entry.coordsRead === 1 && entry.n === 160);
    ok("so it PASSES the few-coordinates criterion and fails the other two",
        !SF.fits(entry).failed.includes(SF.CRITERIA.FEW_COORDS) &&
        SF.fits(entry).failed.includes(SF.CRITERIA.DOMINANT) &&
        SF.fits(entry).failed.includes(SF.CRITERIA.LARGE_N),
        "fails: " + SF.fits(entry).failed.length + " of 3");
    report("THIS IS WHY THE ROUND IS A REFUSAL AND NOT A SHRUG: the tree DOES contain the consumer the " +
        "solver wants. It was found by looking, not assumed away. It just happens to be attached to the one " +
        "operator in the tree that the solver cannot touch.");
}

// =============================================================================================================
console.log("\n4. *** THE THIRD SYSTEM FITS THE SHAPE AND HAS NO CONSUMER, which is the trap #133 names ***");
{
    // Build the real import graph and measure (I - alpha P^T) rather than asserting the textbook result.
    const files = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/node_modules|^\.git$|^vendor$|GPU_Assets|demos_code/.test(e.name)) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/\.(mjs|js)$/.test(e.name)) files.push(p); } };
    walk(ROOT);
    const rel = (p) => path.relative(ROOT, p).replace(/\\/g, "/");
    const idx = new Map(files.map((f, i) => [rel(f), i]));
    const adj = files.map(() => []);
    const RE = /(?:^|\n)\s*(?:import[^"']*|export[^"']*from\s*)["'](\.[^"']+)["']/g;
    for (const f of files) { const s = fs.readFileSync(f, "utf8"); let m; RE.lastIndex = 0;
        while ((m = RE.exec(s))) { const t = path.normalize(path.join(path.dirname(f), m[1]));
            for (const c of [t, t + ".mjs", t + ".js"]) if (idx.has(rel(c))) { adj[idx.get(rel(f))].push(idx.get(rel(c))); break; } } }
    const n = files.length, alpha = 0.85;
    const out = adj.map((a) => a.length || 1);
    // Row i of (I - alpha P^T): diagonal 1, off-diagonal -alpha/outdeg(j) for each j importing i.
    const rev = files.map(() => []); adj.forEach((l, j) => l.forEach((i) => rev[i].push(j)));
    // *** BOTH ORIENTATIONS, BECAUSE THE FIRST DRAFT PICKED THE WRONG ONE. *** I wrote that (I - alpha P^T)
    // is strictly diagonally dominant. It is dominant by COLUMNS, not by rows, and this gate measures rows --
    // so it came back 0.0075 with 3,018 of 3,467 and went red. (I - alpha P) is the row-dominant orientation.
    // The finding survives and is now stated in the form that is actually true.
    const rowForm = SF.dominanceSparse(n, (i) => [[i, 1], ...adj[i].map((j) => [j, -alpha / out[i]])]);
    const colForm = SF.dominanceSparse(n, (i) => [[i, 1], ...rev[i].map((j) => [j, -alpha / out[j]])]);
    ok("the import graph really is large: " + n + " modules", n > 2000, n + " nodes");
    ok("*** (I - alpha P) IS diagonally dominant BY ROWS, so the shape genuinely fits ***",
        rowForm.allDominant && rowForm.worst >= 1,
        "worst " + (rowForm.worst === Infinity ? "Infinity" : rowForm.worst.toFixed(4)) +
        ", " + rowForm.dominantRows + "/" + rowForm.n + " rows");
    ok("  and the TRANSPOSE form is not row-dominant, which is the distinction the first draft missed",
        !colForm.allDominant && colForm.worst < 1,
        "(I - alpha P^T) worst " + colForm.worst.toFixed(4) + ", " + colForm.dominantRows + "/" + colForm.n);
    // ...and the consumer does not exist. Asserted against gateReach's source, not asserted as a belief.
    const gr = fs.readFileSync(path.join(ROOT, "tools/ship/gateReach.mjs"), "utf8");
    ok("*** and NOTHING ASKS FOR IT: gateReach does set reachability, not an influence score ***",
        /new Set\(\)/.test(gr) && !/pageRank|pagerank|influence|alpha/i.test(gr),
        "no damping factor, no scores -- covered.add() and a membership test");
    // *** SCAN THE CODE, NOT THE PROSE -- AND THIS TOOK THREE TRIES. *** A phrase search found 2 files, then
    // 4, growing every time this round wrote another paragraph: the census, the gate, the licence ledger
    // entry and the ENGINE_VERSION changelog note all discuss influence scores at length. Excluding "the
    // round's own files" by name was a patch that the next round would break again. The question is whether
    // anything COMPUTES one, so comments come out first and only then is the identifier looked for. Same
    // lesson as v4257's SKIP anchoring: a byte-scan that cannot tell code from commentary will eventually
    // read a description of a thing as the thing.
    const codeOnly = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const pr = files.map((f) => rel(f)).filter((r) =>
        /\b(pageRank|personalisedRank|personalizedRank|influenceScore)\s*[(=]/.test(
            codeOnly(fs.readFileSync(path.join(ROOT, r), "utf8"))));
    ok("  and no file anywhere COMPUTES one (comments stripped first)", pr.length === 0,
        pr.length + " files" + (pr.length ? ": " + pr.join(" ") : ""));
    const entry = SF.SYSTEMS.find((s) => s.name === "module-influence");
    ok("the census records it as ABSENT rather than as a plan", entry.verdict === SF.VERDICT.ABSENT &&
        entry.consumer === null && SF.fits(entry).absentConsumer);
    report("*** INVENTING THIS CONSUMER TO JUSTIFY THE TAKING IS THE EXACT FAILURE #133 WAS WRITTEN TO " +
        "PREVENT. *** It is the most tempting entry in the census -- large, sparse, dominant, and a natural " +
        "single-coordinate question. It is recorded as a hole, not a roadmap.");
}

// =============================================================================================================
console.log("\n5. *** THE VERDICT, AND NOTHING WAS VENDORED ***");
{
    const v = SF.verdict();
    ok("no system in the census clears all three criteria", v.fitting === 0 && v.examined === 3,
        v.fitting + " of " + v.examined);
    ok("and the module says so in one call, with `taken: false`", v.taken === false);
    // *** EVERY NAMED CONSUMER MUST PRODUCE A LINE OF REAL SOURCE. *** Without this an entry can invent a
    // consumer out of a plausible filename, which is exactly backlog #133's failure mode -- and on the first
    // writing of this gate, sabotage C (a fabricated consumer for the import graph) went only 1 RED.
    for (const e of SF.SYSTEMS) {
        if (e.consumer === null) {
            ok("  " + e.name + ": records a HOLE, with no file and no evidence claimed",
                e.consumerFile === null && e.consumerEvidence === null && e.coordsRead === null);
            continue;
        }
        const f = path.join(ROOT, e.consumerFile);
        const exists = fs.existsSync(f);
        ok("  " + e.name + ": its named consumer file exists and contains the line claimed", exists &&
            fs.readFileSync(f, "utf8").includes(e.consumerEvidence),
            e.consumerFile + " :: " + JSON.stringify(e.consumerEvidence.slice(0, 46)));
    }
    ok("every entry names WHICH criteria it fails, so no verdict is a bare no",
        SF.SYSTEMS.every((s) => Array.isArray(s.fails) && s.fails.length >= 1 && s.why.length > 80));
    ok("the recorded `fails` agree with what fits() computes",
        SF.SYSTEMS.every((s) => { const f = SF.fits(s);
            return f.absentConsumer ? s.verdict === SF.VERDICT.ABSENT : !f.fits && s.fails.length >= 1; }));
    // *** THE REFUSAL IS ASSERTED BY MECHANISM: the solver must not be in the tree. ***
    let vendored = 0; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (/^\.git$/.test(e.name)) continue; const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p); else if (/sublinear/i.test(e.name)) vendored++; } };
    walk(ROOT);
    ok("*** nothing named for the solver was vendored ***", vendored === 0, vendored + " files");
    // CONTROL: fits() must be capable of saying yes, or section 5's zero is meaningless.
    const hypothetical = { name: "control", consumer: "a hypothetical caller", n: 1e6,
        allDominant: true, coordsRead: 1 };
    ok("CONTROL: fits() DOES return true for a system that clears all three", SF.fits(hypothetical).fits,
        "a dominant 1e6 system read one coordinate at a time -- which this tree does not have");
    ok("  and the control is genuinely different from every real entry",
        !SF.SYSTEMS.some((s) => SF.fits(s).fits));
}

// =============================================================================================================
// SABOTAGE LOG -- each applied to a working tree, confirmed present with grep -c before the run was read,
// and restored md5-identical afterwards. Counts are what the runs printed.
//
//   A  dominance() inverts the ratio (off-diagonal over diagonal).
//      -> 8 RED across sections 1, 2 and 3. The beam would report 0.7143 with 159 of 160 rows "dominant" and
//      the worst row would move to row 0. An inverted precondition test flips the round's entire verdict,
//      which is why section 1 checks the measurement against hand-known matrices before pointing it anywhere.
//
//   B  the beam entry's coordsRead changed from 1 to 160.
//      -> 2 RED, and this is the sabotage that matters most for honesty. With coordsRead at 160 the beam
//      fails all three criteria, the refusal becomes easy, and the round reads as "nothing here even wants
//      this". The truth is less comfortable and more useful: the consumer EXISTS and is disqualified
//      elsewhere.
//
//   C  the module-influence entry given a fabricated consumer ("tools/ship/gateReach.mjs influence score").
//      -> *** 1 RED ON THE FIRST WRITING, WHICH WAS TOO FEW FOR THE EXACT FAILURE BACKLOG #133 NAMES. *** Only
//      the ABSENT check noticed; the source-text checks all still passed because they interrogate the TREE,
//      not the census entry, and a fabricated consumer can borrow the name of a real file. Every non-null
//      consumer now has to carry a `consumerEvidence` line that the gate greps for in the file it names --
//      a fabrication would have to invent that too, and the grep fails when it does. 2 RED after that.
//      This is the one sabotage here a person could commit by accident while believing they were helping.
//
//   D  fits() drops the LARGE_N criterion.
//      -> 1 RED. The beam then fails on dominance alone and the recorded `fails` stop agreeing with what
//      fits() computes, which is the check that keeps the data file and the logic from drifting apart.
//
//   E  verdict() reports taken: true.
//      -> 1 RED. Small, and it is the line anyone asking what this round decided reads first.
//
// *** AND THREE OF THIS GATE'S OWN CLAIMS WERE WRONG ON ITS FIRST RUN, all corrected from the matrices
// *** rather than by loosening the check:
//   1. I wrote the beam's worst dominance as 6/10 = 0.6, the INTERIOR stencil. The measured worst is 1/3 and
//      belongs to the FREE-END row, which beam.js scales to a half cell (1 against |-2|+|1|). Both are below
//      the precondition so the verdict stands, but the stated reason was the wrong row.
//   2. I wrote that (I - alpha P^T) is strictly diagonally dominant. It is dominant by COLUMNS; measured by
//      ROWS it is 0.0075 with 3,018 of 3,467. (I - alpha P) is the row-dominant orientation, at 1.1765 with
//      all rows. The finding survives in the orientation that is actually true.
//   3. The scan for "does anything compute an influence score" counted THIS ROUND'S OWN FILES, which talk
//      about influence scores at length -- and it took THREE tries to fix. A phrase search found 2 files,
//      then 4 as the round wrote its licence-ledger entry and its ENGINE_VERSION note; excluding "my own
//      files" by name was a patch the next round would break again. The scan now strips comments and looks
//      for the identifier being CALLED. Same lesson as v4257's SKIP anchoring: a byte-scan that cannot tell
//      code from commentary will eventually read a description of a thing as the thing itself.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: THE SOLVER ITSELF. Nothing in this round ran, benchmarked or read " +
    "ruvnet/sublinear-time-solver's code -- that is the point of refusing before taking, and it is also a real " +
    "limit: the constant factors, the actual query cost and the quality of the implementation are all " +
    "UNMEASURED, so this says the SHAPE does not fit and says nothing about how good the solver is. The " +
    "three-criteria test is itself a judgement: the k << n threshold (8x) and the n >= 10,000 floor are " +
    "chosen, not derived, and a different pair of numbers could admit the Poisson entry. Only three systems " +
    "were examined and the tree has more linear algebra than that -- XPBD, MPM and the seismic ray solver " +
    "were not modelled, on the grounds that they are iterative time-steppers rather than one-shot solves, " +
    "which is a claim this gate does not verify. And the 2.95 ms and 200 ms figures were measured on this " +
    "sandbox's CPU in Node, once each, not as a distribution.");
process.exit(fails ? 1 : 0);
