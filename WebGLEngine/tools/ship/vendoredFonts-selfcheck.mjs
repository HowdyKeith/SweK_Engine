#!/usr/bin/env node
// WebGLEngine/tools/ship/vendoredFonts-selfcheck.mjs -- v4486
//
// THE FONTS UNDER vendor/fonts, HELD TO text/fontRegistry.mjs IN BOTH DIRECTIONS AND TO WHAT THE PARSER CAN DRAW (docs/TSL-ROADMAP.md
// step 7 item 6, task 6). Every .ttf/.otf/.ttc on disk must be registered and every registered file must be on disk; every
// file must parse with text/slugFont.js (glyf outlines) and be STATIC (no fvar: the parser reads no variation tables and would
// draw the default master under the family's name); its digest, glyph count, unitsPerEm, kerning source and one measured pair
// must be what the registry recorded; and a licence file must sit beside it, identify as the SIL OFL 1.1 by world/
// licenceBodies.mjs's own identifier, and carry the Reserved Font Name the registry says it declares.
//
// WHY A SEPARATE REGISTRY: world/vendoredLicences.mjs papers vendor/ one directory per entry and its gate reads the top level
// of vendor/ only, so vendor/fonts stays one entry under the Plex grant there; the per-family grants and the per-family facts
// live in text/fontRegistry.mjs, which is the list a page or a packer will read to offer a face.
//
// MEASURED AT v4486: four families, all OFL-1.1, all glyf, all static; Plex kerns A/V -50, Cinzel -105, Source Sans 3 -14,
// JetBrains Mono 0 (a monospaced GPOS with no pair kerning, reported as such). Inter and Orbitron are NOT here: only their
// variable builds reach this box, and section 3 shows the refusal on the real Orbitron[wght].ttf when it is present in the
// scratch directory the sabotage uses (reported, not required: a gate must not need a file outside the tree).
//
// SABOTAGE (v4486): A  a .ttf on disk that the registry does not list (a copy of Cinzel beside itself)       -> exit=1, red: the disk-vs-registry row
//                   B  a registry digest one hex digit off                                                   -> exit=1, red: that family's digest row
//                   C  a family's licence file removed                                                       -> exit=1, red: the licence rows for that family
//                   D  a VARIABLE font (Orbitron[wght].ttf) placed under vendor/fonts/orbitron with a registry entry  -> exit=1, red: the static row (fvar), by name
//
// Run: node tools/ship/vendoredFonts-selfcheck.mjs      (~0.5 s, headless)
"use strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseFont, readTableDirectory } from "../../text/slugFont.js";
import { layoutText } from "../../text/slugText.js";
import { FONTS, FONT_DIR, fontPath, licencePath } from "../../text/fontRegistry.mjs";
import { identify } from "../../world/licenceBodies.mjs";
import { isLicenceFile } from "../../world/orrery.mjs";
import { VENDORED } from "../../world/vendoredLicences.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const report = (name, detail) => console.log(`  ----  ${name}   ${detail}`);
const sec = (t) => console.log("\n" + t);
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

// ---------------------------------------------------------------------------------------------------------
sec("1. DISK AND REGISTRY AGREE IN BOTH DIRECTIONS");
// ---------------------------------------------------------------------------------------------------------
const onDisk = [];
const walk = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name), r = rel ? rel + "/" + e.name : e.name; if (e.isDirectory()) walk(p, r); else if (/\.(ttf|otf|ttc|woff2?)$/i.test(e.name)) onDisk.push(r); } };
walk(path.join(ENG, FONT_DIR), "");
onDisk.sort();
const registered = FONTS.map((f) => (f.dir ? f.dir + "/" : "") + f.file).sort();
const unregistered = onDisk.filter((p) => !registered.includes(p)), absent = registered.filter((p) => !onDisk.includes(p));
ok(unregistered.length === 0 && absent.length === 0, `*** every font file on disk is registered and every registered one is on disk (${onDisk.length} files, ${FONTS.length} families) ***`,
    (unregistered.length ? "unregistered: " + unregistered.join(", ") : "") + (absent.length ? " absent: " + absent.join(", ") : "") || registered.join(", "));
ok(new Set(FONTS.map((f) => f.family)).size === FONTS.length && new Set(FONTS.map((f) => f.dir)).size === FONTS.length, "families and directories are unique");
ok(FONTS.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && /^\d{4}-\d{2}-\d{2}$/.test(f.fetched) && /^https?:\/\//.test(f.source) && f.licence && f.expect && Array.isArray(f.expect.pair)),
    "every entry carries a digest, a fetch date, a source URL, a licence file and an expectation");

// ---------------------------------------------------------------------------------------------------------
sec("2. EVERY FAMILY: parses as glyf, is static, has the bytes and the facts the registry recorded, and its licence is the OFL by the tree's own identifier");
// ---------------------------------------------------------------------------------------------------------
for (const f of FONTS) {
    const p = path.join(ENG, fontPath(f)), lp = path.join(ENG, licencePath(f));
    if (!fs.existsSync(p)) { ok(false, `${f.family}: the file is on disk`, fontPath(f)); continue; }
    const bytes = new Uint8Array(fs.readFileSync(p));
    ok(sha(p) === f.sha256, `${f.family}: the bytes are the bytes fetched on ${f.fetched}`, sha(p).slice(0, 16));
    let tables = null, font = null, err = null;
    try { tables = readTableDirectory(bytes).tables; font = parseFont(bytes); } catch (e) { err = e.message; }
    ok(!!font && !!tables.glyf && !tables["CFF "], `${f.family}: slugFont parses it, and its outlines are glyf (not CFF)`, err || Object.keys(tables).length + " tables");
    if (!font) continue;
    ok(!tables.fvar && !tables.gvar, `${f.family}: STATIC -- no fvar or gvar (a variable font would be drawn at its default master under the family's name)`, tables.fvar ? "fvar present: refused" : "static");
    const g = (c) => font.glyphIndex(c.codePointAt(0)), [a, b, v] = f.expect.pair;
    const pair = Math.round(font.kern(g(a), g(b)) * font.unitsPerEm);
    ok(font.unitsPerEm === f.expect.unitsPerEm && (f.expect.glyphs === null || font.numGlyphs === f.expect.glyphs) && font.kerningSource === f.expect.kerning && pair === v,
        `${f.family}: ${font.numGlyphs} glyphs at ${font.unitsPerEm}/em, kerning ${font.kerningSource}, ${a}/${b} ${pair} -- as recorded`, `${f.expect.glyphs ?? "any"} / ${f.expect.unitsPerEm} / ${f.expect.kerning} / ${v}`);
    const laid = layoutText(font, "Sphinx", { size: 1 });
    ok(laid.glyphs.length === 6 && laid.width > 2 && laid.width < 5 && laid.glyphs.every((q) => q.glyphIndex > 0), `${f.family}: lays out "Sphinx" with every glyph present`, `${laid.width.toFixed(3)} em`);
    ok(fs.existsSync(lp) && isLicenceFile(path.basename(lp)), `${f.family}: a licence file sits beside it and the orrery's licence matcher recognises its name`, licencePath(f));
    if (fs.existsSync(lp)) {
        const text = fs.readFileSync(lp, "utf8");
        ok(identify(text) === "OFL-1.1", `${f.family}: the licence identifies as OFL-1.1 by world/licenceBodies.mjs`, identify(text));
        ok(f.rfn === null ? !/Reserved Font Name/i.test(text.split("\n").slice(0, 6).join("\n")) : text.includes(f.rfn), f.rfn === null ? `${f.family}: declares no Reserved Font Name in its copyright lines (JetBrains Mono's OFL reserves none)` : `${f.family}: the licence carries its Reserved Font Name "${f.rfn}", which nothing here may rename`);
    }
}

// ---------------------------------------------------------------------------------------------------------
sec("3. THE REFUSALS, ON REAL FILES WHERE THEY EXIST");
// ---------------------------------------------------------------------------------------------------------
{
    const fontsEntry = VENDORED.find((e) => e.path === FONT_DIR);
    ok(!!fontsEntry && fontsEntry.spdx === "OFL-1.1" && fs.existsSync(path.join(ENG, FONT_DIR, fontsEntry.file)), "world/vendoredLicences.mjs still papers vendor/fonts as one OFL-1.1 entry whose grant file is on disk", fontsEntry && fontsEntry.file);
    const vf = "/tmp/claude-0/-home-user-SweK-Engine/20ceec47-a32d-5834-9f99-0e71110119f7/scratchpad/fonts/Orbitron[wght].ttf";
    if (fs.existsSync(vf)) {
        const t = readTableDirectory(new Uint8Array(fs.readFileSync(vf))).tables;
        ok(!!t.fvar && !!t.gvar && !!t.glyf, "REPORTED: the real Orbitron[wght].ttf (google/fonts) is glyf AND variable -- the parser would read it, and section 2's static row is what refuses it", "fvar + gvar present");
    } else report("Orbitron[wght].ttf", "not in the scratch directory on this box; the static refusal is exercised by sabotage D");
    const cffLike = new Uint8Array([0x4F, 0x54, 0x54, 0x4F, 0, 0, 0, 0, 0, 0, 0, 0]);
    let refused = null; try { parseFont(cffLike); } catch (e) { refused = e.message; }
    ok(/CFF|glyf|missing required table/.test(refused || ""), "an OTTO (CFF) header is refused by the parser by name", refused);
}

console.log(fails ? `\nFAIL -- ${fails} check(s)` : "\nall checks pass");
console.log("unchecked here: the fonts' pictures (the atlas packer and the Slug gates draw Plex; the three new faces are parsed and laid out, not rasterised -- task 7's packer and task 9's rig page draw them); the licences' bodies against upstream (tools/ship/verifyLicenceTexts.mjs is the network tool for that); and whether a face LOOKS right at small sizes, which no table can measure.");
process.exit(fails ? 1 : 0);
