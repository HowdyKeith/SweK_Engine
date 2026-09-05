// WebGLEngine/render/colourReach-selfcheck.mjs -- v4424
//
// Run: node render/colourReach-selfcheck.mjs
//
// Grades render/colourReach.mjs: how far the fire-colour census actually reaches, and what it does not.
//
// *** SECTION 2 IS A CHECK ON A SENTENCE I SHIPPED TWO ROUNDS AGO. *** ev/shipDebris.mjs's header says "the
// population is SMALL and it is named rather than guessed at". That was measured with a DRAW-SITE detector,
// and this gate asserts that the two populations DO NOT OVERLAP AT ALL -- which is what makes the old
// sentence a claim about drawing rather than about colours.
"use strict";

import * as R from "./colourReach.mjs";
import { SOURCES } from "./fireColour.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

const rows = R.census();
const draw = rows.filter((r) => r.draw), lit = rows.filter((r) => r.literal);
const both = rows.filter((r) => r.draw && r.literal);

// ---- 1. THE THREE KINDS, COUNTED FROM THE TREE ------------------------------------------------------------
{
    say(`named ramps in fireColour SOURCES: ${SOURCES.length}`);
    say(`files that draw additively themselves (v4421's detector): ${draw.length}`);
    say(`files that name a literal colour for something else:      ${lit.length}`);
    say(`files in BOTH:                                            ${both.length}`);
    ok("the counts are what the record says", 
        SOURCES.length === R.MEASURED_AT_V4424.namedRamps &&
        draw.length === R.MEASURED_AT_V4424.drawSiteFiles &&
        lit.length === R.MEASURED_AT_V4424.literalColourFiles,
        `${SOURCES.length}/${draw.length}/${lit.length} against ${R.MEASURED_AT_V4424.namedRamps}/` +
        `${R.MEASURED_AT_V4424.drawSiteFiles}/${R.MEASURED_AT_V4424.literalColourFiles}`);
    ok("every kind is a predicate over source, so the numbers are re-derivable rather than recorded",
        ["drawSite", "literalColour", "hot"].every((k) => typeof R.KINDS[k] === "function"));
}

// ---- 2. *** THE TWO POPULATIONS DO NOT OVERLAP, WHICH IS WHY ONE DETECTOR REPORTED THE OTHER AS ABSENT *** --
{
    say("");
    ok("!! *** ZERO files both draw additively AND name a literal colour ***",
        both.length === 0 && R.MEASURED_AT_V4424.overlapDrawAndLiteral === 0,
        `${both.length} in both. THIS IS THE FINDING: v4421 looked for gl.blendFunc(gl.ONE), found 12 files ` +
        "and wrote that the population was SMALL. That sentence is true of DRAW SITES and false of COLOURS -- " +
        "an effect that hands a colour to a shared particle system never calls blendFunc at all. A detector " +
        "cannot report the size of a population it has no way to see");
    // The three Keith named are the concrete instance, so the claim is not left as an abstraction.
    const three = Object.keys(R.MEASURED_AT_V4424.keithsThree);
    for (const f of three) say(`  ${f.padEnd(28)} blendFunc calls: ${R.MEASURED_AT_V4424.keithsThree[f].blendFunc}`);
    ok("!! ...and none of the three effects Keith named is visible to that detector",
        three.every((f) => R.MEASURED_AT_V4424.keithsThree[f].blendFunc === 0),
        "fireworks, plasma and lightning were the prompt for this round and all three are invisible to the " +
        "detector that declared the population small");
}

// ---- 3. THE RATCHET IS A LIST OF NAMES, AND IT WAS TRUNCATED BY A PAGER ONCE -------------------------------
{
    say("");
    const now = R.hotUnregistered(rows);
    const extra = now.filter((f) => !R.HOT_UNREGISTERED.includes(f));
    const gone = R.HOT_UNREGISTERED.filter((f) => !now.includes(f));
    say(`hot effects naming a literal colour and NOT in the census: ${now.length}`);
    ok("!! the frozen list NAMES its members, so an arrival can be pointed at rather than inferred",
        extra.length === 0 && gone.length === 0,
        extra.length ? "ARRIVED: " + extra.join(", ") : gone.length ? "GONE: " + gone.join(", ") : "no drift");
    ok("!! and the list is the measured length, not a screenful",
        R.HOT_UNREGISTERED.length === now.length && now.length === R.MEASURED_AT_V4424.hotUnregistered,
        `${R.HOT_UNREGISTERED.length} frozen, ${now.length} measured. THE FIRST DRAFT PASTED 16 NAMES FROM A ` +
        "TERMINAL `head -16` AND THE REAL COUNT IS 29 -- a list truncated by a pager would have ratcheted " +
        "thirteen real files into invisibility, inside the round whose subject is a detector's reach");
    ok("nothing already in the census is also listed as unregistered",
        !now.some((f) => SOURCES.map((s) => s.file).includes(f)));
}

// ---- 4. THE CENSUS DOES NOT PRETEND THE 77 ARE FIRES --------------------------------------------------------
{
    say("");
    const hotLit = rows.filter((r) => r.literal && r.hot).length;
    say(`of the ${lit.length} files naming a literal colour, ${hotLit} talk about hot effects`);
    ok("!! most literal-colour files are NOT hot, and the census says so rather than registering them all",
        hotLit < lit.length,
        `${lit.length - hotLit} of ${lit.length} are weather, water, biome tints, UI and the like. ` +
        "Registering every colour literal would turn a census with a question into a list with none");
    // *** THE CENSUS MUST NOT READ PROSE, AND THIS ROUND IS THE PROOF. *** Writing v4424 changed the census's
    // own answer: main.js's version comment, brain/brain.js's, gateSweep.mjs's ledger entry and
    // colourReach.mjs's own header all QUOTE the blendFunc pattern while explaining the detector, so the raw
    // reader counted 17 draw sites instead of 13 and put two files into the "both kinds" overlap the whole
    // finding rests on being EMPTY. A CENSUS THAT READS COMMENTS MEASURES ITS OWN CHANGELOG.
    {
        const withProse = "// this file mentions gl.blendFunc(gl.ONE) only in a comment\nexport const x = 1;\n";
        ok("!! *** a file that only MENTIONS the pattern in a comment is not counted as a draw site ***",
            R.KINDS.drawSite(withProse) === true && R.countsAsDrawSite(withProse) === false,
            "raw source matches the predicate (that is the predicate's job); the CENSUS must not, because " +
            "describing a detector would otherwise enrol the describer. Third instance of commentFalsePass " +
            "in one session -- v4421's gate was satisfied by the comment above the line it checked");
    }
    ok("the hot predicate is crude and is declared crude, not quietly trusted",
        /reads words, not behaviour/.test(
            (await import("node:fs")).readFileSync(new URL("./colourReach.mjs", import.meta.url), "utf8")),
        "it counts a file that merely mentions fire and misses one that draws a flame without naming it");
}

console.log("colourReach-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
