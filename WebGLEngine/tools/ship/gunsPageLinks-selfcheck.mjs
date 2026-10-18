// WebGLEngine/tools/ship/gunsPageLinks-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/gunsPageLinks-selfcheck.mjs      (~0.1 s)
//
// THE LINKS BETWEEN THE GUNS LINE'S PAGES ARE REAL, AND NOTHING ELSE IN THEM POINTS AT A FILE THAT IS NOT THERE.
// The backlog said the link from es-box3d-6dof.html to the space battleship would be "made at ship time", and the ship did not make it: a page
// can be built, gated, linked from server.html and still be a place nobody gets to from the page it grew out of. This holds the two ends of that
// link (the 6DOF page names the battleship, the battleship names the 6DOF page it was built from) and, on all four pages of the line
// (es-box3d-6dof, space-battleship, dogfight, bomber), that every local href names a file on disk. The census of what a page links is derived from
// its source each run; the PAIRS are the claim.
//
// WHAT IT DOES NOT CHECK, SAID PLAINLY: that a link works in a browser (the pages' own gates run them), that the target is the right page rather
// than an existing one (the pair list is what says which), and links made by script after load -- only anchors in the markup are read.
//
// SABOTAGE LOG (each applied to the page named, the gate run, the page restored byte for byte):
//   L1 the 6DOF page's anchor turned into a span                  -> 2 red (the pair, and the anchor census no longer reaches the pairs' count)
//   L2 its href naming the old file name battleship.html          -> 2 red (the pair, and DEAD: es-box3d-6dof.html -> /battleship.html)
//   L3 its href with a typo (space-battleships.html)              -> 2 red (the pair, and DEAD by name)
//   L4 the battleship page's back link turned into a span         -> 2 red
//   L5 the back link's id renamed                                 -> 1 red (the pair; the href still resolves, so the census stays green)
//   L6 a dead link added to dogfight.html                         -> 1 red, DEAD: dogfight.html -> /no-such-page.html
//   L7 a dead link added to bomber.html inside a comment          -> 0 red BY DESIGN (prose about a link is not a link; the fixture row holds it)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const PAGES = Object.freeze(["es-box3d-6dof.html", "space-battleship.html", "dogfight.html", "bomber.html"]);
/** [from, to, id the anchor carries] -- the claim of this gate. */
export const PAIRS = Object.freeze([
    Object.freeze(["es-box3d-6dof.html", "space-battleship.html", "battleshipLink"]),
    Object.freeze(["space-battleship.html", "es-box3d-6dof.html", "sixdofLink"]),
]);

/** Every <a ... href="..."> in the markup, with its id: comments and scripts are stripped first, so prose about a link is not a link. */
export function anchorsOf(src) {
    const body = src.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
    const out = [];
    for (const m of body.matchAll(/<a\b([^>]*)>/gi)) {
        const attrs = m[1];
        const href = (attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || [])[1];
        const id = (attrs.match(/\bid\s*=\s*"([^"]*)"/i) || [])[1] || null;
        if (href !== undefined) out.push({ href, id });
    }
    return out;
}
/** A local href is "/name.html" or "name.html" (optionally with ?query or #hash); the file is what it names. */
export function localTarget(href) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//") || href.startsWith("#") || href === "") return null;
    const p = href.split(/[?#]/)[0].replace(/^\//, "");
    return p || null;
}

console.log("gunsPageLinks-selfcheck -- the guns line's pages link each other, and to nothing that is missing\n");

const src = Object.fromEntries(PAGES.map((p) => [p, fs.existsSync(path.join(ENG, p)) ? fs.readFileSync(path.join(ENG, p), "utf8") : null]));
ok("the four pages of the line are on disk", PAGES.every((p) => src[p] !== null), PAGES.filter((p) => src[p] === null).join(", ") || PAGES.length + " pages");
const anchors = Object.fromEntries(PAGES.map((p) => [p, src[p] ? anchorsOf(src[p]) : []]));

// ---- 1. THE PAIRS -------------------------------------------------------------------------------------------------
for (const [from, to, id] of PAIRS) {
    const a = anchors[from].find((x) => x.id === id);
    ok(`!! ${from} links to ${to}: an anchor with id "${id}" whose href names it`,
        !!a && localTarget(a.href) === to, a ? `href ${JSON.stringify(a.href)}` : "no such anchor");
}

// ---- 2. NOTHING POINTS AT A FILE THAT IS NOT THERE -----------------------------------------------------------------
{
    const rows = [];
    for (const p of PAGES) for (const a of anchors[p]) { const t = localTarget(a.href); if (t) rows.push({ page: p, href: a.href, target: t, there: fs.existsSync(path.join(ENG, t)) }); }
    const dead = rows.filter((r) => !r.there);
    say(`local anchors read: ${rows.length} across ${PAGES.length} pages -- ${rows.map((r) => r.page.replace(".html", "") + "->" + r.target).join(", ") || "none"}`);
    ok("!! every local anchor on the four pages names a file that exists", rows.length >= PAIRS.length && dead.length === 0,
        dead.length ? "DEAD: " + dead.map((r) => `${r.page} -> ${r.href}`).join("; ") : `${rows.length} anchors, all present (and at least the ${PAIRS.length} pairs, so an empty read cannot pass)`);
}

// ---- 3. THE READERS, DRIVEN ON FIXTURES --------------------------------------------------------------------------
{
    const fx = '<!-- <a id="x" href="/gone.html">in a comment</a> --><script>const s = \'<a href="/also-gone.html">\';</script><a id="k" href="/es-box3d-6dof.html?x=1#y">k</a><a href="https://example.com/a.html">ext</a><a href="#top">top</a><a name="n">no href</a>';
    const a = anchorsOf(fx);
    ok("anchorsOf reads real anchors only: a comment and a script string are not links, a name-only anchor has no href",
        a.length === 3 && a[0].id === "k" && a[0].href === "/es-box3d-6dof.html?x=1#y", JSON.stringify(a));
    ok("localTarget turns a local href into a file name and leaves external, fragment and empty ones alone",
        localTarget("/es-box3d-6dof.html?x=1#y") === "es-box3d-6dof.html" && localTarget("bomber.html") === "bomber.html" &&
        localTarget("https://example.com/a.html") === null && localTarget("//cdn/x.js") === null && localTarget("#top") === null && localTarget("") === null && localTarget("mailto:a@b") === null);
}

console.log(fails ? `\ngunsPageLinks-selfcheck: ${fails} FAILED` : "\ngunsPageLinks-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
