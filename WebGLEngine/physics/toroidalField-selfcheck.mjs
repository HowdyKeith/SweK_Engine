// WebGLEngine/physics/toroidalField-selfcheck.mjs — v3837
//
// The one thing a toroidal buffer must do is have NO EDGE: energy that reaches one side reappears on the other,
// the domain is periodic, and scrolling the read origin is a shift with no copy. That, plus the wave step staying
// stable under CFL and the torus map being seamless, is all arithmetic. The LOOK -- ripples chasing themselves
// around a torus -- is Keith's; the wraparound underneath is here.
//
// Run: node physics/toroidalField-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { wrapIndex, idx, laplacianAt, stepWave, splat, readScrolled, torusPoint } from "./toroidalField.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const N = 32;

// 1) WRAPAROUND INDEXING.
{
    ok(wrapIndex(-1, N) === N - 1 && wrapIndex(N, N) === 0 && wrapIndex(N + 3, N) === 3, "wrapIndex folds indices into [0,N) toroidally");
    ok(idx(-1, 0, N) === idx(N - 1, 0, N) && idx(0, -1, N) === idx(0, N - 1, N), "idx wraps on both axes");
}

// 2) LAPLACIAN: flat field -> zero; a single spike -> negative at the spike, positive at its four neighbours.
{
    const flat = new Float64Array(N * N).fill(3.5);
    let allZero = true; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!near(laplacianAt(flat, N, x, y), 0)) allZero = false;
    ok(allZero, "a constant field has zero Laplacian everywhere");
    const f = new Float64Array(N * N); f[idx(5, 5, N)] = 1;
    ok(near(laplacianAt(f, N, 5, 5), -4) && near(laplacianAt(f, N, 6, 5), 1) && near(laplacianAt(f, N, 4, 5), 1), "a spike gives -4 at centre, +1 at each neighbour");
}

// 3) THE TOROIDAL PROPERTY -- an impulse on the RIGHT edge reaches the LEFT edge in one step, because the left
//    cell's wrapped neighbour IS the right edge. A walled (clamped) grid could not do this.
{
    const prev = new Float64Array(N * N), cur = new Float64Array(N * N);
    cur[idx(N - 1, 10, N)] = 1;                       // impulse on the right edge
    const next = stepWave(prev, cur, N, { c: 0.5, dt: 1 });
    ok(Math.abs(next[idx(0, 10, N)]) > 1e-6, "energy crosses the seam: a right-edge impulse moves the left edge in one step");
}

// 4) NO EDGE REFLECTION / STABILITY -- a random small field under the default CFL stays bounded over many steps
//    (a walled or CFL-violating scheme would blow up or pile energy at the edge).
{
    let prev = new Float64Array(N * N), cur = new Float64Array(N * N);
    for (let i = 0; i < N * N; i++) { cur[i] = Math.sin(i * 12.9898) * 0.01; prev[i] = cur[i]; }
    let maxAbs0 = 0; for (const v of cur) maxAbs0 = Math.max(maxAbs0, Math.abs(v));
    for (let s = 0; s < 300; s++) { const nx = stepWave(prev, cur, N, { c: 0.5, dt: 1 }); prev = cur; cur = nx; }
    let maxAbs = 0; for (const v of cur) maxAbs = Math.max(maxAbs, Math.abs(v));
    ok(maxAbs < maxAbs0 * 50 && Number.isFinite(maxAbs), "the field stays bounded over 300 steps under CFL (no blow-up)");
}

// 5) FLAT STAYS FLAT -- no spurious sources.
{
    const prev = new Float64Array(N * N).fill(2), cur = new Float64Array(N * N).fill(2);
    const next = stepWave(prev, cur, N, { c: 0.5, dt: 1 });
    let flat = true; for (const v of next) if (!near(v, 2)) flat = false;
    ok(flat, "a flat field stays flat (the Laplacian invents nothing)");
}

// 6) SPLAT wraps -- a drop centred on the edge deposits mass on the opposite edge too.
{
    const f = new Float64Array(N * N); splat(f, N, 0, 0, 3, 1);
    ok(f[idx(-1, 0, N)] > 0 && f[idx(0, -1, N)] > 0, "a drop on the corner spills across both wrapped edges");
}

// 7) SCROLL = SHIFT WITH NO COPY -- a partial scroll reads the shifted field; a full-period scroll is identity.
{
    const f = new Float64Array(N * N); for (let i = 0; i < N * N; i++) f[i] = i;
    ok(readScrolled(f, N, 3, 0, 5, 7) === f[idx(8, 7, N)], "scrolling the origin by 3 reads the field shifted by 3");
    let identity = true; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (readScrolled(f, N, N, N, x, y) !== f[idx(x, y, N)]) identity = false;
    ok(identity, "a full-period scroll returns exactly to identity");
}

// 8) TORUS MAP is seamless and lands on the torus (distance from the major circle == r).
{
    const R = 3, r = 1;
    const eq = (p, q) => near(p[0], q[0]) && near(p[1], q[1]) && near(p[2], q[2]);
    ok(eq(torusPoint(0, 0.3, R, r), torusPoint(1, 0.3, R, r)) && eq(torusPoint(0.4, 0, R, r), torusPoint(0.4, 1, R, r)), "the torus map wraps seamlessly in u and v");
    const p = torusPoint(0.2, 0.6, R, r), majorDist = Math.hypot(Math.hypot(p[0], p[2]) - R, p[1]);
    ok(near(majorDist, r), "every mapped point sits at the minor radius from the major circle (on the torus)");
}

// 9) DETERMINISM.
{
    const a = new Float64Array(N * N), b = new Float64Array(N * N); a[idx(4, 4, N)] = b[idx(4, 4, N)] = 1;
    const na = stepWave(new Float64Array(N * N), a, N), nb = stepWave(new Float64Array(N * N), b, N);
    let same = true; for (let i = 0; i < N * N; i++) if (na[i] !== nb[i]) same = false;
    ok(same, "the step is deterministic");
}

// ---- CONTROL: a clamped (non-wrapping) Laplacian cannot move energy across the seam. ----
{
    const clampIdx = (x, y) => Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x));
    const clampLap = (f, x, y) => f[clampIdx(x + 1, y)] + f[clampIdx(x - 1, y)] + f[clampIdx(x, y + 1)] + f[clampIdx(x, y - 1)] - 4 * f[clampIdx(x, y)];
    const cur = new Float64Array(N * N); cur[clampIdx(N - 1, 10)] = 1;
    // clamped: the left edge's "x-1" clamps to itself, never seeing the right edge
    ok(near(clampLap(cur, 0, 10), 0) && Math.abs(laplacianAt(cur, N, 0, 10)) > 0, "control: a clamped Laplacian leaves the left edge blind to the right (no wrap)");
}

console.log(`toroidalField-selfcheck: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
