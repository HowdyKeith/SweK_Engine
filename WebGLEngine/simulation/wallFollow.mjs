// FILE: simulation/wallFollow.mjs -- v4187
//
// RIGHT-HAND WALL FOLLOWING on a cell grid. Pure: no DOM, no engine, no entity -- it takes a cell, a facing,
// and a function that says whether a cell is solid, and returns the next cell. That is all, so a gate and a
// running dungeon see identical answers.
//
// *** WHY THIS EXISTS. *** simulation/DungeonAI.js chased the player with no wall test at all, so a monster
// that lost its path walked straight through solid stone (measured: 17 frames standing INSIDE a wall). The
// obvious repair -- refuse the move -- trades a monster that cheats for a monster that stands at the wall
// waiting to be killed, which is worse to play against. Keith's call, and it is the right one: when the path
// is gone, PUT A HAND ON THE WALL AND WALK. Turn right if you can, else straight, else left, else back the
// way you came. It is the oldest maze algorithm there is and it costs four cell lookups per step.
//
// *** AND THE LIMIT, STATED UP FRONT, BECAUSE IT IS A REAL ONE. *** The right-hand rule is guaranteed to get
// you out of a SIMPLY-CONNECTED maze -- one where every wall connects back to the outer boundary. It is NOT
// guaranteed to reach a goal in a maze with a detached island: a follower that puts its hand on a free-standing
// pillar walks around that pillar forever. This module does not pretend otherwise. It DETECTS the loop instead
// (see `looped` below) and says so, and DungeonAI treats that as the monster having lost you rather than
// letting it circle a pillar until the heat death of the universe.
"use strict";

/** Cardinals. N is -z because the engine's forward at yaw 0 is (sin 0, , -cos 0) = -z. */
export const N = 0, E = 1, S = 2, W = 3;
export const DIR_NAMES = Object.freeze(["N", "E", "S", "W"]);
export const DELTA = Object.freeze([[0, -1], [1, 0], [0, 1], [-1, 0]]);

/** Which side the hand is on. A follower keeps one hand on one wall; swapping mid-run abandons the wall. */
export const RIGHT = 1, LEFT = -1;

export function rightOf(d) { return (d + 1) & 3; }
export function leftOf(d)  { return (d + 3) & 3; }
export function backOf(d)  { return (d + 2) & 3; }

/**
 * The cardinal that best matches a direction vector, for choosing an opening facing.
 * Ties go to the z axis, which is arbitrary but must be DECIDED rather than left to floating-point luck --
 * an undecided tie makes two monsters in the same spot pick different walls on different machines.
 */
export function dirToward(dx, dz) {
    if (Math.abs(dx) > Math.abs(dz)) return dx > 0 ? E : W;
    return dz > 0 ? S : N;
}

/**
 * One step of the right-hand rule.
 *
 * The preference order IS the algorithm: right, straight, left, back. Trying right FIRST is what keeps the
 * wall on your right-hand side; trying straight first would be "wander forward and turn when stuck", which
 * does not follow a wall and does not escape a maze.
 *
 * @returns { gx, gz, dir, turn } or null when the cell is fully enclosed (all four neighbours solid)
 */
export function stepFollow(gx, gz, dir, isWall, hand = RIGHT) {
    // *** FIRST: IS THERE A WALL TO PUT A HAND ON? *** The right-hand rule assumes one. In OPEN SPACE, with
    // no solid neighbour at all, "turn right" every step just walks a 2x2 circle -- measured, four steps and
    // back to the start. A monster that lost its path in the middle of a room would spin on the spot and then
    // trip its own loop detector. So with nothing to touch, walk STRAIGHT and keep walking until a wall turns
    // up; from the next cell on, the rule proper takes over. This is Keith's "go one step and then keep going
    // till you find another turn" exactly, and it is what makes the rule work from anywhere rather than only
    // from a corner.
    let touching = false;
    for (let d = 0; d < 4; d++) if (isWall(gx + DELTA[d][0], gz + DELTA[d][1])) { touching = true; break; }
    if (!touching) {
        const nx = gx + DELTA[dir][0], nz = gz + DELTA[dir][1];
        return { gx: nx, gz: nz, dir, turn: "seek" };   // nothing adjacent is solid, so straight is always open
    }
    // *** AND WHICH HAND. *** With the wall on your LEFT, a right-hand rule turns AWAY from it: measured, the
    // follower reached the dividing wall, took one step along it, then peeled off back into the open room.
    // Following is only following if the hand is on the side the wall is actually on.
    const toward = hand === LEFT ? leftOf(dir) : rightOf(dir);
    const away = hand === LEFT ? rightOf(dir) : leftOf(dir);
    const order = [toward, dir, away, backOf(dir)];
    const names = hand === LEFT ? ["left", "straight", "right", "back"] : ["right", "straight", "left", "back"];
    for (let i = 0; i < 4; i++) {
        const d = order[i];
        const nx = gx + DELTA[d][0], nz = gz + DELTA[d][1];
        if (!isWall(nx, nz)) return { gx: nx, gz: nz, dir: d, turn: names[i] };
    }
    return null;   // walled in on all four sides -- a real answer, not an error
}

/**
 * How far you can walk in one direction before stone stops you, and where you end up.
 *
 * This is the "extend" half of Keith's rule: DON'T just turn right -- reach out both ways first and see what
 * is actually down there. One cell of lookahead tells you a wall is not immediately in front; a run tells you
 * whether that opening is a corridor going somewhere or a one-cell alcove.
 */
export function extend(gx, gz, dir, isWall, max = 64) {
    let n = 0, cx = gx, cz = gz;
    while (n < max) {
        const nx = cx + DELTA[dir][0], nz = cz + DELTA[dir][1];
        if (isWall(nx, nz)) break;
        cx = nx; cz = nz; n++;
    }
    return { len: n, gx: cx, gz: cz, dir };
}

/**
 * *** EXTEND LEFT AND RIGHT, THEN CHOOSE. *** At a junction, probe every open way out, and pick the one whose
 * far end lands NEAREST THE GOAL. This is what a person does in a corridor and what a fixed hand never does:
 * a right hand is right even when the player is plainly to the left, so it walks the long way round the whole
 * room. Measured on the split-room fixture: the hand alone toured 35 cells after the door; this heads over.
 *
 * *** AND IT MEASURED WORSE THAN THE PLAIN HAND, SO IT IS OFF BY DEFAULT. *** This was worth building and
 * worth testing, and the test said no. Four scoring rules, four mazes, steps to reach the goal:
 *
 *      fixture                            hand only   dist to goal   dist minus run   longest run
 *      split room, door at the bottom            13          never               11         never
 *      door at the TOP instead                   21          never            never         never
 *      S-bend corridor                           21             21               21            21
 *      alcove trap near the goal                 15             23               23            23
 *
 * The plain hand is the ONLY column that arrives every time, and it is fastest or tied on three of the four.
 * The reason is not tuning: every score here is a distance, and a distance is BLIND TO THE WALL BETWEEN YOU
 * AND THE GOAL. On the split room it probes north -- one cell, a dead end, but plainly "closer" to a player
 * who is east -- over south, which is three cells and the door. Choosing greedily also throws away the one
 * thing the hand rule has that no heuristic here does: a guarantee. So chooseTurn needs an explicit `goal` to
 * do anything at all, DungeonAI passes none, and the hand walks the dungeon. The primitive stays because
 * extend() is useful and because the next person to have this idea should find the numbers, not repeat it.
 *
 * @param goal { gx, gz } -- what to head toward. Without one there is nothing to choose BY, so this returns
 *             null and the caller falls back to the hand.
 */
export function chooseTurn(gx, gz, dir, isWall, goal, opts = {}) {
    if (!goal) return null;
    const hand = opts.hand === LEFT ? LEFT : RIGHT;
    // never turn back on yourself here: reversing is the hand rule's last resort, not a junction choice
    const ways = [leftOf(dir), dir, rightOf(dir)].filter((d) => !isWall(gx + DELTA[d][0], gz + DELTA[d][1]));
    if (ways.length < 2) return null;          // no real choice to make -- let the hand rule have it
    const order = [hand === LEFT ? leftOf(dir) : rightOf(dir), dir, hand === LEFT ? rightOf(dir) : leftOf(dir)];
    let best = null, bestScore = Infinity, bestRank = 99;
    for (const d of ways) {
        const e = extend(gx, gz, d, isWall, opts.probe || 24);
        const dist = Math.abs(e.gx - goal.gx) + Math.abs(e.gz - goal.gz);   // Manhattan: grid moves, grid metric
        const rank = order.indexOf(d);
        // strictly nearer wins; an exact tie falls to the hand's own preference order, so the choice is
        // DECIDED rather than left to array order -- two machines must pick the same corridor
        if (dist < bestScore || (dist === bestScore && rank < bestRank)) { best = d; bestScore = dist; bestRank = rank; }
    }
    return best;
}

/**
 * A follower with memory, so a cycle can be detected rather than run forever.
 *
 * *** THE STATE IS (CELL, FACING), NOT JUST THE CELL, AND THAT IS THE WHOLE TRICK. *** stepFollow is
 * deterministic, so the next move depends only on where you are and which way you face. Returning to a cell
 * you have already stood in is perfectly normal -- a corridor doubles back all the time. Returning to a cell
 * FACING THE WAY YOU FACED BEFORE means every move from here on repeats what you already did: it is a proven
 * closed loop, not a guess. Keying the memory on the cell alone would cry loop at every ordinary corridor.
 */
export class WallFollower {
    /**
     * @param dir  opening facing
     * @param hand RIGHT, LEFT, or 0 to CHOOSE on first contact -- which is the useful default, because which
     *             hand is correct depends on which side of you the wall turns out to be, and you do not know
     *             that until you touch one.
     */
    constructor(dir = N, hand = 0, opts = {}) {
        this.dir = dir & 3;
        this.hand = hand;
        this.goal = opts.goal || null;      // set it and the follower looks both ways at junctions
        this.probe = opts.probe || 24;
        this.seen = new Set();
        this.looped = false;
        this.steps = 0;
    }
    /**
     * Put the hand on whichever side the wall is -- and REFUSE TO CHOOSE when it is not on a side yet.
     *
     * *** THE CASE THAT GOT THIS WRONG TWICE. *** Walking east into a north-south wall, the wall is dead
     * AHEAD and both sides are open. Locking to RIGHT there makes the follower turn right (south), which puts
     * the wall it just met on its LEFT -- and from the next cell the right-hand rule dutifully turns away from
     * it and wanders back into the room. Measured: it reached the dividing wall, took one step along it, and
     * peeled off. So a wall ahead locks NOTHING. The follower takes the turn unlocked, and one cell later the
     * wall really is beside it, which is the first moment the question has an answer.
     */
    _chooseHand(gx, gz, isWall) {
        if (isWall(gx + DELTA[rightOf(this.dir)][0], gz + DELTA[rightOf(this.dir)][1])) return RIGHT;
        if (isWall(gx + DELTA[leftOf(this.dir)][0], gz + DELTA[leftOf(this.dir)][1])) return LEFT;
        return 0;   // only ahead or behind: not yet answerable, so do not pretend it is
    }
    /**
     * Next cell from the monster's CURRENT cell. The caller passes the position each time rather than the
     * follower tracking it, because the monster is a physical body -- it gets knocked back, slowed, and
     * pushed around, and a follower holding its own stale idea of where it is would steer from a fiction.
     */
    next(gx, gz, isWall) {
        const key = ((gz * 4096 + gx) * 4) + this.dir;
        if (this.seen.has(key)) { this.looped = true; return null; }
        this.seen.add(key);
        let touching = false;
        for (let d = 0; d < 4; d++) if (isWall(gx + DELTA[d][0], gz + DELTA[d][1])) { touching = true; break; }
        if (touching && !this.hand) this.hand = this._chooseHand(gx, gz, isWall);
        // extend both ways and choose, where there is genuinely a choice; the hand rule otherwise and as the
        // tie-break, because the hand is the part that carries a guarantee
        const picked = chooseTurn(gx, gz, this.dir, isWall, this.goal, { hand: this.hand || RIGHT, probe: this.probe });
        const s = picked === null || picked === undefined
            ? stepFollow(gx, gz, this.dir, isWall, this.hand || RIGHT)
            : { gx: gx + DELTA[picked][0], gz: gz + DELTA[picked][1], dir: picked, turn: "chosen" };
        if (!s) return null;
        this.dir = s.dir;
        this.steps++;
        return s;
    }
    /** A fresh start: called when the path opens again, so an old trail cannot make a new hunt cry loop. */
    reset(dir = this.dir) { this.dir = dir & 3; this.hand = 0; this.seen.clear(); this.looped = false; this.steps = 0; }
}

/**
 * Walk the rule from a start cell and return the whole trace. Gate-facing: a property about wall-following is
 * a property about the PATH it produces, and asserting on a path is what proves it, not asserting on one step.
 */
export function trace(gx, gz, dir, isWall, maxSteps = 500, hand = 0, opts = {}) {
    const f = new WallFollower(dir, hand, opts);
    const path = [{ gx, gz, dir: f.dir }];
    let cx = gx, cz = gz;
    for (let i = 0; i < maxSteps; i++) {
        const s = f.next(cx, cz, isWall);
        if (!s) break;
        cx = s.gx; cz = s.gz;
        path.push({ gx: cx, gz: cz, dir: s.dir, turn: s.turn });
    }
    return { path, looped: f.looped, steps: f.steps };
}
