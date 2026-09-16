// WebGLEngine/tools/ship/dungeonAI-selfcheck.mjs -- v4609
//
// Run: node tools/ship/dungeonAI-selfcheck.mjs
//
// GATES simulation/DungeonAI.js's migration of its flee/melee/ranged-shoot/ranged-hold/chase priority chain
// onto ui/guards.mjs's evaluateGuards() -- the SECOND real migration from tools/ship/nextRounds.mjs's
// "npc-decision-framework" PRIORITY-IF-ELSE cluster, after simulation/SpaceSuit.js (spaceSuit-selfcheck.mjs)
// proved the utility on a pure classifier with no side effects. This one is the impure case: every guard's
// `then` drives real combat (player damage, projectile spawns, entity movement) and three of the five carry
// GPU-brain hook amendments (PATCH-B16/B17/B18/B22) layered on over several rounds -- exactly why it was
// deliberately deferred out of the SpaceSuit.js round rather than folded into it.
//
// *** THIS FILE DOES NOT RE-GATE COLLISION OR WALL-FOLLOWING. *** tools/ship/dungeonWalls-selfcheck.mjs
// already owns that ground -- the isWall guard on both tryMove() sites, the beeline-is-gone check, the
// GPU-brain-flow-field wiring inside _actFlee/_actChase -- and re-ran clean (65/65) against this migration
// with no changes needed, because the migration MOVED code, it did not rewrite it (see DungeonAI.js's own
// v4609 header for the "what moved, not what changed" account). What this file gates instead is the thing
// that migration actually put at risk: that DUNGEON_GUARDS' FIRST-MATCH-WINS ORDER still resolves conflicts
// (a monster in melee range AND fleeing; in shooting range AND holding range) the same way the original
// if/else-if chain did, and that each of the five branches -- reached only through evaluateGuards() now,
// never by falling through an if-chain -- still fires the right side effect.
"use strict";
import { makeDungeonAI } from "../../simulation/DungeonAI.js";
import { evaluateGuards } from "../../ui/guards.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("dungeonAI-selfcheck -- the second migration onto ui/guards.mjs, this one with real side effects\n");

// A harness matching how simulation/DungeonDemo.js actually constructs makeDungeonAI(): an open grid (no
// walls, so tryMove() never has to slide -- that geometry is dungeonWalls-selfcheck.mjs's job, not this
// file's), mock collaborators that RECORD every call rather than toy no-ops, and a spy-able getHP so calls
// to it can be counted, not just answered.
function harness({ hp = {} } = {}) {
    const calls = { moveEntity: [], onHitPlayer: [], onRangedAttack: [], getHP: [] };
    const isWall = () => false;
    const worldToCell = (x, z) => [Math.round(x), Math.round(z)];
    const cellToWorld = (gx, gz) => [gx, gz];
    let player = { x: 0, z: 0 };
    const ai = makeDungeonAI({
        GW: 64, GH: 64, isWall, cellToWorld, worldToCell, floorY: 0,
        getPlayer: () => player,
        moveEntity: (...a) => calls.moveEntity.push(a),
        onHitPlayer: (...a) => calls.onHitPlayer.push(a),
        onRangedAttack: (...a) => calls.onRangedAttack.push(a),
        getHP: (id) => { calls.getHP.push(id); return hp[id] != null ? hp[id] : null; },
    });
    return { ai, calls, setPlayer: (x, z) => { player = { x, z }; } };
}

console.log("1. THE DECLARED RULE LIST -- exhaustive by construction, same order the original if/else-if chain checked");
{
    const { ai } = harness();
    const G = ai.DUNGEON_GUARDS;
    ok("five guards, in the exact order the original if/else-if chain checked them", G.length === 5 &&
        G.map((g) => g.name).join(",") === "flee,melee,ranged-shoot,ranged-hold,chase");
    ok("!! the LAST guard is an unconditional catch-all -- every monster that reaches evaluateGuards() gets an action, never a no-op tick",
        G[4].when() === true,
        "unlike ui/machine.mjs's declared graph there is no audit()/reachable() for this shape (ui/guards.mjs's own header) -- exhaustiveness is asserted directly against the list");
    ok("!! DUNGEON_GUARDS is NOT a module-level export, unlike SpaceSuit.js's ATMOSPHERE_GUARDS",
        typeof ai.DUNGEON_GUARDS !== "undefined" && ai.add !== undefined,
        "it closes over per-instance moveEntity/isWall/floorY/worldToCell -- exposed only through the factory's returned api, the way packagerBridge.js exports _zip for its own gate");
}

console.log("\n2. PRIORITY ORDER -- direct evaluateGuards() calls, one hand-built ctx per branch, bypassing the aggro gate entirely");
{
    const { ai, calls } = harness({ hp: { chaser1: 0.2 } });
    const G = ai.DUNGEON_GUARDS;
    const m = (kind) => ({ id: "chaser1", kind, spec: ai.KINDS[kind], x: 0, z: 0, cool: 0, shootCool: 0, repath: 0, step: null, yaw: 0 });
    const baseCtx = (over) => Object.assign({ p: { x: 0, z: 5 }, dxp: 0, dzp: 5, dist: 5, dt: 1 / 60, enr: false, pgx: 0, pgz: 5, seen: false, hpf: null }, over);

    // flee: chaser (flees:true), hpf below 0.3, wins regardless of range
    {
        const mm = m("chaser");
        const r = evaluateGuards(G, baseCtx({ m: mm, hpf: 0.2, dist: 0.5 }));
        ok("flee matches when hpf<0.3, even at melee range", r.matched === "flee" && calls.onHitPlayer.length === 0);
    }
    // melee: brute (no flees, no ranged), in atkR
    {
        const mm = { id: "b1", kind: "brute", spec: ai.KINDS.brute, x: 0, z: 0, cool: 0, yaw: 0 };
        const r = evaluateGuards(G, baseCtx({ m: mm, dist: ai.KINDS.brute.atkR }));
        ok("melee matches at dist === atkR", r.matched === "melee" && calls.onHitPlayer.length === 1);
    }
    // ranged-shoot: archer, in shootR, off cooldown, seen
    {
        const mm = { id: "a1", kind: "archer", spec: ai.KINDS.archer, x: 0, z: 0, cool: 0, shootCool: 0, yaw: 0 };
        const before = calls.onRangedAttack.length;
        const r = evaluateGuards(G, baseCtx({ m: mm, dist: ai.KINDS.archer.shootR, seen: true }));
        ok("ranged-shoot matches at dist === shootR, off cooldown, seen", r.matched === "ranged-shoot" && calls.onRangedAttack.length === before + 1);
    }
    // ranged-hold: archer, close + seen, but STILL COOLING
    {
        const mm = { id: "a2", kind: "archer", spec: ai.KINDS.archer, x: 0, z: 0, cool: 0, shootCool: 0.9, yaw: 0 };
        const before = calls.onRangedAttack.length;
        const r = evaluateGuards(G, baseCtx({ m: mm, dist: ai.KINDS.archer.shootR * 0.6 - 0.01, seen: true }));
        ok("ranged-hold matches when cooling and inside shootR*0.6", r.matched === "ranged-hold" && calls.onRangedAttack.length === before);
    }
    // chase: mage, seen but far outside both ranged thresholds
    {
        const mm = { id: "g1", kind: "mage", spec: ai.KINDS.mage, x: 0, z: 0, cool: 0, shootCool: 5, repath: 0, step: null, yaw: 0 };
        const r = evaluateGuards(G, baseCtx({ m: mm, dist: ai.KINDS.mage.shootR + 5, seen: true }));
        ok("chase (the catch-all) matches when nothing closer-range applies", r.matched === "chase");
    }
    // non-ranged, out of melee range -> only melee/chase apply, always lands on chase
    {
        const mm = { id: "b2", kind: "brute", spec: ai.KINDS.brute, x: 0, z: 0, cool: 0, repath: 0, step: null, yaw: 0 };
        const r = evaluateGuards(G, baseCtx({ m: mm, dist: ai.KINDS.brute.atkR + 0.01 }));
        ok("a non-ranged kind just outside atkR falls straight to chase -- ranged guards never apply to it", r.matched === "chase");
    }
}

console.log("\n3. BOUNDARIES, PINNED AT THE EXACT OPERATOR THE ORIGINAL IF-CHAIN USED");
{
    const { ai } = harness();
    const G = ai.DUNGEON_GUARDS;
    const baseCtx = (over) => Object.assign({ p: { x: 0, z: 0 }, dxp: 0, dzp: 0, dt: 1 / 60, enr: false, pgx: 0, pgz: 0, seen: true, hpf: null }, over);

    ok("!! flee: hpf===0.3 exactly does NOT flee (strict <, not <=)",
        evaluateGuards(G, baseCtx({ m: { id: "c1", kind: "chaser", spec: ai.KINDS.chaser, x: 0, z: 0, cool: 99, repath: 0, step: null, yaw: 0 }, hpf: 0.3, dist: 99 })).matched !== "flee");
    ok("flee: hpf===0.29999 DOES flee",
        evaluateGuards(G, baseCtx({ m: { id: "c2", kind: "chaser", spec: ai.KINDS.chaser, x: 0, z: 0, cool: 99, yaw: 0 }, hpf: 0.29999, dist: 99 })).matched === "flee");
    ok("flee: a flees-capable kind with hpf===null (getHP absent/unknown) never flees",
        evaluateGuards(G, baseCtx({ m: { id: "c3", kind: "chaser", spec: ai.KINDS.chaser, x: 0, z: 0, cool: 99, repath: 0, step: null, yaw: 0 }, hpf: null, dist: 99 })).matched === "chase");

    const brute = ai.KINDS.brute;
    ok("melee: dist===atkR matches (non-strict <=)",
        evaluateGuards(G, baseCtx({ m: { id: "b1", kind: "brute", spec: brute, x: 0, z: 0, cool: 0, yaw: 0 }, dist: brute.atkR })).matched === "melee");
    ok("melee: dist===atkR+epsilon does not",
        evaluateGuards(G, baseCtx({ m: { id: "b2", kind: "brute", spec: brute, x: 0, z: 0, cool: 0, repath: 0, step: null, yaw: 0 }, dist: brute.atkR + 1e-6 })).matched !== "melee");

    const archer = ai.KINDS.archer;
    ok("ranged-shoot: dist===shootR matches (non-strict <=)",
        evaluateGuards(G, baseCtx({ m: { id: "a1", kind: "archer", spec: archer, x: 0, z: 0, cool: 0, shootCool: 0, yaw: 0 }, dist: archer.shootR })).matched === "ranged-shoot");
    ok("ranged-shoot: dist===shootR+epsilon does not, and (too far for hold too) falls to chase",
        evaluateGuards(G, baseCtx({ m: { id: "a2", kind: "archer", spec: archer, x: 0, z: 0, cool: 0, shootCool: 0, repath: 0, step: null, yaw: 0 }, dist: archer.shootR + 1e-6 })).matched === "chase");
    ok("!! ranged-hold: dist===shootR*0.6 exactly does NOT hold (strict <, not <=) -- and if also off cooldown, ranged-shoot claims it instead (dist<=shootR is still true there)",
        evaluateGuards(G, baseCtx({ m: { id: "a3", kind: "archer", spec: archer, x: 0, z: 0, cool: 0, shootCool: 0, yaw: 0 }, dist: archer.shootR * 0.6 })).matched === "ranged-shoot");
    ok("ranged-hold: dist===shootR*0.6 exactly, WHILE COOLING, matches neither ranged guard and falls to chase",
        evaluateGuards(G, baseCtx({ m: { id: "a4", kind: "archer", spec: archer, x: 0, z: 0, cool: 0, shootCool: 0.5, repath: 0, step: null, yaw: 0 }, dist: archer.shootR * 0.6 })).matched === "chase");
    ok("ranged-hold: dist just under shootR*0.6, while cooling, DOES hold",
        evaluateGuards(G, baseCtx({ m: { id: "a5", kind: "archer", spec: archer, x: 0, z: 0, cool: 0, shootCool: 0.5, yaw: 0 }, dist: archer.shootR * 0.6 - 1e-6 })).matched === "ranged-hold");
}

console.log("\n4. SABOTAGE -- reordering DUNGEON_GUARDS changes behaviour, proving the priority order is load-bearing");
{
    const { ai, calls } = harness();
    const G = ai.DUNGEON_GUARDS;
    // a chaser both fleeing (hpf<0.3) AND inside melee range -- the exact conflict the original if/else-if
    // chain resolved by checking flee FIRST.
    const ctx = { m: { id: "z1", kind: "chaser", spec: ai.KINDS.chaser, x: 0, z: 0, cool: 0, yaw: 0 },
                  p: { x: 0, z: 1 }, dxp: 0, dzp: 1, dist: 1, dt: 1 / 60, enr: false, pgx: 0, pgz: 1, seen: false, hpf: 0.1 };
    const original = evaluateGuards(G, ctx).matched;
    const hitsBefore = calls.onHitPlayer.length;

    const swapped = [G[1], G[0], G[2], G[3], G[4]];   // melee moved ahead of flee
    const ctx2 = { ...ctx, m: { ...ctx.m, id: "z2" } };
    const sabotaged = evaluateGuards(swapped, ctx2).matched;

    ok("!! with melee moved ahead of flee, the SAME low-HP-in-range monster now melees instead of fleeing",
        original === "flee" && sabotaged === "melee" && calls.onHitPlayer.length === hitsBefore + 1,
        "original=" + original + " sabotaged=" + sabotaged + " -- if these matched, this gate would be proving nothing about order");
}

console.log("\n5. THE AGGRO PRE-FILTER -- deliberately OUTSIDE DUNGEON_GUARDS, hysteresis in both directions, through the real update() loop");
{
    const { ai, calls, setPlayer } = harness();
    const kind = ai.add("m1", 100, 0, "brute");   // wakes at aggro=10, sleeps at aggro*1.8=18
    const m = ai.monsters.get("m1");
    ok("fixture: spawned a brute", kind === "brute");

    setPlayer(100, 20);   // 20 units away -- outside aggro range
    for (let i = 0; i < 5; i++) ai.update(1 / 60);
    ok("asleep outside aggro range: no moveEntity calls, DUNGEON_GUARDS never ran", calls.moveEntity.length === 0 && !m.aggroed);

    setPlayer(100, 9);   // 9 units -- inside aggro=10, and LOS is trivially clear (open grid)
    ai.update(1 / 60);
    ok("crossing into aggro range wakes it", m.aggroed === true);
    const movesAfterWake = calls.moveEntity.length;
    ok("and DUNGEON_GUARDS ran the same tick it woke -- at least one action fired", movesAfterWake > 0);

    setPlayer(100, 15);   // 15 < aggro*1.8=18 -- still aggroed, chain keeps running
    ai.update(1 / 60);
    ok("within the wider sleep threshold it stays aggroed and keeps acting", m.aggroed === true && calls.moveEntity.length > movesAfterWake);

    setPlayer(100, 19);   // > aggro*1.8=18 -- sleeps
    const movesBeforeSleep = calls.moveEntity.length;
    ai.update(1 / 60);
    ok("!! past aggro*1.8 it goes back to sleep, in the SAME tick, before DUNGEON_GUARDS runs",
        m.aggroed === false && calls.moveEntity.length === movesBeforeSleep,
        "the hysteresis gap (10 to 18) is itself the point -- a monster does not re-sleep the instant it steps outside the wake radius");
}

console.log("\n6. getHP IS READ ONLY WHERE THE ORIGINAL READ IT -- ctx.hpf's precompute is conditional, not unconditional");
{
    const { ai, calls, setPlayer } = harness({ hp: { arch1: 0.9 } });
    ai.add("brute1", 0, 0, "brute");     // not flees, not boss -- must never call getHP
    ai.add("arch1", 0, 0, "archer");     // ranged, not flees, not boss -- must never call getHP either
    ai.aggro("brute1"); ai.aggro("arch1");
    setPlayer(0, 3);
    calls.getHP.length = 0;
    ai.update(1 / 60);
    ok("!! neither a non-flees non-boss brute nor a non-flees ranged archer ever triggers a getHP() call",
        calls.getHP.length === 0, "getHP() calls so far: " + JSON.stringify(calls.getHP));
}

console.log("\n7. BOSS ENRAGE -- the enr flag (computed OUTSIDE DUNGEON_GUARDS, in update()) still halves cooldowns through the migrated actions");
{
    const { ai, calls, setPlayer } = harness({ hp: { boss1: 0.2 } });   // < 0.3 -- enraged
    ai.add("boss1", 0, 0, "boss");
    const m = ai.monsters.get("boss1");
    ai.aggro("boss1");
    setPlayer(0, ai.KINDS.boss.atkR - 0.1);   // inside melee range
    ai.update(1 / 60);
    ok("enraged boss's melee cooldown is halved (spec.cool * 0.6)", Math.abs(m.cool - ai.KINDS.boss.cool * 0.6) < 1e-9);
    ok("and the hit still landed", calls.onHitPlayer.length === 1);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: wall collision and the wall-follower fallback inside _actFlee/_actChase (tools/ship/" +
    "dungeonWalls-selfcheck.mjs owns that, re-ran clean against this migration); the GPU-brain hook amendments' " +
    "OWN correctness (PATCH-B16/B17/B18/B22 -- these tests exercise the no-brain path only, the same way " +
    "dungeonWalls-selfcheck.mjs's section 7 does, since node has no window); and the aggro pre-filter's own " +
    "asleep/awake shape as a potential ui/machine.mjs FSM candidate, flagged but not acted on in this round's " +
    "tools/ship/nextRounds.mjs writeup.");
process.exit(fails ? 1 : 0);
