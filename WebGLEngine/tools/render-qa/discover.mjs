// tools/render-qa/discover.mjs -- find the pages nobody remembered to list.
//
// The render QA harness read a hand-written manifest of 25 pages. The engine has 212. So 187 pages -- including every
// demo built in the last several dozen versions -- were never rendered, never checked for a black canvas, and never
// checked for console errors. A gate covering 12% of the surface is not a gate; it is a gate-shaped object, and worse
// than none, because it reports green.
//
// The fix is to stop relying on memory. Every demo page in this engine already declares itself with <meta name=
// "demo:title"> and friends, because the dock reads them -- so the pages have been describing themselves the whole
// time and QA simply was not listening. Discovery walks the folder, reads those tags, and produces an entry for
// everything.
//
// Two rules that keep it honest:
//   - AN EXPLICIT ENTRY ALWAYS WINS. The 25 hand-written entries have tuned waits, canvases, seeds and baselines.
//     Discovery may never overwrite a tuned page with a guessed one; it only fills in what nobody has spoken for.
//   - SKIPPING IS DECLARED, NEVER SILENT. A page that cannot be checked (it needs a login, a camera, hardware) is
//     listed in "exclude" WITH A REASON and reported as skipped. Quietly dropping it is how 187 pages disappeared.
"use strict";
import fs from "node:fs";
import path from "node:path";

// what a page says about itself, in the tags the dock already reads
function readMeta(html) {
    const meta = {};
    for (const m of html.matchAll(/<meta\s+name=["']demo:([a-z]+)["']\s+content=["']([^"']*)["']/gi)) meta[m[1].toLowerCase()] = m[2];
    const t = html.match(/<title>([^<]*)<\/title>/i);
    if (t && !meta.title) meta.title = t[1].trim();
    meta.hasCanvas = /<canvas/i.test(html);
    meta.isModule = /<script\s+type=["']module["']/i.test(html);
    return meta;
}
// a guessed entry is deliberately gentler than a tuned one: it asserts the page RENDERS and does not throw, and
// nothing more. Claiming a specific look for a page nobody has looked at would be inventing a baseline.
function defaultEntry(file, meta, defaults) {
    const name = file.replace(/\.html$/, "");
    const e = { name, url: "/" + file, discovered: true, title: meta.title || name,
        category: meta.category || "uncategorised", wait: defaults.wait || 3500, checks: [] };
    // v2839 -- a page WITHOUT a declared canvas must still say "viewport" explicitly. Leaving it undefined
    // routed the harness into an ELEMENT screenshot, which then hunted for a canvas the page had created
    // dynamically and never made visible -- face.html burned the full 30-second timeout on every run and
    // produced no image at all. The absence of a canvas is information, not a gap to be filled by a guess.
    e.canvas = "viewport";
    if (meta.hasCanvas) { e.checks.push({ type: "notAllBlack", minNonBlackFrac: 0.01 }); }
    e.noConsoleErrors = true;
    return e;
}
function discover(opts = {}) {
    const dir = opts.dir || process.cwd();
    const manifest = opts.manifest || { defaults: {}, pages: [] };
    const defaults = manifest.defaults || {};
    const exclude = manifest.exclude || {};                    // { "login.html": "needs a session", ... }
    // v2821 -- keyed by BASE FILE but holding a LIST, because one file can have several tuned entries that
    // differ only by query string (/index.html, /index.html?rle=1, /index.html?rle=1&biomes=1). The previous
    // Map<file, entry> silently kept only the LAST of them: four explicit world variants collapsed into one,
    // and the pre-existing ?box3ddemo=1 entry disappeared the moment a sibling was added. A manifest that
    // quietly drops entries is the same failure this file was written to fix, one level up.
    const listed = new Map();
    for (const p of manifest.pages || []) {
        const base = String(p.url).split("?")[0].replace(/^\//, "");
        if (!listed.has(base)) listed.set(base, []);
        listed.get(base).push(p);
    }
    const files = (opts.files || fs.readdirSync(dir)).filter(f => f.endsWith(".html")).sort();
    const pages = [], added = [], skipped = [], kept = [];
    for (const f of files) {
        if (listed.has(f)) { pages.push(...listed.get(f)); kept.push(f); continue; }   // tuned entries win, always -- ALL of them
        if (exclude[f]) { skipped.push({ file: f, reason: exclude[f] }); continue; } // declared, never silent
        let html = ""; try { html = fs.readFileSync(path.join(dir, f), "utf8"); } catch { skipped.push({ file: f, reason: "unreadable" }); continue; }
        const e = defaultEntry(f, readMeta(html), defaults);
        pages.push(e); added.push(f);
    }
    // an explicit entry for a page that no longer exists is a stale entry, and worth saying so out loud
    const orphans = [...listed.keys()].filter(k => !files.includes(k));
    for (const [k, v] of listed) if (!files.includes(k)) pages.push(...v);
    return { defaults, pages, added, kept, skipped, orphans, total: pages.length };
}
export { discover, readMeta, defaultEntry };
