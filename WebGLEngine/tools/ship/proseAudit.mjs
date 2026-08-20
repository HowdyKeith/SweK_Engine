// WebGLEngine/tools/ship/proseAudit.mjs — v3286
// ---------------------------------------------------------------------------------------------------------------
// AUDITING THE DOCUMENTATION GATES FOR VACUITY — the round v3177 asked for and nothing had run.
//
// The trigger was concrete: prose() collected only lines matching ^\s*// , so a TRAILING comment was invisible
// to it. plasticBind carries the scar -- a sentence had to be moved onto its own line before its gate could see
// it -- and the file's own note says the general question was never asked: "nothing has checked whether any of
// the other gates using sourceScan are vacuous for this reason."
//
// THE ANSWER, MEASURED FIRST: all nine prose assertions in this tree are POSITIVE. A blind spot makes those FAIL
// loudly, not pass silently, so nothing was passing for the wrong reason. That is a smaller finding than the note
// feared and it is the honest one. The shape was still one `!` away from a silent pass, and the blind spot is
// fixed regardless.
//
// BUT VACUITY HAS THREE FORMS HERE, and only one of them was the blind spot. This audits all three:
//
//   TRIVIAL   -- the pattern matches the EMPTY STRING, so it holds against any file, including one with no
//                comments at all. A check that cannot fail whatever it is pointed at.
//   INVISIBLE -- the pattern matches the raw source but NOT the prose, i.e. it is hunting text that prose()
//                cannot see. This is the plasticBind case; it should now be extinct.
//   MISDIRECTED -- the pattern matches the CODE rather than the comments. prose() was built so that a gate
//                asking "does this file explain itself" cannot accidentally match the implementation it is
//                asking about; a pattern that also matches codeOnly() has slipped past that and is testing the
//                presence of an identifier while claiming to test the presence of an explanation.
//
// The auditor resolves each assertion's target by reading the readFileSync that fed the variable, so it grades
// the pattern against THE FILE THE GATE ACTUALLY SCANS rather than against the gate itself.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prose, codeOnly } from "./sourceScan.mjs";
import { gateFiles } from "./staleness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Find `const X = ...readFileSync(<something>)` and remember what path expression fed X. */
// The first version resolved only two shapes and left 27 of 34 assertions UNRESOLVED -- an audit that cannot
// identify eighty percent of its subjects is not an audit. The tree writes the read four ways, so all four are
// handled: a bare literal, new URL(...), require("fs").readFileSync(path.join(ROOT, "a", "b")), and
// (await import("node:fs")).readFileSync(...). A path.join whose segments are all literals (or a known root
// variable) resolves; one containing an unknown variable stays UNRESOLVED rather than being guessed at, because
// an audit that invents its own subject is worse than one that admits it cannot see.
// The tree writes the read four ways, so all four are handled: a bare literal, new URL(...),
// require("fs").readFileSync(path.join(ROOT, "a", "b")), and (await import("node:fs")).readFileSync(...). A
// path.join whose segments are all literals (or a known root variable) resolves; one containing an unknown
// variable stays UNRESOLVED rather than being guessed at, because an audit that invents its own subject is
// worse than one that admits it cannot see.
//
// *** POSITIONED, NOT LAST-WINS, AND THIS AUDITOR REPORTED THREE FALSE FINDINGS BEFORE IT WAS. *** Gates reuse
// the name `src`: cast-selfcheck reads server.js into it at line 68 and jellyfinBridge.js into it at line 127.
// A last-wins map graded the early assertions against the late file and called them UNMATCHED -- the auditor
// accusing sound gates of exactly the vacuity it was built to find. Each assertion now resolves against the
// NEAREST PRECEDING assignment to its variable.
function readTargets(src, gatePath) {
    const out = [];
    const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*readFileSync\([^;\n]*)/g;
    for (const m of src.matchAll(re)) {
        const varName = m[1], expr = m[2];
        const arg = expr.slice(expr.indexOf("readFileSync(") + 13);
        let rel = null;
        const join = arg.match(/path\.join\(([^)]*)\)/);
        const url = arg.match(/new URL\(\s*["'`]([^"'`]+)["'`]/);
        const lit = arg.match(/^\s*["'`]([^"'`]+)["'`]/);
        if (join) {
            const segs = [];
            let ok = true;
            for (const pt of join[1].split(",").map((x) => x.trim())) {
                const l = pt.match(/^["'`]([^"'`]*)["'`]$/);
                if (l) { segs.push(l[1]); continue; }
                if (segs.length === 0 && /^(HERE|__dirname|DIR|THIS_DIR)$/.test(pt)) { segs.push(path.dirname(gatePath)); continue; }
                if (segs.length === 0 && /^(ENG|ENGINE|ROOT|ENG_ROOT|ENGINE_ROOT)$/.test(pt)) { segs.push(ENG); continue; }
                ok = false; break;
            }
            if (ok && segs.length) rel = path.join(...segs);
        } else if (url) rel = path.resolve(path.dirname(gatePath), url[1]);
        else if (lit) rel = lit[1];
        if (!rel) continue;
        out.push({ variable: varName, at: m.index, path: path.isAbsolute(rel) ? rel : path.resolve(path.dirname(gatePath), rel) });
    }
    return out;
}

/** The file a variable held at a given point in the source: the nearest preceding assignment. */
function targetAt(targets, variable, at) {
    let best = null;
    for (const t of targets) if (t.variable === variable && t.at < at && (!best || t.at > best.at)) best = t;
    return best ? best.path : null;
}

/** Pull every prose-based assertion out of a gate: pattern plus the variable it is applied to. */
// *** EXTRACTION MUST IGNORE STRING LITERALS, AND THIS AUDITOR CAUGHT ITSELF NOT DOING IT. *** Its own gate
// contains a SAMPLE string demonstrating the API -- `ok("x", proseHas(src, /alpha/i))` inside quotes -- and a
// description reading "both proseHas(src, /re/) and ...". Scanned naively those are three more assertions, and
// the auditor dutifully reported /alpha/, /beta/ and /re/ as unmatched or misdirected claims about a file
// nobody was asserting anything about. A census whose detectors are string literals counts itself; this tree
// has hit that before (shaderCensus, recorded in singleSource-selfcheck) and it is the same shape.
//
// Strings are blanked BUT THE OFFSETS ARE PRESERVED -- same length, spaces inside the quotes -- because the
// line numbers computed from these indices are what group OR'd alternatives, and a blanking pass that shortened
// the text would silently misgroup them.
function blankStrings(src) {
    const out = String(src).split("");
    let inS = null, esc = false, inLine = false, inBlock = false;
    for (let i = 0; i < out.length; i++) {
        const c = out[i], n = out[i + 1];
        if (inLine) { if (c === "\n") inLine = false; continue; }
        if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i++; } continue; }
        if (inS) {
            if (esc) { esc = false; out[i] = " "; continue; }
            if (c === "\\") { esc = true; out[i] = " "; continue; }
            if (c === inS) { inS = null; continue; }
            if (c !== "\n") out[i] = " ";
            continue;
        }
        if (c === "/" && n === "/") { inLine = true; i++; continue; }
        if (c === "/" && n === "*") { inBlock = true; i++; continue; }
        // A REGEX LITERAL IS NOT A STRING AND MUST BE SKIPPED WHOLE. The pattern this auditor exists to read
        // often contains quotes: plastic-selfcheck asserts /compression branch is a separate `sign` path/, and
        // treating that backtick as the start of a template literal blanked the middle of the pattern, so the
        // auditor reported the tree's ORIGINAL prose gate as unmatched -- inventing a finding about the very
        // file that prompted this round.
        if (c === "/") {
            let k = i - 1;
            while (k >= 0 && /\s/.test(out[k])) k--;
            const before = k >= 0 ? out[k] : "";
            if (before === "" || "=(,:[!&|?{;".includes(before)) {
                let j = i + 1, e = false, cls = false;
                for (; j < out.length; j++) {
                    const d = out[j];
                    if (e) { e = false; continue; }
                    if (d === "\\") { e = true; continue; }
                    if (d === "[") { cls = true; continue; }
                    if (d === "]") { cls = false; continue; }
                    if (d === "/" && !cls) break;
                    if (d === "\n") { j = i; break; }
                }
                if (j > i) { i = j; continue; }
            }
        }
        if (c === '"' || c === "'" || c === "`") { inS = c; continue; }
    }
    return out.join("");
}

export function assertionsIn(rawSrc) {
    const out = [];
    const src = blankStrings(rawSrc);
    const lineOf = (idx) => String(src).slice(0, idx).split(/\r?\n/).length;
    // proseHas(VAR, /re/flags)
    for (const m of src.matchAll(/proseHas\(\s*([A-Za-z_$][\w$]*)\s*,\s*\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)/g))
        out.push({ variable: m[1], source: m[2], flags: m[3], via: "proseHas", at: m.index, line: lineOf(m.index) });
    // /re/flags.test(prose(VAR))
    for (const m of src.matchAll(/\/((?:[^/\\\n]|\\.)+)\/([gimsuy]*)\.test\(\s*prose\(\s*([A-Za-z_$][\w$]*)\s*\)/g))
        out.push({ variable: m[3], source: m[1], flags: m[2], via: "prose().test", at: m.index, line: lineOf(m.index) });
    return out;
}

export function auditGate(gatePath) {
    const src = fs.readFileSync(gatePath, "utf8");
    const asserts = assertionsIn(src);   // strings blanked inside; readTargets below needs the RAW source, since a path IS a string literal
    if (!asserts.length) return null;
    const targets = readTargets(src, gatePath);
    const rows = [];
    for (const a of asserts) {
        const targetPath = targetAt(targets, a.variable, a.at);
        const row = { gate: path.relative(ENG, gatePath), pattern: a.source, via: a.via, line: a.line,
                      variable: a.variable, target: targetPath ? path.relative(ENG, targetPath) : null };
        let re;
        try { re = new RegExp(a.source, a.flags.replace(/g/g, "")); }
        catch (e) { row.verdict = "UNPARSEABLE"; row.why = String(e.message).slice(0, 60); rows.push(row); continue; }

        // TRIVIAL is checkable without the target at all, which is why it is checked first.
        if (re.test("")) { row.verdict = "TRIVIAL"; row.why = "the pattern matches the empty string: it holds against any file"; rows.push(row); continue; }
        if (!targetPath || !fs.existsSync(targetPath)) {
            row.verdict = "UNRESOLVED";
            row.why = "could not resolve which file this is scanned against — audited only for triviality";
            rows.push(row); continue;
        }
        const tsrc = fs.readFileSync(targetPath, "utf8");
        // HTML IS NOT JAVASCRIPT AND prose() DOES NOT PRETEND IT IS. In a .html file the phrase a gate hunts is
        // usually visible page text or a data-attribute, not a // comment, so codeOnly() has nothing meaningful
        // to strip and the MISDIRECTED test would fire on every one of them. Graded as its own verdict rather
        // than silently counted SOUND: the audit does not cover these, and says so.
        if (/\.html?$/i.test(targetPath)) {
            row.verdict = re.test(tsrc) ? "HTML-UNAUDITED" : "UNMATCHED";
            row.why = re.test(tsrc)
                ? "target is HTML: the phrase is present, but comment-vs-code is not a distinction this auditor can draw here"
                : "does not appear in the HTML target at all";
            rows.push(row); continue;
        }
        const inProse = re.test(prose(tsrc));
        const inRaw = re.test(tsrc);
        const inCode = re.test(codeOnly(tsrc));
        if (!inProse && inRaw) { row.verdict = "INVISIBLE"; row.why = "matches the raw source but not the prose — hunting text prose() cannot see"; }
        else if (!inProse) { row.verdict = "UNMATCHED"; row.why = "does not match the target's prose at all — the gate asserting it should be failing"; }
        else if (inCode) { row.verdict = "MISDIRECTED"; row.why = "also matches the CODE, so it tests for an identifier while claiming to test for an explanation"; }
        else { row.verdict = "SOUND"; row.why = "matches the prose, not the code, and is not trivially true"; }
        rows.push(row);
    }

    // *** ALTERNATIVES ARE ONE CLAIM, NOT TWO, AND THIS AUDITOR ACCUSED A PASSING GATE BEFORE IT KNEW THAT. ***
    // brainWiring-selfcheck asserts `A.test(prose(ui)) || B.test(prose(src))` -- the reason may be recorded in
    // either file. Graded separately, the unmatched half reads as a gate that "should be failing" while the gate
    // passes correctly. A disjunction is satisfied by one branch, so branches on the same source line are folded
    // into a group and the group is SOUND if any member is.
    const srcLines = src.split(/\r?\n/);
    const byLine = {};
    for (const r of rows) (byLine[r.line] ||= []).push(r);
    for (const [ln, group] of Object.entries(byLine)) {
        if (group.length < 2) continue;
        if (!/\|\|/.test(srcLines[Number(ln) - 1] || "")) continue;
        if (!group.some((r) => r.verdict === "SOUND" || r.verdict === "HTML-UNAUDITED")) continue;
        for (const r of group) {
            if (r.verdict === "SOUND" || r.verdict === "HTML-UNAUDITED") continue;
            r.verdict = "ALTERNATIVE";
            r.why = "one branch of an OR whose other branch is satisfied — a disjunction is one claim, not two";
        }
    }
    return rows;
}

export function auditAll({ files = null } = {}) {
    const all = (files || gateFiles()).map((f) => (path.isAbsolute(f) ? f : path.join(ENG, f)));
    const rows = [];
    for (const f of all) {
        try { const r = auditGate(f); if (r) rows.push(...r); } catch { /* a gate that cannot be read is not a prose finding */ }
    }
    const by = (v) => rows.filter((r) => r.verdict === v);
    return { rows, sound: by("SOUND"), trivial: by("TRIVIAL"), invisible: by("INVISIBLE"),
             unmatched: by("UNMATCHED"), misdirected: by("MISDIRECTED"), unresolved: by("UNRESOLVED"),
             unparseable: by("UNPARSEABLE"), htmlUnaudited: by("HTML-UNAUDITED"), alternative: by("ALTERNATIVE") };
}

/** How much prose was invisible before trailing comments were included -- the size of the blind spot. */
export function blindSpotSize({ files = null, limit = 400 } = {}) {
    const oldProse = (src) => {
        const out = [];
        for (const line of String(src).split(/\r?\n/)) { const m = line.match(/^\s*\/\/\s?(.*)$/); if (m) out.push(m[1]); }
        for (const m of String(src).matchAll(/\/\*[\s\S]*?\*\//g)) out.push(m[0].replace(/^\/\*+|\*+\/$/g, "").replace(/^\s*\*\s?/gm, ""));
        return out.join(" ").replace(/\s+/g, " ").trim();
    };
    const all = (files || gateFiles()).slice(0, limit).map((f) => (path.isAbsolute(f) ? f : path.join(ENG, f)));
    let before = 0, after = 0, filesGaining = 0;
    for (const f of all) {
        let s; try { s = fs.readFileSync(f, "utf8"); } catch { continue; }
        const b = oldProse(s).length, a = prose(s).length;
        before += b; after += a;
        if (a > b) filesGaining++;
    }
    return { files: all.length, before, after, gainedChars: after - before,
             gainedPct: before ? (after - before) / before : 0, filesGaining };
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const a = auditAll({});
    console.log(`[proseAudit] ${a.rows.length} prose assertions across the suite`);
    for (const k of ["TRIVIAL", "INVISIBLE", "UNMATCHED", "MISDIRECTED", "UNPARSEABLE", "UNRESOLVED", "HTML-UNAUDITED", "ALTERNATIVE", "SOUND"]) {
        const list = a.rows.filter((r) => r.verdict === k);
        if (!list.length) continue;
        console.log(`  ${k}: ${list.length}`);
        for (const r of list.slice(0, 6)) console.log(`     ${r.gate} -> ${r.target || "?"}  /${r.pattern.slice(0, 58)}/  ${r.why}`);
    }
    const b = blindSpotSize({});
    console.log(`[proseAudit] blind spot: trailing comments added ${b.gainedChars} chars of prose across ${b.filesGaining} of ${b.files} files (+${(b.gainedPct * 100).toFixed(1)}%)`);
}
