// WebGLEngine/physics/control/controlStateSpace.mjs -- v3573
// ---------------------------------------------------------------------------------------------------------------
// FOUR MORE ROUTES TO THE SAME INTEGER, AND THE ONE THAT CONNECTS THE TWO HALVES OF v3572.
//
// v3572 answered "how many roots lie in the right half-plane" twice -- a Routh table and a root-finder -- and got
// integer agreement on 2800 polynomials. That is two routes. THIS IS FOUR MORE, AND THEY DO NOT ALL WORK ON A
// POLYNOMIAL, which is the point: a subject with six independent roads to one number is a subject where a wrong
// answer has nowhere to hide.
//
//   NYQUIST          counts ENCIRCLEMENTS of -1 by a curve in the complex plane. N = Z - P. It never factors
//                    anything: it walks the imaginary axis, accumulates the winding, and reads an integer off a
//                    picture. As different from a Routh table as two methods can be while answering one question.
//   CONTROLLABILITY  is a RANK, and the duality theorem says rank ctrb(A,B) = rank obsv(A^T,B^T) -- two matrices
//                    that share no entry in the same position, and one integer.
//   CHARACTERISTIC   polynomial by Faddeev--LeVerrier (a trace recursion) against Lagrange interpolation through
//   POLYNOMIAL       n+1 evaluations of det(sI - A). One is algebraic and one is numerical and they share nothing.
//   LYAPUNOV         solves A^T P + P A = -I and asks whether P is positive definite. NO ROOT, NO POLYNOMIAL, NO
//                    FREQUENCY -- a linear solve and a Cholesky. It agrees with Routh on stability and computes
//                    nothing in common with it.
//
// ================================================================================================================
// AND THE DISCRETISATION BRIDGE, WHICH IS WHY THIS ROUND EXISTS AT ALL
// ================================================================================================================
//
// v3572 left two results sitting beside each other with nothing between them: the WELD JOINT is a continuous
// second-order plant graded in the left half-plane, and brain/linearPolicy.js is a DISCRETE recursion graded
// inside the unit circle. *** THE MAP BETWEEN THEM IS EXACT AND IS NOT AN APPROXIMATION: A_d = exp(A*dt) SENDS
// EVERY CONTINUOUS EIGENVALUE lambda TO exp(lambda*dt), AND Re(lambda) < 0 IF AND ONLY IF |exp(lambda*dt)| < 1. ***
// So the count of unstable continuous modes and the count of unstable discrete modes MUST BE THE SAME INTEGER,
// for every dt, and the two are computed by machinery that shares no line: a Routh table on one side, a bilinear
// transform and a different Routh table on the other, with a matrix exponential in between.
//
// THAT IS ALSO THE STATEMENT box3dLockstep DEPENDS ON WITHOUT SAYING SO. A fixed-dt stepper IS a discretisation,
// and "the physics is the same at every dt" is exactly the claim that this map preserves stability.
"use strict";
import { pathToFileURL } from "node:url";
import { routhHurwitz, durandKerner, rhpCountNumeric, insideUnitCircle } from "./controlStability.mjs";

// ---- small dense linear algebra, written here because the tree's only one is symmetric-only -------------------
export const zeros = (n, m = n) => Array.from({ length: n }, () => new Array(m).fill(0));
export const eye = (n) => zeros(n).map((r, i) => (r[i] = 1, r));
export const matMul = (A, B) => {
    const n = A.length, k = B.length, m = B[0].length, C = zeros(n, m);
    for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p];
        if (a) for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
    return C;
};
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
export const trace = (A) => A.reduce((s, r, i) => s + r[i], 0);

/** Gaussian elimination with partial pivoting. Returns the RANK, which is what every claim below actually wants. */
export function rank(M, tol = 1e-9) {
    const A = M.map((r) => r.slice());
    const rows = A.length, cols = A[0].length;
    let r = 0;
    const scale = Math.max(1, ...A.flat().map(Math.abs));
    for (let c = 0; c < cols && r < rows; c++) {
        let piv = r;
        for (let i = r + 1; i < rows; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
        if (Math.abs(A[piv][c]) < tol * scale) continue;
        [A[r], A[piv]] = [A[piv], A[r]];
        for (let i = r + 1; i < rows; i++) {
            const f = A[i][c] / A[r][c];
            for (let j = c; j < cols; j++) A[i][j] -= f * A[r][j];
        }
        r++;
    }
    return r;
}

/** Determinant by LU with partial pivoting. Used only as the NUMERICAL route to the characteristic polynomial. */
export function det(M) {
    const A = M.map((r) => r.slice()), n = A.length;
    let d = 1;
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
        if (Math.abs(A[piv][c]) < 1e-300) return 0;
        if (piv !== c) { [A[c], A[piv]] = [A[piv], A[c]]; d = -d; }
        d *= A[c][c];
        for (let i = c + 1; i < n; i++) {
            const f = A[i][c] / A[c][c];
            for (let j = c; j < n; j++) A[i][j] -= f * A[c][j];
        }
    }
    return d;
}

/** Cholesky. Succeeds IFF the matrix is positive definite, which is the whole Lyapunov test. */
export function cholesky(M, tol = 1e-12) {
    const n = M.length, L = zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
        let s = M[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) { if (s <= tol) return null; L[i][j] = Math.sqrt(s); }
        else L[i][j] = s / L[j][j];
    }
    return L;
}

/** Dense solve by Gauss-Jordan. */
export function solve(A0, b0) {
    const n = b0.length, A = A0.map((r) => r.slice()), b = b0.slice();
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let i = c + 1; i < n; i++) if (Math.abs(A[i][c]) > Math.abs(A[piv][c])) piv = i;
        if (Math.abs(A[piv][c]) < 1e-300) return null;
        [A[c], A[piv]] = [A[piv], A[c]]; [b[c], b[piv]] = [b[piv], b[c]];
        const d = A[c][c];
        for (let j = c; j < n; j++) A[c][j] /= d;
        b[c] /= d;
        for (let i = 0; i < n; i++) if (i !== c && A[i][c]) {
            const f = A[i][c];
            for (let j = c; j < n; j++) A[i][j] -= f * A[c][j];
            b[i] -= f * b[c];
        }
    }
    return b;
}

// =================================================================================================================
// THE CHARACTERISTIC POLYNOMIAL, TWICE
// =================================================================================================================
/** Faddeev--LeVerrier: a TRACE RECURSION. Purely algebraic, no determinant is ever evaluated. */
export function charPolyFaddeev(A) {
    const n = A.length, c = [1];
    let M = zeros(n);
    for (let k = 1; k <= n; k++) {
        M = k === 1 ? A.map((r) => r.slice()) : matMul(A, M.map((r, i) => (r = r.slice(), r[i] += c[k - 1], r)));
        c.push(-trace(M) / k);
    }
    return c;
}

/**
 * The numerical route: evaluate det(sI - A) at n+1 points and interpolate. SHARES NOTHING WITH THE RECURSION --
 * one is a sequence of traces, the other is n+1 LU factorisations and a Lagrange fit.
 */
export function charPolyInterp(A) {
    const n = A.length;
    const xs = Array.from({ length: n + 1 }, (_, i) => -1 + 2 * i / n);   // Chebyshev-ish spread, not 0..n
    const ys = xs.map((s) => det(A.map((r, i) => r.map((v, j) => (i === j ? s - v : -v)))));
    // Lagrange -> monomial coefficients, highest power first
    let poly = new Array(n + 1).fill(0);
    for (let i = 0; i <= n; i++) {
        let basis = [1], denom = 1;
        for (let j = 0; j <= n; j++) {
            if (j === i) continue;
            denom *= xs[i] - xs[j];
            const nb = new Array(basis.length + 1).fill(0);
            for (let k = 0; k < basis.length; k++) { nb[k] += basis[k]; nb[k + 1] -= basis[k] * xs[j]; }
            basis = nb;
        }
        const w = ys[i] / denom;
        for (let k = 0; k < basis.length; k++) poly[k] += w * basis[k];
    }
    return poly;
}

// =================================================================================================================
// NYQUIST -- AN INTEGER READ OFF A PICTURE
// =================================================================================================================
const cAdd = (x, y) => [x[0] + y[0], x[1] + y[1]];
const cMul = (x, y) => [x[0] * y[0] - x[1] * y[1], x[0] * y[1] + x[1] * y[0]];
const cDiv = (x, y) => { const d = y[0] * y[0] + y[1] * y[1];
    return [(x[0] * y[0] + x[1] * y[1]) / d, (x[1] * y[0] - x[0] * y[1]) / d]; };
const evalPoly = (c, z) => c.reduce((a, k) => cAdd(cMul(a, z), [k, 0]), [0, 0]);

/**
 * Encirclements of -1 by L(j*omega) as omega runs the imaginary axis, by ACCUMULATED ARGUMENT of 1 + L.
 * The winding number is an integer by construction: total phase change over 2*pi. Nothing is factored.
 *
 * *** AND THE CONTOUR MUST INDENT AROUND POLES ON THE AXIS, WHICH THE FIRST VERSION DID NOT DO. ***
 * A straight sweep up the imaginary axis walks THROUGH any pole sitting on it, where L is infinite and the
 * accumulated argument is undefined. It does not crash and it does not warn -- IT RETURNS AN INTEGER THAT IS TOO
 * SMALL BY EXACTLY THE NUMBER OF AXIS POLES. Measured: 1/(s(s-1)) gave Z=1 against a truth of 2; -2/(s(s+1)) gave
 * 0 against 1; 1/(s^2(s+1)) gave 1 against 2. It agreed on 600 randomised systems first, INCLUDING 528 with
 * unstable open loops, because random coefficients never put a pole exactly on the axis.
 *
 * *** AN INTEGRATOR IS THE MOST COMMON ELEMENT IN ANY REAL CONTROL LOOP. *** The case the sweep cannot see is not
 * exotic, it is the default, and this is the same lesson as v3572's row of zeros one level along: THE SINGULAR
 * CASE IS THE PHYSICALLY IMPORTANT ONE, and a check built only from random coefficients certifies the bug.
 *
 * The standard fix is to indent the contour to the RIGHT of each axis pole, which is exactly equivalent to moving
 * those poles LEFT by an infinitesimal -- confirmed by measurement before it was implemented: nudging the poles
 * of both failing systems to -1e-6 returned the true integer in every case. So the roots are found, the ones on
 * the axis are shifted left, and THE FACT THAT AN INDENTATION WAS NEEDED IS REPORTED rather than hidden.
 */
export function nyquistEncirclements(num, den, { pts = 200000, wMax = 1e7, axisTol = 1e-9, eps = 1e-2 } = {}) {
    // Detect poles on the imaginary axis and indent around them.
    const roots = durandKerner(den);
    const onAxis = roots.filter((r) => Math.abs(r[0]) <= axisTol).length;
    let D = den;
    if (onAxis > 0) {
        const shifted = roots.map((r) => (Math.abs(r[0]) <= axisTol ? [r[0] - eps, r[1]] : r));
        let poly = [[1, 0]];
        for (const r of shifted) {
            const nx = Array.from({ length: poly.length + 1 }, () => [0, 0]);
            for (let i = 0; i < poly.length; i++) {
                nx[i] = cAdd(nx[i], poly[i]);
                nx[i + 1] = [nx[i + 1][0] - (poly[i][0] * r[0] - poly[i][1] * r[1]),
                             nx[i + 1][1] - (poly[i][0] * r[1] + poly[i][1] * r[0])];
            }
            poly = nx;
        }
        D = poly.map((c) => c[0] * den[0]);
    }

    let total = 0, prev = null;
    for (let i = 0; i <= pts; i++) {
        const t = -Math.PI / 2 + Math.PI * i / pts;
        const w = Math.tan(t * 0.999999) * (wMax / Math.tan(Math.PI / 2 * 0.999999));
        const z = [0, w];
        const L = cDiv(evalPoly(num, z), evalPoly(D, z));
        const F = [1 + L[0], L[1]];                     // encircling -1 by L is encircling 0 by 1 + L
        const ang = Math.atan2(F[1], F[0]);
        if (prev !== null) {
            let d = ang - prev;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            total += d;
        }
        prev = ang;
    }
    return { N: -total / (2 * Math.PI), axisPoles: onAxis, indented: onAxis > 0 };
}

/**
 * *** AND THE INDENTATION RADIUS AND THE SWEEP DENSITY ARE COUPLED, WHICH COST A SECOND ROUND TO FIND. ***
 * The indentation only works if the sweep can RESOLVE it. On 1/(s^2(s+1)) (truth Z = 2), eps = 1e-6 returns
 * exactly 1.0000 at 40k points AND at 400k; eps = 1e-4 returns 1 at 40k and 2 at 400k; eps >= 1e-3 returns 2 at
 * both. So an indentation too small for the sweep silently loses a full encirclement.
 *
 * *** AND IT CONVERGES TO A WRONG INTEGER RATHER THAN TO A NON-INTEGER, SO INTEGRALITY CANNOT SELF-CHECK IT. ***
 * A guard of the form "refuse if N is not near a whole number" -- the obvious one, and the one this lab reaches
 * for -- WOULD HAVE PASSED EVERY ONE OF THOSE WRONG ANSWERS. The only honest check is that the answer is STABLE
 * when both knobs are tightened together, so this recomputes at ten times the density with a tenth the
 * indentation and REFUSES when the two disagree, rather than returning its closest attempt (navigate.js's rule).
 */
export function nyquistConverged(num, den, { pts = 20000, eps = 1e-2, ...rest } = {}) {
    const a = nyquistEncirclements(num, den, { pts, eps, ...rest });
    const b = nyquistEncirclements(num, den, { pts: pts * 10, eps: eps / 10, ...rest });
    const Na = Math.round(a.N), Nb = Math.round(b.N);
    if (Na !== Nb) return { ok: false, reason: "unresolved: N = " + Na + " at (" + pts + ", " + eps +
                            ") but " + Nb + " at (" + pts * 10 + ", " + eps / 10 + ")", coarse: Na, fine: Nb };
    return { ok: true, N: Na, axisPoles: a.axisPoles, indented: a.indented };
}

/** N = Z - P, so Z = N + P. Z is the number of CLOSED-LOOP poles in the right half-plane. */
export function nyquistClosedLoopRhp(num, den, opts = {}) {
    const P = routhHurwitz(den).rhp;                     // open-loop RHP poles; axis poles are NOT RHP
    const e = nyquistEncirclements(num, den, opts);
    return { N: Math.round(e.N), P, Z: Math.round(e.N) + P, Nraw: e.N,
             axisPoles: e.axisPoles, indented: e.indented };
}

// =================================================================================================================
// CONTROLLABILITY, OBSERVABILITY, AND THE DUALITY THAT MAKES THEM ONE INTEGER
// =================================================================================================================
export function ctrbMatrix(A, B) {
    const n = A.length, cols = [];
    let M = B.map((r) => r.slice());
    for (let k = 0; k < n; k++) { cols.push(M); M = matMul(A, M); }
    return cols[0].map((_, i) => cols.flatMap((c) => c[i]));
}
export function obsvMatrix(A, C) {
    const n = A.length, rows = [];
    let M = C.map((r) => r.slice());
    for (let k = 0; k < n; k++) { rows.push(...M); M = matMul(M, A); }
    return rows;
}
/** Kalman duality: (A,B) controllable IFF (A^T, B^T) observable. TWO MATRICES, ONE INTEGER. */
export function dualityCheck(A, B) {
    return { ctrb: rank(ctrbMatrix(A, B)), obsvDual: rank(obsvMatrix(transpose(A), transpose(B))), n: A.length };
}

// =================================================================================================================
// LYAPUNOV -- STABILITY WITHOUT A ROOT, A POLYNOMIAL, OR A FREQUENCY
// =================================================================================================================
/**
 * Solve A^T P + P A = -Q by vectorising into (I (x) A^T + A^T (x) I) vec(P) = -vec(Q), then Cholesky.
 * A is stable IFF a positive-definite P exists for positive-definite Q.
 */
export function lyapunovStable(A, { Q = null } = {}) {
    const n = A.length, N = n * n, At = transpose(A);
    const QQ = Q || eye(n);
    const M = zeros(N), rhs = new Array(N).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const row = i * n + j;
        for (let k = 0; k < n; k++) {
            M[row][k * n + j] += At[i][k];               // (A^T P)_ij
            M[row][i * n + k] += At[j][k];               // (P A)_ij  = (A^T P^T)^T, symmetric form
        }
        rhs[row] = -QQ[i][j];
    }
    const v = solve(M, rhs);
    if (!v) return { stable: false, P: null, singular: true };
    const P = zeros(n);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) P[i][j] = v[i * n + j];
    const Psym = P.map((r, i) => r.map((x, j) => (x + P[j][i]) / 2));
    return { stable: cholesky(Psym) !== null, P: Psym, singular: false };
}

// =================================================================================================================
// THE BRIDGE: exp(A*dt) MAPS THE LEFT HALF-PLANE ONTO THE UNIT DISC, EXACTLY
// =================================================================================================================
/** Scaling and squaring with a Pade(6,6) core. */
export function expm(A, t = 1) {
    const n = A.length;
    const norm = Math.max(...A.map((r) => r.reduce((s, x) => s + Math.abs(x * t), 0)));
    const s = Math.max(0, Math.ceil(Math.log2(Math.max(norm, 1e-300))) + 1);
    const sc = Math.pow(2, -s);
    const As = A.map((r) => r.map((x) => x * t * sc));
    const b = [1, 1 / 2, 5 / 44, 1 / 66, 1 / 792, 1 / 15840, 1 / 665280];
    let U = eye(n).map((r) => r.map((x) => x * b[0])), V = U.map((r) => r.slice());
    let Ak = eye(n);
    for (let k = 1; k <= 6; k++) {
        Ak = matMul(Ak, As);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            U[i][j] += b[k] * Ak[i][j];
            V[i][j] += (k % 2 ? -1 : 1) * b[k] * Ak[i][j];
        }
    }
    // R = V^-1 U, column by column
    let R = zeros(n);
    for (let c = 0; c < n; c++) {
        const col = solve(V, U.map((r) => r[c]));
        for (let i = 0; i < n; i++) R[i][c] = col[i];
    }
    for (let k = 0; k < s; k++) R = matMul(R, R);
    return R;
}

/**
 * *** THE CLAIM THAT CONNECTS v3572'S TWO HALVES. *** Re(lambda) < 0 IFF |exp(lambda*dt)| < 1, so the count of
 * unstable modes must be THE SAME INTEGER continuous and discrete, at EVERY dt. The two counts are computed by
 * machinery sharing no line: a Routh table on a trace recursion's output, against a bilinear transform and a
 * different Routh table on a matrix exponential's output.
 */
export function discretisationPreservesStability(A, dt) {
    const cont = routhHurwitz(charPolyFaddeev(A)).rhp;
    const Ad = expm(A, dt);
    const disc = insideUnitCircle(charPolyFaddeev(Ad));
    return { continuousRhp: cont, discreteOutside: disc.outside, dt, agree: cont === disc.outside };
}

export const MEASURED_V3573 = {
    sixRoutesOneInteger:
        "v3572 had two roads to the RHP count. This adds NYQUIST (encirclements, read off a walked curve, " +
        "nothing factored), the DUALITY RANK (rank ctrb(A,B) = rank obsv(A^T,B^T)), TWO CHARACTERISTIC " +
        "POLYNOMIALS (a trace recursion against n+1 determinants and a Lagrange fit), and LYAPUNOV (a linear " +
        "solve and a Cholesky, with NO root, NO polynomial and NO frequency). *** A SUBJECT WITH SIX " +
        "INDEPENDENT ROADS TO ONE NUMBER IS ONE WHERE A WRONG ANSWER HAS NOWHERE TO HIDE. ***",
    theBridgeIsWhyTheRoundExists:
        "v3572 left the WELD JOINT (continuous, left half-plane) and brain/linearPolicy.js (discrete, unit " +
        "circle) sitting beside each other with nothing between them. A_d = exp(A*dt) maps one onto the other " +
        "EXACTLY -- Re(lambda) < 0 iff |exp(lambda*dt)| < 1 -- so the unstable-mode count must be the SAME " +
        "INTEGER at every dt. *** AND THAT IS THE STATEMENT box3dLockstep DEPENDS ON WITHOUT SAYING SO: a " +
        "fixed-dt stepper IS a discretisation, and 'the physics is the same at every dt' is exactly the claim " +
        "that this map preserves stability. ***",
};

export async function reportLines() {
    const L = [];
    L.push("[control/stateSpace] Nyquist, duality, Lyapunov, and the discretisation bridge");
    L.push("");
    const A = [[0, 1, 0], [0, 0, 1], [-6, -11, -6]];
    L.push("  companion of s^3+6s^2+11s+6 (roots -1,-2,-3):");
    L.push("    charPoly Faddeev  " + charPolyFaddeev(A).map((x) => x.toFixed(4)).join(", "));
    L.push("    charPoly interp   " + charPolyInterp(A).map((x) => x.toFixed(4)).join(", "));
    L.push("    Routh RHP " + routhHurwitz(charPolyFaddeev(A)).rhp + "   Lyapunov stable " +
           lyapunovStable(A).stable);
    L.push("");
    L.push("  discretisation bridge, same A:");
    for (const dt of [0.01, 0.1, 1, 10]) {
        const b = discretisationPreservesStability(A, dt);
        L.push("    dt " + String(dt).padEnd(5) + " continuous RHP " + b.continuousRhp +
               "  discrete outside " + b.discreteOutside + "   agree " + b.agree);
    }
    L.push("");
    for (const [nm, nu, de] of [["1/(s^2+3s+2)", [1], [1, 3, 2]],
                                ["1/(s(s-1))  INTEGRATOR", [1], [1, -1, 0]],
                                ["1/(s^2(s+1))  DOUBLE", [1], [1, 1, 0, 0]]]) {
        const nq = nyquistClosedLoopRhp(nu, de, { pts: 40000 });
        L.push("  Nyquist " + nm.padEnd(24) + " N " + nq.N + "  P " + nq.P + "  -> Z " + nq.Z +
               (nq.indented ? "   (contour indented around " + nq.axisPoles + " axis pole(s))" : ""));
    }
    return L;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    for (const l of await reportLines()) console.log(l);
    process.exit(0);
}
