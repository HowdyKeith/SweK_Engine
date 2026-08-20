// bz/tools/bz-shapes-selfcheck.mjs — the round ones, and what they are made of.
//
//   node bz/tools/bz-shapes-selfcheck.mjs
//
// Rounds seven and eight. The last three object types, and the last five keywords.
//
// The vertices are BZFlag's, exactly. The triangulation is ours, and equivalent -- upstream lays out its
// sphere faces with a page of index arithmetic, and the surface it describes is the surface these vertices
// describe. A mesh collides and contains by its surface, so what is proved here is what MATTERS rather than
// what was typed:
//
//     a sphere with `divisions 1` IS an octahedron, and encloses exactly (4/3)*a*b*c
//     a hemisphere with `divisions 1` is a pyramid on a square base: exactly (2/3)*a*b*c
//     an N-sided cone encloses exactly (1/3) * (1/2)*N*sin(2pi/N) * a*b * h
//     an N-sided full pie is a cylinder: (1/2)*N*sin(2pi/N) * a*b * h
//     an N-sided ring is the difference of two of those
//     `8 * divisions^2` faces, which is BZFlag's own count
//
// Nine decimal places, not "about". And the volume rises monotonically toward (4/3)*pi*a*b*c as `divisions`
// grows, which is the only sense in which a polyhedron is a sphere.

import { parseBZW } from "../bzwParse.js";
import { fileURLToPath } from "node:url";
import { buildWorld, boundsOf } from "../bzwWorld.js";
import { makeBZDB } from "../bzdb.js";
import { meshTriangles, meshContainsPoint } from "../bzMesh.js";
import { signedVolume, manifoldCheck, buildWorldMesh, colorOf } from "../bzGeom.js";
import { buildMaterials, buildTransforms, buildFamily, readMaterial, defaultMaterial, matrefOf, colorOfMaterial } from "../bzMaterial.js";
import { normalizeSweep } from "../bzShapes.js";
import { HANDLED, RECORDED, coverageReport } from "../bzCoverage.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const W = (lines) => buildWorld(parseBZW(lines.join("\n")));
const one = (lines) => W(lines).obstacles[0];
const vol = (o) => signedVolume(meshTriangles(o));
const solid = (o) => { const m = manifoldCheck(meshTriangles(o)); return m.closed && m.consistent && vol(o) > 0; };
// The area of a regular N-gon inscribed in an ellipse with semi-axes a, b.
const polyArea = (n, a, b) => 0.5 * n * Math.sin(2 * Math.PI / n) * a * b;

// --- 1. the sphere is an octahedron, subdivided ------------------------------------------------------
{
    const oct = one(["sphere", " position 0 0 0", " size 3 4 5", " divisions 1", "end"]);
    ok("a sphere is a mesh obstacle, as it is upstream", oct.type === "mesh" && oct.kind === "sphere");
    ok("`divisions 1` is an octahedron: six vertices, eight faces", oct.vertices.length === 6 && oct.faces.length === 8);
    ok("...closed, consistently wound, outward", solid(oct));
    ok("...enclosing exactly (4/3)*a*b*c = 80", close(vol(oct), (4 / 3) * 3 * 4 * 5));

    ok("the face count is BZFlag's own 8*divisions^2", [1, 2, 3, 4, 8].every((d) =>
        one(["sphere", " size 3 4 5", " divisions " + d, "end"]).faces.length === 8 * d * d));
    ok("...and every one of them closes", [2, 3, 4, 8].every((d) => solid(one(["sphere", " size 3 4 5", " divisions " + d, "end"]))));

    // The only sense in which a polyhedron is a sphere.
    const ideal = (4 / 3) * Math.PI * 3 * 4 * 5;
    const vols = [1, 2, 3, 4, 8, 16].map((d) => vol(one(["sphere", " size 3 4 5", " divisions " + d, "end"])));
    ok("volume rises with every subdivision", vols.every((v, i) => i === 0 || v > vols[i - 1]));
    ok("...never overshooting the ellipsoid", vols.every((v) => v < ideal));
    ok(`...and reaching ${(100 * vols[5] / ideal).toFixed(1)}% of it at divisions 16`, vols[5] / ideal > 0.99);

    const hemi = one(["sphere", " size 3 3 3", " divisions 1", " hemi", "end"]);
    ok("a hemisphere with divisions 1 is a pyramid on a square base", hemi.faces.length === 8);
    ok("...enclosing exactly (2/3)*a*b*c = 18", close(vol(hemi), (2 / 3) * 27));
    ok("...and it is closed: the disc beneath it is real", solid(hemi));
    ok("`hemisphere` is the same word as `hemi`", one(["sphere", " size 3 3 3", " divisions 2", " hemisphere", "end"]).faces.length === one(["sphere", " size 3 3 3", " divisions 2", " hemi", "end"]).faces.length);
    ok("a hemisphere sits on its own floor", close(boundsOf({ obstacles: [hemi] }).lo[2], 0));
    ok("...and a whole sphere hangs below it", close(boundsOf({ obstacles: [one(["sphere", " size 3 3 3", " divisions 2", "end"])] }).lo[2], -3));

    ok("`radius` overrides `size`", (() => { const s = one(["sphere", " size 1 1 1", " radius 7", " divisions 1", "end"]); return close(vol(s), (4 / 3) * 343); })());
    ok("a sphere with no divisions is not built", W(["sphere", " size 5 5 5", " divisions 0", "end"]).ignored.length === 1);

    // The check point is the centre, and it must actually be inside.
    ok("a sphere contains its own centre", meshContainsPoint(one(["sphere", " size 5 5 5", " divisions 3", "end"]), [0, 0, 0]));
    ok("...and not a point outside it", !meshContainsPoint(one(["sphere", " size 5 5 5", " divisions 3", "end"]), [0, 0, 9]));
    ok("a hemisphere's check point is HALF WAY UP, because its centre is on the floor",
        meshContainsPoint(one(["sphere", " size 5 5 5", " divisions 3", " hemi", "end"]), [0, 0, 2.5]));
}

// --- 2. the cone ---------------------------------------------------------------------------------------
{
    const c = one(["cone", " size 3 4 6", " divisions 12", "end"]);
    ok("a cone is a mesh obstacle", c.type === "mesh" && c.kind === "cone");
    ok("...closed and outward", solid(c));
    ok("...enclosing exactly a third of its polygonal base times its height", close(vol(c), polyArea(12, 3, 4) * 6 / 3));
    ok("a finer cone is a bigger one, and never bigger than the true cone",
        vol(one(["cone", " size 3 4 6", " divisions 64", "end"])) > vol(c)
        && vol(one(["cone", " size 3 4 6", " divisions 64", "end"])) < (1 / 3) * Math.PI * 3 * 4 * 6);
    ok("`flipz` stands it on its point, and it holds the same volume",
        close(vol(one(["cone", " size 3 4 6", " divisions 12", " flipz", "end"])), vol(c)) && solid(one(["cone", " size 3 4 6", " divisions 12", " flipz", "end"])));

    const wedge = one(["cone", " size 4 4 6", " divisions 12", " angle 180", "end"]);
    ok("a half-swept cone is closed too, with two flat sides", solid(wedge));
    ok("...and holds about half the volume", vol(wedge) > 0.4 * vol(one(["cone", " size 4 4 6", " divisions 12", "end"])) && vol(wedge) < 0.6 * vol(one(["cone", " size 4 4 6", " divisions 12", "end"])));

    // The check point of a wedge is OFF CENTRE. A wedge's bounding-box centre is not inside the wedge, and
    // a mesh whose check point is outside it contains nothing at all -- you would drive straight through.
    ok("a wedge contains a point inside its wedge", meshContainsPoint(wedge, [2, 0.5, 1]));
    ok("...and its check point is not at its axis", !close(wedge.checkPoints[0].p[0], 0) || !close(wedge.checkPoints[0].p[1], 0));
    ok("a full cone's check point IS at its axis", (() => { const p = c.checkPoints[0].p; return close(p[0], 0) && close(p[1], 0) && close(p[2], 3); })());

    ok("a cone too coarse to close its sweep is refused", W(["cone", " size 5 5 5", " divisions 1", "end"]).ignored.length === 1);
    ok("...and a negative sweep is reversed rather than rejected", solid(one(["cone", " size 4 4 6", " divisions 12", " angle -90", "end"])));
}

// --- 3. the arc ----------------------------------------------------------------------------------------
{
    const pie = one(["arc", " size 3 4 6", " divisions 12", "end"]);
    ok("a full arc with the default ratio is a cylinder", solid(pie));
    ok("...enclosing exactly its polygonal base times its height", close(vol(pie), polyArea(12, 3, 4) * 6));
    ok("`ratio` is NOT an inner radius: the inner radius is size[0] * (1 - ratio)", (() => {
        // ratio 0.5 on a radius of 4 leaves an inner radius of 2.
        const ring = one(["arc", " size 4 4 6", " divisions 12", " ratio 0.5", "end"]);
        return close(vol(ring), (polyArea(12, 4, 4) - polyArea(12, 2, 2)) * 6);
    })());
    ok("...so the DEFAULT of 1.0 is a solid pie, not a hoop", close(vol(pie), polyArea(12, 3, 4) * 6));
    ok("a ring is closed, and has a hole", solid(one(["arc", " size 4 4 6", " divisions 12", " ratio 0.5", "end"])));
    ok("...and its check point is in the WALL, not in the hole",
        meshContainsPoint(one(["arc", " size 4 4 6", " divisions 12", " ratio 0.5", "end"]), [3, 0, 3]));
    ok("...so the hole really is a hole", !meshContainsPoint(one(["arc", " size 4 4 6", " divisions 12", " ratio 0.5", "end"]), [0, 0, 3]));

    const quarter = one(["arc", " size 4 4 6", " divisions 12", " angle 90", "end"]);
    ok("a quarter pie is closed", solid(quarter));
    ok("...and holds about a quarter", vol(quarter) > 0.2 * vol(one(["arc", " size 4 4 6", " divisions 12", "end"])) && vol(quarter) < 0.3 * vol(one(["arc", " size 4 4 6", " divisions 12", "end"])));
    ok("a quarter RING is closed too", solid(one(["arc", " size 4 4 6", " divisions 12", " angle 90", " ratio 0.4", "end"])));

    ok("a ratio outside 0..1 is refused", W(["arc", " size 5 5 5", " ratio 2", "end"]).ignored.length === 1);
    ok("a sweep is clamped to a full turn", normalizeSweep(0, 720).sweep <= 2 * Math.PI + 1e-9);
    ok("a negative sweep moves the start and turns positive", (() => { const r = normalizeSweep(0, -90); return r.sweep > 0 && close(r.start, -Math.PI / 2); })());
    ok("a full turn is a circle", normalizeSweep(0, 360).isCircle && !normalizeSweep(0, 359).isCircle);
}

// --- 4. materials -------------------------------------------------------------------------------------
{
    const w = W([
        "material", " name red", " diffuse 1 0 0 1", " texture bricks", " noradar", "end",
        "material", " name dark", " matref red", " diffuse 0.4 0 0 1", "end",
        "material", " name grey", " color 0.5", "end",
        "box", " position 0 0 0", " size 5 5 5", " matref dark", "end",
        "box", " position 20 0 0", " size 5 5 5", " matref nosuch", "end",
        "box", " position 40 0 0", " size 5 5 5", "end",
    ]);
    ok("materials are named", Object.keys(w.materials).sort().join() === "dark,grey,red");
    ok("`matref` inside a material INHERITS it", w.materials.dark.textures.join() === "bricks" && w.materials.dark.noRadar === true);
    ok("...and everything after it overrides", close(w.materials.dark.diffuse[0], 0.4));
    ok("`color` is `diffuse`", close(w.materials.red.diffuse[0], 1));
    ok("...and one number is a grey", w.materials.grey.diffuse.slice(0, 3).every((v) => close(v, 0.5)));
    ok("a default material is white and opaque", defaultMaterial("x").diffuse.join() === "1,1,1,1");
    ok("`resetmat` throws the inheritance away", (() => {
        const m = readMaterial(parseBZW(["material", " name z", " matref red", " resetmat", "end"].join("\n")).blocks[0], w.materials);
        return m.diffuse.join() === "1,1,1,1";
    })());

    const [b1, b2, b3] = w.obstacles;
    ok("an object's `matref` gives it the material's colour", close(colorOf(b1)[0], 0.4) && b1.material === "dark");
    ok("a `matref` to a material that does not exist leaves the colour alone", !Array.isArray(b2.color) && colorOf(b2).join() === colorOf(b3).join());
    ok("...because a box pointing at a missing material is a map the author got wrong, not a black box", b2.material === "nosuch");
    ok("the last `matref` wins", matrefOf([{ key: "matref", params: ["a"] }, { key: "matref", params: ["b"] }]) === "b");
    ok("colorOfMaterial returns null for a name nobody defined", colorOfMaterial(w.materials, "nosuch") === null);

    // A base's team colour beats a material: a red base drawn in a mapper's brown is a base nobody can find.
    const base = W(["material", " name brown", " diffuse 0.5 0.3 0.1 1", "end", "base", " color 2", " matref brown", "end"]).obstacles[0];
    ok("a base keeps its team colour whatever the material says", colorOf(base).join() !== "0.5,0.3,0.1");
}

// --- 5. per-face materials, and named transforms --------------------------------------------------------
{
    const w = W([
        "material", " name red", " diffuse 1 0 0 1", "end",
        "mesh",
        " vertex 0 0 0", " vertex 1 0 0", " vertex 0 1 0", " vertex 0 0 1", " inside 0.2 0.2 0.2",
        " face", " vertices 0 2 1", " matref red", " endface",
        " face", " vertices 0 1 3", " endface",
        " face", " vertices 1 2 3", " endface",
        " face", " vertices 2 0 3", " endface",
        "end",
    ]);
    const m = w.obstacles[0];
    ok("a mesh face carries its own material", m.faces[0].material === "red" && close(m.faces[0].color[0], 1));
    ok("...and its neighbours do not", m.faces[1].material === undefined);
    const mesh = buildWorldMesh(w);
    ok("...so the mesh's colours are per-vertex, not per-part", mesh.colors.length === mesh.positions.length);
    ok("...and the red face really is red", close(mesh.colors[0], 1) && close(mesh.colors[1], 0));

    const t = W(["transform", " name lift", " shift 0 0 10", "end", "meshbox", " position 0 0 0", " size 1 1 1", " xform lift", "end"]);
    ok("a named transform is built", Object.keys(t.transforms).join() === "lift");
    ok("...and `xform` finds it", close(boundsOf(t).lo[2], 10));
    ok("a transform is applied in the order it is written", (() => {
        // shift then spin: the shift is rotated. spin then shift: it is not.
        const a = W(["transform", " name t", " shift 10 0 0", " spin 90 0 0 1", "end", "meshbox", " size 1 1 1", " xform t", "end"]);
        const b = W(["transform", " name t", " spin 90 0 0 1", " shift 10 0 0", "end", "meshbox", " size 1 1 1", " xform t", "end"]);
        return close(boundsOf(a).hi[1], 11, 1e-6) && close(boundsOf(b).hi[0], 11, 1e-6);
    })());
    ok("a name comes from a `name` LINE, not the opening line -- the rest of that line is discarded",
        Object.keys(buildTransforms(parseBZW(["transform lift", " shift 0 0 10", "end"].join("\n")))).length === 0);
}

// --- 6. recorded, not simulated ---------------------------------------------------------------------------
{
    const w = W([
        "physics", " name conveyor", " linear 8 0 0", " slide 2", "end",
        "texturematrix", " name scroll", " shift 0.1 0.2", "end",
        "dynamiccolor", " name pulse", " red sinusoid 1 0 0.5", "end",
        "weapon", " position 1 2 3", " type SW", " initdelay 10", " delay 8 8", "end",
        "box", "end",
    ]);
    ok("a physics driver is kept, by name", w.physics.conveyor.linear.join() === "8,0,0" && w.physics.conveyor.slide === 2);
    ok("a texture matrix is kept", !!w.textureMatrices.scroll);
    ok("a dynamic colour is kept", !!w.dynamicColors.pulse);
    ok("a weapon is kept, and is not named", w.weapons._unnamed.length === 1 && w.weapons._unnamed[0].type === "SW");
    ok("...with its delays", w.weapons._unnamed[0].delay.join() === "8,8" && w.weapons._unnamed[0].initdelay === 10);
    ok("NONE of them is an obstacle: nothing moves and nothing shoots", w.obstacles.length === 1);

    const rep = coverageReport(parseBZW(["physics", "end", "weapon", "end", "box", "end"].join("\n")));
    ok("the coverage report calls them RECORDED", rep.recordedTotal === 2 && rep.handledTotal === 1);
    ok("...not handled, which would flatter us", !rep.handled.some((h) => h.type === "physics"));
    ok("...and not ignored, which would be the other lie", rep.unknownTotal === 0);
    ok("everything read is 100%; only a third of it is simulated", rep.pctHandled === 100 && Math.round(rep.pctSimulated) === 33);

    ok("RECORDED and HANDLED share nothing", ![...RECORDED.keys()].some((k) => HANDLED.has(k)));
    ok("between them they cover every object keyword the parser knows", (() => {
        const known = new Set([...HANDLED.keys(), ...RECORDED.keys()]);
        // `link` and `zone` and `waterlevel` are objects too; `group`, `world` and `options` are handled.
        return ["box", "pyramid", "base", "teleporter", "link", "mesh", "arc", "meshbox", "cone", "meshpyr",
            "sphere", "tetra", "weapon", "zone", "waterlevel", "dynamiccolor", "texturematrix",
            "material", "physics", "transform", "group", "world", "options"].every((k) => known.has(k));
    })());
}

// --- 6b. EVERY generated shape contains its own check point, and only its own -------------------------------
// This is the trap the whole family sits over. `containsPoint` casts a ray from the query point AT a check
// point, and calls the query point inside if the ray crosses no face. A check point that is not inside the
// solid therefore makes the ENTIRE WORLD inside it -- and a ring's hole, or a wedge's bounding-box centre,
// is not inside the solid. Nothing about that is visible in the geometry: the shape draws perfectly.
{
    const shapes = [
        ["sphere", ["sphere", " size 5 6 7", " divisions 3", "end"]],
        ["hemisphere", ["sphere", " size 5 5 5", " divisions 3", " hemi", "end"]],
        ["cone", ["cone", " size 5 5 9", " divisions 12", "end"]],
        ["cone wedge", ["cone", " size 5 5 9", " divisions 12", " angle 90", "end"]],
        ["flipped cone", ["cone", " size 5 5 9", " divisions 12", " flipz", "end"]],
        ["pie", ["arc", " size 5 5 9", " divisions 12", "end"]],
        ["pie wedge", ["arc", " size 5 5 9", " divisions 12", " angle 90", "end"]],
        ["ring", ["arc", " size 5 5 9", " divisions 12", " ratio 0.4", "end"]],
        ["ring wedge", ["arc", " size 5 5 9", " divisions 12", " angle 90", " ratio 0.4", "end"]],
        ["thin ring wedge", ["arc", " size 20 20 5", " divisions 12", " angle 45", " ratio 0.2", "end"]],
    ];
    for (const [label, src] of shapes) {
        const o = one(src);
        ok(`a ${label} contains its own check point`, meshContainsPoint(o, o.checkPoints[0].p));
        ok(`...and does not contain a point two hundred metres away`, !meshContainsPoint(o, [-200, -200, 1]));
    }
    // The specific lie: a ring's hole is not the ring.
    const ring = one(["arc", " size 20 20 5", " divisions 12", " ratio 0.4", "end"]);
    ok("a ring's check point is at mid-wall, not at half its outer radius", (() => {
        const p = ring.checkPoints[0].p;
        const r = Math.hypot(p[0], p[1]);
        return r > 12 && r < 20;     // between the inner and outer radii
    })());
    ok("...so the hole is empty", !meshContainsPoint(ring, [0, 0, 2.5]));
}

// --- 7. arena.bzw, which is ours ---------------------------------------------------------------------------
{
    const arena = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    ok("arena.bzw parses with no warnings, and nothing ignored", arena.errors.length === 0 && arena.ignored.length === 0);
    ok("...and now has a dome, two columns and two arches",
        arena.obstacles.filter((o) => o.kind === "sphere").length === 1
        && arena.obstacles.filter((o) => o.kind === "cone").length === 2
        && arena.obstacles.filter((o) => o.kind === "arc").length === 2);
    ok("...every one of them a closed, outward-wound solid",
        arena.obstacles.filter((o) => ["sphere", "cone", "arc"].includes(o.kind)).every(solid));
    ok("the dome is BZFlag's default subdivision: 8*4*4 faces, halved", arena.obstacles.find((o) => o.kind === "sphere").faces.length > 60);
    ok("materials are named and inherited", arena.materials.verdigris && arena.materials.verdigris.diffuse[1] > arena.materials.brass.diffuse[1]);
    ok("...and the dome wears one", arena.obstacles.find((o) => o.kind === "sphere").material === "verdigris");
    ok("a named transform lifts the ring", Object.keys(arena.transforms).join() === "lift"
        && boundsOf({ obstacles: [arena.obstacles.filter((o) => o.kind === "arc")[1]] }).lo[2] > 5);
    ok("the physics driver and the world weapon are recorded, and neither is an obstacle",
        !!arena.physics.conveyor && arena.weapons._unnamed.length === 1);

    const rep = coverageReport(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    ok("100% of arena.bzw is read", rep.pctHandled === 100 && rep.unknownTotal === 0);
    ok("...and it says which two objects it only recorded", rep.recordedTotal === 2);
    console.log(`  (arena.bzw: ${rep.total} objects, ${rep.handledTotal} simulated, ${rep.recordedTotal} recorded, ${rep.unknownTotal} ignored)`);
}

// --- 8. BZFlag's own maps ------------------------------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const maps = fs.readdirSync(dir).filter((f) => f.endsWith(".bzw"));
    console.log("");
    let ignored = 0, recorded = 0, objs = 0;
    for (const f of maps) {
        const parsed = parseBZW(fs.readFileSync(path.join(dir, f), "utf8"));
        const rep = coverageReport(parsed);
        ignored += rep.unknownTotal; recorded += rep.recordedTotal; objs += rep.total;
    }
    ok(`real maps: all ${objs} objects across ${maps.length} maps are read`, ignored === 0);
    ok(`real maps: ${recorded} of them recorded and not simulated`, recorded > 0);
    console.log(`  (${maps.join(", ")})`);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
