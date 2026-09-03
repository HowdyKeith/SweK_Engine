// WebGLEngine/tools/ship/patternWidth.mjs
//
// v4418 -- *** THE DETECTOR THAT WOULD HAVE FOUND ALL FIVE, VALIDATED AGAINST THEM. ***
//
// v4416 fixed five too-narrow patterns in one function and closed with a claim it could not check: "this
// cannot prove there is no SIXTH narrow pattern, and the round's own history is that every widening found one
// more." Five instances across the session (shaderCensus v4383, claimEvidence v4404, orreryFleetScan v4412,
// the licence scan v4415, the provenance scan v4416) were each found the same way -- by a person looking at a
// row that seemed wrong. NOTHING LOOKED FOR THEM.
//
// THE SHAPE IS PRECISE ENOUGH TO SEARCH FOR: a pattern that names a KIND of file, and rejects a file in this
// tree that is plainly of that kind. `/(^|\/)(provenance|readme)\.md$/i` names the provenance kind and rejects
// PROVENANCE.txt. That is the whole test, and it is a MEASUREMENT rather than a lint: the near-miss is a real
// file with a name, not a style opinion.
//
// TWO THINGS IT MUST NOT DO, both learned from the five:
//   * It must not flag a pattern that names a FILE. `/licenceSweep/` contains "licence" and is the name of a
//     module, not a classifier; `/reachedLicences-selfcheck/` likewise. The kind word has to stand as its own
//     token -- non-identifier characters either side -- or the census is the word-counting defect one level up,
//     which would be a fine joke and a useless tool.
//   * It must be validated against KNOWN POSITIVES. None of the five original scanners ever was, which is why
//     each shipped looking correct. The gate feeds v4416's five patterns back in as fixtures and requires all
//     five to be caught.
"use strict";

// The tree's own vocabulary of file KINDS: a word that says what a file IS rather than what it is called.
export const KINDS = Object.freeze(["licence", "license", "copying", "notice", "attribution", "provenance",
    "upstream", "readme", "authors", "changelog", "versions", "ofl", "unlicense", "spdx", "manifest", "citation"]);

const IDENT = /[A-Za-z0-9_]/;

// *** AND THE FIRST DRAFT OF THIS FILE COMMITTED THE SPECIES IT DETECTS. *** It took every basename CONTAINING
// a kind word as a file of that kind, so world/gpuProvenance.mjs -- a module -- counted as a provenance record
// and every licence classifier "missed" it. A file of a documentary kind is one whose extension is documentary,
// or which is named for the kind and nothing else. A .mjs called gpuProvenance is code that talks about
// provenance, which is the exact distinction v4412 drew for imports and v4404 for claims.
const DOCUMENTARY = /(^[^.]+$)|\.(txt|md|rst|adoc|text|1st)$/i;
export const isDocumentary = (base) => DOCUMENTARY.test(String(base || ""));

/**
 * Which kinds this pattern CLASSIFIES, as opposed to merely mentioning inside a longer name.
 * "licenceSweep" mentions one; "(LICENCE|COPYING)" classifies two.
 */
/**
 * *** AND THE KIND MATCHER MISSED THE PATTERN THAT MOTIVATED IT. *** world/orreryEjecta.mjs writes the licence
 * kind as `LICEN[CS]E`, which contains neither "licence" nor "license" as a literal, so a substring search over
 * the pattern body does not see it name the licence kind at all. THE SEVENTH INSTANCE OF THE SPECIES, INSIDE
 * THE DETECTOR FOR THE SPECIES. Single-character classes are expanded before the search, bounded so a pattern
 * with many classes cannot blow up: this is not a regex engine, it is enough of one to read a spelling.
 */
export function expansions(body, cap = 32) {
    let out = [String(body || "")];
    const CLASS = /\[([A-Za-z0-9]{1,8})\]/;
    for (let guard = 0; guard < 6; guard++) {
        const next = [];
        let grew = false;
        for (const v of out) {
            const m = CLASS.exec(v);
            if (!m) { next.push(v); continue; }
            grew = true;
            for (const ch of m[1]) next.push(v.slice(0, m.index) + ch + v.slice(m.index + m[0].length));
        }
        out = next.slice(0, cap);
        if (!grew) break;
    }
    return out;
}

export function namesAKind(body) {
    const variants = expansions(body).map((v) => v.toLowerCase());
    const found = new Set();
    for (const low of variants) for (const k of oneVariant(low)) found.add(k);
    return [...found];
}

function oneVariant(low) {
    const out = [];
    for (const k of KINDS) {
        let i = -1;
        while ((i = low.indexOf(k, i + 1)) >= 0) {
            const before = i === 0 ? "" : low[i - 1];
            const after = low[i + k.length] || "";
            // a kind word wrapped in identifier characters is part of a NAME, not a kind
            if (before && IDENT.test(before)) continue;
            if (after && IDENT.test(after)) continue;
            out.push(k); break;
        }
    }
    return out;
}

/** Regex literals on non-comment lines. Deliberately simple: a parser here would be its own defect surface. */
export function extractPatterns(src) {
    const out = [];
    const RE = /\/((?:[^/\\\n[]|\\.|\[[^\]\n]*\])+)\/([gimsuy]*)/g;
    String(src || "").split("\n").forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(line))) {
            const body = m[1];
            if (body.length < 4 || body.length > 140) continue;
            out.push({ line: i + 1, body, flags: m[2].replace(/g/g, "") });
        }
    });
    return out;
}

/**
 * For one pattern and the basenames in the tree: which files of the kinds it names does it accept, and which
 * does it REJECT? A pattern with both is a near-miss and gets reported by name.
 */
export function nearMisses(body, flags, basenames) {
    const kinds = namesAKind(body);
    if (!kinds.length) return null;
    let re;
    try { re = new RegExp(body, flags); } catch { return null; }
    const hit = [], miss = [];
    for (const b of basenames) {
        const low = b.toLowerCase();
        if (!isDocumentary(b)) continue;
        if (!kinds.some((k) => low.includes(k))) continue;
        let ok = false;
        try { ok = re.test(b); } catch { return null; }
        (ok ? hit : miss).push(b);
    }
    if (!hit.length || !miss.length) return null;
    return { kinds, hit, miss };
}

export function census(sources, basenames) {
    const rows = [];
    const seen = new Set();
    for (const { path: p, source } of sources) {
        for (const { line, body, flags } of extractPatterns(source)) {
            const key = p + "|" + body + "|" + flags;
            if (seen.has(key)) continue;
            seen.add(key);
            const nm = nearMisses(body, flags, basenames);
            if (nm) rows.push({ path: p, line, body, flags, ...nm });
        }
    }
    rows.sort((a, b) => b.miss.length - a.miss.length || a.path.localeCompare(b.path));
    return { rows, examined: seen.size };
}
