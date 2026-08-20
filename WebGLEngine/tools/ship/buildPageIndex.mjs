// WebGLEngine/tools/ship/buildPageIndex.mjs
//
// Run: node tools/ship/buildPageIndex.mjs   (~2s -- MEASURED)
//
// v3228 -- "EVERY PAGE IN THE ENGINE" WAS A TYPED LIST, AND IT WAS 52 PAGES SHORT.
//
// page-index.html describes itself as "Every page in the engine, grouped and searchable" and carried a baked
// literal of 256 entries. THE TREE HAS 315 PAGES. Joined against the v3227 drawers: 52 assigned pages were not
// in the index AT ALL -- roundhouse, device, models, gates, instruments, ct, fanbeam, kerr, kepler, ising,
// schrodinger, ship, changelog, AND page-index.html ITSELF. It was generated once and never regenerated.
//
// *** THE SAME SHAPE AS EVERYTHING ELSE THIS SESSION: MODES in nine files, the gate-file walk in three, a
// mesher's liveness in four, the stated runtimes in 59 of 82. THE SECOND COPY IS NEVER THE ONE THAT GETS
// UPDATED -- and here the second copy was the page whose entire job is being the complete list. ***
//
// AND IT CARRIED A SECOND GROUPING. Its `g` field said "other" for 150 of 256 pages while pageSections.mjs now
// says which drawer each page lives in; seven pages had a real drawer and an "other" in the index. TWO ANSWERS
// TO ONE QUESTION, in one tree, never compared. The group now COMES FROM the registry rather than being typed
// beside it, so they cannot disagree.
//
// pageReach has counted 315 every round while page-index claimed 256. Two counts of one thing, and nobody had
// ever put them side by side -- which is this project's most repeated defect and the reason the gate that ships
// with this builder compares them directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allPages } from "../pageReach.mjs";
import { SECTIONS } from "./pageSections.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

/** Which drawer claims this page, or "" -- DERIVED from the one registry, never typed beside it. */
function groupOf(file) {
    for (const s of SECTIONS) if (s.pages.includes(file)) return s.id;
    return "";
}

/**
 * The <title>, with the site prefix trimmed.
 *
 * READ FROM THE PAGE, NOT FROM A TABLE. A hand-written label beside a file is the same second copy this whole
 * round is about: rename the page and the label keeps the old name, confidently.
 */
function titleOf(abs, file) {
    let src = "";
    try { src = fs.readFileSync(abs, "utf8"); } catch { return file; }
    const m = src.match(/<title>([\s\S]{0,200}?)<\/title>/i);
    if (!m) return file;
    return m[1].replace(/\s+/g, " ").replace(/^SweK\s*(Engine)?\s*[\u2014\u00b7:-]\s*/i, "").trim() || file;
}

/**
 * v3623 -- THE ONE-LINE SUMMARY, READ FROM THE PAGE, NOT INVENTED HERE.
 *
 * <meta name="demo:desc"> was written at v822 for a "universal viewer discovery" feature and NOTHING HAS EVER
 * READ IT SINCE -- 120 of 355 pages already carry a real, hand-written description and it went straight to
 * `d: ""` on every one of them. This is the same shape titleOf() already solved for <title>: read the page,
 * never a table kept beside it that a rename would leave stale.
 *
 * *** THE 235 PAGES WITHOUT ONE ARE LEFT AS "" ON PURPOSE. Writing a summary for a page NOBODY HAS READ HERE
 * would be FABRICATING PROVENANCE -- inventing a description and shipping it as if it were the page's own is
 * exactly what this tree refuses to do with a config or a reference value. THE FRONT DOOR PRINTS THE COVERAGE (described / count) EVERY RUN so the gap
 * stays visible rather than getting papered over; filling any of the missing pages is a per-page judgement,
 * never a sweep -- v3202 is this tree's own memory of what a scripted mass rewrite costs. ***
 */
export function descOf(abs, file) {
    let src = "";
    try { src = fs.readFileSync(abs, "utf8"); } catch { return ""; }
    const m = src.match(/<meta\s+name="demo:desc"\s+content="([^"]*)"/i);
    if (!m) return "";
    return m[1].replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
                .replace(/\s+/g, " ").trim();
}

export function buildPageIndex(root = ROOT) {
    const files = allPages(root).map((p) => path.basename(p)).sort();
    const pages = files.map((f) => ({
        f,
        t: titleOf(path.join(root, f), f),
        d: descOf(path.join(root, f), f),
        g: groupOf(f),
        p: 0,
    }));
    return { version: 1, generated: "derived by tools/ship/buildPageIndex.mjs -- DO NOT HAND-EDIT, the group comes from tools/ship/pageSections.mjs", count: pages.length, pages };
}

if (import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1] || "").href) {
    const out = buildPageIndex();
    const dest = path.join(ROOT, "page-index.json");
    fs.writeFileSync(dest, JSON.stringify(out, null, 1) + "\n");
    const grouped = out.pages.filter((p) => p.g).length;
    const described = out.pages.filter((p) => p.d).length;
    console.log("[buildPageIndex] " + out.count + " pages -> page-index.json (" + grouped + " in a drawer, " +
                (out.count - grouped) + " ungrouped)");
    console.log("[buildPageIndex] UNGROUPED IS A TO-DO LIST, NOT A CATEGORY. The old table called 150 pages");
    console.log("[buildPageIndex] \"other\", which reads like a decision; an empty group reads like the question");
    console.log("[buildPageIndex] it actually is.");
    console.log("[buildPageIndex] " + described + " of " + out.count + " pages carry a demo:desc summary -- " +
                 "read from <meta name=\"demo:desc\">, never invented here. The rest are \"\", reported, not filled.");
}
