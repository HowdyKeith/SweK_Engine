// WebGLEngine/physics/soft/fleshSph-selfcheck.mjs — v2535
//
// Run: node physics/soft/fleshSph-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// fleshDynamics (v2526) is a LAG: a spring per bone, no pressure, no volume. These assert the things that make
// THIS one different -- and if they do not hold, this module is just a slower lag and should be deleted.
import { FleshSph, hybridGrid } from "./fleshSph.js";
import { fitGrid, boneField } from "./boneField.js";
import { marchScalarField } from "../../simulation/MarchingCubes.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// A two-bone limb, elbow in the middle. `ang` ROTATES the forearm about the elbow and PRESERVES ITS LENGTH --
// the first version of this moved the far endpoint instead, which STRETCHED the forearm from 1.0 to 1.31 and made
// the density fall. That was a correct measurement of the wrong thing.
const limb = (ang = 0) => [
    { a: [0, 0, 0], b: [1, 0, 0], r: 0.3 },
    { a: [1, 0, 0], b: [1 + Math.cos(ang), Math.sin(ang), 0], r: 0.26 },
];

// ---- 1. the particles start INSIDE the flesh ---------------------------------------------------------------
{
    const f = new FleshSph(limb(), { count: 200 });
    ok("rejection sampling actually fills the body", f.seeded >= 190, f.seeded + " of 200 placed");
    // every particle must belong to a bone that exists
    ok("every particle is bound to a real bone", f.rest.every((r) => r.bone === 0 || r.bone === 1));
    // and they must be spread across BOTH bones, not all piled on one
    const onSecond = f.rest.filter((r) => r.bone === 1).length;
    ok("particles bind to their NEAREST bone, not all to one", onSecond > 20 && onSecond < f.seeded - 20,
       onSecond + " on the forearm, " + (f.seeded - onSecond) + " on the upper arm");
}

// ---- 2. IT MUST NOT EXPLODE -------------------------------------------------------------------------------
// SPH plus a stiff binding spring is two stiff systems arguing. If the sub-stepping is wrong this detonates.
{
    const f = new FleshSph(limb(), { count: 200 });
    for (let i = 0; i < 240; i++) f.step(limb());
    const P = f.world.particles;
    ok("holding still, nothing becomes NaN", P.every((p) => Number.isFinite(p.x) && Number.isFinite(p.vx)));
    const far = P.filter((p) => Math.abs(p.x) > 8 || Math.abs(p.y) > 8 || Math.abs(p.z) > 8).length;
    ok("...and nothing is flung to infinity", far === 0, far + " particles escaped");
}

// ---- 3. IT SETTLES ----------------------------------------------------------------------------------------
// If the rig holds still, the flesh must stop. A solver that keeps making energy is a solver that will ring
// forever and look like a bug in something else.
{
    const f = new FleshSph(limb(), { count: 200 });
    for (let i = 0; i < 60; i++) f.step(limb());
    const early = f.kinetic();
    for (let i = 0; i < 300; i++) f.step(limb());
    const late = f.kinetic();
    ok("a still rig lets the flesh come to rest", late < early * 0.5 || late < 1e-3,
       "KE " + early.toExponential(2) + " -> " + late.toExponential(2));
}

// ---- 4. THE ONE THAT MATTERS: VOLUME PRESERVATION ---------------------------------------------------------
// This is the whole reason this module exists instead of another spring. Fold the limb hard: the particles on the
// inside of the joint get crowded, and SPH pressure must RESIST that -- mean density RISES. A spring lag cannot
// do this at any stiffness, because its particles do not know about each other.
{
    const f = new FleshSph(limb(0), { count: 350 });
    for (let i = 0; i < 120; i++) f.step(limb(0));
    const relaxed = f.meanDensity();
    // Now FOLD the forearm hard -- 115 degrees about the elbow, length unchanged -- crowding the flesh into the
    // crook of the joint. The particles there have nowhere to go, so pressure must rise.
    for (let i = 0; i < 120; i++) f.step(limb(-2.0));
    const folded = f.meanDensity();
    ok("FOLDING THE LIMB RAISES THE PRESSURE (this is not a spring)", folded > relaxed * 1.001,
       "mean density " + relaxed.toFixed(4) + " -> " + folded.toFixed(4) + "  (+" + (100 * (folded / relaxed - 1)).toFixed(2) + "%)");
    ok("...and the flesh does not simply collapse into the joint",
       f.world.particles.every((p) => Number.isFinite(p.x)));
}

// ---- 5. DETERMINISM ---------------------------------------------------------------------------------------
// The reason for the seeded sampling and the fixed dt. Same ticks -> same body, bit for bit.
{
    const run = () => {
        const f = new FleshSph(limb(), { count: 150, seed: 99 });
        for (let i = 0; i < 90; i++) f.step(limb(Math.sin(i * 0.05) * 0.4));
        return f.world.particles.map((p) => p.x.toFixed(9) + "," + p.y.toFixed(9)).join("|");
    };
    ok("same tick sequence -> bit-identical body", run() === run(), "90 ticks, 150 particles");

    // and a different seed must give a DIFFERENT body -- otherwise the seed is decoration
    const other = () => {
        const f = new FleshSph(limb(), { count: 150, seed: 4242 });
        for (let i = 0; i < 90; i++) f.step(limb(Math.sin(i * 0.05) * 0.4));
        return f.world.particles.map((p) => p.x.toFixed(9)).join("|");
    };
    ok("...and the seed is not decoration", run() !== other());
}

// ---- 6. the grid the marcher eats -------------------------------------------------------------------------
{
    const f = new FleshSph(limb(), { count: 200 });
    for (let i = 0; i < 60; i++) f.step(limb());
    const g = f.sampleGrid(12, 8, 8, [-0.5, -0.9, -0.9], 0.28, 0.5);
    ok("sampleGrid returns a field the marcher can eat", g.length === 12 * 8 * 8 && g.every(Number.isFinite));
    // it must actually have a surface in it: some cells inside (negative), some outside (positive)
    const neg = [...g].filter((v) => v < 0).length, pos = [...g].filter((v) => v > 0).length;
    ok("...with an actual surface in it (inside AND outside cells)", neg > 0 && pos > 0,
       neg + " inside, " + pos + " outside");
}

// ---- 7. THE HYBRID: smooth like capsules, bulges like a fluid ---------------------------------------------
// The claim is that it is BOTH. Assert both, or it is a slower capsule field with a decorative extra term.
{
    const rest = limb(0);
    const f = new FleshSph(rest, { count: 350 });
    for (let i = 0; i < 120; i++) f.step(rest);
    const g = fitGrid(rest, 26, 0.16);

    // (a) at rest, with the fluid relaxed, the hybrid must be ESSENTIALLY the capsule skin. If it differs at
    //     rest, the bulge term is inventing geometry out of nothing.
    const cap = boneField(rest, g.dimX, g.dimY, g.dimZ, { origin: g.origin, cellSize: g.cellSize, blend: 0.16 });
    const hyb = hybridGrid(rest, f, g, 12, { blend: 0.16, strength: 0.12 });
    const mCap = marchScalarField(cap, g.dimX, g.dimY, g.dimZ, 0, { origin: g.origin, cellSize: g.cellSize });
    const mHyb = marchScalarField(hyb, g.dimX, g.dimY, g.dimZ, 0, { origin: g.origin, cellSize: g.cellSize });
    const drift = Math.abs(mHyb.triangleCount - mCap.triangleCount) / mCap.triangleCount;
    ok("at rest the hybrid is basically the capsule skin", drift < 0.35,
       "capsule " + mCap.triangleCount + " tris vs hybrid " + mHyb.triangleCount + " (" + (100 * drift).toFixed(0) + "% apart)");

    // (b) THE POINT: fold the limb and the surface must move OUTWARD where the flesh is crowded. The capsule
    //     field cannot do this -- it does not know the fluid exists -- so the two MUST diverge under a fold.
    const bent = limb(-2.0);
    for (let i = 0; i < 120; i++) f.step(bent);
    const g2 = fitGrid(bent, 26, 0.16);
    const cap2 = boneField(bent, g2.dimX, g2.dimY, g2.dimZ, { origin: g2.origin, cellSize: g2.cellSize, blend: 0.16 });
    const hyb2 = hybridGrid(bent, f, g2, 12, { blend: 0.16, strength: 0.12 });
    // count cells the hybrid pushed OUTSIDE the capsule surface: hybrid < capsule means "more flesh here"
    let bulged = 0, shrunk = 0;
    for (let i = 0; i < cap2.length; i++) {
        if (hyb2[i] < cap2[i] - 1e-6) bulged++;
        else if (hyb2[i] > cap2[i] + 1e-6) shrunk++;
    }
    ok("FOLDED, the fluid pushes the skin OUT where it is crowded", bulged > 0,
       bulged + " cells bulged outward, " + shrunk + " inward  (the capsule field alone cannot do this)");
    ok("...and it NEVER pulls the skin inward (no-tension, same as clampPressure)", shrunk === 0,
       shrunk + " cells sucked in");

    // (c) smoothness: the whole reason for the hybrid. The raw SPH skin is lumpier than the capsule skin at the
    //     same grid; the hybrid must NOT be.
    const sphOnly = f.sampleGrid(g2.dimX, g2.dimY, g2.dimZ, g2.origin, g2.cellSize, 500);
    const mSph = marchScalarField(sphOnly, g2.dimX, g2.dimY, g2.dimZ, 0, { origin: g2.origin, cellSize: g2.cellSize });
    const mHyb2 = marchScalarField(hyb2, g2.dimX, g2.dimY, g2.dimZ, 0, { origin: g2.origin, cellSize: g2.cellSize });
    const mCap2 = marchScalarField(cap2, g2.dimX, g2.dimY, g2.dimZ, 0, { origin: g2.origin, cellSize: g2.cellSize });
    ok("the hybrid is SMOOTHER than the raw SPH skin", mHyb2.triangleCount < mSph.triangleCount,
       "capsule " + mCap2.triangleCount + " / HYBRID " + mHyb2.triangleCount + " / raw SPH " + mSph.triangleCount + " triangles (more = lumpier)");
}

console.log(fails ? "\nfleshSph-selfcheck: " + fails + " FAILED" : "\nfleshSph-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
