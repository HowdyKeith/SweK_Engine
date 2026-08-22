// FILE: analysis/CivilizationGPUScanner.js
// VERSION: v2 - HYBRID GPU FILTER + CPU COORD RESOLUTION
//
// GPU heatmap acts as a fast O(size²) "where is recent activity?" filter.
// For each high-strength texel, we cross-reference the CPU memory map to
// find the actual world coords + age + first-observation timestamp.
//
// Why this hybrid: the GPU texture wraps modulo `size` (so world (10,*,10),
// (138,*,10), and (-118,*,10) all hash to texel (10,10)). The GPU alone
// can't recover absolute world coords. CPU memory has them. By indexing
// CPU memory's entries by their texel coord ONCE per scan, then iterating
// only the high-strength texels, we get GPU-fast filtering with full
// metadata.
//
// Same output shape as CivilizationScanner.tick():
//   { x, y, z, score, stability }
// → drop-in replacement when GPU is supported.
//
// Cost vs CPU scanner:
//   - Index build:       O(|CPU memory|)        once per scan
//   - GPU readback:      O(size²)               constant ~256KB
//   - Texel iteration:   O(size²)
//   - Per high-texel:    O(matches) + queryNear O(|CPU memory|)
// Compared to CPU scanner's O(bounds_volume / step³ × |CPU memory|).
// At |CPU memory|=1000+, hybrid is meaningfully faster.

const DEFAULT_THRESHOLD = 0.7;

export class CivilizationGPUScanner {
    constructor(gpuMemory, cpuMemory, opts = {}) {
        this.gpu = gpuMemory;
        this.cpu = cpuMemory;
        this.threshold = opts.threshold ?? DEFAULT_THRESHOLD;

        // Pre-allocated readback buffer to avoid per-scan allocation.
        const len = gpuMemory.size * gpuMemory.size * 4;
        this._buf = new Float32Array(len);

        this.lastCandidates = 0;
        this.lastTexelMatches = 0;
    }

    // Returns null if GPU is unsupported (caller should fall back).
    // Otherwise returns array of { x, y, z, score, stability }.
    scan() {
        if (!this.gpu.supported) return null;

        const size = this.gpu.size;

        // --- 1. Build texel index from CPU memory -------------------
        // Group CPU entries by their wrapped (tx, tz) texel coord.
        const index = new Map();
        for (const entry of this.cpu.memory.values()) {
            const tx = ((entry.x % size) + size) % size;
            const tz = ((entry.z % size) + size) % size;
            const key = tx * size + tz;
            const bucket = index.get(key);
            if (bucket) bucket.push(entry);
            else index.set(key, [entry]);
        }

        // --- 2. Read GPU heatmap ------------------------------------
        const data = this.gpu.readSeeds(this._buf);
        if (!data) return null;       // shouldn't happen if .supported

        // --- 3. Iterate high-strength texels, lift to world coords --
        const candidates = [];
        let matches = 0;
        for (let i = 0; i < data.length; i += 4) {
            const strength = data[i];
            if (strength <= this.threshold) continue;

            const idx = i / 4;
            const tx = idx % size;
            const tz = (idx / size) | 0;
            const key = tx * size + tz;
            const bucket = index.get(key);
            if (!bucket) continue;
            matches++;

            // Each CPU entry at this texel becomes a candidate. The GPU
            // strength is the score (it reflects accumulated recent
            // activity); stability is computed from CPU memory's age
            // data via queryNear — same metric the CPU scanner uses.
            for (const hit of bucket) {
                candidates.push({
                    x: hit.x,
                    y: hit.y,
                    z: hit.z,
                    score: Math.min(1, strength),
                    stability: this._stabilityNear(hit.x, hit.y, hit.z),
                });
            }
        }

        this.lastCandidates = candidates.length;
        this.lastTexelMatches = matches;
        return candidates;
    }

    _stabilityNear(x, y, z) {
        const sample = this.cpu.queryNear(x, y, z, 5);
        if (!sample.length) return 0;
        let totalAge = 0;
        const now = this.cpu.time;
        for (const m of sample) totalAge += now - m.first;
        return Math.min(1, (totalAge / sample.length) / 1000);
    }
}
