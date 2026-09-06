// WebGLEngine/world/buildingGrammar.mjs -- v4509
//
// *** A BUILDING AS DATA: THE CONFIGURATOR'S RULES, SEEDED, WITH NOTHING DRAWN (buildings 2). *** The rules are read from
// VladimirKobranov/configurator-unreal-building (Apache-2.0; one UE5 actor, MyActor.cpp; world/reachedLicences.mjs) and
// hand-written here; nothing copied, and nothing of Unreal's. That actor loops cells on three axes and gives each cell a role
// by its position -- a corner or a wall on the perimeter, an interior slab inside, a roof cap on top -- with first-floor and
// last-floor variants, stairs pieces on one facade at a chosen or seeded column, blank "Brandmauer" (party-wall) modules in
// place of windowed ones and no stairs on a party wall, and accessories wherever a seeded percentage roll falls. Every roll a
// cell might need is drawn BEFORE its branch runs, one fixed list per cell, so a decision about one face never moves the
// variants on another: that is the actor's structure and it is held here as a property (toggle a side's party wall and every
// other side's placements are byte for byte what they were).
//
// Two generalisations, said plainly: the actor has ONE Brandmauer flag (applied to its left and right facades); this grammar
// takes a flag PER SIDE, because buildings 3 derives the flags from which neighbours a building touches. And the actor's
// module arrays are static meshes from a drive link; here a "variant" is an index into a count the caller declares, and
// buildings 3 and 4 decide what an index means (a voxel pattern, a coloured box).
//
// Output: placements, one per cell, { cell: [x, y, z], role, floor, side, facing, variant, blank, accessory, stairs }, and a
// 32-bit hash of the list so a gate can say "same seed, same building" in one number.
"use strict";
import { rng } from "./procPlanet.js";

export const SIDES = Object.freeze(["front", "back", "left", "right"]);
export const ROLES = Object.freeze(["corner", "wall", "interior", "roofCap"]);
export const DEFAULTS = Object.freeze({
    nx: 5, ny: 4, nz: 4, tile: 1,
    brandmauer: Object.freeze({ front: false, back: false, left: false, right: false }),
    stairs: Object.freeze({ side: "front", column: "random" }),       // column: an index along the side, or "random"
    accessories: Object.freeze({ firstFloor: 40, wall: 25, roof: 30 }),   // percentages, as the actor takes them
    variants: Object.freeze({ wall: 3, firstFloor: 2, lastFloor: 2, roofCap: 2, interior: 1, accessory: 3, blank: 2 }),
});
/** the rolls every cell draws, in order, whatever branch runs (the actor's own list, minus the mesh arrays it does not have) */
export const ROLLS_PER_CELL = Object.freeze(["wall", "firstFloor", "lastFloor", "roofCap", "interior", "accessory", "percent", "blankWall", "blankCorner"]);

/** the cells' roles: which sides a perimeter cell faces (a corner faces two), or interior */
export function sidesOf(x, y, nx, ny) {
    const s = [];
    if (y === ny - 1) s.push("front"); if (y === 0) s.push("back");
    if (x === 0) s.push("left"); if (x === nx - 1) s.push("right");
    return s;
}
const FACING = Object.freeze({ front: 0, right: 90, back: 180, left: 270 });

/** the stairs column: given, or seeded into [1, n - 2] along the stairs side, as the actor rolls it */
export function stairsColumn(spec, R) {
    const along = spec.stairs.side === "front" || spec.stairs.side === "back" ? spec.nx : spec.ny;
    if (spec.stairs.column !== "random") return Math.max(0, Math.min(along - 1, spec.stairs.column | 0));
    return 1 + Math.floor(R() * Math.max(1, along - 2));
}

/** FNV-1a over the placements' fields: one number for the whole building */
export function placementHash(placements) {
    let h = 0x811c9dc5;
    const mix = (v) => { const s = String(v); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= 0x7c; h = Math.imul(h, 0x01000193) >>> 0; };
    for (const p of placements) { mix(p.cell.join(",")); mix(p.role); mix(p.floor); mix(p.side); mix(p.facing); mix(p.variant); mix(p.blank ? 1 : 0); mix(p.accessory == null ? "-" : p.accessory); mix(p.stairs || "-"); }
    return h >>> 0;
}

/**
 * The grammar. `seed` and a spec (DEFAULTS' shape, any field overridable). Returns { placements, hash, counts, stairsColumn, spec }.
 */
export function buildingGrammar(seed, overrides = {}) {
    const spec = { ...DEFAULTS, ...overrides, brandmauer: { ...DEFAULTS.brandmauer, ...(overrides.brandmauer || {}) }, stairs: { ...DEFAULTS.stairs, ...(overrides.stairs || {}) }, accessories: { ...DEFAULTS.accessories, ...(overrides.accessories || {}) }, variants: { ...DEFAULTS.variants, ...(overrides.variants || {}) } };
    const { nx, ny, nz } = spec;
    if (!(nx >= 1 && ny >= 1 && nz >= 1)) throw new Error("buildingGrammar: nx, ny, nz must be at least 1");
    if (!SIDES.includes(spec.stairs.side)) throw new Error(`buildingGrammar: stairs.side must be one of ${SIDES.join(", ")}`);
    const R = rng((seed >>> 0) || 1);
    const col = stairsColumn(spec, R);
    const stairsAllowed = !spec.brandmauer[spec.stairs.side];   // the actor removes stairs from a Brandmauer wall
    const placements = [], counts = { cells: 0, corner: 0, wall: 0, interior: 0, roofCap: 0, stairs: 0, accessories: 0, blank: 0, windows: 0 };
    for (let x = 0; x < nx; x++) for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) {
        const roll = {}; for (const k of ROLLS_PER_CELL) roll[k] = R();   // every roll, before any branch
        const floor = z === 0 ? "first" : z === nz - 1 ? "last" : "main";
        const sides = sidesOf(x, y, nx, ny);
        const p = { cell: [x, y, z], role: "interior", floor, side: null, facing: 0, variant: 0, blank: false, accessory: null, stairs: null };
        if (sides.length === 0) {
            if (floor === "last") { p.role = "roofCap"; p.variant = Math.floor(roll.roofCap * spec.variants.roofCap); if (roll.percent * 100 < spec.accessories.roof) p.accessory = Math.floor(roll.accessory * spec.variants.accessory); }
            else { p.role = "interior"; p.variant = Math.floor(roll.interior * spec.variants.interior); }
        } else {
            p.role = sides.length >= 2 ? "corner" : "wall";
            p.side = sides[0]; p.facing = FACING[sides[0]];
            const party = sides.some((s) => spec.brandmauer[s]);
            const v = floor === "first" ? spec.variants.firstFloor : floor === "last" ? spec.variants.lastFloor : spec.variants.wall;
            const r = floor === "first" ? roll.firstFloor : floor === "last" ? roll.lastFloor : roll.wall;
            p.variant = Math.floor(r * v);
            if (party) { p.blank = true; p.variant = Math.floor((p.role === "corner" ? roll.blankCorner : roll.blankWall) * spec.variants.blank); }
            else {
                const pct = floor === "first" ? spec.accessories.firstFloor : spec.accessories.wall;
                if (p.role === "wall" && roll.percent * 100 < pct) p.accessory = Math.floor(roll.accessory * spec.variants.accessory);
            }
            // stairs: the chosen column on the stairs side, a piece per floor, never on a party wall
            const onStairsSide = p.side === spec.stairs.side && p.role === "wall";
            const along = spec.stairs.side === "front" || spec.stairs.side === "back" ? x : y;
            if (stairsAllowed && onStairsSide && along === col) { p.stairs = floor; p.accessory = null; }
        }
        placements.push(p); counts.cells++; counts[p.role]++;
        if (p.stairs) counts.stairs++; if (p.accessory != null) counts.accessories++; if (p.blank) counts.blank++;
        if ((p.role === "wall" || p.role === "corner") && !p.blank) counts.windows++;
    }
    return { placements, hash: placementHash(placements), counts, stairsColumn: col, spec };
}

/** the placements on one side, for a gate or a stamper */
export function onSide(placements, side) { return placements.filter((p) => p.side === side); }
