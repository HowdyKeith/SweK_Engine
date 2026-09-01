// FILE: world/licenceBodies.mjs -- v4281
//
// *** THE SPDX LABELS ON OUR OWN VENDORED CODE HAD NEVER BEEN CHECKED AGAINST THE LICENCE TEXT. ***
//
// tools/ship/vendoredLicences-selfcheck.mjs is ALL GREEN and its own closing note says exactly what it does
// not do: "whether the recorded SPDX identifiers are RIGHT ... nothing verifies that the text under
// vendor/<x>/LICENSE is the licence it is labelled with -- a mislabelled MIT would pass every check above."
//
// v4276 and v4277 built the instrument for that question and pointed it at thirty-five OTHER people's
// repositories. This file turns it inward. Nothing here changes a verdict in world/vendoredLicences.mjs --
// every label it carried survived -- and that is the outcome to want from an audit, not the outcome that
// makes it unnecessary.
//
// ---- *** WHAT IS COMPARED IS THE OPERATIVE BODY, AND GETTING THAT WRONG IS THE WHOLE DIFFICULTY *** ------------
//
// Two licence files can be the same licence and share not one byte: the title line is optional ("MIT License",
// "The MIT License (MIT)", or absent), the copyright notice differs by definition, and one upstream hard-wraps
// at 80 columns while another puts each paragraph on one line. So the comparison is of the OPERATIVE BODY:
// title dropped, copyright notice dropped, all whitespace collapsed.
//
// *** AND THE FIRST NORMALISER I WROTE DELETED THE RETENTION CLAUSE. *** It dropped every line CONTAINING the
// word "copyright" -- which in a hard-wrapped file removes the first line of "The above copyright notice and
// this permission notice shall be included in all copies", and in an unwrapped file removes the entire clause.
// Jolt's upstream licence is unwrapped and ours is wrapped, so the two came out 432 and 870 characters and
// looked like different licences. They are the same licence. The filter now drops a line that STARTS with
// "Copyright", which is the notice, and keeps every line that merely mentions it, which is the condition.
//
// ---- AND THE DISCRIMINATION THAT MAKES A LABEL CHECKABLE -------------------------------------------------------
//
// *** MIT AND 0BSD DIFFER BY EXACTLY ONE CLAUSE, AND IT IS THE ONE THAT MATTERS. *** Both grant everything.
// MIT requires the notice be carried in all copies; 0BSD drops that requirement entirely. So "is this MIT"
// is not a question about the word MIT appearing -- htmx's minified bundle has ten licence-word hits and all
// ten are the substring "submit" -- it is a question about whether the retention clause is present.
//
// *** AND THE MIT GRANT SENTENCE IS NOT UNIQUE TO MIT. *** SIL OFL 1.1 opens with the identical
// "Permission is hereby granted, free of charge, to any person obtaining a copy", so a matcher keyed on that
// sentence calls IBM Plex Serif's font licence MIT. It is not: the OFL constrains RENAMING, which no
// permissive software licence does, and that Reserved Font Name clause is what identifies it.
"use strict";

/**
 * The operative body of a licence: what it actually says, with what varies between copies removed.
 *
 * Drops a standalone title line, drops the copyright NOTICE (a line beginning "Copyright"), collapses all
 * whitespace, lowercases. Everything else is kept -- including every mention of "copyright" inside a clause.
 */
export function operativeBody(text) {
    return String(text)
        .split("\n")
        .filter((l) => !/^\s*(the\s+)?mit license(\s*\(mit\))?\s*$/i.test(l))
        .filter((l) => !/^\s*copyright\b/i.test(l))
        .join(" ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The copyright holder a licence file names, or null. This is the ATTRIBUTION, not the grant. */
export function holderOf(text) {
    const m = String(text).split("\n").find((l) => /^\s*copyright\b/i.test(l));
    return m ? m.replace(/^\s*copyright\s*(\(c\)|©)?\s*/i, "").trim() : null;
}

/**
 * The clauses that tell licences apart. Each is matched against the OPERATIVE BODY, so wrapping cannot
 * break one, and each is a whole obligation rather than a keyword.
 */
export const CLAUSES = Object.freeze({
    mitGrant: /permission is hereby granted, free of charge, to any person obtaining a copy/,
    zeroBsdGrant: /permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee is hereby granted/,
    retention: /above copyright notice and this permission notice shall be included in all copies/,
    sublicense: /sublicense/,
    asIs: /the software is provided "as is"/,
    reservedFontName: /reserved font name/,
    apacheRef: /licensed under the apache license, version 2\.0/,
});

/**
 * Identify a licence from its body alone. Returns an SPDX id, or null when the text is not a licence this
 * knows -- never a guess, which is world/licenceSweep.mjs's rule and wgslSpec.mjs's before it.
 *
 * ORDER MATTERS AND IS THE POINT: the font licence is tested BEFORE MIT, because it satisfies MIT's grant
 * clause and would otherwise be mislabelled by it.
 */
export function identify(text) {
    const b = operativeBody(text);
    if (CLAUSES.reservedFontName.test(b) && CLAUSES.mitGrant.test(b)) return "OFL-1.1";
    if (CLAUSES.apacheRef.test(b)) return "Apache-2.0";
    if (CLAUSES.zeroBsdGrant.test(b) && !CLAUSES.retention.test(b)) return "0BSD";
    if (CLAUSES.mitGrant.test(b) && CLAUSES.retention.test(b) &&
        CLAUSES.sublicense.test(b) && CLAUSES.asIs.test(b)) return "MIT";
    return null;
}

/**
 * *** TEN VENDORED LICENCES ARE THE SAME 1,020 CHARACTERS, FROM TEN UNRELATED UPSTREAMS. ***
 *
 * That is the canonical MIT body, and its hash is worth recording for the same reason licenceSweep records
 * a licence file's hash: an ELEVENTH copy that differs has something to say, where an eleventh that matches
 * says only that somebody used the standard text.
 */
export const CANONICAL = Object.freeze({
    "MIT":     { chars: 1020, sha: "56959050891f" },
    "0BSD":    { chars: 635,  sha: "f37c18b8bcf3" },
    "OFL-1.1": { chars: 4045, sha: "c853436ec994" },
});

/**
 * *** CORROBORATION FROM OUTSIDE THE TREE. *** Eight vendored licences were compared against the upstream
 * repository they came from, cloned live at v4281. All eight operative bodies matched EXACTLY.
 *
 * `identicalFile` is whether the whole file matched byte for byte; where it did not, `why` says what differs
 * and none of the differences is a difference of licence.
 */
export const UPSTREAM_CHECKED = Object.freeze([
    { path: "vendor/box3d",     upstream: "erincatto/box3d",                     identicalFile: true },
    { path: "vendor/draco",     upstream: "mrdoob/draco.js",                     identicalFile: true },
    { path: "vendor/grass",     upstream: "boona13/threejs-grass-water-shaders", identicalFile: true },
    { path: "vendor/taichi-js", upstream: "AmesingFlank/taichi.js",              identicalFile: true },
    { path: "vendor/htmx",      upstream: "bigskysoftware/htmx",                 identicalFile: true },
    { path: "vendor/heerich",   upstream: "meodai/heerich",                      identicalFile: true },
    { path: "vendor/three",     upstream: "mrdoob/three.js",                     identicalFile: false,
      why: "ours reads 2010-2023 and upstream HEAD reads 2010-2026. A PINNED COPY CARRIES THE YEAR RANGE OF " +
           "ITS PIN -- that is what pinning means, and a copyright range moving forward on a branch we did " +
           "not take is not drift in our copy. Operative body identical." },
    { path: "vendor/jolt",      upstream: "jrouwe/JoltPhysics",                  identicalFile: false,
      why: "ours carries an 'MIT License' title line and hard-wraps at 80 columns; upstream has no title and " +
           "puts each paragraph on one line. Operative body identical, and this is the pair that exposed the " +
           "first normaliser's bug -- it looked like two different licences and is one." },
]);

/**
 * *** AND THREE ENTRIES WHOSE spdx IS A CLAIM RATHER THAN A TEXT, WHICH IS NOT THE SAME EVIDENCE. ***
 *
 * world/vendoredLicences.mjs types these correctly already -- NAMED_OTHER, IN_HEADER, FIRST_PARTY -- and the
 * point here is narrower: identify() cannot confirm them, because there is no licence body to read. Saying
 * "unverifiable by this method" is a different answer from "wrong", and collapsing the two is how an audit
 * manufactures findings.
 */
export const NOT_A_LICENCE_BODY = Object.freeze([
    { path: "vendor/keyhunt", why: "a 6-line ATTRIBUTION.txt recording a TECHNIQUE reference with no code " +
        "copied. Its 'MIT' describes the upstream project, and no grant text is present or needed." },
    { path: "ui/vendor", why: "the grant is a comment at the top of qrcode.mjs -- 'Licensed under the MIT " +
        "license' -- a REFERENCE to MIT rather than MIT's text, so identify() reads 43,797 characters of " +
        "JavaScript and correctly finds no licence body." },
    { path: "vendor/wasm", why: "first-party AssemblyScript output. There is no licence file because there " +
        "is nobody to ask." },
]);
