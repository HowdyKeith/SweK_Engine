// WebGLEngine/tools/ship/shipVerdict.mjs
//
// v4405 -- *** VERIFY SAID "DO NOT SHIP" AND THE ROUND SHIPPED ANYWAY, BECAUSE THE DECISION WAS READ OFF A
// LOG TAIL INSTEAD OF AN EXIT CODE. ***
//
// v4404 was committed, pushed, and fast-forwarded onto main with THREE CONFLICT MARKERS still in it -- in
// main.js, brain/brain.js and tools/ship/gateSweep.mjs. verify.mjs did its job: it printed
// "1 FAILURE(S) -- DO NOT SHIP" and exited 1. The ritual step that reads it is written as "Must end
// [verify] ALL GREEN", and it was run as one `&&` chain whose git steps keyed off the tail of the log rather
// than off `$?`. The chain saw text, not a status, and pushed.
//
// This is v4392's finding at the ritual's own level: A COUNT (or a line) IS NOT A VERDICT UNLESS THE PROCESS
// FINISHED AND SAID SO IN ITS STATUS. The fix is not to read more carefully. It is to make the last line of
// the ship step BE GENERATED FROM THE EXIT CODE, so that reading the tail is reading the code -- the same
// discipline docs/EXPLAIN-ITSELF.md applies to gates: the summary comes from the same object as the argument,
// so it cannot drift from it.
//
// Two independent conditions, because the tail was only half of what went wrong:
//   1. verify's exit status is 0 AND its tail agrees. Disagreement in EITHER direction is NO VERDICT, not a
//      pass -- an exit 0 under a tail that says failure is as untrustworthy as the reverse.
//   2. No tracked file carries a conflict marker. That is the artifact that actually escaped, and it is
//      cheap, absolute, and needs no list.
"use strict";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

// Anchored at line start and followed by a space -- the shape git writes. An unanchored match would trip on
// prose about conflict markers and on any file that mentions one mid-line; this round's changelog is such a
// file, and a detector that flagged the note describing the defect would be the shader census's mistake again.
export const MARKER_KINDS = Object.freeze(["<<<<<<<", "|||||||", ">>>>>>>"]);
const MARKER_RE = /^(<{7}|\|{7}|>{7}) /;

export function conflictMarkers(src) {
    const out = [];
    const lines = String(src).split("\n");
    for (let i = 0; i < lines.length; i++) {
        const m = MARKER_RE.exec(lines[i]);
        if (m) out.push({ line: i + 1, kind: m[1] });
    }
    return out;
}

// Binary and vendored bytes are read as utf8 and simply will not match; the cost of reading them is a second
// on 28 MB, which is cheaper than maintaining an exclusion list that could hide the one file that matters.
const SKIP_DIR = /(^|\/)(node_modules|\.git)(\/|$)/;

export function trackedFiles(root) {
    const out = execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 << 20 });
    return out.toString("utf8").split("\0").filter((f) => f && !SKIP_DIR.test(f));
}

export function scanTracked(root, files = null) {
    const list = files || trackedFiles(root);
    const hits = [];
    for (const f of list) {
        let src;
        try { src = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
        if (src.indexOf("<<<<<<< ") < 0 && src.indexOf(">>>>>>> ") < 0 && src.indexOf("||||||| ") < 0) continue;
        const marks = conflictMarkers(src);
        if (marks.length) hits.push({ file: f, marks });
    }
    return { scanned: list.length, hits };
}

// A ref, not the working tree: v4404's tree was clean by the time anybody looked, and what shipped was not.
export function scanRef(root, ref) {
    let out;
    try {
        out = execFileSync("git", ["grep", "-c", "-E", "^(<{7}|>{7}|\\|{7}) ", ref, "--", "."],
                           { cwd: root, maxBuffer: 32 << 20 }).toString("utf8");
    } catch (e) {
        // git grep exits 1 for "no matches", which is the clean answer, and 128 for a ref it cannot resolve.
        if (e && e.status === 1) return { ref, ok: true, hits: [] };
        return { ref, ok: false, why: String(e && e.message).slice(0, 120), hits: [] };
    }
    const hits = out.split("\n").filter(Boolean).map((l) => {
        const i = l.lastIndexOf(":");
        return { file: l.slice(0, i).replace(ref + ":", ""), count: Number(l.slice(i + 1)) };
    });
    return { ref, ok: true, hits };
}

export const TAIL_GREEN = /\[verify\]\s+ALL GREEN/;

// The whole point of the file. `code` is the process's exit status -- null when it never produced one, which
// is a crash or a kill and is emphatically not a pass.
export function verdict({ code, tail }) {
    const green = TAIL_GREEN.test(String(tail || ""));
    if (code === null || code === undefined)
        return { ship: false, agrees: false, reason: "NO VERDICT: verify did not finish -- no exit status" };
    if (code === 0 && green) return { ship: true, agrees: true, reason: "verify exited 0 and its tail agrees" };
    if (code !== 0 && !green) return { ship: false, agrees: true, reason: `verify exited ${code} and reported failures` };
    if (code !== 0 && green)
        return { ship: false, agrees: false, reason: `NO VERDICT: tail says ALL GREEN, exit status is ${code}` };
    return { ship: false, agrees: false, reason: "NO VERDICT: exit status is 0, tail does not say ALL GREEN" };
}

export function decide({ verify, conflicts }) {
    const v = verdict(verify);
    if (!v.ship) return { ship: false, reason: v.reason };
    if (conflicts && conflicts.hits.length)
        return { ship: false, reason: "conflict marker(s) in " + conflicts.hits.map((h) => h.file).join(", ") };
    return { ship: true, reason: v.reason + `, and ${conflicts ? conflicts.scanned : 0} tracked files carry no conflict marker` };
}

export function runProcess(cmd, argv, opts = {}) {
    return new Promise((resolve) => {
        const p = spawn(cmd, argv, { cwd: opts.cwd, env: { ...process.env, ...(opts.env || {}) } });
        let out = "";
        const keep = (b) => { out += b; if (out.length > 200000) out = out.slice(-100000); if (opts.echo) process.stderr.write(b); };
        p.stdout.on("data", keep);
        p.stderr.on("data", keep);
        p.on("close", (code) => resolve({ code, tail: out.split("\n").filter((l) => l.trim()).slice(-6).join("\n") }));
        p.on("error", (e) => resolve({ code: null, tail: String(e && e.message) }));
    });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith("shipVerdict.mjs");
if (isMain) {
    const eng = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
    const root = path.resolve(eng, "..");
    const pass = process.argv.slice(2);
    const verify = await runProcess(process.execPath, [path.join(eng, "tools", "ship", "verify.mjs"), ...pass],
                                    { cwd: eng, echo: true });
    const conflicts = scanTracked(root);
    const d = decide({ verify, conflicts });
    console.log("");
    console.log(`[ship] verify exit=${verify.code}  conflicts=${conflicts.hits.length}/${conflicts.scanned} files`);
    for (const h of conflicts.hits) console.log(`[ship]   conflict  ${h.file}  line(s) ${h.marks.map((m) => m.line).join(", ")}`);
    console.log(`[ship] ${d.ship ? "SHIP" : "DO NOT SHIP"} -- ${d.reason}`);
    process.exit(d.ship ? 0 : 1);
}
