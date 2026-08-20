// bz/tools/bz-mesh-selfcheck.mjs — the mesh family.
//
//   node bz/tools/bz-mesh-selfcheck.mjs
//   node bz/tools/bz-mesh-selfcheck.mjs /path/to/bzflag/misc/maps
//
// Two facts about mesh collision are not what anyone would guess, and both are reproduced rather than
// improved upon:
//
//   * `MeshObstacle::inBox` IGNORES the tank's box. It tests the tank's midpoint and nothing else. The
//     `dx`, `dy` and `angle` it is handed are marked UNUSED in BZFlag's own source. What actually stops a
//     tank is each MeshFace, which is registered as an obstacle in its own right.
//   * `containsPoint` needs an `inside` or an `outside` point to answer at all. With neither, `checkCount
//     <= 0` and it returns false for EVERY point in the universe. A mesh that forgets to declare one is a
//     mesh whose volume contains nothing. That is upstream, and it is asserted here rather than papered
//     over -- because a port that quietly fixes its source is a port you cannot trust about anything else.
//
// The rest is geometry, and geometry can be proved: a mesh cube encloses the volume its vertices say it
// does, its faces are closed and outward-wound, and a tetrahedron is a sixth of the box that contains it.

import { parseBZW } from "../bzwParse.js";
import { fileURLToPath } from "node:url";
import { buildWorld, boundsOf } from "../bzwWorld.js";
import { makeBZDB } from "../bzdb.js";
import { buildMesh, buildTetra, meshContainsPoint, meshTriangles, planeOf, pointInPolygon, rayFace, readFaces } from "../bzMesh.js";
import { meshHit, faceHitBox, obstacleHit } from "../bzCollide.js";
import { signedVolume, manifoldCheck, buildWorldMesh } from "../bzGeom.js";
import { makeTank, stepTank, free } from "../bzTank.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = makeBZDB();
const W = (lines) => buildWorld(parseBZW(lines.join("\n")));

// A unit-ish cube as a `mesh`, with an `inside` point. -10..10 in x and y, 0..8 in z.
const CUBE = [
    "mesh",
    " vertex -10 -10 0", " vertex 10 -10 0", " vertex 10 10 0", " vertex -10 10 0",
    " vertex -10 -10 8", " vertex 10 -10 8", " vertex 10 10 8", " vertex -10 10 8",
    " inside 0 0 4",
    " face", " vertices 4 5 6 7", " endface",
    " face", " vertices 3 2 1 0", " endface",
    " face", " vertices 1 2 6 5", " endface",
    " face", " vertices 3 0 4 7", " endface",
    " face", " vertices 2 3 7 6", " endface",
    " face", " vertices 0 1 5 4", " endface",
    "end",
];

// --- 1. reading a mesh --------------------------------------------------------------------------
{
    const w = W(["world", "size 100", "end", ...CUBE]);
    ok("a mesh parses with no warnings", w.errors.length === 0);
    const m = w.obstacles[0];
    ok("...into one mesh obstacle", w.obstacles.length === 1 && m.type === "mesh" && m.kind === "mesh");
    ok("...with its eight vertices", m.vertices.length === 8);
    ok("...and its six faces", m.faces.length === 6);
    ok("...and its check point", m.checkPoints.length === 1 && m.checkPoints[0].type === "inside");
    ok("every face carries the plane its winding implies", m.faces.every((f) => f.plane && close(Math.hypot(f.plane[0], f.plane[1], f.plane[2]), 1)));
    ok("the top face's normal points up", close(m.faces[0].plane[2], 1));
    ok("...and the bottom face's points down", close(m.faces[1].plane[2], -1));

    // `face` is closed by `endface`, not by `end` -- a line-oriented format has no other way to say it.
    const b = parseBZW(CUBE.join("\n")).blocks[0];
    ok("faces are reassembled from flat lines, bracketed by face/endface", readFaces(b, {}).faces.length === 6);
    ok("an extra `endface` is a warning, not a crash", readFaces(parseBZW(["mesh", " endface", "end"].join("\n")).blocks[0], {}).errors.length === 1);
    ok("a face with fewer than three vertices is dropped, and says so",
        readFaces(parseBZW(["mesh", " face", " vertices 0 1", " endface", "end"].join("\n")).blocks[0], {}).errors.some((e) => /at least 3/.test(e.msg)));
    ok("a face left unclosed is reported", readFaces(parseBZW(["mesh", " face", " vertices 0 1 2", "end"].join("\n")).blocks[0], {}).errors.some((e) => /endface/.test(e.msg)));
    ok("a degenerate face -- every vertex on one line -- is discarded, not given a NaN plane",
        buildMesh(parseBZW(["mesh", " vertex 0 0 0", " vertex 1 0 0", " vertex 2 0 0", " face", " vertices 0 1 2", " endface", "end"].join("\n")).blocks[0], db).faces.length === 0);
}

// --- 2. containsPoint, exactly as BZFlag has it ---------------------------------------------------
{
    const m = W(CUBE).obstacles[0];
    ok("a point in the middle is inside", meshContainsPoint(m, [0, 0, 4]));
    ok("a point above it is not", !meshContainsPoint(m, [0, 0, 20]));
    ok("...nor beside it", !meshContainsPoint(m, [50, 0, 4]));
    ok("...nor below it", !meshContainsPoint(m, [0, 0, -5]));

    // THE RULE THAT SURPRISES: with no check point, a mesh contains nothing at all.
    const noCheck = buildMesh(parseBZW(CUBE.filter((l) => !l.includes("inside")).join("\n")).blocks[0], db);
    ok("a mesh with no `inside` and no `outside` contains NOTHING -- not even its own centre", !meshContainsPoint(noCheck, [0, 0, 4]));
    ok("...and it still has all six faces: it is the volume test that is blind, not the geometry", noCheck.faces.length === 6);

    // An `outside` point works the other way, and `return hasOutsides` is the fallthrough.
    const outsideOnly = buildMesh(parseBZW([...CUBE.slice(0, -1).map((l) => (l.includes("inside") ? " outside 0 0 40" : l)), "end"].join("\n")).blocks[0], db);
    ok("with only an `outside` point, a point the ray reaches unobstructed is outside", !meshContainsPoint(outsideOnly, [0, 0, 40.1]));
    ok("...and one the ray must cross a face to reach is inside", meshContainsPoint(outsideOnly, [0, 0, 4]));
}

// --- 3. the ray and the polygon ---------------------------------------------------------------------
{
    const m = W(CUBE).obstacles[0];
    const top = m.faces[0];
    ok("a ray that reaches a face inside its polygon hits it", rayFace([0, 0, 0], [0, 0, 20], top, m.vertices) > 0);
    ok("...and one that misses the polygon does not", rayFace([50, 50, 0], [0, 0, 20], top, m.vertices) < 0);
    ok("a ray parallel to the plane never meets it", rayFace([0, 0, 8], [1, 0, 0], top, m.vertices) < 0);
    ok("`t` is measured in units of the direction, so 0 < t <= 1 means 'between the two points'",
        rayFace([0, 0, 0], [0, 0, 4], top, m.vertices) < 0 && rayFace([0, 0, 0], [0, 0, 8], top, m.vertices) > 0);
    ok("a point inside a polygon is inside it", pointInPolygon([0, 0, 8], top.v.map((i) => m.vertices[i]), top.plane));
    ok("...and one outside is not", !pointInPolygon([20, 0, 8], top.v.map((i) => m.vertices[i]), top.plane));
    ok("planeOf normalises", close(Math.hypot(...planeOf([[0, 0, 0], [2, 0, 0], [0, 3, 0]]).slice(0, 3)), 1));
}

// --- 4. the geometry is a solid, and can be proved so -------------------------------------------------
{
    const m = W(CUBE).obstacles[0];
    const tri = meshTriangles(m);
    ok("six quads fan-triangulate into twelve triangles", tri.indices.length / 3 === 12);
    const mc = manifoldCheck(tri);
    ok("...forming a closed, consistently wound solid", mc.closed && mc.consistent);
    ok("...enclosing 20 x 20 x 8 = 3200 cubic units", close(signedVolume(tri), 3200, 1e-6));
    ok("...wound outward, not in", signedVolume(tri) > 0);
    ok("a per-face normal is used when the mesh gives none", close(tri.normals[2], 1));

    const t = buildTetra(parseBZW(["tetra", " vertex 0 0 0", " vertex 6 0 0", " vertex 0 6 0", " vertex 0 0 6", "end"].join("\n")).blocks[0], db);
    const tt = meshTriangles(t);
    ok("a tetra is four triangles", tt.indices.length / 3 === 4);
    ok("...closed and outward-wound whatever order its vertices arrived in", manifoldCheck(tt).closed && signedVolume(tt) > 0);
    ok("...enclosing a sixth of the box that contains it: 6*6*6/6 = 36", close(signedVolume(tt), 36, 1e-9));
    ok("...with the centroid as its check point", t.checkPoints.length === 1 && close(t.checkPoints[0].p[0], 1.5));
    ok("a tetra given a reversed vertex order still comes out outward-wound",
        signedVolume(meshTriangles(buildTetra(parseBZW(["tetra", " vertex 0 0 6", " vertex 0 6 0", " vertex 6 0 0", " vertex 0 0 0", "end"].join("\n")).blocks[0], db))) > 0);
    ok("a tetra with three vertices is not built", buildTetra(parseBZW(["tetra", " vertex 0 0 0", " vertex 1 0 0", " vertex 0 1 0", "end"].join("\n")).blocks[0], db) === null);
}

// --- 5. meshbox and meshpyr: the same shapes, a different obstacle ------------------------------------
{
    const w = W(["meshbox", " position 0 0 0", " size 5 5 5", "end", "meshpyr", " position 40 0 0", " size 5 5 9", "end"]);
    const [mb, mp] = w.obstacles;
    ok("a meshbox is a mesh", mb.type === "mesh" && mb.kind === "meshbox");
    ok("...with eight vertices and six faces", mb.vertices.length === 8 && mb.faces.length === 6);
    ok("...enclosing the volume a box of that size would: 4*sx*sy*sz", close(signedVolume(meshTriangles(mb)), 4 * 5 * 5 * 5, 1e-6));
    ok("...and closed", manifoldCheck(meshTriangles(mb)).closed);
    ok("a meshpyr is five faces", mp.faces.length === 5);
    ok("...enclosing a third of its box", close(signedVolume(meshTriangles(mp)), (4 / 3) * 5 * 5 * 9, 1e-6));
    ok("a flipped meshpyr is still outward-wound", signedVolume(meshTriangles(W(["meshpyr", " size 5 5 -9", "end"]).obstacles[0])) > 0);
    ok("...and a negative z size flips it, the same as `flipz`",
        close(signedVolume(meshTriangles(W(["meshpyr", " size 5 5 -9", "end"]).obstacles[0])), signedVolume(meshTriangles(W(["meshpyr", " flipz", " size 5 5 9", "end"]).obstacles[0])), 1e-6));
}

// --- 6. mesh collision: the midpoint, and the faces -----------------------------------------------------
{
    const w = W(["world", "size 100", "end", ...CUBE]);
    const m = w.obstacles[0];
    const [dx, dy, h] = [3, 1.4, 2.05];

    ok("a tank with its midpoint inside the cube collides", meshHit(m, 0, 0, 3, 0, dx, dy, h));
    ok("a tank standing on the roof does not", !meshHit(m, 0, 0, 8.001, 0, dx, dy, h));
    ok("a tank against the west face collides -- by that FACE, not by the volume test",
        meshHit(m, -12, 0, 0, 0, dx, dy, h) && !meshContainsPoint(m, [-12, 0, 0 + h / 2]));
    ok("...and one a metre further out does not", !meshHit(m, -14, 0, 0, 0, dx, dy, h));

    // THE RULE THAT SURPRISES, again: the volume test is blind to the tank's box. Only the faces see it.
    const noCheck = buildMesh(parseBZW(CUBE.filter((l) => !l.includes("inside")).join("\n")).blocks[0], db);
    ok("a mesh with no check point still stops a tank at its walls", meshHit(noCheck, -12, 0, 0, 0, dx, dy, h));
    ok("...but a tank dropped into the middle of it is not colliding with anything",
        !meshHit(noCheck, 0, 0, 3, 0, dx, dy, h) && meshHit(m, 0, 0, 3, 0, dx, dy, h));

    // A face may be drivethrough while the mesh is not.
    const oneOpen = buildMesh(parseBZW([
        ...CUBE.slice(0, -1).map((l) => l), "end",
    ].join("\n").replace(" face\n vertices 3 0 4 7\n endface", " face\n vertices 3 0 4 7\n drivethrough\n endface")).blocks[0], db);
    ok("`drivethrough` on one face opens that wall alone",
        !faceHitBox(oneOpen, oneOpen.faces.find((f) => f.driveThrough), -12, 0, 0, 0, dx, dy, h));
    ok("...while the others still stop you", meshHit(oneOpen, 12, 0, 0, 0, dx, dy, h));

    ok("a `drivethrough` mesh is not an obstacle at all", !obstacleHit({ ...m, driveThrough: true }, 0, 0, 3, 0, dx, dy, h));
}

// --- 7. a tank drives on a mesh ---------------------------------------------------------------------------
{
    const world = W(["world", "size 100", "end", ...CUBE]);
    const t = makeTank(db, { pos: [-60, 0, 0], angle: 0 });
    let blocked = null;
    for (let i = 0; i < 400; i++) { const r = stepTank(t, { forward: 1 }, world, 1 / 60); if (r.blocked) blocked = r.blocked; }
    ok("a tank driving at a mesh cube stops against it", blocked && blocked.type === "mesh");
    ok("...at its west face, minus half a tank length", t.pos[0] < -13 && t.pos[0] > -13.5);
    ok("...and never inside it", !!free(world, t, t.pos[0], t.pos[1], t.pos[2], t.angle));

    // Jump on top and stand there.
    const j = makeTank(db, { pos: [-14, 0, 0], angle: 0 });
    stepTank(j, { jump: true }, world, 1 / 60);
    let landedOn = null;
    for (let i = 0; i < 600; i++) {
        const over = j.pos[2] > 8.3 && j.pos[0] < -3;
        const r = stepTank(j, { forward: over ? 1 : 0 }, world, 1 / 60);
        if (r.landed) { landedOn = j.pos[2]; break; }
    }
    ok("a tank can jump onto a mesh cube", close(landedOn, 8, 1e-2));
    ok("...and stand on it without being inside it", j.onGround && !!free(world, j, j.pos[0], j.pos[1], j.pos[2], j.angle));

    // A hundred seconds of driving about, and never inside anything.
    const world2 = W(["world", "size 200", "end", ...CUBE,
        "tetra", " vertex 60 -10 0", " vertex 80 -10 0", " vertex 70 10 0", " vertex 70 0 14", "end",
        "meshbox", " position -60 60 0", " size 10 10 6", " rotation 30", "end",
        "meshpyr", " position 60 60 0", " size 10 10 12", "end"]);
    const r = makeTank(db, { pos: [-150, -150, 0], angle: 0 });
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let inside = 0;
    for (let i = 0; i < 6000; i++) {
        stepTank(r, { forward: 1, turn: (rnd() - 0.5) * 2, jump: rnd() < 0.002 }, world2, 1 / 60);
        if (!free(world2, r, r.pos[0], r.pos[1], r.pos[2], r.angle)) inside++;
    }
    ok("100 seconds of driving among a mesh, a tetra, a meshbox and a meshpyr, never inside one", inside === 0);
    ok("...and never below the floor", r.pos[2] >= -1e-9);
}

// --- 8. a mesh in a group ---------------------------------------------------------------------------------
{
    // A mesh's vertices go into world space at build time, so a group's transform -- even a shear -- is
    // exact for a mesh. It never needs the `approx` flag a box does.
    const g = W(["define blk", ...CUBE, "enddef", "group blk", " shift 100 0 0", "end"]);
    ok("a grouped mesh's vertices are in world space", close(g.obstacles[0].vertices[0][0], 90));
    ok("...and it carries no transform", !g.obstacles[0].transform);
    ok("...so it is never approximate", g.approx === 0 && !g.obstacles[0].approx);
    ok("...and it collides where it is drawn", meshHit(g.obstacles[0], 100, 0, 3, 0, 3, 1.4, 2.05));

    const sheared = W(["define blk", ...CUBE, "enddef", "group blk", " shear 0.5 0 0", "end"]);
    ok("even a SHEARED mesh is exact, where a sheared box is not", sheared.approx === 0);
    ok("...its vertices really are sheared", !close(sheared.obstacles[0].vertices[0][0], -10));

    const b = boundsOf(g);
    ok("a mesh's bounds come from its own vertices", close(b.lo[0], 90) && close(b.hi[0], 110) && close(b.hi[2], 8));
}

// --- 9. the whole world, drawn -------------------------------------------------------------------------------
{
    const w = W(["world", "size 100", "end", ...CUBE, "box", " position 40 0 0", " size 5 5 5", "end"]);
    const mesh = buildWorldMesh(w, { walls: true, ground: true });
    ok("a mesh obstacle becomes a part of the world mesh", mesh.parts.some((p) => p.type === "mesh"));
    ok("...and the box beside it too", mesh.parts.some((p) => p.type === "box"));
    ok("every vertex has a colour and a normal", mesh.colors.length === mesh.positions.length && mesh.normals.length === mesh.positions.length);
    ok("the parts cover the buffer exactly",
        mesh.parts[mesh.parts.length - 1].first + mesh.parts[mesh.parts.length - 1].count === mesh.positions.length / 3);

    // A mesh is already in world space: placing it again would move it twice.
    const b1 = boundsOf(w);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < mesh.positions.length; i += 3) { if (mesh.positions[i] < lo) lo = mesh.positions[i]; if (mesh.positions[i] > hi) hi = mesh.positions[i]; }
    ok("a mesh is drawn exactly where the world model says it is, not twice-transformed", lo <= b1.lo[0] + 1e-6 && hi >= b1.hi[0] - 1e-6);
}

// --- 10. BZFlag's own maps, if you have them ----------------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const maps = fs.readdirSync(dir).filter((f) => f.endsWith(".bzw"));
    console.log("");
    console.log(`  (real maps: ${maps.join(", ")})`);
    let meshes = 0, faces = 0, threw = 0, stillIgnored = new Map();
    for (const f of maps) {
        let w;
        try { w = buildWorld(parseBZW(fs.readFileSync(path.join(dir, f), "utf8"))); } catch (e) { threw++; continue; }
        for (const o of w.obstacles) if (o.type === "mesh") { meshes++; faces += o.faces.length; }
        for (const i of w.ignored) stillIgnored.set(i.type, (stillIgnored.get(i.type) || 0) + 1);
    }
    ok("real maps: all build without throwing", threw === 0);
    console.log(`  (${meshes} mesh obstacles, ${faces} faces; still ignored: ${stillIgnored.size ? [...stillIgnored].map(([k, v]) => k + " " + v).join(", ") : "nothing"})`);
    ok("real maps: `mesh` is no longer among the ignored", !stillIgnored.has("mesh"));
}

// --- 11. arena.bzw, which is ours ----------------------------------------------------------------------------
{
    const arena = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    ok("arena.bzw carries one of each of the mesh family",
        ["mesh", "tetra", "meshbox", "meshpyr"].every((k) => arena.obstacles.some((o) => o.kind === k)));
    ok("...with no warnings and nothing ignored", arena.errors.length === 0 && arena.ignored.length === 0);
    ok("...and none of them approximate", arena.approx === 0);

    const bunker = arena.obstacles.find((o) => o.kind === "mesh");
    ok("the bunker's north face alone is drivethrough", bunker.faces.filter((f) => f.driveThrough).length === 1);
    // The tank is 2.8 wide, so at y = -11 its side reaches the wall at y = -10; at y = +11 it reaches the
    // drivethrough face at y = +10. One stops it; the other does not.
    ok("...so a tank can drive in through it", !faceHitBox(bunker, bunker.faces.find((f) => f.driveThrough), -100, 11, 0, 0, 3, 1.4, 2.05));
    ok("...and not through the wall opposite", meshHit(bunker, -100, -11, 0, 0, 3, 1.4, 2.05));

    const tri = meshTriangles(bunker);
    ok("the bunker encloses 20 x 20 x 7 = 2800 cubic units", close(signedVolume(tri), 2800, 1e-6));
    ok("...and is a closed solid, drivethrough face or not", manifoldCheck(tri).closed && manifoldCheck(tri).consistent);

    // 100 seconds of driving around the real map, meshes and all.
    const t = makeTank(db, { pos: [-160, -160, 0], angle: 0 });
    let seed = 11;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let inside = 0;
    for (let i = 0; i < 6000; i++) {
        stepTank(t, { forward: 1, turn: (rnd() - 0.5) * 2, jump: rnd() < 0.002 }, arena, 1 / 60);
        if (!free(arena, t, t.pos[0], t.pos[1], t.pos[2], t.angle)) inside++;
    }
    ok("100 seconds of driving around arena.bzw, meshes and all, never inside anything", inside === 0);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
