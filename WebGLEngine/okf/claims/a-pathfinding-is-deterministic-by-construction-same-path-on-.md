---
type: claim
title: "A* pathfinding is deterministic by construction -- same path on every machine"
description: "A* is the brain's single-agent point-to-point search, beside the Dijkstra field (many agents, one goal) and Prime Transport (constrained beam search). Open space has many equally-s"
tags: [settled, "swek-engine", v2654]
timestamp: v2654
---

# A* pathfinding is deterministic by construction -- same path on every machine

- **Status:** settled  
- **Since:** v2654

## Prediction

A* is the brain's single-agent point-to-point search, beside the Dijkstra field (many agents, one goal) and Prime Transport (constrained beam search). Open space has many equally-short paths, and the determinism question is WHICH one A* returns -- a plain heap returns a different (still shortest) one run to run, which would break bit-identical reproducibility.

## Why

brain/astar/astar.js. Two things pin the path down. (1) Integer costs and a Manhattan heuristic -- unit edges, no sqrt, no Math.hypot -- so there are literally no floats to disagree on across platforms. (2) A total-order tie-break: the open-set heap orders by (f, THEN node index), so the next node to expand is a pure function of the open set, not of the order neighbours were pushed. Among many equal-length shortest paths, A* always returns the same one. Occupancy is a plain array here; a sparse octree/SVO can feed the same blocked lookup later without touching this file.

## Measured

brain/astar/astar-selfcheck.mjs, 5 checks. Spine: the returned path is BYTE-IDENTICAL under 200 shuffled neighbour orderings, while an f-only tie-break (no index) returns DIFFERENT equal-length paths under the same shuffles -- so the test is not vacuous and the index tie-break is what fixes it. Also: the path is a valid contiguous shortest path around a wall, an unreachable goal returns null, and the source is pure integer (no transcendental). A* is now the sixth subsystem in the cross-arch fingerprint.

## Kill condition

brain/astar/astar-selfcheck.mjs. SABOTAGE: drop the node-index tie-break (compare by f only) -- the path-invariance check fails, because equal-f nodes then expand in push order. A PATHFINDER THAT PICKS A DIFFERENT ROUTE EACH RUN CANNOT BE PART OF A BIT-IDENTICAL ENGINE. Any float heuristic (Math.hypot) would break the integer determinism.

# Citations

- Code: brain/astar/astar.js (integer A*, deterministic MinHeap with (f,index) total order) + brain/astar/astar-selfcheck.mjs (5 checks, gated, sabotage-tested, path-invariance under shuffled neighbour order) + folded into tools/fingerprint as subsystem six. The brain's search trio: Dijkstra field + Prime Transport beam + A* point-to-point, all deterministic.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
