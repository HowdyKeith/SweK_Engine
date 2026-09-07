#!/usr/bin/env node
// WebGLEngine/physics/voxel/fracture-selfcheck.mjs -- v4415
//
// *** THE EXACT KEY THIS MODULE'S OWN HEADER NAMED AT v2? AND NOBODY WROTE. ***
//
// tools/ship/coverageTriage.mjs has carried physics/voxel/fracture.js as a CANDIDATE: "turns a broken voxel
// structure into rigid bodies. Total mass before and after a fracture is conserved exactly, which is a key
// nobody has written." The module's own header names a SHARPER one, and it is the one worth holding:
//
//     "A solid box has an analytic inertia tensor: I = m/12 * diag(b^2+c^2, a^2+c^2, a^2+b^2). So a voxel
//      summation can be made to EARN it, exactly, at every resolution -- but only if each voxel's OWN inertia
//      about its own centre is included alongside the parallel-axis term. Leave that out and every result is
//      wrong by about cell^2: small, wrong in the direction of 'spins slightly too fast', and
//      indistinguishable from a tuning problem forever."
//
// ---- AND THE COST OF LEAVING IT OUT IS A CLOSED FORM, NOT "ABOUT cell^2" ---------------------------------------
//
// The omitted term is the same for every voxel, so it sums to M cell^2 / 6 and the relative error is
//
//     (M cell^2 / 6) / (M (b^2 + c^2) / 12)  =  2 cell^2 / (b^2 + c^2)
//
// -- a PREDICTED factor with no free parameter, matching to three figures at every fixture below. "About
// cell^2" is right about the scaling and silent about the constant, and the constant is what tells a missing
// term from a coarse grid.
//
// ---- THREE KEYS, AND TWO OF THEM ARE ZERO-TOLERANCE --------------------------------------------------------------
//
//   1. THE PARTITION IS EXACT. Connected components put every surviving voxel in exactly one piece, so the
//      masses sum to the total BIT-IDENTICALLY -- asserted with === and not with a tolerance, because every
//      term is the same float (density * cell^3) added the same number of times.
//   2. THE TENSOR IS EARNED. A voxelised box reproduces the analytic tensor to 1.1e-14 at every resolution
//      tried, INCLUDING a fragment that has broken off and is being measured about its own new centre.
//   3. THE OMISSION IS PRICED. 2 cell^2 / (b^2 + c^2), predicted and measured.
//
// *** AND THE FIXTURE HAD TO BE BUILT TWICE, WHICH IS RECORDED HERE BECAUSE IT NEARLY SHIPPED VACUOUS. ***
// The first draft carved SPHERES out of a solid block, exactly as the module's own carveSphere invites -- and
// every one of them left the block in ONE piece. Mass conservation over a partition of one part is arithmetic
// with nothing to check. A slab carve is what actually detaches a fragment, and section 1 asserts the piece
// count so the key cannot go vacuous again without going red.
//
// SABOTAGES: see the log at the foot of this file.
//
// Run: node physics/voxel/fracture-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)
"use strict";
import { connectedComponents, massProperties, looseFragments, carveSphere } from "./fracture.js";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);

const NX = 14, NY = 10, NZ = 12, CELL = 0.5;
const at = (x, y, z) => (z * NY + y) * NX + x;
const solid = () => new Uint8Array(NX * NY * NZ).fill(1);
const alive = (g) => g.reduce((a, b) => a + b, 0);
/** Remove a whole horizontal layer: the carve that actually detaches what is above it. */
const slab = (g, y0) => { let n = 0; for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) { const k = at(x, y0, z); if (g[k]) { g[k] = 0; n++; } } return n; };
const labelWhole = (g) => { const l = new Int32Array(g.length); for (let i = 0; i < g.length; i++) l[i] = g[i] ? 1 : 0; return l; };
const boxI = (a, b, c) => { const m = a * b * c; return [m / 12 * (b * b + c * c), m / 12 * (a * a + c * c), m / 12 * (a * a + b * b)]; };

console.log("\n1. A FRACTURE THAT ACTUALLY FRACTURES -- ASSERTED, BECAUSE THE FIRST FIXTURE DID NOT");
const CUTS = [3, 5, 8];
const runs = CUTS.map((y0) => {
    const g = solid(), before = alive(g), removed = slab(g, y0), remaining = alive(g);
    const cc = connectedComponents(g, NX, NY, NZ);
    const lf = looseFragments(g, NX, NY, NZ);
    const parts = [];
    for (let L = 1; L <= cc.count; L++) { const mp = massProperties(cc.labels, L, NX, NY, NZ, CELL, 1); if (mp) parts.push({ L, ...mp }); }
    return { y0, before, removed, remaining, cc, lf, parts };
});
runs.forEach((r) => report(`  cut at y=${r.y0}: ${r.before} voxels, ${r.removed} removed, ${r.remaining} left in ${r.cc.count} components (${r.lf.loose.length} loose, ${r.lf.anchored.length} anchored)`));
ok("*** every cut leaves TWO components, one anchored and one loose -- so the partition has something to partition ***",
    runs.every((r) => r.cc.count === 2 && r.lf.loose.length === 1 && r.lf.anchored.length === 1),
    `${runs.map((r) => `${r.cc.count}/${r.lf.loose.length}`).join(", ")}. THE FIRST DRAFT OF THIS GATE CARVED SPHERES, as the module's own carveSphere invites, and every carve left the block in ONE piece -- so the conservation key below would have been a sum over a partition of one. A vacuous key reads exactly like a satisfied one`);
{
    const g = solid(); carveSphere(g, NX, NY, NZ, 7, 6, 6, 4);
    ok("  ...and the sphere carve really does leave one piece, which is why it is recorded rather than deleted",
        connectedComponents(g, NX, NY, NZ).count === 1,
        `a radius-4 sphere through the middle of a ${NX}x${NY}x${NZ} block removes 153 voxels and detaches nothing: the block is simply connected around the hole. The invitation in the module's API is not the fixture the key needs`);
}

console.log("\n2. THE PARTITION IS EXACT -- BIT-IDENTICAL, NOT WITHIN A TOLERANCE");
{
    const byCount = runs.every((r) => r.parts.reduce((a, p) => a + p.voxels, 0) === r.remaining);
    ok("*** the component voxel counts sum to the survivors exactly ***",
        byCount,
        runs.map((r) => `${r.parts.map((p) => p.voxels).join("+")}=${r.remaining}`).join("; ") + ". Connected components put every surviving voxel in exactly one label -- that is what a partition IS, and an integer count is the right instrument for it");
    const massOk = runs.map((r) => {
        const sum = r.parts.reduce((a, p) => a + p.mass, 0);
        return { sum, want: r.remaining * CELL ** 3, same: sum === r.remaining * CELL ** 3 };
    });
    ok("*** and so do the MASSES, with === rather than a tolerance ***",
        massOk.every((m) => m.same),
        `${massOk.map((m) => m.sum.toFixed(9)).join(", ")} against ${massOk.map((m) => m.want.toFixed(9)).join(", ")}. Every term is the same float -- density * cell^3 -- added the same number of times, so the sum is exact by construction and a tolerance here would be hiding the fact that it is`);
    const split = runs.every((r) => {
        let loose = 0, anch = 0;
        for (const p of r.parts) (r.lf.loose.includes(p.L) ? (loose += p.voxels) : (anch += p.voxels));
        return loose + anch === r.remaining && loose > 0 && anch > 0;
    });
    ok("  and the loose/anchored split is a partition too, with both sides non-empty",
        split,
        "what falls plus what stands equals what survived. A fragment that appeared in neither list, or in both, would break this and nothing else in the module would notice");
}

console.log("\n3. THE TENSOR IS EARNED, AT EVERY RESOLUTION -- WHICH IS WHAT THE HEADER PROMISED");
{
    const rows = [[1, 1, 1, 1], [2, 3, 4, 1], [5, 5, 5, 0.4], [8, 3, 11, 0.25], [16, 16, 16, 0.1]].map(([nx, ny, nz, cell]) => {
        const g = new Uint8Array(nx * ny * nz).fill(1);
        const mp = massProperties(labelWhole(g), 1, nx, ny, nz, cell, 1);
        const Ia = boxI(nx * cell, ny * cell, nz * cell);
        return { nx, ny, nz, cell, mp, Ia, rel: Math.max(...[0, 1, 2].map((i) => Math.abs(mp.I[i] - Ia[i]) / Ia[i])) };
    });
    rows.forEach((r) => report(`  ${r.nx}x${r.ny}x${r.nz} at cell ${r.cell}: Ixx ${r.mp.I[0].toExponential(10)} against ${r.Ia[0].toExponential(10)}   rel ${r.rel.toExponential(2)}`));
    ok("*** a voxelised box reproduces the analytic tensor to 1.1e-14, at every resolution tried ***",
        rows.every((r) => r.rel < 1e-13),
        `worst ${Math.max(...rows.map((r) => r.rel)).toExponential(2)} over ${rows.length} resolutions from a single voxel to 4096. EXACT means exact: the 1x1x1 case is 0, and the rest is the summation's own rounding`);
    ok("  and the off-diagonal terms vanish for a box, which a wrong parallel-axis sign would not allow",
        rows.every((r) => r.mp.I.slice(3).every((v) => Math.abs(v) < 1e-12)),
        `worst |Ixy|, |Ixz|, |Iyz| = ${Math.max(...rows.flatMap((r) => r.mp.I.slice(3).map(Math.abs))).toExponential(2)}. A box about its own centre is diagonal by symmetry`);

    // *** THE FRAGMENT'S TENSOR, ABOUT ITS OWN NEW CENTRE. *** This is the number that actually reaches the
    // solver: the loose piece is handed to Jolt as a body, and its inertia is measured about a centre of mass
    // that did not exist before the fracture.
    const r5 = runs.find((r) => r.y0 === 5);
    const frag = r5.parts.find((p) => r5.lf.loose.includes(p.L));
    const fIa = boxI(NX * CELL, (NY - 6) * CELL, NZ * CELL);
    const fRel = Math.max(...[0, 1, 2].map((i) => Math.abs(frag.I[i] - fIa[i]) / fIa[i]));
    ok("*** and a piece that has BROKEN OFF earns it too, about a centre of mass that did not exist before ***",
        fRel < 1e-13 && frag.voxels === NX * (NY - 6) * NZ,
        `the loose fragment is a ${NX}x${NY - 6}x${NZ} box of ${frag.voxels} voxels; its tensor matches the analytic one to ${fRel.toExponential(2)}. THIS is the number that reaches the solver -- exact geometry, exact mass properties, then a verified rigid-body integrator`);
}

console.log("\n3b. AN L, BECAUSE EVERY BOX HAS ZERO PRODUCTS OF INERTIA AND A SIGN ERROR HIDES BEHIND THAT");
{
    // *** A SABOTAGE WENT 0 RED AND THIS SECTION IS WHAT IT BOUGHT. *** Flipping the sign of every product of
    // inertia moved NOTHING, because every fixture above is a BOX and a box about its own centre is diagonal
    // by symmetry -- Ixy = Ixz = Iyz = 0, and the sign of zero is not observable. The convention here is the
    // INERTIA TENSOR's (Ixy = -sum m dx dy), which is the opposite sign to the bare "product of inertia", and
    // getting it backwards is a real and quiet error: it tumbles a fragment the wrong way about its own axes.
    //
    // The reference is TWO SOLID BOXES composed by the parallel-axis theorem about their combined centre --
    // an independent route to the same tensor, and the one physics/voxelMassProps.js takes from a box cover.
    const LX = 8, LY = 7, LZ = 2, LC = 0.5;
    const lat = (x, y, z) => (z * LY + y) * LX + x;
    const g = new Uint8Array(LX * LY * LZ);
    for (let z = 0; z < LZ; z++) for (let y = 0; y < LY; y++) for (let x = 0; x < LX; x++)
        if ((x < 6 && y < 2) || (x < 2 && y >= 2)) g[lat(x, y, z)] = 1;
    const lab = new Int32Array(g.length); for (let i = 0; i < g.length; i++) lab[i] = g[i] ? 1 : 0;
    const mp = massProperties(lab, 1, LX, LY, LZ, LC, 1);

    const boxes = [{ a: 6 * LC, b: 2 * LC, c: LZ * LC, cx: 3 * LC, cy: 1 * LC, cz: LZ * LC / 2 },
                   { a: 2 * LC, b: 5 * LC, c: LZ * LC, cx: 1 * LC, cy: 4.5 * LC, cz: LZ * LC / 2 }];
    let M = 0, CX = 0, CY = 0, CZ = 0;
    for (const B of boxes) { const m = B.a * B.b * B.c; M += m; CX += m * B.cx; CY += m * B.cy; CZ += m * B.cz; }
    CX /= M; CY /= M; CZ /= M;
    const A = [0, 0, 0, 0, 0, 0];
    for (const B of boxes) {
        const m = B.a * B.b * B.c, dx = B.cx - CX, dy = B.cy - CY, dz = B.cz - CZ;
        A[0] += m / 12 * (B.b * B.b + B.c * B.c) + m * (dy * dy + dz * dz);
        A[1] += m / 12 * (B.a * B.a + B.c * B.c) + m * (dx * dx + dz * dz);
        A[2] += m / 12 * (B.a * B.a + B.b * B.b) + m * (dx * dx + dy * dy);
        A[3] -= m * dx * dy; A[4] -= m * dx * dz; A[5] -= m * dy * dz;
    }
    report(`  the L: ${mp.voxels} voxels, mass ${mp.mass}, Ixy ${mp.I[3].toExponential(10)} against ${A[3].toExponential(10)}`);
    ok("*** the products of inertia are NON-ZERO here, so their sign is finally observable ***",
        Math.abs(A[3]) > 1 && Math.abs(mp.I[3]) > 1,
        `Ixy = ${mp.I[3].toFixed(6)}. Flipping the sign of all three products went 0 RED against the box fixtures above, and this is the shape that catches it -- an L has no plane of symmetry through its centre of mass in the xy sense`);
    const rel = [0, 1, 2, 3].map((i) => Math.abs(mp.I[i] - A[i]) / Math.abs(A[i]));
    ok("*** and the voxel summation matches a TWO-BOX parallel-axis composition to 4e-16 ***",
        Math.max(...rel) < 1e-14 && mp.mass === M,
        `worst ${Math.max(...rel).toExponential(2)} across Ixx, Iyy, Izz and Ixy, with the masses bit-identical. Two independent routes -- a summation over 22 voxels, and two closed-form box tensors shifted by the parallel-axis theorem -- which is the composition physics/voxelMassProps.js performs from a box cover`);
    ok("  and the two zero products stay zero, which the L's own symmetry in z requires",
        Math.abs(mp.I[4]) < 1e-12 && Math.abs(mp.I[5]) < 1e-12,
        `Ixz ${mp.I[4].toExponential(2)}, Iyz ${mp.I[5].toExponential(2)}. The L is uniform through z, so those two vanish while Ixy does not -- one fixture giving both a live term and two dead ones`);
}

console.log("\n4. THE OMISSION IS PRICED: 2 cell^2 / (b^2 + c^2), PREDICTED RATHER THAN OBSERVED");
{
    // The module's own claim is "wrong by about cell^2". The omitted term is m*cell^2/6 per voxel and the same
    // for all of them, so it sums to M cell^2 / 6 against an analytic M (b^2 + c^2) / 12 -- a closed form.
    const noSelf = (nx, ny, nz, cell) => {
        const mi = cell ** 3;
        let M = 0, cy = 0, cz = 0;
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) { M += mi; cy += mi * (y + 0.5) * cell; cz += mi * (z + 0.5) * cell; }
        cy /= M; cz /= M;
        let Ixx = 0;
        for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
            const dy = (y + 0.5) * cell - cy, dz = (z + 0.5) * cell - cz;
            Ixx += mi * (dy * dy + dz * dz);
        }
        return Ixx;
    };
    const rows = [[2, 3, 4, 1], [8, 3, 11, 0.25], [16, 16, 16, 0.1], [20, 7, 9, 0.05]].map(([nx, ny, nz, cell]) => {
        const b = ny * cell, c = nz * cell;
        const Ia = boxI(nx * cell, b, c)[0];
        const measured = Math.abs(noSelf(nx, ny, nz, cell) - Ia) / Ia;
        const predicted = 2 * cell * cell / (b * b + c * c);
        return { nx, ny, nz, cell, measured, predicted, gap: Math.abs(measured - predicted) / predicted };
    });
    rows.forEach((r) => report(`  ${r.nx}x${r.ny}x${r.nz} at cell ${r.cell}: without the self term ${(r.measured * 100).toFixed(3)}% low, predicted ${(r.predicted * 100).toFixed(3)}%`));
    ok("*** the error from dropping each voxel's own inertia is 2 cell^2 / (b^2 + c^2), to three figures ***",
        rows.every((r) => r.gap < 5e-3),
        `worst departure from the prediction ${Math.max(...rows.map((r) => r.gap)).toExponential(2)} over ${rows.length} shapes, from 8.0% down to 0.05%. The module says "wrong by about cell^2", which is right about the SCALING and silent about the CONSTANT -- and the constant is what separates a missing term from a coarse grid`);
    ok("!! and it is always LOW, never high, which is the direction that reads as a tuning problem",
        rows.every((r) => noSelf(r.nx, r.ny, r.nz, r.cell) < boxI(r.nx * r.cell, r.ny * r.cell, r.nz * r.cell)[0]),
        `an inertia that is too SMALL spins too fast, and a fragment that spins slightly too fast looks like a damping constant somebody should tune. The module's header says exactly that: "indistinguishable from a tuning problem forever"`);
}

report("UNCHECKED. THE SOLVER, which is where these numbers go: this gate holds the mass properties and says " +
       "nothing about whether Jolt integrates them correctly -- physics/mechanics/fragmentRotation-selfcheck.mjs " +
       "is that half. NON-CUBOID FRAGMENTS: every analytic comparison here is against a BOX, because a box is " +
       "what has a closed form; an L-shaped fragment's tensor is checkable only against another summation. " +
       "THE FLOOD FILL's connectivity rule -- 6-neighbour against 18 or 26 -- which changes what counts as one " +
       "piece and is a modelling choice this gate takes as given. And DENSITY VARIATION, since massProperties " +
       "takes one density for a whole label and a real structure is made of more than one material.");

console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL GREEN");
process.exit(fails ? 1 : 0);

/* -----------------------------------------------------------------------------------------------------------
 * SABOTAGE LOG -- 2 / 2 / 1 / 3 / 3, and the 1 WENT 0 RED FIRST AND BOUGHT SECTION 3b.
 *
 * A. `self` set to 0 -- each voxel's own inertia about its own centre dropped.                      2 RED
 *    The term the module's header says everything turns on, and the two tensor checks catch it. Section 4
 *    then prices it: 2 cell^2 / (b^2 + c^2), always LOW, which spins a fragment slightly too fast and reads
 *    as a damping constant somebody should tune.
 *
 * B. `self` doubled on the Ixx axis only.                                                           2 RED
 *    Same two checks. Worth separating from A because a uniform error in all three axes could conceivably be
 *    absorbed by a scale somewhere; one axis out of three cannot.
 *
 * C. The products of inertia given the wrong sign (Ixy += instead of -=).                           1 RED
 *    *** WENT 0 RED FIRST, AND IT WAS THE FIXTURE'S FAULT RATHER THAN A PROPERTY. *** Every shape in sections
 *    1 to 3 is a BOX, and a box about its own centre is diagonal by symmetry: Ixy = Ixz = Iyz = 0, and the
 *    sign of zero is not observable. Section 3b adds an L whose Ixy is 2.386 and whose reference is TWO SOLID
 *    BOXES composed by the parallel-axis theorem -- an independent route, and the one voxelMassProps.js takes
 *    from a box cover. Re-run at 1 red. The convention is the inertia TENSOR's (Ixy = -sum m dx dy), which is
 *    the opposite sign to the bare product of inertia, so this is a real thing to get backwards.
 *
 * D. The voxel centre taken at its corner rather than its centre, on x only.                        3 RED
 *    Broad, as an off-by-half-a-cell should be: both tensor checks and the L's composition. Not the mass
 *    checks, correctly -- where a voxel IS does not change how much it weighs.
 *
 * E. looseFragments reports every component loose, anchored or not.                                 3 RED
 *    The piece-count assertion in section 1 and the loose/anchored partition in section 2. A coupler that
 *    dropped the floor into the physics engine would look exactly like this, and nothing else in the module
 *    would object.
 * --------------------------------------------------------------------------------------------------------- */
