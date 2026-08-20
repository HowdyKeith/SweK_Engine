// WebGLEngine/physics/soft/volume-selfcheck.mjs — v2562
//
// Run: node physics/soft/volume-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// BANACH-TARSKI IS NOT SOLVED. IT IS A THEOREM AND IT IS TRUE.
//
// A ball cuts into five pieces and reassembles, by rigid motions alone, into two balls identical to the original.
// What saves it from destroying mathematics is that THE PIECES HAVE NO VOLUME -- not zero, NONE. They are
// non-measurable. Volume is not violated; VOLUME WAS NEVER DEFINED ON THEM.
//
// It cannot happen here, structurally: the construction needs uncountably many choices, and FLOATS ARE COUNTABLE.
// Every set this engine can represent is measurable. THE PARADOX IS UNREACHABLE FROM A FINITE MACHINE.
//
// So it is worth pointing at for one reason: v2538 claimed "the hybrid PRESERVES VOLUME, which the spring cannot
// do at any stiffness". Banach-Tarski is the sharpest statement that VOLUME IS AN ASSUMPTION YOU ARE ENTITLED TO,
// NOT A FACT ABOUT SHAPES. The engine is entitled to it because of floats. It can still lose volume by
// DISCRETISATION -- and that is measurable, so this file measures it.
//
// ---- I ALMOST SHIPPED THE WRONG STORY -----------------------------------------------------------------------
//
// The first pass compared the marched mesh against the field's cell count and reported errors up to -9.76%, with
// the error NOT MONOTONIC in grid resolution (32 beat 48). The obvious headline was "marching cubes does not
// conserve volume".
//
// THAT HEADLINE WAS AN ARTEFACT OF THE RULER. Calibrating both against A SPHERE WHOSE VOLUME IS KNOWN:
//
//     analytic (4/3 pi r^3):  2.14466
//     marched mesh:           2.13754   (-0.33%)
//     cell count:             2.12609   (-0.87%)
//
// THE MESH IS MORE ACCURATE THAN THE THING I WAS CALLING TRUTH. Cell-counting is a staircase; marching cubes
// interpolates the crossing. So the "error" in the first table was mostly the ruler being wrong, and the
// non-monotonicity was the ruler wobbling, not the mesh.
//
// THE ONLY WAY TO KNOW WAS A SHAPE WHOSE ANSWER EXISTS INDEPENDENTLY. Two rulers disagreeing tells you they
// disagree. It does not tell you which one is lying. THAT IS THE WHOLE LESSON, AND IT IS THE SAME ONE
// BANACH-TARSKI TEACHES AT THE PATHOLOGICAL END: A MEASUREMENT IS NOT A FACT ABOUT A SHAPE UNTIL YOU SAY WHAT
// MEASURED IT.
import { FleshSph, hybridGrid } from "./fleshSph.js";
import { fitGrid } from "./boneField.js";
import { marchScalarField } from "../../simulation/MarchingCubes.js";
import { meshVolume, fieldVolume, meshClosure } from "./volume.js";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. CALIBRATE AGAINST A KNOWN ANSWER ---------------------------------------------------------------------
// Not against another approximation. This is the check that reversed the finding.
{
    const R = 0.8, n = 40, cs = 2.4 / n, origin = [-1.2, -1.2, -1.2];
    const sf = new Float32Array(n * n * n);
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const px = origin[0] + x * cs, py = origin[1] + y * cs, pz = origin[2] + z * cs;
        sf[x + y * n + z * n * n] = Math.hypot(px, py, pz) - R;
    }
    const m = marchScalarField(sf, n, n, n, 0, { origin, cellSize: cs });
    const truth = (4 / 3) * Math.PI * R * R * R;
    const mv = meshVolume(m.positions), fv = fieldVolume(sf, cs);
    const meshErr = Math.abs(mv / truth - 1), fieldErr = Math.abs(fv / truth - 1);

    ok("the marched mesh of a sphere is within 1% of (4/3)pi r^3", meshErr < 0.01,
       mv.toFixed(5) + " vs " + truth.toFixed(5) + " = " + (meshErr * 100).toFixed(2) + "%");
    ok("THE MESH BEATS CELL-COUNTING -- the ruler I nearly called truth", meshErr < fieldErr,
       "mesh " + (meshErr * 100).toFixed(2) + "% vs cells " + (fieldErr * 100).toFixed(2) + "%. Cell-counting is a STAIRCASE; marching cubes INTERPOLATES THE CROSSING. The first pass of this measurement compared mesh-to-cells and reported -9.76% error, non-monotonic in resolution. THAT WAS THE RULER WOBBLING, NOT THE MESH. Two rulers disagreeing tells you they disagree, NOT WHICH ONE IS LYING.");
    ok("...and the sphere's mesh is CLOSED", meshClosure(m.positions).closed,
       "0 boundary edges of " + meshClosure(m.positions).edges + ". AN UNCLOSED MESH HAS NO VOLUME IN THE ONLY SENSE THAT MATTERS, and meshVolume() would cheerfully return a number for it anyway.");
}

// ---- 2. the flesh, at the grid the page actually uses ---------------------------------------------------------
{
    const bones = [{ a: [0, 0, 0], b: [1, 0, 0], r: 0.3 }, { a: [1, 0, 0], b: [2, 0, 0], r: 0.26 }];
    const f = new FleshSph(bones, { count: 500, seed: 42 });
    for (let i = 0; i < 40; i++) f.step(bones);

    // flesh.html:123 -- `let cells = 28, blend = 0.16;`. Pinned to the PAGE's number, not a flattering one.
    const g = fitGrid(bones, 28, 0.16);
    const field = hybridGrid(bones, f, g, 12, { blend: 0.16, strength: 0.12 });
    const m = marchScalarField(field, g.dimX, g.dimY, g.dimZ, 0, { origin: g.origin, cellSize: g.cellSize });
    const cl = meshClosure(m.positions);

    ok("the flesh skin at the page's own grid (28) is CLOSED", cl.closed,
       cl.boundaryEdges + " boundary edges of " + cl.edges + " -- v2538's claim was about a closed surface, and this is the check that it IS one");
    ok("...and it has a volume worth quoting", meshVolume(m.positions) > 0.01,
       meshVolume(m.positions).toFixed(5) + " vs the field's " + fieldVolume(field, g.cellSize).toFixed(5) +
       " (" + ((meshVolume(m.positions) / fieldVolume(field, g.cellSize) - 1) * 100).toFixed(2) + "% apart -- and per the sphere above, THE MESH IS THE BETTER OF THE TWO)");
    ok("...and marching a finer grid does not change the answer much", (() => {
        const g2 = fitGrid(bones, 40, 0.16);
        const f2 = hybridGrid(bones, f, g2, 12, { blend: 0.16, strength: 0.12 });
        const m2 = marchScalarField(f2, g2.dimX, g2.dimY, g2.dimZ, 0, { origin: g2.origin, cellSize: g2.cellSize });
        return Math.abs(meshVolume(m2.positions) / meshVolume(m.positions) - 1) < 0.12;
    })(), "if 28 and 40 disagreed wildly, 28 would be a guess wearing a number");
}

// ---- 3. the tools do not lie about their own limits ------------------------------------------------------------
{
    // An open box. meshVolume WILL return a number for it. That number is meaningless, and meshClosure is the
    // only thing standing between that number and a claim.
    const open = new Float32Array([0,0,0, 1,0,0, 0,1,0]);   // one lonely triangle
    ok("meshClosure CATCHES an unclosed mesh", !meshClosure(open).closed,
       meshClosure(open).boundaryEdges + " boundary edges -- and meshVolume returns " + meshVolume(open).toFixed(4) +
       " for it regardless. A NUMBER IS NOT A VOLUME UNTIL SOMETHING CHECKS THE SURFACE IS CLOSED.");
    ok("...and an empty mesh has volume 0, not NaN", meshVolume(new Float32Array(0)) === 0);
    ok("fieldVolume counts cells, and says so in its name", fieldVolume(new Float32Array([-1, -1, 1, 1]), 2) === 16,
       "2 cells below iso x 2^3 = 16. IT IS A STAIRCASE AND IT IS THE WORSE RULER -- kept because the disagreement between two rulers is itself information.");
}

console.log(fails ? "\nvolume-selfcheck: " + fails + " FAILED" : "\nvolume-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
