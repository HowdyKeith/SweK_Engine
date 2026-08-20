// fx/avatar/skinsThree.js -- the skins, for the Three.js blob pages. The canvas renderers shade per triangle; Three
// wants attributes and a material. The temptation is to port the shading maths into GLSL, and that is exactly the
// mistake: you would then own two copies of every material and they would drift apart the first time one was tuned.
// So this computes each FACE's colour with the SAME shadeTri the canvas pages call, writes it to all three of that
// face's vertices (which is what makes the faces flat), and hands Three a plain vertexColors material. One source of
// truth: a skin cannot look different on the two renderers, because there is only one of it.
//
// Those pages already used vertexColors for their hand-rolled lava, so this slots into the mechanism they had.
"use strict";
import { shadeTri, SKINS } from "./skins.js";

// positions: non-indexed marched triangle soup (9 floats per face), as marchScalarField produces.
function computeSkinColors(positions, skin, opts = {}) {
    const out = new Float32Array(positions.length);
    const t = opts.t || 0, melt = opts.melt || 0, L = opts.light || [0.30, 0.85, 0.20];
    const c0 = opts.center || [0, 0, 0], R = opts.radius || 1;
    for (let f = 0; f + 8 < positions.length; f += 9) {
        const ax = positions[f], ay = positions[f + 1], az = positions[f + 2];
        const bx = positions[f + 3], by = positions[f + 4], bz = positions[f + 5];
        const cx = positions[f + 6], cy = positions[f + 7], cz = positions[f + 8];
        let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
        let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        const ml = Math.hypot(nx, ny, nz) || 1; nx /= ml; ny /= ml; nz /= ml;
        const lit = Math.max(0.12, nx * L[0] + ny * L[1] + nz * L[2]);
        const px = (ax + bx + cx) / 3, py = (ay + by + cy) / 3, pz = (az + bz + cz) / 3;
        const thickness = Math.max(0, Math.min(1, 1 - Math.hypot(px - c0[0], py - c0[1], pz - c0[2]) / R));
        const col = shadeTri(skin, { lit, normal: [nx, ny, nz], thickness, pos: [px, py, pz], t, melt });
        for (let k = 0; k < 3; k++) { out[f + k * 3] = col[0]; out[f + k * 3 + 1] = col[1]; out[f + k * 3 + 2] = col[2]; }   // one colour, three verts -> a flat face
    }
    return out;
}

// what the material should be for a skin (blending is named, so this file needs no Three import to be testable)
function skinMaterialSpec(skin) {
    const s = SKINS[skin];
    if (!s) return { vertexColors: true, flatShading: false, transparent: false, blending: "normal", opacity: 1, depthWrite: true };
    const additive = s.blend === "additive";
    return { vertexColors: true, flatShading: !!s.facet, transparent: additive, blending: additive ? "additive" : "normal", opacity: additive ? 0.55 : 1, depthWrite: !additive };
}
// apply that spec to a real Three material (the only part that touches Three)
function applySkinMaterial(THREE, material, skin) {
    const sp = skinMaterialSpec(skin);
    material.vertexColors = sp.vertexColors; material.flatShading = sp.flatShading; material.transparent = sp.transparent;
    material.opacity = sp.opacity; material.depthWrite = sp.depthWrite;
    material.blending = sp.blending === "additive" ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true; return material;
}
export { computeSkinColors, skinMaterialSpec, applySkinMaterial };
