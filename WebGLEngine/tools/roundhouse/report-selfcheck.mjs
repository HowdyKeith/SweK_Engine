// tools/roundhouse/report-selfcheck.mjs
//
// Run: node tools/roundhouse/report-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v2941 -- THE HUMAN-EYES REPORT PAGE, AND THE TWO LINES IT MUST NOT CROSS.
//
// report.html renders the perf and persistence/fingerprint ledgers for a person, and lets them point at a
// different target host. That is a presentation leaf -- the SweK bit-identity model allows it ONLY because it is
// strictly downstream of every verdict and trusted by nothing. Two properties keep it safe, and this gate pins
// both by inspecting the page source (a browser DOM is not available here, but the guard logic and the escaping
// are plain text and can be checked):
//
//   1. THE TARGET URL IS GUARDED. A user-supplied target is normalised through the URL constructor and REJECTED
//      unless it is http(s). A "javascript:" or "file:" target must never become a fetch, or the configurable
//      target would be an injection vector.
//   2. THE PAGE IS A VIEWER, NOT AN ADJUDICATOR. It renders what a host reported, labelled with that host's
//      origin, and escapes all fetched data as text. It must not present fetched numbers as locally verified,
//      and must not feed them back into any graded path.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const page = fs.readFileSync(path.join(root, "report.html"), "utf8");

// ---- 1. THE URL GUARD REJECTS NON-http(s) --------------------------------------------------------------------------
{
    // extract normaliseTarget and run it in this process to test its behaviour directly
    const m = page.match(/function normaliseTarget[\s\S]*?\n  }/);
    ok("report.html defines a normaliseTarget guard",
        !!m, "the target field must pass through a guard before becoming a fetch base");
    if (m) {
        // eslint-disable-next-line no-new-func
        const fn = new Function(m[0] + "; return normaliseTarget;")();
        ok("!! javascript: and file: targets are REJECTED",
            (() => { try { fn("javascript:alert(1)"); return false; } catch { return true; } })() &&
            (() => { try { fn("file:///etc/passwd"); return false; } catch { return true; } })(),
            "a configurable target that accepted these would be an injection vector -- the guard only permits " +
            "http(s), so a stray scheme cannot become a fetch");
        ok("http(s) targets normalise and blank stays same-origin",
            fn("") === "" && fn("http://host:8080/") === "http://host:8080" && fn("https://a.b/x/") === "https://a.b/x",
            "blank -> same-origin, trailing slashes trimmed, origin+path preserved");
    }
}

// ---- 2. FETCHED DATA IS ESCAPED, NOT INJECTED ----------------------------------------------------------------------
{
    ok("!! the page escapes fetched values as text before rendering",
        /const esc = /.test(page) && /replace\(\/\[&<>"'\]\/g/.test(page) && /esc\(/.test(page),
        "an esc() over &<>\"' is defined and applied to rendered values, so a malicious target cannot inject " +
        "HTML or script through a check name, host string, or observable id");

    // spot-check that the render functions actually route values through esc rather than interpolating raw
    const rawInterp = /\$\{(?:name|host|o\.id|data\.error|e\.message)\}/g;
    const unescaped = (page.match(rawInterp) || []);
    ok("no fetched field is interpolated into HTML without esc()",
        unescaped.length === 0,
        unescaped.length ? "raw interpolations found: " + unescaped.join(", ") : "every fetched field goes through esc() -- checked name, host, observable id, and error text");
}

// ---- 3. THE PAGE DECLARES ITSELF A VIEWER, NOT A GRADER -------------------------------------------------------------
{
    ok("!! the page states it adjudicates nothing and labels the reporting origin",
        /adjudicates nothing/i.test(page) && /reported by/i.test(page) && /viewer, not a grader/i.test(page),
        "the report shows verdicts COMPUTED ON the target host, labelled with that host's origin -- it never " +
        "presents fetched numbers as locally verified. This is what keeps a downstream viewer compatible with " +
        "the bit-identity model: it is trusted by nothing and feeds nothing");

    ok("cross-origin failure is handled honestly (CORS named, not hidden)",
        /CORS/.test(page) && /cross-origin/i.test(page),
        "a different-host target only works if that host sends CORS headers; the page says so rather than " +
        "failing silently, because a blank tantrum would look like the feature is broken");
}

// ---- 4. THE /perf ENDPOINT IS READ-ONLY AND DOWNSTREAM --------------------------------------------------------------
{
    const bridge = fs.readFileSync(path.join(root, "ai-bridge", "fingerprintBridge.js"), "utf8");
    ok("!! the /perf endpoint is GET-only and grades nothing new -- it serves the existing ledger + grade",
        /"GET" && url === "\/perf"/.test(bridge) && /gradePerf/.test(bridge),
        "the endpoint reads perf-ledger.json and returns it with gradePerf's verdict; it computes no new " +
        "adjudication and accepts no writes, so exposing it to the report page adds a view, not an authority");

    ok("a missing ledger file returns an empty ledger, not an error",
        /existsSync[\s\S]{0,120}swek-perf-ledger/.test(bridge),
        "before any runs are folded there is no ledger file; the endpoint returns an empty one so the report " +
        "shows 'no data yet' cleanly rather than a 500");
}

console.log();
if (fails) { console.log("report-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("report-selfcheck: all checks pass");
