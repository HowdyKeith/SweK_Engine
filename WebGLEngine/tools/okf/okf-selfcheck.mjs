// WebGLEngine/tools/okf/okf-selfcheck.mjs — v2623
//
// Run: node tools/okf/okf-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Emits the OKF bundle fresh and checks it CONFORMS to OKF v0.1. A knowledge bundle that claims to be OKF but
// puts a concept where a `type` is required, or frontmatter on a non-root index, is not portable -- the whole
// point of a format is that another agent can read it without knowing how we made it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitOKF } from "./emitOKF.mjs";
import { extractClaims } from "../ship/claimsGate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// parse a leading YAML frontmatter block: returns { has, keys:Set, raw } -- null-ish if none
function frontmatterOf(text) {
    if (!text.startsWith("---\n")) return { has: false, keys: new Set() };
    const end = text.indexOf("\n---", 4);
    if (end < 0) return { has: false, keys: new Set() };
    const block = text.slice(4, end);
    const keys = new Set();
    let type = null;
    for (const line of block.split("\n")) {
        const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (m) { keys.add(m[1]); if (m[1] === "type") type = m[2].trim().replace(/^["']|["']$/g, ""); }
    }
    return { has: true, keys, type };
}

const walk = (dir, out = []) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".md")) out.push(p);
    }
    return out;
};

// EMIT FRESH -- the gate checks generated output, so drift in the emitter cannot pass by checking a stale bundle.
const OUT = "/tmp/okf-selfcheck-bundle";
const version = (fs.readFileSync(path.join(ROOT, "main.js"), "utf8").match(/ENGINE_VERSION = "(v\d+)"/) || [, "v0000"])[1];
emitOKF(OUT, { version });
const files = walk(OUT);
const rel = (p) => "/" + path.relative(OUT, p).split(path.sep).join("/");

// ---- 1. EVERY CONCEPT HAS A NON-EMPTY type ------------------------------------------------------------------------
{
    const concepts = files.filter((f) => path.basename(f) !== "index.md" && path.basename(f) !== "log.md");
    const bad = concepts.filter((f) => { const fm = frontmatterOf(fs.readFileSync(f, "utf8")); return !fm.has || !fm.type; });
    ok("!! every concept declares a non-empty type", bad.length === 0,
       concepts.length + " concept files, " + bad.length + " missing a type. OKF REQUIRES EXACTLY ONE FIELD ON EVERY CONCEPT: type. A concept without it is not classifiable, and an agent reading the bundle cannot tell a claim from a doc." + (bad.length ? " Offenders: " + bad.slice(0, 3).map(rel).join(", ") : ""));
}

// ---- 2. index.md / log.md ARE RESERVED -- NOT CONCEPTS ------------------------------------------------------------
{
    const indexes = files.filter((f) => path.basename(f) === "index.md");
    const root = path.join(OUT, "index.md");
    // non-root index.md files MUST NOT carry frontmatter; the root index MAY carry ONLY okf_version (never type)
    const badIndex = indexes.filter((f) => {
        const fm = frontmatterOf(fs.readFileSync(f, "utf8"));
        if (f === root) return fm.type != null || !fm.keys.has("okf_version");
        return fm.has;   // non-root index with any frontmatter is non-conformant
    });
    const logs = files.filter((f) => path.basename(f) === "log.md");
    const badLog = logs.filter((f) => frontmatterOf(fs.readFileSync(f, "utf8")).type != null);
    ok("!! index.md and log.md are reserved, not concept documents", badIndex.length === 0 && badLog.length === 0,
       indexes.length + " index files + " + logs.length + " log file. The root index carries ONLY okf_version: \"0.1\"; other indexes carry no frontmatter; no reserved file declares a type. " + (badIndex.length + badLog.length) + " violations. Frontmatter on a non-root index would make a listing masquerade as a concept.");
}

// ---- 3. THE ROOT DECLARES okf_version 0.1 -------------------------------------------------------------------------
{
    const rootText = fs.readFileSync(path.join(OUT, "index.md"), "utf8");
    ok("!! the root index declares okf_version 0.1", /okf_version:\s*"?0\.1"?/.test(rootText),
       "the root index.md is the one place OKF permits index frontmatter, and it names the version the bundle conforms to. A consumer that does not see it cannot know which rules apply.");
}

// ---- 4. CROSS-LINKS ARE BUNDLE-RELATIVE AND RESOLVE ---------------------------------------------------------------
{
    let checked = 0, broken = 0, nonRel = 0;
    for (const f of files) {
        const text = fs.readFileSync(f, "utf8");
        for (const m of text.matchAll(/\]\((\/[^)]+\.md)\)/g)) {
            checked++;
            const target = path.join(OUT, m[1].slice(1));
            if (!fs.existsSync(target)) broken++;
        }
        // flag any internal .md link that is NOT bundle-relative (does not start with /)
        for (const m of text.matchAll(/\]\((?!\/)(?!https?:)([^):]+\.md)\)/g)) nonRel++;
    }
    ok("!! internal links are bundle-relative and resolve", checked > 0 && broken === 0 && nonRel === 0,
       checked + " internal links checked; " + broken + " broken, " + nonRel + " not bundle-relative. OKF PREFERS paths starting with / because they survive a file moving between subdirectories. Broken internal links here are our own dangling references, not the tolerated not-yet-written kind.");
}

// ---- 5. COMPLETENESS: EVERY CLAIM BECAME A CONCEPT -----------------------------------------------------------------
{
    const claims = extractClaims(fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8"));
    const claimFiles = files.filter((f) => f.includes(path.sep + "claims" + path.sep) && path.basename(f) !== "index.md");
    ok("!! every claim in predictions.html became exactly one concept", claimFiles.length === claims.length,
       claims.length + " claims in predictions.html -> " + claimFiles.length + " claim concepts. A DROPPED CLAIM IS A SILENTLY SHRUNK KNOWLEDGE BASE -- the bundle would look complete while missing exactly the claim someone needed. Slug collisions are disambiguated, not merged.");
}

// ---- 6. EVERY COMPONENT POINTS AT REAL CODE, AND THE BRAIN IS ONE OF THEM -----------------------------------------
{
    const compFiles = files.filter((f) => f.includes(path.sep + "components" + path.sep) && path.basename(f) !== "index.md");
    let phantom = [], brainOk = false;
    for (const f of compFiles) {
        const text = fs.readFileSync(f, "utf8");
        const res = (text.match(/^resource:\s*(.+)$/m) || [])[1];
        // resource points at a file relative to the install root (WebGLEngine/...). It MUST exist in the tree.
        // strip YAML quotes -- a path with a hyphen (ai-bridge) gets quoted by the emitter.
        const rel = res ? res.trim().replace(/^["']|["']$/g, "") : null;
        const abs = rel ? path.join(ROOT, "..", rel) : null;
        if (!abs || !fs.existsSync(abs)) phantom.push(path.basename(f) + " -> " + (res || "(no resource)"));
        if (/title:\s*GPU Brain/.test(text) && /\/claims\//.test(text)) brainOk = true;
    }
    ok("!! every component concept resolves to a real file, and the GPU Brain is modelled + linked to its claims", compFiles.length >= 5 && phantom.length === 0 && brainOk,
       compFiles.length + " components, " + phantom.length + " phantom; GPU Brain present and linked=" + brainOk + ". A COMPONENT THAT DESCRIBES CODE THAT ISN'T THERE IS A LIE THE KNOWLEDGE BASE TELLS ABOUT ITSELF." + (phantom.length ? " Phantom: " + phantom.slice(0, 3).join(", ") : ""));
}

console.log(fails ? "\nokf-selfcheck: " + fails + " FAILED" : "\nokf-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
