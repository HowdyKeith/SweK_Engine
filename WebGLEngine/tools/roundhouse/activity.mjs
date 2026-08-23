// WebGLEngine/tools/roundhouse/activity.mjs -- v3018
//
// WHAT IS THIS PEER DOING RIGHT NOW? The roster answered what a peer IS and never what it was DOING.
//
// A peer reports host, arch, platform, node, master, subsystems, engineVersion and observables -- identity and
// measurements. Every one of those is a property of the box. None of them changes while a roundhouse run is in
// flight, so a fleet of eight peers looks identical whether they are all idle or all mid-experiment.
//
// THE RULE THAT MAKES "RUNNING" WORTH REPORTING: A PEER SAYING "RUNNING" IS A CLAIM WITH A TIMESTAMP, NOT A
// STATE. A box that crashed mid-run keeps saying "running" forever -- there is nobody left to say otherwise.
// That is the same failure as a stale Tasker artefact (v3008) and a stale cross-arch baseline (v2998), and it
// takes the same fix: the AGE travels with the claim, and past a threshold the reader is told the claim is
// unattended rather than shown a green light nobody is behind.
"use strict";

// *** THE MEANING OF "GETTING WORSE" IS OWNED BY stepProgress, AND IS IMPORTED RATHER THAN RESTATED. ***
// v3941: report.html, run-inspector.html and ui/swekRobot.js each compare against the literal
// "worsened-overall" by hand, and the roundhouse minipanel was about to become a fourth. That is the
// duplicated-table class this tree has paid for repeatedly -- MODES in nine files, the gate-file walk in
// three. A reader that owns a copy of the vocabulary is a reader that can disagree with the writer.
import { TRAJECTORY } from "./stepProgress.mjs";

export const ACTIVITY = {
    IDLE: "idle",
    RUNNING: "running",
    UNATTENDED: "unattended",   // says running, but nothing has updated it in a long time
    UNKNOWN: "unknown",         // peer did not report the field at all -- an OLD BUILD, not an idle box
};

/** A run that has not ticked in this long is not being watched by anything. */
export const UNATTENDED_MS = 15 * 60 * 1000;

/**
 * Build the block a peer publishes about itself.
 * @param {object|null} run  the live run, if any: { device, round, maxRounds, startedAt, progress }
 */
export function activityOf(run, now = Date.now()) {
    if (!run) return { state: ACTIVITY.IDLE, at: new Date(now).toISOString() };
    const started = Number(run.startedAt) || now;
    return {
        state: ACTIVITY.RUNNING,
        device: run.device || null,
        round: Number.isFinite(run.round) ? run.round : null,
        maxRounds: Number.isFinite(run.maxRounds) ? run.maxRounds : null,
        // The trajectory v3007 already computes. A peer four rounds in and getting WORSE is a different fleet
        // event from a peer four rounds in and converging, and "running" alone cannot tell them apart.
        trajectory: (run.progress && run.progress.trajectory) || null,
        runId: run.id || null,      // v3019 -- so a running peer can link straight to its own transcript
        // *** v3700 -- THE UNIT AND THE TRANSCRIPT ARE CARRIED, NOT GUESSED. *** A roundhouse ROUND is an
        // iteration of propose-verify-escalate; a curriculum PHASE is one census returning. They are different
        // things and they were sharing the word "round" the moment a second kind of run appeared. The
        // alternative -- matching on device === "curriculum" -- is a NAME TEST, and this session got three of
        // those wrong on the first try.
        unit: typeof run.unit === "string" ? run.unit : "round",
        // OPT-IN, AND DELIBERATELY NOT DEFAULTED TRUE: the reader offers a transcript LINK when this is set,
        // and a link to evidence that does not exist is worse than no link -- it looks like corroboration. A
        // run type that forgets to declare one simply does not get offered.
        transcript: run.transcript === true,
        startedAt: new Date(started).toISOString(),
        at: new Date(now).toISOString(),
    };
}

/**
 * *** ONE PLACE THAT TURNS AN ACTIVITY BLOCK INTO WORDS. *** server.html built this string inline, which is why
 * nothing could ever check it -- and it has NEVER RENDERED: fingerprintBridge has read __swekActiveRun since
 * v3018 and the panel since v3020, but UNTIL v3699 NOTHING IN THE TREE EVER SET IT. A reader with no writer for
 * six hundred versions, so the "running" branch and its transcript link are code nobody has seen run.
 * @returns {{text:string, link:string|null}}
 */
export function describe(a) {
    if (!a || a.state !== ACTIVITY.RUNNING) return { text: (a && a.state) || ACTIVITY.UNKNOWN, link: null };
    const unit = a.unit || "round";
    const n = (a.round == null ? "?" : a.round), m = (a.maxRounds == null ? "?" : a.maxRounds);
    return {
        text: (a.device || "?") + " " + unit + " " + n + "/" + m + (a.trajectory ? " " + a.trajectory : ""),
        link: (a.transcript && a.runId) ? ("/run-inspector.html?id=" + encodeURIComponent(a.runId)) : null,
    };
}

/**
 * *** IS THIS RUN GETTING FURTHER FROM ITS CLAIM? *** describe() folds the trajectory into its sentence, where
 * a converging run and a diverging one read the same. This is the one fleet event worth interrupting somebody
 * for, so it is a QUESTION A READER CAN ASK rather than a word a reader has to notice inside a string.
 *
 * A block with no trajectory answers FALSE, not unknown, and deliberately: an ungraded run is not a worsening
 * one, and colouring "we could not tell" the same as "it is going backwards" would spend the alarm on nothing.
 * @param {object|null} a  an activity block, as built by activityOf or read by readActivity
 */
export function worsening(a) {
    return !!(a && a.trajectory === TRAJECTORY.WORSENED);
}

/**
 * Read a reported block. THE READER decides whether the claim is still good -- the peer cannot, because the
 * failure being guarded against is the peer no longer being there.
 */
export function readActivity(reported, now = Date.now()) {
    if (!reported || typeof reported !== "object") {
        return { state: ACTIVITY.UNKNOWN,
                 why: "this peer reported no activity block at all. That means an OLDER BUILD, not an idle box -- treating a missing field as idle would show a busy fleet as quiet." };
    }
    if (reported.state !== ACTIVITY.RUNNING) {
        return { state: reported.state === ACTIVITY.IDLE ? ACTIVITY.IDLE : ACTIVITY.UNKNOWN, at: reported.at || null };
    }
    const at = Date.parse(reported.at || "");
    if (!Number.isFinite(at)) {
        return { ...reported, state: ACTIVITY.UNATTENDED,
                 why: "it says running and carries no timestamp, so there is no way to tell a live run from one that stopped reporting" };
    }
    const ageMs = now - at;
    if (ageMs > UNATTENDED_MS) {
        return { ...reported, state: ACTIVITY.UNATTENDED, ageMs,
                 why: "it still says running, but nothing has updated that in " + Math.round(ageMs / 60000) +
                      " minutes. A box that crashed mid-run says running forever -- there is nobody left to say otherwise." };
    }
    return { ...reported, state: ACTIVITY.RUNNING, ageMs };
}

/** Fleet summary. Counts UNATTENDED separately, because folding it into running is the whole mistake. */
export function fleetActivity(rows, now = Date.now()) {
    const seen = (rows || []).map((r) => readActivity(r && r.roundhouse, now));
    const count = (s) => seen.filter((x) => x.state === s).length;
    return {
        rows: seen,
        running: count(ACTIVITY.RUNNING),
        idle: count(ACTIVITY.IDLE),
        unattended: count(ACTIVITY.UNATTENDED),
        unknown: count(ACTIVITY.UNKNOWN),
        note: seen.length
            ? count(ACTIVITY.RUNNING) + " running, " + count(ACTIVITY.IDLE) + " idle, " +
              count(ACTIVITY.UNATTENDED) + " UNATTENDED, " + count(ACTIVITY.UNKNOWN) + " on a build too old to say"
            : "no peers",
    };
}
