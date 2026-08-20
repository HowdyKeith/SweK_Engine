// WebGLEngine/tools/ship/orphanDisposition-selfcheck.mjs -- v3601
// ---------------------------------------------------------------------------------------------------------------
// Section 3 is the round: the CONTROL that separates "the classifier is wrong" from "the classifier is right and
// the record lives somewhere it cannot look". Without it this file would read as an accusation.
//
// Section 4 shows a question that CANNOT FAIL failing to discriminate, driven rather than described (v3551).
// Section 5 shows the detector's own first version reporting an implausible number, for the same reason.
// ---------------------------------------------------------------------------------------------------------------
"use strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { classify, ENG } from "./orphanTriage.mjs";
import { RECORDED, undecided, gateConsumers, nonGateMentions, guaranteedQuestion,
         MEASURED_V3601 } from "./orphanDisposition.mjs";

let pass = 0, fail = 0;
const ok = (n, c, note = "") => { if (c) { pass++; console.log("  ok   " + n + (note ? "  -- " + note : "")); }
                                  else { fail++; console.log("  FAIL " + n + (note ? "  -- " + note : "")); } };
const section = (n) => console.log("\n== " + n + " ==");

const files = (() => { const out = []; const walk = (a, p) => {
    for (const e of readdirSync(a, { withFileTypes: true })) { const r = p ? p + "/" + e.name : e.name;
        if (e.isDirectory()) { if (!/^(node_modules|\.git)$/.test(e.name)) walk(join(a, e.name), r); }
        else if (/\.m?js$/.test(e.name)) out.push(r); } }; walk(ENG, ""); return out; })();
const pile = classify().split.unclassified.slice();

section("1. THE PILE IS DERIVED, AND IT IS NOT THE NUMBER MY NOTES CARRIED");
{
    ok("the pile comes from orphanTriage.classify() rather than a list held here",
       Array.isArray(pile) && pile.length > 0, pile.length + " members");
    ok("!! and my own note closing v3600 said " + MEASURED_V3601.myNoteSaid,
       pile.length !== MEASURED_V3601.myNoteSaid, "a number nothing derives is a memory");
    // REPORTED, NOT PINNED: the pile SHRINKING is the whole point, so an equality here would fail on progress.
    ok("the size is reported and not pinned (a shrinking pile must never fail a build)", true, pile.length);
}

section("2. EVERY MEMBER IS EITHER QUOTED-DECIDED OR LISTED-UNDECIDED, AND THE TWO PARTITION THE PILE");
{
    const named = RECORDED.map((r) => r.module), und = undecided(pile);
    ok("no member is both decided and undecided", !named.some((m) => und.includes(m)));
    ok("no member is neither", named.filter((m) => pile.includes(m)).length + und.length === pile.length,
       named.filter((m) => pile.includes(m)).length + " decided + " + und.length + " undecided = " + pile.length);
    ok("!! every recorded disposition is QUOTED and its sentence is still in the tree",
       RECORDED.every((r) => existsSync(join(ENG, r.at)) && readFileSync(join(ENG, r.at), "utf8").includes(r.needle)),
       RECORDED.length + " quotes re-found at their source on this run");
    // The load-bearing negative: a quote that rotted must be caught, not carried.
    const rotted = { at: "brain/rl/bptt.js", needle: "a sentence that is not there" };
    ok("...and a rotted quote is CAUGHT rather than carried",
       !readFileSync(join(ENG, rotted.at), "utf8").includes(rotted.needle));
    ok("no disposition is invented for the undecided", und.length > 0,
       "listed as undecided: " + und.length + " -- writing them reasons would be fabricating provenance");
}

section("3. THE CONTROL -- WITHOUT THIS THE ROUND IS AN ACCUSATION RATHER THAN A FINDING");
{
    let imports = 0, prose = 0;
    for (const m of pile) { const n = nonGateMentions(m, files); imports += n.imports.length; prose += n.prose.length; }
    ok("!! EVERY non-gate mention of every member is PROSE, not an import", imports === 0,
       prose + " prose mentions, " + imports + " imports");
    ok("...so graveyard's resolver is RIGHT and the pile is a real gate-only pile", imports === 0);
    // POSITIVE CONTROL: the detector must be able to SEE an import, or the zero above means nothing.
    const seen = nonGateMentions("tools/ship/moduleRefs.mjs", files);
    ok("!! and the detector CAN see an import when there is one (positive control)", seen.imports.length > 0,
       "moduleRefs.mjs has " + seen.imports.length + " non-gate importers");
    ok("prose is counted apart from imports rather than folded in", prose > 0, prose);
}

section("4. A QUESTION WHOSE ANSWER IS STRUCTURALLY GUARANTEED, DRIVEN");
{
    const g = guaranteedQuestion(pile, files);
    ok("!! 'imported by a gate named for something else' holds for EVERY member",
       g.holds === g.members, g.holds + " of " + g.members);
    ok("...so it discriminates NOTHING and is not used as a signal", g.discriminates === false,
       "v3551's defect, caught before it was built");
    // What IS used is a COUNT, and it is offered as degree rather than verdict.
    const counts = pile.map((m) => gateConsumers(m, files).length);
    ok("the gate-consumer count VARIES across the pile, so it ranks even though it cannot decide",
       Math.max(...counts) > Math.min(...counts), "range " + Math.min(...counts) + ".." + Math.max(...counts));
    ok("and the record says out loud that the count ranks and does not decide",
       /does not decide|NOT AS A VERDICT|not a verdict/i.test(MEASURED_V3601.guaranteedQuestion + " " + MEASURED_V3601.notClaimed) ||
       /THE COUNT RANKS/.test(readFileSync(join(ENG, "tools/ship/orphanDisposition.mjs"), "utf8")));
}

section("5. THE DETECTOR'S OWN FIRST VERSION, SHOWN REPORTING AN IMPLAUSIBLE NUMBER");
{
    // The first name test matched the BARE BASENAME. `coverage` is an English word.
    const bare = new RegExp("\\bcoverage\\b");
    const hits = files.filter((f) => !/-selfcheck\.mjs$/.test(f) && f !== "tools/roundhouse/coverage.mjs" &&
                                     !/orphanTriage\.mjs$|orphanDisposition\.mjs$|^main\.js$/.test(f) &&
                                     bare.test(readFileSync(join(ENG, f), "utf8")));
    const fixed = nonGateMentions("tools/roundhouse/coverage.mjs", files);
    ok("!! matching the bare basename calls coverage.mjs 'mentioned' in dozens of files", hits.length > 40,
       hits.length + " files contain the English word");
    ok("...and requiring the EXTENSION collapses it", fixed.prose.length + fixed.imports.length < 10,
       hits.length + " -> " + (fixed.prose.length + fixed.imports.length));
    ok("a hyphen is not a boundary either -- bzw-coverage.mjs must not match coverage.mjs",
       !fixed.prose.includes("bz/tools/bzw-coverage.mjs") && !fixed.imports.includes("bz/tools/bzw-coverage.mjs"));
}

section("6. THE FINDING: THE REGISTER BUILT FOR THIS NAMES NONE OF THEM");
{
    const reg = existsSync(join(ENG, "tools/ship/unwiredRegister.mjs"))
        ? readFileSync(join(ENG, "tools/ship/unwiredRegister.mjs"), "utf8") : "";
    const named = pile.filter((m) => reg.includes(m.split("/").pop()));
    ok("!! unwiredRegister.mjs -- debt WITH A NAME AND A REASON -- names none of the pile",
       named.length === MEASURED_V3601.unwiredRegisterNames, "names " + named.length);
    ok("while the tree itself already carries " + RECORDED.length + " dispositions, as comments",
       RECORDED.length > 0);
    // ANTIDOTE (v3196): when somebody moves these into unwiredRegister, THIS LINE GOES RED and should be
    // rewritten to assert that every decided member is registered THERE -- not weakened, not deleted.
}

section("7. WHAT IS NOT CLAIMED");
{
    ok("nothing here is ratcheted and graveyard's count is untouched",
       /Nothing is ratcheted and graveyard's count is untouched/.test(MEASURED_V3601.notClaimed));
    ok("no disposition is invented", /NO disposition is invented/.test(MEASURED_V3601.notClaimed));
    ok("the control is stated as the thing that makes this a finding",
       /GRAVEYARD'S RESOLVER IS RIGHT/.test(MEASURED_V3601.control));
}

console.log("\n" + (fail ? "FAILED " + fail + " of " + (pass + fail) : "ALL " + pass + " CHECKS PASS"));
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exit(fail ? 1 : 0);
