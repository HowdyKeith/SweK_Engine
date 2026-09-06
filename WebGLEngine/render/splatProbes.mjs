// WebGLEngine/render/splatProbes.mjs -- v4513
//
// AN IRRADIANCE PROBE VOLUME FOR A SPLAT SCENE, FROM THE TECHNIQUE ONLY (task 59). isaac-mason/three-spark-light-probes
// fits a box to the splat scene's occupancy, lays a dense probe grid through it at a fixed spacing, renders six cube
// faces per probe, folds each cube map into order-2 spherical harmonics (nine coefficients per colour channel) and
// packs the 27 numbers across seven RGBA sub-volumes of one 3D texture, sampled per fragment by world position. That
// repository carries NO licence file (package.json says "MIT", the tree has no LICENSE; both facts are in
// world/reachedLicences.mjs) so NOTHING of it was read into this file: the SH projection is the Ramamoorthi and
// Hanrahan closed form, the cube-face solid angle the standard one, and the packing layout is this file's own.
//
// The pieces, each held on its own by tools/ship/splatProbes-selfcheck.mjs:
//   shBasis(d)                nine real SH basis values for a unit direction, in the tree's order (splatParser: Y00 first,
//                             then Y1-1 Y10 Y11 as y z x, then the five order-2 terms).
//   projectCubeSH(faces, n)   six n x n RGB float faces -> nine [r,g,b] coefficients, each texel weighted by its solid
//                             angle. A constant radiance L projects to [L * sqrt(4 pi), 0...]; a single lit face to
//                             the closed-form integral of that face's cap against each basis function.
//   irradianceSH(coef)        the nine radiance coefficients convolved with the clamped cosine lobe (A0 pi, A1 2 pi / 3,
//                             A2 pi / 4), so evalSH(irradianceSH(c), n) is the irradiance E(n) / pi's normal form.
//   evalSH(coef, d)           the SH sum in a direction.
//   probeGrid(bounds, spacing) the grid: origin, counts, a probe centre per cell, each probe's world position.
//   bakeProbes(grid, radianceOf, n)   per probe, six faces from a radiance function (world position, direction) ->
//                             [r, g, b], projected to SH; the CPU cube-face source over a splat cloud is splatRadiance.
//   packProbes(grid) / unpackProbes(packed)   27 floats per probe into seven RGBA planes (7 x 4 = 28, the last slot
//                             spare) laid out as [plane][z][y][x][4]; round-trips exactly in Float32.
//   sampleProbes(grid, p)     trilinear interpolation of the eight surrounding probes' coefficients at a world point,
//                             clamped to the grid; at a probe's own position it returns that probe's coefficients.
//   splatRadiance(cloud, colours, background)   a nearest-hit ray-vs-sphere radiance over a splat cloud: the first
//                             splat a ray from the probe hits returns its colour, the sky the background.
//
// Conventions: cube faces in the order +x -x +y -y +z -z; a face texel's direction from the face's (u, v) in [-1, 1]
// through the standard cube-map frames; solid angle per texel from the exact spherical-quadrilateral formula so the six
// faces sum to 4 pi at any n. Coefficients are plain arrays of [r, g, b].
"use strict";

export const SQRT_4PI = Math.sqrt(4 * Math.PI);
export const PROBES = Object.freeze({ spacing: 0.5, faceSize: 16, background: [0.3, 0.4, 0.6] });
/** the clamped-cosine convolution factors for orders 0, 1, 2 (Ramamoorthi and Hanrahan 2001) */
export const COS_LOBE = Object.freeze([Math.PI, 2 * Math.PI / 3, Math.PI / 4]);
export const SH_C = Object.freeze({
    c0: 0.28209479177387814,                       // 1 / (2 sqrt(pi))
    c1: 0.4886025119029199,                        // sqrt(3 / (4 pi))
    c2: [1.0925484305920792, 1.0925484305920792, 0.31539156525252005, 1.0925484305920792, 0.5462742152960396],
});

/** nine real SH basis values at unit direction d = [x, y, z], in the tree's order */
export function shBasis(d) {
    const [x, y, z] = d, c = SH_C;
    return [c.c0, -c.c1 * y, c.c1 * z, -c.c1 * x,
            c.c2[0] * x * y, -c.c2[1] * y * z, c.c2[2] * (3 * z * z - 1), -c.c2[3] * x * z, c.c2[4] * (x * x - y * y)];
}

export function evalSH(coef, d) {
    const b = shBasis(d), out = [0, 0, 0];
    for (let i = 0; i < 9; i++) { out[0] += coef[i][0] * b[i]; out[1] += coef[i][1] * b[i]; out[2] += coef[i][2] * b[i]; }
    return out;
}

/** radiance coefficients -> irradiance coefficients (convolution with the clamped cosine; the pi is left in) */
export function irradianceSH(coef) {
    return coef.map((c, i) => { const a = COS_LOBE[i === 0 ? 0 : i < 4 ? 1 : 2]; return [c[0] * a, c[1] * a, c[2] * a]; });
}

/** the direction through face f at (u, v) in [-1, 1]; faces +x -x +y -y +z -z with the standard cube-map frames */
export function faceDirection(f, u, v) {
    let d;
    switch (f) {
        case 0: d = [1, -v, -u]; break;
        case 1: d = [-1, -v, u]; break;
        case 2: d = [u, 1, v]; break;
        case 3: d = [u, -1, -v]; break;
        case 4: d = [u, -v, 1]; break;
        default: d = [-u, -v, -1]; break;
    }
    const l = Math.hypot(d[0], d[1], d[2]);
    return [d[0] / l, d[1] / l, d[2] / l];
}

/** the solid angle of the texel whose face-plane square is [u0, u1] x [v0, v1]: the exact formula via the corner integral */
function areaElement(x, y) { return Math.atan2(x * y, Math.sqrt(x * x + y * y + 1)); }
export function texelSolidAngle(u0, u1, v0, v1) {
    return areaElement(u0, v0) - areaElement(u0, v1) - areaElement(u1, v0) + areaElement(u1, v1);
}

/** six n x n RGB faces (Float32Array of n*n*3 each, row v then column u) -> nine [r,g,b] SH coefficients */
export function projectCubeSH(faces, n) {
    const coef = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (let f = 0; f < 6; f++) {
        const face = faces[f];
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const u0 = (2 * i) / n - 1, u1 = (2 * (i + 1)) / n - 1, v0 = (2 * j) / n - 1, v1 = (2 * (j + 1)) / n - 1;
            const w = texelSolidAngle(u0, u1, v0, v1), b = shBasis(faceDirection(f, (u0 + u1) / 2, (v0 + v1) / 2)), k = (j * n + i) * 3;
            for (let s = 0; s < 9; s++) { coef[s][0] += face[k] * b[s] * w; coef[s][1] += face[k + 1] * b[s] * w; coef[s][2] += face[k + 2] * b[s] * w; }
        }
    }
    return coef;
}

/** render the six faces at a point from a radiance function (position, direction) -> [r, g, b] */
export function renderCubeFaces(pos, radianceOf, n) {
    const faces = [];
    for (let f = 0; f < 6; f++) {
        const face = new Float32Array(n * n * 3);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const c = radianceOf(pos, faceDirection(f, (2 * i + 1) / n - 1, (2 * j + 1) / n - 1)), k = (j * n + i) * 3;
            face[k] = c[0]; face[k + 1] = c[1]; face[k + 2] = c[2];
        }
        faces.push(face);
    }
    return faces;
}

/** the probe grid over a box: probes at the cell corners so the box's corners are probes, counts at least 2 per axis */
export function probeGrid(bounds, spacing = PROBES.spacing) {
    const min = bounds.min.slice(), max = bounds.max.slice(), counts = [0, 0, 0], step = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
        counts[a] = Math.max(2, Math.ceil((max[a] - min[a]) / spacing) + 1);
        step[a] = counts[a] > 1 ? (max[a] - min[a]) / (counts[a] - 1) : 0;
    }
    const total = counts[0] * counts[1] * counts[2], positions = new Float32Array(total * 3);
    for (let z = 0; z < counts[2]; z++) for (let y = 0; y < counts[1]; y++) for (let x = 0; x < counts[0]; x++) {
        const p = probeIndex(counts, x, y, z) * 3;
        positions[p] = min[0] + x * step[0]; positions[p + 1] = min[1] + y * step[1]; positions[p + 2] = min[2] + z * step[2];
    }
    return { min, max, counts, step, spacing, total, positions, coefficients: null };
}
export function probeIndex(counts, x, y, z) { return (z * counts[1] + y) * counts[0] + x; }

/** bake every probe: coefficients[i] is nine [r,g,b] */
export function bakeProbes(grid, radianceOf, faceSize = PROBES.faceSize) {
    grid.coefficients = new Array(grid.total);
    for (let i = 0; i < grid.total; i++) {
        const pos = [grid.positions[i * 3], grid.positions[i * 3 + 1], grid.positions[i * 3 + 2]];
        grid.coefficients[i] = projectCubeSH(renderCubeFaces(pos, radianceOf, faceSize), faceSize);
    }
    return grid;
}

/** the bounds of a splat cloud plus a margin */
export function cloudBounds(cloud, margin = 0) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < cloud.count; i++) for (let a = 0; a < 3; a++) { const v = cloud.positions[i * 3 + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    return { min: min.map((v) => v - margin), max: max.map((v) => v + margin) };
}

/** a nearest-hit radiance over a splat cloud: each splat a sphere of its largest scale; the first hit's colour, else the background */
export function splatRadiance(cloud, colours, background = PROBES.background) {
    const n = cloud.count, radii = new Float32Array(n);
    for (let i = 0; i < n; i++) radii[i] = Math.max(cloud.scales[i * 3], cloud.scales[i * 3 + 1], cloud.scales[i * 3 + 2]);
    return (pos, dir) => {
        let best = Infinity, hit = -1;
        for (let i = 0; i < n; i++) {
            const ox = cloud.positions[i * 3] - pos[0], oy = cloud.positions[i * 3 + 1] - pos[1], oz = cloud.positions[i * 3 + 2] - pos[2];
            const tca = ox * dir[0] + oy * dir[1] + oz * dir[2]; if (tca <= 0) continue;
            const d2 = ox * ox + oy * oy + oz * oz - tca * tca, r2 = radii[i] * radii[i]; if (d2 > r2) continue;
            const t = tca - Math.sqrt(r2 - d2); if (t > 0 && t < best) { best = t; hit = i; }
        }
        return hit < 0 ? background : [colours[hit * 3], colours[hit * 3 + 1], colours[hit * 3 + 2]];
    };
}

/** 27 floats per probe into seven RGBA planes: plane p holds floats 4p..4p+3 of the flattened nine [r,g,b]; slot 27 is spare (0) */
export const PLANES = 7;
export function packProbes(grid) {
    const [nx, ny, nz] = grid.counts, per = nx * ny * nz * 4, data = new Float32Array(PLANES * per);
    for (let i = 0; i < grid.total; i++) {
        const c = grid.coefficients[i];
        for (let s = 0; s < 27; s++) { const p = s >> 2, slot = s & 3; data[p * per + i * 4 + slot] = c[s / 3 | 0][s % 3]; }
    }
    return { counts: grid.counts.slice(), min: grid.min.slice(), max: grid.max.slice(), step: grid.step.slice(), planes: PLANES, data };
}
export function unpackProbes(packed) {
    const [nx, ny, nz] = packed.counts, total = nx * ny * nz, per = total * 4, coefficients = new Array(total);
    for (let i = 0; i < total; i++) {
        const c = Array.from({ length: 9 }, () => [0, 0, 0]);
        for (let s = 0; s < 27; s++) { const p = s >> 2, slot = s & 3; c[s / 3 | 0][s % 3] = packed.data[p * per + i * 4 + slot]; }
        coefficients[i] = c;
    }
    const grid = probeGrid({ min: packed.min, max: packed.max }, Infinity);
    grid.counts = packed.counts.slice(); grid.step = packed.step.slice(); grid.total = total; grid.coefficients = coefficients;
    return grid;
}

/** trilinear interpolation of the coefficients at a world point, clamped to the grid */
export function sampleProbes(grid, p) {
    const f = [0, 0, 0], i0 = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
        const t = grid.step[a] > 0 ? (p[a] - grid.min[a]) / grid.step[a] : 0, tc = Math.max(0, Math.min(grid.counts[a] - 1, t));
        i0[a] = Math.min(grid.counts[a] - 2, Math.floor(tc)); f[a] = tc - i0[a];
    }
    const out = Array.from({ length: 9 }, () => [0, 0, 0]);
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const w = (dx ? f[0] : 1 - f[0]) * (dy ? f[1] : 1 - f[1]) * (dz ? f[2] : 1 - f[2]); if (w === 0) continue;
        const c = grid.coefficients[probeIndex(grid.counts, i0[0] + dx, i0[1] + dy, i0[2] + dz)];
        for (let s = 0; s < 9; s++) { out[s][0] += c[s][0] * w; out[s][1] += c[s][1] * w; out[s][2] += c[s][2] * w; }
    }
    return out;
}

/** the irradiance-lit colour of a surface at world point p with normal n: albedo * E(n) / pi from the interpolated probe */
export function shadeAt(grid, p, n, albedo = [1, 1, 1]) {
    const e = evalSH(irradianceSH(sampleProbes(grid, p)), n);
    return [Math.max(0, albedo[0] * e[0] / Math.PI), Math.max(0, albedo[1] * e[1] / Math.PI), Math.max(0, albedo[2] * e[2] / Math.PI)];
}
