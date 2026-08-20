// tools/ship/corpus.mjs
//
// Run: node tools/ship/corpus.mjs           (report what a corpus would contain)
//      node tools/ship/corpus.mjs --write   (emit WebGLEngine/corpus.txt)
//
// v3099 -- A RESEARCH AGENT NEEDS TEXT, AND THE DASHBOARD IS NOT TEXT.
//
// Keith, working out why local-deep-researcher pointed at server.html would not work: "server.html is a live
// dashboard -- it renders from API calls at runtime, so a crawler fetching it gets an empty shell with a script
// tag." That is exactly right and it is worth a number. MEASURED: server.html is 480,729 bytes and yields
// 17,937 bytes after script, style and tags are stripped -- 3.7% -- and what survives is menu labels and button
// captions. A crawler pointed at it reads a navigation bar.
//
// Meanwhile BACKLOG.md is 2,097,347 bytes of prose about why every decision was made. THE TEXT WAS NEVER
// MISSING; it was never SERVED as text. This assembles the sources Keith named -- the changelog, the knowledge
// index, the claim ledger -- into one plain file a crawler can actually read.
//
// SERVED, NOT JUST WRITTEN. --write emits into WebGLEngine/, which the bridge already serves statically, so the
// artifact has a URL (http://host:8787/corpus.txt) rather than being a file somebody has to know to look for.
// EVERY TOOL NEEDS A FRONT DOOR, and for a thing whose entire purpose is to be fetched, the front door IS the
// URL -- a page rendering it would be the dashboard problem again.
//
// WHAT IT DELIBERATELY DOES NOT DO: no summarising, no ranking, no "relevant excerpts". A research agent does
// its own reading; a corpus that pre-decided what mattered would be answering the question it was fetched to
// help with. It concatenates, labels the provenance of each block, and stops.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
const ROOT = path.resolve(ENG, "..");

const readOr = (p, fallback = "") => { try { return fs.readFileSync(p, "utf8"); } catch { return fallback; } };

/**
 * How much of a file is text a crawler would actually get? Strips script and style ELEMENTS (not just tags --
 * their contents are the point), then all remaining markup. Returns bytes and the ratio.
 *
 * This is the measurement that makes the case, and it is applied to the corpus itself as well as to the
 * dashboard, because a corpus that scored badly here would be the same failure with a different filename.
 */
// *** v3900 -- THIS DELETED 95% OF THE CHANGELOG AND THE CORPUS SHIPPED THAT WAY. ***
//
// MEASURED, stage by stage, on BACKLOG.md: raw 3,631,148 -> after the <script> rule 183,515. THREE POINT FOUR
// MILLION CHARACTERS, 95% of the file, removed by ONE regex. The <tag> rule took 7,605 more and whitespace
// collapse 899, so the arrow notation this file's own note blamed was never the problem.
//
// `/<script[\s\S]*?<\/script>/gi` needs a literal `<script` and a later `</script>`. THE CHANGELOG DISCUSSES
// `<script src>` -- boundaryLint's remote-script rule is about exactly that -- so one mention plus a closing
// tag thousands of lines further down swallows every version in between. *** THIS IS v3126'S LESSON IN A NEW
// FILE: *** orphanScan hit the identical shape with `/\*[\s\S]*?\*\//g` deleting 965,179 of 1,345,736
// characters of server.js, learned that a non-greedy span anchored on text that appears in PROSE is a
// guillotine, and rewrote its stripper line-wise. This function kept the defect.
//
// *** AND THE REAL COST WAS NOT THE RATIO, IT WAS THE CORPUS. *** This module exists so a research agent can
// fetch the project's reasoning as text; the gate's own headline is "THE TEXT WAS NEVER MISSING, it was never
// served as text". It was being served, with 95% of it silently removed.
//
// SO THE HTML RULES ARE APPLIED TO HTML AND NOTHING ELSE. textYield had ONE body doing TWO jobs -- measuring a
// dashboard (where stripping tags is the whole point) and measuring a Markdown+JSON corpus (where there are no
// tags to strip and every < is prose). TWO THINGS WEARING ONE LABEL, which is this tree's most repeated shape.
// The caller says which it has; it always knew.
export function textYield(src, { html = true } = {}) {
    const raw = String(src);
    const stripped = (html
        ? raw
            // BOUNDED, NOT LINE-WISE: a real <script> block's opening tag ends on its own line, so requiring
            // the match to reach `>` before the body starts stops a bare `<script src>` in prose from opening
            // a span. A page whose script tags are malformed is not the case this measurement is for.
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
            .replace(/<[^>]+>/g, " ")
        : raw)
        .replace(/\s+/g, " ")
        .trim();
    return { bytes: raw.length, text: stripped.length, ratio: raw.length ? stripped.length / raw.length : 0 };
}

/** The first of these paths that is on disk, or the first one as-written so the caller reports it missing. */
function firstThatExists(paths) {
    for (const p of paths) { try { if (fs.statSync(p).isFile()) return p; } catch { /* try the next */ } }
    return paths[0];
}

/** The sources, each with WHY it is in here. A block with no stated reason is a block nobody can prune later. */
export function corpusSources() {
    return [
        { id: "changelog", file: path.join(ROOT, "BACKLOG.md"),
          why: "the reasoning behind every version -- what was tried, what it measured, and what was rejected. " +
               "The largest body of prose in the project and the only place the NEGATIVE results live." },
        { id: "todo", file: path.join(ROOT, "TODO.md"),
          why: "one line per version saying what the next person needs to know, which is the index into the above." },
        { id: "knowledge-index", file: path.join(ENG, "knowledge-index.json"),
          why: "the derived map of gates and claims -- what the tree checks and what it asserts, machine-built." },
        { id: "status", file: path.join(ROOT, "STATUS.md"),
          why: "the regenerated snapshot of where the build stands." },
        // v3900 -- RESOLVED, NOT ASSUMED. This pointed at ROOT and the file lives in "Root Utils/", so the
        // corpus reported `missing: session-start` on every run -- here AND on Keith's rig, which is what
        // rules out a local layout quirk. The standing rules are the one source a newcomer is told to read
        // first, so shipping the corpus without them is the exact omission this module exists to prevent.
        // BOTH LOCATIONS ARE TRIED because a resolver that finds the file is worth more than a constant that
        // is right about where it ought to be; if neither exists it still reports missing rather than faking.
        { id: "session-start", file: firstThatExists([path.join(ROOT, "SESSION_START.md"),
                                                      path.join(ROOT, "Root Utils", "SESSION_START.md")]),
          why: "the standing rules a newcomer is expected to read first." },
    ];
}

export function buildCorpus() {
    const blocks = [], missing = [];
    for (const s of corpusSources()) {
        const raw = readOr(s.file, null);
        if (raw === null) { missing.push(s.id); continue; }
        blocks.push(
            "=".repeat(78) + "\n" +
            "SOURCE: " + s.id + "\n" +
            "FILE:   " + path.relative(ROOT, s.file).replace(/\\/g, "/") + "\n" +
            "WHY:    " + s.why + "\n" +
            "BYTES:  " + raw.length + "\n" +
            "=".repeat(78) + "\n\n" + raw.trim() + "\n");
    }
    const header =
        "SweK Engine -- text corpus for research agents\n" +
        "Generated by tools/ship/corpus.mjs. Plain text on purpose: server.html is a live dashboard and yields\n" +
        "about 3.7% text to a crawler, nearly all of it button captions. Everything below is prose or derived\n" +
        "data, each block labelled with where it came from and why it is included.\n" +
        "NOT summarised, NOT ranked, NOT excerpted -- a corpus that pre-decided what mattered would be answering\n" +
        "the question it was fetched to help with.\n\n";
    return { text: header + blocks.join("\n"), blocks: blocks.length, missing };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const { text, blocks, missing } = buildCorpus();
    // the corpus is Markdown and JSON -- there is no markup in it, and every `<` is prose
    const y = textYield(text, { html: false });
    const dash = textYield(readOr(path.join(ENG, "server.html")));
    console.log("[corpus] " + blocks + " blocks, " + text.length + " bytes");
    console.log("[corpus] text yield " + (100 * y.ratio).toFixed(1) + "%  vs server.html " + (100 * dash.ratio).toFixed(1) + "%");
    if (missing.length) console.log("[corpus] MISSING (skipped, not faked): " + missing.join(", "));
    if (process.argv.includes("--write")) {
        const out = path.join(ENG, "corpus.txt");
        fs.writeFileSync(out, text);
        console.log("[corpus] wrote " + path.relative(ROOT, out).replace(/\\/g, "/") + " -- served at /corpus.txt");
    } else {
        console.log("[corpus] dry run. Add --write to emit WebGLEngine/corpus.txt");
    }
    process.exit(missing.length ? 1 : 0);
}
