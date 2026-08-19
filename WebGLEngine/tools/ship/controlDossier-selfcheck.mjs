// tools/ship/controlDossier-selfcheck.mjs
//
// Run: node tools/ship/controlDossier-selfcheck.mjs   (~5s)
//
// v3176 -- THE 114 CONTROLS ARE FIVE DECISIONS, NOT A HUNDRED AND FOURTEEN.
//
// The queue has asked for "a HUMAN decision per site" since v3113, and it has therefore been made ZERO TIMES in
// sixty rounds. The framing is right and too expensive -- but v3113 said WHY each needs a person, and the
// reason contains the shortcut: "A SLIDER, A SELECT AND A PASSWORD FIELD DO NOT FAIL ALIKE."
//
// *** THE DECISION IS PER KIND. *** text 57, checkbox 18, password 11, select 10, number 7. FIVE judgements
// cover every site. A CRUDE COUNT NEAR A HUNDRED IS AN UNASKED QUESTION, and this is the fifth time that law
// has paid: 58 fetch bodies -> 3, 99 kill sites -> 3, 206 controls -> 45 round-trip, 121 regexes -> ZERO.
//
// *** AND IT PROPOSES NOTHING. *** It reports what each control IS and what its unguarded failure would write.
// Suggesting a safe value per site would be guessing 114 times with extra steps -- what v3113 declined to do,
// and what "never type a reference value a gate compares against" forbids. Evidence, not a ruling.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const C = await import(pathToFileURL(path.join(HERE, "roundTripCensus.mjs")).href);
const D = await import(pathToFileURL(path.join(HERE, "controlDossier.mjs")).href);

const cen = C.roundTripCensus(ENG);
const dos = D.controlDossier(ENG, cen);

// ---- 1. THE CENSUS WAS REPORTING TWO NUMBERS UNDER ONE NAME ---------------------------------------------------
{
    ok("!! *** the census now names OCCURRENCES and DISTINCT CONTROLS separately ***",
        cen.total === 114 && cen.distinct === 103 && cen.total !== cen.distinct,
        "total counted OCCURRENCES while ids was DEDUPLICATED, so it reported 114 while its own list held 103 " +
        "-- and per file, count disagreed with ids.length for the same reason. TWO THINGS WEARING ONE LABEL, in " +
        "a module I shipped at v3138 TO FIX A NUMBER THAT WAS WRONG. The queue has said '114 controls' ever " +
        "since; the actionable list is 103");

    ok("...and per file the two agree with their own names",
        cen.perFile.every((f) => f.count >= f.distinct && f.distinct === f.ids.length),
        "count is occurrences, distinct is ids.length, and the 11 difference is controls assigned more than " +
        "once in one file");
}

// ---- 2. THE HUNDRED IS FIVE ---------------------------------------------------------------------------------------
{
    ok("!! 103 controls resolve to a HANDFUL of kinds",
        dos.kinds.length <= 6 && dos.total === cen.distinct,
        dos.kinds.map((k) => k + " " + dos.byKind[k].length).join(", ") + ". FIVE JUDGEMENTS COVER EVERY SITE, " +
        "and v3113's own reason is why: a slider, a select and a password field DO NOT FAIL ALIKE");

    ok("!! every control is classified -- none silently dropped",
        dos.total === cen.distinct,
        dos.total + " of " + cen.distinct + ". A dossier that quietly lost eleven would be the same failure it " +
        "was built to expose, and my first version did exactly that -- it was the CENSUS undercounting, not the " +
        "dossier, and comparing the two is the only reason it surfaced");

    ok("!! and each kind states what an UNGUARDED failure would write",
        dos.kinds.every((k) => D.KIND_DEFAULT[k] && D.KIND_DEFAULT[k].length > 20),
        "'a failed load leaves a browser default the next save writes as though the user chose it' (v3113) is " +
        "abstract. 'unchecked, and v3040's tunnel checkbox is exactly this failure' is a decision somebody can " +
        "actually make");

    ok("...and PASSWORD is called out as the expensive one",
        /empty password SAVED OVER A GOOD ONE/.test(D.KIND_DEFAULT.password) && dos.byKind.password.length > 0,
        dos.byKind.password.length + " password controls. An empty password written over a working one is not " +
        "a display bug -- it destroys state that cannot be recovered from the page");
}

// ---- 3. IT REPORTS, IT DOES NOT RULE ---------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(HERE, "controlDossier.mjs"), "utf8");
    ok("!! it proposes NO safe value for any site",
        !/suggest|recommend|shouldBe|safeValue/i.test(src.replace(/\/\/[^\n]*/g, " ")),
        "suggesting one per site would be GUESSING 114 TIMES WITH EXTRA STEPS -- exactly what v3113 declined to " +
        "do, and what 'never type a reference value a gate compares against' forbids");

    ok("!! it takes the census rather than re-deriving it",
        /export function controlDossier\(engRoot, census\)/.test(src) && !/readdirSync/.test(src),
        "ONE definition of 'round-trip control', not two. A second scan would drift from the first and the " +
        "disagreement would be invisible -- the shape this session has found five times");

    ok("...and it strips comments before classifying",
        /replace\(\/<!--\[\\s\\S\]\*\?-->\/g/.test(src),
        "a commented-out control must not classify a live one, and this file names every input type it detects");
}

console.log();
console.log("  ----  THE FIVE DECISIONS, so somebody can make them in one sitting:");
for (const k of dos.kinds) {
    const eg = dos.byKind[k].slice(0, 3).map((x) => x.file.replace(".html", "") + "#" + x.id).join(", ");
    console.log("  ----    " + k.padEnd(9) + String(dos.byKind[k].length).padStart(3) + "  e.g. " + eg.slice(0, 62));
}
console.log("  ----  NOT DECIDED HERE. What 'unknown' looks like for a password field is a judgement about");
console.log("  ----  what the user should see and what the save must refuse -- Keith's call, five times.");
if (fails) { console.log("controlDossier-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("controlDossier-selfcheck: all checks pass");
