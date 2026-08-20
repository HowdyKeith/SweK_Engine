// physics/xpbd/fluid.js
//
// The fourth coupling, and the first that flows both ways. Fluid pressure should cave a mesh, and the mesh boundary
// should keep the fluid out -- and the trick is that these are not two forces but ONE constraint. A fluid particle
// and a mesh node closer than the contact distance get a unilateral distance constraint that pushes them apart, and
// the correction is split by inverse mass: the fluid particle moves, the mesh node moves, the heavier one moves less.
// Two-way coupling is therefore not bolted on; it is momentum. Drop the mesh half of the correction and the mesh is a
// wall the fluid slides off; drop the fluid half and the fluid tunnels straight through. Only both halves is a coupling.
//
// The contacts are discovered fresh each frame across the two particle sets, then SORTED before coloring, exactly the
// self-collision determinism rule from v2661, so the bipartite contact set is a pure function of the two position
// buffers. The fluid here is a minimal incompressible blob (gravity plus particle-particle unilateral contact); a full
// PBF/SPH pressure solver plugs into the same fluid-fluid slot. Pure +,-,*,/ and sqrt; bit-identical.
import { colorConstraints } from "./xpbd.js";
import { findCollisionPairs } from "./selfCollide.js";
import { buildNeighbors, pbfProject } from "./pbf.js";

const cellOf = (v, cs) => Math.floor(v / cs);
const keyOf = (x, y, z) => x + "," + y + "," + z;

// Deterministic cross-set contact discovery: sorted (aIdx in A, bIdx in B) pairs within `thresh`. visitOrder lets the
// gate scramble the walk; the sorted output does not change.
export function findCrossContacts(posA, nA, posB, nB, cellSize, thresh, visitOrder) {
    const buckets = new Map();
    for (let b = 0; b < nB; b++) { const k = keyOf(cellOf(posB[3 * b], cellSize), cellOf(posB[3 * b + 1], cellSize), cellOf(posB[3 * b + 2], cellSize)); (buckets.get(k) || buckets.set(k, []).get(k)).push(b); }
    const t2 = thresh * thresh, seen = new Set();
    const order = visitOrder || Array.from({ length: nA }, (_, i) => i);
    for (const a of order) {
        const cx = cellOf(posA[3 * a], cellSize), cy = cellOf(posA[3 * a + 1], cellSize), cz = cellOf(posA[3 * a + 2], cellSize);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const bs = buckets.get(keyOf(cx + dx, cy + dy, cz + dz)); if (!bs) continue;
            for (const b of bs) { const ex = posA[3 * a] - posB[3 * b], ey = posA[3 * a + 1] - posB[3 * b + 1], ez = posA[3 * a + 2] - posB[3 * b + 2]; if (ex * ex + ey * ey + ez * ez < t2) seen.add(a + "_" + b); }
        }
    }
    return [...seen].map((s) => { const p = s.indexOf("_"); return [Number(s.slice(0, p)), Number(s.slice(p + 1))]; }).sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]));
}

// Color the bipartite contact set (offset B indices so the two namespaces never collide) -> batches of contact indices.
export function colorCrossContacts(contacts, nA) {
    return colorConstraints(contacts.map(([a, b]) => ({ i: a, j: nA + b })));
}

// Solve cross contacts unilaterally on the two prediction buffers. BOTH sides move, split by inverse mass -- two-way.
export function solveCrossContacts(predA, invMassA, predB, invMassB, contacts, batches, thresh) {
    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        for (let k = 0; k < batch.length; k++) {
            const [a, b] = contacts[batch[k]];
            const wa = invMassA[a], wb = invMassB[b], wsum = wa + wb;
            if (wsum === 0) continue;
            const ax = 3 * a, bx = 3 * b;
            const dx = predA[ax] - predB[bx], dy = predA[ax + 1] - predB[bx + 1], dz = predA[ax + 2] - predB[bx + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-12) continue;
            const C = len - thresh;
            if (C >= 0) continue;                                  // unilateral: only when interpenetrating
            const s = (-C / wsum) / len;
            predA[ax] += wa * s * dx; predA[ax + 1] += wa * s * dy; predA[ax + 2] += wa * s * dz;   // fluid moves
            predB[bx] -= wb * s * dx; predB[bx + 1] -= wb * s * dy; predB[bx + 2] -= wb * s * dz;   // mesh moves (TWO-WAY)
        }
    }
}

function predictInto(state, pred, dt, g) {
    const N = state.invMass.length;
    for (let a = 0; a < N; a++) {
        const o = 3 * a;
        if (state.invMass[a] > 0) { state.vel[o] += g[0] * dt; state.vel[o + 1] += g[1] * dt; state.vel[o + 2] += g[2] * dt; pred[o] = state.pos[o] + state.vel[o] * dt; pred[o + 1] = state.pos[o + 1] + state.vel[o + 1] * dt; pred[o + 2] = state.pos[o + 2] + state.vel[o + 2] * dt; }
        else { pred[o] = state.pos[o]; pred[o + 1] = state.pos[o + 1]; pred[o + 2] = state.pos[o + 2]; }
    }
}
function finalizeFrom(state, pred, prev, dt) {
    const N = state.invMass.length;
    for (let a = 0; a < N; a++) { const o = 3 * a; if (state.invMass[a] > 0) { state.vel[o] = (pred[o] - prev[o]) / dt; state.vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; state.vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } state.pos[o] = pred[o]; state.pos[o + 1] = pred[o + 1]; state.pos[o + 2] = pred[o + 2]; }
}

// One coupled substep: predict both, solve the mesh cloth, keep the fluid incompressible, then the two-way contacts.
export function fluidMeshSubstep(fluid, mesh, meshCons, meshBatches, opts = {}) {
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 4, g = opts.gravity || [0, -10, 0];
    const rFluid = opts.fluidRadius ?? 0.12, rContact = opts.contactRadius ?? 0.12;
    const nF = fluid.invMass.length, nM = mesh.invMass.length;
    const fPred = new Float64Array(3 * nF), fPrev = Float64Array.from(fluid.pos);
    const mPred = new Float64Array(3 * nM), mPrev = Float64Array.from(mesh.pos);
    predictInto(fluid, fPred, dt, g); predictInto(mesh, mPred, dt, g);

    // mesh cloth constraints
    const lam = new Float64Array(meshCons.length);
    for (let it = 0; it < iters; it++) for (let b = 0; b < meshBatches.length; b++) { const batch = meshBatches[b]; for (let bi = 0; bi < batch.length; bi++) { const ci = batch[bi], c = meshCons[ci]; const w1 = mesh.invMass[c.i], w2 = mesh.invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue; const ax = 3 * c.i, bx = 3 * c.j; const dx = mPred[ax] - mPred[bx], dy = mPred[ax + 1] - mPred[bx + 1], dz = mPred[ax + 2] - mPred[bx + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue; const C = len - c.rest, aTilde = c.compliance / (dt * dt); const dL = (-C - aTilde * lam[ci]) / (wsum + aTilde); lam[ci] += dL; const s = dL / len; mPred[ax] += w1 * s * dx; mPred[ax + 1] += w1 * s * dy; mPred[ax + 2] += w1 * s * dz; mPred[bx] -= w2 * s * dx; mPred[bx + 1] -= w2 * s * dy; mPred[bx + 2] -= w2 * s * dz; } }

    // fluid incompressibility: a real position-based-fluids density projection when a rest density is given
    // (pressure from density), otherwise the placeholder particle-particle unilateral contact. Both deterministic.
    if (opts.rho0) {
        const h = opts.h ?? (3 * rFluid);
        const nbr = buildNeighbors(fPred, nF, h, opts.fluidOrder);
        pbfProject(fPred, nF, fluid.invMass, nbr, { h, rho0: opts.rho0, iterations: opts.pbfIterations ?? 2, eps: opts.pbfEps ?? 1e-4 });
    } else {
        const ffPairs = findCollisionPairs(fPred, nF, 2 * rFluid, 2 * rFluid, new Set(), opts.fluidOrder);
        const ffCons = ffPairs.map(([i, j]) => ({ i, j, rest: 2 * rFluid, compliance: 0 }));
        const ffBatches = colorConstraints(ffCons);
        for (let bi = 0; bi < ffBatches.length; bi++) { const batch = ffBatches[bi]; for (let k = 0; k < batch.length; k++) { const c = ffCons[batch[k]]; const w1 = fluid.invMass[c.i], w2 = fluid.invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue; const ax = 3 * c.i, bx = 3 * c.j; const dx = fPred[ax] - fPred[bx], dy = fPred[ax + 1] - fPred[bx + 1], dz = fPred[ax + 2] - fPred[bx + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue; const C = len - c.rest; if (C >= 0) continue; const s = (-C / wsum) / len; fPred[ax] += w1 * s * dx; fPred[ax + 1] += w1 * s * dy; fPred[ax + 2] += w1 * s * dz; fPred[bx] -= w2 * s * dx; fPred[bx + 1] -= w2 * s * dy; fPred[bx + 2] -= w2 * s * dz; } }
    }

    // TWO-WAY fluid <-> mesh contacts
    const fmPairs = findCrossContacts(fPred, nF, mPred, nM, rContact, rContact, opts.contactOrder);
    const fmBatches = colorCrossContacts(fmPairs, nF);
    if (opts.contactMu) solveCrossContactsFriction(fPred, fPrev, fluid.invMass, mPred, mPrev, mesh.invMass, fmPairs, fmBatches, rContact, opts.contactMu);
    else solveCrossContacts(fPred, fluid.invMass, mPred, mesh.invMass, fmPairs, fmBatches, rContact);

    finalizeFrom(fluid, fPred, fPrev, dt); finalizeFrom(mesh, mPred, mPrev, dt);
    return { fluid, mesh, contacts: fmPairs.length };
}

// Solve cross contacts with two-way Coulomb friction: normal push apart, then resist the relative tangential motion
// since the previous step, bounded by mu times the normal correction and split by inverse mass. Fluid drags mesh.
export function solveCrossContactsFriction(predA, prevA, invMassA, predB, prevB, invMassB, contacts, batches, thresh, mu) {
    for (let bi = 0; bi < batches.length; bi++) {
        const batch = batches[bi];
        for (let k = 0; k < batch.length; k++) {
            const [a, b] = contacts[batch[k]];
            const wa = invMassA[a], wb = invMassB[b], wsum = wa + wb;
            if (wsum === 0) continue;
            const ax = 3 * a, bx = 3 * b;
            let dx = predA[ax] - predB[bx], dy = predA[ax + 1] - predB[bx + 1], dz = predA[ax + 2] - predB[bx + 2];
            const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (len < 1e-12 || len >= thresh) continue;
            const depth = thresh - len, nx = dx / len, ny = dy / len, nz = dz / len, s = depth / wsum;
            predA[ax] += wa * s * nx; predA[ax + 1] += wa * s * ny; predA[ax + 2] += wa * s * nz;
            predB[bx] -= wb * s * nx; predB[bx + 1] -= wb * s * ny; predB[bx + 2] -= wb * s * nz;
            let rx = (predA[ax] - prevA[ax]) - (predB[bx] - prevB[bx]), ry = (predA[ax + 1] - prevA[ax + 1]) - (predB[bx + 1] - prevB[bx + 1]), rz = (predA[ax + 2] - prevA[ax + 2]) - (predB[bx + 2] - prevB[bx + 2]);
            const rn = rx * nx + ry * ny + rz * nz; rx -= rn * nx; ry -= rn * ny; rz -= rn * nz;
            const tLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
            if (tLen < 1e-12) continue;
            const scale = (tLen <= mu * depth ? 1 : mu * depth / tLen) / wsum;
            predA[ax] -= wa * scale * rx; predA[ax + 1] -= wa * scale * ry; predA[ax + 2] -= wa * scale * rz;
            predB[bx] += wb * scale * rx; predB[bx + 1] += wb * scale * ry; predB[bx + 2] += wb * scale * rz;
        }
    }
}

export function centroidY(pos, n) { let s = 0; for (let i = 0; i < n; i++) s += pos[3 * i + 1]; return s / n; }
export function minY(pos, n) { let m = Infinity; for (let i = 0; i < n; i++) if (pos[3 * i + 1] < m) m = pos[3 * i + 1]; return m; }
