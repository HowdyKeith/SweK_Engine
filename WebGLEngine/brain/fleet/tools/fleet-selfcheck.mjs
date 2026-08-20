// brain/fleet/tools/fleet-selfcheck.mjs -- v2221 -- proves the fleet transition tracker.
//
//   node brain/fleet/tools/fleet-selfcheck.mjs

import { FleetTracker } from "../fleetTracker.js";

let pass = 0, fail = 0;
const ok = (n, c, x) => { (c ? pass++ : fail++); console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  -- " + x : ""}`); };
const verbs = (evs) => evs.map(e => e.verb + ":" + e.peer).join(",");

const A = "http://a", B = "http://b";

// -------- sail-in fires exactly once per peer per run --------
{
    const t = new FleetTracker({ missThreshold: 3 });
    t.beginRun("r1");
    ok("A sails in on first sighting", verbs(t.observe([A])) === "in:" + A);
    ok("A does NOT sail in again", verbs(t.observe([A])) === "", "dedup");
    ok("B sails in when it appears", verbs(t.observe([A, B])) === "in:" + B);
    ok("inSet has both", t.inSet().length === 2 && t.isIn(A) && t.isIn(B));
}

// -------- a brief flap does NOT sail a peer out --------
{
    const t = new FleetTracker({ missThreshold: 3 });
    t.beginRun("r2");
    t.observe([A, B]);
    ok("A absent once -> no event", verbs(t.observe([B])) === "", "miss 1 of 3");
    ok("A absent twice -> no event", verbs(t.observe([B])) === "", "miss 2 of 3");
    ok("A returns before threshold -> no out, still aboard", verbs(t.observe([A, B])) === "" && t.isIn(A), "flap survived");
    ok("A absence count reset after return", verbs(t.observe([B])) === "" && verbs(t.observe([B])) === "");
}

// -------- a real departure sails a peer out, once, at the threshold --------
{
    const t = new FleetTracker({ missThreshold: 3 });
    t.beginRun("r3");
    t.observe([A, B]);
    ok("miss 1 silent", verbs(t.observe([B])) === "");
    ok("miss 2 silent", verbs(t.observe([B])) === "");
    ok("miss 3 -> A sails out", verbs(t.observe([B])) === "out:" + A);
    ok("A gone from inSet", !t.isIn(A) && t.isIn(B));
    ok("no repeat out for A", verbs(t.observe([B])) === "");
}

// -------- endRun sails everyone out; a new run lets them sail in again --------
{
    const t = new FleetTracker({ missThreshold: 2 });
    t.beginRun("r4");
    t.observe([A, B]);
    const outs = t.endRun();
    ok("endRun sails out everyone aboard", outs.length === 2 && outs.every(e => e.verb === "out"));
    ok("run cleared", t.run === null && t.inSet().length === 0);
    t.beginRun("r5");
    ok("A can sail into the NEW run", verbs(t.observe([A])) === "in:" + A, "new run resets membership");
}

// -------- observe without an explicit beginRun auto-starts a run --------
{
    const t = new FleetTracker();
    ok("observe auto-starts a run", verbs(t.observe([A])) === "in:" + A && !!t.run);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (typeof process !== "undefined") process.exit(fail ? 1 : 0);
