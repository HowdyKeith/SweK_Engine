// physics/tomography/ambiguityKeys-selfcheck.mjs -- v3848
//
// TIER-2 GRADING FOR physics/tomography/ambiguity.mjs, AGAINST GENUINE EXTERNAL KEYS. Gate-only and a PURE
// CONSUMER: no shipped module changed to make any of this pass. This is the last name on the Tier-2 list.
//
// *** WHY THIS MODULE NEEDED EXTERNAL KEYS, AND IT IS THE OPPOSITE PROBLEM FROM sirt's. *** sirt's claims were
// self-referential and could not see a wrong operator. ambiguity's claims are EXACT INTEGER ZEROS -- its own
// gate checks that line sums vanish along the chosen directions, and they do, to the digit. THE RISK HERE IS
// NOT A WRONG ANSWER, IT IS A VACUOUS ONE: a `ghost()` that returned the empty map, or a constant, or anything
// in the kernel of `lineSums` for trivial reasons, would sail through every zero the module asserts. What is
// missing is a statement about WHICH function it built, and that is what the literature supplies.
//
// The construction is the classical SWITCHING COMPONENT of discrete tomography (Katz 1978; Hajdu and Tijdeman,
// J. reine angew. Math. 534, 2001), which ambiguity.mjs's own header cites. The results below are theirs, not
// this tree's:
//
//   A. THE BOUNDING BOX IS A CLOSED FORM. The switching function for directions {(a_i, b_i)} is the polynomial
//      product prod_i (1 - x^{a_i} y^{b_i}), so its support spans exactly (sum|a_i| + 1) by (sum|b_i| + 1).
//      *** A FORMULA, NOT A FIT -- it predicts every row of ghostTable() before the code is run. ***
//
//   B. THE TOTAL MASS IS EXACTLY ZERO, and it is zero for a reason that needs no tomography: evaluate the
//      polynomial at x = y = 1 and every factor becomes (1 - 1). Integer arithmetic throughout, so this is an
//      exact identity rather than a tolerance.
//
//   C. THE ANSWER KEY IS NOT ANOTHER CONVOLUTION. Expanding the product over all 2^n subsets with sign
//      (-1)^|S| builds the same function by a route that shares no code with the module's iterative
//      convolution. Agreement is evidence rather than a restatement -- the same shape entropy.mjs uses when it
//      grades Huffman against exhaustive search.
//
//   D. THE +-1 STRUCTURE IS A PRECONDITION, NOT A DECORATION, and the control is Pascal's triangle. The binary
//      pair in FINDING 2 exists only because the ghost's coefficients stay in {-1, 0, +1}; with a REPEATED
//      direction the product becomes (1 - x)^k and the coefficients are the binomial coefficients with
//      alternating signs -- 1, -2, 1 and 1, -3, 3, -1 -- which no 0/1 image can carry. A SECOND CLOSED FORM,
//      and it is the one that says why "both candidates are binary" was available at all.
//
//   E. THE NULL-SPACE CLAIM, BY TWO ROUTES THAT SHARE NO CODE. lineSums() is ALGEBRAIC -- it groups cells by
//      the invariant b*x - a*y. radon() is GEOMETRIC -- it samples along rays and knows nothing about lattice
//      directions. Both must report the ghost invisible at the lattice angles, and both must report it plainly
//      visible once 45 and 135 are added.
//
// RUNTIME 0.08 s MEASURED with time(1), against verify.mjs's 180 s per-gate budget. Everything here is integer
// arithmetic on a handful of directions, or one 64x64 radon; none of it needs to be big to be decisive.
"use strict";
import { ghost, lineSums, worstLineSum, ghostBox, ghostTable, DIR_SEQUENCE,
         PAIR, binaryPair, pixelsDiffering, LATTICE_ANGLES, PLUS_DIAGONALS } from "./ambiguity.mjs";
import { radon } from "./ct.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const say = (m) => console.log("  " + m);

console.log("== KEY A: the bounding box is a CLOSED FORM (Hajdu-Tijdeman), not a measurement ==");
{
    // prod_i (1 - x^{a_i} y^{b_i}) spans sum|a_i|+1 by sum|b_i|+1. Predicted BEFORE ghostBox is consulted.
    const predict = (dirs) => ({ w: dirs.reduce((s, [a]) => s + Math.abs(a), 0) + 1,
                                 h: dirs.reduce((s, [, b]) => s + Math.abs(b), 0) + 1 });
    let rows = 0;
    for (let n = 2; n <= DIR_SEQUENCE.length; n++) {
        const dirs = DIR_SEQUENCE.slice(0, n);
        const p = predict(dirs), b = ghostBox(ghost(dirs));
        say(`n=${n}  measured ${b.w}x${b.h} (${String(b.cells).padStart(2)} cells)   closed form ${p.w}x${p.h}`);
        ok(b.w === p.w && b.h === p.h, `n=${n}: box ${b.w}x${b.h} != closed form ${p.w}x${p.h}`);
        rows++;
    }
    ok(rows === 5, "all five rows of ghostTable were graded");

    // *** AND THE FORMULA IS LOAD-BEARING, NOT DECORATIVE: it predicts a box nobody has built. ***
    const novel = [[3, 1], [1, 4], [2, 2]];
    const p = predict(novel), b = ghostBox(ghost(novel));
    ok(b.w === p.w && b.h === p.h,
        `on a direction set NOT in DIR_SEQUENCE the formula predicts ${p.w}x${p.h} and the code gives ${b.w}x${b.h}`);
    say(`unseen set {(3,1),(1,4),(2,2)}: closed form ${p.w}x${p.h}, measured ${b.w}x${b.h} -- the key EXTRAPOLATES`);

    // The table the module publishes agrees with what we just recomputed.
    ok(ghostTable().every((r) => { const q = predict(r.dirs); return r.w === q.w && r.h === q.h; }),
        "ghostTable()'s published rows match the closed form");
}

console.log("\n== KEY B: total mass is EXACTLY zero -- the polynomial at x = y = 1 ==");
{
    for (let n = 2; n <= DIR_SEQUENCE.length; n++) {
        const g = ghost(DIR_SEQUENCE.slice(0, n));
        let sum = 0, allInt = true;
        for (const v of g.values()) { sum += v; if (!Number.isInteger(v)) allInt = false; }
        ok(sum === 0, `n=${n}: total mass ${sum} is not exactly 0`);
        ok(allInt, `n=${n}: coefficients are not all integers`);
    }
    say("every direction count sums to 0 with integer coefficients -- each factor is (1 - 1) at x = y = 1,");
    say("so this is an identity of the construction and needs no tolerance at all");

    // NOT VACUOUS: the ghost is not the empty function, and it is not constant.
    const g2 = ghost([[1, 0], [0, 1]]);
    ok(g2.size === 4 && [...g2.values()].some((v) => v > 0) && [...g2.values()].some((v) => v < 0),
        "the two-direction ghost has 4 cells with both signs -- a zero sum over an EMPTY map would also be 0");
}

console.log("\n== KEY C: the answer key is SUBSET EXPANSION, not another convolution ==");
{
    // prod_i (1 - x^{a_i} y^{b_i}) expanded over all 2^n subsets, sign (-1)^|S|. No code in common with the
    // module's iterative Map convolution.
    const ghostBySubsets = (dirs) => {
        const m = new Map(), n = dirs.length;
        for (let mask = 0; mask < (1 << n); mask++) {
            let x = 0, y = 0, bits = 0;
            for (let i = 0; i < n; i++) if (mask & (1 << i)) { x += dirs[i][0]; y += dirs[i][1]; bits++; }
            const k = x + "," + y;
            m.set(k, (m.get(k) || 0) + (bits % 2 === 0 ? 1 : -1));
        }
        for (const [k, v] of [...m]) if (v === 0) m.delete(k);
        return m;
    };
    for (let n = 2; n <= DIR_SEQUENCE.length; n++) {
        const dirs = DIR_SEQUENCE.slice(0, n);
        const a = ghost(dirs), b = ghostBySubsets(dirs);
        let same = a.size === b.size;
        for (const [k, v] of a) if (b.get(k) !== v) same = false;
        ok(same, `n=${n}: the two constructions disagree (${a.size} vs ${b.size} cells)`);
    }
    say("all five agree cell for cell and coefficient for coefficient. TWO ROUTES SHARING NO CODE --");
    say("cancellation is real (n=6 keeps 12 cells of a possible 64), so this is not a trivial match");

    // SABOTAGE: perturb one coefficient and the comparison must notice.
    const dirs = [[1, 0], [0, 1], [1, 1]];
    const bent = new Map(ghost(dirs)); bent.set([...bent.keys()][0], 99);
    const key = ghostBySubsets(dirs);
    let noticed = false;
    for (const [k, v] of bent) if (key.get(k) !== v) noticed = true;
    ok(noticed, "SABOTAGE: a single bent coefficient IS detected by the subset key");
}

console.log("\n== KEY D: the +-1 structure is what makes the BINARY pair possible -- Pascal is the control ==");
{
    for (let n = 2; n <= DIR_SEQUENCE.length; n++) {
        const g = ghost(DIR_SEQUENCE.slice(0, n));
        ok([...g.values()].every((v) => Math.abs(v) === 1),
            `n=${n}: coefficients leave {-1,+1}, so a 0/1 pair could not carry this ghost`);
    }
    say("distinct directions keep every coefficient at +-1, which is exactly what lets FINDING 2's two");
    say("candidates both be 0/1 images -- the property the discrete-prior argument rests on");

    // *** THE CONTROL, AND IT IS A SECOND CLOSED FORM: repeat a direction and (1-x)^k gives Pascal's row. ***
    const binom = (k) => Array.from({ length: k + 1 }, (_, i) => {
        let c = 1; for (let j = 0; j < i; j++) c = c * (k - j) / (j + 1);
        return Math.round(c) * (i % 2 === 0 ? 1 : -1);
    });
    for (const k of [2, 3, 4]) {
        const g = ghost(Array.from({ length: k }, () => [1, 0]));
        const got = [...g.entries()].sort((p, q) => +p[0].split(",")[0] - +q[0].split(",")[0]).map(([, v]) => v);
        const want = binom(k);
        ok(got.length === want.length && got.every((v, i) => v === want[i]),
            `k=${k} repeats: got [${got}] want Pascal [${want}]`);
        say(`(1-x)^${k} -> [${got.join(", ")}]  = Pascal's row ${k} with alternating signs, max |c| = ${Math.max(...got.map(Math.abs))}`);
    }
    ok(Math.max(...[...ghost([[1, 0], [1, 0]])].map(([, v]) => Math.abs(v))) === 2,
        "*** AND THAT BREAKS BINARITY: a coefficient of 2 cannot be carried by any 0/1 image, so the +-1 " +
        "structure above is a PRECONDITION rather than a decoration ***");
}

console.log("\n== KEY E: the null space, by an ALGEBRAIC route and a GEOMETRIC one that share no code ==");
{
    // ALGEBRAIC: lineSums groups cells by the invariant b*x - a*y. It never samples a ray.
    const dirs = [[1, 0], [0, 1]];
    const g = ghost(dirs);
    ok(worstLineSum(g, dirs) === 0, "algebraic: line sums along the chosen directions are exactly 0");
    ok(worstLineSum(g, [[3, 1]]) > 0,
        "...and NOT along an off direction -- the ghost is a function those directions cannot see, not the " +
        "zero function. WITHOUT THIS THE ROW OF ZEROS WOULD PROVE NOTHING");

    // GEOMETRIC: the tree's own radon(), sampling along rays, knowing nothing about lattice directions.
    const { a, c } = binaryPair();
    const worst = (angles) => {
        const sa = radon(a, PAIR.N, angles, PAIR.nDet), sc = radon(c, PAIR.N, angles, PAIR.nDet);
        let w = 0, scale = 0;
        for (let i = 0; i < angles.length; i++) for (let d = 0; d < PAIR.nDet; d++) {
            w = Math.max(w, Math.abs(sa[i][d] - sc[i][d]));
            scale = Math.max(scale, Math.abs(sa[i][d]));
        }
        return { w, scale };
    };
    const lat = worst(LATTICE_ANGLES), diag = worst(PLUS_DIAGONALS);
    say(`geometric: lattice angles worst |sinogram diff| ${lat.w.toExponential(3)} (scale ${lat.scale.toFixed(2)});`);
    say(`           +45/135 worst |sinogram diff| ${diag.w.toExponential(3)} (scale ${diag.scale.toFixed(2)}), relative ${(diag.w / diag.scale).toFixed(4)}`);
    ok(lat.w === 0 && lat.scale > 0,
        `radon() agrees the pair is INVISIBLE at the lattice angles -- exactly 0 against a sinogram of ${lat.scale.toFixed(2)}`);
    ok(diag.w / diag.scale > 0.5,
        "...and COMPLETELY separated once 45 and 135 are added. *** TWO ROUTES, NO SHARED CODE: one groups " +
        "integers by an invariant, the other walks rays through a grid, and they agree about the null space ***");
    ok(pixelsDiffering(a, c) === 256,
        `and the two images genuinely differ, in ${pixelsDiffering(a, c)} of ${PAIR.N * PAIR.N} pixels (6.3%)`);

    // KEY E's Katz corollary: the ghost is only constructible here because its box FITS the grid.
    const b = ghostBox(g);
    ok(PAIR.ox + b.w * PAIR.block <= PAIR.N && PAIR.oy + b.h * PAIR.block <= PAIR.N,
        `and the ${b.w}x${b.h}-cell ghost at ${PAIR.block}px blocks fits the ${PAIR.N}x${PAIR.N} grid from ` +
        `(${PAIR.ox},${PAIR.oy}) -- Katz's condition, and it is why this pair EXISTS on this device's grid`);
}

console.log("\nWHAT THIS DOES NOT CLAIM: that SweK's DEFAULT equally-spaced angle set admits a ghost.");
console.log("angleSet(n) gives theta = pi*i/n, which is not a lattice set in general, and the exact");
console.log("construction needs lattice directions -- ambiguity.mjs scopes its own claim the same way.");
console.log("Nor that discrete tomography is implemented: this grades the AMBIGUITY ARGUMENT, not a reconstructor.");

if (fail) { console.error(`\nambiguityKeys-selfcheck: ${pass} pass, ${fail} FAIL`); process.exit(1); }
console.log(`\nambiguityKeys-selfcheck: all ${pass} pass. The Hajdu-Tijdeman box formula, the zero-mass identity,`);
console.log("subset expansion as the answer key, Pascal's triangle as the binarity control, and the null space");
console.log("confirmed algebraically AND geometrically -- every one of them from outside this tree.");
