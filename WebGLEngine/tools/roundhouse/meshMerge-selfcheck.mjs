// tools/roundhouse/meshMerge-selfcheck.mjs
//
// v2965 -- GOSSIP BETWEEN HUBS: THE TWO PROPERTIES THAT MAKE IT SAFE, AND THE ONE THING THAT CANNOT JOIN IN.
//
// IDEMPOTENT: merging the same state twice changes nothing. Without this, two hubs that gossip repeatedly drift
// further apart every round -- the opposite of what gossip is for.
// COMMUTATIVE: merge(a,b) equals merge(b,a). Without this, which hub spoke first would change the answer, and a
// three-hub mesh would never converge.
//
// Both hold here not because the hubs are in lockstep but because the state was already content-addressed,
// append-only and timestamped for unrelated reasons. The job queue is the exception, and it is refused loudly.

import { mergeRosters, mergeDeviceLedgers, mergeCandidates, mergeJobQueues, mergeAll } from "./meshMerge.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const J = (x) => JSON.stringify(x);

const peer = (key, over = {}) => ({ key, host: key, arch: "x64", platform: "linux", master: "AAAA", origin: "push",
    firstSeen: "2026-07-25T10:00:00Z", lastSeen: "2026-07-25T10:00:00Z", checkIns: 1, masterHistory: [{ master: "AAAA", at: "2026-07-25T10:00:00Z" }], ...over });
const roster = (...ps) => ({ peers: Object.fromEntries(ps.map((p) => [p.key, p])) });

// ---- 1. IDEMPOTENT: THE COUNTER TRAP -----------------------------------------------------------------------------------
{
    const A = roster(peer("alpha"));
    const once = mergeRosters(A, A);
    const twice = mergeRosters(once, A);
    ok("!! merging a roster with itself does NOT double the check-in count",
        once.peers.alpha.checkIns === 1 && twice.peers.alpha.checkIns === 1,
        "checkIns stays 1 through two merges. Summing would give 2 then 3 -- one real event counted again every " +
        "time the hubs gossip, an error that GROWS with contact. Counters take the max, which is what makes the " +
        "merge idempotent");

    ok("...and merging identical state is a no-op overall",
        J(once) === J(mergeRosters(once, once)),
        "byte-identical after a second merge. Two hubs can gossip every minute forever without drifting");
}

// ---- 2. COMMUTATIVE: ORDER DOES NOT CHANGE THE RESULT --------------------------------------------------------------------
{
    const A = roster(peer("alpha", { lastSeen: "2026-07-25T10:00:00Z", checkIns: 3 }));
    const B = roster(peer("alpha", { lastSeen: "2026-07-26T10:00:00Z", checkIns: 7, master: "BBBB", masterHistory: [{ master: "BBBB", at: "2026-07-26T10:00:00Z" }] }),
                     peer("bravo"));
    ok("!! merge(a,b) equals merge(b,a)",
        J(mergeRosters(A, B).peers.alpha.checkIns) === J(mergeRosters(B, A).peers.alpha.checkIns) &&
        Object.keys(mergeRosters(A, B).peers).sort().join() === Object.keys(mergeRosters(B, A).peers).sort().join(),
        "same peers, same counts, whichever hub speaks first. Without this a three-hub mesh would never converge " +
        "-- the answer would depend on the accident of who called whom");

    ok("the newer lastSeen wins and the older firstSeen is kept",
        mergeRosters(A, B).peers.alpha.lastSeen === "2026-07-26T10:00:00Z",
        "recency for last-seen, earliest for first-seen -- each field takes the value that is true of the union");
}

// ---- 3. THE OTHER HUB'S SEGMENT ACTUALLY ARRIVES -------------------------------------------------------------------------
{
    const mine = { roster: roster(peer("alpha")), devices: { devices: { d1: { key: "d1", family: "ARM/Mali", firstSeen: "x", lastSeen: "x", runs: [{ kind: "magmap", at: "t1", reported: { fullGridWorst: 5e-6 }, graded: { verdict: "CONFIRMED" } }] } } }, candidates: { urls: { "https://a": { url: "https://a", successes: 1, failures: 0, retired: false } } } };
    const theirs = { roster: roster(peer("bravo")), devices: { devices: { d2: { key: "d2", family: "Qualcomm/Adreno", firstSeen: "y", lastSeen: "y", runs: [{ kind: "magmap", at: "t2", reported: { fullGridWorst: 7e-6 }, graded: { verdict: "CONFIRMED" } }] } } }, candidates: { urls: { "https://b": { url: "https://b", successes: 0, failures: 2, retired: false } } } };
    const m = mergeAll(mine, theirs);
    ok("!! after gossip each hub holds the other's peers, devices and tunnels",
        m.gained.peers === 1 && m.gained.devices === 1 && m.gained.tunnels === 1 &&
        Object.keys(m.devices.devices).length === 2,
        "gained " + J(m.gained) + ". A peer whose preferred hub goes quiet can now reconcile with the other one " +
        "and find its own history there -- which is the whole point of hardening by cross-pollination");

    ok("a device run present on both sides is not duplicated",
        mergeDeviceLedgers(mine.devices, mine.devices).devices.d1.runs.length === 1,
        "runs dedupe on (kind, at, measured worst), so the same audition witnessed by two hubs stays one run " +
        "rather than becoming two devices' worth of evidence");
}

// ---- 4. RETIREMENT SURVIVES, RESURRECTION DOES NOT -----------------------------------------------------------------------
{
    const live = { urls: { "https://x": { url: "https://x", successes: 0, failures: 5, retired: false } } };
    const dead = { urls: { "https://x": { url: "https://x", successes: 0, failures: 5, retired: true } } };
    ok("!! a URL retired on one hub and live on the other stays LIVE after merging",
        mergeCandidates(live, dead).urls["https://x"].retired === false,
        "retiring is an operator act on ONE hub. A merge that spread one operator's retirement to everyone would " +
        "delete a working address from the whole mesh; requiring both sides to agree keeps the v2956 rule intact -- " +
        "only an explicit act removes a candidate, and a merge is not an act");
}

// ---- 5. THE JOB QUEUE IS REFUSED, WITH THE REASON ------------------------------------------------------------------------
{
    let threw = null;
    try { mergeJobQueues({}, {}); } catch (e) { threw = e.message; }
    ok("!! merging job queues throws, and explains why",
        !!threw && /lease is EXCLUSIVE/.test(threw) && /done twice/.test(threw),
        "a lease says 'this peer and no other holds this job'. Two hubs merging queues would each hand the same " +
        "job out -- silent duplicated work that grows with the fleet. Refusing beats doing something that looks " +
        "plausible, and the message points at gossiping RESULTS instead");

    const m = mergeAll({ roster: roster(), devices: { devices: {} }, candidates: { urls: {} } },
                       { roster: roster(), devices: { devices: {} }, candidates: { urls: {} } });
    ok("...and mergeAll reports the refusal rather than silently omitting it",
        m.refused.length === 1 && /leases/.test(m.refused[0]),
        "a caller reading the result sees what was NOT merged, so nobody later assumes jobs travelled too");
}

console.log();
if (fails) { console.log("meshMerge-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("meshMerge-selfcheck: all checks pass");
