// Self-check for ev/esLocation.js — Endless Sky's LocationFilter.
//
//   node ev/tools/es-location-selfcheck.mjs
//   node ev/tools/es-location-selfcheck.mjs /path/to/endless-sky/data
//
// There were three of these in the adapter, each a different subset. The mission one silently ignored
// 773 filter keys across the base game, of which 567 were `not` blocks -- and ignoring a `not` does not
// narrow a filter, it inverts it. A mission whose source is "any Republic world, NOT Earth" was being
// offered on Earth. The person and news filters honestly dropped what they could not evaluate, which was
// the right instinct at the wrong price: it threw away content.
//
// Three rules are pinned harder than the rest because all three were wrong somewhere:
//
//   * `attributes` is a LIST OF SETS. Names within a set OR; the sets AND. `attributes a b` means
//     "a or b". The persons and news filters required ALL of them -- backwards.
//   * `distance <max>` sets the MAXIMUM, not both bounds. The mission filter read `distance 3` as
//     min = max = 3, so a mission meant for anywhere within three jumps was offered only at exactly three.
//   * A system too far away, or unreachable, FAILS -- ES's Distance() returns -1 and then -1 < min, even
//     when the minimum is zero.

import { parseES, parseESFiles } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { buildFilter, bareName, matchesPlanet, matchesSystem, setIntersects, makeEnv } from "../esLocation.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// A line of systems: Sol -- Rim -- Deep -- Void (uninhabited, unlinked from the chain's far end).
const uni = buildUniverseFromES(parseES([
    'government "Rep"',
    'government "Pir"',
    'government "None"',
    'planet "Earth"', '\tgovernment "Rep"', '\tattributes urban rich', '\tdescription "d"',
    'planet "Mars"', '\tgovernment "Rep"', '\tattributes urban', '\tdescription "d"',
    'planet "Hole"', '\tgovernment "Pir"', '\tattributes dive', '\tdescription "d"',
    'planet "Rock"', '\tgovernment "None"', '\tdescription "d"',
    'system "Sol"', '\tpos 0 0', '\tgovernment "Rep"', '\tattributes core',
    '\tlink "Rim"', '\tobject "Earth"', '\t\tdistance 100', '\tobject "Mars"', '\t\tdistance 200',
    'system "Rim"', '\tpos 10 0', '\tgovernment "Rep"',
    '\tlink "Sol"', '\tlink "Deep"', '\tobject "Rock"', '\t\tdistance 100',
    'system "Deep"', '\tpos 20 0', '\tgovernment "Pir"',
    '\tlink "Rim"', '\tobject "Hole"', '\t\tdistance 100',
    'system "Void"', '\tpos 99 0', '\tgovernment "None"',
].join("\n")));
uni.systemById = {}; for (const s of uni.systems) uni.systemById[s.id] = s;
const sys = (n) => uni.systems.find((s) => s.name === n);
const pl = (n) => Object.values(uni.spobs).find((p) => p.name === n);
const env = (origin) => makeEnv(uni, { origin: origin != null ? sys(origin).id : null });
const F = (lines) => buildFilter(parseES(["source", ...lines].join("\n")).children[0]);
const mp = (f, name, origin) => matchesPlanet(f, pl(name), env(origin));
const ms = (f, name, origin) => matchesSystem(f, sys(name), env(origin), false);

// --- 1. a bare name is not a filter --------------------------------------------------------------
{
    ok("a bare `source \"Earth\"` is a name", bareName(parseES('source "Earth"').children[0]) === "Earth");
    ok("...and a block is not", bareName(parseES('source\n\tgovernment "Rep"').children[0]) === null);
    ok("an empty filter matches everything", F([]).isEmpty && mp(F([]), "Hole"));
}

// --- 2. attributes: a LIST of SETS, OR within, AND across ------------------------------------------
{
    ok("setIntersects is an OR", setIntersects(["a", "b"], ["b"]) && !setIntersects(["a"], ["b"]));

    const anyOf = F(['\tattributes urban dive']);
    ok("`attributes a b` means a OR b", mp(anyOf, "Earth") && mp(anyOf, "Hole"));
    ok("...and matches nothing that has neither", !mp(anyOf, "Rock"));

    const bothLines = F(['\tattributes urban', '\tattributes rich']);
    ok("two `attributes` lines mean BOTH (the sets AND)", mp(bothLines, "Earth"));
    ok("...so a planet with only one of them fails", !mp(bothLines, "Mars"));

    // THE BUG: requiring every name in one set. Earth has urban+rich; Mars only urban.
    const oneLine = F(['\tattributes urban rich']);
    ok("one line with two names is OR, not AND -- Mars matches on `urban` alone", mp(oneLine, "Mars"));

    // Against a SYSTEM, an attribute set may be satisfied by the system OR any of its planets.
    ok("a system matches on its own attribute", ms(F(['\tattributes core']), "Sol"));
    ok("...or on one of its planets'", ms(F(['\tattributes rich']), "Sol") && !ms(F(['\tattributes rich']), "Deep"));
}

// --- 3. government, planet, system ------------------------------------------------------------------
{
    ok("a government list is an OR", mp(F(['\tgovernment "Rep" "Pir"']), "Earth") && mp(F(['\tgovernment "Rep" "Pir"']), "Hole"));
    ok("...and excludes the rest", !mp(F(['\tgovernment "Rep"']), "Hole"));
    ok("a planet list matches by name", mp(F(['\tplanet "Earth"']), "Earth") && !mp(F(['\tplanet "Earth"']), "Mars"));
    ok("a system list constrains the planet's system", mp(F(['\tsystem "Sol"']), "Earth") && !mp(F(['\tsystem "Sol"']), "Hole"));
    ok("values may also come from child lines, as ES reads them",
        mp(F(['\tgovernment', '\t\t"Rep"']), "Earth"));
}

// --- 4. not: nested and inline ---------------------------------------------------------------------
{
    const nested = F(['\tgovernment "Rep"', '\tnot', '\t\tplanet "Earth"']);
    ok("a nested `not` block excludes", mp(nested, "Mars") && !mp(nested, "Earth"));

    const inline = F(['\tgovernment "Rep"', '\tnot planet "Earth"']);
    ok("an inline `not planet ...` excludes the same way", mp(inline, "Mars") && !mp(inline, "Earth"));

    const notAttr = F(['\tnot attributes urban']);
    ok("`not attributes urban` keeps what is not urban", mp(notAttr, "Hole") && !mp(notAttr, "Earth"));

    // THE BUG THIS FILE EXISTS FOR: ignoring the `not` would have matched Earth too.
    const republicNotEarth = F(['\tgovernment "Rep"', '\tnot', '\t\tplanet "Earth"']);
    ok("\"any Republic world, NOT Earth\" is not offered on Earth", !mp(republicNotEarth, "Earth"));
    ok("...and is offered on Mars", mp(republicNotEarth, "Mars"));

    ok("a `not` may nest inside a `not`", (() => {
        const f = F(['\tnot', '\t\tnot', '\t\t\tplanet "Earth"']);
        return mp(f, "Earth") && !mp(f, "Mars");
    })());
}

// --- 5. near and distance ---------------------------------------------------------------------------
{
    ok("a bare `near <system>` means one jump (LocationFilter.h: centerMaxDistance = 1)",
        ms(F(['\tnear "Sol"']), "Sol") && ms(F(['\tnear "Sol"']), "Rim") && !ms(F(['\tnear "Sol"']), "Deep"));
    ok("`near <system> <max>` widens it", ms(F(['\tnear "Sol" 2']), "Deep"));
    ok("`near <system> <min> <max>` sets both bounds",
        !ms(F(['\tnear "Sol" 1 2']), "Sol") && ms(F(['\tnear "Sol" 1 2']), "Rim"));
    ok("an unreachable system is out of range at any minimum", !ms(F(['\tnear "Sol" 0 40']), "Void"));

    // THE OTHER BUG: `distance 3` sets the MAXIMUM, not both bounds.
    ok("`distance <max>` is a maximum, measured from the player's system",
        mp(F(['\tdistance 2']), "Hole", "Sol") && mp(F(['\tdistance 2']), "Earth", "Sol"));
    ok("...and excludes what lies beyond it", !mp(F(['\tdistance 1']), "Hole", "Sol"));
    ok("`distance <min> <max>` sets both", !mp(F(['\tdistance 1 2']), "Earth", "Sol") && mp(F(['\tdistance 1 2']), "Hole", "Sol"));
    ok("with no origin, a `distance` filter matches nothing", !mp(F(['\tdistance 5']), "Earth", null));
}

// --- 6. neighbor -------------------------------------------------------------------------------------
{
    const nextToPirates = F(['\tneighbor', '\t\tgovernment "Pir"']);
    ok("`neighbor` matches a system LINKED to one that matches", ms(nextToPirates, "Rim"));
    ok("...and not the matching system itself", !ms(nextToPirates, "Deep"));
    ok("...nor one two jumps away", !ms(nextToPirates, "Sol"));
    ok("an inline `neighbor government ...` reads the same", ms(F(['\tneighbor government "Pir"']), "Rim"));
    ok("a planet inherits its system's neighbours", mp(F(['\tneighbor government "Pir"']), "Rock"));
}

// --- 7. a ship-category filter never matches a place ---------------------------------------------------
{
    ok("`category` makes the filter about ships, so no planet matches", !mp(F(['\tcategory "Light Warship"']), "Earth"));
    ok("...and no system either", !ms(F(['\tcategory "Light Warship"']), "Sol"));
}

// --- 8. the real galaxy -------------------------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const gather = (d) => { let o = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.name.startsWith("_")) continue; const p = path.join(d, e.name); if (e.isDirectory()) o = o.concat(gather(p)); else if (e.name.endsWith(".txt")) o.push(p); } return o; };
    const U = buildUniverseFromES(parseESFiles(gather(dir).map((f) => fs.readFileSync(f, "utf8"))));
    U.systemById = {}; for (const s of U.systems) U.systemById[s.id] = s;
    const E = makeEnv(U, { origin: U.systems[0].id });

    const filters = [];
    for (const m of U.esMissions) for (const c of m.children) if (["source", "destination", "waypoint", "stopover"].includes(c.tokens[0]) && c.children && c.children.length) filters.push(c);
    console.log("");
    console.log(`  (real data: ${filters.length} mission LocationFilters, ${U.counts.persons} persons, ${U.counts.news} news)`);

    let threw = 0, withNot = 0, withNear = 0, withNeighbor = 0;
    const planets = Object.values(U.spobs).filter((p) => p.landable).slice(0, 60);
    for (const node of filters) {
        let f;
        try { f = buildFilter(node); } catch (e) { threw++; continue; }
        if (f.not.length) withNot++;
        if (f.near) withNear++;
        if (f.neighbor.length) withNeighbor++;
        for (const p of planets) { try { matchesPlanet(f, p, E); } catch (e) { threw++; } }
    }
    ok(`real data: all ${filters.length} mission filters build and match without throwing`, threw === 0);
    ok(`real data: ${withNot} of them carry a \`not\` block that used to be ignored`, withNot > 400);
    ok(`real data: ${withNear} use \`near\`, ${withNeighbor} use \`neighbor\``, withNear > 0 && withNeighbor > 0);
    ok("real data: no person is dropped for a filter we cannot evaluate", U.counts.personsDropped === 0);
    ok("real data: no news item is either", U.counts.newsDropped === 0);
    ok("real data: every person's filter is a built filter, not a bespoke object",
        U.persons.filter((p) => p.filter).every((p) => Array.isArray(p.filter.attributes) && "isEmpty" in p.filter));

    // The one news item the old parser threw away, because its filter used `neighbor`.
    ok("real data: the `neighbor`-filtered news item is back", U.news.some((n) => n.filter.neighbor.length));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
