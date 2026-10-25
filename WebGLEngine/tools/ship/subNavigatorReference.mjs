// WebGLEngine/tools/ship/subNavigatorReference.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/subNavigator-selfcheck.mjs)
//
// THE REFERENCE ARM OF RUNG 4a, MEASURED (brain/SUBMARINE_WIP.md, "the REFERENCE ARM": registered before tools/subNavigator.mjs was written). On the audit sets of rung 4a (`auditSets(30000)` through tools/ship/trainSubState.mjs's setsOf) and with the same
// windows every circuit meets, three autopilots are flown ONCE, nothing selected:  CLEAN (no dropout), DROPOUT (the autopilot behind the compass dropout, as the study report prints it) and NAVIGATOR (tools/subNavigator.mjs behind it).
// The derived number is the FRACTION OF THE GAP CLOSED, per audit:  G = (score - DROPOUT) / (CLEAN - DROPOUT).  It is printed for the navigator, and with --stage-a for the cx champion and each family's mean. NOT in the verdict.
//   node tools/ship/subNavigatorReference.mjs run --out brain/flyCxReference.json [--audit-base 30000] [--smoke]       (refuses a file that exists: the arm is read once)
//   node tools/ship/subNavigatorReference.mjs report --in brain/flyCxReference.json [--stage-a brain/flyCxStageA.jsonl]
// Pure apart from the files it reads and writes. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import * as T from "../../brain/subTask.mjs";
import * as A from "../../brain/autopilotSub.mjs";
import * as D from "../subDropout.mjs";
import { navigator } from "../subNavigator.mjs";
import { setsOf, headingErrorByWindow, AUDIT_BASE, AUDITS, FAMILIES, effectiveOf, readRecords, meanOf } from "./trainSubState.mjs";

export const READ_AS = Object.freeze({ closes: 0.5 });
const SETS = { audit: "audit", safetyAudit: "safetyAudit", reserve: "reserve" };

/** The three autopilots on one set: { clean, dropout, navigator } (the mean dive score of each). */
export function flyThree(set) {
    return { clean: T.evaluate(A.pilot(), set).score, dropout: T.evaluate(D.dropout(A.pilot()), set).score, navigator: T.evaluate(D.dropout(navigator(A.pilot())), set).score };
}
/** The fraction of the gap closed: (score - dropout) / (clean - dropout); null when the dropout costs nothing on the set (no gap to close). */
export const gapClosed = (score, ref) => (ref.clean - ref.dropout > 0 ? (score - ref.dropout) / (ref.clean - ref.dropout) : null);
/** The reference record for the sets: { auditBase, smoke, scores: { audit, safetyAudit, reserve }, gap: { audit, ... }, mechanism: { autopilot, navigator } }. */
export function measure(sets, { auditBase = AUDIT_BASE, smoke = false } = {}) {
    const scores = {}, gap = {};
    for (const a of AUDITS) { scores[a] = flyThree(sets[SETS[a]]); gap[a] = gapClosed(scores[a].navigator, scores[a]); }
    return { auditBase: smoke ? null : auditBase, smoke: !!smoke, scores, gap, mechanism: { autopilot: headingErrorByWindow(A.pilot(), sets.audit), navigator: headingErrorByWindow(navigator(A.pilot()), sets.audit) } };
}
const f4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(4));
const f2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? "n/a" : v.toFixed(2));
/** The lines of the report; `records` (the stage A results) adds the cx champion and each family's mean as a fraction of the same gap. */
export function reportLines(ref, records = null) {
    const lines = [`the reference arm (a hand-written dead-reckoning navigator with a perfect gyro behind the compass dropout; audits ${ref.smoke ? "a few throwaway dives" : "base " + ref.auditBase}), once, nothing selected:`];
    for (const a of AUDITS) lines.push(`  ${a}: clean autopilot ${f4(ref.scores[a].clean)} | autopilot through the dropout ${f4(ref.scores[a].dropout)} | NAVIGATOR through the dropout ${f4(ref.scores[a].navigator)}  -> fraction of the gap closed ${f2(ref.gap[a])}`);
    const m = ref.mechanism;
    lines.push(`  mean heading error inside the dark windows (audit dives): the autopilot ${f4(m.autopilot.dark)}, the navigator ${f4(m.navigator.dark)}`);
    const reads = AUDITS.every((a) => ref.gap[a] !== null && ref.gap[a] >= READ_AS.closes);
    lines.push(`  READ AS (fixed in brain/SUBMARINE_WIP.md before it was run): ${AUDITS.some((a) => ref.gap[a] === null) ? "no gap to close on an audit: nothing to read" : reads ? `the navigator closes at least ${READ_AS.closes} of the gap on all three audits: dead reckoning recovers most of what the dropout costs and the headroom is real; a circuit is read against it` : `the navigator closes LESS than ${READ_AS.closes} of the gap on at least one audit: a plain gyro integral does not recover most of the cost, the headroom was overstated`}`);
    if (records && records.length) {
        const rows = [];
        const cx = records.find((r) => r.family === "cx");
        if (cx) rows.push(["cx champion", effectiveOf(cx)]);
        for (const fam of FAMILIES) { const rs = records.filter((r) => r.family === fam); if (rs.length) rows.push([`${fam} mean of ${rs.length}`, Object.fromEntries(AUDITS.map((a) => [a, meanOf(rs.map((r) => effectiveOf(r)[a]))]))]); }
        lines.push("  fraction of the same gap closed by the stage A circuits (not in the verdict):");
        for (const [name, e] of rows) lines.push(`    ${name}: ` + AUDITS.map((a) => `${a} ${f2(gapClosed(e[a], ref.scores[a]))}`).join(" | "));
    }
    return lines;
}

export function parseArgs(argv) {
    const [cmd, ...rest] = argv;
    if (cmd !== "run" && cmd !== "report") throw new Error(`the first word must be run or report, got ${JSON.stringify(cmd)}`);
    const known = cmd === "run" ? { out: String, "audit-base": Number, smoke: Boolean } : { in: String, "stage-a": String }, given = {};
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i]; if (!a.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(a)}`);
        const k = a.slice(2); if (!(k in known)) throw new Error(`unknown option ${JSON.stringify(a)} (known for ${cmd}: ${Object.keys(known).map((n) => "--" + n).join(", ")})`);
        if (known[k] === Boolean) given[k] = true; else { const v = rest[++i]; if (v == null || v.startsWith("--")) throw new Error(`${a} needs a value`); given[k] = known[k] === Number ? Number(v) : v; if (known[k] === Number && !Number.isFinite(given[k])) throw new Error(`${a} needs a number, got ${JSON.stringify(v)}`); }
    }
    if (cmd === "report") { if (!given.in) throw new Error("report needs --in <reference file>"); return { cmd, in: given.in, stageA: given["stage-a"] || null }; }
    if (!given.out) throw new Error("run needs --out <reference file>");
    return { cmd, out: given.out, auditBase: given["audit-base"] ?? AUDIT_BASE, smoke: !!given.smoke };
}
/** The command as a function; `io` is for the gate: { out, err, readFile, writeFile, exists, measure }. Returns the exit code: 0, 1 a refusal while running, 2 a bad argument. */
export async function command(argv, io = {}) {
    const out = io.out || ((m) => console.log(m)), err = io.err || ((m) => console.error(m)), readFile = io.readFile || ((f) => fs.readFileSync(f, "utf8")), writeFile = io.writeFile || ((f, t) => fs.writeFileSync(f, t)), exists = io.exists || fs.existsSync;
    let o; try { o = parseArgs(argv); } catch (e) { err("subNavigatorReference: " + e.message); return 2; }
    if (o.cmd === "run") {
        if (exists(o.out)) { err(`subNavigatorReference: ${o.out} exists: the reference arm is read once on these audits -- use another --out to read it again on purpose`); return 1; }
        const ref = (io.measure || measure)(setsOf({ auditBase: o.auditBase, smoke: o.smoke }), { auditBase: o.auditBase, smoke: o.smoke });
        writeFile(o.out, JSON.stringify(ref) + "\n");
        for (const l of reportLines(ref)) out(l);
        return 0;
    }
    let ref, records = null;
    try { ref = JSON.parse(readFile(o.in)); } catch (e) { err("subNavigatorReference: cannot read " + o.in + ": " + e.message); return 1; }
    if (o.stageA) { try { records = readRecords(readFile(o.stageA)); } catch (e) { err("subNavigatorReference: cannot read " + o.stageA + ": " + e.message); return 1; } }
    for (const l of reportLines(ref, records)) out(l);
    return 0;
}
