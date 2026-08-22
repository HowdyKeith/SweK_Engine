// WebGLEngine/tools/roundhouse/candidateKnown.mjs -- v3013
//
// WHICH OF THESE SCANNED ANDROID IPs IS ALREADY ONE OF OURS?
//
// /android/candidates finds Android devices on the LAN and returns a list keyed by IP. On a real network that
// list is long and undifferentiated -- a TV, three phones, a tablet nobody uses, and the two Shield boxes
// actually running a SweK GPU brain under Termux all look the same. The useful question is not "what Android
// devices exist" but "WHICH OF THESE DO I ALREADY HAVE", and nothing answered it.
//
// THREE INDEPENDENT WITNESSES, because each knows something the others do not:
//   the LIGHTHOUSE ROSTER  -- a peer that PUSHED a check-in. Strongest: it ran our code and said so.
//   the PEER LIST          -- a box this hub has successfully PULLED from. It answered our HTTP.
//   the DEVICE LEDGER      -- a device that SUBMITTED magmap results. It did real GPU work for us.
//
// AN IP MATCH IS EVIDENCE, NOT IDENTITY, AND THAT DISTINCTION IS THE WHOLE FILE. DHCP reassigns; a phone that
// was 192.168.11.40 last week may be a printer today. So a match is reported as "this IP matches a peer that
// checked in at T", never as "this IS that peer" -- and the AGE of the witness travels with it, because a
// six-week-old sighting and a six-minute-old one are different claims wearing the same word.
"use strict";

/** Pull an IPv4 out of a URL or origin string. Returns null rather than guessing. */
export function ipOf(s) {
    const m = String(s || "").match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
    return m ? m[1] : null;
}

export const WITNESS = {
    ROSTER: "checked-in",
    PEER: "answered-a-pull",
    LEDGER: "submitted-gpu-results",
};

/** Freshness bands. A witness is not a boolean -- how old it is changes what it means. */
export const FRESH_MS = 48 * 60 * 60 * 1000;

/**
 * Annotate scanned candidates with what this hub already knows about each IP.
 *
 * @param {Array} candidates  [{ ip, ua, lastSeen, ... }]
 * @param {object} known      { roster:[{origin|url,host,at}], peers:[{url,host,at}], ledger:[{origin|url,host,at}] }
 */
export function classifyCandidates(candidates, known = {}, now = Date.now()) {
    // A DEFAULT ARGUMENT DOES NOT COVER AN EXPLICIT null, and the gate caught exactly that. `known = {}` applies
    // when the argument is absent or undefined -- passing null skips the default and reaches `known.roster` on
    // nothing. A caller reading a missing ledger file will hand this null far more often than it will omit it.
    known = known || {};
    const index = new Map();
    const note = (list, kind) => {
        for (const e of list || []) {
            const ip = ipOf(e && (e.origin || e.url || e.ip));
            if (!ip) continue;
            const at = Date.parse((e && e.at) || "");
            const prev = index.get(ip) || { witnesses: [] };
            prev.witnesses.push({ kind, host: (e && e.host) || null, at: Number.isFinite(at) ? at : null });
            index.set(ip, prev);
        }
    };
    note(known.roster, WITNESS.ROSTER);
    note(known.peers, WITNESS.PEER);
    note(known.ledger, WITNESS.LEDGER);

    const rows = (candidates || []).map((c) => {
        const hit = index.get(c.ip);
        if (!hit) return { ...c, known: false, witnesses: [], why: "no check-in, no successful pull and no submitted results from this address" };
        const dated = hit.witnesses.filter((w) => w.at !== null);
        const newest = dated.length ? Math.max(...dated.map((w) => w.at)) : null;
        const ageMs = newest === null ? null : now - newest;
        const stale = ageMs !== null && ageMs > FRESH_MS;
        const host = (hit.witnesses.find((w) => w.host) || {}).host || null;
        return {
            ...c, known: true, host,
            witnesses: hit.witnesses.map((w) => w.kind),
            ageMs, stale,
            // The sentence, not the boolean.
            why: "this IP matches " + hit.witnesses.map((w) => w.kind).join(" + ") +
                 (newest === null ? " (undated)" : " " + Math.round(ageMs / 3600000) + "h ago") +
                 (stale ? " -- STALE, and DHCP reassigns, so treat this as a lead rather than an identification" : ""),
        };
    });

    const knownRows = rows.filter((r) => r.known);
    return {
        rows,
        total: rows.length,
        knownCount: knownRows.length,
        unknownCount: rows.length - knownRows.length,
        staleCount: knownRows.filter((r) => r.stale).length,
        // The number Keith actually asked for: how much shorter the list you have to think about becomes.
        note: rows.length
            ? knownRows.length + " of " + rows.length + " scanned Android addresses are already ours, leaving " +
              (rows.length - knownRows.length) + " to look at. An IP match is EVIDENCE, not identity."
            : "nothing scanned",
    };
}
