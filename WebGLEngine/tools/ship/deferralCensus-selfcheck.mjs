#!/usr/bin/env node
// WebGLEngine/tools/ship/deferralCensus-selfcheck.mjs -- v4479
//
// Run: node tools/ship/deferralCensus-selfcheck.mjs   (~1s)
// Gated by tools/ship/selfchecks.mjs (discovery gate -- found by name, not by a list).
//
// *** THE BACKLOG BUILT TO STOP DEFERRALS LIVING IN PROSE HAD ITSELF BEEN LIVING IN PROSE FOR 925 VERSIONS. ***
// tools/ship/nextRounds.mjs (v3340) exists because v3313 and v3314 audited nineteen "its own round" notes by
// hand and found ten already settled. Its header names the failure mode: "writing them down in prose that
// nothing ever re-reads, so a finished item keeps advertising itself as open". As this round found it, the
// newest version any of its ten entries named was v3553, against an ENGINE_VERSION of v4478, and NOT ONE of
// the tree's 118 undecided prose deferrals was named by any entry -- reach 0 of 118.
//
// The design was never wrong. What was missing is the half that makes a backlog maintainable: something that
// ENUMERATES the prose, so the gap between what the tree says it owes and what it has written down is a number.
//
// SECTION 4 IS THE ONE THAT COST SOMETHING. The instrument only earns its place if the population it names can
// be adjudicated, so this round opened two files and found THREE stale notes -- two in a single paragraph,
// each settled within four rounds of being written and still advertising itself sixty-six versions later.
//
// ---- SABOTAGE LOG -- 17 edits, 17 red by name, FOUR of them 0 RED first ------------------------------------
// Caught at once: the word boundary dropped, re-admitting the substring trap (3 red); the negation class
// silenced (2); the ANTIDOTE token matched loosely on "goes red" (1); HISTORY_FILES emptied (2); the
// bookkeeping exclusion removed (3); a phrase dropped from the list (5); the frozen backlogFound record
// falsified (1); a new backlog entry closed (1); a SETTLED marker moved off its adjacent line (2); misWgsl's
// STRATEGY export renamed (1); ANTIDOTE looking forward instead of back (3); backlogReach counting every row (1).
//
// *** THE FOUR THAT SURVIVED ARE ALL ONE SHAPE: A CHECK THAT COMPARES AGAINST TODAY'S ANSWER CANNOT SEE A
// CONSTANT EQUAL TO TODAY'S ANSWER. ***
//   1. Widening SATISFIED to look at the PREVIOUS line as well went 0 RED -- the row tested that `next` works
//      and never that `prev` does not. The window is directional on purpose: a settlement is written AFTER
//      the claim it settles. Both directions are now driven, for SATISFIED and for ANTIDOTE.
//   2. backlogReach stubbed to return one row went 0 RED, because one row is the number expected. Counting a
//      thing is not the same as showing it discriminates, so the matched FILE is named and the 117 the
//      backlog does not mention are required to stay unmatched.
//   3. settledHere pointed at a file that does not exist CRASHED at 13 checks instead of reddening at 16 --
//      a missing path threw out of readFileSync. A named file that is absent is a failed row, not a dead gate.
//   4. The backlog's newest-version derivation replaced by the literal 4479 went 0 RED, and it is a true
//      no-op today: 4479 IS the maximum. Nothing compared against the live backlog could ever see it. Fixed
//      by making the entries injectable, so the gate feeds a synthetic backlog naming v1234 and requires the
//      answer to follow -- the same "run the branch, do not argue about it" move v4478 needed for its
//      unanswerable GPU case.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "./deferralCensus.mjs";
import { NEXT_ROUNDS } from "./nextRounds.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

const C = D.census();
const REC = D.CENSUS_AT_V4479;

// ---- 1. THE CLASSIFIER DECIDES FROM STRUCTURE, AND EVERY CLASS CAN FIRE ------------------------------------
sec("1. *** EVERY CLASS IS DECIDED ON ONE LINE, OR ON ITS NEIGHBOUR, AND NEVER ON SENTIMENT ***");
{
    // Fixtures, so each branch is exercised whatever the tree happens to contain today.
    const F = (line, prev = "", next = "", rel = "fixture.mjs") => D.classifyLine(rel, line, prev, next);
    ok("!! the six classes each fire on a fixture built to reach them",
        F("// x is a round of its own") === D.CLASS.UNDECIDED &&
        F("// HONEST ABOUT ITS OWN ROUNDING") === D.CLASS.SUBSTRING &&
        F("// done here rather than in its own round") === D.CLASS.NEGATED &&
        F("// y is a round of its own", "", "// SETTLED at v4413") === D.CLASS.SATISFIED &&
        F("// z is a round of its own", "// ANTIDOTE: if a later round does this") === D.CLASS.ANTIDOTE &&
        F('const ENGINE_VERSION = "v4478";   // v4478 -- a round of its own') === D.CLASS.HISTORY &&
        F("// nothing to see") === null,
        "six classes plus the null case. A classifier whose branches are only ever reached by whatever the " +
        "tree contains today is one whose behaviour changes silently when the tree does");
    ok("!! *** the SUBSTRING trap is real code in this tree, not a hypothetical ***",
        (() => {
            const src = fs.readFileSync(path.join(HERE, "../../physics/mesh/strokeMorph-selfcheck.mjs"), "utf8");
            const line = src.split("\n").find((l) => /ITS OWN ROUNDING/i.test(l));
            return !!line && D.LOOSE.test(line) && !D.TIGHT.test(line) &&
                   D.classifyLine("physics/mesh/strokeMorph-selfcheck.mjs", line) === D.CLASS.SUBSTRING;
        })(),
        "physics/mesh/strokeMorph-selfcheck.mjs says a serialiser is HONEST ABOUT ITS OWN ROUNDING. A phrase " +
        "list without word boundaries counts that as a deferred round, and the first draft of this census did. " +
        `Two lines in the tree hit it; the difference between LOOSE and TIGHT is the whole of that defect`);
    // *** AND THE WINDOW IS DIRECTIONAL, WHICH A SABOTAGE ESTABLISHED. *** Widening SATISFIED to look at the
    // PREVIOUS line as well went 0 RED against the first draft of this row. It is not symmetric on purpose: a
    // settlement is written AFTER the claim it settles, and a "SETTLED at" on the line before belongs to some
    // other sentence. The same asymmetry holds for ANTIDOTE in the other direction -- the token heads its block.
    ok("the window is ONE line either side, and DIRECTIONAL -- SETTLED looks forward, ANTIDOTE back",
        D.classifyLine("f.mjs", "// a is a round of its own", "", "", "") === D.CLASS.UNDECIDED &&
        D.classifyLine("f.mjs", "// a is a round of its own", "", "// SETTLED at v4000") === D.CLASS.SATISFIED &&
        D.classifyLine("f.mjs", "// a is a round of its own", "// SETTLED at v4000", "") === D.CLASS.UNDECIDED &&
        D.classifyLine("f.mjs", "// a is a round of its own", "// ANTIDOTE: x", "") === D.CLASS.ANTIDOTE &&
        D.classifyLine("f.mjs", "// a is a round of its own", "", "// ANTIDOTE: x") === D.CLASS.UNDECIDED,
        "*** THE FIRST DRAFT USED A FOUR-LINE WINDOW AND WAS WRONG IMMEDIATELY: *** it called " +
        "physics/em/skinDepth-selfcheck.mjs:172 an ANTIDOTE because the words 'goes red' appear two lines " +
        "away in an unrelated sentence. Caught before this file existed, which is the only reason it is a note " +
        "rather than a finding");
}

// ---- 2. THE POPULATION, RE-DERIVED --------------------------------------------------------------------------
sec("2. *** WHAT THE TREE DEFERS, COUNTED -- AND WHAT THIS REFUSES TO CALL IT ***");
{
    Object.entries(C.counts).forEach(([k, v]) => say(`${k.padEnd(11)} ${String(v).padStart(4)}`));
    say(`undecided across ${C.undecidedFiles} files, out of ${C.total} phrase hits in total`);
    const drift = Object.keys(C.counts).filter((k) => REC[k] !== undefined && REC[k] !== C.counts[k]);
    ok("!! the census re-derives to the frozen record, class by class -- a drifting class is NAMED",
        drift.length === 0 && C.total === REC.total && C.undecidedFiles === REC.undecidedFiles,
        drift.length ? `drifted: ${drift.map((k) => `${k} ${REC[k]} -> ${C.counts[k]}`).join(", ")}`
                     : `${C.total} hits, ${C.counts.undecided} undecided across ${C.undecidedFiles} files. ` +
                       "v4399's rule: a count baseline should name what arrived rather than show a number that moved");
    ok("!! *** UNDECIDED IS NOT A SYNONYM FOR OPEN, AND THIS FILE REFUSES TO SAY IT IS ***",
        C.counts.undecided > 100 && !("open" in C.counts),
        `${C.counts.undecided} notes that NOTHING HAS EVER ADJUDICATED. Whether one is still owed is a ` +
        "question about the tree's behaviour and needs a file read -- which is what v3313 and v3314 did, four " +
        "and fifteen times. A classifier that guessed would be a mention test, and this tree's record on those " +
        "is bad enough to be a house rule");
    ok("the bookkeeping files are excluded, so the audit is not counted as the debt",
        D.BOOKKEEPING.includes("tools/ship/nextRounds.mjs") && D.BOOKKEEPING.includes("tools/ship/deferralCensus.mjs") &&
        !C.rows.some((r) => D.BOOKKEEPING.includes(r.file)) &&
        D.census({ includeBookkeeping: true }).total > C.total,
        `${D.census({ includeBookkeeping: true }).total - C.total} hits live in files whose SUBJECT is deferral ` +
        "bookkeeping -- this gate quotes deferrals in order to check them. Counting those would be the " +
        "census counting its own prose, which is the shape v4424 shipped when a round's census counted its " +
        "own changelog");
    ok("...and the shipped round notes are history, not a backlog",
        C.counts.history > 40 && D.HISTORY_FILES.length === 2,
        `${C.counts.history} hits sit inside a version note or in main.js / brain/brain.js, whose every line ` +
        "is a record of a round already shipped. A deferral written in a v4400 note is a fact about v4400");
}

// ---- 3. THE BACKLOG'S CURRENCY, WHICH IS THE FINDING ---------------------------------------------------------
sec("3. *** THE RECORD THAT STOPPED BEING RE-READ WAS THE ONE FOR RECORDS THAT STOP BEING RE-READ ***");
{
    const b = D.backlogCurrency();
    const found = REC.backlogFound;
    say(`entries ${b.entries}, open ${b.open}, newest version named v${b.newestVersionNamed}, ` +
        `engine v${b.engineVersion}, lag ${b.lagVersions}`);
    ok("!! *** AS THIS ROUND FOUND IT: 10 entries, newest naming v3553, a 925-version lag ***",
        found.entries === 10 && found.newestVersionNamed === 3553 && found.lagVersions === 925,
        "nextRounds.mjs was written at v3340 and nothing was added to it for 925 versions, by a file whose " +
        "own header says the failure mode is a record nothing re-reads. That is not an argument against it -- " +
        "the design is right and this round did not replace it, it added the half that prompts an entry");
    // *** v4480 -- THIS ROW PINNED THE ENTRY COUNT AND WENT RED THE FIRST TIME SOMEBODY ADDED AN ENTRY. ***
    // That is the wrong way round: a backlog is SUPPOSED to grow, and a check that fails when it does teaches
    // the next round to stop writing entries. What v4479 froze stays frozen as its own record; what is asserted
    // live is CURRENCY and monotone growth -- the newest entry names a recent round, and nothing was quietly
    // deleted. The count still cannot fall silently, which is the property that was actually wanted.
    ok("!! and the backlog is current: its newest entry names a recent round, and it has not shrunk",
        b.newestVersionNamed >= 4479 && b.entries >= REC.backlogAfter.entries && b.open >= REC.backlogAfter.open,
        `${b.entries} entries, ${b.open} open, newest v${b.newestVersionNamed}, against the ` +
        `${REC.backlogAfter.entries} v4479 left. Each addition is one the session that wrote it could vouch ` +
        "for first-hand rather than having inferred from prose");
    // The reach must be shown to DISCRIMINATE, not merely to produce the expected number: a stub returning
    // one row satisfies a count and went 0 RED. So the matched file is named, and a file the backlog does not
    // mention is required to stay unmatched.
    const reach = D.backlogReach(C);
    const backlogText = JSON.stringify(NEXT_ROUNDS);
    const unnamed = C.undecided.filter((r) => !backlogText.includes(r.file));
    ok("!! *** REACH: the backlog named ZERO of the 118, and the metric is what made that visible ***",
        found.reachOf118 === 0 && reach.matchedByBacklog === REC.backlogAfter.reach &&
        reach.files.length === 1 && backlogText.includes(reach.files[0]) &&
        unnamed.length === C.undecided.length - reach.matchedByBacklog && unnamed.length > 100,
        `0 of ${C.counts.undecided} before this round, ${D.backlogReach(C).matchedByBacklog} after. A backlog ` +
        "entry NAMES THE FILE carrying the prose note it answers -- that link is the whole of this metric, and " +
        "1 of 118 is not a boast, it is the size of what is still owed");
    // Derived, and shown to RESPOND: a constant equal to today's maximum passes a comparison against today's
    // maximum, so the lag is also driven at a version the tree is not at.
    const probe = D.backlogCurrency("v9999");
    const synth = D.backlogCurrency("v5000", [{ id: "x", state: "OPEN", why: "landed at v1234" }]);
    ok("the lag is DERIVED from the entries' own text, not from a stamp somebody remembers to set",
        b.newestVersionNamed === Math.max(...[...JSON.stringify(NEXT_ROUNDS).matchAll(/v(\d{3,4})/g)].map((m) => Number(m[1]))) &&
        probe.lagVersions === 9999 - b.newestVersionNamed && probe.lagVersions !== b.lagVersions &&
        synth.newestVersionNamed === 1234 && synth.lagVersions === 3766 && synth.entries === 1,
        "a `lastReviewed` field would be a second declaration, and the second copy is never the one that gets " +
        "updated. The newest version any entry MENTIONS moves when somebody actually writes an entry");
}

// ---- 4. WHAT THE INSTRUMENT MADE POSSIBLE, DONE RATHER THAN PROPOSED -----------------------------------------
sec("4. *** THREE STALE NOTES, FROM THE FIRST TWO FILES OPENED ***");
{
    const settled = REC.settledHere;
    ok("!! three deferrals were settled long ago and their files went on advertising them",
        settled.length === 3 && new Set(settled.map((s) => s.file)).size === 2,
        settled.map((s) => `${s.file.split("/").pop()} "${s.was}" -> ${s.settledAt}`).join("; ") +
        ". Two of the three are in ONE paragraph of microfacetVndf-selfcheck.mjs");
    // Checked against the EXPORTS, never against the sentence that claims it -- the rule the whole file rests on.
    const mis = fs.readFileSync(path.join(HERE, "../../physics/render/misWgsl.mjs"), "utf8");
    const aniso = fs.readFileSync(path.join(HERE, "../../physics/render/microfacetAnisoWgsl.mjs"), "utf8");
    ok("!! *** and each settlement is checked against an EXPORT, not against a sentence ***",
        /export const STRATEGY = Object\.freeze\(\{[^}]*bsdf[^}]*light[^}]*mis/.test(mis) &&
        /Daniso/.test(aniso) && /lambdaAniso/.test(aniso),
        "misWgsl.mjs exports STRATEGY with bsdf, light and mis -- the two estimators actually combined; " +
        "microfacetAnisoWgsl.mjs carries Daniso and lambdaAniso over alpha_x and alpha_y. If either export " +
        "went away this row goes red and the SETTLED markers become false, which is the point of reading a " +
        "declaration rather than a claim about one");
    ok("the settled notes now carry their marker ADJACENT to the claim, where the census and a reader both see it",
        settled.length === 3 && settled.every((s) => {
            // A named file that does not exist is a FAILED row, not a thrown gate: emptying settledHere
            // pointed it at a missing path and the suite died at 13 checks instead of reddening at 16.
            let src;
            try { src = fs.readFileSync(path.join(HERE, "../..", s.file), "utf8").split("\n"); }
            catch { return false; }
            return src.some((l, i) => D.TIGHT.test(l) &&
                D.classifyLine(s.file, l, src[i - 1] || "", src[i + 1] || "") === D.CLASS.SATISFIED);
        }),
        "a settlement recorded four lines away from the claim is one the next reader misses. The first attempt " +
        "at these repairs put the marker in a comment block below the sentence and the census did not see it " +
        "either -- the same distance, measured two ways");
}

// ---- 5. WHAT THIS ROUND DID NOT DO ---------------------------------------------------------------------------
sec("5. *** THE LIMITS, STATED ***");
{
    ok("this does NOT decide the 118, and does not pretend the phrase list is complete",
        D.PHRASES.length === 6 && C.counts.undecided > 100,
        `${D.PHRASES.length} phrases, read off this tree rather than invented. A deferral phrased any other ` +
        "way is invisible here -- tools/ship/zoomBlur-selfcheck.mjs defers a wiring round in words none of " +
        "these six match, and it took a hand-written backlog entry to record it. THE CENSUS IS A LOWER BOUND");
    ok("...and the three settled here were found by READING, which is the only way any of the rest will be",
        REC.settledHere.length === 3 && REC.backlogAfter.reach === 1,
        "two files opened, three stale notes. That rate is not an estimate for the other 116 and is not " +
        "offered as one -- v3313 found 3 of 4, v3314 found 7 of 15, and this found 3 in 2 files. What the " +
        "three samples agree on is that the rate is not small");
    say("");
    say("NOT DONE: no deferral outside those two files was adjudicated. The phrase list does not cover");
    say("  every wording. backlogReach is a WEAK test -- it asks whether an entry names the file, not");
    say("  whether it answers the note -- and a strong one would need the classifier this file refuses to");
    say("  build. And nothing here stops a new deferral being written with no entry beside it.");
}

console.log();
if (fails) { console.log("deferralCensus-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("deferralCensus-selfcheck: all checks pass");
