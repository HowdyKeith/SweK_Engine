#!/usr/bin/env node
// WebGLEngine/tools/ship/gposKern-selfcheck.mjs -- v4485
//
// GPOS PAIR KERNING IN text/slugFont.js, HELD TO A TABLE BUILT BY HAND AND TO THE FONT THIS TREE SHIPS (docs/TSL-ROADMAP.md
// step 7 item 5, task 5). Until v4485 slugFont read the legacy `kern` table only, and the vendored IBM Plex Serif has none:
// *** EVERY LABEL THIS TREE DREW WAS UNKERNED, AND layoutText SAID SO IN kerningSource ON EVERY CALL *** ("none (font
// kerns via GPOS, which is not read)"). Now parseGpos reads the default script's default language's 'kern' feature, its
// LookupType 2 subtables directly or through a type 9 extension, PairPos formats 1 and 2 with coverage formats 1 and 2
// and class definitions in both formats, and takes the first glyph's xAdvance from the first subtable that applies;
// the legacy table is the fallback when GPOS carries no pair kerning.
//
// THE CONSTRUCTED TABLE (section 1) is 326 bytes written here field by field from the OpenType specification, so every
// expectation is a restatement of the spec and not of the parser: two scripts (DFLT, whose default LangSys lists a 'kern'
// and a 'liga' feature; latn/ENG, whose 'kern' names a lookup that must NEVER be read), three features, four lookups --
// a PairPos lookup with a format 1 subtable (coverage format 1, xAdvance only) and a format 2 subtable behind it
// (coverage format 2, class defs in formats 2 and 1, value records carrying xPlacement AND xAdvance for the first glyph
// and an xAdvance for the second, all but the first glyph's xAdvance to be skipped), an extension lookup wrapping a
// format 1 subtable at a 32-bit offset, a ligature lookup the reader must not touch, and the foreign-language lookup.
//
// THE REAL FONT (section 2) has no independent oracle on this box (no fontTools), so its holds are what a reader cannot
// fake by accident: the source is GPOS through DFLT/dflt, one lookup of four subtables, A/V negative and symmetric, T/o
// negative, n/n zero, an f-to-paren pair POSITIVE (a serif face opens that pair), 1,112 kerned pairs over the 71-character
// label alphabet with more negative than positive -- and the picture: "Sphinx 42% AV" at 28 px lays out 1.54 px narrower
// kerned than unkerned (the phrase has one strong pair, A/V at -50 units, and a handful of small ones; a first draft of this
// gate expected "a few pixels" and was wrong by the measurement), and the layout reports GPOS. The synthetic test font (kern only) still reports kern and A/B -80.
//
// SABOTAGE (v4485): A  the first glyph's xAdvance read from the SECOND value record (the format-2 record's tail)  -> exit=1, 5 red: three format-2 rows, and the real font's A/V and T/o rows
//                   B  a glyph absent from a class definition given class 1 instead of class 0                    -> exit=1, 2 red: the fall-through row and the stepped-over row (the real font's pairs survive: its class lists are complete)
//                   C  the extension subtable's 32-bit offset read as 16 bits                                       -> exit=1, 1 red: the extension row (the pair lands nowhere)
//                   D  layoutText's kerningSource written from hasKernTable again                                 -> exit=1, 1 red: the 'AV' layout row (the real font reports none)
//
// Run: node tools/ship/gposKern-selfcheck.mjs      (~0.5 s, headless)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFont, parseGpos } from "../../text/slugFont.js";
import { layoutText } from "../../text/slugText.js";
import { testFontBytes } from "../../text/slugTestFont.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const report = (name, detail) => console.log(`  ----  ${name}   ${detail}`);
const sec = (t) => console.log("\n" + t);

/** A byte writer that checks each struct lands where the offsets say it does. */
function writer(size) {
    const b = new Uint8Array(size), dv = new DataView(b.buffer); let p = 0;
    const at = (want, what) => { if (p !== want) throw new Error(`the constructed table put ${what} at ${p}, the offsets say ${want}`); };
    return { b, u16: (v) => { dv.setUint16(p, v); p += 2; }, i16: (v) => { dv.setInt16(p, v); p += 2; }, u32: (v) => { dv.setUint32(p, v); p += 4; }, tag: (t) => { for (let i = 0; i < 4; i++) b[p++] = t.charCodeAt(i); }, at, get pos() { return p; } };
}
/** The 326-byte GPOS table described in the header. Offsets are relative to the struct the spec says they are. */
function buildGpos() {
    const w = writer(326);
    w.at(0, "the header"); w.u16(1); w.u16(0); w.u16(10); w.u16(56); w.u16(96);                        // version 1.0, ScriptList, FeatureList, LookupList
    w.at(10, "the ScriptList"); w.u16(2); w.tag("DFLT"); w.u16(14); w.tag("latn"); w.u16(28);
    w.at(24, "Script DFLT"); w.u16(4); w.u16(0);                                                           // defaultLangSys at +4, no LangSysRecords
    w.at(28, "LangSys DFLT/dflt"); w.u16(0); w.u16(0xFFFF); w.u16(2); w.u16(0); w.u16(1);                  // features 0 (kern) and 1 (liga)
    w.at(38, "Script latn"); w.u16(0); w.u16(1); w.tag("ENG "); w.u16(10);                                  // no default; ENG at +10
    w.at(48, "LangSys latn/ENG"); w.u16(0); w.u16(0xFFFF); w.u16(1); w.u16(2);                             // feature 2 (the other kern)
    w.at(56, "the FeatureList"); w.u16(3); w.tag("kern"); w.u16(20); w.tag("liga"); w.u16(28); w.tag("kern"); w.u16(34);
    w.at(76, "Feature kern"); w.u16(0); w.u16(2); w.u16(0); w.u16(1);                                      // lookups 0 and 1
    w.at(84, "Feature liga"); w.u16(0); w.u16(1); w.u16(2);
    w.at(90, "Feature kern (ENG)"); w.u16(0); w.u16(1); w.u16(3);
    w.at(96, "the LookupList"); w.u16(4); w.u16(10); w.u16(140); w.u16(184); w.u16(198);
    w.at(106, "Lookup 0 (PairPos)"); w.u16(2); w.u16(0); w.u16(2); w.u16(10); w.u16(48);
    w.at(116, "PairPos format 1"); w.u16(1); w.u16(14); w.u16(0x0004); w.u16(0x0000); w.u16(2); w.u16(22); w.u16(32);
    w.at(130, "its coverage (format 1)"); w.u16(1); w.u16(2); w.u16(1); w.u16(2);
    w.at(138, "PairSet of glyph 1"); w.u16(2); w.u16(2); w.i16(-80); w.u16(3); w.i16(-40);
    w.at(148, "PairSet of glyph 2"); w.u16(1); w.u16(3); w.i16(40);
    w.at(154, "PairPos format 2"); w.u16(2); w.u16(52); w.u16(0x0005); w.u16(0x0004); w.u16(62); w.u16(72); w.u16(2); w.u16(3);
    const recs = [[0, -5, 0], [0, -10, 0], [0, -15, 0], [7, -20, 1], [0, -25, 0], [0, -30, 0]];              // (xPlacement1, xAdvance1, xAdvance2) by class1 * 3 + class2
    for (const [xp, xa, xa2] of recs) { w.i16(xp); w.i16(xa); w.i16(xa2); }
    w.at(206, "its coverage (format 2)"); w.u16(2); w.u16(1); w.u16(1); w.u16(4); w.u16(0);                   // glyphs 1..4
    w.at(216, "ClassDef1 (format 2)"); w.u16(2); w.u16(1); w.u16(3); w.u16(4); w.u16(1);                      // glyphs 3..4 are class 1
    w.at(226, "ClassDef2 (format 1)"); w.u16(1); w.u16(2); w.u16(2); w.u16(1); w.u16(2);                      // glyph 2 class 1, glyph 3 class 2
    w.at(236, "Lookup 1 (extension)"); w.u16(9); w.u16(0); w.u16(1); w.u16(8);
    w.at(244, "the ExtensionPos"); w.u16(1); w.u16(2); w.u32(8);                                            // a PairPos at +8, 32-bit
    w.at(252, "PairPos format 1 (extended)"); w.u16(1); w.u16(12); w.u16(0x0004); w.u16(0x0000); w.u16(1); w.u16(22);
    w.at(264, "its coverage (format 2)"); w.u16(2); w.u16(1); w.u16(5); w.u16(5); w.u16(0);
    w.at(274, "PairSet of glyph 5"); w.u16(1); w.u16(6); w.i16(-60);
    w.at(280, "Lookup 2 (ligature)"); w.u16(4); w.u16(0); w.u16(1); w.u16(8);
    w.at(288, "a ligature subtable nobody reads"); w.u16(1); w.u16(0); w.u16(0);
    w.at(294, "Lookup 3 (ENG's PairPos)"); w.u16(2); w.u16(0); w.u16(1); w.u16(8);
    w.at(302, "PairPos format 1 (ENG)"); w.u16(1); w.u16(12); w.u16(0x0004); w.u16(0x0000); w.u16(1); w.u16(18);
    w.at(314, "its coverage"); w.u16(1); w.u16(1); w.u16(1);
    w.at(320, "PairSet of glyph 1 (ENG)"); w.u16(1); w.u16(2); w.i16(999);
    w.at(326, "the end");
    return w.b;
}

// ---------------------------------------------------------------------------------------------------------
sec("1. THE CONSTRUCTED TABLE: every field from the specification, every expectation a restatement of it");
// ---------------------------------------------------------------------------------------------------------
{
    const g = parseGpos(buildGpos(), 0);
    const k = (l, r) => { for (const s of g.subtables) { const v = s.kern(l, r); if (v !== null) return v; } return 0; };
    ok(g.script === "DFLT" && g.langSys === "dflt", "the default script's default language is the one read", `${g.script}/${g.langSys}`);
    ok(g.lookups === 2 && g.skipped === 0 && g.subtables.length === 3 && g.subtables.map((s) => s.format).join() === "1,2,1",
        "the 'kern' feature's two lookups give three PairPos subtables in order -- format 1, format 2, and format 1 through the extension -- and the 'liga' lookup is never touched", `${g.lookups} lookups, ${g.subtables.length} subtables, formats ${g.subtables.map((s) => s.format).join("/")}`);
    ok(k(1, 2) === -80 && k(1, 3) === -40 && k(2, 3) === 40, "format 1: the pairs in the PairSets, signed", `1/2 ${k(1, 2)}, 1/3 ${k(1, 3)}, 2/3 ${k(2, 3)}`);
    ok(k(1, 2) !== 999, "*** the latn/ENG 'kern' lookup (glyph 1/2 = 999) is NOT read: the default script decides ***");
    ok(k(1, 4) === -5, "a pair the format 1 subtable covers but does not list falls through to format 2, where class 0 / class 0 is a value", `1/4 ${k(1, 4)}`);
    ok(k(3, 2) === -25 && k(4, 3) === -30, "format 2: class 1 (ClassDef format 2, a range) against classes 1 and 2 (ClassDef format 1, a list)", `3/2 ${k(3, 2)}, 4/3 ${k(4, 3)}`);
    ok(k(3, 5) === -20, "*** the value read is the FIRST glyph's xAdvance: its xPlacement (7) and the second glyph's xAdvance (1) are stepped over ***", `3/5 ${k(3, 5)}`);
    ok(k(5, 6) === -60, "*** the extension lookup: a format 1 subtable at a 32-bit offset from the ExtensionPos ***", `5/6 ${k(5, 6)}`);
    ok(k(6, 5) === 0 && k(9, 1) === 0, "a pair no subtable applies to is 0 (glyph 6 is in no coverage)", `6/5 ${k(6, 5)}`);
    const cut = parseGpos(buildGpos().subarray(0, 200), 0);
    ok(cut.subtables.length === 0 || cut.subtables.every((s) => typeof s.kern === "function"), "a truncated table costs kerning, not text: no throw", `${cut.subtables.length} subtable(s) survived`);
    const bad = parseGpos(new Uint8Array(4), 0);
    ok(bad.subtables.length === 0 && bad.lookups === 0, "  four bytes of nothing: no kerning, no throw");
}

// ---------------------------------------------------------------------------------------------------------
sec("2. THE FONT THIS TREE SHIPS (IBM Plex Serif): GPOS only, and kerned for the first time at v4485");
// ---------------------------------------------------------------------------------------------------------
const font = parseFont(new Uint8Array(fs.readFileSync(path.join(ENG, "vendor/fonts/IBMPlexSerif-Regular.ttf"))));
const g = (c) => font.glyphIndex(c.codePointAt(0)), K = (a, b) => Math.round(font.kern(g(a), g(b)) * font.unitsPerEm);
{
    ok(!font.hasKernTable && font.hasGPOS && font.hasGPOSKern && font.kerningSource === "GPOS", "*** no legacy kern table, a GPOS with pair kerning: before v4485 this font kerned by ZERO ***", font.kerningSource);
    ok(font.gposKern.script === "DFLT" && font.gposKern.langSys === "dflt" && font.gposKern.lookups === 1 && font.gposKern.subtables === 4 && font.gposKern.skipped === 0,
        "read through DFLT/dflt: one kern lookup, four PairPos subtables, nothing skipped", JSON.stringify(font.gposKern));
    ok(K("A", "V") < -20 && K("A", "V") > -120 && K("A", "V") === K("V", "A"), "A/V is a real negative pair (between -20 and -120 units) and symmetric", `A/V ${K("A", "V")}, V/A ${K("V", "A")}`);
    ok(K("T", "o") < 0 && K("L", "T") < 0 && K("A", "T") < 0 && K("r", ".") < 0, "T/o, L/T, A/T and r/. tuck in", `${K("T", "o")}, ${K("L", "T")}, ${K("A", "T")}, ${K("r", ".")}`);
    ok(K("n", "n") === 0 && K("1", "1") === 0, "n/n and 1/1 are zero: no invented kerning", `${K("n", "n")}, ${K("1", "1")}`);
    ok(K("f", ")") > 0, "f/) is POSITIVE: a serif f opens before a paren, and the sign is the font's, not the reader's", `${K("f", ")")}`);
    const S = " abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,;:%()-'";
    let n = 0, neg = 0, pos = 0; for (const a of S) for (const b of S) { const v = K(a, b); if (v !== 0) { n++; if (v < 0) neg++; else pos++; } }
    ok(n > 800 && n < 1600 && neg > pos, `over the ${S.length}-character label alphabet ${n} pairs kern, ${neg} closing and ${pos} opening`, "v4485 measured 1,112: 800 / 312");
    report("pairs", `AV ${K("A", "V")}  To ${K("T", "o")}  Ty ${K("T", "y")}  LT ${K("L", "T")}  Wa ${K("W", "a")}  f) ${K("f", ")")}  r. ${K("r", ".")}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE LAYOUT: kerned by GPOS, reported as GPOS; the synthetic font still kerns by its legacy table");
// ---------------------------------------------------------------------------------------------------------
{
    const av = layoutText(font, "AV", { size: 1 }), a = layoutText(font, "A"), v = layoutText(font, "V");
    ok(av.kerningSource === "GPOS" && Math.abs((av.width - (a.width + v.width)) * font.unitsPerEm - K("A", "V")) < 1e-6,
        "'AV' is the two advances plus the GPOS pair, and the layout says GPOS", `${(av.width * font.unitsPerEm).toFixed(1)} = ${(a.width * font.unitsPerEm).toFixed(1)} + ${(v.width * font.unitsPerEm).toFixed(1)} ${K("A", "V")}`);
    const TEXT = "Sphinx 42% AV", SIZE = 28;
    const kerned = layoutText(font, TEXT, { size: SIZE }), loose = layoutText(font, TEXT, { size: SIZE, kerning: false });
    ok(kerned.width < loose.width && loose.width - kerned.width > 1 && loose.width - kerned.width < 4, `*** "${TEXT}" at ${SIZE} px is narrower kerned than unkerned by between one and four pixels (1.54 measured) -- the width every label in this tree changed by at v4485 ***`, `${kerned.width.toFixed(2)} against ${loose.width.toFixed(2)} px (${(loose.width - kerned.width).toFixed(2)} px)`);
    const tf = parseFont(testFontBytes());
    const ab = layoutText(tf, "AB"), a2 = layoutText(tf, "A"), b2 = layoutText(tf, "B");
    ok(!tf.hasGPOS && tf.hasKernTable && !tf.hasGPOSKern && ab.kerningSource === "kern" && Math.round((ab.width - a2.width - b2.width) * tf.unitsPerEm) === -80,
        "the constructed test font (a legacy kern table, no GPOS) still kerns A/B by -80 and says kern: the fallback is the old path, untouched", ab.kerningSource);
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: a font whose kerning is CONTEXTUAL (GPOS types 7/8), which this reader counts in gposKern.skipped and does not follow; a language other than the default; kerning in the vertical direction; device tables; and every face the plan names (Inter, Fira, Source Sans 3...), none of which is vendored yet -- task 6's job, now that vendoring them no longer means zero kerning.");
process.exit(fails ? 1 : 0);
