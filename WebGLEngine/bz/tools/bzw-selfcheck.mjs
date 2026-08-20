// bz/tools/bzw-selfcheck.mjs — the .bzw grammar, BZFlag's state database, and the world they build.
//
//   node bz/tools/bzw-selfcheck.mjs
//   node bz/tools/bzw-selfcheck.mjs /path/to/bzflag/misc/maps   (adds a pass over the shipped maps)
//
// Everything here is checked against BZFlag 2.4 (github.com/BZFlag-Dev/bzflag), read, not guessed. The
// rules that will rot if nobody watches them:
//
//   * `world { size 400 }` is an 800-unit world. CustomWorld::read multiplies by two.
//   * `name HiX 2.0` names the world "HiX". `input >> name` reads ONE token, and the remainder of every
//     line is discarded.
//   * `#` is a comment only as the first token of a line.
//   * A box's default size is `_boxBase` x `_boxBase` x `_boxHeight`, and `_boxHeight` is the STRING
//     "6.0*_muzzleHeight". The defaults are an expression language, not a number table.
//   * `size` is a half-extent in x and y and a full height in z.
//   * `passable` == `drivethrough` + `shootthrough`.
//   * A negative z size on a pyramid means `flipz`.
//   * A teleporter's default border is twice its x size.

import { parseBZW, lastParams, hasFlag, nums } from "../bzwParse.js";
import { fileURLToPath } from "node:url";
import { makeBZDB, BZDB_DEFAULTS } from "../bzdb.js";
import { buildWorld, boundsOf, identity, mul, apply, shiftM, scaleM, spinM } from "../bzwWorld.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const P = (lines) => parseBZW(lines.join("\n"));
const W = (lines) => buildWorld(P(lines));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// --- 1. the grammar ---------------------------------------------------------------------------
{
    const p = P(["# a comment", "", "box", "position 1 2 3", "end"]);
    ok("a blank line is nothing", p.errors.length === 0);
    ok("a comment is nothing", p.blocks.length === 1);
    ok("an object block is collected", p.blocks[0].kind === "box" && p.blocks[0].lines.length === 1);

    ok("keywords are case-insensitive", P(["BOX", "POSITION 1 2 3", "End"]).blocks[0].kind === "box");
    ok("...and so are their parameters' keys", P(["box", "DriveThrough", "end"]).blocks[0].lines[0].key === "drivethrough");
    ok("...but not their values", P(["box", "name MixedCase", "end"]).blocks[0].lines[0].params[0] === "MixedCase");

    // `#` is only a comment as the FIRST token. Anywhere else the line's remainder is simply discarded,
    // which looks the same until a parameter needs the token that follows.
    ok("`#` mid-line is not a comment, and what follows the parameters is discarded anyway",
        nums(P(["box", "size 1 2 3 # tall", "end"]).blocks[0].lines[0].params, 3).join() === "1,2,3");
    ok("a `#` where a number should be reads nothing", nums(P(["box", "size # 1 2 3", "end"]).blocks[0].lines[0].params, 3) === null);

    // The remainder of a line is discarded: `name HiX 2.0` names it "HiX".
    ok("a name is one token, and the rest of the line is thrown away", W(["world", "name HiX 2.0", "end"]).world.name === "HiX");

    ok("an unclosed object is an error", P(["box", "position 0 0 0"]).errors.some((e) => /missing "end"/.test(e.msg)));
    ok("a stray `end` is an error", P(["end"]).errors.some((e) => /unexpected "end"/.test(e.msg)));
    ok("a parameter outside any object is an error", P(["position 1 2 3"]).errors.some((e) => /invalid object type/.test(e.msg)));
    ok("starting an object inside one discards the first", P(["box", "pyramid", "end"]).errors.some((e) => /incomplete object/.test(e.msg)));
    ok("two `world` sections are a warning, not a crash", P(["world", "end", "world", "end"]).errors.some((e) => /multiple "world"/.test(e.msg)));

    const d = P(["define g", "box", "end", "enddef", "group g", "end"]);
    ok("`define` collects its own blocks", d.defines.g && d.defines.g.blocks.length === 1);
    ok("...and does not put them in the world", d.blocks.length === 1 && d.blocks[0].kind === "group");
    ok("`group` carries its reference on the opening line", d.blocks[0].arg === "g");
    ok("group definitions cannot nest", P(["define a", "define b", "enddef", "enddef"]).errors.some((e) => /cannot nest/.test(e.msg)));
    ok("`enddef` without `define` is an error", P(["enddef"]).errors.some((e) => /without define/.test(e.msg)));
    ok("a duplicate definition warns and keeps the newest", P(["define g", "enddef", "define g", "enddef"]).errors.some((e) => /duplicate/.test(e.msg)));

    ok("`teleporter` carries its name on the opening line", P(["teleporter t0", "end"]).blocks[0].arg === "t0");
    ok("`include` is recorded and not followed", (() => { const r = P(["include other.bzw"]); return r.includes.length === 1 && r.includes[0].file === "other.bzw"; })());
}

// --- 2. BZDB: the defaults are an expression language -------------------------------------------
{
    const db = makeBZDB();
    ok("167 defaults, transcribed from global.cxx", Object.keys(BZDB_DEFAULTS).length === 167);
    ok("a plain number evaluates to itself", db.eval("_boxBase") === 30);
    ok("`_boxHeight` is the string \"6.0*_muzzleHeight\"", db.get("_boxHeight") === "6.0*_muzzleHeight");
    ok("...and evaluates to 9.42", close(db.eval("_boxHeight"), 6.0 * 1.57, 1e-6));
    ok("`_pyrBase` is 4 tank heights", close(db.eval("_pyrBase"), 4 * 2.05, 1e-6));
    ok("a non-numeric value is NaN, not zero", Number.isNaN(db.eval("_ambientLight")) && db.get("_ambientLight") === "none");
    ok("an unknown name is NaN", Number.isNaN(db.eval("_nothing")));

    ok("arithmetic", db.evalExpr("1+2*3") === 7 && db.evalExpr("(1+2)*3") === 9);
    ok("precedence: ^ over * over +", db.evalExpr("2+3*2^2") === 14);
    ok("^ binds as BZFlag's precedence table says (3 > 2 > 1)", db.evalExpr("2*3^2") === 18);
    ok("unary minus", db.evalExpr("-3") === -3 && db.evalExpr("2*-3") === -6);
    ok("...in front of a variable", close(db.evalExpr("-_tankHeight"), -2.05, 1e-9));
    ok("a variable reference resolves", close(db.evalExpr("2*_boxBase"), 60, 1e-9));
    ok("unbalanced parens are NaN, not a throw", Number.isNaN(db.evalExpr("(1+2")));
    ok("a set value overrides, and the cache is dropped", (() => { const d2 = makeBZDB(); d2.eval("_boxHeight"); d2.set("_muzzleHeight", 1); return d2.eval("_boxHeight") === 6; })());

    // A cycle is a map bug. It must not hang.
    const cyc = makeBZDB({ _a: "_b", _b: "_a" });
    ok("a variable cycle yields NaN rather than a hang", Number.isNaN(cyc.eval("_a")));
}

// --- 3. the world -------------------------------------------------------------------------------
{
    // CustomWorld::read multiplies the size by two before storing it.
    const w = W(["world", "size 400", "flagHeight 12", "end"]);
    ok("`world size 400` is an 800-unit world", w.world.size === 800);
    ok("...and the walls sit at +/-400", w.world.size / 2 === 400);
    ok("flagHeight is read as written", w.world.flagHeight === 12);
    ok("`noWalls` is a flag", W(["world", "noWalls", "end"]).world.noWalls === true);
    ok("with no `world` block, the defaults stand", W(["box", "end"]).world.size === 800);

    // ...and a box that follows sees the new _worldSize.
    ok("the world block sets _worldSize before anything else reads it", W(["box", "end", "world", "size 100", "end"]).bzdb.eval("_worldSize") === 200);
}

// --- 4. the obstacles ----------------------------------------------------------------------------
{
    const b = W(["box", "end"]).obstacles[0];
    ok("a box with no size is _boxBase x _boxBase x _boxHeight", b.size[0] === 30 && b.size[1] === 30 && close(b.size[2], 9.42));
    ok("...at the origin", b.pos.join() === "0,0,0");

    const r = W(["box", "position 1 2 3", "rotation 90", "size 4 5 6", "end"]).obstacles[0];
    ok("position and size are read", r.pos.join() === "1,2,3" && r.size.join() === "4,5,6");
    ok("rotation is degrees in the file and radians in the world", close(r.rotation, Math.PI / 2));
    ok("`pos` and `rot` are the same keys as `position` and `rotation`",
        W(["box", "pos 1 2 3", "rot 90", "end"]).obstacles[0].rotation === r.rotation);

    // size is a HALF-extent in x and y, and a FULL height in z.
    const bounds = boundsOf(W(["box", "position 0 0 0", "size 10 20 5", "end"]));
    ok("`size` is a half-extent in x and y", bounds.lo[0] === -10 && bounds.hi[0] === 10 && bounds.hi[1] === 20);
    ok("...and a full height in z", bounds.lo[2] === 0 && bounds.hi[2] === 5);

    const o = W(["box", "passable", "end"]).obstacles[0];
    ok("`passable` is drivethrough and shootthrough at once", o.driveThrough && o.shootThrough);
    ok("...and neither is set by default", (() => { const q = W(["box", "end"]).obstacles[0]; return !q.driveThrough && !q.shootThrough && !q.ricochet; })());
    ok("`ricochet` is its own flag", W(["box", "ricochet", "end"]).obstacles[0].ricochet === true);

    const py = W(["pyramid", "end"]).obstacles[0];
    ok("a pyramid's default size is _pyrBase x _pyrBase x _pyrHeight", close(py.size[0], 8.2) && close(py.size[2], 10.25));
    ok("`flipz` hangs it from its apex", W(["pyramid", "flipz", "end"]).obstacles[0].flipz === true);
    ok("...and so does a negative z size", W(["pyramid", "size 5 5 -9", "end"]).obstacles[0].flipz === true);
    ok("...whose size is then taken as positive", W(["pyramid", "size 5 5 -9", "end"]).obstacles[0].size[2] === 9);

    const t = W(["teleporter tp", "end"]).obstacles[0];
    ok("a teleporter's default size is half the width, the breadth, and twice the height",
        close(t.size[0], 0.56) && close(t.size[1], 4.48) && close(t.size[2], 20.16));
    ok("...and its default border is twice its x size", close(t.border, 1.12));
    ok("...which an explicit border overrides", close(W(["teleporter tp", "border 3", "end"]).obstacles[0].border, 3));
    ok("a teleporter's name comes from its opening line", t.name === "tp");
    ok("`horizontal` is a flag", W(["teleporter t", "horizontal", "end"]).obstacles[0].horizontal === true);

    const base = W(["base", "color 2", "oncap SW", "end"]).obstacles[0];
    ok("a base's default size is _baseSize", base.size[0] === 60 && base.size[1] === 60);
    ok("its team colour is read", base.color === 2 && base.colorValid);
    ok("...and a colour outside 1..4 is recorded as invalid, not clamped into somebody's team",
        (() => { const x = W(["base", "color 7", "end"]).obstacles[0]; return x.color === 7 && !x.colorValid; })());
    ok("`oncap` names a world weapon", base.onCap === "SW");

    const l = W(["link", "from 0", "to 2", "end"]).links[0];
    ok("a link is from and to", l.from === "0" && l.to === "2");
    ok("...and it is not an obstacle", W(["link", "from 0", "to 2", "end"]).obstacles.length === 0);

    const z = W(["zone", "position 1 2 3", "size 4 5 6", "flag good", "team 1 2", "safety 3", "end"]).zones[0];
    ok("a zone keeps its flags, teams and safeties", z.flags.join() === "good" && z.teams.join() === "1,2" && z.safety.join() === "3");

    ok("`waterLevel` sets the water", W(["waterLevel", "height 3.5", "end"]).waterLevel === 3.5);
    ok("`options` is kept raw, for the server", W(["options", "-set _tankSpeed 40", "end"]).options.length === 1);
}

// --- 5. transforms and groups ----------------------------------------------------------------------
{
    ok("identity does nothing", apply(identity(), [1, 2, 3]).join() === "1,2,3");
    ok("shift moves", apply(shiftM(1, 2, 3), [0, 0, 0]).join() === "1,2,3");
    ok("scale scales", apply(scaleM(2, 3, 4), [1, 1, 1]).join() === "2,3,4");
    ok("spin turns about an axis", (() => { const p = apply(spinM(90, 0, 0, 1), [1, 0, 0]); return close(p[0], 0, 1e-6) && close(p[1], 1, 1e-6); })());
    ok("transforms compose in the order written", (() => {
        // shift then scale doubles the shift; scale then shift does not.
        const a = mul(scaleM(2, 2, 2), shiftM(1, 0, 0));
        const b = mul(shiftM(1, 0, 0), scaleM(2, 2, 2));
        return apply(a, [0, 0, 0])[0] === 2 && apply(b, [0, 0, 0])[0] === 1;
    })());

    const g = W(["define blk", "box", "position 1 0 0", "end", "enddef", "group blk", "shift 10 0 0", "end"]);
    ok("a group instantiates its definition", g.obstacles.length === 1 && g.obstacles[0].type === "box");
    ok("...tagged with the group it came from", g.obstacles[0].group === "blk");
    // v2182 -- a rigid group transform is BAKED into pos/rotation/size, not carried alongside. Round one
    // kept it separate and left `pos` in the group's local frame, which geometry coped with (it applies the
    // transform) and collision did not (it reads `pos`). A tank drove through every corridor in arena.bzw.
    ok("...moved into the world frame, not left in the group's", close(g.obstacles[0].pos[0], 11));
    ok("...and carries no transform of its own, because there is nothing left to apply", !g.obstacles[0].transform);
    ok("...so the bounds are the same as ever", (() => { const b = boundsOf(g); return close(b.lo[0], 11 - 30) && close(b.hi[0], 11 + 30); })());
    ok("a group rotation lands in the obstacle's rotation",
        close(W(["define b", "box", "position 10 0 0", "size 1 1 1", "end", "enddef", "group b", "rotation 90", "end"]).obstacles[0].rotation, Math.PI / 2, 1e-9));
    ok("...and its position is rotated with it",
        close(W(["define b", "box", "position 10 0 0", "size 1 1 1", "end", "enddef", "group b", "rotation 90", "end"]).obstacles[0].pos[1], 10, 1e-9));
    ok("a uniform scale is baked into the size", close(W(["define b", "box", "size 2 2 2", "end", "enddef", "group b", "scale 3 3 3", "end"]).obstacles[0].size[0], 6));
    // A shear cannot be a pos and a rotation, so it is kept, and the obstacle says its collision is a lie.
    const sheared = W(["define b", "box", "size 2 2 2", "end", "enddef", "group b", "shear 0.5 0 0", "end"]);
    ok("a transform that is NOT rigid is kept, and the obstacle is flagged approximate", sheared.obstacles[0].approx === true && !!sheared.obstacles[0].transform);
    ok("...and the world counts how many of those it has", sheared.approx === 1);
    ok("a rigid world has none", W(["box", "end"]).approx === 0);

    const gp = W(["define blk", "box", "position 0 0 0", "size 1 1 1", "end", "enddef", "group blk", "position 5 5 0", "end"]);
    ok("a group's own `position` shifts what it instantiates", close(boundsOf(gp).hi[0], 6));

    const twice = W(["define blk", "box", "end", "enddef", "group blk", "end", "group blk", "end"]);
    ok("a definition may be instantiated twice", twice.obstacles.length === 2);

    const missing = W(["group nope", "end"]);
    ok("an undefined group is ignored and reported, not invented", missing.obstacles.length === 0 && missing.ignored.some((i) => /undefined group/.test(i.reason || "")));

    // A group that instantiates itself is a map bug. It must not hang.
    const rec = W(["define a", "group a", "end", "box", "end", "enddef", "group a", "end"]);
    ok("a recursive group stops, and says so", rec.ignored.some((i) => i.reason === "recursive group"));
    ok("...keeping what it did build", rec.obstacles.length >= 1);

    const nested = W(["define inner", "box", "size 1 1 1", "end", "enddef",
        "define outer", "group inner", "position 10 0 0", "end", "enddef",
        "group outer", "position 100 0 0", "end"]);
    ok("groups may nest, and their transforms compound", close(boundsOf(nested).hi[0], 111));
}

// --- 6. what we do NOT read ---------------------------------------------------------------------------
{
    // v2187 -- there is nothing left in the .bzw format that the adapter does not read. `arc`, `cone` and
    // `sphere` build meshes; `material` and `transform` are named and resolved; `textureMatrix`,
    // `dynamicColor`, `physics` and `weapon` are recorded and not simulated, which the coverage report says
    // in that word. What can still be ignored is an object we failed to BUILD, and that is reported too.
    const w = W(["sphere", "size 5 5 5", "end", "arc", "size 5 5 5", "end", "cone", "size 5 5 5", "end", "box", "end"]);
    ok("a sphere, an arc and a cone all build", w.obstacles.length === 4 && w.ignored.length === 0);
    ok("...and every one of them is a mesh, as it is upstream",
        w.obstacles.filter((o) => o.type === "mesh").length === 3);
    ok("...named for the keyword that made it", ["sphere", "arc", "cone"].every((k) => w.obstacles.some((o) => o.kind === k)));

    ok("a tetra with fewer than four vertices is ignored, and says why",
        W(["tetra", "vertex 0 0 0", "end"]).ignored.some((i) => i.reason === "not enough vertices"));
    ok("a sphere with no divisions cannot be built, and is not invented",
        W(["sphere", "size 5 5 5", "divisions 0", "end"]).ignored.some((i) => i.type === "sphere"));
    ok("an arc with a ratio outside 0..1 is refused", W(["arc", "size 5 5 5", "ratio 2", "end"]).ignored.length === 1);
    ok("a cone too coarse to close its sweep is refused", W(["cone", "size 5 5 5", "divisions 1", "end"]).ignored.length === 1);
}

// --- 7. bz/maps/arena.bzw, which is ours ------------------------------------------------------------
// An original map. BZFlag's own worlds are not vendored into this tree -- they belong to BZFlag -- so the
// corpus that always runs is one we wrote, and it exercises every rule the adapter claims.
{
    const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
    const arena = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    ok("arena.bzw parses with no warnings", arena.errors.length === 0);
    ok("...names itself and doubles its size", arena.world.name === "Arena" && arena.world.size === 400);
    ok("...builds 28 obstacles, 2 links, 5 zones", arena.obstacles.length === 28 && arena.links.length === 2 && arena.zones.length === 5);
    ok("...including one of each of the mesh family",
        ["mesh", "tetra", "meshbox", "meshpyr"].every((k) => arena.obstacles.some((o) => o.kind === k)));
    ok("...and the bunker's north face alone is drivethrough",
        arena.obstacles.find((o) => o.kind === "mesh").faces.filter((f) => f.driveThrough).length === 1);
    ok("...with four bases, one per team", new Set(arena.obstacles.filter((o) => o.type === "base").map((o) => o.color)).size === 4);
    ok("...one pyramid hanging from its apex", arena.obstacles.filter((o) => o.flipz).length === 1);
    ok("...a corridor instantiated four times", arena.obstacles.filter((o) => o.group === "corridor").length === 8);
    ok("...each instance baked into the world frame, none carrying a transform",
        arena.obstacles.filter((o) => o.group).every((o) => !o.transform) && arena.approx === 0);
    ok("...water below the floor", arena.waterLevel === -1);
    ok("...nothing ignored", arena.ignored.length === 0);
    // The map is 400 units across, so its walls are at +/-200 and nothing should reach them.
    const b = boundsOf(arena);
    ok("...and it fits inside its own walls", Math.max(Math.abs(b.lo[0]), b.hi[0], Math.abs(b.lo[1]), b.hi[1]) < arena.world.size / 2);
}

// --- 8. the maps BZFlag ships --------------------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const maps = fs.readdirSync(dir).filter((f) => f.endsWith(".bzw"));
    console.log("");
    console.log(`  (real maps: ${maps.join(", ")})`);
    let threw = 0, errs = 0, obstacles = 0;
    const kinds = new Map(), ignored = new Map();
    for (const f of maps) {
        let w;
        try { w = buildWorld(parseBZW(fs.readFileSync(path.join(dir, f), "utf8"))); } catch (e) { threw++; continue; }
        errs += w.errors.length;
        obstacles += w.obstacles.length;
        for (const o of w.obstacles) kinds.set(o.type, (kinds.get(o.type) || 0) + 1);
        for (const i of w.ignored) ignored.set(i.type, (ignored.get(i.type) || 0) + 1);
    }
    ok(`real maps: all ${maps.length} parse and build without throwing`, threw === 0);
    ok("real maps: with no parse warnings at all", errs === 0);
    ok(`real maps: ${obstacles} obstacles built`, obstacles > 100);
    console.log(`  (built: ${[...kinds].map(([k, v]) => k + " " + v).join(", ")})`);
    console.log(`  (ignored: ${ignored.size ? [...ignored].map(([k, v]) => k + " " + v).join(", ") : "nothing"})`);

    const hix = maps.includes("hix.bzw") ? buildWorld(parseBZW(fs.readFileSync(path.join(dir, "hix.bzw"), "utf8"))) : null;
    if (hix) {
        ok('hix names itself "HiX", not "HiX 2.0"', hix.world.name === "HiX");
        ok("hix is 800 units across, because it says `size 400`", hix.world.size === 800);
        ok("hix sets flagHeight to zero, and means it", hix.world.flagHeight === 0);
        ok("hix has four bases, one per team, all valid", (() => {
            const b = hix.obstacles.filter((o) => o.type === "base");
            return b.length === 4 && b.every((x) => x.colorValid) && new Set(b.map((x) => x.color)).size === 4;
        })());
        ok("hix has sixteen teleporter links", hix.links.length === 16);
        // Eight 30x30 boxes are set into the walls at 45 degrees, so half of each pokes through. That is
        // the map, not the parser: 400 + 30*sqrt(2) = 442.4.
        const b = boundsOf(hix);
        ok("hix reaches exactly 30*sqrt(2) past its own wall, where its corner bumpers sit",
            close(b.hi[0], 400 + 30 * Math.SQRT2, 0.01) && close(b.lo[0], -(400 + 30 * Math.SQRT2), 0.01));
    }
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
