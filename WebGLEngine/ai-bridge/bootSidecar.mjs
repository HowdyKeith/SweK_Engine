// WebGLEngine/ai-bridge/bootSidecar.mjs — v3285
// ---------------------------------------------------------------------------------------------------------------
// WORK DONE BEFORE THE PAGE ASKS FOR IT — a contract for handing slow boot work to a helper process, so startup
// reads a file instead of talking to the outside world.
//
// THE SHAPE IS ALREADY THIS TREE'S: installHistory reads main.js's mtime; page-index.json is derived and
// rebuilt; the .xyzones sidecar validates against size and mtime before reuse. "Does a report exist, and is it
// newer than its inputs" is a well-worn contract here. A boot that reads a file cannot block the event loop,
// because there is nothing to block on.
//
// THE CANDIDATES ARE THE ONES THAT TALK TO THE OUTSIDE WORLD: mDNS browsing several service types, the
// credential vault read, spawning go2rtc, walking a 100-entry install catalog. NONE of those need to be fresh at
// the instant a page loads. A discovery snapshot from thirty seconds ago is as good as one from now -- and if it
// is stale, the server refreshes it AFTER the page is up, which is the v3272 lesson.
//
// THREE RULES, and the third is the one that matters most:
//
//   1. PORTABLE BY CONSTRUCTION. PowerShell is a producer, not the contract. A Windows-only fix would leave the
//      Mac half of the fleet unmeasured, so the report is plain timestamped JSON any producer can write -- a
//      shell script, the bridge itself, a scheduled task.
//
//   2. STALENESS IS A STATED FACT, NEVER A SILENT ONE. The reader distinguishes THREE states out loud: no report
//      / report older than its inputs / fresh. "No radar contacts" and "the radar is off" are different claims,
//      and conflating them has bitten this tree four times.
//
//   3. A SIDECAR CARRIES A MEASUREMENT AND NEVER A VERDICT. This is the rule the phone already lives under (the
//      device measures, the desktop grades) and the one the proposer registry enforces. A helper that writes
//      {"ok": true} and is believed has moved the grading to the least supervised process in the fleet. So
//      verdict-shaped keys are REFUSED at read time, not ignored: a producer that tries to grade is a bug in the
//      producer, and silently dropping the field would hide it.
//
// AND ITS COROLLARY, which v3284's peer round made concrete: A FILE THE SERVER TRUSTS AT BOOT IS A TRUST
// SURFACE. Anything that can write it controls part of startup. So the reader validates before use, and a
// malformed report is treated as ABSENT rather than as data -- fail closed, same as the peer path.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";

export const SCHEMA_VERSION = 1;

// Keys a producer must not send. These are the shapes a verdict takes when someone is being helpful.
const VERDICT_KEYS = ["ok", "pass", "passed", "failed", "healthy", "status", "verdict", "valid", "success", "result"];

export const STATE_MISSING = "missing";
export const STATE_STALE = "stale";
export const STATE_FRESH = "fresh";
export const STATE_INVALID = "invalid";

/**
 * Build a report. Producers written in Node use this; producers written in PowerShell or shell emit the same
 * JSON shape by hand, which is why the shape is small and boring.
 */
export function makeReport({ kind, producedBy, inputs = {}, observations = [], producedAt = null }) {
    if (!kind || !producedBy) throw new Error("makeReport: kind and producedBy are required (an anonymous report cannot be audited)");
    for (const o of observations) {
        const bad = Object.keys(o || {}).filter((k) => VERDICT_KEYS.includes(k.toLowerCase()));
        if (bad.length) throw new Error("makeReport: observations carry measurements, never verdicts -- refused keys: " + bad.join(", "));
    }
    return { schemaVersion: SCHEMA_VERSION, kind, producedBy,
             producedAt: producedAt || new Date().toISOString(), inputs, observations };
}

/**
 * Read and classify a report. `inputs` maps a name to a path whose mtime the report claimed to be derived from;
 * if any input is newer than the report, the report is STALE. Returns a state and an explanation in every case,
 * because a caller that cannot tell missing from stale will treat both as "fine".
 */
export function readReport(reportPath, { inputs = {}, maxAgeMs = null, now = Date.now() } = {}) {
    let raw, stat;
    try { stat = fs.statSync(reportPath); raw = JSON.parse(fs.readFileSync(reportPath, "utf8")); }
    catch (e) {
        const missing = e && (e.code === "ENOENT" || e.code === "ENOTDIR");
        return { state: missing ? STATE_MISSING : STATE_INVALID, report: null, ageMs: null,
                 why: missing ? "no report at " + reportPath + " -- the work has not been done, which is NOT the same as it having found nothing"
                              : "report unreadable (" + String((e && e.message) || e).slice(0, 80) + ") -- treated as ABSENT, not as data" };
    }
    const problems = [];
    if (!raw || typeof raw !== "object") problems.push("not an object");
    else {
        if (raw.schemaVersion !== SCHEMA_VERSION) problems.push("schemaVersion " + raw.schemaVersion + " (this reader speaks " + SCHEMA_VERSION + ")");
        if (!raw.kind) problems.push("no kind");
        if (!raw.producedBy) problems.push("no producedBy -- an anonymous report cannot be audited");
        if (!raw.producedAt || Number.isNaN(Date.parse(raw.producedAt))) problems.push("no usable producedAt");
        if (!Array.isArray(raw.observations)) problems.push("observations is not an array");
        else for (const o of raw.observations) {
            const bad = Object.keys(o || {}).filter((k) => VERDICT_KEYS.includes(k.toLowerCase()));
            if (bad.length) { problems.push("observation carries a VERDICT (" + bad.join(", ") + ") -- a sidecar measures, the server grades"); break; }
        }
    }
    if (problems.length) return { state: STATE_INVALID, report: null, ageMs: null,
        why: "malformed report treated as ABSENT (fail closed): " + problems.join("; ") };

    const producedMs = Date.parse(raw.producedAt);
    const ageMs = now - producedMs;
    const staleBecause = [];
    for (const [name, p] of Object.entries(inputs)) {
        try { const st = fs.statSync(p); if (st.mtimeMs > producedMs) staleBecause.push(name + " changed after the report was made"); }
        catch { staleBecause.push(name + " could not be checked -- assuming stale"); }
    }
    if (maxAgeMs != null && ageMs > maxAgeMs) staleBecause.push("older than the permitted age (" + Math.round(ageMs / 1000) + "s)");
    if (staleBecause.length) return { state: STATE_STALE, report: raw, ageMs,
        why: "report exists but is stale: " + staleBecause.join("; ") + " -- usable as a hint, and the server should refresh AFTER the page is up" };
    return { state: STATE_FRESH, report: raw, ageMs, why: "fresh: produced " + Math.round(ageMs / 1000) + "s ago by " + raw.producedBy };
}

/** One line for an operator or a panel. Never collapses the three states into two. */
export function reportLine(r) {
    if (r.state === STATE_FRESH) return "fresh (" + Math.round(r.ageMs / 1000) + "s old, by " + r.report.producedBy + ")";
    if (r.state === STATE_STALE) return "STALE (" + Math.round(r.ageMs / 1000) + "s old) -- " + r.why;
    if (r.state === STATE_MISSING) return "NO REPORT -- the work has not been done (this is not 'nothing found')";
    return "INVALID REPORT -- " + r.why;
}
