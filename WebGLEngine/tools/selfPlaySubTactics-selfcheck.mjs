// WebGLEngine/tools/selfPlaySubTactics-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/selfPlaySubTactics-selfcheck.mjs      (~4 s)
//
// THE SELF-PLAY TOOL'S CORE HELD TO ITS DEFINITION. tools/selfPlaySubTactics.mjs fights one tactician against another in BOTH SEATS; this gate holds `match`, `crossMatrix` and `mutateTheta`:
//   match(X, Y, seeds) = { asA, asB, mean }: asA is X's mean duel score in seat A against Y as the opponent; asB is X's mean score in seat B (scoreFor of the swapped duel); mean is their average -- each recomputed
//   here from brain/subDuel.mjs duel() directly. crossMatrix has a null diagonal and an entry per ordered pair; a tactician fought against itself is symmetric in the way that matters (the duel is deterministic).
//   mutateTheta moves 1..3 of the twelve numbers and always lands inside the bounds.
//
// SABOTAGE LOG -- SEVEN: M1 the swapped seat not swapped (X fights in seat A twice) 3 | M2 the seat-B score read from A's side 3 | M3 the mean not over both seats 2 | M4 the opponent ignored (X fights the drone) 1
//   M5 the diagonal filled 2 | M6 the mutation unclamped 1 | M7 mutates up to six numbers 1. The first run of the 'mutates 1..3' row FAILED on the CLEAN tool: a mutation can change nothing (a number already at its bound
//   is clipped back, or the same name is drawn twice) -- a true property of the search that the row had denied; it now says 'at most three, at least 85% non-empty'.
"use strict";
import * as S from "./selfPlaySubTactics.mjs";
import * as D from "../brain/subDuel.mjs";
import * as TA from "../brain/subTactics.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const near = (a, b, tol = 1e-12) => Math.abs(a - b) <= tol;
const X = TA.clampTheta({ ...TA.THETA_DEFAULT, searchSpeed: 4, trackSpeed: 4, fireRange: 450, aimTol: 0.45, pingAfter: 1, pingEvery: 4 }), Y = TA.clampTheta(TA.THETA_DEFAULT), seeds = [3, 5, 8];

console.log("selfPlaySubTactics-selfcheck -- the submarine self-play core\n");
{
    const m = S.match(X, Y, seeds); let a = 0, b = 0;
    for (const s of seeds) { const sc = D.scenario(s, "patrol"); a += D.duel(D.sideHand(X)(), sc, { opponent: D.sideHand(Y)() }).score; const r = D.duel(D.sideHand(Y)(), sc, { opponent: D.sideHand(X)() }); b += D.scoreFor(r, "B"); }
    ok("!! match() is exactly the definition: asA is X's mean score in seat A against Y (duel() with Y as the `opponent`), asB is X's mean score in seat B (the swapped duel scored with scoreFor(.., 'B')), mean their average -- recomputed here from duel() to 1e-12", near(m.asA, a / 3) && near(m.asB, b / 3) && near(m.mean, (a + b) / 6), `${m.asA.toFixed(3)} / ${m.asB.toFixed(3)} / ${m.mean.toFixed(3)}`);
    const m2 = S.match(X, Y, seeds), yx = S.match(Y, X, seeds);
    ok("!! match() is deterministic (the same call twice gives the same three numbers), and the two seats are NOT interchangeable: X's score as A differs from its score as B", JSON.stringify(m) === JSON.stringify(m2) && m.asA !== m.asB, `${m.asA.toFixed(3)} vs ${m.asB.toFixed(3)}`);
    ok("!! the pairing is oriented: X against Y and Y against X are different numbers, and X (the tuned doctrine) scores higher against the default than the default does against it", m.mean !== yx.mean && m.mean > yx.mean, `${m.mean.toFixed(3)} vs ${yx.mean.toFixed(3)}`);
    const self = S.match(X, X, seeds);
    ok("a tactician against ITSELF is a well-defined, finite score (no NaN) in both seats", [self.asA, self.asB, self.mean].every(Number.isFinite));
    const cm = S.crossMatrix(["x", "y", "z"], [X, Y, X], seeds);
    ok("!! crossMatrix has a NULL diagonal and an entry for every ordered pair (6 of 9), each with asA, asB and mean; two copies of X score the same against Y", cm.every((row, i) => row.every((c, j) => (i === j ? c === null : c && "asA" in c && "asB" in c && "mean" in c))) && cm[0][1].mean === cm[2][1].mean && cm[0][1].mean === m.mean);
    let inB = true, nz = 0; const moves = new Set(), rng = (() => { let a = 7; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
    for (let i = 0; i < 200; i++) { const c = S.mutateTheta(Y, rng); let n = 0; for (const k of TA.THETA_NAMES) { if (c[k] < TA.THETA_BOUNDS[k][0] || c[k] > TA.THETA_BOUNDS[k][1]) inB = false; if (c[k] !== Y[k]) n++; } moves.add(n); if (n > 0) nz++; }
    ok("!! mutateTheta always lands inside the bounds (200 draws) and changes at most THREE numbers; it changes something in at least 85% of draws (a draw can change nothing: a number already at a bound is clipped back, or the same name is drawn twice) and sometimes changes more than one", inB && Math.max(...moves) <= 3 && nz >= 170 && moves.has(2), `numbers changed: ${[...moves].sort()}, ${nz}/200 nonzero`);
}
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
