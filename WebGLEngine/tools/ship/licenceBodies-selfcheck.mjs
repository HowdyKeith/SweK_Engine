#!/usr/bin/env node
// WebGLEngine/tools/ship/licenceBodies-selfcheck.mjs -- v4281
//
// GRADES world/licenceBodies.mjs -- the SPDX labels on our OWN vendored code, checked against the licence
// text for the first time.
//
// *** tools/ship/vendoredLicences-selfcheck.mjs IS ALL GREEN AND SAYS SO ITSELF: *** "nothing verifies that
// the text under vendor/<x>/LICENSE is the licence it is labelled with -- a mislabelled MIT would pass every
// check above." v4276 built the instrument for that and pointed it at thirty-five other people's
// repositories. This is the same instrument turned inward, and every label survived it -- which is the
// outcome to want from an audit rather than the one that justifies having run it.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { operativeBody, holderOf, identify, CLAUSES, CANONICAL, UPSTREAM_CHECKED, NOT_A_LICENCE_BODY }
    from "../../world/licenceBodies.mjs";
import { VENDORED } from "../../world/vendoredLicences.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${n}${d ? "   " + d : ""}`); };
const report = (m) => console.log("  ----  " + m);
const read = (e) => fs.readFileSync(path.join(ENG, e.path, e.file), "utf8");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
const withFile = VENDORED.filter((e) => e.file);

console.log("licenceBodies-selfcheck -- our own labels, read against our own licence text\n");

console.log("1. *** EVERY LABEL THAT CAN BE CHECKED FROM THE TEXT, IS ***");
{
    const verdicts = withFile.map((e) => ({ e, id: identify(read(e)) }));
    const agree = verdicts.filter((v) => v.id === v.e.spdx);
    const wrong = verdicts.filter((v) => v.id !== null && v.id !== v.e.spdx);
    const quiet = verdicts.filter((v) => v.id === null);
    ok("*** no vendored licence is labelled as something its text is not ***", wrong.length === 0,
        wrong.map((v) => `${v.e.path}: labelled ${v.e.spdx}, text says ${v.id}`).join("; ") ||
        `${agree.length} of ${verdicts.length} confirmed from the body`);
    ok("  and the ones that cannot be confirmed are NAMED rather than counted as passes",
        quiet.length === NOT_A_LICENCE_BODY.filter((n) => withFile.some((e) => e.path === n.path)).length,
        quiet.map((v) => v.e.path).join(", ") + " -- no licence body to read, which is not the same as wrong");
    ok("  every such entry says WHY there is no body", NOT_A_LICENCE_BODY.every((n) => n.why.length > 40));
    report("'unverifiable by this method' and 'wrong' are different answers, and collapsing them is how an " +
        "audit manufactures a finding. keyhunt's MIT describes an upstream project nothing was copied from; " +
        "ui/vendor's grant is a comment at the top of a JavaScript file. Both are correct and neither is text " +
        "this can read.");
}

console.log("\n2. *** MIT AND 0BSD DIFFER BY ONE CLAUSE, AND IT IS THE CLAUSE THE LABEL TURNS ON ***");
{
    const mit = withFile.filter((e) => e.spdx === "MIT" && identify(read(e)) === "MIT");
    const zero = withFile.filter((e) => e.spdx === "0BSD");
    ok("every MIT body carries the notice-retention clause", mit.length >= 8 &&
        mit.every((e) => CLAUSES.retention.test(operativeBody(read(e)))), mit.length + " of them");
    ok("*** and the 0BSD body does NOT -- that absence IS the licence ***", zero.length === 1 &&
        zero.every((e) => !CLAUSES.retention.test(operativeBody(read(e))) &&
                          CLAUSES.zeroBsdGrant.test(operativeBody(read(e)))),
        "htmx: everything granted, nothing required to be carried");
    ok("  so identify() is asking about an OBLIGATION, not about the word 'MIT' appearing",
        identify("MIT License\nCopyright (c) 2020 nobody\nyou may do as you like.") === null,
        "a file that says MIT and grants nothing is not MIT");
    report("htmx's minified bundle has ten licence-word hits and every one is the substring 'submit' -- " +
        "which is why #61 recorded it as unpapered until the licence was recovered from upstream at its " +
        "pinned tag. A keyword is not a licence.");
}

console.log("\n3. *** THE FONT LICENCE OPENS WITH MIT'S OWN GRANT SENTENCE ***");
{
    const fonts = withFile.find((e) => e.spdx === "OFL-1.1");
    const b = operativeBody(read(fonts));
    ok("*** SIL OFL 1.1 satisfies MIT's grant clause word for word ***", CLAUSES.mitGrant.test(b),
        "'permission is hereby granted, free of charge, to any person obtaining a copy' -- identical opening");
    // *** THE FIRST DRAFT ASSERTED THIS WITH THE LITERAL `true`. *** An assertion that cannot fail is
    // decoration, and this session has now caught five of them. The claim is testable: run the MIT test
    // FIRST, the way an identifier written without knowing about the OFL would, and see what it says.
    const mitFirst = (t) => {
        const b = operativeBody(t);
        if (CLAUSES.mitGrant.test(b)) return "MIT";                 // the naive order
        if (CLAUSES.reservedFontName.test(b)) return "OFL-1.1";
        return null;
    };
    ok("*** and a matcher that tested MIT first really does call this font licence MIT ***",
        mitFirst(read(fonts)) === "MIT" && identify(read(fonts)) === "OFL-1.1",
        "naive order says MIT, correct order says OFL-1.1, on the same bytes");
    ok("*** what makes it a font licence is that it constrains RENAMING ***",
        CLAUSES.reservedFontName.test(b) && identify(read(fonts)) === "OFL-1.1",
        "Reserved Font Name -- no permissive software licence has an equivalent");
    ok("  and it lacks the clauses MIT is otherwise identified by",
        !CLAUSES.sublicense.test(b) && !CLAUSES.asIs.test(b),
        "no sublicense grant, no as-is disclaimer in MIT's words");
    report("this is the round's sharpest reminder that a licence is not identified by its opening. Reading " +
        "the first sentence is exactly what a careless scan does, and here it is the sentence two different " +
        "licence families share.");
}

console.log("\n4. *** TEN UNRELATED UPSTREAMS SHIPPED THE SAME 1,020 CHARACTERS ***");
{
    const bodies = withFile.filter((e) => identify(read(e)) === "MIT").map((e) => operativeBody(read(e)));
    const uniq = new Set(bodies.map(sha));
    ok("*** every confirmed-MIT body is byte-identical to every other ***", uniq.size === 1,
        `${bodies.length} licences, ${uniq.size} distinct body, sha ${[...uniq][0]}`);
    ok("  at exactly the recorded length", bodies.every((b) => b.length === CANONICAL.MIT.chars),
        CANONICAL.MIT.chars + " characters");
    ok("  and the recorded hash is the one they actually have", [...uniq][0] === CANONICAL.MIT.sha);
    ok("CONTROL: the 0BSD and OFL bodies are NOT that text", (() => {
        const others = withFile.filter((e) => e.spdx !== "MIT").map((e) => sha(operativeBody(read(e))));
        return others.every((h) => h !== CANONICAL.MIT.sha); })(),
        "635 and 4,045 characters against MIT's 1,020 -- different licences, different lengths");
    report("an ELEVENTH copy that differed would have something to say. One that matches says only that its " +
        "author used the standard text, which is the unremarkable and reassuring case -- and it is only " +
        "unremarkable because somebody checked.");
}

console.log("\n5. *** CORROBORATED FROM OUTSIDE THE TREE, WHICH IS THE ONLY EVIDENCE THAT IS NOT OURS ***");
{
    ok("eight vendored licences were compared against their live upstream", UPSTREAM_CHECKED.length === 8);
    ok("  and every operative body matched", UPSTREAM_CHECKED.every((u) => u.identicalFile || !!u.why),
        "six byte-identical files; the two that differ say what differs");
    const differ = UPSTREAM_CHECKED.filter((u) => !u.identicalFile);
    ok("*** and neither difference is a difference of LICENCE ***", differ.length === 2 &&
        differ.every((u) => /pinned|title|wrap/i.test(u.why)),
        differ.map((u) => u.path.split("/").pop()).join(" and ") +
        " -- a pinned year range, and a title line plus wrapping");
    ok("  every checked entry names a real vendored directory",
        UPSTREAM_CHECKED.every((u) => VENDORED.some((e) => e.path === u.path)));
    report("*** THE 2026 COPYRIGHT DATES LOOKED ALARMING AND WERE UPSTREAM'S OWN. *** Four vendored licences " +
        "carry a copyright year equal to the current one, which reads exactly like paperwork generated here " +
        "on somebody else's behalf -- #82's ENCUMBERED shape in its dangerous direction. Cloning the three " +
        "upstreams and diffing settled it in a minute: byte-identical, 2026 included. A suspicion that " +
        "survives being checked is a finding; one that does not is why you check.");
}

console.log("\n6. THE NORMALISER, AND THE TWO WAYS IT WAS WRONG");
{
    // *** IT DROPPED THE RETENTION CLAUSE. *** The first version filtered out any line CONTAINING
    // "copyright". Jolt's upstream licence puts each paragraph on one line, so that deleted the whole
    // condition; ours wraps at 80 columns, so it deleted half. 432 characters against 870, and two copies of
    // one licence looked like two licences.
    const unwrapped = 'Copyright 2021 Someone\n\nPermission is hereby granted, free of charge, to any person ' +
        'obtaining a copy of this software, to deal in the Software without restriction, including the ' +
        'rights to sublicense. The above copyright notice and this permission notice shall be included in ' +
        'all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS".';
    const wrapped = unwrapped.replace(/(.{60}) /g, "$1\n");
    ok("*** the same licence wrapped and unwrapped gives the SAME body ***",
        operativeBody(unwrapped) === operativeBody(wrapped),
        "which is the bug that made jolt look like a different licence from jolt");
    ok("  and the retention clause survives normalisation in both",
        CLAUSES.retention.test(operativeBody(unwrapped)) && CLAUSES.retention.test(operativeBody(wrapped)),
        "a line that MENTIONS copyright is a condition; a line that BEGINS with it is the notice");
    ok("  while the copyright NOTICE is dropped from both",
        !operativeBody(unwrapped).includes("someone") && !operativeBody(wrapped).includes("someone"));
    ok("  and a title line is dropped whether present or absent",
        operativeBody("MIT License\n" + unwrapped) === operativeBody(unwrapped));
    // The holder is read separately, because attribution is a different question from the grant.
    ok("*** the copyright HOLDER is extracted, not discarded ***",
        holderOf(unwrapped) === "2021 Someone" &&
        withFile.filter((e) => holderOf(read(e))).length >= 10,
        "v4277's lesson: the grant and who is granting are two questions, and only one of them is the text");
}

// =============================================================================================================
// SABOTAGE LOG -- grep-confirmed before the result was read, exit codes and FAIL summaries both read, both
// files restored md5-identical (licenceBodies a050e90e0d71, vendoredLicences 89f4e6683bff). MEASURED.
//
//   A  htmx's 0BSD relabelled MIT in world/vendoredLicences.mjs -- the mislabel the older gate's own closing
//      note says it cannot catch, done to the one entry where it matters most.
//      -> exit=1, 2 FAIL. The label/text comparison names the file and both licences ("labelled MIT, text
//      says 0BSD"), and the clause check fails separately. The whole round exists for this red.
//
//   B  identify()'s clause order reversed so MIT is tested first -- the naive order somebody would write
//      without knowing SIL OFL opens with MIT's grant sentence.
//      -> exit=1, 5 FAIL. The font licence is reported as MIT, the demonstration in section 3 inverts, the
//      Reserved Font Name check fails, and -- the interesting one -- the canonical-body check goes from
//      "10 licences, 1 distinct body" to "11 licences, 2 distinct bodies", because a 4,045-character font
//      licence has joined the MIT set. A wrong identification is visible in a statistic nobody aimed at it.
//
//   C  the normaliser's ORIGINAL bug restored: drop every line CONTAINING "copyright" rather than every line
//      BEGINNING with it.
//      -> exit=1, 6 FAIL. Every MIT body loses its retention clause, so the count of MIT bodies goes to
//      ZERO and ten licences become unidentifiable at once. This is the bug that shipped in the first draft
//      of this file and made jolt's licence look like a different licence from jolt's licence -- 432
//      characters against 870 -- and it is the reason section 6 tests wrapped against unwrapped text rather
//      than trusting that a normaliser normalises.
//
// One red arrived unbidden and is corrected above: section 3 asserted "a matcher keyed on that sentence
// would call a font licence MIT" with the literal `true`. That is an assertion that cannot fail, the fifth
// this session has caught, and the claim was testable all along -- run the naive order and read what it says.
// It says MIT.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: WHETHER THE UPSTREAMS ARE THE RIGHT UPSTREAMS. Section 5 proves our copy matches " +
    "the repository world/vendoredLicences.mjs NAMES, not that the naming is right -- if an entry pointed at " +
    "the wrong project, a matching licence would confirm the wrong thing convincingly. Also unchecked: the " +
    "six vendored directories whose upstream was NOT fetched, and every claim about what the code in those " +
    "directories IS. This reads licence files. A directory whose LICENSE is perfect and whose contents came " +
    "from somewhere else entirely would pass every check here, which is the ENCUMBERED question and it needs " +
    "the code compared, not the paperwork.");
process.exit(fails ? 1 : 0);
