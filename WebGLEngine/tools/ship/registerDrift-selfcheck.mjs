// THE RED REGISTER, HELD TO WHAT ITS GATES ACTUALLY SAY (v4380).
//
// *** TWICE IN ONE SESSION A STANDING RED TURNED OUT TO BE UNOPENED MAIL. *** vendoredLicences was red from v4319
// to v4371 because vendor/three-webgpu was undeclared, and nobody ran it because it takes 15 s and the quick sweep
// caps at 3. rigJobs was red from v4129 to v4379 on a line naming a page whose panel had been deliberately removed
// -- filed as a fact about a deleted panel, when what it actually said was that fifteen entries of recorded
// reasoning had been unreachable for 250 rounds. Both were in the register, both were accurate, and neither was
// read. A register is supposed to be a list of reds somebody has ACCEPTED; these were reds nobody had opened.
//
// So this gate asks the one question that would have caught both: DOES EACH ENTRY STILL SAY WHAT IT SAYS IT SAYS?
// tools/ship/register-audit.mjs is the observed side, frozen by tools/ship/freezeRegisterAudit.mjs, which runs
// every gate in the census and writes down its exit code and its first failing line. This compares the two.
//
// *** THE AUDIT FOUND THREE THINGS AND EACH IS A DIFFERENT KIND. ***
//   1. engine/frameDirtyCensus-selfcheck.mjs prints its FAIL line to STDERR, alone among the 29. It still exits 1,
//      so the sweep sees the red -- but the MESSAGE is invisible to anything reading stdout, which is what every
//      consumer in this tree does. A red whose reason cannot be read is most of the way to a red nobody opens.
//   2. referenceKind's entry never recorded a failing line at all: its `fails` is the annotation "(confirmed red
//      serially at 73.7s -- mis-bucketed as a timeout by the parallel sweep)", which is about the SWEEP and not
//      about the gate. What the gate actually says is that a prose-rescued population may only shrink and stands
//      at 221 against a ceiling of 181 -- a RISING number, on a check whose own words are "A RISE MEANS A NEW
//      ORPHAN IS BEING HIDDEN BY A SENTENCE". A live, worsening signal filed under a note about bucketing.
//   3. shaderCensus recorded "only 4 files author a shader in BOTH languages" and now says FOURTEEN. That number
//      is not decoration: the gate has held since v3274 that a hand-written pair is cheaper than an IR "while few
//      files carry both languages -- if this count climbs toward twenty the arithmetic inverts, and THAT is when
//      to re-open the three-stage shape". It was 4 when filed, 12 at v4319 by docs/TSL-ROADMAP.md's own count,
//      and 14 now. THIS BRANCH PUT SOME OF THEM THERE: the TSL rounds added modules authoring both languages.
//      The register was quietly holding a counter that this session was driving toward its own stated trigger.
//
// WHAT THIS GATE DOES NOT DO: repair any of them, or judge whether a red should be accepted. It checks that the
// register's description of a red is the red's own description of itself, which is the difference between a list
// somebody keeps and a list somebody reads.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RED_AT_V4279 } from "./redCensus.mjs";
import { REGISTER_AUDIT } from "./register-audit.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
const byGate = new Map(REGISTER_AUDIT.rows.map((r) => [r.gate, r]));

console.log("\n1. EVERY REGISTER ENTRY WAS ACTUALLY RUN, and the audit is not older than the register");
{
    const missing = RED_AT_V4279.filter((e) => !byGate.has(e.gate));
    const extra = REGISTER_AUDIT.rows.filter((r) => !RED_AT_V4279.some((e) => e.gate === r.gate));
    ok(`!! *** every one of the ${RED_AT_V4279.length} standing reds appears in the audit, and the audit carries nothing the register does not ***`,
        missing.length === 0 && extra.length === 0,
        missing.length ? `never run: ${missing.map((e) => e.gate).join(", ")}`
                       : extra.length ? `audited but not registered: ${extra.map((r) => r.gate).join(", ")}`
                       : `${REGISTER_AUDIT.rows.length} rows, frozen at ${REGISTER_AUDIT.at} -- adding a register entry without re-freezing fails HERE rather than going unnoticed`);
}

console.log("\n2. NOTHING IN THE REGISTER IS SECRETLY GREEN");
{
    const green = REGISTER_AUDIT.rows.filter((r) => r.exit === 0);
    ok("!! *** no gate in the register passes: a red that has been repaired and left on the list is a check nobody is getting the benefit of ***",
        green.length === 0, green.length ? green.map((r) => r.gate).join(", ") : `all ${REGISTER_AUDIT.rows.length} still fail, so the register is not carrying a repaired gate as an excuse`);
    const timedOut = REGISTER_AUDIT.rows.filter((r) => r.exit === "timeout");
    ok(`  and a gate too slow to finish inside the audit's cap is recorded as TIMEOUT rather than as a verdict`,
        timedOut.every((r) => !r.first), timedOut.length ? `${timedOut.map((r) => r.gate.replace("tools/ship/", "")).join(", ")} at ${REGISTER_AUDIT.capMs} ms -- a bound, not a measurement` : "none timed out");
}

console.log("\n2b. THE FREEZE IS A CLAIM ABOUT THE PAST, SO A BOUNDED SAMPLE OF IT IS RE-RUN LIVE");
{
    // *** v4414 -- SECTION 2 READS THE FREEZE, SO A GATE REPAIRED AFTER THE FREEZE IS INVISIBLE TO IT. ***
    // Section 1 catches a register entry ADDED without re-freezing; the opposite case -- a red REPAIRED and
    // the audit not re-taken -- passed silently until v4414 repaired shaderCensus and this gate said nothing.
    // Re-taking all 28 costs minutes, so a DETERMINISTIC CHEAPEST-FIRST SAMPLE is re-run instead, under a
    // stated budget, and the coverage is reported rather than implied.
    const BUDGET_MS = 1200;
    const byCost = REGISTER_AUDIT.rows.filter((r) => typeof r.ms === "number").sort((a, b) => a.ms - b.ms);
    const sample = [];
    let cum = 0;
    for (const r of byCost) { if (cum + r.ms > BUDGET_MS) break; sample.push(r); cum += r.ms; }
    // *** AND EACH RE-RUN HAS TO PROVE IT RAN. *** The first draft of this block referenced an undefined ROOT
    // (the root here is called ENG); the ReferenceError was thrown inside the try, caught, read as exit 1, and
    // matched every frozen red -- so the check reported "10 of 28 re-run" in 47 ms while running nothing at
    // all. That is v4406's shape exactly, written in a round about instruments that measure the wrong thing,
    // so the gate's own OUTPUT is now the evidence rather than its exit code.
    const live = sample.map((r) => {
        let exit = 0, out = "";
        try { out = execFileSync(process.execPath, [r.gate], { cwd: ENG, encoding: "utf8", timeout: 20000, stdio: "pipe" }); }
        catch (e) { exit = typeof e.status === "number" ? e.status : -1; out = String((e && e.stdout) || ""); }
        return { gate: r.gate, frozen: r.exit, now: exit, said: /\bFAIL\b/.test(out) };
    });
    const moved = live.filter((r) => (r.frozen === 0) !== (r.now === 0));
    const silent = live.filter((r) => !r.said);
    ok(`!! *** a cheapest-first sample of the register is re-run LIVE, so a repaired red cannot hide behind the freeze ***`,
        moved.length === 0,
        moved.length ? `${moved.map((r) => `${r.gate} frozen exit ${r.frozen}, now ${r.now}`).join("; ")} -- re-run tools/ship/freezeRegisterAudit.mjs`
                     : `${live.length} of ${REGISTER_AUDIT.rows.length} gates re-run in a ${BUDGET_MS} ms budget (${cum} ms recorded), all still failing. THE OTHER ${REGISTER_AUDIT.rows.length - live.length} ARE TAKEN ON THE FREEZE'S WORD. *** AND THIS SAMPLE WOULD NOT HAVE CAUGHT v4414's OWN REPAIR: *** shaderCensus cost 279 ms, and the ten cheapest stop at ${sample[sample.length - 1].ms} ms. Raising the budget until it reached that one case would be fitting the instrument to the answer, which is the error the round that added this block is ABOUT. It is a bounded sample and the bound is the number above`);
    ok("  ...and every gate in the sample PRINTED a FAIL line, which is what says it ran at all",
        silent.length === 0 && live.every((r) => r.now >= 0),
        silent.length ? `${silent.map((r) => r.gate).join(", ")} produced no FAIL line -- a re-run reporting agreement without running is worth less than no check`
                      : `${live.length} gates, all printing. An exit code alone cannot tell "the gate failed" from "the runner failed", which is how this block passed in 47 ms on its first draft`);
    ok("  and the freeze stamps the version it was taken at, read from the tree rather than typed",
        /^v\d+$/.test(String(REGISTER_AUDIT.at)),
        `frozen at ${REGISTER_AUDIT.at}. Until v4414 that string was a literal and said v4380 however long ago the freeze was actually taken -- a staleness marker that could not go stale, in the file whose job is to make staleness visible`);
}

console.log("\n3. THE MESSAGE THE REGISTER RECORDS IS THE MESSAGE THE GATE GIVES");
{
    // AMONG the gate's failing lines, not just its FIRST. A gate with several reds is ordinary, and asking only
    // about the first reported drift on two gates that had not drifted at all -- the recorded line was still there,
    // with another one printed above it. The register names ONE line; the question is whether the gate still says it.
    const rows = RED_AT_V4279.map((e) => { const a = byGate.get(e.gate) || {};
        const rec = norm(e.fails), all = (a.all || []).map(norm);
        const head = rec.slice(0, 45);
        const matches = !!rec && all.some((n) => n.startsWith(head) || rec.startsWith(n.slice(0, 45)));
        return { gate: e.gate, rec, now: all.join(" | "), matches, exit: a.exit, nLines: all.length }; });
    const drifted = rows.filter((r) => r.exit !== "timeout" && !r.matches);
    for (const d of drifted) {
        console.log(`        ${d.gate.replace("tools/ship/", "")}`);
        console.log(`          register: ${d.rec.slice(0, 120) || "(nothing recorded)"}`);
        console.log(`          gate now: ${d.now.slice(0, 160) || "(no FAIL line on either stream)"}${d.nLines > 1 ? `   [${d.nLines} failing lines]` : ""}`);
    }
    ok(`!! *** every entry's recorded failing line is still the line the gate gives: ${rows.length - drifted.length} of ${rows.length} agree ***`,
        drifted.length === 0,
        drifted.length ? `${drifted.length} DRIFTED -- an entry describing a red the gate no longer gives is a red nobody has read since it was filed, which is how vendoredLicences went 52 rounds and rigJobs went 250`
                       : "so no entry is describing a red that has moved on without it");
}

console.log("\n4. A RED WHOSE REASON CANNOT BE READ");
{
    const stderrOnly = REGISTER_AUDIT.rows.filter((r) => r.onStderr);
    ok(`!! *** every gate prints its FAIL line where the tree reads it: ${REGISTER_AUDIT.rows.length - stderrOnly.length} of ${REGISTER_AUDIT.rows.length} on stdout ***`,
        stderrOnly.length === 0,
        stderrOnly.length ? `${stderrOnly.map((r) => r.gate).join(", ")} prints to STDERR. It still exits 1, so the sweep sees the red -- but every consumer in this tree scrapes stdout, so the REASON is invisible. That is most of the way to a red nobody opens, which is the failure this whole gate exists for`
                          : "so a red's reason reaches every consumer that scrapes a verdict");
    const noLine = REGISTER_AUDIT.rows.filter((r) => r.exit !== "timeout" && r.count === 0);
    ok("  and a gate that fails without printing any FAIL line at all is named, because an exit code with no sentence is a red nobody can act on",
        noLine.length === 0, noLine.length ? noLine.map((r) => r.gate).join(", ") : "every failing gate says something");
}

// SABOTAGE LOG -- applied, gate run, exit code read, restored. MEASURED at v4380.
//   BJ the shaderCensus entry put back to the stale count of 4 -> exit=1, 1 red, naming the gate and printing both
//      lines: what the register says and what the gate says. That is the whole mechanism in one failure.
//   BK the FAIL line moved back to stderr in engine/frameDirtyCensus-selfcheck.mjs, with the audit RE-FROZEN so the
//      change is observed rather than assumed -> exit=1, 1 red. Re-freezing is part of the sabotage: a check that
//      read the source instead of a run would have caught this one for the wrong reason.
//
// AND THIS GATE'S FIRST DRAFT REPORTED DRIFT ON TWO GATES THAT HAD NOT DRIFTED. It compared the register's line
// against the gate's FIRST failing line, and a gate with several reds is ordinary -- boundaryLint and
// pagePlacements each print another line above the one recorded, so both read as drifted when the recorded line was
// still there. The audit now freezes EVERY failing line and the comparison asks whether the recorded one is among
// them: 4 drifted became 2, and the two that remain are real.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: whether a red SHOULD be accepted, which is a judgement and not a comparison -- this gate only " +
    "asks whether the register's description matches the gate's; whether the three findings the v4380 audit turned up are " +
    "REPAIRED, which they are not, and each is named in the header rather than folded into a count; and whether shaderCensus's " +
    "climb from 4 to 14 has passed the point where this tree's own recorded reasoning says the hand-written-pair argument " +
    "inverts -- that is a decision about the engine's shape and belongs to a round of its own, not to a drift check.");
process.exit(fails ? 1 : 0);
