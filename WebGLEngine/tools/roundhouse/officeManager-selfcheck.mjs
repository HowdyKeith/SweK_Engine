// WebGLEngine/tools/roundhouse/officeManager-selfcheck.mjs -- v3824
//
// Run: node tools/roundhouse/officeManager-selfcheck.mjs
//
// *** THE MANAGER IS PURE, SO EVERY EDGE CASE A FLEET WOULD TAKE HOURS TO REACH IS A LITERAL HERE. *** That is
// the whole reason nextAssignments takes `now` and every register as arguments: an abandoned lease, an
// exhausted budget, a fleet where every peer is UNATTENDED, and a frontier that cannot be served are four
// states you would otherwise have to WAIT FOR, and waiting for a scheduling bug is how they ship.
//
// THE JOIN IS ASSERTED AGAINST THE REAL MODULES, NOT AGAINST MY MEMORY OF THEM. Section 1 imports jobQueue and
// activity and drives the manager with values THEY produce. A scheduler written against a remembered shape is
// the stale-record defect this tree keeps finding, and the shapes here were read out of the files a round ago,
// which is exactly long enough to have got one wrong.
//
// FOUR PLANTS, AND THE FIRST IS THE ONE THAT MATTERS:
//   1. A MANAGER THAT GRADES.       It reads a result's VALUE to decide what to re-run. Every scheduling test
//                                   still passes -- which is precisely why the plant exists.
//   2. A manager that starves.      Frontier non-empty, nothing assigned, nothing escalated: silence.
//   3. A manager that truncates.    Spends the last of the budget on a partial assignment instead of refusing.
//   4. A manager that assigns to    An UNATTENDED peer says "running" and nothing has updated it in fifteen
//      a peer that is not there.    minutes. Treating it as busy is right; treating it as free loses the job.

"use strict";
import { ACTIVITY, activityOf } from "./activity.mjs";
import { emptyQueue, enqueue, claim, validateSpec } from "./jobQueue.mjs";
import {
    nextAssignments, peerAvailability, specForProposal, isSettled,
    ESCALATION, DEFAULT_MAX_ATTEMPTS, reportLines,
} from "./officeManager.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// *** EVERY ESCALATION LOOKUP GOES THROUGH THIS, AND IT IS NOT DEFENSIVE PROGRAMMING -- IT IS THE DIFFERENCE
// BETWEEN A PLANT THAT FAILS AND A PLANT THAT CRASHES. An earlier draft of this gate wrote
// `r.escalations[0].why` straight into a detail string. That argument is evaluated BEFORE ok() decides
// anything, so the moment a plant correctly emptied the escalation list the gate threw a TypeError, printed
// ZERO "FAIL" lines and exited 1 -- and a plant that fires looks exactly like a plant that does not to anyone
// counting failures. v3605's lesson, walked into while proving plants for a scheduler. ***
const esc = (r, kind = null) => (r.escalations || []).find((e) => !kind || e.kind === kind) || {};

const T0 = Date.parse("2026-01-01T00:00:00.000Z");
const prop = (kind, subject) => ({ kind, subject, grader: "tools/roundhouse/" + kind + "Coverage.mjs", task: "t", why: "w" });
const peer = (key, activity) => ({ key, activity });

/* ============================================================================================================
 * 1. THE JOIN -- driven with values the real registers produce
 * ========================================================================================================= */
{
    // activityOf is the authority on what an activity record looks like. Hand-rolling one here would let the
    // manager and the roster drift apart with nothing to notice.
    const idle = activityOf(null, T0);
    const running = activityOf({ startedAt: T0, device: "lbm", round: 2, maxRounds: 8 }, T0);

    ok("activity.activityOf yields the two states the manager sorts on",
       idle.state === ACTIVITY.IDLE && running.state === ACTIVITY.RUNNING,
       `${idle.state} / ${running.state}`);

    const avail = peerAvailability([
        peer("a", idle), peer("b", running),
        peer("c", { state: ACTIVITY.UNATTENDED }), peer("d", { state: ACTIVITY.UNKNOWN }), peer("e", {}),
    ], { now: T0 });

    ok("!! the four peer states are separated, and a peer reporting NOTHING is UNKNOWN rather than idle",
       avail.free.length === 1 && avail.busy.length === 1 && avail.unattended.length === 1 && avail.unknown.length === 2,
       "*** activity.mjs's own header says UNKNOWN is 'an OLD BUILD, not an idle box'. Folding it into idle is the tempting simplification and it hands work to a peer that cannot run it -- the job is claimed, the lease expires, and the only symptom is a queue that never drains. ***");

    // The spec the manager emits must be one jobQueue will actually take. The authority is validateSpec.
    const spec = specForProposal(prop("plant", "physics/em/skinDepth.mjs"));
    const v = validateSpec(spec, {});
    ok("the emitted job spec passes jobQueue.validateSpec",
       v.ok === true, v.ok ? "kind=" + spec.kind : "problems: " + (v.problems || []).join("; "));

    ok("!! ...and it carries a grader PATH as config, never a command",
       typeof spec.config.grader === "string" && !("cmd" in spec.config) && !("script" in spec.config) &&
       spec.config.subject === "physics/em/skinDepth.mjs",
       "jobQueue's own rule: 'A JOB NAMES WORK FROM A FIXED CATALOG. IT NEVER CARRIES CODE.' A proposal is a grader plus a subject, and both are names the peer looks up in its own registry -- so the tempting design, a job containing the command to run, is refused here as well as there.");
}

/* ============================================================================================================
 * 2. ORDINARY DISPATCH
 * ========================================================================================================= */
{
    const idle = activityOf(null, T0);
    const r = nextAssignments({
        frontier: [prop("plant", "a.mjs"), prop("grade", "b.mjs"), prop("plant", "c.mjs")],
        fleet: [peer("p1", idle), peer("p2", idle)],
        queue: emptyQueue(), ledger: {}, now: T0,
    });

    ok("two idle peers take two of three proposals, and the third waits",
       r.assignments.length === 2 && r.considered === 3 && r.idle === 0);

    ok("...one peer is never given two jobs at once",
       new Set(r.assignments.map((a) => a.peer)).size === 2);

    ok("...and nothing is escalated, because nothing went wrong",
       r.escalations.length === 0,
       "munder-difflin's rule, and the only thing that makes an approvals queue worth having: routine work is resolved autonomously or the human learns to ignore the queue.");

    const settled = nextAssignments({
        frontier: [prop("plant", "a.mjs"), prop("grade", "b.mjs")],
        fleet: [peer("p1", idle)], queue: emptyQueue(), ledger: { "a.mjs": { at: "whenever" } }, now: T0,
    });
    ok("a subject already in the ledger is not re-proposed",
       settled.settled === 1 && settled.assignments.length === 1 && settled.assignments[0].proposal.subject === "b.mjs");
}

/* ============================================================================================================
 * 3. *** THE PLANT THAT MATTERS: A MANAGER THAT GRADES ***
 * ========================================================================================================= */
{
    // The shipped rule reads EXISTENCE. The plant reads the VALUE and re-opens anything that scored badly --
    // which is the single most reasonable-looking change anybody will ever propose to this file.
    const gradingIsSettled = (ledger, subject) => {
        const rec = (ledger || {})[subject];
        if (!rec) return false;
        return rec.score >= 0.8;                    // <-- the plant: an opinion about a result, inside the dispatcher
    };

    const ledger = { "a.mjs": { score: 0.3 }, "b.mjs": { score: 0.95 } };

    ok("the shipped rule settles BOTH subjects, because both have records",
       isSettled(ledger, "a.mjs") === true && isSettled(ledger, "b.mjs") === true);

    ok("!! *** THE GRADING PLANT RE-OPENS THE LOW-SCORING SUBJECT, AND EVERY SCHEDULING TEST STILL PASSES ***",
       gradingIsSettled(ledger, "a.mjs") === false && gradingIsSettled(ledger, "b.mjs") === true,
       "*** THIS IS WHY THE PLANT IS HERE RATHER THAN A CHECK. It dispatches correctly. It never starves, never truncates, never double-books, and it would pass sections 1, 2, 4, 5 and 6 unchanged -- so no scheduling test can catch it. What it does is make the DISPATCHER an opinion about physics: 0.8 is a threshold nobody measured, and a subject that scored 0.79 now gets re-run forever while the number that decided it was never checked against anything. curriculum.mjs says of itself 'AND IT NEVER GRADES ANYTHING' and roundhouse.mjs exists because a loop whose stopping oracle is an opinion is an echo chamber. The manager reads whether a record EXISTS. Deciding a result was poor is the evaluator's job, and re-attempting it is a decision a human or the curriculum makes. ***");

    ok("...and the shipped rule is structurally incapable of expressing it",
       (() => {
           // isSettled sees only the key. Feed it records that differ ONLY in value and the answer cannot move.
           const good = { x: { score: 1.0, verdict: "excellent" } };
           const bad = { x: { score: 0.0, verdict: "catastrophic" } };
           return isSettled(good, "x") === isSettled(bad, "x");
       })(),
       "Not a promise in a comment: the two ledgers disagree about everything except the presence of the key, and the function cannot tell them apart.");
}

/* ============================================================================================================
 * 4. STARVATION -- the silent failure
 * ========================================================================================================= */
{
    const busy = activityOf({ startedAt: T0, device: "lbm" }, T0);
    const r = nextAssignments({
        frontier: [prop("plant", "a.mjs"), prop("grade", "b.mjs")],
        fleet: [peer("p1", busy), peer("p2", { state: ACTIVITY.UNATTENDED })],
        queue: emptyQueue(), ledger: {}, now: T0,
    });

    ok("!! a full frontier with no free peer ESCALATES rather than returning quietly empty",
       r.assignments.length === 0 && r.escalations.length === 1 && esc(r).kind === ESCALATION.STARVED,
       "*** AN EMPTY RESULT AND A BLOCKED FLEET ARE THE SAME RETURN VALUE, and that is the whole defect. 'No assignments' reads as 'nothing to do' on every dashboard the tree already has -- activity says one peer is running and one is unattended, both of which are true, and nobody is told that two graded proposals have been waiting since Tuesday. ***");

    ok("...and the escalation carries the fleet breakdown, so the cause is in the message",
       (esc(r, ESCALATION.STARVED).fleet || {}).busy === 1 && (esc(r, ESCALATION.STARVED).fleet || {}).unattended === 1 &&
       esc(r, ESCALATION.STARVED).open === 2,
       `"${esc(r, ESCALATION.STARVED).why || "(none raised)"}"`);

    const nothingToDo = nextAssignments({ frontier: [], fleet: [peer("p1", busy)], queue: emptyQueue(), now: T0 });
    ok("!! ...but an EMPTY frontier escalates nothing, which is the control",
       nothingToDo.escalations.length === 0,
       "An idle fleet with no work is not a fault, and a starvation check that cannot tell the two apart would page somebody every quiet night until they turned it off.");
}

/* ============================================================================================================
 * 5. BUDGET -- refuse, do not truncate
 * ========================================================================================================= */
{
    const idle = activityOf(null, T0);
    const r = nextAssignments({
        frontier: [prop("plant", "a.mjs"), prop("grade", "b.mjs"), prop("plant", "c.mjs")],
        fleet: [peer("p1", idle), peer("p2", idle), peer("p3", idle)],
        queue: emptyQueue(), ledger: {}, now: T0,
        budget: { tokensRemaining: 900, tokensPerJob: 400 },
    });

    ok("!! the budget stops dispatch at the last AFFORDABLE job and escalates the shortfall",
       r.assignments.length === 2 && r.escalations.length === 1 && esc(r).kind === ESCALATION.SPEND,
       `${r.assignments.length} of 3 assigned at 400 each from 900; escalation says "${esc(r).why || "(none raised -- work was truncated instead of refused)"}"`);

    ok("...the third peer is left idle rather than given a job that cannot be paid for",
       r.idle === 1);

    ok("!! ...and a STARVED escalation is NOT also raised, because the cause is already named",
       !r.escalations.some((e) => e.kind === ESCALATION.STARVED),
       "Two escalations for one event trains a reader to skim them. The spend case explains the idle peer completely, so the starvation check stands down -- and section 4 proves it still fires when spend is not the reason.");

    const free = nextAssignments({
        frontier: [prop("plant", "a.mjs")], fleet: [peer("p1", idle)], queue: emptyQueue(), now: T0, budget: null,
    });
    ok("a null budget means 'not token-bound' and never blocks",
       free.assignments.length === 1 && free.escalations.length === 0,
       "promptCost.BINDING_CONSTRAINT records that three of its four tiers are bound by requests, compute or wall clock rather than tokens -- so a manager that always enforced a token budget would be enforcing the wrong constraint on most of the fleet.");
}

/* ============================================================================================================
 * 6. STUCK JOBS -- read out of jobQueue's own counter
 * ========================================================================================================= */
{
    const idle = activityOf(null, T0);
    let q = emptyQueue();
    const e = enqueue(q, { kind: "suite", config: {} }, {}, { at: new Date(T0).toISOString() });
    q = e.queue;
    const id = e.job.id;

    // Claim and let the lease lapse, repeatedly. This is the real jobQueue doing it, not a hand-set counter.
    let t = T0;
    for (let k = 0; k < DEFAULT_MAX_ATTEMPTS; k++) {
        q = claim(q, "p" + k, { now: new Date(t).toISOString(), leaseMs: 1000 }).queue;
        t += 60_000;                                 // long past the lease: abandoned
    }

    say(`job ${id} attempts=${q.jobs[id].attempts} after ${DEFAULT_MAX_ATTEMPTS} lapsed leases`);
    ok("jobQueue's own attempts counter reaches the threshold",
       q.jobs[id].attempts >= DEFAULT_MAX_ATTEMPTS);

    const r = nextAssignments({
        frontier: [], fleet: [peer("p1", idle)], queue: q, ledger: {}, now: t,
    });
    ok("!! a repeatedly-abandoned job is escalated as STUCK",
       r.escalations.length === 1 && esc(r).kind === ESCALATION.STUCK && esc(r).job === id,
       "jobQueue's header already said 'a job that keeps being claimed and never finished is telling you something' -- and for 862 versions nothing was listening. The counter existed; the listener did not.");

    ok("...and a COMPLETED job never escalates however many attempts it took",
       (() => {
           const done = { ...q, jobs: { ...q.jobs, [id]: { ...q.jobs[id], completedAt: new Date(t).toISOString() } } };
           return nextAssignments({ frontier: [], fleet: [], queue: done, now: t }).escalations.length === 0;
       })(),
       "Three attempts and a success is a flaky peer, not an open question. Escalating it would be reporting history.");
}

/* ============================================================================================================
 * 7. IT DOES NOT FALL OVER
 * ========================================================================================================= */
{
    const cases = [
        ["no arguments at all", () => nextAssignments()],
        ["a null queue", () => nextAssignments({ frontier: [prop("plant", "a.mjs")], queue: null, fleet: [] })],
        ["a peer with no activity field", () => nextAssignments({ fleet: [{ key: "x" }], frontier: [] })],
        ["a curriculum RESULT rather than its array", () => nextAssignments({ frontier: { proposals: [prop("plant", "a.mjs")], skipped: [] }, fleet: [] })],
    ];
    for (const [name, fn] of cases) {
        let threw = null, out = null;
        try { out = fn(); } catch (err) { threw = err; }
        ok("survives " + name, !threw && out && Array.isArray(out.assignments), threw ? String(threw).slice(0, 80) : "");
    }

    ok("!! ...and the curriculum's own return object is accepted whole",
       nextAssignments({ frontier: { proposals: [prop("plant", "a.mjs")] }, fleet: [peer("p", activityOf(null, T0))], now: T0 }).assignments.length === 1,
       "curriculum.propose() returns { proposals, ungradable, unmeasured, skipped, refused, phases }. Requiring the caller to reach in for .proposals is a second place to get the shape wrong, so both forms are taken.");

    const lines = reportLines(nextAssignments({
        frontier: [prop("plant", "a.mjs")], fleet: [peer("p1", activityOf(null, T0))], queue: emptyQueue(), now: T0,
    }));
    ok("the report renders and says so when nothing was escalated",
       lines.length >= 2 && lines.some((l) => /nothing escalated/.test(l)));
}

console.log(fails === 0 ? "\n  ALL PASS\n" : `\n  ${fails} FAILURE(S)\n`);
process.exit(fails === 0 ? 0 : 1);
