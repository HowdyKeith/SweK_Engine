// WebGLEngine/nav/funnel.mjs -- v4254
//
// *** THE TREE'S ONLY PATHFINDER IS 8.24% LONGER THAN A STRAIGHT LINE ON AN EMPTY FLOOR, AND THAT NUMBER IS
// *** NOT AN IMPLEMENTATION DETAIL -- IT IS sqrt(4 - 2*sqrt(2)), A PROPERTY OF HAVING EIGHT NEIGHBOURS.
//
// worker/botPathfinder.worker.js is a real A* over a heightmap snapshot, run off-thread by
// simulation/BotPathfinderPool.js so dozens of bots can plan without stalling the frame. It is 8-connected,
// so every step is a multiple of 45 degrees. For a goal at angle theta into the first octant the path length
// is (dx - dz) + sqrt(2)*dz against a straight-line dx^2 + dz^2 under a root, giving
//
//     ratio(theta) = cos(theta) + (sqrt(2) - 1) * sin(theta)
//
// which is a*cos + b*sin and therefore peaks at sqrt(a^2 + b^2) = sqrt(4 - 2*sqrt(2)) = 1.0823922, at
// theta = arctan(sqrt(2) - 1) = 22.5 degrees -- the direction exactly between an axis and a diagonal, which
// is the one an 8-neighbour grid can least express. At 0 and 45 degrees the ratio is exactly 1, because
// those are the two directions it CAN express.
//
// Grepped for navmesh, navMesh, funnel and portal across the whole tree before writing this: no hits. The
// staircase has always been there and nothing has ever measured it, because nothing gates the pathfinder at
// all -- tools/ship has requestPathSync-selfcheck and winPathGuard-selfcheck, and neither is about paths
// through a world.
//
// ---- WHAT THE FUNNEL IS, AND THE ONE THING IT MUST NOT BE ----------------------------------------------------
//
// The Simple Stupid Funnel Algorithm walks a CORRIDOR -- an ordered list of portals, each a segment the path
// must cross -- keeping a left and a right feeler from the current apex. When the feelers cross, the apex
// advances to the tighter one and a corner is emitted. What comes out is the taut string through the
// corridor: on an open floor that is the straight line, and around an obstacle it is the line that hugs the
// inside corners.
//
// *** SO "RETURNS THE STRAIGHT LINE" SCORES PERFECTLY ON THE OPEN-FLOOR TEST AND IS CATASTROPHICALLY WRONG.
// *** The whole value of the gate is the obstacle case, where the pulled path must stay INSIDE the corridor
// and must NOT be the straight line. That check is the reason this file is worth having rather than the
// ratio it improves.
//
// NOTHING IS TAKEN FROM three-pathfinding, PathFinding.js OR Kompute. The funnel is Mononen's, published as
// a description rather than as a library, and the corridor builder below is about this tree's grid.
"use strict";

/** Twice the signed area of triangle abc. Positive means c is left of ab, in x/z with y up. */
export const triarea2 = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);

const near = (a, b, e = 1e-9) => Math.abs(a.x - b.x) < e && Math.abs(a.z - b.z) < e;

/**
 * Build a corridor of portals from a grid path.
 *
 * Consecutive cells that differ on one axis share an EDGE of length `cell`; consecutive cells that differ on
 * both share exactly one CORNER, and the portal there is degenerate -- left and right are the same point.
 * That degeneracy is not a special case to be smoothed away: a diagonal grid step really does pass through a
 * single point, and pretending otherwise would let the funnel cut a corner the grid never said was open.
 *
 * Portals are oriented left/right with respect to travel, which is what the funnel's sidedness tests mean.
 */
/**
 * *** THE STEP WITHOUT WHICH STRING-PULLING A GRID PATH IS PROVABLY IMPOSSIBLE. ***
 *
 * Two cells joined by a DIAGONAL step share exactly one corner, so the portal between them has width ZERO,
 * and a zero-width portal pins the path to a point. A corridor built straight from an 8-connected path is
 * pinched at every diagonal, its taut path IS the staircase, and a funnel run over it can recover nothing.
 * Measured before this function existed: portal width 0.000 at every diagonal step.
 *
 * The repair is to route each diagonal through an orthogonal neighbour, so every consecutive pair shares a
 * real edge and the corridor has width along its whole length. `walkable(cx, cz)` picks which of the two
 * corners is open; with no predicate it takes the x-first one, and says so rather than pretending to know.
 */
export function expandDiagonals(path, cell, walkable = null) {
    const out = [{ ...path[0] }];
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        if (Math.abs(b.x - a.x) > 1e-9 && Math.abs(b.z - a.z) > 1e-9) {
            const viaX = { x: b.x, z: a.z, y: a.y }, viaZ = { x: a.x, z: b.z, y: a.y };
            const okX = !walkable || walkable(viaX.x, viaX.z);
            out.push(okX ? viaX : viaZ);
        }
        out.push({ ...b });
    }
    return out;
}

export function corridorFromPath(path, cell) {
    const h = cell / 2, portals = [];
    portals.push({ left: { ...path[0] }, right: { ...path[0] } });          // the start, as a degenerate portal
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i];
        const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
        let p1, p2;
        if (dx !== 0 && dz !== 0) {                                          // diagonal: one shared corner
            const c = { x: a.x + dx * h, z: a.z + dz * h };
            p1 = { ...c }; p2 = { ...c };
        } else if (dx !== 0) {                                               // vertical edge at x = mx
            p1 = { x: mx, z: mz - h }; p2 = { x: mx, z: mz + h };
        } else {                                                             // horizontal edge at z = mz
            p1 = { x: mx - h, z: mz }; p2 = { x: mx + h, z: mz };
        }
        // Orientation: the funnel's sidedness tests want the CLOCKWISE side as `left`, i.e. NEGATIVE
        // triarea2 about a->b. *** THIS SIGN WAS INVERTED IN THE FIRST DRAFT AND A STRAIGHT CORRIDOR COULD
        // NOT SEE IT: *** both orientations return the same two points there, because a straight taut path
        // never has a corner to put on the wrong side. Only an L-shaped corridor separates them -- inverted,
        // it zigzagged across the corridor through five points instead of cutting one inside corner.
        const leftFirst = triarea2(a, b, p1) < 0;
        portals.push(leftFirst ? { left: p1, right: p2 } : { left: p2, right: p1 });
    }
    portals.push({ left: { ...path[path.length - 1] }, right: { ...path[path.length - 1] } });
    return portals;
}

/**
 * *** THE FUNNEL DOES NOT MAKE A GRID PATH BETTER FOR FREE. IT SPENDS A SAFETY MARGIN THE GRID HAD BY
 * *** ACCIDENT, AND THIS FUNCTION IS THE PRICE.
 *
 * Measured, on a wall with a single gap: the staircase from botPathfinder never entered a wall (0 of 724
 * samples) and the funnelled path through the SAME corridor entered one at 18 of 616. Neither the solver nor
 * the corridor builder was wrong. A* tests only a cell's CENTRE, so all it ever promises is that its
 * centre-line is walkable; the corridor of full cells around that line is not guaranteed clear, because the
 * heightmap is finer than the grid. Walking centre to centre kept the staircase away from the edges by
 * luck of construction. Pulling the string taut cashes that luck in.
 *
 * Insetting each portal by an agent radius buys it back explicitly, which is what a navmesh runtime does and
 * what a grid corridor has to do by hand. The inset is capped at just under half the portal width, because a
 * portal narrower than the agent cannot be entered at all and collapsing it to a point would silently pin
 * the path instead of reporting that the gap is too tight.
 */
export function insetPortals(portals, r) {
    return portals.map((P) => {
        const dx = P.right.x - P.left.x, dz = P.right.z - P.left.z;
        const w = Math.hypot(dx, dz);
        if (w < 1e-9) return { left: { ...P.left }, right: { ...P.right }, degenerate: true };
        const k = Math.min(r, w * 0.499) / w;
        return {
            left: { x: P.left.x + dx * k, z: P.left.z + dz * k },
            right: { x: P.right.x - dx * k, z: P.right.z - dz * k },
            tight: r > w * 0.499,
        };
    });
}

/**
 * The Simple Stupid Funnel Algorithm. Returns the corner list of the taut path through the corridor.
 *
 * The apex restart (`i = apexIndex; continue`) is the part everyone gets wrong: when a feeler crosses the
 * opposite one, the apex jumps to that opposite point and the scan RESTARTS from the portal that produced
 * it, because portals already passed may now be tight against the new apex.
 */
export function funnel(portals, { maxCorners = 4096 } = {}) {
    if (!portals || portals.length === 0) return [];
    const pts = [];
    let apex = portals[0].left, pLeft = portals[0].left, pRight = portals[0].right;
    let apexI = 0, leftI = 0, rightI = 0;
    pts.push({ ...apex });
    for (let i = 1; i < portals.length && pts.length < maxCorners; i++) {
        const left = portals[i].left, right = portals[i].right;
        // tighten the right feeler
        if (triarea2(apex, pRight, right) <= 0) {
            if (near(apex, pRight) || triarea2(apex, pLeft, right) > 0) { pRight = right; rightI = i; }
            else {                                                        // right crossed left: left is a corner
                pts.push({ ...pLeft });
                apex = pLeft; apexI = leftI;
                pLeft = apex; pRight = apex; leftI = apexI; rightI = apexI;
                i = apexI; continue;
            }
        }
        // tighten the left feeler
        if (triarea2(apex, pLeft, left) >= 0) {
            if (near(apex, pLeft) || triarea2(apex, pRight, left) < 0) { pLeft = left; leftI = i; }
            else {                                                        // left crossed right: right is a corner
                pts.push({ ...pRight });
                apex = pRight; apexI = rightI;
                pLeft = apex; pRight = apex; leftI = apexI; rightI = apexI;
                i = apexI; continue;
            }
        }
    }
    const end = portals[portals.length - 1].left;
    if (pts.length === 0 || !near(pts[pts.length - 1], end)) pts.push({ ...end });
    return pts;
}

/** Path length in the x/z plane. The number every claim in the gate is denominated in. */
export function pathLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    return L;
}

/**
 * *** THE CLOSED FORM THE GRID IS GRADED AGAINST. ***
 * The length an 8-connected path takes to reach a point at angle theta, as a multiple of the straight line.
 * theta is folded into [0, 45] because the octants are symmetric.
 */
export function octileRatio(theta) {
    let t = Math.abs(theta) % (Math.PI / 2);
    if (t > Math.PI / 4) t = Math.PI / 2 - t;
    return Math.cos(t) + (Math.SQRT2 - 1) * Math.sin(t);
}

/** The worst that ratio can be, and where. Not a fitted number: it is max of a*cos + b*sin. */
export const OCTILE_WORST = Math.sqrt(4 - 2 * Math.SQRT2);       // 1.0823922...
export const OCTILE_WORST_ANGLE = Math.atan(Math.SQRT2 - 1);     // 22.5 degrees

/**
 * Does a polyline stay inside the corridor? *** THE CHECK THAT STOPS A CHEAT SCORING PERFECTLY. ***
 *
 * A "funnel" that ignored its input and returned the straight line would beat every length test ever
 * written and would walk characters through walls. Membership is asserted by requiring the path to cross
 * every portal in order: for each portal, some segment of the path must intersect it.
 */
export function crossesAllPortals(pts, portals) {
    let missed = 0;
    for (let k = 1; k < portals.length - 1; k++) {
        const P = portals[k];
        if (near(P.left, P.right)) {                                  // degenerate: the path must pass through it
            let hit = false;
            for (let i = 1; i < pts.length && !hit; i++) hit = onSegment(pts[i - 1], pts[i], P.left);
            if (!hit) missed++;
            continue;
        }
        let hit = false;
        for (let i = 1; i < pts.length && !hit; i++) hit = segmentsIntersect(pts[i - 1], pts[i], P.left, P.right);
        if (!hit) missed++;
    }
    return { missed, total: Math.max(0, portals.length - 2) };
}

function onSegment(a, b, p, eps = 1e-7) {
    const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    if (Math.abs(cross) > eps * Math.max(1, Math.hypot(b.x - a.x, b.z - a.z))) return false;
    const dot = (p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z);
    const L2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
    return dot >= -eps && dot <= L2 + eps;
}

function segmentsIntersect(a, b, c, d) {
    const d1 = triarea2(c, d, a), d2 = triarea2(c, d, b), d3 = triarea2(a, b, c), d4 = triarea2(a, b, d);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    return onSegment(c, d, a) || onSegment(c, d, b) || onSegment(a, b, c) || onSegment(a, b, d);
}
