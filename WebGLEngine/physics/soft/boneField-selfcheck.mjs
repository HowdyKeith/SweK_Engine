// WebGLEngine/physics/soft/boneField-selfcheck.mjs — v2523
//
// Run: node physics/soft/boneField-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs, because a check not in the gate is not being run.
//
// These assert the four things that would silently ruin a soft body and look like an art problem:
//   1. the flesh actually contains the skeleton
//   2. the grid actually contains the flesh
//   3. smooth-min actually merges, rather than just costing time
//   4. the same bones give the same field, bit for bit
import { boneField, boneBounds, fitGrid, bonesFromTransforms } from "./boneField.js";
import { marchScalarField } from "../../simulation/MarchingCubes.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// A two-bone elbow: enough to test merging, small enough to run in a second.
const ARM = [
    { a: [0, 0, 0], b: [1, 0, 0], r: 0.2 },
    { a: [1, 0, 0], b: [1.8, 0, 0], r: 0.15 },
];

// ---- 1. the flesh contains the skeleton -------------------------------------------------------------------
// A point ON a bone must be INSIDE the surface (field < 0). If this fails the marched skin floats off the rig and
// the figure looks fine right up until it moves.
{
    const g = fitGrid(ARM, 40, 0);
    const f = boneField(ARM, g.dimX, g.dimY, g.dimZ, { origin: g.origin, cellSize: g.cellSize, blend: 0 });
    const at = (p) => {
        const x = Math.round((p[0] - g.origin[0]) / g.cellSize);
        const y = Math.round((p[1] - g.origin[1]) / g.cellSize);
        const z = Math.round((p[2] - g.origin[2]) / g.cellSize);
        return f[z * g.dimX * g.dimY + y * g.dimX + x];
    };
    ok("a point on a bone is inside the flesh", at([0.5, 0, 0]) < 0, "field = " + at([0.5, 0, 0]).toFixed(3));
    ok("a point well outside is outside", at([0.5, 0.9, 0]) > 0, "field = " + at([0.5, 0.9, 0]).toFixed(3));
}

// ---- 2. the grid contains the flesh -----------------------------------------------------------------------
// A surface that touches the grid wall marches OPEN — a figure with its hands cut off. fitGrid's whole job is to
// stop that, so it is worth an assertion rather than an eyeball.
{
    const blend = 0.25;
    const g = fitGrid(ARM, 44, blend);
    const f = boneField(ARM, g.dimX, g.dimY, g.dimZ, { origin: g.origin, cellSize: g.cellSize, blend });
    let wallMin = Infinity;
    const idx = (x, y, z) => z * g.dimX * g.dimY + y * g.dimX + x;
    for (let z = 0; z < g.dimZ; z++)
        for (let y = 0; y < g.dimY; y++)
            for (let x = 0; x < g.dimX; x++) {
                const onWall = x === 0 || y === 0 || z === 0 || x === g.dimX - 1 || y === g.dimY - 1 || z === g.dimZ - 1;
                if (onWall) wallMin = Math.min(wallMin, f[idx(x, y, z)]);
            }
    ok("every boundary cell is outside the surface (the mesh closes)", wallMin > 0, "closest wall cell = " + wallMin.toFixed(3));
    const bb = boneBounds(ARM, blend * 0.5);
    const inside = bb.min[0] >= g.origin[0] && bb.max[0] <= g.origin[0] + (g.dimX - 1) * g.cellSize;
    ok("fitGrid's box contains the bone bounds", inside);
}

// ---- 3. smooth-min actually merges -------------------------------------------------------------------------
// The point of smin over min. At the elbow, the blended field must be STRICTLY LOWER (further inside) than the
// hard union — that lower value IS the fillet. If blend did nothing, this passes silently with k=0 and the flesh
// has a visible crease at every joint.
{
    const g = fitGrid(ARM, 40, 0.3);
    const hard = boneField(ARM, g.dimX, g.dimY, g.dimZ, { origin: g.origin, cellSize: g.cellSize, blend: 0 });
    const soft = boneField(ARM, g.dimX, g.dimY, g.dimZ, { origin: g.origin, cellSize: g.cellSize, blend: 0.3 });
    // just outside the elbow, where the two capsules are both near
    const px = 1.0, py = 0.22, pz = 0;
    const i = Math.round((pz - g.origin[2]) / g.cellSize) * g.dimX * g.dimY
            + Math.round((py - g.origin[1]) / g.cellSize) * g.dimX
            + Math.round((px - g.origin[0]) / g.cellSize);
    ok("smooth-min pulls the elbow outward (it is a fillet, not a no-op)",
       soft[i] < hard[i], "hard " + hard[i].toFixed(3) + " -> soft " + soft[i].toFixed(3));
    ok("blend 0 is exactly plain min (no surprise default)",
       boneField(ARM, 8, 8, 8, { cellSize: 0.5, blend: 0 })[0] === boneField(ARM, 8, 8, 8, { cellSize: 0.5 })[0]);
}

// ---- 4. determinism ----------------------------------------------------------------------------------------
// The reason any of this is worth building on a rig whose whole selling point is that two machines agree. A
// deterministic skeleton wearing a non-deterministic skin throws the property away at the last step.
{
    const g = fitGrid(ARM, 36, 0.2);
    const o = { origin: g.origin, cellSize: g.cellSize, blend: 0.2 };
    const f1 = boneField(ARM, g.dimX, g.dimY, g.dimZ, o);
    const f2 = boneField(ARM, g.dimX, g.dimY, g.dimZ, o);
    let bitSame = f1.length === f2.length;
    for (let i = 0; bitSame && i < f1.length; i++) if (f1[i] !== f2[i]) bitSame = false;
    ok("same bones -> bit-identical field", bitSame, f1.length.toLocaleString() + " cells");

    const m1 = marchScalarField(f1, g.dimX, g.dimY, g.dimZ, 0, { origin: g.origin, cellSize: g.cellSize });
    const m2 = marchScalarField(f2, g.dimX, g.dimY, g.dimZ, 0, { origin: g.origin, cellSize: g.cellSize });
    ok("and the same mesh", JSON.stringify(m1.positions) === JSON.stringify(m2.positions), m1.triangleCount + " triangles");

    // Reordering the bones must NOT change the field. If it does, the field depends on evaluation order and two
    // peers iterating a body map differently would grow different skin on the same skeleton.
    const rev = boneField([...ARM].reverse(), g.dimX, g.dimY, g.dimZ, o);
    let orderFree = true, worst = 0;
    for (let i = 0; i < f1.length; i++) { const d = Math.abs(f1[i] - rev[i]); if (d > worst) worst = d; }
    orderFree = worst < 1e-6;
    ok("bone ORDER does not change the field", orderFree, "worst difference " + worst.toExponential(2));
}

// ---- 5. degenerate input -----------------------------------------------------------------------------------
{
    const empty = boneField([], 4, 4, 4, {});
    ok("no bones -> all outside (not NaN, not a crash)", empty.every((v) => v > 0));
    const dot = boneField([{ a: [0, 0, 0], b: [0, 0, 0], r: 0.5 }], 8, 8, 8, { origin: [-1, -1, -1], cellSize: 0.25 });
    ok("a zero-length bone is a sphere, not a division by zero", dot.every((v) => Number.isFinite(v)));
}

// ---- 6. bonesFromTransforms: the converter that lets the skin follow the SIMULATION ------------------------
// This is the piece most likely to be subtly wrong in a way that looks like an art problem: a bone on the wrong
// axis gives a limb that is fat and short instead of thin and long, and you would blame the blend.
{
    const ident = [0, 0, 0, 1];
    // a forearm-shaped box at the origin, unrotated: long in x, thin in y and z
    const xf = new Float32Array([0, 0, 0, ...ident]);
    const bones = bonesFromTransforms(xf, [[0.5, 0.1, 0.1]]);
    ok("a box becomes one bone", bones.length === 1);
    const b = bones[0];
    ok("the bone lies along the box's LONGEST axis", Math.abs(b.a[0] - -0.4) < 1e-6 && Math.abs(b.b[0] - 0.4) < 1e-6,
       "a=[" + b.a.map((v) => v.toFixed(2)) + "] b=[" + b.b.map((v) => v.toFixed(2)) + "]");
    ok("the radius comes from the SHORT axes", Math.abs(b.r - 0.1) < 1e-9, "r = " + b.r);
    // the capsule (segment + r) must span exactly the box's length, not overshoot it
    ok("the capsule's caps land on the box's ends, not past them",
       Math.abs((b.b[0] + b.r) - 0.5) < 1e-6, "reach+r = " + (b.b[0] + b.r).toFixed(3) + ", box half = 0.5");

    // rotate the same box 90 degrees about z: its long axis must now point along WORLD y
    const s2 = Math.SQRT1_2;
    const rot = new Float32Array([0, 0, 0, 0, 0, s2, s2]);
    const rb = bonesFromTransforms(rot, [[0.5, 0.1, 0.1]])[0];
    ok("rotating the body rotates the bone", Math.abs(rb.b[1] - 0.4) < 1e-6 && Math.abs(rb.b[0]) < 1e-6,
       "b = [" + rb.b.map((v) => v.toFixed(3)) + "]  (expected the long axis along world y)");

    // a CUBE has no long axis. It must still produce a finite bone rather than NaN.
    const cube = bonesFromTransforms(new Float32Array([1, 2, 3, ...ident]), [[0.3, 0.3, 0.3]])[0];
    ok("a cube is a sphere, not a NaN", cube.a.every(Number.isFinite) && Math.abs(cube.r - 0.3) < 1e-9);

    // skip must actually skip -- the ground slab is body 0 in every rig page and must not become a bone
    ok("skip leaves the ground out",
       bonesFromTransforms(new Float32Array([0,0,0,...ident, 0,0,0,...ident]), [[9,0.5,9],[0.5,0.1,0.1]], { skip: [0] }).length === 1);
}

console.log(fails ? "\nboneField-selfcheck: " + fails + " FAILED" : "\nboneField-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
