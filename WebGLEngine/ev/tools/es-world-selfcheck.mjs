// Self-check for the ES WORLD: who spawns what, who owns it, and the two content types v2172 stopped
// ignoring. Runs on a synthetic universe built through the real adapter, so nothing here depends on a
// checkout of Endless Sky.
//
//   node ev/tools/es-world-selfcheck.mjs
//   node ev/tools/es-world-selfcheck.mjs /path/to/endless-sky/data     (adds a pass over the real data)
//
// The bug this file exists for: v2168 seeded the hostile spawn from (room, system) so every pilot in a
// room met the same ships -- but the seed never reached `opts.spawn`, and the ES path ALWAYS takes that
// hook. So ES ambient traffic rolled Math.random on each client and handed out ids 1..n. Two pilots
// spawned DIFFERENT ships under IDENTICAL ids, and the ownership ring split them: each adopted the
// other's position onto the wrong hull. Ambient is now deterministic and stays on the ring; anything
// only one client can have (mission npcs, unique persons) gets a private wing id instead.

import { parseES } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { spawnAmbient, pickPerson, spawnPerson, spawnPersons, personEligible, personMatches, PERSON_SPAWN_PERIOD, NO_PERSON_SPAWN_WEIGHT } from "../esFleets.js";
import { makeRng, spawnSeed, namespaceWing, ownsNpc, ownerOf, spawnerOf } from "../esAuthority.js";
import fs from "fs";
import path from "path";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

// --- a tiny galaxy, written in real ES syntax ---------------------------------------------
const SRC = `
government Republic
	"player reputation" 10
government Pirate
	"default attitude" -1
government Uninhabited

outfit "Thruster"
	"thrust" 20
	"mass" 10
outfit "Steering"
	"turn" 300
	"mass" 10
outfit "Blaster"
	"mass" 5
	weapon
		"velocity" 10
		"lifetime" 60
		"shield damage" 10
		"hull damage" 8

ship "Sparrow"
	sprite "ship/sparrow"
	attributes
		"hull" 100
		"shields" 100
		"mass" 40
		"drag" 1
		"cargo space" 20
		"outfit space" 100
		"cost" 100000
		category "Light Warship"
	outfits
		"Thruster"
		"Steering"
		"Blaster" 2

ship "Sparrow" "Sparrow (Mk II)"
	attributes
		"hull" 300
	outfits
		"Thruster" 2
		"Steering"
		"Blaster" 4

fleet "Small Republic"
	government "Republic"
	variant
		"Sparrow" 2

fleet "Small Pirate"
	government "Pirate"
	variant
		"Sparrow"

planet "Alpha Prime"
	government "Republic"
	description "A world."
planet "Gate Alpha"
	wormhole "Test Gate"
planet "Gate Beta"
	wormhole "Test Gate"

wormhole "Test Gate"
	mappable
	link Alpha Beta
	link Beta Alpha

wormhole "Secret Gate"
	link Alpha Gamma

system Alpha
	pos 0 0
	government "Republic"
	attributes "ember waste"
	link Beta
	object "Alpha Prime"
		distance 300
	object "Gate Alpha"
		distance 600
	fleet "Small Republic" 1000
	fleet "Small Pirate" 500

system Beta
	pos 100 0
	government "Pirate"
	link Alpha
	object "Gate Beta"
		distance 400
	fleet "Small Pirate" 500

system Gamma
	pos 200 0
	government "Uninhabited"

person "Nemesis"
	government "Pirate"
	frequency 500
	ship "Sparrow" "Nemesis"
		attributes
			"hull" 9000
			"shields" 9000

person "Escorted One"
	government "Republic"
	frequency 100
	ship "Sparrow (Mk II)" "Flagship"
	ship "Sparrow" "Wingman"

person "Waste Dweller"
	government "Pirate"
	frequency 100
	system
		attributes "ember waste"
	ship "Sparrow" "Duster"

person "Hai Only"
	government "Pirate"
	frequency 100
	system
		near Alpha 1
	ship "Sparrow" "Nope"
`;

const uni = buildUniverseFromES(parseES(SRC));
uni.systemById = {}; for (const s of uni.systems) uni.systemById[s.id] = s;
const sysBy = (n) => uni.systems.find((s) => s.name === n);
const ALPHA = sysBy("Alpha"), BETA = sysBy("Beta"), GAMMA = sysBy("Gamma");

// --- 1. ambient traffic is deterministic once it is given the seed --------------------------
{
    const seed = () => makeRng(spawnSeed("room-7", ALPHA.id));
    const a = spawnAmbient(ALPHA, uni, { x: 0, y: 0 }, { rng: seed() });
    const b = spawnAmbient(ALPHA, uni, { x: 0, y: 0 }, { rng: seed() });
    const shape = (l) => JSON.stringify(l.map((e) => [e.id, e.name, e.team, e.x.toFixed(3), e.y.toFixed(3)]));
    ok("a system's ambient traffic is not empty", a.length > 0);
    ok("two peers seeded from (room, system) spawn the IDENTICAL mix", shape(a) === shape(b));

    const other = spawnAmbient(ALPHA, uni, { x: 0, y: 0 }, { rng: makeRng(spawnSeed("room-8", ALPHA.id)) });
    ok("a different room gets a different mix", shape(a) !== shape(other));
    const bsys = spawnAmbient(BETA, uni, { x: 0, y: 0 }, { rng: makeRng(spawnSeed("room-7", BETA.id)) });
    ok("a different system gets a different mix", shape(a) !== shape(bsys));

    // THE REGRESSION. No rng -> Math.random -> two clients disagree while claiming the same ids.
    const r1 = spawnAmbient(ALPHA, uni, { x: 0, y: 0 }, {});
    const r2 = spawnAmbient(ALPHA, uni, { x: 0, y: 0 }, {});
    const sameIds = JSON.stringify(r1.map((e) => e.id)) === JSON.stringify(r2.map((e) => e.id));
    ok("without a seed the ids still collide (which is why the seed must be threaded)",
        sameIds || r1.length !== r2.length);

    ok("ambient ids are bare -- they belong on the ownership ring", a.every((e) => spawnerOf(e.id) === null));
    const ring = ["p1", "p2"];
    const mine = a.filter((e) => ownsNpc("p1", e.id, ring));
    ok("...and the ring splits them between the two pilots", mine.length > 0 && mine.length < a.length);
    ok("...with nobody owning the same ship twice",
        a.every((e) => ownsNpc("p1", e.id, ring) !== ownsNpc("p2", e.id, ring)));
}

// --- 2. private wings: what only one client has, only that client flies ----------------------
{
    const ships = spawnAmbient(ALPHA, uni, { x: 0, y: 0 }, { rng: makeRng(1) }).slice(0, 3);
    const ids = ships.map((e) => e.id);
    namespaceWing(ships, "p1", "m");
    ok("namespaceWing rewrites ids in place", ships.every((e, i) => e.id === "p1:m" + ids[i]));
    ok("...and the spawner owns every one of them", ships.every((e) => ownerOf(e.id, ["p1", "p2"]) === "p1"));
    ok("...so the other pilot flies none of them", ships.every((e) => !ownsNpc("p2", e.id, ["p1", "p2"])));

    // Mission npcs and persons both number from 1. One shared tag would collide them into one identity.
    const a = [{ id: 1 }], b = [{ id: 1 }];
    namespaceWing(a, "p1", "m"); namespaceWing(b, "p1", "p");
    ok("mission npcs and persons get different tags", a[0].id !== b[0].id);

    ok("no peer id -> no namespacing (solo play is untouched)",
        namespaceWing([{ id: 4 }], null, "m")[0].id === 4);
}

// --- 3. wormholes ---------------------------------------------------------------------------
{
    ok("both wormholes parsed", uni.counts.wormholes === 2);
    const gateA = uni.spobs[ALPHA.spobs.find((s) => s.name === "Gate Alpha").id];
    const gateB = uni.spobs[BETA.spobs.find((s) => s.name === "Gate Beta").id];
    ok("a wormhole planet knows it is one", gateA.isWormhole === true && gateB.isWormhole === true);
    ok("the link is read from the system it SITS in, not from the definition's first line",
        gateA.wormholeTo === BETA.id && gateB.wormholeTo === ALPHA.id);
    ok("a mappable wormhole says so", gateA.wormholeMappable === true);

    const plain = uni.spobs[ALPHA.spobs.find((s) => s.name === "Alpha Prime").id];
    ok("an ordinary world is not a door", !plain.isWormhole && plain.wormholeTo === undefined);

    const secret = uni.wormholes.find((w) => w.name === "Secret Gate");
    ok("a wormhole with no planet claiming it still resolves for the map", secret.links.length === 1);
    ok("...but is not mappable, so the map will not draw it", secret.mappable === false);
    const testGate = uni.wormholes.find((w) => w.name === "Test Gate");
    ok("a two-way wormhole declares both directions", testGate.links.length === 2);
}

// --- 4. persons -----------------------------------------------------------------------------
{
    // v2179 -- a person whose `system` filter used `near` used to be DROPPED, because the adapter could
    // only evaluate a government list and an attribute list. It now runs through the real LocationFilter.
    ok("every person is loaded, none dropped", uni.counts.persons === 4 && uni.counts.personsDropped === 0);
    ok("...including one whose filter the old parser could not evaluate", uni.persons.some((p) => p.name === "Hai Only"));

    const nem = uni.persons.find((p) => p.name === "Nemesis");
    ok("the flagship takes the person's name", nem.classes[0].name === "Nemesis");
    ok("...and its inline stat overrides are applied", nem.classes[0].armor === 9000 && nem.classes[0].shield === 9000);
    ok("...on top of the stock hull it inherits", nem.classes[0].speed > 0 && nem.classes[0].accel > 0);
    ok("frequency is read; ES's default is 100",
        nem.frequency === 500 && uni.persons.find((p) => p.name === "Waste Dweller").frequency === 100);

    const esc = uni.persons.find((p) => p.name === "Escorted One");
    ok("a person can bring a wing", esc.classes.length === 2);
    ok("...whose escorts keep their given names", esc.classes[1].name === "Wingman");
    ok("...and inherit from a VARIANT, not just a base ship (Zahniser's escorts died of this)",
        esc.classes[0].armor === 300);

    // eligibility
    const dweller = uni.persons.find((p) => p.name === "Waste Dweller");
    ok("an attribute filter is honoured", personMatches(dweller, ALPHA, uni) && !personMatches(dweller, BETA, uni));
    // v2179 -- and the filters that used to be thrown away
    const nearby = uni.persons.find((p) => p.name === "Hai Only");
    ok("a `near <system> <max>` filter is honoured",
        personMatches(nearby, ALPHA, uni) && personMatches(nearby, BETA, uni) && !personMatches(nearby, GAMMA, uni));
    ok("a person needs a system with hyperspace links (they arrive through one)",
        personEligible(nem, ALPHA, uni, null) && !personEligible(nem, GAMMA, uni, null));
    ok("a destroyed person never returns", !personEligible(nem, ALPHA, uni, (n) => n === "Nemesis"));
    ok("frequency 0 means never", !personEligible({ ...nem, frequency: 0 }, ALPHA, uni, null));

    // the roll, and ES's own weights
    ok("ES's spawn period and no-spawn weight are used verbatim",
        PERSON_SPAWN_PERIOD === 36000 && NO_PERSON_SPAWN_WEIGHT === 1000);
    ok("the same seed meets the same captain", (() => {
        const a = pickPerson(ALPHA, uni, { rng: makeRng(99) }), b = pickPerson(ALPHA, uni, { rng: makeRng(99) });
        return (a && a.name) === (b && b.name);
    })());
    ok("a person never turns up where the attempt roll fails", pickPerson(ALPHA, uni, { rng: () => 0.999, dwellFrames: 3600 }) === null);
    ok("...nor in a system with no links, however lucky the roll", pickPerson(GAMMA, uni, { rng: () => 0 }) === null);

    // frequency actually weights the draw, and "nobody" wins most of the time
    let met = 0; const who = new Map();
    for (let i = 0; i < 20000; i++) {
        const p = pickPerson(ALPHA, uni, { rng: makeRng(i + 1) });
        if (p) { met++; who.set(p.name, (who.get(p.name) || 0) + 1); }
    }
    ok(`a unique captain is actually rare (met on ${met}/20000 entries)`, met > 0 && met < 3000);
    ok("...and the rarest of them is the rarest", (who.get("Nemesis") || 0) > (who.get("Waste Dweller") || 0));

    // the ships that come out
    const born = spawnPerson(esc, uni, { x: 0, y: 0 }, { rng: makeRng(5) });
    ok("a person spawns its whole wing", born.length === 2);
    ok("...tagged with the name, so a kill can be recorded against it", born.every((e) => e._person === "Escorted One"));
    ok("...and marked unique, so nothing respawns it", born.every((e) => e._unique === true));
    ok("...flying under its own government", born.every((e) => e.govt === esc.govt));
    ok("spawnPersons returns nothing when nobody turned up", spawnPersons(ALPHA, uni, { x: 0, y: 0 }, { rng: () => 0.999 }).length === 0);
}

// --- 5. optional: the real galaxy ------------------------------------------------------------
const dir = process.argv[2];
if (dir && fs.existsSync(dir)) {
    const files = [];
    (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (f.endsWith(".txt")) files.push(p); } })(dir);
    const real = buildUniverseFromES(parseES(files.map((f) => fs.readFileSync(f, "utf8")).join("\n")));
    console.log("");
    console.log(`  (real data: ${real.counts.persons} persons, ${real.counts.personsDropped} dropped, ${real.counts.wormholes} wormholes)`);
    ok("real data: every person kept has at least one flyable ship", real.persons.every((p) => p.classes.length > 0));
    ok("real data: every person's flagship has a hull", real.persons.every((p) => p.classes[0].armor > 0 || p.classes[0].shield > 0));
    ok("real data: wormhole planets all point at a system that exists",
        Object.values(real.spobs).filter((s) => s.isWormhole).every((s) => real.systemById[s.wormholeTo]));
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
