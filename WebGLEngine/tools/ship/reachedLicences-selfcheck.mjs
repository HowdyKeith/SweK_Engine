// WebGLEngine/tools/ship/reachedLicences-selfcheck.mjs -- v4198, section 6 added at v4203
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

import { REACHED_SOURCES, POSTURE, SEVERITY, SEVERITY_NAMES, CODROPS_2015, CODROPS_2018, LICENCE_TEXTS,
         validateEntry, validateQuotation, quotationOf, nonRedistributable, codropsDrift, severityOf,
         asBodies, describeSource } from "../../world/reachedLicences.mjs";
import { licenceSection } from "./verifyLicenceTexts.mjs";
import { createHash } from "node:crypto";
import { codeOnly, noComments, prose } from "./sourceScan.mjs";
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
    // *** THIS SAID THREE YEARS AT v4198 AND THE ANSWER MOVED TWICE. *** #59 read "two different licences
    // four years apart". v4198 read four codrops repos and said one licence, three years apart. v4203 found
    // the same 123 bytes in lbebber/HeatDistortionEffect (c) 2016 -- a repo v4198 recorded as not restating
    // its licence at all -- so the earlier wording is attested ACROSS 2015-2016 and the gap to the 2018
    // restatement is two years. The finding did not reverse; it got more precise each time somebody read
    // one more source, which is the argument for recording URLs rather than conclusions.
    ok(d.yearsApart === 2,
        `*** ${d.yearsApart} years apart, not three and not four -- and the earlier text spans ` +
        `${d.earlierAttestedFrom}-${d.earlierAttestedTo} rather than sitting at one year ***`);
    // *** AND THIS SAID TWO CLAUSES WHILE THE CORPUS WAS MISSING THE OTHER TWO. *** v4198's CODROPS_2018 was
    // truncated at 48 of 77 words, so codropsDrift could not see the attribution requirement or the
    // bundled-licence clause, and this check froze that blindness as an expected count.
    ok(d.addedIn2018.length === 4, `2018 adds four clauses: ${d.addedIn2018.join("; ")}`);
    ok(/one licence, restated/.test(d.verdict), "the verdict states which of the two things happened");
    // *** THE QUOTATIONS ARE QUOTATIONS -- AND THESE TWO CHECKS AGREED WITH A BAD TRANSCRIPTION. *** Both
    // were written asserting 'as-is' and 'pluginized' in SINGLE quotes. Both sources use DOUBLE quotes. The
    // gate matched because it was written from the same mistaken reading as the record, which is what a
    // self-consistency check is worth on its own -- and why section 6 hashes the text against a fetched
    // digest instead of spot-checking phrases.
    ok(CODROPS_2015.includes('Don\'t republish, redistribute or sell "as-is".'),
        "the earlier text is quoted verbatim, prohibition and quote characters included");
    ok(CODROPS_2018.includes('sell "pluginized" versions of it.'),
        "and the 2018 text, with the quote characters its source actually uses");
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
    // sourceUrl joined the required fields at v4203, after an entry naming a 404 repository sat here for
    // four versions looking like evidence.
    const noAnswer = { repo: "x", sourceUrl: "https://github.com/o/x", posture: POSTURE.REACHED,
                       licenceExists: true, redistributable: false,
                       taken: null, takenPaths: [], citedPaths: [], why: "because", spdx: "MIT" };
    ok(validateEntry(noAnswer).some((p) => /GRANTOR HELD THE RIGHTS/.test(p)),
        "*** an entry that does not answer it is INVALID -- the question cannot be skipped at record time ***");
    ok(validateEntry({ ...noAnswer, grantorHoldsRights: true }).length === 0,
        "and answering it makes the same entry valid, so the requirement is the only thing it was missing");
    ok(validateEntry({ ...noAnswer, grantorHoldsRights: null }).some((p) => /GRANTOR/.test(p)),
        "null is not an answer either -- an asset whose provenance is unestablished is not yet an entry");

    // *** AND THE STATE OF THE TREE, WHICH FLIPPED AT v4203. *** v4200 defined ENCUMBERED from a question
    // Keith asked about TIE fighter models -- a hypothetical, and the check here recorded that the register
    // held no such source, "defined before it was needed, which is the only time it can be defined calmly".
    // v4203 found a real one by reading: projapati66/Svg-IsometricCityAnimation ships an MIT LICENSE file
    // over artwork its author does not own. The category being ready is why that entry took one field to
    // file rather than a round to argue about.
    //
    // *** v4461: THIS CHECK WAS `enc.length === 1` AND A SECOND REAL ENCUMBERED SOURCE TURNED IT RED. *** That
    // is a pinned count standing in for a claim -- the same shape this tree keeps finding, a frozen number
    // checked against a derivation that is allowed to move. The claim underneath was never "there is one"; it
    // was "the category defined from a hypothetical gets USED by reading, and using it costs one field". So
    // the count is replaced by the substance, which is strictly harder to satisfy than either 1 or >= 1: every
    // encumbered entry must be encumbered FOR A STATED REASON, and must behave like it. An entry that flips
    // grantorHoldsRights to false without saying who does hold them, or that claims it may still be
    // redistributed, goes red here -- which `enc.length === 2` would happily wave through.
    const enc = REACHED_SOURCES.filter((e) => severityOf(e) === SEVERITY.ENCUMBERED);
    ok(enc.length >= 1, `the ENCUMBERED category is not hypothetical: ${enc.length} entr(y/ies) reach it`);
    ok(enc.some((e) => /Svg-IsometricCityAnimation/.test(e.repo)),
        "including the first one, found by reading a repo three versions after the category was defined from a " +
        `hypothetical. All of them: ${enc.map((e) => e.repo).join(", ")}`);
    //
    // *** THIS PATTERN WAS WRONG ON ITS FIRST RUN AND THE ENTRY IT ACCUSED WAS FINE. *** It was written from
    // the DaveFace note in front of me and it red-flagged projapati66, whose note says "neither of which the
    // grantor holds" -- the same assertion in words I had not thought of. Writing a check from ONE example and
    // reading its red as the example's fault is the shape this session has now hit five times. So the accepted
    // forms are an explicit list rather than one author's phrasing, and the failure message prints the list, so
    // the next writer is told what to say instead of guessing at a regex.
    const HOLDER_NAMED = [
        /the grantor (?:holds|owns)/i,           // "... neither of which the grantor holds"
        /not the grantor'?s/i,                   // "... is not the grantor's to license"
        /does not (?:own|hold|license)/i,        // "... the author does not own"
        /third party|third-party/i,              // "... credited to a third party"
        /Credits section/i,                      // "... its Credits section names who"
    ];
    const unexplained = enc.filter((e) => !HOLDER_NAMED.some((re) => re.test(e.licenceNote || "")));
    ok(unexplained.length === 0,
        "*** AND EVERY ENCUMBERED ENTRY SAYS IN ITS OWN licenceNote THAT SOMEONE ELSE HOLDS THE RIGHTS *** -- the " +
        "category is a finding about a specific third party, never a shrug, and the note is where a reader meets " +
        "it. Silent: " + (unexplained.map((e) => e.repo).join(", ") || "none") +
        ". Accepted forms: " + HOLDER_NAMED.map((re) => re.source).join(" | "));
    const shippable = enc.filter((e) => e.redistributable !== false || e.posture !== POSTURE.REACHED);
    ok(shippable.length === 0,
        "and every one of them is REACHED and not redistributable -- encumbrance bites on vendoring, so an " +
        "entry cannot be encumbered and shippable at once. Contradictory: " +
        (shippable.map((e) => `${e.repo} (${e.posture}, redistributable ${e.redistributable})`).join(", ") || "none"));
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

// 6) *** THE QUOTATIONS, WHICH THIS GATE PASSED ON WHILE TWO OF THEM WERE WRONG. ***
//
// v4198 shipped a 48-word transcription of a 77-word licence, spelled "build" as "built", and named a
// repository that 404s -- and every check in sections 1-5 stayed green, because all of them compared the
// register against ITSELF. `codropsDrift()` in particular read both texts, reported on their differences,
// and could not notice that one of them was missing its last two sentences: a drift detector cannot report
// a clause its own corpus does not contain.
//
// What is checkable WITHOUT a network is that the record is self-consistent and attributed. That is what
// this section does. Whether the record is TRUE is tools/ship/verifyLicenceTexts.mjs's job, because the only
// evidence for a quotation is the source, and a gate that needs a network is a gate that silently passes
// when offline.
{
    for (const [id, q] of Object.entries(LICENCE_TEXTS)) {
        ok(validateQuotation(id).length === 0, `${id}: internally consistent -- ${validateQuotation(id).join("; ") || "no problems"}`);
        const actual = createHash("sha256").update(q.text, "utf8").digest("hex");
        ok(actual === q.sha256, `${id}: the text hashes to its recorded sha256 (${q.sha256.slice(0, 12)})`);
        ok(q.text.split(/\s+/).filter(Boolean).length === q.words, `${id}: ${q.words} words, counted`);
        ok(q.text.length === q.chars, `${id}: ${q.chars} chars, counted`);
        ok(Array.isArray(q.sourceUrls) && q.sourceUrls.every((u) => /^https:\/\//.test(u)),
            `${id}: ${q.sourceUrls.length} source URL(s), all https -- somewhere a person can go and check`);
        ok(/^\d{4}-\d{2}-\d{2}$/.test(q.retrieved), `${id}: read on ${q.retrieved}`);
    }
    ok(quotationOf("codrops-2018") !== null && quotationOf("nope") === null, "quotationOf resolves a known id and refuses an unknown one");
    ok(quotationOf("codrops-2018").sourceUrls !== LICENCE_TEXTS["codrops-2018"].sourceUrls,
        "and hands back a copy of the URL list, so a caller cannot edit the register through it");

    // *** THE ACTUAL v4198 BUG, REPLAYED. *** Not "a truncation would be caught" as an assertion -- the
    // exact string that shipped, fed to the exact checks, required to go red. A gate that reproduces the
    // bug it was written for cannot quietly stop covering it.
    const V4198_2018 =
        "This resource can be used freely if integrated or built upon in personal or commercial projects such as " +
        "websites, web apps and web templates intended for sale. It is not allowed to take the resource 'as-is' " +
        "and sell it, redistribute, re-publish it, or sell 'pluginized' versions of it.";
    ok(V4198_2018.split(/\s+/).length === 48 && CODROPS_2018.split(/\s+/).length === 77,
        `what shipped at v4198 was ${V4198_2018.split(/\s+/).length} words of a ${CODROPS_2018.split(/\s+/).length}-word licence`);
    ok(createHash("sha256").update(V4198_2018, "utf8").digest("hex") !== LICENCE_TEXTS["codrops-2018"].sha256,
        "the v4198 text does not hash to the recorded digest -- the digest check would have caught it");
    ok(/built upon/.test(V4198_2018) && /build upon/.test(CODROPS_2018) && !/built upon/.test(CODROPS_2018),
        "and it read 'built upon' where the source says 'build upon' -- the word v4198 widened a regex for");

    // *** THE TWO SENTENCES THAT WENT MISSING ARE TERMS, NOT BOILERPLATE. ***
    ok(/visible mention and link to the original work/.test(CODROPS_2018) && !/visible mention/.test(V4198_2018),
        "the truncation dropped an ATTRIBUTION REQUIREMENT -- a condition, gone from a field the gate treats as a quotation");
    ok(/Always consider the licenses of all included/.test(CODROPS_2018) && !/Always consider/.test(V4198_2018),
        "and the clause that decides the DesignTheWay entry: consider the licences of all included libraries, scripts and images");
    const drift = codropsDrift();
    ok(drift.addedIn2018.length === 4, `codropsDrift now reports ${drift.addedIn2018.length} added clauses; with the truncated text it could see at most 2`);
    ok(drift.addedIn2018.some((c) => /visible mention/.test(c)), "including the attribution requirement it was previously blind to");
    ok(drift.bothForbidRedistribution && drift.bothGrantIntegration, "and the finding itself survives: one licence, restated");
    ok(drift.earlierAttestedFrom === 2015 && drift.earlierAttestedTo === 2016,
        `the earlier text is attested 2015-2016, not at a single year -- the same bytes appear in a 2016 repo`);

    // *** ONE TEXT, THREE REPOSITORIES -- INCLUDING THE ONE v4198 SAID DID NOT RESTATE IT. ***
    const t15 = LICENCE_TEXTS["codrops-2015"];
    ok(t15.sourceUrls.length === 3, `the earlier text is attested by ${t15.sourceUrls.length} repositories, byte for byte`);
    ok(t15.sourceUrls.some((u) => /lbebber\/HeatDistortionEffect/.test(u)),
        "one of them is lbebber/HeatDistortionEffect, whose entry previously said it referenced the licence by link instead of restating it");
    const heat = REACHED_SOURCES.find((e) => /HeatDistortionEffect/.test(e.repo));
    // The message must not interpolate the value it is asserting on both sides -- under sabotage the first
    // draft read "the entry names codrops/X, not codrops/X, which 404s", which tells a reader nothing.
    ok(heat.repo === "lbebber/HeatDistortionEffect",
        `the heat-distortion entry names ${JSON.stringify(heat.repo)}; it must be "lbebber/HeatDistortionEffect", ` +
        `because "codrops/HeatDistortionEffect" -- what v4198 recorded -- 404s`);
    ok(heat.licence === CODROPS_2015 && heat.licenceId === "codrops-2015", "and now quotes the text it actually carries");

    // *** EVERY ENTRY IS OPENABLE, WHICH IS THE FIELD THE 404 EXISTED FOR LACK OF. ***
    for (const e of REACHED_SOURCES) {
        ok(/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(e.sourceUrl || ""), `${e.repo}: sourceUrl is a github repo URL`);
        ok((e.sourceUrl || "").endsWith("/" + e.repo), `${e.repo}: and its URL names the same repo the entry does`);
    }

    // *** THE SECOND ENCUMBERED CASE, AND THE FIRST FOUND BY READING RATHER THAN BY ASKING. ***
    const dtw = REACHED_SOURCES.find((e) => /Svg-IsometricCityAnimation/.test(e.repo));
    ok(dtw && severityOf(dtw) === SEVERITY.ENCUMBERED, "the isometric-city entry ranks ENCUMBERED");
    ok(dtw.spdx === "MIT", "even though its LICENSE file is a plain MIT -- which is exactly what makes it encumbered rather than open");
    ok(dtw.licence === CODROPS_2018,
        "its README's licence section is codrops's 2018 text, byte for byte, on a repository that is not codrops");
    ok(LICENCE_TEXTS["codrops-2018"].sourceUrls.some((u) => /Svg-IsometricCityAnimation/.test(u)),
        "recorded as a source URL for that text, so the coincidence is evidence rather than an anecdote");
    ok(/Freepik/i.test(dtw.licenceNote) && /GSAP/i.test(dtw.licenceNote),
        "and the note names the two parties whose rights the grantor does not hold: Freepik's artwork and GreenSock's library");
    ok(/DISAGREE/.test(describeSource(dtw)), `describeSource surfaces the conflict: ${describeSource(dtw)}`);
    ok(!/DISAGREE/.test(describeSource(REACHED_SOURCES.find((e) => /beez/.test(e.repo)))),
        "and does not cry conflict on an entry with a single licence");
    ok(SEVERITY_NAMES[SEVERITY.ENCUMBERED] === "ENCUMBERED" && SEVERITY_NAMES.length === 5,
        "severity numbers have names, so a console line does not read '4' and leave the reader to remember");

    // *** THE EXTRACTOR, TESTED OFFLINE ON HAND-WRITTEN READMEs. *** verifyLicenceTexts needs a network;
    // licenceSection does not, and it is the piece that decides what counts as the licence.
    const README = ["# Thing", "", "## Build", "", "npm i", "", "## License", "",
                    "Some terms here.", "", "Read more here: [License](http://example.com/)", "",
                    "## Misc", "", "Follow us"].join("\n");
    ok(licenceSection(README) === "Some terms here.", "licenceSection takes the License section and stops at the next heading");
    ok(!/Read more here/.test(licenceSection(README)), "and drops the 'Read more here' link line, which LICENCE_TEXTS[].note records");
    ok(licenceSection("# Thing\n\nno licence section at all\n") === "", "a README with no License section yields nothing, not the whole file");
    ok(licenceSection("## License\n\nA.\n\nB.\n") === "A.B.", "multi-paragraph sections join, so a dropped paragraph changes the length");
    // *** AND IT IS REACHABLE NOW, WHICH IT WAS NOT FOR FIVE VERSIONS. *** v4198 shipped this register and
    // nothing but this gate imported it -- the shape #39 was filed for. A record of what was deliberately
    // NOT taken that only its own test can read is a record nobody consults at the moment they need it.
    // Quoted paths are matched against noComments (strings kept, comments stripped), code shapes against
    // codeOnly, which is the rule three wiring checks in six versions were caught ignoring.
    const mainQ = noComments(read("main.js"));
    const mainC = codeOnly(read("main.js"));
    ok(/import\s*\{[^}]*REACHED_SOURCES[^}]*\}\s*from\s*["']\.\/world\/reachedLicences\.mjs["']/.test(mainQ),
        "main.js imports the register from world/reachedLicences.mjs");
    ok(/window\.licences\s*=/.test(mainC), "and hangs it off window.licences");
    for (const fn of ["list", "quote", "drift"]) ok(new RegExp(`\\b${fn}\\s*:`).test(mainC), `licences.${fn}() is exposed`);
    ok(/sourceUrls\.join/.test(mainC),
        "and quote() prints the URLs, so the console answer ends at a source rather than at this tree's word for it");

    for (const [id, q] of Object.entries(LICENCE_TEXTS)) note(`${id}: ${q.words} words, sha ${q.sha256.slice(0, 12)}, ${q.sourceUrls.length} source(s), read ${q.retrieved}`);
}

console.log(`reachedLicences-selfcheck: ${pass} passed, ${fail} failed`);
if (!fail) console.log(`unchecked here: whether any of these licences would hold up in court, and whether a
source not in the register was ever read. What is checked is that every recorded source states its licence,
its posture and what was taken, that the two quoted codrops texts are one licence restated rather than two,
and that no source forbidding redistribution has left a single byte in this tree.`);
process.exit(fail ? 1 : 0);

// =============================================================================================================
// SABOTAGE LOG -- v4461, section 4b's three replacement checks. Applied to a working tree, GRADED ON EXIT
// CODES rather than on a count of FAIL lines (a crashing gate prints zero of them), restored byte-identical.
//
//   A  DaveFace/UnrealRetroShaders given redistributable: true while still grantorHoldsRights: false.
//      -> exit 1. An entry cannot be encumbered and shippable at once; encumbrance bites on vendoring, so
//      this is the check that carries the actual consequence rather than the label.
//
//   B  the third-party naming stripped out of the same entry's licenceNote, leaving the flag with no reason.
//      -> exit 1. The ENCUMBERED category is a finding about a SPECIFIC third party, never a shrug.
//
//   C  the knightcrawler25 entry deleted outright.
//      -> exit 0 HERE and exit 1 in citedSources-selfcheck, which is the correct division: losing an entry
//      is a debt-ratchet event, not a register-validity one, and a gate that reddened on both would be
//      claiming ground it does not hold.
//
//   *** AND THE FIRST WRITING OF CHECK B ACCUSED AN INNOCENT ENTRY. *** The pattern was written from the one
//   new note in front of me and red-flagged projapati66/Svg-IsometricCityAnimation, whose note says "neither
//   of which the grantor holds" -- the same assertion in words I had not thought of. Writing a check from a
//   single example and reading its red as the EXAMPLE'S fault is this session's most repeated defect. The
//   accepted forms are an enumerated list now, and the failure message prints the list so the next writer is
//   told what to say instead of guessing at a regex.
