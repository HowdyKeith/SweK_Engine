#!/usr/bin/env node
// WebGLEngine/tools/ship/slugShaping-selfcheck.mjs -- v4492
//
// THE TWO TEXT FEATURES THE REVIEWED PLAN PROPOSED AND THIS TREE RECORDS AS WON'T-DO, WITH THE REASONS MEASURED
// (docs/TSL-ROADMAP.md step 7 item 11, task 11). The plan (step 7's header) wanted "bidi shaping" -- which in its
// code was a two-letter Arabic presentation-form table and a whole-string reverse -- and "an MSDF fallback for CJK"
// drawn by canvas fillText. Neither is built, and tools/ship/todo.mjs says so under slug-bidi-shaping and
// slug-cjk-msdf-fallback. This gate keeps the reasons honest:
//   1. no vendored face carries a right-to-left script: the Arabic, Hebrew and Devanagari blocks of every cmap are
//      counted, and a Hebrew string laid out on Plex is glyph 0 for every letter -- shaping has nothing to shape;
//   2. a whole-string reverse is NOT UAX #9: on "abc <hebrew> 123" it reverses the Latin and the digits too, and the
//      bidi algorithm's visual order for that string (computed by its rules for this one case: an LTR paragraph, one
//      RTL run, European digits kept LTR) is held apart from it by name;
//   3. the CJK fallback's premise is gone: Sawarabi Gothic (vendored v4490) maps every codepoint of the rig's kanji and
//      kana text to a real glyph with an outline, and packs into the same atlas Slug draws -- slug-rig.html measured
//      the dense wall at 1.22x Plex's curves per band, not the "too dense for Slug" the fallback assumed;
//   4. the two todo entries exist, are wont, carry reasons, and name this gate as their evidence.
//
// SABOTAGE (v4492): A  todo slug-bidi-shaping flipped to open                                             -> exit=1, red: the record row for that id, by name
//                   B  the naive reverse replaced by a per-run reverse (the correct thing for this string) -> exit=1, red 2: the '321 ... cba' row and the not-UAX-9 row
//                   C  the cmap census counting glyph ids instead of codepoints                          -> exit=1, red 2: the every-face row (Latin no longer 52) and the CJK cmap row
//                   D  the CJK layout hold accepting glyph 0                                             -> 0 RED, A FINDING: every codepoint of the rig text is mapped, so a
//                      predicate loosened to admit .notdef never meets one; a hold on a property that always holds cannot be seen loosening. The
//                      CONTROL row (an unmapped alef IS .notdef on this face) was added, and the sabotage that shows the row's teeth is the INPUT:
//                   D' an unmapped codepoint appended to the rig text                                    -> exit=1, red 3: the none-.notdef row, the control, the pack row
//
// Run: node tools/ship/slugShaping-selfcheck.mjs      (headless, ~2 s)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFont } from "../../text/slugFont.js";
import { layoutText } from "../../text/slugText.js";
import { packAtlas } from "../../text/slugAtlas.js";
import { FONTS, fontPath } from "../../text/fontRegistry.mjs";
import { RIG_TEXT_CJK } from "../../render/slugRig.mjs";
import { TODO } from "./todo.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);

const BLOCKS = { hebrew: [0x0590, 0x05FF], arabic: [0x0600, 0x06FF], devanagari: [0x0900, 0x097F], cjkUnified: [0x4E00, 0x9FFF], kana: [0x3040, 0x30FF] };
const countBlock = (font, [lo, hi]) => { let n = 0; for (const [cp, gi] of font._cmap) if (cp >= lo && cp <= hi && gi > 0) n++; return n; };
const fonts = FONTS.map((f) => ({ f, font: parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, fontPath(f))))) }));

sec("1. NO VENDORED FACE CARRIES A RIGHT-TO-LEFT SCRIPT");
{
    const rows = fonts.map(({ f, font }) => ({ family: f.family, hebrew: countBlock(font, BLOCKS.hebrew), arabic: countBlock(font, BLOCKS.arabic), devanagari: countBlock(font, BLOCKS.devanagari), latin: countBlock(font, [0x41, 0x5A]) + countBlock(font, [0x61, 0x7A]), cmap: font._cmap.size }));
    for (const r of rows) report(`${r.family}: cmap ${r.cmap} codepoints; Hebrew ${r.hebrew}, Arabic ${r.arabic}, Devanagari ${r.devanagari}, basic Latin letters ${r.latin}`);
    ok(`every vendored face maps 0 Hebrew, 0 Arabic and 0 Devanagari codepoints (${rows.length} faces) -- and the census is live: each maps every basic Latin letter`,
        rows.length >= 5 && rows.every((r) => r.hebrew === 0 && r.arabic === 0 && r.devanagari === 0 && r.latin === 52));
    const plex = fonts.find((x) => x.f.family === "IBM Plex Serif").font;
    const heb = layoutText(plex, "אבג", { size: 20 });
    ok("a Hebrew string laid out on Plex is glyph 0 (.notdef) for every letter -- there is nothing for shaping to shape", heb.glyphs.length === 3 && heb.glyphs.every((g) => g.glyphIndex === 0), heb.glyphs.map((g) => g.glyphIndex).join(","));
}

sec("2. A WHOLE-STRING REVERSE IS NOT UAX #9");
{
    // the plan's bidi: reverse the string. UAX #9 on an LTR paragraph with one RTL run and European digits: the Latin stays,
    // the Hebrew run is reversed IN PLACE, the digits stay LTR (EN after an L context resolves L in an LTR paragraph).
    const logical = "abc אבג 123";
    const naive = [...logical].reverse().join("");
    const uax9Visual = "abc " + [..."אבג"].reverse().join("") + " 123";
    ok("the whole-string reverse moves the Latin to the end and reverses the digits: '321 ... cba'", naive.startsWith("321 ") && naive.endsWith(" cba"), JSON.stringify(naive));
    ok("*** and it is NOT the bidi algorithm's visual order for the same string, which keeps 'abc' and '123' where they are and reverses the Hebrew run in place ***", naive !== uax9Visual && uax9Visual.startsWith("abc ") && uax9Visual.endsWith(" 123"), `naive ${JSON.stringify(naive)} / UAX #9 ${JSON.stringify(uax9Visual)}`);
    report("the Arabic presentation-form half of the plan is not measured here: no vendored face has an Arabic glyph to present (section 1)");
}

sec("3. THE CJK FALLBACK'S PREMISE: SLUG ALREADY DRAWS THE DENSE FACE");
{
    const sg = fonts.find((x) => x.f.family === "Sawarabi Gothic");
    ok("Sawarabi Gothic is vendored and registered", !!sg);
    if (sg) {
        report(`Sawarabi Gothic: CJK Unified ${countBlock(sg.font, BLOCKS.cjkUnified)} codepoints, kana ${countBlock(sg.font, BLOCKS.kana)}`);
        ok("its cmap carries thousands of CJK Unified ideographs and the kana blocks", countBlock(sg.font, BLOCKS.cjkUnified) > 2000 && countBlock(sg.font, BLOCKS.kana) > 150);
        const laid = layoutText(sg.font, RIG_TEXT_CJK.trim(), { size: 20 });
        const gis = laid.glyphs.map((g) => g.glyphIndex);
        ok(`the rig's kanji and kana text lays out to a real glyph for every codepoint (${gis.length} glyphs, none .notdef)`, gis.length === [...RIG_TEXT_CJK.trim()].length && gis.every((gi) => gi > 0), gis.join(","));
        // CONTROL: the hold above is live only if the font CAN miss -- an unmapped codepoint on this face is .notdef. Sabotage D
        // (accepting glyph 0) went 0 red on the rig text because every codepoint of it is mapped; a loosened predicate on a
        // property that always holds is unobservable, so the sabotage that shows the row's teeth is an unmapped codepoint appended.
        const ctl = layoutText(sg.font, RIG_TEXT_CJK.trim() + "\u05D0", { size: 20 });
        ok("CONTROL: an unmapped codepoint (Hebrew alef) appended to that text IS .notdef on Sawarabi Gothic, so 'none .notdef' above is a live claim", ctl.glyphs.length === gis.length + 1 && ctl.glyphs[gis.length].glyphIndex === 0 && ctl.glyphs.slice(0, -1).every((g) => g.glyphIndex > 0));
        const outlines = [...new Set(gis)].map((gi) => ({ key: gi, contours: sg.font.outline(gi).contours }));
        const atlas = packAtlas(outlines, { format: "16f", logWidth: 12 });
        let curves = 0, empty = 0; for (const e of atlas.glyphs.values()) { if (e.empty) empty++; curves += e.curveCount; }
        ok(`every one of them has an outline and packs into the atlas Slug draws from: ${curves} curves, no empty glyph`, empty === 0 && curves > 300 && atlas.glyphs.size === outlines.length);
        report("the density question is slug-rig.html's and was measured at v4490: 1.22x Plex's curves per band, 19 at most against 17 -- not a face Slug cannot draw");
    }
}

sec("4. THE RECORD: tools/ship/todo.mjs says wont, with reasons, and names this gate");
{
    const me = "node tools/ship/slugShaping-selfcheck.mjs";
    for (const id of ["slug-bidi-shaping", "slug-cjk-msdf-fallback"]) {
        const t = TODO.find((x) => x.id === id);
        ok(`${id}: present, wont, a reason of more than 200 characters that cites a measurement, evidence naming this gate`,
            !!t && t.status === "wont" && typeof t.reason === "string" && t.reason.length > 200 && /MEASURED|COUNTED/i.test(t.reason) && t.evidence === me,
            t ? `${t.status}, reason ${t.reason ? t.reason.length : 0} chars, evidence ${t.evidence}` : "missing");
    }
}

console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nall checks pass");
console.log("unchecked here: UAX #9 itself (one string's visual order is written by its rules, not computed by an implementation of them); Arabic joining forms (no vendored glyphs to join); what a CJK label costs on a rig (slug-rig.html).");
process.exit(fails ? 1 : 0);
