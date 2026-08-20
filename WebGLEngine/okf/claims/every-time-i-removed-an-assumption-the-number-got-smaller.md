---
type: claim
title: "Every time I removed an assumption, the number got smaller"
description: "The plan for this round was to wire greedyMesh3d into voxel-viewer.html behind a ?mesher= flag. I HAD DEFERRED THAT TWICE, BOTH TIMES SAYING 'waiting on Keith's screenshot' -- whic"
tags: [settled, "swek-engine", v2577]
timestamp: v2577
---

# Every time I removed an assumption, the number got smaller

- **Status:** settled  
- **Since:** v2577

## Prediction

The plan for this round was to wire greedyMesh3d into voxel-viewer.html behind a ?mesher= flag. I HAD DEFERRED THAT TWICE, BOTH TIMES SAYING 'waiting on Keith's screenshot' -- which would have been the THIRD instance of the habit v2576 just diagnosed (a reason that expired is a habit). A FLAG THAT DEFAULTS TO THE OLD PATH CANNOT BREAK THE OLD PATH. THE SCREENSHOT WAS NEVER THE BLOCKER.

## Why

Reading the page before touching it -- the one discipline that has paid every time this session.

## Measured

AND READING IT KILLED THE PLAN, USEFULLY. voxel-viewer.html:215 is `for (const [x, y, z, c] of voxels)` -- FOUR ELEMENTS, WHERE c IS A PALETTE INDEX. greedyMesh3d takes a BOOLEAN predicate and CANNOT SEE COLOUR: it would merge a red voxel and a blue voxel into one quad and paint the result a single colour. IT DOES NOT THROW, IT DOES NOT WARN, AND IT LOOKS LIKE A TEXTURING BUG. Wiring it in behind a flag would have been safe for the DEFAULT path and silently wrong on the new one. So: greedyMesh3dTagged -- the mask carries a TAG and a run only continues while the tag MATCHES. PROVEN: a 4x1x2 slab that is tag 1 on the left and tag 2 on the right produces TWO top quads, not one, each still fully merged within its own material; and a tagged mesh still covers EXACTLY the naive surface (tags change WHERE the cuts are, never WHICH faces exist). THEN THE NUMBER, on a 32^3 chunk of the engine's own terrain with three materials assigned by depth the way a voxel world actually assigns them: naive 4548; greedy colour-blind 1165 = 3.90x BUT THAT MESH IS WRONG, it merges grass into stone; GREEDY TAGGED 1373 = 3.31x, CORRECT. MATERIALS COST 18% MORE QUADS -- AND THE COLOUR-BLIND NUMBER WAS NEVER AVAILABLE TO SPEND.

## Kill condition

A material configuration where the tagged mesher emits a quad spanning two tags. Gated on a deliberate seam and on set-equality with the naive oracle.

# Citations

- Code: mesh/greedyMesh3d.js (greedyMesh3dTagged) + 6 more gated checks. LOOK AT THE ARC, BECAUSE IT IS THE WHOLE LESSON: v2574 said 256x -- A CUBE I INVENTED. v2576 said 4.59x -- REAL TERRAIN, but it forgot voxels have colour. v2577 says 3.31x -- REAL TERRAIN WITH REAL MATERIALS. EVERY TIME I REMOVED AN ASSUMPTION, THE NUMBER GOT SMALLER, and only the last one is a number you could spend. It is still a 70% reduction in geometry and still worth having -- but the 256x was never real, and a version of me that stopped at v2574 would have told you it was.
- Page: `/voxel-viewer.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
