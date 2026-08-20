// morphTargets.js — v1391
// CPU helpers for blendshape (morph-target) data parsed by GLBParser. Parsing
// lives in the loader; this module blends base positions/normals by weight and
// inspects what blendshapes a loaded mesh carries. The GPU/visual apply (drive
// a spawned entity's vertices from these weights) is the next step; for now this
// makes the data usable + lets you discover which targets a model ships.

// out = base + Σ weight_i * delta_i
export function blendMorphPositions(base, targets, weights) {
    const out = new Float32Array(base.length);
    out.set(base);
    if (!targets || !weights) return out;
    for (let t = 0; t < targets.length; t++) {
        const w = weights[t] || 0;
        if (!w) continue;
        const tg = targets[t];
        if (!tg || !tg.positions) continue;
        const d = tg.positions, n = Math.min(d.length, out.length);
        for (let i = 0; i < n; i++) out[i] += w * d[i];
    }
    return out;
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
    const blended = blendMorphPositions(base, mesh.morphTargets, weights);
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
