// tools/roundhouse/meshMerge.mjs
//
// v2965 -- CROSS-POLLINATION BETWEEN HUBS. Two SweK networks that can reach each other exchange ledgers, and
// each ends up holding the other's segment. If a peer's preferred hub goes quiet it can reconcile with any other
// hub that has gossiped with it, and the fleet keeps working through the outage.
//
// WHY THIS IS WORKABLE, and the reason is not the one it looks like. The intuition is "our traffic is in lockstep
// so the states line up" -- but lockstep is NOT what makes merging safe, and relying on it would break the moment
// two hubs saw different things at different times, which is exactly what gossip is for.
//
// What actually makes it work is that this state was already forced into a mergeable shape by an unrelated
// discipline. Bit-identity gave content-addressed KEYS. "Never overwrite, always append" gave append-only
// RECORDS. "A claim is a lease, not a transfer" gave TIMESTAMPS on everything. Those three habits produce, by
// accident, structures that merge without a coordinator: keys collide only when they mean the same thing, and
// entries accumulate rather than conflict. That property holds whether or not the hubs are in step.
//
// THE ONE THING THAT DOES NOT MERGE, said plainly rather than papered over:
//
//     THE JOB QUEUE CANNOT GOSSIP. A lease is EXCLUSIVE state -- "this peer, and no other, holds this job until
//     this time". Two hubs merging queues would each believe they may hand the same job out, and the same work
//     gets done twice by different machines. Not corruption; waste -- but silent waste that grows with the fleet.
//     Jobs stay hub-local until there is a real coordinator. Gossip the RESULTS instead: the device ledger merges
//     safely and carries what the work produced.
//
// AND THE TRAP INSIDE THE MERGE: counters must not SUM. If hub A and hub B both witnessed the same check-in,
// each recorded checkIns=1, and summing gives 2 -- one event counted twice, forever, worsening every time the
// hubs gossip again. Counters take the MAX, which makes merging IDEMPOTENT: merging the same state twice changes
// nothing, which is the property that lets hubs gossip repeatedly without drifting.

const maxIso = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));
const minIso = (a, b) => (!a ? b : !b ? a : (a < b ? a : b));
const maxNum = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);

/** Union two lighthouse rosters. Keys are machines; counters take max; history unions by (master, at). */
export function mergeRosters(a, b) {
    const out = { kind: "swek-lighthouse-roster", version: 1, peers: { ...((a && a.peers) || {}) } };
    for (const [key, p] of Object.entries((b && b.peers) || {})) {
        const q = out.peers[key];
        if (!q) { out.peers[key] = { ...p }; continue; }
        const hist = [...(q.masterHistory || [])];
        for (const h of p.masterHistory || []) if (!hist.some((x) => x.master === h.master && x.at === h.at)) hist.push(h);
        hist.sort((x, y) => String(x.at).localeCompare(String(y.at)));
        out.peers[key] = {
            ...q, ...p,
            firstSeen: minIso(q.firstSeen, p.firstSeen),
            lastSeen: maxIso(q.lastSeen, p.lastSeen),
            checkIns: maxNum(q.checkIns, p.checkIns),          // MAX, not sum -- see the counter trap
            masterHistory: hist.slice(-10),
            // a peer the other hub PULLED was verified by that hub; pushed is the weaker claim, so pull wins
            origin: (q.origin === "pull" || p.origin === "pull") ? "pull" : "push",
        };
    }
    return out;
}

/** Union two device ledgers. Runs are append-only, deduped by (kind, at, measured worst). */
export function mergeDeviceLedgers(a, b) {
    const out = { kind: "swek-device-results-ledger", version: 1, devices: { ...((a && a.devices) || {}) } };
    for (const [key, d] of Object.entries((b && b.devices) || {})) {
        const e = out.devices[key];
        if (!e) { out.devices[key] = { ...d, runs: [...d.runs] }; continue; }
        const runs = [...e.runs];
        for (const r of d.runs) {
            const dup = runs.some((x) => x.kind === r.kind && x.at === r.at &&
                ((x.reported || {}).fullGridWorst ?? null) === ((r.reported || {}).fullGridWorst ?? null));
            if (!dup) runs.push(r);
        }
        runs.sort((x, y) => String(x.at).localeCompare(String(y.at)));
        out.devices[key] = { ...e, ...d, runs, firstSeen: minIso(e.firstSeen, d.firstSeen), lastSeen: maxIso(e.lastSeen, d.lastSeen) };
    }
    return out;
}

/** Union two tunnel-candidate registries. A merge never retires a URL the other hub still considers live. */
export function mergeCandidates(a, b) {
    const out = { kind: "swek-tunnel-candidates", version: 1, urls: { ...((a && a.urls) || {}) } };
    for (const [u, c] of Object.entries((b && b.urls) || {})) {
        const e = out.urls[u];
        if (!e) { out.urls[u] = { ...c }; continue; }
        out.urls[u] = {
            ...e, ...c,
            firstSeen: minIso(e.firstSeen, c.firstSeen),
            lastSuccess: maxIso(e.lastSuccess, c.lastSuccess),
            lastFailure: maxIso(e.lastFailure, c.lastFailure),
            successes: maxNum(e.successes, c.successes),      // the same probe seen by both hubs is ONE probe
            failures: maxNum(e.failures, c.failures),
            // retirement is an operator act on one hub; a merge must not resurrect a retired URL nor retire a
            // live one, so it is retired only if BOTH sides consider it retired
            retired: !!(e.retired && c.retired),
        };
    }
    return out;
}

/** Refused on purpose -- a caller reaching for this gets the reason, not a plausible-looking wrong answer. */
export function mergeJobQueues() {
    throw new Error(
        "job queues cannot be merged. A lease is EXCLUSIVE state -- 'this peer holds this job until this time' -- " +
        "so two hubs merging queues would each believe they may hand the same job out, and the same work would be " +
        "done twice by different machines. Jobs stay hub-local until there is a real coordinator; gossip the " +
        "RESULTS instead (the device ledger merges safely and carries what the work produced).");
}


/**
 * v2973 -- Union two PERFORMANCE ledgers. This was missing from mergeAll: hubs exchanged peers, devices and
 * tunnels but not timings, so a fleet could agree on every verdict and still have no shared idea of how fast
 * anything ran. Timing is per-(check, host) and the samples are append-only, so the merge is a content dedupe:
 * the same run witnessed by two hubs is ONE sample, not two.
 *
 * Note there are no counters here to take the max of -- perf samples are records, not tallies -- so dedupe on
 * (at, ms, host) is the whole idempotence argument.
 */
export function mergePerfLedgers(a, b) {
    const out = { kind: "swek-perf-ledger", checks: { ...((a && a.checks) || {}) } };
    for (const [name, samples] of Object.entries((b && b.checks) || {})) {
        const mine = out.checks[name] ? [...out.checks[name]] : [];
        for (const s of samples) {
            if (!mine.some((x) => x.at === s.at && x.ms === s.ms && x.host === s.host)) mine.push(s);
        }
        mine.sort((x, y) => String(x.at).localeCompare(String(y.at)));
        out.checks[name] = mine;
    }
    return out;
}

/** Merge every mergeable ledger in one call, reporting what was gained and what was refused. */
export function mergeAll(mine, theirs) {
    const roster = mergeRosters(mine.roster, theirs.roster);
    const devices = mergeDeviceLedgers(mine.devices, theirs.devices);
    const candidates = mergeCandidates(mine.candidates, theirs.candidates);
    const perf = mergePerfLedgers(mine.perf, theirs.perf);   // v2973: timings travel too
    const n = (o, k) => Object.keys((o && o[k]) || {}).length;
    const samples = (o) => Object.values((o && o.checks) || {}).reduce((a2, arr) => a2 + arr.length, 0);
    return {
        roster, devices, candidates, perf,
        gained: {
            peers: n(roster, "peers") - n(mine.roster, "peers"),
            devices: n(devices, "devices") - n(mine.devices, "devices"),
            tunnels: n(candidates, "urls") - n(mine.candidates, "urls"),
            perfSamples: samples(perf) - samples(mine.perf),
        },
        refused: ["jobQueue -- leases are exclusive state and cannot gossip"],
    };
}

// ---- v2968: RE-GRADING WHAT ANOTHER HUB SENT -------------------------------------------------------------------------
//
// The merge answered "how do two ledgers combine". Exchanging them raises a question it did not have to: a
// merged device run carries graded.verdict -- computed by the OTHER hub, by whatever grader that hub was running.
// Presenting it as our own verdict would import a judgement we never made and cannot see the reasoning of.
//
// We do not have to. The ledger stores the RAW MEASUREMENTS beside the verdict -- fullGridWorst, cells, tol,
// floor, fellBack, the adapter -- which is everything gradeMagmapReport needs. So a merged run is RE-GRADED here
// from its own numbers, and the incoming verdict is kept only as a record of what they thought.
//
// AND THE DISAGREEMENT IS THE POINT. If our re-grade differs from theirs, two hubs looking at identical numbers
// reached different conclusions -- which means their graders differ, usually because one is running an older
// build. That is exactly the kind of thing a fleet exists to surface, so it is reported rather than resolved:
// neither verdict is silently preferred.

/**
 * Re-grade every merged run from its own reported numbers. `grade` is gradeMagmapReport (injected so this module
 * stays free of the grader's imports and can be tested with a stub).
 */
export function regradeMerged(ledger, grade) {
    const out = { ...ledger, devices: { ...(ledger.devices || {}) } };
    const disagreements = [];
    for (const [key, d] of Object.entries(out.devices)) {
        const runs = d.runs.map((r) => {
            if (r.kind !== "magmap" || !r.reported) return r;
            const rebuilt = {
                kind: "swek-magmap-gpu-report", proposedBy: "gpu",
                adapter: d.adapter || {}, ua: d.ua || "",
                tol: r.reported.tol, floor: r.reported.floor, fellBack: r.reported.fellBack,
                cfg: { n: r.reported.cfgN },
                adjudication: { accepted: true, worstRelDiff: r.reported.sampledWorst, checked: 34 },
                fullGrid: { worstRelDiff: r.reported.fullGridWorst, cells: r.reported.fullGridCells },
                graded: { peakErrFrac: 0 },
            };
            let mine = null;
            try { mine = grade(rebuilt); } catch (e) { mine = { verdict: "EXCLUDED", why: "could not re-grade: " + (e && e.message) }; }
            const theirs = r.graded && r.graded.verdict;
            if (theirs && mine.verdict !== theirs) {
                disagreements.push({ device: key, at: r.at, theirs, mine: mine.verdict, family: d.family });
            }
            return { ...r, graded: mine, gradedHere: true, theirVerdict: theirs || null };
        });
        out.devices[key] = { ...d, runs };
    }
    return { ledger: out, disagreements };
}
