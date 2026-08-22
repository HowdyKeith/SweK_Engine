// WebGLEngine/tools/roundhouse/labTour-selfcheck.mjs -- v3445
//
// Run: node tools/roundhouse/labTour-selfcheck.mjs
//
// *** THE STATE THIS GATE EXISTS FOR IS `longer`, AND IT IS THE ONE A WORKING IMPLEMENTATION LOSES. *** A tour
// records a route through a DERIVED galaxy. Replay it after the lab has grown and three things can be true, but
// only two of them are obvious: the route still walks, or it does not. The third is that it still walks AND IS
// NO LONGER THE SHORTEST -- every hop validates, every check passes, and the sentence attached to it ("the
// fewest jumps") has quietly expired. A valid/invalid reader reports that as intact, which is v3070's remembered
// result presented as a current measurement.
//
// So each of the three is DRIVEN on a fixture built to land in it, and `longer` is built by ADDING an edge --
// the lab getting better is what makes a recorded claim go stale, which is worth saying out loud.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FORMAT, ENTRY_KINDS, REPLAY_STATES, galaxyFingerprint, newTour, addEntry, addVisit, addRoute, addRecord, validate, replay, summarise } from "./labTour.mjs";
import { buildAdj, shortestPath } from "../../physics/galaxy/cosmicMap.js";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const AT = (n) => "2026-08-04T10:" + String(n).padStart(2, "0") + ":00.000Z";

// A tiny galaxy: a -- b -- c -- d, plus an unreachable island.
const mkGalaxy = (extra = []) => ({
    nodes: ["a", "b", "c", "d", "island"].map((id) => ({ id })),
    edges: [{ a: "a", b: "b", kinds: ["room"] }, { a: "b", b: "c", kinds: ["room"] }, { a: "c", b: "d", kinds: ["room"] }, ...extra],
    counts: { components: 2 },
});
// Adjacency + a shortest() built from cosmicMap's PROVEN BFS -- never a third one written here.
function harness(galaxy) {
    const names = galaxy.nodes.map((n) => n.id);
    const idx = new Map(names.map((n, i) => [n, i]));
    const links = [];
    const neighbours = new Map(names.map((n) => [n, new Set()]));
    for (const e of galaxy.edges) {
        links.push([idx.get(e.a), idx.get(e.b)], [idx.get(e.b), idx.get(e.a)]);
        neighbours.get(e.a).add(e.b); neighbours.get(e.b).add(e.a);
    }
    const adj = buildAdj(names.length, links);
    const shortest = (a, b) => { const p = shortestPath(adj, idx.get(a), idx.get(b)); return p && p.length ? p.length - 1 : null; };
    return { neighbours, shortest };
}

// ---- 1. THE FORMAT, AND THE ONE STRUCTURAL REFUSAL IT CARRIES ------------------------------------------------
{
    const G = mkGalaxy();
    const t = newTour(G, "v3445");
    addVisit(t, AT(1), "a");
    addRoute(t, AT(2), "a", "d", ["a", "b", "c", "d"], ["room", "room", "room"]);
    addRecord(t, AT(3), { device: "kepler", mode: "orbit", config: { stepsPerOrbit: 400 }, outputs: { energyErr: 1e-9 } });
    const v = validate(t);
    ok("!! a tour validates, and every entry carries its OWN `at`", v.ok && t.entries.every((e) => typeof e.at === "string"),
       `${t.entries.length} entries, problems: ${v.problems.join("; ") || "none"}.`);

    // *** THE RULE THE WHOLE LAYER RESTS ON. *** labExport has no timestamp ON PURPOSE, because two identical
    // runs must not differ. A record carrying a time would break the round-trip diff this project ships on.
    let threw = null;
    try { addRecord(t, AT(4), { device: "kepler", mode: "orbit", config: {}, outputs: {}, at: AT(4) }); } catch (e) { threw = e.message; }
    ok("!! *** a lab record carrying a timestamp is REFUSED, not stripped ***", !!threw && /LOG LINE/.test(threw),
       `"${(threw || "(accepted!)").slice(0, 110)}..." -- THE TIMESTAMP LIVES ON THE LOG LINE, NEVER ON THE RECORD (v3183's split). Refused rather than silently removed, because quietly dropping a caller's field is how a format starts meaning something other than what the caller thinks it wrote.`);
    const badKind = (() => { try { addEntry(t, AT(5), "teleport", {}); return null; } catch (e) { return e.message; } })();
    ok("...and an unknown entry kind is refused by name", !!badKind && /teleport/.test(badKind), `"${(badKind || "").slice(0, 80)}"`);
    const noAt = (() => { try { addEntry(t, null, "note", { text: "x" }); return null; } catch (e) { return e.message; } })();
    ok("...and an entry with no time of its own is refused -- this module never reads a clock", !!noAt,
       "a format whose meaning depends on when you call it is not a format, and a module that read the clock could not be tested.");
}

// ---- 2. EXPORT / IMPORT IS A BYTE ROUND TRIP -----------------------------------------------------------------
{
    const G = mkGalaxy();
    const t = newTour(G, "v3445");
    addVisit(t, AT(1), "a"); addRoute(t, AT(2), "a", "c", ["a", "b", "c"], ["room", "room"]);
    addRecord(t, AT(3), { device: "lens", mode: "map", config: { n: 8 }, outputs: { shadowAngleRad: 0.249 } });
    const wire = JSON.stringify(t);
    const back = JSON.parse(wire);
    ok("!! *** the tour survives export and import unchanged -- it is a document, not a report ***",
       JSON.stringify(back) === wire && validate(back).ok,
       `${wire.length} bytes out and back identical. KEITH'S ANSWER IS WHAT MADE THIS THE RIGHT SHAPE: "a remote guest is really just a remote user... if they were able to export and import their own interactions, if that were able to be resumed or walked through later". A LOG THE HUB KEEPS ABOUT SOMEBODY AND A FILE THAT PERSON OWNS ARE THE SAME BYTES AND OPPOSITE THINGS.`);
    ok("...and a re-imported record is byte-identical to the one that went in, config included",
       JSON.stringify(back.entries[2].record) === JSON.stringify(t.entries[2].record),
       "which is what makes a tour REPLAYABLE BY CONSTRUCTION: every record already carries the config that produced it, so anybody can feed it back to the device and get the same number. THAT is what traceability means here, and this layer inherits it rather than reinventing it.");

    const junk = validate({ format: "something-else", entries: "no" });
    ok("...and a stranger's file is untrusted input: a wrong format is refused with its problems named",
       !junk.ok && junk.problems.length >= 2,
       `${junk.problems.length} problems reported rather than one blanket rejection: ${junk.problems.slice(0, 2).join("; ")}.`);
}

// ---- 3. *** THE THREE REPLAY STATES, EACH DRIVEN -- AND `longer` IS THE ONE THAT MATTERS *** -----------------
{
    const G = mkGalaxy();
    const t = newTour(G, "v3445");
    addRoute(t, AT(1), "a", "d", ["a", "b", "c", "d"], ["room", "room", "room"]);
    addRoute(t, AT(2), "a", "c", ["a", "b", "c"], ["room", "room"]);

    // (i) INTACT -- the same galaxy
    const same = replay(t, harness(G).neighbours, harness(G).shortest);
    ok("!! replayed against the SAME galaxy, every route is intact",
       same.every((r) => r.state === "intact"),
       `${same.length} routes, states: ${same.map((r) => r.state).join(", ")}.`);

    // (ii) LONGER -- THE LAB GOT BETTER AND THE CLAIM EXPIRED. A new a--d edge makes the recorded 3-jump route
    // still perfectly walkable and no longer the fewest jumps.
    const grown = mkGalaxy([{ a: "a", b: "d", kinds: ["coupling"] }]);
    const h2 = harness(grown);
    const later = replay(t, h2.neighbours, h2.shortest);
    const r0 = later.find((r) => r.from === "a" && r.to === "d");
    ok("!! *** a route that still walks but is NO LONGER THE SHORTEST reads `longer`, not `intact` ***",
       r0 && r0.state === "longer" && r0.wasJumps === 3 && r0.nowJumps === 1,
       `a->d was ${r0 && r0.wasJumps} jumps, now ${r0 && r0.nowJumps}. *** EVERY HOP STILL VALIDATES AND EVERY CHECK PASSES; WHAT EXPIRED IS THE SENTENCE ATTACHED TO IT. A valid/invalid reader reports this as intact, which is a remembered result presented as a current measurement -- and note that ADDING AN EDGE is what caused it: THE LAB GETTING BETTER IS WHAT MAKES A RECORDED CLAIM GO STALE. ***`);
    ok("...and the untouched route beside it is still intact, so the state is per-route and not per-tour",
       later.find((r) => r.to === "c").state === "intact",
       "a tour-level flag would have condemned or excused both at once.");

    // (iii) BROKEN -- an edge is gone
    const cut = { ...G, edges: G.edges.filter((e) => !(e.a === "b" && e.b === "c")) };
    const h3 = harness(cut);
    const broke = replay(t, h3.neighbours, h3.shortest);
    const b0 = broke.find((r) => r.from === "a" && r.to === "d");
    ok("!! a route whose hop is no longer an edge reads `broken`, and NAMES THE HOP",
       b0 && b0.state === "broken" && Array.isArray(b0.brokenAt) && b0.brokenAt.join(">") === "b>c",
       `broken at ${b0 && b0.brokenAt.join(" -> ")}. "the route is broken" is not actionable; the hop is -- v3065's rule that a divergence reports a COORDINATE.`);
    ok("...and all three states are reachable, so none is a category that cannot happen",
       REPLAY_STATES.every((s) => [...same, ...later, ...broke].some((r) => r.state === s)),
       `intact / longer / broken all driven on fixtures. A CHECK THAT HAS NEVER BEEN SEEN TO FIRE MIGHT NOT FIRE (v3142).`);
    ok("...and non-route entries replay as null rather than being silently dropped",
       replay(newTourWithVisit(), harness(G).neighbours, harness(G).shortest).every((r) => r.state === null),
       "a visit has no path to invalidate, and omitting it would make the replay list stop lining up with the entry list.");
    function newTourWithVisit() { const x = newTour(G, "v3445"); addVisit(x, AT(9), "a"); return x; }
}

// ---- 4. THE FINGERPRINT SAYS WHICH MAP, AND IGNORES HOW IT WAS DRAWN -----------------------------------------
{
    const G = mkGalaxy();
    const f = galaxyFingerprint(G);
    ok("!! the fingerprint is deterministic", f === galaxyFingerprint(mkGalaxy()) && /^g[0-9a-f]{8}$/.test(f), `${f}`);
    ok("!! *** it ignores the LAYOUT, because a layout is derived from the edges ***",
       galaxyFingerprint({ ...G, placed: [{ id: "a", x: 9, y: 9 }] }) === f,
       "including the placements would make the fingerprint change for a reason that is not a change to the lab -- and layer 1's positions are a FUNCTION of the edges, so they carry no information the edges do not.");
    ok("...and it moves when an EDGE KIND changes, not only when an edge appears",
       galaxyFingerprint({ ...G, edges: G.edges.map((e, i) => i ? e : { ...e, kinds: ["substrate"] }) }) !== f,
       "the same pair justified for a different reason is a different galaxy: the kinds are what make a route mean anything.");

    const t = newTour(G, "v3445");
    addRoute(t, AT(1), "a", "c", ["a", "b", "c"], ["room", "room"]);
    const s1 = summarise(t, replay(t, harness(G).neighbours, harness(G).shortest), f);
    const s2 = summarise(t, replay(t, harness(G).neighbours, harness(G).shortest), galaxyFingerprint(mkGalaxy([{ a: "a", b: "d", kinds: ["coupling"] }])));
    ok("!! the summary SAYS whether this is the map the tour was recorded against",
       s1.sameGalaxy === true && s2.sameGalaxy === false && s1.span.first === AT(1),
       `same ${s1.sameGalaxy} / moved ${!s2.sameGalaxy}. *** THE FINGERPRINT IS NOT A LOCK. An old tour is exactly what somebody wants to walk, so a moved galaxy is REPORTED AND NEVER REFUSED -- it just must not be silent, or the page would draw a route from one map onto another and say nothing. ***`);
}

// ---- 5. ONE DEFINITION, SHARED BY THE PAGE AND THIS GATE ------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "roundhouse", "labTour.mjs"), "utf8");
    ok("!! *** labTour.mjs is PURE -- no fs, no clock, no BFS of its own ***",
       !/require\(|node:fs|node:path|Date\.now|new Date\(/.test(src) && !/function\s+bfs|shortestPath\s*\(adj/.test(src),
       "the page imports this module directly and so does this gate, so there is ONE definition of what a tour is rather than a browser copy and a node copy that drift. replay() takes `neighbours` and `shortest` AS ARGUMENTS -- the page hands it cosmicMap's proven BFS and this gate hands it the same one, and a third implementation living in labTour would be the second declaration this project names more often than any other defect.");
    ok("...and every state and kind is EXPORTED rather than spelled twice",
       Array.isArray(ENTRY_KINDS) && Array.isArray(REPLAY_STATES) && FORMAT === "swek-lab-tour/1",
       `${ENTRY_KINDS.length} kinds, ${REPLAY_STATES.length} states, format ${FORMAT}. A page carrying its own copy of these strings is how a format grows a second dialect.`);
}

// ---- 6. THE FRONT DOOR ---------------------------------------------------------------------------------------
{
    const page = fs.readFileSync(path.join(ENG, "cosmic-map.html"), "utf8");
    const nc = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    ok("!! cosmic-map.html imports labTour.mjs rather than re-implementing the format",
       /from\s*["'`]\.\/tools\/roundhouse\/labTour\.mjs["'`]/.test(nc), "one definition, both sides.");
    ok("...and it can EXPORT a tour to a file the visitor keeps",
       /download/.test(nc) && /Blob/.test(nc),
       "a file, not hub storage: it works offline, needs no account, and travels with whoever made it. THAT is what dissolved this layer's privacy weight.");
    ok("...and it can IMPORT one back and walk it",
       /type=["']file["']/.test(nc) && /replay\(/.test(nc), "resumed or walked through later, which is what Keith asked for.");
    ok("!! *** and it reports a MOVED galaxy and a `longer` route rather than drawing them silently ***",
       /longer/.test(nc) && /sameGalaxy|recorded against/.test(nc),
       "the two states a naive replay loses. A page that drew an old route on a new map without a word would be the exact failure this format was built to prevent.");
}

console.log(fails ? "\nlabTour-selfcheck: " + fails + " FAILED" : "\nlabTour-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
