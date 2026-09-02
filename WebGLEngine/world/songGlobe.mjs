// WebGLEngine/world/songGlobe.mjs -- v4302
//
// A SONG HEIGHTFIELD WRAPPED ONTO A GLOBE. Keith: "could we wrap an audio file terrain into a globe?"
// world/songHeightfield.mjs (v4280) turns a clip into a square grid -- rows are time, columns are frequency,
// height is loudness, silence is water -- and v4298 stamped that grid flat into the voxel world. This file
// takes the SAME field, unchanged, and makes a sphere of it:
//
//   TIME goes round the globe: row r sits at longitude 2 pi r / grid, so the song's end meets its start at
//   the seam and a spinning globe plays the piece past you once per turn.
//   FREQUENCY goes pole to pole: column c sits at latitude -90 + 180 c / (grid - 1) degrees, bass at the
//   south pole and treble at the north. A pure tone is therefore a RING -- a ridge along one latitude, all
//   the way round -- and a rising sweep is a SPIRAL that climbs from the south pole to the north as it goes.
//   LOUDNESS is radius: R (1 + amp h) with h the field's height mapped to 0..1, so silence, the field's
//   floor, sits exactly at sea level R and everything else stands proud of it.
//
// *** THE POLES ARE CAPPED, NOT COLLAPSED. *** Mapping the first and last columns straight to the poles would
// put grid vertices at one point with grid different radii -- a torn sphere. So the columns span latitudes
// short of the poles by half a cell, and each pole is ONE vertex at that column's mean radius with a fan of
// triangles to it. The seam column is duplicated (grid + 1 longitudes) so the wrap is a closed surface with
// no shared vertex carrying two positions.
//
// Pure: arrays in, arrays out, no three.js. song-globe.html turns the arrays into a BufferGeometry; the gate
// checks them as arithmetic -- a constant field is a sphere of radius R to the vertex, a tone is a ring, a
// sweep is a spiral, and the seam closes.
"use strict";

export const DEFAULTS = Object.freeze({ radius: 1, amp: 0.25, seaColor: [0.10, 0.32, 0.62], lowColor: [0.16, 0.42, 0.20], highColor: [0.96, 0.94, 0.86] });

/** Longitude and latitude (radians) of field cell (row = time, col = frequency). */
export function lonLatOf(row, col, grid) {
    const lon = 2 * Math.PI * row / grid;
    const lat = -Math.PI / 2 + Math.PI * (col + 0.5) / grid;     // half a cell short of each pole
    return { lon, lat };
}

/** A unit vector for lon/lat: y is the pole axis, x toward lon 0, z toward lon +90. */
export function unitOf(lon, lat) {
    const cl = Math.cos(lat);
    return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)];
}

/** The field's water mask (1 = silence) rebuilt from its own water rectangles, so the two agree by construction. */
export function waterMaskOf(field) {
    const g = field.grid, mask = new Uint8Array(g * g);
    for (const a of (field.water && field.water.areas) || []) {
        // corners were emitted as [1 - y, x]; recover the cell range
        const xs = a.poly.map((p) => p[1]), ys = a.poly.map((p) => 1 - p[0]);
        const c0 = Math.round(Math.min(...xs) * g), c1 = Math.round(Math.max(...xs) * g);
        const r0 = Math.round(Math.min(...ys) * g), r1 = Math.round(Math.max(...ys) * g);
        for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (r >= 0 && r < g && c >= 0 && c < g) mask[r * g + c] = 1;
    }
    return mask;
}

/**
 * The globe: positions, normals, colors, indices for a field.
 * @param field a songHeightfield (or any repoHeightfield-contract field: heights, grid, min, max, water)
 */
export function globeFromField(field, opts = {}) {
    const o = { ...DEFAULTS, ...opts };
    const g = field.grid, R = o.radius, amp = o.amp;
    const span = field.max > field.min ? field.max - field.min : 1;
    const h01 = (i) => (field.heights[i] - field.min) / span;
    const water = waterMaskOf(field);
    const lonN = g + 1;                                        // seam duplicated
    const vertexCount = lonN * g + 2;
    const positions = new Float32Array(vertexCount * 3), colors = new Float32Array(vertexCount * 3);
    const radii = new Float32Array(vertexCount);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    let waterVertices = 0, rMin = Infinity, rMax = -Infinity;
    const at = (li, c) => li * g + c;                          // vertex index for longitude index li, column c
    for (let li = 0; li < lonN; li++) {
        const row = li % g;                                    // the seam column repeats row 0
        for (let c = 0; c < g; c++) {
            const i = row * g + c, v = at(li, c), { lon, lat } = lonLatOf(li, c, g);
            const isWater = water[i] === 1, h = isWater ? 0 : h01(i);
            const r = R * (1 + amp * h);
            const u = unitOf(lon, lat);
            positions[v * 3] = u[0] * r; positions[v * 3 + 1] = u[1] * r; positions[v * 3 + 2] = u[2] * r;
            radii[v] = r; if (r < rMin) rMin = r; if (r > rMax) rMax = r;
            const col = isWater ? o.seaColor : mix(o.lowColor, o.highColor, h);
            colors[v * 3] = col[0]; colors[v * 3 + 1] = col[1]; colors[v * 3 + 2] = col[2];
            if (isWater) waterVertices++;
        }
    }
    // pole caps at the mean radius of the nearest column
    const south = lonN * g, north = south + 1;
    const meanR = (c) => { let s = 0; for (let li = 0; li < g; li++) s += radii[at(li, c)]; return s / g; };
    const rs = meanR(0), rn = meanR(g - 1);
    positions.set([0, -rs, 0], south * 3); positions.set([0, rn, 0], north * 3);
    radii[south] = rs; radii[north] = rn;
    colors.set(mix(o.lowColor, o.highColor, (rs / R - 1) / amp), south * 3);
    colors.set(mix(o.lowColor, o.highColor, (rn / R - 1) / amp), north * 3);

    // triangles: quads between longitude li and li+1, columns c and c+1; fans to the poles
    const quadTris = 2 * g * (g - 1), fanTris = 2 * g, triangleCount = quadTris + fanTris;
    const indices = new Uint32Array(triangleCount * 3); let k = 0;
    for (let li = 0; li < g; li++) for (let c = 0; c < g - 1; c++) {
        const a = at(li, c), b = at(li + 1, c), d = at(li, c + 1), e = at(li + 1, c + 1);
        indices[k++] = a; indices[k++] = d; indices[k++] = b;
        indices[k++] = b; indices[k++] = d; indices[k++] = e;
    }
    for (let li = 0; li < g; li++) {
        indices[k++] = south; indices[k++] = at(li, 0); indices[k++] = at(li + 1, 0);
        indices[k++] = north; indices[k++] = at(li + 1, g - 1); indices[k++] = at(li, g - 1);
    }

    // smooth normals by accumulating face normals; the seam's two columns get the same normal by symmetry
    const normals = new Float32Array(vertexCount * 3);
    let area = 0;
    for (let t = 0; t < triangleCount; t++) {
        const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
        const ax = positions[a * 3], ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
        const ux = positions[b * 3] - ax, uy = positions[b * 3 + 1] - ay, uz = positions[b * 3 + 2] - az;
        const vx = positions[c * 3] - ax, vy = positions[c * 3 + 1] - ay, vz = positions[c * 3 + 2] - az;
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        area += 0.5 * Math.hypot(nx, ny, nz);
        for (const i of [a, b, c]) { normals[i * 3] += nx; normals[i * 3 + 1] += ny; normals[i * 3 + 2] += nz; }
    }
    for (let v = 0; v < vertexCount; v++) {
        const n = Math.hypot(normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]) || 1;
        normals[v * 3] /= n; normals[v * 3 + 1] /= n; normals[v * 3 + 2] /= n;
    }
    // orientation: the first triangle must face outward, or the whole surface is inside out
    const t0 = [indices[0], indices[1], indices[2]];
    const cx = (positions[t0[0] * 3] + positions[t0[1] * 3] + positions[t0[2] * 3]) / 3,
          cy = (positions[t0[0] * 3 + 1] + positions[t0[1] * 3 + 1] + positions[t0[2] * 3 + 1]) / 3,
          cz = (positions[t0[0] * 3 + 2] + positions[t0[1] * 3 + 2] + positions[t0[2] * 3 + 2]) / 3;
    const outward = cx * normals[t0[0] * 3] + cy * normals[t0[0] * 3 + 1] + cz * normals[t0[0] * 3 + 2] > 0;

    return {
        positions, normals, colors, indices, radii,
        vertexCount, triangleCount, radiusMin: rMin, radiusMax: rMax, waterVertices, area, outward,
        grid: g, radius: R, amp,
        mapping: "row = time = longitude (2 pi r / grid); col = frequency = latitude (-90 .. +90, half a cell short); radius = R (1 + amp h01); silence at R",
        /** the vertex index of field cell (row, col) on the first pass round (the seam copy is li = grid) */
        vertexOf: (row, col) => at(row, col),
        /** the ridge column at a longitude: the column with the largest radius on that meridian */
        ridgeColumnAt: (li) => { let best = 0; for (let c = 1; c < g; c++) if (radii[at(li, c)] > radii[at(li, best)]) best = c; return best; },
    };
}

/** Which column a frequency lands in, for a field whose stats carry hzPerBin and binCount. */
export function columnOfHz(field, hz) {
    const st = field.stats, bin = hz / st.hzPerBin;
    return Math.min(field.grid - 1, Math.floor(bin * field.grid / st.binCount));
}
