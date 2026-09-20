// WebGLEngine/tools/ship/failLines-selfcheck.mjs -- v4647
//
// GATES tools/ship/failLines.mjs: running a second box's red gates ALONE and keeping their assertion lines,
// so "48 NEW red" on another machine becomes forty-eight readable findings instead of forty-eight exit codes.
//
// *** THE VERDICTS ARE DRIVEN THROUGH AN INJECTED spawn, WHICH IS THE ONLY WAY THREE OF THEM CAN BE. ***
// A gate that CRASHES -- exits non-zero having printed no failing row -- is the case this tool exists to
// separate, and this tree cannot produce one on demand without writing a broken gate to run. So the child
// process is a parameter, every verdict is reached from a fixture, and the classification is measured rather
// than described.
"use strict";
import { FAIL_LINE, gatesFromVerify, runOne, summarise, describe, treeStamp } from "./failLines.mjs";

let fails = 0;
const ok = (n, c, d = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };

// A fake child: whatever text and status the row wants.
const child = (stdout, status, extra = {}) => () => ({ stdout, stderr: "", status, ...extra });

console.log("failLines-selfcheck -- an exit code is not a finding\n");

console.log("1. *** THE RITUAL'S OWN RULE, IN CODE: A FAILING ROW STARTS THE LINE ***");
{
    ok("!! *** two spaces then FAIL is a row; the word FAIL in prose is not ***",
       FAIL_LINE.test("  FAIL  the thing") && !FAIL_LINE.test("a note about FAIL cases") &&
       !FAIL_LINE.test("FAIL -- 3 check(s)") && !FAIL_LINE.test("    FAIL  indented further"),
       "the ship ritual says `grep -c '^  FAIL'`, never `grep -c FAIL` -- a gate with one red row and four " +
       "mentions of the word reads as five failures under the loose rule, and the summary line is itself a mention");
    ok("  and a bare '  FAIL' with nothing after it still counts",
       FAIL_LINE.test("  FAIL"), "a row with an empty name is still a row");
}

console.log("\n2. *** THE FOUR VERDICTS, EACH REACHED FROM A FIXTURE ***");
{
    const green = runOne("x.mjs", { spawn: child("  PASS  fine\nALL GREEN", 0) });
    ok("!! exit 0 with no failing row is GREEN", green.verdict === "GREEN" && green.fails === 0);
    const red = runOne("x.mjs", { spawn: child("  PASS  a\n  FAIL  b is wrong\n  FAIL  c too\nFAIL -- 2 check(s)", 1) });
    ok("!! *** exit non-zero WITH failing rows is RED -- the gate found something and said what ***",
       red.verdict === "RED" && red.fails === 2 && red.lines[0] === "FAIL  b is wrong",
       `${red.fails} row(s) kept, and the summary line "FAIL -- 2 check(s)" is NOT one of them`);
    const crashed = runOne("x.mjs", { spawn: child("1. THE FIRST SECTION\n  PASS  a\nSyntaxError: boom", 1) });
    ok("!! *** exit non-zero with NO failing row is CRASHED, and that is its own verdict ***",
       crashed.verdict === "CRASHED" && crashed.fails === 0,
       "six times this session a sabotage produced exit 1 with no failing row -- an eager detail string that " +
       "threw, a helper undefined on that platform, a row that called the thing it tested for absence of. " +
       "What such a gate was checking is UNKNOWN, not false, and that is a different thing to go and read");
    const odd = runOne("x.mjs", { spawn: child("  FAIL  something\nALL GREEN", 0) });
    ok("!! exit 0 while printing a failing row is ODD -- a gate whose verdict and output disagree",
       odd.verdict === "ODD" && odd.fails === 1,
       "process.exit() truncating through a pipe produced exactly this shape at v4586");
}

console.log("\n3. A KILLED CHILD IS A CRASH, NOT A PASS");
{
    // spawnSync returns status null when the child is killed. Reading that as 0 would turn a timeout into a
    // green, which is the single most expensive mistake this whole file exists to avoid.
    const killed = runOne("x.mjs", { spawn: child("1. STARTED\n", null, { signal: "SIGTERM" }) });
    ok("!! *** status null with a signal is exit 124 and CRASHED, never 0 ***",
       killed.exit === 124 && killed.verdict === "CRASHED" && killed.signal === "SIGTERM",
       `exit=${killed.exit}, verdict=${killed.verdict} -- a timeout read as success is a false green with a ` +
       `clock behind it`);
    const nullNoSignal = runOne("x.mjs", { spawn: child("", null) });
    ok("  and status null with no signal is still non-zero rather than assumed fine",
       nullNoSignal.exit === 1 && nullNoSignal.verdict === "CRASHED");
}

console.log("\n4. THE VERIFY OUTPUT IS PARSED FROM ITS OWN WORDS");
{
    const LINE = `[verify] FAIL  quick sweep: no gate outside the red register is red  -- NEW RED: ` +
                 `a/b-selfcheck.mjs exit 1, c/d-selfcheck.mjs exit 3221226505 -- fix it or register it in redCensus.mjs with a reason`;
    const g = gatesFromVerify(LINE);
    ok("!! *** the NEW RED list is read straight out of a verify run, so nobody retypes forty-eight paths ***",
       g.length === 2 && g[0].gate === "a/b-selfcheck.mjs" && g[1].sweepExit === 3221226505,
       `${g.map((x) => x.gate).join(", ")} -- and 3221226505 is 0xC0000409, the stack-buffer-overrun this ` +
       `tree already has an open item about`);
    ok("  ...and the trailing advice is not mistaken for a gate",
       !g.some((x) => /fix it|redCensus/.test(x.gate)),
       "the list ends at ` -- fix it`, which is prose");
    ok("!! CONTROL: text with no NEW RED list yields nothing rather than guessing",
       gatesFromVerify("[verify] all green").length === 0 && gatesFromVerify("").length === 0 &&
       gatesFromVerify(null).length === 0,
       "a parser that invented a gate from an unrelated line would send somebody to read a file that is fine");
}

console.log("\n5. THE SUMMARY SEPARATES WHAT A PERSON HAS TO READ FROM WHAT THEY DO NOT");
{
    const rows = [
        runOne("green.mjs", { spawn: child("ALL GREEN", 0) }),
        runOne("red.mjs", { spawn: child("  FAIL  x", 1) }),
        runOne("crash.mjs", { spawn: child("Error: boom", 1) }),
    ];
    const s = summarise(rows);
    ok("!! the counts are by VERDICT, so a crash is never folded in with a finding",
       s.of === 3 && s.GREEN === 1 && s.RED === 1 && s.CRASHED === 1 && s.totalFailRows === 1,
       JSON.stringify(s));
    const text = describe(rows);
    ok("!! *** and a GREEN gate that was red in the sweep is named as CONTENTION rather than as a fix ***",
       /contention, not a finding/.test(text) && /two-phase/.test(text),
       "redCensus measured 46 red under -P and 7 green alone; Keith's Windows box reports 143 such gates, " +
       "11% of the swept population. A tool that called those fixed would be lying about 143 gates");
    ok("  the crashed ones are pushed to the front of what to read",
       /CRASHED: exit non-zero with no failing row/.test(text) && /Read these first/.test(text));
    ok("  and a green gate contributes no lines to read, because there is nothing to read",
       !/green\.mjs/.test(text), "the report is what is left to do, not a transcript");
}

console.log("\n6. *** WHICH TREE THE READINGS WERE TAKEN AGAINST -- v4647 ***");
{
    // The first real capture was taken at 58603dcf and would have landed in a commit whose parent is
    // 0bd8ff5d, reading as a measurement of a tree in which five of its own reds had already been repaired.
    // That is the sweep-timings defect one round later, in the tool written to fix the diagnosis problem.
    const fake = (out, status = 0) => (cmd, args) => ({ stdout: out(args), status, stderr: "" });
    const st = treeStamp({ run: fake((a) => a[0] === "rev-parse" && a[1] === "HEAD" ? "abcdef0123456789\n"
                                       : a[0] === "rev-parse" ? "some-branch\n" : "") });
    ok("!! *** the commit is recorded, short and comparable ***",
       st.commit === "abcdef012345" && st.branch === "some-branch" && st.dirty === false,
       JSON.stringify(st));
    const dirty = treeStamp({ run: fake((a) => a[0] === "status" ? " M a.mjs\n" : "abcdef0123456789\n") });
    ok("!! *** a DIRTY tree is recorded, not refused -- a red found on a modified tree is still a red ***",
       dirty.dirty === true, "refusing would hide a finding; qualifying it does not");
    const noGit = treeStamp({ run: () => ({ status: 128, stdout: "", stderr: "not a repository" }) });
    ok("!! CONTROL: a box with no git still captures, and says the stamp is missing rather than inventing one",
       noGit.commit === null && /could not answer/.test(noGit.why),
       "the capture is the point; the stamp is how it is compared later");
    // *** AND THIS ROW HAS TO CATCH, WHICH A SABOTAGE TAUGHT ME FOR THE SECOND TIME THIS SESSION. ***
    // The first draft called treeStamp straight inside the condition. Removing the catch it exists to test
    // then threw out of ok() and took the gate down: exit 1 with ZERO failing rows, which is the very
    // verdict THIS FILE defines a whole category for. A row whose claim is "this does not throw" asserts it
    // by assuming it unless the row itself catches.
    const survives = (run) => { try { return treeStamp({ run }).commit === null; } catch { return false; } };
    ok("  ...and a git that THROWS is the same case, not a crash",
       survives(() => { throw new Error("ENOENT"); }),
       "this runs at the end of a diagnosis that has already done its work -- SEVENTH instance of the " +
       "crash-instead-of-a-finding species in this tree, written into the row about it");
}

console.log(`\nfailLines-selfcheck: ${fails === 0 ? "all checks pass" : fails + " FAILURE(S)"}`);
process.exit(fails === 0 ? 0 : 1);
