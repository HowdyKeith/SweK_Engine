// WebGLEngine/tools/roundhouse/officeManager.mjs -- v3824
// ---------------------------------------------------------------------------------------------------------------
// WHO WORKS ON WHAT NEXT -- AND IT NEVER GRADES ANYTHING.
//
// *** SIX MODULES ALREADY HELD FIVE-SIXTHS OF THIS AND HAD NEVER BEEN INTRODUCED TO EACH OTHER. *** Checked
// before building, because the alternative is a seventh register nobody asked for:
//
//     curriculum.mjs    v3698  what is worth attempting, derived from what is already measured
//     jobQueue.mjs      v2961  hand work out -- enqueue / claim / complete, leases, fixed catalog
//     activity.mjs      v3018  who is idle, running, UNATTENDED or UNKNOWN
//     escalateRoute.mjs v2764  cheap -> verify -> escalate, for ONE call
//     promptCost.mjs    v2849  what a call costs and which tier is actually token-bound
//     skillbook.mjs            what has already been certified, so it is not re-attempted
//
// Each answers its own question correctly and NONE of them answers the one a fleet actually poses: given 107
// devices, N peers, a token budget and a frontier of proposals, WHAT RUNS NEXT, ON WHOM, AND WHEN IS A HUMAN
// WOKEN. This file is that arbitration and nothing else.
//
// *** THE MANAGER MUST NEVER GRADE. *** curriculum.mjs says so of itself in its own headline -- "AND IT NEVER
// GRADES ANYTHING" -- and roundhouse.mjs exists because a loop whose stopping oracle is an opinion is an echo
// chamber with extra steps. The moment an arbitrator starts scoring device OUTPUT it has quietly become the
// evaluator, and the physics stops being the thing that decides. So: this file reads ledgers and returns an
// assignment. It never reads a result's VALUE, only whether a result EXISTS. There is one plant for exactly
// this in the gate, and it is the one that matters.
//
// PURE. No clock of its own (`now` is an argument), no filesystem, no network, no model. Every register arrives
// as data. That is not tidiness -- it is the only reason a scheduler's edge cases can be driven headless in
// milliseconds instead of by standing a fleet up and waiting for something to go wrong.
//
// THE ESCALATION SINK IS INJECTED, AND THAT WAS A REAL FORK IN THE ROAD. The two candidates were an approvals
// FILE the rig reads, and the existing outbox/lighthouse path. The outbox is a NETWORK path: it cannot be
// graded here without a rig, so choosing it would have made the human-in-the-loop half of this module the one
// half nothing could test. Choosing the file would have hardcoded a decision that is properly Keith's. So the
// sink is a parameter with a file-shaped DESCRIPTION as its default -- `escalations` come back as plain data
// and something else decides where they land. Same seam as escalateRoute's callModel and roundhouse's caller.
// ---------------------------------------------------------------------------------------------------------------
"use strict";

import { ACTIVITY } from "./activity.mjs";

/**
 * The three things that wake a human, and nothing else.
 *
 * munder-difflin's GOD agent escalates "spend, destructive ops, scope changes" and resolves the rest itself.
 * That taxonomy transfers; the thresholds do not, so each one is DERIVED from a register this tree already
 * keeps rather than typed here.
 */
export const ESCALATION = Object.freeze({
    SPEND: "spend",             // the budget would be exceeded by the assignment about to be made
    STUCK: "stuck",             // a job has been claimed and abandoned repeatedly -- attempts, not opinion
    STARVED: "starved",         // the frontier is non-empty and NOTHING is assignable, so the fleet idles silently
});

/** A peer may take work only in this state. Everything else is a reason, not a peer. */
const ASSIGNABLE = new Set([ACTIVITY.IDLE]);

/**
 * Why a peer was passed over. Returned rather than dropped, because "no peer was free" and "every peer is
 * UNATTENDED" look identical from the outside and are completely different fleet events.
 */
export function peerAvailability(fleet, { now = Date.now() } = {}) {
    const free = [], busy = [], unattended = [], unknown = [];
    for (const p of fleet || []) {
        const state = p && p.activity && p.activity.state;
        if (state === ACTIVITY.IDLE) free.push(p);
        else if (state === ACTIVITY.RUNNING) busy.push(p);
        else if (state === ACTIVITY.UNATTENDED) unattended.push(p);
        else unknown.push(p);                       // includes a peer that reported no field at all: an OLD BUILD
    }
    return { free, busy, unattended, unknown, now };
}

/**
 * Attempts a job may accumulate before it stops being a job and becomes a question.
 *
 * jobQueue already counts `attempts` and its own header says a job "that keeps being claimed and never finished
 * is telling you something" -- and then nothing listened. This is the listener. Three, because two is a peer
 * that crashed twice and three is a pattern; and it is a parameter so the number is arguable rather than mine.
 */
export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Has this subject already been done? Reads EXISTENCE, never a value.
 *
 * `ledger` is a plain map of subject -> record. The manager asks only whether a key is present. It is
 * deliberately impossible to express "this result was poor, try again" here: that is grading, and grading is
 * the evaluator's job. A subject that was attempted and produced a bad number is DONE as far as scheduling is
 * concerned, and re-attempting it is a decision a human or the curriculum makes, not the dispatcher.
 */
export function isSettled(ledger, subject) {
    return Object.prototype.hasOwnProperty.call(ledger || {}, subject);
}

/**
 * Turn a curriculum proposal into a job spec jobQueue will actually accept.
 *
 * The mapping is deliberately narrow: curriculum proposes GRADER RUNS (`kind` plant/grade/door, `subject` a
 * module path, `grader` a tool path) and jobQueue's catalog is device-mode / magmap / suite. They are not the
 * same vocabulary and pretending otherwise is how a queue ends up carrying code. So a proposal becomes a
 * `suite` job naming its grader and subject as CONFIG -- data the peer looks up in its own registry -- and
 * never a command. jobQueue.validateSpec is the authority on whether the result is legal; this only shapes it.
 */
export function specForProposal(p) {
    return {
        kind: "suite",
        device: null,
        mode: null,
        config: { grader: p.grader, subject: p.subject, curriculumKind: p.kind },
    };
}

/**
 * THE ARBITRATION.
 *
 * Inputs are the five registers as data:
 *   frontier   curriculum.propose() output, or just its `proposals` array
 *   queue      a jobQueue queue object (jobs keyed by id)
 *   fleet      [{ key, activity }] -- activity as activity.activityOf() returns it
 *   ledger     subject -> record, existence only
 *   budget     { tokensRemaining, tokensPerJob } or null for "not token-bound"
 *
 * Returns { assignments, escalations, idle, reasons }. Never throws on an empty or malformed register: a
 * scheduler that dies because one peer reported nothing is worse than one that reports a thin fleet.
 */
export function nextAssignments({
    frontier = [], queue = null, fleet = [], ledger = {}, budget = null,
    now = Date.now(), maxAttempts = DEFAULT_MAX_ATTEMPTS, maxAssignments = Infinity,
} = {}) {
    const proposals = Array.isArray(frontier) ? frontier : (frontier.proposals || []);
    const avail = peerAvailability(fleet, { now });
    const assignments = [], escalations = [], reasons = [];

    // --- jobs already in flight that have stopped being jobs ---------------------------------------------------
    // Checked BEFORE anything is handed out, because assigning fresh work while three jobs quietly fail is how a
    // fleet looks busy and achieves nothing.
    for (const j of Object.values((queue && queue.jobs) || {})) {
        if (j.completedAt) continue;
        if ((j.attempts || 0) >= maxAttempts) {
            escalations.push({
                kind: ESCALATION.STUCK, job: j.id, attempts: j.attempts,
                why: `claimed and abandoned ${j.attempts} times without completing -- the lease keeps expiring`,
            });
        }
    }

    // --- what is actually worth doing --------------------------------------------------------------------------
    const open = [];
    for (const p of proposals) {
        if (isSettled(ledger, p.subject)) { reasons.push({ subject: p.subject, why: "already in the ledger" }); continue; }
        open.push(p);
    }

    // --- the budget gate, and it is a REFUSAL rather than a smaller assignment ----------------------------------
    // Handing out half the work because the budget is thin looks prudent and is the worse failure: it spends the
    // remainder on a partial answer nobody can use. If the fleet cannot afford the next unit of work, say so.
    const perJob = budget && Number.isFinite(budget.tokensPerJob) ? budget.tokensPerJob : 0;
    let remaining = budget && Number.isFinite(budget.tokensRemaining) ? budget.tokensRemaining : Infinity;

    // --- hand out ----------------------------------------------------------------------------------------------
    let i = 0;
    for (const peer of avail.free) {
        if (assignments.length >= maxAssignments) break;
        if (i >= open.length) break;
        if (perJob > 0 && remaining < perJob) {
            escalations.push({
                kind: ESCALATION.SPEND, peer: peer.key, need: perJob, have: remaining,
                why: `the next job needs ~${perJob} tokens and ${remaining} remain -- work is left unassigned rather than truncated`,
            });
            break;
        }
        const p = open[i++];
        assignments.push({ peer: peer.key, proposal: p, spec: specForProposal(p), estTokens: perJob || null });
        remaining -= perJob;
    }

    // --- the silent failure this whole file exists to make loud -------------------------------------------------
    // A frontier with work in it, no assignment made, and no spend escalation already raised, means the fleet is
    // idling while there is something to do. That reads as "quiet" on every existing dashboard.
    if (open.length > 0 && assignments.length === 0 && !escalations.some((e) => e.kind === ESCALATION.SPEND)) {
        escalations.push({
            kind: ESCALATION.STARVED, open: open.length,
            fleet: { free: avail.free.length, busy: avail.busy.length, unattended: avail.unattended.length, unknown: avail.unknown.length },
            why: avail.free.length === 0
                ? `${open.length} proposals waiting and no peer is idle (${avail.busy.length} busy, ${avail.unattended.length} unattended, ${avail.unknown.length} unknown)`
                : `${open.length} proposals waiting and none could be assigned`,
        });
    }

    return {
        assignments, escalations, reasons,
        idle: avail.free.length - assignments.length,
        considered: open.length,
        settled: proposals.length - open.length,
    };
}

/**
 * One line per outcome, for a terminal or a page. Kept beside the arbitration because a scheduler nobody can
 * read is a scheduler nobody trusts -- and separate from it, because reporting must never change a decision.
 */
export function reportLines(r) {
    const out = [];
    out.push(`considered ${r.considered}, settled ${r.settled}, assigned ${r.assignments.length}, idle peers left ${r.idle}`);
    for (const a of r.assignments) out.push(`  -> ${a.peer}  ${a.proposal.kind}: ${a.proposal.subject}`);
    for (const e of r.escalations) out.push(`  !! ESCALATE ${e.kind}: ${e.why}`);
    if (!r.escalations.length) out.push("  (nothing escalated -- routine work resolved without waking anybody)");
    return out;
}
