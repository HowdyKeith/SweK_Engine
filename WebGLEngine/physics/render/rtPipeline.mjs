// WebGLEngine/physics/render/rtPipeline.mjs -- v4418
//
// *** FOUR OF VULKAN'S FIVE RAY-TRACING SHADER STAGES WERE ALREADY IN v4417'S LOOP. THEY HAD NO NAMES. ***
//
// #164 offered two roads: the compute transplant, or WebRTX's hit shaders. v4417 took the first. This is the
// second, and the first thing to say is what it is NOT: codedhead/webrtx is NOT built or vendored here.
// ui/webrtxBrowser.js (v4118) already settled that -- upstream publishes no dist, so there is nothing to pin,
// and vendoring ~3.6 MB of build artefacts nobody can review in a diff was refused with reasons. MEASURED
// AGAIN THIS ROUND rather than assumed from that note: cargo 1.94.1 and node 22 are here, `wasm-pack` is NOT,
// and vendor/webrtx does not exist. The binary road is shut on this box.
//
// *** SO THIS TAKES THE STRUCTURE, WHICH IS THE PART WORTH TAKING ANYWAY. *** WebRTX's contribution is not a
// renderer, it is a SHAPE: Vulkan's ray-tracing pipeline -- raygen, intersection, any-hit, closest-hit, miss,
// dispatched through a SHADER BINDING TABLE -- expressed as plain WebGPU compute. And v4118's own honest note
// says what it never got to: "NO IMAGE WAS EVER RENDERED here -- no raygen shader was compiled and no pass was
// dispatched. 'The pipeline exists' is not 'it draws'." That gap is what this closes, from the other side.
//
// ---- WHAT WAS MEASURED BEFORE ANYTHING WAS WRITTEN --------------------------------------------------------
//
// Probing v4417's generated WGSL for each stage:
//
//     raygen        generate a camera ray            PRESENT   inlined, unnamed
//     intersection  procedural sphere hit            PRESENT   inlined, unnamed  (raySphere)
//     closest-hit   shade the hit and continue       PRESENT   inlined, unnamed  (throughput *= albedo)
//     miss          environment radiance             PRESENT   inlined, unnamed  (skyOf)
//     any-hit       alpha / transparency             ABSENT    genuinely not there
//
//     shader binding table                           ABSENT
//     geometries the shader can hold                 EXACTLY ONE -- centre and radius are scalars
//
// *** THE MONOLITH IS NOT MISSING THE STAGES. IT IS MISSING THE SEAMS. *** That is a much smaller and much
// more useful finding than "the tree has no ray tracing pipeline", and it is why this round is a REARRANGEMENT
// with a capability at the end of it rather than a rewrite.
//
// ---- THE CAPABILITY, AND WHY IT IS NOT COSMETIC -------------------------------------------------------------
//
// A refactor that changes no behaviour is a refactor, and this tree does not ship those on their own. The thing
// the seams buy is the thing the monolith cannot express AT ALL: MORE THAN ONE GEOMETRY WITH MORE THAN ONE
// SHADING RULE IN ONE DISPATCH. v4417's shader has `albedo` as a single uniform scalar; there is nowhere to put
// a second one. With a binding table the geometry index selects a RECORD, and the record carries which
// closest-hit runs and with what parameters -- which is precisely what an SBT is for.
//
// *** AND THE ORACLE SURVIVES THE SECOND GEOMETRY, WHICH IS WHY THIS ROUND IS CHECKABLE AT ALL. *** v4417's
// furnace is bit-exact because its values are dyadic. Two spheres INTERREFLECT -- a bounce off one can land on
// the other -- so a path's contribution becomes a PRODUCT of albedos rather than a single one. Measured before
// relying on it: with both albedos dyadic, every product is dyadic too, and a 24x24 two-sphere furnace has ZERO
// non-representable pixels at 16 spp (69 distinct values, minimum 0.132813, so the interreflection is really
// happening and not being dodged). THE BIT-EXACT COMPARISON THEREFORE EXTENDS TO THE MULTI-GEOMETRY CASE, and
// the new capability is graded by the same instrument as the old one rather than by a new tolerance.
//
// ---- WHERE THE ORACLE STOPS, AND IT WAS FOUND BY RUNNING RATHER THAN BY THINKING ---------------------------
//
// One geometry is bit-exact BY AN ARGUMENT. Two or more is bit-exact only AS AN OBSERVATION, and the argument
// that carried the first case is exactly what is missing: a bounce can now land on a NEIGHBOUR, so which route
// a path takes depends on a direction f32 and f64 disagree about. Measured:
//
//     two spheres, apart      24/16, 32/64, 48/16   ->  0, 0, 0 differing
//     two spheres, TOUCHING   24/16, 32/64, 48/16   ->  0, 0, 0 differing
//     THREE spheres           32x32 spp=64          ->  1 of 1024 differing
//
// *** THE BOUNDARY IS REAL AND IT IS REACHED AT THREE. *** And the one differing pixel is diagnosable rather
// than mysterious: its delta times spp is 1.578, so ONE SAMPLE OF SIXTY-FOUR TOOK A DIFFERENT ROUTE. A rounding
// drift would be ~1e-7. So the gate does not assert that multi-geometry agreement is perfect -- it asserts that
// the values stay dyadic (they do, 0 of 1024 non-representable), that agreement stays above 99.5%, and that
// EVERY disagreement has the shape of a whole flipped sample rather than of a drifting port.
//
// ---- AND THE FURNACE IS BLIND TO THE MATERIAL TOO, WHICH IS THE SAME FACT A THIRD TIME --------------------
//
// The first draft of the gate asserted that a mirror record and a lambertian record differ on more than 20
// pixels of 576. IT MEASURED 15. The guess was wrong and the reason is this family's own subject recurring:
// IN A UNIFORM ENVIRONMENT EVERY BOUNCE DIRECTION RETURNS THE SAME RADIANCE, so a mirror and a diffuse produce
// the same pixel; the 15 that differ are only the paths that happened to strike the other sphere. On a gradient
// sky the same pair differs on 70 -- 4.7x more.
//
//     the furnace cannot see the SAMPLER          v4417 section 4
//     the furnace cannot see a broken SEEDING     v3487, pathTracer.mjs's own comment
//     the furnace cannot see the MATERIAL         here
//
// Three sites, three rounds, ONE FACT: a constant environment makes the outgoing direction irrelevant. Both
// numbers are kept in the gate because the GAP between them is the evidence, not a detail.
//
// ---- WGSL HAS NO FUNCTION POINTERS, AND NEITHER DOES WEBRTX ------------------------------------------------
//
// A real SBT is an indirection: the record names a shader and the hardware jumps to it. WGSL cannot do that, so
// the dispatch here is a `switch` on the record's shader index. THAT IS NOT A SHORTCUT AROUND THE MECHANISM --
// it is what WebRTX does too, because it compiles the whole pipeline down to one compute kernel for exactly the
// same reason. The faithful part is that THE BINDING IS DATA: which shader runs for a geometry is a value in a
// buffer, not a branch written at the call site, so adding a geometry never edits the traversal.
//
// ---- WHAT THIS DOES NOT CLAIM -------------------------------------------------------------------------------
//
// That this is WebRTX, or compatible with it: no SPIR-V, no GLSL front end, no naga, and no Vulkan API surface.
// That any-hit exists: it does not, and nothing here pretends the stage list is complete. And that any of it
// runs faster than v4417's monolith -- the seams are for expressiveness, and no timing claim is made.
//
// ---- THIS ROUND -- THE BVH THE PARAGRAPH ABOVE USED TO SAY WAS MISSING ---------------------------------------
//
// (Not stamped with a vNNNN: this round has not been through the ship ritual, and the next number is decided
// there, not guessed here -- v4418 is the last one this file can actually verify against its own history.)
//
// It was the single biggest thing WebRTX had that this file did not, and the fix was not to write one: this
// tree already has one, in mesh/meshBVH.mjs -- a binned-SAH build over a flat triangle buffer, with a
// near-child-first, best-t-pruning traversal, taken from gkjohnson/three-mesh-bvh and already carrying its own
// gate. The acceleration structure is BUILT ON THE CPU (SAH binning is a sort-and-bucket algorithm, not a
// dispatch), then its nodes and triangles are cast down to f32 and handed to the GPU as four read-only storage
// buffers. What runs on the device is a PORT of meshBVH.mjs's own `_hitBox`/`raycastFirst` -- same node layout
// (meta[0]<0 marks a leaf, carrying start/count; an interior node carries left/right), same near-child-first
// stack order, same "both comparisons are >/< so a NaN box test can only ever be conservative" argument -- with
// one adaptation MEASURED rather than assumed: WGSL's own spec leaves f32 division by zero "indeterminate",
// unlike JS's IEEE-754-guaranteed Infinity, so a ray direction of exactly 0 on an axis gets a large finite
// sentinel (1e30) instead of relying on a division producing true Infinity on every backend.
//
// A triangle mesh is not another sphere: it is not four floats in the uniform block, it is thousands of them in
// a storage buffer. So it does not go through MAX_GEOMETRY -- it is ONE extra, optional geometry slot, index
// `nGeo` (one past the last sphere), with its own shader binding table record at a fixed uniform offset. The
// merge is the same shape section 3 already established: rtTraverse tries every sphere, then tries the mesh if
// one is present, and keeps whichever is nearer -- adding a mesh does not touch the sphere loop, and a scene
// with no mesh emits the exact same WGSL text this file always has (the bvh block is template-conditional, the
// same mechanism `gradient` and the PLANT knobs already use).
//
// *** WHAT THIS DOES NOT CLAIM, THE SEQUEL. *** That the mesh is SHADED against a CPU oracle: pathTracer.mjs's
// scene is spheres, full stop, and cpuComparable()/sceneFromSbt() already refuse to flatten a material they
// cannot express -- a triangle mesh is not a material question, it is a GEOMETRY this file's own CPU reference
// has no concept of at all, so no renderSbtCpu() comparison is offered for a bvh scene and none is faked. What
// IS checked, honestly, is the one claim a mesh actually makes: that rtTraverseBvh finds the SAME triangle, at
// the SAME distance, that mesh/meshBVH.mjs's own already-tested raycastFirst() finds, for the same rays over
// the same mesh. That is an intersection oracle, not a rendering one, and it is the whole of what "add a BVH"
// means -- the shading of whatever it hits was already correct before this round, because closestHit does not
// know or care where its normal came from.
"use strict";

import { render as renderCpu } from "./pathTracer.mjs";
// lcgConstants.mjs, not pathTracerWgsl.mjs -- see that file's header. render/rtViewer.mjs (RTX round 3) is the
// first caller to import this module from inside a browser page rather than from Node.
import { LCG } from "./lcgConstants.mjs";
import { VIEW, MAX_DEPTH, EPS, notExactInF32, dyadic, powerOfTwo } from "./pathTracerGpu.mjs";
import { MeshBVH, trianglesFrom } from "../../mesh/meshBVH.mjs";
// RTX round 7 -- dirToFaceW is imported VERBATIM (a JS string constant, not hand-retyped) because it is
// non-trivial branching logic this tree already shares this way: specularProbeCapture.mjs's own CAPTURED_ENV_WGSL
// imports it from here too, rather than retyping it a fourth time. sampleCapturedCubemap is the CPU oracle for
// the SAME atlas format this round's WGSL reads -- a plain JS function, already gated by that file's own
// selfcheck, reused rather than re-derived.
import { SPECULAR_IBL_HELPERS_WGSL } from "./specularIBLWgsl.mjs";
import { sampleCapturedCubemap } from "./specularProbeCapture.mjs";

export { VIEW, MAX_DEPTH, EPS };

/**
 * *** THE STAGE LIST IS DATA, SO THE GATE CAN ASSERT ON IT RATHER THAN ON PROSE. *** `implemented` is the
 * honest column: any-hit is false and stays false until somebody writes it, and a list that quietly dropped
 * the row would report a complete pipeline.
 */
export const STAGES = Object.freeze([
    Object.freeze({ id: "raygen", fn: "rtRaygen", implemented: true,
                    what: "generate the camera ray for a pixel and its sub-pixel sample" }),
    Object.freeze({ id: "intersection", fn: "rtIntersect", implemented: true,
                    what: "a PROCEDURAL primitive's hit test -- a sphere, which in Vulkan needs this stage " +
                          "because only triangles get the built-in intersector" }),
    Object.freeze({ id: "anyHit", fn: null, implemented: false,
                    what: "alpha / transparency: accept or reject a candidate hit before it becomes closest. " +
                          "NOT WRITTEN. Nothing in this tree's scenes is cut-out or translucent yet" }),
    Object.freeze({ id: "closestHit", fn: "rtClosestHit", implemented: true,
                    what: "shade the winning hit and produce the continuation ray" }),
    Object.freeze({ id: "miss", fn: "rtMiss", implemented: true,
                    what: "the environment's radiance along a ray that hit nothing" }),
]);

/** Which closest-hit shaders the table can name. Values are the switch indices the WGSL dispatches on.
 *  `microfacet` (RTX round 8) is NOT dispatched through rtClosestHit's switch the way lambertian/mirror are --
 *  see pipelineWgsl's own header note on why it gets a separate inline block instead. */
export const HIT_SHADERS = Object.freeze({ lambertian: 0, mirror: 1, microfacet: 2 });

/**
 * A shader binding table record: which geometry, which closest-hit shader, and that shader's parameters.
 *
 * *** THE POINT IS THAT THIS IS DATA. *** Adding a geometry with a different material appends a record; it does
 * not touch the traversal loop, which is the whole difference between this and v4417's `albedo` uniform.
 *
 * `albedo` is a NUMBER or a [r,g,b] TRIPLE, matching pathTracer.mjs's own `col()` convention exactly (a scalar
 * broadcasts to grey) -- so the same record shape serves the grayscale pipeline unchanged and the rgb one this
 * round adds, and a caller migrating from one to the other does not have to touch its scene descriptions.
 *
 * `emit` (RTX round 6) is a SCALAR only, matching pathTracer.mjs's own `nee.mjs`-driven scene shape exactly
 * -- that CPU oracle's Le is never a triple, and pipelineWgsl({nee:true}) is scalar-pipeline-only for the same
 * packing reason: the scalar record has two spare floats (z, w) to carry it; the rgb record's vec4 is already
 * full with three albedo channels, so a per-channel emit has nowhere to go without widening every SBT slot in
 * the uniform block, which is out of scope for the round that first wires NEE in at all. 0 (the default) is
 * "not a light", the same falsy-means-absent convention `nee.mjs`'s own `if (s.emit)` check already uses.
 */
/**
 * `roughness`/`ior` (RTX round 8) are the microfacet record's own parameters -- pathTracer.mjs's own
 * `hit.sphere.roughness`/`hit.sphere.ior`, left `undefined` for every other shader so sceneFromSbt's pass-
 * through preserves the CPU oracle's own `roughness !== undefined` material gate exactly. `ior` stays
 * `undefined` (not defaulted to some dielectric constant) when the caller does not give one, matching
 * pathTracer.mjs's own `hit.sphere.ior ? fresnel(...).R : 1` convention -- a microfacet record with no ior is
 * a perfectly reflective (F = 1) lobe, not an error.
 *
 * *** A `hit: "microfacet"` RECORD SILENTLY MISRENDERS AS LAMBERTIAN IF `pipelineWgsl()`'S OWN `microfacet`
 * OPTION IS LEFT AT ITS DEFAULT (`false`). *** Found by an adversarial review of this round, the same silent-
 * mismatch shape `pipelineUniforms`'s own doc already names for `rgb`/`meshMaterials` ("Both are silent. Pass
 * the identical value to both calls"). HIT_SHADERS.microfacet=2 is packed and bound unconditionally by this
 * function/sbtRecordFloats/pipelineUniforms regardless of what pipelineWgsl() generates; if that generated
 * WGSL never asked for the microfacet capability, rtClosestHit's switch has no `case 2`, index 2 falls into
 * `default:` (the Lambertian branch), and the sphere renders as a flat diffuse surface whose "albedo" is
 * actually its roughness value -- no error, no NaN, just a quietly wrong picture. There is no runtime cross-
 * check here for the same reason there is none for rgb/meshMaterials: pipelineUniforms/sbtRecordFloats never
 * see pipelineWgsl's own option object, so they cannot know what shader text will consume their output. Pass
 * `microfacet: "bsdf"|"nee"|"mis"` to pipelineWgsl() whenever the table contains one of these records.
 */
export function sbtRecord({ centre = [0, 0, 0], radius = 1, hit = "lambertian", albedo = 0.5, emit = 0,
                            roughness = undefined, ior = undefined } = {}) {
    if (!(hit in HIT_SHADERS)) throw new Error("rtPipeline: no closest-hit shader named " + hit);
    if (hit === "microfacet" && roughness === undefined) throw new Error(
        "rtPipeline: a microfacet record needs a roughness -- pathTracer.mjs's own material gate is " +
        "`hit.sphere.roughness !== undefined`, so an unset roughness would silently read as Lambertian on the " +
        "CPU side while the GPU side has no albedo to fall back on at all.");
    return Object.freeze({ centre: centre.slice(), radius, hit, albedo, emit, roughness, ior });
}

/** [r,g,b], whether `albedo` is a number (broadcast to grey) or already a triple -- pathTracer.mjs's col(). */
export function albedoVec3(albedo) {
    return Array.isArray(albedo) ? albedo.slice(0, 3) : [albedo, albedo, albedo];
}

/**
 * One SBT record's four floats -- [hitShaderIndex, albedo, emit, 0] scalar, or [hitShaderIndex, ...albedoVec3]
 * under rgb (no room left for emit there -- see sbtRecord's own doc) -- the ONE place this shape is written
 * down. `pipelineUniforms` packs a sphere's record and a single-mesh record with it; `meshSbtBuffer` packs a
 * whole per-material table with it. Before RTX round 3 the same four-element array literal was written out
 * three times, in a file whose own bvhWgslBlock doc argues explicitly against exactly that ("not two copies
 * that can drift apart"). `r.emit` defaults to 0 via `|| 0` rather than requiring every caller to state it --
 * a bvh mesh descriptor (`{hit, albedo}`, no `emit` field at all) and a mesh-materials per-triangle record both
 * go through this function too, and neither has ever had a notion of an emissive triangle.
 */
function sbtRecordFloats(r, { rgb = false } = {}) {
    if (!(r.hit in HIT_SHADERS)) throw new Error("rtPipeline: no closest-hit shader named " + r.hit);
    // RTX round 8 -- a microfacet record has no albedo at all (pathTracer.mjs's own microfacet branch never
    // reads hit.sphere.albedo), so its two spare floats carry roughness and ior instead: [idx, roughness,
    // emit, ior]. That leaves no room for rgb's three-float albedo triple, the same packing conflict `nee`'s
    // own emit channel already has with rgb -- refused for the same reason, not silently dropped.
    if (r.hit === "microfacet" && rgb) throw new Error(
        "rtPipeline: microfacet needs the scalar (non-rgb) pipeline -- there is no packing slot for both " +
        "roughness and ior once a record's three spare floats are spent on an rgb albedo triple.");
    if (rgb) return [HIT_SHADERS[r.hit], ...albedoVec3(r.albedo)];
    const emit = Array.isArray(r.emit) ? r.emit[0] : (r.emit || 0);
    if (r.hit === "microfacet") return [HIT_SHADERS[r.hit], r.roughness, emit, r.ior || 0];
    return [HIT_SHADERS[r.hit], Array.isArray(r.albedo) ? r.albedo[0] : r.albedo, emit, 0];
}

export const MAX_GEOMETRY = 4;

// ================================================================================================
// THE BVH -- built on the CPU by mesh/meshBVH.mjs, packed for the GPU's four extra bindings
// ================================================================================================

/** The uniform slots a bvh scene uses, inside the SAME 24-vec4 block every other scene already allocates. */
export const MESH_META_SLOT = 20;
export const MESH_SBT_SLOT = 21;

/**
 * The storage-buffer bindings pipelineWgsl's bvh block declares, at fixed indices past binding 1 (uniforms).
 * `vertColors` is separate from the other four: it is only bound when `vertexColors: true` is asked for, so a
 * plain bvh scene (every caller before this round, and most after it) never has to supply one. `matIndex` and
 * `meshSbt` are RTX round 4's own pair, bound only when `meshMaterials: true` is asked for -- the per-triangle
 * material index and the per-material SBT record table it indexes into (Vulkan's own SBT-offset idiom, applied
 * within a single BLAS: a triangle maps to a material, and the material to a record).
 */
export const BVH_BINDINGS = Object.freeze({ bounds: 2, meta: 3, order: 4, tris: 5, vertColors: 7, matIndex: 8, meshSbt: 9 });

// ================================================================================================
// THE ENVIRONMENT MAP -- RTX round 7, the miss shader's own first texture binding
// ================================================================================================

/** The uniform slot an envMap scene uses -- the last free pair the 24-vec4 block has (20/21 are the mesh's). */
export const ENV_META_SLOT = 22;

/** The texture binding pipelineWgsl's envMap block declares, past every bvh binding (2-5, 7-9) and the probe
 *  kernels' own `rays` (6, a separate, never-co-dispatched shader -- see this file's own binding-index notes). */
export const ENV_BINDING = 10;

/**
 * Build a BVH over an indexed triangle mesh and pack it into the four flat buffers the GPU bvh block reads.
 *
 * *** THE ACCELERATION STRUCTURE ITSELF IS NOT REIMPLEMENTED HERE. *** mesh/meshBVH.mjs's binned-SAH build and
 * its `bounds`/`meta`/`order` layout are taken as-is; this only casts the f64 node data down to f32 (the GPU's
 * native precision, and the same cast v4418's uniform packing already does for the camera and every sphere) and
 * slices each array down to the nodes actually used -- `MeshBVH`'s constructor over-allocates `2 * count` node
 * slots as a safe upper bound, and shipping the unused tail would be dead bandwidth, not a correctness risk, but
 * there is no reason to pay for it.
 */
/**
 * `colors`, if given, is one [r,g,b] per POSITION (same indexing `indices` already uses for `positions`) --
 * flattened the exact same way trianglesFrom flattens positions, so a triangle's three colours sit at the
 * SAME byte offsets in bvhVertColors that its three vertices sit at in bvhTris. No colour interpolation
 * happens here: that is the WGSL kernel's job, from the barycentric weights Möller-Trumbore's own u/v already
 * are (mesh/meshBVH.mjs's separate baryAt is not needed -- it is a second way to compute the same numbers).
 *
 * `materialIndex`, if given (RTX round 4), is one integer per TRIANGLE, in the same order as `indices` -- which
 * record of a separate SBT array (see meshSbtBuffer below) that triangle's closest-hit reads. It can be indexed
 * directly by a triangle's OWN index with no remapping: `bvhHitTri` (what the traversal below and every WGSL
 * mesh-hit branch actually reports) is always the ORIGINAL 0-based position in `indices`, never a SAH-reordered
 * one -- the BVH build only swaps VALUES between POSITIONS in its own `order` array (mesh/meshBVH.mjs's own
 * partitioning), it never relabels a triangle's identity, so `order`'s positions move under the build and the
 * value at any position is always the triangle it always was.
 */
export function bvhBuffersFromMesh(positions, indices, opts = {}) {
    const tris = trianglesFrom(positions, indices);
    const bvh = new MeshBVH(tris, opts);
    const bounds = new Float32Array(bvh.bounds.subarray(0, bvh.nodes * 6));
    const meta = new Int32Array(bvh.meta.subarray(0, bvh.nodes * 3));
    const order = new Int32Array(bvh.order.subarray(0, bvh.count));
    const trisF32 = new Float32Array(tris.length);
    trisF32.set(tris);
    let vertColors = null;
    if (opts.colors) {
        vertColors = new Float32Array(indices.length * 9);
        for (let n = 0; n < indices.length; n++) {
            const [i, j, k] = indices[n];
            const A = opts.colors[i], B = opts.colors[j], C = opts.colors[k];
            const o = n * 9;
            vertColors[o] = A[0]; vertColors[o + 1] = A[1]; vertColors[o + 2] = A[2];
            vertColors[o + 3] = B[0]; vertColors[o + 4] = B[1]; vertColors[o + 5] = B[2];
            vertColors[o + 6] = C[0]; vertColors[o + 7] = C[1]; vertColors[o + 8] = C[2];
        }
    }
    let matIndex = null;
    if (opts.materialIndex) {
        // A short array would silently zero-fill every unmapped triangle to record 0 (Int32Array.set's own
        // behaviour) -- indistinguishable from sabotage A's own symptom (physics/render/rtPipeline-selfcheck.mjs's
        // sabotage log) except that nobody sabotaged anything. Refused rather than risked.
        if (opts.materialIndex.length !== indices.length) throw new Error(
            "rtPipeline: materialIndex must have one entry per triangle (" + indices.length + "), got " + opts.materialIndex.length);
        matIndex = new Int32Array(indices.length);
        matIndex.set(opts.materialIndex);
    }
    return Object.freeze({ bounds, meta, order, tris: trisF32, vertColors, matIndex,
                           nodeCount: bvh.nodes, triCount: bvh.count, bvh });
}

/**
 * RTX ROUND 5 -- Sibling of bvhBuffersFromMesh() for a caller that already has a FLAT, UNINDEXED triangle-soup
 * buffer (9 floats/triangle, world-space) -- exactly world/chunkMesherCore.js's own meshChunk() output shape,
 * the same one world/worldColliderBVH.mjs already hands straight to `new MeshBVH(tris)` with no intermediate
 * indexing step (that file's own header: "verts is already an unindexed, world-space, 9-floats-per-triangle
 * buffer -- the exact layout MeshBVH wants, modulo a Float32->Float64 cast"). Skips trianglesFrom() entirely
 * (there is no `indices` array to resolve against `positions`) and, when colors are given, skips the by-INDEX
 * vertex lookup bvhBuffersFromMesh() needs too -- meshChunk()'s own `cols` output is already 3 floats per
 * vertex, 1:1 POSITION-ALIGNED with `verts` (confirmed directly against its source, not assumed), so packing
 * it is a straight cast rather than a per-triangle gather through an indices array that does not exist here.
 */
export function bvhBuffersFromTriSoup(trisFlat, opts = {}) {
    // An adversarial review found this missing: unlike bvhBuffersFromMesh() (whose trianglesFrom() call
    // structurally can only ever emit a multiple of 9, so it never needed this check), a flat buffer handed
    // in directly has no such guarantee. Confirmed unreachable via the one real caller today (world/
    // cityChunkScene.mjs's citySceneMesh(), whose verts always come from chunkMesherCore.js's own meshChunk(),
    // which always emits whole quads -- 6 verts, 18 floats, two whole triangles at a time) -- but this function
    // is exported for ANY future caller with a flat buffer, and "refuse rather than silently misalign" is the
    // discipline this file's own header already claims, not one scoped to only the callers that exist today.
    if (trisFlat.length % 9 !== 0) throw new Error(
        "rtPipeline: bvhBuffersFromTriSoup expects a flat buffer that is a whole multiple of 9 floats " +
        "(9 floats/triangle), got " + trisFlat.length + " (" + (trisFlat.length % 9) + " leftover)");
    const tris = trisFlat instanceof Float64Array ? trisFlat : Float64Array.from(trisFlat);
    const bvh = new MeshBVH(tris, opts);
    const bounds = new Float32Array(bvh.bounds.subarray(0, bvh.nodes * 6));
    const meta = new Int32Array(bvh.meta.subarray(0, bvh.nodes * 3));
    const order = new Int32Array(bvh.order.subarray(0, bvh.count));
    const trisF32 = new Float32Array(tris.length);
    trisF32.set(tris);
    const triCountIn = tris.length / 9;
    let vertColors = null;
    if (opts.colors) {
        // Refused rather than silently mis-aligned -- the same discipline bvhBuffersFromMesh()'s own
        // materialIndex check already holds: a short/long array here would either read garbage or leave a
        // tail of vertices at whatever Float32Array.set() leaves un-set (0, i.e. black), indistinguishable
        // from a real "unlit" scene except that nobody asked for one.
        if (opts.colors.length !== tris.length) throw new Error(
            "rtPipeline: bvhBuffersFromTriSoup colors must be 1:1 position-aligned with the triangle-soup " +
            "buffer (" + tris.length + " floats), got " + opts.colors.length);
        vertColors = new Float32Array(opts.colors.length);
        vertColors.set(opts.colors);
    }
    let matIndex = null;
    if (opts.materialIndex) {
        if (opts.materialIndex.length !== triCountIn) throw new Error(
            "rtPipeline: materialIndex must have one entry per triangle (" + triCountIn + "), got " + opts.materialIndex.length);
        matIndex = new Int32Array(triCountIn);
        matIndex.set(opts.materialIndex);
    }
    return Object.freeze({ bounds, meta, order, tris: trisF32, vertColors, matIndex,
                           nodeCount: bvh.nodes, triCount: bvh.count, bvh });
}

/** The `inputs` array runWgslCompute/runWgslComputeNative expect, at BVH_BINDINGS' fixed indices. */
export function bvhInputs(b) {
    const out = [
        { binding: BVH_BINDINGS.bounds, data: b.bounds },
        { binding: BVH_BINDINGS.meta, data: b.meta },
        { binding: BVH_BINDINGS.order, data: b.order },
        { binding: BVH_BINDINGS.tris, data: b.tris },
    ];
    if (b.vertColors) out.push({ binding: BVH_BINDINGS.vertColors, data: b.vertColors });
    if (b.matIndex) out.push({ binding: BVH_BINDINGS.matIndex, data: b.matIndex });
    return out;
}

/**
 * The mesh's PER-MATERIAL SBT records (RTX round 4), packed as a flat storage buffer -- one vec4 per record, in
 * the exact shape pipelineUniforms already packs the single-material MESH_SBT_SLOT record in
 * ([hitShaderIndex, albedo, 0, 0] or [hitShaderIndex, ...albedoVec3] under rgb). Bound at BVH_BINDINGS.meshSbt
 * and indexed by BVH_BINDINGS.matIndex[bvhHitTri] in the WGSL mesh-hit branch when
 * pipelineWgsl({ meshMaterials: true }) -- a SEPARATE storage buffer rather than more uniform-block slots
 * because the 24-vec4 block already reaches MESH_SBT_SLOT=21 and has room for at most two more records, nowhere
 * near enough for an arbitrary material count.
 *
 * *** REFUSES AN EMISSIVE TRIANGLE MATERIAL, RATHER THAN SHIPPING ONE THAT HALF-WORKS. *** An adversarial
 * review of RTX round 6 found this the hard way: nothing stopped a caller from setting `emit` on one of these
 * records, and the GPU would not have caught it either -- rtDirectLight's own light loop only ever walks
 * `j < nGeo` (the sphere table), so a triangle would still TERMINATE a path that hits it and add its own
 * emission (the rec.z > 0.0 branch in pipelineWgsl's main() does not distinguish a sphere record from a mesh
 * one), yet could never be NEE-sampled the way a sphere light is -- a partially-working, silently-inconsistent
 * light rather than a loud refusal. pathTracer.mjs's own render() already refuses a mesh scene entry with
 * `.emit` set for exactly this reason (fail loud instead of late); this is the same rule applied here.
 */
export function meshSbtBuffer(records, { rgb = false } = {}) {
    const bad = records.filter((r) => r.emit);
    if (bad.length) throw new Error(
        "rtPipeline: meshSbtBuffer refuses an emissive per-triangle material (" + bad.length + " of " +
        records.length + " records set emit) -- rtDirectLight only ever samples the sphere table (j < nGeo), " +
        "so a mesh triangle can terminate a path and add its own emission on a direct hit but can never be " +
        "cone-sampled as a light, which is a half-working feature rather than a supported one.");
    const out = new Float32Array(records.length * 4);
    records.forEach((r, i) => out.set(sbtRecordFloats(r, { rgb }), i * 4));
    return out;
}

/**
 * RTX round 7 -- the env-map sampler's WGSL, shared verbatim between pipelineWgsl's envMap option and
 * envProbeWgsl below, the SAME "one port, not two copies" discipline bvhWgslBlock's own doc states just below
 * this one. Parameterised over `faceSizeExpr` -- a WGSL i32 EXPRESSION for the atlas's face size -- rather than
 * over a uniform binding directly, because the two callers read it from genuinely different places
 * (pipelineWgsl from U[ENV_META].y, a runtime value so one generated shader can serve different atlases without
 * regenerating WGSL text; envProbeWgsl from a compile-time constant, matching bvhProbeWgsl's own RAY_COUNT
 * convention for a small, self-contained probe kernel). This mirrors splitSumWgsl.mjs's envImpl/
 * specularIBLWgsl.mjs's fetchImpl pattern -- one core, a swapped-in source for the one thing that differs.
 *
 * dirToFaceW (SPECULAR_IBL_HELPERS_WGSL) is IMPORTED, not retyped -- the same JS string constant
 * specularProbeCapture.mjs's own CAPTURED_ENV_WGSL already reuses from specularIBLWgsl.mjs rather than a
 * fourth hand transcription of that one non-trivial, branching function.
 *
 * rtEnvTexel/rtEnvSample below ARE a fresh hand transcription of the manual-bilinear-over-a-cube-face pattern,
 * on purpose, matching this codebase's own established precedent: specularProbeCapture.mjs's CAPTURED_ENV_WGSL
 * is already the FOURTH hand-transcribed copy of exactly this pattern (that file's own comment: "kept explicit
 * rather than shared, the same call this whole arc has made each time") -- each copy reads its atlas dimensions
 * from a DIFFERENT uniform shape (a PfParams struct there, this file's own U block or a baked constant here),
 * so a fifth copy here is this codebase's own established call, not a new one.
 *
 * Single mip, no LUT (specularProbeCapture.mjs's own packCapturedAtlas shape -- "the split-sum BRDF-LUT/
 * prefilter-convolution half is NOT needed" per this round's own backlog entry): face f's texels sit at
 * x in [f*faceSize, f*faceSize+faceSize), y in [0, faceSize).
 *
 * Texel-centre convention matches specularIBLSample.mjs's own bilinearFace comment exactly: texel i's centre
 * is at u = ((i+0.5)/size)*2-1, inverted here as (u*0.5+0.5)*size-0.5 -- the same formula, ported rather than
 * re-derived, so a disagreement here would be a PORT bug and not a second, independently-invented convention.
 */
function envSampleWgslBlock(faceSizeExpr) {
    return `
${SPECULAR_IBL_HELPERS_WGSL}
fn rtEnvTexel(face : i32, x : i32, y : i32, faceSize : i32) -> vec3<f32> {
  let cx = clamp(x, 0, faceSize - 1);
  let cy = clamp(y, 0, faceSize - 1);
  return textureLoad(tAtlas, vec2<i32>(face * faceSize + cx, cy), 0).rgb;
}
fn rtEnvSample(d : vec3<f32>) -> vec3<f32> {
  let faceSize = ${faceSizeExpr};
  let fuv = dirToFaceW(d);
  let fx = (fuv.u * 0.5 + 0.5) * f32(faceSize) - 0.5;
  let fy = (fuv.v * 0.5 + 0.5) * f32(faceSize) - 0.5;
  let x0 = i32(floor(fx)); let y0 = i32(floor(fy));
  let tx = fx - floor(fx); let ty = fy - floor(fy);
  let c00 = rtEnvTexel(fuv.face, x0, y0, faceSize);
  let c10 = rtEnvTexel(fuv.face, x0 + 1, y0, faceSize);
  let c01 = rtEnvTexel(fuv.face, x0, y0 + 1, faceSize);
  let c11 = rtEnvTexel(fuv.face, x0 + 1, y0 + 1, faceSize);
  return mix(mix(c00, c10, tx), mix(c01, c11, tx), ty);
}
`;
}

/**
 * The bvh block's WGSL, shared verbatim between pipelineWgsl's bvh option and bvhProbeWgsl below -- ONE port of
 * meshBVH.mjs's traversal, not two copies that can drift apart the way multiplayer/wadLevelHost.js and
 * tools/krbn/krbnCompare.js's independent ray-triangle kernels already did (meshBVH.mjs's own header).
 */
function bvhWgslBlock({ vertexColors = false, meshMaterials = false } = {}) {
    return `
@group(0) @binding(${BVH_BINDINGS.bounds}) var<storage, read> bvhBounds : array<f32>;
@group(0) @binding(${BVH_BINDINGS.meta}) var<storage, read> bvhMeta : array<i32>;
@group(0) @binding(${BVH_BINDINGS.order}) var<storage, read> bvhOrder : array<i32>;
@group(0) @binding(${BVH_BINDINGS.tris}) var<storage, read> bvhTris : array<f32>;
${vertexColors ? `@group(0) @binding(${BVH_BINDINGS.vertColors}) var<storage, read> bvhVertColors : array<f32>;` : ""}
${meshMaterials ? `// RTX round 4 -- one material index per triangle, and the SBT records it selects among.
@group(0) @binding(${BVH_BINDINGS.matIndex}) var<storage, read> bvhMatIdx : array<i32>;
@group(0) @binding(${BVH_BINDINGS.meshSbt}) var<storage, read> bvhSbt : array<vec4<f32>>;` : ""}

const TRI_EPS : f32 = 1e-9;   // mesh/meshBVH.mjs's own EPS, reused verbatim -- see this file's header note on
                               // reusing an f64 threshold on f32: a real mesh's triangles are never within
                               // 1e-9 of degenerate, so the guard's job (catch a ray parallel to the plane)
                               // still holds; only the exact boundary case differs, and this file's own
                               // methodology is to measure that gap with a gate rather than assume it away.

var<private> bvhHitTri : i32;              // which triangle rtTraverseBvh's last call landed on, or -1
var<private> bvhHitU : f32;                // that hit's barycentric weight on vertex B (0 when bvhHitTri < 0)
var<private> bvhHitV : f32;                // and on vertex C -- weight on A is always 1 - bvhHitU - bvhHitV
var<private> bvhStack : array<i32, 64>;    // depth bound: maxLeaf=8 default needs 2^57+ triangles to overflow

// ---- STAGE: intersection (triangle) -- ported from mesh/meshBVH.mjs's rayTriangle -----------------------
// Moller-Trumbore, same algebra and the same epsilon on both ends (the near-parallel guard on det, and the
// t > eps floor). This is the NEAREST-hit query -- raycastFirst's shape, not intersectsSegment's early-out.
// *** u AND v ARE ALREADY BARYCENTRIC WEIGHTS -- Moller-Trumbore computes them as a byproduct of the hit
// test, on vertices B and C respectively (A's weight is 1-u-v). meshBVH.mjs's separate baryAt() derives the
// same numbers a second, more expensive way (a projection onto the edge basis); this returns the ones the
// intersection test already has rather than computing them twice.
struct TriHit { t : f32, u : f32, v : f32 };
fn rtIntersectTri(orig : vec3<f32>, dir : vec3<f32>, i : i32) -> TriHit {
  let A = vec3<f32>(bvhTris[i], bvhTris[i + 1], bvhTris[i + 2]);
  let e1 = vec3<f32>(bvhTris[i + 3], bvhTris[i + 4], bvhTris[i + 5]) - A;
  let e2 = vec3<f32>(bvhTris[i + 6], bvhTris[i + 7], bvhTris[i + 8]) - A;
  let p = cross(dir, e2);
  let det = dot(e1, p);
  if (det > -TRI_EPS && det < TRI_EPS) { return TriHit(-1.0, 0.0, 0.0); }
  let inv = 1.0 / det;
  let tv = orig - A;
  let u = dot(tv, p) * inv;
  if (u < 0.0 || u > 1.0) { return TriHit(-1.0, 0.0, 0.0); }
  let q = cross(tv, e1);
  let v = dot(dir, q) * inv;
  if (v < 0.0 || u + v > 1.0) { return TriHit(-1.0, 0.0, 0.0); }
  let t = dot(e2, q) * inv;
  if (t > TRI_EPS) { return TriHit(t, u, v); }
  return TriHit(-1.0, 0.0, 0.0);
}

${vertexColors ? `// Vertex colours are flattened into bvhVertColors at THE SAME byte offset per triangle that
// positions occupy in bvhTris -- bvhBuffersFromMesh's own comment on why. Interpolated by the barycentric
// weights Möller-Trumbore already produced, at the ONE triangle that won, not per candidate.
fn rtVertColor(i : i32, u : f32, v : f32) -> vec3<f32> {
  let cA = vec3<f32>(bvhVertColors[i], bvhVertColors[i + 1], bvhVertColors[i + 2]);
  let cB = vec3<f32>(bvhVertColors[i + 3], bvhVertColors[i + 4], bvhVertColors[i + 5]);
  let cC = vec3<f32>(bvhVertColors[i + 6], bvhVertColors[i + 7], bvhVertColors[i + 8]);
  return cA * (1.0 - u - v) + cB * u + cC * v;
}` : ""}

// The winner's own face normal -- recomputed once, for the one triangle that won, rather than carried
// per-candidate through the traversal below. WGSL's builtin normalize() rather than the pipeline's own nrm()
// (which special-cases a zero-length vector): a cross product of two non-degenerate triangle edges is never
// zero, and this function has to stand alone in bvhProbeWgsl's kernel, which never defines the pipeline's nrm.
fn rtTriNormal(i : i32) -> vec3<f32> {
  let A = vec3<f32>(bvhTris[i], bvhTris[i + 1], bvhTris[i + 2]);
  let e1 = vec3<f32>(bvhTris[i + 3], bvhTris[i + 4], bvhTris[i + 5]) - A;
  let e2 = vec3<f32>(bvhTris[i + 6], bvhTris[i + 7], bvhTris[i + 8]) - A;
  return normalize(cross(e1, e2));
}

// ---- TRAVERSAL: the BVH itself -- ported from mesh/meshBVH.mjs's _hitBox/raycastFirst ---------------------
// Same node layout (meta[node*3] < 0 marks a leaf carrying start/count in meta[1..2]; an interior node
// carries left/right), same slab test, same "a NaN box test can only ever be conservative because the only
// early-out is t0 > t1, and every comparison against NaN is false" argument -- ADAPTED, not copied blind:
// WGSL leaves f32 division by zero implementation-defined (unlike JS's guaranteed Infinity), so a
// direction of exactly 0 on an axis gets a large finite sentinel here instead of a literal 1/0.
fn rtHitBox(node : i32, o : vec3<f32>, invD : vec3<f32>, maxT : f32) -> f32 {
  let b = node * 6;
  var t0 = 0.0;
  var t1 = maxT;
  var n0 = (bvhBounds[b] - o.x) * invD.x;
  var n1 = (bvhBounds[b + 3] - o.x) * invD.x;
  if (n0 > n1) { let tmp = n0; n0 = n1; n1 = tmp; }
  t0 = max(t0, n0); t1 = min(t1, n1);
  if (t0 > t1) { return 1e30; }
  n0 = (bvhBounds[b + 1] - o.y) * invD.y;
  n1 = (bvhBounds[b + 4] - o.y) * invD.y;
  if (n0 > n1) { let tmp = n0; n0 = n1; n1 = tmp; }
  t0 = max(t0, n0); t1 = min(t1, n1);
  if (t0 > t1) { return 1e30; }
  n0 = (bvhBounds[b + 2] - o.z) * invD.z;
  n1 = (bvhBounds[b + 5] - o.z) * invD.z;
  if (n0 > n1) { let tmp = n0; n0 = n1; n1 = tmp; }
  t0 = max(t0, n0); t1 = min(t1, n1);
  if (t0 > t1) { return 1e30; }
  return t0;
}

// *** NEAR CHILD LAST ONTO THE STACK, SO IT IS POPPED FIRST. *** The same rule raycastFirst's own header
// names as a performance bug no correctness test can see: reversed, traversal is still correct and much
// slower, because a tight best early is what prunes the far subtree at all.
fn rtTraverseBvh(orig : vec3<f32>, dir : vec3<f32>, maxT : f32) -> f32 {
  bvhHitTri = -1;
  let invD = vec3<f32>(select(1.0 / dir.x, 1e30, dir.x == 0.0),
                        select(1.0 / dir.y, 1e30, dir.y == 0.0),
                        select(1.0 / dir.z, 1e30, dir.z == 0.0));
  var best = maxT;
  var sp = 1;
  bvhStack[0] = 0;
  loop {
    if (sp == 0) { break; }
    sp = sp - 1;
    let node = bvhStack[sp];
    if (rtHitBox(node, orig, invD, best) >= 1e30) { continue; }
    let left = bvhMeta[node * 3];
    if (left < 0) {
      let start = bvhMeta[node * 3 + 1];
      let cnt = bvhMeta[node * 3 + 2];
      for (var s = start; s < start + cnt; s = s + 1) {
        let tri = bvhOrder[s];
        let th = rtIntersectTri(orig, dir, tri * 9);
        if (th.t > 0.0 && th.t < best) { best = th.t; bvhHitTri = tri; bvhHitU = th.u; bvhHitV = th.v; }
      }
      continue;
    }
    let right = bvhMeta[node * 3 + 1];
    let dl = rtHitBox(left, orig, invD, best);
    let dr = rtHitBox(right, orig, invD, best);
    if (dl < dr) { bvhStack[sp] = right; sp = sp + 1; bvhStack[sp] = left; sp = sp + 1; }
    else { bvhStack[sp] = left; sp = sp + 1; bvhStack[sp] = right; sp = sp + 1; }
  }
  return select(-1.0, best, bvhHitTri >= 0);
}
`;
}

/**
 * A standalone kernel testing ONLY rtTraverseBvh -- one ray per invocation, read from a fifth storage buffer
 * (binding 6, six floats per ray: ox,oy,oz,dx,dy,dz), writing {t, tri} as two floats per ray to the output.
 * This is the INTERSECTION oracle this file's header promises: it grades the ported traversal against
 * mesh/meshBVH.mjs's own raycastFirst() directly, without going anywhere near shading or a CPU radiance
 * reference neither this file nor pathTracer.mjs has ever had for a triangle.
 *
 * *** RTX ROUND 4 -- `rayCount` IS REQUIRED, AND IT WAS MISSING FOR TWO ROUNDS. *** @workgroup_size(64) always
 * launches 64 invocations regardless of `workgroups: Math.ceil(rayCount / 64)`'s intent -- a caller with fewer
 * than 64 real rays (every existing caller: 32, 24, 8) leaves threads i >= rayCount reading PAST the end of
 * `rays` and writing PAST the end of `outBuf`. WebGPU's bounds behaviour for an out-of-range STORE is to CLAMP
 * the index into the buffer rather than fault -- measured directly: with 32 rays this clamps every excess
 * thread's write onto the LAST valid ray's own slot, overwriting a real result with garbage from a phantom ray.
 * It was invisible because it happened to land on tri=6 where the true answer was tri=11 -- triangles 6 and 11
 * of the shared cube fixture share two vertices, so physics/render/rtPipeline-selfcheck.mjs's own "genuine
 * shared-edge tie" tolerance (written for an honest ray-on-an-edge case) absorbed it as one. Confirmed by
 * padding the same 32-ray call to a full 64 with far-away miss rays: the corruption disappears and ray 31
 * reads the CPU's own tri=11, not the tolerated tie. The fix is not padding (that only hides the same fragility
 * behind a bigger buffer) -- it is a guard, the same `if (i >= N) { return; }` shape render/rtViewer.mjs's own
 * accumulateWgsl already uses for the identical reason.
 */
export function bvhProbeWgsl(rayCount) {
    if (!(rayCount > 0)) throw new Error("rtPipeline: bvhProbeWgsl needs the real ray count, to guard the invocations @workgroup_size(64) launches beyond it");
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(6) var<storage, read> rays : array<f32>;
${bvhWgslBlock()}
const RAY_COUNT : u32 = ${rayCount}u;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= RAY_COUNT) { return; }
  let i = i32(gid.x);
  let r = i * 6;
  let orig = vec3<f32>(rays[r], rays[r + 1], rays[r + 2]);
  let dir = vec3<f32>(rays[r + 3], rays[r + 4], rays[r + 5]);
  let t = rtTraverseBvh(orig, dir, 1e30);
  outBuf[i * 2] = t;
  outBuf[i * 2 + 1] = f32(bvhHitTri);
}
`;
}

/**
 * The RGB analogue of bvhProbeWgsl: for each ray, the INTERPOLATED vertex colour at the winning triangle's
 * hit point (or -1,-1,-1 for a miss), three floats per ray. Tests rtVertColor -- the one new claim vertex
 * colours make -- without going through a whole bounced render, which has no CPU oracle to grade it against.
 * `rayCount` is required for the same reason bvhProbeWgsl's own header explains -- see there.
 */
export function bvhShadeProbeWgsl(rayCount) {
    if (!(rayCount > 0)) throw new Error("rtPipeline: bvhShadeProbeWgsl needs the real ray count, to guard the invocations @workgroup_size(64) launches beyond it");
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(6) var<storage, read> rays : array<f32>;
${bvhWgslBlock({ vertexColors: true })}
const RAY_COUNT : u32 = ${rayCount}u;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= RAY_COUNT) { return; }
  let i = i32(gid.x);
  let r = i * 6;
  let orig = vec3<f32>(rays[r], rays[r + 1], rays[r + 2]);
  let dir = vec3<f32>(rays[r + 3], rays[r + 4], rays[r + 5]);
  let t = rtTraverseBvh(orig, dir, 1e30);
  if (t < 0.0) { outBuf[i * 3] = -1.0; outBuf[i * 3 + 1] = -1.0; outBuf[i * 3 + 2] = -1.0; return; }
  let c = rtVertColor(bvhHitTri * 9, bvhHitU, bvhHitV);
  outBuf[i * 3] = c.x; outBuf[i * 3 + 1] = c.y; outBuf[i * 3 + 2] = c.z;
}
`;
}

/**
 * RTX round 7 -- envSampleWgslBlock's own probe, mirroring bvhProbeWgsl's shape exactly: one direction in,
 * one RGB sample out, no path tracer around it -- isolates the texture-sampling math (dirToFaceW + manual
 * bilinear) from full path-traced rendering, the same way bvhProbeWgsl isolates BVH traversal from shading.
 * `faceSize` is baked as a compile-time constant (not read from U -- this probe declares no uniform binding
 * at all), matching bvhProbeWgsl's own RAY_COUNT convention for a small, self-contained kernel.
 */
export function envProbeWgsl(dirCount, faceSize) {
    if (!(dirCount > 0)) throw new Error("rtPipeline: envProbeWgsl needs the real direction count, to guard the invocations @workgroup_size(64) launches beyond it");
    if (!(faceSize > 0)) throw new Error("rtPipeline: envProbeWgsl needs the atlas's faceSize (== atlas height for a single-mip, no-LUT capture)");
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(6) var<storage, read> dirs : array<f32>;
@group(0) @binding(${ENV_BINDING}) var tAtlas : texture_2d<f32>;
${envSampleWgslBlock(String(faceSize))}
const DIR_COUNT : u32 = ${dirCount}u;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= DIR_COUNT) { return; }
  let i = i32(gid.x);
  let d = vec3<f32>(dirs[i * 3], dirs[i * 3 + 1], dirs[i * 3 + 2]);
  let c = rtEnvSample(d);
  outBuf[i * 3] = c.x; outBuf[i * 3 + 1] = c.y; outBuf[i * 3 + 2] = c.z;
}
`;
}

/**
 * RTX round 4's own probe: for each ray, the SELECTED MATERIAL's raw albedo at the winning triangle -- not the
 * shaded/bounced radiance, the record bvhMatIdx[bvhHitTri] names in bvhSbt (or -1,-1,-1 for a miss). Tests the
 * multi-material SBT offset lookup ALONE, exactly, without going through a bounced render that has no CPU
 * oracle for a mesh's radiance at all (the note above); a wrong material index or a wrong record layout shows
 * up here as the wrong three numbers, checked against what the caller's own materialIndex/records arrays say
 * they should be, rather than being invisible inside an averaged, noisy picture.
 */
export function bvhMaterialProbeWgsl(rayCount) {
    if (!(rayCount > 0)) throw new Error("rtPipeline: bvhMaterialProbeWgsl needs the real ray count, to guard the invocations @workgroup_size(64) launches beyond it -- see bvhProbeWgsl's header");
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(6) var<storage, read> rays : array<f32>;
${bvhWgslBlock({ meshMaterials: true })}
const RAY_COUNT : u32 = ${rayCount}u;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  if (gid.x >= RAY_COUNT) { return; }
  let i = i32(gid.x);
  let r = i * 6;
  let orig = vec3<f32>(rays[r], rays[r + 1], rays[r + 2]);
  let dir = vec3<f32>(rays[r + 3], rays[r + 4], rays[r + 5]);
  let t = rtTraverseBvh(orig, dir, 1e30);
  if (t < 0.0) { outBuf[i * 3] = -1.0; outBuf[i * 3 + 1] = -1.0; outBuf[i * 3 + 2] = -1.0; return; }
  let rec = bvhSbt[bvhMatIdx[bvhHitTri]];
  outBuf[i * 3] = rec.y; outBuf[i * 3 + 1] = rec.z; outBuf[i * 3 + 2] = rec.w;
}
`;
}

/**
 * *** WHICH RECORDS THE CPU REFERENCE CAN EXPRESS AT ALL, AND IT IS NOT ALL OF THEM. ***
 *
 * pathTracer.mjs's scene is {centre, radius, albedo}: a Lambertian sphere and nothing else. A binding table
 * can name `mirror`, and THE REFERENCE RENDERER HAS NO SUCH MATERIAL. That is not a bug in either file -- it
 * is the honest edge of the oracle, and it has to be a REFUSAL rather than a note.
 *
 * *** THE FIRST DRAFT MADE IT A SILENT DROP AND THE MEASUREMENT WENT WRONG IMMEDIATELY. *** sceneFromSbt
 * mapped only {centre, radius, albedo}, so a mirror record arrived at the CPU as a Lambertian, and the gate
 * dutifully reported 15 of 576 pixels "differing" -- a GPU mirror against a CPU diffuse, a number with no
 * meaning that looked exactly like a small port bug. A CONVERSION THAT DROPS A FIELD IS A SECOND DECLARATION
 * OF THE SCENE, which is the defect this tree names more often than any other, committed inside the round
 * whose whole subject is that the material is DATA.
 */
export const CPU_EXPRESSIBLE = Object.freeze(["lambertian", "microfacet"]);
export const cpuComparable = (sbt) => sbt.every((r) => CPU_EXPRESSIBLE.includes(r.hit));

/**
 * The scene in the CPU tracer's own shape. REFUSES a record it would have to flatten.
 *
 * `emit` (RTX round 6) carries straight through -- pathTracer.mjs's own `lights = scene.filter(s => s.emit)`
 * and `if (hit.sphere.emit)` both treat 0 as falsy already, the exact convention sbtRecord's default already
 * uses, so no translation is needed the way albedo's array-vs-scalar broadcast needed col().
 */
export function sceneFromSbt(sbt) {
    const bad = sbt.filter((r) => !CPU_EXPRESSIBLE.includes(r.hit)).map((r) => r.hit);
    if (bad.length) throw new Error(
        "rtPipeline: pathTracer.mjs has no material for [" + bad.join(", ") + "] -- it renders Lambertian " +
        "spheres only. Converting anyway would compare a GPU " + bad[0] + " against a CPU diffuse and report " +
        "the difference as a port error. Use cpuComparable() to ask first.");
    // roughness/ior (RTX round 8) pass through undefined for lambertian records, preserving pathTracer.mjs's
    // own `hit.sphere.roughness !== undefined` material gate exactly -- sbtRecord() never sets roughness on a
    // non-microfacet record, so this is not a translation, just carrying the field through unmodified.
    return sbt.map((r) => ({ centre: r.centre, radius: r.radius, albedo: r.albedo, emit: r.emit,
                             roughness: r.roughness, ior: r.ior }));
}

/**
 * The CPU reference for a table, DELEGATED to pathTracer.mjs rather than restated.
 *
 * `nee` (RTX round 6) defaults false, UNCHANGED from before that round -- every PROBES entry and every caller
 * before this one compares against a pure-BSDF CPU render, and flipping the default would silently change what
 * every one of those already-shipped comparisons means. Pass `nee: true` explicitly to grade the new capability.
 *
 * `direct` (RTX round 8) is pathTracer.mjs's own microfacet-material direct-lighting mode ("bsdf"|"nee"|"mis"),
 * INDEPENDENT of `nee` -- trace()'s own signature keeps the two separate (`nee` gates the Lambertian NEE loop,
 * `direct` gates the microfacet one), and this just forwards rather than restates that. Defaults to "bsdf",
 * trace()'s own default, so a caller that never passes it gets pure BSDF-sampled microfacet light exactly as
 * every scene before this round would have (there being no microfacet material before this round at all).
 */
export function renderSbtCpu(sbt, { spp = 16, seed = 1, view = VIEW, sky = null, rgb = false, nee = false,
                                    direct = "bsdf" } = {}) {
    return renderCpu(sceneFromSbt(sbt), { ...view, spp, seed, maxDepth: MAX_DEPTH, nee, direct,
                                          sky: sky || (() => 1), rgb });
}

/**
 * RTX round 7 -- the CPU oracle for pipelineWgsl({envMap:true})'s own miss shader, as a `sky(d)` callback
 * renderSbtCpu/pathTracer.mjs's render() already know how to take. NOT a new CPU sampler: sampleCapturedCubemap
 * IS specularProbeCapture.mjs's own already-gated bilinear reader over the exact atlas shape this round's WGSL
 * reads (packSpecularAtlas's six-faces-side-by-side layout, single mip, no LUT) -- reused rather than re-derived,
 * the same discipline nee.mjs's directNEE/directMIS closed forms were reused for rather than restated.
 *
 * pathTracer.mjs's own col() convention decides the scalar case: a colour broadcasts to (v,v,v), never averages
 * three channels down to one -- but a genuine RGB sky has no single "the" channel to broadcast FROM, so scalar
 * mode here takes the mean instead, matching rtMissRgb's own doc comment ("Grey, not because color is
 * unmodeled") for exactly the reason a texture makes that comment's premise no longer automatic.
 */
export function envSkyCpu(atlas, { rgb = false } = {}) {
    if (rgb) return (d) => sampleCapturedCubemap(atlas, d);
    return (d) => { const [r, g, b] = sampleCapturedCubemap(atlas, d); return (r + g + b) / 3; };
}

/** Both of v4417's exactness preconditions, over a whole table rather than one albedo. */
export function tablePreconditions(sbt, spp) {
    const bad = sbt.filter((r) => !dyadic(r.albedo)).map((r) => r.albedo);
    return Object.freeze({
        dyadicAlbedos: bad.length === 0, powerOfTwoSpp: powerOfTwo(spp),
        exact: bad.length === 0 && powerOfTwo(spp), nonDyadic: Object.freeze(bad),
        why: bad.length === 0 && powerOfTwo(spp)
            ? "every albedo is dyadic and spp is a power of two, so every path product is dyadic too"
            : "a non-dyadic albedo or spp breaks representability; interreflection MULTIPLIES albedos, so one " +
              "bad entry contaminates every path that touches it",
    });
}

/**
 * The `texture` option runWgslComputeNative (tools/ship/headlessGpu.mjs) expects, at ENV_BINDING -- an atlas
 * from specularProbeCapture.mjs's own captureBaseCubemap()/packCapturedAtlas() (or any packSpecularAtlas()-
 * shaped object with one mip and no LUT), handed straight through. `format` is fixed at "rgba16float" because
 * that is the only format runWgslComputeNative's own texture option supports today -- not a choice this
 * function makes, a limit it reports rather than silently assumes still holds if that ever changes.
 */
export function envMapTexture(atlas, binding = ENV_BINDING) {
    return { width: atlas.width, height: atlas.height, data: atlas.data, binding, format: "rgba16float" };
}

// ================================================================================================
// THE PIPELINE
// ================================================================================================
export function pipelineWgsl({ workgroupSize = 64, gradient = false,
                               plantSwapRecords = false, plantIgnoreRecord = false, bvh = false,
                               rgb = false, vertexColors = false, meshMaterials = false, nee = false,
                               plantDoubleCount = false, envMap = false,
                               // RTX round 8 -- false disables the microfacet material entirely (the generated
                               // WGSL is byte-identical to before this round, the same "a scene which never
                               // asks for a capability renders exactly as it did before" rule `rgb`/`bvh`/`nee`
                               // already hold to); "bsdf"|"nee"|"mis" match pathTracer.mjs's own `direct`
                               // values exactly and select the SAME three emitter-hit treatments trace()'s own
                               // misFrom dispatch uses (see the main loop's own comment on that dispatch).
                               microfacet = false, plantMicrofacetWrongPdf = false } = {}) {
    const PI = "3.141592653589793";
    if (microfacet && !["bsdf", "nee", "mis"].includes(microfacet)) throw new Error(
        "rtPipeline: microfacet must be \"bsdf\", \"nee\" or \"mis\" (pathTracer.mjs's own `direct` values), got " + microfacet);
    if (microfacet && rgb) throw new Error(
        "rtPipeline: microfacet needs the scalar (non-rgb) pipeline -- see sbtRecordFloats's own doc on why " +
        "roughness/ior have no packing slot once a record's spare floats are spent on an rgb albedo triple.");
    const microfacetOn = !!microfacet;
    // sampleCone/coordSystem-based light-cone sampling is needed whenever EITHER the Lambertian NEE loop runs
    // (`nee`) or the microfacet material's own direct-lighting loop runs (`microfacet` at anything but "bsdf",
    // which never samples a light at all -- pure BSDF sampling, pathTracer.mjs's own trace() default).
    const needsCone = nee || (microfacetOn && microfacet !== "bsdf");
    // The per-sample bookkeeping (prevWasCamera and friends) is needed whenever EITHER material tracks an
    // emitter-hit double-count guard -- Lambertian's neeSkippedMask bitmask, or microfacet's misFrom weighting.
    const needsDirectState = nee || microfacetOn;
    if (vertexColors && !bvh) throw new Error("rtPipeline: vertexColors needs bvh -- there is no mesh to colour otherwise");
    if (vertexColors && !rgb) throw new Error("rtPipeline: vertexColors needs rgb -- a colour has nowhere to go in a one-channel pipeline");
    // RTX round 4 -- meshMaterials needs bvh for the same reason vertexColors does: no mesh, nowhere to look up
    // a per-triangle record. It does NOT need rgb -- HIT_SHADERS' scalar path reads rec.y exactly as the single-
    // record MESH_SBT path always has; only the SOURCE of `rec` changes (bvhSbt[bvhMatIdx[...]] vs U[MESH_SBT]).
    if (meshMaterials && !bvh) throw new Error("rtPipeline: meshMaterials needs bvh -- there is no mesh to look up a per-triangle material on otherwise");
    // RTX round 6 -- nee needs the SCALAR pipeline: sbtRecordFloats/sbtRecord's own doc explains why an emit
    // channel has nowhere to go in the rgb record (three floats already spent on albedo, none spare).
    if (nee && rgb) throw new Error("rtPipeline: nee needs the scalar (non-rgb) pipeline -- there is no packing slot for a per-channel emit yet");
    // RTX round 7 -- envMap and gradient are both a SOURCE for rtMiss; asking for both leaves no honest answer
    // to "which one actually decided the sky colour", the same refuse-rather-than-guess this file's other
    // option pairs already hold to.
    if (envMap && gradient) throw new Error("rtPipeline: envMap and gradient are two different sky sources -- pass only one");
    return `
@group(0) @binding(0) var<storage, read_write> outBuf : array<f32>;
@group(0) @binding(1) var<uniform> U : array<vec4<f32>, 24>;
${bvh ? bvhWgslBlock({ vertexColors, meshMaterials }) : ""}
${envMap ? `@group(0) @binding(${ENV_BINDING}) var tAtlas : texture_2d<f32>;` : ""}

// U[0]  eye.xyz, tanHalfFov          U[1]  fwd.xyz, geometryCount
// U[2]  w, h, spp, eps               U[3]  right.xyz, seedBits
// U[4]  camUp.xyz, _                 U[8+i]  geometry i: centre.xyz, radius
// U[16+i] SBT record i: hitShaderIndex, albedo, emit, _   (emit is RTX round 6 -- 0 means "not a light",
//                                                           scalar pipeline only, see sbtRecord's own doc)
// U[${MESH_META_SLOT}] mesh meta (bvh only): hasMesh, nodeCount, triCount, _
// U[${MESH_SBT_SLOT}] mesh SBT record (bvh only): hitShaderIndex, albedo, _, _
// U[${ENV_META_SLOT}] env atlas meta (envMap only): atlasWidth, faceSize, _, _   (faceSize == atlas height,
//                                                    since a captured atlas is one mip, no LUT -- see envMapTexture)
const GEO_BASE : i32 = 8;
const SBT_BASE : i32 = 16;
const MESH_META : i32 = ${MESH_META_SLOT};
const MESH_SBT : i32 = ${MESH_SBT_SLOT};
const ENV_META : i32 = ${ENV_META_SLOT};

var<private> rngState : u32;
fn nextU32() -> u32 { rngState = rngState * ${LCG.mul}u + ${LCG.inc}u; return rngState; }
${nee ? `
// RTX round 6 -- an adversarial review found this missing. Bit j set means "light j was inside the shading
// point at the PREVIOUS vertex, so rtDirectLight could not cone-sample it there" -- pathTracer.mjs's own
// per-light neeSkipped (v3488), which exists because the GLOBAL version of this guard (every non-camera hit
// on ANY light suppressed, no exception) loses an ENCLOSING light entirely: a shading point standing inside a
// light has no cone to sample (rtDirectLight's own "dist <= g.w" skip), so NEE never adds it, and if a bounce
// ray that happens to land on it directly is ALSO suppressed, NEITHER route ever collects it -- pathTracer.mjs's
// own comment on the bug this fixed: "92.8% of energy" lost, "the picture went dark". MAX_GEOMETRY=4 fits
// comfortably in one u32; a real mesh is never a light (meshSbtBuffer/pipelineUniforms both refuse that).
var<private> neeSkippedMask : u32;` : ""}
fn nextF32() -> f32 { return f32(nextU32()) / ${LCG.div}.0; }
${microfacetOn ? `
// RTX round 8 -- ggxLambda/ggxG2/ggxD/sampleHalfVectorGgx/sampleDirPdfGgx/bounceWeightGgx/bsdfEvalGgx/
// misWeightGgx are a FRESH HAND TRANSCRIPTION of physics/render/microfacet.mjs's own D/Lambda/G1/G2/
// sampleHalfVector/sampleDirPdf/bounceWeight/bsdfEval/misWeight, term for term -- NOT an import of
// physics/render/microfacetWgsl.mjs's lobeWgsl()/microfacetSampleWgsl.mjs's own WGSL text. Both of those
// export a self-contained fault-injection KERNEL (their own Params struct, bindings and @compute entry point,
// built for their own -selfcheck gates), and lobeWgsl()'s own LOBE_HELPERS reads a uniform field, P.faults,
// that exists only to drive that kernel's planted runs and has no place in a production shader -- the same
// "a genuinely different uniform shape gets a fresh hand transcription rather than a forced shared
// abstraction" call this file's own envSampleWgslBlock doc already cites specularProbeCapture.mjs's
// CAPTURED_ENV_WGSL as precedent for.
fn ggxLambda(cosW : f32, a : f32) -> f32 {
  let c2 = cosW * cosW;
  let tan2 = (1.0 - c2) / max(c2, 1.0e-16);
  return (-1.0 + sqrt(1.0 + a * a * tan2)) / 2.0;
}
// Height-correlated Smith masking-shadowing -- microfacet.mjs's own G2 default (separable=false).
fn ggxG2(cosO : f32, cosI : f32, a : f32) -> f32 {
  return 1.0 / (1.0 + ggxLambda(cosO, a) + ggxLambda(cosI, a));
}
// v3494's sum-of-positives denominator, not the textbook difference-of-numbers-near-1 -- worth 2.6e-2 at f32
// at roughness 0.001 per microfacetWgsl.mjs's own measurement; this file carries the same rewrite.
fn ggxD(cosH : f32, a : f32) -> f32 {
  if (cosH <= 0.0) { return 0.0; }
  let a2 = a * a;
  let t = (1.0 - cosH * cosH) + a2 * cosH * cosH;
  return a2 / (${PI} * t * t);
}
fn sampleHalfVectorGgx(u1 : f32, u2 : f32, a : f32) -> vec3<f32> {
  let a2 = a * a;
  let cosH = sqrt((1.0 - u1) / (u1 * (a2 - 1.0) + 1.0));
  let sinH = sqrt(max(0.0, 1.0 - cosH * cosH));
  let phi = 2.0 * ${PI} * u2;
  return vec3<f32>(sinH * cos(phi), cosH, sinH * sin(phi));
}
// The pdf of the SAMPLED DIRECTION -- the 1/(4|wo.wh|) is the reflection's Jacobian.
fn sampleDirPdfGgx(cosH : f32, dotOH : f32, a : f32) -> f32 {
  return ggxD(cosH, a) * cosH / (4.0 * abs(dotOH));
}
// f cos_i / pdf, WITH THE ANALYTIC CANCELLATION TAKEN (D disappears) -- microfacet.mjs's own bounceWeight().
fn bounceWeightGgx(cosO : f32, cosI : f32, cosH : f32, dotOH : f32, a : f32, F : f32) -> f32 {
  if (cosI <= 0.0 || cosO <= 0.0) { return 0.0; }
  return F * ggxG2(cosO, cosI, a) * abs(dotOH) / (cosO * cosH);
}
// f = D G2 F / (4 cos_o cos_i), for a direction NEE hands it -- microfacet.mjs's own bsdfEval().
fn bsdfEvalGgx(cosO : f32, cosI : f32, cosH : f32, a : f32, F : f32) -> f32 {
  if (cosI <= 0.0 || cosO <= 0.0) { return 0.0; }
  return ggxD(cosH, a) * ggxG2(cosO, cosI, a) * F / (4.0 * cosO * cosI);
}
fn misWeightGgx(pThis : f32, pOther : f32) -> f32 {
  let s = pThis + pOther;
  return select(0.0, pThis / s, s > 0.0);
}
// The unpolarised Fresnel reflectance at the MICRO-normal -- physics/render/fresnel.mjs's own fresnel().R,
// confirmed by direct read of that file to be (Rs+Rp)/2, term for term. ior <= 0 means "no ior was given",
// pathTracer.mjs's own hit.sphere.ior ? fresnel(...).R : 1 convention -- F = 1 throughout.
fn fresnelR(cosI : f32, ior : f32) -> f32 {
  if (ior <= 0.0) { return 1.0; }
  let ci = clamp(cosI, 0.0, 1.0);
  let sinT = (1.0 / ior) * sqrt(max(0.0, 1.0 - ci * ci));
  if (sinT >= 1.0) { return 1.0; }
  let ct = sqrt(1.0 - sinT * sinT);
  let rs = (ci - ior * ct) / (ci + ior * ct);
  let rp = (ior * ci - ct) / (ior * ci + ct);
  return 0.5 * (rs * rs + rp * rp);
}` : ""}

fn nrm(v : vec3<f32>) -> vec3<f32> { let l = sqrt(dot(v, v)); if (l == 0.0) { return v; } return v / l; }

// ---- STAGE: raygen -------------------------------------------------------------------------------------
// v4417's inlined camera arithmetic, unchanged and now named. It consumes the same two draws in the same
// order, because a stage that consumed a different number would move every later decision on the path and the
// bit-exact comparison would be about the sequence instead of the transport.
fn rtRaygen(x : i32, y : i32, w : i32, h : i32) -> vec3<f32> {
  let fx = nextF32();
  let fy = nextF32();
  let u = ((f32(x) + fx) / f32(w) * 2.0 - 1.0) * U[0].w * (f32(w) / f32(h));
  let v = (1.0 - (f32(y) + fy) / f32(h) * 2.0) * U[0].w;
  return nrm(U[1].xyz + (U[3].xyz * u + U[4].xyz * v));
}

// ---- STAGE: intersection -------------------------------------------------------------------------------
// A sphere is a PROCEDURAL primitive: in Vulkan this stage exists because only triangles get the built-in
// intersector. occlusion.mjs's raySphere with a = 1, unit directions. Returns -1 for a miss.
fn rtIntersect(orig : vec3<f32>, dir : vec3<f32>, centre : vec3<f32>, radius : f32, eps : f32) -> f32 {
  let o = orig - centre;
  let b = 2.0 * dot(dir, o);
  let c = dot(o, o) - radius * radius;
  let disc = b * b - 4.0 * c;
  if (disc < 0.0) { return -1.0; }
  let sq = sqrt(disc);
  let t0 = (-b - sq) / 2.0;
  let t1 = (-b + sq) / 2.0;
  if (t0 > eps) { return t0; }
  if (t1 > eps) { return t1; }
  return -1.0;
}

// ---- TRAVERSAL: which record wins ----------------------------------------------------------------------
// Linear over the spheres -- honest at four of them, useless at four thousand, which is exactly why a
// TRIANGLE mesh does not go through this loop at all: it gets its own BVH-accelerated intersection below,
// merged in as one extra geometry slot rather than as thousands of linear entries.
struct Hit { t : f32, geo : i32 };
fn rtTraverse(orig : vec3<f32>, dir : vec3<f32>, n : i32, eps : f32) -> Hit {
  var best = Hit(-1.0, -1);
  for (var i = 0; i < n; i = i + 1) {
    let g = U[GEO_BASE + i];
    let t = rtIntersect(orig, dir, g.xyz, g.w, eps);
    if (t > 0.0 && (best.t < 0.0 || t < best.t)) { best = Hit(t, i); }
  }
  ${bvh ? `
  // The mesh (if present) is geometry index n -- one past the last sphere, distinct from every real index
  // the loop above can produce. Its own hit can only IMPROVE best.t, never worsen the sphere-only case, so
  // a scene with hasMesh=0 (the flag the uniform carries) takes the branch below and finds nothing to merge.
  if (U[MESH_META].x > 0.5) {
    let maxT = select(1e30, best.t, best.t > 0.0);
    let mt = rtTraverseBvh(orig, dir, maxT);
    if (mt > 0.0) { best = Hit(mt, n); }
  }` : ""}
  return best;
}

fn coordSystem(N : vec3<f32>) -> mat3x3<f32> {
  var Nt : vec3<f32>;
  if (abs(N.x) > abs(N.y)) {
    let inv = 1.0 / sqrt(N.x * N.x + N.z * N.z);
    Nt = vec3<f32>(N.z * inv, 0.0, -N.x * inv);
  } else {
    let inv = 1.0 / sqrt(N.y * N.y + N.z * N.z);
    Nt = vec3<f32>(0.0, -N.z * inv, N.y * inv);
  }
  return mat3x3<f32>(Nt, cross(N, Nt), N);
}

${needsCone ? `
// ---- STAGE: next-event estimation -- RTX round 6, hand-transcribed from physics/render/nee.mjs and the
// Lambertian NEE loop in physics/render/pathTracer.mjs's own trace() (WGSL cannot import JS, so this is a
// PARALLEL PORT, cited not shared, the same pattern the cosine-hemisphere Lambertian sampler above already
// uses). cosAlpha is computed as cos(asin(x)) rather than via a separate capHalfAngle step -- the literal
// transcription of nee.mjs's own capHalfAngle-then-Math.cos, not a trig-identity shortcut (verified against
// it in a scratch script before this line was written: identical to the last bit across five r/d pairs).
// RTX round 8 -- shared with the microfacet material's own direct-lighting loop below, since a light's solid
// angle is sampled the same way regardless of which BSDF is about to evaluate the direction it returns.
fn sampleCone(r1 : f32, r2 : f32, cosAlpha : f32) -> vec3<f32> {
  let cosT = 1.0 - r1 * (1.0 - cosAlpha);
  let sinT = sqrt(max(0.0, 1.0 - cosT * cosT));
  let phi = 2.0 * ${PI} * r2;
  return vec3<f32>(sinT * cos(phi), cosT, sinT * sin(phi));
}
` : ""}
${nee ? `
// One vertex's direct-lighting sum over every emissive geometry (rec.z > 0), cone-sampled and shadow-tested
// through the SAME rtTraverse the primary/bounce rays already use -- a mesh (if present) is therefore already
// a valid occluder with no extra code, though never itself a light (mesh SBT records always carry emit=0;
// see sbtRecordFloats's own doc). Returns the sum BEFORE the shading point's own albedo/pi factor -- the
// caller multiplies by rec.y the same way pathTracer.mjs's own loop multiplies by alb(hit.sphere) outside it.
fn rtDirectLight(P : vec3<f32>, N : vec3<f32>, nGeo : i32, eps : f32) -> f32 {
  var sum = 0.0;
  for (var j = 0; j < nGeo; j = j + 1) {
    let rec = U[SBT_BASE + j];
    let Le = rec.z;
    if (Le <= 0.0) { continue; }
    let g = U[GEO_BASE + j];
    let toL = g.xyz - P;
    let dist = length(toL);
    // INSIDE THE LIGHT: no cone to sample. Recorded in neeSkippedMask (var<private>, declared beside rngState),
    // not merely skipped -- pathTracer.mjs's own v3488 comment is the reason: an unrecorded skip here plus the
    // main loop's blanket "suppress every non-camera hit on a light" would mean an ENCLOSING light (the shape
    // every environment light takes) is never sampled by NEE (nothing outside is; it always fails this check)
    // AND never collected by a bounce hit either -- neither route, the picture goes dark. The bit set here is
    // read back in the main loop's own emit-hit branch, one vertex later, to let exactly that bounce through.
    if (dist <= g.w) { neeSkippedMask = neeSkippedMask | (1u << u32(j)); continue; }
    let r1 = nextF32();
    let r2 = nextF32();
    let wl = toL / dist;
    let cosAlpha = cos(asin(min(1.0, g.w / dist)));
    let F = coordSystem(wl);
    let sc = sampleCone(r1, r2, cosAlpha);
    let sd = sc.x * F[1] + sc.y * F[2] + sc.z * F[0];
    let cosT = dot(sd, N);
    if (cosT <= 0.0) { continue; }
    let shadowOrig = P + N * eps;
    let occ = rtTraverse(shadowOrig, sd, nGeo, eps);
    if (occ.geo != j) { continue; }               // something else is in the way
    let pdf = 1.0 / (2.0 * ${PI} * (1.0 - cosAlpha));
    sum = sum + Le * cosT / (${PI} * pdf);
  }
  return sum;
}
` : ""}
${microfacetOn && microfacet !== "bsdf" ? `
// RTX round 8 -- pathTracer.mjs's own microfacet NEE loop (v3499), term for term, single-scattering lobe
// only: fMs (the multi-scatter energy-compensation lobe, energyCompWgsl.mjs's msLobe) is always 0 here --
// see this round's own backlog entry on why that lobe is explicitly deferred rather than ported. UNLIKE
// rtDirectLight, there is no common per-light factor (albedo/pi) to pull outside the loop and multiply by
// afterwards: the microfacet f depends on the sampled direction itself (through cosH/dotOH), so it has to be
// evaluated inside, and this returns the FULL radiance contribution ready to scale by throughput and add.
fn rtDirectLightMicrofacet(P : vec3<f32>, N : vec3<f32>, wo : vec3<f32>, cosO : f32, a : f32, ior : f32,
                            nGeo : i32, eps : f32) -> f32 {
  var sum = 0.0;
  for (var j = 0; j < nGeo; j = j + 1) {
    let rec = U[SBT_BASE + j];
    let Le = rec.z;
    if (Le <= 0.0) { continue; }
    let g = U[GEO_BASE + j];
    let toL = g.xyz - P;
    let dist = length(toL);
    if (dist <= g.w) { continue; }
    let r1 = nextF32();
    let r2 = nextF32();
    let wl = toL / dist;
    let cosAlpha = cos(asin(min(1.0, g.w / dist)));
    let F = coordSystem(wl);
    let sc = sampleCone(r1, r2, cosAlpha);
    let sd = sc.x * F[1] + sc.y * F[2] + sc.z * F[0];
    let cosI = dot(sd, N);
    if (cosI <= 0.0) { continue; }
    let occ = rtTraverse(P + N * eps, sd, nGeo, eps);
    if (occ.geo != j) { continue; }               // something else is in the way
    let wh = nrm(wo + sd);
    let cosH = dot(wh, N);
    let dotOH = dot(wo, wh);
    if (cosH <= 0.0 || dotOH <= 0.0) { continue; }
    let Fn = fresnelR(dotOH, ior);
    let fSpec = bsdfEvalGgx(cosO, cosI, cosH, a, Fn);
    let pL = 1.0 / (2.0 * ${PI} * (1.0 - cosAlpha));
    ${microfacet === "mis" ? `let pB = sampleDirPdfGgx(cosH, dotOH, a);
    let w = misWeightGgx(pL, pB);` : `let w = 1.0;`}
    sum = sum + Le * fSpec * cosI * w / pL;
  }
  return sum;
}
` : ""}

// ---- STAGE: closest-hit --------------------------------------------------------------------------------
// *** DISPATCHED BY THE BINDING TABLE, NOT BY A BRANCH AT THE CALL SITE. *** WGSL has no function pointers,
// so the jump is a switch on the record's shader index -- which is what WebRTX does too, and for the same
// reason. What makes it a binding table rather than an if-chain is that THE INDEX IS DATA IN A BUFFER:
// adding a geometry appends a record and the traversal above never changes.
struct Bounce { dir : vec3<f32>, weight : f32 };
fn rtClosestHit(shaderIndex : i32, albedo : f32, N : vec3<f32>, inDir : vec3<f32>) -> Bounce {
  // The two bounce draws are consumed for EVERY shader, so switching materials cannot desynchronise the
  // sequence -- the same rule v3467 set for plants and pathTracer.mjs follows for plantNoJitter.
  let r1 = nextF32();
  let r2 = nextF32();
  switch (shaderIndex) {
    case ${HIT_SHADERS.mirror}: {
      // A perfect specular bounce: no cosine draw is used, but both draws are still taken.
      return Bounce(nrm(inDir - 2.0 * dot(inDir, N) * N), albedo);
    }
    default: {
      let r = sqrt(r1);
      let phi = 2.0 * ${PI} * r2;
      let local = vec3<f32>(r * cos(phi), sqrt(max(0.0, 1.0 - r1)), r * sin(phi));
      let F = coordSystem(N);
      // Cosine-weighted, so the cosine cancels against the pdf and the weight is just the albedo.
      return Bounce(nrm(local.x * F[1] + local.y * F[2] + local.z * F[0]), albedo);
    }
  }
}

${envMap ? `
// ---- STAGE: miss, envMap -- RTX round 7. envSampleWgslBlock's own doc explains the sharing/hand-transcription
// split; U[ENV_META].y is the runtime-varying faceSize source this generated shader reads (so one WGSL variant
// can serve different atlases without being regenerated), as opposed to envProbeWgsl's baked constant.
${envSampleWgslBlock("i32(U[ENV_META].y)")}
` : ""}

// ---- STAGE: miss ---------------------------------------------------------------------------------------
fn rtMiss(d : vec3<f32>) -> f32 {
${envMap ? `  let c = rtEnvSample(d);
  // Mean of the three channels, not a channel broadcast -- rtMissRgb's own doc comment below explains why a
  // genuine RGB sky has no single "the" channel to stand in for the scalar pipeline's grey convention.
  return (c.x + c.y + c.z) / 3.0;` : gradient ? `  return 0.3 + 0.7 * (0.5 * (d.y + 1.0));` : `  return 1.0;`}
}

${rgb ? `
// ---- RGB VARIANTS -- vec3 throughput, vec3 albedo, three floats per pixel out -----------------------------
// *** NOT A REWRITE OF rtClosestHit/rtMiss -- A SEPARATE PAIR. *** Reusing them by widening weight/the sky
// value to vec3 would mean EVERY caller, including every one before this round, now packs and reads three
// SBT floats instead of one -- and this file's whole discipline since v4417 has been that a scene which
// never asks for a capability renders EXACTLY as it did before that capability existed. Two small functions
// cost far less than putting that guarantee at risk.
struct BounceRgb { dir : vec3<f32>, weight : vec3<f32> };
fn rtClosestHitRgb(shaderIndex : i32, albedo : vec3<f32>, N : vec3<f32>, inDir : vec3<f32>) -> BounceRgb {
  let r1 = nextF32();
  let r2 = nextF32();
  switch (shaderIndex) {
    case ${HIT_SHADERS.mirror}: {
      return BounceRgb(nrm(inDir - 2.0 * dot(inDir, N) * N), albedo);
    }
    default: {
      let r = sqrt(r1);
      let phi = 2.0 * ${PI} * r2;
      let local = vec3<f32>(r * cos(phi), sqrt(max(0.0, 1.0 - r1)), r * sin(phi));
      let F = coordSystem(N);
      return BounceRgb(nrm(local.x * F[1] + local.y * F[2] + local.z * F[0]), albedo);
    }
  }
}
${envMap ? `
// RTX round 7 -- the one place envMap and rgb actually interact: rtMissRgb can now return the atlas's TRUE
// colour instead of the grey broadcast below, since there genuinely IS a per-channel value to return. envSkyCpu
// (this file's own CPU oracle) makes the identical choice: rgb:true reads sampleCapturedCubemap's triple
// directly, rgb:false takes its mean -- the same branch, on the other side of the port.
fn rtMissRgb(d : vec3<f32>) -> vec3<f32> { return rtEnvSample(d); }
` : `
// Grey, not because color is unmodeled here, but because pathTracer.mjs's own sky() always returns a scalar
// that col() broadcasts to (v,v,v) -- this matches that convention exactly rather than inventing a second one.
fn rtMissRgb(d : vec3<f32>) -> vec3<f32> { return vec3<f32>(rtMiss(d), rtMiss(d), rtMiss(d)); }
`}
` : ""}

@compute @workgroup_size(${workgroupSize})
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let w = i32(U[2].x);
  let h = i32(U[2].y);
  let idx = i32(gid.x);
  if (idx >= w * h) { return; }
  let x = idx % w;
  let y = idx / w;
  let spp = i32(U[2].z);
  let eps = U[2].w;
  let nGeo = i32(U[1].w);

  rngState = (bitcast<u32>(U[3].w) * 73856093u) ^ (u32(x) * 19349663u) ^ (u32(y) * 83492791u);
${rgb ? `
  var acc = vec3<f32>(0.0, 0.0, 0.0);
  for (var s = 0; s < spp; s = s + 1) {
    var d = rtRaygen(x, y, w, h);
    var o = U[0].xyz;
    var throughput = vec3<f32>(1.0, 1.0, 1.0);
    var radiance = vec3<f32>(0.0, 0.0, 0.0);

    for (var depth = 0; depth < ${MAX_DEPTH}; depth = depth + 1) {
      let hit = rtTraverse(o, d, nGeo, eps);
      if (hit.geo < 0) { radiance = radiance + throughput * rtMissRgb(d); break; }
      let P = o + d * hit.t;
      var N : vec3<f32>;
      var rec : vec4<f32>;
      var albedo : vec3<f32>;
      ${bvh ? `if (hit.geo == nGeo) {
        N = rtTriNormal(bvhHitTri * 9);
        ${meshMaterials ? `rec = bvhSbt[bvhMatIdx[bvhHitTri]];` : `rec = U[MESH_SBT];`}
        albedo = rec.yzw;
        ${vertexColors ? `albedo = albedo * rtVertColor(bvhHitTri * 9, bvhHitU, bvhHitV);` : ""}
      } else {` : ""}
      let g = U[GEO_BASE + hit.geo];
      N = nrm(P - g.xyz);
      rec = U[SBT_BASE + ${plantIgnoreRecord ? "0" : plantSwapRecords ? "(nGeo - 1 - hit.geo)" : "hit.geo"}];
      albedo = rec.yzw;
      ${bvh ? `}` : ""}
      let b = rtClosestHitRgb(i32(rec.x), albedo, N, d);
      d = b.dir;
      o = P + N * eps;
      throughput = throughput * b.weight;
    }
    acc = acc + radiance;
  }
  outBuf[idx * 3] = acc.x / f32(spp);
  outBuf[idx * 3 + 1] = acc.y / f32(spp);
  outBuf[idx * 3 + 2] = acc.z / f32(spp);
` : `
  var acc = 0.0;
  for (var s = 0; s < spp; s = s + 1) {
    var d = rtRaygen(x, y, w, h);
    var o = U[0].xyz;
    var throughput = 1.0;
    var radiance = 0.0;
    ${needsDirectState ? `var prevWasCamera = true;` : ""}
    ${nee ? `neeSkippedMask = 0u;
    var prevHadNeeRoute = false;` : ""}
    ${microfacetOn ? `// RTX round 8 -- the microfacet vertex the PREVIOUS loop iteration left, so an emitter hit
    // one vertex later can be weighted (misFromMode 2, "mis"), suppressed (1, "nee"), or added whole
    // (0, "bsdf") the same three ways pathTracer.mjs's own misFrom dispatch does. -1 means "the previous
    // vertex was not a microfacet bounce" -- ordinary var, not var<private>: unlike neeSkippedMask, nothing
    // outside this inline loop body ever reads or writes it.
    var misFromMode = -1;
    var misFromP = vec3<f32>(0.0, 0.0, 0.0);
    var misFromPdf = 0.0;` : ""}

    for (var depth = 0; depth < ${MAX_DEPTH}; depth = depth + 1) {
      let hit = rtTraverse(o, d, nGeo, eps);
      if (hit.geo < 0) { radiance = radiance + throughput * rtMiss(d); break; }
      let P = o + d * hit.t;
      var N : vec3<f32>;
      var rec : vec4<f32>;
      ${bvh ? `if (hit.geo == nGeo) {
        // The mesh's own hit -- its normal comes from the winning triangle's edges, not from a sphere
        // centre, and its material from the ONE record a bvh scene carries rather than the per-sphere table
        // (RTX round 4's meshMaterials: PER-TRIANGLE, via bvhMatIdx -- Vulkan's own SBT-offset idiom).
        N = rtTriNormal(bvhHitTri * 9);
        ${meshMaterials ? `rec = bvhSbt[bvhMatIdx[bvhHitTri]];` : `rec = U[MESH_SBT];`}
      } else {` : ""}
      let g = U[GEO_BASE + hit.geo];
      N = nrm(P - g.xyz);
      // *** THE BINDING TABLE LOOKUP. *** plantSwapRecords reads the WRONG record for the hit geometry and
      // plantIgnoreRecord reads record 0 always -- both are PARAMETERS rather than edited copies, so a
      // planted run and a clean run take the same code path (v3467's rule).
      rec = U[SBT_BASE + ${plantIgnoreRecord ? "0" : plantSwapRecords ? "(nGeo - 1 - hit.geo)" : "hit.geo"}];
      ${bvh ? `}` : ""}
      ${needsDirectState ? `
      // *** THE DOUBLE-COUNT GUARD -- pathTracer.mjs's trace() (v3488-v3495 comments on that file) is the
      // reference for this exact rule: an emitter hit ENDS THE PATH (there is no reflective component once a
      // shading point turns out to be a light), and its radiance is added only when this IS the camera ray, OR
      // when NEE could not have sampled this exact light from the vertex just left. Otherwise a non-camera ray
      // landing on a light already had that light's contribution added at the PREVIOUS vertex, so adding it
      // again here would double it -- forget the guard entirely and every light-lit surface reads twice as
      // bright, uniformly, which looks like a brighter scene rather than a bug.
      if (rec.z > 0.0) {
        ${microfacetOn ? `// RTX round 8 -- a microfacet bounce is weighted rather than merely suppressed,
        // pathTracer.mjs's own misFrom dispatch (trace()'s v3495 comment: "a microfacet bounce landing on a
        // light is not suppressed under MIS, it is weighted"). misFromMode < 0 means the previous vertex was
        // not a microfacet bounce at all, so this falls through to the lambertian/mirror guard below.
        if (misFromMode >= 0 && !prevWasCamera) {
          if (misFromMode == 1) { break; }                                    // "nee": already collected there
          if (misFromMode == 0) { radiance = radiance + throughput * rec.z; break; }   // "bsdf": the only route
          let gLight = U[GEO_BASE + hit.geo];
          let toL = gLight.xyz - misFromP;
          let dist = length(toL);
          var pL = 0.0;
          if (dist > gLight.w) {
            let cosAlpha = cos(asin(min(1.0, gLight.w / dist)));
            pL = 1.0 / (2.0 * ${PI} * (1.0 - cosAlpha));
          }
          radiance = radiance + throughput * rec.z * misWeightGgx(misFromPdf, pL);
          break;
        }` : ""}
        ${nee ? `let wasSkipped = (neeSkippedMask & (1u << u32(hit.geo))) != 0u;
        // *** THE MIRROR FIX -- RTX round 8. *** wasSkipped reads false after ANY vertex that never ran
        // rtDirectLight (a mirror bounce, in particular), because neeSkippedMask is reset to 0 every vertex
        // below and only rtDirectLight ever sets a bit in it. The ORIGINAL guard read that false the same as
        // "NEE saw this light and chose not to skip it", which is wrong: NEE never ran at all there, so
        // nothing could have already counted this light. Without prevHadNeeRoute a light reflected through a
        // mirror is silently suppressed -- found while wiring the microfacet material's own three-way
        // discriminator, fixed here rather than left standing next to the code it sits beside.
        // plantDoubleCount is the PARAMETER form of the double-count mistake (CPU's own plantDoubleCount,
        // named identically -- v3467's rule) -- it forces the suppression off entirely, so
        // rtPipeline-selfcheck.mjs can assert the guard is load-bearing without editing the source file.
        if (prevWasCamera || wasSkipped || !prevHadNeeRoute${plantDoubleCount ? " || true" : ""}) {
          radiance = radiance + throughput * rec.z;
        }
        break;` : `radiance = radiance + throughput * rec.z;
        break;`}
      }
      ${nee ? `// Reset EVERY vertex, matching pathTracer.mjs's own "let skipped = null" (re-declared fresh
      // each loop iteration) -- a light skipped two vertices back must not still read as skipped now.
      neeSkippedMask = 0u;
      // NEXT-EVENT ESTIMATION, LAMBERTIAN SURFACES ONLY -- pathTracer.mjs's own loop gates on
      // hit.sphere.roughness === undefined; the microfacet material (RTX round 8) is skipped here and handled
      // in its own block below, the same way pathTracer.mjs's own trace() gives it a separate branch.
      // HIT_SHADERS.mirror gets no direct-light term (a perfect mirror has no diffuse component for a light
      // sample to land on). rtDirectLight is what populates neeSkippedMask for THIS vertex, read back at the
      // NEXT one.
      if (i32(rec.x) == ${HIT_SHADERS.lambertian}) {
        radiance = radiance + throughput * rec.y * rtDirectLight(P, N, nGeo, eps);
      }
      prevHadNeeRoute = (i32(rec.x) == ${HIT_SHADERS.lambertian});` : ""}
      prevWasCamera = false;
      ${microfacetOn ? `// pathTracer.mjs's own v3495 comment, term for term: "a Lambertian bounce is not a
      // microfacet one; a stale record would weight its hit". Reset UNCONDITIONALLY, for every material --
      // the microfacet dispatch block below overwrites it again when it is actually taken. Without this, a
      // path that visits a microfacet vertex, then a LAMBERTIAN one, then lands on a light would still read
      // the MICROFACET vertex's stale misFromMode/misFromP/misFromPdf two vertices back and weight the light
      // hit as if the intervening lambertian vertex had never happened -- found by this round's own scratch
      // gate (a mixed lambertian+microfacet+nee+mis scene reading 0.47% dim against the CPU oracle, a real
      // systematic gap, not noise: relSd was 0.02% at N=16, forty times tighter than the discrepancy).
      misFromMode = -1;
      ` : ""}
      ${microfacetOn ? `if (i32(rec.x) == ${HIT_SHADERS.microfacet}) {
        // RTX round 8 -- NOT dispatched through rtClosestHit's switch: pathTracer.mjs's own v3493 comment is
        // the reason ("a different BSDF, not a multiplier on the diffuse one") -- this needs its own NEE loop
        // and its own misFrom bookkeeping, which the simple {dir, weight} Bounce shape below has no room for.
        let wo = -d;
        let cosO = dot(wo, N);
        if (cosO <= 0.0) { break; }
        let aRough = rec.y;
        let ior = rec.w;
        ${microfacet !== "bsdf" ? `radiance = radiance + throughput * rtDirectLightMicrofacet(P, N, wo, cosO, aRough, ior, nGeo, eps);` : ""}
        let r1b = nextF32();
        let r2b = nextF32();
        let whLocal = sampleHalfVectorGgx(r1b, r2b, aRough);
        let basis = coordSystem(N);
        let wh = whLocal.x * basis[1] + whLocal.y * basis[2] + whLocal.z * basis[0];
        let dotOH = dot(wo, wh);
        if (dotOH <= 0.0) { break; }
        let dNew = 2.0 * dotOH * wh - wo;
        let cosI = dot(dNew, N);
        if (cosI <= 0.0) { break; }
        let cosH = dot(wh, N);
        let Fn = fresnelR(dotOH, ior);
        ${plantMicrofacetWrongPdf
            ? `// v3468's plant, in this lobe: sample the NDF and divide by the COSINE pdf instead of the
            // real one -- the commonest importance-sampling bug there is, and it leaves the picture smooth.
            let wgt = Fn * ggxG2(cosO, cosI, aRough) * ggxD(cosH, aRough) / (4.0 * cosO * cosI) * cosI / (cosI / ${PI});`
            : `let wgt = bounceWeightGgx(cosO, cosI, cosH, dotOH, aRough, Fn);`}
        throughput = throughput * wgt;
        misFromMode = ${{ bsdf: 0, nee: 1, mis: 2 }[microfacet] ?? 0};
        misFromP = P;
        misFromPdf = sampleDirPdfGgx(cosH, dotOH, aRough);
        d = dNew;
        o = P + N * eps;
        continue;
      }` : ""}
      ` : ""}
      let b = rtClosestHit(i32(rec.x), rec.y, N, d);
      d = b.dir;
      o = P + N * eps;
      throughput = throughput * b.weight;
    }
    acc = acc + radiance;
  }
  outBuf[idx] = acc / f32(spp);
`}
}
`;
}

/**
 * The uniform block the pipeline reads, packed from the binding table.
 *
 * `bvh` is a lightweight DESCRIPTOR, not the buffers themselves -- `{ nodeCount, triCount, hit, albedo }`. The
 * actual bounds/meta/order/tris arrays go to the GPU as storage-buffer `inputs` (see bvhInputs), because a
 * uniform block this size cannot hold an arbitrary mesh; this only sets the two extra slots (MESH_META,
 * MESH_SBT) a bvh-enabled pipeline reads to know the mesh is there and how to shade it.
 *
 * `rgb` packs each record's albedo into all THREE of a slot's spare floats (y, z, w) instead of just y, so
 * pipelineWgsl({rgb:true})'s `rec.yzw` reads a real [r,g,b] -- matching pipelineWgsl's own rgb option, which
 * must be passed the same way on both sides or the shader reads a record this function never wrote correctly.
 *
 * `meshMaterials` MUST ALSO MATCH pipelineWgsl's own option, the same way and for the same reason -- and here
 * the mismatch is quieter than rgb's, because the two directions fail differently rather than both landing on
 * "reads the wrong bytes":
 *   - meshMaterials here, NOT in pipelineWgsl: this function skips both the `bvh.hit` validation and the
 *     MESH_SBT_SLOT write (there is nowhere for a single mesh-wide record to go once the caller says there are
 *     several), but the generated WGSL still reads U[MESH_SBT] -- an all-zero slot nobody wrote. The mesh
 *     renders solid black, with no thrown error on either side to say why.
 *   - meshMaterials in pipelineWgsl, NOT here: the WGSL reads bvhSbt[bvhMatIdx[bvhHitTri]] from storage buffers
 *     this function never touches at all (they are built separately -- see meshSbtBuffer -- and bound by the
 *     caller, not packed into U). Whatever the caller left bound there is what shades the mesh.
 * Both are silent. Pass the identical `meshMaterials` value to both calls, the same discipline `rgb` already
 * asks for.
 */
export function pipelineUniforms(sbt, { spp = 16, seed = 1, view = VIEW, eps = EPS, bvh = null, rgb = false, meshMaterials = false, envMap = null, microfacet = false } = {}) {
    if (sbt.length > MAX_GEOMETRY) throw new Error("rtPipeline: at most " + MAX_GEOMETRY + " geometries");
    // RTX round 8 -- found by an adversarial review, and refused rather than left silent the way rgb/
    // meshMaterials still are: a `hit: "microfacet"` record packs and binds unconditionally (sbtRecordFloats
    // has no notion of what WGSL variant will read it back), but rtClosestHit's switch has no `case 2` at all
    // unless pipelineWgsl() was itself called with `microfacet: "bsdf"|"nee"|"mis"` -- so a mismatched pair of
    // calls does not fail to compile or throw anywhere downstream, it silently renders the sphere as
    // Lambertian with roughness read as albedo. Pass the SAME `microfacet` value given to pipelineWgsl() here.
    if (!microfacet && (sbt.some((r) => r.hit === "microfacet") || (bvh && bvh.hit === "microfacet"))) throw new Error(
        "rtPipeline: pipelineUniforms sees a microfacet record but was not told pipelineWgsl() was given a " +
        "microfacet mode -- pass the same `microfacet: \"bsdf\"|\"nee\"|\"mis\"` value here, or the generated " +
        "WGSL has no case for HIT_SHADERS.microfacet and the record silently misrenders as Lambertian.");
    const { w, h, eye, look, up, fovDeg } = view;
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return l === 0 ? v : [v[0] / l, v[1] / l, v[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const fwd = nrm(sub(look, eye));
    const right = nrm(cross(fwd, up));
    const camUp = cross(right, fwd);
    const seedBits = new Float32Array(new Uint32Array([seed >>> 0]).buffer)[0];
    const U = new Float32Array(24 * 4);
    U.set([eye[0], eye[1], eye[2], Math.tan(fovDeg * Math.PI / 360)], 0);
    U.set([fwd[0], fwd[1], fwd[2], sbt.length], 4);
    U.set([w, h, spp, eps], 8);
    U.set([right[0], right[1], right[2], seedBits], 12);
    U.set([camUp[0], camUp[1], camUp[2], 0], 16);
    sbt.forEach((r, i) => {
        U.set([r.centre[0], r.centre[1], r.centre[2], r.radius], (8 + i) * 4);
        U.set(sbtRecordFloats(r, { rgb }), (16 + i) * 4);
    });
    if (bvh) {
        U.set([1, bvh.nodeCount, bvh.triCount, 0], MESH_META_SLOT * 4);
        // RTX round 4 -- under meshMaterials, the WGSL mesh-hit branch reads bvhSbt[bvhMatIdx[bvhHitTri]]
        // instead of U[MESH_SBT] (pipelineWgsl's own `meshMaterials` option decides which text it generates),
        // so a single mesh-wide bvh.hit/bvh.albedo has nowhere to go and is not required here -- the per-
        // material records live in a separate storage buffer, built by meshSbtBuffer() and bound by the caller.
        //
        // Same refusal as meshSbtBuffer's own, for the same reason: a single mesh-wide emit would terminate a
        // path on direct hit but could never be NEE-sampled (rtDirectLight only walks the sphere table).
        if (bvh.emit) throw new Error(
            "rtPipeline: pipelineUniforms refuses an emissive mesh-wide record (bvh.emit is set) -- the mesh " +
            "can never be NEE-sampled as a light, only hit directly, which is the same half-working feature " +
            "meshSbtBuffer() already refuses for the per-triangle case.");
        if (!meshMaterials) U.set(sbtRecordFloats(bvh, { rgb }), MESH_SBT_SLOT * 4);
    }
    // RTX round 7 -- envMap is the atlas object itself (captureBaseCubemap()/packCapturedAtlas()'s own shape),
    // matching `bvh`'s own convention of taking the descriptor rather than a caller-picked subset of its fields.
    // Only width/height are read here: the WGSL side assumes a single-mip, no-LUT atlas (faceSize == height),
    // the same assumption envMapTexture's own doc states.
    if (envMap) U.set([envMap.width, envMap.height, 0, 0], ENV_META_SLOT * 4);
    return U;
}

export { notExactInF32 };

/** What v4418 measured. Re-take with: node physics/render/rtPipeline-selfcheck.mjs */
export const MEASURED_AT_V4418 = Object.freeze({
    stagesPresentInV4417Monolith: 4, stagesTotal: 5, missing: "anyHit",
    monolithGeometries: 1,
    twoSphereFurnace: Object.freeze({ nonDyadicPixels: 0, distinctValues: 69, min: 0.132813 }),
    // Differing pixels against the CPU f64 reference. The boundary is at THREE.
    differing: Object.freeze({ oneSphere: 0, twoApart: 0, twoTouching: 0, threeSpheres: 1, threeOf: 1024 }),
    // The one three-sphere disagreement, times spp: a whole flipped sample, not a rounding drift.
    threeSphereDeltaTimesSpp: 1.578125,
    // Mirror record against lambertian record, same geometry, two skies. The gap is the blindness.
    materialVisibility: Object.freeze({ constantSky: 15, gradientSky: 70, of: 576 }),
});

/**
 * What the BVH round measured. Not stamped MEASURED_AT_V4419 -- there is no v4419 in this branch's real
 * history (ENGINE_VERSION was already past it before this round started), and a made-up number the tree
 * cannot check is exactly what the ship ritual's own rules refuse. Re-take with:
 * node physics/render/rtPipeline-selfcheck.mjs
 */
export const MEASURED_BVH_ROUND = Object.freeze({
    // A unit cube (12 triangles, 8 vertices) through the binned-SAH build at maxLeaf=8 default.
    cubeBvh: Object.freeze({ nodes: 5, triangles: 12, depth: 2 }),
    // 32 rays (8 hand-picked -- straight-on, diagonal, two misses, a near-corner grazer -- plus 24 swept
    // around the cube) against mesh/meshBVH.mjs's own raycastFirst(). Zero true mismatches; the only
    // disagreement is a ray landing exactly on an edge two triangles share, verified by checking the two
    // triangles actually have two vertices in common rather than asserted away.
    //
    // *** RTX ROUND 4 CORRECTED THIS FIELD FROM 2 TO 1. *** It was never really 2 -- bvhProbeWgsl's own missing
    // ray-count guard (fixed this round; see MEASURED_MATERIALS_ROUND.probeBoundsBugFound) corrupted the LAST
    // of the 32 rays' results, and the corrupted answer happened to land on a triangle sharing two vertices
    // with the true one, so it read as a second "genuine" tie rather than as the bug it was. The number here
    // was wrong for two whole rounds; recorded honestly rather than left standing now that it is known.
    bvhIntersection: Object.freeze({ rays: 32, trueMismatches: 0, sharedEdgeTies: 1 }),
    // A 32x32 frame with ONLY the bvh mesh in the scene, no spheres -- proof the geometry-slot merge in
    // rtTraverse actually fires, not a claim about picture quality (there is no CPU radiance oracle for a
    // triangle; pathTracer.mjs's scene is spheres, full stop).
    meshOnlyRender: Object.freeze({ px: 1024, notSky: 484 }),
    // The sphere-only path, unchanged: pipelineWgsl({}) -- every caller's shape before this round -- is still
    // bit-exact against the CPU f64 reference, proving the bvh merge is inert when U[MESH_META].x is 0.
    sphereOnlyStillExact: Object.freeze({ differing: 0, of: 576 }),
});

/**
 * What the shading round (vec3 albedo, barycentric vertex colour) measured. Re-take with:
 * node physics/render/rtPipeline-selfcheck.mjs
 */
export const MEASURED_SHADING_ROUND = Object.freeze({
    // Two dyadic-RGB spheres, rgb:true, against pathTracer.mjs's own rgb:true CPU reference -- bit-exact,
    // the same v3497 componentwise argument that already held for one dyadic scalar channel.
    rgbSpheresStillExact: Object.freeze({ differing: 0, of: 1728 }),
    // rtVertColor's Moller-Trumbore-derived barycentrics against mesh/meshBVH.mjs's independently-computed
    // baryAt(), for every ray of a 24-ray sweep that actually hit the (rewound) cube.
    vertexColourVsBaryAt: Object.freeze({ raysHit: 24, of: 24, disagree: 0, maxDelta: 1.176e-7 }),
    // *** THE REAL FINDING: A WINDING BUG IN THE TEST FIXTURE, NOT IN THIS FILE. *** The section 6 cube (used
    // unchanged since the BVH round) had all twelve triangles wound with INWARD-facing normals -- invisible to
    // intersection-only grading (Moller-Trumbore doesn't care about winding for hit/miss) and invisible to a
    // glance at the code, because rtTriNormal/cross(e1,e2) is exactly the textbook formula and computes the
    // wrong-but-consistent answer for wrongly-wound input. It surfaces as a near-black render: an inward
    // normal sends a diffuse bounce back INTO a convex shape, which can trap for the whole depth budget and
    // return {0,0,0} -- looking exactly like broken colour math rather than a geometry bug. Diagnosed by
    // isolating the FIRST-HIT albedo (no bouncing): it was already correct and colourful, which is what
    // pointed at the bounce/normal path rather than rtVertColor itself.
    windingBugFound: Object.freeze({ trianglesAffected: 12, of: 12, symptom: "near-black render, correct first-hit albedo" }),
});

/**
 * What RTX round 4 measured -- multi-material SBT offset (Vulkan's own idiom, within one BLAS) and the
 * statistical gate the original gameplan called for and the shading round explicitly deferred. Re-take with:
 * node physics/render/rtPipeline-selfcheck.mjs
 */
export const MEASURED_MATERIALS_ROUND = Object.freeze({
    // Twelve triangles, alternating materials one apart, each probed at its own centroid -- an off-by-one
    // OFFSET (reading the adjacent triangle's record) would fail every pair rather than averaging away.
    multiMaterialProbe: Object.freeze({ triangles: 12, wrongRecord: 0 }),
    // *** THE REAL FINDING: A LATENT BUG IN THE TWO PROBES BEFORE THIS ROUND'S OWN, TWO ROUNDS OLD. ***
    // bvhProbeWgsl/bvhShadeProbeWgsl took no ray count; @workgroup_size(64) always launches 64 invocations, and
    // every caller supplied fewer. The excess threads' out-of-bounds writes clamped onto the LAST real ray's
    // slot (WebGPU's own out-of-range STORE behaviour), corrupting it -- invisible in the BVH round's own
    // 32-ray sweep because the corrupted answer happened to share two vertices with the true one, which the
    // "genuine shared-edge tie" tolerance (written for an honest case) absorbed without complaint. Fixed with a
    // required `rayCount` on all three probes, guarding `if (gid.x >= RAY_COUNT) { return; }`.
    probeBoundsBugFound: Object.freeze({ affectedProbes: 2, roundsLatent: 2, sharedEdgeTiesBefore: 2, sharedEdgeTiesAfter: 1 }),
    // The concave open-box scene (10 triangles, a genuine cavity), a CPU mesh tracer pathTracer.mjs did not
    // have before this round (intersect() alone grew a mesh branch; trace() needed no changes) against
    // rtPipeline.mjs's own GPU kernel, 8 independently-seeded runs per side, GPU offset +2000 from CPU so the
    // two share no random draws (physics/render/samplerCheck.mjs's own "a shared sampler agrees perfectly and
    // is perfectly wrong" warning, applied to inputs rather than to a sampler).
    concaveStatisticalGate: Object.freeze({
        seeds: 8, cpuMean: 0.229534, cpuRelSd: 0.0105, gpuMean: 0.227655, gpuRelSd: 0.0117,
        ratio: 0.991814, deviationFromOne: 0.008186, threeSigmaBound: 0.016654,
    }),
    // *** AND THE SECOND REAL FINDING: THE STATISTICAL GATE CANNOT SEE A BUG BOTH SIDES SHARE. *** Sabotaging
    // the open box's own winding (one face reverted to the OUTWARD, closed-hull convention) failed the
    // dedicated winding-direction assertion by name -- but the statistical comparison above PASSED, because a
    // mesh-data bug is wrong on BOTH the CPU's triNormal() and the GPU's rtTriNormal() identically (the same
    // cross(e1,e2) formula, same input), so the two renderers still agree with each other about the resulting
    // wrong scene. This is why the winding check stays a separate, explicit assertion rather than being folded
    // into "the statistical gate covers geometry too" -- measured to be structurally unable to, not assumed.
    statisticalGateBlindToSharedMeshBugs: Object.freeze({ found: true, caughtInstead: "the winding-direction assertion" }),
});

// v4468 -- the probe manifest (docs/GPU-KERNEL-CONTRACT.md): a two-record LAMBERTIAN table (the CPU tracer has no
// mirror), the twin delegated to pathTracer.mjs, tolerance zero on dyadic albedos. The corpus's mirror entry is the
// cross-backend claim; this one is the CPU claim.
const PROBE_SBT = Object.freeze([sbtRecord({ centre: [-1.2, 0, 0], radius: 0.6, albedo: 0.5 }), sbtRecord({ centre: [1.2, 0, 0], radius: 0.6, albedo: 0.25 })]);
export const PROBES = Object.freeze([Object.freeze({
    id: "rtPipeline.pipelineWgsl", code: () => pipelineWgsl({}), entryPoint: "main",
    args: Object.freeze({ sbt: PROBE_SBT, spp: 16, view: VIEW, eps: 1e-4 }),
    pack: (a) => pipelineUniforms(a.sbt, a), cpu: (a) => Float32Array.from(renderSbtCpu(a.sbt, a)), outCount: VIEW.w * VIEW.h, workgroups: Math.ceil(VIEW.w * VIEW.h / 64), tol: 0,
    key: () => ({ exact: tablePreconditions(PROBE_SBT, 16).exact, stages: STAGES.length }),
})]);
