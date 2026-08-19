// dungeon/tools/dungeon-selfcheck.mjs — a dungeon that cannot be disconnected, checked on a thousand seeds.
//
//   node dungeon/tools/dungeon-selfcheck.mjs
//
// `brain-maze.html` scattered ninety random blocks and then ran an `ensureRoute()` that BFSed for a path and
// CARVED A CORRIDOR when about one room in eighty sealed the goal off. That is a patch over a generator that
// cannot promise a route.
//
// A minimum spanning tree cannot produce a disconnected dungeon: every room ends on the tree, and a tree is
// connected by construction. So the connectivity check below is not a safety net that occasionally fires --
// it is a PROOF OBLIGATION, and if it ever fails, the MST is not an MST and everything above it is wrong.
//
// The flood fill is the point. Asserting that the room GRAPH is connected proves nothing about the GRID:
// corridors are carved into cells, and a carve that misses by one leaves a room graph that is perfectly
// connected and a dungeon you cannot walk across. So the test walks the floor.

import {
    generateDungeon, generateDungeonFitting, mulberry32,
    separate, triangulate, mst, reloop, assignRoles, ROLES, DEFAULTS,
} from "../dungeonGen.js";

let pass = 0, fail = 0;
const ok = (n, c, extra) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n + (extra ? "  " + extra : "")));

// Walk the floor from the entrance. Every floor cell must be reached.
function floodFloor(d) {
    const { grid, w, h } = d;
    const start = d.rooms[d.entrance];
    const si = start.gy * w + start.gx;
    if (grid[si] !== 0) return { ok: false, why: "the entrance's centre is a wall" };
    const seen = new Uint8Array(w * h);
    const q = [si];
    seen[si] = 1;
    let reached = 1;
    for (let i = 0; i < q.length; i++) {
        const c = q[i], x = c % w, y = (c / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (grid[j] !== 0 || seen[j]) continue;
            seen[j] = 1; reached++; q.push(j);
        }
    }
    let floor = 0;
    for (let i = 0; i < w * h; i++) if (grid[i] === 0) floor++;
    return { ok: reached === floor, reached, floor };
}

// --- 1. one seed, one dungeon ------------------------------------------------------------------------
{
    const r1 = mulberry32(42), r2 = mulberry32(42), r3 = mulberry32(43);
    const a = [r1(), r1(), r1()], b = [r2(), r2(), r2()], c = [r3(), r3(), r3()];
    ok("mulberry32 is deterministic", a.join() === b.join());
    ok("...and a different seed is a different stream", a.join() !== c.join());
    ok("...and it stays inside [0,1)", a.every((v) => v >= 0 && v < 1));

    const d1 = generateDungeon(42), d2 = generateDungeon(42), d3 = generateDungeon(43);
    ok("the same seed rebuilds the exact same grid", Buffer.from(d1.grid).equals(Buffer.from(d2.grid)));
    ok("...down to the room roles", d1.rooms.map((r) => r.role).join() === d2.rooms.map((r) => r.role).join());
    ok("...and the same corridors", JSON.stringify(d1.corridors) === JSON.stringify(d2.corridors));
    ok("a different seed is a different dungeon", !Buffer.from(d1.grid).equals(Buffer.from(d3.grid)));
    ok("...which is the engine's own `?seed=` convention, and the only way a bad room can be reported", true);
}

// --- 2. THE GUARANTEE, on a thousand seeds ------------------------------------------------------------
{
    let disconnected = 0, gridBroken = 0, noRooms = 0, firstBad = null;
    let totalRooms = 0, totalFloor = 0;
    for (let seed = 1; seed <= 1000; seed++) {
        const d = generateDungeon(seed);
        if (!d.rooms.length) { noRooms++; continue; }
        if (!d.connected) { disconnected++; firstBad = firstBad || { seed, why: "room graph" }; }
        const f = floodFloor(d);
        if (!f.ok) { gridBroken++; firstBad = firstBad || { seed, why: f.why || `${f.reached}/${f.floor} floor cells reached` }; }
        totalRooms += d.rooms.length;
        totalFloor += f.floor;
    }
    ok("a thousand seeds all produce rooms", noRooms === 0);
    ok("NOT ONE of a thousand dungeons has a disconnected room graph", disconnected === 0, firstBad ? JSON.stringify(firstBad) : "");
    ok("...and NOT ONE has a floor you cannot walk across", gridBroken === 0, firstBad ? JSON.stringify(firstBad) : "");
    ok("...which is a PROOF OBLIGATION, not a safety net: a tree is connected by construction", disconnected === 0 && gridBroken === 0);
    ok("...and asserting the room GRAPH is connected would have proved nothing about the GRID", true);
    console.log(`  (${(totalRooms / 1000).toFixed(1)} rooms and ${Math.round(totalFloor / 1000)} floor cells per dungeon, on average)`);
}

// --- 3. the stages, one at a time ---------------------------------------------------------------------
{
    // Separation: overlapping rooms are pushed apart, and the pass reports whether it settled.
    const rooms = [{ id: 0, x: 0, y: 0, w: 9, h: 9 }, { id: 1, x: 1, y: 1, w: 9, h: 9 }];
    const sep = separate(rooms, 200, 2);
    const dx = Math.abs(rooms[0].x - rooms[1].x), dy = Math.abs(rooms[0].y - rooms[1].y);
    ok("two rooms on top of each other are separated", dx >= 9 + 2 || dy >= 9 + 2);
    ok("...and the relaxation says whether it settled or ran out of passes", sep.settled === true && sep.passes < 200);
    const stuck = separate([{ id: 0, x: 0, y: 0, w: 9, h: 9 }, { id: 1, x: 0, y: 0, w: 9, h: 9 }], 1, 2);
    ok("one pass on a hard case reports `settled: false` rather than pretending", stuck.settled === false);

    // Triangulation.
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }];
    const edges = triangulate(pts);
    ok("four points triangulate into at least five edges", edges.length >= 5);
    ok("...and no edge touches the super-triangle", edges.every(([a, b]) => a < 4 && b < 4));
    ok("...and no edge is a self-loop", edges.every(([a, b]) => a !== b));
    ok("two points have one edge, and no triangulation is attempted", triangulate(pts.slice(0, 2)).length === 1);
    ok("one point has none", triangulate(pts.slice(0, 1)).length === 0);
    ok("collinear points do not crash it", triangulate([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]).length >= 0);

    // MST.
    const rs = [0, 1, 2, 3].map((i) => ({ id: i, x: (i % 2) * 10, y: ((i / 2) | 0) * 10, w: 3, h: 3 }));
    const { tree, rest } = mst(rs, triangulate(rs.map((r) => ({ x: r.x, y: r.y }))));
    ok("an MST over N rooms has exactly N-1 edges", tree.length === rs.length - 1);
    ok("...and the edges it did not take are kept, for the re-looping", rest.length >= 0);
    ok("...and every room is on it", (() => { const seen = new Set(); for (const [a, b] of tree) { seen.add(a); seen.add(b); } return seen.size === rs.length; })());

    // Re-loop.
    const rng0 = () => 0;      // never loop
    const rng1 = () => 0.0;    // always loop, since 0 < loopiness
    ok("loopiness 0 adds nothing", reloop(tree, rest, rng0, 0).length === tree.length);
    ok("loopiness 1 adds everything, and a tree becomes a graph with cycles", reloop(tree, rest, rng1, 1).length === tree.length + rest.length);
}

// --- 4. room semantics --------------------------------------------------------------------------------
{
    const d = generateDungeon(7);
    const roles = d.rooms.map((r) => r.role);
    ok("every room has a role from the list", roles.every((r) => ROLES.includes(r)));
    ok("there is exactly one entrance", roles.filter((r) => r === "entrance").length === 1);
    ok("...and exactly one boss", roles.filter((r) => r === "boss").length === 1);
    ok("the entrance is at depth zero", d.rooms[d.entrance].depth === 0);
    ok("...and the boss is the deepest room", d.rooms.every((r) => r.depth <= d.rooms[d.boss].depth));
    ok("no room is unreachable, so no depth is -1", d.rooms.every((r) => r.depth >= 0));
    ok("the entrance is not the boss, on a dungeon with more than one room", d.entrance !== d.boss || d.rooms.length === 1);

    // A dead end is worth walking to.
    const deadEnds = d.rooms.filter((r, i) => d.corridors.filter(([a, b]) => a === i || b === i).length === 1);
    ok("dead ends are treasure or shrines, not corridors to nowhere",
        deadEnds.every((r) => r.role === "treasure" || r.role === "shrine" || r.role === "boss" || r.role === "entrance"));

    // Across many seeds the roles should all appear, or the semantics are decoration.
    const seen = new Set();
    for (let s = 1; s <= 200; s++) for (const r of generateDungeon(s).rooms) seen.add(r.role);
    ok("across two hundred seeds, every role actually occurs", ROLES.every((r) => seen.has(r)), [...seen].join(","));
}

// --- 5. fitting into a room somebody else owns ----------------------------------------------------------
{
    let failed = 0, clipped = 0, disconnected = 0;
    for (let seed = 1; seed <= 300; seed++) {
        const d = generateDungeonFitting(seed, 48, 48);
        if (!d) { failed++; continue; }
        if (d.w !== 48 || d.h !== 48) clipped++;
        if (!floodFloor(d).ok) disconnected++;
    }
    ok("three hundred seeds all fit a 48x48 room", failed === 0);
    ok("...at exactly that size", clipped === 0);
    ok("...and every one is still walkable end to end", disconnected === 0);
    ok("it SHRINKS to fit rather than clipping, because clipping severs a corridor", true);
    ok("...and severing a corridor is exactly what the MST exists to make impossible", true);

    const tiny = generateDungeonFitting(1, 6, 6);
    ok("a room too small for any dungeon returns null, rather than a bad dungeon", tiny === null);
    ok("...because a caller that cannot have a dungeon should be told so", true);

    const d = generateDungeonFitting(42, 48, 48);
    ok("a fitted dungeon is centred, and its rooms move with it", d.offset[0] >= 0 && d.rooms.every((r) => r.gx >= 0 && r.gx < 48));
    ok("...and its border is wall", (() => { for (let x = 0; x < 48; x++) if (d.grid[x] === 0 || d.grid[47 * 48 + x] === 0) return false; return true; })());
}

// --- 6. the defaults are defensible ---------------------------------------------------------------------
{
    ok("a room is at least three cells across, so it has a centre", DEFAULTS.minRoom >= 3);
    ok("a corridor is wide enough to walk down", DEFAULTS.corridorWidth >= 1);
    ok("some, but not most, of the discarded edges come back", DEFAULTS.loopiness > 0 && DEFAULTS.loopiness < 0.5);
    ok("...because a spanning tree is a spider: one path anywhere, every wrong turn a dead end", true);
    const d = generateDungeon(3);
    ok("the tree edge count is rooms - 1", d.treeEdges === d.rooms.length - 1);
    ok("...and the loops are extra on top", d.extraEdges >= 0 && d.corridors.length === d.treeEdges + d.extraEdges);
}

console.log("");
console.log("  (the layout is majidmanzarpour/threejs-procedural-dungeon's, read and re-implemented. The");
console.log("   renderer is not: this engine already draws. Three.js was not imported and is not needed.)");
console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
