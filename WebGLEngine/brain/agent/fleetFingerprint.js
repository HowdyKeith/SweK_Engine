// brain/agent/fleetFingerprint.js
//
// The master check as a fleet-wide operation. For the whole run of this project the cross-architecture claim has been
// verified by hand: run the fingerprint on each box, eyeball that the master line matches. This makes one peer able to
// ask the whole fleet at once. It fans out to every peer for its master hash -- computed live, so it proves CURRENT
// bit-identity, not a stale recording -- compares each to its own, and returns a report: who matched, who diverged, who
// could not be reached. A single divergent hash is the whole point of the exercise showing up: it means some subsystem
// computed differently on that box, and the report names it so it can be run down rather than silently trusted.
//
// The fan-out is injectable (fetchMasterFn), so the logic is gated in-process against simulated peers -- including a
// deliberately divergent one -- and on the rig the same function does the real peer RPC.

export async function collectFleetMasters(localMaster, peers, fetchMasterFn) {
    const results = [];
    for (const peer of peers) {
        let master = null, reachable = false, error = null;
        try { master = await fetchMasterFn(peer); reachable = true; }
        catch (e) { error = String((e && e.message) || e); }
        results.push({ id: peer.id, master, reachable, match: reachable && master === localMaster, error });
    }
    const reached = results.filter((r) => r.reachable);
    const divergent = reached.filter((r) => !r.match).map((r) => r.id);
    const unreachable = results.filter((r) => !r.reachable).map((r) => r.id);
    return {
        localMaster,
        peers: results,
        checked: results.length,
        reached: reached.length,
        allMatch: reached.length > 0 && divergent.length === 0,   // every peer we reached agrees
        divergent,
        unreachable,
    };
}

// A one-line human summary of the report, for a log line or a UI banner.
export function summarizeFleetCheck(report) {
    if (!report.checked) return "no peers to check";
    if (report.allMatch) return "fleet fingerprint MATCH -- " + report.reached + "/" + report.checked + " peers agree on " + report.localMaster.slice(0, 12) + "\u2026";
    const parts = [];
    if (report.divergent.length) parts.push(report.divergent.length + " DIVERGENT (" + report.divergent.join(", ") + ")");
    if (report.unreachable.length) parts.push(report.unreachable.length + " unreachable");
    return "fleet fingerprint MISMATCH -- " + parts.join(", ") + " against " + report.localMaster.slice(0, 12) + "\u2026";
}
