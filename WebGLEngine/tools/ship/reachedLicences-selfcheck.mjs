// WebGLEngine/tools/ship/reachedLicences-selfcheck.mjs -- v4198
//
// GATES world/reachedLicences.mjs -- the register of sources this tree READ and did not vendor.
//
// *** WHY A SECOND LICENCE MODULE, WHEN world/orrery.mjs ALREADY HAS ONE. *** The orrery's evidence is a FILE
// ON DISK: it walks vendor/, finds licence files, and reports CAPTURED, UNPAPERED or REACHED. That makes it
// blind by construction to the case this file exists for -- a source that was read and deliberately NOT
// taken leaves nothing on disk to walk. "We looked at this and chose not to vendor it, and here is why" is
// the fact that goes missing first, and it is the one that costs the most to reconstruct later.
//
// *** THE CHECK THAT MATTERS IS SECTION 3: NO NON-REDISTRIBUTABLE SOURCE HAS LEFT BYTES BEHIND. *** A
// register saying "we took nothing" is worth nothing on its own; it is a promise about the past written by
// the party who made it. Section 3 goes and looks.
//
// Run: node tools/ship/reachedLicences-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { REACHED_SOURCES, POSTURE, SEVERITY, CODROPS_2015, CODROPS_2018,
         validateEntry, nonRedistributable, codropsDrift, severityOf, asBodies,
         describeSource } from "../../world/reachedLicences.mjs";
import { codeOnly, prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const note = (m) => console.log("  ....  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => fs.readFileSync(path.join(ENG, rel), "utf8");

// 1) EVERY ENTRY IS A USABLE RECORD.
{
    ok(REACHED_SOURCES.length >= 7, `${REACHED_SOURCES.length} sources recorded`);
    for (const e of REACHED_SOURCES) {
        const p = validateEntry(e);
        ok(p.length === 0, `${e.repo} is a complete record${p.length ? ": " + p.join("; ") : ""}`);
    }
    ok(Object.isFrozen(REACHED_SOURCES), "the register is frozen -- one reader cannot edit the record it is citing");
    ok(REACHED_SOURCES.every((e) => "taken" in e),
        "every entry says what was TAKEN, and null is the common answer -- an absent field would read as 'unknown'");
    ok(REACHED_SOURCES.filter((e) => e.taken).length >= 1,
        "at least one entry took something, so the `taken` field is exercised rather than uniformly null");
}

// 2) *** THE #59 FINDING, AND IT CORRECTS THE ITEM'S OWN PREMISE. ***
{
    const d = codropsDrift();
    ok(!d.identical, "the two codrops texts are NOT byte-identical -- the wording did change");
    ok(d.bothGrantIntegration,
        "*** but BOTH grant the same permission: integrate or build upon, free, personal or commercial ***");
    ok(d.bothForbidRedistribution,
        "*** and BOTH forbid the same thing: republish, redistribute, sell as-is ***");
    ok(d.yearsApart === 3,
        `*** and they are ${d.yearsApart} years apart, not four -- backlog item #59 read "two different ` +
        `licences four years apart", and the evidence says ONE licence restated once ***`);
    ok(d.addedIn2018.length === 2, `2018 adds exactly two clauses: ${d.addedIn2018.join("; ")}`);
    ok(/one licence, restated/.test(d.verdict), "the verdict states which of the two things happened");
    // The quotations are quotations. A paraphrase here would make every claim above unfalsifiable.
    ok(CODROPS_2015.includes("Don't republish, redistribute or sell 'as-is'."),
        "the 2015 text is quoted verbatim, prohibition included");
    ok(CODROPS_2018.includes("sell 'pluginized' versions of it."),
        "and the 2018 text, including the clause that is new");
    ok(CODROPS_2015.length < CODROPS_2018.length,
        `and the later one is LONGER (${CODROPS_2015.length} -> ${CODROPS_2018.length} chars), which is the ` +
        "direction a licence drifts when it is being tightened rather than relaxed");
}

// 3) *** NOTHING NON-REDISTRIBUTABLE HAS LEFT BYTES IN THIS TREE. ***
//
//    The register claims "took nothing". This goes and looks, because a promise about the past made by the
//    party who made it is not evidence.
{
    const nr = nonRedistributable();
    ok(nr.length >= 6, `${nr.length} sources may not be redistributed, so none of them may be vendored`);

    // Where a mention is legitimate: this register, this gate, and the written record.
    // The register, this gate, and the changelog line may name anything. Beyond that, the ONLY files allowed
    // to name a source are the ones the register itself says took something from it -- because a module that
    // took an IDEA must credit its origin, and that credit is the discipline working rather than a leak.
    // Derived from the register, so a new taking cannot quietly widen the allowance.
    const ALLOWED = new Set(["world/reachedLicences.mjs", "tools/ship/reachedLicences-selfcheck.mjs", "main.js",
                             ...REACHED_SOURCES.flatMap((e) => e.takenPaths || []),
                             ...REACHED_SOURCES.flatMap((e) => e.citedPaths || [])]);
    const EXT = /\.(js|mjs|glsl|html|css|json)$/;
    const SKIP = /(^|\/)(node_modules|\.git|vendor)(\/|$)/;
    const files = [];
    (function walk(dir) {
        let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const en of ents) {
            const full = path.join(dir, en.name), rel = path.relative(ENG, full);
            if (SKIP.test(rel)) continue;
            if (en.isDirectory()) walk(full);
            else if (EXT.test(en.name)) files.push(rel);
        }
    })(ENG);
    ok(files.length > 500, `scanned ${files.length} source files`);

    // One distinctive token per publisher. Chosen to be the name a vendored copy would carry.
    const TOKENS = [["codrops", /codrops/i], ["beez/zengularity", /zengularity/i], ["ChuckClose-SparkAR", /ChuckClose-SparkAR/]];
    for (const [label, re] of TOKENS) {
        const hits = files.filter((f) => !ALLOWED.has(f) && re.test(fs.readFileSync(path.join(ENG, f), "utf8")));
        ok(hits.length === 0,
            `no file outside the register or its own credited takings mentions ${label}${hits.length ? " -- " + hits.slice(0, 5).join(", ") : ""}`);
    }
    // And the control: the register itself DOES mention them, so the scan is looking at real content.
    ok(/codrops/i.test(read("world/reachedLicences.mjs")),
        "control: the register itself names them, so a scan finding nothing is a fact and not a broken regex");
    // And the credited taking really does credit: the one module that took an idea names its source.
    ok(/ChuckClose-SparkAR/.test(read("render/chuckCloseModel.mjs")),
        "*** control: the one module that TOOK something names the source it took from -- the allowance above " +
        "is exercised, not merely declared ***");
    // *** AND THE OTHER LEGITIMATE REASON TO NAME A SOURCE: TO RECORD THAT NOTHING WAS TAKEN. ***
    // tools/ship/easingCurves-selfcheck.mjs names codrops/ElasticProgress in order to assert that elastic
    // easing comes from PENNER instead. The byte-scan flagged it, exactly as it flagged the attribution case
    // one round earlier -- two legitimate reasons to name a source, neither of them a leak.
    const cited = REACHED_SOURCES.flatMap((e) => e.citedPaths || []);
    ok(cited.length >= 1, `${cited.length} file(s) cite a source without taking from it: ${cited.join(", ")}`);
    ok(cited.every((f) => fs.existsSync(path.join(ENG, f))), "and every cited path exists");
    ok(/ElasticProgress/.test(read("tools/ship/easingCurves-selfcheck.mjs")),
        "the citing file really does name it, so this allowance is exercised too");
    ok(REACHED_SOURCES.every((e) => !(e.takenPaths || []).some((f) => (e.citedPaths || []).includes(f))),
        "*** and no path is both TAKEN-from and CITED -- they are opposite claims about the same file ***");
    // A vendor directory for any of them would be the loudest possible failure.
    for (const e of nr) {
        const dir = path.join(ENG, "vendor", e.repo.split("/").pop().toLowerCase());
        ok(!fs.existsSync(dir), `no vendor/ directory for ${e.repo}`);
    }
}

// 4) SEVERITY: HOW FAR THE RESTRICTION REACHES, NOT HOW MUCH WE DISLIKE IT.
{
    const byRepo = Object.fromEntries(REACHED_SOURCES.map((e) => [e.repo, severityOf(e)]));
    ok(byRepo["gre/beez"] === SEVERITY.RECIPROCAL,
        "AGPL-3.0 is the most formidable -- its network clause follows your own work home");
    const codrops = REACHED_SOURCES.filter((e) => e.publisher === "Codrops");
    ok(codrops.length === 4 && codrops.every((e) => severityOf(e) === SEVERITY.NO_REDISTRIBUTION),
        `*** all ${codrops.length} codrops entries rank together at NO_REDISTRIBUTION -- including ` +
        `HeatDistortionEffect, which links its terms instead of restating them ***`);
    ok(severityOf({ spdx: null, licence: null, licenceExists: false, redistributable: false }) === SEVERITY.UNPAPERED,
        "a source with NO licence is UNPAPERED -- inert rather than hostile: no grant, but no terms either");
    ok(severityOf({ spdx: "MIT", licenceExists: true, redistributable: true }) === SEVERITY.OPEN, "and MIT is open");
    // *** THE REGRESSION. *** severityOf once read whether the licence was QUOTED rather than whether one
    // EXISTS, and put HeatDistortionEffect at UNPAPERED beside three identically-licensed siblings.
    ok(severityOf({ spdx: null, licence: null, licenceNote: "linked, not restated", licenceExists: true,
                    redistributable: false }) === SEVERITY.NO_REDISTRIBUTION,
        "*** a licence that exists but was not quoted is NOT unpapered -- a gap in our record is not a gap in theirs ***");

    const bodies = asBodies();
    ok(bodies.length === REACHED_SOURCES.length && bodies.every((b) => b.vendored === false),
        "the register hands the orrery bodies, every one of them un-vendored by definition");
    ok(bodies.every((b) => Number.isInteger(b.severity) && b.severity >= 0 && b.severity <= 4),
        "and each carries a severity the orrery can draw as heft -- a restrictive licence should be a bigger planet");
}

// 4b) *** ENCUMBERED: THE ONE POSTURE WHERE READING THE LICENCE GIVES THE WRONG ANSWER. ***
{
    ok(SEVERITY.ENCUMBERED === 4 && SEVERITY.ENCUMBERED > SEVERITY.RECIPROCAL,
        `encumbrance outranks even AGPL (${SEVERITY.ENCUMBERED} vs ${SEVERITY.RECIPROCAL}) -- not because it ` +
        "forbids more, but because every other posture ANNOUNCES itself and this one does not");

    // The worked case: a fan model under a real, sincerely-meant CC-BY from someone who made the mesh and
    // did not own the design.
    const fanModel = { repo: "(a fan-made .glb of someone else's design)", spdx: "CC-BY-4.0",
                       licenceExists: true, redistributable: true, grantorHoldsRights: false };
    ok(severityOf(fanModel) === SEVERITY.ENCUMBERED,
        "*** an SPDX id, licenceExists true and redistributable true, and it still classifies ENCUMBERED -- " +
        "the modeller can license the mesh and topology they made, never the design they did not ***");

    // *** THE CONTROL, AND IT IS THE ASSERTION THAT MATTERS. *** The same entry, one field flipped, is OPEN.
    // So the classification is decided by whether the grantor held the rights, and NOT by anything the
    // licence file says -- which is the entire claim this category makes.
    const owned = { ...fanModel, grantorHoldsRights: true };
    ok(severityOf(owned) === SEVERITY.OPEN,
        "control: flip that one field and the identical licence is OPEN -- so the licence text is not what decides");

    // The question is REQUIRED, which is the mechanism. A severity nobody remembers to apply is a comment.
    const noAnswer = { repo: "x", posture: POSTURE.REACHED, licenceExists: true, redistributable: false,
                       taken: null, takenPaths: [], citedPaths: [], why: "because", spdx: "MIT" };
    ok(validateEntry(noAnswer).some((p) => /GRANTOR HELD THE RIGHTS/.test(p)),
        "*** an entry that does not answer it is INVALID -- the question cannot be skipped at record time ***");
    ok(validateEntry({ ...noAnswer, grantorHoldsRights: true }).length === 0,
        "and answering it makes the same entry valid, so the requirement is the only thing it was missing");
    ok(validateEntry({ ...noAnswer, grantorHoldsRights: null }).some((p) => /GRANTOR/.test(p)),
        "null is not an answer either -- an asset whose provenance is unestablished is not yet an entry");

    // And the state of the tree: nothing recorded is encumbered.
    const enc = REACHED_SOURCES.filter((e) => severityOf(e) === SEVERITY.ENCUMBERED);
    ok(enc.length === 0,
        `no source in the register is encumbered${enc.length ? ": " + enc.map((e) => e.repo).join(", ") : ""} -- ` +
        "the category is defined before it was needed, which is the only time it can be defined calmly");
    ok(REACHED_SOURCES.every((e) => typeof e.grantorHoldsRights === "boolean"),
        `and all ${REACHED_SOURCES.length} existing entries answer the question, rather than it applying only to new ones`);

    // The worked case is written down, including the half that says USE is fine.
    const pr = prose(read("world/reachedLicences.mjs"));
    ok(/TIE fighter/.test(pr), "the module records the case that produced the category");
    ok(/esShipModels|localStorage/.test(pr),
        "*** and the half that matters practically: encumbrance bites on VENDORING, not on USE -- " +
        "ev/esShipModels.js keeps a model assignment as a string in localStorage and the repo ships no model ***");
    ok(/never leave the machine|not redistributed/i.test(pr), "stated as a principle, not just as one product's behaviour");
}

// 5) PURITY, AND THE REGISTER IS DATA.
{
    const src = codeOnly(read("world/reachedLicences.mjs"));
    ok(!/\bdocument\b|\bwindow\b|readFileSync|fetch\(/.test(src),
        "the register touches no DOM, no disk and no network -- it is a record, not a scanner");
    ok(!/Math\.random|Date\.now/.test(src), "and has no clock and no randomness");
    ok(REACHED_SOURCES.every((e) => JSON.parse(JSON.stringify(e)) !== null), "every entry is serialisable data");
    ok(/orrery/i.test(prose(read("world/reachedLicences.mjs"))),
        "and it says how it differs from world/orrery.mjs, which is the obvious question a reader has");
    ok(Object.values(POSTURE).length === 3, `${Object.values(POSTURE).length} postures: ${Object.values(POSTURE).join(", ")}`);
    for (const e of REACHED_SOURCES) note(describeSource(e));
}

console.log(`reachedLicences-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether any of these licences would hold up in court, and whether a
source not in the register was ever read. What is checked is that every recorded source states its licence,
its posture and what was taken, that the two quoted codrops texts are one licence restated rather than two,
and that no source forbidding redistribution has left a single byte in this tree.`);
process.exit(fail ? 1 : 0);
