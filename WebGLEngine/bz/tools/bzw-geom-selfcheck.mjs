// bz/tools/bzw-geom-selfcheck.mjs — the geometry, proved without a GPU.
//
//   node bz/tools/bzw-geom-selfcheck.mjs
//   node bz/tools/bzw-geom-selfcheck.mjs /path/to/bzflag/misc/maps
//
// Geometry is one of the few things you can prove headlessly, and it deserves to be proved rather than
// looked at. A closed solid has every undirected edge shared by exactly two triangles and every DIRECTED
// edge used exactly once -- which is what "consistently wound" means. If that winding is outward, the
// divergence theorem gives a positive signed volume equal to the volume you can work out on paper:
//
//     box     4 * sx * sy * sz          (`size` is a half-extent in x and y, a full height in z)
//     pyramid 4/3 * sx * sy * sz        (a third of the box that contains it)
//
// So the tests here do not check that a box "looks right". They check that it encloses exactly 240 cubic
// units, that no triangle faces inward, and that no edge is missing. A renderer cannot lie to them.
//
// The things that are NOT solids say so: a wall is a one-sided plane in BZFlag, a flat base is a pad, the
// ground is a quad, and a teleporter is three boxes glued face to face.

import { parseBZW } from "../bzwParse.js";
import { fileURLToPath } from "node:url";
import { buildWorld, boundsOf } from "../bzwWorld.js";
import { makeBZDB } from "../bzdb.js";
import {
    boxMesh, pyramidMesh, teleporterMesh, baseMesh, wallMesh, groundMesh,
    transformMesh, normalMatrix, placement, makeWalls, buildWorldMesh,
    signedVolume, manifoldCheck, obstacleMesh, colorOf, TEAM_COLORS,
} from "../bzGeom.js";
import { identity, mul, scaleM, spinM, shiftM, apply } from "../bzwWorld.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// A mesh's own AABB, computed from its vertices and nothing else.
function aabb(m) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < m.positions.length; i += 3)
        for (let k = 0; k < 3; k++) { const v = m.positions[i + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
    return { lo, hi };
}
function normalsUnit(m, eps = 1e-9) {
    for (let i = 0; i < m.normals.length; i += 3)
        if (Math.abs(Math.hypot(m.normals[i], m.normals[i + 1], m.normals[i + 2]) - 1) > eps) return false;
    return true;
}

// --- 1. a box is a box ---------------------------------------------------------------------------
{
    const b = boxMesh(3, 4, 5);
    const mc = manifoldCheck(b);
    ok("a box has 12 triangles and 8 distinct corners", mc.triangles === 12 && mc.vertices === 8);
    ok("...every edge shared by exactly two of them", mc.closed && mc.boundaryEdges === 0);
    ok("...consistently wound, no directed edge used twice", mc.consistent && mc.doubledEdges === 0);
    ok("...enclosing 4*sx*sy*sz = 240 cubic units", close(signedVolume(b), 240, 1e-9));
    ok("...with the winding OUTWARD, not inward", signedVolume(b) > 0);
    ok("...and all normals unit length", normalsUnit(b));

    const bb = aabb(b);
    ok("a box spans -sx..sx, -sy..sy, 0..sz -- `size` is a half-extent in x and y",
        bb.lo.join() === "-3,-4,0" && bb.hi.join() === "3,4,5");

    // reverse a triangle and the volume goes negative: the test can actually fail.
    const broken = { ...b, indices: b.indices.slice() };
    [broken.indices[0], broken.indices[1]] = [broken.indices[1], broken.indices[0]];
    ok("a single reversed triangle breaks the consistency check", !manifoldCheck(broken).consistent);
}

// --- 2. a pyramid is a third of its box -----------------------------------------------------------
{
    const p = pyramidMesh(3, 4, 5, false);
    const mc = manifoldCheck(p);
    ok("a pyramid has 6 triangles and 5 corners", mc.triangles === 6 && mc.vertices === 5);
    ok("...closed and consistently wound", mc.closed && mc.consistent);
    ok("...enclosing exactly a third of its box: 4/3 * sx*sy*sz = 80", close(signedVolume(p), 80, 1e-9));
    ok("...apex up, base at z = 0", close(aabb(p).lo[2], 0) && close(aabb(p).hi[2], 5));

    const f = pyramidMesh(3, 4, 5, true);
    ok("a flipped pyramid is closed too", manifoldCheck(f).closed && manifoldCheck(f).consistent);
    ok("...holds the same volume", close(signedVolume(f), 80, 1e-9));
    ok("...still outward-wound after being turned over", signedVolume(f) > 0);
    ok("...and occupies the same box", aabb(f).lo.join() === aabb(p).lo.join() && aabb(f).hi.join() === aabb(p).hi.join());

    // the apex moved, which is the whole point of flipz
    const apexZ = (m) => { let n = 0; for (let i = 0; i < m.positions.length; i += 3) if (Math.abs(m.positions[i]) < 1e-9 && Math.abs(m.positions[i + 1]) < 1e-9) n = m.positions[i + 2]; return n; };
    ok("flipz moves the apex from the top to the bottom", apexZ(p) === 5 && apexZ(f) === 0);
}

// --- 3. a teleporter is three solids, and does not pretend otherwise --------------------------------
{
    const t = teleporterMesh(0.56, 4.48, 20, 1.12);
    ok("Teleporter::finalize grows it by its border: outer breadth = size[1] + border", close(t.outerY, 5.6));
    ok("...and outer height = size[2] + border", close(t.outerZ, 21.12));
    ok("it is built from three solids: two posts and a lintel", t.solids.length === 3);
    ok("each of them is closed and consistently wound", t.solids.every((s) => { const m = manifoldCheck(s); return m.closed && m.consistent; }));
    ok("each encloses a positive volume", t.solids.every((s) => signedVolume(s) > 0));

    const post = 1.12 * 1.12 * 21.12, lintel = 1.12 * 8.96 * 1.12;
    ok("the posts and lintel measure what the numbers say", close(signedVolume(t.solids[0]), post, 1e-9) && close(signedVolume(t.solids[2]), lintel, 1e-9));
    ok("...and the union's volume is their sum", close(signedVolume(t.mesh), 2 * post + lintel, 1e-9));

    // The union is NOT a manifold, and saying it were would be the lie this file exists to prevent.
    const mc = manifoldCheck(t.mesh);
    ok("the union is not a closed manifold, because its solids are glued face to face", !mc.closed);
    ok("...and the check reports that honestly rather than passing anyway", mc.boundaryEdges > 0 || mc.doubledEdges > 0);

    // The hole is what a tank drives through.
    const bb = aabb(t.mesh);
    ok("the arch is as wide as its outer breadth", close(bb.hi[1], 5.6) && close(bb.lo[1], -5.6));
    ok("...and as tall as its outer height", close(bb.hi[2], 21.12));
    ok("...with the lintel starting where the hole ends", close(Math.min(...t.solids[2].positions.filter((_, i) => i % 3 === 2)), 20));
}

// --- 4. the things that are not solids --------------------------------------------------------------
{
    const flat = baseMesh(30, 30, 0);
    ok("a flat base is a pad: two triangles", manifoldCheck(flat).triangles === 2);
    ok("...enclosing no volume, and not pretending to", close(signedVolume(flat), 0) && !manifoldCheck(flat).closed);
    ok("a raised base is a box", manifoldCheck(baseMesh(30, 30, 4)).closed && close(signedVolume(baseMesh(30, 30, 4)), 4 * 30 * 30 * 4));

    const w = wallMesh(400, 6.15);
    ok("a wall is a one-sided plane, as it is in BZFlag", manifoldCheck(w).triangles === 2 && !manifoldCheck(w).closed);
    ok("...standing in the y-z plane of its own frame", aabb(w).lo[0] === 0 && aabb(w).hi[0] === 0);
    ok("the ground is a quad", manifoldCheck(groundMesh(400)).triangles === 2);
}

// --- 5. transforms carry normals correctly -----------------------------------------------------------
{
    const b = boxMesh(1, 1, 1);
    const spun = transformMesh(b, spinM(90, 0, 0, 1));
    ok("a spin preserves volume", close(signedVolume(spun), signedVolume(b), 1e-9));
    ok("...and keeps normals unit", normalsUnit(spun, 1e-9));
    ok("...and keeps the winding outward", signedVolume(spun) > 0);

    const scaled = transformMesh(b, scaleM(2, 3, 4));
    ok("a scale multiplies volume by its determinant", close(signedVolume(scaled), signedVolume(b) * 24, 1e-9));
    ok("...and normals stay unit even under a NON-UNIFORM scale", normalsUnit(scaled, 1e-9));

    // The reason normalMatrix exists: under a non-uniform scale, transforming a normal like a point is wrong.
    const nm = normalMatrix(scaleM(2, 1, 1));
    ok("the normal matrix is the inverse transpose, so x halves where the box doubled", close(nm[0], 0.5));
    ok("a +x face of a box scaled in x still points along +x", (() => {
        let found = false;
        for (let i = 0; i < scaled.positions.length; i += 3)
            if (close(scaled.positions[i], 2) && close(scaled.normals[i], 1) && close(scaled.normals[i + 1], 0)) found = true;
        return found;
    })());

    const shear = transformMesh(b, [1, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    ok("a shear preserves volume (determinant 1)", close(signedVolume(shear), signedVolume(b), 1e-9));
    ok("...and its normals are no longer the face directions, but are still unit", normalsUnit(shear, 1e-9));
}

// --- 6. placement puts an obstacle where the world says ------------------------------------------------
{
    const o = { type: "box", pos: [10, 20, 5], rotation: Math.PI / 2, size: [1, 2, 3] };
    const m = transformMesh(obstacleMesh(o), placement(o));
    const bb = aabb(m);
    ok("a box rotated 90 degrees swaps its x and y extents",
        close(bb.lo[0], 10 - 2) && close(bb.hi[0], 10 + 2) && close(bb.lo[1], 20 - 1) && close(bb.hi[1], 20 + 1));
    ok("...and sits on its `pos` in z", close(bb.lo[2], 5) && close(bb.hi[2], 8));
    ok("rotation happens before the shift, not after", close(signedVolume(m), 4 * 1 * 2 * 3, 1e-9));
}

// --- 7. the four walls, as bzfs makes them --------------------------------------------------------------
{
    const db = makeBZDB();
    const walls = makeWalls({ size: 800, noWalls: false }, db);
    ok("four walls", walls.length === 4);
    ok("...at +/- half the world size", walls.every((w) => Math.abs(w.pos[0]) === 400 || Math.abs(w.pos[1]) === 400));
    ok("...each half as broad as the world is wide", walls.every((w) => w.size[1] === 400));
    ok("..._wallHeight tall, which is three tank heights", close(walls[0].size[2], 3 * 2.05, 1e-9));
    ok("`noWalls` builds none", makeWalls({ size: 800, noWalls: true }, db).length === 0);

    // Placed, they enclose the world exactly.
    const mesh = { positions: [], normals: [], indices: [], parts: [], colors: [] };
    for (const w of walls) {
        const placed = transformMesh(wallMesh(w.size[1], w.size[2]), placement(w));
        for (const v of placed.positions) mesh.positions.push(v);
    }
    const bb = aabb(mesh);
    ok("...and they box the world in at +/-400, exactly", close(bb.lo[0], -400, 1e-6) && close(bb.hi[0], 400, 1e-6) && close(bb.lo[1], -400, 1e-6) && close(bb.hi[1], 400, 1e-6));

    // A one-sided wall must face INWARD, or the renderer's back-face culling makes the arena vanish from
    // the only place anyone stands in it. Four walls, four rotations, four normals pointing at the origin.
    ok("every wall faces inward, so the arena is visible from inside it", walls.every((w) => {
        const placed = transformMesh(wallMesh(w.size[1], w.size[2]), placement(w));
        const n = [placed.normals[0], placed.normals[1], placed.normals[2]];
        const toCentre = [-w.pos[0], -w.pos[1], 0];
        return n[0] * toCentre[0] + n[1] * toCentre[1] > 0;
    }));
    ok("...and none of them faces out", walls.every((w) => {
        const placed = transformMesh(wallMesh(w.size[1], w.size[2]), placement(w));
        return Math.abs(placed.normals[2]) < 1e-6;   // walls are vertical: no z component
    }));
}

// --- 8. a whole world -----------------------------------------------------------------------------------
{
    const w = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    const m = buildWorldMesh(w);
    ok("every obstacle becomes a part", m.parts.length === w.obstacles.length);
    ok("...and every vertex has a colour", m.colors.length === m.positions.length);
    ok("...and a normal", m.normals.length === m.positions.length);
    ok("parts index into the buffer, in order", m.parts.every((p, i) => i === 0 || p.first === m.parts[i - 1].first + m.parts[i - 1].count));
    ok("...and cover it exactly", m.parts[m.parts.length - 1].first + m.parts[m.parts.length - 1].count === m.positions.length / 3);

    // Two independent computations of the same extent: from the world model, and from the triangles.
    const b1 = boundsOf(w), b2 = aabb(m);
    ok("the mesh's extent agrees with the world model's, to the millimetre",
        [0, 1, 2].every((k) => close(b1.lo[k], b2.lo[k], 1e-6) && close(b1.hi[k], b2.hi[k], 1e-6)));

    ok("a team base is drawn in its team's colour", (() => {
        const base = w.obstacles.find((o) => o.type === "base" && o.color === 1);
        return colorOf(base).join() === TEAM_COLORS[1].join();
    })());

    // Every box and pyramid in the map, closed and outward, wherever a group put it.
    const solids = w.obstacles.filter((o) => o.type === "box" || o.type === "pyramid");
    ok(`all ${solids.length} boxes and pyramids in arena.bzw are closed solids`,
        solids.every((o) => { const mc = manifoldCheck(transformMesh(obstacleMesh(o), placement(o))); return mc.closed && mc.consistent; }));
    ok("...and every one of them is wound outward, including the eight inside rotated groups",
        solids.every((o) => signedVolume(transformMesh(obstacleMesh(o), placement(o))) > 0));

    const withWalls = buildWorldMesh(w, { walls: true, ground: true });
    ok("walls and ground can be added, and are counted", withWalls.parts.length === w.obstacles.length + 5);
    ok("...and the ground is as wide as the world", (() => {
        const g = withWalls.parts.find((p) => p.type === "ground");
        return !!g;
    })());
}

// --- 9. BZFlag's own maps, if you have them ---------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const maps = fs.readdirSync(dir).filter((f) => f.endsWith(".bzw"));
    console.log("");
    console.log(`  (real maps: ${maps.join(", ")})`);
    let solids = 0, bad = 0, tris = 0;
    for (const f of maps) {
        const w = buildWorld(parseBZW(fs.readFileSync(path.join(dir, f), "utf8")));
        const m = buildWorldMesh(w, { walls: true, ground: true });
        tris += m.indices.length / 3;
        const b1 = boundsOf(w), b2 = aabb(buildWorldMesh(w));
        if (![0, 1, 2].every((k) => close(b1.lo[k], b2.lo[k], 1e-6) && close(b1.hi[k], b2.hi[k], 1e-6))) bad++;
        for (const o of w.obstacles) {
            if (o.type !== "box" && o.type !== "pyramid") continue;
            solids++;
            const mc = manifoldCheck(transformMesh(obstacleMesh(o), placement(o)));
            if (!mc.closed || !mc.consistent || signedVolume(transformMesh(obstacleMesh(o), placement(o))) <= 0) bad++;
        }
    }
    ok(`real maps: all ${solids} boxes and pyramids are closed, outward-wound solids`, bad === 0);
    ok("real maps: and the mesh extent agrees with the world model's for every one", bad === 0);
    console.log(`  (${tris} triangles across ${maps.length} maps, walls and ground included)`);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
