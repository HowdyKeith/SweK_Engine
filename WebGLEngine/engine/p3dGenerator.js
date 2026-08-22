// FILE: engine/p3dGenerator.js
// VERSION: v1 — round 347
//
// Synthetic .p3d mesh generators — simulate what the Pixal3D Python
// pipeline would emit so the viewer demo runs without a real Trellis-2
// or Pixal3D backend. The doc's Python uses trimesh.creation.icosphere
// for its placeholder; we replicate the same shapes in JS.

const PHI = (1 + Math.sqrt(5)) / 2;   // golden ratio for icosahedron

/**
 * Generate a UV sphere with subdivision controls.
 * Vertex count ~= (longitudeSteps + 1) * (latitudeSteps + 1) — easy to keep
 * under the uint16 cap.
 */
export function generateSphere({ radius = 1, longitudeSteps = 24, latitudeSteps = 16 } = {}) {
    const vertices = [];
    const indices  = [];
    for (let lat = 0; lat <= latitudeSteps; lat++) {
        const theta = lat * Math.PI / latitudeSteps;
        const sinT = Math.sin(theta), cosT = Math.cos(theta);
        for (let lon = 0; lon <= longitudeSteps; lon++) {
            const phi = lon * 2 * Math.PI / longitudeSteps;
            vertices.push(radius * sinT * Math.cos(phi), radius * cosT, radius * sinT * Math.sin(phi));
        }
    }
    const rowSize = longitudeSteps + 1;
    for (let lat = 0; lat < latitudeSteps; lat++) {
        for (let lon = 0; lon < longitudeSteps; lon++) {
            const a = lat * rowSize + lon;
            const b = a + rowSize;
            indices.push(a, b, a + 1,  b, b + 1, a + 1);
        }
    }
    return {
        vertices: new Float32Array(vertices),
        indices:  new Uint16Array(indices),
    };
}

/** Generate a torus (donut). */
export function generateTorus({ majorRadius = 1, minorRadius = 0.35, majorSegments = 32, minorSegments = 16 } = {}) {
    const vertices = [];
    const indices  = [];
    for (let i = 0; i <= majorSegments; i++) {
        const u = i / majorSegments * 2 * Math.PI;
        const cu = Math.cos(u), su = Math.sin(u);
        for (let j = 0; j <= minorSegments; j++) {
            const v = j / minorSegments * 2 * Math.PI;
            const cv = Math.cos(v), sv = Math.sin(v);
            const x = (majorRadius + minorRadius * cv) * cu;
            const y = minorRadius * sv;
            const z = (majorRadius + minorRadius * cv) * su;
            vertices.push(x, y, z);
        }
    }
    const rowSize = minorSegments + 1;
    for (let i = 0; i < majorSegments; i++) {
        for (let j = 0; j < minorSegments; j++) {
            const a = i * rowSize + j;
            const b = a + rowSize;
            indices.push(a, b, a + 1,  b, b + 1, a + 1);
        }
    }
    return {
        vertices: new Float32Array(vertices),
        indices:  new Uint16Array(indices),
    };
}

/**
 * Icosphere — geodesic sphere from subdivided icosahedron. Same algorithm
 * trimesh.creation.icosphere() uses, which is what the Pixal3D pipeline
 * emits as its placeholder mesh in stage 3.
 */
export function generateIcosphere({ subdivisions = 2, radius = 1 } = {}) {
    // Start with 12 verts of unit icosahedron
    const t = PHI;
    const verts = [
        [-1, t, 0], [ 1, t, 0], [-1,-t, 0], [ 1,-t, 0],
        [ 0,-1, t], [ 0, 1, t], [ 0,-1,-t], [ 0, 1,-t],
        [ t, 0,-1], [ t, 0, 1], [-t, 0,-1], [-t, 0, 1],
    ].map(v => {
        const L = Math.hypot(v[0], v[1], v[2]);
        return [v[0]/L * radius, v[1]/L * radius, v[2]/L * radius];
    });
    let faces = [
        [0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],
        [1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
        [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],
        [4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1],
    ];

    // Subdivide
    const midCache = new Map();
    const midpoint = (a, b) => {
        const key = a < b ? a + "," + b : b + "," + a;
        if (midCache.has(key)) return midCache.get(key);
        const va = verts[a], vb = verts[b];
        const mx = (va[0] + vb[0]) / 2, my = (va[1] + vb[1]) / 2, mz = (va[2] + vb[2]) / 2;
        const L = Math.hypot(mx, my, mz);
        const idx = verts.length;
        verts.push([mx/L * radius, my/L * radius, mz/L * radius]);
        midCache.set(key, idx);
        return idx;
    };
    for (let s = 0; s < subdivisions; s++) {
        const newFaces = [];
        for (const [a, b, c] of faces) {
            const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
            newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
        }
        faces = newFaces;
        midCache.clear();
    }

    const vertices = new Float32Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) {
        vertices[i*3]   = verts[i][0];
        vertices[i*3+1] = verts[i][1];
        vertices[i*3+2] = verts[i][2];
    }
    const indices = new Uint16Array(faces.length * 3);
    for (let i = 0; i < faces.length; i++) {
        indices[i*3]   = faces[i][0];
        indices[i*3+1] = faces[i][1];
        indices[i*3+2] = faces[i][2];
    }
    return { vertices, indices };
}

/** A simple twisted ribbon — visually distinguishable from sphere/torus. */
export function generateTwistedRibbon({ length = 4, width = 0.5, segments = 40, twists = 2 } = {}) {
    const vertices = [];
    const indices  = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const z = (t - 0.5) * length;
        const ang = t * twists * Math.PI * 2;
        const cx = Math.cos(ang) * width;
        const cy = Math.sin(ang) * width;
        vertices.push(-cx, -cy, z);
        vertices.push( cx,  cy, z);
    }
    for (let i = 0; i < segments; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2,   a + 1, a + 3, a + 2);
    }
    return {
        vertices: new Float32Array(vertices),
        indices:  new Uint16Array(indices),
    };
}

export const P3D_GENERATORS = {
    sphere:    generateSphere,
    torus:     generateTorus,
    icosphere: generateIcosphere,
    ribbon:    generateTwistedRibbon,
};
