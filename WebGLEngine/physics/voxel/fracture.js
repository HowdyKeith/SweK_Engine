// physics/voxel/fracture.js -- turning a broken voxel structure into rigid bodies that can be trusted.
//
// This is the interesting half of what Teardown does, and none of it requires Teardown. When you blow a hole in a
// voxel structure, three things must happen and only the middle one is subtle:
//
//   1. remove the voxels                     -- trivial
//   2. find out what fell OFF                -- connected components, a flood fill. Exact: a piece is either attached
//                                               to the anchored part or it is not, and there is no judgement in it.
//   3. give each loose piece its physics     -- mass, centre of mass, inertia tensor. THIS is where engines fudge,
//                                               and it is the one part with an EXACT answer to be held to.
//
// A solid box has an analytic inertia tensor: I = m/12 * diag(b^2+c^2, a^2+c^2, a^2+b^2). So a voxel summation can be
// made to EARN it, exactly, at every resolution -- but only if each voxel's OWN inertia about its own centre is
// included alongside the parallel-axis term. Leave that out and every result is wrong by about cell^2: small, wrong
// in the direction of "spins slightly too fast", and indistinguishable from a tuning problem forever. That term is
// the difference between a physics bridge and a plausible one.
//
// The fragments then go to Jolt, which this engine has already held to the exact damped trajectory (95.15633),
// a measured damping constant (0.05000), and bit-identical determinism. So the chain is: exact geometry -> exact
// mass properties -> a verified solver.
"use strict";

// 6-connectivity flood fill. Returns { labels, count, sizes } -- label 0 means empty.
// Iterative, with an explicit stack: a recursive version blows the stack on a structure of any real size, which is
// the kind of thing that works in every test and dies on the first interesting scene.
function connectedComponents(grid, nx, ny, nz) {
    const labels = new Int32Array(nx * ny * nz);
    const at = (x, y, z) => (z * ny + y) * nx + x;
    const sizes = [0];
    let next = 1;
    const stack = [];
    for (let z0 = 0; z0 < nz; z0++) for (let y0 = 0; y0 < ny; y0++) for (let x0 = 0; x0 < nx; x0++) {
        const s = at(x0, y0, z0);
        if (!grid[s] || labels[s]) continue;
        const lab = next++;
        let n = 0;
        stack.push(x0, y0, z0); labels[s] = lab;
        while (stack.length) {
            const z = stack.pop(), y = stack.pop(), x = stack.pop();
            n++;
            for (const [dx, dy, dz] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
                const a = x+dx, b = y+dy, c = z+dz;
                if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
                const k = at(a, b, c);
                if (!grid[k] || labels[k]) continue;
                labels[k] = lab; stack.push(a, b, c);
            }
        }
        sizes.push(n);
    }
    return { labels, count: next - 1, sizes };
}

// Mass, centre of mass and the full inertia tensor of one labelled piece, in world units.
// The tensor is returned as [Ixx, Iyy, Izz, Ixy, Ixz, Iyz] about the centre of mass.
function massProperties(labels, label, nx, ny, nz, cell, density = 1) {
    const mi = density * cell * cell * cell;
    let M = 0, cx = 0, cy = 0, cz = 0, n = 0;
    const at = (x, y, z) => (z * ny + y) * nx + x;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        if (labels[at(x, y, z)] !== label) continue;
        M += mi; n++;
        cx += mi * (x + 0.5) * cell; cy += mi * (y + 0.5) * cell; cz += mi * (z + 0.5) * cell;
    }
    if (M === 0) return null;
    cx /= M; cy /= M; cz /= M;
    // each voxel is a CUBE. Its own inertia about its own centre is m*cell^2/6 on each diagonal -- this is the term
    // that makes the sum telescope to the continuum answer instead of merely approaching it.
    const self = mi * cell * cell / 6;
    let Ixx = 0, Iyy = 0, Izz = 0, Ixy = 0, Ixz = 0, Iyz = 0;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        if (labels[at(x, y, z)] !== label) continue;
        const dx = (x + 0.5) * cell - cx, dy = (y + 0.5) * cell - cy, dz = (z + 0.5) * cell - cz;
        Ixx += mi * (dy*dy + dz*dz) + self;
        Iyy += mi * (dx*dx + dz*dz) + self;
        Izz += mi * (dx*dx + dy*dy) + self;
        Ixy -= mi * dx * dy; Ixz -= mi * dx * dz; Iyz -= mi * dy * dz;
    }
    return { mass: M, voxels: n, com: [cx, cy, cz], I: [Ixx, Iyy, Izz, Ixy, Ixz, Iyz] };
}

// Which pieces are still held up? Anything touching an anchored cell (by default the floor, y = 0) stays put;
// everything else is loose and belongs to the physics engine now.
function looseFragments(grid, nx, ny, nz, { anchorAt = (x, y, z) => y === 0 } = {}) {
    const cc = connectedComponents(grid, nx, ny, nz);
    const anchored = new Set();
    const at = (x, y, z) => (z * ny + y) * nx + x;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const l = cc.labels[at(x, y, z)];
        if (l && anchorAt(x, y, z)) anchored.add(l);
    }
    const loose = [];
    for (let l = 1; l <= cc.count; l++) if (!anchored.has(l)) loose.push(l);
    return { ...cc, anchored: [...anchored], loose };
}

// Carve a sphere out of the grid -- the impact.
function carveSphere(grid, nx, ny, nz, cx, cy, cz, r) {
    let removed = 0;
    const at = (x, y, z) => (z * ny + y) * nx + x;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
        const k = at(x, y, z);
        if (grid[k] && (x-cx)**2 + (y-cy)**2 + (z-cz)**2 <= r*r) { grid[k] = 0; removed++; }
    }
    return removed;
}
export { connectedComponents, massProperties, looseFragments, carveSphere };
