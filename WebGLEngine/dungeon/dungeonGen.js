// WebGLEngine/dungeon/dungeonGen.js — a dungeon that cannot be disconnected.
//
// The algorithm is the one in majidmanzarpour/threejs-procedural-dungeon, read and re-implemented: scatter
// rooms, shove them apart, triangulate their centres, reduce to a minimum spanning tree, put a few edges
// back, carve corridors, then walk the graph from the entrance to give each room a role.
//
// WHAT IS TAKEN AND WHAT IS NOT. The layout is taken. The renderer is not: that project draws with Three.js
// and its own bloom/tilt-shift pipeline, and this engine already has WebGL2, its own post chain, and a GPU
// Brain that navigates voxel walls with flow fields. Importing Three to draw a dungeon we already know how
// to draw would be adding a second engine to solve a solved problem. The layout is a few hundred lines of
// arithmetic and needs nothing.
//
// WHY IT IS WORTH TAKING AT ALL. `brain-maze.html` scatters ninety random blocks and two baffles, and then
// runs an `ensureRoute()` that BFSes for a path and CARVES A CORRIDOR when about one room in eighty seals
// the goal off. That is a patch over a generator that cannot promise a route. A minimum spanning tree over
// the room graph cannot produce a disconnected dungeon: every room is on the tree, and the tree is connected
// by construction. The patch stops being necessary rather than getting better.
//
// AND ONE SEED, ONE DUNGEON. A single `mulberry32` stream is threaded through every stage, so a seed rebuilds
// the exact same map -- which is the engine's own `?seed=` convention, and the only way a bug in a generated
// room can be reported and reproduced.

"use strict";

// --- the one source of randomness ------------------------------------------------------------------------
// mulberry32: thirty-two bits of state, four operations, and a period long enough for a dungeon. It is here
// rather than imported because a generator whose randomness comes from somewhere else is not deterministic,
// it is only deterministic today.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- 1. scatter -------------------------------------------------------------------------------------------
// Rooms in a rough disc, sized from a distribution biased toward small rooms with a few large ones. The bias
// is what makes a dungeon read like a dungeon: a floor of identical boxes reads like a spreadsheet.
function scatter(rng, count, opts) {
    const rooms = [];
    for (let i = 0; i < count; i++) {
        const t = rng();
        // A square-root bias: most rolls land small, a few land large.
        const w = Math.round(opts.minRoom + (opts.maxRoom - opts.minRoom) * Math.pow(t, 2));
        const h = Math.round(opts.minRoom + (opts.maxRoom - opts.minRoom) * Math.pow(rng(), 2));
        const angle = rng() * Math.PI * 2;
        const radius = Math.sqrt(rng()) * opts.spawnRadius;   // sqrt for a UNIFORM disc, not a clumped one
        rooms.push({
            id: i,
            x: Math.round(Math.cos(angle) * radius),
            y: Math.round(Math.sin(angle) * radius),
            w: Math.max(3, w | 1),        // odd, so a room has a centre cell
            h: Math.max(3, h | 1),
        });
    }
    return rooms;
}

// --- 2. separate ------------------------------------------------------------------------------------------
// Overlapping rooms push each other apart until the layout is non-overlapping but still compact. It is a
// relaxation, not a solve: it stops when nothing moved, or when it has tried long enough, and the caller is
// told which.
function separate(rooms, iterations, gap) {
    for (let pass = 0; pass < iterations; pass++) {
        let moved = false;
        for (let i = 0; i < rooms.length; i++) {
            for (let j = i + 1; j < rooms.length; j++) {
                const a = rooms[i], b = rooms[j];
                const dx = b.x - a.x, dy = b.y - a.y;
                const overlapX = (a.w + b.w) / 2 + gap - Math.abs(dx);
                const overlapY = (a.h + b.h) / 2 + gap - Math.abs(dy);
                if (overlapX <= 0 || overlapY <= 0) continue;
                moved = true;
                // Push along the axis of LEAST overlap: the shortest way out is the one that keeps the
                // layout compact.
                if (overlapX < overlapY) {
                    const push = Math.ceil(overlapX / 2) * (dx < 0 ? -1 : 1);
                    a.x -= push; b.x += push;
                } else {
                    const push = Math.ceil(overlapY / 2) * (dy < 0 ? -1 : 1);
                    a.y -= push; b.y += push;
                }
            }
        }
        if (!moved) return { passes: pass + 1, settled: true };
    }
    return { passes: iterations, settled: false };
}

// --- 3. triangulate ---------------------------------------------------------------------------------------
// A Delaunay triangulation of the room centres gives a graph of "rooms that are near each other" without
// anybody choosing a distance threshold. The Bowyer-Watson construction is short and needs no library.
function triangulate(points) {
    if (points.length < 3) {
        const edges = [];
        for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) edges.push([i, j]);
        return edges;
    }
    // A super-triangle large enough to contain every point.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    const dx = maxX - minX || 1, dy = maxY - minY || 1, dmax = Math.max(dx, dy) * 10;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const pts = points.slice();
    const st = pts.length;
    pts.push({ x: midX - dmax, y: midY - dmax }, { x: midX, y: midY + dmax }, { x: midX + dmax, y: midY - dmax });

    const circum = (a, b, c) => {
        const ax = pts[a].x, ay = pts[a].y, bx = pts[b].x, by = pts[b].y, cx = pts[c].x, cy = pts[c].y;
        const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
        if (Math.abs(d) < 1e-12) return null;                       // collinear: no circumcircle
        const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
        const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
        return { x: ux, y: uy, r2: (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy) };
    };

    let tris = [[st, st + 1, st + 2]];
    for (let i = 0; i < st; i++) {
        const bad = [], good = [];
        for (const t of tris) {
            const cc = circum(t[0], t[1], t[2]);
            if (cc && (pts[i].x - cc.x) ** 2 + (pts[i].y - cc.y) ** 2 < cc.r2 - 1e-9) bad.push(t);
            else good.push(t);
        }
        // The boundary of the bad triangles is every edge that only one of them owns.
        const counts = new Map();
        for (const t of bad) for (const e of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
            const k = e[0] < e[1] ? e[0] + ":" + e[1] : e[1] + ":" + e[0];
            counts.set(k, (counts.get(k) || 0) + 1);
        }
        tris = good;
        for (const [k, n] of counts) if (n === 1) { const [a, b] = k.split(":").map(Number); tris.push([a, b, i]); }
    }

    const edges = new Set();
    for (const t of tris) {
        if (t[0] >= st || t[1] >= st || t[2] >= st) continue;        // touches the super-triangle: not ours
        for (const e of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) edges.add(e[0] < e[1] ? e[0] + ":" + e[1] : e[1] + ":" + e[0]);
    }
    return [...edges].map((k) => k.split(":").map(Number));
}

// --- 4. minimum spanning tree ------------------------------------------------------------------------------
// THE GUARANTEE. Kruskal over the triangulation's edges, weighted by centre distance. Every room ends on the
// tree, and a tree is connected by construction, so a dungeon built from one cannot be disconnected. There is
// nothing to carve afterwards and nothing to check.
function mst(rooms, edges) {
    const parent = rooms.map((_, i) => i);
    const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra === rb) return false; parent[ra] = rb; return true; };

    const w = ([a, b]) => Math.hypot(rooms[a].x - rooms[b].x, rooms[a].y - rooms[b].y);
    // Sort by weight, and break ties by index so the same seed gives the same tree on every engine.
    const sorted = edges.slice().sort((p, q) => (w(p) - w(q)) || (p[0] - q[0]) || (p[1] - q[1]));

    const tree = [], rest = [];
    for (const e of sorted) (union(e[0], e[1]) ? tree : rest).push(e);
    return { tree, rest };
}

// --- 5. re-loop --------------------------------------------------------------------------------------------
// A spanning tree is a spider: one path between any two rooms, and every wrong turn is a dead end. Put a few
// of the discarded edges back and the dungeon gets shortcuts and cycles.
function reloop(tree, rest, rng, loopiness) {
    const extra = [];
    for (const e of rest) if (rng() < loopiness) extra.push(e);
    return tree.concat(extra);
}

// --- 6. carve ----------------------------------------------------------------------------------------------
// Rooms and L-shaped corridors into a grid. `0` is floor and `1` is wall, which is what every consumer here
// already expects.
function carve(rooms, corridors, opts) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rooms) {
        minX = Math.min(minX, r.x - (r.w >> 1)); maxX = Math.max(maxX, r.x + (r.w >> 1));
        minY = Math.min(minY, r.y - (r.h >> 1)); maxY = Math.max(maxY, r.y + (r.h >> 1));
    }
    const pad = opts.border;
    const W = (maxX - minX) + 1 + pad * 2, H = (maxY - minY) + 1 + pad * 2;
    const ox = pad - minX, oy = pad - minY;
    const grid = new Uint8Array(W * H).fill(1);
    const at = (x, y) => y * W + x;
    const set = (x, y) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) grid[at(x, y)] = 0; };

    const placed = rooms.map((r) => ({ ...r, gx: r.x + ox, gy: r.y + oy }));
    for (const r of placed) {
        for (let y = r.gy - (r.h >> 1); y <= r.gy + (r.h >> 1); y++)
            for (let x = r.gx - (r.w >> 1); x <= r.gx + (r.w >> 1); x++) set(x, y);
    }
    // An L corridor, horizontal-then-vertical. `width` cells thick, so a tank fits.
    const half = Math.max(0, (opts.corridorWidth - 1) >> 1);
    for (const [a, b] of corridors) {
        const A = placed[a], B = placed[b];
        for (let x = Math.min(A.gx, B.gx); x <= Math.max(A.gx, B.gx); x++)
            for (let k = -half; k <= half; k++) set(x, A.gy + k);
        for (let y = Math.min(A.gy, B.gy); y <= Math.max(A.gy, B.gy); y++)
            for (let k = -half; k <= half; k++) set(B.gx + k, y);
    }
    return { grid, W, H, rooms: placed, at };
}

// --- 7. room semantics ---------------------------------------------------------------------------------------
// A breadth-first walk from the entrance assigns depth, and depth on the critical path becomes a role. It is
// what makes a layout read like a level instead of connected boxes.
const ROLES = ["entrance", "combat", "elite", "treasure", "shrine", "boss"];
function assignRoles(rooms, corridors) {
    const adj = rooms.map(() => []);
    for (const [a, b] of corridors) { adj[a].push(b); adj[b].push(a); }

    // The entrance is the room furthest from the centroid: a dungeon you enter from the middle is a lobby.
    let cx = 0, cy = 0;
    for (const r of rooms) { cx += r.x; cy += r.y; }
    cx /= rooms.length; cy /= rooms.length;
    let entrance = 0, far = -1;
    for (const r of rooms) { const d = Math.hypot(r.x - cx, r.y - cy); if (d > far) { far = d; entrance = r.id; } }

    const depth = rooms.map(() => -1);
    depth[entrance] = 0;
    const q = [entrance];
    for (let i = 0; i < q.length; i++) for (const n of adj[q[i]]) if (depth[n] < 0) { depth[n] = depth[q[i]] + 1; q.push(n); }

    // The boss is the deepest room. Every room is reachable, so no depth is -1 -- and if one were, the MST
    // was not a tree and something above this line is wrong.
    let boss = entrance, deepest = -1;
    for (const r of rooms) if (depth[r.id] > deepest) { deepest = depth[r.id]; boss = r.id; }

    const roles = rooms.map((r) => {
        if (r.id === entrance) return "entrance";
        if (r.id === boss) return "boss";
        const frac = deepest > 0 ? depth[r.id] / deepest : 0;
        const area = r.w * r.h;
        if (adj[r.id].length === 1) return area > 40 ? "treasure" : "shrine";   // a dead end is worth walking to
        if (frac > 0.66) return "elite";
        return "combat";
    });
    return { entrance, boss, depth, roles, adj, unreachable: depth.filter((d) => d < 0).length };
}

// --- the whole thing -----------------------------------------------------------------------------------------
const DEFAULTS = {
    rooms: 14, minRoom: 5, maxRoom: 13, spawnRadius: 18,
    separationPasses: 200, gap: 2, loopiness: 0.15, corridorWidth: 3, border: 3,
};

function generateDungeon(seed, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const rng = mulberry32(seed >>> 0);

    const rooms = scatter(rng, opts.rooms, opts);
    const sep = separate(rooms, opts.separationPasses, opts.gap);
    const edges = triangulate(rooms.map((r) => ({ x: r.x, y: r.y })));
    const { tree, rest } = mst(rooms, edges);
    const corridors = reloop(tree, rest, rng, opts.loopiness);
    const carved = carve(rooms, corridors, opts);
    const sem = assignRoles(carved.rooms, corridors);

    return {
        seed: seed >>> 0, opts,
        grid: carved.grid, w: carved.W, h: carved.H,
        rooms: carved.rooms.map((r, i) => ({ ...r, role: sem.roles[i], depth: sem.depth[i] })),
        corridors, treeEdges: tree.length, extraEdges: corridors.length - tree.length,
        entrance: sem.entrance, boss: sem.boss,
        separation: sep,
        // A tree is connected by construction. This is not a check that can fail; it is a claim the caller
        // may assert, and `dungeon-selfcheck.mjs` does, on a thousand seeds.
        connected: sem.unreachable === 0,
    };
}

// --- fitting it into a room somebody else owns ---------------------------------------------------------------
//
// `brain-maze.html` has a 48x48 grid and will not grow one. The generator's grid size falls out of where the
// rooms landed, so it is asked for a dungeon and then SHRUNK until one fits, rather than being clipped --
// clipping a dungeon can sever a corridor, and severing a corridor is exactly the thing the MST exists to
// make impossible.
//
// It returns null rather than a bad dungeon. A caller that cannot have a dungeon should be told so.
function generateDungeonFitting(seed, W, H, options = {}) {
    let opts = { ...DEFAULTS, ...options };
    for (let attempt = 0; attempt < 8; attempt++) {
        const d = generateDungeon(seed, opts);
        if (d.w <= W && d.h <= H) {
            // Centre it. Everything outside is wall, which is what an unvisited cell already is.
            const grid = new Uint8Array(W * H).fill(1);
            const ox = ((W - d.w) >> 1), oy = ((H - d.h) >> 1);
            for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) grid[(y + oy) * W + (x + ox)] = d.grid[y * d.w + x];
            return {
                ...d, grid, w: W, h: H, offset: [ox, oy],
                rooms: d.rooms.map((r) => ({ ...r, gx: r.gx + ox, gy: r.gy + oy })),
                attempts: attempt + 1,
            };
        }
        // Too big. Fewer rooms and a tighter disc, in that order: rooms first, because a smaller disc with
        // the same room count just makes the separation pass work harder for the same footprint.
        opts = { ...opts, rooms: Math.max(4, Math.round(opts.rooms * 0.85)), spawnRadius: opts.spawnRadius * 0.9, maxRoom: Math.max(opts.minRoom + 2, opts.maxRoom - 1) };
    }
    return null;
}

export {
    generateDungeon, generateDungeonFitting, mulberry32, scatter, separate, triangulate, mst, reloop, carve, assignRoles,
    ROLES, DEFAULTS,
};
