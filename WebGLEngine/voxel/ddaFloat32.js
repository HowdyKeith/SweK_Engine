// voxel/ddaFloat32.js
//
// THE DDA IN SINGLE PRECISION (v3062), so the one question no existing gate can answer becomes answerable
// without a GPU.
//
// voxelRaymarch-selfcheck has a CPU mirror of the shader and it proves ALGORITHMIC equivalence -- same steps,
// same tie-breaks, same faces. Its own header is honest that this is all it proves: the mirror runs in float64
// and the shader runs in highp float, so a divergence caused purely by PRECISION is invisible to it. That gap is
// why "CPU voxelDDA vs GPU raymarch hit-agreement" has sat on the ranked list as needing a GPU.
//
// It does not need a GPU. GLSL highp float is IEEE binary32, and Math.fround() rounds a JS double to exactly
// that. Wrapping every arithmetic operation in fround gives a faithful model of what the shader computes -- so
// the comparison "does single precision change the answer?" runs in the sandbox, today.
//
// WHAT THIS IS FOR. Not to replace the shader, and not to be fast. It exists so that when a GPU eventually
// disagrees with the CPU about which voxel a ray hit, there is already an answer to "is that expected?" --
// measured, with the conditions that produce it named. Without that number, the first GPU/CPU disagreement is
// indistinguishable from a bug, and somebody spends a day on it.
//
// THE HONEST EXPECTATION, before measuring: they will NOT always agree. A DDA chooses its next axis by comparing
// tMax values, and when two are within a rounding error of each other, float32 and float64 can pick different
// axes and walk into different voxels. That is not a bug in either one. It is a tie, resolved differently.
//
// Browser-safe: no imports, no DOM, no node builtins.

const f = Math.fround;

/**
 * traverseDDA in single precision. Structurally identical to voxel/voxelDDA.js traverseDDA -- same branches,
 * same tie-break order (X, then Y, then Z, all with <=), same face normals -- with every arithmetic result
 * rounded to binary32 the way a GLSL highp float would be.
 *
 * Returns { hit, vx, vy, vz, nx, ny, nz, t, steps, minGap } where minGap is the smallest gap ever seen between
 * the winning tMax and its closest rival. A small minGap is the CONDITION under which the two precisions can
 * part company, so it is returned rather than inferred: it lets a caller say "this ray was a coin flip" instead
 * of "the GPU is wrong".
 */
export function traverseDDA32(ox, oy, oz, dx, dy, dz, isSolid, maxSteps = 256) {
    let len = f(Math.hypot(f(dx), f(dy), f(dz)));
    if (len === 0) len = 1;
    dx = f(f(dx) / len); dy = f(f(dy) / len); dz = f(f(dz) / len);

    let x = Math.floor(f(ox)), y = Math.floor(f(oy)), z = Math.floor(f(oz));
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    const tDeltaX = dx !== 0 ? f(Math.abs(f(1 / dx))) : Infinity;
    const tDeltaY = dy !== 0 ? f(Math.abs(f(1 / dy))) : Infinity;
    const tDeltaZ = dz !== 0 ? f(Math.abs(f(1 / dz))) : Infinity;

    const bx = stepX > 0 ? f(f(x + 1) - f(ox)) : f(f(ox) - x);
    const by = stepY > 0 ? f(f(y + 1) - f(oy)) : f(f(oy) - y);
    const bz = stepZ > 0 ? f(f(z + 1) - f(oz)) : f(f(oz) - z);
    let tMaxX = dx !== 0 ? f(bx * tDeltaX) : Infinity;
    let tMaxY = dy !== 0 ? f(by * tDeltaY) : Infinity;
    let tMaxZ = dz !== 0 ? f(bz * tDeltaZ) : Infinity;

    let nx = 0, ny = 0, nz = 0, t = 0, minGap = Infinity;
    for (let i = 0; i < maxSteps; i++) {
        if (isSolid(x, y, z)) return { hit: true, vx: x, vy: y, vz: z, nx, ny, nz, t, steps: i, minGap };

        // How close this decision was. Two axes within a rounding error is exactly when float32 and float64 can
        // disagree, so the closest call across the whole ray is worth carrying out.
        const sorted = [tMaxX, tMaxY, tMaxZ].filter(isFinite).sort((a, b) => a - b);
        if (sorted.length >= 2) {
            const gap = sorted[1] - sorted[0];
            const scale = Math.max(Math.abs(sorted[0]), 1e-30);
            if (gap / scale < minGap) minGap = gap / scale;
        }

        if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { x += stepX; t = tMaxX; tMaxX = f(tMaxX + tDeltaX); nx = -stepX; ny = 0; nz = 0; }
        else if (tMaxY <= tMaxZ) { y += stepY; t = tMaxY; tMaxY = f(tMaxY + tDeltaY); nx = 0; ny = -stepY; nz = 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ = f(tMaxZ + tDeltaZ); nx = 0; ny = 0; nz = -stepZ; }
    }
    return { hit: false, vx: x, vy: y, vz: z, nx: 0, ny: 0, nz: 0, t, steps: maxSteps, minGap };
}

/**
 * Compare a float32 traversal against a float64 one over a ray set and CHARACTERISE the disagreements rather
 * than just counting them. Returns { n, agree, disagree, cases, worstAgreeingGap, bestDisagreeingGap }.
 *
 * cases holds the diverging rays with the minGap that produced them -- because "0.3% disagree" is a number and
 * "they disagree only where two axes were within 1e-7 of each other" is a finding.
 */
export function comparePrecision(rays, isSolid, run64, maxSteps = 256, maxCases = 12) {
    let agree = 0, worstAgreeingGap = Infinity, bestDisagreeingGap = 0;
    const cases = [];
    for (const r of rays) {
        const a = run64(r[0], r[1], r[2], r[3], r[4], r[5], isSolid, maxSteps);
        const b = traverseDDA32(r[0], r[1], r[2], r[3], r[4], r[5], isSolid, maxSteps);
        const same = a.hit === b.hit && (!a.hit || (a.vx === b.vx && a.vy === b.vy && a.vz === b.vz));
        if (same) { agree++; if (b.minGap < worstAgreeingGap) worstAgreeingGap = b.minGap; }
        else {
            if (b.minGap > bestDisagreeingGap) bestDisagreeingGap = b.minGap;
            if (cases.length < maxCases) cases.push({ ray: r, minGap: b.minGap, f64: [a.vx, a.vy, a.vz, a.hit], f32: [b.vx, b.vy, b.vz, b.hit] });
        }
    }
    return { n: rays.length, agree, disagree: rays.length - agree, cases, worstAgreeingGap, bestDisagreeingGap };
}
