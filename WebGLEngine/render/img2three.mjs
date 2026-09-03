"use strict";
/**
 * THE BRIDGE FROM A three.js OBJECT TREE TO ONE SweK MESH.
 *
 * WHAT THIS IS FOR. img2threejs (https://github.com/img2threejs/img2threejs, Apache-2.0) rebuilds an object from a
 * reference image as CODE -- a factory function that returns a THREE.Group of primitives, generated geometry and
 * procedural materials, with no mesh file anywhere. That output is a three.js OBJECT TREE, and this tree's renderer
 * is gfx/device.js, which draws vertex buffers. This module is the step between: it walks a tree of meshes with
 * their own transforms and materials and returns ONE mesh in the shape render/gpuDriven.mjs packMeshes eats, so a
 * generated model draws through the fleets' own shipped `lit` pipeline on BOTH backends rather than through three's
 * renderer on one.
 *
 * IT DOES NOT IMPORT three, AND THAT IS DELIBERATE. Everything here is read by duck-typing -- isMesh, geometry
 * .attributes.position.array, matrixWorld.elements, material.color.r -- so the bridge is exercisable on the CPU with
 * hand-built objects and no browser, and a three version bump cannot silently change what it reads. It also means
 * this module never becomes a second import path for the vendored three, which the two-copies rule forbids.
 *
 * *** WHAT IS CARRIED AND WHAT IS DROPPED, SAID HERE RATHER THAN DISCOVERED LATER. *** Carried: positions, normals,
 * per-vertex colour from each mesh's own material, indices, and every ancestor transform baked in (positions by the
 * full matrix, normals by the inverse-transpose of its upper 3x3, which is the only correct one under non-uniform
 * scale). DROPPED: roughness, metalness, clearcoat, transmission, maps, and every onBeforeCompile shader patch --
 * the whole PBR half. A generated model's material identity is most of what its own review gate scores, so a picture
 * drawn from this bridge is the model's FORM, not its finish, and a claim about it must say so. That half needs a
 * physical-material shell this tree does not have; it is named in docs/TSL-ROADMAP.md as what TSL offers and the
 * device pipelines do not.
 */

/** The upper 3x3 inverse-transpose of a column-major 4x4, for normals under non-uniform scale. Null when singular. */
export function normalMatrix(e) {
    const a = e[0], b = e[1], c = e[2], d = e[4], f = e[5], g = e[6], h = e[8], i = e[9], j = e[10];
    const det = a * (f * j - g * i) - d * (b * j - c * i) + h * (b * g - c * f);
    if (!det || !isFinite(det)) return null;
    const s = 1 / det;
    // inverse of the 3x3, then transposed -- written out so the transpose is visible rather than a second pass
    return [(f * j - g * i) * s, (h * g - d * j) * s, (d * i - h * f) * s,
            (i * c - b * j) * s, (a * j - h * c) * s, (h * b - a * i) * s,
            (b * g - f * c) * s, (d * c - a * g) * s, (a * f - d * b) * s];
}

/** Flat normals from positions and indices: one normal per face, written to each of its three vertices. */
function flatNormals(positions, indices) {
    const n = new Float32Array(positions.length);
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const i0 = indices[t] * 3, i1 = indices[t + 1] * 3, i2 = indices[t + 2] * 3;
        const ax = positions[i1] - positions[i0], ay = positions[i1 + 1] - positions[i0 + 1], az = positions[i1 + 2] - positions[i0 + 2];
        const bx = positions[i2] - positions[i0], by = positions[i2 + 1] - positions[i0 + 1], bz = positions[i2 + 2] - positions[i0 + 2];
        let x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
        const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
        for (const i of [i0, i1, i2]) { n[i] = x; n[i + 1] = y; n[i + 2] = z; }
    }
    return n;
}

/** The material's base colour as [r, g, b, a]. A material with no colour is white; an array material takes its first. */
export function baseColor(material, fallback = [1, 1, 1, 1]) {
    const m = Array.isArray(material) ? material[0] : material;
    if (!m || !m.color) return fallback.slice();
    const o = m.opacity;
    return [m.color.r, m.color.g, m.color.b, (m.transparent && typeof o === "number") ? o : 1];
}

/**
 * Walk a three.js object tree and return ONE mesh: { positions, normals, colors, indices } plus what was found.
 *
 * `root` may be any object with a `traverse`; a plain array of meshes works too. World matrices are read from
 * matrixWorld and are NOT recomputed here -- three's updateMatrixWorld is the caller's to call, and a caller that
 * forgets gets the identity, which is why `staleMatrices` is reported rather than silently corrected.
 */
export function flattenThreeTree(root, { includeInvisible = false, fallbackColor = [1, 1, 1, 1] } = {}) {
    const list = [];
    if (Array.isArray(root)) list.push(...root);
    else if (root && typeof root.traverse === "function") root.traverse((o) => list.push(o));
    else if (root) list.push(root);
    let nodes = 0, meshes = 0, skipped = 0, noNormals = 0, staleMatrices = 0;
    const parts = [], materials = {};
    for (const o of list) {
        nodes++;
        if (!o || !o.isMesh || !o.geometry) continue;
        if (!includeInvisible && o.visible === false) { skipped++; continue; }
        const attr = o.geometry.attributes || {};
        if (!attr.position) { skipped++; continue; }
        const src = attr.position.array, count = attr.position.count != null ? attr.position.count : src.length / 3;
        const e = (o.matrixWorld && o.matrixWorld.elements) || null;
        if (!e) staleMatrices++;
        const nm = e ? normalMatrix(e) : null;
        const positions = new Float32Array(count * 3);
        for (let v = 0; v < count; v++) {
            const x = src[v * 3], y = src[v * 3 + 1], z = src[v * 3 + 2];
            if (e) { const w = e[3] * x + e[7] * y + e[11] * z + e[15] || 1;
                positions[v * 3] = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
                positions[v * 3 + 1] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
                positions[v * 3 + 2] = (e[2] * x + e[6] * y + e[10] * z + e[14]) / w;
            } else { positions[v * 3] = x; positions[v * 3 + 1] = y; positions[v * 3 + 2] = z; }
        }
        const idxSrc = o.geometry.index && o.geometry.index.array;
        const indices = idxSrc ? Uint32Array.from(idxSrc) : Uint32Array.from({ length: count }, (_, i) => i);
        let normals;
        if (attr.normal) {
            const ns = attr.normal.array; normals = new Float32Array(count * 3);
            for (let v = 0; v < count; v++) {
                const x = ns[v * 3], y = ns[v * 3 + 1], z = ns[v * 3 + 2];
                let nx = x, ny = y, nz = z;
                if (nm) { nx = nm[0] * x + nm[3] * y + nm[6] * z; ny = nm[1] * x + nm[4] * y + nm[7] * z; nz = nm[2] * x + nm[5] * y + nm[8] * z; }
                const l = Math.hypot(nx, ny, nz) || 1;
                normals[v * 3] = nx / l; normals[v * 3 + 1] = ny / l; normals[v * 3 + 2] = nz / l;
            }
        } else { noNormals++; normals = flatNormals(positions, indices); }
        const col = baseColor(o.material, fallbackColor);
        const type = (Array.isArray(o.material) ? o.material[0] : o.material || {}).type || "none";
        materials[type] = (materials[type] || 0) + 1;
        parts.push({ positions, normals, indices, col });
        meshes++;
    }
    let nv = 0, ni = 0; for (const p of parts) { nv += p.positions.length / 3; ni += p.indices.length; }
    const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), colors = new Float32Array(nv * 4), indices = new Uint32Array(ni);
    let vo = 0, io = 0;
    const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const p of parts) {
        const c = p.positions.length / 3;
        positions.set(p.positions, vo * 3); normals.set(p.normals, vo * 3);
        for (let v = 0; v < c; v++) {
            colors.set(p.col, (vo + v) * 4);
            for (let k = 0; k < 3; k++) { const q = p.positions[v * 3 + k];
                if (q < bounds.min[k]) bounds.min[k] = q; if (q > bounds.max[k]) bounds.max[k] = q; }
        }
        for (let k = 0; k < p.indices.length; k++) indices[io + k] = p.indices[k] + vo;
        vo += c; io += p.indices.length;
    }
    if (!parts.length) { bounds.min = [0, 0, 0]; bounds.max = [0, 0, 0]; }
    const centre = [0, 1, 2].map((k) => (bounds.min[k] + bounds.max[k]) / 2);
    const radius = Math.max(1e-6, Math.hypot(...[0, 1, 2].map((k) => (bounds.max[k] - bounds.min[k]) / 2)));
    return { positions, normals, colors, indices, bounds, centre, radius,
             nodes, meshes, skipped, noNormals, staleMatrices, materials, triangles: indices.length / 3, vertices: nv };
}

/**
 * The instance record a flattened model needs to draw at the origin at unit size through the fleets' own pipelines:
 * gpuDriven's shaders place a hull at rec.xyz + p * rec.w, so the model is recentred and rescaled HERE rather than
 * by a matrix the shell does not have. Returns a new mesh; the input is not touched.
 *
 * v4366 -- `from` normalises this model AS ANOTHER WAS normalised, taking that one's centre and radius instead of
 * its own. Without it, comparing two variants of a model is comparing two framings as well: add one detached part
 * and the bounds grow, so every vertex of every other part moves and the difference being measured is drowned.
 */
export function unitMesh(flat, radius = 1, from = flat) {
    const s = radius / from.radius, positions = new Float32Array(flat.positions.length);
    for (let v = 0; v * 3 < positions.length; v++) for (let k = 0; k < 3; k++)
        positions[v * 3 + k] = (flat.positions[v * 3 + k] - from.centre[k]) * s;
    return { ...flat, positions, centre: [0, 0, 0], radius,
             bounds: { min: flat.bounds.min.map((q, k) => (q - from.centre[k]) * s), max: flat.bounds.max.map((q, k) => (q - from.centre[k]) * s) } };
}

// ---- v4373: THE LADDER ----------------------------------------------------------------------------------------
/**
 * A GENERATED MODEL'S LOD LADDER, GENERATED. A mesh file has one resolution and a coarser level must be DECIMATED
 * out of it -- an approximation of an approximation, and every simplifier's own error on top. A model that exists
 * as CODE has a property no download has: call its factory again with a smaller budget and the coarse level is
 * built by the same construction as the fine one. img2threejs's own mesh codec already carries this idea (a
 * Quality type with named levels and a ?quality= override); nothing consumed it.
 *
 * `make(budget)` returns a three.js object tree. Every rung is flattened and then framed by RUNG 0 -- not by its
 * own bounds -- because a coarser rung is a different solid and normalising each to itself would rescale them
 * apart, which is the mistake v4366 made and measured.
 *
 * The invariants are returned as numbers rather than asserted here, so a caller (and a gate) can say which one
 * failed and by how much. TRIANGLES must fall strictly: two budgets that build the same mesh are one rung wearing
 * two names. And a coarser rung must NOT GROW: an inscribed polygon has fewer segments and less extent, so a rung
 * that reaches outside rung 0's bounds is a factory whose budget does something other than coarsen.
 */
export function buildLadder(make, budgets, { radius = 1, tol = 1e-5 } = {}) {
    if (!Array.isArray(budgets) || budgets.length < 2) throw new Error("img2three: a ladder needs at least two budgets; one rung is a model, not a ladder");
    const flats = budgets.map((b) => { const root = make(b);
        if (root && typeof root.updateMatrixWorld === "function") root.updateMatrixWorld(true);
        return flattenThreeTree(root); });
    const base = flats[0];
    const rungs = flats.map((f, i) => ({ budget: budgets[i], mesh: unitMesh(f, radius, base), raw: f,
        triangles: f.triangles, vertices: f.vertices, meshes: f.meshes, materials: f.materials, bounds: f.bounds }));
    return { rungs, base, invariants: ladderInvariants(rungs, tol) };
}

/** The three facts a generated ladder must carry, each as a number and a verdict rather than a throw. */
export function ladderInvariants(rungs, tol = 1e-5) {
    const tris = rungs.map((r) => r.triangles);
    let decreasing = true; for (let i = 1; i < tris.length; i++) if (!(tris[i] < tris[i - 1])) decreasing = false;
    const b0 = rungs[0].bounds;
    let worstOutside = 0;
    for (const r of rungs) for (const k of [0, 1, 2]) {
        worstOutside = Math.max(worstOutside, b0.min[k] - r.bounds.min[k], r.bounds.max[k] - b0.max[k]);
    }
    const fams = rungs.map((r) => Object.keys(r.materials).sort().join(","));
    const sameMaterials = fams.every((f) => f === fams[0]);
    return { triangles: tris, decreasing, worstOutside, contained: worstOutside <= tol, sameMaterials, families: fams[0],
             ratio: tris.map((t) => t / tris[0]) };
}
