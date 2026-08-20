// WebGLEngine/tools/okf/okfConsume.mjs — v2625
//
// CONSUME the OKF bundle -- read it the way an external agent would, and turn it into something useful.
//
// ---- WHY -----------------------------------------------------------------------------------------------------------
//
// v2623 emitted the bundle, v2624 served it. Keith asked the sharp question: are we USING it? We were not. A
// knowledge base that is written and served but never read is write-only -- decoration with an HTTP route. So
// this reads it back.
//
// The one discipline that makes this real: THIS CONSUMER READS THE OKF SURFACE, NOT predictions.html. It parses
// frontmatter and the "## Kill condition" body sections of the concept files -- exactly what a stranger's agent
// would do with a bundle it mounted or fetched, knowing nothing about how we produced it. If it reached back
// into the source HTML it would be cheating: using our data, not the format. It does not.
"use strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Parse one OKF concept: split the leading YAML frontmatter from the markdown body, and index the body's
// "## Heading" sections. Minimal YAML -- OKF frontmatter is flat scalars and one-line arrays.
export function parseConcept(text) {
    const fm = { };
    let body = text;
    if (text.startsWith("---\n")) {
        const end = text.indexOf("\n---", 4);
        if (end >= 0) {
            const block = text.slice(4, end);
            body = text.slice(end + 4).replace(/^\s*\n/, "");
            for (const line of block.split("\n")) {
                const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
                if (!m) continue;
                let v = m[2].trim();
                if (v.startsWith("[") && v.endsWith("]")) v = v.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
                else v = v.replace(/^["']|["']$/g, "");
                fm[m[1]] = v;
            }
        }
    }
    // index body sections by their "## heading"
    const sections = {};
    const parts = body.split(/^##\s+/m);
    for (let i = 1; i < parts.length; i++) {
        const nl = parts[i].indexOf("\n");
        const head = parts[i].slice(0, nl < 0 ? undefined : nl).trim();
        sections[head] = (nl < 0 ? "" : parts[i].slice(nl + 1)).trim();
    }
    return { frontmatter: fm, body, sections };
}

const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
};

/**
 * Read an OKF bundle directory and produce a brief: what the engine is, the claim tally by state, the OPEN
 * claims that still need adjudicating (each with the kill condition that would settle it), and recent log lines.
 * Works on ANY OKF bundle whose concepts use type=claim -- it keys off the format, not our schema.
 */
export function consumeBundle(dir) {
    const brief = { engine: null, tally: { settled: 0, open: 0, broken: 0, other: 0, total: 0 }, openClaims: [], recentLog: [] };
    for (const f of walk(dir)) {
        const base = path.basename(f);
        if (base === "index.md") continue;
        const text = fs.readFileSync(f, "utf8");
        if (base === "log.md") {
            brief.recentLog = text.split("\n").filter((l) => l.startsWith("- ")).slice(0, 12).map((l) => l.replace(/^- /, "").trim());
            continue;
        }
        const { frontmatter: fm, sections } = parseConcept(text);
        const type = fm.type;
        if (type === "system" && !brief.engine) brief.engine = { title: fm.title || "", description: fm.description || "" };
        if (type !== "claim") continue;
        const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
        const state = ["settled", "open", "broken"].find((s) => tags.includes(s)) || "other";
        brief.tally[state]++; brief.tally.total++;
        if (state === "open") {
            brief.openClaims.push({
                title: fm.title || base.replace(/\.md$/, ""),
                since: fm.timestamp || "",
                kill: (sections["Kill condition"] || "").split("\n")[0].slice(0, 200),
            });
        }
    }
    brief.openClaims.sort((a, b) => (parseInt((b.since || "").replace(/\D/g, "")) || 0) - (parseInt((a.since || "").replace(/\D/g, "")) || 0));
    return brief;
}

/** Render the brief as a markdown session brief -- the thing the next session (or a peer, or Keith) reads to orient. */
export function briefMarkdown(brief) {
    const b = [];
    b.push("# " + (brief.engine ? brief.engine.title : "Engine") + " -- session brief");
    b.push("");
    if (brief.engine) b.push("> " + brief.engine.description, "");
    b.push("## Claims: " + brief.tally.total + " total -- " + brief.tally.settled + " settled, " + brief.tally.open + " open, " + brief.tally.broken + " broken");
    b.push("");
    b.push("## Open claims to adjudicate (" + brief.openClaims.length + ")");
    b.push("");
    for (const c of brief.openClaims) b.push("- **" + c.title + "** (" + (c.since || "?") + ")  \n  settles when: " + (c.kill || "(no kill condition recorded)"));
    b.push("");
    if (brief.recentLog.length) { b.push("## Recent log"); b.push(""); for (const l of brief.recentLog.slice(0, 8)) b.push("- " + l); b.push(""); }
    b.push("_Generated by consuming the OKF bundle -- read from the format, not the source._");
    return b.join("\n");
}

// CLI: node tools/okf/okfConsume.mjs [bundleDir]  (emits the bundle first if not given)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    let dir = process.argv[2];
    if (!dir) { const m = await import("./emitOKF.mjs"); dir = "/tmp/okf-consume-cli"; m.emitOKF(dir, { version: "cli" }); }
    console.log(briefMarkdown(consumeBundle(dir)));
}
