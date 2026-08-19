// physics/xpbd/clothMesh.js
//
// Builds the constraint set for a WxH cloth grid. Every constraint here is a DISTANCE constraint, so they all ride
// the v2659 XPBD solver unchanged -- the extensions are new vertex pairings, not new math:
//   - structural: right and down neighbours (rest = spacing) -- resists stretch.
//   - shear: the two diagonals of each quad (rest = spacing*sqrt2) -- resists diagonal collapse (square -> diamond).
//   - bending: the skip-one neighbours, two cells apart (rest = 2*spacing) -- resists folding.
// The reference doc did bending as a dihedral angle with acos(dot(n1,n2)); acos is transcendental and libm differs
// across architectures, so it would break bit-identity. Distance-based (Provot-style) bending needs only sqrt, so it
// stays deterministic. adj is the set of all bonded pairs, so self-collision can skip particles that are meant to be
// connected.

const pairId = (i, j) => (i < j ? i + "_" + j : j + "_" + i);

export function buildClothConstraints(W, H, spacing = 1, comp = {}) {
    const cStruct = comp.structural ?? 0.0;
    const cShear = comp.shear ?? 0.001;
    const cBend = comp.bending ?? 0.01;
    const idx = (x, y) => y * W + x;
    const cons = [];
    const adj = new Set();
    const add = (i, j, rest, compliance, kind) => { cons.push({ i, j, rest, compliance, kind }); adj.add(pairId(i, j)); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (x + 1 < W) add(idx(x, y), idx(x + 1, y), spacing, cStruct, "structural");
        if (y + 1 < H) add(idx(x, y), idx(x, y + 1), spacing, cStruct, "structural");
        if (x + 1 < W && y + 1 < H) {
            add(idx(x, y), idx(x + 1, y + 1), spacing * Math.SQRT2, cShear, "shear");
            add(idx(x + 1, y), idx(x, y + 1), spacing * Math.SQRT2, cShear, "shear");
        }
        if (x + 2 < W) add(idx(x, y), idx(x + 2, y), spacing * 2, cBend, "bending");
        if (y + 2 < H) add(idx(x, y), idx(x, y + 2), spacing * 2, cBend, "bending");
    }
    return { cons, adj };
}

export function countKinds(cons) {
    const k = { structural: 0, shear: 0, bending: 0 };
    for (const c of cons) k[c.kind] = (k[c.kind] || 0) + 1;
    return k;
}
