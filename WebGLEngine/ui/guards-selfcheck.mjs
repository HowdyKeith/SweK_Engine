// WebGLEngine/ui/guards-selfcheck.mjs -- v4608
//
// Run: node ui/guards-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/guards.mjs -- the ordered-guard-list evaluator, the second shared decision-logic utility from
// tools/ship/nextRounds.mjs's "npc-decision-framework" audit, after ui/machine.mjs. Where machine.mjs is for a
// persisting state field that gates its own next transition, this is for the OTHER shape the audit named: an
// ordered if/else-if chain, remade fresh every call, first true condition wins. Its own header explains why
// there is no audit()/reachable() equivalent here -- a guard's condition is an arbitrary function, not an
// enumerable state name -- so this gate proves the two things that ARE checkable instead: first match wins
// (not last, not every), and order is load-bearing (reordering two guards changes the outcome).
"use strict";
import { evaluateGuards } from "./guards.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("guards-selfcheck -- the ordered-guard-list evaluator, gated before any real caller uses it\n");

console.log("1. FIRST MATCH WINS -- not last, not every");
{
    const calls = [];
    const guards = [
        { name: "a", when: () => false, then: () => calls.push("a") },
        { name: "b", when: () => true, then: () => calls.push("b") },
        { name: "c", when: () => true, then: () => calls.push("c") },   // also true -- must NOT run
    ];
    const r = evaluateGuards(guards, {});
    ok("!! the first TRUE guard wins, by name", r.matched === "b" && r.index === 1);
    ok("!! ...and its action is the ONLY one that ran -- a later true guard never fires",
        calls.length === 1 && calls[0] === "b");
}

console.log("\n2. ORDER IS LOAD-BEARING -- proven by reordering, not asserted");
{
    const bothTrue = [
        { name: "low-priority", when: (ctx) => ctx.x > 0 },
        { name: "high-priority", when: (ctx) => ctx.x > 0 },
    ];
    const forward = evaluateGuards(bothTrue, { x: 1 });
    ok("in this order, 'low-priority' wins because it's listed first", forward.matched === "low-priority");

    const reversed = [bothTrue[1], bothTrue[0]];
    const back = evaluateGuards(reversed, { x: 1 });
    ok("!! the SAME two guards, reversed, flip the winner -- proving list order decides the outcome, not name or content",
        back.matched === "high-priority",
        "forward=" + forward.matched + " reversed=" + back.matched);
}

console.log("\n3. NO MATCH is a clean, non-throwing outcome");
{
    const r = evaluateGuards([{ name: "never", when: () => false }], { });
    ok("!! matched is null, index is -1, result is undefined -- distinguishable from a real match at index 0",
        r.matched === null && r.index === -1 && r.result === undefined);
    const r2 = evaluateGuards([], {});
    ok("an EMPTY guard list is also a clean no-match, not a crash", r2.matched === null && r2.index === -1);
}

console.log("\n4. ctx IS FORWARDED, UNEXAMINED, TO BOTH when() AND then()");
{
    const ctx = { hp: 12, tag: "probe" };
    let seenInWhen = null, seenInThen = null;
    const guards = [
        { name: "x", when: (c) => { seenInWhen = c; return c.hp < 20; }, then: (c) => { seenInThen = c; return c.hp * 2; } },
    ];
    const r = evaluateGuards(guards, ctx);
    ok("!! when() receives the exact ctx object (identity, not a copy)", seenInWhen === ctx);
    ok("!! then() receives it too", seenInThen === ctx);
    ok("!! then()'s return value is handed back as result", r.result === 24);
}

console.log("\n5. then() IS OPTIONAL -- a guard can be a pure 'stop here' marker");
{
    const guards = [{ name: "stop-only", when: () => true }];   // no then
    const r = evaluateGuards(guards, {});
    ok("!! matching a guard with no then() still reports the match, with result undefined (not a throw)",
        r.matched === "stop-only" && r.result === undefined);
}

console.log("\n6. AN UNNAMED GUARD reports its ARRAY INDEX as matched, so a caller never has to invent names for every rule");
{
    const r = evaluateGuards([{ when: () => false }, { when: () => true, then: () => "hit" }], {});
    ok("!! matched is the numeric index 1, not undefined or a made-up label", r.matched === 1 && r.result === "hit");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nunchecked here: any real caller's own condition/action logic -- this gate proves the WALK (evaluateGuards " +
    "itself), not any particular guard list built on top of it; simulation/SpaceSuit.js's _currentAtmosphere() " +
    "migration (tools/ship/spaceSuit-selfcheck.mjs, if it exists by the time this is read) is the first real one.");
process.exit(fails ? 1 : 0);
