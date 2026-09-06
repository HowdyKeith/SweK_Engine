#!/usr/bin/env node
// WebGLEngine/tools/ship/buildingGrammar-selfcheck.mjs -- v4509
//
// THE BUILDING GRAMMAR (buildings 2): world/buildingGrammar.mjs, the configurator's rules as data, headless. Section 1, the seed:
// one seed one hash twice, another seed another hash, the seed narrowed to u32. Section 2, the counts in closed form for several
// sizes: cells nx ny nz; corners 4 nz; walls (2 nx + 2 ny - 8) nz; roof caps (nx - 2)(ny - 2); interior the rest; stairs nz on
// the stairs side and 0 when that side is a party wall; the stairs column in [1, n - 2] when seeded. Section 3, the faces: a party
// wall's cells are all blank with no accessory and no stairs; every other side's placements are BYTE FOR BYTE what they were
// before the flag (the actor draws every roll before its branch); a given stairs column lands where it says with first, main
// and last pieces. Section 4, the percentages: over 400 seeds the accessory rate on windowed walls sits inside a binomial band of
// the percentage, and 0 and 100 give none and all. Section 5, the refusals by name.
//
// MEASURED AT v4509: seed 7 hashes 4185303142 twice (80 cells, stairs column 1), seed 8 882968280; five sizes match the closed forms
// (5 x 4 x 4: 16 corners, 40 walls, 6 roof caps, 18 interior, 4 stairs; 8 x 2 x 5: 20 / 60 / 0 / 0 / 5; 2 x 2 x 1: four corners and
// nothing else); a seeded column on a 7-wide front reaches every value in [1, 5] over 200 seeds; each party wall blanks its 20 or 16
// cells and moves 0 of the other 60 or 64 placements; the accessory rate over 14,400 windowed wall cells is 25.37% at 25 and 60.67%
// at 60, 0 at 0 and all at 100.
//
// SABOTAGE (v4509): A  the blank rolls drawn only when a branch needs them        -> 3 red: the front, back and left party walls each move 23 / 33 / 34
//                                                                                   of the other placements (the right's cells come last in the loop,
//                                                                                   so nothing after them can move -- a hold on ONE side would have
//                                                                                   been blind; four sides were not).
//                   B  stairs allowed on a party wall                             -> 2 red: the front party wall keeps its stairs, and the vanish hold.
//                   C  the percent roll compared against pct / 100               -> 1 red: the rate hold (25 reads 0.25%, 60 reads 0.6%).
//                   D  sidesOf counting front cells as back too                  -> 6 red: four count holds (28 corners where 16), the back party
//                                                                                   wall blanking 40 cells, and the stairs (their front cells now
//                                                                                   "back" first).
//                   Each restored and the baseline re-run: 0 red.
//
// Run: node tools/ship/buildingGrammar-selfcheck.mjs      (~1 s)
"use strict";
import { buildingGrammar, sidesOf, onSide, placementHash, SIDES, DEFAULTS } from "../../world/buildingGrammar.mjs";

let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const key = (p) => JSON.stringify(p);

sec("1. THE SEED");
{
    const a = buildingGrammar(7), b = buildingGrammar(7), c = buildingGrammar(8);
    report(`seed 7: hash ${a.hash}, ${a.counts.cells} cells, stairs column ${a.stairsColumn}; seed 8: hash ${c.hash}, column ${c.stairsColumn}`);
    ok("*** seed 7 twice is one hash and one placement list, seed 8 another ***", a.hash === b.hash && key(a.placements) === key(b.placements) && a.hash !== c.hash && key(a.placements) !== key(c.placements));
    ok("the hash is over the placements themselves (recomputed it agrees; a changed variant changes it)", placementHash(a.placements) === a.hash && placementHash(a.placements.map((p, i) => i === 3 ? { ...p, variant: p.variant + 1 } : p)) !== a.hash);
    ok("a seed is narrowed to u32 and 0 reads as 1 (rng's own floor)", buildingGrammar(4294967303).hash === buildingGrammar(7).hash && buildingGrammar(0).hash === buildingGrammar(1).hash);
}

sec("2. THE COUNTS IN CLOSED FORM");
{
    for (const [nx, ny, nz] of [[5, 4, 4], [3, 3, 2], [8, 2, 5], [2, 2, 1], [6, 7, 3]]) {
        const g = buildingGrammar(11, { nx, ny, nz, stairs: { side: "front", column: 1 } }), c = g.counts;
        const corners = 4 * nz, walls = (2 * nx + 2 * ny - 8) * nz, roof = Math.max(0, nx - 2) * Math.max(0, ny - 2), interior = nx * ny * nz - corners - walls - roof;
        const stairs = nx >= 3 ? nz : 0;   // column 1 on the front is a wall cell only when the front has an inner cell
        ok(`${nx} x ${ny} x ${nz}: cells ${nx * ny * nz}, corners ${corners}, walls ${walls}, roof caps ${roof}, interior ${interior}, stairs ${stairs}`, c.cells === nx * ny * nz && c.corner === corners && c.wall === walls && c.roofCap === roof && c.interior === interior && c.stairs === stairs, JSON.stringify(c));
    }
    const cols = new Set(); for (let s = 1; s <= 200; s++) cols.add(buildingGrammar(s, { nx: 7 }).stairsColumn);
    ok("a seeded stairs column on a 7-wide front lands in [1, 5] and reaches every value over 200 seeds", [...cols].every((v) => v >= 1 && v <= 5) && cols.size === 5, [...cols].sort().join(","));
    ok("a given column is clamped into the side", buildingGrammar(1, { nx: 5, stairs: { side: "front", column: 9 } }).stairsColumn === 4 && buildingGrammar(1, { nx: 5, stairs: { side: "left", column: 2 } }).stairsColumn === 2);
}

sec("3. THE FACES: party walls, the untouched sides, the stairs");
{
    const base = buildingGrammar(7);
    for (const side of SIDES) {
        const g = buildingGrammar(7, { brandmauer: { [side]: true } }), cells = g.placements.filter((p) => sidesOf(p.cell[0], p.cell[1], 5, 4).includes(side));
        const allBlank = cells.every((p) => p.blank && p.accessory == null && !p.stairs);
        let untouched = 0, moved = 0; g.placements.forEach((p, i) => { if (sidesOf(p.cell[0], p.cell[1], 5, 4).includes(side)) return; if (key(p) === key(base.placements[i])) untouched++; else moved++; });
        ok(`*** a party wall on the ${side}: its ${cells.length} cells all blank with no accessory and no stairs, and the other ${untouched} placements byte for byte what they were (${moved} moved) ***`, allBlank && moved === 0 && cells.length === (side === "front" || side === "back" ? 5 : 4) * 4);
    }
    ok("the stairs vanish when their side is a party wall and stay when another side is", buildingGrammar(7, { brandmauer: { front: true } }).counts.stairs === 0 && buildingGrammar(7, { brandmauer: { back: true } }).counts.stairs === 4);
    const g = buildingGrammar(3, { nx: 6, ny: 4, nz: 5, stairs: { side: "back", column: 2 } }), st = g.placements.filter((p) => p.stairs);
    ok("stairs on the back at column 2: five pieces at x = 2, y = 0, one per floor, first then main then last, no accessory on them", st.length === 5 && st.every((p) => p.cell[0] === 2 && p.cell[1] === 0 && p.side === "back" && p.accessory == null) && st.map((p) => p.stairs).join() === "first,main,main,main,last");
    const left = onSide(base.placements, "left");
    ok("onSide picks the cells that face a side, facing 270 for the left, and corners belong to the front or back first", left.length === 8 && left.every((p) => p.facing === 270 && p.role === "wall") && base.placements.filter((p) => p.role === "corner").every((p) => p.side === "front" || p.side === "back"));
}

sec("4. THE PERCENTAGES");
{
    const rate = (pct, floorKey) => { let n = 0, k = 0; for (let s = 1; s <= 400; s++) { const g = buildingGrammar(s, { accessories: { firstFloor: pct, wall: pct, roof: pct } }); for (const p of g.placements) if (p.role === "wall" && !p.stairs) { n++; if (p.accessory != null) k++; } } return { n, k, r: k / n }; };
    const r25 = rate(25), r60 = rate(60), r0 = rate(0), r100 = rate(100);
    const band = (r, n, p) => Math.abs(r - p) < 4 * Math.sqrt(p * (1 - p) / n);
    report(`accessory rate on ${r25.n} windowed wall cells over 400 seeds: ${(100 * r25.r).toFixed(2)}% at 25, ${(100 * r60.r).toFixed(2)}% at 60, ${(100 * r0.r).toFixed(1)}% at 0, ${(100 * r100.r).toFixed(1)}% at 100`);
    ok("the accessory rate sits inside four binomial sigmas of the percentage at 25 and 60, and 0 and 100 give none and all", band(r25.r, r25.n, 0.25) && band(r60.r, r60.n, 0.6) && r0.k === 0 && r100.k === r100.n);
}

sec("5. THE REFUSALS");
{
    let e1 = null, e2 = null; try { buildingGrammar(1, { nx: 0 }); } catch (e) { e1 = e.message; } try { buildingGrammar(1, { stairs: { side: "roof" } }); } catch (e) { e2 = e.message; }
    ok("a zero size and an unknown stairs side are refused by name", /at least 1/.test(e1 || "") && /stairs\.side/.test(e2 || ""));
    ok("DEFAULTS is frozen and a call with no overrides is the default building", Object.isFrozen(DEFAULTS) && buildingGrammar(7).spec.nx === DEFAULTS.nx);
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: what a variant looks like (buildings 3 stamps, buildings 4 draws); the actor's interior meshes and its transform arithmetic (not taken; a cell here is a cell index); a facade wider than one cell per module.");
process.exit(fails ? 1 : 0);
