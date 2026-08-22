// bz/tools/bz-teleport-selfcheck.mjs — the doorway, and where it goes.
//
//   node bz/tools/bz-teleport-selfcheck.mjs
//   node bz/tools/bz-teleport-selfcheck.mjs /path/to/bzflag/misc/maps
//
// `link` has been parsed since round one and meant nothing. The bookkeeping under it turns out to be
// stranger than the geometry, and the strangest rule is the one that let it go unnoticed for eight rounds:
//
//     "fill in the blanks (passthru linkage)"  --  LinkManager::doLinking
//
// Any teleporter face with no destination links to the OPPOSITE FACE OF THE SAME TELEPORTER. An unlinked
// teleporter is a doorway. And an unnamed teleporter is called `/t<index>`, not `<index>` -- so a link that
// says `from 0` matches nothing at all, and hix.bzw, BZFlag's own shipped map, has sixteen of them. All
// sixteen are broken. The map plays, because every face falls through to a doorway.

import { makeBZDB } from "../bzdb.js";
import { fileURLToPath } from "node:url";
import { parseBZW } from "../bzwParse.js";
import { buildWorld } from "../bzwWorld.js";
import { makeTank, stepTank, free } from "../bzTank.js";
import { globMatch, teleName, findTelesByName, doLinking, getTeleportTarget, makeLinkName, resolveLinkName } from "../bzLinks.js";
import { isCrossing, sideOf, transfer, tryTeleport, holeOf, TELEPORT_COOLDOWN } from "../bzTeleport.js";
import { findSpawn, spawnZonesFor, pointInZone, flagZones } from "../bzCombat.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const here = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const db = makeBZDB();
const DT = 1 / 60;
const W = (lines) => buildWorld(parseBZW(lines.join("\n")));
const teles = (w) => w.obstacles.filter((o) => o.type === "teleporter");

const GATE = (name, x, y, rot) => ["teleporter", ` name ${name}`, ` position ${x} ${y} 0`, ` rotation ${rot}`, " size 0.56 8 20", " border 1.12", "end"];

// --- 1. the glob ---------------------------------------------------------------------------------
{
    ok("a literal matches itself", globMatch("gate:f", "gate:f") && !globMatch("gate:f", "gate:b"));
    ok("`*` matches any run, including none", globMatch("*", "anything") && globMatch("a*c", "ac") && globMatch("a*c", "abbbc"));
    ok("`?` matches exactly one", globMatch("a?c", "abc") && !globMatch("a?c", "ac") && !globMatch("a?c", "abbc"));
    ok("`*` is not greedy in a way that loses a match", globMatch("*:f", "a:b:f"));
    ok("...and does not match what it should not", !globMatch("*:f", "a:b"));
}

// --- 2. names, and the face numbers -----------------------------------------------------------------
{
    const w = W([...GATE("east", 100, 0, 0), ...GATE("west", -100, 0, 0), "teleporter", " position 0 60 0", "end"]);
    const t = teles(w);
    ok("a named teleporter answers to its name", teleName(t[0], 0) === "east");
    ok("an unnamed one is called `/t<index>`, not `<index>`", teleName(t[2], 2) === "/t2");

    ok("a name resolves to two faces: 2i and 2i+1", findTelesByName("east:f", t).join() === "0" && findTelesByName("east:b", t).join() === "1");
    ok("the second teleporter's faces are 2 and 3", findTelesByName("west:b", t).join() === "3");
    ok("`*:f` is every front face in the map", findTelesByName("*:f", t).join() === "0,2,4");
    ok("`*` is every face of every one", findTelesByName("*", t).length === 6);
    ok("a leading `:` is stripped, for links inside group definitions", findTelesByName(":east:f", t).join() === "0");

    // Only the LAST character is case-folded. That is not a simplification, it is the code.
    ok("the trailing face letter is case-independent", findTelesByName("east:F", t).join() === "0");
    ok("...and nothing else is", findTelesByName("EAST:f", t).length === 0);
    ok("a name nobody has matches nothing", findTelesByName("nowhere", t).length === 0);
    ok("an empty name matches nothing", findTelesByName("", t).length === 0);

    // v2197 -- THE CORRECTION. A numeric link name is not a name: `addLink` turns it into one. Face `n`
    // belongs to teleporter `n/2`, front if `n` is even. v2188 asserted the opposite, confidently, for nine
    // rounds, because it read `doLinking` and never read `addLink`. A real bzfs settled it.
    ok("a raw `0` matches nothing, because `/t0` is the name", findTelesByName("0", t).length === 0);
    ok("...but `resolveLinkName` turns `0` into `/t0:f` first, exactly as addLink does", resolveLinkName("0") === "/t0:f");
    ok("...and `2` into `/t1:f`: face n belongs to teleporter n/2", resolveLinkName("2") === "/t1:f");
    ok("...and an odd number is a BACK face", resolveLinkName("3") === "/t1:b" && makeLinkName(1) === "/t0:b");
    ok("...while a name that does not start with a digit is left alone", resolveLinkName("gate:f") === "gate:f");
    // ...and in a world of UNNAMED teleporters -- which is what a numeric link is written for -- it lands.
    // In this fixture teleporter 0 is called `east`, so `/t0:f` matches nothing, and that is correct too.
    ok("`/t0:f` finds nothing here, because teleporter 0 is named `east`", findTelesByName(resolveLinkName("0"), t).length === 0);
    const unnamed = teles(W(["teleporter", " position 0 0 0", "end", "teleporter", " position 50 0 0", "end"]));
    ok("...but among unnamed teleporters, `from 0` finds face 0 and `to 2` finds face 2",
        findTelesByName(resolveLinkName("0"), unnamed).join() === "0" && findTelesByName(resolveLinkName("2"), unnamed).join() === "2");
}

// --- 3. doLinking, and the passthru rule ---------------------------------------------------------------
{
    const solo = W(GATE("gate", 0, 0, 0));
    const L = doLinking(solo.links, teles(solo));
    ok("an unlinked teleporter's front face goes to its back", L.dsts[0].join() === "1");
    ok("...and its back to its front", L.dsts[1].join() === "0");
    ok("...which is to say: an unlinked teleporter is a doorway", L.passthru.length === 2);

    const pair = W([...GATE("a", -50, 0, 0), ...GATE("b", 50, 0, 0),
        "link", " from a:f", " to b:b", "end"]);
    const P = doLinking(pair.links, teles(pair));
    ok("a declared link is honoured", P.dsts[0].join() === "3");
    ok("...and the faces it did not mention still pass through", P.dsts[1].join() === "0" && P.dsts[2].join() === "3");
    ok("nothing is broken", P.broken.length === 0);

    const broken = W([...GATE("a", 0, 0, 0), "link", " from nowhere", " to a:f", "end"]);
    const B = doLinking(broken.links, teles(broken));
    ok("a link with no source is BROKEN, and reported", B.broken.length === 1 && /source/.test(B.broken[0].why));
    ok("...and never guessed at", B.dsts[0].join() === "1");
    ok("a link with no destination is broken too",
        doLinking(W([...GATE("a", 0, 0, 0), "link", " from a:f", " to nowhere", "end"]).links, teles(broken)).broken.length === 1);

    const many = W([...GATE("a", -50, 0, 0), ...GATE("b", 0, 0, 0), ...GATE("c", 50, 0, 0),
        "link", " from a:f", " to *:b", "end"]);
    const M = doLinking(many.links, teles(many));
    ok("one source may have several destinations", M.dsts[0].length === 3);
    ok("...and no duplicates", new Set(M.dsts[0]).size === 3);
    ok("the target is chosen at random, and the rng is injected",
        getTeleportTarget(M, 0, () => 0) === M.dsts[0][0] && getTeleportTarget(M, 0, () => 0.99) === M.dsts[0][2]);
    ok("one destination needs no rng at all", getTeleportTarget(doLinking(W(GATE("g", 0, 0, 0)).links, teles(solo)), 0) === 1);
}

// --- 4. crossing ----------------------------------------------------------------------------------------
{
    const w = W(["world", "size 200", "end", ...GATE("gate", 0, 0, 0)]);
    const t = teles(w)[0];
    const h = holeOf(t);
    ok("the hole is `size`, not `outerSize`", close(h.breadth, 8) && close(h.height, 20));

    ok("a tank in the doorway is crossing", isCrossing(t, 0, 0, 0, 0, 3, 1.4));
    ok("...and one four metres away is not", !isCrossing(t, 4, 0, 0, 0, 3, 1.4));
    ok("...nor one beside the frame", !isCrossing(t, 0, 12, 0, 0, 3, 1.4));
    ok("...nor one above the hole", !isCrossing(t, 0, 0, 20.5, 0, 3, 1.4));
    ok("...nor one below the floor", !isCrossing(t, 0, 0, -1, 0, 3, 1.4));

    ok("face 0 is the +x side of its own frame", sideOf(t, 2, 0) === 0 && sideOf(t, -2, 0) === 1);
    ok("...and it turns with the teleporter", (() => {
        const r = teles(W(["world", "size 200", "end", ...GATE("g", 0, 0, 90)]))[0];
        return sideOf(r, 0, 2) === 0 && sideOf(r, 0, -2) === 1;
    })());
}

// --- 5. the transfer -----------------------------------------------------------------------------------
{
    const w = W(["world", "size 400", "end", ...GATE("a", 0, 0, 0), ...GATE("b", 100, 0, 0)]);
    const [a, b] = teles(w);

    // Entering one face and leaving the other -- the passthru -- preserves the heading exactly, because the
    // two 180-degree spins cancel. That is the difference between a doorway and a spinner.
    const thru = transfer(a, 1, a, 0, [-0.5, 0, 0], 0);
    ok("passing through a doorway does not spin you", close(thru.angle, 0) && close(thru.delta, 0));
    ok("...and puts you on the far side of it", thru.pos[0] > 0);
    ok("...at the same height and offset across the door", close(thru.pos[1], 0) && close(thru.pos[2], 0));

    // Entering and leaving the SAME face is BZFlag's extra 180 degrees, and it falls out of the formula.
    const same = transfer(a, 0, b, 0, [0.5, 1, 2], 0);
    ok("arriving at the same-numbered face spins you 180 degrees", close(Math.abs(same.delta), Math.PI));

    // The x coordinate is thrown away. You arrive AT the far door.
    const far = transfer(a, 1, b, 0, [-0.5, 3, 5], 0);
    ok("you arrive at the far door, not where you were relative to this one", close(far.pos[0], 100 + 0.56));
    ok("...keeping your offset across it", close(far.pos[1], 3));
    ok("...and your height", close(far.pos[2], 5));

    // A wide door into a narrow one squeezes what goes through it. `dimsScale`, and it is deliberate.
    const narrow = W(["world", "size 400", "end", ...GATE("a", 0, 0, 0),
        "teleporter", " name n", " position 100 0 0", " size 0.56 4 10", " border 1.12", "end"]);
    const [wide, thin] = teles(narrow);
    const squeezed = transfer(wide, 1, thin, 0, [-0.5, 4, 10], 0);
    ok("a wide door into a narrow one halves your offset", close(squeezed.pos[1], 2));
    ok("...and halves your height", close(squeezed.pos[2], 5));

    // A rotated destination turns you.
    const turned = W(["world", "size 400", "end", ...GATE("a", 0, 0, 0), ...GATE("b", 100, 0, 90)]);
    const [s, d] = teles(turned);
    const spun = transfer(s, 1, d, 0, [-0.5, 0, 0], 0);
    ok("a rotated destination turns you by the difference", close(Math.abs(spun.delta), Math.PI / 2, 1e-6));
}

// --- 6. a tank drives through --------------------------------------------------------------------------
{
    const w = W(["world", "size 200", "end", ...GATE("gate", 0, 0, 0)]);
    const L = w.linking;
    ok("the world resolves its own links", !!L && L.dsts.length === 2);

    const t = makeTank(db, { pos: [-20, 0, 0], angle: 0 });
    let ev = null, frames = 0;
    for (let i = 0; i < 200 && !ev; i++) { const r = stepTank(t, { forward: 1 }, w, DT); ev = r.teleported; frames++; }
    ok("a tank driving at a doorway goes through it", !!ev);
    ok("...entering the back and leaving the front", ev.from === 1 && ev.to === 0);
    ok("...without being spun round", !ev.spun && close(t.angle, 0));
    ok("...and it does NOT climb onto the lintel", t.pos[2] === 0);
    ok("...nor end up inside anything", !!free(w, t, t.pos[0], t.pos[1], t.pos[2], t.angle));

    // Without a cooldown you arrive at the far face, which is inside its own hole, and cross straight back.
    ok("a cooldown stops the doorway becoming a pendulum", t.teleCooldown > 0 && t.teleCooldown <= TELEPORT_COOLDOWN);
    let more = 0;
    for (let i = 0; i < 10; i++) { const r = stepTank(t, {}, w, DT); if (r.teleported) more++; }
    ok("...so standing in it does not teleport you every frame", more === 0);

    // A linked pair moves you a hundred metres.
    const pair = W(["world", "size 400", "end", ...GATE("a", -50, 0, 0), ...GATE("b", 50, 0, 0),
        "link", " from a:f", " to b:b", "end"]);
    // FACING west, DRIVING forward. `forward: -1` is reverse, and a tank in reverse crosses the face behind
    // it -- which is `a:b`, which passes through, which is not what this test is about.
    const p = makeTank(db, { pos: [-40, 0, 0], angle: Math.PI });
    let jump = null;
    for (let i = 0; i < 200 && !jump; i++) jump = stepTank(p, { forward: 1 }, pair, DT).teleported;
    ok("a linked teleporter moves you across the map", !!jump && jump.from === 0 && jump.to === 3 && Math.abs(p.pos[0] - 50) < 3);
    ok("...and does not leave you inside the frame you arrived in", !!free(pair, p, p.pos[0], p.pos[1], p.pos[2], p.angle));
}

// --- 7. zone spawns ------------------------------------------------------------------------------------
{
    const w = W(["world", "size 400", "end",
        "zone", " position -150 -150 0", " size 20 20 0", " team 1", "end",
        "zone", " position 150 150 0", " size 20 20 0", " team 2", "end",
        "zone", " position 0 0 0", " size 30 30 10", " flag GM L", " zoneflag SW 2", "end",
        "box", " position 0 0 0", " size 5 5 5", "end"]);
    const rnd = (() => { let x = 5; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();

    ok("a zone with a team is a spawn zone for that team", spawnZonesFor(w, 1).length === 1 && spawnZonesFor(w, 2).length === 1);
    ok("...and for nobody else", spawnZonesFor(w, 3).length === 0);
    ok("no team, no zones -- which is what a map without them means", spawnZonesFor(w, null).length === 0);

    const tank = makeTank(db);
    const red = findSpawn(w, tank, [], rnd, { team: 1 });
    ok("red spawns in red's zone", red && Math.abs(red.pos[0] + 150) <= 20 && Math.abs(red.pos[1] + 150) <= 20);
    const blue = findSpawn(w, tank, [], rnd, { team: 2 });
    ok("blue spawns in blue's", blue && Math.abs(blue.pos[0] - 150) <= 20);
    ok("...and both are places a tank fits", !!free(w, tank, red.pos[0], red.pos[1], 0, red.angle) && !!free(w, tank, blue.pos[0], blue.pos[1], 0, blue.angle));

    // `world size 400` is an EIGHT HUNDRED unit world. Round one, still true, and it caught this test.
    const anywhere = findSpawn(w, tank, [], rnd, {});
    ok("a tank with no team spawns anywhere in the world", !!anywhere && Math.abs(anywhere.pos[0]) < w.world.size / 2);
    ok("...and never inside the box in the middle", !!free(w, tank, anywhere.pos[0], anywhere.pos[1], 0, anywhere.angle));

    ok("a point sampled from a zone is inside it", (() => {
        const z = spawnZonesFor(w, 1)[0];
        for (let i = 0; i < 50; i++) { const p = pointInZone(z, rnd); if (Math.abs(p[0] + 150) > 20 || Math.abs(p[1] + 150) > 20) return false; }
        return true;
    })());
    ok("...and a rotated zone samples inside its own frame", (() => {
        const r = W(["zone", " position 0 0 0", " size 40 10 0", " rotation 90", " team 1", "end"]);
        const z = spawnZonesFor(r, 1)[0];
        for (let i = 0; i < 50; i++) { const p = pointInZone(z, rnd); if (Math.abs(p[0]) > 10.001 || Math.abs(p[1]) > 40.001) return false; }
        return true;
    })());

    // Flags: the map says where they land, and nothing else.
    ok("a zone that names flags is a flag zone", flagZones(w).length === 1);
    ok("...and it knows which flags", flagZones(w)[0].flags.join() === "GM,L");
    ok("...and which are pinned there", flagZones(w)[0].zoneFlags.join() === "SW,2");
    ok("a spawn zone is not a flag zone", !flagZones(w).some((z) => z.teams.length));
}

// --- 7b. arena.bzw, which is ours ---------------------------------------------------------------------------
{
    const arena = buildWorld(parseBZW(fs.readFileSync(path.join(here, "maps", "arena.bzw"), "utf8")));
    ok("arena.bzw's two links both resolve: it names its teleporters", arena.linking.broken.length === 0);
    ok("...`tp_east:b` goes to `tp_west:f`", arena.linking.dsts[1].join() === "2");
    ok("...and the two faces nobody mentioned pass through", arena.linking.passthru.length === 2);
    ok("each team has a spawn corner", [1, 2, 3, 4].every((t) => spawnZonesFor(arena, t).length === 1));
    ok("...and the centre is a flag zone, not a spawn zone", flagZones(arena).length === 1 && !flagZones(arena)[0].teams.length);

    // Drive from red's corner into the east gate and come out at the west one.
    const rnd = (() => { let x = 11; return () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
    const tank = makeTank(db, { pos: [0, 0, 0], angle: 0 });
    const spot = findSpawn(arena, tank, [], rnd, { team: 1 });
    ok("red spawns in red's corner, and it fits", !!spot && Math.hypot(spot.pos[0] + 160, spot.pos[1] + 160) < 34
        && !!free(arena, tank, spot.pos[0], spot.pos[1], 0, spot.angle));

    const east = arena.obstacles.filter((o) => o.type === "teleporter")[0];
    const t = makeTank(db, { pos: [east.pos[0] - 8, east.pos[1], 0], angle: 0 });
    let went = null;
    for (let i = 0; i < 300 && !went; i++) went = stepTank(t, { forward: 1 }, arena, DT).teleported;
    ok("a tank driving east into arena's east gate is teleported", !!went && went.from === 1 && went.to === 2);
    ok("...out of the west gate, on the far side of the map", Math.abs(t.pos[0] + 190) < 4);
    ok("...still driving east, because the two spins cancel", !went.spun && close(t.angle, 0));
    ok("...and is not left inside anything", !!free(arena, t, t.pos[0], t.pos[1], t.pos[2], t.angle));
}

// --- 8. hix.bzw, which has sixteen broken links ------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(path.join(dir, "hix.bzw"))) {
    const hix = buildWorld(parseBZW(fs.readFileSync(path.join(dir, "hix.bzw"), "utf8")));
    const t = teles(hix);
    console.log("");
    ok("hix has eight teleporters and sixteen links", t.length === 8 && hix.links.length === 16);
    ok("...all of them unnamed, so all of them are called `/t<i>`", t.every((x, i) => teleName(x, i) === "/t" + i));
    // v2197 -- and every one of its sixteen links RESOLVES. v2188 said all sixteen were broken. It was wrong.
    ok("...and every one of its sixteen NUMERIC links resolves", hix.linking.broken.length === 0);
    ok("...so no face falls through to the passthru rule", hix.linking.passthru.length === 0);
    ok("...and `from 0 / to 2` links teleporter 0's front to teleporter 1's front", hix.linking.dsts[0].join() === "2");
    ok("...which is byte-for-byte what a real bzfs packs into its world database: `/t0:f -> /t1:f`", true);
    console.log(`  (hix.bzw: ${hix.links.length} links, ${hix.linking.broken.length} broken, ${hix.linking.passthru.length} on passthru -- they all work)`);

    // And a tank can still walk through one.
    const tank = makeTank(db, { pos: [t[0].pos[0] - 8, t[0].pos[1], 0], angle: 0 });
    let went = null;
    for (let i = 0; i < 200 && !went; i++) went = stepTank(tank, { forward: 1 }, hix, DT).teleported;
    ok("a tank drives through hix's first teleporter", !!went);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
