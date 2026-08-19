---
type: claim
title: "The cosmic map is a galaxy you can verify -- proven connected, two-way, and shortest-path routable"
description: "A star map for the port that carries the verification a map usually lacks. The galaxy is one connected piece, so every system is reachable and no system is marooned; every hyperspa"
tags: [settled, "swek-engine", v2758]
timestamp: v2758
---

# The cosmic map is a galaxy you can verify -- proven connected, two-way, and shortest-path routable

- **Status:** settled  
- **Since:** v2758

## Prediction

A star map for the port that carries the verification a map usually lacks. The galaxy is one connected piece, so every system is reachable and no system is marooned; every hyperspace link is two-way, so a route in is a route back; and any route plotted between two systems is the shortest one -- the fewest jumps breadth-first search allows, with every hop a real link. These are graph facts, proven, not drawn. Click two systems on the map and the path shown is guaranteed minimal.

## Why

physics/galaxy/cosmicMap.js: makeGalaxy builds a deterministic spiral galaxy and stitches any separate pieces together so it is connected by construction; components counts connected pieces and finds an island; asymmetricLinks catches a one-way link; bfsDistances and shortestPath give minimal jump counts and routes; isValidPath confirms every hop is a link. cosmic-map.html draws the systems and links and lets you click two systems to route between them, reporting connectivity, two-wayness, and whether the route matches the breadth-first distance.

## Measured

cosmicMap-selfcheck.mjs, 3 checks: the sixty-system map is one connected component and cutting a system's links splits it into two, which the reachability check sees; the map has zero one-way links and removing one direction of a link is flagged; and across nine sampled routes every path is exactly the breadth-first distance with every hop a real link, plus a hand-built graph where the two-jump route is taken over the three-jump one.

## Kill condition

physics/galaxy/cosmicMap-selfcheck.mjs. SABOTAGE: swap the breadth-first frontier for a depth-first stack, which still finds a route but not the shortest, and the route stops matching the minimal jump count. HONEST SCOPE: the galaxy is generated deterministically, not the real Endless Sky systems -- the verification (connectivity, symmetry, shortest routing) is what matters and works on any system graph, so loading the real map is a data step. The routing is unweighted jumps; real fuel or danger costs would make it a weighted shortest path. The integer routing is fold-ready but gated.

# Citations

- Code: physics/galaxy/cosmicMap.js + physics/galaxy/cosmicMap-selfcheck.mjs + cosmic-map.html. A map that proves reachability, two-way links, and minimal routes -- a navigation chart with a verification spine.
- Page: `cosmic-map.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
