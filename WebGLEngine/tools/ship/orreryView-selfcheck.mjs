// WebGLEngine/tools/ship/orreryView-selfcheck.mjs -- v4186
//
// GATES world/orreryView.mjs, ui/orreryDraw.js, tools/ship/orreryBake.mjs and orrery.html -- the VIEW half of
// the orrery, which last round deliberately left unbuilt.
//
// *** SECTION 2 IS THE ONE WITH A HISTORY, AND IT IS THE SAME HISTORY AS SECTION 1 OF orrery-selfcheck. ***
// Both bugs this round produced were FALSE ACCUSATIONS that looked completely fine on screen:
//
//   - buildOrrery read only `b.paths`. The baked orrery.json carries `files` and no `paths`, so every body
//     loaded in the browser got licenceFor(undefined), came back UNPAPERED, and the page drew all fourteen
//     dependencies in the ratchet's red. Nothing threw. The node gate said twelve were CAPTURED at the same
//     moment the page said none were.
//   - ui/orreryDraw.js read `field.water[idx]` as a per-cell wet mask. repoHeightfield's `water` is
//     { areas, ways } -- polygons -- so that index is undefined for every cell, every lake would have been
//     painted as dry ground, and again nothing would have looked wrong.
//
// The shape both share: a wrong answer that renders. That is what this file is for.
//
// Run: node tools/ship/orreryView-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { phaseFor, positionAt, apparentPx, levelFor, terrainEntriesFor, extentOf, slowestPeriod,
         ZOOM_SYSTEM, ZOOM_PLANET, ZOOM_TERRAIN, ZOOM_NAMES, PLANET_PX, TERRAIN_PX } from "../../world/orreryView.mjs";
import { buildOrrery, CAPTURED, UNPAPERED, UNPAPERED_BASELINE } from "../../world/orrery.mjs";
import { bakePayload, serialise, readBaked, drift, BAKE_PATH } from "./orreryBake.mjs";
import { scanVendor, listFileSizes, dirBytes, listFiles } from "./orreryScan.mjs";
import { repoHeightfield } from "../../world/repoHeightfield.js";
import { isWetCell, biomeColour, STATE_COLOUR } from "../../ui/orreryDraw.js";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) WHERE A BODY IS comes from its period and nothing else.
{
    ok(phaseFor("three") === phaseFor("three"), "phaseFor is a function of the name, so the same tree draws the same picture twice");
    ok(phaseFor("three") !== phaseFor("krbn"), "and different names get different phases -- otherwise co-orbital bodies would overlap exactly");
    const ps = ["a", "b", "c", "krbn", "three", "jolt", "wasm"].map(phaseFor);
    ok(ps.every((p) => p >= 0 && p < 2 * Math.PI), "every phase lands in [0, 2*PI)");
    ok(new Set(ps.map((p) => p.toFixed(9))).size === ps.length, "and seven names give seven distinct phases");
    ok(phaseFor(null) === phaseFor(""), "a missing name does not throw; it is treated as the empty one");

    const b = { name: "krbn", a: 10, period: 200 };
    const p0 = positionAt(b, 0), pT = positionAt(b, 200), pH = positionAt(b, 100);
    ok(Math.abs(Math.hypot(p0.x, p0.y) - 10) < 1e-12, "a body sits exactly on its own orbit radius");
    ok(Math.abs(pT.x - p0.x) < 1e-9 && Math.abs(pT.y - p0.y) < 1e-9,
        "*** after one full period it is back where it started -- the whole point of driving the angle from T ***");
    ok(Math.abs(pH.x + p0.x) < 1e-9 && Math.abs(pH.y + p0.y) < 1e-9, "and at half a period it is exactly opposite");

    // *** THE CONTROL: A SECOND SPEED KNOB WOULD BREAK THIS, AND THERE ISN'T ONE. *** Two bodies on the same
    // axis must stay locked together forever, because they have the same period. If positionAt read any
    // per-body rate the tree does not derive, they would drift apart and the co-orbital ring would be a lie.
    const x = { name: "box3d", a: 9.6, period: 187 }, y = { name: "htmx", a: 9.6, period: 187 };
    const sep = (t) => Math.abs((positionAt(x, t).angle - positionAt(y, t).angle) - (positionAt(x, 0).angle - positionAt(y, 0).angle));
    ok(sep(0) < 1e-12 && sep(500) < 1e-9 && sep(50000) < 1e-6,
        "two co-orbital bodies keep exactly their opening separation after 50000 days -- there is no second speed knob");

    // slower further out, which is Kepler's whole content
    const inner = { name: "i", a: 3, period: 33 }, outer = { name: "o", a: 9.6, period: 187 };
    const arc = (bd, t) => Math.abs(2 * Math.PI * t / bd.period);
    ok(arc(inner, 10) > arc(outer, 10), "in ten days the inner body sweeps more angle than the outer one");

    const dead = { name: "z", a: 5, period: 0 };
    ok(Number.isFinite(positionAt(dead, 7).x), "a zero period holds the body still rather than dividing by zero");
    ok(Number.isFinite(positionAt(b, NaN).x), "and a NaN time does not put it at NaN either");
}

// 2) *** THE FALSE ACCUSATION. *** A body loaded from the BAKE must read the same as one from the SCAN.
{
    const live = scanVendor(ENG, REPO);
    const baked = readBaked();
    ok(!!baked && Array.isArray(baked.bodies) && baked.bodies.length > 0, "orrery.json exists and has bodies");

    const fromScan = buildOrrery(live, { today: "2026-08-30" });
    const fromBake = buildOrrery(baked.bodies, { today: "2026-08-30" });
    ok(fromScan.captured === fromBake.captured,
        `*** the bake and the scan agree on how many bodies are CAPTURED (${fromBake.captured} vs ${fromScan.captured}) -- reading only b.paths made the browser say 0 while node said ${fromScan.captured} ***`);
    ok(fromScan.unpapered.join(",") === fromBake.unpapered.join(","),
        `and on WHICH are unpapered (${fromBake.unpapered.join(",") || "none"})`);

    // the direct statement of the bug: a body carrying ONLY `files` must still find its licence
    const filesOnly = buildOrrery([{ name: "x", bytes: 10, arrived: "2026-01-01", files: [{ path: "LICENSE", bytes: 1 }, { path: "a.js", bytes: 9 }] }], { today: "2026-08-30" });
    ok(filesOnly.bodies[0].state === CAPTURED,
        "*** a body given `files` and no `paths` finds its licence -- the baked shape is files-only ***");
    const pathsOnly = buildOrrery([{ name: "x", bytes: 10, arrived: "2026-01-01", paths: ["LICENSE", "a.js"] }], { today: "2026-08-30" });
    ok(pathsOnly.bodies[0].state === CAPTURED, "and a body given `paths` and no `files` still does too -- the scanner's shape");
    ok(buildOrrery([{ name: "x", bytes: 10, files: [{ path: "a.js", bytes: 9 }] }]).bodies[0].state === UNPAPERED,
        "control: a files-only body with NO licence file is still reported unpapered, so the fix did not paper everything over");
    ok(buildOrrery([{ name: "x", bytes: 1, files: [null, { bytes: 3 }] }]).bodies[0].state === UNPAPERED,
        "and a malformed files entry does not throw");
}

// 3) THE BAKE IS DETERMINISTIC AND CURRENT.
{
    const a = serialise(bakePayload(ENG, REPO)), b = serialise(bakePayload(ENG, REPO));
    ok(a === b, "two bakes of an unchanged tree are byte-identical -- a snapshot that churns cannot detect change");
    ok(a === fs.readFileSync(BAKE_PATH, "utf8"),
        "*** orrery.json on disk IS what the tree says right now -- run: node tools/ship/orreryBake.mjs --write ***");
    const d = drift(ENG, REPO);
    ok(d.length === 0, "and drift() agrees: " + (d.join("; ") || "no differences"));

    // drift must actually be able to speak. A staleness check that cannot go red is decoration.
    const tmp = path.join(ENG, ".orrery-drift-probe.json");
    const bent = JSON.parse(fs.readFileSync(BAKE_PATH, "utf8"));
    bent.bodies[0].bytes += 1;
    bent.bodies.push({ name: "__ghost__", arrived: null, bytes: 1, files: [] });
    fs.writeFileSync(tmp, JSON.stringify(bent));
    const dd = drift(ENG, REPO, tmp);
    fs.unlinkSync(tmp);
    ok(dd.some((m) => /__ghost__/.test(m) && /no longer in vendor/.test(m)), "a body in the bake that vendor/ no longer has is named");
    ok(dd.some((m) => /bytes/.test(m)), "and a body whose size changed is named, with both numbers");
    ok(drift(ENG, REPO, path.join(ENG, "no-such-file.json")).length === 1, "a missing bake is one clear message, not a crash");
}

// 4) ONE WALK OF THE TREE, so a planet's size and its terrain describe the same body.
{
    const name = fs.readdirSync(path.join(ENG, "vendor"), { withFileTypes: true }).filter((e) => e.isDirectory())[0].name;
    const dir = path.join(ENG, "vendor", name);
    const files = listFileSizes(dir);
    ok(files.length === listFiles(dir).length, "listFileSizes reports exactly as many files as listFiles");
    ok(files.reduce((n, f) => n + f.bytes, 0) === dirBytes(dir),
        `*** the per-file sizes sum to dirBytes (${dirBytes(dir)}) -- the radius and the terrain come from ONE walk ***`);
    ok(files.every((f) => typeof f.path === "string" && Number.isFinite(f.bytes) && f.bytes >= 0), "every entry is a path and a non-negative size");
}

// 5) *** WHICH CELLS ARE WATER. *** field.water is polygons, not a mask, and reading it as one is silent.
{
    const entries = [
        { path: "src/a.js", lines: 40000 }, { path: "src/b.js", lines: 30000 },
        { path: "data/x.json", lines: 50000 }, { path: "data/y.json", lines: 45000 },
    ];
    const f = repoHeightfield(entries);
    ok(!Array.isArray(f.water) && f.water && Array.isArray(f.water.areas),
        "*** repoHeightfield.water is { areas, ways } -- polygons. Indexing it per cell yields undefined for EVERY cell ***");
    ok(f.water[0] === undefined, "which is exactly why the first draft of orreryDraw painted every lake as dry ground and looked fine");

    let wet = 0, land = 0;
    for (let i = 0; i < f.biomes.length; i++) (isWetCell(f, i) ? wet++ : land++);
    ok(wet > 0 && land > 0, `isWetCell separates the field into ${wet} wet and ${land} dry cells rather than answering one way for all of them`);
    ok(f.stats.lakeFiles === 2, "the two .json files were laid as lakes, so there is real water to find");
    ok(wet >= f.stats.wetCells, `and every cell repoHeightfield counted as wet (${f.stats.wetCells}) is one isWetCell agrees on`);

    // the biome ids repoHeightfield actually emits must all resolve to a colour, or land would render as water
    const seen = new Set(f.biomes);
    for (const id of seen) {
        const c = biomeColour(id);
        ok(Array.isArray(c) && c.length === 3 && c.every((v) => v >= 0 && v <= 1), `biome id ${id} resolves to an rgb triple`);
    }
    ok(!seen.has(undefined), "and no cell carries an undefined biome id");
    // plains is the fallback for an unknown extension, and it must NOT be 0, or every unrecognised file would be a lake
    const odd = repoHeightfield([{ path: "a/thing.wibble", lines: 100 }, { path: "a/other.wibble", lines: 90 }]);
    ok(odd.stats.lakeFiles === 0, "*** a file with an unrecognised extension is LAND, not water -- id 0 must mean water alone ***");
}

// 6) THE ZOOM IS READ OFF THE MAGNIFICATION, not set beside it.
{
    ok(ZOOM_SYSTEM < ZOOM_PLANET && ZOOM_PLANET < ZOOM_TERRAIN, "the three levels are ordered, so comparing them means something");
    ok(ZOOM_NAMES.length === 3 && ZOOM_NAMES[ZOOM_TERRAIN] === "terrain", "and each has a name at its own index");
    ok(levelFor(0) === ZOOM_SYSTEM && levelFor(PLANET_PX - 1) === ZOOM_SYSTEM, "under the planet threshold it is the system view");
    ok(levelFor(PLANET_PX) === ZOOM_PLANET && levelFor(TERRAIN_PX - 1) === ZOOM_PLANET, "at the threshold exactly, it is a planet");
    ok(levelFor(TERRAIN_PX) === ZOOM_TERRAIN && levelFor(1e6) === ZOOM_TERRAIN, "and past the terrain threshold, ground");
    ok(levelFor(NaN) === ZOOM_SYSTEM && levelFor(undefined) === ZOOM_SYSTEM, "a nonsense magnification falls back to the widest view rather than throwing");
    ok(PLANET_PX < TERRAIN_PX, "the thresholds are in order, so there is no level that can never be reached");

    const b = { name: "krbn", radius: 0.588, a: 9.6, period: 187 };
    ok(Math.abs(apparentPx(b, 100) - 117.6) < 1e-9, "apparent size is the DIAMETER (2r), which is what a viewer judges");
    // monotone: zooming in can only ever move you up the levels, never back down
    let prev = -1, monotone = true;
    for (let px = 1; px < 4000; px += 7) { const l = levelFor(apparentPx(b, px)); if (l < prev) monotone = false; prev = l; }
    ok(monotone, "*** zooming in never takes you back to a wider level -- the level is a function of the magnification ***");
}

// 7) THE TERRAIN ENTRIES ARE THE TREE'S OWN BYTES, with no invented line count.
{
    const body = { name: "x", files: [{ path: "a/b.js", bytes: 1234 }, { path: "c.json", bytes: 5 }] };
    const e = terrainEntriesFor(body);
    ok(e.length === 2 && e[0].path === "a/b.js", "one entry per file, paths carried through");
    ok(e[0].lines === 1234 && e[1].lines === 5,
        "*** `lines` IS the byte count, unscaled -- dividing by a bytes-per-line guess would put a number in the data no file has ***");
    ok(terrainEntriesFor({ name: "y" }).length === 0 && terrainEntriesFor(null).length === 0, "a body with no files gives no entries rather than throwing");
    ok(terrainEntriesFor({ files: [{ path: "a", bytes: -5 }] })[0].lines === 0, "a negative size clamps to zero rather than digging a hole");
    // and they must actually build a field
    const f = repoHeightfield(terrainEntriesFor(body));
    ok(f.grid > 0 && f.max > f.min, "and repoHeightfield accepts them, producing a field with relief");
}

// 8) FRAMING NUMBERS a renderer needs, from the system rather than guessed.
{
    const sys = buildOrrery(readBaked().bodies, { today: "2026-08-30" });
    const far = extentOf(sys), slow = slowestPeriod(sys);
    ok(far > 0, `extentOf gives the outermost edge (${far.toFixed(2)}), so a view can frame the system without a magic number`);
    ok(sys.bodies.every((b) => b.a + b.radius <= far + 1e-9), "and no body sticks out past it -- the RADIUS is included, not just the axis");
    ok(slow > 0 && sys.bodies.every((b) => b.period <= slow + 1e-9), `slowestPeriod (${slow.toFixed(1)}) is at least every body's period`);
    ok(extentOf(null) === 0 && slowestPeriod(null) === 0, "and an empty system answers 0 rather than -Infinity");

    // *** A BODY'S AGE IS THE SAME ALL DAY. *** Math.round on a fractional day count ticked the age over at
    // NOON, so this gate (which passes a midnight date, and only ever passed a midnight date) read krbn at
    // a = 9.6 while a browser running the same orrery.json that same evening drew it at a = 10.20. Every
    // check here passed throughout: round and floor agree exactly at midnight, which is the one instant the
    // gate ever looked at. Checking ACROSS the day is what catches it.
    const acrossDay = [0, 1, 6, 11, 12, 13, 18, 23].map((h) =>
        buildOrrery([{ name: "k", bytes: 1, arrived: "2026-08-19", files: [] }], { today: new Date(Date.UTC(2026, 7, 30, h, 0, 0)) }).bodies[0]);
    ok(new Set(acrossDay.map((b) => b.ageDays)).size === 1,
        `*** a body reads the same age at every hour of the day (${acrossDay.map((b) => b.ageDays).join(",")}) -- round ticked it over at noon ***`);
    ok(acrossDay[0].ageDays === 11, "and that age is 11 days, counting whole days elapsed rather than rounding to the nearest");
    ok(new Set(acrossDay.map((b) => b.a.toFixed(9))).size === 1, "so the axis does not jump mid-afternoon");
    const arrivalDay = buildOrrery([{ name: "k", bytes: 1, arrived: "2026-08-30", files: [] }], { today: new Date(Date.UTC(2026, 7, 30, 22, 0, 0)) }).bodies[0];
    ok(arrivalDay.ageDays === 0, "a body is 0 days old all through the day it arrived, including at 22:00");

    // ageKnown: an undated body is DISTINGUISHABLE from one that arrived today, which is what the scanner says
    const undated = buildOrrery([{ name: "u", bytes: 1, arrived: null, files: [] }], { today: "2026-08-30" }).bodies[0];
    const today = buildOrrery([{ name: "t", bytes: 1, arrived: "2026-08-30", files: [] }], { today: "2026-08-30" }).bodies[0];
    ok(undated.a === today.a, "an undated body is placed on the innermost orbit, because it has to be placed somewhere");
    ok(undated.ageKnown === false && today.ageKnown === true,
        "*** but ageKnown tells them apart, so the view can mark the placement as a default rather than a measurement ***");
}

// 9) THE WIRING. Each of these files must actually reach the next, or the page draws from nothing.
{
    const draw = read("ui/orreryDraw.js"), html = read("orrery.html"), view = read("world/orreryView.mjs");
    // *** noComments, NOT codeOnly: these are STRING LITERALS. *** codeOnly() blanks strings as well as
    // comments, so `from "./world/orrery.mjs"` becomes `from ""` and every import check below passes on an
    // empty file. That mistake has been made twice in this tree already.
    const drawS = noComments(draw), htmlS = noComments(html);
    ok(/from\s+"\.\.\/world\/orreryView\.mjs"/.test(drawS), "orreryDraw imports the view model rather than recomputing positions");
    ok(/from\s+"\.\.\/world\/repoHeightfield\.js"/.test(drawS), "and repoHeightfield for the surface");
    ok(/from\s+"\.\.\/world\/worleyBiomes\.js"/.test(drawS), "and worleyBiomes for the colours -- the tree's palette, not a new one");
    ok(/from\s+"\.\/world\/orrery\.mjs"/.test(htmlS), "orrery.html builds the system with the real model");
    ok(/fetch\("\.\/orrery\.json"\)/.test(htmlS), "and loads the baked scan, since a browser cannot run git");

    // *** codeOnly for CODE SHAPES: the point is that no string or comment mentioning these can satisfy it. ***
    const drawC = codeOnly(draw), viewC = codeOnly(view);
    ok(!/\bfield\.water\s*\[/.test(drawC), "*** orreryDraw never indexes field.water as an array again -- that is the silent bug ***");
    ok(/isWetCell\s*\(/.test(drawC), "it asks isWetCell instead");
    ok(!/Math\.random|Date\.now|performance\.now/.test(viewC), "the view model has no clock and no randomness: the same tree draws the same picture");
    ok(!/\bdocument\b|\bwindow\b/.test(viewC), "and no DOM, so a gate and a browser see identical numbers");
    ok(!/require\(|node:/.test(codeOnly(read("world/orrery.mjs"))), "world/orrery.mjs stays pure enough for a browser to import");

    // the html must not have grown a second copy of the physics
    ok(!/Math\.sqrt\s*\(.*\*.*\*/.test(codeOnly(html)), "orrery.html does not compute an orbit of its own");

    // *** AND THE PROSE MUST CARRY THE TWO BUGS, because the next person to touch this will reach for both. ***
    ok(/false accusation/i.test(prose(read("tools/ship/orreryView-selfcheck.mjs"))), "this gate says in prose what it is guarding against");
    ok(/water/i.test(prose(draw)) && /polygon|areas/i.test(prose(draw)), "orreryDraw explains why field.water is not a mask");
    ok(/paths/i.test(prose(read("world/orrery.mjs"))) && /files/i.test(prose(read("world/orrery.mjs"))), "orrery.mjs explains why it accepts either shape");
}

// 10) THE RATCHET STILL HOLDS, read through the view's own path.
{
    const sys = buildOrrery(readBaked().bodies, { today: "2026-08-30" });
    ok(sys.unpapered.length === UNPAPERED_BASELINE,
        `${sys.unpapered.length} bodies with no licence provenance against a baseline of ${UNPAPERED_BASELINE}: ${sys.unpapered.join(", ") || "none"}`);
    ok(Object.keys(STATE_COLOUR).length === 3, "every posture has a colour, so none of the three can render as an unstyled default");
    ok(STATE_COLOUR[UNPAPERED] !== STATE_COLOUR[CAPTURED], "and unpapered does not share a colour with captured");
}

console.log(`orreryView-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether the picture is BEAUTIFUL. What is checked is that it is true --
that the bake and the scan name the same captured bodies, that a lake is a lake, that zooming in
cannot take you to a wider view, and that no number on screen was invented to be drawn.`);
process.exit(fail ? 1 : 0);
