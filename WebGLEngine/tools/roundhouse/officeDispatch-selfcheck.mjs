// WebGLEngine/tools/roundhouse/officeDispatch-selfcheck.mjs -- v3848
//
// officeManager has decided what runs next since v3824 and NOTHING HAS EVER LISTENED. This grades the half that
// makes it listen: the translation from an assignment into a job the queue will accept, and the two properties
// a dispatcher called on a TICK must have and a naive one does not -- it must not re-enqueue work already in
// flight, and it must not hand work to a peer that never said it was idle.
//
// Run: node tools/roundhouse/officeDispatch-selfcheck.mjs

import { fleetFromRoster, openSubjects, planDispatch, applyDispatch, dispatchLines } from "./officeDispatch.mjs";
import { emptyQueue, claim, complete, validateSpec } from "./jobQueue.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

import { fileURLToPath } from "node:url";
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (n, d) => console.log("  ----  " + n + "   " + d);
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");

const FRONTIER = [
    { kind: "plant", subject: "physics/alpha.mjs", grader: "tools/roundhouse/alphaBind.mjs" },
    { kind: "grade", subject: "physics/beta.mjs", grader: "tools/roundhouse/betaBind.mjs" },
];
const IDLE = (k) => ({ key: k, activity: { state: "idle" } });

console.log("1. *** A TICKED DISPATCHER MUST NOT ENQUEUE THE SAME WORK TWICE ***");
{
    // THE FRONTIER DOES NOT SHRINK WHEN A JOB IS CREATED. curriculum proposes from what is MEASURED, and
    // officeManager's isSettled reads the LEDGER, which fills in only when a RESULT comes back. So between
    // dispatch and completion every tick sees the same proposals -- and a dispatcher that just enqueues what it
    // is handed builds a thousand copies of one job and thrashes the leases.
    let q = emptyQueue();
    const regs = () => ({ frontier: FRONTIER, queue: q, fleet: [IDLE("p1"), IDLE("p2")], ledger: {} });
    const p1 = planDispatch(regs()); const a1 = applyDispatch(q, p1.specs); q = a1.queue;
    ok("!! the first tick enqueues the open work", a1.added.length === 2 && p1.held.length === 0,
        "added " + a1.added.join(", "));
    const p2 = planDispatch(regs()); const a2 = applyDispatch(q, p2.specs); q = a2.queue;
    ok("!! *** AND THE SECOND TICK, ON AN UNCHANGED FRONTIER, ENQUEUES NOTHING ***",
        a2.added.length === 0 && p2.held.length === 2,
        "held " + p2.held.map((h) => h.subject).join(", ") + " -- REPORTED as held, not dropped silently, because " +
        "'nothing to do' and 'already doing it' are different fleet states");
    const p3 = planDispatch(regs()); const a3 = applyDispatch(q, p3.specs);
    ok("...and so does the third", a3.added.length === 0, "the queue stays at " + Object.keys(q.jobs).length + " jobs");
}

console.log("\n2. THE GUARD IS ON WORK IN FLIGHT, NOT ON WORK EVER DONE");
{
    let q = emptyQueue();
    const regs = () => ({ frontier: FRONTIER, queue: q, fleet: [IDLE("p1"), IDLE("p2")], ledger: {} });
    q = applyDispatch(q, planDispatch(regs()).specs).queue;
    const id = Object.keys(q.jobs)[0];
    const c = claim(q, "p1", { max: 1 }); q = c.queue;
    const done = complete(q, c.jobs[0].id, "p1", { ok: true }); q = done.queue;
    const p = planDispatch(regs());
    ok("!! a COMPLETED job stops holding its subject, so the work can be proposed again",
        p.held.length === 1 && p.specs.length === 1,
        "one subject is still in flight and holds; the completed one is free again. A guard on 'ever queued' " +
        "would make every subject a one-shot for the life of the file");
    ok("...and a claimed-but-unfinished job STILL holds", openSubjects(q).size === 1,
        "a lease is not a completion: " + [...openSubjects(q)].join(", "));
}

console.log("\n3. TWO ASSIGNMENTS IN ONE TICK CAN NAME THE SAME SUBJECT");
{
    const dup = [FRONTIER[0], { ...FRONTIER[0] }];
    const p = planDispatch({ frontier: dup, queue: emptyQueue(), fleet: [IDLE("p1"), IDLE("p2")], ledger: {} });
    ok("!! the guard closes WITHIN a tick as well as across ticks", p.specs.length === 1 && p.held.length === 1,
        "two peers were free and the same subject was proposed twice; one job was made. A guard that only " +
        "consulted the INCOMING queue would have enqueued both and neither would have been wrong on its own");
}

console.log("\n4. THE SPECS ARE ONES jobQueue ACTUALLY ACCEPTS");
{
    const p = planDispatch({ frontier: FRONTIER, queue: emptyQueue(), fleet: [IDLE("p1"), IDLE("p2")], ledger: {} });
    ok("!! every planned spec passes jobQueue's OWN validator", p.specs.every((s) => validateSpec(s, null).ok),
        p.specs.length + " specs, kind " + [...new Set(p.specs.map((s) => s.kind))].join("/") + ". THE QUEUE IS THE " +
        "AUTHORITY: this module shapes a spec, it never decides whether one is legal");
    ok("...and carries the intended peer as config DATA", p.specs.every((s) => typeof s.config.assignedPeer === "string"),
        "assignedPeer " + p.specs.map((s) => s.config.assignedPeer).join(", "));
    ok("...and carries no field that could be a payload",
        p.specs.every((s) => !["script", "command", "cmd", "exec", "module", "path", "eval", "code"].some((k) => k in s || k in s.config)),
        "jobs NAME work, they do not carry it -- jobQueue's rule, re-checked here because this file is the one " +
        "that builds the specs");
}

console.log("\n5. *** THE PEER PAIRING IS A RECOMMENDATION AND THE CODE SAYS SO -- PROVEN, NOT ASSERTED IN PROSE ***");
{
    let q = emptyQueue();
    const p = planDispatch({ frontier: [FRONTIER[0]], queue: q, fleet: [IDLE("alice")], ledger: {} });
    q = applyDispatch(q, p.specs).queue;
    const assigned = p.specs[0].config.assignedPeer;
    const c = claim(q, "bob", { max: 1 });
    ok("!! a job assigned to one peer is claimed by whoever asks first",
        assigned === "alice" && c.jobs.length === 1 && c.jobs[0].claimedBy === "bob",
        "assigned to " + assigned + ", claimed by " + c.jobs[0].claimedBy + ". *** officeManager ASSIGNS TO A PEER " +
        "AND jobQueue HAS NO ASSIGNEE. *** Making the queue honour it would be giving the queue a scheduler to " +
        "satisfy a caller. The intended peer is recorded as data and the limitation is stated where it is real");
}

console.log("\n6. A PEER THAT REPORTED NOTHING IS NOT IDLE");
{
    const roster = { peers: { fresh: { roundhouse: { state: "idle" } }, quiet: {}, old: { roundhouse: null } } };
    const fleet = fleetFromRoster(roster);
    ok("!! silence becomes UNKNOWN, never IDLE", fleet.filter((f) => f.activity && f.activity.state === "idle").length === 1,
        "3 peers in the roster, 1 reported idle. An old build that reports no activity field would otherwise be " +
        "handed work on the strength of saying nothing");
    const p = planDispatch({ frontier: FRONTIER, queue: emptyQueue(), fleet, ledger: {} });
    ok("...so only the peer that spoke gets work", p.specs.length === 1, p.specs.length + " job planned from 3 peers");
}

console.log("\n7. ESCALATIONS PASS THROUGH UNTOUCHED, AND THIS FILE DELIVERS NONE OF THEM");
{
    const p = planDispatch({ frontier: FRONTIER, queue: emptyQueue(), fleet: [], ledger: {} });
    const starved = p.result.escalations.filter((e) => e.kind === "starved");
    ok("!! a frontier with nobody to run it escalates rather than reading as quiet", starved.length === 1,
        starved[0] ? starved[0].why : "none");
    ok("...and nothing was enqueued on the way", p.specs.length === 0);
    say("NOT DONE HERE, DELIBERATELY", "the escalation SINK is injected (officeManager's header) and the route " +
        "returns escalations as data. Wiring them to the outbox is a decision with a network in it, and adding a " +
        "dispatcher is not licence to make it");
}

console.log("\n8. PURITY, AND THE HUB ROUTE THAT FINALLY CALLS ANY OF THIS");
{
    const q0 = emptyQueue();
    const p = planDispatch({ frontier: FRONTIER, queue: q0, fleet: [IDLE("p1")], ledger: {} });
    const before = JSON.stringify(q0);
    const r = applyDispatch(q0, p.specs);
    ok("!! applyDispatch does not mutate the queue it was given", JSON.stringify(q0) === before && r.queue !== q0,
        "the caller writes; this returns");
    ok("...and dispatchLines reports without deciding", Array.isArray(dispatchLines(p, r.added)) && dispatchLines(p, r.added).length > 0);

    // *** THE WIRING ITSELF, WHICH IS THE WHOLE POINT OF THE ROUND. *** A pure module nothing calls is exactly
    // the state officeManager was already in; asserting the route EXISTS is what stops this repeating.
    const bridge = readFileSync(path.join(ENG, "ai-bridge", "fingerprintBridge.js"), "utf8");
    ok("!! *** THE HUB HAS A ROUTE THAT CALLS THIS, WHICH officeManager NEVER HAD ***",
        /url === "\/office\/dispatch"/.test(bridge) && /planDispatch\(/.test(bridge) && /applyDispatch\(/.test(bridge),
        "POST /office/dispatch reads the registers, calls planDispatch, and writes the queue peers claim from. " +
        "*** v3824 SHIPPED THE DECISION AND ITS ONLY CONSUMER WAS A PAGE THAT DREW IT. ***");
    ok("...and it can be asked to plan without writing", /dryRun/.test(bridge),
        "an operator sees what a tick would do before a timer is allowed to do it");
    ok("...and it reports WHERE each register came from", /sources\.fleet/.test(bridge) && /sources\.ledger/.test(bridge),
        "a dispatcher that defaulted a register silently would be scheduling on data nobody chose");

    // AND THE PAGE. office-floor.html was officeManager's ONLY consumer and it computed fixed scenes in the
    // browser -- a simulator, not a front door. It can now ask the hub to arbitrate the real registers.
    const page = readFileSync(path.join(ENG, "office-floor.html"), "utf8");
    ok("!! the front door can reach the live dispatcher, not only its own scenarios",
        /\/office\/dispatch/.test(page) && /dryRun/.test(page),
        "office-floor.html POSTs to the route, with a plan-only button beside the one that writes. *** THE SCENES " +
        "STAY: they are how the arbitration is READ, and the live half is how it is RUN ***");
}

console.log("\nofficeDispatch-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
