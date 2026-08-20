// WebGLEngine/physics/md/neighborGrid.js — v2646
//
// The neighbour grid -- what makes MD scale. The all-pairs force loop is O(N^2); with a cutoff most of those pairs
// are too far to matter. This buckets atoms into cells of side equal to the cutoff, so any two atoms within the
// cutoff sit in the same cell or one of its 26 neighbours. Each atom then only checks that 27-cell neighbourhood
// instead of every other atom, turning the force loop O(N) for a uniform system.
//
// THE GUARANTEE, same as the broad-phase: no within-cutoff pair is ever missed. With the cell side equal to the
// cutoff, two atoms closer than the cutoff differ by at most one cell in each axis, so they are always in the
// searched neighbourhood. The gate proves the grid's pair set is EXACTLY the brute-force within-cutoff set.
//
// Cell indexing is floor(x / cutoff): arithmetic only, no transcendental, so the neighbour set is deterministic.

// All pairs [i,j] (i<j) within `cutoff`, found via a cell list. Deterministic order (sorted).
export function neighborPairs(pos, N, cutoff) {
    const c = cutoff, c2 = cutoff * cutoff;
    const cells = new Map();
    const key = (x, y, z) => x + "," + y + "," + z;
    const cellOf = (i) => [Math.floor(pos[3 * i] / c), Math.floor(pos[3 * i + 1] / c), Math.floor(pos[3 * i + 2] / c)];
    for (let i = 0; i < N; i++) {
        const [cx, cy, cz] = cellOf(i);
        const k = key(cx, cy, cz);
        let arr = cells.get(k); if (!arr) cells.set(k, (arr = [])); arr.push(i);
    }
    const seen = new Set(), pairs = [];
    for (let i = 0; i < N; i++) {
        const [cx, cy, cz] = cellOf(i);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const arr = cells.get(key(cx + dx, cy + dy, cz + dz));
            if (!arr) continue;
            for (const j of arr) {
                if (j === i) continue;
                const lo = i < j ? i : j, hi = i < j ? j : i;
                const pk = lo * 0x100000000 + hi;
                if (seen.has(pk)) continue;
                const ddx = pos[3 * lo] - pos[3 * hi], ddy = pos[3 * lo + 1] - pos[3 * hi + 1], ddz = pos[3 * lo + 2] - pos[3 * hi + 2];
                if (ddx * ddx + ddy * ddy + ddz * ddz <= c2) { seen.add(pk); pairs.push([lo, hi]); }
            }
        }
    }
    pairs.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    return pairs;
}

// Lennard-Jones forces via the neighbour grid (import ljCoeff/ljPotential from md.js to keep one force law).
export function computeForcesGrid(pos, N, eps, sig2, cutoff, ljCoeff, ljPotential) {
    const forces = new Float64Array(3 * N);
    let pe = 0;
    for (const [i, j] of neighborPairs(pos, N, cutoff)) {
        const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2];
        const r2 = dx * dx + dy * dy + dz * dz;
        const k = ljCoeff(r2, eps, sig2);
        forces[3 * i] += k * dx; forces[3 * i + 1] += k * dy; forces[3 * i + 2] += k * dz;
        forces[3 * j] -= k * dx; forces[3 * j + 1] -= k * dy; forces[3 * j + 2] -= k * dz;
        pe += ljPotential(r2, eps, sig2);
    }
    return { forces, pe };
}
