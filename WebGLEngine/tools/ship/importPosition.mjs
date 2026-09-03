// WebGLEngine/tools/ship/importPosition.mjs
//
// v4410 -- *** A GUARD WAS REMOVED BECAUSE IT WAS MEASURED INERT. THE MEASUREMENT WAS TRUE. THE TREE THEN GREW
// THE CASE THE GUARD EXISTED FOR. ***
//
// world/orreryEjecta.mjs decides which files depend on a vendored body by asking whether the file's
// comment-stripped source CONTAINS `vendor/<name>/`. Its own header records that the first draft also required
// the hit to sit inside a quoted specifier, that all 32 matching files satisfied that test anyway, and that
// therefore "no sentence in 3,900 engine files carries it outside an import". The guard was deleted with the
// rule that a guard whose removal changes no count is an assertion that cannot fail.
//
// THAT RULE IS RIGHT AND IT COST THIS ANYWAY, because inertness is a property of the tree ON THE DAY IT IS
// MEASURED. v4406 found tools/ship/gateSweep.mjs filed as a box3d importer: a sweep closing's `verdict:` string
// quotes "/vendor/box3d/box3d.js" while EXPLAINING that box3dLoader imports it. Comment-stripping does not
// reach inside a string literal, and v4329's deleted guard would not have caught it either -- the mention IS
// quoted. A record about an import passes every test that asks "is this in a string".
//
// *** SO THE QUESTION IS NOT WHETHER THE PATH IS QUOTED. IT IS WHETHER THE QUOTED STRING **IS** THE PATH. ***
//
// FOUR KINDS, NOT TWO, because collapsing them sends different work to one place (v4401) and because three of
// them are REAL dependencies that a filter would have wrongly deleted:
//   import -- the module graph: `import ... from`, `import()`, `require()`, `export ... from`.
//   load   -- fetched at runtime: fetch(), new URL(), new Worker(), <script src>, <link href>, an importmap value.
//   path   -- the string is exactly a path and the tool reads, stats or weighs it. tools/ship/artifactWeight.mjs
//             lists `"vendor/box3d/box3d.js"` to weigh the artifact; physics/backendRouting-selfcheck stats it.
//             THESE ARE DEPENDENCIES. Dropping them to fix the record case would trade one wrong count for
//             another, which is the trap docs/EXPLAIN-ITSELF.md item 5 named in advance.
//   record -- the path appears INSIDE a sentence: a log message, a verdict, a header quoted into a string.
//             This is the only kind that is not a dependency, and it is the one the old rule could not see.
"use strict";

export const KINDS = Object.freeze(["import", "load", "path", "joined", "record"]);

// A quoted string is a SPECIFIER if it is a path and nothing else: optional leading "/" or "./", then path
// segments, ending in a file extension or a directory slash. A sentence that mentions a path is not one, and
// that single distinction is what separates `record` from the other three.
const SPECIFIER = /^\.{0,2}\/?(?:[\w.@~-]+\/)*[\w.@~-]+$/;

// What sits immediately before the opening quote decides import vs load. Anything else that IS a specifier is
// a `path` -- the tool is handling the file rather than loading it.
const IMPORT_BEFORE = /(?:\bimport\b|\bfrom\b|\brequire\s*\(|\bimport\s*\(\s*|\bexport\b[^;]*\bfrom\b)\s*$/;
const LOAD_BEFORE = /(?:\bfetch\s*\(|new\s+URL\s*\(|new\s+Worker\s*\(|\bsrc\s*=\s*|\bhref\s*=\s*|\bimportScripts\s*\()\s*$/;
// An IMPORTMAP VALUE is the most load-bearing position there is and the first draft filed it as `path`:
// `{ "imports": { "three": "/vendor/three/three.module.js" } }` is how ascii-object.html and splat_viewer.html
// reach three, and the before-window there is `"three": `. A QUOTED key followed by a colon is the tell --
// `files: [` and `verdict: ` have unquoted keys, so neither is caught by it. The population does not move
// (both kinds count as a dependency); what moves is whether the report can say HOW a page reaches a body.
const MAPPED_BEFORE = /"[\w@./-]+"\s*:\s*$/;

/**
 * Every occurrence of `needle` in `src`, with the quoted string that holds it and the kind that string is in.
 * Occurrences outside any quote are reported as kind "record" too: a bare path in code that is not a string is
 * not something the runtime can load.
 */
export function occurrences(src, needle) {
    const out = [];
    const s = String(src);
    let i = -1;
    while ((i = s.indexOf(needle, i + 1)) >= 0) {
        const q = enclosingString(s, i);
        if (!q) { out.push({ at: i, kind: "record", why: "not inside a string literal" }); continue; }
        const before = s.slice(Math.max(0, q.start - 61), q.start - 1);   // -1: exclude the opening quote itself, or every `import("` window ends in a quote and matches nothing
        const isSpec = SPECIFIER.test(q.text.trim());
        if (!isSpec) { out.push({ at: i, kind: "record", text: q.text.slice(0, 60), why: "the string is a sentence that CONTAINS the path, not the path" }); continue; }
        if (IMPORT_BEFORE.test(before)) out.push({ at: i, kind: "import", text: q.text });
        else if (LOAD_BEFORE.test(before) || MAPPED_BEFORE.test(before)) out.push({ at: i, kind: "load", text: q.text });
        else out.push({ at: i, kind: "path", text: q.text, why: "a specifier the tool handles rather than loads" });
    }
    return out;
}

/**
 * The string literal containing index `i`, or null -- found LINE-LOCALLY.
 *
 * *** THE FIRST DRAFT SCANNED QUOTE PAIRS FROM BYTE 0 AND REPORTED A STRING FROM A DIFFERENT PART OF THE FILE. ***
 * It read `import 0` across the whole tree and filed main.js -- which does `import("./vendor/three/...")` twice
 * -- as a record. Every occurrence got an "enclosing string" and every one was wrong, because one unbalanced
 * apostrophe in prose offsets the pairing for everything after it. THAT IS THIS ROUND'S OWN SUBJECT COMMITTED BY
 * ITS OWN DETECTOR: a check that looks right, answers confidently, and is measuring something else.
 *
 * A specifier never spans a line, so the scan does not need to either. For each quote character, take the last
 * one before `i` and the first one after, both on this line; the tightest pair that encloses `i` wins. An
 * apostrophe inside a double-quoted string has no partner to its right and so cannot claim the position.
 */
export function enclosingString(s, i) {
    let ls = s.lastIndexOf("\n", i) + 1;
    let le = s.indexOf("\n", i); if (le < 0) le = s.length;
    let best = null;
    for (const c of ['"', "'", "`"]) {
        const a = s.lastIndexOf(c, i);
        if (a < ls) continue;
        const b = s.indexOf(c, i);
        if (b < 0 || b >= le) continue;
        if (!best || a > best.start - 1) best = { quote: c, start: a + 1, end: b, text: s.slice(a + 1, b) };
    }
    return best;
}

/**
 * *** A FIFTH KIND, ADDED ONLY AFTER LOOKING AT WHAT THE FOURTH HAD CAUGHT. ***
 *
 * The first census called 21 files record-only. Nine of them DEPEND ON THE BODY -- they just say so as
 * `path.join(here, "..", "vendor", "box3d", "box3d.wasm")`, which contains no `vendor/box3d/` substring at all.
 * Their only literal hit is a log line saying the artifact is absent, so the substring rule sees the SENTENCE
 * and misses the DEPENDENCY. Filtering the 21 out would have deleted nine real dependants to remove twelve
 * false ones: item 5's own warning that this fix could trade one wrong count for another, met head-on.
 *
 * This is invisible to the old rule too -- it is not a regression, it is a hole both rules share, and the nine
 * were only ever counted because the same files ALSO happened to mention the path in prose. Their membership
 * has been right by accident for as long as the record has existed.
 */
const JOINED = (name) => new RegExp("[\\\"']vendor[\\\"']\\s*,\\s*[\\\"']" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\\"']");
export const joined = (src, name) => JOINED(name).test(String(src));

/** The kinds present in a file for one needle, strongest first. A file with any real kind is a dependant. */
export function kindOf(src, needle, name = null) {
    const occ = occurrences(src, needle);
    for (const k of KINDS) if (occ.some((o) => o.kind === k)) {
        // a record-only file that ALSO joins the path is a dependant, and the join is the stronger evidence
        if (k === "record" && name && joined(src, name)) return "joined";
        return k;
    }
    return name && joined(src, name) ? "joined" : null;
}

export const DEPENDS = Object.freeze(["import", "load", "path", "joined"]);
export const depends = (src, needle, name = null) => DEPENDS.includes(kindOf(src, needle, name));

/** The census across a file set: which depend, which only mention, and by which kind. */
export function census(files, needle, name = null) {
    const by = { import: [], load: [], path: [], joined: [], record: [], none: [] };
    for (const f of files) by[kindOf(f.source, needle, name) || "none"].push(f.path);
    return { ...by, depends: DEPENDS.reduce((a, k) => a + by[k].length, 0),
             mentions: by.record.length, seen: files.length };
}
