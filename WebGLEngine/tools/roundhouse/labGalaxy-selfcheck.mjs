// WebGLEngine/tools/roundhouse/labGalaxy-selfcheck.mjs -- v3443
//
// Run: node tools/roundhouse/labGalaxy-selfcheck.mjs
//
// *** WHAT THIS GATE IS ACTUALLY FOR: A GRAPH IS THE EASIEST THING IN THIS TREE TO FAKE. *** A BFS over invented
// edges returns a correct answer to a made-up question, and it looks exactly like a measurement while being one.
// So the checks below are almost all about whether the EDGES MEAN ANYTHING, not about whether the routing works
// -- the routing is cosmicMap's, already proven, and is IMPORTED rather than rewritten. A second BFS here would
// be the second declaration this project names more often than any other defect.
//
// THE THREE KINDS ARE CHECKED FOR INDEPENDENT DETECTION POWER, one at a time, because three axes that all found
// the same pairs would be one axis wearing three labels -- and the measurement that started this round is
// exactly that shape in reverse: shared-physics-module ALONE gives 58 components and 53 singletons, so a map
// built on it has no navigable points at all.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLabGalaxy, componentsOf, layout, gather, EDGE_KINDS, OUT } from "./labGalaxy.mjs";
import { buildAdj, shortestPath, bfsDistances, isValidPath, components as cmComponents } from "../../physics/galaxy/cosmicMap.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// A cheap fixture: the real substrate and room axes, plus a SYNTHETIC coupling set, so this gate does not pay
// valueMatch's ~30s sweep. The census is an ARGUMENT to buildLabGalaxy precisely so this is possible.
const input = await gather({ withCoupling: false });
const names = Object.keys(input.deviceModules).sort();
const synth = [
    { a: { dev: names[0] }, b: { dev: names[1] } },
    { a: { dev: names[2] }, b: { dev: names[3] } },
];
const G = buildLabGalaxy({ ...input, matches: synth });

// ---- 1. EVERY EDGE CARRIES A KIND, AND EVERY KIND IS ONE WE DECLARED -----------------------------------------
{
    const kindless = G.edges.filter((e) => !e.kinds || e.kinds.length === 0);
    const unknown = G.edges.flatMap((e) => e.kinds).filter((k) => !EDGE_KINDS.includes(k));
    ok("!! *** every jump link names WHY it exists -- no edge without a kind ***",
       G.edges.length > 0 && kindless.length === 0 && unknown.length === 0,
       `${G.edges.length} links, ${kindless.length} kindless, ${unknown.length} of an undeclared kind. AN UNLABELLED EDGE IS THE WHOLE FAILURE THIS ROUND WAS AT RISK OF: a route over it is still a correct shortest path and still means nothing.`);
    ok("...and an edge may carry MORE THAN ONE kind rather than being forced to pick",
       G.counts.multiKind >= 1,
       `${G.counts.multiKind} link(s) are justified two ways. Collapsing those to one kind would throw away the fact that two devices are related for two independent reasons -- TWO THINGS WEARING ONE LABEL, run backwards.`);
    ok("...and no device is adjacent to itself", G.edges.every((e) => e.a !== e.b), "a self-loop is a hop that goes nowhere and would shorten every route through it.");
}

// ---- 2. *** EACH KIND HAS INDEPENDENT DETECTION POWER -- DROP IT AND THE GRAPH MOVES *** ---------------------
{
    const full = componentsOf(names, G.edges).length;
    const rows = [];
    for (const k of EDGE_KINDS) {
        const without = G.edges.filter((e) => e.kinds.some((x) => x !== k));
        const only = G.edges.filter((e) => e.kinds.includes(k));
        rows.push({ k, without: componentsOf(names, without).length, only: componentsOf(names, only).length, n: only.length });
    }
    for (const r of rows) say(`${r.k.padEnd(10)} ${String(r.n).padStart(3)} links -- alone: ${r.only} components; with it removed: ${r.without}`);
    ok("!! *** dropping ANY kind splits the galaxy further -- none of the three is decorative ***",
       rows.every((r) => r.without > full),
       `union is ${full} components and every removal raises it (${rows.map((r) => r.k + "->" + r.without).join(", ")}). A kind whose removal changed nothing would be an axis that found only pairs another axis already had -- ONE AXIS WEARING THREE LABELS.`);
    ok("...and removing a kind can only ADD components, never remove one",
       rows.every((r) => r.without >= full),
       "monotonicity: a subgraph cannot connect what the supergraph left apart. A violation would mean the edge list and the component walk disagree.");
    ok("!! *** the substrate axis ALONE is unnavigable, which is why there are three ***",
       rows.find((r) => r.k === "substrate").only >= 50,
       `substrate alone: ${rows.find((r) => r.k === "substrate").only} components over ${names.length} devices. *** MEASURED BEFORE ANYTHING WAS DRAWN, AND IT IS WHAT KEITH PREDICTED IN ADVANCE: "a map with one active Space would have no other navigable points." Adding the 89 physics modules as nodes too gives the SAME component count -- the modules are device-private, so it enlarges every island and joins none. ***`);
}

// ---- 3. ROUTING IS cosmicMap's, IMPORTED AND NOT REWRITTEN --------------------------------------------------
{
    const idx = new Map(names.map((n, i) => [n, i]));
    const links = [];
    for (const e of G.edges) { links.push([idx.get(e.a), idx.get(e.b)]); links.push([idx.get(e.b), idx.get(e.a)]); }
    const adj = buildAdj(names.length, links);

    const big = G.components[0];
    const a = idx.get(big[0]), b = idx.get(big[big.length - 1]);
    const p = shortestPath(adj, a, b);
    const d = bfsDistances(adj, a)[b];
    ok("!! *** a route inside a component is a REAL path, and it is the shortest -- graded by the proven code ***",
       Array.isArray(p) && p.length > 1 && isValidPath(adj, p) && p.length - 1 === d,
       `${big[0]} -> ${big[big.length - 1]} in ${p ? p.length - 1 : "-"} jumps, BFS says ${d}, isValidPath ${p ? isValidPath(adj, p) : false}. shortestPath/bfsDistances/isValidPath are IMPORTED FROM physics/galaxy/cosmicMap.js -- writing a second BFS here would be a second definition of the one thing on this page that was already proven.`);

    ok("...and cosmicMap's own component count agrees with this file's",
       cmComponents(names.length, adj).count === G.counts.components,
       `cosmicMap says ${cmComponents(names.length, adj).count}, labGalaxy says ${G.counts.components}. TWO INDEPENDENT WALKS OF ONE GRAPH, COMPARED -- which is the check this project's most-repeated defect exists for.`);

    // *** THE HONEST REFUSAL. cosmic-map.html's headline promises "proven fully connected -- every system
    // reachable" and "any route you plot is the shortest". ON LAB DATA THE FIRST HALF IS FALSE, and a page that
    // kept saying it would be describing the seeded galaxy while showing the real one.
    const island = G.islands[0];
    const far = shortestPath(adj, idx.get(big[0]), idx.get(island));
    ok("!! *** routing to an island REFUSES rather than inventing a hop ***",
       far === null || far === undefined || far.length === 0,
       `${big[0]} -> ${island} returns ${JSON.stringify(far)}. THE ISLANDS ARE TRUE: ${G.islands.length} devices have no front door of their own and no measured coupling, so there is genuinely nowhere to jump from them. A map that quietly joined them up would be lying about the lab to make itself prettier.`);
}

// ---- 4. THE ISLANDS AND THE COMPONENTS PARTITION -- NOTHING FALLS BETWEEN ------------------------------------
{
    const flat = G.components.flat();
    ok("!! the components PARTITION the device set -- every device in exactly one, none invented",
       flat.length === names.length && new Set(flat).size === names.length && flat.slice().sort().join() === names.join(),
       `${flat.length} placed across ${G.components.length} components against ${names.length} devices. v3429's rule: a census whose categories do not partition lets something fall between them and go uncounted.`);
    ok("...and the island list is exactly the singleton components, derived rather than kept alongside",
       G.islands.slice().sort().join() === G.components.filter((c) => c.length === 1).map((c) => c[0]).sort().join(),
       `${G.islands.length} islands. A SECOND LIST NOBODY COMPARES is what this would be if it were maintained by hand.`);
}

// ---- 5. THE STATIC LAYERS: NO CLOCK, AND UNKNOWN IS NOT ZERO ------------------------------------------------
{
    ok("!! *** there is no timestamp anywhere in the artefact -- layer 1 is STATIC by construction ***",
       G.captured === null && !JSON.stringify(G).match(/\d{4}-\d{2}-\d{2}T/),
       "labExport carries no timestamp ON PURPOSE (two identical runs must not differ; THE CONFIG IS THE PROVENANCE), and this layer inherits that. The runner's timings and the session tour are layers 2 and 3 and must stay SEPARATELY LABELLED -- a star bright because its gate ran last night and a star bright because its VALUE DRIFTED are opposite news.");
    // *** THREE STATES, NOT TWO. A device can have NO baseline row, a row with numbers, or A ROW HOLDING ZERO
    // OBSERVABLES -- and the third is the one that found a real defect. ***
    //
    // v3443 measured TWO empty rows and they were there for opposite reasons: `lbm` DELIBERATELY (it has no
    // defaults(), and v3186 froze its ABSENCE on purpose "so the day it grows one the gate says so"), and
    // `vibrations` NOT DELIBERATELY -- its build() returned { config, observables:{...} } NESTED while
    // labExport's runRecord walks Object.entries(out) at the TOP LEVEL keeping only finite numbers, so both keys
    // were objects and BOTH WERE DROPPED. The only gate that checks the lab's VALUES rather than its
    // RELATIONSHIPS had been watching nothing at all for that device from v3336 to v3446.
    //
    // *** FIXED AT v3446, AND THE ANTIDOTE THIS FILE WROTE FIRED EXACTLY AS WRITTEN: "FIX IT AND THIS LINE GOES
    // RED: REMOVE THE NAME, DO NOT RAISE THE COUNT." The name is removed. *** Measured across all 67 parsed
    // devices before choosing the fix: 66 FLAT, ONE NESTED -- so the outlier was the bind and not the shared
    // reader, and teaching runRecord a second accepted shape would have put the burden on sixty-six correct
    // devices to accommodate one wrong one. AND THE REGISTRY ALREADY SAID SO: vibrationsBind declares
    // `observables: VIBRATIONS_OBSERVABLES`, a FLAT list of names, so the declaration and the return shape had
    // disagreed since v3336 and nothing compared them -- and THE DECLARATION WAS THE HALF THAT WAS RIGHT.
    //
    // WHAT REMAINS TRUE AND IS ASSERTED HERE: no PARSED device carries an empty row. lbm still does and is
    // invisible to this list because the parser cannot see it -- see the population line below.
    const noRow = G.nodes.filter((n) => n.observables === null);
    const emptyRow = G.nodes.filter((n) => n.observables === 0).map((n) => n.id).sort();
    ok("!! a device with no baseline row reads null, NEVER 0 -- unknown and zero are different claims",
       noRow.every((n) => n.observables === null),
       `${noRow.length} device(s) have no baseline row at all. UNKNOWN IS NOT ZERO (v2951) -- rendering them as an empty star would claim the lab measured nothing there, when nobody has asked.`);
    ok("!! *** no parsed device carries a baseline row holding ZERO observables (vibrations closed at v3446) ***",
       emptyRow.length === 0,
       `empty rows among the ${G.nodes.length} parsed devices: ${emptyRow.join(", ") || "(none)"}. IF THIS GOES RED, A NEW DEVICE IS EMITTING A SHAPE runRecord CANNOT READ -- check whether its build() returns its observables FLAT, which is what all ${G.nodes.length} of them do. DO NOT WIDEN runRecord TO ACCEPT THE OUTLIER.`);

    // *** A THIRD FINDING, FALLING OUT OF THE SAME COMPARISON: THE REGISTRY AND THE BASELINE DISAGREE ABOUT THE
    // POPULATION IN BOTH DIRECTIONS, AND NOTHING HAD COMPARED THEM. *** `lbm` has a baseline row and is NOT
    // parsed out of the registry by deviceModules(); five registry devices have NO baseline row at all
    // (whitedwarf, centrifuge, invariants, poisson, compose -- every one a recent addition, so the baseline is
    // five rows behind). REPORTED rather than failed: which list is the population is a question about what the
    // number is FOR, and the honest answer is that the baseline is owed a re-freeze and the parser is owed a
    // look at lbm. TWO DECLARATIONS ABOUT ONE THING THAT NOBODY EVER COMPARED -- found by a round about a map.
    const brows = new Set(Object.keys((input.baseline && input.baseline.devices) || {}));
    const ids = new Set(G.nodes.map((n) => n.id));
    const onlyBaseline = [...brows].filter((x) => !ids.has(x)).sort();
    const onlyRegistry = [...ids].filter((x) => !brows.has(x)).sort();
    ok("REPORTED: THREE COUNTS OF THE DEVICE POPULATION, AND THE LAST GAP IS EXPLAINED RATHER THAN DRIFT", true,
       `in the baseline only: ${onlyBaseline.join(", ") || "(none)"}; in the registry only: ${onlyRegistry.join(", ") || "(none)"}. ` +
       `*** v3443 FOUND THREE COUNTS THAT NO TWO OF AGREED: 68 in DEVICE_NAMES, 67 parsed by deviceModules(), 63 baseline rows. TWO OF THE THREE GAPS ARE NOW CLOSED AT v3446 -- the baseline gained the five it was behind (whitedwarf, centrifuge, invariants, poisson, compose) after all 63 existing rows were compared first and read MOVED 0 / VANISHED 0. *** ` +
       `AND THE REMAINING GAP IS NOT A PARSER BUG. \`lbm\` is the ONE row of 68 spelled \`lbm: makeLbmDevice,\` -- a bare factory reference rather than \`() => bind\` -- and makeLbmDevice is defined INLINE IN devices.mjs, so THERE IS NO lbmBind.mjs FOR THE PARSER TO POINT AT. deviceModules() maps a device to its BIND FILE, and lbm has none, so its absence is CORRECT. *** WIDENING THE REGEX WOULD MAKE IT MATCH AND THEN FAIL TO RESOLVE A FILE THAT DOES NOT EXIST -- which is worse than the honest silence, and is why this is written down rather than fixed. ***`);

    ok("...and `interrogated` is read from plantedCoverage rather than guessed",
       G.counts.interrogated > 0 && G.counts.interrogated < names.length,
       `${G.counts.interrogated} of ${names.length} declare a planted error. Neither 0 nor all -- a layer that lit every star equally would be a field with no information in it.`);
}

// ---- 6. LINKS FIRST, LAYOUT SECOND -- PROVEN BY CHANGING THE LINKS -------------------------------------------
{
    const a = layout(names, G.edges), b = layout(names, G.edges);
    ok("!! the layout is DETERMINISTIC -- same lab, same map, on every machine",
       JSON.stringify(a) === JSON.stringify(b),
       "seeded relaxation, sorted node order, no clock and no Math.random. So a diff of lab-galaxy.json means THE LAB MOVED and never that the map was redrawn.");

    const fewer = G.edges.slice(0, Math.max(1, Math.floor(G.edges.length / 2)));
    const c = layout(names, fewer);
    const moved = a.filter((p, i) => Math.abs(p.x - c[i].x) > 1e-6 || Math.abs(p.y - c[i].y) > 1e-6).length;
    ok("!! *** the positions are DERIVED FROM THE EDGES -- halve the links and the map moves ***",
       moved > names.length / 3,
       `${moved} of ${names.length} nodes move. *** THE INVERSION THIS PROVES IS NOT THERE: if positions came first and links were derived from proximity, the map would be a picture OF THE LAYOUT rather than of the lab -- v3045's transposed region, which gave real terrain in the wrong arrangement while every aggregate agreed. ***`);
    ok("...and every node lands inside the unit square the page draws into",
       a.every((p) => Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1),
       "scaled from the relaxation's own extent rather than clamped, so a node is never silently stacked on the border.");
}

// ---- 7. A ROOM EDGE IS NEVER INVENTED FOR A DEVICE WITH NO FRONT DOOR ----------------------------------------
{
    const withPage = new Set((input.instruments || []).filter((r) => r.device && r.page).map((r) => r.device));
    const bogus = G.edges.filter((e) => e.kinds.includes("room") && (!withPage.has(e.a) || !withPage.has(e.b)));
    ok("!! *** `page: null` reaches no room, and no room edge is manufactured out of that absence ***",
       bogus.length === 0,
       `${bogus.length} room link(s) touch a device with no instrument page. THE FIELD MEANS "deliberately no front door of its own" -- a documented state, not a gap -- so inventing a neighbourhood for it would turn a considered decision into an edge.`);
    const nodesWithSection = G.nodes.filter((n) => n.section).length;
    say(`${nodesWithSection} of ${names.length} devices reach a pageSections room; the rest are reachable only by substrate or coupling, or not at all`);
}

// ---- 8. THE EMITTED ARTEFACT, IF ONE HAS BEEN WRITTEN --------------------------------------------------------
{
    const dest = path.join(ENG, OUT);
    if (!fs.existsSync(dest)) {
        ok("REPORTED: no lab-galaxy.json on disk yet -- the tool is dry-run by default", true,
           "corpus.mjs's and detectionMap's precedent: emitting on sight leaves a stale artefact behind every accidental run, and A STALE MAP IS WORSE THAN NONE (v3195). Run with --write.");
    } else {
        const j = JSON.parse(fs.readFileSync(dest, "utf8"));
        ok("the emitted artefact reparses and carries nodes, edges and placements", Array.isArray(j.nodes) && Array.isArray(j.edges) && Array.isArray(j.placed) && j.placed.length === j.nodes.length,
           `${j.nodes.length} nodes, ${j.edges.length} links, ${j.placed.length} placements.`);
        ok("...and it names its own component count and island list so the page never has to re-derive them",
           typeof j.counts?.components === "number" && Array.isArray(j.islands),
           `${j.counts?.components} components, ${j.islands?.length} islands. THE PAGE IS A VIEWER: it must not compute a second opinion about the lab's shape.`);
    }
}

// ---- 9. THE FRONT DOOR -- A TOOL WITH NO PAGE IS UNFINISHED --------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "cosmic-map.html"), "utf8");
    const noComments = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    ok("!! cosmic-map.html FETCHES the artefact rather than re-deriving the lab's shape",
       /fetch\(\s*["'`]\.\/lab-galaxy\.json/.test(noComments) && !/valueMatchCensus|deviceModules\(/.test(noComments),
       "THE PAGE IS A VIEWER. A second opinion about which devices are adjacent would be the second-declaration defect on the one page whose whole point is that its graph is proven.");
    ok("...and it routes with the IMPORTED shortestPath, not a second BFS",
       /shortestPath\(/.test(noComments) && /from\s*["'`]\.\/physics\/galaxy\/cosmicMap\.js/.test(noComments),
       "so a route is graded by the same proven code in both galaxies.");
    ok("!! *** the page states that the LAB galaxy is NOT fully connected, rather than repeating the seeded galaxy's promise ***",
       /NOT fully connected/.test(noComments),
       "the header still promises 'proven fully connected' FOR THE SEEDED GALAXY and that remains true; saying it over lab data would be describing one galaxy while showing another.");
    ok("...and every jump link's KIND is offered as a filter, so a route can be read one relation at a time",
       EDGE_KINDS.every((k) => noComments.includes('k_' + k)),
       "substrate, coupling and room each get a toggle. A union with no filter would hide which relation a hop rests on.");
    ok("...and an absent artefact is NAMED rather than drawn as an empty map",
       /labErr/.test(noComments) && /--write/.test(page),
       "the tool is dry-run by default, so 'not emitted yet' is the ordinary state on a fresh tree and is a DIFFERENT FACT from a broken page -- v3047's rule that a blank canvas is not a bug report.");
}

console.log(fails ? "\nlabGalaxy-selfcheck: " + fails + " FAILED" : "\nlabGalaxy-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
