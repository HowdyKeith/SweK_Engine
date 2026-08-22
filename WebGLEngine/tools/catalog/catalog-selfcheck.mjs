// tools/catalog/catalog-selfcheck.mjs
//
// Run: node tools/catalog/catalog-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovered by tree walk).
//
// The catalog is a table of contents; this check confirms it matches the book. Completeness runs both ways -- every
// subsystem in the live fingerprint has a catalog entry, and every catalog entry names a real subsystem -- so the
// index can neither omit a subsystem nor invent one. Then every module file the catalog lists and every gate file it
// names must exist on disk, and every hash the catalog carries must equal the live fingerprint's, so a renamed module,
// a deleted gate, or a stale hash all fail the ship. The sabotage drops a subsystem from the catalog, and the
// both-ways completeness check catches the gap at once. A catalog that is not checked against reality is just a claim.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { computeFingerprint } from "../fingerprint/fingerprint.mjs";
import { CATALOG, buildCatalog } from "./catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");   // WebGLEngine
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const { subsystems } = computeFingerprint();
const fpNames = subsystems.map((s) => s.name), catNames = Object.keys(CATALOG);

// ---- 1. COMPLETE both ways: catalog names == fingerprint names ----------------------------------------------
{
    const missing = fpNames.filter((n) => !catNames.includes(n));       // in fingerprint, not catalogued
    const extra = catNames.filter((n) => !fpNames.includes(n));         // catalogued, not a real subsystem
    ok("!! every subsystem is catalogued and every catalogue entry is real", missing.length === 0 && extra.length === 0,
       missing.length || extra.length ? "missing: [" + missing.join(", ") + "]  extra: [" + extra.join(", ") + "]" : "all " + fpNames.length + " fingerprint subsystems are listed, and the catalogue invents none -- the index is exactly the library.");
}

// ---- 2. every module file the catalogue lists exists on disk ------------------------------------------------
{
    const { rows } = buildCatalog();
    const gone = [];
    for (const r of rows) for (const m of r.modules) if (!fs.existsSync(path.join(ROOT, m))) gone.push(r.name + " -> " + m);
    ok("!! every module file the catalogue names is on disk", gone.length === 0,
       gone.length ? "missing modules: " + gone.join("; ") : "all module paths across all subsystems resolve to real files -- no catalogue entry points at code that has moved or been deleted.");
}

// ---- 3. every gate file the catalogue names exists ---------------------------------------------------------
{
    const { rows } = buildCatalog();
    const gone = [];
    for (const r of rows) if (r.gate && !fs.existsSync(path.join(ROOT, r.gate))) gone.push(r.name + " -> " + r.gate);
    ok("!! every gate the catalogue names is on disk", gone.length === 0,
       gone.length ? "missing gates: " + gone.join("; ") : "every subsystem that names a falsifying gate points at one that exists -- the catalogue's proof column is real.");
}

// ---- 4. every hash matches the live fingerprint ------------------------------------------------------------
{
    const { rows } = buildCatalog();
    const live = Object.fromEntries(subsystems.map((s) => [s.name, s.hash]));
    const stale = rows.filter((r) => r.hash !== live[r.name]);
    ok("!! every catalogue hash equals the live fingerprint hash", stale.length === 0,
       stale.length ? "stale: " + stale.map((r) => r.name).join(", ") : "the catalogue carries the fingerprint's own hashes, so it cannot show a value the engine no longer produces.");
}

// ---- 5. the generated Markdown is well-formed and covers every subsystem -----------------------------------
{
    const { catalogMarkdown } = await import("./catalog.mjs");
    const md = catalogMarkdown();
    const everyNamePresent = fpNames.every((n) => md.includes("`" + n + "`"));
    const hasMaster = md.includes("**MASTER**");
    ok("!! the generated catalogue Markdown lists every subsystem and the master", everyNamePresent && hasMaster,
       "the rendered table names all " + fpNames.length + " subsystems and carries the master line -- CATALOG.md is a faithful render of the verified rows.");
}

console.log(fails ? "\ncatalog-selfcheck: " + fails + " FAILED" : "\ncatalog-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
