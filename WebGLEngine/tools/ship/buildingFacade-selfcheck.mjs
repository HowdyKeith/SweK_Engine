#!/usr/bin/env node
// WebGLEngine/tools/ship/buildingFacade-selfcheck.mjs -- v4510
//
// THE FACADE STAMPER (buildings 3): world/buildingFacade.mjs on world/CityGen.js, headless on a recording world. Section 1: touching
// and partyWallsOf on hand rects (a shared wall with positive overlap on each side; a one-voxel gap is not; a corner-to-corner touch is
// not); facadeSpecFor's cell counts; facadeSeed distinct per index. Section 2, one building: every override sits on a face and never on
// a corner column, the glass count is the window pattern's over the non-blank wall cells that fit the height, the door is two air
// voxels at the stairs column's first floor on the front, a front party wall stamps nothing on the front and no door. Section 3, the
// city: seed 7 stamps the same voxel list twice with facades and a different one without; the hit points equal the standing voxels
// building by building and in total (a door is an opening); the sandbox's percentDestroyed arithmetic sees the same total; facades
// off reproduces the solid stamp exactly. Section 4, adjacency: two rects placed wall to wall get a blank shared face on BOTH with
// glass on their outer faces; the same pair one voxel apart gets glass on all four; a generated city at minGap 0 has touching pairs
// and every shared face is blank. Section 5: the seeding gate's neighbour holds (the loop places buildingCount, not attempts).
//
// MEASURED AT v4510 (a recording world): a 6 x 4 x 9 building from seed 3 gets 20 overrides, 18 glass and 2 door voxels at column 3; seed
// 7's 20 buildings stamp 8,202 voxels of hit points with 2,814 glass and 40 air face voxels, hash faf416da8c3e2b1a twice, against the solid
// stamp's 2ccc123aee1a42da on the same rects; two rects wall to wall carry 0 glass or air on the shared faces and 18 glass outside; a
// city at minGap 0 (seed 11, 40 buildings) has 5 touching pairs, all 5 blank on both sides. Two corrections before green: cells two
// voxels wide left a four-deep building all corners (0 glass on its sides), and CityGen's placement loop counted this.buildings,
// filled after placement now, so it placed 53 for a target of 20.
//
// SABOTAGE (v4510): A  touching accepting a zero overlap (corner-to-corner counts)   -> 1 red: the corner-touch hold, by name.
//                   B  the door stamped on the back face                             -> 3 red: the door hold, the front-party-wall hold (a door
//                                                                                       appears on the back), and the minGap-0 city (a door on a
//                                                                                       shared back face).
//                   C  facadeVoxels ignoring the blank flag                          -> 3 red: the front party wall stamps glass, the wall-to-wall
//                                                                                       pair's shared face carries glass, the minGap-0 city too.
//                   D  maxHp left at w * d * h (doors not subtracted)                -> 2 red: the hit-points hold and the minGap-0 city's total.
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/buildingFacade-selfcheck.mjs      (~2 s)
"use strict";
import { createHash } from "node:crypto";
import { CityGen } from "../../world/CityGen.js";
import { FACADE, touching, partyWallsOf, facadeSpecFor, facadeSeed, facadeVoxels, onFace, onCornerColumn } from "../../world/buildingFacade.mjs";
import { buildingGrammar } from "../../world/buildingGrammar.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
function recorder() { const cells = new Map(), log = []; return { log, cells, setVoxel(x, y, z, m) { cells.set(`${x},${y},${z}`, m); log.push(x, y, z, m); }, voxelAt(x, y, z) { return cells.get(`${x},${y},${z}`) || 0; } }; }
const hashOf = (arr) => createHash("sha256").update(Buffer.from(Int32Array.from(arr).buffer)).digest("hex").slice(0, 16);
const R = (x, z, w, d, h) => ({ x, z, w, d, h });
/** the face voxels of a rect in the world, by side */
function faceCells(world, b, side, groundY = 0) { const out = []; for (let yi = 0; yi < b.h; yi++) { const y = groundY + 1 + yi; if (side === "front" || side === "back") { const z = side === "front" ? b.z + b.d - 1 : b.z; for (let xi = 0; xi < b.w; xi++) out.push(world.voxelAt(b.x + xi, y, z)); } else { const x = side === "left" ? b.x : b.x + b.w - 1; for (let zi = 0; zi < b.d; zi++) out.push(world.voxelAt(x, y, b.z + zi)); } } return out; }
const glassOn = (world, b, side) => faceCells(world, b, side).filter((m) => m === FACADE.glass).length;
const airOn = (world, b, side) => faceCells(world, b, side).filter((m) => m === FACADE.air).length;

sec("1. ADJACENCY AND SPECS, HEADLESS");
{
    const a = R(0, 0, 6, 4, 9);
    ok("touching: a rect whose x starts at a's right edge with z overlap shares a's right and its own left; the mirror shares left and right", JSON.stringify(touching(a, R(6, 1, 5, 4, 9))) === '{"a":"right","b":"left"}' && JSON.stringify(touching(R(6, 1, 5, 4, 9), a)) === '{"a":"left","b":"right"}');
    ok("touching: front and back the same way (+z is the front)", JSON.stringify(touching(a, R(2, 4, 5, 3, 9))) === '{"a":"front","b":"back"}' && JSON.stringify(touching(a, R(2, -3, 5, 3, 9))) === '{"a":"back","b":"front"}');
    ok("a one-voxel gap is not a shared wall, and neither is a corner-to-corner touch (zero overlap)", touching(a, R(7, 0, 5, 4, 9)) === null && touching(a, R(6, 4, 5, 4, 9)) === null && touching(a, R(6, -4, 5, 4, 9)) === null);
    const flags = partyWallsOf([a, R(6, 1, 5, 4, 9), R(20, 20, 3, 3, 3)]);
    ok("partyWallsOf flags both parties and leaves a building alone with four windowed faces", flags[0].right && !flags[0].left && !flags[0].front && flags[1].left && !flags[1].right && Object.values(flags[2]).every((v) => !v));
    const sp = facadeSpecFor(R(0, 0, 7, 4, 10));
    ok("facadeSpecFor: a 7 x 4 x 10 building is 7 x 4 cells and 3 floors (a cell per column, floors of 3), stairs on the front", sp.nx === 7 && sp.ny === 4 && sp.nz === 3 && sp.stairs.side === "front" && facadeSpecFor(R(0, 0, 1, 1, 1)).nz === 1);
    const seeds = new Set(); for (let i = 0; i < 100; i++) seeds.add(facadeSeed(7, i));
    ok("facadeSeed gives 100 buildings 100 different seeds from one city seed, and another city seed another set", seeds.size === 100 && facadeSeed(8, 0) !== facadeSeed(7, 0) && facadeSeed(7, 0) === facadeSeed(7, 0));
}

sec("2. ONE BUILDING'S OVERRIDES");
{
    const rect = R(0, 0, 6, 4, 9), g = buildingGrammar(3, facadeSpecFor(rect)), ov = facadeVoxels(rect, g);
    const glass = ov.filter((o) => o.mat === FACADE.glass), doors = ov.filter((o) => o.mat === FACADE.air);
    let want = 0; for (const p of g.placements) { if (p.role !== "wall" || p.blank || p.stairs) continue; const fy = p.cell[2] * FACADE.floorH; if (fy + 2 >= rect.h) continue; want += p.variant === 1 ? 0 : p.variant === 2 ? 2 : 1; }
    report(`6 x 4 x 9 from seed 3: ${ov.length} overrides, ${glass.length} glass, ${doors.length} door voxels, stairs column ${g.stairsColumn}`);
    ok("every override is on a face and never on a corner column", ov.every((o) => onFace(rect, o) && !onCornerColumn(rect, o)));
    ok("the glass count is the window pattern's over the non-blank wall cells that fit the height (variant 0 one, 1 none, 2 two tall)", glass.length === want && want > 0, `${glass.length} against ${want}`);
    ok(`the door is two air voxels at the stairs column's first floor on the front face (dz = 3, dy 0 and 1, dx = ${g.stairsColumn})`, doors.length === 2 && doors.every((o) => o.dz === 3 && o.dx === g.stairsColumn) && doors.map((o) => o.dy).sort().join() === "0,1");
    const gp = buildingGrammar(3, facadeSpecFor(rect, { front: true })), ovp = facadeVoxels(rect, gp);
    ok("a front party wall stamps nothing on the front face and no door, and the other faces as before", ovp.every((o) => o.dz !== 3) && ovp.filter((o) => o.mat === FACADE.air).length === 0 && ovp.length === ov.filter((o) => o.dz !== 3).length);
}

sec("3. THE CITY");
{
    const mk = (seed, opts = {}) => { const w = recorder(), g = new CityGen(w); const b = g.generate({ radius: 40, buildingCount: 20, seed, ...opts }); return { w, g, b, hash: hashOf(w.log) }; };
    const a = mk(7), b = mk(7), plain = mk(7, { facades: false });
    let glass = 0, air = 0; for (const bb of a.b) for (const side of ["front", "back", "left", "right"]) { glass += glassOn(a.w, bb, side); air += airOn(a.w, bb, side); }
    report(`seed 7 with facades: ${a.b.length} buildings, ${a.g.getTotalBuildingVoxels()} voxels of hit points, ${glass} glass and ${air} air face voxels (office towers are glass throughout); hash ${a.hash}; without facades ${plain.hash}`);
    ok("*** seed 7 with facades stamps the same voxel list twice, and a different one from the solid stamp ***", a.hash === b.hash && a.hash !== plain.hash && a.b.length === 20 && plain.b.length === 20);
    ok("the buildings are the same rects with and without facades (the facade changes voxels, never the placement)", JSON.stringify(a.b.map((x) => [x.x, x.z, x.w, x.d, x.h])) === JSON.stringify(plain.b.map((x) => [x.x, x.z, x.w, x.d, x.h])));
    const perBuilding = a.b.every((bb) => { let n = 0; for (let xi = 0; xi < bb.w; xi++) for (let zi = 0; zi < bb.d; zi++) for (let yi = 0; yi < bb.h; yi++) if (a.w.voxelAt(bb.x + xi, 1 + yi, bb.z + zi) !== 0) n++; return n === bb.maxHp && bb.hp === bb.maxHp; });
    ok("*** the hit points are the voxels that exist, building by building and in total: a door is an opening ***", perBuilding && a.g.getTotalBuildingVoxels() === a.g.countStandingVoxels() && a.b.some((bb) => bb.maxHp < bb.w * bb.d * bb.h));
    ok("without facades the hit points are the full column, as before", plain.b.every((bb) => bb.maxHp === bb.w * bb.d * bb.h) && plain.g.getTotalBuildingVoxels() === plain.g.countStandingVoxels());
    ok("every building records its party flags and its facade (seed, hash, glass, doors, stairs column)", a.b.every((bb) => bb.party && bb.facade && typeof bb.facade.hash === "number" && bb.facade.doors <= 2) && plain.b.every((bb) => bb.party === null && bb.facade === null));
    const isolated = a.b.filter((bb) => Object.values(bb.party).every((v) => !v));
    ok("at the default street gap of 2 no building shares a wall, so every face is windowed where its height allows", isolated.length === a.b.length && a.b.filter((bb) => bb.h >= 3).every((bb) => bb.facade.glass > 0 || bb.mat === 5));
}

sec("4. ADJACENCY ON THE WORLD");
{
    const w = recorder(), g = new CityGen(w); const pair = g.generateFrom([R(0, 0, 6, 4, 9), R(6, 0, 5, 4, 9)], { seed: 3 });
    const shared = glassOn(w, pair[0], "right") + glassOn(w, pair[1], "left") + airOn(w, pair[0], "right") + airOn(w, pair[1], "left");
    const outer = glassOn(w, pair[0], "left") + glassOn(w, pair[1], "right") + glassOn(w, pair[0], "front") + glassOn(w, pair[1], "front");
    report(`wall to wall: ${shared} glass or air on the shared faces, ${outer} glass on the outer faces; flags ${JSON.stringify(pair.map((b) => b.party))}`);
    ok("*** two buildings wall to wall: the shared face is blank on BOTH and their outer faces carry glass ***", shared === 0 && outer > 0 && pair[0].party.right && pair[1].party.left && !pair[0].party.left && !pair[1].party.right);
    const w2 = recorder(), g2 = new CityGen(w2); const apart = g2.generateFrom([R(0, 0, 6, 4, 9), R(7, 0, 5, 4, 9)], { seed: 3 });
    ok("the same pair one voxel apart: no party wall, and glass on the faces that were shared", apart.every((b) => Object.values(b.party).every((v) => !v)) && glassOn(w2, apart[0], "right") + glassOn(w2, apart[1], "left") > 0);
    const w3 = recorder(), g3 = new CityGen(w3); const city = g3.generate({ radius: 40, buildingCount: 40, seed: 11, minGap: 0 });
    let pairs = 0, blankShared = 0; for (let i = 0; i < city.length; i++) for (let j = i + 1; j < city.length; j++) { const t = touching(city[i], city[j]); if (!t) continue; pairs++; if (glassOn(w3, city[i], t.a) + airOn(w3, city[i], t.a) + glassOn(w3, city[j], t.b) + airOn(w3, city[j], t.b) === 0) blankShared++; }
    report(`a city at minGap 0, seed 11: ${city.length} buildings, ${pairs} touching pairs, ${blankShared} with both shared faces blank`);
    ok("a generated city at minGap 0 has touching pairs and every shared face is blank, on both parties", pairs > 0 && blankShared === pairs && g3.getTotalBuildingVoxels() === g3.countStandingVoxels());
}

sec("5. THE NEIGHBOURS");
{
    const w = recorder(), g = new CityGen(w); g.generate({ radius: 40, buildingCount: 12, seed: 5 });
    ok("generate() places buildingCount buildings, not one per attempt (the placement loop counts placements now that buildings are pushed after it)", g.buildings.length === 12);
    ok("unbuild() clears every building voxel it stamped, doors included", (() => { g.unbuild(); return g.buildings.length === 0 && [...w.cells.values()].every((m) => m === 0); })());
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: the grammar's accessories and its main- and last-floor stairs pieces (not stamped: a voxel column has no place for a railing inside its footprint); the look on the sandbox's renderer (glass id 5 draws as the office towers already do); the sandbox's own seed and minGap choices (it passes none yet).");
process.exit(fails ? 1 : 0);
