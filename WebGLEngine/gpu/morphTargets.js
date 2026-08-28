// morphTargets.js — v1391
// CPU helpers for blendshape (morph-target) data parsed by GLBParser. Parsing
// lives in the loader; this module blends base positions/normals by weight and
// inspects what blendshapes a loaded mesh carries. The GPU/visual apply (drive
// a spawned entity's vertices from these weights) is the next step; for now this
// makes the data usable + lets you discover which targets a model ships.

// out = base + Σ weight_i * delta_i
//
// v4112 -- `vertexOffset` (in VERTICES, not floats) is where this primitive's vertices begin inside `base`.
// *** IT DEFAULTS TO 0, WHICH IS WHAT EVERY EXISTING CALLER ALREADY MEANT, so this stays backward compatible.
// It exists because a morph target belongs to ONE primitive and `base` is usually every primitive
// concatenated. *** RobotExpressive is the case that proves it: 3 targets over 302 head vertices against a
// 7214-vertex concatenated mesh. Adding delta[i] to base[i] would have deformed the first 302 vertices of the
// concatenation -- a different primitive entirely -- with no error and no crash, just the wrong part of the
// model moving. GLBParser reports the offset now; this is the half that uses it.
export function blendMorphPositions(base, targets, weights, vertexOffset = 0) {
    const out = new Float32Array(base.length);
    out.set(base);
    if (!targets || !weights) return out;
    const off = Math.max(0, (vertexOffset | 0)) * 3;
    for (let t = 0; t < targets.length; t++) {
        const w = weights[t] || 0;
        if (!w) continue;
        const tg = targets[t];
        if (!tg || !tg.positions) continue;
        const d = tg.positions;
        // Clamped to whichever runs out first, so a mismatched target can never write past the base array.
        const n = Math.min(d.length, out.length - off);
        for (let i = 0; i < n; i++) out[off + i] += w * d[i];
    }
    return out;
}

/**
 * v4112 -- does this mesh's morph data actually FIT the base it will be blended into?
 *
 * Returns { ok, why }. A consumer should refuse to apply when this says no, because the failure mode is
 * SILENT: blending a 302-vertex delta at a bad offset deforms real geometry and looks like a modelling bug
 * rather than an indexing one. Checked rather than assumed, because glbPostProcess.js WELDS duplicate
 * vertices on static meshes -- which renumbers everything and invalidates any offset taken before it.
 */
export function morphFits(mesh, baseFloats) {
    if (!mesh || !mesh.morphTargets || !mesh.morphTargets.length) return { ok: false, why: "no morph targets" };
    const off = Math.max(0, (mesh.morphVertexOffset | 0)) * 3;
    const vc = (mesh.morphVertexCount | 0) * 3;
    if (!(baseFloats > 0)) return { ok: false, why: "no base positions" };
    if (vc <= 0) return { ok: false, why: "morph vertex count is zero" };
    if (off + vc > baseFloats) {
        return { ok: false, why: "morph block (" + (off / 3) + "+" + (vc / 3) + " verts) runs past the base mesh (" +
                 (baseFloats / 3) + " verts) -- the offset is stale, most likely a weld renumbered the vertices" };
    }
    return { ok: true, why: "" };
}

export function blendMorphNormals(base, targets, weights) {
    if (!base) return null;
    const out = new Float32Array(base.length);
    out.set(base);
    if (!targets || !weights) return out;
    for (let t = 0; t < targets.length; t++) {
        const w = weights[t] || 0;
        if (!w) continue;
        const tg = targets[t];
        if (!tg || !tg.normals) continue;
        const d = tg.normals, n = Math.min(d.length, out.length);
        for (let i = 0; i < n; i++) out[i] += w * d[i];
    }
    return out;
}

export function listMorphTargets(mesh) {
    if (!mesh || !mesh.morphTargets || !mesh.morphTargets.length) return { ok: false, count: 0, names: [], vertexCount: 0 };
    return { ok: true, count: mesh.morphTargets.length, names: (mesh.morphTargetNames || []).slice(), vertexCount: mesh.morphVertexCount || 0 };
}

// Resolve a dense weights array from a { targetName: weight } map using the
// mesh's target names — so callers can say { eyeBlinkLeft: 1, jawOpen: 0.5 }.
export function weightsFromMap(mesh, map) {
    const names = (mesh && mesh.morphTargetNames) || [];
    const w = new Float32Array(names.length);
    if (map) for (let i = 0; i < names.length; i++) { const v = map[names[i]]; if (v != null) w[i] = +v || 0; }
    return w;
}

// v1394 — apply blended positions to the mesh's position VBO (the entity VAO binds
// mesh.vbo directly, so bufferSubData deforms what's drawn). base = mesh._rawPositions.
export function applyMorphToVBO(gl, mesh, weights) {
    if (!gl || !mesh || !mesh.vbo || !mesh.morphTargets) return false;
    const base = mesh._rawPositions || mesh.positions;
    if (!base) return false;
    const fit = morphFits(mesh, base.length);
    if (!fit.ok) { try { console.warn("[morphTargets] refusing to apply:", fit.why); } catch {} return false; }
    const blended = blendMorphPositions(base, mesh.morphTargets, weights, mesh.morphVertexOffset || 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, blended);
    return true;
}

// reset the VBO back to the un-morphed base positions.
export function resetMorphVBO(gl, mesh) {
    if (!gl || !mesh || !mesh.vbo) return false;
    const base = mesh._rawPositions || mesh.positions;
    if (!base) return false;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, base);
    return true;
}
