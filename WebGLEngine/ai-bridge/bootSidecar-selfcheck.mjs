// WebGLEngine/ai-bridge/bootSidecar-selfcheck.mjs — v3936 (was v3285)
//
// Run: node ai-bridge/bootSidecar-selfcheck.mjs   (~0.1s — MEASURED; real temp files, no mocks)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// Three rules under test: the three states are never collapsed into two, a sidecar may not grade, and anything
// malformed is treated as ABSENT rather than as data. The last one is the trust rule from v3284 pointed at a
// file instead of a peer: whatever can write this controls part of boot.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeReport, readReport, reportLine, SCHEMA_VERSION,
         STATE_MISSING, STATE_STALE, STATE_FRESH, STATE_INVALID } from "./bootSidecar.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "swek-sidecar-"));
const REPORT = path.join(dir, "discovery.json");
const INPUT = path.join(dir, "catalog.json");
const write = (o) => fs.writeFileSync(REPORT, JSON.stringify(o, null, 2));

// ---- 1. MISSING IS NOT EMPTY -------------------------------------------------------------------------------------
{
    const r = readReport(REPORT);
    ok("!! no report reads as MISSING, and says the work has not been done (not 'nothing found')",
       r.state === STATE_MISSING && /NOT the same as it having found nothing/i.test(r.why), reportLine(r));
}

// ---- 2. A FRESH REPORT ---------------------------------------------------------------------------------------------
{
    fs.writeFileSync(INPUT, "{}");
    const rep = makeReport({ kind: "swek-discovery-snapshot", producedBy: "powershell/discover.ps1",
        inputs: { catalog: INPUT }, observations: [{ service: "_http._tcp", hosts: 3 }, { service: "_go2rtc._tcp", hosts: 0 }] });
    write(rep);
    const r = readReport(REPORT, { inputs: { catalog: INPUT } });
    ok("a well-formed report newer than its inputs reads FRESH, and names its producer",
       r.state === STATE_FRESH && r.report.producedBy === "powershell/discover.ps1", reportLine(r));
    ok("!! ...and ZERO HOSTS IS A MEASUREMENT that survives the round trip (an empty result is data, not absence)",
       r.report.observations.find((o) => o.service === "_go2rtc._tcp").hosts === 0,
       "the empty-radar distinction only works if an empty observation is preserved as an observation");
}

// ---- 3. STALENESS IS STATED, IN BOTH ITS FORMS -----------------------------------------------------------------------
{
    // an input touched after the report was made
    const later = Date.now() + 5000;
    fs.utimesSync(INPUT, later / 1000, later / 1000);
    const r = readReport(REPORT, { inputs: { catalog: INPUT } });
    ok("!! an input newer than the report makes it STALE, and the reason names the input",
       r.state === STATE_STALE && /catalog changed/.test(r.why), reportLine(r));
    ok("...and a stale report is still RETURNED, because a hint from 30s ago beats blocking the boot",
       r.report !== null && r.report.observations.length === 2,
       "the v3272 lesson: use it, then refresh after the page is up");
    // an input that cannot be checked is assumed stale, never assumed fine
    const r2 = readReport(REPORT, { inputs: { gone: path.join(dir, "does-not-exist") } });
    ok("!! an input that cannot be checked is assumed STALE (a check that cannot run must not report success)",
       r2.state === STATE_STALE && /assuming stale/.test(r2.why));

    // ---- v3936: THE TIE, CONSTRUCTED RATHER THAN HOPED FOR --------------------------------------------------------
    // Section 2 above wrote the input and stamped the report from Date.now() back to back, and whether those two
    // landed in the SAME MILLISECOND was left to luck. On Keith's box they tied and section 2 went red with
    // "STALE (0s old) -- catalog changed after the report was made"; on the authoring box they did not, so the gate
    // was green here while the bug was live in the field. A FIXTURE THAT ONLY SOMETIMES REACHES THE CASE IS NOT A
    // TEST OF THAT CASE -- it reports the timing of the box it ran on. So the tie is now BUILT: the input's mtime is
    // set to the report's own whole millisecond plus a fraction, which is exactly what a producer racing its own
    // inputs produces. producedAt is an ISO string and carries WHOLE ms; mtimeMs is a float and carries a fraction.
    {
        const tieMs = Date.now();
        fs.writeFileSync(REPORT, JSON.stringify({ schemaVersion: SCHEMA_VERSION, kind: "swek-discovery-snapshot",
            producedBy: "tie-fixture", producedAt: new Date(tieMs).toISOString(), observations: [] }, null, 2));
        fs.writeFileSync(INPUT, "{}");
        fs.utimesSync(INPUT, (tieMs + 0.7) / 1000, (tieMs + 0.7) / 1000);
        const tied = fs.statSync(INPUT).mtimeMs;
        // The precondition is ASSERTED, not assumed: utimesSync takes SECONDS, so the mtime you get is not always
        // the mtime you asked for. A fixture that failed to land would otherwise pass as a result.
        ok("   [precondition] the fixture really did construct a same-millisecond tie",
           Math.floor(tied) === tieMs && tied > tieMs, tied + " vs producedMs " + tieMs);
        ok("!! an input touched in the report's OWN MILLISECOND reads FRESH, not stale",
           readReport(REPORT, { inputs: { catalog: INPUT } }).state === STATE_FRESH,
           "the two sides carry different resolution -- comparing a float mtime against a whole-ms ISO stamp made a "
           + "zero-second-old report report itself stale, which is the tell");

        // ...and the floor that fixes it must be a RESOLUTION MATCH, never a tolerance. One whole millisecond later
        // is a real change and must still read STALE, or the fix has bought section 2 by breaking this section.
        let bumped = 0;
        for (let b = 1; b <= 3 && Math.floor(bumped) !== tieMs + 1; b += 0.25) {
            fs.utimesSync(INPUT, (tieMs + b) / 1000, (tieMs + b) / 1000);
            bumped = fs.statSync(INPUT).mtimeMs;
        }
        ok("   [precondition] the fixture really did land on the NEXT whole millisecond",
           Math.floor(bumped) === tieMs + 1, bumped + " floors to " + Math.floor(bumped));
        ok("!! ...and ONE WHOLE MILLISECOND later is still STALE -- the floor is a resolution match, not a tolerance",
           readReport(REPORT, { inputs: { catalog: INPUT } }).state === STATE_STALE,
           "a floor that swallowed a real change would hide staleness everywhere rather than in a tie");
    }
    // plain age expiry
    // age alone, with a report genuinely made ten minutes ago (the first attempt used a report a millisecond
    // old against a 1ms limit, which is a race rather than a test)
    fs.utimesSync(INPUT, Date.now() / 1000 - 600, Date.now() / 1000 - 600);
    write(makeReport({ kind: "k", producedBy: "p", producedAt: new Date(Date.now() - 600e3).toISOString(),
                       inputs: {}, observations: [{ service: "_http._tcp", hosts: 1 }] }));
    const r3 = readReport(REPORT, { inputs: { catalog: INPUT }, maxAgeMs: 60e3 });
    ok("age alone can make a report stale when a caller demands freshness",
       r3.state === STATE_STALE && /older than the permitted age/.test(r3.why), reportLine(r3));
    const r4 = readReport(REPORT, { inputs: { catalog: INPUT } });
    ok("...and the same report is FRESH when no age limit is demanded (freshness is the caller's question to ask)",
       r4.state === STATE_FRESH);
}

// ---- 4. A SIDECAR MAY NOT GRADE ---------------------------------------------------------------------------------------
{
    let threw = false;
    try { makeReport({ kind: "k", producedBy: "p", observations: [{ service: "_http._tcp", ok: true }] }); } catch { threw = true; }
    ok("!! a producer cannot even BUILD a report containing a verdict key",
       threw, "the helper measures; the server grades -- this is the rule the phone already lives under");

    // and a hand-written report that sneaks one past is refused at READ time, not silently stripped
    write({ schemaVersion: SCHEMA_VERSION, kind: "k", producedBy: "hand-written.ps1", producedAt: new Date().toISOString(),
            inputs: {}, observations: [{ service: "_http._tcp", healthy: true }] });
    const r = readReport(REPORT);
    ok("!! ...and one written by hand is REFUSED at read time rather than quietly ignored",
       r.state === STATE_INVALID && /VERDICT/.test(r.why),
       "silently dropping the field would hide a producer that is trying to grade — which is a bug in the producer");
}

// ---- 5. FAIL CLOSED: A FILE THE SERVER TRUSTS AT BOOT IS A TRUST SURFACE ------------------------------------------------
{
    for (const [label, body] of [
        ["not JSON at all", "}{ this is not json"],
        ["JSON but not an object", "[1,2,3]"],
        ["no producedBy", JSON.stringify({ schemaVersion: SCHEMA_VERSION, kind: "k", producedAt: new Date().toISOString(), observations: [] })],
        ["future schema", JSON.stringify({ schemaVersion: 99, kind: "k", producedBy: "p", producedAt: new Date().toISOString(), observations: [] })],
        ["unusable timestamp", JSON.stringify({ schemaVersion: SCHEMA_VERSION, kind: "k", producedBy: "p", producedAt: "whenever", observations: [] })],
    ]) {
        fs.writeFileSync(REPORT, body);
        const r = readReport(REPORT);
        ok("malformed report (" + label + ") is treated as ABSENT, never as data",
           r.state === STATE_INVALID && r.report === null, r.why.slice(0, 110));
    }
}

// ---- 6. PORTABLE BY CONSTRUCTION ------------------------------------------------------------------------------------------
{
    // a report a shell script could emit with no Node anywhere: plain JSON, no Node-specific types
    const handWritten = `{ "schemaVersion": ${SCHEMA_VERSION}, "kind": "swek-discovery-snapshot",
        "producedBy": "sh/discover.sh", "producedAt": "${new Date().toISOString()}",
        "inputs": {}, "observations": [ { "service": "_http._tcp", "hosts": 2 } ] }`;
    fs.writeFileSync(REPORT, handWritten);
    const r = readReport(REPORT);
    ok("!! a report hand-emitted by a shell script reads identically to one built in Node",
       r.state === STATE_FRESH && r.report.producedBy === "sh/discover.sh",
       "PowerShell is a producer, not the contract — a Windows-only fix would leave the Mac half of the fleet unmeasured");
}

// ---- 7. the operator line never collapses three states into two ------------------------------------------------------------
{
    const lines = [
        reportLine({ state: STATE_MISSING, why: "x" }),
        reportLine({ state: STATE_STALE, ageMs: 60000, why: "y" }),
        reportLine({ state: STATE_INVALID, why: "z" }),
    ];
    ok("missing, stale and invalid each read differently to a human",
       new Set(lines.map((l) => l.split(" ")[0])).size === 3, lines.join(" | "));
}

try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(fails ? ("[bootSidecar-selfcheck] FAILED " + fails) : "[bootSidecar-selfcheck] all passed");
process.exit(fails ? 1 : 0);
