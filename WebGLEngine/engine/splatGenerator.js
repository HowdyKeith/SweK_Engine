// FILE: engine/splatGenerator.js
// VERSION: v1 — round 358
//
// Synthetic Gaussian splat point clouds. Returns the same parsed-struct
// shape that splatParser.js produces, so the output can be passed
// directly to new SplatRenderer(gl, splat) without going through .ply
// encoding/decoding.
//
// Struct shape (matches splatParser.parsePly output):
//   {
//     count: N,
//     positions: Float32Array (N * 3)
//     scales:    Float32Array (N * 3)   LOG SPACE — renderer does exp()
//     quats:     Float32Array (N * 4)   (w, x, y, z); identity = (1, 0, 0, 0)
//     colors:    Float32Array (N * 3)   RGB in [0, 1] (post SH transform)
//     opacities: Float32Array (N)       PRE-SIGMOID — use ~5 for ~99% opaque
//     bbox: { min:[x,y,z], max:[x,y,z], center:[x,y,z], size:[x,y,z] }
//   }
//
// These constants encode the format conventions:
//   - opacity 5.0 → sigmoid(5) ≈ 0.993 (effectively opaque)
//   - scale_log = log(0.025) ≈ -3.7 → tiny splat (default for crisp output)
//   - identity quaternion → axis-aligned ellipsoid (just an isotropic blob)

const DEFAULT_OPACITY  = 5.0;
const DEFAULT_LOG_SCALE = Math.log(0.025);

function _computeBbox(positions, count) {
    if (count === 0) {
        return { min: [0,0,0], max: [0,0,0], center: [0,0,0], size: [0,0,0] };
    }
    let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
    let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
    for (let i = 0; i < count; i++) {
        const x = positions[i*3], y = positions[i*3+1], z = positions[i*3+2];
        if (x < mnX) mnX = x; if (y < mnY) mnY = y; if (z < mnZ) mnZ = z;
        if (x > mxX) mxX = x; if (y > mxY) mxY = y; if (z > mxZ) mxZ = z;
    }
    return {
        min: [mnX, mnY, mnZ], max: [mxX, mxY, mxZ],
        center: [(mnX+mxX)/2, (mnY+mxY)/2, (mnZ+mxZ)/2],
        size:   [mxX-mnX, mxY-mnY, mxZ-mnZ],
    };
}

/**
 * Build an empty splat struct ready to be populated. Useful for
 * custom generators that want full control over positions/colors.
 */
export function emptySplat(count) {
    return {
        count,
        positions: new Float32Array(count * 3),
        scales:    new Float32Array(count * 3),
        quats:     new Float32Array(count * 4),
        colors:    new Float32Array(count * 3),
        opacities: new Float32Array(count),
        bbox: { min:[0,0,0], max:[0,0,0], center:[0,0,0], size:[0,0,0] },
    };
}

/**
 * Fill a splat struct with identity quats + uniform log-space scale +
 * default opacity. Caller fills positions and colors separately.
 */
function _setUniformProps(splat, logScale, opacity) {
    for (let i = 0; i < splat.count; i++) {
        // quat (w, x, y, z) = identity (axis-aligned ellipsoid)
        splat.quats[i * 4]     = 1;
        splat.quats[i * 4 + 1] = 0;
        splat.quats[i * 4 + 2] = 0;
        splat.quats[i * 4 + 3] = 0;
        // uniform log-space scale across all 3 axes — isotropic blob
        splat.scales[i * 3]     = logScale;
        splat.scales[i * 3 + 1] = logScale;
        splat.scales[i * 3 + 2] = logScale;
        splat.opacities[i] = opacity;
    }
}

/**
 * Uniformly distributed gaussian cloud inside a sphere.
 *
 * @param {Object} opts
 * @param {number} [opts.count=2000]  splat count
 * @param {number} [opts.radius=1]     sphere radius
 * @param {number[3]} [opts.color]     RGB in [0,1] (default: cool blue)
 * @param {number} [opts.colorJitter=0.1] random variation per splat
 * @param {number} [opts.scaleLog]     log-space splat scale
 * @param {number} [opts.opacity]      pre-sigmoid opacity
 * @param {number} [opts.seed=1]        PRNG seed for reproducibility
 */
export function generateSphereCloud({
    count = 2000, radius = 1,
    color = [0.4, 0.6, 1.0], colorJitter = 0.1,
    scaleLog = DEFAULT_LOG_SCALE, opacity = DEFAULT_OPACITY,
    seed = 1,
} = {}) {
    const splat = emptySplat(count);
    _setUniformProps(splat, scaleLog, opacity);
    const rng = _seededRng(seed);
    for (let i = 0; i < count; i++) {
        // Marsaglia: pick a unit vector then a cube-root-uniform radius
        // (so volume density is uniform, not surface-clustered)
        let vx, vy, vz, sq;
        do {
            vx = rng() * 2 - 1;
            vy = rng() * 2 - 1;
            vz = rng() * 2 - 1;
            sq = vx*vx + vy*vy + vz*vz;
        } while (sq > 1 || sq < 1e-6);
        const inv = 1 / Math.sqrt(sq);
        vx *= inv; vy *= inv; vz *= inv;
        const r = radius * Math.cbrt(rng());
        splat.positions[i * 3]     = vx * r;
        splat.positions[i * 3 + 1] = vy * r;
        splat.positions[i * 3 + 2] = vz * r;
        splat.colors[i * 3]     = _clamp01(color[0] + (rng() * 2 - 1) * colorJitter);
        splat.colors[i * 3 + 1] = _clamp01(color[1] + (rng() * 2 - 1) * colorJitter);
        splat.colors[i * 3 + 2] = _clamp01(color[2] + (rng() * 2 - 1) * colorJitter);
    }
    splat.bbox = _computeBbox(splat.positions, count);
    return splat;
}

/**
 * Twisted ribbon — N splats along a helix-like ribbon. Each "rung" of
 * the ribbon has `width` splats spread perpendicular to the curve.
 *
 * Visually: a curling, color-graded streamer. Good showcase asset
 * because it reads as obviously synthetic but visually striking.
 */
export function generateRibbon({
    turns = 3, rungs = 80, width = 8, radius = 0.8, height = 1.6,
    palette = [[1, 0.4, 0.7], [0.4, 0.7, 1], [0.6, 1, 0.5]],
    scaleLog = DEFAULT_LOG_SCALE, opacity = DEFAULT_OPACITY,
} = {}) {
    const count = rungs * width;
    const splat = emptySplat(count);
    _setUniformProps(splat, scaleLog, opacity);
    let idx = 0;
    for (let r = 0; r < rungs; r++) {
        const t = r / (rungs - 1);    // 0..1
        const ang = t * turns * Math.PI * 2;
        const cx = Math.cos(ang) * radius;
        const cz = Math.sin(ang) * radius;
        const cy = t * height - height / 2;
        // Tangent direction (used to splay the rung perpendicular to it)
        const tx = -Math.sin(ang) * radius;
        const tz =  Math.cos(ang) * radius;
        const tlen = Math.hypot(tx, tz) || 1;
        // Perpendicular in xz plane
        const px = tz / tlen, pz = -tx / tlen;
        // Color interpolated through palette
        const pSeg = t * (palette.length - 1);
        const pI = Math.min(palette.length - 2, Math.floor(pSeg));
        const pT = pSeg - pI;
        const cR = palette[pI][0] * (1 - pT) + palette[pI + 1][0] * pT;
        const cG = palette[pI][1] * (1 - pT) + palette[pI + 1][1] * pT;
        const cB = palette[pI][2] * (1 - pT) + palette[pI + 1][2] * pT;
        for (let w = 0; w < width; w++) {
            const u = (w / (width - 1)) - 0.5;   // -0.5 .. 0.5
            const span = 0.25;                     // rung half-width
            splat.positions[idx * 3]     = cx + px * u * span * 2;
            splat.positions[idx * 3 + 1] = cy;
            splat.positions[idx * 3 + 2] = cz + pz * u * span * 2;
            splat.colors[idx * 3]     = cR;
            splat.colors[idx * 3 + 1] = cG;
            splat.colors[idx * 3 + 2] = cB;
            idx++;
        }
    }
    splat.bbox = _computeBbox(splat.positions, count);
    return splat;
}

/**
 * Multi-color nebula — several overlapping gaussian clouds in different
 * colors. More chaotic, less geometric than the ribbon.
 */
export function generateNebula({
    count = 3000, radius = 1.2,
    palette = [[1.0, 0.5, 0.3], [0.3, 0.5, 1.0], [0.7, 0.3, 0.9]],
    scaleLog = DEFAULT_LOG_SCALE, opacity = DEFAULT_OPACITY - 1,   // a bit more translucent
    seed = 7,
} = {}) {
    const splat = emptySplat(count);
    _setUniformProps(splat, scaleLog, opacity);
    const rng = _seededRng(seed);
    // Anchor points for each palette cluster, scattered inside the radius
    const anchors = palette.map(() => [
        (rng() * 2 - 1) * radius * 0.6,
        (rng() * 2 - 1) * radius * 0.6,
        (rng() * 2 - 1) * radius * 0.6,
    ]);
    for (let i = 0; i < count; i++) {
        const cluster = i % palette.length;
        const [ax, ay, az] = anchors[cluster];
        // Box-Muller for gaussian offset around the anchor
        const u1 = Math.max(1e-9, rng()), u2 = rng();
        const mag = Math.sqrt(-2 * Math.log(u1)) * radius * 0.3;
        const ang = u2 * 2 * Math.PI;
        const u3 = rng() * 2 - 1;
        const sxz = Math.sqrt(Math.max(0, 1 - u3*u3));
        splat.positions[i * 3]     = ax + mag * sxz * Math.cos(ang);
        splat.positions[i * 3 + 1] = ay + mag * u3;
        splat.positions[i * 3 + 2] = az + mag * sxz * Math.sin(ang);
        const col = palette[cluster];
        const j = 0.08;
        splat.colors[i * 3]     = _clamp01(col[0] + (rng() * 2 - 1) * j);
        splat.colors[i * 3 + 1] = _clamp01(col[1] + (rng() * 2 - 1) * j);
        splat.colors[i * 3 + 2] = _clamp01(col[2] + (rng() * 2 - 1) * j);
    }
    splat.bbox = _computeBbox(splat.positions, count);
    return splat;
}

export const SPLAT_GENERATORS = {
    sphereCloud: generateSphereCloud,
    ribbon:      generateRibbon,
    nebula:      generateNebula,
};

// ---- helpers ---------------------------------------------------------

function _clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
}

function _seededRng(seed) {
    // Mulberry32 — fast deterministic PRNG, good enough for cloud noise
    let s = (seed | 0) || 1;
    return function() {
        s = (s + 0x6D2B79F5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (((t ^ (t >>> 14)) >>> 0) / 4294967296);
    };
}
