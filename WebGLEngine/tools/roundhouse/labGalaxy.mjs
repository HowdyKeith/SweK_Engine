// WebGLEngine/tools/roundhouse/labGalaxy.mjs -- v3443
//
// THE LAB AS A GALAXY: DEVICES ARE SYSTEMS, AND A JUMP LINK IS A MEASURED RELATION WITH A NAMED KIND.
//
// *** THE ROUND THIS FILE EXISTS FOR ALMOST SHIPPED AS A DECORATION. *** cosmic-map.html has a proven graph
// (connected, two-way, shortest-path routable) built by makeGalaxy(seed, 60, 3) -- which places systems FROM A
// SEED and derives links by k-nearest-neighbour IN THE PLANE. A lab record has neither a position nor an
// adjacency, so "lab record -> galaxy node" is not wiring: it needs an answer to WHAT MAKES TWO DEVICES
// ADJACENT, and an invented answer leaves `shortestPath` TRUE AND MEANINGLESS -- a correct BFS over a made-up
// question.
//
// SO EVERY CANDIDATE AXIS WAS MEASURED BEFORE ANYTHING WAS DRAWN, AND THE FIRST ONE FAILED:
//
//   shared physics module ALONE   11 pairs, 58 components, 53 singletons, largest FOUR
//   + modules as nodes too        156 nodes and STILL 58 components -- the modules are device-private, so
//                                 adding them enlarges every island and joins none
//   shared observable NAME        81 pairs, but the top matches are `steps`, `cells`, `samples`, `omega` --
//                                 CONFIG KNOBS ECHOED INTO OUTPUTS. NOT USED. That is valueMatch's own lesson
//                                 arriving on the name axis: a name a person could have typed is not evidence.
//
// *** KEITH SAW THIS BEFORE THE MEASUREMENT DID: "it makes sense that a map with one active Space would have no
// other navigable points." On the substrate axis alone, 53 of 67 devices have no navigable neighbour at all. ***
//
// THE ANSWER WAS NOT TO PICK ONE AXIS BUT TO CARRY THREE, EACH LABELLED. That is this tree's standing rule
// applied to a graph: do not collapse two things into one label -- keep them apart and name each. An edge may
// carry more than one kind, and seven of them do.
//
//   substrate  the two devices' binds IMPORT A PHYSICS MODULE IN COMMON. Exact, cheap, verifiable from source.
//   coupling   two observables AGREE TO TEN DIGITS across devices (valueMatch). Needs a ~30s sweep, so it is
//              PASSED IN rather than computed here -- the cheap half must stay runnable without it.
//   room       the two devices' instrument pages sit in the SAME pageSections panel. Keith's OWN authored
//              grouping, and the only axis a human wrote down on purpose.
//
// MEASURED UNION: 94 distinct edges (substrate 11, room 61, coupling 29; 7 carry more than one kind), 33
// components, THE LARGEST HOLDING 31 DEVICES. That is a continent you can warp around plus 29 islands.
//
// *** THE ISLANDS ARE TRUE AND ARE NOT HIDDEN. *** They are the devices with no front door of their own
// (`page: null` is a documented, deliberate state) and no measured coupling. A map that quietly joined them up
// would be lying about the lab to make itself prettier, and cosmic-map.html's headline promise -- "proven fully
// connected, every system reachable" -- IS FALSE ON THIS DATA. The lab mode reports the component count instead
// and REFUSES to route between components, which is the honest version of the same page.
//
// LINKS FIRST, LAYOUT SECOND. Positions are DERIVED from the edges by a deterministic seeded relaxation. Placing
// nodes first and deriving links from proximity would make the map a picture OF THE LAYOUT rather than of the
// lab -- the same inversion v3045 caught in the region cache, where a transposed grid gave real terrain in the
// wrong arrangement and every aggregate agreed.
//
// NO CLOCK ANYWHERE IN HERE. This is layer 1 of three: the static layer, which needs no rig run and TRAVELS IN
// THE ZIP, so a guest who downloaded a build sees the same map as one on the live hub. The runner's timings
// (layer 2) and the session tour (layer 3) are separate and must stay separately labelled -- a star bright
// because its gate ran last night and a star bright because its VALUE DRIFTED are opposite news.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");

export const EDGE_KINDS = ["substrate", "coupling", "room"];
export const OUT = "lab-galaxy.json";

/** Undirected edge set keyed on the sorted pair, each carrying the SET of kinds that justify it. */
function edgeSet() {
    const E = new Map();
    return {
        add(a, b, kind) {
            if (!a || !b || a === b) return;
            const k = a < b ? a + "\u0000" + b : b + "\u0000" + a;
            if (!E.has(k)) E.set(k, new Set());
            E.get(k).add(kind);
        },
        list() {
            return [...E.entries()]
                .map(([k, kinds]) => { const [a, b] = k.split("\u0000"); return { a, b, kinds: [...kinds].sort() }; })
                .sort((x, y) => (x.a + x.b).localeCompare(y.a + y.b));
        },
    };
}

/** substrate: the two binds import a physics module in common. deviceModules() is the ONE parser for that. */
export function substrateEdges(deviceModules, E) {
    const names = Object.keys(deviceModules).sort();
    for (let i = 0; i < names.length; i++) {
        const mine = new Set(deviceModules[names[i]].modules || []);
        for (let j = i + 1; j < names.length; j++) {
            if ((deviceModules[names[j]].modules || []).some((m) => mine.has(m))) E.add(names[i], names[j], "substrate");
        }
    }
    return E;
}

/**
 * coupling: two observables agree to ten digits across devices.
 *
 * THE CENSUS IS AN ARGUMENT, NOT AN IMPORT. valueMatchCensus() builds every device at every mode and takes ~30s,
 * and v3395 already learned what a sweep costs behind a front door. Passing it in keeps the cheap two thirds of
 * this derivation runnable on its own, and lets the gate drive a synthetic census instead of the real one.
 */
export function couplingEdges(matches, known, E) {
    const have = new Set(known);
    for (const h of matches || []) {
        const a = h && h.a && h.a.dev, b = h && h.b && h.b.dev;
        if (a && b && a !== b && have.has(a) && have.has(b)) E.add(a, b, "coupling");
    }
    return E;
}

/**
 * room: the devices' instrument pages sit in the same pageSections panel.
 *
 * A device with `page: null` REACHES NO ROOM, and that is correct rather than missing -- the field means
 * "deliberately no front door of its own", so inventing a room for it would manufacture an edge out of an
 * absence. Those devices stay islands unless another kind reaches them.
 */
export function roomEdges(instruments, sections, known, E) {
    const secOf = {};
    for (const s of sections || []) for (const p of (s.pages || [])) secOf[p] = s.id;
    const have = new Set(known);
    const bySec = {};
    for (const r of instruments || []) {
        if (!r.device || !r.page || !have.has(r.device)) continue;
        const sec = secOf[r.page];
        if (!sec) continue;
        (bySec[sec] = bySec[sec] || new Set()).add(r.device);
    }
    for (const sec of Object.keys(bySec)) {
        const g = [...bySec[sec]].sort();
        for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) E.add(g[i], g[j], "room");
    }
    return { E, sectionOf: bySec };
}

/**
 * Positions DERIVED FROM THE EDGES by a deterministic seeded relaxation -- never the other way round.
 *
 * Fully deterministic: the seed is fixed, the node order is sorted, and no clock or Math.random is consulted, so
 * the same lab produces the same map on every machine and a diff of lab-galaxy.json means the LAB moved.
 */
export function layout(nodes, edges, { seed = 1234567, iters = 260 } = {}) {
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const idx = new Map(nodes.map((n, i) => [n, i]));
    const px = new Float64Array(nodes.length), py = new Float64Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) { const a = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.6; px[i] = Math.cos(a) * r; py[i] = Math.sin(a) * r; }
    const E = edges.map((e) => [idx.get(e.a), idx.get(e.b)]).filter(([a, b]) => a != null && b != null);
    for (let it = 0; it < iters; it++) {
        const k = 1 - it / iters;
        for (const [a, b] of E) {                                   // attract along real links
            const dx = px[b] - px[a], dy = py[b] - py[a];
            const f = 0.045 * k;
            px[a] += dx * f; py[a] += dy * f; px[b] -= dx * f; py[b] -= dy * f;
        }
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {   // repel everything
            let dx = px[j] - px[i], dy = py[j] - py[i];
            let d2 = dx * dx + dy * dy;
            if (d2 < 1e-9) { dx = 1e-4; dy = 0; d2 = 1e-8; }
            const f = (0.0016 * k) / d2;
            const ux = dx * f, uy = dy * f;
            px[i] -= ux; py[i] -= uy; px[j] += ux; py[j] += uy;
        }
    }
    let mx = 0;
    for (let i = 0; i < nodes.length; i++) mx = Math.max(mx, Math.abs(px[i]), Math.abs(py[i]));
    const sc = mx > 0 ? 0.94 / mx : 1;
    return nodes.map((n, i) => ({ id: n, x: +(px[i] * sc).toFixed(6), y: +(py[i] * sc).toFixed(6) }));
}

/** Connected components over an undirected edge list, by name. */
export function componentsOf(names, edges) {
    const adj = new Map(names.map((n) => [n, []]));
    for (const e of edges) { if (adj.has(e.a) && adj.has(e.b)) { adj.get(e.a).push(e.b); adj.get(e.b).push(e.a); } }
    const seen = new Set(), out = [];
    for (const n of names) {
        if (seen.has(n)) continue;
        const q = [n], c = [];
        seen.add(n);
        while (q.length) { const x = q.pop(); c.push(x); for (const y of adj.get(x)) if (!seen.has(y)) { seen.add(y); q.push(y); } }
        out.push(c.sort());
    }
    return out.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));
}

/**
 * Build the whole thing. Every input is INJECTED so the gate can drive it with fixtures rather than the lab.
 *
 * `layers` is the STATIC half -- no clock, travels in the zip. Two of them, kept apart on purpose:
 *   interrogated  does this device declare a planted error (plantedCoverage's declaredCensus)
 *   observables   how many numbers its baseline row carries, and whether it has a row at all
 * A device with no baseline row is `null`, NEVER 0 -- unknown and zero are different claims (v2951).
 */
export function buildLabGalaxy({ deviceModules, matches = [], instruments = [], sections = [], declared = [], baseline = null }) {
    const names = Object.keys(deviceModules).sort();
    const E = edgeSet();
    substrateEdges(deviceModules, E);
    couplingEdges(matches, names, E);
    const { sectionOf } = roomEdges(instruments, sections, names, E);
    const edges = E.list();

    const secFor = {};
    for (const [sec, set] of Object.entries(sectionOf)) for (const d of set) secFor[d] = sec;

    const declaredSet = new Set(declared);
    const brows = (baseline && baseline.devices) || {};
    const nodes = names.map((n) => ({
        id: n,
        section: secFor[n] || null,
        modules: (deviceModules[n].modules || []).length,
        interrogated: declaredSet.has(n),
        observables: brows[n] ? Object.keys(brows[n].outputs || {}).length : null,
    }));

    const comps = componentsOf(names, edges);
    const byKind = {};
    for (const k of EDGE_KINDS) byKind[k] = edges.filter((e) => e.kinds.includes(k)).length;

    return {
        note: "Layer 1 of three: STATIC. No clock, no rig run, travels in the zip. Edges are MEASURED relations and each carries its KIND.",
        captured: null,                       // deliberately no timestamp -- see labExport.mjs
        nodes,
        edges,
        placed: layout(names, edges),
        components: comps,
        islands: comps.filter((c) => c.length === 1).map((c) => c[0]),
        counts: {
            devices: names.length,
            edges: edges.length,
            byKind,
            multiKind: edges.filter((e) => e.kinds.length > 1).length,
            components: comps.length,
            largest: comps.length ? comps[0].length : 0,
            interrogated: nodes.filter((n) => n.interrogated).length,
            withBaseline: nodes.filter((n) => n.observables !== null).length,
        },
    };
}

/** Gather the real inputs. `withCoupling` is opt-in because the census is a ~30s sweep. */
export async function gather({ withCoupling = false } = {}) {
    const dim = await import("../ship/deviceInstrumentMap.mjs");
    const { INSTRUMENTS } = await import("../../physics/instruments.mjs");
    const ps = await import("../ship/pageSections.mjs");
    const pc = await import("./plantedCoverage.mjs");
    const deviceModules = dim.deviceModules();
    const names = Object.keys(deviceModules);
    let baseline = null;
    try { baseline = JSON.parse(fs.readFileSync(path.join(HERE, "lab-results-baseline.json"), "utf8")); } catch { baseline = null; }
    let matches = [];
    if (withCoupling) {
        const vm = await import("./valueMatch.mjs");
        matches = (await vm.valueMatchCensus()).matches || [];
    }
    return {
        deviceModules,
        matches,
        instruments: INSTRUMENTS,
        sections: ps.SECTIONS || ps.default || [],
        declared: pc.declaredCensus(ENG, names).declared,
        baseline,
    };
}

/* ------------------------------------------------------------------------------------------------------------
 * FRONT DOOR. Dry run by default, --write to emit -- corpus.mjs's and detectionMap's precedent, because emitting
 * on sight leaves a stale artefact behind every accidental run and A STALE MAP IS WORSE THAN NONE (v3195).
 * --------------------------------------------------------------------------------------------------------- */
const isMain = (() => { try { return path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (isMain) {
    const argv = process.argv.slice(2);
    const write = argv.includes("--write");
    const withCoupling = !argv.includes("--no-coupling");
    const g = buildLabGalaxy(await gather({ withCoupling }));
    const c = g.counts;
    console.log("THE LAB AS A GALAXY -- devices are systems, a jump link is a MEASURED relation with a named kind.\n");
    console.log(`  ${c.devices} devices, ${c.edges} jump links (${c.multiKind} carry more than one kind)`);
    for (const k of EDGE_KINDS) console.log(`     ${k.padEnd(10)} ${c.byKind[k]}`);
    if (!withCoupling) console.log("     (coupling SKIPPED: --no-coupling, so the link count is a FLOOR and not the answer)");
    console.log(`\n  ${c.components} components, largest holds ${c.largest} -- ${g.islands.length} islands`);
    console.log("  *** THE ISLANDS ARE TRUE. They are devices with no front door of their own and no measured");
    console.log("      coupling, and joining them up would be lying about the lab to make the map prettier. ***");
    console.log(`\n  static layers: ${c.interrogated} devices declare a planted error, ${c.withBaseline} carry a baseline row`);
    console.log(`  islands: ${g.islands.join(" ")}`);
    if (write) {
        const dest = path.join(ENG, OUT);
        fs.writeFileSync(dest, JSON.stringify(g, null, 1));
        console.log(`\n  WROTE ${OUT} (${(fs.statSync(dest).size / 1024).toFixed(1)} KB)`);
    } else {
        console.log(`\n  DRY RUN -- pass --write to emit ${OUT}.`);
    }
}
