// tools/roundhouse/lighthouse.mjs
//
// v2953 -- THE LIGHTHOUSE. The fleet has always been PULL: /fingerprint/collect takes a list of peer URLs and
// the hub FETCHES each one. That works on a LAN, where the hub can reach every peer, and it cannot work at all
// for a peer behind NAT -- a cousin's desktop on their own home network has no reachable address, and no amount
// of configuration on this side changes that. Only the peer can open the connection.
//
// So a lighthouse inverts the direction. The Cloudflare tunnel URL is a FIXED, GLOBALLY REACHABLE rendezvous;
// remote peers push to it on their own schedule. The hub stops being a caller and becomes a place that is
// always answering. That is the whole idea, and it is why the tunnel is the right shape for it: a tunnel URL is
// stable, survives the hub's IP changing, and is reachable from anywhere without the peer needing an address.
//
// WHAT THIS IS NOT. It is not a new comparison path. A pushed fingerprint is fed to the SAME compareFingerprints
// the pulled ones go through -- if the lighthouse had its own comparison, a remote peer could be graded by
// different rules than a LAN peer, which is exactly the two-copies-of-one-table bug in a new costume.
//
// THREE RULES, all of which this lab has already paid for elsewhere:
//
//   1. PROVENANCE IS RECORDED. Every roster entry says whether the hub PULLED it (the hub reached out and
//      verified the address) or the peer PUSHED it (the peer asserted its own identity). Those are different
//      epistemic situations and a roster that renders them identically is hiding something.
//
//   2. A PEER NEVER SENDS A VERDICT. It sends its fingerprint and its transcript; the hub grades. Same split as
//      the phone ballot, the magmap report, and the persistence ledger.
//
//   3. LAST-SEEN IS A MEASUREMENT, NOT A STATUS. The roster stores when a peer last checked in and lets the
//      reader decide what "stale" means, rather than baking in a timeout that would be wrong for a laptop that
//      is off overnight by design.

import crypto from "node:crypto";

export const LIGHTHOUSE_KIND = "swek-lighthouse-roster";

/** Content-addressed peer key: same machine keeps its slot across check-ins, no registry to maintain. */
export function peerKey({ host = "?", arch = "?", platform = "?", master = "" } = {}) {
    return crypto.createHash("sha256").update([host, arch, platform].join("|")).digest("hex").slice(0, 16);
}

export function emptyRoster() { return { kind: LIGHTHOUSE_KIND, version: 1, peers: {} }; }

/**
 * Record a check-in. `origin` is "push" when the peer contacted us and "pull" when we fetched it, and it is set
 * by the CALLER -- a peer cannot claim to have been pulled.
 */
export function checkIn(roster, report, { origin = "push", at = null, remoteHint = null } = {}) {
    const out = roster && roster.peers ? { ...roster, peers: { ...roster.peers } } : emptyRoster();
    const now = at || new Date().toISOString();
    const key = peerKey(report || {});
    const prev = out.peers[key];
    const entry = {
        key,
        host: report.host || null, arch: report.arch || null, platform: report.platform || null,
        node: report.node || null,
        master: report.master || null,
        subsystemCount: Array.isArray(report.subsystems) ? report.subsystems.length : null,
        observableCount: Array.isArray(report.observables) ? report.observables.length : null,
        origin,                                   // "push" (peer asserted) or "pull" (hub verified the address)
        remoteHint: remoteHint || (prev && prev.remoteHint) || null,
        firstSeen: prev ? prev.firstSeen : now,
        lastSeen: now,
        checkIns: (prev ? prev.checkIns : 0) + 1,
        // the master hash CHANGING is the interesting event -- a peer that rebuilt, updated, or diverged
        masterHistory: (() => {
            const h = prev ? [...prev.masterHistory] : [];
            const last = h[h.length - 1];
            if (!last || last.master !== (report.master || null)) h.push({ master: report.master || null, at: now });
            return h.slice(-10);
        })(),
    };
    out.peers[key] = entry;
    return out;
}

/**
 * Summarise the roster. Deliberately reports AGE rather than a live/dead verdict: a laptop that is off overnight
 * is not a failure, and only the operator knows what cadence they expect.
 */
export function rosterSummary(roster, { now = null } = {}) {
    const t = now ? new Date(now) : new Date();
    const peers = Object.values((roster && roster.peers) || {});
    const rows = peers.map((p) => {
        const ageMs = t - new Date(p.lastSeen);
        return {
            key: p.key, host: p.host, platform: p.platform, arch: p.arch, origin: p.origin,
            master: p.master, checkIns: p.checkIns, lastSeen: p.lastSeen,
            ageHours: +(ageMs / 3600000).toFixed(2),
            masterChanges: Math.max(0, p.masterHistory.length - 1),
        };
    }).sort((a, b) => a.ageHours - b.ageHours);
    return {
        peerCount: rows.length,
        pushed: rows.filter((r) => r.origin === "push").length,
        pulled: rows.filter((r) => r.origin === "pull").length,
        // agreement across everyone who has ever checked in, which is the thing a lighthouse is FOR
        masters: [...new Set(rows.map((r) => r.master).filter(Boolean))],
        changedMaster: rows.filter((r) => r.masterChanges > 0),
        rows,
    };
}

export function rosterLines(s) {
    const out = [`  lighthouse: ${s.peerCount} peer(s) -- ${s.pushed} pushed, ${s.pulled} pulled, ${s.masters.length} distinct master hash(es)`];
    for (const r of s.rows) {
        out.push(`    ${(r.host || "?").padEnd(16)} ${(r.platform + "/" + r.arch).padEnd(16)} ${r.origin.padEnd(5)} ` +
                 `checkIns ${String(r.checkIns).padStart(3)}  age ${r.ageHours}h  master ${(r.master || "").slice(0, 12)}`);
    }
    for (const r of s.changedMaster) out.push(`    !! ${r.host} changed master hash ${r.masterChanges} time(s) -- rebuilt, updated, or diverged`);
    if (s.masters.length > 1) out.push(`    !! ${s.masters.length} DIFFERENT master hashes across the fleet -- the peers do not agree`);
    return out;
}
