// WebGLEngine/tools/ship/backlogIntegrity-selfcheck.mjs -- v4671
//
// *** THE BACKLOG IS A RECORD THIS TREE QUERIES, AND NOTHING CHECKED THAT IT COULD BE QUERIED. ***
//
// tools/ship/nextRounds.mjs decides what gets built next. Three things were wrong with it as a data
// structure, all found by asking it one ordinary question -- "what is still open?" -- and checking the
// answer instead of believing it:
//
//   1. TWO ENTRIES WERE IN THE FILE TWICE, with DIVERGENT notes. terrain-controller's longer copy opens
//      "CLOSED AT v4544, AND THE SENTENCE THAT FOLLOWED THIS ONE NAMED THE WRONG STATE", and the sentence
//      it corrects was still sitting in the shorter copy twenty-five lines away.
//   2. ONE ENTRY'S HEADLINE CONTRADICTED ITS OWN FIFTEEN NOTES. orb-state-terms-wiring's `what` said
//      "NOTHING CALLS IT" about a mechanism with 72 readers, and its `how` said stateTau "will need" adding
//      twenty-seven rounds after it was added.
//   3. THE FILE ANSWERS "IS THIS OPEN?" IN THREE VOCABULARIES -- blocker:"OPEN", state:"OPEN", and
//      blocker:"HARDWARE"/"UPSTREAM" -- and a reader who knew one got 26 of 44. Not a wrong answer: a
//      confident incomplete one, which is worse, because nothing about its shape says it is short.
//
// THE THIRD IS THE ONE THIS GATE EXISTS FOR. The other two are repairs; that one is a property, and it can
// regress the moment somebody invents a fourth word.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as NR from "./nextRounds.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("backlogIntegrity-selfcheck -- can the file that decides what to build next be asked a question?\n");

const ALL = NR.NEXT_ROUNDS.filter((e) => e && e.id);

// =============================================================================================================
sec("1. *** EVERY ENTRY IS CLASSIFIABLE, WHICHEVER OF THE THREE VOCABULARIES IT USES ***");
{
    const by = {};
    for (const e of ALL) { const s = NR.entryStatus(e); by[s] = (by[s] || 0) + 1; }
    const unknown = ALL.filter((e) => NR.entryStatus(e) === "UNKNOWN");
    const blocked = {};
    for (const e of NR.openEntries()) { const k = NR.entryBlockedBy(e) || "(actionable)"; blocked[k] = (blocked[k] || 0) + 1; }
    say(`${ALL.length} entries: ${Object.entries(by).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    say(`the ${NR.openEntries().length} open ones split ${Object.entries(blocked).map(([k, v]) => `${v} ${k}`).join(", ")}`);
    // *** UNKNOWN MUST BE ZERO, AND THAT IS THE WHOLE ROW. *** An entry the classifier cannot read is an
    // entry every future query silently drops -- which is exactly how a blocker-only read returned 26 of 44
    // and looked complete. A fourth vocabulary arriving reddens this on the day it lands.
    ok("!! *** NOT ONE ENTRY IS UNCLASSIFIABLE: a status this file cannot read is an entry every query drops ***",
        unknown.length === 0 && ALL.length > 50,
        `${unknown.length} unreadable of ${ALL.length}${unknown.length ? " -- " + unknown.map((e) => e.id).join(", ") : ""}. ` +
        `THE COUNT IS ASSERTED NON-TRIVIAL TOO: a walk that found no entries at all would report zero ` +
        `unreadable ones and pass. *** THIS IS THE ROW THE ROUND WAS BUILT FOR. *** HARDWARE and UPSTREAM ` +
        `are not statuses, they are the KIND of thing blocking -- and because neither word is "OPEN", a ` +
        `filter looking for that word dropped sixteen live entries without a trace.`);

    // *** AND THE CLASSIFICATION IS CHECKED AGAINST THE RAW FIELDS, NOT AGAINST ITSELF. *** Two sabotages
    // walked through the first cut of this section and both were the round's own bug wearing a hat:
    // classifying HARDWARE as CLOSED (which silently removes five live entries from every query), and
    // reverting openEntries() to a blocker-only match (which is EXACTLY the defect that returned 26 of 44).
    // Neither moved a single count above, because every row up there asked entryStatus() what it thought
    // and then agreed with it. So the expected set is built HERE, by reading the two raw fields directly,
    // and openEntries() has to equal it -- which also means this gate finally calls the function every
    // other caller uses rather than only the helper underneath it.
    const rawOf = (e) => String((e.blocker != null ? e.blocker : e.state) || "").trim();
    const expectOpen = ALL.filter((e) => /^(OPEN|HARDWARE|UPSTREAM)\b/i.test(rawOf(e))).map((e) => e.id).sort();
    const gotOpen = NR.openEntries().map((e) => e.id).sort();
    const missing = expectOpen.filter((id) => !gotOpen.includes(id));
    const extra = gotOpen.filter((id) => !expectOpen.includes(id));
    say(`independently: ${expectOpen.length} entries read as open from the raw fields; openEntries() returns ${gotOpen.length}`);
    ok("!! *** openEntries() RETURNS EXACTLY THE ENTRIES THE RAW FIELDS SAY ARE OPEN ***",
        missing.length === 0 && extra.length === 0 && expectOpen.length > 30,
        `${missing.length} dropped${missing.length ? " (" + missing.join(", ") + ")" : ""}, ` +
        `${extra.length} invented${extra.length ? " (" + extra.join(", ") + ")" : ""}. THE EXPECTED SET IS ` +
        `DERIVED FROM THE FIELDS AND NOT FROM entryStatus(), which is the only version of this comparison ` +
        `that can fail: the rows above ask the classifier and then agree with it, and a classifier that ` +
        `decided HARDWARE meant CLOSED would have kept every one of them green while dropping five live ` +
        `entries. THE FLOOR OF 30 IS PART OF IT -- a regex that matched nothing would report zero dropped ` +
        `and zero invented and pass on an empty backlog.`);

    // *** A VERDICT MAY CARRY ITS REASON, AND EVERY READER MUST PARSE RATHER THAN COMPARE. *** v4670 wrote
    // `blocker: "OPEN -- for connecting and shaping ONLY. ..."` -- a verdict with the reason attached, which
    // is better writing than a bare word and unmatchable by the === that byBlocker() used. The entry fell out
    // of all three report sections and printed nowhere, and tools/ship/shipRitual-selfcheck.mjs went red for
    // it A ROUND LATE, because v4670 did not run that gate. This row is the near end of the same property.
    const prose = ALL.filter((e) => /^(OPEN|CLOSED|HARDWARE|UPSTREAM)\b[^]*?\S/i.test(rawOf(e)) &&
                                    rawOf(e).length > 12);
    const proseOk = prose.every((e) => NR.entryStatus(e) !== "UNKNOWN");
    say(`${prose.length} entries carry a verdict WITH prose after it; all classified: ${proseOk}`);
    ok("!! *** A VERDICT WITH ITS REASON ATTACHED STILL CLASSIFIES -- the field is parsed, not compared ***",
        proseOk && prose.length > 0,
        `${prose.length} of ${ALL.length} entries write more than a bare word in their status field, and ` +
        `every one still resolves. THE COUNT IS ASSERTED NON-ZERO because a tree where every blocker was one ` +
        `word would pass this row while telling us nothing -- the property only has content once somebody ` +
        `writes a reason, which is the thing a human record should encourage rather than punish.`);

    ok("!! ...and no entry carries BOTH status fields, so there is never a question of which one wins",
        ALL.every((e) => !(e.blocker != null && e.state != null)),
        `61 entries use \`blocker\` and 23 use \`state\`; the overlap is zero, and they are two eras of this ` +
        `file rather than a contradiction. The fields are NOT being merged -- rewriting 82 entries to one ` +
        `spelling is a large diff that changes no fact and no entry is wrong. What was missing was an ` +
        `accessor, and entryStatus() is it. This row is what keeps the two from ever disagreeing on one entry.`);
}

// =============================================================================================================
sec("2. *** NO ENTRY IS IN THE FILE TWICE ***");
{
    const seen = new Map();
    for (const e of ALL) { if (!seen.has(e.id)) seen.set(e.id, []); seen.get(e.id).push(e); }
    const dup = [...seen].filter(([, a]) => a.length > 1);
    say(`${ALL.length} entries, ${seen.size} distinct ids, ${dup.length} appearing more than once`);
    ok("!! *** IDS ARE UNIQUE -- two entries wearing one name is two answers to one question ***",
        dup.length === 0,
        `${dup.length ? dup.map(([id, a]) => `${id} x${a.length}`).join(", ") : "no duplicates"}. Until v4671 ` +
        `there were TWO: ibl-specular-half and terrain-controller, each at two places and CROSSED -- one ` +
        `site held the fresh ibl entry beside the stale terrain one and the other the reverse, which is why ` +
        `neither looked wrong in isolation. AND THE NOTES DIVERGED, which is the part that mattered: ` +
        `terrain-controller's surviving note opens "CLOSED AT v4544, AND THE SENTENCE THAT FOLLOWED THIS ` +
        `ONE NAMED THE WRONG STATE", and the sentence it corrects was still in the copy twenty-five lines ` +
        `away. The backlog was holding a correction and the text it corrected, and a reader got whichever ` +
        `they reached first.`);
}

// =============================================================================================================
sec("3. *** A CLOSED ENTRY'S HEADLINE MAY NOT STILL ADVERTISE THE WORK AS UNDONE ***");
{
    // *** THE TEST IS DELIBERATELY NARROW, BECAUSE THE WIDE VERSION IS WRONG. *** A first cut flagged every
    // entry whose notes said "DONE at vNNNN" while its status said OPEN, and it produced TWO FALSE
    // POSITIVES immediately: navmesh-recast ("DONE at v4543 FOR THE PART THAT WAS BLOCKING", three named
    // pieces still unbuilt) and terrain-controller ("DONE at v4544 FOR THE PART THAT WAS MISSING"). Both
    // are correctly OPEN. A scoped DONE is not an entry-level one, and a check that could not tell them
    // apart would have closed two live entries.
    //
    // So this asks the opposite and answerable question: an entry the file calls CLOSED must not open with
    // a sentence claiming the thing is absent. That is a property of the entry's own two fields, needs no
    // judgement about scope, and is exactly what went wrong with orb-state-terms-wiring.
    const ABSENCE = /\bNOTHING CALLS IT\b|\bnothing calls it\b|\bis not built\b|\bnot wired\b|\bhas no readers\b|\bwill need\b/;
    const closed = ALL.filter((e) => NR.entryStatus(e) === "CLOSED");
    // *** THE TEST IS ON WHAT THE ENTRY LEADS WITH, AND A SABOTAGE TAUGHT IT THAT. *** The first cut asked
    // whether the absence claim appeared ANYWHERE in `what` and then excused the whole field if a
    // preserved-history marker appeared anywhere too. Putting "NOTHING CALLS IT" back at the FRONT of a
    // repaired entry walked straight through it, because the marker was still further down excusing it.
    // The defect was never that the sentence exists -- it is that a reader meets it first. So only the
    // OPENING is examined, and the quoted history below it is none of this row's business.
    const LEAD = 220;
    const offenders = closed.filter((e) => ABSENCE.test(String(e.what || "").slice(0, LEAD)));
    say(`${closed.length} closed entries; ${offenders.length} still open with an absence claim`);
    ok("!! *** NO CLOSED ENTRY LEADS WITH A CLAIM THAT THE THING DOES NOT EXIST ***",
        offenders.length === 0 && closed.length > 10,
        `${offenders.length ? offenders.map((e) => e.id).join(", ") : "none"}. orb-state-terms-wiring's ` +
        `\`what\` said "NOTHING CALLS IT" about mh_state for THIRTY ROUNDS after v4653 started calling it, ` +
        `with fifteen accurate notes underneath saying otherwise -- and a reader stops at the headline. THE ` +
        `TEST IS ON THE FIRST ${LEAD} CHARACTERS AND NOTHING ELSE: an entry may quote the falsified claim ` +
        `at any length further down, because deleting it is how a record stops being able to teach ` +
        `anything. Quoting it is right; LEADING with it is not, and a check that looked at the whole field ` +
        `could not tell those apart -- measured, by a sabotage that put the sentence back at the front and ` +
        `walked through the first version of this row.`);
}

// =============================================================================================================
sec("4. *** AND THE CLAIM THAT WENT STALE IS RE-DERIVED, not taken from the entry that used to make it ***");
{
    // The headline said mh_state had no callers. That is not a matter of wording -- it is a countable fact
    // about render/aiPresenceOrbTsl.mjs, so it is counted here rather than argued about.
    const src = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
    const reads = ["SETTLED", "COMPLETE", "SWEEP", "DRIVE"].map((n) => ({
        n, c: (src.match(new RegExp("\\b" + n + "\\b", "g")) || []).length }));
    const total = reads.reduce((a, r) => a + r.c, 0);
    const tauWired = /stateTau/.test(fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8"));
    say(`mh_state's outputs in the shader: ${reads.map((r) => `${r.n} ${r.c}`).join(", ")} -- ${total} reads`);
    say(`stateTau reaches the shader from the widget: ${tauWired}`);
    ok("!! *** mh_state HAS READERS AND stateTau IS A UNIFORM, so both stale sentences are false by measurement ***",
        total > 20 && reads.every((r) => r.c > 0) && tauWired,
        `every one of the four outputs is read, which is what makes "NOTHING CALLS IT" a false statement ` +
        `about the tree rather than an out-of-date opinion. THE ROW COUNTS RATHER THAN READS THE ENTRY: an ` +
        `assertion that the backlog now says the right thing would be graded against the thing it grades, ` +
        `and this tree has shipped that shape twice in three rounds. tools/ship/murmurLive-selfcheck.mjs ` +
        `owns the precise per-output census (settled 3, complete 23, sweep 8, drive 38); this is the coarse ` +
        `version whose only job is to make the stale sentence checkable.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: tools/ship/nextRounds.mjs decides what gets built next, and nothing checked " +
    "that it could be asked a question. Asking it one ordinary question -- what is still open? -- and " +
    "verifying the answer turned up two duplicated entries with divergent notes, a headline contradicting " +
    "its own fifteen notes, and three vocabularies for one fact that made a blocker-only read return 26 of " +
    "44 while looking complete." +
    "\nWHAT IS NOT CLAIMED: that any entry's CONTENT is right, current or wise. This gate reads the file as " +
    "a data structure -- ids, statuses, and one countable claim that had gone false -- and says nothing " +
    "about whether an entry describes work worth doing." +
    "\nAND NOT CLAIMED: that a scoped 'DONE at vNNNN' in a note means an entry should close. Two entries " +
    "say exactly that about a PART while naming unbuilt pieces, and section 3 was narrowed until it could " +
    "tell the difference rather than closing them.");
process.exit(fails ? 1 : 0);
