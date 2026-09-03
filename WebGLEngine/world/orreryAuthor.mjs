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
// git://, git+https:// and ssh git@host:owner/repo are all real ways a provenance file records an upstream,
// and the first draft accepted only https. vendor/gifenc/PROVENANCE.txt reads git://github.com/mattdesl/gifenc.git
// and was read as having no upstream at all -- the THIRD narrow pattern in this one function, after the licence
// filename and the provenance-file extension. The species is "I matched the shape I happened to picture".
const URL_RE = /(?:git\+)?(?:https?|git|ssh):\/\/[^\s)>\]"']+|git@[\w.-]+:[\w.-]+\/[\w.-]+/g;
const GH_URL = /(?:^|\/\/|@)(?:raw\.githubusercontent\.com|github\.com)[/:][^/]+\/[^/]+/;
const GH_PARTS = /(?:raw\.githubusercontent\.com|github\.com)[/:]([^/#?]+)\/([^/#?]+?)(?:\.git)?(?:[/#?].*)?$/;

/**
 * *** v4432 -- THE SIXTH DEFECT IN THIS FUNCTION, AND IT IS NOT NARROWNESS. *** The header above records four
 * widenings, each because a pattern matched a shape somebody happened to picture. This one is different: the
 * pattern was FINE and the SELECTION was wrong. It took `hits.find(...)` -- the FIRST GitHub URL in the file --
 * and the first is not more authoritative than the rest.
 *
 * MEASURED: vendor/wasm/quickjs/quickjs-emscripten-core/README.md contains THIRTY GitHub URLs for its own
 * project. Line 5 says `justjakel`; lines 72 to 332 say `justjake`, twenty-nine times. The scanner took line
 * 5, so orrery-authors.json attributed 810,948 vendored bytes to github.com/justjakel -- AN ACCOUNT THAT DOES
 * NOT EXIST. GitHub's user search returns "the listed users cannot be searched either because the users do
 * not exist" for justjakel and a real profile for justjake, whose quickjs-emscripten has 1,702 stars. Three
 * SIBLING packages vendored from the same upstream release spell it correctly on their equivalent line.
 *
 * Nothing caught it for as long as it has been there because nothing had ever asked GitHub whether the owner
 * exists -- which is #139's question, asked once.
 *
 * So: the majority (owner, repo) among ALL the GitHub URLs in the file wins, and the vote is reported so a
 * disagreement is visible rather than silently resolved. This does not touch the vendored text; whether the
 * stray L is upstream's or arrived here cannot be told from inside this tree, and guessing would be editing
 * somebody else's README on a hunch.
 */
export function upstreamFrom(text) {
    const hits = String(text || "").match(URL_RE) || [];
    const ghs = hits.filter((u) => GH_URL.test(u));
    if (!ghs.length) return hits.length ? { url: hits[0], owner: null, repo: null } : null;
    const parts = ghs.map((u) => ({ u, m: GH_PARTS.exec(u) })).filter((x) => x.m)
                     .map((x) => ({ url: x.u, owner: x.m[1], repo: x.m[2] }));
    if (!parts.length) return { url: ghs[0], owner: null, repo: null };

    // *** THE VOTE IS OVER THE OWNER OF ONE REPO NAME, NOT OVER WHICH REPO THE FILE IS ABOUT. ***
    // A README legitimately links other projects -- this one names justjake/quickjs-emscripten 41 times,
    // bellard/quickjs 34 and quickjs-ng/quickjs 8 -- so a plain majority over (owner, repo) would let a
    // heavily-cited DEPENDENCY outvote the package itself. Which repo the file is about is still decided the
    // way it always was, by the first GitHub URL in the file; only the SPELLING OF ITS OWNER is put to a vote.
    // That is the defect that was actually found, and a fix wider than the defect is a second guess.
    const first = parts[0];
    const sameRepo = parts.filter((p2) => p2.repo === first.repo);
    const byOwner = new Map();
    for (const p2 of sameRepo) byOwner.set(p2.owner, (byOwner.get(p2.owner) || 0) + 1);
    const ranked = [...byOwner.entries()].sort((a, b) => b[1] - a[1]);
    const owner = ranked[0][0];
    // *** AND WHEN THE VOTE AGREES WITH THE FIRST URL, THE RECORD IS LEFT EXACTLY AS IT WAS. *** Synthesising
    // a canonical repo root for every body looked tidier and silently threw information away: htmx's record
    // pointed at the LICENSE blob at tag v2.0.10 and gifenc's at a git:// clone URL, both of which say more
    // about where the bytes came from than a repo root does. A fix should move the record it was written for
    // and nothing else, so a canonical URL is built ONLY when the vote overrode the first URL's owner.
    const out = owner === first.owner
        ? { url: first.url, owner, repo: first.repo }
        : { url: "https://github.com/" + owner + "/" + first.repo, owner, repo: first.repo };
    if (ranked.length > 1) {
        out.contested = ranked.map(([o, n]) => ({ owner: o, repo: first.repo, count: n }));
    }
    return out;
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
// *** FOUR NARROW PATTERNS IN ONE FUNCTION, EACH FOUND BY WIDENING THE ONE BEFORE. ***
    // v4415 replaced its own licence regex with orrery.mjs's isLicenceFile after falsely accusing vendor/fonts,
    // wrote a paragraph about it, and left `provenance|readme\.md$` standing two lines down -- so PROVENANCE.txt
    // in gifenc and slug did not count. Widening the extension found those; widening the URL scheme found
    // gifenc's `git://` upstream; and then vendor/htmx/VERSIONS.txt turned out to be a full provenance record
    // -- npm source, version, verified date, and the tagged licence URL -- missed because it is not called
    // PROVENANCE. EVERY WIDENING FOUND ANOTHER ONE, which is the signal that guessing filenames was the wrong
    // method rather than the wrong guess. So the rule is now structural: a body's own RECORDS are the shallow
    // text files that are not the licence and not shipped code, and all of them are read.
    const SHIPPED = /\.(js|mjs|cjs|ts|wasm|json|map|css|html|ttf|woff2?|png|jpe?g|glb|bin|h|c|cpp|a|so|dll)$/i;
    const provs = (paths || []).filter((p) => {
        const base = p.split("/").pop();
        // depth 3, not 2: the first cut here LOST vendor/wasm, whose record is
        // quickjs/quickjs-emscripten-core/README.md three levels down and which the OLD rule had found. A
        // widening that narrows somewhere else is still a narrowing, and only re-reading the whole table
        // caught it -- the count went up and one row went blank in the same edit.
        return p.split("/").length <= 3 && !SHIPPED.test(base) && !isLicenceFile(base);
    });
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
