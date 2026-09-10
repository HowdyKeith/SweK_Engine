// WebGLEngine/ui/guards.mjs -- v4608
//
// AN ORDERED LIST OF (CONDITION, ACTION) RULES, EVALUATED TOP TO BOTTOM, FIRST MATCH WINS.
//
// ui/machine.mjs is for a DIFFERENT shape: a persisting field (this.state) whose CURRENT value gates what
// transition is legal next -- the guarded-lifecycle pattern behind BossPhaseManager.js, CSBomb.js,
// CSRoundManager.js and the other tools/ship/nextRounds.mjs "npc-decision-framework" migrations. Not every
// hand-rolled dispatch is that shape. That same audit named a second cluster: files with NO state field at
// all, that just walk an ordered if/else-if chain every call and take the first branch whose condition holds
// -- DungeonAI.js's flee/melee/ranged-shoot/ranged-hold/chase priority, SpaceSuit.js's atmosphere classifier.
// Nothing PERSISTS between calls in this shape -- the whole decision is remade from scratch every time, the
// same "recomputed fresh" property that made CSBot.js and WeatherSystem.js wrong fits for machine.mjs -- so a
// declared-graph, reachable-state model does not apply here either. What repeats instead is the WALK ITSELF:
// "for each rule in order, if its condition holds, run its action and stop" -- rewritten slightly differently
// by hand in five or six files that were audited as containing exactly this shape.
//
// WHAT THIS DOES NOT CLAIM. Unlike machine.mjs's audit()/reachable(), there is no static reachability check
// here -- a guard's condition is an arbitrary function, not an enumerable state name, so nothing here can prove
// a guard placed after an unconditional `() => true` is unreachable the way machine.mjs proves a declared
// transition target is real. The value on offer is narrower and still real: ONE walk instead of N hand-written
// copies of it, unit-testable as a plain array independent of the side effects its actions run, with the
// "first match, not every match" contract enforced in one place rather than trusted anew at every call site.
"use strict";

/**
 * @param {Array<{name?: (string|number), when: (ctx: *) => boolean, then?: (ctx: *) => *}>} guards
 *   An ordered list of rules. `when` decides if this rule applies; `then` (optional) runs when it does and its
 *   return value is handed back as `result`. A guard with no `then` is a pure "stop here, do nothing" marker.
 * @param {*} ctx  Passed to every `when`/`then` call, unexamined -- whatever shape the caller's rules need.
 * @returns {{matched: (string|number|null), index: number, result: *}}
 *   matched: the winning guard's own `name`, or its array index if it has none; null if no guard's `when` held.
 *   index:   the winning guard's array position, or -1 if none matched.
 *   result:  whatever that guard's `then(ctx)` returned, or undefined if it had none, or if none matched.
 */
export function evaluateGuards(guards, ctx) {
    for (let i = 0; i < guards.length; i++) {
        const g = guards[i];
        if (g.when(ctx)) {
            const result = g.then ? g.then(ctx) : undefined;
            return { matched: g.name != null ? g.name : i, index: i, result };
        }
    }
    return { matched: null, index: -1, result: undefined };
}
