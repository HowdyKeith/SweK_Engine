// WebGLEngine/physics/voxelMassProps-selfcheck.mjs — v2635
//
// Run: node physics/voxelMassProps-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Mass properties are checkable against CLOSED-FORM truth, so this gate does not trust the code against itself -- it
// checks it against physics. A solid cube has a known inertia; a rod is anisotropic in a known direction; a
// symmetric body has a diagonal tensor and a centred COM; and the tensor about the COM must be the SAME however the
// body is partitioned (split it, recombine by the parallel-axis theorem, get the original back). If the composition
// were wrong, the recombination would not close.
import { massProperties } from "./voxelMassProps.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);

// ---- 1. A SOLID CUBE MATCHES THE TEXTBOOK TENSOR ------------------------------------------------------------------
{
    const N = 8, v = 0.5, rho = 2;
    const mp = massProperties(() => true, [N, N, N], { voxelSize: v, density: rho });
    const L = N * v;                                  // cube side in world units
    const m = L * L * L * rho;                        // analytic mass
    const I = m * L * L / 6;                          // solid cube about a central axis
    const diagOk = near(mp.inertia[0][0], I, I * 1e-9) && near(mp.inertia[1][1], I, I * 1e-9) && near(mp.inertia[2][2], I, I * 1e-9);
    const offOk = near(mp.inertia[0][1], 0) && near(mp.inertia[0][2], 0) && near(mp.inertia[1][2], 0);
    const comOk = mp.com.every((c) => near(c, L / 2, 1e-9));
    ok("!! a solid cube matches the closed-form inertia m*L^2/6, centred, diagonal", near(mp.mass, m, m * 1e-9) && diagOk && offOk && comOk,
       "mass " + mp.mass.toFixed(4) + " = " + m.toFixed(4) + ", Ixx " + mp.inertia[0][0].toFixed(5) + " = " + I.toFixed(5) + ", off-diagonals ~0, COM centred. THE MATH MATCHES PHYSICS, NOT ITSELF.");
}

// ---- 2. A ROD IS ANISOTROPIC IN THE RIGHT DIRECTION ---------------------------------------------------------------
{
    const mp = massProperties(() => true, [16, 1, 1], { voxelSize: 1 });     // long along x
    const Ixx = mp.inertia[0][0], Iyy = mp.inertia[1][1], Izz = mp.inertia[2][2];
    ok("!! a long rod has the least inertia about its long axis", Ixx < Iyy && Ixx < Izz && near(Iyy, Izz, 1e-6),
       "Ixx " + Ixx.toFixed(3) + " (spin about the length -- easy) << Iyy " + Iyy.toFixed(3) + " ~ Izz " + Izz.toFixed(3) + " (tumble end-over-end -- hard). A body that spun equally about every axis would be wrong.");
}

// ---- 3. A SYMMETRIC BODY IS CENTRED WITH A DIAGONAL TENSOR ---------------------------------------------------------
{
    const R = 5, C = 5;
    const sphere = (x, y, z) => (x - C) ** 2 + (y - C) ** 2 + (z - C) ** 2 <= R * R;
    const mp = massProperties(sphere, [11, 11, 11], { voxelSize: 1 });
    const comOk = mp.com.every((c) => near(c, C + 0.5, 1e-9));   // cell centres -> geometric centre at C + 0.5
    const scale = mp.inertia[0][0];
    const offOk = near(mp.inertia[0][1] / scale, 0, 1e-9) && near(mp.inertia[0][2] / scale, 0, 1e-9) && near(mp.inertia[1][2] / scale, 0, 1e-9);
    const isoOk = near(mp.inertia[0][0], mp.inertia[1][1], scale * 1e-9) && near(mp.inertia[1][1], mp.inertia[2][2], scale * 1e-9);
    ok("!! a symmetric body is centred, its tensor diagonal and isotropic", comOk && offOk && isoOk,
       "voxel sphere: COM at the geometric centre, off-diagonals ~0, Ixx=Iyy=Izz. Symmetry the code did not know about falls straight out of the sum.");
}

// ---- 4. COMPOSITION CLOSES: SPLIT A BODY, RECOMBINE, GET THE SAME TENSOR -------------------------------------------
{
    // an asymmetric L-body so the test has real off-diagonal terms
    const dims = [10, 6, 4];
    const Lbody = (x, y) => x < 3 || y < 2;
    const whole = massProperties(Lbody, dims, { voxelSize: 1 });
    // split along x at 5
    const left = massProperties((x, y, z) => Lbody(x, y, z) && x < 5, dims, { voxelSize: 1 });
    const right = massProperties((x, y, z) => Lbody(x, y, z) && x >= 5, dims, { voxelSize: 1 });

    // recombine the two parts by the parallel-axis theorem
    const M = left.mass + right.mass;
    const COM = [0, 1, 2].map((i) => (left.mass * left.com[i] + right.mass * right.com[i]) / M);
    const shift = (part, T) => {
        const d = [part.com[0] - COM[0], part.com[1] - COM[1], part.com[2] - COM[2]];
        const m = part.mass;
        T[0][0] += part.inertia[0][0] + m * (d[1] * d[1] + d[2] * d[2]);
        T[1][1] += part.inertia[1][1] + m * (d[0] * d[0] + d[2] * d[2]);
        T[2][2] += part.inertia[2][2] + m * (d[0] * d[0] + d[1] * d[1]);
        T[0][1] += part.inertia[0][1] - m * d[0] * d[1];
        T[0][2] += part.inertia[0][2] - m * d[0] * d[2];
        T[1][2] += part.inertia[1][2] - m * d[1] * d[2];
    };
    const T = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    shift(left, T); shift(right, T);

    const comClose = COM.every((c, i) => near(c, whole.com[i], 1e-9));
    const scale = whole.inertia[0][0] || 1;
    const tClose = near(T[0][0], whole.inertia[0][0], scale * 1e-9) && near(T[1][1], whole.inertia[1][1], scale * 1e-9)
        && near(T[2][2], whole.inertia[2][2], scale * 1e-9) && near(T[0][1], whole.inertia[0][1], scale * 1e-9)
        && near(T[0][2], whole.inertia[0][2], scale * 1e-9) && near(T[1][2], whole.inertia[1][2], scale * 1e-9);
    ok("!! composition closes: split the body, recombine, and the tensor is unchanged", near(M, whole.mass, 1e-9) && comClose && tClose,
       "an L-body split in two and recombined by the parallel-axis theorem reproduces the whole body's COM and full tensor. If the shift or the sum were wrong, THE RECOMBINATION WOULD NOT CLOSE.");
}

console.log(fails ? "\nvoxelMassProps-selfcheck: " + fails + " FAILED" : "\nvoxelMassProps-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
