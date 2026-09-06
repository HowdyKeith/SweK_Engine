// WebGLEngine/world/buildingFacade.mjs -- v4510
//
// *** THE FACADE STAMPER: A GRAMMAR'S PLACEMENTS BECOME VOXELS ON A CITYGEN BUILDING (buildings 3). *** world/CityGen.js stamps
// a building as a solid column; this module runs world/buildingGrammar.mjs over that column's footprint and height -- a cell
// ONE voxel wide, a floor three voxels tall -- and turns each windowed wall cell into glass voxels on the face, the stairs
// column's first-floor cell into a two-voxel door opening, and a party-wall face into nothing at all. The PARTY-WALL FLAGS ARE
// DERIVED, NOT ASSERTED: partyWallsOf reads which placed rectangles share a wall (touching along an edge with a positive
// overlap) and sets that side's flag on both, so the Brandmauer rule of the configurator emerges from adjacency and a
// building placed alone has four windowed faces. Everything is a function of the city's seed and the building's index, so
// the seeded-city gate keeps holding one seed to one voxel list.
//
// NOT STAMPED, said plainly: the grammar's accessories (railings, roof caps) and its main- and last-floor stairs pieces -- a
// voxel column has no place to put a railing that is not a new voxel outside the footprint, and the sandbox's hit points are
// the footprint's voxels. Corners are structure and carry no window. Interior cells stay solid.
"use strict";
import { buildingGrammar } from "./buildingGrammar.mjs";

// cellW is 1: a first draft used 2 and a building four voxels deep had nothing but corner cells on its sides, so it got no windows;
// a cell per voxel column makes the four corner columns the only corners, and wall variant 1 is a blank stretch so windows are not wall to wall
export const FACADE = Object.freeze({ cellW: 1, floorH: 3, glass: 5, air: 0 });
export const SIDE_FLAGS = Object.freeze({ front: false, back: false, left: false, right: false });

/** do rects a and b share a wall? returns { a: side of a, b: side of b } or null. front = +z face, back = z0, left = x0, right = +x face */
export function touching(a, b) {
    const xo = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), zo = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
    if (b.x === a.x + a.w && zo > 0) return { a: "right", b: "left" };
    if (a.x === b.x + b.w && zo > 0) return { a: "left", b: "right" };
    if (b.z === a.z + a.d && xo > 0) return { a: "front", b: "back" };
    if (a.z === b.z + b.d && xo > 0) return { a: "back", b: "front" };
    return null;
}

/** one flag set per rect: a side is a party wall when another rect shares it */
export function partyWallsOf(rects) {
    const flags = rects.map(() => ({ ...SIDE_FLAGS }));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const t = touching(rects[i], rects[j]); if (t) { flags[i][t.a] = true; flags[j][t.b] = true; } }
    return flags;
}

/** the grammar spec for a rect: cells of cellW voxels, floors of floorH, the stairs on the front, seeded column */
export function facadeSpecFor(rect, flags = SIDE_FLAGS) {
    return { nx: Math.max(1, Math.ceil(rect.w / FACADE.cellW)), ny: Math.max(1, Math.ceil(rect.d / FACADE.cellW)), nz: Math.max(1, Math.floor(rect.h / FACADE.floorH)), brandmauer: { ...SIDE_FLAGS, ...flags }, stairs: { side: "front", column: "random" } };
}

/** a per-building seed from the city's seed and the building's index (both u32; a different index is a different building) */
export function facadeSeed(citySeed, index) { let h = (citySeed >>> 0) ^ 0x9e3779b9; h = Math.imul(h ^ (index + 1), 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0 || 1; }

/**
 * The voxel overrides for a rect from a grammar result: [{ dx, dy, dz, mat }] relative to the rect's origin, dy from the first
 * voxel above ground. Windows: a wall cell's face voxel at the floor's middle row (variant 0), nothing (variant 1, a blank
 * stretch), or two tall (variant 2). Doors: the stairs column's first-floor face at rows 0 and 1, air. Nothing on a party-wall cell
 * or a corner column.
 */
export function facadeVoxels(rect, grammar) {
    const out = [], { w, d, h } = rect, { cellW, floorH } = FACADE;
    for (const p of grammar.placements) {
        if (p.role !== "wall" || p.blank) continue;
        const [cx, cy, fz] = p.cell, fy = fz * floorH;
        if (fy + 2 >= h) continue;   // the floor must fit the height with a row above the window
        // the face voxel column(s) this cell owns
        let dx = null, dz = null, along;
        if (p.side === "front") { dz = d - 1; along = cx * cellW; }
        else if (p.side === "back") { dz = 0; along = cx * cellW; }
        else if (p.side === "left") { dx = 0; along = cy * cellW; }
        else { dx = w - 1; along = cy * cellW; }
        if (dx === null ? along >= w : along >= d) continue;
        const put = (dy, mat) => out.push(dx === null ? { dx: along, dy, dz, mat } : { dx, dy, dz: along, mat });
        if (p.stairs === "first") { put(fy, FACADE.air); put(fy + 1, FACADE.air); continue; }
        if (p.stairs) continue;   // main and last stairs pieces are not stamped
        if (p.variant === 1) continue;   // a blank stretch of wall
        if (p.variant === 2) { put(fy + 1, FACADE.glass); put(fy + 2, FACADE.glass); }
        else put(fy + 1, FACADE.glass);
    }
    return out;
}

/** run the grammar for a rect and stamp its overrides; returns { grammar, overrides, glass, doors } */
export function stampFacade(world, rect, flags, seed, groundY = 0) {
    const grammar = buildingGrammar(seed, facadeSpecFor(rect, flags));
    const overrides = facadeVoxels(rect, grammar); let glass = 0, doors = 0;
    for (const o of overrides) { world.setVoxel(rect.x + o.dx, groundY + 1 + o.dy, rect.z + o.dz, o.mat); if (o.mat === FACADE.glass) glass++; else doors++; }
    return { grammar, overrides, glass, doors };
}

/** is a voxel offset on the rect's outer face, and on a corner column? */
export function onFace(rect, o) { return o.dx === 0 || o.dx === rect.w - 1 || o.dz === 0 || o.dz === rect.d - 1; }
export function onCornerColumn(rect, o) { return (o.dx === 0 || o.dx === rect.w - 1) && (o.dz === 0 || o.dz === rect.d - 1); }
