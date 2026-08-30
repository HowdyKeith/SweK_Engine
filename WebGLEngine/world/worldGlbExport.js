// FILE: world/worldGlbExport.js -- v4156
//
// Walks a loaded voxel world into the triangle soup tools/export/voxelGlb.mjs writes out.
//
// *** IT REUSES THE MESHER THE RENDERER ALREADY USES, WHICH IS THE ENTIRE REASON THIS IS SHORT. ***
// world/chunkMesherCore.js does GREEDY meshing -- it merges coplanar runs of identical voxels into single
// quads. A naive exporter emitting a cube per voxel would produce, for the default 15x15 chunk grid at 16
// voxels a side, millions of boxes and a file nobody can open. Going through meshChunk means the export has
// exactly the geometry the screen has, and the two cannot drift.
//
// *** AND THE MESHER ALREADY EMITS WORLD SPACE. *** chunkMesherCore's own header: "verts: 3 floats per vertex,
// world-space (already offset by cx*S, cz*S)". So nothing here translates anything -- a second offset applied
// on top would scatter every chunk to double its true distance from the origin, which is the kind of bug that
// looks like a broken exporter and is actually a misread comment.
//
// DUCK-TYPED ON PURPOSE: this takes anything with `{ chunks: Map<"cx,cz", {voxels}>, chunkSize }`, not a
// VoxelWorld. Constructing a real one pulls in erosion, fluids, rain and WebGL; the export is a pure function
// of the voxels, so the gate builds a three-chunk world by hand and this file is exercised for real without any
// of that. A module that could only be tested by booting the engine is a module nobody tests.
"use strict";
import { meshChunk } from "./chunkMesherCore.js";
import { writeGlb, glbStats } from "../tools/export/voxelGlb.mjs";

/** The 8 horizontal neighbours in the "dx,dz" shape readVoxel() expects. Missing ones are simply absent. */
function neighboursOf(chunks, cx, cz) {
    const n = {};
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx === 0 && dz === 0) continue;
            const c = chunks.get((cx + dx) + "," + (cz + dz));
            if (c && c.voxels) n[dx + "," + dz] = c.voxels;
        }
    }
    return n;
}

/**
 * Mesh every loaded chunk. Returns [{ name, positions, colors }] ready for writeGlb.
 *
 * @param opts.skipWater  leave water out, which is usually what somebody printing or importing a model wants
 * @param opts.slopes     include the smoothed slope geometry as its own mesh (default true)
 */
export function worldMeshes(world, opts = {}) {
    if (!world || !world.chunks || typeof world.chunks.forEach !== "function") {
        throw new Error("worldMeshes: needs a world with a chunks Map");
    }
    const S = world.chunkSize || 16;
    const out = [];
    let skippedEmpty = 0;
    for (const [key, chunk] of world.chunks) {
        if (!chunk || !chunk.voxels || !chunk.voxels.length) { skippedEmpty++; continue; }
        // HEIGHT IS DERIVED FROM THE BUFFER rather than read off the world, so this cannot disagree with the
        // array it is about to index. A chunk is size*height*size, so height falls straight out.
        const H = Math.floor(chunk.voxels.length / (S * S));
        if (H < 1) { skippedEmpty++; continue; }
        const [cxs, czs] = key.split(",");
        const cx = parseInt(cxs, 10), cz = parseInt(czs, 10);
        if (!Number.isFinite(cx) || !Number.isFinite(cz)) { skippedEmpty++; continue; }
        let r;
        try {
            r = meshChunk({ voxels: chunk.voxels, neighbors: neighboursOf(world.chunks, cx, cz),
                            size: S, height: H, cx, cz, skipWater: opts.skipWater !== false });
        } catch { skippedEmpty++; continue; }
        if (r && r.verts && r.verts.length >= 9) {
            out.push({ name: "chunk_" + cx + "_" + cz, positions: r.verts, colors: r.cols });
        }
        if (opts.slopes !== false && r && r.slopeVerts && r.slopeVerts.length >= 9) {
            out.push({ name: "slopes_" + cx + "_" + cz, positions: r.slopeVerts, colors: r.slopeCols });
        }
    }
    out._skippedEmpty = skippedEmpty;
    return out;
}

/** The whole job: world -> .glb bytes, with the stats a caller should show before offering a download. */
export function exportWorldGlb(world, opts = {}) {
    const meshes = worldMeshes(world, opts);
    const stats = glbStats(meshes);
    if (!meshes.length) {
        // An empty world is a REFUSAL rather than a zero-byte file: a .glb that downloads and opens to nothing
        // is indistinguishable from a broken exporter, and this way the reason is on screen.
        return { ok: false, error: "nothing to export -- no loaded chunk produced any geometry", stats };
    }
    const bytes = writeGlb(meshes, { generator: opts.generator || "SweK Engine world export" });
    return { ok: true, bytes, stats: { ...stats, byteLength: bytes.length, skippedEmptyChunks: meshes._skippedEmpty || 0 } };
}

// v4176 -- *** THE SCENE EXPORT, WHICH IS THE WORLD EXPORT PLUS THE TWO THINGS A VIEWER ON ANOTHER DEVICE
// *** CANNOT GUESS: WHERE YOU WERE STANDING, AND WHAT THE AIR LOOKED LIKE.
//
// exportWorldGlb above answers "give me this world as a model" -- geometry, origin, no viewpoint. That is the
// right answer for printing it or importing it into Blender, and the wrong one for opening it on a Shield TV,
// where the file arrives and the viewer has no idea which way to face in a world that may be a kilometre
// across. A model has no viewpoint; a SCENE does.
//
// The environment travels as a RECIPE rather than as baked geometry, and that split is deliberate: sun, fog
// and water level are shader uniforms in this engine, not triangles, so the honest thing is to send the same
// numbers the engine used and let the far end apply them. See tools/export/sceneGlb.mjs for why nothing tries
// to bake grass, water or particles into meshes.
import { writeSceneGlb, sceneStats, lookRotation } from "../tools/export/sceneGlb.mjs";

/**
 * @param opts.camera       { position:[x,y,z], forward?:[x,y,z], yfov?, znear?, zfar? } -- forward, not
 *                          yaw/pitch, because the caller already computes it for the view matrix and two
 *                          derivations of where the camera points is one too many.
 * @param opts.environment  { sunDir?, sunColor?, fogColor?, fogNear?, fogFar?, hour?, waterLevel?, weather? }
 * @param opts.props        [{ mesh:{name,positions,...}, placements:[{name?,translation?,rotation?,scale?}] }]
 *                          repeated geometry, written ONCE and referenced per placement
 */
export function exportSceneGlb(world, opts = {}) {
    const meshes = worldMeshes(world, opts);
    const nodes = meshes.map((m, i) => ({ name: m.name || ("chunk" + i), mesh: i }));

    // props are appended AFTER the chunk meshes, so the chunk indices above stay valid -- appending in the
    // other order would silently renumber every chunk node's mesh reference.
    for (const p of (opts.props || [])) {
        if (!p || !p.mesh || !p.mesh.positions) continue;
        meshes.push(p.mesh);
        const mi = meshes.length - 1;
        for (const pl of (p.placements || [{}])) nodes.push({ ...pl, mesh: mi, name: pl.name || (p.mesh.name || "prop") });
    }

    if (!meshes.length) {
        return { ok: false, error: "nothing to export -- no loaded chunk produced any geometry", stats: sceneStats({ meshes: [], nodes: [] }) };
    }

    const scene = { meshes, nodes, environment: opts.environment || null };
    if (opts.camera && Array.isArray(opts.camera.position)) {
        scene.camera = { position: opts.camera.position, yfov: opts.camera.yfov, znear: opts.camera.znear, zfar: opts.camera.zfar,
                         rotation: opts.camera.forward ? lookRotation(opts.camera.forward, opts.camera.up) : undefined };
    }
    const stats = sceneStats(scene);
    const bytes = writeSceneGlb(scene, { generator: opts.generator || "SweK Engine scene export" });
    return { ok: true, bytes, stats: { ...stats, byteLength: bytes.length,
             hasCamera: !!scene.camera, hasEnvironment: !!scene.environment } };
}
