// physics/xpbd/volume.js
//
// A pressure constraint: a single global XPBD constraint over a closed mesh that drives its enclosed volume toward a
// target. Below target it inflates, above it deflates, and at target it conserves volume -- squash one side and the
// mesh bulges out another, because the constraint only cares about the total. This is a new KIND of constraint: not a
// per-edge distance but one constraint touching every vertex, so it cannot be graph-colored -- it is solved once per
// iteration, all vertices moved from a single multiplier. Enclosed volume is the divergence-theorem sum of signed
// tetrahedra over the triangles, and the per-vertex gradient is the sum of the opposite-edge cross products.
//
// Two determinism points. The closed mesh is built by subdividing an octahedron -- integer base vertices, midpoints
// normalised with a square root -- so there is NO sin/cos anywhere and the initial positions are bit-identical (a UV
// sphere would seed the whole thing with libm trig). And the volume is a sum over triangles in a FIXED order, because
// floating-point addition is not associative. Pure +,-,*,/ and sqrt.

function normalize(x, y, z) { const l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; }

// Subdivided octahedron -> unit sphere. subdiv 0 = octahedron (6 verts, 8 tris). Trig-free.
export function generateIcosphere(subdiv = 1) {
    let verts = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    let tris = [[4, 0, 2], [4, 2, 1], [4, 1, 3], [4, 3, 0], [5, 2, 0], [5, 0, 3], [5, 3, 1], [5, 1, 2]];   // outward CCW winding
    for (let s = 0; s < subdiv; s++) {
        const mid = new Map(), out = [];
        const midpoint = (a, b) => {
            const key = a < b ? a + "_" + b : b + "_" + a;
            if (mid.has(key)) return mid.get(key);
            const va = verts[a], vb = verts[b], m = normalize((va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2);
            const idx = verts.length; verts.push(m); mid.set(key, idx); return idx;
        };
        for (const [a, b, c] of tris) { const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a); out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
        tris = out;
    }
    const pos = new Float64Array(verts.length * 3);
    for (let i = 0; i < verts.length; i++) { pos[3 * i] = verts[i][0]; pos[3 * i + 1] = verts[i][1]; pos[3 * i + 2] = verts[i][2]; }
    return { pos, tris, n: verts.length };
}

// Unique edges of the triangle mesh, as distance constraints at their current length -- these hold the mesh's shape.
export function buildEdges(pos, tris, compliance = 0.0005) {
    const seen = new Set(), cons = [];
    const add = (i, j) => { const k = i < j ? i + "_" + j : j + "_" + i; if (seen.has(k)) return; seen.add(k); const dx = pos[3 * i] - pos[3 * j], dy = pos[3 * i + 1] - pos[3 * j + 1], dz = pos[3 * i + 2] - pos[3 * j + 2]; cons.push({ i, j, rest: Math.sqrt(dx * dx + dy * dy + dz * dz), compliance }); };
    for (const [a, b, c] of tris) { add(a, b); add(b, c); add(c, a); }
    return cons;
}

// Signed enclosed volume: (1/6) sum over triangles of va . (vb x vc). Fixed triangle order -> deterministic sum.
export function enclosedVolume(pos, tris) {
    let V = 0;
    for (let t = 0; t < tris.length; t++) {
        const a = tris[t][0], b = tris[t][1], c = tris[t][2];
        const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2], bx = pos[3 * b], by = pos[3 * b + 1], bz = pos[3 * b + 2], cx = pos[3 * c], cy = pos[3 * c + 1], cz = pos[3 * c + 2];
        const crx = by * cz - bz * cy, cry = bz * cx - bx * cz, crz = bx * cy - by * cx;
        V += (ax * crx + ay * cry + az * crz);
    }
    return V / 6;
}

// One XPBD pass of the single volume constraint toward restVol*inflation. Returns the updated multiplier.
export function solveVolume(pred, invMass, tris, restVol, inflation, compliance, dt, lambda) {
    const n = invMass.length, grad = new Float64Array(3 * n);
    let V = 0;
    for (let t = 0; t < tris.length; t++) {
        const a = tris[t][0], b = tris[t][1], c = tris[t][2];
        const ax = pred[3 * a], ay = pred[3 * a + 1], az = pred[3 * a + 2], bx = pred[3 * b], by = pred[3 * b + 1], bz = pred[3 * b + 2], cx = pred[3 * c], cy = pred[3 * c + 1], cz = pred[3 * c + 2];
        const cra = by * cz - bz * cy, crb = bz * cx - bx * cz, crc = bx * cy - by * cx;   // vb x vc  -> grad a
        V += (ax * cra + ay * crb + az * crc);
        grad[3 * a] += cra; grad[3 * a + 1] += crb; grad[3 * a + 2] += crc;
        grad[3 * b] += (cy * az - cz * ay); grad[3 * b + 1] += (cz * ax - cx * az); grad[3 * b + 2] += (cx * ay - cy * ax);   // vc x va -> grad b
        grad[3 * c] += (ay * bz - az * by); grad[3 * c + 1] += (az * bx - ax * bz); grad[3 * c + 2] += (ax * by - ay * bx);   // va x vb -> grad c
    }
    V /= 6;
    const C = V - restVol * inflation;
    let sumWGrad2 = 0;
    for (let i = 0; i < n; i++) { const w = invMass[i]; sumWGrad2 += w * ((grad[3 * i] / 6) ** 2 + (grad[3 * i + 1] / 6) ** 2 + (grad[3 * i + 2] / 6) ** 2); }
    const aTilde = compliance / (dt * dt);
    const dLambda = (-C - aTilde * lambda) / (sumWGrad2 + aTilde);
    for (let i = 0; i < n; i++) { const w = invMass[i]; if (w === 0) continue; pred[3 * i] += w * (grad[3 * i] / 6) * dLambda; pred[3 * i + 1] += w * (grad[3 * i + 1] / 6) * dLambda; pred[3 * i + 2] += w * (grad[3 * i + 2] / 6) * dLambda; }
    return lambda + dLambda;
}

// One substep: predict, solve the shape edges (graph-colored), solve the single volume constraint, finalize.
export function volumeSubstep(state, edges, edgeBatches, tris, restVol, opts = {}) {
    const { pos, vel, invMass } = state;
    const N = invMass.length;
    const dt = opts.dt ?? 0.016, iters = opts.iterations ?? 5, g = opts.gravity || [0, 0, 0];
    const inflation = opts.inflation ?? 1.0, volCompliance = opts.volumeCompliance ?? 0.0;

    const pred = new Float64Array(pos.length), prev = Float64Array.from(pos);
    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] += g[0] * dt; vel[o + 1] += g[1] * dt; vel[o + 2] += g[2] * dt; pred[o] = pos[o] + vel[o] * dt; pred[o + 1] = pos[o + 1] + vel[o + 1] * dt; pred[o + 2] = pos[o + 2] + vel[o + 2] * dt; } else { pred[o] = pos[o]; pred[o + 1] = pos[o + 1]; pred[o + 2] = pos[o + 2]; } }

    const lamE = new Float64Array(edges.length); let lamV = 0;
    for (let it = 0; it < iters; it++) {
        for (let b = 0; b < edgeBatches.length; b++) { const batch = edgeBatches[b]; for (let bi = 0; bi < batch.length; bi++) { const ci = batch[bi], c = edges[ci]; const w1 = invMass[c.i], w2 = invMass[c.j], wsum = w1 + w2; if (wsum === 0) continue; const ax = 3 * c.i, bx = 3 * c.j; const dx = pred[ax] - pred[bx], dy = pred[ax + 1] - pred[bx + 1], dz = pred[ax + 2] - pred[bx + 2]; const len = Math.sqrt(dx * dx + dy * dy + dz * dz); if (len < 1e-12) continue; const C = len - c.rest, aTilde = c.compliance / (dt * dt); const dL = (-C - aTilde * lamE[ci]) / (wsum + aTilde); lamE[ci] += dL; const s = dL / len; pred[ax] += w1 * s * dx; pred[ax + 1] += w1 * s * dy; pred[ax + 2] += w1 * s * dz; pred[bx] -= w2 * s * dx; pred[bx + 1] -= w2 * s * dy; pred[bx + 2] -= w2 * s * dz; } }
        lamV = solveVolume(pred, invMass, tris, restVol, inflation, volCompliance, dt, lamV);
    }

    for (let a = 0; a < N; a++) { const o = 3 * a; if (invMass[a] > 0) { vel[o] = (pred[o] - prev[o]) / dt; vel[o + 1] = (pred[o + 1] - prev[o + 1]) / dt; vel[o + 2] = (pred[o + 2] - prev[o + 2]) / dt; } pos[o] = pred[o]; pos[o + 1] = pred[o + 1]; pos[o + 2] = pred[o + 2]; }
    return state;
}
