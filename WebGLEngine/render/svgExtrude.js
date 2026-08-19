// WebGLEngine/render/svgExtrude.js — v3831 (SVG -> 3D "forge", after CatsJuice/medal-forge)
//
// The Three.js half: normalized SVG shapes (from svgExtrudeCore, gated) become THREE.Shape with holes, extruded
// with a bevel and a thickness into a medal/badge/insignia. Faces +Z (medal orientation). Pure geometry -- no
// custom shaders -- so the only thing that can be wrong is the outline, which the core already pins.

import * as THREE from "/vendor/three/three.module.js";
import { svgToShapes, signedArea } from "/render/svgExtrudeCore.js";

function ring(pts, wantCCW) {
    // THREE wants outer CCW, holes CW; enforce so the triangulation is robust.
    const ccw = signedArea(pts) > 0;
    const p = ccw === wantCCW ? pts : pts.slice().reverse();
    return p;
}

// forgeFromSvg(svgString, opts) -> THREE.Group (empty group if the SVG has no paths). opts:
//   size, thickness, bevel(0..1 of thickness), bevelSize, color, metalness, roughness.
export function forgeFromSvg(svg, opts = {}) {
    const g = new THREE.Group();
    const shapes = svgToShapes(svg, { size: opts.size || 2, curveSteps: opts.curveSteps || 18 });
    if (!shapes) return g;
    const thickness = opts.thickness != null ? opts.thickness : 0.35;
    const bevelT = (opts.bevel != null ? opts.bevel : 0.35) * thickness;
    const bevelS = opts.bevelSize != null ? opts.bevelSize : (opts.size || 2) * 0.02;
    const mat = new THREE.MeshStandardMaterial({
        color: opts.color != null ? opts.color : 0xd9b45a,
        metalness: opts.metalness != null ? opts.metalness : 0.85,
        roughness: opts.roughness != null ? opts.roughness : 0.35,
    });
    for (const s of shapes) {
        const outer = ring(s.outer, true);
        const shape = new THREE.Shape();
        outer.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
        shape.closePath();
        for (const h of s.holes) {
            const hole = ring(h, false), path = new THREE.Path();
            hole.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
            path.closePath(); shape.holes.push(path);
        }
        const geo = new THREE.ExtrudeGeometry(shape, {
            depth: thickness, bevelEnabled: bevelT > 0, bevelThickness: bevelT, bevelSize: bevelS, bevelSegments: 2, steps: 1, curveSegments: 12,
        });
        geo.center(); geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, mat));
    }
    return g;
}
