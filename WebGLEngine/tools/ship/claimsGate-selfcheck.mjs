// WebGLEngine/tools/ship/claimsGate-selfcheck.mjs — v2541
//
// Run: node tools/ship/claimsGate-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THE CLAIMS GATE PASSED ON ITS FIRST RUN. That is the most suspicious possible outcome: a gate that has never
// been seen to fail is indistinguishable from a gate that CANNOT fail, which is the exact thing it exists to
// forbid. So these feed it claims that are broken by construction and check it says so.
//
// (It passing was also the honest answer: the claims in predictions.html really are all falsifiable, and every
// settled verdict really does carry a measurement. The gate did not find a bug. It LOCKS THE DOOR -- the next
// unfalsifiable claim does not get in.)
//
// v4846 -- SECTION 8, A REFUSAL IN THE GATE'S OWN WORDS. verify.mjs's claims row ran claimsGate with stderr ignored, so
// "no predictions.html" and "parsed 0 claims" -- both said on stderr -- reached the gate as "claimsGate could not run:
// Command failed: <argv>". The row now pipes stderr and asks claimsGate.mjs's failedRunDetail. SABOTAGES (v4846), each
// applied in place, the gate run, the file restored (md5-identical). Reds are rows (`grep -c '^  FAIL'`), each by name:
//   A. failedRunDetail drops stderr (reads null for it)               -> 3 (zero claims, missing page, crash/timeout), each
//      printing the old "claimsGate could not run: Command failed: ..." -- the bug, reproduced by the gate
//   B. verify's claims call back to stdio ["ignore", "pipe", "ignore"] -> 1 (the wiring row, "stderr NOT piped")
//   C. verify's catch keeps an inline PROBLEMS parse, no helper call  -> 1 (the wiring row, "does NOT call failedRunDetail")
//   D. failedRunDetail no longer reads a PROBLEMS verdict             -> 1 (the PROBLEMS row, "ended without a verdict")
//   E. every non-verdict without claimsGate's own line called a crash -> *** FIRST TRY WENT 0 RED: the helper threw on the
//      launch failure (no stderr line to slice), and the uncaught throw stopped the gate before any section-8 row printed
//      -- exit 1 with nothing named. Every helper call here now goes through detailOf, which makes a throw the row's
//      detail. *** -> 2 (the launch row and the crash/timeout row, "failedRunDetail THREW")
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { extractClaims, judge, failedRunDetail } from "./claimsGate.mjs";
import { prose, noComments } from "./sourceScan.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const page = (claims) => "<script>\nconst CLAIMS = [\n" + claims.map((c) => "  {\n" +
    Object.entries(c).map(([k, v]) => "    " + k + ': "' + String(v).replace(/"/g, '\\"') + '",').join("\n") + "\n  },").join("\n") + "\n];\n</script>";

const GOOD = {
    name: "A well shaped claim",
    since: "v2541",
    state: "open",
    pred: "Something specific will happen.",
    why: "Because of a reason.",
    kill: "A single counterexample measured on the rig kills it outright.",
};

// ---- 1. the parser works on the real page shape ------------------------------------------------------------
{
    const c = extractClaims(page([GOOD]));
    ok("a claim round-trips out of the page", c.length === 1 && c[0].name === GOOD.name && c[0].kill === GOOD.kill);
    ok("...and a good claim has no problems", judge(c).length === 0);
}

// ---- 2. THE LAW: an OPEN claim with no kill is decoration ---------------------------------------------------
{
    const { kill, ...noKill } = GOOD;
    const p = judge(extractClaims(page([noKill])));
    ok("AN OPEN CLAIM WITH NO KILL IS CAUGHT", p.some(([, m]) => /unfalsifiable/.test(m)),
       p.length ? p[0][1].slice(0, 62) : "nothing reported");
}

// ---- 3. a verdict with no evidence is an assertion ----------------------------------------------------------
{
    const settled = { ...GOOD, state: "settled" };
    delete settled.kill;
    const p = judge(extractClaims(page([settled])));
    ok("SETTLED with nothing measured is caught", p.some(([, m]) => /assertion wearing a verdict/.test(m)));
    // ...and a settled claim WITH a measurement is fine, and does NOT need a kill: it already died or survived
    const done = { ...GOOD, state: "settled", measured: "Ran it, got 4.2ms, the prediction said under 5." };
    delete done.kill;
    ok("...but settled WITH a measurement passes", judge(extractClaims(page([done]))).length === 0);
}

// ---- 4. a kill condition that names no test ------------------------------------------------------------------
{
    const lazy = { ...GOOD, kill: "if it fails" };
    const p = judge(extractClaims(page([lazy])));
    ok("a kill too short to name a test is caught", p.some(([, m]) => /too short/.test(m)), '"if it fails"');
}

// ---- 5. the things that make a claim a claim ------------------------------------------------------------------
{
    for (const [drop, pat] of [["pred", /nothing is actually being claimed/], ["since", /cannot go stale/], ["state", /no `state`/]]) {
        const c = { ...GOOD }; delete c[drop];
        ok("a claim with no `" + drop + "` is caught", judge(extractClaims(page([c]))).some(([, m]) => pat.test(m)));
    }
    const weird = { ...GOOD, state: "probably" };
    ok("an invented state is caught", judge(extractClaims(page([weird]))).some(([, m]) => /unknown state/.test(m)));
}

// ---- 6. duplicate names ----------------------------------------------------------------------------------------
{
    const p = judge(extractClaims(page([GOOD, GOOD])));
    ok("two claims with one name is caught", p.some(([, m]) => /duplicate/.test(m)));
}

// ---- 7. THE PARSER MUST NOT SILENTLY FIND NOTHING --------------------------------------------------------------
// The worst outcome for this gate is not a false failure, it is a silent pass: a parser that finds zero claims
// reports "no problems" and the gate becomes theatre. A `pred` containing a ] would end a lazy regex early and
// drop every claim after it -- which is why extractClaims walks brackets instead.
{
    const tricky = { ...GOOD, pred: "An array like [1, 2] appears here, and a brace { too." };
    const c = extractClaims(page([tricky, GOOD]));
    ok("a claim containing ] and { does not eat the rest of the array", c.length === 2,
       "parsed " + c.length + " of 2");
    ok("empty input yields zero claims (the CLI treats that as a FAILURE)", extractClaims("<script>const X = 1;</script>").length === 0);
}

// ---- 8. v4846 -- A REFUSAL IS REPORTED IN THE GATE'S OWN WORDS, NOT AS "could not run" ---------------------------
// verify.mjs's claims row ignored the child's stderr, and two of the CLI's three exit-1 verdicts (no page, zero
// claims) are said there -- so the row printed "claimsGate could not run: Command failed: <argv>" for a gate that
// ran and refused. These run the REAL child the way verify does (its argv shape, stderr piped) against pages in a
// temp dir, and hand what it throws to failedRunDetail, the helper the row now calls.
{
    const HERE = path.dirname(fileURLToPath(import.meta.url));
    const ENG = path.resolve(HERE, "..", "..");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claimsGate-sc-"));
    // a helper that THROWS must turn its row red by name, not stop the gate before any row of this section prints
    const detailOf = (e) => { try { return failedRunDetail(e); } catch (x) { return "failedRunDetail THREW: " + x.message; } };
    const run = (file) => {
        try {
            execFileSync(process.execPath, [path.join(HERE, "claimsGate.mjs"), "--file", file],
                         { cwd: ENG, encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
            return { detail: "(claimsGate exited 0)" };
        } catch (e) { return { e, detail: detailOf(e) }; }
    };
    try {
        const empty = path.join(tmp, "empty.html");
        fs.writeFileSync(empty, "<script>\nconst NOTHING_HERE = [];\n</script>");
        const r0 = run(empty);
        ok("!! a page with ZERO claims: the row says claimsGate's own refusal, not 'could not run'",
           !!r0.e && r0.detail.startsWith("claimsGate: parsed 0 claims out of empty.html") && !/could not run/.test(r0.detail),
           r0.detail.slice(0, 70));
        const absent = path.join(tmp, "absent.html");
        const r1 = run(absent);
        ok("!! a MISSING page: the row says claimsGate's own refusal, not 'could not run'",
           !!r1.e && r1.detail.startsWith(("claimsGate: no " + absent + " -- the engine makes claims").slice(0, 100)) && !/could not run/.test(r1.detail),
           r1.detail.slice(0, 70));
        const { kill, ...noKill } = GOOD;
        const bad = path.join(tmp, "bad.html");
        fs.writeFileSync(bad, page([noKill]));
        const r2 = run(bad);
        ok("...and a PROBLEMS verdict still reads as the count and the first problem",
           !!r2.e && /^1 problem\(s\), first: OPEN with no `kill`/.test(r2.detail), r2.detail.slice(0, 70));
        // a launch failure is a REAL spawn that never starts: node itself, into a cwd that does not exist (ENOENT, no
        // stdout, no stderr, only e.message). Node and not a missing binary, because a non-node child marks this gate
        // spawnedNonNode in the input record and an incremental sweep could never skip it again.
        let e3 = null;
        try {
            execFileSync(process.execPath, [path.join(HERE, "claimsGate.mjs")],
                         { cwd: path.join(tmp, "gone"), encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] });
        } catch (e) { e3 = e; }
        const d3 = e3 ? detailOf(e3) : "(it launched)";
        ok("a launch failure (no stdout, no stderr) is the ONE case that says 'could not run'",
           !!e3 && e3.code === "ENOENT" && d3.startsWith("claimsGate could not run: ") &&
           ("claimsGate could not run: " + e3.message).startsWith(d3), d3.slice(0, 70));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    // the two non-verdicts that are neither: a crash names its Error line, and stdout with no verdict is not a launch
    const crash = detailOf({ stdout: "", stderr: "file:///x/claimsGate.mjs:9\n  oops(\n  ^\n\nSyntaxError: Unexpected end of input\n", message: "Command failed: node claimsGate.mjs" });
    const cut = detailOf({ stdout: "half a line", stderr: "", message: "spawnSync node ETIMEDOUT" });
    ok("a crash reports its Error line, and a timeout after output is not called a launch failure",
       crash === "claimsGate crashed: SyntaxError: Unexpected end of input" && cut === "claimsGate ended without a verdict: spawnSync node ETIMEDOUT",
       crash + " / " + cut);

    // and the row USES it: verify pipes the child's stderr and hands the error to failedRunDetail, with no inline copy
    const v = noComments(fs.readFileSync(path.join(HERE, "verify.mjs"), "utf8"));
    const at = v.indexOf('"tools/ship/claimsGate.mjs"');
    const row = at < 0 ? "" : v.slice(at, v.indexOf('"tools/ship/pageParse.mjs"', at));   // to the next row's child
    const piped = /stdio:\s*\["ignore",\s*"pipe",\s*"pipe"\]/.test(row), calls = /\.failedRunDetail\(e\)/.test(row), copy = /PROBLEMS/.test(row);
    ok("!! verify.mjs's claims row pipes stderr and reports through failedRunDetail",
       piped && calls && !copy,
       at < 0 ? "no claimsGate call in verify.mjs"
              : [piped ? "stderr piped" : "stderr NOT piped", calls ? "calls failedRunDetail" : "does NOT call failedRunDetail",
                 copy ? "and keeps its own PROBLEMS parse" : "no inline copy"].join(", "));
}

console.log(fails ? "\nclaimsGate-selfcheck: " + fails + " FAILED" : "\nclaimsGate-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
