// WebGLEngine/tools/ship/winPathLint.mjs -- UNNUMBERED (the version is chosen at ship time; the gate is tools/ship/winPathLint-selfcheck.mjs; the shim is tools/ship/winPathShim.mjs)
//
// GREEN HERE, RED ON THE RIG'S WINDOWS BOX -- CAUGHT IN THE SANDBOX. The same kind of mistake has failed a rig verdict at v4882, v4892, v4896, v4906, v4907, v4911 and v4912 (docs/CHANGELOG.md; the fixes are commits bf74bb92, 5ec2d403, 7ffe00c9 and 85be06d1): a gate that spells or compares a path the way Linux does. Two instruments, one command:
//   node tools/ship/winPathLint.mjs                       the STATIC rules over every gate and tool: five patterns a line of code shows, each with a count the tree is held to (W1 to W3 and W5 are at ZERO; W4, path.relative with no normalisation, is a ratchet at the measured count)
//   node tools/ship/winPathLint.mjs --probe <gate> ...    the DYNAMIC probe: each named gate is run twice, plain and under tools/ship/winPathShim.mjs (node --import), and the verdict says which gates answer differently. `--probe --changed` takes the *-selfcheck.mjs files that differ from origin/main or are uncommitted; `--probe --all` every gate (slow).
// The rules (what each catches, and the incident it comes from):
//   W1  a COMMAND STRING that embeds process.execPath (or a NODE built from it) unquoted: `${NODE} script` -- a Windows node path has a space ("Program Files") and backslashes that a command splitter reads as escapes (v4906 advisorLive and others). Fix: quote it, or pass an argument LIST to spawn.
//   W2  an EXECUTE BIT read from fs.statSync(...).mode & 0o111 with no win32 guard on the line -- Windows has no such bit (v4912 appInstall).
//   W3  path.join / resolve / relative / normalize COMPARED WITH a string literal that has a slash in it -- on win32 the left side has backslashes (v4882 deviceReach, shaderEmitters). Fix: normalise one side.
//   W4  path.relative(...) with no normalisation on the line (a replace of backslashes, split(path.sep), posix, a helper called fwd, or the marker `win32-ok`): its result is what v4882 compared to posix names. A RATCHET, because the existing uses are display lists; it may not grow.
//   W5  a PATH interpolated inside quotes into the SOURCE of a file the gate writes (writeFileSync of a template literal): a Windows path's backslashes become escapes in that source (v4896 snowGpu live gates). Fix: JSON.stringify(path).
// WHAT THE PROBE ADDS: the stubs. A reader keyed by "/x/brain/a.jsonl" that a module calls with path.join("/x", ...) answers undefined on win32 (v4912, three gates) and no line of code shows it; under the shim the same gate goes red in the sandbox. WHAT NEITHER CATCHES, said plainly: a drive letter, case-insensitivity, the 260-character limit, kill semantics (v4892), line endings and anything that needs the real fs to behave differently.
// Pure but for the files it reads and the processes the probe starts. No clock, no Math.random.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENG = path.resolve(HERE, "..", "..");
export const SHIM = path.join(HERE, "winPathShim.mjs");
const NORMALISED = /replace\(\s*\/\\\\\/g|split\(\s*path\.sep|posix|\bfwd\(|win32-ok/;
const PATHFN = String.raw`path\.(?:join|resolve|relative|normalize)\((?:[^()]|\([^()]*\))*\)`, LIT = String.raw`(["'\x60])[^"'\x60]*\/[^"'\x60]*\1`;

/** The rules: { id, name, fix, test(line) -> boolean }. `line` is one source line that is not a comment line. */
export const RULES = Object.freeze([
    Object.freeze({ id: "W1", name: "a command string with process.execPath in it, unquoted", fix: "quote it (`\"${NODE}\" script`) or hand spawn an argument list", test: (l) => /`[^`]*(?<!["'\\])\$\{\s*(?:process\.execPath|NODE)\s*\}(?!["'])[ \t][^`]*`/.test(l) || /process\.execPath\s*\+\s*["'` ]\s/.test(l) }),
    Object.freeze({ id: "W2", name: "an execute bit read without a win32 guard", fix: "guard it with process.platform === \"win32\" (Windows has no execute bit)", test: (l) => /\.mode\s*&\s*0o?(?:111|100|10|1)\b/.test(l) && !/win32/.test(l) }),
    Object.freeze({ id: "W3", name: "a path.join/resolve/relative/normalize result compared with a slash literal", fix: "normalise the path first (replace backslashes) or compare path.sep-free parts", test: (l) => new RegExp(`${PATHFN}\\s*(?:===|!==|==|!=)\\s*${LIT}`).test(l) || new RegExp(`${LIT}\\s*(?:===|!==|==|!=)\\s*${PATHFN}`).test(l) }),
    Object.freeze({ id: "W4", name: "path.relative with no normalisation on the line (a ratchet)", fix: "replace backslashes with slashes, split on path.sep, or mark the line win32-ok with the reason", test: (l) => /path\.relative\(/.test(l) && !NORMALISED.test(l) }),
    Object.freeze({ id: "W5", name: "a path interpolated in quotes into source the gate writes", fix: "write JSON.stringify(thePath) into the source", test: (l) => /(?:writeFileSync|appendFileSync)\([^`\n]*`[^`\n]*["']\$\{\s*[A-Za-z_]*(?:dir|Dir|DIR|file|File|path|Path|tmp|Tmp|root|Root|script|Script|ENG|HERE|cwd)[A-Za-z_]*\s*\}["']/.test(l) && !/JSON\.stringify/.test(l) }),
]);
/** What the tree is held to: the count of hits per rule. W4 is the measured count on 2026-11-06 (display lists, mostly); a rule at 0 stays at 0. */
export const BASELINE = Object.freeze({ W1: 0, W2: 0, W3: 0, W4: 116, W5: 0 });

const isComment = (l) => { const t = l.trimStart(); return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"); };
/** The hits of every rule in a source text: [{ rule, line (1-based), text }], in line order. */
export function lintSource(text) {
    const out = [];
    String(text).split("\n").forEach((l, i) => { if (isComment(l)) return; for (const r of RULES) if (r.test(l)) out.push({ rule: r.id, line: i + 1, text: l.trim().slice(0, 160) }); });
    return out;
}
/** The files the static rules read: every *.mjs under `root` that is a gate (-selfcheck) or a tool (tools/), not under node_modules or vendor, and not this lint's own files (they quote the patterns). */
export function gatherFiles(root = ENG, list = (d) => fs.readdirSync(d, { withFileTypes: true })) {
    const out = [];
    const walk = (dir, rel) => {
        for (const e of list(dir)) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "vendor" && e.name !== ".git") walk(path.join(dir, e.name), r); }
            else if (e.name.endsWith(".mjs") && (e.name.endsWith("-selfcheck.mjs") || r.startsWith("tools/")) && !/^winPath/.test(e.name)) out.push(r);
        }
    };
    walk(root, "");
    return out.sort();
}
/** The static scan: { hits: [{ file, rule, line, text }], counts: { W1.. }, files }. `read` is the file reader (for the gate). */
export function scan(root = ENG, read = (f) => fs.readFileSync(path.join(root, f), "utf8"), files = gatherFiles(root)) {
    const hits = [], counts = Object.fromEntries(RULES.map((r) => [r.id, 0]));
    for (const f of files) { let t; try { t = read(f); } catch { continue; } for (const h of lintSource(t)) { hits.push({ file: f, ...h }); counts[h.rule]++; } }
    return { hits, counts, files: files.length };
}
/** The scan against BASELINE: { ok, rows: [{ rule, count, allowed, ok }] }. A count above the baseline is red; below it is fine (and worth lowering the baseline). */
export function verdictOf(counts, baseline = BASELINE) {
    const rows = RULES.map((r) => ({ rule: r.id, count: counts[r.id], allowed: baseline[r.id], ok: counts[r.id] <= baseline[r.id] }));
    return { ok: rows.every((x) => x.ok), rows };
}

/** Run node with `args` in `o.cwd`, killed at `o.timeout` ms: a promise of { stdout, stderr, status }. */
export const runNode = (args, o) => new Promise((resolve) => {
    const p = spawn(process.execPath, args, { cwd: o.cwd, stdio: ["ignore", "pipe", "pipe"] }); let out = "", er = "", done = false;
    const finish = (status) => { if (!done) { done = true; clearTimeout(timer); resolve({ stdout: out, stderr: er, status }); } };
    const timer = setTimeout(() => { p.kill("SIGKILL"); finish(null); }, o.timeout);
    p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => { er += d; }); p.on("error", () => finish(null)); p.on("close", (code) => finish(code));
});
/** The FAIL lines of a gate's output: a line that starts (after spaces) with FAIL, and a missing "all checks pass" reported as one more. */
export const failsOf = (text) => String(text).split("\n").filter((l) => /^\s*FAIL\b/.test(l)).length;
/**
 * One gate, plain and under the shim: { gate, plain: { fails, code }, shim: { fails, code }, verdict }. verdict: "NOT READ (BOTH KILLED AT THE TIMEOUT)", "SAME" (both give the same fails and exit code), "RED ONLY UNDER THE WIN32 SPELLING" (a CANDIDATE for the rig's failure: the fixture gates of the class are reproduced exactly, the shim is an over-approximation elsewhere), "GREEN ONLY UNDER THE SHIM" (odd: reported), "RED BOTH WAYS" (a gate red here already: not this probe's finding).
 * `run(args, opts)` is the process runner (for the gate): returns a promise of { stdout, stderr, status }; status null when the process was killed at `timeout`.
 */
export async function probeGate(gate, { cwd = ENG, timeout = 300000, run = runNode } = {}) {
    const one = async (args) => { const r = await run(args, { cwd, timeout }); return { fails: failsOf((r.stdout || "") + "\n" + (r.stderr || "")), code: r.status === null || r.status === undefined ? -1 : r.status }; };
    const plain = await one([gate]), shim = await one(["--import", SHIM, gate]);   // ONE AFTER THE OTHER: two copies of a gate that writes a scratch file or watches for one (strandCensus) read each other's
    const same = plain.fails === shim.fails && plain.code === shim.code;
    if (plain.code === -1 && shim.code === -1) return { gate, plain, shim, verdict: "NOT READ (BOTH KILLED AT THE TIMEOUT)" };
    const verdict = same ? (plain.code === 0 && plain.fails === 0 ? "SAME" : "RED BOTH WAYS") : (plain.code === 0 && plain.fails === 0 ? "RED ONLY UNDER THE WIN32 SPELLING" : shim.code === 0 && shim.fails === 0 ? "GREEN ONLY UNDER THE SHIM" : "RED BOTH WAYS");
    return { gate, plain, shim, verdict };
}
/** The gates named by --changed: the *-selfcheck.mjs files that differ from origin/main or are uncommitted. `git(args)` returns the output text (for the gate). */
export function changedGates(git = (a) => spawnSync("git", a, { cwd: ENG, encoding: "utf8" }).stdout || "") {
    const prefix = git(["rev-parse", "--show-prefix"]).trim(), names = new Set();
    for (const l of git(["diff", "--name-only", "origin/main...HEAD"]).split("\n")) if (l) names.add(l);
    for (const l of git(["status", "--porcelain"]).split("\n")) if (l.length > 3) names.add(l.slice(3).replace(/^"|"$/g, ""));
    return [...names].map((f) => (prefix && f.startsWith(prefix) ? f.slice(prefix.length) : f.replace(/^WebGLEngine\//, ""))).filter((f) => f.endsWith("-selfcheck.mjs") && fs.existsSync(path.join(ENG, f))).sort();
}

/** Gates that EDIT OTHER GATES to see whether they go red (gateMutation injects a forced failure into a gate and puts it back): never probed beside others, and left out of --all (in the first whole-tree probe eleven gates were left carrying the injected line). Name one explicitly to run it. */
export const MUTATORS = Object.freeze(["tools/ship/gateMutation-selfcheck.mjs"]);
export const USAGE = "usage: node tools/ship/winPathLint.mjs [--probe (<gate> ... | --changed | --all)] [--workers N]";
/** The command. `io`: { print, err, scan, probe, changed, gates } for the gate. Exit 0 clean; 1 a rule over its baseline or a gate red only under the win32 spelling; 2 usage. */
export async function main(argv, io = {}) {
    const print = io.print || ((t) => process.stdout.write(t)), err = io.err || console.error;
    const probing = argv[0] === "--probe", rest = probing ? argv.slice(1) : argv;
    if (!probing && argv.length) { err(`${USAGE}   (not understood: ${argv[0]})`); return 2; }
    if (!probing) {
        const s = (io.scan || scan)(), v = verdictOf(s.counts), L = [`winPathLint: ${s.files} files, five static rules (W1 to W5), against the baseline in tools/ship/winPathLint.mjs`];
        for (const r of v.rows) { const rule = RULES.find((x) => x.id === r.rule); L.push(`  ${r.ok ? "OK " : "RED"} ${r.rule} ${rule.name}: ${r.count} (allowed ${r.allowed})`); if (!r.ok) for (const h of s.hits.filter((x) => x.rule === r.rule)) L.push(`        ${h.file}:${h.line}: ${h.text}`); if (!r.ok) L.push(`        fix: ${rule.fix}`); }
        L.push(v.ok ? "STATIC: clean" : "STATIC: A RULE IS OVER ITS BASELINE");
        print(L.join("\n") + "\n"); return v.ok ? 0 : 1;
    }
    let workers = 1, names = [], mode = null;
    for (let i = 0; i < rest.length; i++) {
        const a = rest[i];
        if (a === "--workers") { const n = Number(rest[++i]); if (!Number.isInteger(n) || n < 1 || n > 16) { err(`${USAGE}   (--workers is a whole number from 1 to 16, got ${rest[i]})`); return 2; } workers = n; }
        else if (a === "--changed" || a === "--all") { if (mode) { err(`${USAGE}   (--changed, --all and named gates are exclusive)`); return 2; } mode = a; }
        else if (a.startsWith("--")) { err(`${USAGE}   (not understood: ${a})`); return 2; }
        else { if (mode && mode !== "names") { err(`${USAGE}   (--changed, --all and named gates are exclusive)`); return 2; } mode = "names"; names.push(a); }
    }
    if (!mode) { err(`${USAGE}   (--probe needs gates, --changed or --all)`); return 2; }
    const list = mode === "--changed" ? (io.changed || changedGates)() : mode === "--all" ? (io.gates || (() => gatherFiles().filter((f) => f.endsWith("-selfcheck.mjs"))))().filter((f) => !MUTATORS.includes(f)) : names;
    if (!list.length) { print("winPathLint --probe: no gate to probe\n"); return 0; }
    const results = [], queue = [...list], probe = io.probe || ((g) => probeGate(g));
    const worker = async () => { while (queue.length) { const g = queue.shift(); results.push(await probe(g)); } };
    await Promise.all(Array.from({ length: Math.min(workers, list.length) }, worker));
    const unconfirmed = [];
    if (workers > 1) for (let i = 0; i < results.length; i++) if (results[i].verdict === "RED ONLY UNDER THE WIN32 SPELLING") { const again = await probe(results[i].gate); if (again.verdict !== "RED ONLY UNDER THE WIN32 SPELLING") { unconfirmed.push(results[i].gate); results[i] = again; } }   // a difference seen beside other gates counts only if it repeats ALONE
    results.sort((a, b) => (a.gate < b.gate ? -1 : 1));
    const L = [`winPathLint --probe: ${results.length} gate(s), each plain and under the win32 spelling (tools/ship/winPathShim.mjs)`];
    for (const r of results) L.push(`  ${r.verdict === "SAME" ? "same" : r.verdict}  ${r.gate}  (plain ${r.plain.fails} red, exit ${r.plain.code}; shim ${r.shim.fails} red, exit ${r.shim.code})`);
    const bad = results.filter((r) => r.verdict === "RED ONLY UNDER THE WIN32 SPELLING");
    if (unconfirmed.length) L.push(`  differed beside other gates and not alone (not counted): ${unconfirmed.join(", ")}`);
    L.push(bad.length ? `PROBE: ${bad.length} gate(s) RED ONLY UNDER THE WIN32 SPELLING -- CANDIDATES for a red on the rig, not a verdict (the shim respells relative() always and join() only for invented roots, so it can differ here where Windows would not): ${bad.map((r) => r.gate).join(", ")}` : "PROBE: no gate answers differently under the win32 spelling");
    print(L.join("\n") + "\n"); return bad.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(await main(process.argv.slice(2)));
