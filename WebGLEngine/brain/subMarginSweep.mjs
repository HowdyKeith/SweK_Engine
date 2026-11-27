// WebGLEngine/brain/subMarginSweep.mjs -- UNNUMBERED (the version is chosen at ship time; the registration is "FOLLOW-UP 9" of brain/SUB_FIELD_NAV_WIP.md, the gate is brain/subMarginSweep-selfcheck.mjs)
//
// THE ANY-ANGLE ARM'S MARGINS SWEPT: the ladder's top rung T and the vertical margin V of brain/subHardNav.mjs's `any` arm (hard-islands and hard-gaps). subHardNav is CALLED, not edited: flyHard takes the ladder, and the vertical margin is moved through the scenario's minDepth
// (keel + V > minDepth is keel + 5 > minDepth - (V - 5)), which moves the plan's block test and the ship test together and leaves the collision test, which reads the real keel and depth, alone.
"use strict";
import * as N from "./subFieldNav.mjs";
import * as H from "./subHardNav.mjs";

export const KINDS = Object.freeze(["hard-islands", "hard-gaps"]), ARM = "any";
export const TOPS = Object.freeze([8, 12, 16, 20, 24]), VERTS = Object.freeze([2, 5, 8, 12]), INCUMBENT = Object.freeze({ top: 12, vert: 5 });
export const HELD9 = Object.freeze(N.range(901, 960)), SETS = Object.freeze({ dev: H.HARD_SETS.dev, held9: HELD9 });
/** The 20 cells, tops outer and verticals inner: [{ top, vert }]. */
export const CELLS = Object.freeze(TOPS.flatMap((top) => VERTS.map((vert) => Object.freeze({ top, vert }))));
export const cellName = (c) => `T${c.top}V${c.vert}`;
export const isIncumbent = (c) => c.top === INCUMBENT.top && c.vert === INCUMBENT.vert;
/** The ladder for a top rung: the top, then the incumbent ladder's rungs below it. */
export const ladderFor = (top) => Object.freeze([top, ...H.MARGIN_LADDER.filter((m) => m < top)]);
/** The scenario flown at vertical margin `vert`: a copy with minDepth moved by (vert - VMARGIN); vert = VMARGIN returns the scenario itself. */
export function scenarioAt(sc, vert) { return vert === H.VMARGIN ? sc : Object.freeze({ ...sc, minDepth: sc.minDepth - (vert - H.VMARGIN) }); }
/** Fly seed of kind under the cell: the flyHard record plus { cell, top, vert, ladder }. */
export function flyCell(pilot, seed, kind, cell) {
    if (!KINDS.includes(kind)) throw new Error(`subMarginSweep.flyCell: unknown kind "${kind}" (${KINDS.join(", ")})`);
    if (!CELLS.some((c) => c.top === cell.top && c.vert === cell.vert)) throw new Error(`subMarginSweep.flyCell: ${JSON.stringify(cell)} is not one of the ${CELLS.length} cells`);
    const ladder = ladderFor(cell.top), rec = H.flyHard(pilot, scenarioAt(H.hardScenario(seed, kind), cell.vert), ARM, { ladder });
    return { ...rec, cell: cellName(cell), top: cell.top, vert: cell.vert, ladder: ladder.join() };
}
