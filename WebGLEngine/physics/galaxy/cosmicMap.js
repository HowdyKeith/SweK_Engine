// physics/galaxy/cosmicMap.js
//
// A cosmic map for the Endless Sky / EV Nova port -- systems and the hyperspace links between them -- with the verification
// a star map usually lacks. A map is only a picture until you can prove things about it: that every system is REACHABLE
// (the galaxy is one connected piece, no marooned islands), that every jump link is TWO-WAY (a route in is a route back),
// and that a plotted route is the SHORTEST one (minimal jumps, and every hop a real link). Those are graph facts, checked
// with breadth-first search and a component count -- pure integer arithmetic, so the routing is fold-ready, though gated
// for now. The galaxy is generated deterministically so the whole thing is reproducible.

// Deterministic galaxy: n systems on a jittered spiral, each linked to its k nearest neighbours (symmetrically), then any
// separate pieces stitched together so the map is guaranteed connected. Links are stored DIRECTED so symmetry is a fact to
// be checked, not assumed.
export function makeGalaxy(seed, n = 60, k = 3) {
    let s = seed >>> 0; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    const sys = [];
    for (let i = 0; i < n; i++) {
        const arm = i % 3, tt = i / n, ang = tt * 7 + arm * 2.094 + (rnd() - 0.5) * 0.5, rad = 0.15 + tt * 0.85 + (rnd() - 0.5) * 0.08;
        sys.push({ id: i, name: "SYS-" + i, x: Math.cos(ang) * rad, y: Math.sin(ang) * rad });
    }
    const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
    const links = new Set(), add = (a, b) => { if (a !== b) { links.add(a + ">" + b); links.add(b + ">" + a); } };
    for (let i = 0; i < n; i++) {
        const near = sys.map((o) => [o.id, d2(sys[i], o)]).filter((e) => e[0] !== i).sort((p, q) => p[1] - q[1]).slice(0, k);
        for (const [j] of near) add(i, j);
    }
    // stitch components: connect each isolated piece to the nearest system already in the main piece
    const asPairs = () => [...links].map((e) => e.split(">").map(Number));
    let comps = components(n, buildAdj(n, asPairs()));
    while (comps.count > 1) {
        for (let i = 0; i < n; i++) if (comps.label[i] !== comps.biggest) { let best = -1, bd = Infinity; for (let j = 0; j < n; j++) if (comps.label[j] === comps.biggest) { const dd = d2(sys[i], sys[j]); if (dd < bd) { bd = dd; best = j; } } if (best >= 0) add(i, best); }
        comps = components(n, buildAdj(n, asPairs()));
    }
    return { systems: sys, links: asPairs() };
}

// Directed edge list -> adjacency list.
export function buildAdj(n, links) { const adj = Array.from({ length: n }, () => []); for (const [a, b] of links) adj[a].push(b); return adj; }

// Breadth-first distances from a start: the minimal number of jumps to each system (Infinity if unreachable).
export function bfsDistances(adj, start) {
    const dist = new Array(adj.length).fill(Infinity); dist[start] = 0; const q = [start];
    for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of adj[u]) if (dist[v] === Infinity) { dist[v] = dist[u] + 1; q.push(v); } }
    return dist;
}

// Shortest route between two systems: BFS with parent tracking, reconstructed into a path. Null if unreachable.
export function shortestPath(adj, a, b) {
    const prev = new Array(adj.length).fill(-1), seen = new Array(adj.length).fill(false);
    seen[a] = true; const q = [a];
    for (let h = 0; h < q.length; h++) { const u = q[h]; if (u === b) break; for (const v of adj[u]) if (!seen[v]) { seen[v] = true; prev[v] = u; q.push(v); } }
    if (!seen[b]) return null;
    const path = []; for (let u = b; u !== -1; u = prev[u]) path.push(u); path.reverse();
    return path;
}

// Connected components (undirected view): count and per-system label, plus the biggest label.
export function components(n, adj) {
    const label = new Array(n).fill(-1); let count = 0;
    for (let i = 0; i < n; i++) if (label[i] === -1) { const q = [i]; label[i] = count; for (let h = 0; h < q.length; h++) { const u = q[h]; for (const v of adj[u]) if (label[v] === -1) { label[v] = count; q.push(v); } } count++; }
    const sizes = new Array(count).fill(0); for (const l of label) sizes[l]++;
    let biggest = 0; for (let c = 1; c < count; c++) if (sizes[c] > sizes[biggest]) biggest = c;
    return { count, label, biggest, sizes };
}

// Is every directed link matched by its reverse? (Two-way hyperspace.) Returns the count of one-way links.
export function asymmetricLinks(links) {
    const set = new Set(links.map((e) => e[0] + ">" + e[1])); let oneWay = 0;
    for (const [a, b] of links) if (!set.has(b + ">" + a)) oneWay++;
    return oneWay;
}

// Is a path valid -- does every consecutive hop correspond to a real link?
export function isValidPath(adj, path) {
    for (let i = 0; i + 1 < path.length; i++) if (!adj[path[i]].includes(path[i + 1])) return false;
    return path.length > 0;
}
