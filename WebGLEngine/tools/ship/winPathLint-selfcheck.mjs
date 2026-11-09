// WebGLEngine/tools/ship/winPathLint-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/winPathLint-selfcheck.mjs      (about 4 s)
//
// THE GATE OF tools/ship/winPathLint.mjs AND tools/ship/winPathShim.mjs: green here, red on the rig's Windows box (v4882, v4892, v4896, v4906, v4907, v4911, v4912), caught in the sandbox.
//   1 THE RULES     W1 (an unquoted process.execPath in a command string), W2 (an execute bit read with no win32 guard), W3 (a path function's result compared with a slash literal), W4 (path.relative with no normalisation), W5 (a path in quotes in written source): each on lines that must be caught and lines that must not (the quoted form, the guarded form, the normalised form, a comment line, an argument list).
//   2 THE TREE      the real tree against the baseline: W1, W2, W3 and W5 at ZERO, W4 at its measured 116 and exactly that (a lower count is a baseline to lower); the files read (gates and tools, not node_modules, vendor, or the lint's own files).
//   3 THE SHIM      in a child process under `node --import tools/ship/winPathShim.mjs`: a fake root ("/x") is spelled with backslashes by join, resolve and normalize; a real root (/tmp, the repository) is not; path.relative answers with backslashes; the fs takes either separator.
//   4 THE PROBE     real fixture gates in a temporary directory, each run plain and under the shim: the v4912 class (a stub reader keyed by a posix path, a module that joins its root) is RED ONLY UNDER THE WIN32 SPELLING; the same gate with one side normalised is SAME; the v4882 class (path.relative compared with posix names) is red under the shim; a gate that writes and reads a real temporary file is SAME (no false alarm); and the verdict logic on stub runs (same, red only under the shim, green only under it, red both ways, a killed run).
//   5 THE COMMAND   the static report (clean: exit 0; a rule over its baseline: exit 1 with file, line and fix), the probe (named gates, --changed, --all, --workers), the usage errors (exit 2), changedGates on a stub git.
//   6 THE SOURCE    pure but for the files it reads and the processes it starts; the imports.
// SABOTAGES (2026-11-06; 221 mutants of tools/ship/winPathLint.mjs and tools/ship/winPathShim.mjs against this gate, the real files checked by sha256 before and after): 182 MECHANICAL (170 of the lint, 12 of the shim: every comparison, boolean, operator and number in the code lines): 173 red BY NAME, 2 threw, 1 crashed the gate, 2 ended without a verdict line (NOPASS: a mutant that made the static scan emit nothing), 4 timed out (a mutant that made a probe child wait; counted as detected, not as passes), 0 survivors. 39 BY HAND, ALL RED BY NAME: the lint's regexes taken apart piece by piece (W1 the opening-quote lookbehind, the closing-quote lookahead, the space after the placeholder, NODE, the concatenation form; W2 the 100 mode and the win32 guard both ways; W3 each side, !==, the slash in the literal, normalize; W4 each of the five normalisers, a W4 that flags nothing and one that flags normalised lines; W5 the JSON.stringify exemption, appendFileSync, single quotes, the variable-name list; comment lines and block-comment stars linted; vendor scanned; the lint's own files scanned; non-gate tool files skipped) and the shim's (a negated fake-root test, join, resolve, normalize and relative each unpatched, fs unpatched, renameSync and copyFileSync second arguments, backslashes left in, every absolute path respelled). Equivalents: none found.
// SABOTAGES, SECOND PASS (2026-11-06, after the first whole-tree probe: plain and shim run one after the other, gateMutation left out of --all, a difference beside other gates counted only if it repeats alone, the wording of the last line): 22 mutants of the changed lines (12 mechanical, 10 by hand: the parallel runs back, MUTATORS emptied, the filter dropped, no confirmation, confirmation with one worker, the first reading kept, the unconfirmed not reported, the old wording back, the test inverted, a different gate re-probed): 20 red BY NAME, 2 threw, 0 survivors.
// NOT CHECKED, said plainly: that every gate in the tree is the same under the shim (1,110 of 2,283 were probed, the path-using gates of 8 s or less, and 51 of them are red only under the shim: brain/WIN_PATH_PROBE_2026-11-06.md, a candidate list whose precision on the rig is unknown; the other 1,173 were not probed); the drive letter, case-insensitivity, the 260-character limit, kill semantics and a space in the node path, which neither the shim nor the rules reproduce.
// WIN32 HOST (2026-11-09, after the rig's v4913 verify made this gate a NEW red that no path change could clear): four rows (the fake root, the real root, the v4912 class, the v4882 class) state what the shim does FROM a POSIX box and cannot hold on a Windows host, where "plain" already spells
//   paths with backslashes and a drive letter. They are SKIPPED there, named, as SKIP lines (neither PASS nor FAIL); section 7 runs the gate again in a child with SWEK_PRETEND_WIN32_HOST=1 and asserts exactly four SKIP rows, no FAIL and the other rows PASS. Four mutants of the skip,
//   alone: the skip never taken, the pretend flag ignored, one of the four rows left unguarded -- all three red on the new row; the fourth, `process.platform === "win32"` removed, goes 0 red on a POSIX box BY CONSTRUCTION (only a Windows host can read it) and is declared, not hidden. NOT CHECKED: that the gate is green on a real Windows host -- it was written from the rig's output, not run there.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import * as W from "./winPathLint.mjs";

let fails = 0, finished = false;
const died = (e) => { console.log("  FAIL  !! THE GATE THREW before it finished: " + String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ").slice(0, 400)); process.exit(1); };
process.on("uncaughtException", died); process.on("unhandledRejection", died);
process.on("exit", () => { if (!finished) { console.log("  FAIL  !! THE GATE ENDED BEFORE IT FINISHED"); process.exitCode = 1; } });
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const J = JSON.stringify;
// *** ON A WINDOWS HOST THE SHIM HAS NOTHING TO SIMULATE, SO FOUR OF THIS GATE'S ROWS CANNOT HOLD THERE. ***
// The shim exists to make a POSIX box spell paths the way win32 does; the four rows below state what that looks like FROM a POSIX box
// (a fake root "/x" respelled "\\x\\...", the real root and /tmp left alone, a stub keyed by a posix path green plain and red under the shim).
// On the rig's own Windows host the "plain" run already spells paths with backslashes and a drive letter -- path.resolve("/zz", "q", "r") is
// "C:\\zz\\q\\r", the real root is "\\", /tmp is "\\tmp" -- so those rows fail by construction, and they failed there at v4913 (rig verify, 2026-11-09: a NEW red
// that no change to a path could clear). They are SKIPPED on a win32 host, named, as "SKIP" lines that are neither PASS nor FAIL; every other row (the rules,
// the tree walk, path.relative, the fs, the command, the probe's verdict logic on stub runs) still runs on both hosts. SWEK_PRETEND_WIN32_HOST=1 takes the skip path on a POSIX box,
// which is how a row below proves it without a Windows machine.
const WIN_HOST = process.platform === "win32" || process.env.SWEK_PRETEND_WIN32_HOST === "1";
const okPosixHost = (n, c, d) => { if (WIN_HOST) console.log("  SKIP  " + n + "   (a POSIX-host row: the shim has nothing to simulate on a win32 host)"); else ok(n, c, d); };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", "..");
console.log("winPathLint-selfcheck -- green here, red on the Windows rig\n");

const hit = (line) => W.lintSource(line).map((h) => h.rule).join();
const BT = "`";

sec("1. THE RULES");
{
    ok("!! W1 catches an unquoted NODE or process.execPath in a command string (a template with a space after it, or a concatenation), and nothing else", hit(`const cmd = ${BT}\${NODE} \${script}${BT};`) === "W1" && hit(`run(${BT}\${process.execPath} x.mjs --a${BT});`) === "W1" && hit(`const c = process.execPath + " " + script;`) === "W1" && hit(`const c = process.execPath + ' ' + s;`) === "W1");
    ok("!! W1 lets through the quoted form (v4906), an argument list, a bare assignment, and a template where it is the last thing", hit(`const cmd = ${BT}"\${NODE}" \${script}${BT};`) === "" && hit(`const cmd = ${BT}'\${NODE}' \${script}${BT};`) === "" && hit(`spawnSync(process.execPath, [script]);`) === "" && hit(`const NODE = process.execPath;`) === "" && hit(`const t = ${BT}node=\${NODE}${BT};`) === "" && hit(`const s = process.execPath;`) === "");
    ok("!! W2 catches an execute bit (0o111, 0o100, 0o10, 0o1) read from .mode with no win32 on the line, and lets through the guarded line and other masks", hit(`ok("x", (fs.statSync(p).mode & 0o111) !== 0);`) === "W2" && hit(`const x = st.mode & 0o100;`) === "W2" && hit(`const x = st.mode & 0o10;`) === "W2" && hit(`const x = st.mode & 1;`) === "" && hit(`const x = st.mode & 0o1;`) === "W2" && hit(`ok("x", process.platform === "win32" || (st.mode & 0o111) !== 0);`) === "" && hit(`const x = st.mode & 0o777;`) === "" && hit(`const x = st.mode & 0o7;`) === "");
    ok("!! W3 catches path.join / resolve / relative / normalize compared with a literal that has a slash in it, either side, with a nested call inside; and lets through a literal with no slash and a comparison with a variable", hit(`ok(path.join(a, b) === "/x/y");`) === "W3" && hit(`ok("/x/y" === path.join(a, b));`) === "W3" && hit(`ok(path.resolve(path.dirname(f), "..") !== "/q/r");`) === "W3" && hit(`ok(path.normalize(p) == 'a/b');`) === "W3" && hit(`ok(path.join(a, b) === other);`) === "" && hit(`ok(path.join(a, b) === "abc");`) === "" && hit(`ok(path.basename(p) === "a/b");`) === "");
    ok("!! W4 catches path.relative with nothing that normalises the line; lets through a replace of backslashes, split on path.sep, posix, a helper called fwd, and the marker win32-ok", hit(`list.push(path.relative(ENG, q));`) === "W4" && hit(`const r = path.relative(a, b).replace(/\\\\/g, "/");`) === "" && hit(`const r = path.relative(a, b).split(path.sep).join("/");`) === "" && hit(`const r = path.posix.relative(a, b);`) === "" && hit(`const r = fwd(path.relative(a, b));`) === "" && hit(`const r = path.relative(a, b);   // win32-ok: shown, never compared`) === "");
    ok("!! W5 catches a path-named variable in quotes inside a template written with writeFileSync / appendFileSync, and lets through JSON.stringify, a non-path name (a version), a template that is not written, and (said plainly) any mention of JSON.stringify on the line, comment or not", hit(`fs.writeFileSync(f, ${BT}const R = "\${dir}";${BT});`) === "W5" && hit(`fs.appendFileSync(f, ${BT}x = '\${scriptPath}'${BT});`) === "W5" && hit(`fs.writeFileSync(f, ${BT}const R = \${JSON.stringify(dir)};${BT});`) === "" && hit(`fs.writeFileSync(f, ${BT}const v = "\${v}";${BT});`) === "" && hit(`const s = ${BT}const R = "\${dir}";${BT};`) === "" && hit(`fs.writeFileSync(f, ${BT}const R = "\${tmpRoot}";${BT});`) === "W5" && hit(`fs.writeFileSync(f, ${BT}const R = "\${tmpRoot}";${BT});   // JSON.stringify would be right`) === "");
    ok("!! a comment line, a block-comment line and a doc-comment star line are skipped; a line can hit two rules (reported in rule order); the position is the 1-based line", hit(`// path.relative(a, b)`) === "" && hit(`   * path.relative(a, b)`) === "" && hit(`/* path.relative(a, b)`) === "" && hit(`ok(path.relative(a, b) === "/x/y");`) === "W3,W4" && J(W.lintSource("a\nb\nlist.push(path.relative(a, b));\n").map((h) => h.line)) === "[3]");
    ok("!! the rules are five, in order W1 to W5, each with a name, a fix and a test; frozen; the baseline is W1 0, W2 0, W3 0, W4 116, W5 0", J(W.RULES.map((r) => r.id)) === '["W1","W2","W3","W4","W5"]' && W.RULES.every((r) => r.name && r.fix && typeof r.test === "function") && Object.isFrozen(W.RULES) && Object.isFrozen(W.BASELINE) && J(W.BASELINE) === J({ W1: 0, W2: 0, W3: 0, W4: 116, W5: 0 }));
}

sec("2. THE TREE");
{
    const s = W.scan(ENG), counts = s.counts;
    ok("!! W1, W2, W3 and W5 are at ZERO in the tree (the incidents are fixed; a new one goes red in the sandbox), and W4 is exactly its baseline of 116 (fewer is a baseline to lower)", counts.W1 === 0 && counts.W2 === 0 && counts.W3 === 0 && counts.W5 === 0 && counts.W4 === W.BASELINE.W4, J(counts));
    const v = W.verdictOf(counts);
    ok("!! the verdict of the real tree is OK on all five rules", v.ok && v.rows.length === 5 && v.rows.every((r) => r.ok), J(v.rows.map((r) => r.rule + ":" + r.count + "/" + r.allowed)));
    const files = W.gatherFiles(ENG);
    ok("!! the files read are gates and tools: over two thousand, sorted, posix-spelled, none under node_modules or vendor, none of the lint's own (winPath*), and both a gate and a tools/ file are in", files.length > 2000 && J(files) === J([...files].sort()) && !files.some((f) => /node_modules|^vendor|\\/.test(f)) && !files.some((f) => /\/winPath|^winPath/.test(f)) && files.includes("tools/ship/plainNetVariants-selfcheck.mjs") && files.includes("tools/ship/shipVerdict.mjs"), String(files.length));
    const fake = (name) => ({ name, isDirectory: () => false }), dir = (name) => ({ name, isDirectory: () => true });
    const tree = { "": [dir("node_modules"), dir("vendor"), dir(".git"), dir("tools"), dir("brain"), fake("a-selfcheck.mjs"), fake("a.mjs"), fake("b.js")], tools: [fake("t.mjs"), fake("t-selfcheck.mjs"), fake("winPathLint.mjs")], brain: [fake("p-selfcheck.mjs"), fake("q.mjs")], node_modules: [fake("n-selfcheck.mjs")] };
    const got = W.gatherFiles("/r", (d) => tree[path.relative("/r", d).replace(/\\/g, "/")] || []);
    ok("!! the walk on a fake tree: a *-selfcheck.mjs anywhere and any .mjs under tools/; not a plain .mjs elsewhere, not a .js, not node_modules, vendor or .git, not the lint's own file", J(got) === J(["a-selfcheck.mjs", "brain/p-selfcheck.mjs", "tools/t-selfcheck.mjs", "tools/t.mjs"]), J(got));
    const fixture = { "g-selfcheck.mjs": "list.push(path.relative(a, b));\nconst c = `${NODE} ${s}`;\n", "h-selfcheck.mjs": "const ok = 1;\n" }, sc = W.scan("/r", (f) => { if (!(f in fixture)) throw new Error("ENOENT"); return fixture[f]; }, ["g-selfcheck.mjs", "h-selfcheck.mjs", "missing-selfcheck.mjs"]);
    ok("!! scan reads each file with the reader it is given (an unreadable one is skipped), reports file, rule, line and text, and counts per rule", sc.hits.length === 2 && J(sc.hits.map((h) => [h.file, h.rule, h.line])) === J([["g-selfcheck.mjs", "W4", 1], ["g-selfcheck.mjs", "W1", 2]]) && sc.counts.W1 === 1 && sc.counts.W4 === 1 && sc.counts.W2 === 0 && sc.files === 3 && sc.hits[0].text === "list.push(path.relative(a, b));");
    const over = W.verdictOf({ W1: 1, W2: 0, W3: 0, W4: 116, W5: 0 }), under = W.verdictOf({ W1: 0, W2: 0, W3: 0, W4: 100, W5: 0 });
    ok("!! a count above its baseline is not ok (and names the rule); a count below it is ok", over.ok === false && over.rows[0].ok === false && over.rows[3].ok === true && under.ok === true && over.rows[0].allowed === 0);
}

sec("3. THE SHIM (in a child process)");
{
    const script = path.join(os.tmpdir(), `winshim-gate-${process.pid}.mjs`), real = fs.mkdtempSync(path.join(os.tmpdir(), "winshim-real-"));
    try {
        fs.writeFileSync(path.join(real, "f.txt"), "hello");
        fs.writeFileSync(script, `import path from "node:path"; import fs from "node:fs";
const real = ${JSON.stringify(real)};
const out = { fakeJoin: path.join("/x", "brain", "a.jsonl"), fakeResolve: path.resolve("/zz", "q", "r"), fakeNormalize: path.normalize("/x//brain/../a"), realJoin: path.join(real, "f.txt"), tmpJoin: path.join("/tmp", "w"), root: path.join("/"), fakeOne: path.join("/x"),
    rel: path.relative("/home/a", "/home/a/b/c"), relUp: path.relative("/home/a/b", "/home/a/c"), relSame: path.relative("/home/a", "/home/a"),
    readBack: fs.readFileSync(real + "\\\\f.txt", "utf8"), exists: fs.existsSync(real + "\\\\f.txt"), existsNo: fs.existsSync(real + "\\\\nope.txt"), stat: fs.statSync(real + "\\\\f.txt").size,
    list: fs.readdirSync(real + "\\\\").join(), plainRead: fs.readFileSync(path.join(real, "f.txt"), "utf8"), nonString: fs.existsSync(Buffer.from(real)) };
fs.writeFileSync(real + "\\\\g.txt", "w"); out.wrote = fs.readFileSync(path.join(real, "g.txt"), "utf8"); fs.copyFileSync(real + "\\\\g.txt", real + "\\\\h.txt"); out.copied = fs.readFileSync(path.join(real, "h.txt"), "utf8");
fs.renameSync(real + "\\\\h.txt", real + "\\\\i.txt"); out.renamed = fs.existsSync(real + "\\\\i.txt") && !fs.existsSync(real + "\\\\h.txt");
console.log(JSON.stringify(out));`);
        const r = spawnSync(process.execPath, ["--import", pathToFileURL(W.SHIM).href, script], { encoding: "utf8", timeout: 60000 }), o = r.status === 0 ? JSON.parse(r.stdout) : {};
        ok("!! a child under the shim runs and prints its facts", r.status === 0 && typeof o === "object" && "fakeJoin" in o, (r.stderr || "").slice(0, 200));
        okPosixHost("!! a FAKE root is spelled with backslashes by join, resolve and normalize, exactly as win32 does", o.fakeJoin === "\\x\\brain\\a.jsonl" && o.fakeResolve === "\\zz\\q\\r" && o.fakeNormalize === "\\x\\a", J([o.fakeJoin, o.fakeResolve, o.fakeNormalize]));
        okPosixHost("!! a REAL root is not respelled (the box's own fs and child processes need it): the temporary directory, /tmp, and the root itself ('/'); one fake segment alone is", o.realJoin === path.join(real, "f.txt") && o.realJoin.startsWith("/") && !o.realJoin.includes("\\") && o.tmpJoin === "/tmp/w" && o.root === "/" && o.fakeOne === "\\x", J([o.tmpJoin, o.root, o.fakeOne]));
        ok("!! path.relative answers with backslashes for every path, also up and back, and an empty answer stays empty", o.rel === "b\\c" && o.relUp === "..\\c" && o.relSame === "", J([o.rel, o.relUp, o.relSame]));
        ok("!! the fs takes either separator, as Windows does: a file spelled with a backslash is read, found, measured, listed, written, copied and renamed; a missing one is still missing; a non-string argument passes through", o.readBack === "hello" && o.exists === true && o.existsNo === false && o.stat === 5 && o.list === "f.txt" && o.plainRead === "hello" && o.wrote === "w" && o.copied === "w" && o.renamed === true && o.nonString === true, J(o));
    } finally { fs.rmSync(script, { force: true }); fs.rmSync(real, { recursive: true, force: true }); }
    const src = fs.readFileSync(W.SHIM, "utf8"), code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! the shim has no exports (importing it is the act), patches path and fs only, and uses neither a clock nor Math.random", !/^export /m.test(code) && (code.match(/^import .* from "(.*)";$/gm) || []).join("|") === 'import path from "node:path";|import fs from "node:fs";' && !/Math\.random|Date\.now|new Date/.test(code));
}

sec("4. THE PROBE (real fixture gates, plain and under the shim)");
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "winprobe-gate-"));
    const gate = (name, body) => { fs.writeFileSync(path.join(tmp, name), `import path from "node:path"; import fs from "node:fs";
let fails = 0; const ok = (n, c) => { console.log((c ? "  PASS  " : "  FAIL  ") + n); if (!c) fails++; };
${body}
console.log(fails ? fails + " FAIL" : "all checks pass"); process.exitCode = fails ? 1 : 0;`); return name; };
    try {
        // v4912: a stub reader keyed by a posix path, called with path.join(root, name)
        const stub = gate("stub-selfcheck.mjs", `const files = { "/x/brain/a.jsonl": "ok" }; const read = (p) => files[p]; const load = (root, name) => read(path.join(root, "brain", name));
ok("the stub answers", load("/x", "a.jsonl") === "ok");`);
        const stubFixed = gate("stubfixed-selfcheck.mjs", `const files = { "/x/brain/a.jsonl": "ok" }; const read = (p) => files[p.replace(/\\\\/g, "/")]; const load = (root, name) => read(path.join(root, "brain", name));
ok("the stub answers", load("/x", "a.jsonl") === "ok");`);
        // v4882: path.relative compared with posix names
        const rel = gate("rel-selfcheck.mjs", `const posix = ["a/b.mjs"]; const r = path.relative("/home/q", "/home/q/a/b.mjs"); ok("the relative path is listed", posix.includes(r));`);
        const relFixed = gate("relfixed-selfcheck.mjs", `const posix = ["a/b.mjs"]; const r = path.relative("/home/q", "/home/q/a/b.mjs").replace(/\\\\/g, "/"); ok("the relative path is listed", posix.includes(r));`);
        // no false alarm: a real temporary file written and read back, a relative path used to read, a join of real roots
        const realFile = gate("real-selfcheck.mjs", `const d = fs.mkdtempSync(path.join(${J(os.tmpdir())}, "wp-")); const f = path.join(d, "a.txt"); fs.writeFileSync(f, "z"); const back = path.join(d, path.relative(d, f));
ok("a real file is read back through a relative path", fs.readFileSync(back, "utf8") === "z" && fs.existsSync(f)); fs.rmSync(d, { recursive: true, force: true });`);
        const redBoth = gate("red-selfcheck.mjs", `ok("this gate is red whatever the spelling", false);`);
        const R = {}; for (const g of [stub, stubFixed, rel, relFixed, realFile, redBoth]) R[g] = await W.probeGate(g, { cwd: tmp });
        {
            okPosixHost("!! the v4912 class: a stub reader keyed by '/x/brain/a.jsonl' that a module calls with path.join is green plain and RED under the shim -- the rig's failure, reproduced in the sandbox", R[stub].verdict === "RED ONLY UNDER THE WIN32 SPELLING" && R[stub].plain.fails === 0 && R[stub].plain.code === 0 && R[stub].shim.fails === 1 && R[stub].shim.code === 1, J(R[stub]));
            ok("!! the same gate with one side normalised (the fix of 5ec2d403) is the SAME plain and under the shim", R[stubFixed].verdict === "SAME" && R[stubFixed].shim.fails === 0 && R[stubFixed].shim.code === 0, J(R[stubFixed]));
            okPosixHost("!! the v4882 class: path.relative compared with a posix name is green plain and RED under the shim; with the backslashes replaced it is the SAME", R[rel].verdict === "RED ONLY UNDER THE WIN32 SPELLING" && R[relFixed].verdict === "SAME");
            ok("!! NO FALSE ALARM: a gate that writes a real temporary file and reads it back through a path.relative is the SAME (the shim does not respell real roots, and the fs takes backslashes)", R[realFile].verdict === "SAME" && R[realFile].plain.code === 0, J(R[realFile]));
            ok("!! a gate that is red whatever the spelling is 'RED BOTH WAYS' (not this probe's finding), with its exit code", R[redBoth].verdict === "RED BOTH WAYS" && R[redBoth].plain.fails === 1 && R[redBoth].shim.fails === 1 && R[redBoth].plain.code === 1);
            const sr = (map) => async (args) => map(args.includes("--import"));
            const mk = async (plain, shim) => W.probeGate("g.mjs", { run: sr((s) => (s ? shim : plain)) });
            const out = (fails, code) => ({ stdout: Array.from({ length: fails }, () => "  FAIL  x").join("\n") + "\n", stderr: "", status: code });
            const v1 = await mk(out(0, 0), out(0, 0)), v2 = await mk(out(0, 0), out(2, 1)), v3 = await mk(out(2, 1), out(0, 0)), v4 = await mk(out(2, 1), out(2, 1)), v5 = await mk(out(0, 0), { stdout: "", stderr: "", status: null }), v6 = await mk(out(1, 1), out(3, 1)), v7 = await mk(out(0, 0), { stdout: "all checks pass", stderr: "boom", status: 1 });
            ok("!! the verdict logic on stub runs: same and green is SAME; green plain and red shim is RED ONLY UNDER THE WIN32 SPELLING; red plain and green shim is GREEN ONLY UNDER THE SHIM; the same red is RED BOTH WAYS; a killed shim run (status null) is read as exit -1 and differs; red both ways with different counts is RED BOTH WAYS; a crash with no FAIL line (exit 1, no red lines) differs from a clean run", v1.verdict === "SAME" && v2.verdict === "RED ONLY UNDER THE WIN32 SPELLING" && v3.verdict === "GREEN ONLY UNDER THE SHIM" && v4.verdict === "RED BOTH WAYS" && v5.verdict === "RED ONLY UNDER THE WIN32 SPELLING" && v5.shim.code === -1 && v6.verdict === "RED BOTH WAYS" && v7.verdict === "RED ONLY UNDER THE WIN32 SPELLING" && v7.shim.fails === 0 && v7.shim.code === 1, J([v1.verdict, v2.verdict, v3.verdict, v4.verdict, v5.verdict, v6.verdict, v7.verdict]));
            const v8 = await mk({ stdout: "", stderr: "", status: null }, { stdout: "", stderr: "", status: null }), v9 = await mk({ stdout: "", stderr: "", status: undefined }, out(0, 0));
            ok("!! a gate killed at the timeout both ways is NOT READ (not 'red both ways': nothing was seen); one killed only plain is a difference; an undefined status is read as killed too", v8.verdict === "NOT READ (BOTH KILLED AT THE TIMEOUT)" && v8.plain.code === -1 && v8.shim.code === -1 && v9.plain.code === -1 && v9.verdict !== "SAME", J([v8.verdict, v9.verdict]));
            const order = []; await W.probeGate("g.mjs", { run: async (args) => { const tag = args.includes("--import") ? "shim" : "plain"; order.push("start " + tag); await new Promise((r) => setTimeout(r, 20)); order.push("end " + tag); return { stdout: "", stderr: "", status: 0 }; } });
            ok("!! the two runs of one gate go ONE AFTER THE OTHER (plain ends before the shim starts): two copies of a gate that writes a scratch file or watches for one read each other's", J(order) === J(["start plain", "end plain", "start shim", "end shim"]), J(order));
            ok("!! failsOf counts the lines that start with FAIL after spaces and nothing else (a PASS line that mentions FAIL is not a red)", W.failsOf("  FAIL  a\n  PASS  FAIL in a detail\nFAIL b\n   FAIL c\nxFAIL d\n") === 3 && W.failsOf("") === 0 && W.failsOf(undefined) === 0);
            const killed = await W.runNode(["-e", "setTimeout(() => {}, 5000)"], { cwd: tmp, timeout: 300 }), fine = await W.runNode(["-e", "console.log('a'); console.error('b'); process.exit(3)"], { cwd: tmp, timeout: 20000 });
            ok("!! runNode returns stdout, stderr and the exit code, and kills a process at its timeout (status null)", killed.status === null && fine.status === 3 && fine.stdout.trim() === "a" && fine.stderr.trim() === "b");
        }
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

{
    sec("5. THE COMMAND");
    const run = async (argv, io = {}) => { const out = [], errs = []; const code = await W.main(argv, { print: (t) => out.push(t), err: (t) => errs.push(t), ...io }); return { code, out: out.join(""), errs }; };
    const clean = await run([], { scan: () => ({ hits: [], counts: { W1: 0, W2: 0, W3: 0, W4: 116, W5: 0 }, files: 3102 }) });
    ok("!! the static report on a clean tree: the file count, one line per rule with its count and its allowance, 'STATIC: clean', exit 0", clean.code === 0 && /^winPathLint: 3102 files, five static rules/.test(clean.out) && clean.out.split("\n").filter((l) => /^  OK  W\d /.test(l)).length === 5 && /W4 .*: 116 \(allowed 116\)/.test(clean.out) && /STATIC: clean\n$/.test(clean.out));
    const bad = await run([], { scan: () => ({ hits: [{ file: "tools/ship/x-selfcheck.mjs", rule: "W1", line: 12, text: "const c = `${NODE} y`;" }, { file: "a-selfcheck.mjs", rule: "W4", line: 3, text: "path.relative(a, b)" }], counts: { W1: 1, W2: 0, W3: 0, W4: 117, W5: 0 }, files: 5 }) });
    ok("!! a rule over its baseline is RED for that rule: its hits are listed as file:line: text with the fix, the rule within its allowance is not listed, the last line says a rule is over, exit 1", bad.code === 1 && /RED W1 .*: 1 \(allowed 0\)/.test(bad.out) && /tools\/ship\/x-selfcheck\.mjs:12: const c = `\$\{NODE\} y`;/.test(bad.out) && /fix: quote it/.test(bad.out) && /RED W4 .*: 117 \(allowed 116\)/.test(bad.out) && /a-selfcheck\.mjs:3: path\.relative\(a, b\)/.test(bad.out) && /STATIC: A RULE IS OVER ITS BASELINE\n$/.test(bad.out) && !/OK  W1/.test(bad.out));
    const mkp = (table) => async (g) => table[g] || { gate: g, plain: { fails: 0, code: 0 }, shim: { fails: 0, code: 0 }, verdict: "SAME" };
    const redG = { gate: "b-selfcheck.mjs", plain: { fails: 0, code: 0 }, shim: { fails: 2, code: 1 }, verdict: "RED ONLY UNDER THE WIN32 SPELLING" };
    const p1 = await run(["--probe", "b-selfcheck.mjs", "a-selfcheck.mjs"], { probe: mkp({ "b-selfcheck.mjs": redG }) });
    ok("!! probing named gates: sorted by name, one line each with the plain and shim red counts and exit codes, the red-only-under-the-shim gate named in the last line, exit 1", p1.code === 1 && /^winPathLint --probe: 2 gate\(s\)/.test(p1.out) && p1.out.indexOf("a-selfcheck.mjs") < p1.out.indexOf("b-selfcheck.mjs") && /RED ONLY UNDER THE WIN32 SPELLING  b-selfcheck\.mjs  \(plain 0 red, exit 0; shim 2 red, exit 1\)/.test(p1.out) && /same  a-selfcheck\.mjs  \(plain 0 red, exit 0; shim 0 red, exit 0\)/.test(p1.out) && /PROBE: 1 gate\(s\) RED ONLY UNDER THE WIN32 SPELLING -- CANDIDATES for a red on the rig, not a verdict \(.*\): b-selfcheck\.mjs\n$/.test(p1.out) && !/the rig would say the same/.test(p1.out));
    const p2 = await run(["--probe", "a-selfcheck.mjs"], { probe: mkp({}) });
    ok("!! probing gates that are all the same: 'no gate answers differently', exit 0", p2.code === 0 && /PROBE: no gate answers differently under the win32 spelling\n$/.test(p2.out));
    const seen = []; const p3 = await run(["--probe", "--changed"], { changed: () => ["c-selfcheck.mjs", "d-selfcheck.mjs"], probe: async (g) => { seen.push(g); return mkp({})(g); } }), p4 = await run(["--probe", "--all"], { gates: () => ["e-selfcheck.mjs"], probe: async (g) => { seen.push(g); return mkp({})(g); } });
    ok("!! --changed takes the changed gates and --all every gate, each probed once", p3.code === 0 && p4.code === 0 && J(seen) === J(["c-selfcheck.mjs", "d-selfcheck.mjs", "e-selfcheck.mjs"]) && /2 gate\(s\)/.test(p3.out) && /1 gate\(s\)/.test(p4.out));
    const log7 = []; const seq = async (g) => { log7.push("start " + g); await new Promise((r) => setTimeout(r, 5)); log7.push("end " + g); return mkp({})(g); };
    const mut = await run(["--probe", "--all"], { gates: () => ["e-selfcheck.mjs", W.MUTATORS[0], "f-selfcheck.mjs"], probe: seq }), mutNamed = await run(["--probe", W.MUTATORS[0]], { probe: seq });
    ok("!! --all leaves out the gates that edit other gates (tools/ship/gateMutation-selfcheck.mjs, which left eleven gates carrying its injected failure in the first whole-tree probe) and says 2 gates; naming it runs it", J(W.MUTATORS) === J(["tools/ship/gateMutation-selfcheck.mjs"]) && Object.isFrozen(W.MUTATORS) && /2 gate\(s\)/.test(mut.out) && !mut.out.includes("gateMutation") && /1 gate\(s\)/.test(mutNamed.out) && mutNamed.out.includes("gateMutation-selfcheck.mjs"));
    const calls7 = []; const twice = async (g) => { calls7.push(g); const first = calls7.filter((x) => x === g).length === 1; return g === "flaky-selfcheck.mjs" && !first ? { gate: g, plain: { fails: 0, code: 0 }, shim: { fails: 0, code: 0 }, verdict: "SAME" } : g.startsWith("flaky") || g.startsWith("real") ? { gate: g, plain: { fails: 0, code: 0 }, shim: { fails: 1, code: 1 }, verdict: "RED ONLY UNDER THE WIN32 SPELLING" } : mkp({})(g); };
    const par = await run(["--probe", "flaky-selfcheck.mjs", "real-selfcheck.mjs", "ok-selfcheck.mjs", "--workers", "2"], { probe: twice }), seqRun = await run(["--probe", "flaky-selfcheck.mjs"], { probe: async (g) => { calls7.push("1w " + g); return { gate: g, plain: { fails: 0, code: 0 }, shim: { fails: 1, code: 1 }, verdict: "RED ONLY UNDER THE WIN32 SPELLING" }; } });
    ok("!! a gate that differs while others run beside it counts only if it repeats ALONE: with --workers 2 a flagged gate is probed again, the one that comes back SAME is named as 'differed beside other gates and not alone (not counted)', the one that repeats stays a candidate, exit 1; with one worker nothing is probed twice", par.code === 1 && calls7.filter((x) => x === "flaky-selfcheck.mjs").length === 2 && calls7.filter((x) => x === "real-selfcheck.mjs").length === 2 && calls7.filter((x) => x === "ok-selfcheck.mjs").length === 1 && /differed beside other gates and not alone \(not counted\): flaky-selfcheck\.mjs\n/.test(par.out) && /PROBE: 1 gate\(s\) RED ONLY.*: real-selfcheck\.mjs\n$/.test(par.out) && !/RED ONLY UNDER THE WIN32 SPELLING  flaky/.test(par.out) && /same  flaky-selfcheck\.mjs/.test(par.out) && seqRun.code === 1 && calls7.filter((x) => x === "1w flaky-selfcheck.mjs").length === 1 && !/not counted/.test(seqRun.out));
    const par2 = await run(["--probe", "flaky-selfcheck.mjs", "--workers", "2"], { probe: async (g) => (calls7.push("p2 " + g), calls7.filter((x) => x === "p2 " + g).length === 1 ? { gate: g, plain: { fails: 0, code: 0 }, shim: { fails: 1, code: 1 }, verdict: "RED ONLY UNDER THE WIN32 SPELLING" } : { gate: g, plain: { fails: 0, code: 0 }, shim: { fails: 0, code: 0 }, verdict: "SAME" }) });
    ok("!! when every flagged gate fails to repeat alone the probe says no gate answers differently (exit 0), and still names what it did not count", par2.code === 0 && /not counted\): flaky-selfcheck\.mjs/.test(par2.out) && /PROBE: no gate answers differently/.test(par2.out));
    const none = await run(["--probe", "--changed"], { changed: () => [] });
    ok("!! --changed with nothing changed says so and is exit 0", none.code === 0 && none.out === "winPathLint --probe: no gate to probe\n");
    let live = 0, peak = 0; const slow = async (g) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 15)); live--; return mkp({})(g); };
    await run(["--probe", "a", "b", "c", "d", "e", "--workers", "3"], { probe: slow }); const peak3 = peak; peak = 0; await run(["--probe", "a", "b"], { probe: slow });
    ok("!! --workers N probes N gates at a time (3 on five gates run three at once; the default is one at a time)", peak3 === 3 && peak === 1, J([peak3, peak]));
    const u = [await run(["--bogus"]), await run(["--probe"]), await run(["--probe", "--bogus"]), await run(["--probe", "--changed", "--all"]), await run(["--probe", "a", "--all"]), await run(["--probe", "--all", "a"]), await run(["--probe", "a", "--workers", "0"]), await run(["--probe", "a", "--workers", "x"]), await run(["--probe", "a", "--workers", "17"])];
    ok("!! the usage errors are exit 2 with the usage line and the fault: a stray word, --probe with nothing, an unknown option, --changed with --all, named gates with --all (either order), --workers 0, not a number, 17", u.every((r) => r.code === 2 && r.errs.length === 1 && r.errs[0].startsWith(W.USAGE)) && /not understood: --bogus/.test(u[0].errs[0]) && /needs gates, --changed or --all/.test(u[1].errs[0]) && /not understood: --bogus/.test(u[2].errs[0]) && /exclusive/.test(u[3].errs[0]) && /exclusive/.test(u[4].errs[0]) && /exclusive/.test(u[5].errs[0]) && /--workers is a whole number from 1 to 16, got 0/.test(u[6].errs[0]) && /got x/.test(u[7].errs[0]) && /got 17/.test(u[8].errs[0]));
    const gitOut = { "rev-parse": "WebGLEngine/\n", diff: "WebGLEngine/tools/ship/winPathLint-selfcheck.mjs\nWebGLEngine/brain/capabilityMap-selfcheck.mjs\nWebGLEngine/tools/ship/notAGate.mjs\nWebGLEngine/tools/ship/gone-selfcheck.mjs\n", status: " M WebGLEngine/tools/ship/winPathLint-selfcheck.mjs\n?? WebGLEngine/brain/capabilityMap-selfcheck.mjs\n M docs/CHANGELOG.md\n" };
    const ch = W.changedGates((a) => gitOut[a[0]]);
    ok("!! changedGates reads the diff against origin/main and the uncommitted files, strips the repository prefix, keeps only *-selfcheck.mjs files that exist, sorted and once each", J(ch) === J(["brain/capabilityMap-selfcheck.mjs", "tools/ship/winPathLint-selfcheck.mjs"]), J(ch));
    const ch2 = W.changedGates((a) => ({ "rev-parse": "\n", diff: "tools/ship/winPathLint-selfcheck.mjs\n", status: "" })[a[0]]);
    ok("!! and from inside WebGLEngine (an empty prefix) the same files by their own names", J(ch2) === J(["tools/ship/winPathLint-selfcheck.mjs"]));

    sec("6. THE SOURCE");
    const raw = fs.readFileSync(path.join(HERE, "winPathLint.mjs"), "utf8"), code = raw.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! no Math.random and no clock; the imports are fs, path, url and child_process", !/Math\.random|Date\.now|new Date|performance\.now/.test(code) && J([...code.matchAll(/^import .* from "(.*)";$/gm)].map((m) => m[1]).sort()) === J(["node:child_process", "node:fs", "node:path", "node:url"]));
    ok("!! the command runs as a program: exit 0 and the static report on the real tree; an unknown flag exits 2 with the usage on stderr; imported, it does nothing by itself", (() => { const a = spawnSync(process.execPath, [path.join(HERE, "winPathLint.mjs")], { encoding: "utf8", timeout: 60000 }), b = spawnSync(process.execPath, [path.join(HERE, "winPathLint.mjs"), "--bogus"], { encoding: "utf8", timeout: 60000 }); return a.status === 0 && /STATIC: clean/.test(a.stdout) && b.status === 2 && b.stderr.startsWith(W.USAGE) && b.stdout === ""; })());

    sec("7. THE WINDOWS HOST (the four POSIX-host rows are skipped there, named, and nothing else is)");
    if (process.env.SWEK_WPL_CHILD) console.log("  NOTE  the pretend-host row is not nested (this run IS the child)");
    else {
        const c = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { encoding: "utf8", timeout: 240000, env: { ...process.env, SWEK_PRETEND_WIN32_HOST: "1", SWEK_WPL_CHILD: "1" } }), out = c.stdout || "", skips = out.match(/^  SKIP  .*$/gm) || [];
        ok("!! SWEK_PRETEND_WIN32_HOST=1 (what a win32 host does by itself): the gate run again in a child exits 0 with no FAIL row and exactly four SKIP rows -- the fake-root row, the real-root row, the v4912 class and the v4882 class -- and still prints every other row as PASS", c.status === 0 && !/^  FAIL/m.test(out) && skips.length === 4 && skips.some((l) => /a FAKE root/.test(l)) && skips.some((l) => /a REAL root/.test(l)) && skips.some((l) => /the v4912 class/.test(l)) && skips.some((l) => /the v4882 class/.test(l)) && (out.match(/^  PASS/gm) || []).length >= 40, J({ status: c.status, skips: skips.length, pass: (out.match(/^  PASS/gm) || []).length }));
    }

    console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
    finished = true;
    process.exitCode = fails ? 1 : 0;
}
