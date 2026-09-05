// WebGLEngine/text/fontRegistry.mjs -- v4486
//
// *** EVERY FONT UNDER vendor/fonts, AS DATA: where it came from, what it is licensed under, what the parser reads out
// of it, and the bytes it had when it was fetched. *** tools/ship/vendoredFonts-selfcheck.mjs holds disk and this list
// to each other in both directions, parses every file with text/slugFont.js, and refuses what slugFont cannot draw:
// a CFF outline (OTTO), a collection (ttcf), a VARIABLE font (an fvar table -- slugFont reads no fvar or gvar, so it
// would draw the default master and call it the family), and a family with no licence file beside it.
//
// THE LICENCE. Every family here is under the SIL Open Font License 1.1: the licence text ships beside the font under
// the font's own name (<Family>-OFL.txt, the convention IBMPlexSerif-OFL.txt set at v3823, which world/orrery.mjs's
// isLicenceFile recognises), and the Reserved Font Name it declares is recorded here so that nothing in this tree
// renames the family -- the one thing the OFL forbids. world/vendoredLicences.mjs papers vendor/fonts as one directory
// under the Plex grant; the per-family grants live here, where the per-family facts are.
//
// WHAT WAS NOT VENDORED, AND WHY (v4486): Inter and Orbitron -- the plan's minimal and sci-fi faces -- reach this box
// only as VARIABLE builds (google/fonts ships Inter[opsz,wght].ttf and Orbitron[wght].ttf; the static instances live in
// release archives on a host the proxy refuses), and a variable font is refused by name here. Source Sans 3 stands in
// for the minimal sans. JetBrains Mono has a GPOS and NO pair kerning under its default script, which is what a
// monospaced face should have; the layout says so ("none (a GPOS with no pair kerning...)") rather than guessing.
//
// `sha256` is of the .ttf as fetched; `source` is the URL it was fetched from on `fetched`; `expect` is what slugFont
// read on that day and must still read (glyph count, unitsPerEm, kerningSource, one measured pair).
"use strict";

export const FONT_DIR = "vendor/fonts";

/**
 * v4487 -- THE ALPHABETS A PACK IS BAKED FOR. `label` is ev/esShipLabels.js LABEL_CHARS, spelled here so the packer and
 * the registry need no import from ev/ -- and tools/ship/fontPacks-selfcheck.mjs holds the two spellings equal, so they
 * cannot drift apart without a red.
 */
export const CHAR_SETS = Object.freeze({
    label: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 %#.-",
});
/** The pack file a family's alphabet bakes to, beside the font: <Name>.<set>.slug.bin. */
export const packFile = (f, set) => f.file.replace(/\.ttf$/i, "") + "." + set + ".slug.bin";
export const packPath = (f, set) => (f.dir ? `${FONT_DIR}/${f.dir}/${packFile(f, set)}` : `${FONT_DIR}/${packFile(f, set)}`);

export const FONTS = Object.freeze([
    Object.freeze({
        family: "IBM Plex Serif", dir: "", file: "IBMPlexSerif-Regular.ttf", licence: "IBMPlexSerif-OFL.txt", rfn: "Plex",
        source: "https://github.com/IBM/plex (v3823)", fetched: "2026-08-25",
        sha256: "77cd233a2af8dc6b1022faea3bb3b01f3c75af68bcf530cb6aeb15982ff3dbb7",
        expect: Object.freeze({ glyphs: null, unitsPerEm: 1000, kerning: "GPOS", pair: ["A", "V", -50] }),
        role: "the label face this tree has drawn since v3823 (ev/esShipLabels.js, orrery-gpu.html, slug-device.html)",
        packs: Object.freeze([Object.freeze({ set: "label", sha256: "b81815c672602a2072bf759d7d2d1560e98991412e2d92a6540b35f24962c390" })]),
    }),
    Object.freeze({
        family: "Cinzel", dir: "cinzel", file: "Cinzel-Regular.ttf", licence: "Cinzel-OFL.txt", rfn: "Cinzel Decorative",
        source: "https://raw.githubusercontent.com/NDISCOVER/Cinzel/master/fonts/ttf/Cinzel-Regular.ttf", fetched: "2026-09-05",
        sha256: "af0031129f27dc752e8629a80b793d27abea94027faa27cc660c3fc33f607a1f",
        expect: Object.freeze({ glyphs: 548, unitsPerEm: 1000, kerning: "GPOS", pair: ["A", "V", -105] }),
        role: "the fantasy face: Roman capitals, static Regular instance",
        packs: Object.freeze([Object.freeze({ set: "label", sha256: "f6c34d9fc51035ecfe362585b6a4edf170bc89cfcff7f9f31008e5f38a29ff8d" })]),
    }),
    Object.freeze({
        family: "JetBrains Mono", dir: "jetbrains-mono", file: "JetBrainsMono-Regular.ttf", licence: "JetBrainsMono-OFL.txt", rfn: null,
        source: "https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/fonts/ttf/JetBrainsMono-Regular.ttf", fetched: "2026-09-05",
        sha256: "e6fd0d7e91550b3ed2b735d4312474362c4716edc4fc0577a0f61ed782d5aed1",
        expect: Object.freeze({ glyphs: 1754, unitsPerEm: 1000, kerning: "none (a GPOS with no pair kerning under the default script)", pair: ["A", "V", 0] }),
        role: "the telemetry face: monospaced, so no pair kerns, and the layout must say none rather than GPOS",
        packs: Object.freeze([Object.freeze({ set: "label", sha256: "095186cc3f112593b75ad5e0577e8a19ce866d2836b5893d971b0b3bea090797" })]),
    }),
    Object.freeze({
        family: "Source Sans 3", dir: "source-sans-3", file: "SourceSans3-Regular.ttf", licence: "SourceSans3-OFL.txt", rfn: "Source",
        source: "https://raw.githubusercontent.com/adobe-fonts/source-sans/release/TTF/SourceSans3-Regular.ttf", fetched: "2026-09-05",
        sha256: "4644c81b86ec9caaa76b634889968ed3c4f4f52f054855933acc7c2b21e53b0f",
        expect: Object.freeze({ glyphs: 2478, unitsPerEm: 1000, kerning: "GPOS", pair: ["A", "V", -14] }),
        role: "the minimal sans, standing in for Inter (variable-only on every host this box can reach); the TTF build, not the CFF one",
        packs: Object.freeze([Object.freeze({ set: "label", sha256: "8d25bea2f6cec9deab3daaa28bc56a1dcc047af08efbc8b19bb6b881d2fbb475" })]),
    }),
]);

/** The path of a family's font file and licence file, relative to WebGLEngine. */
export const fontPath = (f) => (f.dir ? `${FONT_DIR}/${f.dir}/${f.file}` : `${FONT_DIR}/${f.file}`);
export const licencePath = (f) => (f.dir ? `${FONT_DIR}/${f.dir}/${f.licence}` : `${FONT_DIR}/${f.licence}`);
export const byFamily = (name) => FONTS.find((f) => f.family === name) || null;
