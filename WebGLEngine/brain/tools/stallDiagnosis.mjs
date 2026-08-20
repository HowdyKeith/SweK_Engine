// brain/tools/stallDiagnosis.mjs -- v2852
//
// WHY THE MAZE WALKER STOPPED, ANSWERED AT THE MOMENT IT STOPS.
//
// Keith: "the walker will run into a wall and instead of looking for a secondary path, after it should realize
// it is stopped, but not stuck." That phrasing is the diagnosis: STOPPED, NOT STUCK. The walker is not blocked --
// it is standing where the field told it to stand, because the field is wrong there. And the walker is RIGHT to
// refuse: it will not enter a wall.
//
// THREE THINGS CAN PRODUCE THAT SYMPTOM, AND THEY HAVE COMPLETELY DIFFERENT FIXES. A single "it got stuck again"
// cannot tell them apart, which is why this exists -- the same lesson as the model bench's refused-versus-
// malformed split and the occlusion taxonomy: separate the causes that need opposite responses.
//
//   WALLS TOO CHEAP    The brain has NO concept of "impassable". A wall is a steep, EXPENSIVE cell, and it is
//                      only a wall if crossing it costs more than ANY detour around it. brain-maze.html derives
//                      this: 1 + slopeK*(WALL_H/CELL) > W*H. On a 48^2 grid WALL_H=4000 clears it; on 96^2 the
//                      largest detour is 9216 cells and 4000 does NOT. The page scales WALL_H in the size
//                      dropdown's handler -- and NOWHERE ELSE, and nothing checks it. If that invariant ever
//                      breaks, Dijkstra's shortest path goes THROUGH a wall, the field points into it, and the
//                      walker correctly refuses. FIX: raise WALL_H. Not a walker change.
//   FIELD TRUNCATED    The GPU backend is fixed-iteration Jacobi. If it runs out of sweeps before distance
//                      propagates from the goal, the field beyond that radius is flat or wrong and there is no
//                      gradient to descend. FIX: raise the sweep cap. Not a walker change either.
//   FIELD HAS A BASIN  A spurious local minimum: the walker has descended into a bowl that is not the goal. An
//                      exact Dijkstra cannot produce one; a truncated sweep can. FIX: same as above.
//
// ONLY IF ALL THREE ARE CLEAN is it a WALKER problem -- and then the honest answer is stall detection plus a
// memory of where it has already been, because "look for a secondary path" requires knowing which paths were
// already tried. NOTHING ABOUT EVOLVING A NEW POLICY FIXES THE FIRST THREE: a policy cannot learn its way out of
// a gradient that is not there, it can only learn to compensate for a broken map.
//
// Pure, no imports.

// The maze's own invariant, lifted out of a comment in brain-maze.html and made checkable.
// A wall cell costs 1 + slopeK*(WALL_H/CELL) to enter; the worst detour is bounded by the cell count.
export function wallCost(wallH, { cell = 4, slopeK = 3 } = {}) { return 1 + slopeK * (wallH / cell); }

export function wallsAreImpassable(W, H, wallH, { cell = 4, slopeK = 3, margin = 1.0 } = {}) {
    const worstDetour = W * H;
    const cost = wallCost(wallH, { cell, slopeK });
    return {
        ok: cost > worstDetour * margin,
        cost, worstDetour,
        neededWallH: Math.ceil(((worstDetour * margin) - 1) * cell / slopeK),
        why: cost > worstDetour * margin
            ? "a wall costs more than the longest possible detour, so the shortest path cannot go through one"
            : "A WALL IS CHEAPER THAN THE LONGEST DETOUR -- the shortest path will go THROUGH a wall, the field will point into it, and the walker will correctly refuse and stall",
    };
}

// Stall detection: no meaningful displacement over a window while the field says there is somewhere to go.
// A walker sitting still AT THE GOAL is not stalled, and neither is one that has been asked to stop.
export function detectStall(history, { window: win = 30, minMove = 0.5 } = {}) {
    if (!history || history.length < win) return { stalled: false, reason: "not enough history yet", samples: history ? history.length : 0 };
    const recent = history.slice(-win);
    let moved = 0;
    for (let i = 1; i < recent.length; i++) moved += Math.hypot(recent[i].x - recent[i - 1].x, recent[i].z - recent[i - 1].z);
    if (recent[recent.length - 1].atGoal) return { stalled: false, reason: "at the goal", moved };
    return { stalled: moved < minMove, moved, window: win, reason: moved < minMove ? "no meaningful movement over the window" : "moving" };
}

// THE WHOLE POINT: when it stalls, say WHICH of the causes it is, in the order that matters -- cheapest fix and
// most likely cause first. Returns a cause plus what to actually do about it.
export function diagnose({ stall, grid, field }) {
    if (!stall || !stall.stalled) return { stalled: false };

    const walls = wallsAreImpassable(grid.W, grid.H, grid.wallH, grid);
    if (!walls.ok) {
        return {
            stalled: true, cause: "WALLS_TOO_CHEAP", fix: `raise WALL_H to at least ${walls.neededWallH} for this ${grid.W}x${grid.H} grid`,
            detail: walls.why, cost: walls.cost, worstDetour: walls.worstDetour, walkerAtFault: false,
        };
    }
    if (field && field.truncated) {
        return {
            stalled: true, cause: "FIELD_TRUNCATED", fix: `raise the sweep cap: ran ${field.iters}, needed ${field.needed}`,
            detail: "the solver ran out of sweeps before distance reached here, so there is no gradient to descend", walkerAtFault: false,
        };
    }
    if (field && field.minima > 0) {
        return {
            stalled: true, cause: "FIELD_HAS_BASIN", fix: "the field has a spurious local minimum -- use the exact CPU solver or raise the sweep cap",
            detail: `${field.minima} false minima in the field; an exact Dijkstra cannot produce one`, walkerAtFault: false,
        };
    }
    // Everything about the MAP checks out, so now it is genuinely the walker.
    return {
        stalled: true, cause: "WALKER", walkerAtFault: true,
        fix: "the map is sound: walls are impassable, the field is complete and has no false minimum. This is a walker problem -- it needs a memory of where it has already been to choose a different path",
        detail: "and note that evolving a new policy would NOT have helped with any of the other three causes",
    };
}
