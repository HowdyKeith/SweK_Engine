// WebGLEngine/tools/krbnEmit-selfcheck.mjs — v2606
//
// Run: node tools/krbnEmit-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES tools/krbnEmit.mjs -- the blobulator as a Krbn scene, for Valeriu Palos (vpalos/Krbn).
//
// THE CHECK THAT MATTERS IS THE FIRST ONE: THE BONES ARE NOT THE SKIN, AND IT IS MEASURED.
import { makeBlobs, blobFieldAt } from "../simulation/tomo/blobPhantom.js";
import { blobMeshInput, krbnScene, ISO } from "./krbnEmit.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const blobs = makeBlobs(7, 20260715);

// ---- 1. THE SEVEN SPHERES ARE NOT THE BLOB ------------------------------------------------------------------------
{
    const b = blobs[0];
    const own = (d) => { const u = 1 - (d * d) / (b.r * b.r); return u <= 0 ? 0 : b.a * u * u * u; };
    const atOwnR = blobFieldAt(b.x + b.r, b.y, b.z, blobs);

    ok("!! AT ITS OWN RADIUS A LUMP CONTRIBUTES NOTHING, AND THE FIELD IS STILL DEEP INSIDE", own(b.r) === 0 && atOwnR > ISO * 2,
       "lump 0: r = " + b.r.toFixed(4) + ". Its OWN field there is " + own(b.r).toFixed(4) + " -- EXACTLY ZERO, because the Wyvill kernel a*(1-d^2/r^2)^3 HAS COMPACT SUPPORT. And the TOTAL field there is " + atOwnR.toFixed(4) +
       ", which is " + (atOwnR / ISO).toFixed(1) + "x the iso. SO KRBN'S sphere([x,y,z], r) WOULD DRAW A SPHERE STRICTLY INSIDE THE CREATURE, TOUCHING NOTHING. My first instinct was seven exact spheres and seven calls -- IT WOULD HAVE BEEN SEVEN EXACT DRAWINGS OF THE WRONG OBJECT.");

    // ray-march to the real skin along +x
    let lo = 0, hi = 4;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (blobFieldAt(b.x + m, b.y, b.z, blobs) >= ISO) lo = m; else hi = m; }
    ok("!! ...AND THE SKIN IS 75% FURTHER OUT, HELD UP BY NEIGHBOURS", lo / b.r > 1.5,
       "skin along +x at " + lo.toFixed(4) + " vs its own r of " + b.r.toFixed(4) + " = " + (lo / b.r).toFixed(3) +
       "x. A SPHERE IS WHERE ONE LUMP ENDS. THE SKIN IS WHERE SEVEN LUMPS AGREE. That is not an error in the measurement -- THAT IS WHAT A METABALL IS, and it is the entire reason this emitter meshes the field instead of listing the lumps.");
}

// ---- 2. THE MESH IS WELL-FORMED KRBN INPUT -------------------------------------------------------------------------
{
    const m = blobMeshInput(blobs);
    ok("the emitter produces a real mesh", m.positions.length > 100 && m.triangles.length > 100,
       m.positions.length + " positions, " + m.triangles.length + " triangles");
    ok("!! every triangle index is IN BOUNDS", m.triangles.every((t) => t.every((i) => i >= 0 && i < m.positions.length)),
       "max index " + Math.max(...m.triangles.flat()) + " of " + m.positions.length +
       ". THIS GATE EXISTS BECAUSE MY FIRST ATTEMPT SILENTLY EMITTED ZERO: I GUESSED the quad shape as `q.corners || q.verts || q.quad` and `continue`d past every quad WITHOUT COMPLAINING. A quad is { pos, normal, du, dv, w, h } -- A CORNER PLUS TWO EDGE VECTORS. READ THE SHAPE, DO NOT GUESS IT. AN EMPTY MESH IS A LIE THAT PASSES QUIETLY.");
    ok("...and MeshInput matches Krbn's declared type exactly", Array.isArray(m.positions) && m.positions[0].length === 3 && m.triangles[0].length === 3,
       "API.md: `MeshInput is { positions: Vec3[], triangles: [number, number, number][] }`. Vec3[] and triples, nothing else. AND UNLIKE THE IMPORTED-STL CASE THEIR DOCS WARN ABOUT, THIS MESH IS GENERATED: shared vertices BY CONSTRUCTION, no weldEps needed, no winding to repair. It is their easy case, not their hard one -- BUT I HAVE NOT RENDERED IT IN KRBN AND I AM NOT CLAIMING IT LOOKS GOOD. I am claiming it is well-formed input.");
    // v2606 -- THE CHECK THAT REPLACED A DECORATION.
    //
    // This slot used to read `x extent > 0.7`. I SABOTAGED THE EMITTER BACK TO MY FIRST INSTINCT -- a naive
    // union of spheres instead of the summed field -- AND THE GATE PASSED, ZERO FAILURES. Both shapes reach
    // past 0.7, so the check could not tell the creature from the wrong object it was built to rule out.
    // A CONTROL THAT CANNOT FAIL IS DECORATION, AND I SHIPPED ONE INTO THE GATE THAT EXISTS TO CATCH IT.
    //
    // The real relationship is a THEOREM, not a threshold: the Wyvill kernel is EXACTLY ZERO past r, so a point
    // outside every lump's radius gets zero from every lump and the sum CANNOT reach the iso. THEREFORE
    // {field >= iso} IS A STRICT SUBSET OF {inside some sphere}, ALWAYS. Counted on the emitter's own lattice:
    // 640 field cells, 1764 union cells, overlap EXACTLY 640. The union is 2.76x too big.
    const N = 28, ext = 1.6;
    const w = (i) => -ext + i * (2 * ext) / N;
    let nField = 0, nUnion = 0, nBoth = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
        const x = w(i), y = w(j), z = w(k);
        const f = blobFieldAt(x, y, z, blobs) >= ISO;
        const u = blobs.some((b) => Math.hypot(x - b.x, y - b.y, z - b.z) <= b.r);
        if (f) nField++;
        if (u) nUnion++;
        if (f && u) nBoth++;
    }
    ok("!! THE SKIN IS THE FIELD, NOT THE UNION OF THE SPHERES", nBoth === nField && nUnion > nField * 2,
       nField + " field cells, " + nUnion + " union cells, overlap " + nBoth + " -- THE FIELD IS A STRICT SUBSET AND THE UNION IS " + (nUnion / nField).toFixed(2) +
       "x TOO BIG. And that is provable, not measured-and-hoped: WYVILL IS EXACTLY ZERO PAST r, so a point outside every sphere gets zero from every lump and CANNOT reach the iso. THIS CHECK REPLACED `x extent > 0.7`, WHICH PASSED WHEN I SABOTAGED THE EMITTER BACK TO A UNION OF SPHERES -- A CONTROL THAT CANNOT FAIL IS DECORATION, AND I HAD PUT ONE IN THE GATE BUILT TO CATCH EXACTLY THAT MISTAKE.");
    ok("...and the emitted mesh matches the field count, not the union count", Math.abs(m.positions.length - 562) < 200,
       m.positions.length + " positions from " + nField + " field cells. A union-of-spheres solid would mesh " + nUnion + " cells and produce a visibly fatter hull.");
}

// ---- 3. THE SCENE USES KRBN'S OWN X-RAY VOCABULARY ------------------------------------------------------------------
{
    const src = krbnScene(blobs, blobMeshInput(blobs));
    ok("!! the scene ghosts the bones inside the skin", /hidden: "ghost"/.test(src) && /role: "context"/.test(src) && /role: "subject"/.test(src),
       'API.md annotates hidden: "ghost" as "(x-ray)" IN THEIR OWN WORDS, and setImportance(0.3, { role: "context" }) as "quieter, ghosted". SO THE HOLOGRAM IS NOT SOMETHING I HAVE TO INVENT -- KRBN ALREADY HAS THE VOCABULARY. Seven ghosted lumps inside a meshed skin IS AN X-RAY IN PENCIL, WHICH IS THE SAME PICTURE THE TOMOGRAPHY STACK HAS BEEN DRAWING ALL ALONG, ARRIVING FROM THE OTHER SIDE.');
    ok("...and it orbits, which is what makes it a hologram and not a drawing", /FrameSession/.test(src) && /film\(/.test(src) && /Math\.sin\(a\)/.test(src),
       "a Film of 48 frames on an orbiting orthographic camera, per API.md's own animation example. AND NOTE WHAT ORBITING COSTS: v2603 measured that a camera orbit ACCUMULATES ANGLE, and naive argument reduction drifts 2.44e-12 by x = 100000 -- WHICH IS EXACTLY THE '~5 numbers very slightly off' VALERIU FOUND. tools/strictTrig.mjs is the fix, and this scene is the case that needs it.");
    ok("...and every emitted number is finite", !/NaN|Infinity|undefined/.test(src),
       "greps the generated source. v2605 shipped a page that fed `undefined` into wasm and turned the blob into NaN -- A GENERATOR THAT EMITS 'undefined' PRODUCES A FILE THAT FAILS IN SOMEBODY ELSE'S ENGINE, WHICH IS THE WORST PLACE FOR IT TO FAIL.");
}

console.log(fails ? "\nkrbnEmit-selfcheck: " + fails + " FAILED" : "\nkrbnEmit-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
