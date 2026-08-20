// WebGLEngine/tools/okf/emitOKF.mjs — v2623
//
// Emit the engine's self-knowledge as a conformant Open Knowledge Format (OKF v0.1) bundle -- a directory of
// markdown files with YAML frontmatter that any agent can read and any git repo can host.
//
// ---- WHY -----------------------------------------------------------------------------------------------------------
//
// The engine already IS a knowledge corpus: predictions.html carries 92 falsifiable claims, each with a
// prediction, what was measured, and a kill condition; docs/ carries the round notes; STATUS/SHIP carry the
// current state. That is exactly the shape OKF standardises -- one concept per file, a required `type` in the
// frontmatter, cross-links that turn the folder into a graph. So this does not INVENT knowledge; it puts the
// knowledge the engine already keeps into a portable, agent-readable envelope: a portfolio artifact, and a
// better SESSION_START for the next session to consume.
//
// ---- CONFORMANCE (OKF v0.1, verified against the spec, not assumed) ------------------------------------------------
//
//   * A bundle is a directory tree of markdown files; one concept = one file; the path is its identity.
//   * Every CONCEPT frontmatter MUST have a non-empty `type` (the only required field). Optional reserved
//     fields: title, description, resource, tags, timestamp.
//   * index.md and log.md are RESERVED -- never concept documents. Frontmatter on an index is permitted ONLY on
//     the root index.md, carrying okf_version: "0.1".
//   * Concepts cross-link with ordinary markdown links; bundle-relative paths (/claims/foo.md) are preferred.
//   * Producers SHOULD favour structural markdown (headings, lists) over free prose.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractClaims } from "../ship/claimsGate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

// slug: a stable, path-safe identity for a concept, derived from its title.
export function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "untitled";
}

// YAML-safe scalar: quote anything with a character YAML would misread, and escape embedded quotes.
function yamlStr(s) {
    const v = String(s == null ? "" : s);
    if (v === "" || /[:#\-?\[\]{},&*!|>'"%@`]/.test(v) || /^\s|\s$/.test(v)) return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    return v;
}

function frontmatter(fields) {
    const lines = ["---"];
    for (const [k, val] of Object.entries(fields)) {
        if (val == null) continue;
        if (Array.isArray(val)) lines.push(k + ": [" + val.map(yamlStr).join(", ") + "]");
        else lines.push(k + ": " + yamlStr(val));
    }
    lines.push("---");
    return lines.join("\n");
}

// Build one claim concept. The claim's own kill condition is what makes it a real concept and not a wish:
// OKF wants honest, structured knowledge, and a claim that cannot be proven wrong is not knowledge.
function claimDoc(c) {
    const body = [];
    body.push("# " + (c.name || "Untitled claim"));
    body.push("");
    body.push("- **Status:** " + c.state + "  \n- **Since:** " + (c.since || "?"));
    body.push("");
    if (c.pred) { body.push("## Prediction"); body.push(""); body.push(c.pred); body.push(""); }
    if (c.why) { body.push("## Why"); body.push(""); body.push(c.why); body.push(""); }
    if (c.measured) { body.push("## Measured"); body.push(""); body.push(c.measured); body.push(""); }
    if (c.kill) { body.push("## Kill condition"); body.push(""); body.push(c.kill); body.push(""); }
    // Citations: where the evidence lives. A claim without a pointer to its evidence is an assertion.
    const cites = [];
    if (c.where) cites.push("- Code: " + c.where);
    if (c.page) cites.push("- Page: `" + c.page + "`");
    cites.push("- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.");
    body.push("# Citations");
    body.push("");
    body.push(cites.join("\n"));
    body.push("");
    const fm = frontmatter({
        type: "claim",
        title: c.name || "Untitled claim",
        description: (c.pred || "").slice(0, 180),
        tags: [c.state, "swek-engine", c.since].filter(Boolean),
        timestamp: c.since || null,
    });
    return fm + "\n\n" + body.join("\n");
}

// index.md files carry NO frontmatter (except the root, handled separately): they are structural listings.
function listingIndex(title, intro, entries) {
    const b = ["# " + title, "", intro, ""];
    for (const [label, href, note] of entries) b.push("- [" + label + "](" + href + ")" + (note ? " -- " + note : ""));
    b.push("");
    return b.join("\n");
}

// The engine's real subsystems. Each is PINNED to a key file that MUST exist (the gate checks), so a component
// can never describe phantom code. These become first-class OKF concepts (type: component) cross-linked to the
// claims that reference them -- so the GPU Brain is a thing you can point to, not a word scattered across claims.
// `keys` are matched (case-insensitive) against each claim's name + where; that is how the graph edges are found.
const COMPONENTS = [
    { name: "GPU Brain", file: "brain/brain.js", keys: ["brain/", "gpu brain", "flow field", "espilot", "policy mlp", "dijkstra", "brain-bench", "brain weight"],
      desc: "The navigation and policy brain: a GPU flow-field pathfinder, a CPU Dijkstra field it is benchmarked against (CPU is the measured default), and a policy MLP. Drives NPC/ship locomotion and tactics." },
    { name: "box3d Physics", file: "physics/box3d/box3dLoader.js", keys: ["box3d", "lockstep", "fingerprint", "cross-arch determinism", "substep"],
      desc: "The rigid-body physics core: a clang-built WASM box3d with its libm compiled in, giving cross-platform-deterministic simulation, wired for lockstep peer sync and a canonical determinism fingerprint." },
    { name: "OKF Service", file: "ai-bridge/okfBridge.js", keys: ["okf", "/okf/", "knowledge base", "okfconsume", "session brief"],
      desc: "The engine's self-knowledge as a service: it emits its claims and docs as an OKF v0.1 bundle, serves it at /okf/, and consumes its own bundle to produce a session brief." },
    { name: "Peer Services Registry", file: "ai-bridge/servicesBridge.js", keys: ["services registry", "/services", "peer-service", "servicesbridge", "mac-services", "each box offers"],
      desc: "A registry of what every box on the LAN exposes: this box's services plus each reachable peer's, so a Mac running Rockxy is discoverable next to this engine's OKF endpoint." },
    { name: "strict-libm", file: "tools/strictMath.mjs", keys: ["strict", "host-free", "hypot", "log2", "atan2", "krbn", "grep", "cody-waite"],
      desc: "Host-Math-free, byte-deterministic sin/cos/hypot/log2/atan2 -- computed by construction with no host transcendental, so a render is identical across platforms. The structural fix for Krbn's per-platform drift." },
    { name: "Fracture Engine", file: "fx/fracture/cellFracture.js", keys: ["fracture", "shatter", "voronoi", "debris"],
      desc: "Real-time Voronoi cluster fracture: shatters a mesh into shards at an impact point and steps the debris, wired into the blob avatar and herd scenes." },
    { name: "Incremental Update", file: "ai-bridge/incrementalUpdate.js", keys: ["incremental", "swek-incremental", "makeincremental", "auto update", "self-update"],
      desc: "The self-update path: ingests one swek-incremental JSON package, backs up, applies, validates the patched module graph, rolls back if broken, stamps the version, and restarts." },
];

// A component concept: what it is, the file it lives in (as the OKF `resource`), and links to its claims.
function componentDoc(comp, claimList) {
    const b = ["# " + comp.name, "", comp.desc, ""];
    b.push("## Implemented in", "", "- `WebGLEngine/" + comp.file + "`", "");
    b.push("## Claims about this component (" + claimList.length + ")", "");
    if (claimList.length) for (const c of claimList) b.push("- [" + (c.name || "?") + "](/claims/" + c._slug + ".md) -- " + c.state);
    else b.push("_No claim references this component yet._");
    b.push("");
    const fm = frontmatter({
        type: "component",
        title: comp.name,
        description: comp.desc.slice(0, 180),
        resource: "WebGLEngine/" + comp.file,   // OKF reserved field: where the concept's subject actually lives
        tags: ["swek-engine", "component"],
    });
    return fm + "\n\n" + b.join("\n");
}

export function emitOKF(outDir, opts = {}) {
    const version = opts.version || "v0000";
    const html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
    const claims = extractClaims(html);

    // wipe + recreate the bundle dir so a removed claim does not leave a stale file behind
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(outDir, "claims"), { recursive: true });
    fs.mkdirSync(path.join(outDir, "docs"), { recursive: true });

    // --- claims: one concept per claim ---
    const byState = { settled: [], open: [], broken: [] };
    const usedSlugs = new Set();
    for (const c of claims) {
        let s = slug(c.name);
        while (usedSlugs.has(s)) s += "-x";     // path is identity -> collisions must not silently merge two claims
        usedSlugs.add(s);
        c._slug = s;
        fs.writeFileSync(path.join(outDir, "claims", s + ".md"), claimDoc(c));
        (byState[c.state] || (byState[c.state] = [])).push(c);
    }
    // claims/index.md -- grouped listing, no frontmatter
    {
        const b = ["# Claims", "", "Every claim the SweK Engine makes about itself, each with a kill condition -- the thing that would prove it wrong. " + claims.length + " total.", ""];
        for (const st of ["settled", "open", "broken"]) {
            const list = byState[st] || [];
            b.push("## " + st + " (" + list.length + ")", "");
            for (const c of list) b.push("- [" + (c.name || "?") + "](/claims/" + c._slug + ".md) -- " + (c.since || ""));
            b.push("");
        }
        fs.writeFileSync(path.join(outDir, "claims", "index.md"), b.join("\n"));
    }

    // --- components: one concept per subsystem, cross-linked to the claims that reference it ---
    fs.mkdirSync(path.join(outDir, "components"), { recursive: true });
    const compEntries = [];
    for (const comp of COMPONENTS) {
        const cs = slug(comp.name);
        const hayMatch = (c) => {
            const hay = ((c.name || "") + " " + (c.where || "")).toLowerCase();
            return comp.keys.some((k) => hay.includes(k.toLowerCase()));
        };
        const matched = claims.filter(hayMatch);
        fs.writeFileSync(path.join(outDir, "components", cs + ".md"), componentDoc(comp, matched));
        compEntries.push([comp.name, "/components/" + cs + ".md", matched.length + " claims"]);
    }
    fs.writeFileSync(path.join(outDir, "components", "index.md"),
        listingIndex("Components", "The engine's subsystems, each pinned to real code and linked to the claims about it.", compEntries));

    // --- docs: wrap each round doc as a concept (type: doc) ---
    const docsDir = path.join(ROOT, "docs");
    const docFiles = fs.existsSync(docsDir) ? fs.readdirSync(docsDir).filter((f) => f.endsWith(".md")) : [];
    for (const f of docFiles) {
        const raw = fs.readFileSync(path.join(docsDir, f), "utf8");
        const title = (raw.match(/^#\s+(.+)$/m) || [, f.replace(/\.md$/, "")])[1].trim();
        const fm = frontmatter({ type: "doc", title, tags: ["swek-engine", "round-doc"] });
        fs.writeFileSync(path.join(outDir, "docs", f), fm + "\n\n" + raw);
    }
    fs.writeFileSync(path.join(outDir, "docs", "index.md"),
        listingIndex("Round documents", "Design notes written during the engine's rounds, " + docFiles.length + " in all.",
            docFiles.map((f) => [f.replace(/\.md$/, ""), "/docs/" + f])));

    // --- engine.md: the top-level concept ---
    const settled = (byState.settled || []).length, open = (byState.open || []).length, broken = (byState.broken || []).length;
    const engine = frontmatter({
        type: "system",
        title: "SweK Engine",
        description: "A multi-runtime WebGL2/WebGPU/Node LAN portfolio engine with a verify-gate ship ritual.",
        tags: ["swek-engine", version],
        timestamp: version,
    }) + "\n\n" + [
        "# SweK Engine",
        "",
        "A multi-runtime WebGL2 / WebGPU / Node engine, shipped as numbered builds through a hard-fail verify gate. Its differentiator is verification discipline: nothing ships that a gate has not checked.",
        "",
        "## What this bundle contains",
        "",
        "- [/claims/index.md](/claims/index.md) -- " + (settled + open + broken) + " falsifiable claims (" + settled + " settled, " + open + " open, " + broken + " broken), each with the measurement that supports it and the condition that would prove it wrong.",
        "- [/components/index.md](/components/index.md) -- the engine's subsystems, each pinned to real code and linked to its claims.",
        "- [/docs/index.md](/docs/index.md) -- round-by-round design notes.",
        "- [/log.md](/log.md) -- version history.",
        "",
        "## The one law",
        "",
        "A control that cannot fail is decoration. Every claim here carries a kill condition for that reason.",
        "",
    ].join("\n");
    fs.writeFileSync(path.join(outDir, "engine.md"), engine);

    // --- log.md: change history, derived from claims by version (reserved file, defined structure) ---
    {
        const byVer = new Map();
        for (const c of claims) {
            const v = c.since || "?";
            if (!byVer.has(v)) byVer.set(v, []);
            byVer.get(v).push(c);
        }
        const vers = [...byVer.keys()].sort((a, b) => (parseInt(b.replace(/\D/g, "")) || 0) - (parseInt(a.replace(/\D/g, "")) || 0));
        const b = ["# Log", "", "Version history, newest first, derived from the claims recorded at each build.", ""];
        for (const v of vers) {
            for (const c of byVer.get(v)) b.push("- **" + v + "** [" + c.state + "] " + (c.name || ""));
        }
        b.push("");
        fs.writeFileSync(path.join(outDir, "log.md"), b.join("\n"));
    }

    // --- root index.md: the ONLY index permitted frontmatter, and only okf_version ---
    const rootIndex = frontmatter({ okf_version: "0.1" }) + "\n\n" + [
        "# SweK Engine -- Open Knowledge bundle",
        "",
        "An OKF v0.1 knowledge bundle generated from the engine's own records at build " + version + ".",
        "",
        "- [/engine.md](/engine.md) -- what the engine is.",
        "- [/claims/index.md](/claims/index.md) -- the falsifiable claims and their evidence.",
        "- [/components/index.md](/components/index.md) -- the subsystems, each pinned to real code.",
        "- [/docs/index.md](/docs/index.md) -- round design notes.",
        "- [/log.md](/log.md) -- version history.",
        "",
        "Generated by tools/okf/emitOKF.mjs. Conformance checked by tools/okf/okf-selfcheck.mjs.",
        "",
    ].join("\n");
    fs.writeFileSync(path.join(outDir, "index.md"), rootIndex);

    return { claims: claims.length, docs: docFiles.length, dir: outDir };
}

// CLI: node tools/okf/emitOKF.mjs [outDir]
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const out = process.argv[2] || path.join(ROOT, "okf");
    const version = (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/) || [, "v0000"])[1];
    const r = emitOKF(out, { version });
    console.log("OKF bundle: " + r.claims + " claims + " + r.docs + " docs -> " + r.dir);
}
