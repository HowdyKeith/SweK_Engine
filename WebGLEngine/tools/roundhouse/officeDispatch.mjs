// WebGLEngine/tools/roundhouse/officeDispatch.mjs -- v3848
// ---------------------------------------------------------------------------------------------------------------
// THE BODY officeManager NEVER HAD.
//
// *** WHEN THIS FILE WAS WRITTEN, officeManager.mjs (v3824) DECIDED WHAT RUNS NEXT AND NOTHING CALLED IT. ***
// (v3932: past tense on purpose. THIS FILE IMPORTS IT AT LINE 34 -- the sentence describing the gap became
// false the moment the fix landed, and wiringClaims caught it reading as a live claim: "a wiring claim is a
// fact about the import graph written down in prose, where nothing re-derives it".) Its own patch README said so
// outright -- "the honest consumer is a hub loop calling this on a tick and posting to jobQueue" -- and then the
// only consumer built was office-floor.html, a page that renders the decision for a human to look at. An
// arbitrator whose output is a drawing arbitrates nothing. This file is the missing half: it turns
// `nextAssignments` output into jobQueue specs, refuses the ones the queue would not accept, and hands back a
// queue to write. It is the ONLY place the two vocabularies meet.
//
// *** PURE, FOR THE SAME REASON officeManager IS. *** No fs, no network, no clock of its own. The hub route in
// ai-bridge/fingerprintBridge.js reads the registers off disk and writes the queue back; everything between
// those two acts is here, where it can be driven headless in milliseconds.
//
// *** THE ONE PROPERTY A TICKED DISPATCHER MUST HAVE, AND THE ONE A NAIVE WIRING GETS WRONG: IDEMPOTENCE. ***
// A loop calling this every minute sees the SAME frontier every minute -- curriculum's proposals do not vanish
// because a job exists, and officeManager's `isSettled` reads the LEDGER, which only fills in once a result
// comes back. So between dispatch and completion, every tick re-proposes the same subjects, and a dispatcher
// that simply enqueues what it is handed enqueues them again, and again, until the queue is a thousand copies of
// the same work and the leases thrash. `openSubjects` is the guard: a subject with an uncompleted job already in
// the queue is NOT re-enqueued, and it is reported as held rather than dropped silently.
//
// *** AND THE PEER PAIRING IS A RECOMMENDATION, NOT A RESERVATION -- SAID PLAINLY BECAUSE THE TWO MODULES
// DISAGREE. *** officeManager assigns a proposal TO A PEER. jobQueue has no assignee: a job sits in a catalog and
// the FIRST peer to claim it gets it. Nothing here can make jobQueue honour an assignment without changing
// jobQueue's model, and changing it to satisfy a caller is how a queue acquires a scheduler by accident. So the
// intended peer travels as `config.assignedPeer` -- data a peer can read and a human can audit -- and the claim
// remains first-come. A dispatcher that pretended otherwise would be reporting a pairing the system does not
// enforce.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { nextAssignments, specForProposal } from "./officeManager.mjs";
import { validateSpec, enqueue } from "./jobQueue.mjs";

/** Peers the hub knows, in the shape officeManager reads. `roster.peers` is keyed by peer key; each row carries
 *  the `roundhouse` activity the peer reported. A row with no activity becomes UNKNOWN there, not IDLE -- an old
 *  build that reports nothing must never be handed work on the strength of its silence. */
export function fleetFromRoster(roster) {
    const peers = (roster && roster.peers) || {};
    return Object.entries(peers).map(([key, row]) => ({ key, activity: (row && row.roundhouse) || null }));
}

/** Subjects that already have an uncompleted job in the queue. This is the idempotence guard; see the header. */
export function openSubjects(queue) {
    const out = new Set();
    for (const j of Object.values((queue && queue.jobs) || {})) {
        if (j.completedAt) continue;
        const s = j.config && j.config.subject;
        if (s) out.add(String(s));
    }
    return out;
}

/**
 * Decide, then shape. Returns everything the caller needs and writes nothing:
 *   result      officeManager's own output, untouched, so the decision can be audited against the dispatch
 *   specs       the jobQueue specs to enqueue, each already validated
 *   held        assignments NOT enqueued because the subject is already in flight (idempotence)
 *   invalid     assignments whose spec jobQueue refused, WITH the reasons it gave
 */
export function planDispatch(registers = {}, { modes = null } = {}) {
    const result = nextAssignments(registers);
    const open = openSubjects(registers.queue);
    const specs = [], held = [], invalid = [];
    for (const a of result.assignments) {
        const subject = a.proposal && a.proposal.subject;
        if (subject && open.has(String(subject))) { held.push({ subject, peer: a.peer, why: "a job for this subject is already open" }); continue; }
        // the intended peer rides as DATA. See the header: jobQueue's claim is first-come and stays that way.
        const spec = specForProposal(a.proposal);
        spec.config = { ...spec.config, assignedPeer: a.peer };
        const v = validateSpec(spec, modes);
        if (!v.ok) { invalid.push({ subject, peer: a.peer, problems: v.problems }); continue; }
        specs.push(spec);
        if (subject) open.add(String(subject));   // two assignments in ONE tick can name the same subject too
    }
    return { result, specs, held, invalid };
}

/** Enqueue the planned specs. Returns the new queue and the job ids created. Pure: the caller writes it. */
export function applyDispatch(queue, specs, { modes = null, at = null } = {}) {
    let q = queue, added = [];
    for (const spec of specs) { const r = enqueue(q, spec, modes, { at }); q = r.queue; added.push(r.job.id); }
    return { queue: q, added };
}

/** One line per outcome, beside the decision rather than inside it. */
export function dispatchLines(plan, added = []) {
    const out = [];
    const r = plan.result;
    out.push(`considered ${r.considered}, settled ${r.settled}, assigned ${r.assignments.length}, enqueued ${added.length}, idle peers left ${r.idle}`);
    for (const h of plan.held) out.push(`  -- held ${h.subject}: ${h.why}`);
    for (const b of plan.invalid) out.push(`  !! refused ${b.subject}: ${b.problems.join("; ")}`);
    for (const e of r.escalations) out.push(`  !! ESCALATE ${e.kind}: ${e.why}`);
    return out;
}
