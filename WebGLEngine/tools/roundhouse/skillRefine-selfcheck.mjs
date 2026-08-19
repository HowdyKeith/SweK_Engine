// WebGLEngine/tools/roundhouse/skillRefine-selfcheck.mjs -- v3399
//
// *** THE THIRD SkillManager OPERATION, AND THE WHOLE POINT IS THAT IT CANNOT INHERIT EVIDENCE. ***
//
// ACE adds, refines and removes; this book had only ADD and RETIRE, and the gap has been on the open list since
// v3396. THE TEMPTING IMPLEMENTATION IS THE DANGEROUS ONE: edit the hint in place and keep the numbers.
//
// A REFINED STRATEGY WOULD THEN BE PROVEN FOR TEXT THAT WAS NEVER TRIALLED -- and it would look EXACTLY like one
// that had been. Same shape, same well-formed evidence, same green state. *** deriveState IS BLIND TO IT: the
// evidence passes every soundness check it has, because the numbers are real. THEY SIMPLY BELONG TO DIFFERENT
// WORDS. *** That is why the detection here is STRUCTURAL rather than statistical, and why it is a fact about a
// PAIR rather than about a strategy: one measurement cannot belong to two hints.
//
// AND THE PARENT IS KEPT. A refinement that turns out WORSE than what it replaced is only visible if the thing
// it replaced is still there with its numbers -- the same reason a RETIRED strategy is kept rather than deleted.
"use strict";
import { refine, makeStrategy, load, save, summary, deriveState, inheritedEvidence, hintsFor } from "./skillbook.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
let failed = 0;
const say = (m) => console.log("  ----  " + m);
const ok = (l, c, n) => { console.log("  " + (c ? "PASS" : "FAIL") + "  " + l + (n ? "   " + n : "")); if (!c) failed++; };

const GOOD = { before: 0.65, after: 0.05, n: 40, measuredAt: "2026-08-03T12:00:00.000Z" };
const parent = { ...makeStrategy({ id: "p1", trigger: "observable-unknown", hint: "PICK FROM THE MENU", evidence: GOOD }) };

// ---- 1. A REFINEMENT IS A NEW CLAIM, SO IT STARTS WITH NO EVIDENCE ----------------------------------------
{
    const child = refine(parent, "PICK FROM THE MENU, AND COPY IT EXACTLY");
    say(`refine: ${parent.id} -> ${child.id}, evidence ${child.evidence}, state ${deriveState(child).state}`);
    ok("!! *** a refinement carries NO evidence and is therefore PROPOSED -- never injected ***",
        child.evidence === null && deriveState(child).state === "PROPOSED" && child.refines === parent.id,
        "the parent was PROVEN and the child is not. A NEW HINT IS A NEW CLAIM: keeping the numbers would " +
        "certify text that was never trialled, and nothing downstream could tell");
    ok("...and the lineage travels with it, so a worse refinement is traceable to what it replaced",
        child.refines === "p1" && /r1/.test(child.id),
        child.id + " refines " + child.refines);
    let threw = null;
    try { refine(parent, parent.hint); } catch (e) { threw = e.message; }
    ok("!! a refinement with the SAME hint is REFUSED rather than filed",
        /not a refinement/.test(threw || ""),
        "nothing changed, so the parent's evidence still applies and a second entry would only SPLIT it across " +
        "two rows that mean the same thing");
    let threw2 = null;
    try { refine({ hint: "x" }, "y"); } catch (e) { threw2 = e.message; }
    ok("...and a parent with no id is refused, because lineage that cannot be resolved is not lineage",
        /needs a parent strategy with an id/.test(threw2 || ""));
}

// ---- 2. THE DEFECT: EVIDENCE HAND-COPIED ONTO A REFINEMENT ------------------------------------------------
{
    const cheat = { ...refine(parent, "A DIFFERENT WORDING"), evidence: { ...GOOD } };
    const byId = { p1: parent };
    ok("!! *** deriveState alone calls the cheat PROVEN -- the evidence is SOUND, it just belongs to other words ***",
        deriveState(cheat).state === "PROVEN",
        "this is why the check had to be structural. A statistical test cannot see the problem, because there " +
        "is nothing statistically wrong: the trial happened, on a different hint");
    const why = inheritedEvidence(cheat, byId);
    ok("!! and inheritedEvidence CATCHES it, on the instant the measurement was taken",
        !!why && /measuredAt/.test(why),
        why || "(nothing) -- ONE MEASUREMENT CANNOT BELONG TO TWO HINTS, and an identical timestamp is not a " +
        "coincidence anybody should have to argue about");
    const noStamp = { ...cheat, evidence: { before: 0.65, after: 0.05, n: 40 } };
    ok("...and still catches it with the timestamp stripped, by every field matching",
        !!inheritedEvidence(noStamp, byId),
        "removing the stamp is the obvious way round the first rule, so the second rule does not depend on it");
    const honest = { ...refine(parent, "A DIFFERENT WORDING"), evidence: { before: 0.65, after: 0.20, n: 40, measuredAt: "2026-08-04T09:00:00.000Z" } };
    ok("!! *** and a refinement that WAS genuinely trialled is NOT flagged -- the check discriminates ***",
        inheritedEvidence(honest, byId) === null && deriveState(honest).state === "PROVEN",
        "0.65 -> 0.20 at a different instant is its own measurement. A rule that flagged every refinement would " +
        "be a rule against refining");
}

// ---- 3. LOAD FORCES THE CHEAT BACK TO PROPOSED, AND SAYS WHY ----------------------------------------------
{
    const tmp = path.join(os.tmpdir(), `swek-refine-${process.pid}.json`);
    const cheat = { ...refine(parent, "A DIFFERENT WORDING"), evidence: { ...GOOD }, state: "PROVEN" };
    fs.writeFileSync(tmp, JSON.stringify({ strategies: [parent, cheat] }, null, 1));
    const book = load({ file: tmp });
    const kid = book.strategies.find((s) => s.refines === "p1");
    ok("!! *** a book claiming PROVEN for an inherited refinement loads as PROPOSED ***",
        kid && kid.state === "PROPOSED" && /INHERITED evidence/.test(kid.why),
        kid ? kid.why.slice(0, 120) : "(child missing)");
    ok("...and the entry is KEPT with its reason rather than dropped",
        !!kid && !!kid.inherited && book.strategies.length === 2,
        "dropping it would hide that somebody tried, which is the same argument that keeps a RETIRED strategy " +
        "in the book with its numbers");
    ok("!! and the parent is untouched -- a refinement does not consume what it refines",
        book.strategies.find((s) => s.id === "p1").state === "PROVEN",
        "a refinement that turns out WORSE is only visible if the thing it replaced is still there");
    const inj = hintsFor(["\"x\" is not an observable of this device"], { book });
    ok("!! *** and the inherited child never reaches a prompt ***",
        inj.hints.length === 1 && inj.hints[0] === parent.hint,
        "injected " + JSON.stringify(inj.hints) + " -- only the parent, whose numbers are its own");
    const sum = summary(book);
    say(`summary: ${sum.total} total, ${sum.proven} proven, ${sum.refinements} refinements, ${sum.inherited} inherited`);
    ok("...and the summary counts refinements and inherited evidence as SEPARATE facts",
        sum.refinements === 1 && sum.inherited === 1 && sum.proven === 1,
        "a refinement is normal; an inherited one is a defect. One number cannot report both");
    fs.unlinkSync(tmp);
}

// ---- 4. THE ROUND TRIP KEEPS THE LINEAGE ------------------------------------------------------------------
{
    const tmp = path.join(os.tmpdir(), `swek-refine2-${process.pid}.json`);
    const child = refine(parent, "SOMETHING ELSE ENTIRELY");
    save([parent, child], { file: tmp });
    const back = load({ file: tmp });
    ok("a saved refinement reloads with its `refines` intact",
        back.strategies.find((s) => s.id === child.id).refines === "p1",
        "lineage that does not survive a save is lineage nobody will ever read");
    ok("...and the reloaded child is still PROPOSED, because save writes evidence null rather than a state",
        back.strategies.find((s) => s.id === child.id).state === "PROPOSED",
        "state is DERIVED on load; the field written to disk is a courtesy for a human reading the JSON");
    fs.unlinkSync(tmp);
}

console.log(failed ? "\n[skillRefine-selfcheck] FAILED " + failed : "\n[skillRefine-selfcheck] all checks pass");
process.exit(failed ? 1 : 0);
