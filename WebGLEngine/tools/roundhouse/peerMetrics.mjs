// tools/roundhouse/peerMetrics.mjs
//
// v2951 -- GAUGES FOR THE PEER FLEET. The ledgers now hold real quantities -- devices, runs, verdicts, suite
// results, submissions -- but nothing summarised them, so "how is the fleet doing" had no answer short of
// reading JSON. This aggregates them into gauges, under three rules that keep a dashboard honest:
//
//   1. SLOW IS NOT WRONG. The reference transcript itself is 37 pass, 0 fail, 2 TIMEOUT. A naive pass-rate gauge
//      would read 95% and imply something is broken, and on a phone -- which is slower than the reference box by
//      construction -- it would read far worse and imply the phone failed. androidVerdict established the rule
//      long ago: only DISAGREEMENT falsifies, slow is excluded. So these gauges report pass / fail / timeout as
//      three separate quantities and never fold timeouts into a failure rate.
//
//   2. UNKNOWN IS NOT ZERO. A fleet with no submissions yet reads `null`, not 0. "No phone has reported" and
//      "phones reported and nothing passed" are opposite situations and a gauge that renders both as 0 is lying
//      about the second one.
//
//   3. EVERY GAUGE NAMES ITS SOURCE AND ITS AGE. A number with no provenance invites being quoted out of
//      context; each gauge carries where it came from and the timestamp of the newest datum behind it, so a
//      stale dashboard is visibly stale rather than confidently wrong.

import { gradeFleet } from "./deviceLedger.mjs";

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

/**
 * Build the gauge set. Every input is optional -- a hub with nothing yet returns a well-formed set of nulls
 * rather than throwing or inventing zeros.
 */
export function peerMetrics({ deviceLedger = null, transcripts = [], submissions = [], perfLedger = null, jobQueue = null, roster = null } = {}) {
    const g = {};

    // ---- devices and vendor families -------------------------------------------------------------------------
    if (deviceLedger && deviceLedger.devices && Object.keys(deviceLedger.devices).length) {
        const fleet = gradeFleet(deviceLedger);
        const devices = Object.values(deviceLedger.devices);
        const runs = devices.reduce((s, d) => s + d.runs.length, 0);
        const newest = devices.map((d) => d.lastSeen || d.firstSeen).filter(Boolean).sort().pop() || null;
        g.devices = { value: fleet.deviceCount, source: "device-ledger.json", asOf: newest, note: "distinct GPUs that have reported" };
        g.gpuRuns = { value: runs, source: "device-ledger.json", asOf: newest, note: "total GPU auditions on record, including re-runs" };
        g.vendorFamilies = { value: fleet.confirmedFamilies.length, of: fleet.families.length, list: fleet.confirmedFamilies,
            source: "device-ledger.json", asOf: newest, note: "vendor families that PASSED full-grid under tolerance -- item 3's standing" };
        g.changedVerdict = { value: fleet.flipped.length, source: "device-ledger.json", asOf: newest,
            note: "devices whose verdict changed between runs -- the signal a single overwritten file could never show" };
    } else {
        for (const k of ["devices", "gpuRuns", "vendorFamilies", "changedVerdict"]) g[k] = { value: null, source: "device-ledger.json", asOf: null, note: "no device has reported yet" };
    }

    // ---- suite results, with slow kept distinct from wrong -----------------------------------------------------
    const withCounts = transcripts.filter((t) => t && t.counts);
    if (withCounts.length) {
        const sum = withCounts.reduce((a, t) => ({
            pass: a.pass + (t.counts.pass || 0), fail: a.fail + (t.counts.fail || 0),
            timeout: a.timeout + (t.counts.timeout || 0), error: a.error + (t.counts.error || 0),
        }), { pass: 0, fail: 0, timeout: 0, error: 0 });
        const graded = sum.pass + sum.fail + sum.error;          // timeouts deliberately EXCLUDED from the denominator
        const newest = withCounts.map((t) => t.at).filter(Boolean).sort().pop() || null;
        g.ballots = { value: withCounts.length, source: "transcripts", asOf: newest, note: "suite runs returned by peers" };
        g.checksPassed = { value: sum.pass, source: "transcripts", asOf: newest, note: "checks that agreed with the reference" };
        g.checksFailed = { value: sum.fail + sum.error, source: "transcripts", asOf: newest, note: "checks that DISAGREED or errored -- the only kind that falsifies" };
        g.checksTimedOut = { value: sum.timeout, source: "transcripts", asOf: newest,
            note: "checks that ran out of budget. SLOW IS NOT WRONG: the reference itself times out twice, and these are excluded from the agreement rate rather than counted against the peer" };
        g.agreementRate = { value: graded ? +(sum.pass / graded * 100).toFixed(1) : null, unit: "%", source: "transcripts", asOf: newest,
            note: "pass / (pass + fail + error). Timeouts are NOT in the denominator -- including them would penalise a phone for being a phone" };
    } else {
        for (const k of ["ballots", "checksPassed", "checksFailed", "checksTimedOut", "agreementRate"]) g[k] = { value: null, source: "transcripts", asOf: null, note: "no ballot has been returned yet" };
    }

    // ---- submissions (delivery, not results) -------------------------------------------------------------------
    g.submissions = submissions.length
        ? { value: submissions.length, source: "submissions/", asOf: submissions.map((s) => s.at).filter(Boolean).sort().pop() || null, note: "artefacts delivered to the hub, archived immutably" }
        : { value: null, source: "submissions/", asOf: null, note: "nothing has been submitted to the hub yet" };

    // ---- performance ------------------------------------------------------------------------------------------
    if (perfLedger && perfLedger.checks && Object.keys(perfLedger.checks).length) {
        const samples = Object.values(perfLedger.checks).reduce((s, a) => s + a.length, 0);
        g.perfSamples = { value: samples, source: "perf-ledger.json", asOf: null, note: "timing samples folded across runs" };
    } else {
        g.perfSamples = { value: null, source: "perf-ledger.json", asOf: null, note: "no timing has been folded yet" };
    }

    // ---- jobs and return rate -----------------------------------------------------------------------------
    // THE DENOMINATOR IS THE WHOLE PROBLEM HERE. "Return rate" wants to be completed / claims, but a claim that
    // is still in flight has neither returned NOR been lost -- counting it as a miss makes a healthy fleet look
    // like a failing one the moment work is in progress. So the denominator is CONCLUDED claims only: attempts
    // that either completed or had their lease expire. In-flight work is reported separately and judged by
    // nobody until it resolves.
    const jobs = jobQueue && jobQueue.jobs ? Object.values(jobQueue.jobs) : [];
    if (jobs.length) {
        const t = Date.now();
        const completed = jobs.filter((j) => j.completedAt).length;
        const inFlight = jobs.filter((j) => !j.completedAt && j.leaseUntil && new Date(j.leaseUntil).getTime() > t).length;
        const attempts = jobs.reduce((a, j) => a + (j.attempts || 0), 0);
        // a claim concluded either by completing or by expiring; the currently-held ones are excluded
        const concluded = Math.max(0, attempts - inFlight);
        const dropped = Math.max(0, concluded - completed);
        g.jobsTotal = { value: jobs.length, source: "job-queue.json", asOf: null, note: "jobs ever enqueued" };
        g.jobsCompleted = { value: completed, source: "job-queue.json", asOf: null, note: "jobs a peer ran and reported" };
        g.jobsInFlight = { value: inFlight, source: "job-queue.json", asOf: null, note: "claimed and under a live lease -- neither returned nor lost yet" };
        g.jobsPending = { value: jobs.filter((j) => !j.completedAt && (!j.leaseUntil || new Date(j.leaseUntil).getTime() <= t)).length,
            source: "job-queue.json", asOf: null, note: "waiting for a peer, including work reclaimed from an expired lease" };
        g.claimsDropped = { value: dropped, source: "job-queue.json", asOf: null, note: "claims whose lease expired without a report -- a peer took work and did not come back" };
        g.returnRate = { value: concluded > 0 ? +(completed / concluded * 100).toFixed(1) : null, unit: "%",
            source: "job-queue.json", asOf: null,
            note: "completed / CONCLUDED claims. In-flight claims are excluded from the denominator: work in progress is not a failure, and counting it as one would make a busy fleet look broken" };
    } else {
        for (const k of ["jobsTotal", "jobsCompleted", "jobsInFlight", "jobsPending", "claimsDropped", "returnRate"]) g[k] = { value: null, source: "job-queue.json", asOf: null, note: "no jobs have been enqueued yet" };
    }

    // ---- lighthouse presence ------------------------------------------------------------------------------
    const peers = roster && roster.peers ? Object.values(roster.peers) : [];
    if (peers.length) {
        const newest = peers.map((p) => p.lastSeen).filter(Boolean).sort().pop() || null;
        const masters = [...new Set(peers.map((p) => p.master).filter(Boolean))];
        g.peersCheckedIn = { value: peers.length, source: "lighthouse-roster.json", asOf: newest, note: "machines that have reported in, pushed or pulled" };
        g.peersPushed = { value: peers.filter((p) => p.origin === "push").length, source: "lighthouse-roster.json", asOf: newest, note: "reached IN through the tunnel -- peers the hub could never have dialled" };
        g.fleetMasters = { value: masters.length, source: "lighthouse-roster.json", asOf: newest, note: "distinct master hashes across the fleet -- more than one means the peers disagree" };
    } else {
        for (const k of ["peersCheckedIn", "peersPushed", "fleetMasters"]) g[k] = { value: null, source: "lighthouse-roster.json", asOf: null, note: "no peer has checked in yet" };
    }

    return { kind: "swek-peer-metrics", version: 1, at: iso(new Date()), gauges: g };
}

/** Human lines, for a console or a copy-paste report. */
export function metricLines(m) {
    const out = [];
    for (const [name, gg] of Object.entries(m.gauges)) {
        const v = gg.value === null ? "--" : (gg.value + (gg.unit || "") + (gg.of != null ? "/" + gg.of : ""));
        out.push("  " + name.padEnd(16) + String(v).padStart(8) + "   " + (gg.asOf ? gg.asOf.slice(0, 19) : "no data"));
    }
    return out;
}
