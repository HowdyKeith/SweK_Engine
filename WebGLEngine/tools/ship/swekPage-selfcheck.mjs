// tools/ship/swekPage-selfcheck.mjs
//
// Run: node tools/ship/swekPage-selfcheck.mjs
// RUNTIME 118ms MEASURED (median of 3 -- 121/118/116 ms). It reads githubBridge.js's catalog and opens each
// distinct target page once.
//
// v4019 -- Keith, after I told him the Coolify button pointed at hosting.html: "so i wonder what the true
// Coolify page is so i can look at that?"
//
// *** hosting.html SAYS "COOLIFY" ZERO TIMES. *** githubBridge.js's service catalog lets each entry declare
// `swekPage` -- the SweK page a reader is sent to for that service -- and server.html's portfolio button used
// it. The link resolved. The page rendered. It simply did not contain the subject it promised, and that is
// exactly why it survived: a 404 gets noticed in a day, a link to the WRONG PAGE gets noticed when somebody
// finally follows it looking for the thing.
//
// SIX OF TWELVE ARE LIKE THIS, so this is not a Coolify story. It is the same species as v4018's two gate walks
// and v4016's launcher name, met a third time in two days: A DECLARED TARGET THAT NOTHING VERIFIES.
//
// WHAT THIS GATE DOES NOT DO IS PICK THE RIGHT PAGE. Where a service's controls belong is a design decision --
// Coolify's honest answer is "nowhere, its UI is its own dashboard on port 8000 after a Docker install" -- so
// the six are recorded in swekPage-baseline.json as debt, and the gate holds the line at six. It bites in BOTH
// directions, per v3202's rule that a stale suppression is an active blind spot: a NEW mismatch fails, and an
// entry that no longer describes one fails too, so paying the debt means DELETING the entry rather than
// quietly leaving it to swallow a future regression.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };

// Normalised containment: a page writes "Home Assistant", the catalog writes svcId "homeassistant", and those
// are the SAME NAME. Comparing raw would have failed Home Assistant, which is a real, correct declaration --
// a check that cries wolf on a good entry teaches everybody to ignore it.
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

const SRC = fs.readFileSync(path.join(ROOT, "ai-bridge", "githubBridge.js"), "utf8");
const BASELINE = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "ship", "swekPage-baseline.json"), "utf8"));

console.log("swekPage-selfcheck -- does the page a service points at actually mention that service?\n");

// ---------------------------------------------------------------------------
// Each catalog row is a flat object literal; the entries that matter all carry `repo:`.
const rows = [...SRC.matchAll(/\{[^{}]*?repo:\s*"([^"]+)"[^{}]*?\}/g)].map((m) => m[0]);
const field = (row, k) => (row.match(new RegExp(k + ':\\s*"([^"]+)"')) || [])[1] || "";

const declared = [];
for (const row of rows) {
    const swekPage = field(row, "swekPage");
    if (!swekPage) continue;
    declared.push({ swekPage, label: field(row, "label"), svcId: field(row, "svcId"), repo: field(row, "repo") });
}

console.log("1. *** EVERY DECLARED PAGE EXISTS AT ALL ***");
{
    ok("!! the catalog was parsed -- rows found and swekPage entries read", rows.length > 5 && declared.length > 5,
        rows.length + " catalog rows, " + declared.length + " declaring a swekPage" +
        (declared.length > 5 ? "" : "  *** a zero here makes every check below pass by accident ***"));
    const missing = declared.filter((d) => !fs.existsSync(path.join(ROOT, d.swekPage.replace(/^\//, ""))));
    ok("!! *** NO SERVICE POINTS AT A PAGE THAT IS NOT IN THE TREE ***", missing.length === 0,
        missing.length ? missing.map((m) => m.label + " -> " + m.swekPage).join("; ")
                       : "all " + declared.length + " targets exist on disk");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** AND THE PAGE ACTUALLY NAMES THE SERVICE IT WAS NOMINATED FOR ***");
const pageText = new Map();
const readPage = (p) => {
    if (!pageText.has(p)) {
        let t = ""; try { t = fs.readFileSync(path.join(ROOT, p.replace(/^\//, "")), "utf8"); } catch {}
        pageText.set(p, norm(t));
    }
    return pageText.get(p);
};
// A service is "named" if the page contains its svcId, the first word of its label, or its GitHub repo name --
// any one of the three spellings a page might reasonably use.
const namesIt = (d) => {
    const t = readPage(d.swekPage);
    if (!t) return false;
    return [d.svcId, d.label.split(/[ (]/)[0], (d.repo.split("/")[1] || "")]
        .filter(Boolean).map(norm).some((k) => k && t.includes(k));
};

const mismatched = declared.filter((d) => !namesIt(d));
// *** KEYED ON label + swekPage TOGETHER, AND THE FIRST DRAFT WAS KEYED ON LABEL ALONE. *** Caught by
// sabotaging this gate: re-pointing a baselined service at a DIFFERENT wrong page left it suppressed, because
// the label still matched. The suppression would then have been describing a mismatch that no longer existed
// at that path while silently covering a brand-new one -- v3202's "a stale suppression is an active blind
// spot", reproduced inside the very gate written to enforce it. A baseline entry approves ONE claim: this
// service, pointing at THIS page. Change either half and it is a different claim that has to earn its own line.
const key = (label, page) => label + " -> " + page;
const baselined = new Set(BASELINE.entries.map((e) => key(e.label, e.swekPage)));
{
    const fresh = mismatched.filter((d) => !baselined.has(key(d.label, d.swekPage)));
    ok("!! *** NO **NEW** SERVICE POINTS AT A PAGE THAT NEVER MENTIONS IT ***", fresh.length === 0,
        fresh.length ? "NEW MISMATCH: " + fresh.map((f) => key(f.label, f.swekPage)).join("; ") +
                       "  -- either point it at a page about the service, or add it to swekPage-baseline.json WITH A REASON"
                     : declared.length - mismatched.length + " of " + declared.length + " name their service; " +
                       mismatched.length + " known-debt, all listed in the baseline");

    // *** THE OTHER DIRECTION, WHICH IS THE ONE BASELINES USUALLY GET WRONG. *** v3202: a suppression that
    // stopped describing a real problem SILENTLY SWALLOWS the next real one. Paying the debt means deleting
    // the entry, and this is what makes that non-optional.
    const stale = [...baselined].filter((k) => !mismatched.some((m) => key(m.label, m.swekPage) === k));
    ok("!! ...and NO baseline entry has quietly stopped describing a mismatch", stale.length === 0,
        stale.length ? "STALE, DELETE THESE FROM swekPage-baseline.json: " + stale.join(", ") +
                       " -- they name their service now, which is the debt being PAID; recording that means removing the entry"
                     : "all " + baselined.size + " baseline entries still describe a real mismatch");

    ok("!! ...and the baseline's own count matches the list it carries",
        BASELINE.count === BASELINE.entries.length,
        "count says " + BASELINE.count + ", list holds " + BASELINE.entries.length);
}

// ---------------------------------------------------------------------------
console.log("\n3. *** THE DEBT, NAMED -- REPORTED, NOT ASSERTED ***");
for (const m of mismatched) {
    console.log("  ----  " + m.label.padEnd(18) + " -> " + m.swekPage +
                "   (page never says \"" + (m.svcId || m.label) + "\")");
}
if (!mismatched.length) console.log("  ----  none: every service's page names it.");

console.log("\n" + (fails ? fails + " FAILED" : "ALL PASS"));
process.exit(fails ? 1 : 0);
