// FILE: tools/export/sceneGlb.mjs -- v4176
//
// Export a whole SCENE as one .glb, so a device that cannot run the engine can still show what it made.
//
// *** THE POINT IS THE SHIELD TV, AND THE REASON IS NOT FILE SIZE. *** main.js is thirty thousand lines with
// hundreds of subsystems ticking every frame; an Android TV browser will not run that, and no amount of
// tuning will change it. But a baked scene is a few megabytes of triangles that the same browser draws at
// 60fps without effort. server.html has treated "phones / Shield / TV" as LAN clients since long before this
// -- there is a firewall button whose whole purpose is letting them reach the PC on 8787 -- so the transport
// was already built and only the payload was missing.
//
// ---- WHY GLB AND NOT three's Scene.toJSON() ------------------------------------------------------------
// toJSON writes geometry as JSON NUMBER ARRAYS, several times the size of the same floats in a binary chunk,
// and it encodes three's OWN schema -- so the Shield would be pinned to whatever three version wrote the
// file, and ObjectLoader is the only thing that could read it. GLB is a format every loader on that device
// already speaks. It also inherits gpu/glbLoad.js's Draco route for free, which v4175 measured at 3.55x on a
// real Khronos file.
//
// ---- WHAT THIS EXPORTS, AND WHAT IT HONESTLY CANNOT -----------------------------------------------------
// *** GEOMETRY IS BAKED. ATMOSPHERE IS DESCRIBED. *** The voxel world, entities and props are triangles and
// travel as triangles. Grass, water, particles, sky and the post chain are NOT geometry -- they are shaders
// running in raw WebGL against per-frame uniforms, with no scene graph to traverse -- so there is nothing to
// bake without re-rendering them into meshes, which would be expensive, lossy, and still wrong the moment
// anything moved. Pretending otherwise would produce a file that quietly lost half the picture.
//
// Instead the un-bakeable state is WRITTEN DOWN, in scene.extras: sun direction, fog colour and range, the
// hour of day, the water plane's height. A viewer on the other end reconstructs the look from the same
// numbers the engine used rather than receiving a flattened approximation of it. The export is the WORLD;
// the atmosphere is a recipe attached to it.
//
// ---- INSTANCING IS THE WHOLE REASON THIS IS NOT JUST writeGlb WITH MORE MESHES ---------------------------
// A scene has one tree mesh and four hundred trees. voxelGlb.writeGlb takes triangle soup and emits one node
// per mesh, so four hundred trees means four hundred copies of the same vertices. Here a NODE carries a
// transform and REFERENCES a mesh, which is what glTF nodes are for: four hundred trees is one mesh and four
// hundred small nodes. On a real scene that is the difference between a file the Shield loads and one it
// does not.
//
// The container itself comes from voxelGlb.packGlb -- extracted there at v4176 for this, because two writers
// spelling the same twelve-byte header and the same two alignment rules is how a file starts opening in one
// viewer and not another.
"use strict";

import { packGlb, vec3Bounds, pad4 } from "./voxelGlb.mjs";

const FLOAT = 5126, USHORT = 5123, UINT = 5125;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;
const TRIANGLES = 4;

/** Identity TRS, so a node with no placement still says so explicitly rather than by omission. */
const IDENTITY = Object.freeze({ translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });

/**
 * Environment that cannot be baked into triangles, recorded so the far end can rebuild it. Every field is
 * optional; whatever is present is written and whatever is absent is simply not claimed.
 */
function envExtras(env) {
    if (!env || typeof env !== "object") return null;
    const out = {};
    const num3 = (v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n)) ? v.slice() : null;
    if (num3(env.sunDir))    out.sunDir = num3(env.sunDir);
    if (num3(env.sunColor))  out.sunColor = num3(env.sunColor);
    if (num3(env.fogColor))  out.fogColor = num3(env.fogColor);
    if (Number.isFinite(env.fogNear))    out.fogNear = env.fogNear;
    if (Number.isFinite(env.fogFar))     out.fogFar = env.fogFar;
    if (Number.isFinite(env.hour))       out.hour = env.hour;
    if (Number.isFinite(env.waterLevel)) out.waterLevel = env.waterLevel;
    if (typeof env.weather === "string") out.weather = env.weather;
    if (typeof env.skyKind === "string") out.skyKind = env.skyKind;
    return Object.keys(out).length ? out : null;
}

/**
 * Write a scene.
 *
 * @param scene.meshes    [{ name, positions, normals?, colors?, uvs?, indices? }] -- the geometry, ONCE each
 * @param scene.nodes     [{ name, mesh: <index into meshes>, translation?, rotation? (quat xyzw), scale? }]
 *                        Omit entirely and every mesh gets one node at the origin, which is what a caller
 *                        exporting a static world wants.
 * @param scene.camera    { name?, position:[x,y,z], rotation?:[x,y,z,w], yfov?, znear?, zfar? }
 * @param scene.environment  see envExtras -- the part that cannot be baked
 * @param opts.generator
 * @returns Uint8Array
 */
export function writeSceneGlb(scene = {}, opts = {}) {
    const meshList = (scene.meshes || []).filter((m) => m && m.positions && m.positions.length >= 9);
    if (!meshList.length) throw new Error("writeSceneGlb: nothing to write (a scene needs at least one mesh with a triangle in it)");

    const views = [], accessors = [], gmeshes = [], nodes = [], chunks = [];
    let binLen = 0;

    const addView = (arr, target) => {
        const off = pad4(binLen);
        if (off > binLen) { chunks.push({ bytes: new Uint8Array(off - binLen), byteOffset: binLen }); binLen = off; }
        const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        chunks.push({ bytes, byteOffset: off });
        binLen = off + arr.byteLength;
        views.push({ buffer: 0, byteOffset: off, byteLength: arr.byteLength, target });
        return views.length - 1;
    };

    // ---- the meshes, each written ONCE ----
    for (const m of meshList) {
        const pos = m.positions instanceof Float32Array ? m.positions : new Float32Array(m.positions);
        const count = Math.floor(pos.length / 3);
        const b = vec3Bounds(pos);
        if (!b) throw new Error("writeSceneGlb: mesh '" + (m.name || "?") + "' has no finite positions");
        const attributes = {};
        // POSITION carries min/max because glTF 2.0 requires it there and nowhere else -- a file without them
        // loads as an unframeable or invisible model rather than as an error, which is the worst failure kind.
        accessors.push({ bufferView: addView(pos, ARRAY_BUFFER), componentType: FLOAT, count, type: "VEC3", min: b.min, max: b.max });
        attributes.POSITION = accessors.length - 1;

        // Attributes whose length does not match the vertex count are DROPPED, never truncated. A silently
        // shortened attribute is wrong everywhere and looks plausible; a missing one is plainly missing.
        const addAttr = (name, src, comps) => {
            if (!src || !src.length) return;
            const a = src instanceof Float32Array ? src : new Float32Array(src);
            if (Math.floor(a.length / comps) !== count) return;
            accessors.push({ bufferView: addView(a, ARRAY_BUFFER), componentType: FLOAT, count, type: comps === 3 ? "VEC3" : "VEC2" });
            attributes[name] = accessors.length - 1;
        };
        addAttr("NORMAL", m.normals, 3);
        addAttr("COLOR_0", m.colors, 3);
        addAttr("TEXCOORD_0", m.uvs, 2);

        const prim = { attributes, material: 0, mode: TRIANGLES };
        if (m.indices && m.indices.length) {
            // 16-bit where it fits, 32-bit where it does not. Writing UINT always would inflate every small
            // mesh; writing USHORT always would silently corrupt any mesh past 65535 vertices.
            const wide = count > 65535;
            const idx = wide ? (m.indices instanceof Uint32Array ? m.indices : new Uint32Array(m.indices))
                             : (m.indices instanceof Uint16Array ? m.indices : new Uint16Array(m.indices));
            accessors.push({ bufferView: addView(idx, ELEMENT_ARRAY_BUFFER), componentType: wide ? UINT : USHORT,
                             count: idx.length, type: "SCALAR" });
            prim.indices = accessors.length - 1;
        }
        gmeshes.push({ name: m.name || ("mesh" + gmeshes.length), primitives: [prim] });
    }

    // ---- the nodes, which are where instancing happens ----
    const placements = Array.isArray(scene.nodes) && scene.nodes.length
        ? scene.nodes
        : meshList.map((m, i) => ({ name: m.name || ("node" + i), mesh: i }));
    for (const p of placements) {
        const mi = p.mesh | 0;
        if (mi < 0 || mi >= gmeshes.length) throw new Error("writeSceneGlb: node '" + (p.name || "?") + "' references mesh " + p.mesh + ", which does not exist");
        const n = { mesh: mi, name: p.name || ("node" + nodes.length) };
        // Only non-identity components are written. A file full of identity TRS on every node is larger and
        // says nothing, and glTF's default when a field is absent is exactly identity.
        const t = p.translation, r = p.rotation, s = p.scale;
        if (t && (t[0] || t[1] || t[2])) n.translation = [t[0], t[1], t[2]];
        if (r && (r[0] !== IDENTITY.rotation[0] || r[1] !== IDENTITY.rotation[1] || r[2] !== IDENTITY.rotation[2] || r[3] !== IDENTITY.rotation[3])) n.rotation = [r[0], r[1], r[2], r[3]];
        if (s && (s[0] !== 1 || s[1] !== 1 || s[2] !== 1)) n.scale = [s[0], s[1], s[2]];
        nodes.push(n);
    }

    const gltf = {
        asset: { version: "2.0", generator: opts.generator || "SweK Engine sceneGlb" },
        scene: 0,
        scenes: [{ nodes: nodes.map((_, i) => i) }],
        nodes, meshes: gmeshes,
        materials: [{ name: "scene", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
        accessors, bufferViews: views,
        buffers: [{ byteLength: binLen }],
    };

    // ---- the camera, so the file opens where the person was standing ----
    if (scene.camera && Array.isArray(scene.camera.position)) {
        const c = scene.camera;
        gltf.cameras = [{ type: "perspective", name: c.name || "view",
                          perspective: { yfov: Number.isFinite(c.yfov) ? c.yfov : 0.96,
                                         znear: Number.isFinite(c.znear) ? c.znear : 0.1,
                                         ...(Number.isFinite(c.zfar) ? { zfar: c.zfar } : {}) } }];
        const cn = { camera: 0, name: c.name || "view", translation: [c.position[0], c.position[1], c.position[2]] };
        if (Array.isArray(c.rotation) && c.rotation.length === 4) cn.rotation = c.rotation.slice();
        nodes.push(cn);
        gltf.scenes[0].nodes.push(nodes.length - 1);
    }

    // ---- the recipe for what could not be baked ----
    const ex = envExtras(scene.environment);
    if (ex) gltf.scenes[0].extras = { swek: { version: 1, environment: ex } };

    return packGlb(gltf, chunks, binLen);
}

/**
 * What a scene would cost, for a caller that wants to warn before writing 200 MB down a LAN to a TV. Reports
 * the INSTANCED saving explicitly, because that is the number that decides whether the export is viable.
 */
export function sceneStats(scene = {}) {
    const meshes = (scene.meshes || []).filter((m) => m && m.positions);
    let verts = 0, tris = 0;
    for (const m of meshes) {
        const v = Math.floor(m.positions.length / 3);
        verts += v;
        tris += m.indices && m.indices.length ? Math.floor(m.indices.length / 3) : Math.floor(v / 3);
    }
    const placements = Array.isArray(scene.nodes) && scene.nodes.length ? scene.nodes.length : meshes.length;
    // what the same scene would have cost with one copy of the geometry per placement
    let flatVerts = 0, flatTris = 0;
    const counts = meshes.map((m) => Math.floor(m.positions.length / 3));
    for (const p of (Array.isArray(scene.nodes) && scene.nodes.length ? scene.nodes : meshes.map((_, i) => ({ mesh: i })))) {
        const v = counts[p.mesh | 0] || 0;
        flatVerts += v;
        const mm = meshes[p.mesh | 0];
        flatTris += mm && mm.indices && mm.indices.length ? Math.floor(mm.indices.length / 3) : Math.floor(v / 3);
    }
    return { meshes: meshes.length, nodes: placements, vertices: verts, triangles: tris,
             flatVertices: flatVerts, flatTriangles: flatTris,
             instancingSaves: flatVerts ? Math.round((1 - verts / flatVerts) * 1000) / 10 : 0 };
}

export const SCENE_EXTRAS_VERSION = 1;

/**
 * A look-direction as a glTF camera rotation quaternion (x, y, z, w).
 *
 * *** THIS IS ITS OWN GATED FUNCTION BECAUSE A WRONG AXIS CONVENTION IS THE SINGLE MOST COMMON WAY AN EXPORT
 * *** ARRIVES ON ITS SIDE AND NOBODY CAN SAY WHY -- voxelGlb.mjs's own header says exactly that about
 * positions, and orientation is worse, because it looks plausible from every angle except the right one.
 *
 * The convention, stated rather than assumed: A glTF CAMERA LOOKS DOWN ITS OWN -Z, with +Y up. So a camera
 * facing world -Z is the IDENTITY rotation, and this function's job is the rotation taking -Z onto the given
 * forward vector. SweK's camera carries yaw/pitch instead, so the caller passes the forward vector it already
 * computes for the view matrix rather than this file re-deriving angles -- ONE source for where it points.
 *
 * Returns identity for a degenerate or non-finite forward: a camera pointing nowhere should open facing the
 * default direction, not emit NaNs that make the whole file unloadable.
 */
export function lookRotation(forward, up = [0, 1, 0]) {
    const f = forward || [];
    let fx = +f[0], fy = +f[1], fz = +f[2];
    const len = Math.hypot(fx, fy, fz);
    if (!isFinite(len) || len < 1e-8) return [0, 0, 0, 1];
    fx /= len; fy /= len; fz /= len;

    // Camera basis: z is BACKWARD, the negation of forward, because -Z is the look direction.
    const zx = -fx, zy = -fy, zz = -fz;
    let ux = +up[0], uy = +up[1], uz = +up[2];
    // x = up cross z. Looking straight up or straight down collapses that cross product, so a fallback up is
    // substituted rather than emitting a NaN basis -- looking at the sky is not an error condition.
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-6) {
        ux = 0; uy = 0; uz = 1;
        xx = uy * zz - uz * zy; xy = uz * zx - ux * zz; xz = ux * zy - uy * zx;
        xl = Math.hypot(xx, xy, xz);
        if (xl < 1e-6) return [0, 0, 0, 1];
    }
    xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;

    // Rotation matrix to quaternion, branching on the largest diagonal term. The naive single-branch formula
    // divides by a value that goes to zero for a 180-degree turn, and that is not an exotic case here -- it
    // is the camera simply facing the other way.
    const m00 = xx, m01 = yx, m02 = zx;
    const m10 = xy, m11 = yy, m12 = zy;
    const m20 = xz, m21 = yz, m22 = zz;
    const tr = m00 + m11 + m22;
    let qx, qy, qz, qw;
    if (tr > 0) {
        const sc = Math.sqrt(tr + 1) * 2;
        qw = 0.25 * sc; qx = (m21 - m12) / sc; qy = (m02 - m20) / sc; qz = (m10 - m01) / sc;
    } else if (m00 > m11 && m00 > m22) {
        const sc = Math.sqrt(1 + m00 - m11 - m22) * 2;
        qw = (m21 - m12) / sc; qx = 0.25 * sc; qy = (m01 + m10) / sc; qz = (m02 + m20) / sc;
    } else if (m11 > m22) {
        const sc = Math.sqrt(1 + m11 - m00 - m22) * 2;
        qw = (m02 - m20) / sc; qx = (m01 + m10) / sc; qy = 0.25 * sc; qz = (m12 + m21) / sc;
    } else {
        const sc = Math.sqrt(1 + m22 - m00 - m11) * 2;
        qw = (m10 - m01) / sc; qx = (m02 + m20) / sc; qy = (m12 + m21) / sc; qz = 0.25 * sc;
    }
    const ql = Math.hypot(qx, qy, qz, qw) || 1;
    return [qx / ql, qy / ql, qz / ql, qw / ql];
}
