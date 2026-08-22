// physics/galaxy/cosmicMap-selfcheck.mjs
//
// Run: node physics/galaxy/cosmicMap-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// The cosmic map held to the things a star map has to be true about, not just draw. The galaxy must be one connected piece
// -- every system reachable, no marooned island -- and the check must notice when a system is cut off. Every hyperspace
// link must be two-way, and the check must catch a one-way link. And a plotted route must be the SHORTEST one: as many jumps
// as breadth-first search says and no more, with every hop a real link. The sabotage swaps the breadth-first frontier for a
// depth-first one, which still finds A route but not the shortest, and the gate refuses it -- because on a map, "a way
// there" and "the fewest jumps there" are not the same promise.
import { makeGalaxy, buildAdj, bfsDistances, shortestPath, components, asymmetricLinks, isValidPath } from "./cosmicMap.js";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const G = makeGalaxy(42, 60, 3), n = G.systems.length, adj = buildAdj(n, G.links);

// ---- 1. THE GALAXY IS ONE CONNECTED PIECE, AND AN ISLAND IS DETECTED --------------------------------
{
    const whole = components(n, adj).count;
    // maroon system 0: drop every link touching it
    const cut = G.links.filter((e) => e[0] !== 0 && e[1] !== 0);
    const islanded = components(n, buildAdj(n, cut)).count;
    ok("!! every system is reachable, and a marooned system is detected", whole === 1 && islanded === 2,
       "the whole map is " + whole + " connected component; cutting one system's links splits it into " + islanded + " -- the reachability check sees the island.");
}

// ---- 2. EVERY HYPERSPACE LINK IS TWO-WAY, AND A ONE-WAY LINK IS CAUGHT ------------------------------
{
    const clean = asymmetricLinks(G.links);
    const broken = G.links.filter((e, i) => !(e[0] === G.links[0][1] && e[1] === G.links[0][0]));  // drop the reverse of link 0
    ok("!! all links are two-way, and a one-way link is caught", clean === 0 && asymmetricLinks(broken) > 0,
       "the generated map has " + clean + " one-way links; removing one direction of a link leaves " + asymmetricLinks(broken) + " unmatched -- a route in with no route back is flagged.");
}

// ---- 3. A PLOTTED ROUTE IS THE SHORTEST ONE, AND EVERY HOP IS A REAL LINK ---------------------------
{
    const dist = bfsDistances(adj, 0);
    let allMinimal = true, allValid = true, checked = 0;
    for (let b = 1; b < n; b += 7) { const p = shortestPath(adj, 0, b); if (!p) continue; checked++; if (p.length - 1 !== dist[b]) allMinimal = false; if (!isValidPath(adj, p)) allValid = false; }
    // a hand-built graph with a known answer: 0-4-3 (2 hops) beats 0-1-2-3 (3 hops)
    const test = buildAdj(5, [[0, 1], [1, 0], [1, 2], [2, 1], [2, 3], [3, 2], [0, 4], [4, 0], [4, 3], [3, 4]]);
    const known = shortestPath(test, 0, 3);
    ok("!! a route is the fewest jumps, every hop a real link", allMinimal && allValid && checked > 4 && known.length - 1 === 2,
       "across " + checked + " routes every path is exactly the breadth-first distance and every hop is a link; and on a graph where 0->3 is two jumps or three, the route takes the two-jump way.");
}

console.log(fails ? "\ncosmicMap-selfcheck: " + fails + " FAILED" : "\ncosmicMap-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
