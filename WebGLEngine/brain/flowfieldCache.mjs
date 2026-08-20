// brain/flowfieldCache.mjs -- wraps a flow-field solver (the CPU Dijkstra / GPU auto solver, interface
// `async solve(heights, goals, opts) -> {fx,fz,dist}`) in the brain cache. A flow field for a (map, goal-set) is
// computed ONCE and reused; on ES system entry we PREFETCH the fields the pilots will want, so the expensive solve
// happens ahead of the first frame instead of stalling it. In-memory by default (fields are big typed arrays); the
// key is a stable hash of the map dimensions + goal cells.
import { BrainCache, key } from "./brainCache.mjs";

function goalsHash(heights, goals) {
    let h = 2166136261 >>> 0; const mix = (n) => { h ^= (n | 0); h = Math.imul(h, 16777619) >>> 0; };
    mix(heights && heights.length || 0);
    for (const g of (goals || [])) { mix(g.x != null ? g.x : (Array.isArray(g) ? g[0] : 0)); mix(g.z != null ? g.z : (Array.isArray(g) ? g[1] : 0)); }
    return (h >>> 0).toString(36);
}
function makeCachedSolver(solver, opts = {}) {
    const cache = opts.cache || new BrainCache({ max: opts.max || 32, store: opts.store || null });   // fields are big -> memory by default
    const mapId = opts.mapId || "map";
    return {
        cache, mapId,
        async solve(heights, goals, sopts) { const k = key("flow", mapId, goalsHash(heights, goals)); if (cache.has(k)) return cache.get(k); const field = await solver.solve(heights, goals, sopts); cache.put(k, field); return field; },
        // prefetch on system entry: warm each goal-set's field once, so the first pilot request is instant
        async prefetch(heights, goalsList, sopts) { let n = 0; for (const goals of goalsList) { const k = key("flow", mapId, goalsHash(heights, goals)); if (!cache.has(k)) { cache.put(k, await solver.solve(heights, goals, sopts)); n++; } } return n; },
        stats() { return cache.stats(); },
        destroy() { try { solver.destroy && solver.destroy(); } catch (e) {} }
    };
}
export { makeCachedSolver, goalsHash };
