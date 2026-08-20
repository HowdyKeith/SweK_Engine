// WebGLEngine/tools/krbnEmit.mjs — v2606
//
// Emit the blobulator as a Krbn scene: THE BONES GHOSTED INSIDE THE SKIN.
//
// Run:  node tools/krbnEmit.mjs > blob.krbn.ts
//       bun run render blob.krbn.ts        (in a Krbn checkout, with this file beside it)
//
// ---- WHERE THIS CAME FROM ----------------------------------------------------------------------------------------
//
// Keith: "can we make a hologram of a blobulator?" -- and he sent Krbn's API.md, which I had been blocked on.
//
// FIRST INSTINCT, MEASURED AND KILLED: a blob IS seven spheres -- blobPhantom.js:91 pushes {x, y, z, r, a} -- and
// Krbn has sphere(center, radius) as an EXACT analytic primitive. Seven calls and done.
//
// IT IS 75% WRONG. Measured, ray-marched from each lump's centre to the iso-0.5 crossing:
//
//     lump   its r      skin along +x    ratio      skin along -x    ratio
//      0     0.4615        0.8075        1.750         0.2788        0.604
//      1     0.5729        0.5249        0.916         0.4986        0.870
//      2     0.6309        0.3901        0.618         0.5334        0.845
//
// And the reason is the whole point of a metaball. THE WYVILL KERNEL HAS COMPACT SUPPORT -- a*(1-d^2/r^2)^3 is
// EXACTLY ZERO past r. So at lump 0's own radius:
//
//     d = 0.4615   lump 0 alone: 0.0000     all seven: 1.4046
//     d = 0.8075   lump 0 alone: 0.0000     all seven: 0.5002   <- the skin
//
// AT ITS OWN RADIUS LUMP 0 CONTRIBUTES NOTHING, AND THE SKIN IS 75% FURTHER OUT, HELD UP ENTIRELY BY NEIGHBOURS.
// A SPHERE IS WHERE ONE LUMP ENDS. THE SKIN IS WHERE SEVEN LUMPS AGREE. Krbn's spheres would be strictly
// interior, touching nothing -- SEVEN EXACT DRAWINGS OF THE WRONG OBJECT.
//
// ---- SO: BONES AND SKIN, WHICH IS THE HOLOGRAM ---------------------------------------------------------------------
//
// API.md gives exactly the three tools this needs, and it is not a coincidence -- it is a renderer built by
// someone who thinks about visibility:
//
//     hidden: "ghost"                  -- their own annotation says "(x-ray)"
//     .setImportance(0.3, { role: "context" })   -- quieter, ghosted
//     output: false                    -- mute an element's strokes while it STILL OCCLUDES
//
// So: the seven lumps as GHOSTED CONTEXT (the bones), the iso-surface as SUBJECT (the skin). An x-ray in
// pencil. THAT IS THE SAME PICTURE THE TOMOGRAPHY STACK HAS BEEN DRAWING SINCE v2560, ARRIVING FROM THE OTHER
// SIDE.
//
// ---- HONEST LIMITS, STATED NOT DISCOVERED --------------------------------------------------------------------------
//
// 1. THE SKIN IS BLOCKY. We have no marching cubes that emits { positions, triangles } -- blobulator.html uses
//    THREE.MarchingCubes, which builds a THREE geometry, not a MeshInput. So the skin here comes from OUR OWN
//    gated mesher (mesh/greedyMesh3d.js) sampling blobFieldAt >= ISO. THAT IS A VOXEL SKIN AND IT WILL LOOK
//    LIKE ONE. I am not going to call it smooth because I would like it to be.
//
// 2. But v2602 measured greedy's merge win: 6.95x on SMOOTH solids, 1.43x on noise. A BLOB IS SMOOTH, so this
//    is greedy's good case, not its bad one -- the quad count should land near the terrain end.
//
// 3. API.md warns imported meshes are "the young part of the engine" and to expect tinkering with weldEps. THAT
//    WARNING IS ABOUT IMPORTED STL/OBJ SOUP. THIS MESH IS GENERATED: shared vertices by construction, no weld
//    needed, no winding to repair. It is the easy case for them, not the hard one -- BUT I HAVE NOT RENDERED IT
//    IN KRBN AND I AM NOT CLAIMING IT LOOKS GOOD. I am claiming it is well-formed input.
import { makeBlobs, blobFieldAt } from "../simulation/tomo/blobPhantom.js";
import { greedyMesh3d } from "../mesh/greedyMesh3d.js";

export const ISO = 0.5;

/**
 * Sample the blob field on an N^3 lattice over [-ext, ext] and mesh the iso-surface with OUR mesher.
 * Returns Krbn's MeshInput shape EXACTLY: { positions: Vec3[], triangles: [a,b,c][] }.
 */
export function blobMeshInput(blobs, { n = 28, ext = 1.6, iso = ISO } = {}) {
    const cell = (2 * ext) / n;
    const toWorld = (i) => -ext + i * cell;
    // greedyMesh3d takes solid AS A CALLBACK -- v2602 learned this the hard way: the parameter is NAMED
    // `solid` but passing an array gets you "solid is not a function".
    const solid = (x, y, z) => {
        if (x < 0 || y < 0 || z < 0 || x >= n || y >= n || z >= n) return false;
        return blobFieldAt(toWorld(x), toWorld(y), toWorld(z), blobs) >= iso;
    };
    const quads = greedyMesh3d(solid, [n, n, n]);

    const positions = [];
    const triangles = [];
    const index = new Map();
    const vid = (x, y, z, ox = 0, oy = 0, oz = 0) => {
        x += ox; y += oy; z += oz;
        const k = x + "," + y + "," + z;
        let i = index.get(k);
        if (i === undefined) { i = positions.length; positions.push([toWorld(x), toWorld(y), toWorld(z)]); index.set(k, i); }
        return i;
    };
    // A QUAD IS { pos, normal, du, dv, w, h } -- A CORNER PLUS TWO EDGE VECTORS AND THEIR EXTENTS.
    // I GUESSED `q.corners || q.verts || q.quad` FIRST AND GOT AN EMPTY MESH: zero positions, zero triangles,
    // silently, because `continue` on a shape mismatch skips every quad without complaining. READ THE SHAPE.
    for (const q of quads) {
        const [px, py, pz] = q.pos, [ux, uy, uz] = q.du, [vx, vy, vz] = q.dv;
        const corner = (su, sv) => vid(px + ux * su, py + uy * su, pz + uz * su, vx * sv, vy * sv, vz * sv);
        const a = corner(0, 0), b = corner(q.w, 0), c = corner(q.w, q.h), d = corner(0, q.h);
        triangles.push([a, b, c], [a, c, d]);      // two triangles per quad, SHARED VERTICES BY CONSTRUCTION
    }
    return { positions, triangles };
}

/** The .krbn.ts source. Bones ghosted inside the skin, orbiting: a pencil hologram. */
export function krbnScene(blobs, mesh, { frames = 48, w = 640, h = 480 } = {}) {
    const bones = blobs.map((b) =>
        `scene.add(sphere([${b.x.toFixed(6)}, ${b.y.toFixed(6)}, ${b.z.toFixed(6)}], ${b.r.toFixed(6)}))\n` +
        `  .setImportance(0.3, { role: "context" })\n` +
        `  .style({ hidden: "ghost", wobble: 0.5, weight: 0.8 });`
    ).join("\n");

    return `// blob.krbn.ts -- generated by SweK tools/krbnEmit.mjs
//
// A HOLOGRAM OF THE BLOBULATOR: seven ghosted lumps (the bones) inside the iso-surface (the skin).
//
// The bones are NOT the skin, and that is measured, not assumed: the Wyvill kernel a*(1-d^2/r^2)^3 has COMPACT
// SUPPORT, so at lump 0's own radius its field is EXACTLY ZERO while the total field is 1.4046. The skin sits
// 75% further out, held up entirely by its neighbours. A SPHERE IS WHERE ONE LUMP ENDS; THE SKIN IS WHERE SEVEN
// LUMPS AGREE. Drawing only the spheres would be seven exact drawings of the wrong object.
//
// The skin is a VOXEL mesh from SweK's own greedy mesher sampling the field. It is blocky and it is meant to be.
import { Scene, sphere, Mesh, FrameSession, film, raw, type Camera } from "krbn";

const W = ${w}, H = ${h}, FRAMES = ${frames};

const cam = (a: number): Camera => ({
  eye: [5 * Math.sin(a), -5 * Math.cos(a), 2.2],
  target: [0, 0, 0],
  up: [0, 0, 1],
  projection: "orthographic",
  scale: 0.009,
  viewport: { width: W, height: H },
});

const scene = new Scene({
  svg: { background: "#0b0f14" },
  light: { direction: [-0.4, -0.5, -0.7] },
  style: { wobble: 0.45 },
});

// THE SKIN -- subject. Cross-hatched along the surface's own curved iso-parameter field.
scene.add(new Mesh(BLOB_MESH))
  .setImportance(1, { role: "subject" })
  .style({ weight: 1.3, hatch: { mode: "cross", angle: 20, spacingPx: 9, field: true } });

// THE BONES -- context, ghosted. API.md annotates hidden: "ghost" as x-ray, which is exactly what this is.
${bones}

const session = new FrameSession(scene);
export default film(
  FRAMES,
  (k) => raw(session.render(cam((2 * Math.PI) * k / FRAMES)).svg),
  { viewport: { width: W, height: H }, fps: 12 },
);

const BLOB_MESH = ${JSON.stringify(mesh)};
`;
}

// THE BROWSER HAS NO `process`, AND THIS LINE RAN AT MODULE TOP LEVEL. Importing this module into a page
// threw "process is not defined" BEFORE ANY OF ITS EXPORTS COULD BE USED -- the module was Node-only BY
// ACCIDENT, in three characters, and nothing said so until a browser tried.
if (typeof process !== "undefined" && import.meta.url === "file://" + process.argv[1]) {
    const blobs = makeBlobs(7, 20260715);
    const mesh = blobMeshInput(blobs);
    process.stdout.write(krbnScene(blobs, mesh));
}
