// FILE: engine/wndGenerator.js
// VERSION: v1 — round 353
//
// Synthetic 3D wind/fluid fields + the heat ramp used by the renderer
// to color velocity magnitude. Each generator returns the .wnd struct
// shape {width, height, depth, data} ready for encodeWND or direct
// upload to a 3D texture.

const DEFAULT_DIM = 24;

/**
 * Tornado vortex — vertical column with strong rotational flow at
 * mid-height, weakening with distance from the axis.
 */
export function generateTornado({ dim = DEFAULT_DIM, radius = 0.4, intensity = 3.0 } = {}) {
    const W = dim, H = dim, D = dim;
    const data = new Float32Array(W * H * D * 4);
    const cx = W / 2, cy = H / 2, cz = D / 2;
    const maxR = Math.min(W, H, D) * radius;
    for (let z = 0; z < D; z++) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const dx = x - cx, dz = z - cz;
                const r = Math.hypot(dx, dz);
                // Vortex strength peaks at mid-height, fades at top/bottom
                const heightFactor = Math.sin(((y - cy) / cy + 1) * Math.PI / 2);
                // Falls off with radius outside the core
                const radialFalloff = r < maxR
                    ? r / maxR
                    : Math.exp(-(r - maxR) * 0.5);
                // Tangential rotation (perpendicular to radial vector)
                const ang = Math.atan2(dz, dx);
                const swirl = intensity * heightFactor * radialFalloff;
                const u = -Math.sin(ang) * swirl;
                const w =  Math.cos(ang) * swirl;
                // Slight vertical updraft in the core
                const v = (r < maxR * 0.5) ? 0.6 * heightFactor : 0;
                const idx = (z * H * W + y * W + x) * 4;
                data[idx]     = u;
                data[idx + 1] = v;
                data[idx + 2] = w;
                data[idx + 3] = Math.min(1, Math.hypot(u, v, w) / intensity);
            }
        }
    }
    return { width: W, height: H, depth: D, data };
}

/**
 * Jet stream — laminar horizontal flow concentrated in a band at
 * mid-height, with slight north-south variation.
 */
export function generateJetStream({ dim = DEFAULT_DIM, bandHeight = 0.5, intensity = 4.0 } = {}) {
    const W = dim, H = dim, D = dim;
    const data = new Float32Array(W * H * D * 4);
    const yMid = H * bandHeight;
    for (let z = 0; z < D; z++) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                // Gaussian profile around the band height
                const dy = (y - yMid) / (H * 0.15);
                const heightFactor = Math.exp(-dy * dy);
                // Subtle meander with depth so it doesn't look like a flat slab
                const meander = Math.sin(z * 0.6) * 0.3;
                const u = intensity * heightFactor * (1 + meander);
                const v = 0.1 * heightFactor * Math.sin(x * 0.3);   // small ripple
                const w = 0.5 * heightFactor * Math.sin(x * 0.4);
                const idx = (z * H * W + y * W + x) * 4;
                data[idx]     = u;
                data[idx + 1] = v;
                data[idx + 2] = w;
                data[idx + 3] = Math.min(1, Math.hypot(u, v, w) / intensity);
            }
        }
    }
    return { width: W, height: H, depth: D, data };
}

/**
 * Turbulence — multi-octave pseudo-random field. Looks like chaotic
 * atmosphere or a turbulent wake.
 */
export function generateTurbulence({ dim = DEFAULT_DIM, seed = 1337, octaves = 3, intensity = 2.0 } = {}) {
    const W = dim, H = dim, D = dim;
    const data = new Float32Array(W * H * D * 4);
    // Cheap hash-based noise (3D position → 3 components)
    const noise3 = (x, y, z, c) => {
        let h = ((x | 0) * 374761393 ^ (y | 0) * 668265263 ^ (z | 0) * 2147483647 ^ (c | 0) * seed) >>> 0;
        h ^= h << 13; h >>>= 0;
        h ^= h >>> 17; h >>>= 0;
        h ^= h << 5;  h >>>= 0;
        return (h / 0xffffffff) * 2 - 1;
    };
    // Trilinear-like interpolated noise for smoothness
    const smoothNoise = (x, y, z, c) => {
        const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
        const fx = x - x0, fy = y - y0, fz = z - z0;
        // 8 corners
        const c000 = noise3(x0,   y0,   z0,   c);
        const c100 = noise3(x0+1, y0,   z0,   c);
        const c010 = noise3(x0,   y0+1, z0,   c);
        const c110 = noise3(x0+1, y0+1, z0,   c);
        const c001 = noise3(x0,   y0,   z0+1, c);
        const c101 = noise3(x0+1, y0,   z0+1, c);
        const c011 = noise3(x0,   y0+1, z0+1, c);
        const c111 = noise3(x0+1, y0+1, z0+1, c);
        const cx00 = c000 * (1 - fx) + c100 * fx;
        const cx10 = c010 * (1 - fx) + c110 * fx;
        const cx01 = c001 * (1 - fx) + c101 * fx;
        const cx11 = c011 * (1 - fx) + c111 * fx;
        const cxy0 = cx00 * (1 - fy) + cx10 * fy;
        const cxy1 = cx01 * (1 - fy) + cx11 * fy;
        return cxy0 * (1 - fz) + cxy1 * fz;
    };
    for (let z = 0; z < D; z++) {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                let u = 0, v = 0, w = 0;
                let amp = 1, scale = 0.25;
                let totalAmp = 0;
                for (let o = 0; o < octaves; o++) {
                    u += amp * smoothNoise(x * scale, y * scale, z * scale, 1);
                    v += amp * smoothNoise(x * scale, y * scale, z * scale, 2);
                    w += amp * smoothNoise(x * scale, y * scale, z * scale, 3);
                    totalAmp += amp;
                    amp *= 0.5;
                    scale *= 2;
                }
                u = (u / totalAmp) * intensity;
                v = (v / totalAmp) * intensity;
                w = (w / totalAmp) * intensity;
                const idx = (z * H * W + y * W + x) * 4;
                data[idx]     = u;
                data[idx + 1] = v;
                data[idx + 2] = w;
                data[idx + 3] = Math.min(1, Math.hypot(u, v, w) / intensity);
            }
        }
    }
    return { width: W, height: H, depth: D, data };
}

/**
 * Magnitude → color heat ramp (classic weather/scientific visualization).
 * Used by the renderer for the "magnitude" mode and by the demo legend.
 *
 *   0.0   dark blue
 *   0.2   cyan
 *   0.4   green
 *   0.6   yellow
 *   0.8+  red
 */
export function magnitudeToColor(magNorm) {
    const m = Math.max(0, Math.min(1, magNorm));
    if (m < 0.2)      { const t = m / 0.2;          return [0.0,           0.0 + t * 0.7, 0.4 + t * 0.6]; }
    else if (m < 0.4) { const t = (m - 0.2) / 0.2;  return [0.0,           0.7 + t * 0.3, 1.0 - t * 0.7]; }
    else if (m < 0.6) { const t = (m - 0.4) / 0.2;  return [t,             1.0,           0.3 - t * 0.3]; }
    else if (m < 0.8) { const t = (m - 0.6) / 0.2;  return [1.0,           1.0 - t * 0.5, 0.0]; }
    else              { const t = (m - 0.8) / 0.2;  return [1.0,           0.5 - t * 0.5, 0.0]; }
}

export const WND_GENERATORS = {
    tornado:    generateTornado,
    jetStream:  generateJetStream,
    turbulence: generateTurbulence,
};
