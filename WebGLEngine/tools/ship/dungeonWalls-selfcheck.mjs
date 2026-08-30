// WebGLEngine/tools/ship/dungeonWalls-selfcheck.mjs -- v4187
//
// GATES simulation/wallFollow.mjs and the chase branch of simulation/DungeonAI.js.
//
// *** THE BUG THIS EXISTS FOR, AND HOW IT SURVIVED SINCE v1400. *** DungeonAI wrote a monster's position in
// exactly two places. The FLEE branch wrapped it in tryMove(), which checks isWall and slides along the wall
// when blocked. The CHASE branch did `m.x += ...` with no test at all -- and its "no path found" fallback was
// a straight line at the player, which fires PRECISELY when a wall is in the way. Measured before the fix: a
// monster crossed a solid stone column with no door and spent 17 frames standing INSIDE it.
//
// *** AND WHY THE OBVIOUS FIX WAS THE WRONG ONE. *** Simply refusing the move trades a monster that cheats
// for a monster that stands at the wall waiting to be killed. Keith's call: when the path is gone, put a hand
// on the wall and walk. So this file gates TWO claims, and the second is the one with teeth -- it is easy to
// prove a monster cannot pass through stone (make it stand still) and hard to prove it still gets to you.
//
// Run: node tools/ship/dungeonWalls-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { stepFollow, trace, WallFollower, dirToward, rightOf, leftOf, backOf, extend, chooseTurn,
         DELTA, DIR_NAMES, N, E, S, W, RIGHT, LEFT } from "../../simulation/wallFollow.mjs";
import { makeDungeonAI } from "../../simulation/DungeonAI.js";
import { noComments, codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

const grid = (rows) => {
    const GH = rows.length, GW = rows[0].length;
    return { GW, GH, isWall: (x, z) => (x < 0 || z < 0 || x >= GW || z >= GH) ? true : rows[z][x] === "#" };
};

// 1) THE CARDINALS AND THE TURNS.
{
    ok(rightOf(N) === E && rightOf(E) === S && rightOf(S) === W && rightOf(W) === N, "turning right cycles N->E->S->W");
    ok(leftOf(rightOf(N)) === N && backOf(backOf(E)) === E, "left undoes right, and back undoes back");
    ok(DELTA[N][1] === -1 && DELTA[S][1] === 1, "*** N is -z and S is +z -- the engine's forward at yaw 0 is -cos(0) on z ***");
    ok(DELTA[E][0] === 1 && DELTA[W][0] === -1, "and E is +x");
    ok(DELTA.every(([dx, dz]) => Math.abs(dx) + Math.abs(dz) === 1), "every delta is one cell on one axis -- no diagonals, which would cut corners through stone");
    ok(DIR_NAMES.length === 4 && new Set(DELTA.map(String)).size === 4, "four directions, all distinct");

    ok(dirToward(5, 1) === E && dirToward(-5, 1) === W && dirToward(1, 5) === S && dirToward(1, -5) === N, "dirToward picks the dominant axis");
    ok(dirToward(3, 3) === dirToward(3, 3) && dirToward(3, 3) === S,
        "*** an exact tie is DECIDED (z wins) rather than left to floating-point luck -- two machines must pick the same wall ***");
}

// 2) *** THE PREFERENCE ORDER IS THE ALGORITHM. *** Right first. Anything else is not wall-following.
{
    // *** THE RIGHT-TURN PREFERENCE APPLIES WHEN THERE IS A WALL TO FOLLOW, AND ONLY THEN. *** The first
    // version of this check demanded a right turn from a cell with NO wall adjacent, which is the 2x2 spin
    // that had to be removed -- so it went red against the deliberate fix. Both halves are asserted now.
    const openAll = grid(["#####", "#...#", "#...#", "#...#", "#####"]);
    const so = stepFollow(2, 2, N, openAll.isWall);
    ok(so.turn === "seek" && so.dir === N,
        `with nothing adjacent to touch it walks STRAIGHT on (got ${so.turn}/${DIR_NAMES[so.dir]}) -- turning right here is the 2x2 circle`);

    const touching = grid(["#####", "#...#", "#...#", "#.#.#", "#####"]);   // wall at (2,3), behind a N-facing walker
    const st = stepFollow(2, 2, N, touching.isWall);
    ok(st.dir === E && st.turn === "right",
        `*** with a wall to follow, facing N, the hand turns RIGHT (got ${DIR_NAMES[st.dir]}) -- trying straight first is "wander and turn when stuck", which does not follow a wall ***`);

    // right blocked -> straight. (The first version of this fixture had the right side OPEN, so it asserted
    // "straight" against a cell where the rule correctly turns right, and went red against correct code.)
    const rightWall = grid(["#####", "#.###", "#.###", "#...#", "#####"]);
    ok(rightWall.isWall(2, 2), "fixture check: the cell to the right of (1,2) really is solid");
    ok(stepFollow(1, 2, N, rightWall.isWall).turn === "straight", "with the right blocked it goes straight");

    // right and straight blocked -> left
    const corner = grid(["#####", "#####", "#..##", "#...#", "#####"]);
    ok(stepFollow(2, 2, N, corner.isWall).turn === "left", "with right and straight blocked it turns left");

    // dead end -> back
    const dead = grid(["###", "#.#", "#.#", "###"]);
    ok(stepFollow(1, 1, N, dead.isWall).turn === "back", "*** in a dead end it turns BACK rather than stalling -- a monster that stalls is the bug we replaced ***");

    // fully enclosed -> null, which is an answer and not a throw
    const sealed = grid(["###", "#.#", "###"]);
    ok(stepFollow(1, 1, N, sealed.isWall) === null, "walled in on all four sides returns null rather than throwing");
}

// 3) *** THE LOOP TEST IS KEYED ON (CELL, FACING), NOT THE CELL. *** This is the whole trick.
{
    // a plain corridor doubles back through cells it has already stood in. Keying on the cell alone would
    // call that a loop, and the monster would give up in an ordinary hallway.
    const hall = grid(["#######", "#.....#", "#######"]);
    const t = trace(1, 1, E, hall.isWall, 40);
    const cells = t.path.map((p) => `${p.gx},${p.gz}`);
    ok(cells.length > new Set(cells).size, `a corridor really does revisit cells (${cells.length} steps over ${new Set(cells).size} distinct) -- so revisiting a CELL cannot mean a loop`);
    ok(t.steps > 5, `and the follower kept walking it (${t.steps} steps) rather than crying loop at the first doubled-back cell`);

    // the same state twice IS provably a loop, because stepFollow is deterministic
    const f = new WallFollower(E);
    const box = grid(["#####", "#...#", "#...#", "#...#", "#####"]);
    let cx = 1, cz = 1, guard = 0;
    while (guard++ < 200) { const s = f.next(cx, cz, box.isWall); if (!s) break; cx = s.gx; cz = s.gz; }
    ok(f.looped === true, "a closed room is detected as a loop rather than walked forever");
    ok(guard < 200, `and it is detected quickly (${guard} steps), not by running out of a budget`);

    const f2 = new WallFollower(E);
    f2.next(1, 1, box.isWall); f2.reset();
    ok(f2.looped === false && f2.steps === 0, "reset() clears the trail, so a new hunt does not inherit the last one's states");
}

// 4) *** THE KNOWN LIMIT, STATED AND TESTED RATHER THAN HIDDEN. ***
{
    // right-hand rule solves a SIMPLY-CONNECTED maze; a detached pillar defeats it. Say so out loud.
    const island = grid(["#########", "#.......#", "#..###..#", "#..###..#", "#..###..#", "#.......#", "#########"]);
    const t = trace(3, 1, E, island.isWall, 500);
    ok(t.looped === true, "*** a free-standing pillar DEFEATS the right-hand rule -- and is detected, not run forever ***");
    ok(t.steps < 60, `detected in ${t.steps} steps rather than by exhausting the 500-step budget`);
    ok(!t.path.some((p) => p.gx === 7 && p.gz === 3), "and it never reaches the far side, which is the honest outcome for this maze");
    ok(/simply-connected|detached island|pillar/i.test(prose(read("simulation/wallFollow.mjs"))),
        "and the module says this limit in its own prose, rather than leaving it to be discovered");
}

// 5) THE DOOR, FROM AN OPEN CELL, FACING ANY WAY. Two bugs lived here.
{
    const room = grid(["###########", "#....#....#", "#....#....#", "#....#....#", "#....#....#", "#.........#", "###########"]);
    // *** BUG ONE: THE RULE SPUN IN OPEN SPACE. *** With no wall adjacent, "turn right" every step walks a
    // 2x2 circle -- measured, four steps and back to the start -- so a monster that lost its path mid-room
    // span on the spot and tripped its own loop detector. Now it walks straight until it finds a wall.
    const open = grid(["#######", "#.....#", "#.....#", "#.....#", "#######"]);
    const spin = trace(3, 2, E, open.isWall, 12);
    const cells = spin.path.map((p) => `${p.gx},${p.gz}`);
    ok(new Set(cells).size >= 3 && cells.slice(0, 4).every((c, i, a) => i === 0 || c !== a[0]),
        "*** from an open cell the follower goes SOMEWHERE rather than circling a 2x2 square ***");
    ok(spin.path[1].turn === "seek", "and it says so: the first move with nothing to touch is a seek, not a turn");

    // *** BUG TWO: IT FOLLOWED WITH THE WRONG HAND. *** Walking east into a north-south wall, the wall is
    // dead AHEAD. Locking the hand to RIGHT there turns south and leaves the wall on the LEFT, so the next
    // step dutifully turns away from it: measured, one step along the wall and then back into the room. The
    // hand now locks only when the wall is genuinely on a side.
    for (const [name, d] of [["E", E], ["N", N], ["S", S], ["W", W]]) {
        const t = trace(2, 2, d, room.isWall, 200);
        ok(t.path.some((p) => p.gx === 5 && p.gz === 5), `facing ${name}: it finds the door at (5,5)`);
        ok(t.path.some((p) => p.gx > 6), `facing ${name}: *** and reaches the far side of a wall it cannot see through ***`);
    }
}

// 5b) *** EXTEND LEFT AND RIGHT, AND THE MEASUREMENT THAT SENT IT BACK. ***
{
    ok(typeof extend === "function" && typeof chooseTurn === "function", "the probe and the chooser exist as primitives");
    const room = grid(["###########", "#....#....#", "#....#....#", "#....#....#", "#....#....#", "#.........#", "###########"]);
    const north = extend(4, 2, N, room.isWall), south = extend(4, 2, S, room.isWall);
    ok(north.len === 1 && south.len === 3, `extend measures the run each way (N ${north.len}, S ${south.len}) rather than one cell of lookahead`);
    // and here is exactly why greedy distance loses: the SHORTER, DEAD-ENDING run looks closer to the player
    const goal = { gx: 8, gz: 2 };
    const dn = Math.abs(north.gx - goal.gx) + Math.abs(north.gz - goal.gz);
    const ds = Math.abs(south.gx - goal.gx) + Math.abs(south.gz - goal.gz);
    ok(dn < ds, `*** the WRONG way scores better on distance (N ${dn} vs S ${ds}) -- a distance is blind to the wall between you and the goal ***`);

    // the four fixtures the scoring rules were measured on: the plain hand must arrive on ALL of them
    const FIX = [
        ["split room, door at the bottom", ["###########","#....#....#","#....#....#","#....#....#","#....#....#","#.........#","###########"], 2, 2, { gx: 8, gz: 2 }],
        ["door at the TOP instead",        ["###########","#.........#","#....#....#","#....#....#","#....#....#","#....#....#","###########"], 2, 4, { gx: 8, gz: 4 }],
        ["S-bend corridor",                ["#########","#.......#","#######.#","#.......#","#.#######","#.......#","#########"], 1, 1, { gx: 7, gz: 5 }],
        ["alcove trap near the goal",      ["###########","#...#.....#","#.#.#.###.#","#.#.....#.#","#.#####.#.#","#.......#.#","###########"], 1, 1, { gx: 9, gz: 5 }],
    ];
    for (const [name, rows, sx, sz, g] of FIX) {
        const t = trace(sx, sz, E, grid(rows).isWall, 300);
        const at = t.path.findIndex((p) => Math.abs(p.gx - g.gx) + Math.abs(p.gz - g.gz) <= 1);
        ok(at >= 0, `the plain hand ARRIVES on "${name}" (${at} steps) -- it is the only rule tested that arrives on all four`);
    }
    // *** AND NOTHING MAY QUIETLY SWITCH THE WORSE ONE ON. ***
    ok(chooseTurn(4, 2, E, room.isWall, null) === null, "chooseTurn without a goal declines to choose, so the default path is the hand");
    ok(!/goal\s*:/.test(codeOnly(read("simulation/DungeonAI.js"))),
        "*** and DungeonAI passes NO goal -- the measured-worse heuristic stays off in the dungeon ***");
}

// 6) *** THE INTEGRATION. The two things a player actually experiences. ***
{
    const mkAI = (rows, px, pz, mx, mz) => {
        const g = grid(rows);
        const player = { x: px, y: 1, z: pz };
        const ai = makeDungeonAI({
            GW: g.GW, GH: g.GH, isWall: g.isWall,
            cellToWorld: (gx, gz) => [gx, gz], worldToCell: (x, z) => [Math.round(x), Math.round(z)],
            floorY: 0, getPlayer: () => player, moveEntity: () => {}, onHitPlayer: () => {},
        });
        ai.add("m1", mx, mz, "chaser");
        ai.aggro("m1");                     // the module's own documented force-wake, "e.g. when shot"
        return { ai, g, player, m: ai.monsters.get("m1") };
    };

    // (a) NO DOOR: it must not pass, and must not stand in stone
    {
        const sealed = ["#########", "#...#...#", "#...#...#", "#...#...#", "#...#...#", "#...#...#", "#########"];
        const { ai, g, m } = mkAI(sealed, 7, 3, 1, 3);
        let inStone = 0, crossed = false;
        for (let i = 0; i < 600; i++) {
            ai.update(1 / 60);
            if (g.isWall(Math.round(m.x), Math.round(m.z))) inStone++;
            if (m.x > 4) crossed = true;
        }
        ok(!crossed, "*** a monster does NOT cross a solid wall with no door -- it did, before this round ***");
        ok(inStone === 0, `*** and never stands inside solid stone (${inStone} frames; it was 17) ***`);
        ok(!m.aggroed, "and having proved the room is closed, it gives up rather than orbiting the wall forever");
    }

    // (b) A DOOR: it must still get to you. THIS is the check that stops "fix it by freezing the monster".
    {
        const doored = ["###########", "#....#....#", "#....#....#", "#....#....#", "#....#....#", "#.........#", "###########"];
        const { ai, g, m, player } = mkAI(doored, 8, 2, 2, 2);
        let inStone = 0, reached = false, throughDoor = false;
        for (let i = 0; i < 1800; i++) {
            ai.update(1 / 60);
            if (g.isWall(Math.round(m.x), Math.round(m.z))) inStone++;
            if (Math.round(m.x) === 5 && Math.round(m.z) === 5) throughDoor = true;
            if (Math.hypot(player.x - m.x, player.z - m.z) < 1.8) { reached = true; break; }
        }
        ok(reached, "*** the monster STILL REACHES YOU when there is a door -- a fix that only froze it would fail here ***");
        ok(throughDoor, "and it got there through the door at (5,5), not through the wall");
        ok(inStone === 0, `and spent ${inStone} frames inside stone on the way`);
    }

    // (c) an open room: the ordinary case must not have regressed into wall-following
    {
        const open = ["#########", "#.......#", "#.......#", "#.......#", "#.......#", "#########"];
        const { ai, m, player } = mkAI(open, 7, 2, 1, 2);
        let reached = false;
        for (let i = 0; i < 600; i++) { ai.update(1 / 60); if (Math.hypot(player.x - m.x, player.z - m.z) < 1.8) { reached = true; break; } }
        ok(reached, "with a clear line the monster still just walks straight at you -- wall-following is the FALLBACK, not the behaviour");
        ok(!m.follow, "and no follower was ever created, so the ordinary path costs nothing");
    }
}

// 7) THE SOURCE. Both write sites check, and the beeline is gone.
{
    const ai = read("simulation/DungeonAI.js");
    const aiC = codeOnly(ai);
    // *** noComments for the STRING, codeOnly for the code shapes. codeOnly() blanks string literals, so an
    // import check written against it would pass on an empty file. That has been got wrong twice in this tree.
    ok(/from\s+"\.\/wallFollow\.mjs"/.test(noComments(ai)), "DungeonAI imports the wall follower rather than carrying a second copy of the rule");

    // *** COUNT THE COMPOUND ASSIGNMENT, NOT EVERY ASSIGNMENT. *** The first version of this check counted
    // `m.x =` and found 2 -- both of them the legitimate write INSIDE tryMove, one per branch. It went red
    // against the fixed code. `m.x +=` is the shape that was the bug: an advance with no test in front of it.
    // *** AND THIS CHECK CARRIES THE COLLISION CLAIM ON ITS OWN, WHICH IS WORTH SAYING. *** Sabotaging the
    // chase advance back to a bare `m.x +=` leaves section 6 GREEN: once the beeline is gone, every step
    // target is an adjacent OPEN cell, so an unchecked advance toward it does not enter stone in these
    // fixtures. Removing the beeline is what stops the phasing; the collision test is the second lock, for
    // the cases the fixtures do not reach (a hitched frame, a knockback, a corner clipped diagonally). A
    // second lock nothing tests is a second lock that quietly rots, so it is tested HERE, structurally.
    const bare = (aiC.match(/m\.x\s*\+=/g) || []).length;
    ok(bare === 0, `*** no unchecked advance survives -- ${bare} occurrences of "m.x +=", the exact shape that walked through stone ***`);
    const guarded = (aiC.match(/if\s*\(!isWall\(ngx, ngz\)\)\s*\{\s*m\.x = sx/g) || []).length;
    ok(guarded === 2, `and both write sites are inside an isWall guard (${guarded} of 2: flee and chase)`);
    ok((aiC.match(/tryMove/g) || []).length >= 6, "each branch declares one and calls it up to three times (move, then slide either way)");
    ok(!/let\s+tx\s*=\s*p\.x/.test(aiC), "*** the straight-line-at-the-player fallback is GONE -- that is the line that walked through stone ***");
    ok(/WallFollower/.test(aiC) && /dirToward/.test(aiC), "the follower and its opening facing are both used");

    const wf = read("simulation/wallFollow.mjs"), wfC = codeOnly(wf);
    ok(!/\bdocument\b|\bwindow\b|require\(|node:/.test(wfC), "wallFollow is pure -- no DOM, no node, so a gate and a dungeon see identical answers");
    ok(!/Math\.random/.test(wfC), "and no randomness: the same maze walks the same way every time");
    ok(/17 frames|solid stone/i.test(prose(ai)) || /17 frames|solid stone/i.test(prose(wf)),
        "and the measured failure is written down where the next person will read it");
}

console.log(`dungeonWalls-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether the monsters are FUN. What is checked is that they no longer
cheat and no longer stall -- a wall with no door stops them, a wall with a door does not, and an
open room is still just a chase.`);
process.exit(fail ? 1 : 0);
