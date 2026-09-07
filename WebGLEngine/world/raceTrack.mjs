// WebGLEngine/world/raceTrack.mjs -- Racing city 1 (task 64): the flat grid track
//
// A SEEDED CLOSED TRACK ON A FLAT GRID FROM KENNEY'S TILES, AS DATA, WITH ITS CENTRELINE, KERBS, CHECKPOINTS AND CITY BLOCKS DERIVED.
//
// The grid is `cols` x `rows` cells of TILE (10) units, the racing kit's cell. A track is a SIMPLE CYCLE of cells, each cell 4-adjacent
// to the next and the last to the first, no cell repeated -- so the loop never crosses itself and every cell has exactly two ports.
// The cycle starts as a rectangle ring and grows by seeded BUMPS: two consecutive cells A, B are pushed sideways into two free cells
// A', B' (A -> A' -> B' -> B), refused when A' or B' is out of bounds, in the loop, or would touch a loop cell other than its own
// neighbour (so a bump never merges with another part of the loop). A and B stay side by side after the bump -- that IS a hairpin,
// two tiles whose kerbs meet with the road turning back on itself two cells over, and the first draft's invariant "no two cells
// adjacent unless consecutive" refused every track the generator made (twenty of twenty seeds), which is what a gate measuring the
// wrong invariant looks like from the inside. Every cell then becomes ONE tile: a straight where its two ports are opposite, a
// corner where they are not, and the first straight the finish gate.
//
// ---- THE GRAMMAR IS MEASURED, NOT ASSUMED --------------------------------------------------------------------------------------------
//
// Which edges a tile's asphalt leaves through was read off the vendored models (tools/ship/kenneyKit-selfcheck.mjs's colours: the
// dark [54, 54, 58] vertices): track-straight reaches the -z and +z edges (10 vertices each) and only the kerb's 2 at +-x, so the
// unrotated straight runs NORTH-SOUTH; track-corner reaches -x (6) and +z (6), so the unrotated corner joins WEST to SOUTH, its
// asphalt a quarter disc of radius 8.5 about the tile's (-5, +5) corner and its centreline the arc of radius 5 about that corner
// from the west edge's midpoint (-5, 0) to the south edge's (0, 5). A tile is turned by k quarter turns about +y, the SAME rotation
// litSphere's quat mode applies (yawQuat(k * PI / 2), rotateQ), so the compass rule here is derived by rotating the port vectors
// with rotateQ rather than typed: one quarter turn sends E to N, N to W, W to S, S to E.
//
// Coordinates: x east, z south (the grid's row axis is +z, as the kit's tiles and gpuDriven's camera see it). The grid is centred on
// the origin: cell (cx, cz) has its centre at ((cx + 0.5) * TILE - cols * TILE / 2, (cz + 0.5) * TILE - rows * TILE / 2). The world
// floor is one voxel at y = 0 under the free cells (the sandbox's grass; none under the loop, whose tiles at ROAD_Y = 1 would z-fight
// with it), and CityGen stamps its buildings from groundY = 0 into the free cells, one building per block, inside a margin so a kerb
// never meets a wall.
"use strict";
import { rng } from "./procPlanet.js";
import { KITS, yawQuat } from "./kenneyKit.mjs";
import { rotateQ } from "../render/voxelBodies.mjs";

export const TILE = KITS.racing.cell;                                  // 10
export const ROAD_Y = 1;                                               // the tiles sit on the floor voxel at y = 0
export const FLOOR_ID = 3;                                             // the registry's grass
export const HALF_WIDTH = 4.5;                                         // the kerb's inner line, either side of the centreline
export const CORNER_RADIUS = 5;                                        // the corner's centreline arc, about the tile's corner
export const DIRS = Object.freeze({ N: Object.freeze([0, -1]), E: Object.freeze([1, 0]), S: Object.freeze([0, 1]), W: Object.freeze([-1, 0]) });
export const OPPOSITE = Object.freeze({ N: "S", S: "N", E: "W", W: "E" });
/** The edges each tile's asphalt leaves through UNROTATED, as measured on the vendored models. */
export const PORTS = Object.freeze({ "track-straight.glb": Object.freeze(["N", "S"]), "track-finish.glb": Object.freeze(["N", "S"]), "track-corner.glb": Object.freeze(["W", "S"]) });
export const STRAIGHT = "track-straight.glb", CORNER = "track-corner.glb", FINISH = "track-finish.glb";

/** The direction name of a unit vector (x, z), snapped. */
export function dirName(v) { const ax = Math.abs(v[0]) > Math.abs(v[2] == null ? v[1] : v[2]); const z = v[2] == null ? v[1] : v[2]; return ax ? (v[0] > 0 ? "E" : "W") : (z > 0 ? "S" : "N"); }
/** A direction turned by k quarter turns about +y, through the rotation the shader applies to the tile. */
export function rotDir(d, k) { const v = DIRS[d], r = rotateQ(yawQuat((k % 4) * Math.PI / 2), [v[0], 0, v[1]]); return dirName([r[0], r[2]]); }
/** A tile's ports after k quarter turns. */
export const portsOf = (file, k) => PORTS[file].map((d) => rotDir(d, k));
/** The tile and turn that join two ports, or null. Straights for opposite ports, corners otherwise; the finish is a straight by choice. */
export function tileFor(a, b, { finish = false } = {}) {
    const want = [a, b].sort().join(""), file = OPPOSITE[a] === b ? (finish ? FINISH : STRAIGHT) : CORNER;
    for (let k = 0; k < 4; k++) if (portsOf(file, k).slice().sort().join("") === want) return { file, k };
    return null;
}

/** The world-space centre of a cell. */
export const cellCentre = (track, cx, cz) => [(cx + 0.5) * TILE - track.cols * TILE / 2, (cz + 0.5) * TILE - track.rows * TILE / 2];
const key = (c) => c[0] + "," + c[1];
const adjacent = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/**
 * A seeded closed loop of cells. `bumps` is how many sideways pushes are attempted (each accepted one adds two cells and four
 * corners' worth of turning); `tries` bounds the search. Returns { seed, cols, rows, cells, bumpsAccepted, bumpsTried }.
 */
export function generateTrack({ seed = 1, cols = 12, rows = 12, bumps = 8, tries = 200 } = {}) {
    if (cols < 6 || rows < 6) throw new Error("raceTrack: the grid needs at least 6 x 6 cells for a ring with room to bump");
    const r = rng(seed);
    // the starting ring: two cells in from every edge
    const x0 = 2, z0 = 2, x1 = cols - 3, z1 = rows - 3, cells = [];
    for (let x = x0; x <= x1; x++) cells.push([x, z0]);
    for (let z = z0 + 1; z <= z1; z++) cells.push([x1, z]);
    for (let x = x1 - 1; x >= x0; x--) cells.push([x, z1]);
    for (let z = z1 - 1; z > z0; z--) cells.push([x0, z]);
    const inLoop = new Set(cells.map(key));
    const inside = (c) => c[0] >= 0 && c[1] >= 0 && c[0] < cols && c[1] < rows;
    const touches = (c, allowed) => { let n = 0; for (const d of Object.values(DIRS)) { const q = [c[0] + d[0], c[1] + d[1]]; if (inLoop.has(key(q)) && !allowed.has(key(q))) n++; } return n; };
    let accepted = 0, tried = 0;
    while (accepted < bumps && tried < tries) {
        tried++;
        const i = Math.floor(r() * cells.length), A = cells[i], B = cells[(i + 1) % cells.length];
        const along = [B[0] - A[0], B[1] - A[1]], side = r() < 0.5 ? [along[1], -along[0]] : [-along[1], along[0]];
        const A2 = [A[0] + side[0], A[1] + side[1]], B2 = [B[0] + side[0], B[1] + side[1]];
        if (!inside(A2) || !inside(B2) || inLoop.has(key(A2)) || inLoop.has(key(B2))) continue;
        const allowedA = new Set([key(A)]), allowedB = new Set([key(B)]);
        if (touches(A2, allowedA) || touches(B2, allowedB)) continue;
        cells.splice(i + 1, 0, A2, B2); inLoop.add(key(A2)); inLoop.add(key(B2)); accepted++;
    }
    // start the lap on a straight, so cell 0 can carry the finish gate
    const portsAt = (j) => { const p = cells[(j - 1 + cells.length) % cells.length], n = cells[(j + 1) % cells.length], c = cells[j]; return [dirName([p[0] - c[0], p[1] - c[1]]), dirName([n[0] - c[0], n[1] - c[1]])]; };
    let s = 0; while (s < cells.length && OPPOSITE[portsAt(s)[0]] !== portsAt(s)[1]) s++;
    const rolled = cells.slice(s).concat(cells.slice(0, s));
    return { seed: seed >>> 0, cols, rows, cells: rolled, bumpsAccepted: accepted, bumpsTried: tried };
}

/** The invariants a track must hold: a simple 4-connected cycle, in bounds, at least a ring's worth of cells. Returns [] or the breaches. */
export function validateTrack(track) {
    const out = [], n = track.cells.length, seen = new Set();
    if (n < 8) out.push(`only ${n} cells`);
    for (let i = 0; i < n; i++) {
        const c = track.cells[i], nx = track.cells[(i + 1) % n];
        if (seen.has(key(c))) out.push(`cell ${key(c)} repeats`); seen.add(key(c));
        if (c[0] < 0 || c[1] < 0 || c[0] >= track.cols || c[1] >= track.rows) out.push(`cell ${key(c)} is out of bounds`);
        if (!adjacent(c, nx)) out.push(`cells ${key(c)} and ${key(nx)} are not adjacent`);
    }
    return out;
}

/** The hairpins: pairs of loop cells that are side by side without being consecutive (the road turns back two cells over). */
export function hairpins(track) {
    const n = track.cells.length, out = [];
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (adjacent(track.cells[i], track.cells[j])) out.push([i, j]); }
    return out;
}

/** The ports of every cell (the directions of its two neighbours), in lap order. */
export function cellPorts(track) {
    const n = track.cells.length;
    return track.cells.map((c, i) => { const p = track.cells[(i - 1 + n) % n], q = track.cells[(i + 1) % n]; return { from: dirName([p[0] - c[0], p[1] - c[1]]), to: dirName([q[0] - c[0], q[1] - c[1]]) }; });
}

/** One tile per cell: { file, k, cell, pos, quat, from, to }, cell 0 the finish gate. The shape kenneyKit's kitScene draws. */
export function tilePlacements(track) {
    const ports = cellPorts(track);
    return track.cells.map((c, i) => {
        const t = tileFor(ports[i].from, ports[i].to, { finish: i === 0 });
        if (!t) throw new Error(`raceTrack: no tile joins ${ports[i].from} to ${ports[i].to} at cell ${key(c)}`);
        const [x, z] = cellCentre(track, c[0], c[1]);
        return { file: t.file, k: t.k, cell: c, pos: [x, ROAD_Y, z], scale: 1, quat: yawQuat(t.k * Math.PI / 2), from: ports[i].from, to: ports[i].to };
    });
}

/** The midpoint of a cell's edge in direction d, world space. */
export function edgeMid(track, c, d) { const [x, z] = cellCentre(track, c[0], c[1]); return [x + DIRS[d][0] * TILE / 2, z + DIRS[d][1] * TILE / 2]; }

/**
 * The centreline as [x, z] points in lap order, `perArc` points along each corner's arc (a straight is its two edge midpoints). The
 * corner's arc is CORNER_RADIUS about the tile corner shared by its two port edges, from the entry midpoint to the exit midpoint.
 */
export function centreline(track, { perArc = 6 } = {}) {
    const ports = cellPorts(track), pts = [];
    track.cells.forEach((c, i) => {
        const a = edgeMid(track, c, ports[i].from), b = edgeMid(track, c, ports[i].to);
        if (OPPOSITE[ports[i].from] === ports[i].to) { pts.push(a); return; }
        const [cx, cz] = cellCentre(track, c[0], c[1]);
        const corner = [cx + (DIRS[ports[i].from][0] + DIRS[ports[i].to][0]) * TILE / 2, cz + (DIRS[ports[i].from][1] + DIRS[ports[i].to][1]) * TILE / 2];
        const a0 = Math.atan2(a[1] - corner[1], a[0] - corner[0]); let a1 = Math.atan2(b[1] - corner[1], b[0] - corner[0]);
        if (a1 - a0 > Math.PI) a1 -= 2 * Math.PI; if (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
        for (let s = 0; s < perArc; s++) { const t = s / perArc, ang = a0 + (a1 - a0) * t; pts.push([corner[0] + CORNER_RADIUS * Math.cos(ang), corner[1] + CORNER_RADIUS * Math.sin(ang)]); }
    });
    return pts;
}

/** The lap's length along the centreline (closed). */
export function lapLength(pts) { let L = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } return L; }

/** One checkpoint per cell at its entry edge's midpoint, with the direction of travel: { index, x, z, dir }. Index 0 is the finish line. */
export function checkpoints(track) {
    const ports = cellPorts(track);
    return track.cells.map((c, i) => { const [x, z] = edgeMid(track, c, ports[i].from); return { index: i, x, z, dir: OPPOSITE[ports[i].from], cell: c }; });
}

/** The kerb lines: the centreline offset HALF_WIDTH to each side by the local tangent's normal. { left, right } as [x, z] lists. */
export function kerbs(track, opts) {
    const pts = centreline(track, opts), n = pts.length, left = [], right = [];
    for (let i = 0; i < n; i++) {
        const p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n]; let tx = q[0] - p[0], tz = q[1] - p[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
        left.push([pts[i][0] + tz * HALF_WIDTH, pts[i][1] - tx * HALF_WIDTH]); right.push([pts[i][0] - tz * HALF_WIDTH, pts[i][1] + tx * HALF_WIDTH]);
    }
    return { left, right };
}

/** The cell a world point lies in, or null outside the grid. */
export function cellAt(track, x, z) { const cx = Math.floor((x + track.cols * TILE / 2) / TILE), cz = Math.floor((z + track.rows * TILE / 2) / TILE); return cx >= 0 && cz >= 0 && cx < track.cols && cz < track.rows ? [cx, cz] : null; }
/** Whether a cell carries a tile. */
export function isTrackCell(track, c) { return track.cells.some((t) => t[0] === c[0] && t[1] === c[1]); }
/** The cells the loop leaves free, row-major. */
export function freeCells(track) { const out = []; for (let cz = 0; cz < track.rows; cz++) for (let cx = 0; cx < track.cols; cx++) if (!isTrackCell(track, [cx, cz])) out.push([cx, cz]); return out; }

/**
 * CityGen rects for the free cells: one building per block with probability `fill`, its footprint 3..7 voxels a side and 4..12
 * tall, placed inside the cell with `margin` voxels kept from every edge. Rects are in world voxel coordinates (CityGen's
 * centerX / centerZ left at 0), with `cell` beside each so a gate can hold the placement to the block.
 */
export function cityRects(track, { seed = track.seed, fill = 0.8, margin = 1 } = {}) {
    const r = rng((seed ^ 0x5bd1e995) >>> 0), out = [];
    for (const c of freeCells(track)) {
        if (r() >= fill) continue;
        const w = 3 + Math.floor(r() * 5), d = 3 + Math.floor(r() * 5), h = 4 + Math.floor(r() * 9);
        const room = TILE - 2 * margin, ox = margin + Math.floor(r() * (room - w + 1)), oz = margin + Math.floor(r() * (room - d + 1));
        const [cx, cz] = cellCentre(track, c[0], c[1]);
        out.push({ x: Math.round(cx - TILE / 2) + ox, z: Math.round(cz - TILE / 2) + oz, w, d, h, cell: c });
    }
    return out;
}

/** The floor's extent in voxels: [x0, z0, x1, z1), the whole grid. */
export function floorBounds(track) { return [-track.cols * TILE / 2, -track.rows * TILE / 2, track.cols * TILE / 2, track.rows * TILE / 2]; }

/**
 * The track's voxel world: a one-voxel floor under the grid at y = 0 and CityGen's buildings on the free cells (facades on), in a
 * world the caller supplies (render/voxelDevice.mjs's miniWorld or the sandbox's VoxelWorld: setVoxel and voxelAt). Returns the
 * rects that were stamped and the CityGen instance.
 */
export function trackWorld(track, world, CityGenClass, { seed = track.seed, fill, margin, facades = true } = {}) {
    const [x0, z0, x1, z1] = floorBounds(track);
    // *** NO FLOOR UNDER THE LOOP. *** A tile's asphalt is at its own y = 0, so at ROAD_Y it lies exactly on the floor voxel's top
    // face, and the two z-fight: measured from above, 44 to 46 of seed 1's 184 centreline points came back grass-green on both
    // backends, along the tile seams and the right-hand rows. The floor is laid on the free cells only; under a tile there is
    // nothing but the tile, and the floor's top and the road are the same height (1) where the loop meets the blocks.
    const loop = new Set(track.cells.map(key));
    for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) { const c = cellAt(track, x + 0.5, z + 0.5); if (c && loop.has(key(c))) continue; world.setVoxel(x, 0, z, FLOOR_ID); }
    const rects = cityRects(track, { seed, fill, margin }), city = new CityGenClass(world);
    city.generateFrom(rects.map(({ x, z, w, d, h }) => ({ x, z, w, d, h })), { groundY: 0, seed, facades });
    return { rects, city };
}

/** FNV-1a over the cells, so two tracks from one seed hash the same and a moved cell shows. */
export function trackHash(track) {
    let h = 0x811c9dc5; const mix = (v) => { h ^= v & 0xff; h = Math.imul(h, 0x01000193); };
    mix(track.cols); mix(track.rows); for (const c of track.cells) { mix(c[0]); mix(c[1]); }
    return (h >>> 0).toString(16).padStart(8, "0");
}

/** A one-line description for a HUD. */
export function describeTrack(track) {
    const ports = cellPorts(track), corners = ports.filter((p) => OPPOSITE[p.from] !== p.to).length;
    return `seed ${track.seed}: ${track.cells.length} tiles (${track.cells.length - corners} straight, ${corners} corners) on ${track.cols} x ${track.rows}, ${track.bumpsAccepted} of ${track.bumpsTried} bumps taken, lap ${lapLength(centreline(track)).toFixed(1)} units, hash ${trackHash(track)}`;
}
