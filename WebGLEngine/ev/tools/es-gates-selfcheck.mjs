// Self-check for the ES mission lifecycle GATES: `to accept`, `to complete`, `to fail`.
//
// These three condition blocks exist in real Endless Sky data (to fail 174, to accept 102,
// to complete 100 in current master) and were parsed by nobody until v2164 -- a mission could
// complete when ES says it must not. Each test below FAILS if its gate is removed, which is
// the only reason a test is worth having.
//
//   node ev/tools/es-gates-selfcheck.mjs

import { parseES } from "../esParse.js";
import { buildUniverseFromES } from "../esData.js";
import { createConditionStore } from "../esConditions.js";
import { createEsMissionRunner } from "../esMissions.js";

let pass = 0, fail = 0;
const ok = (n, c) => c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  FAIL " + n));

const DATA = [
    'system "Alpha"',
    '\tpos 0 0',
    'system "Beta"',
    '\tpos 10 0',
    'planet "Home"',
    '\tlandscape land/x',
    'planet "Away"',
    '\tlandscape land/y',
    'system "Alpha"',
    '\tobject "Home"',
    'system "Beta"',
    '\tobject "Away"',
].join("\n");

function world() {
    const uni = buildUniverseFromES(parseES(DATA));
    // buildUniverseFromES gives us systems/spobs; find the two planets by name
    const spobs = [];
    for (const s of uni.systems) for (const sp of (s.spobs || [])) spobs.push(sp);
    return { uni, spobs };
}

function mission(src) { return parseES(src).children[0]; }

function setup(missionSrc, seed = {}) {
    const { uni, spobs } = world();
    const store = createConditionStore({ conditions: {}, reputation: {}, credits: 1000 }, uni);
    for (const k in seed) store.set(k, seed[k]);
    const run = createEsMissionRunner(uni, store, {});
    const m = mission(missionSrc);
    const home = spobs.find((s) => s.name === "Home");
    const away = spobs.find((s) => s.name === "Away");
    return { uni, store, run, m, home, away };
}

// ---- 1. `to accept` --------------------------------------------------------------
{
    const src = [
        'mission "Gated Accept"',
        '\tname "Gated Accept"',
        '\tjob',
        '\tsource "Home"',
        '\tdestination "Away"',
        '\tto accept',
        '\t\thas "permit"',
        '\ton accept',
        '\t\tset "took"',
    ].join("\n");

    const a = setup(src);                       // no permit
    ok("to accept: refused without the condition", a.run.accept(a.m) === false);
    ok("to accept: on-accept did NOT run", a.store.get("took") === 0);
    ok("to accept: mission not active", a.run.active().length === 0);

    const b = setup(src, { permit: 1 });        // with permit
    ok("to accept: allowed once satisfied", b.run.accept(b.m) !== false);
    ok("to accept: on-accept ran", b.store.get("took") === 1);
}

// ---- 2. `to complete` ------------------------------------------------------------
{
    const src = [
        'mission "Gated Complete"',
        '\tname "Gated Complete"',
        '\tjob',
        '\tsource "Home"',
        '\tdestination "Away"',
        '\tto complete',
        '\t\thas "proof"',
        '\ton complete',
        '\t\tset "paid"',
    ].join("\n");

    const a = setup(src);
    a.run.accept(a.m);
    const done1 = a.run.onArrive(a.away.id, a.away._systemId);
    ok("to complete: arriving without the condition does NOT complete", done1.length === 0);
    ok("to complete: on-complete did NOT run", a.store.get("paid") === 0);
    ok("to complete: mission still active", a.run.active().length === 1);

    // satisfy the condition, arrive again
    a.store.set("proof", 1);
    const done2 = a.run.onArrive(a.away.id, a.away._systemId);
    ok("to complete: completes once satisfied", done2.length === 1);
    ok("to complete: on-complete ran", a.store.get("paid") === 1);
}

// ---- 3. `to fail` ----------------------------------------------------------------
{
    const src = [
        'mission "Gated Fail"',
        '\tname "Gated Fail"',
        '\tjob',
        '\tsource "Home"',
        '\tdestination "Away"',
        '\tto fail',
        '\t\thas "blown"',
        '\ton fail',
        '\t\tset "fined"',
    ].join("\n");

    const a = setup(src);
    a.run.accept(a.m);
    ok("to fail: accepted and active", a.run.active().length === 1);

    a.run.checkFailures();
    ok("to fail: does NOT fire while the condition is false", a.run.active().length === 1);

    a.store.set("blown", 1);
    const failed = a.run.checkFailures();
    ok("to fail: fires when the condition becomes true", failed.includes("Gated Fail"));
    ok("to fail: on-fail ran", a.store.get("fined") === 1);
    ok("to fail: mission no longer active", a.run.active().length === 0);

    // it must also trip on a jump, not only at a destination the player may never reach
    const b = setup(src);
    b.run.accept(b.m);
    b.store.set("blown", 1);
    b.run.onPlayerJump(1, 2);
    ok("to fail: also trips on a jump", b.run.active().length === 0);
}

// ---- 4. an UNGATED mission is not blocked by any of this --------------------------
{
    const src = [
        'mission "Plain"',
        '\tname "Plain"',
        '\tjob',
        '\tsource "Home"',
        '\tdestination "Away"',
        '\ton complete',
        '\t\tset "ok"',
    ].join("\n");
    const a = setup(src);
    ok("ungated: accepts", a.run.accept(a.m) !== false);
    const done = a.run.onArrive(a.away.id, a.away._systemId);
    ok("ungated: completes on arrival", done.length === 1 && a.store.get("ok") === 1);
}

console.log("");
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
