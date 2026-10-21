// world/oceanWater.mjs -- UNNUMBERED (the version is chosen at ship time).
//
// THE CHEAP DEFAULT WATER: THE SAME WAVES THE PHYSICS STANDS ON, AS A MESH. Slice 2 of the ocean-optin-surface item in tools/ship/todo.mjs.
//
// WHY IT EXISTS. Slice 1 (physics/ocean/oceanSurface.mjs) is the surface a boat, a buoyancy test or a submarine broaching reads. The vendored
// web-ocean sea is a different ocean entirely and costs 228 to 260 ms of GPU time on an Intel UHD 620. If the default water on screen were drawn
// from some other function, a hull would float at a height nobody could see, which is the defect this tree has met in every field where a picture
// and a number come from two places. So the default water is built FROM slice 1: a regular grid of particle LABELS, each carried to where the
// Gerstner map puts it at time t. A vertex is not an approximation of the physics surface, it is a point on it -- the same arithmetic (atLabel)
// that sample() ends with -- so what is drawn and what floats agree to rounding, and the gate proves it rather than saying so.
//
// WHAT IT PRODUCES. Plain typed arrays and nothing else (no three.js, no WebGL, no DOM), so a page, a test and a worker can all use them:
//   positions  Float32Array 3 per vertex, WORLD coordinates (the particle map displaces x and z as well as y)
//   normals    Float32Array 3 per vertex, unit, the surface's own
//   foam       Float32Array 1 per vertex in [0, 1], from the horizontal map's Jacobian: 0 where particles are spread, rising where they bunch at a crest
//   indices    Uint32Array, two triangles per cell, wound so a calm sea faces up
//   labels     Float32Array 2 per vertex, the particle label (X1, X2), so a vertex can be asked of the physics surface again
//
// WHAT IT IS NOT. Not a renderer, not a level-of-detail scheme beyond a stride (a coarse grid's labels are a subset of the fine grid's, which is what
// lets a page switch detail without the sea changing shape), and not the opt-in GPU sea: slice 4 is that, and says where it does not match.
"use strict";
import { createSurface, component } from "../physics/ocean/oceanSurface.mjs";

/** The foam rule: how much the horizontal map's Jacobian has fallen below 1, scaled so the default sea's sharpest crests approach 1. */
export const FOAM_SCALE = 1.6;
export const foamOf = (jacobian) => Math.min(1, Math.max(0, (1 - jacobian) * FOAM_SCALE));

/**
 * A (n+1) x (n+1) grid of labels spanning [cx - half, cx + half] x [cz - half, cz + half], carried to time t by `surface`.
 * `surface` is what physics/ocean/oceanSurface.mjs's createSurface returns.
 */
export function buildWater(surface, { cx = 0, cz = 0, half = 120, n = 64, t = 0 } = {}) {
    if (!(n >= 1) || !Number.isInteger(n)) throw new RangeError("oceanWater: n must be a positive integer");
    if (!(half > 0)) throw new RangeError("oceanWater: half must be positive");
    const side = n + 1, count = side * side;
    const positions = new Float32Array(count * 3), normals = new Float32Array(count * 3), foam = new Float32Array(count), labels = new Float32Array(count * 2);
    const step = (2 * half) / n;
    for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
            const X1 = cx - half + i * step, X2 = cz - half + j * step, v = j * side + i;
            const a = surface.atLabel(X1, X2, t);
            positions[v * 3] = a.x; positions[v * 3 + 1] = a.y; positions[v * 3 + 2] = a.z;
            normals[v * 3] = a.nx; normals[v * 3 + 1] = a.ny; normals[v * 3 + 2] = a.nz;
            foam[v] = foamOf(a.jacobian);
            labels[v * 2] = X1; labels[v * 2 + 1] = X2;
        }
    }
    const indices = new Uint32Array(n * n * 6);
    let k = 0;
    for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
            const a = j * side + i, b = a + 1, c = a + side, d = c + 1;
            // x grows with i, z with j; (a, c, b) has its geometric normal up for a flat sea
            indices[k++] = a; indices[k++] = c; indices[k++] = b;
            indices[k++] = b; indices[k++] = c; indices[k++] = d;
        }
    }
    return Object.freeze({ n, side, count, half, cx, cz, t, positions, normals, foam, labels, indices });
}

/**
 * Carry the SAME grid of labels to a new time, IN PLACE: positions, normals and foam are rewritten in the arrays `mesh` already holds (no allocation, so a page can call it every frame), and the
 * mesh's `t` is not changed (the object is frozen); the new time is returned. The result is exactly what buildWater(surface, same options, t) would have built -- the gate holds it to that bit for bit.
 */
export function refillWater(mesh, surface, t) {
    const { count, positions, normals, foam, labels } = mesh;
    for (let v = 0; v < count; v++) {
        const a = surface.atLabel(labels[v * 2], labels[v * 2 + 1], t);
        positions[v * 3] = a.x; positions[v * 3 + 1] = a.y; positions[v * 3 + 2] = a.z;
        normals[v * 3] = a.nx; normals[v * 3 + 1] = a.ny; normals[v * 3 + 2] = a.nz;
        foam[v] = foamOf(a.jacobian);
    }
    return t;
}

/** The vertex at grid cell (i, j) of a mesh, as plain numbers. */
export function vertexAt(mesh, i, j) {
    const v = j * mesh.side + i;
    return { x: mesh.positions[v * 3], y: mesh.positions[v * 3 + 1], z: mesh.positions[v * 3 + 2],
             nx: mesh.normals[v * 3], ny: mesh.normals[v * 3 + 1], nz: mesh.normals[v * 3 + 2], foam: mesh.foam[v] };
}

/**
 * A float on the sea: where a small buoy sits and how it leans, from the physics surface alone.
 * It rests on the surface at its (x, z) and takes the surface's normal, which is all a point buoy needs; a hull with volume is the submarine's business.
 */
export function buoy(surface, x, z, t = 0) {
    const s = surface.sample(x, z, t);
    return { x, y: s.h, z, nx: s.nx, ny: s.ny, nz: s.nz };
}

/** A hand-checkable fixture: a flat sea (no components) and one single wave, so every number printed is a closed form. */
export function reportLines() {
    const L = [];
    const flat = createSurface({ components: [] });
    const m0 = buildWater(flat, { half: 4, n: 4, t: 0 });
    L.push("[oceanWater] the default water, drawn from the same waves the physics stands on");
    L.push(`  a flat sea on a 4 x 4 grid: ${m0.count} vertices, ${m0.indices.length / 3} triangles, every y = ${m0.positions[1].toFixed(1)}, every normal y = ${m0.normals[1].toFixed(1)}, foam ${m0.foam[0].toFixed(1)}`);
    const one = createSurface({ components: [component({ wavelength: 2 * Math.PI, heading: 0, slope: 0.5, q: 0 })] });
    const m1 = buildWater(one, { half: Math.PI, n: 4, t: 0 });
    const v = vertexAt(m1, 3, 0);
    L.push(`  one wave (k = 1, A = 0.5, no steepness) on a grid over x = -pi..pi: the vertex at x = ${v.x.toFixed(6)} has y = ${v.y.toFixed(6)} = A sin(x), and foam ${v.foam.toFixed(1)}`);
    return L;
}
