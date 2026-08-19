// WebGLEngine/ui/machine-selfcheck.mjs -- v2987
//
// Run: node ui/machine-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/machine.mjs -- interaction logic as an EXPLICIT state machine, from chakra-ui/zag.
//
// Zag's own reason for existing, and the reason this is worth porting: they had "too many hiccups and bugs
// related to how we coordinate events, manage state, and side effects", and most of them lived in the
// ORCHESTRATION rather than in any single piece of logic. Their second rule -- machines must be lightweight,
// no spawn, no nested states -- is why this is sixty lines rather than a statechart dependency.
//
// THE EXACT KEY IS THE GRAVEYARD CENSUS'S SHAPE, ONE LEVEL DOWN:
//   an UNREACHABLE state is a branch of UI nobody can ever see -- a green gate on nothing, in a render function;
//   a DEAD state is one the machine can enter and never leave;
//   an UNDECLARED transition target is the worst of the three, because it is the state that renders as
//   SOMETHING ELSE, and it is caught AT DEFINITION rather than when a user finds it.
import { defineMachine, reachable, audit, RIG_JOB } from "./machine.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the audit finds what it is for ---------------------------------------------------------------------
{
    const a = audit(RIG_JOB);
    ok("!! every declared rig-job state is REACHABLE", a.unreachable.length === 0,
       a.reachable.join(", ") + " -- a state you declared and cannot reach is UI nobody can ever see");
    ok("!! ...and no reachable state is DEAD", a.dead.length === 0,
       "a state the machine can enter and never leave would freeze the panel with no error");
    ok("the machine is small, as zag insists", a.states <= 8 && a.states >= 3, a.states + " states");
}

// ---- 2. IT CAN FAIL -- a control that cannot fail is decoration --------------------------------------------------
{
    const orphan = defineMachine({ initial: "a", states: { a: { on: { go: "b" } }, b: { final: true }, ghost: { final: true } } });
    const oa = audit(orphan);
    ok("!! SABOTAGE: an unreachable state IS caught", !oa.ok && oa.unreachable.includes("ghost"),
       "declared 'ghost', reachable from nothing");
    const stuck = defineMachine({ initial: "a", states: { a: { on: { go: "b" } }, b: {} } });
    ok("!! SABOTAGE: a dead state IS caught", audit(stuck).dead.includes("b"),
       "'b' is reachable, not final, and has no way out");
    ok("...and a healthy machine still passes the same audit", audit(RIG_JOB).ok,
       "so the sabotage proves the check, not a broken auditor");
}

// ---- 3. AN UNDECLARED TARGET IS REFUSED AT DEFINITION ----------------------------------------------------------------
{
    const throws = (def, re) => { try { defineMachine(def); return false; } catch (e) { return re.test(e.message); } };
    ok("!! a transition to an undeclared state THROWS", throws({ initial: "a", states: { a: { on: { go: "nowhere" } } } }, /not declared/),
       "caught when the machine is written, not when a user reaches it -- that is the state which renders as something else");
    ok("an undeclared INITIAL state throws", throws({ initial: "z", states: { a: {} } }, /initial state/));
    ok("a malformed definition throws", throws({}, /needs an initial state/));
}

// ---- 4. THE MACHINE DESCRIBES WHAT THE BRIDGE ACTUALLY DOES ------------------------------------------------------------
{
    const bridge = fs.readFileSync(path.join(ENG, "ai-bridge", "rigJobBridge.js"), "utf8");
    for (const s of ["running", "failed"]) {
        ok("the bridge really uses the '" + s + "' state", new RegExp('"' + s + '"|\\b' + s + '\\b').test(bridge),
           "declared here and observed there, so the panel and the bridge check against ONE statement");
    }
    ok("!! 'killed' is DISTINCT from 'failed'", RIG_JOB.stateNames.includes("killed") && RIG_JOB.stateNames.includes("failed"),
       "the job that ran and said no is not the job that was interrupted -- and for the mutation job, killed is the DANGEROUS exit that can leave a mutation in the tree");
    ok("...and the note says why that matters", /stranded marker/i.test(RIG_JOB.states.killed.note || ""));
    ok("every state carries a note", RIG_JOB.stateNames.every((n) => (RIG_JOB.states[n].note || "").length > 20),
       "a state name with no explanation is a name, not a specification");
}

// ---- 5. next() is honest about events it does not handle ------------------------------------------------------------------
{
    ok("an unhandled event returns null, not the same state", RIG_JOB.next("idle", "finish") === null,
       "silently staying put would hide an event fired in the wrong state");
    ok("a handled event moves", RIG_JOB.next("idle", "start") === "running");
    ok("an unknown state throws rather than guessing", (() => { try { RIG_JOB.next("nope", "start"); return false; } catch { return true; } })());
}

console.log(fails ? "\nmachine-selfcheck: " + fails + " FAILED" : "\nmachine-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
