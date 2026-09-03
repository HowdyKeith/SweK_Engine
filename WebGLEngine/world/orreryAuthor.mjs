// WebGLEngine/world/orreryAuthor.mjs
//
// v4414 -- *** PAPERED IS NOT ATTRIBUTED, AND THE ORRERY HAS ONLY EVER KNOWN THE FIRST. ***
//
// world/orrery.mjs splits every vendored body into CAPTURED (a licence file is present) and UNPAPERED (none
// found), and v4263 spent three findings making that search wide enough to be fair. It answers "may these
// bytes ship?" It has never answered "WHOSE ARE THEY?" -- and orrery.json's fifteen bodies carry
// [name, arrived, sha, bytes] and files, with no owner, url or repo field on any of them. The orrery records
// what this tree TOOK and nothing about who from.
//
// Keith asked for the inversion: the author as the sun, a universe centred on a person rather than on this
// repository. THE FIRST ROUND OF THAT IS A PROVENANCE BAKE, NOT A RENDERER, because the field does not exist.
//
// WHAT IS ACTUALLY ON DISK is a copyright line inside each licence, and it does not say one thing. Six kinds,
// because collapsing them would let "we know who wrote this" cover cases where we plainly do not:
//   person     -- a copyright line naming an individual. box3d/Erin Catto, gifenc/Matt DesLauriers.
//   collective -- "three.js authors", "Krbn contributors". A REAL attribution to a group, and NOT a person:
//                 an author-centred view that drew "three.js authors" as a person would be inventing one.
//   disclaimed -- a licence with no holder at all. htmx ships 0BSD, whose text says THE AUTHOR and names
//                 nobody. The body is papered and its author is still unknown, which is the whole finding.
//   prose      -- attribution in a sentence rather than a copyright line. keyhunt's ATTRIBUTION.txt credits a
//                 project and states in as many words that NO CODE WAS COPIED.
//   none       -- no licence file at all.
//   unread     -- a licence exists and this could not parse it. Separated from `none` on purpose: an absence
//                 read as a skip is an absence read as a pass, and "we did not look" is not "nothing is there".
"use strict";
import { isLicenceFile } from "./orrery.mjs";

export const KINDS = Object.freeze(["person", "collective", "disclaimed", "prose", "none", "unread"]);
export const ATTRIBUTED = Object.freeze(["person", "collective"]);

// A copyright line, in the shapes real licences use: (c), (C), the sign, or the word, then an optional year
// range, then the holder. The holder runs to end of line, and trailing punctuation and "All rights reserved"
// are trimmed rather than kept -- they are boilerplate, not part of a name.
const COPYRIGHT = /^\s*(?:copyright\s*)?(?:\((?:c|C)\)|©|copyright)\s*(?:\(c\)\s*)?((?:\[?\s*\d{4}\s*\]?(?:\s*[-–,]\s*\[?\s*\d{4}\s*\]?)?)?)\s*(.+?)\s*$/i;
const NOISE = /^(all rights reserved\.?|)$/i;

/** "the author", "the copyright holders" and friends name nobody, and a view that drew them would invent one. */
const DISCLAIMED = /^(the\s+)?(author|authors|copyright\s+holders?|owner)s?\.?$/i;

/** A group rather than a person: "<project> authors", "<project> contributors", an Inc/Ltd/Foundation. */
const COLLECTIVE = /\b(authors|contributors|team|project|foundation|inc|corp|corporation|ltd|llc|gmbh|company|community|developers|labs|group)\b\.?/i;

export function holderFrom(text) {
    const lines = String(text || "").split("\n");
    for (const raw of lines) {
        const m = COPYRIGHT.exec(raw);
        if (!m) continue;
        let who = (m[2] || "").replace(/[.,;]+$/, "").replace(/\s*all rights reserved\.?$/i, "").trim();
        // The OFL's copyright line carries boilerplate after the holder -- `IBM Corp. with Reserved Font Name
        // "Plex"` is one holder and one font-name clause, and keeping the clause would put a font name in an
        // author's title. Trimmed at the clause, not at a fixed length.
        who = who.replace(/\s+with\s+Reserved\s+Font\s+Name.*$/i, "").replace(/\s*\(.*?@.*?\)\s*$/, "").replace(/[.,;]+$/, "").trim();
        // taichi-js ships "Copyright (c) [2024] [Dunfan Lu]" -- an unfilled-looking template that IS filled.
        // Strip the brackets rather than reading them as part of the name, and say so where it matters.
        const bracketed = /^\[.*\]$/.test(who);
        if (bracketed) who = who.slice(1, -1).trim();
        if (!who || NOISE.test(who)) continue;
        if (DISCLAIMED.test(who)) return { kind: "disclaimed", name: null, year: m[1].trim() || null, line: raw.trim() };
        const kind = COLLECTIVE.test(who) ? "collective" : "person";
        return { kind, name: who, year: (m[1] || "").replace(/[[\]]/g, "").trim() || null, line: raw.trim(), bracketed };
    }
    return null;
}

/** An upstream URL, from a PROVENANCE.md or a README that records one. The strongest evidence there is. */
const URL_RE = /https?:\/\/[^\s)>\]"']+/g;
export function upstreamFrom(text) {
    const hits = String(text || "").match(URL_RE) || [];
    const gh = hits.find((u) => /github\.com\/[^/]+\/[^/]+/.test(u));
    if (!gh) return hits.length ? { url: hits[0], owner: null, repo: null } : null;
    const m = /github\.com\/([^/#?]+)\/([^/#?.]+)/.exec(gh);
    return { url: gh, owner: m ? m[1] : null, repo: m ? m[2] : null };
}

/**
 * One body's attribution, from the bytes the tree holds. `read(relPath)` returns text or null.
 * `paths` is the flat file list from orrery.json.
 */
export function attributionFor(name, paths, read) {
    // *** isLicenceFile, NOT A REGEX OF MY OWN, AND THE FIRST DRAFT LEARNED WHY THE HARD WAY. ***
    // It matched the licence word only at the START of a path segment, so vendor/fonts/IBMPlexSerif-OFL.txt --
    // a real OFL licence -- did not count, and `fonts` was reported as having NO PAPERWORK AT ALL. That is a
    // false accusation against a properly licensed dependency, which is the exact harm world/orrery.mjs's
    // header records happening THREE TIMES in one session before it widened LICENCE_NAME to match the word
    // anywhere in the filename. Writing a second copy of a scan the tree had already fixed reproduced the bug
    // it was fixed for. One rule, imported.
    const licences = (paths || []).filter((p) => isLicenceFile(p.split("/").pop()));
    const provs = (paths || []).filter((p) => /(^|\/)(provenance|readme)\.md$/i.test(p));
    // EVERY licence is read, not the first that parses: vendor/wasm holds three, and a body whose licences
    // name different holders is a fact a view must be able to show rather than a tie the scanner breaks alone.
    let holder = null, from = null, unread = 0;
    const holders = [];
    for (const p of licences) {
        const t = read(name + "/" + p);
        if (t == null) { unread++; continue; }
        const h = holderFrom(t);
        if (h && h.name && !holders.some((x) => x.name === h.name)) holders.push({ ...h, file: p });
        if (h && !holder) { holder = h; from = p; }
        if (!from) from = p;
    }
    let upstream = null, upstreamFile = null;
    for (const p of provs) {
        const t = read(name + "/" + p);
        if (t == null) continue;
        const u = upstreamFrom(t);
        if (u && u.owner) { upstream = u; upstreamFile = p; break; }
        if (u && !upstream) { upstream = u; upstreamFile = p; }
    }
    let kind;
    if (holder) kind = holder.kind;
    else if (licences.length === 0) kind = "none";
    else if (unread === licences.length) kind = "unread";
    else kind = /attribution/i.test(from || "") ? "prose" : "disclaimed";
    return { name, kind, who: holder ? holder.name : null, line: holder ? holder.line : null,
             licenceFile: from, upstream, upstreamFile, licences: licences.length,
             holders: holders.map((h) => h.name), alsoHolders: holders.slice(1).map((h) => h.name) };
}

/** The census across all bodies -- a partition, plus how many can name an upstream owner at all. */
export function census(bodies, read) {
    const rows = bodies.map((b) => attributionFor(b.name, (b.files || []).map((f) => f.path), read));
    const by = Object.fromEntries(KINDS.map((k) => [k, rows.filter((r) => r.kind === k)]));
    return { rows, ...by,
             attributed: rows.filter((r) => ATTRIBUTED.includes(r.kind)).length,
             withUpstream: rows.filter((r) => r.upstream && r.upstream.owner).length,
             seen: rows.length };
}

/**
 * The inversion Keith asked for: group the bodies by WHO, so an author is the sun and what this tree took from
 * them are the planets. Bodies with no nameable author are NOT dropped and NOT given a placeholder -- they are
 * returned in `unattributed`, because a universe that quietly omits what it cannot name is a universe that
 * lies about its own coverage.
 */
export function systems(rows, sizeOf) {
    const byAuthor = new Map();
    const unattributed = [];
    for (const r of rows) {
        if (!ATTRIBUTED.includes(r.kind)) { unattributed.push(r); continue; }
        const key = r.who;
        if (!byAuthor.has(key)) byAuthor.set(key, { author: key, kind: r.kind, bodies: [], bytes: 0 });
        const s = byAuthor.get(key);
        s.bodies.push(r.name);
        s.bytes += sizeOf ? (sizeOf(r.name) || 0) : 0;
    }
    const out = [...byAuthor.values()].sort((a, b) => b.bytes - a.bytes || a.author.localeCompare(b.author));
    return { systems: out, unattributed, authors: out.length,
             covered: out.reduce((a, s) => a + s.bodies.length, 0), missing: unattributed.length };
}
