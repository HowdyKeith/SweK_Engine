// WebGLEngine/world/splatVoxelWorld.mjs -- the splat-collision round (Round B of the gpu_4 list)
//
// *** A SPLAT SCENE AS A VOXEL WORLD THE PLAYER CAN STAND IN, WITH ITS HOLES COUNTED RATHER THAN FALLEN THROUGH. ***
// world/splatWalkWorld.mjs (v4630) walks a splat cloud as a MESH: density raster, surface nets, a BVH, the capsule.
// What did not exist is the voxel route -- a `voxelAt` world, which is what camera.js's voxel branch walks and what
// the kinematic-wiring round made never-inside (playerBody-selfcheck section 7). This builds one, and says where it
// is wrong instead of letting a body drop out of the world in silence.
//
// ---- THE QUESTION THE NAIVE RULE GETS WRONG, MEASURED ----------------------------------------------------------
//
// A splat is a SURFACE sample, and in a voxel world every surface lies ON A CELL BOUNDARY. A floor whose top is the
// plane y = 1 is captured as splats with centres at y = 1 +- noise, and "the cell containing the centre" is cell 1
// as often as cell 0 -- so the body stands one voxel too high. Measured on this file's own fixture (a 24 x 8 x 24
// level: floor, block, stairs, pillar, wall, a table on legs), 576 columns, every exposed face captured:
//
//     the cell containing each centre        566 columns at the wrong height
//     every cell a splat's footprint touches 576 columns at the wrong height
//     a fine shell, scanned for parity       0 columns at the wrong height, 0 fall-through
//
// *** A SURFACE HAS NO THICKNESS, SO SOLIDITY IS A QUESTION OF WHICH SIDE, AND GRAVITY ANSWERS IT. *** The splats are
// stamped into a grid SUB times finer than the walker's (each splat's ellipsoid, at SIGMA times its scales, widened
// by half a fine cell so a splat thinner than a cell still lands in one); every fine column is then scanned from the
// top down, and each RUN of shell cells is one crossing: above the first is air, below it is solid, below the next
// is air again. A walker cell is solid when at least half its SUB^3 fine cells are. The scan direction is the
// assumption, said plainly: +y is up, as in this engine; a capture in another convention is transformed first.
//
// ---- WHAT A CAPTURE GETS WRONG, AND WHAT THIS DOES ABOUT EACH ---------------------------------------------------
//
//   HOLES        a patch of floor the capture never saw has no crossing, so its column is air all the way down. It
//                stays LOCAL -- the scan is per column, so one hole cannot drain the floor around it the way a 3D
//                flood fill would. Every empty column that is enclosed by non-empty ones (2D hole filling: not
//                connected through empty columns to the edge of the scene), or that a used splat sits over, is
//                LISTED in `holes`, and `fillHoles: true` closes each at the height its rim agrees on. A 1.5-unit
//                floor hole: 7 columns, all listed, and filled back to the floor's own height.
//   FLOATERS     translucent ones fall under `minOpacity` (0.2, splatMesh's DEFAULT_RASTER). OPAQUE ones would flip
//                the parity of every cell under them -- a phantom pillar -- so shell components smaller than
//                `minComponent` fine cells are dropped before the scan. Measured: 30 opaque floaters move 2
//                columns' stand height without it and 0 with it.
//   SPARSENESS   the stamp is closed only where the splats overlap. At 1 sigma, 6 splats a unit face is closed and
//                4 is not (26 hole columns, listed); 1.5 sigma closes 4 a face and costs 4 columns of height. So
//                SIGMA is the capture's to choose, and the hole list is what says it was chosen too low.
//   UNSEEN UNDERSIDES  NOT FIXED. A table whose underside no camera saw is entered at its top and "left" at the floor
//                under it, so the space beneath reads solid (measured: the fixture's table fills 40 cells it should
//                not). A splat's normal is known only up to sign, so the scan cannot tell this from a solid block.
//
// NOT DONE HERE: a real .ply. The fixture is a synthetic level sampled from a known solid so that every number above
// has a truth to be wrong against; what a real capture's noise does to them is the next measurement, on a file. Nor
// the boxCover hand-off to box3d (physics/voxelBoxCover.js takes a `solid(x, y, z)` and dims, which `toBoxCoverInput`
// hands it) -- that is a dynamic-bodies question with its own gate.
"use strict";

export const SUB = 4;
export const SIGMA = 1;
export const MIN_OPACITY = 0.2;
export const MIN_COMPONENT = 64;

/**
 * Any of the shapes this tree holds a splat cloud in, as one: positions and scales (world units, xyz triples), opacity
 * 0..1, and rotations as normalised (w, x, y, z) quaternions or null for axis-aligned.
 *   physics/splat/splatMesh.mjs's clouds   { positions, scales, opacities, count }
 *   gpu/SplatLoader.js's parsed scenes     { positions, scales, colors (alpha = opacity * 255), rotations, count }
 *     -- rotations a Float32Array (.ply) or a Uint8Array packed (v - 128) / 128 (.splat), as render/SplatRenderer reads
 */
export function normalizeCloud(src) {
    const n = src.count;
    let opacities = src.opacities;
    if (!opacities) {
        if (!src.colors) throw new Error("splatVoxelWorld: a cloud needs opacities, or colors with an alpha channel");
        opacities = new Float32Array(n);
        for (let i = 0; i < n; i++) opacities[i] = src.colors[i * 4 + 3] / 255;
    }
    let rotations = null;
    if (src.rotations) {
        rotations = new Float32Array(n * 4);
        const packed = src.rotations instanceof Uint8Array;
        for (let i = 0; i < n; i++) {
            let w = src.rotations[i * 4], x = src.rotations[i * 4 + 1], y = src.rotations[i * 4 + 2], z = src.rotations[i * 4 + 3];
            if (packed) { w = (w - 128) / 128; x = (x - 128) / 128; y = (y - 128) / 128; z = (z - 128) / 128; }
            const l = Math.hypot(w, x, y, z) || 1;
            rotations[i * 4] = w / l; rotations[i * 4 + 1] = x / l; rotations[i * 4 + 2] = y / l; rotations[i * 4 + 3] = z / l;
        }
    }
    return { positions: src.positions, scales: src.scales, opacities, rotations, count: n };
}

/** The columns of a 3x3 rotation from a unit (w, x, y, z) quaternion: the splat's local axes in world space. */
function axes(q, i) {
    const w = q[i * 4], x = q[i * 4 + 1], y = q[i * 4 + 2], z = q[i * 4 + 3];
    return [
        [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)],
        [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)],
        [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)],
    ];
}

/**
 * Build the voxel world. Returns { voxelAt, chunkHeight, origin, dims, holes, stats, solidAt } -- `voxelAt` and
 * `chunkHeight` are the interface camera.js's voxel branch walks (`voxelAt` is 1 for solid, 0 for air).
 */
export function voxelizeSplats(input, opts = {}) {
    const { sub = SUB, sigma = SIGMA, minOpacity = MIN_OPACITY, maxSplatScale = 0, minComponent = MIN_COMPONENT,
            fillHoles = false } = opts;
    const cloud = normalizeCloud(input), f = 1 / sub;

    // which splats count, and the scene's bounds in walker cells
    const use = new Uint8Array(cloud.count);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let used = 0, faint = 0, huge = 0;
    for (let i = 0; i < cloud.count; i++) {
        const s = Math.max(cloud.scales[i * 3], cloud.scales[i * 3 + 1], cloud.scales[i * 3 + 2]);
        if (cloud.opacities[i] < minOpacity) { faint++; continue; }
        if (maxSplatScale > 0 && s > maxSplatScale) { huge++; continue; }
        use[i] = 1; used++;
        for (let a = 0; a < 3; a++) { const p = cloud.positions[i * 3 + a]; lo[a] = Math.min(lo[a], p - sigma * s); hi[a] = Math.max(hi[a], p + sigma * s); }
    }
    if (!used) throw new Error("splatVoxelWorld: no splat passed the opacity and scale filters");
    const origin = lo.map((v) => Math.floor(v) - 1), dims = hi.map((v, a) => Math.ceil(v) + 1 - origin[a]);
    const fx = dims[0] * sub, fy = dims[1] * sub, fz = dims[2] * sub;
    const I = (x, y, z) => x + fx * (y + fy * z);
    const shell = new Uint8Array(fx * fy * fz);

    // 1. stamp: each splat's ellipsoid at sigma, every local radius widened by half a fine cell
    for (let i = 0; i < cloud.count; i++) {
        if (!use[i]) continue;
        const p = [cloud.positions[i * 3] - origin[0], cloud.positions[i * 3 + 1] - origin[1], cloud.positions[i * 3 + 2] - origin[2]];
        const r = [0, 1, 2].map((a) => sigma * cloud.scales[i * 3 + a] + f / 2);
        const R = cloud.rotations ? axes(cloud.rotations, i) : null;
        const ext = R ? [0, 1, 2].map((a) => Math.abs(R[0][a]) * r[0] + Math.abs(R[1][a]) * r[1] + Math.abs(R[2][a]) * r[2]) : r;
        const c = p.map((v) => Math.floor(v / f));
        const b0 = p.map((v, a) => Math.max(0, Math.floor((v - ext[a]) / f))), b1 = p.map((v, a) => Math.min([fx, fy, fz][a] - 1, Math.floor((v + ext[a]) / f)));
        for (let z = b0[2]; z <= b1[2]; z++) for (let y = b0[1]; y <= b1[1]; y++) for (let x = b0[0]; x <= b1[0]; x++) {
            const q = [(x + 0.5) * f - p[0], (y + 0.5) * f - p[1], (z + 0.5) * f - p[2]];
            let d = 0;
            for (let a = 0; a < 3; a++) { const o = R ? R[a][0] * q[0] + R[a][1] * q[1] + R[a][2] * q[2] : q[a]; d += (o / r[a]) ** 2; }
            if (d <= 1 || (x === c[0] && y === c[1] && z === c[2])) shell[I(x, y, z)] = 1;
        }
    }

    // 2. floaters: shell components (26-connected) smaller than minComponent fine cells are not surfaces
    let componentsDropped = 0, cellsDropped = 0;
    if (minComponent > 0) {
        const seen = new Uint8Array(shell.length), stack = [], comp = [];
        for (let i0 = 0; i0 < shell.length; i0++) {
            if (!shell[i0] || seen[i0]) continue;
            comp.length = 0; stack.push(i0); seen[i0] = 1;
            while (stack.length) {
                const i = stack.pop(); comp.push(i);
                const x = i % fx, y = ((i / fx) | 0) % fy, z = (i / (fx * fy)) | 0;
                for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                    const X = x + dx, Y = y + dy, Z = z + dz;
                    if (X < 0 || Y < 0 || Z < 0 || X >= fx || Y >= fy || Z >= fz) continue;
                    const j = I(X, Y, Z); if (shell[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
                }
            }
            if (comp.length < minComponent) { componentsDropped++; cellsDropped += comp.length; for (const i of comp) shell[i] = 0; }
        }
    }

    // 3. the scan: a run of shell is ONE crossing, flipped as the scan leaves it going down
    const fine = new Uint8Array(shell.length);
    for (let z = 0; z < fz; z++) for (let x = 0; x < fx; x++) {
        let inside = false;
        for (let y = fy - 1; y >= 0; y--) {
            const i = I(x, y, z);
            if (shell[i]) { fine[i] = 1; if (y === 0 || !shell[I(x, y - 1, z)]) inside = !inside; continue; }
            if (inside) fine[i] = 1;
        }
    }

    // 4. a walker cell is solid when at least half of its fine cells are
    const [sx, sy, sz] = dims, half = (sub * sub * sub) / 2;
    const occ = new Uint8Array(sx * sy * sz), C = (x, y, z) => x + sx * (y + sy * z);
    for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
        let n = 0;
        for (let k = 0; k < sub; k++) for (let j = 0; j < sub; j++) for (let i = 0; i < sub; i++) n += fine[I(x * sub + i, y * sub + j, z * sub + k)];
        if (n >= half) occ[C(x, y, z)] = 1;
    }

    // 5. holes: empty columns enclosed by non-empty ones -- not connected through empty columns to the scene's edge
    const top = (x, z) => { for (let y = sy - 1; y >= 0; y--) if (occ[C(x, y, z)]) return y + 1; return null; };
    const outside = new Uint8Array(sx * sz), queue = [];
    for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) {
        if ((x === 0 || z === 0 || x === sx - 1 || z === sz - 1) && top(x, z) === null) { outside[x + sx * z] = 1; queue.push([x, z]); }
    }
    while (queue.length) {
        const [x, z] = queue.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const X = x + dx, Z = z + dz;
            if (X < 0 || Z < 0 || X >= sx || Z >= sz || outside[X + sx * Z] || top(X, Z) !== null) continue;
            outside[X + sx * Z] = 1; queue.push([X, Z]);
        }
    }
    // ...OR an empty column a used splat sits over: the capture SAW something there and it did not close. Without this the
    // border of a sparse capture fell through unlisted -- at 4 splats a face, 26 columns empty and 20 listed, the other
    // 6 joined to the empty margin and so read as "outside the scene"
    const seen = new Uint8Array(sx * sz);
    for (let i = 0; i < cloud.count; i++) if (use[i]) seen[Math.floor(cloud.positions[i * 3] - origin[0]) + sx * Math.floor(cloud.positions[i * 3 + 2] - origin[2])] = 1;
    const holes = [];
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) if (top(x, z) === null && (!outside[x + sx * z] || seen[x + sx * z])) holes.push([x + origin[0], z + origin[2]]);

    // 6. fillHoles: each hole column takes the stand height most of its known 8 neighbours agree on, and the columns
    // with the MOST known neighbours go first. *** RING BY RING WAS THE FIRST DRAFT AND IT RAISED A STEP OUT OF THE
    // FLOOR: *** a hole beside the block reached its middle column while the only known neighbours were three block
    // columns, so it filled at the block's 3; most-known-first settles the corners on the floor before the middle votes.
    let filled = 0;
    if (fillHoles && holes.length) {
        const known = new Map();
        for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) { const t = top(x, z); if (t !== null) known.set(x + sx * z, t); }
        let open = holes.map(([wx, wz]) => [wx - origin[0], wz - origin[2]]);
        while (open.length) {
            const scored = open.map(([x, z]) => {
                const votes = new Map(); let n = 0;
                for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                    const t = known.get(x + dx + sx * (z + dz)); if (t !== undefined) { votes.set(t, (votes.get(t) || 0) + 1); n++; }
                }
                let best = null, bestN = -1;
                for (const [t, nv] of votes) if (nv > bestN || (nv === bestN && t < best)) { best = t; bestN = nv; }
                return { x, z, n, best };
            });
            const most = Math.max(...scored.map((c) => c.n));
            if (most === 0) break;
            for (const c of scored) if (c.n === most) { for (let y = 0; y < c.best; y++) occ[C(c.x, y, c.z)] = 1; known.set(c.x + sx * c.z, c.best); filled++; }
            open = scored.filter((c) => c.n !== most).map((c) => [c.x, c.z]);
        }
    }

    const solidAt = (wx, wy, wz) => {
        const x = wx - origin[0], y = wy - origin[1], z = wz - origin[2];
        return x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && occ[C(x, y, z)] === 1;
    };
    return {
        voxelAt: (wx, wy, wz) => (solidAt(Math.floor(wx), Math.floor(wy), Math.floor(wz)) ? 1 : 0),
        solidAt,
        chunkHeight: origin[1] + sy,
        origin, dims, holes,
        stats: { splats: cloud.count, used, faint, huge, sub, sigma, componentsDropped, cellsDropped,
                 solidCells: occ.reduce((a, v) => a + v, 0), holeColumns: holes.length, filled },
    };
}

/** physics/voxelBoxCover.js's boxCover(solid, dims) takes grid-local indices; this is that pair for a built world. */
export function toBoxCoverInput(world) {
    const [ox, oy, oz] = world.origin;
    return { solid: (x, y, z) => world.solidAt(x + ox, y + oy, z + oz), dims: world.dims.slice(), origin: world.origin.slice() };
}

// ---- THE FIXTURE: a level whose every solid cell is known, and a capture of it ----------------------------------

export const LEVEL_DIMS = Object.freeze([24, 8, 24]);

/** The truth: floor (top 1), a block (top 3), stairs 1..4, a pillar (top 5), a wall, a table top on four legs. */
export function levelSolid(x, y, z) {
    const [sx, sy, sz] = LEVEL_DIMS;
    if (x < 0 || z < 0 || x >= sx || z >= sz || y < 0 || y >= sy) return false;
    if (y === 0) return true;
    if (x >= 4 && x <= 6 && z >= 4 && z <= 6 && y <= 2) return true;
    if (x >= 10 && x <= 13 && z >= 3 && z <= 4 && y <= x - 9) return true;
    if (x === 18 && z === 18 && y <= 4) return true;
    if (z === 12 && x >= 2 && x <= 9 && y <= 3) return true;
    if (x >= 14 && x <= 19 && z >= 6 && z <= 9 && y === 3) return true;
    if ((x === 14 || x === 19) && (z === 6 || z === 9) && y <= 2) return true;
    return false;
}

/**
 * Splats on every face of the level a camera could see -- not the ground's underside, not the skirt outside the
 * scene -- flat (`tangent` across the face, `normal` through it), jittered `jitter` off the plane, opacity 0.6..1.
 * `holes` [[x, z, radius, nearY?]] drop the splats a capture missed; `floaters` add translucent blobs and
 * `opaqueFloaters` opaque ones; `skipUnderside` drops every downward face. Deterministic in `seed`.
 */
export function captureLevel(opts = {}) {
    const { perFace = 6, jitter = 0.03, tangent = 0.3, normal = 0.02, seed = 7, holes = [], floaters = 0,
            opaqueFloaters = 0, skipUnderside = false, solid = levelSolid, dims = LEVEL_DIMS } = opts;
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
    const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const P = [], S = [], O = [];
    const [sx, sy, sz] = dims;
    const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) {
        if (!solid(x, y, z)) continue;
        for (const d of dirs) {
            const nx = x + d[0], ny = y + d[1], nz = z + d[2];
            if (ny < 0 || nx < 0 || nz < 0 || nx >= sx || nz >= sz || solid(nx, ny, nz)) continue;
            if (skipUnderside && d[1] === -1) continue;
            const ax = d[0] ? 0 : d[1] ? 1 : 2, base = [x, y, z][ax] + (d[ax] > 0 ? 1 : 0);
            for (let k = 0; k < perFace; k++) {
                const p = [x + rnd(), y + rnd(), z + rnd()];
                p[ax] = base + gauss() * jitter;
                if (holes.some(([hx, hz, hr, hy]) => (hy === undefined || Math.abs(p[1] - hy) < 0.5) && Math.hypot(p[0] - hx, p[2] - hz) < hr)) continue;
                const sc = [tangent, tangent, tangent]; sc[ax] = normal;
                P.push(...p); S.push(...sc); O.push(0.6 + 0.4 * rnd());
            }
        }
    }
    for (let i = 0; i < floaters; i++) { P.push(rnd() * sx, 1.5 + rnd() * 5, rnd() * sz); S.push(0.5, 0.5, 0.5); O.push(0.05 + 0.1 * rnd()); }
    for (let i = 0; i < opaqueFloaters; i++) { P.push(rnd() * sx, 4.5 + rnd() * 3, rnd() * sz); S.push(0.15, 0.15, 0.15); O.push(0.9); }
    return { positions: Float32Array.from(P), scales: Float32Array.from(S), opacities: Float32Array.from(O), count: O.length };
}

/** How a built world differs from the level, column by column and cell by cell, over the level's own extent. */
export function compareToLevel(world, solid = levelSolid, dims = LEVEL_DIMS) {
    const [sx, sy, sz] = dims;
    const topOf = (f, x, z) => { for (let y = sy - 1; y >= 0; y--) if (f(x, y, z)) return y + 1; return null; };
    let wrongTop = 0, fallThrough = 0, falseSolid = 0, falseEmpty = 0;
    for (let x = 0; x < sx; x++) for (let z = 0; z < sz; z++) {
        const t = topOf(solid, x, z), m = topOf(world.solidAt, x, z);
        if (m === null) fallThrough++; else if (m !== t) wrongTop++;
        for (let y = 0; y < sy; y++) { const a = solid(x, y, z), b = world.solidAt(x, y, z); if (b && !a) falseSolid++; if (a && !b) falseEmpty++; }
    }
    return { columns: sx * sz, wrongTop, fallThrough, falseSolid, falseEmpty };
}
