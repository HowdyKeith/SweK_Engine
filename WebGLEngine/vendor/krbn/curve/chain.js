// Greedy nearest-neighbour chaining of a point cloud lying on a smooth curve
// into ordered polylines. Used wherever we sample an implicit curve as a point
// set and need it ordered: quadric ∩ quadric quartics (§2.5) and the torus
// silhouette (§2.3). The gap threshold adapts to the sampling density (median
// nearest-neighbour distance), and a chain is closed when its ends meet.
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** Order a point cloud into one or more polyline chains (closed where the ends meet). */
export function chainPoints(points, opts = {}) {
    const n = points.length;
    if (n < 2)
        return [];
    const gapFactor = opts.gapFactor ?? 5;
    const minPoints = opts.minPoints ?? 3;
    // adaptive gap threshold from the median nearest-neighbour distance
    const nn = [];
    for (let i = 0; i < n; i++) {
        let best = Infinity;
        for (let j = 0; j < n; j++)
            if (j !== i)
                best = Math.min(best, dist(points[i], points[j]));
        nn.push(best);
    }
    const sorted = [...nn].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1;
    const maxGap = gapFactor * median;
    const used = new Array(n).fill(false);
    const nearestUnused = (from) => {
        let best = -1;
        let bestD = maxGap;
        for (let j = 0; j < n; j++) {
            if (used[j])
                continue;
            const d = dist(points[from], points[j]);
            if (d < bestD) {
                bestD = d;
                best = j;
            }
        }
        return best;
    };
    const chains = [];
    for (let start = 0; start < n; start++) {
        if (used[start])
            continue;
        const idx = [start];
        used[start] = true;
        for (let cur = nearestUnused(start); cur >= 0; cur = nearestUnused(idx[idx.length - 1])) {
            idx.push(cur);
            used[cur] = true;
        }
        for (let cur = nearestUnused(start); cur >= 0; cur = nearestUnused(idx[0])) {
            idx.unshift(cur);
            used[cur] = true;
        }
        if (idx.length < minPoints)
            continue;
        const chain = idx.map((k) => points[k]);
        if (dist(chain[0], chain[chain.length - 1]) <= maxGap)
            chain.push(chain[0]); // close the loop
        chains.push(chain);
    }
    return chains;
}
//# sourceMappingURL=chain.js.map